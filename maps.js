'use strict';
// Board generation: preset country silhouettes, classic island and custom maps.
// Hexes use axial coordinates (q, r), pointy-top orientation.

const TERRAINS = ['forest', 'hills', 'pasture', 'fields', 'mountains', 'desert'];
const PRODUCES = { forest: 'wood', hills: 'brick', pasture: 'sheep', fields: 'wheat', mountains: 'ore', desert: null };
const STANDARD_NUMBERS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

// Masks use "odd-r" offset rows: odd rows sit half a hex to the right.
const PRESETS = {
  classic: {
    name: 'Classic Island', blurb: 'The balanced 19-tile island.',
    mask: ['..XXX..', '.XXXX..', '.XXXXX.', '.XXXX..', '..XXX..'],
    weights: { forest: 4, hills: 3, pasture: 4, fields: 4, mountains: 3 }, deserts: 1, classic: true,
  },
  india: {
    name: 'India', blurb: 'Grain-rich plains running down to Sri Lanka.',
    mask: ['..XXX....', '.XXXX....', 'XXXXXXXX.', 'XXXXXX.XX', '.XXXXX...', '..XXXX...', '..XXX....', '...XX....', '...X.....', '....X....'],
    weights: { forest: 4, hills: 4, pasture: 3, fields: 6, mountains: 4 }, deserts: 2,
  },
  usa: {
    name: 'United States', blurb: 'Wide wheat belts from coast to coast.',
    mask: ['XXXXXXXXXX..', 'XXXXXXXXXXXX', 'XXXXXXXXXXX.', '.XXXXXXXXXX.', '..XXX..XXX..', '...X....X...'],
    weights: { forest: 5, hills: 4, pasture: 4, fields: 6, mountains: 4 }, deserts: 2,
  },
  uk: {
    name: 'United Kingdom', blurb: 'Two islands of sheep and stone.',
    mask: ['....XX..', '...XXX..', '...XX...', '.X.XXX..', 'XX..XXX.', 'XX.XXXXX', '....XXXX', '..XXXXX.'],
    weights: { forest: 3, hills: 4, pasture: 6, fields: 3, mountains: 3 }, deserts: 0,
  },
  australia: {
    name: 'Australia', blurb: 'Four deserts; plenty of wool and ore.',
    mask: ['....X.X...', '..XXXXXX..', '.XXXXXXXX.', 'XXXXXXXXXX', 'XXXXXXXXX.', '.X...XXX..', '..........', '......X...'],
    weights: { forest: 3, hills: 4, pasture: 5, fields: 4, mountains: 5 }, deserts: 4,
  },
  japan: {
    name: 'Japan', blurb: 'A mountain archipelago strung across the sea.',
    mask: ['.......XX', '......XXX', '......XX.', '.....XX..', '....XXX..', '..XXXX...', '.XXX.....', 'XX.......', 'X.X......'],
    weights: { forest: 5, hills: 3, pasture: 2, fields: 4, mountains: 6 }, deserts: 0,
  },
  italy: {
    name: 'Italy', blurb: 'The boot, with Sicily and Sardinia offshore.',
    mask: ['XXXXX....', '.XXXX....', '..XXX....', 'X..XXX...', 'X...XXX..', '.....XXX.', '......XX.', '.....X..X', '...XXX...'],
    weights: { forest: 3, hills: 4, pasture: 4, fields: 5, mountains: 4 }, deserts: 0,
  },
  brazil: {
    name: 'Brazil', blurb: 'Timber everywhere, with wide pastures.',
    mask: ['..XXXXX...', '.XXXXXXXX.', 'XXXXXXXXXX', 'XXXXXXXXX.', '.XXXXXXX..', '..XXXXX...', '...XXX....', '...XX.....'],
    weights: { forest: 7, hills: 4, pasture: 5, fields: 4, mountains: 3 }, deserts: 1,
  },
  france: {
    name: 'France', blurb: 'Wheat and pasture, with Corsica offshore.',
    mask: ['..XXXX...', '.XXXXXX..', 'XXXXXXXX.', '.XXXXXXX.', '.XXXXXXX.', '..XXXXXX.', '..XXXXX.X', '...XXXX..'],
    weights: { forest: 4, hills: 3, pasture: 5, fields: 6, mountains: 3 }, deserts: 0,
  },
  spain: {
    name: 'Spain', blurb: 'Dry hills and mountains, with the Balearic Islands.',
    mask: ['.XXXXXXX..', 'XXXXXXXXX.', '.XXXXXXXXX', '.XXXXXXXX.', '..XXXXXXX.', '..XXXXXX..', '...XXXX..X'],
    weights: { forest: 3, hills: 5, pasture: 3, fields: 4, mountains: 4 }, deserts: 2,
  },
  germany: {
    name: 'Germany', blurb: 'Forests and farmland from the coast to the Alps.',
    mask: ['..XXX...', '.XXXXX..', 'XXXXXXX.', '.XXXXXXX', '..XXXXXX', '..XXXXXX', '...XXXXX', '...XXXX.'],
    weights: { forest: 6, hills: 3, pasture: 4, fields: 5, mountains: 3 }, deserts: 0,
  },
  china: {
    name: 'China', blurb: 'A huge land of mountains and rice, with Hainan in the south.',
    mask: ['.....XXX...', '..XXXXXXX..', '.XXXXXXXXX.', '..XXXXXXXX.', '...XXXXXXX.', '....XXXXXX.', '....XXXXX..', '......XXX..', '.........X.'],
    weights: { forest: 4, hills: 4, pasture: 3, fields: 6, mountains: 5 }, deserts: 2,
  },
  canada: {
    name: 'Canada', blurb: 'Endless forest and rock, with Arctic islands and Newfoundland.',
    mask: ['..XX..XXX...', '.XXXXXXXXX..', '.XXXXXXXXXX.', '..XXXXXXXXX.', '..XXXXXXXX.X', '...XXXXXXX..'],
    weights: { forest: 9, hills: 2, pasture: 3, fields: 4, mountains: 5 }, deserts: 1,
  },
  mexico: {
    name: 'Mexico', blurb: 'Deserts and sierras, with Baja and the Yucat\u00e1n.',
    mask: ['X..XXXXXXX..', 'XX.XXXXXXX..', '.X..XXXXXXX.', '...XXXXXXX..', '....XXXXXX.X', '....XXXXX.XX', '.....XXXX...', '......XXX...'],
    weights: { forest: 3, hills: 4, pasture: 3, fields: 4, mountains: 4 }, deserts: 3,
  },
  argentina: {
    name: 'Argentina', blurb: 'Pampas, the Andes and windswept Patagonia, down to Tierra del Fuego.',
    mask: ['..XXXXXX.', '.XXXXXXX.', '..XXXXXX.', '..XXXXXX.', '...XXXXX.', '...XXXX..', '...XXXX..', '....XXX..', '....XXX..', '.....XX..', '....XX...'],
    weights: { forest: 3, hills: 3, pasture: 7, fields: 6, mountains: 6 }, deserts: 2,
  },
  newzealand: {
    name: 'New Zealand', blurb: 'Sheep country across two islands.',
    mask: ['.....XX...', '....XXXX..', '....XXXXX.', '.....XXX..', '..XX.XX...', '.XXXX.....', 'XXXXX.....', 'XXXXX.....', '.XXXX.....', '..XXX.....', '...XX.....'],
    weights: { forest: 4, hills: 2, pasture: 8, fields: 3, mountains: 5 }, deserts: 0,
  },
};

