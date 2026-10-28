(() => {
'use strict';
ART.install();

// ---------- constants ----------
const U = 60;
const RES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
const RES_LABEL = { wood: 'Wood', brick: 'Brick', sheep: 'Sheep', wheat: 'Hay', ore: 'Ore' };
const TERRAINS = ['forest', 'hills', 'pasture', 'fields', 'mountains', 'desert'];
const TERRAIN_LABEL = { forest: 'Forest', hills: 'Hills', pasture: 'Pasture', fields: 'Fields', mountains: 'Mountains', desert: 'Desert', sea: 'Sea' };
const TERRAIN_RES = { forest: 'wood', hills: 'brick', pasture: 'sheep', fields: 'wheat', mountains: 'ore', desert: null };
const COST = { road: { wood: 1, brick: 1 }, settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 }, city: { wheat: 2, ore: 3 }, dev: { sheep: 1, wheat: 1, ore: 1 } };
const DEV = {
  knight: { name: 'Knight', text: 'Move the robber and steal a card. Three knights earn Largest Army.' },
  vp: { name: 'Victory Point', text: 'Worth 1 point. Stays hidden until the game ends.' },
  roadBuilding: { name: 'Road Building', text: 'Place 2 roads for free.' },
  yearOfPlenty: { name: 'Year of Plenty', text: 'Take any 2 resources from the bank.' },
  monopoly: { name: 'Monopoly', text: 'Name a resource. Every player hands you all of it.' },
};
const STANDARD_NUMBERS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
const EDITOR_RADIUS = 6;

// ---------- state ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('hexlands.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { v == null ? localStorage.removeItem('hexlands.' + k) : localStorage.setItem('hexlands.' + k, JSON.stringify(v)); } catch {} },
};
const S = {
  screen: 'home', name: store.get('name', ''), session: store.get('session', null),
  maps: [], mapKey: 'classic', seed: null, previewBoard: null, vpTarget: 10,
  custom: store.get('custom', null), board: null, state: null, mode: null, vb: null, base: null,
  es: null, error: null, hot: null, modal: null, shellReady: false, editor: { tool: 'forest', num: null }, joinCode: '', botLevel: store.get('botLevel', 'medium'),
};
const LAUNCH_ACTION = new URLSearchParams(location.search).get('action');   // home-screen shortcut, read before the address bar is rewritten
const m = location.pathname.match(/^\/room\/([A-Za-z0-9]{5})/);
if (m) S.joinCode = m[1].toUpperCase();

// ---------- utils ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sum = r => RES.reduce((a, k) => a + (r[k] || 0), 0);
const icon = ART.icon;
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function toast(msg, kind = '', html = false) {
  const box = $('#toasts'), last = box.lastElementChild;
  if (last && last.dataset.msg === msg) return;
  const el = document.createElement('div');
  el.dataset.msg = msg;
  el.className = 'toast ' + kind;
  if (kind === 'err') Sound.play('error');
  el[html ? 'innerHTML' : 'textContent'] = msg;
  $('#toasts').append(el);
  setTimeout(() => el.classList.add('out'), 1650); setTimeout(() => el.remove(), 2000);   // every pop-up is gone within 2 seconds
  while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove();
}
async function post(path, body) {
  let r;
  try { r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  catch { throw new Error('Cannot reach the server. Check your connection.'); }
  const j = await r.json().catch(() => ({ error: 'The server sent an unexpected reply.' }));
  if (!r.ok) throw new Error(j.error || 'Request failed.');
  return j;
}
async function act(action) {
  try { const j = await post('/api/action', { code: S.session.code, token: S.session.token, action }); return { ok: true, result: j.result }; }
  catch (e) { toast(e.message, 'err'); return { ok: false }; }
}

// ---------- sound ----------
// Every button press gets the base click; resource cards get their own pitched click.
document.addEventListener('click', e => {
  const b = e.target.closest('button, [data-res]');
  if (!b || b.disabled) return;
  if (b.dataset.res) { Sound.play('res', b.dataset.res); bump(b); }
  else Sound.play('click');
}, true);
function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
function soundButtons() {
  return `<button class="btn small icon-only" id="sfxbtn" aria-pressed="${Sound.sfx}" aria-label="${Sound.sfx ? 'Mute sound effects' : 'Turn on sound effects'}" title="Sound effects">${icon(Sound.sfx ? 'sound' : 'soundoff')}</button>`
    + `<button class="btn small icon-only" id="musbtn" aria-pressed="${Sound.music}" aria-label="${Sound.music ? 'Turn off music' : 'Turn on music'}" title="Start and finish music">${icon(Sound.music ? 'music' : 'musicoff')}</button>`;
}
function bindSoundButtons() {
  const sb = $('#sfxbtn'), mb = $('#musbtn');
  const paint = () => {
    if (sb) { sb.innerHTML = icon(Sound.sfx ? 'sound' : 'soundoff'); sb.setAttribute('aria-pressed', Sound.sfx); sb.setAttribute('aria-label', Sound.sfx ? 'Mute sound effects' : 'Turn on sound effects'); }
    if (mb) { mb.innerHTML = icon(Sound.music ? 'music' : 'musicoff'); mb.setAttribute('aria-pressed', Sound.music); mb.setAttribute('aria-label', Sound.music ? 'Turn off music' : 'Turn on music'); }
  };
  if (sb) sb.onclick = () => { Sound.setSfx(!Sound.sfx); paint(); };
  if (mb) mb.onclick = () => { const on = !Sound.music; Sound.setMusic(on); if (on) Sound.theme('start'); paint(); };
}
const LEVEL_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const botTag = p => p.bot ? `<span class="botbadge lvl-${p.bot}" title="${LEVEL_LABEL[p.bot]} bot">${icon('bot')}${LEVEL_LABEL[p.bot]}</span>` : '';

// ---------- board drawing ----------
function bounds(b, pad = 70) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y, r) => { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); };
  b.tiles.forEach(t => add(t.x * U, t.y * U, 62));
  (b.ports || []).forEach(p => { add(p.x * U, p.y * U, 34); add(p.x * U, p.y * U - 44, 5); });   // the ship and its pennants   // plate, plus the boat above it
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
}
const SIDE = { forest: '#0e6527', hills: '#9a431d', pasture: '#637a07', fields: '#a57e18', mountains: '#6f7370', desert: '#89845a' };
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map(c => Math.max(0, Math.min(255, Math.round(f < 0 ? c * (1 + f) : c + (255 - c) * f))));
  return '#' + ch.map(c => c.toString(16).padStart(2, '0')).join('');
}
function tileSvg(t, attrs = '') {
  return `<g transform="translate(${t.x * U} ${t.y * U})" ${attrs}><g transform="scale(.955)">`
    + `<polygon points="${ART.HEX}" transform="translate(0 9)" fill="#7a4a10" opacity=".35"/>`
    + `<polygon points="${ART.HEX}" transform="translate(0 5)" fill="${SIDE[t.terrain] || '#444'}"/>`
    + `<g clip-path="url(#c-hex)"><use href="#t-${t.terrain}" x="-60" y="-60" width="120" height="120"/></g>`
    + `<polygon points="${ART.HEX}" fill="none" stroke="#fff8e0" stroke-width="3.6" stroke-linejoin="round"/>`
    + `<polygon points="${ART.HEX}" transform="scale(.94)" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="1.5"/></g></g>`;
}
function tokenSvg(n, x, y) {
  const pips = 6 - Math.abs(7 - n), red = n === 6 || n === 8, col = red ? '#d4140d' : '#000';
  const dots = Array.from({ length: pips }, (_, i) => `<circle cx="${(i - (pips - 1) / 2) * 7.4}" cy="19" r="3.3" fill="${col}"/>`).join('');
  return `<g transform="translate(${x} ${y})" pointer-events="none"><circle r="31" fill="url(#g-token)" stroke="${red ? '#a31a14' : '#6b5a3a'}" stroke-width="2.4" filter="url(#f-shadow)"/>`
    + `<circle r="26.5" fill="none" stroke="#c9b48a" stroke-width="1"/><text y="${n >= 10 ? 7 : 9}" text-anchor="middle" font-family="Alegreya SC, Georgia, serif" font-weight="800" font-size="${n >= 10 ? 29 : 35}" fill="${col}" stroke="${col}" stroke-width="1.4" stroke-linejoin="round">${n}</text>${dots}</g>`;
}
const RES_COLOR = { wood: '#14943a', brick: '#e2632a', sheep: '#92b40a', wheat: '#f3ba23', ore: '#a3a9a5' };
function portSvg(p) {
  const px = p.x * U, py = p.y * U, any = p.type === 'any';
  // short wooden jetties at the two coast corners, pointing out towards the ship
  const dock = p.vx.map(([x, y]) => {
    const X = x * U, Y = y * U, dx = px - X, dy = py - Y, len = Math.hypot(dx, dy) || 1, L = Math.min(30, len * .62);
    const ex = X + dx / len * L, ey = Y + dy / len * L;
    return `<line x1="${X}" y1="${Y}" x2="${ex}" y2="${ey}" stroke="#7a4310" stroke-width="15" stroke-linecap="butt"/>`
      + `<line x1="${X}" y1="${Y}" x2="${ex}" y2="${ey}" stroke="#e9a23a" stroke-width="12" stroke-linecap="butt"/>`
      + `<line x1="${X}" y1="${Y}" x2="${ex}" y2="${ey}" stroke="#b86a1a" stroke-width="12" stroke-dasharray="1.8 5.2"/>`;
  }).join('');
  const sym = any ? `<text x="0" y="-9" text-anchor="middle" font-family="Alegreya Sans, sans-serif" font-weight="800" font-size="24" fill="#5c3b2a">?</text>` : `<use href="#ic-${p.type}" x="-11" y="-27" width="22" height="22"/>`;
  const ship = `<g transform="translate(${px} ${py})" filter="url(#f-shadow)"><title>${any ? 'Harbor: trade any 3 identical cards for 1' : `Harbor: trade 2 ${RES_LABEL[p.type]} for 1`}</title><g><animateTransform attributeName="transform" type="translate" values="0 0;0 -2.5;0 0" dur="2.8s" repeatCount="indefinite"/>`
    + `<ellipse cy="23" rx="25" ry="5.5" fill="#bfe9fb" opacity=".85"/><ellipse cy="24" rx="19" ry="3.5" fill="#fff" opacity=".7"/>`
    + `<rect x="-1.3" y="-40" width="2.6" height="12" fill="#6b3d12"/><path d="M2,-41 h13 M4,-36.5 h11" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>`
    + `<path d="M-18,-28 Q-25,-9 -16,7 H16 Q25,-9 18,-28 Q0,-35 -18,-28Z" fill="#fff" stroke="#c4d1de" stroke-width="1.6" stroke-linejoin="round"/>`
    + `${sym}<text x="0" y="2.5" text-anchor="middle" font-family="Alegreya Sans, sans-serif" font-weight="700" font-size="12" fill="#6b4a38">${any ? '3:1' : '2:1'}</text>`
    + `<path d="M-20,8 H20 L14,20 Q0,25 -14,20Z" fill="#d98b2b" stroke="#7a4310" stroke-width="2" stroke-linejoin="round"/><path d="M-19,10.5 H19" stroke="#f6c866" stroke-width="2.4"/></g></g>`;
  return `<g>${dock}</g>${ship}`;
}
const FRAME_PAD = 7, VIEW_PAD = 7, TOP_EXTRA = () => 24;
const rrPath = (x, y, w, h, r) => `M${x + r},${y}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${-(w - 2 * r)}a${r},${r} 0 0 1 ${-r},${-r}v${-(h - 2 * r)}a${r},${r} 0 0 1 ${r},${-r}z`;
// A wooden frame around the sea, with brass studs and a name plate. Everything outside it is the table.
function frameSvg(b) {
  const f = bounds(b, FRAME_PAD), { x, y, w } = f;
  const name = String(b.name || '').toUpperCase(), pw = Math.max(150, name.length * 10 + 40);
  return `<g transform="translate(${x + w / 2} ${y - 9})"><rect x="${-pw / 2}" y="-14" width="${pw}" height="28" rx="14" fill="#0c3d73" stroke="#3f94cf" stroke-width="3"/><text y="5.5" text-anchor="middle" font-family="Alegreya Sans, sans-serif" font-weight="800" font-size="14" letter-spacing="1.6" fill="#fff">${esc(name)}</text></g>`;
}
function staticLayer(b) {
  const v = bounds(b, 140);
  const poly = (sc, fill, op = 1) => b.tiles.map(t => `<polygon points="${ART.HEX}" transform="translate(${t.x * U} ${t.y * U}) scale(${sc})" fill="${fill}" opacity="${op}"/>`).join('');
  let seed = 12345; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const sparkles = Array.from({ length: 30 }, () => {
    const x = v.x + rnd() * v.w, y = v.y + rnd() * v.h, sc = .6 + rnd() * .9, dur = 2.4 + rnd() * 2.6, begin = rnd() * 4;
    return `<path d="M0,-6 L1.6,-1.6 L6,0 L1.6,1.6 L0,6 L-1.6,1.6 L-6,0 L-1.6,-1.6Z" transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) scale(${sc.toFixed(2)})" fill="#fff" opacity="0"><animate attributeName="opacity" values="0;.85;0" dur="${dur.toFixed(1)}s" begin="${begin.toFixed(1)}s" repeatCount="indefinite"/></path>`;
  }).join('');
  const sorted = b.tiles.slice().sort((p, q) => p.y - q.y || p.x - q.x);
  return [[1.31, '#4f9fcb'], [1.27, '#7bd0f9'], [1.2, '#dfeadd'], [1.17, '#f0d9a2'], [1.09, '#dfb86d']].map(([sc, col]) => `<g>${poly(sc, col)}</g>`).join('')
    + (b.ports || []).map(portSvg).join('')
    + sorted.map(t => tileSvg(t)).join('')
    + sorted.filter(t => t.number).map(t => tokenSvg(t.number, t.x * U, t.y * U)).join('')
    + frameSvg(b);
}
function boardPreviewSvg(b) {
  const v = bounds(b, VIEW_PAD);
  return `<svg viewBox="${v.x} ${v.y} ${v.w} ${v.h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Map preview: ${esc(b.name)}">`
    + `<rect x="${v.x - 2000}" y="${v.y - 2000}" width="${v.w + 4000}" height="${v.h + 4000}" fill="#0a68a6"/>${staticLayer(b)}</svg>`;
}
function terrainCounts(tiles) {
  const c = {}; tiles.forEach(t => { c[t.terrain] = (c[t.terrain] || 0) + 1; });
  return TERRAINS.filter(k => c[k]).map(k => `<span>${k === 'desert' ? '<svg class="ic" viewBox="-60 -60 120 120"><polygon points="' + ART.HEX + '" fill="#e2c98c"/></svg>' : icon(TERRAIN_RES[k])} ${c[k]} ${TERRAIN_LABEL[k]}</span>`).join('');
}

// ---------- screens ----------
function go(screen) { S.screen = screen; S.shellReady = false; render(); }
function render() {
  const app = $('#app');
  if (S.screen === 'home') return renderHome(app);
  if (S.screen === 'create') return renderCreate(app);
  if (S.screen === 'editor') return renderEditor(app);
  if (S.screen === 'lobby') return renderLobby(app);
  if (S.screen === 'game') return renderGame(app);
}

