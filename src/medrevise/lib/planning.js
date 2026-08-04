/* ============================================================
   MedRevise — planning "méthode des J" calculé sur le moteur ADAPTATIF de
   chaque carte (intervalDays/dueDate, voir lib/sm2.js advanceQuestion), pas
   un hash. Fonctions PURES sur un snapshot { sources, matieres, fiches,
   questions }.
   ============================================================ */
import { labelForCursor, todayISO, isoDate, trueDaysSinceJ0, isDueBecauseStruggled } from './sm2.js';

const SCHEDULED_TYPES = new Set(['qcm', 'flashcard']);
// exercices : HORS méthode des J (comme le Feynman). Ils ne sont plus programmés,
// ne comptent pas dans la série du jour ni dans les compteurs de cartes dues. On
// les choisit librement dans une liste dédiée (page Exercice). Le code SM-2 reste
// intact pour qcm/flashcard/schéma — on décidera plus tard d'une réintégration.
const EXERCICE_TYPE = 'exercice';
// types comptant pour le J AFFICHÉ d'une fiche (théorie uniquement désormais)
const J_TYPES = new Set(['qcm', 'flashcard']);

/** date de la PROCHAINE échéance non faite d'une carte/fiche planifiée
   (moteur adaptatif, intervalDays/dueDate) — null si le cycle est terminé
   (`termine`) ou si la carte n'a pas encore d'échéance. SEUL point de
   lecture de `dueDate` pour le calcul des "dues" de ce fichier — ne pas
   dupliquer cette lecture nulle part ailleurs. */
function nextDate(record) {
  if (!record || record.termine) return null;
  return record.dueDate || null;
}

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

/** une fiche est dans le planning si la SOURCE a les rappels J activés (et non archivée)
 *  ET que la fiche elle-même n'a pas été retirée individuellement (fiche.rappelsJ) */
