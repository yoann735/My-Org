/* ============================================================
   MedRevise — MOTEUR D'ENREGISTREMENT DES DOCUMENTS (14/11/2026,
   docs/compte-rendu-boites-disparues-et-sauvegarde-continue.md).

   UN SEUL MOTEUR pour tout ce qu'on écrit DANS un document : PDF annoté, fiche jumelle,
   document créé dans l'app, tableau. Toutes ces écritures passent déjà par put()/putMany()/
   remove() de lib/storage.js ; pour les stores « document » ci-dessous, storage.js délègue ici
   l'écriture elle-même :
   1. écriture IndexedDB, puis RELECTURE : l'écriture n'est « confirmée » que si on relit
      exactement la version écrite (même `updatedAt`) — ou plus rien, pour une suppression ;
   2. échec → nouvel essai (3 en tout), puis ERREUR PERSISTANTE, visible dans la barre du
      document (jamais silencieuse), jusqu'à la prochaine écriture confirmée ;
   3. l'envoi au serveur reste le chemin normal : la file `medrevise-outbox` (IndexedDB,
      survit à la fermeture, rejouée au démarrage et au retour du réseau).

   UN SEUL CALCUL de l'état d'enregistrement (`etatEnregistrement`), lu par toutes les barres
   de document : « Enregistré sur l'appareil » / « Enregistré et envoyé » / « En attente
   d'envoi » / « Erreur » (+ « Enregistrement… » le temps d'une écriture). « Enregistré »
   n'apparaît QUE pour une écriture confirmée par relecture.

   VIDAGES. Les éditeurs gardent au plus ~150 ms de frappe en mémoire. Ils s'inscrivent ici
   (`inscrireVidage`) pour être vidés tout de suite à la mise en arrière-plan, à la fermeture,
   au changement de page ou de document (`viderTout`).

   FERMETURE. Avertissement du navigateur (beforeunload) UNIQUEMENT si une écriture locale
   n'est pas terminée. Jamais dans les autres cas.
   ============================================================ */
import { outboxEntries, surChangementFile, dernierEchecEnvoi, flushOutbox } from '../data/sync.js';
import { SYNC_ENABLED } from '../data/supabaseClient.js';

/** stores dont les enregistrements SONT le contenu d'un document */
export const STORES_DOCUMENT = ['annotations', 'highlights', 'board', 'notes_doc', 'docs'];
export const estStoreDocument = (name) => STORES_DOCUMENT.includes(name);

/** document (espace de noms) d'un enregistrement : ficheId d'un PDF, `<cours>::fiche:<v>` d'une
 *  fiche jumelle, id d'un document créé dans l'app ou d'un tableau. */
export function nsDe(store, rec, id) {
  if (rec && rec.ficheId) return String(rec.ficheId);
  const i = String(id || (rec && rec.id) || '');
  if (store === 'board') return i.replace(/^board:/, '') || null;
  if (store === 'notes_doc' || store === 'docs') return i || null;
  return null;
}

/* ---- état ---- */
const etat = {
  enCours: 0,              // écritures locales lancées, pas encore confirmées
  erreur: null,            // { le, message, store, id, ns } — dernière écriture locale en échec
  derniereConfirmee: null, // ms
  confirmees: 0,
};
const nsParCle = new Map(); // `${store}:${id}` → ns (pour reconnaître les entrées de la file d'envoi)
const aEnvoyer = new Map(); // ns → Set(`${store}:${id}`) : confirmé en local, encore dans la file d'envoi
let fileLue = false;
const abonnes = new Set();
let notifPrevue = false;
function notifier() {
  if (notifPrevue) return;
  notifPrevue = true;
  const go = () => { notifPrevue = false; abonnes.forEach((fn) => { try { fn(); } catch (e) { /* écran démonté */ } }); };
  if (typeof queueMicrotask === 'function') queueMicrotask(go); else Promise.resolve().then(go);
}
export function surEtatEnregistrement(fn) { abonnes.add(fn); return () => abonnes.delete(fn); }
/** lecture brute (tests, bancs) */
export const etatMoteur = () => ({ ...etat, aEnvoyer: [...aEnvoyer].map(([ns, s]) => [ns, s.size]) });

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const messageErreur = (e) => {
  const n = e && e.name;
  if (n === 'QuotaExceededError') return 'espace de stockage plein sur cet appareil';
  if (n === 'InvalidStateError' || n === 'UnknownError') return 'stockage de l’appareil indisponible';
  return String((e && e.message) || e || 'écriture impossible').slice(0, 140);
};

