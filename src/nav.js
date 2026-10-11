import * as THREE from 'three';
import { CELL } from './config.js';

const CHEVRONS = 26;          // arrows painted on the road ahead
const SPACING = 6;            // metres between arrows
const TURN_WARNING = 45;      // metres before a corner to show the turn sign

// Follows the player along the delivery's street route: paints arrows on the road ahead,
// and reports the next turn and the remaining distance.
export class Nav {
  constructor(scene) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 1.6);
    shape.lineTo(1.6, -0.2);
    shape.lineTo(1.0, -0.8);
    shape.lineTo(0, 0.3);
    shape.lineTo(-1.0, -0.8);
    shape.lineTo(-1.6, -0.2);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);   // lie flat, tip pointing to -z
    geo.rotateY(Math.PI);        // tip to +z (forward at heading 0)
    this.chevrons = new THREE.InstancedMesh(
      geo,
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.8, depthWrite: false }),
      CHEVRONS,
    );
    this.chevrons.frustumCulled = false;
    this.chevrons.renderOrder = 1;
    scene.add(this.chevrons);
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.up = new THREE.Vector3(0, 1, 0);
  }

  setPath(points) {
    this.path = points.map(([x, z]) => new THREE.Vector2(x * CELL, z * CELL));
    this.seg = 0;
    this.t = 0;
    this.lengths = [];
    for (let i = 0; i < this.path.length - 1; i++) this.lengths.push(this.path[i].distanceTo(this.path[i + 1]));
  }

  // Projects the player onto the route, searching a few segments ahead so progress only moves forward.
  update(pos, visible) {
    const P = new THREE.Vector2(pos.x, pos.z);
    let best = Infinity;
    for (let i = Math.max(0, this.seg - 1); i < Math.min(this.path.length - 1, this.seg + 4); i++) {
      const a = this.path[i], b = this.path[i + 1];
      const ab = b.clone().sub(a);
      const t = THREE.MathUtils.clamp(P.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
      const d = a.clone().addScaledVector(ab, t).distanceTo(P);
      if (d < best - 0.01) { best = d; this.seg = i; this.t = t; }
    }
    this.place(visible);
  }

  // Point `dist` metres further along the route from the player's projection.
  pointAhead(dist) {
    let i = this.seg, along = this.t * this.lengths[i] + dist;
    while (i < this.lengths.length - 1 && along > this.lengths[i]) { along -= this.lengths[i]; i++; }
    const a = this.path[i], b = this.path[i + 1];
    const f = Math.min(1, along / this.lengths[i]);
    return { x: a.x + (b.x - a.x) * f, z: a.y + (b.y - a.y) * f, dir: Math.atan2(b.x - a.x, b.y - a.y), seg: i };
  }

  place(visible) {
    this.chevrons.visible = visible;
    if (!visible) return;
    const off = SPACING - ((this.t * this.lengths[this.seg]) % SPACING);
    for (let k = 0; k < CHEVRONS; k++) {
      const p = this.pointAhead(8 + off + k * SPACING);
      this.q.setFromAxisAngle(this.up, p.dir);
      const s = k === CHEVRONS - 1 ? 0 : 1;
      this.m4.compose(new THREE.Vector3(p.x, 0.05, p.z), this.q, new THREE.Vector3(s, s, s));
      this.chevrons.setMatrixAt(k, this.m4);
    }
    this.chevrons.instanceMatrix.needsUpdate = true;
  }

  // Next corner within warning distance: { side: 'left' | 'right', dist } or null.
  nextTurn() {
    const i = this.seg;
    if (i + 2 >= this.path.length) return null;
    const dist = (1 - this.t) * this.lengths[i];
    if (dist > TURN_WARNING) return null;
    const a = this.path[i], b = this.path[i + 1], c = this.path[i + 2];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    // Heading 0 looks down +z with +x on screen-left, so a negative cross product is a left turn.
    return { side: cross < 0 ? 'left' : 'right', dist };
  }

  remaining() {
    let d = (1 - this.t) * this.lengths[this.seg];
    for (let i = this.seg + 1; i < this.lengths.length; i++) d += this.lengths[i];
    return d;
  }
}
