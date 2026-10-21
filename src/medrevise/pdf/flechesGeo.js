/* ============================================================
   MedRevise — LA FLÈCHE (20/10 soir ; un seul modèle depuis le 21/10, docs/compte-rendu-pdfreader-reparation.md).

   Toutes les flèches — connecteurs d'une boîte ET flèches de l'outil Formes (ligne, flèche, double flèche) —
   sont une liste de SOMMETS : départ, points de contrôle, arrivée. Les points de contrôle sont stockés en
   FRACTIONS DE LA PAGE (repère du PDF, comme tout le reste) ; le départ et l'arrivée viennent de l'annotation
   (bord de la boîte → cible ; extrémités du cadre d'une forme). Deux types :
     droite  segments droits entre les sommets (stocké 'dure', valeur d'avant)
     courbe  spline de Catmull-Rom qui passe PAR chaque sommet (stocké 'souple') — pas de poignées séparées
   Champs FACULTATIFS (tous absents sur une flèche d'avant le 20/10, qui garde exactement son rendu) :
     type 'dure' | 'souple' · points [{ x, y }] · pointes { debut, fin } ('aucune' | 'ouverte' | 'pleine')
     trait 'continu' | 'tirets' | 'pointilles' · epaisseur (facteur 0,5 à 3) · couleur (id ou hex)
     geo   2 = proportions « classiques » de la pointe (celles des flèches d'avant le 20/10) ; absent sur une
           flèche stylée du 20/10, qui garde ses proportions d'alors
   Un seul tracé (`cheminFleche`) pour l'écran, l'aperçu et l'export PDF ; un seul calcul des sommets
   (`sommetsConnecteur`, `sommetsForme`) ; un seul test d'insertion d'un point (`indexInsertion`).
   ============================================================ */
export const POINTES = ['aucune', 'ouverte', 'pleine'];
export const TRAITS = ['continu', 'tirets', 'pointilles'];
export const EPAISSEURS = [0.5, 1, 1.5, 2, 3];
export const GEO_CLASSIQUE = 2;
const CHAMPS = ['type', 'points', 'pointes', 'trait', 'epaisseur', 'couleur'];

/** la flèche a-t-elle un style à elle ? */
export const aStyle = (f) => !!f && CHAMPS.some((k) => f[k] != null && !(k === 'points' && !f.points.length));
/** proportions de la pointe : celles des flèches d'avant (« classique ») sauf pour une flèche stylée du 20/10 */
export const proportionsV4 = (f) => aStyle(f) && f.geo !== GEO_CLASSIQUE;
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

/* courbe : Catmull-Rom (passe par chaque sommet) convertie en Bézier cubiques */
function segmentsSouples(pts) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    out.push({ c1: { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }, c2: { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }, a: p1, b: p2 });
  }
  return out;
}
/** pointe en `b`, dans la direction `dir`, longueur `t`, demi-largeur `demi × t` : pleine (triangle) ou ouverte */
function tete(b, dir, t, genre, demi) {
  const L = Math.hypot(dir.x, dir.y) || 1;
  const ux = dir.x / L, uy = dir.y / L, bx = b.x - ux * t, by = b.y - uy * t, l = t * demi;
  const g = { x: bx - uy * l, y: by + ux * l }, d = { x: bx + uy * l, y: by - ux * l };
  return genre === 'pleine' ? { d: `M${P(b)} L${P(g)} L${P(d)} Z`, pleine: true } : { d: `M${P(g)} L${P(b)} L${P(d)}`, pleine: false };
}

/**
 * Proportions de la pointe. `contexte` : 'connecteur' (flèche d'une boîte, `k` = échelle de la boîte) ou 'forme'.
 *   t      longueur de la pointe (px) · demi  demi-largeur (× t)
 *   avance la pointe dépasse le dernier sommet de `avance × t` · recul  le trait s'arrête `recul × t` avant la pointe
 *   contour épaisseur du liseré d'une pointe pleine (0 : aucun)
 */
