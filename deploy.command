#!/bin/bash
# Double-click to deploy World Builder to Vercel.
SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/worldbuilder"

echo "======================================"
echo "   WORLD BUILDER  ·  DEPLOY"
echo "======================================"
echo

# A double-clicked .command gets a bare PATH. Go find node wherever it lives.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
for f in "$HOME/.zprofile" "$HOME/.zshrc" "$HOME/.bash_profile" "$HOME/.profile"; do
  [ -f "$f" ] && . "$f" >/dev/null 2>&1
done
if [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; fi
for d in "$HOME"/.nvm/versions/node/*/bin /opt/homebrew/bin /usr/local/bin \
         /usr/local/opt/node/bin "$HOME"/.volta/bin "$HOME"/.fnm/bin; do
  [ -x "$d/node" ] && export PATH="$d:$PATH"
done

if ! command -v node >/dev/null 2>&1; then
  echo "!! Could not find Node.js on this Mac."
  echo
  echo "   Searched: homebrew, /usr/local/bin, nvm, volta, fnm."
  echo "   Locations checked that exist:"
  ls -d /opt/homebrew/bin/node /usr/local/bin/node "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | sed 's/^/     /'
  echo
  echo "   Fix: install Node from https://nodejs.org  (pick the LTS button),"
  echo "   then double-click this file again."
  echo
  read -r -p "Press return to close."
  exit 1
fi

echo "node $(node -v)  ·  npm $(npm -v 2>/dev/null)"
echo

echo ">> Copying project to $DEST"
mkdir -p "$DEST"
/usr/bin/rsync -a --delete \
  --exclude node_modules --exclude .next --exclude .vercel \
  "$SRC"/ "$DEST"/ || { echo "!! copy failed"; read -r -p "Press return to close."; exit 1; }
cd "$DEST" || exit 1
echo

echo ">> Installing dependencies (a minute or two the first time)"
npm install --no-audit --no-fund 2>&1 | tail -4
echo

echo ">> Checking Vercel login"
WHO="$(npx --yes vercel@latest whoami 2>/dev/null | tail -1)"
if [ -z "$WHO" ]; then
  echo "   Not logged in. A browser window will open."
  echo "   Approve it, then double-click this file again."
  echo
  npx --yes vercel@latest login
  echo
  read -r -p "Press return to close, then run this file again."
  exit 0
fi
echo "   Logged in as $WHO"
echo

echo ">> Deploying to production"
npx --yes vercel@latest --prod --yes 2>&1 | tee /tmp/wb-deploy.log
echo
echo "======================================"
grep -Eo 'https://[a-zA-Z0-9._-]*vercel\.app' /tmp/wb-deploy.log | tail -1 | sed 's/^/  LIVE: /'
echo "======================================"
echo
echo "Then in Vercel: add ANTHROPIC_API_KEY, turn off Deployment Protection."
echo "And in Supabase: add the URL above to Authentication > URL Configuration."
echo
read -r -p "Press return to close."
