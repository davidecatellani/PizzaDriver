import { napoli } from './napoli.js';
import { paris } from './paris.js';
import { manhattan } from './manhattan.js';

// Every city in the game, in unlock order, easiest first. A city is a plain object: see src/cities/napoli.js.
export const CITIES = [napoli, paris, manhattan];
export const cityById = (id) => CITIES.find((c) => c.id === id) || CITIES[0];
