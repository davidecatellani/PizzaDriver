// Original procedural soundtrack: fast arcade rock in E minor, plus simple sound effects.
// Everything is synthesized with WebAudio, so the build ships no audio files.

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
// Bar roots (MIDI) of the 4-bar progression: E - C - D - B.
const ROOTS = [40, 36, 38, 35];
// Bass pattern per 16th step: semitone offset from root, or null for rest.
const BASS = [0, null, 0, 12, 0, null, 0, 10, 0, null, 0, 12, 7, null, 5, 3];
// Guitar stabs (power chords) on syncopated steps.
const STABS = new Set([0, 3, 6, 10, 12]);
// Lead hook, 2 bars, MIDI notes (null = rest). Plays on bars 3-4 of every 8.
const HOOK = [76, null, 79, null, 81, 79, 76, null, 74, null, 76, null, 71, null, null, null,
  76, null, 79, null, 83, 81, 79, null, 81, null, 79, 76, 79, null, null, null];

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.bpm = 156;
    this.step = 0;
    this.playing = false;
  }

  unlock() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
      this.music = this.ctx.createGain();
      this.music.gain.value = 0.7;
      this.music.connect(this.master);
      this.noise = this.makeNoise();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  makeNoise() {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
  }

  startMusic() {
    if (!this.ctx || this.playing) return;
    this.playing = true;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stopMusic() {
    this.playing = false;
    clearInterval(this.timer);
  }

  schedule() {
    const ctx = this.ctx;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += 60 / this.bpm / 4;
      this.step++;
    }
  }

  playStep(step, t) {
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const root = ROOTS[bar % 4];
    if (s % 4 === 0) this.kick(t);
    if (s === 4 || s === 12) this.snare(t);
    if (s % 2 === 1) this.hat(t, s % 4 === 3 ? 0.06 : 0.035);
    if (BASS[s] !== null) this.tone(NOTE(root + BASS[s]), t, 0.11, 'sawtooth', 0.22, 900);
    if (STABS.has(s)) this.chord(root + 24, t);
    if (bar % 8 >= 2 && bar % 8 < 4) {
      const n = HOOK[(bar % 2) * 16 + s];
      if (n) this.tone(NOTE(n), t, 0.14, 'square', 0.09, 3000);
    }
  }

  tone(freq, t, dur, type, vol, cutoff) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    o.type = type;
    o.frequency.value = freq;
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f).connect(g).connect(this.music);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  chord(n, t) {
    for (const k of [0, 7, 12]) this.tone(NOTE(n + k), t, 0.09, 'sawtooth', 0.05, 2200);
  }

  kick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(g).connect(this.music);
    o.start(t);
    o.stop(t + 0.16);
  }

  noiseHit(t, dur, vol, type, freq, dest = this.music) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur);
  }

  snare(t) {
    this.noiseHit(t, 0.12, 0.35, 'bandpass', 1800);
    this.tone(190, t, 0.06, 'triangle', 0.2, 2000);
  }

  hat(t, vol) {
    this.noiseHit(t, 0.03, vol, 'highpass', 7000);
  }

  // Sound effects ----------------------------------------------------------
  sfx(name) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (name === 'checkpoint') {
      [72, 76, 79, 84].forEach((n, i) => this.fx(NOTE(n), t + i * 0.06, 0.12, 'square', 0.12));
    } else if (name === 'crash') {
      this.noiseHit(t, 0.25, 0.6, 'lowpass', 600, this.master);
    } else if (name === 'jump') {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.frequency.setValueAtTime(300, t);
      o.frequency.exponentialRampToValueAtTime(900, t + 0.25);
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + 0.3);
    } else if (name === 'land') {
      this.fx(NOTE(84), t, 0.1, 'triangle', 0.15);
      this.fx(NOTE(91), t + 0.07, 0.15, 'triangle', 0.15);
    } else if (name === 'secret') {
      [79, 83, 86, 91, 95].forEach((n, i) => this.fx(NOTE(n), t + i * 0.07, 0.2, 'triangle', 0.14));
    } else if (name === 'win') {
      [64, 67, 71, 76, 79, 83, 88].forEach((n, i) => this.fx(NOTE(n), t + i * 0.08, 0.25, 'square', 0.1));
    } else if (name === 'timeout') {
      [64, 60, 55, 52].forEach((n, i) => this.fx(NOTE(n), t + i * 0.15, 0.3, 'sawtooth', 0.12));
    } else if (name === 'horn') {
      // Two-tone car horn.
      for (const f of [392, 494]) this.fx(f, t, 0.35, 'square', 0.06);
      for (const f of [392, 494]) this.fx(f, t + 0.42, 0.25, 'square', 0.05);
    } else if (name === 'bump') {
      this.noiseHit(t, 0.18, 0.7, 'lowpass', 300, this.master);
      this.fx(110, t, 0.12, 'triangle', 0.25);
      this.noiseHit(t + 0.02, 0.12, 0.25, 'bandpass', 2500, this.master);
    } else if (name === 'whoosh') {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 2;
      f.frequency.setValueAtTime(400, t);
      f.frequency.exponentialRampToValueAtTime(2500, t + 0.2);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      src.connect(f).connect(g).connect(this.master);
      src.start(t);
      src.stop(t + 0.26);
    } else if (name === 'hey') {
      this.fx(NOTE(81), t, 0.08, 'sine', 0.12);
      this.fx(NOTE(88), t + 0.09, 0.12, 'sine', 0.12);
    } else if (name === 'tick') {
      this.fx(NOTE(96), t, 0.05, 'square', 0.08);
    }
  }

  fx(freq, t, dur, type, vol) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // The shouted hook. Uses the browser's speech voice when there is one.
  shout(text = 'Pizza Driver!') {
    if (this.muted || !('speechSynthesis' in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 1.15;
      u.pitch = 1.3;
      u.volume = 0.9;
      speechSynthesis.speak(u);
    } catch { /* no voice available */ }
  }
}
