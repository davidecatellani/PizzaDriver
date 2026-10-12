import * as THREE from 'three';
import { mat } from './assets.js';

// The rides you can buy in the garage, built from primitives. Each builder returns
//   group: the vehicle, front towards +z, standing on y = 0
//   stand: where the rider's feet go ({ y, z })
//   grip:  left handlebar grip in the group's space, or null when the arms are free for balance
//   wheels: meshes spun with the speed (rotation.x), radius in `wheelR`

const tmp = new THREE.Vector3();

// A round tube from a to b.
function tube(a, b, r, color, m) {
  const len = tmp.subVectors(b, a).length();
  const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), m || mat(color, { roughness: 0.4, metalness: 0.5 }));
  t.position.addVectors(a, b).multiplyScalar(0.5);
  t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tmp.normalize());
  return t;
}

function rounded(w, d, r, thick) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2, curveSegments: 6 });
  g.rotateX(Math.PI / 2);
  g.translate(0, thick, 0);
  return g;
}

// Deck graphic: a flame stripe, or a lightning bolt for the hoverboard.
function deckTexture(base, accent, bolt) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 64, 256);
  g.fillStyle = accent;
  if (bolt) {
    g.beginPath(); g.moveTo(40, 20); g.lineTo(18, 130); g.lineTo(34, 130); g.lineTo(22, 236); g.lineTo(48, 110); g.lineTo(32, 110); g.closePath(); g.fill();
  } else {
    for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(8 + k * 12, 250); g.quadraticCurveTo(k * 12, 150 - k * 10, 14 + k * 11, 60 + k * 18); g.lineTo(20 + k * 12, 250); g.fill(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glow(color, intensity = 2) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
}

export function skate() {
  const g = new THREE.Group();
  const deck = new THREE.Mesh(rounded(0.62, 2.0, 0.28, 0.05), [
    new THREE.MeshStandardMaterial({ map: deckTexture('#1b1b20', '#ff6a13'), roughness: 0.8 }),
    mat(0x111111),
  ]);
  deck.position.y = 0.3;
  g.add(deck);
  // Kicktails.
  for (const s of [-1, 1]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.3), mat(0x1b1b20));
    tail.position.set(0, 0.36, s * 1.05);
    tail.rotation.x = s * 0.35;
    g.add(tail);
  }
  // Battery pack with an LED strip, and the two trucks with fat wheels.
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 1.0), mat(0x2a2a30, { roughness: 0.5 }));
  pack.position.y = 0.24;
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.02, 0.9), glow(0x39ff88, 3));
  led.position.y = 0.2;
  g.add(pack, led);
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.14, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const z of [-0.72, 0.72]) {
    const truck = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, 0.08), mat(0xb0b4b8, { metalness: 0.8, roughness: 0.3 }));
    truck.position.set(0, 0.18, z);
    g.add(truck);
    for (const x of [-0.36, 0.36]) {
      const w = new THREE.Mesh(wheelGeo, mat(0xff6a13, { roughness: 0.6 }));
      w.position.set(x, 0.15, z);
      g.add(w);
      wheels.push(w);
    }
  }
  return { group: g, stand: { y: 0.36, z: -0.05 }, grip: null, wheels, wheelR: 0.15 };
}

