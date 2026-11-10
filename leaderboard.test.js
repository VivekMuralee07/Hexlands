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

// ---------- the richer leaderboard: record, form, streak, favourite map, period, sort, summary ----------
const DAY = 86400e3, NOW = 100 * DAY;
const rec = (code, at, map, winner, loser, turns = 60) => ({ code, finishedAt: at, map, turns, seats: 2, pub: true,
  results: [{ pid: winner, name: 'P' + winner[0], seat: 0, vp: 10, won: true }, { pid: loser, name: 'P' + loser[0], seat: 1, vp: 6, won: false }] });

test('db: each row has the record, form (newest first), win streak, best and average points, favourite map and last played', { skip }, () => {
  const s = dbmod.open(':memory:');
  // A plays 7 games against rotating opponents (so none is capped): L W W L W W W, oldest to newest
  const opp = [B, C, D, E, B, C, D], won = [0, 1, 1, 0, 1, 1, 1], maps = ['Japan', 'Japan', 'Australia', 'Japan', 'Australia', 'Australia', 'Australia'];
  opp.forEach((o, i) => s.recordGame(rec('H' + i, NOW - (7 - i) * DAY, maps[i], won[i] ? A : o, won[i] ? o : A, 40 + i * 10)));
  const a = s.top({ mode: 'all', now: NOW, pid: A }).rows.find(r => r.name === 'Pa');
  assert.deepEqual([a.wins, a.losses, a.games, a.winRate], [5, 2, 7, 71]);
  assert.deepEqual(a.form, [1, 1, 1, 0, 1], 'the last five games, newest first');
  assert.equal(a.streak, 3, 'three wins in a row at the moment');
  assert.equal(a.bestVp, 10);
  assert.equal(a.avgVp, Math.round(10 * (5 * 10 + 2 * 6) / 7) / 10);
  assert.equal(a.favMap, 'Australia');
  assert.equal(a.lastPlayed, NOW - 1 * DAY);
  const b = s.top({ mode: 'all', now: NOW }).rows.find(r => r.name === 'Pb');
  assert.equal(b.streak, 0, 'a player whose last game was lost has no streak');
  s.close();
});

test('db: the period keeps only recent games, and the summary describes the list', { skip }, () => {
  const s = dbmod.open(':memory:');
  s.recordGame(rec('O1', NOW - 40 * DAY, 'Japan', A, B, 50));
  s.recordGame(rec('O2', NOW - 20 * DAY, 'Japan', A, C, 70));
  s.recordGame(rec('O3', NOW - 2 * DAY, 'Australia', B, A, 90));
  const all = s.top({ mode: 'all', now: NOW, period: 'all' }), d30 = s.top({ mode: 'all', now: NOW, period: '30' }), d7 = s.top({ mode: 'all', now: NOW, period: '7' });
  assert.deepEqual([all.summary.games, d30.summary.games, d7.summary.games], [3, 2, 1]);
  assert.equal(all.summary.avgTurns, 70); assert.equal(all.summary.topMap, 'Japan');
  assert.equal(d7.summary.topMap, 'Australia');
  assert.equal(d7.rows.find(r => r.name === 'Pa').games, 1, 'only the game of the last 7 days counts for A');
  assert.equal(d7.period, '7'); assert.equal(all.period, 'all');
  assert.equal(s.top({ mode: 'all', now: NOW, period: 'bogus' }).period, 'all');
  s.close();
});

test('db: sorting by wins, win rate or average points ranks players differently', { skip }, () => {
  const s = dbmod.open(':memory:');
  // A: 4 wins in 8 games (50%). B: 2 wins in 2 games (100%). C: 0 wins but always high points? (points are 10 for a win, 6 for a loss)
  for (let i = 0; i < 4; i++) s.recordGame(rec('S' + i, NOW - i * DAY, 'Japan', A, i % 2 ? C : D));
  for (let i = 0; i < 4; i++) s.recordGame(rec('T' + i, NOW - i * DAY, 'Japan', i % 2 ? C : D, A));
  for (let i = 0; i < 2; i++) s.recordGame(rec('U' + i, NOW - i * DAY, 'Japan', B, E));
  const names = sort => s.top({ mode: 'all', now: NOW, sort }).rows.map(r => r.name);
  assert.equal(names('wins')[0], 'Pa', 'most wins first');
  assert.equal(names('rate')[0], 'Pb', 'best win rate first');
  assert.equal(names('vp')[0], 'Pb', 'best average points first (every win is 10 points)');
  assert.equal(s.top({ mode: 'all', now: NOW, sort: 'bogus' }).sort, 'wins');
  s.close();
});

test('server: the leaderboard reply carries the extra fields and honours period and sort', { skip }, async () => {
  const lb = (await get('/api/leaderboard?mode=all&period=7&sort=rate')).body;
  assert.equal(lb.period, '7'); assert.equal(lb.sort, 'rate');
  assert.ok(lb.summary && typeof lb.summary.games === 'number');
  const bad = (await get('/api/leaderboard?mode=all&period=zzz&sort=zzz')).body;
  assert.equal(bad.period, 'all'); assert.equal(bad.sort, 'wins');
  const row = (await get('/api/leaderboard?mode=all')).body.rows[0];
  if (row) for (const k of ['wins', 'losses', 'games', 'winRate', 'avgVp', 'bestVp', 'streak', 'form', 'lastPlayed', 'favMap']) assert.ok(k in row, 'row has ' + k);
});