function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
function maskToCoords(mask) {
  const out = [];
  mask.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) if (row[c] === 'X') out.push({ q: c - (r - (r & 1)) / 2, r });
  });
  return out;
}
const AXIAL_DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
function neighbors(tile, tiles) {
  return tiles.filter(t => AXIAL_DIRS.some(([dq, dr]) => t.q === tile.q + dq && t.r === tile.r + dr));
}

// Distribute `total` slots across weights using largest remainder.
function apportion(weights, total) {
  const keys = Object.keys(weights);
  const sum = keys.reduce((a, k) => a + weights[k], 0);
  const raw = keys.map(k => ({ k, v: (weights[k] / sum) * total }));
  const res = {}; let used = 0;
  raw.forEach(x => { res[x.k] = Math.floor(x.v); used += res[x.k]; });
  raw.sort((a, b) => (b.v % 1) - (a.v % 1));
  for (let i = 0; used < total; i++, used++) res[raw[i % raw.length].k]++;
  return res;
}

function numberPool(count) {
  const pool = [];
  while (pool.length < count) pool.push(...STANDARD_NUMBERS);
  return pool.slice(0, count);
}

// Place numbers so that red numbers (6, 8) never touch where avoidable.
function assignNumbers(tiles, rng) {
  const prod = tiles.filter(t => t.terrain !== 'desert' && t.terrain !== 'diamond');
  const fixed = tiles.filter(t => t.terrain === 'diamond');          // the diamond keeps its own 8, and still counts for keeping 6s and 8s apart
  const all = prod.concat(fixed), pool = numberPool(prod.length);
  let best = null, bestBad = Infinity;
  for (let attempt = 0; attempt < 400 && bestBad > 0; attempt++) {
    const nums = shuffle(pool.slice(), rng);
    prod.forEach((t, i) => { t.number = nums[i]; });
    let bad = 0;
    for (const t of all) if (t.number === 6 || t.number === 8)
      for (const n of neighbors(t, all)) if (n.number === 6 || n.number === 8) bad++;
    if (bad < bestBad) { bestBad = bad; best = nums; }
  }
  prod.forEach((t, i) => { t.number = best[i]; });
  tiles.forEach(t => { if (t.terrain === 'desert') t.number = null; });
}

