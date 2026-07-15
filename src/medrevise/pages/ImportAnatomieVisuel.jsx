/* ============================================================
   MedRevise — import ANATOMIE, sous-mode VISUEL : ÉDITEUR DE SCHÉMA
   ANNOTÉ (Étape B). Éditeur d'image DÉDIÉ (overlay SVG + boîtes HTML
   au-dessus d'une <img>), SANS pdf.js.

   DÉCISIONS D'ARCHI (voir spec) :
   - Les annotations (coches + flèches) sont des DONNÉES STRUCTURÉES,
     jamais aplaties dans l'image → le quiz masque un CHAMP, pas un pixel.
   - Toutes les positions sont en COORDONNÉES RELATIVES (0..1) : elles
     survivent au zoom et au redimensionnement (rendu = relatif × taille
     affichée, via des % CSS/SVG — aucun désalignement possible).
   - L'export image/PDF n'existe QUE pour l'archivage/impression : il
     APLATIT tout et n'est PAS réimportable en quiz.

   Une coche = { id, ancre{x,y}, boite{x,y}, texte, couleur, numero }.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { DestPicker } from '../components/ui.jsx';
import { genId, putBlob } from '../lib/storage.js';
import { saveAnatSchema } from '../lib/import.js';
import { ANAT_TYPES, champsFor, parseStructure, detectType } from '../lib/anatParse.js';
import { SCHEMA_VUES, vueLabel } from '../lib/anatSchema.js';

const SOUS_CATS = ['Muscles', 'Os', 'Nerfs', 'Ligaments', 'Vaisseaux'];
const COLORS = ['#7C6FE0', '#E0556B', '#4FB87A', '#4FA6D9', '#E0A34F', '#B45FD9'];
const DEFAULT_COLOR = COLORS[0];
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const markerId = (col) => 'anat-ah-' + (col || DEFAULT_COLOR).replace('#', '');
const DEFAULT_ZONE_OPACITY = 0.25;

/* centroïde d'une annotation (zone → centre géométrique ; point → son ancre). Sert
   à positionner libellé/flèche par défaut et à garder un `ancre` cohérent sur les
   zones pour les consommateurs qui le lisent encore. */
export function centroidOf(c) {
  if (c && c.kind === 'zone' && c.zone) {
    if (c.zone.shape === 'rect' && c.zone.rect) {
      const r = c.zone.rect; return { x: clamp01(r.x + r.w / 2), y: clamp01(r.y + r.h / 2) };
    }
    const pts = (c.zone.points || []);
    if (pts.length) { const s = pts.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 }); return { x: s.x / pts.length, y: s.y / pts.length }; }
  }
  return (c && c.ancre) || { x: 0.5, y: 0.5 };
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/* rendu SVG partagé des zones (fill semi-transparent). viewBox 0..100 +
   preserveAspectRatio=none → coordonnées relatives directes ; vectorEffect garde
   un trait d'épaisseur constante malgré l'étirement. Utilisé par l'éditeur,
   l'aperçu (lecture) et le quiz. `borderFor` permet au quiz de recolorer. */
export function ZonesLayer({ coches, selectedId, mode, onZonePointerDown, borderFor }) {
  const zones = (coches || []).filter((c) => c.kind === 'zone' && c.zone);
  if (!zones.length) return null;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
      {zones.map((c) => {
        const col = (borderFor && borderFor(c)) || c.couleur || DEFAULT_COLOR;
        const op = c.zone.opacity ?? DEFAULT_ZONE_OPACITY;
        const interactive = mode === 'select' && !!onZonePointerDown;
        const common = {
          fill: col, fillOpacity: op, stroke: col, strokeOpacity: 0.95,
          strokeWidth: c.id === selectedId ? 2.4 : 1.6, vectorEffect: 'non-scaling-stroke',
          style: { pointerEvents: interactive ? 'auto' : 'none', cursor: 'grab' },
          onPointerDown: interactive ? (e) => onZonePointerDown(e, c) : undefined,
        };
        if (c.zone.shape === 'rect') {
          const r = c.zone.rect;
          return <rect key={'z' + c.id} x={r.x * 100} y={r.y * 100} width={r.w * 100} height={r.h * 100} rx="1.2" {...common} />;
        }
        const pts = (c.zone.points || []).map((p) => `${p.x * 100},${p.y * 100}`).join(' ');
        return <polygon key={'z' + c.id} points={pts} {...common} />;
      })}
    </svg>
  );
}

