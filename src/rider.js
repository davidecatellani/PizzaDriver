import * as THREE from 'three';
import { box, mat, makeObject } from './assets.js';

// Rider standing on an electric kick scooter. Placeholder shapes until the Meshy models land.
export function makeRider(shirt = 0xffffff, cap = 0xd62828, riderId = 'rider') {
  const g = new THREE.Group();

  const scooter = makeObject('kick_scooter', 2.6, () => {
    const s = new THREE.Group();
    const deck = box(0.6, 0.15, 2.2, 0x1b1b1f); deck.position.y = 0.35; s.add(deck);
    const stem = box(0.12, 1.9, 0.12, 0x2a2a2e); stem.position.set(0, 1.3, 1.0); stem.rotation.x = -0.15; s.add(stem);
    const bar = box(1.0, 0.1, 0.1, 0x39ff88); bar.position.set(0, 2.2, 1.12); s.add(bar);
    for (const z of [-0.95, 0.95]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.18, 12), mat(0x111111));
      w.rotation.z = Math.PI / 2; w.position.set(0, 0.28, z); s.add(w);
    }
    return s;
  });
  scooter.rotation.y = 0;
  g.add(scooter);

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
  body.position.set(0, 0.45, 0);
  g.add(body);
  g.userData.body = body;

  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
