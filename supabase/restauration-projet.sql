-- ############################################################################
-- ##  NE PAS EXÉCUTER — mise à jour du 30/09/2026 (voir docs/diag-supabase.md)
-- ##
-- ##  Le projet « My Org » (deaonugwvbapkdixdowk) n'est PAS supprimé : il est
-- ##  EN PAUSE, et Supabase indique que toutes ses données, sauvegardes et
-- ##  fichiers sont intacts. La remise en route = « Resume project » dans le
-- ##  tableau de bord, et RIEN d'autre.
-- ##
-- ##  Sur un projet qui existe déjà, ce script n'est PAS neutre : son
-- ##  `create or replace function medrevise_push` remplacerait la fonction en
-- ##  place par la version ci-dessous. Il ne sert QUE si un jour il faut
-- ##  repartir d'un projet NEUF et vide.
-- ############################################################################
--
-- ============================================================================
-- MedRevise — RESTAURATION D'UN PROJET SUPABASE NEUF
--
-- Pourquoi ce fichier existe : dans la nuit du 29 au 30/09/2026, le projet
-- Supabase visé par la production ne résolvait plus en DNS (NXDOMAIN sur trois
-- résolveurs). Diagnostic complet : docs/diag-supabase-nuit.md.
--
-- Ce script recrée TOUT le schéma dont MedRevise a besoin, sur un projet neuf :
--   1. la table public.medrevise_records + sa RLS + sa policy anon
--   2. le bucket Storage medrevise-blobs + sa policy anon
--   3. la fonction medrevise_push (écriture conditionnelle, garde-fou updated_at)
--
-- Il réunit, sans rien changer, ce qui était déjà dans le dépôt :
--   - MEDREVISE_SUPABASE_SYNC.md, étape (b)
--   - supabase/medrevise_push.sql
--
-- ----------------------------------------------------------------------------
-- CE SCRIPT NE DÉTRUIT RIEN.
--   `create table if not exists`, `on conflict do nothing`, `create or replace`,
--   et les policies sont créées seulement si elles manquent (bloc DO plus bas).
--   Aucun DROP, aucun DELETE, aucun TRUNCATE, aucun UPDATE de données.
--   Exécuté par erreur sur un projet qui contient déjà des données : sans effet.
-- ----------------------------------------------------------------------------
--
-- MODE D'EMPLOI
--   A. RÉPÉTITION À BLANC (recommandée) : exécuter le fichier tel quel.
--      Il commence par `begin;` et finit par `rollback;` : rien n'est conservé,
--      mais toute erreur de syntaxe ou de droits apparaîtra, et les deux
--      contrôles AVANT/APRÈS s'afficheront.
--   B. APPLICATION RÉELLE : remplacer la dernière ligne `rollback;` par
--      `commit;` puis réexécuter.
--
--   Note : le bucket Storage est créé par un INSERT dans storage.buckets, donc
--   il participe bien à la transaction (il disparaît au rollback). C'est voulu :
--   la répétition doit être sans trace.
-- ============================================================================

begin;

-- ---------------------------------------------------------------- CONTRÔLE AVANT
select 'AVANT' as moment,
       to_regclass('public.medrevise_records')                      as table_records,
       (select count(*) from pg_proc
         where proname = 'medrevise_push'
           and pronamespace = 'public'::regnamespace)               as fonction_push,
       (select count(*) from storage.buckets
         where id = 'medrevise-blobs')                              as bucket_blobs,
       (select count(*) from pg_policies
         where schemaname = 'public' and tablename = 'medrevise_records') as policies_records;

-- ------------------------------------------------------------------- 1. LA TABLE
-- Une ligne par (store, record_id), tous les stores IndexedDB confondus.
-- `deleted` = tombstone : une suppression voyage, elle ne s'efface pas.
create table if not exists public.medrevise_records (
  store      text        not null,
  record_id  text        not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  deleted    boolean     not null default false,
  primary key (store, record_id)
);

