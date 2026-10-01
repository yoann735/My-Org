# Rapport de nuit — 4 octobre 2026 : tableau type Miro dans le lecteur PDF

**La v1 est faite, testée en vrai et poussée.** La mécanique est écrite d'abord dans
`docs/mecanique-miro.md`. Aucun point ne présentait de risque d'architecture : j'ai donc
enchaîné sur le code, étape par étape.

Tests sur un serveur local sans cloud :
- **dans ton Chrome** : sélection de texte du PDF, disposition, non-régression ;
- **dans un Chrome isolé** : gestes de souris réels et mesures image par image.

**Garanties :**
- **MealWeek : 0 fichier modifié** ;
- PDF d'origine intact (SHA-256 vérifié) ;
- 0 erreur console.

## La mécanique choisie (détail : `docs/mecanique-miro.md`)

- **Stockage.** Un nouveau store `tableau`, synchronisé comme le reste, avec **un
  enregistrement par carte et par flèche**, filtré par fiche. Il n'y a pas de gros
  document « tableau » unique :
  - déplacer une carte n'envoie qu'elle ;
  - deux appareils ne s'écrasent pas sur deux cartes différentes.

  **Vérifié dans le code :**
  - un appareil qui n'aurait pas encore la nouvelle version **ignore** ces lignes ;
  - la limite cloud de 200 000 lignes est très loin (environ 1 200 aujourd'hui).

  C'est réversible : un store en plus, aucune migration, aucune donnée existante
  réécrite. Le tableau est purgé avec sa fiche. La caméra et la disposition sont des
  préférences de l'appareil.
- **Canvas.** C'est du DOM transformé : un seul `transform` (translate + scale) déplace
  tout le « monde » du tableau, et un seul SVG porte les flèches.
  - **Pendant un pan ou un zoom**, la caméra est écrite directement sur le style, sans
    rendu React ; React ne reprend la main qu'au repos.
  - **La grille** est un fond CSS.
  - **Au-delà de 150 cartes**, celles hors de la vue ne sont pas affichées (culling).
- **Flèches.** Ancrées au milieu d'un côté (n/e/s/o), et recalculées à chaque rendu
  depuis la position **affichée** des cartes : elles suivent une carte pendant qu'on la
  déplace. Trois tracés :
  - **droite** ;
  - **coudée** (dure, angulaire, orthogonale) ;
  - **courbe** (souple, une Bézier qui prolonge les côtés).
- **Annuler** : une pile dédiée au tableau, avec la même mécanique que les annotations
  (affichage immédiat, donc aucun flash). La cible du clavier départage les deux
  historiques :
  - Cmd+Z dans le tableau n'annule rien du PDF ;
  - Cmd+Z hors du tableau n'annule rien du tableau.

  Vérifié dans les deux sens.

## Ce qui est codé et testé

| Commit | Étape |
|---|---|
| `7ddd452` | mécanique (`docs/mecanique-miro.md`) |
| `255f94e` | données : store `tableau` synchronisé, purge avec la fiche |
| `2ab547e` | canvas + cartes + flèches + disposition (étapes 3 et 4 regroupées : les flèches partagent les gestes des cartes) |
| `47d5f53` | création d'une carte depuis une sélection du PDF |
| `5a2b202` | confort et charge |
| `3839285` | correctif : barre du lecteur qui débordait (voir Bugs) |

**1. Canvas infini**

| Geste | Effet |
|---|---|
| molette ou deux doigts | se déplacer (pan) |
| Cmd/Ctrl + molette, ou pincement | zoomer, centré sur le curseur |
| Espace + glisser, outil Main (H), clic du milieu | se déplacer |
| « Tout afficher », − / + | régler le zoom |

La caméra est mémorisée par fiche.

**Mesuré avec 300 cartes et 150 flèches** : pan, zoom, pan dézoomé sur tout le tableau
et glisser d'une carte tournent à environ 60 images par seconde (médiane 17 ms, 95e
centile ≤ 19 ms). Seules 40 cartes sont affichées à la vue par défaut.

**2. Cartes de texte**
- **Créer** : double-clic sur le fond, touche N, ou bouton « + Carte ».
- **Écrire** : double-clic ou Entrée. Cmd+Entrée ou Échap pour terminer ; la carte
  grandit avec son texte.
- **Modifier** : déplacer, redimensionner (coin), couleur (4 couleurs « cours », blanc,
  et tes couleurs perso).
