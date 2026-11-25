// Jonli saytni haqiqiy brauzerda tekshirish: konsol xatolari, 4xx/5xx so'rovlar, gorizontal siljish, buzuq rasmlar
const { chromium } = require('playwright');
const BASE = 'https://hemu.uz';
const PAGES = ['/', '/catalog', '/listings', '/listing/17', '/listing/25', '/transportsale', '/transportrental', '/sparepart', '/mechanic', '/driver',
  '/requests', '/requests/1', '/request/new', '/create', '/plans', '/prices', '/sellers', '/compare', '/app', '/contact', '/resume', '/verified',
  '/company/8', '/company/9', '/search?q=xgma', '/catalog?q=ekskavator', '/favorites', '/messages', '/profile', '/dashboard', '/nonexistent-page-xyz',
  '/?lang=ru', '/?lang=en', '/?lang=kk'];
(async () => {
  const b = await chromium.launch();
  const out = [];
  for (const vp of [{ name: 'mobil', width: 390, height: 844, isMobile: true }, { name: 'desktop', width: 1366, height: 860, isMobile: false }]) {
    const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, locale: 'uz-UZ' });
    for (const path of PAGES) {
      const p = await ctx.newPage();
      const errs = []; const bad = [];
      p.on('pageerror', (e) => errs.push('JS: ' + e.message.slice(0, 160)));
      p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
      p.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('/nonexistent')) bad.push(r.status() + ' ' + r.url().replace(BASE, '').slice(0, 90)); });
      p.on('requestfailed', (r) => bad.push('FAIL ' + r.url().replace(BASE, '').slice(0, 90) + ' ' + (r.failure()?.errorText || '')));
      const t0 = Date.now();
      let status = 0;
      try { const r = await p.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30000 }); status = r?.status() || 0; } catch (e) { errs.push('goto: ' + e.message.slice(0, 100)); }
      const ms = Date.now() - t0;
      await p.waitForTimeout(500);
      const info = await p.evaluate(() => ({
        title: document.title.slice(0, 70),
        h1: (document.querySelector('main h1, h1')?.textContent || '').trim().slice(0, 60),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        brokenImgs: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src).map((i) => i.src.replace(location.origin, '').slice(0, 70)).slice(0, 4),
        wideEls: [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 2).slice(0, 3).map((e) => e.tagName.toLowerCase() + '.' + [...e.classList].join('.')),
        emptyMain: (document.querySelector('main')?.innerText || '').trim().length < 30,
        untranslated: (document.body.innerText.match(/\b[a-z]+_[a-z_]+\b/g) || []).filter((w) => w.length > 6).slice(0, 5),
        lang: document.documentElement.lang,
      })).catch((e) => ({ err: e.message }));
      out.push({ vp: vp.name, path, status, ms, ...info, errs: [...new Set(errs)].slice(0, 5), bad: [...new Set(bad)].slice(0, 6) });
      await p.close();
    }
    await ctx.close();
  }
  // texnik fayllar
  const ctx = await b.newContext();
  for (const f of ['/robots.txt', '/sitemap.xml', '/manifest.webmanifest', '/sw.js', '/api/v1/health', '/api/v1/categories', '/.env', '/api/v1/admin/overview']) {
    const r = await ctx.request.get(BASE + f);
    out.push({ vp: 'fayl', path: f, status: r.status(), size: (await r.body()).length, ct: r.headers()['content-type'] });
  }
  const h = (await ctx.request.get(BASE + '/')).headers();
  out.push({ vp: 'headers', csp: !!h['content-security-policy'], hsts: h['strict-transport-security'] || null, xfo: h['x-frame-options'] || null, server: h.server, cache: h['cache-control'] });
  await b.close();
  for (const o of out) console.log('ROW ' + JSON.stringify(o));
})();
