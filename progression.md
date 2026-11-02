<!-- PASSATION:DEBUT -->
# 🔁 Passation – My Org (MedRevise)
_Mise à jour le 2026-11-02 (après-midi)_

## 🎯 Objectif
SPA Vite + React (hub + MealWeek + MedRevise), déployée sur Vercel au push sur `main`.
Session du 02/11 : /goal « surlignage décalé du PdfReader » (« corps virtuel » → « rps virt »), terminé.

## ✅ Fait (vérifié, poussé)
- Antérieur : intégrité (registre des suppressions volontaires, écran Intégrité : commits 7fe5945 → 0416252) ; synchro rapide, surlignage, listes, cartes Tableau (voir docs/).
- 02/11 — surlignage aligné (`docs/compte-rendu-surlignage-alignement.md`) :
  - CAUSE : couche invisible en sans-serif (lettres à côté de l'encre, jusqu'à 7 px à 100 %) + étirement mesuré avec getBoundingClientRect, donc faux d'un facteur k si la couche est construite pendant un pincement / Ctrl+molette (10 à 19 % mesurés) → plage enregistrée décalée (« ple positif (« un pa » pour « exemple positif »).
  - CORRECTION (`pdf/pdfShared.js`) : un span par morceau pdf.js (index et ancres inchangés) contenant un span par caractère posé et étiré aux largeurs de glyphes du PDF ; largeurs lues hors transformation ; rectangles via Range.getClientRects ; accès par `itemsCouche` / `pointDeChar` / `itemDeNoeud` (plus jamais `querySelectorAll('span')` ni `firstChild`) ; export (PDF annoté, PNG, IA) recalculé depuis les ancres (`surlignagesAlignes`), rien réécrit en base.
  - TESTS : `scripts/tests-surlignage-alignement/` — t-cas 16/16 (titres gras, courant, italique, 7 pt, Courier, 3 PDF, OCR, deux lignes, début/fin de ligne, zooms 50/100/200, Retina, iPad doigt + stylet émulés), t-anciens 5/5 (surlignages posés par l'ancien code), t-nonreg 14/14 (⌘F, notion, carte du tableau, export, perf 6–31 ms/page, 0 erreur console), t-mealweek ✅. Build vert ; npm test 244/246 (crayon › trois épaisseurs et /api/timetable › cache : déjà en échec avant).
  - Commits cf5acd6, e42bdf4, f142bdf + commit du compte rendu.

## 🚧 En cours
- Rien. Non vérifié : iPad RÉEL (tests en émulation Chrome) ; déploiement Vercel READY.

## ➡️ Prochaines étapes (dans l'ordre)
1. Attendre le retour de l'utilisateur : surlignage sur iPad réel (doigt, stylet), après un pincement ; écran Intégrité (10 cartes, bouton « C'est moi… »).
2. Retour du test sur un vrai cours (synchro, collage Word, transcription, cartes Tableau masquées).

## 🧭 Décisions prises (ne pas rediscuter)
- Une plage de surlignage enregistrée fausse AVANT le 02/11 se réaffiche sur ses caractères enregistrés (pas de « devinette ») : la repasser au surligneur.
- Bornes d'un glisser : lettre prise à 20 % de sa largeur, ponctuation / espace à 50 %.
- Fusion des surlignages contigus de même couleur = voulu (y compris d'un morceau au suivant).
- Registre des suppressions par appareil, 120 jours ; « Tout effacer » et restauration restent signalés ; alerte fondée sur les ids disparus.

## 🛠️ Commandes utiles
- Build : `npx vite build` · Tests : `npm test`
- Serveurs de banc (`.claude/launch.json`, via preview_start) : `medrevise-banc` (:5302 sans Supabase), `faux-supabase` (:54399), `medrevise-faux-cloud` (:5300).
- Chrome headless isolé : `--remote-debugging-port=9337` sur :5302, profil neuf dans le scratchpad.
- Banc surlignage : `CDP_PORT=9337 CDP_FILTRE=5302 FX=<dossier des PDF> node scripts/tests-surlignage-alignement/t-cas.mjs` (PDF : voir § 5 du compte rendu).
- Copies GitHub : dépôt privé `yoann735/medrevise-backups`.

## ⚠️ Pièges et préférences
- Ne jamais toucher MealWeek ni `src/shared/` ; jamais le vrai cloud dans les bancs ; données réelles en lecture seule.
- Français ; commit + push autonomes, conventionnels, jamais de force push. Un processus « sync auto » commite parfois seul.
- Bancs : recliquer un outil actif le désactive (helper `b.surligneur()`) ; `new URL(...).pathname` encode les accents du chemin → utiliser `fileURLToPath`.
- Le middleware de dev (`vite.config.js`) lit le corps JSON seulement pour `/api/backup-cartes`.
<!-- PASSATION:FIN -->

## Historique des clôtures
- 2026-11-02 11:11 – Cartes manquantes : suppressions volontaires, bouton « C'est moi… », cartes disparues reconnaissables (recto, cours) ; poussé, attente retour utilisateur.
- 2026-10-31 20:55 – /goal : diagnostic des 12 flashcards manquantes (suppressions manuelles confirmées), alerte d'intégrité corrigée pour les suppressions volontaires, testée et poussée.
- 2026-10-31 20:09 – Tableau masque choisi + espace deux lignes livrés, poussés ; attente test utilisateur sur vrai cours.
- 2026-10-31 15:15 – Synchro rapide, surlignage exact, listes dans les boîtes livrés et poussés ; question ouverte : espace sur surlignage deux lignes.
- 2026-10-31 (soir) – /goal Tableau : masque par case livré, testé (ordinateur, tablette, téléphone), poussé ; puis correctif « espace entre deux lignes » livré et poussé.
