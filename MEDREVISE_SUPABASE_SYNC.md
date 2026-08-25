# MedRevise — Synchronisation multi-appareils (Supabase)

MedRevise fonctionne **100 % en local par défaut** (IndexedDB). La synchro cloud entre
appareils (ordi ↔ téléphone) est **optionnelle** et réutilise **le même projet Supabase
que MealWeek** (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — si tu as déjà configuré
la synchro MealWeek, **aucune nouvelle variable d'environnement n'est nécessaire**, il
suffit d'exécuter le script SQL ci-dessous une fois dans le même projet).

Sans ces variables, l'app marche exactement comme avant, sans jamais planter.

Pas de compte utilisateur : comme MealWeek, c'est une app mono-utilisateur — la clé
**anon** fait office d'identité. Cours, matières, fiches, questions (QCM/flashcards/
Feynman/exercices), schémas d'anatomie (coches, zones, images), état SM-2/méthode des J,
streak, corbeille et préférences sont synchronisés **par enregistrement** (dernière
écriture gagne, horodatage `updated_at`), pas en un seul bloc — IndexedDB reste le cache
local et la source de vérité hors-ligne.

---

## Étape (a) — Si MealWeek n'est pas encore configuré

Suis d'abord `MEALWEEK_SUPABASE_SYNC.md` (créer le projet Supabase, récupérer l'URL +
la clé anon, les ajouter en local et sur Vercel). Si c'est déjà fait, passe à l'étape (b).

## Étape (b) — Créer la table + le bucket + les policies (SQL Editor → New query → Run)

```sql
-- Table générique : un enregistrement par (store, id), tous les stores MedRevise
-- confondus (sources, matieres, fiches, questions, structures, highlights,
-- annotations, stats, exos, docs, anatstruct). Séparée de `mealweek_state`.
create table if not exists public.medrevise_records (
  store text not null,
  record_id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  primary key (store, record_id)
);

alter table public.medrevise_records enable row level security;

create policy "medrevise_records_anon_all"
  on public.medrevise_records
  for all
  to anon
  using (true)
  with check (true);

-- Bucket Storage pour les images/PDF (blobs) — trop gros pour du JSONB.
insert into storage.buckets (id, name, public)
values ('medrevise-blobs', 'medrevise-blobs', false)
on conflict (id) do nothing;

create policy "medrevise_blobs_anon_all"
  on storage.objects
  for all
  to anon
  using (bucket_id = 'medrevise-blobs')
  with check (bucket_id = 'medrevise-blobs');
```

## Étape (b bis) — OBLIGATOIRE : l'écriture conditionnelle

> Ajoutée après l'audit du 25/08/2026 (`docs/audit-sync-J-2026.md`). **Sans ce script, la
> synchro tourne en mode DÉGRADÉ** : l'app le dit explicitement dans Réglages →
> Synchronisation, et une écriture périmée peut encore écraser une version plus récente
> au cloud (défaut « C1 » de l'audit — c'était LA cause des divergences entre appareils).

Un `upsert` PostgREST ne sait pas exprimer de condition : il écrase la ligne quoi qu'elle
contienne, `updated_at` compris — qu'il fait donc *reculer*. Le garde-fou doit vivre dans
la base.

**Le script est dans le dépôt : [`supabase/medrevise_push.sql`](supabase/medrevise_push.sql)**
— ouvre-le, copie tout, colle dans SQL Editor → New query → Run. Il est reproduit ci-dessous
pour référence :

```sql
create or replace function public.medrevise_push(records jsonb)
returns integer
language plpgsql
security invoker
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
  -- un même (store, record_id) peut apparaître deux fois dans le lot : Postgres
  -- refuse alors « ON CONFLICT DO UPDATE command cannot affect row a second time ».
  -- On ne garde que la version la plus récente de chaque enregistrement.
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
      where excluded.updated_at > mr.updated_at   -- ← LE garde-fou
    returning 1
  )
  select count(*) into n from ins;
  return n;
end;
$$;

grant execute on function public.medrevise_push(jsonb) to anon;

-- PostgREST met sa vue du schéma en cache : on la rafraîchit pour que la fonction
-- soit visible immédiatement plutôt qu'au bout de quelques minutes.
notify pgrst, 'reload schema';
```

`security invoker` : la fonction s'exécute avec les droits de l'appelant (`anon`), donc la
RLS de `medrevise_records` continue de s'appliquer normalement — aucun privilège élevé.

**Vérification** (doit renvoyer `1` puis `0`) :

```sql
select public.medrevise_push('[{"store":"_test","record_id":"t1","data":{"v":1},
  "updated_at":"2030-01-01T00:00:00Z","deleted":false}]'::jsonb);   -- → 1 (écrit)

select public.medrevise_push('[{"store":"_test","record_id":"t1","data":{"v":0},
  "updated_at":"2020-01-01T00:00:00Z","deleted":false}]'::jsonb);   -- → 0 (REFUSÉ : périmé)

select data->>'v' from public.medrevise_records
 where store = '_test' and record_id = 't1';                        -- → 1, pas 0

delete from public.medrevise_records where store = '_test';         -- nettoyage
```

Si la deuxième requête renvoie `0` et que la valeur est restée à `1`, le garde-fou est
actif. Côté app : Réglages → Synchronisation → « Forcer la synchro » ne doit plus
mentionner le mode dégradé.

## Étape (c) — Vérifier les variables d'environnement

Mêmes variables que MealWeek, **déjà suffisantes** (aucune nouvelle à ajouter) :

| Variable                  | Où                                    |
| ------------------------- | -------------------------------------- |
| `VITE_SUPABASE_URL`       | `.env` local + Vercel (Production+Preview) |
| `VITE_SUPABASE_ANON_KEY`  | `.env` local + Vercel (Production+Preview) |

Si tu viens de les ajouter pour la première fois : redémarre `vite` en local, et
**Redeploy** sur Vercel.

---

### Notes

- **Migration non destructive** : au premier lancement avec la synchro active, la table
  cloud est vide → la réconciliation pousse automatiquement TOUT ce qui existe déjà en
  local sur cet appareil, sans rien écraser (le plus récent gagne toujours par
  enregistrement, et un appareil vierge face à un cloud vide n'a jamais l'avantage).
- **Blobs (images/PDF)** : uploadés en tâche de fond à la création, **téléchargés
  paresseusement** (seulement quand un enregistrement pullé référence un blob absent
  localement) — évite de retélécharger toutes les images à chaque synchro.
- **Suppressions** : propagées en tombstones (`deleted = true`) pour qu'un enregistrement
  supprimé sur un appareil ne « ressuscite » pas via un autre appareil resté en cache.
- Hors-ligne : les écritures cloud échouent silencieusement, tout reste en IndexedDB et
  se resynchronise à la reconnexion (au retour réseau, ou quand l'onglet redevient actif).
- Le thème/couleur d'accent restent gérés au niveau « univers » (partagés avec l'autre
  app), hors de ce périmètre MedRevise.
