# Boîtes disparues (Épithélium glandulaire) et enregistrement continu (14/11/2026)

**En bref**

- **Épithélium glandulaire : aucune boîte disparue.** Toutes les boîtes présentes dans une sauvegarde, dans le cloud ou dans le journal d'IndexedDB du Mac sont encore là, avec leur texte complet. Ça vaut pour les 3 documents : le cours original, la fiche S1 et la fiche S2.
- **Autres documents : rien n'a disparu sans suppression.** Sur les 71 documents annotés, aucune annotation n'a disparu sans trace. Toutes les absences correspondent à une suppression faite dans l'app (tombstone).
- **Ce qu'on ne peut plus voir.** Les boîtes créées puis supprimées entre deux sauvegardes nocturnes n'ont jamais été copiées nulle part. Leur contenu est perdu dans toutes les sources. Pour les documents glandulaires, ce sont 21 suppressions, presque toutes de boîtes vides retirées dans la seconde (§ 1.4).
- **Trois vraies failles trouvées dans le code**, qui pouvaient faire perdre du texte. Elles sont corrigées (§ 1.5).
- **Ce qui change :**
  - ce que tu écris est dans IndexedDB moins de 300 ms après la frappe, écriture vérifiée par relecture ;
  - une erreur d'écriture est affichée et le reste ;
  - la file d'envoi survit à la fermeture ;
  - un indicateur discret est dans la barre du document ;
  - une alerte apparaît si des boîtes disparaissent ;
  - un **historique des versions** est disponible (menu Fichier › Historique…).
- **Tests :**
  - bancs verts sur ordinateur, tablette tactile et téléphone ;
  - Vitest : 273 réussis sur 275 (les 2 échecs existaient déjà) ;
  - build vert ;
  - MealWeek identique au pixel près.
- **Aucune migration SQL**, aucune écriture Supabase, aucune donnée réelle modifiée.

---

## 1. Diagnostic (lecture seule)

### 1.1 Sources lues

Rien n'a été écrit dans ces sources.

| Source | Comment | État lu |
|---|---|---|
| Données locales du Mac | Copie du dossier IndexedDB d'**Aside** (14/11 16:52), exportée dans un Chrome isolé, sans réseau, sur une page vide. Le code de l'app n'a jamais tourné (`scripts/sauvegarde-fsrs/export-idb.mjs`). | 35 bases, 7 295 entrées, 0 erreur |
| Journal interne d'IndexedDB du Mac | Fichier `.log` de LevelDB, décodé (format V8). Il contient **chaque écriture** depuis le dernier compactage (13/11 16:47), donc les états intermédiaires et les boîtes supprimées depuis. | 12 826 écritures, dont 91 annotations |
| Tables compactées (`.ldb`) | Décompressées (Snappy) et parcourues | 15 504 entrées |
| Sauvegardes locales `putBackup` | Store `backups` de la copie | 208 sauvegardes |
| Sauvegardes quotidiennes GitHub | Les **36 copies** de `yoann735/medrevise-backups`, du 11/10 au 14/11 03:05 | Toutes lues |
| Cloud | Lecture (GET) des lignes `annotations` et `highlights` de `medrevise_records`, avec la clé publique | 3 851 lignes |

### 1.2 Les documents « Épithélium glandulaire »

Il y a **un seul cours**, `fmw98yljn4ncp`, « Les épithéliums glandulaires », importé le 09/11. Il a **trois calques** d'annotations :

| Document | Espace de noms | Séance |
|---|---|---|
| Diapo originale | `fmw98yljn4ncp` | — |
| **Fiche S1** (`Epitheliums_glandulaires_notes.pdf`) | `…::fiche:1` | 09/11, p. 1–38 |
| **Fiche S2** (`Epitheliums_glandulaires_2_notes.pdf`) | `…::fiche-fsmwbwkqtvmapl:1` | 10/11, p. 39 et suivantes |

