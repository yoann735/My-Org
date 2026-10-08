# Compte-rendu — Cartes Molécule, OCR par zone, formulaire de carte unifié (08/10/2026)

Trois chantiers livrés et testés dans Chrome :

| Partie | Ce qui change |
|---|---|
| **A — Molécules** | Nouvelle carte : dessiner une molécule, puis la **reconstruire de zéro** en révision, avec une vérification chimique. Bibliothèque de biochimie embarquée (134 entrées). |
| **B — OCR** | Le texte des schémas d'une diapo qui a aussi une légende est enfin reconnu (cours « 1 Introduction, rappels, diversité (1) »). Une page en échec est réessayée une fois, puis signalée. |
| **C — Formulaire unifié** | Un seul formulaire de flashcard. L'image le transforme en carte image ; « + Tableau muscle » et « + Molécule » sont proposés à côté. |

Les cartes Molécule restent des flashcards normales (mêmes J, même mode Apprendre, même synchro). Seules la création et la révision changent.

---

## A. Cartes Molécule

### Éditeur et bibliothèque chimique retenus (licences)

**Retenu : OpenChemLib JS 9.25** (`openchemlib`, licence **BSD-3-Clause**, maintenu par cheminfo). Il fournit :
- l'éditeur `CanvasEditor` ;
- la chimie : SMILES, molfile, canonisation, MCS, rendu SVG.

**Ketcher 3.18** (Apache 2.0, premier choix demandé) a été **essayé puis écarté**, sur des mesures réelles dans un projet Vite à part :
- **Il ne démarre pas tel quel** : `require is not defined` à l'exécution. Il faut des polyfills Node (`events`, `process`…).
- **Son poids** : un bloc JavaScript de **29 Mo** (8,5 Mo compressé), avec le moteur Indigo en WASM. OpenChemLib pèse 1,1 Mo, plus 1,35 Mo de ressources.
- **Pas de thème sombre** : interface claire seulement.
- **Pensé pour la souris**, peu adapté au doigt.

OpenChemLib est l'alternative prévue par la consigne.

**Habillage de l'éditeur** (`src/medrevise/molecule/EditeurMolecule.jsx`) :
- **Barre d'outils compacte en français.** Elle pilote la barre native, cachée, par des clics synthétiques. Outils :
  - sélection, liaison (toucher une liaison : simple → double → triple), chaîne ;
  - coin plein, coin hachuré ;
  - cycles 5 et 6, benzène ;
  - atomes C, H, O, N, S, P, plus une palette F, Cl, Br, I, Si ;
  - charges + et −, gomme ;
  - annuler, rétablir, tout effacer ;
  - zoom −, zoom +, ajuster, redessiner.

  Réactions, requêtes, textes et modèles exotiques sont masqués.
- **Échelle adaptée au doigt.** Les liaisons font 1,6× l'échelle native à la souris, 2× au tactile. OpenChemLib lit cette échelle dans `devicePixelRatio` une seule fois, sur une toile hors écran.
- **Zoom et déplacement** : boutons, **pincement à deux doigts** (le trait commencé par le premier doigt est annulé), ⌘/Ctrl + molette. « Ajuster » ne fait que dézoomer, jamais au-delà de ×1, pour garder un trait net.
- **Annuler / rétablir** par instantanés : l'éditeur natif n'a pas de « rétablir ».
- **Thème sombre** : la toile est inversée (`invert` + rotation de teinte). Le fond devient sombre et les traits clairs ; O reste rouge et N bleu.
- **Chargement à la demande.** OpenChemLib, l'éditeur, la bibliothèque et la révision sont chacun dans un fichier à part.
  - Mesuré par le réseau (CDP) : **rien** n'est chargé au démarrage, ni dans Réviser, ni dans la Bibliothèque. Tout arrive à la première carte Molécule.
  - Bundle principal : **+3,5 Ko** (3 314 669 → 3 318 182 octets).

