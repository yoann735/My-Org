# FSRS-6 dans les flashcards — Étape 2 : livré sous interrupteur OFF, mode ombre et journal actifs (10/10/2026)

Prérequis appliqués : `docs/fsrs-etape1-audit.md`, sauvegarde `pre-fsrs-2026-10-10` (vérifiée 283/283),
tag et branche `backup/pre-fsrs`.

## En bref

- **Interrupteur « Utiliser FSRS pour les dates » : OFF par défaut.** Tant qu'il est OFF, les dates
  sont exactement celles d'avant. C'est prouvé par les tests :
  - sur 200 vraies cartes, même prochaine date et même résultat de notation que le code du tag ;
  - sur 14 et 30 jours, même calendrier, même série du jour et même rattrapage, pour toutes les
    cartes hors conversion.
- **Mode ombre et journal des révisions : actifs dès l'installation.**
  - Chaque réponse est journalisée.
  - FSRS calcule sa date dans le bloc `fsrs` de la carte, sans jamais toucher `dueDate` quand
    l'interrupteur est OFF.
- **Mode Apprentissage converti, puis supprimé**, sans aucune carte en rattrapage :
  - 297 cartes converties, dont 77 dans la séance du jour ;
  - 220 hors planning, mises à demain ;
  - 0 en rattrapage.
- **Séance du jour unique** : « 116 cartes · ≈ 29 min » → Démarrer, avec 4 boutons et l'intervalle
  prévu dessous.
- **Migration FSRS** : seulement répétée à blanc, sur une copie de la sauvegarde → **rapport
  parfait** (`docs/fsrs-migration-rapport.md`) : 894 cartes, 0 écart de date, 0 écart de contenu,
  charge identique.

  **Non appliquée aux vraies données** : le bouton est prêt (Réglages → FSRS), c'est toi qui le
  déclencheras.
- **Tests** : vitest 26/26 vert, build vert.

  Tests dans Chrome (bureau 1 440 px et téléphone 390 px), sur une copie des vraies données et un
  faux cloud local, jamais le vrai : tous les points de la liste sont passés, détails au §8.
- **MealWeek et `src/shared/` : 0 fichier modifié** depuis le tag. Commande de contrôle :
  `git diff pre-fsrs-2026-10-10 --name-only -- src/mealweek src/shared src/App.jsx src/Selecteur.jsx src/main.jsx`.
- **Migration SQL du journal : préparée, non appliquée** (`supabase/migrations/20261011_medrevise_review_log.sql`).
  En attendant, l'app l'indique dans Réglages → Synchronisation, et les réponses restent en file
  sans perte.

---

## 1. Architecture

```
src/medrevise/scheduler/        planificateur (SEUL endroit qui importe ts-fsrs 5.4.2, version exacte)
  jours.js        jours civils 'YYYY-MM-DD', fuseau Europe/Brussels, bascule à 4 h, midi local
  config.js       options : rétention 0,9 · Intervalle maximum 45 (7–365) · pas [] / [] · court terme off
                  · fuzz ON en production, OFF en test · difficulté de départ 7 · interrupteur
  fsrs.js         bloc FSRS ⇄ carte ts-fsrs ; previsualiser / appliquer / initialiser / reconstruire
  noter.js        noterFlashcard : aiguillage maison ⇄ FSRS + ombre + entrée de journal ; intervalles prévus
  repondre.js     enregistre la carte puis l'entrée de journal (appelé par les 3 écrans de notation)
  migration.js    migrerVersFSRS, basculerVersFSRS, filetEtalement, chargeParJour (purs)
  ombre.js        rapport ombre (charge 30 j maison vs FSRS, exemples)
src/medrevise/journal/          journal des révisions
  journal.js      stores IndexedDB NEUFS medrevise-review_log + medrevise-review_log_outbox, appareil
  synchro.js      envoi idempotent / réception incrémentale vers medrevise_review_log ; recalcul des cartes
  fusion.js       union par id, tri (reviewed_at, id), lignes ⇄ entrées (purs)
src/medrevise/lib/conversionApprentissage.js   conversion des cartes « en apprentissage » (pure)
src/medrevise/components/BoutonsFlashcard.jsx  les 4 boutons (bureau, mobile, séance)
src/medrevise/components/ReglagesFSRS.jsx      Réglages → FSRS (ombre)
src/medrevise/components/SynchroJournal.jsx    Réglages → Synchronisation → Journal des révisions
```

