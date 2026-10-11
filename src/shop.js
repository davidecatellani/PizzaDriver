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

// Five levels each; `apply(stats, level)` changes the ride's numbers.
export const UPGRADES = [
  { id: 'speed', name: 'Motor', blurb: 'Top speed and acceleration.',
    apply: (s, l) => { s.maxSpeed *= 1 + 0.03 * l; s.accel *= 1 + 0.05 * l; } },
  { id: 'turbo', name: 'Turbo tank', blurb: 'Bank more turbo, and it pushes harder.',
    apply: (s, l) => { s.turboMax += 0.6 * l; s.boostMultiplier += 0.03 * l; } },
  { id: 'grip', name: 'Tyres', blurb: 'Sharper steering.',
    apply: (s, l) => { s.turnRate *= 1 + 0.05 * l; } },
  { id: 'bag', name: 'Thermal bag', blurb: 'Crashes cool the pizza less.',
    apply: (s, l) => { s.heatLoss *= 1 - 0.13 * l; } },
];
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

const DEFAULT = { owned: ['scooter', 'helmet-cap', 'jacket-white'], ride: 'scooter', helmet: 'cap', jacket: 'white', levels: {} };

// The player's garage, saved through `store` (get/set with JSON values).
export class Profile {
  constructor(store) {
    this.store = store;
    const saved = store.get('garage', null);
    Object.assign(this, structuredClone(DEFAULT), saved || {});
  }

  save() {
    const { owned, ride, helmet, jacket, levels } = this;
    this.store.set('garage', { owned, ride, helmet, jacket, levels });
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
      bag: this.level('bag'),
    };
  }
}
