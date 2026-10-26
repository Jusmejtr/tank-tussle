// Shared game logic for Tank Tussle (runs in the browser for local play and in Node on the server).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TT = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const C = {
    CELL: 64, WALL: 4, TANK_R: 13, BULLET_R: 3.2,
    BULLET_SPEED: 150, BULLET_LIFE: 10, MAX_BULLETS: 5,
    TANK_SPEED: 105, TANK_ROT: 3.4, ROUND_END_DELAY: 3,
    OWNER_GRACE: 0.05,
  };
  const COLORS = ['#d8342c', '#3fa33a', '#2f6fd6', '#e0a800'];
  const COLOR_NAMES = ['Red', 'Green', 'Blue', 'Yellow'];

  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));

  // ---------- Maze ----------
  // hw[r][c] = wall on the top edge of cell (c,r), r in 0..rows ; vw[r][c] = wall on the left edge, c in 0..cols
  function genMaze(cols, rows) {
    const hw = [], vw = [];
    for (let r = 0; r <= rows; r++) hw.push(new Array(cols).fill(1));
    for (let r = 0; r < rows; r++) vw.push(new Array(cols + 1).fill(1));
    const seen = rows && Array.from({ length: rows }, () => new Array(cols).fill(false));
    const stack = [[randi(0, cols - 1), randi(0, rows - 1)]];
    seen[stack[0][1]][stack[0][0]] = true;
    while (stack.length) {
      const [c, r] = stack[stack.length - 1];
      const nb = [];
      if (c > 0 && !seen[r][c - 1]) nb.push([c - 1, r, 'L']);
      if (c < cols - 1 && !seen[r][c + 1]) nb.push([c + 1, r, 'R']);
      if (r > 0 && !seen[r - 1][c]) nb.push([c, r - 1, 'U']);
      if (r < rows - 1 && !seen[r + 1][c]) nb.push([c, r + 1, 'D']);
      if (!nb.length) { stack.pop(); continue; }
      const [nc, nr, d] = nb[randi(0, nb.length - 1)];
      if (d === 'L') vw[r][c] = 0; else if (d === 'R') vw[r][c + 1] = 0;
      else if (d === 'U') hw[r][c] = 0; else hw[r + 1][c] = 0;
      seen[nr][nc] = true; stack.push([nc, nr]);
    }
    // Knock out only a small fraction (~6-12%) of the remaining interior walls for a few loops.
    // Starting from a perfect (fully connected) maze, removing walls can never isolate a cell.
    const interior = [];
    for (let r = 1; r < rows; r++) for (let c = 0; c < cols; c++) if (hw[r][c]) interior.push(['h', r, c]);
    for (let r = 0; r < rows; r++) for (let c = 1; c < cols; c++) if (vw[r][c]) interior.push(['v', r, c]);
    const extra = Math.round(interior.length * rand(0.06, 0.12));
    for (let i = 0; i < extra && interior.length; i++) {
      const [k, r, c] = interior.splice(randi(0, interior.length - 1), 1)[0];
      if (k === 'h') hw[r][c] = 0; else vw[r][c] = 0;
    }
    return { cols, rows, hw, vw };
  }

  // Merge wall edges into axis-aligned rectangles {x,y,w,h}
  function mazeRects(m) {
    const { CELL, WALL } = C, h = WALL / 2, rects = [];
    for (let r = 0; r <= m.rows; r++) {
      let c = 0;
      while (c < m.cols) {
        if (!m.hw[r][c]) { c++; continue; }
        let e = c; while (e < m.cols && m.hw[r][e]) e++;
        rects.push({ x: c * CELL - h, y: r * CELL - h, w: (e - c) * CELL + WALL, h: WALL });
        c = e;
      }
    }
    for (let c = 0; c <= m.cols; c++) {
      let r = 0;
      while (r < m.rows) {
        if (!m.vw[r][c]) { r++; continue; }
        let e = r; while (e < m.rows && m.vw[e][c]) e++;
        rects.push({ x: c * CELL - h, y: r * CELL - h, w: WALL, h: (e - r) * CELL + WALL });
        r = e;
      }
    }
    return rects;
  }

  // ---------- Collision helpers ----------
  function circleHitsRect(x, y, r, q) {
    const nx = Math.max(q.x, Math.min(x, q.x + q.w)), ny = Math.max(q.y, Math.min(y, q.y + q.h));
    const dx = x - nx, dy = y - ny;
    return dx * dx + dy * dy < r * r;
  }
  function pushCircleOut(o, r, rects) {
    for (let it = 0; it < 4; it++) {
      let moved = false;
      for (const q of rects) {
        const nx = Math.max(q.x, Math.min(o.x, q.x + q.w)), ny = Math.max(q.y, Math.min(o.y, q.y + q.h));
        let dx = o.x - nx, dy = o.y - ny; const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        if (d2 > 1e-9) { const d = Math.sqrt(d2), p = r - d; o.x += dx / d * p; o.y += dy / d * p; }
        else { // centre inside rect: push along smallest axis
          const l = o.x - q.x, rr = q.x + q.w - o.x, t = o.y - q.y, b = q.y + q.h - o.y, mn = Math.min(l, rr, t, b);
          if (mn === l) o.x = q.x - r; else if (mn === rr) o.x = q.x + q.w + r; else if (mn === t) o.y = q.y - r; else o.y = q.y + q.h + r;
        }
        moved = true;
      }
      if (!moved) break;
    }
  }

  // ---------- Game ----------
  function createGame() {
    return { players: [], tanks: {}, bullets: [], nextBulletId: 1, round: 0, phase: 'play', endTimer: 0, time: 0, maze: null, rects: [], events: [] };
  }
  function addPlayer(g, p) {
    const used = new Set(g.players.map(q => q.color));
    let ci = p.colorIndex;
    if (ci == null || used.has(ci)) { ci = 0; while (used.has(ci)) ci++; }
    const pl = { id: p.id, name: p.name || COLOR_NAMES[ci], color: ci, score: 0 };
    g.players.push(pl);
    return pl;
  }
  function removePlayer(g, id) {
    g.players = g.players.filter(p => p.id !== id);
    delete g.tanks[id];
  }
  function mazeSizeFor(n) {
    return n <= 2 ? [randi(5, 8), randi(4, 6)] : n === 3 ? [randi(7, 9), randi(5, 7)] : [randi(8, 10), randi(6, 7)];
  }
  function newRound(g) {
    const n = Math.max(1, g.players.length);
    const [cols, rows] = mazeSizeFor(n);
    g.maze = genMaze(cols, rows);
    g.rects = mazeRects(g.maze);
    g.bullets = []; g.tanks = {}; g.round++; g.phase = 'play'; g.endTimer = 0;
    // spread spawns: greedily take the candidate cell farthest from those already chosen
    const chosen = [];
    for (const p of g.players) {
      let best = null, bestD = -1;
      for (let k = 0; k < 40; k++) {
        const c = randi(0, cols - 1), r = randi(0, rows - 1);
        if (chosen.some(q => q[0] === c && q[1] === r)) continue;
        const d = chosen.length ? Math.min(...chosen.map(q => Math.abs(q[0] - c) + Math.abs(q[1] - r))) + Math.random() * 0.5 : Math.random();
        if (d > bestD) { bestD = d; best = [c, r]; }
      }
      if (!best) best = [0, 0];
      chosen.push(best);
      g.tanks[p.id] = {
        id: p.id, x: (best[0] + 0.5) * C.CELL, y: (best[1] + 0.5) * C.CELL,
        a: randi(0, 3) * Math.PI / 2 + rand(-0.3, 0.3), alive: true, fireHeld: false,
      };
    }
    g.events.push({ type: 'round', round: g.round });
  }

  function moveBullet(b, dist, rects) {
    const steps = Math.max(1, Math.ceil(dist / 1.5)), sp = Math.hypot(b.vx, b.vy) || 1, f = dist / sp / steps;
    let bounced = false;
    for (let s = 0; s < steps; s++) {
      b.x += b.vx * f;
      if (rects.some(q => circleHitsRect(b.x, b.y, C.BULLET_R, q))) { b.x -= b.vx * f; b.vx = -b.vx; bounced = true; }
      b.y += b.vy * f;
      if (rects.some(q => circleHitsRect(b.x, b.y, C.BULLET_R, q))) { b.y -= b.vy * f; b.vy = -b.vy; bounced = true; }
    }
    return bounced;
  }

  function fire(g, t) {
    const own = g.bullets.reduce((n, b) => n + (b.owner === t.id ? 1 : 0), 0);
    if (own >= C.MAX_BULLETS) return;
    const b = { id: g.nextBulletId++, owner: t.id, x: t.x, y: t.y, vx: Math.cos(t.a) * C.BULLET_SPEED, vy: Math.sin(t.a) * C.BULLET_SPEED, age: 0 };
    moveBullet(b, C.TANK_R + C.BULLET_R + 3, g.rects); // emerge from the barrel (may bounce straight back — like the original)
    g.bullets.push(b);
    g.events.push({ type: 'fire', id: t.id });
  }

  // inputs: { [playerId]: {u,d,l,r,f} }
  function step(g, inputs, dt) {
    g.time += dt;
    const tanks = Object.values(g.tanks);
    for (const t of tanks) {
      if (!t.alive) continue;
      const k = inputs[t.id] || {};
      let rot = (k.r ? 1 : 0) - (k.l ? 1 : 0), mv = (k.u ? 1 : 0) - (k.d ? 1 : 0);
      t.a += rot * C.TANK_ROT * dt;
      if (t.a > Math.PI) t.a -= 2 * Math.PI; else if (t.a < -Math.PI) t.a += 2 * Math.PI;
      const sp = mv > 0 ? C.TANK_SPEED : C.TANK_SPEED * 0.7;
      t.x += Math.cos(t.a) * mv * sp * dt; t.y += Math.sin(t.a) * mv * sp * dt;
      pushCircleOut(t, C.TANK_R, g.rects);
      if (k.f && !t.fireHeld) fire(g, t);
      t.fireHeld = !!k.f;
    }
    // tank vs tank
    for (let i = 0; i < tanks.length; i++) for (let j = i + 1; j < tanks.length; j++) {
      const a = tanks[i], b = tanks[j]; if (!a.alive || !b.alive) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = 2 * C.TANK_R;
      if (d < m && d > 1e-6) { const p = (m - d) / 2; a.x -= dx / d * p; a.y -= dy / d * p; b.x += dx / d * p; b.y += dy / d * p; pushCircleOut(a, C.TANK_R, g.rects); pushCircleOut(b, C.TANK_R, g.rects); }
    }
    // bullets
    const keep = [];
    for (const b of g.bullets) {
      b.age += dt;
      if (b.age > C.BULLET_LIFE) continue;
      if (moveBullet(b, C.BULLET_SPEED * dt, g.rects)) g.events.push({ type: 'bounce' });
      let hit = false;
      for (const t of tanks) {
        if (!t.alive) continue;
        if (t.id === b.owner && b.age < C.OWNER_GRACE) continue;
        const dx = t.x - b.x, dy = t.y - b.y, r = C.TANK_R + C.BULLET_R - 1;
        if (dx * dx + dy * dy < r * r) {
          t.alive = false; hit = true;
          g.events.push({ type: 'die', id: t.id, x: t.x, y: t.y, by: b.owner });
          break;
        }
      }
      if (!hit) keep.push(b);
    }
    g.bullets = keep;
    // round flow
    const alive = tanks.filter(t => t.alive);
    if (g.phase === 'play') {
      const over = g.players.length >= 2 ? alive.length <= 1 : alive.length === 0;
      if (over && tanks.length) { g.phase = 'ending'; g.endTimer = C.ROUND_END_DELAY; }
    } else if (g.phase === 'ending') {
      g.endTimer -= dt;
      if (g.endTimer <= 0) {
        const still = Object.values(g.tanks).filter(t => t.alive);
        if (still.length === 1 && g.players.length >= 2) {
          const p = g.players.find(p => p.id === still[0].id); if (p) { p.score++; g.events.push({ type: 'point', id: p.id }); }
        }
        newRound(g);
      }
    }
  }

  const r1 = v => Math.round(v * 10) / 10;
  function snapshot(g) {
    return {
      t: 's', time: Math.round(g.time * 1000), round: g.round, phase: g.phase,
      tk: Object.values(g.tanks).map(t => [t.id, r1(t.x), r1(t.y), Math.round(t.a * 1000) / 1000, t.alive ? 1 : 0]),
      b: g.bullets.map(b => [b.id, r1(b.x), r1(b.y)]),
      sc: g.players.map(p => [p.id, p.score]),
    };
  }

  return { C, COLORS, COLOR_NAMES, genMaze, mazeRects, createGame, addPlayer, removePlayer, newRound, step, snapshot };
});
