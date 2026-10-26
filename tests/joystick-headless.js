// Headless phone test: real touch events on the on-screen stick, portrait + landscape, local + online,
// plus rotating the phone mid-touch. BASE = a running server.js (for online), e.g. http://localhost:8097
const puppeteer = require('puppeteer-core');
const FILE = 'file:///workspace/tank-trouble/tank-tussle.html', BASE = process.env.BASE || 'http://localhost:8097';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const D = 180 / Math.PI, angDiff = (a, b) => { let d = a - b; while (d > 180) d -= 360; while (d < -180) d += 360; return Math.abs(d); };
let fail = 0; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fail++; };
const PORT = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const LAND = { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2, isLandscape: true };
async function touch(cdp, type, pts) { await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) }); }
async function stickCenter(p) { return p.$eval('.joy', e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width / 2]; }); }
// hold the stick toward screen direction (dx,dy) for ms; return getA() while still held
async function hold(p, cdp, dx, dy, ms, getA) {
  const [cx, cy, R] = await stickCenter(p);
  await touch(cdp, 'touchStart', [[cx, cy]]); await touch(cdp, 'touchMove', [[cx + dx * R * 0.9, cy + dy * R * 0.9]]);
  await sleep(ms); const a = await p.evaluate(getA); await touch(cdp, 'touchEnd', []); await sleep(100); return a;
}
// tank-relative stick: [name, dx, dy, expected keys, expected motion: +1 forward / -1 back / 0 none, turn: -1 left / +1 right / 0]
const DIRS = [['up', 0, -1, 'u', 1, 0], ['down', 0, 1, 'd', -1, 0], ['left', -1, 0, 'l', 0, -1], ['right', 1, 0, 'r', 0, 1],
  ['up-left', -0.707, -0.707, 'ul', 1, -1], ['down-right', 0.707, 0.707, 'dr', -1, 1]];
