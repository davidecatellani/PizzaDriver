import * as THREE from 'three';
import { CELL, STREET, GRID } from './config.js';
import { makeObject, hasModel } from './assets.js';
import { rigModel } from './rig.js';

// Life on the pavements: a crowd of walkers (instanced low-poly people, one draw call per body
// part), grannies from the Meshy model with a procedural walk, traffic cops at the crossroads and
// street cats. Walkers loop round their block and sometimes cross the street on the zebra
// crossing; anyone a rider comes at jumps out of the way.

const HALF = STREET / 2;
const IN = 1.1;   // walking line, metres in from the kerb
const palazzo = (bi, bj) => bi >= 2 && bi <= 3 && bj >= 2 && bj <= 3;

const SHIRTS = [0xd94b3d, 0x3b6fb6, 0xf2f2f2, 0x2f8f5b, 0xf2b134, 0x7a4ea3, 0x222222, 0xe38bb0, 0x5fb7e5, 0xa0522d];
const PANTS = [0x2b3a67, 0x222222, 0x6b5d4f, 0x3d3d45, 0xc9b38f, 0x1f4f7a];
const SKIN = [0xf1c9a5, 0xe0ac7e, 0xc68a5e, 0x8d5a3b, 0xf6d7bd];
const HAIR = [0x2a1d14, 0x4a3020, 0x111111, 0x9a6a3a, 0xcfcfcf, 0xe0c080];

function blockRect(bi, bj) {
  return {
    minX: bi * CELL + HALF + IN, maxX: (bi + 1) * CELL - HALF - IN,
    minZ: bj * CELL + HALF + IN, maxZ: (bj + 1) * CELL - HALF - IN,
  };
}

// A point on a block's walking loop, and the direction of travel there.
function onLoop(r, s, dir) {
  const w = r.maxX - r.minX, d = r.maxZ - r.minZ, P = 2 * (w + d);
  s = ((s % P) + P) % P;
  let x, z, hx, hz;
  if (s < w) { x = r.minX + s; z = r.minZ; hx = 1; hz = 0; }
  else if (s < w + d) { x = r.maxX; z = r.minZ + s - w; hx = 0; hz = 1; }
  else if (s < 2 * w + d) { x = r.maxX - (s - w - d); z = r.maxZ; hx = -1; hz = 0; }
  else { x = r.minX; z = r.maxZ - (s - 2 * w - d); hx = 0; hz = -1; }
  return { x, z, yaw: Math.atan2(hx * dir, hz * dir) };
}

// Loop parameter of a block corner (cx, cz in {0, 1}).
function cornerS(r, cx, cz) {
  const w = r.maxX - r.minX, d = r.maxZ - r.minZ;
  if (!cx && !cz) return 0;
  if (cx && !cz) return w;
  if (cx && cz) return w + d;
  return 2 * w + d;
}

class Walker {
  constructor(rnd, speed) {
    do { this.bi = Math.floor(rnd() * GRID); this.bj = Math.floor(rnd() * GRID); } while (palazzo(this.bi, this.bj));
    this.rect = blockRect(this.bi, this.bj);
    this.s = rnd() * 150;
    this.dir = rnd() < 0.5 ? 1 : -1;
    this.speed = speed;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.cross = null;          // { from, to, t } while crossing a street
    this.dodge = new THREE.Vector2();
    this.dodgeT = 0;
    this.pause = 0;
    this.walker = true;
    this.lastCorner = -1;
    this.place();
  }

  place() {
    const p = onLoop(this.rect, this.s, this.dir);
    this.pos.set(p.x, 0.3, p.z);
    this.yaw = p.yaw;
  }

