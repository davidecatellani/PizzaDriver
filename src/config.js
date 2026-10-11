// Tuning constants for the Napoli prototype. Units: world units ≈ metres, seconds.

export const CELL = 44;          // distance between street centre lines
export const STREET = 14;        // street width
export const GRID = 10;          // blocks per side (intersections 0..GRID)

export const PLAYER = {
  radius: 1.1,
  maxSpeed: 30,
  accel: 22,
  brake: 45,
  turnRate: 3.0,                 // rad/s at low speed
  boostMultiplier: 1.55,
  boostDrain: 0.45,              // meter per second while boosting
  boostRecharge: 0.06,           // meter per second passive
  landingBoostBonus: 0.25,       // meter added on a clean landing
  gravity: 30,
  driftMinSpeed: 14,             // m/s needed to start a drift
  driftTurn: 1.9,                // steering multiplier while drifting
  driftDrag: 6,                  // m/s² lost while drifting (a full brake is 45)
  driftBoostAfter: 0.5,          // seconds of drift that earn boost
  driftBoost: 0.2,
};

export const RACE = {
  // The clock is set from the route: each stretch gets its length at `refSpeed`, plus `slack` seconds.
  refSpeed: 26,                  // m/s, a clean but not perfect run
  slack: 2,
  checkpointSpacing: 230,        // metres between checkpoints along the route
  continueBonus: 10,             // seconds from the rewarded "continue"
  hurryTime: 6,                  // music speeds up below this
};

// Napoli deliveries, in intersection coordinates (multiplied by CELL), about 1.5 minutes each.
// Every delivery starts at the pizzeria corner (0, 0) and ends at the customer, the last point.
// `path` is the street route: rivals ride it, the road arrows show it, and checkpoints and ramps
// are placed along it. The palazzo covers blocks (2..3, 2..3) and its tunnel along row 3 is the
// secret shortcut: `detour` gives the path segments [from, to) that ride around it, which never
// get a checkpoint so the tunnel stays a valid line.
export const DELIVERIES = [
  {
    name: 'Lungomare',
    path: [[0, 0], [0, 3], [2, 3], [2, 4], [4, 4], [4, 3], [8, 3], [8, 0], [10, 0], [10, 5], [7, 5], [7, 8],
      [10, 8], [10, 10], [4, 10], [4, 7], [1, 7], [1, 10]],
    detour: [2, 5],
  },
  {
    name: 'Piazza del Gesù',
    path: [[0, 0], [3, 0], [3, 2], [1, 2], [1, 6], [5, 6], [5, 9], [9, 9], [9, 4], [6, 4], [6, 1], [10, 1],
      [10, 10], [8, 10]],
  },
  {
    name: 'Mercato',
    path: [[0, 0], [6, 0], [6, 3], [4, 3], [4, 4], [1, 4], [1, 3], [0, 3], [0, 8], [3, 8], [3, 10], [8, 10],
      [8, 6], [10, 6], [10, 0], [8, 0]],
    detour: [3, 6],
  },
  {
    name: 'Quartieri Spagnoli',
    path: [[0, 0], [6, 0], [6, 3], [5, 3], [5, 6], [3, 6], [3, 9], [7, 9], [7, 7], [10, 7], [10, 10], [0, 10],
      [0, 6]],
  },
  {
    name: 'Stadio',
    path: [[0, 0], [0, 9], [2, 9], [2, 5], [3, 5], [3, 4], [6, 4], [6, 0], [9, 0], [9, 8], [7, 8], [7, 10],
      [10, 10]],
  },
];

export const RIVALS = [
  { name: 'Gino', color: 0x2e9d4a, speed: 0.80 },
  { name: 'Lola', color: 0x8a3fd1, speed: 0.86 },
  { name: 'Tony', color: 0xe08a1e, speed: 0.92 },
];