**Le bloc FSRS** est un champ ajouté `fsrs` sur chaque flashcard :

```
{ state, stability, difficulty, reps, lapses, derniere, due, intervalle, source, base, majLe, migre? }
```

- Toutes les dates sont en jours civils.
- `base` est l'état de départ du journal.
- Aucun champ existant n'est renommé, modifié ou supprimé par le code FSRS. `dueDate` n'est écrit
  par FSRS que si l'interrupteur est ON.

**Ce qui ne change pas :**
- `lib/sm2.js` : QCM, schémas, `labelForCursor`, `startAdaptive`.
- La synchro générale (`syncNow` / `reconcileAll` / RPC `medrevise_push`).
- Le calendrier, le badge J+N, la série du jour et le rattrapage, qui lisent toujours `dueDate` via
  `planning.js nextDate`.

**Choix tranchés pendant le chantier** (le brief laissait une marge) :

1. **« Difficulté de départ 7 » pour les 582 cartes avec historique.** C'est la difficulté posée à
   la première note rejouée ; elle évolue ensuite avec les notes suivantes.
   - En ts-fsrs 5.4.2, `reschedule` repart toujours d'une carte vierge : son `first_card` n'est lu
     que pour la date, vérifié à l'étape 1.
   - L'état est donc reconstruit en rejouant `next`, exactement comme `reschedule` le fait en
     interne.
   - Les répétitions du même jour sont fusionnées : seule la première note du jour compte.
2. **Bascule à 4 h**, appliquée :
   - au planificateur FSRS (jour de révision, échéance) ;
   - au journal (`jour`).

   Le planning maison et la séance gardent `todayISO()` (minuit), pour garantir « OFF = identique ».
   - **Conséquence** : interrupteur ON, une séance faite à 1 h du matin affiche les cartes du
     nouveau jour civil.
   - La réponse est datée de la veille, et l'échéance comptée depuis la veille.
3. **Plafond réappliqué après ts-fsrs.** ts-fsrs impose « Facile > Correct + 1 jour », ce qui
   dépassait le plafond de 1 ou 2 jours (46–47 j pour 45). Le test l'a détecté. La date finale est
   donc plafonnée par le module ; la stabilité n'est pas touchée.
4. **Fuzz en production : déterministe.** Les dates passées à ts-fsrs sont à midi, donc la graine est
   identique sur deux appareils pour une même réponse.
5. **Après « Déplacer » / « Sauter » / « Reporter »**, seul `dueDate` (ou `skippedOn`) change ;
   `fsrs.due` garde l'avis de FSRS. La date réelle reste `dueDate`.
6. **« Réinitialiser les dates »** (action manuelle existante) efface aussi le bloc `fsrs`.

## 2. Correspondance des boutons

| Bouton | Note FSRS | Interrupteur OFF : planificateur maison (inchangé) | Interrupteur ON |
|---|---|---|---|
| À revoir | Again (1) | Raté (qualité 1) : J+1, intervalle remis à 1 | FSRS, demain au plus tôt (pas de réapprentissage dans la séance) |
| Difficile | Hard (2) | Difficile (qualité 3) : ×1,3, au moins +1 j | FSRS |
| Correct | Good (3) | **Facile (qualité 5)** : le maison n'a pas d'équivalent ; sa réussite normale était « Facile » | FSRS |
| Facile | Easy (4) | Facile (qualité 5) | FSRS |

