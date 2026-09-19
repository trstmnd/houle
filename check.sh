#!/bin/sh
# Filet anti page blanche. Vert avant chaque push, rouge = rien ne se déploie.
# 1. syntaxe de chaque fichier
# 2. smoke.mjs : les modules purs dans Node, terrain et physique
# 3. domcheck.mjs : render.js et main.js chargés pour de vrai, DOM et three bouchonnés
set -e
cd "$(dirname "$0")"
for f in game/*.js; do
  node --check "$f"
done
node smoke.mjs
node --import ./tools/hooks.mjs domcheck.mjs
echo "check.sh : vert"
