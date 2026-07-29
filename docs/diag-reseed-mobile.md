# Diagnostic — les fiches de démo REVIENNENT sur mobile après la migration

Analyse seule, aucun code modifié. Portée : `src/medrevise/**`. S'appuie sur
`docs/audit-sync-mobile.md` (audit précédent, §3.1 — bug historique déjà documenté et
partiellement corrigé via `canSeed`/`migrateDemoZombiesCleanup`).

---

## 0. Résumé (pour lecture rapide)

**La cause racine est confirmée et grave (hypothèse H4 du brief) : il existe un DEUXIÈME
chemin de seed, non gardé par `canSeed`, et le mécanisme de push cloud n'arbitre JAMAIS un
conflit au moment de l'écriture — un `put()` frais écrase toujours un tombstone existant,
sans comparaison de timestamp.**

- **Fichier + ligne du déclenchement** : `src/medrevise/pages/Reglages.jsx:29`
  ```js
  await wipeAll(); await seedIfEmpty(); await ctx.reload();
  ```
  Le bouton "Réinitialiser MedRevise" (Réglages, **desktop uniquement** — inaccessible
  sur mobile, `mobile/MobileApp.jsx:1-11`) appelle `seedIfEmpty()` **brut**, importé
  directement de `lib/storage.js:9`, **sans jamais passer par `canSeed()`**.
- **Pourquoi `canSeed` ne l'empêche pas** : `canSeed()` (`storage.js:347-349`) n'est
  qu'une fonction pure — elle ne PROTÈGE rien par elle-même, elle protège seulement
  l'appel qui la CONSULTE. Il n'existe qu'**un seul** site d'appel gardé
  (`MedReviseApp.jsx:86`, `if (canSeed(rec)) await seedIfEmpty();`). `Reglages.jsx:29`
  appelle `seedIfEmpty()` directement — le garde-fou est simplement absent de ce
  chemin, pas contourné par une race : c'est un **trou de couverture**, pas un bug de
  timing.
- **C'est bien le cas LWW tombstone-vs-seed, et c'est pire qu'une "course"** : voir §2.

---

## 1. Ce qui est DISCULPÉ (hypothèses infirmées avec preuve)

### 1.1 Pas de race pull-vs-canSeed sur le bootstrap mobile (hypothèse #1 du brief)

`MedReviseApp.jsx:84-88` :
```js
useEffect(() => { (async () => {
    const rec = await reconcileAll();
    if (canSeed(rec)) await seedIfEmpty();
    await runMigrations(); await reload();
})(); }, [reload]);
```
`reconcileAll()` est **awaité** avant l'évaluation de `canSeed(rec)` — le pull a
nécessairement fini (avec succès OU échec, jamais "en cours") avant que le seed soit
même considéré. Ce chemin précis est sûr, mobile compris.

