-- ============================================================================
-- MedRevise — écriture cloud CONDITIONNELLE
--
-- À exécuter UNE FOIS dans : Supabase → ton projet → SQL Editor → New query
--                            → coller ce fichier entier → Run
--
-- Prérequis : la table `public.medrevise_records` existe déjà
--             (voir MEDREVISE_SUPABASE_SYNC.md, étape (b)).
--
-- Pourquoi : un `upsert` PostgREST écrase la ligne cloud quoi qu'elle contienne,
-- `updated_at` COMPRIS — qu'il fait donc RECULER. Une entrée d'outbox rejouée
-- des heures plus tard détruisait ainsi les révisions faites entre-temps sur un
-- autre appareil. Le last-write-wins n'existait qu'à la LECTURE (storage.js
-- reconcileAll), jamais à l'écriture, et aucun garde-fou ne vivait côté serveur.
-- C'est le défaut « C1 » de docs/audit-sync-J-2026.md, cause principale des
-- divergences entre appareils (7 / 11 / 4 J le même jour).
--
-- Ce script pose le garde-fou DANS LA BASE : une écriture périmée est refusée
-- par Postgres, pas arbitrée par le client.
--
-- Idempotent : `create or replace`, réexécutable sans risque.
-- Ce script ne lit, ne modifie et ne supprime AUCUNE donnée existante.
-- ============================================================================

create or replace function public.medrevise_push(records jsonb)
returns integer
language plpgsql
security invoker   -- droits de l'appelant (anon) : la RLS de medrevise_records
                   -- continue de s'appliquer, aucun privilège élevé.
as $$
declare n integer;
begin
  with entrant as (
    select
      (r->>'store')::text                       as store,
      (r->>'record_id')::text                   as record_id,
      coalesce(r->'data', '{}'::jsonb)          as data,
      (r->>'updated_at')::timestamptz           as updated_at,
      coalesce((r->>'deleted')::boolean, false) as deleted
    from jsonb_array_elements(records) as r
  ),
  -- Un même (store, record_id) peut apparaître deux fois dans un lot ; Postgres
  -- refuserait alors tout le lot avec « ON CONFLICT DO UPDATE command cannot
  -- affect row a second time ». On ne garde que la version la plus récente.
  dedup as (
    select distinct on (store, record_id) *
    from entrant
    order by store, record_id, updated_at desc
  ),
  ins as (
    insert into public.medrevise_records as mr (store, record_id, data, updated_at, deleted)
    select store, record_id, data, updated_at, deleted from dedup
    on conflict (store, record_id) do update
      set data       = excluded.data,
          updated_at = excluded.updated_at,
          deleted    = excluded.deleted
      where excluded.updated_at > mr.updated_at   -- ←←← LE GARDE-FOU
    returning 1
  )
  select count(*) into n from ins;
  return n;   -- nombre de lignes réellement écrites (les périmées ne comptent pas)
end;
$$;

grant execute on function public.medrevise_push(jsonb) to anon;

-- PostgREST met sa vue du schéma en cache : on la rafraîchit pour que la
-- fonction soit visible tout de suite plutôt qu'au bout de quelques minutes.
notify pgrst, 'reload schema';


-- ============================================================================
-- VÉRIFICATION — à exécuter séparément (sélectionner ce bloc, puis Run).
-- Volontairement laissé en commentaire pour que « tout exécuter » ci-dessus
-- n'écrive rien dans la table.
--
-- Attendu : la 1re renvoie 1, la 2e renvoie 0, la 3e renvoie « 1 » (pas « 0 »).
-- Si c'est le cas, le garde-fou est actif : une écriture plus ancienne que la
-- ligne existante est refusée. C'est exactement le scénario qui détruisait les
-- révisions faites sur un autre appareil.
-- ============================================================================
--
-- select public.medrevise_push('[{"store":"_test","record_id":"t1","data":{"v":1},
--   "updated_at":"2030-01-01T00:00:00Z","deleted":false}]'::jsonb);   -- → 1 (écrit)
--
-- select public.medrevise_push('[{"store":"_test","record_id":"t1","data":{"v":0},
--   "updated_at":"2020-01-01T00:00:00Z","deleted":false}]'::jsonb);   -- → 0 (REFUSÉ)
--
-- select data->>'v' from public.medrevise_records
--  where store = '_test' and record_id = 't1';                        -- → 1
--
-- delete from public.medrevise_records where store = '_test';         -- nettoyage


-- ============================================================================
-- APRÈS L'EXÉCUTION
--   1. Aucun Redeploy Vercel n'est nécessaire : ce script est côté serveur et ne
--      touche à aucune variable d'environnement. (Le code client, lui, se
--      déploie tout seul au push sur `main`.)
--   2. Dans l'app : Réglages → Synchronisation → « Forcer la synchro ».
--      • « Synchronisé à HH:MM. »                      → garde-fou actif ✅
--      • « …mais en mode DÉGRADÉ : la fonction         → script non passé, ou
--        medrevise_push est absente de Supabase »        cache PostgREST pas
--                                                        encore rafraîchi.
--        Reclique après quelques secondes : l'app réessaie le mode conditionnel
--        à chaque synchro forcée, sans rechargement.
-- ============================================================================
