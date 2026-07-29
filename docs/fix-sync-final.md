# Fix final — synchro cloud MedRevise (desktop → mobile)

Mode autonome, sans validation intermédiaire. Contexte : `docs/audit-sync-mobile.md`
(§3.2), `docs/diag-reseed-mobile.md`. La Phase B (outbox persistée) était codée mais la
synchro ne fonctionnait toujours pas en pratique. Ce document couvre ce qui a été
diagnostiqué et corrigé cette fois, en autonomie complète.

---

## Ce qui a été trouvé — deux bugs réels, plus une lacune de conception

### 1. Bug réel : un échec réseau était traité comme un succès (déjà présent avant ce chantier)

`supabase-js` ne **rejette jamais** sur un échec réseau (DNS, offline, 5xx) — il résout
normalement avec `{ data: null, error: {...} }`. `flushPending()` et `pushTombstonesNow()`
faisaient `await supabase....upsert(...)` sous un simple `try/catch` **sans jamais lire
`error`** : un échec réseau ne levait donc pas d'exception, l'entrée était retirée de
l'outbox comme si l'envoi avait réussi. **C'était déjà silencieusement en train de perdre
des écritures avant même ce chantier** (introduit avec l'outbox de la session
précédente, jamais détecté car jamais testé contre un vrai échec réseau *après* écriture
de l'outbox). Reproduit et confirmé en direct (requête interceptée, `error` non nul,
`delMany` appelé quand même) avant correctif.

### 2. Lacune de conception : aucun mécanisme ne rattrapait les écritures antérieures à l'outbox

`reconcileAll()` ne remet une écriture locale en file que si la comparaison avec le pull
cloud détecte un écart — donc seulement si le pull réussit ET détecte quelque chose. Si
le pull échoue une fois (n'importe quelle raison), ou si une donnée avait été écrite
avant même que l'outbox existe, rien ne garantissait qu'elle finisse un jour par partir.
Ce n'était pas un bug de code à proprement parler, mais une garantie manquante — exactement
ce que demandait le brief.

### 3. Cause la plus probable du symptôme concret ("ça ne marche jamais")

Je n'ai **pas pu accéder au déploiement réel** (pas d'identifiants Supabase en local,
pas de lien Vercel/`gh` fonctionnel dans cet environnement — voir « Limite » plus bas).
Le candidat le plus probable, non vérifiable par moi mais très courant en pratique :
**`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` absentes du build Vercel réellement
déployé** (jamais ajoutées, ou ajoutées sans **Redeploy** derrière — ces variables sont
figées au build, pas lues au runtime). Dans ce cas, `SYNC_ENABLED` est `false` et **toute**
la synchro est un no-op silencieux, sur desktop comme sur mobile — ce qui correspond
exactement à « une fiche n'apparaît jamais, nulle part, jamais ». Le nouveau bouton
« Forcer la synchro » (voir plus bas) affiche maintenant ce cas explicitement au lieu de
rester silencieux — c'est la première chose à vérifier.

---

## Ce qui a été corrigé

