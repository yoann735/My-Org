/* ============================================================
   MedRevise — planning "méthode des J" calculé sur les vraies
   échéances par question (nextReview), pas un hash. Fonctions PURES
   sur un snapshot { sources, matieres, fiches, questions }.
   ============================================================ */
import { jStepForInterval, todayISO, isoDate } from './sm2.js';

const SCHEDULED_TYPES = new Set(['qcm', 'flashcard']);
// exercices : items planifiables mais à part (page dédiée, jamais dans une
// session de cartes → on les tient hors de SCHEDULED_TYPES, comme les schémas).
const EXERCICE_TYPE = 'exercice';
// types comptant pour le J AFFICHÉ d'une fiche (théorie + pratique)
const J_TYPES = new Set(['qcm', 'flashcard', 'exercice']);

/* ---- index helpers ---- */
export function index(db) {
  const sById = Object.fromEntries((db.sources || []).map((s) => [s.id, s]));
  const mById = Object.fromEntries((db.matieres || []).map((m) => [m.id, m]));
  const fById = Object.fromEntries((db.fiches || []).map((f) => [f.id, f]));
  return { sById, mById, fById };
}

export function effectiveCoef(db, fiche, idx) {
  const { mById, sById } = idx || index(db);
  if (!fiche) return 3;
  if (fiche.coef != null) return fiche.coef;
  const m = mById[fiche.matiereId];
  if (m && m.coef != null) return m.coef;
  const s = m && sById[m.sourceId];
  if (s && s.coef != null) return s.coef;
  return 3;
}

/** une fiche est dans le planning si la SOURCE a les rappels J activés (et non archivée) */
export function isFicheScheduled(db, fiche, idx) {
  const { mById, sById } = idx || index(db);
  if (!fiche || fiche.archive) return false;
  const m = mById[fiche.matiereId];
  if (!m || m.archive) return false;
  const s = sById[m.sourceId];
  if (!s || s.archive) return false;
  return s.rappelsJ !== false;
}

/* ---- date helpers ---- */
export function addDays(dateISO, n) {
  const d = new Date(dateISO + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return isoDate(d);
}
export function startOfWeekISO(dateISO) {
  const d = new Date(dateISO + 'T12:00:00');
  const dow = (d.getDay() + 6) % 7; // lundi = 0
  d.setDate(d.getDate() - dow);
  return isoDate(d);
}
export function fmtDay(dateISO) {
  return new Date(dateISO + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });
}
export const DOW = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/* ---- due questions ---- */
export function scheduledQuestions(db, idx) {
  const ix = idx || index(db);
  return (db.questions || []).filter((q) => SCHEDULED_TYPES.has(q.type) && isFicheScheduled(db, ix.fById[q.ficheId], ix));
}

/** questions dues à une date (par défaut aujourd'hui) — inclut le retard pour aujourd'hui */
export function dueOn(db, dateISO, idx) {
  const ix = idx || index(db);
  const today = todayISO();
  return scheduledQuestions(db, ix).filter((q) => {
    if (dateISO === today) return q.nextReview <= dateISO;       // aujourd'hui = dû + en retard
    if (dateISO < today) return false;                           // pas de révision dans le passé
    return q.nextReview === dateISO;                             // jour futur précis
  });
}
export function dueToday(db, idx) { return dueOn(db, todayISO(), idx); }

/* ---- exercices (type "exercice") : items planifiables SM-2, révisés dans la
   PAGE Exercice (pas dans une session de cartes). Gérés en parallèle, comme
   les schémas d'anatomie. ---- */
export function scheduledExercices(db, idx) {
  const ix = idx || index(db);
  return (db.questions || []).filter((q) => q.type === EXERCICE_TYPE && isFicheScheduled(db, ix.fById[q.ficheId], ix));
}
export function dueExercicesOn(db, dateISO, idx) {
  const ix = idx || index(db);
  const today = todayISO();
  return scheduledExercices(db, ix).filter((q) => {
    if (dateISO === today) return q.nextReview <= dateISO;
    if (dateISO < today) return false;
    return q.nextReview === dateISO;
  });
}
export function dueExercicesToday(db, idx) { return dueExercicesOn(db, todayISO(), idx); }

/* ---- schémas d'anatomie visuelle (anat_schema) : la FICHE elle-même est
   l'item planifiable SM-2 (elle porte interval/repetition/efactor/nextReview),
   pas des questions. On les gère en parallèle des questions. ---- */
