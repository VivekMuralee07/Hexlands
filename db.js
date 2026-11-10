'use strict';
// Leaderboard storage in SQLite, using the database that is built into Node 22.5 and later (node:sqlite), so there is nothing to install.
// On an older Node, or if the file cannot be opened, open() returns null and the game runs as before with the leaderboard switched off.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let DatabaseSync = null;
try { ({ DatabaseSync } = require('node:sqlite')); } catch { /* Node without node:sqlite */ }

const SCHEMA = `
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL,
  finished_at INTEGER NOT NULL,
  map TEXT,
  vp_target INTEGER,
  turns INTEGER,
  seats INTEGER NOT NULL,
  humans INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS results (
  game_id INTEGER NOT NULL REFERENCES games(id),
  pid TEXT NOT NULL,
  seat INTEGER NOT NULL,
  vp INTEGER NOT NULL,
  won INTEGER NOT NULL,
  left_game INTEGER NOT NULL DEFAULT 0,
  multi INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (game_id, pid)
);
CREATE INDEX IF NOT EXISTS results_pid ON results (pid);
-- Bot seats in finished games (never a person's seat that a bot took over). One row per bot seat, with its difficulty.
CREATE TABLE IF NOT EXISTS bot_results (
  game_id INTEGER NOT NULL REFERENCES games(id),
  seat INTEGER NOT NULL,
  level TEXT NOT NULL,
  vp INTEGER NOT NULL,
  won INTEGER NOT NULL,
  PRIMARY KEY (game_id, seat)
);
CREATE INDEX IF NOT EXISTS bot_results_level ON bot_results (level);
CREATE TABLE IF NOT EXISTS players (
  pid TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
-- Games and waiting rooms that are still going on, so they survive a restart or a crash. A row is removed when its room ends.
CREATE TABLE IF NOT EXISTS rooms (
  code TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  board TEXT NOT NULL,
  meta TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);`;

