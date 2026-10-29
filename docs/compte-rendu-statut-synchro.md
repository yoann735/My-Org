# Statut de synchro juste + case à cocher unique (29/10/2026)

**Constat** :

- **Téléphone** : l'empreinte cloud était égale à l'empreinte locale (`68e09eafa8ea`), avec 4469 enregistrements de chaque côté et « à rapatrier 0 · à envoyer 0 · versions différentes 0 ». Pourtant l'écran affichait « En attente d'envoi : 4469 » et le bandeau « Hors ligne · données du 28 oct. 17:43 ».
- **Mac** : « Pas à jour » à l'ouverture, puis à 10:22 le bandeau « Hors ligne · données du 29 oct. 10:22 ».

Commits : `5ff4cea` (synchro), `b83c8ba` (cases à cocher), puis le commit de ce compte rendu et des bancs.

## 1. Diagnostic : trois causes

### 1.1 Pourquoi la file d'envoi contenait tous les enregistrements et n'était jamais vidée

C'était une **file reconstruite à chaque passe**. Le marquage « envoyé » était bien persisté, et aucune migration n'est en cause.

1. **`queueAllLocalForPush()`** (`lib/storage.js`, « rattrapage inconditionnel ») remettait **tout** le local dans l'outbox à chaque `syncNow()`. `syncNow()` tourne à chaque ouverture, à chaque retour au premier plan, à chaque `focus` et à chaque retour du réseau. Résultat : autant d'entrées que d'enregistrements, soit 4469 = 4469. C'est exactement la signature observée sur le téléphone.
2. **`flushPending()`** (`data/sync.js`) envoyait ensuite l'outbox entière **en un seul appel** `medrevise_push`. Avec 4469 enregistrements complets, cela fait plusieurs Mo de JSON à traiter par une seule requête SQL. Supabase limite le temps d'exécution d'une requête du rôle `anon` (`statement_timeout`, quelques secondes) et coupe les appels trop longs. Si l'appel échoue, **rien** n'est retiré de la file, et la passe suivante la remplit à nouveau.
   - *Limite du diagnostic* : je n'ai pas lu la réponse exacte du vrai serveur, puisque la règle était de ne jamais toucher au vrai cloud. Mais la file pleine en permanence avec des empreintes égales prouve que cet envoi n'aboutissait jamais : un envoi réussi aurait vidé la file.
3. **Défaut secondaire** trouvé en route : après un envoi, `delMany()` retirait les clés envoyées **sans vérifier** qu'elles n'avaient pas été réécrites pendant l'envoi. Une réponse donnée pendant le vol pouvait donc sortir de la file sans jamais partir.

### 1.2 Pourquoi « Hors ligne » sans coupure réseau

La porte d'affichage (`lib/synchroAffichage.js`) basculait en `horsligne` **dès qu'une passe durait plus de 8 s** (`DELAI_MAX_MS`), réseau ou pas. Or une passe pouvait prendre bien plus de 8 s :

- l'envoi géant ci-dessus ;
- le tirage complet des 4469 enregistrements ;
- la seconde lecture complète pour comparer les empreintes ;
- la seconde passe déclenchée par l'écart.

Le libellé « Hors ligne » mentait donc : le réseau allait bien, la passe était simplement longue.

### 1.3 Pourquoi l'heure affichée était l'heure actuelle

« Hors ligne · données du … » affiche `derniereSyncReussie()`. Cette valeur était écrite dans deux cas où rien n'avait réussi :

- quand une passe se terminait en **écart** (`res === 'ecart'` → `marquer(at)`). Or l'écart était permanent, à cause des 4469 entrées en attente ;
- par `forceSync` dès que `syncNow` répondait `ok`, même si l'envoi avait échoué. Les erreurs de `flushOutbox` étaient avalées sans être remontées.

Sur le Mac, la séquence a donc été la suivante :

1. Passe de 10:22 → écart → « dernière synchro réussie = 10:22 ».
2. Passe suivante (focus) → au bout de 8 s, « Hors ligne · données du 29 oct. 10:22 », affiché à 10:22.

## 2. Corrections

### 2.1 File d'envoi (`data/sync.js`, `lib/storage.js`)

- **Plus de reconstruction de la file** : `queueAllLocalForPush` est supprimé. Seule `reconcileAll` met en file, enregistrement par enregistrement, ce qui est absent du cloud ou plus récent en local. Ce sont les seuls vrais écarts.
- **Réconciliation au démarrage** (`purgerOutboxAligne`, à chaque passe) :
  - on lit les **métadonnées** du cloud, sans `data` (`pullAllMeta`, paginé, tout ou rien) ;
  - toute entrée dont le cloud a **la même version** (même instant `updated_at`, quelle que soit son écriture `Z` ou `+00:00`, et même état supprimé) sort de la file ;
  - **après un `putBackup('pre-purge-outbox-…')`** de ces entrées ;
  - lecture impossible → rien n'est retiré.
