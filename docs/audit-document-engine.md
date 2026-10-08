# Audit du moteur de document (08/10/2026) — avant la refonte

**Conditions**
- Chrome headless piloté en CDP, avec de vrais événements souris, clavier et tactiles.
- Données locales, sans aucune écriture cloud.
- Bancs : `audit.mjs` (scénario « étudiant pressé »), `repro.mjs` (bugs signalés, isolés), `export-cmp.mjs` (écran / PDF).
- Le moteur audité est celui du 08/10 :
  - une page = une annotation `kind: 'page'` + **un éditeur ProseMirror par page** (`pdf/PageTexte.jsx`) ;
  - le texte de chaque page est stocké à part (`notes_doc.pages[idPage]`) ;
  - un « débordement » **déplace** les blocs qui dépassent vers l'éditeur de la page suivante.

## Scénario joué

1. Document neuf, puis 3 chapitres tapés : titre, 7 paragraphes de 3 lignes, une liste de 4 points chacun.
2. 6 images collées à divers endroits : diapo 1280 × 720, photo haute 600 × 1400, image très large 3000 × 400, image plus haute qu'une page 500 × 3000, petite 200 × 150, moyenne 800 × 600.
3. Déplacements :
   - la photo haute en haut de la page 1, qui est pleine ;
   - l'image géante en bas de la page 1 ;
   - la diapo dans l'espace libre de la dernière page.
4. Redimensionnement de la diapo, puis suppression de paragraphes au milieu.
5. Texte inséré avant une image.
6. ⌘Z ×3, puis ⌘⇧Z ×3.
7. Défilement rapide, fermeture / réouverture, export PDF comparé à l'écran page par page.

Journal relevé à chaque étape. On ne voit à l'écran que les pages montées : le rendu est virtualisé, d'où un parcours complet par défilement.

```
A. 3 chapitres tapés              pages 3 | images en base 0
B. « diapo » collée               pages 3 | images en base 1 | p1[1 img]
B. « haute » collée               pages 4 | images en base 2 | p1[1] p2[1] p3[0] p4[0]
B. « large » collée               pages 6 | images en base 3 | p1[1] p2[0] p3[1] p4[0] p5[1] p6[0]
B. « géante » collée              pages 7 | images en base 4 | … p7[0 img, DÉBORDE 38px]
B. « moyenne » collée             pages 9 | images en base 6 | … p8[2 img, DÉBORDE 24px] p9[0]
C2. « géante » déposée en bas p1  pages 9 | images en base 6 | à l'écran : 5 images sur 6
C3. diapo dans l'espace libre     pages 9 | images en base 6 | p1 absente du relevé
```

## Incohérences relevées

