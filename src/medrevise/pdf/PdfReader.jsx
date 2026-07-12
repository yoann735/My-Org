/* ============================================================
   MedRevise — Partie B : lecteur PDF + surlignage.
   Rendu pdf.js sur <canvas>, couche de texte "maison" construite depuis
   getTextContent() (positionnement via item.transform × viewport.transform,
   pdfjsLib.Util.transform — indépendant de la classe TextLayer interne de
   pdfjs-dist, dont le contrat CSS varie trop entre versions pour être fiable
   ici). Elle sert UNIQUEMENT à capter une sélection native du navigateur
   (texte exact + rectangles) ; elle reste invisible (color: transparent).

   Surlignages stockés dans IndexedDB (store "highlights", storage.js) avec
   des rects normalisés [0,1] par rapport à la page — donc valides à tout
   niveau de zoom au rechargement (voir CSS .pdfr-hl-rect en %).
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument, rgb, BlendMode } from 'pdf-lib';
import { Icon } from '../../shared/Icon.jsx';
import { EdTop } from '../components/ui.jsx';
import { getBlob, putBlob, getAll, put, remove, newHighlight } from '../lib/storage.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const COLORS = [
  { id: 'jaune', hex: '#FFD84D' },
  { id: 'vert', hex: '#8BE38B' },
  { id: 'bleu', hex: '#7EC8FF' },
  { id: 'rose', hex: '#FF9FD1' },
];
const COLOR_HEX = Object.fromEntries(COLORS.map((c) => [c.id, c.hex]));
const COLOR_RGB = { jaune: rgb(1, 0.85, 0.3), vert: rgb(0.55, 0.89, 0.55), bleu: rgb(0.5, 0.78, 1), rose: rgb(1, 0.62, 0.82) };

/** construit une couche de texte invisible mais sélectionnable, positionnée
    à partir de la transform de chaque item de contenu texte de pdf.js. */
