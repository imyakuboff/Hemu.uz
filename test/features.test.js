const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hemu-feat-'));
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(tmp, 'test.db');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.OTP_DEV_ECHO = '1';
process.env.PAYMENTS_DEV = '1';
process.env.CLICK_SERVICE_ID = '111';
process.env.CLICK_MERCHANT_ID = '222';
process.env.CLICK_SECRET_KEY = 'click-secret';
process.env.PAYME_MERCHANT_ID = 'pm-merchant';
process.env.PAYME_KEY = 'payme-key';
process.env.FREE_LISTING_LIMIT = '1';

const db = require('../src/db');
const { seed } = require('../seed');
const { boot } = require('../src/server');

let server;
let base;
const S = {};
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function api(method, url, { token, body, lang = 'ru', currency, form, headers = {} } = {}) {
  const h = { 'X-Lang': lang, ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (currency) h['X-Currency'] = currency;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(base + url, { method, headers: h, body: payload });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json, headers: res.headers };
}

async function login(phone) {
  const r1 = await api('POST', '/api/v1/auth/otp/request', { body: { phone } });
  const r2 = await api('POST', '/api/v1/auth/otp/verify', { body: { phone, code: r1.body.dev_code, name: 'Test' } });
  return r2.body;
}

before(async () => {
  seed(process.env.DB_FILE);
  db.close();
  const app = boot(process.env.DB_FILE);
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  S.seller = await login('+998901234567');
  S.buyer = await login('+998907654321');
  S.admin = await login('+998900000001');
  S.kz = await login('+77015550011');
});

