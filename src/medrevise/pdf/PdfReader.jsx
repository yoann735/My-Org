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
   [0,1] (scale=1) pour : (a) trouver les occurrences de recherche à
   travers TOUTES les pages sans devoir les monter dans le DOM, (b)
   identifier le bloc de texte cliqué en mode édition, (c) approximer la
   position à laquelle défiler. La géométrie VISUELLE du surlignage de
   recherche, elle, est calculée séparément via l'API Range du DOM sur la
   page réellement montée (voir computeMatchRectsFromDom) — fiable même
   pour du texte justifié/en tableau, contrairement à une interpolation
   par fraction de caractères.
   ============================================================ */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument, rgb, BlendMode } from 'pdf-lib';
import { useEditor, EditorContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { TextStyleKit } from '@tiptap/extension-text-style';
import { TextAlign } from '@tiptap/extension-text-align';
import { generateHTML } from '@tiptap/core';
import { Icon } from '../../shared/Icon.jsx';
import { EdTop } from '../components/ui.jsx';
import { getBlob, putBlob, getAll, put, remove, newHighlight, newTextEdit } from '../lib/storage.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const COLORS = [
  { id: 'jaune', hex: '#FFD84D' },
  { id: 'vert', hex: '#8BE38B' },
  { id: 'bleu', hex: '#7EC8FF' },
  { id: 'rose', hex: '#FF9FD1' },
];
const COLOR_HEX = Object.fromEntries(COLORS.map((c) => [c.id, c.hex]));
const COLOR_RGB = { jaune: rgb(1, 0.85, 0.3), vert: rgb(0.55, 0.89, 0.55), bleu: rgb(0.5, 0.78, 1), rose: rgb(1, 0.62, 0.82) };

const EDIT_EXTENSIONS = [StarterKit, TextStyleKit, TextAlign.configure({ types: ['paragraph'] })];
const FONT_SIZES = ['10px', '11px', '12px', '13px', '14px', '16px', '18px', '20px', '24px', '28px', '32px'];
const FONT_FAMILIES = ['inherit', 'serif', 'sans-serif', 'monospace', 'Georgia', 'Arial', 'Times New Roman'];

const GAP = 18; // px à scale=1 — scale avec `scale` pour garder un contenu strictement linéaire

/** couche de texte invisible mais sélectionnable, positionnée depuis item.transform.
    Un seul <span> (= un seul nœud texte) par item de contenu texte — c'est cet
    alignement d'index avec computePageTextMap qui permet à computeMatchRectsFromDom
    et au clic d'édition de retrouver le bon nœud texte réel dans le DOM. */
async function buildTextLayer(page, viewport, container) {
  const textContent = await page.getTextContent();
  container.replaceChildren();
  const frag = document.createDocumentFragment();
  for (const item of textContent.items) {
    if (!item.str) continue;
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const angle = Math.atan2(tx[1], tx[0]);
    const fontHeight = Math.hypot(tx[2], tx[3]) || 1;
    const span = document.createElement('span');
    span.textContent = item.str;
    span.style.position = 'absolute';
    span.style.whiteSpace = 'pre';
    span.style.left = `${tx[4]}px`;
    span.style.top = `${tx[5] - fontHeight}px`;
    span.style.fontSize = `${fontHeight}px`;
    span.style.fontFamily = 'sans-serif';
    span.style.lineHeight = '1';
    span.style.transformOrigin = '0% 100%';
    if (angle) span.style.transform = `rotate(${angle}rad)`;
    frag.appendChild(span);
  }
  container.appendChild(frag);
}

/** carte de position du texte d'une page, normalisée [0,1] (indépendante du zoom et
    du DOM) — pour la recherche (matching textuel) et la détection du bloc cliqué en
    mode édition. L'ORDRE et le FILTRE (!item.str) doivent rester identiques à
    buildTextLayer : itemIdx ici == index du <span> réel dans la textLayer. */
