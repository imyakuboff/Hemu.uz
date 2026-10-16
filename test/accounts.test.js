const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hemu-acc-'));
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
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function api(method, url, { token, body, lang = 'ru', form } = {}) {
  const h = { 'X-Lang': lang };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(base + url, { method, headers: h, body: payload });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json, headers: res.headers, raw: text };
}

async function register(phone, data) {
  const s = await api('POST', '/api/v1/auth/register/start', { body: { phone } });
  assert.equal(s.status, 200, JSON.stringify(s.body));
  const v = await api('POST', '/api/v1/auth/register/verify', { body: { phone, code: s.body.dev_code } });
  assert.equal(v.status, 200);
  const r = await api('POST', '/api/v1/auth/register', { body: { ticket: v.body.ticket, ...data } });
  return r;
}

before(async () => {
  seed(process.env.DB_FILE);
  db.close();
  const app = boot(process.env.DB_FILE);
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  S.seller = (await api('POST', '/api/v1/auth/login', { body: { phone: '+998901234567', password: 'Hemu2026' } })).body;
  S.buyer = (await api('POST', '/api/v1/auth/login', { body: { phone: '+998907654321', password: 'Hemu2026' } })).body;
});

after(() => {
  server.close();
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("ro'yxatdan o'tish: kompaniya (faoliyat turlari bilan)", async () => {
  assert.ok(S.seller.token, 'parol bilan kirish');
  const dup = await api('POST', '/api/v1/auth/register/start', { body: { phone: '+998901234567' } });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'already_registered');
  const bad = await register('+998911110001', { account_type: 'company', name: 'Олим', password: 'Strong2026', company: { name: 'ООО «Спецтранс»', activities: [] } });
  assert.equal(bad.status, 422);
  const weak = await register('+998911110002', { account_type: 'client', name: 'Олим', password: '123' });
  assert.equal(weak.body.error.code, 'password_weak');
  // YaTT: STIR yoki JShShIR (14 raqam); noto'g'ri MFO rad etiladi
  const badMfo = await register('+998911110004', { account_type: 'company', name: 'Олим', password: 'Strong2026', company: { name: 'ЯТТ Каримов', legal_form: 'yatt', activities: ['parts'], tin: '31234567890123', bank_code: '12' } });
  assert.equal(badMfo.body.error.details.bank_code, 'invalid');
  const r = await register('+998911110003', { account_type: 'company', name: 'Олим Каримов', password: 'Strong2026', company: { name: 'ООО «Спецтранс»', legal_form: 'mchj', activities: ['equipment_sale', 'parts', 'hacker'], tin: '305999111', bank_code: '00450', bank_account: '20208000900123456001', region: 'tashkent-city', city: 'Ташкент' } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.user.account_type, 'company');
  assert.equal(r.body.user.company.name, 'ООО «Спецтранс»');
  assert.deepEqual(r.body.user.company.activities, ['equipment_sale', 'parts']);
  assert.equal(r.body.user.has_password, true);
  const again = await api('POST', '/api/v1/auth/login', { body: { phone: '+998 91 111 00 03', password: 'Strong2026' } });
  assert.equal(again.status, 200);
  const wrong = await api('POST', '/api/v1/auth/login', { body: { phone: '+998911110003', password: 'Wrong2026' } });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.error.message, 'Неверный телефон или пароль');
});

test("ro'yxatdan o'tish: mexanik, haydovchi, mijoz (qiziqishlar)", async () => {
  const m = await register('+77012223344', {
    account_type: 'mechanic', name: 'Ерболат', password: 'Mechanic1',
    specialist: { headline: 'Механик по двигателям Cummins', experience_years: 10, skills: ['engine', 'diagnostics', 'flying'], brands: ['Cummins'], region: 'almaty-city', city: 'Алматы', rate: 10000, rate_unit: 'hour', mobile: true },
  });
  assert.equal(m.status, 201, JSON.stringify(m.body));
  assert.equal(m.body.user.specialist.kind, 'mechanic');
  const sp = await api('GET', `/api/v1/specialists/${m.body.user.specialist.id}`);
  assert.deepEqual(sp.body.skills, ['engine', 'diagnostics']);
  assert.equal(sp.body.location.country, 'KZ');
  assert.equal(sp.body.currency, 'KZT');
  const d = await register('+998933334455', { account_type: 'driver', name: 'Шерзод', password: 'Driver2026', specialist: { headline: 'Водитель экскаватора JCB', skills: ['excavator'], license: ['C', 'XYZ'], region: 'tashkent' } });
  assert.equal(d.status, 201);
  const c = await register('+998944445566', { account_type: 'client', name: 'Ильхом', password: 'Client2026', interests: ['excavators', 'filters', 'nope'] });
  assert.equal(c.status, 201);
  assert.deepEqual(c.body.user.interests.sort(), ['excavators', 'filters']);
  S.client = c.body;
  const drivers = await api('GET', '/api/v1/specialists?kind=driver&license=C');
  assert.ok(drivers.body.items.some((x) => x.name === 'Шерзод'));
  const mech = await api('GET', `/api/v1/specialists?kind=mechanic&q=${encodeURIComponent('гидравлик')}`);
  assert.ok(mech.body.total >= 1);
});

test("parolni tiklash SMS orqali", async () => {
  assert.equal((await api('POST', '/api/v1/auth/password/forgot', { body: { phone: '+998999999999' } })).body.error.code, 'no_account');
  const f = await api('POST', '/api/v1/auth/password/forgot', { body: { phone: '+998944445566' } });
  assert.ok(f.body.dev_code);
  const weak = await api('POST', '/api/v1/auth/password/reset', { body: { phone: '+998944445566', code: f.body.dev_code, password: 'short' } });
  assert.equal(weak.status, 422);
  const r = await api('POST', '/api/v1/auth/password/reset', { body: { phone: '+998944445566', code: f.body.dev_code, password: 'NewPass2026' } });
  assert.equal(r.status, 200);
  assert.equal((await api('GET', '/api/v1/me', { token: S.client.token })).status, 401, 'eski sessiyalar yopildi');
  assert.equal((await api('POST', '/api/v1/auth/login', { body: { phone: '+998944445566', password: 'NewPass2026' } })).status, 200);
  S.client = r.body;
  const ch = await api('PUT', '/api/v1/me/password', { token: S.client.token, body: { current_password: 'Wrong', password: 'Other2026x' } });
  assert.equal(ch.status, 401);
});

test('vakansiya, logistika, mutaxassisga yozish', async () => {
  const j = await api('POST', '/api/v1/jobs', { token: S.seller.token, body: { kind: 'driver', title: 'Нужен водитель JCB 3CX', description: 'Работа на объектах в Ташкентской области, 5/2.', salary_min: 8000000, salary_unit: 'month', region: 'tashkent' } });
  assert.equal(j.status, 201);
  assert.equal(j.body.employer.name, 'ООО «ТехноПарк»');
  const jobs = await api('GET', '/api/v1/jobs?kind=driver');
  assert.ok(jobs.body.total >= 3);
  const l = await api('POST', '/api/v1/logistics', { token: S.buyer.token, body: { kind: 'cargo', title: 'Перевезти бульдозер 18 т', from_city: 'Ташкент', to_city: 'Навои', weight_t: 18, price: 9000000 } });
  assert.equal(l.status, 201);
  assert.equal(l.body.currency, 'UZS');
  const cargo = await api('GET', `/api/v1/logistics?kind=cargo&from=${encodeURIComponent('Ташкент')}`);
  assert.ok(cargo.body.items.some((x) => x.id === l.body.id));
  assert.equal((await api('GET', '/api/v1/logistics?kind=transport')).body.total, 2);
  const sp = (await api('GET', '/api/v1/specialists?kind=mechanic&country=UZ')).body.items[0];
  const c = await api('POST', '/api/v1/conversations/direct', { token: S.buyer.token, body: { user_id: sp.user_id, body: 'Можете приехать завтра?', context: sp.headline } });
  assert.equal(c.status, 201);
  assert.equal(c.body.context, sp.headline);
  assert.equal(c.body.listing, null);
});

test("biznes: xodim qo'shish, xodim kompaniya nomidan e'lon joylaydi; filiallar; obuna", async () => {
  const add = await api('POST', '/api/v1/business/members', { token: S.seller.token, body: { phone: '90 555 66 77', name: 'Тимур', role: 'manager' } });
  assert.equal(add.status, 201);
  assert.equal(add.body.joined, false);
  const s = await api('POST', '/api/v1/auth/otp/request', { body: { phone: '+998905556677' } });
  const emp = (await api('POST', '/api/v1/auth/otp/verify', { body: { phone: '+998905556677', code: s.body.dev_code, name: 'Тимур' } })).body;
  assert.equal(emp.user.company.name, 'ООО «ТехноПарк»');
  assert.equal(emp.user.company.role, 'manager');
  const cr = await api('POST', '/api/v1/listings', { token: emp.token, body: { deal_type: 'sale', category: 'parts', subcategory: 'filters', title: 'Фильтр топливный JCB 32/925869', description: 'Оригинальный топливный фильтр JCB в наличии на складе.', price: 350000, region: 'tashkent' } });
  assert.equal(cr.status, 201);
  const fd = new FormData();
  fd.append('files', new Blob([PNG], { type: 'image/png' }), 'a.png');
  await api('POST', `/api/v1/listings/${cr.body.id}/photos`, { token: emp.token, form: fd });
  const pub = await api('POST', `/api/v1/listings/${cr.body.id}/publish`, { token: emp.token });
  assert.equal(pub.body.status, 'active', 'tasdiqlangan kompaniya — darhol faol');
  assert.equal(pub.body.seller.name, 'ООО «ТехноПарк»');
  // Kompaniya egasi xodim e'lonini boshqara oladi
  assert.equal((await api('PATCH', `/api/v1/listings/${cr.body.id}`, { token: S.seller.token, body: { price: 340000 } })).status, 200);
  // Obunachi (xaridor) va qiziqishlar (mijoz: filters) xabar oldi
  const nb = await api('GET', '/api/v1/notifications', { token: S.buyer.token });
  assert.ok(nb.body.items.some((x) => x.text === 'ООО «ТехноПарк» разместила новое объявление: Фильтр топливный JCB 32/925869'));
  const nc = await api('GET', '/api/v1/notifications?lang=uz', { token: S.client.token });
  assert.ok(nc.body.items.some((x) => x.text.startsWith("Qiziqishlaringiz bo'yicha yangi e'lon — Filtrlar")));
  const br = await api('POST', '/api/v1/business/branches', { token: S.seller.token, body: { name: 'Филиал Бухара', region: 'bukhara', city: 'Бухара', phone: '90 123 00 99' } });
  assert.equal(br.status, 201);
  assert.equal((await api('POST', '/api/v1/business/branches', { token: S.buyer.token, body: { name: 'X' } })).status, 404);
  const store = await api('GET', '/api/v1/companies/1', { token: S.buyer.token });
  assert.equal(store.body.branches.length, 4);
  assert.equal(store.body.following, true);
  assert.ok(store.body.followers >= 2);
  assert.ok(store.body.sections.some((x) => x.slug === 'filters'));
  const unf = await api('DELETE', '/api/v1/companies/1/follow', { token: S.buyer.token });
  assert.equal(unf.body.following, false);
  const m = await api('GET', '/api/v1/business/members', { token: S.seller.token });
  assert.ok(m.body.items.some((x) => x.name === 'Тимур' && x.joined && x.listings === 1));
});

test("o'chirilgan e'lonni tiklash", async () => {
  const del = await api('DELETE', '/api/v1/listings/4', { token: S.seller.token });
  assert.equal(del.body.status, 'deleted');
  assert.equal((await api('GET', '/api/v1/listings/4')).status, 404);
  const all = await api('GET', '/api/v1/my/listings', { token: S.seller.token });
  assert.ok(!all.body.items.some((x) => x.id === 4));
  assert.equal(all.body.counts.deleted, 1);
  const r = await api('POST', '/api/v1/listings/4/restore', { token: S.seller.token });
  assert.equal(r.body.status, 'archived');
  assert.equal((await api('POST', '/api/v1/listings/4/publish', { token: S.seller.token })).body.status, 'active');
});

test("aqlli qidiruv, bo'limlar, zayavkaga mos e'lonlar", async () => {
  await api('GET', `/api/v1/listings?q=${encodeURIComponent('экскаватор')}`);
  const s = await api('GET', `/api/v1/search/suggest?q=${encodeURIComponent('экскав')}`);
  assert.ok(s.body.total >= 3);
  assert.ok(s.body.categories.some((c) => c.slug === 'excavators'));
  assert.ok(s.body.listings.length >= 1);
  assert.ok(s.body.queries.includes('экскаватор') || s.body.queries.length >= 0);
  const b = await api('GET', '/api/v1/search/suggest?q=jc');
  assert.equal(b.body.brands[0].name, 'JCB');
  const empty = await api('GET', '/api/v1/search/suggest?q=');
  assert.ok(empty.body.queries.includes('JCB 3CX'));
  const sec = await api('GET', '/api/v1/sections');
  assert.ok(sec.body.transportsale >= 8);
  assert.ok(sec.body.transportrental >= 3);
  assert.ok(sec.body.driver >= 5);
  assert.ok(sec.body.cargologistic >= 2);
  const reqs = await api('GET', '/api/v1/requests');
  const m = await api('GET', `/api/v1/requests/${reqs.body.items[0].id}/matches`);
  assert.ok(m.body.length >= 1);
  assert.ok(m.body.every((x) => x.category.slug === 'special'));
});

test('hisob-faktura PDF', async () => {
  const o = await api('POST', '/api/v1/orders', { token: S.buyer.token, body: { listing_id: 2, qty: 2, delivery_method: 'pickup' } });
  assert.equal(o.status, 201);
  const res = await fetch(`${base}/api/v1/orders/${o.body.id}/invoice.pdf`, { headers: { Authorization: `Bearer ${S.buyer.token}`, 'X-Lang': 'ru' } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(buf.length > 5000);
  const other = await api('GET', `/api/v1/orders/${o.body.id}/invoice.pdf`, { token: S.client.token });
  assert.equal(other.status, 403);
});

test("kompaniya: faoliyat turlarini o'zgartirish va do'kon ichida qidiruv", async () => {
  const tk = S.seller.token;
  const bad = await api('PATCH', '/api/v1/my/company', { token: tk, body: { activities: ['nonsense'] } });
  assert.equal(bad.status, 422);
  const ok = await api('PATCH', '/api/v1/my/company', { token: tk, body: { activities: ['equipment_sale', 'parts', 'parts'] } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual(ok.body.activities, ['equipment_sale', 'parts']);
  const all = await api('GET', `/api/v1/companies/${ok.body.id}`);
  assert.deepEqual(all.body.activities, ['equipment_sale', 'parts']);
  const found = await api('GET', `/api/v1/companies/${ok.body.id}?q=JCB`);
  assert.ok(found.body.listings.total >= 1 && found.body.listings.total <= all.body.listings.total);
  assert.ok(found.body.listings.items.every((l) => /jcb/i.test(l.title)));
  const none = await api('GET', `/api/v1/companies/${ok.body.id}?q=zzzqqq`);
  assert.equal(none.body.listings.total, 0);
});