export function isFicheScheduled(db, fiche, idx) {
  const { mById, sById } = idx || index(db);
  if (!fiche || fiche.archive) return false;
  if (fiche.rappelsJ === false) return false;
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
/** samedi/dimanche EN HEURE LOCALE (jamais d'UTC, comme isoDate/todayISO) —
   déclenche le traitement visuel week-end de la boîte de rattrapage
   (Dashboard.jsx RattrapageCard). */
export function isWeekend(d = new Date()) {
  const day = d.getDay();
  return day === 0 || day === 6;
}

/* ---- due questions ---- */
export function scheduledQuestions(db, idx) {
  const ix = idx || index(db);
  return (db.questions || []).filter((q) => SCHEDULED_TYPES.has(q.type) && isFicheScheduled(db, ix.fById[q.ficheId], ix));
}

/** questions dues à une date (par défaut aujourd'hui) — STRICTEMENT ce jour-là,
   retard EXCLU (le retard vit exclusivement dans overdueQuestions/la boîte de
   rattrapage du Dashboard, jamais mélangé à "dû aujourd'hui" — voir
   docs/audit-methode-des-J.md pour l'ancien comportement, où une carte en
   retard restait dans le flux du jour ET dans la boîte en double affichage).
   Moteur adaptatif : une carte ne porte plus qu'UNE seule échéance connue
   (`dueDate`), donc "aujourd'hui" et "un jour futur" utilisent EXACTEMENT la
   même comparaison (match strict sur `dueDate`) — plus de projection à
   part (voir weekData, qui a perdu la profondeur des J+30/J+90 affichés à
   l'avance, perte assumée). Jamais de révision dans le passé (le retard vit
   dans overdueQuestions).
   « Sauter » (`q.skippedOn`, MedReviseApp.jsx skipDaySource/skipDayFiche) :
   exclut une carte UNIQUEMENT le jour exact où elle a été sautée — aucune
   écriture de progression, `dueDate`/`intervalDays` intacts, donc elle
   redevient normalement "dues" dès le jour suivant (dateISO change, le
   match `skippedOn === dateISO` ne tient plus). Comparaison ici, PAS dans
   `nextDate` : `nextDate`/labelForCursor doivent continuer de refléter la
   vraie prochaine échéance de la carte, sauter ne la change pas. */
export function dueOn(db, dateISO, idx) {
  const ix = idx || index(db);
  if (dateISO < todayISO()) return [];
  return scheduledQuestions(db, ix).filter((q) => nextDate(q) === dateISO && q.skippedOn !== dateISO);
}
export function dueToday(db, idx) { return dueOn(db, todayISO(), idx); }

/* ---- « boîte des J non faits » : items dont l'échéance est STRICTEMENT passée
   (nextDate < aujourd'hui) — SEULE source du retard désormais (dueToday ne
   l'inclut plus du tout, voir dueOn). Ne recale RIEN d'elle-même : seule une
   VRAIE notation (advanceQuestion, lib/sm2.js) recalcule `dueDate`. ---- */
export function overdueQuestions(db, idx) {
  const ix = idx || index(db);
  const today = todayISO();
  return scheduledQuestions(db, ix).filter((q) => { const d = nextDate(q); return d != null && d < today; });
}
export function overdueSchemas(db, idx) {
  const ix = idx || index(db);
  const today = todayISO();
  return scheduledSchemas(db, ix).filter((f) => { const d = nextDate(f); return d != null && d < today; });
}
/** regroupe questions ET schémas en retard, une entrée par fiche, triée par
   ancienneté (la plus en retard d'abord — priorité). */
export function overdueByFiche(db, idx) {
  const ix = idx || index(db);
  const qGroups = groupByFiche(db, overdueQuestions(db, ix), ix).map((g) => ({
    ...g, isSchema: false,
    oldest: g.items.reduce((min, q) => (nextDate(q) < min ? nextDate(q) : min), nextDate(g.items[0])),
  }));
  const schemaGroups = overdueSchemas(db, ix).map((f) => {
    const m = ix.mById[f.matiereId];
    return {
      fiche: f, matiere: m, source: m && ix.sById[m.sourceId], items: [], qcm: 0, flash: 0, isSchema: true,
      ...ficheJ(db, f.id, ix), coef: effectiveCoef(db, f, ix), oldest: nextDate(f) || todayISO(),
    };
  });
  return [...qGroups, ...schemaGroups].sort((a, b) => (a.oldest < b.oldest ? -1 : a.oldest > b.oldest ? 1 : 0));
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

/** vrai si l'exercice porte les 2 champs de la méthode des J des exos
   (prompt "pratique méthode J") : `jalon` (J0/J+2/J+7/J+15/J+30/J+45) ET
   `difficulte_exo` (F/M/D) — schema.js#normExercice les normalise déjà à
   `null` s'ils sont absents/invalides (voir EXO_JALONS/EXO_DIFFICULTES), un
   simple test de présence suffit ici, pas besoin de revalider les valeurs.
   Purement un marquage visuel (badge cours/pastille exo) — ne modifie ni ne
   filtre jamais la planification (dueExosOn/dueDateForJalon, inchangés). */
export function isExoConforme(q) {
  return !!(q && q.jalon && q.difficulte_exo);
}

/* ---- méthode des J des EXERCICES (Étape A) : cadence PROPRE (sm2.js
   dueDateForJalon), une seule échéance par item (`dueDate`), JAMAIS mélangée
   aux compteurs théorie — filtrée par EXERCICE_TYPE, disjoint de
   SCHEDULED_TYPES (dueOn/dueToday) par construction. Match EXACT uniquement
   (pas de "dû + retard" : le rattrapage exercices est un chantier séparé,
   étape C) — un exo dont l'échéance est déjà passée (J0 posé dans le passé)
   ne matche simplement plus rien ici : ni dû, ni en retard, même logique
   que la théorie. Exclut les exos déjà répondus (exerciceStatus !== 'todo')
   — consommés, ils ne réapparaissent jamais (pas de notion de "prochain
   jalon" pour un exercice, contrairement à une carte théorie). ---- */
export function dueExosOn(db, dateISO, idx) {
  const ix = idx || index(db);
  return (db.questions || []).filter((q) =>
    q.type === EXERCICE_TYPE && q.dueDate === dateISO && exerciceStatus(q) === 'todo'
    && ix.fById[q.ficheId] && isFicheScheduled(db, ix.fById[q.ficheId], ix));
}
export function dueExosToday(db, idx) { return dueExosOn(db, todayISO(), idx); }
/** exercices dus à une date donnée, regroupés par fiche — même esprit que
   groupByFiche, en plus léger (pas de J label théorie, non pertinent pour
   un exercice). Paramétrée par date (pas seulement "aujourd'hui") pour
   alimenter à la fois la card "Exercices du jour" (dueExosByFiche, ci-
   dessous) ET le calendrier hebdo (weekData, qui l'appelle jour par jour —
   dueExosOn matche déjà une échéance EXACTE par date, aucune projection à
   gérer contrairement à la théorie). */
export function dueExosByFicheOn(db, dateISO, idx) {
  const ix = idx || index(db);
  const map = {};
  dueExosOn(db, dateISO, ix).forEach((q) => {
    const f = ix.fById[q.ficheId];
    if (!f) return;
    if (!map[f.id]) {
      const m = ix.mById[f.matiereId];
      map[f.id] = { fiche: f, matiere: m, source: m && ix.sById[m.sourceId], items: [] };
    }
    map[f.id].items.push(q);
  });
  return Object.values(map);
}
export function dueExosByFiche(db, idx) { return dueExosByFicheOn(db, todayISO(), idx); }

/* ---- révision week-end (Dashboard, WeekendReviewCard) : PAS la méthode des J
   des exos (dueExosOn, échéance dueDate) — ici on ressort des exos DÉJÀ FAITS
   cette semaine (lundi → aujourd'hui, même notion que weekData/
   startOfWeekISO), pour une session bonus de mémorisation. Lecture SEULE de
   `historique` : cette fonction ne modifie jamais rien, et le mode 'weekend'
   de startExercice (voir MedReviseApp.jsx/Exercice.jsx) n'écrit rien non plus
   quand on rejoue un exo depuis ici — la tentative de la semaine reste la
   dernière du dossier, le statut/dueDate de l'exo ne bougent pas. */
export function weekendReviewByFiche(db, idx) {
  const ix = idx || index(db);
  const monday = startOfWeekISO(todayISO());
  const today = todayISO();
  const map = {};
  (db.questions || []).forEach((q) => {
    if (q.type !== EXERCICE_TYPE) return;
    const f = ix.fById[q.ficheId];
    if (!f || !isFicheScheduled(db, f, ix)) return;
    const attemptsThisWeek = (q.historique || []).filter((h) => h.date >= monday && h.date <= today);
    if (!attemptsThisWeek.length) return;
    const lastDate = attemptsThisWeek.reduce((max, h) => (h.date > max ? h.date : max), attemptsThisWeek[0].date);
    if (!map[f.id]) {
      const m = ix.mById[f.matiereId];
      map[f.id] = { fiche: f, matiere: m, source: m && ix.sById[m.sourceId], items: [] };
    }
    map[f.id].items.push({ q, lastDate });
  });
  // 2 exos MAX par fiche — les 2 tentés le plus récemment cette semaine (pas
  // de priorité aux ratés, pas de complément si le chapitre n'en a qu'1 : ce
  // sont les MÊMES exos déjà vus, jamais des neufs).
  return Object.values(map).map((g) => ({
    ...g,
    items: g.items.slice().sort((a, b) => (a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : 0)).slice(0, 2).map((e) => e.q),
  }));
}

/* ---- schémas d'anatomie visuelle (anat_schema) : la FICHE elle-même est
   l'item planifiable (elle porte intervalDays/dueDate, même moteur adaptatif
   que qcm/flashcard, voir lib/sm2.js), pas des questions. On les gère en
   parallèle des questions. ---- */
export function scheduledSchemas(db, idx) {
  const ix = idx || index(db);
  return (db.fiches || []).filter((f) => f.type === 'anat_schema' && isFicheScheduled(db, f, ix));
}
export function dueSchemasOn(db, dateISO, idx) {
  const ix = idx || index(db);
  if (dateISO < todayISO()) return [];
  return scheduledSchemas(db, ix).filter((f) => nextDate(f) === dateISO);
}
export function dueSchemasToday(db, idx) { return dueSchemasOn(db, todayISO(), idx); }

/** J affiché d'une fiche : anat_schema → dérivé de la fiche elle-même ;
   sinon → dérivé de sa question la plus proche d'échéance (une carte déjà
   terminée ne masque jamais une carte encore active).
   `jTrueDays`/`aRevoir` (anat_schema uniquement ici — pas de liste d'items
   séparée pour un schéma, la fiche EST l'item) : voir sm2.js
   trueDaysSinceJ0/isDueBecauseStruggled. Pour qcm/flashcard, ces deux champs
   sont calculés par `groupByFiche` à partir des items RÉELLEMENT groupés
   (plus fidèle que de rejouer une recherche "soonest" indépendante ici). */
export function ficheJ(db, ficheId, idx) {
  const ix = idx || index(db);
  const f = ix.fById[ficheId];
  if (f && f.type === 'anat_schema') {
    return { ...labelForCursor(f), jTrueDays: trueDaysSinceJ0(f), aRevoir: isDueBecauseStruggled(f) };
  }
  const qs = (db.questions || []).filter((q) => q.ficheId === ficheId && J_TYPES.has(q.type));
  if (!qs.length) return { jIndex: -1, jLabel: '—' };
  const soonest = qs.reduce((a, b) => {
    const da = nextDate(a), db_ = nextDate(b);
    if (da == null) return b;
    if (db_ == null) return a;
    return da <= db_ ? a : b;
  });
  return labelForCursor(soonest);
}

/* ---- décalage/pose du départ (J0) — Réviser, étape 1/3. Cible les cartes
   SANS planning actif (`q.intervalDays == null`, ex. après un Reset des J)
   ET les cartes jamais révisées (`historique` vide, un intervalle existe
   déjà mais aucune note encore prise) : ré-ancrer leur départ (startAdaptive)
   ne perd aucun historique puisqu'il n'y en a pas encore, ou plus rien à
   perdre (déjà effacé par le reset). ---- */
export function isUnstarted(q) {
  return q.intervalDays == null || !(q.historique && q.historique.length);
}
/** cartes qcm/flashcard sans planning actif OU jamais révisées, d'un cours
   ({sourceId}) ou d'une seule fiche ({ficheId}) — alimente à la fois le
   compteur de confirmation et la cible de la mutation (décalage/pose de
   J0), pour ne pas dupliquer le filtre entre les deux. */
export function unstartedQuestionsFor(db, { sourceId, ficheId } = {}, idx) {
  const ix = idx || index(db);
  return (db.questions || []).filter((q) => {
    if (!SCHEDULED_TYPES.has(q.type) || !isUnstarted(q)) return false;
    const f = ix.fById[q.ficheId];
    if (!f) return false;
    if (ficheId) return f.id === ficheId;
    if (sourceId) { const m = ix.mById[f.matiereId]; return !!m && m.sourceId === sourceId; }
    return false;
  });
}
/** miroir de unstartedQuestionsFor pour les fiches `anat_schema` (l'item
   planifiable vit sur la FICHE, pas sur des questions — voir
   scheduledSchemas) : jamais couvert avant, nécessaire pour qu'une fiche
   schéma resetée (plus de `plan` du tout) puisse elle aussi se faire poser
   un J0 via "Décaler le départ". */
export function unstartedSchemasFor(db, { sourceId, ficheId } = {}, idx) {
  const ix = idx || index(db);
  return (db.fiches || []).filter((f) => {
    if (f.type !== 'anat_schema' || !isUnstarted(f)) return false;
    if (ficheId) return f.id === ficheId;
    if (sourceId) { const m = ix.mById[f.matiereId]; return !!m && m.sourceId === sourceId; }
    return false;
  });
}
/** miroir de unstartedQuestionsFor pour les EXERCICES (méthode des J propre,
   sm2.js dueDateForJalon/EXO_DELAYS — jamais mélangée à la théorie ci-dessus,
   canal séparé, voir SCHEDULED_TYPES vs EXERCICE_TYPE). Cible les exercices
   `jalon` (sinon rien à recalculer, voir dueDateForJalon) JAMAIS tentés
   (exerciceStatus 'todo') — un exercice déjà répondu ne "revient" jamais à
   une échéance suivante (contrairement à une carte théorie), décaler sa
   dueDate n'aurait aucun effet observable ; on ne le touche donc pas, même
   philosophie que isUnstarted côté théorie (ne jamais recaler une progression
   déjà entamée). */
export function unstartedExosFor(db, { sourceId, ficheId } = {}, idx) {
  const ix = idx || index(db);
  return (db.questions || []).filter((q) => {
    if (q.type !== EXERCICE_TYPE || !q.jalon || exerciceStatus(q) !== 'todo') return false;
    const f = ix.fById[q.ficheId];
    if (!f) return false;
    if (ficheId) return f.id === ficheId;
    if (sourceId) { const m = ix.mById[f.matiereId]; return !!m && m.sourceId === sourceId; }
    return false;
  });
}

/* ---- rééquilibrage calendrier — Réviser, étape 2/3. Déplace des cartes DÉJÀ
   EN CYCLE : contrairement à isUnstarted ci-dessus, aucun filtre — seule
   `dueDate` change à la mutation (MedReviseApp.jsx moveSourceDay/
   moveFicheDay), `intervalDays`/`historique`/`missed` intacts (aucun toggle
   cascade : le moteur adaptatif n'a plus qu'une seule échéance par carte,
   voir la mécanique validée). dueOnFor restreint dueOn() (même sémantique :
   "aujourd'hui" inclut le retard) à un cours ou une fiche, pour cibler
   EXACTEMENT les cartes réellement dues ce jour précis. */
export function dueOnFor(db, dateISO, { sourceId, ficheId } = {}, idx) {
  const ix = idx || index(db);
  return dueOn(db, dateISO, ix).filter((q) => {
    const f = ix.fById[q.ficheId];
    if (!f) return false;
    if (ficheId) return f.id === ficheId;
    if (sourceId) { const m = ix.mById[f.matiereId]; return !!m && m.sourceId === sourceId; }
    return false;
  });
}

/** regroupe une liste de questions par fiche, avec compteurs + J + coef.
   `aRevoir`/`jTrueDays` calculés à partir des ITEMS RÉELLEMENT groupés ici
   (les cartes effectivement dues ce jour-là pour cette fiche), pas d'une
   recherche indépendante sur toute la fiche (voir sm2.js
   isDueBecauseStruggled/trueDaysSinceJ0) :
   - `aRevoir` = au moins une carte du groupe revient parce que sa dernière
     note était Difficile/Ratée (pas juste son cours normal) ;
   - `jTrueDays` = la plus ANCIENNE (max) parmi les cartes du groupe — la
     carte présente dans ce cycle depuis le plus longtemps, repère le plus
     représentatif du "temps de vie" de cette fiche à cette date. */
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
    aRevoir: g.items.some(isDueBecauseStruggled),
    jTrueDays: g.items.reduce((max, q) => {
      const d = trueDaysSinceJ0(q);
      return d != null && (max == null || d > max) ? d : max;
    }, null),
  }));
}

