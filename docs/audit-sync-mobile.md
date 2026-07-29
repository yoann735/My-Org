# Audit — désync mobile & fiches fantômes (MedRevise)

Analyse seule, aucun code modifié. Portée : `src/medrevise/**` (MealWeek non touché —
voir §E pour la vérification de non-collision).

---

## 1. Schéma réel des données

### 1.a Local (IndexedDB, via `idb-keyval`)

`src/medrevise/lib/storage.js:12` — chaque « table » est en réalité une **base IndexedDB
séparée** (`idb-keyval.createStore(dbName, storeName)` crée une DB dédiée par nom) :

```
store = (name) => createStore('medrevise-' + name, 'v1')
```

Donc `medrevise-sources`, `medrevise-matieres`, `medrevise-fiches`, `medrevise-questions`,
`medrevise-structures`, `medrevise-highlights`, `medrevise-annotations`, `medrevise-blobs`,
`medrevise-stats`, `medrevise-meta`, `medrevise-backups`, `medrevise-exos`,
`medrevise-docs`, `medrevise-anatstruct` — **14 bases IndexedDB physiques distinctes**,
chacune avec un unique object store `'v1'` à clé simple (`id`). Aucun index secondaire :
toute requête par `ficheId`/`type`/etc. est un scan complet + filtre en JS (voir
`lib/planning.js` — `db.questions.filter(...)` partout). Pas un bug, mais confirme qu'il
n'y a **aucune contrainte d'intégrité référentielle** côté stockage — rien n'empêche des
questions orphelines (déjà constaté, voir `migrateOrphanCleanupV1`, `lib/migrate.js:105-142`).

