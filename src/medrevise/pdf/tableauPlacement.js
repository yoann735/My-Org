/* ============================================================
   MedRevise — boîte-tableau : fonctions PURES (25/10, docs/compte-rendu-apprentissage-v2-recherche-tags.md §4) —
   placement du menu Tableau À CÔTÉ de la boîte, contour de la cellule / plage sélectionnée. Utilisées par BoiteTableau.jsx.
   ============================================================ */
/* (25/10) SÉLECTION : un contour intérieur fin couleur d'accent — autour de la cellule, ou autour de la PLAGE entière
   (chaque cellule de la plage ne trace que ses bords extérieurs) ; la plage a en plus un voile d'accent à 12 % (CSS). */
const EP_SEL = '1.5px';
export function contourSel(sel, c) {
  if (!sel) return undefined;
  const i0 = Math.min(sel.i0, sel.i1), i1 = Math.max(sel.i0, sel.i1), j0 = Math.min(sel.j0, sel.j1), j1 = Math.max(sel.j0, sel.j1);
  const ac = 'var(--accent)', o = [];
  if (c.i <= i0) o.push(`inset 0 ${EP_SEL} 0 0 ${ac}`);
  if (c.i + (c.rs || 1) - 1 >= i1) o.push(`inset 0 -${EP_SEL} 0 0 ${ac}`);
  if (c.j <= j0) o.push(`inset ${EP_SEL} 0 0 0 ${ac}`);
  if (c.j + (c.cs || 1) - 1 >= j1) o.push(`inset -${EP_SEL} 0 0 0 ${ac}`);
  return o.length ? o.join(', ') : undefined;
}

/**
 * Place un panneau (taille `p` = { w, h }) À CÔTÉ du rectangle `b` (la boîte), dans l'écran `e` = { W, H } :
 * à droite, sinon à gauche, sinon en dessous, sinon au-dessus — jamais par-dessus la boîte. Trop haut pour l'écran :
 * borné (il défile). Rien ne convient : le côté le plus large (le panneau est alors réduit à la place disponible).
 * → { cote, left, top, maxHeight }
 */
export function placerACote(b, p, e, m = 8) {
  const hMax = e.H - 2 * m;
  const h = Math.min(p.h, hMax);
  const vertical = () => Math.max(m, Math.min(b.top, e.H - m - h)); // aligné sur le haut de la boîte, gardé dans l'écran
  const horizontal = () => Math.max(m, Math.min(b.left, e.W - m - p.w));
  if (b.right + m + p.w <= e.W - m) return { cote: 'droite', left: b.right + m, top: vertical(), maxHeight: hMax };
  if (b.left - m - p.w >= m) return { cote: 'gauche', left: b.left - m - p.w, top: vertical(), maxHeight: hMax };
  const dessous = e.H - m - (b.bottom + m), dessus = b.top - m - m;
  if (dessous >= Math.min(p.h, 160)) return { cote: 'dessous', left: horizontal(), top: b.bottom + m, maxHeight: dessous };
  if (dessus >= Math.min(p.h, 160)) { const hh = Math.min(p.h, dessus); return { cote: 'dessus', left: horizontal(), top: b.top - m - hh, maxHeight: dessus }; }
  // la boîte occupe presque tout l'écran : le plus grand espace libre, même étroit
  const places = [['droite', e.W - m - b.right - m], ['gauche', b.left - m - m], ['dessous', dessous], ['dessus', dessus]].sort((x, y) => y[1] - x[1]);
  const [cote] = places[0];
  if (cote === 'dessous') return { cote, left: horizontal(), top: b.bottom + m, maxHeight: Math.max(120, dessous) };
  if (cote === 'dessus') return { cote, left: horizontal(), top: m, maxHeight: Math.max(120, dessus) };
  return { cote, left: cote === 'droite' ? b.right + m : m, top: vertical(), maxHeight: hMax };
}
