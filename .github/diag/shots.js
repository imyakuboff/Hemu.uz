const { chromium, devices } = require('playwright');
const note = (s) => console.log(`::notice::${s}`);
(async () => {
  const idx = await (await fetch('https://hemu.uz/api/v1/models')).json();
  note('markalar: ' + idx.brands.map((b) => `${b.name}(${b.count}): ${b.models.map((m) => m.slug).join(',')}`).join(' | ').slice(0, 600));
  const b0 = idx.brands[0]; const m0 = b0?.models[0];
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'uz' });
  await ctx.addInitScript(() => { try { localStorage.setItem('mx_lang', 'uz'); } catch {} });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const shots = [['models', '/models'], ['brand', `/model/${b0.slug}`], ['model', m0 ? `/model/${b0.slug}/${m0.slug}` : `/model/${b0.slug}`], ['zapchast', '/zapchast-topish?machine=XGMA'], ['sparepart', '/sparepart']];
  for (const [n, path] of shots) {
    await p.goto('https://hemu.uz' + path, { waitUntil: 'load' }); await p.waitForTimeout(2500);
    await p.screenshot({ path: `${n}.png`, fullPage: true });
    note(`${path}: ${await p.title()}`);
  }
  const ssr = await (await fetch(`https://hemu.uz${shots[2][1]}?lang=uz`, { headers: { 'User-Agent': 'Googlebot' } })).text();
  note('SSR title: ' + (ssr.match(/<title>([^<]*)/) || [])[1] + ' | h1: ' + (ssr.match(/<h1>([^<]*)/) || [])[1]);
  note('xatolar: ' + (errs.join(' | ') || "yo'q"));
  await b.close();
})().catch((e) => { console.log(`::error::${e.message}`); process.exit(1); });
