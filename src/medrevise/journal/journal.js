/* ============================================================
   MedRevise — JOURNAL DES RÉVISIONS : stockage local (étape 2 FSRS).
   - store IndexedDB NEUF `medrevise-review_log` : une entrée par réponse, jamais modifiée ;
   - store NEUF `medrevise-review_log_outbox` : ids en attente d'envoi au cloud (file hors ligne) ;
   - HORS de la synchro générale (SYNCABLE / medrevise_records, lib/storage.js) : elle n'est pas
     modifiée ; le journal a son propre canal, ./synchro.js, vers la table `medrevise_review_log`.
   Toute réponse à une flashcard est journalisée, interrupteur FSRS ON ou OFF.
   ============================================================ */
import { get, set, values, keys, del, delMany, getMany, setMany, entries, createStore } from 'idb-keyval';
import { sansAnnulees } from '../lib/retourSeance.js';

const S_JOURNAL = createStore('medrevise-review_log', 'v1');
const S_ENVOI = createStore('medrevise-review_log_outbox', 'v1');
const CLE_APPAREIL = 'medrevise.appareil';

/** identifiant stable de cet appareil (localStorage), + libellé lisible */
export function appareil() {
  let id = null;
  try { id = localStorage.getItem(CLE_APPAREIL); } catch (e) { /* stockage indisponible */ }
  if (!id) {
    id = (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
    try { localStorage.setItem(CLE_APPAREIL, id); } catch (e) { /* ignore */ }
  }
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const type = /iPhone|Android.*Mobile/.test(ua) ? 'téléphone' : /iPad|Android/.test(ua) ? 'tablette' : 'ordinateur';
  return `${type}:${id.slice(0, 8)}`;
}

const abonnes = new Set();
export function surChangementJournal(fn) { abonnes.add(fn); return () => abonnes.delete(fn); }
/* (07/11) les abonnés reçoivent les entrées NOUVELLES (ajout local ou reçues du cloud) — [] quand rien n'est ajouté
   (file d'envoi vidée) : le compteur de vues (lib/vuesCartes.js) se met à jour sans relire tout le journal. */
const prevenir = (neuves = []) => abonnes.forEach((fn) => { try { fn(neuves); } catch (e) { /* ignore */ } });

/** ajoute une entrée (immuable) + la met en file d'envoi. Une entrée déjà présente est ignorée. */
export async function ajouterAuJournal(entree) {
  if (!entree || !entree.id) return false;
  if (await get(entree.id, S_JOURNAL)) return false;
  await set(entree.id, entree, S_JOURNAL);
  await set(entree.id, { id: entree.id, depuis: new Date().toISOString() }, S_ENVOI);
  prevenir([entree]);
  return true;
}

/** entrées reçues du cloud : écrites si absentes, jamais mises en file d'envoi */
export async function integrerEntrees(entrees) {
  const connus = new Set(await keys(S_JOURNAL));
  const neuves = (entrees || []).filter((e) => e && e.id && !connus.has(e.id) && (connus.add(e.id), true));
  if (neuves.length) { await setMany(neuves.map((e) => [e.id, e]), S_JOURNAL); prevenir(neuves); }
  return neuves;
}

export const toutLeJournal = async () => (await values(S_JOURNAL)) || [];
/** (20/11) sans les entrées annulées (lib/retourSeance.js) : la reconstruction FSRS les ignore, comme le compteur de vues */
export async function journalDeCarte(cardId) { return sansAnnulees((await toutLeJournal()).filter((e) => e.card_id === cardId)); }
export async function compteJournal() { return ((await keys(S_JOURNAL)) || []).length; }
export async function idsEnAttente() { return ((await keys(S_ENVOI)) || []).map(String); }
export async function entreesEnAttente() {
  const ids = await idsEnAttente();
  const out = [];
  // (19/11) n'efface plus rien : une entrée de file sans entrée de journal (orpheline) est traitée par journal/synchro.js
  for (const id of ids) { const e = await get(id, S_JOURNAL); if (e) out.push(e); }
  return out;
}
/** (07/11) file d'envoi en LECTURE SEULE, pour la liste « N en attente » (lib/etatSynchro.js) :
 *  contrairement à entreesEnAttente, ne retire RIEN (même une entrée orpheline reste, signalée).
 *  (19/11) + tentatives et raison du dernier essai (journal/synchro.js noterTentatives).
 *  [{ id, depuis, carte, note, evenement, orpheline, tentatives, raison, derniereTentative }] */
export async function fileEnvoiLecture() {
  const out = [];
  try {
    for (const [id, v] of (await entries(S_ENVOI)) || []) {
      const e = await get(id, S_JOURNAL);
      out.push({
        id: String(id), depuis: (v && v.depuis) || (e && e.reviewed_at) || null, carte: (e && e.card_id) || null, note: e ? e.rating : null,
        evenement: (e && e.details && e.details.evenement) || null, orpheline: !e,
        tentatives: (v && v.tentatives) || 0, raison: (v && v.raison) || null, derniereTentative: (v && v.derniereTentative) || null,
      });
    }
  } catch (e) { /* base indisponible : liste vide, rien n'est conclu de plus */ }
  return out;
}

/* (19/11, docs/compte-rendu-74-en-attente.md) SORTIE DE FILE SUR PREUVE DU SERVEUR UNIQUEMENT.
   Ces fonctions ne touchent QUE la file d'envoi : l'entrée du journal elle-même n'est jamais modifiée ni retirée.
   C'est journal/synchro.js qui décide, après avoir RELU le serveur (lib/confirmationServeur.js). */

/** retire de la FILE les ids confirmés par le serveur (une transaction) — la donnée reste dans le journal */
export async function retirerDeLaFile(ids) {
  if (!ids || !ids.length) return 0;
  await delMany(ids, S_ENVOI);
  prevenir();
  return ids.length;
}

/** note un essai d'envoi resté sans confirmation : compteur de tentatives + raison en une ligne */
export async function noterTentatives(ids, raison) {
  if (!ids || !ids.length) return;
  const le = new Date().toISOString();
  for (const id of ids) {
    const v = await get(id, S_ENVOI);
    if (!v) continue; // sortie entre-temps : rien à noter
    await set(id, { ...v, id, tentatives: (v.tentatives || 0) + 1, raison: String(raison || '').slice(0, 200) || null, derniereTentative: le }, S_ENVOI);
  }
}

/** remet en file des entrées du journal présentes ICI et absentes du serveur (garde-fou de réconciliation) */
export async function remettreEnFile(ids) {
  const deja = new Set(await idsEnAttente());
  const neufs = (ids || []).filter((id) => !deja.has(String(id)));
  for (const id of neufs) await set(id, { id, depuis: new Date().toISOString(), tentatives: 0, raison: 'absente du serveur (trouvée par la réconciliation)' }, S_ENVOI);
  if (neufs.length) prevenir();
  return neufs.length;
}

export const idsJournalLocal = async () => ((await keys(S_JOURNAL)) || []).map(String);
export const lireEntrees = async (ids) => (await getMany(ids, S_JOURNAL)).filter(Boolean);
/** @deprecated (19/11) gardé pour compatibilité : retire de la file SANS preuve — plus appelé par la synchro */
export async function marquerEnvoyees(ids) { return retirerDeLaFile(ids); }
