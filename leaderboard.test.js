'use strict';
process.env.BOT_DELAY_MS = '0';
process.env.DB_PATH = ':memory:';
process.env.LEADERBOARD_MIN_GAMES = '1';   // the server hides players with fewer than 3 games; the tests use small numbers   // the server opens its leaderboard database on first use; keep it out of the repository
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
  assert.equal((await get('/api/leaderboard?mode=bogus')).body.mode, 'ranked', 'ranked is the default');
});

// ---------- integrity: ranked games, minimum games, repeats, look-alike names ----------
const D = 'd'.repeat(32), E = 'e'.repeat(32);
const duel = (code, win, lose) => game(code, [{ pid: win, name: 'P' + win[0], seat: 0, vp: 10, won: true }, { pid: lose, name: 'P' + lose[0], seat: 1, vp: 5, won: false }]);   // a player is called P<first letter of the ID>

test('db: "ranked" needs a public game with two different people; private and bot games count only elsewhere', { skip }, () => {
  const s = dbmod.open(':memory:');
  s.recordGame({ ...duel('R1', A, B), pub: true });
  s.recordGame({ ...duel('R2', A, B), pub: false });                                                // private: multiplayer, not ranked
  s.recordGame({ code: 'R3', pub: true, turns: 30, seats: 4, results: [{ pid: C, name: 'Cy', seat: 0, vp: 10, won: true }] });   // one person and bots
  const g = m => s.top({ mode: m }).rows.map(r => [r.name, r.wins, r.games]);
  assert.deepEqual(g('ranked'), [['Pa', 1, 1], ['Pb', 0, 1]]);
  assert.deepEqual(g('multi').find(r => r[0] === 'Pa'), ['Pa', 2, 2]);
  assert.equal(g('all').some(r => r[0] === 'Cy'), true, 'a game against bots is under "all games"');
  assert.equal(g('multi').some(r => r[0] === 'Cy'), false);
  assert.equal(g('ranked').some(r => r[0] === 'Cy'), false);
  s.close();
});

test('db: the same group of people counts as ranked 3 times in a day, then only as multiplayer', { skip }, () => {
  const s = dbmod.open(':memory:');
  for (let i = 0; i < 5; i++) s.recordGame({ ...duel('F' + i, A, B), pub: true, finishedAt: 1000 + i });
  assert.equal(s.top({ mode: 'ranked' }).rows.find(r => r.name === 'Pa').games, dbmod.RANKED_REPEAT_LIMIT);
  assert.equal(s.top({ mode: 'multi' }).rows.find(r => r.name === 'Pa').games, 5);
  s.recordGame({ ...duel('Fnew', A, B), pub: true, finishedAt: 1000 + 25 * 3600e3 });   // a day later it counts again
  assert.equal(s.top({ mode: 'ranked' }).rows.find(r => r.name === 'Pa').games, dbmod.RANKED_REPEAT_LIMIT + 1);
  s.recordGame({ ...duel('Fother', A, C), pub: true, finishedAt: 2000 });                 // a different group is not limited
  assert.equal(s.top({ mode: 'ranked' }).rows.find(r => r.name === 'Pa').games, dbmod.RANKED_REPEAT_LIMIT + 2);
  s.close();
});

test('db: players with too few games are not ranked; they see how many more they need', { skip }, () => {
  const s = dbmod.open(':memory:');
  for (let i = 0; i < 3; i++) s.recordGame({ ...duel('M' + i, A, B), pub: false });
  s.recordGame({ ...duel('Mx', C, A), pub: false });
  const t = s.top({ mode: 'multi', minGames: 3, pid: C });
  assert.deepEqual(t.rows.map(r => r.name), ['Pa', 'Pb'], 'only A (4 games) and B (3 games) have enough');
  assert.equal(t.total, 2);
  assert.equal(t.me.rank, null); assert.equal(t.me.need, 2, 'C has played 1 game and needs 2 more');
  assert.equal(s.top({ mode: 'multi', minGames: 3, pid: A }).me, null, 'a ranked player is in the list, no extra row');
  s.close();
});

