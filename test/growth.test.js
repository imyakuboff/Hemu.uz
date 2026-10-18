// Diler fidi (havola orqali avtomatik sinxronlash) va "Hozir texnika kerak" (tezkor ijara chaqiruvi)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hemu-growth-'));
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(tmp, 'test.db');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.OTP_DEV_ECHO = '1';
process.env.FEED_ALLOW_PRIVATE = '1';

const db = require('../src/db');
const { seed } = require('../seed');
const { boot } = require('../src/server');

let server;
let feedServer;
let base;
let feedBase;
const S = {};
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
let csv = '';

async function api(method, url, { token, body } = {}) {
  const h = { 'X-Lang': 'ru' };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(base + url, { method, headers: h, body: payload });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
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
  // Dilerning "sayti": CSV fayl va rasm
  feedServer = http.createServer((req, res) => {
    if (req.url.startsWith('/price.csv')) { res.setHeader('Content-Type', 'text/csv'); return res.end(csv); }
    if (req.url.startsWith('/img/')) { res.setHeader('Content-Type', 'image/png'); return res.end(PNG); }
    res.statusCode = 404; res.end();
  });
  await new Promise((r) => { feedServer.listen(0, r); });
  feedBase = `http://127.0.0.1:${feedServer.address().port}`;
  S.seller = await login('+998901234567');
  S.buyer = await login('+998907654321');
  S.driver = await login('+998977778899');
  S.other = await login('+998935551122');
});