**`src/medrevise/data/sync.js`**
- `flushPending()` et `pushTombstonesNow()` : vérifient maintenant explicitement
  `{ error }` sur le retour de `upsert()` et traitent un `error` non nul comme un échec
  (l'entrée reste dans l'outbox, rien n'est marqué "envoyé" à tort). C'est LE bug qui
  aurait continué à silencieusement perdre des écritures même avec l'outbox déjà en place.

**`src/medrevise/lib/storage.js`**
- Nouveau `queueAllLocalForPush()` : remet **tout** le local syncable en file d'envoi,
  sans condition — ne dépend pas d'une comparaison qui aurait pu échouer ou d'un pull
  qui aurait pu rater. Idempotent (un upsert identique ne change rien côté cloud),
  dataset personnel petit → coût négligeable.
- Nouveau `syncNow()` : point d'entrée unique — rejoue l'outbox → réconcilie (pull +
  merge) → `queueAllLocalForPush()` → repousse immédiatement. Retourne un statut
  exploitable par l'UI (`disabled` / `offline` / `ok`) plutôt qu'un booléen muet.

**`src/medrevise/MedReviseApp.jsx`**
- Le boot et les triggers `online`/`visibilitychange` passent maintenant par `syncNow()`
  (via `forceSync`, exposé sur `ctx`) au lieu d'un `reconcileAll()` nu — donc le
  rattrapage inconditionnel tourne aussi automatiquement à chaque ouverture, pas
  seulement sur clic manuel.
- Nouvel état `ctx.syncState` (`idle` / `syncing` / `ok` / `offline` / `disabled` +
  horodatage) exposé à toute l'UI.

**`src/medrevise/components/ui.jsx`, `pages/Reglages.jsx`, `mobile/MobileHome.jsx`**
- Bouton **« Forcer la synchro »** dans Réglages (desktop, carte "Synchronisation") et
  icône de synchro dans l'en-tête de l'accueil mobile — mêmes garanties que le boot
  (`ctx.forceSync` → `syncNow()`), avec un statut lisible (`syncStatusLabel`, partagé
  entre les deux écrans). C'est le déclencheur fiable demandé, plus un outil de diagnostic
  direct : si ça affiche "Synchro cloud désactivée", le problème n'est pas dans le code
  de synchro, il est dans la config Vercel.

## Ce qui n'a PAS changé
`reconcileAll()` (logique de merge/LWW), le schéma Supabase, `src/mealweek/`, aucune
nouvelle dépendance.

---

## Tests effectués

Pas d'accès au vrai Supabase (voir limite ci-dessous) → testé en local avec un faux hôte
Supabase (`.env` de test jamais commité, supprimé après) et avec `fetch` mocké pour
simuler des succès/échecs contrôlés :
- Échec réseau (mock renvoyant `{error}` ou hôte injoignable) → entrée outbox conservée,
  pas retirée à tort (confirme le fix du bug n°1).
- Donnée écrite **directement en IndexedDB, en contournant `storage.js`/l'outbox**
  (simule une écriture antérieure à ce mécanisme) → `syncNow()` la détecte via
  `queueAllLocalForPush()` et la pousse avec succès (fetch mocké, corps de requête
  capturé et vérifié) — confirme le rattrapage inconditionnel (bug n°2).
- **Bouton réel cliqué dans l'UI rendue** (Réglages desktop) avec `fetch` mocké en
  succès → passage `"Hors ligne..."` → `"Synchronisé à HH:MM"`, outbox vidée. Testé
  aussi l'état `"Synchro cloud désactivée"` (sans variables d'env du tout) — les deux
  passent par le vrai composant React, pas seulement par du code isolé.
- `npm run build` propre, zéro erreur console à chaque étape, `src/mealweek/` non touché.

**Limite assumée** : aucun aller-retour testé contre le VRAI projet Supabase de
production (pas d'identifiants disponibles ici, et le domaine deviné pour trouver le
déploiement s'est avéré appartenir à un site tiers sans rapport — abandonné plutôt que
de continuer à deviner). Étape (4) du brief (nettoyer les zombies cloud) non exécutée
pour la même raison : je n'ai pas pu me connecter à la vraie base. Voir le geste 1
ci-dessous, qui couvre ce nettoyage en même temps que la remise à zéro de test.

---

## (a) Ce qui clochait vraiment
1. Un bug réel et sournois : un échec d'envoi vers Supabase était pris pour un succès
   (`supabase-js` ne lève pas d'exception sur échec réseau), donc l'outbox se vidait
   même quand rien n'était réellement parti.
2. Aucune garantie que les écritures faites AVANT l'existence de l'outbox (ou manquées
   par un pull raté) soient un jour rattrapées.
3. Suspect n°1, non vérifiable à distance : la synchro est peut-être simplement
   **désactivée sur le déploiement réel** (variables d'environnement Supabase absentes
   du build Vercel) — le nouveau bouton te le dira explicitement.

## (b) Ce qui a changé
Vérification explicite des échecs réseau avant de vider l'outbox ; rattrapage
inconditionnel de tout le local à chaque sync (boot + reconnexion + bouton manuel) ;
bouton/icône « Forcer la synchro » sur desktop ET mobile, avec statut honnête affiché
(y compris « synchro désactivée »).

## (c) Les 3 gestes exacts pour vérifier
1. **Vide la table cloud pour repartir propre** — Supabase → SQL Editor → exécute
   `delete from medrevise_records;` (cette table est 100 % dédiée à MedRevise, jamais
   `mealweek_state`, jamais touchée).
2. **Desktop** : ouvre MedRevise → Réglages → carte "Synchronisation". Si ça affiche
   *"Synchro cloud désactivée"*, arrête-toi là : va sur Vercel, vérifie/ajoute
   `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` en Production, puis **Redeploy** — rien
   d'autre ne peut marcher tant que ce n'est pas réglé. Sinon, crée une fiche de test,
   puis clique "Forcer la synchro" et attends `"Synchronisé à HH:MM"`.
3. **Mobile** : ouvre MedRevise, tape l'icône de synchro en haut de l'accueil (à côté du
   thème) — la fiche créée à l'étape 2 doit apparaître en quelques secondes.
