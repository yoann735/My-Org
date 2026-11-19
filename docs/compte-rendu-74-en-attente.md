# « 74 en attente » sur le téléphone (19/11/2026)

**En bref**

- **Les 74 éléments sont 74 événements « Passer en révision ».** Ce bouton du bloc Nouvelles journalise un événement sans note (`rating = null`). Le serveur refuse ces lignes tant que la migration `20261024_review_log_evenements.sql` n'est pas appliquée. L'ancien code ignorait ce refus : l'événement restait en file pour toujours, et la passe se terminait quand même « réussie ».
- **74 éléments : 0 faux en attente, 74 vraiment non envoyés (partiront à la prochaine ouverture), 0 conflit.** Aucune révision notée n'est bloquée : les notes sont toutes au serveur.
- **La correction :**
  - une seule règle de sortie de file pour tous les types d'éléments : la **preuve du serveur**, obtenue en relisant ce qu'il a ;
  - un canal de repli pour les événements, qui fonctionne **sans migration** ;
  - une empreinte qui couvre aussi le journal des révisions ;
  - une réconciliation automatique ;
  - une liste dépliable qui donne la vraie raison de chaque élément.
- **Testé :**
  - bug reproduit sur le code d'avant, absent sur le code d'après (ordinateur, tablette tactile, téléphone tactile) ;
  - 18 tests automatiques lancés par `npm run build` ;
  - aucune écriture Supabase, aucune migration appliquée, MealWeek inchangé.

---

## 1. Diagnostic

### 1.1 Sources, toutes en lecture seule

| Source | Méthode | Résultat |
|---|---|---|
| **Diagnostic exporté du téléphone** | Cherché dans `~/Downloads`, puis sur tout le Mac (Spotlight). | **Absent.** Le seul fichier `medrevise-diagnostic-*` date du 29/10 et vient de `localhost`. L'export de l'ancien code ne contenait de toute façon que le *nombre* d'éléments du journal en attente (`journal.enAttente`), sans leurs identifiants. Il n'aurait donc pas permis de lister les 74 un par un. C'est corrigé (§ 2.6). |
| **Données du Mac** | Copie du dossier IndexedDB d'Aside, lue dans un Chrome headless isolé : réseau coupé, page vide, le code de l'app ne tourne jamais (`scripts/sauvegarde-fsrs/export-idb.mjs`). | 36 bases, 7 996 entrées, 0 erreur. |
| **Serveur** | `GET` paginés avec la clé anon publique du bundle déployé : `medrevise_review_log` (toutes les lignes) et les métadonnées de `medrevise_records`. **Aucune écriture.** | 1 457 entrées de journal, 7 140 lignes d'enregistrements. |

### 1.2 Les 74 éléments, classés

| Classe | Nombre | Preuve |
|---|---|---|
| **(a)** présent à l'identique au serveur = faux en attente | **0** | Le serveur ne contient **aucune** ligne `rating = null` (0 sur 1 457) et aucun enregistrement d'événement. |
| **(b)** absent du serveur = vraiment non envoyé | **74** | Les 74 sont des événements `passage_revision`. Le serveur n'en contient aucun. |
| **(c)** le serveur a une version plus récente | **0** | Une entrée de journal est immuable. Aucun id en double n'a été trouvé. |

**Pourquoi les 74 sont tous des événements, et aucun une note.** La preuve passe par le code, faute du fichier du téléphone :

1. Sur le téléphone, « Dernière synchro réussie : 19/11 21:33 ». Dans l'ancien code, cette date n'est écrite que si la passe a réussi (`MedReviseApp.jsx`, porte `ajour`).
2. Pour réussir, la passe doit obtenir `ok: true` de `synchroniserJournal`.
3. Dans l'ancienne `passe()` (`journal/synchro.js`), les **notes** partent en premier. Le moindre refus fait rendre `ok: false`, donc « Synchro en échec », jamais « réussie ». Une note acceptée sort de la file.
4. Les **événements sans note** partaient ensuite, à part. Leur refus était **ignoré** : seul un compteur interne `evenementsEnAttente` était mis à jour, et la passe rendait quand même `ok: true`.
5. Les entrées orphelines étaient effacées au début de chaque passe.
6. Donc, après une passe réussie, la file du journal ne peut plus contenir **que** des événements refusés. Les 74 sont ceux-là.

