const { chromium, devices } = require('playwright');
const fs = require('fs');
const note = (s) => console.log(`::notice::${s}`);
(async () => {
  await new Promise((r) => setTimeout(r, 15000));
  const list = await (await fetch('https://hemu.uz/api/v1/specialists?kind=mechanic&per_page=5')).json();
  const sp = list.items.find((x) => !x.demo) || list.items[0];
  note(`usta: ${sp?.slug} demo=${sp?.demo} jami=${list.total}`);
  for (const f of ['vizitka.png', 'stiker.png', 'qr.svg', 'vizitka.svg']) {
    const r = await fetch(`https://hemu.uz/u/${sp.slug}/${f}`);
    const b = Buffer.from(await r.arrayBuffer());
    note(`${f}: ${r.status} ${r.headers.get('content-type')} ${b.length}b`);
    if (r.ok) fs.writeFileSync(f, b);
  }
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'uz' });
  await ctx.addInitScript(() => { try { localStorage.setItem('mx_lang', 'uz'); } catch {} });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`https://hemu.uz/u/${sp.slug}`, { waitUntil: 'load' }); await p.waitForTimeout(2500);
  await p.screenshot({ path: 'profil.png', fullPage: true });
  // SVG lar brauzerda PNG ga (sharp bo'lmasa ham ko'rish uchun)
  for (const f of ['vizitka', 'stiker']) {
    if (fs.existsSync(`${f}.png`)) continue;
    await p.goto(`https://hemu.uz/u/${sp.slug}/${f}.svg`); await p.waitForTimeout(800);
    await p.screenshot({ path: `${f}-svg.png` });
  }
  const html = await (await fetch(`https://hemu.uz/u/${sp.slug}`)).text();
  note('og:image: ' + (html.match(/og:image" content="([^"]+)/) || [])[1] + ' | title: ' + (html.match(/<title>([^<]*)/) || [])[1]);
  note('xatolar: ' + (errs.join(' | ') || "yo'q"));
  await b.close();
})().catch((e) => { console.log(`::error::${e.message}`); process.exit(1); });
