'use strict';
process.env.BOT_DELAY_MS = '0';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { server, rooms, reports } = require('./server');

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
  for (const p of ['/server.js', '/game.js', '/maps.js', '/legal.js', '/package.json', '/render.yaml', '/README.md', '/..%2fserver.js']) {
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

test('host sets options in the waiting room; the move timer plays for an idle human', async () => {
  const c = await post('/api/create', { name: 'Host', map: { preset: 'classic' }, seed: 5 });
  const { code, token } = c.body;
  const send = action => post('/api/action', { code, token, action });
  const h = listen(code, token);
  await h.waitFor(s => s.players.length === 1);
  assert.equal((await send({ type: 'addBot', level: 'easy' })).status, 200);
  assert.equal((await send({ type: 'setOptions', opts: { timer: 20 } })).status, 400);
  const want = { discardLimit: 9, discardMode: 'four', timer: 30, friendlyRobber: true, balancedDice: true };
  assert.equal((await send({ type: 'setOptions', opts: { vpTarget: 12, ...want } })).status, 200);
  const lobby = await h.waitFor(s => s.vpTarget === 12);
  assert.deepEqual(lobby.opts, want);
  const guest = await post('/api/join', { code, name: 'Guest' });
  const denied = await post('/api/action', { code, token: guest.body.token, action: { type: 'setOptions', opts: { timer: 15 } } });
  assert.equal(denied.status, 400); assert.match(denied.body.error, /host/);
  await send({ type: 'start' });
  const g = rooms.get(code).game;
  for (let i = 0; i < 300 && !(g.phase === 'setup' && !g.isBot(g.turn)); i++) await new Promise(r => setTimeout(r, 10));
  assert.equal(g.phase, 'setup');
  const st = await h.waitFor(s => s.phase === 'setup');
  assert.equal(st.timer.limit, 60, 'setup placements are timed at 60 seconds');
  const before = Object.keys(g.buildings).length;
  g.clockAt = Date.now() - 61000;
  await send({ type: 'chat', text: 'hurry up' }); // a broadcast re-arms the server timer
  for (let i = 0; i < 100 && Object.keys(g.buildings).length <= before; i++) await new Promise(r => setTimeout(r, 20));
  assert.ok(Object.keys(g.buildings).length > before, 'the server placed a settlement for the idle player');
  assert.ok(g.log.some(l => /placed automatically/.test(l.text)));
  h.close();
});

test('PWA: manifest, service worker, icons, screenshots and the Android verification route', async () => {
  const mr = await fetch(base + '/manifest.webmanifest');
  assert.equal(mr.status, 200); assert.match(mr.headers.get('content-type'), /manifest\+json/);
  const m = await mr.json();
  for (const k of ['id', 'name', 'short_name', 'start_url', 'scope', 'display', 'theme_color', 'background_color']) assert.ok(m[k], k);
  assert.equal(m.display, 'standalone');
  const png = async src => {
    const r = await fetch(base + src); assert.equal(r.status, 200, src);
    const b = Buffer.from(await r.arrayBuffer()); assert.equal(b.readUInt32BE(0), 0x89504e47, src + ' is a PNG');
    return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
  };
  const have = {};
  for (const i of m.icons.filter(i => i.type === 'image/png')) { assert.equal(await png(i.src), i.sizes, i.src); have[i.sizes + ':' + i.purpose] = true; }
  assert.ok(have['192x192:any'] && have['512x512:any'] && have['512x512:maskable'], 'icon sizes PWABuilder looks for');
  assert.ok(m.icons.some(i => i.type === 'image/svg+xml'));
  assert.ok(m.screenshots.length >= 2);
  for (const s of m.screenshots) assert.equal(await png(s.src), s.sizes, s.src);
  assert.equal(await png('/apple-touch-icon.png'), '180x180');
  const sw = await fetch(base + '/sw.js'), code = await sw.text();
  assert.equal(sw.status, 200); assert.match(sw.headers.get('cache-control'), /no-cache/);
  assert.match(code, /addEventListener\('fetch'/, 'has a fetch handler'); assert.match(code, /\/api\//, 'leaves game traffic alone');
  const al = await fetch(base + '/.well-known/assetlinks.json');
  assert.equal(al.status, 200); assert.ok(Array.isArray(await al.json()));
  assert.equal((await fetch(base + '/assetlinks.json')).status, 404, 'only served at the well-known path');
  const html = await (await fetch(base + '/')).text();
  assert.match(html, /rel="manifest"/); assert.match(html, /serviceWorker\.register/); assert.match(html, /apple-touch-icon/);
  assert.ok(!html.includes('</svg>'), 'no leftover markup in the page head');
});

test('Android verification file: the .well-known copy wins, then the flat copy, then an empty list', async () => {
  const fs = require('fs'), os = require('os'), path = require('path');
  const { readAssetLinks } = require('./server');
  const get = dir => new Promise(res => readAssetLinks(dir, res));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hexlinks-'));
  try {
    assert.equal(await get(dir), '[]', 'nothing there yet');
    fs.writeFileSync(path.join(dir, 'assetlinks.json'), '[]\n');
    assert.equal(await get(dir), '[]', 'an empty placeholder counts as nothing');
    const flat = JSON.stringify([{ target: { package_name: 'com.example.flat' } }]);
    fs.writeFileSync(path.join(dir, 'assetlinks.json'), flat);
    assert.equal(await get(dir), flat, 'the flat file is used');
    const real = JSON.stringify([{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: 'com.example.hexlands', sha256_cert_fingerprints: ['AA:BB:CC'] } }]);
    fs.mkdirSync(path.join(dir, '.well-known'));
    fs.writeFileSync(path.join(dir, '.well-known', 'assetlinks.json'), real);
    assert.equal(await get(dir), real, 'the .well-known file takes priority');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the host picks another map in the waiting room; fog is hidden over the wire and uncovered for everyone', async () => {
  const c = await post('/api/create', { name: 'Hosty', map: { preset: 'classic' } });
  const code = c.body.code, host = c.body.token;
  const j = await post('/api/join', { code, name: 'Guest' }), guest = j.body.token;
  const L = listen(code, host), G = listen(code, guest);
  try {
    await L.waitFor(s => s.phase === 'lobby'); await G.waitFor(s => s.phase === 'lobby');
    assert.equal(L.last('board').name, 'Classic Island');
    const denied = await post('/api/action', { code, token: guest, action: { type: 'setMap', preset: 'flamecup' } });
    assert.equal(denied.status, 400); assert.match(denied.body.error, /Only the host/);
    assert.equal((await post('/api/action', { code, token: host, action: { type: 'setMap', preset: 'nowhere' } })).status, 400);
    assert.equal((await post('/api/action', { code, token: host, action: { type: 'setMap', preset: 'flamecup' } })).status, 200);
    await L.waitFor(s => s.mapName === 'Blue Flame Cup'); await G.waitFor(s => s.mapName === 'Blue Flame Cup');
    for (const x of [L, G]) {
      const b = x.last('board'), fog = b.tiles.filter(t => t.terrain === 'fog');
      assert.equal(b.key, 'flamecup'); assert.equal(b.tiles.length, 55); assert.equal(fog.length, 30);
      assert.ok(fog.every(t => t.number === null)); assert.equal(b.ports.length, 6);
    }
    rooms.get(code).game.board.goblets = false; rooms.get(code).game.board.fogFreeStart = false;   // plain fog, so a setup settlement may touch it
    assert.equal((await post('/api/action', { code, token: host, action: { type: 'start' } })).status, 200);
    await L.waitFor(s => s.phase === 'setup'); await G.waitFor(s => s.phase === 'setup');
    const g = rooms.get(code).game, spot = g.validSettlements(g.turn, false).find(v => g.board.vertices[v].hexes.some(h => g.board.tiles[h].fog));
    const nBoards = x => x.events.filter(e => e.type === 'board').length, before = new Map([[L, nBoards(L)], [G, nBoards(G)]]), version = L.last('state').version;
    assert.equal((await post('/api/action', { code, token: g.players[g.turn].token, action: { type: 'settle', vertex: spot } })).status, 200);
    await L.waitFor(s => s.version > version); await G.waitFor(s => s.version > version);
    for (const x of [L, G]) {
      assert.ok(nBoards(x) > before.get(x), 'a fresh board arrives');
      assert.ok(x.last('board').tiles.filter(t => t.terrain === 'fog').length < 30, 'the touched tiles are uncovered for every player');
    }
    assert.equal((await post('/api/action', { code, token: host, action: { type: 'setMap', preset: 'classic' } })).status, 400, 'no map change once the game started');
  } finally { L.close(); G.close(); }
});

test('legal pages: Terms of Use and Privacy Policy are public web pages and in-app JSON, from one source', async () => {
  for (const [p, h, needles] of [['/terms', 'Terms of Use', ['at least 13', 'report', 'mute', 'independent game']], ['/privacy', 'Privacy Policy', ['no ads', 'chat messages', 'hosting provider', 'under 13']]]) {
    const r = await fetch(base + p); assert.equal(r.status, 200, p); assert.match(r.headers.get('content-type'), /text\/html/);
    const html = await r.text(); assert.ok(html.includes(`<h2>${h}</h2>`), p + ' has its title'); assert.ok(html.includes('<meta name="viewport"'), 'works on a phone');
    for (const n of needles) assert.ok(html.toLowerCase().includes(n.toLowerCase()), `${p} mentions "${n}"`);
  }
  const j = await (await fetch(base + '/api/legal')).json();
  assert.equal(j.version, require('./legal').VERSION); assert.ok(j.terms.includes('Terms of Use') && j.privacy.includes('Privacy Policy'));
  assert.equal((await fetch(base + '/legal.js')).status, 404, 'the module itself is never served');
  process.env.OPERATOR_NAME = '<i>Acme</i>'; process.env.CONTACT_EMAIL = 'help@example.com';     // the hosting settings fill in who runs the game
  try {
    const t = await (await fetch(base + '/terms')).text(), p = await (await fetch(base + '/privacy')).text();
    assert.ok(t.includes('&lt;i&gt;Acme&lt;/i&gt;') && !t.includes('<i>Acme</i>'), 'escaped'); assert.ok(p.includes('href="mailto:help@example.com"'));
  } finally { delete process.env.OPERATOR_NAME; delete process.env.CONTACT_EMAIL; }
});

test('reporting a chat message: checked, stored, rate limited, and readable by the admin only', async () => {
  const c = await post('/api/create', { name: 'Hosty', map: { preset: 'classic' } }), code = c.body.code, host = c.body.token;
  const j = await post('/api/join', { code, name: 'Rude' }), guest = j.body.token;
  assert.equal((await post('/api/action', { code, token: guest, action: { type: 'chat', text: 'you are all terrible' } })).status, 200);
  const game = rooms.get(code).game, rude = game.indexOf(guest), me = game.indexOf(host);
  const report = (extra = {}) => post('/api/report', { code, token: host, target: rude, text: 'you are all terrible', reason: 'harassment', note: 'rude', ...extra });
  assert.equal((await report({ reason: 'nonsense' })).status, 400, 'a real reason is needed');
  assert.equal((await report({ target: me })).status, 400, 'not yourself'); assert.equal((await report({ target: 9 })).status, 400);
  assert.equal((await report({ text: 'something nobody said' })).status, 400, 'the message has to be in the chat');
  assert.equal((await post('/api/report', { code, token: 'nobody', target: rude, text: 'you are all terrible', reason: 'spam' })).status, 400, 'only people in the room');
  const n = reports.length, ok = await report(); assert.equal(ok.status, 200);
  const last = reports[reports.length - 1]; assert.equal(reports.length, n + 1);
  assert.deepEqual([last.room, last.reporter, last.reported, last.reason, last.note, last.text], [code, 'Hosty', 'Rude', 'harassment', 'rude', 'you are all terrible']);
  for (let i = 0; i < 4; i++) assert.equal((await report()).status, 200);
  const slow = await report(); assert.equal(slow.status, 400); assert.match(slow.body.error, /Too many/);
  // only someone with the admin key can read them
  delete process.env.ADMIN_KEY; assert.equal((await fetch(base + '/api/admin/reports?key=anything')).status, 404, 'closed when no key is set');
  process.env.ADMIN_KEY = 'secret-key-123';
  try {
    assert.equal((await fetch(base + '/api/admin/reports?key=wrong-key-1234')).status, 404);
    const r = await fetch(base + '/api/admin/reports?key=secret-key-123'); assert.equal(r.status, 200);
    const list = (await r.json()).reports; assert.ok(list.some(x => x.id === last.id && x.reported === 'Rude'));
  } finally { delete process.env.ADMIN_KEY; }
});

test('the app asks everyone to agree to the same version of the terms that the server serves', () => {
  const app = require('fs').readFileSync(require('path').join(__dirname, 'app.js'), 'utf8'), m = /const LEGAL_VERSION = '([^']+)'/.exec(app);
  assert.ok(m, 'app.js declares LEGAL_VERSION'); assert.equal(m[1], require('./legal').VERSION, 'change both together');
  assert.ok(/render\(\);\nif \(needConsent\(\)\) openConsent\(\);/.test(app), 'the consent dialog opens at start-up');
  assert.ok(app.includes("!['discard', 'consent'].includes(kind)") && app.includes("!['discard', 'consent'].includes(S.modal)"), 'it cannot be dismissed without agreeing');
});
