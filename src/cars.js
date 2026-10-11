import * as THREE from 'three';
import { mat } from './assets.js';
import { signText } from './textures.js';

// Traffic vehicles drawn in code: a side profile extruded across the car's width, rounded off,
// with a glass greenhouse, wheels and lights. Length runs along +z (the front), width along x.
// Each builder takes the traffic kind ({ len, w, h, color }) and returns a Group.

const glassMat = () => new THREE.MeshStandardMaterial({ color: 0x1b252e, roughness: 0.15, metalness: 0.6 });
const tyreGeo = new THREE.CylinderGeometry(1, 1, 1, 16).rotateZ(Math.PI / 2);
const hubGeo = new THREE.CylinderGeometry(1, 1, 1, 10).rotateZ(Math.PI / 2);

// Extrudes a side profile ([z, y] points, or a Shape) across `width`, centred on x = 0.
function profile(pts, width, color, { bevel = 0.08, material } = {}) {
  let shape = pts;
  if (Array.isArray(pts)) {
    shape = new THREE.Shape();
    pts.forEach(([z, y], i) => (i ? shape.lineTo(z, y) : shape.moveTo(z, y)));
  }
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 8,
  });
  geo.translate(0, 0, -(width - bevel * 2) / 2);
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material || mat(color, { roughness: 0.35, metalness: 0.35 }));
}

function wheels(g, kind, r, zs, { hub = 0xc9cdd1, inset = 0.05 } = {}) {
  const tyreM = mat(0x161616, { roughness: 0.9 }), hubM = mat(hub, { roughness: 0.3, metalness: 0.8 });
  for (const z of zs) {
    for (const sx of [-1, 1]) {
      const t = new THREE.Mesh(tyreGeo, tyreM);
      t.scale.set(0.26, r, r);
      t.position.set(sx * (kind.w / 2 - 0.13 - inset), r, z);
      const h = new THREE.Mesh(hubGeo, hubM);
      h.scale.set(0.28, r * 0.55, r * 0.55);
      h.position.copy(t.position);
      g.add(t, h);
    }
  }
}

function lights(g, kind, front, rear, y, { spread = 0.36 } = {}) {
  const head = new THREE.MeshStandardMaterial({ color: 0xfff6dc, emissive: 0xfff2c0, emissiveIntensity: 1.2 });
  const tail = new THREE.MeshStandardMaterial({ color: 0xb01010, emissive: 0xff2020, emissiveIntensity: 0.8 });
  for (const sx of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), head);
    h.position.set(sx * kind.w * spread, y, front);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.06), tail);
    t.position.set(sx * kind.w * spread, y + 0.05, rear);
    g.add(h, t);
  }
}

function finish(g) {
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// Saloon: long bonnet, glass greenhouse, boot. `taxi` adds New York's roof light.
export function sedan(kind, { taxi = false, suv = false } = {}) {
  const g = new THREE.Group();
  const L = kind.len / 2, top = suv ? 1.85 : 1.48, belt = suv ? 1.15 : 0.98, low = suv ? 0.42 : 0.32;
  g.add(profile([[-L, low], [L, low], [L, belt - 0.12], [L - 0.85, belt], [0.95, belt + 0.02], [0.3, top], [-1.05, top],
    [suv ? -L + 0.05 : -1.55, belt + (suv ? 0.5 : 0.04)], [-L, belt - 0.05]], kind.w, kind.color));
  // Greenhouse: a little proud of the body so the windows show.
  g.add(profile([[0.97, belt], [0.32, top - 0.03], [-1.07, top - 0.03], [suv ? -L + 0.03 : -1.57, belt + (suv ? 0.5 : 0.04)], [suv ? -L + 0.03 : -1.57, belt]],
    kind.w + 0.03, 0, { bevel: 0.04, material: glassMat() }));
  wheels(g, kind, suv ? 0.42 : 0.36, [L - 0.85, -L + 0.85]);
  lights(g, kind, L + 0.01, -L - 0.01, belt - 0.22);
  if (taxi) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.32), [
      mat(0xf4f1e6), mat(0xf4f1e6), mat(0xf4f1e6), mat(0xf4f1e6),
      new THREE.MeshStandardMaterial({ map: signText('TAXI', { bg: '#fff6c8', fg: '#111', w: 128, h: 48, font: 'bold 34px sans-serif' }), emissive: 0xfff2b0, emissiveIntensity: 0.5 }),
      new THREE.MeshStandardMaterial({ map: signText('TAXI', { bg: '#fff6c8', fg: '#111', w: 128, h: 48, font: 'bold 34px sans-serif' }), emissive: 0xfff2b0, emissiveIntensity: 0.5 }),
    ]);
    sign.rotation.y = Math.PI / 2;
    sign.position.set(0, top + 0.16, -0.35);
    // A black-and-white check band along the doors.
    const band = new THREE.Mesh(new THREE.BoxGeometry(kind.w + 0.04, 0.1, 2.2), mat(0x111111));
    band.position.set(0, belt - 0.2, -0.1);
    g.add(sign, band);
  }
  return finish(g);
}

