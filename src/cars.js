import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { signText } from './textures.js';

// Traffic vehicles modelled in code. Bodies are lofted: a rounded cross-section (a superellipse)
// swept along the car, so sides curve in and corners are soft. Every part is vertex-coloured and
// merged into two meshes per vehicle (shiny paint and glass, matte rubber and plastic), and each
// kind is built once and cloned, so a street full of cars stays cheap on phones.
// Length runs along +z (the front), width along x, y up from the road.

// --- Geometry helpers ---

// A rounded section at one station along the car: half-widths at the bottom and top (tumblehome),
// bottom and top heights, and the squareness `n` (2 = ellipse, higher = boxier).
function ring(st, seg) {
  const { b, t, w, wt = w, n = 4 } = st;
  const mid = (b + t) / 2, hh = (t - b) / 2, e = 2 / n;
  const pts = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    const y = mid + hh * Math.sign(s) * Math.abs(s) ** e;
    const hw = THREE.MathUtils.lerp(w, wt, (y - b) / (t - b || 1));
    pts.push([hw * Math.sign(c) * Math.abs(c) ** e, y]);
  }
  return pts;
}

// Sweeps rings through `stations` ({ z, b, t, w, wt, n }, rear to front) and caps both ends.
// `colorAt(x, y, z)`, if given, colours each vertex (e.g. glass below the roof line).
function loft(stations, seg = 20, colorAt = null) {
  const pos = [], idx = [];
  stations.forEach((st) => { for (const [x, y] of ring(st, seg)) pos.push(x, y, st.z); });
  for (let s = 0; s < stations.length - 1; s++) {
    for (let i = 0; i < seg; i++) {
      const a = s * seg + i, b = s * seg + (i + 1) % seg, c = a + seg, d = b + seg;
      idx.push(a, b, c, b, d, c);
    }
  }
  for (const [s, flip] of [[0, true], [stations.length - 1, false]]) {
    const st = stations[s], centre = pos.length / 3;
    pos.push(0, (st.b + st.t) / 2, st.z);
    for (let i = 0; i < seg; i++) {
      const a = s * seg + i, b = s * seg + (i + 1) % seg;
      if (flip) idx.push(centre, b, a); else idx.push(centre, a, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  if (colorAt) {
    const cols = [], c = new THREE.Color();
    for (let i = 0; i < pos.length; i += 3) { c.set(colorAt(pos[i], pos[i + 1], pos[i + 2])); cols.push(c.r, c.g, c.b); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  }
  return geo;
}

function tint(geo, color) {
  const c = new THREE.Color(color), n = geo.attributes.position.count;
  const cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) cols.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return geo;
}

const at = (geo, x, y, z) => geo.translate(x, y, z);
const boxG = (w, h, d, x, y, z) => at(new THREE.BoxGeometry(w, h, d), x, y, z);
const rounded = (w, h, d, x, y, z, n = 6) => loft([
  { z: z - d / 2, b: y - h / 2 + 0.02, t: y + h / 2 - 0.02, w: w / 2 - 0.02, n },
  { z: z - d / 2 + 0.03, b: y - h / 2, t: y + h / 2, w: w / 2, n },
  { z: z + d / 2 - 0.03, b: y - h / 2, t: y + h / 2, w: w / 2, n },
  { z: z + d / 2, b: y - h / 2 + 0.02, t: y + h / 2 - 0.02, w: w / 2 - 0.02, n },
], 12);

// Collects coloured parts into the two merged meshes.
class Kit {
  constructor() { this.paint = []; this.matte = []; this.extra = []; }
  // `color` null keeps the geometry's own vertex colours.
  add(geo, color, matte = false) {
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'color'].includes(k) || (k === 'color' && color !== null)) geo.deleteAttribute(k);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const flat = geo.index ? geo.toNonIndexed() : geo;
    (matte ? this.matte : this.paint).push(color === null ? flat : tint(flat, color));
  }
  build() {
    const g = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.35 });
    const matte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    for (const [list, m] of [[this.paint, paint], [this.matte, matte]]) {
      if (!list.length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(list), m);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
    }
    for (const e of this.extra) g.add(e);
    return g;
  }
}

