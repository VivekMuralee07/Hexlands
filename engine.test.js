'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, RES } = require('./game');
const maps = require('./maps');

const mk = (preset = 'classic', seed = 42, opts = {}) => new Game({ code: 'TEST', map: maps.generatePreset(preset, seed), rng: maps.makeRng(seed), ...opts });
const throwsMsg = (fn, re) => assert.throws(fn, e => re.test(e.message));
const totalRes = r => RES.reduce((a, k) => a + r[k], 0);
function grant(g, pi, res) { for (const k in res) { g.players[pi].res[k] += res[k]; g.bank[k] -= res[k]; } }
function conservation(g) {
  const start = Math.max(19, g.board.tiles.length);
  for (const k of RES) assert.equal(g.bank[k] + g.players.reduce((a, p) => a + p.res[k], 0), start, 'conserve ' + k);
}
function lobby(n, preset, seed) {
  const g = mk(preset, seed);
  for (let i = 0; i < n; i++) g.addPlayer('P' + i, 't' + i);
  g.act(0, { type: 'start' });
  return g;
}
function finishSetup(g) {
  while (g.phase === 'setup') {
    const pi = g.turn;
    const v = g.validSettlements(pi, false)[0];
    g.act(pi, { type: 'settle', vertex: v });
    const e = g.board.vertices[v].edges.find(e => g.roads[e] === undefined);
    g.act(pi, { type: 'road', edge: e });
  }
  return g;
}

test('classic board geometry matches the standard island', () => {
  const g = mk();
  assert.equal(g.board.tiles.length, 19);
  assert.equal(g.board.vertices.length, 54);
  assert.equal(g.board.edges.length, 72);
  assert.equal(g.board.ports.length, 9);
  assert.equal(g.board.tiles.filter(t => t.terrain === 'desert').length, 1);
  assert.equal(g.board.tiles[g.robber].terrain, 'desert');
  const nums = g.board.tiles.map(t => t.number).filter(n => n).sort((a, b) => a - b);
  assert.deepEqual(nums, [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]);
});

test('every country preset generates a playable board', () => {
  for (const { key } of maps.presetList()) {
    for (let seed = 1; seed <= 25; seed++) {
      const g = mk(key, seed);
      const t = g.board.tiles;
      assert.ok(t.length >= 19, key + ' size');
      assert.ok(t.every(x => (x.terrain === 'desert') === (x.number === null)), key + ' numbers');
      assert.ok(t.every(x => x.number !== 7));
      assert.ok(g.board.ports.length >= 3, key + ' ports');
      const portVerts = g.board.vertices.filter(v => v.port).length;
      assert.equal(portVerts, g.board.ports.length * 2, key + ' ports must not share corners');
      assert.ok(g.board.vertices.every(v => v.adj.length >= 2 && v.adj.length <= 3));
      ['forest', 'hills', 'pasture', 'fields', 'mountains'].forEach(r => assert.ok(t.some(x => x.terrain === r), key + ' has ' + r));
    }
  }
});

test('same seed reproduces the same board', () => {
  const a = mk('india', 99), b = mk('india', 99);
  assert.deepEqual(a.boardView(), b.boardView());
});

test('custom map validation', () => {
  assert.match(maps.validateCustom([]), /at least 7/);
  const ok = [];
  for (let q = 0; q < 8; q++) ok.push({ q, r: 0, terrain: ['forest', 'hills', 'pasture', 'fields', 'mountains', 'desert', 'forest', 'fields'][q], number: null });
  assert.equal(maps.validateCustom(ok), null);
  assert.match(maps.validateCustom([...ok, { q: 0, r: 0, terrain: 'forest' }]), /same position/);
  assert.match(maps.validateCustom(ok.map(t => ({ ...t, number: 7 }))), /Deserts|Numbers/);
  assert.match(maps.validateCustom(ok.map(t => ({ ...t, terrain: 'lava' }))), /Unknown terrain/);
  const built = maps.buildCustom(ok, 5);
  assert.ok(built.tiles.filter(t => t.terrain !== 'desert').every(t => t.number >= 2 && t.number <= 12 && t.number !== 7));
  const g = new Game({ code: 'C', map: built, rng: maps.makeRng(1) });
  assert.equal(g.board.tiles.length, 8);
});

