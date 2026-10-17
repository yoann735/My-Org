#!/bin/zsh
# Rejoue les tests Chrome de l'emploi du temps (banc : voir LISEZMOI.md).
cd "${0:A:h}"
for t in t-ecole t-changements t-reglages t-mobile t-hors-ligne t-grille; do
  r=$(node $t.mjs 2>&1)
  echo "$t : $(echo "$r" | grep -ac '✅') ✅  $(echo "$r" | grep -ac '❌') ❌"
  echo "$r" | grep -a '❌' || true
done
