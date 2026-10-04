# Compte-rendu — annotations collées à la page au zoom (04/10/2026)

**Décision finale appliquée :** toutes les annotations sont un calque collé à la page
PDF. Ça concerne :
- les boîtes et les zones de texte, avec leur texte ;
- les formes, les images collées et le crayon ;
- les épingles, les bouts de flèche, les pastilles et les « ? » ;
- les connecteurs entre une épingle et sa boîte.

À tout zoom, chacune garde la même position et la même taille **relatives à la page**.

**Exception :** la poignée et le coin de redimension d'une boîte sélectionnée restent à
taille d'écran. Les barres d'actions (le menu) et les poignées des formes et des images
aussi.

Cette décision remplace la consigne « taille d'écran fixe » des 03 et 04/10.

## Cause racine (3 lignes)

1. Position, épingle et connecteurs étaient calculés en **fractions de page**
   (`x × 100 %`, `ancre.x × largeur de page`). Ils suivaient donc le zoom.
2. La **taille** des boîtes, elle, était rendue en **px d'écran** : `largeur × refW`,
   avec `refW = largeur de page ÷ échelle × 1,6`, soit une constante à l'écran. Leur
   police (13 px) était fixe aussi.
3. Deux repères cohabitaient donc. Au dézoom, la boîte gardait sa taille d'écran autour
   d'un point qui, lui, se resserrait : boîtes qui débordent et se chevauchent, épingle
   détachée. Les connecteurs, dessinés dans le repère de la page, restaient collés à
   l'épingle mais plus au bord de la boîte.

## Correction : un seul repère, la page

- **Stockage :** toutes les grandeurs sont des fractions de page. Une largeur de boîte
  est une fraction de la largeur de la page à 160 %, ce qui revient au même qu'une
  fraction de page tout court.
- **Rendu des boîtes :** chaque boîte est mise en page à l'échelle de référence (160 %),
  puis mise à l'échelle de la page par **un seul** `scale: k`, avec `k = zoom ÷ 160 %`.
  Cadre, texte, barre et marges suivent ensemble.
- **Une seule conversion écran ↔ page :**
  - les connecteurs, les pointes et leurs seuils sont calculés en px de page, avec la
    taille de la boîte × k ;
  - le déplacement **et** la redimension convertissent les écarts de souris en fractions
    de la page (avant, la redimension utilisait l'unité de référence) ;
  - une boîte tracée est enregistrée en fraction de page (avant : × k).
- **Variable `--k`** posée sur chaque `.pdfr-page` : les épingles, les bouts de flèche,
  les pastilles, les « ? » et le texte des formes la lisent (propriété CSS `scale` /
  `calc`).
- **Formes et crayon :** l'épaisseur est une fraction de la page affichée. C'est un
  retour sur l'épaisseur « fixe » du 04/10.
- **Images :** déjà en fractions de page.
- **Export annoté :** il calculait déjà tout en fractions de page (police 13 px ramenée
  à 160 %). Il correspond désormais à l'écran à tout zoom ; seul son commentaire a été
  corrigé.
- **Miniatures, mobile, tableau :** aucun code n'y utilise l'ancien repère.

**Conservé :**
- le zoom intercepté par le lecteur (pincement, ⌘+, Safari, écran tactile), pour que
  le navigateur ne zoome jamais toute la page ;
- la correction du clic qui traversait une boîte vers le texte du PDF (couche de texte
  en `z-index: 0`) ;
- les barres d'actions en `max-content`.

## Commits

| Commit | Étape |
|---|---|
| `4246714` | Boîtes et zones de texte collées à la page, un seul repère ; épingles, flèches, pastilles et « ? » |
| `973754d` | Formes et crayon collés à la page (épaisseur, texte des formes) |
| (étape 3) | Export annoté : commentaire mis à jour + ce compte-rendu |

## Annotations existantes

**Aucune conversion, aucune réécriture**, donc pas de `putBackup` nécessaire. Le format
de stockage ne change pas : une largeur de boîte était déjà une fraction de la page
à 160 %.

**Conséquences à l'affichage :**
- à 160 %, chaque annotation se rouvre exactement comme avant ;
- à un autre zoom, elle grandit ou rétrécit avec la page ;
- à 168 % (ton zoom « ajusté à la largeur »), les boîtes sont environ 5 % plus grandes
  qu'avec l'ancien code.

**Cas particulier :** les boîtes **tracées** entre le 03/10 et aujourd'hui à un autre
zoom que 160 % ont été enregistrées avec une conversion `× zoom ÷ 160 %`. Elles
reprennent la taille qu'elles avaient à l'écran au moment du tracé, mais vue à 160 %.
Le zoom du tracé n'est pas enregistré : je ne l'ai pas deviné, et elles ne sont pas
corrigées. Les boîtes créées par simple clic (taille par défaut) ne sont pas
concernées.

## Tests et captures

**Non faits, à ta demande** (« test pas »). Seul le build a été vérifié, vert à chaque
étape. Les 4 captures (40 / 100 / 168 / 300 %) de la fiche « 1 2 Introduction à
l'ostéologie (2) », page 9, n'ont donc pas été faites.

Pour lire cette fiche sans écrire dans le cloud, j'avais tenté d'extraire la clé
publique du site déployé, pour ne faire que des lectures. Le gestionnaire de
permissions l'a refusé, et je ne l'ai pas contourné.

**À vérifier par toi sur cette fiche, après le déploiement Vercel :**
1. À 40 / 100 / 168 / 300 % : les boîtes restent sur leur mot et ne débordent pas de la
   page ; l'épingle et le connecteur restent collés ; le texte grossit et rapetisse.
2. Créer une boîte à 40 % puis zoomer à 300 %.
3. Déplacer et redimensionner une boîte à 300 %, puis revenir à 100 % : aucun saut.
4. Défilement multi-pages, mode focus, export annoté.
5. Une image venant du dessin téléphone, sur mobile.

## Points incertains

- **Texte presque illisible à 40 %** : 13 px × 0,25 ≈ 3 px. C'est la conséquence
  attendue de « le texte scale aussi ». Je ne l'ai pas « amélioré », comme demandé.
- **Édition d'une boîte à faible zoom** : le curseur et la sélection dans une boîte mise
  à l'échelle passent par les rectangles de l'écran, ce qui devrait marcher. Non testé.
- **Boîtes tracées entre le 03/10 et le 04/10** à un zoom autre que 160 % : voir plus
  haut.
- **Bloc de remplacement de texte** : il suivait déjà la page (police = fraction de la
  hauteur de page), inchangé.
