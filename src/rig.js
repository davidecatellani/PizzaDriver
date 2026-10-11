import * as THREE from 'three';

// Meshy characters arrive as a single static mesh in T-pose. This builds a skeleton for them at load
// time (bones placed from the shape of the mesh, skin weights from simple body regions) and drives it
// procedurally: knees, torso, head and two-bone IK arms that hold the handlebar.

const cache = new Map();   // source geometry uuid -> { geometry, marks }

// Finds body landmarks in a T-pose mesh: y up, facing +z, arms along x.
function landmarks(pos) {
  const v = new THREE.Vector3();
  const box = new THREE.Box3().setFromBufferAttribute(pos);
  const minY = box.min.y, H = box.max.y - box.min.y;
  let maxX = 0;
  for (let i = 0; i < pos.count; i++) maxX = Math.max(maxX, Math.abs(pos.getX(i)));

  // Arm band: everything far out to the side.
  let ay = 0, az = 0, n = 0, ty = 0, tz = 0, tn = 0;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const ax = Math.abs(v.x);
    if (ax > 0.55 * maxX) { ay += v.y; az += v.z; n++; }
    if (ax > 0.9 * maxX) { ty += v.y; tz += v.z; tn++; }
  }
  ay /= n; az /= n; ty /= tn; tz /= tn;

  // Torso half-width just under the armpits.
  let sx = 0;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    if (v.y > ay - 0.14 * H && v.y < ay - 0.07 * H && Math.abs(v.z - az) < 0.15 * H) sx = Math.max(sx, Math.abs(v.x));
  }
  sx = THREE.MathUtils.clamp(sx, 0.22 * maxX, 0.5 * maxX);

  // Shoulder height: the arm band right next to the torso.
  let sy = 0, sn = 0;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const ax = Math.abs(v.x);
    if (ax > sx && ax < sx + 0.12 * (maxX - sx) && Math.abs(v.y - ay) < 0.1 * H) { sy += v.y; sn++; }
  }
  sy = sn ? sy / sn : ay;

  // Arm thickness, measured around the middle of the arm where nothing else is in the way.
  let armR = 0.05 * H;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = (Math.abs(v.x) - sx) / (maxX - sx);
    if (t > 0.3 && t < 0.7) armR = Math.max(armR, Math.abs(v.y - (sy + (ty - sy) * t)), Math.abs(v.z - (az + (tz - az) * t)));
  }

  // A character already sitting on a vehicle is much deeper than a standing one.
  const seated = box.max.z - box.min.z > 0.5 * H;
  const m = { minY, H, maxX, sx, sy, sz: az, tipY: ty, tipZ: tz, seated, armR: Math.min(armR * 1.2, 0.14 * H),
    neckY: ay + 0.06 * H, hipY: minY + 0.5 * H, kneeY: minY + 0.27 * H, footY: minY + 0.04 * H };

  if (seated) {
    // The vehicle's handlebar: front-top part of the model away from the arms.
    let gy = -Infinity, gz = 0, gx = 0, gn = 0;
    const front = box.max.z - 0.35 * (box.max.z - box.min.z);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (v.z > front && v.y > minY + 0.4 * H && v.y < ay - 0.08 * H) { gy = Math.max(gy, v.y); gz += v.z; gx = Math.max(gx, Math.abs(v.x)); gn++; }
    }
    m.grip = gn ? new THREE.Vector3(gx * 0.85, gy, gz / gn) : new THREE.Vector3(sx * 1.5, sy - 0.2 * H, az + 0.3 * H);
  }
  return m;
}

// 0 at a, 1 at b, smooth in between; a may be above b.
const smooth = (a, b, x) => (a < b ? THREE.MathUtils.smoothstep(x, a, b) : 1 - THREE.MathUtils.smoothstep(x, b, a));

// Bone list: name, parent, position in model space.
function boneDefs(m) {
  const { sx, sy, sz, maxX, tipY, tipZ, H } = m;
  const L = maxX - sx;
  const at = (t) => [sx + t * L, sy + (tipY - sy) * t, sz + (tipZ - sz) * t];
  const defs = [['root', null, [0, 0, 0]]];
  const armParent = m.seated ? 'root' : 'chest';
  if (!m.seated) {
    defs.push(
      ['hips', 'root', [0, m.hipY, sz]],
      ['spine', 'hips', [0, m.hipY + 0.08 * H, sz]],
      ['chest', 'spine', [0, sy - 0.12 * H, sz]],
    );
    for (const [s, k] of [[1, 'L'], [-1, 'R']]) {
      const lx = s * sx * 0.5;
      defs.push(
        [`thigh${k}`, 'hips', [lx, m.hipY, sz]],
        [`shin${k}`, `thigh${k}`, [lx, m.kneeY, sz]],
        [`foot${k}`, `shin${k}`, [lx, m.footY, sz]],
      );
    }
  }
  defs.push(['head', m.seated ? 'root' : 'chest', [0, m.neckY, sz]]);
  for (const [s, k] of [[1, 'L'], [-1, 'R']]) {
    for (const [name, t] of [['arm', 0], ['fore', 0.45], ['hand', 0.85], ['tip', 1]]) {
      const [x, y, z] = at(t);
      defs.push([`${name}${k}`, name === 'arm' ? armParent : `${{ fore: 'arm', hand: 'fore', tip: 'hand' }[name]}${k}`, [s * x, y, z]]);
    }
  }
  return defs;
}

