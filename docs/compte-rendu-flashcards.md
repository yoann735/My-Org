# Compte-rendu — Flashcards

## Carte Muscle (08/10/2026)

Nouveau type de flashcard pour l'anatomie des muscles :
- **recto** : le nom du muscle ;
- **verso** : un tableau à 5 lignes fixes, dans cet ordre : Origine · Direction des fibres / Trajet · Insertion · Action · Innervation.

### Utilisation

**Créer une carte**
- Dans un cours, panneau **Exercices › Flashcards › + Ajouter**, le sélecteur propose désormais **Texte · Image · Muscle**.
- En choisissant **Muscle**, le formulaire affiche :
  - le champ **Nom du muscle** ;
  - le tableau, avec ses 5 lignes déjà étiquetées ;
  - les champs Thème, Indice et À retenir, comme pour les autres cartes.
- Raccourcis du tableau :
  - **Entrée** = retour à la ligne ;
  - **Tab** / **Maj+Tab** = ligne suivante / précédente (depuis le nom, Tab va à Origine) ;
  - **⌘Entrée** = enregistrer ;
  - **Échap** = fermer.
- Chaque zone de texte grandit avec son contenu : rien ne se chevauche, ni à la création ni en modification.
- **Puces collées depuis un slide** : les puces PowerPoint/Word (« • », « ◦ », « ▪ », « – », « - », « * », caractère privé U+F0B7…), suivies d'une tabulation ou d'un espace, deviennent « • ». En révision, elles s'affichent en vraie liste.
- **Une ligne peut rester vide** : elle s'affiche « — » en révision et n'est jamais masquée.

**Pré-remplir depuis une capture**
- Bouton **Pré-remplir depuis une image**, ou ⌘V de la capture du tableau, ou glisser-déposer.
- L'OCR existant (Tesseract.js de l'app, dans son Web Worker, sans aucun service externe) lit l'image et cherche les étiquettes Origine / Trajet (ou « Direction ») / Insertion / Action / Innervation.
- Le texte de chaque bloc est placé dans la bonne ligne, puces comprises. Si le nom est vide et qu'une ligne « m. … » figure au-dessus du tableau, elle remplit le nom.
- Une étiquette introuvable laisse sa ligne telle quelle. Une image sans tableau affiche un message, sans jamais d'erreur bloquante.
- Mises en page reconnues :
  - tableau à 2 colonnes, étiquettes en haut de cellule ou centrées verticalement ;
  - tableau horizontal (étiquettes en en-tête) ;
  - étiquettes en titres.
- Quand l'OCR rate le « • » (fréquent), la puce est retrouvée grâce au **retrait** du texte.

**Réviser une carte**
- **Recto** : le nom, grand et centré.
- **Verso** : le nom en petit titre, puis le tableau :
  - deux colonnes : étiquette grise en petites capitales à gauche, contenu à droite ;
  - lignes séparées par un filet fin ;
  - un contenu long défile **dans** la carte, sans jamais être coupé.
- Sur téléphone, le tableau occupe toute la largeur de la carte, avec une colonne d'étiquettes de 86 px.
- **Ligne par ligne** (actif par défaut) : au retournement, les contenus sont masqués (« Toucher pour révéler »).
  - Toucher une ligne révèle son contenu. La carte ne se retourne pas.
  - **Tout révéler (n)** affiche le reste.
  - Ce mode se désactive dans **Réglages › Apprentissage des flashcards › Carte Muscle : révéler ligne par ligne**. Le réglage est synchronisé entre appareils.
- La notation (Raté / Difficile / Facile, Su / Pas su) et la logique Apprendre / J ne changent pas : une carte Muscle compte pour une carte.

**Copier et exporter**
- Le bouton **Copier** d'une carte Muscle (liste du panneau) donne :

  ```
  m. Grand glutéal (fessier)
  Origine :
    • Face postérieure de l'ilium, en arrière de la ligne glutéale postérieure
    …
  Direction des fibres / Trajet : Oblique en bas et en dehors, fibres parallèles
  …
  Innervation : Nerf glutéal inférieur (L5, S1, S2)
  ```

- L'export du cours (`cartes_manuelles`) inclut ce même texte en `verso`, plus le champ `muscle`.

### Données et compatibilité (aucune écriture destructive)

Une carte Muscle est une flashcard **ordinaire** : `type: 'flashcard'`, même création (`appendItemsToFiche` → `toInternalItem`), même planning, même synchro (`medrevise_records`, une ligne par carte). Ce qu'elle a en plus est **additif** :

