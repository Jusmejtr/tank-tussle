// Emoji reactions in the browser + 8-player online rooms. BASE = a running server.js on a temp port, e.g.
//   PORT=8097 npm start  &&  BASE=http://localhost:8097 node tests/reactions-headless.js
// Local: keyboard keys per player, cooldown, reacting while dead, phone picker (fits, no scroll, doesn't cover the controls).
// Online: 8 players (browser pages + raw sockets), 9th refused, Teams 4 v 4, server validates (list + cooldown) and broadcasts.
const puppeteer = require('puppeteer-core'), WebSocket = require('ws');
const FILE = 'file:///workspace/tank-trouble/tank-tussle.html', BASE = process.env.BASE || 'http://localhost:8097', OUT = '/workspace/tank-trouble/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fail++; };
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const LAND = { width: 844, height: 390, isMobile: true, hasTouch: true, isLandscape: true, deviceScaleFactor: 2 };
const bub = (p, id) => p.evaluate(id => { const b = __tt.bubbles.get(id); return b ? b.r : null; }, id);
const tapEl = async (p, sel) => { const r = await p.$eval(sel, e => { const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }); await p.touchscreen.tap(r[0], r[1]); };
const rect = (p, sel) => p.$$eval(sel, es => es.filter(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed').map(e => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; }));
const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
(async () => {
  const B = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = [];
  { console.log('local keyboard');
    const p = await B.newPage(); await p.setViewport({ width: 1100, height: 760 }); p.on('pageerror', e => errs.push(e.message));
    await p.goto(FILE, { waitUntil: 'load' }); await p.click('#nSel button[data-n="2"]'); await p.click('#playLocal'); await sleep(200);
    await p.keyboard.press('Digit1'); ok(await bub(p, 1) === 0, 'P1 key 1 -> 😂 over P1');
    await p.keyboard.press('Digit2'); ok(await bub(p, 1) === 0, 'P1 key 2 straight after is ignored (cooldown)');
    await p.keyboard.press('Digit8'); ok(await bub(p, 2) === 1, 'P2 key 8 -> 😡 over P2 (own cooldown)');
    await p.evaluate(() => { __tt.game.tanks[1].alive = false; }); await sleep(1600);
    await p.keyboard.press('Digit3'); ok(await bub(p, 1) === 2, 'dead P1 can still react (😭 over the score)');
    await sleep(2100); ok(await bub(p, 1) === null, 'bubble gone after ~2 s');
    ok(await p.$$eval('.react', e => e.length) === 0, 'desktop local: no on-screen reaction button (keys only)');
    await p.close(); }
  for (const vp of [PHONE, LAND]) { const tag = vp.isLandscape ? 'landscape' : 'portrait';
    console.log('phone 2 players ' + tag);
    const p = await B.newPage(); await p.setViewport(vp); p.on('pageerror', e => errs.push(e.message));
    await p.goto(FILE, { waitUntil: 'load' }); await tapEl(p, '#nSel button[data-n="2"]'); await tapEl(p, '#playLocal'); await sleep(300);
    ok(await p.$$eval('.react', e => e.length) === 2, 'one 😀 button per player');
    await tapEl(p, '.react.left .rbtn'); await sleep(100);
    ok(await p.$eval('.react.left .rpick', e => !e.classList.contains('hidden')), 'P1 picker opens');
    const pk = (await rect(p, '.react.left .rpick'))[0], ctl = [...await rect(p, '.joy'), ...await rect(p, '.fire'), ...await rect(p, '#menuBtn')];
    ok(pk.x >= 0 && pk.y >= 0 && pk.x + pk.w <= vp.width && pk.y + pk.h <= vp.height, 'picker fully on screen');
    ok(!ctl.some(c => hit(c, pk)), 'picker does not cover stick / FIRE / menu');
    const rb = [...await rect(p, '.react .rbtn')]; ok(!rb.some(r => ctl.some(c => hit(c, r))), '😀 buttons do not overlap the controls');
    ok(await p.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight + 1 && document.scrollingElement.scrollWidth <= innerWidth + 1), 'still no scroll');
    if (!vp.isLandscape) await p.screenshot({ path: OUT + 'screenshot-reactions-picker.png' });
    await tapEl(p, '.react.left .rpick button[data-r="0"]'); await sleep(50);
    ok(await bub(p, 1) === 0 && await p.$eval('.react.left .rpick', e => e.classList.contains('hidden')), 'tap 😂 -> bubble over P1, picker closes');
    ok(await p.$eval('.react.left .rbtn', e => e.classList.contains('cool')), 'button dims during the cooldown');
    await tapEl(p, '.react.right .rbtn'); await tapEl(p, '.react.right .rpick button[data-r="3"]'); ok(await bub(p, 2) === 3, 'P2 picker -> 😎 over P2');
    await p.evaluate(() => { __tt.game.tanks[2].alive = false; }); await sleep(1600);
    await tapEl(p, '.react.right .rbtn'); await tapEl(p, '.react.right .rpick button[data-r="4"]'); ok(await bub(p, 2) === 4, 'dead P2 reacts from the picker (💀 over the score)');
    await sleep(300); await p.screenshot({ path: OUT + `screenshot-reactions-${tag}.png` }); console.log('  screenshot ' + OUT + `screenshot-reactions-${tag}.png`);
    await p.close(); }
  { console.log('online 8 players');
    const H = await B.newPage(); await H.setViewport(PHONE); H.on('pageerror', e => errs.push('host: ' + e.message));
    await H.goto(BASE, { waitUntil: 'load' }); await tapEl(H, '.tabs button[data-tab="online"]'); await H.$eval('#name', e => (e.value = '')); await H.type('#name', 'Matej'); await tapEl(H, '#create');
    await H.waitForFunction(() => __tt.net && __tt.net.code); const code = await H.evaluate(() => __tt.net.code), link = await H.$eval('#link', e => e.value);
    const guests = [];
    for (let i = 0; i < 3; i++) { const g = await B.newPage(); await g.setViewport({ width: 1100, height: 720 }); g.on('pageerror', e => errs.push('guest: ' + e.message));
      await g.goto(link, { waitUntil: 'load' }); await g.$eval('#name', e => (e.value = '')); await g.type('#name', ['Peter', 'Jana', 'Tomas'][i]); await g.click('#join'); await g.waitForFunction(() => __tt.net && __tt.net.you); guests.push(g); }
    const raw = [];
    const sock = name => new Promise(res => { const ws = new WebSocket(BASE.replace(/^http/, 'ws') + '/ws'); ws.msgs = []; ws.on('message', d => { const m = JSON.parse(d); ws.msgs.push(m); if (m.t === 'joined') ws.you = m.you; if (m.t === 'joined' || m.t === 'error') res(ws); }); ws.on('open', () => ws.send(JSON.stringify({ t: 'join', code, name }))); });
    for (const n of ['Eva', 'Juro', 'Ivo', 'Lea']) raw.push(await sock(n));
    await sleep(300);
    ok(await H.evaluate(() => __tt.net.players.length) === 8, '8 players in the room');
    ok(new Set(await H.evaluate(() => __tt.net.players.map(p => p.color))).size === 8, '8 distinct colours');
    const ninth = await sock('Nine'); ok(ninth.msgs.some(m => m.t === 'error' && /full/i.test(m.msg)), '9th player refused: room full'); ninth.close();
    await H.screenshot({ path: OUT + 'screenshot-lobby-8.png' }); console.log('  screenshot ' + OUT + 'screenshot-lobby-8.png');
    ok(await H.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight + 1), 'phone lobby with 8 players: no scroll');
    const fits = await H.evaluate(() => { const b = document.querySelector('#lobby .panel').getBoundingClientRect(); return b.bottom <= innerHeight + 1 && b.right <= innerWidth + 1 && b.left >= -1; }); ok(fits, 'phone lobby panel fits the screen');
    await H.evaluate(() => __tt.net.send({ t: 'setMode', mode: 'teams' })); await sleep(300);
    const teams = await H.evaluate(() => [0, 1].map(t => __tt.net.players.filter(p => p.team === t).length).join(' v ')); ok(teams === '4 v 4', 'Teams auto-balance 8 players: ' + teams);
    await H.bringToFront(); await H.evaluate(() => __tt.net.send({ t: 'start' })); await H.waitForFunction(() => __tt.net.snaps.length > 5, { timeout: 8000, polling: 200 }).catch(async e => { console.log(await H.evaluate(() => JSON.stringify([__tt.net.started, __tt.net.round, __tt.net.snaps.length, !!__tt.net.maze, __tt.net.host, __tt.net.you]))); throw e; }); await sleep(500);
    const tk = await H.evaluate(() => { const s = __tt.net.snaps[__tt.net.snaps.length - 1]; return [...s.tanks.values()].map(t => [t.x, t.y]); });
    ok(tk.length === 8, '8 tanks in the round'); let ov = 0; for (let i = 0; i < tk.length; i++) for (let j = i + 1; j < tk.length; j++) if (Math.hypot(tk[i][0] - tk[j][0], tk[i][1] - tk[j][1]) < 30) ov++; ok(ov === 0, 'no overlapping spawns');
    // reactions: a guest presses 2 (😡) -> everyone sees it; spam within the cooldown and bad ids are dropped by the server
    const gid = await guests[0].evaluate(() => __tt.net.you); await guests[0].bringToFront(); await guests[0].keyboard.press('Digit2'); await sleep(400);
    ok(await bub(H, gid) === 1 && await bub(guests[2], gid) === 1, 'guest key 2 -> 😡 bubble on every screen');
    const reacts = ws => ws.msgs.filter(m => m.t === 'react');
    ok(reacts(raw[0]).some(m => m.id === gid && m.r === 1), 'raw socket got the broadcast');
    const n0 = reacts(raw[1]).length;
    raw[0].send(JSON.stringify({ t: 'react', r: 0 })); raw[0].send(JSON.stringify({ t: 'react', r: 5 })); raw[0].send(JSON.stringify({ t: 'react', r: 99 })); raw[3].send(JSON.stringify({ t: 'react', r: 'x' }));
    await sleep(400); const got = reacts(raw[1]).slice(n0);
    ok(got.length === 1 && got[0].id === raw[0].you && got[0].r === 0, 'server: spam within 1.5 s and invalid ids dropped (' + JSON.stringify(got) + ')');
    await sleep(1600); raw[0].send(JSON.stringify({ t: 'react', r: 5 })); await sleep(300); ok(reacts(raw[1]).slice(n0).length === 2, 'accepted again after the cooldown');
    // host (phone) reacts via picker while dead-or-alive, then screenshot of the 8-player game
    await H.bringToFront(); await tapEl(H, '.react.right .rbtn'); await tapEl(H, '.react.right .rpick button[data-r="0"]'); await sleep(300);
    const hid = await H.evaluate(() => __tt.net.you); ok(await bub(guests[1], hid) === 0, 'host picker 😂 seen by guests');
    raw[2].send(JSON.stringify({ t: 'react', r: 3 })); await sleep(250);
    await H.screenshot({ path: OUT + 'screenshot-online-8-phone.png' }); console.log('  screenshot ' + OUT + 'screenshot-online-8-phone.png');
    const hud = await H.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight + 1); ok(hud, 'phone game with 8: no scroll');
    await guests[2].bringToFront(); await guests[2].evaluate(id => __tt.net.send({ t: 'react', r: 4 }), 0); await sleep(250);
    await guests[2].screenshot({ path: OUT + 'screenshot-online-8.png' }); console.log('  screenshot ' + OUT + 'screenshot-online-8.png');
    raw.forEach(w => w.close()); }
  ok(!errs.length, 'no page errors ' + (errs.length ? JSON.stringify(errs) : ''));
  await B.close();
  console.log(fail ? `${fail} FAILED` : 'all passed'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