| # | Incohérence | Étapes pour la reproduire | Cause | État |
|---|---|---|---|---|
| B1 | **Image remontée sur une page plus haute : elle disparaît du champ, puis réapparaît sur une page plus bas après un défilement** (signalé) | Document de 4 pages, image en page 4. Zoom ~100 %. Sélectionner l'image, la glisser vers le haut de l'écran ; le défilement automatique remonte jusqu'à la page 1 ; relâcher en haut de la page 1. Mesuré (`repro.mjs`, « Repro avant 4 ») : **pendant le geste, l'image n'est plus dans le DOM**. Après relâchement, aucune image en page 1 ; la base la contient toujours, sur sa page d'origine, où elle réapparaît au défilement. | Le rendu virtualisé **démonte la page source** pendant le défilement : l'éditeur de cette page est détruit, et avec lui la vue de l'image qui portait le geste. Le dépôt est perdu, l'état réel reste celui de la base. | à corriger |
| B2 | **Image trop grande acceptée sur une page où elle ne tient pas** (signalé) | Coller ou déposer une image haute près du bas d'une page pleine : elle est acceptée dans la page, puis « débordée » plus tard (au chargement de l'image, à la frappe suivante…). En attendant, elle dépasse le bas de la page. Relevé : DÉBORDE 38 px (p7), 24 px (p8). | La page est un **conteneur** : on y dépose d'abord, et une vérification après coup (`verifierDebordement`, au rendu suivant) déplace ce qui dépasse. Entre les deux, et chaque fois que la vérification ne se relance pas (hauteur changée sans transaction), le contenu est coupé par le bas. | à corriger |
| B3 | **Pages à moitié vides, document qui s'allonge sans raison** | Coller 6 images dans 3 pages de texte. Résultat : 9 pages pour ~6 de contenu ; à l'export, la page 2 ne contient **qu'un paragraphe** (capture). | Le débordement ne fait que **repousser** vers la page suivante, jamais **rapatrier** : quand un bloc part, ce qui suit n'est pas remonté. Chaque collage crée de nouvelles pages et des trous qui ne se referment jamais. | à corriger |
| B4 | **Un paragraphe n'est jamais coupé entre deux pages** | Paragraphe de 3 lignes en bas d'une page avec la place pour 2 : il part entier, la page garde un trou. Un paragraphe plus long qu'une page reste rogné. | L'unité déplacée est le **bloc** entier (« un seul bloc plus haut que la page : il reste (rogné) »). | à corriger |
| B5 | **Export PDF : la structure ne correspond pas à ce qu'on attend** (signalé) | Le PDF reproduit page pour page la structure de l'écran (vérifié : 8 pages, mêmes blocs). Mais cette structure est elle-même incohérente (B3, B4). Avant le correctif de la veille, il ajoutait aussi une page blanche entre chaque page. | Pas de mise en page propre : l'export recopie des conteneurs mal remplis. | à corriger avec le moteur |
| B6 | **L'icône « texte détecté » des images s'imprime dans le PDF** | Document avec une image reconnue (OCR) → Exporter en PDF : l'icône est en bas à droite de l'image (capture p1). | Les éléments d'interface de la vue d'image (badge, poignées, barre) ne sont pas masqués à l'impression. | à corriger |
| B7 | **Un geste d'image peut être perdu ou partir ailleurs** | Pendant le scénario, l'image cherchée a disparu du DOM entre le clic et la saisie de sa poignée ; le clic suivant est tombé hors du lecteur. | Même cause que B1 : la vue de l'image vit dans l'éditeur d'une page, qui peut être démonté à tout moment par la virtualisation. | à corriger |
| B8 | **Deux sources de vérité pour le texte** | Le texte de chaque page est écrit dans `notes_doc.pages[id]`, et aussi gardé dans `corpsPages` (mémoire du lecteur). Une page démontée est réhydratée depuis `corpsPages`. Un débordement vers une page non montée écrit directement dans `corpsPages` et dans la base, sans éditeur. | Le lecteur et chaque éditeur tiennent chacun une copie. Ce qui est affiché dépend de qui a écrit en dernier, et du fait que la page soit montée ou non. | à corriger |
| B9 | **⌘Tab, ⌘A… font parfois zoomer le lecteur** (signalé) | Faire défiler au trackpad, puis appuyer sur ⌘ (⌘Tab, ⌘A) pendant que l'inertie continue → le document zoome. Reproduit en CDP : molette + modificateur Meta → zoom. | `onWheel` zoome si `ctrlKey` **ou** `metaKey`. Or ⌘ + molette n'est pas un geste de zoom sur Mac (le pincement arrive avec `ctrlKey`) : l'inertie d'un défilement, ⌘ enfoncé, devient un zoom. | à corriger |

## Cause racine architecturale

**Les pages sont des conteneurs dans lesquels on « dépose » du contenu, au lieu d'être le résultat d'une pagination calculée.**
- Chaque page a son propre éditeur et son propre stockage. Le « flux » n'existe pas : il est reconstitué par des déplacements de blocs d'un conteneur à l'autre, après coup (B2, B3, B4).
- Ces conteneurs sont **montés et démontés par le rendu virtualisé**. Tout ce qui vit dans un éditeur de page peut disparaître : un geste d'image, un état, une copie (B1, B7).
- L'état se resynchronise depuis une autre source : `corpsPages` ou la base, quand une page se remonte (B8).
- L'export ne peut qu'**hériter** de ces incohérences (B5).

**Refonte retenue** (détail dans `compte-rendu-document-engine.md`) :
- un seul flux ProseMirror pour tout le document ;
- des pages **calculées** par pagination déterministe ;
- l'éditeur n'est jamais virtualisé ;
- l'export clone ce même rendu page par page.
