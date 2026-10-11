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

// --- New York and Paris ---

// Asphalt: dark, fine-grained, with patched repairs and cracks. One tile = 4 m.
export function asphalt(tone = 34) {
  const S = 512;
  const [c, g] = canvas(S);
  const [hc, hg] = canvas(S);
  g.fillStyle = `hsl(220, 3%, ${tone}%)`;
  g.fillRect(0, 0, S, S);
  hg.fillStyle = '#808080';
  hg.fillRect(0, 0, S, S);
  grain(g, S, S, 0.16, 2);
  grain(hg, S, S, 0.5, 2);
  // Hairline cracks.
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  hg.strokeStyle = '#303030';
  for (let k = 0; k < 14; k++) {
    let x = rnd() * S, y = rnd() * S;
    g.lineWidth = hg.lineWidth = 1 + rnd() * 1.5;
    g.beginPath(); hg.beginPath(); g.moveTo(x, y); hg.moveTo(x, y);
    for (let s = 0; s < 6; s++) { x += (rnd() - 0.5) * 40; y += (rnd() - 0.5) * 40; g.lineTo(x, y); hg.lineTo(x, y); }
    g.stroke(); hg.stroke();
  }
  return { map: toTexture(c), normalMap: normalMap(hc, 1.2) };
}

// Concrete pavement slabs (New York) or pale stone (Paris). One tile = 2 m.
export function slabs(base = '#a9a7a2', joint = 'rgba(0,0,0,0.28)') {
  const S = 256;
  const [c, g] = canvas(S);
  const [hc, hg] = canvas(S);
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  hg.fillStyle = '#c0c0c0'; hg.fillRect(0, 0, S, S);
  grain(g, S, S, 0.1, 2);
  g.fillStyle = joint; hg.fillStyle = '#000';
  for (const v of [0, S / 2]) { g.fillRect(v, 0, 3, S); g.fillRect(0, v, S, 3); hg.fillRect(v, 0, 3, S); hg.fillRect(0, v, S, 3); }
  // A few chewing-gum spots and stains.
  for (let k = 0; k < 18; k++) { g.fillStyle = `rgba(30,30,30,${0.1 + rnd() * 0.15})`; g.beginPath(); g.arc(rnd() * S, rnd() * S, 1 + rnd() * 3, 0, 7); g.fill(); }
  return { map: toTexture(c), normalMap: normalMap(hc, 1.5) };
}

// Curtain-wall glass: one bay is one storey of a tower. Variants: blue, green, bronze, silver.
export function glass(variant) {
  const S = 128;
  const [c, g] = canvas(S);
  const tint = [['#9cc3e0', '#2d4f6e', '#18293a'], ['#a7d8cf', '#2d6660', '#173a36'], ['#e3c9a0', '#6e5537', '#2e2418'], ['#d6dde3', '#5b6670', '#272c31']][variant % 4];
  const grad = g.createLinearGradient(0, 0, S * 0.6, S);
  grad.addColorStop(0, tint[0]); grad.addColorStop(0.5, tint[1]); grad.addColorStop(1, tint[2]);
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
  // A lit office behind some panes.
  if (rnd() < 0.5) { g.fillStyle = 'rgba(255,240,200,0.18)'; g.fillRect(8, 30, 50, 70); }
  // Mullions and the spandrel band at the floor.
  g.fillStyle = variant === 2 ? '#3a2c1c' : '#c9d0d6';
  g.fillRect(0, 0, 4, S); g.fillRect(S / 2 - 2, 0, 4, S);
  g.fillRect(0, S - 22, S, 22);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, S - 22, S, 3);
  const map = toTexture(c);
  return { map };
}

