'use strict';
// Writes real game data (board and the views one player gets) for the Android screenshot tests, using the game's own rules engine.
//   node android-native/tools/make-fixtures.js
// The files go to android-native/app/src/test/resources/fixtures/. Run it again after the server's JSON changes.
const fs = require('fs');
const path = require('path');
const { Game } = require('../../game');
const maps = require('../../maps');

const out = path.join(__dirname, '..', 'app', 'src', 'test', 'resources', 'fixtures');
fs.mkdirSync(out, { recursive: true });
const save = (name, obj) => fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify(obj));

const names = ['Kira', 'Bram', 'Cora', 'Ada'];
function newGame(seed = 5, humans = 4) {
  const g = new Game({ code: 'K7QXM', map: maps.generatePreset('classic', seed), rng: maps.makeRng(seed) });
  g.rng = maps.makeRng(seed + 1);
  names.slice(0, humans).forEach((n, i) => g.addPlayer(n, 't' + i));
  return g;
}
const meSeat = g => g.indexOf('t0');

// 1. the waiting room
{
  const g = newGame(5, 3);
  g.do_addBot(0, { level: 'easy' });
  const v = { ...g.view(0), net: { public: false, countdown: null, fillIn: null, watching: 0 } };
  save('board', g.boardView());
  save('lobby', v);
}

// 2. my first settlement (setup): the server lists the legal corners
let g = newGame();
g.players.forEach((p, i) => { if (i > 0) p.bot = 'easy'; p.connected = true; });
g.act(0, { type: 'start' });
const me = meSeat(g);
const placeFor = pi => {
  const v = g.validSettlements(pi, false)[0];
  g.act(pi, { type: 'settle', vertex: v });
  g.act(pi, { type: 'road', edge: g.view(pi).legal.roads[0] });
};
while (g.phase === 'setup' && g.turn !== me) placeFor(g.turn);
save('setup', g.view(me));

// 3. a few turns into the game: roads, settlements, a full hand, rolled, with legal spots
while (g.phase === 'setup') placeFor(g.turn);
g.forcedDice = [[4, 2], [2, 6], [5, 4], [3, 3], [4, 4], [6, 4], [2, 4], [3, 6], [5, 5], [6, 6]];   // never a seven, so no robber in the fixtures
let guard = 0;
while (!(g.phase === 'main' && g.turn === me && !g.rolled) && guard++ < 50) { const t = g.turn; g.act(t, { type: 'roll' }); if (g.subphase === 'robber') g.act(t, { type: 'robber', tile: g.legalRobberTiles(t)[0] }); g.act(t, { type: 'endTurn' }); }
g.act(me, { type: 'roll' });
while (g.subphase) { if (g.subphase === 'robber') g.act(me, { type: 'robber', tile: g.legalRobberTiles(me)[0] }); else break; }
g.players[me].res = { wood: 3, brick: 3, sheep: 2, wheat: 3, ore: 3 };
save('main', g.view(me));

// 3b. a Heist card in hand: three cities built (the engine counts pieces left), the card bought and ready to play
{
  const saved = { city: g.players[me].pieces.city, bought: g.players[me].heistBought, dev: g.players[me].dev.slice() };
  g.players[me].pieces.city = 1; g.players[me].heistBought = true; g.players[me].dev = [{ type: 'heist', turn: 0 }, { type: 'knight', turn: 0 }, { type: 'knight', turn: g.turnNumber }];
  save('heist', g.view(me));
  g.players[me].pieces.city = saved.city; g.players[me].heistBought = saved.bought; g.players[me].dev = saved.dev;
}

// 3c. the Hidden Vault map: fog, with the diamond and a Blue Flame Cup uncovered; then the diamond opening
{
  const v = new Game({ code: 'VAULT', map: maps.generatePreset('hiddenvault', 5), rng: maps.makeRng(6) });
  v.rng = maps.makeRng(7);
  names.forEach((n, i) => v.addPlayer(n, 't' + i));
  v.players.forEach((p, i) => { if (i > 0) p.bot = 'easy'; p.connected = true; });
  v.act(0, { type: 'start' });
  const m = v.indexOf('t0');
  while (v.phase === 'setup') {
    const pi = v.turn, x = v.view(pi).legal.settlements[0];
    v.act(pi, { type: 'settle', vertex: x });
    v.act(pi, { type: 'road', edge: v.view(pi).legal.roads[0] });
  }
  const d = v.board.tiles.findIndex(t => t.terrain === 'diamond'), cup = v.board.tiles.findIndex(t => t.terrain === 'goblet');
  v.revealed.add(d); v.revealed.add(cup); v.boardVersion++;
  save('board_vault', v.boardView());
  save('vault', v.view(m));
  v.players[m].res = { wood: 1, brick: 1, sheep: 1, wheat: 1, ore: 1 };
  v.subphase = 'diamond'; v.pendingDiamond = { [m]: 3 };
  save('diamond', v.view(m));
}

// 4. the end: results
g.players[me].vp = 10;
g.phase = 'ended'; g.winner = me;
g.players.forEach((p, i) => { p.stats.collected = 20 + i * 3; p.stats.bankTrades = i; p.knights = i; });
save('ended', g.view(me));

// a spectator's view of the running game
{
  const s = g.view(-1);
  save('spectator', { ...s, spectator: true });
}
console.log('wrote', fs.readdirSync(out).join(', '));
