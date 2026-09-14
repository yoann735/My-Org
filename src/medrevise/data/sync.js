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
import { get, set, del, keys, entries, delMany, createStore } from 'idb-keyval';
import { supabase, SYNC_ENABLED, RECORDS_TABLE, BLOBS_BUCKET } from './supabaseClient.js';

const outboxStore = createStore('medrevise-outbox', 'v1');

const PUSH_DEBOUNCE_MS = 800;
let pushTimer = null;
let flushing = null; // Promise en vol — évite deux flush concurrents lisant le même snapshot

/* ============================================================
   ÉCRITURE CLOUD CONDITIONNELLE (lot 1, docs/audit-sync-J-2026.md §1 « C1 »).

   LE défaut de fond de la synchro : `upsert` écrase la ligne cloud quoi qu'elle
   contienne — updated_at COMPRIS, qu'il fait donc reculer. Une entrée d'outbox
   rejouée six heures plus tard détruisait ainsi les révisions faites entre-temps
   sur un autre appareil. Le LWW n'existait qu'à la LECTURE (storage.js
   reconcileAll), jamais à l'écriture, et aucun garde-fou ne vivait côté serveur.

   Correctif : passer par la fonction `medrevise_push(records jsonb)`, qui fait
   `on conflict do update … where excluded.updated_at > mr.updated_at`. Une
   écriture périmée est REFUSÉE PAR LA BASE, pas arbitrée par le client. Voir le
   script SQL dans MEDREVISE_SUPABASE_SYNC.md — il doit être exécuté une fois
   dans le SQL Editor Supabase.

   Ceci neutralise aussi « C3 » (l'outbox rejouée AVANT reconcileAll) : une
   entrée périmée qui part en premier est désormais simplement rejetée, l'ordre
   n'a plus d'importance.

   MODE DÉGRADÉ : tant que le script SQL n'est pas exécuté, la RPC n'existe pas.
   Plutôt que de casser la synchro (rien ne partirait) ou de laisser croire que
   tout va bien, on retombe sur l'ancien `upsert` ET on lève un drapeau lu par
   l'UI (syncStatusLabel) — l'utilisateur voit explicitement que le socle
   manque. Le drapeau est remis à zéro à chaque flushOutbox() (boot, « Forcer la
   synchro ») : dès que le SQL est appliqué, l'app repasse toute seule en mode
   conditionnel, sans rechargement.
   ============================================================ */
const RPC_PUSH = 'medrevise_push';
let rpcAbsente = false;

/** true si le dernier envoi est passé par l'ancien `upsert` faute de RPC. */
export function isPushDegraded() { return rpcAbsente; }

/** RPC introuvable (script SQL pas encore exécuté) — à distinguer d'un simple
 *  échec réseau, qui lui ne doit SURTOUT pas déclencher le repli permanent. */
function rpcIntrouvable(error) {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '');
  return code === 'PGRST202' || code === '404'
    || /could not find the function/i.test(msg)
    || /function .* does not exist/i.test(msg);
}

/** Envoie un lot au cloud. Renvoie true seulement si la base l'a réellement
 *  accepté — même piège que partout ici : supabase-js NE REJETTE PAS sur un
 *  échec réseau, il résout avec `{ error }` renseigné. */
async function pushRecords(batch) {
  if (!rpcAbsente) {
    const { error } = await supabase.rpc(RPC_PUSH, { records: batch });
    if (!error) return true;
    if (!rpcIntrouvable(error)) return false; // vrai échec (réseau, 5xx) → on garde l'outbox
    rpcAbsente = true; // socle SQL absent → repli signalé, une seule fois
  }
  const { error } = await supabase.from(RECORDS_TABLE).upsert(batch, { onConflict: 'store,record_id' });
  return !error;
}

/** Met en file un enregistrement à pousser (débounce ~800 ms, comme MealWeek) —
 *  persisté immédiatement dans l'outbox IndexedDB (clé `${store}:${id}`, donc une
 *  même entrée réécrite avant le flush remplace la précédente, jamais de doublon),
 *  donc survit à un onglet fermé/tué avant que le debounce n'ait eu le temps de partir. */
