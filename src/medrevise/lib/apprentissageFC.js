/* ============================================================
   MedRevise — APPRENTISSAGE DES FLASHCARDS (06/10/2026,
   docs/compte-rendu-apprentissage-flashcards.md).

   Un état EN AMONT de la méthode des J, qui n'est pas modifiée : le moteur
   (lib/sm2.js advanceQuestion) et le planning (lib/planning.js) sont intacts ; les
   flashcards qui ne sont pas encore « en révision » en sont simplement filtrées
   (planning.js scheduledQuestions → horsMethodeJ).

   Cycle de vie d'une flashcard (`learnState`) :
     new       créée, date de départ (`dueDate` posé par startAdaptive) pas encore
               atteinte — n'apparaît nulle part ;
     learning  le jour venu, entre dans le bloc « Apprendre » de la séance du jour ;
               y reste jusqu'à `learningCriterion` succès consécutifs ;
     review    dans la méthode des J (inchangée), première échéance à J+1.
     Retour    un « Raté » en révision → advanceQuestion (intervalles inchangés)
               PUIS learning, critère 2, à partir du lendemain ; à sa sortie, J+1.

   Champs ajoutés aux cartes (ajouts purs, jamais de contenu modifié) :
     learnState            'new' | 'learning' | 'review'
     learningStreak        succès consécutifs actuels
     learningCriterion     succès consécutifs requis (3 par défaut, 2 après un raté)
     learningPresented     la carte a déjà été montrée recto + verso
     lastSeenAt            ISO de la dernière vue dans la séance
     learningIntroducedOn  jour où la carte est entrée dans le bloc Apprendre
     learningDue           jour à partir duquel elle y est attendue (raté → demain)
     learningSource        'nouvelle' (compte dans le quota) | 'rate' (hors quota)

   Une carte SANS `learnState` (créée par un appareil pas encore à jour, ou pas
   encore migrée) est classée à la volée par les MÊMES règles que la migration.
   ============================================================ */
import { todayISO, isoDate, INTERVAL_START, QUALITY } from './sm2.js';

export const REGLAGES_FC_DEFAUT = { quotaNouvelles: 15, critere: 3, critereApresRate: 2 };
export const BORNES_FC = { quotaNouvelles: [5, 50], critere: [2, 5], critereApresRate: [1, 5] };
// estimation du temps de séance tant qu'il n'y a pas assez de mesures réelles
export const TEMPS_DEFAUT_MS = { revision: 15000, nouvelle: 70000 };
// distances de réinsertion dans la file du bloc Apprendre (nombre de cartes vues avant le retour)
export const DISTANCE = { pasSu: [3, 4], su: [8, 10], presentation: [3, 4] };

export function reglagesFC(brut) {
  const r = { ...REGLAGES_FC_DEFAUT, ...(brut || {}) };
  const borne = (k) => Math.min(BORNES_FC[k][1], Math.max(BORNES_FC[k][0], Math.round(Number(r[k]) || REGLAGES_FC_DEFAUT[k])));
  return { quotaNouvelles: borne('quotaNouvelles'), critere: borne('critere'), critereApresRate: borne('critereApresRate') };
}

