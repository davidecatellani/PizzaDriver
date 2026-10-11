import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CELL, GRID } from '../config.js';
import { mat } from '../assets.js';
import * as TEX from '../textures.js';
import { sedan, boxTruck, bus } from '../cars.js';
import { HALF, ALLEY_HALF, PALAZZO, TUNNEL, bayUVs, coloredBox, paint, addTrees, patch, curtain, seeded } from '../cityKit.js';

// Manhattan: brick walk-ups with fire escapes and water towers, glass and Art Deco towers,
// yellow cabs, Times Square's billboards, a slice of Central Park with a path through it,
// the Flatiron, and the Empire State and One World Trade on the skyline.

const GLASS_BAY = 3, GLASS_FLOOR = 3.6;
const BRICK_BAY = 4, BRICK_FLOOR = 3.4;
const LOBBY = 4.5;          // ground floor height (shops, lobbies)
// Brick: red, brown, tan, cream, soot.
const BRICK = [0xb4553c, 0x8f4a36, 0xc98e62, 0xe0cfb0, 0x9b6a52, 0xa8402e, 0x7a5546];
const STONE = [0xd9cfbd, 0xcfc4ae, 0xe6dcc8, 0xbfb6a6];
const IRON = 0x1b1c1e;
const TIMES = new Set(['4,4', '4,5', '5,4', '5,5', '6,4', '6,5']);

// A brick walk-up: shops below, fire escapes up the street sides, a cornice and maybe a water tower.
function walkUp(w, x, z, wd, d, h, color, streets) {
  const rnd = w.rnd;
  const floors = Math.max(3, Math.round((h - LOBBY) / BRICK_FLOOR));
  h = LOBBY + floors * BRICK_FLOOR;
  const v = Math.floor(rnd() * 3);
  w.geo(`brick${v}`).push(coloredBox(wd, h - LOBBY, d, x, LOBBY + (h - LOBBY) / 2, z, color, (g) => bayUVs(g, wd, d, BRICK_BAY, floors)));
  w.geo(`plinth${Math.floor(rnd() * 3)}`).push(coloredBox(wd + 0.15, LOBBY, d + 0.15, x, LOBBY / 2, z, 0xffffff, (g) => bayUVs(g, wd, d, 6, 1)));
  const trim = w.geo('trim');
  const cornice = new THREE.Color(color).multiplyScalar(0.55).getHex();
  trim.push(coloredBox(wd + 0.9, 0.8, d + 0.9, x, h - 0.2, z, cornice));
  trim.push(coloredBox(wd + 0.3, 0.3, d + 0.3, x, LOBBY, z, 0x2b2b2b));
  // Fire escapes: a platform per floor with a railing and a slanted stair to the next.
  for (const side of streets) {
    if (rnd() < 0.45) continue;
    const alongX = side[1] === 'z', sgn = side[0] === '+' ? 1 : -1;
    const width = alongX ? wd : d;
    const fw = Math.min(width * 0.6, 7), off = (rnd() - 0.5) * (width - fw) * 0.6;
    const out = (alongX ? d : wd) / 2 + 0.55;
    const P = (t, o) => (alongX ? [x + off + t, z + sgn * o] : [x + sgn * o, z + off + t]);
    for (let f = 0; f < floors; f++) {
      const y = LOBBY + f * BRICK_FLOOR + 0.3;
      const [px, pz] = P(0, out);
      trim.push(coloredBox(alongX ? fw : 1.1, 0.08, alongX ? 1.1 : fw, px, y, pz, IRON));
      const [rx, rz] = P(0, out + 0.52);
      trim.push(coloredBox(alongX ? fw : 0.05, 0.9, alongX ? 0.05 : fw, rx, y + 0.5, rz, IRON));
      trim.push(coloredBox(alongX ? fw : 0.06, 0.06, alongX ? 0.06 : fw, rx, y + 0.95, rz, IRON));
      if (f < floors - 1) {
        // Flights alternate direction floor by floor.
        const run = fw * 0.55, slope = Math.atan2(BRICK_FLOOR, run) * (f % 2 ? 1 : -1);
        const [sx, sz] = P((f % 2 ? 1 : -1) * fw * 0.12, out);
        trim.push(stair(Math.hypot(run, BRICK_FLOOR), sx, y, sz, slope, alongX));
      }
    }
  }
  // Wooden water tank on legs.
  if (rnd() < 0.5) {
    const tx = x + (rnd() - 0.5) * wd * 0.4, tz = z + (rnd() - 0.5) * d * 0.4;
    trim.push(paint(new THREE.CylinderGeometry(1.5, 1.6, 2.8, 12).translate(tx, h + 3.4, tz), 0x6e5338));
    trim.push(paint(new THREE.ConeGeometry(1.75, 1.1, 12).translate(tx, h + 5.35, tz), 0x3c3a36));
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) trim.push(coloredBox(0.14, 2, 0.14, tx + lx, h + 1, tz + lz, IRON));
  }
  w.addCollider(x - wd / 2 - 0.1, x + wd / 2 + 0.1, z - d / 2 - 0.1, z + d / 2 + 0.1);
}

