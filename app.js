(() => {
'use strict';
ART.install();

// ---------- constants ----------
const U = 60;
const RES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
const RES_LABEL = { wood: 'Lumber', brick: 'Brick', sheep: 'Wool', wheat: 'Grain', ore: 'Ore' };
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
  es: null, error: null, hot: null, modal: null, shellReady: false, editor: { tool: 'forest', num: null }, joinCode: '',
};
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
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el[html ? 'innerHTML' : 'textContent'] = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), kind === 'err' ? 3600 : 2800);
  while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
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

// ---------- board drawing ----------
function bounds(b, pad = 70) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y, r) => { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); };
  b.tiles.forEach(t => add(t.x * U, t.y * U, 62));
  (b.ports || []).forEach(p => add(p.x * U, p.y * U, 22));
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
}
function tileSvg(t, attrs = '') {
  return `<g transform="translate(${t.x * U} ${t.y * U})" ${attrs}><g clip-path="url(#c-hex)"><use href="#t-${t.terrain}" x="-60" y="-60" width="120" height="120"/></g>`
    + `<polygon points="${ART.HEX}" fill="none" stroke="#2c1e0e" stroke-opacity=".55" stroke-width="2.5"/>`
    + `<polygon points="${ART.HEX}" transform="scale(.93)" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="1.5"/></g>`;
}
function tokenSvg(n, x, y) {
  const pips = 6 - Math.abs(7 - n), red = n === 6 || n === 8, col = red ? '#b3261e' : '#2b1d0e';
  const dots = Array.from({ length: pips }, (_, i) => `<circle cx="${(i - (pips - 1) / 2) * 4.2}" cy="10" r="1.5" fill="${col}"/>`).join('');
  return `<g transform="translate(${x} ${y})" pointer-events="none"><circle r="17.5" fill="url(#g-token)" stroke="#8a6a3a" stroke-width="1.5" filter="url(#f-shadow)"/>`
    + `<circle r="14.5" fill="none" stroke="#c9b48a" stroke-width=".8"/><text y="4.5" text-anchor="middle" font-family="Alegreya SC, Georgia, serif" font-weight="800" font-size="${n >= 10 ? 15 : 18}" fill="${col}">${n}</text>${dots}</g>`;
}
function portSvg(p) {
  const pier = p.vx.map(([x, y]) => `<line x1="${p.x * U}" y1="${p.y * U}" x2="${x * U}" y2="${y * U}" stroke="#4d3218" stroke-width="6" stroke-linecap="round"/>`
    + `<line x1="${p.x * U}" y1="${p.y * U}" x2="${x * U}" y2="${y * U}" stroke="#b08048" stroke-width="3" stroke-dasharray="3 2.5"/>`).join('');
  const badge = p.type === 'any'
    ? `<text y="5" text-anchor="middle" font-family="Alegreya Sans, sans-serif" font-weight="800" font-size="13" fill="#3a2a08">3:1</text>`
    : `<use href="#ic-${p.type}" x="-10" y="-16" width="20" height="20"/><text y="13" text-anchor="middle" font-family="Alegreya Sans, sans-serif" font-weight="800" font-size="9.5" fill="#3a2a08">2:1</text>`;
  return `<g>${pier}</g><g transform="translate(${p.x * U} ${p.y * U})" filter="url(#f-shadow)"><title>${p.type === 'any' ? 'Harbor: trade any 3 identical for 1' : `Harbor: trade 2 ${RES_LABEL[p.type]} for 1`}</title><circle r="18" fill="url(#g-brass)" stroke="#6b4a12" stroke-width="2"/>${badge}</g>`;
}
function staticLayer(b) {
  const beach = s => b.tiles.map(t => `<polygon points="${ART.HEX}" transform="translate(${t.x * U} ${t.y * U}) scale(${s})" fill="${s > 1.1 ? '#c9b071' : '#ead9a6'}"/>`).join('');
  return `<g>${beach(1.15)}</g><g>${beach(1.08)}</g>`
    + (b.ports || []).map(portSvg).join('')
    + b.tiles.map(t => tileSvg(t)).join('')
    + b.tiles.filter(t => t.number).map(t => tokenSvg(t.number, t.x * U, t.y * U)).join('');
}
function boardPreviewSvg(b) {
  const v = bounds(b, 30);
  return `<svg viewBox="${v.x} ${v.y} ${v.w} ${v.h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Map preview: ${esc(b.name)}">`
    + `<rect x="${v.x - 2000}" y="${v.y - 2000}" width="${v.w + 4000}" height="${v.h + 4000}" fill="url(#p-waves)"/>${staticLayer(b)}</svg>`;
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
  app.innerHTML = `<div class="home">
    <div class="hero-board" id="hero"></div>
    <div>
      <h1 class="title">Hexlands</h1>
      <p class="tagline">Settle an island with friends. Gather lumber, brick, wool, grain and ore, out-trade your rivals, and race to victory.</p>
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
          <span><b>Points to win</b><br><span class="muted" style="font-size:.88em">Larger maps play well at 12–14.</span></span>
          <div class="stepper"><button id="vp-dn" aria-label="Fewer points">−</button><output id="vp">${S.vpTarget}</output><button id="vp-up" aria-label="More points">+</button></div>
          <span class="grow"></span>
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
  const setVp = d => { S.vpTarget = Math.max(5, Math.min(20, S.vpTarget + d)); $('#vp').textContent = S.vpTarget; };
  $('#vp-dn').onclick = () => setVp(-1); $('#vp-up').onclick = () => setVp(1);
  $('#create').onclick = async e => {
    e.target.disabled = true;
    try {
      const map = S.mapKey === 'custom' ? { tiles: S.custom.tiles } : { preset: S.mapKey };
      const j = await post('/api/create', { name: S.name, map, seed: S.seed, vpTarget: S.vpTarget });
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
  S.board = null; S.state = null; S.shellReady = false; S.mode = null; S.boardFor = null;
  const es = new EventSource(`/api/events?code=${encodeURIComponent(sess.code)}&token=${encodeURIComponent(sess.token)}`);
  S.es = es;
  let opened = false;
  es.addEventListener('board', e => {
    const fresh = S.boardFor !== sess.code;
    S.board = JSON.parse(e.data); S.boardFor = sess.code;
    if (fresh || !S.vb) { S.base = bounds(S.board, innerWidth < 760 ? 22 : 70); S.vb = { ...S.base }; S.shellReady = false; }
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
  if (st.phase === 'lobby') { if (S.screen !== 'lobby') S.screen = 'lobby'; renderLobby($('#app')); return; }
  if (S.screen !== 'game') { S.screen = 'game'; S.shellReady = false; }
  // Reactions to changes
  if (prev && st.lastRoll && (!prev.lastRoll || prev.lastRoll.seq !== st.lastRoll.seq)) onRoll(st);
  else if (!prev && st.dice) drawDice(st.dice, false);
  if (prev && st.lastSteal && st.lastSteal.card && (!prev.lastSteal || prev.lastSteal.seq !== st.lastSteal.seq)) {
    const s = st.lastSteal, me = st.you;
    if (s.to === me) toast(`${icon(s.card)} You took ${RES_LABEL[s.card]} from ${esc(st.players[s.from].name)}`, 'gain', true);
    else if (s.from === me) toast(`${icon(s.card)} ${esc(st.players[s.to].name)} took your ${RES_LABEL[s.card]}`, 'err', true);
  }
  if (prev && prev.turn !== st.turn && st.turn === st.you && st.phase === 'main') { toast('Your turn'); if (navigator.vibrate) navigator.vibrate(50); }
  if (prev && prev.phase !== 'ended' && st.phase === 'ended') setTimeout(openVictory, 600);
  if (st.turn !== st.you || st.subphase || !st.rolled || (S.mode && !modePossible(S.mode))) S.mode = null;
  renderGame($('#app'));
}

function onRoll(st) {
  const d = st.lastRoll.dice, total = d[0] + d[1];
  drawDice(d, true);
  if (total !== 7) { S.hot = { sum: total, until: Date.now() + 2600 }; setTimeout(() => { if (S.screen === 'game') drawDyn(); }, 2700); }
  const g = st.lastRoll.gains[st.you];
  if (g && sum(g)) {
    toast(RES.filter(k => g[k]).map(k => `${icon(k)} +${g[k]}`).join(' '), 'gain', true);
    setTimeout(() => RES.filter(k => g[k]).forEach(k => { const c = $(`.card.${k}`); if (c) { c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); } }), 50);
  }
  if (total === 7) toast(st.turn === st.you ? 'Seven! Move the robber.' : 'Seven! The robber strikes.');
}

// ---------- lobby ----------
function renderLobby(app) {
  const st = S.state; if (!st) return;
  const me = st.you, host = st.players[me] && st.players[me].host;
  const link = `${location.origin}/room/${st.code}`;
  const prevBox = $('#lobby-preview');
  const keepPreview = prevBox && prevBox.dataset.code === st.code && prevBox.innerHTML;
  app.innerHTML = `<div class="page">
    <div class="page-head"><button class="btn" id="leave">Leave room</button><h2>Waiting room</h2></div>
    <div class="lobby">
      <div class="stack"><div class="preview" id="lobby-preview" data-code="${st.code}"></div>
        <p class="muted">${esc(st.mapName)}, first to ${st.vpTarget} points. Turn order is drawn at random when the game starts.</p></div>
      <div class="panel stack">
        <div><div class="muted">Room code</div><div class="room-code">${st.code}</div></div>
        <div class="row"><button class="btn" id="copy">Copy invite link</button>${navigator.share ? '<button class="btn" id="share">Share</button>' : ''}</div>
        <ul class="plist">${st.players.map((p, i) => `<li><span class="chip" style="background:${p.color}"></span><b class="grow">${esc(p.name)}${i === me ? ' (you)' : ''}</b>${p.host ? '<span class="badge">Host</span>' : ''}<span class="dot ${p.connected ? '' : 'off'}" title="${p.connected ? 'Connected' : 'Offline'}"></span></li>`).join('')}</ul>
        <p class="muted">${st.players.length} of 4 seats taken. ${host ? (st.players.length < 2 ? 'Share the code; you need at least one more player.' : 'Start when everyone is in.') : 'The host starts the game.'}</p>
        ${host ? `<button class="btn primary" id="start" ${st.players.length < 2 ? 'disabled' : ''}>Start game</button>` : ''}
      </div>
    </div></div>`;
  if (keepPreview) $('#lobby-preview').innerHTML = keepPreview;
  else if (S.board) $('#lobby-preview').innerHTML = boardPreviewSvg(S.board);
  $('#leave').onclick = async () => { try { await post('/api/leave', S.session); } catch {} leaveToHome(); };
  $('#copy').onclick = async () => { try { await navigator.clipboard.writeText(link); toast('Invite link copied'); } catch { prompt('Copy this link', link); } };
  if ($('#share')) $('#share').onclick = () => navigator.share({ title: 'Join my Hexlands game', text: `Room code ${st.code}`, url: link }).catch(() => {});
  if ($('#start')) $('#start').onclick = () => act({ type: 'start' });
}

// ---------- game ----------
function renderGame(app) {
  if (!S.state || !S.board) return;
  if (!S.shellReady || !$('#board')) buildShell(app);
  updateGame();
}
function buildShell(app) {
  app.innerHTML = `<div class="game">
    <header class="topbar">
      <span class="brand">Hexlands</span>
      <span class="meta" id="meta"></span><span class="spacer"></span>
      <button class="btn small" id="rules">Costs</button>
      <button class="btn small drawer-toggle" id="logbtn">Log</button>
      <button class="btn small" id="quit">Leave</button>
    </header>
    <aside class="players" id="players"></aside>
    <main class="board-wrap" id="wrap">
      <svg id="board" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
        <rect x="-5000" y="-5000" width="10000" height="10000" fill="url(#p-waves)"/>
        <g id="static"></g><g id="dyn"></g>
      </svg>
      <div class="banner" id="banner"></div>
      <div class="dice" id="dice"></div>
      <div class="offer" id="offer"></div>
      <div class="zoom"><button class="btn" id="zin" aria-label="Zoom in">+</button><button class="btn" id="zout" aria-label="Zoom out">−</button><button class="btn" id="zfit" aria-label="Fit board">⤢</button></div>
    </main>
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
  $('#rules').onclick = openCosts;
  $('#quit').onclick = () => { if (confirm('Leave this game? You can rejoin with the room code while it is running.')) { if (S.es) S.es.close(); S.es = null; S.state = null; history.replaceState(null, '', '/'); go('home'); } };
  $('#chat').onsubmit = e => { e.preventDefault(); const v = $('#chatin').value.trim(); if (v) { act({ type: 'chat', text: v }); $('#chatin').value = ''; } };
  if (S.state.dice) drawDice(S.state.dice, false);
}

