'use strict';
process.env.BOT_DELAY_MS = '0';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { server, rooms } = require('./server');

let base;
test.before(() => new Promise(r => server.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
test.after(() => { server.closeAllConnections(); server.close(); });

const post = async (p, body) => { const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };

function listen(code, token) {
  const events = [];
  let waiters = [];
  const req = http.get(`${base}/api/events?code=${code}&token=${token}`, res => {
    let buf = '';
    res.on('data', d => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = /event: (\w+)/.exec(chunk), data = /data: (.*)/.exec(chunk);
        if (ev && data) { events.push({ type: ev[1], data: JSON.parse(data[1]) }); waiters = waiters.filter(w => !w()); }
      }
    });
  });
  return {
    events, close: () => req.destroy(),
    last: type => [...events].reverse().find(e => e.type === type)?.data,
    waitFor: pred => new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('timeout')), 3000);
      const check = () => { const s = [...events].reverse().find(e => e.type === 'state'); if (s && pred(s.data)) { clearTimeout(t); res(s.data); return true; } return false; };
      if (!check()) waiters.push(check);
    }),
  };
}

test('static files and SPA routes', async () => {
  for (const p of ['/', '/room/ABCDE', '/app.js', '/art.js', '/style.css']) {
    const r = await fetch(base + p); assert.equal(r.status, 200, p); await r.text();
  }
  for (const p of ['/server.js', '/game.js', '/maps.js', '/package.json', '/render.yaml', '/README.md', '/..%2fserver.js']) {
    const x = await fetch(base + p); assert.equal(x.status, 404, p); await x.text();
  }
  assert.equal((await fetch(base + '/healthz')).status, 200);
});

test('map list and previews', async () => {
  const maps = await (await fetch(base + '/api/maps')).json();
  assert.ok(maps.maps.length >= 8);
  for (const m of maps.maps) {
    const p = await (await fetch(`${base}/api/preview?map=${m.key}&seed=5`)).json();
    const q = await (await fetch(`${base}/api/preview?map=${m.key}&seed=5`)).json();
    assert.deepEqual(p.board, q.board, 'preview reproducible: ' + m.key);
  }
  const bad = await post('/api/preview', { map: { tiles: [{ q: 0, r: 0, terrain: 'forest' }] } });
  assert.equal(bad.status, 400); assert.match(bad.body.error, /at least 7/);
});

test('full room lifecycle over HTTP with live updates', async () => {
  const preview = await (await fetch(`${base}/api/preview?map=japan&seed=77`)).json();
  const c = await post('/api/create', { name: 'Vivek', map: { preset: 'japan' }, seed: 77, vpTarget: 10 });
  assert.equal(c.status, 200); assert.match(c.body.code, /^[A-Z0-9]{5}$/);
  const code = c.body.code;
  const host = listen(code, c.body.token);
  await host.waitFor(s => s.phase === 'lobby' && s.players.length === 1);
  assert.deepEqual(host.last('board').tiles, preview.board.tiles, 'room uses the previewed board');

  assert.equal((await post('/api/join', { code: 'ZZZZZ', name: 'X' })).status, 400);
  assert.match((await post('/api/join', { code, name: 'vivek' })).body.error, /taken/);
  const j1 = await post('/api/join', { code: code.toLowerCase(), name: 'Asha' });
  const j2 = await post('/api/join', { code, name: 'Ravi' });
  const again = await post('/api/join', { code, name: 'Asha', token: j1.body.token });
  assert.equal(again.body.token, j1.body.token, 'rejoin keeps your seat');
  const a = listen(code, j1.body.token), b = listen(code, j2.body.token);
  await host.waitFor(s => s.players.length === 3 && s.players.every(p => p.connected));

  // Leaving and rejoining in the lobby.
  await post('/api/leave', { code, token: j2.body.token });
  await host.waitFor(s => s.players.length === 2);
  b.close();
  const j3 = await post('/api/join', { code, name: 'Ravi' });
  const b2 = listen(code, j3.body.token);
  await host.waitFor(s => s.players.length === 3);

  const notHost = await post('/api/action', { code, token: j1.body.token, action: { type: 'start' } });
  assert.equal(notHost.status, 400); assert.match(notHost.body.error, /host/);
  assert.equal((await post('/api/action', { code, token: c.body.token, action: { type: 'start' } })).status, 200);
  await host.waitFor(s => s.phase === 'setup');

  const g = rooms.get(code).game;
  const tokens = [c.body.token, j1.body.token, j3.body.token];
  const tokenOf = pi => g.players[pi].token;
  const send = (pi, action) => post('/api/action', { code, token: tokenOf(pi), action });

  // Wrong player is rejected.
  const wrong = await send((g.turn + 1) % 3, { type: 'settle', vertex: 0 });
  assert.equal(wrong.status, 400); assert.match(wrong.body.error, /not your turn/);

  while (g.phase === 'setup') {
    const pi = g.turn, v = g.validSettlements(pi, false)[0];
    assert.equal((await send(pi, { type: 'settle', vertex: v })).status, 200);
    assert.equal((await send(pi, { type: 'road', edge: g.board.vertices[v].edges.find(e => g.roads[e] === undefined) })).status, 200);
  }
  const st = await host.waitFor(s => s.phase === 'main');
  assert.equal(Object.keys(st.buildings).length, 6);

  // Each client sees only its own hand.
  const views = [host, a, b2].map(l => l.last('state'));
  views.forEach(v => { assert.ok(v.me.res); v.players.forEach((p, i) => { if (i !== v.you) assert.equal(p.res, undefined); }); });
  assert.ok(tokens.every(t => g.indexOf(t) >= 0));

  // Play a few turns through the API.
  for (let turn = 0; turn < 6; turn++) {
    const pi = g.turn;
    assert.equal((await send(pi, { type: 'roll' })).status, 200);
    for (const k of Object.keys(g.pendingDiscards)) {
      const need = g.pendingDiscards[k], p = g.players[k].res, res = {};
      let left = need; for (const r of ['wood', 'brick', 'sheep', 'wheat', 'ore']) { const n = Math.min(p[r], left); if (n) res[r] = n; left -= n; }
      assert.equal((await send(+k, { type: 'discard', res })).status, 200);
    }
    if (g.subphase === 'robber') {
      const tile = (g.robber + 1) % g.board.tiles.length;
      assert.equal((await send(pi, { type: 'robber', tile, victim: g.robberVictims(pi, tile)[0] })).status, 200);
    }
    const end = await send(pi, { type: 'endTurn' });
    assert.equal(end.status, 200, end.body.error);
  }
  const later = await host.waitFor(s => s.turnNumber === 7);
  assert.ok(later.log.length > 10);

  // Bad input never crashes the server.
  for (const action of [null, {}, { type: 'nope' }, { type: 'road', edge: 99999 }, { type: 'settle', vertex: -4 }, { type: 'robber', tile: 'x' }, { type: 'discard', res: { wood: -3 } }, { type: 'offer', give: { wood: 1e9 }, get: { ore: 1 } }]) {
    const r = await send(g.turn, action);
    assert.equal(r.status, 400, JSON.stringify(action));
  }
  const junk = await fetch(base + '/api/action', { method: 'POST', body: '{not json' });
  assert.equal(junk.status, 400);

  // Disconnect is reflected live.
  a.close();
  await host.waitFor(s => s.players[g.indexOf(j1.body.token)].connected === false);
  host.close(); b2.close();
});