// Small European hatchback: short bonnet, steep tailgate.
export function hatch(kind) {
  const g = new THREE.Group();
  const L = kind.len / 2;
  g.add(profile([[-L, 0.3], [L, 0.3], [L, 0.82], [L - 0.7, 0.98], [0.7, 1.0], [0.05, 1.5], [-L + 0.25, 1.5], [-L, 1.05]], kind.w, kind.color));
  g.add(profile([[0.72, 0.98], [0.07, 1.47], [-L + 0.27, 1.47], [-L + 0.02, 1.07], [-L + 0.02, 0.98]], kind.w + 0.03, 0, { bevel: 0.04, material: glassMat() }));
  wheels(g, kind, 0.32, [L - 0.65, -L + 0.65]);
  lights(g, kind, L + 0.01, -L - 0.01, 0.75);
  return finish(g);
}

// The Citroën-style "deux chevaux": round roof, separate mudguards, headlamps on stalks.
export function deuxChevaux(kind) {
  const g = new THREE.Group();
  const L = kind.len / 2;
  const s = new THREE.Shape();
  s.moveTo(-L, 0.38);
  s.lineTo(L, 0.38);
  s.lineTo(L, 0.62);
  s.quadraticCurveTo(L - 0.1, 0.85, L - 0.8, 0.98);
  s.lineTo(0.55, 1.02);
  s.quadraticCurveTo(-0.1, 1.68, -1.0, 1.5);
  s.quadraticCurveTo(-L, 1.25, -L, 0.6);
  g.add(profile(s, kind.w - 0.2, kind.color, { bevel: 0.12 }));
  const w = new THREE.Shape();
  w.moveTo(0.52, 1.02); w.quadraticCurveTo(-0.08, 1.6, -0.95, 1.46); w.lineTo(-0.98, 1.02);
  g.add(profile(w, kind.w - 0.14, 0, { bevel: 0.03, material: glassMat() }));
  // Mudguards over each wheel.
  for (const z of [L - 0.6, -L + 0.65]) {
    for (const sx of [-1, 1]) {
      const guard = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(kind.color, { roughness: 0.4, metalness: 0.3 }));
      guard.scale.set(0.42, 0.8, 1.1);
      guard.position.set(sx * (kind.w / 2 - 0.2), 0.42, z);
      g.add(guard);
    }
  }
  wheels(g, kind, 0.34, [L - 0.6, -L + 0.65], { hub: 0xe8e2d0, inset: 0.12 });
  for (const sx of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshStandardMaterial({ color: 0xfff6dc, emissive: 0xfff2c0, emissiveIntensity: 1 }));
    lamp.position.set(sx * 0.42, 0.95, L - 0.35);
    g.add(lamp);
  }
  return finish(g);
}

// Delivery van or box truck: a cab and a tall box.
export function boxTruck(kind) {
  const g = new THREE.Group();
  const L = kind.len / 2;
  g.add(profile([[L - 2.2, 0.45], [L, 0.45], [L, 1.4], [L - 0.5, 2.3], [L - 2.2, 2.45]], kind.w, 0xe8e8e4));
  g.add(profile([[L - 0.03, 1.45], [L - 0.52, 2.25], [L - 1.6, 2.38], [L - 1.6, 1.45]], kind.w + 0.03, 0, { bevel: 0.03, material: glassMat() }));
  const body = new THREE.Mesh(new THREE.BoxGeometry(kind.w, kind.h - 0.5, kind.len - 2.3), mat(kind.color, { roughness: 0.6 }));
  body.position.set(0, 0.5 + (kind.h - 0.5) / 2, -1.15);
  g.add(body);
  wheels(g, kind, 0.45, [L - 1.0, -L + 1.2, -L + 2.2]);
  lights(g, kind, L + 0.01, -L - 0.01, 0.9);
  return finish(g);
}

// City bus: rounded box with a band of windows and a lit destination sign.
// `stripe` colours a band under the windows (New York blue, Paris jade green).
export function bus(kind, { stripe = 0x1d5fbf, roof = 0xf4f4f4, sign = 'M15 BROADWAY' } = {}) {
  const g = new THREE.Group();
  const L = kind.len / 2, H = kind.h;
  g.add(profile([[-L, 0.35], [L, 0.35], [L, H - 0.2], [L - 0.2, H], [-L + 0.15, H], [-L, H - 0.2]], kind.w, kind.color, { bevel: 0.12 }));
  const win = new THREE.Mesh(new THREE.BoxGeometry(kind.w + 0.04, H * 0.38, kind.len - 1.4), glassMat());
  win.position.set(0, H * 0.62, -0.3);
  const front = new THREE.Mesh(new THREE.BoxGeometry(kind.w - 0.3, H * 0.5, 0.06), glassMat());
  front.position.set(0, H * 0.58, L + 0.02);
  const band = new THREE.Mesh(new THREE.BoxGeometry(kind.w + 0.05, 0.35, kind.len - 0.3), mat(stripe));
  band.position.set(0, H * 0.33, 0);
  const top = new THREE.Mesh(new THREE.BoxGeometry(kind.w - 0.4, 0.25, kind.len * 0.5), mat(roof));
  top.position.set(0, H + 0.12, -0.5);
  const dest = new THREE.Mesh(new THREE.PlaneGeometry(kind.w - 0.5, 0.35),
    new THREE.MeshBasicMaterial({ map: signText(sign, { bg: '#111', fg: '#ffb020', w: 256, h: 40, font: 'bold 26px monospace' }) }));
  dest.position.set(0, H - 0.3, L + 0.03);
  g.add(win, front, band, top, dest);
  wheels(g, kind, 0.5, [L - 1.6, -L + 2.0]);
  lights(g, kind, L + 0.02, -L - 0.02, 0.75, { spread: 0.38 });
  return finish(g);
}
