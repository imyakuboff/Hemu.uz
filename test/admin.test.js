const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hemu-adm-'));
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
  return { status: res.status, body: json, headers: res.headers };
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

const A = (method, url, body) => api(method, `/api/v1/admin${url}`, { token: S.admin.token, body });

test('admin: oddiy foydalanuvchi kira olmaydi; umumiy ko\'rinish va server holati', async () => {
  assert.equal((await api('GET', '/api/v1/admin/overview', { token: S.buyer.token })).status, 403);
  const o = await A('GET', '/overview');
  assert.equal(o.status, 200, JSON.stringify(o.body));
  assert.ok(o.body.users.total >= 10);
  assert.equal(o.body.charts.registrations.length, 30);
  assert.ok(o.body.money.wallets_total_usd > 0);
  const s = await A('GET', '/system');
  assert.ok(s.body.host.cpus >= 1);
  assert.ok(s.body.memory.total > 0);
  assert.ok(s.body.storage.db > 0);
  assert.ok(s.body.tables.find((t) => t.name === 'users').rows >= 10);
  assert.ok(s.body.requests.totals.count > 0);
});

test('admin: foydalanuvchini qidirish, tahrirlash, login va parolni almashtirish', async () => {
  const list = await A('GET', '/users?q=Дмитрий');
  assert.equal(list.body.items.length, 1);
  const uid = list.body.items[0].id;
  const d = await A('GET', `/users/${uid}`);
  assert.equal(d.body.phone, '+998907654321');
  assert.ok(d.body.balance.balance_usd > 0);
  // Login (telefon) va parolni o'zgartirish → eski sessiyalar yopiladi
  const p = await A('PATCH', `/users/${uid}`, { phone: '+998 90 765 00 00', name: 'Дмитрий К.', admin_note: 'VIP' });
  assert.deepEqual(p.body.changed.sort(), ['admin_note', 'name', 'phone']);
  assert.equal((await api('GET', '/api/v1/me', { token: S.buyer.token })).status, 401);
  const weak = await A('PUT', `/users/${uid}/password`, { password: '123' });
  assert.equal(weak.body.error.code, 'password_weak');
  assert.equal((await A('PUT', `/users/${uid}/password`, { password: 'NewPass2026' })).status, 200);
  const re = await login('+998907650000', 'NewPass2026');
  assert.ok(re.token);
  S.buyer = re;
  // Mavjud raqamga o'zgartirib bo'lmaydi
  assert.equal((await A('PATCH', `/users/${uid}`, { phone: '+998901234567' })).status, 409);
  // Oxirgi adminni oddiy foydalanuvchiga aylantirib bo'lmaydi
  assert.equal((await A('PATCH', `/users/${S.admin.user.id}`, { role: 'user' })).body.error.code, 'last_admin');
});

test("admin: balansni to'ldirish/yechish, hamyondan xizmatga to'lash, qaytarish", async () => {
  const uid = S.seller.user.id;
  const before1 = (await api('GET', '/api/v1/me/wallet', { token: S.seller.token, currency: 'USD' })).body;
  assert.equal(before1.balance_usd, 50);
  const cr = await A('POST', `/users/${uid}/balance`, { amount: 126500, currency: 'UZS', direction: 'credit', note: 'Наличные' });
  assert.equal(cr.status, 200, JSON.stringify(cr.body));
  const w = (await api('GET', '/api/v1/me/wallet', { token: S.seller.token, currency: 'USD' })).body;
  assert.ok(w.balance_usd > 59 && w.balance_usd < 61, String(w.balance_usd));
  assert.equal(w.items[0].kind, 'admin_credit');
  assert.ok(w.providers.every((p) => p.id !== 'balance'), "hamyonni hamyon bilan to'ldirib bo'lmaydi");
  const tooMuch = await A('POST', `/users/${uid}/balance`, { amount: 100000, currency: 'USD', direction: 'debit' });
  assert.equal(tooMuch.body.error.code, 'insufficient_balance');
  // E'lonni balansdan ko'tarish — darhol to'lanadi
  const lid = db.get(`SELECT id FROM listings WHERE user_id = ? AND status = 'active' ORDER BY id DESC`, uid).id;
  const pr = await api('POST', `/api/v1/listings/${lid}/promote`, { token: S.seller.token, body: { package: 'premium', provider: 'balance' }, currency: 'USD' });
  assert.equal(pr.status, 201, JSON.stringify(pr.body));
  assert.equal(pr.body.status, 'paid');
  const w2 = (await api('GET', '/api/v1/me/wallet', { token: S.seller.token, currency: 'USD' })).body;
  assert.ok(Math.abs(w.balance_usd - 5 - w2.balance_usd) < 0.01);
  assert.equal(w2.items[0].kind, 'spend');
  // Qaytarish hamyonga
  assert.equal((await A('POST', `/payments/${pr.body.id}/refund`, {})).status, 200);
  const w3 = (await api('GET', '/api/v1/me/wallet', { token: S.seller.token, currency: 'USD' })).body;
  assert.ok(Math.abs(w3.balance_usd - w.balance_usd) < 0.01);
  // Mablag' yetmasa — to'lov yaratilmaydi
  const poor = await api('POST', `/api/v1/plans/subscribe`, { token: S.buyer.token, body: { plan: 'business', months: 12, provider: 'balance' } });
  assert.equal(poor.body.error.code, 'insufficient_balance');
  // Hamyonni sinov provayderi orqali to'ldirish
  const tp = await api('POST', '/api/v1/me/wallet/topup', { token: S.buyer.token, body: { amount: 10, provider: 'dev' }, currency: 'USD' });
  assert.equal(tp.status, 201);
  await api('POST', `/api/v1/payments/${tp.body.id}/dev-confirm`, { token: S.buyer.token });
  const wb = (await api('GET', '/api/v1/me/wallet', { token: S.buyer.token, currency: 'USD' })).body;
  assert.equal(wb.items[0].kind, 'topup');
  const all = await A('GET', '/wallet');
  assert.ok(all.body.total >= 5);
});

