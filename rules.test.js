'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, RES } = require('./game');
const maps = require('./maps');
const bots = require('./bots');

function mk(n = 3, seed = 5, preset = 'classic') {
  const g = new Game({ code: 'RULE', map: maps.generatePreset(preset, seed), rng: maps.makeRng(seed) });
  for (let i = 0; i < n; i++) g.addPlayer('P' + i, 't' + i);
  return g;
}
const empty = () => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });
function finishSetup(g) {
  while (g.phase === 'setup') {
    const pi = g.turn, v = g.validSettlements(pi, false)[0];
    g.act(pi, { type: 'settle', vertex: v });
    g.act(pi, { type: 'road', edge: g.board.vertices[v].edges.find(e => g.roads[e] === undefined) });
  }
  return g;
}
// Starting settlements spread across the board (finishSetup always packs them into one corner).
function spreadSetup(g, k) {
  let n = 0;
  while (g.phase === 'setup') {
    const pi = g.turn, list = g.validSettlements(pi, false), v = list[(k * 7 + n * 13) % list.length];
    n++;
    g.act(pi, { type: 'settle', vertex: v });
    g.act(pi, { type: 'road', edge: g.board.vertices[v].edges.find(e => g.roads[e] === undefined) });
  }
  return g;
}
const started = (n, seed, opts) => { const g = mk(n, seed); if (opts) g.act(0, { type: 'setOptions', opts }); g.act(0, { type: 'start' }); return g; };

test('setup order: 1..N, then N..1; the last player places two in a row; each settlement gets its road', () => {
  for (const n of [2, 3, 4]) {
    const g = started(n, 7);
    const seq = [], expects = [];
    while (g.phase === 'setup') {
      const pi = g.turn, v = g.validSettlements(pi, false)[0];
      seq.push(pi); expects.push(g.setup.expect);
      g.act(pi, { type: 'settle', vertex: v });
      assert.equal(g.turn, pi, 'the same player now places the road');
      assert.equal(g.setup.expect, 'road');
      g.act(pi, { type: 'road', edge: g.board.vertices[v].edges.find(e => g.roads[e] === undefined) });
    }
    const fwd = [...Array(n).keys()];
    assert.deepEqual(seq, [...fwd, ...fwd.slice().reverse()], `${n} players`);
    assert.equal(seq[n - 1], seq[n], 'last player goes twice in a row');
    assert.equal(g.turn, 0, 'first player rolls first');
    g.players.forEach((p, i) => {
      assert.equal(Object.values(g.buildings).filter(b => b.p === i).length, 2);
      assert.equal(Object.values(g.roads).filter(r => r === i).length, 2);
    });
    assert.deepEqual(g.view(0).setup, null);
  }
  const g = started(4, 7);
  assert.deepEqual(g.view(0).setup.order, [0, 1, 2, 3, 3, 2, 1, 0]);
});

test('host options: host only, lobby only, validated, applied atomically', () => {
  const g = mk(3);
  assert.throws(() => g.act(1, { type: 'setOptions', opts: { timer: 30 } }), /host/);
  assert.throws(() => g.act(0, { type: 'setOptions', opts: { timer: 20 } }), /15, 30 or 60/);
  assert.throws(() => g.act(0, { type: 'setOptions', opts: { discardLimit: 6 } }), /between 7 and 15/);
  assert.throws(() => g.act(0, { type: 'setOptions', opts: { vpTarget: 25 } }), /between 5 and 20/);
  assert.throws(() => g.act(0, { type: 'setOptions', opts: { discardMode: 'all' } }), /half or 4/);
  assert.throws(() => g.act(0, { type: 'setOptions', opts: { vpTarget: 12, timer: 99 } }), /15, 30 or 60/);
  assert.equal(g.vpTarget, 10, 'a rejected change leaves everything as it was');
  g.act(0, { type: 'setOptions', opts: { vpTarget: 12, discardLimit: 9, discardMode: 'four', timer: 30, friendlyRobber: true, balancedDice: true } });
  assert.equal(g.vpTarget, 12);
  assert.deepEqual(g.opts, { discardLimit: 9, discardMode: 'four', timer: 30, friendlyRobber: true, balancedDice: true });
  g.act(0, { type: 'start' });
  assert.throws(() => g.act(0, { type: 'setOptions', opts: { timer: 15 } }), /before the game starts/);
});

test('discard limit and amount follow the host options', () => {
  // Defaults: more than 7 discards half, rounded down (nine cards: discard four).
  const d = started(3, 11); finishSetup(d);
  const r0 = d.turn, a0 = (r0 + 1) % 3, b0 = (r0 + 2) % 3;
  d.players.forEach(p => { p.res = empty(); });
  d.players[a0].res.wood = 7; d.players[b0].res.brick = 9;
  d.forcedDice = [[3, 4]]; d.act(r0, { type: 'roll' });
  assert.equal(d.pendingDiscards[a0], undefined, 'exactly 7 cards is safe');
  assert.equal(d.pendingDiscards[b0], 4);

  for (const [mode, expected] of [['half', 5], ['four', 4]]) {
    const g = started(3, 11, { discardLimit: 9, discardMode: mode }); finishSetup(g);
    const r = g.turn, a = (r + 1) % 3, b = (r + 2) % 3;
    g.players.forEach(p => { p.res = empty(); });
    g.players[a].res.wood = 9; g.players[b].res.brick = 10;
    g.forcedDice = [[3, 4]]; g.act(r, { type: 'roll' });
    assert.equal(g.subphase, 'discard');
    assert.equal(g.pendingDiscards[a], undefined, 'at the limit is safe');
    assert.equal(g.pendingDiscards[b], expected, mode);
    assert.throws(() => g.act(b, { type: 'discard', res: { brick: expected - 1 } }), /exactly/);
    g.act(b, { type: 'discard', res: { brick: expected } });
    assert.equal(g.players[b].res.brick, 10 - expected);
    assert.equal(g.subphase, 'robber');
  }
});