const GLASS = 0x1c2630, RUBBER = 0x141414, TRIM = 0x2a2c2f, CHROME = 0xc9cdd1, HEAD = 0xfff4d6, TAIL = 0xc4161c, ORANGE = 0xffa020;

// Wheels: tyre and rim standing just proud of the body side, with a dark wheel arch painted on
// the body round each one (the body is not cut away, the arch reads as the opening).
function wheels(k, W, r, zs, { rim = CHROME, width = 0.24, arch = true } = {}) {
  for (const z of zs) {
    for (const sx of [-1, 1]) {
      const x = sx * (W / 2 + 0.03 - width / 2);
      k.add(at(new THREE.CylinderGeometry(r, r, width, 18).rotateZ(Math.PI / 2), x, r, z), RUBBER, true);
      k.add(at(new THREE.CylinderGeometry(r * 0.6, r * 0.6, width + 0.02, 12).rotateZ(Math.PI / 2), x, r, z), rim);
      k.add(at(new THREE.CylinderGeometry(r * 0.2, r * 0.2, width + 0.04, 8).rotateZ(Math.PI / 2), x, r, z), 0x55585c);
      if (arch) k.add(at(new THREE.CylinderGeometry(r + 0.07, r + 0.07, 0.02, 20, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), sx * (W / 2 + 0.012), r + 0.02, z), 0x0b0b0b, true);
    }
  }
}

// Head and tail lights, bumpers, number plates.
function ends(k, W, L, { y = 0.75, headW = 0.3, round = false, bumperY = 0.42, bumper = TRIM } = {}) {
  for (const sx of [-1, 1]) {
    const hx = sx * (W / 2 - headW / 2 - 0.12);
    if (round) k.add(at(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 12).rotateX(Math.PI / 2), hx, y, L / 2 + 0.01), HEAD);
    else k.add(boxG(headW, 0.13, 0.06, hx, y, L / 2 - 0.01), HEAD);
    k.add(boxG(headW * 0.8, 0.12, 0.06, hx, y + 0.04, -L / 2 + 0.01), TAIL);
    k.add(boxG(0.1, 0.07, 0.06, sx * (W / 2 - 0.08), y - 0.12, L / 2 - 0.01), ORANGE);
  }
  k.add(rounded(W * 0.98, 0.2, 0.22, 0, bumperY, L / 2 - 0.06), bumper, true);
  k.add(rounded(W * 0.98, 0.2, 0.22, 0, bumperY, -L / 2 + 0.06), bumper, true);
  k.add(boxG(0.52, 0.12, 0.02, 0, bumperY + 0.02, L / 2 + 0.06), 0xf2f2ea, true);
  k.add(boxG(0.52, 0.12, 0.02, 0, bumperY + 0.18, -L / 2 - 0.0), 0xf2f2ea, true);
}

function mirrors(k, W, y, z, color) {
  for (const sx of [-1, 1]) k.add(rounded(0.18, 0.12, 0.1, sx * (W / 2 + 0.08), y, z, 4), color);
}

