# Compte rendu — séance par catégories, transcript, images, carnet (24/10/2026)

Cinq chantiers sur MedRevise, livrés, testés dans Chrome (ordinateur + téléphone/tablette), commités et poussés.
Base : `4e1cda8`. Liste des commits en fin de document.

Règles respectées : MealWeek et `src/shared/` non modifiés (vérifié par `git diff --stat 4e1cda8 -- src/mealweek src/shared` :
vide) ; aucune écriture Supabase (tous les tests sur un Vite local sans Supabase et un Chrome headless isolé) ;
la seule évolution du schéma cloud est un SQL **préparé, non appliqué** ; `putBackup` avant la conversion ; aucune
carte perdue (1 693 / 1 693 enregistrements) ; le mode Apprentissage n'est ni modifié ni utilisé
(`git diff 4e1cda8 -- src/medrevise/apprentissageLibre` : vide) ; FSRS : interrupteur inchangé (OFF), ombre et journal
continuent ; DA existante (jetons `var(--accent)`, `var(--card)`, `var(--border)`…, composants existants).

---

## 1. Transcript : rester où je suis

### Cause du bug

Dans `transcription/TranscriptPanel.jsx` (`ListeTranscript`), la pause du suivi automatique était décidée **par la
position**, jamais par le geste :

1. `surDefilement` testait d'abord « moins de **40 px** du bas » → *collé* ; la montée n'était testée qu'ensuite. Une
   ligne fait ~40 px : remonter d'une ligne (ou d'un cran de trackpad) laissait la liste « collée », et la publication
   suivante du texte provisoire (plusieurs fois par seconde) refaisait `scrollTop = scrollHeight` → retour en bas.
   **Reproduit sur l'ancien code** : geste de 15 px → `scrollTop` 1029 → 1044, pas de « Reprendre » (❌ dans le banc).
2. Un contenu qui **raccourcit** (le provisoire retiré juste avant l'arrivée de la ligne finale, une hypothèse
   réécrite plus courte) fait reculer `scrollTop` (le navigateur le borne) : l'événement `scroll` qui en résulte
   tombait « en bas » et **recollait** la liste sans aucun geste.
3. Au-delà de 150 lignes (liste virtualisée), la fenêtre de rendu reprenait à la pause une position `vue.haut`
   **périmée** : les cales au-dessus changeaient d'un coup → saut visible.
4. `content-visibility: auto` donnait aux lignes hors écran une hauteur provisoire (3,2em) qui changeait **hors de
   tout rendu React**, donc hors de toute compensation.

### Correctif

- **Pause sur geste**, quelle que soit la distance : molette / trackpad (`wheel`), doigt (`touchmove`), clavier
  (flèches, Page↑/↓, Début/Fin, Espace), barre de défilement native et la barre maison (poignée, piste, « ↑ Début »).
  La pause est posée **avant** que la vue ne bouge.
- **Vue figée au pixel** pendant la pause : ancrage manuel sur la ligne visible en haut (id + décalage), rétabli
  après **chaque** rendu et à chaque redimensionnement ; nos propres corrections ne redéfinissent pas l'ancre (sinon
  les résidus sous-pixel s'additionnent) ; **réserve de hauteur** en fin de liste pendant la pause (le contenu ne peut
  plus raccourcir, donc plus de recul de `scrollTop`) ; à la pause, la fenêtre virtuelle part de la position réelle ;
  en direct : `overflow-anchor: none` (pas de double correction) et hauteurs réelles (plus de gabarit
  `content-visibility`). Aucun `scrollIntoView`.
- **Reprise** seulement par « ↓ Reprendre » ou en redescendant soi-même tout en bas (≤ 2 px, geste récent, vers le
  bas) — un défilement dû au code ou au navigateur ne reprend jamais.

### Tests (session en direct réelle : faux Deepgram local + micro simulé)

`scripts/tests-seance-categories/t-transcript-defil.mjs` — critère VISUEL : la même ligne reste en haut de la vue au
même décalage (< 1 px), relevé à chaque mutation de la liste pendant l'attente.

| Étape | Ordinateur 1 440 × 900, molette (156 lignes : liste virtualisée) | Tablette 820 × 1 180, au doigt (61 lignes) |
|---|---|---|
| petit geste (15 px molette / 30 px doigt) | pause immédiate ✅ ; 20 s immobile, écart max 0,49 px, 9 lignes arrivées | pause ✅ ; 20 s, 0,00 px, 8 lignes |
| une ligne | pause ✅ ; **120 s immobile**, écart max 0,44 px, 47 lignes arrivées, « ↓ Reprendre · 47 nouvelles lignes » | pause ✅ ; **120 s**, 0,00 px, 47 lignes |
| 50 lignes | 60 s immobile, 0,00 px, 21 lignes arrivées | 60 s, 0,00 px, 24 lignes |
| « ↓ Reprendre » | collé en bas, suit les nouvelles lignes ✅ | ✅ |
| remonter puis redescendre tout en bas à la main | suivi repris ✅ | ✅ |
| erreurs JS | 0 | 0 |

Ancien code (HEAD `4e1cda8`, même banc) : geste de 15 px → ❌ pas de pause, la vue revient en bas (`scrollTop`
1029 → 1044). Les écarts résiduels (< 0,5 px) sont l'arrondi de `scrollTop` au pixel quand la liste virtualisée
recalcule ses cales au-dessus : invisibles. Au doigt, Chrome ne transmet pas les `touchmove` sous son seuil de
glissement (~15 px) — un tel geste ne fait rien défiler ; toute montée réelle juste après un toucher (inertie
comprise) met en pause.

Capture : `docs/img/seance-categories/sc-trx-pause.png` (pause, « ↓ Reprendre · N nouvelles lignes »),
`sc-trx-pause-tablette.png`.

> Vidéo YouTube : le banc ne peut pas lire une vraie vidéo YouTube avec un vrai Deepgram (pas de clé locale ; le relais
> vers la fonction de prod a déjà été refusé par le garde-fou de permissions, voir mémoire). La session est **réelle**
> côté app (WebSocket, provisoires plusieurs fois par seconde, lignes finales, virtualisation au-delà de 150 lignes),
> alimentée par `scripts/faux-deepgram.mjs` et une voix française enregistrée (`say`) comme micro. À rejouer en vrai
> sur une vidéo YouTube : remonter d'une ligne, attendre, la vue ne doit plus bouger.

---

## 2. Images collées : redimensionner et rogner

### Pourquoi ça ne marchait pas

- **Lecteur PDF et fiche jumelle** (`pdf/PdfPage.jsx`, `ImageCollee`) : depuis le commit `9c3a682` (21/10),
  `redimRect` y était **appelé sans être importé**. Chaque glisser d'un coin levait
  `ReferenceError: redimRect is not defined` (vu dans la console du banc, 10 fois par geste) : la redimension **et**
  le rognage (qui passait par les mêmes coins) ne faisaient rien. `vite build` ne signale pas une variable globale
  non déclarée. Confirmation sur les vraies données : 29 images collées, **aucune** jamais rognée.
- Une image rognée avait ses poignées **dans** le corps rogné (`overflow: hidden`) : coupées de moitié.
- Une image qui touche le bord de la page (fréquent : collée en 0,0, pleine page) avait la moitié extérieure de ses
  poignées coupée par le calque des images (`overflow: hidden`) ; sur la fiche jumelle, le coin bas-gauche tombait
  ainsi sur le calque de texte (introuvable).
- **Tableau** : redimension correcte mais ni rognage ni Maj = libre. **Document** : redimension correcte (éditeur
  actif), pas de rognage.

### Correctif — un seul composant

`lib/rognageImage.js` (+ `styles/rognage-image.css`), utilisé par les quatre contextes :

- **Cadre de rognage** `ouvrirRognage` : posé sur `document.body` en position fixe, calé sur l'écran de l'objet (aucun
  `overflow: hidden` ni zoom ne peut le couper ou le décaler). L'image entière est montrée en transparence, la zone
  gardée en clair avec 4 poignées d'angle (le centre se glisse) ; **Entrée valide, Échap annule** (✓ / ✕ au doigt),
  « Image entière » remet tout. Un appui hors du cadre valide.
- **Non destructif et réversible** : `rognage = { x, y, w, h }` = la partie visible en fractions de l'image entière ;
  le fichier n'est jamais modifié (`blobId` inchangé, vérifié) ; l'image entière reste exactement en place
  (`cadreApresRognage`). Une entrée d'annulation par rognage (⌘Z / bouton Annuler).
