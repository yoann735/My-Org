# Diagnostic — cohérence de la répétition espacée (MedRevise)

> Analyse seule, aucun fichier de code modifié. Champ : `src/medrevise/`.
> Hiérarchie de données (rappel, `src/medrevise/lib/storage.js:5`) :
> **SOURCE (« cours »)** → **MATIÈRE** → **FICHE** → **QUESTIONS**.

---

## 1. Granularité — où vit l'état SM-2 ?

L'état de répétition espacée (`interval`, `repetition`, `efactor`, `nextReview`,
`historique[]`) est stocké **par QUESTION** dans la très grande majorité des cas,
avec **une exception documentée** pour un seul type de fiche.

- **Cas général (qcm / flashcard)** : chaque enregistrement de la table
  `questions` (IndexedDB, store `medrevise-questions`) porte directement ces
  champs. Créés à l'import par `newQuestion()` / `newItem()` :
  - `src/medrevise/lib/storage.js:144-158` (`newQuestion`)
  - `src/medrevise/lib/storage.js:165-176` (`newItem`)
  ```js
  interval: dueOffset, repetition: 0, efactor: 2.5,
  nextReview: isoDate(d), historique: [], missed: 0,
  ```
  Une fiche n'a **aucun** champ de planification propre pour ces types — elle
  ne fait que grouper visuellement des questions (`matiereId`, `titre`, `coef`,
  `archive`, `rappelsJ`). Voir `src/medrevise/lib/planning.js:213-231`
  (`groupByFiche`) : la fiche n'apparaît que comme conteneur d'affichage.

