#!/bin/sh
# Rejoue tout le banc « dates de transcript dans la Bibliothèque » (docs/compte-rendu-filtre-dates-transcript.md).
# Prérequis (.claude/launch.json) : « medrevise-banc » (:5302), « dates-avant » (:5331, code d'avant le chantier),
# « faux-supabase » (:54399) + « medrevise-faux-cloud » (:5300) ; pour t-mealweek : « mealweek-avant-dates » (:5333)
# et « mealweek-apres-dates » (:5334). Chrome headless MUET (--mute-audio).
cd "$(dirname "$0")"
set -e
node t-biblio.mjs ordi
node t-biblio.mjs ipad
node t-telephone.mjs
node t-synchro.mjs
node t-perf.mjs
[ "$SANS_MEALWEEK" = 1 ] || node t-mealweek.mjs