L'autre cours au titre proche, « Introduction 26 27 et Epithéliums de revêtement », a été vérifié aussi. Il n'a rien perdu.

### 1.3 Versions comparées, annotation par annotation

Annotations vivantes dans chaque version :

| Version | Original (boîtes / textes / traits / surlignages) | Fiche S1 | Fiche S2 |
|---|---|---|---|
| Copie du 10/11 03:05 | 17 (8 / 3 / 0 / 6) | — | — |
| Copies des 11/11, 12/11, 13/11 et 14/11 03:05 | 42 (13 / 3 / 11 / 15) | 18 dès le 12/11 (17 boîtes + 1 page ajoutée) | 3 dès le 13/11 |
| Cloud (14/11, ~17:00) | 42 | 18 | 7 |
| Mac (14/11 16:52) | 42 | 18 | 6 |

Pour chaque annotation (id stable), j'ai comparé la page, le type, le texte et la date de modification :

- **Annotations présentes dans une ancienne version et absentes aujourd'hui : 0.**
- **Textes raccourcis ou vidés : 0.**
- **Fiche S2 :**
  - 3 boîtes du 12/11 : « 3 formes de glandes endocrines… », « En amas… », « En cordons… » ;
  - 3 boîtes écrites aujourd'hui sur le Mac entre 15:03 et 15:18 : « Acini », « endocrine », « Cellule endocrine = cellule plutôt cubique… » ;
  - 1 boîte écrite après la copie du Mac (cloud, 15:56 UTC).
- **Journal du Mac d'aujourd'hui :**
  - chaque lettre tapée dans la fiche S2 est retrouvée, dans l'ordre (« A », « Acin », « Acini cé », « Acini »…) ;
  - les derniers états de chaque boîte sont ceux d'aujourd'hui.

### 1.4 Ce qui a été supprimé entre deux sauvegardes

Ces boîtes ont été créées puis supprimées entre deux copies nocturnes. On ne connaît ni leur texte ni leur position :

- une tombstone ne garde aucun contenu ;
- le journal du Mac ne remonte qu'au 13/11 16:47, et les tables compactées ne gardent plus les versions supprimées.

Le document de chacune est déduit des annotations créées à la même minute.

| Document | Suppressions | Durée de vie |
|---|---|---|
| Original, 09/11 | 5 | 0 à 6 s pour 4 d'entre elles ; **une de 24 min** (créée 14:23:33, supprimée 14:47:28) |
| Original, 10/11 | 3 | 0 à 1 s |
| **Fiche S1, 11/11** | 11 | 0 à 2 s pour 9 d'entre elles ; une de 10 s ; **une de 90 s** (créée 11:24:26, supprimée 11:25:56) |
| **Fiche S2, 14/11** | 2 | 0 à 2 s |

Le détail des deux suppressions de la fiche S2, vu dans le journal du Mac :

- une boîte **vide** et une **image**, posées à la même milliseconde ;
- toutes deux retirées en 1 à 3 s ;
- c'est un collage annulé ; il ne contenait aucun texte.

Une suppression de 0 à 2 s correspond au mécanisme « boîte vide retirée » : une boîte créée puis quittée sans rien écrire disparaît d'elle-même. Les deux suppressions plus longues (24 min le 09/11, 90 s le 11/11) ont été faites **par une action dans l'app**, puisqu'une tombstone a été écrite. Trois actions sont possibles :

- une suppression ;
- un ⌘Z ;
- la gomme.

Je ne peux pas savoir laquelle, ni ce qu'elles contenaient.

**Autres documents.** Dans 3 documents, le nombre d'annotations est sous son maximum historique : « Logique 2 », « Notes cours 3 » et « Complet Axe 1 ». Chaque fois, ce sont des suppressions enregistrées (tombstones) : suppression d'une fiche jumelle (avec putBackup), gomme, page ajoutée retirée.

Les 45 « textes raccourcis » des autres documents sont des **reformulations** (du `**gras**` devenu du vrai gras, des phrases réécrites dans « Articulation du genou » et « Muscles de la cuisse »), pas des pertes.