- **Cloze en saisie** (note automatique d'après le % de trous justes) : 5 → Correct, 3 → Difficile,
  1 → À revoir. Interrupteur OFF, le résultat est le même qu'avant.
- **QCM et schémas d'anatomie** : 3 boutons et moteur maison, inchangés (capture 07).
- Sous chaque bouton : l'intervalle prévu (« demain », « 3 j », « 2 mois », « terminée »), FSRS si ON,
  maison si OFF.
- L'astuce « Difficile = réussi avec effort » s'affiche une fois au-dessus du bouton (capture 04),
  puis reste en infobulle.
- **Séries Réviser / Bibliothèque / Dashboard** (Session.jsx, MobileSession.jsx) :
  - interrupteur OFF : un « À revoir » repasse en fin de série, comme avant ;
  - interrupteur ON : pas de répétition pour les flashcards (relearning_steps vides).

## 3. Conversion des 297 cartes, puis suppression du mode Apprentissage

**Migration locale `conversion-apprentissage-v1`** (`lib/migrate.js`) :
- exécutée après la synchro de démarrage ;
- idempotente, carte par carte, grâce au champ ajouté `conversionApprentissage` ;
- rejouée à chaque démarrage pour rattraper une carte encore mise en apprentissage par un appareil
  pas à jour ;
- **putBackup automatique** des cartes concernées avant écriture ;
- rapport consigné dans `meta` (`migration.conversion-apprentissage-v1`) et dans la console.

Avant même qu'elle n'écrive, `planning.nextDate` lit déjà la date convertie. Aucune ancienne carte en
apprentissage ne peut donc apparaître dans le rattrapage pendant le premier démarrage.

**Résultat sur la copie de la sauvegarde** (test vitest, banc Chrome et `meta` du profil de test,
identiques) :

| En apprentissage | Converties | Séance du jour → 10/10 | Date future gardée | Demain | Hors planning | En rattrapage après |
|---|---|---|---|---|---|---|
| 297 | **297** | **77** | 0 | 220 | 220 | **0** |

- **Les 77** sont bien dans la séance : « 116 cartes » = 39 révisions + 77 (captures 01 → 02).
- **Les 220 « demain »** sont toutes hors planning (cours Rattrapage aux rappels J coupés, fiches
  archivées) : elles n'apparaissent nulle part.
- Seul `dueDate` change, plus le champ ajouté. `learnState` et les champs `learning*` restent en
  base et ne sont plus lus.
- **Retiré** :
  - l'écran de paquet, la présentation « Compris, suivante », Pas su / Su ;
  - les succès consécutifs, la réinsertion, la bascule Révisions / Apprentissage ;
  - les boutons « Révisions (n) · Apprentissage (n) » ;
  - le réglage « Critère de succès » et le compteur « à apprendre / nouvelles » ;
  - la fusion d'apprentissage v1.2 de la synchro (retour au LWW simple) ;
  - les migrations apprentissage v1 / v1.1 ;
  - le CSS orphelin.
- **Conservé** : le réglage « Carte Muscle ligne par ligne », dans le même enregistrement `reglagesFC`.
- **La séance quotidienne** :
  - toutes les flashcards planifiées dues aujourd'hui ou avant ;
  - une vue chacune, cours mélangés ;
  - en-tête « N cartes · ≈ M min », Démarrer ;
  - **reprise** : « Séance commencée · 96 cartes restantes · Reprendre ». Les cartes entrées
    entre-temps sont ajoutées en fin, celles notées ailleurs sont retirées.
  - Une séance enregistrée par l'ancienne version (format v1) n'est pas reprise : une séance neuve
    démarre.

## 4. Journal des révisions

- **Une entrée par réponse**, interrupteur ON ou OFF, répétitions de séance comprises (marquées
  `relearn`) :

  ```
  { id: UUID généré sur l'appareil, card_id, rating 1–4, reviewed_at, jour, device, scheduler_version,
    planificateur, state_before, state_after, details }
  ```

  Une entrée n'est jamais modifiée.
- **File hors ligne** : store `medrevise-review_log_outbox`.
  - Envoi 3 s après chaque réponse, et après chaque synchro générale réussie.
  - L'envoi se fait par upsert `ignoreDuplicates` sur l'id, c'est-à-dire `insert … on conflict do nothing` :
    **renvoyer une ligne n'a aucun effet**.
- **Réception** : incrémentale par `inserted_at` (heure du serveur), avec 5 min de recouvrement et
  dédoublonnage par id.
- **Après réception** : l'état FSRS des cartes concernées est **recalculé à partir du journal trié**
  (base + entrées triées par `(reviewed_at, id)`, une révision par jour de révision). Le résultat
  est le même quel que soit l'ordre d'arrivée.
- **Coexistence** : la synchro générale n'est pas modifiée. Le journal a son propre canal, appelé
  après elle.
- **Réglages → Synchronisation** :
  - dernière synchro du journal ;
  - révisions en attente ;
  - réponses sur cet appareil ;
  - « Synchroniser maintenant » ;
  - avertissement si la table cloud est absente (capture 11).

## 5. Mode ombre

- À chaque réponse, FSRS calcule son état et sa date : bloc `fsrs` de la carte, plus `state_after`
  et `details.dueFsrs` du journal.
- `dueDate` reste celle du maison tant que l'interrupteur est OFF. Vérifié sur 20 réponses dans
  Chrome : 20 dates sur 20 conformes au moteur maison.
- **Réglages → FSRS (ombre)** (capture 09) :
  - nombre de réponses journalisées, par note ;
  - tableau jour par jour sur 30 jours, maison vs FSRS (les jours qui diffèrent sont en couleur) ;
  - 10 exemples avec les deux dates ;
  - « Exporter le rapport ombre » (JSON).

  Après 20 réponses dans le banc : 20 réponses, 6 jours différents, 10 exemples.

## 6. Migration FSRS : répétée à blanc uniquement

- **Script** : `scripts/fsrs/migration-a-blanc.mjs`, en lecture seule, sur une copie en mémoire. Les
  empreintes de la sauvegarde sont vérifiées avant et après.
- **Rapport** : `docs/fsrs-migration-rapport.md`, **RAPPORT PARFAIT** :

| Contrôle | Résultat |
|---|---|
| Flashcards avant = après | 894 = 894 |
| `dueDate` modifiées | **0** |
| Échéance FSRS ≠ `dueDate` | **0** |
| Contenu modifié (SHA-256 par carte, hors `fsrs`) | **0** — riches (Muscle, images, masques) 41/41 intacts |
| Charge par jour sur 30 jours | identique |
| Bascule ON juste après | 0 date modifiée, 0 étalement |
| Sources de l'état | historique rejoué 582 · estimation 26 · nouvelles 286 |

- **Sur les vraies données**, le bouton Réglages → FSRS → « Appliquer la migration… » fait ceci :
  1. il calcule et **affiche le rapport avant toute écriture** : dates modifiées, contenu modifié,
     charge avant = après (capture 10) ;
  2. « Confirmer » n'est actif que si tout est à 0 et identique ;
  3. **putBackup automatique** des cartes, puis écriture du seul champ `fsrs`.

  Dans le banc, sur un profil de test, il a donné : 894 cartes, 0 date modifiée, 1 sauvegarde
  `pre-fsrs-migration-*`.

  **Il n'a pas été déclenché sur tes données.**

## 7. Procédure de bascule et de retour arrière

**Bascule** (quand tu le décides, sur un appareil, le réglage se synchronise) :
1. Réglages → FSRS (ombre) : regarder le tableau maison vs FSRS et l'export du rapport ombre.
2. « Appliquer la migration… » → lire le rapport (0 / 0 / identique) → « Confirmer ».
3. Interrupteur « Utiliser FSRS pour les dates » → ON.
   - `fsrs.due` est réaligné sur `dueDate` : **aucune date ne change** (vérifié : 0).
   - Filet : si la bascule mettait plus de 80 cartes dues le même jour (en en ajoutant), l'excédent
     est étalé sur 7 jours, avec un message. C'est testé avec un afflux simulé.
   - Ensuite, chaque réponse prend la date FSRS. Dans le banc : « Correct » prévu J+16 → `dueDate`
     posée au 26/10, contre 23/10 avec le maison.

**Retour arrière, par paliers :**
1. **Interrupteur OFF.** Le planificateur maison reprend aussitôt. Les dates actuelles sont gardées
   (0 changée au moment du retour) et les anciens champs (`intervalDays`, `historique`…) sont
   intacts. Le mode ombre continue.
2. **Annuler la migration FSRS** : restaurer la sauvegarde automatique `pre-fsrs-migration-<horodatage>`
   (store `backups`). Ou simplement ignorer le champ `fsrs` : l'interrupteur OFF n'en dépend pas.
3. **Revenir au code d'avant** : `git revert --no-edit pre-fsrs-2026-10-10..main && git push`.
   - Le code d'avant ignore les champs ajoutés.
   - Les cartes converties y redeviendraient des cartes « en apprentissage » : `learnState` est
     conservé.
4. **Revenir aux données d'avant** : `scripts/sauvegarde-fsrs/restore.md`, procédure de l'étape 1.

## 8. Tests

**Automatiques** (`npm test`, vitest 2.1.9, fuseau Europe/Brussels, fuzz OFF) : **26/26**. Fichiers :
`tests/fsrs/planificateur.test.js`, `tests/fsrs/journal.test.js`, `tests/fsrs/donnees.test.js`.

| Exigence | Test | Résultat |
|---|---|---|
| 4 notes | carte neuve 1 / 2 / 3 / 8 j ; révision strictement croissante ; intervalle affiché = appliqué ; correspondance OFF | ✓ |
| Carte non révisée reste due sans perte | même `dueDate`, toujours dans la séance du 05/10 au 30/10 | ✓ |
| Réponse en retard | intervalle plus long, compté depuis le jour de réponse | ✓ |
| Séance entre minuit et 4 h = veille | 00:10 / 03:59 → veille ; 04:00 → jour | ✓ |
| 25/10/2026 et 28/03/2027 | midi = midi à Bruxelles ; échéance = jour + intervalle à 04:30 / 10:00 / 23:30, ±5 jours autour des deux changements | ✓ |
| Plafond 45 j | 8 « Facile » d'affilée ≤ 45 ; bornes 7–365 ; plafond 10 respecté | ✓ (le défaut de ts-fsrs a été trouvé ici) |
| Deux appareils hors ligne, même carte | journal fusionné, même état quel que soit l'ordre, doublons et répétitions ignorés | ✓ |
| Même ligne envoyée deux fois | 1 seule ligne ; table absente signalée | ✓ |
| Conversion | **297** converties, **77** séance, **0** rattrapage, idempotente, rien d'autre touché | ✓ |
| Migration sur copie | rapport parfait (894, 0 écart, charge identique, 582 historiques) | ✓ |
| OFF = identique sur 200 cartes | comparé au **code du tag** : `nextDate` + notation des 3 anciens boutons ; calendrier 30 j et rattrapage | ✓ |
| ON juste après migration | 0 date modifiée, 0 étalement | ✓ |
| Filet | afflux simulé de 150 → 80 gardées, 70 étalées sur les 7 jours suivants | ✓ |

**Dans Chrome** (`scripts/tests-fsrs/`). Conditions :
- Chrome headless ;
- profil restauré depuis la sauvegarde, pour l'origine `localhost:5199` ;
- Vite branché sur le **faux Supabase** local (`scripts/faux-supabase.mjs`, avec une table du
  journal ajoutée, absente par défaut comme au vrai cloud) ;
- jamais le vrai cloud.

| Exigence | Résultat (captures `docs/img/fsrs-etape2/`) |
|---|---|
| App identique avec l'interrupteur OFF | Avant / après sur la même copie, ancien code (worktree du tag) puis nouveau : calendrier sur 14 jours **identique** pour toutes les cartes non converties (0 jour différent), rattrapage 0 / 0, badges J+N identiques (seules 5 fiches qui n'avaient que des cartes en apprentissage passent de « — » à « J+1 »). 0 erreur console. (01, 02, 03) |
| Plus de mode Apprentissage, les 77 cartes dans la séance | « Séance commencée · 116 restantes · Révisions (39) · Apprentissage (77) » devient « 116 cartes · ≈ 29 min · Démarrer » ; 297 converties, 0 rattrapage (02, 03) |
| 4 boutons avec intervalles | séance bureau (04), séance mobile 2 × 2 (05), série bureau 14 flashcards à 4 boutons et 10 QCM à 3 boutons (06, 07), série mobile 12 flashcards (08) ; astuce affichée une seule fois |
| Écran ombre alimenté après 20 réponses | 20 réponses, 20 cartes calculées, 6 jours différents, 10 exemples (09) |
| Synchro du journal entre 2 appareils | Le téléphone (profil vide) reçoit 1 583 cartes et 20 entrées et affiche le même encart (96). 5 réponses sur le téléphone, faites par de vrais clics : journaux 25 / 25, cloud 25, blocs identiques 5/5. Même carte notée hors ligne des deux côtés : journaux identiques (34), même état FSRS. |
| Table absente | avertissement, 40 en attente, puis 0 après rétablissement (11) |
| Contenu riche | carte Muscle (tableau révélé ligne par ligne) dans la séance (12) ; images ; cours PDF : 3 pages rendues, calque texte (14) ; panneau Transcript ouvert |
| MealWeek intacte | ouverture depuis le hub, planning affiché, 0 erreur (15) ; 0 fichier modifié |
| Bascule (profil de test) | migration 894 / 0 date ; ON → 0 date ; réponse ON = date FSRS = intervalle prévu ; OFF → 0 date au retour (13) |