  update(dt, rnd) {
    if (this.dodgeT > 0) {
      this.dodgeT -= dt;
      this.pos.x += this.dodge.x * dt;
      this.pos.z += this.dodge.y * dt;
      if (this.dodgeT <= 0 && !this.cross) this.snapToLoop();
      return 0;
    }
    if (this.pause > 0) { this.pause -= dt; return 0; }

    if (this.cross) {
      const c = this.cross;
      c.t += (this.speed * 1.3 * dt) / c.len;
      if (c.t >= 1) {
        this.cross = null;
        this.bi = c.bi; this.bj = c.bj;
        this.rect = blockRect(this.bi, this.bj);
        this.s = cornerS(this.rect, c.cx, c.cz);
        this.place();
        return this.speed;
      }
      this.pos.set(THREE.MathUtils.lerp(c.from.x, c.to.x, c.t), c.t > 0.08 && c.t < 0.92 ? 0 : 0.3, THREE.MathUtils.lerp(c.from.z, c.to.z, c.t));
      this.yaw = Math.atan2(c.to.x - c.from.x, c.to.z - c.from.z);
      return this.speed * 1.3;
    }

    this.s += this.speed * this.dir * dt;
    this.place();
    // At a corner: sometimes stop for a chat, sometimes cross to the next block.
    const r = this.rect;
    for (const [cx, cz] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const x = cx ? r.maxX : r.minX, z = cz ? r.maxZ : r.minZ;
      const id = cx + cz * 2;
      if (Math.hypot(this.pos.x - x, this.pos.z - z) > 0.3) { if (this.lastCorner === id) this.lastCorner = -1; continue; }
      if (this.lastCorner === id) break;
      this.lastCorner = id;
      const roll = rnd();
      if (roll < 0.15) this.pause = 1 + rnd() * 3;
      else if (roll < 0.5) this.startCross(cx, cz, rnd() < 0.5, x, z);
      break;
    }
    return this.speed;
  }

  startCross(cx, cz, alongX, x, z) {
    const bi = this.bi + (alongX ? (cx ? 1 : -1) : 0);
    const bj = this.bj + (alongX ? 0 : (cz ? 1 : -1));
    if (bi < 0 || bj < 0 || bi >= GRID || bj >= GRID || palazzo(bi, bj)) return;
    const n = blockRect(bi, bj);
    const ncx = alongX ? 1 - cx : cx, ncz = alongX ? cz : 1 - cz;
    const to = new THREE.Vector3(ncx ? n.maxX : n.minX, 0, ncz ? n.maxZ : n.minZ);
    const from = new THREE.Vector3(x, 0, z);
    this.cross = { from, to, t: 0, len: from.distanceTo(to), bi, bj, cx: ncx, cz: ncz };
    this.lastCorner = -1;
  }

  snapToLoop() {
    // Back to the nearest point of the block loop after a dodge.
    const r = this.rect;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, r.minX, r.maxX);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, r.minZ, r.maxZ);
    const w = r.maxX - r.minX, d = r.maxZ - r.minZ;
    const dl = [this.pos.z - r.minZ, r.maxX - this.pos.x, r.maxZ - this.pos.z, this.pos.x - r.minX];
    const side = dl.indexOf(Math.min(...dl));
    this.s = [this.pos.x - r.minX, w + this.pos.z - r.minZ, w + d + r.maxX - this.pos.x, 2 * w + d + r.maxZ - this.pos.z][side];
    this.place();
  }
}

