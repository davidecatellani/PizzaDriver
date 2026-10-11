import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CELL, GRID } from '../config.js';
import { box, mat, makeObject } from '../assets.js';
import * as TEX from '../textures.js';
import { HALF, ALLEY_HALF, PALAZZO, TUNNEL, inPalazzo, bayUVs, coloredBox } from '../cityKit.js';

// Napoli: plastered palazzi with balconies and shopfront arches, basalt paving, laundry across
// the streets, a palazzo with a tunnel through it, Vesuvius on the horizon.

// Neapolitan plaster: ochre, Pompeian red, salmon, cream, terracotta, sage, pale blue.
const PALETTE = [0xe8b75a, 0xd98c73, 0xc8643f, 0xefdcb8, 0xe6a86b, 0xcfc39b, 0xb9d3c9, 0xe3c9a0, 0xa94f3b, 0xf0c9a8];
const PLINTH = 3.6;      // ground floor (shops) height
const BAY = 5;          // facade window spacing
const FLOOR = 4;        // storey height above the ground floor

// Buildings and pavements are collected and merged into a few meshes (one per material),
// so the whole city costs a handful of draw calls instead of one per box.
// `streets` lists the sides that face a street ('-x', '+x', '-z', '+z'): those get balconies.
function building(w_, x, z, w, d, h, color, streets = []) {
  const rnd = w_.rnd;
  const floors = Math.max(1, Math.round((h - PLINTH) / FLOOR));
  h = PLINTH + floors * FLOOR;
  const variant = Math.floor(rnd() * 4);
  const trim = new THREE.Color(color).lerp(new THREE.Color(0xfff8ec), 0.55);
  w_.geo(`facade${variant}`).push(coloredBox(w, h - PLINTH, d, x, PLINTH + (h - PLINTH) / 2, z, color, (g) => bayUVs(g, w, d, BAY, floors)));
  w_.geo('plinth').push(coloredBox(w + 0.2, PLINTH, d + 0.2, x, PLINTH / 2, z, 0xffffff, (g) => bayUVs(g, w, d, 7, 1)));
  const trims = w_.geo('trim');
  // Cornice on top and a band over the shops.
  trims.push(coloredBox(w + 1, 0.6, d + 1, x, h - 0.3, z, trim));
  trims.push(coloredBox(w + 0.5, 0.35, d + 0.5, x, PLINTH, z, trim));
  // Some roofs carry a set-back attic room.
  if (rnd() < 0.35) trims.push(coloredBox(w * 0.45, 2.6, d * 0.4, x + (rnd() - 0.5) * w * 0.3, h + 1.3, z + (rnd() - 0.5) * d * 0.3, color));
  // Balconies on the street sides, lined up with the painted windows.
  if (variant !== 2) {
    for (const side of streets) {
      const alongX = side[1] === 'z';
      const width = alongX ? w : d;
      const bays = Math.max(1, Math.round(width / BAY)), bw = width / bays;
      const sgn = side[0] === '+' ? 1 : -1;
      for (let f = 0; f < floors; f++) {
        if (rnd() < 0.4) continue;
        const y = PLINTH + f * FLOOR + FLOOR * 0.31;
        for (let b = 0; b < bays; b++) {
          if (rnd() < 0.3) continue;
          const t = -width / 2 + bw * (b + 0.5);
          const out = (alongX ? d : w) / 2 + 0.45;
          const [cx, cz] = alongX ? [x + t, z + sgn * out] : [x + sgn * out, z + t];
          const [sw, sd] = alongX ? [bw * 0.62, 0.9] : [0.9, bw * 0.62];
          trims.push(coloredBox(sw, 0.16, sd, cx, y, cz, trim));
          // Railing: front and two sides, wrought-iron dark.
          const [fx, fz] = alongX ? [cx, cz + sgn * 0.42] : [cx + sgn * 0.42, cz];
          trims.push(coloredBox(alongX ? sw : 0.05, 0.9, alongX ? 0.05 : sd, fx, y + 0.53, fz, 0x262626));
        }
      }
    }
  }
  w_.addCollider(x - w / 2 - 0.1, x + w / 2 + 0.1, z - d / 2 - 0.1, z + d / 2 + 0.1);
}

