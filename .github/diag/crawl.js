// Dizayn ko'rib chiqish uchun skrinshotlar (base64 JPEG log'ga chiqariladi)
const { chromium } = require('playwright');
const shots = [
  ['m-home', '/', 390, true, 3200], ['m-catalog', '/catalog', 390, true, 2200], ['m-listing', '/listing/17', 390, true, 3000],
  ['m-rental', '/transportrental', 390, true, 2000], ['m-mechanic', '/mechanic', 390, true, 1800], ['m-requests', '/requests', 390, true, 1600],
  ['m-company', '/company/8', 390, true, 2000], ['m-plans', '/plans', 390, true, 2400], ['m-menu', '/#menu', 390, false, 844],
  ['m-create', '/create', 390, false, 844], ['m-404', '/yoq-sahifa', 390, false, 844],
  ['d-home', '/', 1366, true, 2600], ['d-catalog', '/catalog', 1366, true, 1600], ['d-listing', '/listing/17', 1366, true, 1800],
];
(async () => {
  const b = await chromium.launch();
  for (const [name, path, w, full, maxH] of shots) {
    const mobile = w < 500;
    const ctx = await b.newContext({ viewport: { width: w, height: mobile ? 844 : 860 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    await p.goto('https://hemu.uz' + path.replace('#menu', ''), { waitUntil: 'networkidle' }).catch(() => {});
    await p.waitForTimeout(1200);
    if (path.includes('#menu')) { await p.click('[data-menu]').catch(() => {}); await p.waitForTimeout(700); }
    if (full) { const h = await p.evaluate(() => document.documentElement.scrollHeight); await p.setViewportSize({ width: w, height: Math.min(h, maxH) }); await p.waitForTimeout(600); }
    const buf = await p.screenshot({ type: 'jpeg', quality: 62 });
    const b64 = buf.toString('base64');
    for (let i = 0; i < b64.length; i += 4000) console.log(`IMG ${name} ${i / 4000} ${b64.slice(i, i + 4000)}`);
    await ctx.close();
  }
  await b.close();
})();