export class People {
  // `locals`: the city's own characters (Napoli's nonne and traffic cops), when it has them.
  constructor(scene, locals = {}, count = 200) {
    let seed = 4242;
    this.rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const rnd = this.rnd;
    this.walkers = [];
    this.scene = scene;

    // Crowd: instanced body parts.
    const part = (geo, colors) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), count);
      m.castShadow = true;
      m.frustumCulled = false;
      for (let i = 0; i < count; i++) m.setColorAt(i, new THREE.Color(colors(i)));
      scene.add(m);
      return m;
    };
    const look = Array.from({ length: count }, () => ({
      shirt: SHIRTS[Math.floor(rnd() * SHIRTS.length)], pants: PANTS[Math.floor(rnd() * PANTS.length)],
      skin: SKIN[Math.floor(rnd() * SKIN.length)], hair: HAIR[Math.floor(rnd() * HAIR.length)],
      scale: 0.9 + rnd() * 0.2,
    }));
    this.look = look;
    this.parts = {
      torso: part(new THREE.CapsuleGeometry(0.2, 0.38, 3, 8).scale(1.1, 1, 0.7), (i) => look[i].shirt),
      head: part(new THREE.SphereGeometry(0.13, 8, 6), (i) => look[i].skin),
      hair: part(new THREE.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), (i) => look[i].hair),
      legL: part(new THREE.CapsuleGeometry(0.085, 0.66, 3, 6).translate(0, -0.42, 0), (i) => look[i].pants),
      legR: part(new THREE.CapsuleGeometry(0.085, 0.66, 3, 6).translate(0, -0.42, 0), (i) => look[i].pants),
      armL: part(new THREE.CapsuleGeometry(0.06, 0.5, 3, 6).translate(0, -0.3, 0), (i) => look[i].shirt),
      armR: part(new THREE.CapsuleGeometry(0.06, 0.5, 3, 6).translate(0, -0.3, 0), (i) => look[i].shirt),
    };
    for (let i = 0; i < count; i++) {
      const w = new Walker(rnd, 1.1 + rnd() * 0.6);
      w.phase = rnd() * 6;
      w.crowd = i;
      this.walkers.push(w);
    }

    // Grannies: the Meshy model with a procedural walk.
    if (locals.nonna && hasModel('nonna')) {
      for (let i = 0; i < 12; i++) {
        const body = makeObject('nonna', 1.6, () => null);
        const rig = rigModel(body);
        if (!rig) break;
        const g = new THREE.Group();
        g.add(body);
        scene.add(g);
        const w = new Walker(rnd, 0.8 + rnd() * 0.2);
        Object.assign(w, { mesh: g, rig });
        this.walkers.push(w);
      }
    }

    // Traffic cops at a few crossroads and cats on the pavements.
    this.statics = [];
    this.cats = [];
    if (locals.cops && hasModel('traffic_cop')) {
      for (const [i, j] of [[1, 1], [5, 5], [8, 2], [2, 8], [6, 9]]) {
        const cop = makeObject('traffic_cop', 1.85, () => null);
        const x = i * CELL + HALF + 1.4, z = j * CELL + HALF + 1.4;
        cop.position.set(x, 0.3, z);
        cop.rotation.y = -Math.PI * 0.75;
        scene.add(cop);
        this.statics.push({ mesh: cop, x, z, t: rnd() * 6 });
      }
    }
    if (hasModel('cat')) {
      for (let i = 0; i < 10; i++) {
        const cat = makeObject('cat', 0.55, () => null);
        let bi, bj;
        do { bi = Math.floor(rnd() * GRID); bj = Math.floor(rnd() * GRID); } while (palazzo(bi, bj));
        const r = blockRect(bi, bj);
        const home = new THREE.Vector3(r.minX + rnd() * (r.maxX - r.minX), 0.3, rnd() < 0.5 ? r.minZ - 0.3 : r.maxZ + 0.3);
        cat.position.copy(home);
        cat.rotation.y = rnd() * 6;
        scene.add(cat);
        this.cats.push({ mesh: cat, home, run: 0, v: new THREE.Vector2() });
      }
    }
  }

  // Walkers currently on the road, for the traffic to stop for.
  crossing() {
    return this.walkers.filter((w) => w.cross && w.cross.t > 0.05 && w.cross.t < 0.95);
  }

  // `riders`: [{pos, speed}]; returns the walkers the first rider (the player) ran into this frame.
  update(dt, riders) {
    const rnd = this.rnd;
    const m4 = new THREE.Matrix4(), base = new THREE.Matrix4(), local = new THREE.Matrix4();
    const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    const P = this.parts;
    const bumped = [];

    for (const w of this.walkers) {
      // Jump out of the way of fast riders heading at us.
      if (w.dodgeT <= 0) {
        for (let k = 0; k < riders.length; k++) {
          const r = riders[k];
          const dx = w.pos.x - r.pos.x, dz = w.pos.z - r.pos.z, d = Math.hypot(dx, dz);
          if (d < 4.5 && r.speed > 6 && Math.abs(r.pos.y - w.pos.y) < 1.5) {
            // Away from the rider's line of travel.
            const fx = Math.sin(r.heading), fz = Math.cos(r.heading);
            const side = dx * fz - dz * fx >= 0 ? 1 : -1;
            w.dodge.set(fz * side * 6, -fx * side * 6);
            w.dodgeT = 0.45;
            if (k === 0) bumped.push({ walker: w, close: d < 1.3 });
            break;
          }
        }
      }
      const speed = w.update(dt, rnd);
      const panic = w.dodgeT > 0 ? 1 : 0;
      w.phase += dt * speed * 3.4;
      const sw = Math.sin(w.phase) * Math.min(1, speed / 1.2);

      if (w.rig) {
        w.mesh.position.copy(w.pos);
        w.mesh.rotation.y = w.yaw;
        w.rig.walk(dt, speed, panic);
        continue;
      }
      const i = w.crowd, s = this.look[i].scale;
      const bob = Math.abs(Math.cos(w.phase)) * 0.04 * Math.min(1, speed);
      base.compose(v.set(w.pos.x, w.pos.y + bob + (panic ? 0.15 : 0), w.pos.z), q.setFromEuler(e.set(0, w.yaw, 0)), one.set(s, s, s));
      const put = (mesh, x, y, z, rx = 0, rz = 0) => {
        local.compose(v.set(x, y, z), q.setFromEuler(e.set(rx, 0, rz)), one.set(1, 1, 1));
        mesh.setMatrixAt(i, m4.multiplyMatrices(base, local));
      };
      put(P.legL, 0.1, 0.92, 0, -sw * 0.5);
      put(P.legR, -0.1, 0.92, 0, sw * 0.5);
      put(P.torso, 0, 1.22, 0, 0.04);
      put(P.head, 0, 1.6, 0);
      put(P.hair, 0, 1.63, -0.02, -0.25);
      const up = panic ? Math.PI * 0.85 : 0;
      put(P.armL, 0.27, 1.42, 0, sw * 0.5 - up * 0.1, 0.08 + up);
      put(P.armR, -0.27, 1.42, 0, -sw * 0.5 - up * 0.1, -0.08 - up);
    }
    for (const mesh of Object.values(P)) mesh.instanceMatrix.needsUpdate = true;

    // Cops sway and turn their heads; cats bolt when a rider comes close, then settle again.
    for (const c of this.statics) {
      c.t += dt;
      c.mesh.rotation.z = Math.sin(c.t * 1.3) * 0.015;
    }
    const p = riders[0];
    for (const c of this.cats) {
      if (c.run > 0) {
        c.run -= dt;
        c.mesh.position.x += c.v.x * dt;
        c.mesh.position.z += c.v.y * dt;
        c.mesh.position.y = 0.3 + Math.abs(Math.sin(c.run * 18)) * 0.25;
        if (c.run <= 0) { c.mesh.position.y = 0.3; c.back = 4; }
      } else if (p && c.mesh.position.distanceTo(p.pos) < 7 && p.speed > 4) {
        const d = new THREE.Vector2(c.mesh.position.x - p.pos.x, c.mesh.position.z - p.pos.z).normalize();
        c.v.copy(d).multiplyScalar(8);
        c.mesh.rotation.y = Math.atan2(d.x, d.y);
        c.run = 0.8;
      } else if (c.back > 0) {
        // Wander back home.
        c.back -= dt;
        if (c.back <= 0) c.mesh.position.copy(c.home);
      }
    }
    return bumped;
  }
}
