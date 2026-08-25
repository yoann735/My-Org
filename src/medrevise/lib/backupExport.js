/* ============================================================
   MedRevise — SAUVEGARDE LOCALE « Exporter toutes mes données ».

   Contexte : la synchro multi-appareils n'a pas de source de vérité (voir
   docs/audit-sync-J-2026.md) — un appareil peut écraser le cloud avec un état
   périmé. Avant d'y toucher, il faut pouvoir figer l'état de CHAQUE appareil
   dans un fichier. Sur iPhone la console est inaccessible : le geste doit donc
   vivre DANS l'app.

   GARANTIE CENTRALE — CE MODULE NE FAIT QUE LIRE.
   Aucune écriture IndexedDB, aucun `put`/`putMany`/`remove`, aucun `queuePush`,
   aucun appel réseau, aucune synchro ni migration déclenchée. Il n'importe que
   des lectures (`getAll`/`getAllEntries`, storage.js) et le drapeau
   `SYNC_ENABLED` (une simple constante de build, aucune requête).
   En particulier il n'utilise JAMAIS `getBlob()` : celui-ci retombe sur
   `pullBlob()` quand l'image manque en local, donc parlerait au réseau.

   Sortie : un seul fichier JSON, lisible et réimportable plus tard (le format
   est versionné par `BACKUP_SCHEMA`).
   ============================================================ */
import { getAll, getAllEntries, SYNCABLE_STORES } from './storage.js';
import { SYNC_ENABLED } from '../data/supabaseClient.js';
import { todayISO } from './sm2.js';

/** version du FORMAT de sauvegarde (pas de l'app) — à incrémenter seulement si
 *  la forme du fichier change de façon incompatible. Un futur import s'y fie. */
export const BACKUP_SCHEMA = 'medrevise-backup/1';

/* Budget d'octets pour les blobs (images recadrées, PDF de cours). Au-delà, on
   ARRÊTE d'en embarquer et on liste les ids laissés de côté dans le fichier
   (`blobsOmis`) plutôt que de faire crasher l'onglet : un JSON se construit
   entièrement en mémoire, et le base64 gonfle encore de ~33 %. 120 Mo bruts
   ≈ 160 Mo de texte, ce qu'un iPhone encaisse ; au-delà c'est l'écran blanc.
   Les données (fiches, cartes, méthode des J) ne sont JAMAIS concernées par ce
   plafond — elles pèsent quelques Mo au plus et partent toujours en entier. */
const BLOB_BUDGET_BYTES = 120 * 1024 * 1024;

const pad = (n) => String(n).padStart(2, '0');

/** horodatage compact pour le nom de fichier, en heure LOCALE (même convention
 *  que sm2.js#isoDate : jamais d'UTC, sinon le nom ne correspond pas au jour
 *  vécu par l'utilisateur). */