/** plan d'aujourd'hui groupé par fiche, plus volumineux d'abord */
export function todayPlan(db, idx) {
  return groupByFiche(db, dueToday(db, idx), idx).sort((a, b) => b.items.length - a.items.length);
}

/** répartition Cours → Fiche des cartes RÉELLEMENT dues à une date (retard
   inclus pour aujourd'hui, voir dueOn) — alimente le rééquilibrage calendrier
   (étape 2/3, DayPopup desktop + plan du jour mobile) : chaque groupe cours
   porte ses fiches (groupByFiche), pour permettre un bouton « Déplacer » au
   niveau cours ET au niveau fiche depuis la même liste. Triée par volume
   décroissant (le cours le plus chargé d'abord). */
export function dueByCoursOn(db, dateISO, idx) {
  const ix = idx || index(db);
  // moteur adaptatif : une carte n'a qu'UNE échéance connue (dueDate), donc le
  // libellage par défaut de groupByFiche/ficheJ (palier COURANT) est déjà
  // exact quel que soit le jour interrogé — plus besoin de réétiqueter
  // l'occurrence (contrairement à l'ancienne chronologie fixe à 7 crans).
  const byFiche = groupByFiche(db, dueOn(db, dateISO, ix), ix);
  const bySource = {};
  byFiche.forEach((g) => {
    const sid = g.source ? g.source.id : '?';
    if (!bySource[sid]) bySource[sid] = { source: g.source, fiches: [], total: 0 };
    bySource[sid].fiches.push(g);
    bySource[sid].total += g.items.length;
  });
  return Object.values(bySource).sort((a, b) => b.total - a.total);
}

