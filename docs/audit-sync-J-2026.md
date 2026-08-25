# MedRevise — Audit : synchronisation multi-appareils + méthode des J

**Date :** 25 août 2026 · **Base auditée :** commit `1b2eeea` (main, poussé)
**Périmètre :** `src/medrevise/` — 21 fichiers lus sur 89
**Mutations effectuées :** aucune. Audit strictement en lecture.

Symptômes rapportés : le même compte affiche **7 J** (ordi), **11 J** (téléphone) et
**4 J** (navigateur neuf) le même jour ; sur téléphone, finir tous les J du jour renvoie à
l'accueil qui en réaffiche aussitôt de nouveaux ; une fiche n'est pas dans le même dossier
selon l'appareil.

---

## 0. Résumé

L'hypothèse de départ (« les données vivent en IndexedDB locale et la synchro ne maintient
pas les appareils alignés ») est **la bonne**, avec une nuance qui change le correctif :
le problème n'est pas que l'IndexedDB soit consultée en premier — c'est légitime et
correctement implémenté. Le problème est qu'**aucun garde-fou ne protège le cloud contre
une écriture périmée**.

Le moteur de la méthode des J, lui, est **hors de cause** — c'est démontrable, voir §5.

---

## 1. Cause racine — il n'existe aujourd'hui aucune source de vérité

> **Supabase n'arbitre rien.** C'est une boîte aux lettres passive dans laquelle chaque
> appareil dépose son état local en écrasement inconditionnel, horodaté par sa propre
> horloge. Le « dernier qui gagne » ne désigne pas la dernière révision faite, mais le
> **dernier appareil qui a poussé**.

La règle last-write-wins n'est appliquée qu'à la **lecture** :

```js
// src/medrevise/lib/storage.js:390-405 — reconcileAll()
const localTs = rec.updatedAt ? Date.parse(rec.updatedAt) : 0;
const cloudTs = cloud.updated_at ? Date.parse(cloud.updated_at) : 0;
if (cloud.deleted) { ... }
else if (cloudTs > localTs) await set(rec.id, cloud.data, S[name]);   // adopter
else if (localTs > cloudTs) queuePush(name, rec.id, rec, rec.updatedAt); // pousser
```

À l'**écriture**, il n'y a plus aucune comparaison :

```js
// src/medrevise/data/sync.js:63 — flushPending()
const { error } = await supabase.from(RECORDS_TABLE)
  .upsert(batch, { onConflict: 'store,record_id' });
```

Cet `upsert` n'a **ni clause conditionnelle** (`where excluded.updated_at > …`), **ni
trigger côté base** — le SQL de `MEDREVISE_SUPABASE_SYNC.md` ne pose que la table et la
policy. Il écrase donc la ligne cloud quoi qu'elle contienne, ***y compris son
`updated_at`, qu'il fait reculer***. Même défaut à `sync.js:117` (`pushTombstonesNow`).

**Conséquence :** une entrée d'outbox écrite à 09:00 et rejouée à 15:00 remplace la ligne
révisée à 14:00 **et** ramène son horodatage à 09:00. Pour tous les autres appareils, la
révision de 14:00 n'a jamais eu lieu.

**Réponse à la question 6 (« où est la source de vérité ? ») :** *chaque appareil est sa
propre vérité*, et le cloud n'est que le miroir du dernier à avoir parlé. Il n'y a côté
serveur ni contrainte d'écriture, ni horloge de référence, ni notion de compte, ni journal
— rien qui puisse arbitrer.

---

## 2. Les trois aggravants

### Aggravant A — pousser après un tirage raté (`storage.js:452-458`)

```js
export async function syncNow() {
  if (!SYNC_ENABLED) return { status: 'disabled' };
  await flushOutbox();
  const rec = await reconcileAll();      // ← peut retourner { ok:false } sans rien fusionner
  await queueAllLocalForPush();          // ← s'exécute quand même
  await flushOutbox();                   // ← et pousse quand même
  return { status: rec.ok ? 'ok' : 'offline', cloudEmpty: rec.cloudEmpty };
}
```

Si le `select` échoue, `reconcileAll` sort immédiatement (`storage.js:373-374`) sans avoir
comparé quoi que ce soit — mais `queueAllLocalForPush()` (`storage.js:431-439`) remet
malgré tout **tout le local syncable** dans l'outbox, et `flushOutbox()` l'envoie.

Sur réseau mobile, le cas « lecture qui échoue, écriture qui passe » est banal, et son
effet est brutal : **le téléphone republie l'intégralité de son état périmé par-dessus un
cloud à jour, sans jamais l'avoir lu.**

### Aggravant B — l'outbox est rejouée avant la réconciliation (`storage.js:454-455`)

