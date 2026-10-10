/* ============================================================
   MedRevise — PLANIFICATEUR : configuration (étape 2 FSRS).
   Toutes les options FSRS vivent ici ; le seul module qui importe ts-fsrs est ./fsrs.js.
   Réglages utilisateur synchronisés : enregistrement `prompts/reglagesFC` (lib/storage.js),
   lu par lib/apprentissageFC.js#reglagesFC (nom historique conservé).
   ============================================================ */
import { FUSEAU, HEURE_BASCULE } from './jours.js';

export const VERSION_TS_FSRS = '5.4.2';
export const VERSION_PLANIFICATEUR = 'medrevise-fsrs-1';

export const INTERVALLE_MAX_DEFAUT = 45;
export const BORNES_INTERVALLE_MAX = [7, 365];
export const DIFFICULTE_MIGRATION = 7;

// tests automatiques (vitest) : fuzz désactivé pour des intervalles exacts
const enTest = typeof process !== 'undefined' && !!(process.env && (process.env.VITEST || process.env.NODE_ENV === 'test'));

/** configuration complète du planificateur à partir des réglages bruts (reglagesFC) */
export function configPlanificateur(reglages = {}, surcharges = {}) {
  const brut = Number(reglages && reglages.intervalleMax);
  const intervalleMax = Number.isFinite(brut) && brut > 0
    ? Math.min(BORNES_INTERVALLE_MAX[1], Math.max(BORNES_INTERVALLE_MAX[0], Math.round(brut)))
    : INTERVALLE_MAX_DEFAUT;
  return {
    retention: 0.9,
    intervalleMax,
    fuzz: !enTest,
    etapesApprentissage: [],
    etapesReapprentissage: [],
    courtTerme: false,
    difficulteMigration: DIFFICULTE_MIGRATION,
    bascule: HEURE_BASCULE,
    fuseau: FUSEAU,
    ...surcharges,
  };
}

/** le planificateur qui DÉCIDE des dates : FSRS seulement si l'interrupteur est ON ET la
   migration appliquée (sinon FSRS reste en mode ombre et le planificateur maison décide). */
export function planificateurActif(reglages) {
  return reglages && reglages.planificateur === 'fsrs' && reglages.fsrsMigration ? 'fsrs' : 'maison';
}
