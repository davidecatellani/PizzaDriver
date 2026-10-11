import * as THREE from 'three';
import { CELL, DELIVERIES, RACE, PLAYER } from './config.js';
import { loadModels } from './assets.js';
import { World } from './world.js';
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
  result: $('result'), subtitle: $('subtitle'), boostBtn: $('boost-btn'), muteBtn: $('mute-btn'), totalTips: $('total-tips'),
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
    this.scene.background = new THREE.Color(0x87c7f0);
    this.scene.fog = new THREE.Fog(0x87c7f0, 120, 420);
    this.camera = new THREE.PerspectiveCamera(65, 1, 0.5, 1200);

    this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6b7a8f, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 200 });
    this.scene.add(sun, sun.target);
    this.sun = sun;

    this.world = new World(this.scene);
    this.player = new Player(this.scene, this.world);
    this.rivals = makeRivals(this.scene, this.world);
    this.traffic = new Traffic(this.scene);
    this.input = new Input();
    this.audio = new Audio();
    this.audio.setMuted(store.get('muted', false));
    ui.muteBtn.classList.toggle('off', this.audio.muted);

    this.arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.6, 1.6, 12),
      new THREE.MeshBasicMaterial({ color: 0xffd23f }),
    );
    this.arrow.geometry.rotateX(Math.PI / 2);
    this.scene.add(this.arrow);

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
    // Route the player is scored on: pizzeria, checkpoints, then the customer. Used for ranking.
    this.route = [[0, 0], ...d.checkpoints, d.customer].map(([x, z]) => new THREE.Vector2(x * CELL, z * CELL));
    this.world.setRoute(d);
    const dir = this.route[1].clone().sub(this.route[0]).normalize();
    this.player.reset(-dir.x * 5 - dir.y * 4, -dir.y * 5 + dir.x * 4, Math.atan2(dir.x, dir.y));
    for (const r of this.rivals) r.reset(d.rivals);
    this.timeLeft = RACE.startTime;
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
    this.state = 'countdown';
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

  // Distance left along the scored route.
  playerRemaining() {
    const target = this.cpIndex + 1;
    const p = this.player.pos;
    let d = Math.hypot(this.route[target].x - p.x, this.route[target].y - p.z);
    for (let i = target; i < this.route.length - 1; i++) d += this.route[i].distanceTo(this.route[i + 1]);
    return d;
  }

  rank() {
    const mine = this.playerRemaining();
    return 1 + this.rivals.filter((r) => r.remaining() < mine).length;
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (!this.adPlaying) this.update(dt);
    this.renderer.render(this.scene, this.camera);
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
    this.updateHUD();
    this.updateCamera(dt);

    // Spin the active checkpoint ring and point the arrow at the next target.
    const cp = this.world.checkpoints[this.cpIndex];
    if (cp) cp.ring.rotation.z += dt;
    const tgt = cp ? cp.pos : this.world.customerPos;
    const p = this.player.pos;
    this.arrow.position.set(p.x, p.y + 4.2, p.z);
    this.arrow.lookAt(tgt.x, p.y + 4.2, tgt.z);
    this.arrow.visible = racing;
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
    if (cp && Math.hypot(cp.pos.x - p.pos.x, cp.pos.z - p.pos.z) < 8) {
      cp.mesh.visible = false;
      this.cpIndex++;
      this.timeLeft += RACE.checkpointBonus;
      this.toast(`CHECKPOINT +${RACE.checkpointBonus}s`);
      this.audio.sfx('checkpoint');
      const next = this.world.checkpoints[this.cpIndex];
      if (next) next.mesh.visible = true;
      else this.world.customerBeam.visible = true;
    }
    if (!cp && p.pos.distanceTo(this.world.customerPos) < 8) return this.deliver();

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
      if (e.type === 'crash') this.audio.sfx('crash');
      if (e.type === 'jump') this.audio.sfx('jump');
      if (e.type === 'land') {
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
    this.sun.position.set(p.pos.x + 30, 60, p.pos.z + 20);
    this.sun.target.position.copy(p.pos);
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }
}

(async () => {
  await SDK.initSDK();
  SDK.loadingStart();
  await loadModels();
  window.game = new Game();
  SDK.loadingStop();
})();
