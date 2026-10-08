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
     learning  le jour venu (sa date de départ), entre dans le bloc « Apprendre » de la
               séance du jour — SANS quota (v1.1, 08/10) : toutes les cartes du jour ;
               y reste jusqu'à `critere` succès consécutifs (2 par défaut, un seul réglage) ;
     review    dans la méthode des J (inchangée), première échéance à J+1.
     Retour    un « Raté » en révision → advanceQuestion (intervalles inchangés)
               PUIS learning, même critère, à partir du lendemain ; à sa sortie, J+1.

   Champs ajoutés aux cartes (ajouts purs, jamais de contenu modifié) :
     learnState            'new' | 'learning' | 'review'
     learningStreak        succès consécutifs actuels
     learningCriterion     critère au moment de l'entrée (informatif : depuis la v1.1, c'est le
                           réglage courant qui décide, pour toutes les cartes)
     learningPresented     la carte a déjà été montrée recto + verso
     lastSeenAt            ISO de la dernière vue dans la séance
     learningIntroducedOn  jour où la carte est entrée dans le bloc Apprendre
     learningDue           jour à partir duquel elle y est attendue (raté → demain)
     learningSource        'nouvelle' | 'rate' (redescendue après un raté en révision)

   Une carte SANS `learnState` (créée par un appareil pas encore à jour, ou pas
   encore migrée) est classée à la volée par les MÊMES règles que la migration.
   ============================================================ */
import { todayISO, isoDate, INTERVAL_START, QUALITY } from './sm2.js';

/* v1.1 (08/10) : critère 2 (plage 1–5), un seul réglage (le même après un raté) ; plus AUCUN
   quota de nouvelles cartes — une carte entre dans Apprendre le jour de sa date de départ. */
export const REGLAGES_FC_DEFAUT = { critere: 2 };
export const BORNES_FC = { critere: [1, 5] };
// estimation du temps de séance tant qu'il n'y a pas assez de mesures réelles (critère 2 : ≈ 45 s par nouvelle)
export const TEMPS_DEFAUT_MS = { revision: 15000, nouvelle: 45000 };
export const VERSION_MESURES = 2; // mesures de séance prises avec le critère 2 (les anciennes, critère 3, sont ignorées)
// distances de réinsertion dans la file du bloc Apprendre (nombre de cartes vues avant le retour) ;
// une carte réussie du PREMIER coup après sa présentation repasse en FIN de paquet (v1.1)
export const DISTANCE = { pasSu: [3, 4], su: [8, 10], presentation: [3, 4], finDePaquet: [Infinity, Infinity] };

export function reglagesFC(brut) {
  const r = { ...REGLAGES_FC_DEFAUT, ...(brut || {}) };
  const borne = (k) => Math.min(BORNES_FC[k][1], Math.max(BORNES_FC[k][0], Math.round(Number(r[k]) || REGLAGES_FC_DEFAUT[k])));
  return {
    critere: borne('critere'),
    // carte Muscle (lib/muscle.js) : verso révélé ligne par ligne — actif sauf choix contraire
    muscleLigneParLigne: r.muscleLigneParLigne !== false,
  };
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
  // déjà entrées dans Apprendre (non terminées la veille, ou redescendues après un raté)
  const attendues = learning.filter((q) => commencee(q) && (q.learningDue || q.learningIntroducedOn) <= today);
  // v1.1 : une carte qui a DÉJÀ le nombre de succès requis (critère abaissé de 3 à 2) sort sans repasser
  const aSortir = attendues.filter((q) => (q.learningStreak || 0) >= reg.critere);
  const enCours = attendues.filter((q) => (q.learningStreak || 0) < reg.critere);
  // nouvelles du jour : TOUTES celles dont la date de départ est arrivée (plus de quota), plus anciennes d'abord
  const nouvelles = learning.filter((q) => !commencee(q))
    .sort((a, b) => ((a.dueDate || '') < (b.dueDate || '') ? -1 : (a.dueDate || '') > (b.dueDate || '') ? 1 : String(a.id) < String(b.id) ? -1 : 1));
  return { revisions, enCours, nouvelles, aSortir, reglages: reg };
}