/* ---- écouteurs d'écriture (historique des versions, garde-fou) ---- */
const ecouteurs = new Set();
/** fn({ store, id, ns, rec, supprime }) après chaque écriture CONFIRMÉE d'un store document */
export function surEcritureDocument(fn) { ecouteurs.add(fn); return () => ecouteurs.delete(fn); }
const prevenirEcriture = (e) => ecouteurs.forEach((fn) => { try { fn(e); } catch (err) { /* ignore */ } });

/**
 * Écrit un ou plusieurs enregistrements d'un store document, vérifie par relecture, réessaie, signale.
 * @param {{ store, elements: { id, rec (null = suppression) }[], ecrire: () => Promise, relire: () => Promise<any[]> }} o
 *   `relire` rend les valeurs relues, dans l'ordre de `elements`.
 * @returns {Promise<void>} rejette après 3 échecs (l'erreur reste affichée)
 */
export async function ecrireVerifie({ store, elements, ecrire, relire }) {
  const items = elements.map(({ id, rec }) => ({ id, rec, ns: nsDe(store, rec, id), cle: store + ':' + id }));
  items.forEach((x) => { if (x.ns) nsParCle.set(x.cle, x.ns); });
  etat.enCours += 1; notifier();
  let dernier = null;
  try {
    for (let essai = 1; essai <= 3; essai++) {
      try {
        await ecrire();
        const relus = await relire();
        items.forEach((x, i) => {
          const relu = relus[i];
          const bon = x.rec === null ? relu === undefined : !!(relu && relu.updatedAt === x.rec.updatedAt);
          if (!bon) throw new Error('relecture différente de l’écriture');
        });
        etat.erreur = null; etat.derniereConfirmee = Date.now(); etat.confirmees += 1;
        for (const x of items) {
          if (x.ns && SYNC_ENABLED) { if (!aEnvoyer.has(x.ns)) aEnvoyer.set(x.ns, new Set()); aEnvoyer.get(x.ns).add(x.cle); }
          prevenirEcriture({ store, id: x.id, ns: x.ns, rec: x.rec, supprime: x.rec === null });
        }
        return;
      } catch (e) {
        dernier = e;
        if (essai < 3) await pause(essai * 80);
      }
    }
    const x0 = items[0] || {};
    etat.erreur = { le: new Date().toISOString(), message: messageErreur(dernier), store, id: x0.id, ns: x0.ns };
    // eslint-disable-next-line no-console
    console.error('[enregistrement] écriture locale impossible', store, items.map((x) => x.id).join(','), dernier);
    throw dernier;
  } finally {
    etat.enCours -= 1; notifier();
  }
}

/** compte une écriture de document DÈS son début (lectures préalables comprises) : l'avertissement de fermeture
 *  et l'indicateur la voient tout de suite, pas seulement pendant l'écriture IndexedDB elle-même */
export async function suivreEcriture(fn) {
  etat.enCours += 1; notifier();
  try { return await fn(); } finally { etat.enCours -= 1; notifier(); }
}

/* ---- file d'envoi : ce qui reste à partir, par document ---- */
const miseEnFile = new Set(); // clés confirmées en local dont l'entrée de file n'est pas encore écrite
/** suit l'écriture de l'entrée de la file d'envoi (queuePush) d'une écriture confirmée */
export function suivreMiseEnFile(store, id, promesse) {
  const cle = store + ':' + id;
  miseEnFile.add(cle);
  return Promise.resolve(promesse).catch(() => {}).finally(() => { miseEnFile.delete(cle); });
}
async function relireFile() {
  const ent = await outboxEntries();
  const garder = new Map();
  for (const [ns, s] of aEnvoyer) for (const cle of s) if (miseEnFile.has(cle)) { if (!garder.has(ns)) garder.set(ns, new Set()); garder.get(ns).add(cle); }
  aEnvoyer.clear();
  for (const [ns, s] of garder) aEnvoyer.set(ns, s);
  for (const [, v] of ent) {
    if (!v || !estStoreDocument(v.store)) continue;
    const cle = v.store + ':' + v.record_id;
    const ns = nsParCle.get(cle) || nsDe(v.store, v.data, v.record_id);
    if (!ns) continue;
    nsParCle.set(cle, ns);
    if (!aEnvoyer.has(ns)) aEnvoyer.set(ns, new Set());
    aEnvoyer.get(ns).add(cle);
  }
  fileLue = true;
  notifier();
}
let relectureEnVol = null;
export function rafraichirFile() {
  if (relectureEnVol) return relectureEnVol;
  relectureEnVol = relireFile().catch(() => {}).finally(() => { relectureEnVol = null; });
  return relectureEnVol;
}
if (typeof window !== 'undefined') {
  surChangementFile(() => { rafraichirFile(); });
  // retour du réseau : la file d'envoi part TOUT DE SUITE (sans attendre le prochain passage de la synchro)
  window.addEventListener('online', () => { notifier(); if (SYNC_ENABLED) Promise.resolve(flushOutbox()).catch(() => {}).finally(rafraichirFile); });
  window.addEventListener('offline', notifier);
}

