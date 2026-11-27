// Anti-cheat (pure Node): scripted aim (instant trigger, bounce trigger, lock-on, humanised mixes) and input floods get
// flagged; human-like play (keyboard and touch stick), fire spamming and the built-in bots do not.
// Deterministic by default (SEED=n to try other seeds).
let seed = (+process.env.SEED || 12345) >>> 0;
Math.random = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const TT = require('../public/game.js');
const TTBots = require('../public/bots.js');
const AC = require('../anticheat.js');
let fail = 0; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fail++; };
const DT = 1 / 60, STEP = TT.C.TANK_ROT * DT, R = (a, b) => a + Math.random() * (b - a);
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());

function clearLine(g, x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 4);
  for (let i = 1; i < n; i++) if (g.rects.some(q => TT.circleHitsRect(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, 2, q))) return false;
  return true;
}
// Where to point: the nearest enemy if in sight, else the next maze waypoint towards it.
function goal(g, t) {
  let tgt = null, bd = 1e9;
  for (const o of Object.values(g.tanks)) if (o !== t && o.alive) { const d = Math.hypot(o.x - t.x, o.y - t.y); if (d < bd) { bd = d; tgt = o; } }
  if (!tgt) return null;
  const vis = clearLine(g, t.x, t.y, tgt.x, tgt.y), [wx, wy] = vis ? [tgt.x, tgt.y] : TT.nextWaypoint(g, t.x, t.y, tgt.x, tgt.y);
  return { a: Math.atan2(wy - t.y, wx - t.x), vis, d: bd };
}
// Aim styles: return {l, r, u}
// `a` is the tank angle as the client predicts it (where it will be when this input reaches the server)
const aimPerfect = () => (g, t, gl, a) => TT.pointKeys(a, gl.a);
// keyboard human: sees the world ~120 ms late, taps keys for at least a few ticks, stops by feel (±0.1 rad)
function aimKeyboard() {
  const hist = [], s = { dir: 0, held: 0, tol: 0.15, lead: 0 };
  return (g, t, gl) => {
    hist.push(TT.wrapA(gl.a - t.a)); if (hist.length > 8) hist.shift();
    const seen = hist[0] - s.dir * STEP * hist.length; // what it looked like + how far I have turned since
    if (s.dir) { s.held++; if (s.held >= s.min && (Math.sign(seen) !== s.dir || Math.abs(seen) < s.lead)) s.dir = 0; }
    else if (Math.abs(seen) > s.tol) { s.dir = Math.sign(seen); s.held = 0; s.min = 3 + (Math.random() * 3 | 0); s.lead = Math.max(0, 0.05 + 0.1 * gauss()); s.tol = R(0.08, 0.25); }
    return { l: s.dir < 0, r: s.dir > 0, u: Math.abs(hist[hist.length - 1]) < 0.6 };
  };
}
// touch "point" stick: the client turns exactly to the thumb, but the thumb only roughly tracks the enemy (late + wobble)
function aimStick() {
  const hist = []; let wob = 0;
  return (g, t, gl, a) => {
    hist.push(gl.a); if (hist.length > 8) hist.shift();
    wob = wob * 0.97 + 0.03 * 0.12 * gauss() * 6;
    return TT.pointKeys(a, hist[0] + wob);
  };
}
// Trigger styles: return true to press fire this tick
const fireInstant = () => g_t => AC.onTarget(...g_t);
const fireDelay = (lo, hi, extra = 0.01) => { const s = { at: null }; return ([g, t]) => {
  const on = AC.onTarget(g, t); if (!on) s.at = null; else if (s.at == null) s.at = g.time + R(lo, hi);
  return (on && g.time >= s.at) || Math.random() < extra; }; };
const fireSpam = () => () => Math.random() < 0.15;
// only takes trick shots: fires the instant a line off 3+ walls reaches an enemy
const fireDeep = () => ([g, t]) => { const h = AC.castShot(g, t); return !!h && h.id !== t.id && h.bounces >= 3; };

function player(aim, trig) {
  let held = false;
  return (g, t, a) => {
    const k = { u: false, d: false, l: false, r: false, f: false };
    if (!t || !t.alive) { held = false; return k; }
    const gl = goal(g, t); if (!gl) return k;
    Object.assign(k, aim(g, t, gl, a));
    if (gl.vis && gl.d < 150) k.u = false;
    k.f = trig([g, t]) && !held; held = k.f;
    return k;
  };
}