function renderHome(app) {
  app.innerHTML = `<button class="info-btn" id="info" aria-label="How to play" title="How to play">i</button><div class="home">
    <div class="hero-board" id="hero"></div>
    <div>
      <h1 class="title">Hexlands</h1>
      <p class="tagline">Settle an island with friends. Gather wood, brick, sheep, hay and ore, out-trade your rivals, and race to victory.</p>
      <div class="panel stack">
        ${S.error ? `<div class="notice">${esc(S.error)}</div>` : ''}
        <label class="field">Your name<input id="name" maxlength="16" autocomplete="nickname" placeholder="e.g. Vivek" value="${esc(S.name)}"></label>
        <button class="btn primary" id="go-create">Create a room</button>
        <div class="divider">or join a friend</div>
        <div class="row"><input id="code" class="code-input grow" maxlength="5" placeholder="CODE" autocomplete="off" value="${esc(S.joinCode)}" aria-label="Room code"><button class="btn" id="go-join">Join room</button></div>
        ${S.session ? `<button class="btn" id="resume">Return to room ${esc(S.session.code)}</button>` : ''}
      </div>
    </div>
  </div>`;
  S.error = null;
  fetch('/api/preview?map=classic').then(r => r.json()).then(j => { const h = $('#hero'); if (h) h.innerHTML = boardPreviewSvg(j.board); }).catch(() => {});
  $('#info').onclick = openRules;
  showInstall();
  const nameOk = () => { const n = $('#name').value.trim(); if (!n) { toast('Enter your name first.', 'err'); $('#name').focus(); return null; } S.name = n; store.set('name', n); return n; };
  $('#go-create').onclick = () => { if (nameOk()) go('create'); };
  const join = async () => {
    const name = nameOk(); if (!name) return;
    const code = $('#code').value.trim().toUpperCase();
    if (code.length !== 5) { toast('Room codes have 5 characters.', 'err'); return; }
    try {
      const prev = S.session && S.session.code === code ? S.session.token : undefined;
      const j = await post('/api/join', { code, name, token: prev });
      startSession({ code: j.code, token: j.token });
    } catch (e) { toast(e.message, 'err'); }
  };
  $('#go-join').onclick = join;
  $('#code').addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
  $('#code').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  if ($('#resume')) $('#resume').onclick = () => startSession(S.session);
}

async function loadPreview(reseed) {
  const box = $('#preview'); if (!box) return;
  try {
    let j;
    if (S.mapKey === 'custom') {
      if (!S.custom || !S.custom.tiles.length) { box.innerHTML = ''; return; }
      j = await post('/api/preview', { map: { tiles: S.custom.tiles }, seed: reseed ? undefined : S.seed });
    } else {
      j = await (await fetch(`/api/preview?map=${S.mapKey}${!reseed && S.seed ? '&seed=' + S.seed : ''}`)).json();
    }
    S.seed = j.seed; S.previewBoard = j.board;
    if (!$('#preview')) return;
    $('#preview').innerHTML = boardPreviewSvg(j.board);
    $('#counts').innerHTML = terrainCounts(j.board.tiles) + `<span>${plural(j.board.ports.length, 'harbor')}</span>`;
  } catch (e) { toast(e.message, 'err'); }
}

function renderCreate(app) {
  const custom = S.custom && S.custom.tiles.length;
  app.innerHTML = `<div class="page">
    <div class="page-head"><button class="btn" id="back">Back</button><h2>Choose your island</h2></div>
    <div class="create-grid">
      <div class="map-list" id="maplist">
        ${S.maps.map(mp => `<button class="map-opt" data-map="${mp.key}" aria-pressed="${S.mapKey === mp.key}"><b>${esc(mp.name)}</b><span>${esc(mp.blurb)}</span></button>`).join('')}
        <button class="map-opt" data-map="custom" aria-pressed="${S.mapKey === 'custom'}"><b>Your own map</b><span>${custom ? `${custom} tiles you designed` : 'Paint every tile and number yourself.'}</span></button>
      </div>
      <div class="stack">
        <div class="preview" id="preview"></div>
        <div class="preview-meta"><div class="terrain-counts" id="counts"></div>
          <div class="row"><button class="btn small" id="reroll">${S.mapKey === 'custom' ? 'Reshuffle harbors' : 'Shuffle tiles'}</button><button class="btn small" id="edit">${S.mapKey === 'custom' ? 'Edit map' : 'Copy into editor'}</button></div></div>
        <div class="panel row">
          <span class="grow"><b>Next: the waiting room</b><br><span class="muted" style="font-size:.88em">Pick points to win, discard limit, move timer, friendly robber and balanced dice there, and add bots.</span></span>
          <button class="btn primary" id="create">Create room</button>
        </div>
      </div>
    </div></div>`;
  $('#back').onclick = () => go('home');
  $$('#maplist .map-opt').forEach(b => b.onclick = () => {
    const k = b.dataset.map;
    if (k === 'custom' && !(S.custom && S.custom.tiles.length)) { S.mapKey = 'custom'; return go('editor'); }
    S.mapKey = k; S.seed = null; renderCreate(app);
  });
  $('#reroll').onclick = () => loadPreview(true);
  $('#edit').onclick = () => {
    if (S.mapKey !== 'custom' && S.previewBoard) S.custom = { tiles: S.previewBoard.tiles.map(t => ({ q: t.q, r: t.r, terrain: t.terrain, number: t.number })) };
    S.mapKey = 'custom'; go('editor');
  };
  $('#create').onclick = async e => {
    e.target.disabled = true;
    try {
      const map = S.mapKey === 'custom' ? { tiles: S.custom.tiles } : { preset: S.mapKey };
      const j = await post('/api/create', { name: S.name, map, seed: S.seed });
      startSession({ code: j.code, token: j.token });
    } catch (err) { toast(err.message, 'err'); e.target.disabled = false; }
  };
  if (!S.maps.length) fetch('/api/maps').then(r => r.json()).then(j => { S.maps = j.maps; if (S.screen === 'create') renderCreate(app); });
  else loadPreview(false);
}

// ---------- map editor ----------
function editorCells() {
  const out = [], R = EDITOR_RADIUS;
  for (let q = -R; q <= R; q++) for (let r = -R; r <= R; r++) if (Math.abs(q + r) <= R) out.push({ q, r });
  return out;
}
const SQ3 = Math.sqrt(3);
const axialXY = (q, r) => ({ x: SQ3 * (q + r / 2), y: 1.5 * r });
function editorValidate(tiles) {
  if (tiles.length < 7) return `Add at least 7 land tiles (${tiles.length} so far).`;
  if (tiles.length > 60) return 'Use at most 60 land tiles.';
  if (tiles.filter(t => t.terrain !== 'desert').length < 5) return 'Add at least 5 resource tiles.';
  const missing = RES.filter(r => !tiles.some(t => TERRAIN_RES[t.terrain] === r));
  if (missing.length) return `Some resources are missing: ${missing.map(r => RES_LABEL[r]).join(', ')}. The game still works, but nobody can produce them.`;
  return null;
}
function autoNumbers(tiles) {
  const prod = tiles.filter(t => t.terrain !== 'desert');
  const pool = []; while (pool.length < prod.length) pool.push(...STANDARD_NUMBERS);
  let best = null, bestBad = Infinity;
  const isN = (a, b) => [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].some(([dq, dr]) => a.q + dq === b.q && a.r + dr === b.r);
  for (let i = 0; i < 300 && bestBad; i++) {
    const nums = shuffle(pool.slice(0, prod.length));
    let bad = 0;
    prod.forEach((t, a) => { if (nums[a] === 6 || nums[a] === 8) prod.forEach((u, b) => { if (b > a && (nums[b] === 6 || nums[b] === 8) && isN(t, u)) bad++; }); });
    if (bad < bestBad) { bestBad = bad; best = nums; }
  }
  prod.forEach((t, i) => { t.number = best[i]; });
  tiles.forEach(t => { if (t.terrain === 'desert') t.number = null; });
}
function saveCustom() { store.set('custom', S.custom); }

function renderEditor(app) {
  if (!S.custom) S.custom = { tiles: [] };
  const sw = k => `<button class="swatch" data-tool="${k}" aria-pressed="${S.editor.tool === k}">`
    + (k === 'sea' ? `<svg viewBox="-60 -60 120 120"><polygon points="${ART.HEX}" fill="#1a5a6e" stroke="#bfe6ec" stroke-dasharray="6 5" stroke-width="3"/></svg>`
      : `<svg viewBox="-62 -62 124 124"><g clip-path="url(#c-hex)"><use href="#t-${k}" x="-60" y="-60" width="120" height="120"/></g><polygon points="${ART.HEX}" fill="none" stroke="#2c1e0e" stroke-width="3"/></svg>`)
    + `${TERRAIN_LABEL[k]}</button>`;
  const nums = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];
  app.innerHTML = `<div class="page">
    <div class="page-head"><button class="btn" id="back">Back</button><h2>Map editor</h2></div>
    <div class="editor">
      <div class="editor-canvas" id="canvas"></div>
      <div class="stack">
        <div class="panel stack">
          <b>Paint terrain</b>
          <div class="palette">${[...TERRAINS, 'sea'].map(sw).join('')}</div>
          <p class="help">Tap or drag across the grid to paint. Sea removes a tile.</p>
        </div>
        <div class="panel stack">
          <b>Place numbers</b>
          <div class="numpad">${nums.map(n => `<button data-num="${n}" class="${n === 6 || n === 8 ? 'red' : ''}" aria-pressed="${S.editor.tool === 'num' && S.editor.num === n}">${n}</button>`).join('')}
            <button class="clear" data-num="0" aria-pressed="${S.editor.tool === 'num' && S.editor.num === 0}">No number</button></div>
          <div class="row"><button class="btn small" id="auto">Auto numbers</button><button class="btn small" id="shuffle">Shuffle terrain</button></div>
          <p class="help">Tiles left without a number get one automatically when the game starts.</p>
        </div>
        <div class="panel stack">
          <div class="terrain-counts" id="ecounts"></div>
          <div id="evalid"></div>
          <div class="row"><button class="btn small" id="classic">Start from classic</button><button class="btn small danger" id="clear">Clear all</button></div>
          <button class="btn primary" id="use">Use this map</button>
        </div>
      </div>
    </div></div>`;
  const cells = editorCells();
  const pts = cells.map(c => axialXY(c.q, c.r));
  const minX = Math.min(...pts.map(p => p.x)) * U - 64, maxX = Math.max(...pts.map(p => p.x)) * U + 64;
  const minY = Math.min(...pts.map(p => p.y)) * U - 64, maxY = Math.max(...pts.map(p => p.y)) * U + 64;
  const draw = () => {
    const map = new Map(S.custom.tiles.map(t => [t.q + ',' + t.r, t]));
    $('#canvas').innerHTML = `<svg viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" preserveAspectRatio="xMidYMid meet" id="esvg">`
      + cells.map(c => {
        const t = map.get(c.q + ',' + c.r), { x, y } = axialXY(c.q, c.r);
        if (!t) return `<g class="cell cell-empty" data-q="${c.q}" data-r="${c.r}" transform="translate(${x * U} ${y * U})"><polygon points="${ART.HEX}" transform="scale(.97)"/></g>`;
        return `<g class="cell" data-q="${c.q}" data-r="${c.r}">${tileSvg({ ...t, x, y })}${t.number ? tokenSvg(t.number, x * U, y * U) : ''}</g>`;
      }).join('') + '</svg>';
    $('#ecounts').innerHTML = S.custom.tiles.length ? terrainCounts(S.custom.tiles) : '<span>No tiles yet. Pick a terrain and paint.</span>';
    const err = editorValidate(S.custom.tiles);
    $('#evalid').innerHTML = err ? `<p class="help" style="color:#ffd9cf">${esc(err)}</p>` : `<p class="help">${S.custom.tiles.length} tiles, ready to play.</p>`;
    $('#use').disabled = S.custom.tiles.length < 7 || S.custom.tiles.length > 60 || S.custom.tiles.filter(t => t.terrain !== 'desert').length < 5;
  };
  const apply = (q, r) => {
    const i = S.custom.tiles.findIndex(t => t.q === q && t.r === r);
    const tool = S.editor.tool;
    if (tool === 'num') {
      if (i < 0 || S.custom.tiles[i].terrain === 'desert') return false;
      const n = S.editor.num || null;
      if (S.custom.tiles[i].number === n) return false;
      S.custom.tiles[i].number = n; return true;
    }
    if (tool === 'sea') { if (i < 0) return false; S.custom.tiles.splice(i, 1); return true; }
    if (i >= 0) {
      const t = S.custom.tiles[i]; if (t.terrain === tool) return false;
      t.terrain = tool; if (tool === 'desert') t.number = null; return true;
    }
    if (S.custom.tiles.length >= 60) { toast('Maps can have at most 60 tiles.', 'err'); return false; }
    S.custom.tiles.push({ q, r, terrain: tool, number: null }); return true;
  };
  let painting = false, last = '';
  const cellAt = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest('.cell'); };
  const hit = e => {
    const c = cellAt(e.clientX, e.clientY); if (!c) return;
    const key = c.dataset.q + ',' + c.dataset.r; if (key === last) return; last = key;
    if (apply(+c.dataset.q, +c.dataset.r)) { saveCustom(); draw(); }
  };
  const cv = $('#canvas');
  cv.addEventListener('pointerdown', e => { painting = true; last = ''; cv.setPointerCapture(e.pointerId); hit(e); });
  cv.addEventListener('pointermove', e => { if (painting && S.editor.tool !== 'num') hit(e); });
  const stop = () => { painting = false; };
  cv.addEventListener('pointerup', stop); cv.addEventListener('pointercancel', stop);
  $$('.swatch').forEach(b => b.onclick = () => { S.editor.tool = b.dataset.tool; $$('.swatch').forEach(x => x.setAttribute('aria-pressed', x === b)); $$('.numpad button').forEach(x => x.setAttribute('aria-pressed', 'false')); });
  $$('.numpad button').forEach(b => b.onclick = () => { S.editor.tool = 'num'; S.editor.num = +b.dataset.num; $$('.numpad button').forEach(x => x.setAttribute('aria-pressed', x === b)); $$('.swatch').forEach(x => x.setAttribute('aria-pressed', 'false')); });
  $('#auto').onclick = () => { if (!S.custom.tiles.length) return; autoNumbers(S.custom.tiles); saveCustom(); draw(); };
  $('#shuffle').onclick = () => { const ter = shuffle(S.custom.tiles.map(t => t.terrain)); S.custom.tiles.forEach((t, i) => { t.terrain = ter[i]; if (t.terrain === 'desert') t.number = null; }); saveCustom(); draw(); };
  $('#clear').onclick = () => { if (S.custom.tiles.length && !confirm('Remove every tile from this map?')) return; S.custom.tiles = []; saveCustom(); draw(); };
  $('#classic').onclick = () => {
    const mask = ['..XXX..', '.XXXX..', '.XXXXX.', '.XXXX..', '..XXX..'];
    const bag = shuffle([...Array(4).fill('forest'), ...Array(4).fill('pasture'), ...Array(4).fill('fields'), ...Array(3).fill('hills'), ...Array(3).fill('mountains'), 'desert']);
    const tiles = []; mask.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === 'X') tiles.push({ q: c - (r - (r & 1)) / 2 - 2, r: r - 2, terrain: bag[tiles.length], number: null }); }));
    autoNumbers(tiles); S.custom.tiles = tiles; saveCustom(); draw();
  };
  $('#use').onclick = () => { S.mapKey = 'custom'; S.seed = null; saveCustom(); go('create'); };
  $('#back').onclick = () => { if (!S.custom.tiles.length && S.mapKey === 'custom') S.mapKey = 'classic'; go('create'); };
  draw();
}

// ---------- session / networking ----------
function startSession(sess) {
  S.session = sess; store.set('session', sess);
  history.replaceState(null, '', '/room/' + sess.code);
  if (S.es) S.es.close();
  S.board = null; S.state = null; S.shellReady = false; S.mode = null; S.boardFor = null; S.evSeq = null; S.logAt = null; S.tw = null;
  const es = new EventSource(`/api/events?code=${encodeURIComponent(sess.code)}&token=${encodeURIComponent(sess.token)}`);
  S.es = es;
  let opened = false;
  es.addEventListener('board', e => {
    const fresh = S.boardFor !== sess.code;
    S.board = JSON.parse(e.data); S.boardFor = sess.code;
    if (fresh || !S.vb) { S.base = bounds(S.board, VIEW_PAD); S.base.y -= TOP_EXTRA(); S.base.h += TOP_EXTRA(); S.vb = { ...S.base }; S.shellReady = false; }
  });
  es.addEventListener('state', e => { opened = true; onState(JSON.parse(e.data)); });
  es.onerror = () => {
    if (es.readyState !== EventSource.CLOSED || S.unloading) return;
    es.close(); if (S.es === es) S.es = null;
    // The stream was refused. Check whether our seat still exists before giving up.
    setTimeout(async () => {
      if (S.unloading || S.session !== sess) return;
      try { await post('/api/join', { code: sess.code, token: sess.token, name: S.name }); startSession(sess); }
      catch { leaveToHome(opened ? 'This room has closed. Rooms are cleared when the server restarts or sits idle.' : 'That room could not be found.'); }
    }, 1500);
  };
}
function leaveToHome(msg) {
  if (S.es) { S.es.close(); S.es = null; }
  store.set('session', null); S.session = null; S.state = null; S.board = null; S.error = msg || null;
  closeModal();
  history.replaceState(null, '', '/'); S.joinCode = ''; go('home');
}

