import * as THREE from 'three';
import { CELL, GRID } from './config.js';
import { box, mat, makeObject } from './assets.js';

// City traffic: lanes on every street in both directions, cars that keep their distance,
// brake for riders in front of them, honk, and get shoved when hit.
const SPAN = GRID * CELL + 40;
const LANE_OFFSET = 3.5;

function lanes() {
  const out = [];
  for (let i = 0; i <= GRID; i++) {
    for (const dir of [1, -1]) {
      out.push({ axis: 'x', line: i * CELL, dir });
      // The street at x = 3 cells is cut by the palazzo.
      if (i !== 3) out.push({ axis: 'z', line: i * CELL, dir });
    }
  }
  return out;
}

function carMesh(kind) {
  if (kind.build) return kind.build(kind);
  return makeObject(kind.id, kind.len, () => {
    const g = new THREE.Group();
    const body = box(kind.w, kind.h * 0.6, kind.len, kind.color);
    body.position.y = kind.h * 0.3 + 0.35; g.add(body);
    const cab = box(kind.w * 0.9, kind.h * 0.4, kind.len * 0.5, kind.color);
    cab.position.set(0, kind.h * 0.8 + 0.35, -kind.len * 0.05); g.add(cab);
    const glass = box(kind.w * 0.92, kind.h * 0.25, 0.1, 0x223344);
    glass.position.set(0, kind.h * 0.82 + 0.35, kind.len * 0.21); g.add(glass);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.3, 10), mat(0x111111));
      wh.rotation.z = Math.PI / 2;
      wh.position.set(sx * kind.w * 0.5, 0.35, sz * kind.len * 0.32);
      g.add(wh);
    }
    return g;
  }, { vehicle: true });
}

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
        const mesh = carMesh(kind);
        scene.add(mesh);
        this.cars.push({
          lane, kind, mesh, s: (i / perLane) * SPAN + Math.random() * 60, speed: kind.speed,
          pos: new THREE.Vector3(), fwd: new THREE.Vector2(), stop: 0, shove: new THREE.Vector2(), honked: 0,
          reckless: Math.random() < (kind.reckless ?? 0.3),   // honks instead of braking for riders
        });
      }
    }
    this.update(0, []);
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
    c.mesh.position.set(c.pos.x + c.shove.x, 0, c.pos.z + c.shove.y);
    c.mesh.rotation.z = c.shove.length() * 0.04;
  }

  // Returns the car the point overlaps, if any.
  hit(p, r) {
    for (const c of this.cars) {
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
