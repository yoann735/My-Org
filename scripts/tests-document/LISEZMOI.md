# Tests du moteur de document paginé (08/10)

Outils de test, jamais chargés par l'app. Voir `docs/compte-rendu-document-engine.md`.

- `test-pagination.mjs` — cœur pur de la pagination (`node scripts/tests-document/test-pagination.mjs`).
- `conformite.mjs` — **conformité de l'export PDF** sur un document ouvert dans un Chrome headless
  piloté en CDP (port 9333) devant le serveur Vite local (`VITE_SUPABASE_URL=` vide : jamais le cloud) :
  1. structure : par page, mêmes blocs (et morceaux de blocs coupés), même ordre, même position,
     DOM de l'écran contre DOM imprimé ;
  2. visuel : profil d'encre de chaque page, capture de l'écran contre le PDF exporté (vrai bouton
     « Exporter en PDF » puis `Page.printToPDF`) rendu par pdf.js — bords des zones à ≤ 2 px.
  `cd scripts/tests-document && node conformite.mjs "Titre du document" prefixe` (captures, PDF et
  verdict dans `$CAP_DIR`, par défaut le dossier temporaire).
- `verif-flux.mjs` — relevé « rien ne déborde » : chaque ligne / élément / image dans la zone
  d'écriture de sa page, blocs par page.
