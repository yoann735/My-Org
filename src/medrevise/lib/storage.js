/* ============================================================
   MedRevise — stockage IndexedDB (via idb-keyval).
   Données + blobs (images d'anatomie, PDF sources) — bien trop gros
   pour localStorage. Chaque "table" = un petit store clé→enregistrement.
   Hiérarchie : SOURCE(cours) → MATIÈRE → FICHE → QUESTIONS / STRUCTURES.
   ============================================================ */
import { get, set, del, values, setMany, createStore } from 'idb-keyval';
import { todayISO, isoDate } from './sm2.js';

const store = (name) => createStore('medrevise-' + name, 'v1');
const S = {
  sources: store('sources'),
  matieres: store('matieres'),
  fiches: store('fiches'),
  questions: store('questions'),
  structures: store('structures'),
  blobs: store('blobs'),
  stats: store('stats'),
};

export function genId(prefix = 'x') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* ---- generic CRUD ---- */
export const getAll = (name) => values(S[name]);
export const getOne = (name, id) => get(id, S[name]);
export const put = (name, rec) => set(rec.id, rec, S[name]).then(() => rec);
export const putMany = (name, recs) => setMany(recs.map((r) => [r.id, r]), S[name]);
export const remove = (name, id) => del(id, S[name]);

/* ---- blobs (images recadrées, PDF) ---- */
export async function putBlob(blob) {
  const id = genId('b');
  await set(id, blob, S.blobs);
  return id;
}
export const getBlob = (id) => get(id, S.blobs);
export async function blobURL(id) {
  if (!id) return null;
  const b = await getBlob(id);
  return b ? URL.createObjectURL(b) : null;
}

/* ---- stats (carte unique) ---- */
const DEFAULT_STATS = { streak: 0, dernierJourRevise: null, jokerUtilise: false, objectifQuotidien: 20, best: 0, activityDays: [], serieCollapsed: false };
export async function getStats() { return (await get('stats', S.stats)) || { ...DEFAULT_STATS }; }
export const setStats = (s) => set('stats', s, S.stats);

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

/* tout effacer (réglages → reset) */
export async function wipeAll() {
  for (const name of Object.keys(S)) {
    const all = await getAll(name);
    await Promise.all((all || []).map((r) => (r && r.id ? del(r.id, S[name]) : null)));
  }
  await del('stats', S.stats);
}
