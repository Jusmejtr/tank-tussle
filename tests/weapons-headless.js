const puppeteer = require('puppeteer-core');
const URL = 'file:///workspace/tank-trouble/tank-tussle.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = []; const p = await b.newPage(); await p.setViewport({ width: 1100, height: 760 });
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(URL, { waitUntil: 'load' });
  const results = {};
  for (const w of ['gatling', 'laser', 'frag', 'deathray', 'missile', 'mine']) {
    await p.evaluate(w => {
      __tt.startLocal(2); const g = __tt.game;
      g.maze = TT.genMaze(5, 1); g.maze.vw[0] = [1, 0, 0, 0, 0, 1]; g.rects = TT.mazeRects(g.maze); g.crateTimer = 999;
      Object.assign(g.tanks[1], { x: w === 'mine' ? 120 : 40, y: 32, a: 0 }); Object.assign(g.tanks[2], { x: 290, y: 32, a: Math.PI });
      TT.giveWeapon(g.tanks[1], w); window.__ev = [];
      const st = TT.step; if (!window.__wrapped) { window.__wrapped = 1; TT.step = (g, i, dt) => { st(g, i, dt); window.__ev.push(...g.events.filter(e => e.type !== 'bounce').map(e => e.type + (e.cause ? ':' + e.cause : ''))); }; }
    }, w);
    const tap = async () => { await p.keyboard.down('KeyQ'); await sleep(60); await p.keyboard.up('KeyQ'); };
    if (w === 'gatling') { await p.keyboard.down('KeyQ'); await sleep(1500); await p.keyboard.up('KeyQ'); }
    else if (w === 'frag') { await tap(); await sleep(700); await tap(); await sleep(800); }
    else if (w === 'deathray') { await tap(); await sleep(400); await p.screenshot({ path: '/tmp/ttest/charge.png' }); await sleep(900); await p.screenshot({ path: '/tmp/ttest/ray.png' }); }
    else if (w === 'missile') { await tap(); await sleep(3500); }
    else if (w === 'mine') { await tap(); await p.keyboard.down('KeyE'); await sleep(500); await p.keyboard.up('KeyE'); await sleep(1600); await p.evaluate(() => { const m = __tt.game.mines[0]; const t = __tt.game.tanks[2]; t.x = m.x + 40; }); await p.keyboard.down('ArrowUp'); await sleep(600); await p.keyboard.up('ArrowUp'); await sleep(200); }
    else { await tap(); await sleep(400); }
    if (w === 'laser') await p.screenshot({ path: '/tmp/ttest/laser.png' });
    results[w] = await p.evaluate(() => ({ enemyDead: !__tt.game.tanks[2].alive, shooterAlive: __tt.game.tanks[1].alive, weaponLeft: __tt.game.tanks[1].weapon, ev: [...new Set(window.__ev)].join(',') }));
  }
  console.log(JSON.stringify(results, null, 1));
  console.log('ERRORS', errs.length ? errs : 'none'); await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
