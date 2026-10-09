# Compte rendu — Lecteur PDF / document v2 (09/10/2026)

Six évolutions du lecteur (PDF et documents créés dans l'app) et du panneau de MedRevise.
Tout a été testé dans un Chrome isolé piloté en CDP (sans extension), devant le serveur Vite
local **sans Supabase** (`VITE_SUPABASE_URL=` vide) : le cloud n'a jamais été touché. La
transcription en direct a été testée avec le faux Deepgram du dépôt (`scripts/faux-deepgram.mjs`)
et un micro simulé (voix française générée par `say`).

Règles respectées :
- `git diff 9f62042 -- src/mealweek src/shared` est **vide** ;
- MealWeek est identique **au pixel près** avant/après (capture ordinateur : 0 pixel différent ;
  téléphone : fichiers PNG identiques) ;
- aucune écriture Supabase ;
- aucune donnée convertie : les annotations, couleurs et boîtes existantes sont rendues comme
  avant (capture comparée octet pour octet).

---

## 1. Barre de mise en forme : en haut, avec les outils

### Ce qui change

- La barre flottante du bas disparaît. La mise en forme (gras, italique, souligné, barré, taille,
  police, couleur du texte, surligneur de fond, listes, alignement, H1–H3, cases à cocher,
  citation, tableau, séparateur, image, lien, annuler, rétablir) occupe désormais la **rangée
  contextuelle**, sous la barre d'outils, dans le même design.
- Cette rangée affiche :
  - les réglages de l'outil actif ;
  - **ou** la mise en forme, quand le curseur est dans le texte ou qu'une boîte est active ;
  - **ou** une aide discrète.
- **En mode document, la hauteur de la rangée est réservée** : rien ne saute. Seul son contenu
  change, en fondu de 150 ms. Sur un PDF, la rangée se déplie en hauteur en 150 ms.
- La barre s'efface dès qu'un outil d'annotation est choisi, **surligneur compris**.
- Le bouton **« Terminé » est supprimé**. Pour sortir de l'édition : cliquer hors du texte,
  appuyer sur Échap ou choisir un outil. Pour une boîte, un clic hors de la boîte la referme.
- Si la rangée est trop longue pour la largeur (tablette, fenêtre étroite), elle défile à
  l'horizontale. Un fondu sur le bord qui déborde le signale.

### Cause du bug d'affichage intermittent

Deux causes se cumulaient.

1. **Le « clic dehors » ne reconnaissait pas le texte d'un document.** Le gestionnaire qui
   referme la barre quand on clique ailleurs que dans le texte cherchait la classe `.pt-zone`.
   Or cette classe n'existe que dans l'ancien moteur, avec un éditeur par page. Depuis le moteur
   à un seul flux (08/10), le texte vit dans `.pt-flux-cadre`. Résultat : **chaque clic dans le
   texte refermait la barre**.
   - Si l'éditeur n'avait pas encore le focus, l'événement `focus` qui suivait la rouvrait :
     la barre apparaissait.
   - S'il avait déjà le focus, rien ne la rouvrait : elle disparaissait.
2. **L'éditeur garde le focus quand on change d'outil.** Les boutons d'outil empêchent le
   `mousedown` par défaut, pour conserver la sélection du surligneur. Après un aller-retour
   « Crayon → Sélection », un clic dans le texte ne produisait donc **aucun nouvel événement
   `focus`**, alors que la barre n'était ouverte qu'à cette occasion. La barre ne revenait jamais.

Mesure avant correction (20 bascules texte ↔ Crayon) : **19 apparitions manquées sur 20**.

### Correction (apparition déterministe)

- L'éditeur signale qu'il est actif à **chaque appui** dans le texte (`pointerdown` sur
  `.pt-flux-cadre` ou `.pt-zone`) et à **chaque déplacement du curseur** (`selectionUpdate` quand
  il a le focus), plus seulement au `focus`.
- `.pt-flux-cadre` est reconnu par le « clic dehors ».
- L'état est mis à jour sans nouveau rendu si l'éditeur n'a pas changé.

Mesure après correction :

| Appareil | Bascules | Barre manquée | Saut de contenu |
|---|---|---|---|
| Ordinateur | 20 (souris) | 0 | 0 |
| Tablette | 20 (au doigt) | 0 | 0 |

---

## 2. Poignée du volet tablette : plus de « +N »

- Le badge « +N lignes depuis le repli » est retiré.
- Il reste le **point rouge** de la session.
- À côté du point s'affichent les **3 derniers mots validés** du dernier segment « final », en
  gris discret, tronqués à environ 24 caractères. Ils glissent à chaque arrivée de mots
  (animation désactivée si `prefers-reduced-motion`).
- Test avec une vraie session de transcription (faux Deepgram + micro simulé). Relevés
  successifs : « un canal de » → « nerfs. » → « relient les canaux » → « périoste. » → …
  Point rouge présent à chaque relevé, aucun badge.

![poignée](img/pdfreader-v2/apres-poignee-tablette.png)

---

## 3. Surligner les images OCR avec les outils normaux

| Image | Avant | Maintenant |
|---|---|---|
| **Page PDF image** | La couche OCR servait déjà de couche de texte native. | Vérifié : surligner, recolorer, retirer, sélectionner. Alignement aux zooms 100 %, 160 % et 250 % : ≤ 3 px. |
| **Image d'un document** | Le texte n'était sélectionnable qu'après un clic sur l'icône « texte ». | Avec Sélection ou Surligneur, les **mots se sélectionnent directement**. Voir le détail ci-dessous. |
| **Image collée sur un PDF** | Pas d'OCR. | OCR en arrière-plan, mis en cache par image. Voir le détail ci-dessous. |

**Image d'un document**

- Le surligneur pose une notion de la couleur courante. Repasser dans la même couleur la
  retire ; repasser dans une autre couleur la recolore.
- En mode Sélection, une bulle s'ouvre : Notion · Flashcard · Copier.
- L'icône « texte » sert désormais seulement à **voir** le texte reconnu.
- Les notions sont stockées en **indices de mots OCR** : elles suivent l'image à toute taille.
- Elles apparaissent dans le panneau Notions.

**Image collée sur un PDF**

- Les mots sont posés en calque transparent, **en fractions de l'image** : ils suivent le zoom,
  le redimensionnement et la rotation.
- Surligneur et bulle Notion · Flashcard · Copier fonctionnent comme sur une image de document.
- Un glisser qui part d'un mot sélectionne le texte. Un glisser ailleurs sur l'image, ou sur une
  image déjà sélectionnée, la déplace comme avant.
- Le surlignage est un enregistrement `highlights` ordinaire, avec en plus `imageId` et `mots`.
  Il profite donc :
  - du panneau Notions ;
  - de la synchronisation ;
  - d'Annuler / Rétablir ;
  - du texte de cours exporté.
- Supprimer l'image supprime aussi ses surlignages, en une seule étape annulable.
- **Export PDF annoté** : rectangles calculés à partir de la position, de la taille et de la
  rotation actuelles de l'image.
- La bulle « Notion » ne fait qu'**ajouter** les mots libres : elle ne retire jamais rien.

Mesures :
- alignement sur les mots, à trois niveaux de zoom : 0 px ;
- après une rotation de 90° : 0 px ;
- poser, recolorer, retirer, annuler, rétablir : vérifiés.

| Page PDF image (160 %) | Image d'un document | Image collée, bulle | Image collée pivotée |
|---|---|---|---|
| ![](img/pdfreader-v2/apres-hl-pdfimage-160.png) | ![](img/pdfreader-v2/apres-hl-docimage.png) | ![](img/pdfreader-v2/apres-imgcollee-bulle.png) | ![](img/pdfreader-v2/apres-imgcollee-rotation.png) |

Export PDF annoté : surlignages de l'image pivotée (bleu ardoise / ambre), boîte transparente,
anciennes annotations inchangées.
![export](img/pdfreader-v2/export-palette.png)

---

## 4. Couleurs : palette de base et fond des boîtes

### Palette retenue

Les tokens de la direction artistique sont dans `src/styles/pdfreader-v2.css`. Les mêmes valeurs
existent en JavaScript dans `src/medrevise/lib/palette.js`, un module sans dépendance utilisé par
le canvas et pdf-lib.

| id | Nom | Token | Couleur | Variante surligneur (`-hl`) | Sens |
|---|---|---|---|---|---|
| `ambre` | Ambre | `--annot-ambre` | `#F5A524` | `rgba(245,165,36,.42)` | prioritaire (comme jaune) |
| `corail` | Corail | `--annot-corail` | `#F2706A` | `rgba(242,112,106,.42)` | — |
| `violet` | Violet doux | `--annot-violet` | `#9B8AFB` | `rgba(155,138,251,.42)` | — |
| `ardoise` | Bleu ardoise | `--annot-ardoise` | `#5E8BEA` | `rgba(94,139,234,.42)` | — |
| `sauge` | Vert sauge | `--annot-sauge` | `#5DBB8A` | `rgba(93,187,138,.42)` | — |
| `poudre` | Rose poudré | `--annot-poudre` | `#EE8FC0` | `rgba(238,143,192,.42)` | cloze (comme rose) |

**Pourquoi ces teintes.** Elles ont une luminance moyenne, entre 0,53 et 0,68. Elles restent
donc lisibles sur la page blanche comme sur le fond noir d'un document : `lisibleSurNoir` les
garde telles quelles.

**Où elles s'appliquent.** Elles sont dans **tous** les sélecteurs :
- surligneur, crayon (dessin et surligneur), boîte, texte libre, forme ;
- couleur du texte, dans la rangée de mise en forme ;
- dessin sur téléphone.

**Valeurs par défaut** : ambre pour le surligneur et les boîtes, bleu ardoise pour le crayon,
corail pour les formes.

**Rien n'est converti.** Les ids d'avant (`jaune`, `vert`, `bleu`, `rose`) sont rendus exactement
comme avant :
- le pastel reste plein, en « multiply » ;
- dans un sélecteur, une couleur d'avant reste affichée en tête comme « couleur actuelle » ;
- la légende des fiches HTML garde les 4 couleurs du gabarit.

Le **sens** des couleurs est conservé dans l'export de cours (`[PRIORITAIRE]`, cloze) : ambre vaut
jaune, rose poudré vaut rose.

Preuve que l'ancien rendu ne bouge pas : la capture de la zone des anciennes annotations
(boîte jaune, surlignage vert, surlignage bleu) est **identique octet pour octet** avant et après
le changement de palette.

| Page blanche | Fond noir |
|---|---|
| ![](img/pdfreader-v2/apres-palette-blanc.png) | ![](img/pdfreader-v2/apres-palette-noir.png) |

### Fond des boîtes

- Une nouvelle boîte a un **fond transparent** : fine bordure de sa couleur, texte à l'encre de
  la page (sombre sur blanc, clair sur fond noir).
- Le bouton **« Fond »** de la mini barre fait tourner les trois modes :
  transparent → teinté 15 % → plein.
- Les couleurs personnalisées (roue ou hex) suivent la même règle.
- Une boîte d'avant, sans champ `fond`, garde exactement son rendu d'origine.
- L'export PDF annoté respecte le fond choisi.

| Transparent | Teinté 15 % | Plein |
|---|---|---|
| ![](img/pdfreader-v2/apres-boite-transparente.png) | ![](img/pdfreader-v2/apres-boite-teinte.png) | ![](img/pdfreader-v2/apres-boite-plein.png) |

---

## 5. Marges de page réglables (documents créés dans l'app)

### Mise en page

On y accède par **Fichier › Mise en page…**. C'est un panneau flottant **sans voile** : on voit
la page se repaginer en direct derrière. Il propose :
- **les préréglages :**

  | Préréglage | Marges |
  |---|---|
  | Étroites | 12,7 mm partout |
  | Normales | 19,8 mm, la marge d'avant (56 unités) |
  | Larges | 25,4 mm en haut et en bas, 50,8 mm à gauche et à droite |

- **les quatre marges** en mm, chacune avec un champ et une glissière, de 5 à 60 mm par pas de
  0,5 mm.

### Règles

- **Quand :** une règle fine apparaît en haut et à gauche de la page courante, **seulement
  pendant l'écriture**, en fondu.
- **Comment :** glisser une poignée règle la marge **en direct**, avec la valeur affichée pendant
  le geste, comme dans Word.
- **Tablette :** cibles agrandies à 22 px.

### Effet sur le document

**Toutes les pages**

- Les marges définissent la zone utile du flux unique : `geo.haut(k)`, `geo.zone`, et le
  padding gauche/droite.
- Un changement de marge **repagine immédiatement** : même événement `pti-taille` qu'un
  redimensionnement d'image.

**Enregistrement**

- Les marges sont mémorisées **par document** dans `notes_doc.marges`, en mm, et synchronisées.
- Une valeur venue d'un autre appareil est reprise.
- Sans réglage, un document garde ses marges d'avant, à l'unité près.

**Calcul**

- Les marges sont arrondies à l'unité de page, soit au plus 0,18 mm.
- Avec des marges fractionnaires (30 mm = 85,04 unités), le test de conformité de l'export
  relevait un écart DOM de 2,57 px. Arrondies, l'écart tombe à 0,55 px au plus.

### Mesures

Toutes faites sur l'écran puis sur le PDF exporté :

| Vérification | Résultat |
|---|---|
| Étroites | marge gauche de 36 unités |
| Larges | marge gauche de 144 unités ; 3 → 4 pages |
| Champ « Haut » à 30 mm | le texte descend à 85 unités |
| Poignée glissée | 56 → 122 unités pendant le geste |
| PDF exporté | marge gauche à 123 unités pour 122 attendues ; rien au-delà de la marge droite ; même nombre de pages qu'à l'écran |
| Conformité écran/PDF (`scripts/tests-document/conformite.mjs`), marges 25/25/30/15 mm | **conforme**, 3 pages, écart DOM ≤ 0,55 px, encre ≤ 1,1 px |

| Règles en écriture | Poignée glissée (40 mm) | Étroites | Larges |
|---|---|---|---|
| ![](img/pdfreader-v2/apres-regles.png) | ![](img/pdfreader-v2/apres-regle-glisser.png) | ![](img/pdfreader-v2/apres-marges-etroites.png) | ![](img/pdfreader-v2/apres-marges-larges.png) |

---

## 6. Refonte visuelle légère

La structure ne change pas et aucune fonction n'est retirée. Tout se trouve dans
`src/styles/pdfreader-v2.css`, sous la classe racine `.pdfr-v2` du lecteur : rien ne fuit vers
le reste de l'app.

### Barres

- **Groupes par fonction** en « pilules » : pages, zoom, outils.
- **Séparateurs** discrets.
- **Icônes** de 16 px, toutes au même trait (1,75). Annuler et rétablir de la rangée de mise en
  forme reprennent les icônes de la barre principale.
- **Coins** homogènes : 7 px pour les contrôles, 10 px pour les groupes, 12 px pour les barres
  et les menus.

### Outil actif

- Fond teinté à 20 % de l'accent, avec l'icône de la couleur d'accent : **plus de bloc violet
  plein**.
- Même traitement pour les segments, les bascules, les formes, les boutons de mise en forme et
  la tablette.

### En-tête et menus

- **En-tête plus calme** : titre en 15 px, graisse 600 ; « Fichier » discret.
- **Menus** (Fichier, couleurs, menus contextuels, bulles) : ombre légère, ouverture en
  `scale(.98) → 1` avec fondu.
- **Rangée contextuelle** : listes déroulantes sobres, avec chevron.

### Micro-animations

- apparition des barres : 150 ms ;
- changement d'outil : fondu du fond actif, 150 ms ;
- ouverture des menus : 150 ms ;
- mini barres et poignées en fondu : 150 ms ;
- la page « se pose » à l'ouverture : 180 ms ;
- fondu d'entrée de l'écran : ramené de 340 à 180 ms.

Mesures :
- durée maximale de toutes les animations et transitions du lecteur : **200 ms**, sur 105
  éléments animés ;
- avec `prefers-reduced-motion: reduce` : **0 animation, 0 transition**.

### Fonctions conservées

Un script a relevé toutes les commandes visibles, sur l'ancienne et la nouvelle version :
- barres d'un document et d'un PDF ;
- menus Fichier ;
- rangée de mise en forme ;
- réglages des 5 outils ;
- mini barre d'une boîte ;
- barre de la tablette.

Seules différences, toutes voulues :
- « Terminé » retiré ;
- « Mise en page… » et « Fond » ajoutés ;
- les 4 anciennes pastilles remplacées par les 6 nouvelles.

### Captures avant / après — ordinateur

| | Avant | Après |
|---|---|---|
| Barre, outil Sélection | ![](img/pdfreader-v2/avant-d1-barre-selection.png) | ![](img/pdfreader-v2/apres-d1-barre-selection.png) |
| Surligneur | ![](img/pdfreader-v2/avant-d2-barre-surligneur.png) | ![](img/pdfreader-v2/apres-d2-barre-surligneur.png) |
| Crayon | ![](img/pdfreader-v2/avant-d3-barre-crayon.png) | ![](img/pdfreader-v2/apres-d3-barre-crayon.png) |
| Menu Fichier | ![](img/pdfreader-v2/avant-d4-menu-fichier.png) | ![](img/pdfreader-v2/apres-d4-menu-fichier.png) |
| Mise en forme du texte | ![](img/pdfreader-v2/avant-d5-mise-en-forme.png) | ![](img/pdfreader-v2/apres-d5-mise-en-forme.png) |
| Couleur du texte | ![](img/pdfreader-v2/avant-d6-couleur-texte.png) | ![](img/pdfreader-v2/apres-d6-couleur-texte.png) |
| Barre d'un PDF | ![](img/pdfreader-v2/avant-p1-barre-pdf.png) | ![](img/pdfreader-v2/apres-p1-barre-pdf.png) |
| Boîte active | ![](img/pdfreader-v2/avant-p2-boite-active.png) | ![](img/pdfreader-v2/apres-p2-boite-active.png) |

### Captures avant / après — tablette (820 × 1180, tactile)

| | Avant | Après |
|---|---|---|
| Barre | ![](img/pdfreader-v2/avant-t1-barre-tablette.png) | ![](img/pdfreader-v2/apres-t1-barre-tablette.png) |
| Crayon | ![](img/pdfreader-v2/avant-t2-tablette-crayon.png) | ![](img/pdfreader-v2/apres-t2-tablette-crayon.png) |
| Menu « … » | ![](img/pdfreader-v2/avant-t3-tablette-menu.png) | ![](img/pdfreader-v2/apres-t3-tablette-menu.png) |
| Écran | ![](img/pdfreader-v2/avant-t4-tablette-ecran.png) | ![](img/pdfreader-v2/apres-t4-tablette-ecran.png) |

Mise en forme en tablette, la rangée défile au doigt :
![](img/pdfreader-v2/apres-tablette-mise-en-forme.png)
![](img/pdfreader-v2/apres-tablette-rangee-fin.png)

---

## Tests (Chrome headless, CDP, événements souris et tactiles réels)

Journal du dernier passage : [img/pdfreader-v2/journal-tests.txt](img/pdfreader-v2/journal-tests.txt) ; scripts : `scripts/tests-pdfreader-v2/`.

| Domaine | Résultat |
|---|---|
| Barre de mise en forme, ordinateur | 20 bascules sans manque ni saut ; gras d'une boîte ; un clic dehors referme ; plus de barre en bas ; Annuler / Rétablir de la rangée |
| Barre de mise en forme, tablette | 20 bascules au doigt sans manque ni saut ; défilement horizontal ; règles tactiles |
| Poignée | point rouge et derniers mots qui défilent, plus de « +N », sur une vraie session |
| OCR, page PDF image | poser, recolorer, retirer ; aligné à 100 / 160 / 250 % |
| OCR, image de document | poser, recolorer, retirer ; bulle ; notion dans le panneau ; aligné à 3 zooms |
| OCR, image collée | poser, recolorer, retirer ; bulle ; Notion ; 3 zooms ; rotation ; Annuler / Rétablir ; export |
| Palette | 5 sélecteurs à 6 couleurs ; dessin mobile ; lisible sur blanc et sur noir ; anciennes annotations identiques octet pour octet |
| Boîtes | fond transparent par défaut ; teinté, plein, retour à transparent ; ancienne boîte inchangée ; export |
| Marges | voir § 5 ; pagination pure (`test-pagination.mjs`) : 0 échec |
| Refonte | animations ≤ 200 ms ; aucune avec `prefers-reduced-motion` ; inventaire des fonctions identique |
| Non-régression | MealWeek identique au pixel ; MedRevise mobile (390 px) sans erreur ; 0 erreur JS sur tous les scénarios |

**Note sur la conformité.** Le test de conformité sur « Document test v2 » échoue, aussi bien sur
l'**ancienne** que sur la nouvelle version, avec les mêmes écarts. Ce document a reçu pendant les
essais des traits de crayon, une image collée et des bords de page qui faussent le profil
d'encre. Sur un document texte neuf, le test est **conforme**, avec les marges par défaut comme
avec des marges personnalisées.

### Ce qui n'a pas été fait ou reste à surveiller

- Les cartes du **Tableau** ont gardé leur rendu (fond teinté).
  - Pourquoi : « post-it » a été compris comme les boîtes du lecteur.
  - Ce qui change pour elles : la nouvelle palette s'y applique via le sélecteur commun.
- Le test sur un **appareil physique** n'a pas été fait : tablette et téléphone ont été émulés
  dans Chrome (tactile CDP).
- L'**OCR** d'une image collée tourne à sa première apparition.
  - Le résultat est mis en cache par image.
  - Sur un très gros PDF chargé d'images, la première ouverture déclenche plusieurs
    reconnaissances en arrière-plan.

---

## Commits

| Commit | Contenu |
|---|---|
| `ebf898c` | barre de mise en forme dans la rangée du haut, apparition déterministe, sans « Terminé » |
| `342433b` | poignée du volet tablette : point rouge + derniers mots, plus de « +N » |
| `b875362` | surligner directement les mots OCR des images (document, image collée, page PDF image) |
| `5a0a057` | palette de 6 couleurs, boîtes transparentes par défaut + option Fond |
| `385aa84` | marges de page réglables (Mise en page, règles, repagination, export) |
| `7768f3f` | refonte visuelle légère du lecteur |
| `375a307` | marges arrondies à l'unité de page (export conforme avec marges personnalisées) |
