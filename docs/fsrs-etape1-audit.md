# FSRS-6 dans les flashcards — Étape 1 : audit et sauvegarde (10/10/2026)

Audit en **lecture seule**. Aucun fichier applicatif n'a été modifié, aucune donnée IndexedDB ni
Supabase n'a été écrite, aucune migration n'a été lancée, l'app n'a jamais tourné sur les vraies
données. Base : commit `7b6c351` (= tag `pre-fsrs-2026-10-10`).

## Résumé

- **Sauvegarde faite et restauration testée.** Le code est sauvegardé (tag et branche poussés).
  Les données sont sauvegardées hors du dépôt (449 Mo) :
  - l'IndexedDB du Mac, en JSON sans perte et en copie brute ;
  - toute la table `medrevise_records` ;
  - les 232 fichiers du bucket.

  Restauration dans un Chrome vierge isolé : **34/34 fichiers identiques au SHA-256**.
- **Historique : cas mixte.**
  - 582 flashcards ont toute leur vie en notes J. Elles sont rejouables, avec des réserves.
  - 312 n'ont aucune note : état seul.
  - Les réponses du mode Apprentissage (Pas su / Su) ne sont journalisées nulle part.
- **Garder exactement les dates est faisable.** On construit pour chaque carte un état FSRS
  « Review » dont `due` est la date actuelle. C'est vérifié sur les 593 cartes en révision :
  `due` est inchangé pour toutes.
- **Point d'attention n°1 — les intervalles FSRS sont beaucoup plus longs que ceux du moteur
  maison.** Avec S = intervalle courant et la difficulté par défaut, une première note
  « Correct » sur une carte à J+3 la renvoie à **J+15** (le maison donnait J+8 avec Facile).
  Le mode ombre et le choix de la difficulté initiale servent à neutraliser ce risque (§11).
- **Point d'attention n°2 — il n'existe pas de « méthode des J des chapitres » distincte dans
  le code.** La méthode des J (série du jour, calendrier, badge J+N, rattrapage) est calculée
  **sur les cartes elles-mêmes**, flashcards comprises. C'est à trancher (décision n°1).
- **Rien ne rend le projet déconseillé.** Toutes les conditions techniques sont réunies :
  - Node 24 partout ;
  - ts-fsrs 5.4.2 ESM, sans dépendance, 6,7 Ko gzip ;
  - pas d'apprentissage vides acceptés ;
  - Mac et cloud identiques.

---

## 1. Sauvegarde restaurable

### 1.1 Code

| Élément | Valeur |
|---|---|
| Changements non commités | aucun (`git status` propre au départ) → pas de commit de sauvegarde |
| Tag | `pre-fsrs-2026-10-10` (annoté) → `7b6c351`, poussé |
| Branche | `backup/pre-fsrs` → `7b6c351`, poussée |

### 1.2 Données

Emplacement (hors dépôt) : `~/Documents/Dév & projets/Claude/Projets/My Org/backups/pre-fsrs-2026-10-10/`.
Il contient 283 fichiers, 438 Mo. Empreinte de `MANIFESTE.json` :
`69c00b0ef87f383a0df772ff5d52f657bc9914e6b0324333871e8b4927f845d1`.

| Source | Méthode (lecture seule) | Contenu |
|---|---|---|
| IndexedDB du Mac | Le dossier d'**Aside** (le navigateur qui sert l'app sur ce Mac) a été copié à 18:39:11, sans `LOCK`. La copie a été lue dans un Chrome headless **sans réseau** (`--host-resolver-rules=MAP * ~NOTFOUND`), sur une page **vide** servie par interception CDP : le code de l'app n'a jamais tourné. Les valeurs sont sérialisées sans perte (Blob/File → base64 + type, Date, ArrayBuffer…), lecture clé par clé, 0 erreur. | **29 bases, 3 055 entrées** dont 1 583 questions, 112 blobs (100,4 Mo), 55 sauvegardes internes, 26 `meta` (séance, migrations). |
| Copie brute | `brut/aside-indexeddb-my-org-blue.tar.gz` (LevelDB + blobs, même instant) | restauration directe sur ce Mac |
| Supabase `medrevise_records` | GET paginé par 1000, ordre (store, record_id), clé anon publique lue dans le bundle déployé (jamais écrite sur disque) | **3 798 lignes = compte exact serveur** (dont 1 929 questions : 1 583 vivantes et 346 tombstones) |
| Bucket `medrevise-blobs` | liste (appel de lecture) + GET de chaque fichier | **232 fichiers**, 0 erreur |

C'est la seule table MedRevise. `mealweek_state` (MealWeek) n'a été ni lue ni touchée.

Chaque fichier a son SHA-256 dans `MANIFESTE.json`. `verifier.mjs manifeste` donne **283/283
conformes**.

Scripts (`scripts/sauvegarde-fsrs/`, aussi copiés dans la sauvegarde) :
- `chrome-isole.mjs` : Chrome isolé et sérialiseur ;
- `export-idb.mjs`, `export-supabase.mjs`, `manifeste.mjs` ;
- `restore-idb.mjs`, `restore-supabase.mjs`, `verifier.mjs` ;
- `analyse-fsrs.mjs` : les chiffres de ce rapport ;
- **`restore.md`** : la procédure, commande par commande.

### 1.3 Preuve du test de restauration (`preuves/preuve-restauration.txt`)