test('friendly robber: tiles next to players with 2 points or fewer are off limits', () => {
  let g, T, victimP, r;
  for (let seed = 1; seed < 80 && !T; seed++) {
    g = started(3, seed, { friendlyRobber: true }); finishSetup(g);
    r = g.turn;
    for (const tile of g.board.tiles) {
      const owners = new Set(tile.vertices.map(v => g.buildings[v]).filter(b => b && b.p !== r).map(b => b.p));
      if (owners.size === 1 && tile.id !== g.robber) { T = tile; victimP = [...owners][0]; break; }
    }
  }
  assert.ok(T, 'found a board with a tile touching exactly one opponent');
  const legal = g.legalRobberTiles(r);
  for (const id of legal) assert.ok(!g.board.tiles[id].vertices.some(v => g.buildings[v] && g.buildings[v].p !== r), 'no legal tile touches a protected player');
  assert.ok(!legal.includes(T.id));
  assert.deepEqual(g.robberVictims(r, T.id), [], 'protected players cannot be robbed');

  g.forcedDice = [[3, 4]]; g.act(r, { type: 'roll' });
  assert.equal(g.subphase, 'robber');
  assert.deepEqual(g.view(r).robberOptions, legal);
  assert.equal(g.view((r + 1) % 3).robberOptions, null);
  assert.throws(() => g.act(r, { type: 'robber', tile: T.id }), /Friendly robber/);

  // Reaching 3 public points removes the protection (a city is worth 2).
  Object.values(g.buildings).find(b => b.p === victimP).type = 'city';
  assert.equal(g.vp(victimP, false), 3);
  assert.ok(g.legalRobberTiles(r).includes(T.id));
  const hasCards = Object.values(g.players[victimP].res).some(n => n > 0);
  assert.deepEqual(g.robberVictims(r, T.id), hasCards ? [victimP] : []);
  const before = g.players[r].stats.stolen;
  g.act(r, { type: 'robber', tile: T.id, victim: victimP });
  assert.equal(g.robber, T.id);
  assert.equal(g.players[r].stats.stolen, before + (hasCards ? 1 : 0));
});

test('friendly robber: with no legal tile the robber returns to the desert and cannot steal from protected players', () => {
  const g = started(3, 5, { friendlyRobber: true }); finishSetup(g);
  const r = g.turn, desert = g.board.tiles.filter(t => t.terrain === 'desert').map(t => t.id);
  g.tileHasProtected = () => true;
  assert.deepEqual(g.legalRobberTiles(r), desert);
  g.forcedDice = [[3, 4]]; g.act(r, { type: 'roll' });
  g.act(r, { type: 'robber', tile: desert[0] });
  assert.equal(g.robber, desert[0]);
  assert.equal(g.players[r].stats.stolen, 0);
});

test('without friendly robber the robber may go anywhere but where it already is', () => {
  const g = started(3, 5); finishSetup(g);
  const r = g.turn;
  assert.equal(g.legalRobberTiles(r).length, g.board.tiles.length - 1);
  g.forcedDice = [[3, 4]]; g.act(r, { type: 'roll' });
  assert.throws(() => g.act(r, { type: 'robber', tile: g.robber }), /different tile/);
});

test('balanced dice: 36-roll deck reshuffled at 12 left, fewer repeats, even totals', () => {
  const g = mk(2, 3); g.act(0, { type: 'setOptions', opts: { balancedDice: true } });
  const rolls = [];
  for (let i = 0; i < 24 * 600; i++) rolls.push(g.rollDice());
  for (let w = 0; w < 600; w++) {
    const keys = new Set(rolls.slice(w * 24, (w + 1) * 24).map(d => d.join(',')));
    assert.equal(keys.size, 24, 'each deck gives 24 distinct rolls before it is reshuffled');
  }
  const sumOf = d => d[0] + d[1];
  const repeats = a => a.slice(1).filter((d, i) => sumOf(d) === sumOf(a[i])).length / (a.length - 1);
  const plain = mk(2, 3), pr = [];
  for (let i = 0; i < 24 * 600; i++) pr.push(plain.rollDice());
  assert.ok(repeats(pr) > 0.1, `random repeats ${repeats(pr)}`);
  assert.ok(repeats(rolls) < 0.1 && repeats(rolls) < repeats(pr), `balanced repeats ${repeats(rolls)}`);
  for (let n = 2; n <= 12; n++) {
    const expected = (6 - Math.abs(7 - n)) / 36 * rolls.length, got = rolls.filter(d => sumOf(d) === n).length;
    assert.ok(Math.abs(got - expected) / expected < 0.1, `total ${n}: ${got} vs ${Math.round(expected)}`);
  }
});

