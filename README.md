# Tank Tussle — a Tank Trouble (2015) style remake

Top-down maze tank battles: small random mazes, slow round bullets that bounce off walls
for 10 s (you can shoot yourself), one hit kills, last tank standing scores a point, new maze every round.
All art is simple drawn shapes — no original assets.

## Run it

**Quickest: just open `tank-tussle.html` in Chrome (double-click) — local 2–4 player mode works with no server, no npm.**

Online mode requires Node.js 18+:

```bash
npm install
npm start            # serves on http://localhost:8090  (change with PORT=3000 npm start)
```

Open http://localhost:8090 in a browser.

## Modes

**Same keyboard (2–4 players)** — pick 2/3/4 on the title screen:

| Player | Colour | Move (fwd / left / back / right) | Fire |
|---|---|---|---|
| P1 | Red    | E / S / D / F | Q |
| P2 | Green  | ↑ / ← / ↓ / → | M (or /) |
| P3 | Blue   | I / J / K / L | U |
| P4 | Yellow | Numpad 8 / 4 / 5 / 6 | Numpad 0 |

On a phone/tablet (landscape) two players share the screen: Red = left stick + FIRE, Green = right stick + FIRE.
(Local mode also works by just opening `public/index.html` from disk.)

**Online (each player on their own PC/phone)** — needs the server running:
1. One player clicks **Create room** → gets a 4-letter code and a share link.
2. Friends open the same address, enter the code (or open the link) and click **Join room**. 2–4 players.
3. The host clicks **Start game**. Everyone drives with arrows (or WASD) and fires with Space / M; phones get an on-screen stick + FIRE.

How friends reach your server:
- Same Wi-Fi/LAN: they open `http://<your-computer-IP>:8090` (allow Node through the firewall).
- Over the internet: expose the port with a tunnel, e.g. `cloudflared tunnel --url http://localhost:8090`
  or `ssh -p 443 -R0:localhost:8090 free@a.pinggy.io`, and share the https URL it prints (WebSockets work through both).

Esc / ☰ opens the menu (the host can end the game and return everyone to the lobby).

## Code layout

- `public/game.js` – shared game logic (maze generation, movement, collisions, bouncing bullets, rounds/scores). Used by the browser (local mode) and by the server (online mode).
- `public/client.js` – rendering, keyboard/touch input, local loop, online client (interpolates server snapshots).
- `public/index.html` – UI/menus.
- `server.js` – static file server + WebSocket rooms (`/ws`); authoritative 60 Hz simulation, 30 Hz snapshots.

## Weapons (crates)

A crate appears every 8–12 s (first one 3–6 s into a round, max 3 on the map). Drive over it with an empty slot to pick it up.
The tank's turret changes shape so everyone can see what you carry, and the icon shows next to your score.

| Weapon | Turret look | How it works |
|---|---|---|
| Gatling | three thin barrels + collar | hold fire: 24 rapid small bullets |
| Laser | long thin glowing barrel | dashed aim guide while held; fire = instant bouncing beam, kills first tank hit |
| Frag bomb | stubby wide mortar | fire launches a bomb; fire again to burst into shrapnel (auto-bursts after 3 s) |
| Death ray | dish emitter | fire = 1 s charge (tank can't drive, can aim), then a long bouncing beam that kills every other tank it touches |
| Homing missile | launcher tube | follows the maze to the nearest tank (can come back for you after 3 s) |
| Mines | flat striped box, no barrel | fire drops a mine behind you (3 per crate); arms after 1.5 s and turns almost invisible |

Not done yet: AI bots.