**Sauvegarde quotidienne.** Elle contient bien toutes les annotations. Les 3 837 lignes du cloud antérieures à la copie du 14/11 y sont toutes, avec le même état.

### 1.5 Causes possibles de perte, vérifiées une par une

| Hypothèse | Verdict |
|---|---|
| Enregistrement différé perdu à la fermeture ou au changement de page | **Faille réelle.** Le texte d'une boîte n'était écrit qu'après **400 ms sans frappe**. Une frappe continue repoussait l'écriture indéfiniment. Rien n'était vidé à la mise en arrière-plan ni à la fermeture : fermer l'onglet dans ces 400 ms perdait la fin du texte. **Corrigé** (§ 2). |
| Création et première lettre qui se croisent | **Faille réelle, découverte par le banc.** Taper juste après avoir créé une boîte : l'écriture « boîte vide » de la création pouvait finir *après* celle de la lettre et l'effacer. **Corrigé** : les écritures d'un même enregistrement s'appliquent dans l'ordre demandé. |
| Annuler (⌘Z) | **Faille réelle.** ⌘Z hors d'une boîte annulait sa *création*, donc la retirait avec le texte tapé depuis. ⌘⇧Z la remettait **vide** (l'instantané de la création). De même, annuler un déplacement remettait le texte d'avant ce déplacement. **Corrigé** : l'annulation garde toujours le texte le plus récent. |
| Écriture locale échouée sans message | Possible : `put()` ne vérifiait rien, et le tableau avalait les erreurs (`.catch(() => {})`). Aucune trace dans les données. **Corrigé** : écriture relue, réessayée, erreur affichée. |
| Conflit de synchro : une version ancienne écrase la récente | Non constaté. Le Mac et le cloud sont identiques, et aucune version écrasée n'apparaît dans les 36 copies. Désormais, la version écartée est gardée dans l'historique. |
| Nettoyage v2 ou migration | Non. Aucune suppression n'a la signature d'un traitement de masse sur ces documents. |
| Changement d'identifiant de page | Non. Pages et espaces de noms sont stables dans toutes les versions. |
| Suppression par toi | Les 21 suppressions du § 1.4 sont des actions de l'app ; 19 concernent des boîtes vides. |

**Conclusion.** Rien de ce qui a été enregistré n'a disparu. Si des boîtes ont été perdues, elles ne sont jamais arrivées dans IndexedDB (texte tapé puis onglet fermé ou mis en arrière-plan dans la seconde), ou elles ont été retirées par ⌘Z / ⌘⇧Z. Les deux chemins sont maintenant fermés.

### 1.6 Captures (données réelles, hors dépôt)

Elles sont rangées **hors du dépôt public**, dans `…/Projets/My Org/captures-privees-boites/` :

- `S2-page25-aujourdhui.png` : la fiche S2, page 25, telle qu'elle est aujourd'hui (copie restaurée) ;
- `S2-page25-version-sauvegarde-13-11.png` : la même page dans l'historique, version « Retrouvée dans la sauvegarde du 13/11/2026 » (3 boîtes, aujourd'hui 6).

La version la plus complète est celle d'aujourd'hui : aucune version plus ancienne ne contient une boîte de plus.

## 2. Enregistrement incassable

**Un seul moteur**, `lib/enregistrement.js`. Toutes les écritures des stores « document » passent par `put`/`putMany`/`remove` de `lib/storage.js`, qui délèguent au moteur. Ces stores sont :

- `annotations` et `highlights` : PDF, fiche jumelle, document créé dans l'app ;
- `board` : tableau ;
- `notes_doc` et `docs`.

Pour chaque écriture :