after(() => {
  server.close();
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("reklama: VIP/GOLD/PREMIUM, sinov to'lovi, VIP birinchi o'rinda, tarif krediti", async () => {
  const pk = await api('GET', '/api/v1/promo/packages', { token: S.seller.token, currency: 'UZS' });
  // Kompaniya: 3 ta biznes darajasi + 3 ta TOP paketi
  assert.equal(pk.body.is_company, true);
  assert.deepEqual(pk.body.items.map((x) => x.id), ['vip', 'gold', 'premium', 'top', 'highlight', 'combo']);
  assert.equal(pk.body.items[0].place, 'Карусель №1 на главной и самые верхние места в поиске');
  assert.ok(pk.body.providers.some((p) => p.id === 'click') && pk.body.providers.some((p) => p.id === 'payme'));
  const mine = await api('GET', '/api/v1/my/listings?status=active', { token: S.seller.token });
  const target = mine.body.items.find((x) => !x.promoted && !x.tier);
  const p = await api('POST', `/api/v1/listings/${target.id}/promote`, { token: S.seller.token, body: { package: 'vip', provider: 'dev' }, currency: 'USD' });
  assert.equal(p.status, 201);
  assert.equal(p.body.amount, 15);
  assert.equal((await api('POST', `/api/v1/payments/${p.body.id}/dev-confirm`, { token: S.buyer.token })).status, 403);
  const ok = await api('POST', `/api/v1/payments/${p.body.id}/dev-confirm`, { token: S.seller.token });
  assert.equal(ok.body.status, 'paid');
  const list = await api('GET', '/api/v1/listings');
  assert.equal(list.body.items[0].id, target.id, "VIP e'lon eng yuqorida");
  assert.equal(list.body.items[0].tier, 'vip');
  const home = await api('GET', '/api/v1/home');
  assert.ok(home.body.tiers.vip.some((x) => x.id === target.id), 'VIP karuselida');
  // Biznes tarif krediti
  const other = mine.body.items.find((x) => x.id !== target.id && !x.promoted && !x.tier);
  assert.equal((await api('POST', `/api/v1/listings/${other.id}/promote`, { token: S.seller.token, body: { package: 'vip', provider: 'credit' } })).status, 402);
  const c = await api('POST', `/api/v1/listings/${other.id}/promote`, { token: S.seller.token, body: { package: 'premium', provider: 'credit' } });
  assert.equal(c.body.status, 'paid');
  const n = await api('GET', '/api/v1/notifications', { token: S.seller.token });
  assert.ok(n.body.items.some((x) => x.text.startsWith('Оплата получена: Продвижение объявления')));
});

test('tariflar: bepul chegara (1) va Biznes obunasi', async () => {
  const plans = await api('GET', '/api/v1/plans', { token: S.kz.token });
  assert.equal(plans.body.current.plan, 'free');
  assert.equal(plans.body.current.listings_limit, 1);
  const mk = async (title) => {
    const c = await api('POST', '/api/v1/listings', { token: S.kz.token, body: { deal_type: 'sale', category: 'special', subcategory: 'loaders', title, description: 'Погрузчик в хорошем состоянии, документы есть.', price: 10000, currency: 'USD', region: 'almaty-city', city: 'Алматы' } });
    const fd = new FormData();
    fd.append('files', new Blob([PNG], { type: 'image/png' }), 'a.png');
    await api('POST', `/api/v1/listings/${c.body.id}/photos`, { token: S.kz.token, form: fd });
    return c.body.id;
  };
  const a = await mk('Погрузчик SDLG 936');
  assert.equal((await api('POST', `/api/v1/listings/${a}/publish`, { token: S.kz.token })).body.status, 'moderation');
  const b = await mk('Погрузчик XCMG 500');
  const lim = await api('POST', `/api/v1/listings/${b}/publish`, { token: S.kz.token });
  assert.equal(lim.status, 402);
  assert.equal(lim.body.error.code, 'plan_limit');
  const sub = await api('POST', '/api/v1/plans/subscribe', { token: S.kz.token, body: { plan: 'business', provider: 'dev', months: 2 }, currency: 'KZT' });
  assert.equal(sub.body.currency, 'KZT');
  await api('POST', `/api/v1/payments/${sub.body.id}/dev-confirm`, { token: S.kz.token });
  const me = await api('GET', '/api/v1/me', { token: S.kz.token });
  assert.equal(me.body.plan.plan, 'business');
  assert.equal(me.body.plan.top_credits, 6);
  assert.equal((await api('POST', `/api/v1/listings/${b}/publish`, { token: S.kz.token })).body.status, 'moderation');
  S.kzListing = a;
});

test('Click SHOP API: imzo, prepare, complete', async () => {
  const p = await api('POST', '/api/v1/plans/subscribe', { token: S.buyer.token, body: { plan: 'business', provider: 'click' } });
  assert.equal(p.body.currency, 'UZS');
  assert.match(p.body.pay_url, /^https:\/\/my\.click\.uz\/services\/pay\?service_id=111&merchant_id=222/);
  const amount = p.body.amount.toFixed(2);
  const sign = (o, prep = '') => crypto.createHash('md5').update(`${o.click_trans_id}${o.service_id}click-secret${o.merchant_trans_id}${prep}${o.amount}${o.action}${o.sign_time}`).digest('hex');
  const prep = { click_trans_id: '9001', service_id: '111', click_paydoc_id: '1', merchant_trans_id: String(p.body.id), amount, action: '0', error: '0', error_note: 'Success', sign_time: '2026-10-12 10:00:00' };
  const bad = await fetch(`${base}/api/v1/pay/click/prepare`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...prep, sign_string: 'x' }) }).then((r) => r.json());
  assert.equal(bad.error, -1);
  const r1 = await fetch(`${base}/api/v1/pay/click/prepare`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...prep, sign_string: sign(prep) }) }).then((r) => r.json());
  assert.equal(r1.error, 0);
  const comp = { ...prep, action: '1', merchant_prepare_id: String(r1.merchant_prepare_id) };
  const r2 = await fetch(`${base}/api/v1/pay/click/complete`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...comp, sign_string: sign(comp, comp.merchant_prepare_id) }) }).then((r) => r.json());
  assert.equal(r2.error, 0);
  assert.equal((await api('GET', `/api/v1/payments/${p.body.id}`, { token: S.buyer.token })).body.status, 'paid');
  const again = await fetch(`${base}/api/v1/pay/click/complete`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...comp, sign_string: sign(comp, comp.merchant_prepare_id) }) }).then((r) => r.json());
  assert.equal(again.error, -4);
});

