// Rasterise public/icons/*.svg to exact-size PNGs with headless Chrome (crisp, no extra tools needed).
// Usage: node tools/render_icons.js   (needs puppeteer-core + /usr/bin/google-chrome)
const puppeteer = require('puppeteer-core'), fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', 'public', 'icons');
const JOBS = [['icon.svg', 'icon-192.png', 192], ['icon.svg', 'icon-512.png', 512], ['icon-maskable.svg', 'icon-maskable-512.png', 512],
  ['icon-maskable.svg', 'icon-maskable-192.png', 192], ['icon-apple.svg', 'apple-touch-icon.png', 180], ['icon.svg', 'favicon-32.png', 32], ['icon.svg', 'icon-48.png', 48]];
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] }), p = await b.newPage();
  for (const [src, out, size] of JOBS) {
    const svg = fs.readFileSync(path.join(DIR, src), 'utf8').replace('width="512" height="512"', `width="${size}" height="${size}"`);
    await p.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await p.setContent(`<html><body style="margin:0;background:#000">${svg}</body></html>`);
    await p.screenshot({ path: path.join(DIR, out), clip: { x: 0, y: 0, width: size, height: size } });
    console.log(out, size);
  }
  await b.close();
})();