function onState(st) {
  const prev = S.state; S.state = st;
  if (prev && prev.phase !== 'lobby' && st.phase !== 'lobby') checkAwards(prev, st);
  if (st.phase === 'lobby') {
    if (prev) st.players.forEach((p, i) => { const q = prev.players[i]; if (q && q.name === p.name && q.colorId !== p.colorId && i !== st.you) toast(`${p.name} selected color ${p.colorName}`); });
    if (S.screen !== 'lobby') S.screen = 'lobby';
    renderLobby($('#app')); return;
  }
  if (S.screen !== 'game') { S.screen = 'game'; S.shellReady = false; }
  // Reactions to changes
  if (prev && st.lastRoll && (!prev.lastRoll || prev.lastRoll.seq !== st.lastRoll.seq)) onRoll(st);
  else if (!prev && st.dice) drawDice(st.dice, false);
  if (prev && st.lastSteal && st.lastSteal.card && (!prev.lastSteal || prev.lastSteal.seq !== st.lastSteal.seq)) {
    const s = st.lastSteal, me = st.you;
    if (s.to === me) toast(`${icon(s.card)} You took ${RES_LABEL[s.card]} from ${esc(st.players[s.from].name)}`, 'gain', true);
    else if (s.from === me) toast(`${icon(s.card)} ${esc(st.players[s.to].name)} took your ${RES_LABEL[s.card]}`, 'err', true);
  }
  if (prev && prev.turn !== st.turn && st.turn === st.you && st.phase === 'main') { toast('Your turn'); Sound.play('turn'); if (navigator.vibrate) navigator.vibrate(50); }
  if (prev && prev.phase === 'lobby' && st.phase === 'setup') Sound.theme('start');
  if (prev && prev.phase !== 'ended' && st.phase === 'ended') { Sound.theme('finish'); recordResult(st); setTimeout(openLeaderboard, 700); confetti(); }
  if (prev) soundReactions(prev, st);
  if (st.turn !== st.you || st.subphase || !st.rolled || (S.mode && !modePossible(S.mode))) S.mode = null;
  renderGame($('#app'));
}

function onRoll(st) {
  const d = st.lastRoll.dice, total = d[0] + d[1];
  drawDice(d, true);
  Sound.play('dice'); flyGains(st); if (total === 7) setTimeout(() => Sound.play('seven'), 900);
  if (total !== 7) { S.hot = { sum: total, until: Date.now() + 2600 }; setTimeout(() => { if (S.screen === 'game') drawDyn(); }, 2700); }
  const g = st.lastRoll.gains[st.you];
  if (g && sum(g)) {
    toast(RES.filter(k => g[k]).map(k => `${icon(k)} +${g[k]}`).join(' '), 'gain', true);
    setTimeout(() => Sound.play('gain'), 480);
    setTimeout(() => RES.filter(k => g[k]).forEach(k => { const c = $(`.card.${k}`); if (c) { c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); } }), 50);
  }
  if (total === 7) toast(st.turn === st.you ? 'Seven! Move the robber.' : 'Seven! The robber strikes.');
}

// ---------- lobby ----------
function optionsHtml(st, host) {
  const o = st.opts;
  const row = (title, hint, ctl) => `<div class="opt"><div class="optl"><b>${title}</b><small>${hint}</small></div><div class="optc">${ctl}</div></div>`;
  const step = (key, val, min, max, suffix = '') => host
    ? `<div class="stepper"><button data-step="${key}:${val}:-1:${min}:${max}" aria-label="Decrease">−</button><output>${val}${suffix}</output><button data-step="${key}:${val}:1:${min}:${max}" aria-label="Increase">+</button></div>`
    : `<span class="optval">${val}${suffix}</span>`;
  const seg = (key, choices, cur) => host
    ? `<div class="seg ${choices.length === 4 ? 'four' : 'two'}" role="group">${choices.map(([v, l]) => `<button data-set="${key}:${v}" aria-pressed="${String(cur) === String(v)}">${l}</button>`).join('')}</div>`
    : `<span class="optval">${choices.find(([v]) => String(v) === String(cur))[1]}</span>`;
  const sw = (key, on, label) => host
    ? `<button class="switch" role="switch" data-toggle="${key}" aria-checked="${on}" aria-label="${label}"></button>`
    : `<span class="optval">${on ? 'On' : 'Off'}</span>`;
  return row('Points to win', 'First to reach this on their own turn wins.', step('vpTarget', st.vpTarget, 5, 20))
    + row('Discard limit', `When a 7 is rolled, players holding more than ${o.discardLimit} cards must discard.`, step('discardLimit', o.discardLimit, 7, 15, ' cards'))
    + row('Cards discarded', o.discardMode === 'four' ? 'Each player over the limit gives up exactly 4 cards.' : 'Half of the hand, rounded down (the official rule).', seg('discardMode', [['half', 'Half'], ['four', '4 cards']], o.discardMode))
    + row('Move timer', 'When time runs out, the game plays that step for the player. Setup placements always get 60 seconds.', seg('timer', [[0, 'Off'], [15, '15s'], [30, '30s'], [60, '60s']], o.timer))
    + row('Friendly robber', 'The robber cannot be placed next to a player with 2 points or fewer.', sw('friendlyRobber', o.friendlyRobber, 'Friendly robber'))
    + row('Balanced dice', 'Dice come from a shuffled deck of all 36 rolls, so totals stay near their odds and repeats are rarer.', sw('balancedDice', o.balancedDice, 'Balanced dice'));
}

function renderLobby(app) {
  const st = S.state; if (!st) return;
  const me = st.you, host = st.players[me] && st.players[me].host;
  const link = `${location.origin}/room/${st.code}`;
  const prevBox = $('#lobby-preview');
  const keepPreview = prevBox && prevBox.dataset.code === st.code && prevBox.innerHTML;
  app.innerHTML = `<div class="page">
    <div class="page-head"><button class="btn" id="leave">Leave room</button><h2>Waiting room</h2><button class="info-btn inline" id="info" aria-label="How to play" title="How to play">i</button></div>
    <div class="lobby">
      <div class="panel stack optpanel lb-opts"><h3 class="panel-title">Game options${host ? '' : '<small>chosen by the host</small>'}</h3>${optionsHtml(st, host)}</div>
      <div class="panel stack lb-room">
        <div><div class="muted">Room code</div><div class="room-code">${st.code}</div></div>
        <div class="row"><button class="btn" id="copy">Copy invite link</button>${navigator.share ? '<button class="btn" id="share">Share</button>' : ''}</div>
        <ul class="plist">${st.players.map((p, i) => `<li>${swatch(p, i, me, host)}${p.bot ? icon('bot', 'boticon') : ''}<b class="grow">${esc(p.name)}${i === me ? ' (you)' : ''}</b>${p.host ? '<span class="badge">Host</span>' : ''}
          ${p.bot ? (host ? `<select class="lvlsel" data-seat="${i}" aria-label="Difficulty for ${esc(p.name)}">${['easy', 'medium', 'hard'].map(l => `<option value="${l}" ${p.bot === l ? 'selected' : ''}>${LEVEL_LABEL[l]}</option>`).join('')}</select><button class="btn small icon-only" data-rmbot="${i}" aria-label="Remove ${esc(p.name)}">✕</button>` : botTag(p)) : `<span class="dot ${p.connected ? '' : 'off'}" title="${p.connected ? 'Connected' : 'Offline'}"></span>`}</li>`).join('')}</ul>
        ${host && st.players.length < 4 ? `<div class="botadd"><b>Add a bot</b>
          <div class="seg" role="group" aria-label="Bot difficulty">${['easy', 'medium', 'hard'].map(l => `<button data-lvl="${l}" aria-pressed="${S.botLevel === l}">${LEVEL_LABEL[l]}</button>`).join('')}</div>
          <button class="btn" id="addbot">${icon('bot')} Add ${LEVEL_LABEL[S.botLevel].toLowerCase()} bot</button>
          <p class="help">${{ easy: 'Easy bots place loosely and rarely trade. Good for learning.', medium: 'Medium bots build steadily and trade toward their next build.', hard: 'Hard bots read the board, target the leader with the robber and refuse to feed a near winner.' }[S.botLevel]}</p></div>` : ''}
        <p class="muted">${st.players.length} of 4 seats taken. ${host ? (st.players.length < 2 ? 'Add a bot or share the code; you need at least one more player.' : 'Check the options, then start when everyone is in.') : 'The host starts the game.'}</p>
        <div class="row">${soundButtons()}<span class="muted" style="font-size:.88em">Sound effects and music</span></div>
        ${host ? `<button class="btn primary" id="start" ${st.players.length < 2 ? 'disabled' : ''}>Start game</button>` : ''}
      </div>
      <div class="stack lb-map"><div class="preview" id="lobby-preview" data-code="${st.code}"></div>
        <p class="muted">${esc(st.mapName)}. Turn order is drawn at random when the game starts.</p></div>
    </div></div>`;
  if (keepPreview) $('#lobby-preview').innerHTML = keepPreview;
  else if (S.board) $('#lobby-preview').innerHTML = boardPreviewSvg(S.board);
  $('#info').onclick = openRules;
  $('#leave').onclick = async () => { try { await post('/api/leave', S.session); } catch {} leaveToHome(); };
  $('#copy').onclick = async () => { try { await navigator.clipboard.writeText(link); toast('Invite link copied'); } catch { prompt('Copy this link', link); } };
  if ($('#share')) $('#share').onclick = () => navigator.share({ title: 'Join my Hexlands game', text: `Room code ${st.code}`, url: link }).catch(() => {});
  if ($('#start')) $('#start').onclick = () => act({ type: 'start' });
  $$('[data-lvl]').forEach(b => b.onclick = () => { S.botLevel = b.dataset.lvl; store.set('botLevel', S.botLevel); renderLobby(app); });
  if ($('#addbot')) $('#addbot').onclick = () => act({ type: 'addBot', level: S.botLevel });
  $$('[data-rmbot]').forEach(b => b.onclick = () => act({ type: 'removeBot', seat: +b.dataset.rmbot }));
  $$('[data-color-seat]').forEach(b => b.onclick = () => openColorPicker(+b.dataset.colorSeat));
  $$('.lvlsel').forEach(sel => sel.onchange = () => act({ type: 'setBotLevel', seat: +sel.dataset.seat, level: sel.value }));
  $$('[data-step]').forEach(b => b.onclick = () => { const [k, v, d, mn, mx] = b.dataset.step.split(':'); const nv = Math.max(+mn, Math.min(+mx, +v + +d)); if (nv !== +v) act({ type: 'setOptions', opts: { [k]: nv } }); });
  $$('[data-set]').forEach(b => b.onclick = () => { const [k, v] = b.dataset.set.split(':'); act({ type: 'setOptions', opts: { [k]: k === 'discardMode' ? v : +v } }); });
  $$('[data-toggle]').forEach(b => b.onclick = () => act({ type: 'setOptions', opts: { [b.dataset.toggle]: b.getAttribute('aria-checked') !== 'true' } }));
  bindSoundButtons();
}

