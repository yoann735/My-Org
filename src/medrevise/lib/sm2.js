/* ============================================================
   MedRevise — méthode des J : MOTEUR ADAPTATIF par carte (remplace la
   chronologie FIXE à 7 échéances précalculées — voir docs/audit-methode-
   des-J.md pour l'historique : un PREMIER moteur adaptatif avait déjà
   existé ici et avait été abandonné parce que Difficile/Raté à J0
   reprogrammaient la carte à AUJOURD'HUI, elle revenait donc chaque jour.
   CE moteur-ci évite explicitement ce piège : un Raté ne remet JAMAIS la
   carte "due aujourd'hui" en base — le retour le jour même (relearning
   step) est purement une répétition EN MÉMOIRE DE SESSION (voir
   session/Session.jsx), jamais une deuxième écriture de `dueDate`.
   Une carte (qcm/flashcard, ou fiche anat_schema — même moteur partagé)
   porte :
   - `intervalDays` : intervalle courant en jours (entier ≥ 1), démarre à
     INTERVAL_START (1) à la création (startAdaptive).
   - `dueDate` : date ABSOLUE unique de la prochaine échéance, ou `null` si
     `termine`. Remplace `plan[]` — une seule échéance connue d'avance, la
     suivante n'existe qu'après la prochaine notation (perte assumée de la
     projection calendrier lointaine, voir docs/audit-methode-des-J.md).
   - `capped` : true si `dueDate` est l'échéance à INTERVAL_CAP (90j) posée
     par un plafonnement — sert à distinguer "ceci est la dernière étape"
     de "encore un cycle normal" (voir advanceQuestion).
   - `termine` : true une fois le cycle sorti du planning actif (remplace
     `cursor === plan.length`).
   - `historique[]` : log informatif des notes (inchangé).
   - `missed` : Raté ET Difficile l'incrémentent, SEUL Facile le remet à 0
     (voir advanceQuestion) — bookkeeping interne au moteur, plus consulté par
     aucun écran (l'ancien carnet d'erreurs qui le lisait a été retiré ; le
     carnet actuel, type flashcard_erreur, n'en dépend pas).
   Le coef n'intervient plus dans ce calcul (voir lib/planning.js
   effectiveCoef — coefficient éditable par fiche, Réviser).
   ============================================================ */
export const INTERVAL_START = 1;
export const INTERVAL_CAP = 90;
export const EASY_MULT = 2.5;
export const HARD_MULT = 1.3;

// notation 3 boutons → qualité SM-2
export const QUALITY = { facile: 5, difficile: 3, rate: 1 };
// sens inverse : qualité dérivée d'un ratio (qualityFromRatio, toujours 5|3|1)
// → étiquette de notation, pour réutiliser RATING_QUALITY côté appelant sans
// dupliquer la résolution de qualité (ex. cloze en mode actif, session/Session.jsx).
export const QUALITY_TO_RATING = { 5: 'easy', 3: 'hard', 1: 'fail' };

/**
 * Quiz d'anatomie visuelle → qualité SM-2 dérivée du % de coches correctes.
 * Réutilise les 3 niveaux du moteur actuel (5 / 3 / 1). Seuils (ajustables) :
 *   ≥ 85 % → Facile (5) · 60–84 % → Difficile (3) · < 60 % → Raté (1).
 */
export function qualityFromRatio(ratio) {
  if (ratio >= 0.85) return QUALITY.facile;   // 5
  if (ratio >= 0.6) return QUALITY.difficile;  // 3
  return QUALITY.rate;                          // 1
}

/**
 * Qualité SM-2 d'un EXERCICE (étape 4), réutilise le moteur existant.
 * Réussi → 5, modulé À LA BAISSE par le nombre d'indices révélés :
 *   0 indice → 5 · 1 → 4 · 2 → 3 · 3+ → 3 (plancher : reste une réussite).
 * Échec → 2 (< 3 : réinitialise le cycle des J).
 * S'applique aux deux sous-types : "numerique" (juste/faux) et "ouvert"
 * (verdict de la grille d'auto-évaluation).
 */