// A saloon-type car from a few numbers: body line, greenhouse and roof. `shape`:
// L, W, belt, roof, nose/tail (bonnet and boot lengths), cabin z range, roundness.
function car(kind, s) {
  const k = new Kit();
  const L = kind.len, W = kind.w, c = kind.color, h = L / 2;
  const n = s.n ?? 4, low = s.low ?? 0.2, belt = s.belt, hood = s.hood ?? belt - 0.08, deck = s.deck ?? belt - 0.04;
  // Lower body: low nose and tail, full height in the middle.
  k.add(loft([
    { z: -h, b: low + 0.1, t: deck - 0.12, w: W / 2 - 0.12, n },
    { z: -h + 0.12, b: low + 0.02, t: deck - 0.02, w: W / 2 - 0.03, n },
    { z: -h + 0.5, b: low, t: deck, w: W / 2, n },
    { z: Math.max(s.glass[0], -h + 0.55), b: low, t: belt, w: W / 2, n },
    { z: Math.min(s.glass[3], h - 0.6), b: low, t: belt, w: W / 2, n },
    { z: h - 0.55, b: low, t: hood, w: W / 2, n },
    { z: h - 0.12, b: low + 0.04, t: hood - 0.1, w: W / 2 - 0.04, n },
    { z: h, b: low + 0.12, t: hood - 0.2, w: W / 2 - 0.14, n },
  ]), c);
  // Greenhouse: glass sloping from the boot to the roof and down to the bonnet.
  const [r0, r1, f1, f0] = s.glass;   // rear base, rear roof edge, front roof edge, windscreen base
  const gw = W / 2 - 0.06, top = s.roof, roofW = gw * (s.tumble ?? 0.8);
  const gl = [
    { z: r0, b: belt - 0.1, t: belt + 0.01, w: gw, wt: gw, n: 4 },
    { z: (r0 + r1) / 2, b: belt - 0.1, t: (belt + top) / 2 + 0.06, w: gw, wt: (gw + roofW) / 2, n: 4 },
    { z: r1, b: belt - 0.1, t: top, w: gw, wt: roofW, n: 4 },
    { z: f1, b: belt - 0.1, t: top, w: gw, wt: roofW, n: 4 },
    { z: (f0 + f1) / 2, b: belt - 0.1, t: (belt + top) / 2 + 0.06, w: gw, wt: (gw + roofW) / 2, n: 4 },
    { z: f0, b: belt - 0.1, t: belt + 0.01, w: gw, wt: gw, n: 4 },
  ];
  // One shell for the cabin: glass all round, the roof in body colour.
  k.add(loft(gl, 28, (x, y) => (y > top - 0.07 ? c : GLASS)), null);
  for (const sx of [-1, 1]) {
    if (s.bPillar !== false) k.add(boxG(0.05, top - belt - 0.1, 0.1, sx * (THREE.MathUtils.lerp(gw, roofW, 0.5) + 0.03), (belt + top) / 2 - 0.05, (r1 + f1) / 2 - 0.1), TRIM);
    // Door handles and the seam line.
    k.add(boxG(0.03, 0.04, 0.2, sx * (W / 2 + 0.005), belt - 0.15, (r1 + f1) / 2 + 0.25), CHROME);
    k.add(boxG(0.02, belt - low - 0.2, 0.02, sx * (W / 2 + 0.003), (belt + low) / 2, (r1 + f1) / 2 - 0.05), 0x000000, true);
  }
  // Grille.
  k.add(boxG(W * 0.42, 0.16, 0.05, 0, (s.lightY ?? hood - 0.25) - 0.08, h - 0.02), TRIM, true);
  wheels(k, W, s.wheel ?? 0.34, s.axles ?? [h - 0.85, -h + 0.85], { rim: s.rim ?? CHROME });
  ends(k, W, L, { y: s.lightY ?? hood - 0.25, round: s.roundLights, bumperY: low + 0.13, bumper: s.bumper ?? TRIM });
  mirrors(k, W, belt + 0.1, f0 - 0.15, c);
  return k;
}

// --- The vehicles ---

// New York yellow cab (a saloon with the roof light) or a plain saloon.
export function sedan(kind, { taxi = false } = {}) {
  const k = car(kind, { belt: 0.98, roof: 1.46, glass: [-1.55, -0.95, 0.35, 0.98] });
  const g = k.build();
  if (taxi) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.26, 0.9), taxiSignMats());
    sign.position.set(0, 1.64, -0.3);
    g.add(sign);
  }
  return g;
}
let signMats;
function taxiSignMats() {
  if (signMats) return signMats;
  const plain = new THREE.MeshStandardMaterial({ color: 0xf4f1e6 });
  const face = new THREE.MeshStandardMaterial({ map: signText('TAXI', { bg: '#fff3b0', fg: '#151515', w: 128, h: 40, font: 'bold 30px sans-serif' }), emissive: 0xfff0a0, emissiveIntensity: 0.35 });
  signMats = [face, face, plain, plain, plain, plain];
  return signMats;
}