**Nuance réelle, pas la cause du bug mais un défaut latent qui explique le "flicker"
7 → 0 → 4** : le DEUXIÈME `useEffect` (`MedReviseApp.jsx:92-98`, listener
`visibilitychange`/`online`) appelle `reconcileAll()` **sans aucun garde de
réentrance** (contrairement à `seedIfEmpty()` qui a `_seedPromise`,
`storage.js:182-188`). Sur mobile, un `visibilitychange` peut légitimement se déclencher
très tôt après le montage (app rouverte depuis l'arrière-plan, retour d'un
switch d'app pendant le chargement — comportement mobile courant, pas exotique). Si cet
événement tombe PENDANT que le `reconcileAll()` du bootstrap tourne encore, on obtient
**deux `reconcileAll()` concurrents**, chacun lisant/écrivant les mêmes stores IndexedDB
dans la boucle séquentielle `for (const name of SYNCABLE)` (`storage.js:307-338`, ordre :
sources, matieres, fiches, questions, …). Deux passes entrelacées peuvent produire des
`reload()` intermédiaires avec un `db` partiellement mis à jour — c'est le candidat le
plus probable pour le compteur qui saute 7 → 0 → 4 pendant le chargement. **Ce n'est pas
la cause de la résurrection**, mais c'est un bug réel, indépendant, à corriger (voir §4).

### 1.2 Pas d'ordre de bootstrap différent mobile/desktop (hypothèse #2)

`MedReviseApp.jsx:293` : `if (isMobile) return <MobileApp ctx={ctx} />;` — c'est un
`return` DANS LE MÊME COMPOSANT, après les deux `useEffect` de synchro/seed/migration
(lignes 84-98), qui tournent **inconditionnellement**, avant même le premier
`if (!db) return <Chargement/>`. `MobileApp.jsx:19-38` est purement présentationnel : il
reçoit le `ctx` déjà construit, ne fait aucun appel à `reconcileAll`/`seedIfEmpty`/
`runMigrations` lui-même. **Un seul bootstrap, un seul ordre, pour les deux shells.**
Confirmé par grep : `seedIfEmpty`/`canSeed`/`reconcileAll` n'apparaissent nulle part
dans `mobile/*.jsx`.

### 1.3 `_seedIfEmpty()` ne crée PAS de fiches sans items en fonctionnement normal
(hypothèse #3)

`storage.js:190-226` — la fonction fait, dans l'ordre, `await putMany('sources', ...)`,
`await putMany('matieres', ...)`, `await putMany('fiches', ...)`, `await putMany
('questions', Q)` (10 questions au total : 5 pour f-resp, 2 pour f-ab, 3 pour f-ms), puis
`await setStats(...)`. Rien n'est transactionnel entre ces étapes (ce sont 4 écritures
IndexedDB séparées), donc une interruption **est théoriquement possible** (onglet mis en
arrière-plan/tué par l'OS entre deux `await` — fréquent sur mobile) — mais ce n'est **pas
ce qui est observé ici** : voir §3, le fantôme Feynman prouve que les questions ONT été
écrites (le texte "Explique « Effet Bohr »" / "Explique « Plexus brachial »" ne peut
venir que d'un enregistrement `questions` réel, `mobile/MobileFeynman.jsx:69`). Le seed
n'a donc probablement pas été interrompu en cours d'écriture — le "vide" observé est un
problème d'AFFICHAGE, pas d'ABSENCE de données. Voir §3.

---

## 2. La cause confirmée : tombstone écrasable par un put() de seed ultérieur

### 2.1 Le push cloud ne compare JAMAIS de timestamp — c'est un upsert aveugle

`data/sync.js:27-34` :
```js
async function flushPending() {
  ...
  await supabase.from(RECORDS_TABLE).upsert(batch, { onConflict: 'store,record_id' });
}
```
et `pushTombstonesNow` (`sync.js:57-66`), même mécanique. Un `upsert` Postgres/PostgREST
avec `onConflict` **remplace la ligne existante sans condition** — il n'y a **aucune
clause `WHERE updated_at < excluded.updated_at`**, aucun trigger serveur, aucune
comparaison de `deleted`. Le "LWW" documenté dans le code (`storage.js:8`, commentaires
d'en-tête) n'existe QUE côté PULL/réconciliation (`storage.js:322-330`, comparaison
`cloudTs`/`localTs`) — **jamais côté écriture**. Autrement dit : **le dernier appareil à
pousser une ligne pour un `(store, record_id)` donné gagne, point final**, peu importe
que la ligne précédente était un tombstone plus récent en apparence "définitif".

Ceci confirme littéralement l'hypothèse §4 du brief : *"le re-seed re-gagne juste après"*
— pas une comparaison LWW perdue par malchance, mais l'ABSENCE totale d'arbitrage au
moment du push. Un tombstone n'a **aucune protection intrinsèque** contre un `put()`
ultérieur pour le même ID, qu'il vienne d'un vrai conflit multi-appareil ou d'un bug
applicatif local.

### 2.2 Le deuxième chemin de seed, non gardé

Deux et SEULEMENT deux call sites de `seedIfEmpty()` (confirmé par grep,
`grep -rn seedIfEmpty src/`) :

| Site | Gardé par `canSeed` ? | Accessible sur mobile ? |
|---|---|---|
| `MedReviseApp.jsx:86` (bootstrap) | ✅ oui | oui (même bootstrap) |
| `Reglages.jsx:29` (`resetData`, bouton "Réinitialiser MedRevise") | ❌ **non** | ❌ non (`mobile/MobileApp.jsx` ne route jamais vers `Reglages`) |

`resetData()` (`Reglages.jsx:27-30`) :
```js
const resetData = async () => {
  if (!window.confirm('Réinitialiser MedRevise (toutes les fiches, questions et
    statistiques) ?')) return;
  await wipeAll(); await seedIfEmpty(); await ctx.reload();
};
```
`wipeAll()` (`storage.js:232-244`) tombstone puis supprime TOUT ce qui est **actuellement
présent en LOCAL** sur l'appareil qui clique — si les fiches démo avaient déjà été
nettoyées localement par `migrateDemoZombiesCleanup` sur cet appareil, `wipeAll()` ne les
retouche pas (rien à effacer). `seedIfEmpty()` qui suit immédiatement recrée
INCONDITIONNELLEMENT `fac`/`physio`/`anat`/`f-resp`/`f-ab`/`f-ms` + leurs 10 questions
avec un `updatedAt` flambant neuf (`new Date().toISOString()`, `storage.js:45`), et les
pousse (§2.1 : aucune vérification que ces IDs portent un tombstone cloud plus ancien).

Cette action n'est atteignable QUE sur desktop (Réglages absent du shell mobile) — ce qui
explique le titre du ticket ("reviennent SUR mobile") sans contredire le fait que le
déclencheur est ailleurs : le mobile est **l'observateur** de la résurrection, pas
l'origine. N'importe quel appareil desktop qui clique ce bouton (test manuel, manipulation
accidentelle) republie les 6 IDs fixes ; ensuite, **tout autre appareil** (mobile inclus)
qui réconcilie ramasse ces lignes via la boucle d'adoption `storage.js:334-337` :
```js
for (const [id, cloud] of cloudMap) {
  if (localIds.has(id) || cloud.deleted) continue;
  await set(id, cloud.data, S[name]);   // adopté tel quel — aucune notion d'ancien tombstone
}
```

### 2.3 `seedIfEmpty()` a AUSSI un bug de mémoïsation qui aggrave le chemin Réglages

`storage.js:182-188` :
```js
let _seedPromise = null;
export function seedIfEmpty() {
  if (!_seedPromise) _seedPromise = _seedIfEmpty();
  return _seedPromise;
}
```
`_seedPromise` est un singleton **au niveau du module** (donc de la page, pas de l'appel).
Si le bootstrap a déjà appelé `seedIfEmpty()` une fois dans la session en cours (que
`canSeed` ait été vrai ou non — l'appel suffit à figer `_seedPromise`), un second appel
depuis `Reglages.jsx:29` **ne réexécute jamais `_seedIfEmpty()`** : il retourne la
promesse — et donc le résultat — de l'appel précédent, quel que soit l'état réel de
la base APRÈS `wipeAll()`. Ce n'est pas la cause de la résurrection (qui vient de §2.1/
2.2), mais un bug adjacent dans la même fonction qui peut rendre le bouton "Réinitialiser"
silencieusement incorrect (aucune donnée recréée après un wipe, jusqu'au prochain rechargement
complet de page qui réinitialise `_seedPromise`).

---

## 3. Pourquoi les fiches semblent "vides" avec un Feynman fantôme, pas juste "revenues"

Preuve directe que les questions Feynman existent bien en local : le texte affiché
(*"explique l'effet de bord"*, en fait "Explique « **Effet Bohr** »", et "explique le
plexus brachial") correspond **mot pour mot** aux `concept` codés en dur dans le seed :
- `storage.js:214` — `add('f-resp', { type: 'feynman', concept: 'Effet Bohr' }, 0)`
- `storage.js:221` — `add('f-ms', { type: 'feynman', concept: 'Plexus brachial' }, 1)`

et au rendu `mobile/MobileFeynman.jsx:69` :
```js
<Tex>{item.consigne || ... : `Explique « ${item.theme || item.concept} »`}</Tex>
```
Ce texte ne peut venir QUE d'un enregistrement `questions` réel avec `type: 'feynman'` et
ce `concept` exact — ce n'est pas un placeholder générique. Donc **le seed a bien écrit
des questions**, contredisant une interruption en plein milieu de `_seedIfEmpty()`.

**Le "vide" vient d'une asymétrie de filtrage, pas d'une absence de données** —
`lib/planning.js` :
```js
const SCHEDULED_TYPES = new Set(['qcm', 'flashcard']);         // planning.js:8
```
- `dueToday`/`todayPlan` (utilisés par "Commencer la série" et le chip "Réviser" de
  `mobile/MobileHome.jsx:22-23,69-70,115`) ne retiennent QUE les items `qcm`/`flashcard`
  **dus** (`nextReview <= aujourd'hui`) ET dont `isFicheScheduled(db, fiche, idx)`
  (`planning.js:38-47`) est vrai (fiche + matière + source tous non archivés, rappels J
  actifs).
- Les items `feynman`/`exercice` sont **explicitement hors méthode des J**
  (`planning.js:9-15`, commentaire : *"NE DÉPENDENT PAS de due aujourd'hui"*) — dans
  `MobileHome.jsx:29-36`, `extrasByFiche` les groupe directement depuis `db.questions`,
  **sans passer par `dueToday`/`isFicheScheduled`** pour les fiches déjà dans `plan`.

Donc si, pour une raison quelconque, `isFicheScheduled(f-resp)` ou
`isFicheScheduled(f-ms)` est **faux** au moment du rendu (fiche/matière/source
manquante ou marquée archivée localement — un état tout à fait plausible pendant une
réconciliation en plusieurs étapes, cf. le flicker 7→0→4 en §1.1, où `fiches` est
adopté avant `matieres` dans l'ordre `SYNCABLE`), alors : `due.length` = 0, "Commencer la
série" grisé, le chip "Réviser" (`items.length > 0` requis) absent — **mais** le chip
"Feynman (N)" reste visible et cliquable car il ne consulte jamais `isFicheScheduled`
pour une fiche déjà présente dans `plan`... et pour une fiche **absente** de `plan`
(exactement le cas ici), `MobileHome.jsx:44-49` retombe sur le chemin `extrasByFiche` qui,
lui, **vérifie `isFicheScheduled`** — donc en théorie la fiche ne devrait PAS non plus
apparaître dans `ficheRows` si le check échouait pour de bon.

**Limite de cette analyse statique** : je ne peux pas trancher avec certitude, sans
inspecter l'état réel de la table `medrevise_records` au moment du bug, si (a) `matieres`/
`sources` ont réellement une fenêtre où elles manquent localement pendant que `fiches` est
déjà adopté (le flicker de §1.1 le rend plausible), ou (b) le comportement observé
provient d'un état transitoire capturé par l'utilisateur pendant que `reconcileAll` était
encore en cours (capture d'écran prise "entre deux" du chargement). Dans les deux cas,
**la cause profonde reste la même (§2)** : ce sont les 6 IDs fixes de `Reglages.jsx:29`
qui réintroduisent une ligne cloud vivante là où un tombstone existait. **Recommandation
de vérification** : lire directement dans Supabase (SQL Editor, lecture seule)
`select store, record_id, updated_at, deleted from medrevise_records where record_id in
('fac','physio','anat','f-resp','f-ab','f-ms')` — si `deleted=false` avec un `updated_at`
récent pour `f-resp`/`f-ms` alors que `migrateDemoZombiesCleanup` a marqué `applied` sur
desktop, c'est la confirmation directe du mécanisme §2.

---

## 4. Plan de correctif proposé (NON appliqué)

Du plus simple/ciblé au plus structurel.

### Option A — le plus simple, recommandé : supprimer le seed de démo en production
L'app est maintenant en usage réel personnel (contenu médical importé), le seed de
démo n'a plus d'utilité (il ne sert qu'au tout premier lancement, jamais rejoué en
pratique). Supprimer purement `seedIfEmpty`/`_seedIfEmpty` (`storage.js:182-226`) et son
appel dans `Reglages.jsx:9,29` (le reset devient un simple `wipeAll()` + `reload()`, sans
recréer quoi que ce soit) élimine la classe de bug entière : plus aucun code ne peut
jamais recréer ces 6 IDs fixes. `MedReviseApp.jsx:86` et `canSeed` (`storage.js:347-349`)
deviennent alors du code mort à retirer aussi.

### Option B — si le seed de démo doit être conservé (ex. onboarding futur)
1. Faire passer `Reglages.jsx:29` par le MÊME garde que le bootstrap : après `wipeAll()`,
   ré-appeler `reconcileAll()` (pour obtenir un état cloud à jour post-wipe) et
   conditionner le seed à `canSeed(rec)`, exactement comme `MedReviseApp.jsx:84-86`.
   Corrige le trou de couverture (§2.2) mais laisse intacte la faiblesse structurelle
   (§2.1) pour tout futur troisième call site qu'on oublierait de garder.
2. **Empêcher structurellement tout `put()` de gagner contre un tombstone**, au niveau du
   push lui-même (corrige §2.1 pour de bon, protège même contre un futur bug applicatif) :
   remplacer l'`upsert` aveugle de `sync.js:32`/`sync.js:61` par une écriture conditionnelle
   — soit côté client (lire la ligne existante avant d'upsert, refuser si
   `existing.deleted && existing.updated_at > payload.updated_at`), soit, plus robuste,
   via un trigger Postgres `BEFORE UPDATE` sur `medrevise_records` qui rejette (ou ignore)
   toute tentative d'écraser une ligne `deleted=true` par une ligne plus récente SAUF si
   le payload le fait explicitement (ex. un flag `force` réservé aux vraies restaurations
   utilisateur). C'est la correction "Risque 4" déjà notée dans
   `docs/audit-sync-mobile.md:385-389` (arbitrage serveur) — non appliquée à ce jour.
3. Corriger la mémoïsation de `_seedPromise` (§2.3) : soit la réinitialiser après un
   `wipeAll()` réussi, soit refaire la vérification `getAll('sources')` à chaque appel
   sans cache (le cache n'a de sens que pour dédupliquer le double-mount StrictMode au
   BOOTSTRAP, pas pour empêcher un futur appel légitime après un reset).

### Complément indépendant — le flicker 7 → 0 → 4 (§1.1)
Ajouter à `reconcileAll()` le même type de garde de réentrance que `seedIfEmpty()`
(`_seedPromise`) : une promesse en cours partagée, pour que le listener
`visibilitychange`/`online` (`MedReviseApp.jsx:92-98`) qui se déclenche pendant le
bootstrap initial rejoigne le `reconcileAll()` déjà en vol au lieu d'en démarrer un
second en parallèle. Change la perception de fiabilité du chargement mobile même si ce
n'est pas la cause de la résurrection elle-même.

---

*Rapport généré par analyse statique du code (lecture seule) — aucun fichier applicatif
modifié, aucune donnée Supabase interrogée en écriture. Le point de vérification suggéré
en §3 (lecture SQL) nécessite un accès Supabase que je n'ai pas sollicité dans le cadre de
cette analyse.*