export function ImportAnatomieVisuel({ ctx }) {
  const { db } = ctx;
  const sources = db.sources.filter((s) => !s.archive);
  const [srcId, setSrcId] = useState(() => (sources[0] || {}).id);
  const matieresFor = (sid) => db.matieres.filter((m) => m.sourceId === sid && !m.archive);
  const [matId, setMatId] = useState(() => (matieresFor((sources[0] || {}).id)[0] || {}).id || null);
  const [titre, setTitre] = useState('');
  const [sousCat, setSousCat] = useState('Muscles');

  // MULTI-VUES : chaque vue = { id, vue, coches[], img:{ url, w, h, blobId, newFile } }.
  // MultiSchemaEditor gère le collage, les onglets et les object-URL.
  const [views, setViews] = useState([]);
  const [state, setState] = useState('edit'); // edit | saving | done
  const [result, setResult] = useState(null);

  const totalCoches = views.reduce((n, v) => n + (v.coches || []).length, 0);
  const named = views.reduce((n, v) => n + (v.coches || []).filter((c) => (c.texte || '').trim()).length, 0);
  const hasImage = views.some((v) => v.img && (v.img.newFile || v.img.blobId));
  const valid = !!(matId && hasImage && totalCoches >= 1);

  const save = async () => {
    if (!valid) return;
    setState('saving');
    const images = [];
    for (const v of views) {
      if (!v.img) continue;
      let imageId = v.img.blobId || null;
      if (v.img.newFile) { try { imageId = await putBlob(v.img.newFile); } catch (e) { /* ignore */ } }
      images.push({ imageId, imageW: v.img.w, imageH: v.img.h, vue: v.vue, coches: v.coches });
    }
    const res = await saveAnatSchema({ matiereId: matId, titre: titre || ('Schéma · ' + sousCat), sousCategorie: sousCat, images });
    await ctx.reload();
    setResult(res); setState('done');
  };
  const resetForm = () => { setViews([]); setTitre(''); setResult(null); setState('edit'); };

  if (state === 'saving') {
    return (
      <div className="fadein" style={{ textAlign: 'center', padding: '24px 0' }}>
        <div className="gen-spinner" style={{ width: 48, height: 48, margin: '0 auto 16px' }} />
        <div style={{ fontWeight: 600, fontSize: 16 }}>Enregistrement du schéma…</div>
      </div>
    );
  }
  if (state === 'done' && result) {
    return (
      <div className="fadein" style={{ textAlign: 'center', padding: '6px 0' }}>
        <div className="gd-badge" style={{ width: 60, height: 60, borderRadius: 18, margin: '0 auto 14px' }}><Icon name="check" size={30} stroke={3} /></div>
        <div className="serif" style={{ fontSize: 21 }}>Schéma enregistré !</div>
        <div className="hint" style={{ marginTop: 8 }}>✓ {result.count} coche{result.count > 1 ? 's' : ''} · révisable en quiz d'anatomie visuelle.</div>
        <div className="row" style={{ gap: 10, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
          <button className="btn" onClick={resetForm}><Icon name="refresh" size={14} /> Autre schéma</button>
          <button className="btn primary" onClick={() => ctx.go('library')}><Icon name="book" size={14} /> Bibliothèque</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fadein imp-dest">
      <DestPicker ctx={ctx} srcId={srcId} setSrcId={setSrcId} matId={matId} setMatId={setMatId} />

      <div className="imp-field">
        <label>Sous-catégorie</label>
        <div className="imp-chips">
          {SOUS_CATS.map((s) => <button key={s} className={'imp-chip' + (sousCat === s ? ' on' : '')} onClick={() => setSousCat(s)}>{s}</button>)}
        </div>
      </div>

      <div className="imp-field">
        <label>Titre de la fiche <span className="imp-opt">(optionnel)</span></label>
        <input className="imp-title" placeholder={'ex : Coupe du membre supérieur — ' + sousCat} value={titre} onChange={(e) => setTitre(e.target.value)} />
      </div>

      <div className="imp-field">
        <label>Schéma annoté {totalCoches > 0 && <span className="imp-opt">({views.length} vue{views.length > 1 ? 's' : ''} · {totalCoches} coche{totalCoches > 1 ? 's' : ''}{named < totalCoches ? ` · ${totalCoches - named} sans nom` : ''})</span>}</label>
        <MultiSchemaEditor views={views} setViews={setViews} />
      </div>

      <div className="imp-actions">
        <button className="btn primary" onClick={save} disabled={!valid}><Icon name="check" size={15} /> Enregistrer le schéma</button>
      </div>
      {!valid && <div className="hint" style={{ marginTop: 8 }}>Choisis une matière, colle/importe une image (choisis sa vue), puis place au moins une coche.</div>}
      {valid && named < totalCoches && <div className="hint" style={{ marginTop: 8, color: 'var(--accent-2)' }}><Icon name="alert" size={13} /> {totalCoches - named} coche(s) sans nom seront enregistrées vides (réponse impossible en quiz).</div>}
    </div>
  );
}

/* ============================================================
   ÉDITEUR — image + overlay (flèches SVG + boîtes HTML + ancres).
   Tout est positionné en % (coords relatives × taille affichée) → le
   zoom / redimensionnement ne désaligne jamais les coches.
   ============================================================ */
export function SchemaEditor({ image, setImage, coches, setCoches }) {
  const frameRef = useRef(null);
  const [mode, setMode] = useState('select'); // select | point | zrect | zpoly
  const [selectedId, setSelectedId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [theorieFor, setTheorieFor] = useState(null); // id de la coche dont on édite la théorie
  const [draftRect, setDraftRect] = useState(null);   // zone rectangle en cours de tracé
  const [draftPoly, setDraftPoly] = useState(null);   // sommets d'une zone polygone en cours

  const updateCoche = (id, patch) => setCoches((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const delCoche = (id) => { setCoches((cs) => cs.filter((c) => c.id !== id)); setSelectedId(null); };

  const relFromEvent = (clientX, clientY) => {
    const r = frameRef.current.getBoundingClientRect();
    return { x: clamp01((clientX - r.left) / r.width), y: clamp01((clientY - r.top) / r.height) };
  };

  const addCocheAt = (p) => {
    const numero = coches.length + 1;
    const c = {
      id: genId('c'), kind: 'point', ancre: { x: p.x, y: p.y },
      boite: { x: clamp01(p.x + 0.11), y: clamp01(p.y - 0.06) },
      texte: '', couleur: COLORS[coches.length % COLORS.length], numero,
    };
    setCoches((cs) => [...cs, c]);
    setSelectedId(c.id);
  };

  // crée une ZONE (rect ou poly) : mêmes champs qu'une coche + géométrie de région.
  const addZone = (zone) => {
    const numero = coches.length + 1;
    const ctr = centroidOf({ kind: 'zone', zone });
    const c = {
      id: genId('c'), kind: 'zone', zone,
      // le libellé se pose à côté du centroïde ; ancre = centroïde (cohérence).
      boite: { x: clamp01(ctr.x), y: clamp01(ctr.y - 0.02) }, ancre: { x: ctr.x, y: ctr.y },
      texte: '', couleur: COLORS[coches.length % COLORS.length], numero,
    };
    setCoches((cs) => [...cs, c]);
    setSelectedId(c.id);
  };

  // tracé RECTANGLE : glisser d'un coin à l'autre.
  const startRectDraw = (e) => {
    const p0 = relFromEvent(e.clientX, e.clientY);
    setDraftRect({ x: p0.x, y: p0.y, w: 0, h: 0 });
    const rectOf = (p) => ({ x: Math.min(p0.x, p.x), y: Math.min(p0.y, p.y), w: Math.abs(p.x - p0.x), h: Math.abs(p.y - p0.y) });
    const move = (ev) => setDraftRect(rectOf(relFromEvent(ev.clientX, ev.clientY)));
    const up = (ev) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      const rect = rectOf(relFromEvent(ev.clientX, ev.clientY));
      setDraftRect(null);
      if (rect.w > 0.02 && rect.h > 0.02) { addZone({ shape: 'rect', rect, opacity: DEFAULT_ZONE_OPACITY }); setMode('select'); }
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  // tracé POLYGONE : un clic = un sommet ; clic près du 1er sommet (ou double-clic) = fermer.
  const polyClick = (p) => {
    setDraftPoly((pts) => {
      const cur = pts || [];
      if (cur.length >= 3 && dist(cur[0], p) < 0.03) { finishPoly(cur); return null; }
      return [...cur, p];
    });
  };
  const finishPoly = (pts) => { if (pts && pts.length >= 3) { addZone({ shape: 'poly', points: pts, opacity: DEFAULT_ZONE_OPACITY }); setMode('select'); } setDraftPoly(null); };

  // déplacement d'une zone entière (translation géométrie + libellé + ancre).
  const startZoneDrag = (e, coche) => {
    e.stopPropagation();
    const startX = e.clientX, startY = e.clientY; let moved = false;
    const z0 = coche.zone, b0 = coche.boite, a0 = coche.ancre;
    const move = (ev) => {
      if (!moved && Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 4) moved = true;
      if (!moved) return;
      const r = frameRef.current.getBoundingClientRect();
      const dx = (ev.clientX - startX) / r.width, dy = (ev.clientY - startY) / r.height;
      const nz = z0.shape === 'rect'
        ? { ...z0, rect: { ...z0.rect, x: clamp01(z0.rect.x + dx), y: clamp01(z0.rect.y + dy) } }
        : { ...z0, points: z0.points.map((p) => ({ x: clamp01(p.x + dx), y: clamp01(p.y + dy) })) };
      updateCoche(coche.id, { zone: nz, boite: { x: clamp01(b0.x + dx), y: clamp01(b0.y + dy) }, ancre: { x: clamp01(a0.x + dx), y: clamp01(a0.y + dy) } });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (!moved) setSelectedId(coche.id); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  // poignée de coin d'un rectangle (redimensionnement).
  const startRectCorner = (e, coche, corner) => {
    e.stopPropagation();
    const r0 = coche.zone.rect;
    const x0 = r0.x, y0 = r0.y, x1 = r0.x + r0.w, y1 = r0.y + r0.h;
    const move = (ev) => {
      const p = relFromEvent(ev.clientX, ev.clientY);
      const nx0 = corner.includes('w') ? p.x : x0, nx1 = corner.includes('e') ? p.x : x1;
      const ny0 = corner.includes('n') ? p.y : y0, ny1 = corner.includes('s') ? p.y : y1;
      const rect = { x: Math.min(nx0, nx1), y: Math.min(ny0, ny1), w: Math.abs(nx1 - nx0), h: Math.abs(ny1 - ny0) };
      updateCoche(coche.id, { zone: { ...coche.zone, rect } });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  // poignée d'un sommet de polygone.
  const startVertexDrag = (e, coche, idx) => {
    e.stopPropagation();
    const move = (ev) => {
      const p = relFromEvent(ev.clientX, ev.clientY);
      updateCoche(coche.id, { zone: { ...coche.zone, points: coche.zone.points.map((q, i) => (i === idx ? { x: p.x, y: p.y } : q)) } });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  // clic sur le fond : selon le mode → place une coche, trace une zone, ou désélectionne.
  const onFrameDown = (e) => {
    if (e.button !== 0) return;
    const p = relFromEvent(e.clientX, e.clientY);
    if (mode === 'point') addCocheAt(p);
    else if (mode === 'zrect') startRectDraw(e);
    else if (mode === 'zpoly') polyClick(p);
    else setSelectedId(null);
  };

  // Échap / Entrée pendant un tracé polygone : annuler / fermer.
  useEffect(() => {
    if (mode !== 'zpoly') return;
    const onKey = (e) => {
      if (e.key === 'Escape') { setDraftPoly(null); setMode('select'); }
      else if (e.key === 'Enter') setDraftPoly((pts) => { finishPoly(pts); return null; });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  // sortir du mode polygone en cours de tracé → nettoie le brouillon.
  useEffect(() => { if (mode !== 'zpoly' && draftPoly) setDraftPoly(null); /* eslint-disable-next-line */ }, [mode]);

  // drag générique d'un point relatif (boîte ou ancre) avec seuil clic/déplacement
  const startDrag = (e, coche, field) => {
    e.stopPropagation();
    if (e.target && e.target.tagName === 'INPUT') return; // édition du texte
    const startX = e.clientX, startY = e.clientY;
    const orig = coche[field];
    let moved = false;
    const move = (ev) => {
      if (!moved && Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 4) moved = true;
      if (!moved) return;
      const r = frameRef.current.getBoundingClientRect();
      updateCoche(coche.id, { [field]: { x: clamp01(orig.x + (ev.clientX - startX) / r.width), y: clamp01(orig.y + (ev.clientY - startY) / r.height) } });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!moved) setSelectedId(coche.id); // simple clic → sélection / édition
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const doExport = async (kind) => {
    if (!image || !frameRef.current) return;
    setExporting(true);
    try {
      const imgEl = frameRef.current.querySelector('img');
      const canvas = flattenSchema(imgEl, image.w, image.h, coches);
      if (kind === 'png') {
        await new Promise((res) => canvas.toBlob((b) => { if (b) downloadBlob(b, 'schema-anatomie.png'); res(); }, 'image/png'));
      } else {
        const { PDFDocument } = await import('pdf-lib');
        const bytes = await new Promise((res) => canvas.toBlob(async (b) => res(new Uint8Array(await b.arrayBuffer())), 'image/png'));
        const pdf = await PDFDocument.create();
        const png = await pdf.embedPng(bytes);
        const page = pdf.addPage([image.w, image.h]);
        page.drawImage(png, { x: 0, y: 0, width: image.w, height: image.h });
        const out = await pdf.save();
        downloadBlob(new Blob([out], { type: 'application/pdf' }), 'schema-anatomie.pdf');
      }
    } catch (e) { /* ignore */ }
    setExporting(false);
  };

  const usedColors = [...new Set(coches.map((c) => c.couleur || DEFAULT_COLOR))];

  if (!image) {
    return (
      <label className="anat-vis-drop" tabIndex={0}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); setImage(e.dataTransfer.files[0]); }}
        style={{ display: 'grid', placeItems: 'center', border: '2px dashed var(--border)', borderRadius: 12, padding: '40px 18px', textAlign: 'center', cursor: 'pointer', background: 'var(--card-2)' }}>
        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => setImage(e.target.files[0])} />
        <div style={{ color: 'var(--text-3)', marginBottom: 8 }}><Icon name="image" size={30} /></div>
        <div style={{ fontWeight: 600 }}>Colle une capture (Ctrl/Cmd+V) ou importe une image</div>
        <div className="hint" style={{ marginTop: 6 }}>Ensuite, clique sur l'image pour placer tes coches.</div>
      </label>
    );
  }

  return (
    <div>
      {/* barre d'outils */}
      <div className="row" style={{ gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="seg">
          <button type="button" className={'seg-btn' + (mode === 'select' ? ' active' : '')} onClick={() => setMode('select')}><Icon name="grip" size={13} /> Sélection</button>
          <button type="button" className={'seg-btn' + (mode === 'point' ? ' active' : '')} onClick={() => setMode('point')}><Icon name="target" size={13} /> Coche</button>
          <button type="button" className={'seg-btn' + (mode === 'zrect' ? ' active' : '')} onClick={() => setMode('zrect')}><Icon name="maximize" size={13} /> Zone rect.</button>
          <button type="button" className={'seg-btn' + (mode === 'zpoly' ? ' active' : '')} onClick={() => setMode('zpoly')}><Icon name="sparkle" size={13} /> Zone libre</button>
        </div>
        <label className="btn ghost" style={{ cursor: 'pointer' }}>
          <Icon name="image" size={14} /> Changer l'image
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => setImage(e.target.files[0])} />
        </label>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn ghost sm" disabled={exporting} onClick={() => doExport('png')}><Icon name="upload" size={13} /> Export image</button>
        <button type="button" className="btn ghost sm" disabled={exporting} onClick={() => doExport('pdf')}><Icon name="filePdf" size={13} /> Export PDF</button>
      </div>
      {mode === 'point' && <div className="hint" style={{ marginBottom: 8, color: 'var(--accent)' }}><Icon name="target" size={13} /> Clique un point de l'image pour y placer une coche. Repasse en « Sélection » pour la modifier.</div>}
      {mode === 'zrect' && <div className="hint" style={{ marginBottom: 8, color: 'var(--accent)' }}><Icon name="maximize" size={13} /> Glisse d'un coin à l'autre pour tracer une zone rectangulaire (région à faible opacité).</div>}
      {mode === 'zpoly' && <div className="hint" style={{ marginBottom: 8, color: 'var(--accent)' }}><Icon name="sparkle" size={13} /> Clique chaque sommet de la région. Clique près du 1er point (ou double-clic / Entrée) pour fermer. Échap pour annuler.</div>}

      {/* zone image + overlay */}
      <div style={{ position: 'relative', width: '100%', overflow: 'hidden', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-2)' }}>
        <div ref={frameRef} style={{ position: 'relative', width: '100%', lineHeight: 0, cursor: (mode === 'point' || mode === 'zrect' || mode === 'zpoly') ? 'crosshair' : 'default', touchAction: 'none' }} onPointerDown={onFrameDown} onDoubleClick={() => { if (mode === 'zpoly') setDraftPoly((pts) => { finishPoly(pts); return null; }); }}>
          <img src={image.url} alt="schéma" draggable={false} style={{ display: 'block', width: '100%', height: 'auto', userSelect: 'none' }} />

          {/* ZONES (régions à faible opacité) — sous les flèches/libellés */}
          <ZonesLayer coches={coches} selectedId={selectedId} mode={mode} onZonePointerDown={startZoneDrag} />

          {/* brouillon de tracé (rect en cours / polygone en cours) */}
          {(draftRect || (draftPoly && draftPoly.length)) && (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
              {draftRect && <rect x={draftRect.x * 100} y={draftRect.y * 100} width={draftRect.w * 100} height={draftRect.h * 100} rx="1.2" fill="var(--accent)" fillOpacity="0.18" stroke="var(--accent)" strokeWidth="1.6" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />}
              {draftPoly && draftPoly.length > 0 && (
                <>
                  <polyline points={draftPoly.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
                  {draftPoly.map((p, i) => <circle key={i} cx={p.x * 100} cy={p.y * 100} r="1" fill="var(--accent)" vectorEffect="non-scaling-stroke" />)}
                </>
              )}
            </svg>
          )}

          {/* flèches (px space : pas de viewBox → orient auto non déformé) — POINTS seuls */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
            <defs>
              {usedColors.map((col) => (
                <marker key={col} id={markerId(col)} markerWidth="8" markerHeight="8" refX="5.5" refY="3" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L6,3 L0,6 Z" fill={col} />
                </marker>
              ))}
            </defs>
            {coches.filter((c) => c.kind !== 'zone').map((c) => {
              const col = c.couleur || DEFAULT_COLOR;
              return <line key={c.id} x1={c.boite.x * 100 + '%'} y1={c.boite.y * 100 + '%'} x2={c.ancre.x * 100 + '%'} y2={c.ancre.y * 100 + '%'} stroke={col} strokeWidth={2.2} markerEnd={`url(#${markerId(col)})`} />;
            })}
          </svg>

          {/* ancres (points désignés) — déplaçables indépendamment (POINTS seuls) */}
          {coches.filter((c) => c.kind !== 'zone').map((c) => {
            const col = c.couleur || DEFAULT_COLOR;
            const sel = c.id === selectedId;
            return (
              <span key={'a' + c.id} title="Déplace la pointe de flèche"
                onPointerDown={(e) => startDrag(e, c, 'ancre')}
                style={{ position: 'absolute', left: c.ancre.x * 100 + '%', top: c.ancre.y * 100 + '%', width: sel ? 15 : 12, height: sel ? 15 : 12, marginLeft: sel ? -7.5 : -6, marginTop: sel ? -7.5 : -6, borderRadius: '50%', background: col, border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,.35)', cursor: 'grab', touchAction: 'none' }} />
            );
          })}

          {/* poignées d'édition de la zone sélectionnée (coins de rect / sommets de poly) */}
          {(() => {
            const c = coches.find((x) => x.id === selectedId && x.kind === 'zone');
            if (!c || mode !== 'select') return null;
            const col = c.couleur || DEFAULT_COLOR;
            const handle = (x, y, onDown, key) => (
              <span key={key} onPointerDown={onDown}
                style={{ position: 'absolute', left: x * 100 + '%', top: y * 100 + '%', width: 12, height: 12, marginLeft: -6, marginTop: -6, borderRadius: '50%', background: '#fff', border: `2px solid ${col}`, boxShadow: '0 1px 3px rgba(0,0,0,.35)', cursor: 'grab', touchAction: 'none', zIndex: 6 }} />
            );
            if (c.zone.shape === 'rect') {
              const r = c.zone.rect;
              return [
                handle(r.x, r.y, (e) => startRectCorner(e, c, 'nw'), 'nw'),
                handle(r.x + r.w, r.y, (e) => startRectCorner(e, c, 'ne'), 'ne'),
                handle(r.x, r.y + r.h, (e) => startRectCorner(e, c, 'sw'), 'sw'),
                handle(r.x + r.w, r.y + r.h, (e) => startRectCorner(e, c, 'se'), 'se'),
              ];
            }
            return (c.zone.points || []).map((p, i) => handle(p.x, p.y, (e) => startVertexDrag(e, c, i), 'v' + i));
          })()}

          {/* boîtes de libellé — déplaçables + édition inline + popover */}
          {coches.map((c) => {
            const col = c.couleur || DEFAULT_COLOR;
            const sel = c.id === selectedId;
            return (
              <div key={'b' + c.id} onPointerDown={(e) => startDrag(e, c, 'boite')}
                style={{ position: 'absolute', left: c.boite.x * 100 + '%', top: c.boite.y * 100 + '%', transform: 'translate(-50%,-50%)', display: 'flex', alignItems: 'center', gap: 6, maxWidth: '46%', padding: '4px 8px', borderRadius: 8, background: 'var(--card)', border: `2px solid ${col}`, boxShadow: sel ? `0 0 0 3px color-mix(in srgb, ${col} 30%, transparent), 0 4px 12px rgba(0,0,0,.2)` : '0 2px 8px rgba(0,0,0,.18)', cursor: 'grab', touchAction: 'none', lineHeight: 1.2, zIndex: sel ? 5 : 2 }}>
                <span style={{ flex: '0 0 auto', width: 18, height: 18, borderRadius: '50%', background: col, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>{c.numero}</span>
                {sel ? (
                  <input autoFocus value={c.texte} placeholder="nom de la structure"
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) => updateCoche(c.id, { texte: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setSelectedId(null); }}
                    style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)', font: 'inherit', fontSize: 13, fontWeight: 600, width: Math.max(90, (c.texte || '').length * 8 + 20), maxWidth: 220 }} />
                ) : (
                  <span style={{ fontSize: 13, fontWeight: 600, color: c.texte ? 'var(--text)' : 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.texte || '(sans nom)'}</span>
                )}
                {sel && (
                  <div onPointerDown={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', gap: 8, padding: '9px 10px', borderRadius: 10, background: 'var(--card)', border: '1px solid var(--border)', boxShadow: '0 6px 20px rgba(0,0,0,.25)', zIndex: 10, width: 250 }}>
                    <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                      <div className="row" style={{ gap: 5, flex: 1 }}>
                        {COLORS.map((sc) => (
                          <button key={sc} type="button" title="Changer la couleur" onClick={() => updateCoche(c.id, { couleur: sc })}
                            style={{ width: 18, height: 18, borderRadius: '50%', background: sc, border: sc === col ? '2px solid var(--text)' : '2px solid transparent', cursor: 'pointer', flex: '0 0 auto' }} />
                        ))}
                      </div>
                      <span style={{ width: 1, height: 18, background: 'var(--border)' }} />
                      <button type="button" className="cd-ic" title={c.kind === 'zone' ? 'Supprimer cette zone' : 'Supprimer cette coche'} onClick={() => delCoche(c.id)} style={{ color: 'var(--accent-2)' }}><Icon name="trash" size={14} /></button>
                    </div>
                    {c.kind === 'zone' && (
                      <div className="row" style={{ gap: 8, alignItems: 'center' }} title="Opacité du remplissage">
                        <Icon name="drop" size={13} />
                        <input type="range" min="5" max="60" value={Math.round((c.zone.opacity ?? DEFAULT_ZONE_OPACITY) * 100)}
                          onChange={(e) => updateCoche(c.id, { zone: { ...c.zone, opacity: Number(e.target.value) / 100 } })}
                          style={{ flex: 1 }} />
                        <span className="hint" style={{ fontSize: 11, width: 34, textAlign: 'right' }}>{Math.round((c.zone.opacity ?? DEFAULT_ZONE_OPACITY) * 100)}%</span>
                      </div>
                    )}
                    <div>
                      <label className="hint" style={{ display: 'block', fontSize: 11, marginBottom: 3 }}>Autres réponses acceptées <span style={{ opacity: .7 }}>(virgules)</span></label>
                      <input value={(c.reponses_acceptees || []).join(', ')}
                        placeholder="ex : nerf cubital, N. ulnaire"
                        onChange={(e) => updateCoche(c.id, { reponses_acceptees: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                        style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 7, outline: 'none', background: 'var(--bg-2)', color: 'var(--text)', font: 'inherit', fontSize: 12, fontWeight: 500, padding: '5px 7px' }} />
                    </div>
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                      {(() => {
                        const nb = c.champs ? Object.values(c.champs).filter((v) => (v || '').trim()).length : 0;
                        return (
                          <button type="button" className={'btn sm' + (nb ? '' : ' ghost')} style={{ width: '100%', justifyContent: 'center' }} onClick={() => setTheorieFor(c.id)}>
                            <Icon name="list" size={12} /> Théorie {nb > 0 ? `· ${ANAT_TYPES[c.type] ? ANAT_TYPES[c.type].label : c.type} (${nb})` : '— coller le texte'}
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="hint" style={{ marginTop: 10 }}>
        <Icon name="info" size={13} /> Positions en coordonnées relatives — le zoom ne désaligne rien. L'export image/PDF aplatit tout (archivage/impression seulement) et <strong>n'est pas réimportable en quiz</strong>.
      </div>

      {theorieFor && (() => {
        const c = coches.find((x) => x.id === theorieFor);
        if (!c) return null;
        return (
          <TheorieCocheModal coche={c}
            onSave={(patch) => { updateCoche(c.id, patch); setTheorieFor(null); }}
            onClose={() => setTheorieFor(null)} />
        );
      })()}
    </div>
  );
}

/* ============================================================
   ÉDITEUR MULTI-VUES — enveloppe le SchemaEditor mono-image d'un système
   d'onglets « vues » (Face / Dos / Profil…). Chaque vue = { id, vue, coches[],
   img:{ url, w, h, blobId|null, newFile|null } }. Le parent gère le chargement
   (blobId→URL) et l'enregistrement ; ce composant gère uniquement la navigation
   entre vues, l'ajout (avec choix de la vue) et l'édition de la vue active.
   ============================================================ */
export function MultiSchemaEditor({ views, setViews }) {
  const [activeId, setActiveId] = useState(() => (views[0] && views[0].id) || null);
  const [pendingFile, setPendingFile] = useState(null); // image en attente de choix de vue
  const createdUrls = useRef(new Set());

  useEffect(() => { if (!views.find((v) => v.id === activeId)) setActiveId((views[0] && views[0].id) || null); }, [views, activeId]);
  useEffect(() => () => { createdUrls.current.forEach((u) => { try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ } }); }, []);

  // coller (Ctrl/Cmd+V) → nouvelle vue (on demande d'abord la vue)
  useEffect(() => {
    const onPaste = (e) => {
      const items = (e.clipboardData && e.clipboardData.items) || [];
      for (const it of items) {
        if (it.type && it.type.startsWith('image/')) { const f = it.getAsFile(); if (f) { e.preventDefault(); setPendingFile(f); return; } }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  const active = views.find((v) => v.id === activeId) || null;

  const addViewFromFile = (file, vue) => {
    if (!file || !file.type || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    createdUrls.current.add(url);
    const probe = new Image();
    probe.onload = () => {
      const id = genId('img');
      setViews((vs) => [...vs, { id, vue, coches: [], img: { url, w: probe.naturalWidth, h: probe.naturalHeight, blobId: null, newFile: file } }]);
      setActiveId(id);
    };
    probe.src = url;
  };

  // « Changer l'image » de la vue active (remplace le fichier, garde les coches)
  const setActiveImage = (file) => {
    if (!active || !file || !file.type || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    createdUrls.current.add(url);
    const probe = new Image();
    probe.onload = () => setViews((vs) => vs.map((v) => (v.id === active.id ? { ...v, img: { ...(v.img || {}), url, w: probe.naturalWidth, h: probe.naturalHeight, blobId: null, newFile: file } } : v)));
    probe.src = url;
  };

  const setActiveCoches = (updater) => setViews((vs) => vs.map((v) => (v.id === (active && active.id) ? { ...v, coches: typeof updater === 'function' ? updater(v.coches) : updater } : v)));
  const setVue = (vue) => setViews((vs) => vs.map((v) => (v.id === (active && active.id) ? { ...v, vue } : v)));
  const delView = (id) => setViews((vs) => vs.filter((v) => v.id !== id));

  return (
    <div>
      {views.length > 0 && (
        <div className="row" style={{ gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {views.map((v, i) => {
            const on = v.id === activeId;
            return (
              <div key={v.id} className={'row' + (on ? '' : '')} style={{ gap: 6, alignItems: 'center', padding: '4px 6px 4px 10px', borderRadius: 9, cursor: 'pointer', background: on ? 'var(--accent)' : 'var(--card-2)', color: on ? '#fff' : 'var(--text)', border: '1px solid ' + (on ? 'var(--accent)' : 'var(--border)') }} onClick={() => setActiveId(v.id)}>
                <span style={{ fontSize: 12.5, fontWeight: 700 }}>{i + 1}. {vueLabel(v.vue)}</span>
                <span style={{ fontSize: 11, opacity: .8 }}>({(v.coches || []).length})</span>
                <button type="button" title="Supprimer cette vue" onClick={(e) => { e.stopPropagation(); delView(v.id); }} style={{ display: 'grid', placeItems: 'center', width: 18, height: 18, borderRadius: '50%', border: 'none', background: on ? 'rgba(255,255,255,.25)' : 'transparent', color: on ? '#fff' : 'var(--text-3)', cursor: 'pointer' }}><Icon name="x" size={12} /></button>
              </div>
            );
          })}
          <label className="btn ghost sm" style={{ cursor: 'pointer' }}>
            <Icon name="plus" size={13} /> Ajouter une vue
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { if (e.target.files[0]) setPendingFile(e.target.files[0]); e.target.value = ''; }} />
          </label>
        </div>
      )}

      {active && (
        <div className="imp-field" style={{ marginBottom: 10 }}>
          <label style={{ marginBottom: 4 }}>Vue de cette image</label>
          <div className="imp-chips">
            {SCHEMA_VUES.filter((s) => s.key !== 'non_precisee').map((s) => (
              <button key={s.key} type="button" className={'imp-chip' + (active.vue === s.key ? ' on' : '')} onClick={() => setVue(s.key)}>{s.label}</button>
            ))}
          </div>
        </div>
      )}

      {active
        ? <SchemaEditor key={active.id} image={active.img} setImage={setActiveImage} coches={active.coches} setCoches={setActiveCoches} />
        : <SchemaEditor image={null} setImage={(f) => setPendingFile(f)} coches={[]} setCoches={() => {}} />}

      {pendingFile && (
        <VuePicker
          onPick={(vue) => { addViewFromFile(pendingFile, vue); setPendingFile(null); }}
          onClose={() => setPendingFile(null)} />
      )}
    </div>
  );
}

/* petit sélecteur de VUE affiché à chaque ajout d'image (« demande la vue »). */
function VuePicker({ onPick, onClose }) {
  return (
    <div className="day-pop-scrim" onClick={onClose}>
      <div className="day-pop" style={{ width: 'min(420px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="day-pop-head"><div className="row spread"><div className="serif" style={{ fontSize: 17 }}>Quelle vue est-ce ?</div><button className="icon-btn sm" onClick={onClose}><Icon name="x" size={16} /></button></div></div>
        <div className="day-pop-body">
          <div className="hint" style={{ marginBottom: 10 }}>Chaque image porte ses propres coches. Choisis l'angle de cette vue.</div>
          <div className="imp-chips">
            {SCHEMA_VUES.filter((s) => s.key !== 'non_precisee').map((s) => (
              <button key={s.key} type="button" className="imp-chip" onClick={() => onPick(s.key)}>{s.label}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- THÉORIE INTRINSÈQUE À LA COCHE (étape 1 refonte) : coller un texte →
   détection auto du type (confirmée) → extraction locale des champs → aperçu
   ÉDITABLE → enregistrement dans la coche (c.type + c.champs). Aucune IA. ---- */
const TYPE_ORDER = ['os', 'muscle', 'nerf', 'artere', 'veine', 'tissu_conjonctif'];

function TheorieCocheModal({ coche, onSave, onClose }) {
  const [type, setType] = useState(coche.type || 'muscle');
  const [champs, setChamps] = useState(coche.champs && Object.keys(coche.champs).length ? coche.champs : null);
  const [raw, setRaw] = useState('');
  const [missing, setMissing] = useState([]);
  const [detected, setDetected] = useState(false);

  const defs = champsFor(type);

  // « Analyser » : détecte le type PUIS extrait les champs de ce type.
  const analyse = () => {
    if (!raw.trim()) return;
    const t = detectType(raw);
    setType(t); setDetected(true);
    const r = parseStructure(raw, t);
    setChamps(r.champs); setMissing(r.missing);
  };
  // changement manuel du type : re-parse le texte collé avec le nouveau type
  const changeType = (t) => {
    setType(t);
    if (raw.trim()) { const r = parseStructure(raw, t); setChamps(r.champs); setMissing(r.missing); }
    else { const next = {}; champsFor(t).forEach((d) => { next[d.key] = (champs && champs[d.key]) || ''; }); setChamps(next); }
  };
  const setChamp = (k, v) => setChamps((c) => ({ ...(c || {}), [k]: v }));
  const longField = (k) => champs && (champs[k] || '').length > 60;

  const save = () => onSave({ type, champs: champs || {} });
  const clear = () => onSave({ type: null, champs: {} });

  return (
    <div className="day-pop-scrim" onClick={onClose}>
      <div className="day-pop" style={{ width: 'min(560px, 94vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div className="day-pop-head"><div className="row spread"><div className="serif" style={{ fontSize: 18 }}>Théorie · {coche.texte || 'coche'}</div><button className="icon-btn sm" onClick={onClose}><Icon name="x" size={16} /></button></div></div>
        <div className="day-pop-body" style={{ overflowY: 'auto' }}>
          <div className="imp-field">
            <label>Coller la théorie</label>
            <textarea className="imp-title" style={{ minHeight: 110, resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }}
              placeholder={'Colle le texte (ex : « Origine : … Insertion : … »). Le type et les champs sont détectés automatiquement, sans IA.'}
              value={raw} onChange={(e) => setRaw(e.target.value)} />
            <div className="imp-actions" style={{ marginTop: 8 }}>
              <button className="btn primary" onClick={analyse} disabled={!raw.trim()}><Icon name="sparkle" size={15} /> Analyser</button>
            </div>
          </div>

          <div className="imp-field">
            <label>Type de structure {detected && <span className="imp-opt">(détecté — confirme ou corrige)</span>}</label>
            <div className="imp-chips">
              {TYPE_ORDER.map((t) => <button key={t} className={'imp-chip' + (type === t ? ' on' : '')} onClick={() => changeType(t)}>{ANAT_TYPES[t].label}</button>)}
            </div>
          </div>

          {champs && (
            <div className="imp-field">
              <label>Champs extraits — corrige au besoin</label>
              {missing.length > 0 && <div className="hint" style={{ color: 'var(--accent-2)', margin: '2px 0 8px' }}><Icon name="alert" size={13} /> Non détecté(s) : {missing.join(', ')}.</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {defs.map((d) => (
                  <div key={d.key}>
                    <label className="hint" style={{ display: 'block', fontWeight: 700, marginBottom: 3 }}>{d.label}{!(champs[d.key] || '').trim() && <span style={{ color: 'var(--accent-2)', marginLeft: 6, fontWeight: 500 }}>(vide)</span>}</label>
                    {longField(d.key)
                      ? <textarea className="srcmgr-input" style={{ width: '100%', minHeight: 54, resize: 'vertical', fontSize: 12.5 }} value={champs[d.key] || ''} onChange={(e) => setChamp(d.key, e.target.value)} />
                      : <input className="srcmgr-input" style={{ width: '100%', fontSize: 12.5 }} value={champs[d.key] || ''} onChange={(e) => setChamp(d.key, e.target.value)} placeholder="—" />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="day-pop-foot">
          {coche.champs && Object.keys(coche.champs).length > 0 && <button className="btn ghost" onClick={clear} title="Retirer la théorie de cette coche"><Icon name="trash" size={14} /> Retirer</button>}
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" style={{ flex: 1 }} onClick={save} disabled={!champs}><Icon name="check" size={15} /> Enregistrer la théorie</button>
        </div>
      </div>
    </div>
  );
}

/* aplatit image + annotations sur un canvas à la taille naturelle (export) */
function flattenSchema(imgEl, w, h, coches) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgEl, 0, 0, w, h);
  const fs = Math.max(13, Math.round(w * 0.016));
  const lw = Math.max(2, w * 0.002);
  ctx.font = `600 ${fs}px system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = 'middle';
  coches.forEach((c) => {
    const col = c.couleur || DEFAULT_COLOR;
    const ax = c.ancre.x * w, ay = c.ancre.y * h, bx = c.boite.x * w, by = c.boite.y * h;
    // flèche
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ax, ay); ctx.stroke();
    const ang = Math.atan2(ay - by, ax - bx); const ah = Math.max(9, w * 0.013);
    ctx.beginPath(); ctx.moveTo(ax, ay);
    ctx.lineTo(ax - ah * Math.cos(ang - 0.45), ay - ah * Math.sin(ang - 0.45));
    ctx.lineTo(ax - ah * Math.cos(ang + 0.45), ay - ah * Math.sin(ang + 0.45));
    ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    // ancre
    ctx.beginPath(); ctx.arc(ax, ay, Math.max(3, w * 0.0035), 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
    // libellé
    const label = `${c.numero}. ${c.texte || ''}`.trim();
    const padX = fs * 0.55, padY = fs * 0.4;
    const tw = ctx.measureText(label).width;
    const boxW = tw + padX * 2, boxH = fs + padY * 2;
    const lx = bx - boxW / 2, ly = by - boxH / 2;
    roundRect(ctx, lx, ly, boxW, boxH, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.96)'; ctx.fill();
    ctx.lineWidth = Math.max(1.5, w * 0.0016); ctx.strokeStyle = col; roundRect(ctx, lx, ly, boxW, boxH, 6); ctx.stroke();
    ctx.fillStyle = '#15151b'; ctx.fillText(label, lx + padX, by + 1);
  });
  return canvas;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
