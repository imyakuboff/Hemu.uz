const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const p = await ctx.newPage();
  const res = [];
  p.on('response', async (r) => { try { const h = r.headers(); res.push({ u: r.url().replace('https://hemu.uz', '').slice(0, 80), s: r.status(), len: Number(h['content-length'] || (await r.body()).length), t: r.request().resourceType(), cache: h['cache-control'] || '' }); } catch {} });
  const t0 = Date.now();
  await p.goto('https://hemu.uz/', { waitUntil: 'networkidle' });
  const total = Date.now() - t0;
  const perf = await p.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; const lcp = new Promise((r) => new PerformanceObserver((l) => r(l.getEntries().at(-1)?.startTime)).observe({ type: 'largest-contentful-paint', buffered: true })); return Promise.race([lcp, new Promise((r) => setTimeout(() => r(null), 1500))]).then((l) => ({ ttfb: n.responseStart, dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd, lcp: l })); });
  console.log('ROW ' + JSON.stringify({ total, ...perf, n: res.length, kb: Math.round(res.reduce((a, r) => a + r.len, 0) / 1024) }));
  res.sort((a, b) => b.len - a.len).slice(0, 25).forEach((r) => console.log('ROW ' + JSON.stringify(r)));
  // listing sahifasi: h1 va sarlavha
  await p.goto('https://hemu.uz/listing/17', { waitUntil: 'networkidle' });
  console.log('ROW ' + JSON.stringify(await p.evaluate(() => ({ title: document.title, h1s: [...document.querySelectorAll('h1,h2')].slice(0, 4).map((h) => h.tagName + ':' + h.textContent.trim().slice(0, 60)) }))));
  // Haqiqiy 404 serverda
  const r404 = await ctx.request.get('https://hemu.uz/bu-sahifa-yoq-123');
  console.log('ROW ' + JSON.stringify({ soft404_status: r404.status() }));
  await b.close();
})();