```
# Test de restauration — 2026-10-10 18:47:16 +0200
profil cible vierge : 1 entrée(s) avant
restauration terminée : 29 bases, 3055 entrées
2e passe sur le même profil :
REFUS : le profil cible contient déjà 29 base(s) : keyval-store, medrevise-anatstruct, med
bases 29 · entrées 3055 · erreurs 0 · requêtes réseau bloquées 1
bases : 29 → 29 · fichiers identiques (SHA-256) : 34/34
origine : 1583 questions dont 894 flashcards · Muscle 9 · molécules 0 · avec image 20 · avec tableau 0 · blobs 112 (100.4 Mo) · réf. d'images des flashcards 32 dont absentes du store blobs 0
restaurée : 1583 questions dont 894 flashcards · Muscle 9 · molécules 0 · avec image 20 · avec tableau 0 · blobs 112 (100.4 Mo) · réf. d'images des flashcards 32 dont absentes du store blobs 0
RESTAURATION CONFORME : contenu identique octet pour octet
```

Le ré-export du profil restauré est **identique octet pour octet** à la sauvegarde : 34 fichiers
sur 34, toutes bases confondues, blobs compris.
- Les images (20 flashcards, 32 références, toutes présentes) reviennent intactes.
- Les tableaux Muscle (9 cartes) reviennent intacts.
- **Aucune carte molécule n'existe dans les vraies données.** Un test synthétique a donc été
  fait : une carte avec `molecule.smiles` + `molfile`, un tableau `muscle` et un blob PNG. Il est
  **conforme, 1/1 identique** (`preuves/preuve-molecule.txt`).

La restauration Supabase **n'a pas été exécutée**, conformément à la consigne. Le script
`restore-supabase.mjs` ne fait qu'une simulation hors ligne par défaut :

```
sauvegarde vérifiée : 3798 lignes medrevise_records, 232 fichiers du bucket
SIMULATION : aucune requête envoyée.
```

La procédure exacte est dans `restore.md` §3. Elle demande :
- l'arrêt de l'app sur tous les appareils ;
- une copie SQL de la table ;
- un upsert inconditionnel avec la clé service role, car la RPC `medrevise_push` refuserait un
  état plus ancien ;
- puis la purge du stockage local de chaque appareil.

---

## 2. Modèle de carte : champs de planification

Une flashcard est un enregistrement du store `questions`, `type: 'flashcard'`. Le moteur est
`lib/sm2.js`, l'apprentissage est `lib/apprentissageFC.js`.

| Champ | Posé par | Sémantique exacte |
|---|---|---|
| `dueDate` | `startAdaptive` (création = date de départ), `advanceQuestion`, `sortir`, « Déplacer » | Date locale `YYYY-MM-DD` de la prochaine échéance J. `null` si terminée. Pour une carte en apprentissage, c'est sa date de départ (ou le lendemain d'un raté). |
| `intervalDays` | `startAdaptive` (1), `advanceQuestion`, `sortir` (1) | Intervalle courant en jours, entier ≥ 1. Plafond 90. |
| `capped` | `advanceQuestion` | L'échéance actuelle est celle plafonnée à 90 j. La note suivante termine la carte. |
| `termine` | `advanceQuestion` | Cycle fini : `dueDate: null`, la carte ne revient plus jamais. |
| `j0Date` | création, « Décaler le départ » | Vrai J0. Jamais retouché par une note. |
| `skippedOn` | « Sauter » (MedReviseApp) | Jour sauté. `nextDate()` reporte l'échéance effective à `skippedOn + 1`, sans écrire `dueDate`. |
| `historique[]` | `advanceQuestion`, `recordRelearnAttempt` | `{date, qualite: 1/3/5, tempsMs?}`. Date seule, sans heure. |
| `missed` | `advanceQuestion` | Compteur interne (Raté/Difficile +1, Facile → 0). Lu par aucun écran. |
| `learnState` | migration, `introduire`, `sortir`, `apresNotationJ` | `new` / `learning` / `review` |
| `learningStreak` / `learningCriterion` | `repondre` / `introduire` | Succès consécutifs. Critère (2 par défaut ; 3 avant la v1.1). |
| `learningPresented`, `lastSeenAt` | `presenter`, `repondre` | Carte déjà montrée. Dernière vue (ISO). `lastSeenAt` sert aussi aux QCM. |
| `learningIntroducedOn` / `learningDue` / `learningSource` / `learningDoneOn` | transitions d'apprentissage | Entrée dans le bloc Apprendre. Jour attendu. `nouvelle` ou `rate`. Sortie. |

Exemples réels, tirés de la sauvegarde :

```json
// carte en révision, notée 3 fois (dont une répétition le même jour)
{ "id":"qmuod63sayox7", "learnState":"review", "dueDate":"2026-10-18", "intervalDays":10, "capped":false, "termine":false,
  "j0Date":"2026-10-05", "missed":0, "historique":[{"date":"2026-10-05","qualite":5,"tempsMs":18536},
  {"date":"2026-10-08","qualite":3,"tempsMs":19573},{"date":"2026-10-08","qualite":5}] }
// sortie d'apprentissage le 08/10 : J+1, AUCUNE note dans l'historique, sautée le 09/10
{ "id":"qmuy801qbraxq", "learnState":"review", "dueDate":"2026-10-09", "intervalDays":1, "skippedOn":"2026-10-09",
  "learningCriterion":3, "learningIntroducedOn":"2026-10-07", "learningDoneOn":"2026-10-08", "historique":[] }
// en apprentissage (1 succès sur 2), dueDate = date de départ déjà passée
{ "id":"qmuzrmz83t2ur", "learnState":"learning", "dueDate":"2026-10-09", "intervalDays":1, "learningStreak":1,
  "learningIntroducedOn":"2026-10-08", "learningDue":"2026-10-08", "learningSource":"nouvelle", "historique":[] }
```

Il n'existe pas de champ « streak » de séries de jours sur la carte. `computeStreak` dérive la
série d'activité des jours révisés.

## 3. Historique : cas A, B ou mixte → **MIXTE**

- **Un enregistrement par réponse existe**, mais seulement pour les notes J (Raté / Difficile /
  Facile) : `historique[]` sur la carte elle-même, écrit par `advanceQuestion`
  (`sm2.js:155-160`, `185-207`). Il n'y a pas de journal séparé. `sessionsLog` ne contient
  qu'un total par série : 44 points du 03/08 au 26/08.
