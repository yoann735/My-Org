# Transcription de cours en direct — compte-rendu (05/10/2026)

Fonctionnalité livrée dans MedRevise : un bouton **Transcrire** dans le lecteur PDF d'un cours,
un onglet **Transcript** à droite (à côté de « Notions ») qui affiche le cours en français,
ligne par ligne, en direct (Deepgram nova-3), et qui ne perd rien : coupure réseau,
onglet rechargé, plantage, pause, onglet en arrière-plan.

Les deux paliers sont livrés, commités et poussés sur `main`. Build vert. MealWeek identique
au pixel près (voir § Tests).

---

## 1. Architecture retenue

```
                         ┌──────────────────── navigateur (MedRevise) ─────────────────────┐
  micro / BlackHole      │                                                                  │
  ou onglet Chrome ──────┼─▶ audio.js : AudioWorklet → PCM16 mono 16 kHz, blocs de 100 ms   │
  (getUserMedia /        │        │  (+ niveau RMS → VU-mètre, « Pas de son ? »)            │
   getDisplayMedia)      │        ▼                                                         │
                         │   engine.js (singleton hors React)                               │
                         │     • tampon de rejeu ≤ 120 s (audio non encore transcrit,       │
                         │       jamais écrit nulle part)                                   │
                         │     • horloge = blocs audio (KeepAlive, chien de garde,          │
                         │       reconnexion — insensible au bridage des onglets cachés)    │
                         │        │ ① POST /api/deepgram-token                               │
                         │        │ ② WebSocket wss://api.deepgram.com/v1/listen             │
                         │        │    sous-protocole ["bearer", jeton]                      │
                         │        │    ?model=nova-3&language=fr&interim_results=true        │
                         │        │    &smart_format=true&punctuate=true&utterance_end_ms=1500│
                         │        │    &vad_events=true&encoding=linear16&sample_rate=16000  │
                         │        │    &channels=1&keyterm=…&keyterm=…                       │
                         │        ▼                                                         │
                         │   Results interim → ligne grisée (même nœud DOM que la future    │
                         │   ligne validée : pas de saut) · is_final → segment validé       │
                         │        │ écrit dans IndexedDB À CHAQUE segment (sessions.js)     │
                         │        ▼                                                         │
                         │   store transcript_session (IndexedDB)                           │
                         │        │ à l'arrêt seulement                                     │
                         │        ▼                                                         │
                         │   synchro.js → outbox → RPC medrevise_push (garde-fou updated_at)│
                         └────────┼─────────────────────────────────────────────────────────┘
                                  │                         ▲
  ① /api/deepgram-token (Vercel)  │                         │ lecture ciblée : métadonnées
     origine vérifiée, 120/10 min │                         │ (record_id, updated_at), puis
     POST /v1/auth/grant ttl 300 s│                         │ seulement les sessions plus récentes
     avec DEEPGRAM_API_KEY ───────┘                Supabase medrevise_records (store = 'transcript_session')
```

**Jeton** : le serveur appelle `POST https://api.deepgram.com/v1/auth/grant` avec la clé et
renvoie `{ access_token, expires_in: 300 }`. Le jeton ne sert qu'à ouvrir la connexion ; une
nouvelle connexion (reconnexion) redemande un jeton. La clé n'existe que dans la fonction.

**Segments** : `{ id, t0, t1, text, status }`, `status` ∈ `final` (validé par Deepgram),
`uncertain` (texte provisoire figé au moment d'une coupure), `gap` (repère : « Reprise de la
session », « Audio non transcrit… »). Temps en secondes de cours enregistré (hors pauses).

**Reconnexion sans trou ni doublon** : l'audio reste dans un tampon tant qu'aucun texte ne le
couvre. À la reconnexion (1 → 2 → 5 → 10 s, nouveau jeton), tout l'audio postérieur au dernier
mot acquis est renvoyé à Deepgram : ce qui a été dit pendant la coupure est transcrit à
retardement. Le provisoire affiché au moment de la coupure est figé « incertain » jusqu'à la
fin de son dernier mot ; le rejeu part de là. Garde-fou mot à mot : un mot validé qui finit
avant ce point est écarté.

### Fichiers

