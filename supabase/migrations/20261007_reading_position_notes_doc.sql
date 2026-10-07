-- ============================================================================
-- MedRevise — POSITION DE LECTURE et DOCUMENT DE NOTES (07/10/2026)
-- types d'enregistrement « reading_position » et « notes_doc »
-- Migration ADDITIVE, idempotente. NON appliquée automatiquement : à exécuter à la
-- main dans Supabase → SQL Editor → New query → coller ce fichier → Run.
--
-- CE QUI CHANGE : rien dans les données. La table `public.medrevise_records` est
-- générique (store, record_id, data jsonb, updated_at, deleted) et `medrevise_push`
-- n'a pas de liste blanche de stores : les deux nouveaux types y entrent comme les
-- autres, par la même écriture conditionnelle sur updated_at (garde-fou LWW).
-- Aucune colonne ajoutée, aucune contrainte modifiée, aucune ligne lue, écrite ou
-- supprimée.
--
-- Ce script ajoute DEUX index partiels, utiles quand la table grossira :
--   - reading_position : un enregistrement par cours, réécrit au plus une fois toutes
--     les 30 s par appareil (regroupement côté app, lib/storage.js#ecrireRegroupe) ;
--   - notes_doc : un document par cours (JSON ProseMirror, images en blobs à part).
--
-- SANS CE SCRIPT : l'app fonctionne exactement pareil (local d'abord, synchro par la
-- table générique) — seules les lectures de ces types seraient un peu moins rapides
-- sur une très grosse table.
-- ============================================================================

create index if not exists medrevise_records_reading_position
  on public.medrevise_records (record_id, updated_at)
  where store = 'reading_position';

create index if not exists medrevise_records_notes_doc
  on public.medrevise_records (record_id, updated_at)
  where store = 'notes_doc';

-- PostgREST : rafraîchit sa vue du schéma (sans effet sur les données).
notify pgrst, 'reload schema';


-- ============================================================================
-- VÉRIFICATION (lecture seule) — à exécuter séparément après coup.
-- ============================================================================
--
-- Les index existent :
-- select indexname from pg_indexes
--  where tablename = 'medrevise_records'
--    and indexname in ('medrevise_records_reading_position', 'medrevise_records_notes_doc');
--
-- Positions de lecture au cloud (sans rien modifier) :
-- select record_id, data->>'kind' as kind, data->>'cle' as page, data->>'fraction' as decalage,
--        data->>'scale' as zoom, updated_at
--   from public.medrevise_records where store = 'reading_position' order by updated_at desc limit 20;
--
-- Documents de notes au cloud :
-- select record_id, length(data::text) as taille, updated_at, deleted
--   from public.medrevise_records where store = 'notes_doc' order by updated_at desc limit 20;