// ---------- game ----------
function renderGame(app) {
  if (!S.state || !S.board) return;
  if (!S.shellReady || !$('#board')) buildShell(app);
  updateGame();
}
const GB_ICON = {
  msg: '<svg class="ic" viewBox="0 0 32 32" aria-hidden="true"><path d="M6,5 H26 a3,3 0 0 1 3,3 V19 a3,3 0 0 1 -3,3 H16.5 L10,28 V22 H6 a3,3 0 0 1 -3,-3 V8 a3,3 0 0 1 3,-3Z" fill="currentColor"/><path d="M9,11 H23 M9,15.5 H19" stroke="#0b2a5a" stroke-width="2.4" stroke-linecap="round"/></svg>',
  exit: '<svg class="ic" viewBox="0 0 32 32" aria-hidden="true"><path d="M13,4 H6 a2,2 0 0 0 -2,2 V26 a2,2 0 0 0 2,2 H13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M12,16 H28 M22,9 L29,16 L22,23" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
function buildShell(app) {
  app.innerHTML = `<div class="game">
    <aside class="players" id="players"></aside>
    <section class="center"><div class="infobar" id="infobar"><div class="banner" id="banner"></div><div class="placing" id="placing" hidden></div><div class="clock" id="clock" hidden></div><div class="setupstrip" id="setupstrip" hidden></div></div><main class="board-wrap" id="wrap">
      <svg id="board" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMin meet">
        <rect x="-5000" y="-5000" width="10000" height="10000" fill="#0a68a6"/>
        <g id="static"></g><g id="dyn"></g>
      </svg>
      <div class="dice" id="dice"></div><div class="awards" id="awards"></div><div class="offer" id="offer"></div><div class="tradewin" id="tradewin" hidden></div>
      <div class="gbtns"><button class="gbtn drawer-toggle" id="logbtn" title="Messages" aria-label="Messages">${GB_ICON.msg}</button><button class="gbtn" id="quit" title="Leave game" aria-label="Leave game">${GB_ICON.exit}</button></div>
      <div class="zoom"><button class="btn" id="zin" aria-label="Zoom in">+</button><button class="btn" id="zout" aria-label="Zoom out">−</button><button class="btn" id="zfit" aria-label="Fit board">⤢</button></div>
    </main></section>
    <aside class="side" id="side"><div class="panel"><h3>Ship's log</h3><div class="log" id="log"></div>
      <form class="chatform" id="chat"><input id="chatin" maxlength="200" placeholder="Message the table" autocomplete="off" aria-label="Chat message"><button class="btn small">Send</button></form></div></aside>
    <footer class="dock"><div class="hand" id="hand"></div><div class="actions" id="actions"></div></footer>
  </div>`;
  S.shellReady = true;
  $('#static').innerHTML = staticLayer(S.board);
  applyVB();
  setupPanZoom($('#board'));
  $('#zin').onclick = () => zoomCenter(1.25);
  $('#zout').onclick = () => zoomCenter(1 / 1.25);
  $('#zfit').onclick = () => { S.vb = { ...S.base }; applyVB(); };
  $('#logbtn').onclick = () => $('#side').classList.toggle('open');
  bindSoundButtons();
  $('#quit').onclick = () => { if (confirm('Leave this game? You can rejoin with the room code while it is running.')) { if (S.es) S.es.close(); S.es = null; S.state = null; history.replaceState(null, '', '/'); go('home'); } };
  $('#chat').onsubmit = e => { e.preventDefault(); const v = $('#chatin').value.trim(); if (v) { act({ type: 'chat', text: v }); $('#chatin').value = ''; } };
  if (S.state.dice) drawDice(S.state.dice, false);
}

function updateGame() {
  validatePick();
  const st = S.state;
  drawDyn(); drawPlayers(); drawBanner(); drawHand(); drawActions(); drawLog(); drawOffer(); drawClock(); drawSetupStrip(); drawPlacing(); drawTrade();
  syncModals();
}

function me() { return S.state.you; }
function myTurn() { return S.state.turn === S.state.you; }
function canAfford(cost) { const r = S.state.me.res; return RES.every(k => (r[k] || 0) >= (cost[k] || 0)); }
function canSettle(pi, v, needRoad) {
  const st = S.state, V = S.board.vertices[v];
  if (st.buildings[v] || V.adj.some(n => st.buildings[n])) return false;
  return !needRoad || V.edges.some(e => st.roads[e] === pi);
}
function canRoad(pi, e, anchor) {
  const st = S.state, ed = S.board.edges[e];
  if (st.roads[e] !== undefined) return false;
  if (anchor != null) return ed.v.includes(anchor);
  return ed.v.some(v => { const b = st.buildings[v]; if (b) return b.p === pi; return S.board.vertices[v].edges.some(o => o !== e && st.roads[o] === pi); });
}
const validSettle = needRoad => S.board.vertices.filter(v => canSettle(me(), v.id, needRoad)).map(v => v.id);
const validRoads = anchor => S.board.edges.filter(e => canRoad(me(), e.id, anchor)).map(e => e.id);
const myCitySpots = () => Object.keys(S.state.buildings).filter(v => S.state.buildings[v].p === me() && S.state.buildings[v].type === 'settlement').map(Number);

function currentMode() {
  const st = S.state; if (!st || !myTurn() || S.tw) return null;
  if (st.phase === 'setup') return st.setup.expect === 'settlement' ? 'setupSettle' : 'setupRoad';
  if (st.phase !== 'main') return null;
  if (st.subphase === 'robber') return 'robber';
  if (st.subphase === 'roadBuilding') return 'freeRoad';
  if (st.subphase || !st.rolled) return null;
  return S.mode || 'auto';   // no button pressed: show everything you can afford to build
}
// Everything the current player can afford to place right now.
function buildable() {
  const st = S.state, P = st.players[me()];
  return {
    road: canAfford(COST.road) && P.pieces.road > 0 ? validRoads() : [],
    settle: canAfford(COST.settlement) && P.pieces.settlement > 0 ? validSettle(true) : [],
    city: canAfford(COST.city) && P.pieces.city > 0 ? myCitySpots() : [],
  };
}
function autoCount() { const b = buildable(); return b.road.length + b.settle.length + b.city.length; }

function drawDyn() {
  const st = S.state, b = S.board, V = b.vertices; if (!$('#dyn')) return;
  if (!S.seen || S.seenFor !== st.code) {
    S.seen = new Set([...Object.keys(st.roads).map(e => 'r' + e), ...Object.entries(st.buildings).map(([v, x]) => 'b' + v + x.type)]);
    S.seenFor = st.code;
  }
  const fresh = k => { if (S.seen.has(k)) return false; S.seen.add(k); return true; };
  const cut = new Set(st.cutRoads || []);
  let s = '';
  if (S.hot && S.hot.until > Date.now()) s += b.tiles.filter(t => t.number === S.hot.sum && t.id !== st.robber).map(t => `<polygon class="hot" points="${ART.HEX}" transform="translate(${t.x * U} ${t.y * U}) scale(.95)"/>`).join('');
  for (const [e, p] of Object.entries(st.roads)) {
    const [a, c] = b.edges[e].v.map(i => V[i]);
    const ax = a.x * U, ay = a.y * U, cx = c.x * U, cy = c.y * U, k = 0.14;
    const x1 = ax + (cx - ax) * k, y1 = ay + (cy - ay) * k, x2 = cx - (cx - ax) * k, y2 = cy - (cy - ay) * k, col = st.players[p].color;
    const isCut = cut.has(+e);
    // The soft shadow is drawn by hand. An SVG filter on a perfectly vertical road has a zero-width box,
    // and browsers then paint nothing at all, so vertical roads used to disappear.
    s += `<g class="${fresh('r' + e) ? 'road-new' : ''}"${isCut ? ' opacity=".5"' : ''}>${isCut ? '<title>Cut off by an opposing settlement. The road stays, but it no longer links back to your towns.</title>' : ''}`
      + `<line x1="${x1}" y1="${y1 + 3.5}" x2="${x2}" y2="${y2 + 3.5}" stroke="#001a3a" stroke-opacity=".4" stroke-width="26" stroke-linecap="round"/>`
      + `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-opacity=".9" stroke-width="27" stroke-linecap="round"/>`
      + `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1b1b1b" stroke-width="22.5" stroke-linecap="round"/>`
      + `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="16.5" stroke-linecap="round"/>`
      + `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#000" stroke-opacity=".22" stroke-width="16.5" stroke-dasharray="2.5 9"/>`
      + `<line x1="${x1}" y1="${y1 - 3.5}" x2="${x2}" y2="${y2 - 3.5}" stroke="#fff" stroke-opacity=".4" stroke-width="4" stroke-linecap="round"/></g>`;
  }
  for (const [v, bd] of Object.entries(st.buildings)) {
    const x = V[v].x * U, y = V[v].y * U, col = st.players[bd.p].color, city = bd.type === 'city';
    const pop = fresh('b' + v + bd.type) ? 'pop' : '';
    s += `<g transform="translate(${x} ${y}) scale(${city ? 1.3 : 1.72})" filter="url(#f-shadow)"><g class="bld ${pop}">${city ? cityHouseSvg(col, true) : houseSvg(col, true)}</g></g>`;
  }
  const rt = b.tiles[st.robber];
  s += `<use href="#ic-robber" x="${rt.x * U - 58}" y="${rt.y * U - 42}" width="44" height="44" pointer-events="none" filter="url(#f-shadow)"/>`;
  s += highlights();
  $('#dyn').innerHTML = s;
}
// Barn-style pieces: lighter left roof, darker right roof, ridge line, dark door, thick dark outline.
function houseSvg(col, halo) {
  const ink = shade(col, -.6), lt = shade(col, .3), dk = shade(col, -.2), body = 'M-13,10 L-14,-3 L-7,-14 L7,-14 L14,-3 L13,10Z';
  return (halo ? `<path d="${body}" fill="#fff" stroke="#fff" stroke-width="8" stroke-linejoin="round"/>` : '')
    + `<path d="${body}" fill="${col}"/><path d="M-14,-3 L-7,-14 H0 V-3Z" fill="${lt}"/><path d="M0,-14 H7 L14,-3 H0Z" fill="${dk}"/>`
    + `<path d="${body}" fill="none" stroke="${ink}" stroke-width="3.2" stroke-linejoin="round"/><path d="M-14,-3 H14 M0,-14 V-3" stroke="${ink}" stroke-width="2" fill="none"/>`
    + `<path d="M-3,10 V6.4 a3,3 0 0 1 6,0 V10Z" fill="#150808"/>`;
}
function cityHouseSvg(col, halo) {
  const ink = shade(col, -.6), lt = shade(col, .3), dk = shade(col, -.2), main = 'M-23,12 L-24,-3 L-15,-17 L1,-17 L10,-3 L9,12Z', wing = 'M9,12 V0 L12,-4 H22 L24,0 V12Z';
  return (halo ? `<path d="${main}" fill="#fff" stroke="#fff" stroke-width="8" stroke-linejoin="round"/><path d="${wing}" fill="#fff" stroke="#fff" stroke-width="8" stroke-linejoin="round"/>` : '')
    + `<path d="${main}" fill="${col}"/><path d="M-24,-3 L-15,-17 H-7 V-3Z" fill="${lt}"/><path d="M-7,-17 H1 L10,-3 H-7Z" fill="${dk}"/><path d="${wing}" fill="${col}"/><path d="M9,0 L12,-4 H22 L24,0Z" fill="${dk}"/>`
    + `<path d="${main}" fill="none" stroke="${ink}" stroke-width="3.2" stroke-linejoin="round"/><path d="${wing}" fill="none" stroke="${ink}" stroke-width="3.2" stroke-linejoin="round"/><path d="M-24,-3 H10 M-7,-17 V-3" stroke="${ink}" stroke-width="2" fill="none"/>`
    + `<path d="M-10,12 V8.2 a3,3 0 0 1 6,0 V12Z" fill="#150808"/><rect x="-18" y="1" width="3.8" height="5" rx=".8" fill="#150808"/><rect x="-1" y="1" width="3.8" height="5" rx=".8" fill="#150808"/><rect x="14.5" y="4" width="4.4" height="3.8" rx=".8" fill="#150808"/>`;
}
function pieceGlyph(kind, col) { return kind === 'city' ? cityHouseSvg(col) : houseSvg(col); }
function highlights() {
  const mode = currentMode(); if (!mode) { S.pick = null; return ''; }
  const V = S.board.vertices, st = S.state, col = st.players[me()].color;
  if (mode === 'robber') return (st.robberOptions || []).map(id => S.board.tiles[id]).map(t => `<g class="rspot" data-t="${t.id}" transform="translate(${t.x * U} ${t.y * U})"><polygon points="${ART.HEX}" transform="scale(.92)" fill="transparent"/><circle class="rdisc" r="39"/><circle class="rdot" r="8"/></g>`).join('');
  const sets = modeSets(mode);
  const kinds = Object.values(sets).filter(a => a.length).length, big = kinds === 1, mixed = kinds > 1;
  const road = e => {
    const [a, c] = S.board.edges[e].v.map(i => V[i]), mx = (a.x + c.x) / 2 * U, my = (a.y + c.y) / 2 * U, ang = Math.atan2(c.y - a.y, c.x - a.x) * 180 / Math.PI;
    const r = big ? 25 : 14, xy = `x1="${a.x * U}" y1="${a.y * U}" x2="${c.x * U}" y2="${c.y * U}"`;
    return `<line class="ehit" ${xy} data-e="${e}"/><g class="hs" data-e="${e}" transform="translate(${mx} ${my})"><circle class="hc" r="${r}"/><circle r="${big ? 25 : 21}" fill="transparent"/>`
      + (mixed ? `<g class="hg" transform="rotate(${ang}) scale(${r / 27})"><rect x="-17" y="-6" width="34" height="12" rx="6" fill="${col}" stroke="#1b1b1b" stroke-width="2.5"/></g>` : '') + `</g>`;
  };
  const spot = (v, kind) => {
    const city = kind === 'city', r = city ? (big ? 32 : 20) : (big ? 27 : 17), k = city ? r / 30 : r / 22;
    return `<g class="hs" data-v="${v}" data-k="${kind}" transform="translate(${V[v].x * U} ${V[v].y * U})"><circle class="hc ${city ? 'city' : ''}" r="${r}"/><circle r="${big ? r : 23}" fill="transparent"/>`
      + (mixed ? `<g class="hg" transform="scale(${k}) translate(0 ${city ? 6 : 2})">${pieceGlyph(city ? 'city' : 'settle', col)}</g>` : '') + `</g>`;
  };
  const P = S.pick, not = (type, id) => !(P && P.type === type && P.id === id);
  let preview = '';
  if (P && P.type === 'road') {
    const [a, c] = S.board.edges[P.id].v.map(i => V[i]), ax = a.x * U, ay = a.y * U, cx = c.x * U, cy = c.y * U, k = .14;
    const x1 = ax + (cx - ax) * k, y1 = ay + (cy - ay) * k, x2 = cx - (cx - ax) * k, y2 = cy - (cy - ay) * k, ln = (w, stroke, extra = '') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" ${extra}/>`;
    preview = `<g class="pv" data-confirm="1" role="button" aria-label="Tap to build this road">${ln(52, 'transparent')}${ln(27, '#fff', 'stroke-opacity=".9"')}${ln(22.5, '#1b1b1b')}${ln(16.5, col)}${ln(4, '#fff', 'stroke-opacity=".4" transform="translate(0 -3.5)"')}</g>`;
  } else if (P) {
    const city = P.type === 'city', x = V[P.id].x * U, y = V[P.id].y * U, r = city ? 48 : 40;
    preview = `<g class="pv" data-confirm="1" role="button" aria-label="Tap to build"><g transform="translate(${x} ${y})"><circle class="pvring" r="${r}"/><g transform="scale(${city ? 1.3 : 1.72})" filter="url(#f-shadow)">${city ? cityHouseSvg(col, true) : houseSvg(col, true)}</g></g></g>`;
  }
  return sets.road.filter(e => not('road', e)).map(road).join('') + sets.settle.filter(v => not('settle', v)).map(v => spot(v, 'settle')).join('') + sets.city.filter(v => not('city', v)).map(v => spot(v, 'city')).join('') + preview;
}

async function onBoardTap(el) {
  const mode = currentMode(); if (!mode || !el) return;
  if (mode !== 'robber' && S.pick && el.closest('[data-confirm]')) return confirmPick();   // second tap: the piece itself
  const t = el.closest('[data-v],[data-e],[data-t]');
  if (!t) { if (S.pick) { S.pick = null; updateGame(); } return; }                          // tapping the sea or a tile cancels the preview
  if (t.dataset.v != null) { S.pick = { type: t.dataset.k === 'city' ? 'city' : 'settle', id: +t.dataset.v }; updateGame(); }
  else if (t.dataset.e != null) { S.pick = { type: 'road', id: +t.dataset.e }; updateGame(); }
  else if (t.dataset.t != null && mode === 'robber') {
    const tile = +t.dataset.t, victims = robberVictims(tile);
    if (victims.length > 1) return openSteal(tile, victims);
    act({ type: 'robber', tile, victim: victims[0] });
  }
}
// The tapped spot shows the piece in your color with a green tick. Tapping that piece builds it.
async function confirmPick() {
  const p = S.pick; if (!p || S.placing) return;
  S.placing = true;
  try { await act(p.type === 'road' ? { type: 'road', edge: p.id } : { type: p.type, vertex: p.id }); } finally { S.placing = false; }
  S.pick = null; updateGame();
}
function validatePick() {
  if (!S.pick) return;
  const mode = S.state && currentMode();
  if (!mode || mode === 'robber' || !(modeSets(mode)[S.pick.type] || []).includes(S.pick.id)) S.pick = null;
}
function pickText() { return `Tap the ${S.pick.type === 'road' ? 'road' : S.pick.type === 'city' ? 'city' : 'settlement'} to place it, or tap another spot`; }
function modeSets(mode) {
  const sets = { road: [], settle: [], city: [] }, st = S.state;
  if (mode === 'setupSettle') sets.settle = validSettle(false);
  else if (mode === 'settle') sets.settle = validSettle(true);
  else if (mode === 'city') sets.city = myCitySpots();
  else if (mode === 'setupRoad') sets.road = validRoads(st.setup.last);
  else if (mode === 'road' || mode === 'freeRoad') sets.road = validRoads();
  else if (mode === 'auto') Object.assign(sets, buildable());
  return sets;
}
function robberVictims(tile) {
  const st = S.state, set = new Set();
  S.board.tiles[tile].vertices.forEach(v => {
    const b = st.buildings[v];
    if (b && b.p !== me() && st.players[b.p].cards > 0 && !(st.opts.friendlyRobber && st.players[b.p].vp < 3)) set.add(b.p);
  });
  return [...set];
}
// Build modes stay active while still possible, so roads can be chained; onState drops them otherwise.
function modePossible(kind) {
  const P = S.state.players[me()];
  if (kind === 'road') return canAfford(COST.road) && P.pieces.road > 0 && validRoads().length > 0;
  if (kind === 'settle') return canAfford(COST.settlement) && P.pieces.settlement > 0 && validSettle(true).length > 0;
  if (kind === 'city') return canAfford(COST.city) && P.pieces.city > 0 && myCitySpots().length > 0;
  return false;
}
function afterBuild() {}

// Pan, pinch and wheel zoom; a short tap passes through to the board element under the finger.
function applyVB() {
  const v = S.vb, B = S.base;
  if (B) {   // keep the framed board in view: the centre of the screen can't leave the board area
    const cx = Math.max(B.x, Math.min(B.x + B.w, v.x + v.w / 2)), cy = Math.max(B.y, Math.min(B.y + B.h, v.y + v.h / 2));
    v.x = cx - v.w / 2; v.y = cy - v.h / 2;
  }
  $('#board').setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
}
function svgPoint(svg, cx, cy) { const p = svg.createSVGPoint(); p.x = cx; p.y = cy; return p.matrixTransform(svg.getScreenCTM().inverse()); }
function zoomAt(svg, cx, cy, f) {
  const p = svgPoint(svg, cx, cy), v = S.vb;
  const w = Math.max(S.base.w * 0.3, Math.min(S.base.w * 1.25, v.w / f)); const k = v.w / w;
  S.vb = { x: p.x - (p.x - v.x) / k, y: p.y - (p.y - v.y) / k, w, h: v.h / k };
  applyVB();
}
function zoomCenter(f) { const svg = $('#board'), r = svg.getBoundingClientRect(); zoomAt(svg, r.left + r.width / 2, r.top + r.height / 2, f); }
function setupPanZoom(svg) {
  const pts = new Map(); let downTarget = null, moved = 0, pinchD = 0;
  svg.addEventListener('pointerdown', e => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) { downTarget = e.target; moved = 0; }
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); moved = 99; }
    try { svg.setPointerCapture(e.pointerId); } catch {}
  });
  svg.addEventListener('pointermove', e => {
    const prev = pts.get(e.pointerId); if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY }; pts.set(e.pointerId, cur);
    if (pts.size === 1) {
      const dx = cur.x - prev.x, dy = cur.y - prev.y; moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 8) {
        svg.classList.add('dragging');
        const scale = svg.getScreenCTM().a;
        S.vb.x -= dx / scale; S.vb.y -= dy / scale; applyVB();
      }
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchD) zoomAt(svg, (a.x + b.x) / 2, (a.y + b.y) / 2, d / pinchD);
      pinchD = d;
    }
  });
  const end = e => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId); svg.classList.remove('dragging');
    if (e.type === 'pointerup' && pts.size === 0 && moved <= 8) onBoardTap(downTarget);
    if (pts.size < 2) pinchD = 0;
  };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  svg.addEventListener('wheel', e => { e.preventDefault(); zoomAt(svg, e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
}

function drawDice(d, roll) {
  const box = $('#dice'); if (!box || !d) return;
  const layout = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const face = (n, red) => `<div class="die ${red ? 'red' : ''} ${roll ? 'rolling' : ''}">${Array.from({ length: 9 }, (_, i) => `<i class="${layout[n].includes(i) ? 'on' : ''}"></i>`).join('')}</div>`;
  box.innerHTML = face(d[0], false) + face(d[1], true) + `<span class="die-sum">${d[0] + d[1]}</span>`;
  box.setAttribute('aria-label', `Dice show ${d[0]} and ${d[1]}`);
}

const ARC = '<svg class="ic" viewBox="0 0 32 32" aria-hidden="true"><path d="M4,24 Q16,0 28,24" fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round"/></svg>';
function drawPlayers() {
  const st = S.state, leader = Math.max(...st.players.map(p => p.vp));
  const bank = `<div class="bank" title="Cards left in the bank, and development cards left in the pile">${RES.map(k => `<span class="bk ${k}" title="${RES_LABEL[k]} left in the bank">${icon(k)}<b>${st.bank[k]}</b></span>`).join('')}<button class="bk dev" data-pile title="Development cards left in the pile. Tap to see what is still unseen.">${icon('dev')}<b>${st.devLeft}</b></button></div>`;
  $('#players').innerHTML = bank + st.players.map((p, i) => {
    const turn = st.turn === i && st.phase !== 'ended';
    const crown = p.vp === leader && leader >= 3 ? `<span class="crown">${icon('monopoly')}</span>` : '';
    const skippable = st.players[me()].host && i !== me() && !p.connected && (st.turn === i || (st.subphase === 'discard' && st.pendingDiscards[i]));
    const piece = (k, n, label) => `<span class="pp" title="${label} left to build" style="color:${p.color}">${icon(k)}<b>${n}</b></span>`;
    const badges = [];
    if (st.longestRoad && st.longestRoad.p === i) badges.push(`<span class="badge">${icon('road')} Longest Road</span>`);
    if (st.largestArmy && st.largestArmy.p === i) badges.push(`<span class="badge">${icon('knight')} Largest Army</span>`);
    return `<div class="pcard ${turn ? 'turn' : ''}" style="--pc:${p.color}">
      <span class="vpb" title="Victory points (first to ${st.vpTarget})">${crown}${p.vp}</span>
      <div class="tag">${p.bot ? icon('bot', 'boticon') : `<span class="dot ${p.connected ? '' : 'off'}"></span>`}<span class="nm">${esc(p.name)}${i === me() ? ' (you)' : ''}</span>${p.bot ? `<span class="lv lvl-${p.bot}" title="${LEVEL_LABEL[p.bot]} bot">${LEVEL_LABEL[p.bot][0]}</span>` : ''}</div>
      <div class="ptiles">
        <span class="pt devt" title="Development cards in hand: ${p.devCount}" aria-label="${p.devCount} development cards in hand"><i>?</i><b class="dn${p.devCount > 9 ? ' two' : ''}">${p.devCount}</b></span>
        <span class="pt knt" title="Knights played">${icon('knight')}<b class="cnt">${p.knights}</b></span>
        <span class="pt plain" title="Resource cards in hand">${icon('cards')}<b>${p.cards}</b></span>
        <span class="pt plain" title="Longest road">${ARC}<b>${p.roadLen}</b></span>
      </div>
      <div class="ppieces">${piece('road', p.pieces.road, 'Roads')}${piece('settlement', p.pieces.settlement, 'Settlements')}${piece('city', p.pieces.city, 'Cities')}</div>
      ${badges.length ? `<div class="row badges" style="margin-top:.35rem;gap:.3rem">${badges.join('')}</div>` : ''}
      ${st.pendingDiscards[i] ? `<div class="muted" style="font-size:.85em;margin-top:.2rem">Discarding ${st.pendingDiscards[i]}</div>` : ''}
      ${skippable ? `<button class="btn small" style="margin-top:.4rem" data-skip>Skip offline player</button>` : ''}
      ${turn ? `<div class="yourturn">${i === me() ? 'Your turn' : esc(p.name) + "'s turn"}<span class="tm"></span></div>` : ''}
    </div>`;
  }).join('');
  $('#players').style.setProperty('--np', st.players.length);
  $$('[data-skip]').forEach(b => b.onclick = () => act({ type: 'skip' }));
  $$('[data-pile]').forEach(b => b.onclick = openDevPile);
}

function drawBanner() {
  const st = S.state, p = st.players[st.turn], mine = myTurn(), b = $('#banner');
  let t = '';
  if (st.phase === 'ended') t = `${st.players[st.winner].name} wins with ${st.players[st.winner].vp} points`;
  else if (st.phase === 'setup') {
    const which = st.setup.round === 1 ? 'first' : 'second';
    t = mine ? (st.setup.expect === 'settlement' ? `Place your ${which} settlement on a glowing corner` : 'Place a road touching that settlement') + (st.setup.round === 2 && st.setup.expect === 'settlement' ? '. It collects starting resources.' : '')
      : p.bot ? `${p.name} is choosing a spot…` : `${p.name} is placing a ${st.setup.expect}`;
  } else if (st.subphase === 'discard') {
    const mineN = st.pendingDiscards[me()];
    t = mineN ? `Discard ${mineN} cards` : `Waiting for ${Object.keys(st.pendingDiscards).map(i => st.players[i].name).join(', ')} to discard`;
  } else if (st.subphase === 'robber') t = mine ? (st.opts.friendlyRobber ? 'Move the robber to a glowing tile. Players with 2 points or fewer are protected' : 'Tap a tile to move the robber') : `${p.name} is moving the robber`;
  else if (st.subphase === 'roadBuilding') t = mine ? `Place ${plural(st.freeRoads, 'free road')}` : `${p.name} is placing free roads`;
  else if (mine) {
    const m = currentMode();
    t = !st.rolled ? 'Your turn: roll the dice' : m === 'road' ? 'Tap a glowing edge to build a road' : m === 'settle' ? 'Tap a glowing corner to settle' : m === 'city' ? 'Tap one of your settlements to upgrade it' : m === 'auto' && autoCount() ? 'Tap a glowing spot to build, tap your cards to trade, or end your turn' : 'Build, trade, or end your turn';
  } else t = p.bot ? `${p.name} is thinking…` : `${p.name}'s turn`;
  if (S.pick && mine) t = pickText();
  b.textContent = t; b.classList.toggle('you', mine || !!st.pendingDiscards[me()]);
}

const DEV_ORDER = ['knight', 'vp', 'roadBuilding', 'yearOfPlenty', 'monopoly'];
function drawHand() {
  const st = S.state, r = st.me.res, held = {};
  st.me.dev.forEach(d => { const h = held[d.type] || (held[d.type] = { n: 0, fresh: 0 }); h.n++; if (d.fresh) h.fresh++; });
  $('#hand').innerHTML = RES.map(k => `<div class="card ${k} ${r[k] ? '' : 'zero'}" data-res="${k}" role="button" tabindex="0" title="${RES_LABEL[k]}: ${r[k]}. Tap to trade.">${icon(k)}<span class="lbl">${RES_LABEL[k]}</span>${r[k] ? `<span class="n">${r[k]}</span>` : ''}</div>`).join('')
    + '<span class="hsep"></span>'
    + (DEV_ORDER.filter(t => held[t]).map(t => `<button class="card devc ${t}" data-dev="${t}" title="${DEV[t].name} x${held[t].n}${held[t].fresh ? ` (${held[t].fresh} bought this turn)` : ''}">${icon(t)}<span class="lbl">${DEV[t].name.split(' ')[0]}</span><span class="n">${held[t].n}</span></button>`).join('')
      || `<button class="card devc zero" data-dev="none" title="No development cards yet">${icon('dev')}<span class="lbl">Dev</span></button>`);
  $$('#hand [data-dev]').forEach(b => b.onclick = () => { S.tw = null; if (S.mode) S.mode = null; updateGame(); openDev(); });
  $$('#hand [data-res]').forEach(c => { c.onclick = () => handTap(c.dataset.res); c.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handTap(c.dataset.res); } }; });
}
// Tapping one of your resources opens the trade window with that card offered; keep tapping to offer more.
function handTap(k) {
  const st = S.state;
  if (st.phase !== 'main') return toast('Trading opens once setup is finished.');
  if (!myTurn()) return toast('You can trade on your turn.');
  if (!st.rolled) return toast('Roll the dice before trading.');
  if (st.subphase) return toast('Finish the current step before trading.');
  if (!st.me.res[k]) return toast(`You have no ${RES_LABEL[k]} to offer.`);
  if (!S.tw) { S.mode = null; S.tw = { give: {}, get: {} }; }
  if (S.tw.get[k]) return toast('You are already asking for that.', 'err');
  if ((S.tw.give[k] || 0) < st.me.res[k]) S.tw.give[k] = (S.tw.give[k] || 0) + 1;
  updateGame();
}
function openDevPile() {
  const st = S.state, tot = st.devPile.total, played = st.devPile.played, mine = {};
  st.me.dev.forEach(d => { mine[d.type] = (mine[d.type] || 0) + 1; });
  const total = Object.values(tot).reduce((a, b) => a + b, 0);
  const rows = DEV_ORDER.map(t => {
    const unseen = Math.max(0, (tot[t] || 0) - (played[t] || 0) - (mine[t] || 0));
    return `<div class="devrow">${icon(t)}<div class="txt"><b>${DEV[t].name}</b><small>${DEV[t].text}</small></div>`
      + `<div class="pilecnt"><b>${unseen}</b><small>unseen</small></div><div class="pilecnt"><b>${played[t] || 0}</b><small>played</small></div><div class="pilecnt"><b>${mine[t] || 0}</b><small>yours</small></div></div>`;
  }).join('');
  openModal('pile', `<h3>Development card pile</h3><p><b>${st.devLeft}</b> of ${total} cards are still in the pile. <b>Unseen</b> cards have not been played and are not in your hand, so they are in the pile or in another player's hand.</p><div class="devlist">${rows}</div><div class="foot"><button class="btn primary" id="pclose">Close</button></div>`, () => { $('#pclose').onclick = closeModal; });
}

