'use strict';
const { PRODUCES, shuffle } = require('./maps');

const RES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
const COST = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
  dev: { sheep: 1, wheat: 1, ore: 1 },
};
const PALETTE = [
  { id: 'red', name: 'Red', hex: '#d8432f' }, { id: 'blue', name: 'Blue', hex: '#2f6fd8' }, { id: 'orange', name: 'Orange', hex: '#ee8a1f' }, { id: 'green', name: 'Green', hex: '#3f9b4f' },
  { id: 'gray', name: 'Gray', hex: '#626a77' }, { id: 'purple', name: 'Purple', hex: '#7a4fd6' }, { id: 'pink', name: 'Pink', hex: '#e86ab0' }, { id: 'teal', name: 'Teal', hex: '#18b5ae' },
  { id: 'brown', name: 'Brown', hex: '#8b5a2b' }, { id: 'white', name: 'White', hex: '#f1f1ee' },
];
const LABEL = { wood: 'wood', brick: 'brick', sheep: 'sheep', wheat: 'hay', ore: 'ore' };
const DEV_NAMES = { knight: 'Knight', vp: 'Victory Point', roadBuilding: 'Road Building', yearOfPlenty: 'Year of Plenty', monopoly: 'Monopoly' };
const MAX_PLAYERS = 4;
const SQ3 = Math.sqrt(3);

const emptyRes = () => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });
const newStats = () => ({ collected: 0, stolen: 0, lostToRobber: 0, discarded: 0, bankTrades: 0, playerTrades: 0, devBought: 0, devPlayed: 0, sevens: 0 });
const BOT_LEVELS = ['easy', 'medium', 'hard'];
const BOT_NAMES = ['Ada', 'Bram', 'Cora', 'Dax', 'Elin', 'Finn', 'Gus', 'Hana', 'Ivo', 'Juno'];
const total = r => RES.reduce((a, k) => a + (r[k] || 0), 0);
const r3 = n => Math.round(n * 1000) / 1000;

class GameError extends Error {}
const fail = msg => { throw new GameError(msg); };

function buildGeometry(rawTiles) {
  const tiles = rawTiles.map(t => ({ q: t.q, r: t.r, terrain: t.terrain, number: t.number ?? null, fog: !!t.fog }));
  const vertices = [], edges = [], vmap = new Map(), emap = new Map();
  tiles.forEach((t, ti) => {
    t.id = ti; t.x = r3(SQ3 * (t.q + t.r / 2)); t.y = r3(1.5 * t.r); t.vertices = []; t.edges = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i - 30);
      const x = SQ3 * (t.q + t.r / 2) + Math.cos(a), y = 1.5 * t.r + Math.sin(a);
      const key = Math.round(x * 1000) + ',' + Math.round(y * 1000);
      let id = vmap.get(key);
      if (id === undefined) { id = vertices.length; vmap.set(key, id); vertices.push({ id, x: r3(x), y: r3(y), hexes: [], edges: [], adj: [], port: null }); }
      vertices[id].hexes.push(ti); t.vertices.push(id);
    }
    for (let i = 0; i < 6; i++) {
      const a = t.vertices[i], b = t.vertices[(i + 1) % 6];
      const key = Math.min(a, b) + '-' + Math.max(a, b);
      let id = emap.get(key);
      if (id === undefined) {
        id = edges.length; emap.set(key, id);
        edges.push({ id, v: [a, b], hexes: [] });
        vertices[a].edges.push(id); vertices[b].edges.push(id);
        vertices[a].adj.push(b); vertices[b].adj.push(a);
      }
      edges[id].hexes.push(ti); t.edges.push(id);
    }
  });
  return { tiles, vertices, edges };
}

// Lake harbors: one ship floating in each lake tile, tied to the forest tile straight outward from it.
function placeLakePorts(geo, map) {
  const { tiles, vertices, edges } = geo, byPos = new Map(tiles.map(t => [t.q + ',' + t.r, t])), type = map.portType || 'wood', ports = [];
  for (const L of map.lake) {
    const outer = byPos.get(2 * L.q + ',' + 2 * L.r);
    if (!outer || outer.terrain === 'desert') continue;
    const lx = SQ3 * (L.q + L.r / 2), ly = 1.5 * L.r;
    let best = null, bd = Infinity;
    for (const id of outer.edges) {
      const e = edges[id]; if (e.hexes.length !== 1) continue;
      const [a, b] = e.v.map(i => vertices[i]), d = Math.hypot((a.x + b.x) / 2 - lx, (a.y + b.y) / 2 - ly);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) continue;
    const k = 1.55 / Math.hypot(lx - outer.x, ly - outer.y);
    ports.push({ edge: best.id, type, x: r3(outer.x + (lx - outer.x) * k), y: r3(outer.y + (ly - outer.y) * k), vx: best.v.map(v => [vertices[v].x, vertices[v].y]) });
    best.v.forEach(v => { vertices[v].port = type; });
  }
  return ports;
}

function placePorts(geo, rng, map) {
  if (map && map.lake) return placeLakePorts(geo, map);
  const { tiles, vertices, edges } = geo;
  const cx = tiles.reduce((a, t) => a + t.x, 0) / tiles.length;
  const cy = tiles.reduce((a, t) => a + t.y, 0) / tiles.length;
  const coastal = edges.filter(e => e.hexes.length === 1).map(e => {
    const [a, b] = e.v.map(i => vertices[i]);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    return { e, mx, my, ang: Math.atan2(my - cy, mx - cx) };
  }).sort((p, q) => p.ang - q.ang);
  const count = Math.max(3, Math.min(14, Math.round(coastal.length / 3.4), Math.round(tiles.length * 9 / 19)));
  const pattern = ['any', 'wood', 'any', 'brick', 'sheep', 'any', 'wheat', 'ore', 'any'];
  const types = shuffle(Array.from({ length: count }, (_, i) => pattern[i % 9]), rng);
  const ports = [], used = new Set();
  const step = coastal.length / count, offset = Math.floor(rng() * step);
  for (let i = 0; i < count; i++) {
    let idx = Math.floor(offset + i * step) % coastal.length;
    for (let tries = 0; tries < coastal.length; tries++, idx = (idx + 1) % coastal.length) {
      const c = coastal[idx];
      if (c.e.v.some(v => used.has(v))) continue;
      const t = tiles[c.e.hexes[0]];
      const dx = c.mx - t.x, dy = c.my - t.y, len = Math.hypot(dx, dy);
      const px = t.x + dx / len * 1.55, py = t.y + dy / len * 1.55;
      // Keep badges in open water: away from other tiles and other harbors.
      if (tiles.some(o => o !== t && Math.hypot(o.x - px, o.y - py) < 1.25)) continue;
      if (ports.some(p => Math.hypot(p.x - px, p.y - py) < 1.3)) continue;
      ports.push({ edge: c.e.id, type: types[i], x: r3(px), y: r3(py), vx: c.e.v.map(v => [vertices[v].x, vertices[v].y]) });
      c.e.v.forEach(v => { used.add(v); vertices[v].port = types[i]; });
      break;
    }
  }
  return ports;
}

