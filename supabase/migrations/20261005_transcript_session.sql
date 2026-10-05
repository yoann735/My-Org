-- ============================================================================
-- MedRevise — TRANSCRIPTION EN DIRECT : type d'enregistrement « transcript_session »
-- Migration ADDITIVE, idempotente. NON appliquée automatiquement : à exécuter à la
-- main dans Supabase → SQL Editor → New query → coller ce fichier → Run.
--
-- CE QUI CHANGE : rien dans les données. La table `public.medrevise_records` est
-- générique (store, record_id, data jsonb, updated_at, deleted) : les sessions de
-- transcription y entrent comme n'importe quel autre type, par la même fonction
-- `medrevise_push` (écriture conditionnelle sur updated_at). Aucune colonne n'est
-- ajoutée, aucune contrainte modifiée, aucune ligne lue, écrite ou supprimée.
--
-- Ce script ajoute UN index partiel : l'app lit d'abord les métadonnées des
-- sessions (record_id, updated_at, deleted — sans le texte) pour ne télécharger
-- que celles qui ont changé. L'index rend cette lecture indépendante du volume du
-- reste de la table.
--
-- SANS CE SCRIPT : l'app fonctionne quand même (lecture un peu moins rapide quand
-- la table grossira). Si le cloud refusait ce type pour une autre raison, la
-- synchro des sessions échouerait seule — elles restent sur l'appareil, dans la
-- file d'envoi — sans retenir celle des fiches, cartes, annotations…
-- ============================================================================

create index if not exists medrevise_records_transcript_meta
  on public.medrevise_records (record_id, updated_at, deleted)
  where store = 'transcript_session';

-- PostgREST : rafraîchit sa vue du schéma (sans effet sur les données).
notify pgrst, 'reload schema';


-- ============================================================================
-- VÉRIFICATION (lecture seule) — à exécuter séparément après coup.
-- ============================================================================
--
-- L'index existe :
-- select indexname from pg_indexes
--  where tablename = 'medrevise_records' and indexname = 'medrevise_records_transcript_meta';
--
-- Sessions et listes de mots-clés au cloud (sans le texte) :
-- select record_id, data->>'kind' as kind, data->>'courseId' as cours,
--        data->>'startedAt' as debut, data->>'endedAt' as fin,
--        jsonb_array_length(coalesce(data->'segments', '[]'::jsonb)) as lignes,
--        pg_size_pretty(pg_column_size(data)::bigint) as taille, updated_at, deleted
--   from public.medrevise_records
--  where store = 'transcript_session'
--  order by updated_at desc;
