<!-- PASSATION:DEBUT -->
# 🔁 Passation – My Org (MedRevise)
_Clôturée le 2026-11-19 à 21:44_

## 🎯 Objectif
SPA Vite + React (hub + MealWeek + MedRevise), déployée sur Vercel (projet `my-org`) au push sur `main`.
Session du 15/11 : /goal « Mode file d'attente » (planning en pause les jours sans révision), livré et poussé (b8c367c, 238021b, 7b9221f, 5d56577) ; banc téléphone tranché en parallèle (d042293).

## ✅ Fait (vérifié)
- **Mode file d'attente** : une seule `dateEffective(carte)` dans `src/medrevise/lib/planning.js` (`nextDate` = alias) = dateBase + jours en pause STRICTEMENT après la dernière révision. Logique pure : `src/medrevise/lib/fileAttente.js` (clôture des journées, élagage, activation, aperçu 7 j, paquet suivant, désactivation).
- Stockage : enregistrement synchronisé `prompts/fileAttente` (`lib/storage.js` get/setFileAttente, putBackup avant chaque écriture). Aucune carte, FSRS ni journal écrits ; pas de migration SQL.
- UI : Réglages › Planification (`components/ReglagesFileAttente.jsx`, feuille d'activation), ligne de décalage, alerte orange ≥ 5 j, bouton « Faire le paquet suivant » (`components/SeanceAujourdhui.jsx`), CSS `src/styles/file-attente.css`. Clôture lancée après une passe de synchro aboutie (`MedReviseApp.jsx`). Hub (`src/Selecteur.jsx`) charge l'état du mode.
- Tests : vitest 287/289 (2 échecs anciens : crayon, emploi du temps) dont 14 nouveaux (`tests/fileAttente/`) ; bancs Chrome `scripts/tests-file-attente/` tous verts (ordinateur, tablette, téléphone, deux appareils, avant/après = mode désactivé identique, MealWeek identique à l'octet). Build vert.
- Compte rendu : `docs/compte-rendu-mode-file-attente.md` (règle, stockage, résultats chiffrés, captures `docs/img/file-attente/`, doutes, commits).
- Banc téléphone : PAS de régression (le banc manquait de cartes dues) ; corrigé dans `scripts/tests-enregistrement/t-telephone.mjs` (d042293), `tout.sh` vert.

## 🚧 En cours (point d'arrêt exact)
- Rien en cours. Modifications non commitées : aucune (hors `progression.md`, modifié par cette clôture).

## ➡️ Prochaines étapes (dans l'ordre)
1. Côté utilisateur : essayer le mode file d'attente sur le vrai Mac et le vrai iPad (Réglages › Planification › activer, vérifier la séance) ; attendre son retour avant toute modification.
2. Côté utilisateur : essayer l'enregistrement continu (indicateur, Fichier › Historique…, fermeture d'onglet juste après frappe).
3. Toujours en attente côté utilisateur : CLI Vercel (`npm i -g vercel`, `vercel login`, `vercel link --yes --project my-org`) et migration `supabase/migrations/20261024_review_log_evenements.sql`.

## 🧭 Décisions prises (ne pas rediscuter)
- Règle dateEffective exacte du cahier des charges ; seules les flashcards sont décalées ; « dues ce jour-là » = dateEffective == jour (les vieux retards seuls ne créent pas de pause).
- Clôture seulement après synchro aboutie (jamais hors ligne / en échec) – pour que 2 appareils donnent le même résultat.
- Journées en pause = bascule 4 h Bruxelles ; compteurs gardent `todayISO()` (minuit), inchangés – mode désactivé strictement identique.
- Pas d'écran Réglages au téléphone : activation sur ordinateur ou tablette, la synchro l'apporte.

## 🛠️ Commandes utiles
- Build : `npm run build` · Tests : `npm test` (TZ Bruxelles)
- Banc file d'attente : preview_start `fa-local` (:5310) [+ `fa-faux-supabase` :54409 et Vite :5311 avec `cacheDir` séparé pour 2 appareils] ; Chrome headless 9345 (ordi), 9346 (tel), 9347 (tablette), 9348 (ordi 2) → `cd scripts/tests-file-attente && node t-scenarios.mjs ordi|tablette|tel [s1…s8|nr]`, `node t-deux-appareils.mjs`, `node t-avant-apres.mjs` (code d'avant sur :5312 via `git archive 481184d`).
- Banc enregistrement : `faux-supabase` (:54399), `faux-github` (:54398), `medrevise-banc-sauvegarde` (:5303) + Chrome 9335/9336/9337 → `scripts/tests-enregistrement/tout.sh`.

