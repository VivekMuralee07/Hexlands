'use strict';
// Makes the store and install screenshots (screenshot-*.png) from the real app, so they always show the current design.
//   npm run screenshots            writes the PNG files next to this script
//   CHROMIUM_PATH=/path/to/chromium npm run screenshots   if Playwright cannot find its own browser
// It starts a private server (in-memory database, fast bots), plays a few turns of a game, adds some finished games for the leaderboard,
// and takes the pictures at the sizes the manifest lists. Nothing is sent anywhere.
process.env.BOT_DELAY_MS = '0';
process.env.DB_PATH = ':memory:';
process.env.LEADERBOARD_MIN_GAMES = '3';
const path = require('path');
const legal = require('./legal');
const { server, rooms, getStore, limits } = require('./server');
limits.enabled = false;
const { chromium } = require('playwright');

const OUT = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  await new Promise(r => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (p, body) => (await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const shot = async (ctx, page, name, wait = 600) => { await sleep(wait); await page.screenshot({ path: path.join(OUT, name) }); console.log('wrote', name); };
  const open = async (viewport, session, pid) => {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: viewport.width < 800, hasTouch: viewport.width < 800 });
    await ctx.addInitScript(([s, terms, id]) => {
      localStorage.setItem('hexlands.terms', JSON.stringify(terms));
      localStorage.setItem('hexlands.sound', 'false');
      if (s) localStorage.setItem('hexlands.session', JSON.stringify(s));
      if (id) localStorage.setItem('hexlands.pid', JSON.stringify(id));
    }, [session || null, legal.VERSION, pid || null]);
    const page = await ctx.newPage();
    await page.goto(base + (session ? '/room/' + session.code : '/'));
    return { ctx, page };
  };

  // A game that is a few turns old: Hana against three bots, with a decent hand.
  async function liveGame() {
    const c = await post('/api/create', { name: 'Hana', map: { preset: 'classic' }, seed: 11, vpTarget: 10 });
    return c;
  }
  async function playSetup(c) {
    const g = rooms.get(c.code).game, me = g.indexOf(c.token), act = a => post('/api/action', { code: c.code, token: c.token, action: a });
    const until = Date.now() + 30000;
    while (Date.now() < until) {
      if (g.phase === 'main' && g.turn === me) return { g, me, act };
      if (g.phase === 'setup' && g.turn === me) {
        if (g.setup.expect === 'settlement') await act({ type: 'settle', vertex: g.validSettlements(me, false)[0] });
        else {
          const mine = Object.keys(g.buildings).map(Number).filter(v => g.buildings[v].p === me);
          for (const v of mine) for (const e of g.board.vertices[v].edges.filter(e => g.roads[e] === undefined)) { if ((await act({ type: 'road', edge: e })).ok) break; }
        }
      }
      await sleep(30);
    }
    throw new Error('setup did not finish');
  }

  // 1. Home screen
  {
    const { ctx, page } = await open({ width: 540, height: 960 });
    await page.waitForSelector('.home');
    await shot(ctx, page, 'screenshot-home.png');
    await ctx.close();
  }

  // 2 and 3. The game, on a phone and on a wide screen
  const c = await liveGame();
  const portrait = await open({ width: 540, height: 960 }, c);
  await portrait.page.waitForSelector('.lobby', { timeout: 15000 });
  await post('/api/action', { code: c.code, token: c.token, action: { type: 'fillBots', level: 'medium' } });
  await post('/api/action', { code: c.code, token: c.token, action: { type: 'start' } });
  const { g, me } = await playSetup(c);
  g.forcedDice = [[2, 4]];   // a 6 pays out and nobody moves the robber
  const p = g.players[me], kinds = Object.keys(p.res); kinds.forEach((k, i) => { p.res[k] = i < 2 ? 3 : 2; });   // a full hand to look at
  await portrait.page.waitForSelector('#rollbtn:not([hidden])', { timeout: 15000 });
  await portrait.page.click('#rollbtn', { force: true });
  await portrait.page.waitForSelector('#endbtn:not([hidden])');
  await shot(portrait.ctx, portrait.page, 'screenshot-game.png', 4500);   // let the dice and the cards that fly in settle
  const wide = await open({ width: 1280, height: 720 }, c);
  await wide.page.waitForSelector('#endbtn:not([hidden])', { timeout: 15000 });
  await shot(wide.ctx, wide.page, 'screenshot-game-wide.png', 1500);
  await wide.ctx.close(); await portrait.ctx.close();

  // 4. The leaderboard, with some finished games
  const ids = ['a', 'b', 'c', 'd'].map(x => x.repeat(32)), names = ['Mira', 'Jonas', 'Priya', 'Kofi'], store = getStore(), now = Date.now();
  let n = 0;
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) for (let k = 0; k < 3; k++) {
    const win = (i * 2 + j + k) % 3 === 0 ? j : i;
    store.recordGame({ code: 'SS' + n++, finishedAt: now - n * 5 * 3600e3, map: ['Classic Island', 'Japan', 'Archipelago'][n % 3], turns: 48 + n * 2, seats: 2, pub: true,
      results: [i, j].map(q => ({ pid: ids[q], name: names[q], seat: q === i ? 0 : 1, vp: q === win ? 10 : 5 + (n % 4), won: q === win })) });
  }
  store.recordGame({ code: 'SSB', finishedAt: now - 3600e3, map: 'Japan', turns: 61, seats: 3, pub: false, results: [{ pid: ids[0], name: 'Mira', seat: 0, vp: 10, won: true }],
    bots: [{ level: 'easy', seat: 1, vp: 5, won: false }, { level: 'hard', seat: 2, vp: 7, won: false }] });
  {
    const { ctx, page } = await open({ width: 540, height: 960 }, null, ids[0]);
    await page.waitForSelector('#rankings'); await page.click('#rankings');
    await page.waitForSelector('.lbrow');
    await shot(ctx, page, 'screenshot-leaderboard.png');
    await ctx.close();
  }

  await browser.close(); server.closeAllConnections(); server.close();
}
main().catch(e => { console.error(e); process.exit(1); });
