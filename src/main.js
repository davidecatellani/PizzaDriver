import * as THREE from 'three';
import { Look, SUN_DIR } from './look.js';
import { Fx } from './fx.js';
import { CELL, DELIVERIES, RACE, PLAYER } from './config.js';
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

const $ = (id) => document.getElementById(id);
const ui = {
  hud: $('hud'), time: $('time'), position: $('position'), heat: $('heat'), boost: $('boost'), toast: $('toast'),
  menu: $('menu'), countdown: $('countdown'), count: $('count'), timeup: $('timeup'), delivered: $('delivered'),
  result: $('result'), subtitle: $('subtitle'), turn: $('turn'), boostBtn: $('boost-btn'), muteBtn: $('mute-btn'), totalTips: $('total-tips'),
};

const MIDGAME_INTERVAL = 120; // seconds between midgame ads

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
    this.input = new Input();
    this.audio = new Audio();
    this.audio.setMuted(store.get('muted', false));
    ui.muteBtn.classList.toggle('off', this.audio.muted);


    this.state = 'menu';
    this.lastAd = performance.now() / 1000;
    this.totalTips = store.get('tips', 0);
    this.deliveryIndex = store.get('delivery', 0) % DELIVERIES.length;
    this.showTotal();
    this.resetRace();
    this.bindUI();
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

  show(screen) {
    for (const s of [ui.menu, ui.countdown, ui.timeup, ui.delivered]) s.classList.add('hidden');
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
    this.timeLeft = this.world.startTime;
    this.cpIndex = 0;
    this.usedSecret = false;
    this.raceTime = 0;
    this.lastTick = 99;
    this.world.checkpoints.forEach((c, i) => { c.mesh.visible = i === 0; });
    this.world.customerBeam.visible = false;
    ui.subtitle.textContent = `Napoli · Delivery ${this.deliveryIndex + 1}/${DELIVERIES.length}: ${d.name}`;
    this.updateCamera(1);
  }

  startRace() {
    this.audio.unlock();
    this.show(ui.countdown);
    ui.hud.classList.remove('hidden');
    ui.boostBtn.classList.remove('hidden');
    $('brake-btn').classList.remove('hidden');
    this.state = 'countdown';
    this.look.watch = true;
    this.countdown = 3;
    ui.count.textContent = '3';
    this.audio.sfx('tick');
    this.audio.bpm = 156;
    this.audio.startMusic();
  }

  addTips(n) {
    this.totalTips += n;
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

    this.traffic.update(dt);
    this.player.update(dt, this.input, racing);
    for (const r of this.rivals) r.update(dt, racing);

    if (racing) this.raceLogic(dt);
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

  raceLogic(dt) {
    const p = this.player;
    this.raceTime += dt;
    this.timeLeft -= dt;

    const car = this.traffic.hit(p.pos, PLAYER.radius);
    if (car && !this.carCooldown) {
      p.bump(car.pos.x, car.pos.z, 1);
      this.carCooldown = 0.6;
    }
    this.carCooldown = Math.max(0, (this.carCooldown || 0) - dt);

    // Shoving rivals: boosting into them knocks them back, otherwise both slow down.
    for (const r of this.rivals) {
      if (r.pos.distanceTo(p.pos) < 2.4 && !r.stun) {
        r.stun = p.boosting ? 1.6 : 0.6;
        if (!p.boosting) p.speed *= 0.7;
        this.audio.sfx('crash');
      }
    }

    if (!this.usedSecret && this.world.inTunnel(p.pos.x, p.pos.z)) {
      this.usedSecret = true;
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
    const secretBonus = this.usedSecret ? 5 : 0;
    this.lastPlace = place;
    this.lastTips = base + timeBonus + heatBonus + secretBonus;
    this.lastBreakdown = { base, timeBonus, heatBonus, secretBonus };
    this.addTips(this.lastTips);
    $('double-btn').classList.remove('hidden');
    this.renderResult();
    this.show(ui.delivered);
  }

  renderResult() {
    const b = this.lastBreakdown;
    const ord = ['1st', '2nd', '3rd', '4th'][this.lastPlace - 1];
    ui.result.innerHTML = `
      Position: <b>${ord}</b> (+$${b.base})<br>
      Time left: <b>${b.timeBonus}s</b> (+$${b.timeBonus})<br>
      Pizza heat: <b>${Math.round(this.player.heat)}%</b> (+$${b.heatBonus})<br>
      ${b.secretBonus ? `Secret shortcut: <b>found</b> (+$${b.secretBonus})<br>` : ''}
      Tips: <b>$${this.lastTips}</b>`;
  }

  handleEvents() {
    for (const e of this.player.events) {
      if (e.type === 'crash') { this.audio.sfx('crash'); this.fx.sparks(this.player.pos); }
      if (e.type === 'jump') this.audio.sfx('jump');
      if (e.type === 'drift') { this.audio.sfx('land'); this.toast('DRIFT! +BOOST'); }
      if (e.type === 'land') {
        this.fx.dust(this.player.pos);
        if (e.clean) {
          this.audio.sfx('land');
          this.toast(e.airTime > 0.9 ? 'BIG AIR! +BOOST' : 'CLEAN LANDING! +BOOST');
        }
      }
    }
    this.player.events.length = 0;
  }

  updateHUD() {
    if (this.state === 'menu') return;
    const t = Math.max(0, Math.ceil(this.timeLeft));
    ui.time.textContent = t;
    ui.time.classList.toggle('hurry', this.timeLeft < RACE.hurryTime);
    const place = this.rank();
    const suf = ['st', 'nd', 'rd', 'th'][place - 1];
    ui.position.innerHTML = `${place}<sup>${suf}</sup><span>/4</span>`;
    ui.heat.style.width = `${this.player.heat}%`;
    ui.boost.style.width = `${this.player.boost * 100}%`;
  }

  updateCamera(dt) {
    const p = this.player;
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    const want = new THREE.Vector3(p.pos.x - fx * 9, p.pos.y + 4.5, p.pos.z - fz * 9);
    const k = 1 - Math.exp(-6 * dt);
    this.camera.position.lerp(want, k);
    this.camera.lookAt(p.pos.x + fx * 6, p.pos.y + 1.5, p.pos.z + fz * 6);
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
