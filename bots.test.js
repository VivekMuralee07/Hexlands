'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, RES } = require('./game');
const maps = require('./maps');
const bots = require('./bots');

function botGame(levels, preset = 'classic', seed = 1, vpTarget = 10) {
  const g = new Game({ code: 'BOT', map: maps.generatePreset(preset, seed), rng: maps.makeRng(seed), vpTarget });
  g.addPlayer('Host', 'host');
  levels.forEach(l => g.act(0, { type: 'addBot', level: l }));
  g.players[0].bot = levels[0] ? 'medium' : null; // host is driven by the medium brain in these tests
  return g;
}
function run(g, maxSteps = 30000) {
  const start = Math.max(19, g.board.tiles.length);
  let steps = 0, rescues = 0;
  while (g.phase !== 'ended' && steps < maxSteps) {
    const next = bots.nextActor(g);
    assert.ok(next, `stalled in ${g.phase}/${g.subphase} turn ${g.turn}`);
    try { g.act(next.pi, bots.decide(g, next.pi)); }
    catch (e) { rescues++; assert.ok(bots.rescue(g, next.pi), 'rescue failed: ' + e.message); }
    steps++;
    if (steps % 50 === 0) for (const k of RES) assert.equal(g.bank[k] + g.players.reduce((a, p) => a + p.res[k], 0), start);
  }
  return { steps, rescues };
}

test('lobby: host adds, re-levels and removes bots; seats cap at 4', () => {
  const g = new Game({ code: 'L', map: maps.generatePreset('classic', 3), rng: maps.makeRng(3) });
  g.addPlayer('Vivek', 'v');
  g.act(0, { type: 'addBot', level: 'easy' });
  g.act(0, { type: 'addBot', level: 'hard' });
  g.addPlayer('Asha', 'a');
  assert.throws(() => g.act(0, { type: 'addBot', level: 'easy' }), /seats/);
  assert.throws(() => g.act(3, { type: 'addBot', level: 'easy' }), /host/);
  assert.equal(g.players.filter(p => p.bot).length, 2);
  assert.ok(g.players.filter(p => p.bot).every(p => p.connected));
  g.act(0, { type: 'setBotLevel', seat: 1, level: 'medium' });
  assert.equal(g.players[1].bot, 'medium');
  assert.throws(() => g.act(0, { type: 'setBotLevel', seat: 1, level: 'insane' }), /easy, medium or hard/);
  assert.throws(() => g.act(0, { type: 'removeBot', seat: 3 }), /not a bot/);
  g.act(0, { type: 'removeBot', seat: 1 });
  assert.equal(g.players.length, 3);
  assert.equal(new Set(g.players.map(p => p.name)).size, 3);
  g.act(0, { type: 'start' });
  assert.throws(() => g.act(g.players.findIndex(p => p.token === 'v'), { type: 'addBot' }), /before the game/);
});

test('bots finish games at every difficulty without rescues', () => {
  for (const level of ['easy', 'medium', 'hard']) {
    for (let seed = 1; seed <= 6; seed++) {
      const g = botGame([level, level, level], 'classic', seed * 13);
      g.players[0].bot = level;
      g.act(0, { type: 'start' });
      const r = run(g);
      assert.equal(g.phase, 'ended', `${level} seed ${seed} did not finish`);
      assert.equal(r.rescues, 0, `${level} needed rescues`);
      assert.ok(g.vp(g.winner) >= 10);
    }
  }
});

test('bots play every country map and custom maps', () => {
  for (const { key } of maps.presetList()) {
    const g = botGame(['easy', 'medium', 'hard'], key, key.length * 7, 12);
    g.act(0, { type: 'start' });
    const r = run(g);
    assert.equal(g.phase, 'ended', key);
    assert.equal(r.rescues, 0, key);
  }
  const tiles = [];
  ['forest', 'hills', 'pasture', 'fields', 'mountains', 'desert', 'forest', 'fields', 'pasture', 'hills', 'mountains', 'fields'].forEach((t, i) => tiles.push({ q: i % 4, r: Math.floor(i / 4), terrain: t }));
  const g = new Game({ code: 'C', map: maps.buildCustom(tiles, 4), rng: maps.makeRng(4), vpTarget: 6 });
  g.addPlayer('Host', 'h'); g.act(0, { type: 'addBot', level: 'hard' }); g.players[0].bot = 'medium';
  g.act(0, { type: 'start' });
  run(g);
  assert.equal(g.phase, 'ended');
});