test('lobby rules', () => {
  const g = mk();
  g.addPlayer('Ann', 'a');
  throwsMsg(() => g.addPlayer('ann', 'x'), /taken/);
  throwsMsg(() => g.act(0, { type: 'start' }), /At least 2/);
  g.addPlayer('Bo', 'b'); g.addPlayer('Cy', 'c'); g.addPlayer('Di', 'd');
  throwsMsg(() => g.addPlayer('Ed', 'e'), /full/);
  throwsMsg(() => g.act(1, { type: 'start' }), /host/);
  g.act(0, { type: 'start' });
  assert.equal(g.phase, 'setup');
  throwsMsg(() => g.addPlayer('Late', 'l'), /already started/);
  assert.equal(new Set(g.players.map(p => p.color)).size, 4);
});

test('setup: snake order, distance rule, road anchoring, starting resources', () => {
  const g = lobby(3);
  const order = [];
  while (g.phase === 'setup') {
    const pi = g.turn; order.push(pi);
    throwsMsg(() => g.act((pi + 1) % 3, { type: 'settle', vertex: 0 }), /not your turn/);
    throwsMsg(() => g.act(pi, { type: 'road', edge: 0 }), /settlement first/);
    const v = g.validSettlements(pi, false)[0];
    const taken = Object.keys(g.buildings).map(Number);
    if (taken.length) {
      const adj = g.board.vertices[taken[0]].adj.find(n => !g.buildings[n]);
      throwsMsg(() => g.act(pi, { type: 'settle', vertex: adj }), /two roads apart/);
    }
    const before = totalRes(g.players[pi].res);
    g.act(pi, { type: 'settle', vertex: v });
    const productive = g.board.vertices[v].hexes.filter(h => g.board.tiles[h].terrain !== 'desert').length;
    if (order.length > 3) assert.equal(totalRes(g.players[pi].res) - before, productive);
    else assert.equal(totalRes(g.players[pi].res), 0);
    const far = g.board.edges.find(e => !e.v.includes(v) && g.roads[e.id] === undefined);
    throwsMsg(() => g.act(pi, { type: 'road', edge: far.id }), /must touch/);
    g.act(pi, { type: 'road', edge: g.board.vertices[v].edges.find(e => g.roads[e] === undefined) });
  }
  assert.deepEqual(order, [0, 1, 2, 2, 1, 0]);
  assert.equal(g.phase, 'main'); assert.equal(g.turn, 0);
  conservation(g);
});

test('dice production, cities double, robber blocks', () => {
  const g = finishSetup(lobby(2));
  const pi = g.turn;
  const [v] = Object.keys(g.buildings).filter(k => g.buildings[k].p === pi).map(Number);
  const tile = g.board.vertices[v].hexes.map(h => g.board.tiles[h]).find(t => t.number);
  const res = { forest: 'wood', hills: 'brick', pasture: 'sheep', fields: 'wheat', mountains: 'ore' }[tile.terrain];
  const count = () => g.players[pi].res[res];
  const sameTile = g.board.vertices[v].hexes.filter(h => g.board.tiles[h].number === tile.number && g.board.tiles[h].terrain === tile.terrain).length;
  let b = count();
  g.forcedDice = [[1, tile.number - 1 > 6 ? 6 : tile.number - 1]];
  if (g.forcedDice[0][0] + g.forcedDice[0][1] !== tile.number) g.forcedDice = [[tile.number - 6, 6]];
  g.act(pi, { type: 'roll' });
  assert.ok(count() - b >= sameTile);
  conservation(g);
  // Upgrade to city: production doubles.
  grant(g, pi, { wheat: 2, ore: 3 });
  g.act(pi, { type: 'city', vertex: v });
  assert.equal(g.buildings[v].type, 'city');
  g.act(pi, { type: 'endTurn' });
  const other = g.turn;
  g.forcedDice = [g.dice];
  b = count();
  g.act(other, { type: 'roll' });
  assert.ok(count() - b >= 2 * sameTile);
  // Robber on that tile blocks it.
  g.robber = tile.id;
  g.act(other, { type: 'endTurn' });
  g.forcedDice = [g.dice];
  b = count();
  g.act(pi, { type: 'roll' });
  const otherTiles = g.board.vertices[v].hexes.filter(h => h !== tile.id && g.board.tiles[h].number === tile.number).length;
  assert.equal(count() - b, otherTiles * 2);
  conservation(g);
});

