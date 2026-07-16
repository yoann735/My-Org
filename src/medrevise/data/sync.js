/* ============================================================
   MedRevise — moteur de synchro cloud (primitives pures, aucune dépendance
   vers storage.js pour éviter un cycle d'import : storage.js orchestre,
   ce module ne fait que parler à Supabase).

   Modèle : UNE table générique `medrevise_records` (store, record_id, data
   jsonb, updated_at, deleted) — un enregistrement par (store, id), tous
   stores IndexedDB confondus. Conflits résolus en LAST-WRITE-WINS par
   enregistrement (comparaison des `updated_at`), à la charge de l'appelant
   (storage.js) qui connaît l'état local. Hors-ligne / non configuré →
   toutes les fonctions échouent silencieusement (retournent null/no-op).
   ============================================================ */
import { supabase, SYNC_ENABLED, RECORDS_TABLE, BLOBS_BUCKET } from './supabaseClient.js';

const PUSH_DEBOUNCE_MS = 800;
let pushTimer = null;
const pending = new Map(); // `${store}:${id}` -> { store, record_id, data, updated_at, deleted }

/** Met en file un enregistrement à pousser (débounce ~800 ms, comme MealWeek). */
export function queuePush(store, id, data, updatedAt, deleted = false) {
  if (!SYNC_ENABLED) return;
  pending.set(store + ':' + id, { store, record_id: id, data, updated_at: updatedAt, deleted });
  clearTimeout(pushTimer);
  pushTimer = setTimeout(flushPending, PUSH_DEBOUNCE_MS);
}

async function flushPending() {
  if (!SYNC_ENABLED || pending.size === 0) return;
  const batch = [...pending.values()];
  pending.clear();
  try {
    await supabase.from(RECORDS_TABLE).upsert(batch, { onConflict: 'store,record_id' });
  } catch (e) { /* hors-ligne : reste en IndexedDB, repoussé au prochain changement/reconcile */ }
}

/** Récupère TOUS les enregistrements cloud (dataset personnel ≈ petit — un fetch
 *  complet par réconciliation, comme MealWeek). null si hors-ligne/non configuré. */
export async function pullAllRecords() {
  if (!SYNC_ENABLED) return null;
  try {
    const { data, error } = await supabase.from(RECORDS_TABLE).select('store,record_id,data,updated_at,deleted');
    if (error) return null;
    return data || [];
  } catch (e) { return null; }
}

export async function pushBlob(id, blob) {
  if (!SYNC_ENABLED || !blob) return;
  try { await supabase.storage.from(BLOBS_BUCKET).upload(id, blob, { upsert: true, contentType: blob.type || undefined }); }
  catch (e) { /* best-effort : l'image reste dispo localement, resynchro pas automatique si échec */ }
}

export async function pullBlob(id) {
  if (!SYNC_ENABLED || !id) return null;
  try {
    const { data, error } = await supabase.storage.from(BLOBS_BUCKET).download(id);
    return error ? null : data; // Blob
  } catch (e) { return null; }
}
