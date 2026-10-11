# Meshy mesh pipeline

1. `MESHY_API_KEY=... node tools/meshy/generate.mjs tools/meshy/napoli.json assets/models/napoli/raw`
   (resumable; pass mesh ids to regenerate only some, after deleting their `.glb`).
2. Optimize each GLB (weld, simplify to the target polycount, 512 px WebP textures, meshopt):
   `npx @gltf-transform/cli optimize in.glb out.glb --compress meshopt --texture-compress webp --texture-size 512`

Raw downloads stay out of git (`assets/models/*/raw/`); only optimized GLBs are committed.
