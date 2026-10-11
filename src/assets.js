import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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
  const loader = new GLTFLoader();
  await Promise.allSettled(ids.map(async (id) => {
    const gltf = await loader.loadAsync(`models/${id}.glb`);
    gltf.scene.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    loaded.set(id, gltf.scene);
  }));
}

// Returns a fresh object for `id`, scaled to fit `size` (largest dimension),
// or the placeholder built by `fallback()` when no model is available.
export function makeObject(id, size, fallback) {
  const src = loaded.get(id);
  if (!src) return fallback();
  const obj = src.clone(true);
  const box = new THREE.Box3().setFromObject(obj);
  const dims = box.getSize(new THREE.Vector3());
  const s = size / Math.max(dims.x, dims.y, dims.z);
  obj.scale.setScalar(s);
  box.setFromObject(obj);
  obj.position.y -= box.min.y;
  const wrap = new THREE.Group();
  wrap.add(obj);
  return wrap;
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
