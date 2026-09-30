# Audit — sidebar de la Bibliothèque (30/09/2026)

Mesuré dans Chrome (fenêtre 1600 × 1000, puis 1280 px ; à 390 px l'app passe sur son interface mobile), sur une base de test
avec 3 sections, 5 matières, 6 dossiers (dont 2 sous-dossiers) et ~12 fiches.
Largeur utile de la sidebar : **314 px**, fixe (non redimensionnable), à toutes les
largeurs d'écran.

## 1. Ce qu'on voit, élément par élément

| Élément | Ce qui est affiché aujourd'hui | Problème mesuré |
|---|---|---|
| **En-tête de section** (carte) | flèche · icône · nom · « 2 matières » · `+ Matière` · cloche · ↑ ↓ | **101 à 126 px de haut** pour une ligne. Le bloc de droite (170 px) passe sur 2 lignes et **écrase le nom à 36 px** : « Cours P2 » s'affiche sur **deux lignes** (« Cours / P2 »). ↑ ↓ sont à 45 % d'opacité, à peine visibles. |
| **Matière** | petite **pastille colorée** (12 px de texte) · `+ Dossier` (bouton accentué) · ⋯ | Hiérarchie **inversée** : la matière (niveau 2) est plus petite et plus pâle que ses fiches (niveau 4, titre 14 px gras dans un cadre). **Pas de repli** possible. Le bouton `+ Dossier` violet est répété sur chaque matière : c'est l'élément le plus voyant de la liste. |
| **Dossier** | **cadre** gris + chevron + icône + nom + « 1 fiche · 1 dossier » (2ᵉ ligne) + ⋯ | Même cadre que les fiches : on ne distingue pas un dossier d'une fiche au premier coup d'œil. Le compteur « 0 fiche · 0 dossier » occupe une ligne entière. |
| **« + Nouveau dossier »** (dans chaque dossier ouvert) | bouton fantôme en tête du contenu | Troisième façon de créer un dossier (avec `+ Dossier` et le menu ⋯), répétée dans chaque dossier ouvert. |
| **Fiche** | **cadre** · icône · titre · ▷ (réviser) · ⋯ · 2ᵉ ligne « 0 QCM · 0 flash » | **84 px de haut** par fiche (cadre + marge + ligne de compteur + créneau de dépôt). **7 titres sur 12 tronqués** (« Hypertension artéri… », « Insuffisance ca… ») : ▷ et ⋯ restent affichés en permanence et mangent ~60 px. Le compteur « 0 QCM · 0 flash » s'affiche même à zéro. |
| **Indentation** | 18 px de marge + 10 px de retrait + trait de 2 px = **30 px par niveau** | À 2 niveaux, 60 px perdus sur 314 : les titres des sous-dossiers se tronquent encore plus. |
| **Créneaux de dépôt** (glisser une fiche) | fine bande entre chaque fiche + zone « Déposer ici » en fin de dossier | Invisibles au repos mais **ajoutent 8 px** à chaque fiche. |
| **Espaces** | 14 px entre matières, 10 px avant chaque dossier, 12 px entre sections | L'arbre est aéré au point qu'on ne voit qu'une matière et demie par écran. |
| **Mobile (390 px)** | interface mobile à part (accueil, séries) : la sidebar de la Bibliothèque n'y apparaît pas | hors périmètre |

Aucun élément ne sort de la sidebar (0 débordement horizontal mesuré) : le texte est
**tronqué ou replié**, pas coupé — c'est la place qui manque, pas le cadrage.

## 2. Chaque bouton : ce qu'il fait, et s'il y a plus simple

| Bouton | Mécanique réelle | Verdict |
|---|---|---|
| Flèche de section | replie/déplie ; état **mémorisé et partagé avec Réviser** (`stats.treeClosedSources`) | ✅ garder |
| ↑ / ↓ de section | change l'ordre des sections (`stats.ordreSections`), Réviser suit | ✅ garder, **mais visibles** (pas 45 %) |
| `+ Matière` (en-tête) | crée « Nouvelle matière » dans la section et ouvre le renommage (nom présélectionné) | ✅ garder ; le mettre **à sa place logique** : en bas de la liste des matières de la section, là où la nouvelle apparaîtra |
| Cloche de section | met en pause / reprend les rappels de la méthode des J pour toute la section (`setSourceRappels`) | action rare mais importante → garder, en **icône discrète**, affichée franchement seulement quand les rappels sont **en pause** (l'état anormal) |
| « 2 matières » | compteur | inutile (on voit les matières) → retirer |
| Pastille de matière | double-clic = renommer | la remplacer par une **vraie ligne** (flèche, point de couleur, nom en gras) |
| `+ Dossier` (matière) | crée un dossier à la racine de la matière, renommage direct | garder l'action, en **icône « + » dans la ligne**, visible au survol (toujours visible sur écran tactile) |
| ⋯ de matière | Renommer · Nouveau dossier · Supprimer la matière… (sauvegarde + corbeille) | ✅ garder |
| Clic sur un dossier | replie/déplie (mémorisé, partagé avec Réviser) | ✅ garder, avec une **flèche** comme partout |
| `+ Nouveau dossier` (dans un dossier) | crée un sous-dossier | **redondant** → icône « + » dans la ligne du dossier (niveau 1 seulement : 2 niveaux maximum, garde existante) |
| ⋯ de dossier | Renommer · Supprimer le dossier (les fiches remontent) | ✅ garder ; y ajouter « Nouveau sous-dossier » |
| Clic sur une fiche | avec document : l'ouvre à droite ; sans document : déplie la liste de ses cartes | ✅ garder |
| ▷ de fiche | lance une révision de la fiche | garder, **au survol** seulement (libère la place du titre) |
| ⋯ de fiche | Renommer · Déplacer vers… · Étiquette · Attacher/Remplacer un document · Rappels J · Supprimer | ✅ garder, au survol |
| Double-clic (tout niveau) | renommer | ✅ garder (et « Renommer » reste dans chaque ⋯) |
| Poignée ‹ au bord de la sidebar | replie la sidebar en rail | ✅ garder |

## 3. Refonte proposée (ce que je fais)

Principe : **un arbre de type Finder**, une ligne = un élément, lignes de 30 px, sans
cadres, indentation régulière de 16 px avec un trait guide fin. Couleurs et typo de
l'app (sombre, fin, sobre), aucune nouvelle couleur.

```
▾ COURS P2                                   ↑ ↓ 🔔
   ▾ ● Cardiologie                    6        + ⋯      ← + et ⋯ au survol
       ▸ 📁 Valves                    2        + ⋯
       ▾ 📁 Cours magistraux          1          ⋯
           📄 Cardio — cours magistral 1   ▷ ⋯        ← ▷ ⋯ au survol
         📄 Hypertension artérielle — physiopathologie…
   ▸ ● Pneumologie                    2
   + Nouvelle matière
```

- **Section** : une seule ligne (petites capitales, comme un titre de groupe) ; flèche
  de repli ; ↑ ↓ bien visibles au survol et désactivés aux extrémités ; cloche seulement
  si l'on veut la changer (au survol), ou en permanence quand les rappels sont en pause.
- **Matière** : ligne en gras avec son point de couleur, **repliable** (nouveau,
  mémorisé dans `stats.treeClosedMatieres`, préférence d'affichage comme les autres),
  nombre de fiches à droite ; au survol « + » (nouveau dossier) et ⋯.
- **Dossier** : flèche + icône dossier + nom + nombre de fiches ; « + » (sous-dossier,
  niveau 1 seulement) et ⋯ au survol.
- **Fiche** : icône de type + titre sur **toute la largeur** ; ▷ et ⋯ apparaissent au
  survol par-dessus la fin de la ligne ; compteur de cartes affiché seulement s'il y en
  a ; « Prise de notes » indiqué par une icône.
- **Créer** : « + Nouvelle matière » en bas de chaque section ; « + » dans les lignes
  pour les dossiers ; tout reste aussi dans les menus ⋯.
- Tout ce qui marche aujourd'hui est **conservé tel quel** : glisser-déposer des fiches
  (ligne d'insertion, dépôt sur un dossier fermé ou une matière, ouverture au survol),
  dépôt de fichiers du Finder, renommage, menus, repli mémorisé partagé avec Réviser,
  ordre des sections, recherche, ouverture du document à droite.

## 4. Ce que je ne touche pas

- **Réviser** : son arbre a son propre rendu (`tree-card`) ; le composant partagé
  `DossierRow` n'est **pas modifié** (la Bibliothèque aura sa propre ligne de dossier)
  pour que Réviser reste strictement identique.
- Aucune donnée : la refonte ne change que l'affichage. Seule nouveauté persistée :
  la liste des matières repliées (`stats`, même canal que les autres préférences).