export function queuePush(store, id, data, updatedAt, deleted = false) {
  if (!SYNC_ENABLED) return;
  const key = store + ':' + id;
  set(key, { store, record_id: id, data, updated_at: updatedAt, deleted }, outboxStore)
    .then(() => { outboxOuvert = true; })
    .catch(() => { /* écriture outbox best-effort ; en pire cas, pas pire qu'avant l'outbox */ });
  clearTimeout(pushTimer);
  pushTimer = setTimeout(flushPending, PUSH_DEBOUNCE_MS);
}

/* ============================================================
   JAMAIS D'OUVERTURE DE BASE PENDANT LA FERMETURE DE LA PAGE.
   Constaté (étape 5, reproduit aussi sur le code d'avant) : sur un appareil qui
   n'a encore jamais synchronisé, recharger ou quitter la page juste après l'avoir
   ouverte faisait CRÉER la base `medrevise-outbox` depuis le gestionnaire
   `pagehide`/`visibilitychange` — en pleine destruction de la page. Chrome
   laisse alors cette création suspendue, et TOUTE ouverture ultérieure de la base
   attend indéfiniment : l'app reste bloquée sur « Chargement de MedRevise ».
   Règle : un vidage déclenché par la fermeture n'ouvre une outbox que si la page
   l'a DÉJÀ ouverte normalement. On ne perd rien : s'il n'a jamais été ouvert dans
   cette session, rien n'y a été ajouté depuis le dernier démarrage, et ce qui y
   dort sera rejoué au prochain boot.
   ============================================================ */
let outboxOuvert = false;

/** Vide l'outbox vers Supabase : ne retire QUE les entrées confirmées par l'upsert —
 *  un échec (hors-ligne, etc.) laisse tout en place pour le prochain déclencheur
 *  (debounce, pagehide/visibilitychange, reconnexion réseau, ou prochain boot). */
async function flushPending({ depuisFermeture = false } = {}) {
  if (!SYNC_ENABLED) return;
  if (depuisFermeture && !outboxOuvert) return; // voir « JAMAIS D'OUVERTURE… » ci-dessus
  if (flushing) return flushing; // un flush déjà en vol suffit — l'outbox reste la source de vérité
  flushing = (async () => {
    try {
      const snapshot = await entries(outboxStore); // [[clé, valeur], ...] — pris AVANT l'appel réseau
      outboxOuvert = true;
      if (!snapshot.length) return;
      const batch = snapshot.map(([, v]) => v);
      // pushRecords (ci-dessus) passe par la RPC conditionnelle et vérifie `error`
      // explicitement — supabase-js NE REJETTE PAS sur un échec réseau (DNS,
      // offline, 5xx), il résout avec `{ error }` renseigné. Sans cette
      // vérification, un échec passerait pour un succès et l'entrée serait
      // retirée de l'outbox pour rien.
      const parti = await pushRecords(batch);
      if (!parti) throw new Error('push refusé');
      // NB : une entrée REJETÉE par la condition (updated_at pas plus récent que
      // le cloud) compte comme partie — c'est le comportement voulu. Elle a été
      // examinée par la base et volontairement écartée ; la garder dans l'outbox
      // la ferait rejouer indéfiniment sans jamais pouvoir gagner.
      await delMany(snapshot.map(([k]) => k), outboxStore); // retire SEULEMENT ce qui a été envoyé
    } catch (e) { /* hors-ligne : tout reste dans l'outbox, repoussé au prochain déclencheur */ }
    finally { flushing = null; }
  })();
  return flushing;
}

/** Nombre d'écritures locales encore EN ATTENTE d'envoi. Lecture seule, sert à
 *  l'indicateur de synchro (lib/syncStatus.js) : tant que ce nombre n'est pas nul,
 *  l'appareil a du retard à pousser, même si sa comparaison avec le cloud semble
 *  bonne par ailleurs. 0 si la synchro n'est pas configurée (rien ne s'accumule). */
export async function outboxCount() {
  if (!SYNC_ENABLED) return 0;
  try { return ((await keys(outboxStore)) || []).length; } catch (e) { return 0; }
}

/** Rejoue l'outbox laissée par une session précédente (app tuée avant tout flush, pas
 *  juste mise en arrière-plan). À appeler au boot, AVANT reconcileAll() — voir le
 *  commentaire d'en-tête sur l'ordre. */
export function flushOutbox() {
  // remet le mode conditionnel à l'essai : si le script SQL vient d'être exécuté
  // dans Supabase, l'app repasse d'elle-même en écriture conditionnelle au
  // prochain boot ou au bouton « Forcer la synchro », sans rechargement.
  rpcAbsente = false;
  return flushPending();
}