/** vrai si `record` a été révisé exactement à `dateISO` (une entrée
   historique[] datée ce jour-là) — SEUL point de lecture rétrospective du
   calendrier (weekData, jours passés) : purement AFFICHAGE, ne sert jamais
   au calcul du dû/en retard (dueOn/overdueQuestions, basés sur dueDate). */
function reviewedOn(record, dateISO) {
  return !!(record && record.historique && record.historique.some((h) => h.date === dateISO));
}

/** semaine de 7 jours (weekOffset: 0 = cette semaine). Moteur adaptatif :
   une carte ne porte plus qu'UNE échéance connue (dueDate) — "aujourd'hui"
   et "un jour futur" utilisent donc EXACTEMENT le même calcul réel (dueOn/
   dueSchemasOn), là où l'ancienne chronologie fixe lisait une projection à
   part (ficheProjection) pour les jours futurs. Perte assumée de la
   profondeur du calendrier (plus de J+30/J+90 affichés à l'avance : la
   prochaine échéance après celle-ci n'existe pas tant qu'elle n'a pas été
   notée) — voir la mécanique validée.
   Jours PASSÉS : AFFICHAGE seul (jamais de calcul de dû/retard, qui reste
   exclusivement dueOn/overdueQuestions) — reconstitue ce qui a été révisé
   CE jour-là via `historique[]` (reviewedOn), pour un simple rappel visuel
   estompé (.wcal-day.past{opacity:.42}, déjà en place côté CSS) ; aucune
   action n'y est proposée (Réorganiser/Sauter ciblent dueOn/dueOnFor, qui ne
   retournent jamais rien pour une date passée — lecture seule de fait, sans
   code de garde supplémentaire à ajouter ici). */
