# Tests du 15/10 — boîtes, sélecteur de couleur, fiche jumelle (docs/compte-rendu-fiche-jumelle.md)

Outils de test, jamais chargés par l'app. Jamais le vrai cloud.

- Banc principal : Vite `:5199` SANS Supabase (`VITE_SUPABASE_URL= npx vite --port 5199`) + Chrome headless
  `--remote-debugging-port=9333`. Captures dans `../cap/` (exclu de git).
- `node gen-pdf.mjs <fx>` : cours 26 p., fiche 30 p. (12+13 fusionnées, 5 ajoutées), `fiche-dure.pdf`
  (très résumée), `fiche-v2.pdf` (remplacement : une page retirée, une déplacée, une annexe), `verite.json`.
- `node seed.mjs <fx>` : le cours « Physiologie rénale (jumelle) » ; `seed-scan.mjs <fx>` : sa version scannée
  (images seules, l'OCR de l'app la traite).
- `./tout.sh <fx>` rejoue tout le chantier (153 vérifications) + les taux de correspondance.
- `t-jumelle-synchro.mjs <fx>` : deux appareils — `node ../faux-supabase.mjs`, Vite `:5300` avec
  `VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_ANON_KEY=cle-de-test`, Chrome 9335 (A) et 9336 (B),
  profils séparés et neufs.
- `t-jumelle-ocr.mjs <fx>` : après `seed-scan.mjs` et la fin de l'OCR (≈ 40 s pour 26 pages).
- `r-couleur-avant.mjs` : reproduction du bug du sélecteur sur l'ancien code (à servir par `git worktree`).