`flushOutbox()` précède délibérément `reconcileAll()` (le commentaire d'en-tête de
`sync.js` explique pourquoi : un tombstone jamais poussé n'est plus visible localement).
Le raisonnement est juste pour les tombstones, mais il s'applique à **toutes** les
entrées : toute écriture survivante d'une session précédente part **en premier, sans
aucune comparaison**. Combiné à la cause racine, c'est la garantie que `updated_at` recule.

### Aggravant C — horodatage par l'horloge de l'appareil (`storage.js:51, 58, 65`)

```js
const stamped = SYNCABLE.includes(name)
  ? { ...rec, updatedAt: new Date().toISOString() }   // ← horloge du téléphone / de l'ordi
  : rec;
```

La colonne cloud a bien `updated_at timestamptz not null default now()`, mais **le client
fournit systématiquement la valeur**, donc l'heure serveur n'est jamais utilisée. Toutes
les comparaisons de `reconcileAll` opposent donc deux horloges d'appareils. Un téléphone en
avance de deux minutes gagne tous ses conflits ; un appareil en retard perd les siens en
silence, définitivement.

---

## 3. Catalogue des 11 défauts

| Réf | Gravité | Défaut | Emplacement |
|-----|---------|--------|-------------|
| **C1** | 🔴 Critique | `upsert` inconditionnel : une écriture tardive écrase une ligne cloud plus récente et fait *reculer* `updated_at` | `sync.js:63`, `sync.js:117` |
| **C2** | 🔴 Critique | `syncNow()` pousse tout le local **même quand le pull a échoué** — donc sans avoir comparé | `storage.js:452-458` |
| **C3** | 🔴 Critique | L'outbox est rejouée **avant** la réconciliation : les entrées d'une session précédente partent sans comparaison | `storage.js:454-455` |
| **C4** | 🔴 Critique | Horodatage par l'horloge de l'appareil ; l'heure serveur (`default now()`) n'est jamais utilisée | `storage.js:51,58,65` |
| **C5** | 🟠 Majeur | LWW par **enregistrement entier**, jamais par champ : renommer une fiche réécrit aussi son `dossierId` | `storage.js:401-402` |
| **C6** | 🟠 Majeur | Les mutations écrivent depuis l'instantané React, pas depuis IndexedDB — `moveFicheTo` réécrit toute la fratrie | `MedReviseApp.jsx:382-391` |
| **C7** | 🟠 Majeur | `session.items` est figé au lancement : revenir en arrière renote la version périmée et perd la 1re note | `Session.jsx:172,233`<br>`MobileSession.jsx:120` |
| **C8** | 🟠 Majeur | Marqueurs de migration non synchronisés : chaque nouveau navigateur rejoue les 9 migrations, dont 2 qui écrivent et suppriment | `storage.js:24,40`<br>`migrate.js:143,470` |
| **C9** | 🟠 Majeur | Les blobs (images, PDF) n'ont pas d'outbox : un envoi raté n'est jamais réessayé | `storage.js:75,86`<br>`sync.js:125-129` |
| **C10** | 🟡 Mineur | `stats` est un enregistrement unique : deux appareils actifs le même jour s'écrasent streak et `activityDays` | `storage.js:171-177`<br>`Session.jsx:712-715` |
| **C11** | 🟡 Mineur | Aucun dédoublonnage à la création d'une fiche : réimporter le même JSON duplique tout le jeu de cartes | `import.js:39-63` |

---

## 4. Partie 1 — Synchronisation multi-appareils

### Q1 — Ce qui est écrit où, et quand

**Local d'abord, toujours.** Quatorze stores IndexedDB sont marqués synchronisables
(`SYNCABLE`, `storage.js:40`) :

```
sources, matieres, dossiers, fiches, questions, structures, highlights,
annotations, stats, exos, docs, anatstruct, sessionsLog, prompts
```

`meta` (marqueurs de migration) et `backups` restent délibérément **locaux** ; les `blobs`
ont leur propre canal (bucket Storage, pas la table).

**Poussée.** Chaque `put`/`putMany`/`remove` (`storage.js:50-66`) écrit IndexedDB, appose
`updatedAt`, puis appelle `queuePush`. Celui-ci persiste l'entrée dans une base IndexedDB
dédiée `medrevise-outbox` (clé `store:id`, donc pas de doublon) et arme un débounce de
800 ms (`sync.js:39-46`). `flushPending` ne retire une entrée qu'**après confirmation** de
l'`upsert`, avec vérification explicite de `{ error }` — **ce point-là est correct et bien
fait**. Déclencheurs supplémentaires : `pagehide`, `visibilitychange → hidden`
(`sync.js:83-88`), retour réseau, et le boot.

**Tirage.** `pullAllRecords()` (`sync.js:92-99`) fait un `select` **complet** de la table,
sans curseur incrémental. Il tourne au démarrage, à la reconnexion réseau, à chaque fois
que l'onglet redevient visible, et sur le bouton « Forcer la synchro »
(`MedReviseApp.jsx:86-99`).

### Q2 — Au chargement : local d'abord, et c'est correct

```js
// MedReviseApp.jsx:86-89
useEffect(() => { (async () => {
  await forceSync();
  await runMigrations(); await reload();
})(); }, [forceSync, reload]);
```

`forceSync` attend réellement la fin de `syncNow()`. L'ordre est donc bon : l'état cloud
est fusionné **avant** le premier rendu. Ce n'est pas là qu'est le défaut.

Le défaut est **C2** (aggravant A, §2) : quand le tirage échoue, l'app ne se contente pas
de rester sur son état local — elle **le republie**.

### Q3 — Divergence permanente et gestion des conflits

**Résolution :** last-write-wins **par enregistrement entier**, jamais par champ
(`storage.js:390-405`). Quatre issues : tombstone cloud plus récent → suppression locale ;
cloud plus récent → adoption ; local plus récent → renvoi ; **égalité → rien**.

Oui, une divergence peut ne jamais se réconcilier, par trois chemins indépendants :

1. **Écriture rétrograde (C1 + C3)** — voir §1 et §2.
2. **Dérive d'horloge (C4)** — voir §2.
3. **Écrasement inter-champs (C5)** — une seule ligne porte tout l'enregistrement. Deux
   modifications concurrentes sur deux champs différents du même objet ne fusionnent pas :
   la seconde annule la première.

**Délai de propagation d'une révision :** 800 ms sur le réseau, puis visible sur l'autre
appareil au prochain retour au premier plan ou reconnexion. Aucun temps réel, aucun
abonnement Supabase — c'est un choix défendable et ce n'est pas le problème.

### Q4 — La fiche qui se balade : trace complète

C'est **C6** combiné à **C5**. `moveFicheTo` ne réécrit pas la seule fiche déplacée : il
recalcule `ordre` pour **toute la fratrie du dossier cible**, à partir de `db.fiches` —
l'instantané React du rendu courant, pas une relecture d'IndexedDB.

```js
// MedReviseApp.jsx:382-391
moveFicheTo: async (ficheId, matiereId, beforeFicheId, dossierId = null) => {
  const f = db.fiches.find((x) => x.id === ficheId); if (!f) return;   // ← state React
  const siblings = db.fiches.filter(...)                              // ← state React
  const ordered = [...siblings.slice(0, at), f, ...siblings.slice(at)];
  await putMany('fiches', ordered.map((x, i) => ({ ...x, matiereId, dossierId, ordre: i })));
```

| Heure | Appareil | Action | État cloud après |
|-------|----------|--------|------------------|
| 10:00 | Ordi | L'onglet est ouvert. `db.fiches` est chargé : la fiche F est dans l'unité *Cardio*. | F → Cardio |
| 11:30 | Téléphone | F est déplacée vers *Respiratoire*. Poussé. | F → Respiratoire |
| 11:45 | Ordi | L'onglet est resté en arrière-plan : `db` date toujours de 10:00. Glisser-déposer d'une fiche **voisine** dans *Cardio*. | — |
| 11:45 | Ordi | `putMany` réécrit toute la fratrie de *Cardio* depuis l'instantané de 10:00, **F comprise**, avec un horodatage frais. | **F → Cardio** |
| 11:46 | Téléphone | Retour dans l'app → réconciliation. Le cloud est plus récent → adoption. | F → Cardio |

Le déplacement de 11:30 est perdu, et la fiche « revient » toute seule. Même mécanisme dans
`deleteDossier` (`:313`) et `deleteMatiere` (`:371`), qui réassignent eux aussi des
`dossierId` en masse depuis le state React.

Aucun conflit n'est « non résolu » au sens strict : le système fait exactement ce pour quoi
il est écrit — il est juste écrit pour perdre.

### Q5 — Le compte : il n'y en a aucun

```js
// src/medrevise/data/supabaseClient.js:11-18
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const SYNC_ENABLED = !!(url && anonKey);
export const supabase = SYNC_ENABLED
  ? createClient(url, anonKey, { auth: { persistSession: false } })
  : null;
```

Pas d'inscription, pas de session, pas de `user_id` : **la clé anon *est* l'identité**, et
la policy RLS autorise `anon` sur tout (`using (true)`). C'est documenté comme un choix
assumé dans `MEDREVISE_SUPABASE_SYNC.md`.

**Conséquence rassurante :** il n'y a aucun risque de « mauvais compte ». Tout appareil
chargeant le même build partage forcément le même jeu de données.

> ⚠️ **Mais `SYNC_ENABLED` est figé AU BUILD** — c'est une variable Vite, pas une lecture à
> l'exécution. Un appareil ouvert sur une **URL de preview Vercel**, sur `localhost`, ou
> sur un déploiement fait **avant** l'ajout des variables, est une **île 100 % locale qui
> ne se synchronisera jamais**, et ne le dira nulle part sauf à un endroit précis (voir
> §7, mesure 1). C'est un candidat sérieux pour le navigateur qui affiche 4.

**Ce que je n'ai pas pu vérifier :** les variables du déploiement réel. Aucun `.env` sur
cette machine (seulement `.env.example`), et le compte Vercel joignable depuis la session
(*yoagatann09-6660's projects*) ne contient aucun projet — `my-org` est sur un autre
compte. Le `dist/` local ne peut pas servir de preuve non plus : c'est un build périmé du
21 août, sans aucune trace de `supabase-js` ni de `medrevise-outbox`.

C'est **exactement la limite déjà rencontrée le 29 juillet** (`docs/fix-sync-final.md`,
§3) : elle n'a jamais été levée, et c'est probablement pourquoi ce problème dure.

### Q6 — Où est la source de vérité

Voir §1. **Chaque appareil est sa propre vérité.** C'est le cœur du problème, et tout le
reste en découle.

---

## 5. Partie 2 — Méthode des J : le moteur est hors de cause

### Démonstration

Une carte notée aujourd'hui ne peut **mathématiquement pas** redevenir due aujourd'hui.
`advanceQuestion` (`sm2.js:185-207`) n'a que trois sorties :

| Note | Résultat | Échéance obtenue |
|------|----------|------------------|
| Raté | `dueDate = addDaysLocal(todayISO(), 1)` | **demain** |
| Facile / Difficile | `nextInterval = max(base + 1, round(base × mult))`, donc **≥ 2** | **J+2 minimum** |
| Plafonnée (`capped`) et réussie | `dueDate: null, termine: true` | **plus jamais** |

Le plancher `max(base + 1, …)` est ce qui interdit à Difficile × 1,3 de rester bloqué à
l'intervalle 1. Le piège historique documenté en tête de `sm2.js` (un Raté qui
reprogrammait la carte à aujourd'hui) est donc bien évité, et `recordRelearnAttempt`
(`sm2.js:218`) ne touche délibérément à aucune date.

> **Donc : toute carte qui réapparaît le jour même a vu son `dueDate` restauré par la
> synchro.** Il n'existe pas d'autre chemin dans le code.

### Q7 — Comment « à faire aujourd'hui » est calculé

```js
// planning.js:117-122
export function dueOn(db, dateISO, idx) {
  const ix = idx || index(db);
  if (dateISO < todayISO()) return [];
  return scheduledQuestions(db, ix)
    .filter((q) => nextDate(q) === dateISO && q.skippedOn !== dateISO);
}
export function dueToday(db, idx) { return dueOn(db, todayISO(), idx); }
```

**Entièrement recalculé à chaque rendu**, à partir de `db`, via `useMemo` sur mobile
(`MobileHome.jsx:24`). **Il n'existe aucun compteur persisté**, donc rien qui puisse « ne
pas se mettre à jour ».

Le filtre est strict : `nextDate(q) === aujourd'hui` **et** `skippedOn !== aujourd'hui`,
sur les seules cartes `qcm`/`flashcard` dont la fiche est planifiée. Le retard en est
explicitement exclu — il vit à part dans `overdueQuestions` (`planning.js:128-131`). Une
carte faite aujourd'hui a nécessairement un `dueDate` ailleurs : **elle ne peut pas y
figurer**.

### Q8 — Écriture, synchro, recalcul : l'ordre exact

La notation attend bien l'écriture locale avant le recalcul :

```js
await ctx.saveQuestion(updated);   // Session.jsx:183 → put() → set() IndexedDB → reload()
```

La synchro cloud, elle, n'est **pas** attendue : `queuePush` arme un débounce de 800 ms et
rend la main (`storage.js:53`). Ce décalage-là est sain — le local est cohérent
immédiatement.

**Le décalage dangereux est l'autre :**

```js
// MedReviseApp.jsx:93-99
const onSync = () => { forceSync(); };
const onVisible = () => { if (document.visibilityState === 'visible') onSync(); };
window.addEventListener('online', onSync);
document.addEventListener('visibilitychange', onVisible);
```

Sur mobile, `visibilitychange` se déclenche à **chaque** retour dans l'app et à **chaque**
déverrouillage. Une réconciliation qui adopte une copie périmée de cartes tout juste
révisées repose leur `dueDate` sur aujourd'hui, et le `reload()` qui suit les fait
aussitôt réapparaître à l'écran. **C'est exactement le symptôme décrit, et c'est spécifique
au téléphone parce que lui seul passe son temps en arrière-plan.**

S'y ajoute **C7** : `session.items` est un instantané figé au lancement de la série.
`advanceQuestion(item)` travaille sur l'objet capturé (`Session.jsx:172`,
`MobileSession.jsx:120`), jamais relu. Revenir en arrière avec « Précédent »
(`Session.jsx:233`) et renoter recalcule donc depuis l'`intervalDays` **d'origine** et
écrase la première note dans `historique`. C'est une seconde façon, purement locale, de
« refaire » une carte sans que ça compte.

