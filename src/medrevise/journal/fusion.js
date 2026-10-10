/* ============================================================
   MedRevise — JOURNAL DES RÉVISIONS : fonctions PURES (testées par vitest).
   Une entrée = une réponse à une flashcard, IMMUABLE, identifiée par un UUID généré sur
   l'appareil. Fusionner deux journaux = union par id (le premier exemplaire gagne, les entrées
   étant immuables les deux sont identiques) ; l'ordre canonique est (reviewed_at, id).
   ============================================================ */
import { trierJournal } from '../scheduler/fsrs.js';

export { trierJournal };

/** union de journaux, sans doublon d'id, triée */
export function fusionnerJournaux(...listes) {
  return trierJournal(listes.flat());
}

/** entrées de `distant` absentes de `local` (par id) */
export function nouvellesEntrees(localIds, distant) {
  const connus = localIds instanceof Set ? localIds : new Set(localIds);
  const vus = new Set();
  return (distant || []).filter((e) => e && e.id && !connus.has(e.id) && !vus.has(e.id) && vus.add(e.id));
}

/** ligne de la table Supabase `medrevise_review_log` à partir d'une entrée locale */
export function versLigne(e) {
  return {
    id: e.id, card_id: e.card_id, rating: e.rating, reviewed_at: e.reviewed_at,
    device: e.device || null, scheduler_version: e.scheduler_version || null,
    state_before: e.state_before || null, state_after: e.state_after || null,
    details: { jour: e.jour || null, planificateur: e.planificateur || null, ...(e.details || {}) },
  };
}

/** entrée locale à partir d'une ligne Supabase */
export function depuisLigne(l) {
  const { jour = null, planificateur = null, ...details } = l.details || {};
  return {
    id: l.id, card_id: l.card_id, rating: l.rating, reviewed_at: new Date(l.reviewed_at).toISOString(), jour,
    device: l.device || null, scheduler_version: l.scheduler_version || null, planificateur,
    state_before: l.state_before || null, state_after: l.state_after || null, details,
  };
}

/** compare deux blocs FSRS en ignorant la date de mise à jour (évite les réécritures inutiles) */
export function memeBloc(a, b) {
  const sans = (x) => { if (!x) return null; const { majLe, ...r } = x; return r; }; // eslint-disable-line no-unused-vars
  const tri = (v) => (Array.isArray(v) ? v.map(tri) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, tri(v[k])])) : v);
  return JSON.stringify(tri(sans(a))) === JSON.stringify(tri(sans(b)));
}