const K = k => (k.u ? 'u' : '') + (k.d ? 'd' : '') + (k.l ? 'l' : '') + (k.r ? 'r' : '');
// start state -> end state: distance moved along the starting heading, and the turn (deg)
const motion = (s0, s1) => ({ fwd: (s1.x - s0.x) * Math.cos(s0.a) + (s1.y - s0.y) * Math.sin(s0.a), turn: (d => (d > Math.PI ? d - 2 * Math.PI : d < -Math.PI ? d + 2 * Math.PI : d))(s1.a - s0.a) * D });
const expect = (m, mv, tn) => (mv > 0 ? m.fwd > 8 : mv < 0 ? m.fwd < -8 : Math.abs(m.fwd) < 1) && (tn > 0 ? m.turn > 10 : tn < 0 ? m.turn < -10 : Math.abs(m.turn) < 0.5);
async function page(vp, url) {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); await p.setViewport(vp); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url, { waitUntil: 'load' }); return { b, p, cdp: await p.target().createCDPSession(), errs };
}
async function localTest(vp, label, shot) {
  console.log(`local ${label} ${vp.width}x${vp.height}`);
  const { b, p, cdp, errs } = await page(vp, FILE);
  await p.evaluate(() => { TTBots.think = () => ({ u: 0, d: 0, l: 0, r: 0, f: 0 }); __tt.startLocal(1, 1); __tt.game.crateTimer = 1e9;
    const st = TT.step; TT.step = (g, i, dt) => { window.__in = i[1]; st(g, i, dt); }; });
  await sleep(400);
  ok(await p.$eval('#padL', e => !e.classList.contains('hidden')), 'stick visible');
  const getS = () => { const t = __tt.game.tanks[1]; return { x: t.x, y: t.y, a: t.a, k: window.__in }; };
  // open floor (no walls) so movement is never blocked; try several headings so "up" is checked whatever way the tank faces
  const place = a => p.evaluate(a => { const g = __tt.game; g.rects = []; Object.assign(g.tanks[1], { x: 300, y: 300, a }); g.tanks[2].x = 5000; return { x: 300, y: 300, a }; }, a);
  for (const a0 of [0.3, 2.2, -1.9]) for (const [n, dx, dy, keys, mv, tn] of DIRS) {
    const s0 = await place(a0), s1 = await hold(p, cdp, dx, dy, 500, getS), m = motion(s0, s1);
    ok(K(s1.k) === keys && expect(m, mv, tn), `facing ${(a0 * D).toFixed(0)}°, stick ${n}: keys ${K(s1.k)} (want ${keys}), moved ${m.fwd.toFixed(1)}px along heading, turned ${m.turn.toFixed(1)}°`);
  }
  const k0 = await p.evaluate(() => window.__in); ok(!k0.u && !k0.l && !k0.r, 'released: no movement');
  // dead zone
  { const [cx, cy, R] = await stickCenter(p); await touch(cdp, 'touchStart', [[cx + R * 0.1, cy]]); await sleep(200);
    const k = await p.evaluate(() => window.__in); ok(!k.u && !k.l && !k.r, 'dead zone: no movement'); await touch(cdp, 'touchEnd', []); }
  // fire still works
  { const f = await p.$eval('.fire', e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await touch(cdp, 'touchStart', [f]); await sleep(80); const k = await p.evaluate(() => window.__in); await touch(cdp, 'touchEnd', []); ok(!!k.f, 'FIRE button fires'); }
  await p.evaluate(() => { const g = __tt.game; TT.newRound(g); g.crateTimer = 1e9; g.bullets.length = 0; }); // that shot may have hit the bot and ended the round: start clean
  if (shot) {
    const [cx, cy, R] = await stickCenter(p); await touch(cdp, 'touchStart', [[cx, cy]]); await touch(cdp, 'touchMove', [[cx, cy - R * 0.9]]); await sleep(700);
    await p.screenshot({ path: shot }); await touch(cdp, 'touchEnd', []); console.log('  screenshot', shot);
  }
  // rotate the phone while the finger is down (no touchend arrives) -> stick must not stay stuck
  { const [cx, cy, R] = await stickCenter(p); await touch(cdp, 'touchStart', [[cx, cy]]); await touch(cdp, 'touchMove', [[cx + R * 0.9, cy]]); await sleep(400);
    await p.setViewport(vp.isLandscape ? PORT : LAND); await sleep(300);
    const k = await p.evaluate(() => window.__in); ok(!k.u && !k.l && !k.r, 'rotated mid-touch: stale touch cleared');
    await touch(cdp, 'touchCancel', []); await sleep(100);
    const nvp = vp.isLandscape ? PORT : LAND;
    const s0 = await place(1.0), s1 = await hold(p, cdp, 0, -1, 500, getS), m = motion(s0, s1);
    ok(K(s1.k) === 'u' && expect(m, 1, 0), `after rotating to ${nvp.width}x${nvp.height}: up drives forward (${m.fwd.toFixed(1)}px)`);
  }
  ok(!errs.length, 'no page errors ' + errs.join('; ')); await b.close();
}
async function onlineTest(vp, label) {
  console.log(`online ${label} ${vp.width}x${vp.height}`);
  const { b, p, cdp, errs } = await page(vp, BASE);
  await p.evaluate(() => document.querySelector('.tabs button[data-tab="online"]').click()); // phones show one tab at a time
  await p.type('#name', 'Phone'); await p.click('#create');
  await p.waitForFunction(() => __tt.net && __tt.net.code, { timeout: 15000 }); await sleep(300); await p.click('#start');
  await p.waitForFunction(() => __tt.net.snaps.length > 10 && __tt.net.pb, { timeout: 15000 }); await sleep(500);
  // server's view of my tank + the keys last sent. Online there are walls, so a blocked move only has to not go the wrong way.
  const getS = () => { const n = __tt.net, t = n.snaps.at(-1).tanks.get(n.you); return { x: t.x, y: t.y, a: t.a, k: n.sent.at(-1).k }; };
  let moved = { 1: 0, '-1': 0 };
  for (const [n, dx, dy, keys, mv, tn] of DIRS) {
    const s0 = await p.evaluate(getS), [cx, cy, R] = await stickCenter(p);
    await touch(cdp, 'touchStart', [[cx, cy]]); await touch(cdp, 'touchMove', [[cx + dx * R * 0.9, cy + dy * R * 0.9]]); await sleep(450);
    const k = (await p.evaluate(getS)).k; await touch(cdp, 'touchEnd', []); await sleep(350);
    const m = motion(s0, await p.evaluate(getS));
    const dirOk = mv > 0 ? m.fwd > -1 : mv < 0 ? m.fwd < 1 : Math.abs(m.fwd) < 1, turnOk = tn > 0 ? m.turn > 10 : tn < 0 ? m.turn < -10 : Math.abs(m.turn) < 0.5;
    if (mv && Math.abs(m.fwd) > 4) moved[mv]++;
    ok(K(k) === keys && dirOk && turnOk, `stick ${n}: sent ${K(k)} (want ${keys}), server tank moved ${m.fwd.toFixed(1)}px along heading, turned ${m.turn.toFixed(1)}°`);
  }
  ok(moved[1] > 0 && moved['-1'] > 0, `server really drove forward (${moved[1]}x) and reversed (${moved['-1']}x)`);
  // prediction and server agree once settled
  await sleep(500);
  const d = await p.evaluate(() => { const n = __tt.net, s = n.snaps.at(-1).tanks.get(n.you), q = n.pb; return { a: Math.abs(s.a - q.a) * 180 / Math.PI, p: Math.hypot(s.x - q.x, s.y - q.y) }; });
  ok(d.a < 1 && d.p < 1, `prediction base matches the server (angle ${d.a.toFixed(2)}°, position ${d.p.toFixed(2)}px)`);
  ok(!errs.length, 'no page errors ' + errs.join('; ')); await b.close();
}
// ---- 'Point' stick mode + REVERSE button ----
async function pointTest(vp, label, shot) {
  console.log(`point mode ${label} ${vp.width}x${vp.height}`);
  const { b, p, cdp, errs } = await page(vp, FILE);
  // choose it on the start screen like a player would (saved in localStorage)
  await p.click('#nSel button[data-n="1"]'); await p.click('#stickSel button[data-s="point"]');
  ok(await p.evaluate(() => localStorage.getItem('tt-stick')) === '["point","tank"]', 'start screen saves Point for P1');
  await p.reload({ waitUntil: 'load' });
  ok(await p.$eval('#stickSel button[data-s="point"]', e => e.classList.contains('sel')), 'choice remembered after reload');
  await p.evaluate(() => { TTBots.think = () => ({}); __tt.startLocal(1, 1); __tt.game.crateTimer = 1e9; const st = TT.step; TT.step = (g, i, dt) => { window.__in = i[1]; st(g, i, dt); }; });
  await sleep(300);
  ok(await p.$$eval('.fire.rev', e => e.length) === 1, 'REVERSE button shown next to FIRE');
  const getS = () => { const t = __tt.game.tanks[1]; return { x: t.x, y: t.y, a: t.a, k: window.__in }; };
  const place = a => p.evaluate(a => { const g = __tt.game; g.rects = []; g.bullets.length = 0; Object.assign(g.tanks[1], { x: 300, y: 300, a, alive: true }); g.tanks[2].x = 5000; return { x: 300, y: 300, a }; }, a);
  for (const [n, dx, dy, want] of [['up', 0, -1, -90], ['left', -1, 0, 180], ['down', 0, 1, 90], ['up-right', 0.707, -0.707, -45]]) {
    await place(0.3); const s1 = await hold(p, cdp, dx, dy, 1300, getS), deg = s1.a * D;
    ok(angDiff(deg, want) < 4 && K(s1.k) === 'u', `stick ${n}: tank turns to ${deg.toFixed(1)}° (want ${want}°) and drives (keys ${K(s1.k)})`);
  }
  // REVERSE held + stick pointing right: backs up while turning to face right
  { const s0 = await place(-Math.PI / 2), [cx, cy, R] = await stickCenter(p);
    const rv = await p.$eval('.fire.rev', e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await touch(cdp, 'touchStart', [[cx, cy], rv]); await touch(cdp, 'touchMove', [[cx + R * 0.9, cy], rv]); await sleep(1300);
    const s1 = await p.evaluate(getS); await touch(cdp, 'touchEnd', []); await sleep(100);
    const back = (s1.x - s0.x) * Math.cos(s1.a) + (s1.y - s0.y) * Math.sin(s1.a);
    ok(angDiff(s1.a * D, 0) < 4 && s1.k.d && !s1.k.u && back < -20, `REVERSE + stick right: faces ${(s1.a * D).toFixed(1)}°, reversing (${back.toFixed(0)}px), keys ${K(s1.k)}`);
    // REVERSE alone (stick centred) = straight back
    await place(0); await touch(cdp, 'touchStart', [rv]); await sleep(400); const s2 = await p.evaluate(getS); await touch(cdp, 'touchEnd', []);
    ok(K(s2.k) === 'd' && s2.x < 300 - 10, `REVERSE alone backs straight up (${(s2.x - 300).toFixed(0)}px)`);
  }
  if (shot) { await p.evaluate(() => { const g = __tt.game; TT.newRound(g); g.crateTimer = 1e9; });
    const [cx, cy, R] = await stickCenter(p), rv = await p.$eval('.fire.rev', e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await touch(cdp, 'touchStart', [[cx, cy], rv]); await touch(cdp, 'touchMove', [[cx - R * 0.6, cy - R * 0.6], rv]); await sleep(600);
    await p.screenshot({ path: shot }); await touch(cdp, 'touchEnd', []); console.log('  screenshot', shot); }
  ok(!errs.length, 'no page errors ' + errs.join('; ')); await b.close();
}
// ---- 2 humans on one phone: each stick drives its own tank, screen-up = forward for both, multi-touch ----
async function twoTest(vp, label, shot) {
  console.log(`2 players ${label} ${vp.width}x${vp.height}`);
  const { b, p, cdp, errs } = await page(vp, FILE);
  await p.evaluate(() => localStorage.setItem('tt-stick', '["tank","point"]')); await p.reload({ waitUntil: 'load' });
  await p.evaluate(() => { __tt.startLocal(2, 0); __tt.game.crateTimer = 1e9; const st = TT.step; TT.step = (g, i, dt) => { window.__in = JSON.parse(JSON.stringify(i)); st(g, i, dt); }; });
  await sleep(300);
  const joys = await p.$$eval('.joy', es => es.map(e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width / 2]; }));
  const revs = await p.$$eval('.pad', ps => ps.map(x => x.querySelectorAll('.fire.rev').length));
  ok(joys.length === 2 && joys[0][0] < vp.width / 2 && joys[1][0] > vp.width / 2, 'Red stick on the left, Green on the right');
  ok(revs.join() === '0,1', 'per-player modes: REVERSE only for P2 (Point)');
  // every control fully on screen and not overlapping the other player's
  const rects = await p.$$eval('.joy, .fire', es => es.map(e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }));
  const overlap = rects.some((a, i) => rects.some((c, j) => j > i && a[0] < c[2] && c[0] < a[2] && a[1] < c[3] && c[1] < a[3]));
  ok(rects.every(r => r[0] >= 0 && r[1] >= 0 && r[2] <= vp.width && r[3] <= vp.height) && !overlap, 'all sticks/buttons on screen, none overlapping');
  // P1 (tank mode): up = forward for P1 only
  await p.evaluate(() => localStorage.setItem('tt-stick', '["tank","tank"]'));
  const [c1, c2] = joys;
  await touch(cdp, 'touchStart', [[c1[0], c1[1]]]); await touch(cdp, 'touchMove', [[c1[0], c1[1] - c1[2] * 0.9]]); await sleep(200);
  let k = await p.evaluate(() => __in); ok(K(k[1]) === 'u' && K(k[2]) === '', `P1 stick up -> P1 forward only (${K(k[1])} / ${K(k[2])})`);
  await touch(cdp, 'touchEnd', []); await sleep(100);
  // both at once: P1 down (reverse), P2 points up -> P2 turns to face up and drives
  await p.evaluate(() => { const g = __tt.game; g.rects = []; Object.assign(g.tanks[1], { x: 200, y: 300, a: 0 }); Object.assign(g.tanks[2], { x: 500, y: 300, a: 0 }); });
  await touch(cdp, 'touchStart', [[c1[0], c1[1]], [c2[0], c2[1]]]); await touch(cdp, 'touchMove', [[c1[0], c1[1] + c1[2] * 0.9], [c2[0], c2[1] - c2[2] * 0.9]]); await sleep(1200);
  k = await p.evaluate(() => __in); const a2 = await p.evaluate(() => __tt.game.tanks[2].a * 180 / Math.PI), x1 = await p.evaluate(() => __tt.game.tanks[1].x);
  ok(K(k[1]) === 'd' && x1 < 200 - 20, `two fingers: P1 stick down reverses (${(x1 - 200).toFixed(0)}px)`);
  ok(K(k[2]) === 'u' && angDiff(a2, -90) < 4, `two fingers: P2 (Point) stick up turns to face up (${a2.toFixed(1)}°) and drives`);
  if (shot) { await p.evaluate(() => { const g = __tt.game; TT.newRound(g); g.crateTimer = 1e9; }); await sleep(500); await p.screenshot({ path: shot }); console.log('  screenshot', shot); }
  await touch(cdp, 'touchEnd', []);
  ok(!errs.length, 'no page errors ' + errs.join('; ')); await b.close();
}
(async () => {
  await twoTest(PORT, 'portrait', '/workspace/tank-trouble/screenshot-2p-portrait.png'); await twoTest(LAND, 'landscape', '/workspace/tank-trouble/screenshot-2p-landscape.png');
  await pointTest(PORT, 'portrait', '/workspace/tank-trouble/screenshot-point-reverse.png'); await pointTest(LAND, 'landscape');
  await localTest(PORT, 'portrait', '/workspace/tank-trouble/screenshot-phone-portrait.png');
  await localTest(LAND, 'landscape', '/workspace/tank-trouble/screenshot-phone.png');
  await onlineTest(PORT, 'portrait'); await onlineTest(LAND, 'landscape');
  console.log(fail ? `${fail} FAILURES` : 'joystick-headless: all passed'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
