/* ============================================================
   MedRevise — GESTE EN COURS (v1.4 du panneau, 07/10 — docs/compte-rendu-panneau-lateral.md).

   Pendant qu'on fait glisser le panneau d'un mode à l'autre (et jusqu'à la fin de
   l'aimantation), AUCUN rendu React ne doit se glisser entre deux images. Or la
   transcription en direct publie plusieurs fois par seconde (lignes, chrono, niveau
   audio) : chaque publication re-rendait le transcript (300+ lignes), la pastille, le
   VU-mètre, les crédits — en plein geste.

   Ici, les abonnements React aux stores « vivants » passent par `differer(cb)` : tant
   qu'un geste est en cours, la notification est mise de côté (une seule par abonné) et
   rejouée à la fin du geste — un rendu de rattrapage. Le moteur, lui, ne s'arrête jamais :
   l'audio part, les lignes s'enregistrent ; seul l'AFFICHAGE attend (< 1 s).
   ============================================================ */
let actif = false;
const enAttente = new Set();

export const gesteActif = () => actif;

export function debutGeste() { actif = true; }

export function finGeste() {
  if (!actif) return;
  actif = false;
  const l = [...enAttente];
  enAttente.clear();
  l.forEach((f) => { try { f(); } catch (e) { /* un abonné défaillant ne bloque pas les autres */ } });
}

/** Enveloppe une notification d'abonné : immédiate hors geste, différée pendant un geste. */
export const differer = (cb) => () => { if (actif) enAttente.add(cb); else cb(); };

/** Abonnement différé pour useSyncExternalStore : `s'abonner(abonner)` → (cb) => abonner(differer(cb)). */
export const abonnementDiffere = (abonner) => (cb) => abonner(differer(cb));

// mesures (développement seulement) : la sonde de performance lit l'état du geste
if (import.meta.env && import.meta.env.DEV && typeof window !== 'undefined') window.__medreviseGeste = () => actif;