// Big black SUV: tall, square, long roof.
export function suv(kind) {
  return car(kind, { n: 6, low: 0.38, belt: 1.18, roof: 1.86, hood: 1.12, deck: 1.16, glass: [-2.25, -2.1, 0.45, 1.05], wheel: 0.42, tumble: 0.88, axles: [1.55, -1.55] }).build();
}

// European hatchback: short bonnet, cabin to the back, steep tailgate.
export function hatch(kind) {
  const h = kind.len / 2;
  return car(kind, { n: 4, belt: 0.95, roof: 1.47, deck: 0.98, glass: [-h + 0.12, -h + 0.32, 0.3, 0.95], wheel: 0.31, axles: [h - 0.68, -h + 0.66] }).build();
}

// Napoli's little round car in the style of the classic 500: a bubble cabin, round lamps.
export function bubble(kind) {
  const h = kind.len / 2;
  const k = car(kind, { n: 2.6, low: 0.26, belt: 0.86, hood: 0.8, deck: 0.82, roof: 1.42, glass: [-h + 0.45, -h + 0.95, 0.3, 0.85],
    wheel: 0.27, roundLights: true, lightY: 0.62, tumble: 0.82, axles: [h - 0.55, -h + 0.55], bumper: CHROME, rim: 0xe8e2d4 });
  // Canvas sunroof and a chrome strip on the bonnet.
  k.add(boxG(0.6, 0.03, 0.8, 0, 1.425, -0.15), 0x2b2b2b, true);
  k.add(boxG(0.05, 0.03, 0.8, 0, 0.81, h - 0.5), CHROME);
  return k.build();
}

// The Ape three-wheeler: a little cab with one front wheel and a flat bed behind.
export function ape(kind) {
  const k = new Kit();
  const L = kind.len, W = kind.w, c = kind.color, h = L / 2;
  const cab = [h - 1.25, h];
  k.add(loft([
    { z: cab[0], b: 0.35, t: 1.75, w: W / 2 - 0.05, wt: W / 2 - 0.18, n: 3.5 },
    { z: cab[0] + 0.15, b: 0.32, t: 1.85, w: W / 2, wt: W / 2 - 0.12, n: 3.5 },
    { z: h - 0.35, b: 0.32, t: 1.8, w: W / 2, wt: W / 2 - 0.15, n: 3.5 },
    { z: h - 0.08, b: 0.38, t: 1.45, w: W / 2 - 0.12, wt: W / 2 - 0.3, n: 3 },
    { z: h, b: 0.5, t: 1.1, w: W / 2 - 0.25, n: 3 },
  ], 18), c);
  // Windscreen and side windows.
  k.add(loft([{ z: h - 0.5, b: 1.05, t: 1.7, w: W / 2 - 0.06, wt: W / 2 - 0.2, n: 4 }, { z: h - 0.1, b: 1.05, t: 1.42, w: W / 2 - 0.13, wt: W / 2 - 0.3, n: 4 }], 14), GLASS);
  for (const sx of [-1, 1]) k.add(boxG(0.02, 0.45, 0.55, sx * (W / 2 + 0.005), 1.35, h - 0.75), GLASS);
  // Flat bed with low sides and a tarp-covered load.
  const bedL = L - 1.35, bz = -h + bedL / 2;
  k.add(boxG(W, 0.12, bedL, 0, 0.75, bz), 0x5a5f63, true);
  for (const sx of [-1, 1]) k.add(boxG(0.06, 0.4, bedL, sx * (W / 2 - 0.03), 1.0, bz), c);
  k.add(boxG(W, 0.4, 0.06, 0, 1.0, -h + 0.03), c);
  k.add(rounded(W - 0.25, 0.5, bedL - 0.3, 0, 1.15, bz, 3), 0x3f6b48, true);
  // Wheels: one at the front, two at the back.
  k.add(at(new THREE.CylinderGeometry(0.28, 0.28, 0.18, 14).rotateZ(Math.PI / 2), 0, 0.28, h - 0.45), RUBBER, true);
  k.add(at(new THREE.CylinderGeometry(0.17, 0.17, 0.2, 10).rotateZ(Math.PI / 2), 0, 0.28, h - 0.45), CHROME);
  wheels(k, W, 0.28, [-h + 0.6], { width: 0.18, arch: false });
  k.add(at(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 10).rotateX(Math.PI / 2), 0, 1.2, h + 0.01), HEAD);
  for (const sx of [-1, 1]) k.add(boxG(0.14, 0.1, 0.05, sx * (W / 2 - 0.15), 0.85, -h - 0.01), TAIL);
  return k.build();
}

