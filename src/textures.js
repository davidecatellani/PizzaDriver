import * as THREE from 'three';

// Procedural textures drawn on canvases at startup: no image files to download.

let seed = 1234;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

// Fine grain over the whole canvas, to break up flat colours.
function grain(g, w, h, amount, size = 2) {
  for (let y = 0; y < h; y += size) {
    for (let x = 0; x < w; x += size) {
      const v = (rnd() - 0.5) * amount;
      g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
      g.fillRect(x, y, size, size);
    }
  }
}

function toTexture(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Normal map from a greyscale height canvas (white = high).
function normalMap(src, strength = 2) {
  const w = src.width, h = src.height;
  const data = src.getContext('2d').getImageData(0, 0, w, h).data;
  const [c, g] = canvas(w, h);
  const out = g.createImageData(w, h);
  const H = (x, y) => data[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x - 1, y) - H(x + 1, y)) * strength;
      const dy = (H(x, y - 1) - H(x, y + 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out.data[i] = (dx / len * 0.5 + 0.5) * 255;
      out.data[i + 1] = (-dy / len * 0.5 + 0.5) * 255;
      out.data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  return toTexture(c, { srgb: false });
}

// Neapolitan basalt paving ("basoli"): staggered dark stone slabs. One tile = 4 m.
export function basoli() {
  const S = 512;
  const [c, g] = canvas(S);
  const [hc, hg] = canvas(S);
  g.fillStyle = '#2b2a28';
  g.fillRect(0, 0, S, S);
  hg.fillStyle = '#000';
  hg.fillRect(0, 0, S, S);
  const rows = 10, rh = S / rows;
  for (let r = 0; r < rows; r++) {
    let x = r % 2 ? -rh * 0.6 : 0;
    while (x < S) {
      const w = rh * (1.1 + rnd() * 0.9);
      const l = 27 + rnd() * 9;
      g.fillStyle = `hsl(30, 4%, ${l}%)`;
      hg.fillStyle = `rgb(${180 + rnd() * 60 | 0},0,0)`;
      for (const off of [0, -S, S]) {   // wrap so the tile repeats seamlessly
        g.fillRect(x + 3 + off, r * rh + 3, w - 6, rh - 6);
        hg.fillRect(x + 3 + off, r * rh + 3, w - 6, rh - 6);
      }
      x += w;
    }
  }
  grain(g, S, S, 0.12, 2);
  grain(hg, S, S, 0.25, 4);
  const map = toTexture(c);
  return { map, normalMap: normalMap(hc, 3) };
}

// Pale stone pavement tiles with a darker kerb edge. One tile = 2 m.
export function pavement() {
  const S = 256;
  const [c, g] = canvas(S);
  const [hc, hg] = canvas(S);
  g.fillStyle = '#9a948a';
  g.fillRect(0, 0, S, S);
  hg.fillStyle = '#000';
  hg.fillRect(0, 0, S, S);
  const n = 4, t = S / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const l = 74 + rnd() * 8;
      g.fillStyle = `hsl(35, 12%, ${l}%)`;
      g.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
      hg.fillStyle = '#c00';
      hg.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
    }
  }
  grain(g, S, S, 0.08, 2);
  return { map: toTexture(c), normalMap: normalMap(hc, 1.5) };
}

