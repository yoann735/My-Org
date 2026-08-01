# Audit — méthode des J (MedRevise)

> Analyse seule, aucun fichier de code modifié. Champ : `src/medrevise/`
> (jamais MealWeek). Réfère au moteur ACTUEL (cadence fixe à paliers,
> `src/medrevise/lib/sm2.js`), qui a remplacé l'ancien moteur SM-2 adaptatif
> décrit dans `docs/diag-repetition-espacee.md` (ce dernier document est
> **obsolète** : il analysait le moteur d'avant, dont le symptôme central
> — premier succès toujours à J+1 au lieu de J+3 — a été corrigé par ce
> remplacement. Le présent audit part de zéro sur le moteur actuel.)

---

## 0. Cadence codée vs cadence attendue

```js
// src/medrevise/lib/sm2.js:10-11
export const PALIER_DELAYS = [0, 3, 7, 14, 30];
export const PALIER_LABELS = ['J0', 'J+3', 'J+7', 'J+14', 'J+30'];
```

| Attendu (spec) | J0 | J+1 | J+3 | J+7 | J+14 | J+30 | J+90 |
|---|---|---|---|---|---|---|---|
| Codé (`sm2.js:10`) | J0 | — | J+3 | J+7 | J+14 | J+30 | — |

**Écarts : 2**
- **J+1 absent** — la cadence code saute directement de J0 (interval 0) à
  J+3 dès le premier « Facile ». Il n'existe aucun palier intermédiaire.
- **J+90 absent** — le dernier palier codé est J+30 (index 4, dernier de
  `PALIER_DELAYS`) ; `nextPalier()` plafonne dessus (`sm2.js:101` :
  `Math.min(current + 1, PALIER_DELAYS.length - 1)`) — une carte qui reste
  « Facile » indéfiniment revient tous les 30 jours **pour toujours**, jamais
  à 90.

Le reste de la cadence (J0/J+3/J+7/J+14/J+30) correspond exactement à ce qui
est attendu.

---

## 1. IMPORT = J0

**CONFORME.**

- `src/medrevise/lib/storage.js:149-162` (`newQuestion`) et `:172-182`
  (`newItem`) : chaque question créée à l'import reçoit `interval: 0,
  palier: 0, nextReview: startDate` où `startDate` par défaut vaut
  `isoDate()` (aujourd'hui).
- `src/medrevise/lib/import.js:33` (`createFicheFromQuestions`) et `:68`
  (`appendItemsToFiche`) : `const start = startDate || todayISO();` — donc
  sauf choix explicite d'une autre date par l'utilisateur à l'écran d'import,
  le point de départ est bien aujourd'hui.
- `dueOn(db, todayISO())` (`planning.js:80-88`) inclut `q.nextReview <=
  dateISO`, donc une carte fraîchement importée avec `nextReview =
  aujourd'hui` apparaît immédiatement dans `dueToday()` / la série du jour.

Vérifié : une fiche importée aujourd'hui est bien due aujourd'hui.

---

## 2. STATUT « À RATTRAPER » (sans date, sans effet sur la chronologie)

**NON CONFORME**, sur les deux volets de la spec.

### 2.a Existe-t-il un statut « à rattraper » réellement séparé, sans date ?

Non. Il existe une boîte visuelle appelée « À rattraper » (`OverdueBox`,
`components/ui.jsx`, utilisée dans `Dashboard.jsx:69-73` et
`Reviser.jsx:244-247`), alimentée par :

```js
// planning.js:97-101
export function overdueQuestions(db, idx) {
  ...
  return scheduledQuestions(db, ix).filter((q) => q.nextReview < today);
}
```

