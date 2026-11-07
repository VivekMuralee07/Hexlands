// Plays a real Hexlands game with the engine and records the moves the tutorial shows.
// Records the moves shown in the animated tutorial by playing a real game with the Hexlands engine, and writes them into tutorial.js.
// Run it after changing the rules:  node tutorial-record.js [seed]
'use strict';
const { Game } = require('./game'); const maps = require('./maps'); const bots = require('./bots'); const fs = require('fs'), path = require('path');
function record(SEED = 7) {
const g = new Game({ code: 'TUT', map: maps.generatePreset('classic', SEED), rng: maps.makeRng(SEED) });
g.addPlayer('You', 'you'); g.addPlayer('Ada', 'ada'); g.addPlayer('Bram', 'bram');
g.players.forEach(p => { p.connected = true; p.offlineSince = null; });
g.act(0, { type: 'start' });
const ME = g.indexOf('you'), A = g.indexOf('ada'), B = g.indexOf('bram');
const RES = ['wood', 'brick', 'sheep', 'wheat', 'ore'], T2R = { forest: 'wood', hills: 'brick', pasture: 'sheep', fields: 'wheat', mountains: 'ore' };
const snap = () => ({ b: JSON.parse(JSON.stringify(g.buildings)), r: { ...g.roads }, robber: g.robber, hand: { ...g.players[ME].res }, cards: g.players.map(p => RES.reduce((a, k) => a + p.res[k], 0)), vp: g.players.map((_, i) => g.vp(i, true)) });
const steps = [];
const rec = (kind, data = {}) => steps.push({ kind, ...data, at: snap() });
const edgeOf = (a, b) => g.board.edges.find(e => e.v.includes(a) && e.v.includes(b)).id;
// ---- setup: the bots choose every spot ----
while (g.phase === 'setup') {
  const pi = g.turn, before = { ...g.players[pi].res };
  const s = bots.decide(g, pi, 'hard'); g.act(pi, s);
  const got = RES.filter(k => g.players[pi].res[k] > before[k]);
  const tiles = got.length ? g.board.vertices[s.vertex].hexes.filter(h => T2R[g.board.tiles[h].terrain]).map(h => ({ tile: h, res: T2R[g.board.tiles[h].terrain] })) : [];
  rec('settle', { p: pi, v: s.vertex, start: tiles });
  const r = bots.decide(g, pi, 'hard'); g.act(pi, r); rec('road', { p: pi, e: r.edge });
}
// ---- a roll that pays several players ----
const touching = sum => g.board.tiles.filter(t => t.number === sum && t.id !== g.robber).flatMap(t => t.vertices.filter(v => g.buildings[v]).map(v => ({ tile: t.id, p: g.buildings[v].p, res: T2R[t.terrain], n: g.buildings[v].type === 'city' ? 2 : 1 })));
let bestSum = 6, bestN = -1; for (let s = 2; s <= 12; s++) { if (s === 7) continue; const ps = new Set(touching(s).map(x => x.p)).size; if (ps > bestN) { bestN = ps; bestSum = s; } }
const roller = g.turn, a1 = Math.max(1, bestSum - 6), d1 = [a1, bestSum - a1];
const pays = touching(bestSum);
g.forcedDice = [d1]; g.act(roller, { type: 'roll' }); rec('roll', { p: roller, dice: d1, pays });
// helper: play other players' turns quietly (a non-7 roll, then end)
const quiet = () => { while (g.turn !== ME) { const pi = g.turn; if (!g.rolled) { g.forcedDice = [[1, 2]]; g.act(pi, { type: 'roll' }); } g.act(pi, { type: 'endTurn' }); } };
if (g.turn !== ME) { g.act(g.turn, { type: 'endTurn' }); quiet(); }
if (!g.rolled) { g.forcedDice = [[2, 2]]; g.act(ME, { type: 'roll' }); }
// ---- build: two roads, a settlement, then a city ----
const me = g.players[ME];
me.res = { wood: 6, brick: 6, sheep: 4, wheat: 6, ore: 6 };
const V = g.board.vertices; let target = null;
outer: for (const v of Object.keys(g.buildings).filter(k => g.buildings[k].p === ME).map(Number)) for (const mid of V[v].adj) for (const w of V[mid].adj) {
  if (w === v || V[v].adj.includes(w) || !g.canSettle(ME, w, false)) continue;
  const e1 = edgeOf(v, mid), e2 = edgeOf(mid, w);
  if ((g.roads[e1] !== undefined && g.roads[e1] !== ME) || g.roads[e2] !== undefined) continue;
  if (g.roads[e1] === undefined && !g.canRoad(ME, e1)) continue;
  target = { e1, e2, w, from: v }; break outer;
}
const spots = g.validRoads(ME);
if (g.roads[target.e1] === undefined) { g.act(ME, { type: 'road', edge: target.e1 }); rec('build-road', { e: target.e1, options: spots }); }
g.act(ME, { type: 'road', edge: target.e2 }); rec('build-road', { e: target.e2 });
const settleOptions = g.validSettlements(ME, true);
g.act(ME, { type: 'settle', vertex: target.w }); rec('build-settle', { v: target.w, options: settleOptions });
const firstTown = Object.keys(g.buildings).map(Number).find(v => g.buildings[v].p === ME && g.buildings[v].type === 'settlement' && v !== target.w);
g.act(ME, { type: 'city', vertex: firstTown }); rec('build-city', { v: firstTown });
// ---- trade with the bank ----
me.res.wood = 4; const ratio = g.tradeRatio(ME, 'wood');
g.act(ME, { type: 'bankTrade', give: 'wood', get: 'ore' }); rec('bank', { give: 'wood', n: ratio, get: 'ore' });
g.act(ME, { type: 'endTurn' }); quiet();
// ---- a 7: discard, move the robber, steal ----
g.players[A].res = { wood: 2, brick: 2, sheep: 2, wheat: 2, ore: 1 };   // 9 cards: Ada must discard
g.forcedDice = [[3, 4]]; g.act(ME, { type: 'roll' });
const discards = { ...g.pendingDiscards };
rec('seven', { dice: [3, 4], discards });
for (const k of Object.keys(g.pendingDiscards)) { const pi = +k; const before = g.players[pi].res; const d = bots.decide(g, pi, 'hard'); g.act(pi, d); rec('discard', { p: pi, n: discards[k] }); }
const opts = g.legalRobberTiles(ME);
const score = t => g.board.tiles[t].vertices.filter(v => g.buildings[v] && g.buildings[v].p !== ME).length * 10 + ([6, 8].includes(g.board.tiles[t].number) ? 5 : 0) - g.board.tiles[t].vertices.filter(v => g.buildings[v] && g.buildings[v].p === ME).length * 50;
const rt = opts.slice().sort((a, b) => score(b) - score(a))[0];
const victims = g.robberVictims(ME, rt);
g.act(ME, { type: 'robber', tile: rt, victim: victims[0] }); rec('robber', { tile: rt, victim: victims[0], card: g.lastSteal && g.lastSteal.card });
// ---- development cards: buy one, play a Knight ----
me.res = { wood: 2, brick: 2, sheep: 3, wheat: 3, ore: 3 };
g.act(ME, { type: 'buyDev' }); const drawn = me.dev[me.dev.length - 1].type; rec('buydev', { card: drawn });
g.act(ME, { type: 'endTurn' }); quiet();
g.forcedDice = [[1, 3]]; g.act(ME, { type: 'roll' });
me.dev.push({ type: 'knight', turn: g.turnNumber - 1 });
g.act(ME, { type: 'playDev', card: 'knight' });
const opts2 = g.legalRobberTiles(ME).filter(t => t !== g.robber), rt2 = opts2.sort((a, b) => score(b) - score(a))[0], vic2 = g.robberVictims(ME, rt2);
g.act(ME, { type: 'robber', tile: rt2, victim: vic2[0] }); rec('knight', { tile: rt2, victim: vic2[0], knights: me.knights });
// ---- Longest Road: extend until it is yours ----
me.res = { wood: 12, brick: 12, sheep: 0, wheat: 0, ore: 0 };
const chain = []; let guard = 0;
while (!(g.longestRoad && g.longestRoad.p === ME) && guard++ < 12 && me.pieces.road > 0) {
  const options = g.validRoads(ME); if (!options.length) break;
  const lenAfter = e => { const save = g.roads[e]; g.roads[e] = ME; const L = g.longestRoadOf ? g.longestRoadOf(ME) : 0; if (save === undefined) delete g.roads[e]; else g.roads[e] = save; return L; };
  const e = options.slice().sort((x, y) => lenAfter(y) - lenAfter(x))[0];
  g.act(ME, { type: 'road', edge: e }); chain.push(e);
}
rec('longest', { chain, holder: g.longestRoad && g.longestRoad.p, length: g.longestRoad && g.longestRoad.len });
// ---- the Heist: three cities, buy it, steal a settlement next turn ----
me.res = { wood: 2, brick: 2, sheep: 4, wheat: 9, ore: 12 };
for (const v of Object.keys(g.buildings).map(Number).filter(v => g.buildings[v].p === ME && g.buildings[v].type === 'settlement')) g.act(ME, { type: 'city', vertex: v });
rec('cities', {});
g.act(ME, { type: 'buyHeist' }); rec('buyheist', {});
g.act(ME, { type: 'endTurn' }); quiet();
g.forcedDice = [[2, 3]]; g.act(ME, { type: 'roll' });
const targets = Object.keys(g.buildings).map(Number).filter(v => g.buildings[v].p !== ME && g.buildings[v].type === 'settlement');
const loot = targets.sort((x, y) => V[y].edges.filter(e => g.roads[e] === g.buildings[y].p).length - V[x].edges.filter(e => g.roads[e] === g.buildings[x].p).length)[0];
const fromP = g.buildings[loot].p;
g.act(ME, { type: 'playDev', card: 'heist', vertex: loot }); const hev = g.events.filter(e => e.type === 'heist').pop();
rec('heist', { v: loot, from: fromP, roads: hev ? hev.roads : [] });
return { seed: SEED, board: g.boardView(), players: g.players.map(p => ({ name: p.name, color: p.color })), me: ME, steps };
}
module.exports = { record };
if (require.main === module) {
  const out = record(Number(process.argv[2] || 7)), file = path.join(__dirname, 'tutorial.js'), src = fs.readFileSync(file, 'utf8');
  const next = src.replace(/^const TUT_REC = .*;$/m, () => 'const TUT_REC = ' + JSON.stringify(out) + ';').replace(/seed \d+\)/, 'seed ' + out.seed + ')');
  fs.writeFileSync(file, next);
  console.log('tutorial.js updated:', out.steps.length, 'moves recorded with seed', out.seed);
}
