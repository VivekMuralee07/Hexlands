'use strict';
// Leaderboard storage in SQLite, using the database that is built into Node 22.5 and later (node:sqlite), so there is nothing to install.
// On an older Node, or if the file cannot be opened, open() returns null and the game runs as before with the leaderboard switched off.
const fs = require('fs');
const path = require('path');

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
);`;

const MODES = { multi: 'games with two or more people', all: 'all games, bots included' };

function open(file) {
  if (!DatabaseSync) return null;
  try {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    const db = new DatabaseSync(file);
    db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 3000;');
    db.exec(SCHEMA);
    return makeStore(db);
  } catch (e) {
    console.error('Leaderboard database unavailable:', e.message);
    return null;
  }
}

function makeStore(db) {
  const addGame = db.prepare('INSERT INTO games (code, finished_at, map, vp_target, turns, seats, humans) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const addResult = db.prepare('INSERT OR IGNORE INTO results (game_id, pid, seat, vp, won, left_game, multi) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const upName = db.prepare('INSERT INTO players (pid, name, updated_at) VALUES (?, ?, ?) ON CONFLICT(pid) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at');
  const standings = (multiOnly) => db.prepare(`
    SELECT r.pid AS pid, p.name AS name, SUM(r.won) AS wins, COUNT(*) AS games, SUM(r.vp) AS vp
    FROM results r JOIN players p ON p.pid = r.pid
    ${multiOnly ? 'WHERE r.multi = 1' : ''}
    GROUP BY r.pid
    ORDER BY wins DESC, games ASC, vp DESC, p.name ASC
    LIMIT 5000`);
  const q = { multi: standings(true), all: standings(false) };

  return {
    // One finished game. results: [{ pid, name, seat, vp, won, left }]. Only people with a player ID are stored (never bots).
    recordGame({ code, finishedAt = Date.now(), map = '', vpTarget = 10, turns = 0, seats = 0, results }) {
      const people = results.filter(r => r && r.pid);
      if (!people.length) return null;
      const humans = new Set(people.map(r => r.pid)).size;
      db.exec('BEGIN');
      try {
        const id = Number(addGame.run(String(code), finishedAt, String(map), vpTarget | 0, turns | 0, seats | 0, humans).lastInsertRowid);
        for (const r of people) {
          addResult.run(id, r.pid, r.seat | 0, r.vp | 0, r.won ? 1 : 0, r.left ? 1 : 0, humans >= 2 ? 1 : 0);
          upName.run(r.pid, String(r.name).slice(0, 16), finishedAt);
        }
        db.exec('COMMIT');
        return id;
      } catch (e) { try { db.exec('ROLLBACK'); } catch { /* already closed */ } throw e; }
    },
    // The ranking: most wins first (fewer games breaks a tie, then points). `me` is the caller's own row and rank when they are not shown.
    top({ mode = 'multi', limit = 25, pid = null } = {}) {
      const key = mode === 'all' ? 'all' : 'multi';
      const all = q[key].all().map((r, i) => ({ rank: i + 1, pid: r.pid, name: r.name, wins: Number(r.wins), games: Number(r.games), vp: Number(r.vp) }));
      const shape = r => ({ rank: r.rank, name: r.name, wins: r.wins, games: r.games, winRate: r.games ? Math.round(100 * r.wins / r.games) : 0, avgVp: r.games ? Math.round(10 * r.vp / r.games) / 10 : 0, you: !!pid && r.pid === pid });
      const rows = all.slice(0, limit).map(shape);
      const mine = pid ? all.find(r => r.pid === pid) : null;
      return { mode: key, rows, me: mine && !rows.some(r => r.you) ? shape(mine) : null, total: all.length };
    },
    close() { try { db.close(); } catch { /* already closed */ } },
  };
}

module.exports = { open, available: () => !!DatabaseSync, MODES };
