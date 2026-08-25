/* ============================================================
   MedRevise — RESTAURATION d'une sauvegarde « Exporter toutes mes données ».

   Rôle : reprendre le fichier produit par lib/backupExport.js et remettre CET
   appareil exactement dans cet état, puis en faire la référence poussée au
   cloud. Sert à repartir d'un état propre après les divergences décrites dans
   docs/audit-sync-J-2026.md.

   Quatre partis pris, tous validés avant écriture :

   1. REMPLACEMENT, pas fusion, pour les 14 stores syncables — clear() puis
      setMany() (storage.js#replaceStore). Un upsert par id laisserait sur place
      les enregistrements locaux absents du fichier : l'état obtenu ne serait pas
      celui du fichier.
   2. FUSION pour les blobs — on n'en supprime jamais (storage.js#mergeBlobs).
      Un blob en trop est inoffensif, un blob perdu est irrécupérable.
   3. RÉHORODATAGE de tout au moment de l'import. La sauvegarde est forcément
      plus ancienne que « maintenant » ; sans horodatage neuf, le cloud gagnerait
      la comparaison LWW et la restauration serait défaite dans la seconde.
   4. SUPPRESSIONS CLOUD EN DEUX TEMPS. Remplacer le local ne suffit PAS à faire
      du fichier la référence : reconcileAll (storage.js) réadopte tout
      enregistrement présent au cloud et absent en local, donc les excédents
      redescendraient aussitôt. Il faut des tombstones — mais c'est une
      suppression distante irréversible, alors on la CALCULE et on l'AFFICHE
      (computeCloudDiff), et on ne l'applique que sur un second geste explicite
      (applyCloudTombstones).

   `meta` (marqueurs de migration) et `backups` ne sont JAMAIS touchés : effacer
   les marqueurs relancerait les neuf migrations sur les données importées, dont
   migrateOrphanCleanupV1 qui supprime avec tombstones propagés (défaut C8).
   ============================================================ */
import {
  SYNCABLE_STORES, getAll, replaceStore, mergeBlobs,
  setSyncPaused, putBackup,
} from './storage.js';
import { pullAllRecords, pushTombstonesNow, flushOutbox } from '../data/sync.js';
import { BACKUP_SCHEMA, formatOctets } from './backupExport.js';

/* Un JSON se construit et se parse ENTIÈREMENT en mémoire, et les data-URL
   base64 des blobs y restent sous forme de chaînes : compter ~3× la taille du
   fichier au pic. 250 Mo sur un ordinateur passent, un mobile meurt bien avant —
   d'où deux plafonds. Mieux vaut un refus explicite qu'un onglet blanc. */
const MAX_OCTETS_DESKTOP = 250 * 1024 * 1024;
const MAX_OCTETS_MOBILE = 50 * 1024 * 1024;
const LOT_BLOBS = 10;

function surMobile() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod|Android/.test(navigator.userAgent || '')
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Plafond applicable à cet appareil, exposé pour que l'UI puisse l'annoncer. */
export function tailleMax() {
  return surMobile() ? MAX_OCTETS_MOBILE : MAX_OCTETS_DESKTOP;
}

/**
 * Valide un fichier AVANT toute écriture. Ne touche à rien.
 * @returns {{ok:boolean, erreur?:string, compteurs?:object, meta?:object}}
 */
export function validateBackup(data, octets) {
  if (!data || typeof data !== 'object') return { ok: false, erreur: "Ce fichier n'est pas un JSON exploitable." };
  if (data.schema !== BACKUP_SCHEMA) {
    return { ok: false, erreur: `Format non reconnu (${data.schema || 'aucun schéma'}). Attendu : ${BACKUP_SCHEMA}.` };
  }
  if (!data.stores || typeof data.stores !== 'object') {
    return { ok: false, erreur: "Le fichier ne contient pas de section « stores »." };
  }
  const max = tailleMax();
  if (octets && octets > max) {
    return {
      ok: false,
      erreur: `Fichier trop volumineux pour cet appareil (${formatOctets(octets)}, plafond ${formatOctets(max)}). `
        + (surMobile() ? 'Fais la restauration depuis un ordinateur.' : 'Retire les images du fichier.'),
    };
  }
  const compteurs = {};
  for (const nom of SYNCABLE_STORES) compteurs[nom] = Array.isArray(data.stores[nom]) ? data.stores[nom].length : 0;
  compteurs.blobs = Array.isArray(data.blobs) ? data.blobs.length : 0;
  return {
    ok: true,
    compteurs,
    meta: {
      exporteLe: data.exporteLe || null,
      hote: data.hote || null,
      fuseau: data.fuseau || null,
      syncActive: data.syncActive,
    },
  };
}

/** Compte ce que contient CET appareil en ce moment — pour la modale
 *  comparative « actuellement → le fichier ». Lecture seule. */
export async function currentCounts() {
  const c = {};
  for (const nom of SYNCABLE_STORES) c[nom] = ((await getAll(nom)) || []).length;
  c.blobs = ((await getAll('blobs')) || []).length;
  return c;
}

/** data-URL base64 → Blob, sans passer par une chaîne intermédiaire. */
async function dataUrlToBlob(dataUrl) {
  const r = await fetch(dataUrl);
  return r.blob();
}

/**
 * Restaure le fichier sur CET appareil, puis pousse l'état obtenu au cloud.
 * NE SUPPRIME RIEN à distance — voir computeCloudDiff/applyCloudTombstones.
 * @returns {Promise<{ok:boolean, message:string, restaure?:object, blobs?:number}>}
 */
