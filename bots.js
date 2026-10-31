'use strict';
// Bot players. Each call to decide() returns exactly one legal action for one bot.
// Bots only use public information plus their own hand (bank counts, public points, card counts).
const { PRODUCES } = require('./maps');
const { RES, COST } = require('./game');

const PIPS = n => (n ? 6 - Math.abs(7 - n) : 0);
const missing = (cost, res) => RES.reduce((a, k) => a + Math.max(0, (cost[k] || 0) - (res[k] || 0)), 0);
const total = r => RES.reduce((a, k) => a + (r[k] || 0), 0);

function pick(g, arr) { return arr[Math.floor(g.rng() * arr.length)]; }
function shuffled(g, arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(g.rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function best(items, score) { let b = null, bs = -Infinity; for (const it of items) { const s = score(it); if (s > bs) { bs = s; b = it; } } return b; }

// Expected pips per resource from a player's own buildings.
function profile(g, pi) {
  const prof = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  for (const [v, b] of Object.entries(g.buildings)) {
    if (b.p !== pi) continue;
    for (const h of g.board.vertices[v].hexes) {
      const t = g.board.tiles[h], r = PRODUCES[t.terrain];
      if (r && h !== g.robber) prof[r] += PIPS(t.number) * (b.type === 'city' ? 2 : 1);
    }
  }
  return prof;
}
// Rarer resources on this board are worth more (hard bots only).
function scarcity(g) {
  if (g._scarcity) return g._scarcity;
  const tot = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  g.board.tiles.forEach(t => { const r = PRODUCES[t.terrain]; if (r && !hiddenTile(g, t)) tot[r] += PIPS(t.number); });
  const avg = RES.reduce((a, k) => a + tot[k], 0) / 5;
  const w = {}; RES.forEach(k => { w[k] = Math.sqrt(Math.min(1.8, Math.max(0.6, avg / Math.max(1, tot[k])))); });
  return (g._scarcity = w);
}

const hiddenTile = (g, t) => typeof g.isHidden === 'function' && g.isHidden(t.id);
function vertexScore(g, pi, v, level, prof = profile(g, pi)) {
  const V = g.board.vertices[v], sc = scarcity(g), seen = new Set();
  let s = 0;
  for (const h of V.hexes) {
    const t = g.board.tiles[h], r = PRODUCES[t.terrain];
    if (t.terrain === 'diamond') { s += level === 'easy' ? 3 : 7; continue; }   // an 8 that pays cards of your choice
    if (hiddenTile(g, t)) { s += 3.2; continue; }   // fog: nobody knows what is under it, so count an average tile
    if (!r) continue;
    let w = level === 'hard' ? sc[r] : 1;
    if (level !== 'easy' && prof[r] === 0) w *= 1.3;
    if (level === 'hard' && (r === 'wheat' || r === 'ore')) w *= 1.08;
    if (h === g.robber) w *= 0.5;
    s += PIPS(t.number) * w; seen.add(r);
  }
  if (level === 'hard') s += seen.size * 0.8;
  if (V.port && level !== 'easy') {
    if (V.port === 'any') s += 1.2;
    else s += ((prof[V.port] || 0) + (seen.has(V.port) ? 3 : 0)) * 0.3;
  }
  return s;
}

function chooseSettlement(g, pi, needRoad, level) {
  const spots = g.validSettlements(pi, needRoad);
  if (!spots.length) return null;
  const prof = profile(g, pi);
  const ranked = spots.map(v => ({ v, s: vertexScore(g, pi, v, level, prof) })).sort((a, b) => b.s - a.s);
  if (level === 'easy') return g.rng() < 0.35 ? pick(g, spots) : pick(g, ranked.slice(0, Math.max(1, Math.ceil(ranked.length / 2)))).v;
  if (level === 'medium') return pick(g, ranked.slice(0, 3)).v;
  return ranked[0].v;
}

// Score a road by the best settlement spot it leads toward.
function chooseRoad(g, pi, level, anchor) {
  const edges = anchor != null
    ? g.board.vertices[anchor].edges.filter(e => g.roads[e] === undefined)
    : g.validRoads(pi);
  if (!edges.length) return null;
  if (level === 'easy' && g.rng() < 0.6) return pick(g, edges);
  const prof = profile(g, pi);
  const free = v => { try { return g.vertexFree(v); } catch { return false; } };
  const scoreEdge = e => {
    let s = 0;
    for (const v of g.board.edges[e].v) {
      if (v === anchor) continue;
      const b = g.buildings[v];
      if (b && b.p !== pi) continue;
      if (free(v)) s = Math.max(s, vertexScore(g, pi, v, level, prof));
      for (const n of g.board.vertices[v].adj) if (free(n)) s = Math.max(s, 0.55 * vertexScore(g, pi, n, level, prof));
      if (level === 'hard' && g.board.vertices[v].edges.some(o => o !== e && g.roads[o] === pi)) s += 0.4;
    }
    return s + (level === 'medium' ? g.rng() * 0.8 : 0);
  };
  return best(edges, scoreEdge);
}
function roadWorthIt(g, pi, level) {
  const e = chooseRoad(g, pi, level === 'easy' ? 'medium' : level);
  if (e == null) return null;
  const prof = profile(g, pi);
  const free = v => { try { return g.vertexFree(v); } catch { return false; } };
  const leads = g.board.edges[e].v.some(v => free(v) || g.board.vertices[v].adj.some(free));
  if (leads) return e;
  // Hard bots also extend for Longest Road when they are close.
  if (level === 'hard') {
    const mine = g.roadLength(pi), holder = g.longestRoad;
    if (mine >= 3 && (!holder || (holder.p !== pi && holder.len - mine <= 2))) return e;
  }
  return null;
}

function goalCosts(g, pi) {
  const P = g.players[pi];
  const cities = Object.keys(g.buildings).filter(v => g.buildings[v].p === pi && g.buildings[v].type === 'settlement');
  const goals = [];
  if (P.pieces.settlement > 0 && g.validSettlements(pi, true).length) goals.push({ kind: 'settlement', cost: COST.settlement, pri: 0 });
  if (P.pieces.city > 0 && cities.length) goals.push({ kind: 'city', cost: COST.city, pri: 0 });
  if (P.pieces.road > 0 && g.validRoads(pi).length && !goals.some(x => x.kind === 'settlement')) goals.push({ kind: 'road', cost: COST.road, pri: 0.6 });
  if (g.devDeck.length) goals.push({ kind: 'dev', cost: COST.dev, pri: 1.2 });
  return goals;
}
function targetGoal(g, pi) {
  const res = g.players[pi].res;
  return best(goalCosts(g, pi), x => -(missing(x.cost, res) + x.pri));
}

function tradeAction(g, pi, level) {
  if (level === 'easy' && !(total(g.players[pi].res) > 7 && g.rng() < 0.5)) return null;
  const goal = targetGoal(g, pi);
  if (!goal) return null;
  const res = g.players[pi].res, cost = goal.cost;
  const short = RES.filter(k => (res[k] || 0) < (cost[k] || 0));
  if (!short.length) return null;
  if (level === 'medium' && missing(cost, res) > 2) return null;
  const surplus = RES.filter(k => !short.includes(k) && res[k] - (cost[k] || 0) >= g.tradeRatio(pi, k))
    .sort((a, b) => (res[b] - (cost[b] || 0)) / g.tradeRatio(pi, b) - (res[a] - (cost[a] || 0)) / g.tradeRatio(pi, a));
  const get = short.find(k => g.bank[k] > 0);
  if (!surplus.length || !get) return null;
  return { type: 'bankTrade', give: surplus[0], get };
}

function playableDev(g, pi, type) {
  return !g.devPlayed && g.players[pi].dev.some(d => d.type === type && d.turn < g.turnNumber);
}
function robberOnMe(g, pi) {
  return g.board.tiles[g.robber].vertices.some(v => g.buildings[v] && g.buildings[v].p === pi);
}
// The settlement that is worth most to this bot (hard bots also like hitting the leader).
function heistTarget(g, pi, level) {
  if (g.players[pi].pieces.settlement <= 0) return null;
  const lead = Math.max(...g.players.map((p, i) => i === pi ? -1 : g.vp(i, false)));
  let best = null, bs = -Infinity;
  for (const v of g.heistTargets(pi)) {
    const s = vertexScore(g, pi, v, level) + (level === 'hard' && g.vp(g.buildings[v].p, false) >= lead ? 4 : 0);
    if (s > bs) { bs = s; best = v; }
  }
  return best;
}
function devAction(g, pi, level, beforeRoll) {
  if (g.devPlayed) return null;
  const P = g.players[pi];
  if (level === 'easy') {
    if (g.rng() > 0.4) return null;
    const ready = P.dev.filter(d => d.turn < g.turnNumber && d.type !== 'vp').map(d => d.type);
    if (!ready.length) return null;
    const c = pick(g, ready);
    if (beforeRoll && c !== 'knight') return null;
    if (c === 'yearOfPlenty') { const r = RES.filter(k => g.bank[k] > 1); return r.length ? { type: 'playDev', card: c, res: [pick(g, r), pick(g, r)] } : null; }
    if (c === 'monopoly') return { type: 'playDev', card: c, res: pick(g, RES) };
    if (c === 'roadBuilding' && (P.pieces.road <= 0 || !g.validRoads(pi).length)) return null;
    return { type: 'playDev', card: c };
  }
  if (playableDev(g, pi, 'knight')) {
    const army = g.largestArmy;
    const forArmy = level === 'hard' && P.knights + 1 >= 3 && (!army || (army.p !== pi && P.knights + 1 > army.size));
    if (robberOnMe(g, pi) || forArmy) return { type: 'playDev', card: 'knight' };
  }
  if (beforeRoll) return null;
  if (playableDev(g, pi, 'heist')) { const v = heistTarget(g, pi, level); if (v != null) return { type: 'playDev', card: 'heist', vertex: v }; }
  if (playableDev(g, pi, 'roadBuilding') && P.pieces.road > 0 && roadWorthIt(g, pi, level) != null) return { type: 'playDev', card: 'roadBuilding' };
  const goal = targetGoal(g, pi);
  if (playableDev(g, pi, 'yearOfPlenty') && goal) {
    const need = [];
    RES.forEach(k => { for (let i = (P.res[k] || 0); i < (goal.cost[k] || 0); i++) need.push(k); });
    if (need.length && need.length <= 2) {
      while (need.length < 2) need.push(level === 'hard' ? 'ore' : 'wheat');
      const want = {}; need.forEach(k => { want[k] = (want[k] || 0) + 1; });
      if (RES.every(k => (want[k] || 0) <= g.bank[k])) return { type: 'playDev', card: 'yearOfPlenty', res: need };
    }
  }
  if (playableDev(g, pi, 'monopoly')) {
    // Cards not in the bank or our hand are in opponents' hands: public information.
    const supply = Math.max(19, g.board.tiles.length);
    const r = best(RES, k => supply - g.bank[k] - P.res[k] + (goal && goal.cost[k] ? 1.5 : 0));
    if (supply - g.bank[r] - P.res[r] >= (level === 'hard' ? 3 : 4)) return { type: 'playDev', card: 'monopoly', res: r };
  }
  return null;
}

function robberAction(g, pi, level) {
  const tiles = g.legalRobberTiles(pi).map(id => g.board.tiles[id]);
  const mine = t => t.vertices.some(v => g.buildings[v] && g.buildings[v].p === pi);
  let tile;
  if (level === 'easy') {
    const opts = tiles.filter(t => !mine(t));
    tile = pick(g, opts.length ? opts : tiles);
  } else {
    tile = best(tiles, t => {
      let s = mine(t) ? -100 : 0;
      for (const v of t.vertices) {
        const b = g.buildings[v];
        if (!b || b.p === pi) continue;
        const lead = level === 'hard' ? 1 + g.vp(b.p, false) * 0.25 : 1;
        s += PIPS(t.number) * (b.type === 'city' ? 2 : 1) * lead;
      }
      return s + g.rng() * 0.1;
    });
  }
  const victims = g.robberVictims(pi, tile.id);
  let victim;
  if (victims.length) {
    if (level === 'easy') victim = pick(g, victims);
    else if (level === 'medium') victim = best(victims, i => g.players[i].res && total(g.players[i].res));
    else victim = best(victims, i => g.vp(i, false) * 10 + total(g.players[i].res));
  }
  return { type: 'robber', tile: tile.id, victim };
}

// The diamond lets a bot choose cards from the bank: whatever its next build still lacks.
function diamondAction(g, pi, level) {
  const need = g.pendingDiamond[pi], room = RES.reduce((s, k) => s + g.bank[k], 0), n = Math.min(need, room);
  const have = { ...g.players[pi].res }, picks = [], goal = level === 'easy' ? null : targetGoal(g, pi), want = goal ? goal.cost : {};
  for (let i = 0; i < n; i++) {
    const avail = RES.filter(k => g.bank[k] - picks.filter(x => x === k).length > 0);
    const k = level === 'easy' ? pick(g, avail) : best(avail, x => (want[x] || 0) - have[x] + g.rng() * 0.1);
    picks.push(k); have[k]++;
  }
  return { type: 'diamond', res: picks };
}
function discardAction(g, pi, level) {
  const need = g.pendingDiscards[pi];
  const res = { ...g.players[pi].res }, out = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  const goal = level === 'easy' ? null : targetGoal(g, pi);
  const keep = goal ? goal.cost : {};
  for (let i = 0; i < need; i++) {
    const avail = RES.filter(k => res[k] > 0);
    const k = level === 'easy' ? pick(g, avail) : best(avail, x => res[x] - (keep[x] || 0) * 1.5 + g.rng() * 0.1);
    res[k]--; out[k]++;
  }
  return { type: 'discard', res: out };
}

function respondAction(g, pi, level) {
  const t = g.trade;
  if (!g.has(pi, t.get)) return { type: 'respond', accept: false };
  if (level === 'easy') return { type: 'respond', accept: g.rng() < 0.4 };
  if (level === 'hard' && g.vp(t.from, false) >= g.vpTarget - 2) return { type: 'respond', accept: false };
  const res = g.players[pi].res, after = {};
  RES.forEach(k => { after[k] = res[k] + (t.give[k] || 0) - (t.get[k] || 0); });
  const goals = goalCosts(g, pi);
  const gain = goals.length ? Math.max(...goals.map(x => missing(x.cost, res) - missing(x.cost, after))) : 0;
  const fair = total(t.give) >= total(t.get) - (level === 'medium' ? 1 : 0);
  return { type: 'respond', accept: gain > 0 && fair };
}

function turnAction(g, pi, level) {
  const P = g.players[pi];
  if (g.phase === 'setup') {
    if (g.setup.expect === 'settlement') return { type: 'settle', vertex: chooseSettlement(g, pi, false, level) };
    return { type: 'road', edge: chooseRoad(g, pi, level, g.setup.last) };
  }
  if (g.subphase === 'robber') return robberAction(g, pi, level);
  if (g.subphase === 'roadBuilding') return { type: 'road', edge: chooseRoad(g, pi, level) };
  if (!g.rolled) return devAction(g, pi, level, true) || { type: 'roll' };

  // Safety valve: never let a bot loop forever within one turn.
  if (!g._botTurn || g._botTurn.n !== g.turnNumber) g._botTurn = { n: g.turnNumber, count: 0 };
  if (++g._botTurn.count > 40) return { type: 'endTurn' };

  const dev = devAction(g, pi, level, false);
  if (dev) return dev;

  const can = c => g.has(pi, c);
  const mySettlements = Object.keys(g.buildings).filter(v => g.buildings[v].p === pi && g.buildings[v].type === 'settlement').map(Number);
  const prof = profile(g, pi);
  const tries = {
    city: () => can(COST.city) && P.pieces.city > 0 && mySettlements.length
      ? { type: 'city', vertex: best(mySettlements, v => vertexScore(g, pi, v, 'medium', prof)) } : null,
    settlement: () => {
      if (!can(COST.settlement) || P.pieces.settlement <= 0) return null;
      const v = chooseSettlement(g, pi, true, level);
      return v == null ? null : { type: 'settle', vertex: v };
    },
    road: () => {
      if (!can(COST.road) || P.pieces.road <= 0) return null;
      if (level !== 'easy' && g.validSettlements(pi, true).length && P.pieces.settlement > 0) return null;
      const e = level === 'easy' ? chooseRoad(g, pi, level) : roadWorthIt(g, pi, level);
      return e == null ? null : { type: 'road', edge: e };
    },
    heist: () => {
      if (level === 'easy' || P.heistBought || 4 - P.pieces.city < g.heistNeed() || !can(COST.heist)) return null;
      return heistTarget(g, pi, level) == null ? null : { type: 'buyHeist' };
    },
    dev: () => {
      if (!can(COST.dev) || !g.devDeck.length) return null;
      if (level === 'easy' && g.rng() < 0.5) return null;
      if (level === 'hard' && P.pieces.city > 0 && mySettlements.length && missing(COST.city, P.res) <= 2 && total(P.res) <= 7) return null;
      return { type: 'buyDev' };
    },
  };
  const order = level === 'easy' ? shuffled(g, ['city', 'settlement', 'road', 'dev'])
    : level === 'medium' ? ['heist', 'city', 'settlement', 'road', 'dev'] : ['heist', 'settlement', 'city', 'road', 'dev']   // its cost includes a settlement's, so it has to come first;
  for (const k of order) {
    if (level === 'easy' && g.rng() < 0.3) continue;
    const a = tries[k]();
    if (a) return a;
  }
  return tradeAction(g, pi, level) || { type: 'endTurn' };
}

// Which bot (if any) should act next.
function nextActor(g) {
  if (g.phase !== 'setup' && g.phase !== 'main') return null;
  if (g.subphase === 'discard') {
    const k = Object.keys(g.pendingDiscards).map(Number).find(i => g.isBot(i));
    return k === undefined ? null : { pi: k, kind: 'discard' };
  }
  if (g.subphase === 'diamond') {
    const k = Object.keys(g.pendingDiamond).map(Number).find(i => g.isBot(i));
    return k === undefined ? null : { pi: k, kind: 'diamond' };
  }
  if (g.trade && g.phase === 'main') {
    const t = g.trade;
    const i = g.players.findIndex((p, j) => p.bot && j !== t.from && !t.accepted.includes(j) && !t.declined.includes(j));
    if (i >= 0) return { pi: i, kind: 'respond' };
  }
  if (g.isBot(g.turn)) return { pi: g.turn, kind: 'turn' };
  return null;
}

function decide(g, pi, level = g.players[pi].bot || 'medium') {
  if (g.subphase === 'diamond' && g.pendingDiamond[pi]) return diamondAction(g, pi, level);
  if (g.subphase === 'discard' && g.pendingDiscards[pi]) return discardAction(g, pi, level);
  if (g.trade && g.phase === 'main' && g.trade.from !== pi && !g.trade.accepted.includes(pi) && !g.trade.declined.includes(pi) && g.turn !== pi)
    return respondAction(g, pi, level);
  return turnAction(g, pi, level);
}

// If a decision is ever rejected, fall back to something that always moves the game on.
function rescue(g, pi) {
  const nextTile = (g.robber + 1) % g.board.tiles.length;
  const attempts = [
    [() => g.subphase === 'discard' && g.pendingDiscards[pi], () => g.autoDiscard(pi)],
    [() => g.trade && g.trade.from !== pi && g.turn !== pi, () => g.act(pi, { type: 'respond', accept: false })],
    [() => g.phase === 'setup' && g.turn === pi, () => g.autoTurn(pi)],
    [() => g.subphase === 'robber' && g.turn === pi, () => g.autoRobber(pi)],
    [() => g.subphase === 'roadBuilding' && g.turn === pi, () => { g.subphase = null; g.freeRoads = 0; g.version++; }],
    [() => g.phase === 'main' && g.turn === pi && !g.rolled && !g.subphase, () => g.act(pi, { type: 'roll' })],
    [() => g.phase === 'main' && g.turn === pi && g.rolled && !g.subphase, () => g.act(pi, { type: 'endTurn' })],
  ];
  for (const [when, run] of attempts) {
    try { if (when()) { run(); return true; } } catch { /* try the next fallback */ }
  }
  return false;
}

function step(g, pi) {
  try { g.act(pi, decide(g, pi)); return true; }
  catch (e) { return rescue(g, pi); }
}

// Pause between bot moves so people can follow along. BOT_DELAY_MS overrides (tests use 0).
function delay(g, next) {
  if (process.env.BOT_DELAY_MS !== undefined) return Number(process.env.BOT_DELAY_MS) || 0;
  if (next.kind === 'discard') return 700;
  if (next.kind === 'respond') return 1100;
  if (g.phase === 'setup') return 900;
  if (!g.rolled) return 1000;
  return 750;
}

module.exports = { nextActor, decide, step, rescue, delay, vertexScore };
