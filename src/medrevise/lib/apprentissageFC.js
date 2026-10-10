/* ============================================================
   MedRevise — SÉANCE QUOTIDIENNE DES FLASHCARDS : réglages, plan du jour, estimation du temps.

   Étape 2 FSRS (10/10/2026, docs/fsrs-etape2-compte-rendu.md) : le MODE APPRENTISSAGE est
   SUPPRIMÉ (paquet, présentation « Compris », Pas su / Su, succès consécutifs, réinsertion,
   bascule Révisions / Apprentissage, critère). Les cartes qui y étaient ont été converties en
   cartes de révision ordinaires (lib/conversionApprentissage.js). Les champs learnState /
   learning* restent en base et ne sont plus lus.
   La séance du jour = toutes les flashcards planifiées dues aujourd'hui ou avant (révisions +
   nouvelles arrivées à leur date de départ), une vue chacune, cours mélangés, 4 boutons.
   (Nom de fichier conservé : les réglages synchronisés s'appellent toujours `reglagesFC`.)
   ============================================================ */
import { todayISO } from './sm2.js';
import { INTERVALLE_MAX_DEFAUT, BORNES_INTERVALLE_MAX } from '../scheduler/config.js';

export const BORNES_FC = { intervalleMax: BORNES_INTERVALLE_MAX };
// estimation du temps tant qu'il n'y a pas assez de mesures réelles : 15 s par carte
export const TEMPS_DEFAUT_MS = { revision: 15000 };
export const VERSION_MESURES = 2;

/** réglages effectifs (enregistrement synchronisé `prompts/reglagesFC`) */
export function reglagesFC(brut) {
  const r = brut || {};
  const n = Number(r.intervalleMax);
  return {
    // carte Muscle (lib/muscle.js) : verso révélé ligne par ligne — actif sauf choix contraire
    muscleLigneParLigne: r.muscleLigneParLigne !== false,
    // FSRS : « Intervalle maximum » (7–365 j, 45 par défaut), interrupteur, migration appliquée
    intervalleMax: Number.isFinite(n) && n > 0 ? Math.min(BORNES_INTERVALLE_MAX[1], Math.max(BORNES_INTERVALLE_MAX[0], Math.round(n))) : INTERVALLE_MAX_DEFAUT,
    planificateur: r.planificateur === 'fsrs' ? 'fsrs' : 'maison',
    fsrsMigration: r.fsrsMigration || null,
  };
}

/** seules les flashcards de la méthode des J (pas les QCM, ni les flashcards d'erreur du carnet). */
export const estFlashcardJ = (q) => !!q && q.type === 'flashcard';

/** la carte a-t-elle déjà été notée au moins une fois dans la méthode des J ? */
export const aEteNoteeJ = (q) => (q.historique || []).some((h) => h && h.qualite != null);

/** PLAN DU JOUR (pur) — `cartes` = flashcards des fiches planifiées ; `dateDue` = planning.js nextDate
   (lecture effective de dueDate : « Sauter », conversion). Dues aujourd'hui OU AVANT. */
export function planDuJour(cartes, today = todayISO(), dateDue = (q) => q.dueDate) {
  const dues = (cartes || []).filter(estFlashcardJ).filter((q) => {
    const d = dateDue(q);
    return d != null && d <= today && q.skippedOn !== today;
  });
  return { dues };
}

/** prochaine date où il y aura quelque chose à faire (écran « Rien à faire aujourd'hui »). */
export function prochaineSeance(cartes, today = todayISO(), dateDue = (q) => q.dueDate) {
  let min = null;
  (cartes || []).filter(estFlashcardJ).forEach((q) => { const d = dateDue(q); if (d && d > today && (!min || d < min)) min = d; });
  return min;
}

/** ordre : cours (fiches) alternés autant que possible, ordre mélangé dans chaque cours. */
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
    const tri = listes.filter((l) => l.length).sort((a, b) => b.length - a.length);
    const choix = tri.find((l) => coursDe(l[0]) !== precedent) || tri[0];
    const id = choix.shift();
    out.push(id); precedent = coursDe(id);
  }
  return out;
}

/* ============================================================
   REPRISE D'UNE SÉANCE COMMENCÉE (pur) — la séance sauvegardée (meta local `seanceFC`) est
   remise d'accord avec le plan du jour : déjà faites intactes ; restantes = encore dues (une
   carte notée ou supprimée ailleurs disparaît) ; les cartes devenues dues entre-temps (créées,
   arrivées d'un autre appareil) s'ajoutent en fin, cours entrelacés. Jamais de doublon.
   ============================================================ */
export function reprendreSeance(etat, plan, coursDe = () => '', rand = Math.random) {
  const uniques = (l) => [...new Set(l || [])];
  const faites = uniques((etat.cartes || []).slice(0, etat.idx || 0));
  const dejaFaites = new Set(faites);
  const restantesAvant = uniques((etat.cartes || []).slice(etat.idx || 0)).filter((id) => !dejaFaites.has(id));
  const dues = new Set(plan.dues.map((q) => q.id));
  const restantes = restantesAvant.filter((id) => dues.has(id));
  const connues = new Set([...faites, ...restantesAvant]);
  const ajouts = entrelacer(plan.dues.map((q) => q.id).filter((id) => !connues.has(id)), coursDe, rand);
  const cartes = [...faites, ...restantes, ...ajouts];
  return {
    etat: { ...etat, cartes, idx: faites.length, phase: cartes.length > faites.length ? 'cartes' : 'fin' },
    ajouts: ajouts.length, retirees: restantesAvant.length - restantes.length,
  };
}

/** TEMPS : estimation, recalibrée sur les séances réelles (moyenne des 10 dernières, ≥ 3 mesures) */
export function estimationMs(nCartes, mesures) {
  const util = (mesures || []).slice(-10).filter((x) => x.nRevisions > 0);
  if (util.length < 3) return nCartes * TEMPS_DEFAUT_MS.revision;
  const n = util.reduce((s, x) => s + x.nRevisions, 0);
  const ms = util.reduce((s, x) => s + x.msRevisions, 0);
  return nCartes * (n ? ms / n : TEMPS_DEFAUT_MS.revision);
}
