const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://localhost:8090';
const SECS = +process.env.SECS || 120;
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const errs = [];
  const mk = async (label) => { const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] }); const p = await b.newPage(); await p.setViewport({ width: 1100, height: 720 });
    p.on('pageerror', e => errs.push(label + ' pageerror: ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(label + ' console: ' + m.text())); return { b, p }; };
  const H = await mk('host'), G = await mk('guest');
  const h = H.p, g = G.p;
  const watch = p => p.evaluate(() => { window.__o = { weapons: {}, causes: {}, events: {}, rounds: new Set(), maxTanks: 0 };
    const ws0 = WebSocket.prototype; const orig = ws0.addEventListener;
    setInterval(() => { const n = __tt.net; if (!n || !n.snaps.length) return; const s = n.snaps.at(-1); __o.rounds.add(n.round); __o.maxTanks = Math.max(__o.maxTanks, s.tanks.size);
      for (const t of s.tanks.values()) if (t.weapon) __o.weapons[t.weapon] = 1; for (const e of n.pendingEv) { __o.events[e.type] = (__o.events[e.type] || 0) + 1; if (e.type === 'die') __o.causes[e.cause] = (__o.causes[e.cause] || 0) + 1; } }, 30); });
  await h.goto(BASE, { waitUntil: 'load' }); await watch(h);
  await h.type('#name', 'Matej'); await h.click('#create');
  await h.waitForFunction(() => __tt.net && __tt.net.code, { timeout: 20000 });
  const link = await h.$eval('#link', e => e.value);
  console.log('share link:', link);
  await g.goto(link, { waitUntil: 'load' }); await watch(g);
  await g.type('#name', 'Friend'); await g.click('#join');
  await h.waitForFunction(() => __tt.net.players.length === 2, { timeout: 20000 });
  for (let i = 0; i < 3; i++) { await h.click('#lbPlus'); await sleep(150); }
  await h.click('#lvlRow button[data-l="hard"]'); await sleep(300);
  await h.screenshot({ path: '/workspace/tank-trouble/screenshot-online-lobby.png' });
  await h.click('#start');
  await g.waitForFunction(() => __tt.net.snaps.length > 10, { timeout: 20000 });
  // humans wander + shoot
  const keys = ['ArrowUp', 'ArrowLeft', 'ArrowRight', 'Space'];
  let reconnectDone = false, syncChecks = [];
  for (let t = 0; t < SECS; t += 1) {
    for (const p of [h, g]) { const k = keys[Math.floor(Math.random() * keys.length)]; await p.keyboard.down(k); setTimeout(() => p.keyboard.up(k).catch(() => {}), 300 + Math.random() * 500); }
    await sleep(1000);
    if (t % 15 === 5) { // sync check: same snapshot time on both clients
      const a = await h.evaluate(() => { const s = __tt.net.snaps.at(-5); return s && { time: s.time, tk: [...s.tanks.values()].map(t => [t.id, t.x, t.y]) }; });
      const b = await g.evaluate(time => { const s = __tt.net.snaps.find(s => s.time === time); return s && { time: s.time, tk: [...s.tanks.values()].map(t => [t.id, t.x, t.y]) }; }, a && a.time);
      syncChecks.push(a && b ? JSON.stringify(a.tk) === JSON.stringify(b.tk) : 'n/a');
    }
    if (!reconnectDone && t === 40) { // drop the guest's socket, it should rejoin its slot
      const before = await g.evaluate(() => __tt.net.you);
      await g.evaluate(() => __tt.net.ws.close());
      await sleep(4000);
      const after = await g.evaluate(() => ({ you: __tt.net && __tt.net.you, open: __tt.net && __tt.net.ws.readyState === 1, mode: document.getElementById('menu').classList.contains('hidden') }));
      console.log('reconnect: before id', before, 'after', JSON.stringify(after)); reconnectDone = true;
    }
    if (t === 60) await g.screenshot({ path: '/workspace/tank-trouble/screenshot-online.png' });
  }
  const res = async p => p.evaluate(() => ({ evTypes: Object.keys(__o.events), rounds: __o.rounds.size, maxTanks: __o.maxTanks, weaponsSeen: Object.keys(__o.weapons), killCauses: __o.causes, scores: __tt.net.players.map(p => p.name + ':' + p.score).join(' ') }));
  console.log('host ', JSON.stringify(await res(h)));
  console.log('guest', JSON.stringify(await res(g)));
  console.log('sync checks (identical tank positions for same server tick):', syncChecks.join(','));
  // leave handling
  await g.evaluate(() => document.getElementById('quit').click());
  await sleep(800);
  console.log('after guest quit, host sees players:', await h.evaluate(() => __tt.net.players.map(p => p.name).join(',')));
  console.log('ERRORS', errs.length ? errs : 'none');
  await H.b.close(); await G.b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
