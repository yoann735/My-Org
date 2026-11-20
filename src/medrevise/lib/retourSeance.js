/* ============================================================
   MedRevise — SÉANCE : PASSER, REVENIR EN ARRIÈRE, RENOTER (20/11/2026,
   docs/compte-rendu-seance-passer-precedente-et-formulaire-fc.md). Fonctions PURES (testées par vitest).

   Chaque carte traitée dans la séance laisse un ACTE dans l'état de la séance (`etat.actes[id]`, local à l'appareil) :
     { type: 'note' | 'passage' | 'garder' | 'skip', note, le (ISO de la notation d'origine), entreeId,
       touches: [champs modifiés par la notation], avant: { champ: valeur d'avant } }
   - 'skip' (Passer →) et 'garder' (Garder en nouvelle) n'écrivent RIEN : rien à annuler ;
   - 'note' / 'passage' : la carte a été écrite par le planificateur et une entrée ajoutée au journal.

   ANNULER une notation (renoter une carte précédente) :
   1. carte : les SEULS champs que la notation avait modifiés reprennent leur valeur d'avant (`restaurer`) — état FSRS,
      échéance, historique, intervalle… exactement comme avant ; ce qui a été fait ensuite sur la carte (étoile
      « À apprendre », carnet, modification du texte) est gardé ;
   2. journal (ajout seul, aucune ligne modifiée) : une ENTRÉE D'ANNULATION, rating null,
      details = { evenement: 'annulation', annule: <id de l'entrée annulée> } (même canal que les autres événements sans
      note : medrevise_review_log quand la migration 20261024 est appliquée, sinon le canal de repli des records) ;
   3. la nouvelle note est appliquée par le planificateur INCHANGÉ (scheduler/noter.js) à l'heure de la notation
      d'origine (`le`) : même résultat qu'une carte notée directement ainsi à ce moment.
   Tout ce qui lit le journal ignore les entrées annulées (`sansAnnulees`) : compteur de vues, reconstruction FSRS
   après réception, rapport du mode ombre.
   ============================================================ */
import { configPlanificateur, planificateurActif, VERSION_PLANIFICATEUR, VERSION_TS_FSRS } from '../scheduler/config.js';
import { jourDeRevision } from '../scheduler/jours.js';

export const EVENEMENT_ANNULATION = 'annulation';

const json = (v) => JSON.stringify(v === undefined ? null : v);
const copie = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/** champs modifiés par une notation (avant → après), hors champs d'affichage `_…` */
export function champsTouches(avant, apres) {
  const cles = new Set([...Object.keys(avant || {}), ...Object.keys(apres || {})]);
  return [...cles].filter((k) => !k.startsWith('_') && json((avant || {})[k]) !== json((apres || {})[k])).sort();
}

/** acte d'une carte écrite par le planificateur : de quoi la remettre exactement comme avant */
export function acteEcrit(type, carteAvant, carteApres, { note = null, le, entreeId }) {
  const touches = champsTouches(carteAvant, carteApres);
  const avant = {};
  touches.forEach((k) => { if (carteAvant[k] !== undefined) avant[k] = copie(carteAvant[k]); });
  return { type, note, le, entreeId, touches, avant };
}

/** acte sans écriture (Passer → / Garder en nouvelle) */
export const acteSansEcriture = (type, le = new Date().toISOString()) => ({ type, note: null, le, entreeId: null, touches: [], avant: {} });

export const estAnnulable = (acte) => !!acte && (acte.type === 'note' || acte.type === 'passage') && !!acte.entreeId;

/** la carte telle qu'avant la notation de l'acte (les autres champs : ceux de `carte`, la version actuelle) */
export function restaurer(carte, acte) {
  if (!carte || !estAnnulable(acte)) return carte;
  const out = { ...carte };
  (acte.touches || []).forEach((k) => { if (k in (acte.avant || {})) out[k] = copie(acte.avant[k]); else delete out[k]; });
  return out;
}

const uuid = () => (globalThis.crypto && globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); }));
const resume = (c) => ({ dueDate: c.dueDate == null ? null : c.dueDate, intervalDays: c.intervalDays == null ? null : c.intervalDays, termine: !!c.termine, fsrs: c.fsrs ? { ...c.fsrs, base: undefined } : null });

/** entrée d'annulation du journal (immuable, rating null) */
export function entreeAnnulation(carteActuelle, carteRestauree, acte, { reglages = null, maintenant = new Date(), appareil = null } = {}) {
  const config = configPlanificateur(reglages);
  return {
    id: uuid(), card_id: carteActuelle.id, rating: null,
    reviewed_at: maintenant.toISOString(), jour: jourDeRevision(maintenant, config.bascule, config.fuseau),
    device: appareil, scheduler_version: `${VERSION_PLANIFICATEUR}+ts-fsrs@${VERSION_TS_FSRS}`,
    planificateur: planificateurActif(reglages),
    state_before: resume(carteActuelle), state_after: resume(carteRestauree),
    details: { evenement: EVENEMENT_ANNULATION, annule: acte.entreeId, acte: acte.type, noteAnnulee: acte.note == null ? null : acte.note, le: acte.le },
  };
}

export const estAnnulation = (e) => !!e && e.details && e.details.evenement === EVENEMENT_ANNULATION && !!e.details.annule;

/** le journal sans les entrées annulées (les entrées d'annulation elles-mêmes restent : elles n'ont pas de note) */
export function sansAnnulees(entrees) {
  const annulees = new Set((entrees || []).filter(estAnnulation).map((e) => e.details.annule));
  return annulees.size ? (entrees || []).filter((e) => !(e && annulees.has(e.id))) : (entrees || []);
}

/** contribution d'un acte aux compteurs de la séance (`etat.faites`) */
export function contribution(acte) {
  const z = { revisions: 0, rates: 0, notees: 0, passees: 0, gardees: 0, sautees: 0 };
  if (!acte) return z;
  if (acte.type === 'note') return { ...z, revisions: 1, notees: 1, rates: acte.note === 1 ? 1 : 0 };
  if (acte.type === 'passage') return { ...z, revisions: 1, passees: 1 };
  if (acte.type === 'garder') return { ...z, revisions: 1, gardees: 1 };
  if (acte.type === 'skip') return { ...z, sautees: 1 };
  return z;
}

/** compteurs après remplacement de l'acte `ancien` par `nouveau` (ancien null : première fois) */
export function remplacerContribution(faites, ancien, nouveau) {
  const a = contribution(ancien), n = contribution(nouveau);
  const out = { ...faites };
  Object.keys(n).forEach((k) => { out[k] = Math.max(0, (out[k] || 0) - a[k] + n[k]); });
  return out;
}