function costIcons(c) { return `<span class="cost">${Object.entries(c).flatMap(([k, n]) => Array(n).fill(icon(k))).join('')}</span>`; }
function drawActions() {
  const st = S.state, box = $('#actions'), mine = myTurn(), P = st.players[me()];
  if (st.phase === 'ended') { box.innerHTML = `<button class="act go" id="res">${icon('vp')}Results</button><button class="act" id="home">${icon('settlement')}New game</button>`; $('#res').onclick = openLeaderboard; $('#home').onclick = () => leaveToHome(); return; }
  if (st.phase === 'setup' || !mine) { box.innerHTML = ''; return; }
  if (st.subphase) { box.innerHTML = ''; return; }
  const m = S.mode;
  const btn = (id, label, ic, cost, enabled, pressed) => `<button class="act" id="${id}" ${enabled ? '' : 'disabled'} aria-pressed="${!!pressed}">${icon(ic)}${label}${cost ? costIcons(cost) : ''}</button>`;
  if (!st.rolled) {
    const knight = st.me.dev.some(d => d.type === 'knight' && !d.fresh) && !st.devPlayed;
    box.innerHTML = `<button class="act go" id="roll">${diceIcon()}Roll dice</button>` + (knight ? btn('kn', 'Knight', 'knight', null, true) : '');
    $('#roll').onclick = async e => { e.currentTarget.disabled = true; const r = await act({ type: 'roll' }); if (!r.ok && $('#roll')) $('#roll').disabled = false; };
    if ($('#kn')) $('#kn').onclick = () => act({ type: 'playDev', card: 'knight' });
    return;
  }
  // No build or trade buttons: every legal spot glows on the map once you can afford it, and tapping your cards opens trading.
  box.innerHTML = btn('b-dev', 'Dev card', 'dev', COST.dev, canAfford(COST.dev) && st.devLeft > 0)
    + `<button class="act go" id="b-end">${icon('vp')}End turn</button>`;
  $$('#actions .act .ic').forEach(i => { i.style.color = P.color; });
  $('#b-dev').onclick = async () => { const r = await act({ type: 'buyDev' }); if (r.ok && r.result) toast(`${icon(r.result.card)} You drew ${DEV[r.result.card].name}`, 'gain', true); };
  $('#b-end').onclick = () => { S.mode = null; act({ type: 'endTurn' }); };
}
function diceIcon() { return `<svg class="ic" viewBox="0 0 32 32"><rect x="4" y="4" width="24" height="24" rx="5" fill="#fffdf6" stroke="#182730" stroke-width="2"/><circle cx="11" cy="11" r="2.4" fill="#182730"/><circle cx="16" cy="16" r="2.4" fill="#182730"/><circle cx="21" cy="21" r="2.4" fill="#182730"/></svg>`; }

function drawLog() {
  const st = S.state, box = $('#log'); if (!box) return;
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  const names = st.players.map(p => [esc(p.name), p.color]).sort((a, b) => b[0].length - a[0].length);
  const paint = t => { let s = esc(t); names.forEach(([n, c]) => { s = s.split(n).join(`<b style="color:${c}">${n}</b>`); }); return s; };
  box.innerHTML = st.log.map(l => l.chat != null && st.players[l.chat]
    ? `<p class="chat"><b style="color:${st.players[l.chat].color}">${esc(st.players[l.chat].name)}:</b> ${esc(l.text)}</p>` : `<p>${paint(l.text)}</p>`).join('');
  if (atBottom) box.scrollTop = box.scrollHeight;
}

