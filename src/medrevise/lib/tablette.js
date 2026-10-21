/* ============================================================
   MedRevise — MODE TABLETTE du lecteur (07/10, docs/compte-rendu-tablette.md).

   Entre le shell mobile (≤ 760 px, voir MedReviseApp) et l'ordinateur (≥ 1 200 px,
   inchangé) : iPad portrait et paysage, fenêtre Mac étroite.
   Le panneau est un volet qui monte depuis le bas (08/10), en portrait comme en paysage.
   Le basculement (rotation de l'iPad) ne démonte rien : seules des classes et
   quelques éléments optionnels changent, l'état du lecteur reste en place.
   ============================================================ */
import { useRef } from 'react';
import { useMediaQuery } from '../../shared/hooks/useMediaQuery.js';

/* IMPRESSION (08/10) : pendant qu'on imprime, la page est mise en page à la largeur du
   papier (≈ 740–800 px) — les requêtes de largeur basculaient alors l'app en mobile ou en
   tablette, ce qui DÉMONTAIT le document ouvert (on le retrouvait fermé après l'impression).
   Une valeur suivie par ce crochet reste celle d'avant l'impression tant qu'elle dure. */
let figeJusqua = 0; // de « beforeprint » à 1 s après « afterprint » (les rendus arrivent après coup)
if (typeof window !== 'undefined') {
  window.addEventListener('beforeprint', () => { figeJusqua = Infinity; });
  window.addEventListener('afterprint', () => { figeJusqua = Date.now() + 1000; });
}
export const enImpression = () => typeof window !== 'undefined' && (Date.now() < figeJusqua || (!!window.matchMedia && window.matchMedia('print').matches));
export function useHorsImpression(valeur) {
  const derniere = useRef(valeur);
  if (enImpression()) return derniere.current;
  derniere.current = valeur;
  return valeur;
}

export const REQUETE_TABLETTE = '(min-width: 761px) and (max-width: 1199px)';
export const REQUETE_COTE = '(min-width: 900px)';

export function useTablette() {
  const tablette = useHorsImpression(useMediaQuery(REQUETE_TABLETTE));
  const large = useHorsImpression(useMediaQuery(REQUETE_COTE));
  return { tablette, cote: tablette && large, portrait: tablette && !large };
}

/* VOLET DU BAS (08/10, docs/compte-rendu-tablette-document-transcript.md) — remplace le
   volet latéral : en tablette (portrait comme paysage), le panneau monte depuis le BAS et
   le PDF reste visible AU-DESSUS, sur toute la largeur. Hauteur = FRACTION de la zone de
   lecture, mémorisée par appareil (une seule valeur, ~45 % par défaut). Au-delà de
   VOLET_PLEIN au relâcher : plein écran (PDF masqué). */
export const VOLET_DEFAUT = 0.45;
export const VOLET_MIN = 0.22;
export const VOLET_MAX = 0.8;
export const VOLET_PLEIN = 0.9;
const CLE_VOLET = 'medrevise.tablette.voletBas';
export const bornerVolet = (f) => Math.max(VOLET_MIN, Math.min(VOLET_MAX, f));
export function lireFractionVolet() {
  try { const v = Number(localStorage.getItem(CLE_VOLET)); return v >= VOLET_MIN && v <= VOLET_MAX ? v : VOLET_DEFAUT; } catch (e) { return VOLET_DEFAUT; }
}
export function ecrireFractionVolet(f) {
  try { localStorage.setItem(CLE_VOLET, String(+bornerVolet(f).toFixed(4))); } catch (e) { /* stockage bloqué */ }
}

/* STYLET (Apple Pencil, pointerType « pen ») : dès qu'un stylet a touché une page du
   lecteur, le doigt ne dessine plus — il fait défiler, et la paume posée pendant qu'on
   écrit est ignorée (comme Notes ou GoodNotes). Tenu pour la durée de la page. */
let styletVu = false;
const abonnesStylet = new Set();
export const styletActif = () => styletVu;
export function noterPointeur(e) {
  if (styletVu || !e || e.pointerType !== 'pen') return;
  styletVu = true;
  abonnesStylet.forEach((f) => f());
}
export function abonnerStylet(f) { abonnesStylet.add(f); return () => abonnesStylet.delete(f); }

/* PRIORITÉ AU STYLET (20/10, docs/compte-rendu-pdfreader-v3.md) : le doigt ne dessine JAMAIS avec un outil
   d'annotation (rejet de la paume) — il fait défiler et zoomer (pincement) — sauf réglage « Dessiner au doigt »,
   désactivé par défaut. La souris et le stylet dessinent toujours. Les calques de dessin sont en
   `touch-action: none` (sinon iPadOS ferait défiler la page sous le Pencil) : le défilement au doigt y est
   donc fait ici, à la main, avec inertie (`defilerAuDoigt`). Réglages mémorisés par appareil. */
