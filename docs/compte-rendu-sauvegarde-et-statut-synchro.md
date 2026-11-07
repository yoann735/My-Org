# Sauvegarde quotidienne et statut de synchro (07/11/2026)

**En bref**

- **Sauvegarde du jour : OK.** La copie GitHub ne s'était pas arrêtée : il y a un commit chaque nuit, du 29/10 au 07/11 à 02:05 UTC. Après le déploiement, une copie réelle a été lancée et vérifiée : commit `d5ddbe0` « backup 2026-11-07 », le 07/11 à 16:14:52 UTC, 4 739 enregistrements. Le rattrapage automatique est en place.
- **Statut de synchro** : les « 19 éléments en attente » n'existaient pas. Ce sont 19 flashcards « Boîte → Flashcard » dont le champ `srcId` était pris pour un fichier manquant. Aucune donnée n'était bloquée, rien n'a été envoyé, vidé ni modifié.
- Il y a maintenant **un seul calcul de l'état**, lu par l'en-tête **et** par Réglages.

Rien à faire de ton côté : aucun secret à renouveler.

---

## 1. Sauvegarde quotidienne GitHub

### 1.1 Diagnostic, avec les preuves

Le constat de départ était : « aucune sauvegarde depuis ~4 jours ». Il n'est **pas confirmé**. Chaque hypothèse a été vérifiée une par une :

| Hypothèse | Preuve | Verdict |
|---|---|---|
| Cron plus déclaré ou plus exécuté | `vercel.json` déclare `/api/backup-daily` (`30 1 * * *` et `30 2 * * *`). Dépôt `yoann735/medrevise-backups` : un commit « backup AAAA-MM-JJ » **chaque jour**, du 29/10 au 07/11, toujours vers 02:05 UTC (`419a6bf` le 07/11, `3765885` le 06/11, `81c5550` le 05/11, `451b7e1` le 04/11, `19bca85` le 03/11…). | Le cron tourne. |
| Jeton GitHub expiré ou révoqué | `POST /api/backup-status` en production → `ok: true`, `configure: true`, dernière copie le 07/11 à 02:05:52 UTC. Après le déploiement, `POST /api/backup-now` → `ok: true`, commit `d5ddbe0` créé. | Le jeton écrit. |
| `CRON_SECRET` refusé | Un refus donne 401 et aucun commit, or il y a un commit par nuit. | Non. |
| Temps maximum ou mémoire dépassés | La copie réelle de 16:14 a réussi **au 1er essai** (`essai: 1`) sous la limite de 120 s, avec 4 739 enregistrements et `records.jsonl` de 12,9 Mo. | Non. |
| Lecture Supabase en erreur | Le `manifest.json` du 07/11 contient bien 4 693 enregistrements et 1 050 révisions. Celui de 16:14 en contient 4 739. | Non. |
| Limites du plan Vercel | Une exécution par jour, à une heure approximative (02:05 au lieu de 01:30) : c'est le comportement normal du plan gratuit. | Non bloquant. |

*Limite du diagnostic* : je n'ai pas pu lire les journaux Vercel. Le connecteur Vercel ne voit pas ce projet : la liste des projets de l'équipe est vide, comme déjà noté le 07/11. Les preuves ci-dessus viennent du dépôt de sauvegarde et des réponses HTTP de production.

**D'où pouvait venir « 4 jours » : un vrai défaut, corrigé.**

- L'app lisait l'état de la copie **une seule fois par chargement de page** (`FiletSecurite.jsx`, `statutServeur` mis en cache).
- Elle calculait ensuite l'âge de cette copie **avec l'horloge du moment**.
- Résultat : un onglet, ou l'app sur l'iPad, resté ouvert plusieurs jours affichait « Pas de copie depuis N jours » alors que la copie tournait chaque nuit.
- Je ne peux pas prouver que c'est ce que tu as vu, puisque je n'ai pas ouvert l'app réelle. C'est en tout cas le seul mécanisme du code qui produit ce message sans panne réelle.

### 1.2 Corrections

