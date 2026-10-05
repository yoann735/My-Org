/* ============================================================
   MedRevise — SYNCHRO CIBLÉE d'un store « isolé » (gros enregistrements).

   Extrait de transcription/synchro.js (05/10) pour servir aussi aux couches OCR.
   Même table `medrevise_records`, même écriture conditionnelle (RPC medrevise_push,
   garde-fou updated_at) que tout le reste, mais :
   - ENVOI par l'outbox ; data/sync.js envoie ces stores un enregistrement par
     appel, après le lot commun (STORES_ISOLES) — un refus ne bloque jamais les autres ;
   - RÉCEPTION ciblée : métadonnées d'abord (record_id, updated_at, deleted), puis
     seulement les enregistrements plus récents au cloud — jamais par reconcileAll ;
   - `envoyable(rec)` : filtre ce qui part (session en direct, couche OCR incomplète…).
   ============================================================ */
import { getAll, getOne, ecrireDepuisCloud, supprimerDepuisCloud } from './storage.js';
import { queuePush, pullStoreMeta, pullStoreIds, flushOutbox } from '../data/sync.js';
import { SYNC_ENABLED } from '../data/supabaseClient.js';

const ts = (v) => (v ? Date.parse(v) || 0 : 0);

export function creerSynchroIsolee(store, { envoyable = () => true, exclu = () => false } = {}) {
  /** Met en file l'état ACTUEL (relu en base) d'un enregistrement, ou son tombstone. */
  async function pousser(id, { supprime = false } = {}) {
    if (!SYNC_ENABLED || !id || exclu(id)) return;
    if (supprime) { queuePush(store, id, {}, new Date().toISOString(), true); return; }
    const rec = await getOne(store, id);
    if (rec && envoyable(rec)) queuePush(store, id, rec, rec.updatedAt || new Date().toISOString());
  }
  async function pousserMaintenant(id) {
    await pousser(id);
    if (SYNC_ENABLED) flushOutbox();
  }

  let enCours = null;
  /** Rapproche local et cloud pour ce store (LWW par enregistrement). */
  function synchro() {
    if (!SYNC_ENABLED) return Promise.resolve({ statut: 'desactive' });
    if (enCours) return enCours;
    enCours = (async () => {
      try {
        const meta = await pullStoreMeta(store);
        if (meta === null) return { statut: 'injoignable' };
        const locaux = new Map(((await getAll(store)) || []).filter((r) => r && r.id).map((r) => [r.id, r]));
        const aRecuperer = [];
        let envoyes = 0, supprimes = 0;
        for (const row of meta) {
          const id = row.record_id;
          if (exclu(id)) continue;
          const local = locaux.get(id);
          locaux.delete(id);
          const tc = ts(row.updated_at), tl = local ? ts(local.updatedAt) : 0;
          if (!local) { if (!row.deleted) aRecuperer.push(id); continue; }
          if (tc > tl) {
            if (row.deleted) { await supprimerDepuisCloud(store, id); supprimes++; } else aRecuperer.push(id);
          } else if (tl > tc && envoyable(local)) { queuePush(store, id, local, local.updatedAt); envoyes++; }
        }
        for (const [id, local] of locaux) {
          if (exclu(id) || !envoyable(local)) continue;
          queuePush(store, id, local, local.updatedAt || new Date().toISOString()); envoyes++;
        }
        let recus = 0;
        if (aRecuperer.length) {
          const lignes = await pullStoreIds(store, aRecuperer);
          if (lignes === null) return { statut: 'injoignable', envoyes };
          for (const r of lignes) {
            if (r.deleted || !r.data || !r.data.id) continue;
            const actuel = await getOne(store, r.record_id);
            if (actuel && ts(actuel.updatedAt) >= ts(r.updated_at)) continue; // écriture locale arrivée entre-temps
            await ecrireDepuisCloud(store, r.data); recus++;
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
  return { pousser, pousserMaintenant, synchro };
}
