import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CELL, GRID } from '../config.js';
import { mat } from '../assets.js';
import * as TEX from '../textures.js';
import { hatch, deuxChevaux, boxTruck, bus } from '../cars.js';
import { HALF, ALLEY_HALF, PALAZZO, TUNNEL, inPalazzo, bayUVs, coloredBox, paint, addTrees, patch, curtain, seeded } from '../cityKit.js';

// Paris around the Eiffel Tower: cream limestone Haussmann blocks with iron balconies and zinc
// mansard roofs, cafés under awnings, plane trees on the avenues, Morris columns and Métro
// entrances, the Arc de Triomphe in its square, a red windmill, and the tower itself over the
// Champ de Mars with a gravel path running right underneath it.

const SHOP = 4.6;          // ground floor
const FLOOR = 3.3;
const BAY = 3.6;
const STONE = [0xf1e6cf, 0xe9dcc2, 0xf4ecdc, 0xe3d4b8, 0xede2cb];
const IRON = 0x161616;
const ZINC = 0x7f8b95;
const AWNINGS = [0xb3262b, 0x1f5a3c, 0x23395f, 0xc8302c, 0x6d1f2a];

// A Haussmann building: shops, five floors of limestone with continuous balconies on the second
// and fifth, a cornice, a zinc mansard roof with dormers and chimney stacks.
function haussmann(w, x, z, wd, d, streets, { floors = 5 } = {}) {
  const rnd = w.rnd;
  const v = Math.floor(rnd() * 3);
  const color = STONE[Math.floor(rnd() * STONE.length)];
  const h = SHOP + floors * FLOOR;
  w.geo(`stone${v}`).push(coloredBox(wd, h - SHOP, d, x, SHOP + (h - SHOP) / 2, z, color, (g) => bayUVs(g, wd, d, BAY, floors)));
  w.geo(`shop${Math.floor(rnd() * 3)}`).push(coloredBox(wd + 0.15, SHOP, d + 0.15, x, SHOP / 2, z, 0xffffff, (g) => bayUVs(g, wd, d, 7, 1)));
  const trim = w.geo('trim');
  const pale = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.35).getHex();
  trim.push(coloredBox(wd + 0.6, 0.45, d + 0.6, x, SHOP + 0.1, z, pale));
  trim.push(coloredBox(wd + 1.0, 0.7, d + 1.0, x, h - 0.15, z, pale));
  // Continuous balconies on floors 2 and 5 along the street sides.
  for (const side of streets) {
    const alongX = side[1] === 'z', sgn = side[0] === '+' ? 1 : -1;
    const width = (alongX ? wd : d) - 0.6;
    const out = (alongX ? d : wd) / 2 + 0.5;
    for (const f of [1, floors - 1]) {
      const y = SHOP + f * FLOOR + 0.05;
      const [cx, cz] = alongX ? [x, z + sgn * out] : [x + sgn * out, z];
      trim.push(coloredBox(alongX ? width : 1.0, 0.18, alongX ? 1.0 : width, cx, y, cz, pale));
      const [rx, rz] = alongX ? [x, z + sgn * (out + 0.47)] : [x + sgn * (out + 0.47), z];
      w.geo('rail').push(coloredBox(alongX ? width : 0.05, 0.9, alongX ? 0.05 : width, rx, y + 0.52, rz, 0xffffff, (g) => bayUVs(g, width, width, 1, 1)));
    }
  }
  // Mansard: the top of a box pulled in, zinc, with dormers on the street sides.
  const roofH = 4.6, inset = 2.6;
  const roof = new THREE.BoxGeometry(wd, roofH, d);
  bayUVs(roof, wd, d, 4, 2);
  const pos = roof.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0) {
      pos.setX(i, Math.sign(pos.getX(i)) * Math.max(0.5, wd / 2 - inset));
      pos.setZ(i, Math.sign(pos.getZ(i)) * Math.max(0.5, d / 2 - inset));
    }
  }
  roof.computeVertexNormals();
  roof.translate(x, h + roofH / 2, z);
  w.geo('zinc').push(paint(roof, 0xffffff));
  for (const side of streets) {
    const alongX = side[1] === 'z', sgn = side[0] === '+' ? 1 : -1;
    const width = alongX ? wd : d;
    const n = Math.max(1, Math.round(width / BAY) - 1);
    for (let k = 0; k < n; k++) {
      const t = -width / 2 + (width / n) * (k + 0.5);
      const o = (alongX ? d : wd) / 2 - inset * 0.45;
      const [dx, dz] = alongX ? [x + t, z + sgn * o] : [x + sgn * o, z + t];
      trim.push(coloredBox(alongX ? 1.3 : 1.2, 1.8, alongX ? 1.2 : 1.3, dx, h + 1.5, dz, pale));
      const [gx, gz] = alongX ? [dx, dz + sgn * 0.61] : [dx + sgn * 0.61, dz];
      trim.push(coloredBox(alongX ? 0.8 : 0.04, 1.1, alongX ? 0.04 : 0.8, gx, h + 1.4, gz, 0x2a333b));
    }
  }
  // Chimney stacks with terracotta pots.
  for (let k = 0; k < 2; k++) {
    if (rnd() < 0.3) continue;
    const cx = x + (rnd() - 0.5) * Math.max(0, wd - 6), cz = z + (rnd() - 0.5) * Math.max(0, d - 6);
    trim.push(coloredBox(2.4, 2.4, 0.8, cx, h + roofH + 0.9, cz, 0xd8c7a8));
    for (let p = 0; p < 4; p++) trim.push(paint(new THREE.CylinderGeometry(0.13, 0.16, 0.55, 6).translate(cx - 0.9 + p * 0.6, h + roofH + 2.35, cz), 0xc06a3a));
  }
  w.addCollider(x - wd / 2 - 0.1, x + wd / 2 + 0.1, z - d / 2 - 0.1, z + d / 2 + 0.1);
  return h;
}