1. **Statut relu automatiquement** s'il a plus de 10 min : à l'affichage de Réglages ou du bandeau, et au retour sur l'onglet.
2. **Rattrapage à l'ouverture de l'app** (`api/backup-catchup.js` → `rattrapage()` dans `api/_lib/sauvegarde.js`) :
   - le **serveur** lit la date de la dernière copie **réussie** dans le dépôt :
     - moins de 24 h → `{ action: 'rien' }` ;
     - sinon → **la même fonction** que le cron (`executerCopie`, aucune copie du code) ;
   - **une seule copie à la fois, au plus une tentative toutes les 30 min** :
     - une étiquette git `rattrapage-AAAAMMJJTHHMMZ` est créée par créneau de 30 min, **avant** la copie ;
     - côté GitHub, cette création est atomique : une deuxième ouverture simultanée reçoit 422, donc `deja_en_cours` ;
     - une étiquette du créneau en cours ou du précédent donne `trop_tot` ;
     - les étiquettes de plus de 7 jours sont retirées : ce ne sont que des verrous, aucune donnée ;
   - côté app : un appel silencieux 0,8 s après le démarrage (`lancerRattrapageSauvegarde`), jamais attendu, une fois par chargement ;
   - aucun secret côté client. La réponse ne contient qu'un code d'action et des dates ;
   - protections : origine de l'app et 30 appels par 10 min et par IP (`_protection.js`) ; `maxDuration` de 120 s dans `vercel.json`.
3. **Une copie n'est « réussie » que si tout a bien été écrit.**
   - `gh.verifier()` relit l'arbre du commit et exige `data/records*.jsonl`, `data/review_log*.jsonl`, `data/files-index.json` et `manifest.json`, chacun avec exactement le contenu voulu (empreinte git).
   - Seuls ces commits s'appellent « backup AAAA-MM-JJ ».
4. **Trace des échecs** :
   - un échec définitif (après 3 essais) ajoute `{ le, raison }` à `manifest.json` (les 10 derniers), par un petit commit `backup-echec AAAA-MM-JJ` qui ne touche que le manifest ;
   - la trace est reportée d'une copie à l'autre ;
   - la raison est courte et ne contient jamais de secret (`raisonCourte`), par exemple « jeton GitHub refusé (HTTP 401) : jeton expiré ou révoqué, à renouveler » ou « lecture Supabase impossible : … ».
5. **Réglages › Sauvegardes** :
   - « Dernière sauvegarde réussie : aujourd'hui 03:05 ✓ · … » ;
   - au-delà de **48 h** : « ⚠️ Aucune sauvegarde réussie depuis plus de 48 h (N jours) — dernier échec <date> : <raison> », en une ligne ;
   - le bandeau « Pas de copie depuis N jours » utilise le même seuil, 48 h au lieu de 36 ;
   - le reste de la carte est inchangé : dossier local et contrôle du jour.

### 1.3 Après le déploiement (production)

- `POST /api/backup-catchup` → `{"ok":true,"action":"rien","derniereReussie":"2026-11-07T02:05:52Z","ageHeures":14.1}`. C'est le comportement attendu : la copie de la nuit avait moins de 24 h.
- `POST /api/backup-now`, la même copie que le cron et le rattrapage → `ok: true`, `cree: true`, commit **`d5ddbe0` « backup 2026-11-07 » à 16:14:52 UTC**, 4 739 enregistrements, vérification d'écriture passée au 1er essai.
- Arbre du dépôt : `data/records.jsonl` (12,9 Mo), `data/review_log.jsonl`, `data/files-index.json`, `manifest.json`.

## 2. Statut de synchro incohérent

### 2.1 D'où venait chaque affichage

Il y avait **quatre calculs indépendants** :

| Affichage | Source | Ce qu'il comptait |
|---|---|---|
| En-tête « À jour · 17:00 » | porte (`lib/synchroAffichage.js`), à la fin de chaque passe | empreintes des **enregistrements** et file d'envoi, **sans les fichiers** |
| Réglages « Pas encore synchronisé cette session » | `syncStatusLabel(ctx.syncState)` | le dernier `syncNow` complet. La **passe rapide**, utilisée à chaque rafraîchissement, ne met jamais `syncState` à jour : après un rafraîchissement réussi, ce libellé disait donc « non synchronisé » |
| Réglages « ⚠️ Pas à jour — 19 éléments à synchroniser » | `SyncIndicator` → `comparerAuCloud()`, calculé à part | écarts + file d'envoi + **fichiers en souffrance** (`etatBlobs`) |
| Réglages « révisions en attente » | `SynchroJournal` | la file du journal |

### 2.2 Les 19 éléments

L'analyse vient de la copie GitHub du 07/11, en lecture seule : records et index du bucket, sans appel à Supabase. Pour chercher les fichiers référencés, `etatBlobs()` retenait tout champ dont le nom finit par `Id` et dont la valeur respecte `^b[0-9a-z]{6,}$`.

**19 valeurs** répondaient à ce critère sans figurer dans le bucket, et toutes étaient le champ `srcId` d'une flashcard.

