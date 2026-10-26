// Preview sheet: the icon at 512, the maskable version cropped as a circle and a squircle, and home-screen sizes.
// Usage: node tools/icon_preview.js [out.png]   (default /workspace/tank-tussle-icon-preview.png)
const puppeteer = require('puppeteer-core'), path = require('path'), fs = require('fs');
const OUT = process.argv[2] || '/workspace/tank-tussle-icon-preview.png', DIR = path.join(__dirname, '..', 'public', 'icons');
const img = f => 'data:image/png;base64,' + fs.readFileSync(path.join(DIR, f)).toString('base64');
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] }), p = await b.newPage();
  await p.setViewport({ width: 1100, height: 600, deviceScaleFactor: 1 });
  const app = (src, s, r, label) => `<div class="app"><img src="${img(src)}" style="width:${s}px;height:${s}px;border-radius:${r}"><span>${label}</span></div>`;
  await p.setContent(`<html><body style="margin:0;background:#20242c;font:14px Verdana,sans-serif;color:#ddd;display:flex;gap:36px;padding:32px;box-sizing:border-box">
    <div><img src="${img('icon-512.png')}" width="512" height="512" style="border-radius:24px;display:block"><div style="margin-top:10px;text-align:center">icon-512.png (any)</div></div>
    <div style="display:flex;flex-direction:column;gap:24px">
      <div style="display:flex;gap:24px;align-items:center">
        <div style="text-align:center"><img src="${img('icon-maskable-512.png')}" width="180" height="180" style="border-radius:50%"><div>maskable, circle</div></div>
        <div style="text-align:center"><img src="${img('icon-maskable-512.png')}" width="180" height="180" style="border-radius:28%"><div>maskable, squircle</div></div>
      </div>
      <div style="background:linear-gradient(160deg,#3a5f8f,#1d2b4a);border-radius:22px;padding:22px;display:grid;grid-template-columns:repeat(4,72px);gap:20px 26px">
        ${app('apple-touch-icon.png', 60, '22%', 'Tank Tussle')}${app('icon-192.png', 60, '22%', 'any 60px')}${app('icon-48.png', 48, '18%', '48px')}${app('favicon-32.png', 32, '4px', '32px')}
      </div>
      <div style="color:#999">home-screen sizes: 60px (iOS), 48px (Android), 32px favicon</div>
    </div>
    <style>.app{display:flex;flex-direction:column;align-items:center;gap:6px;font-size:11px;color:#fff;text-shadow:0 1px 2px #000}</style></body></html>`, { waitUntil: 'load' });
  await p.screenshot({ path: OUT }); await b.close(); console.log(OUT);
})();
