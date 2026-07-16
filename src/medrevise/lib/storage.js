/* ============================================================
   MedRevise — stockage IndexedDB (via idb-keyval).
   Données + blobs (images d'anatomie, PDF sources) — bien trop gros
   pour localStorage. Chaque "table" = un petit store clé→enregistrement.
   Hiérarchie : SOURCE(cours) → MATIÈRE → FICHE → QUESTIONS / STRUCTURES.
   ============================================================ */
import { get, set, del, values, setMany, createStore } from 'idb-keyval';
import { todayISO, isoDate } from './sm2.js';
import { queuePush, pullAllRecords, pushBlob, pullBlob } from '../data/sync.js';

const store = (name) => createStore('medrevise-' + name, 'v1');
const S = {
  sources: store('sources'),
  matieres: store('matieres'),
  fiches: store('fiches'),
  questions: store('questions'),
  structures: store('structures'),
  highlights: store('highlights'),
  annotations: store('annotations'),
  blobs: store('blobs'),
  stats: store('stats'),
  meta: store('meta'),       // marqueurs de migration (schéma v1.0)
  backups: store('backups'), // sauvegardes non destructives avant migration
  exos: store('exos'),       // bloc-notes (brouillon) persisté par exercice
  docs: store('docs'),       // contenu TipTap des transcripts (clé = ficheId)
  anatstruct: store('anatstruct'), // fiches de structure anatomique (théorie, champs typés)
};

// A — SYNCHRO CLOUD : stores dont les enregistrements suivent l'utilisateur d'un
// appareil à l'autre (voir data/sync.js). `meta`/`backups` restent locaux (détails
// d'implémentation d'un appareil donné) ; `blobs` a son propre canal (Storage, pas la
// table `medrevise_records` — trop gros pour du JSONB), voir putBlob/getBlob plus bas.
const SYNCABLE = ['sources', 'matieres', 'fiches', 'questions', 'structures', 'highlights', 'annotations', 'stats', 'exos', 'docs', 'anatstruct'];

export function genId(prefix = 'x') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* ---- generic CRUD (horodate + met en file la synchro cloud pour les stores
   SYNCABLE ; IndexedDB reste écrit en premier et fait foi en local même hors-ligne) ---- */
export const getAll = (name) => values(S[name]);
export const getOne = (name, id) => get(id, S[name]);
export async function put(name, rec) {
  const stamped = SYNCABLE.includes(name) ? { ...rec, updatedAt: new Date().toISOString() } : rec;
  await set(stamped.id, stamped, S[name]);
  if (SYNCABLE.includes(name)) queuePush(name, stamped.id, stamped, stamped.updatedAt);
  return stamped;
}
export async function putMany(name, recs) {
  const syncable = SYNCABLE.includes(name);
  const stamped = syncable ? recs.map((r) => ({ ...r, updatedAt: new Date().toISOString() })) : recs;
  await setMany(stamped.map((r) => [r.id, r]), S[name]);
  if (syncable) stamped.forEach((r) => queuePush(name, r.id, r, r.updatedAt));
  return stamped;
}
export async function remove(name, id) {
  await del(id, S[name]);
  if (SYNCABLE.includes(name)) queuePush(name, id, {}, new Date().toISOString(), true); // tombstone (data vide, deleted=true)
}

/* ---- blobs (images recadrées, PDF) — Storage cloud (pas la table de records :
   trop gros pour du JSONB). Upload best-effort en tâche de fond (n'attend pas le
   réseau) ; téléchargement paresseux à la première lecture manquante localement
   (évite de re-télécharger toutes les images à chaque réconciliation). ---- */
export async function putBlob(blob) {
  const id = genId('b');
  await set(id, blob, S.blobs);
  pushBlob(id, blob); // fire-and-forget
  return id;
}
export async function getBlob(id) {
  const local = await get(id, S.blobs);
  if (local) return local;
  const remote = await pullBlob(id);
  if (remote) await set(id, remote, S.blobs);
  return remote || undefined;
}
export async function blobURL(id) {
  if (!id) return null;
  const b = await getBlob(id);
  return b ? URL.createObjectURL(b) : null;
}

/* ---- surlignages PDF (Partie B) ---- */
export function newHighlight({ ficheId, page, texte, couleur, rects }) {
  return { id: genId('h'), ficheId, page, texte, couleur: couleur || 'jaune', rects: rects || [], createdAt: new Date().toISOString() };
}

