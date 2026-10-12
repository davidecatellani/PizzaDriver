// Pizza Driver world leaderboard.
//
//   POST /submit  { id, key, name, earned, route?, time? }  -> the boards, as GET /board
//   GET  /board?id=…&route=napoli:3                           -> { tips, route }
//
// tips:  the Richest Riders board, all-time tips earned: { top: [{name, tips}], me: {rank, tips}, total }
// route: fastest delivery on one route:                      { top: [{name, time}], me: {rank, time}, total }
//
// Players are anonymous: the game makes a random id and key once and keeps them on the device.
// The first submission stores a hash of the key, so nobody else can write under that id.
// It is a game board, not a bank: gains are capped by the time since the last submission, so a
// tampered client can only climb about as fast as a very good real player.

import { DurableObject } from 'cloudflare:workers';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const TOP_TIPS = 50, TOP_ROUTE = 10;
const FIRST_GAIN = 3000;          // tips earned before the board existed
const GAIN = 300, GAIN_PER_S = 6; // per submission, plus a generous rate
const MIN_TIME = 20, MAX_TIME = 900;
const ROUTE = /^[a-z]{2,16}:\d{1,2}$/;

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    const board = env.BOARD.get(env.BOARD.idFromName('world'));
    try {
      if (req.method === 'GET' && url.pathname === '/board') {
        return json(await board.boards(url.searchParams.get('id'), url.searchParams.get('route')));
      }
      if (req.method === 'POST' && url.pathname === '/submit') {
        if (Number(req.headers.get('Content-Length') || 0) > 2000) return json({ error: 'too big' }, 413);
        const res = await board.submit(await req.json());
        return json(res, res.error ? 400 : 200);
      }
      if (url.pathname === '/') return json({ ok: true, game: 'Pizza Driver' });
      return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: 'bad request' }, 400);
    }
  },
};

async function sha(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Names are shown to every player, so offensive ones (English and Italian, with the usual letter
// swaps) are replaced. Not exhaustive: it keeps the obvious out of the public board.
const BAD = ['fuck', 'shit', 'cunt', 'bitch', 'nigg', 'fag', 'whore', 'slut', 'dick', 'cock', 'pussy', 'rape', 'nazi', 'hitler',
  'porn', 'cazz', 'figa', 'fica', 'merd', 'puttan', 'troia', 'stronz', 'vaffan', 'frocio', 'negro', 'coglion', 'minchi', 'bastard'];
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i' };

function cleanName(n) {
  const s = String(n ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);
  const flat = s.toLowerCase().replace(/[013457@$!]/g, (c) => LEET[c]).replace(/[^a-z]/g, '');
  if (BAD.some((w) => flat.includes(w))) return 'Rider';
  return s || 'Rider';
}

export class Board extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, keyhash TEXT NOT NULL, name TEXT NOT NULL, tips INTEGER NOT NULL, at INTEGER NOT NULL)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS players_tips ON players (tips DESC)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS runs (route TEXT NOT NULL, id TEXT NOT NULL, time REAL NOT NULL, PRIMARY KEY (route, id))`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS runs_time ON runs (route, time)`);
  }

  async submit(b) {
    const id = String(b.id ?? ''), key = String(b.key ?? '');
    if (!/^[0-9a-f]{32}$/.test(id) || key.length < 16 || key.length > 64) return { error: 'bad player' };
    const keyhash = await sha(key);
    const now = Date.now();
    const name = cleanName(b.name);
    const earned = Math.max(0, Math.floor(Number(b.earned) || 0));
    const p = this.sql.exec('SELECT keyhash, tips, at FROM players WHERE id = ?', id).toArray()[0];
    if (p && p.keyhash !== keyhash) return { error: 'wrong key' };
    if (!p) {
      this.sql.exec('INSERT INTO players (id, keyhash, name, tips, at) VALUES (?, ?, ?, ?, ?)', id, keyhash, name, Math.min(earned, FIRST_GAIN), now);
    } else {
      const allowed = p.tips + GAIN + Math.floor(((now - p.at) / 1000) * GAIN_PER_S);
      const tips = Math.max(p.tips, Math.min(earned, allowed));
      this.sql.exec('UPDATE players SET name = ?, tips = ?, at = ? WHERE id = ?', name, tips, now, id);
    }
    const route = ROUTE.test(String(b.route ?? '')) ? b.route : null;
    const time = Number(b.time);
    if (route && time >= MIN_TIME && time <= MAX_TIME) {
      this.sql.exec(`INSERT INTO runs (route, id, time) VALUES (?, ?, ?)
        ON CONFLICT (route, id) DO UPDATE SET time = MIN(time, excluded.time)`, route, id, Math.round(time * 10) / 10);
    }
    return this.boards(id, route);
  }

  boards(id, route) {
    const sql = this.sql;
    const tips = {
      top: sql.exec('SELECT name, tips FROM players ORDER BY tips DESC, at ASC LIMIT ?', TOP_TIPS).toArray(),
      total: sql.exec('SELECT COUNT(*) AS n FROM players').one().n,
      me: null,
    };
    const mine = id && sql.exec('SELECT tips, at FROM players WHERE id = ?', id).toArray()[0];
    if (mine) {
      const ahead = sql.exec('SELECT COUNT(*) AS n FROM players WHERE tips > ? OR (tips = ? AND at < ?)', mine.tips, mine.tips, mine.at).one().n;
      tips.me = { rank: ahead + 1, tips: mine.tips };
    }
    let r = null;
    if (route && ROUTE.test(route)) {
      r = {
        top: sql.exec('SELECT p.name AS name, r.time AS time FROM runs r JOIN players p ON p.id = r.id WHERE r.route = ? ORDER BY r.time ASC LIMIT ?', route, TOP_ROUTE).toArray(),
        total: sql.exec('SELECT COUNT(*) AS n FROM runs WHERE route = ?', route).one().n,
        me: null,
      };
      const run = id && sql.exec('SELECT time FROM runs WHERE route = ? AND id = ?', route, id).toArray()[0];
      if (run) r.me = { rank: sql.exec('SELECT COUNT(*) AS n FROM runs WHERE route = ? AND time < ?', route, run.time).one().n + 1, time: run.time };
    }
    return { tips, route: r };
  }
}
