#!/bin/zsh
# banc complet « Tableau : choisir ce qui est masqué » (31/10). Démarrage (voir commun.mjs) : Vite :5302 SANS Supabase
# (VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= node node_modules/vite/bin/vite.js --port 5302) + Chrome headless
# --remote-debugging-port=9337 (1440×900) et 9338 (390×844), --user-data-dir neufs, sur http://localhost:5302/.
cd ${0:a:h}
S=../tests-par-cours-elements/seed.mjs
node $S && node t-editeur.mjs && node t-revision.mjs \
  && node $S && node t-editeur.mjs tablette \
  && node $S tel && node t-mobile.mjs