**Recoupement avec les données.**

- Le journal du serveur s'arrête à 09:07 le 19/11 : c'est la dernière note du téléphone (`téléphone:aa2d7370`).
- Le serveur ne contient aucun événement.
- Les cartes du Mac montrent **88 cartes « passées en révision »** depuis le 26/10 (champ `nouvellePasseeLe`, synchronisé) : 11 le 26/10, 7 le 27/10, 16 le 31/10, 1 le 02/11, 39 le 06/11 et 14 le 19/11.
- Aucun de ces 88 événements n'est au serveur, ni dans le journal du Mac (0 événement, file vide).
- 74 sont sur le téléphone. **Les 14 autres sont probablement sur un autre appareil, sans doute l'iPad, qui devrait alors afficher « 14 en attente ».** Ils partiront de la même façon.

**Le « +1 à chaque carte notée » (67 → 74).** C'était « Passer en révision » dans le bloc Nouvelles. La carte quitte les Nouvelles, ce qui ressemble à une notation, et ajoute un événement à la file. Les vraies notes (« Correct », « Facile »…) partaient bien.

**Limite.** Sans le fichier du téléphone, je ne peux pas donner les 74 identifiants un par un. Le classement repose sur la logique exacte de l'ancien code et sur la lecture complète du serveur. Le nouvel export de diagnostic liste désormais chaque élément avec son classement d'après le serveur (§ 2.6). Si tu en exportes un **avant** d'ouvrir la version corrigée, il confirmera les 74 un par un.

### 1.3 Les hypothèses vérifiées une par une

| Hypothèse | Verdict | Preuve |
|---|---|---|
| Envoyé, mais confirmation jamais enregistrée (app tuée par iOS) | **Non, pour ces 74.** | Ils ne sont pas au serveur. Le cas reste possible en général : il est maintenant couvert (relecture, test « app tuée en plein envoi »). |
| Nouvel envoi refusé comme doublon (clé existante) et traité comme une erreur | Non. | L'envoi utilisait déjà `ignoreDuplicates`. Un 23505 compte désormais aussi comme un succès, sous réserve de la relecture. |
| Journal jamais retiré de la file après succès | Non. | Les notes acceptées sortaient bien de la file : le serveur a toutes celles du Mac, et la file du Mac est vide. |
| Erreur de droits (RLS) sur l'insertion | Non. | Les notes passent avec la même clé. Avant, un refus de droits aurait d'ailleurs fait échouer la passe. |
| Transaction IndexedDB interrompue sur Safari iOS | Non. | Le nombre ne baisse jamais et monte de 1 à chaque passage : c'est une file qui grossit, pas une écriture perdue. |
| File alimentée deux fois pour une même notation | Non. | `ajouterAuJournal` ignore un id déjà présent. Testé. |
| **Refus « contrainte » (23514) des événements, avalé** | **Oui : c'est la cause.** | Reproduit au banc sur le code d'avant (§ 3.2). |

### 1.4 Ce que couvrait l'empreinte cloud

| | Avant | Après |
|---|---|---|
| Enregistrements (`medrevise_records`, stores synchronisés vivants) | oui | oui |
| **Journal des révisions** (`medrevise_review_log` + canal de repli) | **non** | **oui** : une ligne `journal\|id\|reviewed_at` par entrée, des deux côtés |
| Fichiers (bucket) | non : affichés à part, « 471/471 » | non : toujours à part, même affichage |
| Files d'attente | seulement la file des enregistrements, pour dire « À jour » | file des enregistrements **et** file du journal |

Avec l'ancienne empreinte, 74 réponses absentes du serveur laissaient l'empreinte du téléphone **identique** à celle du Mac (`ce74242562b3`). Désormais, une seule réponse manquante d'un côté change l'empreinte. Le calcul est le même sur tous les appareils (`lib/syncStatus.js`).

### 1.5 Le Mac

