# Compte rendu — harmonisation du lecteur PDF (21/10/2026)

Suite de la réparation du 21/10 (`docs/compte-rendu-pdfreader-reparation.md`). Objectif : une seule façon de
sélectionner, déplacer, redimensionner et régler chaque objet ; une seule implémentation des flèches ; un seul
composant de mini barre ; des contrôles entre / sur les pages à l'échelle du zoom ; la reprise d'un transcript
arrêté (section « Reprise de session » de `docs/compte-rendu-transcription-directe.md`). Tests sur une instance
locale isolée (Vite :5199 sans Supabase, Chrome headless en CDP) : aucune écriture Supabase.

## Audit de cohérence — AVANT (écrit avant de coder)

Vocabulaire : dans MedRevise, « commentaire » et « post-it » sont **le même objet**, la boîte (outil Boîte, icône de
bulle ; réduite, elle devient une pastille). La zone de texte (outil Texte) et le « ? » sont les deux autres objets de
texte.

Contextes : le PDF, le document éditable et la fiche jumelle affichent leurs pages avec le **même** composant
(`PdfPageContent`) ; la tablette est le même lecteur au toucher. Sur téléphone (< 760 px) le lecteur n'existe pas
(shell mobile) : le contexte « mobile » est donc le lecteur à sa plus petite largeur (760 px, tactile). Les colonnes
de contexte étaient déjà identiques entre elles — sauf la tablette, où trois gestes n'avaient pas d'équivalent
(marqués ✱). Les défauts sont surtout **entre objets** : chaque objet avait sa propre règle.

| Objet | Sélectionner | Déplacer | Redimensionner | Options affichées |
|---|---|---|---|---|
| Boîte (commentaire / post-it) | pas d'état « sélectionnée » : un clic ouvre l'édition | languette bleue au-dessus (boîte « un mot ») ou bandeau à poignée (boîtes d'avant) | coin bas droit seul | barre flottante : flèche, couleur, fond, réduire, supprimer |
| Zone de texte | un clic ouvre l'édition | languette au-dessus | coin bas droit seul (caché) | barre flottante : couleur, supprimer |
| « ? » | focus au clic | glisser n'importe où | — | croix au survol |
| Flèche d'une boîte | clic sur le trait | **impossible** (glisser le trait ne fait rien) ; le rond du bout seulement | — | rangée en haut de l'écran (BarreFleche) + croix flottante sur le trait |
| Flèche / ligne (Formes) | clic sur le trait | glisser le trait déplace la forme ; ronds aux bouts | — | barre flottante (Texte, Légende, couleur, supprimer) + rangée en haut |
| Rectangle, ellipse, triangle… | par le **tracé** seulement | par le tracé seulement | 4 coins | barre flottante : Texte, Légende, couleur, remplir, supprimer |
| Image | clic n'importe où | glisser n'importe où | 4 coins + poignée de rotation | barre flottante : 90°, premier plan, avancer, reculer, arrière-plan, supprimer |
| Trait de crayon | **non sélectionnable** | — | — | — |
| Surlignage | non sélectionnable (ancré au texte : se recolore / se retire en repassant au surligneur) | — (ancré) | — (ancré) | — |
| ✱ Tablette | appui long = point de flèche (au lieu du double-clic) | idem | idem | barres agrandies |

Implémentations en double relevées : 3 poignées de déplacement (languette, bandeau, aucune), 2 poignées de taille
(coin seul, 4 coins), 5 barres d'options codées à la main (boîte, zone de texte, forme, image, flèche en rangée),
2 façons d'afficher la croix « retirer » d'une flèche, 3 placements de barre (`placeBarre` de la boîte, `pf-actions`
de la forme, `pi-actions` de l'image), 2 rendus des points de contrôle (carrés `nb-ctl`), 2 jeux de bouts de flèche
(`nb-ancre` ronds, `pf-bout`), le bouton « Insérer une page » en pixels d'écran, le badge transcript en pixels
d'écran.

## Décisions

1. **Une règle de sélection** pour tous les objets (outil Sélection) : un clic sélectionne, cliquer-glisser n'importe
   où sur l'objet le déplace ; boîte et zone de texte : double-clic (ou clic quand elle est déjà sélectionnée) = édition
   du texte, Échap = sortie de l'édition (un 2ᵉ Échap désélectionne). Un état de sélection unique dans le lecteur.
2. **Un cadre de sélection** (`CadreSelection`) : contour 1,5 px d'accent + 4 poignées d'angle, les mêmes pour tous.
3. **Une mini barre** (`MiniBarre`) : un composant, une grammaire d'icônes, l'ordre apparence → actions → supprimer, le
   même placement (au-dessus, en dessous s'il n'y a pas la place, jamais sur l'objet).
4. **Une flèche** : connecteurs de boîte, flèches et lignes de l'outil Formes = le même composant, le même modèle
   (points de contrôle en fractions de page, droite / courbe), les mêmes gestes (trait = toute la flèche, point = ce
   point, extrémité = l'extrémité, qui se rattache à une boîte si on la relâche dessus) et la même mini barre.
5. **Contrôles à l'échelle** : bouton d'insertion et badges posés sur / entre les pages dimensionnés en unités de
   page, bornés (≥ 18 px de haut, sinon une fine ligne « + »).
