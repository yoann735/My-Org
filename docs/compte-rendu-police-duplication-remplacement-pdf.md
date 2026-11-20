# Compte rendu — Taille de police · Dupliquer les objets au clavier · Remplacer un document par le PDF du prof

_20/11/2026 — MedRevise uniquement (MealWeek et `src/shared/` non touchés, vérifié au pixel). Aucune migration Supabase._

## 1. Taille de police (bug)

### Diagnostic : reproduit, puis cause racine

Reproduit dans Chrome, sur le code d'avant le chantier (`3957a7f`, servi tel quel sur un second Vite). Banc :
`scripts/tests-police-duplication-remplacement/t-police.mjs`, mesure = taille de police calculée × agrandissement
(`transform`, `scale`) × 1000 / largeur affichée de la page, donc en px de la page de référence de 1000 px.

| Cas (ordinateur) | Demandé | Rendu **avant** | Rendu **après** |
|---|---|---|---|
| Diapo — boîte dont le texte vient d'un collage (couche texte du diapo) | 24 px | **15,23 px** (inchangé) | 24 px |
| Document vierge — texte sélectionné | 14 px | 23,53 px | 14 px |
| Document vierge — texte sélectionné | 24 px | 40,34 px | 24 px |
| Document vierge — texte sélectionné | 32 px | 53,78 px | 32 px |
| Document vierge — texte par défaut (affiché « — » avant) | — | 21,01 px | 21 px (affiché « 21 ») |
| Diapo — texte libre / post-it / sélection dans une boîte / PDF A4 | 32 / 20 / 28 / 28 px | justes | justes |

Résultats bruts : `resultats/t-police-ordi-AVANT.txt` (6 échecs) et `resultats/t-police-ordi.txt` (tout vert).

**Cause 1 — les OBJETS (boîte, post-it, texte libre ; diapo comme document).** La taille choisie était bien
écrite (`taille1000` dans l'enregistrement) et bien posée sur le corps de la boîte
(`.nb-body { font-size: calc(var(--lp) * 2.4) }`). Mais le texte portait déjà **sa propre taille en dur** : une
marque TipTap `textStyle.fontSize` sur le `<span>` du texte. La règle du `<span>` l'emporte sur celle du corps,
donc le rendu ne changeait pas. Preuve (exploration, Chrome) : après « 24 px », l'enregistrement contient
`"taille1000":24`, mais aussi `"marks":[{"type":"textStyle","attrs":{"fontSize":"23.4px",…}}]`. Rendu : 23,4 px
écran sur une page de 1536 px, soit 15,23 px de référence au lieu de 36,86 px écran.
D'où vient la taille en dur :
- d'un **collage** : la couche texte du diapo pose `font-size: 28.8px` sur chaque `<span>`, et Word, Google Docs ou
  une page web font pareil ;
- ou d'une taille donnée avant à une **partie sélectionnée** (`calc(var(--lp) * …)` sur la sélection).

Une fois le texte marqué, le sélecteur de taille de l'objet n'avait plus aucun effet sur lui.

**Cause 2 — le TEXTE D'UN DOCUMENT créé dans l'app.** La page du document est mise en page à 595 px (A4), puis
agrandie à l'écran. La liste « … › Taille du texte » écrivait `setFontSize('24px')` en px de cette **mise en page**,
pas en px d'une page de 1000 px : « 24 » rendait 40,3 px de référence. Le texte par défaut (12,5 px de mise en page,
soit 21 px de référence) s'affichait « — ». Choisir 12, 13 ou 14 ne changeait presque rien à l'écran (20,2 / 21,8 /
23,5 px contre 21 px), ce qui donnait l'impression que le choix ne faisait rien. La liste était aussi cachée dans
« … », et n'était pas le sélecteur commun.

### Correction (à la racine)
- `lib/taillesTexte.js` (pur, testé) : `contenuSansTailles`, `contientTailles`, `sansTaillesCollees`,
  `px1000VersPage` / `pageVersPx1000`.