// A stair flight of the fire escape, sloping along the facade.
function stair(len, x, y, z, slope, alongX) {
  const geo = new THREE.BoxGeometry(alongX ? len : 0.55, 0.07, alongX ? 0.55 : len);
  if (alongX) geo.rotateZ(slope); else geo.rotateX(-slope);
  geo.translate(x, y + BRICK_FLOOR / 2, z);
  return paint(geo, IRON);
}

// An office tower: a glass or Art Deco stone shaft in one to three setbacks, with a lobby.
function tower(w, x, z, wd, d, h, { glass = true, crown = false } = {}) {
  const rnd = w.rnd;
  const v = Math.floor(rnd() * 4);
  const tiers = h > 70 ? 3 : h > 40 ? 2 : 1;
  let y = LOBBY, tw = wd, td = d;
  w.geo(`plinth${Math.floor(rnd() * 3)}`).push(coloredBox(wd + 0.15, LOBBY, d + 0.15, x, LOBBY / 2, z, 0xffffff, (g) => bayUVs(g, wd, d, 6, 1)));
  const tint = glass ? 0xffffff : STONE[Math.floor(rnd() * STONE.length)];
  for (let t = 0; t < tiers; t++) {
    const th = (h - LOBBY) * [[1], [0.7, 0.3], [0.6, 0.28, 0.12]][tiers - 1][t];
    const floors = Math.max(1, Math.round(th / (glass ? GLASS_FLOOR : BRICK_FLOOR)));
    const hh = floors * (glass ? GLASS_FLOOR : BRICK_FLOOR);
    const key = glass ? `glass${v}` : `brick${v % 3}`;
    w.geo(key).push(coloredBox(tw, hh, td, x, y + hh / 2, z, tint, (g) => bayUVs(g, tw, td, glass ? GLASS_BAY : BRICK_BAY, floors)));
    w.geo('trim').push(coloredBox(tw + 0.4, 0.5, td + 0.4, x, y + hh, z, glass ? 0x8d969e : 0xb9ae98));
    y += hh;
    tw *= 0.72; td *= 0.72;
  }
  if (crown) {
    w.geo('trim').push(paint(new THREE.ConeGeometry(Math.min(tw, td) * 0.5, 9, 4).rotateY(Math.PI / 4).translate(x, y + 4.5, z), 0xc9ccd0));
    w.geo('trim').push(coloredBox(0.25, 10, 0.25, x, y + 12, z, 0xc9ccd0));
  } else if (rnd() < 0.6) {
    // Rooftop plant room and an aerial.
    w.geo('trim').push(coloredBox(tw * 0.5, 3, td * 0.5, x, y + 1.5, z, 0x7b7f84));
    if (rnd() < 0.5) w.geo('trim').push(coloredBox(0.2, 8, 0.2, x + tw * 0.15, y + 7, z, 0x9a9ea2));
  }
  w.addCollider(x - wd / 2 - 0.1, x + wd / 2 + 0.1, z - d / 2 - 0.1, z + d / 2 + 0.1);
  return y;
}

