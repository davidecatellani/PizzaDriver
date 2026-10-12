// The world leaderboard (server/): Richest Riders across all players, and the fastest delivery on
// each route. Every call fails soft: offline, or with no server configured, it resolves null and the
// game keeps its local board.

import { BOARD_URL } from './config.js';

const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');

export class Online {
  constructor(store) {
    this.url = BOARD_URL.replace(/\/$/, '');
    this.store = store;
    // An anonymous identity made once per device: the server ties the id to the key.
    this.id = store.get('boardId', null);
    this.key = store.get('boardKey', null);
    if (!this.id || !this.key) {
      this.id = hex(16);
      this.key = hex(16);
      store.set('boardId', this.id);
      store.set('boardKey', this.key);
    }
    this.last = null;   // the latest boards the server returned
  }

  get enabled() { return !!this.url; }

  async call(path, body) {
    if (!this.enabled) return null;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5000);
    try {
      const res = await fetch(this.url + path, body
        ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal }
        : { signal: ctl.signal });
      if (!res.ok) return null;
      return (this.last = await res.json());
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  // After a delivery (with its route and time) or a tips change (without).
  submit(name, earned, route = null, time = null) {
    return this.call('/submit', { id: this.id, key: this.key, name, earned, route, time });
  }

  boards(route = null) {
    return this.call(`/board?id=${this.id}${route ? `&route=${encodeURIComponent(route)}` : ''}`);
  }
}