function updateGame() {
  const st = S.state;
  $('#meta').innerHTML = `Room <b>${st.code}</b><span class="extra">, ${esc(st.mapName)}, first to ${st.vpTarget} points, ${st.devLeft} development cards left</span>`;
  drawDyn(); drawPlayers(); drawBanner(); drawHand(); drawActions(); drawLog(); drawOffer();
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
  const st = S.state; if (!st || !myTurn()) return null;
  if (st.phase === 'setup') return st.setup.expect === 'settlement' ? 'setupSettle' : 'setupRoad';
  if (st.phase !== 'main') return null;
  if (st.subphase === 'robber') return 'robber';
  if (st.subphase === 'roadBuilding') return 'freeRoad';
  if (st.subphase || !st.rolled) return null;
  return S.mode;
}

function drawDyn() {
  const st = S.state, b = S.board, V = b.vertices; if (!$('#dyn')) return;
  let s = '';
  if (S.hot && S.hot.until > Date.now()) s += b.tiles.filter(t => t.number === S.hot.sum && t.id !== st.robber).map(t => `<polygon class="hot" points="${ART.HEX}" transform="translate(${t.x * U} ${t.y * U}) scale(.95)"/>`).join('');
  for (const [e, p] of Object.entries(st.roads)) {
    const [a, c] = b.edges[e].v.map(i => V[i]);
    const ax = a.x * U, ay = a.y * U, cx = c.x * U, cy = c.y * U, k = 0.16;
    const x1 = ax + (cx - ax) * k, y1 = ay + (cy - ay) * k, x2 = cx - (cx - ax) * k, y2 = cy - (cy - ay) * k;
    s += `<g filter="url(#f-shadow)"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1b1b1b" stroke-width="12" stroke-linecap="round"/>`
      + `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${st.players[p].color}" stroke-width="8" stroke-linecap="round"/>`
      + `<line x1="${x1}" y1="${y1 - 1.5}" x2="${x2}" y2="${y2 - 1.5}" stroke="#fff" stroke-opacity=".3" stroke-width="2" stroke-linecap="round"/></g>`;
  }
  for (const [v, bd] of Object.entries(st.buildings)) {
    const x = V[v].x * U, y = V[v].y * U, col = st.players[bd.p].color;
    s += bd.type === 'city'
      ? `<g transform="translate(${x} ${y})" filter="url(#f-shadow)"><path d="M-15,11 V-2 L-8,-9 L-1,-2 V-8 L6,-16 L13,-8 V11Z" fill="${col}" stroke="#1b1b1b" stroke-width="2" stroke-linejoin="round"/>`
        + `<path d="M6,-16 L13,-8 V11 H6Z" fill="#000" opacity=".2"/><rect x="-11" y="3" width="5" height="8" fill="#1b1b1b" opacity=".55"/><rect x="4" y="-4" width="4" height="4" fill="#ffe9a8" opacity=".9"/><rect x="4" y="3" width="4" height="4" fill="#ffe9a8" opacity=".9"/></g>`
      : `<g transform="translate(${x} ${y})" filter="url(#f-shadow)"><path d="M-10,9 V-2 L0,-11 L10,-2 V9Z" fill="${col}" stroke="#1b1b1b" stroke-width="2" stroke-linejoin="round"/>`
        + `<path d="M0,-11 L10,-2 V9 H0Z" fill="#000" opacity=".2"/><rect x="-3" y="2" width="5" height="7" fill="#1b1b1b" opacity=".55"/></g>`;
  }
  const rt = b.tiles[st.robber];
  s += `<use href="#ic-robber" x="${rt.x * U - 52}" y="${rt.y * U - 26}" width="42" height="42" pointer-events="none"/>`;
  s += highlights();
  $('#dyn').innerHTML = s;
}
function highlights() {
  const mode = currentMode(); if (!mode) return '';
  const V = S.board.vertices, st = S.state;
  const spot = (v, r = 9) => `<circle class="spot" cx="${V[v].x * U}" cy="${V[v].y * U}" r="${r}"/><circle cx="${V[v].x * U}" cy="${V[v].y * U}" r="20" fill="transparent" data-v="${v}" style="cursor:pointer"/>`;
  const edge = e => { const [a, c] = S.board.edges[e].v.map(i => V[i]); const xy = `x1="${a.x * U}" y1="${a.y * U}" x2="${c.x * U}" y2="${c.y * U}"`; return `<line class="espot" ${xy}/><line class="ehit" ${xy} data-e="${e}"/>`; };
  if (mode === 'setupSettle') return validSettle(false).map(v => spot(v)).join('');
  if (mode === 'settle') return validSettle(true).map(v => spot(v)).join('');
  if (mode === 'city') return myCitySpots().map(v => spot(v, 15)).join('');
  if (mode === 'setupRoad') return validRoads(st.setup.last).map(edge).join('');
  if (mode === 'road' || mode === 'freeRoad') return validRoads().map(edge).join('');
  if (mode === 'robber') return S.board.tiles.filter(t => t.id !== st.robber).map(t => `<polygon class="tspot" data-t="${t.id}" points="${ART.HEX}" transform="translate(${t.x * U} ${t.y * U}) scale(.9)"/>`).join('');
  return '';
}