export async function importBackup(data, { onProgress } = {}) {
  const step = (s) => { if (onProgress) onProgress(s); };
  const stamp = new Date().toISOString();
  setSyncPaused(true); // aucune réconciliation ne doit tomber au milieu
  try {
    // 1) filet de sécurité : l'état ACTUEL, avant la première écriture.
    step('Sauvegarde de l\'état actuel…');
    const avant = {};
    for (const nom of SYNCABLE_STORES) avant[nom] = (await getAll(nom)) || [];
    await putBackup('pre-restauration-' + Date.now(), avant);

    // 2) les stores de données d'abord : c'est l'essentiel, et c'est léger.
    //    Si le navigateur meurt sur les blobs (étape 3), les données sont déjà là.
    const restaure = {};
    for (const nom of SYNCABLE_STORES) {
      step(`Restauration : ${nom}…`);
      restaure[nom] = await replaceStore(nom, data.stores[nom] || [], stamp);
    }

    // 3) blobs, par lots, en libérant chaque base64 au fur et à mesure : c'est
    //    ce qui permet de tenir sur un fichier de 100 Mo et plus.
    let blobs = 0;
    const liste = Array.isArray(data.blobs) ? data.blobs : [];
    for (let i = 0; i < liste.length; i += LOT_BLOBS) {
      step(`Images et PDF : ${Math.min(i + LOT_BLOBS, liste.length)} sur ${liste.length}…`);
      const lot = liste.slice(i, i + LOT_BLOBS);
      const paires = [];
      for (const b of lot) {
        if (!b || !b.id || !b.data) continue;
        try {
          paires.push([b.id, await dataUrlToBlob(b.data)]);
        } catch (e) { /* un blob illisible ne doit pas faire échouer la restauration */ }
        b.data = null; // libère la chaîne base64 pour le ramasse-miettes
      }
      blobs += await mergeBlobs(paires);
    }

    // 4) pousser l'état restauré. L'écriture conditionnelle côté base
    //    (medrevise_push) accepte, puisque `stamp` est plus récent que tout.
    step('Envoi au cloud…');
    await flushOutbox();

    const total = Object.values(restaure).reduce((a, b) => a + b, 0);
    return {
      ok: true, restaure, blobs,
      message: `${total} enregistrements restaurés et poussés au cloud`
        + (blobs ? `, ${blobs} images/PDF fusionnés` : '') + '.',
    };
  } catch (e) {
    return { ok: false, message: 'Restauration interrompue : ' + String((e && e.message) || e) + ". L'état d'avant est dans les sauvegardes locales." };
  } finally {
    setSyncPaused(false);
  }
}

/**
 * Calcule ce qui vit au cloud mais PAS dans la sauvegarde. Purement informatif :
 * ne supprime rien, n'écrit rien. C'est le premier des « deux temps ».
 * @returns {Promise<{ok:boolean, total:number, parStore:object, exemples:Array}>}
 */
export async function computeCloudDiff(data) {
  const rows = await pullAllRecords();
  if (rows === null) return { ok: false, total: 0, parStore: {}, exemples: [] };

  const dansFichier = {};
  for (const nom of SYNCABLE_STORES) {
    dansFichier[nom] = new Set((data.stores[nom] || []).map((r) => r && r.id).filter(Boolean));
  }

  const aSupprimer = [];
  for (const row of rows) {
    if (row.deleted) continue;                      // déjà un tombstone
    if (!SYNCABLE_STORES.includes(row.store)) continue;
    if (dansFichier[row.store].has(row.record_id)) continue;
    aSupprimer.push(row);
  }

  const parStore = {};
  aSupprimer.forEach((r) => { parStore[r.store] = (parStore[r.store] || 0) + 1; });

  // de quoi juger sur pièces plutôt que sur un nombre
  const exemples = aSupprimer.slice(0, 40).map((r) => ({
    store: r.store,
    id: r.record_id,
    apercu: apercuDe(r),
    modifie: r.updated_at,
  }));

  return { ok: true, total: aSupprimer.length, parStore, exemples, rows: aSupprimer };
}

/** Libellé lisible d'un enregistrement cloud, pour la revue avant suppression. */
function apercuDe(row) {
  const d = row.data || {};
  const t = d.titre || d.nom || d.recto || d.enonce || d.question || d.concept;
  if (t) return String(t).slice(0, 70);
  if (row.store === 'sessionsLog') return `série du ${String(d.createdAt || '').slice(0, 10)}`;
  return '—';
}

/**
 * Applique les tombstones du diff. SECOND GESTE, irréversible, jamais appelé
 * automatiquement par importBackup. Horodatage neuf pour que la suppression
 * gagne la comparaison conditionnelle côté base.
 * @returns {Promise<{ok:boolean, n:number, message:string}>}
 */
export async function applyCloudTombstones(diff) {
  const rows = (diff && diff.rows) || [];
  if (!rows.length) return { ok: true, n: 0, message: 'Rien à supprimer.' };
  const now = new Date().toISOString();
  const tombstones = rows.map((r) => ({
    store: r.store, record_id: r.record_id, data: {}, updated_at: now, deleted: true,
  }));
  const parti = await pushTombstonesNow(tombstones);
  return parti
    ? { ok: true, n: tombstones.length, message: `${tombstones.length} enregistrements supprimés au cloud. Les autres appareils s'aligneront à leur prochaine synchro.` }
    : { ok: false, n: 0, message: "Envoi impossible (hors ligne ?) — rien n'a été supprimé. Réessaie." };
}
