// Server-side anti-cheat for online rooms. The server is authoritative (clients only send keys), so what is left is a
// script pressing those keys for you. Four independent checks, each needing sustained evidence:
//  1. trigger: fires within a few ticks of a shot opening up (direct or off up to 8 walls). Humans need ~150 ms+.
//     Measured per opening, net of the player's ping (a client-side bot sees the world and is heard that much later)
//     and of the chance that their usual fire rate hits the window anyway (spamming isn't a reaction; extra random
//     shots don't hide a bot either).
//  2. lock-on: stops turning exactly on an enemy's centre, again and again. Even a short keyboard tap turns the tank
//     ~0.17 rad, so a human stop lands anywhere around the target; an aimbot stops within ~2 ticks of rotation (ping
//     jitter blurs it by a tick) nearly every time. The touch "point" stick also stops exactly, but on the thumb, which
//     only roughly tracks the enemy, hence the high bar.
//  3. combined: both of the above clearly elevated (a "humanised" aimbot keeping each just under its limit).
//  4. flood: more messages per second than any real client sends.
const TT = require('./public/game.js');
const { C } = TT;

const AC = {
  // reaction <= ping + 6 ticks (100 ms, incl. up to 33 ms waiting for the next snapshot); humans need 200 ms+ on top of
  // ping (reaction + the client's interpolation delay). Kick when most openings get such a shot, well above chance.
  OPENS: 20, MIN_SNAP: 0.5, MIN_EXCESS: 0.35, SNAP_TICKS: 6, QUIET: 20,
  STOPS: 40, MIN_LOCK: 0.9, LOCK_ERR: 2 * C.TANK_ROT / 60, STOP_NEAR: 0.5, // a stop counts when an enemy in sight is within STOP_NEAR rad
  MIX: 0.7, MIX_SUM: 1.6, // combined: both scores at least this share of their limit, and their sum >= MIX_SUM
  // a bullet flies ~1500 px (10 s); past ~8 bounces the cast drifts from the real bullet (corners)
  BOUNCES: 8, RANGE: 1400,
  MAX_MSGS: 300,     // messages per second (the client sends on key change, at most once per frame)
};
const RB = C.BULLET_R, HIT = C.TANK_R + RB;
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

// walls grown by the bullet radius, so the bullet can be treated as a point
const grown = new WeakMap();
function wallsOf(g) {
  let w = grown.get(g.rects);
  if (!w) grown.set(g.rects, w = g.rects.map(q => [q.x - RB, q.y - RB, q.x + q.w + RB, q.y + q.h + RB]));
  return w;
}
// first wall along (x,y)+(vx,vy)*s for s in (0,max]: [s, 0 = flip vx | 1 = flip vy | -1 none]
function hitWall(walls, x, y, vx, vy, max) {
  let best = max, axis = -1;
  for (const [x0, y0, x1, y1] of walls) {
    let lo = -Infinity, hi = Infinity, ax = -1;
    if (vx) { let a = (x0 - x) / vx, b = (x1 - x) / vx; if (a > b) [a, b] = [b, a]; if (a > lo) { lo = a; ax = 0; } hi = Math.min(hi, b); } else if (x <= x0 || x >= x1) continue;
    if (vy) { let a = (y0 - y) / vy, b = (y1 - y) / vy; if (a > b) [a, b] = [b, a]; if (a > lo) { lo = a; ax = 1; } hi = Math.min(hi, b); } else if (y <= y0 || y >= y1) continue;
    if (lo <= hi && lo > 1e-6 && lo < best) { best = lo; axis = ax; }
  }
  return [best, axis];
}
// Where would a cannon shot fired now go? Returns { id, bounces } of the first tank it reaches, or null.
// The shooter itself only counts after a bounce (a shot can come back at you).
function castShot(g, t, maxBounces = AC.BOUNCES, maxLen = AC.RANGE) {
  const walls = wallsOf(g), tanks = Object.values(g.tanks).filter(o => o.alive);
  let x = t.x, y = t.y, vx = Math.cos(t.a), vy = Math.sin(t.a), len = 0;
  for (let b = 0; b <= maxBounces && len < maxLen; b++) {
    const [s, ax] = hitWall(walls, x, y, vx, vy, maxLen - len);
    let first = null, fd = s;
    for (const o of tanks) {
      if (o === t && b === 0) continue;
      const px = o.x - x, py = o.y - y, along = px * vx + py * vy, perp2 = px * px + py * py - along * along;
      if (along < 0 || perp2 > HIT * HIT) continue;
      const d = along - Math.sqrt(HIT * HIT - perp2);
      if (d < fd) { fd = d; first = o; }
    }
    if (first) return { id: first.id, bounces: b };
    if (ax < 0) return null;
    x += vx * s; y += vy * s; len += s;
    if (ax === 0) vx = -vx; else vy = -vy;
  }
  return null;
}
const isFoe = (g, t, id) => id !== t.id && !TT.sameTeam(g, t.id, id);
function onTarget(g, t) { const h = castShot(g, t); return !!h && isFoe(g, t, h.id); }
// angle error to the closest enemy in direct sight, or null
function aimError(g, t) {
  const walls = wallsOf(g); let best = null;
  for (const o of Object.values(g.tanks)) {
    if (!o.alive || !isFoe(g, t, o.id)) continue;
    const dx = o.x - t.x, dy = o.y - t.y, d = Math.hypot(dx, dy);
    if (d < 40 || d > AC.RANGE) continue;
    if (hitWall(walls, t.x, t.y, dx / d, dy / d, d - C.TANK_R)[1] >= 0) continue;
    const e = Math.abs(wrap(Math.atan2(dy, dx) - t.a));
    if (best == null || e < best) best = e;
  }
  return best;
}

