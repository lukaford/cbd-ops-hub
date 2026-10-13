#!/bin/bash
# Double-click to run the CBD Ops Hub on this Mac, then open http://localhost:3000.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install the LTS version from https://nodejs.org and run this again."
  read -r -p "Press Enter to close."
  exit 1
fi

if [ ! -f .env.local ]; then
  echo "Paste your JobTread grant key and press Enter. It is saved only in .env.local on this Mac."
  read -r -s -p "JobTread key: " key
  echo
  printf 'JOBTREAD_GRANT_KEY=%s\n' "$key" > .env.local
fi

[ -d node_modules ] || { echo "Installing, this takes a few minutes the first time..."; npm install || exit 1; }
[ -f .next/BUILD_ID ] || npm run build || exit 1

(sleep 3; open http://localhost:3000) &
npm run start
