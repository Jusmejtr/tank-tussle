// Anti-cheat (pure Node): a scripted aimbot / trigger-bot gets flagged; human-like play, fire spamming and even the
// built-in bots (which have a reaction time) do not.
const TT = require('../public/game.js');
const TTBots = require('../public/bots.js');
const AC = require('../anticheat.js');
let fail = 0; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fail++; };
const DT = 1 / 60;
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

function clearLine(g, x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 4);
  for (let i = 1; i < n; i++) if (g.rects.some(q => TT.circleHitsRect(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, 2, q))) return false;
  return true;
}
// Drives toward the nearest enemy; once it has a line of sight it turns onto it. `fire(g, t, st)` decides the trigger.
function policy(fire) {
  const st = { held: false };
  return (g, t) => {
    const k = { u: false, d: false, l: false, r: false, f: false };
    if (!t || !t.alive) return k;
    let tgt = null, bd = 1e9;
    for (const o of Object.values(g.tanks)) if (o !== t && o.alive) { const d = Math.hypot(o.x - t.x, o.y - t.y); if (d < bd) { bd = d; tgt = o; } }
    if (!tgt) return k;
    const vis = clearLine(g, t.x, t.y, tgt.x, tgt.y);
    const [wx, wy] = vis ? [tgt.x, tgt.y] : TT.nextWaypoint(g, t.x, t.y, tgt.x, tgt.y);
    Object.assign(k, TT.pointKeys(t.a, Math.atan2(wy - t.y, wx - t.x)));
    if (vis && bd < 150) k.u = false;
    k.f = fire(g, t, st) && !st.held; st.held = k.f;
    return k;
  };
}
const aimbot = () => policy((g, t) => AC.aligned(g, t));
// human: notices the line after a reaction time (150-300 ms), sometimes too late; also fires at random now and then
const human = () => policy((g, t, st) => {
  const on = AC.aligned(g, t);
  if (on && st.seen == null) st.seen = g.time + 0.15 + Math.random() * 0.15;
  if (!on) st.seen = null;
  return (on && g.time >= st.seen) || Math.random() < 0.01;
});
const spammer = () => policy(() => Math.random() < 0.15);

// player 1 plays with `ctl`, players 2-3 are normal bots. Returns the first verdict (or null) within `secs`.
function play(ctl, secs, seed = 1) {
  const g = TT.createGame();
  for (let i = 1; i <= 3; i++) TT.addPlayer(g, { id: i, colorIndex: i - 1 });
  TT.newRound(g); g.crateTimer = 1e9;
  const brains = { 2: TTBots.newBrain('normal'), 3: TTBots.newBrain('normal') }, st = AC.tracker();
  let shots = 0;
  for (let i = 0; i < secs / DT; i++) {
    g.crateTimer = 1e9;
    const inputs = { 1: ctl(g, g.tanks[1]) };
    for (const id of [2, 3]) inputs[id] = TTBots.think(g, g.tanks[id], brains[id], DT);
    const p = AC.pressed(g, 1, inputs[1]); if (p) shots++;
    TT.step(g, inputs, DT); g.events.length = 0;
    const v = AC.observe(st, g, 1, p);
    if (v) return { v, shots, t: i * DT };
  }
  return { v: null, shots, st };
}

console.log('aimbot');
{ let caught = 0, when = [];
  for (let s = 0; s < 6; s++) { const r = play(aimbot(), 240, s); if (r.v) { caught++; when.push(r.t.toFixed(0) + 's'); } }
  ok(caught === 6, `aimbot kicked in 6/6 games (got ${caught}, after ${when.join(', ')})`); }
{ const bot = TTBots.newBrain('hard'); let caught = 0;
  for (let s = 0; s < 3; s++) if (play(policy((g, t) => AC.aligned(g, t) && Math.random() < 0.5), 240, s).v) caught++;
  ok(caught >= 2, `aimbot that skips half its chances still kicked (${caught}/3)`); }

console.log('legit play');
{ let caught = 0, shots = 0;
  for (let s = 0; s < 6; s++) { const r = play(human(), 300, s); shots += r.shots; if (r.v) caught++; }
  ok(caught === 0 && shots > 100, `human-like reactions never kicked (${caught}/6 games, ${shots} shots)`); }
{ let caught = 0;
  for (let s = 0; s < 4; s++) if (play(spammer(), 240, s).v) caught++;
  ok(caught === 0, `fire spammer not kicked (${caught}/4)`); }
for (const lvl of ['easy', 'normal', 'hard']) {
  let caught = 0;
  for (let s = 0; s < 3; s++) { const br = TTBots.newBrain(lvl); if (play((g, t) => TTBots.think(g, t, br, DT), 240, s).v) caught++; }
  ok(caught === 0, `built-in ${lvl} bot (has a reaction time) not kicked (${caught}/3)`);
}

console.log('details');
{ const st = AC.tracker(); for (let i = 0; i < AC.AC.WINDOW - 1; i++) st.shots.push({ aligned: true, snap: true });
  ok(AC.verdict(st) === null, 'no verdict before the window is full');
  st.shots.push({ aligned: true, snap: true }); ok(!!AC.verdict(st), 'full window of instant on-target shots -> verdict'); }
{ // spawn: facing an enemy from the first tick and holding fire is not a "reaction"
  const g = TT.createGame(); TT.addPlayer(g, { id: 1, colorIndex: 0 }); TT.addPlayer(g, { id: 2, colorIndex: 1 }); TT.newRound(g);
  const a = g.tanks[1], b = g.tanks[2]; a.x = 96; a.y = 96; b.x = 96; b.y = 96 + 64 * 0; b.x = 96 + 40; a.a = 0;
  g.rects = []; const st = AC.tracker();
  const p = AC.pressed(g, 1, { f: true }); TT.step(g, { 1: { f: true } }, DT); AC.observe(st, g, 1, p);
  ok(p && st.shots.length === 1 && st.shots[0].aligned && !st.shots[0].snap, 'shot on the very first tick of a tank counts as on-target but not instant'); }

console.log(fail ? `\n${fail} FAILED` : '\nall ok'); process.exit(fail ? 1 : 0);
