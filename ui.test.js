'use strict';
// Screen tests: a real browser (Playwright + Chromium) opens the game at phone size and checks what a player sees.
// If Playwright or the browser is not available, these tests are skipped. In CI the browser is installed first.
// Locally, set CHROMIUM_PATH to a Chromium binary if Playwright cannot find its own.
process.env.BOT_DELAY_MS = '0';
process.env.DB_PATH = ':memory:';
const test = require('node:test');
const assert = require('node:assert/strict');
const legal = require('./legal');
const { server, rooms, limits } = require('./server');
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
  await page.waitForSelector('.lblist');
  assert.match(await page.textContent('.modal h3'), /Leaderboard/);
  await page.waitForFunction(() => !/Loading/.test(document.querySelector('.lblist').textContent));
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