export function weekData(db, weekOffset = 0, idx) {
  const ix = idx || index(db);
  const today = todayISO();
  const monday = addDays(startOfWeekISO(today), weekOffset * 7);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    const isToday = date === today;
    const isPast = date < today;
    let items = [], schemas = [], byFiche = [], exos = [];

    if (isPast) {
      items = scheduledQuestions(db, ix).filter((q) => reviewedOn(q, date));
      schemas = scheduledSchemas(db, ix).filter((f) => reviewedOn(f, date)).map((f) => ({ fiche: f, matiere: ix.mById[f.matiereId], ...ficheJ(db, f.id, ix) }));
      byFiche = groupByFiche(db, items, ix);
    } else {
      items = dueOn(db, date, ix);
      schemas = dueSchemasOn(db, date, ix).map((f) => ({ fiche: f, matiere: ix.mById[f.matiereId], ...ficheJ(db, f.id, ix) }));
      byFiche = groupByFiche(db, items, ix);
    }

    // exercices : canal SÉPARÉ de la théorie (dueExosByFicheOn, échéance EXACTE
    // par dueDate, jamais de projection ni de retard) — calculé aujourd'hui ET
    // les jours futurs. Jours passés : hors périmètre de cette demande (purement
    // "cours/cartes"), reste vide comme avant.
    if (!isPast) exos = dueExosByFicheOn(db, date, ix);
    const exosTotal = exos.reduce((s, g) => s + g.items.length, 0);

    const isProjected = !isToday && !isPast;
    days.push({
      date, dow: DOW[i], dayNum: new Date(date + 'T00:00:00').getDate(),
      isToday, isPast, isProjected,
      // total affiché = cartes réelles (aujourd'hui/passé) OU cours projetés (futur) + schémas + exercices
      total: (isProjected ? byFiche.length : items.length) + schemas.length + exosTotal,
      cardsTotal: isProjected ? byFiche.length : items.length,
      items, schemas, byFiche, exos, exosTotal,
    });
  }
  return { monday, days };
}