**Constat hors périmètre**, préexistant et non modifié : dans tes données, le fichier de la fiche HTML
« Isotopes » est stocké avec le type `text/plain`, si bien que la vue « Voir le cours » l'affiche en
code source. Le code d'affichage HTML (`pdf/CourseHtmlView.jsx`) n'a pas été touché. C'est à regarder
séparément.

## 9. Migration SQL à appliquer par toi

Fichier : `supabase/migrations/20261011_medrevise_review_log.sql`. **Ajout seul**, rejouable sans
effet :
- table `medrevise_review_log` (id uuid PK, card_id, rating 1–4, reviewed_at, device,
  scheduler_version, state_before, state_after, details, inserted_at) ;
- 2 index ;
- RLS `anon` en select et insert seulement (ni update ni delete).

1. Supabase → projet « My Org » → SQL Editor → coller le fichier → Run.
2. Contrôle : `select count(*) from public.medrevise_review_log;` puis
   `select policyname, cmd from pg_policies where tablename = 'medrevise_review_log';`
   (attendu : `select` et `insert`).
3. Dans l'app : Réglages → Synchronisation → « Synchroniser maintenant ». L'avertissement disparaît,
   « révisions en attente » passe à 0.

Tant que ce n'est pas fait, rien ne casse : les réponses sont journalisées localement et partiront
dès que la table existera.

