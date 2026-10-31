'use strict';
// Hexlands server: zero dependencies. Static files + JSON API + Server-Sent Events.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Game, GameError, MAX_PLAYERS } = require('./game');
const maps = require('./maps');
const bots = require('./bots');
const legal = require('./legal');

const PORT = process.env.PORT || 3000;
const PUBLIC = __dirname;
const PUBLIC_FILES = new Set(['/index.html', '/app.js', '/art.js', '/sound.js', '/style.css', '/sw.js', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/apple-touch-icon.png', '/screenshot-home.png', '/screenshot-game.png', '/screenshot-game-wide.png']);
const rooms = new Map(); // code -> { game, clients: Map<token, Set<res>>, touched }
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// ---------- limits and moderation (all in memory; nothing here is stored for long) ----------
// The hosting platform sits behind Cloudflare, which sets cf-connecting-ip itself, so a player cannot fake it.
// x-forwarded-for is only the fallback (Render appends to it, so the second to last entry is the real visitor).
const limits = { enabled: true };           // tests switch this off, or use it with different cf-connecting-ip headers
const hits = new Map();                     // "kind:ip" -> recent timestamps
const recent = (key, windowMs, now = Date.now()) => (hits.get(key) || []).filter(t => now - t < windowMs);
function hit(key, windowMs, now = Date.now()) { const a = recent(key, windowMs, now); a.push(now); hits.set(key, a); return a.length; }
function tooMany(msg) { const e = new GameError(msg); e.status = 429; return e; }
function clientIp(req) {
  const h = req.headers, cf = h['cf-connecting-ip'] || h['true-client-ip'];
  if (cf) return String(cf).trim();
  const xff = String(h['x-forwarded-for'] || '').split(',').map(x => x.trim()).filter(Boolean);
  if (xff.length) return xff.length >= 2 ? xff[xff.length - 2] : xff[0];
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}
function guard(req, kind, max, windowMs, msg) {
  if (!limits.enabled) return;
  const key = kind + ':' + clientIp(req), now = Date.now();
  if (recent(key, windowMs, now).length >= max) throw tooMany(msg);
  hit(key, windowMs, now);
}
const MAX_ROOMS = 3000, ROOMS_PER_IP = 5;
const COUNTDOWN_MS = 5000, FILL_AFTER_MS = 60e3, DROP_LOBBY_MS = 30e3, TAKEOVER_MS = 45e3;

// A basic word filter for names and for chat in public rooms. It matches whole words (so "Scunthorpe" is fine), copes with
// simple tricks such as digits for letters, and masks the word in chat. The list is kept scrambled (rot13) so this file reads
// cleanly; add your own words with the BLOCKED_WORDS setting (comma separated). A filter is a first line only: reports and mutes do the rest.
const unscramble = w => w.replace(/[a-z]/g, c => String.fromCharCode((c.charCodeAt(0) - 97 + 13) % 26 + 97));
const BLOCKED = new Set([...'shpx fuvg ovgpu phag nffubyr qvpxurnq chffl juber fyhg onfgneq avttre avttn snttbg snt ergneq encr encvfg anmv xlf cbea oybjwbo jnaxre gjng'.split(' ').map(unscramble),
  ...String(process.env.BLOCKED_WORDS || '').toLowerCase().split(',').map(x => x.trim()).filter(Boolean)]);
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };
function badWord(tok) {
  let w = tok.toLowerCase().replace(/[013457@$]/g, c => LEET[c]).replace(/(.)\1{2,}/g, '$1');
  if (BLOCKED.has(w)) return true;
  return ['s', 'es', 'ed', 'er', 'ers', 'ing', 'in', 'y', 'ty'].some(sfx => w.endsWith(sfx) && BLOCKED.has(w.slice(0, -sfx.length)));
}
const TOKEN = /[A-Za-z0-9@$]+/g;
const hasBlocked = text => (String(text).match(TOKEN) || []).some(badWord);
const maskBlocked = text => String(text).replace(TOKEN, t => badWord(t) ? '*'.repeat(t.length) : t);
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|gg|ly|me|xyz|ru|cn)\b)/i;
const RESERVED_NAME = /^(admin|moderator|support|hexlands|staff|system|server)\b/i;
// Names are tidied on the server whatever the app sends: no control or direction-changing characters, 16 characters at most,
// and "Player 4821" when empty, so strangers always have something to call each other.
function cleanName(raw) {
  let n = String(raw || '').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16).trim();
  if (!n) n = 'Player ' + crypto.randomInt(1000, 10000);
  if (hasBlocked(n)) throw new GameError('Please choose a different name.');
  if (RESERVED_NAME.test(n)) throw new GameError('That name is reserved. Please choose another.');
  return n;
}
// In public rooms two strangers may both pick "Alex": the second one quietly becomes "Alex 2".
function uniqueName(game, name) {
  const taken = n => game.players.some(p => p.name.toLowerCase() === n.toLowerCase());
  let n = name, i = 2;
  while (taken(n)) { const sfx = ' ' + i++; n = name.slice(0, 16 - sfx.length) + sfx; }
  return n;
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

function newCode() {
  for (;;) {
    let c = ''; for (let i = 0; i < 5; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}
const newToken = () => crypto.randomBytes(16).toString('hex');

function newRoom(game, { pub = false, ip = '' } = {}) {
  const now = Date.now();
  return { game, clients: new Map(), touched: now, boardSent: game.boardVersion, public: !!pub, ownerIp: ip, createdAt: now,
    lastJoinAt: now, lastCount: game.players.length, countdownAt: null, fillShown: false };
}
function checkCapacity(req) {
  if (rooms.size >= MAX_ROOMS) throw tooMany('The server is very busy right now. Please try again in a minute.');
  if (!limits.enabled) return clientIp(req);
  const ip = clientIp(req);
  if ([...rooms.values()].filter(r => r.ownerIp === ip).length >= ROOMS_PER_IP) throw tooMany('You already have several rooms open. Finish or close one first.');
  return ip;
}
function destroyRoom(room) {
  clearTimeout(room.botTimer); clearTimeout(room.clockTimer);
  for (const set of room.clients.values()) for (const r of set) r.end();
  room.clients.clear(); rooms.delete(room.game.code);
}
const hostOf = g => g.players.find(p => p.token === g.hostToken);
function openLobbies() {   // public rooms still waiting for players, with a free seat and a human actually connected
  return [...rooms.values()].filter(r => r.public && r.game.phase === 'lobby' && r.game.players.length < MAX_PLAYERS && r.game.players.some(p => !p.bot && p.connected));
}
function roomCard(r) {
  const g = r.game, h = hostOf(g);
  return { code: g.code, host: h ? h.name : '', map: g.board.name, vp: g.vpTarget, timer: g.opts.timer, players: g.players.length, max: MAX_PLAYERS, bots: g.players.filter(p => p.bot).length };
}
function netInfo(room, now = Date.now()) {   // what the waiting room needs besides the game itself
  const g = room.game, lobby = g.phase === 'lobby';
  return { public: room.public, countdown: room.countdownAt ? Math.max(0, room.countdownAt - now) : null,
    fillIn: room.public && lobby && g.players.length < MAX_PLAYERS ? Math.max(0, room.lastJoinAt + FILL_AFTER_MS - now) : null };
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 200000) { reject(new GameError('Request too large.')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new GameError('Invalid JSON.')); } });
    req.on('error', reject);
  });
}