Sur la copie des données du Mac, le problème n'existe pas :
- file des enregistrements : 0 ; file du journal : 0 ; file des fichiers : 0 ;
- 1 457 entrées de journal, exactement celles du serveur (0 manquante de chaque côté) ;
- aucun événement sans note : le Mac n'a jamais servi à « Passer en révision ».

### 1.6 Pourquoi les correctifs précédents n'ont pas suffi

| Correctif | Ce qu'il traitait | Ce qu'il laissait passer |
|---|---|---|
| **« 4469 en attente »** (29/10, `compte-rendu-statut-synchro.md`) | La **file des enregistrements**, reconstruite à chaque passe : purge par comparaison au serveur, envoi par lots, sortie seulement de la version envoyée. | Elle ne touchait pas la **file du journal**, qui a son propre canal. La purge comparait au serveur les seuls enregistrements. |
| **« 19 en attente »** (07/11, `compte-rendu-sauvegarde-et-statut-synchro.md`) | Un **seul calcul** de l'état, la liste dépliable, et les faux « fichiers manquants » (`srcId` bfc…). | La liste **lisait** la file du journal, mais l'envoi du journal pouvait avaler un refus. La raison affichée était une phrase générique : « pas encore envoyée (envoi au prochain passage) ». Le compte rendu notait déjà : « je n'ai pas lu la file d'envoi de tes appareils ». |
| **Synchro incrémentale** (29/10) | Passe rapide, curseur, empreinte vérifiée en fond. | « À jour » ne regardait que l'empreinte des enregistrements et la file des enregistrements. Le journal pouvait garder des réponses non envoyées sans jamais rendre la passe « incomplète ». |
| **Événements sans note** (24/10, `compte-rendu-seance-categories.md`) | « Passer en révision » journalisé, migration préparée, « l'app garde ces événements dans sa file locale ». | Choix volontaire à l'époque : la migration devait suivre. Elle n'a jamais été appliquée. Sans canal de repli ni raison visible, la file a grossi en silence pendant quatre semaines. |

Le point commun : chaque correctif avait **sa** règle de sortie de file et **sa** définition de « À jour ». Il y a désormais **une** règle (la relecture du serveur, `lib/confirmationServeur.js`) et **une** définition de « en attente » (les deux files), partagées par tous les types d'éléments.

---

## 2. Correction

### 2.1 Une seule règle de confirmation (`src/medrevise/lib/confirmationServeur.js`, nouveau, pur)

Pour chaque élément en file, on compare ce qu'on a avec ce que le serveur **relu** possède. Quatre classes :

- `identique` : la **file** est vidée de cet élément, la donnée locale est gardée ;
- `absent` : l'élément part, ou repart, par le chemin normal ;
- `serveur_recent` : rien n'est écrasé, l'élément est signalé ;
- `different` : même id, autre contenu ; rien n'est écrasé, l'élément est signalé avec sa raison.

Quelle version est comparée :
- **enregistrement** : instant `updated_at` (« Z » = « +00:00 ») et état supprimé ;
- **journal** : même carte, même note, même instant `reviewed_at`.

La purge des enregistrements (`storage.js` `entreesDejaAuCloud`) et le journal (`journal/synchro.js`) utilisent **cette même fonction**.

### 2.2 Journal des révisions (`journal/synchro.js`, `journal/journal.js`)

Chaque passe se déroule ainsi :

0. **Passe complète seulement** (ouverture, retour au premier plan, « Forcer la synchro ») : **garde-fou par ids**.
   - On compare tous les ids du serveur à ceux de l'appareil.
   - Ce qui manque ici est reçu.
   - Ce qui manque au serveur et n'est pas en file est **remis en file**.
1. **Réconciliation.** Les ids en file sont relus au serveur par paquets de 100 : table et canal de repli.
   - Les identiques sortent de la file, avec un `putBackup('pre-confirmation-journal-…')` **avant**.
   - Les `different` restent en file et sont signalés.
2. **Envoi idempotent.**
   - Notes : vers la table. Un doublon de clé (23505) n'est pas une erreur.
   - Événements : vers la table d'abord. **Refus par la contrainte (23514 / 23502) → canal de repli** : un enregistrement `review_log_evenement` de `medrevise_records`, avec le même contenu que la ligne du journal, envoyé par la RPC `medrevise_push` habituelle. La table est générique et sans liste blanche : **aucune migration n'est nécessaire**.
   - Une fois la migration appliquée, les nouveaux événements iront dans la table, comme les notes.
