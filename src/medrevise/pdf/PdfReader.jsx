/* ============================================================
   MedRevise — Partie B (v2) : lecteur PDF continu et virtualisé,
   surlignage sécurisé, recherche temps réel, couche d'annotations.

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
   getPageTextMap, réutilise le même calcul en coordonnées normalisées
   [0,1] (scale=1) pour permettre une recherche plein-texte à travers
   TOUTES les pages sans devoir les monter dans le DOM.
   ============================================================ */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument, rgb, BlendMode } from 'pdf-lib';
import { Icon } from '../../shared/Icon.jsx';
import { EdTop } from '../components/ui.jsx';
import { getBlob, putBlob, getAll, put, remove, newHighlight, newAnnotation } from '../lib/storage.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const COLORS = [
  { id: 'jaune', hex: '#FFD84D' },
  { id: 'vert', hex: '#8BE38B' },
  { id: 'bleu', hex: '#7EC8FF' },
  { id: 'rose', hex: '#FF9FD1' },
];
const COLOR_HEX = Object.fromEntries(COLORS.map((c) => [c.id, c.hex]));
const COLOR_RGB = { jaune: rgb(1, 0.85, 0.3), vert: rgb(0.55, 0.89, 0.55), bleu: rgb(0.5, 0.78, 1), rose: rgb(1, 0.62, 0.82) };
// B4 : couleur réservée à la recherche, distincte des 4 couleurs de surlignage ci-dessus.
const SEARCH_COLOR = '#FFB020';
const SEARCH_ACTIVE_COLOR = '#FF3B30';

const GAP = 18; // px à scale=1 — scale avec `scale` pour garder un contenu strictement linéaire

/** couche de texte invisible mais sélectionnable, positionnée depuis item.transform. */
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

