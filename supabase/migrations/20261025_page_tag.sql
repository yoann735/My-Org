-- ============================================================================
-- MedRevise — TAGS DE PAGE « Début / Fin de cours » (25/10/2026) — type d'enregistrement « page_tag »
-- Migration ADDITIVE, idempotente. NON appliquée automatiquement : à exécuter à la main dans
-- Supabase → SQL Editor → New query → coller ce fichier → Run.
--
-- CE QUI CHANGE : rien dans les données. La table `public.medrevise_records` est générique
-- (store, record_id, data jsonb, updated_at, deleted) et `medrevise_push` n'a pas de liste blanche
-- de stores : le nouveau type y entre comme les autres, par la même écriture conditionnelle sur
-- updated_at (garde-fou LWW). Aucune colonne ajoutée, aucune contrainte modifiée, aucune ligne
-- lue, écrite ou supprimée.
--
-- Le type « page_tag » = UN enregistrement par tag (record_id 'pt…') :
--   { id, courseId, document: 'original' | 'fiche', page, pageCle, kind: 'debut' | 'fin',
--     date: 'AAAA-MM-JJ', transcriptSessionId: <id de transcript_session> | null, supprime?: true, updatedAt }
-- Un tag retiré est MARQUÉ « supprime: true » (mise à jour), jamais effacé : aucune suppression ne part au cloud.
--
-- Ce script ajoute UN index partiel (lecture de ce type sur une grosse table).
-- SANS CE SCRIPT : l'app fonctionne exactement pareil — l'index ne sert qu'à la vitesse de lecture.
-- ============================================================================

create index if not exists medrevise_records_page_tag
  on public.medrevise_records (record_id, updated_at)
  where store = 'page_tag';

-- PostgREST : rafraîchit sa vue du schéma (sans effet sur les données).
notify pgrst, 'reload schema';


-- ============================================================================
-- VÉRIFICATION (lecture seule) — à exécuter séparément après coup.
-- ============================================================================
--
-- L'index existe :
-- select indexname from pg_indexes
--  where tablename = 'medrevise_records' and indexname = 'medrevise_records_page_tag';
--
-- Les tags au cloud (sans rien modifier) :
-- select record_id, data->>'courseId' as cours, data->>'kind' as sorte, data->>'page' as page, data->>'date' as date,
--        data->>'transcriptSessionId' as transcript, coalesce((data->>'supprime')::boolean, false) as retire
--   from public.medrevise_records where store = 'page_tag' and not deleted order by data->>'date' desc;
