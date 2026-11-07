<!-- PASSATION:DEBUT -->
# 🔁 Passation – My Org (MedRevise)
_Clôturée le 2026-11-07 à 17:20_

## 🎯 Objectif
SPA Vite + React (hub + MealWeek + MedRevise), déployée sur Vercel (projet `my-org`) au push sur `main`.
Session du 07/11 (/goal) : causes et corrections de (1) la sauvegarde GitHub « arrêtée » et (2) l'en-tête « À jour » alors que Réglages affichait « 19 en attente ». Terminé, poussé, déployé.

## ✅ Fait (vérifié, poussé, déployé : 550ff49, f65e3cc, 58b64e2, 3a71334)
- Sauvegarde : elle ne s'était PAS arrêtée (un commit chaque nuit, 29/10 → 07/11). Cause probable du message « 4 jours » : le statut était lu une fois par chargement de page, il est maintenant relu s'il date de plus de 10 min.
- Rattrapage `api/backup-catchup.js` → `rattrapage()` dans `api/_lib/sauvegarde.js` : il lance la même copie que le cron si la dernière copie réussie a plus de 24 h. Verrou par étiquette git `rattrapage-*`, une tentative / 30 min. Appelé en silence au démarrage (`MedReviseApp.jsx`).
- Copie « réussie » = les 4 fichiers relus (`gh.verifier`). Un échec est noté dans `manifest.json` `echecs` (commit `backup-echec …`). Réglages › Sauvegardes avertit au-delà de 48 h, avec la raison.
- Prod : catch-up → « rien » (14 h). Copie réelle via backup-now → commit `d5ddbe0` 07/11 16:14 UTC, 4 739 enregistrements.
- Les 19 = cartes « Boîte → Flashcard » dont `srcId` (genId('bfc')) était pris pour un fichier. Correction : `estIdDeBlob` dans `lib/storage.js`. Aucune donnée touchée.
- État de synchro unique : `src/medrevise/lib/etatSynchro.js`, lu par l'en-tête (`Chiffre.jsx`) et par Réglages / accueil du téléphone (`components/EtatSynchro.jsx`, liste « N en attente » qui se déplie).
- Compte rendu complet : `docs/compte-rendu-sauvegarde-et-statut-synchro.md` (preuves, liste des 19, captures `docs/img/sauvegarde-statut/`).
- Tests : vitest 253/255 (crayon + timetable échouaient déjà avant) ; bancs navigateur 50 ✅ ; MealWeek identique au pixel près.

## 🚧 En cours
- Rien. Modifications non commitées : aucune.

## ➡️ Prochaines étapes (dans l'ordre)
1. Attendre le feu vert ou la nouvelle demande de l'utilisateur.
2. Côté utilisateur : ouvrir l'app sur l'iPad et le téléphone. L'en-tête et Réglages doivent dire la même chose ; si « N en attente » apparaît, lire la liste dépliée.
3. Vérifier demain matin que le cron de la nuit a créé « backup 2026-11-08 » (nouvelle vérification d'écriture) : `gh api 'repos/yoann735/medrevise-backups/commits?per_page=3'`.
4. Encore en attente côté utilisateur : CLI Vercel (`npm i -g vercel`, `vercel login`, `vercel link --yes --project my-org`) et migration `20261024_review_log_evenements.sql` (requête is_nullable).

## 🧭 Décisions prises (ne pas rediscuter)
- Rattrapage : cron quotidien conservé + appel à l'ouverture, le serveur décide (seuil 24 h, verrou 30 min).
- « À jour » seulement si la passe est confirmée ET la liste recalculée après est vide.
- `syncStatusLabel` ne sert plus qu'au mode dégradé ; `SyncIndicator` = diagnostic d'empreinte seulement.

## 🛠️ Commandes utiles
- Build : `npm run build` · Tests : `npm test`
- Bancs (`.claude/launch.json` : faux-supabase, faux-github, medrevise-banc-sauvegarde) + Chrome headless 9335/9336/9337 → `cd scripts/tests-sauvegarde-statut && node seed.mjs && node t-synchro.mjs && node t-sauvegarde.mjs`
- Statut prod (lecture) : `curl -s -X POST -H "Origin: https://my-org-blue.vercel.app" -H 'Content-Type: application/json' -d '{}' https://my-org-blue.vercel.app/api/backup-status`

## ⚠️ Pièges et préférences
- Ne jamais toucher MealWeek ni `src/shared/` ; aucune écriture Supabase ; ne pas ouvrir l'app réelle pendant le dev ; aucun secret affiché.
- Le connecteur Vercel MCP ne voit pas le projet : passer par les statuts GitHub (`gh api repos/yoann735/My-Org/commits/<sha>/statuses`).
- Le limiteur de backup-catchup (30 / 10 min / IP) est en mémoire : en banc, beaucoup de rechargements → redémarrer Vite.
- Dépôt PUBLIC ; un processus « sync auto » commite parfois tout seul ; français, commits conventionnels, jamais de force push.
<!-- PASSATION:FIN -->

## Historique des clôtures
- 2026-11-07 17:20 – /goal sauvegarde + statut synchro : sauvegarde jamais arrêtée, rattrapage ajouté, 19 « en attente » = faux compteur (srcId bfc), état unique ; poussé, déployé, copie prod d5ddbe0.
- 2026-11-07 16:35 – /goal environnement : tout vérifié (build, prod Ready, sauvegarde 07/11), rapport poussé ; restent CLI Vercel et migration 20261024 à vérifier.
- 2026-11-02 11:11 – Cartes manquantes : suppressions volontaires, bouton « C'est moi… », cartes disparues reconnaissables (recto, cours) ; poussé, attente retour utilisateur.
- 2026-10-31 20:55 – /goal : diagnostic des 12 flashcards manquantes (suppressions manuelles confirmées), alerte d'intégrité corrigée pour les suppressions volontaires, testée et poussée.
- 2026-10-31 20:09 – Tableau masque choisi + espace deux lignes livrés, poussés ; attente test utilisateur sur vrai cours.
- 2026-10-31 15:15 – Synchro rapide, surlignage exact, listes dans les boîtes livrés et poussés ; question ouverte : espace sur surlignage deux lignes.
- 2026-10-31 (soir) – /goal Tableau : masque par case livré, testé (ordinateur, tablette, téléphone), poussé ; puis correctif « espace entre deux lignes » livré et poussé.
