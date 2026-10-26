// Unit test: direction stick -> l/r/u keys, and a closed-loop check that the tank turns to the stick and settles.
const TT = require('../public/game.js');
const D = Math.PI / 180, step = TT.C.TANK_ROT / 60;
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };
const cases = [ // [tank angle, stick angle, expected]
  [0, 0, { u: 1, l: 0, r: 0 }], [0, 30 * D, { u: 1, r: 1 }], [0, -30 * D, { u: 1, l: 1 }],
  [0, 90 * D, { u: 0, r: 1 }], [0, -90 * D, { u: 0, l: 1 }], [0, 179 * D, { u: 0, r: 1 }], [0, -179 * D, { u: 0, l: 1 }],
  [170 * D, -170 * D, { u: 1, r: 1 }],   // wraps across ±180: short way is +20°
  [-170 * D, 170 * D, { u: 1, l: 1 }],
  [-90 * D, -90 * D + step * 0.9, { u: 1, l: 0, r: 0 }], // within one frame step: no rotation (no jitter)
  [0, 45 * D, { u: 0, r: 1 }],           // beyond 40°: pivot first
];
for (const [a, t, e] of cases) {
  const k = TT.stickKeys(a, t);
  for (const key of ['u', 'l', 'r']) ok(!!k[key] === !!e[key], `a=${(a / D).toFixed(0)} t=${(t / D).toFixed(0)} ${key}=${k[key]}`);
  ok(!k.d, 'never reverses'); ok(!(k.l && k.r), 'not both l and r');
}
// Closed loop: from many start angles to many stick angles in open space, the tank must end up facing the stick,
// drive, and never flip-flop between l and r once settled.
for (let a0 = -180; a0 < 180; a0 += 15) for (let tg = -180; tg < 180; tg += 20) {
  const t = { x: 0, y: 0, a: a0 * D }, target = tg * D; let flips = 0, prev = 0, settledAt = -1;
  for (let i = 0; i < 180; i++) {
    const k = TT.stickKeys(t.a, target), rot = (k.r ? 1 : 0) - (k.l ? 1 : 0);
    if (rot && prev && rot !== prev) flips++; if (rot) prev = rot;
    if (!rot && settledAt < 0) settledAt = i;
    TT.moveTank(t, rot, k.u ? 1 : 0, 1 / 60, []);
  }
  ok(Math.abs(TT.wrapA(t.a - target)) <= step + 1e-9, `settle ${a0}->${tg}: ${(TT.wrapA(t.a - target) / D).toFixed(2)}°`);
  ok(flips === 0, `jitter ${a0}->${tg}: ${flips} flips`);
  ok(settledAt >= 0 && settledAt <= Math.ceil(Math.PI / step) + 1, `slow ${a0}->${tg}`);
}
// Screen convention: pushing the stick up (dy<0) gives -90°, and driving that way decreases y (up on screen).
const t = { x: 0, y: 0, a: -Math.PI / 2 }; TT.moveTank(t, 0, 1, 1, []); ok(t.y < -50 && Math.abs(t.x) < 1e-6, 'up is up');
console.log(fail ? `${fail} FAILURES` : 'stick-unit: all passed'); process.exit(fail ? 1 : 0);