**Stores SYNCABLES** (`lib/storage.js:34`) :
```js
const SYNCABLE = ['sources', 'matieres', 'fiches', 'questions', 'structures',
  'highlights', 'annotations', 'stats', 'exos', 'docs', 'anatstruct'];
```
`meta` et `backups` restent **locaux uniquement** (marqueurs de migration, sauvegardes
pré-migration — propres à l'appareil, jamais synchronisés, `storage.js:30-33`). `blobs` a
son propre canal (Supabase Storage, pas la table de records — voir §1.b).

**Une fiche et ses items sont dans des stores SÉPARÉS**, pas un JSON embarqué :
- `fiches` : un enregistrement par fiche (`{id, matiereId, titre, type, pdfId, htmlId,
  archive, rappelsJ, coef, images[], etc.}`).
- `questions` : un enregistrement par item (QCM/flashcard/Feynman/exercice), avec
  `ficheId` en clé étrangère logique (pas de FK réelle), plus l'état SM-2
  (`interval, repetition, efactor, nextReview, historique, missed`).

Chaque enregistrement SYNCABLE porte un champ `updatedAt` (ISO string, horloge **locale**
de l'appareil), posé à chaque écriture par `put`/`putMany` (`storage.js:44-56`).

### 1.b Remote (Supabase)

Une seule table générique, **séparée entre fiches et items uniquement par la colonne
`store`**, pas par des tables dédiées (`MEDREVISE_SUPABASE_SYNC.md:31-38`) :

```sql
create table public.medrevise_records (
  store text not null,        -- 'fiches' | 'questions' | 'sources' | ... (miroir de SYNCABLE)
  record_id text not null,    -- id local de l'enregistrement
  data jsonb not null,        -- l'objet COMPLET tel que stocké localement (superset)
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  primary key (store, record_id)
);
```

RLS : `for all to anon using (true) with check (true)` — **aucune identité utilisateur**,
aucun `user_id`/`device_id`. La clé anon Supabase fait office d'identité unique (voir §D).
Bucket `medrevise-blobs` (images/PDF), séparé — mêmes policies `anon`.

**Confirmation** : une fiche et ses items vivent bien dans des **enregistrements séparés**
de la même table générique (`store='fiches'` vs `store='questions'`), reliés seulement par
la valeur `ficheId` embarquée dans le JSON `data` des questions — aucune clé étrangère
réelle côté Supabase non plus.

---

## 2. Flux de synchro — diagramme texte

```
 ÉCRITURE LOCALE (put/putMany/remove, lib/storage.js:44-60)
   │
   ├─► set()/del() IndexedDB IMMÉDIAT (synchrone du point de vue de l'app)
   │
   └─► queuePush(store, id, data, updatedAt, deleted?)   [data/sync.js:20-25]
          │
          └─► pending.set(`${store}:${id}`, {...})
              clearTimeout(pushTimer); pushTimer = setTimeout(flushPending, 800ms)
                          │
                          ▼  (SEULEMENT si rien d'autre n'interrompt le timer)
                    flushPending() [sync.js:27-34]
                          │
                          └─► supabase.from('medrevise_records').upsert(batch,
                                { onConflict: 'store,record_id' })
                              catch → SILENCIEUX, rien ne re-planifie l'essai
                              (aucune persistance de la file, aucun retry programmé ici)

 DÉMARRAGE APP (MedReviseApp.jsx:84-88)
   reconcileAll() → canSeed(rec) ? seedIfEmpty() : skip → runMigrations() → reload()

 RECONNEXION / VISIBILITÉ (MedReviseApp.jsx:92-98)
   window 'online' → onSync()
   document 'visibilitychange' (→ visible seulement) → onSync()
   onSync = reconcileAll().then(r => r.ok && reload())
   ⚠ AUCUN polling périodique, AUCUN handler 'beforeunload'/'pagehide' (vérifié : absent
     du code) — rien ne force un flush des écritures en attente avant fermeture/mise en
     arrière-plan de l'onglet.

 reconcileAll() [lib/storage.js:297-340] — PAR STORE SYNCABLE :
   pull = pullAllRecords() → SELECT store,record_id,data,updated_at,deleted (tout, sans filtre)

   POUR chaque enregistrement LOCAL déjà connu de cet appareil (storage.js:312-331) :
     - absent du cloud            → push (queuePush)
     - cloud.deleted=true          → cloudTs>=localTs ? suppression LOCALE : push (réhabilite le cloud)
     - cloud plus récent           → adopte cloud.data localement (ÉCRASE le local)
     - local plus récent           → push local

   POUR chaque enregistrement CLOUD inconnu de cet appareil (storage.js:334-337) :
     - cloud.deleted=true  → ignoré (bien : pas de résurrection d'un VRAI tombstone)
     - sinon               → adopté tel quel, SANS INSPECTER data.archive/data.rappelsJ
                              (droit : le filtre "archive" est une responsabilité de l'UI,
                              pas du sync — mais voir §3.1, c'est le point de bascule zombie)
```

**Bidirectionnel : OUI.** Push et pull existent tous les deux, et le pull gère mise à jour
ET nouveaux enregistrements. Tous les champs de l'objet (`data` = l'enregistrement complet)
partent au push — **rien ne reste "local only" par design** parmi les stores SYNCABLE (les
champs `_fiche`/`_matiere`/`_coef`/`_j` ajoutés transitoirement en mémoire dans
`session/Session.jsx` sont explicitement supprimés avant `saveQuestion`, donc jamais
persistés ni synchronisés — non pertinent ici).

**Déclenchement** : démarrage (mount), reconnexion réseau, retour de visibilité. **Jamais
d'intervalle ni de bouton "synchroniser maintenant"** exposé à l'utilisateur.

**Le mobile pull-t-il vraiment ?** Oui, exactement le même code (`MedReviseApp.jsx` héberge
le bootstrap et les listeners AVANT la bascule `isMobile` ligne 293 — `MobileApp.jsx` ne
fait que router entre home/session/exercice/feynman, sans logique de sync propre). Il
**merge** (comparaison par enregistrement, jamais un écrasement en bloc) — mais voir §3
pour où ce merge peut faire remonter des données stales.

---

## 3. Cause racine de chaque symptôme

### 3.1 ZOMBIES (fiches "Système respiratoire" / "Membre supérieur")

**Preuve n°1 — ce ne sont pas des fiches quelconques.** Ce sont *exactement* les titres
des fiches de démo seedées par `_seedIfEmpty()` :

```
lib/storage.js:201   { id: 'f-resp', ..., titre: 'Système respiratoire', ... }
lib/storage.js:203   { id: 'f-ms',   ..., titre: 'Membre supérieur', ... }
```
avec des **IDs FIXES** (`'f-resp'`, `'f-ms'`, `'f-ab'`, `'fac'`, `'physio'`, `'anat'`) —
pas des `genId()` aléatoires. Ce n'est pas une coïncidence de nommage utilisateur.

**Le mécanisme de résurrection, en 3 temps :**

1. **Historique confirmé par le code lui-même.** Le commit `1f42603` (log du dépôt, déjà
   en tête de `main`) documente *exactement* ce bug, dans son propre message et ses
   commentaires :
   - `lib/storage.js:289-295` : *"seedIfEmpty() ne doit tourner que quand on est SÛR
     qu'aucune donnée n'existe... semer alors que le pull a simplement échoué créerait des
     ID fixes (fac/physio/f-resp…) qui, une fois poussés avec un timestamp neuf, peuvent
     gagner la comparaison LWW face à de vraies données plus anciennes (ou déjà
     supprimées)"*.
   - Avant ce fix, `seedIfEmpty()` tournait dès que le local était vide, **sans vérifier
     que le pull cloud avait réussi** (`canSeed()` n'existait pas). Sur un appareil dont le
     pull échouait (offline au démarrage, latence, ou tout simplement premher lancement
     d'un navigateur mobile jamais synchronisé) le local vide déclenchait un **reseed** des
     fiches à ID fixe — avec un `updatedAt` flambant neuf.
   - Ce nouvel enregistrement (`archive` ABSENT du seed, cf. `lib/storage.js:201-203` — pas
     de champ `archive: true`) est ensuite poussé via `queuePush`. Comme son timestamp est
     plus récent que celui de la fiche que l'utilisateur avait *déjà* supprimée
     (archivée) sur desktop auparavant, il **gagne la comparaison LWW** et écrase la
     version archivée côté cloud.
2. **Le fix actuel (`canSeed`, `lib/storage.js:342-349` + `MedReviseApp.jsx:84-88`)
   empêche une NOUVELLE occurrence de cette corruption**, mais ne fait **rien pour réparer
   les lignes déjà corrompues** dans `medrevise_records` — il n'existe aucune migration de
   nettoyage ciblant spécifiquement ces IDs fixes (contrairement à
   `migrateOrphanCleanupV1`, `lib/migrate.js:105-142`, qui purge des ORPHELINS, pas des
   fiches "ressuscitées" valides). **La donnée cloud reste corrompue rétroactivement.**
3. **Le point de rupture précis où ça se propage encore aujourd'hui** :
   `lib/storage.js:334-337`
   ```js
   for (const [id, cloud] of cloudMap) {
     if (localIds.has(id) || cloud.deleted) continue;
     await set(id, cloud.data, S[name]);   // <-- ici : adopté tel quel, "archive" ignoré
   }
   ```
   Tout appareil qui reconcilie et **ne connaît pas encore localement** cet ID (typiquement
   le mobile — session/navigateur/profil différent, jamais vu ce record) adopte
   `cloud.data` **sans vérifier `data.archive`**. Si la ligne cloud pour `f-resp`/`f-ms`
   porte encore la trace de la corruption (archive absent/false), le mobile l'affiche comme
   une fiche active toute neuve — **exactement le symptôme rapporté**.

**Pourquoi le desktop, lui, ne les voit pas** : son IndexedDB local a déjà sa PROPRE copie
archivée (`archive:true`) avec son propre `updatedAt`. Tant que ce timestamp local reste
plus récent que celui de la ligne cloud, la boucle `storage.js:312-331` re-pousse la
version archivée (`localTs > cloudTs → queuePush`) au lieu de l'écraser — desktop reste
cohérent avec ce qu'il croit avoir supprimé, **tant que son propre re-push aboutit** (voir
§3.2 : ce re-push est soumis à la même fragilité que toute autre écriture).

**Second point de rupture, plus général — la suppression "normale" n'écrit pas de
tombstone :**
`pages/Reviser.jsx:151` → `else if (confirmDel.type === 'fiche') await
ctx.setFicheArchived(confirmDel.id, true);` → `MedReviseApp.jsx:182-184` :
```js
setFicheArchived: async (ficheId, on) => {
  const f = db.fiches.find((x) => x.id === ficheId); if (!f) return;
  await put('fiches', { ...f, archive: on }); await reload();
},
```
C'est un **`put()` ordinaire**, pas un `remove()` — **aucun tombstone n'est écrit**. Le
modal lui-même le dit : *"sera déplacée dans la corbeille — restaurable depuis Réglages"*
(`pages/Reviser.jsx:479-480`) — c'est du **soft-delete réversible**, pas une suppression.
Le vrai hard-delete (`ctx.permanentlyDeleteFiche` → `purgeFiche` → `remove('fiches', id)`,
qui POSE un tombstone, `lib/storage.js:57-60` + `255-264`) n'est accessible **que depuis
Réglages → corbeille** (`pages/Reglages.jsx:49-50`) — **et Réglages est explicitement
INACCESSIBLE sur mobile** (`mobile/MobileApp.jsx:3-4`, commentaire : *"pas de Réglages"* —
routeur mobile limité à home/session/exercice/feynman, `mobile/MobileApp.jsx:19-38`). Le
mobile n'a donc **aucun moyen de se corriger lui-même** s'il affiche un zombie — il est
purement passif vis-à-vis de la corbeille.

### 3.2 DÉSYNC ITEMS (QCM/flashcards/Feynman/exercices n'apparaissent pas de l'autre côté)

**H2 est fausse en l'état — infirmée, voir §4** : `questions` (qui contient les 4 types
d'items) est bien dans `SYNCABLE` (`lib/storage.js:34`) et suit **exactement le même**
chemin `put`/`putMany` → `queuePush` que `fiches`. Vérifié : aucun import ne bypasse ce
chemin — `grep` sur tout `src/medrevise` confirme qu'`idb-keyval` n'est importé **que**
dans `lib/storage.js` (aucune écriture directe ailleurs qui court-circuiterait
`queuePush`). `lib/import.js` (`createFicheFromQuestions`, `appendItemsToFiche`,
`components/AddItemForm.jsx`) passent tous par `put`/`putMany`.

**Le vrai point de rupture est le mécanisme de push lui-même, `data/sync.js:15-34` :**
```js
const PUSH_DEBOUNCE_MS = 800;
let pushTimer = null;
const pending = new Map();          // <-- EN MÉMOIRE UNIQUEMENT, jamais persisté

export function queuePush(store, id, data, updatedAt, deleted = false) {
  ...
  clearTimeout(pushTimer);
  pushTimer = setTimeout(flushPending, PUSH_DEBOUNCE_MS);   // <-- setTimeout, tuable
}
async function flushPending() {
  ...
  try { await supabase.from(RECORDS_TABLE).upsert(batch, ...); }
  catch (e) { /* ... repoussé au prochain changement/reconcile */ }  // <-- silencieux
}
```

Faiblesses cumulées, **confirmées par grep** (absence totale des mécanismes suivants dans
tout `src/medrevise`) :
- **`pending` est une `Map` en mémoire de page**, pas une file persistée (ni IndexedDB, ni
  `localStorage`). Fermer l'onglet, verrouiller le téléphone ou changer d'app **avant les
  800 ms** perd l'écriture en attente **définitivement pour cette tentative** — rien ne la
  rejoue au prochain lancement à part le garde-fou décrit ci-dessous.
- **Aucun `beforeunload`/`pagehide`** pour forcer un flush synchrone (`sendBeacon` ou
  équivalent) avant fermeture — vérifié par grep, absent.
- Le seul filet de sécurité est indirect : au prochain `reconcileAll()` (au remontage de
  l'app), la boucle `storage.js:317-320` détecte "local existe, cloud ne l'a pas" et
  **re-déclenche** un `queuePush` — mais celui-ci est **soumis à la même fragilité** (encore
  un `setTimeout` 800 ms, sur le MÊME appareil). Si l'utilisateur importe puis quitte
  l'app immédiatement (très courant sur mobile : import → verrouillage écran), le filet ne
  se referme que la prochaine fois que CET appareil rouvre l'app assez longtemps.
- **Aucun polling périodique côté pull** non plus (`MedReviseApp.jsx:90-91`, commentaire
  explicite : *"capte les changements faits ailleurs SANS POLLING PERMANENT"*) — un appareil
  B resté ouvert en continu (jamais mis en arrière-plan/reconnecté) ne verra jamais les
  ajouts faits sur l'appareil A tant qu'il ne redevient pas "visible" ou ne se reconnecte
  pas.

**Conclusion** : le symptôme n'est pas un défaut de PÉRIMÈTRE de sync (les items sont bien
couverts), mais un défaut de **fiabilité du mécanisme de push partagé par tous les stores**
— exacerbé sur mobile où la mise en arrière-plan/fermeture d'onglet dans les 800 ms suivant
une action est le comportement normal, pas un cas limite. **C'est le même mécanisme qui
explique aussi une partie du §3.1** (un tombstone ou une ré-archive peut tout aussi bien ne
jamais atteindre Supabase).

---

## 4. Statut des hypothèses

**H1 — "la suppression n'écrit aucun tombstone en remote → au pull, la fiche revient."**
→ **Partiellement confirmée, nuance importante.** Vrai pour le chemin de suppression
**par défaut** que l'utilisateur utilise réellement (clic droit dans Réviser →
`setFicheArchived`, `Reviser.jsx:151` / `MedReviseApp.jsx:182-184`) : aucun tombstone, juste
un flag `archive` sur un `put()` normal. **Faux** pour le hard-delete dédié
(`permanentlyDeleteFiche`/`purgeFiche`/`emptyTrash`, `Reglages.jsx`) qui pose bien un
tombstone (`storage.js:57-60`). Si l'utilisateur a cru "supprimer" via le premier chemin
(le plus visible/naturel) et pas via Réglages → corbeille (inaccessible sur mobile de toute
façon), H1 est la cause directe. Preuve : §3.1.

**H2 — "la sync des items est partielle ou absente (seules les fiches, pas leur
contenu)."** → **Infirmée.** `questions` est SYNCABLE au même titre que `fiches`
(`storage.js:34`), même chemin `put`/`queuePush`/`reconcileAll`. Le symptôme observé est
réel mais sa cause n'est pas un périmètre partiel — c'est la fiabilité du mécanisme de push
partagé par TOUS les stores (§3.2), items compris.

