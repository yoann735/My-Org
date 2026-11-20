<!-- PASSATION:DEBUT -->
# 🔁 Passation – My Org (MedRevise)
_Clôturée le 2026-11-20 à 12:52_

## 🎯 Objectif
SPA Vite + React (hub + MealWeek + MedRevise), déployée sur Vercel (projet `my-org`) au push sur `main`.
Session du 19-20/11 : /goal « 74 en attente » sur le téléphone (empreinte cloud identique au Mac) — livré, poussé, déployé (25c6dd2 « sync auto » = le code, 1ac6e5a, 3840ce0).

## ✅ Fait (vérifié)
- Cause : « Passer en révision » (bloc Nouvelles) journalise un événement rating null ; `medrevise_review_log` le refuse (23514, migration 20261024 non appliquée) ; l'ancien `passe()` ignorait l'erreur → événement bloqué à vie (+1 par passage) ; l'empreinte ne couvrait que les records.
- Classement : 74 = 0 faux, 74 vraiment non envoyés, 0 conflit — par DÉDUCTION + lecture complète du serveur (le diagnostic du téléphone n'était pas sur le Mac). Mac : 88 cartes passées en révision sans événement au serveur → l'iPad a probablement ~14 en attente.
- Correctif : preuve unique par relecture serveur (`src/medrevise/lib/confirmationServeur.js`) ; canal de repli des événements = records store `review_log_evenement` via RPC `medrevise_push` (sans migration) ; empreinte avec lignes `journal|id|reviewed_at` (`lib/syncStatus.js`) ; enAttenteTotal = outbox records + journal ; garde-fou réconciliation si « en attente » + empreinte identique (`MedReviseApp.jsx`) ; tentatives + vraies raisons dans la liste dépliable (`lib/etatSynchro.js`, `components/EtatSynchro.jsx`) ; export diagnostic classe chaque élément (`lib/diagnosticExport.js`). Cœur : `journal/synchro.js`, `journal/journal.js`.
- Tests : 18 tests `tests/file-synchro/` liés au build (`"build": "vitest run tests/file-synchro && vite build"`) ; banc `scripts/tests-74-en-attente/t-74.mjs avant|apres` vert ordinateur/tablette/téléphone (bug reproduit avant, absent après). MealWeek inchangé. WebKit non testé (absent du Mac). Déploiement vérifié (bundle en ligne à 22:37 le 19/11).
- Compte rendu : `docs/compte-rendu-74-en-attente.md` (+ captures `docs/img/74-en-attente/`).
- (20/11, /goal) Séance : « Passer → » / « ← Précédente » (touches → / ←), renotation = champs remis + entrée d'annulation au journal (ajout seul) + note réappliquée à l'heure d'origine (`lib/retourSeance.js`, `session/SeanceFC.jsx`) ; vues / reconstruction FSRS / rapport ombre ignorent les notations annulées. Flashcard depuis une boîte = formulaire complet du panneau (`CarteAjoutFlashcard` pré-rempli, lien `source` gardé) ; `pdf/BoiteFlashcard.jsx` supprimé. Banc Chrome `scripts/tests-seance-passer-precedente/` : séance 42/42 ×3 appareils, boîte 17/17 ordi + iPad, MealWeek identique au pixel, Apprentissage OK. Compte rendu : `docs/compte-rendu-seance-passer-precedente-et-formulaire-fc.md`. 2 échecs `npm test` (crayon, emploi du temps) préexistants, hors chantier.

## 🚧 En cours (point d'arrêt exact)
- Rien en cours. Modifications non commitées : aucune (hors `progression.md`, modifié par cette clôture).

## ➡️ Prochaines étapes (dans l'ordre)
1. Côté utilisateur : ouvrir l'app sur le téléphone (puis l'iPad), attendre une synchro → attendu « 0 en attente », même empreinte et même compteur de vues que le Mac. Attendre son retour avant toute modification.
2. Côté utilisateur : essais du mode file d'attente (Réglages › Planification) sur vrai Mac/iPad, et de l'enregistrement continu.
3. Côté utilisateur : essayer « Passer / Précédente » en séance et « → Flashcard » d'une boîte sur le vrai iPad/téléphone (WebKit non testé).
4. Toujours en attente côté utilisateur : CLI Vercel (`npm i -g vercel`, `vercel login`, `vercel link --yes --project my-org`) et migration `supabase/migrations/20261024_review_log_evenements.sql` (l'app marche sans).

## 🧭 Décisions prises (ne pas rediscuter)
- Un élément ne quitte la file qu'avec une preuve lue au serveur (identique), jamais sur un simple « ok » d'envoi ; putBackup avant toute opération sur la file.
- Pas de nouvelle migration : canal de repli par records. Supabase en lecture seule pour Claude.

## 🛠️ Commandes utiles
- Build (tests inclus) : `npm run build` · Tests complets : `npm test` (TZ Bruxelles)
- Banc 74 : faux Supabase :54409 (`scripts/faux-supabase.mjs`), Vite après :5311 (`fa-cloud`), avant :5312 (git archive 5b0ead1, cacheDir séparé) ; Chrome 9345/9346/9347 → `node scripts/tests-74-en-attente/t-74.mjs avant|apres`.

## ⚠️ Pièges et préférences
- Ne jamais toucher MealWeek ni `src/shared/` ; aucune écriture Supabase ; ne pas ouvrir l'app réelle ; aucune donnée réelle dans le dépôt (PUBLIC) ; diagnostic téléphone lu sur place dans ~/Downloads, jamais copié.
- « sync auto » commite et pousse seul (25c6dd2 a embarqué un launch.json de banc + captures, restaurés dans 1ac6e5a). Profils Chrome de banc : toujours neufs. Deux Vite → `cacheDir` séparé. `timeout` absent sur macOS.
- Français, commits conventionnels, jamais de force push.
<!-- PASSATION:FIN -->

## Historique des clôtures
- 2026-11-20 12:52 – /goal 74 en attente : cause = événements « Passer en révision » refusés (rating null) et ignorés ; preuve serveur unique, canal de repli sans migration, empreinte + journal, garde-fou ; 18 tests au build, bancs verts 3 appareils ; poussé, déployé (3840ce0).
- 2026-11-19 21:44 – Clôture : mode file d'attente livré et poussé (5d56577), banc téléphone tranché sans régression (d042293) ; attente des essais sur vrai Mac/iPad.
- 2026-11-15 21:00 – /goal mode file d'attente : dateEffective unique (planning.js), jours en pause dans prompts/fileAttente (aucune carte écrite, pas de migration), Réglages › Planification, décalage + alerte + « Faire le paquet suivant » ; testé ordinateur, tablette, téléphone, deux appareils, avant/après (mode désactivé identique) ; compte rendu docs/compte-rendu-mode-file-attente.md.
- 2026-11-15 19:18 – Clôture du /goal boîtes disparues + sauvegarde continue (livré, poussé a4fb223) ; à revoir : banc téléphone séance flashcards en échec au dernier passage.
- 2026-11-14 18:40 – /goal boîtes disparues + sauvegarde continue : Épithélium glandulaire, aucune boîte disparue (36 copies, cloud, journal du Mac) ; enregistrement continu (< 300 ms, relu, erreur visible), historique des versions, garde-fou ; bancs verts 3 appareils ; poussé (d23bed3, 4e3a9ca, 22bd96a).
- 2026-11-14 16:39 – /goal compteur de vues (œil, tris, filtre) + visionneuse d'image plein écran en révision : livrés, testés 3 appareils, poussés, déployés (7048c82).
- 2026-11-07 17:20 – /goal sauvegarde + statut synchro : sauvegarde jamais arrêtée, rattrapage ajouté, 19 « en attente » = faux compteur (srcId bfc), état unique ; poussé, déployé, copie prod d5ddbe0.
- 2026-11-07 16:35 – /goal environnement : tout vérifié (build, prod Ready, sauvegarde 07/11), rapport poussé ; restent CLI Vercel et migration 20261024 à vérifier.
- 2026-11-02 11:11 – Cartes manquantes : suppressions volontaires, bouton « C'est moi… », cartes disparues reconnaissables (recto, cours) ; poussé, attente retour utilisateur.
- 2026-10-31 20:55 – /goal : diagnostic des 12 flashcards manquantes (suppressions manuelles confirmées), alerte d'intégrité corrigée pour les suppressions volontaires, testée et poussée.