async function computePageTextMap(pdfDoc, n) {
  const page = await pdfDoc.getPage(n);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const items = [];
  for (const item of tc.items) {
    if (!item.str) continue;
    const tx = pdfjsLib.Util.transform(vp.transform, item.transform);
    const scaleX = Math.hypot(tx[0], tx[1]) || 1;
    const fontHeight = Math.hypot(tx[2], tx[3]) || 1;
    const x0 = tx[4], y1 = tx[5], y0 = tx[5] - fontHeight;
    const x1 = x0 + (item.width || 0) * scaleX;
    const style = tc.styles && tc.styles[item.fontName];
    items.push({
      str: item.str, x0: x0 / vp.width, y0: y0 / vp.height, x1: x1 / vp.width, y1: y1 / vp.height,
      fontSize: fontHeight / vp.height, fontFamily: (style && style.fontFamily) || 'sans-serif',
    });
  }
  return items;
}

/** Chantier 2 : géométrie EXACTE d'une liste de matches (page courante, réellement
    montée), via l'API Range du DOM sur le vrai nœud texte du <span> concerné — pas
    une interpolation par fraction de caractères (qui déborde sur du texte justifié/
    en tableau). Le scale courant n'intervient jamais explicitement : on lit les
    rects RÉELLEMENT rendus (getBoundingClientRect/getClientRects), donc aucun risque
    de double application ou d'oubli du facteur de zoom. */
function computeMatchRectsFromDom(container, matches) {
  if (!container || !matches.length) return [];
  const spans = container.querySelectorAll('span');
  const cr = container.getBoundingClientRect();
  if (!cr.width || !cr.height) return [];
  const out = [];
  matches.forEach((m) => {
    const span = spans[m.itemIdx];
    const textNode = span && span.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;
    const len = textNode.textContent.length;
    const start = Math.max(0, Math.min(m.charStart, len));
    const end = Math.max(start, Math.min(m.charEnd, len));
    if (start === end) return;
    try {
      const range = document.createRange();
      range.setStart(textNode, start);
      range.setEnd(textNode, end);
      Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0).forEach((r, ri) => {
        out.push({ idx: m.idx, ri, rect: { x: (r.left - cr.left) / cr.width, y: (r.top - cr.top) / cr.height, width: r.width / cr.width, height: r.height / cr.height } });
      });
    } catch (e) { /* offset invalide (page changée entre-temps) — ignore */ }
  });
  return out;
}