**H3 — "le mobile a un IndexedDB distinct jamais réconcilié avec le remote."** →
**Infirmée pour la partie "jamais réconcilié"**, **triviale/confirmée pour "IndexedDB
distinct".** Le mobile possède nécessairement son propre IndexedDB (sandboxing navigateur —
inhérent, pas un bug) mais **exécute le même bootstrap de réconciliation** que le desktop
(`MedReviseApp.jsx:84-98`, la bascule `isMobile` n'intervient qu'à la ligne 293, après tout
le câblage de sync). Le mobile pull bien — le problème n'est pas l'absence de
réconciliation, mais ce qu'elle rapatrie quand la donnée cloud elle-même est corrompue ou
incomplète (§3.1, §3.2).

**H4 — "les timestamps de conflit sont peu fiables (horloge device, ou jamais mis à
jour)."** → **Confirmée comme faiblesse structurelle, mécanisme réel et déjà exploité par
le bug historique.** `updatedAt`/`updated_at` = `new Date().toISOString()` côté client
partout (`storage.js:45`, `data/sync.js` transmet tel quel) — **jamais** une horloge
serveur (`now()` Postgres n'est utilisé qu'en `default` à l'insertion initiale, pas comme
arbitre de conflit ; c'est le client qui écrit `updated_at` dans le payload upserté). C'est
précisément ce qui a permis au reseed (§3.1) de "gagner" contre une suppression antérieure :
un timestamp client neuf bat un timestamp client ancien, sans aucune notion de causalité
réelle. Un décalage d'horloge sur un seul appareil (fuseau mal réglé, horloge dérivée)
suffirait à inverser silencieusement n'importe quel conflit futur. Pas nécessairement LA
cause déclenchante du jour, mais un risque confirmé et non hypothétique.

---

## 5. Collision MealWeek (lecture seule)

Vérifié, aucune collision :
- `src/mealweek/data/supabaseClient.js:20` → table `mealweek_state` (ligne unique
  `id='default'`).
- `src/medrevise/data/supabaseClient.js:22-23` → table `medrevise_records` + bucket
  `medrevise-blobs`, noms distincts.
- Aucune référence croisée : `grep` de `medrevise`/bucket MedRevise dans `src/mealweek/`
  ne remonte rien.
- Les deux clients Supabase partagent le **même projet** et donc la **même clé anon**
  (`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` communes, documenté dans
  `MEDREVISE_SUPABASE_SYNC.md:4-7`), mais chacun cible une table/bucket disjoints — pas de
  risque d'écrasement croisé au niveau applicatif. Seule zone grise (hors du périmètre de
  cet audit, non applicative) : les policies RLS `to anon` sont ouvertes sur les DEUX
  tables — n'importe quel détenteur de la clé anon (donc n'importe quel visiteur du site
  déployé) peut lire/écrire les deux tables. Accepté comme trade-off "mono-utilisateur
  personnel" documenté (`MEDREVISE_SUPABASE_SYNC.md:11`), mais mérite d'être noté : ce
  n'est pas une collision MealWeek/MedRevise, mais une exposition (même clé anon = accès
  total aux deux jeux de données pour quiconque l'obtient).

