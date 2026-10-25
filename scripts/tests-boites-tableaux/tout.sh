#!/bin/zsh
# Toute la suite du chantier « boîtes & tableaux » (25/10), ordinateur + tablette (+ téléphone). Journaux dans $1 (défaut : /tmp/bt-suite).
# Vite :5199 sans Supabase + Chrome headless 9333 (voir commun.mjs). t-mobile.mjs suit t-flashcard.mjs (il relit ses cartes).
D=${1:-/tmp/bt-suite}; mkdir -p $D; cd ${0:a:h}
for t a in t-tableau "" t-tableau tablette t-tableau-miro "" t-tableau-miro tablette t-tableau-doigt "" t-export-tableau "" \
  t-image "" t-image tablette t-document "" t-document tablette t-flashcard "" t-flashcard tablette t-mobile "" \
  t-exports "" t-exports tablette t-exports-doc "" t-exports-doc tablette t-tablette-selection ""; do
  n=$t${a:+-$a}; node $t.mjs $a > $D/$n.log 2>&1
  echo "$n : $(grep -c '^✅' $D/$n.log) ✅  $(grep -c '^❌' $D/$n.log) ❌  $(grep -c 'Error' $D/$n.log) erreur(s)"
done
grep -h "^❌\|Error" $D/*.log | cut -c1-250
