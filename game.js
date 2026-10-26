'use strict';
const { PRODUCES, shuffle } = require('./maps');

const RES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
const COST = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
  dev: { sheep: 1, wheat: 1, ore: 1 },
};
const COLORS = ['#d8432f', '#2f6fd8', '#e8a21c', '#3f9b4f'];
const COLOR_NAMES = ['Red', 'Blue', 'Gold', 'Green'];
const LABEL = { wood: 'lumber', brick: 'brick', sheep: 'wool', wheat: 'grain', ore: 'ore' };
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
  const tiles = rawTiles.map(t => ({ q: t.q, r: t.r, terrain: t.terrain, number: t.number ?? null }));
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

function placePorts(geo, rng) {
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
    const geo = buildGeometry(map.tiles);
    this.board = { name: map.name, key: map.key, ...geo };
    this.board.ports = placePorts(geo, rng);
    const desert = geo.tiles.findIndex(t => t.terrain === 'desert');
    this.robber = desert >= 0 ? desert : 0;
    this.vpTarget = Math.max(5, Math.min(20, vpTarget | 0 || 10));
    const land = geo.tiles.length;
    this.bank = {}; RES.forEach(k => { this.bank[k] = Math.max(19, land); });
    const dev = [];
    const scale = land > 30 ? 2 : 1;
    for (let s = 0; s < scale; s++) {
      for (let i = 0; i < 14; i++) dev.push('knight');
      for (let i = 0; i < 5; i++) dev.push('vp');
      ['roadBuilding', 'yearOfPlenty', 'monopoly'].forEach(t => dev.push(t, t));
    }
    this.devDeck = shuffle(dev, rng);
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

  // ----- players -----
  addPlayer(name, token) {
    if (this.phase !== 'lobby') fail('This game has already started.');
    if (this.players.length >= MAX_PLAYERS) fail('This room is full (4 players).');
    name = String(name || '').trim().slice(0, 16) || 'Player ' + (this.players.length + 1);
    if (this.players.some(p => p.name.toLowerCase() === name.toLowerCase())) fail('That name is taken in this room.');
    const p = { name, token, connected: false, res: emptyRes(), dev: [], knights: 0,
      pieces: { road: 15, settlement: 5, city: 4 }, color: null, colorName: null, bot: null, stats: newStats() };
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
  assignColors() { this.players.forEach((p, i) => { p.color = COLORS[i]; p.colorName = COLOR_NAMES[i]; }); }
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
    const out = fn.call(this, pi, a);
    this.checkWin();
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
      this.buildings[v] = { p: pi, type: 'settlement' };
      this.players[pi].pieces.settlement--;
      this.setup.last = v; this.setup.expect = 'road';
      if (this.setup.step >= this.players.length) {
        const got = [];
        for (const h of this.board.vertices[v].hexes) {
          const res = PRODUCES[this.board.tiles[h].terrain];
          if (res && this.giveFromBank(pi, res, 1)) got.push(res);
        }
        this.addLog(`${this.players[pi].name} placed a settlement` + (got.length ? ` and collected ${got.map(r => LABEL[r]).join(', ')}.` : '.'));
      } else this.addLog(`${this.players[pi].name} placed a settlement.`);
      this.updateLongestRoad();
      return;
    }
    this.mustMain(pi);
    if (this.players[pi].pieces.settlement <= 0) fail('You have no settlements left.');
    if (!this.canSettle(pi, v, true)) fail('Settlements need a free spot touching your road, two roads from any town.');
    this.pay(pi, COST.settlement);
    this.buildings[v] = { p: pi, type: 'settlement' };
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
      this.roads[e] = pi; this.players[pi].pieces.road--;
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
      this.roads[e] = pi; this.players[pi].pieces.road--; this.freeRoads--;
      this.addLog(`${this.players[pi].name} placed a free road.`);
      if (this.freeRoads <= 0 || this.players[pi].pieces.road <= 0 || !this.validRoads(pi).length) { this.subphase = null; this.freeRoads = 0; }
      this.updateLongestRoad();
      return;
    }
    this.mustMain(pi);
    if (this.players[pi].pieces.road <= 0) fail('You have no roads left.');
    if (!this.canRoad(pi, e)) fail('Roads must connect to your network.');
    this.pay(pi, COST.road);
    this.roads[e] = pi; this.players[pi].pieces.road--;
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
    const d = this.forcedDice ? this.forcedDice.shift() : [1 + Math.floor(this.rng() * 6), 1 + Math.floor(this.rng() * 6)];
    if (this.forcedDice && !this.forcedDice.length) this.forcedDice = null;
    this.dice = d; this.rolled = true;
    const sum = d[0] + d[1];
    this.diceCounts[sum]++;
    if (sum === 7) this.players[pi].stats.sevens++;
    const gains = this.players.map(() => emptyRes());
    this.addLog(`${this.players[pi].name} rolled ${sum}.`);
    if (sum === 7) {
      this.pendingDiscards = {};
      this.players.forEach((p, i) => { const t = total(p.res); if (t > 7) this.pendingDiscards[i] = Math.floor(t / 2); });
      this.subphase = Object.keys(this.pendingDiscards).length ? 'discard' : 'robber';
      if (this.subphase === 'discard') this.addLog('Players with more than 7 cards must discard half.');
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
      if (b && b.p !== pi && total(this.players[b.p].res) > 0) set.add(b.p);
    }
    return [...set];
  }

  do_robber(pi, a) {
    this.mustBeTurn(pi);
    if (this.subphase !== 'robber') fail('You cannot move the robber now.');
    const t = a.tile | 0;
    if (!this.board.tiles[t]) fail('Pick a land tile.');
    if (t === this.robber) fail('The robber must move to a different tile.');
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
    if (type === 'knight') {
      p.knights++; this.updateLargestArmy(pi); this.subphase = 'robber';
      this.addLog(`${p.name} played a Knight.`);
    } else if (type === 'roadBuilding') {
      this.freeRoads = Math.min(2, p.pieces.road); this.subphase = 'roadBuilding';
      this.addLog(`${p.name} played Road Building.`);
    } else if (type === 'yearOfPlenty') {
      a.res.forEach(r => this.giveFromBank(pi, r, 1));
      this.addLog(`${p.name} played Year of Plenty for ${a.res.map(r => LABEL[r]).join(' and ')}.`);
    } else if (type === 'monopoly') {
      let got = 0;
      this.players.forEach((o, i) => { if (i !== pi) { got += o.res[a.res]; p.res[a.res] += o.res[a.res]; o.res[a.res] = 0; } });
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
        const opts = this.validSettlements(i, false);
        this.do_settle(i, { vertex: opts[Math.floor(this.rng() * opts.length)] });
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
    if (this.subphase === 'robber') {
      const t = this.board.tiles.findIndex((_, ti) => ti !== this.robber && this.robberVictims(i, ti).length === 0);
      this.do_robber(i, { tile: t >= 0 ? t : (this.robber + 1) % this.board.tiles.length });
    }
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
      name,
      tiles: tiles.map(t => ({ id: t.id, q: t.q, r: t.r, x: t.x, y: t.y, terrain: t.terrain, number: t.number, vertices: t.vertices })),
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
      players: this.players.map((p, i) => ({
        name: p.name, host: p.token === this.hostToken, bot: p.bot, stats: p.stats, color: p.color, colorName: p.colorName, connected: p.connected,
        cards: total(p.res), devCount: p.dev.length, knights: p.knights, pieces: p.pieces,
        vp: this.vp(i, ended || i === pi), roadLen: this.roadLens ? this.roadLens[i] : 0,
        res: ended ? p.res : undefined, devReveal: ended ? p.dev.map(d => d.type) : undefined,
      })),
      me: me ? { res: me.res, dev: me.dev.map(d => ({ type: d.type, fresh: d.turn >= this.turnNumber })),
        ratios: Object.fromEntries(RES.map(k => [k, this.tradeRatio(pi, k)])) } : null,
      buildings: this.buildings, roads: this.roads, robber: this.robber,
      turn: this.turn, turnNumber: this.turnNumber, rolled: this.rolled, dice: this.dice,
      subphase: this.subphase, pendingDiscards: this.pendingDiscards, freeRoads: this.freeRoads, devPlayed: this.devPlayed,
      setup: this.setup ? { expect: this.setup.expect, last: this.setup.last, round: this.setup.step < this.players.length ? 1 : 2 } : null,
      trade: this.trade, largestArmy: this.largestArmy, longestRoad: this.longestRoad,
      bank: this.bank, devLeft: this.devDeck.length, diceCounts: this.diceCounts, log: this.log.slice(-40), winner: this.winner,
      lastRoll: this.lastRoll, lastSteal: this.lastSteal && (this.lastSteal.from === pi || this.lastSteal.to === pi) ? this.lastSteal : (this.lastSteal ? { ...this.lastSteal, card: null } : null),
    };
  }
}

module.exports = { Game, GameError, RES, COST, buildGeometry, MAX_PLAYERS, DEV_NAMES, BOT_LEVELS };