// Categories for the map picker: every country is under "countries", everything else is a misc map.
Object.keys(PRESETS).forEach(k => { PRESETS[k].category = 'countries'; });
PRESETS.classic.category = 'misc';

// The Goblet of Fire layout: a hexagon of radius 4 around a lake. The middle is a desert island, the ring around it is
// water, the next two rings are forest, and everything else is fog.
const LAKE = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
function forestLake(rng, name, extra = {}) {
  const tiles = [];
  for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) {
    const s = -q - r, d = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
    if (d > 4 || d === 1) continue;                                   // ring 1 is the lake: no tile there
    const corner = d === 3 && (q === 0 || r === 0 || s === 0);       // the six corners of ring 3 are fog
    const fog = d === 4 || corner;
    tiles.push({ q, r, terrain: d === 0 ? 'desert' : 'forest', number: null, fog });
  }
  const hidden = tiles.filter(t => t.fog), others = ['hills', 'pasture', 'fields', 'mountains'];
  const bag = hidden.map((_, i) => others[i % others.length]);        // an even spread, never wood
  shuffle(bag, rng); hidden.forEach((t, i) => { t.terrain = bag[i]; });
  assignNumbers(tiles, rng);
  return { name, tiles, lake: LAKE.map(([q, r]) => ({ q, r })), portType: 'wood', ...extra };
}
// Goblet of Fire: a forest around a lake island with fog, plus a goblet hidden in the fog for every player (the game places them when it
// starts, because only then is the number of players known). Whoever unlocks one loses all their wood, sheep and
// hay. The first two settlements are not allowed to touch the fog.
PRESETS.gobletoffire = {
  name: 'Goblet of Fire', category: 'misc',
  blurb: 'A forest around a lake island with fog. One Goblet of Fire per player hides in it: unlock one and you lose your wood, sheep and hay.',
  generate: rng => forestLake(rng, 'Goblet of Fire', { goblets: true, fogFreeStart: true }),
};

