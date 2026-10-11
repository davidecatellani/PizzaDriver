import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CELL, STREET, GRID, RACE, ALLEYS } from './config.js';
import { box, mat, makeObject } from './assets.js';
import * as TEX from './textures.js';

const HALF = STREET / 2;
// Neapolitan plaster: ochre, Pompeian red, salmon, cream, terracotta, sage, pale blue.
const PALETTE = [0xe8b75a, 0xd98c73, 0xc8643f, 0xefdcb8, 0xe6a86b, 0xcfc39b, 0xb9d3c9, 0xe3c9a0, 0xa94f3b, 0xf0c9a8];

// Palazzo covering blocks (2..3, 2..3); the tunnel runs through it along z = 3*CELL.
const PALAZZO = { minX: 2 * CELL + HALF, maxX: 4 * CELL - HALF, minZ: 2 * CELL + HALF, maxZ: 4 * CELL - HALF };
const TUNNEL_HALF = 3.6;
const ALLEY_HALF = 2.7;     // half-width of a secret alley between the buildings
export const TUNNEL = { minX: PALAZZO.minX, maxX: PALAZZO.maxX, minZ: 3 * CELL - TUNNEL_HALF, maxZ: 3 * CELL + TUNNEL_HALF };

const PLINTH = 3.6;      // ground floor (shops) height
const BAY = 5;          // facade window spacing
const FLOOR = 4;        // storey height above the ground floor

// UVs from world position, for tiled surfaces (pavement, ground).
function worldUVs(geo, scale) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    if (ay > 0.5) uv.setXY(i, p.getX(i) / scale, p.getZ(i) / scale);
    else if (ax > 0.5) uv.setXY(i, p.getZ(i) / scale, p.getY(i) / scale);
    else uv.setXY(i, p.getX(i) / scale, p.getY(i) / scale);
  }
}

// Box UVs so each side face shows a whole number of bays across and `rows` across the height.
// Roof and floor get a plain texel.
function bayUVs(geo, w, d, bay, rows) {
  const uv = geo.attributes.uv;
  const widths = [d, d, 0, 0, w, w];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      if (!widths[f]) uv.setXY(k, 0.5, 0.01);
      else uv.setXY(k, uv.getX(k) * Math.max(1, Math.round(widths[f] / bay)), uv.getY(k) * rows);
    }
  }
}