test('rolling a seven: discards, robber move, steal', () => {
  const g = finishSetup(lobby(3));
  const pi = g.turn, victim = (pi + 1) % 3;
  grant(g, victim, { wood: 5, brick: 4 }); // >7 cards now
  const vt = totalRes(g.players[victim].res);
  g.forcedDice = [[3, 4]];
  g.act(pi, { type: 'roll' });
  assert.equal(g.subphase, 'discard');
  assert.equal(g.pendingDiscards[victim], Math.floor(vt / 2));
  throwsMsg(() => g.act(pi, { type: 'endTurn' }), /discard/);
  throwsMsg(() => g.act(victim, { type: 'discard', res: { wood: 1 } }), /exactly/);
  throwsMsg(() => g.act(victim, { type: 'discard', res: { ore: g.pendingDiscards[victim] } }), /do not have/);
  const need = g.pendingDiscards[victim];
  g.act(victim, { type: 'discard', res: { wood: Math.min(5, need), brick: need - Math.min(5, need) } });
  for (const k of Object.keys(g.pendingDiscards)) g.autoDiscard(+k);
  assert.equal(g.subphase, 'robber');
  throwsMsg(() => g.act(pi, { type: 'robber', tile: g.robber }), /different tile/);
  const vv = Object.keys(g.buildings).find(k => g.buildings[k].p === victim);
  const target = g.board.vertices[vv].hexes.find(h => h !== g.robber);
  const mine = totalRes(g.players[pi].res), theirs = totalRes(g.players[victim].res);
  const victims = g.robberVictims(pi, target);
  g.act(pi, { type: 'robber', tile: target, victim });
  assert.equal(g.robber, target);
  if (victims.includes(victim)) {
    assert.equal(totalRes(g.players[pi].res), mine + 1);
    assert.equal(totalRes(g.players[victim].res), theirs - 1);
  }
  assert.equal(g.subphase, null);
  conservation(g);
});

test('building rules: costs, connectivity, piece limits', () => {
  const g = finishSetup(lobby(2));
  const pi = g.turn;
  g.forcedDice = [[2, 3]]; g.act(pi, { type: 'roll' });
  const road = g.validRoads(pi)[0];
  g.players[pi].res = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  RES.forEach(k => { g.bank[k] = Math.max(19, g.board.tiles.length) - g.players.reduce((a, p) => a + p.res[k], 0); });
  throwsMsg(() => g.act(pi, { type: 'road', edge: road }), /Not enough/);
  const unconnected = g.board.edges.find(e => !g.canRoad(pi, e.id) && g.roads[e.id] === undefined);
  grant(g, pi, { wood: 10, brick: 10, sheep: 5, wheat: 9, ore: 9 });
  throwsMsg(() => g.act(pi, { type: 'road', edge: unconnected.id }), /connect/);
  g.act(pi, { type: 'road', edge: road });
  assert.equal(g.players[pi].pieces.road, 12);
  // Grow roads until a legal settlement spot appears.
  let spots = g.validSettlements(pi, true);
  for (let i = 0; i < 6 && !spots.length; i++) { g.act(pi, { type: 'road', edge: g.validRoads(pi)[0] }); spots = g.validSettlements(pi, true); }
  assert.ok(spots.length);
  const notConnected = g.validSettlements(pi, false).find(v => !spots.includes(v));
  throwsMsg(() => g.act(pi, { type: 'settle', vertex: notConnected }), /touching your road/);
  g.act(pi, { type: 'settle', vertex: spots[0] });
  throwsMsg(() => g.act(pi, { type: 'city', vertex: Object.keys(g.buildings).find(k => g.buildings[k].p !== pi) }), /replace one of your/);
  g.players[pi].pieces.settlement = 0;
  throwsMsg(() => g.act(pi, { type: 'settle', vertex: spots[0] }), /no settlements/);
  conservation(g);
});