- **Objet** (`pdf/PdfPage.jsx`, mini barre) : choisir la taille de l'objet retire les tailles en dur de **tout** son
  texte. Boîte fermée : une seule entrée d'Annuler `{ taille1000, content }`. Boîte en écriture : retrait dans
  l'éditeur ouvert, puis `taille1000`. Avec une sélection, seule la sélection change, comme avant. Les boîtes-tableaux
  (texte dérivé de la grille) ne sont pas touchées.
- **Collage dans un objet** (`pdf/PdfReader.jsx`, éditeur des boîtes) : `transformPastedHTML` retire `font-size`.
  Couleur, police, gras, listes sont gardés.
- **Texte d'un document** (`pdf/FormatTexte.jsx`) : le sélecteur commun (`BoutonTaille`, le même que pour les objets)
  est en premier dans la mini barre du texte. Il est en px de référence (24 → `14.28px` de mise en page) et affiche la
  taille réelle du texte sélectionné (« 21 » pour le texte par défaut). Les marques existantes (« 24px ») ne sont pas
  réécrites : elles s'affichent dans la même unité (« 40 »).
- **Texte remplacé d'un diapo** (`PdfPage.jsx`) : le bouton affiche la taille choisie, plus seulement celle d'origine.
- `pdf/ChoixTaille.jsx` : valider au clavier rend le focus au texte. Le `blur` du champ réappliquait alors la même
  taille **pendant** la première application. Sur iPad, cela produisait l'erreur console
  `RangeError: Applying a mismatched transaction`. La dernière valeur choisie n'est plus réappliquée.

Mesure après correction : **taille demandée = taille rendue** sur ordinateur et iPad, document, diapo et PDF A4
(écart ≤ 0,05 px), et **après rechargement complet**.
Captures : `docs/img/police-duplication-remplacement/police-doc-24-avant-ordi.png`, `police-diapo-avant-ordi.png` (avant) ·
`police-doc-24-ordi.png`, `police-doc-24-tablette.png`, `police-diapo-ordi.png`, `police-diapo-tablette.png`
(après).

## 2. Dupliquer les boîtes d'annotation au clavier

`lib/copieObjets.js` (pur, testé), branché dans `pdf/PdfReader.jsx` (un seul moteur : PDF, document créé, fiche
jumelle).
- **⌘C / Ctrl+C** : copie l'objet sélectionné : boîte, post-it, boîte-tableau, texte libre, forme, flèche (forme),
  image, trait, « ? ». Le lecteur n'a **pas de sélection multiple** aujourd'hui (la sélection est un objet `{ kind, id }`).
  Le presse-papiers est malgré tout une liste : le jour où elle existera, tout le groupe sera collé, coin haut-gauche
  au pointeur.
- **⌘V / Ctrl+V** : colle **au pointeur** s'il survole une page (souris), sinon **décalé de 16 px** (px de la page de
  référence : 0,016 de la largeur ; chaque collage suivant décale encore). Fonctionne sur une autre page et dans un
  autre document (presse-papiers de l'onglet), y compris de l'original vers la fiche jumelle. Dans un document créé,
  une image collée devient un bloc du flux, comme toute image ajoutée (règle du 10/10).
- **⌘D / Ctrl+D** : duplique sur place, +16 px, et sélectionne la copie. Le raccourci du navigateur (signet) n'est
  bloqué **que** si un objet est sélectionné.
- **En écriture** (boîte ouverte, champ, tableau), ou avec du texte sélectionné sur la page : ⌘C / ⌘V / ⌘D gardent
  leur comportement normal sur le texte.
- **Une copie = un nouvel objet** : nouvel id, même contenu, même style (couleur, taille, bordure, image partagée).
  Elle n'est liée à rien : aucune flashcard ne la désigne (`source.boiteId` reste l'original), et les rattachements
  sont retirés (`formeId`, `imageId`, `surlignageId`, `boiteCible` des flèches). Ses flèches gardent leur dessin,
  décalées avec elle, sans cible.
- Presse-papiers du système : le texte des objets, plus un jeton dans le HTML. Si l'utilisateur copie autre chose
  ensuite (texte, image), ce contenu reprend la main au collage. Le collage d'images (⌘V d'une capture) est inchangé.
