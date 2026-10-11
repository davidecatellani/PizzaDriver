# Meshy mesh pipeline

1. `MESHY_API_KEY=... node tools/meshy/generate.mjs [id ...]` generates the meshes in `assets/meshes.json`
   into `.meshy-raw/` (git-ignored, resumable).
2. `tools/meshy/optimize.sh [id ...]` compresses them into `public/models/<id>.glb`
   (meshopt, 512 px WebP textures) and rewrites `public/models/manifest.json`.
