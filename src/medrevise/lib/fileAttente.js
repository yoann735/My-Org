/* ============================================================
   MedRevise — MODE FILE D'ATTENTE (15/11/2026, docs/compte-rendu-mode-file-attente.md).
   Un mode activable qui met le planning des flashcards EN PAUSE les jours où l'on ne révise pas : les révisions
   oubliées ne s'empilent plus en retard, elles passent dans l'ordre, un jour de cartes après l'autre.

   RÈGLE UNIQUE (lib/planning.js dateEffective, seule lecture de date de toute l'app) :
     dateEffective(carte) = date de base (planning.js dateBase : dueDate, « Sauter », conversion)
                          + nombre de JOURS EN PAUSE situés STRICTEMENT APRÈS le jour de la dernière révision de la carte.
   Une carte revue pendant le mode n'est donc pas décalée par les pauses passées. Les Nouvelles n'ont pas de date :
   jamais concernées. Mode désactivé (ou aucun jour en pause) : dateEffective = date de base, à l'identique.

   AUCUNE ÉCRITURE SUR LES CARTES : ni dueDate, ni état FSRS, ni journal. Seul l'enregistrement synchronisé
   `prompts/fileAttente` (lib/storage.js, même mécanique que `reglagesFC`) est écrit :
     { id: 'fileAttente', actif, pauses: ['YYYY-MM-DD'…], activeLe, verifieJusquau, updatedAt }

   Ce fichier ne contient que des fonctions PURES (tests/fileAttente/fileAttente.test.js) + l'état courant du mode
   (posé par MedReviseApp.jsx à chaque rechargement). Il n'importe rien de planning.js : la date de base lui est
   toujours passée en argument (pas d'import circulaire, pas de second calcul).
   ============================================================ */
import { ajouterJours, ecartJours, jourDeRevision } from '../scheduler/jours.js';

export const CLE_FILE = 'fileAttente';
/** seuil de l'alerte orange (« Pense à rattraper avant les examens ») */
export const SEUIL_ALERTE = 5;

export const ETAT_INACTIF = Object.freeze({ actif: false, pauses: Object.freeze([]), activeLe: null, verifieJusquau: null });

const estJourIso = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** enregistrement brut (ou absent) → état valide : pauses triées, uniques, jours valides */
export function normaliserEtat(brut) {
  if (!brut || brut.actif !== true) return ETAT_INACTIF;
  const pauses = [...new Set((brut.pauses || []).filter(estJourIso))].sort();
  return { actif: true, pauses, activeLe: estJourIso(brut.activeLe) ? brut.activeLe : null, verifieJusquau: estJourIso(brut.verifieJusquau) ? brut.verifieJusquau : null };
}

/* ---- état courant du mode (une seule instance, lue par planning.js dateEffective) ---- */
let courant = ETAT_INACTIF;
let version = 0;
export const etatFile = () => courant;
/** n° qui change à chaque nouvel état (dépendance des calculs mémorisés de l'interface) */
export const versionFile = () => version;
export function definirEtatFile(brut) {
  const e = normaliserEtat(brut);
  const meme = e.actif === courant.actif && e.pauses.join() === courant.pauses.join();
  courant = e;
  if (!meme) version++;
  return e;
}

/** seules les flashcards de la méthode des J sont concernées (la séance du jour) */
const concernee = (q) => !!q && q.type === 'flashcard';

/** jour de la DERNIÈRE révision d'une carte : dernière note (`historique[].date`) ou passage en révision
 *  (`nouvellePasseeLe`) — le plus récent des deux ; null si aucun (carte jamais revue). */
export function jourDerniereRevision(q) {
  let j = null;
  for (const h of (q && q.historique) || []) if (h && h.qualite != null && estJourIso(h.date) && (!j || h.date > j)) j = h.date;
  if (q && estJourIso(q.nouvellePasseeLe) && (!j || q.nouvellePasseeLe > j)) j = q.nouvellePasseeLe;
  return j;
}

/** nombre de jours en pause qui décalent cette carte (STRICTEMENT après sa dernière révision) */
export function decalageCarte(q, pauses) {
  if (!pauses || !pauses.length) return 0;
  const der = jourDerniereRevision(q);
  if (!der) return pauses.length;
  let n = 0;
  for (const p of pauses) if (p > der) n++;
  return n;
}

