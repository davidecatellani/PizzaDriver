import * as THREE from 'three';
import { Look, SUN_DIR } from './look.js';
import { Fx } from './fx.js';
import { People } from './people.js';
import { CELL, DELIVERIES, RACE, PLAYER, RIVALS } from './config.js';
import { loadModels } from './assets.js';
import { World } from './world.js';
import { Nav } from './nav.js';
import { Minimap } from './minimap.js';
import { Player } from './player.js';
import { makeRivals } from './rivals.js';
import { Traffic } from './traffic.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import * as SDK from './sdk.js';
import { Profile } from './shop.js';
import { Garage } from './garage.js';
import { Ranking } from './ranking.js';

const $ = (id) => document.getElementById(id);
const ui = {
  hud: $('hud'), time: $('time'), position: $('position'), heat: $('heat'), boost: $('boost'), toast: $('toast'),
  menu: $('menu'), countdown: $('countdown'), count: $('count'), timeup: $('timeup'), delivered: $('delivered'),
  result: $('result'), subtitle: $('subtitle'), turn: $('turn'), boostBtn: $('boost-btn'), muteBtn: $('mute-btn'), totalTips: $('total-tips'),
};

const MIDGAME_INTERVAL = 120; // seconds between midgame ads

// 75.34 -> "1:15.3"
const clock = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const RECORD_BONUS = 10;   // tips for beating a delivery's best time

const escapeHtml = (t) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } },
};

class Game {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(65, 1, 0.5, 1200);
    this.look = new Look(this.renderer, this.scene, this.camera);

