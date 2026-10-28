# Diagnostic — « 26 cartes en retard » ce matin, puis 1 (28/10/2026)

Audit en lecture seule. Aucune donnée ni aucun fichier de l'app n'a été modifié : ni IndexedDB, ni Supabase, ni
code. Aucune synchro n'a été déclenchée.

## Cause en une phrase

Ce n'est pas un vrai retard, et il y a deux causes distinctes.

- **Le « 26 » est un défaut d'affichage** : l'app montre ses compteurs calculés sur l'état local *avant* la fin
  de la synchro de démarrage. Les 26 cartes avaient été révisées hier soir sur une **autre instance du
  téléphone** (identifiant d'appareil `d3ffbc37`, apparu hier à 20:22) dont l'appareil ouvert ce matin n'avait
  pas encore reçu les réponses. Elles sont sorties du retard dès la fin de la synchro.
- **Le « 1 » restant est un vrai bug de données.** À 09:13:05 ce matin, l'application du journal des révisions
  aux cartes (`appliquerJournalAuxCartes`) a **réécrit une version périmée de la carte**, celle d'avant la réponse
  d'hier. Cette version porte un `updatedAt` neuf, elle a donc gagné la synchro. La réponse « Facile » du 27/10
  20:27 est bien dans le journal, mais elle n'est plus sur la carte : celle-ci a toujours `dueDate`
  `2026-10-27` et un `historique` vide.

## Ce qui a été lu, et comment

| Source | Méthode (lecture seule) |
|---|---|
| Mac (Aside) | Copie du dossier LevelDB de `my-org-blue.vercel.app` (état de 17:39), ouverte dans un Chrome headless isolé : réseau coupé, page vide servie par interception, le code de l'app n'a jamais tourné (`scripts/sauvegarde-fsrs/chrome-isole.mjs`). |
| Cloud | `GET` paginés avec la clé anon publique du bundle : `medrevise_records` (stores `questions`, `fiches`, `matieres`, `sources`, `prompts`, soit 2 243 lignes) et **`medrevise_review_log` (851 entrées, la table existe)**. |
| Calculs | Avec les **vrais modules** de l'app importés dans Node : `categoriser` (`lib/categoriesFC.js`), `nextDate` et `isFicheScheduled` (`lib/planning.js`), `estFlashcardJ`. |

Le téléphone n'est pas accessible. Son état passé a été **reconstitué** à partir du journal : chaque réponse
porte `state_before` / `state_after`, l'appareil et l'heure.

## Chronologie (heure de Bruxelles)

| Heure | Fait (source) |
|---|---|
| 27/10 21:00 → 21:15 | Téléphone `aa2d7370` (l'appareil habituel, journal depuis le 10/10) : **64 réponses**. |
| 27/10 21:22 → 21:37 | Téléphone **`d3ffbc37`**, identifiant jamais vu avant ce soir-là : **29 cartes** (31 réponses dont 2 répétitions), toutes dues le 27. Hier soir : 0 en retard. |
| 27/10 21:30 et 21:34 | `d3ffbc37` re-note **3 cartes déjà notées par `aa2d7370`** un quart d'heure plus tôt (`qmupsujka8l6w`, `qmupw73zkjd6k`, `qmupsz165f0n3`). Cette instance était donc elle aussi en retard d'une synchro au moment de composer sa séance. |
| 28/10 ~10:13 | Un appareil qui n'avait pas reçu les réponses de `d3ffbc37` ouvre l'app. Il affiche **26 en retard** depuis son état local. |
| 28/10 10:13:05 | Synchro, puis journal : **15 cartes réécrites** dans la même seconde (`updatedAt` 09:13:05.316 → .473 UTC, `fsrs.source: "journal"`). C'est la signature de `appliquerJournalAuxCartes`. |
| 28/10 juste après | Compteurs recalculés : **1 en retard**. |
| 28/10 toute la journée | **Aucune réponse** dans le journal. Le passage de 26 à 1 ne vient donc d'aucune révision faite ce matin. |

## Reproduction des chiffres

| Calcul (vrais modules, jour 2026-10-28) | Retard | Révisions | Nouvelles |
|---|---|---|---|
| Cloud maintenant | **1** | 40 | 73 |
| Mac maintenant (identique au cloud) | **1** | 40 | 73 |
| Cloud **sans les réponses de `d3ffbc37`** (cartes ramenées à leur `state_before`) | **27** = les 26 + le 1 | 38 | 73 |
| Cloud sans les réponses de `aa2d7370` | 62 | 32 | 73 |
| Cloud sans aucune des deux | 87 | 30 | 73 |

Seul le scénario « réponses de `d3ffbc37` pas encore reçues » donne l'ordre de grandeur observé. Il donne 27 :
les 26 cartes sorties du retard, plus celle qui y est restée. L'écart d'une unité avec le « 26 » observé
s'explique sans doute par une carte de `d3ffbc37` déjà reçue lors d'une synchro antérieure de cet appareil. Ce
point n'est pas prouvable sans les données de l'appareil.

## Les 27 cartes (les 26 + la restante)

Pour toutes : `dueDate` avant la réponse = `2026-10-27`, catégorie **Retard** sur l'état périmé (date passée), et
dernière réponse donnée sur `téléphone:d3ffbc37` le 27/10 (heures UTC dans le tableau).

| # | Carte (id · recto) | Matière · cours | Dernière réponse (UTC, note) | `dueDate` aujourd'hui | `updatedAt` local = cloud | Devenue |
|---|---|---|---|---|---|---|
| 1 | qmupw73zkjd6k · Constitution cartilage hyalin | Anatomie palpatoire · 1 3 Intro arthrologie | 20:34 · Facile (aussi notée Difficile par aa2d à 20:14) | 2026-11-04 | 09:13:05.316 (journal) | sortie |
| 2 | qmuu0b7xx41lr · Quels sont les oligoéléments | Chimie biochimie · Chimie générale | 20:33 · Facile | 2026-11-04 | 09:13:05.432 (journal) | sortie |
| 3 | qmuy801qbraxq · Schéma corporel | Psychologie · Résumé (cata) | 20:33 · Facile | 2026-10-30 | 27/10 20:33:58 | sortie |
| 4 | qmuy85dqkhj5e · Membre fantôme | Psychologie · Résumé (cata) | 20:23 · Facile | 2026-10-30 | 27/10 20:23:06 | sortie |
| 5 | qmuy88kmutase · L'image du corps | Psychologie · Résumé (cata) | 20:35 · Facile | 2026-10-30 | 27/10 20:35:27 | sortie |
| 6 | qmuzrsp0qoq5p · Liaison phosphodiester | Chimie biochimie · 1 Introduction (1) | 20:23 · Correct | 2026-11-16 | 09:13:05.343 (journal) | sortie |
| 7 | qmuzrszxtctq6 · 3 éléments d'un nucléotide | Chimie biochimie · 1 Introduction (1) | 20:30 · Facile | 2026-11-16 | 09:13:05.381 (journal) | sortie |
| 8 | qmuzryldcj1te · Liaison peptidique | Chimie biochimie · 1 Introduction (1) | 20:33 · Facile | 2026-11-04 | 09:13:05.427 (journal) | sortie |
| 9 | qmv2iol38xtu3 · Raisonnement déductif | Épistémologie · cours 1 | 20:32 · Facile | 2026-11-01 | 09:13:05.410 (journal) | sortie |
| 10 | qmv2j5od6qu2j · m. Grand Glutéal | Anatomie palpatoire · 3 1 Muscles de la fesse | 20:27 · Difficile | 2026-11-05 | 09:13:05.360 (journal) | sortie |
| 11 | qmv2jaohqizfx · m. Tenseur du Fascia Lata | idem | 20:36 · À revoir (×2) | 2026-10-28 | 27/10 20:36:58 | Révision du jour (À revoir → demain) |
| 12 | qmv3v40xyn14o · Que cachent les masques ? | Anatomie · 2 2 Genou p1 | 20:36 · Facile | 2026-11-16 | 09:13:05.473 (journal) | sortie |
| 13 | qmv3vhyp21q5q · Un versant ? | Anatomie · 2 2 Genou p1 | 20:34 · Facile | 2026-11-16 | 09:13:05.452 (journal) | sortie |
| 14 | qmv3viufgwvj9 · Que cachent les masques ? | Anatomie · 2 2 Genou p1 | 20:32 · Facile | 2026-11-09 | 09:13:05.422 (journal) | sortie |
| 15 | qmv70ik92zzfv · Que cachent les masques ? | Anatomie · 2 2 Genou p1 | 20:23 · Facile | 2026-11-16 | 09:13:05.354 (journal) | sortie |
| 16 | qmv70kqprdjmm · Que cachent les masques ? | Anatomie · 2 2 Genou p1 | 20:36 · À revoir (×2) | 2026-10-28 | 27/10 20:36:26 | Révision du jour |
| **17** | **qmv70lczcavmn · Que cachent les masques ?** | **Anatomie · 2 2 Genou p1** | **20:27 · Facile → `state_after.dueDate` 2026-10-30** | **2026-10-27** ❌ | **09:13:05.365 (journal)** | **toujours en retard : c'est le « 1 »** |
| 18 | qmv70ukr4dqk7 · Que cachent les masques ? | Anatomie · 2 2 Genou p1 | 20:28 · Facile | 2026-11-09 | 09:13:05.370 (journal) | sortie |
| 19 | qmv70vsp2kdq1 · Que cachent les masques ? | Anatomie · 2 2 Genou p1 | 20:23 · Facile | 2026-10-30 | 27/10 20:23:25 | sortie |
| 20 | qmv73xh1uovzg · Que cachent les masques ? | Anatomie · 2 2 Genou p2vf | 20:32 · Facile | 2026-10-30 | 27/10 20:32:25 | sortie |
| 21 | qmv740y9c4jvv · Que cachent les masques ? | Anatomie · 2 2 Genou p2vf | 20:35 · Facile | 2026-10-30 | 27/10 20:35:07 | sortie |
| 22 | qmv741g1q8fwh · Que cachent les masques ? | Anatomie · 2 2 Genou p2vf | 20:31 · Facile | 2026-10-30 | 27/10 20:31:17 | sortie |
| 23 | qmv7431ai0zjm · Que cachent les masques ? | Anatomie · 2 2 Genou p2vf | 20:34 · Facile | 2026-10-30 | 27/10 20:34:42 | sortie |
| 24 | qmvchis77f6nl · Que cachent les masques ? | Chimie biochimie · Axe 1 Cellule | 20:30 · Correct | 2026-11-09 | 09:13:05.375 (journal) | sortie |
| 25 | qmvcm164zqt8j · Ligament de Humphrey | Anatomie · 2 2 Genou p2vf | 20:31 · Facile | 2026-10-30 | 27/10 20:31:08 | sortie |
| 26 | qmvcm1mji4qjf · Ligament de Wrisberg | Anatomie · 2 2 Genou p2vf | 20:31 · Facile | 2026-10-30 | 27/10 20:31:32 | sortie |
| 27 | qmvdmu4cu6gil · Membrane basale ? | Histologie · Introduction et épithéliums | 20:30 · Facile | 2026-11-09 | 09:13:05.386 (journal) | sortie |

« Sortie » signifie que la carte a reçu la version notée hier par `d3ffbc37` et que sa date est dans le futur.
Pour toutes ces cartes, `updatedAt` est identique en local (Mac) et au cloud.

## La carte encore en retard : `qmv70lczcavmn`

- **Journal** : le 27/10 à 20:27:39 UTC, `téléphone:d3ffbc37` a noté la carte **Facile** (`state_before.dueDate`
  2026-10-27, `state_after.dueDate` **2026-10-30**, intervalle 3, planificateur `maison`).
- **Carte aujourd'hui** (cloud = Mac) : `dueDate` **2026-10-27**, `intervalDays` 1, `historique` **[]**,
  `updatedAt` **2026-10-28T09:13:05.365Z**, avec un bloc `fsrs` recalculé (`source: "journal"`, reps 1,
  due 2026-11-06).
- **Lecture** : c'est la carte **d'avant la réponse**, puisque la réponse aurait ajouté une entrée à
  `historique` et posé la date du 30. Elle a été réécrite ce matin par l'application du journal
  (`journal/synchro.js` → `appliquerJournalAuxCartes`). Cette fonction prend la carte **locale**, n'y change que
  le bloc `fsrs` (interrupteur OFF) et la ré-enregistre avec `put`, donc avec un `updatedAt` neuf. Une version
  périmée devient alors « la plus récente » et gagne la synchro (dernier qui écrit gagne). La réponse reste dans
  le journal, mais la carte ne la reflète plus. Le journal ne répare jamais la date maison quand l'interrupteur
  est OFF : la carte restera en retard tant qu'elle n'est pas révisée.
- **Pourquoi cet appareil avait la version périmée** : ce n'est pas prouvable sans le téléphone. Deux routes
  sont compatibles avec les données :
  1. la carte enregistrée par `d3ffbc37` n'est jamais arrivée au cloud. L'entrée de journal, elle, part par son
     propre canal, 3 s après la réponse ;
  2. deux synchros ont tourné en parallèle (démarrage + `visibilitychange`). `syncNow` n'a pas de verrou
     « une seule à la fois » (`lib/storage.js:987`), et une passe du journal a pu s'appliquer sur une carte que
     l'autre passe n'avait pas encore remplacée.

  Dans les deux cas, la réécriture par le journal transforme un retard d'information en perte réelle.

## Pistes vérifiées

| Piste | Verdict | Preuve |
|---|---|---|
| Compteur calculé avant la fin de la synchro de démarrage (réponses de l'autre appareil pas encore reçues) | **Oui : le « 26 »** | `MedReviseApp.jsx:234-236` : `reload()` affiche l'état local, puis `forceSync()`. La reconstitution « sans `d3ffbc37` » donne 27 = 26 + 1. Aucune réponse donnée ce matin. |
| Réponses du journal pas (ou mal) appliquées à l'état des cartes | **Oui : le « 1 »** | `appliquerJournalAuxCartes` réécrit une carte périmée (`updatedAt` neuf) sans reprendre `state_after` du maison. Voir plus haut. |
| Bascule du jour (4 h, Europe/Brussels) ou calcul de « aujourd'hui » | Non | À 10:13, `todayISO()` (minuit local, `lib/sm2.js:108`) et `jourDeRevision` (bascule 4 h) donnent tous deux 2026-10-28. NB : les compteurs utilisent `todayISO()` sans bascule, pas la bascule de 4 h. C'est une incohérence entre 0 h et 4 h, mais elle est sans effet ici. |
| Conversion « Nouvelles / J0 » ou « Passer en révision » qui produit une date passée | Non | Aucun événement `passage_revision` dans le journal (0 au total au cloud). Aucune des 27 n'a `nouvelle: true`. Toutes avaient une vraie date du 27, posée par une réponse antérieure ou par le passage en révision du 26. |
| Mode ombre FSRS qui écrit `dueDate` alors que l'interrupteur est OFF | Non | Aucun `reglagesFC` dans `prompts` (cloud), donc `planificateurActif` = `maison`. Toutes les entrées ont `planificateur: "maison"`. Sur la carte restante, `fsrs.due` (06/11) ≠ `dueDate` (27/10) : le mode ombre n'a pas touché la date. |
| Séance reprise qui ne réapplique pas des notes | Non | Aucune séance ce matin (0 réponse le 28). Le `meta.seanceFC` du Mac date du 10/10. |

## Correction proposée (non appliquée)

```js
// 1) journal/synchro.js — appliquerJournalAuxCartes : ne jamais réécrire une carte PLUS ANCIENNE que sa dernière réponse
const n = trierJournal(journal).filter((e) => e.rating != null && !(e.details && e.details.relearn)).pop();
const vue = n && (carte.historique || []).length && carte.updatedAt >= n.reviewed_at;
if (n && !vue && actif === 'maison' && n.state_after) // carte locale périmée : reprendre l'état maison de la réponse
  suivante = { ...suivante, dueDate: n.state_after.dueDate, intervalDays: n.state_after.intervalDays, termine: !!n.state_after.termine };
// 2) lib/storage.js — syncNow « une seule à la fois » : let enVol = null; return enVol ||= passe().finally(() => (enVol = null));
// 3) compteurs : n'afficher les chiffres qu'après forceSync() + synchroniserJournal() (demande « synchro avant affichage »)
// Réparation de qmv70lczcavmn : la fonction 1) la remettrait d'elle-même au 30/10 (la date est déjà passée : en retard d'un jour).
```