// Flush best-effort à la mise en arrière-plan (pagehide) et quand l'onglet devient
// invisible (verrouillage écran, changement d'app mobile) — en plus du debounce et du
// rejeu au boot. Fire-and-forget : ne bloque jamais la fermeture, l'outbox persistée
// garantit le rattrapage plus tard si l'appel n'aboutit pas à temps.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { flushPending({ depuisFermeture: true }); });
  document.addEventListener('visibilitychange', () => {
    const cache = document.visibilityState === 'hidden';
    if (cache) flushPending({ depuisFermeture: true });
    // blobs : on retente dans les deux sens (retour sur l'onglet = souvent retour du réseau)
    flushBlobOutbox({ depuisFermeture: cache }); // eslint-disable-line no-use-before-define
  });
  window.addEventListener('online', () => { flushBlobOutbox(); }); // eslint-disable-line no-use-before-define
}

/* Taille de page. PostgREST plafonne TOUTE réponse à 1000 lignes par défaut
   (`content-range: 0-999/*`), sans erreur ni avertissement : la requête répond
   200 OK avec un jeu tronqué. C'était LE défaut corrigé ici. */
const PAGE = 1000;
/* Garde-fou anti-boucle. 200 pages = 200 000 enregistrements, très au-delà de tout
   usage réel : si on l'atteint, quelque chose ne va pas (curseur qui n'avance
   pas, ordre instable) et il vaut mieux échouer franchement que boucler. */
const MAX_PAGES = 200;

/**
 * Récupère TOUS les enregistrements cloud, en paginant.
 *
 * HISTORIQUE — pourquoi cette fonction est critique (voir docs/audit-sync-J-2026.md) :
 * elle faisait un `select()` nu, donc plafonné à 1000 lignes par PostgREST. Au-delà
 * de ce volume, `reconcileAll` (lib/storage.js) ne voyait qu'une fraction du cloud,
 * avec deux conséquences graves :
 *   - un enregistrement local dont la ligne cloud était hors fenêtre passait pour
 *     « absent du cloud » et était repoussé avec son horodatage périmé — rejeté
 *     depuis par l'écriture conditionnelle, d'où des appareils définitivement figés ;
 *   - les enregistrements cloud hors fenêtre n'étaient JAMAIS rapatriés.
 * Et surtout, l'état local incomplet qui en résultait faisait passer des cartes
 * valides pour des orphelines auprès de migrateOrphanCleanupV1, qui les supprimait
 * en propageant des tombstones (95 cartes perdues le 25/08/2026 — migration
 * neutralisée depuis).
 *
 * DEUX RÈGLES À NE JAMAIS ASSOUPLIR ICI :
 *
 * 1. ORDRE TOTAL ET STABLE. On trie sur la clé primaire (store, record_id) : sans
 *    `order`, PostgREST ne garantit rien entre deux pages, et une ligne peut être
 *    sautée ou vue deux fois.
 *
 * 2. TOUT OU RIEN. La moindre page en erreur renvoie `null`, jamais un tableau
 *    partiel. Un résultat partiel est PIRE qu'une absence de résultat : `reconcileAll`
 *    le prendrait pour la vérité du cloud et en déduirait des absences imaginaires.
 *    `null` = « je n'ai pas pu lire », et reconcileAll ne fait alors rien du tout.
 *
 * @returns {Promise<Array|null>} tous les enregistrements, ou null si la lecture
 *   complète n'a pas pu aboutir (hors-ligne, non configuré, erreur, garde-fou).
 */
export async function pullAllRecords() {
  if (!SYNC_ENABLED) return null;
  try {
    const tout = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const from = page * PAGE;
      const { data, error } = await supabase
        .from(RECORDS_TABLE)
        .select('store,record_id,data,updated_at,deleted')
        .order('store', { ascending: true })
        .order('record_id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) return null;            // règle 2 : jamais de partiel
      const lot = data || [];
      tout.push(...lot);
      if (lot.length < PAGE) return tout; // dernière page : on a tout
    }
    return null;                          // garde-fou atteint : on échoue franchement
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
    // même chemin conditionnel que flushPending (pushRecords ci-dessus), et même
    // piège géré : supabase-js résout avec `{ error }` plutôt que de rejeter sur
    // un échec réseau — sinon migrate.js marquerait la migration "appliquée"
    // malgré un push raté.
    return await pushRecords(records);
  } catch (e) {
    return false;
  }
}

