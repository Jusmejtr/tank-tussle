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
// hold the stick toward screen direction (dx,dy) for ms; return my tank's angle (deg) + last keys
async function hold(p, cdp, dx, dy, ms, getA) {
  const [cx, cy, R] = await stickCenter(p);
  await touch(cdp, 'touchStart', [[cx, cy]]); await touch(cdp, 'touchMove', [[cx + dx * R * 0.9, cy + dy * R * 0.9]]);
  await sleep(ms); const a = await p.evaluate(getA); await touch(cdp, 'touchEnd', []); await sleep(100); return a;
}
const DIRS = [['up', 0, -1, -90], ['left', -1, 0, 180], ['down', 0, 1, 90], ['right', 1, 0, 0], ['up-right', 0.707, -0.707, -45]];
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
  const getA = () => { const t = __tt.game.tanks[1]; return { a: t.a * 180 / Math.PI, k: window.__in }; };
  for (const [n, dx, dy, want] of DIRS) {
    await p.evaluate(() => { const t = __tt.game.tanks[1]; t.a = 0.3; });
    const r = await hold(p, cdp, dx, dy, 1300, getA);
    ok(angDiff(r.a, want) < 4 && r.k.u && !r.k.l && !r.k.r, `${n}: tank faces ${r.a.toFixed(1)}° (want ${want}°), driving=${!!r.k.u}, turning=${!!(r.k.l || r.k.r)}`);
  }
  const k0 = await p.evaluate(() => window.__in); ok(!k0.u && !k0.l && !k0.r, 'released: no movement');
  // dead zone
  { const [cx, cy, R] = await stickCenter(p); await touch(cdp, 'touchStart', [[cx + R * 0.1, cy]]); await sleep(200);
    const k = await p.evaluate(() => window.__in); ok(!k.u && !k.l && !k.r, 'dead zone: no movement'); await touch(cdp, 'touchEnd', []); }
  // fire still works
  { const f = await p.$eval('.fire', e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await touch(cdp, 'touchStart', [f]); await sleep(80); const k = await p.evaluate(() => window.__in); await touch(cdp, 'touchEnd', []); ok(!!k.f, 'FIRE button fires'); }
  if (shot) {
    const [cx, cy, R] = await stickCenter(p); await touch(cdp, 'touchStart', [[cx, cy]]); await touch(cdp, 'touchMove', [[cx, cy - R * 0.9]]); await sleep(700);
    await p.screenshot({ path: shot }); await touch(cdp, 'touchEnd', []); console.log('  screenshot', shot);
  }
  // rotate the phone while the finger is down (no touchend arrives) -> stick must not stay stuck
  { const [cx, cy, R] = await stickCenter(p); await touch(cdp, 'touchStart', [[cx, cy]]); await touch(cdp, 'touchMove', [[cx + R * 0.9, cy]]); await sleep(200);
    await p.setViewport(vp.isLandscape ? PORT : LAND); await sleep(300);
    const k = await p.evaluate(() => window.__in); ok(!k.u && !k.l && !k.r, 'rotated mid-touch: stale touch cleared');
    await touch(cdp, 'touchCancel', []); await sleep(100);
    const nvp = vp.isLandscape ? PORT : LAND;
    await p.evaluate(() => { __tt.game.tanks[1].a = 0.3; });
    const r = await hold(p, cdp, 0, -1, 1300, getA);
    ok(angDiff(r.a, -90) < 4 && r.k.u, `after rotating to ${nvp.width}x${nvp.height}: up -> ${r.a.toFixed(1)}°`);
  }
  ok(!errs.length, 'no page errors ' + errs.join('; ')); await b.close();
}
async function onlineTest(vp, label) {
  console.log(`online ${label} ${vp.width}x${vp.height}`);
  const { b, p, cdp, errs } = await page(vp, BASE);
  await p.type('#name', 'Phone'); await p.click('#create');
  await p.waitForFunction(() => __tt.net && __tt.net.code, { timeout: 15000 }); await sleep(300); await p.click('#start');
  await p.waitForFunction(() => __tt.net.snaps.length > 10 && __tt.net.pb, { timeout: 15000 }); await sleep(500);
  const getA = () => { const n = __tt.net, s = n.snaps.at(-1).tanks.get(n.you), last = n.sent.at(-1).k; return { a: s.a * 180 / Math.PI, k: last, sent: n.sent.length }; };
  for (const [n, dx, dy, want] of DIRS.slice(0, 4)) {
    const r = await hold(p, cdp, dx, dy, 1500, getA);
    ok(angDiff(r.a, want) < 5 && r.k.u && !r.k.l && !r.k.r, `${n}: server tank ${r.a.toFixed(1)}° (want ${want}°), last sent keys ${JSON.stringify(r.k)}`);
  }
  // prediction and server agree once settled
  await sleep(500);
  const d = await p.evaluate(() => { const n = __tt.net, s = n.snaps.at(-1).tanks.get(n.you), q = n.pb; return Math.abs(s.a - q.a) * 180 / Math.PI; });
  ok(d < 1, `prediction base matches server angle (diff ${d.toFixed(2)}°)`);
  ok(!errs.length, 'no page errors ' + errs.join('; ')); await b.close();
}
(async () => {
  await localTest(PORT, 'portrait', '/workspace/tank-trouble/screenshot-phone-portrait.png');
  await localTest(LAND, 'landscape', '/workspace/tank-trouble/screenshot-phone.png');
  await onlineTest(PORT, 'portrait'); await onlineTest(LAND, 'landscape');
  console.log(fail ? `${fail} FAILURES` : 'joystick-headless: all passed'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