function ajouterJours(dateISO, n) {
  const d = new Date(dateISO + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

/** seules les flashcards de la méthode des J ont ce cycle (pas les QCM, ni les
   flashcards d'erreur du carnet, qui ont leur propre statut). */
export const estFlashcardJ = (q) => !!q && q.type === 'flashcard';

/** la carte a-t-elle déjà été notée au moins une fois dans la méthode des J ? */
export const aEteNoteeJ = (q) => (q.historique || []).some((h) => h && h.qualite != null);

/** état EFFECTIF d'une flashcard (null pour tout autre type). */
export function etatFC(q, today = todayISO()) {
  if (!estFlashcardJ(q)) return null;
  if (q.learnState === 'review') return 'review';
  if (q.learnState === 'learning' && q.learningIntroducedOn) return 'learning';
  // pas encore entrée dans la séance (nouvelle, ou learning issue de la migration) :
  // la date de départ décide — un départ repoussé dans le futur la rend « new ».
  if (!q.learnState && aEteNoteeJ(q)) return 'review';
  if (q.termine) return 'review';
  if (!q.dueDate) return 'new'; // « sans planning », en attente d'un J0 (Réglages → Réinitialiser les dates)
  return q.dueDate > today ? 'new' : 'learning';
}

/** filtre du planning des J : vrai si la carte n'est pas (encore) dans la méthode des J. */
export const horsMethodeJ = (q) => estFlashcardJ(q) && etatFC(q) !== 'review';

const commencee = (q) => !!q.learningIntroducedOn;

/* ============================================================
   PLAN DU JOUR (pur) — `cartes` = flashcards des fiches planifiées (la pause d'un
   cours ou d'une fiche s'applique ici comme dans la méthode des J).
   ============================================================ */
export function planDuJour(cartes, reglagesBruts, today = todayISO(), dateDue = (q) => q.dueDate) {
  const reg = reglagesFC(reglagesBruts);
  const fc = (cartes || []).filter(estFlashcardJ);
  const revisions = fc.filter((q) => {
    if (etatFC(q, today) !== 'review') return false;
    const d = dateDue(q);
    return d != null && d <= today && q.skippedOn !== today;
  });
  const learning = fc.filter((q) => etatFC(q, today) === 'learning');
  // déjà entrées dans la séance (non terminées la veille, ou redescendues après un raté) : hors quota
  const enCours = learning.filter((q) => commencee(q) && (q.learningDue || q.learningIntroducedOn) <= today);
  // nouvelles du jour : plus anciennes d'abord, plafonnées par ce qui reste du quota
  const fraiches = learning.filter((q) => !commencee(q))
    .sort((a, b) => ((a.dueDate || '') < (b.dueDate || '') ? -1 : (a.dueDate || '') > (b.dueDate || '') ? 1 : String(a.id) < String(b.id) ? -1 : 1));
  const dejaIntroduites = fc.filter((q) => q.learningIntroducedOn === today && q.learningSource === 'nouvelle').length;
  const place = Math.max(0, reg.quotaNouvelles - dejaIntroduites);
  const nouvelles = fraiches.slice(0, place);
  const glissent = fraiches.length - nouvelles.length;
  return { revisions, enCours, nouvelles, glissent, reglages: reg };
}

/** prochaine date où il y aura quelque chose à faire (écran « Rien à faire aujourd'hui »). */
export function prochaineSeance(cartes, plan, today = todayISO(), dateDue = (q) => q.dueDate) {
  if (plan && plan.glissent > 0) return ajouterJours(today, 1);
  let min = null;
  const garder = (d) => { if (d && d > today && (!min || d < min)) min = d; };
  (cartes || []).filter(estFlashcardJ).forEach((q) => {
    const e = etatFC(q, today);
    if (e === 'review') garder(dateDue(q));
    else if (e === 'new') garder(q.dueDate);
    else if (e === 'learning') garder(commencee(q) ? (q.learningDue || q.learningIntroducedOn) : ajouterJours(today, 1));
  });
  return min;
}

/* ============================================================
   TRANSITIONS (pures) — renvoient la carte modifiée, à enregistrer par l'appelant.
   ============================================================ */
/** la carte entre dans le bloc Apprendre de la séance du jour (nouvelle, quota). */
export function introduire(q, reg, today = todayISO()) {
  return {
    ...q, learnState: 'learning', learningIntroducedOn: today, learningDue: today, learningSource: 'nouvelle',
    learningCriterion: q.learningCriterion || reglagesFC(reg).critere,
    learningStreak: q.learningStreak || 0, learningPresented: !!q.learningPresented,
  };
}

/** première vue : présentation recto + verso, pas un test. */
export function presenter(q, maintenant = new Date().toISOString()) {
  return { ...q, learningPresented: true, lastSeenAt: maintenant };
}

/** réponse à un test du bloc Apprendre. `{ carte, sortie }` — sortie = critère atteint → J+1. */
export function repondre(q, su, reg, today = todayISO(), maintenant = new Date().toISOString()) {
  const critere = q.learningCriterion || reglagesFC(reg).critere;
  if (!su) return { carte: { ...q, learningStreak: 0, learningPresented: true, lastSeenAt: maintenant }, sortie: false };
  const streak = (q.learningStreak || 0) + 1;
  if (streak < critere) return { carte: { ...q, learningStreak: streak, learningPresented: true, lastSeenAt: maintenant }, sortie: false };
  // sortie : la méthode des J prend le relais, première échéance au lendemain
  return {
    carte: {
      ...q, learnState: 'review', learningStreak: 0, learningPresented: true, lastSeenAt: maintenant, learningDoneOn: today,
      intervalDays: INTERVAL_START, dueDate: ajouterJours(today, 1), capped: false, termine: false,
    },
    sortie: true,
  };
}

/** après une notation dans la méthode des J (`apres` = résultat d'advanceQuestion,
   inchangé) : un Raté sur une flashcard redescend en apprentissage pour le lendemain. */
export function apresNotationJ(apres, quality, reg, today = todayISO()) {
  if (!estFlashcardJ(apres) || quality !== QUALITY.rate) return apres;
  return {
    ...apres, learnState: 'learning', learningStreak: 0, learningPresented: true,
    learningCriterion: reglagesFC(reg).critereApresRate, learningSource: 'rate',
    learningIntroducedOn: today, learningDue: ajouterJours(today, 1),
  };
}

/* ============================================================
   FILE DU BLOC APPRENDRE (pure)
   ============================================================ */
const hasard = (rand, [a, b]) => a + Math.floor(rand() * (b - a + 1));

/** ordre initial : cours (fiches) alternés autant que possible, ordre mélangé dans chaque cours. */
export function entrelacer(ids, coursDe, rand = Math.random) {
  const groupes = new Map();
  ids.forEach((id) => { const k = coursDe(id); if (!groupes.has(k)) groupes.set(k, []); groupes.get(k).push(id); });
  const listes = [...groupes.values()].map((l) => {
    const c = l.slice();
    for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
    return c;
  });
  const out = [];
  let precedent = null;
  while (listes.some((l) => l.length)) {
    // le cours qui a le plus de cartes restantes, en évitant de répéter le précédent
    const tri = listes.filter((l) => l.length).sort((a, b) => b.length - a.length);
    const choix = tri.find((l) => coursDe(l[0]) !== precedent) || tri[0];
    const id = choix.shift();
    out.push(id); precedent = coursDe(id);
  }
  return out;
}

/** remet `id` dans `file` (cartes restantes, sans elle) à la position `k` tirée dans
   la plage — k autres cartes passent avant son retour. File trop courte → en fin de file.
   Parmi les positions de la plage, préfère celle qui évite de coller deux cartes du même
   cours. L'écart réellement vécu vaut k, ou PLUS si d'autres cartes sont ensuite
   réinsérées devant elle (jamais moins : seule la tête de file sort de la file). */
export function reinserer(file, id, plage, coursDe, rand = Math.random) {
  const f = file.slice();
  const k = hasard(rand, plage);
  if (f.length < k) { f.push(id); return f; }
  const c = coursDe(id);
  const ok = (p) => (p === 0 || coursDe(f[p - 1]) !== c) && (p >= f.length || coursDe(f[p]) !== c);
  const essais = [k];
  for (let p = plage[0]; p <= plage[1]; p++) if (p !== k && p <= f.length) essais.push(p);
  const pos = essais.find(ok);
  f.splice(pos != null ? pos : k, 0, id);
  return f;
}

/* ============================================================
   TEMPS : estimation, recalibrée sur les séances réelles
   ============================================================ */
export function estimationMs(nRevisions, nApprendre, mesures) {
  const m = (mesures || []).slice(-10);
  const moy = (champN, champMs, defaut) => {
    const util = m.filter((x) => x[champN] > 0);
    if (util.length < 3) return defaut; // « après quelques séances »
    const n = util.reduce((s, x) => s + x[champN], 0);
    const ms = util.reduce((s, x) => s + x[champMs], 0);
    return n ? ms / n : defaut;
  };
  return nRevisions * moy('nRevisions', 'msRevisions', TEMPS_DEFAUT_MS.revision)
    + nApprendre * moy('nApprendre', 'msApprendre', TEMPS_DEFAUT_MS.nouvelle);
}