### Q9 — Distinguer les trois « il en reste »

| Ce que tu vois | Origine | Signe distinctif | Verdict |
|----------------|---------|------------------|---------|
| Une section « À rattraper » persiste après la série | Retard — `overdueByFiche`<br>`MobileHome.jsx:26,132` | Bloc séparé, **jamais** inclus dans « Commencer la série » | 🟢 Normal |
| Une carte ratée revient en fin de série | Relearning en mémoire<br>`Session.jsx:190-196` | Pendant la série, badge « Reprise », **rien en base** | 🟢 Normal |
| Le compteur remonte après retour à l'accueil | Réconciliation<br>**C1 · C2 · C3** | Le nombre augmente **sans que tu aies rien fait**, juste après un retour dans l'app | 🔴 Bug |

**Le test qui tranche :** note le compteur, verrouille l'écran, déverrouille. S'il monte
tout seul, c'est la synchro.

### Q10 — Pourquoi 7, 11 et 4

« Dû aujourd'hui » n'est pas un champ lu quelque part : c'est une **jointure sur quatre
enregistrements** — question → fiche → matière → source.

```js
// planning.js:58-68 — isFicheScheduled()
if (!fiche || fiche.archive) return false;
if (fiche.rappelsJ === false) return false;
const m = mById[fiche.matiereId];  if (!m || m.archive) return false;
const s = sById[m.sourceId];       if (!s || s.archive) return false;
return s.rappelsJ !== false;
```

