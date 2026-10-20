/* ============================================================
   MedRevise — Partie B (v3) : lecteur PDF continu et virtualisé,
   surlignage sécurisé + recherche géométriquement exacte (Range API),
   édition de texte existant via couche superposée (TipTap).

   Architecture de rendu : toutes les pages sont "positionnées" (empilées
   verticalement, offsets cumulés précalculés depuis la taille réelle de
   chaque page), mais seules celles proches du viewport (visibleRange)
   montent réellement un <canvas> + une couche de texte — les autres ne
   sont que des placeholders vides de la bonne taille (virtualisation).

   Le zoom (Ctrl/Cmd + molette, ou boutons) reste centré sur le point
   visé : comme les gaps entre pages scalent aussi avec `scale`, tout le
   contenu grandit de façon strictement linéaire, ce qui rend le calcul
   du nouveau scrollTop trivial (voir zoomAt).

   La couche de texte (buildTextLayer) est "maison" : positionnement via
   item.transform × viewport.transform (pdfjsLib.Util.transform),
   indépendant de la classe TextLayer interne de pdfjs-dist (dont le
   contrat CSS varie trop entre versions). Une seconde fonction pure,
   computePageTextMap, réutilise le même calcul en coordonnées normalisées
   [0,1] (scale=1) pour trouver les occurrences de recherche à travers
   TOUTES les pages sans devoir les monter dans le DOM, et approximer la
   position à laquelle défiler. La géométrie VISUELLE du surlignage de
   recherche, elle, est calculée séparément via l'API Range du DOM sur la
   page réellement montée (voir computeMatchRectsFromDom) — fiable même
   pour du texte justifié/en tableau, contrairement à une interpolation
   par fraction de caractères.

   Surlignage ET édition de texte partagent la MÊME unité d'action : une
   sélection réelle de l'utilisateur (jamais un span pdf.js entier, qui
   correspond souvent à toute une ligne). La géométrie vient toujours de
   `range.getClientRects()` sur la sélection DOM — un clic seul (sélection
   vide) ne déclenche donc jamais rien. Après la sélection, une popover
   propose de surligner (4 couleurs) OU d'éditer ce texte précis ; la
   boîte d'édition est l'union des rects de la sélection, pas un span.

   OUTILS D'ANNOTATION — actifs PARTOUT depuis l'étape 7 (Réviser, Bibliothèque,
   Apprentissage, Import Anatomie, Prise de notes ouvrent le MÊME lecteur avec
   les MÊMES outils) :
   - un seul axe, l'OUTIL ACTIF : Sélection · Surligneur · Boîte · Crayon ·
     Gomme (voir pdf/PdfToolbar.jsx). Il remplace l'ancien couple
     « Lecture / Édition », qui ne commandait qu'une chose ;
   - la BOÎTE DE TEXTE LIBRE (kind:'libre') et le TRAIT AU CRAYON
     (kind:'trait') dans le store `annotations` — voir NoteBox et ses QUATRE
     VERROUS, qui garantissent qu'un geste d'annotation ne déclenche jamais ni
     sélection ni surlignage ;
   - Annuler / Rétablir (lib/annotHistory.js) sur toutes les annotations.
   ============================================================ */
import { separerParType } from '../lib/annotationTypes.js';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { pdfjsLib, openPdf } from './pdfjsSetup.js';
import { exporterDepuisBlob } from './exportAnnote.js';
import { useEditor } from '@tiptap/react';
import { Icon } from '../../shared/Icon.jsx';
import { isClassicUI } from '../../shared/uiMode.js';
import { EdTop, detectDocKind, Modal, LoaderL6, ConfirmModal } from '../components/ui.jsx';
import { putBackup, getBlob, putBlob, getAll, put, remove, genId, getMeta, setMeta, newHighlight, newTextEdit, newNoteBox, newTrait, newTexteLibre, newQuestionMarque, newPageAjoutee, newImageCollee, newForme } from '../lib/storage.js';
import { useJournalAnnuler, raccourciAnnuler } from '../lib/journalAnnuler.js';
import { texteOcr } from '../ocr/ocrImage.js';
import { useAnnotHistorique, cmdCreer, cmdSupprimer, cmdModifier, cmdGroupe, cibleEditable } from '../lib/annotHistory.js';
import { imageDuPressePapier } from '../lib/collerImage.js';
import { planMots } from '../lib/resurlignage.js';
import { RICH_EXTENSIONS } from '../documents/lib/richtext.js';
import { AddItemModal, PasteJsonForm } from '../components/AddItemForm.jsx';
import { AllPromptsModal } from '../components/CoursePromptsMenu.jsx';
import { buildCourseExportFromParts } from '../lib/courseExport.js';
import { pdfCourseParts } from '../lib/pdfCourseText.js';
import {
  COLORS, COLOR_HEX, COLOR_TAG, COLOR_RGB, GAP, EMPTY_ARRAY, RACCOURCI, opaciteSurlignage, COMPACT, fractionPx100,
  useDevicePixelRatio, compareHighlights, computePageTextMap, EPAISSEURS,
  MODES_CRAYON, EPAISSEUR_SURLIGNEUR, OPACITE_SURLIGNEUR, couleurHex, BOITE_DEFAUT, lireFondBoiteDefaut,
} from './pdfShared.js';
import { PdfPageContent, EditToolbar, ECHELLE_REF } from './PdfPage.jsx';
import { PdfToolbar } from './PdfToolbar.jsx';
import { SelecteurCouleurs, ReglagesTrait, dansSelecteurFlottant } from './Couleurs.jsx';
import { patchAjouter } from './connecteurs.js';
import { IconeOutil, IconeForme } from './IconesOutils.jsx';
import { TYPES_FORMES, estTrait, estFermee, ancreSurForme } from './formes.js';
import { publierFicheActive, useSondage, dessinsDeFiche, retirerDessin } from '../lib/dessins.js';
import { suivreImage } from './attaches.js';
import { htmlVersTiptap } from './htmlVersTiptap.js';
import { MenuDessins, ArriveeDessin, TYPE_GLISSER } from './OngletDessins.jsx';
import { CourseHtmlView } from './CourseHtmlView.jsx';
import { CourseItemsSidebar } from '../components/CourseItemsSidebar.jsx';
import { FeuilleDemarrage, TranscriptPanel, BadgeTranscript, ResumeReplie, BadgePageTranscript } from '../transcription/TranscriptPanel.jsx';
import { lirePosition, ecrirePosition, empreintePdf, positionDepuisDefilement } from '../lib/positionLecture.js';
import { NotesEditor } from '../documents/NotesEditor.jsx';
import { estNotionDoc, creerNotionDoc, synchroniserNotionsDoc } from '../documents/lib/notionsDoc.js';
import { lireNotesDoc, ecrirePageDoc, majNotesDoc, attendreNotesDoc, contenuGlobal, docNonVide, idAppareil, fluxDepuisPages } from '../documents/lib/notesDoc.js';
import { DocumentFlux } from './DocumentFlux.jsx';
import { insererImageBloc, limiteSous } from '../documents/lib/imageVue.js';
import { dehydrateDoc, EMPTY_DOC, docToMarkdown } from '../documents/lib/richtext.js';
import { exporterMarkdownDoc, nomFichier, telecharger as telechargerFichier } from '../documents/lib/exportDoc.js';
import { PageTexte, PAGE_A4, OutilsTexteDocument, effacerSurlignageRecherche } from './PageTexte.jsx';
import { useTablette, abonnerStylet, styletActif, dessinAuDoigt, pressionActive, ecrireDessinAuDoigt, ecrirePressionActive, abonnerReglagesStylet, lireFractionVolet, ecrireFractionVolet, bornerVolet, VOLET_MIN, VOLET_MAX, VOLET_PLEIN } from '../lib/tablette.js';
import '../../styles/tablette.css';
import '../../styles/notes-doc.css';
import '../../styles/pdfreader-v2.css';
import '../../styles/fiche-jumelle.css';
import { PanneauMiseEnPage, ReglesMarges } from './MiseEnPage.jsx';
import { margesDe, margesUnites } from '../documents/lib/marges.js';
import { enregistrerLecteur } from '../transcription/IndicateurGlobal.jsx';
import { sessionActive as transcriptionActive, lireEtat as etatTranscription, definirPageCourante } from '../transcription/engine.js';
import { noterCoursOuvert } from '../lib/derniersCours.js';
import { actualiserCredits } from '../transcription/credits.js';
import { useCoucheOcr, useEtatOcr } from '../ocr/useOcr.js';
import { relancer as relancerOcr } from '../ocr/service.js';
import { statsCouche } from '../ocr/couches.js';
import { TitreRenommable } from '../components/TitreRenommable.jsx';
import { MenuFichier } from './MenuFichier.jsx';
import { FichiersCours } from './FichiersCours.jsx';
import { SuppressionDocument } from './SuppressionDocument.jsx';
import { verifierFichiers, avecVerrou, importerPrincipal, principalDe } from '../lib/fichiersCours.js';
import { PanneauTextesAnnotations } from './TextesAnnotations.jsx';
import { PanneauExportIA } from './ExportIA.jsx';
import { preparerSourceIA, pngsIA } from './exportIA.js';
import { creerZip } from '../lib/zipSimple.js';
import { refsCourtes, construireExportIA, estBoiteTexte, aDeuxVersions, versionAffichee, boitesOrdonnees, construireExport, lireImport, planImport, resumeImport, basculerVersion, avecContenuEdite } from '../lib/textesAnnotations.js';
import { Tableau } from '../tableau/Tableau.jsx';
import { useFicheJumelle, lireVue, ecrireVue, pageCorrespondante, importerJumelle, remplacerJumelle, blocsDuFlux, pagesDocument, pageMapDocument } from '../lib/ficheJumelle.js';
import { EditeurCorrespondance, ListeNonReplacees } from './Correspondance.jsx';
// un événement clavier/collage venu du tableau : c'est au tableau d'y répondre
const dansLeTableau = (el) => !!(el && el.closest && el.closest('.tb'));


/* C — bi-mode : route plein-écran (déclenchée par Réviser, via ctx.pdfView /
   ctx.closePdfReader) OU panneau EMBARQUÉ dans l'écran Bibliothèque fusionné
   (ficheId/mode passés en props directes, onClose local — pas de navigation
   d'écran). `embedded` masque le wrapper .screen + le .topbar interne (le
   parent affiche déjà SON topbar unique). */
// `doc`/`onSetPdf`/`onSetHtml` : chemin GÉNÉRIQUE pour afficher/attacher un PDF+HTML
// sur un enregistrement qui n'est PAS une fiche `db.fiches` (ex : une structure
// anatomique de l'écran Anatomie Théorie). Sans ces props, comportement inchangé
// (fiche résolue via ficheId + ctx.db.fiches, mutée via ctx.setFichePdf/setFicheHtml).
// `ajusterLargeur` / `panneauNotionsOuvert` (mode Apprentissage, écran splitté) : options
// FACULTATIVES — absentes, le lecteur se comporte exactement comme avant (160 %, panneau
// ouvert). `ajusterLargeur` cale le zoom sur la largeur du panneau, et le recale quand
// ce panneau change de largeur (poignée) tant que l'utilisateur n'a pas zoomé lui-même.
/* UNE SEULE FORME D'APPEL (étape 7). `ficheId` servait tantôt de clé étrangère,
   tantôt de simple espace de noms pour les annotations, et `doc` court-circuitait
   le tout : trois façons d'ouvrir le même lecteur, une par écran.

     source = { id, titre, pdfId, pdfName, htmlId, htmlName, ficheId? }
       id      → clé d'espace de noms des annotations (toujours présente)
       ficheId → présent SEULEMENT si c'est une vraie fiche de `db.fiches` ;
                 c'est lui, et lui seul, qui débloque les actions « fiche »
                 (ajouter/importer des items, prompts, export JSON).

   Les anciennes props (`ficheId`, `doc`, `initialSrcTab`) restent acceptées : le
   mode plein écran passe encore par ctx.pdfView, et les rétirer d'un coup aurait
   été le seul changement risqué de cette étape. */
