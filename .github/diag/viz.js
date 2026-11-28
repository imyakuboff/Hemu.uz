const { chromium, devices } = require('playwright');
const note = (s) => console.log(`::notice::${s}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  // 1) check-host.net: turli mamlakatlardan
  try {
    const st = await (await fetch('https://check-host.net/check-http?host=https://hemu.uz/&max_nodes=40', { headers: { Accept: 'application/json' } })).json();
    const nodes = st.nodes || {};
    note('tugunlar: ' + Object.values(nodes).map((v) => v[0]).join(','));
    await sleep(20000);
    const res = await (await fetch(`https://check-host.net/check-result/${st.request_id}`, { headers: { Accept: 'application/json' } })).json();
    const rows = Object.entries(res).map(([k, v]) => { const n = nodes[k] || []; const r = v?.[0]; return `${n[0]}/${n[2] || ''}: ${r ? (r[0] ? `OK ${r[3]} ${Number(r[1]).toFixed(1)}s` : `XATO ${r[2] || r[3] || ''}`) : 'kutilmoqda'}`; });
    note('natija: ' + rows.join(' | '));
  } catch (e) { note('check-host: ' + e.message); }
  // 2) Turk brauzeri (tr-TR, Istanbul), toza holat
  const b = await chromium.launch();
  for (const [name, opts] of [['turk-telefon', { ...devices['Pixel 7'], locale: 'tr-TR', timezoneId: 'Europe/Istanbul' }], ['turk-kompyuter', { viewport: { width: 1366, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' }]]) {
    const ctx = await b.newContext(opts);
    const p = await ctx.newPage();
    const errs = []; const bad = [];
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url().replace('https://hemu.uz', '')}`); });
    await p.goto('https://hemu.uz/', { waitUntil: 'load' }); await sleep(3000);
    const ls = await p.evaluate(() => JSON.stringify({ lang: localStorage.getItem('mx_lang'), country: localStorage.getItem('mx_country'), cur: localStorage.getItem('mx_currency') }));
    note(`${name} bosh sahifa: kartalar=${await p.locator('.card').count()} til=${await p.evaluate(() => document.documentElement.lang)} storage=${ls}`);
    await p.screenshot({ path: `${name}-home.png`, fullPage: false });
    await p.goto('https://hemu.uz/catalog', { waitUntil: 'load' }); await sleep(3000);
    note(`${name} katalog: kartalar=${await p.locator('.card').count()} sarlavha="${await p.locator('.results-head h2').first().innerText().catch(() => '?')}"`);
    await p.screenshot({ path: `${name}-catalog.png`, fullPage: false });
    note(`${name} xatolar: ${[...errs, ...bad].slice(0, 6).join(' | ') || "yo'q"}`);
    await ctx.close();
  }
  await b.close();
})().catch((e) => { console.log(`::error::${e.message}`); process.exit(1); });