test('Payme Merchant API: Check → Create → Perform → CheckTransaction', async () => {
  const p = await api('POST', '/api/v1/inspection/price', { token: S.buyer.token });
  const insp = await api('POST', '/api/v1/listings/1/inspections', { token: S.buyer.token, body: { provider: 'payme', note: 'Проверить гидравлику' } });
  assert.equal(insp.status, 201, JSON.stringify(insp.body));
  assert.match(insp.body.pay_url, /^https:\/\/checkout\.paycom\.uz\//);
  const decoded = Buffer.from(insp.body.pay_url.split('/').pop(), 'base64').toString();
  assert.match(decoded, new RegExp(`ac.payment_id=${insp.body.id};a=${Math.round(insp.body.amount * 100)}`));
  const rpc = (method, params, key = 'payme-key') => fetch(`${base}/api/v1/pay/payme`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from(`Paycom:${key}`).toString('base64')}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }).then((r) => r.json());
  const tiyin = Math.round(insp.body.amount * 100);
  assert.equal((await rpc('CheckPerformTransaction', { amount: tiyin, account: { payment_id: String(insp.body.id) } }, 'wrong')).error.code, -32504);
  assert.equal((await rpc('CheckPerformTransaction', { amount: tiyin + 1, account: { payment_id: String(insp.body.id) } })).error.code, -31001);
  assert.equal((await rpc('CheckPerformTransaction', { amount: tiyin, account: { payment_id: String(insp.body.id) } })).result.allow, true);
  const now = Date.now();
  const c = await rpc('CreateTransaction', { id: 'pm-tx-1', time: now, amount: tiyin, account: { payment_id: String(insp.body.id) } });
  assert.equal(c.result.state, 1);
  assert.equal((await rpc('CreateTransaction', { id: 'pm-tx-2', time: now, amount: tiyin, account: { payment_id: String(insp.body.id) } })).error.code, -31050);
  const pf = await rpc('PerformTransaction', { id: 'pm-tx-1' });
  assert.equal(pf.result.state, 2);
  assert.equal((await rpc('CheckTransaction', { id: 'pm-tx-1' })).result.state, 2);
  assert.equal((await rpc('CancelTransaction', { id: 'pm-tx-1', reason: 5 })).error.code, -31007);
  const my = await api('GET', '/api/v1/my/inspections', { token: S.buyer.token });
  assert.equal(my.body[0].status, 'paid');
  // Admin hisobot yuklaydi
  const fd = new FormData();
  fd.append('status', 'done');
  fd.append('inspector', 'Ахмед Каримов');
  fd.append('verdict', 'good');
  fd.append('report', 'Гидравлика без течей, двигатель в норме.');
  fd.append('files', new Blob([PNG], { type: 'image/png' }), 'r.png');
  const done = await api('POST', `/api/v1/admin/inspections/${my.body[0].id}`, { token: S.admin.token, form: fd });
  assert.equal(done.body.status, 'done');
  assert.equal(done.body.report_files.length, 1);
  const n = await api('GET', '/api/v1/notifications', { token: S.buyer.token });
  assert.ok(n.body.items.some((x) => x.text.includes('Отчёт готов')));
  assert.ok(p.status === 404 || p.status === 200);
});

test("xavfsiz bitim: to'lovsiz tasdiqlab bo'lmaydi, nizo, admin qarori", async () => {
  const o = await api('POST', '/api/v1/orders', { token: S.buyer.token, body: { listing_id: 2, qty: 1, delivery_method: 'pickup', escrow: true } });
  assert.equal(o.status, 201);
  assert.equal(o.body.escrow.status, 'unpaid');
  assert.ok(o.body.escrow.fee > 0);
  assert.deepEqual(o.body.actions, ['pay', 'cancel']);
  const conf = await api('POST', `/api/v1/orders/${o.body.id}/confirm`, { token: S.seller.token });
  assert.equal(conf.status, 409);
  const p = await api('POST', `/api/v1/orders/${o.body.id}/escrow/pay`, { token: S.buyer.token, body: { provider: 'dev' } });
  assert.equal(p.body.amount, o.body.total + o.body.escrow.fee);
  await api('POST', `/api/v1/payments/${p.body.id}/dev-confirm`, { token: S.buyer.token });
  const held = await api('GET', `/api/v1/orders/${o.body.id}`, { token: S.seller.token });
  assert.equal(held.body.escrow.status, 'held');
  assert.ok(held.body.actions.includes('confirm') && held.body.actions.includes('dispute'));
  await api('POST', `/api/v1/orders/${o.body.id}/confirm`, { token: S.seller.token });
  const d = await api('POST', `/api/v1/orders/${o.body.id}/dispute`, { token: S.buyer.token, body: { reason: 'Продавец не отвечает уже 3 дня' } });
  assert.equal(d.body.escrow_status, 'disputed');
  const list = await api('GET', '/api/v1/admin/disputes', { token: S.admin.token });
  assert.equal(list.body.length, 1);
  const res = await api('POST', `/api/v1/admin/disputes/${list.body[0].id}/resolve`, { token: S.admin.token, body: { resolution: 'refund', note: 'Возврат' } });
  assert.equal(res.body.escrow_status, 'refunded');
  const fin = await api('GET', `/api/v1/orders/${o.body.id}`, { token: S.buyer.token });
  assert.equal(fin.body.status, 'cancelled');
  assert.equal((await api('GET', '/api/v1/listings/2')).body.facts.stock_qty, 12, 'zaxira qaytdi');
});

