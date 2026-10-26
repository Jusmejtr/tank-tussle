// Tank Tussle server: serves the game and runs authoritative online rooms over WebSocket.
const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');
const TT = require('./public/game.js');

const PORT = +process.env.PORT || 8090;
const PUB = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const TICK = 1 / 60, SEND_EVERY = 2; // 60 Hz sim, 30 Hz snapshots

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, rooms: rooms.size })); }
  const file = path.normalize(path.join(PUB, url === '/' ? 'index.html' : url));
  if (!file.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws' });
const rooms = new Map();
const ALPH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newCode() { let c; do { c = Array.from({ length: 4 }, () => ALPH[Math.floor(Math.random() * ALPH.length)]).join(''); } while (rooms.has(c)); return c; }
const send = (ws, m) => { if (ws.readyState === 1) ws.send(typeof m === 'string' ? m : JSON.stringify(m)); };
function broadcast(room, m) { const s = JSON.stringify(m); for (const c of room.clients.values()) send(c.ws, s); }

function lobbyMsg(room) {
  return { t: 'lobby', code: room.code, host: room.hostId, started: !!room.game,
    players: room.order.map(id => { const c = room.clients.get(id); const p = room.game && room.game.players.find(p => p.id === id); return { id, name: c.name, color: c.color, score: p ? p.score : 0 }; }) };
}
function mazeMsg(room) { return { t: 'maze', round: room.game.round, maze: { cols: room.game.maze.cols, rows: room.game.maze.rows, hw: room.game.maze.hw, vw: room.game.maze.vw } }; }

function startGame(room) {
  stopGame(room);
  const g = room.game = TT.createGame();
  for (const id of room.order) { const c = room.clients.get(id); TT.addPlayer(g, { id, name: c.name, colorIndex: c.color }); }
  TT.newRound(g); g.events.length = 0;
  broadcast(room, lobbyMsg(room)); broadcast(room, mazeMsg(room));
  let tick = 0, round = g.round;
  room.loop = setInterval(() => {
    const inputs = {}; for (const [id, c] of room.clients) inputs[id] = c.input;
    TT.step(g, inputs, TICK);
    const ev = g.events.splice(0);
    if (g.round !== round) { round = g.round; broadcast(room, lobbyMsg(room)); broadcast(room, mazeMsg(room)); }
    if (++tick % SEND_EVERY === 0 || ev.some(e => e.type === 'die')) {
      const s = TT.snapshot(g); s.ev = ev.filter(e => e.type !== 'bounce' && e.type !== 'round'); broadcast(room, s);
    }
  }, 1000 * TICK);
}
function stopGame(room) { if (room.loop) clearInterval(room.loop); room.loop = null; room.game = null; }

let nextClientId = 1;
wss.on('connection', ws => {
  let room = null, me = null;
  ws.isAlive = true; ws.on('pong', () => (ws.isAlive = true));
  function join(r, name) {
    if (r.clients.size >= 4) return send(ws, { t: 'error', msg: 'Room is full (max 4 players).' });
    const used = new Set([...r.clients.values()].map(c => c.color)); let color = 0; while (used.has(color)) color++;
    me = { id: nextClientId++, ws, name: (String(name || '').trim().slice(0, 14)) || TT.COLOR_NAMES[color], color, input: {} };
    r.clients.set(me.id, me); r.order.push(me.id); room = r;
    if (!r.hostId) r.hostId = me.id;
    if (r.game) TT.addPlayer(r.game, { id: me.id, name: me.name, colorIndex: color }); // joins from next round
    send(ws, { t: 'joined', code: r.code, you: me.id });
    broadcast(r, lobbyMsg(r));
    if (r.game) send(ws, mazeMsg(r));
  }
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'create' && !room) { const r = { code: newCode(), clients: new Map(), order: [], hostId: null, game: null, loop: null }; rooms.set(r.code, r); join(r, m.name); }
    else if (m.t === 'join' && !room) { const r = rooms.get(String(m.code || '').toUpperCase().trim()); if (!r) return send(ws, { t: 'error', msg: 'Room not found.' }); join(r, m.name); }
    else if (m.t === 'start' && room && me.id === room.hostId) startGame(room);
    else if (m.t === 'stop' && room && me.id === room.hostId) { stopGame(room); broadcast(room, lobbyMsg(room)); }
    else if (m.t === 'input' && me) { const k = m.k || {}; me.input = { u: !!k.u, d: !!k.d, l: !!k.l, r: !!k.r, f: !!k.f }; }
    else if (m.t === 'ping') send(ws, { t: 'pong', c: m.c });
  });
  ws.on('close', () => {
    if (!room) return;
    room.clients.delete(me.id); room.order = room.order.filter(id => id !== me.id);
    if (room.game) TT.removePlayer(room.game, me.id);
    if (!room.clients.size) { stopGame(room); rooms.delete(room.code); return; }
    if (room.hostId === me.id) room.hostId = room.order[0];
    broadcast(room, lobbyMsg(room));
  });
});
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 20000);

server.listen(PORT, () => console.log(`Tank Tussle on http://localhost:${PORT}`));
