/* ============================================================
   MedRevise — JOURNAL DES RÉVISIONS : stockage local (étape 2 FSRS).
   - store IndexedDB NEUF `medrevise-review_log` : une entrée par réponse, jamais modifiée ;
   - store NEUF `medrevise-review_log_outbox` : ids en attente d'envoi au cloud (file hors ligne) ;
   - HORS de la synchro générale (SYNCABLE / medrevise_records, lib/storage.js) : elle n'est pas
     modifiée ; le journal a son propre canal, ./synchro.js, vers la table `medrevise_review_log`.
   Toute réponse à une flashcard est journalisée, interrupteur FSRS ON ou OFF.
   ============================================================ */
import { get, set, values, keys, del, setMany, createStore } from 'idb-keyval';

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
const prevenir = () => abonnes.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } });

/** ajoute une entrée (immuable) + la met en file d'envoi. Une entrée déjà présente est ignorée. */
export async function ajouterAuJournal(entree) {
  if (!entree || !entree.id) return false;
  if (await get(entree.id, S_JOURNAL)) return false;
  await set(entree.id, entree, S_JOURNAL);
  await set(entree.id, { id: entree.id, depuis: new Date().toISOString() }, S_ENVOI);
  prevenir();
  return true;
}

/** entrées reçues du cloud : écrites si absentes, jamais mises en file d'envoi */
export async function integrerEntrees(entrees) {
  const connus = new Set(await keys(S_JOURNAL));
  const neuves = (entrees || []).filter((e) => e && e.id && !connus.has(e.id) && (connus.add(e.id), true));
  if (neuves.length) { await setMany(neuves.map((e) => [e.id, e]), S_JOURNAL); prevenir(); }
  return neuves;
}

export const toutLeJournal = async () => (await values(S_JOURNAL)) || [];
export async function journalDeCarte(cardId) { return (await toutLeJournal()).filter((e) => e.card_id === cardId); }
export async function compteJournal() { return ((await keys(S_JOURNAL)) || []).length; }
export async function idsEnAttente() { return ((await keys(S_ENVOI)) || []).map(String); }
export async function entreesEnAttente() {
  const ids = await idsEnAttente();
  const out = [];
  for (const id of ids) { const e = await get(id, S_JOURNAL); if (e) out.push(e); else await del(id, S_ENVOI); }
  return out;
}
export async function marquerEnvoyees(ids) { for (const id of ids) await del(id, S_ENVOI); prevenir(); }