export function scheduledSchemas(db, idx) {
  const ix = idx || index(db);
  return (db.fiches || []).filter((f) => f.type === 'anat_schema' && isFicheScheduled(db, f, ix));
}
export function dueSchemasOn(db, dateISO, idx) {
  const ix = idx || index(db);
  const today = todayISO();
  return scheduledSchemas(db, ix).filter((f) => {
    const nr = f.nextReview || today;
    if (dateISO === today) return nr <= dateISO;   // aujourd'hui = dû + en retard
    if (dateISO < today) return false;
    return nr === dateISO;                          // jour futur précis
  });
}
export function dueSchemasToday(db, idx) { return dueSchemasOn(db, todayISO(), idx); }

/** J affiché d'une fiche : anat_schema → dérivé de la fiche elle-même ;
   sinon → dérivé de sa question la plus proche d'échéance */
export function ficheJ(db, ficheId, idx) {
  const ix = idx || index(db);
  const f = ix.fById[ficheId];
  if (f && f.type === 'anat_schema') return jStepForInterval(f.interval || 0);
  const qs = (db.questions || []).filter((q) => q.ficheId === ficheId && J_TYPES.has(q.type));
  if (!qs.length) return { jIndex: -1, jLabel: '—' };
  const soonest = qs.reduce((a, b) => (a.nextReview <= b.nextReview ? a : b));
  return jStepForInterval(soonest.interval);
}

/** regroupe une liste de questions par fiche, avec compteurs + J + coef */
export function groupByFiche(db, questions, idx) {
  const ix = idx || index(db);
  const map = {};
  questions.forEach((q) => {
    const f = ix.fById[q.ficheId];
    if (!f) return;
    if (!map[f.id]) {
      const m = ix.mById[f.matiereId];
      map[f.id] = { fiche: f, matiere: m, source: m && ix.sById[m.sourceId], items: [], qcm: 0, flash: 0 };
    }
    map[f.id].items.push(q);
    if (q.type === 'qcm') map[f.id].qcm++; else if (q.type === 'flashcard') map[f.id].flash++;
  });
  return Object.values(map).map((g) => ({
    ...g,
    ...ficheJ(db, g.fiche.id, ix),
    coef: effectiveCoef(db, g.fiche, ix),
  }));
}

/** plan d'aujourd'hui groupé par fiche, plus volumineux d'abord */
export function todayPlan(db, idx) {
  return groupByFiche(db, dueToday(db, idx), idx).sort((a, b) => b.items.length - a.items.length);
}

/** semaine de 7 jours (weekOffset: 0 = cette semaine) */
export function weekData(db, weekOffset = 0, idx) {
  const ix = idx || index(db);
  const today = todayISO();
  const monday = addDays(startOfWeekISO(today), weekOffset * 7);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    const items = dueOn(db, date, ix);
    const schemas = dueSchemasOn(db, date, ix).map((f) => ({ fiche: f, matiere: ix.mById[f.matiereId], ...ficheJ(db, f.id, ix) }));
    days.push({
      date, dow: DOW[i], dayNum: new Date(date + 'T00:00:00').getDate(),
      isToday: date === today, isPast: date < today,
      // total affiché = cartes (questions) + schémas dus
      total: items.length + schemas.length, cardsTotal: items.length,
      items, schemas, byFiche: groupByFiche(db, items, ix),
    });
  }
  return { monday, days };
}

/* ---- carnet d'erreurs ---- */
export function missedQuestions(db, idx) {
  const ix = idx || index(db);
  return (db.questions || []).filter((q) => q.missed > 0).map((q) => {
    const f = ix.fById[q.ficheId];
    const m = f && ix.mById[f.matiereId];
    return { ...q, fiche: f, matiere: m };
  }).sort((a, b) => b.missed - a.missed);
}

/** points faibles pondérés par coefficient (handoff §5.5) */
export function weakPoints(db, idx) {
  const ix = idx || index(db);
  const byFiche = {};
  missedQuestions(db, ix).forEach((q) => {
    const f = ix.fById[q.ficheId];
    if (!f) return;
    const e = byFiche[f.id] || (byFiche[f.id] = { fiche: f, matiere: ix.mById[f.matiereId], misses: 0, concepts: 0, list: [] });
    e.misses += q.missed; e.concepts += 1; e.list.push(q);
  });
  return Object.values(byFiche).map((e) => {
    const coef = effectiveCoef(db, e.fiche, ix);
    return { ...e, coef, score: e.misses * coef };
  }).sort((a, b) => b.score - a.score);
}

export function topConcepts(list, n = 3) {
  const map = {};
  list.forEach((q) => { map[q.concept] = (map[q.concept] || 0) + (q.missed || 1); });
  return Object.entries(map).map(([concept, k]) => ({ concept, n: k })).sort((a, b) => b.n - a.n).slice(0, n);
}
