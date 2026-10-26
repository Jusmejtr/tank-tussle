// Team mode: round logic, scoring, balancing, snapshot fields, and bots respecting teammates (pure Node, no browser).
const TT = require('../public/game.js'), TTBots = require('../public/bots.js');
let fail = 0; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fail++; };
const mk = (teams, n = 4) => { const g = TT.createGame(); TT.setMode(g, 'teams'); for (let i = 0; i < n; i++) TT.addPlayer(g, { id: i + 1, colorIndex: i, team: teams[i] }); TT.newRound(g); g.events.length = 0; g.crateTimer = 1e9; return g; };
const run = (g, s) => { for (let i = 0; i < s * 60; i++) TT.step(g, {}, 1 / 60); };
console.log('balancing');
ok(JSON.stringify(TT.balanceTeams([{ bot: 0 }, { bot: 0 }, { bot: 1 }, { bot: 1 }])) === '[0,1,0,1]', '2 humans + 2 bots -> R,B,R,B');
ok(JSON.stringify(TT.balanceTeams([{ bot: 0 }, { bot: 1 }, { bot: 1 }, { bot: 1 }])) === '[0,1,0,1]', '1 human + 3 bots -> 2 v 2');
ok(JSON.stringify(TT.balanceTeams([{ bot: 0 }, { bot: 0 }, { bot: 0 }, { bot: 1 }])) === '[0,1,0,1]', '3 humans + 1 bot -> 2 v 2');
{ const g = TT.createGame(); for (let i = 0; i < 5; i++) TT.addPlayer(g, { id: i + 1 }); ok(g.players.map(p => p.team).join('') === '01010', 'addPlayer without a team joins the smaller team'); }
console.log('round logic');
{ const g = mk([0, 0, 1, 1]); g.tanks[3].alive = false; run(g, 0.2); ok(g.phase === 'play', 'one Blue down: round goes on');
  g.tanks[1].alive = false; run(g, 0.2); ok(g.phase === 'play', 'one of each down: round goes on (1 v 1 left)');
  g.tanks[4].alive = false; run(g, 0.1); ok(g.phase === 'ending', 'all Blue down: round ends');
  run(g, TT.C.ROUND_END_DELAY + 0.2); ok(g.teamScore[0] === 1 && g.teamScore[1] === 0, `Red scores (${g.teamScore})`); ok(g.round === 2, 'next round started'); }
{ const g = mk([0, 0, 1, 1]); g.tanks[1].alive = false; g.tanks[2].alive = false; g.tanks[3].alive = false; g.tanks[4].alive = false; run(g, TT.C.ROUND_END_DELAY + 0.3); ok(g.teamScore.join() === '0,0', 'everyone dead: no point'); }
{ const g = mk([0, 0, 0, 0]); run(g, 0.3); ok(g.phase === 'play', 'all on one team: round does not end immediately'); }
{ const g = mk([0, 1, 0, 1]); g.tanks[2].alive = false; g.tanks[4].alive = false; run(g, TT.C.ROUND_END_DELAY + 0.2); ok(g.teamScore[0] === 1, 'two Red survivors still score one team point'); }
{ const g = TT.createGame(); for (let i = 0; i < 3; i++) TT.addPlayer(g, { id: i + 1 }); TT.newRound(g); g.tanks[1].alive = false; run(g, 0.1); ok(g.phase === 'play', 'free-for-all unchanged: 2 of 3 alive -> play'); }
console.log('friendly fire (FRIENDLY_FIRE = ' + TT.FRIENDLY_FIRE + ')');
{ const g = mk([0, 0, 1, 1]); const a = g.tanks[1], b = g.tanks[2];
  g.rects = []; a.x = 100; a.y = 100; a.a = 0; b.x = 160; b.y = 100; g.tanks[3].x = g.tanks[4].x = 900;
  g.bullets.push({ id: 999, owner: 1, kind: 'b', r: TT.KIND_R.b, x: 140, y: 100, vx: 60, vy: 0, age: 1, a: 0 });
  run(g, 0.3); ok(b.alive === !TT.FRIENDLY_FIRE, 'a teammate\'s bullet ' + (TT.FRIENDLY_FIRE ? 'kills' : 'passes through')); }