Cinq variables suffisent à faire diverger le résultat, et elles divergent toutes par le
même mécanisme (§1) :

| Variable | Effet sur le compteur |
|----------|----------------------|
| `dueDate` | La cause directe. Chaque appareil détient sa propre version, restaurée ou non par une écriture rétrograde (C1). |
| `archive` · `rappelsJ` | Portés par la source, la matière **et** la fiche. **Un seul booléen divergent retire tout un cours du compteur, en silence.** Candidat le plus probable pour un écart net comme 7 → 4. |
| `skippedOn` | Un « Sauter aujourd'hui » synchronisé sur un appareil et pas sur l'autre : même jeu de cartes, deux comptes différents. |
| Cartes en double | **C11**. Si le même JSON a été importé deux fois — typiquement « ça n'avait pas l'air d'être passé » — les deux jeux existent, ids distincts, et se cumulent. Explication franche d'un 11 face à un 7. |
| `todayISO()` | Date **locale** de l'appareil (`sm2.js:105`). Fuseau ou heure différents = « aujourd'hui » différent aux abords de minuit, et un `dueDate` posé au mauvais jour par `advanceQuestion`. |

**Autrement dit : ce ne sont pas trois lectures d'un même jeu de données, ce sont trois
jeux de données différents.** Aucun des trois nombres n'est « le bon » — ils sont tous
exacts pour l'état que leur appareil détient.

