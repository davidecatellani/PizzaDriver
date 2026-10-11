import { napoli } from './napoli.js';

// Every city in the game, in unlock order. A city is a plain object: see src/cities/napoli.js.
export const CITIES = [napoli];
export const cityById = (id) => CITIES.find((c) => c.id === id) || CITIES[0];
