# Audit — renommer « Unité » et « Chapitre » en « Dossier » (30/09/2026)

**Règle appliquée : on ne renomme QUE des mots affichés. Aucune clé de données, aucun store,
aucun champ, aucune migration n'est touché** — les dossiers restent stockés exactement comme
avant ; réversible en rétablissant les libellés.

Méthode : extraction automatique de toutes les chaînes et textes JSX de `src/medrevise/`
contenant « unité / unite / chapitre » (commentaires exclus), puis lecture ligne à ligne.
Environ 500 occurrences au total, dont **~70 visibles**.

## Ce qu'est une « Unité » et un « Chapitre » dans le code

Un seul et même objet : un enregistrement du store **`dossiers`**
(`{ id, matiereId, nom, parentId?, ordre }`).
- « Unité » = un dossier de 1er niveau (`parentId` absent) ;
- « Chapitre » = un dossier rangé dans un autre (`parentId` = l'unité) ;
- les fiches y sont rangées par `fiche.dossierId` ; les « exercices de chapitre » par
  `question.chapitreId`.

Le renommage est donc purement cosmétique : c'était déjà un seul concept, « dossier », que
l'interface appelait de deux noms selon la profondeur.

## 1. À RENOMMER — vocabulaire visible des dossiers

| Où | Avant | Après |
|---|---|---|
| Réviser + Bibliothèque (menus, boutons) | Nouvelle unité · Nouveau chapitre | **Nouveau dossier** (dans un dossier : infobulle « …dans « X » ») |
| idem | Supprimer l'unité · Supprimer le chapitre | **Supprimer le dossier** |
| idem | Unité vide. · Chapitre vide. | **Dossier vide.** |
| idem | Déposer ici (unité) | **Déposer ici (dossier)** |
| compteurs (`ui.jsx`) | « 7 fiches · 4 chapitres » | « 7 fiches · 4 dossiers » |
| confirmation de suppression (`ui.jsx`) | Supprimer cette unité / ce chapitre ? — « dans l'unité parente », « Ses N chapitres seront supprimés » | Supprimer ce dossier ? — « dans le dossier parent », « Ses N dossiers… » (accords corrigés : *supprimé*, masculin) |
| exercices rattachés à un dossier (Réviser, `AddItemForm`, prompts) | Exercices du chapitre · Ajouter au chapitre · « un chapitre ne porte que des exercices » · Aucun exercice dans ce chapitre · Fermer la vue chapitre · N exercices de chapitre · Supprimer tous les exercices du chapitre ? | …du **dossier** |
| Réviser, glisser-déposer | « dépose la fiche sur une matière, une unité ou un chapitre » | « …sur une matière ou un dossier » |
| Carnet (Dashboard) | « · chapitre » | « · dossier » |
| Prompts (libellés) | Prompt exercices de chapitre · Exercices de chapitre — couverture globale | Prompt exercices du dossier · Exercices du dossier — couverture globale |
| Noms par défaut à la création (`MedReviseApp.jsx`) | « Nouvelle unité » · « Nouveau chapitre » | « Nouveau dossier » |
| Exemple de titre (Dashboard) | « ex : Système respiratoire — chapitre 3 » | « ex : Système respiratoire — partie 3 » |

## 2. À NE PAS TOUCHER — clés et identifiants (les renommer casserait des données)

| Clé | Où | Pourquoi on n'y touche pas |
|---|---|---|
| store `dossiers`, champs `parentId`, `matiereId`, `ordre` | IndexedDB + cloud | structure des données |
| `fiche.dossierId`, `question.chapitreId` | fiches, exercices | liens entre enregistrements, synchronisés |
| `stats.treeOpenDossiers` | état plié/déplié | déjà synchronisé entre appareils |
| clés `unite`, `chapitre` de l'export JSON (`courseExport.js#buildChapitreExport`) | JSON copié pour un prompt externe | contrat d'export ; les prompts existants les lisent |
| `CHAP_EXO_ID = 'chapitre'`, `kind="chapitre"` | prompts | identifiants de réglages enregistrés (surcharges des prompts) |
| variables `chapitres`, `isChapitre`, `chapUnite`, `uniteNom`… | code | internes, jamais affichées |

## 3. HOMONYMES — le même mot, un autre sens : laissés tels quels

| Où | Sens | Décision |
|---|---|---|
| Exercices numériques (`Exercice.jsx`, `AddItemForm.jsx`, `MobileExercice.jsx`) : « Unité », « L'unité saisie n'est pas acceptée », `r.unite` | **unité physique** (mmol/L, m/s) | gardé — ce n'est pas un dossier |
| Onglet **Apprentissage** : « Nouvelle unité », « Unité d'apprentissage », « Créer une unité », « Supprimer l'unité », « Unité prête ! » | une **unité d'apprentissage** = exos + PDF côte à côte (store `apprentissage`), pas un dossier | **gardé** — objet distinct. Si tu veux aussi le renommer (ex. « Séance »), c'est un simple changement de libellés : dis-le moi |
| Corps des prompts envoyés à l'IA (`coursePrompts.js`, `exoPrompts.js`, `chapExoPrompt.js`) : « chapitre » au sens pédagogique | texte d'instructions pour l'IA | gardé — modifier le texte d'un prompt change ce que l'IA produit |

## Risque

Nul côté données (aucune clé modifiée). Seul risque : un libellé oublié ; la liste ci-dessus
est exhaustive pour `src/medrevise/`. MealWeek et `src/shared/` ne contiennent aucune de ces
occurrences.
