// Original procedural soundtrack and sound effects, all synthesized with WebAudio: the build ships
// no audio files. Each city has its own driving-rock song (distorted power-chord guitars, bass,
// drums and a city lead: mandolin in Napoli, accordion in Paris, brass in Manhattan) with a gang
// chant of "PIZZA DRIIIVER" on the chorus. Riding sounds (electric motor, turbo, tyre squeal,
// sirens) follow the player every frame.

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
const H = '-';   // in a melody: hold the previous note

// Song form, in bars: an intro once, then verse, chorus and break round and round.
const INTRO = 4, VERSE = 8, CHORUS = 8, BREAK = 4, LOOP = VERSE + CHORUS + BREAK;

// Melodies are bars of eight eighth-notes: MIDI note, H (hold) or null (rest).
// Chorus bars 3 and 7 leave room for the chant.
const SONGS = {
  napoli: {
    bpm: 160, lead: 'mandolin',
    verse: [40, 36, 38, 35], chorus: [36, 38, 40, 40, 36, 38, 35, 35],
    verseLead: [[76, H, 79, H, 78, 76, 75, H], [76, H, 72, H, 74, 76, 72, H], [74, H, 78, H, 81, 79, 78, H], [75, H, H, 71, H, 75, 78, H]],
    chorusLead: [[79, H, 79, 81, H, 79, 76, H], [78, H, 78, 79, H, 78, 74, H], [76, H, H, H, null, null, null, null], [null, null, null, null, 83, 81, 79, 78],
      [79, H, 79, 81, H, 79, 76, H], [78, H, 78, 79, H, 81, 83, H], [76, H, H, H, null, null, null, null], [null, null, null, null, 75, 76, 78, 79]],
  },
  paris: {
    bpm: 150, lead: 'accordion',
    verse: [38, 34, 36, 33], chorus: [31, 36, 29, 33, 31, 36, 33, 33],
    verseLead: [[74, H, 77, 76, 74, H, 73, 74], [77, H, 81, 79, 77, H, 76, 74], [76, H, 79, 77, 76, H, 74, 72], [73, H, H, 76, H, H, 69, H]],
    chorusLead: [[79, H, 77, H, 74, H, 77, 79], [81, H, 79, H, 76, H, 72, H], [77, H, H, H, null, null, null, null], [null, null, null, null, 76, 77, 79, 73],
      [79, H, 77, H, 74, H, 77, 79], [81, H, 79, H, 76, H, 79, 81], [74, H, H, H, null, null, null, null], [null, null, null, null, 73, 74, 76, 77]],
  },
  manhattan: {
    bpm: 170, lead: 'brass',
    verse: [45, 41, 43, 40], chorus: [41, 43, 45, 45, 41, 43, 40, 40],
    verseLead: [[81, null, 81, null, 79, 81, null, 76], [77, null, 77, null, 76, 77, null, 72], [79, null, 79, null, 77, 79, null, 74], [76, H, H, null, 80, H, 83, H]],
    chorusLead: [[84, H, 83, H, 81, H, 79, H], [83, H, 81, H, 79, H, 76, H], [81, H, H, H, null, null, null, null], [null, null, null, null, 80, 81, 83, 84],
      [84, H, 83, H, 81, H, 79, H], [83, H, 81, H, 79, H, 83, H], [81, H, H, H, null, null, null, null], [null, null, null, null, 76, 79, 80, 83]],
  },
};

// City horns: two pitches and a wave.
const HORNS = {
  napoli: { f: [440, 554], wave: 'square', beats: 2 },
  paris: { f: [523, 392], wave: 'square', beats: 2 },
  manhattan: { f: [311, 370], wave: 'sawtooth', beats: 1 },
};