function coloredBox(w, h, d, x, y, z, color, uvFix) {
  const geo = new THREE.BoxGeometry(w, h, d);
  uvFix?.(geo);
  geo.translate(x, y, z);
  const c = new THREE.Color(color);
  const cols = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < cols.length; i += 3) { cols[i] = c.r; cols[i + 1] = c.g; cols[i + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return geo;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.posts = [];            // thin round obstacles (lamp posts): riders slide round them
    this.ramps = [];
    this.roadworks = [];        // static road-works dressing, rebuilt with each route
    this.debris = [];           // loose pieces that fly off when hit
    this.rnd = (() => { let seed = 99; return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); })();
    this.facades = [[], [], [], []];   // one list per facade texture variant
    this.plinths = [];
    this.trims = [];                   // cornices, balconies, rooftop rooms: untextured, vertex coloured
    this.pavements = [];
    // Secret alleys: which blocks they cut through, and the hidden areas that count as found.
    this.alleyAt = new Map();
    this.secrets = [{ ...TUNNEL, minX: TUNNEL.minX + 4, maxX: TUNNEL.maxX - 4, id: 'tunnel' }];
    this.alleys = ALLEYS.map((a, n) => {
      const line = (a.at + 0.5) * CELL;
      for (let k = a.from; k < a.to; k++) {
        const [bi, bj] = a.axis === 'x' ? [k, a.at] : [a.at, k];
        this.alleyAt.set(`${bi},${bj}`, { axis: a.axis, line });
        const lo = k * CELL + HALF + 2, hi = (k + 1) * CELL - HALF - 2;
        this.secrets.push(a.axis === 'x'
          ? { minX: lo, maxX: hi, minZ: line - ALLEY_HALF, maxZ: line + ALLEY_HALF, id: `alley${n}` }
          : { minX: line - ALLEY_HALF, maxX: line + ALLEY_HALF, minZ: lo, maxZ: hi, id: `alley${n}` });
      }
      // End points on the street centre lines, for keeping checkpoints off the stretch an alley skips.
      return a.axis === 'x'
        ? { a: new THREE.Vector2(a.from * CELL, line), b: new THREE.Vector2(a.to * CELL, line) }
        : { a: new THREE.Vector2(line, a.from * CELL), b: new THREE.Vector2(line, a.to * CELL) };
    });
    this.buildGround();
    this.buildCity();
    this.buildPalazzo();
    this.mergeCity();
    this.buildLandmarks();
    this.buildStreetLife();
    this.checkpoints = [];
    this.routeRamps = [];
  }

  addCollider(minX, maxX, minZ, maxZ) {
    this.colliders.push({ minX, maxX, minZ, maxZ });
  }

  // Buildings and pavements are collected and merged into a few meshes (one per material),
  // so the whole city costs a handful of draw calls instead of one per box.
  // `streets` lists the sides that face a street ('-x', '+x', '-z', '+z'): those get balconies.
  building(x, z, w, d, h, color, streets = []) {
    const rnd = this.rnd;
    const floors = Math.max(1, Math.round((h - PLINTH) / FLOOR));
    h = PLINTH + floors * FLOOR;
    const variant = Math.floor(rnd() * 4);
    const trim = new THREE.Color(color).lerp(new THREE.Color(0xfff8ec), 0.55);
    this.facades[variant].push(coloredBox(w, h - PLINTH, d, x, PLINTH + (h - PLINTH) / 2, z, color, (g) => bayUVs(g, w, d, BAY, floors)));
    this.plinths.push(coloredBox(w + 0.2, PLINTH, d + 0.2, x, PLINTH / 2, z, 0xffffff, (g) => bayUVs(g, w, d, 7, 1)));
    // Cornice on top and a band over the shops.
    this.trims.push(coloredBox(w + 1, 0.6, d + 1, x, h - 0.3, z, trim));
    this.trims.push(coloredBox(w + 0.5, 0.35, d + 0.5, x, PLINTH, z, trim));
    // Some roofs carry a set-back attic room.
    if (rnd() < 0.35) this.trims.push(coloredBox(w * 0.45, 2.6, d * 0.4, x + (rnd() - 0.5) * w * 0.3, h + 1.3, z + (rnd() - 0.5) * d * 0.3, color));
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
            this.trims.push(coloredBox(sw, 0.16, sd, cx, y, cz, trim));
            // Railing: front and two sides, wrought-iron dark.
            const [fx, fz] = alongX ? [cx, cz + sgn * 0.42] : [cx + sgn * 0.42, cz];
            this.trims.push(coloredBox(alongX ? sw : 0.05, 0.9, alongX ? 0.05 : sd, fx, y + 0.53, fz, 0x262626));
          }
        }
      }
    }
    this.addCollider(x - w / 2 - 0.1, x + w / 2 + 0.1, z - d / 2 - 0.1, z + d / 2 + 0.1);
  }

  mergeCity() {
    const add = (geos, material, shadow = true) => {
      if (!geos.length) return;
      const m = new THREE.Mesh(mergeGeometries(geos), material);
      m.castShadow = shadow;
      m.receiveShadow = true;
      this.scene.add(m);
    };
    this.facades.forEach((geos, v) => {
      const t = TEX.facade(v);
      add(geos, new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, vertexColors: true, roughness: 0.9 }));
    });
    const shop = TEX.shopfront();
    add(this.plinths, new THREE.MeshStandardMaterial({ map: shop.map, vertexColors: true, roughness: 0.85 }));
    add(this.trims, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
    const pav = TEX.pavement();
    add(this.pavements, new THREE.MeshStandardMaterial({ map: pav.map, normalMap: pav.normalMap, vertexColors: true, roughness: 0.9 }), false);
  }

  buildGround() {
    const size = (GRID + 4) * CELL;
    const stone = TEX.basoli();
    stone.map.repeat.set(size / 4, size / 4);
    stone.normalMap.repeat.set(size / 4, size / 4);
    const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({ map: stone.map, normalMap: stone.normalMap, roughness: 0.85 }));
    asphalt.rotation.x = -Math.PI / 2;
    asphalt.position.set(GRID * CELL / 2, 0, GRID * CELL / 2);
    asphalt.receiveShadow = true;
    this.scene.add(asphalt);

    // Dashed centre lines.
    const dash = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.4, 3), mat(0xf5f1e6), 2000);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    let n = 0;
    for (let i = 0; i <= GRID; i++) {
      for (let s = 0; s < GRID * CELL; s += 7) {
        const m = s % CELL;
        if (m < HALF + 5 || m > CELL - HALF - 5) continue;   // keep crossings clear for the zebra stripes
        for (const [x, z, rot] of [[i * CELL, s, 0], [s, i * CELL, Math.PI / 2]]) {
          if (n >= 2000) break;
          q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, rot));
          m4.compose(new THREE.Vector3(x, 0.02, z), q, new THREE.Vector3(1, 1, 1));
          dash.setMatrixAt(n++, m4);
        }
      }
    }
    dash.count = n;
    this.scene.add(dash);
  }

  sidewalk(minX, maxX, minZ, maxZ) {
    const geo = coloredBox(maxX - minX, 0.3, maxZ - minZ, (minX + maxX) / 2, 0.15, (minZ + maxZ) / 2, 0xc9c1b4);
    worldUVs(geo, 2);
    this.pavements.push(geo);
  }

  buildCity() {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

    for (let bi = -1; bi <= GRID; bi++) {
      for (let bj = -1; bj <= GRID; bj++) {
        const minX = bi * CELL + HALF, maxX = (bi + 1) * CELL - HALF;
        const minZ = bj * CELL + HALF, maxZ = (bj + 1) * CELL - HALF;
        if (bi >= 2 && bi <= 3 && bj >= 2 && bj <= 3) continue; // palazzo
        const outer = bi < 0 || bj < 0 || bi >= GRID || bj >= GRID;
        const alley = this.alleyAt.get(`${bi},${bj}`);
        if (alley) {
          // Pavement on both sides of the alley, none in it.
          const L = alley.line;
          if (alley.axis === 'x') {
            this.sidewalk(minX, maxX, minZ, L - ALLEY_HALF);
            this.sidewalk(minX, maxX, L + ALLEY_HALF, maxZ);
          } else {
            this.sidewalk(minX, L - ALLEY_HALF, minZ, maxZ);
            this.sidewalk(L + ALLEY_HALF, maxX, minZ, maxZ);
          }
          this.alleyDressing(alley, minX, maxX, minZ, maxZ);
        } else {
          this.sidewalk(minX, maxX, minZ, maxZ);
        }
        const inner = { minX: minX + 2, maxX: maxX - 2, minZ: minZ + 2, maxZ: maxZ - 2 };

        if (!outer && bi === 1 && bj === 4) { this.piazza(inner); continue; }
        if (!outer && bi === 0 && bj === 1) { this.market(inner); continue; }
        if (!outer && bi === 0 && bj === 0) { this.pizzeria(inner); continue; }

        // 2x2 buildings per block, random heights.
        const w = (inner.maxX - inner.minX) / 2, d = (inner.maxZ - inner.minZ) / 2;
        for (let a = 0; a < 2; a++) {
          for (let b = 0; b < 2; b++) {
            const h = outer ? 24 + rnd() * 10 : 11 + rnd() * 13;
            const col = PALETTE[Math.floor(rnd() * PALETTE.length)];
            const streets = outer ? [] : [a ? '+x' : '-x', b ? '+z' : '-z'];
            let x0 = inner.minX + w * a + 0.3, x1 = inner.minX + w * (a + 1) - 0.3;
            let z0 = inner.minZ + d * b + 0.3, z1 = inner.minZ + d * (b + 1) - 0.3;
            // Leave the alley open between the two rows of buildings.
            if (alley?.axis === 'x') { if (b === 0) z1 = alley.line - ALLEY_HALF; else z0 = alley.line + ALLEY_HALF; }
            if (alley?.axis === 'z') { if (a === 0) x1 = alley.line - ALLEY_HALF; else x0 = alley.line + ALLEY_HALF; }
            this.building((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, h, col, streets);
          }
        }
      }
    }
  }

  pizzeria(r) {
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
    this.scene.add(p);
    this.addCollider(r.minX, r.maxX, r.minZ, r.maxZ);
    this.sign('PIZZERIA', cx - (r.maxX - r.minX) / 2 - 0.2, 7, cz, Math.PI / 2);
  }

  market(r) {
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
      this.scene.add(stall);
      this.addCollider(x - 1.7, x + 1.7, z - 2.2, z + 2.2);
    }
    this.building((r.minX + r.maxX) / 2 + 6, (r.minZ + r.maxZ) / 2, 14, r.maxZ - r.minZ, 12, 0xf4a6a0);
  }

  piazza(r) {
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
    this.scene.add(f);
    this.addCollider(cx - 3.6, cx + 3.6, cz - 3.6, cz + 3.6);
    for (const [dx, dz] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) {
      const t = makeObject('cafe_table', 2, () => {
        const g = new THREE.Group();
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.1, 12), mat(0xffffff));
        top.position.y = 1; g.add(top);
        const leg = box(0.15, 1, 0.15, 0x333333); leg.position.y = 0.5; g.add(leg);
        return g;
      });
      t.position.set(cx + dx, 0.3, cz + dz);
      this.scene.add(t);
    }
  }

  buildPalazzo() {
    const P = PALAZZO, T = TUNNEL;
    const h = 20, w = P.maxX - P.minX;
    this.sidewalk(P.minX - 2, P.maxX + 2, P.minZ - 2, P.maxZ + 2);
    this.building((P.minX + P.maxX) / 2, (P.minZ + T.minZ) / 2, w, T.minZ - P.minZ, h, 0xe8c07a);
    this.building((P.minX + P.maxX) / 2, (T.maxZ + P.maxZ) / 2, w, P.maxZ - T.maxZ, h, 0xe8c07a);
    // Arch over the tunnel, high enough to ride under.
    const roof = box(w, h - 6, T.maxZ - T.minZ, 0xd9ab62);
    roof.position.set((P.minX + P.maxX) / 2, 6 + (h - 6) / 2, 3 * CELL);
    this.scene.add(roof);
    // Laundry hides both entrances: you can ride straight through it.
    this.curtains ??= [];
    for (const x of [T.minX - 0.3, T.maxX + 0.3]) {
      const sheets = [0xffffff, 0xf2a7c3, 0x9fd3e6, 0xf7e27a];
      for (let i = 0; i < 4; i++) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 4.2), mat(sheets[i], { side: THREE.DoubleSide }));
        s.position.set(x, 3.6, T.minZ + 0.9 + i * 1.8);
        s.rotation.y = Math.PI / 2;
        this.scene.add(s);
        this.curtains.push(s);
      }
    }
  }

  // An alley through one block: laundry hiding both mouths, an arch overhead, washing lines above.
  alleyDressing(alley, minX, maxX, minZ, maxZ) {
    const L = alley.line, alongX = alley.axis === 'x';
    const sheets = [0xffffff, 0xf2a7c3, 0x9fd3e6, 0xf7e27a, 0xe85d4a];
    const mouths = alongX ? [minX + 2.6, maxX - 2.6] : [minZ + 2.6, maxZ - 2.6];
    this.curtains ??= [];
    for (const m of mouths) {
      for (let i = 0; i < 3; i++) {
        const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 4), mat(sheets[(i + Math.round(m)) % sheets.length], { side: THREE.DoubleSide }));
        const t = L - ALLEY_HALF + 0.9 + i * 1.8;
        if (alongX) { sheet.position.set(m, 3.3, t); sheet.rotation.y = Math.PI / 2; } else sheet.position.set(t, 3.3, m);
        this.scene.add(sheet);
        this.curtains.push(sheet);
      }
    }
    // Arch joining the two rows of buildings in the middle of the block.
    const c = alongX ? (minX + maxX) / 2 : (minZ + maxZ) / 2;
    const [w, d] = alongX ? [5, ALLEY_HALF * 2 + 0.6] : [ALLEY_HALF * 2 + 0.6, 5];
    const [x, z] = alongX ? [c, L] : [L, c];
    this.facades[1].push(coloredBox(w, 5, d, x, 8.1, z, 0xe3c9a0, (g) => bayUVs(g, w, d, BAY, 1)));
    this.trims.push(coloredBox(w + 0.4, 0.4, d + 0.4, x, 5.6, z, 0xfff1dc));
  }

  // True when (x, z) is inside an ordinary block of buildings (not a landmark, the palazzo or an alley).
  plainBlock(x, z) {
    const bi = Math.floor(x / CELL), bj = Math.floor(z / CELL);
    if (bi < 0 || bj < 0 || bi >= GRID || bj >= GRID) return false;
    if (bi >= 2 && bi <= 3 && bj >= 2 && bj <= 3) return false;
    if ((bi === 1 && bj === 4) || (bi === 0 && bj === 1) || (bi === 0 && bj === 0)) return false;
    return !this.alleyAt.has(`${bi},${bj}`);
  }

  // The secret area (palazzo tunnel or an alley) containing (x, z), if any.
  secretAt(x, z) {
    return this.secrets.find((r) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ);
  }

  // Street furniture and life: lamp posts at the corners, zebra crossings, laundry lines across streets.
  buildStreetLife() {
    const rnd = this.rnd;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    const inPalazzo = (bi, bj) => bi >= 2 && bi <= 3 && bj >= 2 && bj <= 3;

    // Lamp posts: iron pole with a curved arm and a glowing lantern.
    const iron = mergeGeometries([
      new THREE.CylinderGeometry(0.1, 0.16, 5, 8).translate(0, 2.5, 0),
      new THREE.CylinderGeometry(0.22, 0.22, 0.5, 8).translate(0, 0.25, 0),
      new THREE.BoxGeometry(0.08, 0.08, 1.2).translate(0, 5, 0.55),
      new THREE.ConeGeometry(0.42, 0.35, 8).translate(0, 5.05, 1.1),
    ]);
    const lamps = [];
    for (let bi = 0; bi < GRID; bi++) {
      for (let bj = 0; bj < GRID; bj++) {
        if (inPalazzo(bi, bj)) continue;
        const minX = bi * CELL + HALF, maxX = (bi + 1) * CELL - HALF;
        const minZ = bj * CELL + HALF, maxZ = (bj + 1) * CELL - HALF;
        // At the kerb, so a rider never gets wedged between a post and a wall.
        for (const [x, z] of [[minX + 0.5, minZ + 0.5], [maxX - 0.5, maxZ - 0.5], [minX + 0.5, maxZ - 0.5], [maxX - 0.5, minZ + 0.5]]) {
          // Arm points out over the street.
          const toStreetX = x < (minX + maxX) / 2 ? -1 : 1, toStreetZ = z < (minZ + maxZ) / 2 ? -1 : 1;
          lamps.push({ x, z, rot: Math.atan2(toStreetX, toStreetZ) });
          this.posts.push({ x, z, r: 0.25 });
        }
      }
    }
    const poles = new THREE.InstancedMesh(iron, mat(0x22262a, { roughness: 0.5, metalness: 0.6 }), lamps.length);
    const glow = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.5, 0.4).translate(0, 4.65, 1.1),
      new THREE.MeshStandardMaterial({ color: 0xfff1c9, emissive: 0xffc46b, emissiveIntensity: 1.6 }), lamps.length);
    lamps.forEach((l, k) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), l.rot);
      m4.compose(new THREE.Vector3(l.x, 0.3, l.z), q, one);
      poles.setMatrixAt(k, m4);
      glow.setMatrixAt(k, m4);
    });
    poles.castShadow = true;
    this.scene.add(poles, glow);

    // Zebra crossings on every approach to every crossroads.
    const stripes = [];
    for (let i = 0; i <= GRID; i++) {
      for (let j = 0; j <= GRID; j++) {
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const cx = i * CELL + dx * (HALF + 2.4), cz = j * CELL + dz * (HALF + 2.4);
          for (let t = -HALF + 1.2; t <= HALF - 1.2; t += 1.5) {
            stripes.push(dx ? [cx, cz + t, Math.PI / 2] : [cx + t, cz, 0]);
          }
        }
      }
    }
    const zebra = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.75, 3.4),
      mat(0xf2efe6, { roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }), stripes.length);
    stripes.forEach(([x, z, rot], k) => {
      q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, rot));
      m4.compose(new THREE.Vector3(x, 0.03, z), q, one);
      zebra.setMatrixAt(k, m4);
    });
    zebra.receiveShadow = true;
    this.scene.add(zebra);

    // Laundry hung on lines between facing balconies, high above the traffic.
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
            if (alongZ) g.rotateY(0); else g.rotateY(Math.PI / 2);
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
    this.clothes = clothes;
    this.scene.add(clothes, new THREE.Mesh(mergeGeometries(lines), new THREE.MeshBasicMaterial({ color: 0x3a3a3a })));
  }

  // A straight jump at (x, z) facing `heading` (0 = +z): rises from 0 to h over L metres, w wide.
  // The rideable surface is the same wedge for every kind; only the dressing differs.
  addRamp(x, z, heading, kind = 'stairs') {
    const dims = { stairs: [9, 5, 2.4], crates: [8, 2.8, 2.1], truck: [9, 2.5, 3.2] }[kind];
    const [L, w, h] = dims;
    const g = new THREE.Group();
    const stone = 0xd8cdb8, wood = 0x9c6b3c;
    if (kind === 'stairs') {
      // Marble steps with low parapet walls either side.
      const n = 10;
      for (let k = 0; k < n; k++) {
        const step = box(w, h * (k + 1) / n, L / n, k % 2 ? stone : 0xcfc3ac);
        step.position.set(0, h * (k + 1) / n / 2, L * (k + 0.5) / n);
        g.add(step);
      }
      // The palazzo's entrance: a stone landing across the pavement at the top of the steps,
      // and a doorway in the facade behind it. Local +x is towards the kerb and the building.
      const toWall = HALF + 2.3 - (HALF - 2.3) - w / 2;   // from the steps' edge to the facade
      const landing = box(toWall, h, 3.2, 0xcfc3ac);
      landing.position.set(w / 2 + toWall / 2, h / 2, L - 1.6);
      landing.userData.solid = h;   // walkers and riders on the pavement go round it
      g.add(landing);
      const frame = box(0.2, 3.9, 3.1, 0xe9e2d4);
      frame.position.set(w / 2 + toWall + 0.05, h + 1.95, L - 1.6);
      g.add(frame);
      const door = box(0.12, 3.2, 2.2, 0x4a3324);
      door.position.set(w / 2 + toWall - 0.08, h + 1.6, L - 1.6);
      g.add(door);
      for (const sx of [-1]) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1, L), mat(0xbfb29a));
        wall.position.set(sx * (w / 2 + 0.22), 0.5, L / 2);
        // Sloped top following the steps.
        const pos = wall.geometry.attributes.position;
        for (let v = 0; v < pos.count; v++) {
          if (pos.getY(v) > 0) pos.setY(v, h * (pos.getZ(v) / L + 0.5) + 0.3);
        }
        pos.needsUpdate = true;
        wall.geometry.computeVertexNormals();
        wall.castShadow = true;
        g.add(wall);
      }
    } else if (kind === 'crates') {
      // A plank propped on a stack of tomato crates.
      const plank = box(w, 0.12, Math.hypot(L, h), wood);
      plank.rotation.x = -Math.atan2(h, L);
      plank.position.set(0, h / 2, L / 2);
      g.add(plank);
      for (let cx = -1; cx <= 1; cx += 2) {
        for (let cy = 0; cy < 3; cy++) {
          const crate = box(1.3, 0.68, 1.1, 0xb98a52);
          crate.position.set(cx * 0.66, 0.34 + cy * 0.69 - 0.05, L + 0.5);
          g.add(crate);
          const toms = box(1.1, 0.12, 0.9, 0xd8392b);
          toms.position.set(cx * 0.66, 0.66 + cy * 0.69 - 0.05, L + 0.5);
          g.add(toms);
        }
      }
    } else if (kind === 'truck') {
      // A parked tipper truck with its body tipped right down to the road: ride up the bed
      // and fly over the cab. Local +z is the truck's front.
      const yellow = 0xe8b21c, steel = 0x3b3f44;
      const slope = -Math.atan2(h, L), len = Math.hypot(L, h);
      const bed = new THREE.Group();
      bed.rotation.x = slope;
      bed.position.set(0, h / 2, L / 2);
      const floor = box(w, 0.14, len, 0x8c7a5a);
      bed.add(floor);
      for (const sx of [-1, 1]) {
        const side = box(0.12, 0.7, len, yellow);
        side.position.set(sx * (w / 2 - 0.06), 0.35, 0);
        bed.add(side);
      }
      const head = box(w, 1.1, 0.14, yellow);   // the front board, up behind the cab
      head.position.set(0, 0.55, len / 2 - 0.07);
      bed.add(head);
      // Ribs under the sides.
      for (let k = -2; k <= 2; k++) {
        const rib = box(w + 0.1, 0.12, 0.12, 0xb98a12);
        rib.position.set(0, -0.12, k * len / 5);
        bed.add(rib);
      }
      g.add(bed);
      // Chassis rails from the hinge forwards, wheels, the ram that tipped the body, and the cab.
      const chassis = box(1.3, 0.35, L - 0.6, steel);
      chassis.position.set(0, 1.0, (3.6 + L + 3) / 2);
      g.add(chassis);
      const ram = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, h - 1.2, 10), mat(0xb0b4b8, { metalness: 0.7, roughness: 0.3 }));
      ram.position.set(0, 1.2 + (h - 1.2) / 2 - 0.15, L - 1.1);
      ram.rotation.x = 0.25;
      g.add(ram);
      const tyre = new THREE.CylinderGeometry(0.55, 0.55, 0.45, 16);
      tyre.rotateZ(Math.PI / 2);
      for (const wz of [3.8, 5.0, L + 1.8]) {
        for (const sx of [-1, 1]) {
          const wheel = new THREE.Mesh(tyre, mat(0x1c1c1c, { roughness: 0.9 }));
          wheel.position.set(sx * (w / 2 - 0.25), 0.55, wz);
          g.add(wheel);
        }
      }
      const cab = box(w, 2.0, 2.4, 0xe0e0dc);
      cab.position.set(0, 2.1, L + 1.7);
      cab.userData.solid = 2.5;   // below the lip of the bed, so riders leaving it clear the cab
      const glass = box(w - 0.3, 0.8, 0.05, 0x23303a);
      glass.position.set(0, 2.55, L + 2.92);
      glass.material.metalness = 0.6; glass.material.roughness = 0.15;
      const bumper = box(w + 0.1, 0.35, 0.25, steel);
      bumper.position.set(0, 0.75, L + 2.95);
      const grille = box(w - 0.6, 0.6, 0.05, 0x55595e);
      grille.position.set(0, 1.4, L + 2.92);
      const stripe = box(w + 0.02, 0.25, 2.42, yellow);
      stripe.position.set(0, 1.55, L + 1.7);
      g.add(cab, glass, bumper, grille, stripe);
      for (const sx of [-1, 1]) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.05),
          new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xfff2c0, emissiveIntensity: 1.5 }));
        lamp.position.set(sx * (w / 2 - 0.3), 1.05, L + 2.96);
        g.add(lamp);
      }
      // The chassis is solid only below the tipped body.
      const from = L * 0.6;   // where the bed is well above the top of the chassis
      const under = box(w, 1.25, L + 0.3 - from, steel);
      under.visible = false;
      under.position.set(0, 0.62, (from + L + 0.3) / 2);
      under.userData.solid = 1.3;
      g.add(under);
    }
    g.position.set(x, 0, z);
    g.rotation.y = heading;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(g);
    // Solid parts become colliders; riders higher than `top` pass over them.
    g.updateMatrixWorld(true);
    for (const o of g.children) {
      if (o.userData.solid === undefined) continue;
      const b = new THREE.Box3().setFromObject(o);
      this.colliders.push({ minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z, top: o.userData.solid, ramp: true });
    }
    this.ramps.push({ kind, x, z, sin: Math.sin(heading), cos: Math.cos(heading), L, w, h, mesh: g });
    if (kind === 'crates') this.addRoadworks(x, z, heading, L);
  }

  // Road works just past the builders' plank: a dug-up patch fenced off with barriers and cones.
  // The pieces are loose: anything that rides into them sends them flying (see updateDebris).
  addRoadworks(x, z, heading, L) {
    const s = Math.sin(heading), c = Math.cos(heading);
    const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    // Static: the hole in the paving and a heap of earth by the kerb.
    const g = new THREE.Group();
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 7.5), mat(0x3b2e22, { roughness: 1 }));
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(-0.6, 0.03, L + 6.4);
    hole.receiveShadow = true;
    const heap = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.6, 9), mat(0x6b5236, { roughness: 1, flatShading: true }));
    heap.position.set(0.7, 0.3, L + 4);
    heap.castShadow = heap.receiveShadow = true;
    g.add(hole, heap);
    g.position.set(x, 0, z);
    g.rotation.y = heading;
    this.scene.add(g);
    this.roadworks.push(g);

    const put = (piece, lx, lz, rot) => {
      const [wx, wz] = at(lx, lz);
      piece.mesh.position.set(wx, piece.half, wz);
      piece.mesh.rotation.set(0, heading + rot, 0);
      piece.mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.scene.add(piece.mesh);
      this.debris.push({ ...piece, vel: new THREE.Vector3(), spin: new THREE.Vector3(), flying: false });
    };
    // Barriers along the road side of the dig and across its far end.
    for (let k = 0; k < 4; k++) put(barrier(k % 2 === 0), -2.9, L + 2.6 + k * 2.2, Math.PI / 2);
    for (const lx of [-1.8, 0.4]) put(barrier(lx < 0), lx, L + 11.2, 0);
    // Cones leading up to the plank and tapering back after the works.
    for (const [lx, lz] of [[-2.1, -5], [-2.1, -1.5], [-2.1, 2.5], [-2.1, 6], [-3, L + 12.5], [-1.9, L + 13.8], [-0.7, L + 14.8]]) put(cone(), lx, lz, 0);
    // A pallet of basoli waiting to be relaid, and the warning sign on the pavement.
    for (let k = 0; k < 6; k++) put(cobble(), 0.3 + (k % 3) * 0.45, L + 8.6 + (k / 3 | 0) * 0.45, Math.random());
    put(sign(), 2.7, -6, Math.PI);
  }

  // Loose road-works pieces: knocked flying by riders and cars, then left lying where they land.
  // `movers`: [{x, y, z, fx, fz, speed, r}] (fx, fz = unit heading). Returns the movers that hit something.
  updateDebris(dt, movers) {
    const hits = new Set();
    for (const d of this.debris) {
      const m = d.mesh.position;
      for (const v of movers) {
        if (d.flying || v.speed < 1.5 || v.y > m.y + d.half + 0.4) continue;
        const dx = m.x - v.x, dz = m.z - v.z;
        const dist = Math.hypot(dx, dz);
        if (dist > d.r + v.r) continue;
        // Thrown forwards with the mover and away from its centre line, tumbling.
        const k = (v.speed * 0.8 + 3) / d.mass;
        const nx = dist > 0.01 ? dx / dist : 0, nz = dist > 0.01 ? dz / dist : 0;
        d.vel.set((v.fx * 1 + nx * 0.6) * k + (Math.random() - 0.5) * 2, 3 + Math.random() * 3 + v.speed * 0.12, (v.fz * 1 + nz * 0.6) * k + (Math.random() - 0.5) * 2);
        d.spin.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 14);
        d.flying = true;
        hits.add(v);
      }
      if (!d.flying) continue;
      d.vel.y -= 22 * dt;
      m.addScaledVector(d.vel, dt);
      const r = d.mesh.rotation;
      r.x += d.spin.x * dt; r.y += d.spin.y * dt; r.z += d.spin.z * dt;
      const floor = d.lie;
      if (m.y < floor && d.vel.y < 0) {
        m.y = floor;
        d.vel.y *= -0.3;
        d.vel.x *= 0.55; d.vel.z *= 0.55;
        d.spin.multiplyScalar(0.5);
        if (Math.abs(d.vel.y) < 1.2 && Math.hypot(d.vel.x, d.vel.z) < 1.5) {
          // Come to rest lying on a side.
          const q = Math.PI / 2;
          r.x = Math.round(r.x / q) * q;
          r.z = Math.round(r.z / q) * q;
          const upright = Math.abs(Math.cos(r.x) * Math.cos(r.z)) > 0.5;
          m.y = upright ? d.half : d.lie;
          d.vel.set(0, 0, 0);
          d.flying = false;
        }
      }
    }
    return [...hits];
  }

  // A round fountain in the middle of the street: its sloping stone rim is a jump from any side.
  addFountainJump(x, z) {
    const R = 5.2, top = 1.2, h = 1.45;
    const g = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(top, R, h, 28, 1), mat(0xd9cfbd));
    rim.position.y = h / 2;
    g.add(rim);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(top * 0.92, top * 0.92, 0.05, 20),
      new THREE.MeshStandardMaterial({ color: 0x4fa7d8, roughness: 0.1, metalness: 0.2 }));
    water.position.y = h + 0.01;
    g.add(water);
    // A ring of low basins for looks.
    const basin = new THREE.Mesh(new THREE.TorusGeometry(R * 0.72, 0.18, 6, 28), mat(0xc4b79f));
    basin.rotation.x = Math.PI / 2;
    basin.position.y = h * 0.32;
    g.add(basin);
    g.position.set(x, 0, z);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(g);
    this.ramps.push({ round: true, x, z, R, top, h, mesh: g });
  }

  groundHeight(x, z) {
    let y = 0;
    for (const r of this.ramps) {
      const dx = x - r.x, dz = z - r.z;
      if (r.round) {
        const d = Math.hypot(dx, dz);
        if (d < r.R) y = Math.max(y, d <= r.top ? r.h : (r.h * (r.R - d)) / (r.R - r.top));
        continue;
      }
      const along = dx * r.sin + dz * r.cos;
      const side = dx * r.cos - dz * r.sin;
      if (along >= 0 && along <= r.L && Math.abs(side) <= r.w / 2) y = Math.max(y, (r.h * along) / r.L);
    }
    return y;
  }

  inTunnel(x, z) {
    const T = TUNNEL;
    return x > T.minX + 4 && x < T.maxX - 4 && z > T.minZ && z < T.maxZ;
  }

  sign(text, x, y, z, rotY) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#1d6b3a'; g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#fff'; g.font = 'bold 40px sans-serif'; g.textAlign = 'center';
    g.fillText(text, 128, 46);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: t }));
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    this.scene.add(m);
  }

  buildLandmarks() {
    const v = makeObject('vesuvius', 260, () => {
      const g = new THREE.Group();
      const cone = new THREE.Mesh(new THREE.ConeGeometry(160, 110, 24, 1, true), mat(0x6f7f5a));
      cone.position.y = 55; g.add(cone);
      return g;
    });
    v.position.set(GRID * CELL * 0.5, -5, -260);
    this.scene.add(v);

    // Customer marker: a beam of light, moved to each delivery's address.
    this.customerPos = new THREE.Vector3();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 3, 60, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x55ff88, transparent: true, opacity: 0.25, depthWrite: false }),
    );
    beam.position.y = 30;
    this.scene.add(beam);
    this.customerBeam = beam;
  }

  // Lays out one delivery: checkpoints every ~RACE.checkpointSpacing metres along the route
  // (off corners and off the palazzo detour), ramps on the long straights, and the customer at the end.
  // Each checkpoint carries `time`: the seconds the clock gains for the stretch after it.
  setRoute(delivery) {
    for (const c of this.checkpoints) this.scene.remove(c.mesh);
    for (const r of this.ramps) this.scene.remove(r.mesh);
    for (const o of [...this.roadworks, ...this.debris.map((d) => d.mesh)]) this.scene.remove(o);
    this.roadworks = [];
    this.debris = [];
    this.colliders = this.colliders.filter((c) => !c.ramp);
    this.checkpoints = [];
    this.ramps = [];

    const pts = delivery.path.map(([x, z]) => new THREE.Vector2(x * CELL, z * CELL));
    const [d0, d1] = delivery.detour ?? [-1, -1];
    // Stretches of the route that a secret alley skips: no checkpoints there, or the shortcut would miss one.
    const along = (q) => {
      let acc = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], len = a.distanceTo(b);
        const t = ((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / (len * len);
        if (t >= -1e-6 && t <= 1 + 1e-6 && a.clone().lerp(b, t).distanceTo(q) < 1) return acc + t * len;
        acc += len;
      }
      return null;
    };
    const skipped = [];
    for (const al of this.alleys) {
      const sa = along(al.a), sb = along(al.b);
      if (sa !== null && sb !== null) skipped.push([Math.min(sa, sb) - 30, Math.max(sa, sb) + 30]);
    }
    const isSkipped = (m) => skipped.some(([lo, hi]) => m > lo && m < hi);
    let rampKind = 0;
    const secs = (m) => Math.round(m / RACE.refSpeed + RACE.slack);
    let travelled = 0, lastMark = 0, longSegs = 0;
    const marks = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = a.distanceTo(b);
      const dir = b.clone().sub(a).normalize();
      const heading = Math.atan2(dir.x, dir.y);
      const onDetour = i >= d0 && i < d1;
      // Checkpoints: at least 25 m from either corner of the segment.
      for (let s = 25; s <= len - 25; s += 5) {
        if (onDetour || isSkipped(travelled + s) || travelled + s - lastMark < RACE.checkpointSpacing) continue;
        marks.push({ at: travelled + s, pos: a.clone().addScaledVector(dir, s), heading });
        lastMark = travelled + s;
      }
      // Jumps on every other long straight, a third of the way along: pieces of the city
      // (entrance steps to a palazzo, a fountain, a builders' plank in front of road works,
      // a parked tipper truck with its body down).
      if (len >= 3 * CELL && !onDetour && longSegs++ % 2 === 0) {
        const p = a.clone().addScaledVector(dir, len * 0.35);
        let kind = ['stairs', 'fountain', 'crates', 'truck'][rampKind++ % 4];
        // Entrance steps need an ordinary palazzo beside them.
        if (kind === 'stairs' && !this.plainBlock(p.x + dir.y * 14, p.y - dir.x * 14)) kind = 'crates';
        // Steps, planks and the truck stand against the kerb on the left; fountains sit mid-street.
        const off = { stairs: HALF - 2.3, crates: HALF - 1.7, truck: HALF - 1.9 }[kind];
        if (kind === 'fountain') this.addFountainJump(p.x, p.y);
        else this.addRamp(p.x + dir.y * off, p.y - dir.x * off, heading, kind);
      }
      travelled += len;
    }

    for (let k = 0; k < marks.length; k++) {
      const m = marks[k];
      const next = k + 1 < marks.length ? marks[k + 1].at : travelled;
      const g = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(6.5, 0.45, 8, 32),
        new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85 }),
      );
      ring.position.y = 5;
      g.add(ring);
      g.position.set(m.pos.x, 0, m.pos.y);
      g.rotation.y = m.heading;
      g.visible = false;
      this.scene.add(g);
      this.checkpoints.push({ pos: new THREE.Vector3(m.pos.x, 0, m.pos.y), mesh: g, ring, time: secs(next - m.at) });
    }
    this.startTime = secs(marks.length ? marks[0].at : travelled);
    this.routeLength = travelled;

    const end = pts[pts.length - 1];
    this.customerPos.set(end.x, 0, end.y);
    this.customerBeam.position.x = end.x;
    this.customerBeam.position.z = end.y;
  }
}

