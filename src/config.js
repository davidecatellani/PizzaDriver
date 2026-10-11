// Tuning constants for the Napoli prototype. Units: world units ≈ metres, seconds.

export const CELL = 44;          // distance between street centre lines
export const STREET = 14;        // street width
export const GRID = 6;           // blocks per side (intersections 0..GRID)

export const PLAYER = {
  radius: 1.1,
  maxSpeed: 30,
  accel: 22,
  brake: 45,
  turnRate: 2.4,                 // rad/s at low speed
  boostMultiplier: 1.55,
  boostDrain: 0.45,              // meter per second while boosting
  boostRecharge: 0.06,           // meter per second passive
  landingBoostBonus: 0.25,       // meter added on a clean landing
  gravity: 30,
};

export const RACE = {
  startTime: 10,                 // seconds on the clock at start
  checkpointBonus: 6,            // seconds per checkpoint
  continueBonus: 10,             // seconds from the rewarded "continue"
  hurryTime: 6,                  // music speeds up below this
};

// Napoli deliveries, in intersection coordinates (multiplied by CELL). Every delivery starts at the
// pizzeria corner (0, 0). Checkpoints are passed in order; rivals follow `rivals` along the streets.
// The palazzo covers blocks (2..3, 2..3): its tunnel along row 3 is the secret shortcut,
// so rival paths never cross its inside lines (x = 3 or z = 3 between 2 and 4).
export const DELIVERIES = [
  {
    name: 'Lungomare',
    checkpoints: [[0, 3], [2, 3], [4, 3], [4, 5]],
    customer: [6, 5],
    rivals: [[0, 0], [0, 3], [2, 3], [2, 4], [4, 4], [4, 3], [4, 5], [6, 5]],
  },
  {
    name: 'Piazza del Gesù',
    checkpoints: [[3, 0], [3, 2], [1, 2], [1, 6]],
    customer: [2, 6],
    rivals: [[0, 0], [3, 0], [3, 2], [1, 2], [1, 6], [2, 6]],
  },
  {
    name: 'Mercato',
    checkpoints: [[0, 1], [4, 1], [4, 3], [2, 3], [2, 6]],
    customer: [0, 6],
    rivals: [[0, 0], [0, 1], [4, 1], [4, 3], [4, 4], [2, 4], [2, 3], [2, 6], [0, 6]],
  },
  {
    name: 'Quartieri Spagnoli',
    checkpoints: [[6, 0], [6, 3], [5, 3], [5, 6]],
    customer: [3, 6],
    rivals: [[0, 0], [6, 0], [6, 3], [5, 3], [5, 6], [3, 6]],
  },
  {
    name: 'Stadio',
    checkpoints: [[0, 5], [3, 5], [3, 4], [6, 4], [6, 1]],
    customer: [5, 0],
    rivals: [[0, 0], [0, 5], [3, 5], [3, 4], [6, 4], [6, 1], [6, 0], [5, 0]],
  },
];

export const RIVALS = [
  { name: 'Gino', color: 0x2e9d4a, speed: 0.80 },
  { name: 'Lola', color: 0x8a3fd1, speed: 0.86 },
  { name: 'Tony', color: 0xe08a1e, speed: 0.92 },
];
