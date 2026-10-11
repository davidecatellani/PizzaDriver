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

// Checkpoints in intersection coordinates (multiplied by CELL).
// The tunnel through the palazzo at row 3 is the secret shortcut between CP2 and CP3.
export const CHECKPOINTS = [
  [0, 3],
  [2, 3],
  [4, 3],
  [4, 5],
];
export const CUSTOMER = [6, 5];
export const START = [0, 0];

// Rivals follow streets only, so they go around the palazzo.
export const RIVAL_PATH = [
  [0, 0], [0, 3], [2, 3], [2, 4], [4, 4], [4, 3], [4, 5], [6, 5],
];

export const RIVALS = [
  { name: 'Gino', color: 0x2e9d4a, speed: 0.80 },
  { name: 'Lola', color: 0x8a3fd1, speed: 0.86 },
  { name: 'Tony', color: 0xe08a1e, speed: 0.92 },
];
