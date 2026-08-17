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
   dupliquer cette lecture nulle part ailleurs.
   « Sauter » (`q.skippedOn`, MedReviseApp.jsx skipDaySource/skipDayFiche) :
   ÉCHÉANCE EFFECTIVE, jamais écrite en base — `dueDate` réel reste intact à
   vie (aucune mutation ici, fonction PURE). Si la carte a été sautée LE
   JOUR de son échéance réelle ou après (`skippedOn >= dueDate` — cas d'un
   saut répété plusieurs jours de suite, voir skipDayFiche), la date lue par
   dueOn/overdueQuestions/overdueByFiche devient `skippedOn + 1 jour` au
   lieu de `dueDate` : la carte disparaît du jour sauté (plus de match exact
   avec aujourd'hui) ET ne tombe PAS dans "À rattraper" le lendemain (elle
   redevient "due normalement" ce jour-là, pas "en retard") — seulement si
   elle reste non révisée APRÈS ce lendemain qu'elle rejoint le retard
   légitime (comportement identique à n'importe quelle carte due, jamais
   traitée). Un `skippedOn` d'un cycle antérieur (< dueDate courant, ex.
   après une vraie révision qui a fait avancer dueDate) ne matche plus la
   condition et n'a donc aucun effet — pas de rémanence indéfinie. */
function nextDate(record) {
  if (!record || record.termine) return null;
  const due = record.dueDate || null;
  if (due != null && record.skippedOn && record.skippedOn >= due) return addDays(record.skippedOn, 1);
  return due;
}