test('move timer: setup gets 60s, turns get the chosen time, bots are never timed, expiry plays for you', () => {
  const g = mk(3, 9);
  g.act(0, { type: 'setOptions', opts: { timer: 15 } });
  assert.equal(g.clockLimit(), 0, 'no clock in the waiting room');
  g.act(0, { type: 'start' });
  assert.equal(g.clockLimit(), 60, 'setup placements get 60 seconds');
  assert.equal(g.view(0).timer.limit, 60);
  assert.equal(g.timeout(), false, 'nothing happens before time is up');
  const who = g.turn;
  g.clockAt = Date.now() - 61000;
  assert.equal(g.timeout(), true);
  assert.equal(Object.values(g.buildings).filter(b => b.p === who).length, 1, 'a settlement was placed for them');
  assert.equal(Object.values(g.roads).filter(r => r === who).length, 1, 'and its road');
  assert.notEqual(g.turn, who);
  assert.ok(Date.now() - g.clockAt < 1000, 'the clock restarted for the next player');

  finishSetup(g);
  assert.equal(g.clockLimit(), 15);
  const t = g.turn;
  g.clockAt = Date.now() - 16000; g.forcedDice = [[1, 2]];
  g.timeout(); assert.ok(g.rolled && g.turn === t, 'idle before rolling: dice roll automatically');
  g.clockAt = Date.now() - 16000; g.timeout();
  assert.notEqual(g.turn, t, 'idle after rolling: the turn ends');

  // A seven: discard, then the robber, each on its own clock.
  const r = g.turn, v = (r + 1) % 3;
  g.players.forEach(p => { p.res = empty(); }); g.players[v].res.ore = 12;
  g.forcedDice = [[3, 4]]; g.act(r, { type: 'roll' });
  assert.equal(g.subphase, 'discard'); assert.equal(g.clockLimit(), 20, 'discards get at least 20 seconds');
  g.clockAt = Date.now() - 21000; g.timeout();
  assert.equal(g.players[v].res.ore, 6); assert.equal(g.subphase, 'robber');
  const robberBefore = g.robber;
  g.clockAt = Date.now() - 16000; g.timeout();
  assert.notEqual(g.robber, robberBefore); assert.equal(g.subphase, null);

  g.players[g.turn].bot = 'easy';
  assert.equal(g.clockLimit(), 0, 'bots never run out of time');
  g.players[g.turn].bot = null;
  g.opts.timer = 0;
  assert.equal(g.clockLimit(), 0); assert.equal(g.timeout(), false);
  assert.ok(g.log.some(l => /ran out of time|automatically/.test(l.text)));
});

test('chatting or proposing trades does not stall the clock', () => {
  const g = started(3, 4, { timer: 30 }); finishSetup(g);
  g.forcedDice = [[1, 2]]; g.act(g.turn, { type: 'roll' });
  g.clockAt = Date.now() - 20000;
  const stamp = g.clockAt;
  g.act(g.turn, { type: 'chat', text: 'wait' });
  assert.equal(g.clockAt, stamp);
  g.players[g.turn].res.wood = 4;
  g.act(g.turn, { type: 'bankTrade', give: 'wood', get: 'ore' });
  assert.ok(Date.now() - g.clockAt < 1000, 'a real action restarts the clock');
});

function connected(g, pi, e) {
  const [a, b] = g.board.edges[e].v;
  return [a, b].some(v => {
    const bd = g.buildings[v];
    if (bd) return bd.p === pi;                       // your own town, or blocked by an opponent's
    return g.board.vertices[v].edges.some(o => o !== e && g.roads[o] === pi);
  });
}

test('road rule: roads connect to your own roads or towns and never pass through an opponent settlement', () => {
  const g = started(3, 31); finishSetup(g);
  const me = g.turn, opp = (me + 1) % 3;
  g.forcedDice = [[1, 2]]; g.act(me, { type: 'roll' });
  // A road with nothing of yours touching it is refused.
  const floating = g.board.edges.find(e => g.roads[e.id] === undefined && !connected(g, me, e.id));
  assert.equal(g.canRoad(me, floating.id), false);
  // A chain of roads needs no settlement at its far end: roads may extend from roads.
  const myRoad = Object.keys(g.roads).map(Number).find(e => g.roads[e] === me);
  const open = g.board.edges[myRoad].v.find(v => !g.buildings[v]);
  if (open !== undefined) {
    const ext = g.board.vertices[open].edges.filter(e => e !== myRoad && g.roads[e] === undefined);
    assert.ok(ext.length && ext.every(e => g.canRoad(me, e)), 'extending a road is allowed');
    // Put an opponent settlement on that corner: the road may no longer continue through it.
    g.buildings[open] = { p: opp, type: 'settlement' };
    for (const e of ext) {
      const far = g.board.edges[e].v.find(v => v !== open);
      const linkedElsewhere = (g.buildings[far] && g.buildings[far].p === me) || g.board.vertices[far].edges.some(o => o !== e && g.roads[o] === me);
      if (!linkedElsewhere) assert.equal(g.canRoad(me, e), false, 'blocked by the opponent settlement');
    }
    delete g.buildings[open];
  }
});

test('every road in full bot games was connected when it was placed; setup roads touch the new settlement', () => {
  for (const [preset, seed] of [['classic', 3], ['india', 4], ['japan', 5], ['usa', 6]]) {
    const g = mk(1, seed, preset);
    ['easy', 'medium', 'hard'].forEach(l => g.act(0, { type: 'addBot', level: l }));
    g.act(0, { type: 'start' });
    g.players.forEach((p, i) => { if (!p.bot) p.bot = 'medium'; });
    let steps = 0, roads = 0;
    while (g.phase !== 'ended' && steps++ < 30000) {
      const n = bots.nextActor(g), a = bots.decide(g, n.pi);
      if (a.type === 'road') {
        roads++;
        if (g.phase === 'setup') assert.ok(g.board.edges[a.edge].v.includes(g.setup.last), 'setup road touches the settlement just placed');
        else assert.ok(connected(g, n.pi, a.edge), 'main-game road is connected to its owner');
      }
      try { g.act(n.pi, a); } catch (e) { assert.ok(bots.rescue(g, n.pi)); }
    }
    assert.equal(g.phase, 'ended'); assert.ok(roads >= 8, 'roads were placed');
  }
});

