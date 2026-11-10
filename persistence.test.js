'use strict';
process.env.BOT_DELAY_MS = '0';
process.env.DB_PATH = ':memory:';   // the server opens its database on first use; keep it out of the repository
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game } = require('./game');
const maps = require('./maps');
const bots = require('./bots');
const dbmod = require('./db');
const { server, rooms, limits, flushRooms, loadSavedRooms, enablePersistence } = require('./server');
limits.enabled = false;
const skip = dbmod.available() ? false : 'node:sqlite is not available in this Node version';

// A game for 4 bots, played a number of moves in (seeded, so two copies can be compared move for move).
function botGame(preset, seed, steps, opts = {}) {
  const g = new Game({ code: 'SAVE', map: maps.generatePreset(preset, seed), rng: maps.makeRng(seed) });
  g.addPlayer('P0', 't0');
  ['easy', 'medium', 'hard'].forEach(l => g.act(0, { type: 'addBot', level: l }));
  if (Object.keys(opts).length) g.act(0, { type: 'setOptions', opts });
  g.players[0].bot = 'medium'; g.act(0, { type: 'start' });
  play(g, steps);
  return g;
}
function play(g, steps) {
  for (let i = 0; i < steps && g.phase !== 'ended'; i++) {
    const n = bots.nextActor(g); if (!n) break;
    try { g.act(n.pi, bots.decide(g, n.pi)); } catch (e) { bots.rescue(g, n.pi); }
  }
}
// What a game is, without the things that legitimately differ after a restore (clocks and connection times).
function shape(g) {
  const o = JSON.parse(g.snapshot().state);
  delete o.clockAt; o.players.forEach(p => { delete p.offlineSince; }); o.log.forEach(l => { delete l.at; });   // times of day differ between two runs
  return JSON.stringify({ o, board: g.board });
}

test('a saved game comes back exactly as it was, for maps with and without fog, and the Sets and Maps survive', { skip }, () => {
  for (const [preset, steps, opts] of [['classic', 500, { balancedDice: true }], ['hiddenvault', 350, {}], ['flamecup', 350, { friendlyRobber: true }]]) {
    const g = botGame(preset, 11, steps, opts);
    const snap = g.snapshot();
    const copy = Game.restore(JSON.parse(JSON.stringify(snap)));   // as if it went through the database
    assert.equal(shape(copy), shape(g), preset + ': the restored game matches');
    assert.ok(copy.transferredRoads instanceof Set && copy.revealed instanceof Set, 'Sets are Sets again');
    if (opts.balancedDice) assert.ok(copy.diceState.sevens instanceof Map, 'the balanced-dice memory is back');
    for (let i = 0; i < copy.players.length; i++) assert.equal(JSON.stringify(copy.view(i)), JSON.stringify(g.view(i)), 'every player sees the same thing');
  }
});

test('a restored game plays on exactly like the original (same moves, same dice)', { skip }, () => {
  const g = botGame('classic', 23, 300, { balancedDice: true });
  const copy = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
  g.rng = maps.makeRng(99); copy.rng = maps.makeRng(99);   // the same dice from here on
  play(g, 600); play(copy, 600);
  assert.equal(shape(copy), shape(g));
  assert.ok(g.turnNumber > 20, 'the game really moved on');
});

test('a restored game waits for its people: humans are offline, bots play on', { skip }, () => {
  const g = botGame('classic', 5, 80);
  g.players.forEach(p => { p.bot = null; p.connected = true; });   // pretend they are all people
  const copy = Game.restore(g.snapshot(), Math.random, 5000);
  assert.ok(copy.players.every(p => p.connected === false && p.offlineSince === 5000));
  assert.equal(copy.clockAt, 5000);
});

test('db: rooms are saved, updated without resending the board, loaded, and old ones are dropped', { skip }, () => {
  const s = dbmod.open(':memory:');
  s.saveRoom({ code: 'AAAAA', state: '{"v":1}', board: '{"b":1}', meta: { public: true }, updatedAt: 1000 });
  s.saveRoom({ code: 'AAAAA', state: '{"v":2}', board: '', meta: { public: false }, updatedAt: 9000 });   // no board: the saved one stays
  s.saveRoom({ code: 'BBBBB', state: '{"v":3}', board: '{"b":3}', updatedAt: 100 });
  const rows = s.loadRooms(5000, 10000);   // BBBBB was saved more than 5 s before "now", so it is deleted
  assert.deepEqual(rows.map(r => [r.code, r.state, r.board, r.meta.public]), [['AAAAA', '{"v":2}', '{"b":1}', false]]);
  assert.equal(s.loadRooms(1e9, 10000).length, 1);
  s.deleteRoom('AAAAA'); assert.equal(s.loadRooms(1e9, 10000).length, 0);
  s.close();
});

let base;
test.before(() => new Promise(r => server.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
test.after(() => { server.closeAllConnections(); server.close(); });
const post = async (p, body) => { const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
const forget = () => { for (const room of rooms.values()) { clearTimeout(room.botTimer); clearTimeout(room.clockTimer); } rooms.clear(); };   // what a crash does to memory

test('server: a crash and restart keeps the room, the seats and the game going; an ended game is not kept', { skip }, async () => {
  enablePersistence(true);
  const c = (await post('/api/create', { name: 'Hana', pid: 'a'.repeat(32), map: { preset: 'classic' }, seed: 5 })).body;
  await post('/api/action', { code: c.code, token: c.token, action: { type: 'fillBots', level: 'easy' } });
  await post('/api/action', { code: c.code, token: c.token, action: { type: 'start' } });
  const before = rooms.get(c.code).game, me = before.indexOf(c.token), turnNo = before.turnNumber;
  await post('/api/action', { code: c.code, token: c.token, action: { type: 'chat', text: 'hello before the crash' } });
  const logLen = before.log.length;
  flushRooms();   // the save that happens a moment after every change

  forget();       // the crash
  assert.equal(rooms.size, 0);
  assert.equal(loadSavedRooms(), 1, 'one room is restored');
  const room = rooms.get(c.code), g = room.game;
  assert.ok(g, 'the room is back under the same code');
  assert.equal(g.indexOf(c.token), me, 'the same token still has the same seat');
  assert.equal(g.players[me].pid, 'a'.repeat(32), 'the player ID is kept');
  assert.equal(g.players[me].connected, false);
  assert.ok(g.players[me].offlineSince > Date.now(), 'a grace time before a bot is offered the seat');
  assert.ok(g.log.length >= logLen && g.log.some(l => l.text === 'hello before the crash'), 'the log and chat are kept');
  assert.ok(g.turnNumber >= turnNo);
  assert.equal(g.board.tiles.length, 19, 'the board is back');
  // the person can carry on using their old token
  const r = await post('/api/action', { code: c.code, token: c.token, action: { type: 'chat', text: 'back again' } });
  assert.equal(r.body.ok, true);
  assert.equal(room.publicAtStart, false, 'whether the game began public is kept');

  // an ended game is removed from the saved rooms
  rooms.get(c.code).game.phase = 'ended'; rooms.get(c.code).recorded = true;
  rooms.get(c.code).dirty = true; flushRooms();
  forget();
  assert.equal(loadSavedRooms(), 0, 'nothing to restore');
  enablePersistence(false);
});
