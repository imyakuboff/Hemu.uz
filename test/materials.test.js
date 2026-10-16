// Qurilish materiallari: demo do'konlar, umumiy ma'lumot, material maydonlari va filtrlar
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hemu-mat-'));
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

async function api(method, url, { token, body, lang = 'uz' } = {}) {
  const h = { 'X-Lang': lang, 'X-Currency': 'UZS' };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(base + url, { method, headers: h, body: payload });
  return { status: res.status, body: await res.json() };
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
});

after(() => {
  server.close();
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('demo materiallar: faqat admin qo\'shadi, takrorlanmaydi, o\'chiriladi', async () => {
  assert.equal((await api('POST', '/api/v1/admin/demo/materials', { token: S.seller.token })).status, 403);
  const add = await api('POST', '/api/v1/admin/demo/materials', { token: S.admin.token });
  assert.equal(add.status, 200);
  assert.ok(add.body.created >= 20);
  assert.equal((await api('POST', '/api/v1/admin/demo/materials', { token: S.admin.token })).body.created, 0); // takror qo'shilmaydi

  const ov = (await api('GET', '/api/v1/materials/overview?country=UZ')).body;
  const cement = ov.subs.find((s) => s.slug === 'cement');
  assert.equal(cement.count, 3);
  assert.match(cement.from, /58[\s ]000/); // eng arzoni — M-400 qopi
  assert.match(cement.from, /qop/);
  assert.ok(ov.stores.length >= 4);
  assert.ok(ov.stores.every((s) => s.delivery));
  assert.ok(ov.stats.listings >= 24);

  // Material maydonlari va filtrlar
  const brick = (await api('GET', '/api/v1/listings?category=brick&grade=M-150')).body;
  assert.equal(brick.total, 1);
  assert.equal(brick.items[0].facts.grade, 'M-150');
  assert.equal(brick.items[0].facts.size_text, '250×120×88 mm');
  assert.equal(brick.items[0].facts.delivery, true);
  assert.ok((await api('GET', '/api/v1/listings?category=materials&delivery=1&per_page=60')).body.total >= 24);
  assert.equal((await api('GET', '/api/v1/listings?q=gazoblok')).body.items[0]?.subcategory?.slug, 'penoblok');
  const det = (await api('GET', `/api/v1/listings/${brick.items[0].id}`)).body;
  assert.equal(det.photos.length, 2);
  assert.match(det.photos[0].url, /^\/img\/materials\//);

  // Sotuvchi material e'lonini yangi maydonlar bilan joylaydi
  const cr = await api('POST', '/api/v1/listings', { token: S.seller.token, body: { deal_type: 'sale', category: 'materials', subcategory: 'shlakoblok', title: 'Shlakoblok M-100 sotiladi', price: 7000, currency: 'UZS', price_unit: 'piece', grade: 'M-100', size_text: '390×190×188 mm', pack: 'Poddon — 72 dona', city: 'Toshkent' } });
  assert.equal(cr.status, 201, JSON.stringify(cr.body));
  const mine = db.get('SELECT grade, size_text, pack, price_unit FROM listings WHERE id = ?', cr.body.id);
  assert.deepEqual({ ...mine }, { grade: 'M-100', size_text: '390×190×188 mm', pack: 'Poddon — 72 dona', price_unit: 'piece' });
  assert.equal((await api('POST', '/api/v1/listings', { token: S.seller.token, body: { deal_type: 'sale', category: 'materials', subcategory: 'sand', title: 'Qum KAMAZ bilan', price: 900000, price_unit: 'load', city: 'Toshkent' } })).status, 201);

  const del = await api('DELETE', '/api/v1/admin/demo/materials', { token: S.admin.token });
  assert.ok(del.body.removed >= 24);
  assert.equal(del.body.count, 0);
  assert.equal(db.get("SELECT COUNT(*) AS n FROM users WHERE phone LIKE '+99800000090%'").n, 0);
  assert.ok(db.get('SELECT 1 FROM listings WHERE id = ?', cr.body.id)); // haqiqiy e'lon qoldi
});