test('development cards: timing, one per turn, effects, largest army', () => {
  const g = finishSetup(lobby(2));
  const pi = g.turn, op = 1 - pi;
  g.forcedDice = [[2, 3]]; g.act(pi, { type: 'roll' });
  grant(g, pi, { sheep: 1, wheat: 1, ore: 1 });
  g.devDeck.push('knight');
  assert.equal(g.act(pi, { type: 'buyDev' }).card, 'knight');
  throwsMsg(() => g.act(pi, { type: 'playDev', card: 'knight' }), /next turn/);
  throwsMsg(() => g.act(pi, { type: 'playDev', card: 'monopoly', res: 'wood' }), /do not have/);
  // Give old cards directly.
  const P = g.players[pi];
  P.dev.push({ type: 'monopoly', turn: 0 }, { type: 'yearOfPlenty', turn: 0 }, { type: 'roadBuilding', turn: 0 }, { type: 'knight', turn: 0 }, { type: 'knight', turn: 0 }, { type: 'vp', turn: 0 });
  throwsMsg(() => g.act(pi, { type: 'playDev', card: 'vp' }), /automatically/);
  grant(g, op, { ore: 3 });
  const myOre = P.res.ore;
  g.act(pi, { type: 'playDev', card: 'monopoly', res: 'ore' });
  assert.equal(g.players[op].res.ore, 0); assert.equal(P.res.ore, myOre + 3);
  throwsMsg(() => g.act(pi, { type: 'playDev', card: 'yearOfPlenty', res: ['wood', 'wood'] }), /one development card/);
  g.act(pi, { type: 'endTurn' }); g.forcedDice = [[2, 3]]; g.act(op, { type: 'roll' }); g.act(op, { type: 'endTurn' });
  // Knight before rolling.
  g.act(pi, { type: 'playDev', card: 'knight' });
  assert.equal(g.subphase, 'robber');
  throwsMsg(() => g.act(pi, { type: 'roll' }), /robber/);
  g.act(pi, { type: 'robber', tile: (g.robber + 1) % g.board.tiles.length, victim: op });
  g.forcedDice = [[2, 3]]; g.act(pi, { type: 'roll' });
  const w = P.res.wood;
  g.devPlayed = false;
  g.act(pi, { type: 'playDev', card: 'yearOfPlenty', res: ['wood', 'wood'] });
  assert.equal(P.res.wood, w + 2);
  g.devPlayed = false;
  const roadsBefore = P.pieces.road;
  g.act(pi, { type: 'playDev', card: 'roadBuilding' });
  assert.equal(g.subphase, 'roadBuilding');
  throwsMsg(() => g.act(pi, { type: 'endTurn' }), /free roads/);
  g.act(pi, { type: 'road', edge: g.validRoads(pi)[0] });
  g.act(pi, { type: 'road', edge: g.validRoads(pi)[0] });
  assert.equal(P.pieces.road, roadsBefore - 2); assert.equal(g.subphase, null);
  g.devPlayed = false;
  g.act(pi, { type: 'playDev', card: 'knight' });
  g.act(pi, { type: 'robber', tile: (g.robber + 1) % g.board.tiles.length, victim: op });
  assert.equal(g.largestArmy, null);
  P.dev.push({ type: 'knight', turn: 0 }); g.devPlayed = false;
  g.act(pi, { type: 'playDev', card: 'knight' });
  assert.deepEqual(g.largestArmy, { p: pi, size: 3 });
  conservation(g);
});