**Détail d'affichage** (n'explique pas l'écart, mais brouille la lecture) : sur mobile, le
badge « À rattraper » affiche `overdue.length`, soit un nombre de **fiches**
(`MobileHome.jsx:137`), tandis que le grand nombre en haut est un nombre de **cartes**
(`:122`). Sur ordi, le compteur cumule cartes **et** schémas (`Dashboard.jsx:61`) alors
que le mobile exclut les schémas par conception. Trois unités différentes affichées comme
si c'étaient les mêmes.

---

## 6. Partie 3 — Intégrité des données

### Q11 — Résidus, doublons, orphelins

**Une corruption passée est documentée et prouvée.** La sauvegarde
`~/Downloads/medrevise-pre-repair-backup-2026-08-04.json` contient **385 cartes** (124 QCM
+ 261 flashcards), **toutes** aplaties à `intervalDays: 1` et `dueDate: 2026-08-04`. C'est
le bug de `migrateChronologieFixeV1`, corrigé depuis (le filtre exige désormais aussi
l'absence d'`intervalDays`, `migrate.js:365`). **Aucun de ces 385 enregistrements ne porte
de `j0Date`** : pour eux, `trueJ0Date` retombe sur `historique[0].date`, et le « vrai J+N »
affiché reste approximatif.

**Rejouabilité des migrations (C8).** Les marqueurs vivent dans le store `meta`,
volontairement exclu de `SYNCABLE` (`storage.js:24,40`). Chaque navigateur neuf rejoue donc
les **neuf** migrations sur des données fraîchement tirées du cloud. Deux ne sont pas
inertes :

- `migrateResetMissedV1` (`migrate.js:470-484`) réécrit toutes les cartes ayant
  `missed > 0` — c'est-à-dire toutes celles jamais notées Difficile ou Raté — via
  `putMany`, ce qui les **ré-horodate en masse et les repousse au cloud**. Le contenu ne
  change pas, l'horodatage si, et ça suffit à faire basculer des conflits.
- `migrateOrphanCleanupV1` (`migrate.js:143-172`) fait de **vraies suppressions avec
  tombstones propagés**. Le garde-fou est correct — `q.ficheId &&` protège bien les
  exercices de chapitre et les flashcards d'erreur, qui ont `ficheId: null` — mais
  l'opération reste destructive et se propage aux trois appareils.

**Doublons (C11).** `appendItemsToFiche` dédoublonne bien sur `srcId` (`import.js:87`), et
`appendExosToChapitre` aussi. Mais `createFicheFromQuestions` (`import.js:39-63`) n'a
**aucun garde-fou** : chaque import crée une fiche neuve et des cartes aux ids neufs.
Réimporter le même cours produit deux jeux complets qui coexistent et se cumulent dans les
compteurs.