3. **Preuve.** Les ids envoyés sont relus. Seuls les identiques sortent.
   - Ce qui reste reçoit un compteur de **tentatives** et sa **raison réelle** en une ligne, par exemple « refusée par le serveur : new row violates row-level security… ».
   - La passe est alors un **échec** : plus jamais « réussie » avec un refus avalé.
4. **Réception.**
   - Table : incrémentale, par `inserted_at`, inchangée.
   - Canal de repli : par ids, avec un compteur léger pour savoir s'il faut relire.

Une entrée de file **orpheline** (id sans réponse locale, donc rien à envoyer) est sauvegardée par `putBackup('pre-orphelines-journal-…')`, puis retirée. Avant, elle était effacée sans trace.

L'entrée du journal elle-même n'est **jamais** modifiée ni supprimée : seule l'entrée de **file** sort.

### 2.3 Empreinte (`lib/syncStatus.js`)

- `etatLocal` et `etatCloud` incluent les lignes du journal.
- `n` reste le nombre d'**enregistrements** : l'affichage « 5323 enregistrements » ne change pas de sens. `nJournal` s'y ajoute.
- Si le journal du serveur est illisible, l'état est `null` : on ne conclut rien, comme pour les enregistrements.

### 2.4 « À jour » et garde-fou (`MedReviseApp.jsx`)

- « En attente » = file des enregistrements **+** file du journal (`enAttenteTotal`). C'est vrai pour la vérification d'empreinte, la vérification de fond, la passe rapide et « Forcer la synchro ». Ce dernier attend désormais le journal **avant** d'écrire « dernière synchro réussie ».
- **Garde-fou.** Si l'état unique vaut « N en attente » (N > 0) alors que la passe vient d'être confirmée par le serveur, une réconciliation se lance d'elle-même, une fois par liste distincte :
  - purge des enregistrements déjà au serveur ;
  - passe complète du journal ;
  - envoi du reste ;
  - liste recalculée.
- Si l'incohérence persiste, chaque élément affiche sa raison exacte.

### 2.5 Liste dépliable (chevron)

Chaque élément affiche :
- son **type** : Enregistrement, Révision, Événement du journal, Fichier ;
- un **titre lisible** : recto de la carte, puis « Correct » ou « passage en révision » ;
- **depuis quand** il attend ;
- le **nombre de tentatives** ;
- la **raison** en une ligne, c'est-à-dire la vraie raison du dernier essai et non une phrase générique.

### 2.6 « Exporter un diagnostic » (`lib/diagnosticExport.js`)

Deux ajouts :
- `enAttente` : la liste complète ci-dessus ;
- `journal.file` : chaque entrée de la file du journal (id, depuis, carte, note, événement, tentatives, raison) **avec son classement d'après le serveur relu** : `identique` (faux en attente), `absent` (non envoyé), `different` (conflit) ou `orpheline`. C'est une lecture seule.

### 2.7 Migration

**Aucune nouvelle migration.** L'app fonctionne sans aucune : le canal de repli utilise la table générique existante. `supabase/migrations/20261024_review_log_evenements.sql` (déjà préparée le 24/10, **non appliquée**) reste facultative. Une fois appliquée, les nouveaux événements iront dans la table du journal. Ceux déjà passés par le canal de repli y restent, et sont lus aux deux endroits.

---

## 3. Tests

### 3.1 Tests automatiques : `tests/file-synchro/` (18 tests), lancés par `npm run build`

`package.json` : `"build": "vitest run tests/file-synchro && vite build"`. Le `&&` fait échouer le build, Vercel compris, si un test échoue.

Ils utilisent un faux client supabase-js en mémoire (`tests/file-synchro/fauxClient.js`) qui reproduit le vrai serveur :
- contrainte `rating` (23514) ;
- RPC conditionnelle ;
- pannes injectables : réseau, « tuée après écriture », RLS, doublon.