console.log('snapshot');
{ const g = mk([0, 1, 0, 1]); const s = TT.snapshot(g); ok(s.md === 1 && Array.isArray(s.ts) && s.sc.every(x => x.length === 3 && (x[2] === 0 || x[2] === 1)), 'carries mode, team scores and each player\'s team'); }
console.log('bots');
{ // a bot facing a teammate with an enemy right behind: must not fire; facing only the enemy: fires
  let shotMate = 0, shotEnemy = 0;
  for (let trial = 0; trial < 40; trial++) {
    const g = mk([0, 0, 1, 1]); g.rects = TT.mazeRects({ cols: g.maze.cols, rows: g.maze.rows, hw: g.maze.hw.map(r => r.map((v, i) => 0)), vw: g.maze.vw.map(r => r.map(() => 0)) });
    g.maze = { cols: g.maze.cols, rows: g.maze.rows, hw: g.maze.hw.map(r => r.map(() => 0)), vw: g.maze.vw.map(r => r.map(() => 0)) };
    g.rects = TT.mazeRects(g.maze);
    const [b1, m, e, e2] = [1, 2, 3, 4].map(i => g.tanks[i]);
    Object.assign(b1, { x: 60, y: 60, a: 0 }); Object.assign(m, { x: 140, y: 60, a: Math.PI / 2 }); Object.assign(e, { x: 220, y: 60 }); Object.assign(e2, { x: 60, y: 300 });
    const br = TTBots.newBrain('hard'); br.next = 0; br.cool = 0;
    for (let i = 0; i < 30; i++) { const k = TTBots.think(g, b1, br, 1 / 60); if (k.f) shotMate++; b1.a = 0; b1.x = 60; b1.y = 60; }
    // now no teammate in the way
    Object.assign(m, { x: 60, y: 200 });
    const br2 = TTBots.newBrain('hard'); br2.next = 0; br2.cool = 0;
    for (let i = 0; i < 30; i++) { const k = TTBots.think(g, b1, br2, 1 / 60); if (k.f) { shotEnemy++; break; } b1.a = 0; b1.x = 60; b1.y = 60; }
  }
  if (TT.FRIENDLY_FIRE) ok(shotMate === 0, `holds fire when a teammate is in the line of fire (${shotMate} shots)`);
  else ok(shotMate > 0, 'friendly fire off: shoots straight through teammates');
  ok(shotEnemy > 30, `fires when only an enemy is in line (${shotEnemy}/40 trials)`);
}
{ // full bot-only team matches: count team kills vs enemy kills
  let tk = 0, ek = 0, pts = 0;
  for (let k = 0; k < 4; k++) {
    const g = TT.createGame(); TT.setMode(g, 'teams'); const brains = {};
    for (let i = 0; i < 6; i++) { TT.addPlayer(g, { id: i + 1, colorIndex: i, team: i % 2 }); brains[i + 1] = TTBots.newBrain('hard'); }
    TT.newRound(g);
    for (let i = 0; i < 60 * 60; i++) { const inp = {}; for (const p of g.players) inp[p.id] = TTBots.think(g, g.tanks[p.id], brains[p.id], 1 / 60); TT.step(g, inp, 1 / 60);
      for (const e of g.events) if (e.type === 'die' && e.by !== e.id) (TT.sameTeam(g, e.id, e.by) ? tk++ : ek++); g.events.length = 0; }
    pts += g.teamScore[0] + g.teamScore[1];
  }
  ok(ek > 0 && pts > 0, `bot team matches play out: ${ek} enemy kills, ${tk} team kills, ${pts} team points in 4 min`);
  ok(tk <= Math.max(2, ek * 0.25), 'team kills are rare (accidents from bounces only)');
}
console.log(fail ? `${fail} FAILURES` : 'teams-unit: all passed'); process.exit(fail ? 1 : 0);