export function PdfReader({ ctx }) {
  const { pdfView, db } = ctx;
  const fiche = db.fiches.find((f) => f.id === pdfView.ficheId);

  const [pdfDoc, setPdfDoc] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [pageSizes, setPageSizes] = useState([]); // [{width,height}] à scale=1
  const [scale, setScale] = useState(1.6); // B3 : 160% par défaut
  const [mode, setMode] = useState(pdfView.mode || 'read');
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 });

  const [highlights, setHighlights] = useState([]);
  const [pending, setPending] = useState(null); // nouveau surlignage en attente { page, texte, rects, x, y }
  const [editingHl, setEditingHl] = useState(null); // popover changer couleur / supprimer { id, couleur, x, y }

  const [edits, setEdits] = useState([]); // Chantier 1 : blocs de texte édités
  const [activeEditId, setActiveEditId] = useState(null);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [matches, setMatches] = useState([]); // [{page, itemIdx, charStart, charEnd, approxY, idx}]
  const [activeMatch, setActiveMatch] = useState(0);
  const [searching, setSearching] = useState(false);

  const [panelOpen, setPanelOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  const scrollRef = useRef(null);
  const scrollRaf = useRef(null);
  const pendingScroll = useRef(null);
  const textMapCache = useRef({});

  // charge le document + précalcule la taille réelle de chaque page (scale=1)
  useEffect(() => {
    let cancelled = false;
    setPdfDoc(null); setLoadError(null); setPageSizes([]); textMapCache.current = {};
    if (!fiche || !fiche.pdfId) return;
    (async () => {
      try {
        const blob = await getBlob(fiche.pdfId);
        if (!blob) { if (!cancelled) setLoadError('PDF introuvable.'); return; }
        const buf = await blob.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: buf }).promise;
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
  }, [fiche && fiche.pdfId]);

  const reloadHighlights = async () => {
    const all = await getAll('highlights');
    setHighlights(all.filter((h) => h.ficheId === pdfView.ficheId).sort((a, b) => (a.page - b.page) || a.createdAt.localeCompare(b.createdAt)));
  };
  const reloadEdits = async () => {
    const all = await getAll('annotations');
    setEdits(all.filter((a) => a.ficheId === pdfView.ficheId));
  };
  useEffect(() => { reloadHighlights(); reloadEdits(); setActiveEditId(null); }, [pdfView.ficheId]);

  // B2 : offsets cumulés (px, à l'échelle courante) — le contenu scale strictement
  // linéairement (le gap scale aussi), ce qui rend le zoom centré sur le curseur trivial.
  const layout = useMemo(() => {
    const offsets = [];
    let y = 0;
    for (let i = 0; i < pageSizes.length; i++) {
      offsets.push(y);
      y += pageSizes[i].height * scale + GAP * scale;
    }
    return { offsets, totalHeight: Math.max(0, y - GAP * scale) };
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
  const zoomAt = (clientY, newScaleRaw) => {
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

  // ferme les popovers flottants au clic extérieur / Échap
  useEffect(() => {
    if (!pending && !editingHl) return;
    const onDown = (e) => { if (!(e.target.closest && e.target.closest('.hl-picker'))) { setPending(null); setEditingHl(null); } };
    const onKey = (e) => { if (e.key === 'Escape') { setPending(null); setEditingHl(null); } };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
  }, [pending, editingHl]);

  const handleCreateHighlightRequest = (payload) => setPending(payload);
  const commitHighlight = async (couleur) => {
    if (!pending) return;
    const rec = newHighlight({ ficheId: pdfView.ficheId, page: pending.page, texte: pending.texte, couleur, rects: pending.rects });
    await put('highlights', rec);
    setPending(null);
    window.getSelection && window.getSelection().removeAllRanges();
    await reloadHighlights();
  };
  const handleHighlightClick = (h, e) => setEditingHl({ id: h.id, couleur: h.couleur, x: e.clientX, y: e.clientY });
  const changeHighlightColor = async (couleur) => {
    if (!editingHl) return;
    const h = highlights.find((x) => x.id === editingHl.id); if (!h) { setEditingHl(null); return; }
    await put('highlights', { ...h, couleur });
    setEditingHl(null);
    await reloadHighlights();
  };
  const deleteHighlightConfirmed = async () => {
    if (!editingHl) return;
    await remove('highlights', editingHl.id);
    setEditingHl(null);
    await reloadHighlights();
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

  // livrable — texte prêt à coller dans le chat Claude (texte en clair du surlignage utilisateur)
  const copyPriority = async () => {
    if (!highlights.length) return;
    const lines = highlights.map((h, i) => `${i + 1}. "${h.texte}" (p.${h.page})`).join('\n');
    const text = `NOTIONS PRIORITAIRES SURLIGNÉES PAR L'ÉTUDIANT :\n${lines}\n\nGénère EN PRIORITÉ des questions portant sur ces notions, avant de couvrir le reste du cours.`;
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (e) { /* ignore */ }
  };

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

  // Chantier 1 : clic sur un bloc de texte du PDF (mode édition) → ouvre l'éditeur riche
  // pré-rempli avec le texte réel de ce bloc (un item pdf.js = en général une ligne).
  const findTextItemAt = async (n, fx, fy) => {
    if (!textMapCache.current[n]) textMapCache.current[n] = await computePageTextMap(pdfDoc, n);
    const items = textMapCache.current[n];
    let best = null, bestIdx = -1;
    items.forEach((it, i) => {
      if (fx >= it.x0 && fx <= it.x1 && fy >= it.y0 && fy <= it.y1) {
        const area = (it.x1 - it.x0) * (it.y1 - it.y0);
        if (!best || area < (best.x1 - best.x0) * (best.y1 - best.y0)) { best = it; bestIdx = i; }
      }
    });
    return best ? { ...best, itemIdx: bestIdx } : null;
  };

  const requestEdit = async (page, item) => {
    const existing = edits.find((a) => a.page === page && Math.abs(a.x - item.x0) < 0.004 && Math.abs(a.y - item.y0) < 0.004);
    if (existing) { setActiveEditId(existing.id); return; }
    const rec = newTextEdit({
      ficheId: pdfView.ficheId, page, x: item.x0, y: item.y0, width: item.x1 - item.x0, height: item.y1 - item.y0,
      originalText: item.str, fontSize: item.fontSize, fontFamily: item.fontFamily,
    });
    await put('annotations', rec);
    await reloadEdits();
    setActiveEditId(rec.id);
  };
  const saveEditContent = async (edit, json) => {
    const updated = { ...edit, content: json };
    await put('annotations', updated);
    setEdits((arr) => arr.map((a) => (a.id === edit.id ? updated : a)));
  };
  const resetEdit = async (id) => {
    await remove('annotations', id);
    setEdits((arr) => arr.filter((a) => a.id !== id));
    if (activeEditId === id) setActiveEditId(null);
  };

  // Chantier 1 : UNE SEULE instance TipTap, possédée ici et partagée par le bloc affiché
  // (positionné sur sa page) ET la barre d'outils fixe — sinon les deux se désynchronisent
  // (historique d'annulation séparé, boutons qui ne reflètent pas ce qui s'affiche).
  const activeEdit = edits.find((a) => a.id === activeEditId) || null;
  const editSaveTimer = useRef(null);
  const editLastJson = useRef(null);
  const editor = useEditor({
    extensions: EDIT_EXTENSIONS,
    content: (activeEdit && activeEdit.content) || undefined,
    onUpdate: ({ editor: ed }) => {
      if (!activeEdit) return;
      const json = ed.getJSON();
      editLastJson.current = json;
      clearTimeout(editSaveTimer.current);
      editSaveTimer.current = setTimeout(() => { saveEditContent(activeEdit, json); editLastJson.current = null; }, 400);
    },
  }, [activeEditId]);
  // au changement de bloc actif (ou fermeture) : flush immédiat d'une sauvegarde en attente
  useEffect(() => () => {
    if (editSaveTimer.current && editLastJson.current && activeEdit) {
      clearTimeout(editSaveTimer.current);
      saveEditContent(activeEdit, editLastJson.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEditId]);

  const attach = async (file) => {
    if (!file) return;
    const pdfId = await putBlob(file);
    await ctx.setFichePdf(pdfView.ficheId, pdfId);
  };

  if (!fiche) {
    return (
      <div className="screen scroll fadein">
        <div className="hint">Fiche introuvable.</div>
        <button className="btn" style={{ marginTop: 12 }} onClick={ctx.closePdfReader}><Icon name="chevL" size={14} /> Retour</button>
      </div>
    );
  }

  if (!fiche.pdfId) {
    return (
      <div className="screen scroll fadein">
        <div className="topbar">
          <div><h1 className="serif">{fiche.titre}</h1><div className="sub">Aucun PDF rattaché à cette fiche.</div></div>
          <EdTop theme={ctx.theme} onTheme={ctx.toggleTheme} onHub={ctx.goHub} />
        </div>
        <div className="card" style={{ maxWidth: 440, margin: '30px auto', textAlign: 'center', padding: '30px 20px' }}>
          <Icon name="filePdf" size={30} />
          <div style={{ marginTop: 10, fontWeight: 600 }}>Importer le PDF du cours</div>
          <div className="hint" style={{ marginTop: 6 }}>Stocké localement (IndexedDB), pour lecture et surlignage dans l'app.</div>
          <label className="btn primary" style={{ marginTop: 16, cursor: 'pointer', display: 'inline-flex' }}>
            <Icon name="upload" size={14} /> Attacher un PDF
            <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => attach(e.target.files[0])} />
          </label>
          <div style={{ marginTop: 14 }}><button className="btn ghost sm" onClick={ctx.closePdfReader}>Annuler</button></div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen scroll fadein">
      <div className="topbar">
        <div>
          <h1 className="serif">{fiche.titre}</h1>
          <div className="sub">Lecteur PDF{numPages ? ` · ${numPages} page${numPages > 1 ? 's' : ''}` : ''}</div>
        </div>
        <EdTop theme={ctx.theme} onTheme={ctx.toggleTheme} onHub={ctx.goHub} />
      </div>

      <div className="pdfr-toolbar">
        <button className="btn ghost sm" onClick={ctx.closePdfReader}><Icon name="chevL" size={14} /> Retour</button>

        <div className="seg" style={{ marginLeft: 4 }}>
          <button type="button" className={'seg-btn' + (mode === 'read' ? ' active' : '')} onClick={() => { setMode('read'); setActiveEditId(null); }}><Icon name="book" size={13} /> Lecture</button>
          <button type="button" className={'seg-btn' + (mode === 'edit' ? ' active' : '')} onClick={() => setMode('edit')}><Icon name="edit" size={13} /> Édition</button>
        </div>

        <div className="row" style={{ gap: 4 }}>
          <button className="icon-btn sm" onClick={() => zoomButtons(1 / 1.15)}><Icon name="minus" size={14} /></button>
          <span className="hint tnum" style={{ minWidth: 44, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
          <button className="icon-btn sm" onClick={() => zoomButtons(1.15)}><Icon name="plus" size={14} /></button>
        </div>

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

        <button className="btn ghost sm" onClick={() => setPanelOpen((v) => !v)} title="Notions surlignées">
          <Icon name={panelOpen ? 'chevR' : 'chevL'} size={13} /> Notions ({highlights.length})
        </button>
        <button className="btn sm" onClick={copyPriority} disabled={!highlights.length}><Icon name={copied ? 'check' : 'copy'} size={13} /> {copied ? 'Copié' : 'Copier les notions prioritaires'}</button>
        <button className="btn ghost sm" onClick={exportAnnotated} disabled={!highlights.length || exporting}><Icon name="filePdf" size={13} /> {exporting ? 'Export…' : 'Exporter PDF annoté'}</button>
      </div>

      {mode === 'edit' && activeEdit && editor && (
        <EditToolbar editor={editor} onReset={() => resetEdit(activeEdit.id)} onClose={() => setActiveEditId(null)} />
      )}

      {loadError && <div className="err-mini" style={{ marginBottom: 12 }}><div className="em-ic crit"><Icon name="alert" size={16} /></div><div className="em-body"><div className="em-title">{loadError}</div></div></div>}

      <div className="pdfr-body">
        <div className="pdfr-scroll" ref={scrollRef} onScroll={onScroll}>
          {!pdfDoc && !loadError && <div className="gen-spinner" style={{ width: 40, height: 40, margin: '60px auto' }} />}
          {pdfDoc && (
            <div className="pdfr-pages" style={{ height: layout.totalHeight }}>
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
                      pdfDoc={pdfDoc} pageNum={n} scale={scale} mode={mode}
                      highlights={highlights.filter((h) => h.page === n)}
                      edits={edits.filter((a) => a.page === n)}
                      activeEditId={activeEditId}
                      matches={matches.filter((m) => m.page === n)}
                      activeMatchIdx={activeMatch}
                      onCreateHighlight={handleCreateHighlightRequest}
                      onHighlightClick={handleHighlightClick}
                      onFindTextItem={findTextItemAt}
                      onRequestEdit={requestEdit}
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
            {highlights.length === 0 && <div className="hint">Surligne du texte en mode Édition pour le retrouver ici.</div>}
            {highlights.map((h) => (
              <div className="hl-entry" key={h.id} onClick={() => scrollToPageFraction(h.page, (h.rects[0] && h.rects[0].y) || 0)}>
                <span className="hl-dot" style={{ background: COLOR_HEX[h.couleur] || COLOR_HEX.jaune }} />
                <div>
                  <div className="hl-entry-page">p.{h.page}</div>
                  <div className="hl-entry-txt">« {h.texte.length > 140 ? h.texte.slice(0, 140) + '…' : h.texte} »</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {mode === 'edit' && (
        <div className="hint" style={{ marginTop: 10 }}><Icon name="info" size={13} /> Sélectionne du texte pour le surligner. Clique un bloc de texte pour l'éditer. Clique un surlignage pour changer sa couleur ou le supprimer.</div>
      )}

      {pending && createPortal(
        <div className="hl-picker" style={{ left: Math.min(pending.x, window.innerWidth - 190), top: Math.min(pending.y + 8, window.innerHeight - 60) }}>
          {COLORS.map((c) => (
            <button key={c.id} className="hl-swatch" style={{ background: c.hex }} title={'Surligner en ' + c.id} onClick={() => commitHighlight(c.id)} />
          ))}
          <button className="hl-cancel" title="Annuler" onClick={() => setPending(null)}><Icon name="x" size={13} /></button>
        </div>,
        document.body,
      )}

      {editingHl && createPortal(
        <div className="hl-picker" style={{ left: Math.min(editingHl.x, window.innerWidth - 230), top: Math.min(editingHl.y + 8, window.innerHeight - 70) }}>
          {COLORS.map((c) => (
            <button key={c.id} className={'hl-swatch' + (editingHl.couleur === c.id ? ' selected' : '')} style={{ background: c.hex }} title={'Couleur ' + c.id} onClick={() => changeHighlightColor(c.id)} />
          ))}
          <span className="hl-picker-sep" />
          <button className="hl-delete" onClick={deleteHighlightConfirmed}><Icon name="trash" size={13} /> Supprimer</button>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** rendu d'une seule page (montée uniquement si proche du viewport) : canvas + couche de
    texte + surlignages + surlignage de recherche (géométrie exacte, Chantier 2) + blocs
    de texte édités (Chantier 1). */
function PdfPageContent({
  pdfDoc, pageNum, scale, mode, highlights, edits, activeEditId, matches, activeMatchIdx,
  onCreateHighlight, onHighlightClick, onFindTextItem, onRequestEdit, onActivateEdit, activeEditor,
}) {
  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  const [matchRects, setMatchRects] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const page = await pdfDoc.getPage(pageNum);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      canvas.width = viewport.width; canvas.height = viewport.height;
      const c2d = canvas.getContext('2d');
      await page.render({ canvasContext: c2d, viewport }).promise;
      if (cancelled) return;
      await buildTextLayer(page, viewport, textLayerRef.current);
      if (cancelled) return;
      // Chantier 2 : la textLayer réelle vient d'être (re)construite pour ce scale —
      // c'est le bon moment pour mesurer les rects exacts des occurrences via Range.
      setMatchRects(computeMatchRectsFromDom(textLayerRef.current, matches));
    })();
    return () => { cancelled = true; };
  }, [pdfDoc, pageNum, scale, matches]);

  const handleMouseUp = (e) => {
    if (mode !== 'edit') return;
    const sel = window.getSelection();
    const container = textLayerRef.current;
    if (!container) return;
    if (sel && !sel.isCollapsed && container.contains(sel.anchorNode)) {
      // glisser-sélectionner du texte → surlignage (inchangé)
      const texte = sel.toString().trim();
      if (!texte) return;
      const range = sel.getRangeAt(0);
      const clientRects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
      const cr = container.getBoundingClientRect();
      if (!clientRects.length || !cr.width || !cr.height) return;
      const rects = clientRects.map((r) => ({ x: (r.left - cr.left) / cr.width, y: (r.top - cr.top) / cr.height, width: r.width / cr.width, height: r.height / cr.height }));
      const anchor = clientRects[clientRects.length - 1];
      onCreateHighlight({ page: pageNum, texte, rects, x: anchor.right, y: anchor.bottom });
      return;
    }
    // Chantier 1 : simple clic (pas de glisser-sélection) → éditer le bloc de texte cliqué
    (async () => {
      const cr = container.getBoundingClientRect();
      if (!cr.width || !cr.height) return;
      const fx = (e.clientX - cr.left) / cr.width;
      const fy = (e.clientY - cr.top) / cr.height;
      const item = await onFindTextItem(pageNum, fx, fy);
      if (item) onRequestEdit(pageNum, item);
    })();
  };

  return (
    <>
      <canvas ref={canvasRef} />
      <div ref={textLayerRef} className="pdfr-textlayer" onMouseUp={handleMouseUp} />
      <div className="pdfr-hlayer">
        {highlights.flatMap((h) => h.rects.map((r, i) => (
          <div key={h.id + ':' + i} className={'pdfr-hl-rect' + (mode === 'edit' ? ' clickable' : '')}
            style={{ left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.width * 100 + '%', height: r.height * 100 + '%', background: COLOR_HEX[h.couleur] || COLOR_HEX.jaune }}
            title={mode === 'edit' ? 'Cliquer pour modifier' : h.texte}
            onClick={mode === 'edit' ? (e) => onHighlightClick(h, e) : undefined} />
        )))}
        {matchRects.map((m) => (
          <div key={'m' + m.idx + ':' + m.ri} className={'pdfr-match-rect' + (m.idx === activeMatchIdx ? ' active' : '')}
            style={{ left: m.rect.x * 100 + '%', top: m.rect.y * 100 + '%', width: m.rect.width * 100 + '%', height: m.rect.height * 100 + '%' }} />
        ))}
      </div>
      {edits.map((a) => (
        <TextEditBlock key={a.id} edit={a} active={a.id === activeEditId} editable={mode === 'edit'} onActivate={onActivateEdit} editor={a.id === activeEditId ? activeEditor : null} />
      ))}
    </>
  );
}

/** Chantier 1 : rendu d'un bloc de texte édité. Masque le rendu original (fond opaque
    calé sur la boîte englobante d'origine) et affiche le contenu riche par-dessus —
    statique (HTML généré) tant qu'il n'est pas actif, live (une SEULE instance TipTap,
    possédée par PdfReader et partagée avec EditToolbar — voir plus haut) une fois activé.
    Read-only strict en mode lecture (aucun onClick, aucune interaction). */
function TextEditBlock({ edit, active, editable, onActivate, editor }) {
  const html = useMemo(() => { try { return generateHTML(edit.content, EDIT_EXTENSIONS); } catch (e) { return ''; } }, [edit.content]);
  const style = {
    left: edit.x * 100 + '%', top: edit.y * 100 + '%', width: edit.width * 100 + '%',
    minHeight: edit.height * 100 + '%', maxHeight: `calc(100% - ${edit.y * 100}%)`,
    fontFamily: edit.fontFamily || 'sans-serif',
  };

  if (active && editable && editor) {
    return <div className="edit-block-active" style={style}><EditorContent editor={editor} className="edit-block-content" /></div>;
  }
  return (
    <div className={'edit-block-static' + (editable ? ' editable' : '')} style={style}
      onClick={editable ? () => onActivate(edit.id) : undefined}
      dangerouslySetInnerHTML={{ __html: html }} />
  );
}

/** barre d'outils riche, fixe sous la barre principale tant qu'un bloc est en édition —
    plutôt qu'une popover flottante ancrée sur le bloc, pour rester fiable pendant le
    scroll/zoom (un bloc édité peut sortir du viewport pendant qu'on le rédige). Pilote
    la MÊME instance `editor` que celle rendue dans le bloc (passée par PdfReader). */
function EditToolbar({ editor, onReset, onClose }) {
  const [, force] = useState(0);
  useEffect(() => {
    const rerender = () => force((v) => v + 1);
    editor.on('transaction', rerender);
    return () => editor.off('transaction', rerender);
  }, [editor]);

  const active = (name, attrs) => editor.isActive(name, attrs);
  const run = (fn) => fn(editor.chain().focus()).run();

  return (
    <div className="pdfr-edit-toolbar">
      <button type="button" className={'et-btn' + (active('bold') ? ' active' : '')} title="Gras" onClick={() => run((c) => c.toggleBold())}><b>G</b></button>
      <button type="button" className={'et-btn' + (active('italic') ? ' active' : '')} title="Italique" onClick={() => run((c) => c.toggleItalic())}><i>I</i></button>
      <button type="button" className={'et-btn' + (active('underline') ? ' active' : '')} title="Souligné" onClick={() => run((c) => c.toggleUnderline())}><u>U</u></button>
      <button type="button" className={'et-btn' + (active('strike') ? ' active' : '')} title="Barré" onClick={() => run((c) => c.toggleStrike())}><s>S</s></button>
      <span className="et-sep" />
      <select className="et-select" defaultValue="" onChange={(e) => { if (e.target.value) run((c) => c.setFontSize(e.target.value)); e.target.value = ''; }}>
        <option value="" disabled>Taille</option>
        {FONT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select className="et-select" defaultValue="" onChange={(e) => { if (e.target.value) run((c) => c.setFontFamily(e.target.value)); e.target.value = ''; }}>
        <option value="" disabled>Police</option>
        {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
      <input type="color" className="et-color" title="Couleur du texte" onChange={(e) => run((c) => c.setColor(e.target.value))} />
      <input type="color" className="et-color" title="Surligneur de fond" defaultValue="#fff59d" onChange={(e) => run((c) => c.setBackgroundColor(e.target.value))} />
      <span className="et-sep" />
      <button type="button" className={'et-btn' + (active('bulletList') ? ' active' : '')} title="Liste à puces" onClick={() => run((c) => c.toggleBulletList())}><Icon name="list" size={13} /></button>
      <button type="button" className={'et-btn' + (active('orderedList') ? ' active' : '')} title="Liste numérotée" onClick={() => run((c) => c.toggleOrderedList())}>1.</button>
      <select className="et-select" defaultValue="" onChange={(e) => { if (e.target.value) run((c) => c.setTextAlign(e.target.value)); e.target.value = ''; }}>
        <option value="" disabled>Alignement</option>
        <option value="left">Gauche</option>
        <option value="center">Centre</option>
        <option value="right">Droite</option>
      </select>
      <span className="et-sep" />
      <button type="button" className="et-btn" title="Annuler" onClick={() => editor.chain().focus().undo().run()}><Icon name="refresh" size={13} style={{ transform: 'scaleX(-1)' }} /></button>
      <button type="button" className="et-btn" title="Rétablir" onClick={() => editor.chain().focus().redo().run()}><Icon name="refresh" size={13} /></button>
      <span style={{ flex: 1 }} />
      <button type="button" className="btn ghost sm" onClick={onReset}><Icon name="refresh" size={13} /> Réinitialiser (texte d'origine)</button>
      <button type="button" className="btn sm" onClick={onClose}><Icon name="check" size={13} /> Terminé</button>
    </div>
  );
}