// A brick walk-up's bay: tinted brick with a white sash window under a stone lintel.
export function brick(variant) {
  const S = 256;
  const [c, g] = canvas(S);
  const [hc, hg] = canvas(S);
  g.fillStyle = '#b8b0a8'; g.fillRect(0, 0, S, S);          // mortar
  hg.fillStyle = '#000'; hg.fillRect(0, 0, S, S);
  const bh = 6, bw = 15;
  for (let y = 0, r = 0; y < S; y += bh, r++) {
    for (let x = r % 2 ? -bw / 2 : 0; x < S; x += bw) {
      const l = 82 + rnd() * 18;
      g.fillStyle = `hsl(0, 0%, ${l}%)`;
      g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
      hg.fillStyle = '#c0c0c0';
      hg.fillRect(x + 1, y + 1, bw - 2, bh - 2);
    }
  }
  grain(g, S, S, 0.1, 2);
  const ww = 84, wh = 132, wx = (S - ww) / 2, wy = 58;
  // Lintel and sill in pale stone.
  g.fillStyle = variant === 1 ? '#3a3a3a' : '#e8e2d6';
  g.fillRect(wx - 10, wy - 16, ww + 20, 16);
  g.fillStyle = '#e8e2d6';
  g.fillRect(wx - 8, wy + wh, ww + 16, 10);
  hg.fillStyle = '#ffffff'; hg.fillRect(wx - 10, wy - 16, ww + 20, 16); hg.fillRect(wx - 8, wy + wh, ww + 16, 10);
  // Two-over-two sash window.
  const glassG = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
  glassG.addColorStop(0, '#6f8ca3'); glassG.addColorStop(0.5, '#273443'); glassG.addColorStop(1, '#151b22');
  g.fillStyle = glassG; g.fillRect(wx, wy, ww, wh);
  hg.fillStyle = '#202020'; hg.fillRect(wx, wy, ww, wh);
  g.fillStyle = variant === 2 ? '#2f5d3a' : '#f2f0ea';
  g.fillRect(wx, wy, ww, 5); g.fillRect(wx, wy + wh - 5, ww, 5); g.fillRect(wx, wy, 5, wh); g.fillRect(wx + ww - 5, wy, 5, wh);
  g.fillRect(wx, wy + wh / 2 - 3, ww, 6); g.fillRect(wx + ww / 2 - 2, wy, 4, wh);
  // An air conditioner in some windows.
  if (variant === 0) { g.fillStyle = '#d9d9d4'; g.fillRect(wx + 10, wy + wh / 2 + 6, 44, 28); g.fillStyle = '#8a8a86'; for (let y = 0; y < 24; y += 5) g.fillRect(wx + 14, wy + wh / 2 + 9 + y, 36, 2); }
  return { map: toTexture(c), normalMap: normalMap(hc, 2) };
}

// New York ground floors: shop windows under coloured awnings, steel shutters.
export function storefrontNY() {
  const S = 256;
  const [c, g] = canvas(S);
  g.fillStyle = '#2a2a2c'; g.fillRect(0, 0, S, S);
  const cols = ['#c8302c', '#1f5f3a', '#1d3f7a', '#e3a21a', '#5a2a6e'];
  const col = cols[Math.floor(rnd() * cols.length)];
  // Sign band, awning, window, door.
  g.fillStyle = col; g.fillRect(0, 20, S, 46);
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center';
  g.fillText(['DELI', 'PIZZA', 'NAILS', 'DINER', 'BAGELS', 'HARDWARE'][Math.floor(rnd() * 6)], S / 2, 56);
  const lit = g.createLinearGradient(0, 80, 0, S);
  lit.addColorStop(0, '#fff2c8'); lit.addColorStop(1, '#a8743a');
  g.fillStyle = lit; g.fillRect(12, 86, 150, 150);
  g.fillStyle = '#6d7277'; g.fillRect(176, 86, 66, 170);
  g.fillStyle = 'rgba(0,0,0,0.3)'; for (let y = 90; y < S; y += 7) g.fillRect(176, y, 66, 2);
  g.fillStyle = '#111'; g.fillRect(12, 160, 150, 4); g.fillRect(85, 86, 4, 150);
  return { map: toTexture(c) };
}

