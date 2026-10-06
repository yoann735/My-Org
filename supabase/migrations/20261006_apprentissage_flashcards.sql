-- ============================================================================
-- MedRevise — APPRENTISSAGE DES FLASHCARDS (06/10/2026)
-- docs/compte-rendu-apprentissage-flashcards.md
-- Migration ADDITIVE, idempotente. NON appliquée automatiquement : à exécuter à la
-- main dans Supabase → SQL Editor → New query → coller ce fichier → Run.
--
-- CE QUI CHANGE : rien dans les données. Les cartes vivent dans
-- `public.medrevise_records` (store = 'questions', data jsonb) ; les nouveaux champs
-- (learnState, learningStreak, learningCriterion, learningPresented, lastSeenAt,
-- learningIntroducedOn, learningDue, learningSource, learningDoneOn) sont de simples
-- clés AJOUTÉES dans `data`, écrites par la même fonction `medrevise_push`
-- (écriture conditionnelle sur updated_at : la version la plus récente gagne).
-- Aucune colonne ajoutée, aucune contrainte modifiée, aucune ligne lue, écrite ou
-- supprimée par ce script. Les réglages (quota, critères) sont un enregistrement
-- store = 'prompts', record_id = 'reglagesFC', comme les autres préférences.
--
-- Ce script ajoute UN index d'expression partiel, pour compter/filtrer les cartes
-- par état d'apprentissage côté cloud (requêtes de contrôle ci-dessous).
--
-- SANS CE SCRIPT : l'app fonctionne exactement pareil (elle ne fait aucune requête
-- filtrée sur ces champs ; tout le calcul est local).
-- ============================================================================

create index if not exists medrevise_records_questions_learnstate
  on public.medrevise_records ((data->>'learnState'))
  where store = 'questions';

-- PostgREST : rafraîchit sa vue du schéma (sans effet sur les données).
notify pgrst, 'reload schema';


-- ============================================================================
-- VÉRIFICATION (lecture seule) — à exécuter séparément après coup.
-- ============================================================================
--
-- L'index existe :
-- select indexname from pg_indexes
--  where tablename = 'medrevise_records' and indexname = 'medrevise_records_questions_learnstate';
--
-- Répartition des flashcards par état (null = carte pas encore migrée par un appareil) :
-- select data->>'learnState' as etat, count(*)
--   from public.medrevise_records
--  where store = 'questions' and not deleted and data->>'type' = 'flashcard'
--  group by 1 order by 1;
--
-- Aucune flashcard n'a perdu son contenu (recto/verso non vides) :
-- select count(*) from public.medrevise_records
--  where store = 'questions' and not deleted and data->>'type' = 'flashcard'
--    and (coalesce(data->>'recto', '') = '' or coalesce(data->>'verso', '') = '');