export function qualityForExercice(success, indicesUsed = 0) {
  if (!success) return 2; // échec → 2 (< 3 : réinitialise le cycle des J)
  return Math.max(3, 5 - (indicesUsed || 0));
}

/**
 * Verdict Feynman (réussi/à revoir) — tous les critères ESSENTIELS de la
 * grille cochés (ou tous, si aucun n'est marqué essentiel), sinon repli sur
 * l'auto-note simple pour les fiches Feynman héritées sans grille. Partagé
 * par le Feynman desktop ET mobile (session/Feynman.jsx, mobile/MobileFeynman.jsx)
 * — ne pas dupliquer ce calcul ailleurs.
 */
export function feynmanVerdict({ revealed, grille, checked, selfNote }) {
  if (!revealed) return null;
  const list = grille || [];
  if (!list.length) return selfNote || null;
  const essentiels = list.filter((c) => c.essentiel);
  const base = essentiels.length ? essentiels : list;
  return base.every((c) => checked[c.id]) ? 'ok' : 'ko';
}

/** mélange (Fisher-Yates) — nouvelle permutation à chaque appel, ne modifie pas
   l'original. Seul mélangeur de l'app (lib/anatQuizGen.js, mobile/MobileSession.jsx,
   session/Session.jsx, lib/planning.js) — ne pas en recoder un autre ailleurs. */