1. **ordre garanti** par enregistrement ;
2. écriture IndexedDB, puis **relecture**. C'est « confirmé » seulement si on relit exactement la version écrite ;
3. échec : **3 essais**, puis **erreur persistante**, avec un message au-dessus du document (« Modification non enregistrée sur cet appareil… »). L'erreur ne s'efface qu'à la prochaine écriture réussie ;
4. mise en file d'envoi `medrevise-outbox` (IndexedDB), attendue. Une écriture n'est jamais comptée « envoyée » avant d'être dans la file.

**Délais de frappe.** Une boîte, un texte libre, une page de document ou une note :

- la **1re frappe est écrite aussitôt** ;
- les suivantes sont regroupées au plus toutes les **200 ms** (150 ms dans les documents).

Mesuré : médiane 120 ms et maximum 231 ms entre la frappe et IndexedDB, sondage compris.

**Écriture immédiate aussi :**

- à la perte de focus ;
- au changement de page ou de document ;
- à `visibilitychange` (arrière-plan) ;
- à `pagehide` et à `beforeunload`.

Les éditeurs s'inscrivent pour cela auprès du moteur (`inscrireVidage`).

**Fermeture.** L'avertissement du navigateur n'apparaît **que** si une écriture locale n'est pas finie.

**Stockage persistant.** `navigator.storage.persist()` est demandé au démarrage, et le résultat est noté dans `meta.stockagePersistant`.

- Dans Chrome headless (banc), le navigateur l'accorde selon l'usage du site.
- Sur ton Mac (Aside) et sur l'iPad, le résultat sera lisible dans `meta` après la première ouverture.
- Je ne l'ai pas lu sur tes appareils, puisque je n'ai pas ouvert l'app réelle.

**Envoi au serveur.** C'est le chemin normal. Au retour du réseau, la file part tout de suite : le moteur appelle `flushOutbox` sur `online`.

**Conflits : rien n'est jeté.**

- Avant que la synchro remplace ou supprime une annotation locale, ou qu'un autre onglet l'écrase, le document est photographié dans l'historique : « Avant synchro (version non retenue) », « Version d'un autre onglet (non retenue) ».
- Une suppression venue d'un autre appareil est aussi notée au registre.

**Indicateur**, un seul calcul (`etatEnregistrement`) :

| État | Quand |
|---|---|
| « Enregistré et envoyé » | Écriture confirmée et plus rien dans la file |
| « Enregistré sur l'appareil » | Écriture confirmée, envoi en cours, ou synchro non configurée |
| « En attente d'envoi » | Hors ligne, ou dernier envoi refusé ou échoué |
| « Erreur » | Écriture locale impossible |
| « Enregistrement… » | Seulement si une écriture dure plus de 400 ms |

L'indicateur est dans la barre du PDF, de la fiche jumelle et du document, et dans celle du tableau. Son infobulle donne le détail, et un clic ouvre l'historique.

**Garde-fou.** À l'ouverture d'un document, l'app compare avec sa version précédente. Les annotations absentes **sans suppression enregistrée** sont signalées. Le registre est local et alimenté par toute suppression de l'app et par chaque tombstone reçue. Le bandeau dit « N boîtes ont disparu de ce document… Rien n'a été modifié », avec deux boutons : « Voir l'historique » et « Ne plus signaler ». L'alerte reste tant qu'elle n'est pas traitée.

**Sauvegarde GitHub.** Elle contient déjà toutes les annotations : 3 837 lignes sur 3 837, vérifié au § 1.4. Rien n'a été ajouté.

### Performance (avant = 7048c82 sur :5304, après = :5303)

Le scénario est le même pour les deux : document de 40 pages et 34 boîtes, 150 caractères tapés à 40 ms d'intervalle, 3 essais (`scripts/tests-enregistrement/t-performance.mjs`).

| Mesure | Avant | Après |
|---|---|---|
| Ordinateur : images > 16,7 ms | 0,09 % (max 33 ms) | **0 %** (max 16,8 ms) |
| Ordinateur : calcul par frappe | 10,35 ms | 10,34 ms |
| Tablette : images > 16,7 ms | 0 % | 0,19 % (max 33 ms) |
| Tablette : calcul par frappe | 10,11 ms | 10,11 ms |
| **Processeur ralenti ×4** : images > 16,7 ms | 10,0 % | 10,2 % |
| Processeur ralenti ×4 : calcul par frappe | 31,3 ms | 31,8 ms |

