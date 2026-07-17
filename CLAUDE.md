# CLAUDE.md — MyOrg

Univers perso : un **hub** (sélecteur d'apps) qui héberge **deux applications
indépendantes** derrière un même thème partagé :
- **MealWeek** — planificateur de repas (données figées + sync Supabase optionnelle).
- **MedRevise** — révision médicale (QCM / flashcards / Feynman). Import 100 % local :
  aucun appel IA dans l'app, tout passe par du JSON v1.0 collé (généré ailleurs, ex. un
  chat Claude externe), comme pour Rattrapage.

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

## Persistance
- **MealWeek** : `localStorage` centralisé dans un `userState` unique
  (`src/mealweek/data/useUserState.js`, clé `mw.state.v1`) + **sync Supabase optionnelle**
  (table `mealweek_state`, last-write-wins, debounce 800 ms). Voir `MEALWEEK_SUPABASE_SYNC.md`.
- **MedRevise** : **IndexedDB** (idb-keyval), pas localStorage (blobs images/PDF trop gros)
  + **sync Supabase optionnelle** (table `medrevise_records` — un enregistrement par
  store/id, LWW par `updated_at` — + bucket Storage `medrevise-blobs` pour les images/PDF ;
  espace séparé de `mealweek_state` mais **même projet Supabase**, mêmes variables d'env,
  pas de compte séparé). Voir `MEDREVISE_SUPABASE_SYNC.md`. Client dédié
  `src/medrevise/data/supabaseClient.js` (ne touche pas au client MealWeek). Écritures/
  suppressions instrumentées dans `src/medrevise/lib/storage.js` (`put`/`putMany`/`remove`
  + les setters spécifiques stats/exos/docs) ; réconciliation (`reconcileAll`) au démarrage,
  à la reconnexion réseau et quand l'onglet redevient visible (`MedReviseApp.jsx`).

## Variables d'environnement
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — optionnelles (sync MealWeek **et**
  MedRevise, même projet). Absentes →
  app 100 % locale. Fichier `.env` local (gitignored), `.env.example` fourni.

## Conventions (importantes)
- **UI et réponses en français.**
- **Ne modifier QUE l'app nommée** par la demande — ne jamais toucher l'autre app ni le
  design system partagé sans raison explicite.
- **Commit/push autonome autorisé** sur ce projet — voir la section « ## Git » ci-dessous.
- Ne jamais exposer/committer de clé (Supabase incluse). Garder le design system intact.
- Données MealWeek : autorité = le JSON fourni par l'utilisateur (`mealweek_data.json`),
  il écrase toute valeur antérieure ; le remplacer tel quel, ne rien recopier à la main.

## Déploiement
GitHub `yoann735/My-Org` (branche `main`) → Vercel auto-deploy (projet `my-org`).
Après modif des variables d'env sur Vercel : **Redeploy** nécessaire.

## Git
- Après **chaque unité de travail cohérente** (une fonctionnalité, un fix, une étape
  terminée), faire `git add`, `git commit` avec un message clair, et `git push`
  **automatiquement, sans demander confirmation**.
- Messages de commit **conventionnels** : `feat:`, `fix:`, `refactor:`, `docs:`,
  `chore:`, `style:`, `test:`, etc.
- **Ne jamais** push en force (`--force`) sans demande explicite de l'utilisateur.

> Remplace la règle générale « ne jamais commit/push automatiquement » : sur CE projet,
> le commit + push autonome est explicitement autorisé (voir `.claude/settings.json`).

## Continuité de contexte entre machines
Ce projet se travaille sur plusieurs machines. Workflow :
- **En fin de session** (avant de changer de machine) : lancer **`/handoff`** → génère
  `HANDOFF.md`, puis **commit + push** `HANDOFF.md`.
- **En début de session** (sur l'autre machine) : `git pull`, puis lancer **`/pickup`** →
  lit `HANDOFF.md` + ce fichier et reprend le travail là où il s'était arrêté.