- **Depuis quand** : première note le 28/07/2026, dernière le 08/10.

| Mois | Notes |
|---|---|
| 2026-07 | 175 |
| 2026-08 | 944 |
| 2026-09 | 33 |
| 2026-10 | 340 |

- **Volume** : 1 492 entrées sur 582 cartes.

| Qualité | Notes |
|---|---|
| 1 (Raté) | 121 |
| 3 (Difficile) | 216 |
| 5 (Facile) | 1 155 (77 %) |

  1 279 notes ont `tempsMs`, 213 n'en ont pas : `SeanceFC.noter` ne transmet pas le temps
  (`SeanceFC.jsx:235`).
- **Complet ou partiel** :
  - **582 cartes « A »** : toute leur vie est en notes J. Aucune n'est passée par
    l'apprentissage, qui date du 06/10. Pour les 115 cartes planifiées vérifiables, la règle
    « dernière note + `intervalDays` = `dueDate` » est cohérente **115 fois sur 115**.
  - **312 cartes « B »** : aucune note. 297 sont en apprentissage ou n'ont jamais été vues, 15
    sont sorties d'apprentissage. Leur progression Pas su / Su n'a **jamais été journalisée** :
    `repondre` ne touche pas `historique`.
  - **Réserves sur le rejeu des « A »** :
    - Les répétitions du jour même (`recordRelearnAttempt`, sans effet sur la date) sont
      **indiscernables** d'une vraie note : 56 cartes ont ≥ 2 notes le même jour.
    - Les notes de juillet et août ont été données sous des moteurs antérieurs (cadence fixe,
      chronologie fixe).
    - Il n'y a pas d'heure.
    - Le LWW sur l'enregistrement entier peut avoir perdu une note faite en parallèle sur deux
      appareils.
- **Conclusion** : l'historique ne doit **pas** servir à recalculer les dates, car la contrainte
  n°1 est de garder les dates actuelles. Il peut servir, au mieux, à estimer la difficulté
  initiale et, plus tard, à optimiser les paramètres. Importé dans le journal, il serait marqué
  `source: 'import-sm2'`.

## 4. Boutons actuels et correspondance FSRS

| Écran | Boutons | Effet exact (moteur maison) |
|---|---|---|
| Séance du jour, bloc Révisions (`SeanceFC.jsx:350-352`) ; séries / fiche / rattrapage (`Session.jsx:597-599` « Raté — à revoir vite », « Difficile — bientôt », « Facile — dans longtemps » ; `MobileSession.jsx:420-422` idem) | **3** : Raté / Difficile / Facile (qualité 1 / 3 / 5) | **Raté** : `intervalDays = 1`, `dueDate = demain`, `capped = false`. Pour une flashcard, `apresNotationJ` la redescend ensuite en apprentissage, dès le lendemain. Dans une série, la carte repasse en fin de série (`_relearn`), notée par `recordRelearnAttempt`, historique seulement. **Difficile** : `max(I+1, round(I×1,3))`. **Facile** : `max(I+1, round(I×2,5))`. Au-delà de 90 : 90 et `capped`. **Carte `capped`** : Difficile ou Facile → `termine` (plus jamais revue) ; Raté → retour à 1. |
| Séance, bloc Apprendre | « Compris, suivante » (présentation), puis **2** : Pas su / Su | Réinsertion dans la file (3–4 cartes plus loin, 8–10 si su, fin de paquet). Sortie au critère : `sortir` → `review`, `intervalDays = 1`, `dueDate = demain`. |
| Cloze en saisie (mobile) | aucun | qualité déduite du % juste (`qualityFromRatio`) |

**Correspondance proposée pour importer l'historique** : 1 → Again, 3 → Hard, 5 → **Easy**
(lecture littérale). Ce qui est perdu : aucune ancienne réponse n'est « Good ». Or « Facile »
était en pratique la réponse **normale de réussite** (77 % des notes), et l'importer en Easy
gonflerait toute estimation tirée de l'historique.
**Recommandation** : importer avec `rating` littéral (Easy) **et** `ancienneQualite`, mais ne
pas s'en servir pour initialiser les cartes. Voir la décision n°3.

**Les nouveaux boutons** : À revoir / Difficile / Correct / Facile = Again / Hard / Good / Easy
(Rating 1–4).

## 5. Planificateur maison : algorithme réel, bugs, appelants

Algorithme (`sm2.js:185-207`), cité intégralement :

```js
if (record.capped) { if (isFail) return { ...record, intervalDays: 1, dueDate: demain, capped: false, termine: false, ... };
                     return { ...record, dueDate: null, termine: true, ... }; }
if (isFail) return { ...record, intervalDays: 1, dueDate: demain, capped: false, ... };
const mult = quality >= 5 ? 2.5 : 1.3;
let nextInterval = Math.max(base + 1, Math.round(base * mult));
if (nextInterval > 90) { nextInterval = 90; capped = true; }
return { ...record, intervalDays: nextInterval, dueDate: aujourdhui + nextInterval, ... };
```

**Bugs connus ou suspects :**

1. **Le retard est ignoré.** Le nouvel intervalle part de l'intervalle prévu, pas du temps
   réellement écoulé. Une carte revue avec 20 jours de retard reçoit le même multiplicateur, et
   la nouvelle date est comptée depuis aujourd'hui.
2. **Raté = remise à zéro totale** (J+1), quelle que soit la stabilité acquise.
3. **Terminaison définitive** à J+90 : Difficile **ou** Facile à l'échéance plafonnée sort la
   carte pour toujours. 4 cartes `termine`, 20 `capped`.