test('longest road is awarded at 5 and broken by an opponent settlement', () => {
  const g = finishSetup(lobby(2, 'classic', 7));
  const pi = g.turn, op = 1 - pi;
  g.forcedDice = [[2, 3]]; g.act(pi, { type: 'roll' });
  grant(g, pi, { wood: 12, brick: 12 });
  // Build a straight-ish chain greedily maximizing length.
  for (let i = 0; i < 8 && !(g.longestRoad && g.longestRoad.p === pi); i++) {
    const opts = g.validRoads(pi);
    let best = opts[0], bestLen = -1;
    for (const e of opts) { g.roads[e] = pi; const l = g.roadLength(pi); delete g.roads[e]; if (l > bestLen) { bestLen = l; best = e; } }
    g.act(pi, { type: 'road', edge: best });
  }
  assert.equal(g.longestRoad.p, pi);
  assert.ok(g.longestRoad.len >= 5);
  // Opponent settles in the middle of the chain (forced placement for the test).
  const len = g.roadLength(pi);
  const mid = g.board.vertices.find(v => !g.buildings[v.id] && v.edges.filter(e => g.roads[e] === pi).length === 2 && v.adj.every(n => !g.buildings[n]) && (() => {
    g.buildings[v.id] = { p: op, type: 'settlement' }; const l = g.roadLength(pi); delete g.buildings[v.id]; return l < 5;
  })());
  if (mid) {
    g.buildings[mid.id] = { p: op, type: 'settlement' };
    g.updateLongestRoad();
    assert.equal(g.longestRoad, null);
    assert.ok(g.roadLength(pi) < len);
  }
  conservation(g);
});

test('bank and port trades', () => {
  const g = finishSetup(lobby(2));
  const pi = g.turn;
  g.forcedDice = [[2, 3]]; g.act(pi, { type: 'roll' });
  grant(g, pi, { wood: 4 });
  const ratio = g.tradeRatio(pi, 'wood');
  const w = g.players[pi].res.wood, o = g.players[pi].res.ore;
  g.act(pi, { type: 'bankTrade', give: 'wood', get: 'ore' });
  assert.equal(g.players[pi].res.wood, w - ratio); assert.equal(g.players[pi].res.ore, o + 1);
  throwsMsg(() => g.act(pi, { type: 'bankTrade', give: 'ore', get: 'ore' }), /different/);
  // Port ownership lowers ratio.
  const pv = g.board.vertices.find(v => v.port === 'any');
  if (pv) { g.buildings[pv.id] = { p: pi, type: 'settlement' }; assert.equal(g.tradeRatio(pi, 'sheep'), 3); delete g.buildings[pv.id]; }
  const sv = g.board.vertices.find(v => v.port && v.port !== 'any');
  if (sv) { g.buildings[sv.id] = { p: pi, type: 'settlement' }; assert.equal(g.tradeRatio(pi, sv.port), 2); delete g.buildings[sv.id]; }
  conservation(g);
});

test('player-to-player trade flow', () => {
  const g = finishSetup(lobby(3));
  const pi = g.turn, a = (pi + 1) % 3, b = (pi + 2) % 3;
  g.forcedDice = [[2, 3]]; g.act(pi, { type: 'roll' });
  grant(g, pi, { wood: 2 }); grant(g, a, { ore: 1 });
  throwsMsg(() => g.act(pi, { type: 'offer', give: { wood: 1 }, get: {} }), /both sides/);
  throwsMsg(() => g.act(pi, { type: 'offer', give: { ore: 9 }, get: { wood: 1 } }), /do not have/);
  g.act(pi, { type: 'offer', give: { wood: 2 }, get: { ore: 1 } });
  g.players[b].res.ore = 0;
  throwsMsg(() => g.act(b, { type: 'respond', accept: true }), /do not have/);
  g.act(b, { type: 'respond', accept: false });
  throwsMsg(() => g.act(pi, { type: 'confirm', with: b }), /not accepted/);
  g.act(a, { type: 'respond', accept: true });
  const pw = g.players[pi].res.wood, ao = g.players[a].res.ore;
  g.act(pi, { type: 'confirm', with: a });
  assert.equal(g.players[pi].res.wood, pw - 2); assert.equal(g.players[a].res.ore, ao - 1);
  assert.equal(g.trade, null);
  g.act(pi, { type: 'offer', give: { ore: 1 }, get: { sheep: 1 } });
  g.act(pi, { type: 'endTurn' });
  assert.equal(g.trade, null);
  conservation(g);
});