// A Haussmann bay in Paris limestone: a tall French window with a wrought-iron guard,
// stone joints, a carved surround. Variants differ in the window head and the railing.
export function haussmann(variant) {
  const S = 256;
  const [c, g] = canvas(S);
  const [hc, hg] = canvas(S);
  g.fillStyle = '#f3ecdf'; g.fillRect(0, 0, S, S);
  hg.fillStyle = '#909090'; hg.fillRect(0, 0, S, S);
  grain(g, S, S, 0.06, 3);
  // Horizontal stone courses.
  g.fillStyle = 'rgba(120,100,70,0.22)'; hg.fillStyle = '#505050';
  for (let y = 0; y < S; y += 32) { g.fillRect(0, y, S, 2); hg.fillRect(0, y, S, 2); }
  const ww = 70, wh = 150, wx = (S - ww) / 2, wy = 52;
  // Moulded surround with a keystone.
  g.fillStyle = '#fbf6ec'; g.fillRect(wx - 12, wy - 16, ww + 24, wh + 16);
  hg.fillStyle = '#d0d0d0'; hg.fillRect(wx - 12, wy - 16, ww + 24, wh + 16);
  if (variant === 1) {
    g.beginPath(); g.moveTo(wx - 18, wy - 16); g.lineTo(wx + ww / 2, wy - 38); g.lineTo(wx + ww + 18, wy - 16); g.fill();
    hg.beginPath(); hg.moveTo(wx - 18, wy - 16); hg.lineTo(wx + ww / 2, wy - 38); hg.lineTo(wx + ww + 18, wy - 16); hg.fill();
  } else if (variant === 2) {
    g.beginPath(); g.arc(wx + ww / 2, wy - 6, ww / 2 + 14, Math.PI, 0); g.fill();
  }
  g.fillStyle = '#e6dccb'; g.fillRect(wx + ww / 2 - 9, wy - 18, 18, 22);
  // French window: two casements, many panes, curtains behind.
  const gl = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
  gl.addColorStop(0, '#7f97a8'); gl.addColorStop(0.5, '#2c3843'); gl.addColorStop(1, '#161c22');
  g.fillStyle = gl; g.fillRect(wx, wy, ww, wh);
  g.fillStyle = 'rgba(240,230,210,0.35)'; g.fillRect(wx + 3, wy + 3, 14, wh - 6); g.fillRect(wx + ww - 17, wy + 3, 14, wh - 6);
  hg.fillStyle = '#202020'; hg.fillRect(wx, wy, ww, wh);
  g.fillStyle = '#efe9de';
  g.fillRect(wx + ww / 2 - 2, wy, 4, wh);
  for (let y = wy + wh / 4; y < wy + wh; y += wh / 4) g.fillRect(wx, y - 1.5, ww, 3);
  // Wrought-iron guard across the lower part.
  g.strokeStyle = '#151515'; g.lineWidth = 2.5;
  const gy = wy + wh - 46;
  g.strokeRect(wx - 6, gy, ww + 12, 44);
  for (let x = wx - 2; x < wx + ww + 6; x += 8) { g.beginPath(); g.moveTo(x, gy); g.lineTo(x, gy + 44); g.stroke(); }
  if (variant !== 0) { for (let x = wx + 4; x < wx + ww; x += 16) { g.beginPath(); g.arc(x, gy + 22, 6, 0, 7); g.stroke(); } }
  return { map: toTexture(c), normalMap: normalMap(hc, 2) };
}

// Paris ground floors: café and shop fronts in painted wood with gilt lettering.
export function parisShop() {
  const S = 256;
  const [c, g] = canvas(S);
  g.fillStyle = '#e9e0cf'; g.fillRect(0, 0, S, S);
  g.fillStyle = 'rgba(0,0,0,0.12)'; for (let y = 0; y < S; y += 30) g.fillRect(0, y, S, 3);
  const wood = ['#1f3d2c', '#6e1f24', '#1d2b4a', '#2b2b2b', '#4a2d5a'][Math.floor(rnd() * 5)];
  g.fillStyle = wood; g.fillRect(10, 30, S - 20, S - 30);
  g.fillStyle = '#d8b25a'; g.font = 'italic bold 26px serif'; g.textAlign = 'center';
  g.fillText(['Café', 'Boulangerie', 'Bistrot', 'Fromagerie', 'Librairie', 'Pâtisserie'][Math.floor(rnd() * 6)], S / 2, 60);
  const lit = g.createLinearGradient(0, 80, 0, S);
  lit.addColorStop(0, '#fff0c8'); lit.addColorStop(1, '#9a6a34');
  g.fillStyle = lit; g.fillRect(24, 80, 92, S - 80); g.fillRect(140, 80, 92, S - 80);
  g.fillStyle = wood; g.fillRect(24, 150, 92, 4); g.fillRect(140, 150, 92, 4); g.fillRect(68, 80, 4, S - 80); g.fillRect(184, 80, 4, S - 80);
  return { map: toTexture(c) };
}