/** carte de position du texte d'une page, normalisée [0,1] (indépendante du zoom et du DOM) — pour la recherche. */
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
    items.push({ str: item.str, x0: x0 / vp.width, y0: y0 / vp.height, x1: x1 / vp.width, y1: y1 / vp.height });
  }
  return items;
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
  const [editingHl, setEditingHl] = useState(null); // B5 : popover changer couleur / supprimer { id, couleur, x, y }

  const [annotations, setAnnotations] = useState([]);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [matches, setMatches] = useState([]); // [{page, rect, idx}] normalisés
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
  const reloadAnnotations = async () => {
    const all = await getAll('annotations');
    setAnnotations(all.filter((a) => a.ficheId === pdfView.ficheId));
  };
  useEffect(() => { reloadHighlights(); reloadAnnotations(); }, [pdfView.ficheId]);

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

  // B3/B5 : ferme les popovers flottants au clic extérieur / Échap
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

  // B4 : recherche temps réel (debounce léger) sur une carte de position indépendante du DOM
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
        for (const it of items) {
          const s = it.str.toLowerCase();
          let idx = s.indexOf(q);
          while (idx !== -1) {
            const startFrac = idx / it.str.length;
            const endFrac = (idx + q.length) / it.str.length;
            const x0 = it.x0 + startFrac * (it.x1 - it.x0);
            const x1 = it.x0 + endFrac * (it.x1 - it.x0);
            found.push({ page: n, rect: { x: x0, y: it.y0, width: Math.max(0.002, x1 - x0), height: Math.max(it.y1 - it.y0, 0.008) } });
            idx = s.indexOf(q, idx + 1);
          }
        }
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
    if (m) scrollToPageFraction(m.page, m.rect.y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMatch, matches]);

  const gotoNextMatch = () => { if (matches.length) setActiveMatch((i) => (i + 1) % matches.length); };
  const gotoPrevMatch = () => { if (matches.length) setActiveMatch((i) => (i - 1 + matches.length) % matches.length); };
  const closeSearch = () => { setSearch(''); setDebouncedSearch(''); setMatches([]); };

  // B5 : livrable — texte prêt à coller dans le chat Claude
  const copyPriority = async () => {
    if (!highlights.length) return;
    const lines = highlights.map((h, i) => `${i + 1}. "${h.texte}" (p.${h.page})`).join('\n');
    const text = `NOTIONS PRIORITAIRES SURLIGNÉES PAR L'ÉTUDIANT :\n${lines}\n\nGénère EN PRIORITÉ des questions portant sur ces notions, avant de couvrir le reste du cours.`;
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (e) { /* ignore */ }
  };

  // B6 : export secondaire — PDF avec les surlignages incrustés (confort de lecture hors app ;
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

  // B6 : couche d'annotations — création, déplacement/redimensionnement (état local pendant le
  // drag, persistance IndexedDB au relâchement seulement), édition de texte, suppression.
  const addAnnotation = async (type) => {
    const page = visibleRange.start + 1;
    const dims = type === 'note' ? { width: 0.14, height: 0.09 } : type === 'redact' ? { width: 0.3, height: 0.06 } : { width: 0.3, height: 0.12 };
    const rec = newAnnotation({ ficheId: pdfView.ficheId, page, type, x: 0.32, y: 0.4, ...dims, text: '' });
    await put('annotations', rec);
    await reloadAnnotations();
  };
  const updateAnnotationLocal = (next) => setAnnotations((arr) => arr.map((a) => (a.id === next.id ? next : a)));
  const commitAnnotationSave = async (ann) => { await put('annotations', ann); };
  const deleteAnnotation = async (id) => { await remove('annotations', id); await reloadAnnotations(); };

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
          <button type="button" className={'seg-btn' + (mode === 'read' ? ' active' : '')} onClick={() => setMode('read')}><Icon name="book" size={13} /> Lecture</button>
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

        {mode === 'edit' && (
          <div className="row" style={{ gap: 4 }}>
            <button className="btn ghost sm" onClick={() => addAnnotation('text')} title="Ajouter une zone de texte libre"><Icon name="edit" size={13} /> Texte</button>
            <button className="btn ghost sm" onClick={() => addAnnotation('note')} title="Ajouter une note"><Icon name="lightbulb" size={13} /> Note</button>
            <button className="btn ghost sm" onClick={() => addAnnotation('redact')} title="Masquer un passage"><Icon name="box" size={13} /> Masquer</button>
          </div>
        )}

        <div style={{ flex: 1 }} />

        <button className="btn ghost sm" onClick={() => setPanelOpen((v) => !v)} title="Notions surlignées">
          <Icon name={panelOpen ? 'chevR' : 'chevL'} size={13} /> Notions ({highlights.length})
        </button>
        <button className="btn sm" onClick={copyPriority} disabled={!highlights.length}><Icon name={copied ? 'check' : 'copy'} size={13} /> {copied ? 'Copié' : 'Copier les notions prioritaires'}</button>
        <button className="btn ghost sm" onClick={exportAnnotated} disabled={!highlights.length || exporting}><Icon name="filePdf" size={13} /> {exporting ? 'Export…' : 'Exporter PDF annoté'}</button>
      </div>

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
                      annotations={annotations.filter((a) => a.page === n)}
                      matches={matches.filter((m) => m.page === n)}
                      activeMatchIdx={activeMatch}
                      onCreateHighlight={handleCreateHighlightRequest}
                      onHighlightClick={handleHighlightClick}
                      onAnnotationChange={updateAnnotationLocal}
                      onAnnotationCommit={commitAnnotationSave}
                      onAnnotationDelete={deleteAnnotation}
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
        <div className="hint" style={{ marginTop: 10 }}><Icon name="info" size={13} /> Sélectionne du texte pour le surligner. Clique un surlignage pour changer sa couleur ou le supprimer.</div>
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
    texte + surlignages + surlignage de recherche (temporaire) + annotations. */
