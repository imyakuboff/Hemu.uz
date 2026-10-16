const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'movexgo-test-'));
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(tmp, 'test.db');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.OTP_DEV_ECHO = '1';

const db = require('../src/db');
const { seed } = require('../seed');
const { boot } = require('../src/server');

let server;
let base;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function api(method, url, { token, body, lang, currency, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (lang) headers['X-Lang'] = lang;
  if (currency) headers['X-Currency'] = currency;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(base + url, { method, headers, body: payload });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

async function login(phone, extra = {}) {
  const r1 = await api('POST', '/api/v1/auth/otp/request', { body: { phone, ...extra } });
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  const r2 = await api('POST', '/api/v1/auth/otp/verify', { body: { phone, code: r1.body.dev_code, ...extra } });
  assert.equal(r2.status, 200, JSON.stringify(r2.body));
  return r2.body;
}

const S = {};

before(async () => {
  seed(process.env.DB_FILE);
  db.close();
  const app = boot(process.env.DB_FILE);
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
  S.seller = await login('+998901234567');
  S.buyer = await login('+998 90 765-43-21');
  S.admin = await login('+998900000001');
});

after(() => {
  server.close();
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('meta: 10 til, 8 mamlakat, RTL', async () => {
  const uz = await api('GET', '/api/v1/meta?lang=uz');
  assert.equal(uz.body.languages.length, 10);
  assert.equal(uz.body.countries.length, 8);
  assert.match(uz.body.countries.find((c) => c.code === 'KZ').name, /^Qozog/);
  assert.equal(uz.body.countries.find((c) => c.code === 'TM').dial_code, '+993');
  assert.equal(uz.body.deal_types[0].label, 'Sotuv');
  const prs = await api('GET', '/api/v1/meta', { lang: 'fa-AF' });
  assert.equal(prs.body.lang, 'prs');
  assert.equal(prs.body.dir, 'rtl');
  assert.equal(prs.body.deal_types[1].label, 'کرایه');
  const kk = await api('GET', '/api/v1/meta?lang=kk');
  assert.equal(kk.body.countries.find((c) => c.code === 'UZ').name, 'Өзбекстан');
  assert.equal(kk.body.currency, 'UZS');
  const regions = await api('GET', '/api/v1/geo/countries/KG/regions?lang=ky');
  assert.ok(regions.body.some((r) => r.name === 'Ысык-Көл облусу'));
});

test('xatolar foydalanuvchi tilida', async () => {
  for (const [lang, text] of [['uz', "Telefon raqami noto'g'ri"], ['ru', 'Неверный номер телефона'], ['tk', 'Telefon belgisi nädogry'], ['ps', 'د تلیفون شمېره ناسمه ده']]) {
    const r = await api('POST', '/api/v1/auth/otp/request', { lang, body: { phone: '12345' } });
    assert.equal(r.status, 422);
    assert.equal(r.body.error.code, 'invalid_phone');
    assert.equal(r.body.error.message, text);
  }
  const r = await api('GET', '/api/v1/me', { lang: 'az' });
  assert.equal(r.status, 401);
  assert.equal(r.body.error.message, 'Avtorizasiya tələb olunur');
});

test('telefon: mamlakatlar va +7 (KZ/RU) ajratish', async () => {
  const { normalizePhone } = require('../src/geo');
  assert.deepEqual(normalizePhone('90 123 45 67', 'UZ'), { e164: '+998901234567', country: 'UZ' });
  assert.equal(normalizePhone('+7 701 123 45 67').country, 'KZ');
  assert.equal(normalizePhone('+7 916 123 45 67').country, 'RU');
  assert.equal(normalizePhone('8 916 123 45 67', 'RU').e164, '+79161234567');
  assert.equal(normalizePhone('0555 123 456', 'KG').e164, '+996555123456');
  assert.equal(normalizePhone('+993 65 123456').country, 'TM');
  assert.equal(normalizePhone('+93 70 123 4567').country, 'AF');
  assert.equal(normalizePhone('+994 50 123 45 67').country, 'AZ');
  assert.equal(normalizePhone('+992 90 123 4567').country, 'TJ');
  assert.equal(normalizePhone('+998 90 123'), null);
});

test('kategoriyalar: daraxt, sonlar, ko\'p tilli qidiruv', async () => {
  const r = await api('GET', '/api/v1/categories?lang=ru');
  assert.equal(r.body.length, 7);
  assert.equal(r.body[0].name, 'Спецтехника');
  assert.ok(r.body[0].count >= 3);
  for (const q of ['экскаватор', 'ekskavator', 'Excavator', 'Ekskawator']) {
    const s = await api('GET', `/api/v1/categories?q=${encodeURIComponent(q)}`);
    assert.ok(s.body.length >= 1, q);
    assert.ok(s.body[0].children.some((c) => c.slug === 'excavators'), q);
  }
});

test('bosh sahifa', async () => {
  const r = await api('GET', '/api/v1/home?lang=ru', { token: S.buyer.token });
  assert.equal(r.status, 200);
  assert.equal(r.body.hero.total_active, 16);
  assert.equal(r.body.categories.length, 7);
  assert.equal(r.body.popular.length, 4);
  assert.equal(r.body.recent.length, 4);
  assert.ok(r.body.recommended.length >= 1);
  assert.ok(r.body.popular[0].views >= r.body.popular[1].views);
});

test('qidiruv: lotin/kirill, filtrlar, valyuta konvertatsiyasi', async () => {
  const lat = await api('GET', '/api/v1/listings?q=ekskavator');
  const cyr = await api('GET', `/api/v1/listings?q=${encodeURIComponent('экскаватор')}`);
  assert.ok(lat.body.total >= 2);
  assert.equal(lat.body.total, cyr.body.total);
  const jcb = await api('GET', '/api/v1/listings?q=JCB&sort=price_desc&facets=1&currency=USD');
  assert.ok(jcb.body.total >= 5);
  assert.equal(jcb.body.items[0].price.currency, 'USD');
  assert.ok(jcb.body.items[0].price.converted);
  assert.equal(jcb.body.items[0].price.original.currency, 'UZS');
  assert.ok(jcb.body.facets.brands.some((b) => b.value === 'JCB'));
  // 1 050 000 000 so'm ~ 83 000 USD: 80k–90k oralig'ida topiladi
  const range = await api('GET', '/api/v1/listings?price_min=80000&price_max=90000&currency=USD');
  assert.ok(range.body.items.some((x) => x.title === 'Экскаватор-погрузчик JCB 3CX'));
  // Anonim foydalanuvchiga standart mamlakat (UZ) valyutasida ko'rsatiladi
  const kz = await api('GET', '/api/v1/listings?country=KZ&deal_type=rent&lang=uz');
  assert.equal(kz.body.total, 1);
  assert.equal(kz.body.items[0].price.currency, 'UZS');
  assert.match(kz.body.items[0].price.formatted, /soʻm \/ soat dan$/);
  assert.equal(kz.body.items[0].price.original.amount, 18000);
  const rentRu = await api('GET', '/api/v1/listings?country=KZ&deal_type=rent&lang=ru&currency=KZT');
  assert.ok(rentRu.body.items[0].price.formatted.startsWith('от '));
  assert.ok(rentRu.body.items[0].price.formatted.endsWith('/ ч'));
  const verified = await api('GET', '/api/v1/listings?verified=1');
  assert.ok(verified.body.items.every((x) => x.seller.verified));
  const count = await api('GET', '/api/v1/listings/count?category=special&year_min=2020');
  assert.equal(count.body.total, 2);
});

test("e'lon sahifasi: ko'rishlar, o'xshashlar, telefon", async () => {
  const list = await api('GET', '/api/v1/listings?q=JCB 3CX&category=backhoe-loaders');
  const id = list.body.items.find((x) => x.title === 'Экскаватор-погрузчик JCB 3CX').id;
  S.jcbId = id;
  const before1 = (await api('GET', `/api/v1/listings/${id}`, { token: S.buyer.token })).body.views;
  const d = await api('GET', `/api/v1/listings/${id}?lang=en`, { token: S.buyer.token });
  assert.equal(d.body.views, before1, "bir kunda bitta ko'rish");
  assert.equal(d.body.seller.name, 'ООО «ТехноПарк»');
  assert.equal(d.body.seller.verified, true);
  assert.equal(d.body.seller.rating, 4.9);
  assert.match(d.body.seller.phone_masked, /\*\*\*/);
  assert.ok(d.body.similar.length >= 1);
  assert.equal(d.body.is_favorite, true);
  assert.equal(d.body.facts.condition_label, 'Used');
  const anon = await api('POST', `/api/v1/listings/${id}/phone`);
  assert.equal(anon.status, 401);
  const ph = await api('POST', `/api/v1/listings/${id}/phone`, { token: S.buyer.token });
  assert.equal(ph.body.phone, '+998901234567');
});

test("e'lon yaratish → moderatsiya → admin tasdiqlashi → saqlangan qidiruv bildirishnomasi", async () => {
  const tj = await login('+992 93 555 1122', { name: 'Rustam' });
  assert.equal(tj.user.country, 'TJ');
  assert.equal(tj.user.currency, 'TJS');
  const bad = await api('POST', '/api/v1/listings', {
    token: tj.token, lang: 'ru',
    body: { deal_type: 'sale', category: 'special', subcategory: 'backhoe-loaders', title: 'JCB 3CX 2018', description: 'Звоните +998 90 111 22 33 в любое время' },
  });
  assert.equal(bad.status, 422);
  assert.equal(bad.body.error.code, 'contacts_in_text');
  const wrongSub = await api('POST', '/api/v1/listings', { token: tj.token, body: { deal_type: 'sale', category: 'special', subcategory: 'filters', title: 'JCB 3CX 2018' } });
  assert.equal(wrongSub.status, 422);
  assert.equal(wrongSub.body.error.details.subcategory, 'invalid');

  const c = await api('POST', '/api/v1/listings', {
    token: tj.token,
    body: {
      deal_type: 'sale', category: 'special', subcategory: 'backhoe-loaders', title: 'JCB 3CX 2018, Toshkent', brand: 'JCB', model: '3CX', year: 2018,
      condition: 'used', price: 70000, currency: 'USD', country: 'UZ', region: 'tashkent-city', city: 'Toshkent',
      description: "Yaxshi holatda, 6 000 m/s, hujjatlar joyida. Ko'rish mumkin.", attrs: [{ label: 'Kovsh', value: '1 m³' }],
    },
  });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  assert.equal(c.body.status, 'draft');
  assert.equal(c.body.attrs[0].label, 'Kovsh');
  const id = c.body.id;

  const noPhoto = await api('POST', `/api/v1/listings/${id}/publish`, { token: tj.token });
  assert.equal(noPhoto.status, 422);
  assert.equal(noPhoto.body.error.details.photos, 'required');

  const fake = new FormData();
  fake.append('files', new Blob([Buffer.from('not an image')], { type: 'image/png' }), 'x.png');
  assert.equal((await api('POST', `/api/v1/listings/${id}/photos`, { token: tj.token, form: fake })).status, 422);

  const form = new FormData();
  form.append('files', new Blob([PNG], { type: 'image/png' }), 'a.png');
  form.append('files', new Blob([PNG], { type: 'image/png' }), 'b.png');
  const up = await api('POST', `/api/v1/listings/${id}/photos`, { token: tj.token, form });
  assert.equal(up.status, 201);
  assert.equal(up.body.length, 2);
  const img = await fetch(up.body[0].url.startsWith('http') ? up.body[0].url : base + up.body[0].url);
  assert.equal(img.status, 200);

  const other = await api('PATCH', `/api/v1/listings/${id}`, { token: S.buyer.token, body: { price: 1 } });
  assert.equal(other.status, 403);

  const pub = await api('POST', `/api/v1/listings/${id}/publish`, { token: tj.token });
  assert.equal(pub.body.status, 'moderation');
  assert.equal((await api('GET', `/api/v1/listings/${id}`)).status, 404, "moderatsiyadagi e'lon ko'rinmaydi");

  assert.equal((await api('GET', '/api/v1/admin/listings', { token: S.buyer.token })).status, 403);
  const queue = await api('GET', '/api/v1/admin/listings', { token: S.admin.token });
  assert.ok(queue.body.items.some((x) => x.id === id));
  const ok = await api('POST', `/api/v1/admin/listings/${id}/approve`, { token: S.admin.token });
  assert.equal(ok.body.status, 'active');

  const n = await api('GET', '/api/v1/notifications?lang=uz', { token: S.buyer.token });
  const hit = n.body.items.find((x) => x.type === 'saved_search');
  assert.ok(hit, 'saqlangan qidiruv bo\'yicha bildirishnoma');
  assert.equal(hit.text, "«JCB 3CX · Узбекистан» bo'yicha yangi e'lon: JCB 3CX 2018, Toshkent");
  const own = await api('GET', '/api/v1/notifications?lang=tg', { token: tj.token });
  assert.equal(own.body.items[0].text, 'Эълон нашр шуд — JCB 3CX 2018, Toshkent');

  const mine = await api('GET', '/api/v1/my/listings', { token: tj.token });
  assert.equal(mine.body.counts.active, 1);
  S.tj = tj;
  S.tjListing = id;
});

test('narx o\'zgarishi saralaganlarga xabar beradi', async () => {
  await api('PUT', `/api/v1/favorites/${S.tjListing}`, { token: S.buyer.token });
  const p = await api('PATCH', `/api/v1/listings/${S.tjListing}`, { token: S.tj.token, body: { price: 65000 } });
  assert.equal(p.status, 200);
  assert.equal(p.body.status, 'active');
  const n = await api('GET', '/api/v1/notifications?lang=ru', { token: S.buyer.token });
  const x = n.body.items.find((i) => i.type === 'price_changed');
  assert.match(x.text, /^Цена в избранном изменилась — JCB 3CX 2018, Toshkent: 65\s000\s\$$/);
  const fav = await api('GET', '/api/v1/favorites', { token: S.buyer.token });
  assert.ok(fav.body.items.find((i) => i.id === S.tjListing).price_changed);
});

test('chat va ariza', async () => {
  const lead = await api('POST', `/api/v1/listings/${S.tjListing}/leads`, { token: S.buyer.token, body: { kind: 'inspection', message: 'Ertaga ko\'rsam bo\'ladimi?', preferred_at: 'ertaga 10:00' } });
  assert.equal(lead.status, 201);
  const own = await api('POST', `/api/v1/listings/${S.tjListing}/leads`, { token: S.tj.token, body: {} });
  assert.equal(own.status, 409);

  const convs = await api('GET', '/api/v1/conversations', { token: S.tj.token });
  assert.equal(convs.body.items.length, 1);
  assert.equal(convs.body.items[0].unread, 1);
  const cid = convs.body.items[0].id;
  const reply = await api('POST', `/api/v1/conversations/${cid}/messages`, { token: S.tj.token, body: { body: 'Ha, kutaman.' } });
  assert.equal(reply.status, 201);
  const form = new FormData();
  form.append('body', 'Hujjat');
  form.append('file', new Blob([Buffer.from('%PDF-1.4 test')], { type: 'application/pdf' }), 'doc.pdf');
  const att = await api('POST', `/api/v1/conversations/${cid}/messages`, { token: S.tj.token, form });
  assert.equal(att.status, 201);
  const fileUrl = att.body.attachment.replace(/^https?:\/\/[^/]+/, '');
  assert.equal((await fetch(base + fileUrl)).status, 401);
  assert.equal((await fetch(base + fileUrl, { headers: { Authorization: `Bearer ${S.buyer.token}` } })).status, 200);
  assert.equal((await fetch(base + fileUrl, { headers: { Authorization: `Bearer ${S.seller.token}` } })).status, 403);

  const badges = await api('GET', '/api/v1/badges', { token: S.buyer.token });
  assert.ok(badges.body.messages >= 2);
  await api('POST', `/api/v1/conversations/${cid}/read`, { token: S.buyer.token });
  const msgs = await api('GET', `/api/v1/conversations/${cid}/messages`, { token: S.buyer.token });
  assert.equal(msgs.body.items.length, 3);
  assert.ok(msgs.body.items.every((m) => m.read || m.sender_id === S.buyer.user.id));
  assert.equal((await api('GET', `/api/v1/conversations/${cid}/messages`, { token: S.seller.token })).status, 403);
  const leads = await api('GET', '/api/v1/seller/leads?lang=ru', { token: S.tj.token });
  assert.equal(leads.body.items[0].status_label, 'Новая заявка');
});

test('buyurtma: zaxira, holatlar, sharh, reyting', async () => {
  const list = await api('GET', '/api/v1/listings?q=32/925346');
  const filter = list.body.items[0];
  assert.equal(filter.facts.stock_qty, 12);
  const tooMany = await api('POST', '/api/v1/orders', { token: S.buyer.token, body: { listing_id: filter.id, qty: 100, delivery_method: 'pickup' } });
  assert.equal(tooMany.status, 409);
  assert.equal(tooMany.body.error.code, 'out_of_stock');
  const noAddr = await api('POST', '/api/v1/orders', { token: S.buyer.token, body: { listing_id: filter.id, qty: 1, delivery_method: 'courier' } });
  assert.equal(noAddr.status, 422);

  const o = await api('POST', '/api/v1/orders', { token: S.buyer.token, lang: 'ru', body: { listing_id: filter.id, qty: 3, delivery_method: 'courier', delivery_address: 'Toshkent, Chilonzor 5' } });
  assert.equal(o.status, 201);
  assert.match(o.body.number, /^MG-\d{6}$/);
  assert.equal(o.body.total, 1860000);
  assert.deepEqual(o.body.actions, ['cancel']);
  const id = o.body.id;

  assert.equal((await api('POST', `/api/v1/orders/${id}/confirm`, { token: S.buyer.token })).status, 403);
  const conf = await api('POST', `/api/v1/orders/${id}/confirm`, { token: S.seller.token, body: { delivery_cost: 50000, eta: '2 kun' } });
  assert.equal(conf.body.status, 'confirmed');
  assert.equal(conf.body.total, 1910000);
  assert.equal((await api('GET', `/api/v1/listings/${filter.id}`)).body.facts.stock_qty, 9);
  await api('POST', `/api/v1/orders/${id}/ship`, { token: S.seller.token, body: { carrier: 'BTS', tracking: 'BTS-1' } });
  const done = await api('POST', `/api/v1/orders/${id}/complete`, { token: S.buyer.token, lang: 'kk' });
  assert.equal(done.body.status_label, 'Аяқталды');
  assert.deepEqual(done.body.actions, ['review']);
  assert.equal(done.body.events.length, 4);

  const rv = await api('POST', `/api/v1/orders/${id}/review`, { token: S.buyer.token, body: { rating: 4, text: 'Yaxshi' } });
  assert.equal(rv.status, 201);
  assert.equal((await api('POST', `/api/v1/orders/${id}/review`, { token: S.buyer.token, body: { rating: 5 } })).status, 409);
  const co = await api('GET', `/api/v1/companies/${filter.seller.company_id}/reviews`);
  assert.equal(co.body.total, 2);

  const inv = await api('GET', `/api/v1/orders/${id}/invoice`, { token: S.buyer.token });
  assert.equal(inv.body.vat_rate, 12);
  assert.ok(inv.body.vat_included > 0);

  // Bekor qilish zaxirani qaytaradi
  const o2 = await api('POST', '/api/v1/orders', { token: S.buyer.token, body: { listing_id: filter.id, qty: 2, delivery_method: 'pickup' } });
  await api('POST', `/api/v1/orders/${o2.body.id}/confirm`, { token: S.seller.token });
  assert.equal((await api('GET', `/api/v1/listings/${filter.id}`)).body.facts.stock_qty, 7);
  await api('POST', `/api/v1/orders/${o2.body.id}/cancel`, { token: S.seller.token, body: { reason: 'test' } });
  assert.equal((await api('GET', `/api/v1/listings/${filter.id}`)).body.facts.stock_qty, 9);

  const my = await api('GET', '/api/v1/orders?tab=active', { token: S.buyer.token });
  assert.ok(my.body.counts.completed >= 2);
});

test("xaridor so'rovi va sotuvchi taklifi", async () => {
  const r = await api('POST', '/api/v1/requests', {
    token: S.buyer.token,
    body: { want: 'equipment', deal_type: 'rent', category: 'special', subcategory: 'backhoe-loaders', title: 'JCB 3CX ijaraga, 2 hafta', description: "Chirchiqdagi obyekt uchun operator bilan ijaraga kerak.", region: 'tashkent', budget_max: 300000, currency: 'UZS' },
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.ok(r.body.notified_sellers >= 1);
  const n = await api('GET', '/api/v1/notifications?lang=en', { token: S.seller.token });
  assert.ok(n.body.items.some((x) => x.text === 'New buyer request in your category — JCB 3CX ijaraga, 2 hafta'));
  const feed = await api('GET', '/api/v1/requests?mine_categories=1', { token: S.seller.token });
  assert.ok(feed.body.items.some((x) => x.id === r.body.id));
  const off = await api('POST', `/api/v1/requests/${r.body.id}/offers`, { token: S.seller.token, body: { message: 'Bizda bor, operator bilan.', price: 280000, currency: 'UZS' } });
  assert.equal(off.status, 201);
  assert.equal((await api('POST', `/api/v1/requests/${r.body.id}/offers`, { token: S.seller.token, body: { message: 'Yana bir bor' } })).status, 409);
  const mine = await api('GET', `/api/v1/requests/${r.body.id}`, { token: S.buyer.token });
  assert.equal(mine.body.offers.length, 1);
  assert.equal(mine.body.offers[0].seller.name, 'ООО «ТехноПарк»');
  const acc = await api('POST', `/api/v1/requests/${r.body.id}/offers/${off.body.id}/accept`, { token: S.buyer.token });
  assert.equal(acc.body.status, 'accepted');
});

test('sotuvchi kabineti', async () => {
  const d = await api('GET', '/api/v1/seller/dashboard?lang=ru', { token: S.seller.token });
  assert.equal(d.status, 200);
  assert.equal(d.body.company.name, 'ООО «ТехноПарк»');
  assert.ok(d.body.stats.active_listings.value >= 6);
  assert.ok(d.body.stats.views.value > 1000);
  assert.ok(d.body.stats.views.change_pct > 0);
  assert.equal(d.body.views_chart.length, 7);
  assert.ok(d.body.views_chart.every((x) => typeof x.label === 'string' && x.views >= 0));
  assert.ok(d.body.profile.completeness > 50);
  assert.ok(d.body.inbox.length >= 1);
  assert.equal(d.body.listings.length, 3);
  assert.ok(d.body.events.length >= 1);
});

test('kompaniya: yaratish, rekvizit o\'zgarsa qayta tekshiruv', async () => {
  // Tojikistonda STIR (RMA) — 9 raqam; tashkiliy shakl majburiy
  const noForm = await api('POST', '/api/v1/my/company', { token: S.tj.token, body: { name: 'Rustam Trade', country: 'TJ', tin: '012345678' } });
  assert.equal(noForm.body.error.details.legal_form, 'required');
  const badTin = await api('POST', '/api/v1/my/company', { token: S.tj.token, body: { name: 'Rustam Trade', country: 'TJ', legal_form: 'ooo', tin: '0123456789' } });
  assert.equal(badTin.body.error.details.tin, 'invalid');
  const c = await api('POST', '/api/v1/my/company', { token: S.tj.token, body: { name: 'Rustam Trade', country: 'TJ', legal_form: 'ooo', region: 'sughd', city: 'Хуҷанд', tin: '012 345 678', bank_code: '350101626', bank_account: '20202972100012345678' } });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  assert.equal(c.body.tin, '012345678');
  assert.deepEqual(c.body.missing_docs, ['reg_cert']);
  assert.equal(c.body.verification, 'none');
  const form = new FormData();
  form.append('doc_type', 'charter');
  form.append('files', new Blob([Buffer.from('%PDF-1.4 x')], { type: 'application/pdf' }), 'ustav.pdf');
  const v0 = await api('POST', '/api/v1/my/company/verification', { token: S.tj.token, form });
  assert.equal(v0.body.verification, 'none', 'guvohnomasiz tekshiruvga yuborilmaydi');
  const form2 = new FormData();
  form2.append('doc_type', 'reg_cert');
  form2.append('files', new Blob([Buffer.from('%PDF-1.4 x')], { type: 'application/pdf' }), 'guvohnoma.pdf');
  const v = await api('POST', '/api/v1/my/company/verification', { token: S.tj.token, form: form2 });
  assert.equal(v.body.verification, 'pending');
  assert.deepEqual(v.body.documents.map((d) => d.doc_type), ['charter', 'reg_cert']);
  const ok = await api('POST', `/api/v1/admin/companies/${c.body.id}/verify`, { token: S.admin.token });
  assert.equal(ok.body.verification, 'verified');
  const p = await api('PATCH', '/api/v1/my/company', { token: S.tj.token, body: { tin: '999999999' } });
  assert.equal(p.body.verification, 'pending');
});

test('valyuta kurslari: admin yangilaydi, narxlar qayta hisoblanadi', async () => {
  const before1 = await api('GET', `/api/v1/listings/${S.jcbId}?currency=USD`);
  const r = await api('PUT', '/api/v1/admin/rates', { token: S.admin.token, body: { UZS: 12650 * 2 } });
  assert.equal(r.status, 200);
  const after1 = await api('GET', `/api/v1/listings/${S.jcbId}?currency=USD`);
  assert.ok(Math.abs(after1.body.price.amount * 2 - before1.body.price.amount) < 2000);
  assert.equal((await api('PUT', '/api/v1/admin/rates', { token: S.admin.token, body: { XYZ: 1 } })).status, 422);
  await api('PUT', '/api/v1/admin/rates', { token: S.admin.token, body: { UZS: 12650 } });
  const conv = await api('GET', '/api/v1/currencies/convert?amount=100&from=USD&to=KZT&lang=kk');
  assert.equal(conv.body.value, 50500);
});

test('SSE oqimi xabarni real vaqtda yetkazadi', async () => {
  const ctrl = new AbortController();
  const res = await fetch(`${base}/api/v1/stream?token=${S.buyer.token}`, { signal: ctrl.signal });
  assert.equal(res.status, 200);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (!buf.includes('event: hello')) buf += dec.decode((await reader.read()).value);
  const convs = await api('GET', '/api/v1/conversations', { token: S.tj.token });
  await api('POST', `/api/v1/conversations/${convs.body.items[0].id}/messages`, { token: S.tj.token, body: { body: 'SSE test' } });
  while (!buf.includes('SSE test')) buf += dec.decode((await reader.read()).value);
  assert.match(buf, /event: message/);
  ctrl.abort();
});

test('sessiyalar va chiqish', async () => {
  const s = await api('GET', '/api/v1/auth/sessions', { token: S.tj.token });
  assert.ok(s.body.some((x) => x.current));
  const me = await api('PATCH', '/api/v1/me', { token: S.tj.token, body: { lang: 'tg', currency: 'USD', notifications: { news: true } } });
  assert.equal(me.body.lang, 'tg');
  assert.equal(me.body.notifications.news, true);
  const out = await api('POST', '/api/v1/auth/logout', { token: S.tj.token });
  assert.equal(out.status, 200);
  assert.equal((await api('GET', '/api/v1/me', { token: S.tj.token })).status, 401);
});
