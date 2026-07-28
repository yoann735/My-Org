/* ============================================================
   MedRevise — planning "méthode des J" calculé sur les vraies
   échéances par question (nextReview), pas un hash. Fonctions PURES
   sur un snapshot { sources, matieres, fiches, questions }.
   ============================================================ */
import { jStepForInterval, todayISO, isoDate, J_INTERVALS } from './sm2.js';

const SCHEDULED_TYPES = new Set(['qcm', 'flashcard']);
// exercices : HORS méthode des J (comme le Feynman). Ils ne sont plus programmés,
// ne comptent pas dans la série du jour ni dans les compteurs de cartes dues. On
// les choisit librement dans une liste dédiée (page Exercice). Le code SM-2 reste
// intact pour qcm/flashcard/schéma — on décidera plus tard d'une réintégration.
const EXERCICE_TYPE = 'exercice';
// types comptant pour le J AFFICHÉ d'une fiche (théorie uniquement désormais)
const J_TYPES = new Set(['qcm', 'flashcard']);

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

/* ---- « boîte des J non faits » : items dont l'échéance est STRICTEMENT passée
   (nextReview < aujourd'hui), séparés du "dû aujourd'hui" (dueToday inclut déjà
   le retard, volontairement inchangé — voir dueOn). Ne recale RIEN : réviser
   l'item applique applyReview/sm2 normalement, qui base déjà le prochain
   intervalle sur la date de révision EFFECTIVE (new Date() dans sm2()), jamais
   sur l'échéance manquée — aucune nouvelle logique de planification ici. ---- */
export function overdueQuestions(db, idx) {
  const ix = idx || index(db);
  const today = todayISO();
  return scheduledQuestions(db, ix).filter((q) => q.nextReview < today);
}
export function overdueSchemas(db, idx) {
  const ix = idx || index(db);
  const today = todayISO();
  return scheduledSchemas(db, ix).filter((f) => (f.nextReview || today) < today);
}
/** regroupe questions ET schémas en retard, une entrée par fiche, triée par
   ancienneté (la plus en retard d'abord — priorité). */
export function overdueByFiche(db, idx) {
  const ix = idx || index(db);
  const qGroups = groupByFiche(db, overdueQuestions(db, ix), ix).map((g) => ({
    ...g, isSchema: false,
    oldest: g.items.reduce((min, q) => (q.nextReview < min ? q.nextReview : min), g.items[0].nextReview),
  }));
  const schemaGroups = overdueSchemas(db, ix).map((f) => {
    const m = ix.mById[f.matiereId];
    return {
      fiche: f, matiere: m, source: m && ix.sById[m.sourceId], items: [], qcm: 0, flash: 0, isSchema: true,
      ...ficheJ(db, f.id, ix), coef: effectiveCoef(db, f, ix), oldest: f.nextReview || todayISO(),
    };
  });
  return [...qGroups, ...schemaGroups].sort((a, b) => (a.oldest < b.oldest ? -1 : a.oldest > b.oldest ? 1 : 0));
}

/* ============================================================
   PROJECTION des J futurs (calendrier — lecture seule). Pour une fiche,
   calcule ses prochaines occurrences sur l'échelle J (J_INTERVALS =
   [1,3,7,14,30]) à partir de son échéance EFFECTIVE actuelle :
   - point de départ = nextReview si pas en retard, sinon aujourd'hui +
     interval (même recalage que dismissOverdue — jamais la date manquée) ;
   - puis les rangs suivants de l'échelle, en jours ajoutés à ce point de
     départ (delta entre rangs, pas un enchaînement de vraies révisions).
   RECALCULÉ à chaque appel depuis l'état réel (repetition/interval/
   nextReview) — ne stocke ni ne modifie RIEN, ne touche pas sm2()/
   applyReview. Si la fiche est révisée entre-temps, la projection suivante
   reflète naturellement le nouvel état. ============================== */
