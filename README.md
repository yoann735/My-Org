# 🍲 MealWeek

Planificateur de repas **personnel**, sans backend et sans IA : toute la logique et
toutes les données sont **figées dans le code**. Vous arrivez, tout est déjà là — vous
consultez, vous cochez. Les recettes, le planning, la liste de courses Chronodrive et le
budget viennent d'un unique fichier de données (`src/data/mealweek_data.json`).

Construit avec **Vite + React + Tailwind CSS**. Persistance locale via **localStorage**.
Aucun appel réseau dynamique : tout est embarqué dans le build.

---

## ✨ Fonctionnalités

- **Dashboard / calendrier** — semaine en 7 jours × 2 créneaux (midi + soir), cartes
  colorées par protéine, KPI budget / calories / temps / four, pizzas badgées le week-end.
- **Vue recette (« mode cuisine »)** — sélecteur de portions 1-6 qui recalcule **en temps
  réel** les ingrédients *et* la nutrition ; ingrédients **livrés** vs **non inclus**
  (deux listes distinctes) ; étapes cochables ; valeurs nutritionnelles.
  Sur mobile : 3 onglets (Ingrédients / Étapes / Nutrition).
- **Liste de courses** — ingrédients frais agrégés par **catégorie Chronodrive**, prix,
  nom + lien Chronodrive (pas le nom HelloFresh brut), substituts, bouton « j'ai déjà »,
  section **courses perso** pré-remplie (skyr ×2 + bananes), total vs **budget 60 €**.
- **Planification** — calendrier de la semaine, **congélation datée** (jour de
  congélation / d'utilisation), statut **consommé / reste** par ingrédient.
- **Bibliothèque** — grille/liste filtrable des 40 recettes (protéine, temps, complexité,
  coût, four, pizza, recherche), favoris ★ et recettes bannies.
- **Réglages** — thème clair/sombre, couleur d'accent, budget, portions, magasin.

### Règles métier (figées, depuis `meta.regles`)

| Règle | Comportement |
|---|---|
| **Cuisson ×2** | Chaque dîner est cuisiné en double ; le reste devient le déjeuner du lendemain (affiché « Restes »). |
| **Sélecteur portions** | Quantités JSON = 1 portion ; le curseur 1-6 multiplie ingrédients **et** nutrition. |
| **Livrés vs non inclus** | Deux listes séparées dans la vue recette. |
| **Pizzas week-end** | R09 et R26 uniquement sur les créneaux Sam/Dim. |
| **Toggle week-end** | Masque Sam + Dim et recalcule liste de courses + budget (levier d'économie principal). |
| **Congélation datée** | Jours de congélation / utilisation affichés (`weeks[].congelation`). |
| **Consommé vs reste** | Badge selon `weeks[].ingredients_status`. |
| **Substituts** | Nom + lien Chronodrive affichés, pas le nom HelloFresh. |
| **Cycle 6 semaines** | Navigation S1 → S6 puis rotation sur S1. |

---

## 🗂️ Données

Source unique de vérité : **`src/data/mealweek_data.json`**. Pour modifier le contenu de
l'app, éditez ce fichier — aucun code à toucher.

- `meta` — règles, courses perso fixes, stock permanent, budget cible (60 €).
- `recipes` — 40 recettes (étapes, nutrition 1 portion, ingrédients livrés + non inclus,
  ustensiles, URL HelloFresh).
- `ingredients_ref` — 128 ingrédients (prix Chronodrive, DLC, format d'achat, lien, substituts).
- `weeks` — 6 semaines (planning, congélation datée, statut consommé/reste, budgets).
- `protein_strategy` — packs de protéines (format, portions, prix).

L'adaptation entre ce JSON et l'UI vit dans **`src/data/dataLayer.js`** (mapping des
protéines, parsing/scaling des quantités fractionnaires, agrégation de la liste de courses,
calcul du budget). Le code est commenté pour être facile à reprendre.

> **Note sur le budget.** La liste de courses agrège les ingrédients frais des dîners de la
> semaine (un format d'achat par ingrédient unique), valorisés via `ingredients_ref`. Le
> total est **calculé en direct** pour que le levier « masquer le week-end » le fasse
> bouger. Les estimations par semaine présentes dans les données (`budget_*_estime`) et les
> verdicts `ingredients_status` (Consommé / Reste) sont affichés à titre indicatif.

---

## 🚀 Lancer en local

Prérequis : **Node.js ≥ 18**.

```bash
npm install      # installe les dépendances
npm run dev      # serveur de dev (http://localhost:5173)
npm run build    # build de production -> dossier dist/
npm run preview  # prévisualise le build de production
```

---

## ☁️ Déploiement Vercel (zéro-config)

Le projet est prêt pour Vercel sans configuration : Vercel détecte Vite, lance
`vite build` et sert le dossier `dist/`.

### Via GitHub (recommandé)

1. Créez un dépôt et poussez le code :
   ```bash
   git init
   git add .
   git commit -m "MealWeek"
   git branch -M main
   git remote add origin https://github.com/<vous>/mealweek.git
   git push -u origin main
   ```
2. Sur [vercel.com](https://vercel.com) → **Add New… → Project** → importez le dépôt.
3. Laissez les réglages par défaut détectés :
   - **Framework Preset** : Vite
   - **Build Command** : `vite build` (ou `npm run build`)
   - **Output Directory** : `dist`
   - **Install Command** : `npm install`
4. **Deploy**. Chaque `git push` sur `main` redéploie automatiquement.

### Via la CLI (sans GitHub)

```bash
npm i -g vercel
vercel          # déploiement de prévisualisation
vercel --prod   # déploiement en production
```

> L'app n'a aucun routage côté client (navigation par état, une seule page), donc aucune
> règle de réécriture n'est nécessaire. Aucune variable d'environnement requise.

---

## 🧱 Structure

```
src/
├── main.jsx                # point d'entrée
├── App.jsx                 # shell : router par état + thème + état persistant (ctx)
├── index.css               # couches Tailwind (utilitaires responsive)
├── styles/design.css       # design system porté + couche mobile responsive
├── lib/constants.js        # constantes UI (accents)
├── hooks/
│   ├── usePersistentState.js   # état <-> localStorage
│   └── useMediaQuery.js        # détection mobile
├── data/
│   ├── mealweek_data.json      # SOURCE UNIQUE DE VÉRITÉ
│   └── dataLayer.js            # adaptateur + helpers (scaling, budget, plan…)
├── components/
│   ├── Icon.jsx, primitives.jsx, Navigation.jsx
│   ├── WeekCalendar.jsx        # calendrier (grille desktop / pile mobile)
│   └── RecipeDetail.jsx        # overlay « mode cuisine » (3 onglets sur mobile)
└── screens/
    ├── Dashboard.jsx, Planning.jsx, Shopping.jsx, Library.jsx, Settings.jsx
    └── _shared.jsx
```

## 🎨 Design

Double thème **clair / sombre** (variables CSS), titres en **serif** (DM Serif Display) +
corps en **sans-serif** (Inter), accents **violet** et **ambre**. Le design system desktop
issu du handoff est repris fidèlement ; une couche **mobile-first** est construite par-dessus :
la sidebar gauche devient une **bottom navigation** sous 760 px, le calendrier 7 colonnes
devient une **pile verticale par jour**, et la vue recette passe en **onglets**.

## 🔒 Vie privée

100 % local. Aucune donnée ne quitte l'appareil ; coches, favoris et réglages sont stockés
dans le `localStorage` du navigateur. Bouton de réinitialisation dans **Réglages**.
