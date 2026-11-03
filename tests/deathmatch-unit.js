// Deathmatch (pure Node): respawn after 3 s at a safe spot, spawn protection, weapon reset, kill scoring
// (self / team kills -1), team totals, kill target + time limit end the match, mid-match joiners, snapshot fields.
const TT = require('../public/game.js');
let fail = 0; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fail++; };
const DT = 1 / 60, run = (g, s, inputs = {}) => { for (let i = 0; i < Math.round(s / DT); i++) TT.step(g, inputs, DT); };
function mk(n, mode = 'ffa', opts = {}) {
  const g = TT.createGame(); TT.setMode(g, mode); TT.setMatch(g, 'dm', opts);
  for (let i = 0; i < n; i++) TT.addPlayer(g, { id: i + 1, colorIndex: i, team: mode === 'teams' ? i % 2 : undefined });
  TT.newRound(g); g.crateTimer = 1e9; return g;
}
// shoot tank `victim` with a bullet owned by `by`, placed on top of it
function hit(g, victim, by) { const t = g.tanks[victim]; t.prot = 0; g.bullets.push({ id: g.nextId++, owner: by, kind: 'b', r: TT.C.BULLET_R, x: t.x, y: t.y, vx: 0.001, vy: 0, age: 1, a: 0 }); TT.step(g, {}, DT); }
console.log('setup');
{ const g = mk(2); ok(g.match === 'dm' && g.dmTarget === 15 && g.dmTime === 300, 'defaults: first to 15 kills, 5:00');
  TT.setMatch(g, 'dm', { target: 25 }); ok(g.dmTarget === 25, 'target 25 accepted'); TT.setMatch(g, 'dm', { target: 7 }); ok(g.dmTarget === 15, 'odd target falls back to 15');
  TT.setMatch(g, 'rounds'); ok(g.match === 'rounds', 'rounds mode'); }
{ const g = mk(2); ok(Object.values(g.tanks).every(t => t.prot === TT.DM.PROTECT), 'tanks start with spawn protection');
  run(g, 1.6); ok(Object.values(g.tanks).every(t => t.prot === 0), 'protection ends after 1.5 s'); }
console.log('respawn');
{ const g = mk(3); run(g, 2); const r0 = g.round; TT.giveWeapon(g.tanks[1], 'laser');
  hit(g, 1, 2); ok(!g.tanks[1].alive && g.tanks[1].respawn > 2.9, 'killed tank is dead with a 3 s timer');
  ok(g.players[1].score === 1, 'killer +1');
  run(g, 1.5); ok(!g.tanks[1].alive, 'still dead at 1.5 s'); ok(g.round === r0 && g.phase === 'play', 'no new round, the others keep playing');
  run(g, 1.55); const t = g.tanks[1];
  ok(t.alive, 'respawned after ~3 s'); ok(t.weapon === null && t.ammo === 0, 'weapon reset to the default cannon'); ok(t.prot > 1.3, 'spawn protection on');
  // protected: a bullet on top passes through
  g.bullets.push({ id: g.nextId++, owner: 2, kind: 'b', r: 3.2, x: t.x, y: t.y, vx: 0.001, vy: 0, age: 1, a: 0 }); TT.step(g, {}, DT);
  ok(t.alive && g.bullets.length === 1, 'protected tank cannot be hit (bullet passes through)');
  TT.step(g, { 1: { f: true } }, DT); ok(t.prot === 0, 'firing ends spawn protection early');
  run(g, 1.6); ok(g.tanks[1].prot === 0, 'protection gone'); }
{ let worst = 1e9, onTank = 0, nearBullet = 0;
  for (let k = 0; k < 200; k++) { const g = mk(8); run(g, 0.05);
    const enemy = g.tanks[2]; g.bullets.push({ id: 999, owner: 3, kind: 'b', r: 3.2, x: g.tanks[4].x, y: g.tanks[4].y, vx: 1, vy: 0, age: 0, a: 0 });
    hit(g, 1, 2); run(g, 3.05); const t = g.tanks[1];
    for (const o of Object.values(g.tanks)) if (o.id !== 1 && o.alive && Math.hypot(o.x - t.x, o.y - t.y) < TT.C.CELL * 0.9) onTank++;
    for (const b of g.bullets) if (Math.hypot(b.x - t.x, b.y - t.y) < TT.C.CELL) nearBullet++; }
  ok(onTank === 0, 'respawn never lands on another tank (200 tries, 8 tanks)'); ok(nearBullet === 0, 'respawn never next to a live bullet'); }
{ // the safest cell is the one far from the only enemy
  const g = mk(2); g.tanks[2].x = 0.5 * TT.C.CELL; g.tanks[2].y = 0.5 * TT.C.CELL; let far = 0;
  for (let k = 0; k < 50; k++) { const [c, r] = TT.safeSpawnCell(g, 1); if (c + r >= g.maze.cols + g.maze.rows - 4) far++; }
  ok(far >= 45, `spawns far from the enemy (${far}/50 near the opposite corner)`); }