class Game {
  constructor({ code, map, vpTarget = 10, rng = Math.random }) {
    this.code = code;
    this.rng = rng;
    this.vpTarget = Math.max(5, Math.min(20, vpTarget | 0 || 10));
    this.opts = { discardLimit: 7, discardMode: 'half', timer: 0, friendlyRobber: false, balancedDice: false };
    this.events = []; this.eventSeq = 0; this.devPlayedCount = {};
    this.lastMonopoly = null; this.diceDeck = []; this.lastSum = null; this.clockAt = Date.now();
    this.boardVersion = 0; this.initBoard(map);
    this.players = [];
    this.phase = 'lobby';
    this.buildings = {}; this.roads = {};
    this.turn = 0; this.turnNumber = 0; this.rolled = false; this.dice = null;
    this.subphase = null; this.pendingDiscards = {}; this.freeRoads = 0; this.devPlayed = false;
    this.trade = null; this.largestArmy = null; this.longestRoad = null;
    this.setup = null; this.winner = null; this.log = []; this.lastRoll = null; this.version = 0;
    this.forcedDice = null;
    this.diceCounts = Array(13).fill(0);
  }

  // Builds everything that depends on the map. Also used when the host picks another map in the waiting room.
  initBoard(map) {
    const geo = buildGeometry(map.tiles);
    this.board = { name: map.name, key: map.key, ...geo };
    this.board.ports = placePorts(geo, this.rng, map);
    const desert = geo.tiles.findIndex(t => t.terrain === 'desert');
    this.robber = desert >= 0 ? desert : 0;
    this.revealed = new Set();                       // fog tiles that a road or settlement has uncovered
    const land = geo.tiles.length;
    this.bank = {}; RES.forEach(k => { this.bank[k] = Math.max(19, land); });
    const dev = [], scale = land > 30 ? 2 : 1;
    for (let s = 0; s < scale; s++) {
      for (let i = 0; i < 14; i++) dev.push('knight');
      for (let i = 0; i < 5; i++) dev.push('vp');
      ['roadBuilding', 'yearOfPlenty', 'monopoly'].forEach(t => dev.push(t, t));
    }
    this.devDeck = shuffle(dev, this.rng);
    this.devTotal = {}; dev.forEach(c => { this.devTotal[c] = (this.devTotal[c] || 0) + 1; });
  }
  setMap(map) {
    if (this.phase !== 'lobby') fail('The map cannot change after the game starts.');
    this.initBoard(map); this.boardVersion++; this.version++;
    this.addLog(`The host chose ${this.board.name}.`);
  }
  isHidden(id) { const t = this.board.tiles[id]; return !!(t && t.fog && !this.revealed.has(id)); }
  // A road or settlement next to a fog tile uncovers it for everyone.
  revealTiles(ids, pi) {
    const fresh = ids.filter(id => this.isHidden(id)); if (!fresh.length) return;
    const NAME = { forest: 'Forest', hills: 'Hills', pasture: 'Pasture', fields: 'Fields', mountains: 'Mountains', desert: 'Desert' };
    fresh.forEach(id => this.revealed.add(id)); this.boardVersion++;
    this.emit('reveal', { p: pi, tiles: fresh });
    this.addLog(`${this.players[pi].name} revealed ${fresh.map(id => `${NAME[this.board.tiles[id].terrain]} ${this.board.tiles[id].number}`).join(', ')}.`);
  }

  // ----- players -----
  addPlayer(name, token) {
    if (this.phase !== 'lobby') fail('This game has already started.');
    if (this.players.length >= MAX_PLAYERS) fail('This room is full (4 players).');
    name = String(name || '').trim().slice(0, 16) || 'Player ' + (this.players.length + 1);
    if (this.players.some(p => p.name.toLowerCase() === name.toLowerCase())) fail('That name is taken in this room.');
    const p = { name, token, connected: false, res: emptyRes(), dev: [], knights: 0,
      pieces: { road: 15, settlement: 5, city: 4 }, colorId: null, color: null, colorName: null, bot: null, stats: newStats() };
    if (!this.players.length) this.hostToken = token;
    this.players.push(p);
    this.assignColors();
    this.addLog(`${name} joined.`);
    this.version++;
    return this.players.length - 1;
  }
  removePlayer(pi) {
    if (this.phase !== 'lobby') return;
    const [p] = this.players.splice(pi, 1);
    if (p && p.token === this.hostToken) { const h = this.players.find(x => !x.bot); this.hostToken = h ? h.token : null; }
    this.assignColors();
    if (p) this.addLog(`${p.name} left.`);
    this.version++;
  }
  do_setColor(pi, a) {
    if (this.phase !== 'lobby') fail('Colors can only change before the game starts.');
    const seat = a.seat === undefined ? pi : a.seat | 0, target = this.players[seat];
    if (!target) fail('That seat is empty.');
    if (seat !== pi && !(this.isHost(pi) && target.bot)) fail('You can only change your own color.');
    const c = PALETTE.find(x => x.id === a.color);
    if (!c) fail('Unknown color.');
    const holder = this.players.find((p, i) => i !== seat && p.colorId === c.id);
    if (holder) fail(`${c.name} is taken by ${holder.name}.`);
    target.colorId = c.id; this.assignColors();
    this.addLog(`${target.name} chose ${c.name}.`);
  }
  do_addBot(pi, a) {
    if (this.phase !== 'lobby') fail('Bots can only join before the game starts.');
    if (!this.isHost(pi)) fail('Only the host can add bots.');
    if (this.players.length >= MAX_PLAYERS) fail('All 4 seats are taken.');
    const level = BOT_LEVELS.includes(a.level) ? a.level : 'medium';
    const taken = new Set(this.players.map(p => p.name.toLowerCase()));
    const name = BOT_NAMES.find(n => !taken.has(n.toLowerCase())) || 'Bot ' + (this.players.length + 1);
    const token = 'bot:' + Math.floor(this.rng() * 1e12).toString(36) + this.players.length;
    this.addPlayer(name, token);
    const p = this.players[this.players.length - 1];
    p.bot = level; p.connected = true;
    this.log[this.log.length - 1].text = `${name} (${level} bot) joined.`;
  }
  do_removeBot(pi, a) {
    if (this.phase !== 'lobby') fail('Bots can only be removed before the game starts.');
    if (!this.isHost(pi)) fail('Only the host can remove bots.');
    const seat = a.seat | 0;
    if (!this.players[seat] || !this.players[seat].bot) fail('That seat is not a bot.');
    this.removePlayer(seat);
  }
  do_setBotLevel(pi, a) {
    if (this.phase !== 'lobby') fail('Change bot difficulty before the game starts.');
    if (!this.isHost(pi)) fail('Only the host can change bots.');
    const p = this.players[a.seat | 0];
    if (!p || !p.bot) fail('That seat is not a bot.');
    if (!BOT_LEVELS.includes(a.level)) fail('Pick easy, medium or hard.');
    p.bot = a.level;
  }
  isBot(i) { return !!(this.players[i] && this.players[i].bot); }
  // Public happenings every client can animate (cards that move are never secret here).
  emit(type, data) { this.events.push({ seq: ++this.eventSeq, type, ...data }); if (this.events.length > 24) this.events.shift(); }