/* ============================================================
   Carnet d'erreurs v2 — SEUL carnet d'erreurs de l'app (l'ancien mécanisme
   cumulatif/pondéré — missedQuestions/weakPoints/topConcepts, ficheStillExists —
   a été entièrement retiré : plus aucun écran ne le consulte). `missed` reste
   un champ géré par le moteur chrono (advanceQuestion/recordExerciceAttempt,
   sm2.js) — INCHANGÉ, ce n'est plus QUE de la bookkeeping interne au cycle des
   J, sans lecteur applicatif.
   V1 = flashcard normale marquée en carnet (carnetAt non-null, voir
   Session.jsx/MobileSession.jsx étape 1). V2 = flashcard d'erreur liée
   (type 'flashcard_erreur', voir storage.js#newErrorCard) — jamais dans
   SCHEDULED_TYPES, donc déjà absente de tout calcul ci-dessus par
   construction, pas besoin d'exclusion explicite.
   ============================================================ */
export function carnetV1Questions(db) {
  return (db.questions || []).filter((q) => q.type === 'flashcard' && q.carnetAt);
}
/** `statut` optionnel ('a_revoir'|'resolu'|'pause') pour ne récupérer qu'une catégorie. */
export function carnetV2Questions(db, statut) {
  return (db.questions || []).filter((q) => q.type === 'flashcard_erreur' && (!statut || q.statut === statut));
}

