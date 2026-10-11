// Generates the level meshes with the Meshy Text to 3D API.
// Usage: MESHY_API_KEY=... node tools/meshy/generate.mjs tools/meshy/napoli.json assets/models/napoli/raw [id ...]
// Resumable: task ids are saved in <out>/tasks.json, finished GLBs are skipped.
import fs from 'node:fs/promises';
import path from 'node:path';

const API = 'https://api.meshy.ai/openapi/v2/text-to-3d';
const KEY = process.env.MESHY_API_KEY;
if (!KEY) { console.error('MESHY_API_KEY is not set'); process.exit(1); }

const [listFile, outDir, ...only] = process.argv.slice(2);
const list = JSON.parse(await fs.readFile(listFile, 'utf8'));
await fs.mkdir(outDir, { recursive: true });
const tasksFile = path.join(outDir, 'tasks.json');
const tasks = JSON.parse(await fs.readFile(tasksFile, 'utf8').catch(() => '{}'));
const save = () => fs.writeFile(tasksFile, JSON.stringify(tasks, null, 2));

async function call(method, url, body) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: body && JSON.stringify(body),
    });
    if (res.ok) return res.json();
    const text = await res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      await new Promise(r => setTimeout(r, 5000 * 2 ** attempt));
      continue;
    }
    throw new Error(`${method} ${url} -> ${res.status} ${text}`);
  }
}

async function waitTask(id) {
  for (;;) {
    const t = await call('GET', `${API}/${id}`);
    if (t.status === 'SUCCEEDED') return t;
    if (t.status === 'FAILED' || t.status === 'CANCELED') throw new Error(`task ${id} ${t.status}: ${JSON.stringify(t.task_error)}`);
    await new Promise(r => setTimeout(r, 10000));
  }
}

async function build(m) {
  const glb = path.join(outDir, `${m.id}.glb`);
  if (await fs.stat(glb).catch(() => null)) return console.log(`skip ${m.id}`);
  const t = (tasks[m.id] ??= {});
  if (!t.preview) {
    const r = await call('POST', API, {
      mode: 'preview',
      prompt: `${m.prompt}, ${list.style_suffix}`.slice(0, 600),
      art_style: 'realistic',
      ai_model: 'latest',
      topology: 'triangle',
      target_polycount: m.polycount,
      should_remesh: true,
      ...(m.rig ? { pose_mode: 't-pose' } : {}),
    });
    t.preview = r.result; await save();
    console.log(`preview ${m.id} ${t.preview}`);
  }
  await waitTask(t.preview);
  if (!t.refine) {
    const r = await call('POST', API, { mode: 'refine', preview_task_id: t.preview, enable_pbr: false });
    t.refine = r.result; await save();
    console.log(`refine ${m.id} ${t.refine}`);
  }
  const done = await waitTask(t.refine);
  const res = await fetch(done.model_urls.glb);
  if (!res.ok) throw new Error(`download ${m.id} -> ${res.status}`);
  await fs.writeFile(glb, Buffer.from(await res.arrayBuffer()));
  console.log(`done ${m.id}`);
}

const todo = list.meshes.filter(m => !only.length || only.includes(m.id));
const CONCURRENCY = 4;
const failed = [];
for (let i = 0; i < todo.length; i += CONCURRENCY) {
  await Promise.all(todo.slice(i, i + CONCURRENCY).map(m =>
    build(m).catch(e => { failed.push(m.id); console.error(`FAIL ${m.id}: ${e.message}`); })));
}
if (failed.length) { console.error(`failed: ${failed.join(' ')}`); process.exit(1); }