// Vowel formants (Hz) for the chant.
const VOWEL = { i: [300, 2200, 3000], a: [750, 1150, 2500], e: [500, 1500, 2400], r: [450, 1250, 1600] };

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.song = SONGS.napoli;
    this.city = 'napoli';
    this.hurry = false;
    this.step = 0;
    this.playing = false;
  }

  unlock() {
    if (!this.ctx) {
      const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      this.master.connect(comp).connect(ctx.destination);
      this.music = ctx.createGain();
      this.music.gain.value = 0.62;
      this.music.connect(this.master);
      this.noise = this.makeNoise();
      this.guitarBus();
      this.ride();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  makeNoise() {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
    if (m && 'speechSynthesis' in window) speechSynthesis.cancel();
  }

  // The city's song and horn. Takes effect from the next start of the music.
  setCity(id) {
    this.city = SONGS[id] ? id : 'napoli';
    this.song = SONGS[this.city];
  }

  get bpm() { return this.song.bpm * (this.hurry ? 1.12 : 1); }

  startMusic() {
    if (!this.ctx || this.playing) return;
    this.playing = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stopMusic() {
    this.playing = false;
    clearInterval(this.timer);
  }

  schedule() {
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += 60 / this.bpm / 4;
      this.step++;
    }
  }

  // --- The song -----------------------------------------------------------

  section(bar) {
    if (bar < INTRO) return { name: 'intro', i: bar };
    const r = (bar - INTRO) % LOOP;
    if (r < VERSE) return { name: 'verse', i: r };
    if (r < VERSE + CHORUS) return { name: 'chorus', i: r - VERSE };
    return { name: 'break', i: r - VERSE - CHORUS };
  }

  playStep(step, t) {
    const S = this.song, s = step % 16, bar = Math.floor(step / 16);
    const sec = this.section(bar);
    const root = sec.name === 'chorus' ? S.chorus[sec.i % S.chorus.length] : S.verse[sec.i % S.verse.length];
    const e8 = s % 2 === 0 ? s / 2 : -1;   // eighth-note index in the bar, or -1 on an off-16th
    const beat = 60 / this.bpm;

    // Drums.
    if (sec.name === 'break') {
      if (s === 0 || s === 10) this.kick(t);
      if (s === 8) this.snare(t);
      if (s % 4 === 2) this.hat(t, 0.05);
    } else {
      const chorus = sec.name === 'chorus';
      if (chorus ? s % 4 === 0 : (s === 0 || s === 6 || s === 8)) this.kick(t);
      if (s === 4 || s === 12) this.snare(t);
      if (sec.name === 'intro' && sec.i === INTRO - 1 && s >= 12) this.snare(t, 0.25);   // fill into the verse
      if (s % 2 === 0) this.hat(t, chorus && s % 4 === 2 ? 0.08 : 0.04, chorus && s % 4 === 2 ? 0.09 : 0.03);
      if (s === 0 && (sec.i === 0 || (chorus && sec.i === 4))) this.crash(t);
    }

    // Bass: driving eighths, octave jumps in the chorus.
    if (e8 >= 0) {
      const up = sec.name === 'chorus' && e8 % 2 === 1 ? 12 : 0;
      if (sec.name !== 'break' || e8 % 2 === 0) this.bass(NOTE(root + up), t, beat * 0.45);
    }

    // Guitars: palm-muted chugs in the intro and verse, big open chords in the chorus.
    if (sec.name === 'intro' || sec.name === 'verse') {
      if (e8 >= 0) this.power(root + 12, t, e8 === 0 || e8 === 3 ? beat * 0.4 : beat * 0.16, e8 === 0 || e8 === 3 ? 0.13 : 0.08);
    } else if (sec.name === 'chorus') {
      if (s === 0) this.power(root + 12, t, beat * 1.4, 0.14);
      if (s === 6) this.power(root + 12, t, beat * 2.2, 0.14);
    }

    // Lead.
    const melody = sec.name === 'verse' ? S.verseLead[sec.i % 4] : sec.name === 'chorus' ? S.chorusLead[sec.i] : null;
    if (melody && e8 >= 0) {
      const n = melody[e8];
      if (n !== null && n !== H) {
        let len = 1;
        while (e8 + len < 8 && melody[e8 + len] === H) len++;
        this.lead(S.lead, NOTE(n), t, len * beat / 2);
      }
    }

    // The chant: on the chorus bars where the lead rests, and once in each break.
    if (s === 0 && ((sec.name === 'chorus' && (sec.i === 2 || sec.i === 6)) || (sec.name === 'break' && sec.i === 0))) {
      this.chant(t, beat);
    }
  }

  // --- Instruments ----------------------------------------------------------

  // Distortion shared by all guitar notes, so power chords crunch together like a real amp.
  guitarBus() {
    const ctx = this.ctx;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 6); }
    shaper.curve = curve;
    shaper.oversample = '2x';
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 110;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3400;
    const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 900; mid.gain.value = 4;
    const out = ctx.createGain(); out.gain.value = 0.16;
    this.guitar = ctx.createGain();
    this.guitar.connect(shaper).connect(hp).connect(mid).connect(lp).connect(out).connect(this.music);
  }

  power(n, t, dur, vol) {
    for (const k of [0, 7, 12]) {
      for (const det of [-7, 7]) {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.value = NOTE(n + k);
        o.detune.value = det;
        g.gain.setValueAtTime(vol, t);
        g.gain.setTargetAtTime(0, t + dur * 0.7, dur * 0.25);
        o.connect(g).connect(this.guitar);
        o.start(t);
        o.stop(t + dur * 1.6);
      }
    }
  }

  bass(freq, t, dur) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = freq;
    o2.type = 'square'; o2.frequency.value = freq / 2;
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1400, t);
    f.frequency.exponentialRampToValueAtTime(300, t + dur);
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f); o2.connect(f);
    f.connect(g).connect(this.music);
    for (const x of [o, o2]) { x.start(t); x.stop(t + dur + 0.02); }
  }

  lead(kind, freq, t, dur) {
    const ctx = this.ctx;
    if (kind === 'mandolin') {
      // Tremolo picking: the note re-plucked every 32nd.
      const pick = 60 / this.bpm / 8;
      for (let k = 0; k * pick < dur - 0.01; k++) {
        const tt = t + k * pick;
        for (const [f, type, v] of [[freq, 'triangle', 0.1], [freq * 2.003, 'square', 0.025]]) {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = type; o.frequency.value = f;
          g.gain.setValueAtTime(k % 2 ? v * 0.7 : v, tt);
          g.gain.exponentialRampToValueAtTime(0.001, tt + pick * 1.8);
          o.connect(g).connect(this.music);
          o.start(tt); o.stop(tt + pick * 2);
        }
      }
      return;
    }
    const o = [], g = ctx.createGain(), f = ctx.createBiquadFilter();
    const vib = ctx.createOscillator(), vibAmt = ctx.createGain();
    vib.frequency.value = kind === 'accordion' ? 5.5 : 5;
    vibAmt.gain.value = freq * (kind === 'accordion' ? 0.006 : 0.004);
    vib.connect(vibAmt);
    const voices = kind === 'accordion' ? [[1, 'square', 0.05], [1.008, 'square', 0.05], [0.5, 'sawtooth', 0.03]]
      : [[1, 'sawtooth', 0.06], [1.006, 'sawtooth', 0.05], [0.994, 'sawtooth', 0.05]];
    for (const [m, type, v] of voices) {
      const x = ctx.createOscillator(), xg = ctx.createGain();
      x.type = type; x.frequency.value = freq * m;
      vibAmt.connect(x.frequency);
      xg.gain.value = v;
      x.connect(xg).connect(f);
      o.push(x);
    }
    f.type = 'lowpass';
    if (kind === 'brass') {
      f.Q.value = 2;
      f.frequency.setValueAtTime(500, t);
      f.frequency.exponentialRampToValueAtTime(3800, t + 0.06);
      f.frequency.exponentialRampToValueAtTime(1600, t + 0.25);
    } else f.frequency.value = 2600;
    const a = kind === 'brass' ? 0.03 : 0.04;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1, t + a);
    g.gain.setValueAtTime(1, t + Math.max(a, dur - 0.05));
    g.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.08);
    f.connect(g).connect(this.music);
    for (const x of [...o, vib]) { x.start(t); x.stop(t + dur + 0.1); }
  }

  kick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g).connect(this.music);
    o.start(t); o.stop(t + 0.21);
    this.noiseHit(t, 0.015, 0.3, 'highpass', 3000);   // beater click
  }

  noiseHit(t, dur, vol, type, freq, dest = this.music, q = 0.8) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.01);
  }

  snare(t, vol = 0.38) {
    this.noiseHit(t, 0.16, vol, 'bandpass', 2200, this.music, 0.6);
    this.tone(200, t, 0.07, 'triangle', vol * 0.6);
  }

  hat(t, vol, dur = 0.03) { this.noiseHit(t, dur, vol, 'highpass', 7500); }
  crash(t) { this.noiseHit(t, 1.4, 0.16, 'highpass', 5000); }

  tone(freq, t, dur, type, vol, dest = this.music) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // "PIZ-ZA DRIIII-VER!": a gang of shouting voices made with formant filters. `beat` in seconds.
  chant(t, beat, dest = this.music, vol = 1) {
    const sylls = [
      // [start in beats, length in beats, consonant, vowel, pitch from, pitch to]
      [0, 0.45, 'p', 'i', 0, 0],
      [0.5, 0.45, 'z', 'a', 0, -2],
      [1, 1.6, 'd', 'i', 0, 4],
      [2.75, 0.9, 'v', 'r', -2, -7],
    ];
    for (const [voice, base, pan] of [[0, 57, -0.3], [1, 57.2, 0.3], [2, 45, 0], [3, 64, 0]]) {
      const v = voice === 3 ? 0.35 : 1;   // a higher voice on top, quieter
      for (const [at, len, cons, vow, p0, p1] of sylls) {
        const t0 = t + at * beat + voice * 0.012, d = len * beat;
        this.voiced(t0 + 0.03, d, NOTE(base + p0), NOTE(base + p1), VOWEL[vow], vow === 'r' ? VOWEL.e : null, 0.09 * v * vol, pan, dest);
        if (voice === 0) this.consonant(t0, cons, 0.5 * vol, dest);
      }
    }
  }

  voiced(t, dur, f0, f1, formants, toFormants, vol, pan, dest) {
    const ctx = this.ctx;
    const src = ctx.createOscillator();
    src.type = 'sawtooth';
    src.frequency.setValueAtTime(f0, t);
    src.frequency.linearRampToValueAtTime(f1, t + dur);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(vol, t + 0.03);
    out.gain.setValueAtTime(vol, t + dur * 0.75);
    out.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (p.pan) p.pan.value = pan;
    formants.forEach((F, k) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = [6, 10, 12][k];
      bp.frequency.setValueAtTime(F, t);
      if (toFormants) bp.frequency.linearRampToValueAtTime(toFormants[k], t + dur);
      const g = ctx.createGain();
      g.gain.value = [1.4, 0.9, 0.5][k];
      src.connect(bp).connect(g).connect(out);
    });
    out.connect(p).connect(dest);
    src.start(t); src.stop(t + dur + 0.02);
  }

  consonant(t, c, vol, dest) {
    if (c === 'p' || c === 'd') this.noiseHit(t, 0.025, vol, 'bandpass', c === 'p' ? 1200 : 3000, dest, 0.7);
    if (c === 'z') this.noiseHit(t, 0.07, vol * 0.5, 'highpass', 4500, dest);
    if (c === 'v') this.noiseHit(t, 0.06, vol * 0.3, 'bandpass', 2500, dest);
  }

  // --- Riding sounds, updated every frame -----------------------------------

  ride() {
    const ctx = this.ctx;
    const out = this.rideOut = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.master);
    // Electric motor: a whine and its harmonic through a soft filter.
    this.motor = [ctx.createOscillator(), ctx.createOscillator()];
    this.motor[0].type = 'sawtooth'; this.motor[1].type = 'sine';
    const mf = this.motorFilter = ctx.createBiquadFilter();
    mf.type = 'lowpass'; mf.frequency.value = 800; mf.Q.value = 3;
    this.motorGain = ctx.createGain(); this.motorGain.gain.value = 0;
    const g1 = ctx.createGain(); g1.gain.value = 0.25;
    this.motor[0].connect(mf); this.motor[1].connect(g1).connect(mf);
    mf.connect(this.motorGain).connect(out);
    // Wind and tyres on the paving.
    const loop = (freq, type, q) => {
      const s = ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      s.connect(f).connect(g).connect(out);
      s.start();
      return { f, g };
    };
    this.wind = loop(700, 'bandpass', 0.5);
    this.turboNoise = loop(3000, 'highpass', 0.7);
    this.squeal = loop(1900, 'bandpass', 14);
    // A police siren (Manhattan): a wailing tone whose loudness follows the nearest cruiser.
    this.siren = ctx.createOscillator();
    this.siren.type = 'square';
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.frequency.value = 0.45; depth.gain.value = 260;
    this.siren.frequency.value = 900;
    lfo.connect(depth).connect(this.siren.frequency);
    const sf = ctx.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 2200;
    this.sirenGain = ctx.createGain(); this.sirenGain.gain.value = 0;
    this.siren.connect(sf).connect(this.sirenGain).connect(out);
    for (const o of [...this.motor, this.siren, lfo]) o.start();
  }

  // `p`: { speed (m/s), boosting, drift (s), airborne }, `on`: riding sounds audible, `siren`: 0..1.
  drive(p, on, siren = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, k = 0.06;
    const v = Math.min(1.4, Math.abs(p.speed) / 30);
    this.rideOut.gain.setTargetAtTime(on ? 1 : 0, t, 0.15);
    const pitch = 70 + v * 210 + (p.boosting ? 90 : 0) + (p.airborne ? 40 : 0);
    this.motor[0].frequency.setTargetAtTime(pitch, t, k);
    this.motor[1].frequency.setTargetAtTime(pitch * 2.02, t, k);
    this.motorFilter.frequency.setTargetAtTime(500 + v * 1600, t, k);
    this.motorGain.gain.setTargetAtTime(0.025 + v * 0.06, t, k);
    this.wind.g.gain.setTargetAtTime(v * v * 0.08, t, k);
    this.turboNoise.g.gain.setTargetAtTime(p.boosting ? 0.07 : 0, t, 0.05);
    const sliding = p.drift > 0 && !p.airborne && v > 0.3;
    this.squeal.g.gain.setTargetAtTime(sliding ? 0.09 : 0, t, 0.04);
    this.squeal.f.frequency.setTargetAtTime(1700 + Math.sin(t * 23) * 200, t, 0.02);
    this.sirenGain.gain.setTargetAtTime(siren * 0.035, t, 0.2);
  }

  // --- Sound effects ------------------------------------------------------------

  sfx(name) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, M = this.master;
    if (name === 'checkpoint') {
      [72, 76, 79, 84].forEach((n, i) => this.tone(NOTE(n), t + i * 0.06, 0.14, 'square', 0.09, M));
    } else if (name === 'crash') {
      // Metal and plastic: a thud, a clang and scraping.
      this.noiseHit(t, 0.3, 0.7, 'lowpass', 500, M);
      for (const f of [523, 741, 1187]) this.tone(f, t, 0.35, 'square', 0.04, M);
      this.noiseHit(t + 0.05, 0.4, 0.25, 'bandpass', 3500, M, 2);
    } else if (name === 'jump') {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(260, t);
      o.frequency.exponentialRampToValueAtTime(820, t + 0.22);
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      o.connect(g).connect(M);
      o.start(t); o.stop(t + 0.3);
      this.noiseHit(t, 0.25, 0.15, 'bandpass', 1200, M);
    } else if (name === 'land') {
      this.noiseHit(t, 0.12, 0.5, 'lowpass', 250, M);
      this.tone(NOTE(84), t + 0.03, 0.1, 'triangle', 0.13, M);
      this.tone(NOTE(91), t + 0.1, 0.16, 'triangle', 0.13, M);
    } else if (name === 'secret') {
      [79, 83, 86, 91, 95].forEach((n, i) => this.tone(NOTE(n), t + i * 0.07, 0.22, 'triangle', 0.13, M));
    } else if (name === 'win') {
      // Delivery fanfare.
      [[64, 0, 0.12], [67, 0.12, 0.12], [71, 0.24, 0.12], [76, 0.36, 0.5], [74, 0.9, 0.12], [76, 1.02, 0.7]].forEach(([n, at, d]) => {
        this.tone(NOTE(n), t + at, d + 0.1, 'square', 0.08, M);
        this.tone(NOTE(n - 12), t + at, d + 0.1, 'sawtooth', 0.05, M);
      });
      this.noiseHit(t + 0.36, 1.2, 0.12, 'highpass', 5000, M);
    } else if (name === 'record') {
      [76, 79, 83, 88, 91, 95, 100].forEach((n, i) => this.tone(NOTE(n), t + i * 0.05, 0.3, 'triangle', 0.1, M));
      this.chant(t + 0.45, 0.3, M, 0.7);
    } else if (name === 'tips') {
      this.tone(NOTE(88), t, 0.08, 'square', 0.07, M);
      this.tone(NOTE(95), t + 0.07, 0.25, 'square', 0.07, M);
    } else if (name === 'timeout') {
      [64, 60, 55, 52].forEach((n, i) => this.tone(NOTE(n), t + i * 0.15, 0.3, 'sawtooth', 0.11, M));
    } else if (name === 'horn') {
      const h = HORNS[this.city];
      for (let b = 0; b < h.beats; b++) {
        const at = t + b * 0.22, d = h.beats === 1 ? 0.6 : 0.16;
        for (const f of h.f) this.tone(f, at, d, h.wave, 0.05, M);
      }
    } else if (name === 'bump') {
      this.noiseHit(t, 0.18, 0.7, 'lowpass', 300, M);
      this.tone(110, t, 0.12, 'triangle', 0.25, M);
      this.noiseHit(t + 0.02, 0.12, 0.25, 'bandpass', 2500, M);
    } else if (name === 'punch') {
      this.noiseHit(t, 0.08, 0.8, 'lowpass', 900, M);
      this.tone(90, t, 0.15, 'sine', 0.4, M);
    } else if (name === 'clatter') {
      for (let i = 0; i < 5; i++) this.noiseHit(t + i * 0.05 + Math.random() * 0.03, 0.06, 0.25, 'bandpass', 1500 + Math.random() * 2500, M, 4);
    } else if (name === 'whoosh') {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass'; f.Q.value = 2;
      f.frequency.setValueAtTime(400, t);
      f.frequency.exponentialRampToValueAtTime(2500, t + 0.2);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      src.connect(f).connect(g).connect(M);
      src.start(t); src.stop(t + 0.26);
    } else if (name === 'hey') {
      // A startled pedestrian: a short shouted "eh!".
      this.voiced(t, 0.22, 330, 280, VOWEL.e, null, 0.12, 0, M);
      this.voiced(t, 0.22, 240, 200, VOWEL.e, null, 0.08, 0, M);
    } else if (name === 'tick') {
      this.tone(NOTE(96), t, 0.05, 'square', 0.08, M);
    }
  }

  // The hook shouted at the start and at each delivery: the synth gang chant (same on every device).
  shout() {
    if (!this.ctx || this.muted) return;
    this.chant(this.ctx.currentTime + 0.05, 0.22, this.master, 0.9);
  }
}