/* ---- édition de texte PDF (Chantier 1) : couche superposée qui masque un bloc de
   texte d'origine (rectangle opaque) et affiche à la place un contenu riche
   (TipTap) éditable, pré-rempli avec le texte réel extrait de ce bloc.
   x,y,width,height normalisés [0,1] par rapport à la page. Le PDF d'origine
   n'est jamais modifié — couche superposée uniquement, réinitialisable. ---- */
export function newTextEdit({ ficheId, page, x, y, width, height, originalText, fontSize, fontFamily, content }) {
  return {
    id: genId('an'), ficheId, page, x, y, width, height,
    originalText, fontSize: fontSize || null, fontFamily: fontFamily || null,
    content: content || { type: 'doc', content: [{ type: 'paragraph', content: originalText ? [{ type: 'text', text: originalText }] : [] }] },
    createdAt: new Date().toISOString(),
  };
}

/* ---- meta (migrations) + backups (sauvegardes pré-migration) ---- */
export const getMeta = (key) => get(key, S.meta);
export const setMeta = (key, val) => set(key, val, S.meta);
export const putBackup = (key, val) => set(key, { key, when: new Date().toISOString(), data: val }, S.backups);
export const getBackup = (key) => get(key, S.backups);

/* ---- bloc-notes d'exercice (brouillon persisté par item) ---- */
export const getExoNote = (id) => get(id, S.exos);
export async function setExoNote(id, note) {
  const when = new Date().toISOString();
  const rec = { id, note, when, updatedAt: when };
  await set(id, rec, S.exos);
  queuePush('exos', id, rec, when);
}

/* ---- contenu riche d'un transcript (document TipTap, clé = ficheId) ---- */
export const getDoc = (ficheId) => get(ficheId, S.docs);
export async function setDoc(ficheId, content) {
  const updatedAt = new Date().toISOString();
  const rec = { id: ficheId, content, updatedAt };
  await set(ficheId, rec, S.docs);
  queuePush('docs', ficheId, rec, updatedAt);
}
export async function removeDoc(ficheId) {
  await del(ficheId, S.docs);
  queuePush('docs', ficheId, {}, new Date().toISOString(), true);
}

/* ---- stats (carte unique) ---- */
const DEFAULT_STATS = { streak: 0, dernierJourRevise: null, jokerUtilise: false, best: 0, activityDays: [], serieCollapsed: false };
export async function getStats() { return (await get('stats', S.stats)) || { ...DEFAULT_STATS }; }
export async function setStats(s) {
  const updatedAt = new Date().toISOString();
  const rec = { ...s, id: 'stats', updatedAt };
  await set('stats', rec, S.stats);
  queuePush('stats', 'stats', rec, updatedAt);
  return rec;
}

/* ---- helpers de création (avec init méthode des J) ---- */
export function newQuestion(ficheId, q, dueOffset = 0) {
  const d = new Date(); d.setDate(d.getDate() + dueOffset);
  return {
    // conserve les champs supplémentaires (categorie_question, difficulte,
    // categorie_carte, explication_simple, lien_avec_le_cours, pieges_frequents,
    // question_verification…) utiles pour filtrer/afficher et évaluer Feynman
    ...q,
    id: genId('q'), ficheId, type: q.type, concept: q.concept || '',
    question: q.question || '', choix: q.choix || [], bonneReponse: q.bonneReponse ?? 0, explication: q.explication || '',
    recto: q.recto || '', verso: q.verso || '',
    niveau: q.niveau || null,
    interval: dueOffset, repetition: 0, efactor: 2.5,
    nextReview: isoDate(d), historique: [], missed: 0,
  };
}

/* Item v1.0 (schéma unifié) → enregistrement planifiable en base.
   `item` est déjà un item "superset" (v1.0 + champs legacy) produit par
   toInternalItem(). On lui donne une clé primaire neuve + l'état SM-2 initial.
   (Ne remplace pas newQuestion : les flux legacy passent par toInternalItem
   en amont, ce helper reçoit toujours un item déjà normalisé.) */