// A café terrace on the pavement: a striped awning and little round tables (no colliders: riders
// on the pavement thread through).
function cafe(w, x, z, side, width) {
  const rnd = w.rnd;
  const alongX = side[1] === 'z', sgn = side[0] === '+' ? 1 : -1;
  const color = AWNINGS[Math.floor(rnd() * AWNINGS.length)];
  const aw = Math.min(width - 2, 10);
  const geo = new THREE.BoxGeometry(alongX ? aw : 1.8, 0.12, alongX ? 1.8 : aw);
  geo.rotateX(alongX ? sgn * 0.3 : 0);
  geo.rotateZ(alongX ? 0 : -sgn * 0.3);
  geo.translate(x + (alongX ? 0 : sgn * 0.8), 3.6, z + (alongX ? sgn * 0.8 : 0));
  w.geo('trim').push(paint(geo, color));
  for (let k = 0; k < 3; k++) {
    const t = -aw / 2 + 1.5 + k * ((aw - 3) / 2);
    const [tx, tz] = alongX ? [x + t, z + sgn * 1.0] : [x + sgn * 1.0, z + t];
    w.geo('trim').push(paint(new THREE.CylinderGeometry(0.35, 0.35, 0.05, 10).translate(tx, 1.05, tz), 0xd9d4c8));
    w.geo('trim').push(coloredBox(0.06, 0.75, 0.06, tx, 0.67, tz, IRON));
    for (const o of [-0.55, 0.55]) {
      const [cx, cz] = alongX ? [tx + o, tz] : [tx, tz + o];
      w.geo('trim').push(coloredBox(0.38, 0.06, 0.38, cx, 0.75, cz, 0xb08850));
      w.geo('trim').push(coloredBox(0.38, 0.45, 0.05, cx + (alongX ? 0 : o * 0.35), 1.0, cz + (alongX ? o * 0.35 : 0), 0xb08850));
    }
  }
}

function pizzeria(w, r) {
  const cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;
  haussmann(w, cx, cz, r.maxX - r.minX, r.maxZ - r.minZ, ['-x', '-z']);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.6), new THREE.MeshBasicMaterial({
    map: TEX.signText('Pizzeria', { bg: '#6e1f24', fg: '#f3d27a', font: 'italic bold 40px serif' }) }));
  sign.position.set(r.minX - 0.25, 5.4, cz);
  sign.rotation.y = -Math.PI / 2;
  w.scene.add(sign);
  cafe(w, r.minX - 0.3, cz, '-x', r.maxZ - r.minZ);
}