function resLine(r) { return RES.filter(k => r[k]).map(k => `${r[k]}${icon(k)}`).join(' '); }
function drawOffer() {
  const st = S.state, box = $('#offer'), t = st.trade;
  if (!t || st.phase !== 'main') { box.innerHTML = ''; return; }
  const from = st.players[t.from];
  if (t.from === me()) {
    const acc = t.accepted.map(i => `<button class="btn small primary" data-with="${i}">Trade with ${esc(st.players[i].name)}</button>`).join('');
    const waiting = st.players.map((p, i) => i).filter(i => i !== me() && !t.accepted.includes(i) && !t.declined.includes(i));
    box.innerHTML = `<div class="panel stack"><b>Your offer</b>
      <div class="offer-line">You give ${resLine(t.give)}</div><div class="offer-line">You get ${resLine(t.get)}</div>
      ${acc ? `<div class="row">${acc}</div>` : ''}
      <div class="muted" style="font-size:.88em">${t.declined.length ? 'Declined: ' + t.declined.map(i => esc(st.players[i].name)).join(', ') + '. ' : ''}${waiting.length ? 'Waiting on ' + waiting.map(i => esc(st.players[i].name)).join(', ') + '.' : ''}</div>
      <button class="btn small" id="tcancel">Withdraw offer</button></div>`;
    $$('[data-with]').forEach(b => b.onclick = () => act({ type: 'confirm', with: +b.dataset.with }));
    $('#tcancel').onclick = () => act({ type: 'cancelTrade' });
  } else {
    const can = RES.every(k => st.me.res[k] >= (t.get[k] || 0));
    const status = t.accepted.includes(me()) ? 'You accepted. Waiting for them to confirm.' : t.declined.includes(me()) ? 'You declined.' : '';
    box.innerHTML = `<div class="panel stack"><b style="color:${from.color}">${esc(from.name)} offers a trade</b>
      <div class="offer-line">You get ${resLine(t.give)}</div><div class="offer-line">You give ${resLine(t.get)}</div>
      ${status ? `<div class="muted" style="font-size:.9em">${status}</div>` : ''}
      <div class="row"><button class="btn small primary" id="tacc" ${can ? '' : 'disabled'}>${can ? 'Accept' : 'Not enough cards'}</button><button class="btn small" id="tdec">Decline</button></div></div>`;
    $('#tacc').onclick = () => act({ type: 'respond', accept: true });
    $('#tdec').onclick = () => act({ type: 'respond', accept: false });
  }
}

// ---------- modals ----------
function openModal(kind, html, bind) {
  S.modal = kind;
  const layer = $('#modal');
  layer.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  layer.hidden = false;
  layer.onclick = e => { if (e.target === layer && kind !== 'discard') closeModal(); };
  if (bind) bind(layer);
  const f = layer.querySelector('button, input'); if (f) f.focus({ preventScroll: true });
}
function closeModal() { S.modal = null; const l = $('#modal'); l.hidden = true; l.innerHTML = ''; }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.modal && S.modal !== 'discard') closeModal(); });

function syncModals() {
  const st = S.state;
  const need = st.subphase === 'discard' && st.pendingDiscards[me()];
  if (need && S.modal !== 'discard') openDiscard();
  if (!need && S.modal === 'discard') closeModal();
  if (S.modal === 'steal' && st.subphase !== 'robber') closeModal();
}

function qtyRow(prefix, vals, max) {
  return `<div class="res-grid qty-grid">${RES.map(k => `<div class="res-pick">${icon(k)}<span>${RES_LABEL[k]}</span>
    <div class="qty"><button data-q="${prefix}:${k}:-1" aria-label="Less ${RES_LABEL[k]}">−</button><output id="${prefix}-${k}">${vals[k]}</output><button data-q="${prefix}:${k}:1" aria-label="More ${RES_LABEL[k]}">+</button></div>
    ${max ? `<small class="muted">of ${max[k]}</small>` : ''}</div>`).join('')}</div>`;
}
function bindQty(layer, groups, onChange) {
  layer.querySelectorAll('[data-q]').forEach(b => b.onclick = () => {
    const [g, k, d] = b.dataset.q.split(':');
    const grp = groups[g]; const nv = grp.vals[k] + +d;
    if (nv < 0 || (grp.max && nv > grp.max[k]) || nv > 20) return;
    grp.vals[k] = nv; layer.querySelector(`#${g}-${k}`).textContent = nv; onChange();
  });
}

function openDiscard() {
  const st = S.state, need = st.pendingDiscards[me()], limit = st.opts.discardLimit;
  const cards = []; RES.forEach(k => { for (let i = 0; i < st.me.res[k]; i++) cards.push(k); });   // one entry per card in hand
  const picked = new Set();
  openModal('discard', `<h3>The robber strikes!</h3><p>You hold more than ${limit} cards. Tap ${need} of them to give back to the bank.</p>
    <div class="dcards">${cards.map((k, i) => `<button class="dcard ${k}" data-i="${i}" data-res="${k}" style="--d:${i}" aria-pressed="false" aria-label="${RES_LABEL[k]}">${icon(k)}<span class="x" aria-hidden="true">✕</span></button>`).join('')}</div>
    <div class="dmeter" id="dmeter"></div>
    <div class="foot"><span class="muted grow" id="dleft"></span><button class="btn" id="dauto">Auto-pick</button><button class="btn primary" id="dgo" disabled>Discard</button></div>`, layer => {
    const upd = () => {
      layer.querySelectorAll('.dcard').forEach(b => b.setAttribute('aria-pressed', picked.has(+b.dataset.i)));
      $('#dleft').textContent = `${picked.size} of ${need} chosen`;
      $('#dmeter').innerHTML = Array.from({ length: need }, (_, i) => `<i class="${i < picked.size ? 'on' : ''}"></i>`).join('');
      $('#dgo').disabled = picked.size !== need;
    };
    layer.querySelectorAll('.dcard').forEach(b => b.onclick = () => {
      const i = +b.dataset.i;
      if (picked.has(i)) picked.delete(i);
      else if (picked.size < need) picked.add(i);
      else { const m = $('#dmeter'); m.classList.remove('shake'); void m.offsetWidth; m.classList.add('shake'); Sound.play('error'); return; }
      upd();
    });
    $('#dauto').onclick = () => {   // give back the cards you hold most of
      picked.clear(); const left = {}; cards.forEach(k => { left[k] = (left[k] || 0) + 1; });
      for (let n = 0; n < need; n++) { const k = RES.slice().sort((a, b) => (left[b] || 0) - (left[a] || 0))[0]; picked.add(cards.findIndex((c, j) => c === k && !picked.has(j))); left[k]--; }
      upd();
    };
    $('#dgo').onclick = async () => {
      const res = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 }; picked.forEach(i => { res[cards[i]]++; });
      $('#dgo').disabled = true; $('#dauto').disabled = true;
      const els = [...picked].map(i => layer.querySelector(`.dcard[data-i="${i}"]`)), box = layer.querySelector('.modal');
      Sound.play('discard'); box.classList.add('leaving');
      await flyAway(els);
      const r = await act({ type: 'discard', res });
      if (r.ok) closeModal(); else { els.forEach(e => { e.style.visibility = ''; }); box.classList.remove('leaving'); $('#dauto').disabled = false; upd(); }
    };
    upd();
  });
}

function openSteal(tile, victims) {
  const st = S.state;
  openModal('steal', `<h3>Steal a card</h3><p>Choose whose card to take.</p><div class="stack">${victims.map(i => `<button class="btn" data-vic="${i}"><span class="chip" style="background:${st.players[i].color}"></span>${esc(st.players[i].name)}, ${plural(st.players[i].cards, 'card')}</button>`).join('')}</div>
    <div class="foot"><button class="btn" id="cx">Pick another tile</button></div>`, layer => {
    layer.querySelectorAll('[data-vic]').forEach(b => b.onclick = async () => { const r = await act({ type: 'robber', tile, victim: +b.dataset.vic }); if (r.ok) closeModal(); });
    $('#cx').onclick = closeModal;
  });
}

// ---------- trade window ----------
// Same idea as the reference: pick what you want in the top row, tap cards in your hand to offer them,
// then press the bank tick or the players tick. The cross closes the window.
const TW_ICON = {
  bank: '<svg class="ic" viewBox="0 0 32 32"><g fill="currentColor"><path d="M16,3 L29,10 V12 H3 V10Z"/><rect x="5" y="14" width="3.6" height="10"/><rect x="11" y="14" width="3.6" height="10"/><rect x="17.4" y="14" width="3.6" height="10"/><rect x="23.4" y="14" width="3.6" height="10"/><rect x="3" y="25" width="26" height="3.5"/></g></svg>',
  people: '<svg class="ic" viewBox="0 0 32 32"><g fill="currentColor"><circle cx="16" cy="9" r="5"/><circle cx="6.5" cy="12" r="3.8"/><circle cx="25.5" cy="12" r="3.8"/><path d="M7,28 C7,19 10.5,16 16,16 C21.5,16 25,19 25,28Z"/><path d="M0.5,26 C0.5,19.5 3,17.5 6.5,17.5 C5.5,19.5 5,22 5,26Z"/><path d="M31.5,26 C31.5,19.5 29,17.5 25.5,17.5 C26.5,19.5 27,22 27,26Z"/></g></svg>',
  me: '<svg class="ic" viewBox="0 0 32 32"><g fill="currentColor"><path d="M8,8 H24 V10 H8Z"/><path d="M11,8 C11,2 21,2 21,8Z"/><circle cx="16" cy="15.5" r="5"/><path d="M6,30 C6,21 10,19 16,19 C22,19 26,21 26,30Z"/></g></svg>',
  check: '<svg class="ic" viewBox="0 0 32 32"><path d="M6,17 L13,24 L26,8" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cross: '<svg class="ic" viewBox="0 0 32 32"><path d="M7,7 L25,25 M25,7 L7,25" fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round"/></svg>',
  down: '<svg class="arr" viewBox="0 0 24 28"><path d="M8,2 H16 V13 H21 L12,25 L3,13 H8Z" fill="#36c24f" stroke="#0e5d20" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  up: '<svg class="arr" viewBox="0 0 24 28"><path d="M8,26 H16 V15 H21 L12,3 L3,15 H8Z" fill="#e33a33" stroke="#7a1511" stroke-width="1.6" stroke-linejoin="round"/></svg>',
};
function drawTrade() {
  const el = $('#tradewin'); if (!el) return;
  const st = S.state, ok = S.tw && myTurn() && st.phase === 'main' && st.rolled && !st.subphase;
  $('#wrap').classList.toggle('trading', !!ok);
  if (!ok) { if (S.tw) S.tw = null; el.hidden = true; el.innerHTML = ''; return; }
  const T = S.tw, hand = st.me.res, ratios = st.me.ratios, col = st.players[me()].color;
  RES.forEach(k => { T.give[k] = Math.min(T.give[k] || 0, hand[k]); T.get[k] = T.get[k] || 0; });
  const card = (k, n, attr, extra = '', dim = false) => `<button class="tcard ${k} ${dim ? 'dim' : ''}" ${attr} aria-label="${RES_LABEL[k]}">${icon(k)}${n ? `<b class="cnt">${n}</b>` : ''}${extra}</button>`;
  const want = RES.map(k => card(k, T.get[k], `data-want="${k}"`)).join('');
  const getSel = RES.filter(k => T.get[k]).map(k => card(k, T.get[k], `data-unwant="${k}"`)).join('') || '<span class="thint">Tap what you want above</span>';
  const giveSel = RES.filter(k => T.give[k]).map(k => card(k, T.give[k], `data-ungive="${k}"`)).join('') || '<span class="thint">Tap cards in your hand to offer</span>';
  const handRow = RES.map(k => hand[k] ? card(k, hand[k] - T.give[k], `data-give="${k}"`, `<small class="rt" title="Your bank rate for ${RES_LABEL[k]}">${ratios[k]}:1</small>`, hand[k] - T.give[k] === 0) : '').join('') || '<span class="thint light">You have no cards to trade</span>';
  const gk = RES.filter(k => T.give[k]), wk = RES.filter(k => T.get[k]);
  let bank = null, hint = 'Pick what you want, then what you give.';
  if (gk.length === 1 && wk.length === 1 && gk[0] !== wk[0]) {
    const g = gk[0], w = wk[0], r = ratios[g], m = T.get[w];
    if (T.give[g] === r * m) { bank = { g, w, m, r }; hint = `Bank: ${r * m} ${RES_LABEL[g]} for ${m} ${RES_LABEL[w]}`; if (st.bank[w] < m) { bank = null; hint = `The bank only has ${st.bank[w]} ${RES_LABEL[w]}`; } }
    else hint = `Bank rate for ${RES_LABEL[g]} is ${r} to 1: give ${r * m} ${RES_LABEL[g]} for ${m} ${RES_LABEL[w]}, or offer this to players.`;
  } else if (gk.length && wk.length) hint = 'Offer this deal to the other players, or pick one kind each for the bank.';
  const player = gk.length > 0 && wk.length > 0 && !gk.some(k => T.get[k]);
  el.hidden = false;
  el.innerHTML = `<div class="tw-main">
      <div class="tw-panel tw-want"><span class="tw-bank" title="Bank and harbors">${TW_ICON.bank}</span><div class="tw-cards">${want}</div></div>
      <div class="tw-panel tw-sel">
        <div class="tw-row"><span class="tw-who">${TW_ICON.people}</span>${TW_ICON.down}<div class="tw-cards">${getSel}</div></div>
        <div class="tw-row"><span class="tw-who me" style="background:${col}">${TW_ICON.me}</span>${TW_ICON.up}<div class="tw-cards">${giveSel}</div></div>
        <p class="tw-hint" id="tw-hint">${esc(hint)}</p>
      </div>
      <div class="tw-panel tw-hand">${handRow}</div>
    </div>
    <div class="tw-btns">
      <button class="tw-btn" id="tw-bank" ${bank ? '' : 'disabled'} title="Trade with the bank" aria-label="Trade with the bank">${TW_ICON.bank}<span class="tick">${TW_ICON.check}</span></button>
      <button class="tw-btn" id="tw-players" ${player ? '' : 'disabled'} title="Offer to the other players" aria-label="Offer to the other players">${TW_ICON.people}<span class="tick">${TW_ICON.check}</span></button>
      <button class="tw-btn cancel" id="tw-close" title="Close" aria-label="Close the trade window">${TW_ICON.cross}</button>
    </div>`;
  const redraw = () => drawTrade();
  const bump = (obj, k, d, max) => { obj[k] = Math.max(0, Math.min(max, (obj[k] || 0) + d)); redraw(); };
  el.querySelectorAll('[data-want]').forEach(b => b.onclick = () => { const k = b.dataset.want; if (T.give[k]) return toast('You are already offering that.', 'err'); bump(T.get, k, 1, 19); });
  el.querySelectorAll('[data-unwant]').forEach(b => b.onclick = () => bump(T.get, b.dataset.unwant, -1, 19));
  el.querySelectorAll('[data-give]').forEach(b => b.onclick = () => { const k = b.dataset.give; if (T.get[k]) return toast('You are already asking for that.', 'err'); if (hand[k] - T.give[k] > 0) bump(T.give, k, 1, hand[k]); });
  el.querySelectorAll('[data-ungive]').forEach(b => b.onclick = () => bump(T.give, b.dataset.ungive, -1, 99));
  $('#tw-close').onclick = () => { S.tw = null; updateGame(); };
  if (bank) $('#tw-bank').onclick = async () => {
    for (let i = 0; i < bank.m; i++) { const r = await act({ type: 'bankTrade', give: bank.g, get: bank.w }); if (!r.ok) break; }
    if (S.tw) { S.tw.give = {}; S.tw.get = {}; drawTrade(); }
  };
  if (player) $('#tw-players').onclick = async () => {
    const clean = o => Object.fromEntries(Object.entries(o).filter(([, n]) => n));
    const r = await act({ type: 'offer', give: clean(T.give), get: clean(T.get) });
    if (r.ok) { S.tw = null; updateGame(); }
  };
}

