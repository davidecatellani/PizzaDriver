import * as THREE from 'three';
import { CELL, STREET } from './config.js';

// Shared layout and geometry helpers for the city builders (src/world.js, src/cities/*.js).
// Every city uses the same street grid; what changes is how its blocks are dressed.

export const HALF = STREET / 2;
export const ALLEY_HALF = 2.7;     // half-width of a secret alley between the buildings

// The big landmark block covering blocks (2..3, 2..3), with a secret passage through it along
// z = 3*CELL (Napoli's palazzo tunnel, the ride under the Eiffel Tower, a path across a park).
export const PALAZZO = { minX: 2 * CELL + HALF, maxX: 4 * CELL - HALF, minZ: 2 * CELL + HALF, maxZ: 4 * CELL - HALF };
const TUNNEL_HALF = 3.6;
export const TUNNEL = { minX: PALAZZO.minX, maxX: PALAZZO.maxX, minZ: 3 * CELL - TUNNEL_HALF, maxZ: 3 * CELL + TUNNEL_HALF };
export const inPalazzo = (bi, bj) => bi >= 2 && bi <= 3 && bj >= 2 && bj <= 3;

// UVs from world position, for tiled surfaces (pavement, ground).
export function worldUVs(geo, scale) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    if (ay > 0.5) uv.setXY(i, p.getX(i) / scale, p.getZ(i) / scale);
    else if (ax > 0.5) uv.setXY(i, p.getZ(i) / scale, p.getY(i) / scale);
    else uv.setXY(i, p.getX(i) / scale, p.getY(i) / scale);
  }
}

// Box UVs so each side face shows a whole number of bays across and `rows` across the height.
// Roof and floor get a plain texel.
export function bayUVs(geo, w, d, bay, rows) {
  const uv = geo.attributes.uv;
  const widths = [d, d, 0, 0, w, w];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      if (!widths[f]) uv.setXY(k, 0.5, 0.01);
      else uv.setXY(k, uv.getX(k) * Math.max(1, Math.round(widths[f] / bay)), uv.getY(k) * rows);
    }
  }
}

// A box geometry placed at (x, y, z) with a flat vertex colour, ready to merge.
export function coloredBox(w, h, d, x, y, z, color, uvFix) {
  const geo = new THREE.BoxGeometry(w, h, d);
  uvFix?.(geo);
  geo.translate(x, y, z);
  return paint(geo, color);
}

// Gives every vertex of `geo` one colour (for merged, vertex-coloured meshes).
export function paint(geo, color) {
  const c = new THREE.Color(color);
  const cols = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < cols.length; i += 3) { cols[i] = c.r; cols[i + 1] = c.g; cols[i + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return geo;
}

// Seeded random numbers, so a city is the same every time it is built.
export function seeded(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

// A box geometry turned about y by `rotY` (and tilted about x by `rotX`) at (x, y, z), painted.
export function turnedBox(w, h, d, x, y, z, color, rotY = 0, rotX = 0) {
  const geo = new THREE.BoxGeometry(w, h, d);
  if (rotX) geo.rotateX(rotX);
  if (rotY) geo.rotateY(rotY);
  geo.translate(x, y, z);
  return paint(geo, color);
}

// Leafy trees as two instanced meshes (trunks, crowns). `spots`: [{x, z, s}] with s a size scale.
export function addTrees(scene, spots, { trunk = 0x5a4632, leaf = 0x4f7a34, height = 6, seed = 5 } = {}) {
  const rnd = seeded(seed);
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, height * 0.55, 6).translate(0, height * 0.275, 0);
  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: trunk, roughness: 1 }), spots.length);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }), spots.length * 3);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), base = new THREE.Color(leaf), c = new THREE.Color();
  spots.forEach((p, i) => {
    const s = p.s ?? 1;
    m4.compose(new THREE.Vector3(p.x, 0.3, p.z), q, new THREE.Vector3(s, s, s));
    trunks.setMatrixAt(i, m4);
    for (let k = 0; k < 3; k++) {
      const r = height * 0.3 * s * (0.8 + rnd() * 0.4);
      const off = new THREE.Vector3((rnd() - 0.5) * r, height * 0.62 * s + (rnd() - 0.2) * r * 0.6, (rnd() - 0.5) * r);
      q.setFromEuler(new THREE.Euler(rnd(), rnd() * 6, 0));
      m4.compose(off.add(new THREE.Vector3(p.x, 0.3, p.z)), q, new THREE.Vector3(r, r * 0.85, r));
      crowns.setMatrixAt(i * 3 + k, m4);
      crowns.setColorAt(i * 3 + k, c.copy(base).offsetHSL((rnd() - 0.5) * 0.04, 0, (rnd() - 0.5) * 0.12));
    }
    q.identity();
  });
  trunks.castShadow = crowns.castShadow = true;
  crowns.receiveShadow = true;
  scene.add(trunks, crowns);
}

// Flat textured ground patch (grass, gravel, a square) at height y.
export function patch(scene, minX, maxX, minZ, maxZ, y, material, tile) {
  const geo = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ);
  geo.rotateX(-Math.PI / 2);
  geo.translate((minX + maxX) / 2, y, (minZ + maxZ) / 2);
  worldUVs(geo, tile);
  const m = new THREE.Mesh(geo, material);
  m.receiveShadow = true;
  scene.add(m);
  return m;
}

// Soft see-through sheets hanging across an opening, that riders pass straight through
// (laundry, construction netting, market tarps). `across` 'x' or 'z' is the direction the row runs.
export function curtain(scene, cx, cz, across, width, height, colors, { y = 0.3, opacity = 1 } = {}) {
  const n = Math.max(2, Math.round(width / 1.8)), pw = width / n;
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(pw * 0.97, height),
      new THREE.MeshStandardMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, roughness: 1, transparent: opacity < 1, opacity }));
    const t = -width / 2 + pw * (i + 0.5);
    if (across === 'x') m.position.set(cx + t, y + height / 2, cz);
    else { m.position.set(cx, y + height / 2, cz + t); m.rotation.y = Math.PI / 2; }
    scene.add(m);
  }
}
