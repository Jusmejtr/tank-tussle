#!/usr/bin/env python3
"""Tank Tussle app icon: minimal flat top-down tank silhouette (rounded body, round turret, one straight barrel
pointing up-right) in a single gold on solid deep navy. No gradients or frames. Everything stays inside the
maskable safe zone (circle r = 40% = 205px of 512), so one design serves "any", maskable and Apple icons.
Writes public/icons/icon.svg, icon-maskable.svg, icon-apple.svg. Rasterise with: node tools/render_icons.js"""
import math, os
BG, GOLD = '#0b1020', '#e8b23a'
ANGLE = -45            # barrel direction in degrees (SVG: -45 = up-right)
SHIFT = -22            # move the tank back along its axis so it looks centred (barrel sticks out in front)
# shapes in tank-local coordinates, barrel along +x, tank centre at (0,0)
BODY = dict(x=-105, y=-82, w=210, h=164, rx=36)
TURRET = dict(cx=-6, cy=0, r=56, gap=9)          # navy ring (gap) separates the turret from the body
BARREL = dict(x=-6, y=-15, w=170, h=30, rx=8)

def reach():
    pts = [(BODY['x'], BODY['y']), (BODY['x'] + BODY['w'], BODY['y']), (BODY['x'], BODY['y'] + BODY['h']), (BODY['x'] + BODY['w'], BODY['y'] + BODY['h']),
           (BARREL['x'] + BARREL['w'], BARREL['y']), (BARREL['x'] + BARREL['w'], BARREL['y'] + BARREL['h'])]
    return max(math.hypot(x + SHIFT, y) for x, y in pts)

def svg():
    b, t, br = BODY, TURRET, BARREL
    g = (f'<rect x="{b["x"]}" y="{b["y"]}" width="{b["w"]}" height="{b["h"]}" rx="{b["rx"]}" fill="{GOLD}"/>'
         f'<circle cx="{t["cx"]}" cy="{t["cy"]}" r="{t["r"] + t["gap"]}" fill="{BG}"/>'
         f'<rect x="{br["x"]}" y="{br["y"] - t["gap"]}" width="{br["w"]}" height="{br["h"] + 2 * t["gap"]}" rx="{br["rx"] + 4}" fill="{BG}"/>'
         f'<rect x="{br["x"]}" y="{br["y"]}" width="{br["w"]}" height="{br["h"]}" rx="{br["rx"]}" fill="{GOLD}"/>'
         f'<circle cx="{t["cx"]}" cy="{t["cy"]}" r="{t["r"]}" fill="{GOLD}"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">'
            f'<rect width="512" height="512" fill="{BG}"/>'
            f'<g transform="translate(256 256) rotate({ANGLE}) translate({SHIFT} 0)">{g}</g></svg>')

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'icons')
os.makedirs(out, exist_ok=True)
for name in ('icon.svg', 'icon-maskable.svg', 'icon-apple.svg'):
    open(os.path.join(out, name), 'w').write(svg())
print(f'farthest point {reach():.0f}px from centre (maskable safe zone 205px)')