- Écriture : `cmdGroupe(cmdCreer…)`, donc annulable par ⌘Z, enregistrée tout de suite en local (`put`) et synchronisée.

Captures : `copie-boite-collee-*.png`, `copie-texte-en-ecriture-*.png`, `copie-autre-document-*.png`.

## 3. Remplacer un document créé par le PDF du prof

`lib/remplacerDocument.js` (plan pur, testé) + `pdf/RemplacerDocument.jsx` (confirmation), menu
**Fichier › Document original › « Remplacer par un PDF… »** (`pdf/MenuFichier.jsx`, infobulle).
- Le choix du fichier ouvre la confirmation : « Le document sera remplacé par `<fichier>` (`<N>` pages). Tes `<X>`
  annotations restent en place. Annulable dans l'Historique. » Le texte est vérifié mot pour mot par le banc.
- **Avant** : `putBackup` (fiche, annotations, surlignages, texte du document) et une **version de l'Historique**
  « Avant remplacement par « … » ». Cette version porte aussi la **fiche** (`lib/historiqueDoc.js` : `restaurerVersion`
  remet la fiche quand la version en contient une). **Après** : une seconde version.
- Le fond est remplacé par **toutes** les pages du PDF : même fiche, même id, même cours. Le PDF est rangé comme tout
  principal importé (`pdfId`), avec couche de texte et OCR par le même chemin.
- Annotations : **même numéro de page** (n-ième page du document → page n du PDF), **même position relative**
  (x, y gardés). Au-delà du nombre de pages du PDF, elles vont sur la dernière page. Un surlignage hors page (texte du
  flux) n'est pas touché.
- Les pages du document (`kind: 'page'`) passent dans un calque d'archive `<cours>::retire:<n>` : gardées, rien
  n'est supprimé. Le texte écrit dans le document (`notes_doc`) reste en base.
- Flashcards : liées par l'id de la boîte, inchangé. « Aller à la boîte » suit désormais la page **actuelle** de la
  boîte, plus celle notée sur la carte.
- Ordre des écritures : la fiche d'abord au remplacement, en dernier à la restauration, et les annotations relues
  avant la fiche après une restauration. Sinon, le lecteur voyait un instant un document sans page et en **créait
  une** : trouvé par le banc, un enregistrement en trop après la restauration.
- Correctif d'affichage trouvé par le banc sur iPad (antérieur au chantier) : dans l'Historique, le détail débordait
  sous la grille et la ligne « Historique sur cet appareil… » recouvrait le bouton « Restaurer »
  (`styles/enregistrement.css` : hauteur bornée, défilement interne).

Captures : `remplacement-menu-*.png`, `remplacement-confirmation-*.png`, `remplacement-avant-*.png`,
`remplacement-apres-*.png`, `remplacement-historique-*.png`, `remplacement-restaure-*.png`.

## 4. Tests

**Unitaires** (`npm test`) : `tests/tailles-texte` (7), `tests/copie-objets` (7), `tests/remplacer-document` (4),
tous verts. Suite complète : 335 / 337. Les 2 échecs (`crayon`, `emploi-du-temps/api`) échouent déjà sur
`3957a7f` : préexistants, hors chantier. **Build** : vert.

