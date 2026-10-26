'use strict';
(() => {
const { C, COLORS } = TT;
const $ = id => document.getElementById(id);
const cv = $('c'), ctx = cv.getContext('2d');
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

// ---------- key sets ----------
const LOCAL = [
  { name: 'Red',    keys: { u: 'KeyE', l: 'KeyS', d: 'KeyD', r: 'KeyF', f: 'KeyQ' }, label: ['E', 'S', 'D', 'F', 'Q'] },
  { name: 'Green',  keys: { u: 'ArrowUp', l: 'ArrowLeft', d: 'ArrowDown', r: 'ArrowRight', f: ['KeyM', 'Slash'] }, label: ['↑', '←', '↓', '→', 'M'] },
  { name: 'Blue',   keys: { u: 'KeyI', l: 'KeyJ', d: 'KeyK', r: 'KeyL', f: 'KeyU' }, label: ['I', 'J', 'K', 'L', 'U'] },
  { name: 'Yellow', keys: { u: 'Numpad8', l: 'Numpad4', d: 'Numpad5', r: 'Numpad6', f: 'Numpad0' }, label: ['Num8', 'Num4', 'Num5', 'Num6', 'Num0'] },
];
const ONLINE_KEYS = { u: ['ArrowUp', 'KeyW'], l: ['ArrowLeft', 'KeyA'], d: ['ArrowDown', 'KeyS'], r: ['ArrowRight', 'KeyD'], f: ['Space', 'KeyM', 'Enter'] };
const GAME_CODES = new Set([...LOCAL.map(s => Object.values(s.keys)), ...Object.values(ONLINE_KEYS)].flat(2));

const down = new Set(), tapped = new Set();
addEventListener('keydown', e => {
  if (e.code === 'Escape') { if (mode) togglePause(); return; }
  if (!mode || inOverlay()) return;
  if (GAME_CODES.has(e.code)) e.preventDefault();
  down.add(e.code); tapped.add(e.code); audioInit();
  if (mode === 'online' && net) onlineInput();
});
addEventListener('keyup', e => { down.delete(e.code); if (mode === 'online' && net) onlineInput(); });
addEventListener('blur', () => down.clear());
const pressed = c => Array.isArray(c) ? c.some(x => down.has(x) || tapped.has(x)) : (down.has(c) || tapped.has(c));
const readKeys = ks => ({ u: pressed(ks.u), d: pressed(ks.d), l: pressed(ks.l), r: pressed(ks.r), f: pressed(ks.f) });
const merge = (a, b) => ({ u: a.u || b.u, d: a.d || b.d, l: a.l || b.l, r: a.r || b.r, f: a.f || b.f });

// ---------- menu ----------
let nLocal = isTouch ? 1 : 2, nBots = isTouch ? 1 : 0, botLevel = 'normal';
const MAX_TANKS = 8;
function keysHtml(n) {
  return LOCAL.slice(0, n).map((s, i) => `<div><span class="dot" style="background:${COLORS[i]}"></span><b>P${i + 1} ${s.name}</b>: ${s.label.slice(0, 4).map(k => `<kbd>${k}</kbd>`).join('')} move · <kbd>${s.label[4]}</kbd> fire</div>`).join('')
    + (n >= 4 ? '<div class="muted">P4 needs a numeric keypad (Num Lock on or off both work).</div>' : '')
    + (nBots ? `<div><span class="dot" style="background:${COLORS[n]}"></span><b>${nBots} bot${nBots > 1 ? 's' : ''}</b> (${botLevel}) — colours ${COLOR_NAMES_FOR(n, nBots)}</div>` : '')
    + (n + nBots < 2 ? '<div class="err">Need at least 2 tanks — add a player or a bot.</div>' : '');
}
const COLOR_NAMES_FOR = (from, k) => TT.COLOR_NAMES.slice(from, from + k).join(', ');
function refreshMenu() {
  nBots = Math.max(0, Math.min(nBots, MAX_TANKS - nLocal));
  document.querySelectorAll('#nSel button[data-n]').forEach(b => b.classList.toggle('sel', +b.dataset.n === nLocal));
  document.querySelectorAll('#lvlSel button[data-l]').forEach(b => b.classList.toggle('sel', b.dataset.l === botLevel));
  $('botN').textContent = nBots;
  $('keysLocal').innerHTML = keysHtml(nLocal);
  $('playLocal').disabled = nLocal + nBots < 2;
  $('touchNote').textContent = isTouch ? 'On a phone/tablet: P1 (Red) gets a stick + FIRE; with 2 humans Red uses the left side, Green the right.' : '';
}
document.querySelectorAll('#nSel button[data-n]').forEach(b => b.onclick = () => { nLocal = +b.dataset.n; refreshMenu(); });
document.querySelectorAll('#lvlSel button[data-l]').forEach(b => b.onclick = () => { botLevel = b.dataset.l; refreshMenu(); });
$('botMinus').onclick = () => { nBots = Math.max(0, nBots - 1); refreshMenu(); };
$('botPlus').onclick = () => { nBots = Math.min(MAX_TANKS - nLocal, nBots + 1); refreshMenu(); };
refreshMenu();
const qs = new URLSearchParams(location.search);
$('name').value = localStorage.getItem('tt-name') || '';
if (qs.get('room')) { $('code').value = qs.get('room').toUpperCase(); setTimeout(() => $('name').focus(), 50); }

const inOverlay = () => !$('pause').classList.contains('hidden') || !$('lobby').classList.contains('hidden') || !$('menu').classList.contains('hidden');
function show(id, on) { $(id).classList.toggle('hidden', !on); }
let msgTimer;
function flash(t, ms = 2500) { $('msg').textContent = t; show('msg', true); clearTimeout(msgTimer); msgTimer = setTimeout(() => show('msg', false), ms); }

// ---------- state ----------
let mode = null;           // 'local' | 'online'
let game = null;           // local game
let paused = false;
let net = null;            // online state
const particles = [];

$('playLocal').onclick = () => startLocal(nLocal, nBots, botLevel);
$('create').onclick = () => connect({ t: 'create' });
$('join').onclick = () => { const c = $('code').value.trim().toUpperCase(); if (c.length < 4) return ($('err').textContent = 'Enter the 4-letter room code.'); connect({ t: 'join', code: c }); };
$('code').onkeydown = e => { if (e.key === 'Enter') $('join').click(); };
$('resume').onclick = () => togglePause(false);
$('quit').onclick = () => quit();
$('toLobby').onclick = () => { net && net.send({ t: 'stop' }); togglePause(false); };
$('menuBtn').onclick = () => togglePause(true);
$('leave').onclick = () => quit();
$('copy').onclick = () => { const l = $('link'); l.select(); (navigator.clipboard ? navigator.clipboard.writeText(l.value) : Promise.reject()).then(() => flash('Link copied'), () => document.execCommand('copy')); };
$('start').onclick = () => net && net.send({ t: 'start' });
$('lbPlus').onclick = () => net && net.send({ t: 'addBot' });
$('lbMinus').onclick = () => net && net.send({ t: 'removeBot' });
document.querySelectorAll('#lvlRow button[data-l]').forEach(b => b.onclick = () => net && net.send({ t: 'setLevel', level: b.dataset.l }));
if ($('server')) { $('server').value = new URLSearchParams(location.search).get('server') || window.TT_SERVER_URL || (/^https?:$/.test(location.protocol) && !window.TT_STATIC ? '' : localStorage.getItem('tt-server') || ''); }

function togglePause(on) {
  if (on === undefined) on = $('pause').classList.contains('hidden');
  if (!$('lobby').classList.contains('hidden')) return;
  paused = on && mode === 'local';
  show('toLobbyRow', mode === 'online' && net && net.you === net.host);
  show('pause', on);
}
function quit(keepErr) {
  if (net) { net.closed = true; try { net.send({ t: 'leave' }); net.ws.close(); } catch {} net = null; }
  mode = null; game = null; paused = false; particles.length = 0;
  ['pause', 'lobby', 'menuBtn', 'padL', 'padR'].forEach(id => show(id, false));
  show('menu', true); refreshMenu();
  history.replaceState(null, '', location.pathname);
}

// ---------- local game ----------
let brains = {};
function startLocal(n, bots = 0, level = 'normal') {
  audioInit();
  mode = 'local'; game = TT.createGame(); paused = false; brains = {};
  for (let i = 0; i < n; i++) TT.addPlayer(game, { id: i + 1, name: `P${i + 1}`, colorIndex: i });
  for (let j = 0; j < bots && n + j < MAX_TANKS; j++) {
    const id = n + j + 1; TT.addPlayer(game, { id, name: `Bot ${j + 1}`, colorIndex: n + j });
    game.players[game.players.length - 1].bot = true; brains[id] = TTBots.newBrain(level);
  }
  TT.newRound(game); game.events.length = 0;
  show('menu', false); show('menuBtn', true);
  setupTouch(isTouch ? (n >= 2 ? 'local2' : n === 1 ? 'local1' : null) : null);
  flash(n === 2 && !bots ? 'Red: E S D F + Q   ·   Green: arrows + M' : 'Last tank standing scores!');
}
let acc = 0;
function localTick(dt) {
  if (paused) return;
  acc = Math.min(acc + dt, 0.25);
  while (acc >= 1 / 60) {
    const inputs = {};
    game.players.forEach((p, i) => {
      if (p.bot) { inputs[p.id] = TTBots.think(game, game.tanks[p.id], brains[p.id], 1 / 60); return; }
      let k = readKeys(LOCAL[i].keys); if (touchIn[i]) k = merge(k, touchIn[i]); inputs[p.id] = k;
    });
    TT.step(game, inputs, 1 / 60); tapped.clear();
    handleEvents(game.events.splice(0), id => game.tanks[id]);
    acc -= 1 / 60;
  }
}

// ---------- online ----------
// Server URL: ?server=... > window.TT_SERVER_URL (config.js) > same origin (when served by server.js) > last used
function serverBase() {
  const q = new URLSearchParams(location.search).get('server') || ($('server') && $('server').value.trim());
  let s = q || window.TT_SERVER_URL || '';
  if (!s && /^https?:$/.test(location.protocol) && !window.TT_STATIC) s = location.origin;
  if (!s) s = localStorage.getItem('tt-server') || '';
  if (s && !/^(https?|wss?):\/\//.test(s)) s = 'https://' + s;
  return s.replace(/\/+$/, '');
}
const wsUrlOf = base => (/^wss?:/.test(base) ? base : base.replace(/^http/, 'ws')).replace(/\/ws$/, '') + '/ws';
function shareLink(code) {
  const base = serverBase(), sameOrigin = /^https?:$/.test(location.protocol) && base === location.origin;
  if (/^https?:$/.test(location.protocol)) return location.origin + location.pathname + '?room=' + code + (sameOrigin || base === (window.TT_SERVER_URL || '').replace(/\/+$/, '') ? '' : '&server=' + encodeURIComponent(base));
  return base.replace(/^ws/, 'http') + '/?room=' + code; // standalone file: link to the client the server hosts
}
function connect(first) {
  const base = serverBase();
  if (!base) return ($('err').textContent = 'No game server set. Run "npm start" and open http://localhost:8090, or enter a server URL above.');
  audioInit();
  const name = $('name').value.trim(); localStorage.setItem('tt-name', name);
  $('err').textContent = 'Connecting…';
  net = { base, you: null, host: null, code: null, token: null, players: [], started: false, maze: null, rects: null, round: 0, snaps: [], offset: null, lastSent: '', lastSentAt: 0, pendingEv: [], closed: false, retries: 0, ws: null,
    send(m) { this.ws && this.ws.readyState === 1 && this.ws.send(JSON.stringify(m)); } };
  openSocket(net, Object.assign({ name }, first));
}
function openSocket(me, firstMsg) {
  let ws;
  try { ws = new WebSocket(wsUrlOf(me.base)); } catch (e) { $('err').textContent = 'Bad server URL.'; return; }
  me.ws = ws;
  ws.onopen = () => { me.retries = 0; ws.send(JSON.stringify(firstMsg)); };
  ws.onerror = () => { if (!me.code) $('err').textContent = 'Could not connect to the server (' + me.base + '). Free servers can take ~1 min to wake up — try again.'; };
  ws.onclose = () => {
    if (me.closed || net !== me || me.ws !== ws) return;
    if (me.token && me.retries < 12) { // try to get our slot back
      me.retries++; flash('Connection lost — reconnecting… (' + me.retries + ')', 2000);
      setTimeout(() => { if (net === me && !me.closed) openSocket(me, { t: 'rejoin', code: me.code, token: me.token }); }, 1200);
      return;
    }
    quit(); $('err').textContent = 'Disconnected from the server.';
  };
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.t === 'error') {
      if (m.soft) { flash(m.msg); return; }
      $('err').textContent = m.msg; me.closed = true; ws.close(); if (net === me) quit(true); $('err').textContent = m.msg; return;
    }
    if (m.t === 'joined') {
      const re = !!me.token;
      me.you = m.you; me.code = m.code; me.token = m.token; mode = 'online'; $('err').textContent = '';
      localStorage.setItem('tt-server', me.base);
      history.replaceState(null, '', '?room=' + m.code + (new URLSearchParams(location.search).get('server') ? '&server=' + encodeURIComponent(new URLSearchParams(location.search).get('server')) : ''));
      show('menu', false); show('menuBtn', true); if (!re) setupTouch(isTouch ? 'online' : null); else flash('Reconnected!');
    } else if (m.t === 'lobby') {
      me.players = m.players; me.host = m.host; me.code = m.code; me.level = m.level;
      if (me.started && !m.started) { me.maze = null; me.snaps = []; }
      me.started = m.started; renderLobby();
    } else if (m.t === 'maze') {
      me.maze = m.maze; me.rects = TT.mazeRects(m.maze); me.round = m.round; me.snaps = []; me.pendingEv = [];
    } else if (m.t === 's') {
      if (m.round !== me.round) return;
      const now = performance.now(), est = m.time - now;
      me.offset = me.offset == null || est < me.offset ? est : me.offset * 0.98 + est * 0.02; // track the fastest path
      const snap = { time: m.time, phase: m.phase, tanks: new Map(m.tk.map(t => [t[0], { id: t[0], x: t[1], y: t[2], a: t[3], alive: !!t[4], weapon: t[5] >= 0 ? TT.WEAPONS[t[5]] : null, ammo: t[6], charge: t[7] }])), bullets: new Map(m.b.map(b => [b[0], { x: b[1], y: b[2], kind: TT.KINDS[b[3]], a: b[4] }])),
        crates: (m.cr || []).map(c => ({ id: c[0], x: c[1], y: c[2], type: TT.WEAPONS[c[3]] })), mines: (m.mn || []).map(x => ({ x: x[1], y: x[2], armed: !!x[3] })), beams: (m.bm || []).map(x => ({ kind: x[1] ? 'deathray' : 'laser', owner: x[2], life: x[3], pts: x[4] })) };
      me.snaps.push(snap); if (me.snaps.length > 40) me.snaps.shift();
      for (const [id, sc] of m.sc) { const p = me.players.find(p => p.id === id); if (p) p.score = sc; }
      if (m.ev) for (const e of m.ev) me.pendingEv.push(Object.assign({ at: m.time }, e));
    }
  };
}
function renderLobby() {
  if (!net) return;
  $('roomCode').textContent = net.code;
  $('link').value = shareLink(net.code);
  $('plist').innerHTML = net.players.map(p => `<li><span class="dot" style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${COLORS[p.color]}"></span>${esc(p.name)}${p.bot ? ` <span class="muted">🤖 ${esc(net.level || '')}</span>` : ''}${p.id === net.you ? ' <span class="muted">(you)</span>' : ''}${p.id === net.host ? ' <span class="muted">· host</span>' : ''}${p.online === false ? ' <span class="err">offline…</span>' : ''}</li>`).join('')
    + (net.players.length < 2 ? '<li class="muted">Share the code or link, or add bots (up to 8 tanks)…</li>' : '');
  const host = net.you === net.host;
  show('start', host); show('waitHost', !host); show('botRow', host); show('lvlRow', host);
  $('lobbyBots').textContent = net.players.filter(p => p.bot).length;
  document.querySelectorAll('#lvlRow button[data-l]').forEach(b => b.classList.toggle('sel', b.dataset.l === net.level));
  $('start').disabled = net.players.length < 1;
  show('lobby', !net.started);
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function onlineInput() {
  let k = inOverlay() ? { u: 0, d: 0, l: 0, r: 0, f: 0 } : readKeys(ONLINE_KEYS);
  if (touchIn[0]) k = merge(k, touchIn[0]);
  const s = JSON.stringify(k), now = performance.now();
  tapped.clear();
  if (s !== net.lastSent || now - net.lastSentAt > 250) { net.send({ t: 'input', k }); net.lastSent = s; net.lastSentAt = now; }
}
const INTERP_DELAY = 90;
function lerpAngle(a, b, t) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; }
function onlineView() {
  if (!net.maze || !net.snaps.length) return null;
  const rt = performance.now() + net.offset - INTERP_DELAY, S = net.snaps;
  let a = S[0], b = S[0];
  if (rt >= S[S.length - 1].time) a = b = S[S.length - 1];
  else for (let i = 0; i < S.length - 1; i++) if (S[i].time <= rt && S[i + 1].time >= rt) { a = S[i]; b = S[i + 1]; break; }
  const t = b.time > a.time ? Math.min(1, Math.max(0, (rt - a.time) / (b.time - a.time))) : 1;
  const tanks = [];
  for (const [id, tb] of b.tanks) {
    const ta = a.tanks.get(id) || tb;
    tanks.push({ id, x: ta.x + (tb.x - ta.x) * t, y: ta.y + (tb.y - ta.y) * t, a: lerpAngle(ta.a, tb.a, t), alive: tb.alive && (t > 0.5 || ta.alive), weapon: tb.weapon, ammo: tb.ammo, charge: tb.charge });
  }
  const bullets = [];
  for (const [id, bb] of b.bullets) { const ba = a.bullets.get(id); if (ba) bullets.push({ x: ba.x + (bb.x - ba.x) * t, y: ba.y + (bb.y - ba.y) * t, kind: bb.kind, a: bb.a }); else if (t > 0.5) bullets.push(bb); }
  const due = net.pendingEv.filter(e => e.at <= rt + 20); net.pendingEv = net.pendingEv.filter(e => e.at > rt + 20);
  handleEvents(due, id => tanks.find(x => x.id === id));
  return { maze: net.maze, tanks, bullets, crates: b.crates, mines: b.mines, beams: b.beams, players: net.players.map(p => ({ id: p.id, name: p.name, color: p.color, score: p.score, you: p.id === net.you })) };
}

// ---------- effects & sound ----------
let actx = null;
function audioInit() { if (actx) { actx.state === 'suspended' && actx.resume(); return; } try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch {} }
function beep(freq, dur, type = 'square', vol = 0.05, slide = 0) {
  if (!actx) return; const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur);
}
function boom() {
  if (!actx) return; const len = actx.sampleRate * 0.5, buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const s = actx.createBufferSource(), g = actx.createGain(); g.gain.value = 0.25; s.buffer = buf; s.connect(g).connect(actx.destination); s.start();
}
function handleEvents(evs, tankOf) {
  for (const e of evs) {
    if (e.type === 'fire') beep(520, 0.07, 'square', 0.03, 0.5);
    else if (e.type === 'gat') beep(760, 0.04, 'square', 0.02, 0.6);
    else if (e.type === 'laser') beep(1500, 0.25, 'sawtooth', 0.03, 0.3);
    else if (e.type === 'charge') beep(140, 1.0, 'sine', 0.05, 6);
    else if (e.type === 'deathray') beep(900, 0.6, 'sawtooth', 0.05, 0.2);
    else if (e.type === 'missile') beep(300, 0.35, 'triangle', 0.06, 0.5);
    else if (e.type === 'mine') beep(220, 0.08, 'square', 0.03);
    else if (e.type === 'pickup') { beep(660, 0.08, 'triangle', 0.06, 1.5); }
    else if (e.type === 'burst') {
      boom();
      for (let i = 0; i < 16; i++) { const a = Math.random() * 6.283, s = 20 + Math.random() * 70; particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3 + Math.random() * 0.4, col: i % 2 ? '#777' : '#f7b733', r: 1.5 + Math.random() * 2.5 }); }
    }
    else if (e.type === 'die') {
      boom();
      const p = (mode === 'local' ? game.players : net.players).find(p => p.id === e.id);
      const col = p ? COLORS[p.color] : '#888';
      for (let i = 0; i < 34; i++) { const a = Math.random() * 6.283, s = 20 + Math.random() * 120; particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.6, max: 1.1, col: i % 3 ? col : (i % 2 ? '#555' : '#f7b733'), r: 1.5 + Math.random() * 3 }); }
    }
  }
}

