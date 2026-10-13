// First-ride coach: one tip at a time, each cleared by doing it. While it runs the race clock
// stands still and the rivals wait on the start line, so a new player can learn in peace.

const touch = () => matchMedia('(pointer: coarse)').matches;

const STEPS = [
  { key: 'steer', desk: 'Hold <b>← →</b> to steer', mob: 'Hold the <b>LEFT</b> or <b>RIGHT</b> side of the screen to steer',
    done: (t, i) => i.steer !== 0 && t.hold(0.7) },
  { key: 'follow', desk: 'Follow the <b>arrows</b> and the <b>minimap</b> to the customer 🍕', mob: null, done: (t) => t.wait(3.2) },
  { key: 'drift', desk: 'Hold <b>↓</b> while steering to <b>DRIFT</b> round corners', mob: 'Hold <b>DRIFT</b> while steering to slide round corners',
    done: (t, i) => i.brake && i.steer !== 0 && t.hold(0.5) },
  { key: 'trick', desk: 'Press <b>SPACE</b> for a wheelie, and spin in the air off ramps', mob: 'Hold <b>TRICK</b> for a wheelie, and spin in the air off ramps',
    done: (t, i) => i.boost && t.hold(0.4) },
  { key: 'turbo', desk: 'Jump the <b>ramps</b> and land tricks to fill your <b>TURBO</b>', mob: null, done: (t) => t.wait(3.2) },
  { key: 'kick', desk: 'Press <b>Z</b> or <b>X</b> to <b>KICK</b> a rival off your tail', mob: 'Tap <b>KICK</b> to boot a rival off your tail',
    done: (t, i) => i.kicks > t.kicks0 },
  { key: 'go', desk: 'Deliver before the clock runs out. <b>GO!</b>', mob: null, done: (t) => t.wait(2.2) },
];

export class Tutorial {
  constructor(el) {
    this.el = el;
    this.text = el.querySelector('.coach-text');
    this.dots = el.querySelector('.coach-dots');
    this.active = false;
    el.querySelector('.coach-skip').onclick = () => this.finish();
  }

  start(input) {
    this.input = input;
    this.active = true;
    this.go(0);
    this.el.classList.remove('hidden');
  }

  go(i) {
    this.i = i;
    this.t = 0;
    this.held = 0;
    this.kicks0 = this.input.kicks;
    const s = STEPS[i];
    this.text.innerHTML = (touch() && s.mob) || s.desk;
    this.dots.innerHTML = STEPS.map((_, k) => `<i class="${k < i ? 'done' : k === i ? 'on' : ''}"></i>`).join('');
    this.el.classList.remove('pop');
    void this.el.offsetWidth;   // restart the pop animation
    this.el.classList.add('pop');
    this.onStep?.(s.key);
  }

  // Helpers for the step checks: time on the step, and time spent doing the move.
  wait(s) { return this.t > s; }
  hold(s) { this.held += this.dt; return this.held > s; }

  // Returns true while the coach still holds the race.
  update(dt) {
    if (!this.active) return false;
    this.dt = dt;
    this.t += dt;
    if (this.t > 0.6 && STEPS[this.i].done(this, this.input)) {
      this.onDone?.();
      if (this.i + 1 < STEPS.length) this.go(this.i + 1);
      else this.finish();
    }
    return this.active && this.i < STEPS.length - 1;
  }

  finish() {
    if (!this.active) return;
    this.active = false;
    this.el.classList.add('hidden');
    this.onFinish?.();
  }
}
