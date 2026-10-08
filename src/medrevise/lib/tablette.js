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
/** Un pointeur doit-il être ignoré par les couches d'annotation ? (doigt/paume quand un stylet est actif) */
export const pointeurIgnore = (e) => styletVu && e && e.pointerType === 'touch';

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
