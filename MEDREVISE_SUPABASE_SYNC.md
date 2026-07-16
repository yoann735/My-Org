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
