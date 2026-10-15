-- ============================================================================
-- MedRevise — FICHE JUMELLE d'un cours (15/10/2026) — type d'enregistrement « companion_pdf »
-- Migration ADDITIVE, idempotente. NON appliquée automatiquement : à exécuter à la main dans
-- Supabase → SQL Editor → New query → coller ce fichier → Run.
--
-- CE QUI CHANGE : rien dans les données. La table `public.medrevise_records` est générique
-- (store, record_id, data jsonb, updated_at, deleted) et `medrevise_push` n'a pas de liste blanche
-- de stores : le nouveau type y entre comme les autres, par la même écriture conditionnelle sur
-- updated_at (garde-fou LWW). Aucune colonne ajoutée, aucune contrainte modifiée, aucune ligne
-- lue, écrite ou supprimée.
--
-- Le type « companion_pdf » = UN enregistrement par cours (record_id 'cp:<courseId>') :
--   { id, courseId, fileId, fileName, version, nsAnnot, nbPagesOrig, nbPagesFiche,
--     pageMap: { versFiche[], versOrig[], scores[], methode, manuel },
--     versions[], nonReplacees[], updatedAt }
-- Le PDF de la fiche voyage par le bucket `medrevise-blobs` (champ fileId), comme tous les PDF.
-- Les annotations de la fiche sont des lignes `highlights` / `annotations` ordinaires dont le
-- ficheId vaut '<courseId>::fiche:<version>'.
--
-- Ce script ajoute UN index partiel (lecture de ce type sur une grosse table).
-- SANS CE SCRIPT : l'app fonctionne exactement pareil — l'index ne sert qu'à la vitesse de lecture.
-- ============================================================================

create index if not exists medrevise_records_companion_pdf
  on public.medrevise_records (record_id, updated_at)
  where store = 'companion_pdf';

-- PostgREST : rafraîchit sa vue du schéma (sans effet sur les données).
notify pgrst, 'reload schema';


-- ============================================================================
-- VÉRIFICATION (lecture seule) — à exécuter séparément après coup.
-- ============================================================================
--
-- L'index existe :
-- select indexname from pg_indexes
--  where tablename = 'medrevise_records' and indexname = 'medrevise_records_companion_pdf';
--
-- Les fiches jumelles au cloud (sans rien modifier) :
-- select record_id, data->>'fileName' as fichier, data->>'version' as version,
--        jsonb_array_length(data->'pageMap'->'versOrig') as pages_fiche, updated_at, deleted
--   from public.medrevise_records where store = 'companion_pdf';
