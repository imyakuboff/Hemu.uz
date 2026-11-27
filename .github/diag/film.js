// hemu.uz ni telefon ko'rinishida kadrma-kadr yozib olish (30 fps), har sahna alohida papkaga
const { chromium } = require('playwright');
const fs = require('fs');
const B = 'https://hemu.uz';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'uz-UZ' });
  const p = await ctx.newPage();
  let dir, n;
  const scene = (name) => { dir = `film/${name}`; fs.mkdirSync(dir, { recursive: true }); n = 0; };
  const shot = async () => { await p.screenshot({ path: `${dir}/${String(n++).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 }); };
  const hold = async (k) => { for (let i = 0; i < k; i++) { await shot(); await p.waitForTimeout(25); } };
  const prep = async () => p.addStyleTag({ content: '.pwa-hint,.ios-hint,[data-install-bar],.push-card,.toast{display:none!important} ::-webkit-scrollbar{display:none} .tapdot{position:fixed;z-index:99999;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;background:rgba(255,198,26,.55);border:3px solid #FFC61A;pointer-events:none}' }).catch(() => {});
  const go = async (path) => { await p.goto(B + path, { waitUntil: 'networkidle' }); await prep(); await p.waitForTimeout(400); };
  const scroll = async (to, frames) => {
    const from = await p.evaluate(() => scrollY);
    for (let i = 1; i <= frames; i++) { const t = i / frames; const e = t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; await p.evaluate((y) => scrollTo(0, y), from + (to - from) * e); await shot(); }
  };
  const tap = async (sel) => {
    const el = p.locator(sel).first();
    await el.scrollIntoViewIfNeeded().catch(() => {});
    const bx = await el.boundingBox();
    if (!bx) { console.log('NOEL', sel); return; }
    const x = bx.x + bx.width / 2, y = bx.y + bx.height / 2;
    await p.evaluate(([x, y]) => { const d = document.createElement('div'); d.className = 'tapdot'; d.style.left = x + 'px'; d.style.top = y + 'px'; document.body.append(d); }, [x, y]);
    await hold(8);
    await el.click().catch((e) => console.log('CLICKFAIL', sel, e.message.slice(0, 80)));
    await p.evaluate(() => document.querySelectorAll('.tapdot').forEach((d) => d.remove()));
  };
  const type = async (sel, text) => {
    const el = p.locator(sel).first();
    await el.scrollIntoViewIfNeeded(); await el.click();
    for (const ch of text) { await el.type(ch); await shot(); await shot(); }
  };

  await go('/');
  await p.evaluate(() => { localStorage.setItem('mx_lang', 'uz'); localStorage.setItem('mx_sound', '0'); });
  const sel = async (s, v) => { const el = p.locator(s).first(); await el.scrollIntoViewIfNeeded(); await el.selectOption(v).catch(() => {}); await hold(10); };
  const fill = async (s, text) => { const el = p.locator(s).first(); if (!(await el.count())) { console.log('NOEL', s); return; } await el.scrollIntoViewIfNeeded(); await el.click(); await el.fill(''); for (const ch of text) { await el.type(ch); await shot(); await shot(); } await hold(6); };

  // V1: E'lon joylash — bosh sahifadan "+ Joylash", forma to'ldiriladi (joylanmaydi)
  await go('/'); scene('v1-elon'); await hold(18);
  await tap('.plus'); await p.waitForTimeout(900); await prep(); await hold(16);
  await scroll(330, 36);
  await fill('input[name=title]', 'JCB 3CX ekskavator-yuklagich, 2021');
  await fill('input[name=brand]', 'JCB');
  await fill('input[name=model]', '3CX');
  await fill('input[name=year]', '2021');
  await fill('input[name=price]', '950000000');
  await tap('[data-add]'); await p.waitForTimeout(500); await hold(42);

  // V2: Lizing — katalog -> e'lon -> kalkulyator, raqamlar o'zgartiriladi
  await go('/catalog'); scene('v2-lizing'); await hold(16); await scroll(380, 34); await hold(8);
  await tap('.grid .card a'); await p.waitForTimeout(900); await prep(); await hold(16);
  await scroll(520, 46); await hold(10);
  await tap('[data-leasing]'); await p.waitForTimeout(300); await hold(22);
  await fill('.modal input[name=down]', '30'); await hold(10);
  await fill('.modal input[name=term]', '24'); await hold(30);

  // V3: Qidiruv — qidirish, filtr, xarita
  await go('/'); scene('v3-qidiruv'); await hold(14);
  await fill('main form[data-search] input[name=q]', 'ekskavator');
  await tap('main form[data-search] button.btn'); await p.waitForTimeout(1000); await prep(); await hold(16);
  await scroll(500, 40); await hold(8); await scroll(0, 24);
  await tap('[data-ftoggle]'); await hold(30); await tap('.f-apply'); await p.waitForTimeout(900); await prep(); await hold(10);
  await go('/catalog?view=map'); await p.waitForTimeout(1500); await hold(45);

  // V4: Mexaniklar va haydovchilar
  await go('/mechanic'); scene('v4-ustalar-a'); await hold(16); await scroll(700, 60); await hold(10); await scroll(1400, 60); await hold(12);
  await go('/driver'); scene('v4-ustalar-b'); await hold(16); await scroll(700, 60); await hold(10); await scroll(1400, 60); await hold(12);

  // V5: Ilova sahifasi
  await go('/app'); scene('v5-ilova'); await hold(24); await scroll(600, 60); await hold(16); await scroll(1300, 70); await hold(20);
  await b.close();
  for (const d of fs.readdirSync('film')) console.log('SCENE', d, fs.readdirSync('film/' + d).length);
})();
