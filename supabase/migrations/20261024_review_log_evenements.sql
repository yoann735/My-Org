-- ============================================================
-- MedRevise — JOURNAL DES RÉVISIONS : ÉVÉNEMENTS SANS NOTE (24/10/2026,
-- docs/compte-rendu-seance-categories.md § 5).
-- À APPLIQUER PAR YOANN (Supabase → SQL Editor → coller → Run). NON appliqué par Claude.
-- AJOUT SEUL : aucune ligne n'est modifiée ni supprimée. Rejouable sans effet.
--
-- « Passer en révision » (carte Nouvelle → cycle des J) est journalisé comme un ÉVÉNEMENT :
-- rating = null et details.evenement = 'passage_revision'. La contrainte actuelle
-- (rating not null, entre 1 et 4) le refuse : tant que ce SQL n'est pas appliqué, l'app garde ces
-- événements dans sa file locale (journal/synchro.js) et continue d'envoyer les notes normalement.
-- ============================================================
alter table public.medrevise_review_log alter column rating drop not null;

do $$
declare c text;
begin
  -- l'ancienne contrainte « rating between 1 and 4 » (nom généré par Postgres)
  for c in select conname from pg_constraint
    where conrelid = 'public.medrevise_review_log'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%rating%' and conname <> 'medrevise_review_log_rating_ou_evenement'
  loop
    execute format('alter table public.medrevise_review_log drop constraint %I', c);
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'medrevise_review_log_rating_ou_evenement') then
    alter table public.medrevise_review_log add constraint medrevise_review_log_rating_ou_evenement
      check ((rating between 1 and 4) or (rating is null and details ? 'evenement'));
  end if;
end $$;

-- Contrôle (lecture seule) après application :
--   select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.medrevise_review_log'::regclass and contype = 'c';
--   select count(*) from public.medrevise_review_log where rating is null;
