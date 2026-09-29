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

   PRISE DE NOTES (prop `outilsNotes`, onglet pages/PriseDeNotes.jsx). Trois
   ajouts, TOUS inactifs quand la prop est absente — le lecteur des fiches
   (Bibliothèque, Réviser, Apprentissage, Import Anatomie) se comporte donc
   exactement comme avant :
   - un sélecteur d'outil « Sélection / Boîte de texte » ;
   - la BOÎTE DE TEXTE LIBRE (kind:'libre' dans le store `annotations`),
     posable n'importe où, déplaçable, redimensionnable, supprimable — voir
     le composant NoteBox plus bas et ses QUATRE VERROUS, qui garantissent
     qu'un geste de boîte ne déclenche jamais ni sélection ni surlignage ;
   - Annuler / Rétablir (lib/annotHistory.js). L'historique, lui, est tenu
     en TOUTES circonstances : seuls ses boutons et ses raccourcis dépendent
     de `outilsNotes`.
   ============================================================ */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { pdfjsLib, openPdf } from './pdfjsSetup.js';
import { PDFDocument, BlendMode } from 'pdf-lib';
import { useEditor } from '@tiptap/react';
import { Icon } from '../../shared/Icon.jsx';
import { isClassicUI } from '../../shared/uiMode.js';
import { EdTop, detectDocKind, Modal, LoaderL6 } from '../components/ui.jsx';
import { getBlob, putBlob, getAll, put, remove, newHighlight, newTextEdit, newNoteBox } from '../lib/storage.js';
import { useAnnotHistorique, cmdCreer, cmdSupprimer, cmdModifier, cibleEditable } from '../lib/annotHistory.js';
import { RICH_EXTENSIONS } from '../documents/lib/richtext.js';
import { AddItemModal, PasteJsonForm } from '../components/AddItemForm.jsx';
import { CoursePromptsButton } from '../components/CoursePromptsMenu.jsx';
import { buildCourseExportFromParts } from '../lib/courseExport.js';
import { pdfCourseParts } from '../lib/pdfCourseText.js';
import {
  COLORS, COLOR_HEX, COLOR_TAG, COLOR_RGB, GAP, EMPTY_ARRAY, RACCOURCI,
  useDevicePixelRatio, compareHighlights, computePageTextMap,
} from './pdfShared.js';
import { PdfPageContent, EditToolbar } from './PdfPage.jsx';
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
export function PdfReader({ ctx, ficheId: ficheIdProp, mode: modeProp, initialSrcTab: srcTabProp, doc: docProp, onSetPdf, onSetHtml, embedded, onClose, ajusterLargeur = false, panneauNotionsOuvert = true, outilsNotes = false }) {
  const { pdfView, db } = ctx;
  const ficheId = ficheIdProp ?? (pdfView && pdfView.ficheId);
  const initialSrcTab = srcTabProp ?? (pdfView && pdfView.srcTab);
  const close = onClose || ctx.closePdfReader;
  const fiche = docProp || db.fiches.find((f) => f.id === ficheId);
  // « Ajouter un item » (réutilise AddItemModal, comme dans Réviser) : uniquement pour
  // une vraie fiche (`db.fiches`, ficheId connu) — pas pour `docProp` (ex : structure
  // d'anatomie dans Import Anatomie Théorie, hors du store `questions`/fiches).
  const canAddItem = !docProp && !!ficheId && !!fiche;
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
  const [mode, setMode] = useState(modeProp ?? (pdfView && pdfView.mode) ?? 'read');
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 });
  const dpr = useDevicePixelRatio();

  const [highlights, setHighlights] = useState([]);
  const [pending, setPending] = useState(null); // nouveau surlignage en attente { page, texte, rects, x, y }
  const [editingHl, setEditingHl] = useState(null); // popover changer couleur / supprimer { id, couleur, x, y }

  const [edits, setEdits] = useState([]); // blocs de texte : remplacement (Chantier 1) ET boîtes libres (kind:'libre')
  const [activeEditId, setActiveEditId] = useState(null);
  // outil actif de la Prise de notes. 'boite' monte une couche de tracé AU-DESSUS de
  // la couche de texte (voir PdfPageContent) : tant qu'il est actif, ni la sélection
  // ni le test de position des surlignages ne peuvent se déclencher — c'est
  // structurel, pas une suite de conditions à ne pas oublier.
  const [outil, setOutil] = useState('selection'); // 'selection' | 'boite'
  const [couleurBoite, setCouleurBoite] = useState('jaune');

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
     La pile est tenue quel que soit le contexte ; seuls les BOUTONS et les
     RACCOURCIS sont réservés à `outilsNotes` (onglet Prise de notes), pour que le
     comportement du lecteur dans Bibliothèque / Réviser / Apprentissage reste
     exactement celui d'avant. Un seul drapeau à changer pour l'ouvrir partout. */
  const rechargerAnnotations = async () => { await reloadHighlights(); await reloadEdits(); };
  const hist = useAnnotHistorique(rechargerAnnotations);

  useEffect(() => { reloadHighlights(); reloadEdits(); setActiveEditId(null); hist.vider(); }, [ficheId]);

  // Cmd/Ctrl+Z et Cmd/Ctrl+Maj+Z. IGNORÉS dès que la frappe vise un champ de saisie
  // ou du contenu éditable : le texte a son propre historique (TipTap dans une boîte,
  // la zone de note d'un surlignage). C'est la cible du clavier qui départage les deux
  // historiques — pas un mode, pas un réglage.
  useEffect(() => {
    if (!outilsNotes) return undefined;
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
  }, [outilsNotes, hist.annuler, hist.retablir]);
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
  };
  useEffect(() => { computeVisibleRange(); }, [layout]);
  const onScroll = () => {
    if (scrollRaf.current) return;
    scrollRaf.current = requestAnimationFrame(() => { scrollRaf.current = null; computeVisibleRange(); });
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

  // popover d'un surlignage existant : fermer = enregistrer la note si elle a changé.
  // Toutes les sorties (clic extérieur, Échap, bouton OK) passent par ici — la note ne
  // peut donc pas se perdre en refermant la popover sans « valider ».
  const closeEditingHl = async () => {
    if (!editingHl) return;
    const cur = editingHl;
    setEditingHl(null);
    const h = highlights.find((x) => x.id === cur.id);
    const note = (cur.note || '').trim() || null;
    if (h && note !== (h.note || null)) {
      await hist.appliquer(cmdModifier('highlights', h, { ...h, note }, 'Note du surlignage'));
    }
  };

  // Échap : désélectionner la boîte / le bloc actif (avant, seul « Terminé » le
  // permettait). Posé À PART des popovers ci-dessous, qui ont leur propre Échap.
  useEffect(() => {
    if (!activeEditId) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setActiveEditId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeEditId]);

  // ferme les popovers flottants au clic extérieur / Échap
  useEffect(() => {
    if (!pending && !editingHl) return;
    const onDown = (e) => { if (!(e.target.closest && e.target.closest('.hl-picker'))) { setPending(null); closeEditingHl(); } };
    const onKey = (e) => { if (e.key === 'Escape') { setPending(null); closeEditingHl(); } };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, editingHl, highlights]);

  const handleCreateHighlightRequest = (payload) => { setEditingHl(null); setPending(payload); };
  const commitHighlight = async (couleur) => {
    if (!pending) return;
    const rec = newHighlight({ ficheId, page: pending.page, texte: pending.texte, couleur, rects: pending.rects, anchor: pending.anchor });
    setPending(null);
    window.getSelection && window.getSelection().removeAllRanges();
    await hist.appliquer(cmdCreer('highlights', rec, 'Surlignage'));
  };
  const handleHighlightClick = (h, e) => { setPending(null); setEditingHl({ id: h.id, couleur: h.couleur, note: h.note || '', texte: h.texte || '', x: e.clientX, y: e.clientY }); };
  const changeHighlightColor = async (couleur) => {
    if (!editingHl) return;
    const h = highlights.find((x) => x.id === editingHl.id); if (!h) { setEditingHl(null); return; }
    setEditingHl((cur) => (cur ? { ...cur, couleur } : cur)); // reste ouverte : on peut encore écrire la note
    await hist.appliquer(cmdModifier('highlights', h, { ...h, couleur, note: (editingHl.note || '').trim() || null }, 'Couleur du surlignage'));
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
    const rec = newNoteBox({ ficheId, page, x, y, width, height, couleur: couleurBoite });
    await hist.appliquer(cmdCreer('annotations', rec, 'Boîte de texte'));
    setActiveEditId(rec.id);
    setOutil('selection'); // on vient de la poser : on veut écrire dedans, pas en tracer une autre
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
    setCouleurBoite(couleur); // la prochaine boîte héritera du dernier choix
    await hist.appliquer(cmdModifier('annotations', actuel, { ...actuel, couleur }, 'Couleur de la boîte'));
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
  const blocsByPage = useMemo(() => groupByPage(edits.filter((a) => a.kind !== 'libre')), [edits]);
  const boitesByPage = useMemo(() => groupByPage(edits.filter((a) => a.kind === 'libre')), [edits]);
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

      <div className="pdfr-toolbar">
        <button className="btn ghost sm" onClick={close}><Icon name="chevL" size={14} /> Retour</button>
        {!!fiche.htmlId && (
          <button className="btn ghost sm" onClick={() => setSrcTab('html')}><Icon name="fileHtml" size={13} /> Voir le HTML</button>
        )}

        <div className="seg" style={{ marginLeft: 4 }}>
          <button type="button" className={'seg-btn' + (mode === 'read' ? ' active' : '')} onClick={() => { setMode('read'); setActiveEditId(null); }}><Icon name="book" size={13} /> Lecture</button>
          <button type="button" className={'seg-btn' + (mode === 'edit' ? ' active' : '')} onClick={() => setMode('edit')}><Icon name="edit" size={13} /> Édition</button>
        </div>

        <div className="row" style={{ gap: 4 }}>
          <button className="icon-btn sm" onClick={() => zoomButtons(1 / 1.15)}><Icon name="minus" size={14} /></button>
          <span className="hint tnum" style={{ minWidth: 44, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
          <button className="icon-btn sm" onClick={() => zoomButtons(1.15)}><Icon name="plus" size={14} /></button>
        </div>

        {outilsNotes && (
          <div className="seg" style={{ marginLeft: 4 }}>
            <button type="button" className={'seg-btn' + (outil === 'selection' ? ' active' : '')} onClick={() => setOutil('selection')}
              title="Sélectionner du texte, surligner, déplacer une boîte"><Icon name="grip" size={13} /> Sélection</button>
            <button type="button" className={'seg-btn' + (outil === 'boite' ? ' active' : '')} onClick={() => setOutil('boite')}
              title="Tracer une boîte de texte n'importe où sur la page"><Icon name="edit" size={13} /> Boîte de texte</button>
          </div>
        )}
        {outilsNotes && outil === 'boite' && (
          <div className="row" style={{ gap: 4 }} title="Couleur de la prochaine boîte">
            {COLORS.map((c) => (
              <button key={c.id} type="button" onClick={() => setCouleurBoite(c.id)} title={c.label}
                style={{ width: 18, height: 18, borderRadius: 5, background: c.hex, cursor: 'pointer',
                  border: couleurBoite === c.id ? '2px solid var(--text)' : '1px solid rgba(0,0,0,.25)' }} />
            ))}
          </div>
        )}
        {outilsNotes && (
          <div className="row" style={{ gap: 4 }}>
            <button className="icon-btn sm" onClick={hist.annuler} disabled={!hist.peutAnnuler}
              title={hist.peutAnnuler ? `Annuler — ${hist.libelleAnnuler} (${RACCOURCI}Z)` : `Annuler (${RACCOURCI}Z)`}>
              <Icon name="refresh" size={14} style={{ transform: 'scaleX(-1)' }} />
            </button>
            <button className="icon-btn sm" onClick={hist.retablir} disabled={!hist.peutRetablir}
              title={hist.peutRetablir ? `Rétablir — ${hist.libelleRetablir} (${RACCOURCI}Maj+Z)` : `Rétablir (${RACCOURCI}Maj+Z)`}>
              <Icon name="refresh" size={14} />
            </button>
          </div>
        )}

        <div className="search" style={{ maxWidth: 240, height: 34 }}>
          <Icon name="search" size={14} className="ic" />
          <input placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) gotoPrevMatch(); else gotoNextMatch(); } if (e.key === 'Escape') closeSearch(); }} />
          {search && <button className="icon-btn sm" onClick={closeSearch}><Icon name="x" size={13} /></button>}
        </div>
        {!!search && (
          <div className="row" style={{ gap: 4 }}>
            <span className="hint tnum" style={{ minWidth: 56, textAlign: 'center' }}>
              {searching ? '…' : matches.length ? `${activeMatch + 1} / ${matches.length}` : 'Aucun résultat'}
            </span>
            <button className="icon-btn sm" disabled={!matches.length} onClick={gotoPrevMatch} title="Précédent (Maj+Entrée)"><Icon name="chevU" size={14} /></button>
            <button className="icon-btn sm" disabled={!matches.length} onClick={gotoNextMatch} title="Suivant (Entrée)"><Icon name="chevD" size={14} /></button>
          </div>
        )}

        <div style={{ flex: 1 }} />

        {canAddItem && (
          <button className="btn sm" onClick={() => setShowAddItem(true)}><Icon name="plus" size={13} /> Ajouter un item</button>
        )}
        {/* même chaîne que l'atelier « Voir le cours » d'une fiche HTML : export → prompts → import */}
        {canAddItem && (
          <button className="btn sm" onClick={exportAllPdfCourse} disabled={!pdfDoc} title="Cours + surlignages + cartes déjà créées, en un JSON prêt pour un prompt externe — même format qu'une fiche HTML">
            <Icon name={courseExportOk ? 'check' : 'copy'} size={13} /> {courseExportOk ? 'Copié ✓' : 'Tout exporter'}
          </button>
        )}
        {canAddItem && <CoursePromptsButton ctx={ctx} />}
        {canAddItem && <CoursePromptsButton ctx={ctx} kind="pratique" />}
        {canAddItem && (
          <button className="btn ghost sm" onClick={() => { setImportedCount(0); setShowImportItems(true); }} title="Coller le JSON produit par un prompt de complétion — ajoute les nouvelles cartes à cette fiche">
            <Icon name="upload" size={13} /> Importer des items
          </button>
        )}
        <button className="btn ghost sm" onClick={() => setPanelOpen((v) => !v)} title="Notions surlignées">
          <Icon name={panelOpen ? 'chevR' : 'chevL'} size={13} /> Notions ({highlights.length})
        </button>
        <span title={copyTitle} style={{ display: 'inline-flex' }}>
          <button className="btn sm" onClick={copyPriority} disabled={!pdfDoc}><Icon name={copiedCount ? 'check' : 'copy'} size={13} /> {copyLabel}</button>
        </span>
        <button className="btn ghost sm" onClick={exportAnnotated} disabled={!highlights.length || exporting}>{exporting && !isClassicUI() ? <LoaderL6 inline label="Export en cours" /> : <Icon name="filePdf" size={13} />} {exporting ? 'Export…' : 'Exporter PDF annoté'}</button>
      </div>

      {activeEdit && editor && (mode === 'edit' || activeEdit.kind === 'libre') && (
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
                      pdfDoc={pdfDoc} pageNum={n} scale={scale} dpr={dpr} mode={mode} pageHeight={h}
                      highlights={highlightsByPage[n] || EMPTY_ARRAY}
                      edits={blocsByPage[n] || EMPTY_ARRAY}
                      boites={boitesByPage[n] || EMPTY_ARRAY}
                      outil={outilsNotes ? outil : 'selection'}
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
            {highlights.length === 0 && <div className="hint">Sélectionne du texte pour le surligner. Clique un surlignage pour changer sa couleur, ajouter une note ou le supprimer.</div>}
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

      {mode === 'edit' && (
        <div className="hint" style={{ marginTop: 10 }}><Icon name="info" size={13} /> Sélectionne du texte pour le surligner ou l'éditer (choix proposé après la sélection). Clique un surlignage pour changer sa couleur, ajouter une note ou le supprimer.</div>
      )}

      {/* sélection → surligner (Lecture ET Édition) ; « Éditer ce texte » reste propre au
          mode Édition. Chaque pastille porte son sens, comme dans le gabarit. */}
      {pending && createPortal(
        <div className="hl-picker" style={{ left: Math.min(pending.x, window.innerWidth - (mode === 'edit' ? 330 : 250)), top: Math.min(pending.y + 8, window.innerHeight - 70) }}>
          {COLORS.map((c) => (
            <button key={c.id} className="hl-swatch-col" title={c.label} onClick={() => commitHighlight(c.id)}>
              <span className="hl-swatch" style={{ background: c.hex }} />
              <span className="hl-swatch-lbl">{c.short}</span>
            </button>
          ))}
          <span className="hl-picker-sep" />
          {mode === 'edit' && <button className="hl-edit-btn" title="Éditer ce texte" onClick={startEditFromSelection}><Icon name="edit" size={13} /> Éditer</button>}
          <button className="hl-cancel" title="Annuler" onClick={() => setPending(null)}><Icon name="x" size={13} /></button>
        </div>,
        document.body,
      )}

      {editingHl && createPortal(
        <div className="hl-picker hl-picker-col" style={{ left: Math.min(editingHl.x, window.innerWidth - 300), top: Math.min(editingHl.y + 10, window.innerHeight - 250) }}>
          {/* ON DIT CE QU'ON TIENT : sans cet extrait, rien n'indique quel surlignage
              la popover vise — surtout quand plusieurs se touchent. Le surlignage
              concerné est en plus cerclé sur la page (classe `cible`). */}
          <div className="hl-tete">
            <span className="hl-extrait" title={editingHl.texte}>{editingHl.texte || 'Surlignage'}</span>
            <button className="hl-cancel" title="Fermer" onClick={closeEditingHl}><Icon name="x" size={13} /></button>
          </div>

          <div className="row" style={{ gap: 7, alignItems: 'center' }}>
            {COLORS.map((c) => (
              <button key={c.id} className="hl-swatch-col" title={c.label} onClick={() => changeHighlightColor(c.id)}>
                <span className={'hl-swatch' + (editingHl.couleur === c.id ? ' selected' : '')} style={{ background: c.hex }} />
                <span className="hl-swatch-lbl">{c.short}</span>
              </button>
            ))}
          </div>

          <textarea className="hl-note" rows={2} placeholder="Note (facultatif) — ta remarque ou ta question"
            value={editingHl.note} onChange={(e) => { const note = e.target.value; setEditingHl((cur) => (cur ? { ...cur, note } : cur)); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) closeEditingHl(); }} />
          <div className="hl-aide">La note s'enregistre en fermant.</div>

          {/* L'ACTION QU'ON VENAIT CHERCHER : pleine largeur, rouge, en bas.
              Pas de confirmation — c'est annulable (Cmd+Z), et une boîte de dialogue
              de plus serait un obstacle pour un geste qu'on répète. */}
          <button className="hl-delete-large" onClick={deleteHighlightConfirmed}
            title={`Supprimer ce surlignage (annulable par ${RACCOURCI}Z)`}>
            <Icon name="trash" size={14} /> Supprimer ce surlignage
          </button>
        </div>,
        document.body,
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