Une première version coûtait plus cher au ×4 : 38,9 ms par frappe et 18 % d'images lentes. Deux correctifs ont ramené ce coût au niveau d'avant :

1. la Bibliothèque relisait tout le store des annotations toutes les 700 ms pendant la frappe. Elle attend maintenant une pause de 1,5 s (`lib/datesFiches.js`) ;
2. l'indicateur ne passe à « Enregistrement… » que si l'écriture dure plus de 400 ms, et il n'est jamais redessiné quand rien ne change.

## 3. Historique des versions

On l'ouvre par le menu **Fichier › Historique…** (chaque document : diapo, fiche, document créé dans l'app), par l'indicateur, ou par l'alerte. Le code est dans `pdf/HistoriqueDoc.jsx` et `lib/historiqueDoc.js`.

**La liste** donne pour chaque version :

- la date et l'heure ;
- la raison ;
- les comptes : boîtes, surlignages, traits, formes, images, pages ajoutées ;
- une pastille « N absents aujourd'hui ».

**L'aperçu** montre une page de la version en **lecture seule** : fond PDF rendu par pdf.js, boîtes avec leur texte, traits, surlignages. Les éléments absents aujourd'hui sont cerclés en teal.

**Deux actions**, et chacune crée des versions avant et après, avec un putBackup avant :

- **« Récupérer les boîtes manquantes (N) »** ajoute seulement les absentes. Les autres ne sont pas touchées (vérifié par empreinte).
- **« Restaurer cette version »** demande une confirmation et garde d'abord la version actuelle (« Avant restauration ») : restaurer celle-ci annule la restauration.

**Quand une version est gardée :**

- au moins toutes les 5 min d'édition ;
- à l'ouverture et à la fermeture ;
- avant et après toute restauration ou récupération ;
- avant toute version écartée par un conflit ;
- jamais deux fois à l'identique (empreinte).

Les versions sont conservées **60 jours**, dans le store local `versions_doc`, sans synchro, donc absentes du cloud et du build.

**Espace.** Sur tes données, les annotations d'un document pèsent 12 Ko en médiane, 74 Ko pour l'original glandulaire et 236 Ko au plus. Une heure d'édition donne une quinzaine de versions, soit environ 1 Mo pour un gros document. Compte au plus quelques dizaines de Mo sur 60 jours d'usage intensif. L'espace utilisé est affiché au bas de la fenêtre Historique.

**Versions retrouvées.** J'ai choisi le chemin le plus simple et le plus robuste, sans toucher à tes données depuis ici :

