// Unit test for both phone stick modes:
//  'tank'  TT.stickKeys: up = forward, down = reverse, left/right = turn, diagonals combine
//  'point' TT.pointKeys: turn toward the stick angle the short way, drive once within 40°, never jitter
const TT = require('../public/game.js');
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };
const K = k => (k.u ? 'u' : '') + (k.d ? 'd' : '') + (k.l ? 'l' : '') + (k.r ? 'r' : '');
const at = deg => [Math.cos(deg * Math.PI / 180) * 0.9, Math.sin(deg * Math.PI / 180) * 0.9]; // screen angle, -90 = up
const cases = [[-90, 'u'], [90, 'd'], [180, 'l'], [0, 'r'], [-135, 'ul'], [-45, 'ur'], [135, 'dl'], [45, 'dr'],
  [-80, 'u'], [-100, 'u'], [-70, 'u'], [-60, 'ur'], [10, 'r'], [170, 'l'], [100, 'd']];
for (const [deg, want] of cases) { const k = TT.stickKeys(...at(deg)); ok(K(k) === want, `stick at ${deg}° -> ${K(k)} (want ${want})`); }
ok(K(TT.stickKeys(0, 0)) === '', 'centre: nothing');
ok(K(TT.stickKeys(0.2, -0.1)) === '', 'dead zone: nothing');
ok(K(TT.stickKeys(0, -0.3)) === '', 'below the axis threshold: nothing');
ok(K(TT.stickKeys(0, -0.45)) === 'u', 'past the axis threshold: forward');
for (const [dx, dy] of [[0.9, 0.9], [-1, -1], [0.5, -0.5]]) { const k = TT.stickKeys(dx, dy); ok(!(k.u && k.d) && !(k.l && k.r), 'never opposite keys at once'); }
// Movement: whatever way the tank faces, stick up drives it forward along its heading, down reverses, angle unchanged.
const run = (a0, stick, secs) => { const t = { x: 0, y: 0, a: a0 }; for (let i = 0; i < secs * 60; i++) { const k = TT.stickKeys(...stick); TT.moveTank(t, (k.r ? 1 : 0) - (k.l ? 1 : 0), (k.u ? 1 : 0) - (k.d ? 1 : 0), 1 / 60, []); } return t; };
for (let deg = -180; deg < 180; deg += 30) {
  const a0 = deg * Math.PI / 180, hx = Math.cos(a0), hy = Math.sin(a0);
  const f = run(a0, at(-90), 1), b = run(a0, at(90), 1), l = run(a0, at(180), 0.25), r = run(a0, at(0), 0.25), ul = run(a0, at(-135), 0.25);
  ok(f.x * hx + f.y * hy > 100 && Math.abs(f.a - a0) < 1e-9, `facing ${deg}°: up drives forward (${(f.x * hx + f.y * hy).toFixed(1)}px)`);
  ok(b.x * hx + b.y * hy < -60 && Math.abs(b.a - a0) < 1e-9, `facing ${deg}°: down reverses (${(b.x * hx + b.y * hy).toFixed(1)}px)`);
  ok(TT.wrapA(l.a - a0) < -0.5 && Math.hypot(l.x, l.y) < 1e-9, `facing ${deg}°: left turns left on the spot`);
  ok(TT.wrapA(r.a - a0) > 0.5 && Math.hypot(r.x, r.y) < 1e-9, `facing ${deg}°: right turns right on the spot`);
  ok(TT.wrapA(ul.a - a0) < -0.5 && Math.hypot(ul.x, ul.y) > 10, `facing ${deg}°: up-left = forward + turn left`);
}
// ---- 'Point' mode (TT.pointKeys): turn to the stick angle the short way, drive within 40°, no jitter ----
{
const D = Math.PI / 180, step = TT.C.TANK_ROT / 60;
const pcases = [ // [tank angle, stick angle, expected]
  [0, 0, { u: 1, l: 0, r: 0 }], [0, 30 * D, { u: 1, r: 1 }], [0, -30 * D, { u: 1, l: 1 }],
  [0, 90 * D, { u: 0, r: 1 }], [0, -90 * D, { u: 0, l: 1 }], [0, 179 * D, { u: 0, r: 1 }], [0, -179 * D, { u: 0, l: 1 }],
  [170 * D, -170 * D, { u: 1, r: 1 }],   // wraps across ±180: short way is +20°
  [-170 * D, 170 * D, { u: 1, l: 1 }],
  [-90 * D, -90 * D + step * 0.9, { u: 1, l: 0, r: 0 }], // within one frame step: no rotation (no jitter)
  [0, 45 * D, { u: 0, r: 1 }],           // beyond 40°: pivot first
];
for (const [a, t, e] of pcases) {
  const k = TT.pointKeys(a, t);
  for (const key of ['u', 'l', 'r']) ok(!!k[key] === !!e[key], `a=${(a / D).toFixed(0)} t=${(t / D).toFixed(0)} ${key}=${k[key]}`);
  ok(!k.d, 'never reverses'); ok(!(k.l && k.r), 'not both l and r');
}
// Closed loop: from many start angles to many stick angles in open space, the tank must end up facing the stick,
// drive, and never flip-flop between l and r once settled.
for (let a0 = -180; a0 < 180; a0 += 15) for (let tg = -180; tg < 180; tg += 20) {
  const t = { x: 0, y: 0, a: a0 * D }, target = tg * D; let flips = 0, prev = 0, settledAt = -1;
  for (let i = 0; i < 180; i++) {
    const k = TT.pointKeys(t.a, target), rot = (k.r ? 1 : 0) - (k.l ? 1 : 0);
    if (rot && prev && rot !== prev) flips++; if (rot) prev = rot;
    if (!rot && settledAt < 0) settledAt = i;
    TT.moveTank(t, rot, k.u ? 1 : 0, 1 / 60, []);
  }
  ok(Math.abs(TT.wrapA(t.a - target)) <= step + 1e-9, `settle ${a0}->${tg}: ${(TT.wrapA(t.a - target) / D).toFixed(2)}°`);
  ok(flips === 0, `jitter ${a0}->${tg}: ${flips} flips`);
  ok(settledAt >= 0 && settledAt <= Math.ceil(Math.PI / step) + 1, `slow ${a0}->${tg}`);
}
}
console.log(fail ? `${fail} FAILURES` : 'stick-unit: all passed'); process.exit(fail ? 1 : 0);