- **Autres actions** : dupliquer (Cmd+D), premier plan, supprimer (Suppr).
- **Sélection** : clic, Maj+clic, rectangle sur le fond, Cmd+A. Déplacement groupé,
  flèches du clavier (Maj = ×10).
- **Guides d'alignement** roses : aimantation sur les bords et centres des autres cartes,
  Alt pour s'en passer.

**Testé :**
- 2 cartes créées au double-clic avec leur texte ;
- sélection rectangle puis déplacement des deux ;
- couleur, redimensionnement, Cmd+Z puis Maj+Cmd+Z ;
- Suppr d'une carte, qui emporte sa flèche, puis Cmd+Z qui rend les deux ;
- texte gardé après un clic ailleurs, un clic sur une autre carte, et même quand le
  tableau est fermé **pendant** la frappe (brouillon sauvé, corrigé et vérifié).

**3. Flèches**
- **Créer** : au survol d'une carte, 4 points d'ancrage. On glisse l'un d'eux vers une
  autre carte : le côté le plus proche est choisi.
- **Style** : la barre de la flèche sélectionnée propose Droite / Coudée / Courbe, et
  la pointe (→ ↔ —).
- **Rediriger** : glisser un des deux bouts vers une autre carte.
- **Supprimer** : Suppr.

**Testé :** création, suivi pendant le déplacement d'une carte, passage en coudée,
redirection vers une 3e carte.

**4. Carte depuis une sélection du PDF.** En mode « Les deux », avec l'outil
**Sélection** : on sélectionne du texte, une bulle « ＋ Carte sur le tableau » apparaît
au bout de la sélection, et un clic crée la carte avec le texte copié (aucun lien retour
vers le PDF).

**Testé dans ton Chrome :**
- la carte est créée avec le passage sélectionné ;
- **aucun** surlignage n'est ajouté ;
- avec le **Surligneur**, la sélection surligne comme avant, et aucune bulle
  n'apparaît.

**5. Disposition.** La bascule **PDF · Les deux · Tableau** est dans l'en-tête, en haut
à droite.
- « Les deux » : poignée réglable, double-clic pour revenir à 50/50.
- « Tableau » : le PDF reste en mémoire ; on retrouve sa page (vérifié : 2/16 avant et
  après), et la barre ne garde que Retour et Panneau.
- La disposition est mémorisée par fiche.
- Proposé dans la Bibliothèque et dans le lecteur plein écran (Réviser, Prise de
  notes). L'Apprentissage et l'Anatomie, qui ont leur propre disposition, ne changent
  pas.

**6. Confort.** Annuler/rétablir, sélection multiple, guides d'alignement et raccourcis
(N, H, Espace, Cmd+A/D/Z, Suppr, Entrée, Échap, flèches).

## Bugs trouvés et corrigés

- **Barre du lecteur qui débordait dès 1 262 px** depuis l'outil Forme (la recherche et
  « Panneau » sortaient de l'écran). Elle se replie maintenant selon son débordement
  réel. Vérifié à 1 000, 1 200, 1 440 et 1 700 px.
- **Bascule de disposition poussée hors de l'écran** dans la barre d'outils : déplacée
  dans l'en-tête.
- **Texte d'une carte perdu** si le tableau se fermait pendant la frappe : brouillon
  sauvé au démontage.

## Non-régression du lecteur PDF

- Gestes d'annotation rejoués avec l'enregistreur de flashs : aucun retour en arrière
  (image, boîte, « ? », réduction, trait).
- Zoom du PDF inchangé : 0 image blanche.
- Surligneur, Cmd+Z des annotations : inchangés.
- Écrans : Accueil, Réviser, Bibliothèque, Carnet, Apprentissage, Prise de notes,
  Réglages, tous OK ; MealWeek OK.

## Ce qui reste, ou n'est pas fait par sécurité

- **Synchro du tableau** : testée hors cloud seulement, comme toujours la nuit. Elle
  emprunte le canal existant (un store de plus), mais **le premier vrai aller-retour
  entre deux appareils est à observer** quand tu l'utiliseras.
- **Texte des cartes** : texte simple, sans gras ni listes (v1). La flèche d'une carte
  vers un point vide n'existe pas : une flèche relie toujours deux cartes.
- **Pas de copier/coller** de cartes entre tableaux, ni de minicarte (vue d'ensemble).
- **Pas d'export** du tableau en image ou en PDF.
- **Mobile** : non testé, et les gestes tactiles du tableau ne sont pas travaillés.
- Les données de test (fiche « Charge tableau (test) », 300 cartes) ne sont que dans le
  Chrome isolé de test, pas dans ton app.
