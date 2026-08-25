/* ============================================================
   MedRevise — INDICATEUR « à jour avec le cloud », vérifiable à l'œil nu.

   Le problème qu'il résout : compter ses cartes ne prouve RIEN. Deux appareils
   peuvent afficher 1111 chacun tout en détenant deux jeux différents — c'est
   exactement ce qui s'est produit le 25/08/2026 (voir docs/audit-sync-J-2026.md).
   Il fallait donc une comparaison réelle, et une valeur COMPARABLE ENTRE
   APPAREILS : si l'empreinte est la même sur les trois, ils sont identiques ;
   si elle diffère, l'un d'eux est en retard. Aucun comptage à la main.

   L'EMPREINTE. SHA-256 des triplets `store|id|updatedAt` de tous les
   enregistrements VIVANTS des stores syncables, triés. On garde les 12 premiers
   caractères hex : assez pour comparer d'un coup d'œil, assez large pour qu'une
   collision accidentelle soit hors de portée (2^48).

   Pourquoi `updatedAt` et pas le contenu : c'est précisément la valeur qui
   arbitre la réconciliation (storage.js reconcileAll). Deux appareils qui
   s'accordent sur (id, updatedAt) pour tout le jeu détiennent la même version de
   chaque enregistrement, par construction du protocole.

   LE PIÈGE, ET SA PARADE. Le local écrit `"2026-08-25T08:35:23.800Z"` tandis que
   PostgREST renvoie `"2026-08-25T08:35:23.8+00:00"` : même instant, deux
   écritures. Comparées brutes, TOUTES les lignes paraîtraient divergentes.
   D'où `normaliserDate()`, appliqué des DEUX côtés — ne jamais l'enlever d'un
   seul côté.

   Les tombstones sont ignorés : le local n'en garde pas trace (reconcileAll fait
   un `del`), les compter d'un côté seulement fausserait tout.

   STRICTEMENT EN LECTURE. Aucune écriture IndexedDB, aucune écriture cloud,
   aucune synchro déclenchée. Le seul appel réseau est le `pullAllRecords()` de
   lecture, celui-là même que fait la réconciliation.
   ============================================================ */
import { SYNCABLE_STORES, getAll } from './storage.js';
import { pullAllRecords, outboxCount } from '../data/sync.js';
import { SYNC_ENABLED } from '../data/supabaseClient.js';

/** Date -> forme canonique unique. Voir « LE PIÈGE » ci-dessus. */
function normaliserDate(v) {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

async function empreinte(lignes) {
  const octets = new TextEncoder().encode(lignes.join('\n'));
  const buf = await crypto.subtle.digest('SHA-256', octets);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
}

/** Photographie de CET appareil. Lecture IndexedDB seule. */
export async function etatLocal() {
  const lignes = [];
  const parStore = {};
  for (const nom of SYNCABLE_STORES) {
    const recs = (await getAll(nom)) || [];
    parStore[nom] = recs.length;
    for (const r of recs) {
      if (!r || !r.id) continue;
      lignes.push(nom + '|' + r.id + '|' + normaliserDate(r.updatedAt));
    }
  }
  lignes.sort();
  return { n: lignes.length, parStore, hash: await empreinte(lignes), lignes };
}

/** Photographie du CLOUD. null si la lecture complète échoue — jamais un
 *  résultat partiel (pullAllRecords applique déjà la règle du tout ou rien). */
export async function etatCloud() {
  const rows = await pullAllRecords();
  if (rows === null) return null;
  const lignes = [];
  const parStore = {};
  for (const r of rows) {
    if (r.deleted || !SYNCABLE_STORES.includes(r.store)) continue;
    parStore[r.store] = (parStore[r.store] || 0) + 1;
    lignes.push(r.store + '|' + r.record_id + '|' + normaliserDate(r.updated_at));
  }
  lignes.sort();
  return { n: lignes.length, parStore, hash: await empreinte(lignes), lignes };
}

const cle = (l) => l.slice(0, l.lastIndexOf('|'));
const val = (l) => l.slice(l.lastIndexOf('|') + 1);

/**
 * Compare l'appareil au cloud.
 * @returns {Promise<object>} statut :
 *   'disabled' — synchro non configurée sur ce déploiement
 *   'offline'  — cloud illisible, on ne conclut rien (surtout pas « à jour »)
 *   'ajour'    — aucun écart ET outbox vide
 *   'ecart'    — au moins un écart, ou des écritures en attente
 */
export async function comparerAuCloud() {
  if (!SYNC_ENABLED) return { statut: 'disabled' };
  const local = await etatLocal();
  const enAttente = await outboxCount();
  const cloud = await etatCloud();
  if (!cloud) return { statut: 'offline', local, enAttente };

  const L = new Map(local.lignes.map((l) => [cle(l), val(l)]));
  const C = new Map(cloud.lignes.map((l) => [cle(l), val(l)]));

  let aTirer = 0, aPousser = 0, divergents = 0;
  const exemples = [];
  for (const [k, v] of C) {
    if (!L.has(k)) { aTirer++; if (exemples.length < 12) exemples.push({ k, quoi: 'absent en local' }); }
    else if (L.get(k) !== v) { divergents++; if (exemples.length < 12) exemples.push({ k, quoi: 'version différente', local: L.get(k), cloud: v }); }
  }
  for (const k of L.keys()) {
    if (!C.has(k)) { aPousser++; if (exemples.length < 12) exemples.push({ k, quoi: 'absent au cloud' }); }
  }

  const ecarts = aTirer + aPousser + divergents;
  return {
    statut: (ecarts === 0 && enAttente === 0) ? 'ajour' : 'ecart',
    ecarts, aTirer, aPousser, divergents, enAttente, exemples,
    local, cloud,
    // identiques quand tout est aligné : c'est CE couple qu'on compare entre appareils
    hash: cloud.hash, hashLocal: local.hash, n: cloud.n,
  };
}

/* ---- date de la dernière synchro RÉUSSIE ----
   En localStorage et non dans un store IndexedDB syncable : c'est un fait propre
   à CET appareil (« quand ai-je réussi à me synchroniser »), il n'a rien à faire
   au cloud et ne doit surtout pas voyager. Écrit par MedReviseApp#forceSync, lu
   ici — l'indicateur lui-même n'écrit jamais. */
const CLE_DERNIERE = 'medrevise.derniereSyncOk';
export function marquerSyncReussie(iso) {
  try { localStorage.setItem(CLE_DERNIERE, iso || new Date().toISOString()); } catch (e) { /* mode privé */ }
}
export function derniereSyncReussie() {
  try { return localStorage.getItem(CLE_DERNIERE); } catch (e) { return null; }
}