  // Position check used by the tests: returns every rule violation currently on the board.
  checkInvariants() {
    const bad = [], { vertices, edges } = this.board;
    for (const v of Object.keys(this.buildings)) for (const n of vertices[v].adj) if (this.buildings[n]) bad.push(`towns at ${v} and ${n} are next to each other`);
    this.players.forEach((_, pi) => {
      const mine = Object.keys(this.roads).map(Number).filter(e => this.roads[e] === pi), seen = new Set();
      for (const e0 of mine) {
        if (seen.has(e0)) continue;
        let anchored = false, size = 0;
        const stack = [e0]; seen.add(e0);
        while (stack.length) {
          const e = stack.pop(); size++;
          for (const v of edges[e].v) {
            if (this.buildings[v] && this.buildings[v].p === pi) anchored = true;
            for (const o of vertices[v].edges) if (this.roads[o] === pi && !seen.has(o)) { seen.add(o); stack.push(o); }
          }
        }
        if (!anchored) bad.push(`player ${pi} has an isolated group of ${size} road(s)`);
      }
    });
    if (this.phase !== 'setup') for (const [v, b] of Object.entries(this.buildings)) if (!vertices[v].edges.some(e => this.roads[e] === b.p)) bad.push(`${b.type} at ${v} touches none of its owner's roads`);
    return bad;
  }

  // Roads that no longer link back to one of their owner's settlements or cities, because an
  // opponent built on a corner along the way. They stay on the board (as in the official rules).
  cutOffRoads() {
    const { vertices, edges } = this.board, out = [];
    for (let pi = 0; pi < this.players.length; pi++) {
      const reach = new Set(), seenV = new Set(), stack = [];
      for (const [v, b] of Object.entries(this.buildings)) if (b.p === pi) { stack.push(+v); seenV.add(+v); }
      while (stack.length) {
        const v = stack.pop();
        for (const e of vertices[v].edges) {
          if (this.roads[e] !== pi || reach.has(e)) continue;
          reach.add(e);
          const o = edges[e].v[0] === v ? edges[e].v[1] : edges[e].v[0], bo = this.buildings[o];
          if ((bo && bo.p !== pi) || seenV.has(o)) continue;   // an opponent's building ends the chain here
          seenV.add(o); stack.push(o);
        }
      }
      for (const e of Object.keys(this.roads)) if (this.roads[e] === pi && !reach.has(+e)) out.push(+e);
    }
    return out;
  }

  // ----- host options, dice, friendly robber, move clock -----
  do_setOptions(pi, a) {
    if (this.phase !== 'lobby') fail('Options can only change before the game starts.');
    if (!this.isHost(pi)) fail('Only the host can change game options.');
    const o = a.opts || {}, next = { ...this.opts };
    let vp = this.vpTarget;
    if (o.vpTarget !== undefined) { vp = Number(o.vpTarget); if (!Number.isInteger(vp) || vp < 5 || vp > 20) fail('Points to win must be between 5 and 20.'); }
    if (o.discardLimit !== undefined) { const v = Number(o.discardLimit); if (!Number.isInteger(v) || v < 7 || v > 15) fail('The discard limit must be between 7 and 15 cards.'); next.discardLimit = v; }
    if (o.discardMode !== undefined) { if (!['half', 'four'].includes(o.discardMode)) fail('Discard amount must be half or 4 cards.'); next.discardMode = o.discardMode; }
    if (o.timer !== undefined) { const v = Number(o.timer); if (![0, 15, 30, 60].includes(v)) fail('The move timer can be off, 15, 30 or 60 seconds.'); next.timer = v; }
    if (o.friendlyRobber !== undefined) next.friendlyRobber = !!o.friendlyRobber;
    if (o.balancedDice !== undefined) next.balancedDice = !!o.balancedDice;
    this.vpTarget = vp; this.opts = next;
  }
  discardAmount(t) { return this.opts.discardMode === 'four' ? 4 : Math.floor(t / 2); }

  rollDice() {
    if (this.forcedDice) { const d = this.forcedDice.shift(); if (!this.forcedDice.length) this.forcedDice = null; return d; }
    const die = () => 1 + Math.floor(this.rng() * 6);
    if (!this.opts.balancedDice) return [die(), die()];
    // Same idea as colonist.io: one 36-roll deck, reshuffled when 12 remain,
    // and a 30% chance of skipping a card that repeats the previous total.
    if (this.diceDeck.length <= 12) {
      const deck = [];
      for (let x = 1; x <= 6; x++) for (let y = 1; y <= 6; y++) deck.push([x, y]);
      this.diceDeck = shuffle(deck, this.rng);
    }
    let i = this.diceDeck.length - 1;
    const c = this.diceDeck[i];
    if (this.lastSum !== null && c[0] + c[1] === this.lastSum && this.rng() < 0.3) {
      const alt = this.diceDeck.findIndex(k => k[0] + k[1] !== this.lastSum);
      if (alt >= 0) i = alt;
    }
    const d = this.diceDeck.splice(i, 1)[0];
    this.lastSum = d[0] + d[1];
    return d;
  }

