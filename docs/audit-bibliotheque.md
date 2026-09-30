# Audit — la Bibliothèque comme « QG » (30/09/2026)

Hiérarchie : **Section** (ex. « Rattrapage », `sources`) › **Matière** (`matieres`) ›
**Dossiers** sur deux niveaux (`dossiers`, `parentId`) › **Fiches** (`fiches.dossierId`).

## Ce qui existe déjà

| Besoin | État actuel dans la Bibliothèque | Où |
|---|---|---|
| Sections affichées | une carte par section, **toujours dépliée**, dans l'ordre de création | `Bibliotheque.jsx` (arbre) |
| Replier une section | ❌ absent ici — **existe dans Réviser** (état mémorisé `stats.treeClosedSources`, hook déjà prêt : `useTreeOpenState(ctx, { sources: true })`) | `useTreeOpenState.js` |
| Ordonner les sections | ❌ absent partout (ordre de création) | — |
| Renommer section / matière / dossier | ✅ double-clic | `startRename` |
| Créer une matière | ❌ absent ici — seulement dans Réglages → Cours et à l'import | `ctx.addMatiere` existe |
| Supprimer une matière | ❌ absent ici — dans Réviser (clic droit) : les fiches partent dans « À classer », la matière va dans la corbeille (restaurable) ; **sans `putBackup`** | `ctx.deleteMatiere` |
| Créer un dossier | ✅ bouton « Nouveau dossier » **fantôme** (petit, gris) sous chaque matière et dans chaque dossier | `DossierAddButton` |
| Glisser-déposer des fiches | ✅ **déjà là, même mécanisme que Réviser** (`FicheDndProvider` / `DraggableFiche` / `DropSlot`, dnd-kit) — vérifié : une fiche glissée d'une matière à l'autre change bien de matière | `ui.jsx` |
| … mais | on ne peut déposer **que sur les zones « Déposer ici »**, visibles seulement dans les dossiers **ouverts** : lâcher une fiche sur un dossier fermé ou sur le nom d'une matière ne fait rien — sans doute l'impression que « ça ne marche pas ». Même limite dans Réviser. | `DropSlot` |
| Import de fichiers glissés depuis le Finder sur l'arbre | ✅ dans Réviser (`useTreeFileDrop`), ❌ pas dans la Bibliothèque | `TreeFileDrop.jsx` |

## Ce qui manque, et ce que je fais

1. **Sections** : repli (réutilise `useTreeOpenState({ sources: true })` → **même état que
   Réviser**, mémorisé et synchronisé) + boutons ↑ / ↓ pour les ordonner. L'ordre est une
   préférence d'affichage rangée comme les autres dans `stats` (`ordreSections`, liste d'ids) :
   **aucun champ ajouté aux sections**, aucune migration. Réviser suit le même ordre.
2. **Matières** : « + Matière » dans l'en-tête de chaque section ; sur chaque matière un menu
   ⋯ (Renommer · Nouveau dossier · Supprimer). **Supprimer** = le geste existant de Réviser
   (`ctx.deleteMatiere` : fiches → « À classer », matière → corbeille, restaurable), avec en
   plus un **`putBackup` avant** (ajouté dans `deleteMatiere`, donc aussi pour Réviser) et une
   confirmation qui dit exactement ce qui se passe (N fiches déplacées, N dossiers, N cartes).
3. **Dossiers** : un bouton **« + Dossier »** visible dans la ligne de chaque matière (plus
   seulement le bouton fantôme), et dans le menu de la matière.
4. **Glisser-déposer** : on peut désormais lâcher une fiche **sur la ligne d'un dossier
   (même fermé)** ou **sur le nom d'une matière** ; survoler un dossier fermé pendant un
   glisser l'**ouvre** au bout d'un instant. Même composant partagé → Réviser en profite aussi.

## Ce que je ne fais PAS (et pourquoi)

- **Import depuis le Finder dans la Bibliothèque** : utile mais c'est un autre geste (créer
  une fiche) ; il reste dans Réviser. À ajouter si tu le veux.
- **Supprimer définitivement une matière** : la suppression reste un passage par la
  corbeille (restaurable), comme partout dans l'app.
- **Glisser des sections ou des matières** : réordonner les sections se fait par ↑ / ↓ (plus
  fiable qu'un glisser pour 2 à 5 éléments) ; déplacer une matière d'une section à une autre
  n'est pas demandé.

## Risques

Aucun sur les données : ordre et repli sont des préférences d'affichage (`stats`) ; la
suppression de matière réutilise le chemin existant, avec une sauvegarde en plus. Le seul
composant partagé modifié (`DossierRow` devient une cible de dépôt) est couvert par la
check-list Réviser + Bibliothèque.