test("shikoyat, seriya raqami tekshiruvi (qidiruvdagi texnika)", async () => {
  const hy = db.get("SELECT id FROM listings WHERE title = 'Гусеничный экскаватор Hyundai R220'").id;
  const r = await api('POST', `/api/v1/listings/${hy}/report`, { token: S.buyer.token, body: { reason: 'fake', comment: 'Фото из интернета' } });
  assert.equal(r.status, 201);
  assert.equal((await api('POST', '/api/v1/listings/1/report', { token: S.seller.token, body: { reason: 'fake' } })).status, 409);
  const q = await api('GET', '/api/v1/admin/reports', { token: S.admin.token });
  assert.equal(q.body[0].reason, 'fake');
  const ok = await api('POST', `/api/v1/admin/reports/${q.body[0].id}/resolve`, { token: S.admin.token, body: { reason: 'Фото не соответствуют' } });
  assert.equal(ok.body.status, 'resolved');
  assert.equal((await api('GET', `/api/v1/listings/${hy}`)).status, 404, "e'lon katalogdan olindi");
  const s1 = await api('GET', '/api/v1/listings/1/serial-check');
  assert.equal(s1.body.ok, true);
  await api('PATCH', '/api/v1/listings/5', { token: S.seller.token, body: { serial_number: 'CAT-320D-0WANTED1' } });
  const s2 = await api('GET', '/api/v1/listings/5/serial-check');
  assert.equal(s2.body.wanted, true);
  assert.equal(s2.body.ok, false);
  const d = await api('GET', '/api/v1/listings/1');
  assert.equal(d.body.serial.checked, true);
});

test('ijara: bandlik, narx hisobi, band kunlarga bron qilib bo\'lmaydi, tasdiqlash', async () => {
  const crane = (await api('GET', '/api/v1/listings?deal_type=rent&country=KZ')).body.items[0];
  const av = await api('GET', `/api/v1/listings/${crane.id}/availability`);
  assert.equal(av.body.busy.length, 3);
  assert.equal(av.body.blocked.length, 2);
  const d = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const q = await api('POST', `/api/v1/listings/${crane.id}/bookings/quote`, { body: { start_date: d(20), end_date: d(21), hours_per_day: 10 }, lang: 'ru' });
  assert.equal(q.body.total, 18000 * 2 * 10);
  assert.equal(q.body.available, true);
  const busy = await api('POST', `/api/v1/listings/${crane.id}/bookings`, { token: S.buyer.token, body: { start_date: d(4), end_date: d(6) } });
  assert.equal(busy.status, 409);
  assert.equal(busy.body.error.code, 'dates_busy');
  const b = await api('POST', `/api/v1/listings/${crane.id}/bookings`, { token: S.buyer.token, body: { start_date: d(20), end_date: d(21), hours_per_day: 10, note: 'Монтаж' } });
  assert.equal(b.status, 201);
  assert.equal(b.body.status, 'pending');
  const seller = await login('+77011234567');
  const sb = await api('GET', '/api/v1/my/bookings?role=seller', { token: seller.token });
  assert.ok(sb.body.length >= 2);
  const c = await api('POST', `/api/v1/bookings/${b.body.id}/confirm`, { token: seller.token });
  assert.equal(c.body.status, 'confirmed');
  assert.ok(c.body.with.phone);
  const av2 = await api('GET', `/api/v1/listings/${crane.id}/availability`);
  assert.equal(av2.body.busy.length, 5);
});

test("xaritada qidiruv, narx tarixi, solishtirish", async () => {
  const near = await api('GET', '/api/v1/listings?near=41.31,69.28&radius_km=60&sort=distance');
  assert.ok(near.body.total >= 5);
  assert.ok(near.body.items.every((x) => x.location.country === 'UZ'));
  assert.ok(near.body.items[0].distance_km <= near.body.items.at(-1).distance_km);
  const far = await api('GET', '/api/v1/listings?near=43.24,76.95&radius_km=50');
  assert.ok(far.body.items.every((x) => x.location.country === 'KZ'));
  const h = await api('GET', '/api/v1/listings/1/price-history');
  assert.equal(h.body.length, 3);
  assert.ok(h.body[0].price > h.body[2].price);
  const ids = db.all("SELECT id FROM listings WHERE status = 'active' AND kind = 'equipment' ORDER BY id LIMIT 3").map((x) => x.id);
  const cmp = await api('GET', `/api/v1/compare?ids=${ids.join(',')}`);
  assert.equal(cmp.body.length, 3);
});

