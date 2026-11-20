/* ============================================================
   MedRevise — HISTORIQUE DES VERSIONS D'UN DOCUMENT (14/11/2026,
   docs/compte-rendu-boites-disparues-et-sauvegarde-continue.md).

   Une VERSION = la photographie complète des annotations d'un document (boîtes, textes, traits,
   formes, images, pages ajoutées, surlignages, + tableau et notes s'il y en a), rangée dans le store
   LOCAL `versions_doc` (jamais synchronisé, jamais dans le build). Elle est gardée :
   - au moins toutes les 5 min d'édition (à la première écriture qui suit 5 min sans version) ;
   - à l'ouverture et à la fermeture du document ;
   - avant toute restauration ou récupération (et après : chaque action crée une version) ;
   - AVANT que la synchro ne remplace ou ne supprime une annotation locale (version non retenue
     d'un conflit, suppression faite sur un autre appareil) : rien n'est jamais jeté ;
   - avant qu'une écriture n'écrase une version écrite par un autre onglet.
   Deux versions identiques ne sont pas gardées deux fois (empreinte). Conservation : 60 jours.

   VERSIONS RETROUVÉES. Les copies quotidiennes GitHub (route /api/backup-versions, lecture seule) et
   les sauvegardes locales `putBackup` qui contiennent ce document sont ajoutées à l'historique, en ajout
   seul, idempotent (id = copie), avec un putBackup avant : « Retrouvée dans la sauvegarde du <date> ».
   Une sauvegarde locale partielle (quelques annotations seulement) ne permet que « Récupérer les
   boîtes manquantes », jamais « Restaurer ».

   GARDE-FOU. À l'ouverture : les annotations de la version précédente absentes aujourd'hui SANS
   suppression enregistrée (registre local, alimenté par toute suppression de l'app ET par chaque
   suppression reçue d'un autre appareil) sont signalées. Rien n'est modifié automatiquement.
   ============================================================ */
import {
  lireDocument, versionsDocCles, versionDoc, ecrireVersionDoc, supprimerVersionDoc, definirCrochetsDocuments,
  getMeta, setMeta, putBackup, putMany, put, remove, getAllEntries, genId, getOne,
} from './storage.js';
import { surEcritureDocument, nsDe, estStoreDocument } from './enregistrement.js';

export const INTERVALLE_VERSION_MS = 5 * 60 * 1000;
export const RETENTION_MS = 60 * 24 * 3600 * 1000;
const CLE_REGISTRE = 'suppressionsDoc.v1';

/* ---- outils ---- */
const sansHorodatage = (r) => { if (!r || typeof r !== 'object') return r; const { updatedAt, ...reste } = r; return reste; };
function empreinte(contenu) {
  const lignes = [
    ...(contenu.annotations || []).map((a) => 'a' + JSON.stringify(sansHorodatage(a))),
    ...(contenu.highlights || []).map((h) => 'h' + JSON.stringify(sansHorodatage(h))),
    contenu.board ? 'b' + JSON.stringify(sansHorodatage(contenu.board)) : '',
    contenu.notes_doc ? 'n' + JSON.stringify(sansHorodatage(contenu.notes_doc)) : '',
  ].sort();
  let h = 0x811c9dc5; const s = lignes.join('\n');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36) + ':' + s.length;
}
const BOITES = new Set(['libre', 'texte', undefined, null]);
export function compter(contenu) {
  const ann = (contenu && contenu.annotations) || [];
  const c = { boites: 0, traits: 0, formes: 0, images: 0, pages: 0, autres: 0, surlignages: ((contenu && contenu.highlights) || []).length };
  for (const a of ann) {
    if (a.kind === 'page') c.pages++; else if (a.kind === 'trait') c.traits++; else if (a.kind === 'forme') c.formes++;
    else if (a.kind === 'image') c.images++; else if (BOITES.has(a.kind)) c.boites++; else c.autres++;
  }
  c.total = ann.length + c.surlignages;
  return c;
}
/** ids des annotations d'un contenu (annotations + surlignages) */
export const idsDe = (contenu) => new Set([...((contenu && contenu.annotations) || []), ...((contenu && contenu.highlights) || [])].map((r) => r.id));
const cleVersion = (ns, le, id) => `${ns}|${le}|${id}`;

/* ---- lecture des versions ---- */
const derniereParNs = new Map(); // ns → { le (ms), empreinte } — dernière version « vivante » gardée sur cet appareil
export async function listerVersions(ns) {
  const cles = ((await versionsDocCles()) || []).filter((k) => typeof k === 'string' && k.startsWith(ns + '|'));
  const vs = (await Promise.all(cles.map((k) => versionDoc(k)))).filter(Boolean);
  return vs.sort((a, b) => (a.le < b.le ? 1 : a.le > b.le ? -1 : 0));
}
async function derniereVersionVivante(ns) {
  const vs = await listerVersions(ns);
  return vs.find((v) => !v.source) || null;
}

