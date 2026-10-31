# Diagnostic : éléments manquants signalés par le contrôle d'intégrité (31/10/2026)

**Fait en lecture seule.** Rien n'a été supprimé, restauré ou modifié, ni dans IndexedDB, ni dans
Supabase, ni dans la sauvegarde GitHub, ni dans les `putBackup`. Aucun code n'a été modifié.

## Méthode

1. **Les sauvegardes GitHub quotidiennes** : 21 commits, du `backup 2026-10-11` au
   `backup 2026-10-31` (03:05). Chaque copie est le reflet exact de `medrevise_records` dans
   Supabase, tombstones comprises.
   - Pour chaque paire de jours consécutifs, j'ai relevé tout enregistrement **vivant** la veille
     et **absent ou marqué supprimé** le lendemain.
   - Stores examinés : `questions` (flashcards, QCM, exercices, Feynman), `fiches`, `matieres`,
     `sources`, `dossiers`, `exos`, `notes_doc`, `tableau`.
   - Script : `diff.py`, dans le dossier temporaire de la session (non versionné).
2. **Les comptes des manifestes.** Dans le cloud, ils ne baissent jamais d'un jour à l'autre :
   flashcards 950 → 1041 entre le 16/10 et le 31/10 ; QCM 220, exercices 395 et Feynman 74
   inchangés ; fiches 106 → 122.
3. **Le journal de révision** (`review_log`), pour retrouver l'appareil et la dernière révision
   de chaque carte.
4. **La référence locale du contrôle**, non lue.
   - Elle est rangée dans `meta` : clé `integrite.instantanes`, sur l'appareil qui affiche
     l'alerte.
   - L'extension Chrome n'était pas connectée.
   - Ouvrir l'app pour la lire aurait relancé le contrôle et **réécrit** cette référence.
     Ce n'est pas de la lecture seule, donc je ne l'ai pas fait.

## Résultat : 12 éléments ont disparu, tous des flashcards

Rien d'autre n'a disparu : aucun QCM, exercice, Feynman, fiche, matière, cours, dossier, document
ou tableau. Les 12 flashcards ont été supprimées par un **vrai effacement**, poussé au cloud comme
une tombstone (`deleted: true`). Aucune n'a disparu sans trace.

