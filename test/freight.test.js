// Fura logistika birjasi: yuk va bo'sh fura joylash, mos e'lonlar, filtrlar, obuna, nazorat
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hemu-fura-'));
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

async function api(method, url, { token, body, lang = 'ru' } = {}) {
  const h = { 'X-Lang': lang };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(base + url, { method, headers: h, body: payload });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}
const login = async (phone) => (await api('POST', '/api/v1/auth/login', { body: { phone, password: 'Hemu2026' } })).body;

before(async () => {
  seed(process.env.DB_FILE);
  db.close();
  const app = boot(process.env.DB_FILE);
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  S.admin = await login('+998900000001');
  S.seller = await login('+998901234567');
  S.buyer = await login('+998907654321');
  S.driver = await login('+998977778899');
});

after(() => {
  server.close();
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('fura: yuk joylash, bo\'sh fura joylash, mos e\'lonlar va filtrlar', async () => {
  assert.equal((await api('POST', '/api/v1/freight', { body: { kind: 'load' } })).status, 401);
  // Yukda manzil va yuk nomi majburiy
  const bad = await api('POST', '/api/v1/freight', { token: S.seller.token, body: { kind: 'load', from_country: 'UZ', from_city: 'Toshkent' } });
  assert.equal(bad.status, 422);
  const load = await api('POST', '/api/v1/freight', { token: S.seller.token, body: {
    kind: 'load', from_country: 'UZ', from_city: 'Toshkent', to_country: 'RU', to_city: 'Moskva',
    date_from: '2026-11-01', date_to: '2026-11-03', cargo: 'Paxta tolasi', body_types: ['tent', 'van', 'nonsense'], loading: ['back', 'side'],
    weight_t: 20, volume_m3: 82, price: 3200, currency: 'USD', price_unit: 'total', payment: 'bank', cmr: true,
  } });
  assert.equal(load.status, 201, JSON.stringify(load.body));
  assert.deepEqual(load.body.body_types, ['tent', 'van']);
  assert.equal(load.body.cmr, true);
  assert.equal(load.body.owner.name, 'ООО «ТехноПарк»');
  assert.equal(load.body.matches, 0);
  // Bo'sh fura: kuzov majburiy
  assert.equal((await api('POST', '/api/v1/freight', { token: S.driver.token, body: { kind: 'truck', from_country: 'UZ', from_city: 'Toshkent' } })).status, 422);
  const truck = await api('POST', '/api/v1/freight', { token: S.driver.token, body: {
    kind: 'truck', from_country: 'UZ', from_city: 'Toshkent', to_country: 'RU', body_types: ['tent'], weight_t: 22, volume_m3: 90, length_m: 13.6, date_from: '2026-11-01', tir: true,
  } });
  assert.equal(truck.status, 201, JSON.stringify(truck.body));
  // Mos kelmaydigan fura: refrijerator va 10 t
  await api('POST', '/api/v1/freight', { token: S.buyer.token, body: { kind: 'truck', from_country: 'UZ', from_city: 'Samarqand', body_types: ['ref'], weight_t: 10 } });
  const d = await api('GET', `/api/v1/freight/${load.body.id}`);
  assert.equal(d.body.matches, 1);
  assert.equal(d.body.matches_list[0].id, truck.body.id);
  assert.equal((await api('GET', `/api/v1/freight/${truck.body.id}`)).body.matches_list[0].id, load.body.id);
  // Filtrlar
  const l1 = (await api('GET', '/api/v1/freight?kind=load&from_country=UZ&to_country=RU&body=tent')).body;
  assert.equal(l1.total, 1);
  assert.equal(l1.items[0].matches, 1);
  assert.equal(l1.stats.loads, 1);
  assert.equal(l1.stats.trucks, 2);
  assert.equal(l1.routes[0].to_city, 'Moskva');
  assert.equal((await api('GET', '/api/v1/freight?kind=truck&body=ref')).body.total, 1);
  assert.equal((await api('GET', '/api/v1/freight?kind=truck&weight_min=20')).body.total, 1);
  assert.equal((await api('GET', '/api/v1/freight?kind=load&date=2026-11-02')).body.total, 1);
  assert.equal((await api('GET', '/api/v1/freight?kind=load&date=2026-12-01')).body.total, 0);
  assert.equal((await api('GET', '/api/v1/freight?kind=load&q=paxta')).body.total, 1);
  // Telefon — faqat kirganlarga
  assert.equal((await api('POST', `/api/v1/freight/${load.body.id}/phone`)).status, 401);
  assert.equal((await api('POST', `/api/v1/freight/${load.body.id}/phone`, { token: S.driver.token })).body.phone, '+998901234567');
  // Bo'limlar soni
  assert.equal((await api('GET', '/api/v1/sections')).body.fura, 3);
  S.load = load.body.id;
});

test("fura: yo'nalishga obuna — yangi yuk chiqsa xabar keladi", async () => {
  const al = await api('POST', '/api/v1/me/freight-alerts', { token: S.driver.token, body: { kind: 'load', from_country: 'UZ', to_country: 'KZ', body: 'tent' } });
  assert.equal(al.status, 201);
  await api('POST', '/api/v1/freight', { token: S.seller.token, body: { kind: 'load', from_country: 'UZ', from_city: 'Toshkent', to_country: 'KZ', to_city: 'Almaty', cargo: 'Sement', body_types: ['tent'], weight_t: 20 } });
  await api('POST', '/api/v1/freight', { token: S.seller.token, body: { kind: 'load', from_country: 'UZ', from_city: 'Toshkent', to_country: 'CN', to_city: 'Urumchi', cargo: 'Mis', body_types: ['tent'] } });
  const n = (await api('GET', '/api/v1/notifications', { token: S.driver.token })).body.items.filter((x) => x.text.startsWith('Новый груз'));
  assert.equal(n.length, 1);
  assert.ok(n[0].text.includes('Almaty'));
  assert.equal((await api('GET', '/api/v1/me/freight-alerts', { token: S.driver.token })).body.length, 1);
  await api('DELETE', `/api/v1/me/freight-alerts/${al.body.id}`, { token: S.driver.token });
  assert.equal((await api('GET', '/api/v1/me/freight-alerts', { token: S.driver.token })).body.length, 0);
});

test('fura: yopish, yangilash, nazorat (moderator ham)', async () => {
  assert.equal((await api('POST', `/api/v1/freight/${S.load}/close`, { token: S.buyer.token })).status, 403);
  // Yangilash — kuniga bir marta
  assert.equal((await api('POST', `/api/v1/freight/${S.load}/bump`, { token: S.seller.token })).status, 429);
  db.run(`UPDATE freight SET bumped_at = datetime('now', '-2 days') WHERE id = ?`, S.load);
  assert.equal((await api('POST', `/api/v1/freight/${S.load}/bump`, { token: S.seller.token })).status, 200);
  const mine = (await api('GET', '/api/v1/my/freight', { token: S.seller.token })).body;
  assert.equal(mine.length, 3);
  // Admin ro'yxati va o'chirish
  const adm = await api('GET', '/api/v1/admin/freight', { token: S.admin.token });
  assert.equal(adm.status, 200);
  assert.ok(adm.body.items.length >= 4);
  assert.equal((await api('GET', '/api/v1/admin/freight', { token: S.buyer.token })).status, 403);
  assert.equal((await api('DELETE', `/api/v1/admin/freight/${S.load}`, { token: S.admin.token })).status, 200);
  assert.equal((await api('GET', `/api/v1/freight/${S.load}`)).status, 404);
});