// The red windmill on its boulevard corner.
function windmill(w, r) {
  const cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;
  const h = haussmann(w, cx + 6, cz, r.maxX - r.minX - 12, r.maxZ - r.minZ, ['+x', '-z', '+z'], { floors: 3 });
  // A red music hall front on the -x side with the mill on top.
  const hallW = 11, hx = r.minX + hallW / 2;
  w.geo('trim').push(coloredBox(hallW, 9, r.maxZ - r.minZ, hx, 4.5, cz, 0xb0161c));
  w.addCollider(r.minX - 0.1, r.minX + hallW, r.minZ - 0.1, r.maxZ + 0.1);
  const mill = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.2, 9, 12), mat(0xc0151b, { roughness: 0.6 }));
  tower.position.y = 4.5;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(3, 3, 12), mat(0x5a1a14));
  cap.position.y = 10.5;
  const sails = new THREE.Group();
  for (let k = 0; k < 4; k++) {
    const sail = new THREE.Mesh(new THREE.BoxGeometry(1.4, 7, 0.12), mat(0xe8d6b0));
    sail.position.y = 3.6;
    const arm = new THREE.Group();
    arm.add(sail);
    arm.rotation.z = k * Math.PI / 2 + 0.4;
    sails.add(arm);
  }
  sails.position.set(-3.1, 8.5, 0);
  sails.rotation.y = Math.PI / 2;
  const lights = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.08, 6, 24), new THREE.MeshBasicMaterial({ color: 0xffd36b }));
  lights.rotation.x = Math.PI / 2;
  lights.position.y = 9;
  mill.add(tower, cap, sails, lights);
  mill.position.set(hx, 9, cz);
  mill.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  w.scene.add(mill);
}

// The Arc de Triomphe in the middle of its paved square.
function arc(w, r) {
  const cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;
  patch(w.scene, r.minX - 2, r.maxX + 2, r.minZ - 2, r.maxZ + 2, 0.31,
    new THREE.MeshStandardMaterial({ map: TEX.slabs('#c9c0b0').map, roughness: 0.9 }), 3);
  const stone = 0xe4dac6;
  const W = 22, D = 11, H = 25, gap = 8, spring = 11;
  // The front: one block with the great arch cut through it, extruded through the depth.
  const front = new THREE.Shape();
  front.moveTo(-W / 2, 0); front.lineTo(W / 2, 0); front.lineTo(W / 2, H); front.lineTo(-W / 2, H); front.lineTo(-W / 2, 0);
  const hole = new THREE.Path();
  hole.moveTo(-gap / 2, 0); hole.lineTo(gap / 2, 0); hole.lineTo(gap / 2, spring);
  hole.absarc(0, spring, gap / 2, 0, Math.PI, false);
  hole.lineTo(-gap / 2, 0);
  front.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(front, { depth: D, bevelEnabled: false, curveSegments: 16 });
  geo.translate(cx, 0.3, cz - D / 2);
  const m = new THREE.Mesh(geo, mat(stone, { roughness: 0.9 }));
  m.castShadow = m.receiveShadow = true;
  w.scene.add(m);
  for (const s of [-1, 1]) w.addCollider(cx + s * (W + gap) / 4 - (W - gap) / 4, cx + s * (W + gap) / 4 + (W - gap) / 4, cz - D / 2, cz + D / 2);
  const g = w.geo('trim');
  g.push(coloredBox(W + 1, 0.8, D + 1, cx, H - 4, cz, 0xf0e8d8));
  g.push(coloredBox(W + 0.6, 1.2, D + 0.6, cx, H + 0.9, cz, 0xf0e8d8));
  // Relief panels on the piers, front and back.
  for (const s of [-1, 1]) for (const f of [-1, 1]) {
    g.push(coloredBox(4, 6, 0.2, cx + s * (W + gap) / 4, 7, cz + f * (D / 2 + 0.1), 0xc9bda6));
  }
}

