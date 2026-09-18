#!/bin/sh
# Filet anti page blanche : syntaxe de chaque fichier, puis import des modules purs dans Node.
# Vert avant chaque push. Rouge = rien ne se déploie.
set -e
cd "$(dirname "$0")"
for f in game/*.js; do
  node --check "$f"
done
node smoke.mjs
echo "check.sh : vert"
