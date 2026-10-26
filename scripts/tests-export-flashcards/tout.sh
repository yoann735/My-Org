#!/bin/zsh
# banc complet « Export complet des flashcards » (26/10, docs/compte-rendu-export-flashcards.md).
# Démarrage : Vite :5302 SANS Supabase + Chrome headless C (9337, ordinateur) / D (9338, téléphone) — voir commun.mjs.
# La preuve « aucune écriture Supabase » (t-cloud.mjs) se lance à part, sur le banc du faux Supabase (Vite :5300 + Chrome A 9335).
cd ${0:a:h}
node seed.mjs && node seed.mjs tel && node t-export.mjs && node t-portees.mjs && node t-300.mjs && node t-mobile.mjs && node t-nr-import.mjs \
  && node nettoie.mjs && node nettoie.mjs tel