export function shuffle(arr) {
  const a = (arr || []).slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** normalisation tolérante pour comparer une saisie à la réponse stockée
   (minuscules, sans accents, trim, espaces multiples réduits). */
export function normalizeAnswer(s) {
  return (s || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '') // enlève les accents
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** LOCAL calendar date YYYY-MM-DD (avoids UTC off-by-one for non-UTC users) */
export function isoDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function todayISO() {
  return isoDate();
}

/** date ISO + n jours (LOCALE, jamais d'UTC — même méthode que isoDate). Petit
   utilitaire interne au moteur, pour ne pas dépendre de lib/planning.js
   addDays (planning.js importe déjà DE sm2.js — jamais l'inverse). */
function addDaysLocal(dateISO, n) {
  const d = new Date(dateISO + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

/** état de départ d'une carte/fiche planifiable (qcm/flashcard/anat_schema) —
   remplace buildPlanFrom. Appelé UNE SEULE FOIS à la création (storage.js
   newItem, lib/import.js) ou par un ré-ancrage explicite d'une carte JAMAIS
   révisée (MedReviseApp.jsx shiftSourceStart/shiftFicheStart) — jamais par
   une notation. `startDate` PEUT être dans le passé (cours déjà commencé
   dans la vraie vie) : la carte est alors immédiatement "en retard"
   (dueDate < aujourd'hui), ce qui la fait apparaître directement dans la
   boîte de rattrapage — aucun calcul de position à faire, contrairement à
   l'ancien buildPlanFrom (une seule échéance, pas 7 à positionner). */
export function startAdaptive(startDate) {
  return { intervalDays: INTERVAL_START, dueDate: startDate, capped: false, termine: false };
}

/* ============================================================
   MedRevise — les EXERCICES n'ont PLUS de planification (chantier 4).
   Le bloc "méthode des J des exercices" (EXO_DELAYS/EXO_LABELS/
   dueDateForJalon) qui vivait ici a été RETIRÉ : un exercice ne reçoit plus
   d'échéance, n'est jamais "dû", et ne figure ni dans la série du jour ni au
   calendrier. On les fait librement, depuis une fiche ou depuis un chapitre.
   Ce qui les remplace : le STATUT (jamais fait / réussi / à revoir, dérivé de
   historique[] — voir planning.js exerciceStatus) et la carte week-end
   "À revoir" (planning.js exosARevoirCetteSemaine).
   Les exos DÉJÀ importés au format J gardent leurs champs `jalon`/`dueDate`
   intacts en base : plus personne ne les lit, rien n'a été réécrit.
   La méthode des J de la THÉORIE (moteur adaptatif ci-dessus, qcm/flashcards
   et schémas) n'est pas concernée — elle est inchangée.
   ============================================================ */
// chrono par carte (flashcards, Session.jsx/MobileSession.jsx) : plafond de
// sécurité — au-delà, la carte n'est pas comptée dans la moyenne "temps par
// carte" (Reviser), en plus de la pause visibilitychange déjà gérée côté
// appelant (onglet en arrière-plan/écran verrouillé). qualite/cursor restent
// enregistrés normalement, seul tempsMs est omis.
export const MAX_CARD_TIME_MS = 3 * 60 * 1000;

function historyEntry(quality, extra) {
  const entry = { date: todayISO(), qualite: quality };
  const tempsMs = extra && extra.tempsMs;
  if (Number.isFinite(tempsMs) && tempsMs >= 0 && tempsMs <= MAX_CARD_TIME_MS) entry.tempsMs = Math.round(tempsMs);
  return entry;
}

/** fait avancer une carte/fiche planifiée selon le moteur ADAPTATIF (voir le
   header du fichier) : la note choisie recalcule RÉELLEMENT `intervalDays`/
   `dueDate`, contrairement à l'ancienne chronologie fixe.
   - Raté (QUALITY.rate) : intervalDays → INTERVAL_START (1), dueDate →
     demain. Le retour "le jour même" (relearning step) n'est PAS ici — c'est
     une répétition en mémoire de session (session/Session.jsx), qui rejoue
     une note via `recordRelearnAttempt` SANS jamais rappeler cette fonction
     une 2e fois le même jour (voir le bug historique documenté en tête de
     fichier : recalculer la date une 2e fois le même jour la ferait revenir
     "aujourd'hui" indéfiniment).
   - Facile/Difficile : intervalDays × EASY_MULT/HARD_MULT, arrondi, avec un
     plancher de progression de +1 jour (sinon Difficile × 1.3 reste bloqué à
     l'intervalle 1 indéfiniment : round(1×1.3) = 1). Si le résultat dépasse
     INTERVAL_CAP (90), il est plafonné à 90 pile et `capped` passe à true —
     ceci est la DERNIÈRE échéance avant sortie (voir ci-dessous).
   - Carte déjà `capped` (à son échéance J+90 plafonnée) : Facile/Difficile
     → TERMINE la carte (dueDate: null, termine: true) ; Raté → relance un
     cycle complet (comme n'importe quel Raté), ne termine JAMAIS — choix
     validé explicitement : "Rater = pas acquise, elle doit repartir".
   `missed` : Raté ET Difficile l'incrémentent, SEUL Facile (quality 5) le
   remet à zéro — bookkeeping interne au moteur (plus aucun écran ne le lit),
   conservé tel quel. `extra.tempsMs` (optionnel, flashcards) : voir
   MAX_CARD_TIME_MS. */
export function advanceQuestion(record, quality, extra = {}) {
  const historique = (record.historique || []).concat([historyEntry(quality, extra)]);
  const missed = quality >= 5 ? 0 : (record.missed || 0) + 1;
  const isFail = quality === QUALITY.rate;

  if (record.capped) {
    if (isFail) {
      return { ...record, intervalDays: INTERVAL_START, dueDate: addDaysLocal(todayISO(), 1), capped: false, termine: false, historique, missed };
    }
    return { ...record, dueDate: null, termine: true, historique, missed };
  }

  if (isFail) {
    return { ...record, intervalDays: INTERVAL_START, dueDate: addDaysLocal(todayISO(), 1), capped: false, historique, missed };
  }

  const mult = quality >= 5 ? EASY_MULT : HARD_MULT;
  const base = record.intervalDays || INTERVAL_START;
  let nextInterval = Math.max(base + 1, Math.round(base * mult));
  let capped = false;
  if (nextInterval > INTERVAL_CAP) { nextInterval = INTERVAL_CAP; capped = true; }
  return { ...record, intervalDays: nextInterval, dueDate: addDaysLocal(todayISO(), nextInterval), capped, historique, missed };
}

/** répétition de relearning (session/Session.jsx, mobile/MobileSession.jsx) :
   même jour, EN MÉMOIRE DE SESSION uniquement — écrit dans `historique`
   (pour que le carnet d'erreurs détecte 2 ratés d'affilée MÊME si le 2e
   vient de cette répétition), sans jamais retoucher `intervalDays`/`dueDate`/
   `capped`/`termine` (déjà fixés par le Raté initial qui a déclenché cette
   répétition) — même patron que recordExerciceAttempt ci-dessous
   (historique-only), pour la même raison : rejouer advanceQuestion ici
   écraserait le `dueDate` déjà posé et pourrait reproduire le bug historique
   (carte "due aujourd'hui" en boucle, voir header du fichier). */
export function recordRelearnAttempt(record, quality, extra = {}) {
  const historique = (record.historique || []).concat([historyEntry(quality, extra)]);
  return { ...record, historique, missed: quality >= 5 ? 0 : (record.missed || 0) + 1 };
}

/** enregistre une tentative d'EXERCICE (historique + carnet), SANS toucher à
   aucune date — les exercices sont HORS méthode des J (planning.js
   SCHEDULED_TYPES), ils ne portent ni `plan` ni `cursor`. Seuil de succès
   INCHANGÉ par rapport à avant cette refonte (quality>=3 = réussi, même
   partiellement avec indices — voir qualityForExercice) : distinct du
   mapping 3 boutons qcm/flashcard (advanceQuestion) qui n'a que les valeurs
   1/3/5 (fail/hard/easy) — qualityForExercice renvoie aussi 2 et 4. */
export function recordExerciceAttempt(question, quality) {
  const historique = (question.historique || []).concat([{ date: todayISO(), qualite: quality }]);
  return { ...question, historique, missed: quality >= 3 ? 0 : (question.missed || 0) + 1 };
}

/** carnet d'erreurs v2 (étape 1, Session.jsx/MobileSession.jsx) : vrai si les
   2 DERNIÈRES entrées d'un historique[] sont toutes deux "Raté" (qualite ===
   QUALITY.rate). Dérivé de historique[] à chaque appel — volontairement PAS
   de champ dédié (ex. consecutiveFails) qui pourrait diverger de la source
   de vérité. Une note Facile/Difficile entre deux ratés casse la séquence
   automatiquement (elle occupe une des 2 dernières positions). */
export function lastTwoAreFails(historique) {
  const h = historique || [];
  const n = h.length;
  return n >= 2 && h[n - 1].qualite === QUALITY.rate && h[n - 2].qualite === QUALITY.rate;
}

/** streak = nombre de jours d'activité consécutifs se terminant aujourd'hui
   (ou hier, tant que la chaîne n'est pas encore cassée). Calculé à partir
   des VRAIS jours enregistrés, jamais de valeurs fictives. */
export function computeStreak(activityDays) {
  if (!activityDays || !activityDays.length) return 0;
  const set = new Set(activityDays);
  const today = todayISO();
  const shift = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDate(d); };
  let cur = set.has(today) ? today : shift(today, -1); // pas encore révisé aujourd'hui → on part d'hier
  let streak = 0;
  while (set.has(cur)) { streak++; cur = shift(cur, -1); }
  return streak;
}

/** libellé de la carte/fiche planifiée — badge "J" (Dashboard/Réviser/
   Session). `jIndex` : -1 = jamais planifiée (repli pour un enregistrement
   pas encore migré), 0 = cycle actif, 1 = terminée (garde la sémantique
   `jIndex >= 0` = "affiche un badge", utilisée par les écrans existants).
   Remplace l'ancienne frise à 7 crans (plan/cursor) : le moteur adaptatif
   n'a qu'un intervalle courant, pas de paliers nommés — le libellé devient
   simplement "J+N" (N = intervalDays). */
export function labelForCursor(record) {
  if (!record || (record.dueDate == null && record.intervalDays == null && !record.termine)) {
    return { jIndex: -1, jLabel: 'Nouveau' };
  }
  if (record.termine) return { jIndex: 1, jLabel: 'Terminée' };
  return { jIndex: 0, jLabel: 'J+' + (record.intervalDays || INTERVAL_START) };
}

/** "vrai" J0 d'une carte/fiche planifiable — date de sa TOUTE PREMIÈRE mise en
   cycle, à ne jamais confondre avec `intervalDays` (délai jusqu'à la PROCHAINE
   échéance, remis à l'échelle à chaque notation). Posé UNE SEULE FOIS et
   jamais retouché ensuite :
   - à la création (storage.js#newItem) ;
   - à un "Décaler le départ" explicite (MedReviseApp.jsx shiftSourceStart/
     shiftFicheStart) — ré-ancrer une carte JAMAIS révisée EST son vrai début ;
   - jamais par advanceQuestion (moteur d'intervalle, inchangé).
   Repli pour une carte créée AVANT l'ajout de `j0Date` (aucune carte n'en a
   avant ce champ) : la date de sa PREMIÈRE note (`historique[0].date`), le
   meilleur repère rétroactif disponible. `null` si ni l'un ni l'autre
   n'existe (carte jamais notée ET créée avant ce champ) — jamais inventé. */
export function trueJ0Date(record) {
  if (!record) return null;
  if (record.j0Date) return record.j0Date;
  const h = record.historique;
  if (h && h.length) return h[0].date;
  return null;
}

/** nombre de jours écoulés depuis `trueJ0Date` (voir ci-dessus) — le "vrai
   J+N depuis le début", pour se repérer dans le temps de vie de la carte,
   PAS dans son prochain délai (`intervalDays`, déjà affiché par `jLabel`).
   `null` si `trueJ0Date` est inconnu (jamais de valeur négative inventée). */
export function trueDaysSinceJ0(record, todayIso = todayISO()) {
  const j0 = trueJ0Date(record);
  if (!j0) return null;
  const start = new Date(j0 + 'T12:00:00');
  const today = new Date(todayIso + 'T12:00:00');
  const days = Math.round((today - start) / 86400000);
  return days >= 0 ? days : 0; // j0 dans le futur (incohérent) : filet de sécurité, jamais négatif
}

/** vrai si la DERNIÈRE note de l'historique est Difficile ou Raté — la carte
   revient plus vite que la normale, à distinguer visuellement (calendrier/
   Réorganiser) d'une carte qui suit simplement son cours normal (dernière
   note Facile, ou jamais notée). Lecture seule de `historique`, ne modifie
   et ne recalcule rien du moteur d'intervalle. */
export function isDueBecauseStruggled(record) {
  const h = record && record.historique;
  if (!h || !h.length) return false;
  const last = h[h.length - 1].qualite;
  return last === QUALITY.difficile || last === QUALITY.rate;
}

/** [LEGACY] bucketing d'un ANCIEN interval (ex-moteur SM-2 adaptatif) vers le
   palier fixe à 5 crans immédiatement INFÉRIEUR — usage UNIQUE : la
   migration historique `migrateCadenceFixeV1` (lib/migrate.js), déjà
   appliquée sur les comptes existants, jamais appelée par le moteur
   courant. Tableau privé, INDÉPENDANT de PLAN_DELAYS (chronologie fixe
   actuelle, 7 crans) : ce sont deux migrations distinctes, à des moments
   distincts de l'historique du moteur — ne pas fusionner les deux cadences. */
const LEGACY_5_PALIER_DELAYS = [0, 3, 7, 14, 30];
export function palierFromInterval(interval) {
  let palier = 0;
  for (let i = 0; i < LEGACY_5_PALIER_DELAYS.length; i++) {
    if (interval >= LEGACY_5_PALIER_DELAYS[i]) palier = i;
  }
  return palier;
}