| # | Recto | Cours › Matière › Fiche | Créée le (d'après l'id) | Supprimée le (UTC) | Révisions |
|---|---|---|---|---|---|
| 1 | Que cachent les masques ? *(occlusion d'image)* | Helha Kiné › Histologie › Introduction 26 27 et Epithéliums de revêtement | 25/10 14:18 | 26/10 11:40:06 | 0 |
| 2 | C'est quoi : articulation torique négative | Helha Kiné › Anatomie palpatoire › 1 3 Introduction à l'arthrologie | 04/10 | 28/10 16:10:47 | 4 |
| 3 | C'est quoi : articulation torique positive | idem | 04/10 | 28/10 16:10:49 | 3 |
| 4 | C'est quoi : enarthrose | idem | 04/10 | 28/10 16:10:53 | 5 |
| 5 | C'est quoi : articulation TROCHOIDE | idem | 04/10 | 28/10 16:10:55 | 11 |
| 6 | C'est quoi : articulation trochleene | idem | 04/10 | 28/10 16:10:57 | 4 |
| 7 | C'est quoi Amphiarthroses ? | idem | 01/10 19:19 | 28/10 16:11:37 | 4 |
| 8 | Tissu d'interposition et mouvement en symphyse | idem | 01/10 | 28/10 16:11:41 | 13 |
| 9 | Tissu d'interposition et Mouvement en synchondrose | idem | 01/10 | 28/10 16:11:43 | 4 |
| 10 | Tissu d'interposition et Mouvement en syndesmose ? | idem | 01/10 | 28/10 16:11:46 | 9 |
| 11 | Tissu d'interposition et Mouvement en synostose ? | idem | 01/10 | 28/10 16:11:50 | 8 |
| 12 | Quels sont les 4 types de Synarthroses | idem | 01/10 | 28/10 16:11:52 | 5 |

**Identifiants :**
1. `qmvnusp4gy3qi`
2. `qmutztmq7lmgv`, `qmutzs8fqiz4k`, `qmutzr1x123ti`, `qmutzpse1vtqt`, `qmutzof6vz4m7`
   (cartes 2 à 6)
3. `qmupvfj11ac4p`, `qmupsz165f0n3`, `qmupsydb4xh00`, `qmupsxulv8v3d`, `qmupsvq4je06o`,
   `qmupsujka8l6w` (cartes 7 à 12)

**Fiches concernées :**
- `fmv967iu0nq14` pour la carte 1 ;
- `fmuphqhottvhj` pour les cartes 2 à 12. Toutes sont dans la sauvegarde du 11/10, avec
  j0 = 04/10.

### Comment elles ont disparu : action manuelle, une carte à la fois

**Le rythme.** Les 11 cartes d'arthrologie ont été effacées **une par une**, toutes les 2 à
4 secondes (16:10:47 → 16:11:52), dans l'ordre inverse de leur création. C'est le rythme de clics
successifs sur une corbeille avec confirmation. Ce n'est pas celui d'un traitement automatique :
une synchro, une migration ou un nettoyage écrit tout d'un coup, avec le même horodatage.

**Les chemins de code.** Un seul chemin produit une tombstone pour **une** question isolée :
`ctx.deleteQuestion(id)` → `remove('questions', id)`, dans `MedReviseApp.jsx:852`. Il n'est appelé
que depuis des boutons de l'interface :
- la corbeille de la Bibliothèque (`Bibliotheque.jsx:402`) ;
- la suppression confirmée du panneau des cartes du cours (`CourseItemsSidebar.jsx:329`) ;
- Réviser (`Reviser.jsx:728`) ;
- le carnet (`CarnetDashboard.jsx:286`).

Les autres suppressions de questions ne visent pas une carte seule :
- `deleteCardsOfType`, `purgeFiche`, `purgeMatiere` et la suppression d'un dossier font un
  `putBackup` puis effacent **toute** une fiche, une matière ou un lot ;
- la fiche `fmuphqhottvhj` existe toujours, avec ses autres cartes, donc ce n'est pas l'un de ces
  chemins.

Aucune migration, conversion ou synchro n'appelle `remove('questions', …)`. La synchro ne fait
qu'**appliquer** des tombstones déjà présentes dans le cloud (`supprimerDepuisCloud`).

**La carte 1** (occlusion « Que cachent les masques ? ») a été supprimée seule le 26/10 à 11:40.
Le même jour à 14:28, deux nouvelles cartes d'occlusion portant le même recto ont été créées sur la
même fiche. Elles sont vivantes : `qmvp6jwrxre8p`, `qmvp6sllc21p8`. C'est le profil d'une carte
refaite à la main.

**L'appareil** n'est pas connu. Une tombstone ne garde ni l'appareil ni l'auteur. Au moment des
suppressions, le journal de révision ne contient aucune révision. La dernière révision de ces
cartes date du 27/10 au soir, sur téléphone (`téléphone:d3ffbc37`).

## Pourquoi l'alerte se déclenche (cause de la fausse alerte)

Le contrôle (`integrite/controle.js`, règle « baisse ») compare le **nombre de questions par type**
à l'instantané local du dernier jour d'ouverture, rangé dans `meta` sous `integrite.instantanes`.
Il ignore *pourquoi* une carte manque :
- `remove()` efface la carte d'IndexedDB ;
- il envoie la tombstone ;
- il ne laisse **aucune trace locale** d'une suppression volontaire.

Le scénario est donc le suivant :
1. l'appareil prend l'instantané à l'ouverture, quand les 11 ou 12 cartes sont encore là ;
2. les suppressions ont lieu ;
3. à la première ouverture d'un jour suivant, le nombre de flashcards est plus bas, s'il y a eu
   plus de suppressions que de créations entre les deux ;
4. le bandeau rouge « N cartes de moins qu'hier » apparaît, avec ces ids manquants.

L'alerte vient d'un appareil dont l'instantané précède les suppressions, par exemple le
téléphone, où ces cartes ont été revues le 27/10.

## Confirmation

Les **12 suppressions** portent la signature d'une action manuelle depuis l'interface. **Aucune
disparition** ne vient d'autre chose : ni synchro, ni migration, ni conversion, ni écrasement, ni
nettoyage automatique.

> Confirmes-tu que ces suppressions sont les tiennes ?

**Réponse de l'utilisateur, 31/10 : « Oui, ce sont les miennes. »** Rien n'est donc à restaurer.

## Correction (31/10)

### Principe

Une suppression faite depuis l'interface est **notée comme volontaire avant d'être exécutée**, dans
un registre synchronisé. Le contrôle ne signale plus que les cartes **absentes du registre**.

### Le registre

- **Fonction** : `lib/storage.js#noterSuppressionsVolontaires`.
- **Stockage** : un enregistrement **par appareil** dans le store `prompts`, déjà synchronisé, sous
  la clé `suppressionsVolontaires:<appareil>`. C'est un enregistrement additionnel : aucune donnée
  existante n'est réécrite.
- **Pourquoi un par appareil** : chaque appareil n'écrit que le sien, donc la règle « la dernière
  écriture gagne » n'efface jamais l'enregistrement d'un autre.
- **Contenu de chaque entrée** : `{ type, le, origine }`. Les entrées sont gardées 120 jours.
- **Ordre** : le registre est écrit **avant** `remove()`. Il part donc dans l'outbox avant la
  tombstone, et l'appareil qui reçoit la tombstone reçoit aussi l'explication. C'était le cas réel :
  la carte est supprimée sur un appareil, l'alerte apparaissait sur un autre.

### Chemins de suppression couverts

Ce sont tous ceux qui suppriment des questions depuis l'interface :

| Chemin | Code |
|---|---|
| Suppression d'une carte (Bibliothèque, panneau du cours, Réviser, carnet) | `ctx.deleteQuestion` |
| Suppression de toutes les cartes d'un type d'une fiche ou d'un chapitre, avec leurs V2 | `deleteCardsOfType` |
| Exercices d'un dossier supprimé | `deleteDossier` |
| V2 d'une carte sortie du carnet d'erreurs | `removeFromCarnet` |
| Suppression définitive d'un cours, d'une matière, d'une source, ou corbeille vidée | `purgeFiche`, `purgeMatiere` (`purgeSource` passe par `purgeMatiere`) |

### Le contrôle

`integrite/controle.js`, règle « baisse » :
- **Avant** : il comparait les **comptes** par type à l'instantané de la veille. Chaque suppression
  manuelle devenait donc une perte. Une vraie perte compensée par des créations du jour passait
  inaperçue.
- **Maintenant** : il liste les ids de la veille absents aujourd'hui, retire ceux du registre (tous
  appareils confondus, `integrite/suppressions.js#idsVolontaires`), et n'alerte que s'il en reste.
