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
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { pdfjsLib, openPdf } from './pdfjsSetup.js';
import { PDFDocument, BlendMode } from 'pdf-lib';
import { useEditor } from '@tiptap/react';
import { Icon } from '../../shared/Icon.jsx';
import { isClassicUI } from '../../shared/uiMode.js';
import { EdTop, detectDocKind, Modal, LoaderL6 } from '../components/ui.jsx';
import { getBlob, putBlob, getAll, put, remove, newHighlight, newTextEdit, newNoteBox, newTrait } from '../lib/storage.js';
import { useAnnotHistorique, cmdCreer, cmdSupprimer, cmdModifier, cibleEditable } from '../lib/annotHistory.js';
import { RICH_EXTENSIONS } from '../documents/lib/richtext.js';
import { AddItemModal, PasteJsonForm } from '../components/AddItemForm.jsx';
import { AllPromptsModal } from '../components/CoursePromptsMenu.jsx';
import { buildCourseExportFromParts } from '../lib/courseExport.js';
import { pdfCourseParts } from '../lib/pdfCourseText.js';
import {
  COLORS, COLOR_HEX, COLOR_TAG, COLOR_RGB, GAP, EMPTY_ARRAY, RACCOURCI,
  useDevicePixelRatio, compareHighlights, computePageTextMap, EPAISSEURS,
  MODES_CRAYON, EPAISSEUR_SURLIGNEUR,
} from './pdfShared.js';
import { PdfPageContent, EditToolbar } from './PdfPage.jsx';
import { PdfToolbar } from './PdfToolbar.jsx';
import { CourseHtmlView } from './CourseHtmlView.jsx';


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
export function PdfReader({ ctx, source, ficheId: ficheIdProp, initialSrcTab: srcTabProp, doc: docProp, onSetPdf, onSetHtml, embedded, onClose, ajusterLargeur = false, panneauNotionsOuvert = true }) {
  const { pdfView, db } = ctx;
  const ficheId = (source && source.id) ?? ficheIdProp ?? (pdfView && pdfView.ficheId);
  const initialSrcTab = srcTabProp ?? (pdfView && pdfView.srcTab);
  const close = onClose || ctx.closePdfReader;
  // la vraie fiche, s'il y en a une : par `source.ficheId`, ou par l'ancien chemin
  const idFiche = source ? source.ficheId : (docProp ? null : ficheId);
  const ficheReelle = idFiche ? db.fiches.find((f) => f.id === idFiche) : null;
  const fiche = ficheReelle || source || docProp;
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

  // source affichée quand la fiche porte À LA FOIS un PDF et une fiche HTML —
  // indépendant du mode Lecture/Édition (qui ne s'applique qu'au PDF).
  const [srcTab, setSrcTab] = useState(() => initialSrcTab || (fiche && fiche.pdfId ? 'pdf' : 'html'));
  useEffect(() => { setSrcTab(initialSrcTab || (fiche && fiche.pdfId ? 'pdf' : 'html')); }, [ficheId]); // eslint-disable-line react-hooks/exhaustive-deps


  const [pdfDoc, setPdfDoc] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [pageSizes, setPageSizes] = useState([]); // [{width,height}] à scale=1
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
  const [editingHl, setEditingHl] = useState(null); // bulle d'un surlignage existant { id, couleur, texte, x, y }

  const [edits, setEdits] = useState([]); // blocs de texte : remplacement (Chantier 1) ET boîtes libres (kind:'libre')
  const [activeEditId, setActiveEditId] = useState(null);
  // outil actif de la Prise de notes. 'boite' monte une couche de tracé AU-DESSUS de
  // la couche de texte (voir PdfPageContent) : tant qu'il est actif, ni la sélection
  // ni le test de position des surlignages ne peuvent se déclencher — c'est
  // structurel, pas une suite de conditions à ne pas oublier.
  const [outil, setOutil] = useState('main'); // main | surligneur | boite | crayon | gomme — actif sur TOUS les écrans depuis l'étape 7
  const [couleurActive, setCouleurActive] = useState('jaune'); // partagée par surligneur, boîte et crayon
  const [epaisseur, setEpaisseur] = useState(EPAISSEURS[0].id); // mode dessin : trait FIN par défaut
  const [aimant, setAimant] = useState(true); // le lissage est utile par défaut ; décochable (mode dessin seulement)
  const [modeCrayon, setModeCrayon] = useState('dessin'); // dessin (fin, doux) | surligneur (épais, translucide)
  // changer d'outil ferme ce qui appartenait au précédent
  const choisirOutil = (id) => {
    // comme dans Word : du texte est sélectionné, on prend le surligneur → il est surligné
    if (id === 'surligneur' && pending && window.getSelection && !window.getSelection().isCollapsed) {
      commitHighlightAvec(pending, couleurActive);
    }
    setOutil(id); setPending(null); setEditingHl(null); if (id !== 'main') setActiveEditId(null);
  };

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [matches, setMatches] = useState([]); // [{page, itemIdx, charStart, charEnd, approxY, idx}]
  const [activeMatch, setActiveMatch] = useState(0);
  const [searching, setSearching] = useState(false);

  const [panelOpen, setPanelOpen] = useState(panneauNotionsOuvert);
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
  const [pdfManquant, setPdfManquant] = useState(false);
  useEffect(() => { if (pdfManquant) setPdfRetry((t) => t + 1); }, [db]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let cancelled = false;
    setPdfDoc(null); setLoadError(null); setPdfManquant(false); setPageSizes([]); textMapCache.current = {};
    if (!fiche || !fiche.pdfId) return;
    (async () => {
      try {
        const blob = await getBlob(fiche.pdfId);
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
        setPdfDoc(doc); setNumPages(doc.numPages); setPageSizes(sizes);
      } catch (e) {
        if (!cancelled) setLoadError('Impossible de lire ce PDF.');
      }
    })();
    return () => { cancelled = true; };
  }, [fiche && fiche.pdfId, pdfRetry]); // eslint-disable-line react-hooks/exhaustive-deps

  const reloadHighlights = async () => {
    const all = await getAll('highlights');
    setHighlights(all.filter((h) => h.ficheId === ficheId).sort(compareHighlights));
  };
  const reloadEdits = async () => {
    const all = await getAll('annotations');
    setEdits(all.filter((a) => a.ficheId === ficheId));
  };

  /* ---- ANNULER / RÉTABLIR (lib/annotHistory.js) ----
     TOUTES les écritures d'annotation de ce composant passent par `hist.appliquer`
     — jamais put/remove en direct. C'est la seule règle à tenir pour qu'aucune
     action ne puisse échapper à l'historique, aujourd'hui comme demain.
     Boutons et raccourcis sont actifs sur tous les écrans depuis l'étape 7. */
  const rechargerAnnotations = async () => { await reloadHighlights(); await reloadEdits(); };
  const hist = useAnnotHistorique(rechargerAnnotations);

  useEffect(() => { reloadHighlights(); reloadEdits(); setActiveEditId(null); hist.vider(); }, [ficheId]);

  // Cmd/Ctrl+Z et Cmd/Ctrl+Maj+Z. IGNORÉS dès que la frappe vise un champ de saisie
  // ou du contenu éditable : le texte a son propre historique (TipTap dans une boîte,
  // la zone de note d'un surlignage). C'est la cible du clavier qui départage les deux
  // historiques — pas un mode, pas un réglage.
  useEffect(() => {
    const onKey = (e) => {
      if (cibleEditable(e.target) || cibleEditable(document.activeElement)) return;
      /* CORRECTIF (défaut 4) : PLUS de suppression au clavier ici. Un écouteur
         global sur Suppr/Retour arrière effaçait la boîte active dès que le curseur
         n'était pas dans son texte — par exemple juste après un clic sur son
         bandeau. La suppression au clavier vit désormais SUR la boîte elle-même
         (voir NoteBox#onKeyDown), donc elle ne peut se déclencher que si le
         bandeau de CETTE boîte a réellement le focus. */
      if (!(e.metaKey || e.ctrlKey) || String(e.key).toLowerCase() !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) hist.retablir(); else hist.annuler();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hist.annuler, hist.retablir]);
  // les surlignages ne vivent pas dans `db` (lus à part, ci-dessus) : sans ceci, ceux
  // qu'une synchro rapatrie d'un autre appareil (retour sur l'onglet, reconnexion —
  // MedReviseApp.jsx appelle alors reload(), qui remplace `db`) n'apparaîtraient qu'à
  // la réouverture du lecteur.
  useEffect(() => { reloadHighlights(); }, [db]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const onScroll = () => {
    if (scrollRaf.current) return;
    scrollRaf.current = requestAnimationFrame(() => { scrollRaf.current = null; computeVisibleRange(); });
  };

  // page affichée = celle qui passe sous la ligne de lecture (voir computeVisibleRange),
  // tenue à jour par le même défilement que le rendu virtualisé.
  const pageCourante = Math.min(numPages || 1, Math.max(1, pageLue));
  // aller à une page : son bord haut juste sous la barre, sans la marge de 70 px
  // qu'utilisent recherche et notions (qui visent une LIGNE, pas une page).
  const allerALaPage = (n) => {
    const idx = Math.max(0, Math.min(numPages - 1, n - 1));
    const el = scrollRef.current;
    if (!el || layout.offsets[idx] == null) return;
    el.scrollTop = Math.max(0, layout.offsets[idx] - 8 * scale);
    computeVisibleRange();
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
    const idx = pageNum - 1;
    if (!layout.offsets.length || !pageSizes[idx] || !scrollRef.current) return;
    const target = layout.offsets[idx] + fracY * (pageSizes[idx].height * scale) - 70;
    scrollRef.current.scrollTop = Math.max(0, target);
  };

  // B3 : zoom centré sur un point écran donné (curseur, ou centre du viewport pour les boutons)
  // zoom « ajusté à la largeur » (voir la prop ajusterLargeur) : observé en continu, pour
  // suivre la poignée de l'écran splitté ; abandonné dès le premier zoom manuel.
  const zoomManuel = useRef(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!ajusterLargeur || !el || !pageSizes.length || typeof ResizeObserver === 'undefined') return undefined;
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
  }, [ajusterLargeur, pageSizes]);

  const zoomAt = (clientY, newScaleRaw) => {
    zoomManuel.current = true;
    const el = scrollRef.current;
    const newScale = Math.max(0.4, Math.min(4, +newScaleRaw.toFixed(3)));
    if (!el) { setScale(newScale); return; }
    const rect = el.getBoundingClientRect();
    const cursorViewportY = clientY - rect.top;
    const contentYOld = el.scrollTop + cursorViewportY;
    const contentYNew = contentYOld * (newScale / scale);
    pendingScroll.current = contentYNew - cursorViewportY;
    setScale(newScale);
  };
  useLayoutEffect(() => {
    if (pendingScroll.current != null && scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, pendingScroll.current);
      pendingScroll.current = null;
    }
    computeVisibleRange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);
  const zoomButtons = (factor) => {
    const el = scrollRef.current;
    const clientY = el ? el.getBoundingClientRect().top + el.clientHeight / 2 : 0;
    zoomAt(clientY, scale * factor);
  };

  // Ctrl/Cmd + molette : écouteur natif non-passif (nécessaire pour que preventDefault
  // bloque bien le zoom natif du navigateur — un onWheel React seul n'y suffit pas
  // de façon fiable selon les versions/navigateurs).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomAt(e.clientY, scale * factor);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  /* SURLIGNAGE « COMME WORD » (nuit du 30/09) : plus de note au clic. La bulle
     d'un surlignage existant ne propose que sa couleur et « Supprimer ». Les notes
     déjà écrites ne sont pas perdues : elles restent affichées dans le panneau et
     exportées comme avant — on ne peut simplement plus en créer depuis la bulle. */
  const closeEditingHl = () => { setEditingHl(null); };
  // la sélection en attente meurt avec la sélection du navigateur
  useEffect(() => {
    if (!pending) return undefined;
    const onSel = () => { const sel = window.getSelection(); if (!sel || sel.isCollapsed) setPending(null); };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, [pending]);

  // Échap : désélectionner la boîte / le bloc actif (avant, seul « Terminé » le
  // permettait). Posé À PART des popovers ci-dessous, qui ont leur propre Échap.
  useEffect(() => {
    if (!activeEditId) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setActiveEditId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeEditId]);

  // ferme la bulle d'un surlignage au clic extérieur / Échap
  useEffect(() => {
    if (!editingHl) return;
    const onDown = (e) => { if (!(e.target.closest && e.target.closest('.hl-picker'))) closeEditingHl(); };
    const onKey = (e) => { if (e.key === 'Escape') closeEditingHl(); };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingHl, highlights]);

  /* Avec l'outil SURLIGNEUR, une sélection surligne AUSSITÔT dans la couleur
     active. Avec l'outil SÉLECTION, rien ne s'affiche : on sélectionne pour
     copier, ou pour surligner ensuite en prenant le Surligneur (voir choisirOutil). */
  const handleCreateHighlightRequest = (payload) => {
    setEditingHl(null);
    if (outil === 'surligneur') { commitHighlightAvec(payload, couleurActive); return; }
    setPending(payload);
  };
  const commitHighlightAvec = async (p, couleur) => {
    setPending(null);
    window.getSelection && window.getSelection().removeAllRanges();
    // `segments` = les morceaux encore libres (voir soustraireAncres). Vide : tout
    // était déjà surligné, on ne crée RIEN — pas de ré-accentuation, pas de doublon.
    const morceaux = Array.isArray(p.segments) ? p.segments : [{ texte: p.texte, rects: p.rects, anchor: p.anchor }];
    const cmds = morceaux.map((m) => cmdCreer('highlights',
      newHighlight({ ficheId, page: p.page, texte: m.texte, couleur, rects: m.rects, anchor: m.anchor }), 'Surlignage'));
    if (!cmds.length) return;
    await hist.appliquer(cmds.length === 1 ? cmds[0] : {
      libelle: 'Surlignage',
      faire: async () => { for (const c of cmds) await c.faire(); },
      defaire: async () => { for (const c of [...cmds].reverse()) await c.defaire(); },
    });
  };
  const handleHighlightClick = (h, e) => {
    setPending(null);
    setEditingHl({ id: h.id, couleur: h.couleur, texte: h.texte || '', x: e.clientX, y: e.clientY });
  };
  const changeHighlightColor = async (couleur) => {
    if (!editingHl) return;
    const h = highlights.find((x) => x.id === editingHl.id); if (!h) { setEditingHl(null); return; }
    setEditingHl(null); // un choix, un geste : la bulle se referme
    if (h.couleur !== couleur) await hist.appliquer(cmdModifier('highlights', h, { ...h, couleur }, 'Couleur du surlignage'));
  };
  const deleteHighlightConfirmed = async () => {
    if (!editingHl) return;
    const h = highlights.find((x) => x.id === editingHl.id);
    setEditingHl(null);
    if (h) await hist.appliquer(cmdSupprimer('highlights', h, 'Suppression du surlignage'));
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
    if (!q || !pdfDoc) { setMatches([]); setActiveMatch(0); return; }
    setSearching(true);
    (async () => {
      const found = [];
      for (let n = 1; n <= numPages; n++) {
        if (cancelled) return;
        if (!textMapCache.current[n]) textMapCache.current[n] = await computePageTextMap(pdfDoc, n);
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
  }, [debouncedSearch, pdfDoc, numPages]);

  useEffect(() => {
    if (!matches.length) return;
    const m = matches[Math.max(0, Math.min(activeMatch, matches.length - 1))];
    if (m) scrollToPageFraction(m.page, m.approxY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMatch, matches]);

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
  const actionsDocument = [
    { label: exporting ? 'Export en cours…' : 'Exporter le PDF annoté', icon: 'filePdf',
      onClick: () => { if (highlights.length && !exporting) exportAnnotated(); } },
    { label: copiedCount ? 'Notions copiées ✓' : 'Copier les notions', icon: 'copy', onClick: copyPriority },
    canAddItem && { label: courseExportOk ? 'Copié ✓' : 'Tout exporter (JSON)', icon: 'copy', onClick: exportAllPdfCourse },
    canAddItem && { label: 'Ajouter un item', icon: 'plus', onClick: () => setShowAddItem(true) },
    canAddItem && { label: 'Importer des items', icon: 'upload', onClick: () => { setImportedCount(0); setShowImportItems(true); } },
    // UNE entrée au lieu de deux boutons identiques côte à côte : AllPromptsModal
    // réunit déjà les 8 prompts (4 théorie + 4 exercices), et c'est le même
    // stockage que les anciens boutons — rien ne change pour le contenu.
    canAddItem && { label: 'Prompts (théorie et exercices)', icon: 'layers', onClick: () => setPromptsOuverts(true) },
    !!fiche.htmlId && { label: 'Voir la fiche HTML', icon: 'fileHtml', onClick: () => setSrcTab('html') },
    // l'ancien bouton « Remplacer » de la popover de sélection, qui n'existe plus
    !!pending && { label: 'Remplacer le texte sélectionné', icon: 'edit', onClick: () => startEditFromSelection() },
  ];

  // export secondaire — PDF avec les surlignages incrustés (confort de lecture hors app ;
  // suppose des pages non pivotées — limite acceptée, cas rare pour un cours scanné/exporté normal)
  const exportAnnotated = async () => {
    if (!fiche || !fiche.pdfId || !highlights.length || exporting) return;
    setExporting(true);
    try {
      const blob = await getBlob(fiche.pdfId);
      const bytes = await blob.arrayBuffer();
      const outDoc = await PDFDocument.load(bytes);
      const pages = outDoc.getPages();
      for (const h of highlights) {
        const page = pages[h.page - 1];
        if (!page) continue;
        const { width, height } = page.getSize();
        for (const r of h.rects) {
          page.drawRectangle({
            x: r.x * width, y: height - (r.y + r.height) * height, width: r.width * width, height: r.height * height,
            color: COLOR_RGB[h.couleur] || COLOR_RGB.jaune, opacity: 0.4, blendMode: BlendMode.Multiply,
          });
        }
      }
      const outBytes = await outDoc.save();
      const outBlob = new Blob([outBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(outBlob);
      const a = document.createElement('a');
      a.href = url; a.download = `${(fiche.titre || 'cours').replace(/[\\/:*?"<>|]/g, '')}-annote.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } finally {
      setExporting(false);
    }
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
      ficheId, page: pending.page, x: x0, y: y0, width: x1 - x0, height: y1 - y0,
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
    const updated = { ...base, content: json };
    await put('annotations', updated);
    setEdits((arr) => arr.map((a) => (a.id === id ? updated : a)));
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

  /* ---- BOÎTE DE TEXTE LIBRE ----
     Posée n'importe où sur une page (pas forcément sur du texte), déplaçable,
     redimensionnable, supprimable. Même store et même géométrie normalisée [0,1]
     que le bloc de remplacement de texte — seul `kind: 'libre'` les distingue.
     Les trois actions passent par l'historique : la boîte naît annulable. */
  const creerBoite = async ({ page, x, y, width, height }) => {
    // CORRECTIF : `couleurBoite` n'était déclaré nulle part. La ReferenceError partait
    // dans une fonction async appelée depuis un écouteur pointerup — promesse rejetée,
    // rien à l'écran : l'outil « ne créait rien ». La couleur est celle de la barre
    // contextuelle, partagée par tous les outils colorés.
    const rec = newNoteBox({ ficheId, page, x, y, width, height, couleur: couleurActive });
    await hist.appliquer(cmdCreer('annotations', rec, 'Boîte de texte'));
    setActiveEditId(rec.id);
    setOutil('main'); // on vient de la poser : on veut écrire dedans, pas en tracer une autre ('selection' n'était pas un outil)
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
    await hist.appliquer(cmdModifier('annotations', { ...actuel, ...GEO(avant) }, { ...actuel, ...GEO(apres) }, libelle));
  };
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
  const creerTrait = async ({ page, points, mode = 'dessin' }) => {
    if (!points || points.length < 2) return;
    const surligneur = mode === 'surligneur';
    const rec = newTrait({ ficheId, page, points, couleur: couleurActive, mode,
      epaisseur: surligneur ? EPAISSEUR_SURLIGNEUR : (EPAISSEURS.find((e) => e.id === epaisseur) || EPAISSEURS[0]).v,
      aimant: !surligneur && aimant });
    await hist.appliquer(cmdCreer('annotations', rec, surligneur ? 'Surligneur à main levée' : 'Trait au crayon'));
  };
  // gomme : UN geste = UNE entrée d'historique, même s'il a traversé plusieurs traits
  const supprimerTraits = async (liste) => {
    const cmds = (liste || []).filter(Boolean).map((t) => cmdSupprimer('annotations', t, 'Gomme'));
    if (!cmds.length) return;
    await hist.appliquer(cmds.length === 1 ? cmds[0] : {
      libelle: `Gomme (${cmds.length} traits)`,
      faire: async () => { for (const c of cmds) await c.faire(); },
      defaire: async () => { for (const c of [...cmds].reverse()) await c.defaire(); },
    });
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
  const highlightsByPage = useMemo(() => groupByPage(highlights), [highlights]);
  // deux familles dans le MÊME store : les blocs de remplacement de texte (sans
  // `kind`, historiques) et les boîtes libres (`kind: 'libre'`). Rendues par des
  // composants différents, jamais mélangées.
  const blocsByPage = useMemo(() => groupByPage(edits.filter((a) => !a.kind)), [edits]);
  const boitesByPage = useMemo(() => groupByPage(edits.filter((a) => a.kind === 'libre')), [edits]);
  const traitsByPage = useMemo(() => groupByPage(edits.filter((a) => a.kind === 'trait')), [edits]);
  const matchesByPage = useMemo(() => groupByPage(matches), [matches]);

  // input UNIQUE (PDF ou HTML) : le type est détecté à la volée, le stockage
  // bascule sur pdfId/onSetPdf ou htmlId/onSetHtml en conséquence.
  const attachDoc = async (file) => {
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

  if (!fiche.pdfId && !fiche.htmlId) {
    return (
      <div className={embedded ? 'fadein' : 'screen scroll fadein'}>
        {!embedded && (
          <div className="topbar">
            <div><h1 className="serif">{fiche.titre}</h1><div className="sub">Aucun document rattaché à cette fiche.</div></div>
            <EdTop theme={ctx.theme} onTheme={ctx.toggleTheme} onHub={ctx.goHub} />
          </div>
        )}
        <div className="card" style={{ maxWidth: 480, margin: '30px auto', textAlign: 'center', padding: '30px 20px' }}>
          <Icon name="filePdf" size={30} />
          <div style={{ marginTop: 10, fontWeight: 600 }}>Attacher le cours</div>
          <div className="hint" style={{ marginTop: 6 }}>PDF ou fiche HTML — stocké localement (IndexedDB), pour lecture (et surlignage pour le PDF) dans l'app.</div>
          <div className="row" style={{ gap: 10, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
            <label className="btn primary" style={{ cursor: 'pointer', display: 'inline-flex' }}>
              <Icon name="upload" size={14} /> Attacher un document
              <input type="file" accept="application/pdf,text/html,.pdf,.html" style={{ display: 'none' }} onChange={(e) => attachDoc(e.target.files[0])} />
            </label>
          </div>
          <div style={{ marginTop: 14 }}><button className="btn ghost sm" onClick={close}>Annuler</button></div>
        </div>
      </div>
    );
  }

  // La branche HTML est un AUTRE produit (iframe de cours éditable + sidebar
  // d'items) : elle vit dans son propre fichier depuis l'étape 4 du refactor.
  if (srcTab === 'html') {
    return (
      <CourseHtmlView ctx={ctx} fiche={fiche} ficheId={ficheId} canAddItem={canAddItem}
        embedded={embedded} close={close} onVoirPdf={() => setSrcTab('pdf')} />
    );
  }

  return (
    <div className={embedded ? 'fadein' : 'screen scroll fadein'}>
      {!embedded && (
        <div className="topbar">
          <div>
            <h1 className="serif">{fiche.titre}</h1>
            <div className="sub">Lecteur PDF{numPages ? ` · ${numPages} page${numPages > 1 ? 's' : ''}` : ''}</div>
          </div>
          <EdTop theme={ctx.theme} onTheme={ctx.toggleTheme} onHub={ctx.goHub} />
        </div>
      )}

      <PdfToolbar
        onClose={close}
        pageCourante={pageCourante} numPages={numPages} onAllerPage={allerALaPage}
        scale={scale} onZoom={zoomButtons} onAjuster={ajusterALaLargeur}
        outil={outil} setOutil={choisirOutil}
        couleurActive={couleurActive} setCouleurActive={setCouleurActive}
        hist={hist}
        search={search} setSearch={setSearch} matches={matches} activeMatch={activeMatch} searching={searching}
        onPrecedent={gotoPrevMatch} onSuivant={gotoNextMatch} onFermerRecherche={closeSearch}
        panelOpen={panelOpen} setPanelOpen={setPanelOpen} nbNotions={highlights.length}
        actionsDocument={actionsDocument}
        contexteSupplementaire={outil === 'crayon' ? (
          <>
            <span className="ptb-sep" />
            <div className="ptb-segment" role="group" aria-label="Mode du crayon">
              {MODES_CRAYON.map((m) => (
                <button key={m.id} type="button" className={modeCrayon === m.id ? 'actif' : ''} onClick={() => setModeCrayon(m.id)}
                  title={m.id === 'dessin' ? 'Trait fin et doux, pour écrire ou schématiser' : 'Trait épais et translucide, pour surligner à main levée'}>
                  {m.label}
                </button>
              ))}
            </div>
            {modeCrayon === 'dessin' && (
              <>
                <span className="ptb-sep" />
                {EPAISSEURS.map((e) => (
                  <button key={e.id} type="button" title={`Épaisseur ${e.label.toLowerCase()}`}
                    className={'ptb-epaisseur' + (epaisseur === e.id ? ' actif' : '')} onClick={() => setEpaisseur(e.id)}>
                    <span style={{ height: Math.max(2, e.v * 900), width: 22, borderRadius: 3, background: 'currentColor', display: 'block' }} />
                  </button>
                ))}
                <span className="ptb-sep" />
                <button type="button" className={'ptb-bascule' + (aimant ? ' actif' : '')} onClick={() => setAimant((v) => !v)}
                  title="Lisse le tremblement et redresse les traits presque droits. Décoché, le trait est conservé tel qu'il a été tracé.">
                  <Icon name="sparkle" size={13} /> Aimant {aimant ? 'activé' : 'désactivé'}
                </button>
              </>
            )}
          </>
        ) : null}
      />
      {activeEdit && editor && (
        <EditToolbar editor={editor} libre={activeEdit.kind === 'libre'}
          couleur={activeEdit.couleur}
          onCouleur={(c) => changerCouleurBoite(activeEdit, c)}
          onReset={() => (activeEdit.kind === 'libre' ? supprimerBoite(activeEdit) : resetEdit(activeEdit.id))}
          onClose={() => setActiveEditId(null)} />
      )}

      {loadError && (
        <div className="err-mini" style={{ marginBottom: 12 }}>
          <div className="em-ic crit"><Icon name="alert" size={16} /></div>
          <div className="em-body"><div className="em-title">{loadError}</div></div>
          {pdfManquant && <button className="btn sm" onClick={() => setPdfRetry((t) => t + 1)}><Icon name="refresh" size={13} /> Réessayer</button>}
        </div>
      )}

      <div className="pdfr-body">
        <div className="pdfr-scroll" ref={scrollRef} onScroll={onScroll}>
          {!pdfDoc && !loadError && <div className="gen-spinner" style={{ width: 40, height: 40, margin: '60px auto' }} />}
          {pdfDoc && (
            <div className="pdfr-pages" style={{ height: layout.totalHeight, width: layout.maxWidth, minWidth: '100%' }}>
              {pageSizes.map((sz, idx) => {
                const n = idx + 1;
                const top = layout.offsets[idx];
                const w = sz.width * scale, h = sz.height * scale;
                const active = idx >= visibleRange.start && idx <= visibleRange.end;
                const style = { position: 'absolute', top, left: '50%', transform: 'translateX(-50%)', width: w, height: h };
                if (!active) return <div key={n} className="pdfr-placeholder" style={style} />;
                return (
                  <div key={n} className="pdfr-page" style={style}>
                    <PdfPageContent
                      pdfDoc={pdfDoc} pageNum={n} scale={scale} dpr={dpr} pageHeight={h}
                      highlights={highlightsByPage[n] || EMPTY_ARRAY}
                      edits={blocsByPage[n] || EMPTY_ARRAY}
                      boites={boitesByPage[n] || EMPTY_ARRAY}
                      traits={traitsByPage[n] || EMPTY_ARRAY}
                      onCreerTrait={creerTrait}
                      onSupprimerTraits={supprimerTraits}
                      couleurTrait={couleurActive}
                      epaisseurTrait={(EPAISSEURS.find((e) => e.id === epaisseur) || EPAISSEURS[1]).v}
                      aimantActif={aimant}
                      modeCrayon={modeCrayon}
                      outil={outil}
                      onCreerBoite={creerBoite}
                      onMajBoite={majBoite}
                      onSupprimerBoite={supprimerBoite}
                      activeEditId={activeEditId}
                      matches={matchesByPage[n] || EMPTY_ARRAY}
                      activeMatchIdx={activeMatch}
                      onCreateHighlight={handleCreateHighlightRequest}
                      onHighlightClick={handleHighlightClick}
                      cibleHlId={editingHl ? editingHl.id : null}
                      onActivateEdit={setActiveEditId}
                      activeEditor={editor}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {panelOpen && (
          <div className="pdfr-panel">
            <h3 className="serif">Notions surlignées</h3>
            <span title={copyTitle} style={{ display: 'block' }}>
              <button className="btn sm" onClick={copyPriority} disabled={!pdfDoc} style={{ width: '100%', justifyContent: 'center', marginBottom: 12 }}>
                <Icon name={copiedCount ? 'check' : 'copy'} size={13} /> {copyLabel}
              </button>
            </span>
            <div className="hl-legend">
              {COLORS.map((c) => <span key={c.id}><i style={{ background: c.hex }} />{COLOR_TAG[c.id] || c.short}</span>)}
            </div>
            {highlights.length === 0 && <div className="hint">Prends le Surligneur et sélectionne du texte : il est surligné. Clique un surlignage pour changer sa couleur ou le supprimer.</div>}
            {highlights.map((h) => (
              <div className="hl-entry" key={h.id} onClick={() => scrollToPageFraction(h.page, (h.rects[0] && h.rects[0].y) || 0)}>
                <span className="hl-dot" style={{ background: COLOR_HEX[h.couleur] || COLOR_HEX.jaune }} />
                <div>
                  <div className="hl-entry-page">p.{h.page}{COLOR_TAG[h.couleur] && <span className="hl-entry-tag">{COLOR_TAG[h.couleur]}</span>}</div>
                  <div className="hl-entry-txt">« {h.texte.length > 140 ? h.texte.slice(0, 140) + '…' : h.texte} »</div>
                  {h.note && <div className="hl-entry-note"><Icon name="edit" size={11} /> {h.note}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* BULLE d'un surlignage : sa couleur, ou le supprimer. Rien d'autre. */}
      {editingHl && createPortal(
        <div className="hl-picker hl-bulle" style={{ left: Math.min(editingHl.x, window.innerWidth - 280), top: Math.min(editingHl.y + 10, window.innerHeight - 60) }}>
          {COLORS.map((c) => (
            <button key={c.id} type="button" className="hl-swatch-col" title={c.label} onClick={() => changeHighlightColor(c.id)}>
              <span className={'hl-swatch' + (editingHl.couleur === c.id ? ' selected' : '')} style={{ background: c.hex }} />
            </button>
          ))}
          <span className="hl-picker-sep" />
          <button type="button" className="hl-delete" onClick={deleteHighlightConfirmed}
            title={`Supprimer ce surlignage (annulable par ${RACCOURCI}Z)`}>
            <Icon name="trash" size={13} /> Supprimer
          </button>
        </div>,
        document.body,
      )}

      {promptsOuverts && <AllPromptsModal ctx={ctx} onClose={() => setPromptsOuverts(false)} />}

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