// The "deux chevaux": arched roof, separate round mudguards, headlamps on stalks.
export function deuxChevaux(kind) {
  const k = new Kit();
  const L = kind.len, W = kind.w, c = kind.color, h = L / 2;
  k.add(loft([
    { z: -h, b: 0.4, t: 0.9, w: W / 2 - 0.25, n: 2.5 },
    { z: -h + 0.3, b: 0.36, t: 1.05, w: W / 2 - 0.1, n: 3 },
    { z: -0.2, b: 0.36, t: 1.0, w: W / 2 - 0.1, n: 3 },
    { z: h - 1.0, b: 0.36, t: 0.98, w: W / 2 - 0.12, n: 3 },
    { z: h - 0.25, b: 0.42, t: 0.82, w: W / 2 - 0.3, n: 2.5 },
    { z: h, b: 0.5, t: 0.66, w: W / 2 - 0.4, n: 2.2 },
  ]), c);
  // The tall rounded cabin, glass all round under a fabric roof.
  k.add(loft([
    { z: -h + 0.35, b: 0.95, t: 1.2, w: W / 2 - 0.14, wt: W / 2 - 0.3, n: 2.5 },
    { z: -h + 0.8, b: 0.95, t: 1.58, w: W / 2 - 0.12, wt: W / 2 - 0.3, n: 2.5 },
    { z: 0.4, b: 0.95, t: 1.62, w: W / 2 - 0.12, wt: W / 2 - 0.3, n: 2.5 },
    { z: h - 0.95, b: 0.95, t: 1.1, w: W / 2 - 0.13, wt: W / 2 - 0.25, n: 3 },
  ], 16), GLASS);
  k.add(loft([
    { z: -h + 0.62, b: 1.5, t: 1.63, w: W / 2 - 0.28, n: 3 },
    { z: 0.3, b: 1.55, t: 1.67, w: W / 2 - 0.28, n: 3 },
  ], 12), 0x3a3a3a, true);
  for (const z of [h - 0.65, -h + 0.7]) {
    for (const sx of [-1, 1]) {
      const guard = new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.42, 0.75, 1.15);
      k.add(at(guard, sx * (W / 2 - 0.2), 0.45, z), c);
    }
  }
  wheels(k, W, 0.33, [h - 0.65, -h + 0.7], { rim: 0xe6e0cc, width: 0.2, arch: false });
  for (const sx of [-1, 1]) {
    k.add(at(new THREE.SphereGeometry(0.13, 10, 8), sx * 0.45, 0.98, h - 0.42), HEAD);
    k.add(boxG(0.03, 0.2, 0.03, sx * 0.45, 0.85, h - 0.45), TRIM, true);
    k.add(boxG(0.1, 0.1, 0.04, sx * (W / 2 - 0.3), 0.75, -h + 0.02), TAIL);
  }
  k.add(boxG(0.5, 0.3, 0.04, 0, 0.7, h - 0.03), 0x9a9fa3);
  k.add(rounded(W * 0.85, 0.12, 0.12, 0, 0.42, h + 0.02), CHROME);
  k.add(rounded(W * 0.85, 0.12, 0.12, 0, 0.42, -h - 0.02), CHROME);
  return k.build();
}