function buildMap(spec, seed) {
  if (spec && Array.isArray(spec.tiles)) {
    const err = maps.validateCustom(spec.tiles);
    if (err) throw new GameError(err);
    return maps.buildCustom(spec.tiles, seed);
  }
  const key = spec && maps.PRESETS[spec.preset] ? spec.preset : 'classic';
  return maps.generatePreset(key, seed);
}
function makeGame(code, spec, seed, vpTarget) {
  seed = (Number(seed) >>> 0) || crypto.randomInt(1, 2 ** 31);
  const game = new Game({ code, map: buildMap(spec, seed), vpTarget, rng: maps.makeRng(seed + 7) });
  game.rng = Math.random; // board is reproducible from the seed; dice are not
  return { game, seed };
}

function broadcast(room, now = Date.now()) {
  room.touched = now;
  lobbyAuto(room, now);
  // Tiles uncovered from the fog (or a new map) change the board, so everyone gets it again.
  const bv = room.game.boardVersion, boardMsg = room.boardSent !== bv ? `event: board\ndata: ${JSON.stringify(room.game.boardView())}\n\n` : null;
  room.boardSent = bv;
  for (const [token, set] of room.clients) {
    const pi = room.game.indexOf(token);
    if (pi < 0) { for (const r of set) r.end(); room.clients.delete(token); continue; }
    if (boardMsg) for (const r of set) r.write(boardMsg);
    const msg = `event: state\ndata: ${JSON.stringify({ ...room.game.view(pi), net: netInfo(room, now) })}\n\n`;
    for (const r of set) r.write(msg);
  }
  scheduleBots(room);
  scheduleClock(room);
}

