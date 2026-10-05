-- ============================================================================
-- MedRevise — COUCHES OCR : type d'enregistrement « ocr_layer »
-- Migration ADDITIVE, idempotente. NON appliquée automatiquement : à exécuter à la
-- main dans Supabase → SQL Editor → New query → coller ce fichier → Run.
--
-- CE QUI CHANGE : rien dans les données. La table `public.medrevise_records` est
-- générique (store, record_id, data jsonb, updated_at, deleted) : les couches de
-- texte OCR y entrent comme n'importe quel autre type, par la même fonction
-- `medrevise_push` (écriture conditionnelle sur updated_at). Aucune colonne n'est
-- ajoutée, aucune contrainte modifiée, aucune ligne lue, écrite ou supprimée.
-- Les PDF d'origine (bucket `medrevise-blobs`) ne sont jamais réécrits.
--
-- Une couche = UN fichier PDF (identifiant = empreinte SHA-256 du fichier + version
-- du moteur), pages compressées (gzip + base64) dans `data.pagesGz` : ~3 Ko par
-- page OCR. Seules les couches COMPLÈTES sont envoyées.
--
-- Ce script ajoute UN index partiel : l'app lit d'abord les métadonnées des
-- couches (record_id, updated_at, deleted — sans les pages) pour ne télécharger
-- que celles qui manquent ou ont changé.
--
-- SANS CE SCRIPT : l'app fonctionne quand même (lecture un peu moins rapide quand
-- la table grossira). Si le cloud refusait ce type, seule la synchro des couches
-- échouerait — elles restent sur l'appareil, dans la file d'envoi — sans retenir
-- celle des fiches, cartes, annotations…
-- ============================================================================

create index if not exists medrevise_records_ocr_meta
  on public.medrevise_records (record_id, updated_at, deleted)
  where store = 'ocr_layer';

-- PostgREST : rafraîchit sa vue du schéma (sans effet sur les données).
notify pgrst, 'reload schema';


-- ============================================================================
-- VÉRIFICATION (lecture seule) — à exécuter séparément après coup.
-- ============================================================================
--
-- L'index existe :
-- select indexname from pg_indexes
--  where tablename = 'medrevise_records' and indexname = 'medrevise_records_ocr_meta';
--
-- Couches au cloud (sans les pages) :
-- select record_id, data->>'courseId' as cours, data->>'engineVersion' as moteur,
--        data->>'status' as statut, (data->>'pageCount')::int as pages,
--        (data->>'confidence')::int as confiance,
--        pg_size_pretty(pg_column_size(data)::bigint) as taille, updated_at, deleted
--   from public.medrevise_records
--  where store = 'ocr_layer'
--  order by updated_at desc;