// Chamber of Secrets: the same hexagon as Goblet of Fire, but all land. A diamond with an 8 sits in the middle, buried under
// two rings of fog (6 + 12 tiles). When the game starts, goblets of fire are hidden in that fog: two more than there are players.
function chamberOfSecrets(rng) {
  const tiles = [], ring = t => Math.max(Math.abs(t.q), Math.abs(t.r), Math.abs(t.q + t.r));
  for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) { const s = -q - r; if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) <= 4) tiles.push({ q, r, terrain: null, number: null, fog: false }); }
  const centre = tiles.find(t => ring(t) === 0); centre.terrain = 'diamond'; centre.number = 8;
  const fog = tiles.filter(t => ring(t) === 1 || ring(t) === 2); fog.forEach(t => { t.fog = true; });
  const pool = shuffle([...Array(12).fill('forest'), ...Array(11).fill('hills'), ...Array(12).fill('pasture'), ...Array(12).fill('fields'), ...Array(11).fill('mountains'), 'desert', 'desert'], rng);
  fog.forEach(t => { t.terrain = pool.splice(pool.findIndex(x => x !== 'desert'), 1)[0]; });   // fog never hides a desert
  tiles.filter(t => !t.terrain).forEach(t => { t.terrain = pool.pop(); });
  assignNumbers(tiles, rng);
  return { name: 'Chamber of Secrets', tiles, goblets: true, gobletExtra: 2, fogFreeStart: true };
}
PRESETS.chamberofsecrets = {
  name: 'Chamber of Secrets', category: 'misc',
  blurb: 'A diamond with an 8 sits in the middle, buried under two rings of fog. Goblets of Fire hide in the fog: unlock one and you lose your wood, sheep and hay.',
  generate: rng => chamberOfSecrets(rng),
};

function generatePreset(key, seed) {
  const p = PRESETS[key] || PRESETS.classic;
  const rng = makeRng(seed || Date.now());
  if (p.generate) return { key, ...p.generate(rng) };
  const coords = maskToCoords(p.mask);
  const deserts = Math.min(p.deserts, Math.max(0, coords.length - 5));
  const counts = apportion(p.weights, coords.length - deserts);
  const bag = [];
  Object.keys(counts).forEach(k => { for (let i = 0; i < counts[k]; i++) bag.push(k); });
  for (let i = 0; i < deserts; i++) bag.push('desert');
  shuffle(bag, rng);
  const tiles = coords.map((c, i) => ({ q: c.q, r: c.r, terrain: bag[i], number: null }));
  assignNumbers(tiles, rng);
  return { key, name: p.name, tiles };
}

function validateCustom(tiles) {
  if (!Array.isArray(tiles)) return 'Map must be a list of tiles.';
  if (tiles.length < 7) return 'A custom map needs at least 7 land tiles.';
  if (tiles.length > 60) return 'A custom map can have at most 60 land tiles.';
  const seen = new Set();
  let producing = 0;
  for (const t of tiles) {
    if (!Number.isInteger(t.q) || !Number.isInteger(t.r) || Math.abs(t.q) > 20 || Math.abs(t.r) > 20) return 'Tile position is invalid.';
    const k = t.q + ',' + t.r;
    if (seen.has(k)) return 'Two tiles share the same position.';
    seen.add(k);
    if (!TERRAINS.includes(t.terrain)) return 'Unknown terrain: ' + t.terrain;
    if (t.terrain === 'desert') { if (t.number != null) return 'Deserts cannot carry a number.'; }
    else {
      if (t.number != null && (!Number.isInteger(t.number) || t.number < 2 || t.number > 12 || t.number === 7))
        return 'Numbers must be 2–6 or 8–12.';
      producing++;
    }
  }
  if (producing < 5) return 'Add at least 5 resource tiles.';
  return null;
}

function buildCustom(tiles, seed) {
  const clean = tiles.map(t => ({ q: t.q, r: t.r, terrain: t.terrain, number: t.terrain === 'desert' ? null : (t.number ?? null) }));
  if (clean.some(t => t.terrain !== 'desert' && t.number == null)) {
    // Fill missing numbers automatically from the standard distribution.
    const missing = clean.filter(t => t.terrain !== 'desert' && t.number == null);
    const rng = makeRng(seed || Date.now());
    const pool = shuffle(numberPool(missing.length), rng);
    missing.forEach((t, i) => { t.number = pool[i]; });
  }
  return { key: 'custom', name: 'Custom Map', tiles: clean };
}

function presetList() {
  return Object.keys(PRESETS).map(k => ({ key: k, name: PRESETS[k].name, blurb: PRESETS[k].blurb, category: PRESETS[k].category }));
}

module.exports = { PRESETS, TERRAINS, PRODUCES, generatePreset, validateCustom, buildCustom, presetList, makeRng, shuffle };
