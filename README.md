# Pizza Driver

Arcade pizza-delivery racer for the browser, inspired by Radical Bikers. Built with Three.js for CrazyGames.

Ride an electric scooter through Napoli, hit the checkpoints before the clock runs out, jump the ramps,
find the secret shortcut and beat three rival riders to the customer.

## Run it

```bash
npm install
npm run dev      # local dev server
npm run build    # production build in dist/ (relative paths, ready to zip for CrazyGames)
```

Controls: ← → steer, ↓ brake, Space boost, M mute. On touch screens: hold the left or right half to steer, BOOST button for the turbo.

## Code map

- `src/config.js`: tuning (speeds, timer, checkpoints, rival paths).
- `src/world.js`: the Napoli district, ramps, the secret tunnel and collisions.
- `src/player.js`, `src/rivals.js`, `src/traffic.js`: riders and cars.
- `src/audio.js`: original procedural soundtrack and sound effects (no audio files).
- `src/sdk.js`: CrazyGames SDK v3 wrapper (gameplay events, midgame and rewarded ads); no-op outside CrazyGames.
- `src/assets.js`: loads Meshy models listed in `public/models/manifest.json`, with placeholder shapes as fallback.

## 3D models (Meshy)

`assets/meshes.json` lists every mesh with its prompt. With `MESHY_API_KEY` set, `npm run meshes` generates the
missing ones into `public/models/` and updates the manifest. See `assets/README.md`.
