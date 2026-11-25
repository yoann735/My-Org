#!/bin/sh
# Rejoue tout le banc « section Exos » (docs/compte-rendu-section-exos.md). Prérequis (.claude/launch.json) :
#   « faux-supabase » (:54399), « medrevise-faux-cloud » (Vite :5300), et pour MealWeek « mealweek-avant-exos » /
#   « mealweek-apres-exos » (builds de production avant / après). Chrome headless MUET lancé par commun.mjs.
cd "$(dirname "$0")"
set -e
# iPad tactile : sa propre série (chaque t-creation repart de zéro)
node t-creation.mjs ipad; node t-lecteurs.mjs ipad; node t-modification.mjs ipad
# ordinateur, téléphone, deux appareils, non-régression, MealWeek
node t-creation.mjs ordi; node t-lecteurs.mjs ordi; node t-modification.mjs ordi; node t-glisser.mjs
node t-lecteurs.mjs tel; node t-telephone.mjs
node t-synchro.mjs
node t-nonreg.mjs
node t-mealweek.mjs