### Format de stockage

Une carte Molécule est une flashcard ordinaire avec un champ **ajouté** :

```js
{ type: 'flashcard', recto: 'Alanine', verso: 'Alanine — C3H7NO2 · SMILES C[C@@H](C(O)=O)N',   // textes de repli
  molecule: {
    v: 1,
    nom: 'Alanine',
    smiles: 'C[C@@H](C(O)=O)N',      // SMILES isomérique (stéréo) : la référence chimique
    molfile: '…V2000…',              // le dessin tel que tracé (réaffiché à l'identique)
    formule: 'C3H7NO2',
    sens: 'nom-molecule',            // ou 'molecule-nom' (recto = la molécule, verso = le nom)
    comparaison: 'constitution',     // ou 'stereo'
    biblio: 'ala',                   // entrée d'origine, ou null (dessinée de zéro)
  } }
```

`recto` et `verso` texte restent remplis. Un appareil pas encore à jour, l'export, le carnet d'erreurs et la recherche affichent donc une carte lisible. Il n'y a ni migration, ni changement Supabase, ni écriture destructive.

### Règle de comparaison

Elle est implémentée dans `src/medrevise/molecule/chimie.js` et testée par `scripts/molecules/test-comparaison.mjs`.

1. **Préparation.** On compare des copies sans H explicites, stéréo conservée. Les charges sont neutralisées (`canonizeCharge`) : COO⁻ / NH3⁺ ≡ COOH / NH2. Un état d'ionisation différent est **signalé**, pas compté comme faux.
2. **Niveau choisi sur la carte.**
   - **Constitution** (par défaut) : empreinte canonique **sans** stéréo (`CanonizerUtil.NOSTEREO`). D- et L-alanine, ou α- et β-glucose, sont acceptés ; une note précise que la stéréo diffère.
   - **Stéréo stricte** : empreinte canonique **avec** stéréo. D/L, R/S, α/β et cis/trans comptent. Un centre non défini est refusé.
3. **Différences**, si la molécule n'est pas identique.
   - Plus grande sous-structure commune (MCS, OpenChemLib). Tout atome ou liaison hors MCS est surligné en rouge : « en trop » dans mon dessin, « manquant » dans la référence.
   - Les formules brutes des deux.
   - En stéréo stricte, chaque centre qui diffère (« Centre C : référence S, mon dessin R ») et les doubles liaisons E/Z.
4. **C'est une aide, pas un juge.** « Terminé — noter » referme l'atelier ; la notation (raté / difficile / facile, su / pas su) reste ta décision.

### Bibliothèque embarquée

**134 entrées** dans `src/medrevise/molecule/bibliotheque.json`. Chaque entrée a : nom FR, synonymes, catégorie, SMILES stéréo, formule, dessin de référence (molfile).

| Catégorie | Entrées | Contenu |
|---|---|---|
| Acides aminés | **44** | Les 20 protéinogènes en forme **L**, chacun en **forme neutre et zwitterion** (40), plus sélénocystéine et pyrrolysine (4). |
| Oses | **26** | Glycéraldéhyde D et L ; ribose, désoxyribose, xylose, arabinose (L), glucose, mannose, galactose, fructose en **forme linéaire (Fischer)** et en **cycliques α et β (Haworth)**. Pyranoses : glucose, mannose, galactose, xylose, arabinose. Furanoses : ribose, désoxyribose, fructose. |
| Disaccharides et polysaccharides | **7** | Saccharose, lactose, maltose, cellobiose ; motifs à 3 glucoses : amidon (amylose), cellulose, glycogène ramifié (α1→4 et α1→6). |
| Bases, nucléosides et nucléotides | **21** | A, G, C, T, U ; 4 nucléosides et 4 désoxynucléosides ; AMP, ADP, ATP, GTP, dATP, dGTP, dCTP, dTTP. |
| Coenzymes | **6** | NAD⁺, NADH, FAD, coenzyme A, acétyl-CoA, succinyl-CoA. |
| Lipides | **9** | Acides palmitique, stéarique, oléique, linoléique, arachidonique ; glycérol ; triglycéride type (tripalmitine) ; phospholipide type (phosphatidylcholine) ; cholestérol. |
| Métabolisme | **21** | Pyruvate, lactate ; glycolyse (G6P, F6P, F1,6BP, DHAP, GAP, 1,3-BPG, 3-PG, 2-PG, PEP) ; cycle de Krebs (citrate, isocitrate, α-cétoglutarate, succinate, fumarate, malate, oxaloacétate) ; urée, créatine, créatinine. |

