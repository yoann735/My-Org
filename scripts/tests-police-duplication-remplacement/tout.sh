#!/bin/zsh
# Banc complet « taille de police · duplication · remplacement par un PDF » (20/11/2026).
# Prérequis : faux Supabase (relancé par chaque passage), Vite :5320 (VITE_SUPABASE_URL=http://localhost:54399),
# Vite :5321 = code d'avant le chantier (captures « avant », sans cloud), Chrome headless 9345 / 9346 / 9347 (profils neufs).
cd ${0:a:h}
mkdir -p resultats
fermer() { for p in 9345 9346 9347; do curl -s localhost:$p/json | python3 -c "
import json,sys,urllib.request
for t in json.load(sys.stdin):
  if t['type']=='page' and t['url'].startswith('chrome://'): urllib.request.urlopen(urllib.request.Request('http://localhost:$p/json/close/'+t['id'], method='PUT'))
"; done; }
for t in "t-police.mjs ordi" "t-police.mjs tablette" "t-copie.mjs ordi" "t-copie.mjs tablette" "t-remplacement.mjs ordi" "t-remplacement.mjs tablette" "t-nonreg.mjs ordi" "t-nonreg.mjs tablette"; do
  fermer
  f="resultats/${t// /-}.txt"; f="${f/.mjs/}"
  node ${=t} > "$f" 2>&1; echo "$t → code $? ($(grep -c '✅' $f) ✅, $(grep -c '❌' $f) ❌)"
done
