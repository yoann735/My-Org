# Diagnostic — 15 cartes « à apprendre » d'écart entre le téléphone et le Mac (10/10/2026)

Audit en lecture seule. Aucune donnée modifiée (ni IndexedDB, ni Supabase, ni fichier de l'app),
aucune migration, aucune synchro déclenchée.

## Réponse en une phrase

**Ce n'est pas un défaut de synchro, c'est un bug d'affichage de la reprise de séance.** Le Mac
montre la file d'une séance **commencée à 16:33** et sauvegardée dans un `meta` local
(`seanceFC`). Or la reprise ne fait que **retirer** des cartes de cette file, jamais en **ajouter**.
Les 15 cartes créées **après** 16:33 (Épistémologie cours 1 et Muscles de la fesse, de 16:49 à
17:20) n'y entrent donc pas. Le téléphone, lui, calcule le plan du jour à partir des cartes.

Les cartes elles-mêmes sont **identiques** sur le Mac et au cloud, champ par champ.

## Ce qui a été lu, et comment

| Source | Méthode (lecture seule) |
|---|---|
| Mac | Le navigateur qui sert l'app sur ce Mac est **Aside**, pas Chrome. Son IndexedDB de `my-org-blue.vercel.app` a été copié (état de 17:50) dans le scratchpad. La copie a été ouverte dans un Chrome headless isolé : réseau coupé (`--host-resolver-rules=MAP * ~NOTFOUND`), page vide servie par interception CDP, **le code de l'app n'a jamais tourné**. Les données d'Arc (8 septembre) sont périmées et n'ont pas été utilisées. |
| Cloud | `GET /rest/v1/medrevise_records` paginé, avec la clé anon publique du bundle déployé et le même filtre que `pullAllRecords`. 3 759 lignes, 1 583 cartes vivantes. |
| Téléphone | Pas d'accès. Son état attendu a été reconstitué : données du cloud + code actuel (`planDuJour`). |
| Calculs | Faits avec **les vrais modules** de l'app (`lib/apprentissageFC.js`, `lib/planning.js`) importés dans Node, et non avec une réimplémentation. |

## Les chiffres, reproduits

| Calcul | Révisions | À apprendre |
|---|---|---|
| Plan du jour calculé sur les **données du Mac** | 39 | **77** (77 en cours, 0 nouvelle, 0 à sortir) |
| Plan du jour calculé sur les **données du cloud** (= téléphone à jour) | 39 | **77** |
| **Séance sauvegardée sur le Mac** (`meta.seanceFC`, `debut` 14:33:48 UTC = 16:33 à Paris, `phase: revisions`) | 39 | **62** (`file` = 62, `nApprendre` = 62, dont `nNouvelles` = 18) |
| Ce qu'affiche le Mac (`seanceEnCours` → `appRestantes`) | 39 | **62** |

Les données du Mac donnent donc **elles aussi** 77. Le 62 ne vient pas des cartes : il vient de la
séance figée. L'écran du Mac est en mode « Séance commencée ». Ses boutons affichent
« Révisions (39) · Apprentissage (62) », car `SeanceAujourdhui.jsx:53-59` utilise
`reprise.revRestantes` / `reprise.appRestantes` dès qu'une séance du jour existe.

**Les 39 révisions sont les mêmes 39 cartes**, pas seulement le même nombre. La liste d'ids de la
séance du Mac est identique à celle du plan calculé depuis le cloud. Les 62 cartes de la file du
Mac sont toutes dans les 77, et aucune carte de la file n'a quitté le plan.

## Les 15 cartes divergentes

Ce sont toutes les cartes qui sont dans le plan (77) mais absentes de la file du Mac (62).
Toutes ont des valeurs **identiques sur le Mac et au cloud** :

- `learnState: learning`, `learningIntroducedOn: 2026-10-10`, `learningDue: 2026-10-10` ;
- `learningSource: nouvelle`, `learningStreak: 0`, `learningCriterion: 2` ;
- `learningPresented: false`, `dueDate: 2026-10-10` ;
- `updatedAt: 2026-10-10T15:44:23.306Z`, soit 17:44:23 à Paris, la même milliseconde pour les 15.

L'heure de création se lit dans l'id (horodatage base 36).

| # | Recto (tronqué) | Matière / cours | Créée à | Mac : file de séance | Mac : carte | Cloud | Téléphone (attendu) |
|---|---|---|---|---|---|---|---|
| 1 | Que permet la logique ? | Épistémologie · cours 1 | 16:49 | absente | learning | learning | comptée |
| 2 | Quand est ce qu'un raisonnement est valide ? | Épistémologie · cours 1 | 16:55 | absente | learning | learning | comptée |
| 3 | Quels sont les critères pour qu'une conclusion soi… | Épistémologie · cours 1 | 16:55 | absente | learning | learning | comptée |
| 4 | C'est quoi raisonnement déductif ? | Épistémologie · cours 1 | 16:56 | absente | learning | learning | comptée |
| 5 | C'est quoi un raisonnement inductif ? | Épistémologie · cours 1 | 16:57 | absente | learning | learning | comptée |
| 6 | Quel est la structure du raisonnement valide ? | Épistémologie · cours 1 | 17:00 | absente | learning | learning | comptée |
| 7 | m. Grand Glutéal | Anatomie palpatoire · 3 1 Muscles de la fesse | 17:09 | absente | learning | learning | comptée |
| 8 | Muscles de la région glutéale | idem | 17:13 | absente | learning | learning | comptée |
| 9 | m. Moyen Glutéal | idem | 17:15 | absente | learning | learning | comptée |
| 10 | m. Petit Glutéal | idem | 17:16 | absente | learning | learning | comptée |
| 11 | m. Piriforme | idem | 17:18 | absente | learning | learning | comptée |
| 12 | m. Obturateur Interne | idem | 17:19 | absente | learning | learning | comptée |
| 13 | m. Jumeaux | idem | 17:19 | absente | learning | learning | comptée |
| 14 | m. Carré fémoral | idem | 17:20 | absente | learning | learning | comptée |
| 15 | m. Obturateur Externe | idem | 17:20 | absente | learning | learning | comptée |

**Raison, la même pour les 15.** Ces cartes ont été créées après 16:33, l'heure où la séance du
Mac a figé sa file. À 17:44:23, une séance **neuve** les a introduites (`introduire`, un seul
`putMany`, d'où la même milliseconde). Ce n'est pas le Mac : sa séance du jour existait déjà, il
était donc en reprise et n'introduit rien, et son `seanceFC.debut` est resté à 16:33. C'est donc
**très probablement le téléphone**, qui a ouvert la séance des flashcards à 17:44. La seule
alternative serait un autre onglet ou appareil. Aucun champ `deviceOrigin` n'existe pour le
prouver ; voir « Téléphone » plus bas. L'écriture a été synchronisée normalement, et le Mac l'a bien
reçue. Mais en reprise, `SeanceFC.jsx:124-131` et `seanceEnCours` (`SeanceFC.jsx:54-60`) ne
regardent que `sauve.file`.

## Pistes vérifiées et écartées

| Piste | Verdict | Preuve |
|---|---|---|
| Champs d'apprentissage absents du payload ou ignorés à la réception | **Non** | `put`/`putMany` envoient l'enregistrement entier (`data`). Comparaison Mac ↔ cloud sur les 1 583 cartes, contenu complet hors `updatedAt` : 0 différence. |
| Migration ou rattrapage aux résultats différents selon l'appareil | **Non** | La v1.1 n'écrit aucune carte (`migrate.js:477-508`). Rapport du Mac : `rattrapees: 220`, `sortiesSansRepasser: 0`. Les états actuels sont identiques au cloud. |
| Conflit `updated_at` résolu dans des sens opposés | **Non** | Mêmes `updatedAt` des deux côtés pour `questions`, `fiches`, `matieres` et `sources`. Outbox du Mac vide (0 entrée). |
| Fuseau horaire ou date | **Non** | `todayISO()` = date locale (`sm2.js:105-110`). Le cloud donne 39/77 le 10/10, mais 0/44 le 09/10 et 67/77 le 11/10 : seule la date du 10 reproduit les deux écrans. |
| Critère différent (aSortir) | **Non** | Aucun `reglagesFC`, ni sur le Mac ni au cloud : les deux appareils appliquent le défaut (critère 2), et `aSortir` = 0. |
| Séance entamée non répercutée | **Oui, c'est la cause** | Voir plus haut : `meta.seanceFC` est local (le store `meta` n'est pas syncable) et sa file n'est jamais complétée. |
| Cache de compteurs non recalculé après synchro | **Non, au sens strict** | `forceSync` → `reload()` recharge bien `db`. C'est la file de la séance sauvegardée qui l'emporte sur le plan recalculé. |
| Doublons ou ids divergents | **Non** | Mêmes 1 583 ids des deux côtés. Un seul groupe de doublons existe (4 × « Que cachent les masques ? », en révision, échéances du 11 au 15/10), hors des 39 et des 77. |

## L'indicateur « synchronisé » : ce qu'il couvre, et s'il ment ici

Il calcule un SHA-256 des triplets **`store|id|updatedAt`** de tous les enregistrements vivants des
stores syncables, et ajoute deux conditions : outbox vide et fichiers à jour
(`lib/syncStatus.js:53-66`, `95-130`).

- Il **ne compare pas le contenu**, seulement `updatedAt`. Une écriture qui changerait
  `learnState` sans réhorodater passerait donc inaperçue. Ici ce n'est pas le cas : toutes les
  écritures passent par `put`/`putMany`, qui réhorodatent, et le contenu complet a été vérifié
  identique.
- Il **ne couvre pas `meta`**, qui reste local par construction : séance en cours (`seanceFC`),
  mesures de temps, liste des migrations.
- Il ne couvre pas non plus les **compteurs dérivés** (plan du jour, reprise).

**Verdict : il ne ment pas sur les données.** Pour les stores qui décident des compteurs
(`questions`, `fiches`, `matieres`, `sources`), le Mac est identique au cloud, outbox vide. Mais
il peut être vert alors que deux écrans montrent des chiffres différents. C'est ce qui arrive ici :
la différence vit dans `meta.seanceFC`, que l'indicateur ne prétend pas couvrir.

## Correction proposée (non appliquée)

```js
// SeanceFC.jsx — reprise (l. ~127) : compléter la file au lieu de seulement la filtrer
const plan = planDuJour(flashcardsPlanifiees(ctx.db), ctx.reglagesFC, today, nextDate);
const vues = new Set(e.file);
const neuves = plan.nouvelles.filter((q) => !vues.has(q.id));
const ajout = [...plan.enCours, ...neuves].map((q) => q.id).filter((id) => !vues.has(id));
if (neuves.length) await putMany('questions', neuves.map((q) => introduire(q, reglages, today)));
e.file = [...e.file, ...entrelacer(ajout, coursDe)]; e.nApprendre = (e.nApprendre || 0) + ajout.length;
// seanceEnCours (l. 54-60) : appRestantes = |file ∪ (plan.enCours + plan.nouvelles)|, même union pour l'affichage
```

**Risque : faible.** Le changement ne fait qu'ajouter, en fin de file, des cartes que le plan du
jour contient déjà. Aucune date ni aucun état n'est modifié, hormis l'`introduire` des nouvelles,
qui est déjà ce que fait une séance neuve. Point à tester : une carte sortie (passée en `review`)
pendant la séance n'est plus dans le plan et ne peut donc pas revenir. **Aucune réparation de
données n'est nécessaire** : les cartes sont justes et identiques partout. La file du Mac se
corrigera d'elle-même à la fin de la séance (`phase: 'fin'`) ou demain (`seanceFC.date` ≠ jour).
Si on voulait néanmoins forcer, il suffirait d'effacer `meta.seanceFC` du Mac : c'est local et
sans aucun effet au cloud. Il faudrait alors un `putBackup('pre-reset-seanceFC', seanceFC)`
préalable, mais ce n'est pas recommandé, inutile.

## Téléphone : ce qu'il faudrait exporter pour clore la preuve

Il n'existe **pas** de bouton d'export de diagnostic. « Exporter une sauvegarde » (Réglages,
accueil mobile, `lib/backupExport.js`) ne couvre que `SYNCABLE_STORES` : **ni `meta.seanceFC`, ni
l'heure ni l'appareil d'une introduction**.

**Proposition, non codée :** un bouton « Exporter le diagnostic » en lecture seule dans Réglages
(desktop et mobile). Il produirait un JSON avec :

- `meta.seanceFC`, `meta.migrations`, `meta['migration.*']` ;
- `todayISO()`, `Intl.DateTimeFormat().resolvedOptions().timeZone`, `navigator.userAgent` ;
- le hash du build ;
- `comparerAuCloud()` (empreinte, écarts, outbox) ;
- le résultat de `planDuJour` et la liste des ids (révisions, en cours, nouvelles, à sortir).

À plus long terme, un champ `introducedBy`/`deviceOrigin` à côté de `learningIntroducedOn`
permettrait de dater et d'attribuer chaque introduction.

**En attendant, à faire sur le téléphone :**

1. Noter le texte exact de l'encart « Aujourd'hui ». Affiche-t-il « Séance commencée · N cartes
   restantes » ? Si oui, c'est le téléphone qui a ouvert la séance à 17:44.
2. Dans Réglages → Synchronisation, noter l'empreinte cloud. Elle doit être la même que celle du
   Mac ; l'empreinte du cloud calculée ici vaut `271762b23b05` (2 827 enregistrements). Toute
   écriture faite depuis la changera.

NB : le libellé « 116 cartes à réviser aujourd'hui : 39 en révision + 77 en apprentissage »
n'existe dans aucune version du code ni dans le bundle déployé. L'écran réel est
« 39 à réviser · 77 à apprendre · ≈ N min », c'est-à-dire le même composant `SeanceAujourdhui`
sur les deux appareils.
