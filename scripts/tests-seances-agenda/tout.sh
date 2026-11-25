#!/bin/sh
# Rejoue tout le banc « séances liées à l'agenda » (docs/compte-rendu-seances-liees-agenda.md).
# Prérequis (.claude/launch.json), à (re)lancer avant chaque série :
#   « faux-supabase » (:54399, VIDE : le relancer — l'horloge simulée repart du 17 nov. 10 h 30 à chaque passage),
#   « medrevise-faux-cloud » (:5300), « medrevise-banc » (:5302, sans cloud) ;
#   pour t-mealweek : « mealweek-avant-seances » (:5335, git archive 07ba376 construit) et « mealweek-apres-seances » (:5336, dist).
# Chrome headless MUET (--mute-audio), ports 9431-9434. Tests unitaires : npm test (tests/seances-agenda).
cd "$(dirname "$0")"
set -e
rm -f "${TMPDIR:-/tmp}/banc-section-exos/seances-agenda/ancre" # nouvelle série : horloge simulée remise au 17 nov. 10 h 30
node t-lecteur.mjs ordi & A=$!
node t-lecteur.mjs ipad & B=$!
node t-telephone.mjs & C=$!
wait $A; wait $B; wait $C
node t-synchro.mjs
[ "$SANS_MEALWEEK" = 1 ] || node t-mealweek.mjs