/* ============================================================
   OUTBOX DES BLOBS (PDF, HTML de cours, images) — étape 5.

   LE DÉFAUT CORRIGÉ. L'ancien pushBlob tentait l'envoi UNE fois, sans lire le
   résultat : supabase-js ne rejette pas sur un échec (réseau, 413, 5xx), il
   résout avec `{ error }`. Un PDF importé hors ligne ou sur un réseau qui coupe
   n'arrivait donc JAMAIS au cloud, sans que rien ne le signale — et l'autre
   appareil affichait « PDF introuvable » pour toujours.

   MÊME MODÈLE QUE L'OUTBOX DES ENREGISTREMENTS (plus haut) :
   - l'entrée est écrite dans un store IndexedDB dédié AVANT tout envoi, et
     ne disparaît qu'une fois l'upload CONFIRMÉ (pas d'`error`) ;
   - elle survit à un onglet fermé, à un crash, à un redémarrage ;
   - rejouée au boot, à la reconnexion, au retour sur l'onglet, et par un
     minuteur à délai croissant tant qu'il reste quelque chose à envoyer.
   Différence voulue : l'entrée ne contient PAS le fichier (déjà dans le store
   `medrevise-blobs`, relu au moment de l'envoi) — pas de doublon de 50 Mo.

   RÉÉCRITURE D'UN MÊME ID (auto-save du HTML de cours, storage.js#putBlobAt) :
   chaque écriture repose `queuedAt`. Un envoi ne retire l'entrée que si
   `queuedAt` n'a pas bougé entre-temps — sinon la version plus récente,
   écrite pendant l'upload, repart au tour suivant au lieu d'être oubliée.

   ÉCHEC DÉFINITIF (fichier refusé pour sa taille, 413) : réessayer toutes les
   5 minutes renverrait des dizaines de Mo pour rien. L'entrée est marquée
   `bloque`, sortie des essais automatiques, affichée dans l'indicateur de
   synchro, et retentée seulement par « Forcer la synchro ».
   ============================================================ */
const blobOutboxStore = createStore('medrevise-blob-outbox', 'v1');
// MÊME base/store que S.blobs de lib/storage.js (relu ici sans importer storage.js,
// voir le commentaire d'en-tête sur le cycle d'import).
const localBlobsStore = createStore('medrevise-blobs', 'v1');

const BLOB_RETRY_MS = [15e3, 30e3, 60e3, 120e3, 300e3];
let blobRetryTimer = null;
let blobRetryStep = 0;
let blobFlushing = null;
let blobSoonTimer = null;

const estTropGros = (error) => {
  const status = Number(error && (error.status || error.statusCode));
  return status === 413 || /too large|exceeded the maximum|payload/i.test(String((error && error.message) || ''));
};

/** Met un blob en file d'envoi (persisté AVANT de rendre la main) puis programme un
 *  envoi rapide. À appeler après chaque écriture locale d'un blob. */
let blobOutboxOuvert = false; // même règle que outboxOuvert (« JAMAIS D'OUVERTURE… »)

export async function queueBlobPush(id) {
  if (!SYNC_ENABLED || !id) return;
  await set(id, { id, queuedAt: new Date().toISOString(), attempts: 0 }, blobOutboxStore)
    .then(() => { blobOutboxOuvert = true; })
    .catch(() => { /* pire cas : rattrapé par l'audit (auditBlobs) */ });
  clearTimeout(blobSoonTimer);
  blobSoonTimer = setTimeout(() => { flushBlobOutbox(); }, 500);
}

function scheduleBlobRetry(apresEchec) {
  clearTimeout(blobRetryTimer);
  const delai = apresEchec ? BLOB_RETRY_MS[Math.min(blobRetryStep++, BLOB_RETRY_MS.length - 1)] : 0;
  if (!apresEchec) blobRetryStep = 0;
  blobRetryTimer = setTimeout(() => { flushBlobOutbox(); }, delai);
}

