/* ============================================================
   MedRevise — IMAGES COLLÉES : ROGNAGE ET REDIMENSION, UN SEUL COMPOSANT (24/10/2026,
   docs/compte-rendu-seance-categories.md § 2). Utilisé par les QUATRE contextes : lecteur PDF et fiche
   jumelle (pdf/PdfPage.jsx ImageCollee), document (documents/lib/imageVue.js), tableau (tableau/Board.jsx).

   MODÈLE (non destructif, réversible) : le fichier de l'image n'est JAMAIS modifié. `rognage` = { x, y, w, h }
   = la partie VISIBLE, en fractions de l'image entière ; le cadre de l'objet est cette partie. Sans `rognage`,
   l'image est entière. « Rogner » à nouveau montre l'image entière autour du cadre : on peut agrandir jusqu'à
   l'image complète, ou « Image entière » remet tout.

   CADRE DE ROGNAGE (ouvrirRognage) : posé SUR document.body, en position fixe calée sur l'écran de l'objet —
   ni un calque `overflow: hidden` (page, zone d'écriture, partie déjà rognée), ni une transformation (zoom du
   lecteur, caméra du tableau) ne peut le couper ni le décaler. L'image entière y est montrée en transparence,
   la zone gardée en clair, 4 poignées d'angle (et le centre se glisse) ; Entrée valide, Échap annule (aussi
   ✓ / ✕ à la souris ou au doigt). Les autres raccourcis de l'écran ne voient pas ces touches.

   REDIMENSION : 4 poignées d'angle, proportions conservées ; Maj enfoncée = libre (redimRectImage).
   ============================================================ */

import '../../styles/rognage-image.css';

export const ROGNAGE_MIN = 0.03; // 3 % de l'image dans chaque sens, au moins
const q = (v) => +Number(v).toFixed(5);

/** rognage valide (ou null = image entière) */
export function rognageValide(rg) {
  if (!rg || typeof rg !== 'object') return null;
  const x = Math.max(0, Math.min(1, +rg.x || 0)), y = Math.max(0, Math.min(1, +rg.y || 0));
  const w = Math.max(ROGNAGE_MIN, Math.min(1 - x, +rg.w || 1)), h = Math.max(ROGNAGE_MIN, Math.min(1 - y, +rg.h || 1));
  if (x <= 1e-4 && y <= 1e-4 && w >= 1 - 1e-4 && h >= 1 - 1e-4) return null;
  return { x: q(x), y: q(y), w: q(w), h: q(h) };
}

/** l'image ENTIÈRE autour d'un cadre { x, y, width, height } (n'importe quelle unité) rogné par `rg` */
export function entiereDepuisCadre(cadre, rg) {
  if (!rg) return { x: cadre.x, y: cadre.y, width: cadre.width, height: cadre.height };
  return { x: cadre.x - (rg.x / rg.w) * cadre.width, y: cadre.y - (rg.y / rg.h) * cadre.height, width: cadre.width / rg.w, height: cadre.height / rg.h };
}

/** nouveau cadre quand le rognage passe de `ancien` à `nouveau` : l'image entière reste exactement en place */
export function cadreApresRognage(cadre, ancien, nouveau) {
  const F = entiereDepuisCadre(cadre, ancien);
  const n = nouveau || { x: 0, y: 0, w: 1, h: 1 };
  return { x: F.x + n.x * F.width, y: F.y + n.y * F.height, width: n.w * F.width, height: n.h * F.height };
}

/** style (en %) de l'image entière DANS le cadre visible — à poser sur un calque absolu, le cadre en overflow: hidden */
export function styleEntiere(rg) {
  if (!rg) return { left: '0%', top: '0%', width: '100%', height: '100%' };
  return { left: (-rg.x / rg.w) * 100 + '%', top: (-rg.y / rg.h) * 100 + '%', width: 100 / rg.w + '%', height: 100 / rg.h + '%' };
}

/**
 * Redimension d'un rectangle { x, y, width, height } par le coin `coin` ('nw'|'ne'|'sw'|'se') de (dx, dy) :
 * coin opposé fixe ; proportions `ratio` (hauteur / largeur, mêmes unités) conservées sauf `libre` (Maj).
 */