  // Friendly robber: players with 2 or fewer public points are protected.
  isProtected(p) { return this.opts.friendlyRobber && this.vp(p, false) < 3; }
  tileHasProtected(tile, pi) {
    return this.board.tiles[tile].vertices.some(v => { const b = this.buildings[v]; return b && b.p !== pi && this.isProtected(b.p); });
  }
  legalRobberTiles(pi) {
    const all = this.board.tiles.map(t => t.id).filter(id => id !== this.robber && !this.isHidden(id));
    if (!this.opts.friendlyRobber) return all;
    const ok = all.filter(id => !this.tileHasProtected(id, pi));
    if (ok.length) return ok;
    const desert = this.board.tiles.filter(t => t.terrain === 'desert').map(t => t.id);
    return desert.length ? desert : [this.robber];
  }
  autoRobber(pi) {
    const pips = t => (t.number ? 6 - Math.abs(7 - t.number) : 0);
    let bestT = null, bestS = -Infinity;
    for (const id of this.legalRobberTiles(pi)) {
      const t = this.board.tiles[id]; let s = this.rng() * 0.1;
      for (const v of t.vertices) {
        const b = this.buildings[v]; if (!b) continue;
        const w = pips(t) * (b.type === 'city' ? 2 : 1);
        s += b.p === pi ? -2 * w : (this.isProtected(b.p) ? 0 : w);
      }
      if (s > bestS) { bestS = s; bestT = id; }
    }
    this.do_robber(pi, { tile: bestT, victim: this.robberVictims(pi, bestT)[0] });
  }

  clockSig() {
    return [this.phase, this.turn, this.turnNumber, this.subphase, this.setup ? this.setup.step + this.setup.expect : '', this.rolled, Object.keys(this.pendingDiscards).join(','), this.freeRoads].join('|');
  }
  // Seconds the current step is allowed to take; 0 means no clock (off, or a bot is acting).
  clockLimit() {
    const T = this.opts.timer;
    if (!T) return 0;
    if (this.phase === 'setup') return this.isBot(this.turn) ? 0 : 60;
    if (this.phase !== 'main') return 0;
    if (this.subphase === 'discard') return Object.keys(this.pendingDiscards).some(k => !this.isBot(+k)) ? Math.max(T, 20) : 0;
    return this.isBot(this.turn) ? 0 : T;
  }
  timerView() {
    const lim = this.clockLimit();
    return { setting: this.opts.timer, limit: lim, left: lim ? Math.max(0, this.clockAt + lim * 1000 - Date.now()) : null };
  }
  // Called by the server when the clock runs out: plays one step for the player who ran out of time.
  timeout() {
    const lim = this.clockLimit();
    if (!lim || Date.now() < this.clockAt + lim * 1000 - 25) return false;
    const who = this.players[this.turn];
    if (this.phase === 'setup') this.autoTurn(this.turn);
    else if (this.subphase === 'discard') {
      Object.keys(this.pendingDiscards).map(Number).filter(k => !this.isBot(k)).forEach(k => this.autoDiscard(k));
      this.addLog('Time ran out: cards were discarded automatically.');
    } else if (this.subphase === 'robber') { this.addLog(`${who.name} ran out of time; the robber moved automatically.`); this.autoRobber(this.turn); }
    else if (this.subphase === 'roadBuilding') { this.subphase = null; this.freeRoads = 0; this.addLog(`${who.name} ran out of time; the free roads were skipped.`); }
    else if (!this.rolled) { this.addLog(`${who.name} ran out of time; the dice rolled automatically.`); this.do_roll(this.turn); }
    else { this.addLog(`${who.name} ran out of time. Turn ended.`); this.do_endTurn(this.turn); }
    this.checkWin();
    this.clockAt = Date.now(); this.version++;
    return true;
  }
  // Every player keeps the colour they chose; anyone without one gets the first free colour.
  assignColors() {
    const taken = new Set();
    this.players.forEach(p => { if (p.colorId && !taken.has(p.colorId)) taken.add(p.colorId); else p.colorId = null; });
    this.players.forEach(p => {
      if (!p.colorId) { const c = PALETTE.find(x => !taken.has(x.id)); p.colorId = c.id; taken.add(c.id); }
      const c = PALETTE.find(x => x.id === p.colorId); p.color = c.hex; p.colorName = c.name;
    });
  }
  isHost(pi) { return !!this.players[pi] && this.players[pi].token === this.hostToken; }
  indexOf(token) { return this.players.findIndex(p => p.token === token); }
  addLog(text) { this.log.push({ text, at: Date.now() }); if (this.log.length > 80) this.log.shift(); }

  // ----- helpers -----
  has(pi, cost) { const r = this.players[pi].res; return RES.every(k => (r[k] || 0) >= (cost[k] || 0)); }
  pay(pi, cost) {
    if (!this.has(pi, cost)) fail('Not enough resources.');
    RES.forEach(k => { const n = cost[k] || 0; this.players[pi].res[k] -= n; this.bank[k] += n; });
  }
  vertexFree(v) {
    const vx = this.board.vertices[v];
    if (!vx) fail('That spot does not exist.');
    if (this.buildings[v]) return false;
    return vx.adj.every(n => !this.buildings[n]);
  }
  canSettle(pi, v, needRoad) {
    if (!this.board.vertices[v] || !this.vertexFree(v)) return false;
    if (!this.board.vertices[v].hexes.some(h => this.board.tiles[h].terrain !== 'desert')) return false;   // nothing grows next to only desert
    if (!needRoad) return true;
    return this.board.vertices[v].edges.some(e => this.roads[e] === pi);
  }
  canRoad(pi, e, anchor) {
    const edge = this.board.edges[e];
    if (!edge || this.roads[e] !== undefined) return false;
    if (anchor !== undefined) return edge.v.includes(anchor);
    return edge.v.some(v => {
      const b = this.buildings[v];
      if (b && b.p === pi) return true;
      if (b && b.p !== pi) return false;
      return this.board.vertices[v].edges.some(o => o !== e && this.roads[o] === pi);
    });
  }
  validRoads(pi) { return this.board.edges.filter(e => this.canRoad(pi, e.id)).map(e => e.id); }
  validSettlements(pi, needRoad) { return this.board.vertices.filter(v => this.canSettle(pi, v.id, needRoad)).map(v => v.id); }
  tradeRatio(pi, res) {
    let ratio = 4;
    for (const [v, b] of Object.entries(this.buildings)) {
      if (b.p !== pi) continue;
      const port = this.board.vertices[v].port;
      if (port === res) ratio = Math.min(ratio, 2);
      else if (port === 'any') ratio = Math.min(ratio, 3);
    }
    return ratio;
  }
  vp(pi, hidden = true) {
    let v = 0;
    for (const b of Object.values(this.buildings)) if (b.p === pi) v += b.type === 'city' ? 2 : 1;
    if (this.longestRoad && this.longestRoad.p === pi) v += 2;
    if (this.largestArmy && this.largestArmy.p === pi) v += 2;
    if (hidden) v += this.players[pi].dev.filter(d => d.type === 'vp').length;
    return v;
  }
  roadLength(pi) {
    const { vertices, edges } = this.board;
    const mine = Object.keys(this.roads).filter(e => this.roads[e] === pi).map(Number);
    if (!mine.length) return 0;
    const blocked = v => { const b = this.buildings[v]; return b && b.p !== pi; };
    const visited = new Set();
    const dfs = v => {
      let best = 0;
      for (const e of vertices[v].edges) {
        if (this.roads[e] !== pi || visited.has(e)) continue;
        visited.add(e);
        const o = edges[e].v[0] === v ? edges[e].v[1] : edges[e].v[0];
        best = Math.max(best, 1 + (blocked(o) ? 0 : dfs(o)));
        visited.delete(e);
      }
      return best;
    };
    const starts = new Set(); mine.forEach(e => edges[e].v.forEach(v => starts.add(v)));
    let best = 0;
    for (const v of starts) best = Math.max(best, dfs(v));
    return best;
  }
  updateLongestRoad() {
    const lens = this.players.map((_, i) => this.roadLength(i));
    const max = Math.max(...lens);
    const holder = this.longestRoad ? this.longestRoad.p : null;
    const before = holder;
    if (holder !== null && lens[holder] >= 5 && lens[holder] >= max) this.longestRoad = { p: holder, len: lens[holder] };
    else {
      const top = lens.map((l, i) => l === max ? i : -1).filter(i => i >= 0);
      this.longestRoad = max >= 5 && top.length === 1 ? { p: top[0], len: max } : null;
    }
    const after = this.longestRoad ? this.longestRoad.p : null;
    if (after !== before) {
      if (after !== null) this.addLog(`${this.players[after].name} takes Longest Road (${this.longestRoad.len}).`);
      else this.addLog('Longest Road is now unclaimed.');
    }
    this.roadLens = lens;
  }
  updateLargestArmy(pi) {
    const k = this.players[pi].knights;
    if (k >= 3 && (!this.largestArmy || (this.largestArmy.p !== pi && k > this.largestArmy.size))) {
      this.largestArmy = { p: pi, size: k };
      this.addLog(`${this.players[pi].name} takes Largest Army (${k}).`);
    } else if (this.largestArmy && this.largestArmy.p === pi) this.largestArmy.size = k;
  }
  giveFromBank(pi, res, n) {
    const amt = Math.min(n, this.bank[res]);
    this.bank[res] -= amt; this.players[pi].res[res] += amt; return amt;
  }

