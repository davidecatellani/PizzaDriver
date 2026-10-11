import * as THREE from 'three';
import { CELL, PLAYER, RIVALS } from './config.js';
import { makeRider } from './rider.js';

export class Rival {
  constructor(scene, world, def, index) {
    this.world = world;
    this.def = def;
    this.lane = -0.5 + index * 2.5;      // spread across the street, right of the player
    this.mesh = makeRider(def.color, 0x222222, `rival_${(index % 2) + 1}`);
    scene.add(this.mesh);
  }

  reset(path) {
    this.path = path.map(([x, z]) => new THREE.Vector2(x * CELL, z * CELL));
    const [p0, p1] = this.path;
    const dir = p1.clone().sub(p0).normalize();
    this.pos = new THREE.Vector3(p0.x - dir.x * 4 + dir.y * this.lane, 0, p0.y - dir.y * 4 - dir.x * this.lane);
    this.heading = Math.atan2(dir.x, dir.y);
    this.speed = 0;
    this.target = 1;
    this.stun = 0;
    this.knock = new THREE.Vector2();
    this.spin = 0;
    this.curLane = this.lane;
    this.bumpCd = 0;
    this.kick = null;
    this.kickCd = 1 + Math.random() * 2;
    this.finished = false;
    this.sync();
  }

  remaining() {
    if (this.finished) return -1;
    let d = Math.hypot(this.path[this.target].x - this.pos.x, this.path[this.target].y - this.pos.z);
    for (let i = this.target; i < this.path.length - 1; i++) d += this.path[i].distanceTo(this.path[i + 1]);
    return d;
  }

  // Side kick at a neighbour: side 1 = left, -1 = right. Lasts 0.4 s.
  startKick(side) {
    if (this.kick || this.kickCd > 0) return false;
    this.kick = { side, t: 0, hit: false };
    return true;
  }

  tickKick(dt) {
    this.kickCd = Math.max(0, this.kickCd - dt);
    if (!this.kick) return;
    this.kick.t += dt / 0.4;
    if (this.kick.t >= 1) { this.kick = null; this.kickCd = Math.max(this.kickCd, 0.35); }
  }

  // Shoved away from (fromX, fromZ): knocked sideways, spun and stunned.
  hitBy(fromX, fromZ, power, stun) {
    const d = new THREE.Vector2(this.pos.x - fromX, this.pos.z - fromZ);
    if (d.lengthSq() < 1e-4) d.set(1, 0);
    d.normalize();
    this.knock.addScaledVector(d, power);
    this.spin += (Math.random() < 0.5 ? -1 : 1) * power * 0.2;
    this.stun = Math.max(this.stun, stun);
    this.speed *= 0.4;
  }

  update(dt, active, player) {
    this.mesh.userData.rig?.update(dt, {
      speed: Math.min(1, this.speed / PLAYER.maxSpeed), steer: this.finished ? 0 : this.steer || 0, air: false, airTime: 0,
      drift: false, boost: false, crash: this.stun > 0.3, cheer: this.finished, kick: active && this.speed > 0.5 && this.speed < 9,
      attack: this.kick,
    });
    this.tickKick(dt);
    if (this.finished) return;
    this.stun = Math.max(0, this.stun - dt);
    const max = PLAYER.maxSpeed * this.def.speed * (this.stun > 0 ? 0.4 : 1);
    const goal = active ? max : 0;
    this.speed += THREE.MathUtils.clamp(goal - this.speed, -40 * dt, PLAYER.accel * dt);

    // Aim at the waypoint, offset into this rider's lane.
    const t = this.path[this.target];
    const prev = this.path[this.target - 1];
    const dir = new THREE.Vector2(t.x - prev.x, t.y - prev.y).normalize();
    const side = new THREE.Vector2(dir.y, -dir.x);
    // Aggressive riders swerve into the player when riding alongside.
    let wantLane = this.lane;
    if (player && active && this.stun === 0) {
      const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
      const along = dx * dir.x + dz * dir.y;
      if (Math.abs(along) < 7 && Math.hypot(dx, dz) < 10) {
        const playerLane = (player.pos.x - prev.x) * side.x + (player.pos.z - prev.y) * side.y;
        wantLane = THREE.MathUtils.lerp(this.lane, playerLane, this.def.aggression ?? 0.5);
      }
    }
    this.curLane += THREE.MathUtils.clamp(wantLane - this.curLane, -4 * dt, 4 * dt);
    const ax = t.x + side.x * this.curLane, az = t.y + side.y * this.curLane;
    const want = Math.atan2(ax - this.pos.x, az - this.pos.z);
    let d = want - this.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const turn = THREE.MathUtils.clamp(d, -3 * dt, 3 * dt);
    this.heading += turn;
    this.steer = THREE.MathUtils.clamp(turn / (3 * dt), -1, 1);
    // Slow down for sharp turns.
    if (Math.abs(d) > 0.6) this.speed *= 1 - 1.5 * dt;

    this.heading += this.spin * dt;
    this.spin *= Math.exp(-4 * dt);
    this.bumpCd = Math.max(0, this.bumpCd - dt);
    this.pos.x += Math.sin(this.heading) * this.speed * dt + this.knock.x * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt + this.knock.y * dt;
    this.knock.multiplyScalar(Math.exp(-5 * dt));
    this.collide();
    this.pos.y = this.world.groundHeight(this.pos.x, this.pos.z);

    if (Math.hypot(ax - this.pos.x, az - this.pos.z) < 5) {
      if (this.target === this.path.length - 1) this.finished = true;
      else this.target++;
    }
    this.sync();
  }

  // Pushed out of buildings (only matters after a knock).
  collide() {
    const r = 0.8, p = this.pos;
    for (const c of this.world.colliders) {
      if (c.top !== undefined && p.y > c.top) continue;
      if (p.x + r <= c.minX || p.x - r >= c.maxX || p.z + r <= c.minZ || p.z - r >= c.maxZ) continue;
      const pushes = [[c.minX - r - p.x, 0], [c.maxX + r - p.x, 0], [0, c.minZ - r - p.z], [0, c.maxZ + r - p.z]];
      let best = pushes[0];
      for (const q of pushes) if (Math.abs(q[0] + q[1]) < Math.abs(best[0] + best[1])) best = q;
      p.x += best[0];
      p.z += best[1];
    }
  }

  sync() {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(0, this.heading, 0);
  }
}

export function makeRivals(scene, world) {
  return RIVALS.map((def, i) => new Rival(scene, world, def, i));
}