- `srcId` n'est pas un fichier : c'est l'id du brouillon « Boîte → Flashcard » (`pdf/BoiteFlashcard.jsx`, `genId('bfc')`), qui commence par « b ».
- Les 19 cartes étaient donc classées « fichiers ni sur cet appareil ni au cloud ». Elles ne pouvaient jamais « partir » et faisaient afficher « Pas à jour » en permanence.

| # | Carte (questions) | srcId | Créée / modifiée le |
|---|---|---|---|
| 1 | qmvwhdvgjmblc | bfcmvwhdvfvk7hn | 31/10 14:13 |
| 2 | qmvwhe3jn1jma | bfcmvwhe3iu7izn | 31/10 14:13 |
| 3 | qmvwhdb4xa504 | bfcmvwhdb45mw4c | 31/10 14:17 |
| 4 | qmvxw88cyl0ks | bfcmvxw88c5lqtd | 01/11 13:56 |
| 5 | qmvxw8gf35ild | bfcmvxw8gebz7uu | 01/11 13:56 |
| 6 | qmvxw8mbcbeca | bfcmvxw8map5qg2 | 01/11 13:56 |
| 7 | qmvy3cmgmd3dk | bfcmvy3cmfuz79y | 01/11 17:15 |
| 8 | qmvy3fbubwbgd | bfcmvy3fbt9sv4l | 01/11 17:17 |
| 9 | qmvz65g228igj | bfcmvz65g0xijiz | 06/11 15:55 |
| 10 | qmvz68az13dsh | bfcmvz68ay5zic1 | 06/11 15:57 |
| 11 | qmvz69y54p9dg | bfcmvz69y41e8no | 06/11 15:58 |
| 12 | qmvz6c33ccq9a | bfcmvz6c32fd52q | 06/11 16:02 |
| 13 | qmvz71mr4bevq | bfcmvz71mqed7s1 | 06/11 16:04 |
| 14 | qmvz75kscsejg | bfcmvz75krjhrnk | 06/11 16:11 |
| 15 | qmvz7665rul91 | bfcmvz7664rrslz | 06/11 16:11 |
| 16 | qmvz77dln7eto | bfcmvz77dkwlv85 | 06/11 16:12 |
| 17 | qmvz77xiut7rz | bfcmvz77xi4s0wz | 06/11 16:13 |
| 18 | qmvz7euwqmiob | bfcmvz7euvyvm9b | 06/11 16:14 |
| 19 | qmvz7fo3tfodf (« C'est quoi le RE », p. 110) | bfcmvz7fo34z2na | 06/11 16:15 |

**Ce qui leur est arrivé : rien.**

- Les 19 cartes sont au cloud à l'identique : elles figurent dans la copie GitHub.
- Les images qu'elles référencent (`imageId`) sont toutes dans le bucket : seule la valeur de `srcId` manquait.
- Aucune n'était dans une file d'envoi.
- Le compteur était faux. Il a été corrigé sans supprimer ni modifier aucune donnée, et aucune file n'a été touchée.

*Limite* : je n'ai pas lu la file d'envoi de tes appareils, puisque la règle était de ne pas ouvrir l'app réelle. Le banc reproduit pourtant le constat exact, avec ce seul ingrédient (§ 3.2), et les nombres concordent : 19 = 19. À ta prochaine ouverture, s'il restait autre chose dans une file, la ligne « N en attente » le listerait.

### 2.3 Corrections

1. **Forme exacte d'un id de fichier** (`estIdDeBlob`, `lib/storage.js`) :
   - un id de fichier vient de `genId('b')` : « b », puis `Date.now()` en base 36 sur 8 caractères, puis au plus 4 caractères aléatoires ;
   - les 8 caractères suivant le « b » doivent donc se lire comme une date plausible (de 2020 à demain) ;
   - `bfc…`, `bc…`, `bi…` et `bf…` (tableau blanc) sont écartés ;
   - vérifié sur les **514 fichiers du vrai bucket** : tous sont reconnus.
2. **Un seul état de synchro** (`lib/etatSynchro.js`) :
   - `collecterEnAttente()` liste, **en lecture seule**, la file des enregistrements, la file du journal, la file des fichiers, et les fichiers référencés absents du cloud ;
   - `calculerEtatSynchro(porte, liste)` est **le** calcul, lu par le bandeau (ordinateur, tablette, téléphone) **et** par Réglages ;
   - la règle : « À jour » seulement si la passe a été confirmée par le serveur **et** que la liste, recalculée **après** cette passe, est vide ;
   - sinon : « N en attente », « Hors ligne · … · N en attente » ou « Synchro en échec · N en attente » ;
   - une liste plus ancienne que la passe donne « Synchronisation… », jamais un faux « À jour ».
3. **Réglages et accueil du téléphone** :
   - la ligne d'état (`components/EtatSynchro.jsx`) remplace « Pas encore synchronisé cette session » ;
   - « N en attente » s'ouvre au tap et liste, pour chaque élément, son type, son titre lisible, depuis quand il attend et la raison en une ligne. Lecture seule ;
   - `SyncIndicator` ne donne plus de statut à lui seul et garde le diagnostic d'empreinte. S'il trouve un écart d'enregistrements, il relance la passe ;
   - `syncStatusLabel` ne sert plus qu'à signaler le mode dégradé.
4. **Raison du refus** : `data/sync.js` retient le dernier échec d'envoi (`dernierEchecEnvoi`) et prévient l'état unique à chaque fin de vidage d'une file (`surChangementFile`).

Aucune écriture : rien n'est retiré ni marqué envoyé, aucune donnée locale ou cloud n'est modifiée. `putBackup` n'a donc pas eu lieu d'être.

## 3. Tests

### 3.1 Vitest (`npm test`) : 253 / 255

- `tests/filet/rattrapage.test.js` (5 tests) :
  - plus de 24 h → une copie ; puis 5 ouvertures → aucune autre ;
  - copie récente → rien, aucun verrou ;
  - échecs → au plus une tentative par 30 min, échec noté (date et raison), jamais compté comme réussite ;
  - 5 ouvertures simultanées → une seule copie ;
  - 4 fichiers relus ; jeton refusé → raison claire, sans secret.
- `tests/synchro-affichage/etat-unique.test.js` (4 tests) :
  - règle du « À jour » et erreurs réelles avec N ;
  - `estIdDeBlob` : `bfc`/`bc`/`bi`/`bf` refusés, `genId('b')` reconnu ;
  - collecte : une carte « bfc » donne 0 fichier, une vraie image absente donne 1, et la collecte ne retire rien.
- `tests/filet/filet.test.js` : attente mise à jour, 3 tentatives + 1 essai de noter l'échec.
- Les 2 échecs restants **existaient avant ce chantier** et sont sans rapport : `crayon › trois épaisseurs par mode` et `/api/timetable › cache 60 min`. Vérifié sur le commit de départ.

### 3.2 Navigateur, trois appareils (`scripts/tests-sauvegarde-statut/`)

L'installation n'utilise que des données de test, jamais le vrai cloud ni le vrai dépôt :

- faux Supabase sur :54399 ;
- **faux GitHub** sur :54398 (`faux-github.mjs`, construit sur le même faux que les tests unitaires) ;
- Vite sur :5303 (configuration `medrevise-banc-sauvegarde`) ;
- Chrome headless avec des profils neufs : ordinateur 1440×900 à la souris, **tablette 1024×1366 tactile**, téléphone 390×844 tactile.

Jeu de test (`seed.mjs`) : 41 cartes et **19 cartes « Boîte → Flashcard » avec `srcId = genId('bfc')`**.

**Avant** (`avant.mjs`, `avant-rafraichi.mjs` : code de départ `a5b20b2` servi sur :5304, même faux cloud), le constat est reproduit :

- en-tête « À jour · 17:00 » **et** Réglages « ⚠️ Pas à jour — 19 éléments à synchroniser » ;
- après un rafraîchissement : « Pas encore synchronisé cette session » ;
- `etatBlobs()` → 19 « introuvables », tous `questions:bfc-carte-N (srcId)`.

**Après** : `t-synchro.mjs` (36 vérifications, tout vert), `t-sauvegarde.mjs` (14, tout vert), `t-mealweek.mjs` (2, tout vert).

| Scénario | Résultat |
|---|---|
| 19 cartes Boîte → Flashcard (3 appareils) | Réglages « À jour · hh:mm », 0 en attente. L'en-tête affiche « À jour ». L'ancienne règle en comptait 19 |
| Modification hors ligne (tablette, puis téléphone) | « 1 en attente » dans l'en-tête **et** dans Réglages. Au retour du réseau : envoi, puis « À jour » des deux côtés **dans la même mutation du DOM**. La modification est au cloud |
| Élément refusé par le serveur (ordinateur, tablette) | « 1 en attente », puis « Synchro en échec · 1 en attente », **jamais** « À jour ». Le tap ouvre la liste : « MATIÈRE Pneumo (refusé par le serveur) · depuis le 07/11 17:04 · refusé par le serveur : … ». Serveur réparé + Réessayer → « À jour » |
| Rafraîchissement (3 appareils) | Enregistreur posé à chaque mutation : en-tête et Réglages identiques à chaque instant, 0 divergence |
| Rattrapage : dernière copie à J-3 | 1ʳᵉ ouverture → commit « backup 2026-11-07 » et 1 verrou. **5 ouvertures de plus → aucune autre copie** |
| Copie récente (2 h) | Rien : aucun commit, aucun verrou |
| Échec du rattrapage (Supabase en 503) | Commit `backup-echec`, aucune « réussite ». Ordinateur **et** tablette : « Aucune sauvegarde réussie depuis plus de 48 h (3 jours) — dernier échec aujourd'hui 16:58 : lecture Supabase impossible : … ». Téléphone : « Pas de copie depuis 3 jours ». Les ouvertures suivantes dans la demi-heure ne retentent pas |
| Non-régression | Séance de flashcards (2 réponses, journalisées), Bibliothèque, **PdfReader** (PDF de test ouvert, page rendue), synchro normale ensuite (« À jour », PDF envoyé), comptes intacts. Aucune erreur console sur les 3 appareils |
| MealWeek | `git diff` vide sur `src/mealweek`, `src/shared`, `App.jsx` et `Selecteur.jsx`. Capture **identique octet pour octet** entre l'ancien et le nouveau code. Aucune erreur console |

`npm run build` est vert. Le build de production (`vite preview`) affiche MedRevise et MealWeek. Les seuls 404 concernent `/api/*`, que `vite preview` ne sert pas, et le rattrapage échoue alors en silence comme prévu.

## 4. Captures (`docs/img/sauvegarde-statut/`)

**Avant**

- `avant-entete-ajour.png` : l'en-tête dit « À jour ».
- `avant-reglages-19-elements.png` : Réglages dit « Pas à jour — 19 » et liste 19 « fichiers manquants » `bfc-carte-N`.
- `avant-reglages-apres-rafraichissement.png` : « Pas encore synchronisé cette session ».

**Après**

- Synchro, état à jour :
  - `apres-reglages-ordi-ajour.png` ;
  - `apres-reglages-tablette-ajour.png` ;
  - `apres-accueil-tel-ajour.png`.
- Hors ligne :
  - `apres-tablette-hors-ligne-1-en-attente.png` ;
  - `apres-tel-hors-ligne-1-en-attente.png`.
- Refus du serveur, avec l'en-tête « Synchro en échec · 1 en attente » et la liste dépliée :
  - `apres-reglages-ordi-refus-liste.png` ;
  - `apres-reglages-tablette-refus-liste.png`.
- Sauvegardes :
  - `apres-sauvegardes-ordi-ok.png` ;
  - `apres-sauvegardes-ordi-echec.png` ;
  - `apres-sauvegardes-tablette-echec.png` ;
  - `apres-sauvegardes-tel-echec.png`.
- Non-régression :
  - `non-regression-pdfreader.png` ;
  - `mealweek-avant.png` = `mealweek-apres.png`.

## 5. Commits

- `550ff49` fix(medrevise) : un seul état de synchro pour l'en-tête et Réglages ; `srcId` « bfc… » n'est plus un fichier manquant.
- `f65e3cc` feat(sauvegarde) : rattrapage à l'ouverture (`/api/backup-catchup`), réussite vérifiée, trace des échecs.
- `58b64e2` test(medrevise) : bancs sauvegarde + statut de synchro (ordinateur, tablette, téléphone), faux GitHub local.
- Ce compte rendu : docs.

## 6. Pour rejouer les bancs

1. Lancer `faux-supabase`, `faux-github` et `medrevise-banc-sauvegarde` (`.claude/launch.json`).
2. Lancer Chrome headless sur les ports 9335 (1440×900), 9336 (390×844) et 9337 (1024×1366), avec des profils neufs.
3. Exécuter, dans `scripts/tests-sauvegarde-statut/` :

```bash
node seed.mjs && node t-synchro.mjs && node t-sauvegarde.mjs
```

Les captures « avant » demandent en plus :

- le commit de départ dans un dossier de travail séparé (`git worktree add <dossier> a5b20b2`, avec `node_modules` lié) ;
- servi par Vite sur :5304 avec les mêmes variables `VITE_SUPABASE_*` ;
- et Chrome sur le port 9338.
