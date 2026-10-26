const puppeteer = require('puppeteer-core');
const URL = 'file:///workspace/tank-trouble/tank-tussle.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = []; const p = await b.newPage(); await p.setViewport({ width: 1100, height: 760 });
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL, { waitUntil: 'load' });
  // gameplay shot: 4 tanks, each with a different weapon, crates, laser guide, bomb, missile, mine
  await p.evaluate(() => {
    __tt.startLocal(4); const g = __tt.game; g.crateTimer = 999;
    const ws = ['laser', 'gatling', 'deathray', 'missile'];
    Object.values(g.tanks).forEach((t, i) => TT.giveWeapon(t, ws[i]));
    for (const w of ['frag', 'mine', 'missile']) TT.spawnCrate(g, w);
  });
  await sleep(300);
  await p.keyboard.down('KeyU'); await sleep(60); await p.keyboard.up('KeyU');           // blue starts charging death ray
  await p.keyboard.down('KeyM'); await sleep(450);                                         // green sprays gatling
  await p.keyboard.up('KeyM');
  await p.screenshot({ path: '/workspace/tank-trouble/screenshot-weapons.png' });
  // close-up of all turret variants
  await p.evaluate(async () => {
    window.requestAnimationFrame = () => 0; await new Promise(r => setTimeout(r, 100));
    document.querySelectorAll('.overlay,#menuBtn,#msg').forEach(e => e.classList.add('hidden'));
    const c = __tt.ctx, dpr = devicePixelRatio || 1, cv = c.canvas;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = '#ececec'; c.fillRect(0, 0, cv.width, cv.height);
    const list = [null, 'gatling', 'laser', 'frag', 'deathray', 'missile', 'mine'];
    const names = ['Standard', 'Gatling', 'Laser', 'Frag bomb', 'Death ray', 'Homing missile', 'Mines'];
    const cols = ['#d8342c', '#3fa33a', '#2f6fd6', '#e0a800', '#d8342c', '#3fa33a', '#2f6fd6'];
    list.forEach((w, i) => {
      const x = 90 + (i % 4) * 250, y = 170 + Math.floor(i / 4) * 300;
      __tt.drawTank(x + 20, y, 0, cols[i], 5, w);
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = '#333'; c.font = 'bold 20px Verdana, sans-serif'; c.textAlign = 'center'; c.fillText(names[i], x + 30, y + 110);
    });
  });
  await p.screenshot({ path: '/workspace/tank-trouble/turrets.png' });
  console.log('ERRORS', errs.length ? errs : 'none'); await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
