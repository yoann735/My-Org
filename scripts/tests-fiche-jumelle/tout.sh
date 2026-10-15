#!/bin/zsh
# Rejoue tous les tests du chantier (15/10) sur le banc : Vite :5199 SANS Supabase + Chrome headless 9333
# (voir LISEZMOI.md). Usage : tout.sh <dossier fx de gen-pdf.mjs>
FX=$1; cd "$(dirname "$0")"
for t in t-couleurs-boite t-couleurs-outils t-couleurs-doigt t-telephone t-jumelle-import t-jumelle-bascule t-jumelle-calques t-jumelle-cote t-jumelle-editeur t-jumelle-tablette t-jumelle-remplacer; do
  r=$(node $t.mjs $FX 2>&1); ok=$(echo "$r" | grep -c "^✅"); ko=$(echo "$r" | grep -c "^❌")
  echo "$t : $ok ✅  $ko ❌"; [ $ko -gt 0 ] && echo "$r" | grep "^❌"
done
for f in fiche.pdf fiche-dure.pdf fiche-v2.pdf; do echo "correspondance $f : $(node t-correspondance.mjs $FX $f | grep 'bien classées')"; done