| Fichier | Rôle |
|---|---|
| `api/deepgram-token.js` | fonction Vercel : jeton temporaire, origine, débit, erreurs lisibles |
| `vite.config.js` | middleware de **dev** qui exécute la même fonction (`apply: 'serve'`, rien au build) |
| `src/medrevise/transcription/audio.js` | capture micro/onglet, AudioWorklet PCM16, liste des entrées |
| `…/engine.js` | moteur de session (WebSocket, rejeu, KeepAlive, pause, arrêt, notes, mots-clés) |
| `…/keyterms.js` | découpage de la saisie, compteur, propositions depuis le PDF, surlignage |
| `…/sessions.js` | enregistrements IndexedDB (écriture sérialisée), mots-clés du cours, suppression |
| `…/synchro.js` | palier 2 : envoi par l'outbox, lecture ciblée, LWW |
| `…/TranscriptPanel.jsx` | bouton, feuille de démarrage, panneau, lecture, liste des sessions |
| `…/IndicateurGlobal.jsx` | pastille flottante quand la session tourne hors du lecteur |
| `…/exporter.js`, `useTranscription.js` | copie / .txt / .md ; pont React |
| `src/styles/transcription.css` | styles (tokens du thème uniquement) |
| `src/medrevise/data/sync.js` | + stores isolés, `pullStoreMeta`, `pullStoreIds`, exclusion de `pullAllRecords` |
| `src/medrevise/lib/storage.js` | + store `transcript_session` (hors `SYNCABLE`), écritures « depuis le cloud », appel dans `syncNow` |
| `PdfReader.jsx`, `PdfToolbar.jsx`, `CourseItemsSidebar.jsx`, `MedReviseApp.jsx` | intégration (quelques lignes chacun) |
| `scripts/faux-deepgram.mjs`, `scripts/faux-supabase.mjs` | outils de test locaux (jamais chargés par l'app) |

---

## 2. Décisions prises seul

1. **Moteur hors de React (singleton)** : changer d'onglet du panneau, replier le panneau,
   passer en mode focus ou quitter le lecteur **n'arrête pas** la session. Une pastille flottante
   (chrono, Pause, Arrêter) apparaît dès que le lecteur du cours n'est plus affiché.
2. **Pas de SDK `@deepgram/sdk`** : un WebSocket natif suffit (sous-protocole `bearer`) ; zéro
   dépendance ajoutée.
3. **AudioWorklet + décimation maison vers 16 kHz** (pas d'`AudioContext` à 16 kHz, mal supporté hors Chrome).
4. **Horloge = blocs audio** : KeepAlive (toutes les 5 s en pause), chien de garde (aucune réponse
   depuis 15 s, ou tampon d'envoi bloqué 5 s) et échéance de reconnexion sont lus à chaque bloc
   de 100 ms, en plus d'un `setTimeout` de secours — le fil audio n'est pas bridé onglet caché.
5. **Rejeu de l'audio non couvert** (≤ 120 s en mémoire) plutôt que d'accepter un trou ; au-delà
   de 120 s de coupure, l'audio le plus ancien est perdu et le transcript le **dit** (repère).
6. **Jeton demandé avant d'ouvrir le micro** : clé absente/invalide ou crédits épuisés
   s'affichent dans la feuille, rien ne démarre et rien n'est enregistré.
7. **Une ligne par `is_final`** (comme demandé), provisoire en **gris sans italique** : l'italique
   change la largeur du texte et peut faire sauter une ligne au moment de la validation. La
   ligne provisoire porte déjà l'id de la future ligne validée → même nœud DOM, seule la couleur
   change (transition 0,35 s).
8. **Horodatages non sélectionnables** : une sélection à la souris copie du texte propre ;
   « Copier tout » donne la version horodatée, et un menu propose « sans horodatage », .txt, .md.
9. **Auto-défilement** : seule une montée volontaire le met en pause (un panneau qui rétrécit —
   éditeur de mots-clés, note — ne le fait pas). Une session passée s'ouvre en haut.
10. **2 000 lignes sans virtualisation JS** : `content-visibility: auto` sur chaque ligne + lignes
    mémoïsées. Mesuré : 60 images/s pendant le flux et en parcourant toute la liste (§ 5).
11. **Mots-clés du cours** : un enregistrement `kt:<id du cours>` dans le même store (synchronisé
    avec lui). Surlignage insensible à la casse et aux accents, pluriel en -s/-x toléré.
    Propositions depuis la couche texte du PDF par heuristique (suffixes/préfixes médicaux, mots
    longs, noms propres, « canal de Havers »), 40 au plus, **non cochées** par défaut. Au-delà de
    100 mots, les derniers termes ne sont pas envoyés (et l'UI le dit).
12. **Id du cours** = l'id du document ouvert dans le lecteur (`ficheId`) : marche aussi pour un
    document de Prise de notes.
13. **Limiteur du jeton à 120 / 10 min / IP** (et non 20) : avec un wifi d'amphi instable, une
    reconnexion toutes les 10 s fait 60 jetons / 10 min ; à 20, la transcription se bloquait
    plusieurs minutes (constaté pendant les tests).
14. **Palier 2 — store hors `SYNCABLE`, synchro ciblée** : `reconcileAll` relit toute la table à
    chaque retour sur l'onglet ; y mettre des sessions de 100–400 Ko aurait alourdi toute la
    synchro. Le type est exclu de `pullAllRecords` (`store=not.in.(transcript_session)`), lu par
    métadonnées puis par ids. Envoi par la même outbox et la même RPC conditionnelle, mais **un
    enregistrement par appel, après le lot commun** : un refus de ce type ne retient jamais les
    autres. Une session en direct n'est jamais poussée avant l'arrêt.
15. **Migration** : la table étant générique, **aucune DDL n'est nécessaire** ; la migration
    n'ajoute qu'un index partiel (lecture des métadonnées). Sans elle, tout fonctionne.
16. **Téléphone** : le shell mobile de MedRevise n'a pas de lecteur PDF → pas de bouton
    Transcrire sur téléphone ; une session lancée sur ordinateur reste pilotable par la pastille
    si la fenêtre devient étroite. Tablette / fenêtre étroite : lecteur complet, le bouton bascule
    sur « Panneau ».
17. **Plein écran** = superposition plein cadre dans la page (pas l'API Fullscreen, qui sort au
    moindre changement d'onglet) ; Échap pour sortir ; tailles ×1,5.

---

## 3. Commits

| Commit | Message |
|---|---|
| `d957d7e` | feat(medrevise): /api/deepgram-token — jeton Deepgram temporaire côté serveur |
| `48cba8a` | feat(medrevise): moteur de transcription en direct (Deepgram nova-3, fr) |
| `af6bd94` | feat(medrevise): panneau Transcript dans le lecteur PDF |
| `42069ba` | test(medrevise): faux Deepgram local (grant, WebSocket, pannes injectables) |
| `690a4a7` | feat(medrevise): synchro cloud des sessions de transcription (additive) |
| `75bbd95` | chore(supabase): migration additive transcript_session (index partiel, non appliquée) |
| `1c59264` | test(medrevise): faux Supabase — refus injectable d'un store, filtres in./not.in. |
| `cd0a6c2` | fix(medrevise): transcription — la reprise après coupure repart du dernier mot reconnu |
| (ce commit) | docs(medrevise): compte-rendu transcription directe |

Paliers : **1** = `d957d7e` → `42069ba` · **2** = `690a4a7` → `1c59264`.

---

## 4. Captures

| | |
|---|---|
| Feuille de démarrage (source, mots-clés proposés depuis le PDF) | ![](img/transcription-directe/01-feuille-demarrage.png) |
| **Session réelle Deepgram** (10 min 32 s) | ![](img/transcription-directe/02-session-deepgram-reel.png) |
| Mot-clé ajouté en pleine session | ![](img/transcription-directe/03-mots-cles-en-direct.png) |
| Note personnelle (bordure ambre) | ![](img/transcription-directe/04-note-personnelle.png) |
| Auto-défilement en pause : « ↓ Reprendre · N nouvelles lignes » | ![](img/transcription-directe/05-autoscroll-reprendre.png) |
| Plein écran, grande taille | ![](img/transcription-directe/06-plein-ecran.png) |
| Reprise après rechargement de l'onglet | ![](img/transcription-directe/07-reprise-apres-rechargement.png) |
| Erreur fatale en cours (crédits épuisés) | ![](img/transcription-directe/08-erreur-credits.png) |
| Sans clé serveur | ![](img/transcription-directe/09-sans-cle.png) |
| Pastille de session sur téléphone | ![](img/transcription-directe/10-pastille-mobile.png) |
| Tablette (820 px) | ![](img/transcription-directe/11-tablette.png) |

---

## 5. Tests réalisés (Chrome)

Banc : Chrome 154 headless piloté en CDP (vrais événements souris/clavier), micro simulé lisant
un fichier audio, Vite local avec **faux Supabase** (`scripts/faux-supabase.mjs`) — le vrai cloud
n'a jamais été touché. Deux sources Deepgram : le **vrai Deepgram** (jeton obtenu auprès de la
fonction de production, qui détient la clé) et un faux Deepgram local pour injecter des pannes.

### Avec le vrai Deepgram

Audio : 6 min de cours d'anatomie/histologie/myologie en français (voix macOS « Thomas »,
893 mots, en boucle) injecté comme micro.

| Test | Résultat |
|---|---|
| Session > 10 min | ✅ 10 min 32 s, **251 lignes validées**, ~1 500 mots, 1 note |
| Texte continu, lignes séparées, ponctuation | ✅ « Aujourd'hui nous poursuivons l'ostéologie et l'histologie osseuse, » / « avant d'attaquer la myologie du membre supérieur. » |
| Vocabulaire | ✅ canal de Havers, canaux de Volkmann, lacunes de Howship, ostéoclastes, mécanotransduction, déminéralisation, sillon intertuberculaire… · ❌ quelques erreurs de reconnaissance de la voix de synthèse (« Poutot-Coll », « calorim » pour cal mou, « supprimé glénoïdal ») |
| Mots-clés surlignés | ✅ |
| Mot-clé ajouté en session (« fibres de Sharpey ») | ✅ `Configure` accepté sans reconnexion ; terme correctement transcrit ensuite (je ne peux pas prouver qu'il ne l'aurait pas été sans) |
| Hors ligne 20 s | ✅ coupure détectée aussitôt, reconnexion dès le retour (nouveau jeton), 21,6 s d'audio rejouées, aucune ligne perdue ni doublée |
| Pause 32 s | ✅ connexion restée ouverte (Deepgram coupe à 10 s sans KeepAlive) |
| Rechargement en pleine session | ✅ 125 lignes + note retrouvées, reprise proposée puis relancée |
| Arrêt | ✅ Finalize → CloseStream → fermeture 1000, session écrite avec `endedAt` |
| Frontière de coupure (après correctif `cd0a6c2`) | ✅ « L'ostéocyte est un *(incertain)* \| Mécanorécepteur » — avant le correctif, un mot à cheval sur la coupure pouvait sauter |

### Avec le faux Deepgram (pannes contrôlées)

| Test | Résultat |
|---|---|
| Coupure franche + refus 20 s | ✅ une seule reconnexion, texte continu |
| Connexion gelée 20 s (wifi coupé vu du navigateur) | ✅ détectée en 15 s, reconnexion 3 s après le retour, texte d'un seul tenant (« …vaisseaux et \| des *(incertain)* \| nerfs. Les canaux… ») |
| Mode hors ligne du navigateur 20 s | ✅ coupure immédiate, reconnexion dès `online` |
| Pause 30 s | ✅ Finalize puis KeepAlive toutes les 5 s, même connexion |
| Ajout de mot-clé en session | ✅ `Configure` reçu, effet simulé visible |
| Rechargements / redémarrage brutal de Chrome en session | ✅ (×6) reprise proposée, rien de perdu, provisoire sauvé « incertain » |
| Crédits épuisés au démarrage / en cours | ✅ message clair ; en cours : texte gardé, session proposée en reprise |
| Sans clé serveur | ✅ « Clé Deepgram manquante côté serveur. » dans la feuille, micro jamais ouvert, rien enregistré |
| Onglet Chrome sans piste audio | ✅ message « Aucun son reçu : … coche « Partager aussi le son de l'onglet » … », piste vidéo arrêtée |
| Onglet Chrome avec audio | ✅ (source simulée de Chrome) vidéo arrêtée, audio transcrit |

### Interface, robustesse, non-régression

| Test | Résultat |
|---|---|
| Auto-défilement / pause au scroll / « Reprendre · N nouvelles lignes » | ✅ |
| Sélection souris + copie | ✅ texte propre (horodatages exclus) |
| Copier tout / sans horodatage / .txt / .md | ✅ |
| Note inline, écrite dans IndexedDB | ✅ |
| 3 tailles mémorisées, plein écran, Échap | ✅ |
| Navigation : onglet Notions, panneau replié, mode focus | ✅ la session continue ; pastille hors du lecteur |
| 2 000 lignes | ✅ rendu initial OK, **60 images/s** (médiane et p95 16,7 ms, 0 image > 50 ms) en flux et en parcourant 147 000 px |
| Mémoire 25 min | ✅ tas 18,8 → 21,5 Mo pour 613 lignes (≈ 4 Ko par ligne de texte), linéaire ; aucun audio conservé → ≈ 40 Mo estimés pour 3 h |
| Console | ✅ aucune erreur ; seul avertissement « Multiple GoTrueClient » préexistant (deux clients Supabase MealWeek/MedRevise) |
| Mobile 390 px / tablette 820 px | ✅ (voir § 2, décision 16) |
| Annotations PDF (surligneur, boîte), onglet Notions, ajout de flashcard, menu des dessins du téléphone | ✅ |
| Synchro des autres types pendant que ce type est refusé par le cloud | ✅ la flashcard modifiée est partie, la session est restée dans l'outbox, puis est partie quand le refus a été levé |
| Deux appareils (faux Supabase) | ✅ sessions et mots-clés de A visibles sur B ; suppression sur B (sauvegarde `pre-delete-transcript-…` puis tombstone) → disparaît de A |
| MealWeek | ✅ aucun fichier MealWeek/`src/shared` modifié ; build avant (`6516d71`) et après comparés : hub, accueil et liste de courses **identiques au pixel près** |
| Production | ✅ `/api/deepgram-token` sur my-org-blue.vercel.app : jeton délivré (origine de l'app), 403 pour une autre origine, 405 en GET |

### Non fait / écarts

- **Micro réel du Mac + YouTube dans les haut-parleurs** : remplacé par une voix de synthèse
  injectée comme micro (reproductible, sans faire jouer de son chez toi). À refaire en vrai.
- **Source « Onglet Chrome » sur un vrai onglet YouTube** : la fenêtre de partage de Chrome est
  une interface native que je ne peux pas piloter ; testé sur la source simulée de Chrome et sur
  le cas « pas de son ». À refaire en vrai (choisir l'onglet, cocher « Partager le son »).
- **Périphérique virtuel BlackHole** : non installé sur cette machine ; la liste des entrées
  (`enumerateDevices`) l'affichera comme n'importe quelle entrée.
- **Session de 3 h réelle** : non faite ; extrapolation depuis 25 min + test 2 000 lignes.

---

## 6. Consommation mesurée (console.deepgram.com)

- **11,8 minutes** de transcription au compteur « Usage — Speech to Text » (session réelle de
  10 min 32 s + rejeux après coupures + test de frontière de ~1 min 40).
- **Crédit : 200,00 $ → 199,92 $**, soit **≈ 0,08 $** (≈ 0,007 $/min, mots-clés compris).
- Ordre de grandeur : 1 h de cours ≈ 0,40–0,45 $ ; 200 $ offerts ≈ 450 h de cours.
  (Tarif public nova-3 streaming : 0,0048 $/min promotionnel, 0,0077 $/min normal ; l'option
  « keyterm prompting » est facturée en plus — [diyai.io](https://diyai.io/ai-tools/speech-to-text/deepgram-pricing-2026/),
  [convertaudiototext.com](https://convertaudiototext.com/blog/deepgram-nova-3-explained).)
- Une pause ne consomme rien (aucun audio envoyé, seulement des KeepAlive).

---

## 7. Migration SQL à appliquer (toi, à la main)

**Chemin** : `supabase/migrations/20261005_transcript_session.sql`
**Facultative** : la synchro des sessions marche sans elle (la table est générique).
Supabase → SQL Editor → New query → coller → Run.

```sql
create index if not exists medrevise_records_transcript_meta
  on public.medrevise_records (record_id, updated_at, deleted)
  where store = 'transcript_session';

notify pgrst, 'reload schema';
```

Aucune ligne lue, écrite ou supprimée ; idempotente. Requêtes de vérification (lecture seule)
en commentaire dans le fichier.

---

## 8. Variables d'environnement Vercel

| Variable | Où | Obligatoire | Rôle |
|---|---|---|---|
| `DEEPGRAM_API_KEY` | Production, Preview, Development — **déjà présente** (ajoutée le 05/10) | oui | clé Deepgram (rôle « Member » au minimum pour créer des jetons) — serveur uniquement |
| `DEEPGRAM_ALLOWED_ORIGINS` | facultatif | non | origines autorisées en plus du domaine qui sert l'app (ex. un domaine perso), séparées par des virgules |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | inchangées | — | synchro (déjà en place) |

`DEEPGRAM_API_URL` / `DEEPGRAM_LISTEN_URL` existent pour les tests locaux contre
`scripts/faux-deepgram.mjs` : **ne pas les définir sur Vercel**. Aucun Redeploy nécessaire
(la clé est déjà là et le dernier déploiement est postérieur).

En local : `DEEPGRAM_API_KEY=…` dans `.env.local` (non commité) puis `npm run dev` — le
middleware de dev sert `/api/deepgram-token`.

---

## 9. Limites connues

- **Arrière-plan (vérifié)** : quand l'onglet est caché, Chrome bride ses minuteurs (1/s, puis
  1/min au bout de 5 min). Testé avec ce bridage avancé à 10 s : un onglet témoin sans micro
  tombe à 23 tops en 45 s, alors que l'onglet qui **capture le micro n'est pas bridé** (50/50) ;
  la transcription continue (20 lignes en 50 s onglet caché), une coupure survenue onglet caché
  est rattrapée en 3 s, et une pause de 40 s onglet caché garde la connexion (KeepAlive). Le moteur
  ne dépend de toute façon pas des minuteurs (horloge = fil audio). Non couvert : la mise en
  veille du Mac (capot fermé) coupe l'audio — la session reprend en « Reconnexion… » au réveil.
- **Coupure > 120 s** : l'audio le plus ancien n'est plus rejoué ; le transcript affiche
  « Audio non transcrit (coupure réseau trop longue) » à cet endroit.
- **Frontière de coupure** : un fragment de mot peut apparaître en « incertain » juste avant le
  mot complet rejoué (« le père *(incertain)* \| Périoste ») — jamais de perte, au pire un fragment signalé.
- **Une session à la fois** sur l'appareil ; deux onglets ouverts sur le même cours ne se
  coordonnent pas.
- **Téléphone** : pas de lecteur PDF dans le shell mobile, donc pas de démarrage depuis le téléphone.
- **Le limiteur de débit** est en mémoire, par instance de fonction Vercel : il freine un abus
  naïf, ce n'est pas une authentification (l'app n'en a pas ; l'origine est vérifiée).
- **Sauvegarde locale (Réglages)** : les transcripts ne sont pas inclus dans le fichier de
  sauvegarde JSON (store hors `SYNCABLE`) ; ils sont dans IndexedDB et au cloud.
- **Seconde passe « médicale »** : aucune, comme demandé — une seule passe en direct.

---

## 10. Reproduire les tests

```sh
node scripts/faux-supabase.mjs                      # :54399
node scripts/faux-deepgram.mjs                      # :54400
VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_ANON_KEY=cle-de-test \
DEEPGRAM_API_KEY=cle-de-test DEEPGRAM_API_URL=http://localhost:54400 \
DEEPGRAM_LISTEN_URL=ws://localhost:54400/v1/listen npx vite --port 5199
# pannes : curl -X POST 'localhost:54400/__couper?refus=20' | '/__geler?s=20' | '/__credits?zero=1'
#          curl -X POST 'localhost:54399/__refuser?stores=transcript_session'
# Chrome : --use-fake-device-for-media-stream --use-fake-ui-for-media-stream
#          --use-file-for-fake-audio-capture=cours.wav --no-sandbox (sinon le fichier n'est pas lu)
```
Piège de dev : modifier `engine.js`, `keyterms.js`, `api/…` ou `scripts/…` recharge la page
(Vite) — c'est un rechargement en pleine session, la reprise le gère.
