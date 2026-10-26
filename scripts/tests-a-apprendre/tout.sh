#!/bin/zsh
# banc complet « Flashcards : liste, Agrandir, À apprendre » — voir commun.mjs (démarrage : faux Supabase + Vite :5300 + Chrome 9335/9336)
cd ${0:a:h}
node reset.mjs && node t-liste.mjs && node t-mobile.mjs && node t-tablette.mjs && node t-apprentissage.mjs