test('avtojavob, shablonlar, CSV import, statistika, Telegram', async () => {
  const conv = await api('POST', '/api/v1/conversations', { token: S.kz.token, body: { listing_id: 2, body: 'Есть в наличии?' } });
  const msgs = await api('GET', `/api/v1/conversations/${conv.body.id}/messages`, { token: S.kz.token });
  assert.equal(msgs.body.items.length, 2);
  assert.match(msgs.body.items[1].body, /Спасибо за обращение в ТехноПарк/);
  await api('POST', `/api/v1/conversations/${conv.body.id}/messages`, { token: S.kz.token, body: { body: 'Ещё вопрос' } });
  assert.equal((await api('GET', `/api/v1/conversations/${conv.body.id}/messages`, { token: S.kz.token })).body.items.length, 3, 'avtojavob bir marta');
  const tpl = await api('GET', '/api/v1/me/templates', { token: S.seller.token });
  assert.equal(tpl.body.length, 3);

  const tplCsv = await fetch(`${base}/api/v1/my/listings/import/template?format=csv`, { headers: { Authorization: `Bearer ${S.seller.token}` } });
  assert.match(await tplCsv.text(), /deal_type,category,subcategory,title/);
  const csv = 'deal_type;category;subcategory;title;description;price;currency;condition;brand;stock_qty;region;city\n'
    + 'sale;parts;filters;Фильтр воздушный JCB 32/917804;Оригинальный воздушный фильтр JCB, в наличии;410000;UZS;new;JCB;7;tashkent;Ташкент\n'
    + 'sale;parts;nope;Плохая строка;Описание достаточно длинное;1;UZS;new;JCB;1;tashkent;Ташкент\n';
  const fd = new FormData();
  fd.append('file', new Blob([csv], { type: 'text/csv' }), 'import.csv');
  const imp = await api('POST', '/api/v1/my/listings/import', { token: S.seller.token, form: fd });
  assert.equal(imp.body.total, 2);
  assert.equal(imp.body.created, 1);
  assert.equal(imp.body.results[1].ok, false);

  const an = await api('GET', '/api/v1/seller/analytics?days=30', { token: S.seller.token });
  assert.equal(an.body.funnel[0].key, 'views');
  assert.ok(an.body.funnel[0].value > 100);
  await api('GET', '/api/v1/listings/3', { token: S.buyer.token, headers: { 'X-View-Source': 'search' } });
  const an2 = await api('GET', '/api/v1/seller/analytics', { token: S.seller.token });
  assert.ok(an2.body.sources.some((s) => s.source === 'search'));

  const tg = await api('GET', '/api/v1/me/telegram', { token: S.seller.token });
  assert.equal(tg.body.enabled, false);
  assert.equal((await api('POST', '/api/v1/me/telegram/link', { token: S.seller.token })).status, 503);
});

