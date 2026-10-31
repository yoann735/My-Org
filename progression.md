<!-- PASSATION:DEBUT -->
# 🔁 Passation – My Org (MedRevise)
_Clôturée le 2026-10-31 à 20:09_

## 🎯 Objectif
SPA Vite + React (hub + MealWeek + MedRevise), déployée sur Vercel au push sur `main`.
Session du 31/10 : cartes Tableau à masque choisi (/goal) + correctif « espace entre deux lignes » d'un surlignage PDF.

## ✅ Fait (vérifié, poussé, main == origin/main)
- Synchro rapide au retour, surlignage aux bornes exactes, listes dans les boîtes : compte rendu `docs/compte-rendu-synchro-rapide-surlignage-listes.md` (commits 94e0583…3e5e0cd).
- Cartes Tableau, masque choisi (case / ligne / colonne / nom) : champ additif `tableau.masque = {cellules: bool[][], noms: bool[]}` (absent = tout masqué, noms visibles ; écrit seulement s'il diffère du défaut). Fichiers : `lib/carteTableau.js`, `components/FlashcardTableau.jsx` (œils `data-oeil`, menu « Masquage »), `styles/flashcard-tableau.css`, `lib/importFlashcards.js`, `lib/exportFlashcards.js`. Banc `scripts/tests-tableau-masque/tout.sh` : 25 + 25 (tablette) + 27 + 15 ✅ ; Vitest `tests/tableau-masque` 8 ✅. Compte rendu `docs/compte-rendu-flashcards.md` § « Tableau : choisir ce qui est masqué ». Commits b6a5b83, f17aa2f, 519bf7a.
- Surlignage sur deux lignes : `pdf/pdfShared.js#texteDeRange` (espace entre morceaux sur lignes différentes, `\n` sur `<br>`), utilisé dans `pdf/PdfPage.jsx` ; anciens surlignages ancrés et non réécrits. Banc `scripts/tests-surlignage-listes/t-deux-lignes.mjs` 16 ✅. Commits 5c9b1c1, 6d32970.
- `npm test` 235/236 (seul échec connu `crayon › trois épaisseurs`), build vert. MealWeek et `src/shared/` intacts.

## 🚧 En cours
- Rien. Modifications non commitées : aucune.

## ➡️ Prochaines étapes (dans l'ordre)
1. Attendre le retour de l'utilisateur après test sur un vrai cours : synchro au retour, surlignage PDF PowerPoint/Word (dont passage à la ligne → texte dans l'onglet Notions), collage Word, transcription Début/Fin, cartes Tableau masquées. Ne rien lancer sans sa demande.

## 🧭 Décisions prises (ne pas rediscuter)
- Synchro complète seulement : 1er démarrage, erreur/incomplet, « Forcer la synchro » ; sinon incrémentale (curseur IndexedDB `meta.synchro.curseur`).
- Fusion de deux surlignages contigus de même couleur = voulu.
- Cartes Tableau issues d'une boîte-tableau (`grille`) : révision d'avant gardée (hors périmètre, pas d'éditeur).
- Téléphone sans éditeur de carte : éditeur tactile testé sur tablette 820×1180.

## 🛠️ Commandes utiles
- Build : `npx vite build` · Tests : `npm test`
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
- 2026-10-31 20:09 – Tableau masque choisi + espace deux lignes livrés, poussés ; attente test utilisateur sur vrai cours.
- 2026-10-31 15:15 – Synchro rapide, surlignage exact, listes dans les boîtes livrés et poussés ; question ouverte : espace sur surlignage deux lignes.
- 2026-10-31 (soir) – /goal Tableau : masque par case livré, testé (ordinateur, tablette, téléphone), poussé ; puis correctif « espace entre deux lignes » livré et poussé.