// --- Loose road-works pieces. Each mesh is centred on its middle so it tumbles about it.
// half: resting height of the centre; lie: centre height when knocked over; r: hit radius.

function stripes(a, b, n = 8) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 8;
  const g = c.getContext('2d');
  for (let k = 0; k < n; k++) { g.fillStyle = k % 2 ? b : a; g.fillRect(k * 64 / n, 0, 64 / n, 8); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let stripeTex;

function barrier(lamp) {
  stripeTex ??= stripes('#d42a1e', '#ffffff');
  const g = new THREE.Group();
  for (const y of [0.3, -0.05]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(2, 0.22, 0.06), mat(0xffffff, { map: stripeTex }));
    bar.position.y = y;
    g.add(bar);
  }
  for (const sx of [-0.85, 0.85]) {
    const leg = box(0.07, 1, 0.07, 0xd8d8d8);
    leg.position.set(sx, -0.05, 0);
    const foot = box(0.1, 0.06, 0.7, 0x333333);
    foot.position.set(sx, -0.52, 0);
    g.add(leg, foot);
  }
  if (lamp) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.14, 10),
      new THREE.MeshStandardMaterial({ color: 0xffa21a, emissive: 0xff9a10, emissiveIntensity: 2.5 }));
    l.position.set(0.85, 0.52, 0);
    g.add(l);
  }
  return { mesh: g, half: 0.55, lie: 0.12, r: 1.1, mass: 1.2 };
}

