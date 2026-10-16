#!/bin/zsh
# Tests du chantier du 16/10 (carnet · apprentissage · menu Copier · fichiers d'un cours) — banc LOCAL :
# Vite :5199 sans Supabase + Chrome headless 9333. Usage : tout.sh <dossier fx> (cours-v2.pdf : gen-cours-v2.mjs ;
# trop-lourd.pdf : mkfile -n 101m)
FX=$1; cd "$(dirname "$0")"
compte() { echo "$1 : $(echo "$2" | grep -ac '^✅') ✅  $(echo "$2" | grep -ac '^❌') ❌"; echo "$2" | grep -a '^❌'; }
node seed-carnet.mjs > /dev/null
compte t-carnet "$(node t-carnet.mjs 2>&1)"
node seed-carnet.mjs > /dev/null; compte t-carnet-tablette "$(node t-carnet.mjs 1180 820 tablette 2>&1)"
node seed-carnet.mjs > /dev/null; compte t-carnet-telephone "$(node t-carnet-telephone.mjs 2>&1)"
node seed-carnet.mjs > /dev/null; node seed-apprentissage.mjs > /dev/null
compte t-apprentissage "$(node t-apprentissage.mjs 2>&1)"
compte t-apprentissage-mobile "$(node t-apprentissage-mobile.mjs 2>&1)"
compte t-transcript-copie "$(node t-transcript-copie.mjs 2>&1)"
node seed-fichiers.mjs > /dev/null
compte t-fichiers "$(node t-fichiers.mjs $FX 2>&1)"
compte t-fichiers-tablette "$(node t-fichiers-tablette.mjs 2>&1)"
