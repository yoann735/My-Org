# Bibliothèque — modes d'affichage (30/09/2026)

La Bibliothèque contient **tous** les cours. Un seul affichage ne peut pas servir à la fois à
**ranger** (glisser, créer des dossiers), à **retrouver** un cours précis et à **avoir une vue
d'ensemble**. L'affichage actuel (l'arbre) reste le mode **principal et par défaut** ; deux
autres modes s'y ajoutent, et on bascule entre eux par un sélecteur dans l'en-tête. Le mode
choisi est mémorisé (préférence d'affichage rangée avec les autres, dans `stats`, et
synchronisée).

## Les trois modes

| Mode | Pour quoi faire | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|---|
| **Arbre** (défaut, inchangé) | ranger, organiser | Section › Matière › Dossier › Fiche, à gauche ; le document à droite | tout : glisser-déposer, créer, renommer, replier, déposer un fichier… |
| **Grille** | parcourir, retrouver d'un coup d'œil | par section puis par matière, **une carte par fiche** : bandeau à la couleur de la matière, icône du type de document (PDF, HTML, schéma, transcript, Prise de notes), titre sur deux lignes, dossier, nombre de cartes | clic = ouvrir le document ; ▷ = réviser ; ⋯ = le même menu que dans l'arbre |
| **Liste** | vue d'ensemble, comparer, trier | un **tableau dense** de toutes les fiches : titre, matière, dossier, cartes, date d'ajout | **tri** en cliquant sur une colonne (titre, matière, dossier, cartes, date) ; mêmes actions que la grille |

### Pourquoi ces deux-là

- **Grille** : c'est l'affichage « bibliothèque » que l'œil attend (comme des couvertures de
  livres). La couleur de la matière et l'icône du document font repérer un cours sans lire,
  et le titre complet (deux lignes) n'est plus tronqué comme dans une ligne d'arbre.
- **Liste triable** : répond à des questions que l'arbre ne sait pas poser — « mes fiches
  les plus récentes », « celles qui ont le plus de cartes », « toutes les fiches de telle
  matière, quel que soit leur dossier ». Tri, pas filtre : rien n'est caché.

### Ce que je n'ai pas fait (et pourquoi)

- **Miniature de la première page du PDF** sur chaque carte : il faudrait ouvrir chaque PDF
  (lent, lourd en mémoire pour des dizaines de fiches). Remplacé par le bandeau de couleur
  de la matière + l'icône du type de document, instantanés.
- **Glisser-déposer dans la grille et la liste** : ranger reste le rôle de l'arbre (un seul
  endroit pour organiser, pas trois comportements différents).
- **Champ de recherche** : retiré de la Bibliothèque à ta demande ; la liste triable et la
  grille groupée remplissent le besoin de « retrouver ».
- Un 3ᵉ mode possible plus tard : **« Récents »** (les fiches ouvertes ou ajoutées
  récemment, en premier) — la liste triée par date en donne déjà l'essentiel.

## Comportement commun

- Ouvrir un document depuis la grille ou la liste l'affiche en grand, avec « Retour » qui
  ramène exactement au mode d'où l'on vient.
- Une fiche sans document (seulement des cartes) : le clic ne fait rien d'autre que ▷
  (réviser) et ⋯ (menu) — les deux sont visibles sur la carte / la ligne.
- Les fiches archivées (corbeille) n'apparaissent dans aucun mode, comme dans l'arbre.