let coneMat;
function cone() {
  coneMat ??= new THREE.MeshStandardMaterial({ map: stripes('#ff6a13', '#f4f4f4', 4), roughness: 0.6 });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 12, 1, true), coneMat);
  body.material.map.rotation = Math.PI / 2;
  body.position.y = 0.04;
  const base = box(0.46, 0.06, 0.46, 0x222222);
  base.position.y = -0.33;
  g.add(body, base);
  return { mesh: g, half: 0.36, lie: 0.2, r: 0.35, mass: 0.6 };
}

function cobble() {
  const g = new THREE.Group();
  g.add(box(0.4, 0.2, 0.4, 0x3a3936));
  return { mesh: g, half: 0.1, lie: 0.1, r: 0.3, mass: 0.9 };
}

function sign() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 112;
  const cg = c.getContext('2d');
  cg.fillStyle = '#ffffff';
  cg.beginPath(); cg.moveTo(64, 4); cg.lineTo(124, 108); cg.lineTo(4, 108); cg.fill();
  cg.strokeStyle = '#d42a1e'; cg.lineWidth = 12; cg.lineJoin = 'round';
  cg.beginPath(); cg.moveTo(64, 12); cg.lineTo(116, 102); cg.lineTo(12, 102); cg.closePath(); cg.stroke();
  // A digging worker, the European road-works pictogram.
  cg.fillStyle = '#111';
  cg.beginPath(); cg.arc(58, 50, 6, 0, Math.PI * 2); cg.fill();
  cg.lineWidth = 6; cg.lineCap = 'round'; cg.strokeStyle = '#111';
  cg.beginPath(); cg.moveTo(60, 58); cg.lineTo(68, 76); cg.lineTo(58, 92); cg.moveTo(68, 76); cg.lineTo(78, 92); cg.moveTo(62, 62); cg.lineTo(46, 74); cg.stroke();
  cg.lineWidth = 3;
  cg.beginPath(); cg.moveTo(40, 66); cg.lineTo(50, 92); cg.stroke();
  cg.fillRect(76, 82, 22, 10);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.875), new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
  plate.position.y = 0.4;
  const pole = box(0.06, 1.6, 0.06, 0x888888);
  pole.position.set(0, -0.05, -0.04);
  const foot = box(0.6, 0.08, 0.6, 0x333333);
  foot.position.y = -0.82;
  g.add(plate, pole, foot);
  return { mesh: g, half: 0.86, lie: 0.15, r: 0.45, mass: 0.8 };
}
