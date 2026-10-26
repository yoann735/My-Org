#!/bin/zsh
# banc complet « Regrouper par cours / éléments à révéler » (démarrage : Vite :5302 sans Supabase + Chrome 9337 / 9338,
# voir commun.mjs). Le contrôle au pixel avant / après (t-pixel.mjs + px-diff.mjs) se fait à part (git stash).
cd ${0:a:h}
node seed.mjs && node seed.mjs tel && node t-seance.mjs && node t-seance.mjs tel \
  && node seed.mjs && node t-elements.mjs && node t-session-cours.mjs && node seed.mjs tel && node t-elements-mobile.mjs
