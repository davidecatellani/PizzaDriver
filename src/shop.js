import { PLAYER } from './config.js';

// What delivery tips buy: rides with their own handling, upgrades, and the rider's style.
// Everything is drawn in code (src/vehicles.js, src/rider.js); prices are in tips ($).

// Rides are looks only (Davide): every ride handles exactly like the scooter.
export const RIDES = [
  { id: 'scooter', name: 'E-Scooter', price: 0, blurb: 'The classic delivery ride.' },
  { id: 'skate', name: 'E-Skate', price: 150, blurb: 'Glowing deck, orange wheels.' },
  { id: 'bike', name: 'E-Bike', price: 400, blurb: 'Red frame with a pizza rack.', stats: { push: false } },
  { id: 'hover', name: 'Hoverboard', price: 900, blurb: 'Floats over the basoli.', stats: { float: 0.22, push: false } },
];

// Five levels each; `apply(stats, level)` changes the numbers. Nothing here touches the driving
// (Davide: a game of skill, the same handling for everyone).
export const UPGRADES = [
  { id: 'bag', name: 'Thermal bag', blurb: 'Crashes cool the pizza less, for bigger tips.',
    apply: (s, l) => { s.heatLoss *= 1 - 0.13 * l; } },
];
// Upgrades that used to change the driving; levels bought are refunded (see Profile.refund).
const RETIRED = ['speed', 'turbo', 'grip'];
export const UPGRADE_COST = [40, 80, 140, 220, 320];
export const MAX_LEVEL = UPGRADE_COST.length;

export const HELMETS = [
  { id: 'cap', name: 'Red cap', price: 0 },
  { id: 'classic', name: 'Classic', price: 30, color: 0xd62828 },
  { id: 'racer', name: 'Racer', price: 70, color: 0xf4f4f4, visor: true },
  { id: 'azzurro', name: 'Napoli', price: 90, color: 0x1e8fd6, visor: true, stripe: 0xffffff },
  { id: 'pizza', name: 'Pizza', price: 150, color: 0xf2c46b, pizza: true },
  { id: 'gold', name: 'Gold', price: 300, color: 0xe8b93a, visor: true, metal: true },
];

export const JACKETS = [
  { id: 'white', name: 'White tee', price: 0, color: null },
  { id: 'red', name: 'Pizzeria red', price: 25, color: 0xd62828 },
  { id: 'azzurro', name: 'Azzurro', price: 25, color: 0x2a8fe0 },
  { id: 'yellow', name: 'Lemon', price: 25, color: 0xf5cf2a },
  { id: 'green', name: 'Basil', price: 25, color: 0x3a9a4a },
  { id: 'black', name: 'Night', price: 40, color: 0x2a2a30 },
  { id: 'pink', name: 'Bubblegum', price: 40, color: 0xf28ab8 },
];

// Colours of the boost flame: [outer, inner], or 'rainbow'.
export const FLAMES = [
  { id: 'classic', name: 'Classic', price: 0, colors: [0xffa53a, 0x52c8ff] },
  { id: 'toxic', name: 'Toxic', price: 60, colors: [0x39ff88, 0xd4ff3a] },
  { id: 'neon', name: 'Neon', price: 80, colors: [0xc34bff, 0xff4fd8] },
  { id: 'napoli', name: 'Azzurri', price: 100, colors: [0x2a8fe0, 0xffffff] },
  { id: 'rainbow', name: 'Rainbow', price: 200, colors: 'rainbow' },
];

const DEFAULT = { owned: ['scooter', 'helmet-cap', 'jacket-white', 'flame-classic'], ride: 'scooter', helmet: 'cap', jacket: 'white', flame: 'classic', levels: {} };

// The player's garage, saved through `store` (get/set with JSON values).
export class Profile {
  constructor(store) {
    this.store = store;
    const saved = store.get('garage', null);
    Object.assign(this, structuredClone(DEFAULT), saved || {});
    if (!this.owns('flame-classic')) this.owned.push('flame-classic');
  }

  // Tips back for levels of upgrades that no longer exist; returns the amount.
  refund() {
    let back = 0;
    for (const id of RETIRED) {
      for (let l = 0; l < this.level(id); l++) back += UPGRADE_COST[l];
      delete this.levels[id];
    }
    if (back) this.save();
    return back;
  }

  save() {
    const { owned, ride, helmet, jacket, flame, levels } = this;
    this.store.set('garage', { owned, ride, helmet, jacket, flame, levels });
  }

  owns(id) { return this.owned.includes(id); }
  level(id) { return this.levels[id] || 0; }

  // The tuning the player rides with: the base numbers, the ride's own, then the upgrades.
  stats() {
    const s = { ...PLAYER, heatLoss: 1, mass: 1, float: 0 };
    Object.assign(s, RIDES.find((r) => r.id === this.ride).stats);   // visual only: foot pushing, hovering
    for (const u of UPGRADES) u.apply(s, this.level(u.id));
    return s;
  }

  look() {
    return {
      ride: this.ride,
      helmet: HELMETS.find((h) => h.id === this.helmet),
      jacket: JACKETS.find((j) => j.id === this.jacket),
      flame: (FLAMES.find((f) => f.id === this.flame) || FLAMES[0]).colors,
      bag: this.level('bag'),
    };
  }
}