/* ---- écriture d'une version ---- */
let purgeFaite = false;
async function purger() {
  if (purgeFaite) return; purgeFaite = true;
  const limite = Date.now() - RETENTION_MS;
  for (const k of (await versionsDocCles()) || []) {
    const v = await versionDoc(k);
    if (v && Date.parse(v.ajouteeLe || v.le) < limite) await supprimerVersionDoc(k);
  }
}

/**
 * Garde une version du document `ns`.
 * @param {string} ns
 * @param {string} raison libellé lisible (« Toutes les 5 min d'édition », « Avant restauration »…)
 * @param {{ force?, contenu?, le?, id?, source?, partielle? }} o — `force` : même si identique à la précédente
 */
export async function garderVersion(ns, raison, o = {}) {
  if (!ns) return null;
  purger().catch(() => {});
  const contenu = o.contenu || await lireDocument(ns);
  const emp = empreinte(contenu);
  if (!o.force && !o.source) {
    let d = derniereParNs.get(ns);
    if (!d) { const v = await derniereVersionVivante(ns); d = v ? { le: Date.parse(v.le), empreinte: v.empreinte } : null; }
    if (d && d.empreinte === emp) { derniereParNs.set(ns, { le: Date.now(), empreinte: emp }); return null; } // rien de neuf
  }
  const le = o.le || new Date().toISOString();
  const id = o.id || genId('v');
  const v = {
    id, ns, le, ajouteeLe: new Date().toISOString(), raison, source: o.source || null, partielle: !!o.partielle,
    compte: compter(contenu), empreinte: emp, contenu,
  };
  v.taille = JSON.stringify(contenu).length;
  await ecrireVersionDoc(cleVersion(ns, le, id), v);
  if (!o.source) derniereParNs.set(ns, { le: Date.now(), empreinte: emp });
  return v;
}

/* ---- registre local des suppressions (garde-fou) ---- */
let registre = null; let ecritureRegistre = Promise.resolve();
async function lireRegistre() { if (!registre) registre = (await getMeta(CLE_REGISTRE)) || {}; return registre; }
export function noterSuppressionsDoc(ids, origine) {
  ecritureRegistre = ecritureRegistre.then(async () => {
    const r = await lireRegistre(); const le = new Date().toISOString();
    for (const id of ids) r[id] = { le, origine };
    const limite = Date.now() - RETENTION_MS;
    for (const [id, e] of Object.entries(r)) if (Date.parse(e.le) < limite) delete r[id];
    await setMeta(CLE_REGISTRE, r);
  }).catch(() => {});
  return ecritureRegistre;
}
export async function suppressionsConnues() { await ecritureRegistre; return lireRegistre(); }

/* ---- crochets posés dans lib/storage.js ---- */
const debutSession = Date.now();
const connus = new Set(); // updatedAt écrits (ou adoptés du cloud) par CET onglet
surEcritureDocument(({ rec }) => { if (rec && rec.updatedAt) connus.add(rec.updatedAt); });
const sauvesAvantSynchro = new Map(); // ns → ms : une photographie par document et par passe de synchro
const contenuDe = (r) => JSON.stringify(sansHorodatage(r));

definirCrochetsDocuments({
  // une autre fenêtre (ou un autre onglet) a écrit cette annotation depuis l'ouverture : sa version va dans l'historique
  avantEcriture: async (name, precedent, nouveau) => {
    const t = Date.parse(precedent.updatedAt || '') || 0;
    if (t <= debutSession || connus.has(precedent.updatedAt)) return;
    if (contenuDe(precedent) === contenuDe(nouveau)) return;
    const ns = nsDe(name, precedent, precedent.id);
    connus.add(precedent.updatedAt);
    await garderVersion(ns, 'Version d’un autre onglet (non retenue)');
  },
  avantSuppression: async (name, precedent) => {
    await noterSuppressionsDoc([precedent.id], 'suppression dans l’app');
  },
  // la synchro va remplacer (cloudData) ou supprimer (null) une annotation locale
  avantCloud: async (name, local, cloudData) => {
    if (!local) return;
    if (cloudData && cloudData.updatedAt) connus.add(cloudData.updatedAt);
    if (cloudData && contenuDe(local) === contenuDe(cloudData)) return;
    if (!cloudData) await noterSuppressionsDoc([local.id], 'supprimée sur un autre appareil');
    const ns = nsDe(name, local, local.id);
    if (!ns) return;
    const deja = sauvesAvantSynchro.get(ns);
    if (deja && Date.now() - deja < 30000) return; // la photographie de cette passe contient déjà l'état d'avant
    sauvesAvantSynchro.set(ns, Date.now());
    await garderVersion(ns, cloudData ? 'Avant synchro (version non retenue)' : 'Avant synchro (suppression venue d’un autre appareil)');
  },
});

