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
  // 1) Bosh sahifa
  await go('/'); scene('1-home'); await hold(24); await scroll(700, 70); await hold(10); await scroll(1500, 70); await hold(16);
  // 2) Katalog va filtrlar
  await go('/catalog'); scene('2-catalog'); await hold(20); await tap('[data-ftoggle]'); await hold(36);
  await tap('.f-apply'); await p.waitForTimeout(800); await prep(); await hold(14); await scroll(900, 80); await hold(14);
  // 3) E'lon sahifasi + lizing kalkulyatori
  await go('/listing/17'); scene('3-listing'); await hold(24); await scroll(520, 60); await hold(20);
  await tap('[data-leasing]'); await p.waitForTimeout(300); await hold(45);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300); await hold(10);
  // 4) E'lon joylash (kirishsiz) — joylanmaydi, faqat forma to'ldiriladi
  await go('/create'); scene('4-create'); await hold(20);
  await scroll(330, 40);
  await type('input[name=title]', 'JCB 3CX ekskavator, 2021');
  await hold(10);
  const pr = p.locator('input[name=price]').first(); await pr.scrollIntoViewIfNeeded(); await p.evaluate(() => scrollBy(0, 160)); await hold(8);
  await type('input[name=price]', '950000000');
  await hold(12);
  await tap('[data-add]'); await p.waitForTimeout(400); await hold(40);
  await b.close();
  for (const d of fs.readdirSync('film')) console.log('SCENE', d, fs.readdirSync('film/' + d).length);
})();