- **Redimension** : 4 poignées d'angle, proportions conservées, **Maj = libre** (`redimRectImage`) — lecteur, fiche
  jumelle, tableau ; le document garde son propre code de poignées (image en bloc dans le texte) avec la même règle.
- Lecteur : import corrigé, poignées hors du corps rogné, poignées ramenées au bord visible de la page.
- Document : attribut `rognage` sur le nœud image ; l'image entière est décalée et coupée (`clip-path`) sans changer
  la structure du cadre (OCR, notions, déplacement intacts) ; focus rendu à l'éditeur après validation (⌘Z suivant).

### Tests (copie des vraies données, profil isolé)

| Contexte | Banc | Résultat |
|---|---|---|
| Lecteur (image réelle p. 95 d'« Introduction 26 27 ») + fiche jumelle (image collée sur la fiche, calque `::fiche:2`) | `t-images-lecteur.mjs` | 34/34 ✅ : 4 coins, proportions, Maj libre, ⌘Z × 4, Rogner → Entrée, même fichier, 4 poignées entières sur image rognée, redimension d'une image rognée, Échap, Image entière, ⌘Z × 2 |
| Document « TD 2 Doc » | `t-images-document.mjs` | 18/18 ✅ (mêmes contrôles ; image entière conservée autour du cadre visible) |
| Tableau du cours | `t-images-tableau.mjs` | 15/15 ✅ |
| Tablette 820 × 1 180 au doigt (lecteur + tableau) | `t-images-tablette.mjs` | 11/11 ✅ (poignées tactiles 18 px, ✓ / ✕, bouton Annuler) |

Le document n'existe pas dans le shell téléphone (< 760 px) : le « mobile » des images est la tablette.

Captures : `docs/img/seance-categories/img-lecteur-rognage.png` (cadre de rognage), `img-lecteur-rognee.png`,
`img-fiche-jumelle-rognage.png`, `img-document-rognage.png`, `img-document-rognee.png`, `img-tableau-rognage.png`,
`img-tableau-rognee.png`, `img-tablette-rognage.png`.

---

## 3. Trois catégories de cartes

`lib/categoriesFC.js` (pur, `tests/categories/categories.test.js`) :

- **Nouvelle** : flashcard jamais notée en révision (aucun `historique[].qualite`) et pas « passée en révision »
  (`nouvelle !== false`). **Pas de date** : `planning.js nextDate` renvoie `null` → jamais due, jamais en retard
  (calendrier, rattrapage et séries comprises) ; elle attend le prochain bloc Nouvelles. Lecture dérivée : une carte
  pas encore marquée est déjà lue comme Nouvelle. Les flashcards créées ensuite naissent `nouvelle: true`.
- **Révisions** : date de révision = aujourd'hui. **Retard** : date passée non faite, triées du plus en retard au
  moins en retard.

### Conversion (une fois, idempotente, après `putBackup`)

Migration `conversion-nouvelles-v1` (`lib/migrate.js`, après la synchro de démarrage, même patron que la conversion
du mode Apprentissage) : `putBackup('pre-conversion-nouvelles-v1-<horodatage>', cartes concernées)` **puis** ajout de
`nouvelle: true` + `conversionNouvelles: { version, le, dueDateAvant }`. Rien n'est retiré ni réécrit : la date de
départ (`dueDate`, `j0Date`) reste en base. Idempotente par carte (rejouée à chaque démarrage, elle ne marque que les
retardataires) ; rapport dans meta `migration.conversion-nouvelles-v1`.

**Résultat sur les vraies données** (copie de l'IndexedDB du navigateur Aside du 24/10, restaurée dans un profil
isolé, lancée par l'app réelle — `t-conversion.mjs`, 9/9 ✅) :

| | |
|---|---|
| Flashcards | 1 004 (1 693 enregistrements « questions ») |
| **Converties en Nouvelles** | **270** — toutes étaient « en retard » (dates de départ du 09/10 au 17/10) |
| Gardent leur date (déjà révisées) | 734 — strictement intactes (date comprise) |
| Déjà marquées / sans date | 0 / 0 |
| Sauvegarde avant écriture | 270 cartes, état d'origine (`nouvelle` absent) |
| Cartes perdues · champs modifiés | 0 · 0 (seuls `nouvelle`, `conversionNouvelles`, `updatedAt` ajoutés) |
| 2ᵉ démarrage | aucune conversion (idempotente) |

Répartition par fiche : « Document sans titre » (archivée) 76 · « Fiche 1 » (archivée) 75 · « 02 macromolecules
biologiques » (archivée) 21 · « Chimie organique — L'électronégativité… » 10 · « Chapitre 2 » 10 · « Axe 1 Cellule et
compartimentation a » 9 · « Chimie — Les forces de dispersion de London » 7 · « … dipôle-dipôle » 6 · « … liaisons
hydrogène » 6 · « 2 2 Articulation du genou p2vf » 6 · « … VSEPR » 5 · 15 autres fiches (1 à 4 cartes). Sur des fiches
**planifiées** : 50 (ce que propose le bloc Nouvelles) ; les autres sont sur des fiches archivées ou sans rappels J.
Liste complète : **annexe en fin de document** (et, sur chaque appareil, meta `migration.conversion-nouvelles-v1`, champ `liste`).

Parmi les 270 : 230 viennent de l'ancienne conversion du mode Apprentissage (jamais notées depuis), 6 portaient
`learningDoneOn` et 7 `learningPresented` (vues dans l'ancien mode, jamais notées en révision) → Nouvelles, selon la
règle « jamais révisée ». À leur passage en révision, ces traces ne faussent pas FSRS (carte neuve, voir § 5).

---

## 4. Lancement d'une séance

`components/SeanceAujourdhui.jsx` (accueil mobile + Réviser) remplace l'ancien en-tête à un bouton :

- trois cases **Nouvelles · Révisions · Retard**, chacune avec son nombre disponible et un maximum (max 5, 10, 15 …
  100, Tout) ; seuls les types cochés entrent, dans l'ordre **Retard → Révisions → Nouvelles** ;
- raccourcis **« Bloc nouvelles »** (Nouvelles seules) et **« Révisions J »** (Révisions + Retard), maximums conservés ;
- dernier choix mémorisé (meta locale `seanceFC.choix`) ; l'en-tête « N cartes · ≈ M min » suit la sélection ;
- séance commencée le jour même : « Reprendre la séance commencée · N restantes » ; la composition choisie est
  figée (la reprise retire ce qui n'est plus à faire, n'ajoute rien).

Tests `t-seance.mjs` sur la copie des vraies données (Nouvelles 50 · Révisions 26 · Retard 73) :
**ordinateur 21/21 combinaisons** (7 combinaisons de cases × max 5, 15, Tout) et **téléphone 14/14** (× max 5, Tout) :
en-tête = somme des min(disponible, max), séance de cette taille, ordre des blocs, retards triés (du 10/10 au 17/10),
« 1 / N » ; raccourcis ; mémorisation après rechargement — tout ✅.

Captures : `docs/img/seance-categories/sc-lanceur.png` (Réviser, ordinateur), `sc-lanceur-mobile.png` (accueil).

---

## 5. Cycle d'une carte nouvelle

Au bloc Nouvelles (séance v3, carte encore Nouvelle) : recto → retourner → **deux boutons seulement** :

- **Garder en nouvelle** : rien n'est écrit ; elle revient au prochain bloc Nouvelles ;
- **Passer en révision** (`scheduler/noter.js passerEnRevision`) : `nouvelle: false`, **J0 = aujourd'hui**
  (`j0Date`), intervalle de départ, due au J suivant — elle entre dans le cycle des J comme une carte vue pour la
  première fois aujourd'hui ; aucune note inventée (historique vide) ; **état FSRS ombre initialisé à ce moment**
  (carte neuve, `state 0`, échéance = celle des J, même si la carte portait des traces de l'ancien mode
  Apprentissage) ; **événement journalisé** (`rating: null`, `details.evenement = 'passage_revision'`).

Révisions et Retard : les 4 boutons inchangés (étiquette « En retard » pour un retard).

Journal cloud : la table `medrevise_review_log` impose `rating` 1–4. Les événements sans note partent **à part**
(`journal/synchro.js`) : tant que `supabase/migrations/20261024_review_log_evenements.sql` (préparé, **NON appliqué**)
ne l'est pas, ils restent dans la file locale **sans bloquer** l'envoi des notes. Le rapport du mode ombre ne les
compte pas comme des réponses.

Tests `t-seance.mjs` (ordinateur 40/40 ✅, téléphone 33/33 ✅, passe finale après tous les changements) : carte nouvelle → 2 boutons ; Garder → carte inchangée, présente
au bloc suivant ; Passer → `j0Date` 2026-10-24, due 2026-10-25, `fsrs.state` 0, une entrée de journal
`passage_revision`, sortie des Nouvelles (50 → 49), dans les Révisions de demain ; Révisions J → 4 boutons, « Correct »
= date du moteur maison inchangée (10/10 → 01/11), journal (note 3, planificateur maison), FSRS ombre mis à jour.

Captures : `docs/img/seance-categories/sc-carte-nouvelle-mobile.png`, `sc-carte-nouvelle.png`.

---

## 6. Carnet d'erreurs en révision : minimal

`components/ActionsCarte.jsx` : la grande liste (et le formulaire « Autre… ») est remplacée par un petit menu :
pré-réponses en **puces sur 2 lignes au plus** (libellé court, complet en infobulle) + « Autre » ; **un tap crée
l'entrée et ferme** (toast « Ajouté au carnet · Modifier ») ; **« Ajouter une note »** replié, facultatif (la note part
avec la puce touchée ensuite). Téléphone : feuille du bas **186 px sur 844 (22 %)**, 196 px note dépliée, sans
défilement ; ordinateur : popover 380 × 138 px, 6 px sous l'icône. Lié à la carte affichée. Le toast précédent est
fermé à l'ouverture du menu (il recouvrait le bas de la feuille).

Tests `t-carnet.mjs` téléphone 8/8 ✅, ordinateur 7/7 ✅. Captures : `sc-carnet-mobile.png` (feuille du bas), `sc-carnet-note-mobile.png` (note dépliée), `sc-carnet.png` (popover).

---

## Non-régression

- `npm test` (vitest) : 97/98 — le seul échec, `tests/crayon/crayon.test.js › trois épaisseurs par mode`, échoue
  **déjà sur `4e1cda8`** (avant ce chantier). Deux tests de `tests/fsrs/donnees.test.js` ont été adaptés : les cartes
  jamais notées sont désormais des Nouvelles (sans date) ; toutes les autres cartes gardent des dates strictement
  identiques à l'ancien code (calendrier, série du jour, rattrapage sur 30 jours).
- J : notation maison inchangée (test « Correct » ci-dessus + vitest « 200 cartes : même prochaine date que l'ancien
  code ») ; FSRS ombre et journal : ✅ ; interrupteur FSRS non touché.
- Synchro (`t-synchro.mjs`, deux appareils, faux Supabase local avec la contrainte `rating` 1–4 du vrai cloud) : 8/8 ✅ —
  A (copie des vraies données) convertit au démarrage et envoie 270 cartes `nouvelle: true` ; B (profil vide) reçoit
  1 693/1 693 cartes dont 270 Nouvelles ; B passe une Nouvelle en révision et note une carte → A reçoit les deux
  (même `j0Date`, même date des J, même historique) ; la note part au journal cloud, l'événement reste en file sans
  rien bloquer, puis part quand la contrainte est levée (= SQL appliqué).
- Mode Apprentissage : aucun fichier de `apprentissageLibre/` modifié ; l'icône Apprentissage de la carte inchangée.
- MealWeek : `src/mealweek/` et `src/shared/` inchangés ; builds de production avant (`4e1cda8`) / après servis sur la
  même origine, MealWeek ouverte depuis le hub : 6 captures **identiques à l'octet** (SHA-256 `d75b91f383d54c76…`).

## Doutes / décisions prises

- « Jamais révisée » = jamais notée en révision : 13 cartes vues dans l'ancien mode Apprentissage (sans note de
  révision) deviennent des Nouvelles.
- « Passer en révision » : due au J suivant (J0 = la vue d'aujourd'hui), comme une carte vue pour la première fois.
- L'ancienne carte « Commencer la série » de l'accueil mobile (série du jour QCM + flashcards, `Session.jsx`) n'est
  pas ce lancement : laissée telle quelle (« rien d'autre que ce qui est listé »). Les Nouvelles n'y figurent plus
  (elles n'ont plus de date).
- Le toast du carnet couvre ~4,5 s le bas de l'écran au téléphone (déjà le cas avant) : non modifié.
- SQL à appliquer par Yoann pour que les événements « passage en révision » partent au cloud :
  `supabase/migrations/20261024_review_log_evenements.sql`.

## Commits

- `611e987` feat(medrevise): séance par catégories — Nouvelles · Révisions · Retard, conversion des cartes jamais notées, écran de lancement, cycle des Nouvelles
- `4e6f960` feat(medrevise): carnet d'erreurs en révision — petit menu (puces sur 2 lignes, un tap, note facultative repliée)
- `7627552` fix(medrevise): images collées — redimensionner (4 coins, proportions, Maj = libre) et rogner partout (lecteur, fiche jumelle, document, tableau)
- `fc6d241` fix(medrevise): transcript en direct — tout défilement de l'étudiant met le suivi en pause, vue figée au pixel
- (ce commit) docs + bancs : compte rendu, captures, banc de synchro, contrainte `rating` du faux Supabase

Bancs : `scripts/tests-seance-categories/` (`t-conversion`, `t-seance`, `t-carnet`, `t-transcript-defil`,
`t-images-lecteur|document|tableau|tablette`, `t-synchro`) ; tests purs : `tests/categories/categories.test.js`.

## Annexe — les 270 cartes converties en Nouvelles (vraies données, 24/10/2026)

Date de départ = `dueDate` conservée en base (plus lue). Fiche « (archivée) » : hors séance tant que la fiche est archivée.

| # | Fiche | Recto (début) | Date de départ | id |
|---|---|---|---|---|
| 1 | 02 macromolecules biologiques (archivée) | Acides aminés (monomères) → polypeptide (polymère) → repliement en une | 2026-10-11 | `qmumvxrq405zz` |
| 2 | 02 macromolecules biologiques (archivée) | Cite des exemples de glucides et de lipides. | 2026-10-11 | `qmumvxrq434ya` |
| 3 | 02 macromolecules biologiques (archivée) | Pourquoi certaines vitamines ont-elles besoin de graisses pour être ab | 2026-10-11 | `qmumvxrq43h9c` |
| 4 | 02 macromolecules biologiques (archivée) | Qu'est-ce qu'une macromolécule ? | 2026-10-11 | `qmumvxrq446q7` |
| 5 | 02 macromolecules biologiques (archivée) | En quoi consiste le rôle de signalisation des protéines ? | 2026-10-11 | `qmumvxrq44d2w` |
| 6 | 02 macromolecules biologiques (archivée) | Quel sucre dans l'ADN et dans l'ARN ? Que signifie « désoxy » ? | 2026-10-11 | `qmumvxrq46rvd` |
| 7 | 02 macromolecules biologiques (archivée) | Nucléoside vs nucléotide : composition ? | 2026-10-11 | `qmumvxrq4c5j9` |
| 8 | 02 macromolecules biologiques (archivée) | Quel est le monomère des protéines et quel polymère forme-t-il ? | 2026-10-11 | `qmumvxrq4k962` |
| 9 | 02 macromolecules biologiques (archivée) | Quels éléments chimiques compose la structure typique d'un acide aminé | 2026-10-11 | `qmumvxrq4mji5` |
| 10 | 02 macromolecules biologiques (archivée) | Qu'est-ce que le groupe R (chaîne latérale) ? | 2026-10-11 | `qmumvxrq4n3r3` |
| 11 | 02 macromolecules biologiques (archivée) | De quoi est constitué le glycogène ? | 2026-10-11 | `qmumvxrq4p3fq` |
| 12 | 02 macromolecules biologiques (archivée) | Quel est le rôle de l'ADN et celui de l'ARN ? | 2026-10-11 | `qmumvxrq4pr8u` |
| 13 | 02 macromolecules biologiques (archivée) | Exemple de monomère de l'ADN et de l'ARN ? | 2026-10-11 | `qmumvxrq4pvag` |
| 14 | 02 macromolecules biologiques (archivée) | Bases azotées et appariements de l'ADN et de l'ARN ? | 2026-10-11 | `qmumvxrq4rg5c` |
| 15 | 02 macromolecules biologiques (archivée) | Un triglycéride = trois acides gras connectés à un glycérol. | 2026-10-11 | `qmumvxrq4v4ch` |
| 16 | 02 macromolecules biologiques (archivée) | Quel est le rôle des enzymes ? | 2026-10-11 | `qmumvxrq4vr37` |
| 17 | 02 macromolecules biologiques (archivée) | Définis monomère et polymère. | 2026-10-11 | `qmumvxrq4wfhs` |
| 18 | 02 macromolecules biologiques (archivée) | Pourquoi les chaînes d'hydrocarbures sont-elles peu solubles dans l'ea | 2026-10-11 | `qmumvxrq4xzpf` |
| 19 | 02 macromolecules biologiques (archivée) | Quels sont les rôles des lipides ? | 2026-10-11 | `qmumvxrq4y7tg` |
| 20 | 02 macromolecules biologiques (archivée) | Différence entre graisse saturée et graisse insaturée ? | 2026-10-11 | `qmumvxrq4z3ip` |
| 21 | 02 macromolecules biologiques (archivée) | Quelles sont les fonctions principales de chaque famille de macromoléc | 2026-10-11 | `qmumvxrq4zskm` |
| 22 | 2 2 Articulation du genou p1 | Que cachent les masques ? | 2026-10-13 | `qmv70gsbiyfs3` |
| 23 | 2 2 Articulation du genou p1 | Que cachent les masques ? | 2026-10-13 | `qmv70lczcavmn` |
| 24 | 2 2 Articulation du genou p1 | Que cachent les masques ? | 2026-10-13 | `qmv70vsp2kdq1` |
| 25 | 2 2 Articulation du genou p2vf | Que cachent les masques ? | 2026-10-13 | `qmv73xh1uovzg` |
| 26 | 2 2 Articulation du genou p2vf | Que cachent les masques ? | 2026-10-13 | `qmv740y9c4jvv` |
| 27 | 2 2 Articulation du genou p2vf | Que cachent les masques ? | 2026-10-13 | `qmv741g1q8fwh` |
| 28 | 2 2 Articulation du genou p2vf | Que cachent les masques ? | 2026-10-13 | `qmv7431ai0zjm` |
| 29 | 2 2 Articulation du genou p2vf | C’est quoi : Ligament de Humphrey | 2026-10-17 | `qmvcm164zqt8j` |
| 30 | 2 2 Articulation du genou p2vf | C’est quoi : Ligament de Wrisberg | 2026-10-17 | `qmvcm1mji4qjf` |
| 31 | Axe 1 Cellule et compartimentation a | 3 principes de la Théorie cellulaire | 2026-10-17 | `qmvcgzgah0n7g` |
| 32 | Axe 1 Cellule et compartimentation a | C'est quoi le DAPI en microscopie ? | 2026-10-17 | `qmvch0fpb5lyr` |
| 33 | Axe 1 Cellule et compartimentation a | C’est quoi : distance de résolution ? | 2026-10-17 | `qmvch10vdko65` |
| 34 | Axe 1 Cellule et compartimentation a | Différence entre la cellule végétale et la cellule animale : | 2026-10-17 | `qmvch86rq1ks6` |
| 35 | Axe 1 Cellule et compartimentation a | Que cachent les masques ? | 2026-10-17 | `qmvchdgo1d24n` |
| 36 | Axe 1 Cellule et compartimentation a | de quoi est composé un phospolipides, et la polarité ? | 2026-10-17 | `qmvchlgkxfytj` |
| 37 | Axe 1 Cellule et compartimentation a | C’est quoi : Cryofracture | 2026-10-17 | `qmvchmgfg0b1k` |
| 38 | Axe 1 Cellule et compartimentation a | C’est quoi : Glycocalyx | 2026-10-17 | `qmvchnp2cfcn6` |
| 39 | Axe 1 Cellule et compartimentation a | Quels sont les Mouvements des phospholipides & des protéines dans la M | 2026-10-17 | `qmvchogr6432w` |
| 40 | Chapitre 2 | Communication pro : deux type de décision & role de l'émotion | 2026-10-17 | `qmvcldvon9t6l` |
| 41 | Chapitre 2 | Dans quels zones du cerveau sont produits les émotions | 2026-10-17 | `qmvclexjfmw38` |
| 42 | Chapitre 2 | Dans quelle zone du cerveau les émotions sont régulées | 2026-10-17 | `qmvclf82ruza2` |
| 43 | Chapitre 2 | C'est quoi des relation intra & inter personneles | 2026-10-17 | `qmvclg1253kj2` |
| 44 | Chapitre 2 | Quels sont les 4 fonctions interpersonnelles et leur role ? | 2026-10-17 | `qmvclkrikxa86` |
| 45 | Chapitre 2 | La méthode du kiné pour ajuster la relation ; | 2026-10-17 | `qmvclo2l5vxcu` |
| 46 | Chapitre 2 | C’est quoi : Désaccord | 2026-10-17 | `qmvcloxyhqr2e` |
| 47 | Chapitre 2 | C’est quoi : Frustration | 2026-10-17 | `qmvclpmus79gw` |
| 48 | Chapitre 2 | C’est quoi : Agressivité | 2026-10-17 | `qmvclq1a9wtr4` |
| 49 | Chapitre 2 | C’est quoi : Conflit | 2026-10-17 | `qmvclqxektbye` |
| 50 | Chimie — La polarité moléculaire | Dans la carte ESP, le rouge représentent quoi ? | 2026-10-11 | `qmt8et2chslzz` |
| 51 | Chimie — La polarité moléculaire | Dans la carte ESP, le bleu représentent quoi ? | 2026-10-11 | `qmt8etmag22i0` |
| 52 | Chimie — La théorie VSEPR et la géométrie des molécules | Théorie VSEPR : pour un atome central entouré de 4 groupes d'électrons | 2026-10-11 | `qmt8egori389a` |
| 53 | Chimie — La théorie VSEPR et la géométrie des molécules | Théorie VSEPR : quelle géométrie électronique impose la présence de 2  | 2026-10-11 | `qmt8egori7vzj` |
| 54 | Chimie — La théorie VSEPR et la géométrie des molécules | Théorie VSEPR : pour un atome central entouré de 4 groupes d'électrons | 2026-10-11 | `qmt8egoria76k` |
| 55 | Chimie — La théorie VSEPR et la géométrie des molécules | Théorie VSEPR : quelle géométrie électronique impose la présence de 3  | 2026-10-11 | `qmt8egorib2uv` |
| 56 | Chimie — La théorie VSEPR et la géométrie des molécules | Théorie VSEPR : quelle géométrie électronique impose la présence de 4  | 2026-10-11 | `qmt8egorifypx` |
| 57 | Chimie — Les forces de dispersion de London | Qu'est que la force de London ? | 2026-10-11 | `qmt8vg3rgou51` |
| 58 | Chimie — Les forces de dispersion de London | Comment fonctionne la force de London | 2026-10-11 | `qmt8vi1gqzbfi` |
| 59 | Chimie — Les forces de dispersion de London | Qu'est ce qu'un dipôle ? | 2026-10-11 | `qmt8vjakwqub4` |
| 60 | Chimie — Les forces de dispersion de London | Pourquoi deux atomes s'attirent avec les forces de London ? | 2026-10-11 | `qmt8vnmntsy5v` |
| 61 | Chimie — Les forces de dispersion de London | Chimie, forces de London : quel est l'effet d'un nombre d'électrons pl | 2026-10-11 | `qmt8vsult281c` |
| 62 | Chimie — Les forces de dispersion de London | Chimie : que mesure indirectement le point d'ébullition d'un corps pur | 2026-10-11 | `qmt8vsultlxr4` |
| 63 | Chimie — Les forces de dispersion de London | Chimie, forces de London : qu'est-ce que la polarisabilité ? | 2026-10-11 | `qmt8vsultnyb0` |
| 64 | Chimie — Les forces dipôle-dipôle | Chimie : lors de l'ébullition d'un corps pur moléculaire, à quoi sert  | 2026-10-11 | `qmt90s2hpbq46` |
| 65 | Chimie — Les forces dipôle-dipôle | Chimie : en quoi consiste une force dipôle-dipôle entre deux molécules | 2026-10-11 | `qmt90s2hpem19` |
| 66 | Chimie — Les forces dipôle-dipôle | Chimie : comment la masse molaire influence-t-elle les forces de Londo | 2026-10-11 | `qmt90s2hpfa4r` |
| 67 | Chimie — Les forces dipôle-dipôle | Chimie : que traduit un point d'ébullition élevé sur les interactions  | 2026-10-11 | `qmt90s2hpgsms` |
| 68 | Chimie — Les forces dipôle-dipôle | Chimie : par quel mécanisme naissent les forces de dispersion de Londo | 2026-10-11 | `qmt90s2hpj6cb` |
| 69 | Chimie — Les forces dipôle-dipôle | Chimie : quelle est la différence entre un dipôle temporaire et un dip | 2026-10-11 | `qmt90s2hpnawa` |
| 70 | Chimie — Les liaisons hydrogène | Chimie : la liaison hydrogène remplace-t-elle les autres forces interm | 2026-10-11 | `qmt90vn5x0o6w` |
| 71 | Chimie — Les liaisons hydrogène | Chimie : quelle est la nature de la liaison hydrogène par rapport aux  | 2026-10-11 | `qmt90vn5x2xiy` |
| 72 | Chimie — Les liaisons hydrogène | Chimie, forces intermoléculaires : qu'est-ce qu'une liaison hydrogène  | 2026-10-11 | `qmt90vn5xdozi` |
| 73 | Chimie — Les liaisons hydrogène | Chimie : comment est orienté le moment dipolaire d'une liaison entre u | 2026-10-11 | `qmt90vn5xo7f5` |
| 74 | Chimie — Les liaisons hydrogène | Chimie : dans une liaison entre un hydrogène et un atome très électron | 2026-10-11 | `qmt90vn5xtnok` |
| 75 | Chimie — Les liaisons hydrogène | Chimie : à quels atomes l'hydrogène doit-il être directement lié pour  | 2026-10-11 | `qmt90vn5xu48m` |
| 76 | Chimie générale et chimie organique | Les deux classes de la matière, et leur sous catégories | 2026-10-10 | `qmv29xg3mk303` |
| 77 | Chimie organique — L'électronégativité et la polarité des liaisons | Chimie : que signifie le mot polaire à propos d'une liaison ? | 2026-10-11 | `qmt8drm6d57d9` |
| 78 | Chimie organique — L'électronégativité et la polarité des liaisons | Chimie : quelle est la différence entre une liaison covalente polaire  | 2026-10-11 | `qmt8drm6d649h` |
| 79 | Chimie organique — L'électronégativité et la polarité des liaisons | Chimie : sur quelle échelle mesure-t-on l'électronégativité, et quelle | 2026-10-11 | `qmt8drm6dc76r` |
| 80 | Chimie organique — L'électronégativité et la polarité des liaisons | Chimie : quel type de liaison correspond à Δχ compris entre 0,5 et 1,7 | 2026-10-11 | `qmt8drm6dg89s` |
| 81 | Chimie organique — L'électronégativité et la polarité des liaisons | Chimie : quel type de liaison correspond à Δχ supérieur à 1,7 ? | 2026-10-11 | `qmt8drm6dl66o` |
| 82 | Chimie organique — L'électronégativité et la polarité des liaisons | Chimie : quel type de liaison correspond à Δχ inférieur à 0,5 ? | 2026-10-11 | `qmt8drm6dolvl` |
| 83 | Chimie organique — L'électronégativité et la polarité des liaisons | Chimie : quelle est la différence entre une liaison covalente non pola | 2026-10-11 | `qmt8drm6dpu0l` |
| 84 | Chimie organique — L'électronégativité et la polarité des liaisons | Chimie : dans une liaison covalente polaire, quel atome porte δ− et qu | 2026-10-11 | `qmt8drm6dt6wo` |
| 85 | Chimie organique — L'électronégativité et la polarité des liaisons | Chimie : comment calcule-t-on la différence d'électronégativité Δχ ent | 2026-10-11 | `qmt8drm6dyn3x` |
| 86 | Chimie organique — L'électronégativité et la polarité des liaisons | Chimie : classement complet des liaisons selon Δχ. Δχ 1,7 : liaison io | 2026-10-11 | `qmt8drm6dz5bv` |
| 87 | Document sans titre (archivée) | Pourquoi les chaînes d'hydrocarbures d'un triglycéride sont-elles peu  | 2026-10-11 | `qmupoupe80w9c` |
| 88 | Document sans titre (archivée) | D'où vient la diversité des protéines du vivant ? | 2026-10-11 | `qmupoupe82be7` |
| 89 | Document sans titre (archivée) | Rôle d'une enzyme ? | 2026-10-11 | `qmupoupe82rdj` |
| 90 | Document sans titre (archivée) | Appariements des bases : ADN A–T et C–G ; ARN A–U et C–G. | 2026-10-11 | `qmupoupe82wnj` |
| 91 | Document sans titre (archivée) | Les 4 classes de macromolécules ? | 2026-10-11 | `qmupoupe8376u` |
| 92 | Document sans titre (archivée) | Dans quels processus et organismes les protéines sont-elles impliquées | 2026-10-11 | `qmupoupe83lc6` |
| 93 | Document sans titre (archivée) | Quels éléments chimiques composent la structure typique d'un acide ami | 2026-10-11 | `qmupoupe843tr` |
| 94 | Document sans titre (archivée) | Bases azotées de l'ADN et de l'ARN ? | 2026-10-11 | `qmupoupe84my1` |
| 95 | Document sans titre (archivée) | Cytoplasme vs cytosol ? | 2026-10-11 | `qmupoupe84ty0` |
| 96 | Document sans titre (archivée) | Fonction des ribosomes et information qu'ils utilisent ? | 2026-10-11 | `qmupoupe8887n` |
| 97 | Document sans titre (archivée) | Qu'est-ce qu'un phospholipide et pourquoi est-il adapté aux membranes  | 2026-10-11 | `qmupoupe88lli` |
| 98 | Document sans titre (archivée) | L'ADN est un polymère : quelles en sont les briques ? | 2026-10-11 | `qmupoupe890r8` |
| 99 | Document sans titre (archivée) | Définition d'une protéine ? | 2026-10-11 | `qmupoupe8bde2` |
| 100 | Document sans titre (archivée) | Comment les phospholipides s'organisent-ils pour former une membrane ? | 2026-10-11 | `qmupoupe8byao` |
| 101 | Document sans titre (archivée) | Nucléoside vs nucléotide : composition ? | 2026-10-11 | `qmupoupe8cevs` |
| 102 | Document sans titre (archivée) | Sucre de l'ADN vs sucre de l'ARN ? | 2026-10-11 | `qmupoupe8cgh1` |
| 103 | Document sans titre (archivée) | Rôle de l'ADN vs rôle de l'ARN ? | 2026-10-11 | `qmupoupe8cx1o` |
| 104 | Document sans titre (archivée) | La phosphorylation est la greffe d'un groupe phosphate. | 2026-10-11 | `qmupoupe8d78v` |
| 105 | Document sans titre (archivée) | Les acides aminés sont les monomères qui forment les polymères appelés | 2026-10-11 | `qmupoupe8g0il` |
| 106 | Document sans titre (archivée) | Enchaînement de l'acide aminé à la protéine fonctionnelle ? | 2026-10-11 | `qmupoupe8itwe` |
| 107 | Document sans titre (archivée) | Que signifient les sigles ADN et ARN ? | 2026-10-11 | `qmupoupe8l7e8` |
| 108 | Document sans titre (archivée) | Glycolyse : définition et bilan ? | 2026-10-11 | `qmupoupe8mgd6` |
| 109 | Document sans titre (archivée) | Structure d'un phospholipide : glycérol + 2 acides gras + tête phospha | 2026-10-11 | `qmupoupe8mxks` |
| 110 | Document sans titre (archivée) | Qu'est-ce que le nucléoplasme ? | 2026-10-11 | `qmupoupe8nib7` |
| 111 | Document sans titre (archivée) | Qu'est-ce qu'un acide aminé par rapport aux protéines ? | 2026-10-11 | `qmupoupe8o0s9` |
| 112 | Document sans titre (archivée) | Graisse saturée vs insaturée : différence chimique et conséquence sur  | 2026-10-11 | `qmupoupe8smty` |
| 113 | Document sans titre (archivée) | Exemple de monomère de l'ADN et de l'ARN ? | 2026-10-11 | `qmupoupe8w8ba` |
| 114 | Document sans titre (archivée) | Qu'est-ce que le groupe R (chaîne latérale) d'un acide aminé ? | 2026-10-11 | `qmupoupe8wfs8` |
| 115 | Document sans titre (archivée) | Formule brute du glucose : C6H12O6. | 2026-10-11 | `qmupoupe8yl9h` |
| 116 | Document sans titre (archivée) | L'ADN est une double hélice, une sorte d'échelle torsadée. | 2026-10-11 | `qmupoupe8z9jq` |
| 117 | Document sans titre (archivée) | Définition de l'homéostasie ? | 2026-10-11 | `qmupoupe8zp6d` |
| 118 | Document sans titre (archivée) | Structure et orientation d'un glycolipide ? | 2026-10-11 | `qmupoupe90sxo` |
| 119 | Document sans titre (archivée) | Protéines membranaires intégrales : position et ancrage ? | 2026-10-11 | `qmupoupe92p1p` |
| 120 | Document sans titre (archivée) | Rôle du noyau ? | 2026-10-11 | `qmupoupe931iv` |
| 121 | Document sans titre (archivée) | Quels composants assurent la barrière semi-perméable, et lesquels le t | 2026-10-11 | `qmupoupe931qp` |
| 122 | Document sans titre (archivée) | Les protéines intégrales qui traversent la membrane de part en part so | 2026-10-11 | `qmupoupe94j8n` |
| 123 | Document sans titre (archivée) | Quels composants sont communs à toutes les cellules, procaryotes comme | 2026-10-11 | `qmupoupe94ox6` |
| 124 | Document sans titre (archivée) | Organites entourés d'une membrane : procaryote vs eucaryote ? | 2026-10-11 | `qmupoupe95m6l` |
| 125 | Document sans titre (archivée) | Rôle de l'appareil (corps) de Golgi ? | 2026-10-11 | `qmupoupe97tj4` |
| 126 | Document sans titre (archivée) | Rôle de la vacuole ? | 2026-10-11 | `qmupoupe98xpi` |
| 127 | Document sans titre (archivée) | Que sont les fimbriae (ou pili) ? | 2026-10-11 | `qmupoupe99sal` |
| 128 | Document sans titre (archivée) | Où se trouve l'ADN d'une cellule procaryote ? | 2026-10-11 | `qmupoupe9a6gi` |
| 129 | Document sans titre (archivée) | Définition d'un organite ? | 2026-10-11 | `qmupoupe9byxg` |
| 130 | Document sans titre (archivée) | Rôle du lysosome ? | 2026-10-11 | `qmupoupe9c4tx` |
| 131 | Document sans titre (archivée) | Quels organismes sont procaryotes, lesquels eucaryotes ? | 2026-10-11 | `qmupoupe9ci2t` |
| 132 | Document sans titre (archivée) | Où et à quoi sont attachés les glucides de la membrane ? | 2026-10-11 | `qmupoupe9dnh2` |
| 133 | Document sans titre (archivée) | Que sont les flagelles ? | 2026-10-11 | `qmupoupe9fea3` |
| 134 | Document sans titre (archivée) | Qu'est-ce que la capsule bactérienne ? | 2026-10-11 | `qmupoupe9fsia` |
| 135 | Document sans titre (archivée) | Rôle de la mitochondrie ? | 2026-10-11 | `qmupoupe9gh6j` |
| 136 | Document sans titre (archivée) | Rôle des chaînes de sucres à la surface des cellules ? | 2026-10-11 | `qmupoupe9h1ie` |
| 137 | Document sans titre (archivée) | Quelles cellules contiennent de l'information génétique, et sous quell | 2026-10-11 | `qmupoupe9hla0` |
| 138 | Document sans titre (archivée) | Effet des queues d'acides gras insaturées sur la membrane au froid ? | 2026-10-11 | `qmupoupe9i0za` |
| 139 | Document sans titre (archivée) | Protéines membranaires périphériques : position et attache ? | 2026-10-11 | `qmupoupe9javg` |
| 140 | Document sans titre (archivée) | Comment est organisée une cellule procaryote ? | 2026-10-11 | `qmupoupe9k4t2` |
| 141 | Document sans titre (archivée) | Que décrit le modèle de la mosaïque fluide ? | 2026-10-11 | `qmupoupe9lhoq` |
| 142 | Document sans titre (archivée) | Ribosomes liés vs ribosomes libres ? | 2026-10-11 | `qmupoupe9llb6` |
| 143 | Document sans titre (archivée) | Rôle de la membrane plasmique dans la cellule ? | 2026-10-11 | `qmupoupe9n9rf` |
| 144 | Document sans titre (archivée) | Qu'est-ce que la chromatine ? | 2026-10-11 | `qmupoupe9nya0` |
| 145 | Document sans titre (archivée) | Organisation (uni/pluricellulaire) : procaryotes vs eucaryotes ? | 2026-10-11 | `qmupoupe9pa2n` |
| 146 | Document sans titre (archivée) | Réticulum endoplasmique (RE) : structure et rôles ? | 2026-10-11 | `qmupoupe9pamt` |
| 147 | Document sans titre (archivée) | Définition de multicellulaire (pluricellulaire) ? | 2026-10-11 | `qmupoupe9r8e4` |
| 148 | Document sans titre (archivée) | Principale distinction entre eucaryotes et procaryotes ? | 2026-10-11 | `qmupoupe9rotc` |
| 149 | Document sans titre (archivée) | L'ATP (adénosine triphosphate) est la principale molécule vectrice d'é | 2026-10-11 | `qmupoupe9sf0r` |
| 150 | Document sans titre (archivée) | Qu'est-ce que le nucléole ? | 2026-10-11 | `qmupoupe9t3sn` |
| 151 | Document sans titre (archivée) | Micelle vs liposome : quels phospholipides les forment ? | 2026-10-11 | `qmupoupe9twvm` |
| 152 | Document sans titre (archivée) | Composants principaux de la membrane plasmique ? | 2026-10-11 | `qmupoupe9ufzt` |
| 153 | Document sans titre (archivée) | Qu'est-ce que la respiration cellulaire ? | 2026-10-11 | `qmupoupe9vig0` |
| 154 | Document sans titre (archivée) | Rôle du chloroplaste ? | 2026-10-11 | `qmupoupe9vkxo` |
| 155 | Document sans titre (archivée) | Les phospholipides forment la trame principale de la membrane. | 2026-10-11 | `qmupoupe9w3ya` |
| 156 | Document sans titre (archivée) | Forme et localisation de l'ADN : procaryote vs eucaryote ? | 2026-10-11 | `qmupoupe9wcw0` |
| 157 | Document sans titre (archivée) | Que retenir des pili sexuels ? | 2026-10-11 | `qmupoupe9wjlv` |
| 158 | Document sans titre (archivée) | RE rugueux vs RE lisse ? | 2026-10-11 | `qmupoupe9wk3c` |
| 159 | Document sans titre (archivée) | Qu'est-ce qu'un organite membranaire ? | 2026-10-11 | `qmupoupe9ww2r` |
| 160 | Document sans titre (archivée) | Paroi cellulaire des procaryotes : composition ? | 2026-10-11 | `qmupoupe9xlqc` |
| 161 | Document sans titre (archivée) | ARNr vs ARNm ? | 2026-10-11 | `qmupoupe9xvj1` |
| 162 | Document sans titre (archivée) | Au-delà de délimiter la cellule, que doit permettre la membrane plasmi | 2026-10-11 | `qmupoupe9z1oj` |
| 163 | Énergie cinétique | L'unité de l'énergie est le joule (J), avec ses multiples : kilojoule  | 2026-10-11 | `qmsoo4ebg3wlh` |
| 164 | Epistémologie  cours 1 | Quand est ce qu'un raisonnement est valide ? | 2026-10-10 | `qmv2in144s3ep` |
| 165 | Epistémologie  cours 1 | Quels sont les critères pour qu'une conclusion soit vraie ? | 2026-10-10 | `qmv2inoylyq4q` |
| 166 | Epistémologie  cours 1 | C'est quoi un raisonnement inductif ? | 2026-10-10 | `qmv2iqrpdy3dc` |
| 167 | Fiche — L'électronégativité et l'affinité électronique | Chimie : d'où proviennent les charges partielles δ+ et δ− dans une lia | 2026-10-11 | `qmt8d2f6uk5md` |
| 168 | Fiche — L'électronégativité et l'affinité électronique | Chimie : que mesure l'affinité électronique d'un atome ? | 2026-10-11 | `qmt8d2f6us1c8` |
| 169 | Fiche — L'électronégativité et l'affinité électronique | Chimie : que mesure l'électronégativité d'un atome ? | 2026-10-11 | `qmt8d2f6uui8q` |
| 170 | Fiche — L'électronégativité et l'affinité électronique | Chimie : le long d'une période, de gauche à droite, l'électronégativit | 2026-10-11 | `qmt8d2f6ux8oo` |
| 171 | Fiche 1 (archivée) | Organites entourés d'une membrane : procaryote vs eucaryote ? | 2026-10-11 | `qmumxrw4m0kot` |
| 172 | Fiche 1 (archivée) | Quels éléments chimiques composent la structure typique d'un acide ami | 2026-10-11 | `qmumxrw4m0wf9` |
| 173 | Fiche 1 (archivée) | Définition d'un organite ? | 2026-10-11 | `qmumxrw4m28eh` |
| 174 | Fiche 1 (archivée) | Rôle du lysosome ? | 2026-10-11 | `qmumxrw4m2avv` |
| 175 | Fiche 1 (archivée) | Qu'est-ce que le nucléole ? | 2026-10-11 | `qmumxrw4m2gbu` |
| 176 | Fiche 1 (archivée) | Structure d'un phospholipide : glycérol + 2 acides gras + tête phospha | 2026-10-11 | `qmumxrw4m2nq5` |
| 177 | Fiche 1 (archivée) | D'où vient la diversité des protéines du vivant ? | 2026-10-11 | `qmumxrw4m2uz9` |
| 178 | Fiche 1 (archivée) | Rôle de la vacuole ? | 2026-10-11 | `qmumxrw4m2wkz` |
| 179 | Fiche 1 (archivée) | Formule brute du glucose : C6H12O6. | 2026-10-11 | `qmumxrw4m3u5j` |
| 180 | Fiche 1 (archivée) | Nucléoside vs nucléotide : composition ? | 2026-10-11 | `qmumxrw4m3vus` |
| 181 | Fiche 1 (archivée) | Bases azotées de l'ADN et de l'ARN ? | 2026-10-11 | `qmumxrw4m40px` |
| 182 | Fiche 1 (archivée) | Qu'est-ce que la respiration cellulaire ? | 2026-10-11 | `qmumxrw4m4mbw` |
| 183 | Fiche 1 (archivée) | Protéines membranaires intégrales : position et ancrage ? | 2026-10-11 | `qmumxrw4m53pd` |
| 184 | Fiche 1 (archivée) | Rôle du chloroplaste ? | 2026-10-11 | `qmumxrw4m5c6z` |
| 185 | Fiche 1 (archivée) | Qu'est-ce qu'un acide aminé par rapport aux protéines ? | 2026-10-11 | `qmumxrw4m5dmk` |
| 186 | Fiche 1 (archivée) | Où et à quoi sont attachés les glucides de la membrane ? | 2026-10-11 | `qmumxrw4m5e8v` |
| 187 | Fiche 1 (archivée) | La phosphorylation est la greffe d'un groupe phosphate. | 2026-10-11 | `qmumxrw4m5zg3` |
| 188 | Fiche 1 (archivée) | Graisse saturée vs insaturée : différence chimique et conséquence sur  | 2026-10-11 | `qmumxrw4m62nn` |
| 189 | Fiche 1 (archivée) | Pourquoi les chaînes d'hydrocarbures d'un triglycéride sont-elles peu  | 2026-10-11 | `qmumxrw4m6q2s` |
| 190 | Fiche 1 (archivée) | Quels organismes sont procaryotes, lesquels eucaryotes ? | 2026-10-11 | `qmumxrw4m7gri` |
| 191 | Fiche 1 (archivée) | Comment les phospholipides s'organisent-ils pour former une membrane ? | 2026-10-11 | `qmumxrw4m812v` |
| 192 | Fiche 1 (archivée) | Que sont les flagelles ? | 2026-10-11 | `qmumxrw4m8f5v` |
| 193 | Fiche 1 (archivée) | Cytoplasme vs cytosol ? | 2026-10-11 | `qmumxrw4maavt` |
| 194 | Fiche 1 (archivée) | Fonction des ribosomes et information qu'ils utilisent ? | 2026-10-11 | `qmumxrw4mar7l` |
| 195 | Fiche 1 (archivée) | Réticulum endoplasmique (RE) : structure et rôles ? | 2026-10-11 | `qmumxrw4mat0e` |
| 196 | Fiche 1 (archivée) | Ribosomes liés vs ribosomes libres ? | 2026-10-11 | `qmumxrw4mazjy` |
| 197 | Fiche 1 (archivée) | Au-delà de délimiter la cellule, que doit permettre la membrane plasmi | 2026-10-11 | `qmumxrw4mc478` |
| 198 | Fiche 1 (archivée) | Rôle de la membrane plasmique dans la cellule ? | 2026-10-11 | `qmumxrw4mcfmx` |
| 199 | Fiche 1 (archivée) | Protéines membranaires périphériques : position et attache ? | 2026-10-11 | `qmumxrw4memfz` |
| 200 | Fiche 1 (archivée) | Rôle d'une enzyme ? | 2026-10-11 | `qmumxrw4mes0k` |
| 201 | Fiche 1 (archivée) | Paroi cellulaire des procaryotes : composition ? | 2026-10-11 | `qmumxrw4mflrv` |
| 202 | Fiche 1 (archivée) | Les 4 classes de macromolécules ? | 2026-10-11 | `qmumxrw4mfwat` |
| 203 | Fiche 1 (archivée) | Rôle des chaînes de sucres à la surface des cellules ? | 2026-10-11 | `qmumxrw4mfwze` |
| 204 | Fiche 1 (archivée) | Où se trouve l'ADN d'une cellule procaryote ? | 2026-10-11 | `qmumxrw4mh2s0` |
| 205 | Fiche 1 (archivée) | Rôle de la mitochondrie ? | 2026-10-11 | `qmumxrw4mh3ny` |
| 206 | Fiche 1 (archivée) | Enchaînement de l'acide aminé à la protéine fonctionnelle ? | 2026-10-11 | `qmumxrw4mh5ts` |
| 207 | Fiche 1 (archivée) | Définition d'une protéine ? | 2026-10-11 | `qmumxrw4mhw3p` |
| 208 | Fiche 1 (archivée) | RE rugueux vs RE lisse ? | 2026-10-11 | `qmumxrw4mhxg8` |
| 209 | Fiche 1 (archivée) | Forme et localisation de l'ADN : procaryote vs eucaryote ? | 2026-10-11 | `qmumxrw4mi1qe` |
| 210 | Fiche 1 (archivée) | Que sont les fimbriae (ou pili) ? | 2026-10-11 | `qmumxrw4miczy` |
| 211 | Fiche 1 (archivée) | Définition de l'homéostasie ? | 2026-10-11 | `qmumxrw4mj01e` |
| 212 | Fiche 1 (archivée) | Quelles cellules contiennent de l'information génétique, et sous quell | 2026-10-11 | `qmumxrw4mjf8e` |
| 213 | Fiche 1 (archivée) | Qu'est-ce qu'un organite membranaire ? | 2026-10-11 | `qmumxrw4mk33v` |
| 214 | Fiche 1 (archivée) | Qu'est-ce que la capsule bactérienne ? | 2026-10-11 | `qmumxrw4mk3np` |
| 215 | Fiche 1 (archivée) | Rôle de l'appareil (corps) de Golgi ? | 2026-10-11 | `qmumxrw4mkcgq` |
| 216 | Fiche 1 (archivée) | Micelle vs liposome : quels phospholipides les forment ? | 2026-10-11 | `qmumxrw4mkgdj` |
| 217 | Fiche 1 (archivée) | Principale distinction entre eucaryotes et procaryotes ? | 2026-10-11 | `qmumxrw4mkw9k` |
| 218 | Fiche 1 (archivée) | ARNr vs ARNm ? | 2026-10-11 | `qmumxrw4mkwqx` |
| 219 | Fiche 1 (archivée) | Sucre de l'ADN vs sucre de l'ARN ? | 2026-10-11 | `qmumxrw4ml9vy` |
| 220 | Fiche 1 (archivée) | Structure et orientation d'un glycolipide ? | 2026-10-11 | `qmumxrw4mlmhg` |
| 221 | Fiche 1 (archivée) | Qu'est-ce qu'un phospholipide et pourquoi est-il adapté aux membranes  | 2026-10-11 | `qmumxrw4mmadi` |
| 222 | Fiche 1 (archivée) | Qu'est-ce que le nucléoplasme ? | 2026-10-11 | `qmumxrw4mn5l8` |
| 223 | Fiche 1 (archivée) | Quels composants assurent la barrière semi-perméable, et lesquels le t | 2026-10-11 | `qmumxrw4mnk22` |
| 224 | Fiche 1 (archivée) | Que signifient les sigles ADN et ARN ? | 2026-10-11 | `qmumxrw4moxoj` |
| 225 | Fiche 1 (archivée) | L'ADN est une double hélice, une sorte d'échelle torsadée. | 2026-10-11 | `qmumxrw4moz24` |
| 226 | Fiche 1 (archivée) | Rôle et position du cholestérol dans la membrane ? | 2026-10-11 | `qmumxrw4mpzvu` |
| 227 | Fiche 1 (archivée) | Appariements des bases : ADN A–T et C–G ; ARN A–U et C–G. | 2026-10-11 | `qmumxrw4mqb4z` |
| 228 | Fiche 1 (archivée) | Rôle de l'ADN vs rôle de l'ARN ? | 2026-10-11 | `qmumxrw4mqgy7` |
| 229 | Fiche 1 (archivée) | Que retenir des pili sexuels ? | 2026-10-11 | `qmumxrw4mrmtp` |
| 230 | Fiche 1 (archivée) | Exemple de monomère de l'ADN et de l'ARN ? | 2026-10-11 | `qmumxrw4mruh2` |
| 231 | Fiche 1 (archivée) | Définition de multicellulaire (pluricellulaire) ? | 2026-10-11 | `qmumxrw4msqrd` |
| 232 | Fiche 1 (archivée) | Composants principaux de la membrane plasmique ? | 2026-10-11 | `qmumxrw4msz82` |
| 233 | Fiche 1 (archivée) | Comment est organisée une cellule procaryote ? | 2026-10-11 | `qmumxrw4mt1cj` |
| 234 | Fiche 1 (archivée) | L'ATP (adénosine triphosphate) est la principale molécule vectrice d'é | 2026-10-11 | `qmumxrw4mte0b` |
| 235 | Fiche 1 (archivée) | Qu'est-ce que le groupe R (chaîne latérale) d'un acide aminé ? | 2026-10-11 | `qmumxrw4mu0pr` |
| 236 | Fiche 1 (archivée) | Les protéines intégrales qui traversent la membrane de part en part so | 2026-10-11 | `qmumxrw4muyl2` |
| 237 | Fiche 1 (archivée) | Les acides aminés sont les monomères qui forment les polymères appelés | 2026-10-11 | `qmumxrw4mw5xt` |
| 238 | Fiche 1 (archivée) | Dans quels processus et organismes les protéines sont-elles impliquées | 2026-10-11 | `qmumxrw4mwkqo` |
| 239 | Fiche 1 (archivée) | Quels composants sont communs à toutes les cellules, procaryotes comme | 2026-10-11 | `qmumxrw4mx75a` |
| 240 | Fiche 1 (archivée) | Que décrit le modèle de la mosaïque fluide ? | 2026-10-11 | `qmumxrw4mxp16` |
| 241 | Fiche 1 (archivée) | Les phospholipides forment la trame principale de la membrane. | 2026-10-11 | `qmumxrw4mxsvq` |
| 242 | Fiche 1 (archivée) | L'ADN est un polymère : quelles en sont les briques ? | 2026-10-11 | `qmumxrw4my3yz` |
| 243 | Fiche 1 (archivée) | Rôle du noyau ? | 2026-10-11 | `qmumxrw4myikc` |
| 244 | Fiche 1 (archivée) | Glycolyse : définition et bilan ? | 2026-10-11 | `qmumxrw4mymhl` |
| 245 | Fiche 1 (archivée) | Qu'est-ce que la chromatine ? | 2026-10-11 | `qmumxrw4mynrl` |
| 246 | Fiche deontologie secret consentement | Qu'est ce que couvre le secret médical ? | 2026-10-10 | `qmv2hpeakcnvn` |
| 247 | Fiche deontologie secret consentement | Que fais le juge civil et le juge pénal | 2026-10-10 | `qmv2hqu80jn82` |
| 248 | Fiche deontologie secret consentement | Peut-on répéter une information entendue mais non vérifiée ? | 2026-10-10 | `qmv2hu7dzuf2d` |
| 249 | La théorie cinétique des gaz — Fiche de synthèse | Le gaz est constitué de particules en mouvement aléatoire constant | 2026-10-11 | `qmtbnw2r2e9z1` |
| 250 | La théorie cinétique des gaz — Fiche de synthèse | Les collisions entre particules sont complètement élastiques | 2026-10-11 | `qmtbnwx4ycr4e` |
| 251 | La théorie cinétique des gaz — Fiche de synthèse | L'énergie cinétique moyenne des particules est proportionnelle à la te | 2026-10-11 | `qmtbnxsmmq1k9` |
| 252 | La théorie cinétique des gaz — Fiche de synthèse | Formule de la théorie cinétique des gaz + unité | 2026-10-11 | `qmtbnz9lrzs08` |
| 253 | Logique 2 | Que cachent les masques ? | 2026-10-17 | `qmvciirq7cc4i` |
| 254 | Logique 2 | La méthode pour p et q dans l'ordre ? | 2026-10-17 | `qmvciqtfbzcxo` |
| 255 | Loi de Coulomb | Que cachent les masques ? | 2026-10-11 | `qmuo92c2t162z` |
| 256 | Notes communication emotions | C’est quoi : Les 6 émotions de base | 2026-10-10 | `qmv2gmqbx4qlz` |
| 257 | Notes communication emotions | Raconte quand Paul Ekman est allé chez les Papous | 2026-10-10 | `qmv2gq3b2xwqq` |
| 258 | Notes communication emotions | C'est Intra / Inter personnelles : | 2026-10-10 | `qmv2gu90e4dk8` |
| 259 | Notes cours 3 | Les 8 familles d'hypothèses - RC : C'est quoi F4 et def : | 2026-10-13 | `qmv73nq0ia1v0` |
| 260 | Notes cours 3 | Les 8 familles d'hypothèses - RC : C'est quoi F6 et def : | 2026-10-13 | `qmv73q1v09sea` |
| 261 | Notes cours 3 | Les 8 familles d'hypothèses - RC : C'est quoi F7 et def : | 2026-10-13 | `qmv73qq65wb8p` |
| 262 | Notes cours 3 | Les 8 familles d'hypothèses - RC : C'est quoi F8 et def : | 2026-10-13 | `qmv73rdspnk8s` |
| 263 | Pression partielle et fraction molaire — Fiche de chimie | C'est quoi la pression partielle d'un gaz ? | 2026-10-11 | `qmtbobzzonda7` |
| 264 | Pression partielle et fraction molaire — Fiche de chimie | Formule de la pression totale (loi de Dalton) | 2026-10-11 | `qmtbofe9zkmj2` |
| 265 | Résumé de cours (cata) | C’est quoi : schéma corporel | 2026-10-09 | `qmuy801qbraxq` |
| 266 | Résumé de cours (cata) | C’est quoi : un membre fantôme | 2026-10-09 | `qmuy85dqkhj5e` |
| 267 | Résumé de cours (cata) | C’est quoi : L'image du corps | 2026-10-09 | `qmuy88kmutase` |
| 268 | Résumé de cours visio (cata) | Quelle est l'année de vésale ? | 2026-10-09 | `qmuy8fotfajgh` |
| 269 | Résumé de cours visio (cata) | cadre chronologique : La figure et type de corp pendant l'Antiquité ? | 2026-10-09 | `qmuy94e7nl97a` |
| 270 | Résumé de cours visio (cata) | cadre chronologique : La figure et type de corp pendant Moyen Âge ? | 2026-10-09 | `qmuy9qb2ewkqq` |