```js
{ recto: 'm. Grand glutéal (fessier)',
  verso: 'Origine :\n  • …\nDirection des fibres / Trajet : …',   // tableau mis à plat
  muscle: { v: 1, lignes: { origine, trajet, insertion, action, innervation } } }
```

- Le `verso` texte rend la carte lisible partout où le type n'est pas connu : ancien appareil pas encore mis à jour, carnet d'erreurs, recherche, export.
- Aucune carte existante n'est touchée et aucune migration n'est nécessaire.
- Aucun changement de schéma Supabase.
- Le réglage `muscleLigneParLigne` est une clé ajoutée à l'enregistrement `reglagesFC` (déjà synchronisé). Absent, il vaut « actif ».

**Fichiers**
- `src/medrevise/lib/muscle.js` : modèle, puces, mise à plat, décodeur du tableau OCR (pur, testé sous Node).
- `src/medrevise/components/FlashcardMuscle.jsx` : formulaire (création et modification) et tableau de révision.
- `src/medrevise/ocr/ocrMuscle.js` : OCR d'une capture.
  - Même moteur et même préparation que `ocrImage.js`, dont `preparer` est maintenant exporté.
  - Garde les puces en début de ligne.
- Branchements :
  - `CarteAjoutFlashcard.jsx` (3ᵉ onglet) ;
  - `AddItemForm.jsx` (modification) ;
  - `CourseItemsSidebar.jsx` (liste + Copier) ;
  - `Session.jsx`, `SeanceFC.jsx`, `MobileSession.jsx` (révision) ;
  - `Reglages.jsx` et `apprentissageFC.js` (réglage) ;
  - `courseExport.js`.
- Styles : préfixe propre `mu-*` (les `fc-*` sont partagés avec `fenetre-creation.css`), dans `etudes.css` et `medrevise-mobile.css`.
- Changement visuel volontaire dans `panneau-modes.css` : les 3 onglets ont un padding de 7 px au lieu de 10 px. Avec le 3ᵉ onglet, l'en-tête de la carte d'ajout débordait de 19 px dans le panneau de 342 px et créait une barre de défilement horizontale ; c'est corrigé.

### Tests (Chrome réel en headless piloté par CDP, Vite local, faux Supabase local — jamais le cloud)

Banc de test :
- deux Chrome isolés : « ordinateur » 1 440 × 900 et « téléphone » 390 × 844 tactile ;
- serveur Vite avec `VITE_SUPABASE_URL=http://localhost:54399` (`scripts/faux-supabase.mjs`) ;
- cours de test « Muscles de la hanche » (PDF) avec une carte Texte et une carte Image existantes ;
- capture de tableau de cours générée : `00-capture-du-cours.png`.

Ce banc est simulé : ce n'est pas une capture de ton cours. Le jour où tu colles une vraie capture, le décodeur pourra demander un ajustement (voir Limites).