console.log('scoring');
{ const g = mk(3); hit(g, 1, 1); ok(g.players[0].score === -1, 'self-kill = -1'); }
{ const g = mk(4, 'teams'); // 1,3 Red; 2,4 Blue
  hit(g, 2, 1); ok(g.players[0].score === 1 && g.teamScore[0] === 1, 'kill an enemy: +1 player and team');
  hit(g, 3, 1); ok(g.players[0].score === 0 && g.teamScore[0] === 0, 'team kill: -1 player and team');
  hit(g, 4, 4); ok(g.players[3].score === -1 && g.teamScore[1] === -1, 'self-kill in teams: -1 player and team'); }
console.log('match end');
{ const g = mk(3, 'ffa', { target: 10 }); for (let i = 0; i < 9; i++) { hit(g, 2, 1); run(g, 3.1); }
  ok(g.phase === 'play' && g.players[0].score === 9, '9 kills: still playing');
  hit(g, 3, 1); ok(g.phase === 'over' && g.winner && g.winner.id === 1 && g.winner.reason === 'target', 'first to 10 kills wins');
  const snap = JSON.stringify(g.tanks); run(g, 5); ok(JSON.stringify(g.tanks) === snap, 'game frozen after the end (no respawns, no movement)');
  hit(g, 1, 2); ok(g.tanks[1].alive, 'no kills after the end'); }
{ const g = mk(2, 'ffa', { time: 4 }); hit(g, 2, 1); run(g, 4.1); ok(g.phase === 'over' && g.winner.reason === 'time' && g.winner.id === 1, 'time limit: most kills wins'); }
{ const g = mk(2, 'ffa', { time: 2 }); run(g, 2.1); ok(g.phase === 'over' && g.winner.id === 0, 'time limit with a tie = draw'); }
{ const g = mk(4, 'teams', { target: 10 }); for (let i = 0; i < 10; i++) { hit(g, i % 2 ? 2 : 4, i % 2 ? 1 : 3); run(g, 3.1); }
  ok(g.phase === 'over' && g.winner.team === 0 && g.teamScore[0] === 10, 'Teams: team total reaches 10 -> Red wins'); }
console.log('joiners + snapshot');
{ const g = mk(2); run(g, 1); TT.addPlayer(g, { id: 9 }); TT.step(g, {}, DT); ok(g.tanks[9] && !g.tanks[9].alive, 'mid-match joiner waits'); run(g, 1.05); ok(g.tanks[9].alive, 'and drops in after ~1 s');
  hit(g, 1, 2); const s = TT.snapshot(g), tk = s.tk.find(t => t[0] === 1);
  ok(Array.isArray(s.dm) && s.dm[1] === 15 && s.dm[0] > 290, 'snapshot carries time left + target: ' + s.dm); ok(tk[9] > 2.9 && tk[9] <= 3, 'snapshot carries the respawn countdown'); }
{ const g = TT.createGame(); for (let i = 0; i < 2; i++) TT.addPlayer(g, { id: i + 1 }); TT.newRound(g); ok(TT.snapshot(g).dm === 0 && g.match === 'rounds', 'rounds mode unchanged (no dm in snapshot)');
  const t = g.tanks[1]; t.prot = 0; g.bullets.push({ id: 99, owner: 2, kind: 'b', r: 3.2, x: t.x, y: t.y, vx: .001, vy: 0, age: 1, a: 0 }); TT.step(g, {}, DT); run(g, 4); ok(!g.tanks[1] || g.round === 2, 'rounds: a kill still ends the round (new round started)'); }
console.log('bots');
{ const TTBots = require('../public/bots.js');
  for (const mode of ['ffa', 'teams']) {
    const g = mk(4, mode, { time: 1e6 }); g.crateTimer = 3; const br = {}; for (const p of g.players) br[p.id] = TTBots.newBrain('hard');
    let deaths = 0, respawns = 0;
    for (let i = 0; i < 60 * 240 && g.phase === 'play'; i++) {
      const inp = {}; for (const p of g.players) inp[p.id] = TTBots.think(g, g.tanks[p.id], br[p.id], DT);
      TT.step(g, inp, DT); for (const e of g.events.splice(0)) { if (e.type === 'die') deaths++; if (e.type === 'respawn') respawns++; }
    }
    const dead = Object.values(g.tanks).filter(t => !t.alive);
    ok(deaths >= 5 && respawns >= deaths - 4, `${mode}: bots fight on and respawn (${deaths} deaths, ${respawns} respawns in ≤4 min)`);
    ok(dead.every(t => t.respawn > 0 && t.respawn <= 3), `${mode}: every dead tank has a countdown running`);
    const kills = g.players.reduce((n, p) => n + p.score, 0); ok(g.phase === 'over' || Math.abs(kills) <= deaths, `${mode}: scores add up (${g.players.map(p => p.score).join('/')})`);
  } }
console.log(fail ? `${fail} FAILED` : 'all passed'); process.exit(fail ? 1 : 0);
