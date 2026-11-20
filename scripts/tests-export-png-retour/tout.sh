#!/bin/zsh
# Banc complet « Enregistrer un dessin en PNG · retour au cours depuis la barre de transcription » (20/11/2026).
# Prérequis (voir commun.mjs) : faux Deepgram :54400, Vite :5330 (chantier, sans cloud, clé Deepgram de test),
# Vite :5331 (code d'avant, cacheDir séparé), Chrome headless 9345 / 9346 / 9347 (profils neufs, micro simulé).
cd ${0:a:h}
mkdir -p resultats
for t in "t-png.mjs tel" "t-png.mjs ipad" "t-png.mjs ordi-etroit" "t-retour.mjs ordi" "t-retour.mjs tablette" "t-retour.mjs tel" "t-mealweek.mjs ordi" "t-mealweek.mjs tel"; do
  f="resultats/${t// /-}.txt"; f="${f/.mjs/}"
  node ${=t} > "$f" 2>&1; echo "$t → code $? ($(grep -c '✅' $f) ✅, $(grep -c '❌' $f) ❌)"
done