4. **« Difficile » allonge toujours** : ×1,3 ou +1 jour, jamais de raccourcissement.
5. **Historique ambigu** : les répétitions de relearning sont écrites comme des notes (§3).
6. **Incohérence d'apprentissage** : une carte `learning` notée Facile ou Difficile depuis la
   Bibliothèque, le Dashboard ou une série Réviser **reste** `learning`, car `apresNotationJ`
   n'agit que sur un Raté. Elle est donc encore exclue des J.
7. **Sortie d'apprentissage sans trace** : intervalle remis à 1, aucune entrée d'historique
   (15 cartes).
8. **Moteur partagé** : le même `advanceQuestion` note les QCM et les fiches `anat_schema`
   (`AnatQuiz.jsx:188`).
9. **Synchro** : LWW sur l'enregistrement entier, horloge de l'appareil. Deux révisions de la
   même carte sur deux appareils hors ligne → l'une est perdue, historique compris.

**Appelants (liste exhaustive) :**

| Fonction | Appelée par |
|---|---|
| `advanceQuestion` | `session/Session.jsx:180`, `mobile/MobileSession.jsx:128`, `session/SeanceFC.jsx:235`, `session/AnatQuiz.jsx:188` |
| `recordRelearnAttempt` | `Session.jsx:180`, `MobileSession.jsx:128` |
| `apresNotationJ` | `Session.jsx:185`, `MobileSession.jsx:133`, `SeanceFC.jsx:236` |
| `startAdaptive` | `storage.js:643` (`newItem`), `import.js:141` et `305`, `MedReviseApp.jsx:568-569` et `577-578` (Décaler le départ) |
| Lecture de `dueDate` | `planning.js nextDate` (seul point de lecture) |
| Écriture de `dueDate` hors moteur | « Déplacer un jour » et « Reporter » (MedReviseApp) |
| Écriture de `skippedOn` | « Sauter » |

Points d'entrée de la notation d'une flashcard :
- **Séance du jour** (SeanceFC) ;
- **Réviser** : Aujourd'hui, séries flash et mixte (toutes les cartes, y compris en
  apprentissage), rattrapage, « Réviser cette fiche », éphémère ;
- **Dashboard** : rattrapage, cours, révision du jour ;
- **Bibliothèque** : 2 entrées ;
- **MobileHome** : série du jour, fiche ;
- **Mes erreurs**.

## 6. Mode Apprentissage : ce qu'il faut retirer à l'étape 2

**À retirer :**

| Où | Quoi |
|---|---|
| `lib/apprentissageFC.js` | Tout le cycle : `etatFC`, `horsMethodeJ`, `planDuJour` (blocs), `introduire`, `presenter`, `repondre`, `sortir`, `apresNotationJ`, `entrelacer`/`reinserer` (à garder si on entrelace encore les cours), `reprendreSeance`, `fusionApprentissage`, `REGLAGES_FC_DEFAUT.critere`, `DISTANCE`, `TEMPS_DEFAUT_MS.nouvelle`. On peut garder `estFlashcardJ`. |
| `session/SeanceFC.jsx` | Bloc Apprendre, « Compris, suivante », Pas su / Su, bascule « Passer à l'apprentissage / Revenir aux révisions », phases `pause-bloc` et `transition`, file et réinsertion. La séance devient une seule liste notée sur 4 boutons. |
| `components/SeanceAujourdhui.jsx` | Boutons « Révisions (n) · Apprentissage (n) », libellé « n à apprendre » |
| `MedReviseApp.jsx` | 118-121 (`blocSeanceFC`), 244-249 (paramètre `bloc`), 525-527 (`stripFC` du reset) |
| `mobile/MobileApp.jsx` | 23, 36-43 (`blocFC`) |
| `mobile/MobileHome.jsx` | 143-144 (paramètre `bloc`) |
| `pages/Reviser.jsx` | 940-942 (paramètre `bloc`) |
| `pages/Reglages.jsx` | 292, 423-450 : carte « Apprentissage des flashcards » (critère, bilan v1.1). **Garder** la case « Muscle ligne par ligne », qui vit dans le même enregistrement `prompts/reglagesFC`. |
| `components/CourseItemsSidebar.jsx` | 253-261, 284 (« n nouvelles ») |
| `lib/diagnosticExport.js` | 21, 49-50, 94 |
| `lib/planning.js` | 8, 100, 288 : filtre `horsMethodeJ` |
| `session/Session.jsx`, `mobile/MobileSession.jsx` | 185 / 133 : `apresNotationJ`, puis 3 → 4 boutons pour les flashcards |
| `lib/storage.js` | 771-779 et 812-818 : fusion d'apprentissage → retour au LWW simple |
| `lib/migrate.js` | `migrateApprentissageFCV1`/`V11` restent inertes (marqueurs déjà posés) ; les retirer de la liste à exécuter |
| `src/styles/etudes.css` | ~2252-2517 : `.sfa`, `.sfc` (bloc Apprendre), `.rfc*` |
| `scripts/tests-apprentissage/` | à archiver |
| `supabase/migrations/20261006_apprentissage_flashcards.sql` | index partiel devenu inutile (laisser, inoffensif) |

**À ne pas confondre (ne pas toucher)** : `pages/Apprentissage.jsx`, `src/medrevise/apprentissage/`
(ExoApprentissage, UniteSplit) et le store `apprentissage`. Ce sont les « unités » d'exercices
+ PDF, sans rapport avec les flashcards.

**Cartes concernées : 297 flashcards `learning`.**

| Groupe | Nombre | Détail |
|---|---|---|
| Planifiées, déjà introduites dans la séance | 77 | 66 jamais présentées, 7 présentées, 4 à 1 succès. Prochaine date d'apprentissage : 44 avant le 10/10, 33 le 10/10. |
| Hors planning (non introduites) | 220 | 172 dans des fiches archivées, 48 dans le cours « Rattrapage » (rappels J coupés) |
| `new` (départ futur) | 0 | |

