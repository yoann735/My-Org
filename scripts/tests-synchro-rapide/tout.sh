#!/bin/zsh
# Banc « synchro rapide » (29/10). Prérequis, profils NEUFS, jamais le vrai cloud :
#   JOURNAL=1 CONTRAINTE_RATING=0 node ../faux-supabase.mjs
#   VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_ANON_KEY=cle-de-test npx vite --port 5300
#   Chrome headless --remote-debugging-port=9335 (1440×900) et 9336 (390×844), --user-data-dir neufs, sur http://localhost:5300/
# mesure.mjs <etiquette> écrit mesures-<etiquette>.json ; t-synchro.mjs joue les scénarios (dont 5 min d'attente réelle).
cd ${0:a:h}
node ../tests-selection-passages/seed.mjs > /dev/null || exit 1
node mesure.mjs ${1:-apres} || exit 1
node t-synchro.mjs $2 | tee /dev/stderr | grep -q "tout est vert"