// The move clock: when time runs out the server plays one step for the idle player.
function scheduleClock(room) {
  clearTimeout(room.clockTimer); room.clockTimer = null;
  const g = room.game;
  const lim = g.clockLimit();
  if (!lim || !rooms.has(g.code) || !g.players.some(p => !p.bot && p.connected)) return;
  const ms = Math.max(0, g.clockAt + lim * 1000 - Date.now()) + 40;
  room.clockTimer = setTimeout(() => {
    room.clockTimer = null;
    if (!rooms.has(g.code)) return;
    try { g.timeout(); } catch (e) { console.error('timer error', e); }
    broadcast(room);
  }, ms);
}

// Bots act one move at a time on a timer so people can follow along.
// They pause while no human is connected and resume when someone returns.
function scheduleBots(room) {
  if (room.botTimer || !rooms.has(room.game.code)) return;
  const g = room.game;
  if (!g.players.some(p => !p.bot && p.connected)) return;
  const next = bots.nextActor(g);
  if (!next) return;
  room.botTimer = setTimeout(() => {
    room.botTimer = null;
    if (!rooms.has(g.code)) return;
    const cur = bots.nextActor(g); // state may have changed while waiting
    if (!cur) return;
    try { bots.step(g, cur.pi); } catch (e) { console.error('bot error', e); bots.rescue(g, cur.pi); }
    broadcast(room);
  }, bots.delay(g, next));
}
function setConnected(room, token) {
  const pi = room.game.indexOf(token);
  if (pi < 0) return;
  const was = room.game.players[pi].connected;
  const now = !!(room.clients.get(token) && room.clients.get(token).size);
  if (was !== now) { const p = room.game.players[pi]; p.connected = now; p.offlineSince = now ? null : Date.now(); room.game.version++; }
}

// Public waiting rooms: the countdown when a full table is ready, and the "play with bots" prompt after a minute alone.
function lobbyAuto(room, now) {
  const g = room.game; if (g.phase !== 'lobby') return false;
  let changed = false;
  if (room.lastCount !== g.players.length) { room.lastCount = g.players.length; room.lastJoinAt = now; room.fillShown = false; if (room.countdownAt) room.countdownAt = null; changed = true; }
  if (!room.public) return changed;
  const humans = g.players.filter(p => !p.bot);
  const go = g.players.length >= MAX_PLAYERS && humans.length > 0 && humans.every(p => p.ready && p.connected);
  if (go) {
    if (!room.countdownAt) { room.countdownAt = now + COUNTDOWN_MS; return true; }
    if (now >= room.countdownAt) {
      room.countdownAt = null;
      const hi = g.indexOf(g.hostToken) >= 0 ? g.indexOf(g.hostToken) : g.players.findIndex(p => !p.bot);
      try { g.act(hi, { type: 'start' }); } catch (e) { console.error('auto start', e.message); }
      return true;
    }
  } else if (room.countdownAt) { room.countdownAt = null; changed = true; }
  if (!room.fillShown && g.players.length < MAX_PLAYERS && now - room.lastJoinAt >= FILL_AFTER_MS) { room.fillShown = true; changed = true; }
  return changed;
}
// Runs every second: removes people who vanished from public waiting rooms, hands the host role on, and lets a bot
// play for anyone who stays offline in a public game.
function tick(now = Date.now()) {
  for (const room of [...rooms.values()]) {
    const g = room.game; let changed = false;
    if (g.phase === 'lobby' && room.public) {
      for (let i = g.players.length - 1; i >= 0; i--) {
        const p = g.players[i];
        if (!p.bot && !p.connected && now - (p.offlineSince || now) >= DROP_LOBBY_MS) { g.removePlayer(i); changed = true; }
      }
      if (changed && !g.players.some(p => !p.bot)) { destroyRoom(room); continue; }
    }
    if (g.ensureHost(now)) changed = true;
    if (room.public && (g.phase === 'setup' || g.phase === 'main')) {
      g.players.forEach((p, i) => { if (!p.bot && !p.connected && now - (p.offlineSince || now) >= TAKEOVER_MS && g.takeOver(i, 'offline')) changed = true; });
    }
    if (lobbyAuto(room, now)) changed = true;
    if (changed) broadcast(room, now);
  }
}