| Scénario | Résultat |
|---|---|
| Sélecteur « Texte · Image · Muscle », 5 lignes étiquetées dans l'ordre | ✅ |
| Nom, puis **Tab** → Origine ; vrai **⌘V** (presse-papier système) d'un contenu de slide à puces U+F0B7 + tabulation → 3 lignes « • » | ✅ |
| Tab Origine → Trajet → … → Innervation ; **Entrée** = retour à la ligne (3 lignes dans Action) | ✅ |
| Aucune zone tronquée ni chevauchement (création et modification) | ✅ |
| **⌘Entrée** : carte enregistrée (une seule), formulaire vidé, focus sur le nom pour enchaîner | ✅ |
| Liste du panneau : tableau compact ; **Copier** → texte structuré (lu dans le presse-papier) | ✅ |
| Rouvrir en **modification** : nom et 5 lignes rechargés, correction enregistrée, carte non dupliquée | ✅ |
| **⌘V de la capture du cours** → « 5/5 lignes pré-remplies » en 1 à 3 s ; les 5 lignes et le nom sont exacts, puces comprises (dont celles que Tesseract n'avait pas lues) ; sauvegarde | ✅ |
| ⌘V d'une image sans tableau → message, lignes vides, rien de bloquant | ✅ |
| Ligne vide → « — » dans la liste et en révision, jamais masquée ; « Tout révéler (1) » | ✅ |
| **Séance Apprendre** (bureau) : présentation (tableau complet), test recto → verso 5 lignes masquées, tap Origine → révélée seule et la carte reste au verso, Tout révéler, Su ; la carte sort de l'apprentissage comme les autres (échéance J+1) | ✅ |
| **J+1** (horloge décalée) : la carte est dans les **Révisions** ; ligne par ligne ; notation Raté/Difficile/Facile inchangée ; Facile → échéance repoussée (moteur des J inchangé) | ✅ |
| **Séance classique** (carte qui se retourne) : verso masqué, tap sur une ligne → révélée, la carte ne se retourne pas ; Tout révéler ; Difficile appliqué | ✅ |
| Réglage décoché → verso complet d'emblée ; recoché → 5 lignes masquées ; valeur enregistrée dans `reglagesFC` | ✅ |
| **Synchro vers un 2ᵉ appareil** : le téléphone reçoit les 2 cartes Muscle, empreinte SHA-256 identique à l'ordinateur ; en retour, l'ordinateur reçoit l'état d'apprentissage fait sur le téléphone | ✅ |
| **Mobile** : séance Apprendre (FaceFC) et série du jour (MobileSession) — tableau pleine largeur, contenu qui défile dans la carte (rien de coupé), boutons de notation visibles, pas de défilement horizontal de la page | ✅ |
| Non-régression : création d'une carte **Texte** et d'une carte **Image + texte** (⌘V de l'image dans le volet Image, non intercepté par le volet Muscle) → enregistrements identiques à avant (pas de champ `muscle`) ; modifier une carte Texte → formulaire Texte habituel | ✅ |
| Non-régression au pixel : recto et verso d'une carte Texte en séance classique, avant (HEAD) et après → **PNG identiques octet pour octet** | ✅ |
| **MealWeek** : capture de l'accueil MealWeek avant et après → identiques octet pour octet ; `git status` : rien dans `src/mealweek/` ni `src/shared/` | ✅ |
| Erreurs console pendant tous les scénarios | aucune |
| `npm run build` | ✅ vert |
| `node scripts/tests-muscle/test-tableau.mjs` (vrais mots OCR de la capture, figés + tableaux simulés : étiquettes centrées, horizontal, étiquettes manquantes, entrées vides ; puces ; mise à plat) | ✅ 16/16 |

**Limites et doutes**
- **L'OCR a été validé sur une capture générée** (police nette, tableau à 2 colonnes) et sur des tableaux simulés, pas sur une vraie capture de ton cours.
  - Des slides très chargés (fond coloré, étiquettes en biais, cellules fusionnées) peuvent mal découper une ligne.
  - Le pré-remplissage reste un brouillon à relire : c'est le principe demandé.
- **Création sur téléphone** : le panneau Exercices n'existe pas sous 760 px (shell mobile de révision). La création se fait sur ordinateur ou tablette, comme pour les cartes Texte et Image.
- **Faux problème de synchro vu pendant les tests, puis compris** : en rechargeant un onglet avec l'horloge avancée d'un jour, des réponses de séance pas encore envoyées ont été écrasées par la version du cloud.
  - C'est le piège déjà connu des horloges décalées sur le banc.
  - Rejoué sans ce raccourci, avec un vrai 2ᵉ appareil : tout est parti au cloud et revenu à l'identique.
  - Rien à voir avec la carte Muscle.

### Captures

**Capture de cours utilisée pour l'OCR (générée)**

![capture du cours](img/flashcards-muscle/00-capture-du-cours.png)

**Création**

| Formulaire vide | Collé depuis un slide | Pré-rempli par l'OCR |
|---|---|---|
| ![](img/flashcards-muscle/01-creation-formulaire-vide.png) | ![](img/flashcards-muscle/02-creation-colle-depuis-slide.png) | ![](img/flashcards-muscle/03-creation-pre-remplie-par-ocr.png) |

| Modification (aucun chevauchement) | Liste du panneau (Copier, Éditer, Supprimer) |
|---|---|
| ![](img/flashcards-muscle/04-modification.png) | ![](img/flashcards-muscle/05-liste-du-panneau.png) |

**Révision — bureau**

| Recto | Verso complet (séance des J) |
|---|---|
| ![](img/flashcards-muscle/10-recto.png) | ![](img/flashcards-muscle/11-verso-complet-seance-J.png) |

| Ligne par ligne (Trajet révélé) | Tout révélé (séance classique) |
|---|---|
| ![](img/flashcards-muscle/12-ligne-par-ligne.png) | ![](img/flashcards-muscle/13-tout-revele-seance-classique.png) |

| Lignes vides « — » | Réglage |
|---|---|
| ![](img/flashcards-muscle/14-lignes-vides.png) | ![](img/flashcards-muscle/15-reglage.png) |

**Révision — téléphone (390 px)**

| Recto | Ligne par ligne | Verso long : défile dans la carte | Série du jour |
|---|---|---|---|
| ![](img/flashcards-muscle/20-mobile-recto.png) | ![](img/flashcards-muscle/21-mobile-ligne-par-ligne.png) | ![](img/flashcards-muscle/22-mobile-verso-defile.png) | ![](img/flashcards-muscle/23-mobile-seance-classique.png) |

### Commits

| Commit | Contenu |
|---|---|
| fde61e1 | `feat(medrevise)` : flashcard « Muscle » (création, OCR, révision ligne par ligne, réglage, copie, export) |
| c005f2d | `test(medrevise)` : décodeur du tableau Muscle (vrais mots OCR + cas simulés) |
| 3766856 | `docs(medrevise)` : ce compte-rendu et ses captures |
| 2ca4b1a | `docs(medrevise)` : liste des commits (dernier hash complété dans le commit qui suit) |

## Collage d'image au survol (11/10/2026)

**Le but** : coller une image (⌘V / Ctrl+V) **là où se trouve la souris**, sans passer par le
sélecteur de fichier. Ça vaut pour les cartes Muscle et pour la carte standard.

### Comportement

**Un seul écouteur de collage par formulaire** (`src/medrevise/lib/collerAuSurvol.js`). Quand le
presse-papiers porte une image, la cible est, dans cet ordre :

1. **La zone image survolée par la souris.**
   - Carte Muscle : une ligne du tableau, l'image du muscle, ou le bloc « Pré-remplir ». Coller sur
     ce bloc lance l'OCR du tableau, comme son bouton.
   - Carte standard : Recto → image affichée au recto, Verso → au verso, champ Image → image (place
     inchangée).
2. **Sinon, la zone du champ qui a le focus** : le texte d'une ligne Muscle, ou le recto / verso
   d'une carte standard.
3. **Sinon, la zone par défaut** : l'image du muscle, ou le champ Image de la carte standard.

**Autres règles :**
- **Traitement de l'image** : la zone la reçoit exactement comme par le bouton (même champ, même
  vignette, même enregistrement à la validation). L'**OCR « Texte en direct » démarre aussitôt**,
  affiché « Lecture du texte… » puis « Texte lu · N mots ». Le résultat est réutilisé par « Masquer
  des mots » et la visionneuse.
- **Remplacer** une image existante est **annulable** :
  - par ⌘Z / Ctrl+Z ;
  - ou par « Annuler » dans le message « Image remplacée dans … ».
  - Si l'on a retapé du texte dans un champ depuis le collage, ⌘Z dans ce champ annule le texte,
    comme d'habitude, et l'image reste.
- **Texte seul dans le presse-papiers** : aucune interception, collage normal dans le champ.
  - **Image + texte** (une image copiée sur le web arrive souvent avec du texte), focus dans un champ
    et aucune zone survolée : le texte est collé, comme avant.
  - Si une zone est survolée, c'est l'image qui y va.
- **Indication visuelle** (ordinateur à souris seulement) :
  - au survol, la zone prend un léger contour de la couleur d'accent et un libellé « ⌘V pour coller » ;
  - pendant le collage, un spinner court (au moins 300 ms) ;
  - puis la vignette apparaît.
- **Glisser-déposer** : même règle. L'image va dans la zone au-dessus de laquelle on la lâche ; hors
  de toute zone, règles 2 puis 3.

  **Ce qui change** : avant, une image lâchée ou collée sans ligne focalisée pré-remplissait le
  tableau par OCR. Ce pré-remplissage se fait désormais au survol du bloc « Pré-remplir » et par son
  bouton.
- **Tablette** (pas de survol) : règles 2 puis 3 au clavier externe, et un bouton **« Coller »** dans
  chaque zone, visible seulement sur écran tactile.
  - Il lit le presse-papiers avec `navigator.clipboard.read`.
  - Si le navigateur refuse : « Le navigateur a refusé l'accès au presse-papiers. Autorise-le dans
    les réglages du site, ou utilise « Image ». »
  - Si le presse-papiers n'a pas d'image : « Le presse-papiers ne contient pas d'image. »
- **Téléphone** : le shell mobile (< 760 px) n'a **pas de formulaire de carte**, il n'y avait donc
  rien à adapter.
- **Carte Molécule** : son formulaire **n'a pas de zone image** (seul l'éditeur de structure), il
  n'y avait rien à brancher.