- **Instantané** : il garde aussi `idsParType`, pour nommer le type d'une carte disparue. Un
  instantané plus ancien donne le type « inconnu ».
- **Écran Intégrité** : il affiche « N cartes supprimées par toi depuis le dernier contrôle : normal,
  non signalé ».
- **Bandeau** : il dit « N cartes disparues sans suppression de ta part ».

### Confirmer d'un clic (ajout du 31/10, soir)

Après le déploiement, l'appareil signalait encore **10 cartes**. Ce sont d'autres suppressions que
les 12 du diagnostic, faites avant que le registre n'existe. L'utilisateur confirme que ce sont
toutes les siennes.

L'écran Intégrité, sur ordinateur, tablette et téléphone, a maintenant le bouton **« C'est moi qui
les ai supprimées — ne plus signaler »** sous la liste des identifiants manquants. Un clic :
1. inscrit ces ids dans le registre de l'appareil (origine « confirmée depuis l'écran Intégrité ») ;
2. relance le contrôle ;
3. fait disparaître le bandeau.

L'inscription est synchronisée : les autres appareils ne les signaleront plus non plus. Le banc
`t-suppressions.mjs` le vérifie par de vrais clics : bandeau, puis bouton, puis plus aucune alerte.

### Mise à jour de la référence