async function buildTextLayer(page, viewport, container) {
  const textContent = await page.getTextContent();
  container.replaceChildren();
  container.style.width = `${viewport.width}px`;
  container.style.height = `${viewport.height}px`;
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

export function PdfReader({ ctx }) {
  const { pdfView, db } = ctx;
  const fiche = db.fiches.find((f) => f.id === pdfView.ficheId);

  const [pdfDoc, setPdfDoc] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [scale, setScale] = useState(1.15);
  const [mode, setMode] = useState(pdfView.mode || 'read');
  const [highlights, setHighlights] = useState([]);
  const [pending, setPending] = useState(null); // { page, texte, rects, x, y }
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchStatus, setSearchStatus] = useState(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  const pageBoxRef = useRef(null);
  const pageTextCache = useRef({});

  // charge le document PDF depuis le Blob IndexedDB
  useEffect(() => {
    let cancelled = false;
    setPdfDoc(null); setLoadError(null); pageTextCache.current = {};
    if (!fiche || !fiche.pdfId) return;
    (async () => {
      try {
        const blob = await getBlob(fiche.pdfId);
        if (!blob) { if (!cancelled) setLoadError('PDF introuvable.'); return; }
        const buf = await blob.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: buf }).promise;
        if (cancelled) return;
        setPdfDoc(doc); setNumPages(doc.numPages); setPageNum(1);
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
  useEffect(() => { reloadHighlights(); }, [pdfView.ficheId]);

  // rendu de la page courante : canvas + couche de texte
  useEffect(() => {
    if (!pdfDoc) return;
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

  const getPageText = async (n) => {
    if (pageTextCache.current[n] != null) return pageTextCache.current[n];
    const page = await pdfDoc.getPage(n);
    const tc = await page.getTextContent();
    const txt = tc.items.map((it) => it.str || '').join(' ');
    pageTextCache.current[n] = txt;
    return txt;
  };

  const runSearch = async () => {
    const q = search.trim().toLowerCase();
    if (!q || !pdfDoc || searching) return;
    setSearching(true); setSearchStatus(null);
    try {
      for (let i = 1; i <= numPages; i++) {
        const n = ((pageNum - 1 + i) % numPages) + 1;
        const txt = (await getPageText(n)).toLowerCase();
        if (txt.includes(q)) { setPageNum(n); setSearching(false); return; }
      }
      setSearchStatus('Aucun résultat.');
    } finally {
      setSearching(false);
    }
  };

  // B3 : sélection de texte → surlignage en attente (choix de couleur)
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
    const rects = clientRects.map((r) => ({
      x: (r.left - cr.left) / cr.width,
      y: (r.top - cr.top) / cr.height,
      width: r.width / cr.width,
      height: r.height / cr.height,
    }));
    const anchor = clientRects[clientRects.length - 1];
    setPending({ page: pageNum, texte, rects, x: anchor.right, y: anchor.bottom });
  };

  // ferme le sélecteur de couleur au clic dehors / Échap
  useEffect(() => {
    if (!pending) return;
    const onDown = (e) => { if (!(e.target.closest && e.target.closest('.hl-picker'))) setPending(null); };
    const onKey = (e) => { if (e.key === 'Escape') setPending(null); };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
  }, [pending]);

  const commitHighlight = async (couleur) => {
    if (!pending) return;
    const rec = newHighlight({ ficheId: pdfView.ficheId, page: pending.page, texte: pending.texte, couleur, rects: pending.rects });
    await put('highlights', rec);
    setPending(null);
    window.getSelection && window.getSelection().removeAllRanges();
    await reloadHighlights();
  };
  const deleteHighlight = async (id) => { await remove('highlights', id); await reloadHighlights(); };

  // B5 : livrable — texte prêt à coller dans le chat Claude
  const copyPriority = async () => {
    if (!highlights.length) return;
    const lines = highlights.map((h, i) => `${i + 1}. "${h.texte}" (p.${h.page})`).join('\n');
    const text = `NOTIONS PRIORITAIRES SURLIGNÉES PAR L'ÉTUDIANT :\n${lines}\n\nGénère EN PRIORITÉ des questions portant sur ces notions, avant de couvrir le reste du cours.`;
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (e) { /* ignore */ }
  };

  // B6 : export secondaire — PDF avec les surlignages incrustés (confort de lecture hors app)
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
            x: r.x * width,
            y: height - (r.y + r.height) * height,
            width: r.width * width,
            height: r.height * height,
            color: COLOR_RGB[h.couleur] || COLOR_RGB.jaune,
            opacity: 0.4,
            blendMode: BlendMode.Multiply,
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

  const attach = async (file) => {
    if (!file) return;
    const pdfId = await putBlob(file);
    await ctx.setFichePdf(pdfView.ficheId, pdfId);
  };

  if (!fiche) {
    return (
      <div className="screen scroll fadein">
        <div className="hint">Fiche introuvable.</div>
        <button className="btn" style={{ marginTop: 12 }} onClick={ctx.closePdfReader}><Icon name="arrowR" size={14} style={{ transform: 'rotate(180deg)' }} /> Retour</button>
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
          <div className="sub">Lecteur PDF{numPages ? ` · page ${pageNum} / ${numPages}` : ''}</div>
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
          <button className="icon-btn sm" disabled={pageNum <= 1} onClick={() => setPageNum((p) => Math.max(1, p - 1))}><Icon name="chevL" size={16} /></button>
          <span className="hint tnum" style={{ minWidth: 56, textAlign: 'center' }}>{pageNum} / {numPages || '…'}</span>
          <button className="icon-btn sm" disabled={pageNum >= numPages} onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}><Icon name="chevR" size={16} /></button>
        </div>

        <div className="row" style={{ gap: 4 }}>
          <button className="icon-btn sm" onClick={() => setScale((s) => Math.max(0.5, +(s - 0.15).toFixed(2)))}><Icon name="minus" size={14} /></button>
          <span className="hint tnum" style={{ minWidth: 44, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
          <button className="icon-btn sm" onClick={() => setScale((s) => Math.min(3, +(s + 0.15).toFixed(2)))}><Icon name="plus" size={14} /></button>
        </div>

        <div className="search" style={{ maxWidth: 220, height: 34 }}>
          <Icon name="search" size={14} className="ic" />
          <input placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }} />
        </div>
        {searchStatus && <span className="hint" style={{ color: 'var(--accent-2)' }}>{searchStatus}</span>}

        <div style={{ flex: 1 }} />

        <button className="btn ghost sm" onClick={() => setPanelOpen((v) => !v)} title="Notions surlignées">
          <Icon name={panelOpen ? 'chevR' : 'chevL'} size={13} /> Notions ({highlights.length})
        </button>
        <button className="btn sm" onClick={copyPriority} disabled={!highlights.length}><Icon name={copied ? 'check' : 'copy'} size={13} /> {copied ? 'Copié' : 'Copier les notions prioritaires'}</button>
        <button className="btn ghost sm" onClick={exportAnnotated} disabled={!highlights.length || exporting}><Icon name="filePdf" size={13} /> {exporting ? 'Export…' : 'Exporter PDF annoté'}</button>
      </div>

      {loadError && <div className="err-mini" style={{ marginBottom: 12 }}><div className="em-ic crit"><Icon name="alert" size={16} /></div><div className="em-body"><div className="em-title">{loadError}</div></div></div>}

      <div className="pdfr-body">
        <div className="pdfr-canvas-wrap">
          {!pdfDoc && !loadError && <div className="gen-spinner" style={{ width: 40, height: 40, margin: '60px auto' }} />}
          <div className="pdfr-page" ref={pageBoxRef} style={{ display: pdfDoc ? 'block' : 'none' }}>
            <canvas ref={canvasRef} />
            <div ref={textLayerRef} className="pdfr-textlayer" onMouseUp={handleMouseUp} />
            <div className="pdfr-hlayer">
              {highlights.filter((h) => h.page === pageNum).flatMap((h) => h.rects.map((r, i) => (
                <div key={h.id + ':' + i} className={'pdfr-hl-rect' + (mode === 'edit' ? ' clickable' : '')}
                  style={{ left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.width * 100 + '%', height: r.height * 100 + '%', background: COLOR_HEX[h.couleur] || COLOR_HEX.jaune }}
                  title={mode === 'edit' ? 'Cliquer pour supprimer' : h.texte}
                  onClick={mode === 'edit' ? () => deleteHighlight(h.id) : undefined} />
              )))}
            </div>
          </div>
        </div>

        {panelOpen && (
          <div className="pdfr-panel">
            <h3 className="serif">Notions surlignées</h3>
            {highlights.length === 0 && <div className="hint">Surligne du texte en mode Édition pour le retrouver ici.</div>}
            {highlights.map((h) => (
              <div className="hl-entry" key={h.id} onClick={() => setPageNum(h.page)}>
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
        <div className="hint" style={{ marginTop: 10 }}><Icon name="info" size={13} /> Sélectionne du texte dans le PDF pour le surligner. Clique un surlignage pour le supprimer.</div>
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
    </div>
  );
}