- **Exception : `anat_schema`**. Pour ce type de fiche (schéma d'anatomie
  visuelle), c'est **la fiche elle-même** qui porte `interval/repetition/
  efactor/nextReview`, commenté explicitement :
  `src/medrevise/lib/planning.js:181-183` :
  ```js
  /* ---- schémas d'anatomie visuelle (anat_schema) : la FICHE elle-même est
     l'item planifiable SM-2 (elle porte interval/repetition/efactor/nextReview),
     pas des questions. */
  ```
  et l'écriture correspondante dans `src/medrevise/session/AnatQuiz.jsx:186-190`
  (`applyReview(fiche, quality, coef)` puis `ctx.saveFiche(updated)`).

- **`sources` et `matieres`** (le « cours » et la « matière ») ne portent
  **aucune** donnée de planning (ni interval, ni nextReview) — seulement
  `coef`, `archive`, `rappelsJ` (activation/pause des rappels). Vérifié par
  grep : ces champs n'apparaissent nulle part sur les objets `sources`/`matieres`
  dans `storage.js`, `import.js`, `MedReviseApp.jsx`.

**Conclusion point 1** : le soupçon « un cours revient à dates fixes » est
inexact au niveau des DONNÉES — il n'existe pas de planning stocké par cours.
Il existe en revanche un effet d'AFFICHAGE par fiche qui peut créer cette
impression (voir point 3 et Verdict).

---

## 2. Ce que fait l'étiquette « difficile / raté / facile »

Chemin complet du clic à l'écriture (cas desktop, `src/medrevise/session/
Session.jsx`, identique en mobile `mobile/MobileSession.jsx` et pour les
exercices `session/Exercice.jsx`) :

1. Clic sur un bouton de `RatingButtons` → `onRate('fail'|'hard'|'easy')`
   (`Session.jsx:390-401`), routé vers `advance(ratingIn)` (`Session.jsx:62`).
2. `resolveRating` normalise en étiquette (`Session.jsx:23`), puis
   `RATING_QUALITY` la convertit en qualité SM-2 numérique
   (`Session.jsx:18` : `fail→1, hard→3, easy→5`, aligné sur
   `QUALITY` dans `sm2.js:12`).
3. `applyReview(item, quality, item._coef || 3)` est appelé
   (`Session.jsx:68`), où `item` est **l'objet question courant** (pas la
   fiche, pas le cours) et `item._coef` vient de `effectiveCoef(ctx.db, f, ix)`
   calculé plus haut (`Session.jsx:35`).
4. `applyReview()` (`sm2.js:119-138`) appelle `sm2()` (`sm2.js:92-116`) qui
   recalcule `interval/repetition/efactor/nextReview`, ajoute une entrée à
   `historique[]`, et mnet à jour `missed` (compteur carnet d'erreurs).
5. Le résultat est persisté par `await ctx.saveQuestion(updated)`
   (`Session.jsx:79`), qui route vers `put('questions', …)`
   (`src/medrevise/lib/storage.js:44-49`) : écriture IndexedDB **horodatée**
   (`updatedAt`) + mise en file de synchro cloud (`queuePush`).

**Réponse à la question posée** : oui, le clic modifie réellement une date de
prochaine révision — celle de LA QUESTION précise qui vient d'être notée, et
uniquement elle. Rien d'autre (fiche, matière, cours) n'est touché par cette
écriture, sauf le cas `anat_schema` où c'est la fiche qui reçoit directement
`applyReview()` (`AnatQuiz.jsx:186-190`).

---

## 3. Qui décide des dates dues — une ou deux sources de vérité ?

**Une seule source de vérité, au niveau question** (ou fiche pour
`anat_schema`) : le champ `nextReview` calculé par `sm2()`. Il n'existe
**aucune** structure de planning séparée « attachée au cours » (pas de
J0/J+3/J+7 stocké sur `sources` ou `matieres`).

Le calcul de « dû aujourd'hui » lit directement ce champ :
- `scheduledQuestions()` filtre les questions de type qcm/flashcard dont la
  fiche est active (`planning.js:67-70`).
- `dueOn(db, dateISO)` compare `q.nextReview` à la date demandée
  (`planning.js:73-81`) :
  ```js
  if (dateISO === today) return q.nextReview <= dateISO;   // aujourd'hui = dû + retard
  if (dateISO < today) return false;
  return q.nextReview === dateISO;                          // jour futur précis
  ```
- `dueToday()` = `dueOn(db, todayISO())` (`planning.js:82`).

Il n'y a donc **pas de double logique au niveau des données**. En revanche il
y a une **double logique d'AFFICHAGE**, et c'est probablement l'origine du
soupçon :

- `J_INTERVALS = [1, 3, 7, 14, 30]` (`sm2.js:9`) est un jeu de **paliers
  d'étiquette** utilisé uniquement pour choisir un LABEL (« J+1 », « J+3»…)
  le plus proche en dessous de l'`interval` réel — voir `jStepForInterval()`
  (`sm2.js:154-162`).
- Ce label est calculé **par fiche** dans `ficheJ()` (`planning.js:200-210`),
  en prenant la question **la plus proche de son échéance** parmi toutes
  celles de la fiche (`soonest = qs.reduce((a,b) => a.nextReview <= b.nextReview ? a : b)`).
- Le calendrier hebdomadaire (`Dashboard.jsx`, fonction `WeekCalendar`,
  `weekData()` dans `planning.js:239-283`) affiche des cases journalières
  peuplées d'entrées **par fiche** (classe CSS `wcal-course`,
  `Dashboard.jsx:117` et `:129`) : `{fiche.titre} {jLabel}`.

Donc : l'utilisateur voit un badge « J+3 » **attaché visuellement à une
fiche/un cours** dans le calendrier, alors qu'en réalité ce badge est dérivé
en temps réel de LA QUESTION la moins avancée de cette fiche. Si la fiche
contient plusieurs cartes à des stades différents, noter une seule carte
« facile » ne fait pas nécessairement bouger le badge affiché (une autre
carte moins avancée continue de tirer l'échéance affichée vers le présent).
Ce n'est pas un bug de calcul — chaque carte progresse bien individuellement
— mais un agrégat d'affichage qui peut donner l'impression que « la note ne
change rien au planning ».

---

## 4. Le J+1 suspect — pourquoi une carte révisée aujourd'hui revient dès demain

Cause exacte : la fonction `sm2()` (`sm2.js:92-116`) implémente l'algorithme
**SM-2 classique** (celui d'Anki/SuperMemo-2), dont la règle standard est :

```js
if (quality >= 3) {
  if (repetition === 0) interval = 1;      // ← 1er succès : TOUJOURS 1 jour
  else if (repetition === 1) interval = 6; // ← 2e succès : TOUJOURS 6 jours
  else interval = Math.round(previousInterval * previousEfactor);
  newRepetition = repetition + 1;
} else {
  newRepetition = 0;
  interval = 1;                            // échec : 1 jour, cycle réinitialisé
}
```
(`sm2.js:95-103`)

Ensuite le coefficient module l'intervalle :
```js
interval = Math.round(interval * (COEF_MULT[coef] ?? 1.0));
if (interval < 1) interval = 1;
```
(`sm2.js:109-110`), avec `COEF_MULT = { 5: 0.6, 4: 0.8, 3: 1.0, 2: 1.2, 1: 1.4 }`
(`sm2.js:8`).

**Le calcul, quel que soit le coef ou la note (« facile » comprise) :**
- 1ère révision réussie d'une carte neuve (`repetition === 0`) → `interval = 1`
  avant coef. Avec coef=3 (défaut) → `Math.round(1 × 1.0) = 1`. Avec coef=5
  (priorité haute, mult=0.6) → `Math.round(1 × 0.6) = 1` (arrondi, plancher
  `interval < 1 → 1`). Avec coef=1 (mult=1.4) → `Math.round(1 × 1.4) = 1`.
  **Dans tous les cas, le premier succès donne `interval = 1`.**
- `nextReview` est ensuite fixé à `aujourd'hui + interval` jours
  (`sm2.js:113-114`) → **demain**, systématiquement.

