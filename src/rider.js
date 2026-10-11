import * as THREE from 'three';
import { box, mat, makeObject, hasModel } from './assets.js';
import { rigModel } from './rig.js';
import { BUILDERS } from './vehicles.js';

// Rider standing on an electric kick scooter, or a character model that already sits on its own
// vehicle. Meshy characters get a procedural skeleton (src/rig.js), reachable as userData.rig.
// `look` (the player only): { ride, helmet, jacket } from the garage (src/shop.js).
export function makeRider(shirt = 0xffffff, cap = 0xd62828, riderId = 'rider', look = null) {
  const g = new THREE.Group();
  const ownVehicle = riderId === 'rival_1' && hasModel(riderId);

  if (ownVehicle) {
    const body = makeObject(riderId, 2.6, () => null, { vehicle: true });
    g.add(body);
    g.userData.rig = rigModel(body);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  const ride = look && BUILDERS[look.ride]?.();
  const scooter = ride ? ride.group : makeObject('kick_scooter', 2.0, () => {
    const s = new THREE.Group();
    const deck = box(0.6, 0.15, 2.2, 0x1b1b1f); deck.position.y = 0.35; s.add(deck);
    const stem = box(0.12, 1.9, 0.12, 0x2a2a2e); stem.position.set(0, 1.3, 1.0); stem.rotation.x = -0.15; s.add(stem);
    const bar = box(1.0, 0.1, 0.1, 0x39ff88); bar.position.set(0, 2.2, 1.12); s.add(bar);
    for (const z of [-0.95, 0.95]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.18, 12), mat(0x111111));
      w.rotation.z = Math.PI / 2; w.position.set(0, 0.28, z); s.add(w);
    }
    return s;
  }, { vehicle: true, tallFront: true });
  g.add(scooter);
  g.userData.ride = ride;

  const body = makeObject(riderId, 1.8, () => {
    const r = new THREE.Group();
    const legs = box(0.45, 0.8, 0.3, 0x2b3a67); legs.position.y = 0.4; r.add(legs);
    const torso = box(0.6, 0.7, 0.35, shirt); torso.position.y = 1.15; r.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), mat(0xf1c27d));
    head.position.y = 1.75; r.add(head);
    const capM = box(0.5, 0.15, 0.6, cap); capM.position.set(0, 1.97, 0.08); r.add(capM);
    const pizza = box(0.8, 0.22, 0.8, 0xe9d3a8); pizza.position.set(0, 1.25, -0.35); r.add(pizza);
    return r;
  });
  body.position.set(0, ride ? ride.stand.y : hasModel('kick_scooter') ? 0.3 : 0.45, ride ? ride.stand.z : 0);
  g.add(body);

  if (hasModel(riderId)) {
    // Stand behind the handlebar and hold its grips; on a board, hold the arms out for balance.
    g.updateMatrixWorld(true);
    const bar = ride ? ride.grip ?? new THREE.Vector3(0.75, 1.5, 0.1) : handlebar(scooter).setX(0.3);
    if (!ride) body.position.z = THREE.MathUtils.clamp(bar.z - 0.68, -0.4, 0.5);
    const rig = rigModel(body);
    if (rig) {
      body.updateMatrixWorld(true);
      rig.setGrips(rig.model.worldToLocal(g.localToWorld(bar.clone())));
      g.userData.rig = rig;
      if (look) dress(rig, look);
    }
  }

  g.traverse((o) => { if (o.isMesh && !o.userData.noShadow) o.castShadow = true; });
  return g;
}