Les 12 suppressions du 26 au 28/10 précèdent le registre. Elles sont inscrites **dans le code**
(`SUPPRESSIONS_CONFIRMEES`, `integrite/suppressions.js`) et comptent comme volontaires. Aucune donnée
n'est écrite pour cela. L'appareil dont l'instantané précède ces suppressions n'alertera plus.

### Limites assumées

- **« Tout effacer »** (Réglages, `wipeAll`) n'est pas inscrit au registre, car il efface aussi le
  registre. Les autres appareils signaleront donc cette remise à zéro. C'est voulu : c'est une
  disparition massive.
- **Ancienne version de l'app** : si un appareil tourne encore sur l'ancienne version (page restée
  ouverte, cache du téléphone), ses suppressions ne passent pas par le registre. Elles seront
  signalées une fois sur les autres appareils, jusqu'à ce qu'il se recharge.
- **Restauration depuis une sauvegarde** (`replaceStore`) : une carte absente de la copie restaurée
  est signalée. Il vaut mieux voir ce qu'une restauration enlève.

### Tests

| Test | Résultat |
|---|---|
| Vitest `tests/suppressions-volontaires`, 7 tests : suppression du registre sans alerte ; disparition non expliquée alertée avec son type ; cas mêlé ; perte masquée par une création ; fusion de plusieurs appareils et des 12 ids confirmés ; ancien instantané ; même jour | ✅ |
| Vitest `tests/filet`, ancien test « baisse » sans registre | 16/16 ✅ |
| `scripts/tests-suppressions-volontaires/t-suppressions.mjs` : Vite :5302 **sans Supabase**, Chrome isolé | ✅ |
| `scripts/tests-suppressions-volontaires/t-deux-appareils.mjs` : **faux Supabase** :54399 + Vite :5300, ordinateur A 9335 et téléphone B 9336 | ✅ |
| Non-régression de la synchro : `scripts/tests-synchro-rapide/tout.sh apres --sans-attente` | 15/15 ✅ |
| `npm test` (seul échec : `crayon › trois épaisseurs`, déjà connu) | 242/243 |
| `npx vite build` | vert |
| MealWeek et `src/shared/` : `git diff --name-only -- src/mealweek src/shared` | vide |

Détail de `t-suppressions.mjs` :
1. référence d'hier posée ;
2. **vrai clic** dans le panneau du cours › Flashcards : corbeille, puis « Supprimer » dans la
   modale ;
3. carte supprimée, inscrite au registre (« suppression d'une carte »), **aucune alerte**, aucun
   bandeau ;
4. carte effacée directement dans IndexedDB, comme une copie de données sans elle : **alerte**
   pour cette seule carte, et bandeau « 1 carte disparue sans suppression de ta part » ;
5. une référence contenant les 12 ids du 26 au 28/10 ne donne aucune alerte (12 volontaires) ;
6. aucune erreur console.

Détail de `t-deux-appareils.mjs` :
1. A supprime une carte par le chemin de l'interface ;
2. B reçoit la tombstone **et** le registre de A : **aucune alerte** ;
3. A efface une autre carte hors interface (tombstone seule) : B **alerte** pour elle seule ;
4. A = B = cloud ; aucune erreur console.

Relancer : `scripts/tests-suppressions-volontaires/tout.sh` (installation décrite en tête du script).
Les serveurs du banc sont dans `.claude/launch.json` : `medrevise-banc`, `faux-supabase`,
`medrevise-faux-cloud`.
