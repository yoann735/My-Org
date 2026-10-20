/* ============================================================
   MedRevise — CRAYON (refait le 20/10 soir, docs/compte-rendu-pdfreader-v4.md).

   Chaîne d'un trait, du pointeur à l'enregistrement :
     1. CAPTURE à pleine fréquence : tous les événements coalescés du pointeur (souris, stylet, doigt) ;
     2. STABILISATION en direct, réglable de 0 à 100 % (défaut 30 %) : chaque point ne rejoint qu'une partie
        du chemin vers le pointeur (la main tremble, le trait non) — 0 % = trait brut ;
     3. APERÇU sur un canvas posé sur la page, dans l'événement même (aucun retard visible) ;
     4. au relâchement : lissage final proportionnel à la stabilisation (Chaikin), simplification
        sous-pixel, puis enregistrement VECTORIEL — liste de points en fractions de page, épaisseur en
        fraction de la hauteur de page (donc constante en unités PDF, quel que soit le zoom), couleur ;
     5. RENDU en courbes Catmull-Rom → Bézier (passent par les points) ; extrémités arrondies.
   Un trait d'avant (sans `rendu`) garde son ancien tracé (courbes par les milieux).
   Gestes : MAINTENIR immobile à la fin d'un trait le REDRESSE (ligne, cercle / ellipse, rectangle, triangle,
   flèche) ; GRIFFONNER (zigzag serré) efface ce qu'on recouvre, si l'option est activée ; LASSO : sélection.
   ============================================================ */
const lireLS = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
const ecrireLS = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (e) { /* stockage bloqué */ } };
export const reglagesCrayonV4 = {
  stabilisation: () => Math.max(0, Math.min(1, Number(lireLS('medrevise.stabilisation', '0.3')))),
  setStabilisation: (v) => ecrireLS('medrevise.stabilisation', Math.max(0, Math.min(1, v))),
  surligneurDroit: () => lireLS('medrevise.surligneurDroit', '1') !== '0',
  setSurligneurDroit: (v) => ecrireLS('medrevise.surligneurDroit', v ? '1' : '0'),
  griffonner: () => lireLS('medrevise.griffonner', '0') === '1',
  setGriffonner: (v) => ecrireLS('medrevise.griffonner', v ? '1' : '0'),
};
/** 3 épaisseurs prédéfinies (fraction de la hauteur de page) — le curseur « Taille » reste pour le réglage fin */
export const EPAISSEURS_CRAYON = {
  dessin: [{ id: 'fin', label: 'Fin', v: 0.0024 }, { id: 'moyen', label: 'Moyen', v: 0.0042 }, { id: 'epais', label: 'Épais', v: 0.0075 }],
  surligneur: [{ id: 'fin', label: 'Fin', v: 0.011 }, { id: 'moyen', label: 'Moyen', v: 0.017 }, { id: 'epais', label: 'Épais', v: 0.026 }],
};

/** force de la stabilisation en direct (0 → brut, 1 → très lissé) */
export const forceStabilisation = (s) => 0.82 * Math.max(0, Math.min(1, s));

