/* ============================================================
   MedRevise — CONVERSION DES CARTES EN APPRENTISSAGE (étape 2 FSRS, 10/10/2026).
   Le mode Apprentissage des flashcards (paquet, présentation, succès consécutifs, réinsertion)
   est supprimé. Avant cela, chaque flashcard `learnState: 'learning'` devient une carte de
   révision ORDINAIRE — règle explicite de Yoann, seule exception à « aucune date ne change » :
     - dans la séance du jour (cours planifié, attendue aujourd'hui ou avant) → dueDate = aujourd'hui ;
     - sinon → sa prochaine date prévue si elle existe (et n'est pas passée), sinon demain.
   Aucune ne tombe dans le rattrapage (dueDate jamais < aujourd'hui).
   AJOUT seulement : `dueDate` prend la date convertie, un champ NEUF `conversionApprentissage`
   garde la trace (date, ancienne dueDate…). Les champs learning* restent en base, plus lus.
   Idempotente : une carte qui porte `conversionApprentissage` n'est jamais reconvertie.
   ============================================================ */
function ajouterJours(jour, n) {
  const [y, m, d] = jour.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

export const VERSION_CONVERSION = 1;
export const aConvertir = (q) => !!q && q.type === 'flashcard' && q.learnState === 'learning' && !q.conversionApprentissage;

/** jour où la carte était attendue par le mode Apprentissage */
export function dateAttendue(q) {
  return q.learningIntroducedOn ? (q.learningDue || q.learningIntroducedOn) : (q.dueDate || null);
}

/** date que la carte aura après conversion (lecture « virtuelle » avant que la migration ne l'écrive).
   `undefined` si la carte n'est pas concernée. */
export function dateApresConversion(q, today, planifiee = true) {
  if (!aConvertir(q)) return undefined;
  const attendue = dateAttendue(q);
  if (planifiee && attendue && attendue <= today) return today;
  if (attendue && attendue >= today) return attendue;
  return ajouterJours(today, 1);
}

/** conversion pure : `estPlanifiee(q)` = la carte est dans un cours/fiche avec rappels J actifs */
export function convertirApprentissage(questions, estPlanifiee, today) {
  const enApprentissage = (questions || []).filter((q) => q && q.type === 'flashcard' && q.learnState === 'learning');
  const cibles = enApprentissage.filter(aConvertir);
  const rapport = {
    jour: today, enApprentissage: enApprentissage.length, dejaConverties: enApprentissage.length - cibles.length,
    converties: 0, seanceDuJour: 0, dateFutureGardee: 0, demain: 0, horsPlanning: 0, enRattrapageApres: 0,
  };
  const maj = cibles.map((q) => {
    const planifiee = !!estPlanifiee(q);
    const attendue = dateAttendue(q);
    const cible = dateApresConversion(q, today, planifiee);
    const seance = planifiee && !!attendue && attendue <= today;
    rapport.converties++;
    if (seance) rapport.seanceDuJour++;
    else if (attendue && attendue >= today) rapport.dateFutureGardee++;
    else rapport.demain++;
    if (!planifiee) rapport.horsPlanning++;
    if (cible < today) rapport.enRattrapageApres++;
    return {
      ...q, dueDate: cible,
      conversionApprentissage: { version: VERSION_CONVERSION, le: today, dueDateAvant: q.dueDate == null ? null : q.dueDate, attendue: attendue || null, seanceDuJour: seance, planifiee },
    };
  });
  return { maj, rapport };
}