const CLE_DOIGT = 'medrevise.dessinDoigt';
const EV_REGLAGES = 'medrevise:reglages-stylet';
const lireLS = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
export const dessinAuDoigt = () => lireLS(CLE_DOIGT) === '1';
function ecrireReglage(cle, v) {
  try { localStorage.setItem(cle, v ? '1' : '0'); } catch (e) { /* stockage bloqué : réglage de la session seulement */ }
  try { window.dispatchEvent(new Event(EV_REGLAGES)); } catch (e) { /* ignore */ }
}
export const ecrireDessinAuDoigt = (v) => ecrireReglage(CLE_DOIGT, v);
export function abonnerReglagesStylet(f) {
  window.addEventListener(EV_REGLAGES, f); window.addEventListener('storage', f);
  return () => { window.removeEventListener(EV_REGLAGES, f); window.removeEventListener('storage', f); };
}
/** Un pointeur doit-il être ignoré par les couches d'annotation ? Le doigt (et la paume), sauf « Dessiner au doigt ». */
export const pointeurIgnore = (e) => !!e && e.pointerType === 'touch' && !dessinAuDoigt();

/* doigts posés (pointeurs « touch » en cours), pour savoir si un 2e doigt pince */
const doigts = new Set();
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') doigts.add(e.pointerId); }, true);
  const lever = (e) => { if (e.pointerType === 'touch') doigts.delete(e.pointerId); };
  window.addEventListener('pointerup', lever, true);
  window.addEventListener('pointercancel', lever, true);
}
let inertie = null;
const arreterInertie = () => { if (inertie) { cancelAnimationFrame(inertie); inertie = null; } };
/** Fait défiler `zone` au doigt depuis un pointerdown ignoré par un calque de dessin (inertie au relâcher).
    Un 2e doigt posé : on s'arrête là (le pincement zoome, géré par le lecteur). */
export function defilerAuDoigt(e, zone) {
  if (!zone || !e || e.pointerType !== 'touch') return;
  arreterInertie();
  const pid = e.pointerId;
  let x = e.clientX, y = e.clientY, t = performance.now(), vx = 0, vy = 0, fini = false;
  const move = (ev) => {
    if (ev.pointerId !== pid || fini) return;
    if (doigts.size > 1) { vx = 0; vy = 0; return; }
    const dx = ev.clientX - x, dy = ev.clientY - y, now = performance.now(), dt = Math.max(1, now - t);
    zone.scrollLeft -= dx; zone.scrollTop -= dy;
    vx = 0.75 * (dx / dt) + 0.25 * vx; vy = 0.75 * (dy / dt) + 0.25 * vy;
    x = ev.clientX; y = ev.clientY; t = now;
  };
  const fin = (ev) => {
    if (ev.pointerId !== pid) return;
    fini = true;
    window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', fin, true); window.removeEventListener('pointercancel', fin, true);
    if (ev.type !== 'pointerup' || performance.now() - t > 90 || doigts.size > 0) return;
    let dernier = performance.now();
    const pas = (now) => { // inertie : vitesse qui décroît (≈ celle d'iOS), en px/ms
      const dt = Math.min(32, now - dernier); dernier = now;
      zone.scrollLeft -= vx * dt; zone.scrollTop -= vy * dt;
      const f = Math.pow(0.94, dt / 16.7); vx *= f; vy *= f;
      inertie = Math.hypot(vx, vy) > 0.02 ? requestAnimationFrame(pas) : null;
    };
    inertie = requestAnimationFrame(pas);
  };
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', fin, true);
  window.addEventListener('pointercancel', fin, true);
}
if (typeof window !== 'undefined') window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') arreterInertie(); }, true);

/* UN TRACÉ À LA FOIS (doigt, stylet, souris) : un 2e pointeur posé pendant un tracé est
   ignoré ; s'il arrive dans les 250 ms qui suivent un tracé AU DOIGT, c'est un geste à deux
   doigts (pincer, défiler) : le tracé commencé est annulé, rien n'est enregistré. */
let traceCourant = null; // { pid, type, t0, annuler }
export function prendreTrace(e, annuler) {
  if (traceCourant) {
    if (traceCourant.type === 'touch' && e.pointerType === 'touch' && performance.now() - traceCourant.t0 < 250) {
      const t = traceCourant; traceCourant = null; t.annuler();
    }
    return false;
  }
  traceCourant = { pid: e.pointerId, type: e.pointerType, t0: performance.now(), annuler };
  return true;
}
export function rendreTrace(pid) { if (traceCourant && traceCourant.pid === pid) traceCourant = null; }