/** LA règle : date de base + jours en pause après la dernière révision. `base` = planning.js dateBase(q). */
export function appliquerDecalage(q, base, etat = courant) {
  if (base == null || !etat || !etat.actif || !etat.pauses.length || !concernee(q)) return base;
  const n = decalageCarte(q, etat.pauses);
  return n ? ajouterJours(base, n) : base;
}

/** « aujourd'hui » du mode : la journée de révision (bascule à 4 h, Europe/Brussels) */
export const jourFile = (maintenant = new Date()) => jourDeRevision(maintenant);

/** cartes qui comptent pour les jours en pause : flashcards datées (pas Nouvelles, pas terminées) */
const datee = (q, dateBase) => concernee(q) && dateBase(q) != null;

/**
 * CLÔTURE DES JOURNÉES TERMINÉES (à chaque ouverture, après la synchro). Pour chaque journée depuis la dernière
 * vérification (jamais aujourd'hui, jamais avant l'activation), dans l'ordre : si des cartes étaient dues ce jour-là
 * selon dateEffective (pauses déjà connues) et ne sont pas toutes passées, ce jour devient un jour en pause.
 * Puis les jours en pause qui ne décalent plus aucune carte sont retirés. Déterministe et idempotent : même état
 * des cartes → même résultat, quel que soit le nombre d'ouvertures ou d'appareils.
 * @param cartes    flashcards des fiches planifiées
 * @param dateBase  planning.js dateBase
 * @param aujourdhui journée de révision en cours (jourFile())
 * → { etat, change, ajoutes: [jours], retires: [jours] }
 */
export function cloturerJours(etat, cartes, dateBase, aujourdhui) {
  const e = normaliserEtat(etat);
  if (!e.actif) return { etat: e, change: false, ajoutes: [], retires: [] };
  const hier = ajouterJours(aujourdhui, -1);
  const debut = e.verifieJusquau ? ajouterJours(e.verifieJusquau, 1) : (e.activeLe || aujourdhui);
  const pauses = new Set(e.pauses);
  const ajoutes = [];
  const liste = (cartes || []).filter((q) => datee(q, dateBase));
  // au plus 400 jours d'un coup (garde-fou : un appareil resté fermé plus d'un an reprend sans boucle infinie)
  for (let d = debut, k = 0; d <= hier && k < 400; d = ajouterJours(d, 1), k++) {
    if (pauses.has(d)) continue;
    const et = { actif: true, pauses: [...pauses].sort() };
    const dues = liste.some((q) => q.skippedOn !== d && appliquerDecalage(q, dateBase(q), et) === d);
    if (dues) { pauses.add(d); ajoutes.push(d); }
  }
  const avantElagage = [...pauses].sort();
  const gardes = elaguer(avantElagage, liste);
  const retires = avantElagage.filter((p) => !gardes.includes(p));
  const verifieJusquau = !e.verifieJusquau || hier > e.verifieJusquau ? hier : e.verifieJusquau;
  const suivant = { ...e, pauses: gardes, verifieJusquau };
  const change = suivant.pauses.join() !== e.pauses.join() || suivant.verifieJusquau !== e.verifieJusquau;
  return { etat: suivant, change, ajoutes, retires };
}

/** jours en pause qui décalent encore au moins une carte datée (les autres sont retirés) */
export function elaguer(pauses, cartesDatees) {
  if (!pauses.length) return [];
  // le plus ANCIEN jour de dernière révision suffit : une pause le décale si elle est après lui
  let plusVieux; let jamais = false;
  for (const q of cartesDatees) {
    const d = jourDerniereRevision(q);
    if (!d) { jamais = true; break; }
    if (!plusVieux || d < plusVieux) plusVieux = d;
  }
  if (jamais) return pauses.slice();
  if (!plusVieux) return [];
  return pauses.filter((p) => p > plusVieux);
}

/** décalage affiché = nombre de jours en pause qui décalent encore au moins une carte */
export function decalageAffiche(etat, cartes, dateBase) {
  const e = normaliserEtat(etat);
  if (!e.actif) return 0;
  return elaguer(e.pauses, (cartes || []).filter((q) => datee(q, dateBase))).length;
}