test('development cards: the classic deck has 25 cards (14 knights, 5 points, 2 each of the rest)', () => {
  const g = mk(2, 1), n = {};
  g.devDeck.forEach(c => { n[c] = (n[c] || 0) + 1; });
  assert.deepEqual(n, { knight: 14, vp: 5, roadBuilding: 2, yearOfPlenty: 2, monopoly: 2 });
  assert.equal(g.devDeck.length, 25);
});

test('resource names are wood, brick, sheep, hay and ore everywhere in the log', () => {
  const g = mk(1, 12);
  ['hard', 'medium', 'easy'].forEach(l => g.act(0, { type: 'addBot', level: l }));
  g.players[0].bot = 'hard'; g.act(0, { type: 'start' });
  let steps = 0, text = '';
  while (g.phase !== 'ended' && steps++ < 30000) {
    const n = bots.nextActor(g); bots.step(g, n.pi);
    text += g.log.map(l => l.text).join('\n');
  }
  assert.ok(!/lumber|wool|grain|wheat/i.test(text), 'old names are gone');
  assert.ok(/hay/.test(text) && /wood/.test(text) && /sheep/.test(text));
});

test('bots play full games with friendly robber and balanced dice on', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const g = mk(1, seed * 17, ['classic', 'india', 'uk'][seed % 3]);
    ['easy', 'medium', 'hard'].forEach(l => g.act(0, { type: 'addBot', level: l }));
    g.act(0, { type: 'setOptions', opts: { friendlyRobber: true, balancedDice: true, discardLimit: 8, discardMode: seed % 2 ? 'half' : 'four' } });
    g.players[0].bot = 'medium'; g.act(0, { type: 'start' });
    let steps = 0, rescues = 0;
    const start = Math.max(19, g.board.tiles.length);
    while (g.phase !== 'ended' && steps++ < 40000) {
      const n = bots.nextActor(g); assert.ok(n, 'never stalls');
      try { g.act(n.pi, bots.decide(g, n.pi)); } catch (e) { rescues++; assert.ok(bots.rescue(g, n.pi)); }
    }
    assert.equal(g.phase, 'ended'); assert.equal(rescues, 0, 'bots never make an illegal move');
    for (const k of RES) assert.equal(g.bank[k] + g.players.reduce((a, p) => a + p.res[k], 0), start);
  }
});

const otherEnd = (g, e, v) => (g.board.edges[e].v[0] === v ? g.board.edges[e].v[1] : g.board.edges[e].v[0]);

test('a road cut by an opponent settlement stays, is flagged as cut off, and can still be built on from its far end', () => {
  let g, me, opp, found = null;
  for (let k = 0; k < 80 && !found; k++) {
  g = started(3, 31); spreadSetup(g, k);
  me = g.turn; opp = (me + 1) % 3;
  const mine = Object.keys(g.buildings).map(Number).filter(v => g.buildings[v].p === me);
  outer: for (const s of mine) for (const e1 of g.board.vertices[s].edges) {
    if (g.roads[e1] !== undefined) continue;
    const v1 = otherEnd(g, e1, s); if (g.buildings[v1]) continue;
    for (const e2 of g.board.vertices[v1].edges) {
      if (e2 === e1 || g.roads[e2] !== undefined) continue;
      const v2 = otherEnd(g, e2, v1);
      if (g.buildings[v2] || g.board.vertices[v2].edges.some(o => o !== e2 && g.roads[o] === me)) continue;
      found = { e1, v1, e2, v2 }; break outer;
    }
  }
  }
  assert.ok(found, 'found a two-road chain to cut');
  g.roads[found.e1] = me; g.roads[found.e2] = me;
  assert.deepEqual(g.cutOffRoads(), [], 'a connected chain is not flagged');
  g.buildings[found.v1] = { p: opp, type: 'settlement' };
  assert.deepEqual(g.cutOffRoads(), [found.e2], 'only the far road is cut off');
  assert.equal(g.roads[found.e2], me, 'the road stays on the board');
  assert.ok(g.view(me).cutRoads.includes(found.e2));
  const onward = g.board.vertices[found.v2].edges.find(e => e !== found.e2 && g.roads[e] === undefined);
  assert.equal(g.canRoad(me, onward), true, 'you can still build from the far end');
  delete g.buildings[found.v1];
  assert.deepEqual(g.cutOffRoads(), [], 'removing the blocker reconnects it');
});

test('audit: in full bot games a road is only ever cut off because an opponent built on its chain', () => {
  const explained = (g, e) => {
    const pi = g.roads[e], seenE = new Set([e]), seenV = new Set(), st = [e];
    while (st.length) {
      const x = st.pop();
      for (const v of g.board.edges[x].v) { seenV.add(v); for (const o of g.board.vertices[v].edges) if (!seenE.has(o) && g.roads[o] === pi) { seenE.add(o); st.push(o); } }
    }
    return [...seenV].some(v => g.buildings[v] && g.buildings[v].p !== pi);
  };
  let cutSeen = 0;
  for (const [preset, seed] of [['classic', 11], ['uk', 12], ['india', 13], ['japan', 14], ['usa', 15]]) {
    const g = mk(1, seed, preset);
    ['hard', 'hard', 'medium'].forEach(l => g.act(0, { type: 'addBot', level: l }));
    g.players[0].bot = 'hard'; g.act(0, { type: 'start' });
    let steps = 0;
    while (g.phase !== 'ended' && steps++ < 30000) {
      const n = bots.nextActor(g);
      try { g.act(n.pi, bots.decide(g, n.pi)); } catch (e) { assert.ok(bots.rescue(g, n.pi)); }
      if (steps % 25 === 0 || g.phase === 'ended') for (const e of g.cutOffRoads()) { cutSeen++; assert.ok(explained(g, e), `road ${e} is isolated with no opposing building on its chain`); }
    }
    assert.equal(g.phase, 'ended');
  }
  assert.ok(cutSeen >= 0);
});