- à la première ouverture de l'Historique d'un document (une fois par lancement de l'app), l'app lit **les copies GitHub** via la nouvelle route `POST /api/backup-versions { ns }`. La route est en lecture seule, garde le jeton côté serveur et est protégée comme les autres. Elle lit les 14 dernières copies et garde une version par contenu distinct ;
- l'app lit aussi **les sauvegardes locales `putBackup`** qui contiennent ce document ;
- elle les ajoute à l'historique **en ajout seul**, de façon idempotente (id `gh:<commit>` ou `loc:<clé>`), avec un putBackup de la liste avant ;
- elles portent la mention « Retrouvée dans la sauvegarde du <date> ». Une sauvegarde locale partielle ne permet que la récupération, pas la restauration.

Vérifié sur le vrai dépôt, en lecture seule (uniquement des GET, ~22 s par document) :

- original : 2 versions (copies du 10/11 et du 11/11) ;
- fiche S1 : 1 version (12/11) ;
- fiche S2 : 1 version (13/11).

Elles s'ajouteront d'elles-mêmes à l'historique de chaque appareil à la première ouverture de « Historique… ».

## 4. Tests

Le banc `scripts/tests-enregistrement/` utilise uniquement des données de test : faux Supabase, faux GitHub, Chrome headless aux profils neufs. Pour tout rejouer : `tout.sh`.

| Test | Ordinateur | Tablette tactile (stylet) | Téléphone |
|---|---|---|---|
| Un caractère tapé, onglet **fermé 100 ms après** : il est là à la réouverture (3/3 à chaque fois) | ✅ | ✅ | — (pas de lecteur) |
| Frappe continue : chaque caractère est dans IndexedDB en moins de 300 ms | ✅ | ✅ | — |
| Hors ligne : écrire, recharger hors ligne, tout est là, « En attente d'envoi », la file a survécu ; retour en ligne : envoyé, « Enregistré et envoyé » | ✅ | ✅ | ✅ (file d'envoi) |
| Refus du serveur, puis panne réseau (503) : jamais « envoyé », rien perdu en local, réparé : envoyé | ✅ | ✅ | — |
| Écriture locale impossible (IndexedDB refuse) : message visible et persistant, effacé par l'écriture suivante, rien perdu | ✅ | ✅ | — |
| Avertissement de fermeture : jamais au repos, oui pendant une écriture | ✅ | ✅ | — |
| Conflit entre deux onglets : la version non retenue est dans l'historique | ✅ | ✅ | — |
| Annotation effacée hors de l'app : alerte « 1 boîte a disparu de ce document », rien restauré tout seul | ✅ | ✅ | — |
| Historique : copie GitHub « Retrouvée… », aperçu, « Récupérer » n'ajoute que l'absente, « Restaurer » puis « Avant restauration » annule | ✅ | ✅ | — |
| Non-régression : crayon, surligneur, gomme, forme, texte libre, ⌘Z/⌘⇧Z, menu Fichier, fiche jumelle, tableau, synchro « Enregistré et envoyé » | ✅ | ✅ | — |
| Réception des annotations des autres appareils, texte identique au serveur ; séance de flashcards (réponse journalisée) | — | — | ✅ |
| MealWeek : capture identique octet pour octet, ancien et nouveau code, aucune erreur console | ✅ | | |
| Aucune erreur console | ✅ | ✅ | ✅ |

Autres vérifications :

- Vitest : 12 tests ajoutés (`tests/enregistrement`), qui couvrent le moteur, l'historique, l'annulation sans perte et la route en lecture seule. **273 réussis sur 275** ; les 2 échecs (crayon, timetable) existaient avant ce chantier.
- `npm run build` : vert.
- `git diff` sur `src/mealweek` et `src/shared` : vide.

Captures (données de test) dans `docs/img/boites-sauvegarde/` :

- indicateur ;
- hors ligne ;
- envoyé ;
- refus du serveur ;
- erreur d'écriture ;
- alerte ;
- historique, avant et après récupération ;
- fiche jumelle ;
- tableau ;
- téléphone ;
- MealWeek avant et après.

## 5. Ce qui n'a pas été fait, et les limites

- **Aucune migration SQL** : l'historique est local, la file d'envoi existait déjà.
- L'historique est **par appareil**. Les versions du Mac ne sont pas sur l'iPad, mais les copies GitHub, elles, sont visibles partout.
- Le téléphone n'a pas d'éditeur de documents : il n'a donc ni indicateur ni historique visibles.
- Le « hors ligne » du banc bloque le serveur de synchro et force `navigator.onLine` à faux. Le serveur de développement doit rester joignable pour pouvoir recharger la page.
- Le contenu des boîtes supprimées entre deux sauvegardes avant ce chantier est irrécupérable. Désormais, une version toutes les 5 min d'édition et à chaque fermeture le conserve.

## 6. Commits

Voir `git log` : `feat(medrevise)` (moteur, historique, route), `test(medrevise)` (bancs et tests unitaires), `docs(medrevise)` (ce compte rendu).