export function ficheProjection(db, fiche, idx) {
  const ix = idx || index(db);
  const today = todayISO();
  let interval, nextReview;
  if (fiche.type === 'anat_schema') {
    interval = fiche.interval || 0;
    nextReview = fiche.nextReview || today;
  } else {
    const qs = (db.questions || []).filter((q) => q.ficheId === fiche.id && J_TYPES.has(q.type));
    if (!qs.length) return [];
    const soonest = qs.reduce((a, b) => (a.nextReview <= b.nextReview ? a : b));
    interval = soonest.interval || 0;
    nextReview = soonest.nextReview;
  }
  const anchorDate = nextReview < today ? addDays(today, interval || 1) : nextReview;
  const startIdx = Math.max(jStepForInterval(interval).jIndex, 0);
  const out = [];
  for (let k = startIdx; k < J_INTERVALS.length; k++) {
    const days = k === startIdx ? 0 : (J_INTERVALS[k] - J_INTERVALS[startIdx]);
    out.push({ date: addDays(anchorDate, days), jIndex: k, jLabel: 'J+' + J_INTERVALS[k] });
  }
  return out;
}

/** projection pour toutes les fiches planifiées (rappels J actifs, non archivées). */
export function allFicheProjections(db, idx) {
  const ix = idx || index(db);
  return (db.fiches || [])
    .filter((f) => isFicheScheduled(db, f, ix))
    .map((f) => ({ fiche: f, matiere: ix.mById[f.matiereId], occurrences: ficheProjection(db, f, ix) }))
    .filter((e) => e.occurrences.length);
}

/* ---- exercices (type "exercice") : HORS méthode des J. Aucune planification :
   on les liste simplement (choix libre dans la page Exercice). Le statut d'un
   exercice se lit sur son historique (jamais fait / réussi / à revoir), pas sur
   une échéance. ---- */
export function allExercices(db, idx) {
  const ix = idx || index(db);
  return (db.questions || []).filter((q) => q.type === EXERCICE_TYPE && ix.fById[q.ficheId] && !ix.fById[q.ficheId].archive);
}
/** statut d'un exercice d'après son historique SM-2 (sans planification) :
    - 'todo'   : jamais tenté
    - 'ok'     : dernière tentative réussie (qualité ≥ 3)
    - 'review' : dernière tentative ratée (à revoir) */
export function exerciceStatus(q) {
  const h = q && q.historique;
  if (!h || !h.length) return 'todo';
  return (h[h.length - 1].qualite >= 3) ? 'ok' : 'review';
}

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
  // calculée une fois pour toute la semaine — chaque jour futur y pioche ses
  // occurrences (voir ficheProjection : lecture seule, rien n'est stocké).
  const projections = allFicheProjections(db, ix);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    const isToday = date === today;
    const isPast = date < today;
    let items = [], schemas = [], byFiche = [];

    if (isToday) {
      // aujourd'hui : données RÉELLES et actionnables (inchangé — "Lancer la série").
      items = dueOn(db, date, ix);
      schemas = dueSchemasOn(db, date, ix).map((f) => ({ fiche: f, matiere: ix.mById[f.matiereId], ...ficheJ(db, f.id, ix) }));
      byFiche = groupByFiche(db, items, ix);
    } else if (!isPast) {
      // futur : PROJECTION — toutes les fiches dont une échéance (réelle ou
      // projetée) tombe ce jour-là, tous J confondus. Même forme {fiche,
      // matiere, jLabel} que byFiche/schemas ci-dessus → aucun changement
      // requis côté rendu (WeekCalendar/DayPopup lisent déjà ces champs).
      projections.forEach((p) => {
        p.occurrences.forEach((o) => {
          if (o.date !== date) return;
          const entry = { fiche: p.fiche, matiere: p.matiere, jLabel: o.jLabel };
          if (p.fiche.type === 'anat_schema') schemas.push(entry); else byFiche.push(entry);
        });
      });
    }
    // passé (isPast) : reste vide, comportement inchangé (rien à projeter en arrière).

    days.push({
      date, dow: DOW[i], dayNum: new Date(date + 'T00:00:00').getDate(),
      isToday, isPast, isProjected: !isToday && !isPast,
      // total affiché = cartes réelles (aujourd'hui) OU cours projetés (futur) + schémas
      total: (isToday ? items.length : byFiche.length) + schemas.length,
      cardsTotal: isToday ? items.length : byFiche.length,
      items, schemas, byFiche,
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