  // ----- actions -----
  act(pi, a) {
    if (!a || typeof a.type !== 'string') fail('Unknown action.');
    if (pi < 0 || !this.players[pi]) fail('You are not in this game.');
    if (this.phase === 'ended' && a.type !== 'chat') fail('The game is over.');
    const fn = this['do_' + a.type];
    if (!fn) fail('Unknown action.');
    const sigBefore = this.clockSig();
    const out = fn.call(this, pi, a);
    this.checkWin();
    if (this.clockSig() !== sigBefore || (pi === this.turn && !['chat', 'offer', 'cancelTrade', 'respond'].includes(a.type))) this.clockAt = Date.now();
    this.version++;
    return out;
  }
  mustBeTurn(pi) { if (this.turn !== pi) fail('It is not your turn.'); }
  mustMain(pi, { needRoll = true, allowSub = false } = {}) {
    if (this.phase !== 'main') fail('Not available right now.');
    this.mustBeTurn(pi);
    if (!allowSub && this.subphase) fail(this.subphaseHint());
    if (needRoll && !this.rolled) fail('Roll the dice first.');
  }
  subphaseHint() {
    return { discard: 'Waiting for players to discard.', robber: 'Move the robber first.', roadBuilding: 'Place your free roads first.' }[this.subphase] || 'Finish the current step first.';
  }

  do_chat(pi, a) {
    const text = String(a.text || '').trim().slice(0, 200);
    if (text) { this.log.push({ text, chat: pi, at: Date.now() }); if (this.log.length > 80) this.log.shift(); }
  }

  do_start(pi) {
    if (this.phase !== 'lobby') fail('Game already started.');
    if (!this.isHost(pi)) fail('Only the host can start the game.');
    if (this.players.length < 2) fail('At least 2 players are needed.');
    shuffle(this.players, this.rng);
    this.assignColors();
    const n = this.players.length;
    const order = [...Array(n).keys(), ...[...Array(n).keys()].reverse()];
    this.setup = { order, step: 0, expect: 'settlement', last: null };
    this.phase = 'setup'; this.turn = order[0];
    this.addLog(`Game started on ${this.board.name}. ${this.players[this.turn].name} places first.`);
  }

  do_settle(pi, a) {
    const v = a.vertex | 0;
    if (this.phase === 'setup') {
      this.mustBeTurn(pi);
      if (this.setup.expect !== 'settlement') fail('Place a road next to your settlement.');
      if (!this.canSettle(pi, v, false)) fail('Settlements must be at least two roads apart.');
      this.buildings[v] = { p: pi, type: 'settlement' }; this.revealTiles(this.board.vertices[v].hexes, pi);
      this.players[pi].pieces.settlement--;
      this.setup.last = v; this.setup.expect = 'road';
      if (this.setup.step >= this.players.length) {
        const got = [];
        for (const h of this.board.vertices[v].hexes) {
          const res = PRODUCES[this.board.tiles[h].terrain];
          if (res && this.giveFromBank(pi, res, 1)) got.push(res);
        }
        if (got.length) this.emit('start', { p: pi, res: got });
        this.addLog(`${this.players[pi].name} placed a settlement` + (got.length ? ` and collected ${got.map(r => LABEL[r]).join(', ')}.` : '.'));
      } else this.addLog(`${this.players[pi].name} placed a settlement.`);
      this.updateLongestRoad();
      return;
    }
    this.mustMain(pi);
    if (this.players[pi].pieces.settlement <= 0) fail('You have no settlements left.');
    if (!this.canSettle(pi, v, true)) fail('Settlements need a free spot touching your road, two roads from any town.');
    this.pay(pi, COST.settlement);
    this.buildings[v] = { p: pi, type: 'settlement' }; this.revealTiles(this.board.vertices[v].hexes, pi);
    this.players[pi].pieces.settlement--;
    this.addLog(`${this.players[pi].name} built a settlement.`);
    this.updateLongestRoad();
  }

