<!-- PASSATION:DEBUT -->
# 🔁 Passation – My Org (MedRevise)
_Mise à jour le 2026-10-31 à 20:55 (/goal suppressions volontaires)_

## 🎯 Objectif
SPA Vite + React (hub + MealWeek + MedRevise), déployée sur Vercel au push sur `main`.
Session du 31/10 : cartes Tableau à masque choisi (/goal) + correctif « espace entre deux lignes » d'un surlignage PDF.

## ✅ Fait (vérifié, poussé, main == origin/main)
- Synchro rapide au retour, surlignage aux bornes exactes, listes dans les boîtes : compte rendu `docs/compte-rendu-synchro-rapide-surlignage-listes.md` (commits 94e0583…3e5e0cd).
- Cartes Tableau, masque choisi (case / ligne / colonne / nom) : champ additif `tableau.masque = {cellules: bool[][], noms: bool[]}` (absent = tout masqué, noms visibles ; écrit seulement s'il diffère du défaut). Fichiers : `lib/carteTableau.js`, `components/FlashcardTableau.jsx` (œils `data-oeil`, menu « Masquage »), `styles/flashcard-tableau.css`, `lib/importFlashcards.js`, `lib/exportFlashcards.js`. Banc `scripts/tests-tableau-masque/tout.sh` : 25 + 25 (tablette) + 27 + 15 ✅ ; Vitest `tests/tableau-masque` 8 ✅. Compte rendu `docs/compte-rendu-flashcards.md` § « Tableau : choisir ce qui est masqué ». Commits b6a5b83, f17aa2f, 519bf7a.
- Surlignage sur deux lignes : `pdf/pdfShared.js#texteDeRange` (espace entre morceaux sur lignes différentes, `\n` sur `<br>`), utilisé dans `pdf/PdfPage.jsx` ; anciens surlignages ancrés et non réécrits. Banc `scripts/tests-surlignage-listes/t-deux-lignes.mjs` 16 ✅. Commits 5c9b1c1, 6d32970.
- `npm test` 242/243 (seul échec connu `crayon › trois épaisseurs`), build vert. MealWeek et `src/shared/` intacts.

- Contrôle d'intégrité : les suppressions faites depuis l'interface ne déclenchent plus l'alerte. Diagnostic en lecture seule : 12 flashcards disparues, toutes supprimées à la main les 26 et 28/10 (confirmé par l'utilisateur). Registre `suppressionsVolontaires:<appareil>` (store `prompts`, synchronisé) écrit avant chaque `remove` de questions venant de l'interface ; la « baisse » ne compte plus que les ids absents du registre ; les 12 ids sont dans `integrite/suppressions.js`. Bancs `scripts/tests-suppressions-volontaires/tout.sh` ✅ (dont deux appareils sur le faux Supabase), Vitest `tests/suppressions-volontaires` 7 ✅, synchro rapide 15 ✅. Compte rendu `docs/diagnostic-elements-manquants.md`.

## 🚧 En cours
- Rien. Modifications non commitées : aucune.

## ➡️ Prochaines étapes (dans l'ordre)
1. Vérifier sur le vrai appareil qui affichait l'alerte qu'elle a disparu après le déploiement. 2. Attendre le retour de l'utilisateur après test sur un vrai cours : synchro au retour, surlignage PDF PowerPoint/Word (dont passage à la ligne → texte dans l'onglet Notions), collage Word, transcription Début/Fin, cartes Tableau masquées. Ne rien lancer sans sa demande.

## 🧭 Décisions prises (ne pas rediscuter)
- Synchro complète seulement : 1er démarrage, erreur/incomplet, « Forcer la synchro » ; sinon incrémentale (curseur IndexedDB `meta.synchro.curseur`).
- Fusion de deux surlignages contigus de même couleur = voulu.
- Cartes Tableau issues d'une boîte-tableau (`grille`) : révision d'avant gardée (hors périmètre, pas d'éditeur).
- Téléphone sans éditeur de carte : éditeur tactile testé sur tablette 820×1180.

## 🛠️ Commandes utiles
- Build : `npx vite build` · Tests : `npm test`
- Serveurs de banc dans `.claude/launch.json` : `medrevise-banc` (:5302 sans Supabase), `faux-supabase` (:54399), `medrevise-faux-cloud` (:5300).
- Bancs navigateur : Vite sans Supabase (`VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vite --port 5302`), Chrome headless CDP 9337 (1440×900) / 9338 (390×844), profils neufs dans le scratchpad ; `CDP_PORT=9337 CDP_FILTRE=5302 FX=<dossier PDF>` pour t-deux-lignes (PDF imprimé par Chrome, recette dans le compte rendu).
- Banc synchro : `scripts/faux-supabase.mjs` :54399 + Vite :5300 + `scripts/tests-synchro-rapide/tout.sh`.

## ⚠️ Pièges et préférences
- Ne jamais toucher MealWeek ni `src/shared/` ; jamais le vrai cloud (bancs = faux Supabase ou sans Supabase).
- Français ; commit + push autonomes, commits conventionnels, jamais de force push.
- Infobulles de l'app : `title` déplacé dans `data-infobulle` au survol.
- HMR Vite réinitialise l'état si un fichier est créé pendant un test (t-revision écrit son fichier temporaire au début).
- Chrome headless audio bloqué sur ce Mac (transcription non testable bout en bout).
<!-- PASSATION:FIN -->

## Historique des clôtures
- 2026-10-31 20:55 – /goal : diagnostic des 12 flashcards manquantes (suppressions manuelles confirmées), alerte d'intégrité corrigée pour les suppressions volontaires, testée et poussée.
- 2026-10-31 20:09 – Tableau masque choisi + espace deux lignes livrés, poussés ; attente test utilisateur sur vrai cours.
- 2026-10-31 15:15 – Synchro rapide, surlignage exact, listes dans les boîtes livrés et poussés ; question ouverte : espace sur surlignage deux lignes.
- 2026-10-31 (soir) – /goal Tableau : masque par case livré, testé (ordinateur, tablette, téléphone), poussé ; puis correctif « espace entre deux lignes » livré et poussé.