test('strict placement: no isolated roads; a settlement may sit at the open end of a road', () => {
  let found = null;
  for (let seed = 1; seed < 120 && !found; seed++) {
    const g = started(3, seed); spreadSetup(g, seed);
    const me = g.turn, S = Object.keys(g.buildings).map(Number).find(v => g.buildings[v].p === me);
    for (const e1 of g.board.vertices[S].edges) {
      if (g.roads[e1] !== undefined) continue;
      const v1 = g.board.edges[e1].v.find(v => v !== S);
      if (g.buildings[v1]) continue;
      for (const e2 of g.board.vertices[v1].edges) {
        if (e2 === e1 || g.roads[e2] !== undefined) continue;
        const v2 = g.board.edges[e2].v.find(v => v !== v1);
        if (!g.buildings[v2] && g.canSettle(me, v2, false)) { found = { g, me, e1, v1, e2, v2 }; break; }
      }
      if (found) break;
    }
  }
  assert.ok(found, 'a board where a two-road chain reaches a legal corner');
  const { g, me, e1, v1, e2, v2 } = found;
  g.forcedDice = [[1, 2]]; g.act(me, { type: 'roll' });
  g.players[me].res = { wood: 6, brick: 6, sheep: 2, wheat: 2, ore: 0 };
  const isolated = () => g.board.edges.find(e => g.roads[e.id] === undefined && !g.canRoad(me, e.id));
  assert.ok(!g.validSettlements(me, true).includes(v2), 'no road leads there yet');
  assert.throws(() => g.act(me, { type: 'road', edge: isolated().id }), /connect/);
  g.act(me, { type: 'road', edge: e1 });
  assert.ok(!g.validSettlements(me, true).includes(v1), 'one road out is too close to your own town');
  assert.throws(() => g.act(me, { type: 'road', edge: isolated().id }), /connect/);
  g.act(me, { type: 'road', edge: e2 });
  assert.ok(g.validSettlements(me, true).includes(v2), 'the open end of a road is a legal settlement spot');
  g.act(me, { type: 'settle', vertex: v2 });
  assert.equal(g.buildings[v2].p, me);
  assert.deepEqual(g.checkInvariants(), []);
});

test('the position checker really catches an isolated road', () => {
  const g = finishSetup(started(3, 8));
  assert.deepEqual(g.checkInvariants(), []);
  const lone = g.board.edges.find(e => g.roads[e.id] === undefined && !g.canRoad(0, e.id));
  g.roads[lone.id] = 0;
  assert.match(g.checkInvariants().join(), /isolated group/);
});

test('rule invariants hold during full bot games on every map (no isolated roads, distance rule, towns touch a road)', () => {
  for (const { key } of maps.presetList()) {
    const g = mk(1, key.length * 13, key);
    ['hard', 'medium', 'easy'].forEach(l => g.act(0, { type: 'addBot', level: l }));
    g.act(0, { type: 'setOptions', opts: { friendlyRobber: key.length % 2 === 0, balancedDice: true } });
    g.players[0].bot = 'medium'; g.act(0, { type: 'start' });
    let steps = 0;
    while (g.phase !== 'ended' && steps++ < 40000) {
      const n = bots.nextActor(g);
      try { g.act(n.pi, bots.decide(g, n.pi)); } catch (e) { assert.ok(bots.rescue(g, n.pi)); }
      if (steps % 2 === 0) assert.deepEqual(g.checkInvariants(), [], `${key}, step ${steps}`);
    }
    assert.deepEqual(g.checkInvariants(), [], key);
    assert.equal(g.phase, 'ended');
  }
});

test('roads are never drawn through an SVG filter (a filter hides perfectly vertical roads)', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, 'app.js'), 'utf8');
  const i = src.indexOf("class=\"${fresh('r' + e)"), j = src.indexOf("for (const [v, bd] of Object.entries(st.buildings))");
  assert.ok(i > 0 && j > i, 'found the road drawing code');
  assert.ok(!/filter=/.test(src.slice(i, j)), 'road markup must not use the filter attribute');
});

test('Monopoly records how many cards each player gave up, for the animation', () => {
  const g = finishSetup(started(3, 6));
  const me = g.turn, a = (me + 1) % 3, b = (me + 2) % 3;
  g.players.forEach(p => { p.res = empty(); });
  g.players[a].res.ore = 3; g.players[b].res.ore = 2; g.players[me].res.ore = 1;
  g.players[me].dev.push({ type: 'monopoly', turn: 0 });
  assert.equal(g.lastMonopoly, null);
  g.act(me, { type: 'playDev', card: 'monopoly', res: 'ore' });
  assert.deepEqual(g.lastMonopoly, { by: me, res: 'ore', takes: { [a]: 3, [b]: 2 }, seq: 1 });
  assert.equal(g.players[me].res.ore, 6);
  assert.deepEqual(g.view(a).lastMonopoly, g.lastMonopoly, 'every player is told, since the resource is public');
});

