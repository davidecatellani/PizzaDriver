// "Richest riders": the player against the delivery riders of Napoli, ranked by all the tips
// they have ever earned (spending in the garage does not lose places).
// It lives on this device only: the three race rivals earn by their finishing place, and the
// rest of the city's riders pick up a few tips every time the player completes a delivery.

const CITY = [
  ['Don Salvatore', 2400], ['Carmela', 1700], ['Totò Turbo', 1250], ['Nunzia', 900], ['Gennarino', 620],
  ['Peppe Pizza', 420], ['Assunta', 260], ['Ciro', 140],
];
const RIVAL_START = { Gino: 300, Lola: 180, Tony: 520 };
const PLACE_TIPS = [55, 40, 30, 20];

export class Ranking {
  constructor(store, rivals) {
    this.store = store;
    const saved = store.get('ranking', null);
    this.riders = saved || [
      ...CITY.map(([name, tips]) => ({ name, tips })),
      ...rivals.map((r) => ({ name: r.name, tips: RIVAL_START[r.name] ?? 200, rival: true })),
    ];
  }

  save() { this.store.set('ranking', this.riders); }

  // Everyone sorted, the player included as { name, tips, me: true }.
  table(name, earned) {
    return [...this.riders, { name, tips: earned, me: true }].sort((a, b) => b.tips - a.tips);
  }

  place(name, earned) {
    return this.table(name, earned).findIndex((r) => r.me) + 1;
  }

  // After a delivery: `places` maps rival names to their finishing place (1..4).
  afterDelivery(places) {
    for (const r of this.riders) {
      if (r.rival) r.tips += PLACE_TIPS[(places[r.name] ?? 4) - 1] + Math.round(Math.random() * 10);
      // The richest grow slowest, so the top can be caught.
      else r.tips += Math.round((8 + Math.random() * 20) * Math.max(0.35, 1 - r.tips / 4000));
    }
    this.save();
  }
}
