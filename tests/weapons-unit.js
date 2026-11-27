// Weapons (pure Node): death ray freezes the tank while charging; armed traps never appear in snapshots.
const TT = require('../public/game.js');
let fail = 0; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fail++; };
const DT = 1 / 60;
function mk() { const g = TT.createGame(); for (let i = 1; i <= 2; i++) TT.addPlayer(g, { id: i, colorIndex: i - 1 }); TT.newRound(g); g.crateTimer = 1e9; return g; }

console.log('death ray');
{ const g = mk(), t = g.tanks[1]; TT.giveWeapon(t, 'deathray');
  TT.step(g, { 1: { f: true } }, DT); ok(t.charge > 0, 'fire starts the charge');
  const x = t.x, y = t.y, a = t.a;
  for (let i = 0; i < 30; i++) TT.step(g, { 1: { u: true, r: true } }, DT);
  ok(t.x === x && t.y === y, 'cannot drive while charging'); ok(t.a === a, 'cannot turn while charging');
  for (let i = 0; i < 200 && t.weapon; i++) TT.step(g, {}, DT);
  ok(!t.weapon, 'beam fired'); }

console.log('snapshot');
{ const g = mk(), t = g.tanks[1]; TT.giveWeapon(t, 'mine'); TT.step(g, { 1: { f: true } }, DT);
  ok(TT.snapshot(g).mn.length === 1, 'arming trap is visible');
  for (let i = 0; i < 90; i++) TT.step(g, {}, DT);
  ok(TT.mineState(g.mines[0]) === 1 && TT.snapshot(g).mn.length === 0, 'armed (invisible) trap is not sent to clients'); }

console.log(fail ? `\n${fail} FAILED` : '\nall ok'); process.exit(fail ? 1 : 0);