test('admin: bloklash sababi bilan, nomidan kirish, o\'chirish', async () => {
  const u = (await A('GET', '/users?q=Мария')).body.items[0];
  assert.equal((await A('POST', `/users/${u.id}/block`, { reason: 'Спам' })).status, 200);
  const otp = await api('POST', '/api/v1/auth/otp/request', { body: { phone: u.phone } });
  const v = await api('POST', '/api/v1/auth/otp/verify', { body: { phone: u.phone, code: otp.body.dev_code } });
  assert.equal(v.body.error.code, 'account_blocked');
  await A('POST', `/users/${u.id}/unblock`);
  const imp = await A('POST', `/users/${u.id}/impersonate`);
  const me = await api('GET', '/api/v1/me', { token: imp.body.token });
  assert.equal(me.body.id, u.id);
  // Buyurtmasi bor foydalanuvchini o'chirib bo'lmaydi
  const withOrders = db.get('SELECT buyer_id FROM orders LIMIT 1').buyer_id;
  assert.equal((await A('DELETE', `/users/${withOrders}`)).body.error.code, 'has_orders');
  const nu = await A('POST', '/users', { phone: '+998935550000', name: 'Менеджер', role: 'admin', password: 'Manager2026' });
  assert.equal(nu.status, 201);
  assert.equal((await login('+998935550000', 'Manager2026')).user.role, 'admin');
  assert.equal((await A('DELETE', `/users/${nu.body.id}`)).status, 200);
});

test('admin: kompaniyalar — rekvizitlar, hujjatlar, rad etish sababi', async () => {
  const list = await A('GET', '/companies?verification=all');
  assert.ok(list.body.length >= 7);
  const kabul = list.body.find((c) => c.country === 'AF');
  assert.equal(kabul.verification, 'pending');
  assert.equal(kabul.documents[0].type, 'reg_cert');
  const d = await A('GET', `/companies/${kabul.id}`);
  assert.equal(d.body.legal_form, 'llc');
  assert.ok(d.body.forms.length >= 2);
  const rej = await A('POST', `/companies/${kabul.id}/reject`, { reason: 'Guvohnoma o\'qilmaydi' });
  assert.equal(rej.body.verification, 'rejected');
  const bad = await A('PATCH', `/companies/${kabul.id}`, { tin: '123456' });
  assert.equal(bad.body.error.details.tin, 'invalid');
  const ok = await A('PATCH', `/companies/${kabul.id}`, { tin: '1009876543', verification: 'verified' });
  assert.equal(ok.body.verified, true);
  const blk = await A('POST', `/companies/${kabul.id}/block`, { blocked: true });
  assert.equal(blk.body.blocked, true);
  assert.equal((await api('GET', `/api/v1/companies/${kabul.id}`)).status, 404);
  // Mamlakat bo'yicha shakllar
  const uz = await api('GET', '/api/v1/legal-forms?country=UZ', { lang: 'uz' });
  assert.deepEqual(uz.body.forms.map((f) => f.code), ['yatt', 'mchj', 'xk', 'aj', 'ok']);
  assert.ok(uz.body.forms[0].docs.find((x) => x.type === 'reg_cert').required);
  const kz = await api('GET', '/api/v1/legal-forms?country=KZ', { lang: 'ru' });
  assert.equal(kz.body.forms[1].fields.find((f) => f.key === 'tin').label, 'БИН / ИИН');
});

