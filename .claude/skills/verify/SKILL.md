---
name: verify
description: Vérifier un changement de bout en bout dans le navigateur (build + preview + Playwright sur le Chrome local).
---

# Vérification end-to-end (My-Org)

Pas de tests ni lint dans ce repo : la vérification = build + pilotage réel du navigateur.

## Recette qui marche (Windows, sans installer de navigateur)

1. `npm run build` puis `npm run preview` en arrière-plan → sert `dist/` sur `http://localhost:4173`.
2. Dans un dossier temporaire : `npm i playwright-core` (léger, pas de téléchargement de navigateur),
   puis piloter le Chrome local :
   ```js
   import { chromium } from 'playwright-core';
   const browser = await chromium.launch({
     executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
     headless: true,
   });
   ```
3. Capturer `page.on('console')` (erreurs), `page.on('pageerror')` et les requêtes réseau
   (seules les Google Fonts de `index.html` sont attendues en externe).

## Gotchas

- L'app active est dans `localStorage` clé `app.current`, **valeur JSON-encodée** :
  `localStorage.setItem('app.current', JSON.stringify('myorg'))` puis `reload()` pour
  atterrir directement dans une app (`hub` | `mealweek` | `medrevise` | `myorg`).
- La sidebar est repliée par défaut : `.sb-label` / `.sb-brand-name` existent mais sont
  masqués → `waitForSelector(..., { state: 'attached' })`, et cliquer via `.sb-item[title="…"]`.
- Chaque session Playwright = profil vierge → IndexedDB vide (les seeds MedRevise se recréent).
- Mobile : `setViewportSize({ width: 390, height: 800 })` → `.bottom-nav` remplace la sidebar (< 760 px).
- Classe globale `.soon` (etudes.css) = écran de chargement plein viewport (`min-height: 100vh`) —
  ne jamais la réutiliser comme modificateur sur une card.

## Flows utiles à piloter

- Hub → cards (`.hub-card:has(.hc-title:text("…"))`) → ouvrir chaque app.
- My Org : To-do (création `.mo-form`, filtres `.seg-btn`, suppression → popover `.day-pop`),
  Objectifs (groupes par année), Dashboard (KPIs `.mo-stat`), persistance après `reload()`
  (bases IndexedDB `myorg_*`).