export function newItem(ficheId, item, dueOffset = 0) {
  const d = new Date(); d.setDate(d.getDate() + dueOffset);
  return {
    ...item,
    // clé primaire neuve (évite les collisions entre fiches) ; srcId conserve
    // l'id v1.0 d'origine du JSON → sert au dédoublonnage lors d'un ajout à une
    // fiche existante (mode Rattrapage).
    id: genId('q'), srcId: item.id || null, ficheId, type: item.type,
    interval: dueOffset, repetition: 0, efactor: 2.5,
    nextReview: isoDate(d), historique: [], missed: 0,
  };
}

/* ============================================================
   SEED — petit jeu réel au premier lancement (sinon écran vide).
   Idempotent : ne seed que si aucune source n'existe.
   ============================================================ */
let _seedPromise = null;
export function seedIfEmpty() {
  // guard against StrictMode's double-invoked mount effect racing the async
  // seed (both reading "empty" before either writes → duplicate data).
  if (!_seedPromise) _seedPromise = _seedIfEmpty();
  return _seedPromise;
}

async function _seedIfEmpty() {
  const existing = await getAll('sources');
  if (existing && existing.length) return false;

  const src = { id: 'fac', nom: 'Faculté de médecine', rappelsJ: true, archive: false, coef: 3, icon: 'grad', tint: '#7C6FE0' };
  const physio = { id: 'physio', sourceId: 'fac', nom: 'Physiologie', couleur: '#7C6FE0', coef: 3, icon: 'lungs' };
  const anat = { id: 'anat', sourceId: 'fac', nom: 'Anatomie', couleur: '#4FA6D9', coef: 3, icon: 'bone' };
  await putMany('sources', [src]);
  await putMany('matieres', [physio, anat]);

  const fiches = [
    { id: 'f-resp', matiereId: 'physio', titre: 'Système respiratoire', sousTitre: 'Échanges gazeux, transport O₂/CO₂', type: 'standard', coef: 3, dateImport: todayISO() },
    { id: 'f-ab', matiereId: 'physio', titre: 'Équilibre acido-basique', sousTitre: 'pH, lactate, compensation rénale', type: 'standard', coef: 3, dateImport: todayISO() },
    { id: 'f-ms', matiereId: 'anat', titre: 'Membre supérieur', sousTitre: 'Plexus brachial, innervation', type: 'standard', coef: 3, dateImport: todayISO() },
  ];
  await putMany('fiches', fiches);

  const Q = [];
  const add = (ficheId, q, off) => Q.push(newQuestion(ficheId, q, off));
  // Système respiratoire — dû aujourd'hui
  add('f-resp', { type: 'qcm', concept: 'Effet Bohr', question: 'Une baisse du pH sanguin sur l\'affinité de l\'hémoglobine pour l\'O₂ ?', choix: ['Elle augmente', 'Elle diminue', 'Inchangée', 'S\'annule'], bonneReponse: 1, explication: 'Effet Bohr : l\'acidose diminue l\'affinité de l\'Hb pour l\'O₂, favorisant sa libération aux tissus.' }, 0);
  add('f-resp', { type: 'qcm', concept: 'Transport du CO₂', question: 'Forme majoritaire de transport du CO₂ dans le sang ?', choix: ['Dissous', 'Lié à l\'Hb', 'Bicarbonate (HCO₃⁻)', 'Carbonate de Ca'], bonneReponse: 2, explication: '≈70 % du CO₂ est transporté en bicarbonate via l\'anhydrase carbonique.' }, 0);
  add('f-resp', { type: 'flashcard', concept: 'Surfactant', recto: 'Rôle du surfactant pulmonaire ?', verso: 'Réduit la tension superficielle alvéolaire, empêche le collapsus.' }, 0);
  add('f-resp', { type: 'flashcard', concept: 'Espace mort', recto: 'Espace mort anatomique ?', verso: '≈150 mL de voies de conduction sans échange gazeux.' }, 0);
  add('f-resp', { type: 'feynman', concept: 'Effet Bohr' }, 0);
  // Équilibre acido-basique — dû dans 3 j
  add('f-ab', { type: 'qcm', concept: 'Lactate', question: 'En effort anaérobie, quelle molécule abaisse le pH ?', choix: ['Glucose', 'Lactate', 'Glycogène', 'Créatinine'], bonneReponse: 1, explication: 'La glycolyse anaérobie produit du lactate (+ H⁺), abaissant le pH.' }, 3);
  add('f-ab', { type: 'flashcard', concept: 'Acidose', recto: 'Acidose respiratoire vs métabolique ?', verso: 'Respiratoire : excès de CO₂. Métabolique : perte de HCO₃⁻ ou acides fixes.' }, 3);
  // Membre supérieur — dû dans 1 j
  add('f-ms', { type: 'qcm', concept: 'Nerf radial', question: 'Conséquence d\'une atteinte du nerf radial au bras ?', choix: ['Main en griffe', 'Main tombante', 'Perte opposition pouce', 'Paralysie deltoïde'], bonneReponse: 1, explication: 'Le nerf radial innerve les extenseurs : sa lésion donne une main tombante.' }, 1);
  add('f-ms', { type: 'flashcard', concept: 'Plexus brachial', recto: 'Racines du plexus brachial ?', verso: 'C5 à T1 (parfois C4/T2).' }, 1);
  add('f-ms', { type: 'feynman', concept: 'Plexus brachial' }, 1);
  await putMany('questions', Q);

  await setStats({ ...DEFAULT_STATS });
  return true;
}

