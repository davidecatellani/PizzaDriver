import * as THREE from 'three';
import { CELL, PLAYER, RIVALS, RIVAL_PATH } from './config.js';
import { makeRider } from './rider.js';

const PATH = RIVAL_PATH.map(([x, z]) => new THREE.Vector2(x * CELL, z * CELL));

export class Rival {
  constructor(scene, world, def, index) {
    this.world = world;
    this.def = def;
    this.lane = -0.5 + index * 2.5;      // spread across the street, right of the player
    this.mesh = makeRider(def.color, 0x222222, `rival_${(index % 2) + 1}`);
    scene.add(this.mesh);
    this.reset();
  }

  reset() {
    this.pos = new THREE.Vector3(PATH[0].x + this.lane, 0, PATH[0].y - 4);
    this.heading = 0;
    this.speed = 0;
    this.target = 1;
    this.stun = 0;
    this.finished = false;
    this.sync();
  }

  remaining() {
    if (this.finished) return -1;
    let d = Math.hypot(PATH[this.target].x - this.pos.x, PATH[this.target].y - this.pos.z);
    for (let i = this.target; i < PATH.length - 1; i++) d += PATH[i].distanceTo(PATH[i + 1]);
    return d;
  }

  update(dt, active) {
    if (this.finished) return;
    this.stun = Math.max(0, this.stun - dt);
    const max = PLAYER.maxSpeed * this.def.speed * (this.stun > 0 ? 0.4 : 1);
    const goal = active ? max : 0;
    this.speed += THREE.MathUtils.clamp(goal - this.speed, -40 * dt, PLAYER.accel * dt);

    // Aim at the waypoint, offset into this rider's lane.
    const t = PATH[this.target];
    const prev = PATH[this.target - 1];
    const dir = new THREE.Vector2(t.x - prev.x, t.y - prev.y).normalize();
    const side = new THREE.Vector2(dir.y, -dir.x);
    const ax = t.x + side.x * this.lane, az = t.y + side.y * this.lane;
    const want = Math.atan2(ax - this.pos.x, az - this.pos.z);
    let d = want - this.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.heading += THREE.MathUtils.clamp(d, -3 * dt, 3 * dt);
    // Slow down for sharp turns.
    if (Math.abs(d) > 0.6) this.speed *= 1 - 1.5 * dt;

    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    this.pos.y = this.world.groundHeight(this.pos.x, this.pos.z);

    if (Math.hypot(ax - this.pos.x, az - this.pos.z) < 5) {
      if (this.target === PATH.length - 1) this.finished = true;
      else this.target++;
    }
    this.sync();
  }

  sync() {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(0, this.heading, 0);
  }
}

export function makeRivals(scene, world) {
  return RIVALS.map((def, i) => new Rival(scene, world, def, i));
}