- **Garde-fous** :
  - un formulaire masqué (la carte standard reste montée derrière la carte Muscle) ne prend jamais
    le collage ;
  - une zone survolée dans un autre formulaire non plus ;
  - le lecteur PDF ne pose pas l'image en plus sur la page.

**Fichiers :**
- `lib/collerAuSurvol.js` (nouveau) ;
- `components/CollageImage.jsx` (nouveau : bouton « Coller », message) ;
- `FlashcardMuscle.jsx` (zones `data-zone-image` / `data-zone-focus`) ;
- `ImagesMuscle.jsx` (bouton « Coller », OCR direct) ;
- `AddItemForm.jsx` et `FlashcardImage.jsx` (carte standard) ;
- `ocr/ocrImage.js` (résultat gardé pour une image pas encore enregistrée) ;
- `styles/muscle-images.css`.

Ni FSRS, ni le journal, ni la synchro, ni MealWeek, ni `src/shared/` n'ont été touchés : le contrôle
`git diff --name-only -- src/mealweek src/shared` ne renvoie rien. Aucune carte existante n'est
modifiée.

### Tests dans Chrome

Le banc est dans `scripts/tests-collage/`. Il tourne sur un **profil de test** restauré depuis la
sauvegarde, avec le faux Supabase local, jamais le vrai cloud. Il envoie de vrais événements
souris, toucher et clavier, et un vrai ⌘V (presse-papiers autorisé).

