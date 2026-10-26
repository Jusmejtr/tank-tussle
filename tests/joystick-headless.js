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
(async () => {
  await localTest(PORT, 'portrait', '/workspace/tank-trouble/screenshot-phone-portrait.png');
  await localTest(LAND, 'landscape', '/workspace/tank-trouble/screenshot-phone.png');
  await onlineTest(PORT, 'portrait'); await onlineTest(LAND, 'landscape');
  console.log(fail ? `${fail} FAILURES` : 'joystick-headless: all passed'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