test('bank shortage: nobody is paid when two players are owed more than remains', () => {
  const g = finishSetup(lobby(2));
  const t = g.board.tiles.find(tl => tl.number && tl.vertices.filter(v => g.buildings[v]).length === 0 && tl.id !== g.robber);
  g.buildings[t.vertices[0]] = { p: 0, type: 'city' };
  g.buildings[t.vertices[3]] = { p: 1, type: 'city' };
  const res = { forest: 'wood', hills: 'brick', pasture: 'sheep', fields: 'wheat', mountains: 'ore' }[t.terrain];
  const before = g.players.map(p => p.res[res]);
  // Move all but 3 of the resource out of the bank into player 0's hand.
  const move = g.bank[res] - 3; g.bank[res] -= move; g.players[0].res[res] += move;
  const base = g.players.map(p => p.res[res]);
  g.produce(t.number, g.players.map(() => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 })));
  const otherTilesSameNum = g.board.tiles.some(x => x.id !== t.id && x.number === t.number && x.terrain === t.terrain && x.vertices.some(v => g.buildings[v]));
  if (!otherTilesSameNum) assert.deepEqual(g.players.map(p => p.res[res]), base);
  assert.ok(before);
});

test('reaching the victory target ends the game on your turn', () => {
  const g = finishSetup(lobby(2));
  const pi = g.turn;
  g.forcedDice = [[2, 3]]; g.act(pi, { type: 'roll' });
  g.players[pi].dev.push(...Array(8).fill(0).map(() => ({ type: 'vp', turn: 0 })));
  g.act(pi, { type: 'chat', text: 'gg' });
  assert.equal(g.phase, 'ended'); assert.equal(g.winner, pi);
  throwsMsg(() => g.act(pi, { type: 'endTurn' }), /over/);
  const v = g.view(1 - pi);
  assert.ok(v.players[pi].devReveal.includes('vp'));
});

test('hidden information is not leaked to opponents', () => {
  const g = finishSetup(lobby(2));
  g.players[0].dev.push({ type: 'vp', turn: 0 });
  const v = g.view(1);
  assert.equal(v.players[0].res, undefined);
  assert.equal(v.players[0].devReveal, undefined);
  assert.equal(v.players[0].vp, g.vp(0, false));
  assert.equal(v.me.res, g.players[1].res);
});

test('host can skip a disconnected player in setup and main', () => {
  const g = lobby(3);
  const host = g.players.findIndex(p => p.token === 't0');
  assert.ok(g.isHost(host));
  g.players.forEach(p => { p.connected = true; });
  throwsMsg(() => g.act(host, { type: 'skip' }), /disconnected/);
  throwsMsg(() => g.act((host + 1) % 3, { type: 'skip' }), /Only the host/);
  g.players.forEach((p, i) => { p.connected = i === host; });
  for (let i = 0; i < 20 && g.phase === 'setup'; i++) {
    if (g.turn === host) { const v = g.validSettlements(host, false)[0]; g.act(host, { type: 'settle', vertex: v }); g.act(host, { type: 'road', edge: g.board.vertices[v].edges.find(e => g.roads[e] === undefined) }); }
    else g.act(host, { type: 'skip' });
  }
  assert.equal(g.phase, 'main');
  for (let i = 0; i < 12; i++) {
    if (g.turn === host) {
      g.act(host, { type: 'roll' });
      if (g.subphase === 'discard') { if (g.pendingDiscards[host]) g.autoDiscard(host); if (g.subphase === 'discard') g.act(host, { type: 'skip' }); }
      if (g.subphase === 'robber') g.act(host, { type: 'robber', tile: (g.robber + 1) % g.board.tiles.length, victim: g.robberVictims(host, (g.robber + 1) % g.board.tiles.length)[0] });
      g.act(host, { type: 'endTurn' });
    } else { const t = g.turn; g.act(host, { type: 'skip' }); assert.notEqual(g.turn, t); }
  }
  conservation(g);
});