| Hypothèse / cas | Test |
|---|---|
| **La cause** : refus de contrainte avalé | L'ancien appel est rejoué : 23514, rien au serveur. Après correction : **10 « Passer en révision » → 10 en attente → 0**, via le canal de repli, données locales intactes. |
| Migration appliquée ensuite | Les nouveaux événements vont dans la table, aucun doublon. |
| 10 notes, deux appareils | 10 → 0, puis le second appareil reçoit les 10. |
| Confirmation perdue | Entrée au serveur, encore en file : retirée **sans renvoi**, `putBackup` fait avant. |
| Doublon refusé (23505) | Compte comme un succès si la version est identique. |
| **App tuée en plein envoi** (le serveur écrit, la réponse ne revient pas) | Rien n'est retiré sans preuve. À la réouverture : 0 en attente, **5 lignes au serveur pour 5 notes**. |
| Hors ligne puis retour | Tout reste en file, avec tentatives. Au retour : 0. |
| Conflit (même id, autre note) | Rien n'est écrasé, l'élément reste avec sa raison et 1 tentative. |
| Refus de droits (RLS 42501) | La passe est un **échec** ; raison visible dans la file **et** dans la liste « N en attente ». |
| File alimentée deux fois | Une seule entrée, un seul envoi. |
| Entrée orpheline | Sauvegardée puis retirée, rien envoyé. |
| Garde-fou | Réponse ici, absente du serveur, absente de la file : remise en file et envoyée. |
| Empreinte | Une réponse non envoyée la **change**. Après synchro, local = cloud = second appareil. Les événements du canal de repli comptent des deux côtés. |
| État affiché | Jamais « À jour » avec une réponse en file. |
| Règle unique | Identique / serveur plus récent / absent, « Z » = « +00:00 ». La purge des enregistrements suit la même règle. |

**Toute la suite vitest : 305 / 307.** Les 2 échecs existaient avant (crayon, emploi du temps) et sont sans rapport.

### 3.2 Bancs navigateur : `scripts/tests-74-en-attente/t-74.mjs`

Installation (données de test uniquement, jamais le vrai cloud) :
- faux Supabase :54409 **avec la contrainte du vrai cloud active** ;
- code d'**avant** (`git archive 5b0ead1`) sur :5312, code d'**après** sur :5311 ;
- Chrome headless aux profils neufs : ordinateur 1440×900 (souris), **téléphone 390×844 tactile**, **tablette 820×1180 tactile**.

Les cartes sont notées **à l'écran** : bloc Nouvelles → « Voir la réponse » → « Passer en révision » ; Révisions J → « Correct ».

**Avant** (`resultats/avant.txt`) : le bug est reproduit, tout est vert.

| Constat | Mesure |
|---|---|
| 7 « Passer en révision » sur le téléphone | **7 en attente**, bandeau « À jour » (`phase: ajour`) |
| Empreinte | locale **=** cloud (`cf37ea94da33`) malgré les 7 |
| « Revérifier » (nouvelle passe) | toujours 7 |
| Une carte de plus passée | **8** (+1) |
| Au serveur | 0 événement |

**Après** (`resultats/apres.txt`) : tout est vert.

