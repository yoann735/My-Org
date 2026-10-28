#!/bin/zsh
# Banc « Échap n'annule plus / ligne Topographie » (28/10, docs/compte-rendu-flashcards.md). Démarrage : Vite :5302 SANS
# Supabase + Chrome headless 9337 (ordinateur, 1440×900) / 9338 (téléphone, 390×844), profils neufs — voir commun.mjs.
# FX = dossier de PDF de test (node ../tests-fiche-jumelle/gen-pdf.mjs <dossier>) pour t-boite.mjs.
cd ${0:a:h}
S=../tests-par-cours-elements
node $S/seed.mjs && node t-echap.mjs && node t-echap.mjs tablette && node $S/seed.mjs && node t-topographie.mjs \
  && node $S/seed.mjs tel && node t-mobile.mjs && CDP_PORT=9337 CDP_FILTRE=5302 node t-boite.mjs
