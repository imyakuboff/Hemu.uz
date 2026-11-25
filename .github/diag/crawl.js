// Lokal (runner) serverda yangi dizayn skrinshotlari
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:4799';
(async () => {
  const b = await chromium.launch();
  const login = await (await fetch(B + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: '+998901234567', password: 'Hemu2026' }) })).json();
  const ids = (await (await fetch(B + '/api/v1/listings?per_page=3')).json()).items.map((x) => x.id);
  const shots = [
    ['m-home', '/', 390, 2600, null], ['m-catalog', '/catalog', 390, 1700, null], ['m-filters', '/catalog#f', 390, 844, null],
    ['m-listing', '/listing/' + ids[0], 390, 1100, null], ['m-listing-in', '/listing/' + ids[0], 390, 844, login.token],
    ['m-create-guest', '/create', 390, 1300, null], ['d-catalog', '/catalog', 1366, 1300, null], ['d-listing', '/listing/' + ids[0], 1366, 1000, null], ['d-home', '/', 1366, 900, null],
  ];
  const errs = [];
  for (const [name, path, w, h, tok] of shots) {
    const mobile = w < 500;
    const ctx = await b.newContext({ viewport: { width: w, height: mobile ? 844 : 860 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(name + ': ' + e.message));
    await p.goto(B + '/');
    await p.evaluate((t) => { localStorage.setItem('mx_lang', 'uz'); if (t) localStorage.setItem('mx_token', t); }, tok);
    await p.goto(B + path.replace('#f', ''), { waitUntil: 'networkidle' });
    await p.waitForTimeout(900);
    if (path.endsWith('#f')) { await p.click('[data-ftoggle]'); await p.waitForTimeout(500); }
    if (!path.endsWith('#f') && h > 844) { await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(400); }
    const buf = await p.screenshot({ type: 'jpeg', quality: 62 });
    const b64 = buf.toString('base64');
    for (let i = 0; i < b64.length; i += 4000) console.log(`IMG ${name} ${i / 4000} ${b64.slice(i, i + 4000)}`);
    await ctx.close();
  }
  // Mehmon: formani to'ldirib, joylash -> kirish oynasi chiqadimi
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push('guest: ' + e.message));
  await p.goto(B + '/create', { waitUntil: 'networkidle' });
  await p.fill('input[name=title]', 'Sinov ekskavator JCB').catch((e) => errs.push('fill ' + e.message));
  await p.click('[data-add]').catch(() => {});
  await p.waitForTimeout(600);
  const modal = await p.evaluate(() => !!document.querySelector('.modal, [role=dialog]'));
  const saved = await p.evaluate(() => sessionStorage.getItem('mx_guest_listing'));
  console.log('GUEST modal=' + modal + ' saved=' + saved);
  console.log('ERRS ' + JSON.stringify(errs));
  await b.close();
})();