**Proposition (sans perte)** : chacune devient une carte FSRS **New** dont la date de passage
est conservée :
- les 77 : `learningDue` (≤ aujourd'hui), donc **vues une fois à la prochaine séance**, notées,
  puis FSRS décide ;
- les 220 : leur `dueDate`, s'ils sont un jour replanifiés.

Les champs `learning*` restent en base, inertes. Aucune carte ne repart de zéro : elles n'ont
jamais eu de note J.

**Attention** : retirer le filtre `horsMethodeJ` sans les transformer ferait tomber ces 77
cartes dans la **boîte de rattrapage** (`dueDate` passée).

## 7. « Méthode des J des chapitres » : constat

**Il n'existe pas, dans le code, de planification J propre aux chapitres ou aux cours.**
- Un chapitre est un `dossier` de niveau 2. Il ne porte que des **exercices de chapitre**,
  volontairement **sans** méthode des J : pas de `dueDate`, statut tiré de l'historique
  (`planning.js:160-228`, `storage.js:648-668`).
- Ce que l'app appelle « méthode des J » côté cours, c'est :
  - la série du jour et le calendrier (`planning.js` `dueOn`, `weekData`, `todayPlan`) ;
  - le rattrapage (`overdueByFiche`) ;
  - le badge J+N d'une fiche (`ficheJ`, `labelForCursor`) ;
  - l'interrupteur « Rappels J » par cours ou par fiche (`isFicheScheduled`) ;
  - Décaler, Déplacer, Sauter.
- **Tout cela est calculé sur les cartes** : `dueDate` des QCM, des flashcards et des fiches
  `anat_schema`, lue par `nextDate()`.

**Données réelles** : 0 QCM planifié, 0 schéma, 0 `flashcard_erreur`. Aujourd'hui, la méthode
des J des cours **ne contient que des flashcards**.

**Ce qui garantit qu'elle reste intacte**, si l'étape 2 suit ces règles :
1. `sm2.js` n'est **pas modifié** : QCM, schémas, `labelForCursor`, `startAdaptive`, `QUALITY`
   restent tels quels.
2. Le planificateur FSRS **continue d'écrire `dueDate`** (date locale) et `termine`. Ainsi
   `nextDate`, `dueOn`, le calendrier, le rattrapage, Déplacer, Sauter et Décaler continuent de
   fonctionner sans changement.
3. L'aiguillage se fait par `type === 'flashcard'` aux trois points de notation (Session,
   MobileSession, SeanceFC), et nulle part ailleurs.
4. Seul le **libellé** « J+N » d'une flashcard change de sens. N = jours jusqu'à la prochaine
   échéance, au lieu de `intervalDays`. Voir la décision n°2.

Si par « J des chapitres » Yoann désigne autre chose (une routine faite hors de l'app, ou une
fonctionnalité à créer), c'est à préciser : décision n°1.

## 8. Synchro

- **Tout l'enregistrement est synchronisé**, `historique` et `learning*` compris.
  - `put`/`putMany` posent `updatedAt` (horloge de l'appareil), puis `queuePush`
    (`storage.js:158-170`) ;
  - outbox IndexedDB avec clé `store:id`, délai de 800 ms ;
  - la RPC `medrevise_push` fait un upsert **seulement si plus récent**
    (`where excluded.updated_at > mr.updated_at`).
- **Conflits** :
  - `reconcileAll` (`storage.js:781-829`) télécharge toute la table et applique le LWW par
    `updatedAt`. Un tombstone plus récent supprime la copie locale.
  - Exception `questions` : `fusionApprentissage`, à retirer.
  - Le store `meta` (séance en cours, migrations) est **local**.
- **Table** : `medrevise_records(store, record_id, data jsonb, updated_at, deleted)`. La RLS
  `anon using(true)` n'offre aucune isolation par utilisateur (constat de sécurité, hors
  périmètre).