test('hard bots beat easy bots most of the time', () => {
  let hardWins = 0, games = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const g = botGame(['hard', 'easy', 'easy'], 'classic', seed * 101);
    g.players[0].bot = 'hard';
    g.act(0, { type: 'start' });
    run(g);
    games++;
    if (g.players[g.winner].bot === 'hard') hardWins++;
  }
  // Two hard vs two easy: a coin flip would be 50%.
  assert.ok(hardWins / games >= 0.7, `hard won ${hardWins}/${games}`);
});

test('medium bots beat easy bots more often than not', () => {
  let wins = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const g = botGame(['medium', 'easy', 'easy'], 'classic', seed * 57);
    g.players[0].bot = 'medium';
    g.act(0, { type: 'start' });
    run(g);
    if (g.players[g.winner].bot === 'medium') wins++;
  }
  assert.ok(wins / 30 >= 0.6, `medium won ${wins}/30`);
});

test('bots answer a human trade offer and the human can complete it', () => {
  const g = botGame(['medium', 'medium'], 'classic', 9);
  g.players[0].bot = null;
  g.act(0, { type: 'start' });
  const human = g.players.findIndex(p => !p.bot);
  // Bots handle setup and turns until it is the human's turn after rolling.
  for (let i = 0; i < 2000 && !(g.phase === 'main' && g.turn === human && g.rolled && !g.subphase); i++) {
    const next = bots.nextActor(g);
    if (next) { bots.step(g, next.pi); continue; }
    if (g.phase === 'setup') g.autoTurn(human);
    else if (g.subphase === 'discard') g.autoDiscard(human);
    else if (g.subphase === 'robber') g.act(human, { type: 'robber', tile: (g.robber + 1) % g.board.tiles.length, victim: g.robberVictims(human, (g.robber + 1) % g.board.tiles.length)[0] });
    else if (!g.rolled) g.act(human, { type: 'roll' });
  }
  const H = g.players[human];
  // Make the offer attractive: the human gives 2 ore for 1 of whatever each bot lacks least.
  H.res.ore += 2; g.bank.ore -= 2;
  g.players.forEach((p, i) => { if (i !== human) { p.res.wood += 1; g.bank.wood -= 1; } });
  g.act(human, { type: 'offer', give: { ore: 2 }, get: { wood: 1 } });
  let n;
  while ((n = bots.nextActor(g)) && n.kind === 'respond') bots.step(g, n.pi);
  assert.equal(g.trade.accepted.length + g.trade.declined.length, 2, 'both bots responded');
  if (g.trade.accepted.length) {
    const w = g.trade.accepted[0], before = g.players[w].res.ore;
    g.act(human, { type: 'confirm', with: w });
    assert.equal(g.players[w].res.ore, before + 2);
    assert.equal(H.stats.playerTrades, 1);
  }
});

test('stats and dice history add up', () => {
  const g = botGame(['hard', 'medium', 'easy'], 'classic', 77);
  g.players[0].bot = 'hard';
  g.act(0, { type: 'start' });
  run(g);
  const rolls = g.diceCounts.reduce((a, b) => a + b, 0);
  assert.ok(rolls > 10);
  assert.equal(g.diceCounts[0] + g.diceCounts[1], 0);
  const sevens = g.players.reduce((a, p) => a + p.stats.sevens, 0);
  assert.equal(sevens, g.diceCounts[7]);
  const stolen = g.players.reduce((a, p) => a + p.stats.stolen, 0), lost = g.players.reduce((a, p) => a + p.stats.lostToRobber, 0);
  assert.equal(stolen, lost);
  assert.ok(g.players.every(p => p.stats.collected >= 0));
  assert.ok(g.view(0).players[1].stats);
});