/** lissage final de Chaikin, `iterations` passes (les extrémités restent en place) */
export function chaikin(points, iterations = 1) {
  let p = points;
  for (let k = 0; k < iterations && p.length > 2; k++) {
    const q = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}
export const passesLissage = (s) => (s <= 0.05 ? 0 : s < 0.5 ? 1 : 2);

/** chemin SVG Catmull-Rom (passe par chaque point) dans le repère 0–100 de la page (viewBox 0 0 100 100) */
export function cheminCatmull(points, echelle = 100) {
  const p = (points || []).map(([x, y]) => [x * echelle, y * echelle]);
  const f = (v) => v.toFixed(3);
  if (!p.length) return '';
  if (p.length === 1) return `M${f(p[0][0])} ${f(p[0][1])} l0.001 0`;
  let d = `M${f(p[0][0])} ${f(p[0][1])}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}
/** chemin en segments droits (formes redressées) */
export function cheminDroit(points, echelle = 100) {
  const f = (v) => (v * echelle).toFixed(3);
  return (points || []).map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join(' ');
}
/** le chemin d'un trait enregistré, selon son rendu (`droit`, `cr` ou ancien) — `ancien` = cheminLisse */
export const cheminTrait = (t, ancien, echelle = 100) => (t.rendu === 'droit' ? cheminDroit(t.points, echelle) : t.rendu === 'cr' ? cheminCatmull(t.points, echelle) : ancien(t.points));

/* ---------- REDRESSER : reconnaissance de forme (pixels de page, `ratio` = largeur / hauteur) ---------- */
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function rdp(p, eps) {
  if (p.length < 3) return p;
  const a = p[0], b = p[p.length - 1];
  let idx = -1, max = 0;
  const L = dist(a, b);
  for (let i = 1; i < p.length - 1; i++) {
    // segment dégénéré (départ = arrivée) : distance au point de départ
    const d = L < 1e-9 ? dist(p[i], a) : Math.abs((b[1] - a[1]) * p[i][0] - (b[0] - a[0]) * p[i][1] + b[0] * a[1] - b[1] * a[0]) / L;
    if (d > max) { max = d; idx = i; }
  }
  if (max <= eps) return [a, b];
  return [...rdp(p.slice(0, idx + 1), eps).slice(0, -1), ...rdp(p.slice(idx), eps)];
}
/**
 * Forme reconnue dans un trait (points en fractions de page) : { type, points, rendu } ou null.
 * Types : 'ligne', 'fleche', 'cercle', 'rectangle', 'triangle'.
 */
export function reconnaitreForme(points, ratio = 1) {
  if (!points || points.length < 4) return null;
  const P = points.map(([x, y]) => [x * ratio, y]); // repère isotrope
  const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const diag = Math.hypot(x1 - x0, y1 - y0) || 1e-9;
  let longueur = 0; for (let i = 1; i < P.length; i++) longueur += dist(P[i - 1], P[i]);
  const retour = (pts, type, rendu = 'droit') => ({ type, rendu, points: pts.map(([x, y]) => [x / ratio, y]) });
  const a = P[0], z = P[P.length - 1];
  const ferme = dist(a, z) < Math.max(diag * 0.22, longueur * 0.08);
  if (!ferme) {
    // LIGNE : tout le tracé reste près du segment départ → arrivée
    const s = rdp(P, diag * 0.06);
    if (s.length === 2) return retour([a, z], 'ligne');
    // FLÈCHE : une longue hampe puis une pointe (deux petits traits au bout)
    const s2 = rdp(P, diag * 0.05);
    const segs = s2.slice(1).map((p, i) => dist(s2[i], p));
    const total = segs.reduce((u, v) => u + v, 0);
    const iMax = segs.indexOf(Math.max(...segs));
    if (s2.length >= 3 && s2.length <= 6 && iMax === 0 && segs[0] > total * 0.55) {
      const bout = s2[1], dep = s2[0];
      const L = dist(dep, bout), ux = (bout[0] - dep[0]) / L, uy = (bout[1] - dep[1]) / L, t = Math.min(L * 0.22, diag * 0.25);
      const g = [bout[0] - ux * t - uy * t * 0.6, bout[1] - uy * t + ux * t * 0.6], d = [bout[0] - ux * t + uy * t * 0.6, bout[1] - uy * t - ux * t * 0.6];
      return retour([dep, bout, g, bout, d], 'fleche');
    }
    return null;
  }
  // FERMÉ : cercle (rayon régulier autour du centre), sinon polygone simplifié
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2 || 1e-9, ry = (y1 - y0) / 2 || 1e-9;
  const r = P.map((p) => Math.hypot((p[0] - cx) / rx, (p[1] - cy) / ry));
  const moy = r.reduce((u, v) => u + v, 0) / r.length, ecart = Math.sqrt(r.reduce((u, v) => u + (v - moy) ** 2, 0) / r.length);
  // contour fermé : coupé au point le plus éloigné du départ, chaque moitié simplifiée
  const loin = P.reduce((k, p, i) => (dist(p, a) > dist(P[k], a) ? i : k), 0);
  const poly = [...rdp(P.slice(0, loin + 1), diag * 0.09).slice(0, -1), ...rdp([...P.slice(loin), a], diag * 0.09)];
  const coins = poly.slice(0, -1); // sans le point de fermeture
  const coinsUtiles = coins.filter((p, i) => i === 0 || dist(p, coins[i - 1]) > diag * 0.12);
  if (coinsUtiles.length === 3) return retour([...coinsUtiles, coinsUtiles[0]], 'triangle');
  if (coinsUtiles.length === 4 || coinsUtiles.length === 5) {
    if (ecart / moy > 0.08 || coinsUtiles.length === 4) return retour([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]], 'rectangle');
  }
  if (ecart / moy < 0.16) {
    const n = 48, pts = Array.from({ length: n + 1 }, (_, i) => [cx + rx * Math.cos((2 * Math.PI * i) / n), cy + ry * Math.sin((2 * Math.PI * i) / n)]);
    return retour(pts, 'cercle', 'cr');
  }
  return null;
}

/** GRIFFONNAGE : beaucoup d'allers-retours serrés (≥ 5 changements de sens) et un tracé bien plus long que sa zone */
export function estGriffonnage(points, ratio = 1) {
  if (!points || points.length < 12) return false;
  const P = points.map(([x, y]) => [x * ratio, y]);
  let longueur = 0; for (let i = 1; i < P.length; i++) longueur += dist(P[i - 1], P[i]);
  const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1e-9;
  const s = rdp(P, diag * 0.06);
  let inversions = 0;
  for (let i = 2; i < s.length; i++) {
    const u = [s[i - 1][0] - s[i - 2][0], s[i - 1][1] - s[i - 2][1]], v = [s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]];
    if (u[0] * v[0] + u[1] * v[1] < 0) inversions++;
  }
  return inversions >= 5 && longueur > diag * 3.5;
}

/** point dans un polygone (règle pair-impair) */
export function dansPolygone(pt, poly) {
  let dedans = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi || 1e-12) + xi) dedans = !dedans;
  }
  return dedans;
}
/** traits sélectionnés par un lasso : au moins 60 % de leurs points dedans */
export const traitsDansLasso = (traits, poly) => (traits || []).filter((t) => {
  const p = t.points || [];
  return p.length && p.filter((q) => dansPolygone(q, poly)).length >= Math.max(1, p.length * 0.6);
});