test('SEO: sahifa meta, JSON-LD, sitemap, robots', async () => {
  const html = await (await fetch(`${base}/listing/1`)).text();
  assert.match(html, /<title>Экскаватор-погрузчик JCB 3CX — /);
  assert.match(html, /"@type":"Product"/);
  assert.match(html, /og:image" content="[^"]*\/img\/demo\/jcb\.jpg"/);
  const cat = await (await fetch(`${base}/catalog?category=special`, { headers: { 'Accept-Language': 'ru' } })).text();
  assert.match(cat, /<title>Спецтехника — купить и арендовать/);
  // Sayt xaritasi: indeks + har til uchun alohida fayl
  const idx = await (await fetch(`${base}/sitemap.xml`)).text();
  assert.match(idx, /<sitemapindex/);
  assert.match(idx, /sitemap-uz\.xml/);
  const sm = await (await fetch(`${base}/sitemap-main.xml`)).text();
  assert.match(sm, /<loc>[^<]*\/listing\/1<\/loc>/);
  assert.match(await (await fetch(`${base}/sitemap-uz.xml`)).text(), /\/listing\/1\?lang=uz<\/loc>/);
  // 10 tilli sahifa: hreflang, til bo'yicha sarlavha va serverda chizilgan matn
  const uz = await (await fetch(`${base}/catalog?category=special&lang=uz`)).text();
  assert.match(uz, /<html lang="uz"/);
  assert.match(uz, /hreflang="kk" href="[^"]*catalog\?category=special&amp;lang=kk"/);
  assert.match(uz, /hreflang="x-default"/);
  assert.match(uz, /sotib olish va ijaraga olish/);
  assert.match(uz, /<main class="page seo-ssr">[\s\S]*\/listing\/\d+\?lang=uz/);
  const pr = await (await fetch(`${base}/prices?category=special&lang=ru`)).text();
  assert.match(pr, /<title>Цены на /);
  assert.match(pr, /<table class="seo-table">/);
  assert.match(await (await fetch(`${base}/robots.txt`)).text(), /Disallow: \/api\//);
});

test("ulashish: havola orqali 5 noyob tashrif — e'lon bepul TOPga chiqadi", async () => {
  const id = db.get(`SELECT id FROM listings WHERE status = 'active' AND user_id = (SELECT id FROM users WHERE phone = '+998901234567') ORDER BY id LIMIT 1`).id;
  const visit = (ua, extra = {}) => api('GET', `/api/v1/listings/${id}`, { headers: { 'User-Agent': ua, 'X-Share-Channel': 'telegram' }, ...extra });
  // Egasi va botlar hisoblanmaydi
  await visit('Mozilla/5.0 owner', { token: S.seller.token });
  await visit('TelegramBot (like TwitterBot)');
  for (let i = 0; i < 4; i++) await visit(`Mozilla/5.0 visitor-${i}`);
  await visit('Mozilla/5.0 visitor-0'); // takror — hisoblanmaydi
  let mine = await api('GET', `/api/v1/listings/${id}`, { token: S.seller.token });
  assert.equal(mine.body.share.count, 4);
  assert.equal(mine.body.share.to_next, 1);
  assert.equal(mine.body.share.top_until, null);
  await visit('Mozilla/5.0 visitor-4');
  mine = await api('GET', `/api/v1/listings/${id}`, { token: S.seller.token });
  assert.equal(mine.body.share.count, 5);
  assert.ok(mine.body.share.top_until, 'ulashish TOPi berilishi kerak');
  // Ro'yxatda belgisi bor; "Ko'p ulashilgan" saralashida birinchi
  const list = await api('GET', '/api/v1/listings?sort=shared');
  assert.equal(list.body.items[0].id, id);
  assert.equal(list.body.items[0].share_top, true);
  const n = await api('GET', '/api/v1/notifications', { token: S.seller.token });
  assert.ok(JSON.stringify(n.body).includes('share_top'));
});

test("tasdiq belgisi: guvohnoma YaTT/MChJ uchun majburiy, oylik obuna bilan galochka", async () => {
  // Ro'yxatdan o'tish shakllari: YaTT va MChJ — guvohnoma majburiy, XK/AJ — ixtiyoriy
  const sp = (await api('GET', '/api/v1/legal-forms?country=UZ')).body;
  const req = Object.fromEntries(sp.forms.map((f) => [f.code, f.docs.find((d) => d.type === 'reg_cert')?.required]));
  assert.equal(req.yatt, true);
  assert.equal(req.mchj, true);
  assert.equal(req.xk, false);
  assert.equal(req.aj, false);
  // Narx: oyiga 15$, to'lov admin orqali
  const b = await api('GET', '/api/v1/badge', { token: S.buyer.token, currency: 'USD' });
  assert.equal(b.body.price.amount, 15);
  assert.equal(b.body.status.active, false);
  assert.deepEqual(b.body.providers.map((x) => x.id), ['admin']);
  // Xaridor (kompaniyasiz) e'lon joylaydi — avval belgisiz
  const uid = db.get(`SELECT id FROM users WHERE phone = '+998907654321'`).id;
  const L = require('../src/lib/listings');
  assert.equal(L.hasPaidBadge(uid), false);
  const config = require('../src/config');
  config.manualPay.card = '8600 1234 5678 9012';
  config.manualPay.holder = 'HEMU ADMIN';
  // Rad etiladigan so'rov
  const p0 = await api('POST', '/api/v1/badge/subscribe', { token: S.buyer.token, body: { months: 1 }, currency: 'USD' });
  assert.equal(p0.status, 201);
  assert.equal(p0.body.status, 'pending');
  assert.equal(p0.body.provider, 'admin');
  const v0 = await api('GET', `/api/v1/payments/${p0.body.id}`, { token: S.buyer.token });
  assert.equal(v0.body.manual.card, '8600 1234 5678 9012');
  assert.equal(v0.body.manual.claimed_at, null);
  // Sinov "To'lash" tugmasi admin to'lovida ishlamaydi
  assert.equal((await api('POST', `/api/v1/payments/${p0.body.id}/dev-confirm`, { token: S.buyer.token })).status, 403);
  // Boshqa foydalanuvchi "To'ladim" bosa olmaydi
  assert.equal((await api('POST', `/api/v1/payments/${p0.body.id}/claim`, { token: S.seller.token, body: {} })).status, 403);
  assert.equal((await api('POST', `/api/v1/payments/${p0.body.id}/claim`, { token: S.buyer.token, body: { note: 'chek 111' } })).status, 200);
  const adminId = db.get(`SELECT id FROM users WHERE phone = '+998900000001'`).id;
  assert.ok(db.get(`SELECT 1 FROM notifications WHERE user_id = ? AND type = 'badge_request'`, adminId), 'admin xabar oladi');
  assert.equal((await api('POST', `/api/v1/admin/payments/${p0.body.id}/reject`, { token: S.buyer.token, body: {} })).status, 403);
  assert.equal((await api('POST', `/api/v1/admin/payments/${p0.body.id}/reject`, { token: S.admin.token, body: { reason: "Pul tushmadi" } })).status, 200);
  assert.equal(L.hasPaidBadge(uid), false);
  const rj = await api('GET', `/api/v1/payments/${p0.body.id}`, { token: S.buyer.token });
  assert.equal(rj.body.status, 'cancelled');
  assert.equal(rj.body.manual.reject_reason, 'Pul tushmadi');
  // Tasdiqlanadigan so'rov: 2 oy
  const p = await api('POST', '/api/v1/badge/subscribe', { token: S.buyer.token, body: { months: 2 }, currency: 'USD' });
  assert.equal(p.status, 201);
  assert.equal(p.body.amount, 30);
  assert.equal((await api('POST', `/api/v1/payments/${p.body.id}/claim`, { token: S.buyer.token, body: { note: 'chek 222' } })).status, 200);
  const queue = await api('GET', '/api/v1/admin/payments?manual=1', { token: S.admin.token });
  const row = queue.body.find((x) => x.id === p.body.id);
  assert.equal(row.manual.note, 'chek 222');
  assert.equal(row.user_phone, '+998907654321');
  assert.ok(!queue.body.some((x) => x.id === p0.body.id), "rad etilgani ro'yxatda yo'q");
  assert.equal(L.hasPaidBadge(uid), false, 'admin tasdiqlamaguncha galochka yo\'q');
  assert.equal((await api('POST', `/api/v1/admin/payments/${p.body.id}/mark-paid`, { token: S.admin.token })).status, 200);
  assert.equal(L.hasPaidBadge(uid), true);
  const after = await api('GET', '/api/v1/badge', { token: S.buyer.token });
  assert.equal(after.body.status.active, true);
  const me = await api('GET', '/api/v1/me', { token: S.buyer.token });
  assert.ok(me.body.badge_until);
  assert.ok(Date.parse(`${me.body.badge_until.replace(' ', 'T')}Z`) > Date.now() + 55 * 86400000, '2 oy');
  assert.equal(L.verifiedType(uid, null), 'paid');
});

test('SEO: IndexNow kalit fayli va Google/Yandex tasdiqlash tegi', async () => {
  const k = require('../src/lib/indexnow').key();
  assert.match(k, /^[a-f0-9]{32}$/);
  const r = await fetch(`${base}/${k}.txt`);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), k);
  assert.equal((await fetch(`${base}/${'0'.repeat(32)}.txt`)).status, 404);
  const config = require('../src/config');
  config.googleVerification = 'GoogleCode_123-x';
  const html = await (await fetch(`${base}/`)).text();
  assert.match(html, /<meta name="google-site-verification" content="GoogleCode_123-x">/);
  config.googleVerification = '';
});