function stampForFilename(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}h${pad(d.getMinutes())}`;
}

/** Blob → data URL base64. Passe par FileReader (et non par un ArrayBuffer +
 *  btoa manuel) : c'est le seul chemin qui ne construit pas une chaîne
 *  intermédiaire de la taille du fichier, ce qui compte sur mobile. */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error || new Error('lecture du blob impossible'));
    fr.readAsDataURL(blob);
  });
}

/**
 * Construit l'objet de sauvegarde complet. LECTURE SEULE (voir en-tête).
 * @param {object}   [opts]
 * @param {boolean}  [opts.withBlobs=false] embarquer images/PDF en base64
 * @param {(step:string)=>void} [opts.onProgress] retour d'avancement pour l'UI
 * @returns {Promise<object>} l'objet prêt à sérialiser
 */
export async function buildBackup({ withBlobs = false, onProgress } = {}) {
  const step = (s) => { if (onProgress) onProgress(s); };

  const stores = {};
  const counts = {};
  for (const name of SYNCABLE_STORES) {
    step(`Lecture : ${name}…`);
    const recs = (await getAll(name)) || [];
    stores[name] = recs;
    counts[name] = recs.length;
  }

  let blobs = null;
  let blobsOmis = [];
  let blobsBytes = 0;
  if (withBlobs) {
    step('Lecture des images et PDF…');
    // entries() et pas getAll() : l'id d'un blob est la CLÉ, il n'est pas dans
    // la valeur (voir storage.js#putBlob, qui fait `set(id, blob)`).
    const paires = (await getAllEntries('blobs')) || [];
    blobs = [];
    let i = 0;
    for (const [id, blob] of paires) {
      i++;
      if (!blob || typeof blob.size !== 'number') continue;
      if (blobsBytes + blob.size > BLOB_BUDGET_BYTES) {
        blobsOmis.push({ id, taille: blob.size, type: blob.type || null });
        continue;
      }
      step(`Image / PDF ${i} sur ${paires.length}…`);
      try {
        blobs.push({ id, type: blob.type || null, taille: blob.size, data: await blobToDataUrl(blob) });
        blobsBytes += blob.size;
      } catch (e) {
        blobsOmis.push({ id, taille: blob.size, type: blob.type || null, erreur: String(e && e.message || e) });
      }
    }
  }

  step('Assemblage du fichier…');
  return {
    schema: BACKUP_SCHEMA,
    app: 'MedRevise',
    // --- provenance : c'est ce qui permet de distinguer les 3 appareils une
    //     fois les fichiers côte à côte, et de repérer un appareil qui n'a
    //     jamais synchronisé (syncActive === false, voir l'audit §Q5).
    exporteLe: new Date().toISOString(),
    dateLocale: todayISO(),
    fuseau: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return null; } })(),
    horlogeLocale: new Date().toString(),
    origine: typeof location !== 'undefined' ? location.origin : null,
    hote: typeof location !== 'undefined' ? location.hostname : null,
    navigateur: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    syncActive: SYNC_ENABLED,
    // --- contenu
    compteurs: { ...counts, blobs: blobs ? blobs.length : 0 },
    blobsInclus: !!withBlobs,
    blobsOctets: blobsBytes,
    blobsOmis,
    stores,
    blobs,
  };
}

/** nom de fichier : identifie l'appareil (hôte) et l'instant, pour que trois
 *  sauvegardes posées dans le même dossier ne se recouvrent jamais. */
export function backupFilename(hote) {
  const h = (hote || 'local').replace(/[^a-zA-Z0-9.-]+/g, '-');
  return `medrevise-sauvegarde-${h}-${stampForFilename()}.json`;
}

/* iOS / iPadOS uniquement. Ne PAS se contenter de tester `navigator.share` :
   Chrome et Safari desktop l'exposent aussi, et `canShare({files})` y répond
   `true` — on détournerait alors un simple téléchargement vers la feuille de
   partage macOS, ce qui est à la fois inattendu et plus fragile (constaté au
   test : le partage échoue, et l'utilisateur se retrouve sans fichier).
   iPadOS 13+ se déclare « MacIntel », d'où le second test sur maxTouchPoints. */
function preferePartage() {
  if (typeof navigator === 'undefined' || !navigator.share || !navigator.canShare) return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Remet le fichier à l'utilisateur. Deux chemins :
 *  1. iPhone / iPad → `navigator.share` avec un File : feuille de partage iOS
 *     (« Enregistrer dans Fichiers », AirDrop, Mail…). C'est le geste naturel
 *     là-bas, et il marche sur toutes les versions d'iOS — contrairement au
 *     `<a download>`, que les Safari iOS anciens ouvrent dans un onglet au lieu
 *     de l'enregistrer.
 *  2. partout ailleurs → ancre `download` classique.
 * Le repli va TOUJOURS de 1 vers 2, jamais l'inverse : si le partage échoue
 * pour une raison technique (geste utilisateur perdu → `NotAllowedError`), on
 * enchaîne sur le téléchargement plutôt que de laisser l'utilisateur sans rien.
 * Seul un `AbortError` — il a réellement fermé la feuille — vaut « annulé ».
 * @returns {Promise<'partage'|'telechargement'|'annule'>}
 */
export async function deliverFile(blob, filename) {
  if (preferePartage()) {
    try {
      const file = new File([blob], filename, { type: 'application/json' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        return 'partage';
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return 'annule'; // vrai refus utilisateur
      // NotAllowedError / partage de fichiers refusé : on retombe ci-dessous.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // révocation différée : Safari lit l'URL APRÈS le retour du click().
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'telechargement';
}

/** taille lisible (le fichier peut aller de 200 Ko à plusieurs dizaines de Mo). */
export function formatOctets(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return n + ' o';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' Ko';
  return (n / (1024 * 1024)).toFixed(1) + ' Mo';
}

/**
 * Point d'entrée UNIQUE du bouton (Réglages desktop ET accueil mobile) : lit,
 * sérialise, remet le fichier. Mêmes garanties partout, jamais deux chemins à
 * maintenir — même convention que storage.js#syncNow.
 * Ne lève jamais : renvoie toujours un statut exploitable par l'UI.
 * @returns {Promise<{ok:boolean, statut:string, message:string, nom?:string, octets?:number}>}
 */
export async function exportBackup({ withBlobs = false, onProgress } = {}) {
  try {
    const data = await buildBackup({ withBlobs, onProgress });
    const texte = JSON.stringify(data);
    const blob = new Blob([texte], { type: 'application/json' });
    const nom = backupFilename(data.hote);
    if (onProgress) onProgress('Enregistrement…');
    const via = await deliverFile(blob, nom);

    const total = Object.values(data.compteurs).reduce((a, b) => a + b, 0);
    if (via === 'annule') {
      return { ok: false, statut: 'annule', message: 'Enregistrement annulé — rien n\'a été modifié.' };
    }
    const omis = data.blobsOmis.length
      ? ` (${data.blobsOmis.length} fichier${data.blobsOmis.length > 1 ? 's' : ''} trop volumineux non inclus)`
      : '';
    return {
      ok: true, statut: via, nom, octets: blob.size,
      message: `${total} enregistrements exportés — ${formatOctets(blob.size)}${omis}. Fichier : ${nom}`,
    };
  } catch (e) {
    return {
      ok: false, statut: 'erreur',
      message: 'Export impossible : ' + String((e && e.message) || e) + '. Aucune donnée n\'a été modifiée.',
    };
  }
}
