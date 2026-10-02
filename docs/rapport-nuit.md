# Rapport de nuit — 3 octobre 2026 (7e chantier) : trois retouches du dessin mobile

> Rapports précédents : `git show 3320eb7:docs/rapport-nuit.md` (sélection de texte et
> surligneur), puis `5e37d32`, `b484d7e`, `978bce9`, `70196d7`, `b56ca58`.

**Les 3 sous-tâches sont faites, mesurées et testées en vrai** (un commit chacune, build
vert).

**Tests :**
- un téléphone simulé, avec de vrais gestes au doigt (portrait et paysage) ;
- l'ordi qui reçoit le dessin par un faux cloud local : **aucune écriture dans ton
  cloud** ;
- un réseau lent simulé, pour reproduire l'animation vide.

**Garanties :** MealWeek et `src/shared` : 0 fichier modifié.

| Commit | Sous-tâche |
|---|---|
| `f3f7a80` | 1. Lissage du crayon un cran plus fort (adaptatif conservé) |
| `234de0d` | 2. Arrivée d'un dessin : l'image est chargée avant l'animation |
| `9e5dfd0` | 3. Paysage : réglages d'outil en vertical (surligneur compris) |

---

## 1. Lissage du crayon : un cran de plus

Le cran est surtout appliqué aux **traits amples** :
- lissage jusqu'à 0,9 (avant 0,85) ;
- stabilisation jusqu'à 0,76 (avant 0,7) ;
- pré-lissage des points du doigt élargi plus tôt.

Le surligneur gagne aussi un cran. Le **dosage adaptatif** est conservé : l'écriture
n'est qu'à peine plus lissée.

**Pourquoi l'écriture est moins lissée que le reste :** mon premier essai, le même cran
partout, éloignait les lettres de leur forme (0,75 → 0,95 px d'écart). Je l'ai écarté.

**Mesuré sur un tracé tremblé**, en écart à la courbe voulue :

| Trait | Avant | Après |
|---|---|---|
| Grand trait (320 px) | 1,21 px, rugosité 2,64° | **0,80 px**, rugosité 2,45° |
| Trait moyen (180 px) | rugosité 4,32° | 4,19° |
| Écriture (90 px) | 0,75 px | 0,78 px (inchangé à l'œil) |

**Au doigt :**
- trait lissé en direct, à comparer avec le tracé brut ;
- écriture cursive toujours nette.

## 2. Arrivée d'un dessin sur l'ordi : l'image d'abord, l'animation ensuite

**Cause, reproduite avec un réseau lent :**
- l'effet partait au plus tard 700 ms après l'arrivée du dessin, même si l'image
  n'était pas encore descendue du cloud ;
- la carte s'animait donc avec « Image en route… » (effet à 0,7 s, image à 1,4 s).

**Correction :**
- l'image est téléchargée, avec de nouveaux essais si elle arrive après la fiche du
  dessin (20 s au plus), puis **décodée**, c'est-à-dire prête à s'afficher ;
- la carte reste invisible pendant ce temps ;
- l'effet part à l'image d'écran suivante, et ses 36 tranches attendent que leurs
  copies de l'image soient prêtes (une image d'écran en pratique).

**En plus :** à la fin de l'effet, l'image rejouait un fondu flou, ce qui la faisait
disparaître puis réapparaître. Ce second fondu est supprimé.

**Mesuré :**
- réseau lent : l'effet part à 1,9 s, avec le dessin dans chaque tranche du début à la
  fin (captures) ;
- réseau normal : il part au bout d'environ 50 ms ;
- la sortie (« Plus tard », la carte aspirée dans le bouton) marche toujours, avec
  l'image.

## 3. Paysage : réglages d'outil en vertical

**Avant :** les réglages s'ouvraient en largeur (320 px, **41 %** de l'écran).

**Maintenant :** un panneau étroit le long de la colonne d'outils, avec chaque réglage
en colonne :
- **couleurs** : une colonne, qui passe sur une 2e ou 3e colonne s'il y a beaucoup de
  couleurs perso ;
- **épaisseurs et lissage** dans la même colonne, avec un interrupteur compact ;
- **formes** sur 2 colonnes ;
- **tailles du texte**.

**Tous les outils à réglages sont concernés : crayon, surligneur, formes, texte.** La
gomme et la main n'ont pas de réglages en paysage : elles n'ouvrent plus de carte vide.

**Mesuré à 844 × 390 :**
- crayon et surligneur : 118 px (**15 %**) ;
- texte : 126 px ;
- formes : 220 px.

**Testé au doigt en paysage :**
- surligneur : couleur, 4e épaisseur, lissage coupé puis remis, puis un trait
  enregistré en vert à la bonne épaisseur ;
- formes : choix de l'étoile ;
- 10 couleurs perso de test, affichées sur le téléphone simulé seulement (rien
  d'enregistré), puis remises comme avant : palette sur 2 colonnes, toutes visibles ;
- appui long : la bulle « Retirer / Garder » s'ouvre sur le côté, entière et
  touchable.

**Portrait inchangé** (capture).

## Non-régression

- **Lecteur** : crayon, gomme, texte libre, « ? », boîte et flèche, comme avant.
- **Écrans** : Accueil, Réviser, Bibliothèque, Carnet, Apprentissage, Prise de notes,
  sans erreur.
- **MealWeek** s'ouvre normalement.
- **Accueil du téléphone** intact.

## À savoir

- **Si l'image n'arrive pas dans les 20 s**, par exemple hors ligne, la carte s'ouvre
  sans animation, avec « Image en route… » comme avant.
- **Écriture :** je n'ai pas augmenté son lissage de plus d'un souffle, pour garder les
  lettres fidèles. Si tu veux plus de douceur aussi en écrivant, c'est un réglage à
  monter.