test("admin: sozlamalar narxlarni o'zgartiradi, e'lon banneri, ro'yxatni yopish", async () => {
  const s = await A('PUT', '/settings', { 'prices.tier.vip': 9, announcement: 'Тех. работы в 23:00', registrationOpen: false });
  assert.equal(s.status, 200, JSON.stringify(s.body));
  const pk = await api('GET', '/api/v1/promo/packages', { currency: 'USD' });
  assert.equal(pk.body.items.find((x) => x.id === 'vip').price.amount, 9);
  assert.equal((await api('GET', '/api/v1/platform')).body.announcement, 'Тех. работы в 23:00');
  const reg = await api('POST', '/api/v1/auth/register/start', { body: { phone: '+998935559999' } });
  assert.equal(reg.body.error.code, 'registration_closed');
  assert.equal((await A('PUT', '/settings', { 'prices.tier.vip': -1 })).status, 422);
  await A('PUT', '/settings', { registrationOpen: true, announcement: '' });
});

test("admin: push-tarqatma auditoriya bo'yicha, jurnal", async () => {
  const pv = await A('POST', '/broadcast/preview', { audience: { country: 'KZ' } });
  assert.ok(pv.body.recipients >= 2);
  const b = await A('POST', '/broadcast', { title: 'Скидка 20%', body: 'На продвижение до конца недели', link: '/plans', audience: { country: 'KZ' } });
  assert.equal(b.status, 201, JSON.stringify(b.body));
  assert.equal(b.body.recipients, pv.body.recipients);
  const kz = await login('+77011234567');
  const n = await api('GET', '/api/v1/notifications', { token: kz.token });
  const items = n.body.items || n.body;
  assert.equal(items[0].type, 'broadcast');
  assert.match(items[0].text, /Скидка 20%/);
  assert.equal((await A('POST', '/broadcast', { title: 'x1', body: 'y1', link: 'javascript:alert(1)' })).status, 422);
  const hist = await A('GET', '/broadcasts');
  assert.ok(hist.body.length >= 2);
  const lg = await A('GET', '/log');
  const actions = lg.body.items.map((x) => x.action);
  for (const a of ['broadcast.send', 'settings.update', 'balance.credit', 'user.password', 'company.reject']) assert.ok(actions.includes(a), a);
  // Web Push kaliti
  assert.ok((await api('GET', '/api/v1/push/key')).body.public_key.length > 40);
  const sub = await api('POST', '/api/v1/me/push', { token: kz.token, body: { subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'BOr', auth: 'x' } } } });
  assert.equal(sub.status, 201);
  assert.equal((await api('POST', '/api/v1/me/push', { token: kz.token, body: { endpoint: 'http://evil' } })).status, 422);
});

test('admin: e\'lonlar va buyurtmalar boshqaruvi, zaxira nusxa', async () => {
  const all = await A('GET', '/listings?status=all&q=JCB');
  assert.ok(all.body.total >= 2);
  const lid = all.body.items[0].id;
  assert.equal((await A('PATCH', `/listings/${lid}`, { promoted_days: 7 })).status, 200);
  assert.ok(db.get('SELECT promoted_until FROM listings WHERE id = ?', lid).promoted_until);
  const orders = await A('GET', '/orders');
  assert.ok(orders.body.total >= 1);
  const oid = orders.body.items[0].id;
  assert.equal((await A('PATCH', `/orders/${oid}`, { status: 'cancelled', note: 'по просьбе клиента' })).status, 200);
  const bk = await fetch(`${base}/api/v1/admin/system/backup`, { headers: { Authorization: `Bearer ${S.admin.token}` } });
  assert.equal(bk.status, 200);
  const buf = Buffer.from(await bk.arrayBuffer());
  assert.equal(buf.subarray(0, 15).toString(), 'SQLite format 3');
  assert.equal((await A('POST', '/system/cleanup')).status, 200);
});

test('admin: reklama karuseli — standart 3 ta banner, tahrirlash, xavfsiz havolalar', async () => {
  const pub = await api('GET', '/api/v1/banners');
  assert.equal(pub.status, 200);
  assert.equal(pub.body.length, 3);
  assert.deepEqual(pub.body.map((b) => b.slot), [1, 2, 3]);
  assert.equal((await api('PUT', '/api/v1/admin/banners', { token: S.seller.token, body: { items: [] } })).status, 403);
  assert.equal((await A('PUT', '/banners', { items: [{ title: 'X', link: 'javascript:alert(1)' }] })).status, 422);
  assert.equal((await A('PUT', '/banners', { items: Array(7).fill({ title: 'X' }) })).status, 422);
  const items = (await A('GET', '/banners')).body.items;
  items[0].title = 'JCB lizing 0%';
  items[1].active = false;
  const r = await A('PUT', '/banners', { items: [items[2], items[0], items[1]] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.items.map((b) => b.slot), [3, 1, 2]);
  const after = (await api('GET', '/api/v1/banners')).body;
  assert.equal(after.length, 2);
  assert.equal(after[1].title, 'JCB lizing 0%');
});
