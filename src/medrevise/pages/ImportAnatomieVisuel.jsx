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
import { SCHEMA_VUES, vueLabel, useVueAide } from '../lib/anatSchema.js';

const SOUS_CATS = ['Muscles', 'Os', 'Nerfs', 'Ligaments', 'Vaisseaux'];
const COLORS = ['#7C6FE0', '#E0556B', '#4FB87A', '#4FA6D9', '#E0A34F', '#B45FD9'];
const DEFAULT_COLOR = COLORS[0];
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const markerId = (col) => 'anat-ah-' + (col || DEFAULT_COLOR).replace('#', '');
const DEFAULT_ZONE_OPACITY = 0.25;
const DEFAULT_STROKE_WIDTH = 2;
const BRUSH_MIN_DIST = 0.004; // décimation du pinceau libre (distance relative mini entre 2 points)
const ZOOM_MIN = 1, ZOOM_MAX = 6, ZOOM_STEP = 1.25; // zoom éditeur de schéma (B) — 1 = cadrage entier (défaut)
const PAN_MIN_VISIBLE = 80; // px — le pan est borné pour garder au moins ça de l'image visible

/* outils de dessin de zones (barre d'outils). rect/ellipse = boîte englobante ;
   poly = sommets ; brush = tracé libre (liste de points) ; line = segment. */
const DRAW_TOOLS = [
  { key: 'brush', label: 'Pinceau', icon: 'edit' },
  { key: 'line', label: 'Trait', icon: 'minus' },
  { key: 'rect', label: 'Rectangle', icon: 'maximize' },
  { key: 'ellipse', label: 'Ellipse', icon: 'target' },
  { key: 'poly', label: 'Polygone', icon: 'sparkle' },
];
const SHAPE_LABEL = { rect: 'Rectangle', ellipse: 'Ellipse', poly: 'Polygone', path: 'Tracé libre', line: 'Trait' };
const TOOL_HINT = {
  brush: 'Dessine à main levée (souris/doigt/stylet). Contour ouvert par défaut ; active « remplir » pour une région.',
  line: 'Glisse d\'un point à l\'autre pour un segment droit (utile pour un trajet). Extrémités éditables ensuite.',
  rect: 'Glisse d\'un coin à l\'autre pour un rectangle.',
  ellipse: 'Glisse d\'un coin à l\'autre pour une ellipse.',
  poly: 'Clique chaque sommet ; clique près du 1er point (ou double-clic / Entrée) pour fermer. Échap = annuler.',
};

/* style EFFECTIF d'une zone. Rétro-compat : les anciennes zones n'ont que `opacity`
   (+ couleur) → on en dérive fill/stroke/strokeWidth ; `fill`/`stroke` valant `null`
   signifient explicitement « sans remplissage » / « sans contour ». */
export function zoneStyle(c) {
  const z = (c && c.zone) || {};
  const col = (c && c.couleur) || DEFAULT_COLOR;
  return {
    fill: z.fill !== undefined ? z.fill : col,
    fillOpacity: Number.isFinite(z.fillOpacity) ? z.fillOpacity : (Number.isFinite(z.opacity) ? z.opacity : DEFAULT_ZONE_OPACITY),
    stroke: z.stroke !== undefined ? z.stroke : col,
    strokeWidth: Number.isFinite(z.strokeWidth) ? z.strokeWidth : DEFAULT_STROKE_WIDTH,
    closed: z.shape === 'line' ? false : (z.closed !== undefined ? !!z.closed : true),
  };
}

/* centroïde d'une annotation (zone → centre géométrique ; point → son ancre). Sert
   à positionner libellé/flèche par défaut et à garder un `ancre` cohérent sur les
   zones pour les consommateurs qui le lisent encore. */
export function centroidOf(c) {
  if (c && c.kind === 'zone' && c.zone) {
    if ((c.zone.shape === 'rect' || c.zone.shape === 'ellipse') && c.zone.rect) {
      const r = c.zone.rect; return { x: clamp01(r.x + r.w / 2), y: clamp01(r.y + r.h / 2) };
    }
    const pts = (c.zone.points || []);
    if (pts.length) { const s = pts.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 }); return { x: s.x / pts.length, y: s.y / pts.length }; }
  }
  return (c && c.ancre) || { x: 0.5, y: 0.5 };
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/* C — lissage LÉGER du pinceau libre : moyenne mobile pondérée (fenêtre 5, poids
   1-2-4-2-1) sur les points intérieurs, extrémités (départ/fin du geste) préservées
   telles quelles. Comme les points bruts sont déjà très rapprochés (décimation
   BRUSH_MIN_DIST), la fenêtre ne couvre qu'un tout petit arc du tracé : ça absorbe
   le micro-tremblement souris/trackpad sans arrondir la forme dessinée. Points
   relatifs (0..1) en entrée/sortie. */
const SMOOTH_WEIGHTS = [1, 2, 4, 2, 1];
function smoothPath(points) {
  const n = points.length;
  if (n < 5) return points;
  const wsum = SMOOTH_WEIGHTS.reduce((a, b) => a + b, 0);
  const out = [points[0]];
  for (let i = 1; i < n - 1; i++) {
    let sx = 0, sy = 0;
    for (let k = -2; k <= 2; k++) {
      const p = points[Math.max(0, Math.min(n - 1, i + k))];
      sx += p.x * SMOOTH_WEIGHTS[k + 2]; sy += p.y * SMOOTH_WEIGHTS[k + 2];
    }
    out.push({ x: sx / wsum, y: sy / wsum });
  }
  out.push(points[n - 1]);
  return out;
}