// Times Square: lit billboards stacked on the street faces of a building.
function billboards(w, x, z, wd, d, streets, k0) {
  for (const side of streets) {
    const alongX = side[1] === 'z', sgn = side[0] === '+' ? 1 : -1;
    const width = alongX ? wd : d;
    const n = Math.max(1, Math.round(width / 9));
    for (let i = 0; i < n; i++) {
      for (let row = 0; row < 3; row++) {
        const bw = width / n - 0.6, bh = bw * 0.6;
        const t = -width / 2 + (width / n) * (i + 0.5);
        const y = 6 + row * (bh + 0.8) + bh / 2;
        const b = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), new THREE.MeshBasicMaterial({ map: TEX.billboard(k0 + i * 3 + row * 7 + Math.round(x + z)) }));
        const out = (alongX ? d : wd) / 2 + 0.25;
        if (alongX) { b.position.set(x + t, y, z + sgn * out); b.rotation.y = sgn > 0 ? 0 : Math.PI; }
        else { b.position.set(x + sgn * out, y, z + t); b.rotation.y = sgn > 0 ? Math.PI / 2 : -Math.PI / 2; }
        w.scene.add(b);
      }
    }
  }
}

function pizzeria(w, r) {
  const cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;
  const wd = r.maxX - r.minX, d = r.maxZ - r.minZ;
  walkUp(w, cx, cz, wd, d, 16, 0xa8402e, []);
  // Red awning and a neon PIZZA sign facing the street at x = 0.
  const fx = r.minX - 0.2;
  const awning = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, d * 0.8), mat(0xc8302c));
  awning.position.set(fx - 1.1, 4.1, cz);
  awning.rotation.z = -0.25;
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2), new THREE.MeshBasicMaterial({
    map: TEX.signText('PIZZA', { bg: '#120a0a', fg: '#ff4040', font: 'bold 46px sans-serif' }) }));
  neon.position.set(fx - 0.1, 6.3, cz);
  neon.rotation.y = -Math.PI / 2;
  w.scene.add(awning, neon);
}

// The Flatiron: a wedge of pale stone filling the block's diagonal, with a little square beside it.
function flatiron(w, r) {
  const shape = new THREE.Shape();
  const W = r.maxX - r.minX, D = r.maxZ - r.minZ;
  shape.moveTo(0, 0); shape.lineTo(W, 0); shape.lineTo(W, D - 2); shape.lineTo(W - 1.5, D); shape.lineTo(0, 1.5); shape.lineTo(0, 0);
  const H = 62;
  const geo = new THREE.ExtrudeGeometry(shape, { depth: H, bevelEnabled: false });
  geo.rotateX(Math.PI / 2);
  geo.translate(r.minX, H, r.minZ);
  const t = TEX.brick(1);
  t.map.repeat.set(1 / BRICK_BAY, 1 / BRICK_FLOOR);
  t.normalMap.repeat.copy(t.map.repeat);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, color: 0xe8dcc4, roughness: 0.85 }));
  m.castShadow = m.receiveShadow = true;
  w.scene.add(m);
  // Colliders stepping down the diagonal.
  const n = 4;
  for (let k = 0; k < n; k++) {
    const x0 = r.minX + (W * k) / n;
    w.addCollider(x0, r.maxX, r.minZ, r.minZ + (D * (k + 1)) / n + 0.5);
  }
  // Madison Square: trees in the other half.
  const spots = [];
  for (let k = 0; k < 6; k++) spots.push({ x: r.minX + 4 + k * 3.5, z: r.minZ + 8 + k * 4.5, s: 0.9 });
  addTrees(w.scene, spots, { leaf: 0x4c7a33, seed: 21 });
}