function pizzeria(w, r) {
  const cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;
  const fallback = () => {
    const g = new THREE.Group();
    const body = box(r.maxX - r.minX, 10, r.maxZ - r.minZ, 0xf6e7c8);
    body.position.y = 5;
    g.add(body);
    const awning = box(r.maxX - r.minX + 0.5, 0.6, 3, 0xc8302c);
    awning.position.set(0, 4.5, -(r.maxZ - r.minZ) / 2 - 1.2);
    g.add(awning);
    return g;
  };
  const p = makeObject('pizzeria', r.maxX - r.minX, fallback);
  p.position.set(cx, 0, cz);
  w.scene.add(p);
  w.addCollider(r.minX, r.maxX, r.minZ, r.maxZ);
  w.sign('PIZZERIA', cx - (r.maxX - r.minX) / 2 - 0.2, 7, cz, Math.PI / 2);
}

function market(w, r) {
  const stalls = [0xf7c948, 0xf08a24, 0xd94b3d, 0x4fa3d9];
  for (let i = 0; i < 4; i++) {
    const z = r.minZ + 3 + i * ((r.maxZ - r.minZ - 6) / 3);
    const x = r.minX + 2.5;
    const stall = makeObject(i % 2 ? 'market_stall_fish' : 'market_stall_fruit', 4, () => {
      const g = new THREE.Group();
      const t = box(3, 1.2, 4, 0x8b5a2b); t.position.y = 0.6; g.add(t);
      const top = box(3.4, 0.2, 4.4, stalls[i]); top.position.y = 3; g.add(top);
      const goods = box(2.6, 0.5, 3.4, i % 2 ? 0x9fd3e6 : 0xf2b134); goods.position.y = 1.45; g.add(goods);
      return g;
    });
    stall.position.set(x, 0.3, z);
    w.scene.add(stall);
    w.addCollider(x - 1.7, x + 1.7, z - 2.2, z + 2.2);
  }
  building(w, (r.minX + r.maxX) / 2 + 6, (r.minZ + r.maxZ) / 2, 14, r.maxZ - r.minZ, 12, 0xf4a6a0);
}

function piazza(w, r) {
  const cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;
  const f = makeObject('fountain', 7, () => {
    const g = new THREE.Group();
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.8, 1, 20), mat(0xd8d2c4));
    basin.position.y = 0.5; g.add(basin);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.1, 0.2, 20), mat(0x5fb7e5));
    water.position.y = 1; g.add(water);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 4, 10), mat(0xd8d2c4));
    col.position.y = 2.5; g.add(col);
    return g;
  });
  f.position.set(cx, 0.3, cz);
  w.scene.add(f);
  w.addCollider(cx - 3.6, cx + 3.6, cz - 3.6, cz + 3.6);
  for (const [dx, dz] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) {
    const t = makeObject('cafe_table', 2, () => {
      const g = new THREE.Group();
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.1, 12), mat(0xffffff));
      top.position.y = 1; g.add(top);
      const leg = box(0.15, 1, 0.15, 0x333333); leg.position.y = 0.5; g.add(leg);
      return g;
    });
    t.position.set(cx + dx, 0.3, cz + dz);
    w.scene.add(t);
  }
}

