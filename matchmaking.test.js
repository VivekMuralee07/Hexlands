'use strict';
process.env.BOT_DELAY_MS = '0';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { Game } = require('./game');
const maps = require('./maps');
const { server, rooms, tick, limits, clientIp, hits } = require('./server');

let base;
test.before(() => new Promise(r => server.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
test.after(() => { server.closeAllConnections(); server.close(); });
test.beforeEach(() => { limits.enabled = false; hits.clear(); rooms.clear(); });

const post = async (p, body, headers = {}) => { const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
const get = async (p, headers = {}) => { const r = await fetch(base + p, { headers }); return { status: r.status, body: await r.json() }; };
const act = (code, token, action) => post('/api/action', { code, token, action });
// People "connected" without opening a live stream: enough for the lobby logic.
const online = (code, token, on = true) => { const g = rooms.get(code).game, p = g.players[g.indexOf(token)]; p.connected = on; p.offlineSince = on ? null : Date.now(); };
function listen(code, token) {
  const req = http.get(`${base}/api/events?code=${code}&token=${token}`, res => { res.resume(); });
  return { close: () => req.destroy() };
}
const wait = ms => new Promise(r => setTimeout(r, ms));
async function publicRoom(name = 'Hosty', extra = {}) {
  const c = await post('/api/create', { name, map: { preset: 'classic' }, public: true, ...extra });
  online(c.body.code, c.body.token);
  return c.body;
}
async function joinPublic(code, name) { const j = await post('/api/join', { code, name }); online(code, j.body.token); return j.body; }
const later = ms => Date.now() + ms;

// ---------- the game engine ----------
const mk = () => new Game({ code: 'TEST', map: maps.generatePreset('classic', 4), rng: maps.makeRng(4) });
function startedGame(n = 2) {
  const g = mk(); for (let i = 0; i < n; i++) g.addPlayer('P' + i, 't' + i);
  g.players.forEach(p => { p.connected = true; p.offlineSince = null; });
  return g;
}
function finishSetup(g) {
  while (g.phase === 'setup') {
    const pi = g.turn, v = g.validSettlements(pi, false)[0];
    g.act(pi, { type: 'settle', vertex: v });
    g.act(pi, { type: 'road', edge: g.board.vertices[v].edges.find(e => g.roads[e] === undefined) });
  }
}

test('ready: humans tick it, bots cannot, and changing the map or options clears everyone', () => {
  const g = startedGame(2);
  g.act(1, { type: 'ready', value: true });
  assert.equal(g.view(0).players[1].ready, true); assert.equal(g.view(0).players[0].ready, false);
  g.act(0, { type: 'addBot', level: 'easy' });
  assert.equal(g.view(0).players[2].ready, true, 'bots always count as ready');
  assert.throws(() => g.act(2, { type: 'ready', value: true }), /Bots|not in this game/);
  g.act(0, { type: 'setOptions', opts: { timer: 15 } });
  assert.equal(g.players[1].ready, false, 'a changed option clears the tick');
  g.act(1, { type: 'ready', value: true }); g.setMap(maps.generatePreset('japan', 1));
  assert.equal(g.players[1].ready, false, 'a new map clears it too');
});

test('fill with bots: the host fills every empty seat, nobody else may', () => {
  const g = startedGame(1);
  g.addPlayer('P1', 't1');
  assert.throws(() => g.act(1, { type: 'fillBots' }), /host/);
  g.act(0, { type: 'fillBots', level: 'hard' });
  assert.equal(g.players.length, 4); assert.deepEqual(g.players.map(p => p.bot), [null, null, 'hard', 'hard']);
  assert.throws(() => g.act(0, { type: 'fillBots' }), /taken/);
});

test('the host role passes on when the host stays offline, but not on a short blip or to nobody', () => {
  const g = startedGame(3); const now = Date.now();
  assert.equal(g.ensureHost(now), false, 'host is connected');
  g.players[0].connected = false; g.players[0].offlineSince = now - 5000;
  assert.equal(g.ensureHost(now), false, 'a short drop keeps the role');
  g.players[0].offlineSince = now - 25000;
  assert.equal(g.ensureHost(now), true); assert.equal(g.hostToken, 't1'); assert.ok(g.view(1).players[1].host && !g.view(1).players[0].host);
  assert.ok(g.log.some(l => /P1 is now the host/.test(l.text)));
  g.players[1].connected = false; g.players[2].connected = false; g.players[1].offlineSince = g.players[2].offlineSince = now - 99000;
  assert.equal(g.ensureHost(now), false, 'no human is connected, so the role stays');
});

test('a bot plays for someone who left or dropped; they get the seat back, and chat still works meanwhile', () => {
  const g = startedGame(2); g.act(0, { type: 'start' }); finishSetup(g);
  const quiet = g.turn === 0 ? 1 : 0;
  assert.equal(g.takeOver(quiet, 'offline'), true);
  assert.equal(g.players[quiet].bot, 'medium'); assert.equal(g.view(0).players[quiet].takenOver, 'offline');
  assert.throws(() => g.act(quiet, { type: 'roll' }), /bot is playing for you/);
  g.act(quiet, { type: 'chat', text: 'back soon' });
  assert.equal(g.takeOver(quiet, 'left'), false, 'already covered');
  g.act(quiet, { type: 'reclaim' });
  assert.equal(g.players[quiet].bot, null); assert.equal(g.players[quiet].takenOver, null);
  assert.throws(() => g.act(quiet, { type: 'reclaim' }), /not playing/);
  const lobbyGame = startedGame(2); assert.equal(lobbyGame.takeOver(0, 'left'), false, 'only in a running game');
});

test('two missed move clocks in a row hand the seat to a bot; acting in between resets the count', () => {
  const g = startedGame(2); g.opts.timer = 15; g.act(0, { type: 'start' }); finishSetup(g);
  const t = g.turn, o = 1 - t;
  g.clockAt = Date.now() - 16000; g.forcedDice = [[1, 2]]; g.timeout();
  assert.equal(g.players[t].idle, 1); assert.equal(g.players[t].bot, null);
  g.act(t, { type: 'chat', text: 'hi' }); assert.equal(g.players[t].idle, 1, 'chatting is not playing');
  g.clockAt = Date.now() - 16000; g.timeout();
  assert.equal(g.players[t].takenOver, 'idle', 'a second miss: a bot takes over'); assert.equal(g.players[t].bot, 'medium');
  assert.equal(g.turn, o); assert.equal(g.players[o].idle, 0);
  const h = startedGame(2); h.opts.timer = 15; h.act(0, { type: 'start' }); finishSetup(h);
  const u = h.turn; h.clockAt = Date.now() - 16000; h.forcedDice = [[1, 2]]; h.timeout();
  h.act(u, { type: 'endTurn' }); assert.equal(h.players[u].idle, 0, 'a real move clears the count');
});

// ---------- rooms, the list and Quick play ----------
test('public rooms are listed with their details; private, full, started and abandoned rooms are not', async () => {
  const pub = await publicRoom('Ann', { vpTarget: 12 });
  const priv = await post('/api/create', { name: 'Pat', map: { preset: 'classic' } }); online(priv.body.code, priv.body.token);
  const ghost = await post('/api/create', { name: 'Gus', map: { preset: 'classic' }, public: true });   // nobody connected
  const list = (await get('/api/rooms')).body.rooms;
  assert.equal(list.length, 1);
  assert.deepEqual(list[0], { code: pub.code, host: 'Ann', map: 'Classic Island', vp: 12, timer: 30, players: 1, max: 4, bots: 0 });
  assert.equal(rooms.get(pub.code).game.opts.timer, 30, 'public rooms start with the move timer on');
  assert.equal(rooms.get(priv.body.code).game.opts.timer, 0);
  for (const n of ['B', 'C', 'D']) await joinPublic(pub.code, n);
  assert.equal((await get('/api/rooms')).body.rooms.length, 0, 'a full room has no free seat');
  const g = rooms.get(pub.code).game; g.players.pop(); online(ghost.body.code, ghost.body.token);
  assert.equal((await get('/api/rooms')).body.rooms.length, 2);
  g.act(0, { type: 'start' });
  assert.equal((await get('/api/rooms')).body.rooms.length, 1, 'started rooms drop off the list');
});

test('Quick play: opens a public room, then fills the fullest open one, and a fifth person opens another', async () => {
  const a = (await post('/api/quickplay', { name: 'Ann' })).body; assert.equal(a.created, true);
  online(a.code, a.token);
  assert.equal(rooms.get(a.code).public, true); assert.equal(rooms.get(a.code).game.opts.timer, 30);
  const b = (await post('/api/quickplay', { name: 'Ann' })).body;   // same name: quietly becomes "Ann 2"
  assert.deepEqual([b.created, b.code, b.host], [false, a.code, 'Ann']); online(a.code, b.token);
  assert.deepEqual(rooms.get(a.code).game.players.map(p => p.name), ['Ann', 'Ann 2']);
  const other = await publicRoom('Zed'); await joinPublic(other.code, 'Y'); await joinPublic(other.code, 'X');   // 3 of 4
  const c = (await post('/api/quickplay', { name: 'Cy' })).body;
  assert.equal(c.code, other.code, 'the fuller room first'); online(c.code, c.token);
  const d = (await post('/api/quickplay', { name: 'Di' })).body; assert.equal(d.code, a.code); online(d.code, d.token);
  await post('/api/quickplay', { name: 'Ed' });   // joins Ann's room (4th)
  const f = (await post('/api/quickplay', { name: 'Flo' })).body; assert.equal(f.created, true, 'everything is full: a new room');
  assert.notEqual(f.code, a.code);
});

test('names: empty becomes "Player 1234", odd characters go, bad words and staff names are refused', async () => {
  const e = await post('/api/create', { name: '   ', map: { preset: 'classic' } });
  assert.match(rooms.get(e.body.code).game.players[0].name, /^Player \d{4}$/);
  const odd = await post('/api/create', { name: '\u202eAl\u200bex\u0007   Smith the Great', map: { preset: 'classic' } });
  assert.equal(rooms.get(odd.body.code).game.players[0].name, 'Alex Smith the G');
  for (const bad of ['sh1t', 'F u c k'.replace(/ /g, ''), 'Admin Sam', 'hexlands']) assert.equal((await post('/api/create', { name: bad, map: { preset: 'classic' } })).status, 400, bad);
  assert.equal((await post('/api/create', { name: 'Scunthorpe', map: { preset: 'classic' } })).status, 200);
  assert.equal((await post('/api/quickplay', { name: 'nazi' })).status, 400);
});

test('the host can open or close a room to strangers, and only the host', async () => {
  const c = (await post('/api/create', { name: 'Hosty', map: { preset: 'classic' } })).body; online(c.code, c.token);
  const g = (await post('/api/join', { code: c.code, name: 'Guest' })).body;
  assert.equal((await get('/api/rooms')).body.rooms.length, 0);
  assert.equal((await act(c.code, g.token, { type: 'setPublic', value: true })).status, 400);
  assert.equal((await act(c.code, c.token, { type: 'setPublic', value: true })).status, 200);
  assert.equal((await get('/api/rooms')).body.rooms.length, 1);
  assert.equal((await act(c.code, c.token, { type: 'setPublic', value: false })).status, 200);
  assert.equal((await get('/api/rooms')).body.rooms.length, 0);
});

// ---------- the waiting room: ready, countdown, bots, drop-outs ----------
test('a full table that is all ready starts after a 5 second countdown; unticking cancels it', async () => {
  const h = await publicRoom('Hosty'), room = rooms.get(h.code), g = room.game;
  const guests = []; for (const n of ['B', 'C']) guests.push(await joinPublic(h.code, n));
  await act(h.code, h.token, { type: 'addBot', level: 'medium' });
  assert.equal(g.players.length, 4);
  for (const x of [h, ...guests]) await act(h.code, x.token, { type: 'ready', value: true });
  assert.ok(room.countdownAt, 'the countdown began'); assert.ok(g.phase === 'lobby');
  await act(h.code, guests[0].token, { type: 'ready', value: false });
  assert.equal(room.countdownAt, null, 'someone un-readied: cancelled');
  await act(h.code, guests[0].token, { type: 'ready', value: true });
  tick(later(2000)); assert.equal(g.phase, 'lobby', 'not yet');
  tick(later(6000)); assert.equal(g.phase, 'setup', 'started on its own');
  assert.equal(room.countdownAt, null);
});

test('not full, or someone still unready: no countdown. The fill-with-bots prompt appears after a minute alone', async () => {
  const h = await publicRoom('Hosty'), room = rooms.get(h.code);
  await act(h.code, h.token, { type: 'ready', value: true });
  tick(later(1000)); assert.equal(room.countdownAt, null, 'one player is not a table');
  const net = () => { const l = listen(h.code, h.token); return l; };
  assert.ok(rooms.get(h.code).game.players.length === 1);
  const sent = []; const fake = { write: m => sent.push(m), end() {} }; room.clients.set(h.token, new Set([fake]));
  tick(later(30e3)); assert.equal(room.fillShown, false);
  tick(later(61e3)); assert.equal(room.fillShown, true, 'a minute without anyone joining');
  const last = JSON.parse(/event: state\ndata: (.*)\n/.exec(sent[sent.length - 1])[1]);
  assert.equal(last.net.public, true); assert.equal(last.net.fillIn, 0); assert.equal(last.net.countdown, null);
  assert.equal((await act(h.code, h.token, { type: 'fillBots' })).status, 200);
  assert.equal(room.game.players.length, 4); assert.equal(room.fillShown, false, 'the prompt resets when the table changes');
  void net;
});

test('people who vanish from a public waiting room lose their seat; the host role moves on; an empty room closes', async () => {
  const h = await publicRoom('Hosty'), b = await joinPublic(h.code, 'Bea'), room = rooms.get(h.code), g = room.game;
  online(h.code, h.token, false);
  tick(later(10e3)); assert.equal(g.players.length, 2, 'ten seconds is a blip');
  assert.equal(g.hostToken, h.token);
  tick(later(25e3)); assert.equal(g.hostToken, b.token, 'host role passed on');
  assert.equal(g.players.length, 2, 'not yet dropped');
  tick(later(40e3)); assert.deepEqual(g.players.map(p => p.name), ['Bea'], 'the missing host lost the seat');
  online(h.code, b.token, false); tick(later(90e3));
  assert.equal(rooms.has(h.code), false, 'nobody left: the room is gone');
  const pr = await post('/api/create', { name: 'Pat', map: { preset: 'classic' } }); tick(later(300e3));
  assert.equal(rooms.has(pr.body.code), true, 'private waiting rooms are left alone');
});

test('leaving the waiting room hands the host role to the next person at once', async () => {
  const h = await publicRoom('Hosty'), b = await joinPublic(h.code, 'Bea');
  await post('/api/leave', { code: h.code, token: h.token });
  assert.equal(rooms.get(h.code).game.hostToken, b.token);
});

// ---------- games with strangers ----------
async function startedPublic() {
  const h = await publicRoom('Hosty'), b = await joinPublic(h.code, 'Bea'), room = rooms.get(h.code);
  assert.equal((await act(h.code, h.token, { type: 'start' })).status, 200);
  return { h, b, room, g: room.game };
}
test('in a public game a bot plays for someone offline for 45 seconds, and they get the seat back when they return', async () => {
  const { h, b, room, g } = await startedPublic();
  online(h.code, b.token, false);
  tick(later(30e3)); assert.equal(g.players[g.indexOf(b.token)].bot, null);
  tick(later(50e3));
  const seat = g.players[g.indexOf(b.token)];
  assert.equal(seat.bot, 'medium'); assert.equal(seat.takenOver, 'offline');
  const live = listen(h.code, b.token); await wait(150);
  assert.equal(seat.bot, null, 'reconnecting returns control'); assert.equal(seat.takenOver, null);
  live.close(); void room;
});

test('a bot also takes over from a player who leaves a public game on purpose, who does not get automatic control back', async () => {
  const { h, b, g } = await startedPublic();
  await post('/api/leave', { code: h.code, token: b.token });
  const seat = g.players[g.indexOf(b.token)];
  assert.equal(seat.takenOver, 'left');
  const live = listen(h.code, b.token); await wait(150);
  assert.equal(seat.takenOver, 'left', 'a deliberate leave is not undone by reconnecting'); live.close();
});

test('private games are never taken over by bots when someone is offline', async () => {
  const c = (await post('/api/create', { name: 'Hosty', map: { preset: 'classic' } })).body, j = (await post('/api/join', { code: c.code, name: 'Bea' })).body;
  online(c.code, c.token); online(c.code, j.token);
  await act(c.code, c.token, { type: 'start' }); online(c.code, j.token, false);
  tick(later(120e3));
  assert.ok(rooms.get(c.code).game.players.every(p => !p.bot));
});

test('in a running game the host role also moves to a connected human when the host stays offline', async () => {
  const { h, b, g } = await startedPublic();
  online(h.code, h.token, false); tick(later(25e3));
  assert.equal(g.hostToken, b.token);
});

// ---------- chat with strangers ----------
test('public chat: links are refused, bad words are starred out, and private rooms are left as typed', async () => {
  const h = await publicRoom('Hosty'), say = (token, text, code = h.code) => act(code, token, { type: 'chat', text });
  assert.equal((await say(h.token, 'visit www.spam.com now')).status, 400);
  assert.equal((await say(h.token, 'join https://x.example/')).status, 400);
  assert.equal((await say(h.token, 'you are a sh1t player, ok')).status, 200);
  assert.equal((await say(h.token, 'good game, Scunthorpe fans')).status, 200);
  const texts = rooms.get(h.code).game.log.filter(l => l.chat !== undefined).map(l => l.text);
  assert.deepEqual(texts, ['you are a **** player, ok', 'good game, Scunthorpe fans']);
  const p = (await post('/api/create', { name: 'Pat', map: { preset: 'classic' } })).body;
  assert.equal((await say(p.token, 'see www.fine.com', p.code)).status, 200);
});

// ---------- limits ----------
test('limits: more than six chat messages in ten seconds are refused', async () => {
  limits.enabled = true;
  const c = (await post('/api/create', { name: 'Chatty', map: { preset: 'classic' } }, { 'cf-connecting-ip': '203.0.113.1' })).body;
  const results = []; for (let i = 0; i < 7; i++) results.push(await act(c.code, c.token, { type: 'chat', text: 'hi ' + i }));
  assert.deepEqual(results.map(r => r.status), [200, 200, 200, 200, 200, 200, 429]);
  assert.match(results[6].body.error, /too quickly/);
});

test('limits: the sixth room from one address is refused, other addresses are unaffected', async () => {
  limits.enabled = true;
  const ip = n => ({ 'cf-connecting-ip': '198.51.100.' + n });
  for (let i = 0; i < 5; i++) assert.equal((await post('/api/create', { name: 'R' + i, map: { preset: 'classic' } }, ip(1))).status, 200);
  const sixth = await post('/api/create', { name: 'R5', map: { preset: 'classic' } }, ip(1));
  assert.equal(sixth.status, 429); assert.match(sixth.body.error, /several rooms/);
  assert.equal((await post('/api/create', { name: 'Other', map: { preset: 'classic' } }, ip(2))).status, 200);
});

test('limits: twenty rooms an hour; guessing room codes locks the address out for a while', async () => {
  limits.enabled = true;
  const ip = n => ({ 'cf-connecting-ip': '192.0.2.' + n });
  for (let i = 0; i < 20; i++) { const r = await post('/api/create', { name: 'R', map: { preset: 'classic' } }, ip(7)); rooms.delete(r.body.code); }
  const over = await post('/api/create', { name: 'R', map: { preset: 'classic' } }, ip(7)); assert.equal(over.status, 429); assert.match(over.body.error, /many rooms/);
  const live = await post('/api/create', { name: 'Real', map: { preset: 'classic' } }, ip(8));
  for (let i = 0; i < 10; i++) assert.equal((await post('/api/join', { code: 'ZZZZ' + i, name: 'G' }, ip(9))).status, 400);
  const locked = await post('/api/join', { code: live.body.code, name: 'G' }, ip(9));
  assert.equal(locked.status, 429); assert.match(locked.body.error, /wrong room codes/);
  assert.equal((await post('/api/join', { code: live.body.code, name: 'G' }, ip(10))).status, 200, 'someone else can still join');
});

test('limits: the address comes from the Cloudflare header first, then x-forwarded-for', () => {
  const req = headers => ({ headers, socket: { remoteAddress: '10.0.0.1' } });
  assert.equal(clientIp(req({ 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9, 5.5.5.5' })), '1.2.3.4');
  assert.equal(clientIp(req({ 'x-forwarded-for': 'fake, 6.6.6.6, 10.1.1.1' })), '6.6.6.6', 'second to last: the proxy appended the real visitor before itself');
  assert.equal(clientIp(req({ 'x-forwarded-for': '7.7.7.7' })), '7.7.7.7');
  assert.equal(clientIp(req({})), '10.0.0.1');
});

test('the terms and privacy policy describe public rooms, bots standing in, and address use', () => {
  const legal = require('./legal'), t = legal.terms(), p = legal.privacy();
  assert.match(t, /public room/i); assert.match(t, /bot/i); assert.match(p, /IP address/); assert.match(p, /public room/i);
});
