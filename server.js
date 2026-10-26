'use strict';
// Hexlands server: zero dependencies. Static files + JSON API + Server-Sent Events.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Game, GameError } = require('./game');
const maps = require('./maps');

const PORT = process.env.PORT || 3000;
const PUBLIC = __dirname;
const PUBLIC_FILES = new Set(['/index.html', '/app.js', '/art.js', '/style.css']);
const rooms = new Map(); // code -> { game, clients: Map<token, Set<res>>, touched }
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

function newCode() {
  for (;;) {
    let c = ''; for (let i = 0; i < 5; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}
const newToken = () => crypto.randomBytes(16).toString('hex');

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

function broadcast(room) {
  room.touched = Date.now();
  for (const [token, set] of room.clients) {
    const pi = room.game.indexOf(token);
    if (pi < 0) { for (const r of set) r.end(); room.clients.delete(token); continue; }
    const msg = `event: state\ndata: ${JSON.stringify(room.game.view(pi))}\n\n`;
    for (const r of set) r.write(msg);
  }
}
function setConnected(room, token) {
  const pi = room.game.indexOf(token);
  if (pi < 0) return;
  const was = room.game.players[pi].connected;
  const now = !!(room.clients.get(token) && room.clients.get(token).size);
  if (was !== now) { room.game.players[pi].connected = now; room.game.version++; }
}

async function api(req, res, url) {
  const route = url.pathname;
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
    const code = newCode(), token = newToken();
    const { game } = makeGame(code, body.map, body.seed, Number(body.vpTarget) || 10);
    game.addPlayer(body.name, token);
    rooms.set(code, { game, clients: new Map(), touched: Date.now() });
    return sendJson(res, 200, { code, token });
  }
  if (req.method === 'POST' && route === '/api/join') {
    const body = await readBody(req);
    const code = String(body.code || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) throw new GameError('No room with that code. Check the code and try again.');
    if (body.token && room.game.indexOf(body.token) >= 0) return sendJson(res, 200, { code, token: body.token });
    const token = newToken();
    room.game.addPlayer(body.name, token);
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
        if (!room.game.players.length) rooms.delete(room.game.code); else broadcast(room);
      }
    }
    return sendJson(res, 200, { ok: true });
  }
  if (req.method === 'POST' && route === '/api/action') {
    const body = await readBody(req);
    const room = rooms.get(String(body.code || '').toUpperCase());
    if (!room) throw new GameError('This room no longer exists.');
    const pi = room.game.indexOf(body.token);
    if (pi < 0) throw new GameError('You are not in this room.');
    const result = room.game.act(pi, body.action);
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

function serveStatic(req, res, url) {
  let p = url.pathname;
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
      if (e instanceof GameError) sendJson(res, 400, { error: e.message });
      else { console.error(e); sendJson(res, 500, { error: 'Something went wrong on the server.' }); }
    }
    return;
  }
  serveStatic(req, res, url);
});

// Drop idle rooms: no one connected for 30 min, or untouched for 6 hours.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const idle = now - room.touched;
    if ((room.clients.size === 0 && idle > 30 * 60e3) || idle > 6 * 3600e3) rooms.delete(code);
  }
}, 60e3).unref();

if (require.main === module) server.listen(PORT, () => console.log(`Hexlands running on http://localhost:${PORT}`));
module.exports = { server, rooms };
