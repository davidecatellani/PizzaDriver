import * as THREE from 'three';
import { CELL, STREET, GRID } from './config.js';
import { box, mat, makeObject } from './assets.js';

const HALF = STREET / 2;
const PALETTE = [0xf2c14e, 0xf4a6a0, 0xe07a4f, 0xf6e7c8, 0xf0b67f, 0xd9d0a5, 0xc9e4de];

// Palazzo covering blocks (2..3, 2..3); the tunnel runs through it along z = 3*CELL.
const PALAZZO = { minX: 2 * CELL + HALF, maxX: 4 * CELL - HALF, minZ: 2 * CELL + HALF, maxZ: 4 * CELL - HALF };
const TUNNEL_HALF = 3.6;
export const TUNNEL = { minX: PALAZZO.minX, maxX: PALAZZO.maxX, minZ: 3 * CELL - TUNNEL_HALF, maxZ: 3 * CELL + TUNNEL_HALF };

function windowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#3d6b4f';          // green shutters
  g.fillRect(14, 12, 8, 26);
  g.fillRect(42, 12, 8, 26);
  g.fillStyle = '#4a3a33';          // window
  g.fillRect(22, 12, 20, 26);
  g.fillStyle = '#b9b1a6';          // balcony ledge
  g.fillRect(18, 38, 28, 4);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Scales the box UVs so windows repeat every ~6 units; roof and floor get a plain texel.
function facadeUVs(geo, w, h, d) {
  const uv = geo.attributes.uv;
  const faces = [[d, h], [d, h], [0, 0], [0, 0], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = faces[f];
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      if (su === 0) uv.setXY(k, 0.02, 0.02);
      else uv.setXY(k, uv.getX(k) * Math.max(1, Math.round(su / 6)), uv.getY(k) * Math.max(1, Math.round((sv - 3) / 5)));
    }
  }
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.ramps = [];
    this.windowTex = windowTexture();
    this.buildGround();
    this.buildCity();
    this.buildPalazzo();
    this.buildRamps();
    this.buildLandmarks();
    this.checkpoints = [];
  }

  addCollider(minX, maxX, minZ, maxZ) {
    this.colliders.push({ minX, maxX, minZ, maxZ });
  }

  building(x, z, w, d, h, color) {
    const geo = new THREE.BoxGeometry(w, h, d);
    facadeUVs(geo, w, h, d);
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, map: this.windowTex }));
    m.position.set(x, h / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    this.scene.add(m);
    this.addCollider(x - w / 2, x + w / 2, z - d / 2, z + d / 2);
    return m;
  }

  buildGround() {
    const size = (GRID + 4) * CELL;
    const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat(0x55565c));
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
    const s = box(maxX - minX, 0.3, maxZ - minZ, 0xcfc6b8);
    s.position.set((minX + maxX) / 2, 0.15, (minZ + maxZ) / 2);
    s.castShadow = false;
    this.scene.add(s);
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
        this.sidewalk(minX, maxX, minZ, maxZ);
        const inner = { minX: minX + 2, maxX: maxX - 2, minZ: minZ + 2, maxZ: maxZ - 2 };

        if (!outer && bi === 1 && bj === 4) { this.piazza(inner); continue; }
        if (!outer && bi === 0 && bj === 1) { this.market(inner); continue; }
        if (!outer && bi === 0 && bj === 0) { this.pizzeria(inner); continue; }

        // 2x2 buildings per block, random heights.
        const w = (inner.maxX - inner.minX) / 2, d = (inner.maxZ - inner.minZ) / 2;
        for (let a = 0; a < 2; a++) {
          for (let b = 0; b < 2; b++) {
            const h = outer ? 24 + rnd() * 10 : 9 + rnd() * 13;
            const col = PALETTE[Math.floor(rnd() * PALETTE.length)];
            this.building(inner.minX + w * (a + 0.5), inner.minZ + d * (b + 0.5), w - 0.6, d - 0.6, h, col);
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
    this.curtains = [];
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

  // Ramps: position, heading (0 = +z), length, width, height.
  addRamp(x, z, heading, L = 9, w = 6, h = 2.4, color = 0x9c6b3c) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(L, 0);
    shape.lineTo(L, h);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
    geo.translate(0, 0, -w / 2);
    const m = new THREE.Mesh(geo, mat(color));
    m.position.set(x, 0, z);
    m.rotation.y = heading - Math.PI / 2;
    m.castShadow = true;
    m.receiveShadow = true;
    this.scene.add(m);
    this.ramps.push({ x, z, sin: Math.sin(heading), cos: Math.cos(heading), L, w, h });
  }

  buildRamps() {
    this.addRamp(0, 1.3 * CELL, 0);                       // first street: teaches the jump
    this.addRamp(0.9 * CELL, 3 * CELL + 3.5, Math.PI / 2, 9, 5);
    this.addRamp(4 * CELL + 3.5, 4.3 * CELL, 0, 9, 5);
    this.addRamp(4.8 * CELL, 5 * CELL, Math.PI / 2, 10, 7, 3);
  }

  groundHeight(x, z) {
    let y = 0;
    for (const r of this.ramps) {
      const dx = x - r.x, dz = z - r.z;
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

  // Builds the checkpoint rings and customer marker for one delivery.
  setRoute(delivery) {
    for (const c of this.checkpoints) this.scene.remove(c.mesh);
    this.checkpoints = [];
    for (const [x, z] of delivery.checkpoints) {
      // Face the ring along the street segment it sits on.
      let heading = 0;
      const path = delivery.path;
      for (let i = 0; i < path.length - 1; i++) {
        const [ax, az] = path[i], [bx, bz] = path[i + 1];
        const onX = ax === bx && x === ax && z >= Math.min(az, bz) && z <= Math.max(az, bz);
        const onZ = az === bz && z === az && x >= Math.min(ax, bx) && x <= Math.max(ax, bx);
        if (onX || onZ) { heading = Math.atan2(bx - ax, bz - az); break; }
      }
      const g = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(6.5, 0.45, 8, 32),
        new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85 }),
      );
      ring.position.y = 5;
      g.add(ring);
      g.position.set(x * CELL, 0, z * CELL);
      g.rotation.y = heading;
      g.visible = false;
      this.scene.add(g);
      this.checkpoints.push({ pos: new THREE.Vector3(x * CELL, 0, z * CELL), mesh: g, ring });
    }
    const [cx, cz] = delivery.customer;
    this.customerPos.set(cx * CELL, 0, cz * CELL);
    this.customerBeam.position.x = cx * CELL;
    this.customerBeam.position.z = cz * CELL;
  }
}