function PdfPageContent({
  pdfDoc, pageNum, scale, mode, highlights, annotations, matches, activeMatchIdx,
  onCreateHighlight, onHighlightClick, onAnnotationChange, onAnnotationCommit, onAnnotationDelete,
}) {
  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);

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
    })();
    return () => { cancelled = true; };
  }, [pdfDoc, pageNum, scale]);

  const handleMouseUp = () => {
    if (mode !== 'edit') return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const container = textLayerRef.current;
    if (!container || !container.contains(sel.anchorNode)) return;
    const texte = sel.toString().trim();
    if (!texte) return;
    const range = sel.getRangeAt(0);
    const clientRects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
    const cr = container.getBoundingClientRect();
    if (!clientRects.length || !cr.width || !cr.height) return;
    const rects = clientRects.map((r) => ({ x: (r.left - cr.left) / cr.width, y: (r.top - cr.top) / cr.height, width: r.width / cr.width, height: r.height / cr.height }));
    const anchor = clientRects[clientRects.length - 1];
    onCreateHighlight({ page: pageNum, texte, rects, x: anchor.right, y: anchor.bottom });
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
        {matches.map((m) => (
          <div key={'m' + m.idx} className={'pdfr-match-rect' + (m.idx === activeMatchIdx ? ' active' : '')}
            style={{ left: m.rect.x * 100 + '%', top: m.rect.y * 100 + '%', width: m.rect.width * 100 + '%', height: m.rect.height * 100 + '%' }} />
        ))}
      </div>
      {annotations.map((a) => (
        <AnnotationBox key={a.id} ann={a} editable={mode === 'edit'}
          onChange={onAnnotationChange} onCommit={onAnnotationCommit} onDelete={() => onAnnotationDelete(a.id)} />
      ))}
    </>
  );
}

/** B6 : boîte d'annotation déplaçable/redimensionnable/éditable/supprimable (zone de texte
    libre, note, ou masquage opaque). Drag/resize en état local ; persistance IndexedDB
    uniquement au relâchement (onCommit), pas à chaque frame. */
function AnnotationBox({ ann, editable, onChange, onCommit, onDelete }) {
  const boxRef = useRef(null);
  const drag = useRef(null);
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  const onMove = (e) => {
    const d = drag.current; if (!d) return;
    const dx = (e.clientX - d.startX) / d.pw;
    const dy = (e.clientY - d.startY) / d.ph;
    const next = d.mode === 'move'
      ? { ...ann, x: clamp01(d.origX + dx), y: clamp01(d.origY + dy) }
      : { ...ann, width: Math.max(0.03, d.origW + dx), height: Math.max(0.03, d.origH + dy) };
    d.last = next;
    onChange(next);
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    const d = drag.current; drag.current = null;
    if (d && d.last) onCommit(d.last);
  };
  const startMove = (e) => {
    if (!editable) return;
    e.stopPropagation(); e.preventDefault();
    const pr = boxRef.current.parentElement.getBoundingClientRect();
    drag.current = { mode: 'move', startX: e.clientX, startY: e.clientY, origX: ann.x, origY: ann.y, pw: pr.width, ph: pr.height };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  const startResize = (e) => {
    if (!editable) return;
    e.stopPropagation(); e.preventDefault();
    const pr = boxRef.current.parentElement.getBoundingClientRect();
    drag.current = { mode: 'resize', startX: e.clientX, startY: e.clientY, origW: ann.width, origH: ann.height, pw: pr.width, ph: pr.height };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div ref={boxRef} className={'ann-box ann-' + ann.type + (editable ? ' editable' : '')}
      style={{ left: ann.x * 100 + '%', top: ann.y * 100 + '%', width: ann.width * 100 + '%', height: ann.height * 100 + '%' }}
      onPointerDown={startMove}>
      {ann.type !== 'redact' && (
        <textarea className="ann-text" value={ann.text} readOnly={!editable}
          placeholder={editable ? (ann.type === 'note' ? 'Note…' : 'Texte…') : ''}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => onChange({ ...ann, text: e.target.value })}
          onBlur={() => onCommit(ann)} />
      )}
      {editable && <div className="ann-resize" onPointerDown={startResize} />}
      {editable && <button className="ann-del" onPointerDown={(e) => e.stopPropagation()} onClick={onDelete}><Icon name="x" size={11} /></button>}
    </div>
  );
}