export const manhattan = {
  id: 'manhattan',
  name: 'Manhattan',
  price: 600,
  // Hard: the tightest clock, the fastest rivals, packed streets full of reckless cabs.
  difficulty: { label: 'Hard', stars: 3, refSpeed: 24.6, slack: 1.2, rivals: 1.05, traffic: 4 },
  // Times Square is packed: crowds crossing back and forth between its blocks all the time.
  crowd: { blocks: ['4,4', '4,5', '5,4', '5,5', '6,4', '6,5'], count: 260 },
  tagline: 'Yellow cabs, skyscrapers and Central Park',

  // Same street grid as every city: start at the pizzeria corner (0, 0); `detour` is the stretch
  // that goes round Central Park, whose path along row 3 is the secret shortcut.
  deliveries: [
    { name: 'Times Square', path: [[0, 0], [0, 3], [2, 3], [2, 4], [4, 4], [4, 3], [6, 3], [6, 0], [8, 0], [8, 6], [5, 6], [5, 8], [9, 8], [9, 10], [2, 10], [2, 8]], detour: [2, 5] },
    { name: 'Wall Street', path: [[0, 0], [6, 0], [6, 2], [1, 2], [1, 6], [4, 6], [4, 9], [8, 9], [8, 5], [10, 5], [10, 10], [5, 10]] },
    { name: 'Chinatown', path: [[0, 0], [0, 5], [2, 5], [2, 1], [4, 1], [4, 7], [1, 7], [1, 10], [6, 10], [6, 7], [9, 7], [9, 2], [10, 2]] },
    { name: 'Broadway', path: [[0, 0], [0, 2], [5, 2], [5, 5], [7, 5], [7, 1], [10, 1], [10, 6], [8, 6], [8, 10], [4, 10], [4, 7], [0, 7], [0, 9]] },
    { name: 'Central Park', path: [[0, 0], [8, 0], [8, 3], [4, 3], [4, 2], [1, 2], [1, 3], [0, 3], [0, 6], [3, 6], [3, 9], [7, 9], [7, 6], [10, 6], [10, 10], [6, 10]], detour: [3, 6] },
  ],

  // Service alleys behind construction netting.
  alleys: [
    { axis: 'x', at: 1, from: 6, to: 8 },    // Times Square
    { axis: 'z', at: 4, from: 0, to: 2 },    // Wall Street
    { axis: 'x', at: 6, from: 8, to: 10 },   // Wall Street
    { axis: 'x', at: 3, from: 0, to: 2 },    // Chinatown
    { axis: 'x', at: 2, from: 7, to: 10 },   // Broadway
    { axis: 'x', at: 7, from: 7, to: 10 },   // Central Park
  ],

  cars: [
    { id: 'cab', len: 4.8, w: 1.95, h: 1.5, color: 0xf2bf0f, speed: 15, reckless: 0.4, build: (k) => sedan(k, { taxi: true }) },
    { id: 'suv', len: 4.9, w: 2.0, h: 1.9, color: 0x15171a, speed: 13, build: (k) => sedan(k, { suv: true }) },
    { id: 'cab', len: 4.8, w: 1.95, h: 1.5, color: 0xf2bf0f, speed: 14, reckless: 0.4, build: (k) => sedan(k, { taxi: true }) },
    { id: 'van', len: 6.2, w: 2.2, h: 3, color: 0xf2f2ee, speed: 11, build: (k) => boxTruck(k) },
    { id: 'cab', len: 4.8, w: 1.95, h: 1.5, color: 0xf2bf0f, speed: 14, reckless: 0.4, build: (k) => sedan(k, { taxi: true }) },
    { id: 'bus', len: 12, w: 2.6, h: 3.2, color: 0xf4f4f4, speed: 9, avenue: true, build: (k) => bus(k) },
  ],

  // Brownstone stoops, a builders' plank in front of road works, a parked dump truck.
  ramps: ['stairs', 'crates', 'truck'],
  rampStyle: { steps: [0x6e4a38, 0x5f3f30], wall: 0x1b1c1e, door: 0x2a1a12, frame: 0x8a6a52, truck: 0xe2661c, works: 'barrel' },

  ground: () => TEX.asphalt(30),
  roadLines: 0xf2c230,
  pavementColor: 0xc7c4bd,
  landmarkBlocks: ['0,0', '5,4', '5,5', '1,8'],

  materials() {
    const out = {};
    for (let v = 0; v < 4; v++) {
      out[`glass${v}`] = new THREE.MeshStandardMaterial({ map: TEX.glass(v).map, vertexColors: true, roughness: 0.12, metalness: 0.75, envMapIntensity: 1.4 });
    }
    for (let v = 0; v < 3; v++) {
      const t = TEX.brick(v);
      out[`brick${v}`] = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, vertexColors: true, roughness: 0.9 });
    }
    for (let v = 0; v < 3; v++) out[`plinth${v}`] = new THREE.MeshStandardMaterial({ map: TEX.storefrontNY().map, vertexColors: true, roughness: 0.7 });
    const pav = TEX.slabs();
    out.pavement = new THREE.MeshStandardMaterial({ map: pav.map, normalMap: pav.normalMap, vertexColors: true, roughness: 0.9 });
    return out;
  },

  block(w, bi, bj, inner, outer, alley, rnd) {
    const key = `${bi},${bj}`;
    if (!outer && key === '0,0') return pizzeria(w, inner);
    if (!outer && key === '1,8') return flatiron(w, inner);
    const times = !outer && TIMES.has(key);
    const bw = (inner.maxX - inner.minX) / 2, bd = (inner.maxZ - inner.minZ) / 2;
    for (let a = 0; a < 2; a++) {
      for (let b = 0; b < 2; b++) {
        let x0 = inner.minX + bw * a + 0.3, x1 = inner.minX + bw * (a + 1) - 0.3;
        let z0 = inner.minZ + bd * b + 0.3, z1 = inner.minZ + bd * (b + 1) - 0.3;
        if (alley?.axis === 'x') { if (b === 0) z1 = alley.line - ALLEY_HALF; else z0 = alley.line + ALLEY_HALF; }
        if (alley?.axis === 'z') { if (a === 0) x1 = alley.line - ALLEY_HALF; else x0 = alley.line + ALLEY_HALF; }
        const streets = outer ? [] : [a ? '+x' : '-x', b ? '+z' : '-z'];
        const x = (x0 + x1) / 2, z = (z0 + z1) / 2, wd = x1 - x0, d = z1 - z0;
        const roll = rnd();
        if (outer) tower(w, x, z, wd, d, 70 + rnd() * 80, { glass: roll < 0.6 });
        else if (times) {
          tower(w, x, z, wd, d, 45 + rnd() * 50, { glass: roll < 0.7 });
          billboards(w, x, z, wd, d, streets, bi * 5 + bj * 3 + a + b * 2);
        } else if (roll < 0.5) walkUp(w, x, z, wd, d, 15 + rnd() * 9, BRICK[Math.floor(rnd() * BRICK.length)], streets);
        else if (roll < 0.8) tower(w, x, z, wd, d, 35 + rnd() * 60, { glass: true });
        else tower(w, x, z, wd, d, 30 + rnd() * 45, { glass: false });
      }
    }
  },

  // A slice of Central Park over blocks (2..3, 2..3): lawns and trees behind a low stone wall,
  // with a footpath straight through along row 3, its gates hidden behind bushes.
  special(w) {
    const P = PALAZZO, T = TUNNEL;
    w.sidewalk(P.minX - 2, P.maxX + 2, P.minZ - 2, P.maxZ + 2);
    const grass = TEX.grass().map;
    const gm = new THREE.MeshStandardMaterial({ map: grass, roughness: 1 });
    patch(w.scene, P.minX, P.maxX, P.minZ, T.minZ, 0.32, gm, 8);
    patch(w.scene, P.minX, P.maxX, T.maxZ, P.maxZ, 0.32, gm, 8);
    patch(w.scene, P.minX - 2, P.maxX + 2, T.minZ, T.maxZ, 0.33, new THREE.MeshStandardMaterial({ map: TEX.gravel().map, roughness: 1 }), 4);
    // Wall round both halves (colliders cover the lawns: the path is the only way through).
    const wall = 0x8f8b82;
    for (const [z0, z1] of [[P.minZ, T.minZ], [T.maxZ, P.maxZ]]) {
      const trim = w.geo('trim');
      trim.push(coloredBox(P.maxX - P.minX, 1, 0.6, (P.minX + P.maxX) / 2, 0.8, z0 + 0.3, wall));
      trim.push(coloredBox(P.maxX - P.minX, 1, 0.6, (P.minX + P.maxX) / 2, 0.8, z1 - 0.3, wall));
      trim.push(coloredBox(0.6, 1, z1 - z0, P.minX + 0.3, 0.8, (z0 + z1) / 2, wall));
      trim.push(coloredBox(0.6, 1, z1 - z0, P.maxX - 0.3, 0.8, (z0 + z1) / 2, wall));
      w.addCollider(P.minX - 0.1, P.maxX + 0.1, z0 - 0.1, z1 + 0.1);
    }
    const rnd = seeded(31), spots = [];
    for (let k = 0; k < 70; k++) {
      const x = P.minX + 3 + rnd() * (P.maxX - P.minX - 6);
      const top = rnd() < 0.5;
      const z = top ? P.minZ + 3 + rnd() * (T.minZ - P.minZ - 6) : T.maxZ + 3 + rnd() * (P.maxZ - T.maxZ - 6);
      spots.push({ x, z, s: 1 + rnd() * 0.7 });
    }
    // Bushes across both gates; the path is lined with trees too.
    for (const gx of [T.minX + 1.2, T.maxX - 1.2]) for (let k = 0; k < 4; k++) spots.push({ x: gx + (rnd() - 0.5), z: T.minZ + 1 + k * 1.8, s: 0.45 });
    addTrees(w.scene, spots, { leaf: 0x4a7d31, height: 8, seed: 33 });
    // Benches and lamps along the path.
    for (let x = P.minX + 10; x < P.maxX - 8; x += 12) {
      for (const sz of [-1, 1]) {
        w.geo('trim').push(coloredBox(1.8, 0.5, 0.6, x, 0.6, 3 * CELL + sz * (T.maxZ - T.minZ) / 2 * 0.85, 0x2f4a2a));
        w.geo('trim').push(coloredBox(0.12, 3.6, 0.12, x + 6, 2.1, 3 * CELL + sz * (T.maxZ - T.minZ) / 2 * 0.9, IRON));
      }
    }
    // The skyline: Empire State to the north-east, One World Trade to the south.
    empireState(w, 7.3 * CELL, -150);
    oneWTC(w, 2.6 * CELL, GRID * CELL + 190);
  },

  // Netting over both mouths of an alley, and a fire-escape bridge across it.
  alleyDressing(w, alley, minX, maxX, minZ, maxZ) {
    const L = alley.line, alongX = alley.axis === 'x';
    for (const m of alongX ? [minX + 2.4, maxX - 2.4] : [minZ + 2.4, maxZ - 2.4]) {
      if (alongX) curtain(w.scene, m, L, 'z', ALLEY_HALF * 2, 5, [0x2f5a3a, 0x355f40], { opacity: 0.85 });
      else curtain(w.scene, L, m, 'x', ALLEY_HALF * 2, 5, [0x2f5a3a, 0x355f40], { opacity: 0.85 });
    }
    const c = alongX ? (minX + maxX) / 2 : (minZ + maxZ) / 2;
    const [aw, ad] = alongX ? [3, ALLEY_HALF * 2 + 0.6] : [ALLEY_HALF * 2 + 0.6, 3];
    const [x, z] = alongX ? [c, L] : [L, c];
    for (const y of [8, 11.4]) w.geo('trim').push(coloredBox(aw, 0.12, ad, x, y, z, IRON));
  },

  // Cobra-head street lights, hydrants, steam from the manholes.
  streetLife(w) {
    w.lampPosts(mergeGeometries([
      new THREE.CylinderGeometry(0.11, 0.17, 7.5, 8).translate(0, 3.75, 0),
      new THREE.CylinderGeometry(0.25, 0.25, 0.6, 8).translate(0, 0.3, 0),
      new THREE.BoxGeometry(0.1, 0.1, 2.2).translate(0, 7.4, 1.05),
    ]), new THREE.BoxGeometry(0.45, 0.18, 0.9).translate(0, 7.35, 2.2), { post: 0x5d646b, light: 0xfff0d0 });

    const rnd = w.rnd;
    const hydrants = [];
    const steam = [];
    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        if (i >= 2 && i <= 3 && j >= 2 && j <= 3) continue;
        if (rnd() < 0.5) hydrants.push([i * CELL + HALF + 0.6, j * CELL + HALF + 3 + rnd() * 20]);
        if (rnd() < 0.18) steam.push([i * CELL + (rnd() - 0.5) * 6, j * CELL + HALF + 6 + rnd() * (CELL - 2 * HALF - 12)]);
      }
    }
    const hyd = new THREE.InstancedMesh(mergeGeometries([
      new THREE.CylinderGeometry(0.16, 0.2, 0.75, 10).translate(0, 0.37, 0),
      new THREE.SphereGeometry(0.17, 10, 6).translate(0, 0.76, 0),
      new THREE.CylinderGeometry(0.07, 0.07, 0.5, 6).rotateZ(Math.PI / 2).translate(0, 0.5, 0),
    ]), mat(0xc4231c, { roughness: 0.5 }), hydrants.length);
    const m4 = new THREE.Matrix4();
    hydrants.forEach(([x, z], k) => { m4.makeTranslation(x, 0.3, z); hyd.setMatrixAt(k, m4); });
    hyd.castShadow = true;
    w.scene.add(hyd);
    const puff = new THREE.SpriteMaterial({ map: TEX.puff(), color: 0xf4f4f4, transparent: true, opacity: 0.45, depthWrite: false });
    for (const [x, z] of steam) {
      for (let k = 0; k < 4; k++) {
        const s = new THREE.Sprite(puff);
        s.position.set(x + (rnd() - 0.5) * 0.6, 0.8 + k * 1.5, z + (rnd() - 0.5) * 0.6);
        s.scale.setScalar(1.6 + k * 1.1);
        w.scene.add(s);
      }
    }
  },

  landmarks() {},
};