  do_road(pi, a) {
    const e = a.edge | 0;
    if (this.phase === 'setup') {
      this.mustBeTurn(pi);
      if (this.setup.expect !== 'road') fail('Place a settlement first.');
      if (!this.canRoad(pi, e, this.setup.last)) fail('The road must touch the settlement you just placed.');
      this.roads[e] = pi; this.players[pi].pieces.road--; this.revealTiles(this.board.edges[e].hexes, pi);
      this.updateLongestRoad();
      this.setup.step++;
      if (this.setup.step >= this.setup.order.length) {
        this.phase = 'main'; this.turn = this.setup.order[0]; this.turnNumber = 1; this.rolled = false; this.setup = null;
        this.addLog(`Setup complete. ${this.players[this.turn].name} rolls first.`);
      } else {
        this.turn = this.setup.order[this.setup.step]; this.setup.expect = 'settlement'; this.setup.last = null;
      }
      return;
    }
    if (this.subphase === 'roadBuilding') {
      this.mustBeTurn(pi);
      if (!this.canRoad(pi, e)) fail('Roads must connect to your network.');
      this.roads[e] = pi; this.players[pi].pieces.road--; this.revealTiles(this.board.edges[e].hexes, pi); this.freeRoads--;
      this.addLog(`${this.players[pi].name} placed a free road.`);
      if (this.freeRoads <= 0 || this.players[pi].pieces.road <= 0 || !this.validRoads(pi).length) { this.subphase = null; this.freeRoads = 0; }
      this.updateLongestRoad();
      return;
    }
    this.mustMain(pi);
    if (this.players[pi].pieces.road <= 0) fail('You have no roads left.');
    if (!this.canRoad(pi, e)) fail('Roads must connect to your network.');
    this.pay(pi, COST.road);
    this.roads[e] = pi; this.players[pi].pieces.road--; this.revealTiles(this.board.edges[e].hexes, pi);
    this.addLog(`${this.players[pi].name} built a road.`);
    this.updateLongestRoad();
  }

  do_city(pi, a) {
    const v = a.vertex | 0;
    this.mustMain(pi);
    const b = this.buildings[v];
    if (!b || b.p !== pi || b.type !== 'settlement') fail('Cities replace one of your settlements.');
    if (this.players[pi].pieces.city <= 0) fail('You have no cities left.');
    this.pay(pi, COST.city);
    b.type = 'city'; this.players[pi].pieces.city--; this.players[pi].pieces.settlement++;
    this.addLog(`${this.players[pi].name} upgraded to a city.`);
  }

  do_roll(pi) {
    if (this.phase !== 'main') fail('Not available right now.');
    this.mustBeTurn(pi);
    if (this.rolled) fail('You already rolled this turn.');
    if (this.subphase) fail(this.subphaseHint());
    const d = this.rollDice();
    this.dice = d; this.rolled = true;
    const sum = d[0] + d[1];
    this.diceCounts[sum]++;
    if (sum === 7) this.players[pi].stats.sevens++;
    const gains = this.players.map(() => emptyRes());
    this.addLog(`${this.players[pi].name} rolled ${sum}.`);
    if (sum === 7) {
      this.pendingDiscards = {};
      const limit = this.opts.discardLimit;
      this.players.forEach((p, i) => { const t = total(p.res); if (t > limit) this.pendingDiscards[i] = this.discardAmount(t); });
      this.subphase = Object.keys(this.pendingDiscards).length ? 'discard' : 'robber';
      if (this.subphase === 'discard') this.addLog(`Players with more than ${limit} cards must discard ${this.opts.discardMode === 'four' ? '4' : 'half'}.`);
    } else this.produce(sum, gains);
    this.lastRoll = { dice: d, gains, seq: (this.lastRoll ? this.lastRoll.seq : 0) + 1 };
  }

  produce(sum, gains) {
    const owed = this.players.map(() => emptyRes());
    this.board.tiles.forEach((t, ti) => {
      if (t.number !== sum || ti === this.robber) return;
      const res = PRODUCES[t.terrain]; if (!res) return;
      for (const v of t.vertices) { const b = this.buildings[v]; if (b) owed[b.p][res] += b.type === 'city' ? 2 : 1; }
    });
    for (const res of RES) {
      const need = owed.reduce((a, o) => a + o[res], 0);
      if (!need) continue;
      const who = owed.map((o, i) => o[res] ? i : -1).filter(i => i >= 0);
      if (need > this.bank[res] && who.length > 1) { this.addLog(`The bank ran out of ${LABEL[res]}; nobody receives it.`); continue; }
      who.forEach(i => { gains[i][res] = this.giveFromBank(i, res, owed[i][res]); this.players[i].stats.collected += gains[i][res]; });
    }
    this.players.forEach((p, i) => {
      const g = RES.filter(k => gains[i][k]).map(k => `${gains[i][k]} ${LABEL[k]}`);
      if (g.length) this.addLog(`${p.name} received ${g.join(', ')}.`);
    });
  }

  do_discard(pi, a) {
    if (this.subphase !== 'discard') fail('No discard is needed now.');
    const need = this.pendingDiscards[pi];
    if (!need) fail('You do not need to discard.');
    const r = a.res || {};
    if (RES.some(k => r[k] != null && (!Number.isInteger(r[k]) || r[k] < 0))) fail('Invalid discard.');
    if (total(r) !== need) fail(`Choose exactly ${need} cards to discard.`);
    if (!this.has(pi, r)) fail('You do not have those cards.');
    this.pay(pi, r);
    this.players[pi].stats.discarded += need;
    delete this.pendingDiscards[pi];
    this.addLog(`${this.players[pi].name} discarded ${need} cards.`);
    if (!Object.keys(this.pendingDiscards).length) this.subphase = 'robber';
  }

  robberVictims(pi, tile) {
    const set = new Set();
    for (const v of this.board.tiles[tile].vertices) {
      const b = this.buildings[v];
      if (b && b.p !== pi && total(this.players[b.p].res) > 0 && !this.isProtected(b.p)) set.add(b.p);
    }
    return [...set];
  }

  do_robber(pi, a) {
    this.mustBeTurn(pi);
    if (this.subphase !== 'robber') fail('You cannot move the robber now.');
    const t = a.tile | 0;
    if (!this.board.tiles[t]) fail('Pick a land tile.');
    if (this.isHidden(t)) fail('That tile is still hidden in the fog. Pick a tile you can see.');
    if (!this.legalRobberTiles(pi).includes(t)) fail(this.opts.friendlyRobber && t !== this.robber ? 'Friendly robber: players with 2 points or fewer are protected. Pick another tile.' : 'The robber must move to a different tile.');
    const victims = this.robberVictims(pi, t);
    let victim = a.victim;
    if (victims.length && !victims.includes(victim)) {
      if (victims.length === 1) victim = victims[0]; else fail('Choose a player to steal from.');
    }
    this.robber = t; this.subphase = null;
    let msg = `${this.players[pi].name} moved the robber`;
    if (victims.length) {
      const pool = [];
      RES.forEach(k => { for (let i = 0; i < this.players[victim].res[k]; i++) pool.push(k); });
      const card = pool[Math.floor(this.rng() * pool.length)];
      this.players[victim].res[card]--; this.players[pi].res[card]++;
      this.players[pi].stats.stolen++; this.players[victim].stats.lostToRobber++;
      msg += ` and stole a card from ${this.players[victim].name}`;
      this.lastSteal = { from: victim, to: pi, card, seq: (this.lastSteal ? this.lastSteal.seq : 0) + 1 };
    }
    this.addLog(msg + '.');
  }

