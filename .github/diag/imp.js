// Import sahifasini tekshirish: (1) prod'dagi JS yangimi, (2) main kodini lokal ishga tushirib, sahifani ochib fayl yuklash
const { chromium, devices } = require('playwright');
const fs = require('fs');
const note = (s) => console.log(`::notice::${s}`);
(async () => {
  for (const u of ['https://hemu.uz/sw.js', 'https://hemu.uz/js/pages/extra.js']) {
    try { const t = await (await fetch(u)).text(); note(`${u}: ${(t.match(/mxg-v\d+/) || [''])[0]} imp_kind=${t.includes('imp_kind')}`); } catch (e) { note(`${u}: ${e.message}`); }
  }
  const base = 'http://127.0.0.1:4799';
  const lr = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '+998901234567', password: 'Hemu2026' }) });
  const { token } = await lr.json();
  note(`login: ${lr.status}`);
  const b = await chromium.launch();
  fs.mkdirSync('shots', { recursive: true });
  for (const [name, opts] of [['mobil', devices['iPhone 13']], ['desktop', { viewport: { width: 1280, height: 900 } }]]) {
    const ctx = await b.newContext({ ...opts, locale: 'uz' });
    await ctx.addInitScript((tk) => { localStorage.setItem('mx_token', tk); localStorage.setItem('mx_lang', 'uz'); }, token);
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    for (const path of ['/my/listings', '/dashboard', '/create', '/my/import']) {
      await p.goto(base + path, { waitUntil: 'load' });
      await p.waitForTimeout(2500);
      await p.screenshot({ path: `shots/${name}-${path.replace(/\//g, '_')}.png`, fullPage: true });
    }
    if (name === 'mobil') {
      await p.setInputFiles('input[name=file]', ['.github/diag/t1.xlsx', '.github/diag/t2.docx']);
      await p.selectOption('select[name=kind]', 'parts');
      await p.click('[data-imp] button.btn-primary');
      await p.waitForTimeout(8000);
      await p.screenshot({ path: `shots/${name}-natija.png`, fullPage: true });
      note(`natija: ${(await p.textContent('[data-res]')).replace(/\s+/g, ' ').slice(0, 400)}`);
    }
    note(`${name} xatolar: ${errs.slice(0, 5).join(' | ') || 'yo\'q'}`);
    await ctx.close();
  }
  await b.close();
})().catch((e) => { console.log(`::error::${e.stack}`); process.exit(1); });
