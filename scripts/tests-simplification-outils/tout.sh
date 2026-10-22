#!/bin/zsh
# Toute la suite du chantier, ordinateur + tablette (+ téléphone). Journaux dans $1 (défaut : /tmp/so-suite).
D=${1:-/tmp/so-suite}; mkdir -p $D; cd ${0:a:h}
for t a in t-barre "" t-barre tablette t-surligneur "" t-surligneur tablette t-mini-barres "" t-mini-barres tablette \
  t-boite-tableau "" t-boite-tableau tablette t-tableau-miro "" t-tableau-miro tablette t-document "" t-document tablette \
  t-texte "" t-texte tablette t-mobile "" t-surlignage-ocr apres; do
  n=$t${a:+-$a}; node $t.mjs $a > $D/$n.log 2>&1
  echo "$n : $(grep -c '^✅' $D/$n.log) ✅  $(grep -c '^❌' $D/$n.log) ❌  $(grep -c 'Error' $D/$n.log) erreur(s)"
done
grep -h "^❌\|Error" $D/*.log | cut -c1-250