  do_buyDev(pi) {
    this.mustMain(pi);
    if (!this.devDeck.length) fail('No development cards remain.');
    this.pay(pi, COST.dev);
    const type = this.devDeck.pop();
    this.players[pi].dev.push({ type, turn: this.turnNumber });
    this.players[pi].stats.devBought++;
    this.addLog(`${this.players[pi].name} bought a development card.`);
    return { card: type };
  }

  do_playDev(pi, a) {
    this.mustMain(pi, { needRoll: false });
    if (this.devPlayed) fail('You can play one development card per turn.');
    const type = a.card;
    if (type === 'vp') fail('Victory Point cards count automatically.');
    const p = this.players[pi];
    const idx = p.dev.findIndex(d => d.type === type && d.turn < this.turnNumber);
    if (idx < 0) fail(p.dev.some(d => d.type === type) ? 'Cards bought this turn can be played next turn.' : 'You do not have that card.');
    if (type === 'roadBuilding' && (p.pieces.road <= 0 || !this.validRoads(pi).length)) fail('You have nowhere to place roads.');
    if (type === 'yearOfPlenty') {
      const pick = Array.isArray(a.res) ? a.res : [];
      if (pick.length !== 2 || !pick.every(r => RES.includes(r))) fail('Pick two resources.');
      const need = emptyRes(); pick.forEach(r => need[r]++);
      if (RES.some(k => need[k] > this.bank[k])) fail('The bank does not have those resources.');
    }
    if (type === 'monopoly' && !RES.includes(a.res)) fail('Pick a resource.');
    if (!['knight', 'roadBuilding', 'yearOfPlenty', 'monopoly'].includes(type)) fail('Unknown card.');
    p.dev.splice(idx, 1); this.devPlayed = true; p.stats.devPlayed++;
    this.devPlayedCount[type] = (this.devPlayedCount[type] || 0) + 1;
    if (type === 'knight') {
      p.knights++; this.updateLargestArmy(pi); this.subphase = 'robber';
      this.addLog(`${p.name} played a Knight.`);
    } else if (type === 'roadBuilding') {
      this.freeRoads = Math.min(2, p.pieces.road); this.subphase = 'roadBuilding';
      this.addLog(`${p.name} played Road Building.`);
    } else if (type === 'yearOfPlenty') {
      a.res.forEach(r => this.giveFromBank(pi, r, 1));
      this.emit('yop', { p: pi, res: a.res.slice() });
      this.addLog(`${p.name} played Year of Plenty for ${a.res.map(r => LABEL[r]).join(' and ')}.`);
    } else if (type === 'monopoly') {
      let got = 0; const takes = {};
      this.players.forEach((o, i) => { if (i !== pi) { got += o.res[a.res]; if (o.res[a.res]) takes[i] = o.res[a.res]; p.res[a.res] += o.res[a.res]; o.res[a.res] = 0; } });
      this.lastMonopoly = { by: pi, res: a.res, takes, seq: (this.lastMonopoly ? this.lastMonopoly.seq : 0) + 1 };
      this.addLog(`${p.name} played Monopoly and took ${got} ${LABEL[a.res]}.`);
    }
  }

  do_bankTrade(pi, a) {
    this.mustMain(pi);
    if (!RES.includes(a.give) || !RES.includes(a.get) || a.give === a.get) fail('Pick two different resources.');
    const ratio = this.tradeRatio(pi, a.give);
    if (this.players[pi].res[a.give] < ratio) fail(`You need ${ratio} ${LABEL[a.give]} for this trade.`);
    if (this.bank[a.get] < 1) fail(`The bank is out of ${LABEL[a.get]}.`);
    this.pay(pi, { [a.give]: ratio });
    this.giveFromBank(pi, a.get, 1);
    this.players[pi].stats.bankTrades++;
    this.emit('bank', { p: pi, give: { [a.give]: ratio }, get: { [a.get]: 1 } });
    this.addLog(`${this.players[pi].name} traded ${ratio} ${LABEL[a.give]} for 1 ${LABEL[a.get]} with the bank.`);
  }

  cleanRes(r) {
    const out = emptyRes();
    if (!r || typeof r !== 'object') return out;
    RES.forEach(k => { const n = r[k] | 0; if (n < 0 || n > 30) fail('Invalid amount.'); out[k] = n; });
    return out;
  }
  do_offer(pi, a) {
    this.mustMain(pi);
    const give = this.cleanRes(a.give), get = this.cleanRes(a.get);
    if (!total(give) || !total(get)) fail('A trade needs cards on both sides.');
    if (RES.some(k => give[k] && get[k])) fail('Do not offer and ask for the same resource.');
    if (!this.has(pi, give)) fail('You do not have the cards you are offering.');
    this.trade = { from: pi, give, get, accepted: [], declined: [], id: (this.trade ? this.trade.id : 0) + 1 };
    this.addLog(`${this.players[pi].name} proposed a trade.`);
  }
  do_respond(pi, a) {
    if (!this.trade || this.phase !== 'main') fail('There is no open trade.');
    if (pi === this.trade.from) fail('You made this offer.');
    this.trade.accepted = this.trade.accepted.filter(i => i !== pi);
    this.trade.declined = this.trade.declined.filter(i => i !== pi);
    if (a.accept) {
      if (!this.has(pi, this.trade.get)) fail('You do not have the cards requested.');
      this.trade.accepted.push(pi);
    } else this.trade.declined.push(pi);
  }
  do_confirm(pi, a) {
    if (!this.trade || this.trade.from !== pi) fail('There is no offer of yours to confirm.');
    const w = a.with;
    if (!this.trade.accepted.includes(w)) fail('That player has not accepted.');
    const { give, get } = this.trade;
    if (!this.has(pi, give)) fail('You no longer have the offered cards.');
    if (!this.has(w, get)) { this.trade.accepted = this.trade.accepted.filter(i => i !== w); fail('That player no longer has the cards.'); }
    const A = this.players[pi].res, B = this.players[w].res;
    RES.forEach(k => { A[k] += get[k] - give[k]; B[k] += give[k] - get[k]; });
    this.players[pi].stats.playerTrades++; this.players[w].stats.playerTrades++;
    const nz = o => Object.fromEntries(Object.entries(o).filter(([, n]) => n));
    this.emit('trade', { a: pi, b: w, give: nz(give), get: nz(get) });
    this.addLog(`${this.players[pi].name} traded with ${this.players[w].name}.`);
    this.trade = null;
  }
  do_cancelTrade(pi) {
    if (!this.trade || this.trade.from !== pi) fail('There is no offer to cancel.');
    this.trade = null;
  }