/**
 * LE calcul de l'état d'enregistrement d'un document (toutes les barres de document le lisent).
 * @returns {{ code: 'erreur'|'ecriture'|'attente'|'appareil'|'envoye', libelle: string, detail: string }}
 */
export function etatEnregistrement(ns) {
  if (!fileLue && SYNC_ENABLED) rafraichirFile();
  if (etat.erreur) {
    return { code: 'erreur', libelle: 'Erreur', detail: 'Écriture impossible sur cet appareil : ' + etat.erreur.message + '. Rien n’est effacé ; la prochaine modification réessaie.' };
  }
  if (etat.enCours > 0) return { code: 'ecriture', libelle: 'Enregistrement…', detail: 'Écriture sur l’appareil en cours' };
  if (!SYNC_ENABLED) return { code: 'appareil', libelle: 'Enregistré sur l’appareil', detail: 'Enregistré sur cet appareil (synchronisation non configurée)' };
  const n = ns && aEnvoyer.has(ns) ? aEnvoyer.get(ns).size : 0;
  const horsLigne = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (n > 0) {
    const echec = dernierEchecEnvoi();
    if (horsLigne || echec) {
      const pourquoi = horsLigne ? 'hors ligne' : (echec.erreur === 'reseau' ? 'réseau injoignable' : 'refusé par le serveur');
      return { code: 'attente', libelle: 'En attente d’envoi', detail: `Enregistré sur l’appareil · ${n} modification${n > 1 ? 's' : ''} en attente d’envoi (${pourquoi}) · renvoi automatique` };
    }
    return { code: 'appareil', libelle: 'Enregistré sur l’appareil', detail: `Enregistré sur l’appareil · envoi en cours (${n})` };
  }
  return { code: 'envoye', libelle: 'Enregistré et envoyé', detail: 'Enregistré sur l’appareil et envoyé' };
}

/* ---- vidages : texte encore en mémoire dans un éditeur ---- */
const vidages = new Set();
/** fn() écrit tout de suite ce que l'éditeur garde en mémoire ; renvoie de quoi se désinscrire */
export function inscrireVidage(fn) { vidages.add(fn); return () => vidages.delete(fn); }
export function viderTout() { vidages.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } }); }
/** une écriture locale n'est-elle pas terminée ? (avertissement de fermeture) */
export const ecritureEnCours = () => etat.enCours > 0;

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') viderTout(); });
  window.addEventListener('pagehide', viderTout);
  window.addEventListener('beforeunload', (e) => {
    viderTout(); // lance l'écriture de la frappe en mémoire…
    if (ecritureEnCours()) { e.preventDefault(); e.returnValue = ''; return ''; } // …et ne prévient que si elle n'est pas finie
    return undefined;
  });
}

/* ---- stockage persistant : le navigateur ne peut plus effacer les données locales ---- */
let persistance = null; // { demande, accorde, le }
export const etatPersistance = () => persistance;
export async function demanderStockagePersistant() {
  try {
    if (!navigator.storage || !navigator.storage.persist) { persistance = { demande: false, accorde: null, le: new Date().toISOString(), raison: 'non pris en charge' }; return persistance; }
    const deja = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    const accorde = deja || await navigator.storage.persist();
    persistance = { demande: true, accorde: !!accorde, le: new Date().toISOString() };
  } catch (e) { persistance = { demande: true, accorde: false, le: new Date().toISOString(), raison: String(e && e.message || e) }; }
  return persistance;
}