// Delivery van or box truck: a rounded cab and a tall box body.
export function boxTruck(kind) {
  const k = new Kit();
  const L = kind.len, W = kind.w, H = kind.h, h = L / 2;
  const cabL = 2.0, c0 = h - cabL;
  k.add(loft([
    { z: c0, b: 0.45, t: H - 0.35, w: W / 2 - 0.05, n: 6 },
    { z: h - 0.7, b: 0.45, t: H - 0.4, w: W / 2 - 0.05, wt: W / 2 - 0.15, n: 6 },
    { z: h - 0.15, b: 0.45, t: 1.45, w: W / 2 - 0.08, n: 5 },
    { z: h, b: 0.5, t: 1.3, w: W / 2 - 0.15, n: 4 },
  ]), 0xeeeeea);
  k.add(loft([
    { z: h - 0.75, b: 1.4, t: H - 0.5, w: W / 2 - 0.02, wt: W / 2 - 0.13, n: 5 },
    { z: h - 0.2, b: 1.4, t: 1.5, w: W / 2 - 0.06, wt: W / 2 - 0.08, n: 5 },
  ], 14), GLASS);
  for (const sx of [-1, 1]) k.add(boxG(0.02, 0.6, 0.8, sx * (W / 2 - 0.035), H - 0.95, c0 + 0.85), GLASS);
  k.add(rounded(W, H - 0.55, L - cabL - 0.1, 0, 0.55 + (H - 0.55) / 2, -h + (L - cabL - 0.1) / 2, 10), kind.color);
  k.add(boxG(W - 0.2, 0.1, L - cabL - 0.3, 0, H + 0.02, -h + (L - cabL) / 2), 0xd8d8d4);
  wheels(k, W, 0.44, [h - 0.9, -h + 1.0, -h + 1.95]);
  ends(k, W, L, { y: 0.95, bumperY: 0.5 });
  mirrors(k, W, H - 0.9, h - 0.8, TRIM);
  return k.build();
}

// City bus: long rounded body, a band of windows, a lit destination sign. `stripe` colours a band
// under the windows (New York blue, Paris jade, Napoli none).
export function bus(kind, { stripe = 0x1d5fbf, roof = 0xf0f0f0, sign = 'M15 BROADWAY' } = {}) {
  const k = new Kit();
  const L = kind.len, W = kind.w, H = kind.h, h = L / 2;
  const body = (b, t, inset = 0) => loft([
    { z: -h, b: b + 0.05, t: t - 0.05, w: W / 2 - 0.08 - inset, n: 8 },
    { z: -h + 0.15, b, t, w: W / 2 - inset, n: 8 },
    { z: h - 0.2, b, t, w: W / 2 - inset, n: 8 },
    { z: h, b: b + 0.05, t: t - 0.12, w: W / 2 - 0.1 - inset, n: 8 },
  ], 20);
  k.add(body(0.35, H), kind.color);
  k.add(body(H * 0.45, H * 0.85, -0.015), GLASS);
  if (stripe !== null) k.add(body(H * 0.3, H * 0.38, -0.02), stripe);
  k.add(rounded(W - 0.5, 0.3, L * 0.45, 0, H + 0.12, -h * 0.25, 6), roof, true);
  // Doors: dark panels on the kerb side (+x).
  for (const z of [h - 1.3, -0.5]) k.add(boxG(0.03, H * 0.75, 1.2, W / 2 + 0.01, 0.35 + H * 0.37, z), 0x2a3440);
  wheels(k, W, 0.5, [h - 2.2, -h + 2.6], { rim: 0xb9bdc0, width: 0.3 });
  ends(k, W, L, { y: 0.8, headW: 0.34, bumperY: 0.45 });
  const g = k.build();
  const dest = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.6, 0.32),
    new THREE.MeshBasicMaterial({ map: signText(sign, { bg: '#111', fg: '#ffb020', w: 256, h: 36, font: 'bold 24px monospace' }) }));
  dest.position.set(0, H - 0.3, h + 0.02);
  g.add(dest);
  return g;
}
