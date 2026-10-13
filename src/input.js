// Keyboard + touch input. Touch: hold left/right half of the screen to steer, BOOST button for the turbo.

export class Input {
  constructor() {
    this.keys = new Set();
    this.touchSteer = 0;
    this.touchBoost = false;
    this.touchBrake = false;
    this.kickQueued = null;   // 1 = kick left, -1 = kick right, 0 = towards the nearest rival
    this.kicks = 0;           // kicks asked for so far (the tutorial watches it)
    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (!e.repeat && e.code === 'KeyZ') { this.kickQueued = 1; this.kicks++; }
      if (!e.repeat && e.code === 'KeyX') { this.kickQueued = -1; this.kicks++; }
      if (!e.repeat && e.code === 'KeyC') { this.kickQueued = 0; this.kicks++; }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    const touches = new Map();
    const update = () => {
      let s = 0;
      for (const x of touches.values()) s += x < innerWidth / 2 ? 1 : -1;
      this.touchSteer = Math.max(-1, Math.min(1, s));
    };
    const canvasTouch = (e) => {
      if (e.target.closest('button')) return;
      for (const t of e.changedTouches) {
        if (e.type === 'touchend' || e.type === 'touchcancel') touches.delete(t.identifier);
        else touches.set(t.identifier, t.clientX);
      }
      update();
    };
    for (const ev of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
      addEventListener(ev, canvasTouch, { passive: true });
    }

    const hold = (id, key) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('touchstart', (e) => { e.preventDefault(); this[key] = true; });
      btn.addEventListener('touchend', () => { this[key] = false; });
      btn.addEventListener('touchcancel', () => { this[key] = false; });
    };
    hold('boost-btn', 'touchBoost');
    hold('brake-btn', 'touchBrake');
    const kickBtn = document.getElementById('kick-btn');
    kickBtn?.addEventListener('touchstart', (e) => { e.preventDefault(); this.kickQueued = 0; this.kicks++; });
  }

  get steer() {
    const k = this.keys;
    let s = 0;
    if (k.has('ArrowLeft') || k.has('KeyA')) s += 1;
    if (k.has('ArrowRight') || k.has('KeyD')) s -= 1;
    return s || this.touchSteer;
  }

  get brake() {
    return this.keys.has('ArrowDown') || this.keys.has('KeyS') || this.touchBrake;
  }

  // Takes the queued kick, if any.
  takeKick() {
    const k = this.kickQueued;
    this.kickQueued = null;
    return k;
  }

  get boost() {
    return this.keys.has('Space') || this.keys.has('ShiftLeft') || this.touchBoost;
  }
}
