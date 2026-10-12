import * as THREE from 'three';
import { CELL, GRID } from './config.js';
import { PALAZZO } from './cityKit.js';

// City traffic: lanes on every street in both directions, cars that keep their distance,
// brake for riders in front of them, honk, and get shoved when hit.
const SPAN = GRID * CELL + 40;
const LANE_OFFSET = 3.5;

function lanes() {
  const out = [];
  for (let i = 0; i <= GRID; i++) {
    for (const dir of [1, -1]) {
      // The street at z = 3 cells runs into the landmark block, where only the secret passage goes
      // through: cars drive in, vanish inside and come out the far side, so the passage stays free.
      out.push({ axis: 'x', line: i * CELL, dir, cut: i === 3 ? [PALAZZO.minX, PALAZZO.maxX] : null });
      // The street at x = 3 cells is cut by the palazzo.
      if (i !== 3) out.push({ axis: 'z', line: i * CELL, dir });
    }
  }
  return out;
}

// Each kind is modelled once (src/cars.js) and drawn as instances: one draw call per part of a
// kind, however many cars of it are on the streets.
function instanced(scene, kind, count) {
  kind.proto ??= kind.build(kind);
  kind.proto.updateMatrixWorld(true);
  const parts = [];
  kind.proto.traverse((o) => {
    if (!o.isMesh) return;
    const m = new THREE.InstancedMesh(o.geometry, o.material, count);
    m.castShadow = o.castShadow;
    m.receiveShadow = o.receiveShadow;
    m.onBeforeRender = o.onBeforeRender;   // the police light bar's flash
    m.frustumCulled = false;               // the instances are all over the city
    scene.add(m);
    parts.push({ mesh: m, local: o.matrixWorld.clone() });
  });
  return parts;
}
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0), M = new THREE.Matrix4();

export class Traffic {
  // `kinds`: the city's vehicles (src/cities/*.js); `avenue` ones (buses) keep to the main roads.
  constructor(scene, kinds, perLane = 2) {
    this.cars = [];
    let k = 0;
    for (const lane of lanes()) {
      for (let i = 0; i < perLane; i++) {
        // Buses only on the outer ring and the main avenues.
        let kind = kinds[k++ % kinds.length];
        if (kind.avenue && lane.line % (5 * CELL) !== 0) kind = kinds[0];
        const mesh = new THREE.Object3D();   // where the car is; drawn by its kind's instances
        this.cars.push({
          lane, kind, mesh, s: (i / perLane) * SPAN + Math.random() * 60, speed: kind.speed,
          pos: new THREE.Vector3(), fwd: new THREE.Vector2(), stop: 0, shove: new THREE.Vector2(), honked: 0,
          reckless: Math.random() < (kind.reckless ?? 0.3),   // honks instead of braking for riders
        });
      }
    }
    this.kinds = [...new Set(this.cars.map((c) => c.kind))].map((kind) => {
      const cars = this.cars.filter((c) => c.kind === kind);
      cars.forEach((c, i) => { c.slot = i; });
      return { cars, parts: instanced(scene, kind, cars.length) };
    });
    this.update(0, []);
  }

