# Pizza Driver world leaderboard

A Cloudflare Worker with one SQLite-backed Durable Object: the world Richest Riders board
(all-time tips) and the fastest delivery on each route. Free plan; no database to create.
The same Worker builds and serves the game, so it is playable at the workers.dev address.

- Local: `npm install && npm run dev` (http://localhost:8787), then build the game with
  `VITE_BOARD_URL=http://localhost:8787 npx vite build`.
- Online: the "Deploy leaderboard" GitHub Action (needs the `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID` repository secrets), or `npx wrangler login && npm run deploy`.
  Then put the printed `https://pizza-driver-board.<name>.workers.dev` in `BOARD_URL` in
  `src/config.js`.

API: `POST /submit {id, key, name, earned, route?, time?}` and `GET /board?id=&route=`,
both answering `{ tips: {top, me, total}, route: {top, me, total} | null }`.