// ranked: played in a public room with at least two different people, and not the same people again and again (see RANKED_REPEAT_LIMIT)
const MODES = { ranked: 'public games with two or more people', multi: 'games with two or more people', all: 'all games, bots included' };
const RANKED_REPEAT_LIMIT = 3, REPEAT_WINDOW_MS = 24 * 3600e3;   // the same group of people counts as ranked 3 times in 24 hours, then only under "multiplayer"
const LEVELS = ['easy', 'medium', 'hard'];
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
// Adds the columns that newer versions need to a database made by an older one.
function migrate(db) {
  const has = (table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col);
  const add = (table, col, def) => { if (!has(table, col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); };
  add('games', 'pub', 'INTEGER NOT NULL DEFAULT 0');
  add('games', 'ranked', 'INTEGER NOT NULL DEFAULT 0');
  add('games', 'humans_key', "TEXT NOT NULL DEFAULT ''");
  add('results', 'ranked', 'INTEGER NOT NULL DEFAULT 0');
}

function open(file) {
  if (!DatabaseSync) return null;
  try {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    const db = new DatabaseSync(file);
    db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 3000;');
    db.exec(SCHEMA);
    migrate(db);
    return makeStore(db);
  } catch (e) {
    console.error('Leaderboard database unavailable:', e.message);
    return null;
  }
}

function makeStore(db) {
  const addGame = db.prepare('INSERT INTO games (code, finished_at, map, vp_target, turns, seats, humans, pub, ranked, humans_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const addResult = db.prepare('INSERT OR IGNORE INTO results (game_id, pid, seat, vp, won, left_game, multi, ranked) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const addBot = db.prepare('INSERT OR IGNORE INTO bot_results (game_id, seat, level, vp, won) VALUES (?, ?, ?, ?, ?)');
  const repeats = db.prepare('SELECT COUNT(*) AS c FROM games WHERE humans_key = ? AND ranked = 1 AND finished_at >= ?');
  const upName = db.prepare('INSERT INTO players (pid, name, updated_at) VALUES (?, ?, ?) ON CONFLICT(pid) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at');
  const putRoom = db.prepare(`INSERT INTO rooms (code, state, board, meta, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET state = excluded.state, board = COALESCE(NULLIF(excluded.board, ''), rooms.board), meta = excluded.meta, updated_at = excluded.updated_at`);
  const dropRoom = db.prepare('DELETE FROM rooms WHERE code = ?');
  const allRooms = db.prepare('SELECT code, state, board, meta, updated_at FROM rooms WHERE updated_at >= ?');
  const dropOld = db.prepare('DELETE FROM rooms WHERE updated_at < ?');

  return {
    // One finished game. results: [{ pid, name, seat, vp, won, left }]: only people with a player ID. bots: [{ level, seat, vp, won }]: the bot seats,
    // which feed the bot statistics under "All games" and nothing else.
    // pub: the game began in a public room. It is "ranked" when it was public, had two or more different people, and the same group
    // has not already had RANKED_REPEAT_LIMIT ranked games in the last day (so two friends cannot farm wins against each other).
    recordGame({ code, finishedAt = Date.now(), map = '', vpTarget = 10, turns = 0, seats = 0, pub = false, results, bots = [] }) {
      const people = results.filter(r => r && r.pid);
      if (!people.length) return null;
      const pids = [...new Set(people.map(r => r.pid))].sort(), humans = pids.length, key = sha(pids.join(',')).slice(0, 16);
      const ranked = !!pub && humans >= 2 && Number(repeats.get(key, finishedAt - REPEAT_WINDOW_MS).c) < RANKED_REPEAT_LIMIT;
      db.exec('BEGIN');
      try {
        const id = Number(addGame.run(String(code), finishedAt, String(map), vpTarget | 0, turns | 0, seats | 0, humans, pub ? 1 : 0, ranked ? 1 : 0, key).lastInsertRowid);
        for (const r of people) {
          addResult.run(id, r.pid, r.seat | 0, r.vp | 0, r.won ? 1 : 0, r.left ? 1 : 0, humans >= 2 ? 1 : 0, ranked ? 1 : 0);
          upName.run(r.pid, String(r.name).slice(0, 16), finishedAt);
        }
        for (const b of bots) if (LEVELS.includes(b.level)) addBot.run(id, b.seat | 0, b.level, b.vp | 0, b.won ? 1 : 0);
        db.exec('COMMIT');
        return id;
      } catch (e) { try { db.exec('ROLLBACK'); } catch { /* already closed */ } throw e; }
    },
    // The last games one player took part in, newest first: when, map, their points, whether they won, who won, and whether it counted as ranked.
    recent(pid, limit = 10) {
      const rows = db.prepare(`SELECT g.id AS id, g.finished_at AS at, g.map AS map, g.turns AS turns, g.vp_target AS target, g.seats AS seats, g.humans AS humans, g.ranked AS ranked,
          r.vp AS vp, r.won AS won, r.left_game AS left
        FROM results r JOIN games g ON g.id = r.game_id WHERE r.pid = ? ORDER BY g.finished_at DESC, g.id DESC LIMIT ?`).all(String(pid), Math.max(1, Math.min(50, limit | 0)));
      const winnerHuman = db.prepare('SELECT p.name AS name, r.vp AS vp FROM results r JOIN players p ON p.pid = r.pid WHERE r.game_id = ? AND r.won = 1 LIMIT 1');
      const winnerBot = db.prepare('SELECT level, vp FROM bot_results WHERE game_id = ? AND won = 1 LIMIT 1');
      return rows.map(r => {
        const h = winnerHuman.get(r.id), b = h ? null : winnerBot.get(r.id);
        return {
          id: Number(r.id), at: Number(r.at), map: r.map || '', turns: Number(r.turns), target: Number(r.target), seats: Number(r.seats), humans: Number(r.humans),
          ranked: !!r.ranked, vp: Number(r.vp), won: !!r.won, left: !!r.left,
          winner: h ? { name: h.name, vp: Number(h.vp), bot: null } : b ? { name: 'A bot', vp: Number(b.vp), bot: b.level } : null,
        };
      });
    },
    // The leaderboard for one mode ('ranked' | 'multi' | 'all') and period ('all' | '30' | '7' days), sorted by 'wins' (default), 'rate' or 'vp'.
    // Only players with at least `minGames` games there are ranked. Each row has the record, win rate, average and best points, the last
    // five results (newest first), the current win streak, the favourite map and when they last played. `me` is the caller's own row when they
    // are not in the list (with their rank, or with `need`: the games still to play). `summary` describes the whole list.
    // Two ranked players with the same name get a short tag from their ID, so nobody can pass as someone else.
    top({ mode = 'ranked', limit = 25, pid = null, minGames = 1, period = 'all', sort = 'wins', now = Date.now() } = {}) {
      mode = MODES[mode] ? mode : 'ranked';
      sort = ['wins', 'rate', 'vp'].includes(sort) ? sort : 'wins';
      const days = { 7: 7, 30: 30 }[period], where = [], args = [];
      if (mode === 'ranked') where.push('r.ranked = 1'); else if (mode === 'multi') where.push('r.multi = 1');
      if (days) { where.push('g.finished_at >= ?'); args.push(now - days * 86400e3); }
      const from = extra => `FROM results r JOIN games g ON g.id = r.game_id JOIN players p ON p.pid = r.pid ${where.concat(extra || []).length ? 'WHERE ' + where.concat(extra || []).join(' AND ') : ''}`;
      const everyone = db.prepare(`SELECT r.pid AS pid, p.name AS name, SUM(r.won) AS wins, COUNT(*) AS games, SUM(r.vp) AS vp, MAX(r.vp) AS best, MAX(g.finished_at) AS last ${from()} GROUP BY r.pid LIMIT 5000`).all(...args)
        .map(r => ({ pid: r.pid, name: r.name, wins: Number(r.wins), games: Number(r.games), vp: Number(r.vp), best: Number(r.best), last: Number(r.last) }));
      const rate = r => r.wins / r.games, avg = r => r.vp / r.games;
      const order = { wins: (x, y) => y.wins - x.wins || x.games - y.games || y.vp - x.vp, rate: (x, y) => rate(y) - rate(x) || y.games - x.games || y.wins - x.wins, vp: (x, y) => avg(y) - avg(x) || y.games - x.games || y.wins - x.wins }[sort];
      everyone.sort((x, y) => order(x, y) || x.name.localeCompare(y.name));
      const ranked = everyone.filter(r => r.games >= minGames).map((r, i) => ({ ...r, rank: i + 1 }));
      const count = {}; ranked.forEach(r => { const k = r.name.toLowerCase(); count[k] = (count[k] || 0) + 1; });
      const recent = db.prepare(`SELECT r.won AS won ${from(['r.pid = ?'])} ORDER BY g.finished_at DESC, g.id DESC LIMIT 30`);
      const favourite = db.prepare(`SELECT g.map AS map, COUNT(*) AS c ${from(['r.pid = ?'])} GROUP BY g.map ORDER BY c DESC, MAX(g.finished_at) DESC LIMIT 1`);
      const shape = r => {
        const last = recent.all(...args, r.pid).map(x => Number(x.won)), fav = favourite.get(...args, r.pid);
        let streak = 0; while (streak < last.length && last[streak] === 1) streak++;
        return { rank: r.rank || null, name: r.name, tag: r.rank && count[r.name.toLowerCase()] > 1 ? sha(r.pid).slice(0, 4) : '', wins: r.wins, losses: r.games - r.wins, games: r.games,
          winRate: Math.round(100 * rate(r)), avgVp: Math.round(10 * avg(r)) / 10, bestVp: r.best, form: last.slice(0, 5), streak, lastPlayed: r.last, favMap: fav ? fav.map : '',
          you: !!pid && r.pid === pid, need: r.rank ? 0 : Math.max(0, minGames - r.games) };
      };
      const rows = ranked.slice(0, limit).map(shape);
      const mineAny = pid ? everyone.find(r => r.pid === pid) : null, mine = mineAny && (ranked.find(r => r.pid === pid) || mineAny);
      const g = db.prepare(`SELECT COUNT(*) AS c, AVG(t) AS t FROM (SELECT DISTINCT g.id AS id, g.turns AS t ${from()})`).get(...args);
      const m = db.prepare(`SELECT g.map AS map, COUNT(DISTINCT g.id) AS c ${from()} GROUP BY g.map ORDER BY c DESC LIMIT 1`).get(...args);
      let bots = null;
      if (mode === 'all') {   // how the bots do, by difficulty (a bot seat in a finished game counts once)
        const bw = days ? 'WHERE g.finished_at >= ?' : '', ba = days ? [now - days * 86400e3] : [];
        const by = Object.fromEntries(db.prepare(`SELECT b.level AS level, COUNT(*) AS games, SUM(b.won) AS wins, SUM(b.vp) AS vp, MAX(b.vp) AS best FROM bot_results b JOIN games g ON g.id = b.game_id ${bw} GROUP BY b.level`).all(...ba).map(r => [r.level, r]));
        const tot = db.prepare(`SELECT COUNT(DISTINCT b.game_id) AS games, COUNT(DISTINCT CASE WHEN b.won = 1 THEN b.game_id END) AS wins FROM bot_results b JOIN games g ON g.id = b.game_id ${bw}`).get(...ba);
        bots = { games: Number(tot.games), botWins: Number(tot.wins), levels: LEVELS.map(level => {
          const r = by[level], n = r ? Number(r.games) : 0, w = r ? Number(r.wins) : 0, v = r ? Number(r.vp) : 0;
          return { level, games: n, wins: w, losses: n - w, winRate: n ? Math.round(100 * w / n) : 0, avgVp: n ? Math.round(10 * v / n) / 10 : 0, bestVp: r ? Number(r.best) : 0 };
        }) };
      }
      return { mode, sort, period: days ? String(days) : 'all', rows, bots, me: mine && !rows.some(r => r.you) ? shape(mine) : null, total: ranked.length, minGames,
        summary: { games: Number(g.c), players: ranked.length, avgTurns: g.t ? Math.round(Number(g.t)) : 0, topMap: m ? m.map : '' } };
    },
    // Live rooms. board may be '' to keep the board that is already saved (it changes rarely).
    saveRoom({ code, state, board = '', meta = {}, updatedAt = Date.now() }) { putRoom.run(String(code), state, board, JSON.stringify(meta), updatedAt); },
    deleteRoom(code) { dropRoom.run(String(code)); },
    // Rooms saved since `sinceMs` ago; older rows are deleted.
    loadRooms(maxAgeMs, now = Date.now()) {
      dropOld.run(now - maxAgeMs);
      return allRooms.all(now - maxAgeMs).map(r => ({ code: r.code, state: r.state, board: r.board, meta: JSON.parse(r.meta), updatedAt: Number(r.updated_at) }));
    },
    close() { try { db.close(); } catch { /* already closed */ } },
  };
}

module.exports = { open, available: () => !!DatabaseSync, MODES, RANKED_REPEAT_LIMIT };