// Skin weights by body region, with soft blends at the joints.
function skin(pos, m, index) {
  const { sx, sy, maxX, tipY, H, neckY, hipY, kneeY } = m;
  const skinIndex = new Uint16Array(pos.count * 4);
  const skinWeight = new Float32Array(pos.count * 4);
  const v = new THREE.Vector3();
  const spineY = hipY + 0.08 * H, chestY = sy - 0.12 * H;
  const torso = m.seated ? 'root' : 'chest';

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const w = new Map();
    const add = (b, x) => { if (x > 0) w.set(b, (w.get(b) || 0) + x); };
    const k = v.x >= 0 ? 'L' : 'R';
    const ax = Math.abs(v.x);
    const t = (ax - sx) / (maxX - sx);
    const lineY = sy + (tipY - sy) * THREE.MathUtils.clamp(t, 0, 1);
    const lineZ = m.sz + (m.tipZ - m.sz) * THREE.MathUtils.clamp(t, 0, 1);
    const onArm = t > -0.12 && Math.abs(v.y - lineY) < m.armR && (!m.seated || Math.abs(v.z - lineZ) < m.armR);

    if (onArm) {
      const inArm = smooth(-0.12, 0.05, t);
      add(torso, 1 - inArm);
      const fore = smooth(0.4, 0.5, t), hand = smooth(0.8, 0.9, t);
      add(`arm${k}`, inArm * (1 - fore));
      add(`fore${k}`, inArm * fore * (1 - hand));
      add(`hand${k}`, inArm * hand);
    } else if (v.y > neckY - 0.03 * H) {
      const h = smooth(neckY - 0.03 * H, neckY + 0.02 * H, v.y);
      add('head', h);
      add(torso, 1 - h);
    } else if (m.seated) {
      add('root', 1);
    } else if (v.y < hipY + 0.03 * H) {
      const leg = smooth(hipY + 0.03 * H, hipY - 0.04 * H, v.y);
      add('hips', 1 - leg);
      const shin = smooth(kneeY + 0.03 * H, kneeY - 0.03 * H, v.y);
      add(`thigh${k}`, leg * (1 - shin));
      add(`shin${k}`, leg * shin);
    } else {
      const a = smooth(spineY - 0.03 * H, spineY + 0.03 * H, v.y);
      const b = smooth(chestY - 0.04 * H, chestY + 0.04 * H, v.y);
      add('hips', 1 - a);
      add('spine', a * (1 - b));
      add('chest', a * b);
    }

    const top = [...w.entries()].sort((p, q) => q[1] - p[1]).slice(0, 4);
    const sum = top.reduce((s, e) => s + e[1], 0) || 1;
    top.forEach(([b, x], j) => { skinIndex[i * 4 + j] = index[b]; skinWeight[i * 4 + j] = x / sum; });
  }
  return { skinIndex, skinWeight };
}

// Replaces the single mesh inside `obj` (a makeObject wrapper child) with a rigged SkinnedMesh.
// Returns a Rig, or null when the model is not a single mesh.
export function rigModel(obj) {
  const meshes = [];
  obj.traverse((o) => { if (o.isMesh) meshes.push(o); });
  if (meshes.length !== 1) return null;
  const mesh = meshes[0];
  const model = obj.children[0];  // the glTF scene clone, which carries scale and centring
  obj.updateMatrixWorld(true);

  let entry = cache.get(mesh.geometry.uuid);
  if (!entry) {
    // Bake the mesh's own transform so everything lives in the model root's space.
    const rel = model.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
    const geometry = mesh.geometry.clone().applyMatrix4(rel);
    const marks = landmarks(geometry.attributes.position);
    const defs = boneDefs(marks);
    const index = Object.fromEntries(defs.map((d, i) => [d[0], i]));
    const { skinIndex, skinWeight } = skin(geometry.attributes.position, marks, index);
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
    entry = { geometry, marks, defs };
    cache.set(mesh.geometry.uuid, entry);
  }

  const bones = {};
  const list = entry.defs.map(([name, parent, p]) => {
    const b = new THREE.Bone();
    b.name = name;
    const pp = parent ? entry.defs.find((d) => d[0] === parent)[2] : [0, 0, 0];
    b.position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]);
    if (parent) bones[parent].add(b);
    bones[name] = b;
    return b;
  });
  model.add(bones.root);
  const skinned = new THREE.SkinnedMesh(entry.geometry, mesh.material);
  skinned.castShadow = true;
  skinned.frustumCulled = false;
  model.add(skinned);
  mesh.parent.remove(mesh);
  model.updateMatrixWorld(true);
  skinned.bind(new THREE.Skeleton(list));
  return new Rig(model, bones, entry.marks);
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _d = new THREE.Vector3(), _e = new THREE.Vector3(), _t = new THREE.Vector3();
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion();

