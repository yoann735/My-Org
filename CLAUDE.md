# CLAUDE.md — MyOrg

Univers perso : un **hub** (sélecteur d'apps) qui héberge **deux applications
indépendantes** derrière un même thème partagé :
- **MealWeek** — planificateur de repas (données figées + sync Supabase optionnelle).
- **MedRevise** — révision médicale (QCM / flashcards / Feynman générés par IA).

SPA Vite + React 18 + Tailwind, déployée sur **Vercel** (auto-deploy au push sur `main`).

## Stack & commandes
- Build : `npm run build` · Dev : `npm run dev` · Preview : `npm run preview`.
- **Pas de test ni de lint configurés** (aucun script `test`/`lint`, pas d'ESLint).
  → La vérification se fait par `npm run build` **+ preview manuel dans le navigateur**
  (viser 0 erreur console avant de dire « fini »).
- **Windows / PATH** : si `npm`/`node` ne sont pas dans le PATH du shell, rafraîchir en
  PowerShell : `$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine")+";"+[Environment]::GetEnvironmentVariable("Path","User")`,
  ou appeler node en direct : `& "C:\Program Files\nodejs\node.exe" "node_modules/vite/bin/vite.js" build`.

## Architecture (ce qui ne se lit pas d'un coup d'œil)
- `src/App.jsx` = routeur : l'app active est stockée dans `localStorage` sous la clé
  **`app.current`** (`"hub" | "mealweek" | "medrevise"`, valeur **JSON-encodée**).
- `src/Selecteur.jsx` = le hub. `src/shared/` = Icon, hooks, constantes, **thème partagé
  univers** (`useSharedTheme`) — commun aux deux apps, donc **hors** de l'état propre à
  chaque app (ne pas le synchroniser dans un state d'app).
- `api/generate.js` = fonction serverless Vercel qui proxifie l'API Claude (la clé n'atteint
  jamais le navigateur). `vercel.json` fixe `maxDuration: 60` (limite plan Hobby → source de
  timeouts 504 sur les grosses générations ; MedRevise découpe le cours pour rester sous 60 s).

## Persistance
- **MealWeek** : `localStorage` centralisé dans un `userState` unique
  (`src/mealweek/data/useUserState.js`, clé `mw.state.v1`) + **sync Supabase optionnelle**
  (table `mealweek_state`, last-write-wins, debounce 800 ms). Voir `MEALWEEK_SUPABASE_SYNC.md`.
- **MedRevise** : **IndexedDB** (idb-keyval), pas localStorage (blobs images/PDF trop gros).

## Variables d'environnement
- `ANTHROPIC_API_KEY` — **Vercel uniquement** (jamais en dur, jamais dans le repo). Requise
  pour la génération réelle MedRevise ; en local sans elle → fallback mock.
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — optionnelles (sync MealWeek). Absentes →
  app 100 % locale. Fichier `.env` local (gitignored), `.env.example` fourni.

## Conventions (importantes)
- **UI et réponses en français.**
- **Ne modifier QUE l'app nommée** par la demande — ne jamais toucher l'autre app ni le
  design system partagé sans raison explicite.
- **Ne jamais commit/push automatiquement** — toujours demander avant.
- Ne jamais exposer/committer la clé API. Garder le design system intact.
- Données MealWeek : autorité = le JSON fourni par l'utilisateur (`mealweek_data.json`),
  il écrase toute valeur antérieure ; le remplacer tel quel, ne rien recopier à la main.

## Déploiement
GitHub `yoann735/My-Org` (branche `main`) → Vercel auto-deploy (projet `my-org`).
Après modif des variables d'env sur Vercel : **Redeploy** nécessaire.

## Continuité de contexte entre machines
Ce projet se travaille sur plusieurs machines. Workflow :
- **En fin de session** (avant de changer de machine) : lancer **`/handoff`** → génère
  `HANDOFF.md`, puis **commit + push** `HANDOFF.md`.
- **En début de session** (sur l'autre machine) : `git pull`, puis lancer **`/pickup`** →
  lit `HANDOFF.md` + ce fichier et reprend le travail là où il s'était arrêté.
