#!/bin/zsh
# Tests du chantier « tris de la Bibliothèque · menu Fichier unique » (15/10) — banc LOCAL :
# Vite :5199 sans Supabase + Chrome headless 9333. Usage : tout.sh <PDF à importer>
PDF=$1; cd "$(dirname "$0")"
node seed-biblio.mjs > /dev/null; node seed-menu.mjs > /dev/null
for t in "t-biblio-tris $PDF" t-biblio-tablette t-menu-fichier t-menu-actions t-menu-tablette; do
  set -- ${=t}; r=$(node $1.mjs $2 2>&1); echo "${t%% *} : $(echo "$r" | grep -ac '^✅') ✅  $(echo "$r" | grep -ac '^❌') ❌"; echo "$r" | grep -a '^❌'
  node seed-biblio.mjs > /dev/null
done