// Turns `bone` so the direction to `childPos` (world) points at `target` (world).
function aim(bone, childPos, target) {
  bone.getWorldPosition(_a);
  _b.subVectors(childPos, _a).normalize();
  _c.subVectors(target, _a).normalize();
  _q.setFromUnitVectors(_b, _c);
  bone.parent.getWorldQuaternion(_pq);
  bone.quaternion.premultiply(_pq.clone().invert().multiply(_q).multiply(_pq));
  bone.updateMatrixWorld(true);
}

export class Rig {
  constructor(model, bones, marks) {
    this.model = model;
    this.b = bones;
    this.m = marks;
    this.hipsY = bones.hips?.position.y ?? 0;
    this.t = Math.random() * 10;
    this.grips = { L: new THREE.Vector3(), R: new THREE.Vector3() };
    if (marks.grip) this.setGrips(marks.grip);
    this.smoothed = { bend: 0.3, lean: 0, fwd: 0.2, wave: 0, flail: 0, cheer: 0 };
  }

  // Handlebar grip for the left hand, in model space; the right one is mirrored.
  setGrips(left) {
    this.grips.L.copy(left);
    this.grips.R.set(-left.x, left.y, left.z);
  }

  // Two-bone IK: upper arm and forearm reach for `target` (model space), elbow towards `pole`.
  reach(k, target, pole) {
    const up = this.b[`arm${k}`], lo = this.b[`fore${k}`], end = this.b[`hand${k}`];
    up.quaternion.identity(); lo.quaternion.identity(); end.quaternion.identity();
    up.updateMatrixWorld(true);
    const A = up.getWorldPosition(new THREE.Vector3());
    const B = lo.getWorldPosition(new THREE.Vector3());
    const C = end.getWorldPosition(new THREE.Vector3());
    const l1 = A.distanceTo(B), l2 = B.distanceTo(C);
    this.model.localToWorld(_t.copy(target));
    const dir = _d.subVectors(_t, A);
    const dist = THREE.MathUtils.clamp(dir.length(), Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.999);
    dir.normalize();
    const cosA = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
    this.model.localToWorld(_e.copy(pole));
    const perp = _e.sub(A);
    perp.addScaledVector(dir, -perp.dot(dir)).normalize();
    const elbow = A.clone().addScaledVector(dir, cosA * l1).addScaledVector(perp, Math.sqrt(Math.max(0, 1 - cosA * cosA)) * l1);
    aim(up, B, elbow);
    aim(lo, end.getWorldPosition(C), A.clone().addScaledVector(dir, dist));
  }

  // Walking on foot: legs and arms swing with `speed` (m/s); `panic` throws the arms up.
  walk(dt, speed, panic = 0) {
    const { b, m } = this;
    this.t += dt;
    this.phase = (this.phase ?? Math.random() * 6) + dt * speed * 3.4;
    const sw = Math.sin(this.phase) * Math.min(1, speed / 1.2);
    if (!m.seated) {
      b.thighL.rotation.set(sw * 0.45, 0, 0);
      b.thighR.rotation.set(-sw * 0.45, 0, 0);
      b.shinL.rotation.set(Math.max(0, sw) * 0.6, 0, 0);
      b.shinR.rotation.set(Math.max(0, -sw) * 0.6, 0, 0);
      b.hips.position.y = this.hipsY + Math.abs(Math.cos(this.phase)) * 0.015 * m.H;
      b.spine.rotation.set(0.04, sw * 0.08, 0);
      b.chest.rotation.set(0, -sw * 0.1, 0);
    }
    b.head.rotation.set(0, Math.sin(this.t * 0.7) * 0.3, 0);
    for (const [k, sgn] of [['L', 1], ['R', -1]]) {
      const hang = THREE.MathUtils.lerp(-sgn * 1.45, sgn * 0.5 + Math.sin(this.t * 15 + sgn) * 0.3, panic);
      const swing = -sgn * sw * 0.35 * (1 - panic);
      b[`arm${k}`].quaternion.setFromEuler(new THREE.Euler(swing, 0, hang, 'XYZ'));
      b[`fore${k}`].quaternion.identity();
      b[`hand${k}`].quaternion.identity();
    }
  }

