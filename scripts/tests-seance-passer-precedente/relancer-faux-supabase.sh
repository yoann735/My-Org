#!/bin/sh
# Remet à zéro le faux Supabase :54399 (en mémoire) avant chaque passage du banc : un passage précédent ne doit rien laisser au « cloud ».
pkill -f "scripts/faux-supabase.mjs" ; sleep 1
cd "$(dirname "$0")/../.." && JOURNAL=1 nohup node scripts/faux-supabase.mjs > "${TMPDIR:-/tmp}/faux-supabase-54399.log" 2>&1 &
sleep 1.5
