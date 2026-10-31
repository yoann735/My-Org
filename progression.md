<!-- PASSATION:DEBUT -->
# 🔁 Passation – My Org (MedRevise)
_Clôturée le 2026-10-31 à 15:15_

## 🎯 Objectif
SPA Vite + React (hub + MealWeek + MedRevise), déployée sur Vercel au push sur `main`.
Session : 3 corrections MedRevise (synchro rapide, surlignage précis, listes dans les boîtes) + intégrations « fiches multiples / Diapo d'origine / transcription marque le cours ».

## ✅ Fait (vérifié)
- Synchro incrémentale au retour sur l'app : `data/sync.js` (etatLegerCloud, pullDepuis, pullParIds), `lib/storage.js#syncRapide`, porte `lib/synchroAffichage.js` (passeRapide / verifierFond), `MedReviseApp.jsx`. Banc : 10,8 s → 0,2 s sans changement, ~2 s après 10 réponses.
- Surlignage aux bornes exactes (largeurs de glyphes pdf.js `fontExtraProperties`) : `pdf/pdfShared.js` (« BORNES EXACTES »), `pdf/PdfPage.jsx`, `pdf/pdfjsSetup.js` ; rendu 4 px / 2 px / 45 % (`styles/pdfreader-v2.css`, `styles/notes-doc.css`).
- Listes : `styles/listes.css`, `lib/collageListes.js` (Word/GDocs/Notion), `components/Tex.jsx`, `lib/boiteVersCarte.js`, `pdf/exportAnnote.js`.
- Compte rendu : `docs/compte-rendu-synchro-rapide-surlignage-listes.md`. Commits 94e0583, 7a268da, 28f1a75, 2004c73, 3e5e0cd (poussés).
- `.claude/launch.json` lance `node` depuis le PATH (4a47f65).
- (31/10, /goal) Cartes Tableau : choisir ce qui est masqué (case, ligne, colonne, nom de colonne). Champ additif `tableau.masque` (absent = tout masqué, noms visibles), éditeur à œils + hachurage + menu « Masquage », révision / vue agrandie / Apprentissage, import / export / format attendu. Commits b6a5b83, f17aa2f + docs. Banc `scripts/tests-tableau-masque/tout.sh` (Vite :5302 sans Supabase, Chrome 9337/9338) : 25 + 25 (tablette) + 27 + 15 ✅ ; Vitest `tests/tableau-masque` 8 ✅. Compte rendu : `docs/compte-rendu-flashcards.md` § « Tableau : choisir ce qui est masqué ». Doute noté : les cartes Tableau faites d'une boîte-tableau (`grille`) gardent leur révision d'avant (hors périmètre, pas d'éditeur pour elles).

## 🚧 En cours (point d'arrêt exact)
- Rien en cours. (31/10) Espace manquant d'un surlignage sur deux lignes CORRIGÉ (feu vert reçu) : `pdfShared.js#texteDeRange`, anciens surlignages gardés tels quels ; banc `scripts/tests-surlignage-listes/t-deux-lignes.mjs` 16 ✅ ; compte rendu § « Espace entre deux lignes ».
- Modifications non commitées : aucune.

## ➡️ Prochaines étapes (dans l'ordre)
1. (fait le 31/10) correctif « espace entre deux lignes ».
2. Faire tester par l'utilisateur sur un vrai cours : synchro au retour, surlignage PDF PowerPoint/Word, collage Word, transcription (Début/Fin).

## 🧭 Décisions prises (ne pas rediscuter)
- Synchro complète seulement : 1er démarrage (pas de curseur), erreur serveur/incomplet, « Forcer la synchro » ; coupure réseau = reprise incrémentale.
- Curseur dans IndexedDB `meta` (`synchro.curseur`), pas localStorage – disparaît avec les données.
- Contrôle « lignes vivantes cloud = local » : sinon synchro complète, jamais « À jour » à tort.
- Répartition proportionnelle du reliquat de largeur (mesuré meilleur que sur les espaces).
- Fusion de deux surlignages contigus de même couleur = comportement voulu de l'app.

## 📁 Fichiers clés
- `scripts/tests-synchro-rapide/` (mesure.mjs, t-synchro.mjs, tout.sh, mesures-*.json)
- `scripts/tests-surlignage-listes/` (t-surlignage.mjs, t-listes.mjs, sonde-bornes.mjs)
- `tests/synchro-rapide/`, `tests/listes/` (vitest)
- `scripts/faux-supabase.mjs` (tri `order`, filtres gte, projection `select`)

## 🛠️ Commandes utiles
- Build : `npx vite build` · Tests : `npm test` (seul échec connu : `crayon › trois épaisseurs`)
- Banc synchro : faux Supabase :54399 (`JOURNAL=1 CONTRAINTE_RATING=0 node scripts/faux-supabase.mjs`), Vite :5300 avec `VITE_SUPABASE_URL=http://localhost:54399`, Chrome headless 9335/9336 ouverts sur http://localhost:5300/, puis `scripts/tests-synchro-rapide/tout.sh`
- Banc lecteur : Vite :5199 sans Supabase + Chrome headless 9333 sur http://localhost:5199/ ; `FX=<dossier des PDF de test>` (polices.pdf, scan.pdf fabriqués par impression Chrome – dossier scratchpad, non conservé)

## ⚠️ Pièges et préférences
- Ne jamais toucher MealWeek ni `src/shared/` ; ne jamais toucher au vrai cloud (bancs = faux Supabase).
- Réponses et UI en français ; commit + push autonomes (commits conventionnels), jamais de force push.
- L'utilisateur veut des intégrations prudentes, sans casser l'existant, et vérifiées en vrai (pas de maquette « pixel » non comparée).
- Boîtes du lecteur mises à l'échelle par `scale` : mesurer em = taille calculée × échelle.
- Chrome headless audio bloqué sur ce Mac (test transcription bout en bout impossible).
<!-- PASSATION:FIN -->

## Historique des clôtures
- 2026-10-31 15:15 – Synchro rapide, surlignage exact, listes dans les boîtes livrés et poussés ; question ouverte : espace sur surlignage deux lignes.
- 2026-10-31 (soir) – /goal Tableau : masque par case livré, testé (ordinateur, tablette, téléphone), poussé ; puis correctif « espace entre deux lignes » livré et poussé.
