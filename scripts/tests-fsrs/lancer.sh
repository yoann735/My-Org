#!/bin/zsh
# Banc FSRS étape 2 — lance le faux Supabase, Vite (code du dossier $1, défaut : le dépôt) et un Chrome
# headless par profil. Jamais le vrai cloud (VITE_SUPABASE_URL pointe sur le faux, localhost:54399).
# Usage : lancer.sh <dossier-code> <profil-ordi> [profil-téléphone]
CODE=${1:-$(cd "$(dirname "$0")/../.." && pwd)}
PA=$2; PB=$3
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
DEPOT=$(cd "$(dirname "$0")/../.." && pwd)
pkill -f "faux-supabase.mjs" ; pkill -f "vite --port 5199" ; sleep 1
(cd "$DEPOT" && JOURNAL=${JOURNAL:-1} nohup node scripts/faux-supabase.mjs > /tmp/faux-supabase.log 2>&1 &)
(cd "$CODE" && VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_ANON_KEY=cle-de-test nohup npx vite --port 5199 --strictPort > /tmp/vite-5199.log 2>&1 &)
sleep 4
[ -n "$PA" ] && nohup "$CHROME" --headless=new --remote-debugging-port=9335 --user-data-dir="$PA" --window-size=1440,900 --no-first-run --disable-background-networking --remote-allow-origins='*' http://localhost:5199/ > /tmp/chrome-9335.log 2>&1 &
[ -n "$PB" ] && nohup "$CHROME" --headless=new --remote-debugging-port=9336 --user-data-dir="$PB" --window-size=390,844 --no-first-run --disable-background-networking --remote-allow-origins='*' http://localhost:5199/ > /tmp/chrome-9336.log 2>&1 &
sleep 4
curl -s localhost:54399/__journal | head -c 80; echo
curl -s -o /dev/null -w "vite %{http_code}\n" localhost:5199/