/* rendu SVG partagé des zones (toutes formes). viewBox 0..100 +
   preserveAspectRatio=none → coordonnées relatives directes ; vectorEffect garde
   un trait d'épaisseur constante malgré l'étirement. Utilisé par l'éditeur,
   l'aperçu (lecture) et le quiz. `borderFor` permet au quiz de recolorer. */
export function ZonesLayer({ coches, selectedId, mode, onZonePointerDown, borderFor }) {
  const zones = (coches || []).filter((c) => c.kind === 'zone' && c.zone);
  if (!zones.length) return null;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
      {zones.map((c) => {
        const st = zoneStyle(c);
        const recolor = borderFor && borderFor(c); // quiz : recolore remplissage + contour
        const hasFill = st.fill !== null;
        const hasStroke = st.stroke !== null || !!recolor; // en quiz, garantir un contour visible
        const interactive = mode === 'select' && !!onZonePointerDown;
        const common = {
          fill: hasFill ? (recolor || st.fill) : 'none',
          fillOpacity: hasFill ? st.fillOpacity : 0,
          stroke: hasStroke ? (recolor || st.stroke || DEFAULT_COLOR) : 'none',
          strokeOpacity: 0.95,
          strokeWidth: (c.id === selectedId ? st.strokeWidth + 0.8 : st.strokeWidth) || 1.6,
          vectorEffect: 'non-scaling-stroke', strokeLinejoin: 'round', strokeLinecap: 'round',
          style: { pointerEvents: interactive ? 'auto' : 'none', cursor: 'grab' },
          onPointerDown: interactive ? (e) => onZonePointerDown(e, c) : undefined,
        };
        const z = c.zone;
        if (z.shape === 'rect') { const r = z.rect; return <rect key={'z' + c.id} x={r.x * 100} y={r.y * 100} width={r.w * 100} height={r.h * 100} rx="1.2" {...common} />; }
        if (z.shape === 'ellipse') { const r = z.rect; return <ellipse key={'z' + c.id} cx={(r.x + r.w / 2) * 100} cy={(r.y + r.h / 2) * 100} rx={(r.w / 2) * 100} ry={(r.h / 2) * 100} {...common} />; }
        const pts = (z.points || []).map((p) => `${p.x * 100},${p.y * 100}`).join(' ');
        if (st.closed) return <polygon key={'z' + c.id} points={pts} {...common} />;
        return <polyline key={'z' + c.id} points={pts} {...common} fill="none" />;
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
        <div className="hint" style={{ marginTop: 8 }}>✓ {result.count} coche{result.count > 1 ? 's' : ''} · révisable en quiz de schéma.</div>
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
  const outerRef = useRef(null); // B — cadre visible (overflow:hidden) : reçoit le listener wheel natif
  const [mode, setMode] = useState('select'); // select | point | brush | line | rect | ellipse | poly
  const [selectedId, setSelectedId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [theorieFor, setTheorieFor] = useState(null); // id de la coche dont on édite la théorie
  const [draftBox, setDraftBox] = useState(null);     // rect/ellipse en cours de tracé { shape, x, y, w, h }
  const [draftPoly, setDraftPoly] = useState(null);   // sommets d'une zone polygone en cours
  const [draftPath, setDraftPath] = useState(null);   // points d'un tracé pinceau en cours
  const [draftLine, setDraftLine] = useState(null);   // { a, b } d'un trait en cours
  // style courant (appliqué aux formes À VENIR ; la barre de style l'édite hors sélection)
  const [style, setStyle] = useState({ fill: DEFAULT_COLOR, fillOpacity: DEFAULT_ZONE_OPACITY, stroke: DEFAULT_COLOR, strokeWidth: DEFAULT_STROKE_WIDTH });
  // B — zoom/pan : transform CSS sur le cadre (frameRef). Le transform ne change pas
  // la boîte de layout → relFromEvent (getBoundingClientRect, déjà post-transform)
  // reste juste sans aucune adaptation : les coches restent alignées à tout zoom.
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false); // A — retour visuel (curseur grabbing) pendant un pan actif
  // valeurs toujours à jour pour le listener natif (voir plus bas) qui ne peut pas
  // dépendre du re-render React sous peine de rattacher l'écouteur à chaque frame.
  const scaleRef = useRef(scale); scaleRef.current = scale;
  const panRef = useRef(pan); panRef.current = pan;

  const updateCoche = (id, patch) => setCoches((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const delCoche = (id) => { setCoches((cs) => cs.filter((c) => c.id !== id)); setSelectedId(null); };

  // applique un changement de style à une zone (+ synchronise la couleur du badge ;
  // pour le pinceau, activer/désactiver le remplissage ferme/ouvre le tracé).
  const applyZoneStyle = (c, patch) => {
    const zp = { ...c.zone, ...patch };
    if (patch.fill !== undefined && c.zone.shape === 'path') zp.closed = patch.fill != null;
    const up = { zone: zp };
    if (patch.stroke !== undefined && patch.stroke) up.couleur = patch.stroke;
    else if (patch.fill !== undefined && patch.fill && c.zone.stroke == null) up.couleur = patch.fill;
    updateCoche(c.id, up);
  };

  const relFromEvent = (clientX, clientY) => {
    const r = frameRef.current.getBoundingClientRect();
    return { x: clamp01((clientX - r.left) / r.width), y: clamp01((clientY - r.top) / r.height) };
  };

  // B — zoom centré sur un point écran (curseur molette, ou centre du cadre pour les
  // boutons +/-) : on garde le point sous (clientX,clientY) fixe à l'écran pendant
  // le changement d'échelle (transform-origin en 0,0 → translate() en px "après" scale()).
  // lit scaleRef/panRef (pas scale/pan) pour rester correcte même appelée depuis le
  // listener natif ci-dessous, dont la closure n'est pas re-créée à chaque render.
  // A — borne le pan : le cadre (à l'échelle `s`) doit toujours garder au moins
  // PAN_MIN_VISIBLE px dans le cadre visible (outerRef), sur chaque axe. Utilise les
  // positions/tailles de LAYOUT (offsetLeft/offsetWidth — jamais affectées par le
  // transform CSS lui-même) : stables quel que soit le zoom/pan courant.
  const clampPanValue = (nextPan, s) => {
    const outer = outerRef.current, frame = frameRef.current;
    if (!outer || !frame) return nextPan;
    const outerW = outer.clientWidth, outerH = outer.clientHeight;
    const frameW = s * frame.offsetWidth, frameH = s * frame.offsetHeight;
    const staticLeft = frame.offsetLeft, staticTop = frame.offsetTop;
    const ax = PAN_MIN_VISIBLE - frameW - staticLeft, bx = outerW - PAN_MIN_VISIBLE - staticLeft;
    const ay = PAN_MIN_VISIBLE - frameH - staticTop, by = outerH - PAN_MIN_VISIBLE - staticTop;
    return {
      x: Math.min(Math.max(nextPan.x, Math.min(ax, bx)), Math.max(ax, bx)),
      y: Math.min(Math.max(nextPan.y, Math.min(ay, by)), Math.max(ay, by)),
    };
  };

  const zoomAt = (nextScale, clientX, clientY) => {
    const el = frameRef.current;
    if (!el) return;
    const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, nextScale));
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) { setScale(clamped); return; }
    const fx = (clientX - rect.left) / rect.width;
    const fy = (clientY - rect.top) / rect.height;
    const w0 = rect.width / scaleRef.current, h0 = rect.height / scaleRef.current;
    const l0 = rect.left - panRef.current.x, t0 = rect.top - panRef.current.y;
    setScale(clamped);
    setPan(clampPanValue({ x: clientX - fx * clamped * w0 - l0, y: clientY - fy * clamped * h0 - t0 }, clamped));
  };
  const zoomAtCenter = (nextScale) => {
    const el = frameRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    zoomAt(nextScale, rect.left + rect.width / 2, rect.top + rect.height / 2);
  };
  const resetZoom = () => { setScale(1); setPan({ x: 0, y: 0 }); };

  // React 18 attache les listeners "wheel" en passive par défaut (perf du scroll) : un
  // onWheel JSX ne peut PAS y faire preventDefault (échoue silencieusement + erreur
  // console) → écouteur natif { passive:false } posé une seule fois sur le cadre visible.
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const onWheelNative = (e) => {
      e.preventDefault();
      zoomAt(scaleRef.current * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP), e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', onWheelNative);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A — pan (style Photoshop) : Espace+glisser ou clic molette, quel que soit l'outil
  // actif — démarre le déplacement immédiatement (l'utilisateur a explicitement demandé
  // le pan, pas d'ambiguïté avec un clic simple à gérer ici).
  const startPan = (e) => {
    e.preventDefault();
    setPanning(true);
    const startX = e.clientX, startY = e.clientY;
    const origin = panRef.current;
    const move = (ev) => setPan(clampPanValue({ x: origin.x + (ev.clientX - startX), y: origin.y + (ev.clientY - startY) }, scaleRef.current));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setPanning(false); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  // A — mode Sélection : le clic-glissé sur le fond fait le pan PAR DÉFAUT (sans Espace),
  // comme Photoshop. Un simple clic (sans déplacement) désélectionne, comme avant — seuil
  // identique aux autres drags de ce fichier pour distinguer clic vs glissé.
  const startPanOrDeselect = (e) => {
    const startX = e.clientX, startY = e.clientY;
    const origin = panRef.current;
    let moved = false;
    const move = (ev) => {
      if (!moved && Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 4) { moved = true; setPanning(true); }
      if (moved) setPan(clampPanValue({ x: origin.x + (ev.clientX - startX), y: origin.y + (ev.clientY - startY) }, scaleRef.current));
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      setPanning(false);
      if (!moved) setSelectedId(null);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
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

  const styleZone = () => ({ fill: style.fill, fillOpacity: style.fillOpacity, stroke: style.stroke, strokeWidth: style.strokeWidth });

  // crée une ZONE (toute forme) : mêmes champs qu'une coche + géométrie + style.
  const addZone = (zone) => {
    const numero = coches.length + 1;
    const ctr = centroidOf({ kind: 'zone', zone });
    const couleur = zone.stroke || zone.fill || COLORS[coches.length % COLORS.length];
    const c = {
      id: genId('c'), kind: 'zone', zone,
      // le libellé se pose à côté du centroïde ; ancre = centroïde (cohérence).
      boite: { x: clamp01(ctr.x), y: clamp01(ctr.y - 0.02) }, ancre: { x: ctr.x, y: ctr.y },
      texte: '', couleur, numero,
    };
    setCoches((cs) => [...cs, c]);
    setSelectedId(c.id);
  };

  // choisit un outil ; nudge le style courant (pinceau/trait = sans remplissage par défaut).
  const selectTool = (t) => {
    setMode(t);
    if (t === 'brush' || t === 'line') setStyle((s) => ({ ...s, fill: null }));
    else if (t === 'rect' || t === 'ellipse' || t === 'poly') setStyle((s) => ({ ...s, fill: s.fill || DEFAULT_COLOR }));
  };

  // tracé RECTANGLE / ELLIPSE : glisser d'un coin à l'autre (même boîte englobante).
  const startBoxDraw = (e, shape) => {
    const p0 = relFromEvent(e.clientX, e.clientY);
    const boxOf = (p) => ({ shape, x: Math.min(p0.x, p.x), y: Math.min(p0.y, p.y), w: Math.abs(p.x - p0.x), h: Math.abs(p.y - p0.y) });
    setDraftBox(boxOf(p0));
    const move = (ev) => setDraftBox(boxOf(relFromEvent(ev.clientX, ev.clientY)));
    const up = (ev) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      const b = boxOf(relFromEvent(ev.clientX, ev.clientY));
      setDraftBox(null);
      if (b.w > 0.02 && b.h > 0.02) { addZone({ shape, rect: { x: b.x, y: b.y, w: b.w, h: b.h }, closed: true, ...styleZone() }); setMode('select'); }
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  // PINCEAU libre : capture le tracé du curseur (points décimés). Fermé/rempli si un
  // remplissage est actif, sinon tracé ouvert (contour/trajet). Souris + tactile/stylet.
  const startBrush = (e) => {
    const p0 = relFromEvent(e.clientX, e.clientY);
    const pts = [p0];
    setDraftPath([p0]);
    const move = (ev) => {
      const p = relFromEvent(ev.clientX, ev.clientY);
      if (dist(p, pts[pts.length - 1]) > BRUSH_MIN_DIST) { pts.push(p); setDraftPath(pts.slice()); }
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      setDraftPath(null);
      if (pts.length >= 2) { addZone({ shape: 'path', points: smoothPath(pts), closed: style.fill != null, ...styleZone() }); setMode('select'); }
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  // TRAIT : segment droit (glisser d'un point à l'autre). Extrémités éditables ensuite.
  const startLineDraw = (e) => {
    const a = relFromEvent(e.clientX, e.clientY);
    setDraftLine({ a, b: a });
    const move = (ev) => setDraftLine({ a, b: relFromEvent(ev.clientX, ev.clientY) });
    const up = (ev) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      const b = relFromEvent(ev.clientX, ev.clientY);
      setDraftLine(null);
      if (dist(a, b) > 0.02) { addZone({ shape: 'line', points: [a, b], closed: false, ...styleZone(), fill: null }); setMode('select'); }
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  // POLYGONE : un clic = un sommet ; clic près du 1er sommet (ou double-clic / Entrée) = fermer.
  const polyClick = (p) => {
    setDraftPoly((pts) => {
      const cur = pts || [];
      if (cur.length >= 3 && dist(cur[0], p) < 0.03) { finishPoly(cur); return null; }
      return [...cur, p];
    });
  };
  const finishPoly = (pts) => { if (pts && pts.length >= 3) { addZone({ shape: 'poly', points: pts, closed: true, ...styleZone() }); setMode('select'); } setDraftPoly(null); };

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
      const nz = (z0.shape === 'rect' || z0.shape === 'ellipse')
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

  // clic sur le fond : selon le mode → place une coche, trace une zone, ou pan/désélectionne.
  // Espace+glisser ou clic molette = pan quel que soit l'outil actif (ne déclenche jamais
  // un outil de dessin, même en mode Coche/Pinceau/Zone) ; en mode Sélection, le
  // clic-glissé pan par défaut (voir startPanOrDeselect).
  const onFrameDown = (e) => {
    if (e.button === 1) { startPan(e); return; }
    if (e.button !== 0) return;
    if (spaceDown) { startPan(e); return; }
    if (mode === 'select') { startPanOrDeselect(e); return; }
    const p = relFromEvent(e.clientX, e.clientY);
    if (mode === 'point') addCocheAt(p);
    else if (mode === 'rect' || mode === 'ellipse') startBoxDraw(e, mode);
    else if (mode === 'poly') polyClick(p);
    else if (mode === 'brush') startBrush(e);
    else if (mode === 'line') startLineDraw(e);
  };

  // Échap / Entrée pendant un tracé polygone : annuler / fermer.
  useEffect(() => {
    if (mode !== 'poly') return;
    const onKey = (e) => {
      if (e.key === 'Escape') { setDraftPoly(null); setMode('select'); }
      else if (e.key === 'Enter') setDraftPoly((pts) => { finishPoly(pts); return null; });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  // sortir du mode polygone en cours de tracé → nettoie le brouillon.
  useEffect(() => { if (mode !== 'poly' && draftPoly) setDraftPoly(null); /* eslint-disable-next-line */ }, [mode]);

  // B — Espace maintenu = mode pan (curseur "grab"). Ignoré si on tape dans un champ
  // (renommer une coche, coller la théorie…) pour ne pas voler la touche Espace.
  useEffect(() => {
    const isEditable = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    const onKeyDown = (e) => { if (e.code === 'Space' && !isEditable(document.activeElement)) { e.preventDefault(); setSpaceDown(true); } };
    const onKeyUp = (e) => { if (e.code === 'Space') setSpaceDown(false); };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  }, []);

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
        </div>
        <div className="seg">
          {DRAW_TOOLS.map((t) => (
            <button key={t.key} type="button" className={'seg-btn' + (mode === t.key ? ' active' : '')} onClick={() => selectTool(t.key)}><Icon name={t.icon} size={13} /> {t.label}</button>
          ))}
        </div>
        <label className="btn ghost sm" style={{ cursor: 'pointer' }}>
          <Icon name="image" size={14} /> Changer l'image
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => setImage(e.target.files[0])} />
        </label>
        <div className="seg" title="Zoom (molette, Ctrl/Cmd+molette, ou boutons)">
          <button type="button" className="seg-btn" disabled={scale <= ZOOM_MIN + 0.001} onClick={() => zoomAtCenter(scale / ZOOM_STEP)}><Icon name="minus" size={13} /></button>
          <span className="seg-btn" style={{ cursor: 'default', minWidth: 46, justifyContent: 'center' }}>{Math.round(scale * 100)}%</span>
          <button type="button" className="seg-btn" disabled={scale >= ZOOM_MAX - 0.001} onClick={() => zoomAtCenter(scale * ZOOM_STEP)}><Icon name="plus" size={13} /></button>
        </div>
        {scale > 1 && <button type="button" className="btn ghost sm" onClick={resetZoom}><Icon name="maximize" size={13} /> Ajuster</button>}
        <div style={{ flex: 1 }} />
        <button type="button" className="btn ghost sm" disabled={exporting} onClick={() => doExport('png')}><Icon name="upload" size={13} /> Export image</button>
        <button type="button" className="btn ghost sm" disabled={exporting} onClick={() => doExport('pdf')}><Icon name="filePdf" size={13} /> Export PDF</button>
      </div>
      {mode === 'point' && <div className="hint" style={{ marginBottom: 8, color: 'var(--accent)' }}><Icon name="target" size={13} /> Clique un point de l'image pour y placer une coche. Repasse en « Sélection » pour la modifier.</div>}

      {/* barre de style — style des formes À VENIR (l'outil de dessin actif) */}
      {DRAW_TOOLS.some((t) => t.key === mode) && (
        <div className="card" style={{ marginBottom: 10, padding: '9px 11px' }}>
          <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
            <span className="pill accent" style={{ height: 20 }}><Icon name={(DRAW_TOOLS.find((t) => t.key === mode) || {}).icon} size={11} /> {(DRAW_TOOLS.find((t) => t.key === mode) || {}).label}</span>
            <span className="hint" style={{ fontSize: 11 }}>{TOOL_HINT[mode]}</span>
          </div>
          <StyleControls value={style} onChange={(patch) => setStyle((s) => ({ ...s, ...patch }))} allowFill={mode !== 'line'} />
        </div>
      )}

      {/* zone image + overlay — B : image CADRÉE pour tenir entièrement (fit-to-container),
          sans scroll obligatoire. Le cadre (frameRef) épouse exactement l'image affichée,
          donc les coordonnées relatives (% de frameRef) restent alignées. */}
      <div ref={outerRef} style={{ position: 'relative', width: '100%', overflow: 'hidden', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-2)', display: 'flex', justifyContent: 'center' }}>
        <div ref={frameRef} style={{ position: 'relative', maxWidth: '100%', minWidth: 0, lineHeight: 0, transform: (scale !== 1 || pan.x || pan.y) ? `translate(${pan.x}px, ${pan.y}px) scale(${scale})` : undefined, transformOrigin: '0 0', cursor: panning ? 'grabbing' : (spaceDown || mode === 'select') ? 'grab' : (mode === 'point' || DRAW_TOOLS.some((t) => t.key === mode)) ? 'crosshair' : 'default', touchAction: 'none' }} onPointerDown={onFrameDown} onDoubleClick={() => { if (mode === 'poly') setDraftPoly((pts) => { finishPoly(pts); return null; }); }}>
          <img src={image.url} alt="schéma" draggable={false} style={{ display: 'block', width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: 'min(64vh, 600px)', userSelect: 'none' }} />

          {/* ZONES — sous les flèches/libellés */}
          <ZonesLayer coches={coches} selectedId={selectedId} mode={mode} onZonePointerDown={startZoneDrag} />

          {/* brouillon de tracé en cours (rect/ellipse/trait/pinceau/polygone) */}
          {(draftBox || draftLine || (draftPoly && draftPoly.length) || (draftPath && draftPath.length)) && (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
              {draftBox && draftBox.shape === 'rect' && <rect x={draftBox.x * 100} y={draftBox.y * 100} width={draftBox.w * 100} height={draftBox.h * 100} rx="1.2" fill="var(--accent)" fillOpacity="0.18" stroke="var(--accent)" strokeWidth="1.6" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />}
              {draftBox && draftBox.shape === 'ellipse' && <ellipse cx={(draftBox.x + draftBox.w / 2) * 100} cy={(draftBox.y + draftBox.h / 2) * 100} rx={(draftBox.w / 2) * 100} ry={(draftBox.h / 2) * 100} fill="var(--accent)" fillOpacity="0.18" stroke="var(--accent)" strokeWidth="1.6" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />}
              {draftLine && <line x1={draftLine.a.x * 100} y1={draftLine.a.y * 100} x2={draftLine.b.x * 100} y2={draftLine.b.y * 100} stroke="var(--accent)" strokeWidth={style.strokeWidth || 2} strokeDasharray="3 2" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
              {draftPath && draftPath.length > 0 && <polyline points={draftPath.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth={style.strokeWidth || 2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />}
              {draftPoly && draftPoly.length > 0 && (
                <>
                  <polyline points={draftPoly.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
                  {draftPoly.map((p, i) => <circle key={i} cx={p.x * 100} cy={p.y * 100} r="1" fill="var(--accent)" vectorEffect="non-scaling-stroke" />)}
                </>
              )}
            </svg>
          )}

          {/* flèches (px space : pas de viewBox → orient auto non déformé) — POINTS seuls.
              B — épaisseur de trait ET taille de flèche constantes à l'écran quel que
              soit le zoom : vector-effect gère le trait, markerUnits=userSpaceOnUse +
              taille divisée par `scale` gère la pointe (compensées par le scale(scale)
              du cadre ancêtre au rendu). Seule la POSITION des extrémités suit le zoom. */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
            <defs>
              {usedColors.map((col) => (
                <marker key={col} id={markerId(col)} markerWidth={8 / scale} markerHeight={8 / scale} refX="5.5" refY="3" orient="auto" markerUnits="userSpaceOnUse" viewBox="0 0 8 8">
                  <path d="M0,0 L6,3 L0,6 Z" fill={col} />
                </marker>
              ))}
            </defs>
            {coches.filter((c) => c.kind !== 'zone').map((c) => {
              const col = c.couleur || DEFAULT_COLOR;
              return <line key={c.id} x1={c.boite.x * 100 + '%'} y1={c.boite.y * 100 + '%'} x2={c.ancre.x * 100 + '%'} y2={c.ancre.y * 100 + '%'} stroke={col} strokeWidth={2.2} vectorEffect="non-scaling-stroke" markerEnd={`url(#${markerId(col)})`} />;
            })}
          </svg>

          {/* ancres (points désignés) — déplaçables indépendamment (POINTS seuls).
              B — scale(1/scale) compose avec le transform du cadre ancêtre pour annuler
              visuellement le zoom (taille écran constante) sans toucher à la POSITION,
              qui reste pilotée par left/top (%) + le transform du cadre. */}
          {coches.filter((c) => c.kind !== 'zone').map((c) => {
            const col = c.couleur || DEFAULT_COLOR;
            const sel = c.id === selectedId;
            return (
              <span key={'a' + c.id} title="Déplace la pointe de flèche"
                onPointerDown={(e) => startDrag(e, c, 'ancre')}
                style={{ position: 'absolute', left: c.ancre.x * 100 + '%', top: c.ancre.y * 100 + '%', width: sel ? 15 : 12, height: sel ? 15 : 12, marginLeft: sel ? -7.5 : -6, marginTop: sel ? -7.5 : -6, borderRadius: '50%', background: col, border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,.35)', cursor: 'grab', touchAction: 'none', transform: `scale(${1 / scale})` }} />
            );
          })}

          {/* poignées d'édition de la zone sélectionnée (coins de rect / sommets de poly) */}
          {(() => {
            const c = coches.find((x) => x.id === selectedId && x.kind === 'zone');
            if (!c || mode !== 'select') return null;
            const col = c.couleur || DEFAULT_COLOR;
            // B — poignées à taille écran constante (comme les coches) ; leur position
            // (left/top en %) suit elle la géométrie de la zone, donc le zoom.
            const handle = (x, y, onDown, key) => (
              <span key={key} onPointerDown={onDown}
                style={{ position: 'absolute', left: x * 100 + '%', top: y * 100 + '%', width: 12, height: 12, marginLeft: -6, marginTop: -6, borderRadius: '50%', background: '#fff', border: `2px solid ${col}`, boxShadow: '0 1px 3px rgba(0,0,0,.35)', cursor: 'grab', touchAction: 'none', zIndex: 6, transform: `scale(${1 / scale})` }} />
            );
            if (c.zone.shape === 'rect' || c.zone.shape === 'ellipse') {
              const r = c.zone.rect;
              return [
                handle(r.x, r.y, (e) => startRectCorner(e, c, 'nw'), 'nw'),
                handle(r.x + r.w, r.y, (e) => startRectCorner(e, c, 'ne'), 'ne'),
                handle(r.x, r.y + r.h, (e) => startRectCorner(e, c, 'sw'), 'sw'),
                handle(r.x + r.w, r.y + r.h, (e) => startRectCorner(e, c, 'se'), 'se'),
              ];
            }
            if (c.zone.shape === 'poly' || c.zone.shape === 'line') {
              return (c.zone.points || []).map((p, i) => handle(p.x, p.y, (e) => startVertexDrag(e, c, i), 'v' + i));
            }
            return null; // pinceau (path) : repositionnement global (translation) uniquement
          })()}

          {/* boîtes de libellé — déplaçables + édition inline + popover.
              B — taille écran constante (scale(1/scale) composé au translate de
              centrage) ; le popover imbriqué en hérite automatiquement (même chaîne de
              transform), donc lui aussi reste à taille constante sans traitement à part. */}
          {coches.map((c) => {
            const col = c.couleur || DEFAULT_COLOR;
            const sel = c.id === selectedId;
            return (
              <div key={'b' + c.id} onPointerDown={(e) => startDrag(e, c, 'boite')}
                style={{ position: 'absolute', left: c.boite.x * 100 + '%', top: c.boite.y * 100 + '%', transform: `translate(-50%,-50%) scale(${1 / scale})`, display: 'flex', alignItems: 'center', gap: 6, maxWidth: '46%', padding: '4px 8px', borderRadius: 8, background: 'var(--card)', border: `2px solid ${col}`, boxShadow: sel ? `0 0 0 3px color-mix(in srgb, ${col} 30%, transparent), 0 4px 12px rgba(0,0,0,.2)` : '0 2px 8px rgba(0,0,0,.18)', cursor: 'grab', touchAction: 'none', lineHeight: 1.2, zIndex: sel ? 5 : 2 }}>
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
                      {c.kind === 'zone' ? (
                        <span className="hint" style={{ flex: 1, fontSize: 11, fontWeight: 700 }}>{SHAPE_LABEL[c.zone.shape] || 'Forme'}</span>
                      ) : (
                        <div className="row" style={{ gap: 5, flex: 1 }}>
                          {COLORS.map((sc) => (
                            <button key={sc} type="button" title="Changer la couleur" onClick={() => updateCoche(c.id, { couleur: sc })}
                              style={{ width: 18, height: 18, borderRadius: '50%', background: sc, border: sc === col ? '2px solid var(--text)' : '2px solid transparent', cursor: 'pointer', flex: '0 0 auto' }} />
                          ))}
                        </div>
                      )}
                      <span style={{ width: 1, height: 18, background: 'var(--border)' }} />
                      <button type="button" className="cd-ic" title={c.kind === 'zone' ? 'Supprimer cette zone' : 'Supprimer cette coche'} onClick={() => delCoche(c.id)} style={{ color: 'var(--accent-2)' }}><Icon name="trash" size={14} /></button>
                    </div>
                    {c.kind === 'zone' && (
                      <StyleControls value={zoneStyle(c)} allowFill={c.zone.shape !== 'line'} onChange={(patch) => applyZoneStyle(c, patch)} />
                    )}
                    <div>
                      <label className="hint" style={{ display: 'block', fontSize: 11, marginBottom: 3 }}>Autres réponses acceptées <span style={{ opacity: .7 }}>(virgules)</span></label>
                      <input value={(c.reponses_acceptees || []).join(', ')}
                        placeholder="ex : nerf cubital, N. ulnaire"
                        onChange={(e) => updateCoche(c.id, { reponses_acceptees: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                        style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 7, outline: 'none', background: 'var(--bg-2)', color: 'var(--text)', font: 'inherit', fontSize: 12, fontWeight: 500, padding: '5px 7px' }} />
                    </div>
                    {/* A — coller la théorie DIRECTEMENT dans la carte (analyse locale, sans IA) */}
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                      <CocheTheorieInline coche={c} updateCoche={updateCoche} onOpenFull={setTheorieFor} />
                    </div>
                    {/* C — Valider : les modifs sont déjà enregistrées en direct ; on ferme la carte proprement */}
                    <button type="button" className="btn primary sm" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setSelectedId(null)}>
                      <Icon name="check" size={13} /> Valider
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="hint" style={{ marginTop: 10 }}>
        <Icon name="info" size={13} /> Positions en coordonnées relatives — le zoom ne désaligne rien. Molette ou Ctrl/Cmd+molette pour zoomer, <strong>Espace+glisser</strong> (ou clic molette) pour déplacer la vue. L'export image/PDF aplatit tout (archivage/impression seulement) et <strong>n'est pas réimportable en quiz</strong>.
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

/* ---- réglages de style d'une zone (remplissage + opacité + contour + épaisseur).
   Réutilisé par la barre de style (formes à venir) et le popover (forme sélectionnée).
   `fill`/`stroke` valant null = « sans ». `allowFill=false` pour le trait. ---- */
function StyleControls({ value, onChange, allowFill = true }) {
  const v = value || {};
  const fillOn = allowFill && v.fill != null;
  const strokeOn = v.stroke != null;
  const swatch = (sc, active) => ({ width: 16, height: 16, borderRadius: '50%', background: sc, border: active ? '2px solid var(--text)' : '2px solid transparent', cursor: 'pointer', flex: '0 0 auto' });
  const miniBtn = (on) => ({ fontSize: 10.5, padding: '1px 7px', borderRadius: 6, border: '1px solid var(--border)', background: on ? 'var(--accent)' : 'transparent', color: on ? '#fff' : 'var(--text-3)', cursor: 'pointer' });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {allowFill && (
        <div>
          <div className="row" style={{ gap: 5, alignItems: 'center', marginBottom: 5, flexWrap: 'wrap' }}>
            <span className="hint" style={{ fontSize: 10.5, fontWeight: 700, width: 52 }}>Remplir</span>
            {COLORS.map((sc) => <button key={sc} type="button" title="Couleur de remplissage" onClick={() => onChange({ fill: sc })} style={swatch(sc, v.fill === sc)} />)}
            <button type="button" style={miniBtn(fillOn)} onClick={() => onChange({ fill: fillOn ? null : DEFAULT_COLOR })}>{fillOn ? 'oui' : 'sans'}</button>
          </div>
          {fillOn && (
            <div className="row" style={{ gap: 6, alignItems: 'center' }} title="Opacité du remplissage">
              <Icon name="drop" size={12} />
              <input type="range" min="5" max="60" value={Math.round((v.fillOpacity ?? DEFAULT_ZONE_OPACITY) * 100)} onChange={(e) => onChange({ fillOpacity: Number(e.target.value) / 100 })} style={{ flex: 1 }} />
              <span className="hint" style={{ fontSize: 10, width: 30, textAlign: 'right' }}>{Math.round((v.fillOpacity ?? DEFAULT_ZONE_OPACITY) * 100)}%</span>
            </div>
          )}
        </div>
      )}
      <div>
        <div className="row" style={{ gap: 5, alignItems: 'center', marginBottom: 5, flexWrap: 'wrap' }}>
          <span className="hint" style={{ fontSize: 10.5, fontWeight: 700, width: 52 }}>Contour</span>
          {COLORS.map((sc) => <button key={sc} type="button" title="Couleur du contour" onClick={() => onChange({ stroke: sc })} style={swatch(sc, v.stroke === sc)} />)}
          <button type="button" style={miniBtn(strokeOn)} onClick={() => onChange({ stroke: strokeOn ? null : DEFAULT_COLOR })}>{strokeOn ? 'oui' : 'sans'}</button>
        </div>
        <div className="row" style={{ gap: 6, alignItems: 'center' }} title="Épaisseur du contour / pinceau">
          <span className="hint" style={{ fontSize: 10 }}>épaisseur</span>
          <input type="range" min="1" max="10" step="0.5" value={v.strokeWidth ?? DEFAULT_STROKE_WIDTH} onChange={(e) => onChange({ strokeWidth: Number(e.target.value) })} style={{ flex: 1 }} />
          <span className="hint" style={{ fontSize: 10, width: 22, textAlign: 'right' }}>{v.strokeWidth ?? DEFAULT_STROKE_WIDTH}</span>
        </div>
      </div>
    </div>
  );
}

/* ---- A : THÉORIE INLINE dans la carte de la coche — coller un texte + « Analyser »
   (détection du type + extraction des champs, 100 % local, sans IA) directement dans
   le popover, en plus du nom. « Détailler » ouvre la modale complète pour corriger
   finement. La théorie enregistrée se comporte ensuite comme d'habitude (quiz/QCM). ---- */
function CocheTheorieInline({ coche, updateCoche, onOpenFull }) {
  const [raw, setRaw] = useState('');
  const nb = coche.champs ? Object.values(coche.champs).filter((v) => (v || '').trim()).length : 0;
  const typeLabel = coche.type && ANAT_TYPES[coche.type] ? ANAT_TYPES[coche.type].label : coche.type;

  const analyse = () => {
    if (!raw.trim()) return;
    const t = detectType(raw);
    const r = parseStructure(raw, t);
    updateCoche(coche.id, { type: t, champs: r.champs });
    setRaw('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label className="hint" style={{ display: 'block', fontSize: 11, fontWeight: 700 }}>
        Théorie <span style={{ opacity: .7, fontWeight: 500 }}>(optionnel — colle le texte)</span>
      </label>
      {nb > 0 && (
        <div className="hint" style={{ fontSize: 11, color: 'var(--accent)', margin: 0 }}>
          <Icon name="check" size={11} /> {typeLabel} · {nb} champ{nb > 1 ? 's' : ''} enregistré{nb > 1 ? 's' : ''}
        </div>
      )}
      <textarea value={raw} onChange={(e) => setRaw(e.target.value)} onPointerDown={(e) => e.stopPropagation()}
        placeholder={'Colle la théorie (ex : « Origine : … Insertion : … »). Type et champs détectés automatiquement, sans IA.'}
        style={{ width: '100%', minHeight: 54, resize: 'vertical', border: '1px solid var(--border)', borderRadius: 7, outline: 'none', background: 'var(--bg-2)', color: 'var(--text)', font: 'inherit', fontSize: 12, padding: '6px 7px' }} />
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn primary sm" style={{ flex: 1, justifyContent: 'center' }} onClick={analyse} disabled={!raw.trim()}>
          <Icon name="sparkle" size={12} /> Analyser
        </button>
        <button type="button" className={'btn sm' + (nb ? '' : ' ghost')} style={{ flex: 1, justifyContent: 'center' }} onClick={() => onOpenFull(coche.id)}>
          <Icon name="list" size={12} /> {nb > 0 ? 'Détailler / corriger' : 'Éditer en détail'}
        </button>
      </div>
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
  const [aide] = useVueAide();

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
                <span style={{ fontSize: 12.5, fontWeight: 700 }}>{i + 1}. {vueLabel(v.vue, false)}</span>
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
          <div className="row spread" style={{ marginBottom: 4, alignItems: 'center' }}>
            <label style={{ margin: 0 }}>Vue de cette image</label>
            <VueAideToggle />
          </div>
          <div className="imp-chips">
            {SCHEMA_VUES.filter((s) => s.key !== 'non_precisee').map((s) => (
              <button key={s.key} type="button" className={'imp-chip' + (active.vue === s.key ? ' on' : '')} onClick={() => setVue(s.key)}>{aide ? vueLabel(s.key, true) : s.med}</button>
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
  const [aide] = useVueAide();
  return (
    <div className="day-pop-scrim" onClick={onClose}>
      <div className="day-pop" style={{ width: 'min(460px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="day-pop-head"><div className="row spread"><div className="serif" style={{ fontSize: 17 }}>Quelle vue est-ce ?</div><button className="icon-btn sm" onClick={onClose}><Icon name="x" size={16} /></button></div></div>
        <div className="day-pop-body">
          <div className="row spread" style={{ marginBottom: 10, alignItems: 'center', gap: 10 }}>
            <div className="hint" style={{ margin: 0 }}>Choisis l'angle de cette vue (terme médical).</div>
            <VueAideToggle />
          </div>
          <div className="imp-chips">
            {SCHEMA_VUES.filter((s) => s.key !== 'non_precisee').map((s) => (
              <button key={s.key} type="button" className="imp-chip" onClick={() => onPick(s.key)}>{aide ? vueLabel(s.key, true) : s.med}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* switch « Aide » global : bascule l'affichage terme médical seul ↔ + terme
   courant/définition. Utilisé à l'import ET en révision (état partagé mémorisé). */
export function VueAideToggle({ compact = false }) {
  const [aide, setAide] = useVueAide();
  return (
    <button type="button" onClick={() => setAide(!aide)} title="Aide au vocabulaire des vues (terme courant + définition)"
      className="row" style={{ gap: 6, alignItems: 'center', padding: '3px 8px', borderRadius: 999, cursor: 'pointer', border: '1px solid var(--border)', background: aide ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : 'transparent', color: aide ? 'var(--accent)' : 'var(--text-3)', fontSize: 11.5, fontWeight: 700 }}>
      <span style={{ width: 26, height: 15, borderRadius: 999, background: aide ? 'var(--accent)' : 'var(--border)', position: 'relative', flex: '0 0 auto', transition: 'background .15s' }}>
        <span style={{ position: 'absolute', top: 2, left: aide ? 13 : 2, width: 11, height: 11, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
      </span>
      {!compact && <span>Aide</span>}
    </button>
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
