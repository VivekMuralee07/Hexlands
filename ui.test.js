'use strict';
// Screen tests: a real browser (Playwright + Chromium) opens the game at phone size and checks what a player sees.
// If Playwright or the browser is not available, these tests are skipped. In CI the browser is installed first.
// Locally, set CHROMIUM_PATH to a Chromium binary if Playwright cannot find its own.
process.env.BOT_DELAY_MS = '0';
process.env.DB_PATH = ':memory:';
const test = require('node:test');
const assert = require('node:assert/strict');
const legal = require('./legal');
const { server, rooms, limits, getStore } = require('./server');
limits.enabled = false;

let chromium = null;
try { ({ chromium } = require('playwright')); } catch { /* Playwright is not installed */ }

let base, browser, why = null;
test.before(async () => {
  await new Promise(r => server.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }));
  if (!chromium) { why = 'Playwright is not installed'; return; }
  try { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] }); }
  catch (e) { why = 'no browser to launch: ' + String(e.message).split('\n')[0]; }
});
test.after(async () => { if (browser) await browser.close(); server.closeAllConnections(); server.close(); });

const post = async (p, body) => (await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
const PHONE = { viewport: { width: 390, height: 780 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };

async function openPage(session) {
  const ctx = await browser.newContext(PHONE);
  const errors = [];
  await ctx.addInitScript(([s, terms]) => {
    localStorage.setItem('hexlands.terms', JSON.stringify(terms));
    if (s) localStorage.setItem('hexlands.session', JSON.stringify(s));
  }, [session || null, legal.VERSION]);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + (session ? '/room/' + session.code : '/'));
  return { ctx, page, errors };
}
// A started game against 3 bots.
async function startGame() {
  const c = await post('/api/create', { name: 'Hana', map: { preset: 'classic' }, seed: 5, vpTarget: 10 });
  await post('/api/action', { code: c.code, token: c.token, action: { type: 'fillBots', level: 'easy' } });
  await post('/api/action', { code: c.code, token: c.token, action: { type: 'start' } });
  return c;
}
// Plays out Hana's setup placements through the API (so the bots answer) and waits until it is her turn to roll. Seats are shuffled when the game starts.
async function toMainPhase(c) {
  let lastReply = null;
  const g = rooms.get(c.code).game, me = g.indexOf(c.token), act = async action => (lastReply = await post('/api/action', { code: c.code, token: c.token, action }));
  const until = Date.now() + 20000;
  while (Date.now() < until) {
    if (g.phase === 'main' && g.turn === me && !g.rolled) return g;
    if (g.phase === 'setup' && g.turn === me) {
      if (g.setup.expect === 'settlement') await act({ type: 'settle', vertex: g.validSettlements(me, false)[0] });
      else {   // the road must touch the settlement just placed: try the free edges of her settlements until the game accepts one
        const mine = Object.keys(g.buildings).map(Number).filter(v => g.buildings[v].p === me);
        for (const v of mine) for (const e of g.board.vertices[v].edges.filter(e => g.roads[e] === undefined)) { if ((await act({ type: 'road', edge: e })).ok) break; }
      }
    }
    await new Promise(r => setTimeout(r, 30));
  }
  throw new Error('setup did not finish: ' + g.phase + ' turn ' + g.turn + ' me ' + me + ' ' + JSON.stringify(g.setup) + ' last ' + JSON.stringify(lastReply));
}

test('home screen: shows the title and the Leaderboard window opens', async t => {
  if (why) return t.skip(why);
  const { ctx, page, errors } = await openPage(null);
  await page.waitForSelector('#rankings');
  assert.match(await page.textContent('h1.title'), /Hexlands/);
  await page.click('#rankings');
  await page.waitForSelector('#lbbody');
  assert.match(await page.textContent('.modal h3'), /Leaderboard/);
  await page.waitForFunction(() => !/Loading/.test(document.querySelector('#lbbody').textContent));
  assert.equal(await page.locator('[data-lbtab]').count() >= 2, true, 'the leaderboard has mode tabs');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('game on a phone: player strip, clean map, info button, nothing sticks out sideways', async t => {
  if (why) return t.skip(why);
  const c = await startGame();
  const { ctx, page, errors } = await openPage(c);
  await page.waitForSelector('#board .hs, #board g', { timeout: 10000 });
  await page.waitForSelector('.pchip');
  assert.equal(await page.locator('.pchip').count(), 4, 'one chip per player');
  assert.equal(await page.locator('.pchip.turn').count(), 1, 'exactly one player is marked as having the turn');
  assert.ok(await page.isVisible('#turnpill'), 'the turn pill is shown');
  // the old drop-down and the bank row are gone from the top on phones
  assert.equal(await page.isVisible('.players > .bank'), false, 'the bank row is hidden on phones');
  assert.equal(await page.locator('.players > .pcard').first().isVisible(), false, 'the big player cards are hidden on phones');
  // no always-on glow frame around the map (a regression that once got through)
  const frame = await page.evaluate(() => { const w = document.querySelector('#wrap'); return { mode: w.hasAttribute('data-mode'), shadow: getComputedStyle(w, '::after').boxShadow, anim: getComputedStyle(w, '::after').animationName }; });
  assert.deepEqual(frame, { mode: false, shadow: 'none', anim: 'none' }, 'no glow frame while no build action is chosen');
  // the page never scrolls sideways
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(over <= 1, 'horizontal overflow: ' + over);
  // the map has room: it is the largest part of the screen
  const box = await page.locator('#wrap').boundingBox();
  assert.ok(box.height > 780 * 0.45, 'the map is tall enough: ' + box.height);
  // floating buttons: info (bottom left) and fit
  const info = await page.locator('#infobtn').boundingBox(), fit = await page.locator('#zoomreset').boundingBox();
  assert.ok(info.x < 80 && info.y > box.y + box.height - 80, 'the info button is at the bottom left of the map');
  assert.ok(fit.x > 390 / 2, 'the Fit button is on the right');
  // the info window shows the bank counts
  await page.click('#infobtn');
  await page.waitForSelector('.infowin .bank');
  assert.equal(await page.locator('.infowin .bank .bk').count(), 6, 'five resources and the development pile');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('game on a phone: after rolling, tapping a resource card opens the trade window; no Build or Trade buttons', async t => {
  if (why) return t.skip(why);
  const c = await startGame();
  const { ctx, page, errors } = await openPage(c);   // bots only play while a human is connected, so open the page first
  const g = await toMainPhase(c);
  g.forcedDice = [[2, 3]];   // a 5: no robber
  await page.waitForSelector('#rollbtn:not([hidden])', { timeout: 10000 });
  await page.click('#rollbtn', { force: true });
  await page.waitForSelector('#endbtn:not([hidden])');
  assert.equal(await page.locator('#menubar, #buildmenu').count(), 0, 'the Build and Trade buttons are gone');
  assert.equal(await page.isVisible('#tradewin'), false);
  await page.click('#hand .card >> nth=0', { force: true });
  await page.waitForSelector('#tradewin:not([hidden])');
  assert.ok(await page.isVisible('#tw-close'), 'the trade window has a close button');
  await page.click('#tw-close');
  await page.waitForSelector('#tradewin', { state: 'hidden' });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('turn alert: a buzz when it becomes your move, a flashing tab title while hidden, and a switch to turn the buzz off', async t => {
  if (why) return t.skip(why);
  const c = await startGame();
  const ctx = await browser.newContext(PHONE);
  await ctx.addInitScript(([s, terms]) => {
    localStorage.setItem('hexlands.terms', JSON.stringify(terms));
    localStorage.setItem('hexlands.session', JSON.stringify(s));
    window.__buzz = [];
    navigator.vibrate = p => { window.__buzz.push(p); return true; };
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => !!window.__hidden });
  }, [c, legal.VERSION]);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/room/' + c.code);
  await page.evaluate(() => { window.__hidden = true; });   // as if the app were in the background
  await toMainPhase(c);
  await page.waitForFunction(() => window.__buzz.length > 0, null, { timeout: 10000 });
  assert.deepEqual(await page.evaluate(() => window.__buzz[0]), [90, 60, 90]);
  const flashed = await page.evaluate(() => new Promise(r => { const seen = new Set(); const end = Date.now() + 2800; (function poll() { seen.add(document.title); Date.now() < end ? setTimeout(poll, 100) : r([...seen]); })(); }));
  assert.ok(flashed.some(x => /●/.test(x)), 'the tab title shows an alert: ' + flashed.join(' | '));
  await page.evaluate(() => { window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
  assert.ok(!/●/.test(await page.title()), 'the title goes back when the app is visible again');
  await page.click('#infobtn', { force: true });
  await page.waitForSelector('#vibsw');
  assert.equal(await page.getAttribute('#vibsw', 'aria-checked'), 'true');
  await page.click('#vibsw');
  assert.equal(await page.getAttribute('#vibsw', 'aria-checked'), 'false');
  assert.equal(await page.evaluate(() => localStorage.getItem('hexlands.vibrate')), 'false');
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---------- accessibility ----------
let axePath = null;
try { axePath = require.resolve('axe-core/axe.min.js'); } catch { /* axe-core is not installed */ }
// Runs axe (WCAG 2.2 AA and best practice rules) on the page and returns what it found. The pop-up messages are left out: they fade in and out, so their colours are never steady.
async function axeFindings(page) {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => (await axe.run({ exclude: [['#toasts']] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }))
    .violations.map(v => v.id + ' (' + v.impact + '): ' + v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' ; ')));
}

test('accessibility: no automatic (axe) findings on the home screen, the Leaderboard and info windows, the game, and the trade window', async t => {
  if (why) return t.skip(why);
  if (!axePath) return t.skip('axe-core is not installed');
  let { ctx, page } = await openPage(null);
  await page.waitForSelector('#rankings');
  assert.deepEqual(await axeFindings(page), [], 'home');
  await page.click('#rankings'); await page.waitForFunction(() => !/Loading/.test(document.querySelector('#lbbody').textContent));
  assert.deepEqual(await axeFindings(page), [], 'Leaderboard window');
  await ctx.close();

  const c = await startGame();
  ({ ctx, page } = await openPage(c));
  const g = await toMainPhase(c);
  g.forcedDice = [[2, 3]];
  await page.waitForSelector('#rollbtn:not([hidden])');
  assert.deepEqual(await axeFindings(page), [], 'game, your turn');
  await page.click('#rollbtn', { force: true }); await page.waitForSelector('#endbtn:not([hidden])');
  await page.click('#hand .card >> nth=0', { force: true }); await page.waitForSelector('#tradewin:not([hidden])');
  assert.deepEqual(await axeFindings(page), [], 'trade window');
  await page.click('#tw-close'); await page.click('#infobtn'); await page.waitForSelector('.infowin');
  assert.deepEqual(await axeFindings(page), [], 'game info window');
  await ctx.close();
});

test('accessibility: windows have a name, Escape closes them, focus stays inside and goes back, the page behind is inert', async t => {
  if (why) return t.skip(why);
  const { ctx, page } = await openPage(null);
  await page.waitForSelector('#rankings');
  await page.focus('#rankings'); await page.keyboard.press('Enter');
  await page.waitForSelector('#modal .modal');
  assert.equal(await page.getAttribute('#modal .modal', 'aria-labelledby'), 'modaltitle');
  assert.match(await page.textContent('#modaltitle'), /Leaderboard/);
  assert.equal(await page.evaluate(() => document.querySelector('#app').inert), true, 'the page behind the window is inert');
  for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => !!document.activeElement.closest('#modal')), true, 'Tab stays in the window'); }
  await page.keyboard.press('Escape');
  await page.waitForSelector('#modal', { state: 'hidden' });
  assert.equal(await page.evaluate(() => document.querySelector('#app').inert), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'rankings', 'focus goes back to the button that opened the window');
  await ctx.close();
});

test('accessibility: the map can be played with the keyboard (Tab to a glowing corner, Enter, then Enter on the tick)', async t => {
  if (why) return t.skip(why);
  const c = await startGame();
  const g = rooms.get(c.code).game, me = g.indexOf(c.token);
  const { ctx, page } = await openPage(c);
  const until = Date.now() + 15000;
  while (!(g.phase === 'setup' && g.turn === me) && Date.now() < until) await new Promise(r => setTimeout(r, 40));
  await page.waitForSelector('#board .hs[data-v]');
  assert.equal(await page.getAttribute('#board .hs[data-v]', 'role'), 'button');
  assert.match(await page.getAttribute('#board .hs[data-v]', 'aria-label'), /settlement/i);
  await page.focus('#board .hs[data-v]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#board .okbtn');
  assert.equal(await page.evaluate(() => !!document.activeElement.closest('.okbtn')), true, 'focus moves to the confirm tick');
  await page.keyboard.press('Enter');
  const placed = Date.now() + 5000;
  while (!Object.values(g.buildings).some(b => b.p === me) && Date.now() < placed) await new Promise(r => setTimeout(r, 40));
  assert.ok(Object.values(g.buildings).some(b => b.p === me), 'the settlement was built by keyboard alone');
  await ctx.close();
});

test('leaderboard window with players: summary, your standing, podium, details on tap, period and sort, no axe findings, nothing sticks out', async t => {
  if (why) return t.skip(why);
  const ids = ['a', 'b', 'c', 'd'].map(c => c.repeat(32)), names = ['Ann', 'Bo', 'Cy', 'Di'], store = getStore(), now = Date.now();
  let n = 0;
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) for (let k = 0; k < 3; k++) {   // every pair plays 3 public games, so everyone has 9 games
    const win = (i + j + k) % 3 === 0 ? j : i;
    store.recordGame({ code: 'UI' + n++, finishedAt: now - n * 3600e3, map: ['Classic Island', 'Japan'][n % 2], turns: 50 + n, seats: 2, pub: true,
      results: [i, j].map(p => ({ pid: ids[p], name: names[p], seat: p === i ? 0 : 1, vp: p === win ? 10 : 6, won: p === win })) });
  }
  store.recordGame({ code: 'UIB', finishedAt: now, map: 'Japan', turns: 66, seats: 3, pub: false, results: [{ pid: ids[0], name: 'Ann', seat: 0, vp: 10, won: true }],
    bots: [{ level: 'easy', seat: 1, vp: 5, won: false }, { level: 'hard', seat: 2, vp: 7, won: false }] });   // a game against two bots
  const { ctx, page, errors } = await openPage(null);
  await page.evaluate(id => localStorage.setItem('hexlands.pid', JSON.stringify(id)), ids[0]);
  await page.waitForSelector('#rankings'); await page.click('#rankings');
  await page.waitForSelector('.lbrow');
  assert.equal(await page.locator('.lbrow').count(), 4, 'one list row for each of the four players');
  assert.equal(await page.locator('.lbpodium').count(), 0, 'no podium any more: one list');
  assert.equal(await page.locator('.lbrank.r1, .lbrank.r2, .lbrank.r3').count(), 3, 'gold, silver and bronze badges for the top three');
  assert.equal(await page.locator('.lbsum > div').count(), 3, 'three totals');
  assert.ok(await page.isVisible('.lbyou'), 'your own standing is shown');
  await page.click('.lbrow >> nth=1');
  assert.equal(await page.getAttribute('.lbrow >> nth=1', 'aria-expanded'), 'true');
  assert.ok(await page.locator('.lbitem >> nth=1').locator('.lbdetail').isVisible(), 'tapping a player shows the details');
  assert.match(await page.locator('.lbitem >> nth=1').locator('.lbdetail').textContent(), /Win rate[\s\S]*Average points[\s\S]*Best game[\s\S]*Win streak[\s\S]*Favourite map[\s\S]*Last played/);
  await page.click('.lbrow >> nth=0');
  assert.equal(await page.locator('.lbitem .lbdetail:visible').count(), 2, 'the first player opens too, the second stays open');
  assert.match(await page.textContent('.lbrow >> nth=0'), /wins?/, 'the headline figure is wins when sorted by wins');
  await page.selectOption('#lbsort', 'rate'); await page.waitForFunction(() => !document.querySelector('#lbbody').hasAttribute('aria-busy'));
  await page.selectOption('#lbperiod', '7'); await page.waitForFunction(() => !document.querySelector('#lbbody').hasAttribute('aria-busy'));
  assert.ok(await page.locator('.lbrow').count() >= 1, 'still listed for the last 7 days');
  assert.match(await page.textContent('.lbrow >> nth=0'), /win rate/, 'the headline figure follows the sort: win rate');
  assert.equal(await page.evaluate(() => { const m = document.querySelector('#modal .modal'); return m.scrollWidth - m.clientWidth; }) <= 1, true, 'nothing sticks out sideways inside the window');
  if (axePath) assert.deepEqual(await axeFindings(page), [], 'the populated, expanded Leaderboard window');
  await page.click('.lbtab, [data-lbtab="all"]');
  await page.waitForFunction(() => document.querySelector('[data-lbtab="all"]').getAttribute('aria-selected') === 'true');
  await page.waitForSelector('.lbbots');
  assert.equal(await page.locator('.lbbot').count(), 3, 'a card for each difficulty');
  const botText = await page.textContent('.lbbots'); for (const w of ['Easy', 'Medium', 'Hard']) assert.ok(botText.includes(w), w);
  assert.match(botText, /Bots won 0 of the 1 games/);
  assert.equal(await page.locator('.lbbots').count(), 1);
  if (axePath) assert.deepEqual(await axeFindings(page), [], 'the All games list with the bot statistics');
  await page.click('[data-lbtab="ranked"]'); await page.waitForFunction(() => !document.querySelector('.lbbots'));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('home screen: everything fits on one screen, with no scrolling, on small and large phones and on its side', async t => {
  if (why) return t.skip(why);
  for (const [w, h] of [[320, 568], [360, 640], [390, 780], [412, 915], [844, 390], [667, 375]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(v => localStorage.setItem('hexlands.terms', JSON.stringify(v)), legal.VERSION);
    const page = await ctx.newPage();
    await page.goto(base + '/'); await page.waitForSelector('#rankings');
    const m = await page.evaluate(() => { const home = document.querySelector('.home'), hero = document.querySelector('.hero-board').getBoundingClientRect(); const box = id => document.getElementById(id).getBoundingClientRect(); const last = document.querySelector('.legalfoot').getBoundingClientRect();
      return { page: document.documentElement.scrollHeight - innerHeight, inner: home.scrollHeight - home.clientHeight, hero: Math.round(hero.height), bottom: Math.round(last.bottom), quick: box('quick').height > 0, sideways: document.documentElement.scrollWidth - innerWidth }; });
    assert.ok(m.page <= 0, `${w}x${h}: the page scrolls by ${m.page}px`);
    assert.ok(m.inner <= 0, `${w}x${h}: the home screen scrolls inside itself by ${m.inner}px`);
    assert.ok(m.bottom <= h, `${w}x${h}: the Terms and Privacy links end at ${m.bottom}px, below the screen`);
    assert.ok(m.hero >= 90, `${w}x${h}: the picture is only ${m.hero}px tall`);
    assert.ok(m.quick && m.sideways <= 0);
    await ctx.close();
  }
});
