/* ============================================================
   MedRevise — FLÈCHES SOUPLES OU DURES (20/10 soir, docs/compte-rendu-pdfreader-v4.md).

   Une flèche (connecteur d'une boîte, ou flèche libre = forme « ligne », « flèche », « double ») peut porter
   des champs FACULTATIFS, tous absents sur une flèche d'avant (qui garde exactement son ancien rendu) :
     type      'dure' (segments droits, coudes) | 'souple' (courbe qui passe par les points) — défaut : dure
     points    [{ x, y }] points de contrôle INTERMÉDIAIRES, en fractions de la page (repère du PDF, comme
               tout le reste) ; autant qu'on veut ; ordre = du départ vers la pointe
     pointes   { debut, fin } : 'aucune' | 'ouverte' | 'pleine' — défaut du connecteur : aucune → pleine
     trait     'continu' | 'tirets' | 'pointilles'
     epaisseur facteur de l'épaisseur de base (1 = celle d'avant ; 0,5 à 3)
     couleur   id de palette ou hex — défaut : la couleur foncée de la boîte (connecteur) / de la forme
   Tout le tracé se calcule en pixels, à partir de la liste complète des sommets [départ, ...points, pointe] ;
   le même chemin SVG (M / L / C / Z) sert à l'écran et à l'export PDF.
   ============================================================ */
export const POINTES = ['aucune', 'ouverte', 'pleine'];
export const TRAITS = ['continu', 'tirets', 'pointilles'];
export const EPAISSEURS = [0.5, 1, 1.5, 2, 3];
const CHAMPS = ['type', 'points', 'pointes', 'trait', 'epaisseur', 'couleur'];

/** la flèche a-t-elle un style à elle (sinon : rendu d'avant, inchangé) ? */
export const aStyle = (f) => !!f && CHAMPS.some((k) => f[k] != null && !(k === 'points' && !f.points.length));
/** style complet, valeurs par défaut comprises */
export function styleFleche(f, defauts = {}) {
  const d = { type: 'dure', pointes: { debut: 'aucune', fin: 'pleine' }, trait: 'continu', epaisseur: 1, couleur: null, ...defauts };
  return {
    type: f && f.type === 'souple' ? 'souple' : d.type,
    points: (f && Array.isArray(f.points) ? f.points : []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)),
    pointes: { ...d.pointes, ...((f && f.pointes) || {}) },
    trait: f && TRAITS.includes(f.trait) ? f.trait : d.trait,
    epaisseur: f && Number.isFinite(f.epaisseur) ? f.epaisseur : d.epaisseur,
    couleur: (f && f.couleur) || d.couleur,
  };
}
const n = (v) => (Math.round(v * 100) / 100).toString();
const P = (p) => `${n(p.x)} ${n(p.y)}`;

/* courbe SOUPLE : Catmull-Rom (passe par chaque point) convertie en Bézier cubiques */
function segmentsSouples(pts) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    out.push({ c1: { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }, c2: { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }, a: p1, b: p2 });
  }
  return out;
}
/** pointe en `b`, dans la direction `dir` (vecteur), taille `t` : pleine (triangle) ou ouverte (chevron) */
function tete(b, dir, t, genre) {
  const L = Math.hypot(dir.x, dir.y) || 1;
  const ux = dir.x / L, uy = dir.y / L, bx = b.x - ux * t, by = b.y - uy * t, l = t * 0.55;
  const g = { x: bx - uy * l, y: by + ux * l }, d = { x: bx + uy * l, y: by - ux * l };
  return genre === 'pleine' ? { d: `M${P(b)} L${P(g)} L${P(d)} Z`, pleine: true } : { d: `M${P(g)} L${P(b)} L${P(d)}`, pleine: false };
}
/**
 * Chemin d'une flèche passant par `pts` (pixels, y vers le bas) : { d, tetes: [{ d, pleine }], dash }.
 * `largeur` : épaisseur du trait en px ; la pointe pleine prend la place du bout du trait (bout net).
 */
export function cheminFleche(pts, style, largeur) {
  const s = style;
  if (!pts || pts.length < 2) return { d: '', tetes: [], dash: null };
  const t = Math.max(8, largeur * 4.2);
  const souple = s.type === 'souple' && pts.length > 2;
  const segs = souple ? segmentsSouples(pts) : null;
  // directions aux deux bouts (tangentes)
  const dirFin = souple ? { x: pts[pts.length - 1].x - segs[segs.length - 1].c2.x, y: pts[pts.length - 1].y - segs[segs.length - 1].c2.y } : { x: pts[pts.length - 1].x - pts[pts.length - 2].x, y: pts[pts.length - 1].y - pts[pts.length - 2].y };
  const dirDebut = souple ? { x: pts[0].x - segs[0].c1.x, y: pts[0].y - segs[0].c1.y } : { x: pts[0].x - pts[1].x, y: pts[0].y - pts[1].y };
  const recul = (dir, genre) => { if (genre !== 'pleine') return { x: 0, y: 0 }; const L = Math.hypot(dir.x, dir.y) || 1; return { x: (dir.x / L) * t * 0.8, y: (dir.y / L) * t * 0.8 }; };
  const rf = recul(dirFin, s.pointes.fin), rd = recul(dirDebut, s.pointes.debut);
  const q = pts.map((p) => ({ ...p }));
  q[q.length - 1] = { x: q[q.length - 1].x - rf.x, y: q[q.length - 1].y - rf.y };
  q[0] = { x: q[0].x - rd.x, y: q[0].y - rd.y };
  let d;
  if (souple) {
    const sg = segmentsSouples(pts);
    d = `M${P(q[0])}` + sg.map((g, i) => ` C${P(g.c1)} ${P(g.c2)} ${P(i === sg.length - 1 ? q[q.length - 1] : g.b)}`).join('');
  } else d = `M${P(q[0])}` + q.slice(1).map((p) => ` L${P(p)}`).join('');
  const tetes = [];
  if (s.pointes.fin !== 'aucune') tetes.push(tete(pts[pts.length - 1], dirFin, t, s.pointes.fin));
  if (s.pointes.debut !== 'aucune') tetes.push(tete(pts[0], dirDebut, t, s.pointes.debut));
  const dash = s.trait === 'tirets' ? `${n(largeur * 4)} ${n(largeur * 3)}` : s.trait === 'pointilles' ? `0.01 ${n(largeur * 2.4)}` : null;
  return { d, tetes, dash };
}

/** où insérer un point cliqué en `c` (même repère que `pts`) : l'index dans `points` (intermédiaires) */
export function indexInsertion(pts, c) {
  let best = 0, dBest = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / L2));
    const d = Math.hypot(a.x + dx * t - c.x, a.y + dy * t - c.y);
    if (d < dBest) { dBest = d; best = i; }
  }
  return best; // le point s'insère après le sommet `best`, soit à l'index `best` de la liste des intermédiaires
}
/** cycle d'une valeur dans une liste */
export const suivant = (liste, v) => liste[(Math.max(0, liste.indexOf(v)) + 1) % liste.length];
