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
    this.turbo = 0;            // seconds of banked boost
    this.boost = 0;            // turbo as a 0..1 meter, for the HUD
    this.boosting = false;
    this.wheelie = 0;          // 0..1 front wheel lift while holding SPACE on the ground
    this.trick = null;         // { t } spin in progress while airborne
    this.trickDone = false;
    this.hitCd = 0;
    this.heat = 100;           // pizza temperature: drops on crashes, affects the tip
    this.lean = 0;
    this.drift = 0;            // seconds into the current drift
    this.driftYaw = 0;         // visual slide angle
    this.crashT = 0;           // seconds left of the crash flail
    this.knock = new THREE.Vector2();   // shove velocity from hits, decays
    this.spin = 0;             // heading wobble from hits, rad/s
    this.kick = null;          // { side, t, hit } while kicking
    this.kickCd = 0;
    this.cheer = false;
    this.steer = 0;
    this.sync();
  }

  emit(type, data) {
    if (type === 'crash') this.crashT = 0.7;
    this.events.push({ type, ...data });
  }

  update(dt, input, active) {
    const steer = active ? input.steer : 0;
    this.steer = steer;
    // SPACE: wheelie on the ground (a higher launch off a ramp), a spin trick in the air.
    const space = active && input.boost;
    if (this.airborne) {
      if (space && !this.spaceHeld && !this.trick && !this.trickDone) this.trick = { t: 0 };
    }
    this.spaceHeld = space;
    this.wheelie = THREE.MathUtils.lerp(this.wheelie, space && !this.airborne && this.speed > 3 ? 1 : 0, 1 - Math.exp(-10 * dt));
    if (this.trick) {
      this.trick.t += dt / 0.6;
      if (this.trick.t >= 1) { this.trick = null; this.trickDone = true; this.emit('trick', {}); }
    }

    // Banked turbo burns by itself.
    const wantBoost = active && this.turbo > 0 && !this.airborne;
    this.boosting = wantBoost;
    if (wantBoost) this.turbo = Math.max(0, this.turbo - dt);
    this.boost = this.turbo / PLAYER.turboMax;

    // Drift: braking while steering at speed slides the scooter round a corner instead of stopping it.
    // A drift held long enough banks some turbo when it ends.
    const drifting = active && input.brake && Math.abs(steer) > 0.3 && this.speed > PLAYER.driftMinSpeed && !this.airborne;
    if (drifting) {
      this.drift += dt;
    } else if (this.drift > 0) {
      if (this.drift > PLAYER.driftBoostAfter) {
        this.addTurbo(PLAYER.driftBoost);
        this.emit('drift', { time: this.drift });
      }
      this.drift = 0;
    }
    this.driftYaw = THREE.MathUtils.lerp(this.driftYaw, drifting ? steer * 0.5 : 0, 1 - Math.exp(-10 * dt));

    const max = PLAYER.maxSpeed * (wantBoost ? PLAYER.boostMultiplier : 1);
    if (!active) this.speed = Math.max(0, this.speed - PLAYER.brake * dt);
    else if (drifting) this.speed = Math.max(0, this.speed - PLAYER.driftDrag * dt);
    else if (input.brake && this.speed > 0.5) this.speed = Math.max(0, this.speed - PLAYER.brake * dt);
    else if (input.brake) this.speed = Math.max(-PLAYER.reverse, this.speed - 12 * dt);   // back up
    else if (this.speed < max) this.speed = Math.min(max, this.speed + PLAYER.accel * (wantBoost ? 2 : 1) * (this.speed < 0 ? 3 : 1) * dt);
    else this.speed = Math.max(max, this.speed - PLAYER.accel * 0.5 * dt);

    // Steering gets slightly tighter at low speed; much weaker in the air.
    const grip = this.airborne ? 0.25 : 1;
    // Some steering even at a standstill, so a rider stuck against something can always turn away.
    const speedFactor = THREE.MathUtils.clamp(Math.abs(this.speed) / 8, 0.45, 1) * (1.1 - 0.2 * (Math.abs(this.speed) / (PLAYER.maxSpeed * 1.5)));
    this.heading += Math.sign(this.speed || 1) * steer * PLAYER.turnRate * speedFactor * grip * (drifting ? PLAYER.driftTurn : 1) * dt;
    this.lean = THREE.MathUtils.lerp(this.lean, steer * 0.35 * Math.min(1, this.speed / 15), 1 - Math.exp(-8 * dt));

    this.heading += this.spin * dt;
    this.spin *= Math.exp(-4 * dt);
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const step = this.speed * dt;
    this.pos.x += fx * step + this.knock.x * dt;
    this.pos.z += fz * step + this.knock.y * dt;
    this.knock.multiplyScalar(Math.exp(-5 * dt));

    this.hitCd = Math.max(0, this.hitCd - dt);
    this.collide();

    const ground = this.world.groundHeight(this.pos.x, this.pos.z);
    if (this.airborne) {
      this.airTime += dt;
      this.vy -= PLAYER.gravity * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= ground) {
        this.pos.y = ground;
        this.airborne = false;
        // Landing mid-trick is a wipe-out; a clean ramp landing banks turbo, more with a trick.
        const midTrick = !!this.trick;
        const clean = !midTrick && (Math.abs(steer) < 0.5 || this.airTime < 0.4);
        if (this.airTime > 0.35) {
          let gained = 0;
          if (clean) {
            gained = PLAYER.turboLanding + this.airTime * PLAYER.turboPerAir + (this.trickDone ? PLAYER.turboTrick : 0);
            this.addTurbo(gained);
          }
          this.emit('land', { clean, airTime: this.airTime, trick: this.trickDone, gained, wipeout: midTrick });
          if (midTrick) { this.speed *= 0.3; this.crashT = 0.9; this.heat = Math.max(0, this.heat - 6); }
        }
        this.trick = null;
        this.trickDone = false;
        this.vy = 0;
      }
    } else if (ground < this.pos.y - 0.05 && step > 0) {
      // Left the top of a ramp: launch along the ramp slope.
      // Leaving the ramp in a wheelie launches higher.
      this.vy = Math.max(4, this.slope * this.speed * 1.3) * (this.wheelie > 0.5 ? PLAYER.wheelieJump : 1);
      this.airborne = true;
      this.trick = null;
      this.trickDone = false;
      this.airTime = 0;
      this.emit('jump', { wheelie: this.wheelie > 0.5 });
    } else {
      this.slope = step > 0 ? (ground - this.pos.y) / step : 0;
      this.pos.y = ground;
    }

    this.crashT = Math.max(0, this.crashT - dt);
    this.tickKick(dt);
    this.mesh.userData.rig?.update(dt, {
      speed: Math.min(1, this.speed / PLAYER.maxSpeed), steer: this.steer, air: this.airborne, airTime: this.airTime,
      drift: this.drift > 0, boost: this.boosting && this.speed > 5, crash: this.crashT > 0, cheer: this.cheer,
      kick: active && !this.airborne && this.speed > 0.5 && this.speed < 9 && !input.brake,
      attack: this.kick, trick: this.trick ? this.trick.t : 0,
    });
    this.sync();
  }

  collide() {
    const r = PLAYER.radius;
    const p = this.pos;
    p.x = THREE.MathUtils.clamp(p.x, LIMIT_MIN, LIMIT_MAX);
    p.z = THREE.MathUtils.clamp(p.z, LIMIT_MIN, LIMIT_MAX);
    for (const c of this.world.colliders) {
      // Strict overlap: a rider resting exactly against a wall (after the last push) is not hitting it.
      // (Treating that contact as a hit used to stop riders dead along walls.)
      const E = 1e-4;
      if (p.x + r <= c.minX + E || p.x - r >= c.maxX - E || p.z + r <= c.minZ + E || p.z - r >= c.maxZ - E) continue;
      const pushes = [
        ['x', c.minX - r - p.x], ['x', c.maxX + r - p.x],
        ['z', c.minZ - r - p.z], ['z', c.maxZ + r - p.z],
      ];
      let best = pushes[0];
      for (const q of pushes) if (Math.abs(q[1]) < Math.abs(best[1])) best = q;
      if (best[0] === 'x') p.x += best[1]; else p.z += best[1];
      this.crash(best[0]);
    }
    // Lamp posts and other thin round things: slide round them; a fast head-on hit bounces you off.
    for (const q of this.world.posts) {
      const dx = p.x - q.x, dz = p.z - q.z, d = Math.hypot(dx, dz), min = q.r + 0.35;
      if (d >= min || d < 1e-4) continue;
      p.x = q.x + (dx / d) * min;
      p.z = q.z + (dz / d) * min;
      const headOn = -(dx / d * Math.sin(this.heading) + dz / d * Math.cos(this.heading));
      if (headOn > 0.6 && this.speed > 10 && !this.hitCd) {
        this.hitBy(q.x, q.z, 6, 3, 0.5);
        this.hitCd = 0.5;
      } else {
        this.speed *= 0.97;
      }
    }
  }

  addTurbo(s) {
    this.turbo = Math.min(PLAYER.turboMax, this.turbo + s);
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

  // Side kick at a neighbour: side 1 = left, -1 = right. Lasts 0.5 s.
  startKick(side) {
    if (this.kick || this.kickCd > 0) return false;
    this.kick = { side, t: 0, hit: false };
    return true;
  }

  tickKick(dt) {
    this.kickCd = Math.max(0, this.kickCd - dt);
    if (!this.kick) return;
    this.kick.t += dt / 0.5;
    if (this.kick.t >= 1) { this.kick = null; this.kickCd = Math.max(this.kickCd, 0.35); }
  }

  // Knocked by a car or a rival: shoved away from (fromX, fromZ), slowed, spun, and the pizza cools.
  hitBy(fromX, fromZ, power, heatLoss = 0, slow = 0.35) {
    const d = new THREE.Vector2(this.pos.x - fromX, this.pos.z - fromZ);
    if (d.lengthSq() < 1e-4) d.set(Math.cos(this.heading), -Math.sin(this.heading));
    d.normalize();
    this.knock.addScaledVector(d, power);
    this.speed *= slow;
    // Spin away from the side that was hit.
    const side = d.x * Math.cos(this.heading) - d.y * Math.sin(this.heading);
    this.spin += Math.sign(side || 1) * power * 0.25;
    this.heat = Math.max(0, this.heat - heatLoss);
    this.crashT = 0.7;
    this.events.push({ type: 'hit', strength: power });
  }

  sync() {
    this.mesh.position.copy(this.pos);
    this.mesh.position.y += 0.45 * this.wheelie;
    this.mesh.rotation.set(0, this.heading + this.driftYaw, 0);
    this.mesh.rotateZ(-this.lean);
    // Kicking: the whole rider leans away from the kick.
    if (this.kick) this.mesh.rotateZ(this.kick.side * 0.3 * Math.sin(Math.PI * this.kick.t));
    // Spin trick: a full turn in the air.
    if (this.trick) this.mesh.rotateY(Math.PI * 2 * THREE.MathUtils.smoothstep(this.trick.t, 0, 1));
    // Wheelie: front lifted.
    this.mesh.rotateX(-0.35 * this.wheelie);
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