export function PdfReader({ ctx, source, ficheId: ficheIdProp, initialSrcTab: srcTabProp, doc: docProp, onSetPdf, onSetHtml, embedded, onClose, ajusterLargeur = false, panneauNotionsOuvert = true, avecEntete = false, ouvrirFichiers = false }) {
  const { pdfView, db } = ctx;
  const ficheId = (source && source.id) ?? ficheIdProp ?? (pdfView && pdfView.ficheId);
  const initialSrcTab = srcTabProp ?? (pdfView && pdfView.srcTab);
  const close = onClose || ctx.closePdfReader;
  // la vraie fiche, s'il y en a une : par `source.ficheId`, ou par l'ancien chemin
  const idFiche = source ? source.ficheId : (docProp ? null : ficheId);
  const ficheReelle = idFiche ? db.fiches.find((f) => f.id === idFiche) : null;
  const fiche = ficheReelle || source || docProp;
  /* DOCUMENT (08/10, docs/compte-rendu-nettoyage-document.md) : un cours sans PDF s'ouvre
     ICI, comme un PDF — des pages A4 blanches (pages ajoutées, kind 'page') sur lesquelles on
     écrit (pdf/PageTexte.jsx) et on annote avec tous les outils. */
  // le cours EST un document de l'app (pas de PDF) ; `modeDoc` = on l'affiche (pas sa fiche jumelle)
  const modeDocCours = !!(fiche && fiche.docNotes && !fiche.pdfId && !fiche.htmlId);
  /* FICHE JUMELLE (15/10, lib/ficheJumelle.js, docs/compte-rendu-fiche-jumelle.md) : un second PDF
     (la « fiche » résumée) rattaché au cours. On bascule Original ⇄ Fiche dans CE lecteur : le PDF
     affiché, le calque d'annotations (`nsAnnot`) et la position de lecture suivent le document ;
     outil, zoom, panneau, notions, flashcards et transcript (rattachés au COURS) restent. Sans
     fiche importée, `surFiche` est toujours faux : rien ne change.
     (15/10 soir) aussi sur un cours DOCUMENT (créé dans l'app) : côté « Original » l'éditeur paginé,
     côté « Fiche » le lecteur PDF ; `modeDoc` n'est vrai que quand le document est affiché. */
  const jumelle = useFicheJumelle(ficheReelle && (fiche.pdfId || modeDocCours) ? ficheReelle.id : null);
  const [vueJumelle, setVueJumelle] = useState(() => lireVue(idFiche));
  useEffect(() => { setVueJumelle(lireVue(idFiche)); }, [idFiche]);
  const surFiche = !!(jumelle && vueJumelle === 'fiche');
  const nsAnnot = surFiche ? jumelle.nsAnnot : ficheId; // espace de noms des annotations affichées
  const pdfIdActif = surFiche ? jumelle.fileId : (fiche && fiche.pdfId);
  const modeDoc = modeDocCours && !surFiche;
  /* LIAISON AVEC LE TÉLÉPHONE (02/10, docs/mecanique-dessin-mobile.md) : l'ordi publie
     la fiche qu'il ouvre — le téléphone la propose par défaut pour y envoyer un dessin.
     Une écriture à l'ouverture, une à la fermeture (rien à chaque page). */
  const titreFiche = (fiche && (fiche.titre || fiche.nom || fiche.pdfName)) || null;
  useEffect(() => {
    if (!ficheId) return undefined;
    publierFicheActive({ ficheId, titre: titreFiche, ouverte: true });
    return () => { publierFicheActive({ ficheId, titre: titreFiche, ouverte: false }); };
  }, [ficheId, titreFiche]);
  // Actions propres à une fiche (items, prompts, export JSON) : elles n'ont aucun
  // sens pour un document de notes ou une structure d'anatomie.
  const canAddItem = !!ficheReelle;
  const [showAddItem, setShowAddItem] = useState(false);
  // "Importer des items" (atelier "Voir le cours", branche HTML) : coller le JSON
  // produit par un des 4 prompts de complétion ("Voir les prompts") — réutilise
  // PasteJsonForm/appendItemsToFiche tel quel (même parseur v1.1, même
  // dédoublonnage), rien de nouveau. Remplace "Attacher un document", qui ne
  // servait à rien une fois le cours déjà attaché.
  const [showImportItems, setShowImportItems] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  // atelier "Voir le cours" (branche HTML) : fenêtre étroite → bascule CSS-only
  // cours/items (voir @media dans etudes.css), ignorée sur fenêtre large où les
  // deux colonnes s'affichent toujours ensemble.
  const [mobileView, setMobileView] = useState('course');

  /* MODE TABLETTE (761 à 1 199 px) : le PDF en haut, le panneau en volet qui monte depuis
     le bas (08/10, portrait comme paysage). Desktop (≥ 1 200 px) et shell mobile : rien ne change. */
  const { tablette } = useTablette();
  const [stylet, setStylet] = useState(styletActif);
  /* RÉGLAGES DU STYLET (20/10, lib/tablette.js) : « Dessiner au doigt » (non par défaut) et « Pression »
     (oui par défaut), dans la rangée du crayon sur un écran tactile */
  const [reglagesStylet, setReglagesStylet] = useState(() => ({ doigt: dessinAuDoigt(), pression: pressionActive() }));
  useEffect(() => abonnerReglagesStylet(() => setReglagesStylet({ doigt: dessinAuDoigt(), pression: pressionActive() })), []);
  const ecranTactile = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(any-pointer: coarse)').matches;
  useEffect(() => abonnerStylet(() => setStylet(true)), []);
  // v3 tablette (08/10) : volet qui monte depuis le BAS — hauteur mémorisée, plein écran par geste
  const [fractionVolet, setFractionVolet] = useState(lireFractionVolet);
  const [voletPlein, setVoletPlein] = useState(false);
  const [depuisRepli, setDepuisRepli] = useState(0);

  // source affichée quand la fiche porte À LA FOIS un PDF et une fiche HTML —
  // indépendant du mode Lecture/Édition (qui ne s'applique qu'au PDF).
  const [srcTab, setSrcTab] = useState(() => initialSrcTab || (fiche && (fiche.pdfId || modeDocCours) ? 'pdf' : 'html'));
  useEffect(() => { setSrcTab(initialSrcTab || (fiche && (fiche.pdfId || modeDocCours) ? 'pdf' : 'html')); }, [ficheId]); // eslint-disable-line react-hooks/exhaustive-deps
  // tablette : seulement là où le lecteur a son en-tête (Bibliothèque, plein écran) —
  // Apprentissage et Anatomie gardent leur propre disposition
  const modeTab = tablette && (!embedded || avecEntete) && srcTab === 'pdf';


  const [pdfDoc, setPdfDoc] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [pdfPageSizes, setPageSizes] = useState([]); // [{width,height}] à scale=1 — pages du PDF seulement
  const [scale, setScale] = useState(1.6); // B3 : 160% par défaut
  /* `mode` ('read' | 'edit') a été RETIRÉ (étapes 5 puis 7). Il ne commandait
     qu'une chose — si un bloc de remplacement de texte était cliquable — tout en
     portant le nom le plus fort de l'interface. L'outil actif l'a remplacé. */
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 });
  const [pageLue, setPageLue] = useState(1);
  const dpr = useDevicePixelRatio();

  const [highlights, setHighlights] = useState([]);
  // SÉLECTION EN ATTENTE (outil Sélection) : la dernière sélection de texte, gardée
  // SANS rien afficher. Elle sert à deux gestes « à la Word » : cliquer ensuite
  // l'outil Surligneur la surligne ; « Remplacer le texte sélectionné » (menu ⋯)
  // la réécrit. Elle s'efface dès que la sélection du navigateur disparaît.
  const [pending, setPending] = useState(null); // { page, texte, rects, anchor, … }

  const [edits, setEdits] = useState([]); // blocs de texte : remplacement (Chantier 1) ET boîtes libres (kind:'libre')
  const [activeEditId, setActiveEditIdBrut] = useState(null); // à changer via setActiveEditId (plus bas), jamais en direct
  /* APERÇU DE COULEUR (15/10, pdf/Couleurs.jsx) : pendant le réglage d'une couleur personnalisée,
     la boîte / forme / texte visé s'affiche dans la couleur en cours — rien n'est écrit tant que
     ce n'est pas validé (une seule entrée d'annuler), Échap rend l'ancienne. { id, couleur } | null */
  const [apercuCouleur, setApercuCouleur] = useState(null);
  const apercuPour = (id, c) => setApercuCouleur(c ? { id, couleur: c } : null);
  // outil actif de la Prise de notes. 'boite' monte une couche de tracé AU-DESSUS de
  // la couche de texte (voir PdfPageContent) : tant qu'il est actif, ni la sélection
  // ni le test de position des surlignages ne peuvent se déclencher — c'est
  // structurel, pas une suite de conditions à ne pas oublier.
  const [outil, setOutil] = useState('main'); // main | surligneur | boite | crayon | gomme — actif sur TOUS les écrans depuis l'étape 7
  const [couleurActive, setCouleurActive] = useState('ambre'); // couleur des BOÎTES (palette de base, 09/10)
  /* surligneur et crayon : chacun sa couleur, prise parmi les 4 couleurs « cours »,
     mes couleurs, ou la roue (pdf/Couleurs.jsx). Un id de COLORS ou un hex. */
  const [couleurSurligneur, setCouleurSurligneur] = useState('ambre');
  /* SURLIGNEUR FLUIDE (02/10 nuit) : pendant le geste, la sélection est dessinée dans la
     couleur EXACTE du surlignage à venir — même calcul que son rendu (couleur pleine en
     « multiply » ; une couleur perso est posée à 45 %, d'où son mélange avec le blanc).
     On peint en direct ; au relâchement, le surlignage prend la place sans aucun saut. */
  const couleurApercuSurligneur = useMemo(() => {
    const hex = couleurHex(couleurSurligneur);
    const a = opaciteSurlignage(couleurSurligneur);
    if (a >= 1) return hex;
    const n = parseInt(hex.slice(1), 16), m = (v) => Math.round(255 * (1 - a) + v * a);
    return `rgb(${m((n >> 16) & 255)}, ${m((n >> 8) & 255)}, ${m(n & 255)})`;
  }, [couleurSurligneur]);
  const [couleurCrayon, setCouleurCrayon] = useState('ardoise');
  const [couleurForme, setCouleurForme] = useState('corail'); // cadre corail par défaut : il se voit sur la page
  /* FORMES (02/10 soir) : la forme à poser et son remplissage, mémorisés sur l'appareil
     (préférence d'affichage) — on retrouve sa dernière forme en un clic. */
  const [typeFormeActif, setTypeFormeActifBrut] = useState(() => { try { return localStorage.getItem('medrevise.typeForme') || 'rectangle'; } catch (e) { return 'rectangle'; } });
  const setTypeFormeActif = (t) => { setTypeFormeActifBrut(t); try { localStorage.setItem('medrevise.typeForme', t); } catch (e) { /* ignore */ } };
  const [formeRemplie, setFormeRemplie] = useState(false);
  const [couleurTexte, setCouleurTexte] = useState('noir'); // couleur du prochain TEXTE LIBRE
  /* RÉGLAGES DU CRAYON (03/10) : TAILLE et OPACITÉ, deux curseurs, réglés séparément
     pour chaque mode (dessin / surligneur à main levée) et mémorisés sur l'appareil
     (préférence d'affichage, rien au cloud). Remplacent les 3 boutons d'épaisseur. */
  const REGLAGES_DEFAUT = { dessin: { taille: 0.0042, opacite: 1 }, surligneur: { taille: EPAISSEUR_SURLIGNEUR, opacite: OPACITE_SURLIGNEUR } };
  const [reglagesCrayon, setReglagesCrayon] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem('medrevise.reglagesCrayon') || 'null'); if (v && v.dessin && v.surligneur) return v; } catch (e) { /* ignore */ }
    return REGLAGES_DEFAUT;
  });
  const [aimant, setAimant] = useState(true); // le lissage est utile par défaut ; décochable (mode dessin seulement)
  const [modeCrayon, setModeCrayon] = useState('dessin'); // dessin (fin, doux) | surligneur (épais, translucide)
  // changer d'outil ferme ce qui appartenait au précédent
  const choisirOutil = (idDemande) => {
    // re-cliquer l'outil actif = en sortir (retour à la Sélection), comme dans Aperçu
    const id = idDemande === outil && idDemande !== 'main' ? 'main' : idDemande;
    // comme dans Word : du texte est sélectionné, on prend le surligneur → il est surligné
    if (id === 'surligneur' && pending && window.getSelection && !window.getSelection().isCollapsed) {
      commitHighlightAvec(pending, couleurSurligneur);
    }
    // (11/10) changer d'outil — y compris revenir à la Sélection — désélectionne la boîte : sa barre
    // d'outils disparaît sans Échap (docs/compte-rendu-finitions-boites-sidebar.md)
    setOutil(id); setPending(null); setAncrage(null); setActiveEditId(null);
  };
  const choisirOutilRef = useRef(choisirOutil); choisirOutilRef.current = choisirOutil;


  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [matches, setMatches] = useState([]); // [{page, itemIdx, charStart, charEnd, approxY, idx}]
  const [activeMatch, setActiveMatch] = useState(0);
  const [searching, setSearching] = useState(false);

  const [panelOpen, setPanelOpen] = useState(panneauNotionsOuvert);
  /* TRANSCRIPTION EN DIRECT (05/10, docs/compte-rendu-transcription-directe.md) :
     onglet « Transcript » du panneau de droite + feuille de démarrage. La session
     elle-même vit dans transcription/engine.js, hors de ce composant. */
  const [feuilleTrx, setFeuilleTrx] = useState(null); // null | { reprendre }
  const [ongletDemande, setOngletDemande] = useState(null);
  const ouvrirTranscript = () => {
    setPanelOpen(true);
    if (window.matchMedia('(max-width: 900px)').matches) setMobileView('items'); // même seuil que .pdfr-mobile-toggle (etudes.css)
    setOngletDemande((o) => ({ id: 'transcript', n: (o ? o.n : 0) + 1 }));
  };
  // crédits Deepgram lus dès l'ouverture du cours (v1.2), quel que soit l'onglet affiché :
  // la carte du panneau Transcript a déjà sa valeur quand on y arrive
  useEffect(() => { if (ficheId) actualiserCredits(); }, [ficheId]);
  // la session de CE cours se voit sur le segment « Transcript » : pas de pastille flottante
  useEffect(() => (ficheId ? enregistrerLecteur(ficheId) : undefined), [ficheId]);
  /* NOTIONS (05/10) : recherche dans MES notions, et mise en évidence du surlignage
     visé (classe « cible » du rectangle, 1,6 s) après le défilement vers sa page. */
  const [filtreNotions, setFiltreNotions] = useState('');
  const [flashHlId, setFlashHlId] = useState(null);
  const flashMinuteur = useRef(null);

  /* TABLEAU type Miro (04/10, docs/mecanique-miro.md) — DISPOSITION : « pdf » (comme
     avant), « deux » (PDF | tableau, poignée réglable), « tableau » (plein, le PDF reste
     MONTÉ mais masqué : on retrouve sa page et son zoom). Mémorisée par fiche, ratio
     commun (préférences d'affichage, localStorage). Proposé seulement là où le lecteur
     a son en-tête (Bibliothèque, plein écran) : Apprentissage et Anatomie, qui ont leur
     propre disposition, ne changent pas. */
  const cleDispo = 'medrevise.disposition.' + ficheId;
  const [disposition, setDispositionBrut] = useState(() => { try { return localStorage.getItem(cleDispo) || 'pdf'; } catch (e) { return 'pdf'; } });
  const [ratioSplit, setRatioSplit] = useState(() => { try { const v = parseFloat(localStorage.getItem('medrevise.disposition.ratio')); return v > 0.15 && v < 0.85 ? v : 0.5; } catch (e) { return 0.5; } });
  const setDisposition = (d) => {
    setDispositionBrut(d);
    try { localStorage.setItem(cleDispo, d); } catch (e) { /* ignore */ }
    if (d !== 'pdf') setPanelOpen(false); // la place va au tableau ; le panneau se rouvre d'un clic
  };
  const tableauRef = useRef(null);
  const [copiedCount, setCopiedCount] = useState(0); // >0 → confirmation « N notions copiées »
  const [exporting, setExporting] = useState(false);

  const scrollRef = useRef(null);
  const scrollRaf = useRef(null);
  const pendingScroll = useRef(null);
  const textMapCache = useRef({});

  // charge le document + précalcule la taille réelle de chaque page (scale=1)
  // `pdfManquant` : le fichier n'est ni sur cet appareil ni lisible au cloud (pas encore
  // envoyé par l'appareil d'import, ou hors ligne). Ce n'est PAS une fatalité (étape 5 :
  // l'appareil d'origine le renvoie tout seul) — on retente donc à chaque synchro
  // (`db` remplacé par reload()) et sur « Réessayer », sans rouvrir le cours.
  const [pdfRetry, setPdfRetry] = useState(0);
  const cacheDocs = useRef(new Map()); // pdfId → { doc, sizes } (original et fiche jumelle)
  const pdfDocDe = useRef(null); // (17/10) pdfId du `pdfDoc` affiché (menu Fichier : action différée)
  const nsCharge = useRef({ hl: null, ed: null }); // (17/10) calque dont les annotations sont chargées
  const [pdfManquant, setPdfManquant] = useState(false);
  useEffect(() => { if (pdfManquant) setPdfRetry((t) => t + 1); }, [db]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let cancelled = false;
    setPdfDoc(null); setLoadError(null); setPdfManquant(false); setPageSizes([]); textMapCache.current = {};
    if (!fiche || !pdfIdActif) return;
    // (15/10) document déjà ouvert dans cette session (bascule Original ⇄ Fiche) : aucun rechargement
    const enCache = cacheDocs.current.get(pdfIdActif);
    if (enCache) { pdfDocDe.current = pdfIdActif; setPdfDoc(enCache.doc); setNumPages(enCache.doc.numPages); setPageSizes(enCache.sizes); return; }
    (async () => {
      try {
        const blob = await getBlob(pdfIdActif);
        if (!blob) {
          if (!cancelled) {
            setPdfManquant(true);
            setLoadError(navigator.onLine === false
              ? "PDF pas encore disponible sur cet appareil — tu es hors ligne. Il s'ouvrira dès le retour du réseau."
              : "PDF pas encore arrivé au cloud — l'appareil où il a été importé l'enverra automatiquement à sa prochaine ouverture de MedRevise. Nouvel essai à chaque synchro.");
          }
          return;
        }
        const buf = await blob.arrayBuffer();
        const doc = await openPdf(buf);
        if (cancelled) return;
        const sizes = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const vp = page.getViewport({ scale: 1 });
          sizes.push({ width: vp.width, height: vp.height });
        }
        if (cancelled) return;
        cacheDocs.current.set(pdfIdActif, { doc, sizes });
        pdfDocDe.current = pdfIdActif;
        setPdfDoc(doc); setNumPages(doc.numPages); setPageSizes(sizes);
      } catch (e) {
        if (!cancelled) setLoadError('Impossible de lire ce PDF.');
      }
    })();
    return () => { cancelled = true; };
  }, [pdfIdActif, pdfRetry]); // eslint-disable-line react-hooks/exhaustive-deps

  const reloadHighlights = async () => {
    const all = await getAll('highlights');
    // 07/10 : les notions de l'onglet « Notes » (source 'doc') n'ont ni page ni rectangles —
    // jamais mêlées aux surlignages du PDF, listées à part dans le mode Notions
    setHighlights(all.filter((h) => h.ficheId === nsAnnot && !estNotionDoc(h) && !h.convertieEnFlux).sort(compareHighlights));
    nsCharge.current.hl = nsAnnot;
    setNotionsNotes(all.filter((h) => h.ficheId === ficheId && estNotionDoc(h)));
    // fiche jumelle : les notions de L'AUTRE document restent listées dans le panneau (rattachées au cours)
    const autreNs = jumelle ? (surFiche ? ficheId : jumelle.nsAnnot) : null;
    setNotionsAutreDoc(autreNs ? all.filter((h) => h.ficheId === autreNs && !estNotionDoc(h) && !h.convertieEnFlux).sort(compareHighlights) : []);
  };
  const [notionsNotes, setNotionsNotes] = useState([]);
  const [notionsAutreDoc, setNotionsAutreDoc] = useState([]);
  const notesRef = useRef(null);
  const [flashcardNotes, setFlashcardNotes] = useState(null); // { texte, n } — flashcard depuis une sélection des notes
  const [editsChargesNs, setEditsCharges] = useState(false);
  const editsCharges = editsChargesNs === nsAnnot;
  const reloadEdits = async () => {
    const all = await getAll('annotations');
    // (10/10) image flottante d'un document déjà convertie en bloc du flux : plus affichée
    setEdits(all.filter((a) => a.ficheId === nsAnnot && !a.convertieEnFlux));
    nsCharge.current.ed = nsAnnot;
    setEditsCharges(nsAnnot); // (15/10 soir) chargées pour CE calque : au retour sur le document, rien ne part avant
  };

  /* ---- ANNULER / RÉTABLIR (lib/annotHistory.js) ----
     TOUTES les écritures d'annotation de ce composant passent par `hist.appliquer`
     — jamais put/remove en direct. C'est la seule règle à tenir pour qu'aucune
     action ne puisse échapper à l'historique, aujourd'hui comme demain.
     Boutons et raccourcis sont actifs sur tous les écrans depuis l'étape 7. */
  const rechargerAnnotations = async () => { await reloadHighlights(); await reloadEdits(); };
  /* EFFETS LOCAUX (correctif « hallucinations », voir lib/annotHistory.js) : chaque
     commande est appliquée À L'ÉCRAN de façon synchrone, dans le même rendu que la
     fin du geste qui l'a produite — plus d'aller-retour par IndexedDB entre les
     deux, donc plus d'ancien état qui réapparaît une fraction de seconde. */
  const appliquerLocal = (effets) => {
    const maj = (arr, store) => {
      let res = arr;
      for (const e of effets) {
        if (e.store !== store) continue;
        const id = (e.apres || e.avant || {}).id;
        if (!id) continue;
        const sans = res.filter((x) => x.id !== id);
        res = e.apres ? (res.some((x) => x.id === id) ? res.map((x) => (x.id === id ? e.apres : x)) : [...sans, e.apres]) : sans;
      }
      return res;
    };
    if (effets.some((e) => e.store === 'annotations')) setEdits((arr) => maj(arr, 'annotations'));
    if (effets.some((e) => e.store === 'highlights')) setHighlights((arr) => maj(arr, 'highlights').sort(compareHighlights));
  };
  const histAnnot = useAnnotHistorique(rechargerAnnotations, appliquerLocal);
  // UN SEUL journal (08/10, lib/journalAnnuler.js) : annotations ET texte des pages d'un document,
  // dans l'ordre où on les a faits — `hist` garde l'interface de la pile des annotations
  const restaurerPageRef = useRef(null);
  const hist = useJournalAnnuler(histAnnot, (id, json) => (restaurerPageRef.current ? restaurerPageRef.current(id, json) : undefined));

  // (15/10) changer de document (fiche jumelle) = un autre calque : l'historique d'annuler repart à zéro
  useEffect(() => { setEditsCharges(false); reloadHighlights(); reloadEdits(); setActiveEditId(null); hist.vider(); }, [nsAnnot, jumelle && jumelle.nsAnnot]); // eslint-disable-line react-hooks/exhaustive-deps

  /* RACCOURCIS ANNULER / RÉTABLIR — un seul gestionnaire, en CAPTURE (avant ProseMirror) :
     ⌘Z annule ; ⌘⇧Z et ⌘Y rétablissent. Routage (lib/journalAnnuler.js#raccourciAnnuler) :
     texte d'une PAGE de document, image, annotation ou rien de focalisé → le journal ;
     champ de formulaire → historique natif ; autre texte éditable (boîte de texte, notes,
     transcript) → son propre éditeur ; tableau → ses propres raccourcis. */
  useEffect(() => {
    const onKey = (e) => {
      const action = raccourciAnnuler(e);
      if (!action) return;
      const t = e.target, a = document.activeElement;
      if (dansLeTableau(t) || dansLeTableau(a)) return; // le tableau a ses propres raccourcis
      const pageDoc = (el) => !!(el && el.closest && el.closest('.pt-zone'));
      if ((cibleEditable(t) || cibleEditable(a)) && !pageDoc(t) && !pageDoc(a)) return;
      e.preventDefault(); e.stopPropagation();
      if (action === 'retablir') hist.retablir(); else hist.annuler();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [hist.annuler, hist.retablir]); // eslint-disable-line react-hooks/exhaustive-deps
  // (ancien gestionnaire, gardé pour la seule suppression documentée ci-dessous)
  useEffect(() => {
    const onKey = (e) => {
      if (cibleEditable(e.target) || cibleEditable(document.activeElement)) return;
      if (dansLeTableau(e.target) || dansLeTableau(document.activeElement)) return;
      /* CORRECTIF (défaut 4) : PLUS de suppression au clavier ici. Un écouteur
         global sur Suppr/Retour arrière effaçait la boîte active dès que le curseur
         n'était pas dans son texte — par exemple juste après un clic sur son
         bandeau. La suppression au clavier vit désormais SUR la boîte elle-même
         (voir NoteBox#onKeyDown), donc elle ne peut se déclencher que si le
         bandeau de CETTE boîte a réellement le focus. */
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // les surlignages ne vivent pas dans `db` (lus à part, ci-dessus) : sans ceci, ceux
  // qu'une synchro rapatrie d'un autre appareil (retour sur l'onglet, reconnexion —
  // MedReviseApp.jsx appelle alors reload(), qui remplace `db`) n'apparaîtraient qu'à
  // la réouverture du lecteur.
  useEffect(() => { reloadHighlights(); }, [db]); // eslint-disable-line react-hooks/exhaustive-deps
  // (10/10) idem pour les boîtes et autres annotations : un texte importé ou une bascule de
  // version faits sur un autre appareil s'affichent sans rouvrir le cours
  const premiereLecture = useRef(true);
  useEffect(() => { if (premiereLecture.current) { premiereLecture.current = false; return; } reloadEdits(); }, [db]); // eslint-disable-line react-hooks/exhaustive-deps

  /* PAGES AFFICHÉES (01/10, docs/archi-edition-pdf.md) : les pages du PDF, dans
     l'ordre, et après la page n les PAGES AJOUTÉES (kind 'page', apres = n) triées
     par rang. `cle` = numéro de page du PDF, ou id de la page ajoutée — c'est la
     valeur de `page` des annotations posées dessus. Le PDF n'est jamais réécrit :
     sans page ajoutée, cette liste est exactement celle d'avant. */
  // (15/10 soir) seulement le calque AFFICHÉ : à une bascule Original ⇄ Fiche, les annotations de l'autre
  // document restent en mémoire le temps du rechargement — elles ne doivent ni s'afficher ni décaler les pages
  const editsVus = useMemo(() => edits.filter((a) => a.ficheId === nsAnnot), [edits, nsAnnot]);
  const pagesAjoutees = useMemo(() => separerParType([], editsVus).page, [editsVus]);
  const [nbPagesCalculees, setNbPagesCalculees] = useState(null); // document : résultat de la pagination
  const pageSizes = useMemo(() => {
    if (modeDoc) {
      /* document : ses pages, dans l'ordre (triées par rang), A4 — autant que la pagination en
         calcule. Les enregistrements en trop (texte raccourci) ne sont PAS supprimés (aucune
         écriture destructive) : masqués, ils resservent quand le texte s'allonge. Une page qui
         porte des annotations reste toujours affichée. */
      const tri = (a, b) => (a.rang - b.rang) || String(a.createdAt).localeCompare(String(b.createdAt));
      const recs = [...pagesAjoutees].sort(tri);
      let n = recs.length;
      if (nbPagesCalculees != null) {
        let annotee = 0;
        recs.forEach((r, i) => { if (edits.some((a) => a.page === r.id)) annotee = i + 1; });
        n = Math.min(recs.length, Math.max(1, nbPagesCalculees, annotee));
      }
      return recs.slice(0, n).map((a) => ({ cle: a.id, pdf: null, ajout: a, width: a.width || PAGE_A4.width, height: a.height || PAGE_A4.height }));
    }
    if (!pdfPageSizes.length) return [];
    const parApres = {};
    for (const a of pagesAjoutees) {
      const k = Math.max(0, Math.min(pdfPageSizes.length, Math.floor(Number(a.apres) || 0)));
      (parApres[k] || (parApres[k] = [])).push(a);
    }
    const tri = (a, b) => (a.rang - b.rang) || String(a.createdAt).localeCompare(String(b.createdAt));
    const liste = [];
    const ajouter = (k) => (parApres[k] || []).sort(tri).forEach((a) => liste.push({
      cle: a.id, pdf: null, ajout: a,
      width: a.width || pdfPageSizes[Math.max(0, k - 1)].width, height: a.height || pdfPageSizes[Math.max(0, k - 1)].height,
    }));
    ajouter(0);
    pdfPageSizes.forEach((sz, i) => { liste.push({ cle: i + 1, pdf: i + 1, width: sz.width, height: sz.height }); ajouter(i + 1); });
    return liste;
  }, [pdfPageSizes, pagesAjoutees, modeDoc, nbPagesCalculees, edits]);
  const nbPagesAffichees = pageSizes.length;
  const pageSizesRef = useRef(pageSizes); pageSizesRef.current = pageSizes;

  /* ---- TEXTE DES PAGES D'UN DOCUMENT (08/10) ----
     `corpsPages` : JSON du texte de chaque page (store notes_doc, champ `pages`), lu à
     l'ouverture et tenu à jour à chaque enregistrement — une page démontée par le rendu
     virtualisé repart toujours de la dernière version. */
  const corpsPages = useRef({});
  const ancienDoc = useRef(null);
  const [docCharge, setDocCharge] = useState(false);
  const [fondNoir, setFondNoir] = useState(false);
  const pagesTexte = useRef(new Map()); // id de page → API de son PageTexte monté
  const focusPages = useRef({}); // id de page → position du curseur à poser à son montage
  const [editeurPage, setEditeurPage] = useState(null); // { pageId, ed } — texte de page en cours d'écriture
  const creationPage = useRef(false);
  /* MOTEUR PAGINÉ (08/10, docs/compte-rendu-document-engine.md) : le texte d'un DOCUMENT est
     UN flux (`notes_doc.flux`, un seul éditeur — DocumentFlux) ; ses pages sont CALCULÉES
     par la pagination. `fluxInitial` : le flux lu à l'ouverture (converti depuis l'ancien
     format au besoin) ; ensuite, la seule source de vérité est l'état de l'éditeur. */
  const fluxRef = useRef(null);
  const [fluxInitial, setFluxInitial] = useState(null);
  /* MARGES (09/10, documents/lib/marges.js) : en mm, mémorisées dans notes_doc.marges ;
     null = marges d'avant (56 unités). `margesEcrites` : dernière valeur enregistrée ici. */
  const [marges, setMarges] = useState(null);
  const margesEcrites = useRef(null);
  const [miseEnPage, setMiseEnPage] = useState(false);
  /* la page « se pose » à l'ouverture (09/10) : classe posée le temps de l'animation (≤ 200 ms),
     puis retirée — une page montée plus tard au défilement apparaît sans effet */
  const [pose, setPose] = useState(false);
  const margesFlux = useMemo(() => margesUnites(marges), [marges]);
  const minuteurMarges = useRef(null);
  const changerMarges = (m, fin = true) => {
    setMarges(m);
    clearTimeout(minuteurMarges.current);
    if (!fin) return;
    minuteurMarges.current = setTimeout(() => {
      margesEcrites.current = JSON.stringify(m);
      majNotesDoc(ficheId, { marges: m }).catch(() => {});
    }, 250);
  };
  const [pagination, setPagination] = useState(null); // { nbPages, blocs: [{ page, pos, type }] }
  const fluxEcrit = useRef(0); // fluxMaj de la dernière écriture locale
  const planifierNotionsRef = useRef(() => {});
  useEffect(() => {
    let vivant = true;
    setDocCharge(false); corpsPages.current = {}; ancienDoc.current = null; setFondNoir(false); setEditeurPage(null); creationPage.current = false;
    setFluxInitial(null); setPagination(null); setNbPagesCalculees(null); fluxEcrit.current = 0;
    if (!ficheReelle) return undefined;
    lireNotesDoc(ficheId).then((r) => {
      if (!vivant) return;
      corpsPages.current = { ...((r && r.pages) || {}) };
      ancienDoc.current = r || null;
      setFondNoir(!!(r && r.fond === 'noir'));
      setMarges(margesDe(r)); margesEcrites.current = JSON.stringify(margesDe(r));
      setDocCharge(true);
    });
    return () => { vivant = false; };
  }, [ficheId]); // eslint-disable-line react-hooks/exhaustive-deps
  // un document a toujours au moins une page. (Le texte d'un document d'avant le 08/10, dans
  // `content`, n'est plus déplacé ici : la conversion vers le flux le lit tel quel.)
  useEffect(() => {
    if (!modeDoc || !docCharge || !editsCharges || pagesAjoutees.length || creationPage.current) return;
    creationPage.current = true;
    (async () => {
      const rec = newPageAjoutee({ ficheId: nsAnnot, apres: 0, rang: 0, width: PAGE_A4.width, height: PAGE_A4.height });
      await put('annotations', rec);
      appliquerLocal([{ store: 'annotations', apres: rec }]);
      creationPage.current = false;
    })();
  }, [modeDoc, docCharge, editsCharges, pagesAjoutees.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // flux du document : lu tel quel, ou CONVERTI une fois depuis l'ancien format (une page = un
  // JSON) — sauvegarde putBackup avant, `pages` laissé intact : conversion idempotente
  useEffect(() => {
    if (!modeDoc || !docCharge || !editsCharges || fluxInitial || !pagesAjoutees.length) return;
    const r = ancienDoc.current || {};
    if (r.flux) { setFluxInitial(r.flux); fluxEcrit.current = r.fluxMaj || 0; return; }
    const tri = (a, b) => (a.rang - b.rang) || String(a.createdAt).localeCompare(String(b.createdAt));
    const ordre = [...pagesAjoutees].sort(tri).map((a) => a.id);
    const flux = fluxDepuisPages(r, ordre);
    setFluxInitial(flux);
    (async () => {
      await putBackup('pre-flux-' + ficheId + '-' + Date.now(), { notes_doc: r, pages: ordre });
      const maj = Date.now();
      fluxEcrit.current = maj;
      await majNotesDoc(ficheId, (rec) => (rec.flux ? null : { flux, fluxMaj: maj, fluxAppareil: idAppareil(), fluxV: 1 }));
    })();
  }, [modeDoc, docCharge, editsCharges, pagesAjoutees.length, fluxInitial]); // eslint-disable-line react-hooks/exhaustive-deps
  const sauverFlux = (json) => {
    const maj = Date.now();
    fluxEcrit.current = maj;
    majNotesDoc(ficheId, { flux: json, fluxMaj: maj, fluxAppareil: idAppareil() }).then(planifierNotionsRef.current).catch(() => {});
  };
  /* SYNCHRO : une version du flux venue d'un AUTRE appareil (relue quand la base change) ne
     remplace l'état local que si elle est plus récente, et seulement après 2 s sans frappe */
  useEffect(() => {
    if (!modeDoc || !fluxInitial) return undefined;
    let vivant = true, t = null;
    const essayer = async () => {
      const r = await lireNotesDoc(ficheId);
      // marges changées sur un autre appareil
      if (vivant && r && JSON.stringify(margesDe(r)) !== margesEcrites.current) { margesEcrites.current = JSON.stringify(margesDe(r)); setMarges(margesDe(r)); }
      if (!vivant || !r || !r.flux || !(r.fluxMaj > fluxEcrit.current) || r.fluxAppareil === idAppareil()) return;
      const api = fluxRef.current;
      if (!api) return;
      if (api.inactifDepuis() < 2000) { t = setTimeout(essayer, 2000); return; }
      fluxEcrit.current = r.fluxMaj;
      api.remplacerDistant(r.flux);
    };
    essayer();
    return () => { vivant = false; clearTimeout(t); };
  }, [db]); // eslint-disable-line react-hooks/exhaustive-deps
  /* PAGES = RÉSULTAT DE LA PAGINATION : autant d'enregistrements « page » que de pages
     calculées (les annotations s'y accrochent) ; créés au besoin, jamais supprimés (en trop :
     masqués, voir pageSizes). Hors historique (conséquence du texte, qui, lui, s'annule). */
  const synchroPages = useRef(null);
  useEffect(() => {
    if (!modeDoc || !pagination || !editsCharges) return undefined;
    clearTimeout(synchroPages.current);
    synchroPages.current = setTimeout(async () => {
      const tri = (a, b) => (a.rang - b.rang) || String(a.createdAt).localeCompare(String(b.createdAt));
      const recs = [...pagesAjoutees].sort(tri);
      const n = Math.max(1, pagination.nbPages);
      if (recs.length < n) {
        let rang = recs.length ? recs[recs.length - 1].rang : 0;
        const nouveaux = [];
        for (let i = recs.length; i < n; i++) { rang += 1; nouveaux.push(newPageAjoutee({ ficheId: nsAnnot, apres: 0, rang, width: PAGE_A4.width, height: PAGE_A4.height })); }
        appliquerLocal(nouveaux.map((rec) => ({ store: 'annotations', apres: rec })));
        for (const rec of nouveaux) await put('annotations', rec);
      }
      setNbPagesCalculees(n); // les enregistrements en trop sont masqués, jamais supprimés
    }, 350);
    return () => clearTimeout(synchroPages.current);
  }, [pagination && pagination.nbPages, pagesAjoutees.length, editsCharges]); // eslint-disable-line react-hooks/exhaustive-deps

  // le lecteur peut afficher ses pages : PDF chargé, ou document prêt
  const pret = !!pdfDoc || (modeDoc && docCharge && pageSizes.length > 0);
  /* EMPLOI DU TEMPS (17/10) : dernier cours ouvert de chaque matière (bouton « Ouvrir » d'un cours
     de l'école, lib/derniersCours.js — cet appareil seulement) ; « Transcrire » pendant un cours
     Teams ouvre ce cours avec la feuille de démarrage pré-remplie (source Onglet Chrome). Une
     session déjà en cours n'est jamais doublée : on montre simplement le panneau Transcript. */
  useEffect(() => { if (ficheReelle) noterCoursOuvert(ficheReelle); }, [ficheReelle && ficheReelle.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const transcrireDemande = useRef(!embedded && pdfView && pdfView.ficheId === ficheId ? pdfView.transcrire : null);
  useEffect(() => {
    if (!pret || !transcrireDemande.current || !ficheId) return;
    const source = transcrireDemande.current;
    transcrireDemande.current = null;
    if (transcriptionActive()) ouvrirTranscript();
    else setFeuilleTrx({ source });
  }, [pret, ficheId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!pret) return undefined;
    setPose(true);
    const t = setTimeout(() => setPose(false), 260);
    return () => clearTimeout(t);
  }, [pret, ficheId, pdfIdActif]); // (15/10) + bascule Original ⇄ Fiche : même fondu court
  // index (0…) dans les pages affichées d'une clé de page (numéro du PDF ou id)
  const indexDePage = (cle) => pageSizes.findIndex((p) => p.cle === cle);

  // B2 : offsets cumulés (px, à l'échelle courante) — le contenu scale strictement
  // linéairement (le gap scale aussi), ce qui rend le zoom centré sur le curseur trivial.
  const layout = useMemo(() => {
    const offsets = [];
    let y = 0;
    for (let i = 0; i < pageSizes.length; i++) {
      offsets.push(y);
      y += pageSizes[i].height * scale + GAP * scale;
    }
    // largeur de la page la plus large : le conteneur ne descend jamais sous elle (voir
    // .pdfr-pages plus bas). Sans ça, une page plus large que la zone visible (zoom,
    // fenêtre étroite) était centrée par left:50% + translateX(-50%) dans un conteneur
    // plus étroit qu'elle — son bord gauche partait en négatif, hors de portée du scroll.
    const maxWidth = pageSizes.reduce((m, s) => Math.max(m, s.width), 0) * scale;
    return { offsets, totalHeight: Math.max(0, y - GAP * scale), maxWidth };
  }, [pageSizes, scale]);

  const computeVisibleRange = () => {
    const el = scrollRef.current;
    if (!el || !layout.offsets.length) return;
    const buffer = el.clientHeight;
    const top = el.scrollTop - buffer;
    const bottom = el.scrollTop + el.clientHeight + buffer;
    let start = 0;
    for (let i = 0; i < layout.offsets.length; i++) {
      const pageBottom = layout.offsets[i] + pageSizes[i].height * scale;
      if (pageBottom >= top) { start = i; break; }
      start = i;
    }
    let end = layout.offsets.length - 1;
    for (let i = layout.offsets.length - 1; i >= 0; i--) {
      if (layout.offsets[i] <= bottom) { end = i; break; }
    }
    setVisibleRange({ start: Math.max(0, start), end: Math.max(start, end) });
    // page LUE : celle qui occupe la ligne de lecture (un tiers du haut de la zone
    // visible, plafonné). `visibleRange` inclut un écran de marge AU-DESSUS pour
    // pré-rendre : s'en servir comme page courante donnait toujours la page d'avant,
    // et « page suivante » renvoyait sur la page déjà affichée (compteur figé).
    const ligne = el.scrollTop + Math.min(el.clientHeight * 0.33, 240);
    let lue = 0;
    for (let i = 0; i < layout.offsets.length; i++) { if (layout.offsets[i] <= ligne) lue = i; else break; }
    setPageLue(lue + 1);
  };
  useEffect(() => { computeVisibleRange(); }, [layout]);
  // pour les callbacks différés (insertion d'une page) : toujours la dernière mise en page
  const layoutRef = useRef(layout); layoutRef.current = layout;
  const computeVisibleRangeRef = useRef(computeVisibleRange); computeVisibleRangeRef.current = computeVisibleRange;
  const onScroll = () => {
    if (scrollRaf.current) return;
    scrollRaf.current = requestAnimationFrame(() => { scrollRaf.current = null; computeVisibleRange(); });
  };

  // page affichée = celle qui passe sous la ligne de lecture (voir computeVisibleRange),
  // tenue à jour par le même défilement que le rendu virtualisé.
  const pageCourante = Math.min(nbPagesAffichees || 1, Math.max(1, pageLue));
  /* OCR (05/10, docs/compte-rendu-ocr.md) : couche de texte reconnue des pages IMAGE,
     tenue à jour page par page pendant le traitement (la page affichée passe d'abord).
     Rien n'est visible par défaut : elle sert la sélection, le surlignage, la recherche
     et les mots-clés comme une vraie couche texte. */
  const szCourant = pageSizes[pageCourante - 1];
  const coucheOcr = useCoucheOcr(pdfIdActif, {
    courseId: ficheId, titre: titreFiche, pret: !!pdfDoc,
    page: szCourant && typeof szCourant.cle === 'number' ? szCourant.cle : pageCourante,
  });
  const etatOcr = useEtatOcr();
  const ocrPagePour = (n) => (coucheOcr && typeof n === 'number' && coucheOcr.pages[n - 1]) || null;
  const [ocrDebug, setOcrDebug] = useState(false);
  const [detailOcr, setDetailOcr] = useState(false);
  useEffect(() => { textMapCache.current = {}; }, [coucheOcr]); // nouvelle page reconnue : la recherche la voit
  // aller à une page : son bord haut juste sous la barre, sans la marge de 70 px
  // qu'utilisent recherche et notions (qui visent une LIGNE, pas une page).
  const allerALaPage = (n) => {
    const idx = Math.max(0, Math.min(nbPagesAffichees - 1, n - 1));
    const el = scrollRef.current;
    if (!el || layout.offsets[idx] == null) return;
    el.scrollTop = Math.max(0, layout.offsets[idx] - 8 * scale);
    computeVisibleRange();
  };

  /* TRANSCRIPT ↔ PAGES (20/10, transcription/pages.js, docs/compte-rendu-pdfreader-v3.md) : le moteur de
     transcription lit ici la page affichée à chaque segment validé ; un numéro « p. 14 » du transcript
     ramène le lecteur à sa page (en basculant sur la fiche jumelle si la ligne y a été dite). */
  const docAffiche = surFiche ? 'fiche' : 'original';
  const pagePourTrx = useRef(null);
  pagePourTrx.current = { courseId: ficheId, page: pageCourante, cle: pageSizes[pageCourante - 1] ? pageSizes[pageCourante - 1].cle : null, doc: docAffiche };
  useEffect(() => (ficheId && pret ? definirPageCourante(() => pagePourTrx.current) : undefined), [ficheId, pret]);
  const allerAuSegment = (l) => {
    const doc = l.doc || 'original';
    if (doc !== docAffiche && jumelle && !modeDocCours) {
      sauverRef.current();
      cibleBascule.current = { kind: 'pdf', cle: l.pageCle != null ? l.pageCle : l.page, fraction: 0, scale, zoomManuel: zoomManuel.current };
      setVueJumelle(doc); ecrireVue(idFiche, doc);
      return;
    }
    const idx = l.pageCle != null ? pageSizes.findIndex((sz) => String(sz.cle) === String(l.pageCle)) : -1;
    allerALaPage(idx >= 0 ? idx + 1 : l.page);
  };
  const [demandePage, setDemandePage] = useState(null); // { page, doc, sessionId, n } : badge d'une page cliqué
  const ouvrirTranscriptPage = (page, sessionId) => {
    allerALaPage(page);
    setDemandePage((d) => ({ page, doc: docAffiche, sessionId, n: (d ? d.n : 0) + 1 }));
    ouvrirTranscript();
  };

  // « Ajuster à la largeur » : la même formule que l'ajustement automatique de
  // l'écran splitté (voir `ajusterLargeur`), déclenchée à la demande.
  const ajusterALaLargeur = () => {
    const el = scrollRef.current;
    if (!el || !pageSizes.length) return;
    const largeur = pageSizes.reduce((m, sz) => Math.max(m, sz.width), 0);
    const dispo = el.clientWidth - 28;
    if (dispo < 120 || !largeur) return;
    zoomAt(el.getBoundingClientRect().top, dispo / largeur);
  };

  const scrollToPageFraction = (pageNum, fracY = 0) => {
    const idx = indexDePage(pageNum); // numéro du PDF → position parmi les pages affichées
    if (idx < 0 || !layout.offsets.length || !pageSizes[idx] || !scrollRef.current) return;
    const target = layout.offsets[idx] + fracY * (pageSizes[idx].height * scale) - 70;
    scrollRef.current.scrollTop = Math.max(0, target);
  };

  // B3 : zoom centré sur un point écran donné (curseur, ou centre du viewport pour les boutons)
  // zoom « ajusté à la largeur » (voir la prop ajusterLargeur) : observé en continu, pour
  // suivre la poignée de l'écran splitté ; abandonné dès le premier zoom manuel.
  const zoomManuel = useRef(false);

  /* ---- POSITION DE LECTURE (07/10, lib/positionLecture.js) ----
     À l'ouverture : la position mémorisée (cet appareil ou un autre, via la synchro) est lue
     EN PARALLÈLE du PDF ; la zone de lecture reste INVISIBLE (aucun flash de la page 1)
     jusqu'à ce que zoom, disposition et défilement soient posés ET que la page visée soit
     dessinée. Ensuite, la position est enregistrée à chaque arrêt du défilement (500 ms), au
     changement de page, de zoom ou de disposition, quand l'onglet est caché et à la fermeture. */
  const [posLue, setPosLue] = useState(false);
  const cibleBascule = useRef(null); // { cle, fraction } : page visée par une bascule Original ⇄ Fiche
  const posRef = useRef(null); // position mémorisée (ou null)
  const [restaure, setRestaure] = useState(false); // la zone de lecture peut s'afficher
  const restaureRef = useRef(false); restaureRef.current = restaure;
  const aRestaurer = useRef(null); // position en cours de restauration
  // CORRECTIF (08/10) : la décision ne change parfois aucun état (zoom et disposition déjà
  // les bons) — ce compteur relance quand même la pose du défilement ci-dessous. Sans lui,
  // la zone de lecture restait masquée (même zoom que celui mémorisé = aucun rendu de plus).
  const [tourRestauration, setTourRestauration] = useState(0);
  useEffect(() => {
    let vivant = true;
    setPosLue(false); setRestaure(false); posRef.current = null; aRestaurer.current = null;
    lirePosition(nsAnnot).then((p) => { if (vivant) { posRef.current = p; setPosLue(true); } });
    return () => { vivant = false; };
  }, [nsAnnot]);
  // décision : position valable (même PDF, même nombre de pages) → zoom et disposition d'abord
  useEffect(() => {
    // (15/10 soir) + les annotations du calque chargées : ses pages ajoutées font partie de la mise en page
    if (restaure || !posLue || !pret || !pageSizes.length || aRestaurer.current || !editsCharges) return;
    // (15/10) bascule Original ⇄ Fiche : la page CORRESPONDANTE, même position dans la page, même zoom
    const bascule = cibleBascule.current;
    cibleBascule.current = null;
    if (bascule && pageSizes.some((sz) => sz.cle === bascule.cle)) {
      aRestaurer.current = { ...bascule, index: pageSizes.findIndex((sz) => sz.cle === bascule.cle) };
      setTourRestauration((n) => n + 1);
      return;
    }
    const p = posRef.current;
    // document : la page mémorisée existe encore ; PDF : même fichier, même nombre de pages
    const valable = modeDoc ? !!(p && p.kind === 'doc' && pageSizes.some((sz) => String(sz.cle) === String(p.cle)))
      : !!(p && p.kind === 'pdf' && p.empreinte && p.empreinte === empreintePdf(pdfIdActif, pdfDoc.numPages));
    if (!valable) { setRestaure(true); return; } // rien, ou PDF changé : page 1, sans erreur
    aRestaurer.current = p;
    setTourRestauration((n) => n + 1);
    if (p.disposition && ['pdf', 'deux', 'tableau'].includes(p.disposition) && p.disposition !== disposition) {
      setDispositionBrut(p.disposition);
      try { localStorage.setItem(cleDispo, p.disposition); } catch (e) { /* ignore */ }
    }
    // zoom : celui de la lecture, sauf en tablette ajustée à la largeur (le zoom suit l'écran)
    if (p.zoomManuel || !modeTab) {
      zoomManuel.current = !!p.zoomManuel || zoomManuel.current;
      const z = Math.max(0.4, Math.min(4, Number(p.scale) || scale));
      if (Math.abs(z - scale) > 0.001) { scaleRef.current = z; setScale(z); }
    }
  }, [posLue, pret, pageSizes, restaure, editsCharges]); // eslint-disable-line react-hooks/exhaustive-deps
  // défilement : posé à chaque mise en page tant que la restauration n'est pas finie (le zoom
  // ajusté à la largeur peut encore changer), puis on attend que la page visée soit dessinée
  useLayoutEffect(() => {
    const p = aRestaurer.current;
    const el = scrollRef.current;
    if (!p || restaure || !el || !layout.offsets.length) return undefined;
    let idx = pageSizes.findIndex((sz) => String(sz.cle) === String(p.cle));
    if (idx < 0) idx = Math.max(0, Math.min(pageSizes.length - 1, Number(p.index) || 0));
    const h = pageSizes[idx].height * scale;
    el.scrollTop = Math.max(0, layout.offsets[idx] + Math.max(0, Math.min(1, Number(p.fraction) || 0)) * h);
    pendingScroll.current = null;
    computeVisibleRange();
    let raf = null, fini = false;
    const t0 = performance.now();
    const verifier = () => {
      raf = null;
      if (fini) return;
      const page = el.querySelector(`.pdfr-page[data-cle="${CSS.escape(String(pageSizes[idx].cle))}"] canvas[data-rendu]`);
      if (page || performance.now() - t0 > 2500) { fini = true; aRestaurer.current = null; setRestaure(true); return; }
      raf = requestAnimationFrame(verifier);
    };
    raf = requestAnimationFrame(verifier);
    return () => { fini = true; if (raf) cancelAnimationFrame(raf); };
  }, [layout, restaure, tourRestauration]); // eslint-disable-line react-hooks/exhaustive-deps
  // enregistrement
  const etatPosition = useRef({});
  etatPosition.current = { layout, pageSizes, scale, disposition, pdfId: pdfIdActif, nb: modeDoc ? pageSizes.length : pdfDoc && pdfDoc.numPages, modeDoc, ns: nsAnnot };
  const sauverPosition = () => {
    if (!restaureRef.current || !ficheId) return;
    const el = scrollRef.current;
    const st = etatPosition.current;
    if (!el || !st.layout.offsets.length || !st.nb) return;
    const pos = positionDepuisDefilement(el.scrollTop, st.layout.offsets, st.pageSizes.map((sz) => sz.height * st.scale));
    if (!pos) return;
    ecrirePosition(st.ns || ficheId, { // (15/10) une position PAR DOCUMENT (original / fiche jumelle)
      kind: st.modeDoc ? 'doc' : 'pdf', cle: st.pageSizes[pos.index].cle, index: pos.index, fraction: +pos.fraction.toFixed(4),
      scale: +st.scale.toFixed(3), zoomManuel: !!zoomManuel.current, disposition: st.disposition,
      empreinte: st.modeDoc ? 'doc' : empreintePdf(st.pdfId, st.nb),
    });
  };
  const sauverRef = useRef(sauverPosition); sauverRef.current = sauverPosition;

  /* ---- FICHE JUMELLE : BASCULE ORIGINAL ⇄ FICHE (15/10) ----
     La page affichée est remplacée par sa correspondante (pageMap), à la même position relative
     dans la page et au même zoom ; l'outil actif reste. La position du document quitté est
     mémorisée (une par document). Une page sans équivalent mène à la plus proche qui en a un,
     avec un avis. */
  const [avisJumelle, setAvisJumelle] = useState(null);
  useEffect(() => { if (!avisJumelle) return undefined; const t = setTimeout(() => setAvisJumelle(null), 3200); return () => clearTimeout(t); }, [avisJumelle]);
  // page du PDF (numéro) et fraction sous la ligne de lecture du lecteur
  const lirePagePdf = () => {
    const el = scrollRef.current, st = etatPosition.current;
    if (!el || !st.layout.offsets.length) return { page: 1, fraction: 0 };
    const pos = positionDepuisDefilement(el.scrollTop, st.layout.offsets, st.pageSizes.map((sz) => sz.height * st.scale));
    if (!pos) return { page: 1, fraction: 0 };
    if (st.modeDoc) return { page: pos.index + 1, fraction: pos.fraction }; // document : n° de page affichée
    for (let i = pos.index; i >= 0; i--) if (typeof st.pageSizes[i].cle === 'number') return { page: st.pageSizes[i].cle, fraction: i === pos.index ? pos.fraction : 1 };
    return { page: 1, fraction: 0 };
  };
  const basculerJumelle = (vers = null) => {
    if (!jumelle) return;
    const cible = vers || (surFiche ? 'original' : 'fiche');
    if ((cible === 'fiche') === surFiche) return;
    sauverRef.current(); // position du document qu'on quitte
    const pm = pageMapCourant(); // document : instantané pris ICI (texte et pagination du moment)
    if (modeDoc && fluxRef.current && fluxRef.current.editor && !fluxRef.current.editor.isDestroyed) {
      // le flux se démonte : il enregistre ce qui attend, et on le remontera avec CE texte
      fluxRef.current.vider();
      setFluxInitial(dehydrateDoc(fluxRef.current.editor.getJSON()));
    }
    const { page, fraction } = lirePagePdf();
    const r = pageCorrespondante(pm, page, surFiche);
    // vers le document : la page n est la n-ième page affichée (sa clé = l'id de l'enregistrement « page »)
    const cle = surFiche && modeDocCours ? ((instantDoc.current && instantDoc.current.cles[r.page - 1]) || null) : r.page;
    cibleBascule.current = { kind: surFiche && modeDocCours ? 'doc' : 'pdf', cle, fraction: r.exacte ? fraction : 0, scale, zoomManuel: zoomManuel.current };
    if (!r.exacte) setAvisJumelle(r.raison === 'ajoutee' ? `Page ${page} : page ajoutée dans la fiche — page ${r.page} de l’original, la plus proche` : `Page ${page} : sans équivalent dans la fiche — page ${r.page} de la fiche, la plus proche`);
    setVueJumelle(cible); ecrireVue(idFiche, cible);
  };
  const basculerRef = useRef(basculerJumelle); basculerRef.current = basculerJumelle;
  /* COURS DOCUMENT : la correspondance est stockée PAR BLOC (lib/ficheJumelle.js#pageMapDocument) et
     recalculée sur le texte et la pagination du moment. `instantDoc` : le dernier état connu du
     document (blocs, page de chaque bloc, clés des pages) — gardé quand la fiche est affichée. */
  const instantDoc = useRef(null);
  const prendreInstantDoc = () => {
    if (!modeDoc) return instantDoc.current;
    const ed = fluxRef.current && fluxRef.current.editor;
    if (ed && !ed.isDestroyed && pagination) {
      instantDoc.current = { blocs: blocsDuFlux(ed.getJSON()), pag: pagination.blocs, nb: pagination.nbPages, cles: pageSizesRef.current.map((sz) => sz.cle) };
    }
    return instantDoc.current;
  };
  useEffect(() => { if (modeDoc) prendreInstantDoc(); }, [pagination, modeDoc, pageSizes.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // sonde des tests (développement seulement) : correspondance calculée et instantané du document
  if (import.meta.env.DEV && typeof window !== 'undefined') window.__mrJumelle = { pageMapCourant: () => pageMapCourant(), instant: () => instantDoc.current, page: () => lirePagePdf() };
  const pageMapCourant = () => {
    if (!jumelle) return null;
    if (jumelle.pageMap.mode !== 'bloc') return jumelle.pageMap;
    const d = prendreInstantDoc();
    return d ? pageMapDocument(jumelle.pageMap, d, jumelle.nbPagesFiche) : jumelle.pageMap;
  };
  // raccourcis : Tab (hors texte et champ de saisie) ou ⌘⇧F / Ctrl+Maj+F (aussi en écrivant dans le document)
  useEffect(() => {
    if (!jumelle) return undefined;
    const onKey = (e) => {
      const tab = e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;
      const cmd = (e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && (e.key === 'f' || e.key === 'F' || e.code === 'KeyF');
      if (!tab && !cmd) return;
      if (dansLeTableau(e.target)) return;
      // Tab : jamais dans un texte (il y garde son rôle) ; ⌘⇧F : aussi depuis l'éditeur du document
      // (on y écrit presque tout le temps), mais pas dans un champ de saisie
      const champ = (el) => !!(el && el.closest && el.closest('input, textarea, select'));
      if (tab && (cibleEditable(e.target) || cibleEditable(document.activeElement))) return;
      if (cmd && (champ(e.target) || champ(document.activeElement))) return;
      if (tab && e.target && e.target.closest && e.target.closest('[role=dialog], .modal, .mf-menu, .sc-pop, .sc-fenetre, .day-pop')) return;
      e.preventDefault(); e.stopPropagation();
      basculerRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [!!jumelle]); // eslint-disable-line react-hooks/exhaustive-deps

  /* IMPORT / REMPLACEMENT de la fiche (menu Fichier) */
  const entreeJumelle = useRef(null);
  const [travailJumelle, setTravailJumelle] = useState(null); // { etat: 'encours' | 'fini' | 'erreur', remplacement, rec?, message? }
  const [editeurCorresp, setEditeurCorresp] = useState(false);
  const [listeNonReplacees, setListeNonReplacees] = useState(false);
  const recevoirJumelle = async (fichier) => {
    if (!fichier || !ficheReelle || !(fiche.pdfId || modeDocCours)) return;
    const instant = modeDocCours ? prendreInstantDoc() : null;
    if (modeDocCours && !instant) { setTravailJumelle({ etat: 'erreur', message: 'Le document n’est pas encore prêt — réessaie dans un instant' }); return; }
    // (16/10) mêmes règles que le principal : un PDF, taille limitée, un import à la fois (lib/fichiersCours.js)
    const errFichier = verifierFichiers([fichier], { images: false });
    if (errFichier) { setTravailJumelle({ etat: 'erreur', message: errFichier.replace(/\.$/, '') }); return; }
    const remplacement = !!jumelle;
    setTravailJumelle({ etat: 'encours', remplacement });
    try {
      sauverRef.current();
      const rec = await avecVerrou(remplacement ? 'remplacement de la fiche jumelle' : 'import de la fiche jumelle', () => (remplacement
        ? remplacerJumelle({ rec: jumelle, fichier, pdfIdOrig: fiche.pdfId, instantDoc: instant })
        : importerJumelle({ courseId: ficheReelle.id, fichier, pdfIdOrig: fiche.pdfId, instantDoc: instant })));
      setTravailJumelle({ etat: 'fini', remplacement, rec });
    } catch (e) {
      setTravailJumelle({ etat: 'erreur', remplacement, message: (e && e.message) || 'PDF illisible' });
    }
  };
  const resumeCorresp = (rec) => {
    const pm = rec === jumelle ? pageMapCourant() : rec.pageMap;
    return { appariees: pm.versOrig.filter((x) => x != null).length, ajoutees: pm.versOrig.filter((x) => x == null).length, sansEq: pm.versFiche.filter((x) => x == null).length,
      fusions: pm.versFiche.filter((f, i) => f != null && pm.versFiche.indexOf(f) !== i).length };
  };

  const minuteurPosition = useRef(null);
  const planifierPosition = () => { clearTimeout(minuteurPosition.current); minuteurPosition.current = setTimeout(() => sauverRef.current(), 500); };
  useEffect(() => {
    const el = scrollRef.current;
    if (!restaure || !el) return undefined;
    el.addEventListener('scroll', planifierPosition, { passive: true });
    return () => el.removeEventListener('scroll', planifierPosition);
  }, [restaure, pret]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (restaure) planifierPosition(); }, [scale, disposition]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const cache = () => { if (document.visibilityState === 'hidden') { clearTimeout(minuteurPosition.current); sauverRef.current(); } };
    document.addEventListener('visibilitychange', cache);
    window.addEventListener('pagehide', cache);
    return () => {
      document.removeEventListener('visibilitychange', cache);
      window.removeEventListener('pagehide', cache);
      clearTimeout(minuteurPosition.current);
      sauverRef.current(); // fermeture du cours
    };
  }, [ficheId]);
  useEffect(() => {
    const el = scrollRef.current;
    // tablette : ajusté à la largeur tant qu'on n'a pas zoomé à la main (page jamais rognée,
    // et suivie à la rotation) — un zoom manuel est gardé tel quel
    if (!(ajusterLargeur || modeTab) || !el || !pageSizes.length || typeof ResizeObserver === 'undefined') return undefined;
    const largeurPage = pageSizes.reduce((m, sz) => Math.max(m, sz.width), 0);
    let raf = null;
    const ajuster = () => {
      raf = null;
      if (zoomManuel.current) return;
      const dispo = el.clientWidth - 28; // marge pour l'ombre de page et la barre de défilement
      if (dispo < 120 || !largeurPage) return; // panneau masqué/replié : on garde le zoom actuel
      const cible = Math.max(0.4, Math.min(4, +(dispo / largeurPage).toFixed(3)));
      setScale((sc) => {
        if (Math.abs(sc - cible) <= 0.01) return sc;
        pendingScroll.current = el.scrollTop * (cible / sc); // garde le même endroit du cours à l'écran
        return cible;
      });
    };
    const ro = new ResizeObserver(() => { if (!raf) raf = requestAnimationFrame(ajuster); });
    ro.observe(el);
    ajuster();
    return () => { ro.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [ajusterLargeur, pageSizes, modeTab]);

  /* ZOOM FLUIDE (02/10) : plusieurs crans peuvent arriver AVANT le rendu suivant
     (animation des boutons, rafale de molette). On part donc de la DERNIÈRE échelle
     demandée (scaleRef) et du défilement déjà prévu (pendingScroll), pas de l'état
     du dernier rendu — sinon le point visé glissait sous le curseur. */
  const scaleRef = useRef(scale);
  const zoomAt = (clientY, newScaleRaw) => {
    abandonnerGesteZoom();
    zoomManuel.current = true;
    const el = scrollRef.current;
    const newScale = Math.max(0.4, Math.min(4, +newScaleRaw.toFixed(3)));
    const s0 = scaleRef.current || scale;
    scaleRef.current = newScale;
    if (!el) { setScale(newScale); return; }
    const rect = el.getBoundingClientRect();
    const cursorViewportY = clientY - rect.top;
    const base = pendingScroll.current != null ? pendingScroll.current : el.scrollTop;
    const contentYOld = base + cursorViewportY;
    pendingScroll.current = contentYOld * (newScale / s0) - cursorViewportY;
    setScale(newScale);
  };
  const zoomAtRef = useRef(zoomAt); zoomAtRef.current = zoomAt;
  // sonde des tests (développement seulement) : zoom exact (1 = 100 %), centré sur la zone de lecture
  if (import.meta.env.DEV && typeof window !== 'undefined') window.__mrZoom = (s) => { const el = scrollRef.current; const r = el && el.getBoundingClientRect(); zoomAtRef.current(r ? r.top + r.height / 2 : 0, s); };
  // boutons : une courte animation (180 ms) au lieu d'un saut de 15 %
  const animZoom = useRef(null);
  const animerZoom = (clientX, clientY, cible) => {
    if (animZoom.current) cancelAnimationFrame(animZoom.current);
    const depart = cibleZoom(), t0 = performance.now(), duree = 180;
    const pas = (t) => {
      const k = Math.min(1, (t - t0) / duree);
      const e = 1 - (1 - k) ** 3; // décélère en arrivant
      // (20/10) au geste : mise à l'échelle CSS image par image, UN seul vrai changement de zoom à la fin
      zoomGesteRef.current(clientX, clientY, depart * Math.pow(cible / depart, e), { fin: k >= 1 });
      animZoom.current = k < 1 ? requestAnimationFrame(pas) : null;
    };
    animZoom.current = requestAnimationFrame(pas);
  };

  /* ZOOM AU GESTE SANS FLASH (20/10, docs/compte-rendu-pdfreader-v3.md). Avant, chaque événement d'un
     pincement (des dizaines par seconde) changeait le zoom de tout le lecteur : nouveau rendu React de
     toutes les pages et de leurs annotations, nouvelle mise en page, à chaque image. Désormais, PENDANT le
     geste, le conteneur des pages (pages, couches de texte, annotations : tout) est mis à l'échelle par un
     `transform` CSS autour du point visé — le compositeur s'en charge, sans rendu ni mise en page. Le vrai
     zoom n'est posé qu'UNE fois, 140 ms après le dernier événement : la transformation est retirée et le
     défilement recalé dans la même image (useLayoutEffect), au pixel près ; les pages, déjà étirées à la
     bonne taille (PdfPage), se redessinent nettes en coulisse (double tampon). */
  const pagesRef = useRef(null);
  const gesteZoom = useRef(null); // { s0, s, ox, oy, Cw0, P, minuteur } — ox / oy : origine, dans le repère du conteneur des pages
  const commitGeste = useRef(null);
  const cibleZoom = () => (gesteZoom.current ? gesteZoom.current.s : (scaleRef.current || scale));
  const libelleZoom = (z) => { const r = racineRef.current; if (r) r.querySelectorAll('[data-zoom-libelle]').forEach((e) => { e.textContent = Math.round(z * 100) + '%'; }); };
  const abandonnerGesteZoom = () => {
    const g = gesteZoom.current;
    if (!g) return;
    clearTimeout(g.minuteur); gesteZoom.current = null;
    if (pagesRef.current) { pagesRef.current.style.transform = ''; }
    libelleZoom(scaleRef.current || scale);
  };
  const finirGesteZoom = () => {
    const g = gesteZoom.current;
    if (!g) return;
    clearTimeout(g.minuteur); gesteZoom.current = null;
    if (Math.abs(g.s - g.s0) < 0.0005) { abandonnerGesteZoomFin(); return; }
    // défilement AVANT le rendu du nouveau zoom : la nouvelle mise en page (plus petite au dézoom) le bornerait
    if (scrollRef.current) { g.st = scrollRef.current.scrollTop; g.sl = scrollRef.current.scrollLeft; }
    commitGeste.current = g;
    zoomManuel.current = true;
    scaleRef.current = g.s;
    setScale(g.s);
  };
  const abandonnerGesteZoomFin = () => { if (pagesRef.current) { pagesRef.current.style.transform = ''; } };
  // pages à monter pendant un dézoom au geste (la zone visible couvre plus de contenu) : jamais de trou
  const etendrePagesMontees = (g) => {
    const el = scrollRef.current, lay = layoutRef.current;
    const k = g.s / g.s0;
    if (!el || !lay || k >= 1) return;
    const re = el.getBoundingClientRect();
    const hautPages = re.top + g.P - el.scrollTop; // haut du conteneur des pages à l'écran (avant transformation)
    const haut = g.oy + (re.top - (hautPages + g.oy)) / k - el.clientHeight * 0.5;
    const bas = g.oy + (re.top + el.clientHeight - (hautPages + g.oy)) / k + el.clientHeight * 0.5;
    const tailles = pageSizesRef.current || [];
    let debut = 0, fin = lay.offsets.length - 1;
    for (let i = 0; i < lay.offsets.length; i++) { if (lay.offsets[i] + (tailles[i] ? tailles[i].height * g.s0 : 0) >= haut) { debut = i; break; } }
    for (let i = lay.offsets.length - 1; i >= 0; i--) { if (lay.offsets[i] <= bas) { fin = i; break; } }
    setVisibleRange((v) => (debut < v.start || fin > v.end ? { start: Math.min(debut, v.start), end: Math.max(fin, v.end) } : v));
  };
  const zoomGeste = (clientX, clientY, sBrut, { fin = false, delai = 140 } = {}) => {
    const el = scrollRef.current, pages = pagesRef.current;
    const ns = Math.max(0.4, Math.min(4, +sBrut.toFixed(3)));
    if (!el || !pages) { zoomAt(clientY, ns); return; }
    // le zoom de la fin du geste précédent est en train d'être posé (rendu React en cours) : cet événement
    // est ignoré — le repasser par zoomAt fausserait le recalage du défilement (saut constaté au pincement)
    if (commitGeste.current) return;
    let g = gesteZoom.current;
    if (!g) {
      const re = el.getBoundingClientRect(), rp = pages.getBoundingClientRect();
      // contenu plus large que la zone de lecture : on zoome sous le pointeur ; sinon autour du centre
      // horizontal du conteneur, là où la mise en page gardera les pages (aucun saut à la fin du geste)
      const large = pages.offsetWidth > el.clientWidth + 1;
      const ox = large ? clientX - rp.left : rp.width / 2, oy = clientY - rp.top;
      g = gesteZoom.current = { s0: scaleRef.current || scale, s: scaleRef.current || scale, ox, oy, Cw0: pages.offsetWidth, P: rp.top - re.top + el.scrollTop, minuteur: null };
      pages.style.transition = 'none'; // (un glissement de fin de geste en cours s'arrête là)
      pages.style.transformOrigin = `${ox}px ${oy}px`;
    }
    g.s = ns;
    pages.style.transform = `scale(${(ns / g.s0).toFixed(5)})`;
    libelleZoom(ns);
    etendrePagesMontees(g);
    clearTimeout(g.minuteur);
    if (fin) finirGesteZoom(); else if (Number.isFinite(delai)) g.minuteur = setTimeout(finirGesteZoom, delai);
  };
  const zoomGesteRef = useRef(zoomGeste); zoomGesteRef.current = zoomGeste;
  const finirGesteRef = useRef(finirGesteZoom); finirGesteRef.current = finirGesteZoom;
  useLayoutEffect(() => {
    // l'échelle rendue est la dernière demandée (setScale garde la plus récente) :
    // on resynchronise la référence, y compris après l'ajustement automatique à la largeur
    scaleRef.current = scale;
    const g = commitGeste.current;
    if (g && scrollRef.current && pagesRef.current) {
      // fin d'un geste (voir zoomGeste) : la transformation part, le défilement est recalé — même image
      commitGeste.current = null;
      const el = scrollRef.current, pages = pagesRef.current;
      const k = scale / g.s0;
      const st = g.st != null ? g.st : el.scrollTop, sl = g.sl != null ? g.sl : el.scrollLeft;
      pages.style.transform = '';
      const Cw1 = pages.offsetWidth;
      const hautVoulu = st + g.oy * (k - 1), gaucheVoulue = sl + Cw1 / 2 - g.ox + k * (g.ox - g.Cw0 / 2);
      el.scrollTop = Math.max(0, hautVoulu);
      el.scrollLeft = Math.max(0, gaucheVoulue);
      pendingScroll.current = null;
      /* défilement borné (bord du document, ou contenu redevenu plus étroit que la zone : la mise en page le
         recentre) : le reste est d'abord compensé par une translation, qui revient à zéro en glissant (160 ms) —
         un glissement plutôt qu'un saut */
      const dX = gaucheVoulue - el.scrollLeft, dY = hautVoulu - el.scrollTop;
      if (Math.abs(dX) > 0.5 || Math.abs(dY) > 0.5) {
        pages.style.transition = 'none';
        pages.style.transform = `translate(${(-dX).toFixed(2)}px, ${(-dY).toFixed(2)}px)`;
        requestAnimationFrame(() => {
          if (gesteZoom.current) return; // un nouveau geste a repris la main
          pages.style.transition = 'transform .16s ease-out'; pages.style.transform = '';
          const fin = () => { pages.style.transition = ''; pages.removeEventListener('transitionend', fin); };
          pages.addEventListener('transitionend', fin);
        });
      }
    } else if (pendingScroll.current != null && scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, pendingScroll.current);
      pendingScroll.current = null;
    }
    computeVisibleRange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);
  const zoomButtons = (factor) => {
    const el = scrollRef.current;
    const r = el ? el.getBoundingClientRect() : null;
    animerZoom(r ? r.left + el.clientWidth / 2 : 0, r ? r.top + el.clientHeight / 2 : 0, Math.max(0.4, Math.min(4, cibleZoom() * factor)));
  };
  const zoomButtonsRef = useRef(zoomButtons); zoomButtonsRef.current = zoomButtons;
  const ajusterRef = useRef(null); ajusterRef.current = () => ajusterALaLargeur();
  const racineRef = useRef(null);

  // Ctrl/Cmd + molette : écouteur natif non-passif (nécessaire pour que preventDefault
  // bloque bien le zoom natif du navigateur — un onWheel React seul n'y suffit pas
  // de façon fiable selon les versions/navigateurs).
  /* Molette / pincement : le facteur suit l'AMPLITUDE du geste (avant : ±10 % par
     événement, or un pincement de trackpad en émet des dizaines par seconde → zoom
     brutal et saccadé), et les événements d'une même image sont regroupés en un
     seul changement d'échelle. */
  /* TOUS LES ZOOMS PASSENT PAR LE LECTEUR (04/10) — cause racine des annotations
     qui « grandissaient au zoom » : seuls les ÉCHAPPÉS au lecteur faisaient zoomer
     le NAVIGATEUR (toute la page, boîtes, textes et barres compris). Le lecteur,
     lui, garde déjà boîtes / zones de texte / « ? » / poignées à taille d'écran fixe
     (unités de référence ÷ échelle). Échappaient : le pincement ou Ctrl+molette
     hors du conteneur de défilement (barre d'outils, panneau), l'écouteur resté
     accroché à un ancien conteneur après un changement d'affichage, ⌘+ / ⌘− / ⌘0,
     le pincement de Safari (événements « gesture », pas de molette) et le
     pincement à deux doigts sur écran tactile. Désormais, dans le lecteur, chacun
     est intercepté (preventDefault) et devient un zoom du PDF. Le tableau garde
     ses propres gestes. */
  useEffect(() => {
    if (!pret) return undefined;
    const dansLecteur = (t) => { const r = racineRef.current; return !!(r && t && t.nodeType === 1 ? r.contains(t) : r && t && r.contains(t.parentNode)); };
    const centreY = () => { const el = scrollRef.current; return el ? el.getBoundingClientRect().top + el.clientHeight / 2 : window.innerHeight / 2; };
    let cumul = 0, x = 0, y = 0, raf = null;
    const appliquer = () => {
      raf = null;
      const f = Math.exp(Math.max(-0.5, Math.min(0.5, cumul)));
      cumul = 0;
      const g = gesteZoom.current;
      zoomGesteRef.current(x, y, (g ? g.s : (scaleRef.current || 1)) * f);
    };
    const centreX = () => { const el = scrollRef.current; return el ? el.getBoundingClientRect().left + el.clientWidth / 2 : window.innerWidth / 2; };
    /* 1. pincement de trackpad (Chrome, Edge, Firefox : molette + ctrlKey) et Ctrl + molette.
       PAS ⌘ + molette (08/10, docs/audit-document-engine.md B9) : sur Mac ce n'est pas un
       geste de zoom, et l'INERTIE d'un défilement au trackpad continue d'émettre des
       événements de molette — appuyer sur ⌘ pendant ce temps (⌘Tab, ⌘A, ⌘C…) les
       transformait en zoom. ⌘ seul, ⌘Tab, ⌘A, ⌘C/V ne touchent jamais au zoom. */
    const onWheel = (e) => {
      if (!e.ctrlKey || !dansLecteur(e.target) || dansLeTableau(e.target)) return;
      e.preventDefault();
      if (animZoom.current) { cancelAnimationFrame(animZoom.current); animZoom.current = null; }
      const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY; // lignes → pixels
      cumul += -d * (Math.abs(d) < 25 ? 0.01 : 0.0018); // pincement (petits deltas) ou molette (crans)
      const el = scrollRef.current;
      y = el && el.contains(e.target) ? e.clientY : centreY();
      x = el && el.contains(e.target) ? e.clientX : centreX();
      if (!raf) raf = requestAnimationFrame(appliquer);
    };
    // 2. pincement de trackpad dans Safari : événements « gesture » (e.scale cumulé)
    let depart = null;
    const onGesteDebut = (e) => { if (!dansLecteur(e.target) || dansLeTableau(e.target)) { depart = null; return; } e.preventDefault(); depart = gesteZoom.current ? gesteZoom.current.s : (scaleRef.current || 1); };
    const onGeste = (e) => { if (depart == null) return; e.preventDefault(); const el = scrollRef.current; const dedans = el && el.contains(e.target) && Number.isFinite(e.clientY); zoomGesteRef.current(dedans ? e.clientX : centreX(), dedans ? e.clientY : centreY(), depart * (e.scale || 1), { delai: Infinity }); }; // fini à gestureend
    const onGesteFin = (e) => { if (depart == null) return; e.preventDefault(); depart = null; finirGesteRef.current(); };
    // 3. ⌘+ / ⌘− / ⌘0 (zoom du navigateur au clavier)
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key;
      if (!['+', '=', '-', '_', '0'].includes(k)) return;
      if (dansLeTableau(e.target) || dansLeTableau(document.activeElement)) return;
      if (!racineRef.current || !racineRef.current.isConnected) return;
      const t = e.target;
      if (!(dansLecteur(t) || t === document.body || t === document.documentElement)) return; // ailleurs dans l'écran (Bibliothèque) : zoom normal
      e.preventDefault();
      if (k === '0') ajusterRef.current();
      else zoomButtonsRef.current(k === '-' || k === '_' ? 1 / 1.15 : 1.15);
    };
    // 4. pincement à DEUX DOIGTS sur écran tactile (le navigateur zoomait la page)
    let pince = null;
    const ecart = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (e) => {
      if (e.touches.length !== 2 || !dansLecteur(e.target) || dansLeTableau(e.target)) { pince = null; return; }
      pince = { d0: ecart(e.touches) || 1, s0: gesteZoom.current ? gesteZoom.current.s : (scaleRef.current || 1) };
    };
    const onTouchMove = (e) => {
      if (!pince || e.touches.length !== 2) return;
      e.preventDefault();
      // doigts posés : le geste ne se termine qu'au lever (touchend), jamais sur une pause du pincement
      zoomGesteRef.current((e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2, pince.s0 * (ecart(e.touches) / pince.d0), { delai: Infinity });
    };
    const onTouchEnd = (e) => { if (e.touches.length < 2) { if (pince) finirGesteRef.current(); pince = null; } };
    const opts = { passive: false, capture: true };
    window.addEventListener('wheel', onWheel, opts);
    window.addEventListener('gesturestart', onGesteDebut, opts);
    window.addEventListener('gesturechange', onGeste, opts);
    window.addEventListener('gestureend', onGesteFin, opts);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('touchstart', onTouchStart, opts);
    window.addEventListener('touchmove', onTouchMove, opts);
    window.addEventListener('touchend', onTouchEnd, opts);
    window.addEventListener('touchcancel', onTouchEnd, opts);
    return () => {
      window.removeEventListener('wheel', onWheel, opts);
      window.removeEventListener('gesturestart', onGesteDebut, opts);
      window.removeEventListener('gesturechange', onGeste, opts);
      window.removeEventListener('gestureend', onGesteFin, opts);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('touchstart', onTouchStart, opts);
      window.removeEventListener('touchmove', onTouchMove, opts);
      window.removeEventListener('touchend', onTouchEnd, opts);
      window.removeEventListener('touchcancel', onTouchEnd, opts);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [pret]);

  /* SURLIGNAGE (08/10) : plus AUCUNE bulle sur un surlignage. En mode Sélection, un clic
     sur un passage surligné sélectionne le texte comme s'il n'y avait rien. Tout se fait
     au surligneur : repasser dans la même couleur retire, dans une autre recolore
     (commitHighlightAvec). Couleur et suppression restent aussi dans le mode Notions. */
  // la sélection en attente meurt avec la sélection du navigateur
  useEffect(() => {
    if (!pending) return undefined;
    const onSel = () => { const sel = window.getSelection(); if (!sel || sel.isCollapsed) setPending(null); };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, [pending]);

  /* Échap quitte l'outil en cours (Boîte, Texte, « ? », Crayon…) pour revenir à la
     Sélection. Si une boîte est en cours d'écriture, le PREMIER Échap la referme
     seulement (effet ci-dessous) : l'outil reste prêt pour la suivante. */
  const outilRef = useRef(outil); outilRef.current = outil;
  useEffect(() => {
    if (outil === 'main') return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.boiteRefermee || activeEditIdRef.current || ancrageRef.current) return;
      if (dansLeTableau(e.target)) return;
      if (cibleEditable(e.target)) return;
      choisirOutilRef.current('main');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [outil]);
  // (11/10) passer en mode focus (barre latérale, MedReviseApp.jsx) désélectionne la boîte
  useEffect(() => {
    const surFocus = () => { if (activeEditIdRef.current) setActiveEditId(null); setAncrage(null); };
    window.addEventListener('medrevise:focus', surFocus);
    return () => window.removeEventListener('medrevise:focus', surFocus);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Échap : désélectionner la boîte / le bloc actif (avant, seul « Terminé » le
  // permettait). Posé À PART des popovers ci-dessous, qui ont leur propre Échap.
  useEffect(() => {
    if (!activeEditId) return undefined;
    // marque l'événement : l'Échap qui referme une boîte ne quitte PAS aussi l'outil
    const onKey = (e) => { if (e.key === 'Escape') { e.boiteRefermee = true; setActiveEditId(null); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeEditId]);


  /* Avec l'outil SURLIGNEUR, une sélection surligne AUSSITÔT dans la couleur
     active. Avec l'outil SÉLECTION, rien ne s'affiche : on sélectionne pour
     copier, ou pour surligner ensuite en prenant le Surligneur (voir choisirOutil). */
  const handleCreateHighlightRequest = (payload) => {
    if (outil === 'surligneur') { commitHighlightAvec(payload, couleurSurligneur); return; }
    setPending(payload);
  };
  /* SURLIGNEUR SUR DU DÉJÀ SURLIGNÉ (08/10) — `p.touches` = ids des surlignages que la
     sélection recouvre, `p.segments` = les morceaux encore libres (soustraireAncres) :
     - rien de libre et tout ce qui est touché est DÉJÀ de cette couleur → on le RETIRE ;
     - sinon les surlignages touchés d'une AUTRE couleur prennent la couleur active, et
       les morceaux libres sont surlignés. Un seul geste = une seule entrée d'annulation. */
  const commitHighlightAvec = async (p, couleur) => {
    setPending(null);
    window.getSelection && window.getSelection().removeAllRanges();
    /* (10/10) À LA PORTION PRÈS (pdfShared#planSurlignage, calculé par la page) : même couleur
       sur du déjà surligné → retiré sur la portion repassée (scindé au besoin) ; autre couleur →
       la portion change de couleur, une seule couche ; même couleur voisine → fusion. */
    const plan = p.calculer ? p.calculer(couleur) : null;
    if (plan) {
      const parId = (id) => highlights.find((h) => h.id === id);
      const anciens = plan.sansAncre.map(parId).filter(Boolean);
      const retrait = plan.retrait && anciens.every((h) => h.couleur === couleur);
      const cmds = [
        ...[...plan.supprimer, ...plan.perdus].map(parId).filter(Boolean).map((h) => cmdSupprimer('highlights', h, 'Surlignage retiré')),
        ...plan.garder.map((g) => { const h = parId(g.id); return h && cmdModifier('highlights', h, { ...h, anchor: g.anchor, texte: g.texte, rects: g.rects }, 'Surlignage ajusté'); }).filter(Boolean),
        ...plan.creer.map((c) => cmdCreer('highlights', newHighlight({ ficheId: nsAnnot, page: p.page, texte: c.texte, couleur: c.couleur, rects: c.rects, anchor: c.anchor }), 'Surlignage')),
        ...anciens.map((h) => (retrait ? cmdSupprimer('highlights', h, 'Surlignage retiré') : h.couleur !== couleur ? cmdModifier('highlights', h, { ...h, couleur }, 'Couleur du surlignage') : null)).filter(Boolean),
      ];
      if (cmds.length) await hist.appliquer(cmdGroupe(plan.retrait ? 'Surlignage retiré' : 'Surlignage', cmds));
      return;
    }
    const morceaux = Array.isArray(p.segments) ? p.segments : [{ texte: p.texte, rects: p.rects, anchor: p.anchor }];
    const touches = (p.touches || []).map((id) => highlights.find((h) => h.id === id)).filter(Boolean);
    if (!morceaux.length && touches.length && touches.every((h) => h.couleur === couleur)) {
      await hist.appliquer(cmdGroupe('Surlignage retiré', touches.map((h) => cmdSupprimer('highlights', h, 'Surlignage retiré'))));
      return;
    }
    const cmds = [
      ...touches.filter((h) => h.couleur !== couleur).map((h) => cmdModifier('highlights', h, { ...h, couleur }, 'Couleur du surlignage')),
      ...morceaux.map((m) => cmdCreer('highlights',
        newHighlight({ ficheId: nsAnnot, page: p.page, texte: m.texte, couleur, rects: m.rects, anchor: m.anchor }), 'Surlignage')),
    ];
    if (!cmds.length) return;
    await hist.appliquer(cmdGroupe('Surlignage', cmds));
  };

  /* MOTS D'UNE IMAGE COLLÉE (09/10, docs/compte-rendu-pdfreader-v2.md) : un surlignage = un
     enregistrement `highlights` ordinaire (panneau Notions, exports, synchro) qui porte en plus
     `imageId` + `mots` (indices des mots OCR de l'image) — dessiné par l'image, il la suit.
     `rects` = position approximative sur la page au moment de la pose (tri, défilement).
     Même règle que sur le texte : même couleur sans mot neuf → retiré, sinon recoloré + posé. */
  // `ajouter` (bulle « Notion ») : ne fait que poser les mots encore libres — jamais de retrait
  const surlignerMotsImage = async (p, couleur, { ajouter = false } = {}) => {
    /* (10/10) à la portion près, une seule couche (lib/resurlignage.js#planMots) */
    if (!ajouter && p.texteDe && p.rectsDe) {
      const siens = highlights.filter((h) => h.imageId === p.img.id);
      const plan = planMots(p.mots, siens, couleur);
      const parId = (id) => siens.find((h) => h.id === id);
      const cmds = [
        ...plan.supprimer.map(parId).filter(Boolean).map((h) => cmdSupprimer('highlights', h, 'Surlignage retiré')),
        ...plan.garder.map((g) => { const h = parId(g.id); return h && cmdModifier('highlights', h, { ...h, mots: g.mots, texte: p.texteDe(g.mots), rects: p.rectsDe(g.mots) }, 'Surlignage ajusté'); }).filter(Boolean),
        ...plan.creer.map((c) => cmdCreer('highlights', { ...newHighlight({ ficheId: nsAnnot, page: p.page, texte: p.texteDe(c.mots), couleur: c.couleur, rects: p.rectsDe(c.mots) }), imageId: p.img.id, mots: c.mots }, 'Surlignage')),
      ];
      if (cmds.length) await hist.appliquer(cmdGroupe(plan.retrait ? 'Surlignage retiré' : 'Surlignage', cmds));
      return;
    }
    const choisis = new Set(p.mots);
    const touches = ajouter ? [] : highlights.filter((h) => h.imageId === p.img.id && (h.mots || []).some((i) => choisis.has(i)));
    const pris = new Set((ajouter ? highlights.filter((h) => h.imageId === p.img.id) : touches).flatMap((h) => h.mots || []));
    const libres = p.mots.filter((i) => !pris.has(i));
    if (!libres.length && touches.length && touches.every((h) => h.couleur === couleur)) {
      await hist.appliquer(cmdGroupe('Surlignage retiré', touches.map((h) => cmdSupprimer('highlights', h, 'Surlignage retiré'))));
      return;
    }
    const idx = p.mots.map((i, k) => (libres.includes(i) ? k : -1)).filter((k) => k >= 0);
    const cmds = [
      ...touches.filter((h) => h.couleur !== couleur).map((h) => cmdModifier('highlights', h, { ...h, couleur }, 'Couleur du surlignage')),
      ...(libres.length ? [cmdCreer('highlights', {
        ...newHighlight({ ficheId: nsAnnot, page: p.page, texte: idx.length === p.mots.length ? p.texte : libres.map((i) => p.texte.split(' ')[p.mots.indexOf(i)]).join(' '), couleur, rects: idx.map((k) => p.rects[k]).filter(Boolean) }),
        imageId: p.img.id, mots: libres,
      }, 'Surlignage')] : []),
    ];
    if (cmds.length) await hist.appliquer(cmdGroupe('Surlignage', cmds));
  };

  // recherche temps réel (debounce léger) : matching textuel sur une carte de position
  // indépendante du DOM (toutes pages) — la géométrie exacte est calculée séparément,
  // par page montée, via computeMatchRectsFromDom (Chantier 2).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    const q = debouncedSearch.trim().toLowerCase();
    if (q && modeDoc && fluxRef.current && fluxRef.current.editor) {
      /* DOCUMENT, moteur paginé : on cherche dans le FLUX (état de l'éditeur, la seule source),
         dans l'ordre du DOM — la n-ième occurrence est montrée par l'éditeur lui-même */
      const found = [];
      let rang = 0;
      const w = (n) => {
        if (n.type === 'text' && n.text) { const t = n.text.toLowerCase(); let i = t.indexOf(q); while (i !== -1) { found.push({ page: null, doc: true, flux: true, rang: rang++, idx: found.length }); i = t.indexOf(q, i + 1); } }
        if (n.type === 'image' && n.attrs && n.attrs.ocr && n.attrs.ocr.mots) for (const m of n.attrs.ocr.mots) { const t = String(m.t || '').toLowerCase(); let i = t.indexOf(q); while (i !== -1) { found.push({ page: null, doc: true, flux: true, rang: rang++, idx: found.length }); i = t.indexOf(q, i + 1); } }
        (n.content || []).forEach(w);
      };
      w(fluxRef.current.editor.getJSON());
      setMatches(found); setActiveMatch(0); setSearching(false);
      return;
    }
    if (q && modeDoc) {
      // DOCUMENT (08/10) : on cherche dans le texte des pages (nœuds texte du JSON, dans l'ordre)
      const found = [];
      pageSizesRef.current.forEach((sz) => {
        const corps = corpsPages.current[sz.cle];
        if (!corps) return;
        const blocs = (corps.content || []).length || 1;
        let rang = 0;
        (corps.content || []).forEach((bloc, iBloc) => {
          const w = (n) => {
            if (n.type === 'text' && n.text) {
              const t = n.text.toLowerCase();
              let i = t.indexOf(q);
              while (i !== -1) { found.push({ page: sz.cle, doc: true, rang: rang++, approxY: Math.min(0.9, 0.07 + (iBloc / blocs) * 0.86) }); i = t.indexOf(q, i + 1); }
            }
            // texte reconnu dans une IMAGE (Texte en direct) : un mot = un nœud texte du calque,
            // dans le même ordre qu'à l'écran — la n-ième occurrence est la même des deux côtés
            if (n.type === 'image' && n.attrs && n.attrs.ocr && n.attrs.ocr.mots) {
              for (const m of n.attrs.ocr.mots) {
                const t = String(m.t || '').toLowerCase();
                let i = t.indexOf(q);
                while (i !== -1) { found.push({ page: sz.cle, doc: true, rang: rang++, approxY: Math.min(0.9, 0.07 + (iBloc / blocs) * 0.86) }); i = t.indexOf(q, i + 1); }
              }
            }
            (n.content || []).forEach(w);
          };
          w(bloc);
        });
      });
      found.forEach((m, i) => { m.idx = i; });
      setMatches(found); setActiveMatch(0); setSearching(false);
      return;
    }
    if (!q || !pdfDoc) { setMatches([]); setActiveMatch(0); return; }
    setSearching(true);
    (async () => {
      const found = [];
      for (let n = 1; n <= numPages; n++) {
        if (cancelled) return;
        if (!textMapCache.current[n]) textMapCache.current[n] = await computePageTextMap(pdfDoc, n, ocrPagePour(n));
        const items = textMapCache.current[n];
        items.forEach((it, itemIdx) => {
          const s = it.str.toLowerCase();
          let idx = s.indexOf(q);
          while (idx !== -1) {
            found.push({ page: n, itemIdx, charStart: idx, charEnd: idx + q.length, approxY: it.y0 });
            idx = s.indexOf(q, idx + 1);
          }
        });
      }
      if (cancelled) return;
      found.forEach((m, i) => { m.idx = i; });
      setMatches(found);
      setActiveMatch(0);
      setSearching(false);
    })();
    return () => { cancelled = true; };
  }, [debouncedSearch, pdfDoc, numPages, coucheOcr, modeDoc]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!matches.length) { if (modeDoc) effacerSurlignageRecherche(); return; }
    const m = matches[Math.max(0, Math.min(activeMatch, matches.length - 1))];
    if (m && m.flux) { // flux : jamais virtualisé, l'occurrence est toujours dans le DOM
      const r = fluxRef.current && fluxRef.current.montrerOccurrence(debouncedSearch.trim(), m.rang);
      centrerRect(r);
      return;
    }
    if (m) scrollToPageFraction(m.page, m.approxY);
    // document : la page affichée surligne l'occurrence et la centre (sans prendre le focus)
    if (m && m.doc) {
      const viser = (essai) => setTimeout(() => {
        const api = pagesTexte.current.get(m.page);
        if (!(api && api.montrerOccurrence(debouncedSearch.trim(), m.rang)) && essai < 8) viser(essai + 1);
      }, 90);
      viser(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMatch, matches]);

  // amène un rectangle (coordonnées écran) au milieu de la zone de lecture — geste explicite
  // de l'utilisateur (recherche, notion) : jamais pendant la frappe
  const centrerRect = (r) => {
    const el = scrollRef.current;
    if (!el || !r) return;
    const z = el.getBoundingClientRect();
    if (r.top >= z.top + 40 && r.bottom <= z.bottom - 40) return;
    el.scrollTop = Math.max(0, el.scrollTop + (r.top + r.height / 2) - (z.top + el.clientHeight / 2));
    computeVisibleRangeRef.current();
  };
  const gotoNextMatch = () => { if (matches.length) setActiveMatch((i) => (i + 1) % matches.length); };
  const gotoPrevMatch = () => { if (matches.length) setActiveMatch((i) => (i - 1 + matches.length) % matches.length); };
  const closeSearch = () => { setSearch(''); setDebouncedSearch(''); setMatches([]); };

  // étape 4 — MÊME FORMAT QUE LES FICHES HTML (voir lib/pdfCourseText.js) :
  // « Copier les notions » = le texte structuré de « Copier pour un prompt » du gabarit
  // (cours entier, passages surlignés en [PRIORITAIRE], notes, tableaux) ;
  // « Tout exporter » = le JSON medrevise_cours_export v1, construit par la même fonction
  // que pour une fiche HTML (buildCourseExportFromParts).
  const pdfParts = () => pdfCourseParts(pdfDoc, highlights, { normalize: pdfjsLib.normalizeUnicode });
  const copyPriority = async () => {
    if (!pdfDoc) return;
    try {
      const { texteStructure } = await pdfParts();
      await navigator.clipboard.writeText(texteStructure);
      setCopiedCount(highlights.length || -1);
      setTimeout(() => setCopiedCount(0), 2200);
    } catch (e) { /* ignore */ }
  };
  // « Copié ✓ » du bouton « Tout exporter » de la barre PDF. Cet état existait aussi
  // dans la branche HTML, qui a son propre exemplaire depuis l'extraction (étape 4) :
  // les deux branches ne coexistent jamais, le partager n'avait aucun sens.
  const [courseExportOk, setCourseExportOk] = useState(false);
  const [promptsOuverts, setPromptsOuverts] = useState(false);
  const [detacherPdf, setDetacherPdf] = useState(false);
  const exportAllPdfCourse = async () => {
    if (!pdfDoc || !fiche) return;
    try {
      const { texteStructure, surlignages } = await pdfParts();
      const matiereNom = (db.matieres.find((m) => m.id === fiche.matiereId) || {}).nom || '';
      const cartes = db.questions.filter((q) => q.ficheId === ficheId && (q.type === 'qcm' || q.type === 'flashcard'));
      const payload = buildCourseExportFromParts({ fiche, matiereNom, texteStructure, surlignages, cartes });
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCourseExportOk(true);
      setTimeout(() => setCourseExportOk(false), 2200);
    } catch (e) { /* ignore */ }
  };
  const copyLabel = copiedCount > 0
    ? `${copiedCount} notion${copiedCount > 1 ? 's' : ''} copiée${copiedCount > 1 ? 's' : ''}`
    : copiedCount < 0 ? 'Cours copié' : 'Copier les notions';
  const copyTitle = 'Cours en texte structuré, passages surlignés en [PRIORITAIRE] et notes — même format que « Copier pour un prompt » du gabarit HTML';

  /* MENU « ⋯ Document ». Huit contrôles qui encombraient la barre alors qu'on
     s'en sert rarement — et dont cinq n'existent que pour une vraie fiche. Les
     deux boutons « Voir les prompts » identiques côte à côte deviennent deux
     entrées nommées. « Tout exporter » et « Copier les notions » se retrouvent
     voisines, là où leur parenté se voit. */
  const [demandeRenommer, setDemandeRenommer] = useState(0); // « Renommer… » du menu Fichier
  const actionsDocument = [
    { label: exporting ? 'Export en cours…' : 'Exporter le PDF annoté', icon: 'filePdf',
      onClick: () => { if (!exporting) exportAnnotated(); } },
    { label: copiedCount ? 'Notions copiées ✓' : 'Copier les notions', icon: 'copy', onClick: copyPriority },
    canAddItem && { label: courseExportOk ? 'Copié ✓' : 'Tout exporter (JSON)', icon: 'copy', onClick: exportAllPdfCourse },
    // (05/10) « Ajouter un item » / « Importer des items » retirés : le mode Exercices du
    // panneau les porte (« Ajouter », « ⋯ › Coller du JSON ») — audit UX M5
    // UNE entrée au lieu de deux boutons identiques côte à côte : AllPromptsModal
    // réunit déjà les 8 prompts (4 théorie + 4 exercices), et c'est le même
    // stockage que les anciens boutons — rien ne change pour le contenu.
    canAddItem && { label: 'Prompts (théorie et exercices)', icon: 'layers', onClick: () => setPromptsOuverts(true) },
    !!fiche.htmlId && { label: 'Voir la fiche HTML', icon: 'fileHtml', onClick: () => setSrcTab('html') },
    // l'ancien bouton « Remplacer » de la popover de sélection, qui n'existe plus
    !!pending && { label: 'Remplacer le texte sélectionné', icon: 'edit', onClick: () => startEditFromSelection() },
    // retire le LIEN vers le PDF (la fiche, ses cartes et ses annotations restent) — confirmation
    // (16/10) « Détacher le PDF » retiré : un cours garde son document principal (le remplacer : Fichiers du cours)
  ];


  /* MENU « FICHIER » UNIQUE (15/10, pdf/MenuFichier.jsx, docs/compte-rendu-bibliotheque-fichier.md) :
     la MÊME liste, dans le même ordre, sur toutes les pages — cours PDF, document, fiche jumelle,
     onglet Notes, fiche HTML. Une entrée qui ne s'applique pas est grisée avec sa raison, jamais
     masquée. Ce qui n'est pas dans la liste a rejoint sa place naturelle :
     correspondance des pages → pastille « Pages » de l'entrée « fiche jumelle » (et, de là,
     les annotations non replacées) ; couche OCR → fenêtre
     « Reconnaissance de texte » ; version des textes → panneau des textes (volet Affichage) ;
     fond de page → « Mise en page » ; copier les notions, cours complet en JSON, prompts →
     « Export spécial IA » (prompts aussi dans le ⋯ des Exercices) ; détacher le PDF →
     « Supprimer… » ; voir la fiche HTML / le PDF → bascule PDF · HTML de l'en-tête ;
     remplacer la sélection → ⋯ de la barre d'outils, quand du texte est sélectionné. */
  const estHtml = srcTab === 'html';
  const pasCeDocument = { indispo: 'Non disponible pour ce document' };
  const jumelleDispo = canAddItem && !!(fiche && (fiche.pdfId || modeDocCours));
  const [supprimerOuvert, setSupprimerOuvert] = useState(false);
  const [fichiersOuvert, setFichiersOuvert] = useState(!!ouvrirFichiers); // (16/10) Bibliothèque › ⋯ › « Fichiers du cours… » ouvre le cours sur cet écran
  const [fichiersDemarrer, setFichiersDemarrer] = useState(null); // (17/10) 'remplacer' : Fichier › Diapo › « Remplacer ce fichier… »
  const [suppressionDoc, setSuppressionDoc] = useState(null); // (17/10) null | 'original' | 'fiche' | 'refus'
  const [nonReplaceesPrincipal, setNonReplaceesPrincipal] = useState(null);
  /* (17/10) MENU FICHIER EN SECTIONS (pdf/MenuFichier.jsx, docs/compte-rendu-fichier-carnet-calendrier.md) :
     « Cours », puis « Diapo originale — <nom> » et « Fiche — <nom> », mêmes actions dans les deux.
     Une action de CONTENU (exporter, export IA, textes, reconnaissance, mise en page) de la section
     NON affichée affiche d'abord ce document, puis part quand il est prêt (PDF chargé, annotations
     de SON calque lues) ; remplacer, supprimer, correspondance agissent directement. */
  const principal = principalDe(ficheReelle || fiche);
  const typeOrig = estHtml ? 'html' : principal.type; // 'pdf' | 'document' | 'html' | null
  const cleAffichee = surFiche ? 'fiche' : 'original';
  const actionEnAttente = useRef(null);
  const pretPourAction = () => (modeDoc
    ? !!(fluxRef.current && fluxRef.current.editor && !fluxRef.current.editor.isDestroyed && pagination)
    : !!(pdfDoc && pdfDocDe.current === pdfIdActif && nsCharge.current.hl === nsAnnot && nsCharge.current.ed === nsAnnot));
  const pretRef = useRef(pretPourAction); pretRef.current = pretPourAction;
  const documentsRef = useRef([]);
  const lancerEnAttente = (q) => {
    const d = documentsRef.current.find((x) => x.cle === q.cle);
    const act = d && d.actions[q.id];
    const x = q.choix ? act && act.choix && act.choix[q.choix] : act;
    if (x && x.onClick && !x.indispo) x.onClick();
  };
  const differer = (q) => {
    actionEnAttente.current = q; basculerJumelle(q.cle);
    const t0 = Date.now();
    const tick = () => {
      if (actionEnAttente.current !== q) return;
      if (Date.now() - t0 > 10000) { actionEnAttente.current = null; return; }
      if (!pretRef.current()) { setTimeout(tick, 120); return; }
      actionEnAttente.current = null;
      setTimeout(() => lancerEnAttente(q), 200);
    };
    setTimeout(tick, 150);
  };
  /* les actions de contenu d'un document, selon son type ; `affiche` : directes, sinon différées */
  const actionsContenu = (cle, type, affiche) => {
    const viaBascule = (id, choix = null) => ({ onClick: () => differer({ cle, id, choix }) });
    const direct = (fn, id, choix) => (affiche ? { onClick: fn } : viaBascule(id, choix));
    if (type === 'html' || !type) {
      const n = { indispo: type ? 'Non disponible pour une fiche HTML' : 'Ce cours n’a pas de diapo' };
      return { pdfAnnote: n, formats: n, exportIA: n, textes: n, ocr: n };
    }
    const textes = { choix: { exporter: direct(() => setPanneauTextes('exporter'), 'textes', 'exporter'), importer: direct(() => setPanneauTextes('importer'), 'textes', 'importer') } };
    if (type === 'document') {
      return {
        pdfAnnote: direct(() => imprimerDocument(), 'pdfAnnote'),
        formats: { choix: { md: direct(() => exporterMdDocument(), 'formats', 'md'), png: { indispo: 'Pas de PNG pour un document créé dans l’app : « Exporter le document annoté » en PDF' } } },
        exportIA: { indispo: 'Non disponible pour un document créé dans l’app' },
        textes,
        ocr: { indispo: 'Un document créé dans l’app est déjà du texte' },
        miseEnPage: direct(() => setMiseEnPage(true), 'miseEnPage'),
      };
    }
    return {
      pdfAnnote: affiche ? { onClick: () => { if (!exporting) exportAnnotated(); }, etat: exporting ? 'en cours…' : null } : viaBascule('pdfAnnote'),
      formats: { choix: { md: direct(() => exporterMdPdf(), 'formats', 'md'), png: direct(() => exporterPngPages(), 'formats', 'png') } },
      exportIA: direct(() => setPanneauExportIA(true), 'exportIA'),
      textes,
      ocr: affiche ? (pdfIdActif ? { onClick: () => setDetailOcr(true), etat: libelleOcr().replace('Reconnaissance de texte : ', '').replace(/ \(PDF déjà en texte\)$/, '') } : { indispo: 'Diapo pas encore chargée' }) : viaBascule('ocr'),
    };
  };
  const coursFichier = {
    renommer: ficheReelle ? { onClick: () => setDemandeRenommer((n) => n + 1) } : pasCeDocument,
    fichiers: ficheReelle ? { onClick: () => { setFichiersDemarrer(null); setFichiersOuvert(true); } } : pasCeDocument,
    supprimer: ficheReelle ? { onClick: () => setSupprimerOuvert(true) } : pasCeDocument,
  };
  const docOriginal = {
    cle: 'original',
    role: typeOrig === 'document' ? 'Document original' : typeOrig === 'html' ? 'Fiche HTML' : 'Diapo originale',
    court: typeOrig === 'document' ? 'document' : 'diapo', genre: typeOrig === 'document' ? 'm' : 'f',
    icone: typeOrig === 'document' ? 'edit' : typeOrig === 'html' ? 'fileHtml' : 'filePdf',
    nom: typeOrig === 'html' ? (fiche.htmlName || fiche.titre || 'fiche.html') : typeOrig === 'document' ? (fiche.titre || 'Document') : (principal.nom || '—'),
    affiche: cleAffichee === 'original',
    actions: {
      ...actionsContenu('original', typeOrig, cleAffichee === 'original'),
      remplacer: !ficheReelle ? pasCeDocument
        : typeOrig === 'document' ? { indispo: 'Un document créé dans l’app se modifie directement : il n’a pas de fichier à remplacer' }
          : typeOrig === 'pdf' || principal.type === 'html' ? { onClick: () => { setFichiersDemarrer('remplacer'); setFichiersOuvert(true); } } : { indispo: 'Ce cours n’a pas de diapo' },
      supprimer: !ficheReelle ? pasCeDocument
        : jumelle && principal.type === 'pdf' ? { onClick: () => setSuppressionDoc('refus'), title: 'Refusé tant qu’une fiche est rattachée à cette diapo' }
          : principal.type === 'pdf' && !estHtml ? { onClick: () => setSuppressionDoc('original') }
            : typeOrig === 'document' ? { indispo: 'Un document créé dans l’app est le cours lui-même : « Supprimer le cours… » dans la section Cours' }
              : { indispo: 'Non disponible pour une fiche HTML' },
    },
  };
  const docFiche = jumelle ? {
    cle: 'fiche', role: 'Fiche', court: 'fiche', genre: 'f', icone: 'filePdf', nom: jumelle.fileName || 'fiche.pdf', affiche: cleAffichee === 'fiche',
    actions: {
      ...actionsContenu('fiche', 'pdf', cleAffichee === 'fiche'),
      correspondance: { onClick: () => setEditeurCorresp(true),
        title: (() => { const r = resumeCorresp(jumelle); return `Correspondance des pages — ${r.appariees} associées · ${r.ajoutees} ajoutée${r.ajoutees > 1 ? 's' : ''} dans la fiche${jumelle.pageMap.manuel ? ' · corrigée' : ''}`; })() },
      remplacer: { onClick: () => entreeJumelle.current && entreeJumelle.current.click(), title: 'Nouvelle version de la fiche : ses annotations suivent leur page' },
      supprimer: { onClick: () => setSuppressionDoc('fiche') },
    },
  } : {
    cle: 'fiche', role: 'Fiche', court: 'fiche', genre: 'f', icone: 'filePdf', vide: true, affiche: false,
    actions: { importer: jumelleDispo ? { onClick: () => entreeJumelle.current && entreeJumelle.current.click() }
      : { indispo: estHtml || principal.type === 'html' ? 'Non disponible pour une fiche HTML' : !ficheReelle ? 'Non disponible pour ce document' : 'Importe d’abord la diapo originale' } },
  };
  const documentsFichier = [docOriginal, docFiche];
  documentsRef.current = documentsFichier;
  const propsFichier = { cours: coursFichier, documents: documentsFichier };
  /* remplacer le texte sélectionné : ⋯ de la barre d'outils, seulement quand il y a une sélection */
  const actionsSelection = [!!pending && !modeDoc && { label: 'Remplacer le texte sélectionné', icon: 'edit', onClick: () => startEditFromSelection() }];
  /* état de la reconnaissance de texte, en une ligne (menu Fichier) */
  function libelleOcr() {
    const enCours = etatOcr.courant && fiche && etatOcr.courant.pdfId === pdfIdActif;
    if (!coucheOcr) return enCours ? 'Reconnaissance de texte : en cours…' : 'Reconnaissance de texte : non lancée';
    const st = statsCouche(coucheOcr);
    if (coucheOcr.status !== 'complete') return `Reconnaissance de texte : en cours ${st.faites}/${coucheOcr.pageCount} pages`;
    if (!st.ocr) return 'Reconnaissance de texte : inutile (PDF déjà en texte)';
    return `Reconnaissance de texte : terminée · ${st.confiance} %${st.faibles.length ? ` · ${st.faibles.length} page${st.faibles.length > 1 ? 's' : ''} peu sûre${st.faibles.length > 1 ? 's' : ''}` : ''}`;
  }
  const entete = () => (
    <div className="lecteur-entete doc">
      <div className="doc-bloc">
        <TitreRenommable titre={fiche && fiche.titre} demandeEdition={demandeRenommer}
          onRenommer={ficheReelle ? (t) => ctx.renameFiche(ficheReelle.id, t) : null}
          sousTitre={nbPagesAffichees ? `${nbPagesAffichees} page${nbPagesAffichees > 1 ? 's' : ''}` : null} />
        <MenuFichier {...propsFichier} />
      </div>
      <div className="lecteur-entete-droite">
        {selecteurDispo}
        {/* (08/10) thème, réglages et synchro : menu de l'avatar, en bas de la barre de navigation */}
      </div>
    </div>
  );
  const afficherEntete = !embedded || avecEntete;
  const tableauDispo = afficherEntete && srcTab === 'pdf' && !!fiche;

  /* ---- TABLETTE (07/10) ---- */
  const nbLignesDirect = () => {
    const e = etatTranscription();
    return e && e.session && e.courseId === ficheId ? e.session.segments.filter((x) => x.status !== 'gap').length : 0;
  };
  // repli du panneau : on retient le nombre de lignes, la colonne fine affiche les nouvelles
  const replierPanneau = (replier) => { if (replier) setDepuisRepli(nbLignesDirect()); setPanelOpen(!replier); };
  /* CURSEUR « TÉLÉPORTÉ » (08/10, docs/compte-rendu-tablette-document-transcript.md) : ces deux
     gestionnaires (focus d'un champ, clavier virtuel) faisaient `scrollIntoView` sur l'élément
     focalisé. Pour une page de document, c'est l'ÉDITEUR DE LA PAGE ENTIÈRE (plus haut que la
     zone visible) : « nearest » réalignait le haut de la page, « center » centrait une page
     A4 → la vue sautait vers une autre page à chaque tap. On ne vise plus que le CURSEUR, et
     seulement s'il est caché : décalage minimal du conteneur qui défile, rien sinon. */
  const montrerSaisie = (el, mode) => {
    try {
      if (!el || !el.isConnected) return;
      if (!el.isContentEditable) { el.scrollIntoView({ block: mode }); return; } // petit champ : comme avant
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount || !el.contains(sel.focusNode)) return;
      const rg = sel.getRangeAt(0).cloneRange(); rg.collapse(false);
      let rc = rg.getClientRects()[0] || rg.getBoundingClientRect();
      if (!rc || (!rc.height && !rc.top)) { const n = sel.focusNode && (sel.focusNode.nodeType === 1 ? sel.focusNode : sel.focusNode.parentElement); if (n) rc = n.getBoundingClientRect(); }
      if (!rc) return;
      let sc = el.parentElement;
      while (sc && !(sc.scrollHeight > sc.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
      if (!sc) return;
      const v = sc.getBoundingClientRect(), vv = window.visualViewport;
      const haut = v.top + 24, bas = Math.min(v.bottom, vv ? vv.height + vv.offsetTop : window.innerHeight) - 24;
      if (rc.top >= haut && rc.bottom <= bas) return; // déjà visible : on ne bouge pas
      sc.scrollTop += rc.bottom > bas ? (mode === 'center' ? rc.bottom - (haut + bas) / 2 : rc.bottom - bas) : rc.top - haut;
    } catch (e) { /* ignore */ }
  };
  /* HAUTEUR : le lecteur occupe exactement la hauteur visible restante (plus de défilement
     de l'écran entier, barres comprises). Suit la hauteur VISIBLE (visualViewport) : clavier
     virtuel ouvert, le lecteur rétrécit et le champ en cours est ramené au centre. */
  useLayoutEffect(() => {
    const r = racineRef.current;
    if (!modeTab || !r) return undefined;
    const vv = window.visualViewport;
    let raf = null;
    const maj = () => {
      raf = null;
      const h = vv ? vv.height + vv.offsetTop : window.innerHeight;
      const top = r.getBoundingClientRect().top;
      r.style.setProperty('--tab-h', Math.max(320, Math.round(h - Math.max(0, top) - 8)) + 'px');
    };
    const plan = () => { if (!raf) raf = requestAnimationFrame(maj); };
    const clavier = () => {
      plan();
      const a = document.activeElement;
      if (a && r.contains(a) && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) {
        setTimeout(() => montrerSaisie(a, 'center'), 60);
      }
    };
    maj();
    window.addEventListener('resize', plan);
    if (vv) vv.addEventListener('resize', clavier);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(plan) : null;
    if (ro) ro.observe(r);
    // un champ qui prend le focus (note, flashcard) : visible même si le clavier était déjà ouvert
    const focus = (ev) => { const t = ev.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t.tagName))) setTimeout(() => montrerSaisie(t, 'nearest'), 300); };
    r.addEventListener('focusin', focus);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', plan);
      if (vv) vv.removeEventListener('resize', clavier);
      if (ro) ro.disconnect();
      r.removeEventListener('focusin', focus);
      r.style.removeProperty('--tab-h');
    };
  }, [modeTab]);
  /* VOLET DU BAS (tablette, portrait comme paysage — 08/10) : le panneau monte depuis le
     bas, le PDF reste visible AU-DESSUS sur toute sa largeur (zoom inchangé, page gardée).
     SÉPARATEUR horizontal glissable : écrit dans le DOM pendant le geste (aucun rendu
     React), enregistré au relâcher (fraction de la hauteur, mémorisée par appareil) ;
     - relâché tout en haut (≥ 90 %) → PLEIN ÉCRAN (PDF masqué) ;
     - depuis le plein écran, un geste vers le bas → retour à la hauteur mémorisée ;
     - glissé sous le minimum → volet FERMÉ (poignée en bas).
     Poignée (volet fermé) : un tap ou un glissement vers le haut l'ouvre. */
  const fixerVolet = (f) => { const c = corpsRef.current; if (c) c.style.setProperty('--tab-volet-f', String(f)); };
  const debutSeparateur = (e) => {
    if ((e.button && e.button !== 0) || !corpsRef.current) return;
    e.preventDefault();
    const el = e.currentTarget, corps = corpsRef.current;
    try { el.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    // ancré sur la hauteur de départ : le volet suit le doigt sans sauter à la prise
    const H = Math.max(1, corps.clientHeight), y0 = e.clientY;
    const f0 = voletPlein ? 1 : fractionVolet, depuisPlein = voletPlein;
    let brut = f0;
    el.classList.add('actif'); corps.classList.add('volet-geste');
    const move = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      brut = f0 + (y0 - ev.clientY) / H;
      corps.style.setProperty('--tab-volet-f', String(Math.max(VOLET_MIN * 0.6, Math.min(1, brut))));
      corps.classList.toggle('volet-fermeture', brut < VOLET_MIN - 48 / H);
      corps.classList.toggle('volet-vers-plein', brut >= VOLET_PLEIN);
    };
    const up = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      el.classList.remove('actif'); corps.classList.remove('volet-geste', 'volet-fermeture', 'volet-vers-plein');
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      if (brut < VOLET_MIN - 48 / H) { fixerVolet(fractionVolet); setVoletPlein(false); replierPanneau(true); return; } // glissé vers le bas : fermé
      if (brut >= VOLET_PLEIN) { fixerVolet(1); setVoletPlein(true); return; } // tout en haut : plein écran
      if (depuisPlein) { // depuis le plein écran : un geste vers le bas → hauteur mémorisée
        if (f0 - brut > 40 / H) { fixerVolet(fractionVolet); setVoletPlein(false); } else fixerVolet(1);
        return;
      }
      const f = bornerVolet(brut);
      fixerVolet(f); setFractionVolet(f); ecrireFractionVolet(f);
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  const clavierSeparateur = (e) => {
    const pas = e.key === 'ArrowUp' ? 0.05 : e.key === 'ArrowDown' ? -0.05 : 0;
    if (!pas) return;
    e.preventDefault();
    if (voletPlein) { if (pas < 0) setVoletPlein(false); return; }
    const f = bornerVolet(fractionVolet + pas);
    setFractionVolet(f); ecrireFractionVolet(f);
  };
  // poignée du bas (volet fermé) : taper ou glisser vers le haut → ouvrir ; tout en haut → plein écran
  const gestePoignee = useRef(null);
  const poigneeProps = {
    onPointerDown: (e) => { gestePoignee.current = { x: e.clientX, y: e.clientY, id: e.pointerId }; try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } },
    onPointerUp: (e) => {
      const g = gestePoignee.current; gestePoignee.current = null;
      if (!g || g.id !== e.pointerId) return;
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      const H = corpsRef.current ? corpsRef.current.clientHeight : 600;
      if (-dy >= H * VOLET_PLEIN) { setVoletPlein(true); replierPanneau(false); return; }
      if (dy < -24 || (Math.abs(dx) < 10 && Math.abs(dy) < 10)) { setVoletPlein(false); replierPanneau(false); }
    },
    onPointerCancel: () => { gestePoignee.current = null; },
  };
  /* EN-TÊTE TABLETTE : une ligne compacte, tout visible (rien dans un « … ») */
  const enteteTablette = () => (
    <div className="lecteur-entete doc tab-entete">
      <button type="button" className="tab-bt" onClick={close} title="Revenir à la liste" aria-label="Retour"><Icon name="chevL" size={18} /></button>
      <div className="tab-titre">
        <TitreRenommable titre={fiche && fiche.titre} demandeEdition={demandeRenommer}
          onRenommer={ficheReelle ? (t) => ctx.renameFiche(ficheReelle.id, t) : null}
          sousTitre={nbPagesAffichees ? `${nbPagesAffichees} p.` : null} />
      </div>
      <MenuFichier {...propsFichier} compact />
      {tableauDispo && (
        <div className="tab-dispo" role="tablist" aria-label="Disposition">
          {[['pdf', 'filePdf', 'Le PDF seul'], ['deux', 'panel', 'PDF et tableau côte à côte'], ['tableau', 'grid', 'Le tableau en plein']].map(([id, ic, lbl]) => (
            <button key={id} type="button" role="tab" aria-selected={disposition === id} className={'tab-bt' + (disposition === id ? ' actif' : '')}
              onClick={() => setDisposition(id)} title={lbl} aria-label={lbl}><Icon name={ic} size={16} /></button>
          ))}
        </div>
      )}
      <button type="button" className="tab-bt" onClick={ctx.toggleTheme} title={ctx.theme === 'dark' ? 'Mode clair' : 'Mode sombre'} aria-label="Thème"><Icon name={ctx.theme === 'dark' ? 'sun' : 'moon'} size={17} /></button>
      {ctx.goHub && <button type="button" className="tab-bt" onClick={ctx.goHub} title="Changer d’app" aria-label="Changer d’app"><Icon name="grid" size={17} /></button>}
      <button type="button" className={'tab-bt' + (panelOpen ? ' actif' : '')} onClick={() => replierPanneau(panelOpen)}
        title={panelOpen ? 'Fermer le panneau' : 'Ouvrir le panneau'} aria-label={panelOpen ? 'Fermer le panneau' : 'Ouvrir le panneau'} aria-pressed={panelOpen}>
        <Icon name="panel" size={18} />
      </button>
    </div>
  );
  // POIGNÉE du partage (même patron que apprentissage/UniteSplit.jsx : capture du
  // pointeur, ratio mémorisé, double-clic = moitié-moitié)
  const corpsRef = useRef(null);
  const majRatio = (r) => {
    const v = Math.max(0.2, Math.min(0.8, r));
    setRatioSplit(v);
    try { localStorage.setItem('medrevise.disposition.ratio', String(+v.toFixed(3))); } catch (e) { /* ignore */ }
  };
  const debutPoignee = (e) => {
    if (e.button !== 0 || !corpsRef.current) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const r = corpsRef.current.getBoundingClientRect();
    const move = (ev) => majRatio((ev.clientX - r.left) / r.width);
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  const selecteurDispo = tableauDispo ? (
    <div className="seg pdfr-dispo" role="tablist" aria-label="Disposition">
      {[['pdf', 'filePdf', modeDoc ? 'Document' : 'PDF'], ['deux', 'panel', 'Les deux'], ['tableau', 'grid', 'Tableau']].map(([id, ic, lbl]) => (
        <button key={id} type="button" role="tab" aria-selected={disposition === id} className={'seg-btn' + (disposition === id ? ' active' : '')}
          onClick={() => setDisposition(id)} title={id === 'pdf' ? 'Le PDF seul' : id === 'deux' ? 'PDF et tableau côte à côte' : 'Le tableau en plein'}>
          <Icon name={ic} size={12} /> {lbl}
        </button>
      ))}
    </div>
  ) : null;

  /* (16/10) la bascule PDF · HTML est retirée : un cours a UN document principal ; une fiche HTML
     en plus d'un PDF sort du modèle et se lit dans Réglages › Archives (lib/fichiersCours.js) */

  /* EXPORT DU PDF ANNOTÉ COMPLET (01/10, voir pdf/exportAnnote.js) : surlignages,
     boîtes OUVERTES avec leurs flèches, traits, images, textes, « ? », pages
     ajoutées. Un NOUVEAU fichier téléchargé ; le blob d'origine n'est que LU.
     Avant : surlignages seulement, et l'entrée ne faisait rien sans surlignage. */
  const [exportErreur, setExportErreur] = useState(null);
  const exportAnnotated = async () => {
    if (!fiche || !pdfIdActif || exporting) return;
    setExporting(true); setExportErreur(null);
    try {
      // le texte en cours de frappe dans une boîte n'est sauvegardé qu'après 400 ms :
      // on part de la version la plus fraîche pour ne rien laisser derrière
      const annots = edits.map((a) => (a.id === activeEditId && editLastJson.current ? { ...a, content: editLastJson.current } : a));
      const { octets } = await exporterDepuisBlob(pdfIdActif, highlights, annots);
      const outBlob = new Blob([octets], { type: 'application/pdf' });
      const url = URL.createObjectURL(outBlob);
      const a = document.createElement('a');
      a.href = url; a.download = `${(fiche.titre || 'cours').replace(/[\\/:*?"<>|]/g, '')}${surFiche ? '-fiche' : ''}-annote.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      setExportErreur("L'export a échoué : " + ((e && e.message) || 'PDF illisible par l’outil d’export') + '. Le cours n’a pas été modifié.');
    } finally {
      setExporting(false);
    }
  };
  /* EXPORTER › .md (15/10) : le texte du cours (texte structuré, passages surlignés en
     [PRIORITAIRE], notes des surlignages — le même que « Copier les notions ») puis l'onglet Notes */
  const exporterMdPdf = async () => {
    if (!pdfDoc) return;
    try {
      const { texteStructure } = await pdfParts();
      const titre = ((fiche && fiche.titre) || 'Cours') + (surFiche ? ' — fiche' : '');
      let md = `# ${titre}\n\n${texteStructure.trim()}\n`;
      const n = ficheReelle ? await lireNotesDoc(ficheReelle.id) : null;
      if (n && n.content && docNonVide(n.content)) md += `\n## Notes\n\n${docToMarkdown(n.content, { titre: null, images: new Map() }).trim()}\n`;
      telechargerFichier(new Blob([md], { type: 'text/markdown;charset=utf-8' }), nomFichier(titre, 'md'));
    } catch (e) { setExportErreur('L’export .md a échoué : ' + ((e && e.message) || 'texte illisible') + '. Le cours n’a pas été modifié.'); }
  };
  /* EXPORTER › PNG par page (15/10) : le PDF annoté (même moteur que « Exporter le PDF annoté »),
     une image par page à 2× la taille de page, dans un .zip. Le blob d'origine n'est que LU. */
  const [avisExport, setAvisExport] = useState(null);
  const exporterPngPages = async () => {
    if (!pdfIdActif || avisExport) return;
    setExportErreur(null); setAvisExport('PNG par page : préparation…');
    try {
      const annots = edits.map((a) => (a.id === activeEditId && editLastJson.current ? { ...a, content: editLastJson.current } : a));
      const { octets } = await exporterDepuisBlob(pdfIdActif, highlights, annots);
      const d = await openPdf(octets.slice()); const n = d.numPages; try { d.loadingTask ? d.loadingTask.destroy() : d.destroy(); } catch (x) { /* ignore */ }
      const pngs = await pngsIA({ octets, indices: [...Array(n).keys()] }, { onProgres: (f, t) => setAvisExport(`PNG par page : ${f} / ${t}`) });
      const fichiers = await Promise.all(pngs.map(async (p) => ({ nom: p.nom, donnees: new Uint8Array(await p.blob.arrayBuffer()) })));
      const base = ((fiche && fiche.titre) || 'cours') + (surFiche ? ' fiche' : '') + ' png';
      telechargerFichier(creerZip(fichiers), nomFichier(base, 'zip'));
    } catch (e) {
      setExportErreur('L’export PNG a échoué : ' + ((e && e.message) || 'PDF illisible') + '. Le cours n’a pas été modifié.');
    } finally { setAvisExport(null); }
  };

  // BUG 2 : l'unité d'édition est la SÉLECTION de l'utilisateur (rects réels d'un
  // Range DOM, cf. `pending` déjà rempli par la sélection dans PdfPageContent — même
  // mécanisme que la création de surlignage), JAMAIS le span pdf.js entier sous le
  // curseur (qui correspond souvent à une ligne complète). La boîte de masquage/édition
  // est l'union des rects normalisés de la sélection — un simple clic ne produit aucun
  // rect (sélection vide) et ne déclenche donc jamais rien.
  const startEditFromSelection = async () => {
    if (!pending) return;
    const rects = pending.rects;
    const x0 = Math.min(...rects.map((r) => r.x));
    const y0 = Math.min(...rects.map((r) => r.y));
    const x1 = Math.max(...rects.map((r) => r.x + r.width));
    const y1 = Math.max(...rects.map((r) => r.y + r.height));
    const existing = edits.find((a) => a.page === pending.page && Math.abs(a.x - x0) < 0.01 && Math.abs(a.y - y0) < 0.01);
    if (existing) { setActiveEditId(existing.id); setPending(null); return; }
    const rec = newTextEdit({
      ficheId: nsAnnot, page: pending.page, x: x0, y: y0, width: x1 - x0, height: y1 - y0,
      originalText: pending.texte, fontSize: pending.fontSizeRel || null, fontFamily: pending.fontFamily || null,
    });
    await hist.appliquer(cmdCreer('annotations', rec, 'Bloc de texte'));
    setActiveEditId(rec.id);
    setPending(null);
    window.getSelection && window.getSelection().removeAllRanges();
  };
  /* SEULE écriture d'annotation qui ne passe PAS par l'historique, et c'est
     délibéré : le TEXTE d'un bloc a son propre historique (celui de TipTap).
     Deux piles, deux portées, départagées par la cible du clavier — voir
     l'effet des raccourcis plus haut et lib/annotHistory.js.
     Prend un ID, jamais un instantané : on repart de l'enregistrement le plus
     récent et on ne change QUE `content` (défaut 3, voir les refs plus haut). */
  const saveEditContent = async (id, json) => {
    const base = (editsRef.current || []).find((a) => a.id === id);
    if (!base) return;
    // (10/10) boîte à deux versions : l'édition s'applique à la version AFFICHÉE
    const updated = avecContenuEdite(base, json);
    // l'écran d'abord (sinon la boîte refermée montre son ANCIEN texte le temps de
    // l'écriture — même famille que le bug « hallucinations »), la base ensuite
    setEdits((arr) => arr.map((a) => (a.id === id ? avecContenuEdite(a, json) : a)));
    await put('annotations', updated);
  };
  const resetEdit = async (id) => {
    const a = edits.find((x) => x.id === id);
    if (activeEditId === id) setActiveEditId(null);
    if (a) await hist.appliquer(cmdSupprimer('annotations', a, "Retrait du bloc de texte"));
  };

  // sauvegarde différée du texte d'un bloc/d'une boîte (voir l'éditeur plus bas).
  // Déclarés ICI, avant leur première utilisation dans le fichier (boiteFraiche).
  const editSaveTimer = useRef(null);
  const editLastJson = useRef(null);
  /* CORRECTIF (boîte de texte, défaut 3) : l'éditeur TipTap n'est recréé qu'au
     changement de bloc actif ; son `onUpdate` capturait donc l'enregistrement tel
     qu'il était À CE MOMENT-LÀ, et la sauvegarde différée réécrivait cette version
     périmée — y compris sa GÉOMÉTRIE. Déplacer une boîte puis taper dedans la
     faisait resauter à sa position d'avant. Ces refs donnent toujours l'état
     courant, quelle que soit l'ancienneté de la fermeture. */
  const editsRef = useRef(edits);
  editsRef.current = edits;
  const activeEditIdRef = useRef(activeEditId);
  activeEditIdRef.current = activeEditId;

  /* CHANGER DE BOÎTE ACTIVE — un seul point de passage (02/10).
     1. Le texte tapé dans la boîte qu'on quitte n'était écrit qu'après 400 ms, et
        seulement APRÈS le rendu qui la refermait : la boîte refermée montrait une
        fraction de seconde son ANCIEN texte. On pousse ce texte à l'écran dans le
        MÊME rendu que la fermeture.
     2. Une boîte (ou un texte libre) créée puis quittée sans rien écrire est
        retirée — indispensable pour enchaîner les boîtes sans semer de boîtes
        vides. Retrait annulable (Cmd+Z la rend). */
  const videsFraiches = useRef(new Set()); // ids créés dans cette ouverture, encore jamais écrits
  const contenuVide = (c) => !c || !JSON.stringify(c).includes('"text"');
  const setActiveEditId = (id) => {
    const prec = activeEditIdRef.current;
    if (prec && prec !== id) {
      let contenu = null;
      if (editSaveTimer.current && editLastJson.current) {
        clearTimeout(editSaveTimer.current); editSaveTimer.current = null;
        contenu = editLastJson.current; editLastJson.current = null;
        saveEditContent(prec, contenu);
      }
      if (videsFraiches.current.has(prec)) {
        const rec = (editsRef.current || []).find((a) => a.id === prec);
        const final = contenu || (rec && rec.content);
        if (contenuVide(final)) {
          videsFraiches.current.delete(prec);
          if (rec) hist.appliquer(cmdSupprimer('annotations', rec, rec.kind === 'texte' ? 'Texte vide retiré' : 'Boîte vide retirée'));
        } else videsFraiches.current.delete(prec);
      }
    }
    activeEditIdRef.current = id;
    setActiveEditIdBrut(id);
  };

  /* ---- BOÎTE DE TEXTE LIBRE ----
     Posée n'importe où sur une page (pas forcément sur du texte), déplaçable,
     redimensionnable, supprimable. Même store et même géométrie normalisée [0,1]
     que le bloc de remplacement de texte — seul `kind: 'libre'` les distingue.
     Les trois actions passent par l'historique : la boîte naît annulable. */
  const creerBoite = async ({ page, x, y, width, height, compacte = false, largeurFixe = false }) => {
    // CORRECTIF : `couleurBoite` n'était déclaré nulle part. La ReferenceError partait
    // dans une fonction async appelée depuis un écouteur pointerup — promesse rejetée,
    // rien à l'écran : l'outil « ne créait rien ». La couleur est celle de la barre
    // contextuelle, partagée par tous les outils colorés.
    // (20/10 soir) `compacte` : gabarit compact (pdfShared.js#COMPACT) — les boîtes d'avant n'ont pas ce champ
    const rec = { ...newNoteBox({ ficheId: nsAnnot, page, x, y, width, height, couleur: couleurActive, fond: lireFondBoiteDefaut() }), ...(compacte ? { compacte: true } : {}), ...(largeurFixe ? { largeurFixe: true } : {}) };
    const cmd = cmdCreer('annotations', rec, 'Boîte de texte');
    hist.appliquer(cmd); // visible tout de suite (effet local), écrite ensuite
    videsFraiches.current.add(rec.id);
    setActiveEditId(rec.id);
    /* ENCHAÎNER (02/10) : l'outil Boîte RESTE actif — on écrit dans celle-ci, un clic
       ailleurs sur la page en pose une autre. Échap (deux fois si une boîte est en
       cours d'écriture) ou un re-clic sur l'outil pour en sortir. */
  };
  /* Version LA PLUS FRAÎCHE d'une boîte. Indispensable : un geste part d'un instantané
     pris au pointerdown, or l'utilisateur a pu taper dans la boîte juste avant, et la
     sauvegarde du texte est différée de 400 ms (voir onUpdate de l'éditeur). Écrire
     l'instantané tel quel écraserait ces caractères-là. On repart donc de
     l'enregistrement courant, et du contenu en attente s'il y en a un — le geste ne
     change QUE la géométrie. */
  const boiteFraiche = (id, repli) => {
    const base = edits.find((a) => a.id === id) || repli;
    if (!base) return null;
    const enAttente = activeEditId === id && editLastJson.current;
    return enAttente ? { ...base, content: editLastJson.current } : base;
  };
  const GEO = (o) => ({ x: o.x, y: o.y, width: o.width, height: o.height });

  // UNE entrée d'historique par geste, pas soixante : l'état d'avant est capturé au
  // pointerdown (dans NoteBox) et la commande n'est empilée qu'au pointerup.
  const majBoite = async (avant, apres, libelle) => {
    if (!avant || !apres) return;
    const actuel = boiteFraiche(avant.id, avant);
    if (!actuel) return;
    const fixe = apres.largeurFixe && !actuel.largeurFixe ? { largeurFixe: true } : {};
    await hist.appliquer(cmdModifier('annotations', { ...actuel, ...GEO(avant) }, { ...actuel, ...GEO(apres), ...fixe }, libelle));
  };
  /* Modification générique d'une boîte (repli, ancre, flèche…) : repart de la
     version la plus fraîche (texte en attente compris) et passe par l'historique —
     une entrée par geste, annulable par Cmd+Z comme tout le reste. */
  const modifierBoite = async (b, patch, libelle) => {
    if (patch && patch.versionTexte) { await basculerBoites([b], patch.versionTexte, libelle); return; }
    const actuel = boiteFraiche(b.id, b);
    if (!actuel) return;
    if (patch.reduite && activeEditId === b.id) setActiveEditId(null); // on replie : on quitte l'édition
    if (patch.couleur) setCouleurActive(patch.couleur); // la prochaine boîte héritera du dernier choix (comme changerCouleurBoite)
    await hist.appliquer(cmdModifier('annotations', actuel, { ...actuel, ...patch }, libelle));
  };
  /* ANCRAGE (demande du 30/09) : « viser » l'endroit de la page auquel la boîte se
     rapporte. `ancrageBoiteId` = la boîte qui attend son point ; la page concernée
     pose alors une couche de visée au-dessus de tout (voir PdfPage). Échap, ou
     changer d'outil, annule. */
  const [ancrage, setAncrage] = useState(null); // { id, fleche } — la boîte qui attend son épingle
  const ancrageBoiteId = ancrage ? ancrage.id : null;
  const ancrageRef = useRef(ancrage); ancrageRef.current = ancrage;
  // opts.surlignage : la visée attend un SURLIGNAGE (lien boîte ↔ surlignage, 02/10)
  const setAncrageBoiteId = (id, opts) => setAncrage(id ? { id, fleche: !!(opts && (opts.fleche || opts.surlignage)), surlignage: !!(opts && opts.surlignage), ajout: !!(opts && opts.ajout) } : null);
  useEffect(() => {
    if (!ancrageBoiteId) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setAncrage(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ancrageBoiteId]);
  const changerCouleurBoite = async (b, couleur) => {
    const actuel = boiteFraiche(b.id, b);
    if (!actuel || actuel.couleur === couleur) return;
    setCouleurActive(couleur); // la prochaine boîte héritera du dernier choix
    await hist.appliquer(cmdModifier('annotations', actuel, { ...actuel, couleur }, 'Couleur de la boîte'));
  };
  /* ---- CRAYON ----
     Le trait arrive DÉJÀ lissé de la page (lisserTrait est appliqué au
     relâchement, voir PdfPage) : on ne relisse jamais deux fois, et un trait
     enregistré sans aimant reste brut pour toujours. Une entrée d'historique
     par trait — Cmd+Z efface le trait entier, jamais un bout. */
  const creerTrait = async ({ page, points, mode = 'dessin', pression = 1 }) => {
    if (!points || points.length < 2) return;
    const surligneur = mode === 'surligneur';
    // (20/10) pression du stylet : facteur léger (0,6 à 1,4) sur l'épaisseur réglée — 1 à la souris / au doigt
    const rec = newTrait({ ficheId: nsAnnot, page, points, couleur: couleurCrayon, mode,
      epaisseur: (reglagesCrayon[mode] || REGLAGES_DEFAUT.dessin).taille * (Number.isFinite(pression) && pression > 0 ? pression : 1),
      opacite: (reglagesCrayon[mode] || REGLAGES_DEFAUT.dessin).opacite,
      aimant: !surligneur && aimant });
    await hist.appliquer(cmdCreer('annotations', rec, surligneur ? 'Surligneur à main levée' : 'Trait au crayon'));
  };
  // gomme : UN geste = UNE entrée d'historique, même s'il a traversé plusieurs traits
  // (02/10 soir) la gomme efface aussi les FORMES : leurs légendes sont déliées, comme à la suppression
  const supprimerTraits = async (liste) => {
    const elems = (liste || []).filter(Boolean);
    const cmds = elems.flatMap((t) => (t.kind === 'forme' ? cmdsSuppressionForme(t, 'Gomme') : [cmdSupprimer('annotations', t, 'Gomme')]));
    if (!cmds.length) return;
    const nf = elems.filter((t) => t.kind === 'forme').length, nt = elems.length - nf;
    if (nf && formeActiveId && elems.some((t) => t.id === formeActiveId)) setFormeActiveId(null);
    const detail = [nt ? `${nt} trait${nt > 1 ? 's' : ''}` : '', nf ? `${nf} forme${nf > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ');
    await hist.appliquer(cmdGroupe(`Gomme (${detail})`, cmds));
  };

  /* ---- PAGES AJOUTÉES (01/10) ----
     Une page blanche intercalée après n'importe quelle page affichée. Rien n'est
     renuméroté : les annotations des pages du PDF gardent leur `page`, celles d'une
     page ajoutée portent son id. Supprimer une page ajoutée emporte ses annotations,
     en UNE entrée d'annulation (Cmd+Z rend la page ET son contenu). */
  const [ajoutPage, setAjoutPage] = useState(null); // { apresIdx } — la fenêtre « Ajouter une page »
  const [pageASupprimer, setPageASupprimer] = useState(null);
  // la page blanche à créer après la page affichée n° idx (0…) ; -1 = tout au début
  const nouvellePageApres = (idx) => {
    const pageSizes = pageSizesRef.current;
    const ref = idx >= 0 ? pageSizes[idx] : null;
    let apres, rang;
    const memeEndroit = (k) => pagesAjoutees.filter((a) => Math.floor(Number(a.apres) || 0) === k);
    if (!ref) { apres = 0; const r = memeEndroit(0).map((a) => a.rang); rang = r.length ? Math.min(...r) - 1 : 0; }
    else if (ref.pdf) { apres = ref.pdf; const r = memeEndroit(apres).map((a) => a.rang); rang = r.length ? Math.min(...r) - 1 : 0; }
    else {
      apres = Math.floor(Number(ref.ajout.apres) || 0);
      const suiv = pageSizes[idx + 1];
      rang = suiv && suiv.ajout && Math.floor(Number(suiv.ajout.apres) || 0) === apres ? (ref.ajout.rang + suiv.ajout.rang) / 2 : ref.ajout.rang + 1;
    }
    // un document : toujours A4 ; un PDF : la taille de la page voisine
    const modele = modeDoc ? PAGE_A4 : (ref || pageSizes[0] || PAGE_A4);
    return newPageAjoutee({ ficheId: nsAnnot, apres, rang, width: modele.width, height: modele.height });
  };
  /* DOCUMENT : les pages sont calculées — « insérer une page » insère dans le FLUX une page
     blanche (saut de page, paragraphe vide, saut de page) avant le premier bloc de la page
     suivante ; « retirer une page » retire les blocs qui y commencent (et ses annotations) */
  const blocsDePage = (k) => {
    const b = (pagination && pagination.blocs) || [];
    const i = b.findIndex((x) => x.page >= k);
    const j = b.findIndex((x) => x.page > k);
    const fin = fluxRef.current && fluxRef.current.editor ? fluxRef.current.editor.state.doc.content.size : 0;
    return { de: i < 0 ? fin : b[i].pos, a: j < 0 ? fin : b[j].pos, vide: i < 0 || b[i].page !== k };
  };
  const insererPageApres = async (idx) => {
    if (modeDoc && fluxRef.current && pagination) {
      setAjoutPage(null);
      fluxRef.current.insererPageAvant(blocsDePage(idx + 1).de);
      setTimeout(() => {
        const el = scrollRef.current, offs = layoutRef.current.offsets;
        if (el && offs[idx + 1] != null) { el.scrollTop = Math.max(0, offs[idx + 1] - 8 * scale); computeVisibleRangeRef.current(); }
      }, 250);
      return;
    }
    const rec = nouvellePageApres(idx);
    await hist.appliquer(cmdCreer('annotations', rec, 'Page ajoutée'));
    setAjoutPage(null);
    // aller sur la nouvelle page une fois la mise en page recalculée
    setTimeout(() => {
      const el = scrollRef.current; if (!el) return;
      const i = idx + 1, offs = layoutRef.current.offsets;
      if (offs[i] != null) { el.scrollTop = Math.max(0, offs[i] - 8 * scale); computeVisibleRangeRef.current(); }
    }, 60);
  };
  const contenuDePage = (id) => edits.filter((a) => a.page === id);

  /* ---- TEXTE DES PAGES (08/10, pdf/PageTexte.jsx) ---- */
  const minuteurNotions = useRef(null);
  planifierNotionsRef.current = () => planifierNotions();
  const planifierNotions = () => {
    clearTimeout(minuteurNotions.current);
    minuteurNotions.current = setTimeout(() => { synchroniserNotionsDoc(ficheId).then((ch) => { if (ch) reloadHighlights(); }); }, 900);
  };
  const sauverPageTexte = (pageId, json) => {
    corpsPages.current[pageId] = json;
    ecrirePageDoc(ficheId, pageId, json).then(planifierNotions).catch(() => {});
  };
  /* journal (annuler / rétablir) : remet une page de texte dans un état donné — page affichée :
     dans son éditeur (qui enregistre) ; page démontée : directement dans le document */
  restaurerPageRef.current = (pageId, json) => {
    if (pageId === 'flux') return fluxRef.current ? fluxRef.current.remplacer(json) : undefined;
    const api = pagesTexte.current.get(pageId);
    if (api && api.remplacer) return api.remplacer(json);
    sauverPageTexte(pageId, dehydrateDoc(json || EMPTY_DOC));
    return undefined;
  };
  const faireVoirPage = (i) => {
    const el = scrollRef.current, offs = layoutRef.current.offsets;
    if (el && offs[i] != null) { el.scrollTop = Math.max(0, offs[i] - 8 * (scaleRef.current || scale)); computeVisibleRangeRef.current(); }
  };
  // le texte d'une page déborde : ses derniers blocs partent en tête de la page suivante
  const pagesCreeesApres = useRef({}); // id de page → page créée juste après elle, pas encore affichée
  const relaisPages = useRef(null); // { source, cible } : frappe en relais pendant le passage d'une page à l'autre
  // la page qui reçoit le curseur est prête : elle rejoue ce qui a été tapé pendant le passage
  const pagePrete = (id) => {
    delete focusPages.current[id];
    const r = relaisPages.current;
    if (!r || r.cible !== id) return;
    relaisPages.current = null;
    const src = pagesTexte.current.get(r.source), cible = pagesTexte.current.get(id);
    const items = src ? src.prendreRelais() : [];
    if (cible) cible.rejouer(items);
  };
  const deborderPage = async (pageId, nodes, decal) => {
    const liste = pageSizesRef.current;
    const idx = liste.findIndex((p) => p.cle === pageId);
    if (idx < 0) return;
    const cree = pagesCreeesApres.current[pageId];
    const suiv = cree && !liste.some((p) => p.cle === cree.id) ? { cle: cree.id, ajout: cree } : liste[idx + 1];
    if (suiv && suiv.ajout) {
      const api = pagesTexte.current.get(suiv.cle);
      if (api) {
        api.prefixer(nodes, decal);
        if (decal != null) { const src = pagesTexte.current.get(pageId); if (src) api.rejouer(src.prendreRelais()); }
        return;
      }
      const avant = corpsPages.current[suiv.cle];
      const base = avant && docNonVide(avant) ? avant.content : [];
      if (decal != null) { focusPages.current[suiv.cle] = decal; relaisPages.current = { source: pageId, cible: suiv.cle }; }
      const nouveau = { type: 'doc', content: [...dehydrateDoc({ type: 'doc', content: nodes }).content, ...base] };
      hist.noterPage(suiv.cle, avant || EMPTY_DOC, nouveau, { systeme: true }); // défait avec l'action qui a débordé
      sauverPageTexte(suiv.cle, nouveau);
      if (decal != null) faireVoirPage(idx + 1);
      return;
    }
    // pas de page après : on la crée (une seule, même si le texte déborde encore avant qu'elle s'affiche)
    const rec = nouvellePageApres(idx);
    pagesCreeesApres.current[pageId] = rec;
    if (decal != null) { focusPages.current[rec.id] = decal; relaisPages.current = { source: pageId, cible: rec.id }; }
    hist.noterPage(rec.id, EMPTY_DOC, dehydrateDoc({ type: 'doc', content: nodes }), { systeme: true });
    sauverPageTexte(rec.id, dehydrateDoc({ type: 'doc', content: nodes }));
    appliquerLocal([{ store: 'annotations', apres: rec }]);
    await put('annotations', rec);
    if (decal != null) setTimeout(() => faireVoirPage(idx + 1), 60);
  };
  // retour arrière au début d'une page : son premier bloc remonte à la fin de la précédente
  const remonterPage = (pageId, node) => {
    const liste = pageSizesRef.current;
    const idx = liste.findIndex((p) => p.cle === pageId);
    const prec = idx > 0 ? liste[idx - 1] : null;
    const api = prec && prec.ajout ? pagesTexte.current.get(prec.cle) : null;
    if (!api) return false;
    setTimeout(() => api.suffixer(node), 0);
    return true;
  };
  /* BARRE DE MISE EN FORME (09/10, docs/compte-rendu-pdfreader-v2.md) : elle suit l'éditeur qui a
     le curseur. Appelée au focus, à chaque clic dans le texte et à chaque déplacement du curseur —
     plus seulement au `focus` : l'éditeur GARDE le focus quand on prend un outil (ses boutons ne le
     lui retirent pas), donc revenir dans le texte ne redéclenchait aucun `focus` et la barre ne
     revenait jamais. Même éditeur ⇒ même objet d'état : aucun rendu de plus. */
  const activerPageTexte = (pageId, ed) => {
    if (outilRef.current !== 'main') return;
    setActiveEditId(null);
    setEditeurPage((e) => (e && e.ed === ed && e.pageId === pageId ? e : { pageId, ed }));
  };
  const notionDePage = async (n) => { await creerNotionDoc(ficheId, n); reloadHighlights(); };
  const flashcardDePage = (texte) => { setPanelOpen(true); setFlashcardNotes((f) => ({ texte, n: (f ? f.n : 0) + 1 })); };
  // la barre de mise en forme du texte se referme quand on clique ailleurs que dans le texte
  useEffect(() => {
    if (!editeurPage) return undefined;
    const dehors = (e) => {
      const t = e.target;
      // `.pt-flux-cadre` : le texte d'un document à flux (oublié jusqu'ici : chaque clic DANS le
      // texte refermait la barre — 2ᵉ cause du « parfois elle ne s'affiche pas »)
      if (t && t.closest && t.closest('.pt-zone, .pt-flux-cadre, .pdfr-edit-toolbar, .pdfr-rangee-texte, .pt-bulle, .sc-pop, .sc-fenetre, .ptb-pop, .rg-regles, .mep-panneau')) return;
      setEditeurPage(null);
    };
    window.addEventListener('pointerdown', dehors, true);
    return () => window.removeEventListener('pointerdown', dehors, true);
  }, [editeurPage]);
  // un outil d'annotation (surligneur compris) : la barre s'efface
  useEffect(() => { if (outil !== 'main') setEditeurPage(null); }, [outil]);
  /* boîte de texte active : un clic hors de la boîte et de sa barre la referme (remplace
     l'ancien bouton « Terminé ») */
  useEffect(() => {
    if (!activeEditId) return undefined;
    const dehors = (e) => {
      const t = e.target;
      if (!t || !t.closest || t.closest('.note-box, .nb-actions, .edit-block-active, .pdfr-edit-toolbar, .pdfr-rangee-texte, .sc-pop, .sc-fenetre, .ptb-pop, .ctx-menu, .mf-menu, .ptb-outils, .tab-outils')) return;
      setActiveEditId(null);
    };
    window.addEventListener('pointerdown', dehors, true);
    return () => window.removeEventListener('pointerdown', dehors, true);
  }, [activeEditId]);
  const basculerFond = () => {
    const v = !fondNoir;
    setFondNoir(v);
    majNotesDoc(ficheId, { fond: v ? 'noir' : 'blanc' });
  };
  const ordrePages = () => pageSizesRef.current.map((p) => p.cle);
  const texteDocument = async () => {
    if (modeDoc && fluxRef.current && fluxRef.current.editor) { fluxRef.current.vider(); return contenuGlobal({ flux: fluxRef.current.editor.getJSON() }); }
    pagesTexte.current.forEach((api) => api.vider());
    await attendreNotesDoc();
    const r = await lireNotesDoc(ficheId);
    return contenuGlobal({ pages: (r && r.pages) || {} }, ordrePages());
  };
  const exporterMdDocument = async () => exporterMarkdownDoc(await texteDocument(), fiche && fiche.titre);
  /* texte brut d'un document pour les mots-clés de la transcription : texte des pages ET texte
     reconnu dans ses images (Texte en direct, 08/10) */
  const texteBrutDocument = () => {
    const out = [];
    const w = (n) => {
      if (!n) return;
      if (n.type === 'text' && n.text) out.push(n.text);
      if (n.type === 'image' && n.attrs && n.attrs.ocr) out.push('\n' + texteOcr(n.attrs.ocr) + '\n');
      if (n.type === 'paragraph' || n.type === 'heading') out.push('\n');
      (n.content || []).forEach(w);
    };
    if (modeDoc && fluxRef.current && fluxRef.current.editor) w(fluxRef.current.editor.getJSON());
    else ordrePages().forEach((k) => w(corpsPages.current[k]));
    return out.join(' ');
  };
  /* PDF D'UN DOCUMENT : les pages telles qu'à l'écran (texte, surlignages, dessins, formes,
     images, boîtes), rendues TOUTES à l'échelle de l'A4 imprimé (96 ppp), recopiées dans un
     conteneur d'impression, puis le lecteur reprend son zoom. Fond blanc ou noir selon le
     réglage du document (08/10 : le fond noir était retiré, et les couleurs de fond —
     surlignages compris — ne s'imprimaient pas : voir notes-doc.css). */
  const [impression, setImpression] = useState(false);
  const imprimerDocument = async () => {
    const el = scrollRef.current;
    if (!el || impression) return;
    pagesTexte.current.forEach((api) => api.vider());
    const s0 = scaleRef.current || scale, haut0 = el.scrollTop;
    const k = 793.7 / PAGE_A4.width; // largeur de l'A4 en px CSS
    setImpression(true); scaleRef.current = k; setScale(k);
    const nbTextes = () => (modeDoc ? 0 : pageSizesRef.current.filter((sz) => sz.ajout && docNonVide(corpsPages.current[sz.cle])).length);
    if (fluxRef.current) fluxRef.current.vider();
    const t0 = performance.now();
    await new Promise((ok) => {
      const tour = () => {
        const pages = el.querySelectorAll('.pdfr-page').length;
        const textes = el.querySelectorAll('.pt-zone .ProseMirror[contenteditable="true"]').length;
        const images = [...el.querySelectorAll('.pdfr-page img')].every((i) => i.complete);
        if ((pages >= pageSizesRef.current.length && textes >= nbTextes() && images) || performance.now() - t0 > 4000) setTimeout(ok, 120);
        else requestAnimationFrame(tour);
      };
      requestAnimationFrame(tour);
    });
    const cont = document.createElement('div');
    cont.className = 'pdfr-impression-pages';
    /* DOCUMENT : l'export EST l'écran — chaque page reçoit une copie du flux paginé (même DOM,
       même CSS, mêmes polices, mêmes espaceurs) décalée de la position de la page et rognée
       à ses bords, sous le calque d'annotations de cette page. Pas de second moteur. */
    const cadre = modeDoc ? el.querySelector('.pdfr-pages > .pt-flux-cadre') : null;
    const rc = cadre && cadre.getBoundingClientRect();
    [...el.querySelectorAll('.pdfr-page')].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).forEach((pg) => {
      const c = pg.cloneNode(true);
      c.querySelectorAll('.pdfr-ajout-etiquette, .pdfr-selcanvas, canvas').forEach((x) => x.remove());
      if (cadre) {
        const rp = pg.getBoundingClientRect();
        const f = cadre.cloneNode(true);
        f.classList.add('pt-flux-impression');
        f.style.top = (rc.top - rp.top) + 'px';
        f.style.left = (rc.left - rp.left) + 'px';
        f.style.height = '';
        c.insertBefore(f, c.firstChild);
      }
      c.querySelectorAll('[contenteditable]').forEach((x) => x.removeAttribute('contenteditable'));
      cont.appendChild(c);
    });
    setImpression(false); scaleRef.current = s0; pendingScroll.current = haut0; setScale(s0);
    document.body.appendChild(cont);
    document.body.classList.add('pdfr-impression');
    if (modeDoc && fondNoir) document.body.classList.add('pdfr-impression-noir'); // le papier aussi : pas de liseré blanc au bas des pages
    const nettoyer = () => { cont.remove(); document.body.classList.remove('pdfr-impression', 'pdfr-impression-noir'); window.removeEventListener('afterprint', nettoyer); };
    window.addEventListener('afterprint', nettoyer);
    const titre0 = document.title;
    document.title = (fiche && fiche.titre) || 'Document'; // nom proposé pour le PDF enregistré
    window.print();
    document.title = titre0;
    setTimeout(nettoyer, 60000); // filet : navigateurs sans afterprint
  };
  // (16/10) « Importer un PDF » dans un document (code mort : jamais déclenché) retiré — un cours a un seul document principal
  const supprimerPageAjoutee = async (pageRec) => {
    setPageASupprimer(null);
    if (modeDoc && fluxRef.current) {
      const k = pageSizesRef.current.findIndex((p) => p.cle === pageRec.id);
      const { de, a, vide } = blocsDePage(k);
      if (!vide) fluxRef.current.retirerBlocs(de, a);
      const cmds = contenuDePage(pageRec.id).map((x) => cmdSupprimer('annotations', x, 'Retrait de la page'));
      if (cmds.length) await hist.appliquer(cmdGroupe('Annotations de la page retirée', cmds));
      return;
    }
    const cmds = [...contenuDePage(pageRec.id), pageRec].map((a) => cmdSupprimer('annotations', a, 'Retrait de la page'));
    if (activeEditId && contenuDePage(pageRec.id).some((a) => a.id === activeEditId)) setActiveEditId(null);
    await hist.appliquer(cmdGroupe('Retrait de la page ajoutée', cmds));
  };
  // page vide : on retire tout de suite (annulable) ; page annotée : on confirme d'abord
  const demanderSuppressionPage = (pageRec) => {
    const k = pageSizesRef.current.findIndex((p) => p.cle === pageRec.id);
    const texte = modeDoc && fluxRef.current && !blocsDePage(k).vide;
    return contenuDePage(pageRec.id).length || texte ? setPageASupprimer(pageRec) : supprimerPageAjoutee(pageRec);
  };
  const libellePage = (p, i) => (p.pdf ? `Page ${i + 1}` : `Page ${i + 1} (ajoutée)`);

  /* ---- FORMES (03/10) ----
     Un cadre tracé (outil « Forme », qui reste actif pour enchaîner) ; « Légende »
     pose une boîte reliée par une flèche (formeId côté boîte, comme surlignageId). */
  const [formeActiveId, setFormeActiveId] = useState(null);
  const creerForme = ({ page, x, y, width, height, forme, fx, fy }) => {
    const rec = newForme({ ficheId: nsAnnot, page, x, y, width, height, couleur: couleurForme, forme, fx, fy, remplie: formeRemplie && estFermee(forme) });
    hist.appliquer(cmdCreer('annotations', rec, 'Forme'));
  };
  /* déplacer / redimensionner une forme : ses LÉGENDES suivent (02/10 soir) — l'épingle
     de chaque boîte reliée est recalculée sur la nouvelle position, dans la même
     entrée d'annulation (avant : la flèche restait pointée sur l'ancienne place). */
  const majForme = (avant, apres, libelle) => {
    const actuel = edits.find((a) => a.id === avant.id) || avant;
    const nouvelle = { ...actuel, ...GEO(apres), ...(apres.fx !== undefined ? { fx: !!apres.fx, fy: !!apres.fy } : {}) };
    const suivent = edits.filter((b) => b.kind === 'libre' && (b.formeId === actuel.id || (b.fleches || []).some((fl) => fl.formeId === actuel.id)));
    const cmds = suivent.map((b) => cmdModifier('annotations', b, {
      ...b,
      ...(b.formeId === actuel.id && b.ancre ? { ancre: ancreSurForme(nouvelle, b) } : {}),
      ...(b.fleches ? { fleches: b.fleches.map((fl) => (fl.formeId === actuel.id ? { ...fl, ...ancreSurForme(nouvelle, b) } : fl)) } : {}),
    }, 'Légende déplacée avec sa forme'));
    const cmd = cmdModifier('annotations', actuel, nouvelle, libelle);
    hist.appliquer(cmds.length ? cmdGroupe(libelle, [cmd, ...cmds]) : cmd);
  };
  // texte, couleur, remplissage d'une forme
  const modifierForme = (f, patch, libelle) => {
    const actuel = edits.find((a) => a.id === f.id) || f;
    if (patch.couleur) setCouleurForme(patch.couleur); // la prochaine forme hérite du dernier choix
    hist.appliquer(cmdModifier('annotations', actuel, { ...actuel, ...patch }, libelle));
  };
  // supprimer une forme DÉLIE ses légendes (elles restent, sans flèche dans le vide) —
  // une seule entrée d'annulation
  const cmdsSuppressionForme = (f, libelle) => {
    const legendes = edits.filter((a) => a.formeId === f.id || (a.fleches || []).some((fl) => fl.formeId === f.id));
    return [
      ...legendes.map((b) => cmdModifier('annotations', b, {
        ...b,
        ...(b.formeId === f.id ? { formeId: null, ancre: null, fleche: false } : {}),
        ...(b.fleches ? { fleches: b.fleches.filter((fl) => fl.formeId !== f.id) } : {}),
      }, 'Légende déliée')),
      cmdSupprimer('annotations', f, libelle),
    ];
  };
  const supprimerForme = (f) => {
    if (formeActiveId === f.id) setFormeActiveId(null);
    hist.appliquer(cmdGroupe('Suppression de la forme', cmdsSuppressionForme(f, 'Suppression de la forme')));
  };
  const creerLegende = (f) => {
    const W = BOITE_DEFAUT.width, Hb = BOITE_DEFAUT.height;
    const aDroite = f.x + f.width + 0.03 + W <= 0.99;
    const x = aDroite ? f.x + f.width + 0.03 : Math.max(0.01, f.x - 0.03 - W);
    const y = Math.max(0, Math.min(1 - Hb, f.y + f.height / 2 - Hb / 2));
    const ancre = ancreSurForme(f, { x });
    // (20/10, pdf/connecteurs.js) la légende naît avec UN connecteur ordinaire, retirable comme les autres
    const base = newNoteBox({ ficheId: nsAnnot, page: f.page, x, y, width: W, height: Hb, couleur: couleurActive, fond: lireFondBoiteDefaut() });
    const rec = { ...base, ...patchAjouter(base, { ...ancre, formeId: f.id }) };
    hist.appliquer(cmdCreer('annotations', rec, 'Légende de la forme'));
    videsFraiches.current.add(rec.id);
    setFormeActiveId(null);
    setActiveEditId(rec.id);
  };
  useEffect(() => {
    if (!formeActiveId) return undefined;
    const onDown = (e) => { if (!(e.target.closest && e.target.closest('.pdfr-forme')) && !dansSelecteurFlottant(e.target)) setFormeActiveId(null); };
    const onKey = (e) => { if (e.key === 'Escape') setFormeActiveId(null); };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
  }, [formeActiveId]);

  /* ---- IMAGES COLLÉES (01/10) ----
     Importées (bouton « Image »), collées (Cmd/Ctrl+V) ou glissées sur une page.
     Le fichier devient un blob ordinaire (même canal que les images de
     flashcards) ; l'annotation ne porte que sa place, sa taille et son calque. */
  const [imageActiveId, setImageActiveId] = useState(null);
  const entreeImageRef = useRef(null);
  // `blobIdExistant` (02/10) : un dessin reçu du téléphone est DÉJÀ un blob stocké
  // (et au cloud) — l'image posée le réutilise, sans copie.
  // `echelle` : un dessin est rendu en ×2 (net à l'écran) — sa taille de départ est
  // celle du dessin, pas celle de ses pixels.
  const ajouterImage = async (file, cible = null, blobIdExistant = null, echelle = 1, textes = null) => {
    if (!file || !/^image\//.test(file.type || '')) return;
    // DOCUMENT (10/10) : jamais d'image flottante — un bloc du flux, quel que soit le chemin
    if (modeDoc) { await insererImageFlux(file, { ecran: cible && cible.ecran, blobIdExistant, echelle, textes }); return; }
    let w = 0, h = 0;
    try { const bm = await createImageBitmap(file); w = bm.width; h = bm.height; if (bm.close) bm.close(); } catch (e) { return; } // pas une image lisible
    if (!w || !h || !pageSizes.length) return;
    // page visée : celle du dépôt, sinon la page affichée
    const idx = cible ? indexDePage(cible.page) : pageCourante - 1;
    const ps = pageSizes[Math.max(0, idx)];
    if (!ps) return;
    // taille de départ : la taille naturelle (à 160 %), bornée entre 15 % et 55 % de la largeur
    let wn = Math.max(0.15, Math.min(0.55, (w * echelle) / (ps.width * 1.6)));
    let hn = wn * (h / w) * (ps.width / ps.height);
    if (hn > 0.6) { wn *= 0.6 / hn; hn = 0.6; }
    // position : le point de dépôt, sinon le centre de la partie visible de la page
    let cx = 0.5, cy = 0.5;
    if (cible) { cx = cible.x; cy = cible.y; } else {
      const el = scrollRef.current, top = layout.offsets[idx];
      if (el && top != null) cy = Math.max(hn / 2, Math.min(1 - hn / 2, (el.scrollTop + el.clientHeight / 2 - top) / (ps.height * scale)));
    }
    const blobId = blobIdExistant || await putBlob(file);
    const surPage = (imagesByPage[ps.cle] || []);
    const rec = newImageCollee({ ficheId: nsAnnot, page: ps.cle, blobId, nom: file.name || null,
      x: Math.max(0, Math.min(1 - wn, cx - wn / 2)), y: Math.max(0, Math.min(1 - hn, cy - hn / 2)), width: wn, height: hn,
      z: surPage.length ? Math.max(...surPage.map((i) => i.z || 0)) + 1 : 0 });
    /* DESSIN DU TÉLÉPHONE AVEC SES ZONES DE TEXTE (02/10 soir) : chaque zone devient un
       TEXTE LIBRE ordinaire, posé à sa place au-dessus de l'image — on le déplace, le
       modifie, le supprime comme n'importe quel texte libre. Image et textes : UNE
       seule entrée d'annulation. Taille : celle du téléphone rapportée à l'image, au
       zoom de référence (160 %) ; comme tout texte libre, elle reste fixe à l'écran. */
    const refPx = ps.width * 1.6; // largeur de la page en px au zoom de référence
    const textesRecs = (textes || []).filter((t) => t && String(t.texte || '').trim()).map((t) => {
      const px = Math.max(8, Math.min(72, Math.round(t.taille * rec.width * refPx)));
      // zone riche (02/10 nuit) : son HTML (gras, tailles, couleurs, sur la zone ou sur un
      // mot) devient le document du texte libre ; zone d'avant : texte brut
      const lignes = String(t.texte).split('\n');
      const content = t.html
        ? htmlVersTiptap(t.html, { k: (t.k || 0) * rec.width * refPx, taille: px, gras: t.gras, italique: t.italique, souligne: t.souligne, align: t.align })
        : { type: 'doc', content: lignes.map((l) => ({ type: 'paragraph', content: l ? [{ type: 'text', text: l, marks: [{ type: 'textStyle', attrs: { fontSize: `${px}px` } }] }] : [] })) };
      const enr = newTexteLibre({ ficheId: nsAnnot, page: ps.cle, couleur: t.couleur || 'noir', content,
        x: Math.max(0, Math.min(0.98, rec.x + t.x * rec.width - 4 / refPx)),
        y: Math.max(0, Math.min(0.98, rec.y + t.y * rec.height - 2 / (ps.height * 1.6))),
        // zone TRACÉE au téléphone : même largeur, retour à la ligne identique (largeur fixée)
        width: Math.min(0.9, Math.max(0.05, t.boite ? t.largeur * rec.width + 10 / refPx : t.largeur * rec.width * 1.2 + 12 / refPx)),
        // hauteur TRACÉE au téléphone (minimum ; la zone s'allonge si le texte la dépasse)
        height: t.hauteur ? Math.max(0.02, t.hauteur * rec.height) : 0.02 });
      // ATTACHÉ à l'image du dessin (02/10 nuit) : il la suit quand elle bouge
      return { ...enr, imageId: rec.id, ...(t.boite ? { largeurFixe: true } : {}) };
    });
    await hist.appliquer(textesRecs.length
      ? cmdGroupe(`Dessin posé (avec ${textesRecs.length} texte${textesRecs.length > 1 ? 's' : ''})`, [cmdCreer('annotations', rec, 'Image collée'), ...textesRecs.map((t) => cmdCreer('annotations', t, 'Texte du dessin'))])
      : cmdCreer('annotations', rec, 'Image collée'));
    setOutil('main'); setActiveEditId(null);
    setImageActiveId(rec.id);
  };
  /* ---- DOCUMENT : UNE IMAGE S'INSÈRE TOUJOURS DANS LE FLUX (10/10,
     docs/compte-rendu-images-surlignage-json.md) ----
     Bouton Image de la barre, ⌘V, glisser-déposer, Dessins : dans un document, l'image
     devient un BLOC du texte (documents/lib/imageVue.js : déplaçable entre blocs,
     redimensionnable, paginée, texte reconnu) — à la position du curseur s'il est sur la
     page visée, sinon à la fin de cette page ; au point de dépôt pour un glisser.
     L'image-annotation flottante n'existe que sur un PDF importé. */
  const curseurFluxPose = useRef(false); // le curseur a été posé dans le texte du document
  const pageDePos = (pos) => {
    const b = (pagination && pagination.blocs) || [];
    let k = null;
    for (const x of b) { if (x.pos <= pos) k = x.page; else break; }
    return k;
  };
  const finDePage = (k) => {
    const ed = fluxRef.current.editor;
    const b = (pagination && pagination.blocs) || [];
    const surK = b.filter((x) => x.page === k);
    while (surK.length && surK[surK.length - 1].type === 'sautDePage') surK.pop();
    if (!surK.length) { const i = b.findIndex((x) => x.page > k); return i < 0 ? ed.state.doc.content.size : b[i].pos; }
    const der = surK[surK.length - 1];
    const n = ed.state.doc.nodeAt(der.pos);
    if (n && n.type.name === 'paragraph' && n.content.size === 0 && surK.length > 1) return der.pos; // avant la ligne vide finale
    return der.pos + (n ? n.nodeSize : 0);
  };
  const insererImageFlux = async (file, { ecran = null, blobIdExistant = null, echelle = 1, textes = null } = {}) => {
    const api = fluxRef.current;
    const ed = api && api.editor;
    if (!ed || ed.isDestroyed) return false;
    let w = 0;
    try { const bm = await createImageBitmap(file); w = bm.width; if (bm.close) bm.close(); } catch (e) { return false; }
    const blobId = blobIdExistant || await putBlob(file);
    let pos = null;
    if (ecran) pos = limiteSous(ed, ecran.x, ecran.y).pos;
    else {
      const k = pageCourante - 1;
      if (!(curseurFluxPose.current && pageDePos(ed.state.selection.from) === k)) pos = finDePage(k);
    }
    // un dessin du téléphone est rendu en ×2 : sa taille de départ est celle du dessin
    const attrs = { src: URL.createObjectURL(file), blobId, ...(echelle !== 1 && w ? { width: Math.max(40, Math.round(w * echelle)) } : {}) };
    insererImageBloc(ed, attrs, pos);
    // ses zones de texte : des paragraphes sous l'image (dans un document, rien ne flotte)
    const lignes = (textes || []).map((t) => String((t && t.texte) || '').trim()).filter(Boolean);
    if (lignes.length) {
      const { state } = ed;
      const P = state.schema.nodes.paragraph;
      const apres = state.selection.to;
      ed.view.dispatch(state.tr.insert(apres, lignes.flatMap((l) => l.split('\n')).map((l) => P.create(null, l ? state.schema.text(l) : null))));
    }
    setOutil('main'); setActiveEditId(null);
    return true;
  };
  /* CONVERSION UNIQUE des images flottantes d'un DOCUMENT en blocs du flux (10/10) : à
     l'ouverture, une fois le flux chargé et paginé. Sauvegarde putBackup d'abord ; chaque
     image est insérée à la limite de bloc la plus proche de son centre, à sa taille (et
     dans son orientation : une rotation est appliquée aux pixels) ; ses mots surlignés
     deviennent des notions de l'image. L'annotation n'est PAS supprimée (aucune écriture
     destructive) : elle reçoit `convertieEnFlux` (champ ajouté) et n'est plus affichée.
     Idempotent : le bloc porte l'id de l'annotation d'origine (`deAnnotation`). */
  const conversionImages = useRef(null);
  useEffect(() => {
    if (!modeDoc || !pagination || !editsCharges || conversionImages.current === ficheId) return;
    const api = fluxRef.current;
    const ed = api && api.editor;
    if (!ed || ed.isDestroyed || !api.estCharge || !api.estCharge()) return;
    const images = edits.filter((a) => a.kind === 'image' && indexDePage(a.page) >= 0);
    if (!images.length) { conversionImages.current = ficheId; return; }
    conversionImages.current = ficheId;
    (async () => {
      const surl = highlights.filter((h) => images.some((i) => i.id === h.imageId));
      await putBackup('pre-images-flux-' + ficheId + '-' + Date.now(), { annotations: images, highlights: surl, flux: ed.getJSON() });
      const deja = new Set();
      ed.state.doc.descendants((n) => { if (n.type.name === 'image' && n.attrs.deAnnotation) deja.add(n.attrs.deAnnotation); });
      const pagesEl = scrollRef.current && scrollRef.current.querySelector('.pdfr-pages');
      const pr = pagesEl ? pagesEl.getBoundingClientRect() : null;
      const aInserer = [];
      for (const img of images) {
        if (deja.has(img.id)) continue;
        const idx = indexDePage(img.page), ps = pageSizes[idx];
        let blob = await getBlob(img.blobId);
        if (!blob || !ps || !pr) continue;
        let blobId = img.blobId;
        const rot = ((Number(img.rotation) || 0) % 360 + 360) % 360;
        let wPage = img.width * ps.width, hPage = img.height * ps.height;
        if (rot) {
          // l'orientation affichée passe dans les pixels (un bloc du flux ne pivote pas)
          try {
            const bm = await createImageBitmap(blob);
            const th = (rot * Math.PI) / 180, c = Math.abs(Math.cos(th)), sn = Math.abs(Math.sin(th));
            const cv = document.createElement('canvas');
            cv.width = Math.round(bm.width * c + bm.height * sn); cv.height = Math.round(bm.width * sn + bm.height * c);
            const g = cv.getContext('2d');
            g.translate(cv.width / 2, cv.height / 2); g.rotate(th); g.drawImage(bm, -bm.width / 2, -bm.height / 2);
            if (bm.close) bm.close();
            blob = await new Promise((ok) => cv.toBlob(ok, 'image/png'));
            blobId = await putBlob(blob);
            [wPage, hPage] = [wPage * c + hPage * sn, wPage * sn + hPage * c];
          } catch (e) { /* orientation d'origine */ }
        }
        let naturel = null;
        try { const bm = await createImageBitmap(blob); naturel = bm.width / bm.height; if (bm.close) bm.close(); } catch (e) { naturel = null; }
        const y = pr.top + layout.offsets[idx] + (img.y + img.height / 2) * ps.height * scale;
        const pos = limiteSous(ed, pr.left + pr.width / 2, y).pos;
        const ratio = wPage / (hPage || 1);
        const notions = surl.filter((h) => h.imageId === img.id && Array.isArray(h.mots) && h.mots.length)
          .map((h) => ({ id: genId('nd'), couleur: h.couleur || 'jaune', mots: h.mots }));
        aInserer.push({ img, pos, y, attrs: {
          src: URL.createObjectURL(blob), blobId, align: 'center', deAnnotation: img.id,
          width: Math.max(40, Math.round(wPage)),
          ...(naturel && Math.abs(ratio / naturel - 1) > 0.02 ? { height: Math.round(hPage) } : {}),
          ...(notions.length ? { notions } : {}),
        } });
      }
      if (ed.isDestroyed) return;
      // du bas vers le haut : chaque insertion laisse les positions au-dessus intactes
      aInserer.sort((a, b) => (b.pos - a.pos) || (b.y - a.y));
      if (aInserer.length) {
        const tr = ed.state.tr.setMeta('journalIgnorer', true).setMeta('addToHistory', false);
        const T = ed.state.schema.nodes.image;
        for (const x of aInserer) tr.insert(Math.min(x.pos, tr.doc.content.size), T.create(x.attrs));
        if (tr.doc.lastChild && tr.doc.lastChild.type === T) tr.insert(tr.doc.content.size, ed.state.schema.nodes.paragraph.create());
        ed.view.dispatch(tr);
        api.vider();
      }
      // les annotations d'origine : marquées (champ ajouté), retirées de l'affichage
      const marques = images.map((a) => ({ ...a, convertieEnFlux: new Date().toISOString() }));
      for (const a of marques) await put('annotations', a);
      for (const h of surl) await put('highlights', { ...h, convertieEnFlux: new Date().toISOString() });
      appliquerLocal([...images.map((a) => ({ store: 'annotations', avant: a, apres: null })), ...surl.map((h) => ({ store: 'highlights', avant: h, apres: null }))]);
      // compte gardé sur l'appareil (meta, local) : { ficheId: n } — repris dans le compte-rendu
      try { const m = (await getMeta('images-flux-converties')) || {}; m[ficheId] = (m[ficheId] || 0) + images.length; await setMeta('images-flux-converties', m); } catch (e) { /* ignore */ }
      try { console.info(`[MedRevise] ${images.length} image(s) flottante(s) convertie(s) en blocs du flux (document ${ficheId})`); } catch (e) { /* ignore */ }
    })();
  }, [modeDoc, pagination, editsCharges, ficheId]); // eslint-disable-line react-hooks/exhaustive-deps
  /* les TEXTES ATTACHÉS (dessin du téléphone) suivent l'image : même entrée d'annulation */
  const ratioPage = (cle) => { const ps = pageSizes.find((p) => p.cle === cle); return ps && ps.width ? ps.height / ps.width : 1.414; };
  const textesAttaches = (img) => edits.filter((a) => a.kind === 'texte' && a.imageId === img.id);
  const majImage = async (avant, apres, libelle) => {
    const actuel = edits.find((a) => a.id === avant.id) || avant;
    const nouvelle = { ...actuel, ...GEO(apres), ...(apres.rotation !== undefined ? { rotation: apres.rotation } : {}) };
    const suivent = textesAttaches(actuel).map((t) => cmdModifier('annotations', t, { ...t, ...suivreImage(actuel, nouvelle, t, ratioPage(actuel.page)) }, 'Texte du dessin'));
    const cmd = cmdModifier('annotations', actuel, nouvelle, libelle);
    await hist.appliquer(suivent.length ? cmdGroupe(libelle, [cmd, ...suivent]) : cmd);
  };
  const supprimerImage = async (img) => {
    if (imageActiveId === img.id) setImageActiveId(null);
    const textes = textesAttaches(img);
    const surl = highlights.filter((h) => h.imageId === img.id); // ses mots surlignés partent avec elle (annulable ensemble)
    await hist.appliquer(textes.length || surl.length
      ? cmdGroupe(textes.length ? 'Suppression du dessin et de ses textes' : 'Suppression de l’image', [cmdSupprimer('annotations', img, 'Suppression de l’image'),
        ...textes.map((t) => cmdSupprimer('annotations', t, 'Texte du dessin')), ...surl.map((h) => cmdSupprimer('highlights', h, 'Surlignage de l’image'))])
      : cmdSupprimer('annotations', img, 'Suppression de l’image'));
  };
  // CALQUES : `z` ne classe que les images d'une même page entre elles. Une seule
  // écriture par geste (la nouvelle valeur s'intercale), donc une entrée d'annulation.
  const changerCalque = async (img, action) => {
    const liste = imagesByPage[img.page] || [];
    const i = liste.findIndex((x) => x.id === img.id);
    if (i < 0 || liste.length < 2) return;
    const zs = liste.map((x) => x.z || 0);
    let z = img.z || 0;
    if (action === 'premier') { if (i === liste.length - 1) return; z = Math.max(...zs) + 1; }
    else if (action === 'arriere') { if (i === 0) return; z = Math.min(...zs) - 1; }
    else if (action === 'avancer') { if (i === liste.length - 1) return; z = i + 2 < liste.length ? (zs[i + 1] + zs[i + 2]) / 2 : zs[i + 1] + 1; }
    else if (action === 'reculer') { if (i === 0) return; z = i - 2 >= 0 ? (zs[i - 1] + zs[i - 2]) / 2 : zs[i - 1] - 1; }
    const libelles = { premier: 'Image au premier plan', arriere: 'Image à l’arrière-plan', avancer: 'Image avancée', reculer: 'Image reculée' };
    await hist.appliquer(cmdModifier('annotations', img, { ...img, z }, libelles[action]));
  };
  // désélection : clic ailleurs que sur l'image ou sa barre ; Échap
  useEffect(() => {
    if (!imageActiveId) return undefined;
    const onDown = (e) => { if (!(e.target.closest && e.target.closest('.pdfr-image'))) setImageActiveId(null); };
    const onKey = (e) => { if (e.key === 'Escape') setImageActiveId(null); };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
  }, [imageActiveId]);
  // Cmd/Ctrl+V d'une image (capture d'écran, image copiée d'une page web…) : posée
  // sur la page affichée. Jamais quand on colle DANS un texte (boîte, champ…).
  const ajouterImageRef = useRef(ajouterImage); ajouterImageRef.current = ajouterImage;
  useEffect(() => {
    if (!pret || srcTab !== 'pdf') return undefined;
    const onPaste = (e) => {
      if (e.defaultPrevented) return; // déjà pris (formulaire de flashcard ouvert : lib/collerImage.js)
      if (cibleEditable(e.target) || cibleEditable(document.activeElement)) return;
      if (dansLeTableau(e.target) || dansLeTableau(document.activeElement)) return; // le tableau a ses propres raccourcis
      const f = imageDuPressePapier(e.clipboardData);
      if (!f) return;
      e.preventDefault();
      ajouterImageRef.current(f);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [pret, srcTab]);
  /* ---- DESSINS REÇUS DU TÉLÉPHONE (02/10, docs/mecanique-dessin-mobile.md §5) ----
     Sondés au cloud (lecture ciblée du store `dessins`) toutes les 10 s tant que
     l'onglet est visible ; un dessin se pose comme une image collée. */
  const [dessins, setDessins] = useState([]);
  const [essaiDessins, setEssaiDessins] = useState(0);
  /* DÉTECTION AUTOMATIQUE (02/10 nuit) : sondage toutes les 2 s tant que l'onglet est
     visible (une lecture filtrée sur un petit store). Le lecteur ne se re-rend que si
     la liste a CHANGÉ. Un dessin jamais vu sur cet appareil (mémoire locale des « vus »)
     déclenche l'animation d'arrivée ; au tout premier passage, l'existant est marqué vu. */
  const signatureDessins = useRef('');
  const [arrivee, setArrivee] = useState(null); // { dessin, autres }
  const [pulseDessins, setPulseDessins] = useState(0);
  const boutonDessinsRef = useRef(null);
  useSondage('dessins', async () => {
    const liste = await dessinsDeFiche(ficheId);
    const sig = liste.map((d) => d.id).join(',');
    if (sig !== signatureDessins.current) {
      signatureDessins.current = sig;
      setDessins(liste);
      setEssaiDessins((n) => n + 1); // les vignettes sans image réessaient
      let vus = null;
      try { vus = JSON.parse(localStorage.getItem('medrevise.dessinsVus') || 'null'); } catch (e) { vus = null; }
      const premier = !Array.isArray(vus);
      const set = new Set(premier ? [] : vus);
      const nouveaux = premier ? [] : liste.filter((d) => !set.has(d.id));
      liste.forEach((d) => set.add(d.id));
      try { localStorage.setItem('medrevise.dessinsVus', JSON.stringify([...set].slice(-500))); } catch (e) { /* ignore */ }
      if (nouveaux.length) { setArrivee({ dessin: nouveaux[0], autres: nouveaux.length - 1 }); setPulseDessins((n) => n + 1); }
    }
  }, { actif: !!ficheId, ms: 2000 });
  const poserDessin = async (d, cible = null) => {
    const blob = await getBlob(d.blobId);
    if (!blob) { setExportErreur('L’image de ce dessin n’est pas encore arrivée — réessaie dans quelques secondes.'); return; }
    const f = blob.type ? blob : new Blob([blob], { type: 'image/png' });
    try { f.name = 'Dessin du téléphone'; } catch (err) { /* Blob : nom en lecture seule, sans importance */ }
    await ajouterImage(f, cible, d.blobId, 0.5, d.textes || null); // PNG rendu en ×2 sur le téléphone ; ses zones de texte en textes libres
  };
  const retirerUnDessin = async (d) => { await retirerDessin(d); setDessins(await dessinsDeFiche(ficheId)); };

  // glisser-déposer un fichier image sur une page : posée au point de dépôt
  const deposerImage = (e) => {
    const idDessin = e.dataTransfer && e.dataTransfer.getData(TYPE_GLISSER);
    if (idDessin) {
      e.preventDefault();
      const d = dessins.find((x) => x.id === idDessin);
      if (!d) return;
      if (modeDoc) { poserDessin(d, { ecran: { x: e.clientX, y: e.clientY } }); return; }
      const pageEl = e.target.closest && e.target.closest('.pdfr-page');
      const sz = pageEl && pageSizes.find((p) => String(p.cle) === pageEl.dataset.cle);
      if (!sz) { poserDessin(d); return; }
      const r = pageEl.getBoundingClientRect();
      poserDessin(d, { page: sz.cle, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
      return;
    }
    if (e.defaultPrevented) return; // déposée DANS le texte d'une page de document : déjà insérée
    const f = [...((e.dataTransfer && e.dataTransfer.files) || [])].find((x) => /^image\//.test(x.type));
    if (!f) return;
    e.preventDefault();
    if (modeDoc) { ajouterImage(f, { ecran: { x: e.clientX, y: e.clientY } }); return; }
    const pageEl = e.target.closest && e.target.closest('.pdfr-page');
    const sz = pageEl && pageSizes.find((p) => String(p.cle) === pageEl.dataset.cle);
    if (!sz) { ajouterImage(f); return; }
    const r = pageEl.getBoundingClientRect();
    ajouterImage(f, { page: sz.cle, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
  };

  /* ---- TEXTE LIBRE et « ? » (01/10) : un clic = un élément posé ----
     Le texte libre est une boîte sans cadre (même NoteBox, même éditeur) : on le
     pose, on écrit tout de suite. Le « ? » se pose et l'outil reste actif — on en
     marque souvent plusieurs d'affilée en relisant. */
  const poserElement = async (quoi, { page, x, y }) => {
    if (quoi === 'texte') {
      // (20/10 soir) gabarit compact : une ligne de ~120 px à 100 %, qui grandit avec le texte (pdfShared.js#COMPACT)
      const sz = pageSizes.find((p) => String(p.cle) === String(page)) || pageSizes[0] || { width: 600, height: 800 };
      const ligne = fractionPx100(COMPACT.hauteurMin, sz.height), largeur = fractionPx100(COMPACT.largeurVide, sz.width);
      const rec = { ...newTexteLibre({ ficheId: nsAnnot, page, x: Math.min(x, 1 - largeur), y: Math.max(0, Math.min(y - ligne / 2, 1 - ligne)),
        width: largeur, height: ligne, couleur: couleurTexte }), compacte: true };
      hist.appliquer(cmdCreer('annotations', rec, 'Texte libre'));
      videsFraiches.current.add(rec.id);
      setActiveEditId(rec.id);
      setOutil('main');
    } else if (quoi === 'question') {
      await hist.appliquer(cmdCreer('annotations', newQuestionMarque({ ficheId: nsAnnot, page, x, y }), 'Point d’interrogation'));
    }
  };
  const changerCouleurTexte = async (t, couleur) => {
    setCouleurTexte(couleur);
    const actuel = boiteFraiche(t.id, t);
    if (actuel && actuel.couleur !== couleur) await hist.appliquer(cmdModifier('annotations', actuel, { ...actuel, couleur }, 'Couleur du texte'));
  };

  /* ---- TEXTES DES BOÎTES : ALLER-RETOUR JSON ET DOUBLE VERSION (10/10, lib/textesAnnotations.js) ----
     Toutes les écritures passent par l'historique (une entrée par import / par bascule) et ne
     changent QUE le texte : géométrie, couleur, flèches, page et ordre sont recopiés tels quels. */
  const [panneauTextes, setPanneauTextes] = useState(null); // null | 'exporter' | 'importer' | 'affichage'
  /* EXPORT SPÉCIAL IA (10/10 soir, pdf/exportIA.js) : même source que l'export PDF annoté,
     texte en cours de frappe compris ; rien n'est écrit */
  const [panneauExportIA, setPanneauExportIA] = useState(false);
  const annotationsFraiches = () => (editsRef.current || []).map((a) => (a.id === activeEditIdRef.current && editLastJson.current ? avecContenuEdite(a, editLastJson.current) : a));
  const ordrePagesIA = () => pageSizes.map((p) => p.cle);
  const preparerIA = (portee) => preparerSourceIA({ titre: (fiche && (fiche.titre || fiche.nom)) || '', pdfId: pdfIdActif, highlights,
    annotations: annotationsFraiches(), ordrePages: ordrePagesIA(), portee, pageIndex: pageCourante - 1 });
  const jsonIA = (portee) => {
    const toutes = boitesOrdonnees(annotationsFraiches(), ordrePagesIA());
    const cles = portee === 'page' ? [ordrePagesIA()[pageCourante - 1]] : ordrePagesIA();
    return construireExportIA({ cours: (fiche && (fiche.titre || fiche.nom)) || '', page: portee === 'page' ? pageCourante : null, boites: boitesOrdonnees(annotationsFraiches(), cles), refs: refsCourtes(toutes) });
  };
  // annotations à jour, texte en cours de frappe compris ; la boîte ouverte est refermée
  // (son texte est enregistré dans la version affichée) avant toute réécriture
  const editsFraisFermes = () => {
    const id = activeEditIdRef.current;
    const enAttente = id && editSaveTimer.current ? editLastJson.current : null;
    if (id) setActiveEditId(null);
    return (editsRef.current || []).map((a) => (a.id === id && enAttente ? avecContenuEdite(a, enAttente) : a));
  };
  const basculerBoites = async (liste, version, libelle) => {
    const frais = editsFraisFermes();
    const cmds = [];
    for (const b of liste) {
      const base = frais.find((a) => a.id === b.id);
      const apres = base && basculerVersion(base, version);
      if (apres) cmds.push(cmdModifier('annotations', base, apres, libelle || 'Version du texte'));
    }
    if (cmds.length) await hist.appliquer(cmdGroupe(version === 'alt' ? 'Version IA affichée' : 'Version originale affichée', cmds));
    return cmds.length;
  };
  const clesPortee = (portee) => (portee === 'page'
    ? [pageSizes[pageCourante - 1] && pageSizes[pageCourante - 1].cle].filter((c) => c != null)
    : pageSizes.map((p) => p.cle));
  const compterTextes = (portee) => {
    const bs = boitesOrdonnees(edits, clesPortee(portee));
    const doubles = bs.filter(aDeuxVersions);
    return { boites: bs.length, doubles: doubles.length, alt: doubles.filter((b) => versionAffichee(b) === 'alt').length };
  };
  const exporterTextes = async (portee, mode) => {
    const frais = (editsRef.current || []).map((a) => (a.id === activeEditIdRef.current && editLastJson.current ? avecContenuEdite(a, editLastJson.current) : a));
    const boites = boitesOrdonnees(frais, clesPortee(portee));
    const obj = construireExport({ cours: (fiche && (fiche.titre || fiche.nom)) || '', page: portee === 'page' ? pageCourante : null, boites });
    const json = JSON.stringify(obj, null, 2);
    const n = boites.length;
    if (mode === 'copier') {
      try { await navigator.clipboard.writeText(json); } catch (e) { return { ok: false, texte: 'Copie refusée par le navigateur.' }; }
      return { ok: true, texte: `JSON copié : ${n} boîte${n > 1 ? 's' : ''}.` };
    }
    const nom = String((fiche && fiche.titre) || 'cours').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'cours';
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${nom}-textes-annotations${portee === 'page' ? '-p' + pageCourante : ''}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return { ok: true, texte: `Fichier exporté : ${n} boîte${n > 1 ? 's' : ''}.` };
  };
  const importerTextes = async (brut) => {
    const lu = lireImport(brut);
    if (lu.erreur) return { ok: false, texte: lu.erreur };
    const frais = editsFraisFermes();
    const plan = planImport(lu.boxes, frais);
    if (plan.maj.length) {
      await hist.appliquer(cmdGroupe(`Import des textes d’annotations (${plan.maj.length})`,
        plan.maj.map(({ avant, apres }) => cmdModifier('annotations', avant, apres, 'Texte importé'))));
    }
    return {
      ok: true, texte: resumeImport(plan, lu.invalides),
      details: [plan.inconnus.length ? `Id${plan.inconnus.length > 1 ? 's' : ''} ignoré${plan.inconnus.length > 1 ? 's' : ''} : ${plan.inconnus.join(', ')}` : '',
        plan.ambigus && plan.ambigus.length ? `Ref ambiguë${plan.ambigus.length > 1 ? 's' : ''} : ${plan.ambigus.join(', ')}` : ''].filter(Boolean).join(' · ') || null,
    };
  };
  const basculerTextes = async (portee, version) => {
    const liste = boitesOrdonnees(editsRef.current, clesPortee(portee)).filter(aDeuxVersions);
    const n = await basculerBoites(liste, version);
    const v = version === 'alt' ? 'version IA' : 'version originale';
    return { ok: true, texte: n ? `${n} boîte${n > 1 ? 's' : ''} en ${v}.` : `Tout est déjà en ${v}.` };
  };

  const supprimerBoite = async (b) => {
    if (!b) return;
    const actuel = boiteFraiche(b.id, b); // restaurer la boîte AVEC son texte le plus récent
    if (activeEditId === b.id) setActiveEditId(null);
    await hist.appliquer(cmdSupprimer('annotations', actuel || b, 'Suppression de la boîte'));
  };

  // Chantier 1 : UNE SEULE instance TipTap, possédée ici et partagée par le bloc affiché
  // (positionné sur sa page) ET la barre d'outils fixe — sinon les deux se désynchronisent
  // (historique d'annulation séparé, boutons qui ne reflètent pas ce qui s'affiche).
  const activeEdit = edits.find((a) => a.id === activeEditId) || null;
  const editor = useEditor({
    extensions: RICH_EXTENSIONS,
    content: (activeEdit && activeEdit.content) || undefined,
    onUpdate: ({ editor: ed }) => {
      const id = activeEditIdRef.current; // jamais l'instantané de la création (défaut 3)
      if (!id) return;
      const json = ed.getJSON();
      editLastJson.current = json;
      clearTimeout(editSaveTimer.current);
      editSaveTimer.current = setTimeout(() => { saveEditContent(id, json); editLastJson.current = null; }, 400);
    },
  }, [activeEditId]);
  // au changement de bloc actif (ou fermeture) : flush immédiat d'une sauvegarde en attente
  useEffect(() => () => {
    if (editSaveTimer.current && editLastJson.current && activeEditIdRef.current) {
      clearTimeout(editSaveTimer.current);
      saveEditContent(activeEditIdRef.current, editLastJson.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEditId]);

  // BUG 1 : `highlights.filter(...)`/`edits.filter(...)`/`matches.filter(...)` en JSX créaient
  // un NOUVEAU tableau à CHAQUE rendu de PdfReader (même quand seul un highlight non-lié à
  // cette page changeait), donc une nouvelle référence de prop `matches` à chaque fois — qui
  // était dans les dépendances de l'effet de rendu canvas (voir PdfPageContent), le refaisant
  // partir pour rien. Deux rendus canvas qui se chevauchent sur le MÊME <canvas> pouvaient
  // laisser sa matrice de transform dans un état incohérent (page "à l'envers" jusqu'au
  // prochain scroll, qui déclenche un rendu propre). Regrouper une fois par page, mémoïsé sur
  // le tableau source réel, rend ces props stables sauf changement effectif de leur contenu.
  const groupByPage = (arr) => { const map = {}; arr.forEach((x) => { (map[x.page] || (map[x.page] = [])).push(x); }); return map; };
  const highlightsByPage = useMemo(() => groupByPage(highlights.filter((h) => h.ficheId === nsAnnot)), [highlights, nsAnnot]);
  // deux familles dans le MÊME store : les blocs de remplacement de texte (sans
  // `kind`, historiques) et les boîtes libres (`kind: 'libre'`). Rendues par des
  // composants différents, jamais mélangées.
  // annotations EN MÉMOIRE, séparées par type (lib/annotationTypes.js) : une
  // collection par catégorie, puis regroupées par page pour l'affichage.
  const parType = useMemo(() => separerParType([], apercuCouleur ? editsVus.map((a) => (a.id === apercuCouleur.id ? { ...a, couleur: apercuCouleur.couleur } : a)) : editsVus), [editsVus, apercuCouleur]);
  const blocsByPage = useMemo(() => groupByPage(parType.bloc), [parType]);
  const boitesByPage = useMemo(() => groupByPage(parType.boite), [parType]);
  // traits de crayon ET de surligneur : même calque d'encre (le mode règle le rendu)
  const traitsByPage = useMemo(() => groupByPage([...parType.trait, ...parType.surligneur]), [parType]);
  const textesByPage = useMemo(() => groupByPage(parType.texte), [parType]);
  const formesByPage = useMemo(() => groupByPage(parType.forme), [parType]);
  // images d'une page, du FOND vers le DEVANT (ordre de rendu = ordre des calques)
  const imagesByPage = useMemo(() => {
    const m = groupByPage(parType.image);
    Object.values(m).forEach((l) => l.sort((a, b) => (a.z - b.z) || String(a.createdAt).localeCompare(String(b.createdAt))));
    return m;
  }, [parType]);
  const questionsByPage = useMemo(() => groupByPage(parType.question), [parType]);
  const matchesByPage = useMemo(() => groupByPage(matches), [matches]);

  // mode « Notions » du panneau (05/10) : MES passages surlignés, recherche, et c'est tout
  // (« Copier les notions » et la légende des couleurs vivent dans le menu Fichier / l'aide)
  const aller = (h) => {
    scrollToPageFraction(h.page, (h.rects[0] && h.rects[0].y) || 0);
    setFlashHlId(h.id);
    clearTimeout(flashMinuteur.current);
    flashMinuteur.current = setTimeout(() => setFlashHlId(null), 1600);
  };
  const qNotions = filtreNotions.trim().toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const notionsFiltrees = qNotions
    ? highlights.filter((h) => `${h.texte} ${h.note || ''} ${COLOR_TAG[h.couleur] || ''}`.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(qNotions))
    : highlights;
  const notionsAutreFiltrees = qNotions
    ? notionsAutreDoc.filter((h) => `${h.texte} ${h.note || ''} ${COLOR_TAG[h.couleur] || ''}`.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(qNotions))
    : notionsAutreDoc;
  // une notion de l'autre document : on bascule, puis on y va dès que ses surlignages sont chargés
  const notionVisee = useRef(null);
  const allerNotionAutreDoc = (h) => { notionVisee.current = h.id; basculerJumelle(); };
  useEffect(() => {
    if (!notionVisee.current || !restaure) return;
    const h = highlights.find((x) => x.id === notionVisee.current);
    if (h) { notionVisee.current = null; setTimeout(() => aller(h), 60); }
  }, [highlights, restaure]); // eslint-disable-line react-hooks/exhaustive-deps
  const notesPanneau = useMemo(() => (ficheReelle ? (
    <NotesEditor ref={notesRef} ficheId={ficheReelle.id} compact placeholder="Tes notes sur ce cours… « # » titre, « - » liste, « [] » case"
      onChange={(contenu) => { synchroniserNotionsDoc(ficheReelle.id, contenu).then((ch) => { if (ch) reloadHighlights(); }); }}
      onCreerNotion={async (n) => { await creerNotionDoc(ficheReelle.id, n); reloadHighlights(); }}
      onCreerFlashcard={(texte) => setFlashcardNotes((f) => ({ texte, n: (f ? f.n : 0) + 1 }))} />
  ) : null), [ficheReelle && ficheReelle.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // page (index) du texte qui porte une notion — null si elle est dans l'onglet « Notes »
  const pageDeNotion = (id) => {
    if (modeDoc && pagination && fluxRef.current && fluxRef.current.editor) {
      const json = fluxRef.current.editor.getJSON();
      const i = (json.content || []).findIndex((b) => JSON.stringify(b).includes(id));
      return i >= 0 && pagination.blocs[i] ? pagination.blocs[i].page : null;
    }
    const liste = pageSizesRef.current;
    for (let i = 0; i < liste.length; i++) {
      const c = corpsPages.current[liste[i].cle];
      if (c && JSON.stringify(c).includes(id)) return i;
    }
    return null;
  };
  // (15/10 soir) cours document, fiche affichée : une notion du DOCUMENT ramène au document, puis sur elle
  const notionDocVisee = useRef(null);
  useEffect(() => {
    const h = notionDocVisee.current;
    if (!h || !modeDoc || !pagination || !restaure) return;
    notionDocVisee.current = null;
    setTimeout(() => allerNotionNotesRef.current(h), 120);
  }, [modeDoc, pagination, restaure]); // eslint-disable-line react-hooks/exhaustive-deps
  const allerNotionNotes = (h) => {
    if (modeDocCours && surFiche) { notionDocVisee.current = h; basculerJumelle('original'); return; }
    if (modeDoc && fluxRef.current) {
      const el = fluxRef.current.allerANotion(h.docNotionId);
      if (el) { centrerRect(el.getBoundingClientRect()); return; }
    }
    const i = pageDeNotion(h.docNotionId);
    if (i != null) {
      allerALaPage(i + 1);
      const viser = (essai) => setTimeout(() => {
        const api = pagesTexte.current.get(pageSizesRef.current[i] && pageSizesRef.current[i].cle);
        if (!(api && api.allerANotion(h.docNotionId)) && essai < 8) viser(essai + 1);
      }, 120);
      viser(0);
      return;
    }
    setOngletDemande((o) => ({ id: 'notes', n: (o ? o.n : 0) + 1 }));
    setTimeout(() => { if (notesRef.current) notesRef.current.allerANotion(h.docNotionId); }, 320);
  };
  const allerNotionNotesRef = useRef(allerNotionNotes); allerNotionNotesRef.current = allerNotionNotes;
  const notionsPdf = (
    <div className="pis-notions">
      {notionsNotes.length > 0 && (
        <div className="hl-notes">
          {notionsNotes.map((h) => (
            <div className="hl-entry" key={h.id} role="button" tabIndex={0} onClick={() => allerNotionNotes(h)} onKeyDown={(e) => { if (e.key === 'Enter') allerNotionNotes(h); }}>
              <span className="hl-dot" style={{ background: couleurHex(h.couleur) }} />
              <div>
                <div className="hl-entry-page">{modeDocCours && surFiche ? <>document<span className="hl-entry-doc">original</span></> : (() => { const i = pageDeNotion(h.docNotionId); return i != null ? 'p.' + (i + 1) : 'Notes'; })()}</div>
                <div className="hl-entry-txt">« {h.texte.length > 140 ? h.texte.slice(0, 140) + '…' : h.texte} »</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {highlights.length + notionsAutreDoc.length > 0 && (
        <label className="pm-recherche">
          <Icon name="search" size={13} />
          <input value={filtreNotions} onChange={(e) => setFiltreNotions(e.target.value)} placeholder={`Chercher dans ${highlights.length + notionsAutreDoc.length} notion${highlights.length + notionsAutreDoc.length > 1 ? 's' : ''}`} />
          {filtreNotions && <button type="button" className="cd-ic" onClick={() => setFiltreNotions('')} title="Effacer"><Icon name="x" size={11} /></button>}
        </label>
      )}
      {highlights.length === 0 && notionsNotes.length === 0 && notionsAutreDoc.length === 0 && (
        <div className="pm-vide">
          <Icon name="edit" size={22} />
          <div>Aucune notion surlignée.</div>
          <div className="hint">Prends le Surligneur et sélectionne du texte : il apparaît ici. Un clic sur une notion t’y ramène.</div>
        </div>
      )}
      {highlights.length + notionsAutreDoc.length > 0 && notionsFiltrees.length + notionsAutreFiltrees.length === 0 && <div className="hint" style={{ padding: '10px 4px' }}>Aucune notion ne contient « {filtreNotions} ».</div>}
      {notionsFiltrees.map((h) => (
        <div className="hl-entry" key={h.id} role="button" tabIndex={0} onClick={() => aller(h)} onKeyDown={(e) => { if (e.key === 'Enter') aller(h); }}>
          <span className="hl-dot" style={{ background: couleurHex(h.couleur) }} />
          <div>
            <div className="hl-entry-page">p.{h.page}{jumelle && <span className="hl-entry-doc">{surFiche ? 'fiche' : 'original'}</span>}{COLOR_TAG[h.couleur] && <span className="hl-entry-tag">{COLOR_TAG[h.couleur]}</span>}</div>
            <div className="hl-entry-txt">« {h.texte.length > 140 ? h.texte.slice(0, 140) + '…' : h.texte} »</div>
            {h.note && <div className="hl-entry-note"><Icon name="edit" size={11} /> {h.note}</div>}
          </div>
        </div>
      ))}
      {/* (15/10) FICHE JUMELLE : les notions de l'autre document restent rattachées au cours —
          listées ici ; un clic bascule vers ce document et y amène */}
      {jumelle && notionsAutreFiltrees.length > 0 && (<>
        <div className="hl-autre-doc">Dans {surFiche ? 'l’original' : 'la fiche'} · {notionsAutreFiltrees.length}</div>
        {notionsAutreFiltrees.map((h) => (
          <div className="hl-entry" key={h.id} role="button" tabIndex={0} onClick={() => allerNotionAutreDoc(h)} onKeyDown={(e) => { if (e.key === 'Enter') allerNotionAutreDoc(h); }}>
            <span className="hl-dot" style={{ background: couleurHex(h.couleur) }} />
            <div>
              <div className="hl-entry-page">p.{h.page}<span className="hl-entry-doc">{surFiche ? 'original' : 'fiche'}</span>{COLOR_TAG[h.couleur] && <span className="hl-entry-tag">{COLOR_TAG[h.couleur]}</span>}</div>
              <div className="hl-entry-txt">« {h.texte.length > 140 ? h.texte.slice(0, 140) + '…' : h.texte} »</div>
            </div>
          </div>
        ))}
      </>)}
    </div>
  );

  // input UNIQUE (PDF ou HTML) : le type est détecté à la volée, le stockage
  // bascule sur pdfId/onSetPdf ou htmlId/onSetHtml en conséquence.
  /* (16/10, lib/fichiersCours.js) pour un COURS : un seul document principal, PDF (ou images
     converties en PDF), taille limitée, un import à la fois. Le chemin d'origine (PDF ou HTML)
     ne sert plus qu'aux structures d'anatomie (onSetPdf / onSetHtml), qui ne sont pas des cours. */
  const [erreurImport, setErreurImport] = useState(null);
  const attachDoc = async (file, fichiers = null) => {
    if (!onSetPdf && !onSetHtml && ficheReelle) {
      const l = fichiers || (file ? [file] : []);
      setErreurImport(null);
      try {
        if (!principalDe(ficheReelle).type) { await importerPrincipal({ fiche: ficheReelle, fichiers: l }); await ctx.reload(); setSrcTab('pdf'); return; }
        // PDF absent de cet appareil : on redonne LE fichier du cours (l'ancien identifiant reste noté)
        const err = verifierFichiers(l, { images: false }); if (err) throw new Error(err);
        await avecVerrou('fichier du cours', async () => {
          const blobId = await putBlob(l[0]);
          await put('fiches', { ...ficheReelle, pdfId: blobId, pdfName: l[0].name, fichiersRetires: [...(ficheReelle.fichiersRetires || []), { type: 'pdf', fileId: ficheReelle.pdfId, fileName: ficheReelle.pdfName, retireLe: new Date().toISOString(), raison: 'fichier absent de l’appareil, rattaché à nouveau' }] });
        });
        await ctx.reload(); setPdfRetry((t) => t + 1);
      } catch (e) { setErreurImport((e && e.message) || 'Import impossible'); }
      return;
    }
    const kind = detectDocKind(file);
    if (!kind) return;
    const blobId = await putBlob(file);
    if (kind === 'html') {
      if (onSetHtml) await onSetHtml(blobId, file.name); else await ctx.setFicheHtml(ficheId, blobId, file.name);
      setSrcTab('html');
    } else {
      if (onSetPdf) await onSetPdf(blobId, file.name); else await ctx.setFichePdf(ficheId, blobId, file.name);
      setSrcTab('pdf');
    }
  };

  if (!fiche) {
    return (
      <div className={embedded ? 'fadein' : 'screen scroll fadein'}>
        <div className="hint">Fiche introuvable.</div>
        <button className="btn" style={{ marginTop: 12 }} onClick={close}><Icon name="chevL" size={14} /> Retour</button>
      </div>
    );
  }

  if (!fiche.pdfId && !fiche.htmlId && !modeDocCours) {
    return (
      <div className={embedded ? 'fadein' : 'screen scroll fadein'}>
        {!embedded && (
          <div className="topbar">
            <div><h1 className="serif">{fiche.titre}</h1><div className="sub">Aucun document rattaché à cette fiche.</div></div>
            <EdTop theme={ctx.theme} onTheme={ctx.toggleTheme} onHub={ctx.goHub} />
          </div>
        )}
        {embedded && avecEntete && entete()}
        <div className="card" style={{ maxWidth: 480, margin: '30px auto', textAlign: 'center', padding: '30px 20px' }}>
          <Icon name="filePdf" size={30} />
          <div style={{ marginTop: 10, fontWeight: 600 }}>{onSetPdf ? 'Attacher le cours' : 'Importer le document principal'}</div>
          <div className="hint" style={{ marginTop: 6 }}>{onSetPdf ? 'PDF ou fiche HTML — stocké localement (IndexedDB), pour lecture (et surlignage pour le PDF) dans l’app.' : 'Un PDF, ou des images (converties en un PDF). Un cours a un seul document principal.'}</div>
          <div className="row" style={{ gap: 10, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
            <label className="btn primary" style={{ cursor: 'pointer', display: 'inline-flex' }}>
              <Icon name="upload" size={14} /> {onSetPdf ? 'Attacher un document' : 'Importer'}
              <input type="file" accept={onSetPdf ? 'application/pdf,text/html,.pdf,.html' : 'application/pdf,.pdf,image/*'} multiple={!onSetPdf} style={{ display: 'none' }}
                onChange={(e) => { const l = [...(e.target.files || [])]; e.target.value = ''; if (l.length) attachDoc(l[0], l); }} />
            </label>
          </div>
          {erreurImport && <div className="fj-erreur" role="alert" style={{ marginTop: 12 }}>{erreurImport}</div>}
          <div style={{ marginTop: 14 }}><button className="btn ghost sm" onClick={close}>Annuler</button></div>
        </div>
      </div>
    );
  }

  // La branche HTML est un AUTRE produit (iframe de cours éditable + sidebar
  // d'items) : elle vit dans son propre fichier depuis l'étape 4 du refactor.
  if (srcTab === 'html') {
    const vueHtml = (
      <CourseHtmlView ctx={ctx} fiche={fiche} ficheId={ficheId} canAddItem={canAddItem}
        embedded={embedded} close={close} onVoirPdf={() => setSrcTab('pdf')} onRattacher={attachDoc} />
    );
    // la vue HTML plein écran a son propre en-tête ; embarquée (Bibliothèque), elle
    // reçoit le même nom renommable + menu Fichier que le PDF
    // (15/10) l'en-tête dans `.pdfr-v2` comme sur les autres pages : même titre, même bouton Fichier
    return embedded && avecEntete ? <div className="fadein"><div className="pdfr-v2">{entete()}</div>{vueHtml}</div> : vueHtml;
  }

  return (
    <div ref={racineRef} className={'pdfr-v2 ' + (embedded ? 'fadein' : 'screen scroll fadein lecteur-plein')
      + (modeTab ? ' lecteur-tab tab-bas' + (panelOpen ? (voletPlein ? ' volet-ouvert volet-plein' : ' volet-ouvert') : ' volet-ferme') : '') + (stylet ? ' stylet-actif' : '')}>
      {/* en-tête : nom renommable + menu Fichier (plein écran, ou Bibliothèque) —
          en tablette, une seule ligne compacte (titre tronqué, « … » pour le reste) */}
      {afficherEntete && (modeTab ? enteteTablette() : entete())}

      {/* tablette : barre fusionnée (48 px) dans un conteneur qui se replie au défilement ;
          ailleurs ce conteneur est transparent (display: contents) */}
      <div className="tab-barres">
      <PdfToolbar
        tablette={modeTab}
        onClose={close}
        // TABLEAU SEUL : les outils du PDF (pages, zoom, annotations, recherche) ne servent
        // à rien — il reste Retour et Panneau ; le tableau a sa propre barre
        {...(tableauDispo && disposition === 'tableau' ? { outilsAnnotation: false, sansPages: true, sansRecherche: true } : {})}
        pageCourante={pageCourante} numPages={nbPagesAffichees} onAllerPage={allerALaPage}
        scale={scale} onZoom={zoomButtons} onAjuster={ajusterALaLargeur}
        outil={outil} setOutil={choisirOutil}
        couleurActive={couleurActive} setCouleurActive={setCouleurActive}
        hist={hist}
        search={search} setSearch={setSearch} matches={matches} activeMatch={activeMatch} searching={searching}
        onPrecedent={gotoPrevMatch} onSuivant={gotoNextMatch} onFermerRecherche={closeSearch}
        panelOpen={panelOpen} setPanelOpen={setPanelOpen} nbNotions={highlights.length + notionsAutreDoc.length}
        basculeDocument={jumelle && srcTab === 'pdf' ? (
          <div className="pdfr-jumelle-bascule" role="group" aria-label="Document affiché">
            <div className="seg" role="tablist">
              {[['original', 'Original', 'Diapositive originale du cours'], ['fiche', 'Fiche', 'Ta fiche résumée']].map(([id, lbl, aide]) => (
                <button key={id} type="button" role="tab" aria-selected={(id === 'fiche') === surFiche} className={'seg-btn' + ((id === 'fiche') === surFiche ? ' active' : '')}
                  onClick={() => basculerJumelle(id)} title={`${aide} — Tab ou ${RACCOURCI}Maj+F pour basculer`}>{lbl}</button>
              ))}
            </div>
          </div>
        ) : null}
        actionsDocument={afficherEntete ? actionsSelection : actionsDocument /* avec l'en-tête, tout est dans « Fichier » (sauf la sélection) */}

        onAjouterPage={pret ? () => insererPageApres(pageCourante - 1) : null}
        boutonDessins={pret && srcTab === 'pdf' && ficheId ? (
          <MenuDessins dessins={dessins} essai={essaiDessins} pdfPret={!!pageSizes.length}
            posesBlobIds={new Set(edits.filter((a) => a.kind === 'image').map((a) => a.blobId))}
            onPoser={(d) => poserDessin(d)} onRetirer={retirerUnDessin} boutonRef={boutonDessinsRef} pulse={pulseDessins} />
        ) : null}
        onAjouterImage={pret ? () => entreeImageRef.current && entreeImageRef.current.click() : null}
        imageDansTexte={modeDoc}
        /* rangée « texte » sous la barre d'outils (09/10) : mise en forme de la boîte active, ou
           du texte du document qui a le curseur — jamais avec un outil d'annotation */
        rangeeTexte={activeEdit && editor ? (
          <EditToolbar key={'b:' + activeEdit.id} editor={editor} libre={activeEdit.kind === 'libre'}
            couleur={activeEdit.couleur}
            onCouleur={(c) => changerCouleurBoite(activeEdit, c)} onApercu={(c) => apercuPour(activeEdit.id, c)}
            palette={activeEdit.kind === 'texte' ? <SelecteurCouleurs couleur={activeEdit.couleur} onCouleur={(c) => changerCouleurTexte(activeEdit, c)} onApercu={(c) => apercuPour(activeEdit.id, c)} titre="Couleur du texte" /> : null}
            libelleSupprimer={activeEdit.kind === 'texte' ? 'Supprimer le texte' : null}
            onReset={() => (activeEdit.kind === 'libre' || activeEdit.kind === 'texte' ? supprimerBoite(activeEdit) : resetEdit(activeEdit.id))} />
        ) : editeurPage && outil === 'main' && !editeurPage.ed.isDestroyed ? (
          <EditToolbar key="t" editor={editeurPage.ed} sansSupprimer extras={<OutilsTexteDocument editor={editeurPage.ed} />}
            onAnnuler={hist.annuler} onRetablir={hist.retablir} peutAnnuler={hist.peutAnnuler} peutRetablir={hist.peutRetablir} />
        ) : null}
        /* (20/10) rangée RÉSERVÉE en permanence, PDF compris : son emplacement est fixe, choisir ou
           quitter un outil ne décale jamais le document (docs/compte-rendu-pdfreader-v3.md) */
        reserverRangee
        aideVide={modeDoc ? 'Cliquez dans le texte pour le mettre en forme' : 'Choisissez un outil : ses couleurs et réglages s’affichent ici'}
        contexteSupplementaire={outil === 'boite' ? (
          <SelecteurCouleurs couleur={couleurActive} onCouleur={setCouleurActive} titre="Couleur de la boîte" />
        ) : outil === 'forme' ? (
          <>
            <div className="ptb-formes" role="group" aria-label="Forme à poser">
              {TYPES_FORMES.map((t) => (
                <button key={t.id} type="button" className={'ptb-forme' + (typeFormeActif === t.id ? ' actif' : '')}
                  title={`${t.label} — clic sur la page pour la poser, glisser pour l’étirer (Maj : ${estTrait(t.id) ? 'angle de 45°' : 'proportions gardées'})`}
                  onClick={() => setTypeFormeActif(t.id)}>
                  <IconeForme type={t.id} size={17} />
                </button>
              ))}
            </div>
            <span className="ptb-sep" />
            <SelecteurCouleurs couleur={couleurForme} onCouleur={setCouleurForme} titre="Couleur de la forme" />
            {estFermee(typeFormeActif) && (<>
              <span className="ptb-sep" />
              <button type="button" className={'ptb-bascule' + (formeRemplie ? ' actif' : '')} onClick={() => setFormeRemplie((v) => !v)}
                title="Remplir la forme d’une teinte légère de sa couleur">
                <IconeOutil nom="remplir" size={14} /> {formeRemplie ? 'Remplie' : 'Vide'}
              </button>
            </>)}
          </>
        ) : outil === 'surligneur' ? (
          <SelecteurCouleurs couleur={couleurSurligneur} onCouleur={setCouleurSurligneur} titre="Couleur du surligneur" />
        ) : outil === 'texte' ? (
          <SelecteurCouleurs couleur={couleurTexte} onCouleur={setCouleurTexte} titre="Couleur du texte" />
        ) : outil === 'question' ? <span /> : outil === 'crayon' ? (
          <>
            <SelecteurCouleurs couleur={couleurCrayon} onCouleur={setCouleurCrayon} titre="Couleur du crayon" />
            <span className="ptb-sep" />
            <div className="ptb-segment" role="group" aria-label="Mode du crayon">
              {MODES_CRAYON.map((m) => (
                <button key={m.id} type="button" className={modeCrayon === m.id ? 'actif' : ''} onClick={() => setModeCrayon(m.id)}
                  title={m.id === 'dessin' ? 'Trait fin et doux, pour écrire ou schématiser' : 'Trait épais et translucide, pour surligner à main levée'}>
                  {m.label}
                </button>
              ))}
            </div>
            <span className="ptb-sep" />
            <ReglagesTrait mode={modeCrayon} reglage={reglagesCrayon[modeCrayon]} couleur={couleurHex(couleurCrayon)}
              hauteurPage={(pageSizes[Math.max(0, pageCourante - 1)] || { height: 792 }).height * scale}
              onChange={(patch) => setReglagesCrayon((r) => {
                const n = { ...r, [modeCrayon]: { ...r[modeCrayon], ...patch } };
                try { localStorage.setItem('medrevise.reglagesCrayon', JSON.stringify(n)); } catch (e) { /* ignore */ }
                return n;
              })} />
            {(modeTab || ecranTactile) && (<>
              <span className="ptb-sep" />
              <button type="button" className={'ptb-bascule' + (reglagesStylet.pression ? ' actif' : '')} aria-pressed={reglagesStylet.pression}
                onClick={() => ecrirePressionActive(!reglagesStylet.pression)}
                title="Apple Pencil : appuyer plus fort épaissit légèrement le trait. Désactivé : épaisseur fixe.">
                Pression {reglagesStylet.pression ? 'activée' : 'désactivée'}
              </button>
              <button type="button" className={'ptb-bascule' + (reglagesStylet.doigt ? ' actif' : '')} aria-pressed={reglagesStylet.doigt}
                onClick={() => ecrireDessinAuDoigt(!reglagesStylet.doigt)}
                title="Par défaut, seul le stylet (ou la souris) dessine : le doigt fait défiler et zoomer, la paume est ignorée. Activé : le doigt dessine aussi.">
                Dessiner au doigt : {reglagesStylet.doigt ? 'oui' : 'non'}
              </button>
            </>)}
            {modeCrayon === 'dessin' && (
              <>
                <span className="ptb-sep" />
                <button type="button" className={'ptb-bascule' + (aimant ? ' actif' : '')} onClick={() => setAimant((v) => !v)}
                  title="Lisse le tremblement et redresse les traits presque droits. Décoché, le trait est conservé tel qu'il a été tracé.">
                  <IconeOutil nom="aimant" size={14} /> Aimant {aimant ? 'activé' : 'désactivé'}
                </button>
              </>
            )}
          </>
        ) : null}
      />
      </div>


      {exportErreur && (
        <div className="err-mini" style={{ marginBottom: 12 }}>
          <div className="em-ic crit"><Icon name="alert" size={16} /></div>
          <div className="em-body"><div className="em-title">{exportErreur}</div></div>
          <button className="btn sm" onClick={() => setExportErreur(null)}><Icon name="x" size={13} /></button>
        </div>
      )}
      {loadError && (
        <div className="err-mini" style={{ marginBottom: 12 }}>
          <div className="em-ic crit"><Icon name="alert" size={16} /></div>
          <div className="em-body"><div className="em-title">{loadError}</div></div>
          {pdfManquant && <button className="btn sm" onClick={() => setPdfRetry((t) => t + 1)}><Icon name="refresh" size={13} /> Réessayer</button>}
          {/* le fichier d'origine sous la main : le rattacher ici, sans rien perdre */}
          {pdfManquant && (
            <label className="btn sm primary" style={{ cursor: 'pointer' }}>
              <Icon name="upload" size={13} /> Rattacher le fichier…
              <input type="file" accept="application/pdf,.pdf" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) attachDoc(f); }} />
            </label>
          )}
          {erreurImport && <div className="em-body"><div className="em-title">{erreurImport}</div></div>}
        </div>
      )}

      {/* fenêtre étroite : même bascule Cours / Panneau que sur une fiche HTML */}
      <div className="pdfr-mobile-toggle seg">
        <button type="button" className={'seg-btn' + (mobileView === 'course' ? ' active' : '')} onClick={() => setMobileView('course')}><Icon name="filePdf" size={13} /> Cours</button>
        <button type="button" className={'seg-btn' + (mobileView === 'items' ? ' active' : '')} onClick={() => { setMobileView('items'); setPanelOpen(true); }}><Icon name="cards" size={13} /> Panneau</button>
      </div>
      <div className={'pdfr-body pdfr-workshop' + (tableauDispo && disposition !== 'pdf' ? ' avec-tableau dispo-' + disposition : '')} data-mobile-view={modeTab ? undefined : mobileView}
        ref={corpsRef} style={{ ...(tableauDispo && disposition === 'deux' ? { '--ratio-pdf': ratioSplit } : {}), ...(modeTab ? { '--tab-volet-f': voletPlein ? 1 : fractionVolet } : {}) }}>
        {/* barre masquée : un tap tout en haut de la zone de lecture la fait revenir */}
        <div className={'pdfr-scroll pdfr-workshop-course' + (pret && !restaure ? ' pdfr-attente' : '')} ref={scrollRef} onScroll={onScroll}
          onDragOver={(e) => { if (e.dataTransfer && [...e.dataTransfer.types].some((t) => t === 'Files' || t === TYPE_GLISSER)) { e.preventDefault(); if ([...e.dataTransfer.types].includes(TYPE_GLISSER)) e.dataTransfer.dropEffect = 'copy'; } }}
          onDrop={deposerImage}>
          <input ref={entreeImageRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) ajouterImage(f); }} />
          {!pret && !loadError && <div className="gen-spinner" style={{ width: 40, height: 40, margin: '60px auto' }} />}
          {pret && (
            <div ref={pagesRef} className={'pdfr-pages' + (modeDoc ? ' pdfr-pages-doc' : '') + (pose ? ' pose' : '')} style={{ height: layout.totalHeight, width: layout.maxWidth, minWidth: '100%' }}>
              {/* DOCUMENT : le texte, UN flux paginé posé sur toutes les pages (jamais virtualisé) */}
              {modeDoc && fluxInitial && pageSizes.length > 0 && (
                <DocumentFlux key={'flux:' + ficheId} ref={fluxRef} initial={fluxInitial}
                  largeurPage={PAGE_A4.width} hauteurPage={PAGE_A4.height} ecart={GAP} echelle={scale}
                  hauteurTotale={layout.totalHeight} outil={outil} couleurSurligneur={couleurSurligneur} fondNoir={fondNoir} marges={margesFlux}
                  onSauver={sauverFlux} onActiver={(ed) => { curseurFluxPose.current = true; activerPageTexte('flux', ed); }}
                  onNotion={notionDePage} onFlashcard={flashcardDePage} onJournal={hist.noterPage}
                  onPagination={(r) => setPagination((p) => (p && p.nbPages === r.nbPages && JSON.stringify(p.blocs) === JSON.stringify(r.blocs) ? p : r))} />
              )}
              {pageSizes.map((sz, idx) => {
                const n = sz.cle; // numéro de page du PDF, ou id d'une page ajoutée
                const top = layout.offsets[idx];
                const w = sz.width * scale, h = sz.height * scale;
                const active = impression || (idx >= visibleRange.start && idx <= visibleRange.end);
                // --k : échelle des annotations (zoom ÷ 160 %), lue par le CSS des repères (épingles, « ? »…)
                // document : PAS de transform sur la page (il en ferait un contexte d'empilement et le
                // texte du flux, posé dessus, ne pourrait plus passer SOUS les annotations de la page)
                const style = modeDoc
                  ? { position: 'absolute', top, left: `calc(50% - ${w / 2}px)`, width: w, height: h, '--k': scale / ECHELLE_REF }
                  : { position: 'absolute', top, left: '50%', transform: 'translateX(-50%)', width: w, height: h, '--k': scale / ECHELLE_REF };
                if (!active) return <div key={n} className="pdfr-placeholder" style={style} />;
                /* INSÉRER UNE PAGE ICI (03/10) : TOUT l'espace entre deux pages est un
                   bouton, sur toute la largeur de la page — on vise large, on voit où la
                   page arrivera (trait pointillé + libellé au survol). */
                const inter = (
                  <button key={n + ':inter'} type="button" className="pdfr-inter"
                    style={{ top: top + h, height: Math.max(16, GAP * scale), width: w }}
                    onClick={() => insererPageApres(idx)} title={`Insérer une page blanche ici (après la page ${idx + 1})`}>
                    <span className="pdfr-inter-trait" aria-hidden="true" />
                    <span className="pdfr-inter-lbl"><Icon name="plus" size={12} /> Insérer une page ici</span>
                  </button>
                );
                return [inter, (
                  <div key={n} data-cle={String(n)} className={'pdfr-page' + (sz.ajout && !modeDoc ? ' pdfr-page-ajoutee' : '') + (modeDoc ? ' pdfr-page-doc' : '') + (modeDoc && fondNoir ? ' fond-noir' : '')} style={style}>
                    {/* PAGE AJOUTÉE (03/10) : son étiquette et « Retirer » vivent DANS la page,
                        en haut à droite, au-dessus de toutes ses couches. Avant, posées dans
                        l'espace entre les pages, elles étaient recouvertes par la zone
                        d'insertion : on ne pouvait plus cliquer « Retirer ». */}
                    {/* RÈGLES (09/10) : marges de la page courante, seulement en écriture */}
                    {modeDoc && !impression && editeurPage && outil === 'main' && idx === pageCourante - 1 && (
                      <ReglesMarges marges={marges} largeur={w} hauteur={h} echelle={scale} onChange={changerMarges} />
                    )}
                    {sz.ajout && (!modeDoc || pageSizes.length > 1) && (
                      <div className={'pdfr-ajout-etiquette' + (modeDoc ? ' doc' : '')}>
                        {!modeDoc && <span className="pdfr-ajout-nom">Page ajoutée</span>}
                        <button type="button" className="pdfr-ajout-retirer" onClick={() => demanderSuppressionPage(sz.ajout)} title={`Retirer cette page (annulable par ${RACCOURCI}Z)`}>
                          <Icon name="trash" size={13} /> Retirer la page
                        </button>
                      </div>
                    )}
                    {/* (20/10) lignes du transcript dites sur cette page : badge discret, en haut à droite */}
                    {ficheId && !impression && (
                      <BadgePageTranscript courseId={ficheId} page={idx + 1} doc={docAffiche} onOuvrir={(sid) => ouvrirTranscriptPage(idx + 1, sid)} />
                    )}
                    <PdfPageContent
                      pdfDoc={pdfDoc} pageNum={n} vierge={!!sz.ajout} scale={scale} dpr={dpr} pageHeight={h}
                      highlights={highlightsByPage[n] || EMPTY_ARRAY}
                      edits={blocsByPage[n] || EMPTY_ARRAY}
                      boites={boitesByPage[n] || EMPTY_ARRAY}
                      traits={traitsByPage[n] || EMPTY_ARRAY}
                      textes={textesByPage[n] || EMPTY_ARRAY}
                      questions={questionsByPage[n] || EMPTY_ARRAY}
                      images={imagesByPage[n] || EMPTY_ARRAY}
                      formes={formesByPage[n] || EMPTY_ARRAY}
                      formeActiveId={formeActiveId}
                      onFormeActiver={(id) => { setFormeActiveId(id); setImageActiveId(null); setActiveEditId(null); }}
                      onCreerForme={creerForme} onFormeMaj={majForme} onFormeSupprimer={supprimerForme} onFormeLegende={creerLegende}
                      onFormeModifier={modifierForme}
                      couleurApercuSelection={outil === 'surligneur' ? couleurApercuSurligneur : null}
                      couleurForme={couleurForme} typeFormeActif={typeFormeActif} formeRemplie={formeRemplie}
                      imageActiveId={imageActiveId}
                      onImageActiver={(id) => { setImageActiveId(id); setActiveEditId(null); }}
                      onImageMaj={majImage} onImageCalque={changerCalque} onImageSupprimer={supprimerImage}
                      onPoser={poserElement}
                      onCreerTrait={creerTrait}
                      onSupprimerTraits={supprimerTraits}
                      couleurTrait={couleurCrayon}
                      epaisseurTrait={reglagesCrayon[modeCrayon].taille}
                      opaciteTrait={reglagesCrayon[modeCrayon].opacite}
                      aimantActif={aimant}
                      modeCrayon={modeCrayon}
                      outil={outil}
                      onCreerBoite={creerBoite}
                      onMajBoite={majBoite}
                      onSupprimerBoite={supprimerBoite}
                      onModifierBoite={modifierBoite}
                      onApercuCouleur={apercuPour}
                      ancrageBoiteId={ancrageBoiteId} ancrageFleche={!!(ancrage && ancrage.fleche)} ancrageSurlignage={!!(ancrage && ancrage.surlignage)} ancrageAjout={!!(ancrage && ancrage.ajout)} onDemanderAncrage={setAncrageBoiteId}
                      pageWidth={w}
                      activeEditId={activeEditId}
                      matches={matchesByPage[n] || EMPTY_ARRAY}
                      activeMatchIdx={activeMatch}
                      onCreateHighlight={handleCreateHighlightRequest}
                      onSurlignerImage={surlignerMotsImage} onFlashcardTexte={flashcardDePage} couleurSurligneur={couleurSurligneur}
                      cibleHlId={flashHlId}
                      ocrPage={sz.ajout ? null : ocrPagePour(n)} ocrDebug={ocrDebug}
                      onActivateEdit={setActiveEditId}
                      onDebutTrait={() => { if (activeEditIdRef.current) setActiveEditId(null); }}
                      activeEditor={editor}
                      fondNoir={modeDoc && fondNoir}
                      corps={sz.ajout && docCharge && !modeDoc && docNonVide(corpsPages.current[n]) ? (
                        <PageTexte key={'t:' + n} ref={(api) => { if (api) pagesTexte.current.set(n, api); else pagesTexte.current.delete(n); }}
                          pageId={n} initial={corpsPages.current[n] || null} largeur={sz.width} hauteur={sz.height} echelle={scale}
                          outil={outil} couleurSurligneur={couleurSurligneur} focusDemande={focusPages.current[n] ?? null}
                          onSauver={sauverPageTexte} onDebordement={deborderPage} onRemonter={remonterPage} onActiver={activerPageTexte}
                          onNotion={notionDePage} onFlashcard={flashcardDePage} onPret={pagePrete} onJournal={hist.noterPage} />
                      ) : null}
                    />
                  </div>
                )];
              })}
            </div>
          )}
        </div>

        {tableauDispo && disposition !== 'pdf' && (<>
          {disposition === 'deux' && (
            <div className="pdfr-poignee" role="separator" aria-orientation="vertical" title="Glisser pour régler la répartition · double-clic : moitié-moitié"
              onPointerDown={debutPoignee} onDoubleClick={() => majRatio(0.5)} />
          )}
          <div className="pdfr-tableau">
            <Tableau ref={tableauRef} ficheId={ficheId} />
          </div>
        </>)}

        {/* tablette : séparateur HORIZONTAL entre le PDF (au-dessus) et le volet (en bas) */}
        {modeTab && panelOpen && (
          <div className="tab-sep" role="separator" aria-orientation="horizontal" aria-label="Hauteur du panneau"
            aria-valuemin={Math.round(VOLET_MIN * 100)} aria-valuemax={100} aria-valuenow={Math.round((voletPlein ? 1 : fractionVolet) * 100)} tabIndex={0}
            title="Glisser pour régler la hauteur du panneau — tout en haut : plein écran, vers le bas : fermer" onPointerDown={debutSeparateur} onKeyDown={clavierSeparateur}>
            <span className="tab-sep-trait" aria-hidden="true" />
            <button type="button" className="tab-bt tab-sep-replier" onPointerDown={(e) => e.stopPropagation()}
              onClick={() => { setVoletPlein(false); replierPanneau(true); }} title="Replier le panneau" aria-label="Replier le panneau">
              <Icon name="chevD" size={16} />
            </button>
          </div>
        )}

        {/* PANNEAU DE DROITE — le MÊME que sur une fiche HTML (CourseItemsSidebar) :
            QCM / Flashcard / Exercice / Feynman pour une vraie fiche, plus l'onglet
            « Notions » (les passages surlignés de CE PDF). Pour un document sans
            fiche (Prise de notes, anatomie), seul l'onglet Notions existe. */}
        <CourseItemsSidebar ctx={ctx} ficheId={ficheReelle ? ficheReelle.id : null}
          ongletsEnPlus={[
            { id: 'notions', label: 'Notions', icon: 'edit', n: highlights.length + notionsAutreDoc.length, contenu: notionsPdf },
            ficheReelle && {
              // 07/10 : notes du cours (vide par défaut) — aussi dans un document (08/10) : même panneau qu'un PDF
              id: 'notes', label: 'Notes', icon: 'edit', plein: true,
              contenu: notesPanneau,
            },
            ficheId && {
              id: 'transcript', label: 'Transcript', icon: 'mic', plein: true, badge: <BadgeTranscript courseId={ficheId} />,
              contenu: <TranscriptPanel courseId={ficheId} titre={titreFiche}
                onDemarrer={() => setFeuilleTrx({})} onReprendre={(s) => setFeuilleTrx({ reprendre: s })}
                pageLecteur={pret ? { page: pageCourante, doc: docAffiche } : null} onAllerPage={allerAuSegment} demandePage={demandePage} />,
            },
          ]}
          ongletDemande={ongletDemande} cleMemo={ficheId} flashcardDemandee={flashcardNotes}
          ongletInitial={ficheReelle ? null : 'notions'}
          replie={!panelOpen} onReplier={(v) => replierPanneau(v)}
          contenuReplie={modeTab ? (
            <div className="tab-poignee" {...poigneeProps} title="Ouvrir le panneau (taper ou glisser vers le haut)">
              <span className="tab-poignee-trait" aria-hidden="true" />
              <button type="button" className="tab-bt" onClick={() => { setVoletPlein(false); replierPanneau(false); }} title="Afficher le panneau" aria-label="Afficher le panneau"><Icon name="chevU" size={18} /></button>
              {ficheId && <ResumeReplie courseId={ficheId} depuis={depuisRepli} />}
            </div>
          ) : null} />
      </div>

      {/* CARTE DEPUIS LA SÉLECTION (04/10) : tableau affiché à côté + outil Sélection
          (qui ne surligne JAMAIS rien) + du texte sélectionné → une bulle propose d'en
          faire une carte. Le texte est COPIÉ, sans lien retour vers le PDF. Le
          mousedown est neutralisé : cliquer la bulle ne perd pas la sélection. */}
      {tableauDispo && disposition === 'deux' && outil === 'main' && pending && pending.texte && createPortal(
        <button type="button" className="pdfr-vers-carte"
          style={{ left: Math.min(pending.x + 6, window.innerWidth - 230), top: Math.min(pending.y + 8, window.innerHeight - 44) }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const t = pending.texte;
            if (tableauRef.current) tableauRef.current.creerCarteTexte(t);
            setPending(null);
            if (window.getSelection) window.getSelection().removeAllRanges();
          }}
          title="Copier ce passage sur une nouvelle carte du tableau">
          <Icon name="plus" size={13} /> Carte sur le tableau
        </button>,
        document.body,
      )}

      {arrivee && pret && srcTab === 'pdf' && (!tableauDispo || disposition !== 'tableau') && (
        <ArriveeDessin key={arrivee.dessin.id} dessin={arrivee.dessin} autres={arrivee.autres} cible={boutonDessinsRef}
          pdfPret={!!pageSizes.length} onPoser={(d) => poserDessin(d)} onFermer={() => setArrivee(null)} />
      )}

      {panneauExportIA && (
        <PanneauExportIA pageCourante={pageCourante} nbPages={nbPagesAffichees} compter={(portee) => compterTextes(portee).boites}
          preparer={preparerIA} jsonDe={jsonIA} onFermer={() => setPanneauExportIA(false)}
          extras={[
            { label: copiedCount ? 'Notions copiées ✓' : 'Copier les notions', icon: 'copy', onClick: copyPriority, title: copyTitle },
            canAddItem && { label: courseExportOk ? 'Copié ✓' : 'Cours complet (JSON)', icon: 'copy', onClick: exportAllPdfCourse, title: 'Le cours, ses passages surlignés et ses cartes, en JSON (copié)' },
            canAddItem && { label: 'Prompts…', icon: 'layers', onClick: () => setPromptsOuverts(true), title: 'Les prompts de théorie et d’exercices' },
          ]} />
      )}
      {panneauTextes && (
        <PanneauTextesAnnotations volet={panneauTextes} pageCourante={pageCourante} nbPages={nbPagesAffichees}
          compter={compterTextes} onExporter={exporterTextes} onImporter={importerTextes} onBasculer={basculerTextes}
          onFermer={() => setPanneauTextes(null)} />
      )}
      {miseEnPage && modeDoc && <PanneauMiseEnPage marges={marges} onChange={changerMarges} onFermer={() => setMiseEnPage(false)} fondNoir={fondNoir} onFond={basculerFond} />}
      {avisExport && <div className="fj-avis" role="status">{avisExport}</div>}

      {ajoutPage && (
        <Modal title="Ajouter une page" onClose={() => setAjoutPage(null)} width="min(420px, 94vw)">
          <div className="hint" style={{ marginBottom: 10 }}>
            Une page blanche, pour écrire, dessiner ou coller une image. Le PDF d'origine n'est pas modifié :
            la page s'ajoute par-dessus, comme une annotation, et se retire à tout moment.
          </div>
          <label className="pdfr-ajout-choix">
            Insérer après
            <select value={ajoutPage.apresIdx} onChange={(e) => setAjoutPage({ apresIdx: Number(e.target.value) })}>
              <option value={-1}>— au tout début (avant la page 1)</option>
              {pageSizes.map((p, i) => <option key={String(p.cle)} value={i}>{libellePage(p, i)}</option>)}
            </select>
          </label>
          <div className="row" style={{ gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn ghost sm" onClick={() => setAjoutPage(null)}>Annuler</button>
            <button className="btn primary sm" onClick={() => insererPageApres(ajoutPage.apresIdx)}><Icon name="plus" size={13} /> Ajouter la page</button>
          </div>
        </Modal>
      )}
      {pageASupprimer && (
        <ConfirmModal title="Retirer cette page ajoutée ?"
          body={`Elle contient ${contenuDePage(pageASupprimer.id).length} élément(s) (texte, dessin, image…), retirés avec elle. Annulable par ${RACCOURCI}Z.`}
          confirmLabel="Retirer la page"
          onConfirm={() => supprimerPageAjoutee(pageASupprimer)}
          onCancel={() => setPageASupprimer(null)} />
      )}
      {feuilleTrx && ficheId && (
        <FeuilleDemarrage courseId={ficheId} pdfDoc={pdfDoc} ocrPages={coucheOcr ? coucheOcr.pages : null} texteEnPlus={modeDoc ? texteBrutDocument() : ''} reprendre={feuilleTrx.reprendre || null} sourceInitiale={feuilleTrx.source || null}
          onClose={() => setFeuilleTrx(null)} onDemarre={ouvrirTranscript} />
      )}
      <input ref={entreeJumelle} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) recevoirJumelle(f); }} />
      {travailJumelle && (
        <Modal title={travailJumelle.remplacement ? 'Remplacer la fiche' : 'Fiche jumelle'} onClose={() => { if (travailJumelle.etat !== 'encours') setTravailJumelle(null); }} width="min(460px, 94vw)">
          {travailJumelle.etat === 'encours' && (
            <div className="fj-travail"><div className="gen-spinner" style={{ width: 28, height: 28 }} /><div>{travailJumelle.remplacement ? 'Nouvelle version : recherche des pages et replacement des annotations…' : 'Lecture des deux PDF et recherche des pages correspondantes…'}</div></div>
          )}
          {travailJumelle.etat === 'erreur' && <div className="fj-erreur">L’import a échoué : {travailJumelle.message}. Rien n’a été modifié.</div>}
          {travailJumelle.etat === 'fini' && (() => {
            const rec = travailJumelle.rec, r = resumeCorresp(rec);
            return (
              <div className="fj-resume">
                <p><b>{rec.fileName}</b> — {rec.nbPagesFiche} pages, rattachée au cours ({rec.nbPagesOrig} pages).</p>
                <ul>
                  <li>{r.appariees} page{r.appariees > 1 ? 's' : ''} de la fiche associée{r.appariees > 1 ? 's' : ''} à l’original{r.fusions ? ` (dont ${r.fusions} fusion${r.fusions > 1 ? 's' : ''} de diapositives)` : ''}</li>
                  <li>{r.ajoutees} page{r.ajoutees > 1 ? 's' : ''} ajoutée{r.ajoutees > 1 ? 's' : ''} dans la fiche</li>
                  {r.sansEq > 0 && <li>{r.sansEq} page{r.sansEq > 1 ? 's' : ''} de l’original sans équivalent</li>}
                  {travailJumelle.remplacement && <li>{rec.replacees || 0} annotation{rec.replacees > 1 ? 's' : ''} replacée{rec.replacees > 1 ? 's' : ''} sur la nouvelle version{(rec.nonReplacees || []).length ? `, ${rec.nonReplacees.length} non replacée${rec.nonReplacees.length > 1 ? 's' : ''} (listée${rec.nonReplacees.length > 1 ? 's' : ''}, rien de supprimé)` : ''}</li>}
                </ul>
                <div className="row" style={{ gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                  {travailJumelle.remplacement && (rec.nonReplacees || []).length > 0 && <button type="button" className="btn ghost sm" onClick={() => { setTravailJumelle(null); setListeNonReplacees(true); }}>Voir les non replacées</button>}
                  <button type="button" className="btn ghost sm" onClick={() => { setTravailJumelle(null); setEditeurCorresp(true); }}>Vérifier la correspondance</button>
                  <button type="button" className="btn primary sm" onClick={() => { setTravailJumelle(null); basculerJumelle('fiche'); }}>Voir la fiche</button>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}
      {editeurCorresp && jumelle && (
        <EditeurCorrespondance rec={jumelle} pdfIdOrig={fiche.pdfId} docCache={cacheDocs.current} onClose={() => setEditeurCorresp(false)}
          onNonReplacees={(jumelle.nonReplacees || []).length ? () => { setEditeurCorresp(false); setListeNonReplacees(true); } : null}
          {...(modeDocCours && instantDoc.current ? { pagesDoc: pagesDocument(instantDoc.current), versFicheDoc: pageMapCourant().versFiche } : {})} />
      )}
      {listeNonReplacees && jumelle && <ListeNonReplacees rec={jumelle} onClose={() => setListeNonReplacees(false)} />}
      {avisJumelle && <div className="fj-avis" role="status">{avisJumelle}</div>}
      {detailOcr && fiche && pdfIdActif && !modeDoc && (
        <Modal title="Reconnaissance de texte" onClose={() => setDetailOcr(false)} width="min(460px, 94vw)">
          {(() => {
            const st = coucheOcr ? statsCouche(coucheOcr) : null;
            return (
              <div className="ocr-detail">
                <div className="ocr-detail-ligne"><span>État</span><b>{libelleOcr().replace('Reconnaissance de texte : ', '')}</b></div>
                {st && <div className="ocr-detail-ligne"><span>Pages</span><b className="tnum">{st.ocr} reconnues · {st.natives} déjà en texte · {coucheOcr.pageCount} au total</b></div>}
                {st && st.confiance != null && <div className="ocr-detail-ligne"><span>Confiance moyenne</span><b className="tnum">{st.confiance} %</b></div>}
                {st && st.faibles.length > 0 && <div className="hint">Confiance faible (&lt; 70 %) : page{st.faibles.length > 1 ? 's' : ''} {st.faibles.join(', ')} — la sélection y est moins sûre (écriture manuscrite, schéma chargé, formule…).</div>}
                <div className="hint">La reconnaissance tourne en tâche de fond et n’ajoute qu’une couche de texte invisible : le PDF et l’image ne changent pas.</div>
                <div className="row" style={{ gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                  <button type="button" className="btn sm" onClick={() => setOcrDebug((v) => !v)}><Icon name="layers" size={13} /> {ocrDebug ? 'Masquer la couche OCR' : 'Afficher la couche OCR'}</button>
                  <button type="button" className="btn sm primary" onClick={() => { relancerOcr(pdfIdActif, { courseId: ficheId, titre: titreFiche }); setDetailOcr(false); }}><Icon name="refresh" size={13} /> Relancer sur ce cours</button>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}
      {promptsOuverts && <AllPromptsModal ctx={ctx} onClose={() => setPromptsOuverts(false)} />}
      {fichiersOuvert && ficheReelle && (
        <FichiersCours ctx={ctx} fiche={ficheReelle} jumelle={jumelle} onFermer={() => { setFichiersOuvert(false); setFichiersDemarrer(null); }} demarrer={fichiersDemarrer}
          onImporterJumelle={jumelleDispo ? () => entreeJumelle.current && entreeJumelle.current.click() : null}
          onExporterDocument={modeDocCours ? () => { setFichiersOuvert(false); if (surFiche) basculerJumelle('original'); setTimeout(() => imprimerDocument(), 400); } : null}
          pagesDocument={modeDocCours && !surFiche ? nbPagesAffichees : null}
          onRemplace={() => { cacheDocs.current.clear(); reloadHighlights(); reloadEdits(); }}
          onNonReplacees={(r) => setNonReplaceesPrincipal(r)} />
      )}
      {nonReplaceesPrincipal && <ListeNonReplacees rec={{ nonReplacees: nonReplaceesPrincipal.nonReplacees, fileName: ficheReelle && ficheReelle.pdfName, versions: [{ fileName: nonReplaceesPrincipal.fileName }] }} onClose={() => setNonReplaceesPrincipal(null)} />}
      {suppressionDoc && ficheReelle && (
        <SuppressionDocument quoi={suppressionDoc} fiche={ficheReelle} jumelle={jumelle} db={db} onFermer={() => setSuppressionDoc(null)}
          onRemplacer={() => { setSuppressionDoc(null); setFichiersDemarrer('remplacer'); setFichiersOuvert(true); }}
          onFait={async (quoi) => {
            setSuppressionDoc(null);
            if (quoi === 'fiche') { setVueJumelle('original'); ecrireVue(idFiche, 'original'); setAvisJumelle(`Fiche « ${(jumelle && jumelle.fileName) || 'fiche'} » supprimée — la diapo originale, les flashcards et les notions sont conservées`); }
            else { await ctx.reload(); setAvisJumelle(`Diapo originale « ${ficheReelle.pdfName || 'cours.pdf'} » supprimée — annotations, flashcards et notions conservées`); }
          }} />
      )}
      {supprimerOuvert && ficheReelle && (
        <Modal title="Supprimer ce cours ?" onClose={() => setSupprimerOuvert(false)} width="min(460px, 94vw)">
          <div className="hint" style={{ marginBottom: 14 }}>
            Le cours « {ficheReelle.titre} » entier{ficheReelle.pdfName ? <> — diapo « {ficheReelle.pdfName} »</> : null}{jumelle ? <>, fiche « {jumelle.fileName} »</> : null} — sera déplacé dans la corbeille (Réglages), restaurable tant qu’elle n’est pas vidée. Les cartes et le planning associés partent avec ; rien n’est effacé avant que la corbeille soit vidée.

          </div>
          <div className="row" style={{ gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" className="btn ghost sm" onClick={() => setSupprimerOuvert(false)}>Annuler</button>

            <button type="button" className="btn danger sm" onClick={async () => { setSupprimerOuvert(false); await ctx.setFicheArchived(ficheReelle.id, true); close(); }}><Icon name="trash" size={13} /> Supprimer le cours</button>
          </div>
        </Modal>
      )}
      {detacherPdf && (
        <ConfirmModal title="Détacher le PDF ?"
          body={`La fiche « ${fiche.titre} », ses cartes et ses annotations restent. Seul le lien vers le fichier${fiche.pdfName ? ` « ${fiche.pdfName} »` : ''} est retiré ; tu pourras rattacher un PDF plus tard.`}
          confirmLabel="Détacher"
          onConfirm={async () => { setDetacherPdf(false); await ctx.setFichePdf(ficheReelle.id, null); }}
          onCancel={() => setDetacherPdf(false)} />
      )}

      {showAddItem && canAddItem && (
        <AddItemModal ctx={ctx} ficheId={ficheId} ficheTitre={fiche.titre} onClose={() => setShowAddItem(false)} />
      )}

      {showImportItems && canAddItem && (
        <Modal title="Importer des items" onClose={() => setShowImportItems(false)} width="min(640px, 94vw)">
          <div className="hint" style={{ marginBottom: 12 }}>
            Colle ici le JSON produit par un des 4 prompts de complétion (« Voir les prompts ») —
            les nouvelles cartes (QCM, flashcards, Feynman) sont ajoutées à cette fiche, sans doublon.
          </div>
          <PasteJsonForm ctx={ctx} ficheId={ficheId} done={importedCount} setDone={setImportedCount} />
        </Modal>
      )}
    </div>
  );
}