test('house colors: choose your own, no duplicates, host can recolor bots, kept when the game starts', () => {
  const g = mk(1, 14); g.addPlayer('Asha', 'a'); g.act(0, { type: 'addBot', level: 'easy' });
  assert.deepEqual(g.players.map(p => p.colorId), ['red', 'blue', 'orange'], 'first free colors by default');
  g.act(1, { type: 'setColor', color: 'purple' });
  assert.equal(g.players[1].color, '#7a4fd6');
  assert.throws(() => g.act(1, { type: 'setColor', color: 'red' }), /taken by P0/);
  assert.throws(() => g.act(1, { type: 'setColor', color: 'plaid' }), /Unknown/);
  assert.throws(() => g.act(1, { type: 'setColor', seat: 0, color: 'pink' }), /your own/);
  assert.throws(() => g.act(0, { type: 'setColor', seat: 1, color: 'pink' }), /your own/, 'the host can recolor bots only');
  g.act(0, { type: 'setColor', seat: 2, color: 'teal' });
  assert.equal(g.players[2].colorId, 'teal');
  g.act(0, { type: 'setColor', color: 'blue' });                  // a color that was free again
  assert.equal(new Set(g.players.map(p => p.colorId)).size, 3);
  const chosen = Object.fromEntries(g.players.map(p => [p.name, p.colorId]));
  g.act(0, { type: 'start' });
  g.players.forEach(p => assert.equal(p.colorId, chosen[p.name], p.name + ' keeps the chosen color after the seats are shuffled'));
  assert.throws(() => g.act(0, { type: 'setColor', color: 'green' }), /before the game starts/);
  assert.ok(g.view(0).palette.length >= 8 && g.view(0).players.every(p => p.colorId));
});

test('events: bank trades, player trades, Year of Plenty and starting cards are announced for the animations', () => {
  const g = started(3, 5); 
  const startEvents = g.events.filter(e => e.type === 'start'); assert.equal(startEvents.length, 0, 'nothing before the second round');
  finishSetup(g);
  const starts = g.events.filter(e => e.type === 'start');
  assert.ok(starts.length >= 1 && starts.every(e => e.res.length >= 1), 'second settlements announce their starting cards');
  const me = g.turn, other = (me + 1) % 3;
  g.forcedDice = [[1, 2]]; g.act(me, { type: 'roll' });
  g.players[me].res = { wood: 4, brick: 0, sheep: 0, wheat: 0, ore: 0 }; g.players[other].res = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 2 };
  const before = g.eventSeq;
  const ratio = g.tradeRatio(me, 'wood'); g.players[me].res.wood = ratio;
  g.act(me, { type: 'bankTrade', give: 'wood', get: 'ore' });
  const bank = g.events[g.events.length - 1];
  assert.deepEqual([bank.type, bank.p, bank.give, bank.get], ['bank', me, { wood: ratio }, { ore: 1 }]); assert.ok(bank.seq > before);
  g.act(me, { type: 'offer', give: { ore: 1 }, get: { ore: 0, brick: 1 } });
  g.players[other].res.brick = 1;
  g.act(other, { type: 'respond', accept: true }); g.act(me, { type: 'confirm', with: other });
  const t = g.events[g.events.length - 1];
  assert.deepEqual([t.type, t.a, t.b, t.give, t.get], ['trade', me, other, { ore: 1 }, { brick: 1 }]);
  g.players[me].dev.push({ type: 'yearOfPlenty', turn: 0 });
  g.act(me, { type: 'playDev', card: 'yearOfPlenty', res: ['sheep', 'wheat'] });
  const y = g.events[g.events.length - 1]; assert.deepEqual([y.type, y.p, y.res], ['yop', me, ['sheep', 'wheat']]);
  const seqs = g.events.map(e => e.seq); assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b), 'events stay in order');
  assert.ok(g.view(other).events.length > 0);
});

test('development card pile: totals, what has been played, and the view for every player', () => {
  const g = finishSetup(started(3, 9));
  assert.deepEqual(g.devTotal, { knight: 14, vp: 5, roadBuilding: 2, yearOfPlenty: 2, monopoly: 2 });
  assert.deepEqual(g.devPlayedCount, {});
  const me = g.turn; g.players[me].dev.push({ type: 'knight', turn: 0 });
  g.forcedDice = [[1, 2]]; g.act(me, { type: 'roll' });
  g.act(me, { type: 'playDev', card: 'knight' });
  assert.equal(g.devPlayedCount.knight, 1);
  const v = g.view((me + 1) % 3);
  assert.deepEqual(v.devPile.played, { knight: 1 }); assert.equal(v.devPile.total.knight, 14); assert.equal(v.devPlayed, true, 'the existing once-per-turn flag is untouched');
  assert.ok(v.players.every(p => p.devReveal === undefined && typeof p.devCount === 'number'), 'other players only show how many cards they hold, never which');
});

test('map categories: 15 countries and the misc maps (Classic Island and Green Forest)', () => {
  const list = maps.presetList();
  assert.ok(list.every(m => ['countries', 'misc'].includes(m.category)));
  assert.equal(list.filter(m => m.category === 'countries').length, 15);
  assert.deepEqual(list.filter(m => m.category === 'misc').map(m => m.key).sort(), ['classic', 'greenforest']);
});

