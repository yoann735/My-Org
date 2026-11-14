#!/bin/sh
# Rejoue tout le banc « enregistrement » (voir commun.mjs pour l'installation : faux Supabase, faux GitHub, Vite :5303,
# Chrome headless 9335/9336/9337 aux profils neufs ; :5304 = code de départ pour MealWeek et les mesures).
cd "$(dirname "$0")"
node seed.mjs
for t in ordi tablette; do node t-ecriture.mjs $t; node t-synchro-historique.mjs $t; node t-non-regression.mjs $t; done
node t-telephone.mjs
node t-mealweek.mjs