- **Journal en ajout seul, idempotent, sans toucher au mécanisme actuel** — recommandation :
  - **Côté local** : un store IndexedDB **neuf** `review_log`, géré à part comme les
    `STORES_ISOLES` (`transcript_session`, `ocr_layer`, `sync.js:41`).
    - **Pas** dans `SYNCABLE` : sinon toute la table est retéléchargée à chaque retour sur
      l'onglet. Comptez ~100 000 lignes par an, avec `MAX_PAGES = 200` qui casserait **toute**
      la synchro au-delà de 200 000 lignes.
    - `queueAllLocalForPush` et `wipeAll` le renverraient en bloc.
  - **Côté cloud**, deux options :
    - (a) les mêmes lignes dans `medrevise_records` avec `store = 'review_log'`, exclues de
      `pullAllRecords`. Rien à créer en SQL. L'insert idempotent marche déjà : id = uuid,
      `updatedAt` posé une fois, et un renvoi identique est rejeté par le `>` strict ;
    - (b) **mieux** : une table dédiée `medrevise_review_log` (id uuid PK, card_id, rating,
      reviewed_at, due_before, due_after, état FSRS avant/après, appareil, version de
      l'algorithme), avec `insert … on conflict (id) do nothing`, un index sur
      `(card_id, reviewed_at)`, et une lecture incrémentale par `reviewed_at`.

    L'option (b) demande un SQL à exécuter par Yoann : décision n°6.

## 9. Fuseau horaire et dates

- « Aujourd'hui » = `todayISO()` = `isoDate(new Date())`, en **date locale** (`sm2.js:104-110`).
  Les ajouts de jours passent par `new Date(iso + 'T12:00:00')` (`sm2.js:115-119`,
  `planning.js:71-75`, `apprentissageFC.js:57-61`).
  → **Le code actuel est sûr au changement d'heure du 25/10/2026** : midi local ne change jamais
  de jour.
- **Risque introduit par ts-fsrs** (vérifié) :
  - `elapsed_days` est compté en **jours calendaires UTC** ;
  - l'échéance = `now + n × 24 h`.
  - Exemple mesuré : révision le 24/10 à 00:30 (Paris), Good à 3 j → échéance le **26/10 à
    23:30** locale, soit 2 jours calendaires au lieu de 3.
  - De même, deux révisions à 00:30 et 23:30 le même jour local comptent pour 1 jour d'écart.
  - **Neutralisation** :
    - ne passer à ts-fsrs que des `Date` à **midi local** (`now`, `due`, `last_review`) ;
    - convertir le `due` rendu en `YYYY-MM-DD` local ;
    - stocker la date locale dans `dueDate`, comme aujourd'hui.

    Test obligatoire à l'étape 2 : horloge décalée au 24/10 à 00:30 et au 25/10 à 02:30.
- Les horodatages LWW (`updatedAt`, ISO UTC) ne sont pas concernés par l'heure d'été. Ils
  restent dépendants de l'horloge de chaque appareil (risque connu).

## 10. Build

| Point | Constat |
|---|---|
| Node local | v24.18.0 |
| Node Vercel | projet `my-org` : `nodeVersion: 24.x`. Aucun `engines` dans `package.json`. |
| ts-fsrs | **5.4.2** (tag `latest` du 01/09/2026, `FSRSVersion` = « v5.4.2 using FSRS-6.0 », 21 poids). `engines.node >= 20` → compatible. Une 6.0.0-beta.14 existe : **ne pas l'utiliser**. |
| ESM / Vite | `"type":"module"`, exports `import` → `dist/index.mjs`. Vite 5 OK. Aucune dépendance, MIT. |
| Taille | 706 Ko dépaqueté (sourcemaps surtout). **21,2 Ko minifié, 6,7 Ko gzip** pour `fsrs`, `generatorParameters`, `createEmptyCard`, `Rating`, `State` (mesuré avec esbuild). |
| Version à pinner | `"ts-fsrs": "5.4.2"` (exacte, sans `^`) |

## 11. Répartition réelle (10/10/2026, données du Mac = données du cloud)

- **Mac ↔ cloud** : les 1 583 questions sont **identiques** en comparaison canonique (le jsonb
  réordonne les clés). Aucune n'est absente d'un côté ou de l'autre.
- **Questions** :

| Type | Nombre |
|---|---|
| Flashcards | 894 |
| QCM | 220 (aucun planifié) |
| Exercices | 395 |
| Feynman | 74 |

- **Flashcards par état** (`etatFC`, vrais modules de l'app) :

| | Planifiées (Helha Kiné, rappels J) | Hors planning | Total |
|---|---|---|---|
| review | 130 | 467 (373 Rattrapage, 77 fiches sans rappels J, 17 fiches archivées) | 597 (dont 4 `termine`) |
| learning | 77 | 220 (172 fiches archivées, 48 Rattrapage) | 297 |
| new | 0 | 0 | 0 |

- **Plan du jour** (`planDuJour`) : 39 révisions, 77 en cours, 0 nouvelle, 0 à sortir. C'est le
  « 39 à réviser · 77 à apprendre » affiché.
- **Intervalles des 130 planifiées en révision** :

| `intervalDays` | 1 | 3 | 5 | 8 | 10 | 20 |
|---|---|---|---|---|---|---|
| Cartes | 15 | 24 | 78 | 6 | 3 | 4 |

  Sur toutes les flashcards en révision, les plus fréquents sont 3 j (139), 8 j (144),
  20 j (95) et 5 j (87).
- **Prochaines dates sur 30 jours** (flashcards planifiées) :

| Jour | Révision (J) | Apprentissage | Total |
|---|---|---|---|
| avant le 10/10 (retard) | 0 | 44 | 44 |
| 2026-10-10 | 39 | 33 | 72 |
| 2026-10-11 | 28 | 0 | 28 |
| 2026-10-12 | 50 | 0 | 50 |
| 2026-10-13 → 14 | 0 | 0 | 0 |
| 2026-10-15 | 6 | 0 | 6 |
| 2026-10-16 → 17 | 0 | 0 | 0 |
| 2026-10-18 | 3 | 0 | 3 |
| 2026-10-19 → 27 | 0 | 0 | 0 |
| 2026-10-28 | 4 | 0 | 4 |
| 2026-10-29 → 2026-11-08 | 0 | 0 | 0 |
| à partir du 09/11 | | | 0 |
| sans date | | | 0 |

  Le détail jour par jour figure dans `preuves/analyse-donnees.txt`. Les 44 « en retard » sont
  des cartes d'apprentissage attendues avant aujourd'hui, pas des révisions.
- **Anomalies** :
  - Sans date parmi les planifiées : 0. Les 4 `termine` sont hors planning.
  - Doublons : 2 groupes, 4 cartes (« Que cachent les masques ? » ×2 dans deux fiches), déjà
    signalés le 10/10.
  - Incohérences, toutes à 0 : sans fiche, review sans intervalle, learning sans date, date mal
    formée, note dans le futur, révision en retard.
  - 43 cartes ont un `skippedOn`, 693 un `j0Date`.

### Effet d'une première note FSRS sur les vraies cartes

Paramètres : conversion S = intervalle, D = D0(Good) = 2,12, rétention 0,9, pas vides,
`enable_short_term: false`, sans fuzz. Calcul sur les 593 cartes en révision (`scripts/sauvegarde-fsrs/sim-fsrs-reel.mjs`) :

| Intervalle actuel | Cartes | FSRS À revoir | Difficile | Correct | Facile | Maison Raté | Difficile | Facile |
|---|---|---|---|---|---|---|---|---|
| 1 j | 27 | 1 | 4 | 6 | 10 | 1 | 2 | 3 |
| 3 j | 139 | 1 | 10 | 15 | 25 | 1 | 4 | 8 |
| 5 j | 87 | 1 | 16 | 23 | 39 | 1 | 7 | 13 |
| 8 j | 144 | 1 | 24 | 35 | 59 | 1 | 10 | 20 |
| 20 j | 95 | 2 | 55 | 78 | 129 | 1 | 26 | 50 |
| 45 j | 30 | 3 | 114 | 159 | 259 | 1 | 59 | 90 |
| 90 j | 16 | 4 | 212 | 294 | 471 | 1 | 117 | 90 |

Même calcul selon la difficulté initiale (Correct, carte à 3 j / 8 j / 20 j) :

| D initiale | 3 j | 8 j | 20 j |
|---|---|---|---|
| 2,12 (D0 Good) | 15 | 35 | 78 |
| 5 | 11 | 26 | 59 |
| 7 | 8 | 20 | 46 |
| 9 | 6 | 14 | 33 |

**Lecture** : poser S = intervalle revient à supposer 90 % de rappel à l'échéance. Les
intervalles maison, courts, font donc croire à FSRS que la mémoire est plus solide qu'elle ne
l'est. Avec D = 2,12, l'allongement est brutal. Avec D ≈ 7, on retrouve à peu près le rythme
actuel. Les dates **actuelles** ne bougent dans aucun cas : seule la date **suivante** en
dépend.

## 12. Étude de faisabilité ts-fsrs (vérifiée en exécution, Node 24)

- **API** (5.4.2) :
  - `fsrs(generatorParameters({ request_retention, maximum_interval, enable_fuzz, enable_short_term, learning_steps, relearning_steps, w }))` ;
  - `createEmptyCard(now)` ;
  - `f.repeat(card, now)` : les 4 aperçus ;
  - `f.next(card, now, grade)` → `{card, log}` ;
  - `f.reschedule(card, history, { update_memory_state, skipManual, now })` ;
  - `f.rollback(card, log)` : retour exact, vérifié ;
  - `f.forget(card, now, reset_count)` ;
  - `f.get_retrievability`, `f.init_difficulty(rating)` ;
  - `Rating` : Again 1 … Easy 4 ; `State` : New 0, Learning 1, Review 2, Relearning 3.
  - Champs d'une carte : `due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, learning_steps, state, last_review`.
  - `next()` ne modifie pas son entrée.
- **Valeurs par défaut** : `request_retention 0.9`, `maximum_interval 36500`,
  `enable_fuzz false`, `enable_short_term true`, `learning_steps ['1m','10m']`,
  `relearning_steps ['10m']`.
- **`learning_steps: []` et `relearning_steps: []` sont acceptés.** La carte passe directement
  en Review, et « À revoir » donne **demain**, jamais le jour même. C'est conforme à la décision
  « pas de re-présentation dans la séance ».
- **Première note d'une carte New** (FSRS-6 par défaut, pas vides, sans fuzz) :

| Configuration | Again | Hard | Good | Easy |
|---|---|---|---|---|
| `enable_short_term: false` (**recommandé**) | **1 j** | **2 j** | **3 j** | **8 j** |
| `enable_short_term: true` | 1 j | 1 j | 2 j | 8 j |

- **Oubli d'une carte Review** avec relearning vide : S 13,8 → 1,73, intervalle 2 j,
  `lapses + 1`.
- **Construire l'état « Review » depuis le moteur maison** (cas B, vérifié : `due` intact,
  rappel 0,9 à l'échéance) :

```js
const DAY = 864e5, midiLocal = (iso) => new Date(iso + 'T12:00:00');
function depuisMaison(q, f) {
  const due = midiLocal(q.dueDate);                 // date actuelle CONSERVÉE
  const I = q.intervalDays || 1;
  return { ...createEmptyCard(due), due, state: State.Review,
    stability: I,                                    // S ≈ intervalle courant
    difficulty: D_INITIALE,                          // défaut f.init_difficulty(Rating.Good) = 2,118 — voir décision n°4
    scheduled_days: I, elapsed_days: 0, learning_steps: 0,
    reps: (q.historique || []).length, lapses: (q.historique || []).filter((h) => h.qualite === 1).length,
    last_review: new Date(due.getTime() - I * DAY) };
}
```

  Une carte `learning` ou jamais vue devient `createEmptyCard`, avec la date de passage
  conservée séparément (`dueDate` / `learningDue`). Une carte `termine` reste hors planning.
- **`reschedule`** rejoue un historique `[{rating, review}]` depuis une carte vierge.
  - `first_card` n'influence pas S et D.
  - `lapses` n'est pas recalculé.
  - Il produit une révision « Manual » qui **déplace `due`**.

  → **À ne pas utiliser pour la conversion**, car il violerait la contrainte n°1. Il reste utile
  plus tard, en mode ombre, pour comparer.
- **Fuzz** : désactivé par défaut. Il est déterministe s'il est activé (graine = date + reps +
  D×S ; `GenSeedStrategyWithCardId` disponible). Recommandation : OFF au démarrage.

### Architecture proposée (étape 2 et suivantes)

1. **Module unique `lib/fsrsPlanificateur.js`** : le seul à importer ts-fsrs.
   - Il convertit les dates en midi local et en `YYYY-MM-DD`.
   - API : `etatFSRS(carte)`, `noter(carte, rating, maintenant)` →
     `{ carte: {…, dueDate, fsrs: {...}}, log }`, `apercu(carte)` pour les libellés des
     boutons, `depuisMaison(carte)`.
   - L'état FSRS est rangé dans un sous-objet `fsrs` de la carte. Il écrit toujours `dueDate`
     et `termine`, que le planning lit.
2. **Interrupteur `reglagesFC.planificateur` = `'maison' | 'ombre' | 'fsrs'`, OFF (`'maison'`)
   par défaut.** Il est synchronisé (`prompts/reglagesFC`) et lu aux 3 points de notation des
   flashcards.
3. **Mode ombre**
   - **Ce qu'il fait** : le moteur maison décide et écrit `dueDate`. FSRS calcule en parallèle
     et **journalise seulement** : due FSRS proposé, S, D, rappel estimé. L'état FSRS
     « fantôme » vit dans le journal, pas dans `dueDate`.
   - **Ce qu'il permet** : comparer sur quelques semaines les dates maison et les dates FSRS,
     et le taux d'oubli réel. Le choix de D (décision n°4) pourra s'appuyer sur ces mesures.
4. **Journal immuable** : store local `review_log` + `medrevise_review_log` au cloud, en ajout
   seul (§8). Une ligne par réponse, id uuid :
   - `{card_id, reviewed_at, jour_local, rating 1-4, ancienne_qualite?, due_avant, due_apres,
     fsrs_avant, fsrs_apres, planificateur, version_algo, appareil, source}` ;
   - jamais modifiée. Un retour arrière se fait par une nouvelle ligne `annulation`.
5. **4 boutons** (À revoir / Difficile / Correct / Facile), avec l'aperçu de l'échéance tiré de
   `f.repeat` (« Correct · J+15 »), dans la séance du jour et dans les séries, pour les
   flashcards seulement. Les QCM gardent leurs 3 boutons et `sm2.js`.
6. **Date de départ conservée** : une carte neuve a `dueDate` = date de départ (inchangé :
   `startAdaptive`, Décaler le départ). Elle apparaît **une seule fois** ce jour-là, en état New,
   est notée, puis FSRS décide (Again 1 j / Hard 2 j / Good 3 j / Easy 8 j).
7. **Migration de conversion** (étape 3 ou plus tard) : elle ajoute `fsrs` à chaque flashcard
   **sans toucher `dueDate`**. Elle passe par `putBackup` d'abord, avec un verrou. Elle est
   vérifiée par empreinte : l'ensemble des `id → dueDate` avant et après doit être
   **strictement égal**. Elle est rejouable sans effet.

### Risques restants et neutralisation

| Risque | Neutralisation |
|---|---|
| Intervalles FSRS beaucoup plus longs après conversion (§11) | Mode ombre d'abord. D initiale plus élevée, ou tirée de l'historique (décision n°4). `maximum_interval` choisi (décision n°5). Bascule carte par carte possible. |
| Une date actuelle modifiée par erreur (contrainte n°1) | La conversion n'écrit jamais `dueDate`. Test d'empreinte `id → dueDate` avant/après. `rollback` disponible. Sauvegarde du 10/10. |
| Décalage d'un jour (UTC, heure d'été du 25/10) | Midi local partout. Tests avec horloge décalée au 24/10 00:30 et au 25/10 02:30. |
| Deux appareils, versions différentes de l'app | L'état FSRS est dans un sous-objet ignoré par l'ancien code. Le planning ne lit que `dueDate`, que les deux versions écrivent. Interrupteur OFF par défaut. |
| Révisions concurrentes perdues par le LWW | Le journal en ajout seul les garde toutes. Une reconstruction reste possible. |
| Croissance du journal et synchro complète | Store isolé, hors `SYNCABLE`, lecture incrémentale. |
| QCM et schémas touchés par erreur | `sm2.js` non modifié. Aiguillage `type === 'flashcard'` seulement. |
| Suppression de l'apprentissage → 77 cartes dans le rattrapage | Conversion en New avec date de passage = `learningDue`, faite AVANT de retirer le filtre. |
| Mise à jour de ts-fsrs | Version exacte 5.4.2. La 6.0 bêta est exclue. |

