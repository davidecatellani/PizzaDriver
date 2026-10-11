import * as THREE from 'three';
import { PLAYER, CELL, GRID, STREET } from './config.js';
import { makeRider } from './rider.js';

const LIMIT_MIN = -STREET / 2 + PLAYER.radius;
const LIMIT_MAX = GRID * CELL + STREET / 2 - PLAYER.radius;

export class Player {
  constructor(scene, world) {
    this.world = world;
    this.mesh = makeRider();
    scene.add(this.mesh);
    this.events = [];
    this.reset(0, 0, 0);
  }

  reset(x, z, heading) {
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.vy = 0;
    this.slope = 0;
    this.airborne = false;
    this.airTime = 0;
    this.boost = 0.5;
    this.boosting = false;
    this.heat = 100;           // pizza temperature: drops on crashes, affects the tip
    this.lean = 0;
    this.drift = 0;            // seconds into the current drift
    this.driftYaw = 0;         // visual slide angle
    this.sync();
  }

  emit(type, data) {
    this.events.push({ type, ...data });
  }

  update(dt, input, active) {
    const steer = active ? input.steer : 0;
    const wantBoost = active && input.boost && this.boost > 0.02;
    this.boosting = wantBoost;

    // Drift: braking while steering at speed slides the scooter round a corner instead of stopping it.
    // A drift held long enough refills some boost when it ends.
    const drifting = active && input.brake && Math.abs(steer) > 0.3 && this.speed > PLAYER.driftMinSpeed && !this.airborne;
    if (drifting) {
      this.drift += dt;
    } else if (this.drift > 0) {
      if (this.drift > PLAYER.driftBoostAfter) {
        this.boost = Math.min(1, this.boost + PLAYER.driftBoost);
        this.emit('drift', { time: this.drift });
      }
      this.drift = 0;
    }
    this.driftYaw = THREE.MathUtils.lerp(this.driftYaw, drifting ? steer * 0.5 : 0, 1 - Math.exp(-10 * dt));

    const max = PLAYER.maxSpeed * (wantBoost ? PLAYER.boostMultiplier : 1);
    if (!active) this.speed = Math.max(0, this.speed - PLAYER.brake * dt);
    else if (drifting) this.speed = Math.max(0, this.speed - PLAYER.driftDrag * dt);
    else if (input.brake) this.speed = Math.max(0, this.speed - PLAYER.brake * dt);
    else if (this.speed < max) this.speed = Math.min(max, this.speed + PLAYER.accel * (wantBoost ? 2 : 1) * dt);
    else this.speed = Math.max(max, this.speed - PLAYER.accel * 0.5 * dt);

    if (wantBoost) this.boost = Math.max(0, this.boost - PLAYER.boostDrain * dt);
    else this.boost = Math.min(1, this.boost + PLAYER.boostRecharge * dt);

    // Steering gets slightly tighter at low speed; much weaker in the air.
    const grip = this.airborne ? 0.25 : 1;
    const speedFactor = THREE.MathUtils.clamp(this.speed / 8, 0, 1) * (1.1 - 0.2 * (this.speed / (PLAYER.maxSpeed * 1.5)));
    this.heading += steer * PLAYER.turnRate * speedFactor * grip * (drifting ? PLAYER.driftTurn : 1) * dt;
    this.lean = THREE.MathUtils.lerp(this.lean, steer * 0.35 * Math.min(1, this.speed / 15), 1 - Math.exp(-8 * dt));

    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const step = this.speed * dt;
    this.pos.x += fx * step;
    this.pos.z += fz * step;

    this.collide();

    const ground = this.world.groundHeight(this.pos.x, this.pos.z);
    if (this.airborne) {
      this.airTime += dt;
      this.vy -= PLAYER.gravity * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= ground) {
        this.pos.y = ground;
        this.airborne = false;
        const clean = Math.abs(steer) < 0.5 || this.airTime < 0.4;
        if (this.airTime > 0.35) {
          if (clean) this.boost = Math.min(1, this.boost + PLAYER.landingBoostBonus);
          this.emit('land', { clean, airTime: this.airTime });
        }
        this.vy = 0;
      }
    } else if (ground < this.pos.y - 0.05 && step > 0) {
      // Left the top of a ramp: launch along the ramp slope.
      this.vy = Math.max(4, this.slope * this.speed * 1.3);
      this.airborne = true;
      this.airTime = 0;
      this.emit('jump', {});
    } else {
      this.slope = step > 0 ? (ground - this.pos.y) / step : 0;
      this.pos.y = ground;
    }

    this.sync();
  }

  collide() {
    const r = PLAYER.radius;
    const p = this.pos;
    p.x = THREE.MathUtils.clamp(p.x, LIMIT_MIN, LIMIT_MAX);
    p.z = THREE.MathUtils.clamp(p.z, LIMIT_MIN, LIMIT_MAX);
    for (const c of this.world.colliders) {
      if (p.x + r < c.minX || p.x - r > c.maxX || p.z + r < c.minZ || p.z - r > c.maxZ) continue;
      const pushes = [
        [c.minX - r - p.x, 0], [c.maxX + r - p.x, 0],
        [0, c.minZ - r - p.z], [0, c.maxZ + r - p.z],
      ];
      let best = pushes[0];
      for (const q of pushes) if (Math.abs(q[0] + q[1]) < Math.abs(best[0] + best[1])) best = q;
      p.x += best[0];
      p.z += best[1];
      this.crash(best[0] !== 0 ? 'x' : 'z');
    }
  }

  // Hitting a wall: lose speed and pizza heat, and glance off along the wall.
  crash(axis) {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const headOn = axis === 'x' ? Math.abs(fx) : Math.abs(fz);
    if (this.speed > 10 && headOn > 0.5) {
      this.heat = Math.max(0, this.heat - 8 * headOn);
      this.emit('crash', { strength: headOn });
    }
    this.speed *= 1 - 0.7 * headOn;
    // Slide: steer the heading along the wall.
    const along = axis === 'x' ? Math.atan2(0, Math.sign(fz) || 1) : Math.atan2(Math.sign(fx) || 1, 0);
    this.heading = THREE.MathUtils.lerp(this.heading, nearestAngle(this.heading, along), 0.3 * headOn);
  }

  bump(fromX, fromZ, strength = 1) {
    const dx = this.pos.x - fromX, dz = this.pos.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    this.pos.x += (dx / d) * 1.5;
    this.pos.z += (dz / d) * 1.5;
    this.speed *= 0.35;
    this.heat = Math.max(0, this.heat - 12 * strength);
    this.emit('crash', { strength });
  }

  sync() {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(0, this.heading + this.driftYaw, 0);
    this.mesh.rotateZ(-this.lean);
    if (this.airborne) this.mesh.rotateX(-THREE.MathUtils.clamp(this.vy * 0.03, -0.4, 0.4));
  }
}

function nearestAngle(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  // Two directions run along a wall; take the closer one.
  if (Math.abs(d) > Math.PI / 2) d += d > 0 ? -Math.PI : Math.PI;
  return from + d;
}