export function geoPointe(f, largeur, { contexte = 'connecteur', k = 1 } = {}) {
  if (contexte === 'forme') return { t: Math.max(aStyle(f) ? 8 : 9, largeur * 4.2), demi: 0.55, avance: 0, recul: 0.8, contour: Math.min(largeur, 2) };
  if (proportionsV4(f)) return { t: Math.max(8, largeur * 4.2), demi: 0.55, avance: 0, recul: 0.8, contour: Math.min(largeur, 1.5 * k) };
  // classique : la pointe des flèches d'avant (marqueur de 9 × k, base à 7,65 × k du bout du trait)
  const ep = f && Number.isFinite(f.epaisseur) ? f.epaisseur : 1;
  // `marqueur` : l'écran pose cette pointe en marqueur SVG, comme avant (même géométrie, même rendu au pixel)
  return { t: 9 * k * Math.max(1, ep), demi: 0.5, avance: 0.15, recul: 0.15, contour: 0, marqueur: true };
}

/**
 * Chemin d'une flèche passant par `pts` (pixels, y vers le bas) : { d, tetes: [{ d, pleine }], dash, contour }.
 * `largeur` : épaisseur du trait (px) ; `geo` : proportions de la pointe (geoPointe).
 */
export function cheminFleche(pts, style, largeur, geo = null) {
  const s = style;
  const G = geo || { t: Math.max(8, largeur * 4.2), demi: 0.55, avance: 0, recul: 0.8, contour: largeur };
  if (!pts || pts.length < 2) return { d: '', tetes: [], dash: null, contour: G.contour };
  const t = G.t;
  const souple = s.type === 'souple' && pts.length > 2;
  const segs = souple ? segmentsSouples(pts) : null;
  // directions aux deux bouts (tangentes)
  const dirFin = souple ? { x: pts[pts.length - 1].x - segs[segs.length - 1].c2.x, y: pts[pts.length - 1].y - segs[segs.length - 1].c2.y } : { x: pts[pts.length - 1].x - pts[pts.length - 2].x, y: pts[pts.length - 1].y - pts[pts.length - 2].y };
  const dirDebut = souple ? { x: pts[0].x - segs[0].c1.x, y: pts[0].y - segs[0].c1.y } : { x: pts[0].x - pts[1].x, y: pts[0].y - pts[1].y };
  const unite = (dir) => { const L = Math.hypot(dir.x, dir.y) || 1; return { x: dir.x / L, y: dir.y / L }; };
  const uf = unite(dirFin), ud = unite(dirDebut);
  // pointe pleine : le trait s'arrête sous la pointe (bout net) ; la pointe peut dépasser le dernier sommet
  const pointeFin = { x: pts[pts.length - 1].x + uf.x * t * G.avance, y: pts[pts.length - 1].y + uf.y * t * G.avance };
  const pointeDebut = { x: pts[0].x + ud.x * t * G.avance, y: pts[0].y + ud.y * t * G.avance };
  const recul = (u, genre, pointe, sommet) => (genre !== 'pleine' ? sommet : { x: pointe.x - u.x * t * G.recul, y: pointe.y - u.y * t * G.recul });
  const q = pts.map((p) => ({ ...p }));
  q[q.length - 1] = recul(uf, s.pointes.fin, pointeFin, q[q.length - 1]);
  q[0] = recul(ud, s.pointes.debut, pointeDebut, q[0]);
  let d;
  if (souple) d = `M${P(q[0])}` + segs.map((g, i) => ` C${P(g.c1)} ${P(g.c2)} ${P(i === segs.length - 1 ? q[q.length - 1] : g.b)}`).join('');
  else d = `M${P(q[0])}` + q.slice(1).map((p) => ` L${P(p)}`).join('');
  const tetes = [];
  if (s.pointes.fin !== 'aucune') tetes.push(tete(pointeFin, dirFin, t, s.pointes.fin, G.demi));
  if (s.pointes.debut !== 'aucune') tetes.push(tete(pointeDebut, dirDebut, t, s.pointes.debut, G.demi));
  const dash = s.trait === 'tirets' ? `${n(largeur * 4)} ${n(largeur * 3)}` : s.trait === 'pointilles' ? `0.01 ${n(largeur * 2.4)}` : null;
  // un seul segment droit : ses deux bouts exacts (l'écran le trace en <line>, comme les flèches d'avant — même rendu au pixel)
  const segment = !souple && q.length === 2 ? [q[0], q[1]] : null;
  return { d, tetes, dash, contour: G.contour, segment, marqueur: !!G.marqueur, t };
}