Mais ce n'est **pas** un statut distinct sans date — c'est un simple filtre
d'affichage sur `nextReview < aujourd'hui`, qui **conserve** la date manquée
d'origine. Et surtout, ce même item reste **simultanément** dans le flux
principal « dû aujourd'hui » :

```js
// planning.js:80-88 (dueOn)
if (dateISO === today) return q.nextReview <= dateISO;   // aujourd'hui = dû + retard
```

`overdueQuestions` (nextReview < today) est un sous-ensemble strict de
`dueOn(db, today)` (nextReview <= today). Une fiche non faite hier apparaît
donc **à la fois** dans « Série du jour » (comptée dans `due.length`,
`Dashboard.jsx:26,59`) **et** dans la boîte « À rattraper » — ce n'est pas
une boîte séparée qui en soustrait le contenu du flux normal, c'est un
double affichage du même retard. Sortir une fiche de ce retard exige une
action manuelle explicite : le bouton « Retirer du retard »
(`ctx.dismissOverdue`, `MedReviseApp.jsx:282-293`) — rien n'y bascule
automatiquement, et tant que l'utilisateur ne clique pas, l'item revient
identique chaque jour dans la série du jour.

Confirme exactement le soupçon énoncé dans la demande : une fiche non faite
**« reste juste "en retard" (nextReview <= aujourd'hui) et repointe chaque
jour »** — c'est très exactement `dueOn`, `planning.js:84`.

### 2.b Le rattrapage tardif préserve-t-il J+7/J+15/J+30 ?

Non. Trace demandée, avec la cadence RÉELLEMENT codée (`[0,3,7,14,30]`,
pas celle de la spec) :

- Import J0 le 1er août → `nextReview = 2026-08-01`, `palier = 0`.
- Manqué le 1er, rattrapé le 4 août (3 jours de retard), noté « Facile »
  (quality 5) :
  ```js
  // sm2.js:98-109 (nextPalier)
  if (quality >= 5) newPalier = Math.min(current + 1, ...); // 0 → 1
  const interval = PALIER_DELAYS[newPalier];                // PALIER_DELAYS[1] = 3
  const nextReview = new Date();                            // ancré sur AUJOURD'HUI = 4 août
  nextReview.setDate(nextReview.getDate() + interval);       // 4 août + 3 = 7 août
  ```
  → nouvelle échéance : **7 août**.
- Si la même carte avait été faite À TEMPS le 1er août avec la même note :
  1er août + 3 = **4 août**.

Le rattrapage de 3 jours décale donc la suite de **3 jours pleins** (7 août
au lieu de 4 août), et cet écart se propage à toutes les échéances
suivantes de cette carte (chaque futur palier repart de la date réelle de
la révision précédente, jamais de l'échéance manquée). C'est documenté
comme un choix de conception assumé, pas un accident :

```js
// sm2.js:94-96 (commentaire de nextPalier)
// nextReview est toujours ancré sur la date RÉELLE de cette révision
// (jamais une addition depuis une échéance passée).
```

Et confirmé côté « Retirer du retard » (`dismissOverdue`), qui a le même
travers documenté explicitement : « recale juste la prochaine échéance à
partir d'aujourd'hui » (`MedReviseApp.jsx:277-281`) — donc les deux chemins
qui touchent une carte en retard (la réviser réellement, ou la « retirer du
retard » sans la réviser) recalent tous les deux sur la date du jour, jamais
sur la chronologie d'origine.

**Cause précise** : `nextPalier()` (`sm2.js:98-109`) prend systématiquement
`new Date()` comme point d'ancrage, sans jamais lire ni respecter une
échéance planifiée antérieure — il n'existe nulle part dans le code un
concept « d'ancre J0 d'origine » qui serait préservé à travers les retards.

---

## 3. ONGLET RÉORGANISER (décalage avec checkbox)

**CONFORME**, avec une réserve sur la portée réelle de « tous les J
suivants ».

- Case décochée → `moveFicheDay(ficheId, fromDate, toDate, {cascade:
  false})` (`MedReviseApp.jsx:336-343`) cible `dueOnFor(db, fromDate,
  {ficheId})` (`planning.js:273-282`) : **uniquement** les cartes dont
  `nextReview` tombe exactement sur le jour visé, et leur écrit une date
  commune (`toDate`). Les autres cartes/échéances ne sont pas touchées.
  Confirmé par le texte de confirmation UI : « seule la date de
  réapparition change » (`Dashboard.jsx:340`).
- Case cochée → `moveFicheDay(..., {cascade: true})` cible `dueFromOn(db,
  fromDate, {ficheId})` (`planning.js:293-303`), qui prend toutes les
  cartes de la fiche dont `nextReview >= fromDate` (donc le jour visé **et**
  toute échéance future **déjà stockée** pour d'autres cartes de la même
  fiche), et leur applique un même **glissement relatif** (`+N jours`, via
  `diffDays`), préservant les écarts entre cartes. Le texte de confirmation
  est d'ailleurs honnête sur la portée : « cartes … dues ce jour-là et
  toutes leurs échéances futures **déjà programmées** » (`Dashboard.jsx:339`).

Test avec l'exemple demandé (J0 1er août décalé au 3 août) :
- Décoché : seule la carte au J0 change de date, le reste (autres cartes
  déjà à J+7/J+14/J+30 dans la même fiche) reste inchangé — CONFORME.
- Coché : la carte au J0 ET toute autre carte déjà programmée plus tard
  glissent de +2 jours chacune — CONFORME à l'esprit de la case cochée.

**Réserve** : une QUESTION donnée ne porte qu'un seul `nextReview` à la fois
— il n'existe pas de J+7/J+15/J+30 « déjà posés dans le temps » pour UNE
MÊME carte avant qu'elle n'atteigne réellement ces paliers. Le glissement en
cascade ne peut donc réellement décaler que des échéances **déjà écrites**
(d'autres cartes du même groupe, à des paliers différents) — jamais une
projection du futur d'une carte qui n'y est pas encore. La frise calendrier
(`ficheProjection`, `planning.js:139-161`) affiche bien un « J+7 » projeté
plus tard, mais c'est un calcul de lecture pure recalculé à chaque affichage
depuis l'état courant (`nextReview`/`palier`), qui suit donc mécaniquement
le nouveau `nextReview` après un glissement — MAIS si la carte est
réellement révisée plus tard à une date différente de la projection,
`nextPalier()` (point 2) écrase cette projection avec un nouvel ancrage sur
la date réelle de révision. Le glissement calendrier n'est donc fiable que
tant que la carte n'a pas encore été re-notée.

---

## 4. BOUTON SAUTER

**NON CONFORME** sur deux points.

- **Chronologie des autres J** : CONFORME. `skipDaySource`/`skipDayFiche`
  (`MedReviseApp.jsx:356-385`) ciblent uniquement `dueOnFor(db, dateISO,
  ...)` — les cartes dues CE jour précis — et ne touchent aucune autre
  échéance. Le comportement documenté (« le reste du planning est
  inchangé », `Dashboard.jsx:348`) est vérifié dans le code.

- **« Par défaut, sauter ne me fait pas rattraper la fiche »** : NON
  CONFORME. Le code fait exactement l'inverse — Sauter fait avancer le
  palier **comme une vraie réussite** :
  ```js
  // MedReviseApp.jsx:360-368 (skipDaySource, identique skipDayFiche:375-383)
  const palier = nextPalier(5, q.palier || 0).palier;   // quality = 5 = "Facile"
  return {
    ...q, palier, interval: PALIER_DELAYS[palier],
    nextReview: addDays(dateISO, PALIER_DELAYS[palier]),
    historique: (q.historique || []).concat([{ date: dateISO, qualite: 5 }]),
    missed: 0,
  };
  ```
  Ceci est un choix de conception explicite et récent, pas un oubli : le
  commentaire (`MedReviseApp.jsx:344-355`) précise « comme une révision
  RÉUSSIE (quality 5, "Facile") … c'est voulu (remplace l'ancien
  comportement qui ne touchait pas le palier) », et l'historique git le
  confirme :
  ```
  24a8052 refactor(medrevise): "Sauter" avance le palier (comme une réussite),
          dispo sur tout jour
  ```
  Le bouton s'appelle « Sauter » mais produit en réalité l'équivalent d'une
  carte notée « Facile » sans que l'utilisateur l'ait vue ni notée — c'est
  l'inverse du comportement neutre attendu par la spec (« ne me fait PAS
  rattraper la fiche »).

- **Proposition de bascule vers « à rattraper »** : ABSENTE. Le clic ouvre
  une simple `ConfirmModal` (`Dashboard.jsx:345-353`) avec un unique bouton
  « Confirmer/Sauter » — aucune option, case à cocher ou choix alternatif
  n'est proposé pour mettre la fiche dans la boîte à rattraper à la place.
  Cette fonctionnalité n'existe nulle part dans le code (aucune occurrence
  d'un tel embranchement dans `Dashboard.jsx`, `MobileHome.jsx` ou
  `MedReviseApp.jsx`).

---

## 5. FACILE / RATÉ / DIFFICILE — effet exact

Chemin complet (desktop, `session/Session.jsx` ; mobile identique) :

1. Clic bouton → `onRate('fail'|'hard'|'easy')` → `advance(ratingIn)`
   (`Session.jsx:101`).
2. `RATING_QUALITY = { fail: QUALITY.rate, hard: QUALITY.difficile, easy:
   QUALITY.facile }` (`Session.jsx:18`), avec `QUALITY = { facile: 5,
   difficile: 3, rate: 1 }` (`sm2.js:14`) → qualité numérique 1, 3 ou 5.
3. `applyReview(item, quality, item._coef || 3, applyExtra)`
   (`Session.jsx:110`) → `sm2.js:130-145`, qui appelle `nextPalier(quality,
   question.palier || 0)` (`sm2.js:98-109`).
4. Persisté par `ctx.saveQuestion(updated)` (`Session.jsx:121`) →
   `put('questions', q)` (`MedReviseApp.jsx:153` → `storage.js:48-53`) :
   écriture IndexedDB horodatée + mise en file de synchro cloud.

Effet exact de `nextPalier()` (`sm2.js:98-109`), palier courant = `current` :

| Note | Qualité | Nouveau palier | Intervalle appliqué | nextReview |
|---|---|---|---|---|
| **Facile** | 5 | `min(current+1, 4)` — avance d'un palier, plafonne à J+30 | `PALIER_DELAYS[newPalier]` | aujourd'hui + cet intervalle |
| **Difficile** | 3 | `current` — inchangé | `PALIER_DELAYS[current]` (le même délai qu'à l'arrivée sur ce palier) | aujourd'hui + cet intervalle |
| **Raté** | 1 | `0` — repart à J0 | `PALIER_DELAYS[0] = 0` | **aujourd'hui même** |

Cas particulier important : à `current = 0` (J0, carte neuve ou revenue à
zéro après un Raté), **Difficile ET Raté produisent le même résultat** :
`newPalier = 0`, `interval = 0`, donc `nextReview = date de la révision
elle-même` (voir §« bug prioritaire » ci-dessous — c'est la cause directe du
symptôme rapporté).

`missed` (carnet d'erreurs) : incrémenté par tout `quality < 3` (donc
uniquement Raté), remis à 0 par tout `quality >= 3` (Difficile inclus) —
`sm2.js:143`. Difficile efface donc immédiatement un raté précédent du
carnet d'erreurs, ce qui est un effet à part de la seule progression du
palier.

---

## LE BUG PRIORITAIRE — « une fiche faite hier à J0 revient aujourd'hui »

**Cause racine identifiée : `sm2.js:98-109` (`nextPalier`), combinée à
`planning.js:80-88` (`dueOn`).** Ce n'est ni un problème de persistance, ni
de synchronisation.

Vérifications qui écartent les autres hypothèses possibles :
- **Persistance** : `ctx.saveQuestion` (`MedReviseApp.jsx:153`) appelle
  directement `storage.put()` (`storage.js:48-53`), qui écrit en IndexedDB
  de façon synchrone avant tout retour, et horodate `updatedAt` à l'instant
  de l'écriture. Rien n'indique une écriture perdue ou non attendue (pas de
  fire-and-forget sur ce chemin — seul `pushBlob` l'est, sans rapport).
- **Écrasement par la synchro cloud (LWW)** : `reconcileAll()`
  (`storage.js:245-288`) compare toujours `updatedAt` local vs
  `updated_at` cloud et n'adopte la version cloud que si elle est
  **strictement plus récente** (`cloudTs > localTs`, `storage.js:274`). Une
  révision qui vient d'écrire localement porte le tampon le plus récent —
  aucun scénario de course visible dans ce fichier ne réécrase une révision
  fraîche par une version plus ancienne.

**La cause réelle** est arithmétique, dans `nextPalier()` :

```js
// sm2.js:98-109
export function nextPalier(quality, palier) {
  const current = palier || 0;
  let newPalier;
  if (quality >= 5) newPalier = Math.min(current + 1, PALIER_DELAYS.length - 1);
  else if (quality >= 3) newPalier = current;   // ← Difficile à J0 : reste au palier 0
  else newPalier = 0;                            // ← Raté : repart au palier 0

  const interval = PALIER_DELAYS[newPalier];     // PALIER_DELAYS[0] === 0
  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval); // +0 jour = AUJOURD'HUI (le jour de la révision)
  return { palier: newPalier, interval, nextReview: isoDate(nextReview) };
}
```

`PALIER_DELAYS[0]` vaut **0**. Le palier 0 (J0) sert donc deux rôles à la
fois : (a) le point de départ d'une carte neuve, ET (b) la zone de repli
d'une carte notée Difficile ou Raté. Dans les deux cas, l'intervalle
appliqué est 0 jour — la carte est reprogrammée pour être due **le jour
même de la révision**.

Séquence exacte du symptôme :
1. Hier : la fiche est à J0 (`palier = 0`), l'utilisateur la révise et note
   « Difficile » (ou « Raté », effet identique à ce palier).
2. `nextPalier(3 ou 1, 0)` → `newPalier = 0`, `interval = 0`, `nextReview =
   hier` (la date de la révision elle-même).
3. Aujourd'hui : `dueOn(db, todayISO())` (`planning.js:80-88`) applique
   `q.nextReview <= dateISO` pour « aujourd'hui » — `hier <= aujourd'hui`
   est vrai → la carte réapparaît dans la série du jour, identique à celle
   révisée hier, sans qu'aucun retard n'ait pourtant été pris (elle a bien
   été faite le jour même).

