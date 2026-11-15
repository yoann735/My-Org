# Compte rendu — Mode file d'attente (15/11/2026)

Un mode activable (Réglages → Planification) qui met le planning des flashcards **en pause** les jours où l'on ne
révise pas : les révisions oubliées ne s'empilent plus en retard, elles passent dans l'ordre, un jour de cartes après
l'autre. Livré, testé dans Chrome (ordinateur, tablette tactile, téléphone) sur données de test, commité et poussé.

Règles respectées :
- MealWeek et `src/shared/` non modifiés : `git diff 481184d -- src/mealweek src/shared` est vide ; MealWeek build et s'affiche à l'identique (§ 7).
- Aucune carte écrite par le mode : ni `dueDate`, ni état FSRS, ni journal. Seul l'enregistrement de réglages
  `prompts/fileAttente` est écrit, avec `putBackup` avant chaque écriture.
- Le module `scheduler/` (prévisualiser, appliquer, reconstruire) n'a pas changé : `git diff 481184d -- src/medrevise/scheduler` est vide.
- Le mode Apprentissage (`apprentissageLibre/`), le compteur de vues (`lib/vuesCartes.js`), les Nouvelles et le journal n'ont pas changé (diff vide).
- Aucune écriture Supabase : tous les tests tournent sur un Vite local et sur un faux Supabase local (:54409).

Lu avant de commencer (et réutilisé, sans dupliquer) :
- `docs/compte-rendu-seance-categories.md` : catégories Nouvelles, Révisions et Retard, et maximum par type (`lib/categoriesFC.js`).
- `docs/diagnostic-retard-26.md` : bascule à 4 h, compteurs calculés avant la synchro, `appliquerJournalAuxCartes`.
- `docs/fsrs-etape2-compte-rendu.md` : jours civils à Bruxelles (`scheduler/jours.js`).

---

## 1. La règle exacte de `dateEffective`

Une seule fonction décide si une carte est due : `dateEffective(carte)`, dans `src/medrevise/lib/planning.js`.
`nextDate` en est l'ancien nom, gardé comme alias. C'était déjà le seul point de lecture de `dueDate`. Tous les écrans
passent donc par cette fonction :
- séance (Retard et Révisions, `categoriser`, composition, reprise) ;
- compteurs (lanceur, barre latérale, hub) ;
- calendrier (`dueOn`, `weekData`) et retard (`overdueQuestions`, `overdueByFiche`) ;
- listes et infobulles de l'arbre (Réviser) ;
- prévisions (`prochaineSeance`, charge FSRS) et export de diagnostic.

```
dateBase(carte)      = la date d'avant le chantier : dueDate, « Sauter » (skippedOn), conversion ; null pour une Nouvelle ou une carte terminée
dateEffective(carte) = dateBase(carte) + nombre de jours en pause STRICTEMENT APRÈS le jour de la dernière révision de la carte
```

- **Jour de la dernière révision** : la date de la dernière note (`historique[].date`) ou du passage en révision
  (`nouvellePasseeLe`), en prenant la plus récente des deux. Une carte jamais revue est décalée par tous les jours en pause.
- Seules les **flashcards** sont concernées (la séance du jour). Les Nouvelles n'ont pas de date et ne sont jamais concernées.
- **Mode désactivé**, ou aucun jour en pause : `dateEffective === dateBase`, c'est-à-dire exactement l'ancien calcul.
- **Retard** = `dateEffective < aujourd'hui` ; **Révisions** = `dateEffective = aujourd'hui`. Ordre : `dateEffective`
  croissante. À date égale, la date de base la plus ancienne passe d'abord (`departageFile`) : c'est ce qui fait passer
  en premier le reste d'une journée non finie. Les cours restent entrelacés à l'intérieur d'un même paquet. Quand le
  mode est désactivé, aucun départage n'est passé : l'ordre reste celui d'avant.
- Le badge « J+N » des cartes affiche l'intervalle (`intervalDays`), pas une date : il ne change pas.

### Jours en pause (`lib/fileAttente.js`, fonctions pures)