/* ============================================================
   QCM — nombre conseillé + rotation du stock (v1.1, Étapes 3-4). Distinct de
   la méthode des J (SM-2 par item) : ceci module la TAILLE d'une série QCM
   lancée en révision libre (page Reviser, bouton QCM d'une fiche), en piochant
   dans le stock existant de la fiche — jamais d'invention de contenu.
   ============================================================ */

/** meta.qcm_conseille (fiche.meta, JSON v1.1) → entier positif, ou null si absent/invalide. */
export function qcmConseilleFor(fiche) {
  const n = fiche && fiche.meta && fiche.meta.qcm_conseille;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Choisit `n` QCM parmi `items` en FAISANT TOURNER le stock : priorité absolue
 * aux ratés récents (q.lastResult === 'ko'), puis aux jamais-vus/vus il y a le
 * plus longtemps (q.lastSeenAt, mis à jour à chaque présentation — voir
 * markQcmSeen dans session/Session.jsx). Sur plusieurs J, en tournant, tout le
 * stock finit par être vu. n >= items.length → tout le stock (pas de rotation
 * à faire). Ne choisit QUE dans le stock fourni, n'invente rien.
 */
export function pickQcmSubset(items, n) {
  if (!items || !items.length || n == null || n >= items.length) return items || [];
  const ranked = items.slice().sort((a, b) => {
    const aFailed = a.lastResult === 'ko', bFailed = b.lastResult === 'ko';
    if (aFailed !== bFailed) return aFailed ? -1 : 1; // raté récent → priorité absolue
    const aSeen = a.lastSeenAt || null, bSeen = b.lastSeenAt || null;
    if (!aSeen !== !bSeen) return aSeen ? 1 : -1; // jamais vu → priorité
    if (aSeen && bSeen && aSeen !== bSeen) return aSeen < bSeen ? -1 : 1; // vu il y a le plus longtemps → priorité
    return 0;
  });
  return ranked.slice(0, Math.max(1, n));
}