/* ---- index helpers ---- */
export function index(db) {
  const sById = Object.fromEntries((db.sources || []).map((s) => [s.id, s]));
  const mById = Object.fromEntries((db.matieres || []).map((m) => [m.id, m]));
  const fById = Object.fromEntries((db.fiches || []).map((f) => [f.id, f]));
  return { sById, mById, fById };
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
      ...ficheJ(db, f.id, ix), oldest: nextDate(f) || todayISO(),
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

/* ---- CARTE WEEK-END « À revoir » (chantier 4) — remplace l'ancien récap
   "exercices de la semaine" (weekExosByMatiere, retiré avec la méthode des J
   des exercices) et les fonctions de dû (dueExosOn/dueExosToday/
   dueExosByFicheOn/unstartedExosFor/isExoConforme, retirées elles aussi).

   Sélection : les exercices marqués « à revoir » PENDANT LA SEMAINE COURANTE
   (lundi → dimanche, même notion de semaine que startOfWeekISO/weekData). Un
   exo marqué une semaine précédente n'y figure PLUS — sauf s'il est re-marqué
   cette semaine, ce qui réécrit sa dernière entrée d'historique.

   AUCUN champ nouveau : le statut vient de exerciceStatus (dernière entrée de
   historique[]) et la date de marquage est celle de cette même entrée, écrite
   par sm2.js#recordExerciceAttempt. Même principe que lastTwoAreFails — on
   dérive de la source de vérité plutôt que d'entretenir un champ parallèle qui
   pourrait diverger.

   Accepte les exos SANS fiche (exos de chapitre, chapitreId — voir
   storage.js#newChapitreExo) : leur matière se résout via le chapitre. Un exo
   dont ni la fiche ni le chapitre n'existent plus est ignoré (jamais de groupe
   fantôme). Regroupement par MATIÈRE, comme l'ancienne card. ---- */
export function lastAttemptDate(q) {
  const h = (q && q.historique) || [];
  return h.length ? h[h.length - 1].date || null : null;
}

export function exosARevoirCetteSemaine(db, idx) {
  const ix = idx || index(db);
  const monday = startOfWeekISO(todayISO());
  const sunday = addDays(monday, 6);
  const dossiers = db.dossiers || [];
  const map = {};
  (db.questions || []).forEach((q) => {
    if (q.type !== EXERCICE_TYPE || exerciceStatus(q) !== 'review') return;
    const marque = lastAttemptDate(q);
    if (!marque || marque < monday || marque > sunday) return;
    // porteur = la fiche (exo de fiche) OU le chapitre (exo de chapitre) ;
    // l'un des deux au moins doit exister encore.
    const fiche = ix.fById[q.ficheId];
    if (fiche && fiche.archive) return;
    const chapitre = !fiche && q.chapitreId ? dossiers.find((d) => d.id === q.chapitreId) : null;
    if (!fiche && !chapitre) return;
    const m = ix.mById[fiche ? fiche.matiereId : chapitre.matiereId];
    const mid = m ? m.id : '?';
    if (!map[mid]) map[mid] = { matiere: m, items: [] };
    map[mid].items.push({ q, fiche: fiche || null, chapitre, marque, contexte: fiche ? fiche.titre : chapitre.nom });
  });
  return Object.values(map)
    .map((g) => ({ ...g, items: g.items.slice().sort((a, b) => (a.marque < b.marque ? -1 : a.marque > b.marque ? 1 : 0)) }))
    .sort((a, b) => (b.items.length - a.items.length)
      || (a.matiere && b.matiere ? String(a.matiere.nom).localeCompare(String(b.matiere.nom)) : 0));
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

/** libellé "J+N" (jLabel/jIndex, sm2.js#labelForCursor) de la carte la PLUS
   PROCHE D'ÉCHÉANCE parmi une LISTE DONNÉE — factorisé pour servir deux
   usages différents avec la MÊME logique de sélection :
   - `ficheJ` l'appelle avec TOUTES les cartes théorie de la fiche (vue
     "prochaine échéance" globale, ex. TodaySeriesCard "Prochain : ...") ;
   - `groupByFiche` l'appelle avec SEULEMENT les cartes du groupe qu'il vient
     de construire (celles réellement dues CE jour précis, calendrier/vue
     Réorganiser).
   Bug corrigé (audit 2026-08-04, "La diffraction" bloquée à "J+1" plusieurs
   jours de suite) : `groupByFiche` réutilisait `ficheJ` AVEC LA FICHE
   ENTIÈRE — si UNE carte de la fiche traînait à intervalle 1, le badge du
   jour affichait "J+1" en permanence, MÊME les jours où la carte due n'était
   même pas celle-là (les autres avaient pourtant bien progressé, J+3/J+7).
   Le calcul d'intervalle lui-même (sm2.js#advanceQuestion) n'a jamais été en
   cause — uniquement CE badge, qui pioche maintenant dans le bon lot. */
function soonestLabel(items) {
  if (!items.length) return { jIndex: -1, jLabel: '—' };
  const soonest = items.reduce((a, b) => {
    const da = nextDate(a), db_ = nextDate(b);
    if (da == null) return b;
    if (db_ == null) return a;
    return da <= db_ ? a : b;
  });
  return labelForCursor(soonest);
}

/** J affiché d'une fiche : anat_schema → dérivé de la fiche elle-même ;
   sinon → dérivé de sa question la plus proche d'échéance, PARMI TOUTE la
   fiche (une carte déjà terminée ne masque jamais une carte encore active) —
   usage volontairement GLOBAL, pas "ce jour-là" (voir soonestLabel/
   groupByFiche pour la version day-scoped, utilisée par le calendrier).
   `jTrueDays`/`aRevoirCount` (anat_schema uniquement ici — pas de liste
   d'items séparée pour un schéma, la fiche EST l'item) : voir sm2.js
   trueDaysSinceJ0/isDueBecauseStruggled. Pour qcm/flashcard, ces deux champs
   sont calculés par `groupByFiche` à partir des items RÉELLEMENT groupés
   (plus fidèle que de rejouer une recherche "soonest" indépendante ici). */
export function ficheJ(db, ficheId, idx) {
  const ix = idx || index(db);
  const f = ix.fById[ficheId];
  if (f && f.type === 'anat_schema') {
    return { ...labelForCursor(f), jTrueDays: trueDaysSinceJ0(f), aRevoirCount: isDueBecauseStruggled(f) ? 1 : 0 };
  }
  const qs = (db.questions || []).filter((q) => q.ficheId === ficheId && J_TYPES.has(q.type));
  return soonestLabel(qs);
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

/** regroupe une liste de questions par fiche, avec compteurs + J.
   `jLabel`/`jIndex` (soonestLabel), `aRevoirCount`/`jTrueDays` — TOUS
   calculés à partir des ITEMS RÉELLEMENT groupés ici (les cartes
   effectivement dues ce jour-là pour cette fiche), jamais d'une recherche
   indépendante sur toute la fiche (voir sm2.js isDueBecauseStruggled/
   trueDaysSinceJ0, et soonestLabel ci-dessus pour le détail du bug corrigé) :
   - `jLabel`/`jIndex` = intervalle de la carte du GROUPE la plus proche
     d'échéance (day-scoped, contrairement à ficheJ) ;
   - `aRevoirCount` = NOMBRE de cartes du groupe dont la dernière note était
     Difficile/Ratée (jamais un simple booléen "au moins une" — Anomalie 2,
     audit 2026-08-04 : un triangle générique sur tout un cours de 40 cartes
     alors que 17 seulement étaient concernées, aucune façon de le savoir) ;
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
    ...soonestLabel(g.items),
    aRevoirCount: g.items.filter(isDueBecauseStruggled).length,
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
    let items = [], schemas = [], byFiche = [];

    if (isPast) {
      items = scheduledQuestions(db, ix).filter((q) => reviewedOn(q, date));
      // PAS de ficheJ()/soonestLabel() ici (bug corrigé, audit 2026-08-05) :
      // `jLabel`/`jIndex`/`jTrueDays`/`aRevoirCount` sont TOUS dérivés de
      // l'état COURANT (aujourd'hui) d'une carte — intervalDays est une
      // valeur PROSPECTIVE ("dans combien de jours la prochaine fois"), pas
      // une trace de ce qui s'est passé CE jour-là. Une carte notée le 28
      // juillet peut avoir été renotée depuis et afficher n'importe quel
      // intervalle "actuel" (7, 30, 90…) sans rapport avec le 28 juillet —
      // le badge sautait donc de façon incohérente d'un jour passé à l'autre
      // selon QUELLES cartes avaient été notées ce jour-là et où elles en
      // sont AUJOURD'HUI. Un jour passé n'affiche donc plus que le compte de
      // cartes/fiche — jamais un "J+N" pour une échéance qui n'en est plus
      // une. (Le calcul d'intervalle lui-même n'a jamais été en cause.)
      schemas = scheduledSchemas(db, ix).filter((f) => reviewedOn(f, date)).map((f) => ({ fiche: f, matiere: ix.mById[f.matiereId] }));
      byFiche = groupByFiche(db, items, ix).map(({ jLabel, jIndex, jTrueDays, aRevoirCount, ...rest }) => rest);
    } else {
      items = dueOn(db, date, ix);
      schemas = dueSchemasOn(db, date, ix).map((f) => ({ fiche: f, matiere: ix.mById[f.matiereId], ...ficheJ(db, f.id, ix) }));
      byFiche = groupByFiche(db, items, ix);
    }

    // (chantier 4) plus AUCUN exercice au calendrier : ils n'ont plus d'échéance.
    // Le canal `exos`/`exosTotal` qui vivait ici a été retiré — la théorie
    // (items/schémas/byFiche ci-dessus) est strictement inchangée.

    const isProjected = !isToday && !isPast;
    days.push({
      date, dow: DOW[i], dayNum: new Date(date + 'T00:00:00').getDate(),
      isToday, isPast, isProjected,
      // total affiché = cartes réelles (aujourd'hui/passé) OU cours projetés (futur) + schémas
      total: (isProjected ? byFiche.length : items.length) + schemas.length,
      cardsTotal: isProjected ? byFiche.length : items.length,
      items, schemas, byFiche,
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
   « Cours à revoir » (Dashboard) — repérage des fiches à retravailler, basé
   UNIQUEMENT sur l'état ACTUEL de chaque carte théorie (qcm/flashcard) :
   sa DERNIÈRE note (isDueBecauseStruggled, sm2.js) est Difficile ou Ratée,
   peu importe sa dueDate/le retard (indépendant de overdueByFiche/la méthode
   des J : une carte peut être "à revoir" au sens ici sans être due). Lecture
   seule de `historique`, aucun champ dérivé stocké — recalculé à la volée à
   chaque appel. Volontairement DISTINCT du carnet d'erreurs (carnetV1/V2
   Questions, flashcards marquées explicitement) : ici, aucun marquage
   manuel, juste un comptage de la dernière note sur TOUTES les cartes
   qcm/flashcard actives (fiche/matière/source non archivées — une fiche
   archivée n'a plus rien "à retravailler"). ============================== */
export function strugglingByFiche(db, idx) {
  const ix = idx || index(db);
  const map = {};
  (db.questions || []).forEach((q) => {
    if (!SCHEDULED_TYPES.has(q.type) || !isDueBecauseStruggled(q)) return;
    const f = ix.fById[q.ficheId];
    if (!f || f.archive) return;
    const m = ix.mById[f.matiereId];
    if (!m || m.archive) return;
    const s = ix.sById[m.sourceId];
    if (!s || s.archive) return;
    if (!map[f.id]) map[f.id] = { fiche: f, matiere: m, source: s, count: 0 };
    map[f.id].count++;
  });
  return Object.values(map).sort((a, b) => b.count - a.count);
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