test('Green Forest: lake island, 24 visible forest tiles, 30 fog tiles that never hide wood, six wood harbors in the lake', () => {
  const dist = t => Math.max(Math.abs(t.q), Math.abs(t.r), Math.abs(t.q + t.r));
  for (let seed = 1; seed <= 12; seed++) {
    const g = mk(2, seed, 'greenforest'), T = g.board.tiles, at = (q, r) => T.find(t => t.q === q && t.r === r);
    assert.equal(T.length, 55, 'a hexagon of radius 4 without the six lake tiles');
    assert.deepEqual([T[g.robber].terrain, T[g.robber].q, T[g.robber].r], ['desert', 0, 0], 'the robber starts on the island');
    for (const [q, r] of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]) assert.equal(at(q, r), undefined, 'water around the island');
    const fog = T.filter(t => t.fog), seen = T.filter(t => !t.fog && t.terrain !== 'desert');
    assert.equal(fog.length, 30); assert.equal(seen.length, 24);
    assert.ok(seen.every(t => t.terrain === 'forest'));
    assert.ok(fog.every(t => ['hills', 'pasture', 'fields', 'mountains'].includes(t.terrain)), 'fog never hides wood');
    for (const k of ['hills', 'pasture', 'fields', 'mountains']) assert.ok(fog.some(t => t.terrain === k), k + ' hides in the fog');
    assert.ok(T.every(t => (t.terrain === 'desert') === (t.number === null)));
    assert.ok(T.filter(t => dist(t) === 4).every(t => t.fog) && T.filter(t => dist(t) === 2).every(t => !t.fog && t.terrain === 'forest'));
    const P = g.board.ports;
    assert.equal(P.length, 6); assert.ok(P.every(p => p.type === 'wood'), 'every harbor is 2:1 wood');
    const portVerts = g.board.vertices.filter(v => v.port);
    assert.equal(portVerts.length, 12, 'six harbors on twelve different corners'); assert.ok(portVerts.every(v => v.port === 'wood'));
    assert.ok(P.every(p => g.board.edges[p.edge].hexes.length === 1 && dist(T[g.board.edges[p.edge].hexes[0]]) === 2 && Math.hypot(p.x, p.y) < 2.1), 'tied to the inner forest ring, floating in the lake');
  }
});

test('fog: hidden in the board view until a settlement or road touches it, then uncovered for everyone', () => {
  const g = mk(3, 6, 'greenforest'); g.act(0, { type: 'start' });
  let bv = g.boardView();
  assert.equal(bv.key, 'greenforest');
  assert.equal(bv.tiles.filter(t => t.terrain === 'fog').length, 30);
  assert.ok(bv.tiles.filter(t => t.fog).every(t => t.terrain === 'fog' && t.number === null), 'neither terrain nor number leaks');
  // a settlement uncovers every fog tile around its corner
  const pi = g.turn, spot = g.validSettlements(pi, false).find(v => g.board.vertices[v].hexes.some(h => g.board.tiles[h].fog));
  const around = g.board.vertices[spot].hexes.filter(h => g.board.tiles[h].fog), v0 = g.boardVersion;
  g.act(pi, { type: 'settle', vertex: spot });
  assert.ok(g.boardVersion > v0, 'clients are told the board changed');
  assert.deepEqual(g.events.filter(e => e.type === 'reveal').pop().tiles.slice().sort((a, b) => a - b), around.slice().sort((a, b) => a - b));
  bv = g.boardView();
  around.forEach(h => { assert.notEqual(bv.tiles[h].terrain, 'fog'); assert.ok(bv.tiles[h].number >= 2); });
  assert.equal(bv.tiles.filter(t => t.terrain === 'fog').length, 30 - around.length);
  assert.ok(JSON.stringify(g.log).includes('revealed'));
  const owed = {}; around.forEach(h => { const r = maps.PRODUCES[g.board.tiles[h].terrain]; owed[r] = (owed[r] || 0) + 1; });
  assert.deepEqual(Object.fromEntries(Object.entries(g.players[pi].res).filter(([, n]) => n)), owed, 'each uncovered tile pays one card of its resource');
  assert.deepEqual(g.events.filter(e => e.type === 'reveal').pop().res.slice().sort(), around.map(h => maps.PRODUCES[g.board.tiles[h].terrain]).sort());
  g.act(pi, { type: 'road', edge: g.board.vertices[spot].edges.find(e => g.roads[e] === undefined) });
  finishSetup(g);
  // a road uncovers the fog tiles beside it
  const cur = g.turn; g.forcedDice = [[1, 2]]; g.act(cur, { type: 'roll' });
  const F = g.board.tiles.find(t => g.isHidden(t.id));
  const x = F.vertices.find(v => !g.buildings[v] && g.board.vertices[v].adj.every(a => !g.buildings[a]));
  g.buildings[x] = { p: cur, type: 'settlement' };                      // pretend a settlement is already here
  const e = g.board.vertices[x].edges.find(id => g.board.edges[id].hexes.includes(F.id) && g.roads[id] === undefined);
  g.players[cur].res = { wood: 1, brick: 1, sheep: 0, wheat: 0, ore: 0 };
  const known = new Set(g.revealed); g.act(cur, { type: 'road', edge: e });
  assert.ok(g.revealed.has(F.id) && g.boardView().tiles[F.id].terrain !== 'fog');
  const newly = [...g.revealed].filter(id => !known.has(id)), roadPays = {};
  newly.forEach(id => { const r = maps.PRODUCES[g.board.tiles[id].terrain]; roadPays[r] = (roadPays[r] || 0) + 1; });
  assert.deepEqual(Object.fromEntries(Object.entries(g.players[cur].res).filter(([, n]) => n)), roadPays, 'a road that touches fog opens the hex and pays the builder its resource');
});

test('fog: nobody can put the robber on a tile hidden in the fog, and the desert island cannot be settled', () => {
  const g = mk(3, 6, 'greenforest'); g.act(0, { type: 'start' }); finishSetup(g);
  const pi = g.turn; g.players.forEach(p => { p.res = empty(); });             // uncovered tiles pay cards, so start the 7 with empty hands (no discards)
  g.forcedDice = [[3, 4]]; g.act(pi, { type: 'roll' });
  assert.equal(g.subphase, 'robber');
  const hid = g.board.tiles.find(t => g.isHidden(t.id));
  assert.throws(() => g.act(pi, { type: 'robber', tile: hid.id }), /hidden in the fog/);
  assert.ok(g.legalRobberTiles(pi).length > 0 && g.legalRobberTiles(pi).every(id => !g.isHidden(id)));
  const island = g.board.tiles[g.robber].vertices;
  assert.equal(island.filter(v => g.canSettle(0, v, false)).length, 0, 'nothing grows beside only desert');
});