/* ---- au moins une version toutes les 5 min d'édition ---- */
const minuteurs = new Map();
surEcritureDocument(({ store, ns }) => {
  if (!ns || !estStoreDocument(store) || minuteurs.has(ns)) return;
  minuteurs.set(ns, setTimeout(async () => {
    minuteurs.delete(ns);
    try {
      let d = derniereParNs.get(ns);
      if (!d) { const v = await derniereVersionVivante(ns); d = v ? { le: Date.parse(v.le), empreinte: v.empreinte } : null; if (d) derniereParNs.set(ns, d); }
      if (!d || Date.now() - d.le >= INTERVALLE_VERSION_MS) await garderVersion(ns, 'Toutes les 5 min d’édition');
    } catch (e) { /* jamais bloquant */ }
  }, 1500));
});

/* ---- ouverture / fermeture d'un document ---- */
/**
 * À l'ouverture : compare au document tel qu'il était dans sa version précédente.
 * @returns {Promise<{ disparues: object[], reference: object|null }>} — disparues : annotations absentes
 *   aujourd'hui sans suppression enregistrée (rien n'est modifié)
 */
export async function ouvertureDocument(ns) {
  if (!ns) return { disparues: [], reference: null };
  const [actuel, ref, reg] = await Promise.all([lireDocument(ns), derniereVersionVivante(ns), suppressionsConnues()]);
  if (!ref) { await garderVersion(ns, 'Ouverture du document'); return { disparues: [], reference: null }; }
  const presents = idsDe(actuel);
  const ignores = new Set(((await getMeta('disparitionsIgnorees:' + ns)) || []));
  const disparues = [...(ref.contenu.annotations || []), ...(ref.contenu.highlights || [])]
    .filter((r) => r && !presents.has(r.id) && !reg[r.id] && !ignores.has(r.id));
  // tant qu'une disparition n'est pas traitée, on ne remplace pas la référence (l'alerte reste)
  if (!disparues.length) await garderVersion(ns, 'Ouverture du document');
  return { disparues, reference: ref };
}
export async function fermetureDocument(ns) { if (ns) await garderVersion(ns, 'Fermeture du document'); }
/** « ne plus signaler » : ces disparitions sont notées comme vues (aucune donnée de cours modifiée) */
export async function ignorerDisparitions(ns, ids) {
  const deja = (await getMeta('disparitionsIgnorees:' + ns)) || [];
  await setMeta('disparitionsIgnorees:' + ns, [...new Set([...deja, ...ids])]);
}

/* ---- actions (chacune crée des versions : tout est réversible) ---- */
/** annotations de `version` absentes aujourd'hui */
export async function manquantesDe(ns, version) {
  const actuel = await lireDocument(ns);
  const presents = idsDe(actuel);
  return {
    annotations: (version.contenu.annotations || []).filter((a) => !presents.has(a.id)),
    highlights: (version.contenu.highlights || []).filter((h) => !presents.has(h.id)),
  };
}
export async function recupererManquantes(ns, version) {
  const m = await manquantesDe(ns, version);
  const n = m.annotations.length + m.highlights.length;
  if (!n) return { ajoutees: 0 };
  const actuel = await lireDocument(ns);
  await putBackup('pre-recuperation-' + ns + '-' + Date.now(), actuel);
  await garderVersion(ns, 'Avant « Récupérer les boîtes manquantes »', { force: true, contenu: actuel });
  if (m.annotations.length) await putMany('annotations', m.annotations);
  if (m.highlights.length) await putMany('highlights', m.highlights);
  await garderVersion(ns, `Après récupération de ${n} élément${n > 1 ? 's' : ''} (version du ${dateLisible(version.le)})`, { force: true });
  return { ajoutees: n };
}
export async function restaurerVersion(ns, version) {
  if (version.partielle) throw new Error('version partielle : seule la récupération des boîtes manquantes est possible');
  const actuel = await lireDocument(ns);
  /* (20/11, lib/remplacerDocument.js) une version prise avant « Remplacer par un PDF » porte aussi la FICHE : la
     restaurer remet le document tel quel (sans le PDF) — la fiche d'aujourd'hui est gardée dans la version « Avant » */
  const ficheVersion = version.contenu.fiche && version.contenu.fiche.id === ns ? version.contenu.fiche : null;
  if (ficheVersion) actuel.fiche = (await getOne('fiches', ns)) || null;
  await putBackup('pre-restauration-' + ns + '-' + Date.now(), actuel);
  await garderVersion(ns, 'Avant restauration', { force: true, contenu: actuel });
  const garder = idsDe(version.contenu);
  const a = version.contenu.annotations || [], h = version.contenu.highlights || [];
  if (a.length) await putMany('annotations', a);
  if (h.length) await putMany('highlights', h);
  for (const x of actuel.annotations) if (!garder.has(x.id)) await remove('annotations', x.id);
  for (const x of actuel.highlights) if (!garder.has(x.id)) await remove('highlights', x.id);
  if (version.contenu.board && actuel.board) await put('board', version.contenu.board);
  if (version.contenu.notes_doc && actuel.notes_doc) await put('notes_doc', version.contenu.notes_doc);
  // la fiche EN DERNIER : un document qui redevient « créé dans l'app » trouve ses pages déjà là (sinon le lecteur,
  // voyant un document sans page, en créerait une)
  if (ficheVersion) await put('fiches', ficheVersion);
  await garderVersion(ns, `Après restauration de la version du ${dateLisible(version.le)}`, { force: true });
}

