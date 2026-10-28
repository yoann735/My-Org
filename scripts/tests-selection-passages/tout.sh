#!/bin/zsh
# Banc « Apprentissage : sélection libre + compteur de passages » (28/10). Démarrage (profils NEUFS, jamais le vrai cloud) :
#   JOURNAL=1 CONTRAINTE_RATING=0 node ../faux-supabase.mjs
#   VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_ANON_KEY=cle-de-test npx vite --port 5300
#   Chrome headless --remote-debugging-port=9335 (1440×900) et 9336 (390×844), --user-data-dir neufs, sur http://localhost:5300/
cd ${0:a:h}
for t in "t-selection.mjs" "t-selection.mjs tel" "t-passages.mjs"; do
  node seed.mjs > /dev/null || exit 1
  echo "== $t"; node ${=t} | tee /dev/stderr | grep -q "tout est vert" || exit 1
done