| Test | Résultat |
|---|---|
| **Ordinateur** (`t-bureau.mjs`, 17/17) : survol d'Insertion → contour + « ⌘V pour coller » ; ⌘V → image dans Insertion seulement, alors que le focus est dans le nom | ✅ (capture 01 → 02) |
| Survol de l'image du muscle, ⌘V → image générale | ✅ |
| Curseur dans le texte d'Origine, souris hors de toute zone, ⌘V → image d'Origine | ✅ |
| Texte seul collé dans Action → texte dans le champ, aucune image | ✅ |
| Remplacer l'image d'Insertion → message « Image remplacée… Annuler », puis ⌘Z → l'ancienne revient ; texte tapé après coup → ⌘Z annule le texte, l'image reste | ✅ (capture 03) |
| OCR démarré sur l'image collée (« Texte lu · 5 mots ») ; spinner pendant le collage | ✅ |
| Fichier déposé sur la ligne Trajet → image de Trajet | ✅ |
| Enregistrer → en base : Insertion, Origine, Trajet et image générale aux bonnes lignes (tailles vérifiées), Action sans image | ✅ |
| Carte standard : survol du recto → image au recto ; survol du verso → au verso (remplace) ; ⌘Z → image et place d'avant | ✅ (captures 04, 05) |
| **Rouvrir et réviser** (`t-relecture.mjs`, 6/6) : carte rouverte avec les images aux bonnes lignes ; bouton « Image » toujours là ; en séance, verso : images sur Origine, Direction des fibres / trajet, Insertion, plus l'image générale | ✅ (captures 06, 07) |
| **Tablette tactile** 820 px (`t-tactile.mjs`, 9/9) : un « Coller » par zone (6), pas de contour au doigt ; « Coller » d'Insertion → image d'Insertion ; clavier externe : focus Action → Action, rien de focalisé → image générale ; refus du navigateur → message clair ; presse-papiers sans image → message | ✅ (captures 08, 09) |
| **Synchro vers un 2ᵉ appareil** (`t-synchro.mjs`, 2/2) : profil vide, carte reçue, images aux mêmes lignes, fichiers identiques au SHA-256 | ✅ |
| Non-régression : `npm test` 26/26, build vert, 0 erreur JavaScript ; MealWeek s'ouvre (capture 10), 0 fichier MealWeek / `src/shared/` modifié | ✅ |

**Captures** (`docs/img/collage-survol/`) :

![Survol de la ligne Insertion : contour d'accent et « ⌘V pour coller »](img/collage-survol/01-survol-insertion.png)

![Image collée dans la ligne Insertion, OCR « Texte lu · 5 mots »](img/collage-survol/02-image-collee-insertion.png)

Autres captures :
- `03-remplacement-message.png` : message « Image remplacée… Annuler ⌘Z » ;
- `04-standard-survol-recto.png` et `05-standard-verso.png` : carte standard ;
- `06-carte-rouverte.png` et `07-revision-images.png` : carte rouverte, puis révision ;
- `08-tablette-coller.png` et `09-tablette-refus.png` : tablette ;
- `10-mealweek.png`.

### Commits

| Commit | Contenu |
|---|---|
| ae23efe | `feat(medrevise)` : coller une image (⌘V) dans la zone survolée — cartes Muscle et carte standard |
| bb490e5 | `docs(medrevise)` : section « Collage d'image au survol », captures, banc `scripts/tests-collage/` |
