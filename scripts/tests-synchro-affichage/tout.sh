#!/bin/zsh
# Banc « synchro complète avant affichage » (28/10). Même installation que ../tests-selection-passages/tout.sh :
#   JOURNAL=1 CONTRAINTE_RATING=0 node ../faux-supabase.mjs   (faux cloud NEUF : jamais le vrai)
#   VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_ANON_KEY=cle-de-test npx vite --port 5300
#   Chrome headless 9335 (1440×900) et 9336 (390×844), profils neufs, sur http://localhost:5300/
cd ${0:a:h}
S=../tests-selection-passages
for t in t-demarrage t-horsligne t-ecrans t-seance-ouverte; do
  node $S/seed.mjs > /dev/null || exit 1
  echo "== $t"; node $t.mjs || exit 1
done
node cap-ordinateur.mjs
