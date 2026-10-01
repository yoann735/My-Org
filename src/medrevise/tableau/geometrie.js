/* ============================================================
   MedRevise — TABLEAU : géométrie des flèches (fonctions PURES, 04/10).
   Une flèche relie deux POINTS D'ANCRAGE (milieu d'un côté : n, e, s, o).
   Elle est recalculée à chaque rendu depuis les rectangles AFFICHÉS des cartes :
   elle suit donc une carte qu'on déplace, sans rien stocker de plus.
   ============================================================ */

const NORMALE = { n: [0, -1], e: [1, 0], s: [0, 1], o: [-1, 0] };

/** point d'ancrage d'un côté d'un rectangle { x, y, w, h } (coordonnées monde). */
export function ancreDe(r, cote) {
  const c = NORMALE[cote] ? cote : 'e';
  const x = c === 'e' ? r.x + r.w : c === 'o' ? r.x : r.x + r.w / 2;
  const y = c === 's' ? r.y + r.h : c === 'n' ? r.y : r.y + r.h / 2;
  return { x, y, cote: c };
}

/** côté de `a` qui fait face à `b` (comparaison des centres, pondérée par les tailles). */
export function coteAuto(a, b) {
  const dx = (b.x + b.w / 2) - (a.x + a.w / 2);
  const dy = (b.y + b.h / 2) - (a.y + a.h / 2);
  if (Math.abs(dx) / ((a.w + b.w) || 1) >= Math.abs(dy) / ((a.h + b.h) || 1)) return dx >= 0 ? 'e' : 'o';
  return dy >= 0 ? 's' : 'n';
}

/** côté dont le point d'ancrage est le plus proche d'un point. */
export function coteLePlusProche(r, p) {
  let best = 'e', d = Infinity;
  for (const c of ['n', 'e', 's', 'o']) {
    const a = ancreDe(r, c);
    const dd = Math.hypot(a.x - p.x, a.y - p.y);
    if (dd < d) { d = dd; best = c; }
  }
  return best;
}

const f = (n) => Math.round(n * 10) / 10;

/**
 * Chemin SVG d'une flèche entre deux ancres { x, y, cote } (cote null = point libre,
 * par ex. la flèche fantôme qui suit le pointeur).
 *   droite : segment ;  coudee : chemin orthogonal (dur, angulaire) ;
 *   courbe : Bézier cubique qui prolonge les normales des deux côtés (souple).
 */
export function cheminLien(s, t, style = 'courbe') {
  const ns = NORMALE[s.cote] || [0, 0];
  const nt = t.cote ? NORMALE[t.cote] : null;
  if (style === 'droite') return `M${f(s.x)} ${f(s.y)} L${f(t.x)} ${f(t.y)}`;
  if (style === 'coudee') {
    const SORTIE = 24;
    const p1 = { x: s.x + ns[0] * SORTIE, y: s.y + ns[1] * SORTIE };
    const p2 = nt ? { x: t.x + nt[0] * SORTIE, y: t.y + nt[1] * SORTIE } : { x: t.x, y: t.y };
    const horizontal = s.cote === 'e' || s.cote === 'o';
    const pts = [s, p1];
    if (horizontal) { const mx = (p1.x + p2.x) / 2; pts.push({ x: mx, y: p1.y }, { x: mx, y: p2.y }); }
    else { const my = (p1.y + p2.y) / 2; pts.push({ x: p1.x, y: my }, { x: p2.x, y: my }); }
    pts.push(p2, t);
    return 'M' + pts.map((p) => `${f(p.x)} ${f(p.y)}`).join(' L');
  }
  // courbe
  const d = Math.hypot(t.x - s.x, t.y - s.y);
  const k = Math.max(40, Math.min(200, d * 0.4));
  const c1 = { x: s.x + ns[0] * k, y: s.y + ns[1] * k };
  const c2 = nt ? { x: t.x + nt[0] * k, y: t.y + nt[1] * k } : { x: t.x, y: t.y };
  return `M${f(s.x)} ${f(s.y)} C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(t.x)} ${f(t.y)}`;
}