- **Clôture** (`cloturerJours`) : elle tourne à chaque ouverture, après une passe de synchro aboutie (`ajour`,
  `incomplet`) ou sans cloud (`local`). Elle examine chaque journée terminée depuis `verifieJusquau`, dans l'ordre,
  jamais aujourd'hui et jamais avant l'activation. Si des flashcards datées avaient, avec les pauses déjà connues, une
  `dateEffective` égale à ce jour, ce jour devient un jour en pause. Ensuite, les jours en pause qui ne décalent plus
  aucune carte sont retirés (`elaguer`). Le calcul est déterministe : le même état des cartes donne le même résultat, et
  une deuxième ouverture n'écrit rien.
- La « journée » suit la bascule à 4 h, fuseau Europe/Brussels (`jourDeRevision`).
- **Décalage affiché** = nombre de jours en pause qui décalent encore au moins une carte.
- **Activation** : les jours de la date de reprise choisie jusqu'à hier deviennent des jours en pause, et `verifieJusquau` vaut hier.
- **« Faire le paquet suivant »** retire le jour en pause le plus récent.
- **Désactivation** : la liste est vidée et `actif` passe à false.

## 2. Où sont stockés les jours en pause

Le mode est stocké dans l'enregistrement `prompts/fileAttente` de l'IndexedDB locale (`lib/storage.js`
`getFileAttente` / `setFileAttente`). C'est la même mécanique que les réglages `reglagesFC` :

- le store `prompts` est déjà synchronisé : l'enregistrement part dans `medrevise_records` comme les autres réglages,
  avec la règle « la dernière écriture gagne » ;
- c'est un ajout pur : rien n'est retiré ni réécrit ailleurs ;
- **aucune migration SQL n'est nécessaire, et aucune n'a été préparée.**

```json
{ "id": "fileAttente", "actif": true, "pauses": ["2026-11-17", "2026-11-18"], "activeLe": "2026-11-16", "verifieJusquau": "2026-11-20", "updatedAt": "…" }
```

L'état précédent part dans `backups` (`pre-fileAttente-<horodatage>`) avant chaque écriture. Sans cloud, l'app
fonctionne entièrement en local.

## 3. Interface

- **Réglages → Planification** (`components/ReglagesFileAttente.jsx`) : interrupteur « Mode file d'attente » et une
  phrase d'explication. Une fois le mode actif, la carte affiche « Actif depuis le … · N j de décalage sur ton planning ».
