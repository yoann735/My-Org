-- ============================================================================
-- MedRevise — TABLEAU (Miro) d'une fiche (22/10/2026) — type d'enregistrement « board »
-- Migration ADDITIVE, idempotente. NON appliquée automatiquement : à exécuter à la main dans
-- Supabase → SQL Editor → New query → coller ce fichier → Run.
--
-- CE QUI CHANGE : rien dans les données. La table `public.medrevise_records` est générique
-- (store, record_id, data jsonb, updated_at, deleted) et `medrevise_push` n'a pas de liste blanche
-- de stores : le nouveau type y entre comme les autres, par la même écriture conditionnelle sur
-- updated_at (garde-fou LWW). Aucune colonne ajoutée, aucune contrainte modifiée, aucune ligne
-- lue, écrite ou supprimée.
--
-- Le type « board » = UN enregistrement par fiche (record_id 'board:<ficheId>') :
--   { id, ficheId, kind:'board', v:1,
--     objects: [ { id, type:'carte'|'image', x, y, w, h, z, couleur, titre, corps, blobId,
--                  groupe, source: { flashcardId, sorte, muscle|tableau|molecule } } ],
--     edges:   [ { id, de, vers, x, y, points[], type, pointes, trait, epaisseur, couleur, geo:3 } ],
--     viewport: { x, y, z }, theme: 'sombre'|'blanc', updatedAt }
-- Les images voyagent par le bucket `medrevise-blobs` (champ blobId), comme toutes les images.
-- L'ancien store « tableau » (un enregistrement par carte, 04/10) n'est jamais réécrit : un board
-- est construit à partir de ses éléments à la première ouverture, et ses lignes restent telles quelles.
--
-- Ce script ajoute UN index partiel (lecture de ce type sur une grosse table).
-- SANS CE SCRIPT : l'app fonctionne exactement pareil — l'index ne sert qu'à la vitesse de lecture.
-- ============================================================================

create index if not exists medrevise_records_board
  on public.medrevise_records (record_id, updated_at)
  where store = 'board';

-- PostgREST : rafraîchit sa vue du schéma (sans effet sur les données).
notify pgrst, 'reload schema';


-- ============================================================================
-- VÉRIFICATION (lecture seule) — à exécuter séparément après coup.
-- ============================================================================
--
-- L'index existe :
-- select indexname from pg_indexes
--  where tablename = 'medrevise_records' and indexname = 'medrevise_records_board';
--
-- Les tableaux au cloud (sans rien modifier) :
-- select record_id, updated_at, jsonb_array_length(data->'objects') as objets, jsonb_array_length(data->'edges') as fleches
--   from public.medrevise_records where store = 'board' and not deleted order by updated_at desc;
