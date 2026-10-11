import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// Models generated with Meshy live in public/models/<id>.glb and are listed in
// public/models/manifest.json. Anything missing falls back to a primitive placeholder,
// so the game is always playable while the art is being generated.

const loaded = new Map();

export async function loadModels() {
  let ids = [];
  try {
    const res = await fetch('models/manifest.json');
    ids = (await res.json()).models ?? [];
  } catch {
    return;
  }
  // The optimized models use meshopt compression (tools/meshy/optimize.sh).
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const results = await Promise.allSettled(ids.map(async (id) => {
    const gltf = await loader.loadAsync(`models/${id}.glb`);
    gltf.scene.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    loaded.set(id, gltf.scene);
  }));
  results.forEach((r, i) => { if (r.status === 'rejected') console.warn(`model ${ids[i]} failed:`, r.reason); });
}

// Returns a fresh object for `id`, scaled to fit `size` (largest dimension),
// or the placeholder built by `fallback()` when no model is available.
// Vehicles (`opts.vehicle`) are turned so their length runs along +z; with `opts.tallFront`
// the tall end (a scooter's stem) is taken as the front.
export function makeObject(id, size, fallback, opts = {}) {
  const src = loaded.get(id);
  if (!src) return fallback();
  const obj = src.clone(true);
  const box = new THREE.Box3().setFromObject(obj);
  const dims = box.getSize(new THREE.Vector3());
  if (opts.vehicle) {
    if (dims.x > dims.z) obj.rotation.y = Math.PI / 2;
    if (opts.tallFront && tallEndIsBack(obj)) obj.rotation.y += Math.PI;
  }
  const s = size / Math.max(dims.x, dims.y, dims.z);
  obj.scale.setScalar(s);
  obj.updateMatrixWorld(true);
  box.setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.set(-c.x, -box.min.y, -c.z);
  const wrap = new THREE.Group();
  wrap.add(obj);
  return wrap;
}

// True when the upper part of the model sits towards -z.
function tallEndIsBack(obj) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const cut = box.min.y + (box.max.y - box.min.y) * 0.7;
  const v = new THREE.Vector3();
  let sum = 0, n = 0;
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 3) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (v.y > cut) { sum += v.z; n++; }
    }
  });
  return n > 0 && sum / n < (box.min.z + box.max.z) / 2;
}

export function mat(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, ...extra });
}

export function box(w, h, d, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
