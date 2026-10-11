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
