/* ============================================================
   MedRevise — LE gestionnaire de pointeur et LA conversion PDF ↔ écran des annotations
   (21/10, docs/compte-rendu-pdfreader-reparation.md).

   Avant : treize gestes (tracé d'une boîte, d'une forme, d'un trait, gomme, lasso, visée d'une flèche,
   déplacement d'une boîte, d'une épingle, d'un point de flèche, d'une forme…) refaisaient chacun le filtre
   du pointeur, le défilement au doigt, les écouteurs sur window, le seuil de déplacement et la conversion
   des coordonnées. Tous passent désormais par `suivrePointeur` et `versPage`.

   Repère unique : la PAGE, en fractions [0, 1] (x vers la droite, y vers le bas) — indépendant du zoom.
   ============================================================ */
import { noterPointeur, pointeurIgnore, defilerAuDoigt } from '../lib/tablette.js';

const borne = (v) => Math.max(0, Math.min(1, v));
/** point écran (événement) → fractions de la page dont `r` est le rectangle à l'écran */
export const versPage = (ev, r, borner = true) => {
  const x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
  return borner ? [borne(x), borne(y)] : [x, y];
};
/** fractions de page → pixels de la page (largeur `W`, hauteur `H` affichées) */
export const pageVersPx = (p, W, H) => (Array.isArray(p) ? { x: p[0] * W, y: p[1] * H } : { x: p.x * W, y: p.y * H });
/** rectangle écran de la page qui contient l'élément */
export const rectPage = (el) => { const p = el && el.closest && el.closest('.pdfr-page'); return p ? p.getBoundingClientRect() : null; };

/**
 * Suit UN pointeur, du pointerdown `e` au relâchement.
 *   doigt   'defiler' (calques de dessin : sans « Dessiner au doigt », le doigt fait défiler la page) | 'suivre'
 *   seuil   déplacement minimal (px, somme |dx|+|dy|) avant le premier `move` — un clic reste un clic
 *   arreter stopPropagation au pointerdown (poignées posées sur la page)
 *   move(ev, lot, bouge)   à chaque déplacement ; `lot` = événements coalescés (au moins `ev`)
 *   fin(ev, { bouge, annule })   au relâchement (annule : pointercancel ou `arreter()`)
 * Renvoie { arreter } ou null si le geste n'a pas démarré (autre bouton, doigt qui défile).
 */
export function suivrePointeur(e, { doigt = 'suivre', seuil = 0, arreter = false, move = null, fin = null } = {}) {
  noterPointeur(e);
  if (doigt === 'defiler' && pointeurIgnore(e)) { defilerAuDoigt(e, e.currentTarget && e.currentTarget.closest && e.currentTarget.closest('.pdfr-scroll')); return null; }
  if (e.button !== 0 && !(e.pointerType === 'pen' && e.button === 5)) return null; // gauche, ou bout gomme du stylet
  e.preventDefault(); // pas de sélection native pendant le geste
  if (arreter) e.stopPropagation();
  const pid = e.pointerId, x0 = e.clientX, y0 = e.clientY;
  let bouge = seuil <= 0, fini = false;
  const onMove = (ev) => {
    if (ev.pointerId !== pid || fini) return;
    if (!bouge) { if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) <= seuil) return; bouge = true; }
    if (!move) return;
    const lot = typeof ev.getCoalescedEvents === 'function' ? ev.getCoalescedEvents() : [];
    move(ev, lot.length ? lot : [ev], bouge);
  };
  const nettoyer = () => {
    fini = true;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onFin);
    window.removeEventListener('pointercancel', onFin);
  };
  const onFin = (ev) => {
    if (ev.pointerId !== pid || fini) return;
    nettoyer();
    if (fin) fin(ev, { bouge, annule: ev.type === 'pointercancel' });
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onFin);
  window.addEventListener('pointercancel', onFin);
  return { arreter: () => { if (fini) return; nettoyer(); if (fin) fin(null, { bouge, annule: true }); } };
}