/* tout effacer (réglages → reset) — pousse aussi les suppressions en tombstones
   cloud (SYNCABLE) pour qu'un reset local ne se fasse pas silencieusement
   "annuler" par la réconciliation suivante (qui rapatrierait sinon les données
   encore présentes côté cloud). */
export async function wipeAll() {
  for (const name of Object.keys(S)) {
    const all = await getAll(name);
    const syncable = SYNCABLE.includes(name);
    await Promise.all((all || []).map((r) => {
      if (!r || !r.id) return null;
      if (syncable) queuePush(name, r.id, {}, new Date().toISOString(), true);
      return del(r.id, S[name]);
    }));
  }
  await del('stats', S.stats);
  queuePush('stats', 'stats', {}, new Date().toISOString(), true);
}

/* ============================================================
   A — RÉCONCILIATION CLOUD (LWW par enregistrement). Appelée au démarrage,
   à la reconnexion réseau et quand l'onglet redevient visible (voir
   MedReviseApp.jsx). Dataset personnel ≈ petit → un fetch complet de la
   table à chaque passage suffit (comme MealWeek), pas de curseur incrémental.
   Sans réseau / non configuré (pullAllRecords → null) : no-op, IndexedDB
   reste seul juge — jamais de plantage, jamais de perte locale.
   ============================================================ */
export async function reconcileAll() {
  const cloudRows = await pullAllRecords();
  if (cloudRows === null) return false;

  const byStore = new Map();
  for (const row of cloudRows) {
    if (!byStore.has(row.store)) byStore.set(row.store, new Map());
    byStore.get(row.store).set(row.record_id, row);
  }

  for (const name of SYNCABLE) {
    const cloudMap = byStore.get(name) || new Map();
    const localRecs = (await values(S[name])) || [];
    const localIds = new Set();

    for (const rec of localRecs) {
      if (!rec || !rec.id) continue;
      localIds.add(rec.id);
      const localTs = rec.updatedAt ? Date.parse(rec.updatedAt) : 0;
      const cloud = cloudMap.get(rec.id);
      if (!cloud) {
        // absent du cloud (première synchro de cet appareil, ou nouveau) → pousser.
        queuePush(name, rec.id, rec, rec.updatedAt || new Date().toISOString());
        continue;
      }
      const cloudTs = cloud.updated_at ? Date.parse(cloud.updated_at) : 0;
      if (cloud.deleted) {
        if (cloudTs >= localTs) await del(rec.id, S[name]); // tombstone plus récent → supprimer localement
        else queuePush(name, rec.id, rec, rec.updatedAt || new Date().toISOString()); // local plus récent → réhabiliter
      } else if (cloudTs > localTs) {
        await set(rec.id, cloud.data, S[name]); // cloud plus récent → adopter
      } else if (localTs > cloudTs) {
        queuePush(name, rec.id, rec, rec.updatedAt || new Date().toISOString()); // local plus récent → pousser
      }
    }

    // enregistrements présents côté cloud mais absents localement (nouveaux sur cet appareil).
    for (const [id, cloud] of cloudMap) {
      if (localIds.has(id) || cloud.deleted) continue;
      await set(id, cloud.data, S[name]);
    }
  }
  return true;
}