test("SEO: asosiy domenga 301 (www, nip.io, IP), API yo'naltirilmaydi; tashkilot va qidiruv JSON-LD", async () => {
  const config = require('../src/config');
  const http = require('node:http');
  const prev = config.siteUrl;
  const get = (path, host) => new Promise((resolve, reject) => {
    const u = new URL(base);
    http.get({ host: u.hostname, port: u.port, path, headers: { Host: host } }, (res) => { res.resume(); resolve({ status: res.statusCode, location: res.headers.location }); }).on('error', reject);
  });
  config.siteUrl = 'https://hemu.uz';
  try {
    assert.deepEqual(await get('/catalog?q=jcb', 'www.hemu.uz'), { status: 301, location: 'https://hemu.uz/catalog?q=jcb' });
    assert.equal((await get('/listing/1', '189-74-98-45.nip.io')).location, 'https://hemu.uz/listing/1');
    assert.equal((await get('/', '189.74.98.45')).status, 301);
    assert.equal((await get('/api/v1/meta', 'www.hemu.uz')).status, 200);
    assert.equal((await get('/health', '127.0.0.1')).status, 200);
    assert.equal((await get('/', 'hemu.uz')).status, 200);
    const html = await (await fetch(`${base}/?lang=uz`)).text();
    assert.match(html, /<link rel="canonical" href="https:\/\/hemu\.uz\/\?lang=uz">/);
    assert.match(html, /"@type":"WebSite"/);
    assert.match(html, /"urlTemplate":"https:\/\/hemu\.uz\/catalog\?q=\{search_term_string\}"/);
  } finally {
    config.siteUrl = prev;
  }
  // Texnik manzil asosiy bo'lsa — hech qayerga yo'naltirilmaydi
  assert.equal((await get('/', 'www.example.com')).status, 200);
});

test('donat oynasi: /platform karta raqamini beradi, admin o\'chira oladi', async () => {
  const p = await api('GET', '/api/v1/platform');
  assert.equal(p.body.donate.card, '4466 1369 5190 3724');
  assert.ok(p.body.donate.holder);
  const off = await api('PUT', '/api/v1/admin/settings', { token: S.admin.token, body: { 'donate.enabled': false } });
  assert.equal(off.status, 200, JSON.stringify(off.body));
  assert.equal((await api('GET', '/api/v1/platform')).body.donate, null);
  await api('PUT', '/api/v1/admin/settings', { token: S.admin.token, body: { 'donate.enabled': true } });
  assert.ok((await api('GET', '/api/v1/platform')).body.donate);
});