// The Eiffel Tower over the Champ de Mars, built from lattice sections.
function eiffel(w, cx, cz) {
  const S = 25, H = 132;             // half the base span, height
  const p1 = 0.18 * H, p2 = 0.38 * H, p3 = 0.84 * H;
  const color = 0x6b5038;
  const latticeMat = (rx, ry) => {
    const t = TEX.lattice();
    t.repeat.set(rx, ry);
    return new THREE.MeshStandardMaterial({ color, alphaMap: t, transparent: false, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7, metalness: 0.3, map: null });
  };
  const g = new THREE.Group();
  // A square open frustum between two heights, as a 4-sided cylinder turned square to the axes.
  const frustum = (rb, rt, y0, y1, rx, ry, at = [0, 0]) => {
    const geo = new THREE.CylinderGeometry(rt * Math.SQRT2, rb * Math.SQRT2, y1 - y0, 4, 1, true);
    geo.rotateY(Math.PI / 4);
    const m = new THREE.Mesh(geo, latticeMat(rx, ry));
    m.position.set(at[0], (y0 + y1) / 2, at[1]);
    g.add(m);
    return m;
  };
  // Four legs leaning in to the first platform.
  const top1 = S * 0.52;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const b = new THREE.Vector3(sx * S, 0, sz * S), t = new THREE.Vector3(sx * top1, p1, sz * top1);
    const len = b.distanceTo(t);
    const geo = new THREE.CylinderGeometry(3.2 * Math.SQRT2, 5 * Math.SQRT2, len, 4, 1, true);
    geo.rotateY(Math.PI / 4);
    const leg = new THREE.Mesh(geo, latticeMat(4, 6));
    leg.position.copy(b).add(t).multiplyScalar(0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), t.clone().sub(b).normalize());
    g.add(leg);
    // Stone pier under each foot.
    const pier = new THREE.Mesh(new THREE.BoxGeometry(11, 1.2, 11), mat(0xb9ad98));
    pier.position.set(sx * S, 0.6, sz * S);
    g.add(pier);
  }
  // The great arches between the legs.
  for (let k = 0; k < 4; k++) {
    const a = new THREE.Mesh(new THREE.TorusGeometry(S * 0.78, 0.55, 6, 32, Math.PI), mat(color, { roughness: 0.7, metalness: 0.3 }));
    a.position.y = p1 - S * 0.78 - 0.6;
    const o = new THREE.Group();
    a.position.z = S * 0.84;
    o.add(a);
    o.rotation.y = k * Math.PI / 2;
    g.add(o);
  }
  // First platform, the middle section, second platform, the spire and the top.
  const deck = (half, y, h) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(half * 2, h, half * 2), mat(color, { roughness: 0.8 }));
    m.position.y = y + h / 2;
    g.add(m);
    const rail = frustum(half + 0.2, half + 0.2, y + h, y + h + 1.2, 12, 1);
    rail.material.alphaMap.repeat.set(20, 1);
  };
  deck(top1 + 1.5, p1 - 1, 3);
  frustum(top1 * 0.95, S * 0.3, p1 + 2, p2, 6, 6);
  deck(S * 0.34, p2, 2.2);
  frustum(S * 0.3, 2.2, p2 + 2.2, p3, 4, 18);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(5.5, 4, 5.5), mat(color));
  cabin.position.y = p3 + 2;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.8, H - p3 - 4, 6), mat(0xd8d2c8));
  mast.position.y = p3 + 4 + (H - p3 - 4) / 2;
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
  beacon.position.y = H;
  g.add(cabin, mast, beacon);
  g.position.set(cx, 0.3, cz);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  w.scene.add(g);
}