**Orphelins possibles.** Un chapitre supprimé sur un appareil puis ressuscité par LWW
ailleurs laisse ses exercices sans porteur ; `exosARevoirCetteSemaine` les ignore alors
silencieusement (`planning.js:213`). Et **C9** crée un orphelin d'un autre genre : une
image ou un PDF dont l'envoi vers le bucket a échoué reste référencé par sa fiche mais
introuvable ailleurs — `pushBlob` est en fire-and-forget, **sans aucun réessai**
(`storage.js:75,86` · `sync.js:125-129`).

### Q12 — Comparaison avec l'état Supabase

**Non réalisée — je ne peux pas la faire seul.** Aucun identifiant Supabase sur cette
machine, et le compte Vercel joignable ne contient pas le projet (voir Q5). Je ne peux donc
pas lire la table `medrevise_records`.

La sonde du §8 produit, pour chaque appareil, exactement les chiffres à confronter au
contenu de la table cloud.

---

## 7. Mesures à faire sur les trois appareils

> ⚠️ **Avant tout : n'ouvre plus MedRevise sur le navigateur qui affiche 4 J.** Au prochain
> démarrage, `syncNow()` republiera l'intégralité de son état (`queueAllLocalForPush`,
> `storage.js:431-439`) et, faute de garde conditionnel côté base, cet état à 4 peut
> devenir celui de tout le monde. Même prudence pour tout appareil resté longtemps sans se
> synchroniser.

### Mesure 1 — La synchro est-elle seulement active ? (2 minutes)

Sur **chacun** des trois appareils :

- **Ordi** → Réglages → carte « Synchronisation »
- **Téléphone / navigateur neuf** → icône ↻ en haut de l'accueil mobile

Relever le message affiché (`components/ui.jsx:129-136`) :

| Message | Signification |
|---------|---------------|
| « Synchro cloud désactivée (variables Supabase absentes sur ce déploiement). » | **Cet appareil n'a jamais participé.** Île 100 % locale. |
| « Hors ligne ou cloud injoignable… » | Le tirage échoue — et pourtant l'app pousse quand même (C2). |
| « Synchronisé à HH:MM » | La synchro fonctionne sur cet appareil. |

**Noter aussi l'URL exacte des trois** (`localhost`, une URL `*-git-*.vercel.app` de
preview, ou le domaine de production). Une URL différente = une IndexedDB différente **et**
possiblement un build sans variables d'env.

### Mesure 2 — Le relevé d'état, sur les trois (§8)

Coller la sonde dans la console de chaque appareil et conserver les trois sorties.

**Quatre choses à comparer entre les relevés :**

1. **`DUES AUJOURD'HUI`** et sa liste d'ids → montre si ce sont les mêmes cartes ou non.
2. L'écart entre **`derniere ecriture`** et **`horloge locale`** → révèle la dérive
   d'horloge de **C4**.
3. La liste **`cours desactives`** → expliquera un écart net comme 7 → 4.
4. **`fiches / dossier`** → identifiera nommément la fiche qui se balade.

### Mesure 3 — Le test qui isole la synchro (1 minute, sur le téléphone)

Note le compteur de l'accueil, verrouille l'écran, déverrouille. **S'il monte sans que tu
aies rien fait**, la réconciliation est bien la coupable (§5, Q9).

### Mesure 4 — Export de la table cloud (nécessite ton accès Supabase)

Supabase → SQL Editor :

```sql
select store, count(*) filter (where not deleted) as vivants,
       count(*) filter (where deleted) as tombstones,
       max(updated_at) as derniere_ecriture
from public.medrevise_records
group by store order by store;
```

Puis, pour confronter au relevé des appareils :

```sql
select record_id,
       data->>'ficheId'   as fiche,
       data->>'type'      as type,
       data->>'dueDate'   as due,
       data->>'intervalDays' as interval,
       updated_at
from public.medrevise_records
where store = 'questions' and not deleted
  and data->>'dueDate' = current_date::text
order by updated_at desc;
```

---

## 8. Sonde console — relevé d'état, sans aucune écriture

À coller dans la console du navigateur, sur **chacun des trois appareils**, MedRevise
ouvert. **Lecture seule intégrale :** aucun `put`, aucun `delete`, aucun appel réseau. Elle
rejoue le calcul exact de `dueToday` et rend visible ce que l'app ne montre pas.