function openDev() {
  const st = S.state, mine = myTurn() && st.phase === 'main' && !st.subphase;
  const groups = {};
  st.me.dev.forEach(d => { const g = groups[d.type] || (groups[d.type] = { ready: 0, fresh: 0 }); d.fresh ? g.fresh++ : g.ready++; });
  const rows = Object.keys(DEV).filter(k => groups[k]).map(k => {
    const g = groups[k], playable = k !== 'vp' && mine && g.ready > 0 && !st.devPlayed;
    const why = k === 'vp' ? 'Counts automatically' : !mine ? 'Play on your turn' : st.devPlayed ? 'One card per turn' : !g.ready ? 'Playable next turn' : '';
    return `<div class="devrow">${icon(k)}<div class="txt"><b>${DEV[k].name} × ${g.ready + g.fresh}</b><small>${DEV[k].text}</small></div>${playable ? `<button class="btn small primary" data-play="${k}">Play</button>` : `<small class="muted">${why}</small>`}</div>`;
  }).join('');
  openModal('dev', `<h3>Development cards</h3>${rows ? `<div class="devlist">${rows}</div>` : '<p>No development cards yet. Buy one for sheep, hay and ore.</p>'}<div class="foot"><button class="btn" id="dclose">Close</button></div>`, layer => {
    $('#dclose').onclick = closeModal;
    layer.querySelectorAll('[data-play]').forEach(b => b.onclick = async () => {
      const k = b.dataset.play;
      if (k === 'yearOfPlenty') return pickResources(2, 'Year of Plenty', 'Take any two resources from the bank.', res => act({ type: 'playDev', card: k, res }));
      if (k === 'monopoly') return pickResources(1, 'Monopoly', 'Every other player gives you all of this resource.', res => act({ type: 'playDev', card: k, res: res[0] }));
      const r = await act({ type: 'playDev', card: k }); if (r.ok) closeModal();
    });
  });
}
function pickResources(n, title, text, done) {
  const picks = [];
  const paint = () => openModal('pick', `<h3>${title}</h3><p>${text}</p><div class="res-grid">${RES.map(k => `<button class="res-pick" data-r="${k}" aria-pressed="${picks.includes(k)}">${icon(k)}${RES_LABEL[k]}${n > 1 ? `<small class="muted">${picks.filter(x => x === k).length || ''}</small>` : ''}</button>`).join('')}</div>
    <div class="foot"><button class="btn" id="pback">Back</button>${n > 1 ? '<button class="btn" id="preset">Reset</button>' : ''}<button class="btn primary" id="pgo" ${picks.length === n ? '' : 'disabled'}>Play card</button></div>`, layer => {
    layer.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { if (n === 1) picks[0] = b.dataset.r; else if (picks.length < n) picks.push(b.dataset.r); paint(); });
    $('#pback').onclick = openDev;
    if ($('#preset')) $('#preset').onclick = () => { picks.length = 0; paint(); };
    $('#pgo').onclick = async () => { const r = await done(picks.slice()); if (r.ok) closeModal(); };
  });
  paint();
}

function openRules() {
  const row = (ic, name, cost, note) => `<div class="devrow">${icon(ic)}<div class="txt"><b>${name}</b><small>${note}</small></div>${costIcons(cost)}</div>`;
  const res = [['wood', 'Wood', 'Forest'], ['brick', 'Brick', 'Hills'], ['sheep', 'Sheep', 'Pasture'], ['wheat', 'Hay', 'Fields'], ['ore', 'Ore', 'Mountains']];
  openModal('rules', `<h3>How to play</h3><div class="rules">
    <section><h4>Goal</h4><p>Be the first to reach the points target on your own turn (10 by default; the host can change it). Settlements are worth 1 point, cities 2, Longest Road 2, Largest Army 2, and each hidden Victory Point card 1.</p></section>
    <section><h4>Setup</h4><p>Each player places a settlement and a road touching it, in turn order. Then it runs backwards, so the last player places both of theirs back to back. Your second settlement pays one card for every tile it touches.</p></section>
    <section><h4>Your turn</h4><ol><li>Roll the dice. Every tile showing that number pays each settlement next to it 1 card and each city 2.</li><li>Trade with other players, or with the bank at 4 to 1 (3 to 1 or 2 to 1 with a harbor).</li><li>Build, or buy a development card.</li><li>End your turn.</li></ol></section>
    <section><h4>Resources</h4><div class="rgrid">${res.map(([k, n, t]) => `<div>${icon(k)} ${n} <span class="muted">from ${t}</span></div>`).join('')}<div><svg class="ic" viewBox="-60 -60 120 120"><polygon points="${ART.HEX}" fill="#f4c46c"/></svg> Desert <span class="muted">makes nothing</span></div></div></section>
    <section><h4>Building</h4><div class="devlist">
      ${row('road', 'Road', COST.road, 'Extends your network.')}
      ${row('settlement', 'Settlement', COST.settlement, '1 point.')}
      ${row('city', 'City', COST.city, '2 points. Replaces a settlement and pays double.')}
      ${row('dev', 'Development card', COST.dev, 'Drawn from a deck of 25.')}</div></section>
    <section><h4>Where pieces can go</h4><ul><li>A settlement needs a free corner at least two roads away from every other settlement and city, and it must touch one of your roads (except during setup). The open end of a single road is fine.</li><li>A road must connect to one of your own roads, settlements or cities. It can run on from the end of another road, but never through a corner holding another player's settlement or city. A road can't be placed on its own, away from your network.</li><li>If an opponent builds on a corner of your road, the road stays but the far side is drawn faded: it no longer links back to your towns and no longer counts as one chain for Longest Road. You can still build onward from its far end.</li></ul></section>
    <section><h4>Rolling a 7</h4><p>Nobody collects. Anyone holding more cards than the discard limit (7 by default) discards half, rounded down. Then the roller moves the robber to another tile, which blocks that tile, and steals one random card from a player next to it.</p></section>
    <section><h4>Development cards</h4><p>25 cards: 14 Knights, 5 Victory Points, 2 Road Building, 2 Year of Plenty, 2 Monopoly. You can play one per turn, but not on the turn you bought it. Knights move the robber; three played Knights earn Largest Army. Victory Point cards stay hidden until you win.</p></section>
    <section><h4>Bonuses</h4><p>Longest Road: 5 or more connected roads, and you must beat the holder to take it. An opponent's settlement built in the middle can cut a road. Largest Army: 3 or more Knights played, and you must beat the holder.</p></section>
    <section><h4>Host options</h4><ul><li><b>Discard limit and amount:</b> how many cards you can hold safely, and whether you lose half or exactly 4.</li><li><b>Move timer:</b> 15, 30 or 60 seconds. If it runs out, the game plays that step for you. Setup placements get 60 seconds.</li><li><b>Friendly robber:</b> the robber can't go next to a player with 2 points or fewer.</li><li><b>Balanced dice:</b> rolls come from a shuffled deck, so totals stay close to the odds.</li></ul></section>
    <section><h4>Bots</h4><p>The host can fill empty seats with Easy, Medium or Hard bots, up to 4 players in total.</p></section>
  </div><div class="foot"><button class="btn primary" id="rclose">Got it</button></div>`, () => { $('#rclose').onclick = closeModal; });
}
const openCosts = openRules;

function recordResult(st) {
  const rec = store.get('record', { games: 0, wins: 0, seen: [] });
  const key = st.code + ':' + st.turnNumber;
  if (rec.seen.includes(key)) return;
  rec.seen = [...rec.seen.slice(-30), key]; rec.games++;
  if (st.winner === st.you) rec.wins++;
  store.set('record', rec);
}
function standings(st) {
  const count = (i, type) => Object.values(st.buildings).filter(b => b.p === i && b.type === type).length;
  return st.players.map((p, i) => ({
    p, i, settlements: count(i, 'settlement'), cities: count(i, 'city'),
    hidden: (p.devReveal || []).filter(d => d === 'vp').length,
    road: st.longestRoad && st.longestRoad.p === i, army: st.largestArmy && st.largestArmy.p === i,
  })).sort((a, b) => (b.i === st.winner) - (a.i === st.winner) || b.p.vp - a.p.vp || b.cities - a.cities || b.p.stats.collected - a.p.stats.collected);
}
function diceChart(counts) {
  const rolls = counts.reduce((a, b) => a + b, 0) || 1, max = Math.max(...counts.slice(2), 1);
  const W = 300, H = 110, bw = W / 11;
  let bars = '';
  for (let n = 2; n <= 12; n++) {
    const x = (n - 2) * bw, h = (counts[n] / max) * (H - 26), exp = ((6 - Math.abs(7 - n)) / 36) * rolls / max * (H - 26);
    const col = n === 7 ? '#e0664f' : (n === 6 || n === 8) ? '#f0cd78' : '#7fb3c2';
    bars += `<rect x="${x + 3}" y="${H - 16 - h}" width="${bw - 6}" height="${h}" rx="2" fill="${col}"><title>${n}: rolled ${counts[n]} times</title></rect>`
      + `<circle cx="${x + bw / 2}" cy="${H - 16 - exp}" r="2" fill="#e3f0ec" opacity=".7"/>`
      + `<text x="${x + bw / 2}" y="${H - 3}" text-anchor="middle" font-size="10" fill="#a9c4c4">${n}</text>`
      + (counts[n] ? `<text x="${x + bw / 2}" y="${H - 19 - h}" text-anchor="middle" font-size="9" fill="#e3f0ec">${counts[n]}</text>` : '');
  }
  return `<svg viewBox="0 0 ${W} ${H}" class="dicechart" role="img" aria-label="Dice rolls this game">${bars}</svg>`;
}
function openLeaderboard() {
  const st = S.state; if (!st || st.phase !== 'ended') return;
  const w = st.players[st.winner], rows = standings(st), rec = store.get('record', { games: 0, wins: 0 });
  const medal = r => r < 3 ? `<span class="medal m${r + 1}">${r + 1}</span>` : `<span class="medal">${r + 1}</span>`;
  const chip = (n, label) => n ? `<span class="pts">${label}</span>` : '';
  const list = rows.map((x, r) => {
    const s = x.p.stats;
    return `<li class="lrow ${x.i === st.winner ? 'champ' : ''}" style="--pc:${x.p.color}">
      ${medal(r)}
      <div class="who"><b>${esc(x.p.name)}${x.i === me() ? ' (you)' : ''}</b> ${botTag(x.p)}
        <div class="ptsrow">${chip(x.settlements, `${x.settlements} settlement${x.settlements > 1 ? 's' : ''} +${x.settlements}`)}${chip(x.cities, `${x.cities} cit${x.cities > 1 ? 'ies' : 'y'} +${x.cities * 2}`)}${chip(x.road, 'Longest Road +2')}${chip(x.army, 'Largest Army +2')}${chip(x.hidden, `${x.hidden} hidden +${x.hidden}`)}</div>
        <div class="statrow"><span>${icon('cards')}${s.collected} harvested</span><span>${icon('robber')}${s.stolen} stolen</span><span>${icon('any')}${s.bankTrades + s.playerTrades} trades</span><span>${icon('knight')}${x.p.knights} knights</span><span>${icon('dev')}${s.devBought} dev bought</span></div>
      </div>
      <div class="score">${x.p.vp}<small>pts</small></div></li>`;
  }).join('');
  openModal('victory', `<div class="victor"><svg class="crown" viewBox="0 0 32 32"><use href="#ic-trophy"/></svg>
    <h3 style="color:${w.color}">${esc(w.name)} wins${w.bot ? ` <span class="muted" style="font-size:.6em">${LEVEL_LABEL[w.bot]} bot</span>` : ''}</h3>
    <p>${st.winner === me() ? 'Your island, your victory.' : w.bot ? 'The bot takes it this time. Rematch?' : 'Well played. Rematch?'} ${plural(st.turnNumber, 'turn')} on ${esc(st.mapName)}.</p></div>
    <h4 class="lb-title">Leaderboard</h4><ol class="leaderboard">${list}</ol>
    <h4 class="lb-title">Dice this game</h4>${diceChart(st.diceCounts)}<p class="help">Bars show how often each number came up; dots show what fair dice would average.</p>
    <p class="record">${icon('trophy')} Your record on this device: ${plural(rec.wins, 'win')} in ${plural(rec.games, 'game')}.</p>
    <div class="foot"><button class="btn" id="vclose">View board</button><button class="btn primary" id="vnew">New game</button></div>`, () => {
    $('#vclose').onclick = closeModal; $('#vnew').onclick = () => leaveToHome();
  });
}

// ---------- Longest Road / Largest Army announcements ----------
function checkAwards(prev, st) {
  const nm = i => st.players[i].name;
  const lr = st.longestRoad, pl = prev.longestRoad, la = st.largestArmy, pa = prev.largestArmy;
  if (lr && (!pl || pl.p !== lr.p)) showAward('road', lr.p, `${plural(lr.len, 'connected road')} · +2 points${pl ? ` · taken from ${nm(pl.p)}` : ''}`);
  else if (!lr && pl) showAward('road', null, `${nm(pl.p)} lost it, and nobody holds it now`);
  if (la && (!pa || pa.p !== la.p)) showAward('army', la.p, `${plural(la.size, 'knight')} played · +2 points${pa ? ` · taken from ${nm(pa.p)}` : ''}`);
}
function showAward(kind, p, text) {
  const box = $('#awards'); if (!box) return;
  const st = S.state, pl = p == null ? null : st.players[p];
  const title = kind === 'road' ? (pl ? 'Longest Road' : 'Longest Road is open') : 'Largest Army';
  const el = document.createElement('div');
  el.className = 'award'; el.style.setProperty('--pc', pl ? pl.color : '#5b7fae');
  el.innerHTML = `<span class="aw-ic">${icon(kind === 'road' ? 'road' : 'knight')}</span><div><b>${title}</b><span>${pl ? `${esc(pl.name)}${p === me() ? ' (you)' : ''} takes it. ` : ''}${esc(text)}</span></div>`;
  box.append(el); Sound.play('award');
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 520); }, 4200);
  while (box.children.length > 3) box.firstChild.remove();
}

// ---------- the piece you are placing ----------
function cardGlyph(kind, col) {
  const dk = shade(col, -.38);
  const body = kind === 'road'
    ? `<path d="M-6,-19 L0,-25 L6,-19 V19 L0,25 L-6,19Z" fill="${col}" stroke="${dk}" stroke-width="2.4" stroke-linejoin="round"/><path d="M-2.4,-17 V17" stroke="#fff" stroke-opacity=".5" stroke-width="2.4" stroke-linecap="round"/>`
    : kind === 'city' ? `<g transform="translate(0 7) scale(.86)">${pieceGlyph('city', col)}</g>` : `<g transform="translate(0 3) scale(1.45)">${pieceGlyph('settle', col)}</g>`;
  return `<svg viewBox="-28 -30 56 60" aria-hidden="true">${body}</svg>`;
}
function drawPlacing() {
  const el = $('#placing'); if (!el) return;
  const mode = currentMode(), st = S.state; let kinds = [];
  if (mode === 'setupSettle' || mode === 'settle') kinds = ['settle'];
  else if (mode === 'setupRoad' || mode === 'road' || mode === 'freeRoad') kinds = ['road'];
  else if (mode === 'city') kinds = ['city'];
  else if (mode === 'auto') { const b = buildable(); kinds = [b.road.length && 'road', b.settle.length && 'settle', b.city.length && 'city'].filter(Boolean); }
  if (!kinds.length) { el.hidden = true; el.innerHTML = ''; return; }
  const col = st.players[me()].color, label = { road: 'Road', settle: 'Settlement', city: 'City' };
  const live = st.phase === 'main' && !st.subphase;
  el.hidden = false;
  el.innerHTML = kinds.map(k => live
    ? `<button class="pcardx" data-pk="${k}" aria-pressed="${S.mode === k}" title="${label[k]}: tap a circle on the map to build it" aria-label="${label[k]}">${cardGlyph(k, col)}</button>`
    : `<span class="pcardx" title="${label[k]}">${cardGlyph(k, col)}</span>`).join('');
  el.querySelectorAll('[data-pk]').forEach(b => b.onclick = () => { S.mode = S.mode === b.dataset.pk ? null : b.dataset.pk; updateGame(); });
}