C'est donc **structurel, pas un bug d'exécution** : le premier succès d'une
carte ne peut jamais produire un intervalle de 3 jours avec cette formule,
quelle que soit la note choisie. Le libellé affiché à ce stade
(`jStepForInterval(1)` → `sm2.js:154-162`) donne d'ailleurs bien « J+1 »
(1 ≥ J_INTERVALS[0]=1, mais 1 < J_INTERVALS[1]=3) — l'étiquette est cohérente
avec l'`interval` réel, ce n'est pas un défaut d'étiquetage. **Le vrai
problème est en amont** : la « méthode des J » telle que documentée/affichée
dans l'app (frise `J_INTERVALS = [1,3,7,14,30]`, terminologie « J0 → J+3 »)
suggère une cadence FIXE à 5 paliers, alors que le moteur réellement branché
est un SM-2 ADAPTATIF dont la vraie séquence (1, 6, puis `round(I×EF)` avec
EF ≈ 1.3–2.6) ne correspond structurellement pas à `[1,3,7,14,30]` — elle ne
tombe sur ces paliers que par coïncidence approximative à partir de la 2e ou
3e répétition.

Ce que ce n'est **pas** (causes écartées après lecture du code) :
- Pas de « Nouveau traité comme dû chaque jour » anormal : une carte neuve a
  `nextReview = aujourd'hui` dès l'import (`newQuestion`/`newItem`, coef
  `dueOffset=0`), ce qui est le comportement attendu (elle doit être vue une
  première fois).
- Pas de réinitialisation à chaque import : `appendItemsToFiche()`
  (`src/medrevise/lib/import.js:60-78`) est un **ajout pur**, dédoublonné par
  `srcId` (`existingSrc`, `import.js:64,70`) — il ne touche jamais l'état
  SM-2 des questions déjà existantes. Recoller le même JSON dans la même
  fiche ignore les items déjà présents (comptés en `duplicates`).
  `createFicheFromQuestions()` (`import.js:31-51`) ne réinitialise que les
  questions d'une **fiche neuve**, ce qui est normal.

---

## 5. À quoi servent les « coef » — branchés ou morts ?

**Branchés et actifs**, avec deux effets concrets distincts :

1. **Modulation de l'intervalle SM-2.** `effectiveCoef(db, fiche, idx)`
   (`planning.js:25-34`) résout le coef effectif par héritage
   `fiche.coef ?? matiere.coef ?? source.coef ?? 3`, lu à chaque notation :
   `Session.jsx:35` (`_coef: effectiveCoef(...)`) puis passé à `applyReview`
   (`Session.jsx:68`, et de même dans `mobile/MobileSession.jsx:26,41`,
   `session/Exercice.jsx:87-88`, `session/AnatQuiz.jsx:188-189`,
   `mobile/MobileExercice.jsx:37,67`). Concrètement, un coef élevé (5,
   matière jugée prioritaire) RACCOURCIT l'intervalle (`COEF_MULT[5]=0.6`),
   un coef faible (1) l'ALLONGE (`COEF_MULT[1]=1.4`) — donc « coef » module
   la fréquence de révision, pas un ordre d'affichage.
2. **Pondération du carnet d'erreurs.** `weakPoints()` (`planning.js:310-324`)
   multiplie le nombre de ratés (`misses`) par le coef effectif pour classer
   les points faibles (`score: e.misses * coef`), affiché dans
   `pages/Carnet.jsx:47` (`×{w.coef}`).