after(() => {
  server.close();
  feedServer.close();
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const row = (id, title, price, extra = '') => `${id},sale,parts,filters,${title},Оригинал,${price},UZS,new,JCB,${title.split(' ').pop()},tashkent-city,Ташкент,${feedBase}/img/${id}.png${extra}`;
const HEAD = 'external_id,deal_type,category,subcategory,title,description,price,currency,condition,brand,part_number,region,city,photos';

test('diler fidi: yaratish, yangilash, yo\'qolganini arxivlash, qaytganini tiklash', async () => {
  const sellerId = db.get(`SELECT id FROM users WHERE phone = '+998901234567'`).id;
  db.run(`INSERT OR REPLACE INTO user_plans (user_id, plan, until, top_credits) VALUES (?, 'business', datetime('now', '+1 month'), 0)`, sellerId);
  // Ichki tarmoq manzili (test rejimidan tashqarida) va noto'g'ri sxema rad etiladi
  assert.equal((await api('PUT', '/api/v1/my/feed', { token: S.seller.token, body: { url: 'file:///etc/passwd' } })).status, 422);

  csv = [HEAD, row('A1', 'Фильтр масляный JCB 320/04133', 150000), row('B2', 'Фильтр воздушный JCB 32/917804', 280000)].join('\n');
  const put = await api('PUT', '/api/v1/my/feed', { token: S.seller.token, body: { url: `${feedBase}/price.csv` } });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  let run = await api('POST', '/api/v1/my/feed/run', { token: S.seller.token });
  assert.equal(run.status, 200, JSON.stringify(run.body));
  assert.equal(run.body.last_status, 'ok', run.body.last_error);
  assert.equal(run.body.stats.created, 2, JSON.stringify(run.body.stats));
  const a = db.get(`SELECT * FROM listings WHERE user_id = ? AND external_id = 'A1'`, sellerId);
  assert.equal(a.status, 'active');
  assert.equal(a.price, 150000);
  assert.ok(db.get('SELECT 1 FROM listing_photos WHERE listing_id = ?', a.id), 'rasm yuklanishi kerak');

  // 2-sinxron: A narxi o'zgardi, B o'chirildi, C qo'shildi
  csv = [HEAD, row('A1', 'Фильтр масляный JCB 320/04133', 165000), row('C3', 'Фильтр гидравлики JCB 32/925346', 410000)].join('\n');
  require('../src/lib/auth').resetRateLimits();
  run = await api('POST', '/api/v1/my/feed/run', { token: S.seller.token });
  assert.equal(run.body.stats.created, 1);
  assert.equal(run.body.stats.archived, 1);
  assert.equal(db.get(`SELECT price FROM listings WHERE user_id = ? AND external_id = 'A1'`, sellerId).price, 165000);
  assert.equal(db.get(`SELECT status FROM listings WHERE user_id = ? AND external_id = 'B2'`, sellerId).status, 'archived');
  // Takroriy chaqiruv 10 daqiqada bir marta
  assert.equal((await api('POST', '/api/v1/my/feed/run', { token: S.seller.token })).status, 429);

  // 3-sinxron: B qaytdi — qayta nashr qilinadi
  csv = [HEAD, row('A1', 'Фильтр масляный JCB 320/04133', 165000), row('B2', 'Фильтр воздушный JCB 32/917804', 280000), row('C3', 'Фильтр гидравлики JCB 32/925346', 410000)].join('\n');
  require('../src/lib/auth').resetRateLimits();
  run = await api('POST', '/api/v1/my/feed/run', { token: S.seller.token });
  assert.equal(run.body.stats.restored, 1, JSON.stringify(run.body.stats));
  assert.equal(db.get(`SELECT status FROM listings WHERE user_id = ? AND external_id = 'B2'`, sellerId).status, 'active');
  const view = await api('GET', '/api/v1/my/feed', { token: S.seller.token });
  assert.equal(view.body.listings, 3);
});

test('tezkor chaqiruv: yaqindagi egalarga xabar, birinchi qabul qilgan oladi', async () => {
  const cat = db.get(`SELECT id, parent_id, slug FROM categories WHERE slug = 'excavators'`);
  const uid = (p) => db.get('SELECT id FROM users WHERE phone = ?', p).id;
  const mk = (phone, lat, lng, region) => db.insert('listings', {
    user_id: uid(phone), title: 'Аренда экскаватора', kind: 'equipment', deal_type: 'rent', category_id: cat.parent_id, subcategory_id: cat.id,
    country: 'UZ', region, currency: 'UZS', price: 300000, price_unit: 'hour', status: 'active', lat, lng, bumped_at: '2026-10-01 00:00:00',
  });
  mk('+998901234567', 41.33, 69.25, 'tashkent-city'); // ~1 km
  mk('+998977778899', 41.47, 69.58, 'tashkent'); // Chirchiq ~30 km
  mk('+998935551122', 39.65, 66.96, 'samarkand'); // Samarqand ~260 km — xabar bormaydi

  // Joylashuvsiz — rad etiladi
  assert.equal((await api('POST', '/api/v1/urgent', { token: S.buyer.token, body: { category: 'excavators', hours: 4 } })).status, 422);
  const c = await api('POST', '/api/v1/urgent', { token: S.buyer.token, body: { category: 'excavators', hours: 4, lat: 41.32, lng: 69.24, address: 'Chilonzor 9', note: 'Xandaq qazish' } });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  assert.equal(c.body.notified, 2);
  assert.equal(c.body.status, 'open');
  // Ikkinchi ochiq chaqiruv mumkin emas
  assert.equal((await api('POST', '/api/v1/urgent', { token: S.buyer.token, body: { category: 'excavators', hours: 2, lat: 41.32, lng: 69.24 } })).status, 409);

  // Uzoqdagi ega ko'ra olmaydi; yaqindagi ega mijoz telefonini qabul qilmaguncha ko'rmaydi
  assert.equal((await api('GET', `/api/v1/urgent/${c.body.id}`, { token: S.other.token })).status, 403);
  const seen = await api('GET', `/api/v1/urgent/${c.body.id}`, { token: S.driver.token });
  assert.equal(seen.body.customer.phone, undefined);
  assert.ok(seen.body.target.distance_km > 20);
  const notif = await api('GET', '/api/v1/notifications', { token: S.driver.token });
  assert.ok(JSON.stringify(notif.body).includes('urgent_call'));

  // Birinchi qabul qilgan yutadi
  const won = await api('POST', `/api/v1/urgent/${c.body.id}/accept`, { token: S.driver.token });
  assert.equal(won.status, 200);
  assert.equal(won.body.status, 'taken');
  assert.equal(won.body.target.won, true);
  assert.equal(won.body.customer.phone, '+998907654321');
  const late = await api('POST', `/api/v1/urgent/${c.body.id}/accept`, { token: S.seller.token });
  assert.equal(late.status, 409);
  assert.equal(late.body.error.code, 'urgent_taken');
  // Mijoz ega telefonini ko'radi
  const mine = await api('GET', `/api/v1/urgent/${c.body.id}`, { token: S.buyer.token });
  assert.equal(mine.body.taker.phone, '+998977778899');
  const my = await api('GET', '/api/v1/my/urgent', { token: S.seller.token });
  assert.equal(my.body.incoming.length, 1);
  assert.equal(my.body.incoming[0].status, 'taken');
  // Formaning variantlari: ijaradagi bo'limlar
  const opts = await api('GET', '/api/v1/urgent-options');
  assert.ok(JSON.stringify(opts.body).includes('excavators'));
});

test("tezkor chaqiruv: o'z so'zi bilan yozish va ijara e'lonlaridan tanlash", async () => {
  const sub = db.get(`SELECT id, parent_id FROM categories WHERE slug = 'excavators'`);
  const uid = (p) => db.get('SELECT id FROM users WHERE phone = ?', p).id;
  // Uzoqdagi (Samarqand) ijara e'loni — mijoz uni o'zi tanlaydi
  const far = db.insert('listings', {
    user_id: uid('+998935551122'), title: 'Аренда JCB 3CX с гидромолотом', brand: 'JCB', model: '3CX', kind: 'equipment', deal_type: 'rent',
    category_id: sub.parent_id, subcategory_id: sub.id, country: 'UZ', region: 'samarkand', currency: 'UZS', price: 250000, price_unit: 'hour', status: 'active', lat: 39.65, lng: 66.96,
  });
  db.run('UPDATE listings SET search_text = ? WHERE id = ?', require('../src/lib/listings').buildSearchText(db.get('SELECT * FROM listings WHERE id = ?', far)), far);
  const token = (await login('+998901112244')).token;
  // Hech narsa ko'rsatilmasa — rad etiladi
  assert.equal((await api('POST', '/api/v1/urgent', { token, body: { hours: 3, lat: 41.32, lng: 69.24 } })).status, 422);
  // Faqat matn ("gidromolot bilan JCB") + tanlangan uzoqdagi e'lon
  const c = await api('POST', '/api/v1/urgent', { token, body: { what: 'JCB 3CX gidromolot bilan', listings: [far, 999999], hours: 3, lat: 41.32, lng: 69.24 } });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  assert.equal(c.body.what, 'JCB 3CX gidromolot bilan');
  assert.equal(c.body.picked.length, 1);
  assert.equal(c.body.picked[0].id, far);
  // Tanlangan e'lon egasi 250 km uzoqda bo'lsa ham xabar oldi
  const seen = await api('GET', `/api/v1/urgent/${c.body.id}`, { token: S.other.token });
  assert.equal(seen.status, 200);
  assert.ok(seen.body.target.distance_km > 200);
  const n = await api('GET', '/api/v1/notifications', { token: S.other.token });
  assert.ok(JSON.stringify(n.body).includes('JCB 3CX gidromolot bilan'));
  // Barcha bo'limlar (e'loni yo'qlari ham) formada bor
  const opts = await api('GET', '/api/v1/urgent-options');
  assert.ok(opts.body.some((g) => g.items.some((s) => s.count === 0)));
});
