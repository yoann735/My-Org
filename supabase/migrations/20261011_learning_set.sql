-- ============================================================================
-- MedRevise — MODE APPRENTISSAGE LIBRE (11/10/2026)
-- type d'enregistrement « learning_set »
-- Migration ADDITIVE, idempotente. NON appliquée automatiquement : à exécuter à la
-- main dans Supabase → SQL Editor → New query → coller ce fichier → Run.
--
-- CE QUI CHANGE : rien dans les données. La table `public.medrevise_records` est
-- générique (store, record_id, data jsonb, updated_at, deleted) et `medrevise_push`
-- n'a pas de liste blanche de stores : le nouveau type y entre comme les autres, par
-- la même écriture conditionnelle sur updated_at (garde-fou LWW).
-- Aucune colonne ajoutée, aucune contrainte modifiée, aucune ligne lue, écrite ou
-- supprimée.
--
-- Le type « learning_set » = UN SEUL enregistrement (record_id 'learning_set') :
--   { id: 'learning_set', cardIds: [ids des cartes], updatedAt }
-- la liste des cartes mises à la main dans l'espace d'entraînement en rafale. Ni
-- compteur, ni date, ni historique. Ce mode n'écrit rien d'autre — ni `questions`, ni
-- la table du journal des révisions (`medrevise_review_log`).
--
-- Ce script ajoute UN index partiel (lecture de ce type sur une grosse table).
--
-- SANS CE SCRIPT : l'app fonctionne exactement pareil (local d'abord, synchro par la
-- table générique) — l'index ne sert qu'à la vitesse de lecture.
-- ============================================================================

create index if not exists medrevise_records_learning_set
  on public.medrevise_records (record_id, updated_at)
  where store = 'learning_set';

-- PostgREST : rafraîchit sa vue du schéma (sans effet sur les données).
notify pgrst, 'reload schema';


-- ============================================================================
-- VÉRIFICATION (lecture seule) — à exécuter séparément après coup.
-- ============================================================================
--
-- L'index existe :
-- select indexname from pg_indexes
--  where tablename = 'medrevise_records' and indexname = 'medrevise_records_learning_set';
--
-- La liste au cloud (sans rien modifier) :
-- select record_id, jsonb_array_length(data->'cardIds') as cartes, updated_at, deleted
--   from public.medrevise_records where store = 'learning_set';
