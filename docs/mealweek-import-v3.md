# MealWeek V3 — import du classeur « 9 semaines · 24 recettes » (12/10/2026)

Fichier de suivi : décisions, contrôles, doutes.

## Résultat

| Élément | État |
|---|---|
| 24 recettes (R01…R24) — nom, n°, source + URL, temps, ustensiles, substitutions, ingrédients (qté, unité, équivalent, produit Chronodrive, origine), étapes numérotées, nutrition / portion | ✅ |
| 9 semaines (S1…S9) — planning 8 lignes (dimanche de retrait → dimanche midi), plat week-end, pizza, coûts (courses recettes, placard, week-end, total, marge vs 55 €, gâchis, stock), moyennes nutritionnelles, liste de courses Chronodrive + placard + week-end | ✅ |
| Catalogue « Options week-end » (27 produits : 14 plats, 13 pizzas) | ✅ |
| Texte « Méthode » | ✅ (écran **Méthode**) |
| Build | ✅ `npm run build` |
| Tests | ✅ `npm test` — 59/59, dont `tests/mealweek/import-v3.test.js` (11 tests) |
| Lint | ⚠️ aucun linter configuré dans le dépôt (voir CLAUDE.md) — rien à lancer |
| Rendu vérifié | ✅ build de prod sans Supabase + Chrome headless : Accueil S3, détail recette 24, Méthode, Courses S2, mobile 390 px — 0 erreur console |

## Où le voir dans l'app
- **Accueil** : la semaine (« Semaine N sur 9 »), le planning, et dans « Budget de la semaine » le
  détail prévu par le classeur (courses / placard / week-end / total / marge / gâchis / stock).
- **Recettes** : les 24 recettes, numérotées ; recherche aussi par numéro (« 24 »).
- **Méthode** (nouvel onglet, icône ⓘ) : modèle, tableau des 9 semaines, règles de génération,
  catalogue week-end avec les semaines qui utilisent chaque produit.
- **Courses** : liste Chronodrive de la semaine retenue.

## Ré-importer (idempotent)
```
pip install openpyxl
python3 scripts/mealweek-import/importer_classeur.py            # classeur à la racine du dépôt
python3 scripts/mealweek-import/importer_classeur.py autre.xlsx # ou un autre chemin
```
Le script régénère `src/mealweek/data/mealweek_data.json` en entier, dans un ordre déterministe.
Relancé sur le même classeur : « Aucun changement » (fichier identique octet pour octet — vérifié
par SHA-256). Classeur modifié : tout est resynchronisé, sans doublon (clés R01…, S1…, OW01…).
Il imprime les contrôles de cohérence qui échouent (aucun sur ce classeur).

## Décisions
1. **Magasin de données** : celui qui existe — le JSON statique `mealweek_data.json` lu par
   `dataLayer.js` (l'état utilisateur `mw.state.v1` ne contient que les choix : semaine retenue,
   favoris, coches…). Même schéma qu'en V2, **étendu** : `recipes.*.{source_url,
   notes_substitution_v3, etapes_portions}`, `weeks.*.{couts, nutrition_moyenne, plat_weekend,
   pizza}`, `courses[].{recettes, gachis_eur, stock_eur}`, `placard[].{reste, valeur_reste,
   recettes}`, `weekend[].{option_id, categorie}`, `options_weekend`, `meta.methode`.
2. **Ingrédients** : onglet « Recettes v3 (1 pers) » (base 1 portion). L'affichage ×2 existait
   déjà : sélecteur « Portions » (2 par défaut) qui met les quantités à l'échelle. Les étapes,
   rédigées pour 2 portions, gardent leur texte ; un bandeau le signale si on choisit ≠ 2 pers.
3. **Méta + étapes** : onglet « Étapes (2 portions) ». Contrôle : chaque quantité Étapes = 2 × v3
   (OK pour les 24 recettes).
4. **Nutrition** : recalculée (Qté × valeur/100 g ÷ 100, somme par recette), jamais lue en cache.
   Contrôle : égale aux valeurs en cache du classeur (24/24) ; moyennes de semaine égales au
   Sommaire (9/9, calculées sur les valeurs non arrondies comme dans le classeur).
5. **Coûts** : totaux recalculés (Qté × prix) ; égaux au Sommaire à 1 centime près pour courses,
   placard, week-end, total, gâchis et stock (9/9). Marge = 55 € − total.
6. **Liens** : semaines → recettes par le numéro en préfixe (« 10. … » → R10) ; lignes de
   courses → recettes par la colonne « Sert aux recettes » (lien explicite, prioritaire sur
   l'ancienne déduction par les mots) ; plat week-end et pizza → catalogue par nom exact
   (9/9 et 9/9 trouvés).
7. **Ids conservés** : R01…R22 désignent les mêmes recettes qu'en V2, donc **pas de purge** de
   l'état utilisateur (`CONTENT_RESET` inchangé) : favoris, bannies et étapes cochées restent.
   Seuls les « retraits » qui visent une recette absente de sa semaine (S2-S8 ont changé) sont
   oubliés au chargement (`retraitsValides`, `useUserState.js`).
8. Le bloc « ÉTAPES DES 5 RECETTES » des feuilles S1…S9 n'est **pas** importé : c'est une copie
   des recettes ; les semaines y réfèrent par id.
9. Le classeur source est copié à la racine du dépôt (nom sans espaces) pour que l'import soit
   rejouable ; l'original reste dans ~/Downloads.

## Doutes / à vérifier
- **Lint** : la condition de fin demande « build + lint » ; le dépôt n'a pas de linter (choix
  documenté dans CLAUDE.md). Je n'en ai pas ajouté.
- **Rotation automatique** : passer de 8 à 9 semaines change le modulo ; si la rotation auto est
  active, la semaine affichée peut décaler d'un cran par rapport à avant. À réancrer si besoin
  (Réglages → couper/rallumer la rotation sur la bonne semaine).
- **Cases « J'ai déjà » / « panier »** de l'écran Courses : clés `Sx::produit`. Si un même produit
  était coché pour une semaine dont le contenu a changé, la coche reste. Sans gravité.
- 3 lignes du détail « Utilisé dans » (écran Courses) affichent « — » en quantité : Knacks ↔
  « Saucisses », Herta Le Bon Paris ↔ « Jambon » — noms trop différents pour être appariés sans
  table de synonymes ; le lien recette, lui, est correct.
- S7 (66,70 €) et S9 (69,24 €) dépassent le budget de 55 € : c'est la donnée du classeur
  (marge négative affichée en rouge), pas une erreur d'import.
- Prix du pesto vert et de la sauce tomate-basilic : estimés dans le classeur (voir Méthode).
