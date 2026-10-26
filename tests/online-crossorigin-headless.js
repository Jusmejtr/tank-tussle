const puppeteer = require('puppeteer-core');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const errs = [];
  const mk = async l => { const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] }); const p = await b.newPage(); await p.setViewport({ width: 1000, height: 700 }); p.on('pageerror', e => errs.push(l + ': ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(l + ': ' + m.text())); return { b, p }; };
  const H = await mk('pages-host'), G = await mk('file-guest'), L = await mk('pages-local');
  // pin TT_SERVER_URL so config.js (docs/ sets it to '' unconditionally) can't clear it
  const useServer = p => p.evaluateOnNewDocument(() => { Object.defineProperty(window, 'TT_SERVER_URL', { get: () => 'http://localhost:8090', set() {}, configurable: true }); });
  await useServer(H.p); await useServer(G.p);
  // 1) "GitHub Pages" static client on another origin, server set via TT_SERVER_URL
  await H.p.goto('http://localhost:8092/', { waitUntil: 'load' });
  await H.p.type('#name', 'Host'); await H.p.click('#create');
  await H.p.waitForFunction(() => __tt.net && __tt.net.code, { timeout: 15000 });
  const link = await H.p.$eval('#link', e => e.value); console.log('share link from Pages client:', link);
  // 2) standalone file:// client joins
  await G.p.goto('file:///workspace/tank-trouble/tank-tussle.html', { waitUntil: 'load' });
  const code = await H.p.evaluate(() => __tt.net.code);
  await G.p.type('#name', 'FileGuest'); await G.p.type('#code', code); await G.p.click('#join');
  await H.p.waitForFunction(() => __tt.net.players.length === 2, { timeout: 15000 });
  await H.p.click('#lbPlus'); await sleep(200); await H.p.click('#start');
  await G.p.waitForFunction(() => __tt.net.snaps.length > 20, { timeout: 15000 });
  console.log('file guest snaps ok, players:', await G.p.evaluate(() => __tt.net.players.map(p => p.name).join(',')));
  // 3) share link opened fresh joins too
  const J = await mk('link-joiner'); await useServer(J.p); await J.p.goto(link, { waitUntil: 'load' }); await J.p.type('#name', 'Linker'); await J.p.click('#join');
  await J.p.waitForFunction(() => __tt.net && __tt.net.you, { timeout: 15000 }); console.log('joined via share link as', await J.p.evaluate(() => __tt.net.you));
  // 4) local mode on Pages copy, no server needed
  await L.p.goto('http://localhost:8092/', { waitUntil: 'load' }); await L.p.click('#nSel button[data-n="1"]'); await L.p.click('#botPlus'); await L.p.click('#playLocal'); await sleep(1500);
  console.log('pages local mode tanks:', await L.p.evaluate(() => Object.keys(__tt.game.tanks).length));
  await L.p.goto('http://localhost:8092/', { waitUntil: 'load' }); await L.p.type('#name', 'x'); await L.p.click('#create'); await sleep(300);
  console.log('pages w/o server, create says:', await L.p.$eval('#err', e => e.textContent));
  console.log('ERRORS', errs.length ? errs : 'none');
  for (const x of [H, G, L, J]) await x.b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