/* ---------- SOMMETS ---------- */
/** point du bord du rectangle `cadre` ({ x, y, w, h }, px) dans la direction de `vers` ; null si `vers` est dedans */
export function bordVers(cadre, vers) {
  const cx = cadre.x + cadre.w / 2, cy = cadre.y + cadre.h / 2, dx = vers.x - cx, dy = vers.y - cy;
  if (vers.x >= cadre.x && vers.x <= cadre.x + cadre.w && vers.y >= cadre.y && vers.y <= cadre.y + cadre.h) return null;
  const t = Math.min(dx ? (cadre.w / 2) / Math.abs(dx) : Infinity, dy ? (cadre.h / 2) / Math.abs(dy) : Infinity);
  return { x: cx + dx * t, y: cy + dy * t };
}
/**
 * Sommets d'un CONNECTEUR de boîte, en pixels de page (`W` × `H`) : bord de la boîte (vers le 1er point de
 * contrôle, ou la cible), points de contrôle, puis bout du trait à `7 × k` px de la cible (son rond).
 * `points` remplace ceux du connecteur (glisser en cours). null si la flèche n'a pas la place d'exister.
 */
export function sommetsConnecteur(cadre, c, W, H, k = 1, points = null) {
  const cible = { x: c.x * W, y: c.y * H };
  const inter = (points || styleFleche(c).points).map((p) => ({ x: p.x * W, y: p.y * H }));
  const debut = bordVers(cadre, inter[0] || cible);
  if (!debut) return null;
  const prec = inter[inter.length - 1] || debut;
  const L = Math.hypot(cible.x - prec.x, cible.y - prec.y);
  if (!inter.length && L < 14 * k) return null; // trop courte (règle d'avant)
  const l = L || 1;
  return [debut, ...inter, { x: cible.x - ((cible.x - prec.x) * 7 * k) / l, y: cible.y - ((cible.y - prec.y) * 7 * k) / l }];
}
/** sommets d'une flèche de l'outil Formes, en pixels du CADRE de la forme (origine en haut à gauche du cadre) */
export function sommetsForme(f, W, H, points = null) {
  const w = f.width * W, h = f.height * H;
  const a = { x: f.fx ? w : 0, y: f.fy ? h : 0 }, b = { x: f.fx ? 0 : w, y: f.fy ? 0 : h };
  const inter = (points || ((f.fleche && f.fleche.points) || [])).map((p) => ({ x: (p.x - f.x) * W, y: (p.y - f.y) * H }));
  return [a, ...inter, b];
}
/** pointes par défaut d'une forme trait */
export const pointesForme = (type) => (type === 'ligne' ? { debut: 'aucune', fin: 'aucune' } : type === 'double' ? { debut: 'pleine', fin: 'pleine' } : { debut: 'aucune', fin: 'pleine' });

/** où insérer un point cliqué en `c` (même repère que `pts`) : son index dans la liste des points de contrôle.
    Une courbe est échantillonnée (le point s'insère dans le segment de COURBE le plus proche, pas de corde). */
export function indexInsertion(pts, c, souple = false) {
  let best = 0, dBest = Infinity;
  const segs = souple && pts.length > 2 ? segmentsSouples(pts) : null;
  for (let i = 0; i < pts.length - 1; i++) {
    if (segs) {
      const { a, c1, c2, b } = segs[i];
      for (let k = 0; k <= 24; k++) {
        const u = k / 24, v = 1 - u;
        const x = v * v * v * a.x + 3 * v * v * u * c1.x + 3 * v * u * u * c2.x + u * u * u * b.x;
        const y = v * v * v * a.y + 3 * v * v * u * c1.y + 3 * v * u * u * c2.y + u * u * u * b.y;
        const d = Math.hypot(x - c.x, y - c.y);
        if (d < dBest) { dBest = d; best = i; }
      }
      continue;
    }
    const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / L2));
    const d = Math.hypot(a.x + dx * t - c.x, a.y + dy * t - c.y);
    if (d < dBest) { dBest = d; best = i; }
  }
  return best; // le point s'insère après le sommet `best`, soit à l'index `best` de la liste des points de contrôle
}
/** cycle d'une valeur dans une liste */
export const suivant = (liste, v) => liste[(Math.max(0, liste.indexOf(v)) + 1) % liste.length];
