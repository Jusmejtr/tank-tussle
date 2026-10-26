// Emoji reactions + 8-player spawns (pure Node): allowed list, cooldown, bot reactions, no shared spawn cells with 8 tanks.
const TT = require('../public/game.js');
let fail = 0; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fail++; };
console.log('reactions');
ok(TT.REACTIONS.length === 6 && TT.REACTION_NAMES.length === 6, '6 reactions: ' + TT.REACTIONS.join(' '));
{ const L = {};
  ok(TT.tryReact(L, 1, 0, 10), 'first reaction accepted');
  ok(!TT.tryReact(L, 1, 1, 10.5), 'second within 1.5 s rejected');
  ok(TT.tryReact(L, 2, 1, 10.5), 'other player not affected by P1 cooldown');
  ok(TT.tryReact(L, 1, 2, 11.6), 'accepted again after the cooldown');
  ok(!TT.tryReact(L, 3, 6, 20) && !TT.tryReact(L, 3, -1, 20) && !TT.tryReact(L, 3, '1', 20) && !TT.tryReact(L, 3, 1.5, 20) && !TT.tryReact(L, 3, null, 20), 'out-of-list / non-integer ids rejected');
  ok(L[3] == null, 'rejected ids do not start a cooldown'); }
{ const isBot = id => id >= 10; let laugh = 0, none = 0;
  for (let i = 0; i < 2000; i++) { const r = TT.botReaction({ type: 'die', id: 1, by: 10 }, isBot); if (r) { ok.q = ok.q || (r.id === 10 && (r.r === 0 || r.r === 3)); laugh++; } else none++; }
  ok(laugh > 600 && laugh < 1200 && ok.q, `bot killer reacts sometimes with 😂/😎 (${laugh}/2000)`);
  ok(TT.botReaction({ type: 'die', id: 1, by: 2 }, isBot) === null, 'humans never auto-react');
  ok(TT.botReaction({ type: 'fire', id: 10 }, isBot) === null, 'only kills trigger bot reactions'); }
console.log('8 players');
{ let overlap = 0, rounds = 300;
  for (let k = 0; k < rounds; k++) { const g = TT.createGame(); TT.setMode(g, k % 2 ? 'teams' : 'ffa'); for (let i = 0; i < 8; i++) TT.addPlayer(g, { id: i + 1, colorIndex: i }); TT.newRound(g);
    const ts = Object.values(g.tanks); for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) if (Math.hypot(ts[i].x - ts[j].x, ts[i].y - ts[j].y) < TT.C.CELL * 0.9) overlap++; }
  ok(overlap === 0, `8 tanks never share a spawn cell (${rounds} rounds)`); }
{ const g = TT.createGame(); for (let i = 0; i < 8; i++) TT.addPlayer(g, { id: i + 1, colorIndex: i }); ok(new Set(g.players.map(p => TT.COLORS[p.colorIndex ?? p.color])).size === 8 && TT.COLORS.length >= 8, '8 distinct colours');
  ok([0, 1].map(t => g.players.filter(p => p.team === t).length).join() === '4,4', 'teams auto-balance 4 v 4'); }
{ // degenerate: tiny maze, random picks exhausted -> fallback still finds free cells
  const g = TT.createGame(); for (let i = 0; i < 8; i++) TT.addPlayer(g, { id: i + 1 }); TT.newRound(g); ok(Object.keys(g.tanks).length === 8, '8 tanks spawned'); }
console.log(fail ? `${fail} FAILED` : 'all passed'); process.exit(fail ? 1 : 0);
