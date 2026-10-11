import * as THREE from 'three';
import { puff } from './textures.js';

// Pooled point-sprite particles: tyre smoke and dust (soft, normal blending) and boost flames and
// sparks (additive, so they bloom). One draw call per pool.

class Pool {
  constructor(scene, max, additive) {
    this.max = max;
    this.p = [];
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: puff() }, scale: { value: 500 } },
      vertexShader: `
        attribute float size; attribute vec4 color; varying vec4 vColor; uniform float scale;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; varying vec4 vColor;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(vColor.rgb, vColor.a * t.a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, life, size, grow, color, alpha) {
    if (this.p.length >= this.max) this.p.shift();
    this.p.push({ x, y, z, vx, vy, vz, life, age: 0, size, grow, c: new THREE.Color(color), alpha });
  }

  update(dt) {
    let n = 0;
    this.p = this.p.filter((q) => (q.age += dt) < q.life);
    for (const q of this.p) {
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      q.vx *= 1 - 2 * dt; q.vz *= 1 - 2 * dt;
      const t = q.age / q.life;
      this.pos.set([q.x, q.y, q.z], n * 3);
      this.col.set([q.c.r, q.c.g, q.c.b, q.alpha * (1 - t) * Math.min(1, t * 8)], n * 4);
      this.size[n] = Math.max(0, q.size + q.grow * q.age);
      n++;
    }
    this.geo.setDrawRange(0, n);
    for (const a of ['position', 'color', 'size']) this.geo.attributes[a].needsUpdate = true;
  }
}

export class Fx {
  constructor(scene) {
    this.smoke = new Pool(scene, 400, false);
    this.fire = new Pool(scene, 300, true);
  }

  setHeight(h) {
    this.smoke.points.material.uniforms.scale.value = h * 0.5;
    this.fire.points.material.uniforms.scale.value = h * 0.5;
  }

  // Point behind a rider at `back` metres, `side` metres to the right.
  static rear(r, back, side = 0) {
    const s = Math.sin(r.heading), c = Math.cos(r.heading);
    return [r.pos.x - s * back + c * side, r.pos.z - c * back - s * side];
  }

  update(dt, player) {
    const rnd = (a) => (Math.random() - 0.5) * a;
    const p = player;
    if (p.drift > 0 && p.speed > 5) {
      for (const side of [-0.3, 0.3]) {
        const [x, z] = Fx.rear(p, 1, side);
        this.smoke.emit(x, p.pos.y + 0.3, z, rnd(2), 0.8 + Math.random(), rnd(2), 1.1, 1, 3, 0xbdb8b0, 0.6);
      }
    }
    if (p.boosting && p.speed > 5) {
      const [x, z] = Fx.rear(p, 1.2);
      for (let k = 0; k < 2; k++) {
        this.fire.emit(x + rnd(0.3), p.pos.y + 0.45 + rnd(0.2), z + rnd(0.3), -Math.sin(p.heading) * 6 + rnd(2), rnd(1), -Math.cos(p.heading) * 6 + rnd(2),
          0.25, 0.7, -1.5, k ? 0xffa53a : 0x52c8ff, 0.9);
      }
    }
    this.smoke.update(dt);
    this.fire.update(dt);
  }

  // A burst of dust when landing a jump.
  dust(pos, n = 18) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      this.smoke.emit(pos.x, pos.y + 0.2, pos.z, Math.cos(a) * 5, 0.5 + Math.random(), Math.sin(a) * 5, 0.8, 0.7, 2.5, 0xd8cdb8, 0.55);
    }
  }

  // Sparks from a hit.
  sparks(pos, n = 16) {
    for (let k = 0; k < n; k++) {
      this.fire.emit(pos.x, pos.y + 0.8, pos.z, (Math.random() - 0.5) * 10, 2 + Math.random() * 5, (Math.random() - 0.5) * 10, 0.35, 0.35, -0.5, 0xffd27a, 1);
    }
  }
}
