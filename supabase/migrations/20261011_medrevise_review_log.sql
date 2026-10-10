-- ============================================================
-- MedRevise — JOURNAL DES RÉVISIONS (étape 2 FSRS, docs/fsrs-etape2-compte-rendu.md)
-- À APPLIQUER PAR YOANN (Supabase → SQL Editor → coller → Run). NON appliqué par Claude.
-- AJOUT SEUL : crée une table NEUVE ; aucune table, ligne, fonction ou policy existante n'est
-- modifiée. Rejouable sans effet (if not exists / do-block).
--
-- Une ligne = une réponse à une flashcard, IMMUABLE. L'id (UUID) est généré sur l'appareil :
-- l'app envoie par « insert … on conflict (id) do nothing » (upsert ignoreDuplicates) → renvoyer
-- la même ligne deux fois n'a aucun effet. `inserted_at` (heure du serveur) sert de curseur de
-- réception incrémentale.
-- ============================================================
create table if not exists public.medrevise_review_log (
  id                uuid primary key,
  card_id           text        not null,
  rating            smallint    not null check (rating between 1 and 4),
  reviewed_at       timestamptz not null,
  device            text,
  scheduler_version text,
  state_before      jsonb,
  state_after       jsonb,
  details           jsonb,
  inserted_at       timestamptz not null default now()
);

create index if not exists medrevise_review_log_card_reviewed on public.medrevise_review_log (card_id, reviewed_at);
create index if not exists medrevise_review_log_inserted on public.medrevise_review_log (inserted_at, id);

-- même modèle d'accès que medrevise_records (clé anon de l'app), mais SANS update ni delete :
-- la table est en ajout seul pour l'app.
alter table public.medrevise_review_log enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'medrevise_review_log' and policyname = 'medrevise_review_log_select') then
    create policy medrevise_review_log_select on public.medrevise_review_log for select to anon using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'medrevise_review_log' and policyname = 'medrevise_review_log_insert') then
    create policy medrevise_review_log_insert on public.medrevise_review_log for insert to anon with check (true);
  end if;
end $$;

-- Contrôle (lecture seule) après application :
--   select count(*) from public.medrevise_review_log;
--   select policyname, cmd from pg_policies where tablename = 'medrevise_review_log';
