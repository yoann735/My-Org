/* ============================================================
   MedRevise — MODE TABLETTE du lecteur (07/10, docs/compte-rendu-tablette.md).

   Entre le shell mobile (≤ 760 px, voir MedReviseApp) et l'ordinateur (≥ 1 200 px,
   inchangé) : iPad portrait et paysage, fenêtre Mac étroite.
   - `cote`     : ≥ 900 px — PDF et panneau côte à côte, séparateur glissable ;
   - `portrait` : < 900 px — empilé, onglets Cours / Panneau en bas (zone du pouce).
   Le basculement (rotation de l'iPad) ne démonte rien : seules des classes et
   quelques éléments optionnels changent, l'état du lecteur reste en place.
   ============================================================ */
import { useMediaQuery } from '../../shared/hooks/useMediaQuery.js';

export const REQUETE_TABLETTE = '(min-width: 761px) and (max-width: 1199px)';
export const REQUETE_COTE = '(min-width: 900px)';

export function useTablette() {
  const tablette = useMediaQuery(REQUETE_TABLETTE);
  const large = useMediaQuery(REQUETE_COTE);
  return { tablette, cote: tablette && large, portrait: tablette && !large };
}

/* Largeur du panneau en tablette côte à côte : mémorisée PAR APPAREIL (localStorage). */
export const PANNEAU_MIN = 320;
export const PANNEAU_MAX = 560;
const CLE_LARGEUR = 'medrevise.tablette.panneau';
export const bornerLargeur = (w) => Math.round(Math.max(PANNEAU_MIN, Math.min(PANNEAU_MAX, w)));
/** Largeur mémorisée, ou null (premier passage : le lecteur la calcule d'après sa largeur). */
export function lireLargeurPanneau() {
  try { const v = Number(localStorage.getItem(CLE_LARGEUR)); return v ? bornerLargeur(v) : null; } catch (e) { return null; }
}
/** Par défaut : 42 % de la largeur du lecteur, entre 320 et 380 px (le PDF garde la main). */
export const largeurParDefaut = (largeurLecteur) => bornerLargeur(Math.min(380, (largeurLecteur || 900) * 0.42));
export function ecrireLargeurPanneau(w) {
  try { localStorage.setItem(CLE_LARGEUR, String(bornerLargeur(w))); } catch (e) { /* stockage bloqué */ }
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
