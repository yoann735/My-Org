# Tests « images / surlignage / JSON » (10/10) — voir docs/compte-rendu-images-surlignage-json.md

Outils de test, jamais chargés par l'app. Chrome headless isolé piloté en CDP (port 9333, `CDP_PORT`),
devant Vite local SANS Supabase (`VITE_SUPABASE_URL=` vide, port 5199). Les captures s'écrivent dans
`../cap/`, les fichiers de test se lisent dans `../fx/` (créer les deux dossiers à côté de celui des scripts).

- Fixtures : `page.html` / `image.html` → PNG par `Chrome --headless --screenshot`, puis
  `node fixtures.mjs` (dans `../fx`, avec pdf-lib du dépôt) → `texte.pdf` (2 pages de texte), `image.pdf` (OCR).
- `seed.mjs` : cours « PDF texte J » (5 boîtes sur la page 1), « PDF image J », « Document ancien J »
  (2 images FLOTTANTES dont une pivotée, à convertir), « Document neuf J ».
  `reset-doc2.mjs`, `nettoie.mjs <ficheId>`, `ouvrir-cours.mjs "<titre>"`, `etat-doc.mjs <ficheId>`.
- Chantier 1 : `t-images-doc.mjs` (4 chemins), `t-images-suite.mjs` (fin de page, déplacement, ⌘Z),
  `t-images-pdf.mjs` (PDF importé + onglet Notes).
- Chantier 2 : `t-surl-pdf.mjs <ficheId> "<ligne>" m1 m2 m3 m4` (texte natif / OCR), `t-surl-doc.mjs`,
  `t-surl-mots.mjs doc|pdf` (mots OCR des images), `t-souligne.mjs` (souligné + surligneur de fond).
- Chantier 3 : `t-json.mjs` (export, import, captures au pixel, bascules, réimport, édition, ⌘Z),
  `t-synchro.mjs` (2 appareils : `scripts/faux-supabase.mjs` + Vite :5300 avec
  `VITE_SUPABASE_URL=http://localhost:54399`, Chrome 9335 / 9336 profils séparés, `CDP_FILTRE=5300`).
- Tablette (820×1180, tactile émulé, tout dans une connexion) : `t-tablette-doc.mjs`, `t-tablette-json.mjs`.
- Non-régression : `surl-un.mjs` + `nr-page.mjs <nom>` (même page servie par l'ancienne version via
  `git worktree` sur le même port, puis la nouvelle → `cmp`).
