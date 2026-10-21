/* ============================================================
   MedRevise — CRAYON (refait simple le 21/10, docs/compte-rendu-pdfreader-reparation.md).

   UN seul crayon, réglé par sa couleur et une de TROIS épaisseurs ; le surligneur à main levée est le même
   moteur (opacité 40 %, fusion « multiply »). Chaîne d'un trait :
     1. CAPTURE : tous les événements coalescés du pointeur ;
     2. LISSAGE FIXE léger : moyenne mobile sur 3 points (les deux extrémités restent en place — le bout
        du trait reste sous le pointeur) ;
     3. APERÇU : le canvas posé sur la page est redessiné à chaque événement avec LE MÊME CHEMIN que le trait
        enregistré (`cheminCatmull`, tracé sur le canvas par Path2D) ;
     4. au relâchement : enregistrement vectoriel en fractions de page (épaisseur en fraction de la hauteur de
        page : constante en unités PDF, quel que soit le zoom), `rendu: 'cr'`.
   Plus de stabilisation réglable, d'aimant, de pression, de redressement, de griffonnage ni de lasso.
   Les traits déjà posés gardent leur rendu (`cheminTrait` : 'cr', 'droit' ou l'ancien tracé par les milieux).
   ============================================================ */
const lireLS = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
const ecrireLS = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (e) { /* stockage bloqué : réglage de la session */ } };

/** les 3 épaisseurs (fraction de la hauteur de page) — mêmes valeurs que les préréglages du 20/10 */
export const EPAISSEURS_CRAYON = {
  dessin: [{ id: 'fin', label: 'Fin', v: 0.0024 }, { id: 'moyen', label: 'Moyen', v: 0.0042 }, { id: 'epais', label: 'Épais', v: 0.0075 }],
  surligneur: [{ id: 'fin', label: 'Fin', v: 0.011 }, { id: 'moyen', label: 'Moyen', v: 0.017 }, { id: 'epais', label: 'Épais', v: 0.026 }],
};
/** opacité fixe du surligneur à main levée */
export const OPACITE_SURLIGNEUR_CRAYON = 0.4;

/** réglages mémorisés par appareil : épaisseur choisie par mode, surligneur en ligne droite, mode de la gomme */
export const reglagesCrayon = {
  epaisseur: (mode) => { const id = lireLS('medrevise.epaisseur.' + mode, 'moyen'); return (EPAISSEURS_CRAYON[mode] || EPAISSEURS_CRAYON.dessin).find((e) => e.id === id) || EPAISSEURS_CRAYON[mode][1]; },
  setEpaisseur: (mode, id) => ecrireLS('medrevise.epaisseur.' + mode, id),
  surligneurDroit: () => lireLS('medrevise.surligneurDroit', '1') !== '0',
  setSurligneurDroit: (v) => ecrireLS('medrevise.surligneurDroit', v ? '1' : '0'),
  modeGomme: () => (lireLS('medrevise.modeGomme', 'zone') === 'trait' ? 'trait' : 'zone'),
  setModeGomme: (v) => ecrireLS('medrevise.modeGomme', v === 'trait' ? 'trait' : 'zone'),
};

/** LISSAGE : moyenne mobile sur 3 points, extrémités gardées */
export function lisser3(points) {
  const p = points || [];
  if (p.length < 3) return p.map((q) => [q[0], q[1]]);
  const out = [[p[0][0], p[0][1]]];
  for (let i = 1; i < p.length - 1; i++) out.push([(p[i - 1][0] + p[i][0] + p[i + 1][0]) / 3, (p[i - 1][1] + p[i][1] + p[i + 1][1]) / 3]);
  out.push([p[p.length - 1][0], p[p.length - 1][1]]);
  return out;
}
/** points à enregistrer (5 décimales : 1/100 000 de page) */
export const arrondirPoints = (points) => (points || []).map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]);

/** chemin SVG Catmull-Rom (passe par chaque point) ; `ex` × `ey` = taille du repère (100 × 100 pour le viewBox de
    la page, pixels du canvas pour l'aperçu) */
export function cheminCatmull(points, ex = 100, ey = ex) {
  const p = (points || []).map(([x, y]) => [x * ex, y * ey]);
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
/** chemin en segments droits (surligneur en ligne droite ; formes redressées du 20/10) */
export function cheminDroit(points, ex = 100, ey = ex) {
  const p = points || [];
  if (p.length === 1) return `M${(p[0][0] * ex).toFixed(3)} ${(p[0][1] * ey).toFixed(3)} l0.001 0`;
  return p.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * ex).toFixed(3)} ${(y * ey).toFixed(3)}`).join(' ');
}
/** le chemin d'un trait enregistré, selon son rendu (`droit`, `cr` ou ancien) — `ancien` = cheminLisse */
export const cheminTrait = (t, ancien, echelle = 100) => (t.rendu === 'droit' ? cheminDroit(t.points, echelle) : t.rendu === 'cr' ? cheminCatmull(t.points, echelle) : ancien(t.points));

/* ---------- GOMME DE ZONE : n'efface que la partie du trait sous la gomme ---------- */
/** points rapprochés (pas maximal `pas`, en fractions de page × `ratio` en x) : une gomme qui passe entre deux
    points éloignés (ligne droite) coupe quand même le trait */
export function densifier(points, pas, ratio = 1) {
  const p = points || [];
  if (p.length < 2) return p.map((q) => [q[0], q[1]]);
  const out = [[p[0][0], p[0][1]]];
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i];
    const n = Math.max(1, Math.ceil(Math.hypot((b[0] - a[0]) * ratio, b[1] - a[1]) / pas));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}
/** morceaux d'un trait qui restent hors de la gomme (`efface(point)` → vrai si le point est sous la gomme) :
    listes d'au moins 2 points ; [] si tout est effacé */
export function morceauxHors(points, efface) {
  const out = [];
  let cur = [];
  for (const q of points || []) {
    if (efface(q)) { if (cur.length >= 2) out.push(cur); cur = []; } else cur.push(q);
  }
  if (cur.length >= 2) out.push(cur);
  return out;
}
