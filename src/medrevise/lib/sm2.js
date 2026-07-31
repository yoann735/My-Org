/* ============================================================
   MedRevise — méthode des J : cadence FIXE à 5 paliers (remplace l'ancien
   moteur SM-2 adaptatif — voir docs/diag-repetition-espacee.md). Une carte
   (qcm/flashcard) porte : palier (0..4), interval (dérivé, = délai du
   palier courant, gardé pour compat des lectures existantes), nextReview
   (YYYY-MM-DD), historique[]. Le coef n'intervient plus dans ce calcul
   (voir lib/planning.js effectiveCoef — gardé pour le carnet d'erreurs
   uniquement).
   ============================================================ */
export const PALIER_DELAYS = [0, 3, 7, 14, 30];
export const PALIER_LABELS = ['J0', 'J+3', 'J+7', 'J+14', 'J+30'];

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

/**
 * Cadence fixe "méthode des J" : Raté → repart à J0 · Difficile → reste au
 * palier courant (même délai qu'à l'arrivée) · Facile → avance d'un palier,
 * plafonne à J+30 (dernier palier : "régime de croisière", revient tous les
 * 30 j tant que c'est facile). nextReview est toujours ancré sur la date
 * RÉELLE de cette révision (jamais une addition depuis une échéance passée).
 * @returns { palier, interval, nextReview }
 */
export function nextPalier(quality, palier) {
  const current = palier || 0;
  let newPalier;
  if (quality >= 5) newPalier = Math.min(current + 1, PALIER_DELAYS.length - 1); // facile → avance
  else if (quality >= 3) newPalier = current;                                     // difficile → reste
  else newPalier = 0;                                                             // raté → repart à J0

  const interval = PALIER_DELAYS[newPalier];
  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval);
  return { palier: newPalier, interval, nextReview: isoDate(nextReview) };
}

/** applique une réponse à une question et renvoie la question mise à jour.
   `coef` est accepté (signature stable pour tous les appelants existants :
   Session.jsx, MobileSession.jsx, Exercice.jsx, AnatQuiz.jsx…) mais n'entre
   plus dans le calcul du délai — voir lib/planning.js effectiveCoef pour son
   seul usage restant (pondération du carnet d'erreurs). */
// chrono par carte (flashcards, Session.jsx/MobileSession.jsx) : plafond de
// sécurité — au-delà, la carte n'est pas comptée dans la moyenne "temps par
// carte" (Reviser), en plus de la pause visibilitychange déjà gérée côté
// appelant (onglet en arrière-plan/écran verrouillé). qualite/palier restent
// enregistrés normalement, seul tempsMs est omis.
export const MAX_CARD_TIME_MS = 3 * 60 * 1000;

/** applique une réponse à une question et renvoie la question mise à jour.
   `coef` est accepté (signature stable pour tous les appelants existants :
   Session.jsx, MobileSession.jsx, Exercice.jsx, AnatQuiz.jsx…) mais n'entre
   plus dans le calcul du délai — voir lib/planning.js effectiveCoef pour son
   seul usage restant (pondération du carnet d'erreurs). `extra.tempsMs`
   (optionnel, flashcards uniquement) : temps actif passé sur la carte, voir
   MAX_CARD_TIME_MS ci-dessus. */
export function applyReview(question, quality, coef = 3, extra = {}) {
  const res = nextPalier(quality, question.palier || 0);
  const entry = { date: todayISO(), qualite: quality };
  const tempsMs = extra && extra.tempsMs;
  if (Number.isFinite(tempsMs) && tempsMs >= 0 && tempsMs <= MAX_CARD_TIME_MS) entry.tempsMs = Math.round(tempsMs);
  const historique = (question.historique || []).concat([entry]);
  return {
    ...question,
    palier: res.palier,
    interval: res.interval,
    nextReview: res.nextReview,
    historique,
    // carnet d'erreurs : un échec l'y ajoute, une réussite l'en retire aussitôt
    missed: quality < 3 ? (question.missed || 0) + 1 : 0,
  };
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

/** libellé EXACT d'un palier (0..4) — badge "J", frise. `palier` est toujours
   défini dès qu'une carte/fiche existe (voir lib/storage.js) ; le repli
   'Nouveau' ne sert qu'aux enregistrements pas encore migrés. */
export function labelForPalier(palier) {
  if (palier == null || palier < 0) return { jIndex: -1, jLabel: 'Nouveau' };
  const jIndex = Math.min(palier, PALIER_LABELS.length - 1);
  return { jIndex, jLabel: PALIER_LABELS[jIndex] };
}

/** bucketing d'un ANCIEN interval (ex-moteur SM-2 adaptatif) vers le palier
   fixe immédiatement INFÉRIEUR. Usage UNIQUE : migration (lib/migrate.js)
   pour convertir les cartes existantes — jamais appelé par le moteur courant. */
export function palierFromInterval(interval) {
  let palier = 0;
  for (let i = 0; i < PALIER_DELAYS.length; i++) {
    if (interval >= PALIER_DELAYS[i]) palier = i;
  }
  return palier;
}