/** Envoie un blob. { ok } ou { ok: false, bloque, reseau, message }. */
async function uploadBlob(id, blob) {
  try {
    const { error } = await supabase.storage.from(BLOBS_BUCKET).upload(id, blob, { upsert: true, contentType: blob.type || undefined });
    if (!error) return { ok: true };
    const status = Number(error.status || error.statusCode) || 0;
    return { ok: false, bloque: estTropGros(error), reseau: !status, message: String(error.message || error) };
  } catch (e) {
    return { ok: false, bloque: false, reseau: true, message: String((e && e.message) || e) };
  }
}

/**
 * Vide l'outbox des blobs, un fichier à la fois (des PDF de plusieurs Mo en
 * parallèle satureraient une connexion mobile). Un seul vidage à la fois.
 * @param {{ inclureBloques?: boolean, depuisFermeture?: boolean }} opts —
 *   `inclureBloques` : « Forcer la synchro » retente aussi les fichiers bloqués ;
 *   `depuisFermeture` : appel depuis la fermeture/mise en arrière-plan de la page.
 * @returns {Promise<{ envoyes: number, echecs: number, restants: number }>}
 */
export function flushBlobOutbox({ inclureBloques = false, depuisFermeture = false } = {}) {
  if (!SYNC_ENABLED || (depuisFermeture && !blobOutboxOuvert)) return Promise.resolve({ envoyes: 0, echecs: 0, restants: 0 });
  if (blobFlushing) return blobFlushing;
  blobFlushing = (async () => {
    let envoyes = 0, echecs = 0;
    try {
      const snapshot = await entries(blobOutboxStore);
      blobOutboxOuvert = true;
      for (const [id, entry] of snapshot) {
        if (entry.bloque && !inclureBloques) continue;
        const blob = await get(id, localBlobsStore);
        if (!blob) { await del(id, blobOutboxStore); continue; } // plus rien à envoyer d'ici
        const r = await uploadBlob(id, blob);
        const cur = await get(id, blobOutboxStore);
        const inchange = cur && cur.queuedAt === entry.queuedAt;
        if (r.ok) {
          envoyes++;
          if (inchange) await del(id, blobOutboxStore); // réécrit pendant l'envoi → repart au tour suivant
        } else {
          echecs++;
          if (cur) {
            await set(id, {
              ...cur, attempts: (cur.attempts || 0) + 1, lastError: r.message, lastTryAt: new Date().toISOString(),
              bloque: r.bloque || undefined, taille: blob.size,
            }, blobOutboxStore);
          }
          if (r.reseau) break; // hors ligne : inutile d'enchaîner les autres fichiers
        }
      }
    } catch (e) { echecs++; /* IndexedDB indisponible : réessayé plus tard */ }
    const reste = ((await entries(blobOutboxStore).catch(() => [])) || []).filter(([, v]) => !v.bloque);
    if (reste.length) scheduleBlobRetry(echecs > 0);
    else { clearTimeout(blobRetryTimer); blobRetryStep = 0; }
    return { envoyes, echecs, restants: reste.length };
  })().finally(() => { blobFlushing = null; });
  return blobFlushing;
}

/** Contenu de l'outbox des blobs (lecture seule, pour l'indicateur de synchro). */
export async function blobOutboxEntries() {
  if (!SYNC_ENABLED) return [];
  try { return ((await entries(blobOutboxStore)) || []).map(([, v]) => v); } catch (e) { return []; }
}

/**
 * Noms de TOUS les blobs présents au cloud, en paginant. Même règle que
 * pullAllRecords : tout ou rien — `null` si une seule page échoue, jamais une
 * liste partielle (qui ferait croire à des absences et renverrait des Mo pour rien).
 * @returns {Promise<Set<string>|null>}
 */
export async function listCloudBlobs() {
  if (!SYNC_ENABLED) return null;
  const LIMIT = 1000;
  const noms = new Set();
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, error } = await supabase.storage.from(BLOBS_BUCKET)
        .list('', { limit: LIMIT, offset: page * LIMIT, sortBy: { column: 'name', order: 'asc' } });
      if (error || !Array.isArray(data)) return null;
      data.forEach((o) => { if (o && o.name) noms.add(o.name); });
      if (data.length < LIMIT) return noms;
    }
    return null;
  } catch (e) { return null; }
}

export async function pullBlob(id) {
  if (!SYNC_ENABLED || !id) return null;
  try {
    const { data, error } = await supabase.storage.from(BLOBS_BUCKET).download(id);
    return error ? null : data; // Blob
  } catch (e) { return null; }
}
