<!-- PASSATION:DEBUT -->
# 🔁 Passation – My Org (MedRevise)
_Clôturée le 2026-11-15 à 19:18_

## 🎯 Objectif
SPA Vite + React (hub + MealWeek + MedRevise), déployée sur Vercel (projet `my-org`) au push sur `main`.
Session /goal du 14-15/11 : retrouver les boîtes « disparues » d'Épithélium glandulaire, puis rendre l'enregistrement des documents incassable. Terminé et poussé (d23bed3, 4e3a9ca, 22bd96a, a4fb223).

## ✅ Fait (vérifié)
- Diagnostic : Épithélium glandulaire, **aucune boîte disparue** (original 42, S1 18, S2 6 ; 36 copies GitHub + cloud + journal LevelDB d'une COPIE d'Aside). 21 boîtes créées puis supprimées entre deux sauvegardes (presque toutes vides). Sauvegarde GitHub complète (3837/3837). Captures réelles hors dépôt : `…/Projets/My Org/captures-privees-boites/`.
- Moteur unique `src/medrevise/lib/enregistrement.js` (écriture relue, 3 essais, erreur persistante, file d'envoi, vidage à pagehide/visibilitychange, beforeunload seulement si écriture locale en cours, storage.persist). Branché dans `lib/storage.js` (`ecrireDocument`, ordre par enregistrement `enOrdre`).
- Historique `lib/historiqueDoc.js` + store local `versions_doc` (60 j, version / 5 min, à la fermeture, avant restauration/remplacement cloud) ; UI `pdf/HistoriqueDoc.jsx` (Fichier › Historique…), bandeau de disparition dans `PdfReader.jsx`, indicateur `components/IndicateurEnregistrement.jsx`. Versions des sauvegardes GitHub : `api/backup-versions.js` (lecture seule).
- Bugs corrigés : perte à fermeture rapide (écriture immédiate à la 1re frappe), course création/1re lettre, ⌘Z/⌘⇧Z qui vidait une boîte (`lib/annotHistory.js`).
- Build vert ; vitest 273/275 (2 échecs anciens : crayon, emploi du temps) ; MealWeek identique octet pour octet ; frappe aussi rapide (CPU×4 : 31,8 vs 31,3 ms).
- Compte rendu : `docs/compte-rendu-boites-disparues-et-sauvegarde-continue.md`.

## 🚧 En cours
- Rien de commencé. Modifications non commitées : aucune (hors `progression.md`, modifié par cette clôture).
- ⚠️ Non vérifié : le DERNIER passage de `scripts/tests-enregistrement/tout.sh` a donné ordinateur ✅×3, tablette ✅×3, mais téléphone 2 échecs (« séance lancée : une carte s'affiche », puis « journal +1 : 2 → 2 ») dans `t-telephone.mjs` (séance de flashcards, non-régression). Les passages précédents étaient verts ; probablement délai/instabilité du banc, non investigué.

## ➡️ Prochaines étapes (dans l'ordre)
1. Relancer `node t-telephone.mjs` (après `node seed.mjs`) et trancher : banc instable ou vraie régression de la séance flashcards sur téléphone ; corriger si besoin.
2. Côté utilisateur : essayer sur le vrai Mac et le vrai iPad (indicateur, Fichier › Historique…, fermeture d'onglet juste après frappe).
3. Toujours en attente côté utilisateur : CLI Vercel (`npm i -g vercel`, `vercel login`, `vercel link --yes --project my-org`) et migration `supabase/migrations/20261024_review_log_evenements.sql`.

## 🧭 Décisions prises (ne pas rediscuter)
- Rien n'est restauré automatiquement : alerte + Historique seulement ; récupération = ajout seul, idempotent, putBackup d'abord.
- `versions_doc` reste local (non synchronisé) ; les versions GitHub sont rapatriées à la demande, lecture seule.
- Le téléphone n'a pas d'éditeur de documents : on y teste réception, file hors ligne et séance.

## 🛠️ Commandes utiles
- Build : `npm run build` · Tests : `npx vitest run`
- Bancs : preview_start `faux-supabase` (:54399), `faux-github` (:54398), `medrevise-banc-sauvegarde` (:5303) + Chrome headless 9335 (ordi), 9336 (tel), 9337 (tablette) → `cd scripts/tests-enregistrement && node seed.mjs && node t-ecriture.mjs ordi|tablette` ; tout : `./tout.sh`.

## ⚠️ Pièges et préférences
- Ne jamais toucher MealWeek ni `src/shared/` ; aucune écriture Supabase ; ne pas ouvrir l'app réelle ; aucune donnée réelle dans le dépôt (PUBLIC).
- Bancs : importer les modules via `window.__imp` (sinon autre instance Vite `?t=`) ; points d'appui via `pointPage` (zone visible) ; tablette = stylet (pointerType pen).
- Un commit+push combiné peut être refusé : faire commit puis push séparément. « sync auto » commite parfois seul.
- Français, commits conventionnels, jamais de force push.
<!-- PASSATION:FIN -->

## Historique des clôtures
- 2026-11-15 21:00 – /goal mode file d'attente : dateEffective unique (planning.js), jours en pause dans prompts/fileAttente (aucune carte écrite, pas de migration), Réglages › Planification, décalage + alerte + « Faire le paquet suivant » ; testé ordinateur, tablette, téléphone, deux appareils, avant/après (mode désactivé identique) ; compte rendu docs/compte-rendu-mode-file-attente.md.
- 2026-11-15 19:18 – Clôture du /goal boîtes disparues + sauvegarde continue (livré, poussé a4fb223) ; à revoir : banc téléphone séance flashcards en échec au dernier passage.
- 2026-11-14 18:40 – /goal boîtes disparues + sauvegarde continue : Épithélium glandulaire, aucune boîte disparue (36 copies, cloud, journal du Mac) ; enregistrement continu (< 300 ms, relu, erreur visible), historique des versions, garde-fou ; bancs verts 3 appareils ; poussé (d23bed3, 4e3a9ca, 22bd96a).
- 2026-11-14 16:39 – /goal compteur de vues (œil, tris, filtre) + visionneuse d'image plein écran en révision : livrés, testés 3 appareils, poussés, déployés (7048c82).
- 2026-11-07 17:20 – /goal sauvegarde + statut synchro : sauvegarde jamais arrêtée, rattrapage ajouté, 19 « en attente » = faux compteur (srcId bfc), état unique ; poussé, déployé, copie prod d5ddbe0.
- 2026-11-07 16:35 – /goal environnement : tout vérifié (build, prod Ready, sauvegarde 07/11), rapport poussé ; restent CLI Vercel et migration 20261024 à vérifier.
- 2026-11-02 11:11 – Cartes manquantes : suppressions volontaires, bouton « C'est moi… », cartes disparues reconnaissables (recto, cours) ; poussé, attente retour utilisateur.
- 2026-10-31 20:55 – /goal : diagnostic des 12 flashcards manquantes (suppressions manuelles confirmées), alerte d'intégrité corrigée pour les suppressions volontaires, testée et poussée.
- 2026-10-31 20:09 – Tableau masque choisi + espace deux lignes livrés, poussés ; attente test utilisateur sur vrai cours.
- 2026-10-31 15:15 – Synchro rapide, surlignage exact, listes dans les boîtes livrés et poussés ; question ouverte : espace sur surlignage deux lignes.
- 2026-10-31 (soir) – /goal Tableau : masque par case livré, testé (ordinateur, tablette, téléphone), poussé ; puis correctif « espace entre deux lignes » livré et poussé.
