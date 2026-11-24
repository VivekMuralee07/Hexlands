'use strict';
// The game server, as the Android tests run it: the same server.js, plus a few extra endpoints under /__test/ that bend the rules so a test can
// reach situations that are rare in a real game (a particular dice roll, rich hands, the diamond opening). Only the tests start this file:
// the real server (server.js) has none of these endpoints.
//   node android-native/tools/test-server.js          (PORT, as for the real server)
process.env.BOT_DELAY_MS = process.env.BOT_DELAY_MS || '0';
process.env.DB_PATH = process.env.DB_PATH || ':memory:';
const { server, rooms } = require('../../server');

const normal = server.listeners('request');
server.removeAllListeners('request');
server.on('request', (req, res) => {
  if (!req.url.startsWith('/__test/')) { for (const h of normal) h.call(server, req, res); return; }
  let body = '';
  req.on('data', d => { body += d; });
  req.on('end', () => {
    const reply = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    try {
      const b = JSON.parse(body || '{}');
      const room = rooms.get(String(b.code || '').toUpperCase());
      if (!room) return reply(404, { error: 'no such room' });
      const g = room.game, p = g.players[b.seat];
      switch (req.url.split('?')[0]) {
        case '/__test/dice': g.forcedDice = b.dice; break;                                         // [[3, 4], [2, 2], ...]: the next rolls
        case '/__test/grant': for (const k in b.res) { p.res[k] += b.res[k]; g.bank[k] -= b.res[k]; } break;   // cards from the bank into a hand
        case '/__test/pieces': Object.assign(p.pieces, b.pieces); break;                         // e.g. { city: 1 } counts as three cities built
        case '/__test/diamond': g.subphase = 'diamond'; g.pendingDiamond = { [b.seat]: b.count }; break;   // the diamond opens for one player
        case '/__test/turn': g.turn = b.seat; g.rolled = !!b.rolled; break;                       // whose move it is
        default: return reply(404, { error: 'unknown test endpoint' });
      }
      g.version++;
      reply(200, { ok: true });
    } catch (e) { reply(500, { error: String(e.message || e) }); }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Hexlands test server on http://localhost:${PORT}`));
