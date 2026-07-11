# MealWeek — Synchronisation multi-appareils (Supabase)

MealWeek fonctionne **100 % en local par défaut** (localStorage). La synchronisation
cloud entre appareils (ordi ↔ téléphone) est **optionnelle** : elle s'active
automatiquement dès que les 2 variables d'environnement ci-dessous sont présentes.
Sans elles, l'app marche exactement comme avant, sans jamais planter.

Tout l'état modifiable (coches « déjà en stock » / « ajouté au panier », courses
cochées, repas désactivés du planning, slider Portions, mode éco, semaine courante,
favoris, etc.) est stocké dans **une seule ligne** de la table `mealweek_state`
(app mono-utilisateur), en *last-write-wins* avec un debounce de ~800 ms.

---

## Étape (a) — Créer un projet Supabase gratuit

1. Va sur <https://supabase.com> → **New project** (plan gratuit).
2. Choisis un nom + un mot de passe de base (peu importe), puis attends la création.
3. Dans **Project Settings → API**, note :
   - **Project URL** (ex. `https://abcdefgh.supabase.co`)
   - **anon public** key (une longue chaîne `eyJhbGci...`)

## Étape (b) — Créer la table + la policy (SQL Editor → New query → Run)

```sql
-- Table unique (une seule ligne, id = 'default')
create table if not exists public.mealweek_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- RLS activé + policy permissive (app perso mono-utilisateur, clé anon)
alter table public.mealweek_state enable row level security;

create policy "mealweek_state_anon_all"
  on public.mealweek_state
  for all
  to anon
  using (true)
  with check (true);
```

> Alternative plus simple si tu préfères : `alter table public.mealweek_state disable row level security;`
> (moins « propre » mais suffisant pour une app perso). La policy permissive ci-dessus
> est recommandée : elle laisse la clé anon lire/écrire uniquement cette table.

## Étape (c) — Ajouter les 2 variables d'environnement

Les mêmes 2 variables, **en local** et **sur Vercel** :

| Variable                  | Valeur                          |
| ------------------------- | ------------------------------- |
| `VITE_SUPABASE_URL`       | l'URL du projet (étape a)       |
| `VITE_SUPABASE_ANON_KEY`  | la clé **anon public** (étape a)|

**En local** — crée un fichier `.env` à la racine du projet (voir `.env.example`) :

```
VITE_SUPABASE_URL=https://abcdefgh.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

Puis relance `vite` (les variables Vite sont lues au démarrage).

**Sur Vercel** — Project → **Settings → Environment Variables** → ajoute les 2
variables (Production + Preview), puis **Redeploy**.

---

### Notes
- La clé **anon** est publique par nature (elle transite dans le navigateur) : ne mets
  **jamais** la clé `service_role` ici.
- Hors-ligne : les écritures cloud échouent silencieusement, tout reste dans
  localStorage et se resynchronise au prochain accès réseau.
- Le thème/couleur d'accent sont gérés au niveau « univers » (partagés avec l'autre
  app), donc hors de ce périmètre MealWeek — non synchronisés par cette table.
