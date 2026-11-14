<!-- PASSATION:DEBUT -->
# 🔁 Passation – My Org (MedRevise)
_Clôturée le 2026-11-14 à 16:39_

## 🎯 Objectif
SPA Vite + React (hub + MealWeek + MedRevise), déployée sur Vercel (projet `my-org`) au push sur `main`.
Session /goal du 07/11 : (1) compteur de vues par carte dans le panneau Apprendre, (2) agrandissement plein écran des images de flashcard en révision sans retourner la carte. Terminé, poussé, déployé (Vercel « success » sur 7048c82).

## ✅ Fait (vérifié, poussé : 009298f, df416f6, a403221, 7048c82)
- Compteur : `src/medrevise/lib/vuesCartes.js` (un seul calcul, depuis le journal local : rating 1..4 ; relearn compte ; « Passer en révision » et mode Apprentissage non). Une passe 1,2 s après l'ouverture de l'app, puis mise à jour incrémentale (`journal/journal.js` transmet les entrées nouvelles à ses abonnés). Aucun stockage ajouté.
- Affichage : `components/BadgeVues.jsx` (classe `alib2-nbvues`, œil en masque CSS), menu Tri (Ordre du cours / Moins passées / Moins vues → plus vues / Plus vues → moins vues), filtre Vues 0 · 1–2 · 3–5 · 6–10 · >10 (`apprentissageLibre/tableauBord.js`, `EcranApprentissage.jsx`).
- Visionneuse unique : `components/Visionneuse.jsx` + `useAgrandir`, `styles/visionneuse.css`. Branchée sur `ImageFlashcard`, `OcclusionView` (état affiché, rien révélé) et la visionneuse Muscle (`ImagesMuscle.jsx`) ; prop `agrandissable` dans SeanceFC, Session, MobileSession, FaceCarte. `VueAgrandie` laisse Échap à `.vz-fond`.
- Diagnostic (sauvegarde d5ddbe0) : journal depuis le 10/10/2026 19:12 UTC, 1 050 notations, complet en local après synchro ; écarts avec reps expliqués (relearn −1, historique antérieur +2/+3).
- Tests : vitest 261/263 (2 échecs anciens : crayon, emploi du temps) ; bancs `scripts/tests-vues-zoom` verts sur ordinateur, tablette, téléphone (t-vues 33/33/31, t-zoom 93/91/91) ; panneau Apprendre pas plus lent (médianes ±3 ms) ; MealWeek identique octet pour octet.
- Compte rendu : `docs/compte-rendu-compteur-vues-et-zoom-image.md` (captures dans `docs/img/vues-zoom/`).

## 🚧 En cours
- Rien. Modifications non commitées : aucune (avant cette clôture). `progression.md` est modifié par cette clôture.

## ➡️ Prochaines étapes (dans l'ordre)
1. Attendre le feu vert ou la nouvelle demande de l'utilisateur.
2. Côté utilisateur : essayer sur le vrai iPad et le vrai téléphone (toucher une image en séance → visionneuse ; compteur œil dans Apprendre).
3. Toujours en attente côté utilisateur : CLI Vercel (`npm i -g vercel`, `vercel login`, `vercel link --yes --project my-org`) et migration `supabase/migrations/20261024_review_log_evenements.sql`.

## 🧭 Décisions prises (ne pas rediscuter)
- Vue = notation aux 4 boutons dans le journal (définition de l'utilisateur) ; compte depuis le 10/10 seulement.
- Tris « vues » dans chaque cours (comme « Moins passées d'abord »), rangement Section → Matière → Cours conservé.
- Bouton « Révéler » de la visionneuse Muscle gardé (fonction existante, n'agit que dans la visionneuse).

## 🛠️ Commandes utiles
- Build : `npm run build` · Tests : `npx vitest run`
- Bancs : preview_start `faux-supabase`, `faux-github`, `medrevise-banc-sauvegarde` (:5303) + Chrome headless 9335 (1440×900), 9336 (390×844), 9337 (1024×1366), profils neufs dans le scratchpad → `cd scripts/tests-vues-zoom && node seed.mjs && node t-vues.mjs ordi|tel|tablette` ; `node t-zoom.mjs …` ; mesure : `node mesure.mjs <étiquette> ordi [ouvert]`.

## ⚠️ Pièges et préférences
- Ne jamais toucher MealWeek ni `src/shared/` ; aucune écriture Supabase ; ne pas ouvrir l'app réelle ; aucun secret affiché.
- Vite (banc) peut planter en boucle de rechargement à chaud (cycle ImagesMuscle ↔ ZoneImage) après beaucoup d'éditions : relancer le serveur.
- Mesures de vitesse très bruitées d'un lancement à l'autre : comparer le code de départ servi sur le MÊME port et les mêmes données.
- `t-zoom` note les cartes image : relancer `node seed.mjs` avant chaque banc.
- Connecteur Vercel MCP ne voit pas le projet : `gh api repos/yoann735/My-Org/commits/<sha>/statuses`.
- Dépôt PUBLIC (données réelles seulement dans le scratchpad) ; « sync auto » commite parfois seul ; français, commits conventionnels, jamais de force push.
<!-- PASSATION:FIN -->

## Historique des clôtures
- 2026-11-14 16:39 – /goal compteur de vues (œil, tris, filtre) + visionneuse d'image plein écran en révision : livrés, testés 3 appareils, poussés, déployés (7048c82).
- 2026-11-07 17:20 – /goal sauvegarde + statut synchro : sauvegarde jamais arrêtée, rattrapage ajouté, 19 « en attente » = faux compteur (srcId bfc), état unique ; poussé, déployé, copie prod d5ddbe0.
- 2026-11-07 16:35 – /goal environnement : tout vérifié (build, prod Ready, sauvegarde 07/11), rapport poussé ; restent CLI Vercel et migration 20261024 à vérifier.
- 2026-11-02 11:11 – Cartes manquantes : suppressions volontaires, bouton « C'est moi… », cartes disparues reconnaissables (recto, cours) ; poussé, attente retour utilisateur.
- 2026-10-31 20:55 – /goal : diagnostic des 12 flashcards manquantes (suppressions manuelles confirmées), alerte d'intégrité corrigée pour les suppressions volontaires, testée et poussée.
- 2026-10-31 20:09 – Tableau masque choisi + espace deux lignes livrés, poussés ; attente test utilisateur sur vrai cours.
- 2026-10-31 15:15 – Synchro rapide, surlignage exact, listes dans les boîtes livrés et poussés ; question ouverte : espace sur surlignage deux lignes.
- 2026-10-31 (soir) – /goal Tableau : masque par case livré, testé (ordinateur, tablette, téléphone), poussé ; puis correctif « espace entre deux lignes » livré et poussé.