/** prochaine date où il y aura quelque chose à faire (écran « Rien à faire aujourd'hui »). */
export function prochaineSeance(cartes, plan, today = todayISO(), dateDue = (q) => q.dueDate) {
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
/** la carte entre dans le bloc Apprendre de la séance du jour (nouvelle, le jour de sa date de départ). */
export function introduire(q, reg, today = todayISO()) {
  return {
    ...q, learnState: 'learning', learningIntroducedOn: today, learningDue: today, learningSource: 'nouvelle',
    learningCriterion: reglagesFC(reg).critere,
    learningStreak: q.learningStreak || 0, learningPresented: !!q.learningPresented,
  };
}

/** première vue : présentation recto + verso, pas un test. */
export function presenter(q, maintenant = new Date().toISOString()) {
  return { ...q, learningPresented: true, lastSeenAt: maintenant };
}

/** réponse à un test du bloc Apprendre. `{ carte, sortie }` — sortie = critère atteint → J+1. */
export function repondre(q, su, reg, today = todayISO(), maintenant = new Date().toISOString()) {
  // v1.1 : le RÉGLAGE courant décide pour toutes les cartes (un critère 3 posé avant n'oblige plus à 3)
  const critere = reglagesFC(reg).critere;
  if (!su) return { carte: { ...q, learningStreak: 0, learningPresented: true, lastSeenAt: maintenant }, sortie: false };
  const streak = (q.learningStreak || 0) + 1;
  if (streak < critere) return { carte: { ...q, learningStreak: streak, learningPresented: true, lastSeenAt: maintenant }, sortie: false };
  return { carte: sortir({ ...q, lastSeenAt: maintenant }, today), sortie: true };
}

/** sortie d'apprentissage : la méthode des J prend le relais, première échéance au lendemain */
export function sortir(q, today = todayISO()) {
  return {
    ...q, learnState: 'review', learningStreak: 0, learningPresented: true, learningDoneOn: today,
    intervalDays: INTERVAL_START, dueDate: ajouterJours(today, 1), capped: false, termine: false,
  };
}

/** après une notation dans la méthode des J (`apres` = résultat d'advanceQuestion,
   inchangé) : un Raté sur une flashcard redescend en apprentissage pour le lendemain. */
export function apresNotationJ(apres, quality, reg, today = todayISO()) {
  if (!estFlashcardJ(apres) || quality !== QUALITY.rate) return apres;
  return {
    ...apres, learnState: 'learning', learningStreak: 0, learningPresented: true,
    learningCriterion: reglagesFC(reg).critere, learningSource: 'rate',
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
   la plage — k autres cartes passent avant son retour. File trop courte → en fin de file
   (plage DISTANCE.finDePaquet : toujours en fin de file).
   Parmi les positions de la plage, préfère celle qui évite de coller deux cartes du même
   cours. L'écart réellement vécu vaut k, ou PLUS si d'autres cartes sont ensuite
   réinsérées devant elle (jamais moins : seule la tête de file sort de la file). */
export function reinserer(file, id, plage, coursDe, rand = Math.random) {
  const f = file.slice();
  if (!Number.isFinite(plage[0])) { f.push(id); return f; }
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
  const toutes = (mesures || []).slice(-10);
  // apprentissage : seules les séances au critère actuel (v1.1) comptent — celles au critère 3 surestiment
  const recentes = (mesures || []).filter((x) => (x.v || 1) >= VERSION_MESURES).slice(-10);
  const moy = (m, champN, champMs, defaut) => {
    const util = m.filter((x) => x[champN] > 0);
    if (util.length < 3) return defaut; // « après quelques séances »
    const n = util.reduce((s, x) => s + x[champN], 0);
    const ms = util.reduce((s, x) => s + x[champMs], 0);
    return n ? ms / n : defaut;
  };
  return nRevisions * moy(toutes, 'nRevisions', 'msRevisions', TEMPS_DEFAUT_MS.revision)
    + nApprendre * moy(recentes, 'nApprendre', 'msApprendre', TEMPS_DEFAUT_MS.nouvelle);
}