| Scénario | Résultat |
|---|---|
| 7 « Passer en révision », puis 1 de plus | **0 en attente**. Empreinte locale = cloud. Les 8 événements sont au serveur (canal de repli). |
| **10 cartes notées hors ligne** | **10 en attente** (liste : type, titre, depuis, raison) |
| Retour en ligne | **0**, empreinte = cloud |
| Ordinateur ouvert ensuite | 0 en attente, **même empreinte** que le téléphone et le cloud. **Compteur de vues identique (10 = 10)** : les révisions du téléphone sont comptées sur l'ordinateur. |
| **App tuée en plein envoi** (serveur ralenti à 6 s, page fermée pendant l'envoi automatique, puis rouverte) | **0 en attente, aucun doublon, aucune perte** : 10 → 12 lignes pour 2 notes. Empreinte = cloud. |
| Trois appareils (téléphone, ordinateur, tablette) | 0 en attente partout, **même empreinte** (`b3815cf3e11d`), **même compteur de vues** (12 · 12 · 12) |
| Console | aucune erreur |

**WebKit / Safari via Playwright : non disponible ici.** Le cache Playwright de ce Mac ne contient que Chromium. Installer WebKit demande un téléchargement, que je n'ai pas fait. Le téléphone est émulé dans Chrome : écran 390×844, tactile, `mobile: true`. Le cas propre à Safari iOS (app tuée par le système) est couvert par le test « app tuée en plein envoi », au banc et en vitest.

### 3.3 Non-régression

| Banc | Appareils | Résultat |
|---|---|---|
| `tests-enregistrement` : écriture continue des annotations (boîtes, crayon, gomme, forme), historique, restauration, sauvegardes (faux GitHub), hors ligne, refus serveur, fiche jumelle | ordinateur, tablette | tout vert |
| `tests-enregistrement/t-telephone` : séance de flashcards sur téléphone, journal | téléphone | tout vert |
| `tests-file-attente/t-scenarios` : séance, Retard / Révisions / **Nouvelles**, mode file d'attente, FSRS | ordinateur, tablette, téléphone | voir § 3.4 |
| vitest : FSRS, mode Apprentissage, compteur de vues, catégories, sauvegardes… | — | 305 / 307 (2 échecs anciens) |
| **MealWeek** | — | `git diff 5b0ead1 -- src/mealweek src/shared src/App.jsx src/Selecteur.jsx` : **0 ligne**. `npm run build` vert ; MealWeek s'affiche (§ 3.4). |

### 3.4 Résultats complémentaires

- `tests-file-attente/t-scenarios.mjs` : **ordinateur, tablette, téléphone tout verts** (séance, Retard / Révisions / Nouvelles, mode file d'attente, FSRS).
- MealWeek ouvert dans le navigateur sur le code d'après (:5310) : semaine et planning affichés, **aucune erreur console**. Comme le diff est nul sur `src/mealweek`, `src/shared`, `App.jsx` et `Selecteur.jsx`, le rendu est identique par construction.
- Les bancs précédents réécrivent leurs captures et leurs fichiers de résultats à chaque passage. Ces fichiers ont été remis à leur version d'origine (`1ac6e5a`).

---

## 4. Captures (`docs/img/74-en-attente/`)

- `avant-tel-apres-7-passages.png` : **avant**. Téléphone, « 7 en attente », liste dépliée (« pas encore envoyée… »), « Dernière synchro réussie ».
- `apres-tel-apres-7-passages.png` : **après**. Téléphone, même geste, « À jour ».
- `apres-tel-hors-ligne-10-en-attente.png` : hors ligne, « 10 en attente », chaque révision listée, « à envoyer : 10 » dans l'empreinte.
- `apres-tel-ajour.png`, `apres-ordi-ajour.png`, `apres-tablette-ajour.png` : les trois appareils « À jour ».

---

## 5. Après le déploiement

Sur le téléphone : ouvrir l'app et attendre la fin de la synchro, en restant quelques secondes au premier plan. Tu dois voir :
- **« 0 en attente »** ;
- **la même empreinte** sur le Mac et sur le téléphone (Réglages / accueil › Synchronisation) ;
- **le même compteur de vues** sur les deux.

Les 74 événements partent par le canal de repli à cette ouverture. Si l'iPad affiche aussi « N en attente », il se règle de la même façon.

---

## 6. Commits

- `25c6dd2` « sync auto ». La synchro automatique du dossier a commité et poussé **tout le chantier** en un seul commit, avant que je fasse mes commits conventionnels :
  - code : `confirmationServeur.js`, `journal/*`, `syncStatus.js`, `etatSynchro.js`, `diagnosticExport.js`, `MedReviseApp.jsx`, `EtatSynchro.jsx`, `sync.js`, `storage.js` ;
  - tests : `tests/file-synchro/` ;
  - `package.json` (build) ;
  - banc `scripts/tests-74-en-attente/` et faux Supabase ;
  - captures et premier jet de ce compte rendu.

  L'historique n'a pas été réécrit (jamais de force push).
- `1ac6e5a` chore : restaure `launch.json` et les captures réécrites par les bancs de non-régression, embarqués par erreur dans `25c6dd2`.
- Ce compte rendu, version finale : docs.

**Migration** : aucune nouvelle. `20261024_review_log_evenements.sql` reste **non appliquée** et facultative.