// ---------- move clock and setup order ----------
function drawClock() {
  const st = S.state, el = $('#clock'); if (!el) return;
  const tm = st.timer;
  if (!tm || !tm.limit || tm.left == null || st.phase === 'ended') { el.hidden = true; S.clock = null; return; }
  S.clock = { until: Date.now() + tm.left, limit: tm.limit * 1000 };
  el.hidden = false; tickClock();
}
function tickClock() {
  const el = $('#clock'), st = S.state;
  if (!el || !S.clock || !st || el.hidden) return;
  const left = Math.max(0, S.clock.until - Date.now()), secs = Math.ceil(left / 1000), frac = Math.max(0, Math.min(1, left / S.clock.limit));
  const discarding = st.subphase === 'discard', mine = discarding ? !!st.pendingDiscards[me()] : myTurn();
  const who = discarding ? 'Discarding' : mine ? 'You' : st.players[st.turn].name;
  const col = secs <= 5 ? '#ff6b57' : secs <= 10 ? '#ffd23f' : '#6cf08a';
  el.className = 'clock' + (secs <= 5 ? ' urgent' : secs <= 10 ? ' warn' : '');
  el.innerHTML = `<svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="4"/><circle cx="18" cy="18" r="15" fill="none" stroke="${col}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${(94.2 * frac).toFixed(1)} 94.2"/></svg><b>${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</b><span>${esc(who)}</span>`;
  el.setAttribute('aria-label', `${secs} seconds left for ${who}`);
  $$('.yourturn .tm').forEach(t => { t.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`; });
  if (mine && secs <= 5 && secs > 0 && S.lastTick !== secs) { S.lastTick = secs; Sound.play('tick'); }
}
function drawSetupStrip() {
  const st = S.state, el = $('#setupstrip'); if (!el) return;
  if (st.phase !== 'setup' || !st.setup) { el.hidden = true; return; }
  const { order, step, round } = st.setup, half = order.length / 2;
  el.hidden = false;
  el.innerHTML = `<span class="ss-title">Round ${round}: ${round === 1 ? 'in turn order' : 'reverse order'}</span>`
    + order.map((pi, k) => `${k === half ? '<span class="ss-gap"></span>' : ''}<span class="ss-chip ${k < step ? 'done' : k === step ? 'now' : ''}" style="--pc:${st.players[pi].color}" title="${k + 1}. ${esc(st.players[pi].name)}">${esc(st.players[pi].name.slice(0, 1).toUpperCase())}</span>`).join('');
}

// Resource cards fly from the tiles that paid out to the hand or player card that received them.
function flyGains(st) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const svg = $('#board'), ctm = svg && svg.getScreenCTM(), sum7 = st.lastRoll.dice[0] + st.lastRoll.dice[1];
  if (!ctm || sum7 === 7) return;
  let count = 0;
  st.players.forEach((p, i) => {
    const g = st.lastRoll.gains[i]; if (!g) return;
    RES.forEach(k => {
      if (!g[k]) return;
      const srcs = S.board.tiles.filter(t => t.number === sum7 && t.id !== st.robber && TERRAIN_RES[t.terrain] === k && t.vertices.some(v => st.buildings[v] && st.buildings[v].p === i));
      const target = i === st.you ? $(`.card.${k}`) : $$('#players .pcard')[i];
      if (!srcs.length || !target) return;
      const tr = target.getBoundingClientRect(), ex = tr.left + tr.width / 2 - 17, ey = tr.top + tr.height / 2 - 17;
      for (let c = 0; c < g[k] && count < 30; c++, count++) {
        const t = srcs[c % srcs.length], pt = svg.createSVGPoint(); pt.x = t.x * U; pt.y = t.y * U;
        const sp = pt.matrixTransform(ctm), el = document.createElement('div');
        el.className = 'fly'; el.innerHTML = icon(k); document.body.append(el);
        const a = el.animate([
          { transform: `translate(${sp.x - 17}px, ${sp.y - 17}px) scale(.4)`, opacity: 0 },
          { transform: `translate(${sp.x - 17}px, ${sp.y - 42}px) scale(1.25)`, opacity: 1, offset: .22 },
          { transform: `translate(${ex}px, ${ey}px) scale(.8)`, opacity: .9 },
        ], { duration: 1500, delay: 120 + count * 90, easing: 'cubic-bezier(.4,.1,.3,1)', fill: 'both' });
        a.onfinish = () => el.remove();
      }
    });
  });
}

function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = document.createElement('canvas'); cv.className = 'confetti'; document.body.append(cv);
  const ctx = cv.getContext('2d'), W = cv.width = innerWidth, H = cv.height = innerHeight;
  const cols = ['#ffd23f', '#ff5a5f', '#3bceac', '#4cc9f0', '#b388ff', '#ff9f1c', '#8ceb8c'];
  const ps = Array.from({ length: 170 }, () => ({ x: Math.random() * W, y: -20 - Math.random() * H * .7, w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, vx: -1.2 + Math.random() * 2.4, vy: 2 + Math.random() * 3.6, r: Math.random() * 6, vr: -.25 + Math.random() * .5, c: cols[Math.floor(Math.random() * cols.length)] }));
  const t0 = performance.now();
  (function frame(t) {
    ctx.clearRect(0, 0, W, H);
    ps.forEach(p => { p.x += p.vx; p.y += p.vy; p.r += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore(); });
    if (t - t0 < 6500) requestAnimationFrame(frame); else cv.remove();
  })(t0);
}

// ---------- discard animations and table sounds ----------
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// The chosen cards fly from the dialog to the bank. Clones are used so the dialog's edges don't clip them.
function flyAway(els) {
  if (reducedMotion()) return Promise.resolve();
  const bank = $('#players .bank'), bt = bank ? bank.getBoundingClientRect() : { left: innerWidth / 2, top: -60, width: 0, height: 0 };
  const tx = bt.left + bt.width / 2, ty = bt.top + bt.height / 2;
  return Promise.all(els.map((el, i) => {
    const r = el.getBoundingClientRect(), c = el.cloneNode(true);
    Object.assign(c.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', margin: 0, zIndex: 90, pointerEvents: 'none', animation: 'none', transition: 'none' });
    document.body.append(c); el.style.visibility = 'hidden';
    const dx = tx - (r.left + r.width / 2), dy = ty - (r.top + r.height / 2);
    const a = c.animate([
      { transform: 'translateY(-18px) rotate(-4deg) scale(1.07)', opacity: 1 },
      { transform: `translate(${dx * .12}px, ${dy * .12 - 34}px) rotate(-14deg) scale(1.14)`, opacity: 1, offset: .25 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${(i % 2 ? 1 : -1) * 38}deg) scale(.25)`, opacity: 0 },
    ], { duration: 1100, delay: i * 90, easing: 'cubic-bezier(.5,0,.75,.35)', fill: 'both' });
    return a.finished.then(() => c.remove(), () => c.remove());
  }));
}
// Other players' discards: face-down cards fly from their card to the bank.
function flyDiscardCards(i, n) {
  if (reducedMotion()) return;
  const from = $$('#players .pcard')[i], to = $('#players .bank'); if (!from || !to) return;
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const sx = a.left + a.width / 2 - 17, sy = a.top + a.height / 2 - 17, ex = b.left + b.width / 2 - 17, ey = b.top + b.height / 2 - 17;
  for (let c = 0; c < Math.min(n, 8); c++) {
    const el = document.createElement('div'); el.className = 'fly'; el.innerHTML = icon('cards'); document.body.append(el);
    el.animate([
      { transform: `translate(${sx}px, ${sy}px) scale(.7)`, opacity: 0 },
      { transform: `translate(${sx + 8}px, ${sy - 16}px) scale(1.1) rotate(-8deg)`, opacity: 1, offset: .2 },
      { transform: `translate(${ex}px, ${ey}px) scale(.5) rotate(${(c % 2 ? 1 : -1) * 40}deg)`, opacity: .2 },
    ], { duration: 1200, delay: c * 80, easing: 'cubic-bezier(.5,0,.7,.4)', fill: 'both' }).onfinish = () => el.remove();
  }
}
// ---------- cards travelling from one player to another ----------
// Each card is drawn like the real card and flies in an arc from where it left to where it lands.
// Only the thief and the victim know which card was stolen; everyone else sees a face-down card.
function anchorOf(i, kind) {
  if (i === S.state.you && kind !== 'back') { const c = $(`#hand .card.${kind}`); if (c) return c; }
  return $$('#players .pcard')[i];
}
function flyCard(from, to, kind, delay = 0) {
  if (reducedMotion() || !from || !to) return;
  const el = document.createElement('div'); el.className = 'fcard ' + (kind === 'back' ? 'back' : kind);
  el.innerHTML = kind === 'back' ? '<svg class="ic" viewBox="-14 -14 28 28"><polygon points="0,-12 10.4,-6 10.4,6 0,12 -10.4,6 -10.4,-6" fill="#f0cd78" stroke="#8a6a1c" stroke-width="1.6"/></svg>' : icon(kind);
  document.body.append(el);
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const sx = a.left + a.width / 2 - 23, sy = a.top + a.height / 2 - 32, ex = b.left + b.width / 2 - 23, ey = b.top + b.height / 2 - 32;
  const dx = ex - sx, dy = ey - sy, len = Math.hypot(dx, dy) || 1, arc = Math.min(130, len * .25);
  const mx = (sx + ex) / 2 - dy / len * arc, my = (sy + ey) / 2 + dx / len * arc;   // bow the path sideways
  el.animate([
    { transform: `translate(${sx}px, ${sy}px) scale(.55)`, opacity: 0 },
    { transform: `translate(${sx}px, ${sy - 14}px) scale(1.15) rotate(-6deg)`, opacity: 1, offset: .14 },
    { transform: `translate(${mx}px, ${my}px) scale(1.3) rotate(10deg)`, opacity: 1, offset: .55 },
    { transform: `translate(${ex}px, ${ey}px) scale(.75)`, opacity: 1, offset: .92 },
    { transform: `translate(${ex}px, ${ey}px) scale(.4)`, opacity: 0 },
  ], { duration: 1800, delay, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'both' }).onfinish = () => {
    el.remove(); to.classList.remove('landed'); void to.offsetWidth; to.classList.add('landed'); setTimeout(() => to.classList.remove('landed'), 650);
  };
}
function animateSteal(st) {
  const s = st.lastSteal, kind = s.card || 'back';
  flyCard(anchorOf(s.from, kind), anchorOf(s.to, kind), kind);
}
function animateMonopoly(st) {
  const m = st.lastMonopoly; let n = 0;
  Object.entries(m.takes).forEach(([i, cnt]) => { for (let c = 0; c < Math.min(cnt, 6); c++, n++) flyCard(anchorOf(+i, m.res), anchorOf(m.by, m.res), m.res, n * 90); });
}
// Every public card movement is announced by the server as an event: bank trades, player trades,
// Year of Plenty and the starting cards. Each card flies slowly, drawn as the real resource.
function processEvents(prev, st) {
  const base = S.evSeq != null ? S.evSeq : Math.max(0, ...(prev.events || []).map(e => e.seq));
  let newest = base;
  for (const e of st.events || []) { if (e.seq <= base) continue; newest = Math.max(newest, e.seq); animateEvent(e); }
  S.evSeq = newest;
}
function animateEvent(e) {
  const bank = k => $(`#players .bank .bk.${k}`) || $('#players .bank');
  const each = (cards, fn, after = 0) => Object.entries(cards).forEach(([k, n]) => { for (let c = 0; c < Math.min(n, 4); c++) fn(k, after + c * 180); });
  if (e.type === 'bank') {
    each(e.give, (k, d) => flyCard(anchorOf(e.p, k), bank(k), k, d));
    each(e.get, (k, d) => flyCard(bank(k), anchorOf(e.p, k), k, d), 1000);
  } else if (e.type === 'trade') {
    each(e.give, (k, d) => flyCard(anchorOf(e.a, k), anchorOf(e.b, k), k, d));
    each(e.get, (k, d) => flyCard(anchorOf(e.b, k), anchorOf(e.a, k), k, d), 350);
  } else if (e.type === 'yop' || e.type === 'start') e.res.forEach((k, c) => flyCard(bank(k), anchorOf(e.p, k), k, c * 320));
}
function soundReactions(prev, st) {
  processEvents(prev, st);
  const cnt = x => ({ r: Object.keys(x.roads).length, s: Object.values(x.buildings).filter(b => b.type === 'settlement').length, c: Object.values(x.buildings).filter(b => b.type === 'city').length });
  const a = cnt(prev), b = cnt(st);
  if (b.c > a.c) Sound.play('city'); else if (b.s > a.s) Sound.play('settle'); else if (b.r > a.r) Sound.play('road');
  if (st.lastSteal && (!prev.lastSteal || prev.lastSteal.seq !== st.lastSteal.seq)) { Sound.play('steal'); animateSteal(st); }
  if (st.lastMonopoly && (!prev.lastMonopoly || prev.lastMonopoly.seq !== st.lastMonopoly.seq)) { Sound.play('steal'); animateMonopoly(st); }
  if (st.robber !== prev.robber) Sound.play('robber');
  const devs = x => x.players.reduce((n, p) => n + p.devCount, 0);
  if (devs(st) > devs(prev)) Sound.play('devbuy');
  if (st.trade && (!prev.trade || prev.trade.id !== st.trade.id)) Sound.play('offer');
  // new lines in the log: trades make a coin sound, other players' discards fly to the bank
  const base = S.logAt != null ? S.logAt : Math.max(0, ...prev.log.map(l => l.at));
  let newest = base;
  for (const l of st.log) {
    if (l.at <= base) continue;
    newest = Math.max(newest, l.at);
    if (l.chat != null) continue;
    if (/ traded /.test(l.text)) Sound.play('coin');
    const d = /^(.+?) discarded (\d+) cards\.$/.exec(l.text);
    if (d) { const i = st.players.findIndex(p => p.name === d[1]); if (i >= 0 && i !== me()) { Sound.play('discard'); flyDiscardCards(i, +d[2]); } }
  }
  S.logAt = newest;
}

// ---------- install as an app ----------
function showInstall() {
  if (!S.installEvt || S.screen !== 'home' || $('#install')) return;
  const panel = $('.home .panel'); if (!panel) return;
  const b = document.createElement('button'); b.className = 'btn'; b.id = 'install'; b.textContent = 'Install the app';
  b.onclick = async () => { const ev = S.installEvt; S.installEvt = null; b.remove(); try { await ev.prompt(); } catch {} };
  panel.append(b);
}
addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.installEvt = e; showInstall(); });
addEventListener('appinstalled', () => { S.installEvt = null; const b = $('#install'); if (b) b.remove(); });

// ---------- house colours ----------
const houseIcon = hex => `<svg class="hse" viewBox="-20 -19 40 38" aria-hidden="true"><g transform="scale(1.35)">${houseSvg(hex)}</g></svg>`;
function swatch(p, i, me, host) {
  const can = i === me || (host && p.bot);
  return can ? `<button class="hsw" data-color-seat="${i}" title="${i === me ? 'Change your house color' : 'Change this bot\'s color'} (${p.colorName})" aria-label="House color: ${p.colorName}. Tap to change.">${houseIcon(p.color)}</button>`
    : `<span class="hsw static" title="${p.colorName}">${houseIcon(p.color)}</span>`;
}
function openColorPicker(seat) {
  const st = S.state, p = st.players[seat];
  const cells = st.palette.map(c => {
    const holder = st.players.findIndex((q, i) => i !== seat && q.colorId === c.id);
    return `<button class="cpick" data-c="${c.id}" aria-pressed="${p.colorId === c.id}" ${holder >= 0 ? 'disabled' : ''} title="${c.name}${holder >= 0 ? ` (taken by ${esc(st.players[holder].name)})` : ''}">${houseIcon(c.hex)}<small>${c.name}</small></button>`;
  }).join('');
  openModal('colors', `<h3>Choose a house color</h3><p>${seat === me() ? 'This is the color of your roads, settlements and cities.' : `${esc(p.name)} is a bot. Pick its color.`}</p><div class="cgrid">${cells}</div><div class="foot"><button class="btn" id="cclose">Close</button></div>`, layer => {
    $('#cclose').onclick = closeModal;
    layer.querySelectorAll('.cpick').forEach(b => b.onclick = async () => { const r = await act({ type: 'setColor', seat, color: b.dataset.c }); if (r.ok) closeModal(); });
  });
}

// ---------- boot ----------
setInterval(tickClock, 250);
addEventListener('pagehide', () => { S.unloading = true; });
addEventListener('pageshow', () => { S.unloading = false; });
fetch('/api/maps').then(r => r.json()).then(j => { S.maps = j.maps; }).catch(() => {});
if (S.session && (!S.joinCode || S.joinCode === S.session.code)) startSession(S.session);
render();
{ // home-screen shortcuts from the installed app
  if (LAUNCH_ACTION === 'rules') openRules(); else if (LAUNCH_ACTION === 'create' && S.name && S.screen === 'home') go('create');
}
})();