export const napoli = {
  id: 'napoli',
  name: 'Napoli',
  price: 0,
  // Easy: the reference clock, rivals as they are, two cars a lane.
  difficulty: { label: 'Easy', stars: 1, rivals: 1, traffic: 2 },
  tagline: 'Basoli, vicoli and Vesuvio',

  // Deliveries, in intersection coordinates (multiplied by CELL), about 1.5 minutes each.
  // Every delivery starts at the pizzeria corner (0, 0) and ends at the customer, the last point.
  // `path` is the street route: rivals ride it, the road arrows show it, and checkpoints and ramps
  // are placed along it. The palazzo covers blocks (2..3, 2..3) and its tunnel along row 3 is the
  // secret shortcut: `detour` gives the path segments [from, to) that ride around it, which never
  // get a checkpoint so the tunnel stays a valid line.
  deliveries: [
    {
      name: 'Lungomare',
      path: [[0, 0], [0, 3], [2, 3], [2, 4], [4, 4], [4, 3], [8, 3], [8, 0], [10, 0], [10, 5], [7, 5], [7, 8],
        [10, 8], [10, 10], [4, 10], [4, 7], [1, 7], [1, 10]],
      detour: [2, 5],
    },
    {
      name: 'Piazza del Gesù',
      path: [[0, 0], [3, 0], [3, 2], [1, 2], [1, 6], [5, 6], [5, 9], [9, 9], [9, 4], [6, 4], [6, 1], [10, 1],
        [10, 10], [8, 10]],
    },
    {
      name: 'Mercato',
      path: [[0, 0], [6, 0], [6, 3], [4, 3], [4, 4], [1, 4], [1, 3], [0, 3], [0, 8], [3, 8], [3, 10], [8, 10],
        [8, 6], [10, 6], [10, 0], [8, 0]],
      detour: [3, 6],
    },
    {
      name: 'Quartieri Spagnoli',
      path: [[0, 0], [6, 0], [6, 3], [5, 3], [5, 6], [3, 6], [3, 9], [7, 9], [7, 7], [10, 7], [10, 10], [0, 10],
        [0, 6]],
    },
    {
      name: 'Stadio',
      path: [[0, 0], [0, 9], [2, 9], [2, 5], [3, 5], [3, 4], [6, 4], [6, 0], [9, 0], [9, 8], [7, 8], [7, 10],
        [10, 10]],
    },
  ],

  // Secret alleys ("vicoli"): narrow passages straight through a row of blocks, hidden behind
  // hanging laundry. `axis` is the direction the alley runs; it lies mid-block on row/column `at`
  // and spans from street `from` to street `to`. Each one cuts a big corner off at least one delivery.
  alleys: [
    { axis: 'x', at: 2, from: 8, to: 10 },   // Lungomare
    { axis: 'z', at: 7, from: 8, to: 10 },   // Lungomare
    { axis: 'z', at: 1, from: 0, to: 2 },    // Piazza del Gesù
    { axis: 'z', at: 4, from: 0, to: 3 },    // Mercato
    { axis: 'z', at: 4, from: 6, to: 9 },    // Quartieri Spagnoli
    { axis: 'x', at: 6, from: 0, to: 2 },    // Stadio
  ],

  // Traffic: Meshy models where loaded, boxes otherwise.
  cars: [
    { id: 'fiat_500', len: 4, w: 2, h: 1.6, color: 0xf3ead2, speed: 13 },
    { id: 'ape', len: 3.4, w: 1.6, h: 2, color: 0x8ec5e8, speed: 10 },
    { id: 'fiat_500', len: 4, w: 2, h: 1.6, color: 0xc8302c, speed: 14 },
    { id: 'bus', len: 10, w: 3, h: 3.6, color: 0xf08a24, speed: 9, avenue: true },
  ],

  // Jumps, cycled along the long straights.
  ramps: ['stairs', 'fountain', 'crates', 'truck'],
  rampStyle: { steps: [0xd8cdb8, 0xcfc3ac], wall: 0xbfb29a, door: 0x4a3324, frame: 0xe9e2d4, truck: 0xe8b21c, works: 'barrier' },

  locals: { nonna: true, cops: true },
  ground: () => TEX.basoli(),
  roadLines: 0xf5f1e6,
  pavementColor: 0xc9c1b4,
  // Blocks with their own contents (not ordinary palazzi), by "bi,bj".
  landmarkBlocks: ['1,4', '0,1', '0,0'],

  materials() {
    const out = {};
    for (let v = 0; v < 4; v++) {
      const t = TEX.facade(v);
      out[`facade${v}`] = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, vertexColors: true, roughness: 0.9 });
    }
    out.plinth = new THREE.MeshStandardMaterial({ map: TEX.shopfront().map, vertexColors: true, roughness: 0.85 });
    const pav = TEX.pavement();
    out.pavement = new THREE.MeshStandardMaterial({ map: pav.map, normalMap: pav.normalMap, vertexColors: true, roughness: 0.9 });
    return out;
  },

  // One block of the grid: a landmark, or 2x2 palazzi of random heights. `rnd` is the layout's own
  // random sequence (building details draw from the world's).
  block(w, bi, bj, inner, outer, alley, rnd) {
    if (!outer && bi === 1 && bj === 4) return piazza(w, inner);
    if (!outer && bi === 0 && bj === 1) return market(w, inner);
    if (!outer && bi === 0 && bj === 0) return pizzeria(w, inner);
    const bw = (inner.maxX - inner.minX) / 2, bd = (inner.maxZ - inner.minZ) / 2;
    for (let a = 0; a < 2; a++) {
      for (let b = 0; b < 2; b++) {
        const h = outer ? 24 + rnd() * 10 : 11 + rnd() * 13;
        const col = PALETTE[Math.floor(rnd() * PALETTE.length)];
        const streets = outer ? [] : [a ? '+x' : '-x', b ? '+z' : '-z'];
        let x0 = inner.minX + bw * a + 0.3, x1 = inner.minX + bw * (a + 1) - 0.3;
        let z0 = inner.minZ + bd * b + 0.3, z1 = inner.minZ + bd * (b + 1) - 0.3;
        // Leave the alley open between the two rows of buildings.
        if (alley?.axis === 'x') { if (b === 0) z1 = alley.line - ALLEY_HALF; else z0 = alley.line + ALLEY_HALF; }
        if (alley?.axis === 'z') { if (a === 0) x1 = alley.line - ALLEY_HALF; else x0 = alley.line + ALLEY_HALF; }
        building(w, (x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, h, col, streets);
      }
    }
  },

  // The palazzo over blocks (2..3, 2..3), with the tunnel through it hidden behind laundry.
  special(w) {
    const P = PALAZZO, T = TUNNEL;
    const h = 20, wd = P.maxX - P.minX;
    w.sidewalk(P.minX - 2, P.maxX + 2, P.minZ - 2, P.maxZ + 2);
    building(w, (P.minX + P.maxX) / 2, (P.minZ + T.minZ) / 2, wd, T.minZ - P.minZ, h, 0xe8c07a);
    building(w, (P.minX + P.maxX) / 2, (T.maxZ + P.maxZ) / 2, wd, P.maxZ - T.maxZ, h, 0xe8c07a);
    // Arch over the tunnel, high enough to ride under.
    const roof = box(wd, h - 6, T.maxZ - T.minZ, 0xd9ab62);
    roof.position.set((P.minX + P.maxX) / 2, 6 + (h - 6) / 2, 3 * CELL);
    w.scene.add(roof);
    // Laundry hides both entrances: you can ride straight through it.
    for (const x of [T.minX - 0.3, T.maxX + 0.3]) {
      const sheets = [0xffffff, 0xf2a7c3, 0x9fd3e6, 0xf7e27a];
      for (let i = 0; i < 4; i++) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 4.2), mat(sheets[i], { side: THREE.DoubleSide }));
        s.position.set(x, 3.6, T.minZ + 0.9 + i * 1.8);
        s.rotation.y = Math.PI / 2;
        w.scene.add(s);
      }
    }
  },

  // An alley through one block: laundry hiding both mouths, an arch overhead.
  alleyDressing(w, alley, minX, maxX, minZ, maxZ) {
    const L = alley.line, alongX = alley.axis === 'x';
    const sheets = [0xffffff, 0xf2a7c3, 0x9fd3e6, 0xf7e27a, 0xe85d4a];
    const mouths = alongX ? [minX + 2.6, maxX - 2.6] : [minZ + 2.6, maxZ - 2.6];
    for (const m of mouths) {
      for (let i = 0; i < 3; i++) {
        const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 4), mat(sheets[(i + Math.round(m)) % sheets.length], { side: THREE.DoubleSide }));
        const t = L - ALLEY_HALF + 0.9 + i * 1.8;
        if (alongX) { sheet.position.set(m, 3.3, t); sheet.rotation.y = Math.PI / 2; } else sheet.position.set(t, 3.3, m);
        w.scene.add(sheet);
      }
    }
    // Arch joining the two rows of buildings in the middle of the block.
    const c = alongX ? (minX + maxX) / 2 : (minZ + maxZ) / 2;
    const [aw, ad] = alongX ? [5, ALLEY_HALF * 2 + 0.6] : [ALLEY_HALF * 2 + 0.6, 5];
    const [x, z] = alongX ? [c, L] : [L, c];
    w.geo('facade1').push(coloredBox(aw, 5, ad, x, 8.1, z, 0xe3c9a0, (g) => bayUVs(g, aw, ad, BAY, 1)));
    w.geo('trim').push(coloredBox(aw + 0.4, 0.4, ad + 0.4, x, 5.6, z, 0xfff1dc));
  },

  // Iron lamp posts with a curved arm, and laundry on lines across the streets.
  streetLife(w) {
    w.lampPosts(mergeGeometries([
      new THREE.CylinderGeometry(0.1, 0.16, 5, 8).translate(0, 2.5, 0),
      new THREE.CylinderGeometry(0.22, 0.22, 0.5, 8).translate(0, 0.25, 0),
      new THREE.BoxGeometry(0.08, 0.08, 1.2).translate(0, 5, 0.55),
      new THREE.ConeGeometry(0.42, 0.35, 8).translate(0, 5.05, 1.1),
    ]), new THREE.BoxGeometry(0.4, 0.5, 0.4).translate(0, 4.65, 1.1));

    const rnd = w.rnd;
    const cloth = [], lines = [];
    const span = HALF + 2.4;
    for (let i = 0; i <= GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        for (const alongZ of [true, false]) {
          if (i === 3 && (j === 2 || j === 3)) continue;    // inside the palazzo
          if (rnd() > 0.45) continue;
          const t = j * CELL + CELL * (0.3 + rnd() * 0.4);
          const y = 6.5 + rnd() * 3.5;
          const c = i * CELL;
          // The line runs across the street: along x for a street that runs along z.
          const at = (u) => (alongZ ? [c + u, t] : [t, c + u]);
          const [x0, z0] = at(0);
          lines.push(new THREE.BoxGeometry(alongZ ? span * 2 : 0.04, 0.04, alongZ ? 0.04 : span * 2).translate(x0, y, z0));
          for (let u = -span + 1; u < span - 0.8; u += 1.3 + rnd() * 0.6) {
            if (rnd() < 0.25) continue;
            const k = Math.floor(rnd() * 8);
            const ch = 0.8 + rnd() * 0.7, cw = 0.7 + rnd() * 0.4;
            const g = new THREE.PlaneGeometry(cw, ch);
            const uv = g.attributes.uv;
            for (let n = 0; n < uv.count; n++) uv.setX(n, (k + uv.getX(n) * 0.9 + 0.05) / 8);
            const sag = 0.5 * (1 - (u / span) ** 2);
            g.translate(0, -ch / 2, 0);
            if (!alongZ) g.rotateY(Math.PI / 2);
            const [x, z] = at(u + cw / 2);
            g.translate(x, y - sag, z);
            cloth.push(g);
          }
        }
      }
    }
    const clothes = new THREE.Mesh(mergeGeometries(cloth),
      new THREE.MeshStandardMaterial({ map: TEX.laundry(), side: THREE.DoubleSide, roughness: 1 }));
    clothes.castShadow = true;
    w.scene.add(clothes, new THREE.Mesh(mergeGeometries(lines), new THREE.MeshBasicMaterial({ color: 0x3a3a3a })));
  },

  landmarks(w) {
    const v = makeObject('vesuvius', 260, () => {
      const g = new THREE.Group();
      const cone = new THREE.Mesh(new THREE.ConeGeometry(160, 110, 24, 1, true), mat(0x6f7f5a));
      cone.position.y = 55; g.add(cone);
      return g;
    });
    v.position.set(GRID * CELL * 0.5, -5, -260);
    w.scene.add(v);
  },
};