// Player 1 plays with `ctl` over a network (ping 30-120 ms + jitter: its input reaches the server that much after the
// state it reacted to), players 2-3 are normal bots. Returns the first verdict (or null) within `secs`.
function play(ctl, secs, net = true) {
  const g = TT.createGame();
  for (let i = 1; i <= 3; i++) TT.addPlayer(g, { id: i, colorIndex: i - 1 });
  TT.newRound(g);
  const brains = { 2: TTBots.newBrain('normal'), 3: TTBots.newBrain('normal') }, st = AC.tracker();
  const ping = net ? R(30, 120) : 0, jit = net ? R(0, 20) : 0, lag = () => net ? Math.ceil((ping + R(0, 33) + R(0, jit)) / 1000 / DT) : 0;
  st.rtt = ping; // what the server measures
  const q = []; let cur = {}, last = 0;
  const rotOf = k => (k.r ? 1 : 0) - (k.l ? 1 : 0);
  for (let i = 0; i < secs / DT; i++) {
    g.crateTimer = 1e9;
    const t = g.tanks[1], L = Math.round(ping / 1000 / DT + 1);
    let a = t ? t.a : 0; // client prediction: where my tank will point when this input lands
    if (t) for (let j = 0, ci = 0, k = cur; j < L; j++) { while (ci < q.length && q[ci].at <= i + j) k = q[ci++].k; a += rotOf(k) * STEP; }
    const mine = ctl(g, t, a);
    last = Math.max(last, i + lag()); q.push({ at: last, k: mine });
    while (q.length && q[0].at <= i) cur = q.shift().k;
    const inputs = { 1: cur };
    for (const id of [2, 3]) inputs[id] = TTBots.think(g, g.tanks[id], brains[id], DT);
    const p = AC.pressed(g, 1, inputs[1]);
    TT.step(g, inputs, DT); g.events.length = 0;
    const v = AC.observe(st, g, 1, inputs[1], p);
    if (v) return { v, t: i * DT, s: AC.stats(st) };
  }
  return { v: null, s: AC.stats(st) };
}
const pct = x => Math.round(x * 100) + '%';
function games(name, mk, n, secs, expectKick) {
  let caught = 0; const why = new Set(), at = [], s0 = [];
  for (let i = 0; i < n; i++) { const r = play(mk(), secs); if (r.v) { caught++; why.add(r.v.reason); at.push(r.t.toFixed(0) + 's'); } s0.push(r.s); }
  const avg = f => pct(s0.reduce((a, s) => a + f(s), 0) / n);
  const info = `${caught}/${n}${why.size ? ' ' + [...why].join('+') + ' after ' + at.join(',') : ''}; instant ${avg(s => s.snap)} (chance ${avg(s => s.chance)}), dead-on stops ${avg(s => s.lock)}`;
  ok(expectKick ? caught >= expectKick : caught === 0, `${name}: ${expectKick ? 'kicked' : 'not kicked'} (${info})`);
}

console.log(`ray cast vs real bullets (<= ${AC.AC.BOUNCES} bounces)`);
{ let agree = 0, n = 0, bounced = 0;
  for (let k = 0; k < 1500; k++) {
    const g = TT.createGame(); for (let i = 1; i <= 4; i++) TT.addPlayer(g, { id: i, colorIndex: i - 1 }); TT.newRound(g); g.crateTimer = 1e9;
    const t = g.tanks[1]; t.a = Math.random() * 2 * Math.PI;
    const pred = AC.castShot(g, t);
    TT.step(g, { 1: { f: true } }, DT);
    const b = g.bullets[0]; let sx = Math.sign(b.vx), sy = Math.sign(b.vy), bn = 0, hit = null;
    for (let i = 0; i < AC.AC.RANGE / TT.C.BULLET_SPEED / DT && !hit; i++) {
      TT.step(g, {}, DT);
      if (g.bullets.includes(b)) { if (Math.sign(b.vx) !== sx) { bn++; sx = -sx; } if (Math.sign(b.vy) !== sy) { bn++; sy = -sy; } }
      for (const e of g.events) if (e.type === 'die' && !hit) hit = e.id; g.events.length = 0;
    }
    const real = hit && bn <= AC.AC.BOUNCES ? hit : null; n++;
    if ((pred ? pred.id : null) === real) { agree++; if (pred && pred.bounces) bounced++; }
  }
  ok(agree / n > 0.93 && bounced > 150, `predicted target matches the real bullet in ${pct(agree / n)} of ${n} shots (${bounced} via bounces)`); }