// The Empire State Building: limestone setbacks, the mooring mast and the antenna.
function empireState(w, x, z) {
  const tiers = [[60, 48, 30], [44, 34, 150], [30, 24, 20], [20, 16, 12], [12, 10, 8]];
  let y = 0;
  for (const [tw, td, th] of tiers) {
    const floors = Math.round(th / BRICK_FLOOR);
    w.geo('brick1').push(coloredBox(tw, th, td, x, y + th / 2, z, 0xd8ceb8, (g) => bayUVs(g, tw, td, BRICK_BAY, floors)));
    y += th;
  }
  w.geo('trim').push(paint(new THREE.CylinderGeometry(3, 5, 20, 8).translate(x, y + 10, z), 0xcfd2d4));
  w.geo('trim').push(paint(new THREE.CylinderGeometry(0.6, 1, 34, 6).translate(x, y + 37, z), 0xb9bdc0));
}

// One World Trade Center: a square glass shaft whose corners twist in to a smaller square.
function oneWTC(w, x, z) {
  const base = 26, H = 300;
  w.geo('glass3').push(coloredBox(base, 30, base, x, 15, z, 0xffffff, (g) => bayUVs(g, base, base, GLASS_BAY, 8)));
  const geo = new THREE.CylinderGeometry(base * 0.42, base * 0.707, H - 30, 4, 1, true);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i)) + Math.PI / 4, r = Math.hypot(pos.getX(i), pos.getZ(i));
      pos.setXYZ(i, Math.cos(a) * r, pos.getY(i), Math.sin(a) * r);
    }
  }
  geo.rotateY(Math.PI / 4);
  geo.translate(x, 30 + (H - 30) / 2, z);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 24, uv.getY(i) * 70);
  w.geo('glass0').push(paint(geo.toNonIndexed(), 0xffffff));
  w.geo('trim').push(paint(new THREE.CylinderGeometry(0.5, 0.9, 60, 6).translate(x, H + 30, z), 0xdfe3e6));
}
