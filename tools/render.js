// usage: node render.js --times 0,5,10 --out dir  |  node render.js --from 0 --to 1440 --fps 30 --out dir
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') && a.push([v.slice(2), arr[i + 1]]), a), []));
const W = +(args.w || 1920), H = +(args.h || 1080), out = args.out || '/tmp/frames';
fs.mkdirSync(out, { recursive: true });
const fontMap = {}; for (const f of fs.readdirSync(ROOT + '/fonts')) if (f.endsWith('.woff2')) fontMap['/' + f.replace(/_/g, '/').replace(/^s\//, 's/')] = f;
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text().slice(0, 300)); });
  page.on('pageerror', e => { console.log('[pageerror]', e.message); process.exit(2); });
  await page.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.hostname === 'local') { const p = path.join(ROOT, u.pathname); if (fs.existsSync(p)) return route.fulfill({ path: p }); return route.fulfill({ status: 404, body: '' }); }
    if (u.hostname === 'cdn.jsdelivr.net') { const p = path.join(ROOT, 'node_modules', u.pathname.replace(/^\/npm\/three@[^/]+/, 'three')); return route.fulfill({ path: p, contentType: 'application/javascript' }); }
    if (u.hostname === 'fonts.googleapis.com') { let css = fs.readFileSync(ROOT + '/fonts/fonts.css', 'utf8'); return route.fulfill({ body: css, contentType: 'text/css' }); }
    if (u.hostname === 'fonts.gstatic.com') { const f = u.pathname.slice(1).replace(/\//g, '_'); return route.fulfill({ path: ROOT + '/fonts/' + f, contentType: 'font/woff2' }); }
    return route.fulfill({ status: 404, body: '' });
  });
  const t0 = Date.now();
  console.log("goto"); await page.goto(`http://local/index.html?render=1&w=${W}&h=${H}`, { waitUntil: "domcontentloaded" }); console.log("loaded");
  await page.waitForFunction(() => window.NB_READY || window.NB_ERROR, null, { timeout: 600000 });
  const err = await page.evaluate(() => window.NB_ERROR); if (err) { console.log('INIT ERROR', err); process.exit(1); }
  console.log('init', (Date.now() - t0) / 1000, 's');
  let times = [];
  if (args.times) times = args.times.split(',').map(Number).map((t, i) => [t, 't' + String(t).replace('.', '_')]);
  else { const fps = +(args.fps || 30); for (let f = +args.from; f < +args.to; f++) times.push([f / fps, String(f).padStart(5, '0')]); }
  for (const [t, name] of times) {
    const fn = path.join(out, name + '.' + (args.fmt || 'jpg'));
    if (args.skip && fs.existsSync(fn)) continue;
    const s = Date.now();
    await page.evaluate(t => window.renderAt(t), t);
    await page.screenshot({ timeout: 180000, path: fn, type: args.fmt === 'png' ? 'png' : 'jpeg', quality: args.fmt === 'png' ? undefined : 94 });
    console.log(name, t.toFixed(3), ((Date.now() - s) / 1000).toFixed(2) + 's');
  }
  await browser.close();
})();
