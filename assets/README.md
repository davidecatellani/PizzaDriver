# Assets

- `meshes.json` lists every Meshy mesh: `id`, prompt, target polycount, and whether it needs rigging.
- Generated models go in `public/models/<id>.glb` and their ids are added to `public/models/manifest.json`.
- The game loads every id in the manifest at start; ids it uses but cannot find fall back to placeholder shapes.
- Keep each `.glb` small (target under ~400 KB, textures 512 px) so the first download stays under 20 MB.
