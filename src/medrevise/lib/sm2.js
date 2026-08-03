/* ============================================================
   MedRevise — méthode des J : CHRONOLOGIE FIXE par carte (remplace le
   moteur à paliers RECALCULÉS à chaque notation — voir
   docs/audit-methode-des-J.md : Difficile/Raté à J0 reprogrammaient la
   carte à AUJOURD'HUI, elle revenait donc chaque jour). Une carte
   (qcm/flashcard, ou fiche anat_schema) porte :
   - `plan` : 7 échéances ABSOLUES posées une seule fois à l'import
     (buildPlan), qui ne bougent JAMAIS automatiquement — ni par une note,
     ni par un retard, ni par un rattrapage. Seul l'onglet Réorganiser
     (décalage manuel explicite, MedReviseApp.jsx) peut les modifier.
   - `cursor` : index de la PROCHAINE échéance non faite. `cursor ===
     plan.length` → cycle terminé (carte "Terminée", sort du planning actif).
   - `historique[]` : log informatif des notes (inchangé).
   - `missed` : Raté ET Difficile l'incrémentent, SEUL Facile le remet à 0
     (voir advanceQuestion) — bookkeeping interne au moteur, plus consulté par
     aucun écran (l'ancien carnet d'erreurs qui le lisait a été retiré ; le
     carnet actuel, type flashcard_erreur, n'en dépend pas).
   Le coef n'intervient plus dans ce calcul (voir lib/planning.js
   effectiveCoef — coefficient éditable par fiche, Réviser).
   ============================================================ */
export const PLAN_DELAYS = [0, 1, 3, 7, 14, 30, 90];
export const PLAN_LABELS = ['J0', 'J+1', 'J+3', 'J+7', 'J+14', 'J+30', 'J+90'];

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

/** construit les 7 échéances FIXES d'une carte/fiche à partir de sa date de
   départ (J0). Appelé UNE SEULE FOIS à la création (storage.js/import.js) ou
   par un décalage explicite (MedReviseApp.jsx shiftSourceStart/shiftFicheStart,
   ré-ancrage complet d'une carte jamais commencée) — jamais par une notation. */
export function buildPlan(startDate) {
  return PLAN_DELAYS.map((delay, i) => {
    const d = new Date(startDate + 'T12:00:00');
    d.setDate(d.getDate() + delay);
    return { i, label: PLAN_LABELS[i], date: isoDate(d) };
  });
}

/** construit le plan ET place le `cursor` correctement quand `startDate` est
   dans le PASSÉ (import d'un cours déjà commencé dans la vraie vie, ou
   décalage du départ vers une date antérieure) : les jalons strictement
   antérieurs à aujourd'hui sont considérés DÉJÀ FAITS (jamais "dus" ni "en
   retard"), le cursor pointe directement sur la première échéance restante
   (date >= aujourd'hui). Si `startDate` est aujourd'hui ou dans le futur,
   équivaut exactement à `buildPlan(startDate)` + cursor 0 (comportement
   inchangé). Si TOUTES les échéances sont déjà passées, cursor = plan.length
   → la carte est "Terminée" (même état qu'un cycle normalement achevé, voir
   labelForCursor — aucun nouvel état à gérer). */
export function buildPlanFrom(startDate) {
  const plan = buildPlan(startDate);
  const today = todayISO();
  const cursor = plan.findIndex((e) => e.date >= today);
  return { plan, cursor: cursor === -1 ? plan.length : cursor };
}

/* ============================================================
   MedRevise — méthode des J des EXERCICES (Étape A, socle). Cadence PROPRE,
   INDÉPENDANTE de la théorie (PLAN_DELAYS ci-dessus) : le prompt de
   génération assigne à chaque exercice UN SEUL "jalon" logique
   ("J0"|"J+2"|...|"J+45"), pas 7 comme une carte théorie — un exercice n'a
   qu'UNE échéance (`dueDate`, champ unique sur l'item, voir storage.js
   newItem), consommée une fois répondu (voir planning.js exerciceStatus).
   Jamais mélangé au canal théorie (types disjoints : SCHEDULED_TYPES vs
   EXERCICE_TYPE, planning.js). ============================== */
