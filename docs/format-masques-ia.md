# Format des masques produits par une IA — `medrevise-masques` v1

Liste de rectangles à poser sur l’image d’une **flashcard image** (occlusion), collée dans l’éditeur avec
**« Coller des masques »** (ou choisie en fichier `.json`). Le prompt qui demande ce format à une IA :
[prompt-masques-ia.md](prompt-masques-ia.md). Code : `src/medrevise/lib/masquesIA.js`.

```json
{"format":"medrevise-masques","version":1,"masques":[
  {"label":"Tubercule de Gerdy","x":0.012,"y":0.171,"w":0.180,"h":0.024}
]}
```

| Champ | Sens |
|---|---|
| `format` | toujours `"medrevise-masques"` |
| `version` | toujours `1` |
| `masques[]` | un objet par étiquette à cacher |
| `label` | texte EXACT de l’étiquette (lignes réunies par une espace) : sert au recalage OCR et devient la **réponse** du masque |
| `x`, `y` | coin **haut-gauche** du rectangle |
| `w`, `h` | largeur et hauteur du rectangle |

Toutes les coordonnées sont des **fractions** de l’image (0 à 1) : `x` et `w` divisés par la largeur, `y` et `h` divisés par
la hauteur ; origine en haut à gauche. Le format ne dépend donc pas de la résolution.

## Lecture tolérante

- Le texte autour du JSON (« Voici les masques… ») et les balises ```` ```json ```` sont ignorés : on lit le premier bloc `{…}`
  (ou `[…]`) bien refermé.
- Réparé automatiquement, avec un avertissement : guillemets typographiques (« “ ” »), virgule avant `}` ou `]`.
- Une liste nue `[…]` sans en-tête, un `format` ou une `version` inattendus : lus, avec un avertissement.
- Coordonnées visiblement en **pixels** (la plupart > 1,5) : converties avec la taille de l’image, avec un avertissement.
- Rectangle qui **dépasse** de l’image : ramené dedans (« N masques dépassaient de l’image : ramenés dedans »).
- Ignorés et signalés un par un : élément qui n’est pas un objet, `x/y/w/h` non numériques, largeur ou hauteur nulle,
  rectangle entièrement hors de l’image. Un masque sans `label` est importé sans réponse ni recalage.
- **Doublon probable** signalé : même label et rectangles qui se recouvrent (> 30 % du plus petit). Le même label à deux endroits
  différents (deux vues) n’est PAS un doublon.
- **Chevauchement fort** signalé : labels différents dont les rectangles se recouvrent à plus de 60 %.
- JSON invalide : message qui dit **où** (ligne, colonne, extrait) et **quoi vérifier** (guillemets droits, virgules entre les
  masques et pas après le dernier, accolades et crochets refermés). Rien n’est ajouté.

## Recalage OCR

Pour chaque masque, l’OCR existant de l’app (`ocr/ocrImage.js`, Tesseract.js, même worker) lit l’image, puis :

1. zone de recherche = le rectangle de l’IA agrandi de **3 %** de la largeur / hauteur de l’image de chaque côté ;
2. les mots lus dans cette zone sont comparés aux mots du `label`, sans tenir compte des accents, de la casse ni de la ponctuation,
   avec quelques fautes tolérées (0 jusqu’à 2 lettres, 1 jusqu’à 5, puis environ 1 sur 4). Sont aussi reconnus : deux mots collés
   par l’OCR (« Facelatérale ») et un mot coupé par un retour à la ligne ou un trait d’union ;
3. l’ordre de lecture départage les étiquettes voisines : le mot suivant du label doit être à droite sur la même ligne ou au début
   d’une ligne en dessous. Plusieurs ancrages sont essayés et le bloc trouvé doit recouper le rectangle de l’IA ;
4. **recalé** = tous les mots de 3 lettres et plus trouvés : le masque prend **exactement le contour de ces mots + 4 px** (pixels de
   l’image d’origine). Les petits mots non lus (« de », « la ») élargissent le masque du côté où ils se trouvent ;
5. sinon le masque garde la position de l’IA, avec un **contour orange « à vérifier »**. Si au moins la moitié des lettres est lue
   (un mot collé à un trait, par exemple), le rectangle de l’IA est agrandi pour couvrir aussi ces mots, et reste orange ;
6. deux masques recalés sur les mêmes mots : le second redevient « à vérifier ».

Le contour orange n’est qu’un affichage de l’éditeur : il disparaît quand on déplace ou redimensionne le masque. Il n’est jamais
stocké.

## Ce qui est stocké

Rien de nouveau. Chaque masque importé devient une **zone rectangulaire** de l’éditeur, créée par la même fonction que les zones
dessinées à la main (`pages/ImportAnatomieVisuel.jsx#nouvelleZone`) :
`{ id, kind: 'zone', zone: { shape: 'rect', rect, fill, fillOpacity, stroke, strokeOpacity, strokeWidth, closed }, boite, ancre, texte: label, couleur, numero }`.
Rien n’est enregistré tant qu’on n’a pas cliqué sur « Valider », puis sur « Créer la flashcard » (ou « Enregistrer ») : c’est le
chemin habituel de la carte (`occlusion = { imageId, imageW, imageH, coches }`, synchro comprise). Aucune migration.
