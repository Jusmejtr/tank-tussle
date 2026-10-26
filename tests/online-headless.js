const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://localhost:8090';
const OUT = process.env.OUT || '/workspace/tank-trouble';
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const errs = [];
  const mk = async (w = 1100, h = 760) => { const p = await browser.newPage(); await p.setViewport({ width: w, height: h }); p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); }); return p; };
  // ---- local ----
  const a = await mk();
  await a.goto(BASE, { waitUntil: 'networkidle0' });
  await a.screenshot({ path: OUT + '/screenshot-menu.png' });
  if (!process.env.SKIP_LOCAL) {
    await a.click('#nSel button[data-n="4"]'); await a.click('#playLocal');
    const hold = async (keys, ms) => { for (const k of keys) await a.keyboard.down(k); await new Promise(r => setTimeout(r, ms)); for (const k of keys) await a.keyboard.up(k); };
    await hold(['KeyE', 'ArrowUp', 'KeyI'], 500);
    await hold(['KeyQ', 'KeyM', 'KeyU', 'Numpad0'], 60); await hold(['KeyF', 'ArrowLeft', 'Numpad8'], 250); await hold(['KeyM', 'KeyQ'], 60);
    await new Promise(r => setTimeout(r, 450));
    const st = await a.evaluate(() => { const g = __tt.game; return { round: g.round, players: g.players.length, bullets: g.bullets.length, tanks: Object.values(g.tanks).map(t => [Math.round(t.x), Math.round(t.y), t.alive]), maze: [g.maze.cols, g.maze.rows] }; });
    console.log('LOCAL', JSON.stringify(st)); console.log('shot..');
    await a.screenshot({ path: OUT + '/screenshot.png' }); for (let i = 0; i < 6; i++) { await hold(['KeyQ', 'KeyM', 'KeyU', 'Numpad0'], 60); await hold(['KeyF', 'ArrowLeft'], 150); } await new Promise(r => setTimeout(r, 4500)); console.log('LOCAL after', JSON.stringify(await a.evaluate(() => ({ round: __tt.game.round, scores: __tt.game.players.map(p => p.score) }))));
    // phone landscape touch layout
    const ph = await browser.newPage(); await ph.emulate({ viewport: { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile' });
    ph.on('pageerror', e => errs.push('phone pageerror: ' + e.message));
    console.log('phone..'); await ph.goto(BASE, { waitUntil: 'networkidle0' }); await ph.tap('#playLocal'); await new Promise(r => setTimeout(r, 2800));
    await ph.screenshot({ path: OUT + '/screenshot-phone.png' });
  }
  console.log('online..');
  if (!process.env.SKIP_ONLINE) {
    const b2 = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] }); const b3 = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
    const mk2 = async (br) => { const p = await br.newPage(); await p.setViewport({ width: 900, height: 650 }); p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); }); return p; };
    const h = await mk2(b2), g = await mk2(b3);
    await h.goto(BASE, { waitUntil: 'networkidle0' });
    console.log('h loaded'); await h.type('#name', 'Host'); console.log('typed'); await h.click('#create');
    await h.waitForFunction(() => __tt.net && __tt.net.code, { timeout: 15000 });
    const code = await h.evaluate(() => __tt.net.code);
    await g.goto(BASE + '/?room=' + code, { waitUntil: 'networkidle0' });
    console.log('g loaded', code); await g.type('#name', 'Guest'); await g.click('#join');
    await h.waitForFunction(() => __tt.net.players.length === 2, { timeout: 15000 });
    await h.screenshot({ path: OUT + '/screenshot-lobby.png' });
    console.log('lobby ok'); await h.click('#start');
    await g.waitForFunction(() => __tt.net.snaps.length > 5, { timeout: 15000 });
    const pos = p => p.evaluate(() => { const s = __tt.net.snaps.at(-1); return { round: __tt.net.round, tanks: [...s.tanks.values()].map(t => [t.id, Math.round(t.x), Math.round(t.y), +t.a.toFixed(2)]) }; });
    const before = await pos(g);
    // guest drives forward + turns, host fires
    await g.bringToFront(); await g.keyboard.down('ArrowUp'); await g.keyboard.down('ArrowRight');
    await h.keyboard.down('Space');
    await new Promise(r => setTimeout(r, 900));
    await g.keyboard.up('ArrowUp'); await g.keyboard.up('ArrowRight'); await h.keyboard.up('Space');
    await new Promise(r => setTimeout(r, 300));
    const afterG = await pos(g), afterH = await pos(h);
    const bulletsH = await h.evaluate(() => __tt.net.snaps.at(-1).bullets.size), bulletsG = await g.evaluate(() => __tt.net.snaps.at(-1).bullets.size);
    const rate = await g.evaluate(async () => { const n0 = __tt.net.snaps.length ? __tt.net.snaps.at(-1).time : 0; let c = 0; const f = () => c++; const ws = __tt.net.ws; ws.addEventListener('message', f); await new Promise(r => setTimeout(r, 2000)); ws.removeEventListener('message', f); return c / 2; });
    console.log('ONLINE code', code, '\n before(guest view)', JSON.stringify(before), '\n after guest view', JSON.stringify(afterG), '\n after host view ', JSON.stringify(afterH), '\n bullets host/guest', bulletsH, bulletsG, ' msgs/s', rate);
    await g.screenshot({ path: OUT + '/screenshot-online.png' }); await b2.close(); await b3.close();
  }
  console.log('ERRORS', errs.length ? errs : 'none');
  await browser.close(); if (!process.env.SKIP_ONLINE) { }
})().catch(e => { console.error('FAIL', e); process.exit(1); });