## ⚠️ Pièges et préférences
- Ne jamais toucher MealWeek ni `src/shared/` ; aucune écriture Supabase ; ne pas ouvrir l'app réelle ; aucune donnée réelle dans le dépôt (PUBLIC).
- Deux Vite dans le même dossier partagent `node_modules/.vite` → deux copies de React (page vide, « Invalid hook call ») : donner un `cacheDir` séparé. Panneau navigateur : 5 serveurs max par session.
- Bancs : modules via `window.__imp` ; horloge simulée par `localStorage.__decalageMs` (commun.mjs) ; machine saturée = faux échecs de latence.
- « sync auto » commite parfois seul (a embarqué une partie du chantier dans 238021b). Commit puis push séparément. Français, commits conventionnels, jamais de force push.
<!-- PASSATION:FIN -->

## Historique des clôtures
- 2026-11-19 21:44 – Clôture : mode file d'attente livré et poussé (5d56577), banc téléphone tranché sans régression (d042293) ; attente des essais sur vrai Mac/iPad.
- 2026-11-15 21:00 – /goal mode file d'attente : dateEffective unique (planning.js), jours en pause dans prompts/fileAttente (aucune carte écrite, pas de migration), Réglages › Planification, décalage + alerte + « Faire le paquet suivant » ; testé ordinateur, tablette, téléphone, deux appareils, avant/après (mode désactivé identique) ; compte rendu docs/compte-rendu-mode-file-attente.md.
- 2026-11-15 19:18 – Clôture du /goal boîtes disparues + sauvegarde continue (livré, poussé a4fb223) ; à revoir : banc téléphone séance flashcards en échec au dernier passage.
- 2026-11-14 18:40 – /goal boîtes disparues + sauvegarde continue : Épithélium glandulaire, aucune boîte disparue (36 copies, cloud, journal du Mac) ; enregistrement continu (< 300 ms, relu, erreur visible), historique des versions, garde-fou ; bancs verts 3 appareils ; poussé (d23bed3, 4e3a9ca, 22bd96a).
- 2026-11-14 16:39 – /goal compteur de vues (œil, tris, filtre) + visionneuse d'image plein écran en révision : livrés, testés 3 appareils, poussés, déployés (7048c82).
- 2026-11-07 17:20 – /goal sauvegarde + statut synchro : sauvegarde jamais arrêtée, rattrapage ajouté, 19 « en attente » = faux compteur (srcId bfc), état unique ; poussé, déployé, copie prod d5ddbe0.
- 2026-11-07 16:35 – /goal environnement : tout vérifié (build, prod Ready, sauvegarde 07/11), rapport poussé ; restent CLI Vercel et migration 20261024 à vérifier.
- 2026-11-02 11:11 – Cartes manquantes : suppressions volontaires, bouton « C'est moi… », cartes disparues reconnaissables (recto, cours) ; poussé, attente retour utilisateur.
- 2026-10-31 20:55 – /goal : diagnostic des 12 flashcards manquantes (suppressions manuelles confirmées), alerte d'intégrité corrigée pour les suppressions volontaires, testée et poussée.
- 2026-10-31 20:09 – Tableau masque choisi + espace deux lignes livrés, poussés ; attente test utilisateur sur vrai cours.