## 10. Ce qui se passera au premier lancement après déploiement

1. La synchro générale tourne, comme aujourd'hui.
2. Puis la conversion : putBackup, puis conversion des cartes en apprentissage. Il y en avait 297 dans
   la copie de 18:39 ; le chiffre réel peut différer si des cartes ont été créées ou apprises depuis.
   Le téléphone recevra les cartes déjà converties.
3. L'encart affiche « N cartes · ≈ M min » et la séance a 4 boutons. Les dates restent celles du
   planificateur maison.
4. Le journal tente d'envoyer ; la table est absente → avertissement dans Réglages, jusqu'au SQL.
5. **Aucune migration FSRS, interrupteur OFF.**

Un appareil resté sur l'ancienne version (onglet jamais rechargé) montre encore l'ancien mode
jusqu'à son rechargement ; ses éventuelles cartes remises en apprentissage seront converties au
démarrage suivant de la nouvelle version.

## 11. Fichiers

- **Code** : `src/medrevise/scheduler/*`, `src/medrevise/journal/*`, `lib/conversionApprentissage.js`,
  `components/BoutonsFlashcard.jsx`, `components/ReglagesFSRS.jsx`, `components/SynchroJournal.jsx`.
- **Modifiés** :
  - `lib/apprentissageFC.js` (réduit), `lib/planning.js`, `lib/migrate.js`, `lib/storage.js` (fusion retirée) ;
  - `lib/diagnosticExport.js`, `session/SeanceFC.jsx` (réécrite), `session/Session.jsx` ;
  - `mobile/MobileSession.jsx`, `mobile/MobileApp.jsx`, `components/SeanceAujourdhui.jsx` ;
  - `components/CourseItemsSidebar.jsx`, `pages/Reglages.jsx`, `MedReviseApp.jsx` ;
  - `src/styles/etudes.css`, `src/styles/medrevise-mobile.css`.
- **Dépendances** : `ts-fsrs` 5.4.2 (exacte) ; en développement, `vitest` 2.1.9 et `fake-indexeddb`
  6.0.1. Script `npm test`.
- **Outils** :
  - `scripts/fsrs/migration-a-blanc.mjs` ;
  - `scripts/tests-fsrs/` (banc Chrome) ;
  - `scripts/faux-supabase.mjs` (table du journal) ;
  - `scripts/sauvegarde-fsrs/chrome-isole.mjs` (variable `ORIGINE`).