- **Sortie de file sur confirmation** : `retirerSiInchange()` retire, dans **une** transaction IndexedDB, uniquement les entrées encore dans la version envoyée. Une réécriture faite pendant l'envoi reste en file.
- **Envoi par lots de 200** (`TAILLE_LOT`) :
  - chaque lot confirmé sort aussitôt, donc une coupure à 1200 / 4469 garde les 1200 acquis ;
  - la progression est publiée (`surProgressionEnvoi`) et affichée dans le bandeau : « Synchronisation… 400 / 1500 ».
- **Nature de l'erreur** (`natureErreur`) :
  - **réseau** : requête jamais arrivée (`Failed to fetch`, `navigator.onLine` faux) ;
  - **serveur** : le serveur a répondu (statut HTTP ou code Postgres, y compris `57014 statement timeout`).
  - `syncNow` rend `offline` ou `echec` en conséquence. Il ne rend plus `ok` quand l'envoi a échoué.

### 2.2 Règles de statut (`lib/synchroAffichage.js`, `components/Chiffre.jsx`)

| Bandeau | Quand | Chiffres |
|---|---|---|
| **Synchronisation…** (+ « n / total » pendant un gros envoi) | Passe en cours, **aussi longtemps que nécessaire**. Le délai de 8 s est supprimé. | En chargement, Démarrer désactivé |
| **À jour · 18:42** | **Seulement si** : envoi terminé, tirage complet terminé, empreinte locale = empreinte cloud, **et** file vide. C'est le **seul** cas où la dernière synchro réussie est enregistrée. | Affichés |
| **Hors ligne · dernière synchro 29 oct. 10:58** | **Vraie** absence de réseau : `navigator.onLine` faux, ou **deux** erreurs réseau de suite. Une erreur isolée est réessayée 3 s plus tard sans rien afficher. L'heure est celle de la **dernière synchro réussie**. | Données locales |
| **Synchro en échec · Réessayer** | Le serveur a répondu par une erreur (5xx, timeout SQL, droits…). Ce n'est **pas** « Hors ligne ». | Données locales |
| **Synchro incomplète · Réessayer** | Passes réussies mais empreintes encore différentes après 3 passes (un autre appareil écrit en même temps, par exemple). | Données locales |

Dans les trois derniers cas, un nouvel essai est relancé automatiquement toutes les 30 s, ainsi qu'au retour du réseau, au `focus` et au retour au premier plan.

`forceSync` (bouton « Forcer la synchro ») n'enregistre plus de « synchro réussie » si la file n'est pas vide. L'indicateur des Réglages affiche « Synchro en échec : le serveur cloud a refusé la requête » au lieu de « Hors ligne ».

### 2.3 Une seule case à cocher (`components/CaseACocher.jsx`, `styles/case-a-cocher.css`)

- 18 px, coins arrondis 5 px, filet fin de la DA (`--border-hover`), fond `--card`.
- Cochée : fond `--accent` et coche blanche **tracée en 120 ms** (`stroke-dashoffset`).
- État **partiel** : tiret blanc.
- Survol : le filet passe à l'accent. Focus clavier : anneau d'accent.
- Sur téléphone (`pointer: coarse`, < 768 px, ou écrans mobiles) : **zone de clic ≥ 40 × 40 px**.
- La vraie `<input type="checkbox">` reste dans le DOM, invisible et couvrant la zone. Le clavier, les lecteurs d'écran et les bancs existants fonctionnent donc comme avant (`checked`, `indeterminate`).
- `BoiteCase` : la boîte seule, pour les critères d'exercice du téléphone, qui sont déjà des boutons. Ces boutons ont reçu `role="checkbox"` et `aria-checked`.

**Remplacées (18 cases, 13 fichiers)** :

- Apprentissage : cases de cours ou matière avec état partiel, case de carte, filtre des matières.
- Séance du jour : Nouvelles, Révisions, Retard.
- Liste et export des flashcards.
- Import de flashcards : reprise de la progression.
- Import : J0 des doublons.
- Formulaire QCM : bonne réponse.
- Carte Muscle : montrer au recto.
- Carte Tableau : en-têtes.
- Feynman et Exercice, sur ordinateur et téléphone.
- Réglages : carte Muscle ligne par ligne.

Seul l'interrupteur « Distinguer les intervenants » de la transcription est conservé. C'est un `role="switch"`, pas une case.

## 3. Tests

