#!/usr/bin/env node
// Generates the meshes listed in assets/meshes.json with the Meshy Text to 3D API
// (preview → refine) and saves them as public/models/<id>.glb, updating the manifest.
//
// Usage: MESHY_API_KEY=... npm run meshes [-- id1 id2 ...]
// Already generated ids are skipped; pass ids to (re)generate only those.

import { readFile, writeFile, access } from 'node:fs/promises';

const API = 'https://api.meshy.ai/openapi/v2/text-to-3d';
const KEY = process.env.MESHY_API_KEY;
if (!KEY) {
  console.error('MESHY_API_KEY is not set');
  process.exit(1);
}

const headers = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function createTask(body) {
  const res = await fetch(API, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`create ${res.status}: ${await res.text()}`);
  return (await res.json()).result;
}

async function waitTask(id) {
  for (;;) {
    const res = await fetch(`${API}/${id}`, { headers });
    if (!res.ok) throw new Error(`poll ${res.status}: ${await res.text()}`);
    const t = await res.json();
    if (t.status === 'SUCCEEDED') return t;
    if (t.status === 'FAILED' || t.status === 'CANCELED') throw new Error(`task ${id} ${t.status}`);
    await sleep(5000);
  }
}

async function generate(mesh, style) {
  const preview = await createTask({
    mode: 'preview',
    prompt: `${mesh.prompt}, ${style}`.slice(0, 800),
    model_type: 'smart-topology',
    ai_model: 'meshy-t2',
    target_polycount: mesh.polycount,
    pose_mode: mesh.rig ? 't-pose' : '',
    target_formats: ['glb'],
  });
  await waitTask(preview);
  const refine = await createTask({
    mode: 'refine',
    preview_task_id: preview,
    texture_resolution: '2k',
    enable_pbr: false,
    target_formats: ['glb'],
  });
  const done = await waitTask(refine);
  const glb = await fetch(done.model_urls.glb);
  await writeFile(`public/models/${mesh.id}.glb`, Buffer.from(await glb.arrayBuffer()));
  return done.consumed_credits;
}

const { style, meshes } = JSON.parse(await readFile('assets/meshes.json', 'utf8'));
const manifestPath = 'public/models/manifest.json';
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const only = process.argv.slice(2);

const exists = (p) => access(p).then(() => true, () => false);
const todo = [];
for (const m of meshes) {
  if (only.length ? only.includes(m.id) : !(await exists(`public/models/${m.id}.glb`))) todo.push(m);
}
console.log(`Generating ${todo.length} meshes: ${todo.map((m) => m.id).join(', ')}`);

// A few at a time to stay polite with the API.
const queue = [...todo];
await Promise.all([0, 1, 2].map(async () => {
  for (let m = queue.shift(); m; m = queue.shift()) {
    try {
      const credits = await generate(m, style);
      if (!manifest.models.includes(m.id)) manifest.models.push(m.id);
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      console.log(`✓ ${m.id} (${credits ?? '?'} credits)`);
    } catch (e) {
      console.error(`✗ ${m.id}: ${e.message}`);
    }
  }
}));
