const puppeteer = require('puppeteer-core');
const URL = 'file:///workspace/tank-trouble/tank-tussle.html';
const SECS = +process.env.SECS || 150;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function run(label, humans, bots, shots) {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = []; const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 });
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(URL, { waitUntil: 'load' });
  if (shots) {
    await p.click('#nSel button[data-n="1"]'); for (let i = 0; i < 3; i++) await p.click('#botPlus'); await p.click('#lvlSel button[data-l="hard"]');
    await p.screenshot({ path: '/workspace/tank-trouble/screenshot-menu.png' });
  }
  await p.evaluate((h, n) => {
    window.__st = { kill: 0, self: 0, pickup: 0, die: 0, causes: {}, rounds: 0 };
    const st = TT.step; TT.step = (g, i, dt) => { st(g, i, dt); for (const e of g.events) {
      if (e.type === 'die') { __st.die++; e.by === e.id ? __st.self++ : __st.kill++; __st.causes[e.cause] = (__st.causes[e.cause] || 0) + 1; }
      if (e.type === 'pickup') __st.pickup++; if (e.type === 'round') __st.rounds++; } };
    __tt.startLocal(h, n, 'normal');
  }, humans, bots);
  let shot = false;
  for (let t = 0; t < SECS; t += 5) {
    await sleep(5000);
    if (shots && !shot && t >= 20) {
      // make sure some turrets show: hand out weapons to a few bots for the screenshot
      await p.evaluate(() => { const ts = Object.values(__tt.game.tanks).filter(t => t.alive); ['laser', 'gatling', 'frag', 'missile', 'mine', 'deathray'].forEach((w, i) => ts[i] && !ts[i].weapon && TT.giveWeapon(ts[i], w)); });
      await sleep(250); await p.screenshot({ path: '/workspace/tank-trouble/screenshot-bots.png' }); shot = true;
    }
  }
  const st = await p.evaluate(() => Object.assign({}, __st, { scores: __tt.game.players.map(p => p.name + ':' + p.score).join(' '), maze: __tt.game.maze.cols + 'x' + __tt.game.maze.rows, tanks: __tt.game.players.length }));
  console.log(label, JSON.stringify(st), 'ERRORS', errs.length ? errs : 'none');
  await b.close();
}
(async () => {
  await Promise.all([run('1human+7bots', 1, 7, false), run('8bots', 0, 8, true)]);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
