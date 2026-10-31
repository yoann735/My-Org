#!/bin/zsh
# Banc « suppressions volontaires » (31/10, docs/diagnostic-elements-manquants.md). Deux installations, profils NEUFS,
# jamais le vrai cloud :
#  - sans Supabase : Vite :5302 (launch.json « medrevise-banc ») + Chrome headless 9337 (1440×900) → t-suppressions.mjs, t-reconnaitre.mjs
#  - faux Supabase :54399 (« faux-supabase ») + Vite :5300 (« medrevise-faux-cloud ») + Chrome 9335 / 9336 → t-deux-appareils.mjs
cd ${0:a:h}
node ../tests-par-cours-elements/seed.mjs > /dev/null && node t-suppressions.mjs \
  && node ../tests-par-cours-elements/seed.mjs > /dev/null && node t-reconnaitre.mjs \
  && node ../tests-selection-passages/seed.mjs > /dev/null && node t-deux-appareils.mjs