test('fog: bots cannot see under the fog either (a corner next to fog scores the same whatever is hidden)', () => {
  const g = mk(3, 11, 'greenforest'); g.act(0, { type: 'start' });
  const v = g.board.vertices.find(x => x.hexes.some(h => g.board.tiles[h].fog) && x.hexes.some(h => !g.board.tiles[h].fog && g.board.tiles[h].terrain !== 'desert'));
  const before = bots.vertexScore(g, 0, v.id, 'hard');
  g.board.tiles.filter(t => t.fog).forEach(t => { t.terrain = 'mountains'; t.number = 6; });
  assert.equal(bots.vertexScore(g, 0, v.id, 'hard'), before);
});

test('the host can change the map in the waiting room, and only there', () => {
  const g = mk(2, 3), v0 = g.boardVersion;
  g.setMap(maps.generatePreset('greenforest', 4));
  assert.equal(g.board.key, 'greenforest'); assert.ok(g.boardVersion > v0);
  assert.equal(g.board.tiles.length, 55); assert.equal(g.revealed.size, 0); assert.equal(g.bank.wood, 55);
  assert.deepEqual(g.devTotal, { knight: 28, vp: 10, roadBuilding: 4, yearOfPlenty: 4, monopoly: 4 }, 'a big map gets the bigger deck');
  g.setMap(maps.generatePreset('classic', 4));
  assert.equal(g.board.tiles.length, 19); assert.equal(g.bank.wood, 19);
  g.act(0, { type: 'start' });
  assert.throws(() => g.setMap(maps.generatePreset('greenforest', 1)), /cannot change/);
});

test('fog: tiles pay one card when uncovered, and the second setup round does not pay them twice', () => {
  const g = mk(2, 8, 'greenforest'); g.act(0, { type: 'start' });
  const sum = p => Object.values(g.players[p].res).reduce((a, b) => a + b, 0);
  let checked = 0;
  while (g.phase === 'setup') {
    const pi = g.turn, round = g.setup.step < g.players.length ? 1 : 2, list = g.validSettlements(pi, false);
    const v = list.find(x => g.board.vertices[x].hexes.some(h => g.isHidden(h))) ?? list[0], hexes = g.board.vertices[v].hexes;
    const hidden = hexes.filter(h => g.isHidden(h)).length, withRes = hexes.filter(h => maps.PRODUCES[g.board.tiles[h].terrain]).length, before = sum(pi);
    g.act(pi, { type: 'settle', vertex: v });
    assert.equal(sum(pi) - before, round === 1 ? hidden : withRes, `round ${round}: uncovered tiles pay once`);
    if (hidden) checked++;
    g.act(pi, { type: 'road', edge: g.board.vertices[v].edges.find(e => g.roads[e] === undefined) });
  }
  assert.ok(checked >= 2, 'the test really touched fog');
});

test('fog: an empty bank pays nothing, but the tile still opens', () => {
  const g = mk(2, 6, 'greenforest'); g.act(0, { type: 'start' });
  const F = g.board.tiles.find(t => g.isHidden(t.id)), r = maps.PRODUCES[F.terrain];
  g.bank[r] = 0; const before = JSON.stringify(g.players[0].res);
  assert.deepEqual(g.revealTiles([F.id], 0), []);
  assert.ok(g.revealed.has(F.id)); assert.equal(JSON.stringify(g.players[0].res), before);
  assert.deepEqual(g.events.filter(e => e.type === 'reveal').pop().res, []);
});

test('fog: a road uncovers every fog tile at either tip, not only the two beside it', () => {
  const g = mk(3, 6, 'greenforest'); g.act(0, { type: 'start' }); finishSetup(g);
  const cur = g.turn; g.forcedDice = [[1, 2]]; g.act(cur, { type: 'roll' });
  const { vertices, edges, tiles } = g.board;
  let pick = null;
  for (const F of tiles) {
    if (!g.isHidden(F.id) || pick) continue;
    for (const u of F.vertices) {
      const e = vertices[u].edges.find(id => !edges[id].hexes.includes(F.id));        // the edge at this corner that does not run along F
      if (e === undefined) continue;
      const x = edges[e].v.find(v => v !== u);
      if (!g.buildings[x] && !g.buildings[u] && !vertices[x].hexes.includes(F.id)) { pick = { F, e, x }; break; }
    }
  }
  assert.ok(pick, 'found a road whose tip, but not its side, touches fog');
  const { F, e, x } = pick;
  assert.ok(!edges[e].hexes.includes(F.id), 'the fog tile is not beside the road');
  g.buildings[x] = { p: cur, type: 'settlement' };                                    // pretend a settlement is already here
  g.players[cur].res = { wood: 1, brick: 1, sheep: 0, wheat: 0, ore: 0 };
  const known = new Set(g.revealed); g.act(cur, { type: 'road', edge: e });
  assert.ok(g.revealed.has(F.id), 'the tip of the road opened the fog tile');
  const pays = {}; [...g.revealed].filter(id => !known.has(id)).forEach(id => { const r = maps.PRODUCES[g.board.tiles[id].terrain]; pays[r] = (pays[r] || 0) + 1; });
  assert.deepEqual(Object.fromEntries(Object.entries(g.players[cur].res).filter(([, n]) => n)), pays, 'and paid the builder its resource');
  assert.ok(pays[maps.PRODUCES[F.terrain]] >= 1);
});
