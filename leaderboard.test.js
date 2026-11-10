'use strict';
process.env.BOT_DELAY_MS = '0';
process.env.DB_PATH = ':memory:';   // the server opens its leaderboard database on first use; keep it out of the repository
const test = require('node:test');
const assert = require('node:assert/strict');
const dbmod = require('./db');
const { server, rooms, getStore, recordFinished, limits } = require('./server');
limits.enabled = false;

const skip = dbmod.available() ? false : 'node:sqlite is not available in this Node version';
const A = 'a'.repeat(32), B = 'b'.repeat(32), C = 'c'.repeat(32);
const game = (code, results) => ({ code, finishedAt: 1000, map: 'Classic Island', vpTarget: 10, turns: 40, seats: results.length, results });

test('db: wins add up per player, ranked by wins then fewer games; bots and ID-less seats are not stored', { skip }, () => {
  const s = dbmod.open(':memory:');
  s.recordGame(game('G1', [{ pid: A, name: 'Ann', seat: 0, vp: 10, won: true }, { pid: B, name: 'Bob', seat: 1, vp: 6, won: false }, { pid: null, name: 'Botty', seat: 2, vp: 4, won: false }]));
  s.recordGame(game('G2', [{ pid: A, name: 'Ann', seat: 0, vp: 8, won: false }, { pid: B, name: 'Bob', seat: 1, vp: 10, won: true }]));
  s.recordGame(game('G3', [{ pid: A, name: 'Ann', seat: 0, vp: 10, won: true }, { pid: C, name: 'Cy', seat: 1, vp: 5, won: false }]));
  const t = s.top({ mode: 'multi', pid: C });
  assert.deepEqual(t.rows.map(r => [r.name, r.wins, r.games, r.winRate]), [['Ann', 2, 3, 67], ['Bob', 1, 2, 50], ['Cy', 0, 1, 0]]);
  assert.deepEqual(t.rows.map(r => r.rank), [1, 2, 3]);
  assert.equal(t.rows[2].you, true); assert.equal(t.me, null, 'you are already in the list');
  assert.equal(t.total, 3);
  assert.equal(s.top({ pid: 'f'.repeat(32) }).me, null, 'someone who never played has no row');
  s.close();
});

test('db: games with one person count only under "all games"; a changed name is updated; a limit adds your own row', { skip }, () => {
  const s = dbmod.open(':memory:');
  s.recordGame(game('S1', [{ pid: A, name: 'Ann', seat: 0, vp: 10, won: true }, { pid: null, name: 'Bot', seat: 1, vp: 3, won: false }]));
  assert.equal(s.top({ mode: 'multi' }).rows.length, 0);
  assert.equal(s.top({ mode: 'all' }).rows[0].wins, 1);
  s.recordGame(game('S2', [{ pid: A, name: 'Annie', seat: 0, vp: 10, won: true }]));
  assert.equal(s.top({ mode: 'all' }).rows[0].name, 'Annie');
  for (let i = 0; i < 4; i++) s.recordGame(game('M' + i, [{ pid: B, name: 'Bob', seat: 0, vp: 10, won: true }, { pid: C, name: 'Cy', seat: 1, vp: 4, won: false }]));
  const t = s.top({ mode: 'multi', limit: 1, pid: C });
  assert.equal(t.rows.length, 1); assert.equal(t.rows[0].name, 'Bob');
  assert.equal(t.me.name, 'Cy'); assert.equal(t.me.rank, 2, 'your own row and rank when you are not in the top list');
  assert.equal(s.recordGame(game('X', [{ pid: null, name: 'Bot', seat: 0, vp: 1, won: false }])), null, 'nothing to store without a player ID');
  s.close();
});

let base;
test.before(() => new Promise(r => server.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
test.after(() => { server.closeAllConnections(); server.close(); });
const post = async (p, body) => { const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
const get = async p => { const r = await fetch(base + p); return { status: r.status, body: await r.json() }; };

test('server: a finished game is saved once with the players\' IDs; the ID never reaches other players; a bad ID is ignored', { skip }, async () => {
  const c = (await post('/api/create', { name: 'Hana', pid: A, map: { preset: 'classic' }, seed: 5 })).body;
  const j = (await post('/api/join', { code: c.code, name: 'Ivo', pid: B })).body;
  const k = (await post('/api/join', { code: c.code, name: 'Jules', pid: 'not-an-id' })).body;
  const room = rooms.get(c.code), g = room.game;
  assert.equal(g.players[0].pid, A); assert.equal(g.players[1].pid, B); assert.equal(g.players[2].pid, undefined, 'an invalid ID is dropped');
  assert.ok(!JSON.stringify(g.view(1)).includes(A), 'the view sent to players holds no player IDs');
  g.phase = 'ended'; g.winner = 1;   // pretend the game ended: Ivo won
  recordFinished(room); recordFinished(room);   // a second call must not write it again
  const lb = (await get(`/api/leaderboard?mode=multi&pid=${A}`)).body;
  assert.equal(lb.enabled, true);
  assert.deepEqual(lb.rows.map(r => [r.name, r.wins, r.games]), [['Ivo', 1, 1], ['Hana', 0, 1]]);
  assert.equal(lb.rows[1].you, true);
  assert.ok(!JSON.stringify(lb).includes(A) && !JSON.stringify(lb).includes(B), 'IDs are not in the leaderboard reply');
  assert.equal(getStore().top({ mode: 'all' }).rows.length, 2, 'the seat without an ID is not stored');
  void j; void k;
});

test('server: a seat taken over by a bot counts as a game played, never as the win', { skip }, async () => {
  const c = (await post('/api/create', { name: 'Kai', pid: C, map: { preset: 'classic' }, seed: 6 })).body;
  await post('/api/join', { code: c.code, name: 'Lou', pid: 'd'.repeat(32) });
  const room = rooms.get(c.code), g = room.game;
  g.players[0].takenOver = 'left'; g.phase = 'ended'; g.winner = 0;
  recordFinished(room);
  const row = (await get(`/api/leaderboard?mode=multi&pid=${C}`)).body.rows.find(r => r.you);
  assert.deepEqual([row.wins, row.games], [0, 1]);
});

test('server: the leaderboard answers for either mode and ignores a malformed pid', { skip }, async () => {
  const all = (await get('/api/leaderboard?mode=all&pid=%3Cscript%3E')).body;
  assert.equal(all.mode, 'all'); assert.ok(all.rows.every(r => r.you === false));
  assert.equal((await get('/api/leaderboard?mode=bogus')).body.mode, 'multi');
});