async function onBoardTap(el) {
  const mode = currentMode(); if (!mode || !el) return;
  const t = el.closest('[data-v],[data-e],[data-t]'); if (!t) return;
  if (t.dataset.v != null) {
    const v = +t.dataset.v;
    if (mode === 'city') { const r = await act({ type: 'city', vertex: v }); if (r.ok) afterBuild('city'); }
    else if (mode === 'setupSettle' || mode === 'settle') { const r = await act({ type: 'settle', vertex: v }); if (r.ok && mode === 'settle') afterBuild('settle'); }
  } else if (t.dataset.e != null) {
    const r = await act({ type: 'road', edge: +t.dataset.e }); if (r.ok && mode === 'road') afterBuild('road');
  } else if (t.dataset.t != null && mode === 'robber') {
    const tile = +t.dataset.t;
    const victims = robberVictims(tile);
    if (victims.length > 1) return openSteal(tile, victims);
    act({ type: 'robber', tile, victim: victims[0] });
  }
}
function robberVictims(tile) {
  const st = S.state, set = new Set();
  S.board.tiles[tile].vertices.forEach(v => { const b = st.buildings[v]; if (b && b.p !== me() && st.players[b.p].cards > 0) set.add(b.p); });
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
function applyVB() { const v = S.vb; $('#board').setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`); }
function svgPoint(svg, cx, cy) { const p = svg.createSVGPoint(); p.x = cx; p.y = cy; return p.matrixTransform(svg.getScreenCTM().inverse()); }
function zoomAt(svg, cx, cy, f) {
  const p = svgPoint(svg, cx, cy), v = S.vb;
  const w = Math.max(S.base.w * 0.3, Math.min(S.base.w * 1.8, v.w / f)); const k = v.w / w;
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

function drawPlayers() {
  const st = S.state;
  $('#players').innerHTML = st.players.map((p, i) => {
    const badges = [];
    if (st.longestRoad && st.longestRoad.p === i) badges.push(`<span class="badge">${icon('road')} Longest Road</span>`);
    if (st.largestArmy && st.largestArmy.p === i) badges.push(`<span class="badge">${icon('knight')} Largest Army</span>`);
    const skippable = st.players[me()].host && i !== me() && !p.connected && (st.turn === i || (st.subphase === 'discard' && st.pendingDiscards[i]));
    return `<div class="pcard ${st.turn === i && st.phase !== 'ended' ? 'turn' : ''}" style="--pc:${p.color}">
      <div class="name"><span class="dot ${p.connected ? '' : 'off'}"></span><span>${esc(p.name)}${i === me() ? ' (you)' : ''}</span></div>
      <div class="vp" title="Victory points">${p.vp}<small>/${st.vpTarget}</small></div>
      <div class="stats"><span title="Resource cards">${icon('cards')}${p.cards}</span><span title="Development cards">${icon('dev')}${p.devCount}</span><span title="Knights played">${icon('knight')}${p.knights}</span><span title="Longest road">${icon('road')}${p.roadLen}</span></div>
      ${badges.length ? `<div class="row badges" style="margin-top:.35rem;gap:.3rem">${badges.join('')}</div>` : ''}
      ${st.pendingDiscards[i] ? `<div class="muted" style="font-size:.85em;margin-top:.2rem">Discarding ${st.pendingDiscards[i]}</div>` : ''}
      ${skippable ? `<button class="btn small" style="margin-top:.4rem" data-skip>Skip offline player</button>` : ''}
    </div>`;
  }).join('');
  $$('[data-skip]').forEach(b => b.onclick = () => act({ type: 'skip' }));
}

function drawBanner() {
  const st = S.state, p = st.players[st.turn], mine = myTurn(), b = $('#banner');
  let t = '';
  if (st.phase === 'ended') t = `${st.players[st.winner].name} wins with ${st.players[st.winner].vp} points`;
  else if (st.phase === 'setup') {
    const which = st.setup.round === 1 ? 'first' : 'second';
    t = mine ? (st.setup.expect === 'settlement' ? `Place your ${which} settlement on a glowing corner` : 'Place a road touching that settlement') + (st.setup.round === 2 && st.setup.expect === 'settlement' ? '. It collects starting resources.' : '')
      : `${p.name} is placing a ${st.setup.expect}`;
  } else if (st.subphase === 'discard') {
    const mineN = st.pendingDiscards[me()];
    t = mineN ? `Discard ${mineN} cards` : `Waiting for ${Object.keys(st.pendingDiscards).map(i => st.players[i].name).join(', ')} to discard`;
  } else if (st.subphase === 'robber') t = mine ? 'Tap a tile to move the robber' : `${p.name} is moving the robber`;
  else if (st.subphase === 'roadBuilding') t = mine ? `Place ${plural(st.freeRoads, 'free road')}` : `${p.name} is placing free roads`;
  else if (mine) {
    const m = currentMode();
    t = !st.rolled ? 'Your turn: roll the dice' : m === 'road' ? 'Tap a glowing edge to build a road' : m === 'settle' ? 'Tap a glowing corner to settle' : m === 'city' ? 'Tap one of your settlements to upgrade it' : 'Build, trade, or end your turn';
  } else t = `${p.name}'s turn`;
  b.textContent = t; b.classList.toggle('you', mine || !!st.pendingDiscards[me()]);
}

function drawHand() {
  const st = S.state, r = st.me.res;
  const devs = st.me.dev.length;
  $('#hand').innerHTML = RES.map(k => `<div class="card ${k} ${r[k] ? '' : 'zero'}" title="${RES_LABEL[k]}">${icon(k)}<span class="lbl">${RES_LABEL[k]}</span>${r[k] ? `<span class="n">${r[k]}</span>` : ''}</div>`).join('')
    + `<button class="card devc ${devs ? '' : 'zero'}" id="devhand" title="Development cards" style="border-style:solid">${icon('dev')}<span class="lbl">Dev</span>${devs ? `<span class="n">${devs}</span>` : ''}</button>`;
  $('#devhand').onclick = () => { if (S.mode) { S.mode = null; updateGame(); } openDev(); };
}

function costIcons(c) { return `<span class="cost">${Object.entries(c).flatMap(([k, n]) => Array(n).fill(icon(k))).join('')}</span>`; }
function drawActions() {
  const st = S.state, box = $('#actions'), mine = myTurn(), P = st.players[me()];
  if (st.phase === 'ended') { box.innerHTML = `<button class="act go" id="res">${icon('vp')}Results</button><button class="act" id="home">${icon('settlement')}New game</button>`; $('#res').onclick = openVictory; $('#home').onclick = () => leaveToHome(); return; }
  if (st.phase === 'setup' || !mine) { box.innerHTML = `<span class="waiting">${st.phase === 'setup' ? (mine ? '' : 'Setup in progress') : `Waiting for ${esc(st.players[st.turn].name)}`}</span>`; return; }
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
  box.innerHTML = btn('b-road', 'Road', 'road', COST.road, canAfford(COST.road) && P.pieces.road > 0 && validRoads().length, m === 'road')
    + btn('b-settle', 'Settle', 'settlement', COST.settlement, canAfford(COST.settlement) && P.pieces.settlement > 0 && validSettle(true).length, m === 'settle')
    + btn('b-city', 'City', 'city', COST.city, canAfford(COST.city) && P.pieces.city > 0 && myCitySpots().length, m === 'city')
    + btn('b-dev', 'Dev card', 'dev', COST.dev, canAfford(COST.dev) && st.devLeft > 0)
    + btn('b-trade', 'Trade', 'any', null, sum(st.me.res) > 0)
    + `<button class="act go" id="b-end">${icon('vp')}End turn</button>`;
  // Tint build icons in the player's color
  $$('#actions .act .ic').forEach(i => { i.style.color = P.color; });
  const toggle = k => () => { S.mode = S.mode === k ? null : k; updateGame(); };
  $('#b-road').onclick = toggle('road'); $('#b-settle').onclick = toggle('settle'); $('#b-city').onclick = toggle('city');
  $('#b-dev').onclick = async () => { const r = await act({ type: 'buyDev' }); if (r.ok && r.result) toast(`${icon(r.result.card)} You drew ${DEV[r.result.card].name}`, 'gain', true); };
  $('#b-trade').onclick = () => { S.mode = null; updateGame(); openTrade('bank'); };
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
  const st = S.state, need = st.pendingDiscards[me()], vals = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  openModal('discard', `<h3>The robber strikes</h3><p>You hold more than 7 cards. Choose ${need} to return to the bank.</p>
    ${qtyRow('d', vals, st.me.res)}<div class="foot"><span class="muted grow" id="dleft"></span><button class="btn" id="dauto">Pick for me</button><button class="btn primary" id="dgo" disabled>Discard</button></div>`, layer => {
    const upd = () => { const n = sum(vals); $('#dleft').textContent = `${n} of ${need} chosen`; $('#dgo').disabled = n !== need; RES.forEach(k => { $('#d-' + k).textContent = vals[k]; }); };
    bindQty(layer, { d: { vals, max: st.me.res } }, upd); upd();
    $('#dauto').onclick = () => {
      RES.forEach(k => { vals[k] = 0; });
      for (let i = 0; i < need; i++) { const k = RES.slice().sort((a, b) => (st.me.res[b] - vals[b]) - (st.me.res[a] - vals[a]))[0]; vals[k]++; }
      upd();
    };
    $('#dgo').onclick = async () => { const r = await act({ type: 'discard', res: vals }); if (r.ok) closeModal(); };
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

function openTrade(tab) {
  const st = S.state, ratios = st.me.ratios, r = st.me.res;
  let give = RES.find(k => r[k] >= ratios[k]) || null, get = null;
  if (!give && tab === 'bank') tab = 'players';
  const give2 = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 }, get2 = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  const body = () => tab === 'bank'
    ? `<p>Trade with the bank. Harbors you own lower the price.</p>
      <div class="section-label">You give</div><div class="res-grid">${RES.map(k => `<button class="res-pick" data-give="${k}" aria-pressed="${give === k}" ${r[k] >= ratios[k] ? '' : 'disabled'}>${icon(k)}${RES_LABEL[k]}<span class="ratio">${ratios[k]}:1</span><small class="muted">have ${r[k]}</small></button>`).join('')}</div>
      <div class="section-label">You get</div><div class="res-grid">${RES.map(k => `<button class="res-pick" data-get="${k}" aria-pressed="${get === k}" ${k !== give && st.bank[k] > 0 ? '' : 'disabled'}>${icon(k)}${RES_LABEL[k]}<small class="muted">bank ${st.bank[k]}</small></button>`).join('')}</div>
      <div class="foot"><button class="btn" id="tclose">Close</button><button class="btn primary" id="bgo" ${give && get ? '' : 'disabled'}>${give && get ? `Trade ${ratios[give]} ${RES_LABEL[give]} for 1 ${RES_LABEL[get]}` : 'Pick both sides'}</button></div>`
    : `<p>Offer a deal to every other player. Anyone can accept; you choose who to trade with.</p>
      <div class="section-label">You give</div>${qtyRow('g', give2, r)}
      <div class="section-label">You want</div>${qtyRow('w', get2)}
      <div class="foot"><button class="btn" id="tclose">Close</button><button class="btn primary" id="pgo">Propose trade</button></div>`;
  const paint = () => {
    openModal('trade', `<h3>Trade</h3><div class="tabs"><button data-tab="bank" aria-pressed="${tab === 'bank'}">Bank and harbors</button><button data-tab="players" aria-pressed="${tab === 'players'}">Players</button></div>${body()}`, layer => {
      layer.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; paint(); });
      $('#tclose').onclick = closeModal;
      if (tab === 'bank') {
        layer.querySelectorAll('[data-give]').forEach(b => b.onclick = () => { give = b.dataset.give; if (get === give) get = null; paint(); });
        layer.querySelectorAll('[data-get]').forEach(b => b.onclick = () => { get = b.dataset.get; paint(); });
        $('#bgo').onclick = async () => { const res = await act({ type: 'bankTrade', give, get }); if (res.ok) { closeModal(); toast(`${icon(get)} Traded for ${RES_LABEL[get]}`, 'gain', true); } };
      } else {
        bindQty(layer, { g: { vals: give2, max: r }, w: { vals: get2 } }, () => {});
        $('#pgo').onclick = async () => {
          if (!sum(give2) || !sum(get2)) return toast('Add cards on both sides.', 'err');
          const res = await act({ type: 'offer', give: give2, get: get2 }); if (res.ok) closeModal();
        };
      }
    });
  };
  paint();
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
  openModal('dev', `<h3>Development cards</h3>${rows ? `<div class="devlist">${rows}</div>` : '<p>No development cards yet. Buy one for wool, grain and ore.</p>'}<div class="foot"><button class="btn" id="dclose">Close</button></div>`, layer => {
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

function openCosts() {
  const row = (ic, name, cost, note) => `<div class="devrow">${icon(ic)}<div class="txt"><b>${name}</b><small>${note}</small></div>${costIcons(cost)}</div>`;
  openModal('costs', `<h3>Building costs</h3><div class="devlist">
    ${row('road', 'Road', COST.road, 'Connects to your roads or towns.')}
    ${row('settlement', 'Settlement', COST.settlement, '1 point. Needs a road and two edges of space.')}
    ${row('city', 'City', COST.city, '2 points. Upgrades a settlement; doubles its harvest.')}
    ${row('dev', 'Development card', COST.dev, 'Knights, progress cards, or hidden points.')}</div>
    <p style="margin-top:1rem">Longest Road (5+ roads) and Largest Army (3+ knights) are worth 2 points each. Rolling a 7 makes everyone holding more than 7 cards discard half, then the roller moves the robber.</p>
    <div class="foot"><button class="btn primary" id="cclose">Got it</button></div>`, () => { $('#cclose').onclick = closeModal; });
}

function openVictory() {
  const st = S.state; if (!st || st.phase !== 'ended') return;
  const w = st.players[st.winner];
  const rows = st.players.map((p, i) => ({ p, i })).sort((a, b) => b.p.vp - a.p.vp).map(({ p, i }) => {
    const hidden = (p.devReveal || []).filter(d => d === 'vp').length;
    return `<tr><td><span class="chip" style="background:${p.color};display:inline-block;vertical-align:middle"></span> ${esc(p.name)}</td><td>${p.vp} points</td><td class="muted">${hidden ? `${plural(hidden, 'hidden point')}` : ''}${st.longestRoad && st.longestRoad.p === i ? ' Longest Road' : ''}${st.largestArmy && st.largestArmy.p === i ? ' Largest Army' : ''}</td></tr>`;
  }).join('');
  openModal('victory', `<div class="victor"><svg class="crown" viewBox="0 0 32 32" style="color:${w.color}"><use href="#ic-monopoly"/></svg>
    <h3 style="color:${w.color}">${esc(w.name)} wins</h3><p>${st.winner === me() ? 'Your island, your victory.' : 'Well played. Rematch?'}</p></div>
    <table class="score-table">${rows}</table>
    <div class="foot"><button class="btn" id="vclose">View board</button><button class="btn primary" id="vnew">New game</button></div>`, () => {
    $('#vclose').onclick = closeModal; $('#vnew').onclick = () => leaveToHome();
  });
}

// ---------- boot ----------
addEventListener('pagehide', () => { S.unloading = true; });
addEventListener('pageshow', () => { S.unloading = false; });
fetch('/api/maps').then(r => r.json()).then(j => { S.maps = j.maps; }).catch(() => {});
if (S.session && (!S.joinCode || S.joinCode === S.session.code)) startSession(S.session);
render();
})();