// Reports of chat messages. Google Play wants apps with chat to let players report messages; the developer then sees them in the
// server log ("REPORT {...}"), or from /api/admin/reports?key=... when ADMIN_KEY is set in the hosting settings.
const REPORT_REASONS = { harassment: 'Harassment or hate', sexual: 'Sexual or violent content', spam: 'Spam or advertising', personal: 'Personal information', cheating: 'Cheating', other: 'Something else' };
const reports = [], reportTimes = new Map(); let reportSeq = 0;

async function api(req, res, url) {
  const route = url.pathname;
  if (req.method === 'GET' && route === '/api/legal') return sendJson(res, 200, legal.bundle());
  if (req.method === 'POST' && route === '/api/report') {
    const body = await readBody(req);
    const room = rooms.get(String(body.code || '').toUpperCase());
    if (!room) throw new GameError('This room no longer exists.');
    const pi = room.game.indexOf(body.token);
    if (pi < 0) throw new GameError('You are not in this room.');
    const target = Number.isInteger(body.target) ? body.target : -1, reason = String(body.reason || ''), text = String(body.text || '').slice(0, 200);
    if (!REPORT_REASONS[reason]) throw new GameError('Choose a reason for the report.');
    if (target < 0 || target >= room.game.players.length || target === pi) throw new GameError('You cannot report that player.');
    if (!room.game.log.some(l => l.chat === target && l.text === text)) throw new GameError('That message is no longer in the chat.');
    const now = Date.now(), recentReports = (reportTimes.get(body.token) || []).filter(t => now - t < 60000);
    if (recentReports.length >= 5) throw new GameError('Too many reports in a minute. Please wait a little.');
    guard(req, 'report', 15, 60e3, 'Too many reports in a minute. Please wait a little.');
    recentReports.push(now); reportTimes.set(body.token, recentReports); if (reportTimes.size > 5000) reportTimes.clear();
    const entry = { id: ++reportSeq, at: new Date(now).toISOString(), room: room.game.code, reporter: room.game.players[pi].name, reported: room.game.players[target].name, reason, note: String(body.note || '').slice(0, 200), text };
    reports.push(entry); if (reports.length > 200) reports.shift();
    console.log('REPORT ' + JSON.stringify(entry));
    return sendJson(res, 200, { ok: true });
  }
  if (req.method === 'GET' && route === '/api/admin/reports') {
    const key = process.env.ADMIN_KEY || '', given = url.searchParams.get('key') || '';
    const ok = key && given.length === key.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(key));
    if (!ok) return sendJson(res, 404, { error: 'Not found' });
    return sendJson(res, 200, { reports });
  }
  if (req.method === 'GET' && route === '/api/rooms') {   // the public rooms anyone may join
    guard(req, 'list', 60, 60e3, 'Too many requests. Please wait a moment.');
    const list = openLobbies().sort((a, b) => b.game.players.length - a.game.players.length || a.createdAt - b.createdAt).slice(0, 30).map(roomCard);
    return sendJson(res, 200, { rooms: list });
  }
  if (req.method === 'POST' && route === '/api/quickplay') {   // join the fullest open public room, or open a new one
    const body = await readBody(req);
    guard(req, 'join', 40, 60e3, 'Too many attempts. Please wait a moment.');
    const name = cleanName(body.name), token = newToken();
    const open = openLobbies().sort((a, b) => b.game.players.length - a.game.players.length || a.createdAt - b.createdAt)[0];
    if (open) {
      open.game.addPlayer(uniqueName(open.game, name), token);
      broadcast(open);
      return sendJson(res, 200, { code: open.game.code, token, created: false, host: (hostOf(open.game) || {}).name || '' });
    }
    guard(req, 'create', 20, 3600e3, 'You have opened many rooms in the last hour. Please try again later.');
    const ip = checkCapacity(req), code = newCode();
    const { game } = makeGame(code, { preset: 'classic' }, undefined, 10);
    game.opts.timer = 30;
    game.addPlayer(name, token);
    rooms.set(code, newRoom(game, { pub: true, ip }));
    return sendJson(res, 200, { code, token, created: true });
  }
  if (req.method === 'GET' && route === '/api/maps') return sendJson(res, 200, { maps: maps.presetList() });

  if (req.method === 'GET' && route === '/api/preview') {
    const { game, seed } = makeGame('PREVIEW', { preset: url.searchParams.get('map') }, url.searchParams.get('seed'));
    return sendJson(res, 200, { seed, board: game.boardView() });
  }
  if (req.method === 'POST' && route === '/api/preview') {
    const body = await readBody(req);
    const { game, seed } = makeGame('PREVIEW', body.map, body.seed);
    return sendJson(res, 200, { seed, board: game.boardView() });
  }
  if (req.method === 'POST' && route === '/api/create') {
    const body = await readBody(req);
    guard(req, 'create', 20, 3600e3, 'You have opened many rooms in the last hour. Please try again later.');
    const name = cleanName(body.name), ip = checkCapacity(req), code = newCode(), token = newToken(), pub = body.public === true;
    const { game } = makeGame(code, body.map, body.seed, Number(body.vpTarget) || 10);
    if (pub) game.opts.timer = 30;   // strangers: the move clock is on unless the host turns it off
    game.addPlayer(name, token);
    rooms.set(code, newRoom(game, { pub, ip }));
    return sendJson(res, 200, { code, token });
  }
  if (req.method === 'POST' && route === '/api/join') {
    const body = await readBody(req);
    const code = String(body.code || '').trim().toUpperCase();
    guard(req, 'join', 40, 60e3, 'Too many attempts. Please wait a moment.');
    const badKey = 'badcode:' + clientIp(req);
    if (limits.enabled && recent(badKey, 600e3).length >= 10) throw tooMany('Too many wrong room codes. Please wait a few minutes.');
    const room = rooms.get(code);
    if (!room) { hit(badKey, 600e3); throw new GameError('No room with that code. Check the code and try again.'); }
    if (body.token && room.game.indexOf(body.token) >= 0) return sendJson(res, 200, { code, token: body.token });
    const token = newToken(), name = cleanName(body.name);
    room.game.addPlayer(room.public ? uniqueName(room.game, name) : name, token);
    broadcast(room);
    return sendJson(res, 200, { code, token });
  }
  if (req.method === 'POST' && route === '/api/leave') {
    const body = await readBody(req);
    const room = rooms.get(String(body.code || '').toUpperCase());
    if (room) {
      const pi = room.game.indexOf(body.token);
      if (pi >= 0 && room.game.phase === 'lobby') {
        room.game.removePlayer(pi);
        if (!room.game.players.some(p => !p.bot)) destroyRoom(room); else broadcast(room);
      } else if (pi >= 0 && room.public && room.game.takeOver(pi, 'left')) broadcast(room);   // leaving a public game: a bot plays on
    }
    return sendJson(res, 200, { ok: true });
  }
  if (req.method === 'POST' && route === '/api/action') {
    const body = await readBody(req);
    const room = rooms.get(String(body.code || '').toUpperCase());
    if (!room) throw new GameError('This room no longer exists.');
    const pi = room.game.indexOf(body.token);
    if (pi < 0) throw new GameError('You are not in this room.');
    if (body.action && body.action.type === 'setMap') {   // the host swaps the map in the waiting room
      const g = room.game;
      if (g.phase !== 'lobby') throw new GameError('The map cannot change after the game starts.');
      if (!g.isHost(pi)) throw new GameError('Only the host can choose the map.');
      const preset = String(body.action.preset || '');
      if (!maps.PRESETS[preset]) throw new GameError('Unknown map.');
      g.setMap(maps.generatePreset(preset, crypto.randomInt(1, 2 ** 31)));
      broadcast(room);
      return sendJson(res, 200, { ok: true, result: null });
    }
    let action = body.action;
    if (action && action.type === 'setPublic') {   // the host opens or closes the room to strangers
      const g = room.game;
      if (g.phase !== 'lobby') throw new GameError('This can only change in the waiting room.');
      if (!g.isHost(pi)) throw new GameError('Only the host can change who may join.');
      room.public = action.value === true; room.countdownAt = null; room.lastJoinAt = Date.now(); room.fillShown = false;
      g.addLog(room.public ? 'The room is now public.' : 'The room is now private. Only people with the code can join.'); g.version++;
      broadcast(room);
      return sendJson(res, 200, { ok: true, result: null });
    }
    if (action && action.type === 'chat') {
      if (limits.enabled) {
        const key = 'chat:' + body.token;
        if (recent(key, 10e3).length >= 6) throw tooMany('You are sending messages too quickly.');
        hit(key, 10e3);
      }
      if (room.public) {   // strangers: no links, and bad words are starred out
        const text = String(action.text || '').trim();
        if (LINK.test(text)) throw new GameError('Links are not allowed in public rooms.');
        action = { ...action, text: maskBlocked(text) };
      }
    }
    const result = room.game.act(pi, action);
    broadcast(room);
    return sendJson(res, 200, { ok: true, result: result || null });
  }
  if (req.method === 'GET' && route === '/api/events') {
    const room = rooms.get(String(url.searchParams.get('code') || '').toUpperCase());
    const token = url.searchParams.get('token');
    if (!room || room.game.indexOf(token) < 0) return sendJson(res, 404, { error: 'Room not found.' });
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 2000\n\n');
    res.write(`event: board\ndata: ${JSON.stringify(room.game.boardView())}\n\n`);
    if (!room.clients.has(token)) room.clients.set(token, new Set());
    room.clients.get(token).add(res);
    setConnected(room, token);
    { const pi = room.game.indexOf(token); if (room.game.players[pi].takenOver === 'offline') room.game.giveBack(pi); }   // back after a drop: take the seat back from the bot
    broadcast(room);
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => {
      clearInterval(ping);
      const set = room.clients.get(token);
      if (set) { set.delete(res); if (!set.size) room.clients.delete(token); }
      setConnected(room, token);
      if (rooms.has(room.game.code)) broadcast(room);
    });
    return;
  }
  sendJson(res, 404, { error: 'Not found.' });
}