// Random bots play complete games on every map; checks invariants after each action.
function botStep(g, rng) {
  const pick = a => a[Math.floor(rng() * a.length)];
  const pi = g.turn;
  if (g.phase === 'setup') {
    if (g.setup.expect === 'settlement') return g.act(pi, { type: 'settle', vertex: pick(g.validSettlements(pi, false)) });
    return g.act(pi, { type: 'road', edge: pick(g.board.vertices[g.setup.last].edges.filter(e => g.roads[e] === undefined)) });
  }
  if (g.subphase === 'discard') { const k = +Object.keys(g.pendingDiscards)[0]; return g.autoDiscard(k); }
  if (g.subphase === 'diamond') { const k = +Object.keys(g.pendingDiamond)[0]; return g.autoDiamond(k); }
  if (g.subphase === 'robber') {
    const t = pick(g.legalRobberTiles(pi).map(id => g.board.tiles[id])).id;
    return g.act(pi, { type: 'robber', tile: t, victim: pick(g.robberVictims(pi, t)) });
  }
  if (g.subphase === 'roadBuilding') return g.act(pi, { type: 'road', edge: pick(g.validRoads(pi)) });
  const P = g.players[pi];
  const playable = P.dev.filter(d => d.type !== 'vp' && d.turn < g.turnNumber);
  if (!g.devPlayed && playable.length && rng() < 0.5) {
    const c = pick(playable).type;
    try { return g.act(pi, { type: 'playDev', card: c, res: c === 'monopoly' ? pick(RES) : [pick(RES), pick(RES)] }); } catch (e) { if (!/bank|nowhere/.test(e.message)) throw e; }
  }
  if (!g.rolled) return g.act(pi, { type: 'roll' });
  const has = c => g.has(pi, c);
  const mySettle = Object.keys(g.buildings).filter(k => g.buildings[k].p === pi && g.buildings[k].type === 'settlement');
  if (has({ wheat: 2, ore: 3 }) && mySettle.length && P.pieces.city) return g.act(pi, { type: 'city', vertex: +pick(mySettle) });
  const spots = g.validSettlements(pi, true);
  if (has({ wood: 1, brick: 1, sheep: 1, wheat: 1 }) && spots.length && P.pieces.settlement) return g.act(pi, { type: 'settle', vertex: pick(spots) });
  const roads = g.validRoads(pi);
  if (has({ wood: 1, brick: 1 }) && roads.length && P.pieces.road && rng() < 0.7) return g.act(pi, { type: 'road', edge: pick(roads) });
  if (has({ sheep: 1, wheat: 1, ore: 1 }) && g.devDeck.length && rng() < 0.5) return g.act(pi, { type: 'buyDev' });
  const give = RES.find(k => P.res[k] >= g.tradeRatio(pi, k));
  if (give && rng() < 0.6) { const get = pick(RES.filter(k => k !== give && g.bank[k] > 0)); if (get) return g.act(pi, { type: 'bankTrade', give, get }); }
  if (!g.trade && rng() < 0.2) {
    const gk = RES.find(k => P.res[k] > 0);
    if (gk) { const wk = pick(RES.filter(k => k !== gk)); g.act(pi, { type: 'offer', give: { [gk]: 1 }, get: { [wk]: 1 } });
      const other = g.players.findIndex((p, i) => i !== pi && p.res[wk] > 0);
      if (other >= 0) { g.act(other, { type: 'respond', accept: true }); return g.act(pi, { type: 'confirm', with: other }); }
      return g.act(pi, { type: 'cancelTrade' }); }
  }
  return g.act(pi, { type: 'endTurn' });
}

test('random full games finish cleanly on every map with 2–4 players', () => {
  let games = 0, finished = 0;
  for (const { key } of maps.presetList()) {
    for (let n = 2; n <= 4; n++) {
      for (let s = 0; s < 4; s++) {
        const seed = 1000 + s * 31 + n * 7 + key.length;
        const g = lobby(n, key, seed);
        const rng = maps.makeRng(seed * 3);
        let steps = 0;
        while (g.phase !== 'ended' && steps < 20000) {
          botStep(g, rng); steps++;
          if (steps % 25 === 0) conservation(g);
          g.players.forEach((p, i) => {
            const built = Object.values(g.buildings).filter(b => b.p === i);
            assert.equal(p.pieces.settlement + built.filter(b => b.type === 'settlement').length, 5);
            assert.equal(p.pieces.city + built.filter(b => b.type === 'city').length, 4);
            assert.equal(p.pieces.road + Object.values(g.roads).filter(r => r === i).length, 15);
            RES.forEach(k => assert.ok(p.res[k] >= 0));
          });
        }
        conservation(g);
        games++; if (g.phase === 'ended') { finished++; assert.ok(g.vp(g.winner) >= g.vpTarget); }
      }
    }
  }
  assert.ok(finished / games > 0.9, `finished ${finished}/${games}`);
});