---

## 6. Plan de correctif proposé (NON appliqué — pour validation)

Ordonné par risque décroissant (le plus urgent/impactant d'abord). Aucun changement de
schéma destructif n'est nécessaire pour le premier lot.

### Risque 1 — Nettoyer la corruption déjà présente (tue les zombies existants)
1. Écrire une migration ponctuelle (à la manière de `migrateOrphanCleanupV1`,
   `lib/migrate.js:105-142`) qui, pour les IDs fixes connus du seed
   (`fac, physio, anat, f-resp, f-ab, f-ms`), **force un état cohérent** : si l'utilisateur
   ne les veut plus, les tombstoner explicitement via `remove()` (propage un VRAI tombstone
   à tous les appareils) plutôt que de compter sur un `archive:true` qui peut se faire
   réécraser. Sauvegarde préalable (`putBackup`) comme les autres migrations.
   - Alternative plus simple et immédiate, sans code : depuis Réglages (desktop), faire
     "Supprimer définitivement" sur ces fiches (si encore visibles) ou, si invisibles
     localement mais visibles seulement côté cloud/mobile, ajouter un petit utilitaire
     one-shot (scriptable en console ou bouton temporaire) qui appelle
     `ctx.permanentlyDeleteFiche('f-resp')` / `('f-ms')` pour forcer le tombstone — **à
     lancer depuis N'IMPORTE quel appareil, un seul suffit**, puisque le tombstone se
     propage à la prochaine réconciliation de chaque appareil.
2. Vérifier après coup, via une requête Supabase en lecture, que `deleted=true` est bien
   posé pour ces `record_id` dans `medrevise_records` (store='fiches' et store='questions'
   pour leurs items).

### Risque 2 — Rendre le push durable (corrige la cause structurelle des deux symptômes)
3. Remplacer la file `pending` en mémoire (`data/sync.js:16-17`) par une file **persistée**
   (ex. un store IndexedDB dédié `medrevise-outbox`, ou un simple `localStorage` vu le
   volume) : `queuePush` écrit dans cette file avant de programmer le debounce ;
   `flushPending` la vide seulement après upsert réussi.
4. Ajouter un flush au retour à `visibilitychange` → `hidden` et/ou `pagehide` (best-effort,
   ne bloque pas la fermeture) en plus du flush existant sur `visible`/`online`.
5. Au démarrage (`MedReviseApp.jsx:84-88`), avant/après `reconcileAll()`, rejouer
   systématiquement toute entrée restée dans l'outbox persistée d'une session précédente
   (couvre le cas où l'app a été tuée brutalement, pas juste mise en arrière-plan).

### Risque 3 — Réduire la fenêtre de désync perçue (confort, pas correctif de bug)
6. Ajouter un indicateur visuel discret ("synchronisé à HH:MM" / "en attente d'envoi") pour
   que l'utilisateur sache si une donnée est réellement partie, plutôt que de découvrir
   l'absence de sync a posteriori sur l'autre appareil.
7. Envisager un polling léger (ex. au focus + toutes les N minutes en arrière-plan tant que
   l'onglet est visible) ou, mieux, une souscription realtime Supabase sur
   `medrevise_records` si le volume le permet — supprime la dépendance à
   `visibilitychange`/`online` pour détecter les changements distants.

### Risque 4 — Fiabiliser l'arbitrage de conflit (H4)
8. Envisager de faire arbitrer les conflits par un timestamp **serveur** (colonne
   `updated_at` avec `now()` posé par un trigger Postgres à chaque `upsert`, ignorant la
   valeur cliente) plutôt que par l'horloge de chaque appareil — élimine la classe de bug
   qui a permis la résurrection initiale, indépendamment de tout autre correctif.

### Risque 5 — Redonner au mobile une porte de sortie
9. Exposer a minima, sur mobile, un moyen de masquer/archiver une fiche individuelle (pas
   besoin de tout l'écran Réglages) pour que l'utilisateur ne soit plus totalement démuni
   si une resucée apparaît malgré les correctifs ci-dessus.

---

*Rapport généré par analyse statique du code (lecture seule) — aucun fichier applicatif
modifié, aucune donnée Supabase interrogée en écriture.*