// Sacré-Cœur on its hill, far away to the north.
function sacreCoeur(w, x, z) {
  const g = new THREE.Group();
  const white = mat(0xf3efe6, { roughness: 0.9 });
  const hill = new THREE.Mesh(new THREE.ConeGeometry(150, 45, 24, 1, true), mat(0x7d8a5c));
  hill.position.y = 20;
  g.add(hill);
  const body = new THREE.Mesh(new THREE.BoxGeometry(40, 22, 30), white);
  body.position.y = 54;
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 14, 16), white);
  drum.position.y = 72;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(9.5, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), white);
  dome.scale.y = 1.5;
  dome.position.y = 79;
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2, 8, 8), white);
  lantern.position.y = 97;
  g.add(body, drum, dome, lantern);
  for (const s of [-1, 1]) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), white);
    d.scale.y = 1.4; d.position.set(s * 14, 65, 8);
    g.add(d);
  }
  g.position.set(x, -5, z);
  w.scene.add(g);
}

export const paris = {
  id: 'paris',
  name: 'Paris',
  price: 300,
  // Medium: a tighter clock, quicker rivals, busier streets.
  difficulty: { label: 'Medium', stars: 2, refSpeed: 26.2, slack: 1.5, rivals: 1.03, traffic: 3 },
  tagline: 'Cafés, boulevards and the Eiffel Tower',

  // The gravel path under the Eiffel Tower along row 3 is the secret shortcut (see `detour`).
  deliveries: [
    { name: 'Champ de Mars', path: [[0, 0], [7, 0], [7, 3], [4, 3], [4, 4], [2, 4], [2, 3], [1, 3], [1, 7], [5, 7], [5, 10], [9, 10], [9, 5], [10, 5], [10, 1]], detour: [3, 6] },
    { name: 'Trocadéro', path: [[0, 0], [0, 5], [4, 5], [4, 7], [1, 7], [1, 10], [5, 10], [5, 8], [8, 8], [8, 2], [10, 2], [10, 9], [7, 9]] },
    { name: 'Montmartre', path: [[0, 0], [4, 0], [4, 2], [1, 2], [1, 5], [6, 5], [6, 2], [9, 2], [9, 6], [7, 6], [7, 10], [3, 10], [3, 8], [0, 8]] },
    { name: 'Le Marais', path: [[0, 0], [0, 9], [3, 9], [3, 5], [6, 5], [6, 9], [9, 9], [9, 3], [10, 3], [10, 0], [4, 0], [4, 1]] },
    { name: 'Saint-Germain', path: [[0, 0], [1, 0], [1, 6], [5, 6], [5, 1], [8, 1], [8, 8], [5, 8], [5, 10], [10, 10], [10, 4]] },
  ],

  // Covered passages ("passages couverts") under glass roofs, their mouths hung with market tarps.
  alleys: [
    { axis: 'x', at: 8, from: 5, to: 9 },    // Champ de Mars
    { axis: 'z', at: 2, from: 5, to: 7 },    // Trocadéro
    { axis: 'x', at: 3, from: 8, to: 10 },   // Trocadéro
    { axis: 'z', at: 2, from: 0, to: 2 },    // Montmartre
    { axis: 'x', at: 4, from: 6, to: 9 },    // Montmartre
    { axis: 'x', at: 6, from: 3, to: 6 },    // Le Marais
    { axis: 'x', at: 2, from: 5, to: 8 },    // Saint-Germain
  ],

  cars: [
    { id: 'hatch', len: 3.9, w: 1.75, h: 1.5, color: 0xc8302c, speed: 13, reckless: 0.25, build: (k) => hatch(k) },
    { id: '2cv', len: 3.8, w: 1.6, h: 1.6, color: 0x8f989c, speed: 10, reckless: 0.1, build: (k) => deuxChevaux(k) },
    { id: 'hatch', len: 3.9, w: 1.75, h: 1.5, color: 0xf2f2ee, speed: 14, reckless: 0.25, build: (k) => hatch(k) },
    { id: 'van', len: 5.6, w: 2.0, h: 2.7, color: 0xe8e8e2, speed: 11, build: (k) => boxTruck(k) },
    { id: 'hatch', len: 3.9, w: 1.75, h: 1.5, color: 0x2a4f8a, speed: 13, reckless: 0.25, build: (k) => hatch(k) },
    { id: '2cv', len: 3.8, w: 1.6, h: 1.6, color: 0xd9c9a0, speed: 10, reckless: 0.1, build: (k) => deuxChevaux(k) },
    { id: 'bus', len: 12, w: 2.55, h: 3.1, color: 0xf2f2ee, speed: 9, avenue: true, build: (k) => bus(k, { stripe: 0x1f9a76, roof: 0xdcdcdc, sign: '82 TOUR EIFFEL' }) },
  ],

  ramps: ['stairs', 'fountain', 'crates', 'truck'],
  rampStyle: { steps: [0xe9dfcb, 0xddd1ba], wall: 0xcfc3ac, door: 0x1f3d2c, frame: 0xf3ecdf, truck: 0xf2f2ee, works: 'barrier' },

  ground: () => TEX.asphalt(38),
  roadLines: 0xf4f4f4,
  pavementColor: 0xd6cfc2,
  landmarkBlocks: ['0,0', '1,1', '6,6'],

  materials() {
    const out = {};
    for (let v = 0; v < 3; v++) {
      const t = TEX.haussmann(v);
      out[`stone${v}`] = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, vertexColors: true, roughness: 0.9 });
      out[`shop${v}`] = new THREE.MeshStandardMaterial({ map: TEX.parisShop().map, vertexColors: true, roughness: 0.8 });
    }
    out.rail = new THREE.MeshStandardMaterial({ color: IRON, alphaMap: TEX.railing(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.4, vertexColors: true });
    out.zinc = new THREE.MeshStandardMaterial({ map: TEX.zinc().map, vertexColors: true, roughness: 0.5, metalness: 0.4 });
    const pav = TEX.slabs('#cfc8bb', 'rgba(0,0,0,0.18)');
    out.pavement = new THREE.MeshStandardMaterial({ map: pav.map, normalMap: pav.normalMap, vertexColors: true, roughness: 0.9 });
    return out;
  },

  block(w, bi, bj, inner, outer, alley, rnd) {
    const key = `${bi},${bj}`;
    if (!outer && key === '0,0') return pizzeria(w, inner);
    if (!outer && key === '1,1') return windmill(w, inner);
    if (!outer && key === '6,6') return arc(w, inner);
    const bw = (inner.maxX - inner.minX) / 2, bd = (inner.maxZ - inner.minZ) / 2;
    for (let a = 0; a < 2; a++) {
      for (let b = 0; b < 2; b++) {
        let x0 = inner.minX + bw * a + 0.15, x1 = inner.minX + bw * (a + 1) - 0.15;
        let z0 = inner.minZ + bd * b + 0.15, z1 = inner.minZ + bd * (b + 1) - 0.15;
        if (alley?.axis === 'x') { if (b === 0) z1 = alley.line - ALLEY_HALF; else z0 = alley.line + ALLEY_HALF; }
        if (alley?.axis === 'z') { if (a === 0) x1 = alley.line - ALLEY_HALF; else x0 = alley.line + ALLEY_HALF; }
        const streets = outer ? [] : [a ? '+x' : '-x', b ? '+z' : '-z'];
        const x = (x0 + x1) / 2, z = (z0 + z1) / 2, wd = x1 - x0, d = z1 - z0;
        haussmann(w, x, z, wd, d, streets, { floors: outer ? 6 : rnd() < 0.3 ? 6 : 5 });
        // Cafés on some street corners.
        if (!outer && rnd() < 0.28) {
          const side = streets[Math.floor(rnd() * 2)];
          const alongX = side[1] === 'z', sgn = side[0] === '+' ? 1 : -1;
          cafe(w, alongX ? x : x + sgn * (wd / 2 + 0.1), alongX ? z + sgn * (d / 2 + 0.1) : z, side, alongX ? wd : d);
        }
      }
    }
  },

  // The Champ de Mars over blocks (2..3, 2..3): lawns behind clipped hedges, the gravel path along
  // row 3 straight under the tower, its ends screened by a line of shrubs.
  special(w) {
    const P = PALAZZO, T = TUNNEL;
    w.sidewalk(P.minX - 2, P.maxX + 2, P.minZ - 2, P.maxZ + 2);
    const gm = new THREE.MeshStandardMaterial({ map: TEX.grass().map, roughness: 1 });
    const gr = new THREE.MeshStandardMaterial({ map: TEX.gravel().map, roughness: 1 });
    // Gravel all round the lawns, lawns inset.
    patch(w.scene, P.minX, P.maxX, P.minZ, P.maxZ, 0.32, gr, 4);
    for (const [z0, z1] of [[P.minZ, T.minZ], [T.maxZ, P.maxZ]]) {
      patch(w.scene, P.minX + 3, P.maxX - 3, z0 + 3, z1 - 3, 0.34, gm, 8);
      const hedge = 0x2f5a2a, trim = w.geo('trim');
      trim.push(coloredBox(P.maxX - P.minX, 1.3, 1.2, (P.minX + P.maxX) / 2, 0.95, z0 + 0.6, hedge));
      trim.push(coloredBox(P.maxX - P.minX, 1.3, 1.2, (P.minX + P.maxX) / 2, 0.95, z1 - 0.6, hedge));
      trim.push(coloredBox(1.2, 1.3, z1 - z0, P.minX + 0.6, 0.95, (z0 + z1) / 2, hedge));
      trim.push(coloredBox(1.2, 1.3, z1 - z0, P.maxX - 0.6, 0.95, (z0 + z1) / 2, hedge));
      w.addCollider(P.minX - 0.1, P.maxX + 0.1, z0 - 0.1, z1 + 0.1);
    }
    // Rows of trees along the lawns, and shrubs across both ends of the path.
    const spots = [];
    for (let x = P.minX + 5; x < P.maxX - 3; x += 7) for (const z of [P.minZ + 5, P.maxZ - 5]) spots.push({ x, z, s: 1.1 });
    const rnd = seeded(41);
    for (const gx of [T.minX + 1.2, T.maxX - 1.2]) for (let k = 0; k < 4; k++) spots.push({ x: gx + (rnd() - 0.5), z: T.minZ + 1 + k * 1.8, s: 0.42 });
    addTrees(w.scene, spots, { leaf: 0x3f6e2c, height: 8, seed: 43 });
    eiffel(w, (P.minX + P.maxX) / 2, 3 * CELL);
    sacreCoeur(w, 5 * CELL, -330);
  },

  // A covered passage: cream stone arches at both ends, a glass roof, tarps over the mouths.
  alleyDressing(w, alley, minX, maxX, minZ, maxZ) {
    const L = alley.line, alongX = alley.axis === 'x';
    const tarps = [0xb3262b, 0xf2efe6, 0x23395f];
    for (const m of alongX ? [minX + 2.4, maxX - 2.4] : [minZ + 2.4, maxZ - 2.4]) {
      if (alongX) curtain(w.scene, m, L, 'z', ALLEY_HALF * 2, 4.2, tarps);
      else curtain(w.scene, L, m, 'x', ALLEY_HALF * 2, 4.2, tarps);
      // Stone arch over the mouth.
      const [ax, az] = alongX ? [m, L] : [L, m];
      const [aw, ad] = alongX ? [1.2, ALLEY_HALF * 2 + 1] : [ALLEY_HALF * 2 + 1, 1.2];
      w.geo('trim').push(coloredBox(aw, 2.2, ad, ax, 5.6, az, 0xf1e6cf));
    }
    // Glass roof along the passage.
    const len = alongX ? maxX - minX - 4 : maxZ - minZ - 4;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len : ALLEY_HALF * 2 + 0.4, 0.08, alongX ? ALLEY_HALF * 2 + 0.4 : len),
      new THREE.MeshStandardMaterial({ color: 0xbfd8e0, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.2 }));
    roof.position.set(alongX ? (minX + maxX) / 2 : L, 7.2, alongX ? L : (minZ + maxZ) / 2);
    w.scene.add(roof);
    for (let t = 2; t < len; t += 3) {
      const [x, z] = alongX ? [minX + 2 + t, L] : [L, minZ + 2 + t];
      w.geo('trim').push(coloredBox(alongX ? 0.12 : ALLEY_HALF * 2 + 0.4, 0.15, alongX ? ALLEY_HALF * 2 + 0.4 : 0.12, x, 7.15, z, IRON));
    }
  },

  // Lanterns on dark posts, plane trees on the avenues, Morris columns and Métro entrances.
  streetLife(w) {
    w.lampPosts(mergeGeometries([
      new THREE.CylinderGeometry(0.08, 0.13, 4.6, 8).translate(0, 2.3, 0),
      new THREE.CylinderGeometry(0.26, 0.3, 0.9, 8).translate(0, 0.45, 0),
      new THREE.ConeGeometry(0.42, 0.45, 6).translate(0, 5.45, 0),
    ]), new THREE.CylinderGeometry(0.32, 0.2, 0.75, 6).translate(0, 4.9, 0), { post: 0x1f2a24, light: 0xffd08a });

    const rnd = w.rnd;
    const trees = [];
    // Plane trees on the avenues (every fifth street) at the kerb.
    for (const i of [0, 5, 10]) {
      for (let s = 4.5; s < GRID * CELL; s += 9) {
        const m = s % CELL;
        if (m < HALF + 6 || m > CELL - HALF - 6) continue;
        for (const side of [-1, 1]) {
          for (const [x, z] of [[i * CELL + side * (HALF + 1), s], [s, i * CELL + side * (HALF + 1)]]) {
            const bi = Math.floor(x / CELL), bj = Math.floor(z / CELL);
            if (inPalazzo(bi, bj) || x < 0 || z < 0 || x > GRID * CELL || z > GRID * CELL || w.nearAlleyMouth(x, z, HALF + 4)) continue;
            trees.push({ x, z, s: 0.95 + rnd() * 0.2 });
            w.posts.push({ x, z, r: 0.35 });
          }
        }
      }
    }
    addTrees(w.scene, trees, { trunk: 0x8a7d62, leaf: 0x5c8a3a, height: 10, seed: 47 });

    // Morris columns and Métro entrances on some pavements.
    const green = mat(0x1f3d2c, { roughness: 0.6, metalness: 0.3 });
    for (let k = 0; k < 14; k++) {
      let bi, bj;
      do { bi = Math.floor(rnd() * GRID); bj = Math.floor(rnd() * GRID); } while (inPalazzo(bi, bj) || bi + bj === 0);
      const x = bi * CELL + HALF + 1, z = bj * CELL + CELL / 2 + (rnd() - 0.5) * 10;
      if (w.nearAlleyMouth(x, z, 12)) continue;
      if (k % 2 === 0) {
        const col = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.75, 3, 16), new THREE.MeshStandardMaterial({ map: TEX.billboard(k + 1), roughness: 0.8 }));
        body.position.y = 1.8;
        const dome = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), green);
        dome.scale.y = 0.8; dome.position.y = 3.35;
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.3, 16), green);
        base.position.y = 0.45;
        col.add(body, dome, base);
        col.position.set(x, 0, z);
        col.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        w.scene.add(col);
        w.posts.push({ x, z, r: 0.85 });
      } else {
        // Art Nouveau Métro entrance: two curling lamp stems and the sign between.
        const g = new THREE.Group();
        for (const s of [-1, 1]) {
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 3.2, 6), green);
          stem.position.set(0, 1.6, s * 1.4);
          const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff8a3a, emissive: 0xff6a1a, emissiveIntensity: 1.5 }));
          lamp.scale.y = 1.6;
          lamp.position.set(0, 3.3, s * 1.4);
          g.add(stem, lamp);
        }
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.4), new THREE.MeshBasicMaterial({
          map: TEX.signText('MÉTROPOLITAIN', { bg: '#d9c98a', fg: '#1f3d2c', font: 'bold 28px serif', w: 320, h: 48 }), side: THREE.DoubleSide }));
        sign.rotation.y = Math.PI / 2;
        sign.position.y = 2.75;
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 2.8), green);
        rail.position.set(0.6, 0.75, 0);
        g.add(sign, rail);
        g.position.set(x, 0.3, z);
        w.scene.add(g);
        w.posts.push({ x, z: z - 1.4, r: 0.4 }, { x, z: z + 1.4, r: 0.4 });
      }
    }
  },

  landmarks() {},
};
