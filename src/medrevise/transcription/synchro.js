/* ============================================================
   MedRevise — TRANSCRIPTION EN DIRECT : synchro cloud (palier 2).

   Le type `transcript_session` voyage dans la MÊME table `medrevise_records`
   et par la MÊME écriture conditionnelle (RPC medrevise_push, garde-fou
   updated_at) que tout le reste — mais à part :
   - ENVOI : queuePush → outbox persistée ; data/sync.js envoie ce store « isolé »,
     un enregistrement par appel, après le lot commun. Un refus (migration pas
     appliquée, plafond de taille…) le laisse dans l'outbox sans bloquer les
     autres types.
   - RÉCEPTION : jamais par reconcileAll (qui relit toute la table à chaque retour
     sur l'onglet). Ici : métadonnées d'abord (record_id, updated_at, deleted),
     puis seulement les sessions plus récentes au cloud. Même last-write-wins.
   - SESSION EN DIRECT : jamais poussée pendant qu'elle tourne (elle grossit à
     chaque phrase) — une seule fois, à l'arrêt.
   Synchro non configurée / hors ligne : tout reste en IndexedDB, rien ne casse.
   ============================================================ */
import { getAll, getOne, ecrireDepuisCloud, supprimerDepuisCloud } from '../lib/storage.js';
import { queuePush, pullStoreMeta, pullStoreIds, flushOutbox } from '../data/sync.js';
import { SYNC_ENABLED } from '../data/supabaseClient.js';

const STORE = 'transcript_session';
let vivante = null; // id de la session en cours d'enregistrement (exclue des échanges)
export function marquerVivante(id) { vivante = id || null; }

const ts = (v) => (v ? Date.parse(v) || 0 : 0);

/** Met en file l'état ACTUEL (relu en base) d'un enregistrement, ou son tombstone. */
export async function pousser(id, { supprime = false } = {}) {
  if (!SYNC_ENABLED || !id || id === vivante) return;
  if (supprime) { queuePush(STORE, id, {}, new Date().toISOString(), true); return; }
  const rec = await getOne(STORE, id);
  if (rec) queuePush(STORE, id, rec, rec.updatedAt || new Date().toISOString());
}

/** Fin de session : poussée, et envoi sans attendre le debounce. */
export async function pousserMaintenant(id) {
  await pousser(id);
  if (SYNC_ENABLED) flushOutbox();
}

let enCours = null;
/**
 * Compare local et cloud pour ce store et rapproche les deux (LWW par enregistrement).
 * @returns {Promise<{statut:string, recus?:number, envoyes?:number, supprimes?:number}>}
 */
export function synchroTranscripts() {
  if (!SYNC_ENABLED) return Promise.resolve({ statut: 'desactive' });
  if (enCours) return enCours;
  enCours = (async () => {
    try {
      const meta = await pullStoreMeta(STORE);
      if (meta === null) return { statut: 'injoignable' };
      const locaux = new Map(((await getAll(STORE)) || []).filter((r) => r && r.id).map((r) => [r.id, r]));
      const aRecuperer = [];
      let envoyes = 0, supprimes = 0;
      for (const row of meta) {
        const id = row.record_id;
        if (id === vivante) continue;
        const local = locaux.get(id);
        locaux.delete(id);
        const tc = ts(row.updated_at), tl = local ? ts(local.updatedAt) : 0;
        if (!local) { if (!row.deleted) aRecuperer.push(id); continue; }
        if (tc > tl) {
          if (row.deleted) { await supprimerDepuisCloud(STORE, id); supprimes++; } else aRecuperer.push(id);
        } else if (tl > tc) { queuePush(STORE, id, local, local.updatedAt); envoyes++; }
      }
      // présents ici, absents du cloud
      for (const [id, local] of locaux) {
        if (id === vivante) continue;
        queuePush(STORE, id, local, local.updatedAt || new Date().toISOString()); envoyes++;
      }
      let recus = 0;
      if (aRecuperer.length) {
        const lignes = await pullStoreIds(STORE, aRecuperer);
        if (lignes === null) return { statut: 'injoignable', envoyes };
        for (const r of lignes) {
          if (r.deleted || !r.data || !r.data.id) continue;
          // revérifie : une écriture locale a pu arriver entre-temps
          const actuel = await getOne(STORE, r.record_id);
          if (actuel && ts(actuel.updatedAt) >= ts(r.updated_at)) continue;
          await ecrireDepuisCloud(STORE, r.data); recus++;
        }
      }
      if (envoyes) flushOutbox();
      return { statut: 'ok', recus, envoyes, supprimes };
    } catch (e) {
      return { statut: 'erreur' };
    } finally { enCours = null; }
  })();
  return enCours;
}