Le coef est réglable par l'utilisateur au niveau matière ou fiche via
`CoefControl` (`components/ui.jsx:673-682`), câblé dans `pages/Reviser.jsx:248`
(matière) et `:278` (fiche, avec bouton de reset vers l'héritage). Les
sources ont un coef par défaut de 3 à la création
(`MedReviseApp.jsx:174,179,236`).

Il n'y a **rien de mort** ici : chaque lecture de `coef`/`effectiveCoef`
correspond à une écriture (SM-2) ou un affichage (Carnet) actifs.

---

## 6. Verdict

**Le retour difficile/raté/facile a-t-il un effet réel et cohérent sur le
planning ?**

- **Effet réel : OUI.** Chaque notation modifie bien, immédiatement et
  durablement (persistance IndexedDB + sync cloud), le `nextReview` de LA
  QUESTION notée, via un unique chemin de calcul (`applyReview` → `sm2()`)
  partagé par toutes les surfaces (desktop, mobile, exercices, schémas).
  Il n'existe pas de second système de planning « par cours » qui
  court-circuiterait ce calcul — le soupçon d'un SM-2 tournant « dans le
  vide » pendant qu'un autre mécanisme déciderait des dates est **infirmé**
  au niveau des données.

- **Effet cohérent avec ce que l'app montre à l'utilisateur : NON, sur deux
  points précis**, qui suffisent à expliquer le symptôme rapporté :

  1. **Incohérence de conception (pas un bug d'exécution)** : la « méthode
     des J » promet une cadence fixe (`J_INTERVALS = [1,3,7,14,30]`,
     terminologie J0/J+3/J+7…) mais le moteur réellement branché est un
     SM-2 adaptatif classique dont le premier succès produit
     TOUJOURS `interval = 1` (jamais 3), quels que soient la note et le
     coef (§4). L'étiquette « J+3 » que l'utilisateur s'attend à voir après
     un premier « facile » n'existe pas dans la vraie séquence de ce moteur
     avant la 2e ou 3e répétition, et encore de façon approximative.
  2. **Agrégation d'affichage par fiche qui masque le mouvement réel**
     (§3) : le badge « J » et les cases du calendrier hebdo montrent une
     fiche entière avec le label de sa carte la MOINS avancée
     (`ficheJ()`/`soonest`). Sur une fiche à plusieurs cartes, noter une
     carte ne fait pas forcément progresser ce badge, ce qui peut donner
     l'impression trompeuse que rien ne change alors que la carte notée a
     bien avancé individuellement.

### Options de correction envisageables (aucune codée)

| Option | Ce qu'elle implique |
|---|---|
| **A. Remplacer le moteur adaptatif par une cadence fixe** alignée sur `J_INTERVALS` (J0→J+3→J+7→J+14→J+30, modulée par coef/qualité au lieu du calcul EF) | Réécriture de `sm2()` ; redéfinir ce que fait « difficile » dans un cycle à paliers fixes (reculer d'un palier ? rester ?) ; migration des cartes déjà en cours de cycle (interval/efactor existants). Correction de fond, gros impact. |
| **B. Garder SM-2 tel quel, corriger l'affichage** : montrer l'intervalle réel en jours (« +1 j », « +6 j », « +15 j ») plutôt qu'un label à 5 paliers approximatif | Change `jStepForInterval`/l'UI seulement ; aucun impact sur le moteur ; supprime l'incohérence perçue en cessant de promettre une cadence qui n'est pas celle réellement appliquée. |
| **C. Afficher le J au niveau CARTE dans les vues qui listent des fiches** (ou au minimum un sous-compteur « 3/8 cartes encore à J+1 ») au lieu du badge unique dérivé de la carte la moins avancée | Change `ficheJ()`/`groupByFiche()` et les composants d'affichage (`Dashboard.jsx`, `Reviser.jsx`, `MobileHome.jsx`) ; rend visible l'effet d'une notation individuelle même si la fiche reste globalement « en retard ». |
| **D. Ne rien changer côté moteur, documenter clairement** que `J_INTERVALS` n'est qu'un repère visuel approximatif et que le moteur réel est un SM-2 adaptatif classique | Traite le problème comme un défaut de communication (CLAUDE.md / tooltip UI), pas de logique ; le plus rapide, mais ne résout pas la frustration si l'utilisateur veut réellement une cadence fixe J0/J+3/J+7. |

Ces options ne s'excluent pas : B+C sont cumulables sans toucher au moteur ;
A est la seule qui changerait le comportement de fond de la répétition
espacée.
