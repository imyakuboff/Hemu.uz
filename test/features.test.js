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
  const sm = await (await fetch(`${base}/sitemap.xml`)).text();
  assert.match(sm, /<loc>[^<]*\/listing\/1<\/loc>/);
  assert.match(await (await fetch(`${base}/robots.txt`)).text(), /Disallow: \/api\//);
});