test('db: two ranked players with the same name get a short tag so nobody can pass as another', { skip }, () => {
  const s = dbmod.open(':memory:');
  s.recordGame({ ...game('N1', [{ pid: A, name: 'Alex', seat: 0, vp: 10, won: true }, { pid: B, name: 'alex', seat: 1, vp: 5, won: false }, { pid: C, name: 'Zed', seat: 2, vp: 4, won: false }]), pub: true });
  const rows = s.top({ mode: 'ranked' }).rows;
  assert.match(rows[0].tag, /^[0-9a-f]{4}$/); assert.match(rows[1].tag, /^[0-9a-f]{4}$/); assert.notEqual(rows[0].tag, rows[1].tag);
  assert.equal(rows.find(r => r.name === 'Zed').tag, '', 'a name nobody else uses has no tag');
  s.close();
});

test('db: a database made by the first version is upgraded and keeps its games', { skip }, () => {
  const { DatabaseSync } = require('node:sqlite');
  const fs = require('fs'), os = require('os'), path = require('path');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hexdb-')), 'old.db');
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE games (id INTEGER PRIMARY KEY, code TEXT NOT NULL, finished_at INTEGER NOT NULL, map TEXT, vp_target INTEGER, turns INTEGER, seats INTEGER NOT NULL, humans INTEGER NOT NULL);
    CREATE TABLE results (game_id INTEGER NOT NULL REFERENCES games(id), pid TEXT NOT NULL, seat INTEGER NOT NULL, vp INTEGER NOT NULL, won INTEGER NOT NULL, left_game INTEGER NOT NULL DEFAULT 0, multi INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (game_id, pid));
    CREATE TABLE players (pid TEXT PRIMARY KEY, name TEXT NOT NULL, updated_at INTEGER NOT NULL);
    INSERT INTO games VALUES (1, 'OLD', 5, 'Classic', 10, 40, 2, 2);
    INSERT INTO results VALUES (1, '${A}', 0, 10, 1, 0, 1), (1, '${B}', 1, 6, 0, 0, 1);
    INSERT INTO players VALUES ('${A}', 'Old Ann', 5), ('${B}', 'Old Bob', 5);`);
  old.close();
  const s = dbmod.open(file);
  assert.deepEqual(s.top({ mode: 'multi' }).rows.map(r => [r.name, r.wins]), [['Old Ann', 1], ['Old Bob', 0]], 'the old games are still there');
  assert.equal(s.top({ mode: 'ranked' }).rows.length, 0, 'old games were not public, so they are not ranked');
  s.recordGame({ ...duel('NEW', A, B), pub: true });
  assert.equal(s.top({ mode: 'ranked' }).rows.length, 2, 'new games work on the upgraded database');
  s.close();
});

test('server: a game that began in a public room is ranked; one that began private is not', { skip }, async () => {
  const mkGame = async (name, pidA, pidB, pub) => {
    const c = (await post('/api/create', { name, pid: pidA, public: pub, map: { preset: 'classic' }, seed: 8 })).body;
    await post('/api/join', { code: c.code, name: name + '2', pid: pidB });
    const room = rooms.get(c.code); room.publicAtStart = pub; room.game.phase = 'ended'; room.game.winner = 0;
    recordFinished(room);
  };
  await mkGame('Pubby', 'f1'.repeat(16), 'f2'.repeat(16), true);
  await mkGame('Privy', 'f3'.repeat(16), 'f4'.repeat(16), false);
  const ranked = (await get('/api/leaderboard?mode=ranked')).body.rows.map(r => r.name);
  assert.ok(ranked.includes('Pubby') && !ranked.includes('Privy'), 'ranked: ' + ranked);
  const multi = (await get('/api/leaderboard?mode=multi')).body.rows.map(r => r.name);
  assert.ok(multi.includes('Pubby') && multi.includes('Privy'));
});
