import * as THREE from 'three';
import { CELL, GRID } from './config.js';
import { box, mat, makeObject } from './assets.js';

// Each lane runs the full length of one street, on the right-hand side, and wraps around.
const LANES = [
  { axis: 'x', line: 1 * CELL, dir: 1, cars: 3 },
  { axis: 'x', line: 2 * CELL, dir: -1, cars: 2 },
  { axis: 'z', line: 1 * CELL, dir: 1, cars: 2 },
  { axis: 'z', line: 5 * CELL, dir: -1, cars: 3 },
];
const KINDS = [
  { id: 'fiat_500', len: 4, w: 2, h: 1.6, color: 0xf3ead2, speed: 13 },
  { id: 'ape', len: 3.4, w: 1.6, h: 2, color: 0x8ec5e8, speed: 10 },
  { id: 'bus', len: 10, w: 3, h: 3.6, color: 0xf08a24, speed: 9 },
];
const SPAN = GRID * CELL + 40;

function carMesh(kind) {
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
  constructor(scene) {
    this.cars = [];
    let k = 0;
    for (const lane of LANES) {
      for (let i = 0; i < lane.cars; i++) {
        const kind = KINDS[k++ % KINDS.length];
        const mesh = carMesh(kind);
        scene.add(mesh);
        this.cars.push({ lane, kind, mesh, s: (i / lane.cars) * SPAN + Math.random() * 20, pos: new THREE.Vector3() });
      }
    }
    this.update(0);
  }

  update(dt) {
    for (const c of this.cars) {
      const { lane, kind } = c;
      c.s = (c.s + kind.speed * dt) % SPAN;
      const along = lane.dir > 0 ? c.s - 20 : SPAN - 20 - c.s;
      const offset = 3.5 * lane.dir;
      if (lane.axis === 'x') {
        c.pos.set(along, 0, lane.line - offset);
        c.mesh.rotation.y = lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        c.pos.set(lane.line + offset, 0, along);
        c.mesh.rotation.y = lane.dir > 0 ? 0 : Math.PI;
      }
      c.mesh.position.copy(c.pos);
    }
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
}