- **Feuille d'activation** :
  - la phrase « Ton plus vieux retard date du <date> → N j de décalage » ;
  - une bande de jours (pastilles au style de l'app, infobulle sur chacune), du plus vieux retard jusqu'à aujourd'hui ;
  - un aperçu des 7 prochains jours (colonnes Retard, Révisions, Total) mis à jour en direct, avec la mention « Les
    nouvelles cartes ne sont pas concernées » ;
  - le bouton « Activer ». Rien n'est écrit avant ce bouton.
- **Désactivation** : la confirmation « X cartes vont repasser en retard. Désactiver ? ».
- **Séance** (`SeanceAujourdhui`, sur l'accueil du téléphone et dans Réviser) :
  - la ligne discrète « N j de décalage sur ton planning » ;
  - à partir de 5 j, la même ligne en orange (`var(--warn)`) avec « Pense à rattraper avant les examens » ;
  - le bouton « Faire le paquet suivant », visible seulement quand Retard et Révisions sont finies et que le décalage est positif.
- DA existante : jetons de couleur de l'app, transitions de 120 ms, pas de rebond, pas de case à cocher native (pastilles et interrupteur maison).
- Le téléphone n'a pas d'écran Réglages : on y voit la ligne de décalage, l'alerte et le bouton. L'activation se fait
  sur l'ordinateur ou la tablette, puis la synchro l'apporte au téléphone.
- Hub : le compteur « N cartes à réviser » charge l'état du mode avant son calcul (`src/Selecteur.jsx`, 2 lignes), pour garder un seul calcul de date.

## 4. Tests

Tous les tests utilisent des **données de test**, sur des profils Chrome neufs, jamais les vraies données.
- Ordinateur : 1 440 × 900, souris.
- Tablette : iPad 820 × 1 180, tactile.
- Téléphone : 390 × 844, tactile.

L'horloge est **simulée dans la page** : `Date` est décalé avant le chargement de l'app, et l'heure de la machine n'est
pas touchée. Chaque « jour » recharge l'app à 10 h (heure de Bruxelles).

Les séances testées se font **à l'écran** : on touche la carte, puis on la note avec les boutons. Les journées
simplement « faites » autour du point testé passent par le même chemin que l'app (`scheduler/repondre.js`, journal compris).

Serveurs : Vite :5310 (sans cloud), Vite :5311 avec le faux Supabase :54409 (configurations `fa-local`, `fa-cloud` et
`fa-faux-supabase` de `.claude/launch.json`), et le code d'avant sur :5312 (`git archive 481184d`). Attention : deux
Vite lancés dans le même dossier partagent `node_modules/.vite`, ce qui peut charger deux copies de React. Donner à
chaque Vite un `cacheDir` séparé.

Bancs : `scripts/tests-file-attente/` (`t-scenarios.mjs ordi|tablette|tel`, `t-deux-appareils.mjs`,
`t-avant-apres.mjs`, `t-mealweek-apprentissage.mjs`). Résultats détaillés dans `scripts/tests-file-attente/resultats/*.json`.
Tests purs : `tests/fileAttente/fileAttente.test.js` (14 tests).

### 4.1 Scénarios du cahier des charges

| Test | Ordinateur | Tablette | Téléphone |
|---|---|---|---|
| **20 révisions/jour, mardi et mercredi oubliés.** Lundi : séance à l'écran (20). Jeudi : mardi et mercredi sont mis en pause ; Révisions 20 = les 20 cartes de mardi, Retard 0 ; ligne « 2 j de décalage sur ton planning » ; séance à l'écran = cartes de mardi. Vendredi = les cartes de mercredi. Samedi = les cartes de jeudi. Décalage 2 j. | 14/14 ✅ | 14/14 ✅ | 13/13 ✅ |
| **Activation : 100 retards sur 3 jours (30, 30, 40) + 50/jour.** Date proposée : mardi 17 novembre, « → 3 j de décalage » ; choix du 17 à aujourd'hui ; aperçu 30, 30, 40, 50, 50, 50, 50 (Retard 0). Date plus récente (le 19) : aperçu mis à jour en direct, Retard 60 + Révisions 40 aujourd'hui. Après « Activer » : Retard 60 (cartes du 17 et du 18), Révisions 40, pause le 19, décalage 1 j. Rien n'est écrit avant « Activer ». | 9/9 ✅ | 9/9 ✅ | — (pas d'écran Réglages) |
| **Carte notée « À revoir » pendant le mode.** `dueDate` réelle = demain ; le lendemain, la carte est là, même si la journée a été mise en pause. | 4/4 ✅ | 4/4 ✅ | 4/4 ✅ |
| **Deux trous successifs (2 j puis 3 j).** Décalage 5 j ; ligne orange « Pense à rattraper avant les examens » (couleur `var(--warn)`, rgb(255, 154, 60) en thème sombre) ; le mardi 24 = cartes du jeudi 19, le mercredi 25 = cartes du vendredi 20. | 5/5 ✅ | 5/5 ✅ | 5/5 ✅ |
| **Journée à moitié faite** (10/20 à l'écran). Le lendemain, la journée est en pause et les 10 restantes arrivent ; elles passent en premier dans la séance. | 4/4 ✅ | 4/4 ✅ | 4/4 ✅ |
| **« Faire le paquet suivant ».** Absent tant qu'il reste des révisions. Apparaît quand Retard et Révisions sont finies (les Nouvelles peuvent rester). Après un clic : décalage 3 → 2 j, et les 6 cartes du jour suivant apparaissent tout de suite. | 4/4 ✅ | 4/4 ✅ | 4/4 ✅ |
| **Désactivation.** Message « 30 cartes vont repasser en retard. Désactiver ? ». Après confirmation : Retard 30, Révisions 10, les mêmes chiffres qu'avant l'activation ; l'écart vaut exactement le nombre annoncé ; liste vidée. | 4/4 ✅ | 4/4 ✅ | — (pas d'écran Réglages) |
| **Non-régression avec le mode actif.** Révisions max 5 + Nouvelles (6) → 11 cartes ; boutons « Garder en nouvelle / Passer en révision » inchangés ; « Garder » laisse la carte intacte ; « Passer » donne J0 = aujourd'hui et une échéance demain (réelle). | 4/4 ✅ | 4/4 ✅ | 4/4 ✅ |
| Erreurs console | 0 | 0 | 0 |

Au téléphone, il n'y a pas d'écran Réglages. Le mode y est donc activé par la même écriture que le bouton « Activer »
(`setFileAttente(etatActivation(…))`). Tout le reste, séance, ligne de décalage, alerte et bouton, est testé à l'écran.

### 4.2 Instantané : aucune carte modifiée, journal aux vraies dates (scénario 1, ordinateur, tablette et téléphone)

- **220 cartes non révisées** : aucune n'a changé. Comparaison JSON complète avant et après : `dueDate`, `fsrs`, `historique`, `updatedAt`.
- **Journal** : 60 entrées, aux vraies dates. Les cartes de lundi sont notées `jour: 2026-11-16`, celles de mardi,
  vues jeudi, sont notées `jour: 2026-11-19`. Ce ne sont pas des dates décalées.
- **Planificateur** : les cartes vues jeudi ont `historique` daté du 19, et leur prochaine date est calculée à partir
  du 19. FSRS et le planificateur maison reçoivent donc la vraie date.

### 4.3 Ouverture après 4 jours sans ouvrir l'app, sur 2 appareils synchronisés

`t-deux-appareils.mjs` : faux Supabase local, A = ordinateur, B = tablette.

| Étape | Résultat |
|---|---|
| Lundi : A active le mode à l'écran et fait 6 cartes sur 15. B ouvre et reçoit le mode et les cartes par la synchro (9 restantes). | ✅ |
| Mardi → vendredi : l'app n'est ouverte nulle part. | — |
| Samedi : **B ouvre en premier**. Jours en pause : `16, 17, 18, 19, 20` (lundi, pas fini, puis mardi → vendredi). File : les 9 cartes restantes du lundi. | ✅ |
| Samedi : A ouvre ensuite. Mêmes jours en pause, même décalage (5 j), même file (Retard et Révisions). **A ne réécrit rien** : `updatedAt` reste celui de B, son calcul est identique. | ✅ |
| 5 ouvertures de plus sur chaque appareil : aucun changement (idempotent). | ✅ |
| Écrans A et B identiques : Révisions 9, « 5 j de décalage sur ton planning · Pense à rattraper avant les examens », en orange. | ✅ |
| Erreurs console | 0 |

Total : 10/10 ✅.

### 4.4 Mode désactivé = comportement d'avant (comparaison sur la même copie de données)

`t-avant-apres.mjs` compare deux versions du code sur un jeu de 283 cartes, au même jour simulé (20/11). Le jeu
contient des retards sur 12 jours, des révisions, un futur de 40 jours, 14 Nouvelles, une carte sautée, une carte
terminée et un QCM. Les deux versions :
- le code **d'avant le chantier** (`git archive 481184d`, servi sur :5312) ;
- le code **d'après**, d'abord sans le mode, puis avec un enregistrement du mode activé puis désactivé.

| Comparé | Résultat |
|---|---|
| File : Retard (63, ordre compris), Révisions (3), Nouvelles (14, ordre compris) | identique ✅ ✅ |
| Dates des 283 cartes (`nextDate`) | identiques ✅ ✅ |
| Calendrier sur 35 jours (`dueOn`), retard (`overdueQuestions`), `dueToday`, plan du jour (66), prochaine séance (21/11) | identiques ✅ ✅ |
| Séances composées (hasard figé) : tout coché (76 cartes) ; max 5/5/15 regroupées par cours (23) | identiques, ordre compris ✅ ✅ |
| Compteurs à l'écran (Retard 63, Révisions 3, Nouvelles 14) | identiques ✅ ✅ |
| Compteur du hub (« 4 cartes à réviser ») | identique ✅ ✅ |

### 4.5 Autres vérifications

- **vitest** : 287 sur 289 réussis. Les 2 échecs existaient avant le chantier (`crayon › trois épaisseurs par mode`,
  `/api/timetable › cache`). Les 14 nouveaux tests du mode passent. Ils simulent jour par jour avec les vrais modules
  et couvrent aussi la bascule à 4 h, la règle « jamais aujourd'hui, jamais avant l'activation », le retrait des jours
  qui ne décalent plus rien et le passage en révision.
- **Build** : `npm run build` passe.
- **MealWeek** : `src/mealweek` et `src/shared` n'ont pas changé. Captures de MealWeek avec le code d'avant et
  d'après, sur la même date et un profil neuf : **identiques à l'octet** (SHA-256 `1fb49787e0459b5e…`), voir
  `docs/img/file-attente/mealweek-avant.png` et `mealweek-apres.png`.
- **Mode Apprentissage** : l'écran s'ouvre avec le mode actif, sans erreur (`apprentissage-mode-actif.png`).
  `apprentissageLibre/` n'a pas changé.
- **Compteur de vues** (`lib/vuesCartes.js`), **journal** (`journal/`) et **scheduler/** : diff vide depuis `481184d`.
- **Synchro** : l'enregistrement voyage par la synchro existante (§ 4.3).

## 5. Captures (`docs/img/file-attente/`)

| Capture | Fichier |
|---|---|
| Feuille d'activation (date proposée, aperçu) | `activation-ordi.png`, `activation-tablette.png` |
| Feuille d'activation après le choix d'une date plus récente | `activation-ordi-date.png`, `activation-tablette-date.png` |
| Séance avec décalage (2 j) | `seance-decalage-ordi.png`, `seance-decalage-tablette.png`, `seance-decalage-tel.png` |
| Carte en séance | `seance-carte-ordi.png`, `seance-carte-tablette.png`, `seance-carte-tel.png` |
| Alerte orange (5 j) | `alerte-ordi.png`, `alerte-tablette.png`, `alerte-tel.png` |
| « Faire le paquet suivant » | `paquet-suivant-ordi.png`, `paquet-suivant-tablette.png`, `paquet-suivant-tel.png` |
| Confirmation de désactivation | `desactivation-ordi.png`, `desactivation-tablette.png` |
| Deux appareils après 4 jours | `deux-appareils-ordi.png`, `deux-appareils-tablette.png` |

## 6. Doutes et décisions prises

- **Pauses de l'activation et cartes revues entre-temps.** La règle « strictement après la dernière révision » est
  appliquée telle quelle. Prenons une carte revue un jour situé entre la date de reprise choisie et hier : elle n'est
  décalée que par les pauses postérieures à ce jour, et elle peut donc tomber le même jour que des cartes plus
  anciennes. Le départage par date de base fait passer les plus anciennes d'abord.
- **« Dues ce jour-là »** veut dire `dateEffective` égale à ce jour. Les vieux retards laissés en Retard à l'activation
  ne font pas, à eux seuls, mettre un jour en pause. Sinon, le décalage grandirait chaque jour sans que rien ne puisse
  l'arrêter.
- **Le décalage reste affiché tant qu'une carte est encore décalée.** Exemple : une carte d'intervalle 30 jours revue
  avant la pause garde le jour en pause « vivant » jusqu'à sa révision. C'est la règle demandée (« jours qui décalent
  encore au moins une carte »). « Faire le paquet suivant » permet de le réduire.
- **Bascule à 4 h.** Les journées en pause suivent la journée de révision (4 h, Bruxelles). Les compteurs de l'app,
  eux, utilisent toujours `todayISO()`, c'est-à-dire minuit. C'est l'incohérence déjà relevée dans
  `docs/diagnostic-retard-26.md`, et elle n'a pas été changée (mode désactivé = identique). Entre 0 h et 4 h, une carte
  de la veille non faite apparaît donc en Retard jusqu'à 4 h, puis la journée est mise en pause à l'ouverture suivante.
- **Hors ligne ou synchro en échec : la clôture attend la prochaine passe aboutie.** Elle ne décide jamais d'un jour en
  pause sur un état incomplet. Sans cela, les réponses d'un autre appareil pas encore reçues donneraient un jour en
  pause de trop (2 appareils = même résultat).
- **Activation au téléphone** : il n'y a pas d'écran Réglages au téléphone. L'activation se fait donc sur l'ordinateur
  ou la tablette, et la synchro l'apporte au téléphone.
- Les QCM et les schémas, qui sont encore datés, ne sont pas décalés : le mode concerne les flashcards de la séance.
- **Accent** : l'app utilise son jeton `var(--accent)`, celui de toute l'interface. Aucune couleur nouvelle n'a été
  ajoutée, hormis l'orange `var(--warn)`, qui existait déjà.