  // Copies every car's place into its kind's instances.
  draw() {
    for (const { cars, parts } of this.kinds) {
      for (const c of cars) {
        c.mesh.updateMatrix();
        for (const p of parts) p.mesh.setMatrixAt(c.slot, c.hidden ? HIDDEN : M.multiplyMatrices(c.mesh.matrix, p.local));
      }
      for (const p of parts) p.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // Moves every car within `r` metres of (x, z) further along its lane, out of the way.
  clearAround(x, z, r) {
    for (const c of this.cars) {
      for (let k = 0; k < 40 && Math.hypot(c.pos.x - x, c.pos.z - z) < r; k++) {
        c.s = (c.s + 10) % SPAN;
        this.place(c);
      }
    }
  }

  // Empties the street the race starts on: no car in the strip `ahead` metres in front of (x, z)
  // along `heading` (and a little behind), so nothing drives at the riders as they set off.
  clearStreet(x, z, heading, ahead = 180, behind = 30, half = 8) {
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const inside = (c) => {
      const dx = c.pos.x - x, dz = c.pos.z - z;
      const along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
      return along > -behind && along < ahead && side < half;
    };
    for (const c of this.cars) {
      for (let k = 0; k < 60 && inside(c); k++) {
        c.s = (c.s + 10) % SPAN;
        this.place(c);
      }
    }
  }

  // `riders`: things the cars should not run over ({pos}).
  // While `calm` > 0 (the start of a race) even reckless drivers brake for riders.
  update(dt, riders) {
    this.calm = Math.max(0, (this.calm || 0) - dt);
    for (const c of this.cars) {
      const { lane, kind } = c;
      c.fwd.set(lane.axis === 'x' ? lane.dir : 0, lane.axis === 'z' ? lane.dir : 0);
      // Look ahead: brake for anything in a box in front of the car.
      const ahead = kind.len / 2 + 7;
      let blocked = c.stop > 0;
      const check = (x, z, half) => {
        const dx = x - c.pos.x, dz = z - c.pos.z;
        const along = dx * c.fwd.x + dz * c.fwd.y;
        const side = Math.abs(dx * c.fwd.y - dz * c.fwd.x);
        return along > 0 && along < ahead + half && side < kind.w / 2 + half + 0.4;
      };
      if (!blocked) {
        // Same-lane queues, and cars on z streets give way to cross traffic (never both ways, so no deadlock).
        for (const o of this.cars) {
          if (o === c || (o.lane !== c.lane && (c.lane.axis === 'x' || o.lane.axis === 'z'))) continue;
          if (check(o.pos.x, o.pos.z, o.kind.len / 2 * 0.8)) { blocked = true; break; }
        }
      }
      let honk = false;
      if (!blocked) {
        for (const r of riders) {
          if (check(r.pos.x, r.pos.z, 0.8)) {
            honk = true;
            if (!c.reckless || r.walker || this.calm > 0) { blocked = true; break; }
          }
        }
      }
      c.stop = Math.max(0, c.stop - dt);
      c.honked = Math.max(0, c.honked - dt);
      if (honk && c.honked === 0 && dt > 0) { c.honked = 4; this.onHonk?.(c); }
      const want = blocked ? 0 : kind.speed;
      c.speed += THREE.MathUtils.clamp(want - c.speed, -30 * dt, 6 * dt);
      c.s = (c.s + c.speed * dt) % SPAN;

      c.shove.multiplyScalar(Math.exp(-3 * dt));
      this.place(c);
    }
    this.draw();
  }

  // Puts the car's position and mesh where its distance along the lane says.
  place(c) {
    const { lane } = c;
    const along = lane.dir > 0 ? c.s - 20 : SPAN - 20 - c.s;
    const offset = LANE_OFFSET * lane.dir;
    if (lane.axis === 'x') {
      c.pos.set(along, 0, lane.line - offset);
      c.mesh.rotation.y = lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      c.pos.set(lane.line + offset, 0, along);
      c.mesh.rotation.y = lane.dir > 0 ? 0 : Math.PI;
    }
    // Inside the landmark block (see lanes()): hidden, and nothing can hit it.
    const half = c.kind.len / 2;
    c.hidden = !!lane.cut && along + half > lane.cut[0] + 1.5 && along - half < lane.cut[1] - 1.5;
    c.mesh.position.set(c.pos.x + c.shove.x, 0, c.pos.z + c.shove.y);
    c.mesh.rotation.z = c.shove.length() * 0.04;
  }

  // Returns the car the point overlaps, if any.
  hit(p, r) {
    for (const c of this.cars) {
      if (c.hidden) continue;
      const hx = (c.lane.axis === 'x' ? c.kind.len : c.kind.w) / 2 + r;
      const hz = (c.lane.axis === 'x' ? c.kind.w : c.kind.len) / 2 + r;
      if (Math.abs(p.x - c.pos.x) < hx && Math.abs(p.z - c.pos.z) < hz && p.y < c.kind.h + 0.3) return c;
    }
    return null;
  }

  // The car stops for a while and rocks from the hit.
  struck(c, fromX, fromZ) {
    c.stop = 1.5;
    c.speed = 0;
    const d = new THREE.Vector2(c.pos.x - fromX, c.pos.z - fromZ).normalize().multiplyScalar(0.6);
    c.shove.copy(d);
  }
}
