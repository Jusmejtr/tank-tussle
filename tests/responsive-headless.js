// No scrolling anywhere: menu (both tabs), lobby, game, pause at phone/desktop sizes. Asserts the page and every
// overlay fit (scrollHeight/scrollWidth <= viewport) and every visible button is inside the viewport and tappable
// (elementFromPoint at its centre hits it). BASE (optional) = running server.js for the lobby, e.g. http://localhost:8097
const puppeteer = require('puppeteer-core');
const FILE = 'file:///workspace/tank-trouble/tank-tussle.html', BASE = process.env.BASE || 'http://localhost:8097';
const SIZES = [[320, 568], [375, 667], [390, 844], [430, 932], [844, 390], [667, 375], [1280, 800]];
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('  FAIL ' + m); } else if (process.env.V) console.log('  ok   ' + m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const check = p => p.evaluate(() => {
  const de = document.documentElement, out = { sh: Math.max(de.scrollHeight, document.body.scrollHeight), sw: Math.max(de.scrollWidth, document.body.scrollWidth), iw: innerWidth, ih: innerHeight, bad: [], n: 0, ov: [] };
  for (const o of document.querySelectorAll('.overlay:not(.hidden)')) out.ov.push([o.id, o.scrollHeight, o.clientHeight, o.scrollWidth, o.clientWidth, o.querySelector('.panel').style.transform || '']);
  const top = [...document.querySelectorAll('.overlay:not(.hidden)')].pop(); // with a menu open, only its controls count
  for (const b of (top || document).querySelectorAll('button, input, .joy, .fire')) {
    const st = getComputedStyle(b); if (st.display === 'none' || st.visibility === 'hidden' || !b.getClientRects().length) continue;
    if (b.closest('.hidden')) continue;
    const r = b.getBoundingClientRect(); if (!r.width || !r.height) continue; out.n++;
    const name = b.id || b.dataset.n || b.dataset.m || b.dataset.l || b.dataset.s || b.textContent.trim().slice(0, 12) || b.className;
    if (r.left < -0.5 || r.top < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5) { out.bad.push(`${name} outside ${Math.round(r.left)},${Math.round(r.top)}..${Math.round(r.right)},${Math.round(r.bottom)}`); continue; }
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!hit || !(hit === b || b.contains(hit))) out.bad.push(`${name} covered by ${hit && (hit.id || hit.className || hit.tagName)}`);
    if (r.height < 22) out.bad.push(`${name} too small (${Math.round(r.height)}px)`);
  }
  return out;
});
function assertLayout(r, label) {
  ok(r.sh <= r.ih && r.sw <= r.iw, `${label}: page ${r.sw}x${r.sh} fits ${r.iw}x${r.ih}`);
  for (const [id, sh, ch, sw, cw] of r.ov) ok(sh <= ch + 1 && sw <= cw + 1, `${label}: #${id} doesn't scroll (${sw}x${sh} in ${cw}x${ch})`);
  ok(!r.bad.length, `${label}: ${r.n} controls visible + tappable ${r.bad.join(', ')}`);
  if (process.env.V) console.log('     scale', r.ov.map(o => o[5]).join(' '));
}
async function bothTabs(p, label) {
  assertLayout(await check(p), label);
  if (await p.$eval('.tabs', e => getComputedStyle(e).display !== 'none')) {
    await p.click('.tabs button[data-tab="online"]'); await sleep(80); assertLayout(await check(p), label + ' [Online tab]');
    await p.click('.tabs button[data-tab="local"]'); await sleep(80);
  }
}
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  let server = true; try { await fetch(BASE + '/health'); } catch { server = false; console.log('(no server at ' + BASE + ': skipping lobby checks)'); }
  for (const [w, h] of SIZES) {
    const mobile = w < 900, vp = { width: w, height: h, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 3 : 1, isLandscape: w > h };
    console.log(`${w}x${h}`);
    const p = await b.newPage(); await p.setViewport(vp); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(FILE, { waitUntil: 'load' }); await sleep(150);
    await bothTabs(p, 'menu');
    await p.click('#modeSel button[data-m="teams"]'); await p.click('#nSel button[data-n="4"]'); for (let i = 0; i < 4; i++) await p.click('#botPlus'); await sleep(80);
    await bothTabs(p, 'menu, Teams + 4 players + 4 bots');
    if (w === 390 && h === 844) {
      await p.click('#nSel button[data-n="1"]'); await p.click('#botMinus'); await p.click('#botMinus'); await p.click('#modeSel button[data-m="ffa"]'); await sleep(100);
      await p.screenshot({ path: '/workspace/tank-trouble/screenshot-menu-phone.png' });
      await p.click('#nSel button[data-n="2"]'); await p.click('#modeSel button[data-m="teams"]'); await sleep(100); await p.screenshot({ path: '/workspace/tank-trouble/screenshot-menu-phone-teams.png' });
    }
    if (w === 667) await p.screenshot({ path: '/workspace/tank-trouble/screenshot-menu-landscape.png' });
    for (const [n, bots] of [[1, 3], [2, 2]]) {
      await p.evaluate((n, bots) => __tt.startLocal(n, bots, 'normal', true), n, bots); await sleep(300);
      assertLayout(await check(p), `in-game ${n} human(s)`);
    }
    await p.evaluate(() => { document.getElementById('menuBtn').click(); }); await sleep(100);
    assertLayout(await check(p), 'pause menu');
    if (server) {
      const q = await b.newPage(); await q.setViewport(vp); q.on('pageerror', e => errs.push(e.message));
      await q.goto(BASE, { waitUntil: 'load' }); await q.evaluate(() => document.querySelector('.tabs button[data-tab="online"]').click());
      await q.type('#name', 'Matej'); await q.click('#create');
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
