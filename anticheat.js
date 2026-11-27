// Server-side aimbot / trigger-bot detection for online rooms.
// The server is authoritative (clients only send keys), so the remaining cheat is a script that presses those keys
// for you: turn onto an enemy and fire the instant the barrel lines up. For every cannon shot we record whether the
// barrel had a clear, direct line to an enemy and how long that line had been open (first shot per opening only). Humans need a visual reaction
// (~150 ms+) and miss a lot; a script fires within a few ticks of lining up, shot after shot.
const TT = require('./public/game.js');
const { C } = TT;

const AC = {
  WINDOW: 30,        // judge the last N cannon shots (only the first shot per opened line counts)
  MIN_ALIGNED: 0.5,  // ...of which at least this share had a direct line to an enemy
  MIN_SNAP: 0.5,     // ...and at least this share fired within SNAP_TICKS of the line opening
  // measured: scripted aim ~70% instant, human-like reactions ~1%, the Hard built-in bot (~120 ms reaction) ~20%
  SNAP_TICKS: 4,     // 4 ticks @ 60 Hz = 67 ms, well below human reaction time
  RANGE: 1200,
};

const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

function clearShot(g, x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 4);
  for (let i = 1; i < n; i++) { const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n; if (g.rects.some(q => TT.circleHitsRect(x, y, 1, q))) return false; }
  return true;
}
// Does tank t's barrel point straight (no bounce) at an enemy with nothing in between?
function aligned(g, t) {
  const bx = t.x + Math.cos(t.a) * (C.TANK_R + C.BULLET_R + 3), by = t.y + Math.sin(t.a) * (C.TANK_R + C.BULLET_R + 3);
  for (const o of Object.values(g.tanks)) {
    if (o === t || !o.alive || TT.sameTeam(g, t.id, o.id)) continue;
    const d = Math.hypot(o.x - t.x, o.y - t.y);
    if (d > AC.RANGE || d < 1) continue;
    const tol = Math.asin(Math.min(1, (C.TANK_R + C.BULLET_R) / d));
    if (Math.abs(wrap(Math.atan2(o.y - t.y, o.x - t.x) - t.a)) > tol) continue;
    const k = Math.max(0, d - C.TANK_R) / d; // stop at the enemy's hull
    if (clearShot(g, bx, by, t.x + (o.x - t.x) * k, t.y + (o.y - t.y) * k)) return true;
  }
  return false;
}

function tracker() { return { tick: 0, tank: null, since: null, shots: [] }; }

// Call before TT.step: will this input fire a plain cannon shot this tick?
function pressed(g, id, k) { const t = g.tanks[id]; return !!(t && t.alive && !t.weapon && k && k.f && !t.fireHeld && !t.lock); }

// Call after TT.step. Returns stats when the player should be kicked, else null.
function observe(st, g, id, didPress) {
  st.tick++;
  const t = g.tanks[id];
  if (!t || !t.alive || g.phase === 'over') { st.tank = null; st.since = null; return null; }
  const on = aligned(g, t);
  if (st.tank !== t) { st.tank = t; st.since = on ? -Infinity : null; st.fired = false; } // new round / respawn: a held key or spawn-facing isn't a reaction
  else if (!on) st.since = null;
  else if (st.since == null) { st.since = st.tick; st.fired = false; }
  if (!didPress) return null;
  if (on && st.fired) return null; // follow-up shots down the same line say nothing about reaction time
  if (on) st.fired = true;
  st.shots.push({ aligned: on, snap: on && st.tick - st.since <= AC.SNAP_TICKS });
  if (st.shots.length > AC.WINDOW) st.shots.shift();
  return verdict(st);
}
function verdict(st) {
  const n = st.shots.length; if (n < AC.WINDOW) return null;
  const a = st.shots.filter(s => s.aligned).length / n, s = st.shots.filter(s => s.snap).length / n;
  return a >= AC.MIN_ALIGNED && s >= AC.MIN_SNAP ? { shots: n, aligned: a, snap: s } : null;
}

module.exports = { AC, aligned, tracker, pressed, observe, verdict };