// Garage style on a rigged rider: a helmet on the head bone, the shirt recoloured, and the
// thermal delivery bag on the back.
function dress(rig, look) {
  const m = rig.m;
  const h = look.helmet;
  if (h && h.color !== undefined) rig.b.head.add(helmet(rig, h));

  // Delivery bag on the back, hung from the chest bone.
  if (rig.b.chest && !m.seated) {
    const s = m.H * 0.2;
    const bag = new THREE.Mesh(new THREE.BoxGeometry(s * 1.35, s * 1.25, s * 0.8), [
      mat(0xc8302c), mat(0xc8302c), mat(0xc8302c), mat(0xc8302c), mat(0xc8302c), new THREE.MeshStandardMaterial({ map: bagLogo(), roughness: 0.7 }),
    ]);
    bag.position.set(0, -s * 0.15, -m.H * 0.09 - s * 0.4);
    rig.b.chest.add(bag);
  }

  const j = look.jacket;
  if (j && j.color !== null && rig.mesh) {
    // Recolour the light, unsaturated parts of the shirt region (the white tee), keeping its shading.
    const material = rig.mesh.material.clone();
    const color = new THREE.Color(j.color);
    material.onBeforeCompile = (sh) => {
      sh.uniforms.jacket = { value: color };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float cloth;\nvarying float vCloth;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCloth = cloth;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 jacket;\nvarying float vCloth;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
          float sat = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)) - min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
          float shirt = clamp(vCloth, 0.0, 1.0) * smoothstep(0.3, 0.5, lum) * (1.0 - smoothstep(0.08, 0.2, sat));
          diffuseColor.rgb = mix(diffuseColor.rgb, jacket * (0.35 + 0.75 * lum), shirt);`);
    };
    material.customProgramCacheKey = () => 'jacket';
    rig.mesh.material = material;
  }
}

// A cycling helmet fitted to this model's head: an ellipsoid shell sized from the skull (not the
// cap's brim), its rim higher at the brow than at the nape, with vents, a peak and chin straps.
// Built in the head bone's space so it turns with the head.
function helmet(rig, h) {
  const m = rig.m;
  const pos = rig.mesh.geometry.attributes.position;
  const v = new THREE.Vector3();
  let top = -Infinity, back = Infinity, front = -Infinity, half = 0;
  const skullY = m.neckY + 0.25 * (m.minY + m.H - m.neckY);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    if (v.y < m.neckY || Math.abs(v.x) > m.sx * 1.6) continue;
    top = Math.max(top, v.y);
    if (v.y > skullY) { back = Math.min(back, v.z); front = Math.max(front, v.z); half = Math.max(half, Math.abs(v.x)); }
  }
  const headH = top - m.neckY;
  const rx = half * 1.1, ry = rx * 0.95, rz = rx * 1.18;
  const bone = rig.b.head.getWorldPosition(new THREE.Vector3()).applyMatrix4(rig.model.matrixWorld.clone().invert());
  const centre = new THREE.Vector3(0, top + 0.03 * headH - ry, back - 0.02 * headH + rz).sub(bone);

  const g = new THREE.Group();
  const shellGeo = new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.6);
  shellGeo.rotateX(-0.32);   // rim up over the brow, down over the nape
  shellGeo.scale(rx, ry, rz);
  const finish = h.metal ? { metalness: 0.85, roughness: 0.22 } : { roughness: 0.3, metalness: 0.05 };
  const shell = new THREE.Mesh(shellGeo, new THREE.MeshStandardMaterial({ map: helmetTexture(h), side: THREE.DoubleSide, ...finish }));
  g.add(shell);
  // Peak over the brow (it also hides the cap's brim underneath).
  const reach = Math.max(0.25 * rz, front - (back + 2 * rz) + 0.06 * headH);
  const peakGeo = new THREE.CircleGeometry(1, 20, 0, Math.PI);
  peakGeo.rotateX(-Math.PI / 2);
  const peak = new THREE.Mesh(peakGeo, new THREE.MeshStandardMaterial({ color: h.visor ? 0x1a2430 : h.color, side: THREE.DoubleSide, roughness: 0.4, metalness: h.visor ? 0.5 : 0 }));
  peak.scale.set(rx * 0.86, 1, reach + rz * 0.5);
  peak.rotation.x = 0.12;
  peak.position.set(0, -ry * 0.2, rz * 0.55);
  g.add(peak);
  // Chin straps from the rim to under the jaw.
  for (const sx of [-1, 1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.02 * headH, 0.62 * headH, 0.035 * headH), mat(0x1c1c1c));
    strap.position.set(sx * rx * 0.86, -ry * 0.62, rz * 0.12);
    strap.rotation.x = 0.25;
    strap.rotation.z = -sx * 0.12;
    g.add(strap);
  }
  g.position.copy(centre);
  return g;
}

// Shell texture: around = u (front at 0.25), crown at the top rows, rim at the bottom.
function helmetTexture(h) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  if (h.pizza) {
    g.drawImage(pizzaTexture().image, 0, 0, 256, 128);
    g.drawImage(pizzaTexture().image, 256, 0, 256, 128);
  } else {
    g.fillStyle = `#${h.color.toString(16).padStart(6, '0')}`;
    g.fillRect(0, 0, 512, 128);
    // Soft highlight band, then the stripe for the Napoli helmet.
    const shade = g.createLinearGradient(0, 0, 0, 128);
    shade.addColorStop(0, 'rgba(255,255,255,0.18)');
    shade.addColorStop(1, 'rgba(0,0,0,0.18)');
    g.fillStyle = shade;
    g.fillRect(0, 0, 512, 128);
    if (h.stripe) {
      g.fillStyle = `#${h.stripe.toString(16).padStart(6, '0')}`;
      for (const u of [0.25, 0.75]) g.fillRect(u * 512 - 9, 0, 18, 128);
    }
  }
  // Vents: dark slots front to back, either side of the centre line.
  g.fillStyle = 'rgba(15,15,18,0.9)';
  for (const u of [0.17, 0.33, 0.67, 0.83]) {
    for (const [y0, y1] of [[20, 70]]) {
      g.beginPath();
      g.roundRect(u * 512 - 7, y0, 14, y1 - y0, 7);
      g.fill();
    }
  }
  for (const u of [0.0, 0.5]) { g.beginPath(); g.roundRect(u * 512 - 6, 30, 12, 50, 6); g.fill(); g.beginPath(); g.roundRect(512 - 6, 30, 12, 50, 6); g.fill(); }
  // Rim trim.
  g.fillStyle = '#1c1c1c';
  g.fillRect(0, 118, 512, 10);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let pizzaTex;