// Zinc roofing: blue-grey standing seams. One tile = 2 m.
export function zinc() {
  const S = 128;
  const [c, g] = canvas(S);
  g.fillStyle = '#8b96a0'; g.fillRect(0, 0, S, S);
  grain(g, S, S, 0.1, 2);
  g.fillStyle = 'rgba(255,255,255,0.35)'; for (let x = 0; x < S; x += 16) g.fillRect(x, 0, 2, S);
  g.fillStyle = 'rgba(0,0,0,0.25)'; for (let x = 2; x < S; x += 16) g.fillRect(x, 0, 2, S);
  return { map: toTexture(c) };
}

// Riveted iron lattice for the Eiffel Tower: bars and X-bracing, open in between (alpha).
export function lattice() {
  const S = 128;
  const [c, g] = canvas(S);
  g.clearRect(0, 0, S, S);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 9; g.strokeRect(0, 0, S, S);
  g.lineWidth = 6;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(S, S); g.moveTo(S, 0); g.lineTo(0, S); g.stroke();
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(S / 2, 0); g.lineTo(S / 2, S); g.moveTo(0, S / 2); g.lineTo(S, S / 2); g.stroke();
  const t = toTexture(c);
  return t;
}

// Grass with mowing stripes. One tile = 8 m.
export function grass() {
  const S = 256;
  const [c, g] = canvas(S);
  g.fillStyle = '#5d8f3a'; g.fillRect(0, 0, S, S);
  g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(0, 0, S / 2, S);
  grain(g, S, S, 0.18, 2);
  return { map: toTexture(c) };
}

// Pale gravel for park paths. One tile = 4 m.
export function gravel() {
  const S = 256;
  const [c, g] = canvas(S);
  g.fillStyle = '#cdbf9f'; g.fillRect(0, 0, S, S);
  grain(g, S, S, 0.3, 2);
  return { map: toTexture(c) };
}

// Bright billboards for Times Square: made-up brands only.
export function billboard(k) {
  const W = 256, H = 160;
  const [c, g] = canvas(W, H);
  const themes = [
    ['#ff2d55', '#ffd60a', 'PIZZA DRIVER', 'NOW DELIVERING'],
    ['#0a84ff', '#ffffff', 'BROADWAY', 'THE MUSICAL'],
    ['#30d158', '#111111', 'SODA POP', 'ICE COLD'],
    ['#111111', '#ff9f0a', 'NEON NIGHTS', 'LIVE TONIGHT'],
    ['#bf5af2', '#ffffff', 'SUPER SALE', '50% OFF'],
    ['#ffd60a', '#d0021b', 'HOT DOGS', '$2 ONLY'],
    ['#ff9f0a', '#111111', 'TAXI APP', 'RIDE NOW'],
    ['#64d2ff', '#0b1e3a', 'SKY TOURS', 'SEE NYC'],
  ];
  const [bg, fg, big, small] = themes[k % themes.length];
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, bg); grad.addColorStop(1, '#000000');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.fillStyle = fg; g.textAlign = 'center';
  g.font = 'bold 34px sans-serif'; g.fillText(big, W / 2, H / 2);
  g.font = 'bold 20px sans-serif'; g.fillText(small, W / 2, H / 2 + 34);
  g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(6, 6, W - 12, H - 12);
  return toTexture(c, { repeat: false });
}

// A word painted on a canvas, for shop signs: returns a texture.
export function signText(text, { bg = '#1d6b3a', fg = '#ffffff', font = 'bold 40px sans-serif', w = 256, h = 64 } = {}) {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
  return toTexture(c, { repeat: false });
}

// Wrought-iron balcony railing as an alpha map (white = iron): rails, bars and rings.
export function railing() {
  const [c, g] = canvas(128, 64);
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#fff'; g.strokeStyle = '#fff';
  g.fillRect(0, 0, 128, 6); g.fillRect(0, 58, 128, 6);
  for (let x = 4; x < 128; x += 16) g.fillRect(x, 0, 3, 64);
  g.lineWidth = 3;
  for (let x = 12; x < 128; x += 16) { g.beginPath(); g.arc(x, 32, 6, 0, 7); g.stroke(); }
  return toTexture(c, { srgb: false });
}
