#!/usr/bin/env bash
# Optimizes raw Meshy GLBs into public/models and refreshes the manifest.
# Usage: tools/meshy/optimize.sh [id ...]   (default: every .meshy-raw/*.glb)
set -euo pipefail
cd "$(dirname "$0")/../.."
ids=("$@")
if [ ${#ids[@]} -eq 0 ]; then
  for f in .meshy-raw/*.glb; do ids+=("$(basename "$f" .glb)"); done
fi
for id in "${ids[@]}"; do
  npx -y @gltf-transform/cli@4.1.1 optimize ".meshy-raw/$id.glb" "public/models/$id.glb" \
    --compress meshopt --texture-compress webp --texture-size 512
  ls -l "public/models/$id.glb" | awk '{print $5, $9}'
done
node -e '
const fs = require("fs");
const models = fs.readdirSync("public/models").filter(f => f.endsWith(".glb")).map(f => f.slice(0, -4)).sort();
fs.writeFileSync("public/models/manifest.json", JSON.stringify({ models }, null, 2) + "\n");
console.log("manifest:", models.length, "models");'
