// Mavsumiy aksiyalar: mavsum oralig'i, sotuvchi chegirmasi, kartochkadagi narx, admin boshqaruvi
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hemu-promo-'));
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(tmp, 'test.db');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.OTP_DEV_ECHO = '1';

const db = require('../src/db');
const { seed } = require('../seed');
const { boot } = require('../src/server');
const P = require('../src/lib/promos');

let server;
let base;
const S = {};

async function api(method, url, { token, body, lang = 'uz' } = {}) {
  const h = { 'X-Lang': lang };
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
  S.buyer = await login('+998907654321');
});

after(() => {
  server.close();
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('mavsum oralig\'i: oddiy va yil oxiridan o\'tadigan', () => {
  const d = (s) => new Date(`${s}T12:00:00`);
  const spring = { active: 1, start_md: '03-01', end_md: '05-31' };
  const winter = { active: 1, start_md: '10-01', end_md: '02-28' };
  assert.equal(P.inSeason(spring, d('2026-04-10')), true);
  assert.equal(P.inSeason(spring, d('2026-06-01')), false);
  assert.equal(P.inSeason(winter, d('2026-12-31')), true);
  assert.equal(P.inSeason(winter, d('2027-01-15')), true);
  assert.equal(P.inSeason(winter, d('2026-07-01')), false);
  assert.equal(P.inSeason({ active: 1, start_md: null, end_md: null }), true);
  assert.equal(P.isLive({ ...spring, active: 0 }, d('2026-04-10')), false);
  assert.equal(P.endsOn(winter, d('2026-11-01')), '2027-02-28');
  assert.equal(P.endsOn(spring, d('2026-04-01')), '2026-05-31');
});

test('aksiya: admin sozlaydi, sotuvchi chegirma qo\'yadi, kartochkada narx o\'zgaradi', async () => {
  // Boshlang'ich 3 ta aksiya bor; sinov uchun "qurilish"ni doimiy qilamiz
  const all = (await api('GET', '/api/v1/admin/promos', { token: S.admin.token })).body;
  assert.equal(all.length, 2);
  const q = all.find((p) => p.slug === 'qurilish');
  assert.equal((await api('PUT', `/api/v1/admin/promos/${q.id}`, { token: S.buyer.token, body: { start_md: '' } })).status, 403);
  assert.equal((await api('PUT', `/api/v1/admin/promos/${q.id}`, { token: S.admin.token, body: { start_md: '13-45' } })).status, 422);
  assert.equal((await api('PUT', `/api/v1/admin/promos/${q.id}`, { token: S.admin.token, body: { start_md: '', end_md: '' } })).status, 200);
  assert.ok((await api('GET', '/api/v1/promos')).body.some((p) => p.slug === 'qurilish'));

  // Sotuvchining narxli maxsus texnika e'loni
  const l = db.get(`SELECT l.* FROM listings l JOIN categories c ON c.id = l.category_id WHERE l.user_id = ? AND c.slug = 'special' AND l.status = 'active' AND l.price IS NOT NULL LIMIT 1`, S.seller.user.id);
  assert.ok(l, 'seed: maxsus texnika e\'loni');
  const opts = (await api('GET', `/api/v1/listings/${l.id}/promos`, { token: S.seller.token })).body;
  assert.ok(opts.items.some((p) => p.slug === 'qurilish'));
  assert.ok(!opts.items.some((p) => p.slug === 'qish')); // ehtiyot qismlar aksiyasi mos emas
  // Begona e'lon / noto'g'ri foiz / mos bo'lmagan aksiya
  assert.equal((await api('POST', `/api/v1/listings/${l.id}/promos/qurilish`, { token: S.buyer.token, body: { discount_pct: 10 } })).status, 403);
  assert.equal((await api('POST', `/api/v1/listings/${l.id}/promos/qurilish`, { token: S.seller.token, body: { discount_pct: 95 } })).status, 422);
  assert.equal((await api('POST', `/api/v1/listings/${l.id}/promos/qish`, { token: S.seller.token, body: { discount_pct: 10 } })).status, 422);
  assert.equal((await api('POST', `/api/v1/listings/${l.id}/promos/qurilish`, { token: S.seller.token, body: { discount_pct: 20 } })).status, 200);

  const page = (await api('GET', '/api/v1/promos/qurilish')).body;
  assert.equal(page.promo.slug, 'qurilish');
  assert.equal(page.total, 1);
  const c = page.items[0];
  assert.equal(c.id, l.id);
  assert.equal(c.promo.pct, 20);
  assert.ok(c.price.old_formatted);
  if (c.price.currency === l.currency) assert.equal(c.price.amount, Math.round(l.price * 80) / 100);
  assert.ok(!page.related.some((x) => x.id === l.id));
  // E'lon sahifasida ham chegirma
  const det = (await api('GET', `/api/v1/listings/${l.id}`)).body;
  assert.equal(det.promo?.pct, 20);

  // O'chirilgan aksiya — chegirma yo'qoladi
  assert.equal((await api('PUT', `/api/v1/admin/promos/${q.id}`, { token: S.admin.token, body: { active: false } })).status, 200);
  assert.equal((await api('GET', `/api/v1/listings/${l.id}`)).body.promo, null);
  assert.equal((await api('GET', '/api/v1/promos/qurilish')).status, 404);
  // Sotuvchi chiqib ketadi
  await api('PUT', `/api/v1/admin/promos/${q.id}`, { token: S.admin.token, body: { active: true } });
  assert.equal((await api('DELETE', `/api/v1/listings/${l.id}/promos/qurilish`, { token: S.seller.token })).status, 200);
  assert.equal((await api('GET', '/api/v1/promos/qurilish')).body.total, 0);

  // Yangi aksiya yaratish va o'chirish
  const cr = await api('POST', '/api/v1/admin/promos', { token: S.admin.token, body: { slug: 'navro-z', names: { uz: "Navro'z chegirmalari", ru: 'Навруз скидки' }, emoji: '🌷', theme: 'red', categories: ['special', 'nonsense'], max_discount: 30, start_md: '03-10', end_md: '03-31' } });
  assert.equal(cr.status, 201);
  assert.equal((await api('POST', '/api/v1/admin/promos', { token: S.admin.token, body: { slug: 'navro-z', names: { uz: 'x' } } })).status, 409);
  assert.deepEqual(db.get('SELECT categories FROM promos WHERE id = ?', cr.body.id).categories, '["special"]');
  assert.equal((await api('DELETE', `/api/v1/admin/promos/${cr.body.id}`, { token: S.admin.token })).status, 200);
});

test('sotuvchi aksiyasi: yaratish, moderatsiya, faqat o\x27z e\x27lonlari, cheklovlar', async () => {
  const d = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const mine = db.all("SELECT id FROM listings WHERE user_id = ? AND status = 'active' AND price IS NOT NULL LIMIT 3", S.seller.user.id).map((x) => x.id);
  const other = db.get("SELECT id FROM listings WHERE user_id <> ? AND status = 'active' AND price IS NOT NULL LIMIT 1", S.seller.user.id).id;
  // Noto'g'ri sanalar
  assert.equal((await api('POST', '/api/v1/my/promos', { token: S.seller.token, body: { name: 'Filtrlar haftaligi', discount_pct: 15, ends_on: d(-1) } })).status, 422);
  assert.equal((await api('POST', '/api/v1/my/promos', { token: S.seller.token, body: { name: 'Filtrlar haftaligi', discount_pct: 15, ends_on: d(200) } })).status, 422);
  const cr = await api('POST', '/api/v1/my/promos', { token: S.seller.token, body: { name: 'Filtrlar haftaligi', subtitle: 'JCB filtrlari arzon', discount_pct: 15, ends_on: d(10), listing_ids: [...mine, other] } });
  assert.equal(cr.status, 201, JSON.stringify(cr.body));
  assert.deepEqual(cr.body.listing_ids.sort(), [...mine].sort()); // begona e'lon qo'shilmadi
  const verified = db.get("SELECT c.verification FROM companies c WHERE c.owner_id = ?", S.seller.user.id)?.verification === 'verified';
  assert.equal(cr.body.status, verified ? 'active' : 'moderation');
  if (!verified) {
    assert.equal((await api('GET', `/api/v1/promos/${cr.body.slug}`)).status, 404);
    // Moderator tasdiqlaydi → sotuvchiga xabar
    assert.equal((await api('PUT', `/api/v1/admin/promos/${cr.body.id}`, { token: S.admin.token, body: { status: 'active' } })).status, 200);
    assert.ok(db.get("SELECT 1 FROM notifications WHERE user_id = ? AND type = 'promo_approved'", S.seller.user.id));
  }
  const page = (await api('GET', `/api/v1/promos/${cr.body.slug}`)).body;
  assert.equal(page.total, mine.length);
  assert.ok(page.promo.seller.name);
  assert.equal(page.items[0].promo.pct, 15);
  assert.ok((await api('GET', '/api/v1/promos')).body.some((p) => p.slug === cr.body.slug));
  // Boshqa sotuvchi bu aksiyaga e'lon qo'sha olmaydi
  const buyerListing = db.get('SELECT id FROM listings WHERE user_id = ? LIMIT 1', S.buyer.user.id);
  if (buyerListing) assert.equal((await api('POST', `/api/v1/listings/${buyerListing.id}/promos/${cr.body.slug}`, { token: S.buyer.token, body: { discount_pct: 10 } })).status, 403);
  // Chegirmani o'zgartirish e'lonlarga ham tushadi
  const up = await api('PUT', `/api/v1/my/promos/${cr.body.id}`, { token: S.seller.token, body: { discount_pct: 25 } });
  assert.equal(up.body.discount_pct, 25);
  assert.equal(db.get('SELECT discount_pct FROM promo_listings WHERE promo_id = ? LIMIT 1', cr.body.id).discount_pct, 25);
  // Boshqa foydalanuvchi tahrirlay olmaydi
  assert.equal((await api('PUT', `/api/v1/my/promos/${cr.body.id}`, { token: S.buyer.token, body: { discount_pct: 5 } })).status, 404);
  // Cheklov: 3 tadan ko'p emas
  for (let i = 0; i < 2; i += 1) await api('POST', '/api/v1/my/promos', { token: S.seller.token, body: { name: `Aksiya ${i + 2}`, discount_pct: 10, ends_on: d(5) } });
  assert.equal((await api('POST', '/api/v1/my/promos', { token: S.seller.token, body: { name: 'Ortiqcha aksiya', discount_pct: 10, ends_on: d(5) } })).status, 429);
  assert.equal((await api('GET', '/api/v1/my/promos', { token: S.seller.token })).body.items.length, 3);
  assert.equal((await api('DELETE', `/api/v1/my/promos/${cr.body.id}`, { token: S.seller.token })).status, 200);
  assert.equal((await api('GET', `/api/v1/listings/${mine[0]}`)).body.promo, null);
});