// ---------- bot statistics under "All games" ----------
const botRec = (code, at, levels, winnerSeat, pid = A) => ({ code, finishedAt: at, map: 'Japan', turns: 60, seats: 1 + levels.length, pub: false,
  results: [{ pid, name: 'Pa', seat: 0, vp: winnerSeat === 0 ? 10 : 5, won: winnerSeat === 0 }],
  bots: levels.map((level, i) => ({ level, seat: i + 1, vp: winnerSeat === i + 1 ? 10 : 6, won: winnerSeat === i + 1 })) });

test('db: bot results are counted per difficulty, only under "All games", and the period applies', { skip }, () => {
  const s = dbmod.open(':memory:');
  s.recordGame(botRec('K1', NOW - 40 * DAY, ['easy', 'medium', 'hard'], 3));   // hard bot wins
  s.recordGame(botRec('K2', NOW - 3 * DAY, ['easy', 'easy', 'hard'], 0));      // the person wins
  s.recordGame(botRec('K3', NOW - 1 * DAY, ['medium', 'hard', 'hard'], 2));    // a hard bot wins
  const all = s.top({ mode: 'all', now: NOW }).bots, by = b => Object.fromEntries(b.levels.map(l => [l.level, l]));
  assert.deepEqual(all.levels.map(l => l.level), ['easy', 'medium', 'hard'], 'always the three difficulties, in order');
  assert.deepEqual([by(all).easy.games, by(all).easy.wins, by(all).easy.winRate], [3, 0, 0]);
  assert.deepEqual([by(all).medium.games, by(all).medium.wins], [2, 0]);
  assert.deepEqual([by(all).hard.games, by(all).hard.wins, by(all).hard.winRate], [4, 2, 50]);
  assert.equal(by(all).hard.bestVp, 10); assert.equal(by(all).hard.avgVp, Math.round(10 * (10 + 6 + 6 + 10) / 4) / 10);
  assert.deepEqual([all.games, all.botWins], [3, 2], 'bots played in 3 games and won 2 of them');
  const week = s.top({ mode: 'all', now: NOW, period: '7' }).bots;
  assert.deepEqual([week.games, week.botWins, by(week).easy.games, by(week).hard.games], [2, 1, 2, 3]);
  assert.equal(s.top({ mode: 'ranked', now: NOW }).bots, null); assert.equal(s.top({ mode: 'multi', now: NOW }).bots, null);
  s.close();
});

test('db: with no bot games the levels are zero, and an unknown difficulty is ignored', { skip }, () => {
  const s = dbmod.open(':memory:');
  assert.deepEqual(s.top({ mode: 'all' }).bots.levels.map(l => l.games), [0, 0, 0]);
  s.recordGame({ ...botRec('Z1', 1000, ['easy'], 1), bots: [{ level: 'impossible', seat: 1, vp: 10, won: true }] });
  assert.deepEqual(s.top({ mode: 'all' }).bots.levels.map(l => l.games), [0, 0, 0]);
  s.close();
});

test('server: bot seats are saved with their difficulty; a person\'s seat that a bot took over is not a bot', { skip }, async () => {
  const c = (await post('/api/create', { name: 'Hana', pid: 'e1'.repeat(16), map: { preset: 'classic' }, seed: 9 })).body;
  await post('/api/action', { code: c.code, token: c.token, action: { type: 'fillBots', level: 'hard' } });
  const room = rooms.get(c.code), g = room.game;
  const before = (await get('/api/leaderboard?mode=all')).body.bots.levels.find(l => l.level === 'hard').games;
  g.players[2].bot = 'easy';   // one of the three bots is an easy one
  g.phase = 'ended'; g.winner = 1; recordFinished(room);
  const lv = Object.fromEntries((await get('/api/leaderboard?mode=all')).body.bots.levels.map(l => [l.level, l]));
  assert.equal(lv.hard.games, before + 2, 'two hard bot seats were added');
  assert.ok(lv.easy.games >= 1, 'and an easy one');

  const d = (await post('/api/create', { name: 'Ivo', pid: 'e2'.repeat(16), map: { preset: 'classic' }, seed: 10 })).body;
  const r2 = rooms.get(d.code), g2 = r2.game;
  g2.players[0].takenOver = 'left'; g2.players[0].bot = 'medium';   // Ivo left, a bot plays his seat
  const med = (await get('/api/leaderboard?mode=all')).body.bots.levels.find(l => l.level === 'medium').games;
  g2.phase = 'ended'; g2.winner = 0; recordFinished(r2);
  assert.equal((await get('/api/leaderboard?mode=all')).body.bots.levels.find(l => l.level === 'medium').games, med, 'his seat is not counted as a medium bot');
});