Ce comportement se répète **indéfiniment**, jour après jour, tant que la
carte n'est pas notée « Facile » (seule note qui fait sortir du palier 0 et
donc appliquer un intervalle > 0). Ce n'est pas un défaut d'exécution isolé
mais une conséquence structurelle du choix `PALIER_DELAYS[0] = 0` couplé au
fait que « Difficile »/« Raté » ramènent (ou maintiennent) une carte à ce
palier précis.

---

## Synthèse

| Point | Verdict |
|---|---|
| 1. Import = J0 | CONFORME |
| 2. Statut « à rattraper » sans date, sans effet sur la chronologie | NON CONFORME |
| 3. Réorganiser (checkbox cascade) | CONFORME (réserve : portée limitée aux échéances déjà stockées) |
| 4. Bouton Sauter | NON CONFORME (avance le palier comme un succès ; pas de proposition de rattrapage) |
| 5. Facile/Raté/Difficile | Documenté ci-dessus (comportement cohérent avec le code, effet secondaire notable au palier 0) |
| Cadence codée vs attendue | 2 écarts : J+1 absent, J+90 absent |
| Bug prioritaire (J0 revient le lendemain) | Cause identifiée : `sm2.js:98-109`, `PALIER_DELAYS[0] = 0` appliqué aussi bien à un Raté/Difficile qu'à une carte neuve |