  // s: { speed (0..1), steer (-1..1), air, airTime, drift, boost, crash (0..1), cheer, kick,
  //      attack: { side: 1 left / -1 right, t: 0..1 } while kicking a rival }
  update(dt, s) {
    const { b, m } = this;
    this.t += dt;
    const k = 1 - Math.exp(-10 * dt);
    const sm = this.smoothed;
    const lerp = (key, to, rate = k) => (sm[key] += (to - sm[key]) * rate);

    const bend = lerp('bend', s.air ? 0.55 : s.boost ? 0.55 : s.drift ? 0.5 : 0.3 + 0.1 * s.speed);
    const lean = lerp('lean', s.steer);
    const fwd = lerp('fwd', s.boost ? 0.5 : s.drift ? -0.05 : s.cheer ? -0.1 : 0.2 + 0.1 * s.speed);
    const flail = lerp('flail', s.crash ? 1 : 0, 1 - Math.exp(-6 * dt));
    const cheer = lerp('cheer', s.cheer ? 1 : 0, 1 - Math.exp(-5 * dt));
    const wave = lerp('wave', s.air && s.airTime > 0.25 ? 1 : 0, 1 - Math.exp(-8 * dt));
    const bob = Math.sin(this.t * 9) * 0.04 * s.speed;

    b.head.rotation.set(-0.1 * fwd + flail * 0.3 * Math.sin(this.t * 13), lean * 0.45, -lean * 0.1);

    if (!m.seated) {
      // Legs: front foot forward, back foot behind; hips drop so the feet stay on the deck.
      const kick = s.kick ? Math.max(0, Math.sin(this.t * 9)) * 0.7 : 0;
      const legs = [['L', bend + bob, -0.12], ['R', bend + bob * 0.5, 0.18 + kick]];
      let drop = 0;
      const legLen = m.hipY - m.footY;
      // Side kick: the leg on that side swings out straight, the body leans away from it.
      const atk = s.attack ? Math.sin(Math.PI * s.attack.t) : 0;
      const atkSide = s.attack ? (s.attack.side > 0 ? 'L' : 'R') : null;
      for (const [side, a, off] of legs) {
        const out = side === atkSide ? atk : 0;
        b[`thigh${side}`].rotation.set((-a + off) * (1 - out), 0, (side === 'L' ? 1 : -1) * 1.35 * out);
        b[`shin${side}`].rotation.set((2 * a - Math.max(0, off) * 0.5) * (1 - out), 0, 0);
        drop += legLen * (1 - Math.cos(a)) / 2;
      }
      b.hips.position.y = this.hipsY - drop;
      const away = s.attack ? -s.attack.side * 0.4 * atk : 0;
      b.spine.rotation.set(fwd * 0.6, 0, -lean * 0.12 + away);
      b.chest.rotation.set(fwd * 0.4 + flail * 0.2 * Math.sin(this.t * 11), lean * 0.15, -lean * 0.1);
    }

    this.model.updateMatrixWorld(true);
    const H = m.H;
    for (const [side, sgn] of [['L', 1], ['R', -1]]) {
      const target = this.grips[side].clone();
      // Right arm: thrown up for a trick in the air, pumped when celebrating.
      if (side === 'R') {
        const up = _t.set(-m.sx * 2.2, m.neckY + 0.3 * H, m.sz + 0.05 * H);
        target.lerp(up, Math.max(wave, cheer));
        if (cheer > 0.5) target.y += Math.sin(this.t * 10) * 0.08 * H;
      }
      if (flail > 0.01) {
        const f = _e.set(sgn * (m.sx + 0.45 * H), m.neckY + Math.sin(this.t * 14 + sgn) * 0.25 * H, m.sz + Math.cos(this.t * 11 + sgn) * 0.2 * H);
        target.lerp(f, flail);
      }
      // Seated riders (no legs to kick with) shove with the arm on that side instead.
      if (s.attack && m.seated && s.attack.side === sgn) {
        const shove = _e.set(sgn * (m.sx + 0.6 * H), m.sy, m.sz + 0.1 * H);
        target.lerp(shove, Math.sin(Math.PI * s.attack.t));
      }
      const pole = new THREE.Vector3(sgn * (m.sx + 0.4 * H), m.sy - 0.4 * H, m.sz - 0.3 * H);
      this.reach(side, target, pole);
    }
  }
}