```js
(async () => {
  const open = n => new Promise((ok, ko) => {
    const r = indexedDB.open('medrevise-' + n);
    r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
  });
  const all = async n => {
    const db = await open(n);
    return new Promise(ok => {
      const q = db.transaction('v1', 'readonly').objectStore('v1').getAll();
      q.onsuccess = () => ok(q.result || []); q.onerror = () => ok([]);
    });
  };
  const [sources, matieres, fiches, questions] =
    await Promise.all(['sources','matieres','fiches','questions'].map(all));

  const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const today = iso(new Date());
  const S = Object.fromEntries(sources.map(s => [s.id, s]));
  const M = Object.fromEntries(matieres.map(m => [m.id, m]));
  const F = Object.fromEntries(fiches.map(f => [f.id, f]));

  // réplique exacte de planning.js#isFicheScheduled
  const planifiee = f => {
    if (!f || f.archive || f.rappelsJ === false) return false;
    const m = M[f.matiereId]; if (!m || m.archive) return false;
    const s = S[m.sourceId];  return !!s && !s.archive && s.rappelsJ !== false;
  };
  // réplique exacte de planning.js#nextDate
  const addD = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return iso(x); };
  const next = q => q.termine ? null
    : (q.dueDate && q.skippedOn && q.skippedOn >= q.dueDate ? addD(q.skippedOn, 1) : (q.dueDate || null));

  const planif = questions.filter(q => (q.type === 'qcm' || q.type === 'flashcard') && planifiee(F[q.ficheId]));
  const dues   = planif.filter(q => next(q) === today && q.skippedOn !== today);
  const retard = planif.filter(q => { const d = next(q); return d != null && d < today; });

  console.log('DATE LOCALE      ', today, '·', Intl.DateTimeFormat().resolvedOptions().timeZone);
  console.log('URL              ', location.origin);
  console.log('cartes en base   ', questions.length, '· planifiables', planif.length);
  console.log('DUES AUJOURD\'HUI ', dues.length, '· EN RETARD', retard.length);
  console.table(dues.map(q => ({
    id: q.id, fiche: (F[q.ficheId] || {}).titre, type: q.type,
    dueDate: q.dueDate, interval: q.intervalDays, maj: q.updatedAt
  })));

  // dérive d'horloge (C4) : comparer ces deux valeurs entre appareils
  const stamps = questions.map(q => q.updatedAt).filter(Boolean).sort();
  console.log('derniere ecriture', stamps[stamps.length - 1], '· horloge locale', new Date().toISOString());

  // doublons présumés (C11)
  const cles = {};
  questions.forEach(q => {
    const k = q.ficheId + '|' + q.type + '|' + String(q.enonce || q.recto || '').slice(0, 60);
    (cles[k] = cles[k] || []).push(q.id);
  });
  console.log('doublons presumes', Object.values(cles).filter(a => a.length > 1).length);

  // ce qui retire silencieusement des cartes du compteur (Q10)
  console.log('cours desactives ', sources.filter(s => s.archive || s.rappelsJ === false).map(s => s.nom));
  console.log('matieres desact. ', matieres.filter(m => m.archive).map(m => m.nom));
  console.log('fiches desact.   ', fiches.filter(f => f.archive || f.rappelsJ === false).map(f => f.titre));
  console.log('fiches orphelines', fiches.filter(f => !M[f.matiereId]).length);
  console.log('fiches / dossier ', fiches.map(f => f.titre + ' → ' + (f.dossierId || 'racine')));
})();
```

### Variante « export complet » (pour la sauvegarde du §9, étape 1)

Même principe, mais écrit un fichier JSON au lieu d'afficher :

```js
(async () => {
  const STORES = ['sources','matieres','dossiers','fiches','questions','structures',
                  'highlights','annotations','stats','exos','docs','anatstruct',
                  'sessionsLog','prompts'];
  const open = n => new Promise((ok, ko) => {
    const r = indexedDB.open('medrevise-' + n);
    r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
  });
  const all = async n => {
    const db = await open(n);
    return new Promise(ok => {
      const q = db.transaction('v1', 'readonly').objectStore('v1').getAll();
      q.onsuccess = () => ok(q.result || []); q.onerror = () => ok([]);
    });
  };
  const dump = { exportedAt: new Date().toISOString(), origin: location.origin,
                 tz: Intl.DateTimeFormat().resolvedOptions().timeZone, stores: {} };
  for (const s of STORES) dump.stores[s] = await all(s);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(dump)], { type: 'application/json' }));
  a.download = 'medrevise-export-' + location.hostname + '-' + Date.now() + '.json';
  a.click();
})();
```

---

## 9. Ordre de correction

**Rien de tout ceci n'a été fait.** L'ordre compte : tant que l'étape 2 n'est pas en place,
tout le reste ne fait que déplacer le problème.

