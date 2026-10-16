// Moderator roli, VIP/GOLD/PREMIUM narxlari, integratsiyalar, matnli sahifalar, murojaatlar,
// banner statistikasi, narxlar va sotuvchilar reytingi, admin uchun ikki bosqichli kirish
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hemu-plat-'));
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(tmp, 'test.db');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.OTP_DEV_ECHO = '1';

const db = require('../src/db');
const { seed } = require('../seed');
const { boot } = require('../src/server');

let server;
let base;
const S = {};

async function api(method, url, { token, body, lang = 'ru', currency } = {}) {
  const h = { 'X-Lang': lang };
  if (currency) h['X-Currency'] = currency;
  if (token) h.Authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(base + url, { method, headers: h, body: payload });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}
const login = async (phone, password = 'Hemu2026') => (await api('POST', '/api/v1/auth/login', { body: { phone, password } })).body;

before(async () => {
  seed(process.env.DB_FILE);
  db.close();
  const app = boot(process.env.DB_FILE);
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  S.admin = await login('+998900000001');
  S.seller = await login('+998901234567');
  S.buyer = await login('+998907654321');
});

after(() => {
  server.close();
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const A = (method, url, body, token = S.admin.token) => api(method, `/api/v1/admin${url}`, { token, body });

test('moderator: faqat moderatsiya, narxlar va murojaatlar; pul va sozlamalar yopiq', async () => {
  const uid = S.buyer.user.id;
  assert.equal((await A('PATCH', `/users/${uid}`, { role: 'moderator' })).status, 200);
  const mod = await login('+998907654321');
  const ov = await A('GET', '/overview', undefined, mod.token);
  assert.equal(ov.status, 200);
  assert.equal(ov.body.role, 'moderator');
  assert.equal(ov.body.money, undefined, "moderator pulni ko'rmaydi");
  assert.equal(ov.body.system, undefined);
  assert.equal((await A('GET', '/listings', undefined, mod.token)).status, 200);
  assert.equal((await A('GET', '/tiers', undefined, mod.token)).status, 200);
  assert.equal((await A('GET', '/support', undefined, mod.token)).status, 200);
  assert.equal((await api('GET', '/api/v1/admin/reports', { token: mod.token })).status, 200);
  for (const p of ['/users', '/settings', '/integrations', '/finance', '/system', '/banners', '/pages']) {
    assert.equal((await A('GET', p, undefined, mod.token)).status, 403, `${p} moderatorga yopiq`);
  }
  assert.equal((await A('POST', `/users/${uid}/balance`, { amount: 5, currency: 'USD', direction: 'credit' }, mod.token)).status, 403);
  // Moderator VIP/GOLD/PREMIUM narxini qo'yadi
  const t = await A('PUT', '/tiers', { vip: { price_usd: 20, days: 10 }, gold: { price_usd: 12 } }, mod.token);
  assert.equal(t.status, 200, JSON.stringify(t.body));
  const pk = (await api('GET', '/api/v1/promo/packages', { currency: 'USD' })).body.items;
  assert.equal(pk.find((x) => x.id === 'vip').price.amount, 20);
  assert.equal(pk.find((x) => x.id === 'vip').days, 10);
  assert.equal(pk.find((x) => x.id === 'gold').price.amount, 12);
  // Moderator e'longa bepul daraja beradi
  const lid = db.get(`SELECT id FROM listings WHERE status = 'active' ORDER BY id LIMIT 1`).id;
  assert.equal((await A('PATCH', `/listings/${lid}`, { tier: 'gold', tier_days: 3 }, mod.token)).status, 200);
  const home = (await api('GET', '/api/v1/home')).body;
  assert.ok(home.tiers.gold.some((x) => x.id === lid));
  assert.equal((await A('GET', '/tiers', undefined, mod.token)).body.items.find((x) => x.id === 'gold').active, 1);
  await A('PATCH', `/listings/${lid}`, { tier: 'none' }, mod.token);
  assert.ok(!(await api('GET', '/api/v1/home')).body.tiers.gold.some((x) => x.id === lid));
  // Admin oxirgi admin bo'lsa, o'zini moderatorga tushira olmaydi
  assert.equal((await A('PATCH', `/users/${S.admin.user.id}`, { role: 'moderator' })).status, 409);
  await A('PATCH', `/users/${uid}`, { role: 'user' });
});

test("integratsiyalar: kalitlar yashirin saqlanadi, Click/Payme yoqiladi, test SMS", async () => {
  const g = await A('GET', '/integrations');
  assert.equal(g.status, 200);
  assert.match(g.body.callbacks.payme, /\/api\/v1\/pay\/payme$/);
  const put = await A('PUT', '/integrations', {
    smsProvider: 'eskiz', 'eskiz.email': 'a@b.uz', 'eskiz.password': 'secret-pass-1234', 'eskiz.from': '4546',
    'click.serviceId': '111', 'click.merchantId': '222', 'click.secretKey': 'click-secret-9876',
    'payme.merchantId': 'm-1', 'payme.key': 'payme-key-5555', 'payme.testMode': true,
    'prices.tier.vip': 1, // ruxsat etilmagan kalit — e'tiborsiz
  });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  const items = Object.fromEntries(put.body.items.map((x) => [x.key, x]));
  assert.equal(items['eskiz.password'].value, '••••1234', "parol to'liq qaytarilmaydi");
  assert.equal(items['click.secretKey'].set, true);
  assert.equal(put.body.status.click, true);
  assert.equal(put.body.status.payme, true);
  // Niqoblangan qiymat qayta yuborilsa — kalit o'zgarmaydi
  await A('PUT', '/integrations', { 'click.secretKey': '••••9876' });
  assert.equal(require('../src/config').click.secretKey, 'click-secret-9876');
  const prov = (await api('GET', '/api/v1/payment-providers')).body.map((p) => p.id);
  assert.ok(prov.includes('click') && prov.includes('payme'));
  // Payme sinov kassasi
  const lid = db.get(`SELECT id FROM listings WHERE user_id = ? AND status = 'active' LIMIT 1`, S.seller.user.id).id;
  const pr = await api('POST', `/api/v1/listings/${lid}/promote`, { token: S.seller.token, body: { package: 'premium', provider: 'payme' } });
  assert.equal(pr.status, 201, JSON.stringify(pr.body));
  assert.match(pr.body.pay_url, /^https:\/\/checkout\.test\.paycom\.uz\//);
  assert.equal(pr.body.currency, 'UZS');
  // Test rejimida SMS yuborilmaydi, lekin jurnalga yoziladi
  const sms = await A('POST', '/integrations/sms-test', { phone: '+998901112233' });
  assert.equal(sms.body.ok, true);
  assert.ok((await A('GET', '/integrations')).body.sms_log.length >= 1);
  assert.equal((await A('PUT', '/integrations', { siteUrl: 'not a url' })).status, 422);
  await A('PUT', '/integrations', { smsProvider: 'log', 'payme.testMode': false, 'click.secretKey': null, 'payme.key': null });
  assert.equal((await A('GET', '/integrations')).body.status.click, false);
});

test('admin uchun ikki bosqichli kirish (SMS-kod)', async () => {
  await A('PUT', '/integrations', { adminTwoFactor: true });
  const first = await api('POST', '/api/v1/auth/login', { body: { phone: '+998900000001', password: 'Hemu2026' } });
  assert.equal(first.body.two_factor, true);
  assert.equal(first.body.token, undefined, "kodsiz token berilmaydi");
  assert.equal((await api('POST', '/api/v1/auth/login', { body: { phone: '+998900000001', password: 'Hemu2026', code: '000000' } })).status, 422);
  const ok = await api('POST', '/api/v1/auth/login', { body: { phone: '+998900000001', password: 'Hemu2026', code: first.body.dev_code } });
  assert.ok(ok.body.token);
  // Oddiy foydalanuvchiga ta'sir qilmaydi
  assert.ok((await api('POST', '/api/v1/auth/login', { body: { phone: '+998901234567', password: 'Hemu2026' } })).body.token);
  S.admin = ok.body;
  await A('PUT', '/integrations', { adminTwoFactor: false });
});

test("sahifalar: oferta va maxfiylik rekvizitlar bilan, admin tahriri, til bo'yicha", async () => {
  await A('PUT', '/pages/legal', { legalName: 'OOO «HEMU»', legalTin: '312345678', supportPhone: '+998918041224' });
  const t = await api('GET', '/api/v1/pages/terms');
  assert.equal(t.status, 200);
  assert.ok(t.body.text.includes('OOO «HEMU»') && t.body.text.includes('312345678'));
  assert.ok((await api('GET', '/api/v1/pages/privacy', { lang: 'uz' })).body.text.includes("O'RQ-547"));
  assert.equal((await api('GET', '/api/v1/pages/faq', { lang: 'kk' })).body.lang, 'ru');
  assert.equal((await api('GET', '/api/v1/pages/nope')).status, 404);
  assert.equal((await A('PUT', '/pages', { key: 'terms', lang: 'ru', text: '## Новые условия\nТекст {phone}' })).status, 200);
  const t2 = await api('GET', '/api/v1/pages/terms');
  assert.equal(t2.body.text, '## Новые условия\nТекст +998918041224');
  assert.equal(t2.body.custom, true);
  await A('PUT', '/pages', { key: 'terms', lang: 'ru', text: '' });
  assert.equal((await api('GET', '/api/v1/pages/terms')).body.custom, false);
  assert.equal((await api('GET', '/api/v1/platform')).body.support_phone, '+998918041224');
});

test("murojaatlar: mehmon va foydalanuvchi yozadi, admin javob beradi", async () => {
  assert.equal((await api('POST', '/api/v1/support', { body: { message: 'Qisqa' } })).status, 422);
  const g = await api('POST', '/api/v1/support', { body: { name: 'Anvar', phone: '90 123 45 67', topic: 'ads', message: 'VIP reklama narxlari haqida bilmoqchiman' } });
  assert.equal(g.status, 201, JSON.stringify(g.body));
  const u = await api('POST', '/api/v1/support', { token: S.seller.token, body: { topic: 'payment', message: "To'lov o'tdi, lekin VIP yoqilmadi" } });
  assert.equal(u.status, 201);
  const list = await A('GET', '/support');
  assert.equal(list.body.items.length, 2);
  assert.equal(list.body.items.find((x) => x.id === g.body.id).phone, '+998901234567');
  const ov = (await A('GET', '/overview')).body;
  assert.equal(ov.queue.support, 2);
  assert.equal((await A('PATCH', `/support/${u.body.id}`, { reply: 'Tekshirdik, VIP yoqildi' })).status, 200);
  const mine = (await api('GET', '/api/v1/me/support', { token: S.seller.token })).body;
  assert.equal(mine[0].status, 'answered');
  assert.equal(mine[0].reply, 'Tekshirdik, VIP yoqildi');
  const n = (await api('GET', '/api/v1/notifications', { token: S.seller.token })).body;
  assert.ok(n.items.some((x) => x.text.includes('Tekshirdik, VIP yoqildi')));
  assert.equal((await A('PATCH', `/support/${g.body.id}`, { status: 'closed' })).status, 200);
  assert.equal((await A('GET', '/support?status=closed')).body.items.length, 1);
});

test("oddiy foydalanuvchi: faqat TOP (OLX kabi); VIP/GOLD/PREMIUM — faqat kompaniyalar", async () => {
  const pk = (await api('GET', '/api/v1/promo/packages', { token: S.buyer.token, currency: 'USD' })).body;
  assert.equal(pk.is_company, false);
  assert.deepEqual(pk.items.map((x) => x.id), ['top', 'highlight', 'combo']);
  // Xaridorga e'lon yaratib, VIP sotib olishga urinish
  const lid = db.insert('listings', { user_id: S.buyer.user.id, title: 'Б/у генератор 5 кВт', kind: 'equipment', deal_type: 'sale', category_id: db.get('SELECT category_id FROM listings LIMIT 1').category_id, country: 'UZ', price: 1000, currency: 'USD', price_usd: 1000, status: 'active' });
  const vip = await api('POST', `/api/v1/listings/${lid}/promote`, { token: S.buyer.token, body: { package: 'vip', provider: 'dev' } });
  assert.equal(vip.status, 403);
  assert.equal(vip.body.error.code, 'company_only');
  await A('POST', `/users/${S.buyer.user.id}/balance`, { amount: 50, currency: 'USD', direction: 'credit' });
  const top = await api('POST', `/api/v1/listings/${lid}/promote`, { token: S.buyer.token, body: { package: 'top', provider: 'balance' }, currency: 'USD' });
  assert.equal(top.status, 201, JSON.stringify(top.body));
  assert.equal(top.body.status, 'paid');
  const l = (await api('GET', `/api/v1/listings/${lid}`)).body;
  assert.ok(l.promoted);
  assert.equal(l.tier, null);
  // Moderator TOP narxini ham o'zgartiradi
  assert.equal((await A('PUT', '/tiers', { top: { price_usd: 4 }, promo_days: 10 })).status, 200);
  const t2 = (await A('GET', '/tiers')).body;
  assert.equal(t2.tops.find((x) => x.id === 'top').price_usd, 4);
  assert.equal(t2.promo_days, 10);
});

test("yangi foydalanuvchiga ro'yxatdan o'tganda 200 000 so'm bonus (bir marta)", async () => {
  const phone = '+998935554433';
  const st = await api('POST', '/api/v1/auth/otp/request', { body: { phone } });
  const v = await api('POST', '/api/v1/auth/otp/verify', { body: { phone, code: st.body.dev_code } });
  assert.equal(v.body.is_new, true);
  assert.deepEqual(v.body.welcome_bonus, { amount: 200000, currency: 'UZS' });
  const w = (await api('GET', '/api/v1/me/wallet', { token: v.body.token, currency: 'UZS' })).body;
  assert.ok(Math.abs(w.amount - 200000) < 1000, `balans ${w.amount}`);
  assert.equal(w.items[0].kind, 'welcome');
  // Admin summani o'zgartiradi yoki o'chiradi
  assert.equal((await A('PUT', '/settings', { 'welcomeBonus.amount': 50000 })).status, 200);
  await A('PUT', '/settings', { 'welcomeBonus.enabled': false });
  const p2 = '+998935554434';
  const s2 = await api('POST', '/api/v1/auth/otp/request', { body: { phone: p2 } });
  const v2 = await api('POST', '/api/v1/auth/otp/verify', { body: { phone: p2, code: s2.body.dev_code } });
  assert.equal(v2.body.welcome_bonus, null);
  await A('PUT', '/settings', { 'welcomeBonus.enabled': true, 'welcomeBonus.amount': 200000 });
});

test("test ro'yxatdan o'tish: kod faqat yangi raqamga ekranda, mavjud hisobga — yo'q", async () => {
  await A('PUT', '/integrations', { otpDevEcho: false, otpTestRegistration: true });
  const fresh = await api('POST', '/api/v1/auth/register/start', { body: { phone: '+998935557711' } });
  assert.match(String(fresh.body.dev_code), /^\d{6}$/);
  const quick = await api('POST', '/api/v1/auth/otp/request', { body: { phone: '+998935557722' } });
  assert.equal(quick.body.exists, false);
  assert.match(String(quick.body.dev_code), /^\d{6}$/);
  // Mavjud hisob (admin) — kod ko'rsatilmaydi
  const adm = await api('POST', '/api/v1/auth/otp/request', { body: { phone: '+998900000001' } });
  assert.equal(adm.body.exists, true);
  assert.equal(adm.body.dev_code, undefined);
  const reset = await api('POST', '/api/v1/auth/password/forgot', { body: { phone: '+998901234567' } });
  assert.equal(reset.body.dev_code, undefined);
  await A('PUT', '/integrations', { otpDevEcho: true, otpTestRegistration: false });
});

test("admin: login (username) va parol bilan kirish; balans to'ldirish", async () => {
  const uid = S.admin.user.id;
  assert.equal((await A('PATCH', `/users/${uid}`, { username: 'staffuser1' })).status, 200);
  await A('PUT', `/users/${uid}/password`, { password: 'TestPass#2026' });
  const ok = await api('POST', '/api/v1/auth/login', { body: { login: 'STAFFUSER1', password: 'TestPass#2026' } });
  assert.ok(ok.body.token, JSON.stringify(ok.body));
  assert.equal(ok.body.user.role, 'admin');
  assert.equal((await api('POST', '/api/v1/auth/login', { body: { login: 'staffuser1', password: 'xato12345' } })).status, 401);
  // Telefon bilan ham ishlaydi
  assert.ok((await api('POST', '/api/v1/auth/login', { body: { login: '+998900000001', password: 'TestPass#2026' } })).body.token);
  // Login band bo'lsa — rad etiladi; noto'g'ri formatdagi login ham
  assert.equal((await A('PATCH', `/users/${S.seller.user.id}`, { username: 'StaffUser1' }, ok.body.token)).status, 409);
  assert.equal((await A('PATCH', `/users/${S.seller.user.id}`, { username: '12345' }, ok.body.token)).status, 422);
  const bal = await A('POST', `/users/${S.seller.user.id}/balance`, { amount: 100000, currency: 'UZS', direction: 'credit' }, ok.body.token);
  assert.equal(bal.status, 200);
  S.admin = ok.body;
});

test("VIP: ikki marta bosilsa pul bir marta yechiladi; qaytarishda muddat ham kamayadi", async () => {
  const lid = db.get(`SELECT id FROM listings WHERE user_id = ? AND status = 'active' AND tier IS NULL ORDER BY id LIMIT 1`, S.seller.user.id).id;
  const bal0 = db.get('SELECT balance_usd FROM users WHERE id = ?', S.seller.user.id).balance_usd;
  const body = { package: 'vip', provider: 'balance' };
  // Bir vaqtda ikki so'rov (tugma ikki marta bosildi)
  const [r1, r2] = await Promise.all([1, 2].map(() => api('POST', `/api/v1/listings/${lid}/promote`, { token: S.seller.token, body, currency: 'USD' })));
  assert.ok([r1.status, r2.status].every((s) => s === 200 || s === 201), `${r1.status} ${r2.status}`);
  assert.equal(db.get(`SELECT COUNT(*) AS n FROM payments WHERE purpose = 'promo' AND ref_id = ? AND status = 'paid' AND provider = 'balance'`, lid).n, 1);
  const bal1 = db.get('SELECT balance_usd FROM users WHERE id = ?', S.seller.user.id).balance_usd;
  assert.ok(Math.abs(bal0 - bal1 - 20) < 0.01, `bir marta yechildi: ${bal0} -> ${bal1}`);
  const until = db.get('SELECT tier_until FROM listings WHERE id = ?', lid).tier_until;
  const days = (Date.parse(`${until}Z`) - Date.now()) / 864e5;
  assert.ok(days > 9 && days < 10.1, `muddat 10 kun: ${days}`);
  // Qaytarish: pul hamyonga, VIP olib tashlanadi
  const pid = db.get(`SELECT id FROM payments WHERE purpose = 'promo' AND ref_id = ? AND status = 'paid' AND provider = 'balance'`, lid).id;
  assert.equal((await A('POST', `/payments/${pid}/refund`, {})).status, 200);
  assert.equal(db.get('SELECT tier FROM listings WHERE id = ?', lid).tier, null);
  assert.ok(Math.abs(db.get('SELECT balance_usd FROM users WHERE id = ?', S.seller.user.id).balance_usd - bal0) < 0.01);
});

test("narxlar so'mda: 35 000 / 55 000 / 75 000 va TOP 10 000 / 30 000 / 50 000 — kurs o'zgarsa ham aniq", async () => {
  const put = await A('PUT', '/tiers', { currency: 'UZS', premium: { price: 35000 }, gold: { price: 55000 }, vip: { price: 75000 }, top: { price: 10000 }, highlight: { price: 30000 }, combo: { price: 50000 } });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  const g = (await A('GET', '/tiers')).body;
  assert.equal(g.currency, 'UZS');
  assert.equal(g.items.find((x) => x.id === 'vip').price, 75000);
  const pk = (await api('GET', '/api/v1/promo/packages', { token: S.seller.token, currency: 'UZS' })).body.items;
  assert.deepEqual(pk.map((x) => [x.id, x.price.amount]), [['vip', 75000], ['gold', 55000], ['premium', 35000], ['top', 10000], ['highlight', 30000], ['combo', 50000]]);
  // To'lov aniq so'mda yaratiladi
  const lid = db.get(`SELECT id FROM listings WHERE user_id = ? AND status = 'active' AND (tier IS NULL OR tier_until < datetime('now')) ORDER BY id DESC LIMIT 1`, S.seller.user.id).id;
  const p = await api('POST', `/api/v1/listings/${lid}/promote`, { token: S.seller.token, body: { package: 'premium', provider: 'dev' } });
  assert.equal(p.status, 201, JSON.stringify(p.body));
  assert.equal(p.body.amount, 35000);
  assert.equal(p.body.currency, 'UZS');
  await A('PUT', '/tiers', { currency: 'USD', premium: { price: 5 }, gold: { price: 12 }, vip: { price: 20 }, top: { price: 4 }, highlight: { price: 3 }, combo: { price: 7 } });
});

test("banner statistikasi, texnika narxlari, sotuvchilar reytingi", async () => {
  const bs = (await api('GET', '/api/v1/banners')).body;
  assert.ok(bs.every((b) => /^[a-z0-9]{8}$/.test(b.uid)));
  await api('POST', '/api/v1/banners/track', { body: { views: [bs[0].uid, bs[1].uid, 'unknown1'] } });
  await api('POST', '/api/v1/banners/track', { body: { views: [bs[0].uid], click: bs[0].uid } });
  const st = (await A('GET', '/banners')).body.stats;
  assert.deepEqual(st[bs[0].uid], { views: 2, clicks: 1 });
  assert.equal(st.unknown1, undefined);
  // Tartib o'zgarsa ham uid (statistika) saqlanadi
  const items = (await A('GET', '/banners')).body.items;
  const saved = (await A('PUT', '/banners', { items: [items[1], items[0], items[2]] })).body.items;
  assert.equal(saved[1].uid, bs[0].uid);
  const pr = await api('GET', '/api/v1/market/prices', { currency: 'USD' });
  assert.equal(pr.status, 200);
  assert.ok(pr.body.items.length > 0);
  assert.ok(pr.body.items.every((x) => x.brand && x.model && x.count >= 1));
  const sl = await api('GET', '/api/v1/market/sellers');
  assert.equal(sl.status, 200);
  assert.ok(sl.body.length > 0);
  assert.equal(sl.body[0].place, 1);
  assert.ok(sl.body[0].rating >= sl.body[sl.body.length - 1].rating);
});