export function bike() {
  const g = new THREE.Group();
  const R = 0.62;
  const wheels = [];
  const rimMat = mat(0x222226, { metalness: 0.6, roughness: 0.4 });
  for (const z of [-0.95, 1.0]) {
    const w = new THREE.Group();
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(R - 0.07, 0.08, 10, 28), mat(0x151515, { roughness: 0.95 }));
    tyre.rotation.y = Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R - 0.16, 0.025, 6, 28), rimMat);
    rim.rotation.y = Math.PI / 2;
    w.add(tyre, rim);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI;
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.02, 2 * (R - 0.16), 0.02), mat(0xc8c8c8, { metalness: 0.8 }));
      sp.rotation.x = a;
      w.add(sp);
    }
    w.position.set(0, R, z);
    g.add(w);
    wheels.push(w);
  }
  const red = 0xd62828;
  const P = (y, z) => new THREE.Vector3(0, y, z);
  const head = P(1.45, 0.72), seat = P(1.35, -0.38), crank = P(0.5, 0.0), rear = P(R, -0.95), front = P(R, 1.0);
  const frame = mat(red, { roughness: 0.35, metalness: 0.3 });
  g.add(tube(head, crank, 0.07, 0, frame));          // down tube
  g.add(tube(head, seat, 0.05, 0, frame));           // top tube
  g.add(tube(seat, crank, 0.05, 0, frame));          // seat tube
  g.add(tube(crank, rear, 0.035, 0, frame));         // chain stay
  g.add(tube(seat, rear, 0.035, 0, frame));          // seat stay
  g.add(tube(head, front, 0.04, 0x222222));          // fork
  const stem = P(1.85, 0.62);
  g.add(tube(head, stem, 0.04, 0x222222));
  g.add(tube(new THREE.Vector3(-0.38, 1.88, 0.6), new THREE.Vector3(0.38, 1.88, 0.6), 0.03, 0x222222));
  // Battery on the down tube, motor hub, seat, headlight, and a pizza rack over the back wheel.
  const bat = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.7), mat(0x2a2a30, { roughness: 0.5 }));
  bat.position.copy(head).lerp(crank, 0.5);
  bat.position.y += 0.05;
  bat.rotation.x = Math.atan2(head.z - crank.z, head.y - crank.y) - Math.PI / 2;
  g.add(bat);
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.14, 16), mat(0x333338, { metalness: 0.6 }));
  motor.rotation.z = Math.PI / 2;
  motor.position.copy(crank);
  g.add(motor);
  for (const s of [-1, 1]) {
    const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.14), mat(0x111111));
    pedal.position.set(s * 0.2, crank.y - 0.02, crank.z);
    g.add(pedal);
  }
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.07, 0.4), mat(0x1b1b1b));
  saddle.position.copy(seat).add(P(0.1, 0));
  g.add(saddle);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 12), glow(0xfff2c0, 2));
  lamp.rotation.x = Math.PI / 2;
  lamp.position.set(0, 1.6, 0.85);
  g.add(lamp);
  const rack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.6), mat(0x222222, { metalness: 0.5 }));
  rack.position.set(0, 1.4, -0.95);
  g.add(rack, tube(P(1.4, -0.7), seat, 0.02, 0x222222));
  // Modelled big for easy numbers; scaled to a real bike under a 1.8 m rider.
  const k = 0.72;
  g.scale.setScalar(k);
  const out = new THREE.Group();
  out.add(g);
  return { group: out, stand: { y: 0.5 * k, z: 0.12 }, grip: new THREE.Vector3(0.36, 1.88, 0.6).multiplyScalar(k), wheels, wheelR: R * k };
}

export function hover() {
  const g = new THREE.Group();
  const board = new THREE.Mesh(rounded(0.7, 1.9, 0.34, 0.08), [
    new THREE.MeshStandardMaterial({ map: deckTexture('#ef3fae', '#ffe34a', true), roughness: 0.4, metalness: 0.2 }),
    mat(0x2a2a30),
  ]);
  board.position.y = 0.32;
  g.add(board);
  // Two glowing lift pads underneath and a soft halo on the road.
  for (const z of [-0.6, 0.6]) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.1, 20), mat(0x2a2a30, { metalness: 0.6 }));
    pad.position.set(0, 0.27, z);
    const light = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), glow(0x52c8ff, 4));
    light.rotation.x = Math.PI / 2;
    light.position.set(0, 0.215, z);
    g.add(pad, light);
  }
  const halo = new THREE.Mesh(new THREE.CircleGeometry(0.6, 24), new THREE.MeshBasicMaterial({
    color: 0x52c8ff, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.02;
  halo.scale.y = 1.5;   // stretched along the board (local y lies along z once flat)
  halo.castShadow = false;
  halo.userData.noShadow = true;
  g.add(halo);
  return { group: g, stand: { y: 0.42, z: 0 }, grip: null, wheels: [], wheelR: 1, halo };
}

export const BUILDERS = { skate, bike, hover };
