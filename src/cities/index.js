import { napoli } from './napoli.js';
import { manhattan } from './manhattan.js';
import { paris } from './paris.js';

// Every city in the game, in unlock order. A city is a plain object: see src/cities/napoli.js.
export const CITIES = [napoli, manhattan, paris];
export const cityById = (id) => CITIES.find((c) => c.id === id) || CITIES[0];
