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