**Banc Chrome** (`scripts/tests-police-duplication-remplacement/`, `./tout.sh`, résultats dans `resultats/`) :
données de test seulement, faux Supabase remis à zéro avant chaque passage, Chrome headless aux profils neufs.
Ordinateur 1440×900 (souris), iPad 820×1180 (tactile, **clavier** pour les raccourcis, **stylet** pour tracer et
poser comme dans l'app), téléphone 390×844.

| Banc | Ordinateur | iPad (tactile + clavier) | Téléphone |
|---|---|---|---|
| `t-police.mjs` — tailles, document / diapo / PDF A4, rechargement | 25 ✅ 0 ❌ | 25 ✅ 0 ❌ | — (pas de lecteur) |
| `t-copie.mjs` — boîte, post-it, forme, flèche, texte libre ; ⌘C/⌘V au pointeur ou +16 px, autre page, autre document, ⌘D, ⌘Z, en écriture, synchro | 52 ✅ 0 ❌ | 51 ✅ 0 ❌ | — |
| `t-remplacement.mjs` — 2 pages + 5 annotations + carte → PDF 12 pages, restauration exacte | 28 ✅ 0 ❌ (téléphone compris : synchro) | 24 ✅ 0 ❌ | ✅ (reçoit le cours remplacé) |
| `t-nonreg.mjs` — outils du lecteur, fiche jumelle, enregistrement continu, synchro | 17 ✅ 0 ❌ | 17 ✅ 0 ❌ | — |
| `t-mealweek.mjs` — avant ↔ après | ✅ identique au pixel | ✅ identique au pixel | ✅ identique au pixel (*) |
| `t-police.mjs` sur le code **d'avant** (`BASE=http://localhost:5321`) | 6 ❌ (le bug, chiffres du §1) | | |

(*) Téléphone : la capture MealWeek a deux variantes de rendu, produites par le code d'avant **comme** par le code du
chantier (`resultats/t-mealweek-tel-empreintes.txt` : sur 4 passages, avant et après identiques au pixel 3 fois ; la
4ᵉ, chaque côté a tiré l'autre variante). Texte identique et 0 erreur console à chaque passage.

Aucune erreur console dans tous les passages après correction.

- **Téléphone** : l'app téléphone n'a pas de lecteur de cours. Les trois fonctions n'y existent donc pas. Vérifié :
  un document remplacé sur l'ordinateur arrive au téléphone par la synchro (même id, le PDF, les 5 annotations sur
  leurs pages), sans erreur console.
- **Non-régression du lecteur** (`t-nonreg.mjs`, ordinateur + iPad) : crayon, surligneur, forme, boîte (texte en
  base **pendant** l'écriture : enregistrement continu), Suppr puis ⌘Z, fiche jumelle (import, bascule
  Original ⇄ Fiche, calques séparés, copie de l'original collée sur la fiche), synchro (toutes les annotations au
  cloud, état « à jour »).
- **MealWeek** (`t-mealweek.mjs`, code d'avant ↔ code du chantier, sans cloud) : même texte, capture **identique au
  pixel** sur ordinateur, iPad et téléphone, 0 erreur console.
- **Non testé** : Safari / WebKit réel (iPad, iPhone). Sur iPad réel, un ⌘C sans texte sélectionné peut ne pas
  déclencher l'événement `copy`. Dans ce cas la copie reste dans l'onglet, et ⌘V la colle quand le navigateur ne
  propose rien d'autre (délai de 150 ms). Le chemin est codé, pas vérifié sur l'appareil.

## 5. Doutes et limites (décisions prises)
- Le **texte écrit dans le flux** d'un document remplacé n'est plus affiché : le fond est « entièrement remplacé ».
  Il reste en base, et « Restaurer » dans l'Historique le rend. Seules les annotations (objets) suivent sur le PDF.
- Un document créé **avec une fiche jumelle** : la correspondance des pages de la fiche visait les pages du document.
  À refaire si besoin (Fichier › Correspondance des pages…).
- Remplacement fait pendant que le même document est **ouvert sur un autre appareil** : la synchro peut livrer la fiche
  avant les annotations. L'autre appareil affiche alors un instant les anciennes pages comme « pages ajoutées »,
  sans perte.
- Les objets **copiés n'emportent pas** les rattachements (légende ↔ forme, texte ↔ image, flèche ↔ surlignage) :
  une copie posée ailleurs suivrait sinon l'original.

## 6. Commits
- `3e47cb5` fix(medrevise): taille du texte — la taille d'un objet vaut pour tout son texte, texte d'un document en px de référence
- `5d7f37a` feat(medrevise): copier / coller / dupliquer les objets d'annotation au clavier
- `7acebd5` feat(medrevise): « Remplacer par un PDF… » d'un document créé dans l'app
- `beee5ae` fix(medrevise): sélecteur de taille sans double application, bouton « Restaurer » de l'Historique atteignable sur iPad
- `06871a1` test(medrevise): banc Chrome taille de police, copier/coller/dupliquer, remplacer par un PDF, non-régression du lecteur, MealWeek
- ce compte rendu (docs)