**Installation** : faux Supabase local (`scripts/faux-supabase.mjs`, auquel j'ai ajouté `/__lent?ms=` et `/__panne?code=`), Vite :5300, deux Chrome isolés aux profils neufs : A (ordinateur, 1440×900) et B (téléphone tactile, 390×844). **Jamais le vrai cloud.**

### 3.1 Vitest (`npm test`)

- `tests/synchro-affichage/porte.test.js` (12 tests) :
  - erreur serveur → « Synchro en échec » ;
  - erreur réseau isolée → nouvel essai sans « Hors ligne » ;
  - erreurs réseau répétées → « Hors ligne » avec la dernière synchro réussie ;
  - `onLine` faux → hors ligne immédiat ;
  - passe de 60 s → toujours « Synchronisation… » ;
  - file non vide → jamais « à jour », et rien n'est enregistré comme synchro réussie.
- `tests/synchro-affichage/outbox.test.js` (5 tests) :
  - 4469 entrées envoyées en 23 lots de 200 au plus, progression publiée, file vide ;
  - échec serveur au 2ᵉ lot (`statement timeout`) → 200 entrées sorties, 250 gardées, erreur classée `serveur` (le test a d'ailleurs trouvé qu'un « timeout » était d'abord classé « réseau », corrigé) ;
  - réécriture pendant l'envoi → la nouvelle version reste en file ;
  - purge → seules les entrées identiques au cloud sortent, avec une sauvegarde avant ;
  - `Z` = `+00:00`.
- Toute la suite : 192 tests sur 193 passent. Le seul échec, `tests/crayon/crayon.test.js › trois épaisseurs par mode`, **échouait déjà avant ce chantier** (vérifié sur le commit de départ) et n'a rien à voir avec lui.

### 3.2 Navigateur, deux appareils (`scripts/tests-statut-synchro/t-statut.mjs`) : tout vert

| # | Scénario | Résultat |
|---|---|---|
| 1 | **État du téléphone reproduit** sur B : 4428 enregistrements de volume + le jeu de test ; file d'envoi = **tous** les enregistrements (5982), empreinte locale = cloud | Après correction : file **0**, `attente@474 → ajour@1202 ms`, **jamais** « Hors ligne », empreintes égales, `pre-purge-outbox-…` sauvegardé, **0 appel d'envoi** (tout était déjà au cloud) |
| 2 | Gros envoi (1500 enregistrements jamais partis, serveur ralenti) | Bandeau « Synchronisation… 400 / 1500 », puis « À jour », file vide |
| 3 | 3 réponses sur A, ouverture de B | `attente → ajour`, empreintes **A = B = cloud** (`7b2e312220af`) |
| 4 | Réseau lent (4 s par requête) | À 31 s : toujours « Synchronisation… » ; « À jour » à 48 s ; **jamais** « Hors ligne » |
| 5 | Mode avion (CDP `offline`), une minute après la dernière synchro | « Hors ligne · dernière synchro 29 oct. 10:58 » = l'heure de la dernière synchro réussie, pas l'heure actuelle ; retour du réseau → « À jour » |
| 6 | Erreur serveur (500) | « Synchro en échec · Réessayer » sur le téléphone **et** l'ordinateur, jamais « Hors ligne » ; serveur réparé + Réessayer → « À jour » |
| 7 | Comptes avant / après (A, B, cloud) | Identiques par store : 41 cartes, 5 fiches, 3 matières, 2 sections, 5928 surlignages ; 5983 lignes vivantes au cloud. **Rien de perdu** |

Aucune erreur console.

### 3.3 Cases à cocher (`t-cases.mjs`, ordinateur et téléphone) : tout vert

- Aucune case native visible.
- Boîte 18 × 18 px, coins 5 px.
- Fond d'accent quand cochée, coche animée en 0,12 s.
- La boîte suit l'input.
- Tiret sur un cours à moitié coché.
- Focus clavier (Tab) visible.
- Survol : filet à l'accent.
- Téléphone : cases de carte 40 × 40 px, options du filtre de 44 px.

Le banc existant `tests-selection-passages` (sélection libre, ordinateur et téléphone, compteur de passages) est vert avec les nouvelles cases.

**Ancien banc à revoir** : `scripts/tests-synchro-affichage/t-horsligne.mjs` testait le basculement « Hors ligne » au-delà de 8 s. Ce comportement est volontairement supprimé : ce banc est remplacé par `t-statut.mjs` §4.

### 3.4 MealWeek

`git diff e0ca0c3 -- src/mealweek src/shared src/App.jsx src/Selecteur.jsx src/styles/design.css` est vide : aucune ligne modifiée.

## 4. Captures (`docs/img/statut-synchro/`)

**Statut**

- `statut-tel-reproduction-ajour.png` : l'état du téléphone, corrigé.
- `statut-ordi-envoi-progression.png` : « Synchronisation… 400 / 1500 ».
- `statut-tel-ouverture-ajour.png`, `statut-ordi-ajour.png` : « À jour ».
- `statut-tel-lent-30s.png` : 31 s de réseau lent, toujours « Synchronisation… », chiffres en chargement.
- `statut-tel-horsligne.png` : mode avion.
- `statut-tel-echec.png`, `statut-ordi-echec.png` : erreur serveur.

**Cases** (`cases-avant-*` / `cases-apres-*`)

- Ordinateur : séance, Apprentissage (liste avec cours partiel), filtre des matières, Réglages, export des flashcards.
- Téléphone : séance, Apprentissage, feuille des filtres.

## 5. À faire de ton côté

À la prochaine ouverture, le téléphone et le Mac font tout seuls la purge de la file. Une copie est gardée en local (`pre-purge-outbox-…`). Le bandeau doit ensuite passer à « À jour » et l'indicateur à « En attente d'envoi : 0 ».