    this.scene.add(new THREE.HemisphereLight(0xdfeeff, 0x8a7560, 0.9));
    const sun = new THREE.DirectionalLight(0xffe2b8, 3.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 260 });
    this.scene.add(sun, sun.target);
    this.sun = sun;

    this.world = new World(this.scene);
    this.nav = new Nav(this.scene);
    this.fx = new Fx(this.scene);
    this.minimap = new Minimap($('minimap'));
    this.player = new Player(this.scene, this.world);
    this.rivals = makeRivals(this.scene, this.world);
    this.traffic = new Traffic(this.scene);
    this.people = new People(this.scene);
    for (const c of this.people.statics) this.world.posts.push({ x: c.x, z: c.z, r: 0.6 });
    this.traffic.onHonk = (c) => { if (c.pos.distanceTo(this.player.pos) < 25 && this.state === 'race') this.audio.sfx('horn'); };
    this.input = new Input();
    this.audio = new Audio();
    this.audio.setMuted(store.get('muted', false));
    ui.muteBtn.classList.toggle('off', this.audio.muted);


    this.state = 'menu';
    this.lastAd = performance.now() / 1000;
    this.totalTips = store.get('tips', 0);
    this.profile = new Profile(store);
    this.player.equip(this.profile);
    this.garage = new Garage(this, this.profile);
    this.earned = store.get('earned', this.totalTips);   // all-time tips, for the Richest Riders board
    this.ranking = new Ranking(store, RIVALS);
    this.playerName = store.get('name', null);
    this.records = store.get('records', {});   // best delivery time in seconds, by delivery index
    this.deliveryIndex = store.get('delivery', 0) % DELIVERIES.length;
    this.showTotal();
    this.resetRace();
    this.bindUI();
    this.showName();
    if (!this.playerName) this.askName();
    addEventListener('resize', () => this.resize());
    this.resize();
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  bindUI() {
    $('play-btn').onclick = () => this.startRace();
    $('retry-btn').onclick = () => { this.resetRace(); this.startRace(); };
    $('continue-btn').onclick = () => this.rewarded(() => {
      this.timeLeft = RACE.continueBonus;
      this.show(null);
      this.state = 'race';
      SDK.gameplayStart();
      this.audio.startMusic();
    });
    $('double-btn').onclick = () => this.rewarded(() => {
      this.addTips(this.lastTips);
      this.lastTips *= 2;
      this.renderResult();
      this.showRankLine();
      $('double-btn').classList.add('hidden');
    });
    $('next-btn').onclick = async () => {
      if (performance.now() / 1000 - this.lastAd > MIDGAME_INTERVAL) {
        await SDK.showAd('midgame', this.adCallbacks());
        this.lastAd = performance.now() / 1000;
      }
      this.deliveryIndex = (this.deliveryIndex + 1) % DELIVERIES.length;
      store.set('delivery', this.deliveryIndex);
      this.resetRace();
      this.startRace();
    };
    // The garage opens from the menu and from the delivery screen, and returns to it.
    for (const [id, screen] of [['garage-btn', ui.menu], ['garage-btn2', ui.delivered]]) {
      $(id).onclick = () => {
        const back = this.state;
        this.show(null);
        this.state = 'garage';
        this.garageT = 0;
        // Rivals park out of shot while the camera circles the player.
        for (const r of this.rivals) r.mesh.visible = false;
        this.garage.show(() => {
          for (const r of this.rivals) r.mesh.visible = true;
          this.state = back;
          this.show(screen);
          this.showTotal();
        });
      };
    }
    $('ranking-btn').onclick = () => { this.state = 'ranking'; this.renderRanking(); this.show($('ranking')); };
    $('ranking-back').onclick = () => { this.state = 'menu'; this.show(ui.menu); };
    $('rider-name').onclick = () => this.askName();
    const done = () => {
      this.playerName = $('name-input').value.trim().slice(0, 14) || 'Rider';
      store.set('name', this.playerName);
      this.showName();
      this.state = 'menu';
      this.show(ui.menu);
    };
    $('name-ok').onclick = done;
    $('name-input').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') done(); });
    ui.muteBtn.onclick = () => this.toggleMute();
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyM') this.toggleMute();
      if (this.state === 'menu' && (e.code === 'Enter' || e.code === 'Space')) this.startRace();
    });
  }

  toggleMute() {
    this.audio.setMuted(!this.audio.muted);
    store.set('muted', this.audio.muted);
    ui.muteBtn.classList.toggle('off', this.audio.muted);
  }

  adCallbacks() {
    return {
      onStart: () => { this.adPlaying = true; this.audio.setMuted(true); },
      onEnd: () => { this.adPlaying = false; this.audio.setMuted(store.get('muted', false)); },
    };
  }

  async rewarded(grant) {
    const ok = await SDK.showAd('rewarded', this.adCallbacks());
    if (ok) grant();
  }

  // First start (or tapping the name on the menu): ask for the rider's name, offering the
  // CrazyGames account name when the player is logged in.
  async askName() {
    this.state = 'name';
    this.show($('name-screen'));
    const input = $('name-input');
    input.value = this.playerName || (await SDK.username()) || '';
    input.focus();
  }

  showName() {
    $('rider-name').textContent = this.playerName ? `Rider: ${this.playerName} ✎` : '';
  }

  renderRanking() {
    const rows = this.ranking.table(this.playerName || 'You', this.earned);
    $('ranking-list').innerHTML = rows.map((r, i) =>
      `<li class="${r.me ? 'me' : ''}${i === 0 ? ' top' : ''}"><b>${i + 1}</b><span>${escapeHtml(r.name)}</span><em>$${r.tips}</em></li>`).join('');
    $('ranking-list').querySelector('.me')?.scrollIntoView({ block: 'center' });
  }

  show(screen) {
    for (const s of [ui.menu, ui.countdown, ui.timeup, ui.delivered, $('name-screen'), $('ranking')]) s.classList.add('hidden');
    if (screen) screen.classList.remove('hidden');
  }

  resetRace() {
    const d = DELIVERIES[this.deliveryIndex];
    this.delivery = d;
    this.world.setRoute(d);
    this.nav.setPath(d.path);
    const [p0, p1] = d.path;
    const dir = new THREE.Vector2(p1[0] - p0[0], p1[1] - p0[1]).normalize();
    this.player.reset(-dir.x * 5 - dir.y * 4, -dir.y * 5 + dir.x * 4, Math.atan2(dir.x, dir.y));
    for (const r of this.rivals) r.reset(d.path);
    this.clearStart();
    this.timeLeft = this.world.startTime;
    this.cpIndex = 0;
    this.secretsFound = new Set();
    this.raceTime = 0;
    this.lastTick = 99;
    this.world.checkpoints.forEach((c, i) => { c.mesh.visible = i === 0; });
    this.world.customerBeam.visible = false;
    ui.subtitle.textContent = `Napoli · Delivery ${this.deliveryIndex + 1}/${DELIVERIES.length}: ${d.name}`;
    const best = this.records[this.deliveryIndex];
    $('record-line').textContent = best ? `🏆 Record: ${clock(best)}` : '';
    $('hud-best').textContent = best ? `BEST ${clock(best)}` : '';
    this.updateCamera(1);
  }

  // No cars on the first street of the route, or near the start corner, when the race begins.
  clearStart() {
    const p = this.player;
    this.traffic.clearAround(p.pos.x, p.pos.z, 30);
    this.traffic.clearStreet(p.pos.x, p.pos.z, p.heading);
  }

  startRace() {
    this.audio.unlock();
    this.show(ui.countdown);
    ui.hud.classList.remove('hidden');
    ui.boostBtn.classList.remove('hidden');
    ui.boostBtn.textContent = 'TRICK';
    $('brake-btn').classList.remove('hidden');
    $('kick-btn').classList.remove('hidden');
    this.state = 'countdown';
    this.clearStart();
    this.traffic.calm = 9;   // the countdown plus the first seconds of the race
    this.look.watch = true;
    this.countdown = 3;
    ui.count.textContent = '3';
    this.audio.sfx('tick');
    this.audio.bpm = 156;
    this.audio.startMusic();
  }

  addTips(n) {
    this.totalTips += n;
    this.earned += n;
    store.set('tips', this.totalTips);
    store.set('earned', this.earned);
    this.showTotal();
  }

  spendTips(n) {
    this.totalTips -= n;
    store.set('tips', this.totalTips);
    this.showTotal();
  }

  showTotal() {
    ui.totalTips.textContent = this.totalTips ? `Tips earned: $${this.totalTips}` : '';
  }

  toast(text, ms = 1200) {
    ui.toast.textContent = text;
    ui.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => ui.toast.classList.remove('show'), ms);
  }

  rank() {
    const mine = this.nav.remaining();
    return 1 + this.rivals.filter((r) => r.remaining() < mine).length;
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (!this.adPlaying) this.update(dt);
    this.look.render();
  }

  update(dt) {
    const racing = this.state === 'race';
    if (this.state === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n > 0 && ui.count.textContent !== String(n)) { ui.count.textContent = String(n); this.audio.sfx('tick'); }
      if (this.countdown <= 0) {
        this.show(null);
        this.state = 'race';
        this.toast('GO!', 700);
        this.audio.shout('Pizza Driver!');
        SDK.gameplayStart();
      }
    }

    this.traffic.update(dt, [this.player, ...this.rivals, ...this.people.crossing()]);
    const startled = this.people.update(dt, [this.player, ...this.rivals]);
    if (racing) {
      for (const b of startled) {
        this.audio.sfx('hey');
        if (b.close) {
          // Clipped a pedestrian: they leap clear, the rider wobbles and the pizza takes a knock.
          this.player.speed *= 0.6;
          this.player.heat = Math.max(0, this.player.heat - 4);
          this.player.crashT = 0.4;
          this.toast('WATCH IT!', 700);
        }
      }
    }
    this.player.update(dt, this.input, racing);
    for (const r of this.rivals) r.update(dt, racing, this.player);

    if (racing) this.raceLogic(dt);
    this.roadworks(dt);
    this.handleEvents();
    this.fx.update(dt, this.player);
    this.updateHUD();
    this.updateCamera(dt);

    // Spin the active checkpoint ring and follow the player along the route.
    const cp = this.world.checkpoints[this.cpIndex];
    if (cp) cp.ring.rotation.z += dt;
    const p = this.player.pos;
    this.nav.update(p, racing);
    const turn = racing && this.nav.nextTurn();
    ui.turn.classList.toggle('show', !!turn);
    if (turn) ui.turn.textContent = `${turn.side === 'left' ? '⬅' : '➡'} ${Math.max(0, Math.round(turn.dist / 5) * 5)}m`;
    this.minimap.draw(this);
  }

  // Barriers, cones and cobbles at the road works fly off whatever rides or drives into them.
  roadworks(dt) {
    const movers = [this.player, ...this.rivals].map((r) => ({
      who: r, x: r.pos.x, y: r.pos.y, z: r.pos.z, fx: Math.sin(r.heading), fz: Math.cos(r.heading), speed: Math.abs(r.speed), r: 0.6,
    }));
    for (const c of this.traffic.cars) {
      const l = c.lane;
      movers.push({ x: c.pos.x, y: 0, z: c.pos.z, fx: l.axis === 'x' ? l.dir : 0, fz: l.axis === 'z' ? l.dir : 0, speed: c.speed, r: 1.1 });
    }
    for (const m of this.world.updateDebris(dt, movers)) {
      if (!m.who) continue;
      m.who.speed *= 0.9;
      if (m.who === this.player) {
        this.audio.sfx('bump');
        this.fx.dust(this.player.pos, 8);
        this.shake = Math.max(this.shake || 0, 0.15);
      }
    }
  }

  raceLogic(dt) {
    const p = this.player;
    this.raceTime += dt;
    this.timeLeft -= dt;

    // Cars: a real hit shoves the rider away, spins them and cools the pizza. Jumping over is safe.
    const car = this.traffic.hit(p.pos, PLAYER.radius);
    if (car && !this.carCooldown) {
      p.hitBy(car.pos.x, car.pos.z, 8 + p.speed * 0.3 + car.speed * 0.4, 12);
      this.traffic.struck(car, p.pos.x, p.pos.z);
      this.audio.sfx('horn');
      this.shake = 0.6;
      this.toast('CRASH!', 700);
      this.carCooldown = 0.8;
    }
    this.carCooldown = Math.max(0, (this.carCooldown || 0) - dt);

    // Rivals: shoulder-to-shoulder shoves. Boosting into a rival sends them flying.
    for (const r of this.rivals) {
      if (r.finished) continue;
      const c = !r.stun && this.traffic.hit(r.pos, 0.8);
      if (c) {
        r.hitBy(c.pos.x, c.pos.z, 9, 1.2);
        this.traffic.struck(c, r.pos.x, r.pos.z);
        this.fx.sparks(r.pos, 8);
      }
      const dx = r.pos.x - p.pos.x, dz = r.pos.z - p.pos.z;
      if (Math.hypot(dx, dz) < 1.9 && !r.bumpCd && !p.airborne) {
        const mid = new THREE.Vector3((r.pos.x + p.pos.x) / 2, p.pos.y, (r.pos.z + p.pos.z) / 2);
        if (p.boosting) {
          r.hitBy(p.pos.x, p.pos.z, 15, 1.8);
          p.hitBy(r.pos.x, r.pos.z, 2, 0, 0.92);
          this.toast('TAKE THAT!', 700);
        } else {
          r.hitBy(p.pos.x, p.pos.z, 7, 0.5);
          p.hitBy(r.pos.x, r.pos.z, 7, 3, 0.75);
        }
        r.bumpCd = 0.6;
        this.audio.sfx('bump');
        this.fx.sparks(mid, 10);
        this.shake = Math.max(this.shake || 0, 0.3);
      }
    }
    this.kicks(dt);

    // Rivals push each other apart.
    for (let i = 0; i < this.rivals.length; i++) {
      for (let j = i + 1; j < this.rivals.length; j++) {
        const a = this.rivals[i].pos, b = this.rivals[j].pos;
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
        if (d > 0.01 && d < 1.8) {
          const push = (1.8 - d) / 2;
          a.x -= dx / d * push; a.z -= dz / d * push;
          b.x += dx / d * push; b.z += dz / d * push;
        }
      }
    }

    const secret = this.world.secretAt(p.pos.x, p.pos.z);
    if (secret && !this.secretsFound.has(secret.id)) {
      this.secretsFound.add(secret.id);
      this.toast('SECRET SHORTCUT!', 1600);
      this.audio.sfx('secret');
    }

    const cp = this.world.checkpoints[this.cpIndex];
    if (cp && Math.hypot(cp.pos.x - p.pos.x, cp.pos.z - p.pos.z) < 11) {
      cp.mesh.visible = false;
      this.cpIndex++;
      this.timeLeft += cp.time;
      this.toast(`CHECKPOINT +${cp.time}s`);
      this.audio.sfx('checkpoint');
      const next = this.world.checkpoints[this.cpIndex];
      if (next) next.mesh.visible = true;
      else this.world.customerBeam.visible = true;
    }
    if (!cp && p.pos.distanceTo(this.world.customerPos) < 10) return this.deliver();

    this.audio.bpm = this.timeLeft < RACE.hurryTime ? 180 : 156;
    const sec = Math.ceil(this.timeLeft);
    if (sec <= 5 && sec !== this.lastTick && sec > 0) { this.lastTick = sec; this.audio.sfx('tick'); }
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.state = 'timeup';
      SDK.gameplayStop();
      this.audio.stopMusic();
      this.audio.sfx('timeout');
      this.show(ui.timeup);
    }
  }

  deliver() {
    this.state = 'delivered';
    this.player.cheer = true;
    SDK.gameplayStop();
    SDK.happyTime();
    this.audio.stopMusic();
    this.audio.sfx('win');
    this.audio.shout('Pizza Driver!');
    const place = this.rank();
    const base = [25, 15, 10, 5][place - 1];
    const timeBonus = Math.round(this.timeLeft);
    const heatBonus = Math.round(this.player.heat / 10);
    const secretBonus = 5 * this.secretsFound.size;
    // Fastest delivery on this route.
    const best = this.records[this.deliveryIndex];
    const record = !best || this.raceTime < best;
    if (record) {
      this.records[this.deliveryIndex] = this.raceTime;
      store.set('records', this.records);
      this.toast('NEW RECORD!', 2500);
    }
    this.lastRecord = { time: this.raceTime, best, record };
    const recordBonus = record && best ? RECORD_BONUS : 0;
    this.lastPlace = place;
    this.lastTips = base + timeBonus + heatBonus + secretBonus + recordBonus;
    this.lastBreakdown = { base, timeBonus, heatBonus, secretBonus, recordBonus };
    const before = this.ranking.place(this.playerName, this.earned);
    // The rivals are paid by where they finished.
    const mine = this.nav.remaining();
    const order = [...this.rivals.map((r) => ({ name: r.def.name, left: r.remaining() })), { name: null, left: mine }].sort((a, b) => a.left - b.left);
    this.ranking.afterDelivery(Object.fromEntries(order.map((o, i) => [o.name, i + 1])));
    this.addTips(this.lastTips);
    this.rankBefore = before;
    this.showRankLine();
    $('double-btn').classList.remove('hidden');
    this.renderResult();
    this.show(ui.delivered);
  }

  showRankLine() {
    const now = this.ranking.place(this.playerName, this.earned);
    const n = this.ranking.riders.length + 1;
    const up = this.rankBefore - now;
    $('rank-line').textContent = `Richest riders: #${now} of ${n}${up > 0 ? `  ▲ up ${up}` : ''}`;
  }

  renderResult() {
    const b = this.lastBreakdown;
    const ord = ['1st', '2nd', '3rd', '4th'][this.lastPlace - 1];
    ui.result.innerHTML = `
      Position: <b>${ord}</b> (+$${b.base})<br>
      Time left: <b>${b.timeBonus}s</b> (+$${b.timeBonus})<br>
      Pizza heat: <b>${Math.round(this.player.heat)}%</b> (+$${b.heatBonus})<br>
      ${b.secretBonus ? `Secret shortcuts: <b>${b.secretBonus / 5}</b> (+$${b.secretBonus})<br>` : ''}
      ${b.recordBonus ? `New record bonus (+$${b.recordBonus})<br>` : ''}
      Tips: <b>$${this.lastTips}</b>`;
    const r = this.lastRecord;
    $('record-result').innerHTML = r.record
      ? `<span class="new-record">🏆 NEW RECORD ${clock(r.time)}</span>${r.best ? ` <small>(${(r.time - r.best).toFixed(1)}s)</small>` : ''}`
      : `Time ${clock(r.time)} · Record ${clock(r.best)} <small>(+${(r.time - r.best).toFixed(1)}s)</small>`;
  }

  // Side kicks, as in Radical Bikers: the player kicks with Z / X (or KICK), rivals riding
  // alongside kick back. A kick lands if the target is beside the kicker at the peak of the swing.
  kicks(dt) {
    const p = this.player;
    const beside = (a, b) => {
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const h = a.heading;
      return { lateral: dx * Math.cos(h) - dz * Math.sin(h), along: dx * Math.sin(h) + dz * Math.cos(h) };
    };
    const lands = (kicker, target) => {
      const k = kicker.kick;
      if (!k || k.hit || k.t < 0.25 || k.t > 0.75 || target.airborne) return false;
      const { lateral, along } = beside(kicker, target);
      return lateral * k.side > 0.4 && lateral * k.side < 3.4 && Math.abs(along) < 2.6;
    };

    let want = this.input.takeKick();
    if (want !== null && !p.airborne) {
      if (want === 0) {
        // Towards the nearest rival, left if nobody is close.
        let best = null;
        for (const r of this.rivals) {
          const d = r.pos.distanceTo(p.pos);
          if (!r.finished && d < 6 && (!best || d < best.d)) best = { d, side: Math.sign(beside(p, r).lateral) || 1 };
        }
        want = best ? best.side : 1;
      }
      if (p.startKick(want)) this.audio.sfx('whoosh');
    }
    for (const k of [p, ...this.rivals]) if (k.kick) this.fx.kickTrail(k);
    for (const r of this.rivals) {
      if (r.finished) continue;
      if (lands(p, r)) {
        p.kick.hit = true;
        r.hitBy(p.pos.x, p.pos.z, 13, 1.5);
        this.audio.sfx('bump');
        this.fx.impact(r.pos);
        this.shake = 0.3;
        this.toast('KICK!', 600);
      }
      // Rivals kick when the player rides alongside them.
      const { lateral, along } = beside(r, p);
      if (!r.kick && !r.stun && Math.abs(lateral) > 0.6 && Math.abs(lateral) < 3 && Math.abs(along) < 2
          && Math.random() < dt * 1.6 * (r.def.aggression ?? 0.5)) {
        if (r.startKick(Math.sign(lateral))) this.audio.sfx('whoosh');
        r.kickCd = 1.2 + Math.random() * 1.5;
      }
      if (lands(r, p)) {
        r.kick.hit = true;
        p.hitBy(r.pos.x, r.pos.z, 9, 6, 0.7);
        this.fx.impact(p.pos);
        this.shake = 0.35;
        this.toast(`${r.def.name.toUpperCase()} KICKED YOU!`, 800);
      }
    }
  }

  handleEvents() {
    for (const e of this.player.events) {
      if (e.type === 'crash') { this.audio.sfx('crash'); this.fx.sparks(this.player.pos); }
      if (e.type === 'hit') { this.audio.sfx('bump'); this.fx.sparks(this.player.pos, 14); }
      if (e.type === 'jump') { this.audio.sfx('jump'); if (e.wheelie) this.toast('WHEELIE JUMP!', 700); }
      if (e.type === 'trick') this.audio.sfx('checkpoint');
      if (e.type === 'drift') { this.audio.sfx('land'); this.toast('DRIFT! +TURBO'); }
      if (e.type === 'land') {
        this.fx.dust(this.player.pos, e.wipeout ? 30 : 18);
        if (e.wipeout) {
          this.audio.sfx('crash');
          this.shake = 0.5;
          this.toast('WIPEOUT!', 900);
        } else if (e.clean) {
          this.audio.sfx('land');
          const label = e.trick ? 'TRICK!' : e.airTime > 0.9 ? 'BIG AIR!' : 'CLEAN LANDING!';
          this.toast(`${label} +${e.gained.toFixed(1)}s TURBO`);
        }
      }
    }
    this.player.events.length = 0;
  }

  updateHUD() {
    if (this.state === 'menu') return;
    const t = Math.max(0, Math.ceil(this.timeLeft));
    ui.time.textContent = t;
    $('hud-run').textContent = clock(this.raceTime);
    const best = this.records[this.deliveryIndex];
    $('hud-run').classList.toggle('over', !!best && this.raceTime > best);   // too slow for the record now
    ui.time.classList.toggle('hurry', this.timeLeft < RACE.hurryTime);
    const place = this.rank();
    const suf = ['st', 'nd', 'rd', 'th'][place - 1];
    ui.position.innerHTML = `${place}<sup>${suf}</sup><span>/4</span>`;
    ui.heat.style.width = `${this.player.heat}%`;
    ui.boost.style.width = `${this.player.boost * 100}%`;
  }

  updateCamera(dt) {
    const p = this.player;
    if (this.state === 'garage') {
      // Slow turntable round the rider, who stands clear of the shop panel.
      this.garageT += dt;
      const a = p.heading + 0.6 + Math.sin(this.garageT * 0.4) * 0.9;
      const cam = this.camera;
      cam.position.set(p.pos.x + Math.sin(a) * 4.6, p.pos.y + 1.9, p.pos.z + Math.cos(a) * 4.6);
      const portrait = innerHeight > innerWidth;
      const right = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
      const target = new THREE.Vector3(p.pos.x, p.pos.y + (portrait ? -0.4 : 1.1), p.pos.z);
      if (!portrait) target.addScaledVector(right, 1.6);
      cam.lookAt(target);
      return;
    }
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    const want = new THREE.Vector3(p.pos.x - fx * 9, p.pos.y + 4.5, p.pos.z - fz * 9);
    const k = 1 - Math.exp(-6 * dt);
    this.camera.position.lerp(want, k);
    this.camera.lookAt(p.pos.x + fx * 6, p.pos.y + 1.5, p.pos.z + fz * 6);
    // Shake after hits.
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const a = this.shake * 0.5;
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
    }
    const fov = 65 + (p.boosting ? 12 : 0) + Math.min(8, p.speed * 0.15);
    this.camera.fov += (fov - this.camera.fov) * k;
    this.camera.updateProjectionMatrix();
    this.sun.position.copy(p.pos).addScaledVector(SUN_DIR, 120);
    this.sun.target.position.copy(p.pos);
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.look.setSize(innerWidth, innerHeight);
    this.fx.setHeight(innerHeight);
  }
}

(async () => {
  await SDK.initSDK();
  SDK.loadingStart();
  await loadModels();
  window.game = new Game();
  SDK.loadingStop();
})();
