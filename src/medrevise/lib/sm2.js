/* ============================================================
   MedRevise — méthode des J : SM-2 + modulation par coefficient
   + plafond 90 j (rien n'est jamais oublié). Implémente le handoff §3.
   Une carte (qcm/flashcard) porte: interval, repetition, efactor,
   nextReview (YYYY-MM-DD), historique[].
   ============================================================ */
export const PLAFOND_JOURS = 90;
export const COEF_MULT = { 5: 0.6, 4: 0.8, 3: 1.0, 2: 1.2, 1: 1.4 };
export const J_INTERVALS = [1, 3, 7, 14, 30]; // cycle initial affiché (frise)

// notation 3 boutons → qualité SM-2
export const QUALITY = { facile: 5, difficile: 3, rate: 1 };

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
 * SM-2 modulé par coefficient, plafonné à 90 j.
 * @returns { interval, repetition, efactor, nextReview }
 */
export function sm2(quality, repetition, previousInterval, previousEfactor, coef = 3) {
  let interval, newRepetition, efactor;

  if (quality >= 3) {
    if (repetition === 0) interval = 1;
    else if (repetition === 1) interval = 6;
    else interval = Math.round(previousInterval * previousEfactor);
    newRepetition = repetition + 1;
  } else {
    newRepetition = 0;
    interval = 1;
  }

  efactor = previousEfactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (efactor < 1.3) efactor = 1.3;

  // modulation par coefficient + plafond absolu
  interval = Math.round(interval * (COEF_MULT[coef] ?? 1.0));
  if (interval < 1) interval = 1;
  if (interval > PLAFOND_JOURS) interval = PLAFOND_JOURS;

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval);
  return { interval, repetition: newRepetition, efactor, nextReview: isoDate(nextReview) };
}

/** applique une réponse à une question et renvoie la question mise à jour */
export function applyReview(question, quality, coef = 3) {
  const res = sm2(
    quality,
    question.repetition || 0,
    question.interval || 0,
    question.efactor || 2.5,
    coef,
  );
  const historique = (question.historique || []).concat([{ date: todayISO(), qualite: quality }]);
  return {
    ...question,
    interval: res.interval,
    repetition: res.repetition,
    efactor: res.efactor,
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

/** étape de la frise J+1→J+30 la plus proche d'un interval courant (pour le badge "J") */
export function jStepForInterval(interval) {
  if (!interval || interval <= 0) return { jIndex: -1, jLabel: 'Nouveau' };
  let jIndex = 0;
  for (let i = 0; i < J_INTERVALS.length; i++) {
    if (interval >= J_INTERVALS[i]) jIndex = i;
  }
  return { jIndex, jLabel: 'J+' + J_INTERVALS[Math.min(jIndex, J_INTERVALS.length - 1)] };
}
