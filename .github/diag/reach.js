// Saytning to'liq ochilishi (brauzerda) va turli mamlakatlardan yetib borishi
const { chromium, devices } = require('playwright');
const note = (s) => console.log(`::notice::${s}`);
(async () => {
  // 1) check-host.net: turli mamlakatlardagi tugunlardan HTTP so'rov
  try {
    const nodes = await (await fetch('https://check-host.net/nodes/hosts', { headers: { Accept: 'application/json' } })).json();
    const all = Object.entries(nodes.nodes || {});
    const pick = all.filter(([, v]) => ['UZ', 'KZ', 'RU', 'TR', 'DE', 'KG'].includes(v.location?.[0]?.toUpperCase?.() || v.location?.[0])).map(([k]) => k);
    note(`tugunlar: ${pick.length} (UZ: ${all.filter(([, v]) => String(v.location?.[0]).toUpperCase() === 'UZ').length})`);
    const q = pick.slice(0, 12).map((k) => `node=${k}`).join('&');
    const start = await (await fetch(`https://check-host.net/check-http?host=https://hemu.uz/&${q}`, { headers: { Accept: 'application/json' } })).json();
    await new Promise((r) => setTimeout(r, 15000));
    const res = await (await fetch(`https://check-host.net/check-result/${start.request_id}`, { headers: { Accept: 'application/json' } })).json();
    for (const [node, v] of Object.entries(res)) {
      const r = v?.[0];
      const loc = start.nodes?.[node] || [];
      note(`${loc[1] || ''} ${loc[2] || ''} (${node.split('.')[0]}): ${r ? `${r[0] ? 'OK' : 'XATO'} ${r[3] || ''} ${r[2] || ''} ${Number(r[1] || 0).toFixed(2)}s` : 'javob yo\'q'}`);
    }
  } catch (e) { note(`check-host: ${e.message}`); }
  // 2) Brauzerda to'liq ochilish (telefon)
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage();
  const bad = [];
  p.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url().replace('https://hemu.uz', '')}`); });
  p.on('pageerror', (e) => bad.push(`JS: ${e.message}`));
  p.on('requestfailed', (r) => bad.push(`FAIL ${r.url().replace('https://hemu.uz', '')} ${r.failure()?.errorText}`));
  const t0 = Date.now();
  await p.goto('https://hemu.uz/', { waitUntil: 'load', timeout: 45000 });
  await p.waitForTimeout(3000);
  note(`brauzer: ${((Date.now() - t0) / 1000).toFixed(1)}s, sarlavha: "${await p.title()}", e'lon kartalari: ${await p.locator('.card').count()}`);
  for (const path of ['/catalog', '/mechanic', '/sparepart', '/create']) {
    await p.goto(`https://hemu.uz${path}`, { waitUntil: 'load', timeout: 45000 }); await p.waitForTimeout(1500);
    note(`${path}: ${(await p.locator('main, #app').first().innerText()).replace(/\s+/g, ' ').slice(0, 70)}`);
  }
  note(`xatolar: ${bad.slice(0, 8).join(' | ') || "yo'q"}`);
  await p.goto('https://hemu.uz/'); await p.waitForTimeout(2000);
  await p.screenshot({ path: 'home.png' });
  await b.close();
})().catch((e) => { console.log(`::error::${e.message}`); process.exit(1); });