| # | Étape | Corrige | Détail |
|---|-------|---------|--------|
| 1 | **Sauvegarder les quatre états** | — | Export SQL complet de `medrevise_records`, plus un export IndexedDB depuis chacun des trois appareils (§8, variante export). **Sans ces quatre fichiers, aucune correction n'est réversible.** |
| 2 | **Rendre l'écriture cloud conditionnelle** | **C1**, **C3** | Le vrai correctif. Fonction RPC ou `on conflict do update … where excluded.updated_at > medrevise_records.updated_at` : une écriture périmée est **refusée par la base**, pas arbitrée par le client. |
| 3 | **Horodater côté serveur** | **C4** | Cesser d'envoyer `updated_at` ; laisser Postgres le poser (`default now()` + trigger `before update`). Une seule horloge fait autorité. |
| 4 | **Ne jamais pousser après un tirage raté** | **C2** | Conditionner `queueAllLocalForPush()` à `rec.ok` dans `syncNow()`. Trois lignes, et ça ferme le scénario réseau mobile. |
| 5 | **Écrire depuis IndexedDB, pas depuis React** | **C6** | Relire l'enregistrement juste avant chaque `put` ; suspendre les mutations pendant une réconciliation. Fin de la fiche qui se balade. |
| 6 | **Ne garder que les ids dans une session** | **C7** | `session.items` ne stocke plus que des ids ; la carte est relue à la notation. Rend « Précédent » inoffensif. |
| 7 | **Synchroniser les marqueurs de migration** | **C8** | Ajouter `meta` à `SYNCABLE`, ou porter les marqueurs par un enregistrement cloud dédié. Un appareil neuf ne doit plus rejouer neuf migrations écrivantes. |
| 8 | **Fusionner ce qui ne doit jamais s'écraser** | **C10**, **C5** | `stats.activityDays` en **union** plutôt qu'en remplacement, streak recalculé après fusion. À traiter avec C5 si tu veux du merge par champ sur les fiches. |
| 9 | **Donner une outbox aux blobs** | **C9** | Même mécanique que les enregistrements : persister l'intention d'envoi, réessayer jusqu'à confirmation. Supprime les images fantômes. |
| 10 | **Dédoublonner à l'import, puis nettoyer** | **C11** | Aligner `createFicheFromQuestions` sur le garde-fou `srcId` déjà présent ailleurs, **puis** auditer les doublons existants avant de les supprimer. |

---

## 10. Risques de perte de données

- **La sauvegarde doit précéder le diagnostic complet, pas le suivre.** Chaque ouverture de
  l'app sur un appareil périmé est une occasion d'écraser le cloud. Les quatre exports de
  l'étape 1 sont à faire **avant** toute autre manipulation.
- **Corriger le LWW fera disparaître des choses.** Une révision qui n'existe que sur un
  appareil jamais synchronisé sera perdue au moment où la base commencera à refuser les
  écritures périmées. C'est le prix d'une source de vérité — mais ça se prépare, avec les
  exports en main, et ça peut se rejouer.
- **Les suppressions sont irréversibles et se propagent.** `wipeAll` (`storage.js:307`),
  `emptyTrash` et `purgeSource`/`purgeMatiere`/`purgeFiche` posent de vrais tombstones sur
  les trois appareils. Le store `backups`, lui, est **local** : une sauvegarde
  pré-migration ne suit pas l'appareil et ne rattrapera rien ailleurs.
- **Ouvrir l'app sur un quatrième navigateur est une opération à risque**, pas un test
  anodin : elle déclenche neuf migrations dont une qui supprime avec tombstones et une qui
  ré-horodate tout le jeu de cartes (C8).
- **Le nettoyage des doublons doit venir en dernier**, une fois la source de vérité
  établie. Supprimer aujourd'hui, c'est risquer de supprimer sur la base d'un état qui
  n'est déjà plus celui du cloud.

### La bonne nouvelle

Rien n'indique une perte d'historique de révision. **`historique[]` n'est jamais tronqué** :
les écritures rétrogrades restaurent d'anciennes versions d'un enregistrement, mais chaque
entrée notée reste dans la copie qui l'a enregistrée. Une fois la source de vérité établie,
une passe de réparation pourra reconstruire `dueDate` et `intervalDays` à partir des
historiques les plus complets des trois appareils. C'est aussi pour ça que les trois
exports comptent.

**Sur ta crainte principale :** tu as probablement **révisé certaines cartes en trop**
(celles restaurées par une écriture rétrograde), et **raté peu de choses** — une carte dont
le `dueDate` est ramené en arrière **réapparaît**, elle ne disparaît pas. Le défaut penche
du côté du travail en double, pas de l'oubli.

---

## Annexe — Ce qui est déjà correct, et qu'il ne faut pas casser

Pour éviter qu'une future correction défasse du bon travail :

- **L'outbox persistée** (`sync.js:29-70`) : clé `store:id` (pas de doublon), retrait
  uniquement après confirmation, vérification explicite de `{ error }` — le piège
  `supabase-js` qui ne rejette pas sur échec réseau est bien géré.
- **L'ordre du boot** (`MedReviseApp.jsx:86-89`) : `forceSync` est réellement attendu avant
  le premier rendu.
- **Le moteur adaptatif** (`sm2.js:185-207`) : les trois sorties sont correctes, le
  plancher `base + 1` est nécessaire, le relearning en mémoire de session est le bon choix.
- **`dueOn` / `overdueQuestions`** : séparation stricte « dû aujourd'hui » / « en retard »,
  aucun double comptage, recalcul systématique sans cache.
- **Les tombstones** : `remove()` propage bien une suppression, y compris en cascade
  (`purgeFiche`/`purgeMatiere`/`purgeSource`).
- **Le dédoublonnage sur `srcId`** dans `appendItemsToFiche` et `appendExosToChapitre` :
  c'est le modèle à étendre à `createFicheFromQuestions`.