**Les dessins de Fischer et de Haworth sont générés avec une stéréo exacte** (`scripts/molecules/gabarits.mjs`) :
- **Fischer** : substituants horizontaux en coins pleins, ce qui est la convention même de la projection.
- **Haworth** :
  - on construit le **modèle 3D** réel (cycle à plat, substituants au-dessus et au-dessous) ;
  - OpenChemLib calcule les parités en 3D ;
  - puis on pose la perspective de Haworth en 2D, avec les coins qui expriment ces parités.

  Les règles « droite en Fischer = bas en Haworth » et « α = OH anomérique en bas pour un sucre D » sont validées sur l'α- et le β-D-glucopyranose (SMILES connus).
- **Disaccharides et polysaccharides** : unités assemblées sur des plans décalés, pour que chaque liaison osidique soit du bon côté.

**Test automatisé** (`node scripts/molecules/test-bibliotheque.mjs`) : **144 contrôles, tout vert**. Pour **chaque** entrée :
1. le SMILES se lit sans erreur ;
2. la **formule brute calculée = la formule attendue** ;
3. le dessin de référence est **la même molécule que le SMILES, stéréo comprise** ;
4. **aucun centre stéréo carboné non défini** ;
5. le **nombre de centres R / S** correspond au nom IUPAC, sur 91 entrées ;
6. le **nombre de doubles liaisons E / Z** est juste pour les acides gras et le fumarate ;
7. le **nombre de cycles** est juste pour les nucléosides, les nucléotides et les coenzymes (22 entrées).

Plus des contrôles indépendants (SMILES connus : α/β-D-glucopyranose, D-glucose ouvert, L-alanine) et la recherche (« dextrose » → glucose, « alanine », « glucose haworth β »).