// Margherita all over: crust round the rim, tomato, mozzarella and basil.
function pizzaTexture() {
  if (pizzaTex) return pizzaTex;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#d43a22'; g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#c98a3f'; g.fillRect(0, 112, 256, 16);   // crust at the brim
  for (let k = 0; k < 26; k++) {
    g.fillStyle = k % 4 === 0 ? '#3f8f3a' : '#fbf3dc';
    g.beginPath();
    g.ellipse((k * 53) % 256, 10 + ((k * 37) % 95), k % 4 === 0 ? 6 : 13, k % 4 === 0 ? 4 : 10, k, 0, Math.PI * 2);
    g.fill();
  }
  pizzaTex = new THREE.CanvasTexture(c);
  pizzaTex.colorSpace = THREE.SRGBColorSpace;
  pizzaTex.wrapS = THREE.RepeatWrapping;
  return pizzaTex;
}

let logo;
function bagLogo() {
  if (logo) return logo;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#c8302c'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#ffd23f';
  g.beginPath(); g.arc(64, 54, 34, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e04a2f';
  for (const [x, y] of [[52, 44], [76, 50], [60, 68]]) { g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#fff';
  g.font = 'bold 22px Arial Black, Arial';
  g.textAlign = 'center';
  g.fillText('PIZZA', 64, 116);
  logo = new THREE.CanvasTexture(c);
  logo.colorSpace = THREE.SRGBColorSpace;
  return logo;
}

// Centre of the scooter's handlebar: the top of the model, towards its front.
function handlebar(scooter) {
  const box = new THREE.Box3().setFromObject(scooter);
  const cut = box.max.y - 0.08 * (box.max.y - box.min.y);
  const v = new THREE.Vector3();
  let z = 0, n = 0;
  scooter.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (v.y > cut) { z += v.z; n++; }
    }
  });
  return new THREE.Vector3(0, box.max.y - 0.05, n ? z / n : box.max.z);
}