// The real file can sit in a .well-known folder (where Android looks for it) or flat next to the server as
// assetlinks.json. The first one that actually has content wins; with neither, an empty list is served.
function readAssetLinks(dir, cb) {
  const files = [path.join(dir, '.well-known', 'assetlinks.json'), path.join(dir, 'assetlinks.json')];
  const next = i => {
    if (i >= files.length) return cb('[]');
    fs.readFile(files[i], 'utf8', (err, data) => (err || !data.trim() || data.trim() === '[]') ? next(i + 1) : cb(data));
  };
  next(0);
}

function serveStatic(req, res, url) {
  let p = url.pathname;
  if (p === '/.well-known/assetlinks.json') {   // Android app verification (Digital Asset Links)
    return readAssetLinks(PUBLIC, data => { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }); res.end(data); });
  }
  if (p === '/' || /^\/room\//.test(p)) p = '/index.html';
  if (!PUBLIC_FILES.has(p)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
  fs.readFile(path.join(PUBLIC, p), (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/healthz') { res.writeHead(200); return res.end('ok'); }
  if (url.pathname.startsWith('/api/')) {
    try { await api(req, res, url); }
    catch (e) {
      if (e instanceof GameError) sendJson(res, e.status || 400, { error: e.message });
      else { console.error(e); sendJson(res, 500, { error: 'Something went wrong on the server.' }); }
    }
    return;
  }
  if (req.method === 'GET' && (url.pathname === '/terms' || url.pathname === '/privacy')) {   // public pages for the Play listing
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    return res.end(url.pathname === '/terms' ? legal.termsPage() : legal.privacyPage());
  }
  serveStatic(req, res, url);
});

// Drop idle rooms: no one connected for 30 min, or untouched for 6 hours.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const idle = now - room.touched;
    const emptyPublic = room.public && room.game.phase !== 'ended' && !room.game.players.some(p => !p.bot && p.connected) && idle > 5 * 60e3;   // everyone left a public game
    if ((room.clients.size === 0 && idle > 30 * 60e3) || idle > 6 * 3600e3 || emptyPublic) destroyRoom(room);
  }
  for (const [k, a] of hits) if (!a.length || now - a[a.length - 1] > 3600e3) hits.delete(k);
  if (hits.size > 50000) hits.clear();
}, 60e3).unref();
setInterval(() => { try { tick(); } catch (e) { console.error('tick error', e); } }, 1000).unref();

if (require.main === module) server.listen(PORT, () => console.log(`Hexlands running on http://localhost:${PORT}`));
module.exports = { server, rooms, readAssetLinks, reports, tick, limits, clientIp, cleanName, hasBlocked, maskBlocked, hits };
