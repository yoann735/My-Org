/* ============================================================
   My Org — stockage IndexedDB (via idb-keyval).
   Même pattern que MedRevise : chaque "table" = une petite base
   clé→enregistrement, préfixée `myorg_` — physiquement isolée des
   bases medrevise-* et du localStorage MealWeek (zéro collision).
   Aucun localStorage, aucun réseau : tout est local.
   ============================================================ */
import { get, set, del, values, createStore } from 'idb-keyval';

const store = (name) => createStore('myorg_' + name, 'v1');
const S = {
  todos: store('todos'), // tâches (To-do)
  goals: store('goals'), // objectifs annuels
  newsCache: store('news_cache'), // dernier payload /api/news + timestamp (un seul enregistrement)
  newsRead: store('news_read'),   // urls d'articles déjà lus
  newsClicks: store('news_clicks'), // profil d'affinité appris des clics (un seul enregistrement 'profile')
  meta: store('meta'),   // marqueurs de schéma / migrations additives futures
};

export function genId(prefix = 'x') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* ---- CRUD génériques ---- */
export const getAll = (name) => values(S[name]);
export const getOne = (name, id) => get(id, S[name]);
export const put = (name, rec) => set(rec.id, rec, S[name]).then(() => rec);
export const remove = (name, id) => del(id, S[name]);

/* ---- meta (versionnement de schéma, migrations additives) ---- */
export const getMeta = (key) => get(key, S.meta);
export const setMeta = (key, val) => set(key, val, S.meta);

const SCHEMA_VERSION = 1;
export async function ensureSchema() {
  const v = await getMeta('schemaVersion');
  if (!v) await setMeta('schemaVersion', SCHEMA_VERSION);
  // migrations additives futures : if (v < 2) { ... ; await setMeta('schemaVersion', 2); }
}

/* ---- helpers de création ---- */
export function newTodo(fields = {}) {
  return {
    id: genId('t'),
    titre: (fields.titre || '').trim(),
    note: fields.note || '',
    echeance: fields.echeance || null,          // 'YYYY-MM-DD' | null
    priorite: fields.priorite || 'moyenne',     // 'basse' | 'moyenne' | 'haute'
    statut: 'todo',                             // 'todo' | 'done'
    doneAt: null,                               // ISO — sert au KPI "faites cette semaine"
    createdAt: new Date().toISOString(),
  };
}

export function newGoal(fields = {}) {
  return {
    id: genId('g'),
    intitule: (fields.intitule || '').trim(),
    annee: fields.annee || new Date().getFullYear(),
    categorie: fields.categorie || '',
    progression: fields.progression ?? 0,       // 0..100
    statut: fields.statut || 'en_cours',        // 'en_cours' | 'atteint'
    note: fields.note || '',
    createdAt: new Date().toISOString(),
  };
}

/* ---- helpers de date (To-do) ---- */
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const isLate = (t) => t.statut !== 'done' && !!t.echeance && t.echeance < todayISO();
