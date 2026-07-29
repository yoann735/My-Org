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

   OUTBOX (Phase B, audit-sync-mobile.md §3.2/§6 Risque 2) : la file d'envoi
   n'est plus une Map en mémoire mais un store IndexedDB dédié
   (`medrevise-outbox`, même convention de nommage que lib/storage.js, mais
   géré ICI pour ne pas créer de dépendance vers storage.js — voir ci-dessus).
   queuePush() y écrit avant de programmer le debounce ; flushPending() ne
   retire une entrée qu'une fois son upsert confirmé. Fermer l'onglet /
   verrouiller l'écran avant que le debounce parte ne perd donc plus rien :
   l'entrée survit au rechargement et est rejouée au prochain boot
   (flushOutbox(), appelé par MedReviseApp.jsx AVANT reconcileAll() — un
   tombstone jamais poussé n'est plus visible localement, donc reconcileAll
   ne peut pas le redécouvrir tout seul et réimporterait la version encore
   vivante côté cloud sans ce rejeu préalable).
   ============================================================ */
import { set, entries, delMany, createStore } from 'idb-keyval';
import { supabase, SYNC_ENABLED, RECORDS_TABLE, BLOBS_BUCKET } from './supabaseClient.js';

const outboxStore = createStore('medrevise-outbox', 'v1');

const PUSH_DEBOUNCE_MS = 800;
let pushTimer = null;
let flushing = null; // Promise en vol — évite deux flush concurrents lisant le même snapshot

/** Met en file un enregistrement à pousser (débounce ~800 ms, comme MealWeek) —
 *  persisté immédiatement dans l'outbox IndexedDB (clé `${store}:${id}`, donc une
 *  même entrée réécrite avant le flush remplace la précédente, jamais de doublon),
 *  donc survit à un onglet fermé/tué avant que le debounce n'ait eu le temps de partir. */
export function queuePush(store, id, data, updatedAt, deleted = false) {
  if (!SYNC_ENABLED) return;
  const key = store + ':' + id;
  set(key, { store, record_id: id, data, updated_at: updatedAt, deleted }, outboxStore)
    .catch(() => { /* écriture outbox best-effort ; en pire cas, pas pire qu'avant l'outbox */ });
  clearTimeout(pushTimer);
  pushTimer = setTimeout(flushPending, PUSH_DEBOUNCE_MS);
}

/** Vide l'outbox vers Supabase : ne retire QUE les entrées confirmées par l'upsert —
 *  un échec (hors-ligne, etc.) laisse tout en place pour le prochain déclencheur
 *  (debounce, pagehide/visibilitychange, reconnexion réseau, ou prochain boot). */
async function flushPending() {
  if (!SYNC_ENABLED) return;
  if (flushing) return flushing; // un flush déjà en vol suffit — l'outbox reste la source de vérité
  flushing = (async () => {
    try {
      const snapshot = await entries(outboxStore); // [[clé, valeur], ...] — pris AVANT l'appel réseau
      if (!snapshot.length) return;
      const batch = snapshot.map(([, v]) => v);
      // supabase-js NE REJETTE PAS sur un échec réseau (DNS, offline, 5xx) — l'appel
      // se résout normalement avec `{ error }` renseigné. Un simple try/catch ne
      // suffit donc pas : il faut vérifier `error` explicitement, sinon un échec est
      // pris pour un succès et l'entrée est retirée de l'outbox pour rien.
      const { error } = await supabase.from(RECORDS_TABLE).upsert(batch, { onConflict: 'store,record_id' });
      if (error) throw error;
      await delMany(snapshot.map(([k]) => k), outboxStore); // retire SEULEMENT ce qui a été envoyé
    } catch (e) { /* hors-ligne : tout reste dans l'outbox, repoussé au prochain déclencheur */ }
    finally { flushing = null; }
  })();
  return flushing;
}

/** Rejoue l'outbox laissée par une session précédente (app tuée avant tout flush, pas
 *  juste mise en arrière-plan). À appeler au boot, AVANT reconcileAll() — voir le
 *  commentaire d'en-tête sur l'ordre. */
export function flushOutbox() {
  return flushPending();
}

// Flush best-effort à la mise en arrière-plan (pagehide) et quand l'onglet devient
// invisible (verrouillage écran, changement d'app mobile) — en plus du debounce et du
// rejeu au boot. Fire-and-forget : ne bloque jamais la fermeture, l'outbox persistée
// garantit le rattrapage plus tard si l'appel n'aboutit pas à temps.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { flushPending(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPending();
  });
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

/**
 * Pousse un lot d'enregistrements IMMÉDIATEMENT (awaited), en dehors de l'outbox/
 * debounce habituel — réservé aux migrations de nettoyage ponctuelles et critiques
 * (lib/migrate.js) où il faut savoir si le push a RÉELLEMENT abouti avant de marquer
 * l'opération comme terminée (elles gèrent leur propre retry via le marqueur de
 * migration, pas besoin de transiter par l'outbox).
 * @returns {boolean} true si le lot est parti (ou si la sync est désactivée — rien à
 *   pousser), false si le push a échoué (à réessayer par l'appelant).
 */
export async function pushTombstonesNow(records) {
  if (!SYNC_ENABLED) return true;
  if (!records || !records.length) return true;
  try {
    // même piège que flushPending (voir plus haut) : supabase-js résout avec
    // `{ error }` plutôt que de rejeter sur un échec réseau — vérifié explicitement,
    // sinon migrate.js marquerait la migration "appliquée" malgré un push raté.
    const { error } = await supabase.from(RECORDS_TABLE).upsert(records, { onConflict: 'store,record_id' });
    if (error) return false;
    return true;
  } catch (e) {
    return false;
  }
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