// rtt: the player's round trip in ms (the server keeps it updated)
function tracker() { return { tick: 0, rtt: 0, tank: null, on: false, open: null, lastOn: -1e9, opens: [], probe: null, pn: 0, ps: 0, stops: [], rot: 0, msgs: [] }; }
const snapTicks = st => AC.SNAP_TICKS + Math.ceil(Math.min(st.rtt, 400) * 60 / 1000);
const PROBE_DECAY = 1 - 1 / 150; // chance baseline over the last ~150 probes (~20 s of play)

// Call before TT.step: will this input fire a plain cannon shot this tick?
function pressed(g, id, k) { const t = g.tanks[id]; return !!(t && t.alive && !t.weapon && k && k.f && !t.fireHeld && !(t.lock > 0)); }

const push = (arr, v, n) => { arr.push(v); if (arr.length > n) arr.shift(); };
// Call after TT.step with the input that was applied. Returns { reason, ... } when the player should be kicked.
function observe(st, g, id, k, didPress) {
  st.tick++;
  const t = g.tanks[id];
  if (!t || !t.alive || g.phase === 'over') { st.tank = null; st.open = null; st.rot = 0; return null; }
  const fresh = st.tank !== t, on = onTarget(g, t), lim = snapTicks(st);
  const ready = !t.weapon && !(t.lock > 0) && g.bullets.reduce((n, b) => n + (b.owner === id && b.kind === 'b'), 0) < C.MAX_BULLETS;
  // 1. trigger: an "opening" is the tick a shot starts to line up (not at spawn); did they fire within the limit?
  if (fresh) { st.tank = t; st.open = null; st.rot = 0; }
  else {
    // (the line may close again before a laggy bot's shot lands, so only the time counts)
    if (st.open != null && (didPress || st.tick - st.open > lim)) { push(st.opens, didPress && st.tick - st.open <= lim, AC.OPENS); st.open = null; }
    // a line that flickers (target on the edge) is not a new stimulus: it must have been closed for a while
    else if (on && !st.on && ready && st.tick - st.lastOn > AC.QUIET) { st.open = st.tick; if (didPress) { push(st.opens, true, AC.OPENS); st.open = null; } }
    // chance: the same window started at moments when nothing lines up - how often do they fire in it anyway?
    if (st.probe != null && (didPress || st.tick - st.probe > lim)) { st.pn = st.pn * PROBE_DECAY + 1; st.ps = st.ps * PROBE_DECAY + (didPress && st.tick - st.probe <= lim ? 1 : 0); st.probe = null; }
    else if (st.probe == null && !on && ready && st.tick % 8 === 0) st.probe = st.tick;
  }
  st.on = on; if (on) st.lastOn = st.tick;
  // 2. lock-on: the tick a turn key is released
  const rot = k ? (k.r ? 1 : 0) - (k.l ? 1 : 0) : 0, frozen = t.lock > 0 || t.rcId || (t.weapon === 'deathray' && t.charge > 0);
  if (!fresh && st.rot && !rot && !frozen) {
    const e = aimError(g, t);
    if (e != null && e < AC.STOP_NEAR) push(st.stops, e <= AC.LOCK_ERR, AC.STOPS);
  }
  st.rot = rot;
  return verdict(st);
}
function stats(st) {
  const n = st.opens.length, m = st.stops.length;
  const snap = n ? st.opens.filter(Boolean).length / n : 0, chance = st.pn > 10 ? st.ps / st.pn : 0;
  return { opens: n, snap, chance, stops: m, lock: m ? st.stops.filter(Boolean).length / m : 0, rtt: st.rtt };
}
function verdict(st) {
  const s = stats(st), opensFull = s.opens >= AC.OPENS, stopsFull = s.stops >= AC.STOPS, ex = s.snap - s.chance;
  if (opensFull && s.snap >= AC.MIN_SNAP && ex >= AC.MIN_EXCESS) return Object.assign(s, { reason: 'trigger' });
  if (stopsFull && s.lock >= AC.MIN_LOCK) return Object.assign(s, { reason: 'lock-on' });
  const a = Math.min(s.snap / AC.MIN_SNAP, ex / AC.MIN_EXCESS), b = s.lock / AC.MIN_LOCK;
  if (opensFull && stopsFull && a >= AC.MIX && b >= AC.MIX && a + b >= AC.MIX_SUM) return Object.assign(s, { reason: 'combined' });
  return null;
}
// Call for every message from the client. Returns a verdict when it floods.
function message(st, nowMs) {
  const q = st.msgs; q.push(nowMs);
  while (q.length && q[0] <= nowMs - 1000) q.shift();
  return q.length > AC.MAX_MSGS ? { reason: 'flood', rate: q.length } : null;
}

module.exports = { AC, castShot, onTarget, aimError, tracker, pressed, observe, stats, verdict, message };