/* ---- ACTIVATION ---- */

/** date de reprise proposée = date de base du plus vieux retard (hors Nouvelles) ; null s'il n'y a aucun retard */
export function plusVieuxRetard(cartes, dateBase, aujourdhui) {
  let min = null;
  for (const q of cartes || []) {
    if (!datee(q, dateBase)) continue;
    const d = dateBase(q);
    if (d < aujourdhui && q.skippedOn !== aujourdhui && (!min || d < min)) min = d;
  }
  return min;
}

/** jours en pause créés par l'activation : de la date de reprise choisie jusqu'à hier inclus */
export function pausesActivation(reprise, aujourdhui) {
  const out = [];
  if (!estJourIso(reprise) || reprise >= aujourdhui) return out;
  for (let d = reprise; d < aujourdhui; d = ajouterJours(d, 1)) out.push(d);
  return out;
}

/** état écrit au bouton « Activer » */
export function etatActivation(reprise, aujourdhui) {
  return { actif: true, pauses: pausesActivation(reprise, aujourdhui), activeLe: aujourdhui, verifieJusquau: ajouterJours(aujourdhui, -1) };
}

/** jours de décalage d'une date de reprise (la phrase « → N j de décalage ») */
export const joursDecalage = (reprise, aujourdhui) => (estJourIso(reprise) && reprise < aujourdhui ? ecartJours(reprise, aujourdhui) : 0);

/**
 * APERÇU des 7 prochains jours (en supposant que tout est fait chaque jour) : Retard / Révisions / Total.
 * `dateDe(q)` = la date effective à prévisualiser (planning.js dateEffective avec l'état candidat).
 * Jour 0 : Retard = date < aujourd'hui ; ensuite le retard est supposé fait (0).
 */
export function apercu7Jours(cartes, dateDe, aujourdhui, n = 7) {
  const lignes = [];
  const dates = (cartes || []).filter(concernee).map((q) => [q, dateDe(q)]).filter(([, d]) => d != null);
  for (let k = 0; k < n; k++) {
    const jour = ajouterJours(aujourdhui, k);
    let retard = 0, revisions = 0;
    for (const [q, d] of dates) {
      if (k === 0 && q.skippedOn === jour) continue;
      if (d === jour) revisions++;
      else if (k === 0 && d < jour) retard++;
    }
    lignes.push({ jour, retard, revisions, total: retard + revisions });
  }
  return lignes;
}

/* ---- FAIRE LE PAQUET SUIVANT ---- */

/** retire le jour en pause le plus récent (les cartes du jour suivant arrivent tout de suite) */
export function retirerDernierePause(etat) {
  const e = normaliserEtat(etat);
  if (!e.actif || !e.pauses.length) return e;
  return { ...e, pauses: e.pauses.slice(0, -1) };
}

/** le bouton « Faire le paquet suivant » : Retard + Révisions du jour finies ET décalage > 0 */
export const paquetSuivantVisible = (cats, decalage) => decalage > 0 && !cats.retard.length && !cats.revisions.length;

/* ---- DÉSACTIVATION ---- */

/** nombre de cartes qui repassent en retard si l'on désactive (en retard sans le mode, pas avec) */
export function cartesQuiRepassentEnRetard(cartes, dateBase, etat, aujourdhui) {
  let n = 0;
  for (const q of cartes || []) {
    if (!datee(q, dateBase) || q.skippedOn === aujourdhui) continue;
    const b = dateBase(q);
    if (b < aujourdhui && appliquerDecalage(q, b, etat) >= aujourdhui) n++;
  }
  return n;
}

/* ---- ORDRE DE PASSAGE (mode actif seulement) ---- */

/** départage des cartes d'une même date effective : la date de base la plus ancienne d'abord (les cartes d'une
 *  journée non finie arrivent le lendemain en premier). null quand le mode est inactif (ordre actuel inchangé). */
export function departageFile(dateBase, etat = courant) {
  return etat && etat.actif && etat.pauses.length ? (q) => dateBase(q) || '' : null;
}
