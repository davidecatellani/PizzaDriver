import { RIDES, UPGRADES, UPGRADE_COST, MAX_LEVEL, HELMETS, JACKETS } from './shop.js';

// The garage screen: buy and pick rides, upgrades and style with delivery tips.
// `game` provides totalTips, spendTips(n), player.equip(profile), rewarded(grant), audio.

const $ = (id) => document.getElementById(id);
const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
const RIDE_ICON = { scooter: '🛴', skate: '🛹', bike: '🚲', hover: '⚡' };
const FREE_TIPS = 40;

export class Garage {
  constructor(game, profile) {
    this.game = game;
    this.profile = profile;
    this.tab = 'rides';
    this.el = $('garage');
    for (const b of this.el.querySelectorAll('.g-tabs button')) {
      b.onclick = () => { this.tab = b.dataset.tab; this.render(); };
    }
    $('g-free-n').textContent = FREE_TIPS;
    $('g-free').onclick = () => game.rewarded(() => { game.addTips(FREE_TIPS); this.render(); });
    $('g-list').onclick = (e) => {
      const b = e.target.closest('button[data-act]');
      if (b) this.act(b.dataset.act, b.dataset.id, b.dataset.slot);
    };
  }

  show(onClose) {
    this.onClose = onClose;
    this.el.classList.remove('hidden');
    $('g-close').onclick = () => this.hide();
    this.render();
  }

  hide() {
    this.el.classList.add('hidden');
    this.onClose?.();
  }

  // Buying spends tips and equips; tapping something already owned just equips it.
  // `slot`: 'ride', 'helmet' or 'jacket'. Owned style items are saved as 'helmet-<id>' / 'jacket-<id>'.
  act(act, id, slot) {
    const p = this.profile, g = this.game;
    if (act === 'upgrade') {
      const cost = UPGRADE_COST[p.level(id)];
      if (cost === undefined || g.totalTips < cost) return;
      g.spendTips(cost);
      p.levels[id] = p.level(id) + 1;
    } else {
      const list = { ride: RIDES, helmet: HELMETS, jacket: JACKETS }[slot];
      const it = list.find((x) => x.id === id);
      const key = slot === 'ride' ? id : `${slot}-${id}`;
      if (!p.owns(key)) {
        if (g.totalTips < it.price) return;
        g.spendTips(it.price);
        p.owned.push(key);
      }
      p[slot] = id;
    }
    g.audio.sfx('checkpoint');
    p.save();
    g.player.equip(p);
    this.render();
  }

  item(slot, { id, name, blurb, price, icon, swatch, extra = '' }, owned, on) {
    const can = this.game.totalTips >= price;
    const button = on ? '<span class="tag">EQUIPPED</span>'
      : owned ? `<button data-act="equip" data-slot="${slot}" data-id="${id}">USE</button>`
        : `<button class="buy" data-act="buy" data-slot="${slot}" data-id="${id}" ${can ? '' : 'disabled'}>$${price}</button>`;
    const pic = swatch ? `<div class="g-swatch" style="background:${swatch}"></div>` : `<div class="g-icon">${icon}</div>`;
    return `<div class="g-item${on ? ' on' : ''}">${pic}<div class="g-info"><div class="g-name">${name}</div>`
      + `${blurb ? `<div class="g-blurb">${blurb}</div>` : ''}${extra}</div>${button}</div>`;
  }

  render() {
    const p = this.profile;
    $('g-tips').textContent = this.game.totalTips;
    for (const b of this.el.querySelectorAll('.g-tabs button')) b.classList.toggle('on', b.dataset.tab === this.tab);
    let html = '';
    if (this.tab === 'rides') {
      for (const r of RIDES) html += this.item('ride', { ...r, icon: RIDE_ICON[r.id] }, p.owns(r.id), p.ride === r.id);
    } else if (this.tab === 'upgrades') {
      for (const u of UPGRADES) {
        const l = p.level(u.id);
        const pips = `<div class="g-pips">${Array.from({ length: MAX_LEVEL }, (_, k) => `<span class="${k < l ? 'on' : ''}"></span>`).join('')}</div>`;
        const icon = { speed: '⚙️', turbo: '🔥', grip: '🛞', bag: '🍕' }[u.id];
        const cost = UPGRADE_COST[l];
        const button = l >= MAX_LEVEL ? '<span class="tag">MAX</span>'
          : `<button class="buy" data-act="upgrade" data-id="${u.id}" ${this.game.totalTips >= cost ? '' : 'disabled'}>$${cost}</button>`;
        html += `<div class="g-item"><div class="g-icon">${icon}</div><div class="g-info"><div class="g-name">${u.name}</div>`
          + `<div class="g-blurb">${u.blurb}</div>${pips}</div>${button}</div>`;
      }
    } else {
      html += '<div class="g-name">HELMET</div>';
      for (const h of HELMETS) html += this.item('helmet', { ...h, swatch: hex(h.color ?? 0xd62828) }, p.owns(`helmet-${h.id}`), p.helmet === h.id);
      html += '<div class="g-name">JACKET</div>';
      for (const j of JACKETS) html += this.item('jacket', { ...j, swatch: hex(j.color ?? 0xffffff) }, p.owns(`jacket-${j.id}`), p.jacket === j.id);
    }
    $('g-list').innerHTML = html;
  }
}