**Verdict : projet faisable et non déconseillé**, à condition de passer par le mode ombre avant
la bascule. C'est le seul vrai risque : FSRS imposerait des intervalles plus longs que ceux
auxquels Yoann est habitué.

---

## 13. Décisions à prendre par Yoann

1. **« Méthode des J des chapitres »** : le code n'a pas de planification J par chapitre.
   - Est-ce bien le planning par cours (série du jour, calendrier, rappels J, badge J+N) ? Il
     est calculé sur les cartes et restera intact si FSRS écrit `dueDate`.
   - Ou s'agit-il d'autre chose ?
2. **Libellé « J+N »** d'une flashcard sous FSRS : jours restants jusqu'à l'échéance
   (proposé), ou stabilité ?
3. **Correspondance de l'historique importé** : Facile (5) → **Easy** (littéral, votre
   hypothèse) ou → **Good** (c'était la réussite normale, 77 % des notes) ? Proposé : stocker
   les deux (`rating` + `ancienne_qualite`) et ne pas s'en servir pour initialiser les cartes.
4. **Difficulté initiale à la conversion** :
   - D0(Good) = 2,12 (« par défaut », intervalles ×4–6) ;
   - D ≈ 7 (rythme proche de l'actuel) ;
   - D tirée de l'historique de chaque carte (part de Raté et Difficile).

   Proposé : décider après 2–3 semaines de mode ombre.
5. **Plafond d'intervalle** (`maximum_interval`) : le maison plafonnait à 90 j, puis terminait.
   FSRS : 36 500 j par défaut. Proposé : 365 j, sans « terminée ».
6. **Journal au cloud** : table dédiée `medrevise_review_log` (SQL à exécuter par vous dans
   Supabase, recommandé) ou lignes `store = 'review_log'` dans `medrevise_records` (rien à
   créer) ?
7. **Rétention cible** : 0,90 (défaut) ? Une valeur plus haute raccourcit les intervalles.
8. **Cartes `termine` (4) et cartes hors planning (687)** : convertir aussi (proposé : oui,
   sans changer leur date ni leur planification), ou laisser tel quel ?
9. **Doublons « Que cachent les masques ? »** (4 cartes) : à fusionner ou à garder (hors
   FSRS) ?
10. **`enable_short_term: false`** (Good = 3 j pour une nouvelle carte) ou `true` (2 j) ?
    Proposé : `false`.
