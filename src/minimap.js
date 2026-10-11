import { CELL, GRID, RIVALS } from './config.js';

const RANGE = 130;    // metres from the player to the edge of the map

// Round heading-up minimap: streets, the route ahead, next checkpoint, customer and rivals.
export class Minimap {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
  }

  draw(game) {
    const { g, c } = this;
    const W = c.width, R = W / 2, k = R / RANGE;
    const p = game.player.pos, h = game.player.heading;
    const sin = Math.sin(h), cos = Math.cos(h);
    const tx = (x, z) => {
      const dx = x - p.x, dz = z - p.z;
      const f = dx * sin + dz * cos;
      const r = -dx * cos + dz * sin;
      return [R + r * k, R - f * k];
    };
    const line = (pts, color, width) => {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.beginPath();
      pts.forEach(([x, z], i) => { const [sx, sy] = tx(x, z); i ? g.lineTo(sx, sy) : g.moveTo(sx, sy); });
      g.stroke();
    };
    const dot = (x, z, r, color) => {
      const [sx, sy] = tx(x, z);
      g.fillStyle = color;
      g.beginPath();
      g.arc(sx, sy, r, 0, Math.PI * 2);
      g.fill();
    };

    g.clearRect(0, 0, W, W);
    g.save();
    g.beginPath();
    g.arc(R, R, R, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = 'rgba(30, 30, 40, 0.55)';
    g.fillRect(0, 0, W, W);
    g.lineCap = 'round';
    g.lineJoin = 'round';

    // Streets. The palazzo's inner lines (x = 3 or z = 3 between 2 and 4) are not streets.
    const span = GRID * CELL;
    for (let i = 0; i <= GRID; i++) {
      const v = i * CELL;
      if (i === 3) {
        line([[v, 0], [v, 2 * CELL]], 'rgba(255,255,255,.35)', 14 * k);
        line([[v, 4 * CELL], [v, span]], 'rgba(255,255,255,.35)', 14 * k);
        line([[0, v], [2 * CELL, v]], 'rgba(255,255,255,.35)', 14 * k);
        line([[4 * CELL, v], [span, v]], 'rgba(255,255,255,.35)', 14 * k);
      } else {
        line([[v, 0], [v, span]], 'rgba(255,255,255,.35)', 14 * k);
        line([[0, v], [span, v]], 'rgba(255,255,255,.35)', 14 * k);
      }
    }

    // Route from here to the customer.
    const nav = game.nav;
    if (nav.path) {
      const here = nav.pointAhead(0);
      const rest = nav.path.slice(here.seg + 1).map((v) => [v.x, v.y]);
      line([[here.x, here.z], ...rest], '#ffd23f', 5);
    }

    const cp = game.world.checkpoints[game.cpIndex];
    if (cp) dot(cp.pos.x, cp.pos.z, 7, '#ffd23f');
    dot(game.world.customerPos.x, game.world.customerPos.z, 9, '#55ff88');
    game.rivals.forEach((r, i) => dot(r.pos.x, r.pos.z, 5, `#${RIVALS[i].color.toString(16).padStart(6, '0')}`));

    // The player, always at the centre pointing up.
    g.fillStyle = '#ff3b2f';
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(R, R - 11);
    g.lineTo(R + 8, R + 8);
    g.lineTo(R, R + 3);
    g.lineTo(R - 8, R + 8);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}