export function dateLisible(iso) {
  try { return new Date(iso).toLocaleString('fr-BE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ' à'); } catch (e) { return String(iso); }
}

/* ---- versions retrouvées dans les sauvegardes ---- */
const RE_ID_ANNOT = /^(an|h)[0-9a-z]{6,}$/;
/** sauvegardes locales `putBackup` contenant des annotations de ce document (ajout seul, idempotent) */
export async function importerVersionsLocales(ns) {
  const existantes = new Set((await listerVersions(ns)).map((v) => v.id));
  let ajoutees = 0;
  for (const [cle, b] of (await getAllEntries('backups')) || []) {
    if (!b || !b.data || typeof cle !== 'string') continue;
    const id = 'loc:' + cle;
    if (existantes.has(id)) continue;
    const trouves = { annotations: new Map(), highlights: new Map() };
    let pas = 0;
    const parcourir = (x, prof) => {
      if (!x || typeof x !== 'object' || prof > 6 || ++pas > 200000) return;
      if (Array.isArray(x)) { for (const y of x) parcourir(y, prof + 1); return; }
      const r = x.data && x.record_id ? x.data : x; // entrée de file d'envoi → son enregistrement
      if (r && r.ficheId === ns && typeof r.id === 'string' && RE_ID_ANNOT.test(r.id)) {
        (r.id.startsWith('h') ? trouves.highlights : trouves.annotations).set(r.id, r);
        return;
      }
      for (const v of Object.values(x)) parcourir(v, prof + 1);
    };
    parcourir(b.data, 0);
    if (!trouves.annotations.size && !trouves.highlights.size) continue;
    if (!ajoutees) await putBackup('pre-versions-retrouvees-' + ns + '-' + Date.now(), [...existantes]);
    const contenu = { annotations: [...trouves.annotations.values()], highlights: [...trouves.highlights.values()], board: null, notes_doc: null };
    await garderVersion(ns, `Retrouvée dans la sauvegarde locale du ${dateLisible(b.when)}`, { contenu, le: b.when || new Date(0).toISOString(), id, source: 'locale', partielle: true });
    ajoutees++;
  }
  return ajoutees;
}

/** copies quotidiennes GitHub (lecture seule côté serveur) : une version par copie distincte */
export async function importerVersionsGithub(ns, { fetchFn = typeof fetch === 'function' ? fetch : null } = {}) {
  if (!fetchFn) return { ok: false, ajoutees: 0, message: 'réseau indisponible' };
  let r;
  try {
    const rep = await fetchFn('/api/backup-versions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ns }) });
    r = await rep.json();
  } catch (e) { return { ok: false, ajoutees: 0, message: 'sauvegardes quotidiennes injoignables' }; }
  if (!r || !r.ok) return { ok: false, ajoutees: 0, message: (r && r.message) || 'sauvegardes quotidiennes injoignables' };
  const existantes = new Set((await listerVersions(ns)).map((v) => v.id));
  const neuves = (r.versions || []).filter((v) => v && v.sha && !existantes.has('gh:' + v.sha));
  if (neuves.length) await putBackup('pre-versions-retrouvees-' + ns + '-' + Date.now(), [...existantes]);
  for (const v of neuves) {
    const contenu = { annotations: v.annotations || [], highlights: v.highlights || [], board: null, notes_doc: null };
    const jour = /^\d{4}-\d{2}-\d{2}$/.test(v.copie || '') ? v.copie.split('-').reverse().join('/') : v.copie;
    await garderVersion(ns, `Retrouvée dans la sauvegarde du ${jour}`, { contenu, le: v.le, id: 'gh:' + v.sha, source: 'github' });
  }
  return { ok: true, ajoutees: neuves.length, lues: r.copiesLues || 0 };
}

/** espace occupé par l'historique sur cet appareil */
export async function espaceHistorique() {
  let n = 0, octets = 0;
  for (const k of (await versionsDocCles()) || []) { const v = await versionDoc(k); if (v) { n++; octets += v.taille || 0; } }
  return { versions: n, octets };
}