test("Do'kon tarifi: admin orqali to'lov, qisqa manzil, qadalgan e'lonlar, faqat o'z tavsiyalari", async () => {
  const sellerId = db.get(`SELECT id FROM users WHERE phone = '+998901234567'`).id;
  const comp = db.get('SELECT * FROM companies WHERE owner_id = ?', sellerId);
  assert.ok(comp, 'seed: sotuvchining kompaniyasi bor');
  const g = await api('GET', '/api/v1/store-plan', { token: S.seller.token, currency: 'USD' });
  assert.equal(g.body.price.amount, 25);
  assert.equal(g.body.has_company, true);
  assert.equal(g.body.status.active, false);
  // Tarif faol bo'lmaguncha sozlab bo'lmaydi
  assert.equal((await api('PATCH', '/api/v1/my/store', { token: S.seller.token, body: { slug: 'jcb-diler' } })).status, 402);
  // Kompaniyasiz foydalanuvchi ulay olmaydi
  const buyerId = db.get(`SELECT id FROM users WHERE phone = '+998907654321'`).id;
  if (!db.get('SELECT 1 FROM companies WHERE owner_id = ?', buyerId)) {
    assert.equal((await api('POST', '/api/v1/store-plan/subscribe', { token: S.buyer.token, body: { months: 1 } })).status, 403);
  }
  const p = await api('POST', '/api/v1/store-plan/subscribe', { token: S.seller.token, body: { months: 1 }, currency: 'USD' });
  assert.equal(p.status, 201);
  assert.equal(p.body.amount, 25);
  assert.equal((await api('POST', `/api/v1/payments/${p.body.id}/claim`, { token: S.seller.token, body: { note: 'store' } })).status, 200);
  assert.equal((await api('POST', `/api/v1/admin/payments/${p.body.id}/mark-paid`, { token: S.admin.token })).status, 200);
  const g2 = await api('GET', '/api/v1/store-plan', { token: S.seller.token });
  assert.equal(g2.body.status.active, true);
  // Sozlamalar
  assert.equal((await api('PATCH', '/api/v1/my/store', { token: S.seller.token, body: { slug: 'admin' } })).status, 422);
  assert.equal((await api('PATCH', '/api/v1/my/store', { token: S.seller.token, body: { slug: 'a b' } })).status, 422);
  assert.equal((await api('PATCH', '/api/v1/my/store', { token: S.seller.token, body: { color: '#123456' } })).status, 422);
  const own = db.all(`SELECT id FROM listings WHERE company_id = ? AND status = 'active' ORDER BY id LIMIT 2`, comp.id).map((x) => x.id);
  const other = db.get(`SELECT id FROM listings WHERE (company_id IS NULL OR company_id != ?) AND status = 'active' LIMIT 1`, comp.id)?.id;
  assert.ok(own.length >= 1);
  const ok = await api('PATCH', '/api/v1/my/store', { token: S.seller.token, body: { slug: 'JCB-Diler', tagline: 'Rasmiy JCB diler', color: '#0b6fcf', pinned: [...own, other].filter(Boolean) } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const c2 = db.get('SELECT * FROM companies WHERE id = ?', comp.id);
  assert.equal(c2.store_slug, 'jcb-diler');
  assert.deepEqual(JSON.parse(c2.store_pinned), own, "faqat o'z e'lonlari qadaladi");
  // Qisqa manzil
  const red = await fetch(`${base}/s/jcb-diler`, { redirect: 'manual' });
  assert.equal(red.status, 302);
  assert.equal(red.headers.get('location'), `/company/${comp.id}`);
  // Do'kon sahifasi
  const page = await api('GET', `/api/v1/companies/${comp.id}`);
  assert.equal(page.body.store_plan.tagline, 'Rasmiy JCB diler');
  assert.equal(page.body.store_plan.color, '#0b6fcf');
  assert.deepEqual(page.body.store_plan.pinned.map((x) => x.id), own);
  // E'lon sahifasi: "Rasmiy do'kon" va tavsiyalar faqat shu do'kondan
  const l = await api('GET', `/api/v1/listings/${own[0]}`);
  assert.equal(l.body.store.id, comp.id);
  for (const x of l.body.similar) assert.equal(db.get('SELECT company_id FROM listings WHERE id = ?', x.id).company_id, comp.id);
  // Muddat tugasa — oddiy holat
  db.run(`UPDATE companies SET store_until = datetime('now', '-1 day') WHERE id = ?`, comp.id);
  assert.equal((await api('GET', `/api/v1/companies/${comp.id}`)).body.store_plan, null);
  assert.equal((await fetch(`${base}/s/jcb-diler`, { redirect: 'manual' })).status, 200);
  assert.equal((await api('GET', `/api/v1/listings/${own[0]}`)).body.store, null);
});