alter table public.medrevise_records enable row level security;

-- `create policy` n'accepte pas `if not exists` : on teste d'abord.
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'medrevise_records'
       and policyname = 'medrevise_records_anon_all'
  ) then
    create policy "medrevise_records_anon_all"
      on public.medrevise_records
      for all to anon
      using (true) with check (true);
  end if;
end $$;

-- --------------------------------------------------------- 2. LE BUCKET (fichiers)
-- PDF et images : bien trop gros pour du JSONB, ils ont leur propre canal.
insert into storage.buckets (id, name, public)
values ('medrevise-blobs', 'medrevise-blobs', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage'
       and tablename  = 'objects'
       and policyname = 'medrevise_blobs_anon_all'
  ) then
    create policy "medrevise_blobs_anon_all"
      on storage.objects
      for all to anon
      using (bucket_id = 'medrevise-blobs')
      with check (bucket_id = 'medrevise-blobs');
  end if;
end $$;

-- ------------------------------------------- 3. L'ÉCRITURE CONDITIONNELLE (garde-fou)
-- SANS elle, la synchro tourne en mode DÉGRADÉ (l'app le dit dans Réglages) : un
-- upsert PostgREST écrase la ligne cloud quoi qu'elle contienne, updated_at compris,
-- qu'il fait donc RECULER — défaut « C1 » de docs/audit-sync-J-2026.md, cause des
-- divergences entre appareils. Ici, Postgres refuse lui-même l'écriture périmée.
-- `security invoker` : droits de l'appelant (anon), la RLS continue de s'appliquer.
create or replace function public.medrevise_push(records jsonb)
returns integer
language plpgsql
security invoker
as $$
declare n integer;
begin
  with entrant as (
    select (r->>'store')::text                     as store,
           (r->>'record_id')::text                 as record_id,
           coalesce(r->'data', '{}'::jsonb)        as data,
           (r->>'updated_at')::timestamptz         as updated_at,
           coalesce((r->>'deleted')::boolean, false) as deleted
      from jsonb_array_elements(records) as r
  ),
  -- un même (store, record_id) peut apparaître deux fois dans un lot : on ne garde
  -- que le plus récent, sinon Postgres refuse « ON CONFLICT ... affecte deux fois ».
  dedup as (
    select distinct on (store, record_id) *
      from entrant
     order by store, record_id, updated_at desc
  ),
  maj as (
    insert into public.medrevise_records as mr (store, record_id, data, updated_at, deleted)
    select store, record_id, data, updated_at, deleted from dedup
    on conflict (store, record_id) do update
      set data       = excluded.data,
          updated_at = excluded.updated_at,
          deleted    = excluded.deleted
      -- LE GARDE-FOU : on n'écrase que si l'entrant est STRICTEMENT plus récent.
      where excluded.updated_at > mr.updated_at
    returning 1
  )
  select count(*) into n from maj;
  return n;
end $$;

-- ---------------------------------------------------------------- CONTRÔLE APRÈS
select 'APRÈS' as moment,
       to_regclass('public.medrevise_records')                      as table_records,
       (select count(*) from pg_proc
         where proname = 'medrevise_push'
           and pronamespace = 'public'::regnamespace)               as fonction_push,
       (select count(*) from storage.buckets
         where id = 'medrevise-blobs')                              as bucket_blobs,
       (select count(*) from pg_policies
         where schemaname = 'public' and tablename = 'medrevise_records') as policies_records,
       (select count(*) from public.medrevise_records)              as lignes_existantes;

-- Attendu APRÈS, sur un projet neuf :
--   table_records = medrevise_records | fonction_push = 1
--   bucket_blobs  = 1                 | policies_records = 1
--   lignes_existantes = 0
--
-- ============================================================================
-- Répétition à blanc → laisser `rollback;`.
-- Application réelle  → remplacer par `commit;`.
-- ============================================================================
rollback;
