// Menu / lobby / in-game layout at phone and desktop sizes: no sideways overflow, every visible button inside the viewport.
// BASE (optional) = a running server.js for the lobby check, e.g. http://localhost:8097
const puppeteer = require('puppeteer-core');
const FILE = 'file:///workspace/tank-trouble/tank-tussle.html', BASE = process.env.BASE || 'http://localhost:8097';
const SIZES = [[320, 640], [375, 667], [390, 844], [430, 932], [844, 390], [1280, 800]];
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('  FAIL ' + m); } else if (process.env.V) console.log('  ok   ' + m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// checks the overlay/panel content: scroll the overlay through its height so buttons below the fold are checked too
const check = (p, label) => p.evaluate(() => {
  const out = { sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, iw: innerWidth, bad: [] };
  const ov = [...document.querySelectorAll('.overlay')].find(o => !o.classList.contains('hidden'));
  if (ov) { out.ovSW = ov.scrollWidth; out.ovCW = ov.clientWidth; }
  for (const b of document.querySelectorAll('button, input, .joy, .fire')) {
    if (!b.offsetParent && getComputedStyle(b).position !== 'fixed') continue;
    const r = b.getBoundingClientRect(); if (!r.width) continue;
    // vertical: inside the overlay's scrollable content (we scroll), horizontal: inside the viewport
    if (r.left < -0.5 || r.right > innerWidth + 0.5) out.bad.push((b.id || b.textContent.trim().slice(0, 14) || b.className) + ` x ${Math.round(r.left)}..${Math.round(r.right)}`);
    if (!ov && (r.top < -0.5 || r.bottom > innerHeight + 0.5)) out.bad.push((b.id || b.className) + ` y ${Math.round(r.top)}..${Math.round(r.bottom)}`);
  }
  if (ov) { const pn = ov.querySelector('.panel').getBoundingClientRect(); out.panelTop = pn.top + ov.scrollTop; }
  return out;
});
function assertLayout(r, label) {
  ok(r.sw <= r.iw && r.bw <= r.iw, `${label}: page scrollWidth ${r.sw}/${r.bw} <= ${r.iw}`);
  if (r.ovSW != null) ok(r.ovSW <= r.ovCW, `${label}: overlay has no sideways scroll (${r.ovSW} <= ${r.ovCW})`);
  if (r.panelTop != null) ok(r.panelTop >= 0, `${label}: card top reachable (top ${Math.round(r.panelTop)})`);
  ok(!r.bad.length, `${label}: all buttons inside the viewport ${r.bad.join(', ')}`);
}
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  let server = true; try { await fetch(BASE + '/health'); } catch { server = false; console.log('(no server at ' + BASE + ': skipping lobby checks)'); }
  for (const [w, h] of SIZES) {
    const mobile = w < 900, vp = { width: w, height: h, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 3 : 1, isLandscape: w > h };
    console.log(`${w}x${h}`);
    const p = await b.newPage(); await p.setViewport(vp); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(FILE, { waitUntil: 'load' });
    assertLayout(await check(p), 'menu');
    await p.click('#modeSel button[data-m="teams"]'); await p.click('#nSel button[data-n="4"]'); for (let i = 0; i < 4; i++) await p.click('#botPlus');
    assertLayout(await check(p), 'menu, Teams + 4 players + 4 bots');
    if (w === 390 && h === 844) {
      await p.click('#nSel button[data-n="1"]'); await p.click('#botMinus'); await p.click('#botMinus'); await p.click('#modeSel button[data-m="ffa"]');
      await p.evaluate(() => document.querySelector('.overlay:not(.hidden)').scrollTop = 0);
      await p.screenshot({ path: '/workspace/tank-trouble/screenshot-menu-phone.png' });
      await p.click('#modeSel button[data-m="teams"]'); await p.screenshot({ path: '/workspace/tank-trouble/screenshot-menu-phone-teams.png' });
    }
    // in game (portrait strip / landscape sides)
    await p.evaluate(() => __tt.startLocal(1, 3, 'normal', true)); await sleep(400);
    assertLayout(await check(p), 'in-game');
    if (w === 390 && h === 844) await p.screenshot({ path: '/workspace/tank-trouble/screenshot-game-phone.png' });
    await p.evaluate(() => { __tt.paused = true; document.getElementById('menuBtn').click(); }); await sleep(100);
    assertLayout(await check(p), 'pause menu');
    if (server) {
      const q = await b.newPage(); await q.setViewport(vp); q.on('pageerror', e => errs.push(e.message));
      await q.goto(BASE, { waitUntil: 'load' }); await q.type('#name', 'Matej'); await q.click('#create');
      await q.waitForFunction(() => __tt.net && __tt.net.code); for (let i = 0; i < 7; i++) { await q.click('#lbPlus'); await sleep(80); }
      await q.click('#modeRow button[data-m="teams"]'); await sleep(300);
      assertLayout(await check(q), 'lobby, Teams + 7 bots');
      if (w === 390 && h === 844) await q.screenshot({ path: '/workspace/tank-trouble/screenshot-lobby-phone.png' });
      await q.close();
    }
    ok(!errs.length, 'no page errors ' + errs.join('; ')); await p.close();
  }
  await b.close(); console.log(fail ? `${fail} FAILURES` : 'responsive-headless: all passed'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
