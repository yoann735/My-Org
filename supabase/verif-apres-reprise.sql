-- ============================================================================
-- MedRevise — VÉRIFICATION APRÈS « Resume project » (LECTURE SEULE)
--
-- À exécuter UNE FOIS le projet « My Org » relancé :
--   Supabase → My Org → SQL Editor → New query → coller ce fichier → Run
--
-- Ce script ne fait QUE LIRE : il s'exécute dans une transaction déclarée
-- `read only` (Postgres refuserait toute écriture) et se termine par `rollback`.
-- Aucun CREATE, INSERT, UPDATE, DELETE, DROP. Il répond à quatre questions :
--   1. la table medrevise_records est-elle là, et combien de lignes par store ?
--   2. quelle est l'écriture la plus récente (= dernière synchro réussie) ?
--   3. la fonction medrevise_push (garde-fou updated_at) est-elle là ?
--   4. le bucket medrevise-blobs est-il là, avec combien de fichiers ?
-- ============================================================================
begin;
set transaction read only;

-- 1 + 2. la table et son contenu, store par store
select to_regclass('public.medrevise_records') is not null as table_presente;

select store,
       count(*)                                   as lignes,
       count(*) filter (where deleted)            as supprimees_tombstones,
       max(updated_at)                            as derniere_ecriture
  from public.medrevise_records
 group by store
 order by store;

-- 3. la fonction d'écriture conditionnelle
select to_regprocedure('public.medrevise_push(jsonb)') is not null as fonction_medrevise_push_presente;

-- 4. le bucket des images et PDF
select b.id as bucket, count(o.id) as fichiers,
       pg_size_pretty(coalesce(sum((o.metadata->>'size')::bigint), 0)) as taille
  from storage.buckets b
  left join storage.objects o on o.bucket_id = b.id
 where b.id = 'medrevise-blobs'
 group by b.id;

rollback;
