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
  const repeats = db.prepare('SELECT COUNT(*) AS c FROM games WHERE humans_key = ? AND ranked = 1 AND finished_at >= ?');
  const upName = db.prepare('INSERT INTO players (pid, name, updated_at) VALUES (?, ?, ?) ON CONFLICT(pid) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at');
  const standings = where => db.prepare(`
    SELECT r.pid AS pid, p.name AS name, SUM(r.won) AS wins, COUNT(*) AS games, SUM(r.vp) AS vp
    FROM results r JOIN players p ON p.pid = r.pid
    ${where ? 'WHERE ' + where : ''}
    GROUP BY r.pid
    ORDER BY wins DESC, games ASC, vp DESC, p.name ASC
    LIMIT 5000`);
  const q = { ranked: standings('r.ranked = 1'), multi: standings('r.multi = 1'), all: standings('') };
  const putRoom = db.prepare(`INSERT INTO rooms (code, state, board, meta, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET state = excluded.state, board = COALESCE(NULLIF(excluded.board, ''), rooms.board), meta = excluded.meta, updated_at = excluded.updated_at`);
  const dropRoom = db.prepare('DELETE FROM rooms WHERE code = ?');
  const allRooms = db.prepare('SELECT code, state, board, meta, updated_at FROM rooms WHERE updated_at >= ?');
  const dropOld = db.prepare('DELETE FROM rooms WHERE updated_at < ?');

  return {
    // One finished game. results: [{ pid, name, seat, vp, won, left }]. Only people with a player ID are stored (never bots).
    // pub: the game began in a public room. It is "ranked" when it was public, had two or more different people, and the same group
    // has not already had RANKED_REPEAT_LIMIT ranked games in the last day (so two friends cannot farm wins against each other).
    recordGame({ code, finishedAt = Date.now(), map = '', vpTarget = 10, turns = 0, seats = 0, pub = false, results }) {
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
        db.exec('COMMIT');
        return id;
      } catch (e) { try { db.exec('ROLLBACK'); } catch { /* already closed */ } throw e; }
    },
    // The ranking: most wins first (fewer games breaks a tie, then points). Only players with at least `minGames` games in this mode are
    // ranked. `me` is the caller's own row when they are not in the list: with their rank, or with `need` (games still to play) if they are not ranked yet.
    // Two ranked players with the same name get a short tag from their ID, so nobody can pass as someone else.
    top({ mode = 'ranked', limit = 25, pid = null, minGames = 1 } = {}) {
      const key = q[mode] ? mode : 'ranked';
      const everyone = q[key].all().map(r => ({ pid: r.pid, name: r.name, wins: Number(r.wins), games: Number(r.games), vp: Number(r.vp) }));
      const ranked = everyone.filter(r => r.games >= minGames).map((r, i) => ({ ...r, rank: i + 1 }));
      const count = {}; ranked.forEach(r => { const k = r.name.toLowerCase(); count[k] = (count[k] || 0) + 1; });
      const shape = r => ({ rank: r.rank || null, name: r.name, tag: r.rank && count[r.name.toLowerCase()] > 1 ? sha(r.pid).slice(0, 4) : '', wins: r.wins, games: r.games,
        winRate: r.games ? Math.round(100 * r.wins / r.games) : 0, avgVp: r.games ? Math.round(10 * r.vp / r.games) / 10 : 0, you: !!pid && r.pid === pid, need: r.rank ? 0 : Math.max(0, minGames - r.games) });
      const rows = ranked.slice(0, limit).map(shape);
      const mineAny = pid ? everyone.find(r => r.pid === pid) : null, mine = mineAny && (ranked.find(r => r.pid === pid) || mineAny);
      return { mode: key, rows, me: mine && !rows.some(r => r.you) ? shape(mine) : null, total: ranked.length, minGames };
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