export function redimRectImage(base, coin, dx, dy, { ratio = null, libre = false, min = { width: 1, height: 1 } } = {}) {
  const est = coin.includes('e'), sud = coin.includes('s');
  let w = base.width + (est ? dx : -dx), h = base.height + (sud ? dy : -dy);
  const r = libre ? null : ratio || (base.width ? base.height / base.width : null);
  if (r) { const w2 = Math.max(w, h / r); w = w2; h = w2 * r; }
  w = Math.max(min.width, w); h = Math.max(min.height, h);
  if (r) { if (w * r < min.height) w = min.height / r; h = w * r; }
  return { x: est ? base.x : base.x + base.width - w, y: sud ? base.y : base.y + base.height - h, width: w, height: h };
}

/** déplace un coin (ou tout le cadre, 'centre') d'un rognage de (fx, fy) — fractions de l'image entière, borné à l'image */
export function deplacerRognage(rg0, prise, fx, fy) {
  const r = rg0 || { x: 0, y: 0, w: 1, h: 1 };
  let x1 = r.x, y1 = r.y, x2 = r.x + r.w, y2 = r.y + r.h;
  if (prise === 'centre') {
    const dx = Math.max(-x1, Math.min(1 - x2, fx)), dy = Math.max(-y1, Math.min(1 - y2, fy));
    return { x: x1 + dx, y: y1 + dy, w: r.w, h: r.h };
  }
  if (prise.includes('w')) x1 = Math.max(0, Math.min(x2 - ROGNAGE_MIN, x1 + fx));
  if (prise.includes('e')) x2 = Math.min(1, Math.max(x1 + ROGNAGE_MIN, x2 + fx));
  if (prise.includes('n')) y1 = Math.max(0, Math.min(y2 - ROGNAGE_MIN, y1 + fy));
  if (prise.includes('s')) y2 = Math.min(1, Math.max(y1 + ROGNAGE_MIN, y2 + fy));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

const PRISES = ['nw', 'ne', 'sw', 'se'];
let ouvert = null;

/**
 * Ouvre le cadre de rognage sur l'objet `cadreEl` (élément qui montre la partie visible actuelle).
 * `url` : l'image ; `rognage` : le rognage actuel (null = entière). `onValider(rognageOuNull)` / `onAnnuler()`.
 * Renvoie { fermer, valider, annuler }. Un seul cadre à la fois (en ouvrir un autre valide le précédent).
 */
export function ouvrirRognage({ cadreEl, url, rognage = null, onValider = () => {}, onAnnuler = () => {} }) {
  if (ouvert) ouvert.valider();
  const depart = rognageValide(rognage);
  let rg = depart ? { ...depart } : { x: 0, y: 0, w: 1, h: 1 };
  const racine = document.createElement('div');
  racine.className = 'rgn sel-zone'; // sel-zone : un appui dans le cadre ne désélectionne pas l'objet (pdf/Selection.jsx ZONE_SELECTION)
  racine.setAttribute('role', 'dialog');
  racine.setAttribute('aria-label', 'Rogner l’image — Entrée : valider, Échap : annuler');
  racine.innerHTML = `<div class="rgn-entiere"><img alt="" draggable="false"><div class="rgn-zone" data-prise="centre">${PRISES.map((p) => `<span class="rgn-coin rgn-${p}" data-prise="${p}"></span>`).join('')}</div></div>
    <div class="rgn-barre"><button type="button" class="rgn-bt" data-rgn="entiere" title="Image entière (annule tout rognage)">Image entière</button><button type="button" class="rgn-bt" data-rgn="annuler" title="Annuler (Échap)" aria-label="Annuler (Échap)">✕</button><button type="button" class="rgn-bt ok" data-rgn="valider" title="Valider (Entrée)" aria-label="Valider (Entrée)">✓ Valider</button></div>`;
  const entiere = racine.querySelector('.rgn-entiere');
  const zone = racine.querySelector('.rgn-zone');
  const barre = racine.querySelector('.rgn-barre');
  racine.querySelector('img').src = url || '';
  document.body.appendChild(racine);

  // position : l'image entière calée sur l'écran de l'objet (suivie à chaque image : zoom, défilement)
  let F = null, raf = 0;
  const placer = () => {
    const r = cadreEl.isConnected ? cadreEl.getBoundingClientRect() : null;
    if (r && r.width && r.height) {
      F = entiereDepuisCadre({ x: r.left, y: r.top, width: r.width, height: r.height }, depart);
      Object.assign(entiere.style, { left: F.x + 'px', top: F.y + 'px', width: F.width + 'px', height: F.height + 'px' });
      Object.assign(zone.style, { left: rg.x * 100 + '%', top: rg.y * 100 + '%', width: rg.w * 100 + '%', height: rg.h * 100 + '%' });
      const bas = F.y + (rg.y + rg.h) * F.height + 10, place = window.innerHeight - 52;
      Object.assign(barre.style, { left: Math.max(8, Math.min(window.innerWidth - barre.offsetWidth - 8, F.x + (rg.x + rg.w) * F.width - barre.offsetWidth)) + 'px',
        top: (bas < place ? bas : Math.max(8, F.y + rg.y * F.height - 46)) + 'px' });
    }
    raf = requestAnimationFrame(placer);
  };
  placer();

  const appui = (e) => {
    const t = e.target.closest('[data-prise]');
    if (!t || (e.button && e.button !== 0) || !F) return;
    e.preventDefault(); e.stopPropagation();
    const prise = t.dataset.prise, x0 = e.clientX, y0 = e.clientY, r0 = { ...rg };
    try { t.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    racine.classList.add('geste');
    const bouge = (ev) => { if (ev.pointerId !== e.pointerId) return; rg = deplacerRognage(r0, prise, (ev.clientX - x0) / F.width, (ev.clientY - y0) / F.height); };
    const fin = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      racine.classList.remove('geste');
      t.removeEventListener('pointermove', bouge); t.removeEventListener('pointerup', fin); t.removeEventListener('pointercancel', fin);
    };
    t.addEventListener('pointermove', bouge); t.addEventListener('pointerup', fin); t.addEventListener('pointercancel', fin);
  };
  racine.addEventListener('pointerdown', appui);
  // un appui hors de l'image (sur le voile) valide, comme un clic hors d'une sélection
  const dehors = (e) => { if (!racine.contains(e.target)) { e.stopPropagation(); e.preventDefault(); fermer(true); } };
  const touches = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); fermer(true); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); fermer(false); }
    else if (!e.metaKey && !e.ctrlKey) e.stopImmediatePropagation(); // Suppr, flèches… : rien d'autre pendant le rognage
  };
  barre.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rgn]');
    if (!b) return;
    e.stopPropagation();
    if (b.dataset.rgn === 'valider') fermer(true);
    else if (b.dataset.rgn === 'annuler') fermer(false);
    else { rg = { x: 0, y: 0, w: 1, h: 1 }; }
  });
  racine.addEventListener('click', (e) => e.stopPropagation());
  window.addEventListener('keydown', touches, true);
  window.addEventListener('pointerdown', dehors, true);

  let fini = false;
  function fermer(garder) {
    if (fini) return;
    fini = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', touches, true);
    window.removeEventListener('pointerdown', dehors, true);
    racine.remove();
    if (ouvert && ouvert.racine === racine) ouvert = null;
    if (!garder) { onAnnuler(); return; }
    const n = rognageValide(rg);
    const a = depart;
    const pareil = (!n && !a) || (n && a && ['x', 'y', 'w', 'h'].every((k) => Math.abs(n[k] - a[k]) < 1e-4));
    if (pareil) onAnnuler(); else onValider(n);
  }
  ouvert = { racine, valider: () => fermer(true), annuler: () => fermer(false) };
  return { fermer, valider: () => fermer(true), annuler: () => fermer(false) };
}

/** un cadre de rognage est-il ouvert ? (les écrans ignorent alors leurs propres gestes / touches) */
export const rognageOuvert = () => !!ouvert;