console.log('bots / scripts');
games('instant aimbot', () => player(aimPerfect(), fireInstant()), 5, 240, 5);
games('aimbot with 0-50 ms random delay', () => player(aimPerfect(), fireDelay(0, 0.05)), 4, 600, 4);
games('bounce trigger-bot with human-like aiming', () => player(aimKeyboard(), fireInstant()), 4, 300, 4);
games('trick-shot bot (only 3+ bounce shots) with human-like aiming', () => player(aimKeyboard(), fireDeep()), 4, 600, 4);
games('humanised trigger (100-250 ms) but perfect lock-on aim', () => player(aimPerfect(), fireDelay(0.1, 0.25)), 4, 600, 2);
games('mixed: half instant shots, sloppy aim half the time', () => { const a = aimPerfect(), h = aimKeyboard(), f = fireInstant(), d = fireDelay(0.15, 0.3);
  return player((g, t, gl) => (Math.random() < 0.5 ? a : h)(g, t, gl), x => (Math.random() < 0.6 ? f : d)(x)); }, 4, 300, 3);

console.log('legit play');
games('keyboard human (150-300 ms reactions)', () => player(aimKeyboard(), fireDelay(0.15, 0.3)), 8, 300, 0);
games('fast keyboard human (110-200 ms)', () => player(aimKeyboard(), fireDelay(0.11, 0.2)), 6, 300, 0);
games('touch stick human', () => player(aimStick(), fireDelay(0.15, 0.3)), 8, 300, 0);
games('fire spammer', () => player(aimKeyboard(), fireSpam()), 4, 240, 0);
for (const lvl of ['easy', 'normal']) games(`built-in ${lvl} bot`, () => { const br = TTBots.newBrain(lvl); return (g, t) => TTBots.think(g, t, br, DT); }, 3, 240, 0);

console.log('details');
{ const st = AC.tracker(); for (let i = 0; i < AC.AC.OPENS - 1; i++) st.opens.push(true);
  ok(AC.verdict(st) === null, 'no verdict before the window is full');
  st.opens.push(true); ok(AC.verdict(st)?.reason === 'trigger', 'full window of instant shots -> trigger');
  st.pn = 100; st.ps = 70; ok(AC.verdict(st) === null, '... unless they fire that often anyway (spamming)'); }
{ const st = AC.tracker(); for (let i = 0; i < AC.AC.STOPS; i++) st.stops.push(true);
  ok(AC.verdict(st)?.reason === 'lock-on', 'full window of dead-on stops -> lock-on'); }
{ // spawn: facing an enemy from the first tick and holding fire is not a "reaction"
  const g = TT.createGame(); TT.addPlayer(g, { id: 1, colorIndex: 0 }); TT.addPlayer(g, { id: 2, colorIndex: 1 }); TT.newRound(g);
  const a = g.tanks[1], b = g.tanks[2]; a.x = 96; a.y = 96; b.x = 136; b.y = 96; a.a = 0; g.rects = [];
  const st = AC.tracker(), k = { f: true }, p = AC.pressed(g, 1, k); TT.step(g, { 1: k }, DT); AC.observe(st, g, 1, k, p);
  ok(p && st.opens.length === 0, 'facing an enemy at spawn and firing is not a reaction'); }
{ // bounce: enemy hidden behind a wall, but a shot off the side wall reaches it
  const g = TT.createGame(); TT.addPlayer(g, { id: 1, colorIndex: 0 }); TT.addPlayer(g, { id: 2, colorIndex: 1 }); TT.newRound(g);
  g.rects = [{ x: 0, y: 0, w: 400, h: 4 }, { x: 190, y: 30, w: 20, h: 80 }];
  const a = g.tanks[1], b = g.tanks[2]; a.x = 100; a.y = 60; b.x = 300; b.y = 60;
  a.a = 0; ok(!AC.onTarget(g, a), 'wall between: straight shot not on target');
  a.a = -Math.atan2(2 * (60 - 4 - TT.C.BULLET_R), 200); // aim at the enemy's mirror image in the top wall
  ok(AC.onTarget(g, a) && AC.castShot(g, a).bounces === 1, 'shot off the wall onto the enemy counts as on target (1 bounce)'); }
{ const st = AC.tracker(); let v = null;
  for (let i = 0; i < 200 && !v; i++) v = AC.message(st, 1000 + i * 5); // 200 msgs/s
  ok(!v, '200 messages/s is fine');
  for (let i = 0; i < 400 && !v; i++) v = AC.message(st, 2000 + i * 2); // 500 msgs/s
  ok(v && v.reason === 'flood', 'message flood -> flood'); }

console.log(fail ? `\n${fail} FAILED` : '\nall ok'); process.exit(fail ? 1 : 0);