// ---------- touch controls ----------
const touchIn = [null, null];
function joystick(idx) {
  const el = document.createElement('div'); el.className = 'joy'; el.innerHTML = '<div class="knob"></div>';
  const knob = el.firstChild; let pid = null;
  const upd = e => {
    const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = r.width / 2;
    let dx = (e.clientX - cx) / R, dy = (e.clientY - cy) / R; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
    knob.style.transform = `translate(${dx * R * 0.6}px,${dy * R * 0.6}px)`;
    const s = touchIn[idx]; s.u = dy < -0.35; s.d = dy > 0.35; s.l = dx < -0.35; s.r = dx > 0.35;
  };
  el.addEventListener('pointerdown', e => { e.preventDefault(); audioInit(); pid = e.pointerId; el.setPointerCapture(pid); upd(e); });
  el.addEventListener('pointermove', e => { if (e.pointerId === pid) upd(e); });
  const end = e => { if (e.pointerId !== pid) return; pid = null; knob.style.transform = ''; const s = touchIn[idx]; s.u = s.d = s.l = s.r = false; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  return el;
}
function fireBtn(idx, color) {
  const el = document.createElement('div'); el.className = 'fire'; el.textContent = 'FIRE'; el.style.background = color;
  el.addEventListener('pointerdown', e => { e.preventDefault(); audioInit(); el.setPointerCapture(e.pointerId); touchIn[idx].f = true; el.classList.add('on'); });
  const end = () => { touchIn[idx].f = false; el.classList.remove('on'); };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  return el;
}
let padMode = null;
function setupTouch(m) {
  padMode = m; const L = $('padL'), R = $('padR'); L.innerHTML = R.innerHTML = ''; touchIn[0] = touchIn[1] = null;
  if (!m) { show('padL', false); show('padR', false); return; }
  touchIn[0] = { u: false, d: false, l: false, r: false, f: false };
  if (m === 'local2') {
    touchIn[1] = { u: false, d: false, l: false, r: false, f: false };
    L.append(fireBtn(0, COLORS[0]), joystick(0)); R.append(fireBtn(1, COLORS[1]), joystick(1));
  } else if (m === 'local1') {
    L.append(joystick(0)); R.append(fireBtn(0, COLORS[0]));
  } else { // online: stick left, fire right
    const me = () => (net && net.players.find(p => p.id === net.you)) || { color: 0 };
    L.append(joystick(0)); const f = fireBtn(0, COLORS[me().color]); R.append(f); setTimeout(() => (f.style.background = COLORS[me().color]), 1500);
  }
  show('padL', true); show('padR', true);
}

// ---------- rendering ----------
function layout(maze) {
  const W = innerWidth, H = innerHeight;
  const side = padMode ? Math.min(180, Math.max(120, W * 0.19)) : 10;
  const hud = Math.max(44, Math.min(70, H * 0.12));
  const mw = maze.cols * C.CELL + 8, mh = maze.rows * C.CELL + 8;
  const s = Math.min((W - side * 2) / mw, (H - hud - 16) / mh);
  return { s, ox: (W - maze.cols * C.CELL * s) / 2, oy: Math.max(8, (H - hud - maze.rows * C.CELL * s) / 2), hud, side };
}
// Turret ("head") per weapon, drawn in tank-local coords facing +x. Each weapon has its own silhouette.
function drawTurret(w, color, charge = 0) {
  const OUT = 'rgba(0,0,0,.6)', DARK = '#333', T = performance.now() / 1000;
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;
  const disc = (x, y, r) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); ctx.stroke(); };
  const box = (x, y, w2, h, fill = color) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.rect(x, y, w2, h); ctx.fill(); ctx.stroke(); };
  switch (w) {
    case 'gatling': // three-barrel rotary gun with a collar
      for (const y of [-4.6, -1, 2.6]) box(2, y, 16, 2, DARK);
      box(9, -6, 3.5, 12);
      disc(-1, 0, 6.5);
      ctx.fillStyle = DARK; ctx.beginPath(); ctx.arc(-1, 0, 2, 0, 6.283); ctx.fill();
      break;
    case 'laser': // thin, long, glowing barrel on a small angular head
      ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = 8;
      box(0, -1.3, 23, 2.6);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(23, 0, 2.2, 0, 6.283); ctx.fill();
      ctx.restore();
      ctx.save(); ctx.translate(-1, 0); ctx.rotate(Math.PI / 4); box(-5, -5, 10, 10); ctx.restore();
      break;
    case 'frag': // stubby, wide mortar
      disc(-3, 0, 5.5);
      box(1, -7, 12, 14);
      ctx.fillStyle = DARK; ctx.fillRect(10, -5, 3, 10);
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(4, -7, 2, 14);
      break;
    case 'deathray': { // emitter rod + dish
      box(2, -1.6, 9, 3.2, DARK);
      ctx.lineWidth = 3.4; ctx.strokeStyle = OUT; ctx.beginPath(); ctx.arc(19, 0, 9, Math.PI * 0.68, Math.PI * 1.32); ctx.stroke();
      ctx.lineWidth = 2.2; ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(19, 0, 9, Math.PI * 0.68, Math.PI * 1.32); ctx.stroke();
      ctx.save(); ctx.shadowColor = '#7df'; ctx.shadowBlur = charge > 0 ? 14 : 5;
      ctx.fillStyle = charge > 0 ? (Math.sin(T * 40) > 0 ? '#fff' : '#7df') : '#9ef'; ctx.beginPath(); ctx.arc(13, 0, charge > 0 ? 3 : 2, 0, 6.283); ctx.fill(); ctx.restore();
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;
      disc(-1, 0, 6);
      break;
    }
    case 'missile': // launcher tube with the missile nose poking out
      ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.moveTo(15, -2.6); ctx.lineTo(21, 0); ctx.lineTo(15, 2.6); ctx.closePath(); ctx.fill(); ctx.stroke();
      box(-3, -4.5, 18, 9);
      ctx.fillStyle = DARK; ctx.fillRect(12.5, -3, 2.5, 6);
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(-3, 1.5, 18, 1.5);
      break;
    case 'mine': // flat box, no barrel, hazard stripes
      box(-8, -7.5, 15, 15);
      ctx.save(); ctx.beginPath(); ctx.rect(-8, -7.5, 15, 15); ctx.clip(); ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 2;
      for (let k = -16; k < 16; k += 5) { ctx.beginPath(); ctx.moveTo(k - 8, 8); ctx.lineTo(k + 8, -8); ctx.stroke(); }
      ctx.restore(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;
      ctx.fillStyle = DARK; ctx.beginPath(); ctx.arc(-0.5, 0, 2.5, 0, 6.283); ctx.fill();
      break;
    default: // standard cannon
      box(1, -2, 15, 4, DARK);
      disc(-1, 0, 6);
  }
}
function drawTank(x, y, a, color, s = 1, weapon = null, charge = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(s, s);
  ctx.fillStyle = '#3b3b3b'; ctx.fillRect(-13, -12, 25, 6); ctx.fillRect(-13, 6, 25, 6);           // treads
  ctx.fillStyle = color; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.rect(-11, -8, 21, 16); ctx.fill(); ctx.stroke();                              // hull
  drawTurret(weapon, color, charge);
  ctx.restore();
}
function drawCrate(c) {
  const bob = Math.sin(performance.now() / 300 + c.id) * 1.2;
  ctx.save(); ctx.translate(c.x, c.y + bob);
  ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#555'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.rect(-11, -11, 22, 22); ctx.fill(); ctx.stroke();
  ctx.scale(0.62, 0.62); ctx.translate(-3, 0); drawTurret(c.type, '#8a8a8a');
  ctx.restore();
}
function drawProjectile(b) {
  const k = b.kind || 'b';
  if (k === 'missile') {
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a || 0);
    ctx.fillStyle = Math.random() < 0.5 ? '#f7b733' : '#e8572a'; ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(-11 - Math.random() * 3, 0); ctx.lineTo(-6, 2); ctx.fill();
    ctx.fillStyle = '#555'; ctx.fillRect(-6, -2.5, 9, 5); ctx.fillStyle = '#222'; ctx.beginPath(); ctx.moveTo(3, -2.5); ctx.lineTo(7, 0); ctx.lineTo(3, 2.5); ctx.fill();
    ctx.restore(); return;
  }
  ctx.fillStyle = k === 'frag' ? '#444' : '#222';
  ctx.beginPath(); ctx.arc(b.x, b.y, TT.KIND_R[k] || C.BULLET_R, 0, 6.283); ctx.fill();
  if (k === 'bomb') { ctx.fillStyle = Math.sin(performance.now() / 70) > 0 ? '#f33' : '#600'; ctx.beginPath(); ctx.arc(b.x, b.y, 1.8, 0, 6.283); ctx.fill(); }
}
function render(view, dt) {
  const dpr = devicePixelRatio || 1;
  if (cv.width !== Math.round(innerWidth * dpr) || cv.height !== Math.round(innerHeight * dpr)) { cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr); cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px'; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#cfcfcf'; ctx.fillRect(0, 0, innerWidth, innerHeight);
  if (!view) { ctx.fillStyle = '#666'; ctx.font = '16px Verdana'; ctx.textAlign = 'center'; ctx.fillText(mode ? 'Waiting for the round…' : '', innerWidth / 2, innerHeight / 2); return; }
  const m = view.maze, L = layout(m), CS = C.CELL, rects = view.rects || TT.mazeRects(m);
  const colorOf = id => { const p = view.players.find(p => p.id === id); return COLORS[p ? p.color : 0]; };
  ctx.save(); ctx.translate(L.ox, L.oy); ctx.scale(L.s, L.s);
  // floor + faint cell grid
  ctx.fillStyle = '#ececec'; ctx.fillRect(0, 0, m.cols * CS, m.rows * CS);
  ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 1; ctx.beginPath();
  for (let c = 1; c < m.cols; c++) { ctx.moveTo(c * CS, 0); ctx.lineTo(c * CS, m.rows * CS); }
  for (let r = 1; r < m.rows; r++) { ctx.moveTo(0, r * CS); ctx.lineTo(m.cols * CS, r * CS); }
  ctx.stroke();
  // mines (armed ones are barely visible)
  for (const mn of view.mines || []) {
    ctx.globalAlpha = mn.armed ? 0.22 : 1;
    ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(mn.x, mn.y, 5.5, 0, 6.283); ctx.fill();
    ctx.fillStyle = mn.armed ? '#333' : (Math.sin(performance.now() / 90) > 0 ? '#f33' : '#900'); ctx.beginPath(); ctx.arc(mn.x, mn.y, 2, 0, 6.283); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // crates
  for (const c of view.crates || []) drawCrate(c);
  // walls
  ctx.fillStyle = '#4d4d4d';
  for (const q of rects) ctx.fillRect(q.x, q.y, q.w, q.h);
  // laser aim guides
  for (const t of view.tanks) if (t.alive && t.weapon === 'laser') {
    const ray = TT.traceRay(rects, t.x + Math.cos(t.a) * 8, t.y + Math.sin(t.a) * 8, t.a, TT.W.LASER_GUIDE, 4);
    ctx.save(); ctx.strokeStyle = colorOf(t.id); ctx.globalAlpha = 0.55; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]); ctx.lineDashOffset = -performance.now() / 40;
    ctx.beginPath(); ray.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); ctx.restore();
  }
  // tanks
  for (const t of view.tanks) if (t.alive) {
    if (t.charge > 0) { // death ray charging glow
      const k = 1 - t.charge / TT.W.RAY_CHARGE;
      ctx.save(); ctx.strokeStyle = '#7df'; ctx.shadowColor = '#7df'; ctx.shadowBlur = 12; ctx.lineWidth = 2 + 2 * k; ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(performance.now() / 60));
      ctx.beginPath(); ctx.arc(t.x, t.y, 24 - 8 * k, 0, 6.283); ctx.stroke(); ctx.restore();
    }
    drawTank(t.x, t.y, t.a, colorOf(t.id), 1, t.weapon, t.charge);
  }
  // projectiles
  for (const b of view.bullets) drawProjectile(b);
  // beams
  for (const bm of view.beams || []) {
    const col = colorOf(bm.owner), ray = bm.kind === 'deathray';
    ctx.save(); ctx.globalAlpha = Math.min(1, bm.life / 0.25); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.shadowColor = ray ? '#7df' : col; ctx.shadowBlur = 12;
    const path = () => { ctx.beginPath(); bm.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); };
    ctx.strokeStyle = ray ? '#5cf' : col; ctx.lineWidth = ray ? 7 : 3; path();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = ray ? 2.5 : 1; path();
    ctx.restore();
  }
  // particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.life -= dt; if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy *= 0.93;
    ctx.globalAlpha = Math.min(1, p.life / 0.4); ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.restore();
  // HUD: scores + current weapon at the bottom
  const ps = view.players, n = ps.length, hy = innerHeight - L.hud / 2 - 4;
  const slot = Math.min(220, (innerWidth - (padMode ? L.side * 2 : 20)) / Math.max(1, n));
  ctx.textBaseline = 'middle';
  ps.forEach((p, i) => {
    const cx = innerWidth / 2 + (i - (n - 1) / 2) * slot - 14, sc = Math.min(1.3, L.hud / 50, slot / 120);
    const t = view.tanks.find(t => t.id === p.id), w = t && t.alive ? t.weapon : null;
    drawTank(cx - 26 * sc, hy, -Math.PI / 2, COLORS[p.color], sc, w);
    ctx.fillStyle = '#333'; ctx.textAlign = 'left';
    ctx.font = `bold ${Math.round(24 * sc)}px Verdana, sans-serif`; ctx.fillText(p.score, cx - 6 * sc, hy - 5 * sc);
    // weapon icon box next to the score
    const ix = cx + 30 * sc, iy = hy - 6 * sc, bs = 20 * sc;
    ctx.fillStyle = w ? '#fafafa' : 'rgba(255,255,255,.35)'; ctx.strokeStyle = w ? '#555' : '#aaa'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.rect(ix - bs / 2, iy - bs / 2, bs, bs); ctx.fill(); ctx.stroke();
    if (w) {
      ctx.save(); ctx.translate(ix - 2 * sc, iy); ctx.scale(0.55 * sc, 0.55 * sc); drawTurret(w, COLORS[p.color]); ctx.restore();
      if (w === 'gatling' || w === 'mine') { ctx.fillStyle = '#333'; ctx.font = `bold ${Math.round(9 * sc)}px Verdana, sans-serif`; ctx.fillText('×' + t.ammo, ix + bs / 2 + 2, iy); }
    }
    ctx.font = `${Math.round(10 * sc)}px Verdana, sans-serif`; ctx.fillStyle = '#555';
    const sub = view.legend && view.legend[i] ? view.legend[i] : (p.name + (p.you ? ' (you)' : ''));
    ctx.fillText(w && !p.bot ? TT.WEAPON_NAMES[w] : sub, cx - 6 * sc, hy + 13 * sc);
  });
}
function localView() {
  return { maze: game.maze, rects: game.rects, tanks: Object.values(game.tanks), bullets: game.bullets, players: game.players,
    crates: game.crates, beams: game.beams, mines: game.mines.map(m => ({ x: m.x, y: m.y, armed: m.age >= TT.W.MINE_ARM })),
    legend: game.players.map((p, i) => p.bot ? p.name : `${LOCAL[i].label.slice(0, 4).join(' ')} + ${LOCAL[i].label[4]}`) };
}

// ---------- main loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  let view = null;
  if (mode === 'local' && game) { localTick(dt); view = localView(); }
  else if (mode === 'online' && net) { onlineInput(); view = onlineView(); if (view) view.rects = net.rects; }
  render(view, dt);
  show('rotate', !!mode && isTouch && innerHeight > innerWidth);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__tt = { get game() { return game; }, get net() { return net; }, startLocal, down, drawTank, ctx, get paused() { return paused; }, set paused(v) { paused = v; } };
})();