export const EXO_DELAYS = [0, 2, 7, 15, 30, 45];
export const EXO_LABELS = ['J0', 'J+2', 'J+7', 'J+15', 'J+30', 'J+45'];
const EXO_JALON_TO_DELAY = Object.fromEntries(EXO_LABELS.map((label, i) => [label, EXO_DELAYS[i]]));

/** traduit le "jalon" logique d'un exercice (champ du prompt de génération)
   en date ABSOLUE unique à partir du J0 de la fiche (aujourd'hui par défaut,
   ou une date passée — même mécanisme que buildPlanFrom pour la théorie).
   `null` si `jalon` absent/invalide (contenu legacy sans ce champ) : l'exo
   reste alors sans `dueDate`, comportement actuel inchangé (toujours
   librement accessible, jamais dans "Exercices du jour"). Pas de
   plan[]/cursor ici — un seul jalon, pas 7, donc pas de tableau à
   construire ni de position à suivre : une fois répondu, l'exo est
   consommé (exerciceStatus), il ne "revient" jamais à une échéance
   suivante (contrairement à la théorie). */
export function dueDateForJalon(jalon, startDate) {
  const delay = EXO_JALON_TO_DELAY[jalon];
  if (delay == null) return null;
  const d = new Date(startDate + 'T12:00:00');
  d.setDate(d.getDate() + delay);
  return isoDate(d);
}

// chrono par carte (flashcards, Session.jsx/MobileSession.jsx) : plafond de
// sécurité — au-delà, la carte n'est pas comptée dans la moyenne "temps par
// carte" (Reviser), en plus de la pause visibilitychange déjà gérée côté
// appelant (onglet en arrière-plan/écran verrouillé). qualite/cursor restent
// enregistrés normalement, seul tempsMs est omis.
export const MAX_CARD_TIME_MS = 3 * 60 * 1000;

/** fait avancer une carte/fiche planifiée d'UN cran fixe — QUELLE QUE SOIT
   la note (Facile/Difficile/Raté sont désormais purement informatives pour
   la chronologie, voir le header du fichier) : `cursor` progresse de 1, le
   `plan` lui-même n'est JAMAIS réécrit ici. `cursor === plan.length` → cycle
   terminé (voir planning.js, une carte terminée sort de scheduledQuestions).
   `missed` : Raté ET Difficile l'incrémentent, SEUL Facile (quality 5) le
   remet à zéro (QUALITY : facile=5, difficile=3, rate=1) — bookkeeping
   interne au moteur (plus aucun écran ne le lit, voir header du fichier),
   conservé tel quel pour ne pas toucher au moteur chrono.
   `extra.tempsMs` (optionnel, flashcards) : temps actif passé sur la carte,
   voir MAX_CARD_TIME_MS. */
export function advanceQuestion(record, quality, extra = {}) {
  const plan = record.plan || [];
  const cursor = Math.min((record.cursor || 0) + 1, plan.length);
  const entry = { date: todayISO(), qualite: quality };
  const tempsMs = extra && extra.tempsMs;
  if (Number.isFinite(tempsMs) && tempsMs >= 0 && tempsMs <= MAX_CARD_TIME_MS) entry.tempsMs = Math.round(tempsMs);
  const historique = (record.historique || []).concat([entry]);
  return {
    ...record,
    cursor,
    historique,
    missed: quality >= 5 ? 0 : (record.missed || 0) + 1,
  };
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

/** libellé EXACT de la PROCHAINE échéance d'une carte/fiche planifiée (plan/
   cursor) — badge "J", frise. `plan` est toujours défini dès qu'une carte/
   fiche qcm/flashcard/anat_schema existe (voir lib/storage.js) ; le repli
   'Nouveau' ne sert qu'aux enregistrements pas encore migrés. `cursor >=
   plan.length` → cycle terminé (voir buildPlan/advanceQuestion). */
export function labelForCursor(record) {
  const plan = record && record.plan;
  if (!plan || !plan.length) return { jIndex: -1, jLabel: 'Nouveau' };
  const cursor = record.cursor || 0;
  if (cursor >= plan.length) return { jIndex: plan.length, jLabel: 'Terminée' };
  return { jIndex: cursor, jLabel: plan[cursor].label };
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
