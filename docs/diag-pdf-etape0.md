# Fiche PDF — étape 0 : diagnostic sur un vrai cours

PDF testé : `fiche1_mathbase` (Kiné, bloc 1). Aucun code de l'app modifié.
Mesures faites avec pdf.js 6.0.227 (celui de l'app) : en Node pour l'extraction et les rendus,
et dans **Chrome (écran Retina, devicePixelRatio 2)** avec une copie exacte de
`buildTextLayer` (PdfReader.jsx) pour la sélection et les largeurs.

## Le fichier
- 652 Ko, **1 page** 540×780 pt, exporté par PowerPoint 365.
- Toutes les polices sont **intégrées** : rendu sans aucun avertissement et sans les
  polices standard de pdf.js.
- PDF **balisé** : l'arbre de structure contient `Table / TR / TD`, `P`, `Sect`.
- 7 pièces jointes `equation-N.xml` : le **MathML** des équations PowerPoint.
- 309 morceaux de texte (items), dont 69 portent `hasEOL` (fin de ligne).

## Constats
| # | Constat | Gravité | Étape |
|---|---|---|---|
| 1 | Canvas dessiné à 1 px par px CSS → **flou sur Retina** (formules, petits caractères) | Moyenne | 1 |
| 2 | Sélection sur 2 lignes → **mots collés** en vrai Chrome : `BASEBloc`, `unIMC`, `lesirrationnels`, `c'estmieux!`. Sur une même ligne, les espaces sont bons (items « » du PDF) | **Haute** (copie) | 2 |
| 3 | Largeur des spans ≠ texte dessiné : médiane ×1,02, mais 20/108 items à >10 % d'écart, titre +60 px à 160 % → les surlignages débordent ou restent courts | Moyenne | 2 |
| 4 | Les items « espace » entre cellules d'un tableau couvrent toute la largeur de la cellule → un surlignage qui en contient un couvre du vide | Faible | 2/3 |
| 5 | Ordre du flux ≠ ordre visuel : l'encadré « Priorité des opérations » arrive après « Pièges fréquents » | Faible (texte complet seulement) | 4 |
| 6 | Texte des équations dégradé (`ฏ32 9 × 4 𝟑𝟔`), le MathML joint est propre | Faible | plus tard |
| 7 | ✓/✗ du tableau = images → cellules vides à l'export | Faible | — |

## Bonne surprise pour la copie (étape 4)
Grâce aux balises, pdf.js reconstruit les tableaux **exactement** :

```
[TABLEAU]
| Ensemble | Symbole | Définition | Exemple |
| Naturels | ℕ | Nombres entiers positifs, servent à dénombrer | 0, 1, 2, 3... |
| Réels | ℝ | Tous les nombres décimaux, incluant les irrationnels | π ; √2 ; 2.7 |
```

C'est le même format que `tableToText` (ficheToText.js). Si le PDF n'est pas balisé :
repli sur le texte ligne par ligne.
