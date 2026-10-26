// Team mode in the browser: local menu (mode switch + tap-to-switch team), a local team match + screenshot,
// and online: host picks Teams in the lobby, a guest switches team, the server enforces it. BASE = temp server.
const puppeteer = require('puppeteer-core');
const FILE = 'file:///workspace/tank-trouble/tank-tussle.html', BASE = process.env.BASE || 'http://localhost:8097';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fail++; };
const launch = () => puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
(async () => {
  const errs = [];
  { console.log('local');
    const b = await launch(), p = await b.newPage(); await p.setViewport({ width: 1100, height: 760 }); p.on('pageerror', e => errs.push(e.message));
    await p.goto(FILE, { waitUntil: 'load' });
    await p.click('#nSel button[data-n="2"]'); for (let i = 0; i < 4; i++) await p.click('#botPlus');
    await p.click('#modeSel button[data-m="teams"]');
    const badges = () => p.$$eval('#teamPick button.team', bs => bs.map(b => b.textContent.trim()));
    const before = await badges(); ok(before.length === 6 && before.filter(x => /Red/.test(x)).length === 3, 'menu shows 6 team badges, 3 v 3: ' + before.join(' | '));
    await p.click('#teamPick button.team[data-i="1"]'); const after = await badges(); ok(/Red/.test(after[1]) && /Blue/.test(before[1]), 'tapping P2\'s badge moves it to Red');
    await p.click('#teamPick button.team[data-i="1"]');
    await p.screenshot({ path: '/workspace/tank-trouble/screenshot-teams-menu.png' });
    await p.click('#playLocal'); await sleep(300);
    const st = await p.evaluate(() => ({ mode: __tt.game.mode, teams: __tt.game.players.map(p => p.team).join('') }));
    ok(st.mode === 'teams' && st.teams === '010101', 'local game started in Teams with the menu\'s teams: ' + st.teams);
    // let bots play (humans idle) until a team point is scored, then screenshot mid-round
    await p.evaluate(() => { __tt.game.teamScore = [0, 0]; });
    let ts; for (let i = 0; i < 90; i++) { await sleep(1000); ts = await p.evaluate(() => __tt.game.teamScore.slice()); if (ts[0] + ts[1] >= 1 && i > 6) break; }
    ok(ts[0] + ts[1] >= 1, 'a team scored in a local match: ' + ts);
    await p.evaluate(() => { const g = __tt.game; TT.newRound(g); for (const w of ['gatling', 'laser', 'missile']) TT.spawnCrate(g, w); });
    await sleep(1500); await p.screenshot({ path: '/workspace/tank-trouble/screenshot-teams.png' }); console.log('  screenshot /workspace/tank-trouble/screenshot-teams.png');
    await b.close(); }
  { console.log('online');
    const H = await launch(), G = await launch(), h = await H.newPage(), g = await G.newPage();
    for (const [p, n] of [[h, 'host'], [g, 'guest']]) { await p.setViewport({ width: 1100, height: 720 }); p.on('pageerror', e => errs.push(n + ': ' + e.message)); }
    await h.goto(BASE, { waitUntil: 'load' }); await h.type('#name', 'Matej'); await h.click('#create');
    await h.waitForFunction(() => __tt.net && __tt.net.code); const link = await h.$eval('#link', e => e.value);
    await g.goto(link, { waitUntil: 'load' }); await g.type('#name', 'Peter'); await g.click('#join');
    await h.waitForFunction(() => __tt.net.players.length === 2);
    for (let i = 0; i < 2; i++) { await h.click('#lbPlus'); await sleep(150); }
    ok(await g.$eval('#modeRow button[data-m="teams"]', b => b.disabled), 'guest cannot change the mode');
    await g.evaluate(() => __tt.net.send({ t: 'setMode', mode: 'teams' })); await sleep(300);
    ok(await h.evaluate(() => __tt.net.mode) === 'ffa', 'server ignores a mode change from a guest');
    await h.click('#modeRow button[data-m="teams"]'); await g.waitForFunction(() => __tt.net.mode === 'teams');
    const teams = () => h.evaluate(() => __tt.net.players.map(p => p.name + ':' + p.team).join(' '));
    const t0 = await teams(); ok(t0 === 'Matej:0 Peter:1 Bot 1:0 Bot 2:1', 'auto-balanced humans then bots: ' + t0);
    await g.click('#switchTeam'); await sleep(300); const t1 = await teams(); ok(/Peter:0/.test(t1), 'guest switched own team: ' + t1);
    await g.evaluate(id => __tt.net.send({ t: 'setTeam', id }), (await h.evaluate(() => __tt.net.players.find(p => p.name === 'Bot 1').id))); await sleep(300);
    ok(await teams() === t1, 'guest cannot move a bot');
    await h.click('#plist [data-team-id]:not([data-team-id="' + (await h.evaluate(() => __tt.net.you)) + '"])'); await sleep(300); // host taps Peter's badge
    const t2 = await teams(); ok(/Peter:1/.test(t2), 'host moved Peter back: ' + t2);
    await h.screenshot({ path: '/workspace/tank-trouble/screenshot-teams-lobby.png' });
    await h.click('#start'); await g.waitForFunction(() => __tt.net.snaps.length > 10 && __tt.net.pb, { timeout: 15000 });
    const sn = await g.evaluate(() => ({ mode: __tt.net.mode, teams: __tt.net.players.map(p => p.team).join('') }));
    ok(sn.mode === 'teams' && sn.teams === '0101', 'snapshots carry mode + teams: ' + JSON.stringify(sn));
    // prediction still works: hold up, own tank moves immediately and matches the server afterwards
    const a0 = await g.evaluate(() => { const n = __tt.net, s = n.snaps.at(-1).tanks.get(n.you); return [s.x, s.y]; });
    await g.keyboard.down('ArrowUp'); await sleep(700); await g.keyboard.up('ArrowUp'); await sleep(600);
    const a1 = await g.evaluate(() => { const n = __tt.net, s = n.snaps.at(-1).tanks.get(n.you), q = n.pb; return { x: s.x, y: s.y, d: Math.hypot(s.x - q.x, s.y - q.y) }; });
    ok(Math.hypot(a1.x - a0[0], a1.y - a0[1]) > 5 && a1.d < 1, `prediction: moved ${Math.hypot(a1.x - a0[0], a1.y - a0[1]).toFixed(1)}px, prediction vs server ${a1.d.toFixed(2)}px`);
    ok(await g.evaluate(() => __tt.net.send({ t: 'setTeam' }) || 1) && (await sleep(300), (await teams()) === t2), 'no team switching mid-game');
    // kill both humans so the bots decide it; wait for a team point
    let ts = [0, 0]; for (let i = 0; i < 90 && ts[0] + ts[1] < 1; i++) { await sleep(1000); ts = await g.evaluate(() => __tt.net.teamScore || [0, 0]); }
    ok(ts[0] + ts[1] >= 1, 'online: server awarded a team point: ' + ts);
    await g.screenshot({ path: '/workspace/tank-trouble/screenshot-teams-online.png' });
    await H.close(); await G.close(); }
  ok(!errs.length, 'no page errors ' + errs.join('; '));
  console.log(fail ? `${fail} FAILURES` : 'teams-headless: all passed'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