test('events for unknown room return 404', async () => {
  const r = await fetch(`${base}/api/events?code=QQQQQ&token=x`);
  assert.equal(r.status, 404); await r.text();
});

test('custom map room', async () => {
  const tiles = [];
  const ter = ['forest', 'hills', 'pasture', 'fields', 'mountains', 'desert', 'forest', 'fields', 'pasture', 'hills'];
  ter.forEach((t, i) => tiles.push({ q: i % 5, r: Math.floor(i / 5), terrain: t, number: t === 'desert' ? null : (i === 0 ? 6 : null) }));
  const c = await post('/api/create', { name: 'Maker', map: { tiles } });
  assert.equal(c.status, 200);
  const g = rooms.get(c.body.code).game;
  assert.equal(g.board.tiles.length, 10);
  assert.equal(g.board.tiles[0].number, 6);
  assert.ok(g.board.tiles.every(t => t.terrain === 'desert' ? t.number === null : t.number >= 2));
  const bad = await post('/api/create', { name: 'Maker', map: { tiles: tiles.map(t => ({ ...t, number: 7 })) } });
  assert.equal(bad.status, 400);
});

test('bots play live through the server while a human plays over HTTP', async () => {
  const bots = require('./bots');
  const c = await post('/api/create', { name: 'Vivek', map: { preset: 'classic' }, seed: 31, vpTarget: 8 });
  const code = c.body.code, token = c.body.token;
  const h = listen(code, token);
  await h.waitFor(s => s.players.length === 1);
  for (const level of ['easy', 'medium', 'hard']) assert.equal((await post('/api/action', { code, token, action: { type: 'addBot', level } })).status, 200);
  assert.match((await post('/api/action', { code, token, action: { type: 'addBot', level: 'easy' } })).body.error, /seats/);
  const lobby = await h.waitFor(s => s.players.length === 4);
  assert.deepEqual(lobby.players.map(p => p.bot), [null, 'easy', 'medium', 'hard']);
  assert.match((await post('/api/join', { code, name: 'Late' })).body.error, /full/);
  await post('/api/action', { code, token, action: { type: 'start' } });
  const g = rooms.get(code).game;
  const me = () => g.indexOf(token);
  // The human uses the medium brain over HTTP; bots run on the server's own timers.
  const deadline = Date.now() + 60000;
  while (g.phase !== 'ended' && Date.now() < deadline) {
    const mine = (g.turn === me() && g.phase !== 'lobby') || (g.subphase === 'discard' && g.pendingDiscards[me()]);
    const waitingOnBots = bots.nextActor(g);
    if (mine && !(g.subphase === 'discard' && !g.pendingDiscards[me()]) && !(g.trade && waitingOnBots)) {
      if (g.trade && g.trade.from === me()) { await post('/api/action', { code, token, action: { type: 'cancelTrade' } }); continue; }
      const r = await post('/api/action', { code, token, action: bots.decide(g, me(), 'medium') });
      assert.equal(r.status, 200, r.body.error);
    } else await new Promise(r => setTimeout(r, 5));
  }
  assert.equal(g.phase, 'ended', 'game finished');
  const end = await h.waitFor(s => s.phase === 'ended');
  assert.ok(end.players.every(p => p.stats && p.res), 'final stats and hands revealed');
  assert.equal(end.diceCounts.length, 13);
  h.close();
});

test('host leaving a lobby with only bots closes the room', async () => {
  const c = await post('/api/create', { name: 'Solo', map: { preset: 'classic' } });
  await post('/api/action', { code: c.body.code, token: c.body.token, action: { type: 'addBot', level: 'easy' } });
  await post('/api/leave', { code: c.body.code, token: c.body.token });
  assert.equal(rooms.has(c.body.code), false);
});