  do_endTurn(pi) {
    this.mustMain(pi);
    this.trade = null;
    this.turn = (this.turn + 1) % this.players.length;
    this.turnNumber++; this.rolled = false; this.devPlayed = false;
    this.addLog(`${this.players[this.turn].name}'s turn.`);
  }

  // Host can move the game along when the active player has disconnected.
  do_skip(pi) {
    if (!this.isHost(pi)) fail('Only the host can skip.');
    const stuck = [];
    if (this.subphase === 'discard') Object.keys(this.pendingDiscards).forEach(k => { if (!this.players[k].connected) stuck.push(+k); });
    const cur = this.turn;
    if (!stuck.length && this.players[cur].connected) fail('Players can only be skipped while disconnected.');
    stuck.forEach(i => this.autoDiscard(i));
    if (!this.players[cur].connected) this.autoTurn(cur);
  }
  autoDiscard(i) {
    const need = this.pendingDiscards[i]; if (!need) return;
    const r = emptyRes(); const p = this.players[i].res;
    for (let n = 0; n < need; n++) { const k = RES.slice().sort((a, b) => (p[b] - r[b]) - (p[a] - r[a]))[0]; r[k]++; }
    this.do_discard(i, { res: r });
  }
  autoTurn(i) {
    if (this.phase === 'setup') {
      if (this.setup.expect === 'settlement') {
        const pipsAt = v => this.board.vertices[v].hexes.reduce((n, h) => { const t = this.board.tiles[h]; return n + (PRODUCES[t.terrain] ? 6 - Math.abs(7 - t.number) : 0); }, 0);
        const opts = this.validSettlements(i, false).sort((a, b) => pipsAt(b) - pipsAt(a));
        this.do_settle(i, { vertex: opts[0] });
      }
      const roads = this.board.vertices[this.setup.last].edges.filter(e => this.roads[e] === undefined);
      this.do_road(i, { edge: roads[0] });
      this.addLog(`${this.players[i].name} was placed automatically.`);
      return;
    }
    if (this.phase !== 'main') return;
    if (!this.rolled && !this.subphase) this.do_roll(i);
    if (this.subphase === 'discard') Object.keys(this.pendingDiscards).forEach(k => { if (!this.players[k].connected) this.autoDiscard(+k); });
    if (this.subphase === 'discard') { this.addLog('Waiting on discards before skipping.'); return; }
    if (this.subphase === 'robber') this.autoRobber(i);
    if (this.subphase === 'roadBuilding') { this.subphase = null; this.freeRoads = 0; }
    this.addLog(`${this.players[i].name}'s turn was skipped.`);
    this.do_endTurn(i);
  }

  checkWin() {
    if (this.phase !== 'main') return;
    const v = this.vp(this.turn, true);
    if (v >= this.vpTarget) {
      this.phase = 'ended'; this.winner = this.turn; this.subphase = null; this.trade = null;
      this.addLog(`${this.players[this.turn].name} wins with ${v} victory points!`);
    }
  }

  // ----- views -----
  boardView() {
    const { tiles, vertices, edges, ports, name } = this.board;
    return {
      name, key: this.board.key,
      tiles: tiles.map(t => { const hid = this.isHidden(t.id); return { id: t.id, q: t.q, r: t.r, x: t.x, y: t.y, terrain: hid ? 'fog' : t.terrain, number: hid ? null : t.number, fog: !!t.fog, vertices: t.vertices }; }),
      vertices: vertices.map(v => ({ id: v.id, x: v.x, y: v.y, port: v.port, edges: v.edges, adj: v.adj, hexes: v.hexes })),
      edges: edges.map(e => ({ id: e.id, v: e.v })),
      ports,
    };
  }
  view(pi) {
    const ended = this.phase === 'ended';
    const me = this.players[pi];
    return {
      code: this.code, phase: this.phase, you: pi, version: this.version, vpTarget: this.vpTarget, mapName: this.board.name,
      opts: this.opts, timer: this.timerView(), palette: PALETTE, events: this.events, devPile: { total: this.devTotal, played: this.devPlayedCount }, cutRoads: this.cutOffRoads(),
      robberOptions: this.subphase === 'robber' && pi === this.turn ? this.legalRobberTiles(pi) : null,
      players: this.players.map((p, i) => ({
        name: p.name, host: p.token === this.hostToken, bot: p.bot, stats: p.stats, colorId: p.colorId, color: p.color, colorName: p.colorName, connected: p.connected,
        cards: total(p.res), devCount: p.dev.length, knights: p.knights, pieces: p.pieces,
        vp: this.vp(i, ended || i === pi), roadLen: this.roadLens ? this.roadLens[i] : 0,
        res: ended ? p.res : undefined, devReveal: ended ? p.dev.map(d => d.type) : undefined,
      })),
      me: me ? { res: me.res, dev: me.dev.map(d => ({ type: d.type, fresh: d.turn >= this.turnNumber })),
        ratios: Object.fromEntries(RES.map(k => [k, this.tradeRatio(pi, k)])) } : null,
      buildings: this.buildings, roads: this.roads, robber: this.robber,
      turn: this.turn, turnNumber: this.turnNumber, rolled: this.rolled, dice: this.dice,
      subphase: this.subphase, pendingDiscards: this.pendingDiscards, freeRoads: this.freeRoads, devPlayed: this.devPlayed,
      setup: this.setup ? { expect: this.setup.expect, last: this.setup.last, round: this.setup.step < this.players.length ? 1 : 2, order: this.setup.order, step: this.setup.step } : null,
      trade: this.trade, largestArmy: this.largestArmy, longestRoad: this.longestRoad,
      bank: this.bank, devLeft: this.devDeck.length, diceCounts: this.diceCounts, log: this.log.slice(-40), winner: this.winner,
      lastMonopoly: this.lastMonopoly, lastRoll: this.lastRoll, lastSteal: this.lastSteal && (this.lastSteal.from === pi || this.lastSteal.to === pi) ? this.lastSteal : (this.lastSteal ? { ...this.lastSteal, card: null } : null),
    };
  }
}

module.exports = { Game, GameError, RES, COST, buildGeometry, MAX_PLAYERS, DEV_NAMES, BOT_LEVELS };