Ce test a déjà rattrapé de vraies erreurs :
- les centres non définis de la 3ᵉ unité des polysaccharides (index d'atomes décalés par OpenChemLib) ;
- une **connectivité fausse dans FAD** (chiffre de fermeture de cycle réutilisé), invisible à la formule brute.

Il a aussi montré que le « centre » P des phosphates n'est pas à compter (oxygènes équivalents).

### Création d'une carte Molécule

Dans le formulaire unifié, **« + Molécule »** (voir la partie C) :
1. **« Nom de la molécule »** propose une autocomplétion sur la bibliothèque (nom, synonymes, catégorie, lettres grecques et accents tolérés).
2. Choisir une entrée met son nom au recto et **charge son dessin dans l'éditeur, modifiable**. On peut aussi dessiner de zéro.
3. Options : sens (nom → molécule / molécule → nom), comparaison (constitution / stéréo stricte), thème, indice, à retenir.
4. **⌘Entrée** enregistre.

La modification d'une carte Molécule rouvre ce même formulaire.

### Révision

- **Nom → molécule.**
  - Le recto montre le nom.
  - **Au retournement, l'atelier s'ouvre en plein écran, éditeur VIDE.** Je reconstruis la molécule, puis « Vérifier ».
  - Si elle est identique : verdict **vert**, et la référence s'affiche à côté de mon dessin.
  - Sinon : affichage côte à côte, avec les différences surlignées et le détail. Je corrige et je revérifie autant que je veux.
  - « Terminé — noter » referme l'atelier ; le verso résume le résultat (« Reconstruite correctement »).
- **Molécule → nom.** La molécule au recto, le nom au verso, retournement classique.
- **Mobile et tablette.** Atelier plein écran, barre d'outils compacte (une ligne défilante au téléphone, deux lignes en tablette), grande zone de dessin, pincement pour zoomer.

---

## B. OCR inactif sur « 1 Introduction, rappels, diversité (1) »

### Cause exacte

Le pipeline décidait **page par page** : dès qu'une page portait **30 caractères** de texte natif, elle était classée « natif » et l'OCR ne s'y faisait jamais.

Sur la **page 32** (« Monosaccharides », diapo des glucides) :
- le texte natif fait **457 caractères** : la légende « Monosaccharides. Les monosaccharides… » et le pied de page « From *Biologie*, P. H. Raven… » ;
- ce texte ne couvre que **14 %** de la surface de la page ;
- le schéma (Glycéraldéhyde, Ribose, Désoxyribose, Glucose, Galactose, CH₂OH…) est une **image** ;
- la page était donc « natif » et **aucun mot du schéma** n'était reconnu.

Le reste du cours n'était pas touché ainsi : seules les 4 pages **sans aucun** texte natif (30, 38, 42, 43) passaient à l'OCR.

Reproduit sur le banc avec **le vrai PDF** (copie de `~/Downloads/1 Introduction, rappels, diversité  (1).pdf`, 63 pages, SHA-256 `a6bb7a3f…`), avec l'ancien code :
- couche « complète », page 32 `natif`, **0 mot** ;
- dans le lecteur : 26 éléments de texte natif sur la page, aucun mot du schéma ;
- ⌘F « Désoxyribose » ne trouvait que la légende (1/3).

**Hypothèses écartées :**
- **Cours importé avant l'OCR, jamais passé dans la file rétroactive** : non. Le cours est mis en file à l'ouverture, et la couche était bien complète.
- **Empreinte du fichier changée par des annotations ou des pages ajoutées** : non. Les annotations et les pages ajoutées sont des enregistrements à part, le blob du PDF ne change pas.
- **OCR en échec sur cette page** : non, aucune erreur. La page n'était simplement jamais envoyée à l'OCR.

### Correctif

Fichiers : `ocr/pipeline.js`, `couches.js`, `service.js`, `pdf/pdfShared.js`.

- **Texte natif par zone.** Une page qui porte une **image** et dont le texte natif couvre **moins de 60 %** de la surface (union des boîtes de texte sur une grille) devient « **mixte** ».
  - Elle passe à l'OCR, et **seuls les mots hors des zones de texte natif sont gardés** : les étiquettes du schéma.
  - Une page « tout texte » sans image reste native, sans OCR : 11 ms.
- **Couche de texte et recherche.** Les mots OCR d'une page mixte sont ajoutés **après** les spans natifs. Les ancres des surlignages existants ne bougent donc pas. La recherche ⌘F et les mots-clés de transcription en profitent.
- **Couches existantes mises à niveau en fond.** Leurs pages « natives » de l'ancien traitement sont revérifiées par zone. Format additif (`mixte`, `pv: 2`) : les anciens appareils gardent leur affichage.
- **Échec.** Une page en échec est **réessayée une fois**, puis **signalée dans Réglages → Reconnaissance de texte** (« Pages en échec », avec « Relancer »). Le cours est retrouvé par l'empreinte du PDF, même quand la couche ne connaît pas son cours.

### Vérification (banc, vrai PDF)

- **Mise à niveau automatique** au rechargement : 110 s pour 63 pages. La page 32 devient `mixte` avec les mots Glycéraldéhyde, Ribose, Désoxyribose, Glucose, Galactose et « CH,OH » (lecture OCR de CH₂OH).
- **Page 32 dans le lecteur** :
  - « Désoxyribose » du schéma est dans la couche de texte ;
  - sélectionné à la souris puis copié avec ⌘C : le presse-papier contient « Désoxyribose » ;
  - **⌘F le trouve sur le schéma** (4 résultats au lieu de 3).
- **Panne simulée du moteur** :
  - si le moteur échoue au premier essai seulement, le **nouvel essai réussit** ;
  - s'il échoue toujours, la page est marquée en échec après 2 essais et apparaît dans les Réglages (« Scan muscle (test) — page 2 non reconnue (mémoire insuffisante) ») ;
  - « Relancer » reconnaît la page et la liste se vide.
- **Pas de régression.**
  - PDF tout texte sans image : reste natif, sans OCR.
  - PDF scanné sans texte : OCR complet, 72 mots par page.
  - Pages image du cours (30, 38, 42, 43) toujours reconnues.

**Chez toi :** l'extension Chrome n'était pas connectée pendant le chantier. Je n'ai donc rien lu de tes données. Au premier lancement de la version déployée sur ordinateur, la couche de ce cours (et celle des autres) sera mise à niveau toute seule, en fond.

---

## C. Formulaire de carte unifié

- **Plus de sélecteur « Texte · Image ».** Le formulaire contient recto, verso et une zone **Image** facultative (coller, glisser, parcourir).
- **Dès qu'une image est ajoutée**, la carte devient une carte image. Ses options apparaissent :
  - afficher au recto, au verso ou sur les deux faces ;
  - **« Masques à deviner… »**, qui ouvre l'éditeur de masques avec l'image, le recto, le verso et le thème.

  Les options purement texte (amorces, trous) s'effacent. **Retirer l'image ramène aux options texte.**
- **« Masquer des mots »** (nouveau, dans l'éditeur de masques) :
  - l'OCR existant lit l'image ;
  - on touche les mots à cacher ;
  - des mots voisins sur une même ligne forment un seul masque, dont la réponse est le mot.
- **« + Tableau muscle » et « + Molécule »** sont deux choix à côté du formulaire. Ils le transforment ; « Carte standard » revient au formulaire de départ. Il n'y a plus de sélecteur permanent.
- **Création et modification** utilisent le même formulaire, avec les mêmes aides.
  - Les **anciennes cartes texte et image** s'ouvrent dans le formulaire unifié.
  - Réenregistrées sans changement, **tous leurs champs sont identiques** (comparaison champ par champ, hors date de modification).
  - Le schéma ne change pas : `imageId` / `imagePlace` comme avant.
- **Aucun chevauchement.** Au passage, un vide de 170 px sous les options d'image, dans le panneau étroit, a été corrigé.

---

## Tests manuels (Chrome headless piloté par CDP, Vite local, faux Supabase — jamais le cloud)

Appareils simulés : ordinateur 1 440 × 900 ; tablette 820 × 1 180 tactile (pointeur grossier) ; téléphone 390 × 844 tactile.

| Scénario | Résultat |
|---|---|
| « + Molécule » → éditeur chargé à la demande, barre native cachée, toile pleine largeur | ✅ |
| Recherche « alan » → Alanine en premier ; chargée dans l'éditeur (C3H7NO2) ; recto pré-rempli | ✅ |
| Carte Alanine : SMILES + molfile + formule + sens + comparaison + `biblio` ; flashcard ordinaire avec recto/verso texte | ✅ |
| « glucose β » → β-D-glucopyranose (Haworth) ; **retouché** (gomme sur un H) : **stéréo conservée** ; renommé « Glucose – forme cyclique β-D-pyranose », stéréo stricte | ✅ |
| **Dessinée de zéro au clic** : liaison, branches, double liaison, N, O → glycine (C2H5NO2) ; annuler puis rétablir | ✅ |
| Rouvrir en modification (Alanine rechargée) ; passer en stéréo stricte, molécule inchangée | ✅ |
| **Synchro** vers le téléphone : cartes Molécule identiques (empreinte SHA-256 `b4e36f33…` des deux côtés) | ✅ |
| Révision Alanine : retournement → **atelier plein écran, éditeur vide** ; reconstruite au clic → **vert**, référence à côté | ✅ |
| **N à la place d'un O** → rouge, N en trop et O manquant surlignés des deux côtés, formules C3H8N2O / C3H7NO2 ; corrigé puis revérifié → vert | ✅ |
| **Constitution** : L (coin hachuré, S) et D (coin plein, R) **acceptées** | ✅ |
| **Stéréo stricte** : L **acceptée** ; D **refusée** (« Centre C : référence S, mon dessin R », centre surligné) | ✅ |
| « Terminé — noter » : verso « Reconstruite correctement », notation habituelle (je décide) | ✅ |
| Sens molécule → nom (ATP) : molécule au recto sans le nom, nom au verso, pas d'atelier | ✅ |
| **Tablette au doigt** : glucose cyclique de zéro en **16 gestes** (cycle à 6, 6 substituants, 6 O) → constitution juste (la stéréo stricte demande les coins) | ✅ |
| Tablette : annuler ×2 / rétablir ×2 au doigt ; **pincement à deux doigts** ×3,00 sans trait parasite ; Zoom −, Ajuster ; le toucher vise toujours le bon atome après zoom | ✅ |
| **Téléphone** : séance Apprendre — présentation (nom + molécule) ; atelier plein écran (zone 378 × 659, barre sur une ligne) ; alanine au doigt → vert ; « Terminé » → Su / Pas su | ✅ |
| Test automatisé de la bibliothèque | ✅ 144 contrôles |
| Test de la comparaison (alanine L/D, N↔O, zwitterion, liaison double, α/β-glucose, dessin vide, 134 références qui se reconnaissent) | ✅ 16/16 |
| Recherche par synonyme : « dextrose » → glucose | ✅ |
| OCR, page 32 du vrai cours : indicateur (« terminée ») ; texte du schéma sélectionnable et copiable ; ⌘F trouve « Désoxyribose » | ✅ |
| OCR : nouvel essai, puis signalement dans les Réglages, puis Relancer ; PDF tout texte et PDF scanné inchangés | ✅ |
| Formulaire unifié : carte texte → image (options image) → retirer → options texte ; masques par mots OCR ; carte texte simple ; Muscle et Molécule depuis le même formulaire ; anciennes cartes image et texte réenregistrées à l'identique | ✅ 16/16 |
| **Cartes existantes inchangées en révision** : recto et verso d'une carte Texte, avant (a0f168e) / après, **identiques octet pour octet** | ✅ |
| **Performance** : rien de chimique au démarrage (CDP Network) ; bundle principal +3,5 Ko | ✅ |
| **MealWeek** : accueil avant/après identique octet pour octet ; rien dans `src/mealweek/` ni `src/shared/` | ✅ |
| Erreurs console pendant tous les scénarios | aucune |
| `npm run build` | ✅ |

## Limites et doutes

- **Temps au doigt.** Les « moins de 2 minutes » sont estimés, pas chronométrés sur une vraie main. Le glucose cyclique demande **16 gestes**, soit environ 1 minute à 3–4 s par geste ; la simulation, elle, prend 3 s.
- **Stéréo stricte sur un sucre dessiné de zéro.** Il faut poser les coins pleins ou hachurés, comme en chimie. Un Haworth tracé sans coins a une bonne constitution mais une stéréo « non définie ».
- **Avertissements natifs de l'éditeur.** « unknown chirality », « this enantiomer » et les liaisons magenta sont dessinés par OpenChemLib ; son API ne permet pas de les masquer. Ils signalent un centre non défini.
- **Contrôles de stéréo des grosses molécules.** Les nombres R/S « IUPAC » couvrent 91 entrées. Pour FAD, NAD et les motifs de polysaccharides, seules la cohérence dessin = SMILES et l'absence de centre non défini sont vérifiées (les motifs sont construits avec les règles validées sur le glucose).
- **Bout réducteur.** Il est dessiné en β (maltose, lactose, cellobiose) ; tu peux le retoucher.
- **Réglages qui restent d'une carte à l'autre.** Le niveau de comparaison choisi reste pour la carte suivante dans la même série, comme le thème.

## Captures

### Formulaire unifié

| Carte texte | Une image ajoutée → options image | Masquer des mots (OCR) |
|---|---|---|
| ![](img/flashcards-molecules/01-formulaire-unifie-texte.png) | ![](img/flashcards-molecules/02-formulaire-unifie-image.png) | ![](img/flashcards-molecules/03-masquer-des-mots.png) |

| Masques posés (mots → masques) | Ancienne carte image rouverte |
|---|---|
| ![](img/flashcards-molecules/04-masques-poses.png) | ![](img/flashcards-molecules/05-ancienne-carte-image.png) |

### Création d'une carte Molécule

| Alanine (bibliothèque) | Glucose β (Haworth) | Dessinée de zéro |
|---|---|---|
| ![](img/flashcards-molecules/10-creation-molecule-alanine.png) | ![](img/flashcards-molecules/11-creation-glucose-haworth.png) | ![](img/flashcards-molecules/12-creation-dessin-de-zero.png) |

Dessins de référence de la bibliothèque (Haworth, disaccharides, motif de glycogène) :

![](img/flashcards-molecules/60-bibliotheque-dessins-de-reference.png)

### Révision

| Recto | Vérification réussie | Différences (N à la place d'un O) |
|---|---|---|
| ![](img/flashcards-molecules/20-revision-recto.png) | ![](img/flashcards-molecules/21-revision-reussie.png) | ![](img/flashcards-molecules/22-revision-differences.png) |

| Stéréo stricte : D-alanine refusée | Verso après vérification | Sens molécule → nom |
|---|---|---|
| ![](img/flashcards-molecules/23-stereo-stricte-D-refusee.png) | ![](img/flashcards-molecules/24-verso-apres-verification.png) | ![](img/flashcards-molecules/25-sens-inverse-recto.png) |

### Tablette et téléphone

| Tablette : glucose au doigt | Tablette : pincement ×3 |
|---|---|
| ![](img/flashcards-molecules/30-tablette-glucose-au-doigt.png) | ![](img/flashcards-molecules/31-tablette-pincement.png) |

| Téléphone : présentation | Atelier plein écran | Vérifié | Notation |
|---|---|---|---|
| ![](img/flashcards-molecules/40-mobile-presentation.png) | ![](img/flashcards-molecules/41-mobile-atelier.png) | ![](img/flashcards-molecules/42-mobile-verifie.png) | ![](img/flashcards-molecules/43-mobile-notation.png) |

### OCR (page 32 du cours)

| Avant (⌘F : 1/3, schéma non reconnu) | Après (« Désoxyribose » du schéma trouvé et sélectionné, 2/4) | Pages en échec dans les Réglages |
|---|---|---|
| ![](img/flashcards-molecules/50-ocr-avant-page-32.png) | ![](img/flashcards-molecules/51-ocr-apres-page-32.png) | ![](img/flashcards-molecules/52-ocr-pages-en-echec-reglages.png) |

## Commits

| Commit | Contenu |
|---|---|
| 75f3c17 | `fix(medrevise)` : OCR par zone, nouvel essai, pages en échec dans les Réglages |
| a0f168e | `feat(medrevise)` : formulaire de flashcard unifié, « Masquer des mots » par OCR |
| 633be09 | `feat(medrevise)` : cartes Molécule (éditeur, bibliothèque, révision, comparaison) |
| 66788c6 | `test(medrevise)` : bibliothèque de molécules et comparaison chimique |
| (ce commit) | `docs(medrevise)` : ce compte-rendu et ses captures |