// One facade bay (one window, one floor), tinted by the building's vertex colour.
// Variants differ in window shape, shutters and balcony.
export function facade(variant) {
  const S = 256;
  const [c, g] = canvas(S);
  const [hc, hg] = canvas(S);
  // Plaster: near white so the vertex colour shows, with weathering towards the bottom.
  g.fillStyle = '#f4f0ea';
  g.fillRect(0, 0, S, S);
  const stain = g.createLinearGradient(0, 0, 0, S);
  stain.addColorStop(0, 'rgba(0,0,0,0)');
  stain.addColorStop(1, 'rgba(60,40,20,0.12)');
  g.fillStyle = stain;
  g.fillRect(0, 0, S, S);
  grain(g, S, S, 0.07, 3);
  hg.fillStyle = '#808080';
  hg.fillRect(0, 0, S, S);
  grain(hg, S, S, 0.15, 3);

  // String course between floors.
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.fillRect(0, S - 14, S, 10);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(0, S - 4, S, 4);
  hg.fillStyle = '#e0e0e0';
  hg.fillRect(0, S - 14, S, 10);

  const shutters = ['#3f6b48', '#2f5a3b', '#7a4a2a', '#4f6f7f'][variant % 4];
  const ww = 76, wh = variant === 2 ? 128 : 118, wx = (S - ww) / 2, wy = 52;
  // Stone surround.
  g.fillStyle = '#e9e2d4';
  g.fillRect(wx - 12, wy - 14, ww + 24, wh + 24);
  hg.fillStyle = '#d0d0d0';
  hg.fillRect(wx - 12, wy - 14, ww + 24, wh + 24);
  if (variant === 1) {   // pediment
    g.beginPath(); g.moveTo(wx - 18, wy - 14); g.lineTo(S / 2, wy - 40); g.lineTo(wx + ww + 18, wy - 14); g.fill();
    hg.beginPath(); hg.moveTo(wx - 18, wy - 14); hg.lineTo(S / 2, wy - 40); hg.lineTo(wx + ww + 18, wy - 14); hg.fill();
  }
  // Recessed window: dark glass with a sky reflection.
  const glass = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
  glass.addColorStop(0, '#5d7a91');
  glass.addColorStop(0.45, '#22303d');
  glass.addColorStop(1, '#141a20');
  g.fillStyle = glass;
  g.fillRect(wx, wy, ww, wh);
  hg.fillStyle = '#202020';
  hg.fillRect(wx, wy, ww, wh);
  g.fillStyle = '#d9d2c4';
  g.fillRect(wx + ww / 2 - 2, wy, 4, wh);
  g.fillRect(wx, wy + wh * 0.38, ww, 4);
  // Louvred shutters, some half closed.
  const open = variant === 3 ? 0.5 : 1;
  for (const side of [-1, 1]) {
    const sx = side < 0 ? wx - 12 - 30 * open : wx + ww + 12;
    g.fillStyle = shutters;
    g.fillRect(sx, wy - 6, 30 * open, wh + 8);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = wy; y < wy + wh; y += 7) g.fillRect(sx + 2, y, 30 * open - 4, 2);
  }
  if (variant !== 2) {
    // Balcony slab and wrought-iron railing.
    g.fillStyle = '#cfc6b6';
    g.fillRect(wx - 26, wy + wh, ww + 52, 9);
    g.strokeStyle = '#1e1e1e';
    g.lineWidth = 3;
    g.strokeRect(wx - 24, wy + wh - 40, ww + 48, 40);
    for (let x = wx - 18; x < wx + ww + 24; x += 9) {
      g.beginPath(); g.moveTo(x, wy + wh - 40); g.lineTo(x, wy + wh); g.stroke();
    }
    hg.fillStyle = '#ffffff';
    hg.fillRect(wx - 26, wy + wh, ww + 52, 9);
  }
  const map = toTexture(c);
  map.generateMipmaps = true;
  return { map, normalMap: normalMap(hc, 2) };
}

// Ground-floor shopfronts: an arch with a rolling shutter or a lit shop window.
export function shopfront() {
  const S = 256;
  const [c, g] = canvas(S);
  g.fillStyle = '#d8d0c2';
  g.fillRect(0, 0, S, S);
  grain(g, S, S, 0.1, 3);
  // Rusticated stone courses.
  g.fillStyle = 'rgba(0,0,0,0.15)';
  for (let y = 0; y < S; y += 32) g.fillRect(0, y, S, 3);
  const ax = 48, aw = 160, ay = 60;
  g.fillStyle = '#efe8da';
  g.beginPath(); g.moveTo(ax - 12, S); g.lineTo(ax - 12, ay + 20); g.arc(S / 2, ay + 20, aw / 2 + 12, Math.PI, 0); g.lineTo(ax + aw + 12, S); g.fill();
  {
    const inside = g.createLinearGradient(0, ay, 0, S);
    inside.addColorStop(0, '#fbe3a8');
    inside.addColorStop(1, '#a5652d');
    g.fillStyle = inside;
    g.beginPath(); g.moveTo(ax, S); g.lineTo(ax, ay + 20); g.arc(S / 2, ay + 20, aw / 2, Math.PI, 0); g.lineTo(ax + aw, S); g.fill();
    // Rolling shutter half down.
    g.fillStyle = '#8a8d91';
    g.fillRect(ax, ay + 20, aw, 70);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = ay + 24; y < ay + 90; y += 6) g.fillRect(ax, y, aw, 2);
  }
  return { map: toTexture(c) };
}

// Soft round particle sprite.
export function puff() {
  const [c, g] = canvas(64);
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return toTexture(c, { repeat: false });
}

// Fabric for laundry: a few colours and stripes in one atlas row.
export function laundry() {
  const [c, g] = canvas(256, 64);
  const cols = ['#ffffff', '#f2a7c3', '#9fd3e6', '#f7e27a', '#e85d4a', '#7fc77a', '#ffffff', '#c7b2f0'];
  cols.forEach((col, i) => {
    g.fillStyle = col;
    g.fillRect(i * 32, 0, 32, 64);
    if (i % 3 === 1) {
      g.fillStyle = 'rgba(255,255,255,0.6)';
      for (let y = 4; y < 64; y += 12) g.fillRect(i * 32, y, 32, 5);
    }
  });
  grain(g, 256, 64, 0.08, 2);
  return toTexture(c, { repeat: false });
}
