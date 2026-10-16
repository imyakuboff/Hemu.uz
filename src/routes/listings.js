const crypto = require('node:crypto');
const { Router } = require('express');
const db = require('../db');
const config = require('../config');
const cats = require('../lib/categories');
const money = require('../lib/money');
const L = require('../lib/listings');
const upload = require('../lib/upload');
const { notify } = require('../lib/notify');
const { requireAuth, rateLimit } = require('../lib/auth');
const { fail, notFound, forbidden, validate, paging, pageResult, parseJson } = require('../lib/http');
const { COUNTRY, CURRENCY_CODES, isValidRegion, normalizePhone } = require('../geo');
const { pick } = require('../i18n');
const { catCounts } = require('./meta');
const pay = require('../lib/payments');
const { companyFor, canManageListing } = require('../lib/company');
const { ensureConversation, postMessage } = require('./chat');

const r = Router();
const ctx = (req) => ({ lang: req.lang, currency: req.currency, favs: L.favoritesSet(req.user?.id) });
const today = () => new Date().toISOString().slice(0, 10);

// ---------- Bosh sahifa ----------
r.get('/home', (req, res) => {
  const c = ctx(req);
  const counts = catCounts();
  const n = Math.min(12, Number(req.query.limit) || 4);
  const country = req.query.country ? String(req.query.country).toUpperCase() : null;
  const geo = country && COUNTRY[country] ? 'AND l.country = ?' : '';
  const gp = geo ? [country] : [];

  const popular = L.cardsByIds(`SELECT l.* FROM listings l WHERE l.status = 'active' ${geo} ORDER BY l.views DESC, l.id DESC LIMIT ?`, [...gp, n], c);
  // VIP / GOLD / PREMIUM karusellari (har safar tartib aralashtiriladi — hamma reklama beruvchi ko'rinadi)
  const tiers = Object.fromEntries(['vip', 'gold', 'premium'].map((tr) => [tr, L.cardsByIds(
    `SELECT l.* FROM listings l WHERE l.status = 'active' AND l.tier = ? AND l.tier_until > datetime('now') ${geo} ORDER BY random() LIMIT 16`, [tr, ...gp], c,
  )]));
  const exclude = popular.map((x) => x.id);

  // Tavsiyalar: foydalanuvchi saralagan kategoriyalar, bo'lmasa uning mamlakati
  let recommended = [];
  if (req.user) {
    const favCats = db.all(
      `SELECT DISTINCT l.subcategory_id AS id FROM favorites f JOIN listings l ON l.id = f.listing_id WHERE f.user_id = ? AND l.subcategory_id IS NOT NULL LIMIT 5`,
      req.user.id,
    ).map((x) => x.id);
    if (favCats.length) {
      recommended = L.cardsByIds(
        `SELECT l.* FROM listings l WHERE l.status = 'active' AND l.subcategory_id IN (${favCats.map(() => '?').join(',')})
         AND l.user_id != ? AND l.id NOT IN (SELECT listing_id FROM favorites WHERE user_id = ?) ORDER BY l.bumped_at DESC LIMIT ?`,
        [...favCats, req.user.id, req.user.id, n],
        c,
      );
    }
  }
  if (recommended.length < n) {
    const have = [...exclude, ...recommended.map((x) => x.id)];
    const more = L.cardsByIds(
      `SELECT l.* FROM listings l WHERE l.status = 'active' AND l.country = ? ${have.length ? `AND l.id NOT IN (${have.map(() => '?').join(',')})` : ''}
       ORDER BY l.views * 0.3 + (julianday(l.bumped_at) - julianday('now')) * 10 DESC LIMIT ?`,
      [country || req.country, ...have, n - recommended.length],
      c,
    );
    recommended = recommended.concat(more);
  }

  const recent = L.cardsByIds(`SELECT l.* FROM listings l WHERE l.status = 'active' ${geo} ORDER BY l.published_at DESC, l.id DESC LIMIT ?`, [...gp, n], c);
  const total = db.get(`SELECT COUNT(*) AS n FROM listings WHERE status = 'active'`).n;
  const topBrands = db.all(`SELECT brand FROM listings WHERE status = 'active' AND brand IS NOT NULL GROUP BY LOWER(brand) ORDER BY COUNT(*) DESC LIMIT 3`).map((x) => x.brand);
  const roots = cats.load().roots;

  res.json({
    tiers,
    hero: { total_active: total, directions: roots.length, popular_queries: topBrands },
    categories: roots.map((x) => ({ id: x.id, slug: x.slug, icon: x.icon, kind: x.kind, name: pick(x.names, req.lang), count: counts.get(x.id) || 0 })),
    popular,
    recommended,
    recent,
  });
});

// ---------- Katalog / qidiruv / lenta ----------
r.get('/listings', (req, res) => {
  const pg = paging(req.query);
  const c = ctx(req);
  const { rows, total } = L.search(req.query, c, pg);
  const out = pageResult(rows, total, pg);
  if (req.query.facets === '1') out.facets = L.facets(req.query, c);
  if (req.query.q && pg.page === 1) require('./discover').logSearch(req.query.q, total);
  out.currency = req.currency;
  res.json(out);
});

// "Подходит N объявлений" — filtr sahifasi uchun tezkor hisob
r.get('/listings/count', (req, res) => {
  const { rows, total } = L.search(req.query, ctx(req), { page: 1, perPage: 1, offset: 0 });
  res.json({ total, sample: rows[0] || null });
});

r.get('/listings/facets', (req, res) => {
  res.json(L.facets(req.query, ctx(req)));
});

function loadListing(id) {
  const l = db.get('SELECT * FROM listings WHERE id = ?', Number(id));
  if (!l) notFound();
  return l;
}
const canManage = (req, l) => canManageListing(req.user, l);

r.get('/listings/:id', (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return next();
  const l = loadListing(req.params.id);
  if (l.status !== 'active' && !canManage(req, l)) notFound();
  if (l.status === 'active' && req.user?.id !== l.user_id) countView(req, l);
  const c = ctx(req);
  const out = L.detail(db.get('SELECT * FROM listings WHERE id = ?', l.id), c);
  out.similar = similar(l, c, 4);
  out.is_owner = req.user?.id === l.user_id;
  out.serial = require('./trust').serialCheck(l);
  out.price_history = priceHistory(l, req);
  out.rent = l.deal_type === 'rent';
  // Tahrirlash formasi uchun xom qiymatlar (faqat egasiga)
  if (canManage(req, l)) {
    const raw = db.get('SELECT * FROM listings WHERE id = ?', l.id);
    out.edit = {
      ...Object.fromEntries(Object.entries(raw).filter(([k]) => !['search_text', 'price_usd', 'views'].includes(k))),
      category: cats.byId(raw.category_id)?.slug,
      subcategory: cats.byId(raw.subcategory_id)?.slug,
      compatibility: parseJson(raw.compatibility, []),
      attrs: parseJson(raw.attrs, []),
      delivery: parseJson(raw.delivery, null),
    };
  }
  res.json(out);
});

function priceHistory(l, req) {
  return db.all('SELECT price, currency, changed_at FROM price_history WHERE listing_id = ? ORDER BY id', l.id)
    .map((h) => ({ price: h.price, currency: h.currency, formatted: money.formatAmount(h.price, h.currency, req.lang), at: h.changed_at }));
}

r.get('/listings/:id/price-history', (req, res) => {
  res.json(priceHistory(loadListing(req.params.id), req));
});

// Solishtirish: ?ids=1,2,3 (4 tagacha)
r.get('/compare', (req, res) => {
  const ids = String(req.query.ids || '').split(',').map(Number).filter(Boolean).slice(0, 4);
  const c = ctx(req);
  const items = ids.map((id) => db.get(`SELECT * FROM listings WHERE id = ? AND status = 'active'`, id)).filter(Boolean).map((l) => L.detail(l, c));
  res.json(items);
});

r.get('/listings/:id/similar', (req, res) => {
  const l = loadListing(req.params.id);
  res.json(similar(l, ctx(req), Math.min(12, Number(req.query.limit) || 6)));
});

function similar(l, c, n) {
  return L.cardsByIds(
    `SELECT l.* FROM listings l WHERE l.status = 'active' AND l.id != ? AND (l.subcategory_id = ? OR (? IS NULL AND l.category_id = ?))
     ORDER BY (l.country = ?) DESC, ABS(COALESCE(l.price_usd, 0) - ?) ASC LIMIT ?`,
    [l.id, l.subcategory_id, l.subcategory_id, l.category_id, l.country, l.price_usd || 0, n],
    c,
  );
}

function countView(req, l) {
  const viewer = req.user ? `u${req.user.id}` : `a${crypto.createHash('sha1').update(`${req.ip}|${req.get('user-agent') || ''}`).digest('hex').slice(0, 16)}`;
  const day = today();
  const ins = db.run('INSERT OR IGNORE INTO listing_view_log (listing_id, viewer, day) VALUES (?, ?, ?)', l.id, viewer, day);
  if (!ins.changes) return;
  db.run('UPDATE listings SET views = views + 1 WHERE id = ?', l.id);
  bumpStat(l.id, 'views');
  // Qayerdan kelgani: frontend X-View-Source yuboradi (search, catalog, home, telegram ...)
  const src = String(req.get('x-view-source') || 'direct').toLowerCase().replace(/[^a-z_]/g, '').slice(0, 20) || 'direct';
  db.run(
    `INSERT INTO listing_view_sources (listing_id, day, source, n) VALUES (?, ?, ?, 1)
     ON CONFLICT(listing_id, day, source) DO UPDATE SET n = n + 1`,
    l.id, day, src,
  );
}

function recordPrice(id) {
  const l = db.get('SELECT price, currency FROM listings WHERE id = ?', id);
  if (!l || l.price === null) return;
  const last = db.get('SELECT price, currency FROM price_history WHERE listing_id = ? ORDER BY id DESC LIMIT 1', id);
  if (!last || last.price !== l.price || last.currency !== l.currency) db.insert('price_history', { listing_id: id, price: l.price, currency: l.currency });
}

function bumpStat(listingId, field) {
  db.run(
    `INSERT INTO listing_stats (listing_id, day, ${field}) VALUES (?, ?, 1)
     ON CONFLICT(listing_id, day) DO UPDATE SET ${field} = ${field} + 1`,
    listingId, today(),
  );
}

// ---------- Yaratish / tahrirlash ----------
const CONTACT_RE = /(\+?\d[\d\s\-()]{7,}\d)|([^\s@]+@[^\s@]+\.[a-z]{2,})|(t\.me\/|wa\.me\/|@[a-z0-9_]{4,})/i;

const RULES = {
  deal_type: { type: 'enum', values: ['sale', 'rent', 'service'], required: true },
  category: { type: 'string', required: true },
  subcategory: { type: 'string', required: true },
  title: { type: 'string', min: 5, max: 80, required: true },
  description: { type: 'string', max: 5000 },
  price: { type: 'number', min: 0, max: 1e13 },
  currency: { type: 'enum', values: CURRENCY_CODES },
  price_unit: { type: 'enum', values: ['total', 'hour', 'day', 'shift', 'ton', 'm3', 'piece', 'bag', 'load'] },
  price_from: { type: 'bool' },
  negotiable: { type: 'bool' },
  vat_rate: { type: 'number', min: 0, max: 30 },
  leasing: { type: 'bool' },
  condition: { type: 'enum', values: ['new', 'used'] },
  brand: { type: 'string', max: 60 },
  model: { type: 'string', max: 60 },
  year: { type: 'int', min: 1950, max: new Date().getFullYear() + 1 },
  hours: { type: 'int', min: 0, max: 1e6 },
  mileage_km: { type: 'int', min: 0, max: 1e7 },
  power_hp: { type: 'int', min: 0, max: 5000 },
  weight_kg: { type: 'int', min: 0, max: 1e6 },
  capacity_t: { type: 'number', min: 0, max: 2000 },
  drive: { type: 'string', max: 40 },
  part_number: { type: 'string', max: 60 },
  serial_number: { type: 'string', max: 40 },
  grade: { type: 'string', max: 40 },
  size_text: { type: 'string', max: 60 },
  pack: { type: 'string', max: 60 },
  manufacturer: { type: 'string', max: 80 },
  warranty_months: { type: 'int', min: 0, max: 240 },
  analogs: { type: 'string', max: 200 },
  compatibility: { type: 'array', max: 30, itemMax: 60 },
  compatibility_note: { type: 'string', max: 500 },
  stock_qty: { type: 'int', min: 0, max: 1e7 },
  attrs: { type: 'array', max: 30 },
  delivery: { type: 'object' },
  docs: { type: 'string', max: 120 },
  with_operator: { type: 'bool' },
  min_order: { type: 'string', max: 60 },
  country: { type: 'enum', values: Object.keys(COUNTRY) },
  region: { type: 'string', max: 40 },
  city: { type: 'string', max: 80 },
  address: { type: 'string', max: 200 },
  location_note: { type: 'string', max: 200 },
  lat: { type: 'number', min: -90, max: 90 },
  lng: { type: 'number', min: -180, max: 180 },
  contact_name: { type: 'string', max: 80 },
  contact_phone: { type: 'string', max: 30 },
  contact_email: { type: 'string', max: 120, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  accept_messages: { type: 'bool' },
};

function prepare(req, body, existing) {
  // attrs: [{label, value}] — massiv ichidagi obyektlar alohida tekshiriladi
  const rawAttrs = body.attrs;
  const v = validate({ ...body, attrs: Array.isArray(rawAttrs) ? rawAttrs.map(() => 'x') : rawAttrs }, RULES, { partial: Boolean(existing) });
  if (Array.isArray(rawAttrs)) {
    v.attrs = rawAttrs
      .filter((a) => a && typeof a === 'object')
      .map((a) => ({ label: String(a.label || '').slice(0, 60), value: String(a.value || '').slice(0, 120) }))
      .filter((a) => a.label && a.value);
  }
  const merged = { ...(existing || {}), ...v };

  const catVal = v.category !== undefined ? v.category : existing && existing.category_id;
  const cat = cats.find(catVal);
  if (!cat || cat.parent_id) fail(422, 'err.validation', { category: 'invalid' });
  const subVal = v.subcategory !== undefined ? v.subcategory : existing && existing.subcategory_id;
  const sub = cats.find(subVal);
  if (!sub || sub.parent_id !== cat.id) fail(422, 'err.validation', { subcategory: 'invalid' });
  delete v.category;
  delete v.subcategory;
  v.category_id = cat.id;
  v.subcategory_id = sub.id;
  v.kind = cat.kind;

  for (const f of ['title', 'description']) {
    if (v[f] && CONTACT_RE.test(v[f])) fail(422, 'err.contacts_in_text', { [f]: 'contacts' });
  }
  v.country = merged.country || req.user.country;
  if (merged.region && !isValidRegion(v.country, merged.region)) fail(422, 'err.validation', { region: 'invalid' });
  if (!existing && !v.currency) v.currency = COUNTRY[v.country].currency;
  if (v.contact_phone) {
    const p = normalizePhone(v.contact_phone, v.country);
    if (!p) fail(422, 'err.invalid_phone', { contact_phone: 'invalid' });
    v.contact_phone = p.e164;
  }
  const currency = v.currency || existing?.currency;
  const price = v.price !== undefined ? v.price : existing?.price;
  v.price_usd = price === null || price === undefined ? null : money.toUsd(price, currency);
  return v;
}

r.post('/listings', requireAuth, rateLimit({ name: 'create', windowMs: 3600000, max: 300, key: (req) => req.user.id }), (req, res) => {
  const body = req.body || {};
  const v = prepare(req, body, null);
  const company = companyFor(req.user.id);
  const id = db.insert('listings', {
    ...v,
    user_id: req.user.id,
    company_id: company?.id || null,
    contact_name: v.contact_name || req.user.name,
    contact_phone: v.contact_phone || req.user.phone,
    contact_email: v.contact_email || req.user.email,
    status: 'draft',
  });
  db.run('UPDATE listings SET search_text = ? WHERE id = ?', L.buildSearchText(db.get('SELECT * FROM listings WHERE id = ?', id)), id);
  recordPrice(id);
  if (body.publish) submit(req, loadListing(id));
  res.status(201).json(L.detail(loadListing(id), ctx(req)));
});

r.patch('/listings/:id', requireAuth, (req, res) => {
  const l = loadListing(req.params.id);
  if (!canManage(req, l)) forbidden();
  if (l.status === 'sold') fail(409, 'err.invalid_status');
  const v = prepare(req, req.body || {}, l);
  const priceChanged = v.price !== undefined && v.price !== l.price;
  db.update('listings', l.id, { ...v, updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19) });
  const fresh = loadListing(l.id);
  db.run('UPDATE listings SET search_text = ? WHERE id = ?', L.buildSearchText(fresh), l.id);
  if (priceChanged) recordPrice(l.id);

  // Tasdiqlanmagan sotuvchi faol e'lonning matnini o'zgartirsa — qayta moderatsiya
  const textChanged = (v.title && v.title !== l.title) || (v.description && v.description !== l.description);
  if (l.status === 'active' && textChanged && !autoApproves(l)) db.run(`UPDATE listings SET status = 'moderation' WHERE id = ?`, l.id);
  if (l.status === 'rejected' && req.body?.publish) submit(req, loadListing(l.id));

  if (priceChanged && l.status === 'active' && fresh.price !== null) {
    for (const f of db.all('SELECT user_id FROM favorites WHERE listing_id = ? AND user_id != ?', l.id, l.user_id)) {
      notify(f.user_id, 'price_changed', { title: fresh.title, price_amount: fresh.price, price_currency: fresh.currency, listing_id: l.id }, `/listings/${l.id}`);
    }
  }
  if (req.body?.publish && l.status === 'draft') submit(req, loadListing(l.id));
  res.json(L.detail(loadListing(l.id), ctx(req)));
});

function autoApproves(l) {
  if (!config.autoApproveVerified || !l.company_id) return false;
  return db.get('SELECT verification FROM companies WHERE id = ?', l.company_id)?.verification === 'verified';
}

// Nashrga yuborish: to'liqlikni tekshirish -> moderatsiya yoki darhol faol
function submit(req, l) {
  if (!['draft', 'rejected', 'archived'].includes(l.status)) fail(409, 'err.invalid_status');
  const missing = {};
  // Tavsif ixtiyoriy — e'lon xarakteristikalar bilan yetarli
  if (l.price === null && !l.negotiable) missing.price = 'required';
  if (!l.contact_phone) missing.contact_phone = 'required';
  if (!l.city && !l.region) missing.city = 'required';
  if (!db.get('SELECT 1 FROM listing_photos WHERE listing_id = ?', l.id)) missing.photos = 'required';
  if (req.body?.accept_rules === false) missing.accept_rules = 'required';
  if (Object.keys(missing).length) fail(422, 'err.validation', missing);
  // Bepul tarif: faol + moderatsiyadagi e'lonlar chegarasi
  if (pay.activePlan(l.user_id).plan === 'free') {
    const n = db.get(`SELECT COUNT(*) AS n FROM listings WHERE user_id = ? AND id != ? AND status IN ('active', 'moderation')`, l.user_id, l.id).n;
    if (n >= config.freeListingLimit) fail(402, 'err.plan_limit', { limit: config.freeListingLimit });
  }
  if (autoApproves(l)) activate(l.id);
  else db.run(`UPDATE listings SET status = 'moderation', reject_reason = NULL WHERE id = ?`, l.id);
}

// Faollashtirish (moderatsiyadan o'tdi yoki tasdiqlangan kompaniya)
function activate(id) {
  db.run(
    `UPDATE listings SET status = 'active', reject_reason = NULL, published_at = COALESCE(published_at, datetime('now')),
       bumped_at = datetime('now'), expires_at = datetime('now', '+30 days') WHERE id = ?`,
    id,
  );
  const l = loadListing(id);
  notify(l.user_id, 'listing_approved', { title: l.title, listing_id: l.id }, `/listings/${l.id}`);
  // Kompaniya obunachilariga
  const notified = new Set([l.user_id]);
  if (l.company_id) {
    const comp = db.get('SELECT name FROM companies WHERE id = ?', l.company_id);
    for (const f of db.all('SELECT user_id FROM company_follows WHERE company_id = ?', l.company_id)) {
      if (notified.has(f.user_id)) continue;
      notified.add(f.user_id);
      notify(f.user_id, 'company_new_listing', { company: comp?.name, title: l.title, listing_id: l.id }, `/listing/${l.id}`);
    }
  }
  // Qiziqishlari mos foydalanuvchilarga (bo'lim yoki yo'nalish)
  const cat = cats.byId(l.subcategory_id) || cats.byId(l.category_id);
  for (const i of db.all('SELECT DISTINCT user_id FROM user_interests WHERE category_id IN (?, ?) LIMIT 2000', l.category_id, l.subcategory_id || 0)) {
    if (notified.has(i.user_id)) continue;
    notified.add(i.user_id);
    notify(i.user_id, 'interest', { category_slug: cat?.slug, category: cat ? pick(cat.names, 'ru') : '', title: l.title, listing_id: l.id }, `/listing/${l.id}`);
  }
  // Saqlangan qidiruvlar bo'yicha xabar berish
  for (const s of db.all('SELECT * FROM saved_searches WHERE notify = 1 AND user_id != ?', l.user_id)) {
    if (L.matchesQuery(l.id, parseJson(s.query, {}))) {
      db.run('UPDATE saved_searches SET new_count = new_count + 1 WHERE id = ?', s.id);
      notify(s.user_id, 'saved_search', { title: s.title, listing: l.title, listing_id: l.id, search_id: s.id }, `/listings/${l.id}`);
    }
  }
}

r.post('/listings/:id/publish', requireAuth, (req, res) => {
  const l = loadListing(req.params.id);
  if (!canManage(req, l)) forbidden();
  submit(req, l);
  res.json(L.detail(loadListing(l.id), ctx(req)));
});

const transition = (from, to) => (req, res) => {
  const l = loadListing(req.params.id);
  if (!canManage(req, l)) forbidden();
  if (!from.includes(l.status)) fail(409, 'err.invalid_status');
  db.run(`UPDATE listings SET status = ?, updated_at = datetime('now') WHERE id = ?`, to, l.id);
  res.json(L.detail(loadListing(l.id), ctx(req)));
};
r.post('/listings/:id/archive', requireAuth, transition(['active', 'moderation', 'rejected', 'draft'], 'archived'));
r.post('/listings/:id/sold', requireAuth, transition(['active', 'archived'], 'sold'));

// "Продлить" — ro'yxat boshiga ko'tarish va muddatni uzaytirish (sutkada 1 marta)
r.post('/listings/:id/bump', requireAuth, (req, res) => {
  const l = loadListing(req.params.id);
  if (!canManage(req, l)) forbidden();
  if (l.status !== 'active') fail(409, 'err.invalid_status');
  if (l.bumped_at && Date.now() - Date.parse(`${l.bumped_at}Z`) < 86400000 && req.user.role !== 'admin') fail(429, 'err.too_many');
  db.run(`UPDATE listings SET bumped_at = datetime('now'), expires_at = datetime('now', '+30 days') WHERE id = ?`, l.id);
  res.json(L.detail(loadListing(l.id), ctx(req)));
});

r.delete('/listings/:id', requireAuth, (req, res) => {
  const l = loadListing(req.params.id);
  if (!canManage(req, l)) forbidden();
  if (db.get(`SELECT 1 FROM orders WHERE listing_id = ? AND status NOT IN ('completed', 'cancelled')`, l.id)) fail(409, 'err.invalid_status');
  // Yumshoq o'chirish: 30 kun ichida tiklash mumkin, keyin fon vazifasi butunlay o'chiradi
  if (l.status === 'deleted' && req.query.permanent === '1') {
    for (const p of db.all('SELECT path FROM listing_photos WHERE listing_id = ?', l.id)) upload.removeUpload(p.path);
    db.run('DELETE FROM listings WHERE id = ?', l.id);
    return res.json({ ok: true, permanent: true });
  }
  db.run(`UPDATE listings SET status = 'deleted', deleted_at = datetime('now'), promoted_until = NULL WHERE id = ?`, l.id);
  res.json({ ok: true, status: 'deleted' });
});

// O'chirilgan e'lonni tiklash — arxivga qaytadi, keyin "Опубликовать"
r.post('/listings/:id/restore', requireAuth, (req, res) => {
  const l = loadListing(req.params.id);
  if (!canManage(req, l)) forbidden();
  if (l.status !== 'deleted') fail(409, 'err.invalid_status');
  db.run(`UPDATE listings SET status = 'archived', deleted_at = NULL WHERE id = ?`, l.id);
  res.json(L.detail(loadListing(l.id), ctx(req)));
});

// ---------- Rasmlar ----------
r.post('/listings/:id/photos', requireAuth, (req, res, next) => {
  const l = loadListing(req.params.id);
  if (!canManage(req, l)) forbidden();
  req.listing = l;
  next();
}, upload.photos.array('files', 15), (req, res) => {
  const l = req.listing;
  const files = upload.verifyFiles(req.files);
  const have = db.get('SELECT COUNT(*) AS n, COALESCE(MAX(sort), -1) AS mx FROM listing_photos WHERE listing_id = ?', l.id);
  if (have.n + files.length > 15) {
    for (const f of files) upload.removeUpload(`listings/${f.filename}`);
    fail(422, 'err.photo_limit');
  }
  files.forEach((f, i) => db.insert('listing_photos', { listing_id: l.id, path: `listings/${f.filename}`, sort: have.mx + 1 + i }));
  res.status(201).json(db.all('SELECT id, path FROM listing_photos WHERE listing_id = ? ORDER BY sort, id', l.id).map((p) => ({ id: p.id, url: L.fileUrl(p.path) })));
});

// Tartib: birinchisi — muqova ("Обложка")
r.put('/listings/:id/photos/order', requireAuth, (req, res) => {
  const l = loadListing(req.params.id);
  if (!canManage(req, l)) forbidden();
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : [];
  db.tx(() => ids.forEach((pid, i) => db.run('UPDATE listing_photos SET sort = ? WHERE id = ? AND listing_id = ?', i, pid, l.id)));
  res.json(db.all('SELECT id, path FROM listing_photos WHERE listing_id = ? ORDER BY sort, id', l.id).map((p) => ({ id: p.id, url: L.fileUrl(p.path) })));
});

r.delete('/listings/:id/photos/:photoId', requireAuth, (req, res) => {
  const l = loadListing(req.params.id);
  if (!canManage(req, l)) forbidden();
  const p = db.get('SELECT * FROM listing_photos WHERE id = ? AND listing_id = ?', Number(req.params.photoId), l.id);
  if (!p) notFound();
  upload.removeUpload(p.path);
  db.run('DELETE FROM listing_photos WHERE id = ?', p.id);
  res.json({ ok: true });
});

// ---------- Xaridor harakatlari ----------
r.post('/listings/:id/phone', requireAuth, rateLimit({ name: 'phone', windowMs: 3600000, max: 100, key: (req) => req.user.id }), (req, res) => {
  const l = loadListing(req.params.id);
  if (l.status !== 'active') notFound();
  if (req.user.id !== l.user_id) bumpStat(l.id, 'phone_reveals');
  const company = l.company_id ? db.get('SELECT work_hours FROM companies WHERE id = ?', l.company_id) : null;
  res.json({ phone: l.contact_phone, contact_name: l.contact_name, work_hours: company?.work_hours || null });
});

const LEAD_KINDS = ['general', 'inspection', 'invoice', 'compatibility', 'rent'];

// "Отправить заявку" / "Запросить счёт" / "Уточнить совместимость"
r.post('/listings/:id/leads', requireAuth, (req, res) => {
  const l = loadListing(req.params.id);
  if (l.status !== 'active') notFound();
  if (l.user_id === req.user.id) fail(409, 'err.own_listing');
  const v = validate(req.body, {
    kind: { type: 'enum', values: LEAD_KINDS },
    message: { type: 'string', max: 2000 },
    preferred_at: { type: 'string', max: 40 },
    qty: { type: 'int', min: 1, max: 100000 },
  });
  const kind = v.kind || 'general';
  const amount = l.price !== null ? l.price * (v.qty || 1) : null;
  const id = db.insert('leads', {
    listing_id: l.id,
    seller_id: l.user_id,
    buyer_id: req.user.id,
    kind,
    message: v.message,
    preferred_at: v.preferred_at,
    amount,
    currency: l.currency,
  });
  // Ariza chatda ham ko'rinadi
  const conv = ensureConversation(l, req.user.id);
  const text = v.message || `[${kind}] ${l.title}`;
  postMessage(conv, req.user, text, null, { silent: true });
  notify(l.user_id, 'lead', { name: req.user.name || req.user.phone, title: l.title, lead_id: id, kind }, `/seller/leads/${id}`);
  res.status(201).json({ id, kind, status: 'new', conversation_id: conv.id });
});

// ---------- Saralanganlar ----------
r.get('/favorites', requireAuth, (req, res) => {
  const pg = paging(req.query);
  const c = ctx(req);
  const total = db.get(`SELECT COUNT(*) AS n FROM favorites f JOIN listings l ON l.id = f.listing_id WHERE f.user_id = ?`, req.user.id).n;
  const rows = db.all(
    `SELECT ${L.CARD_COLS}, f.price_at_save, f.created_at AS saved_at FROM favorites f JOIN listings l ON l.id = f.listing_id
     WHERE f.user_id = ? ORDER BY f.created_at DESC LIMIT ? OFFSET ?`,
    req.user.id, pg.perPage, pg.offset,
  );
  const items = rows.map((row) => ({
    ...L.card(row, c),
    saved_at: row.saved_at,
    price_changed: row.price_at_save !== null && row.price !== null && row.price_at_save !== row.price,
    price_at_save: row.price_at_save,
    available: row.status === 'active',
  }));
  res.json(pageResult(items, total, pg));
});

r.put('/favorites/:listingId', requireAuth, (req, res) => {
  const l = loadListing(req.params.listingId);
  if (l.status !== 'active') notFound();
  const ins = db.run('INSERT OR IGNORE INTO favorites (user_id, listing_id, price_at_save) VALUES (?, ?, ?)', req.user.id, l.id, l.price);
  if (ins.changes) bumpStat(l.id, 'favorites');
  res.json({ listing_id: l.id, is_favorite: true });
});

r.delete('/favorites/:listingId', requireAuth, (req, res) => {
  db.run('DELETE FROM favorites WHERE user_id = ? AND listing_id = ?', req.user.id, Number(req.params.listingId));
  res.json({ listing_id: Number(req.params.listingId), is_favorite: false });
});

// ---------- Saqlangan qidiruvlar ----------
const SEARCH_KEYS = ['q', 'category', 'subcategory', 'deal_type', 'kind', 'country', 'region', 'city', 'price_min', 'price_max', 'year_min', 'year_max', 'condition', 'brand', 'verified', 'leasing', 'with_operator', 'in_stock', 'delivery', 'grade'];

r.get('/saved-searches', requireAuth, (req, res) => {
  const rows = db.all('SELECT * FROM saved_searches WHERE user_id = ? ORDER BY created_at DESC', req.user.id);
  res.json(rows.map((s) => {
    const query = parseJson(s.query, {});
    const total = L.search({ ...query }, { lang: req.lang, currency: query.currency || req.currency }, { page: 1, perPage: 1, offset: 0 }).total;
    return { id: s.id, title: s.title, query, notify: Boolean(s.notify), new_count: s.new_count, total, created_at: s.created_at };
  }));
});

r.post('/saved-searches', requireAuth, (req, res) => {
  const src = req.body?.query || {};
  const query = Object.fromEntries(SEARCH_KEYS.filter((k) => src[k] !== undefined && src[k] !== '').map((k) => [k, String(src[k]).slice(0, 200)]));
  query.currency = req.currency;
  const title = String(req.body?.title || query.q || 'Search').trim().slice(0, 80);
  if (db.get('SELECT COUNT(*) AS n FROM saved_searches WHERE user_id = ?', req.user.id).n >= 50) fail(429, 'err.too_many');
  const id = db.insert('saved_searches', { user_id: req.user.id, title, query, notify: req.body?.notify === false ? 0 : 1 });
  res.status(201).json({ id, title, query, notify: req.body?.notify !== false, new_count: 0 });
});

r.patch('/saved-searches/:id', requireAuth, (req, res) => {
  const s = db.get('SELECT * FROM saved_searches WHERE id = ? AND user_id = ?', Number(req.params.id), req.user.id);
  if (!s) notFound();
  db.update('saved_searches', s.id, {
    title: req.body?.title ? String(req.body.title).slice(0, 80) : undefined,
    notify: req.body?.notify === undefined ? undefined : req.body.notify ? 1 : 0,
  });
  res.json({ ok: true });
});

// "Посмотреть" — yangi e'lonlar hisoblagichini nolga tushirish
r.post('/saved-searches/:id/seen', requireAuth, (req, res) => {
  const n = db.run(`UPDATE saved_searches SET new_count = 0, last_viewed_at = datetime('now') WHERE id = ? AND user_id = ?`, Number(req.params.id), req.user.id).changes;
  if (!n) notFound();
  res.json({ ok: true });
});

r.delete('/saved-searches/:id', requireAuth, (req, res) => {
  db.run('DELETE FROM saved_searches WHERE id = ? AND user_id = ?', Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

// ---------- Mening e'lonlarim ----------
r.get('/my/listings', requireAuth, (req, res) => {
  const pg = paging(req.query, 20);
  const c = ctx(req);
  const status = String(req.query.status || '');
  const statuses = ['draft', 'moderation', 'active', 'rejected', 'archived', 'sold', 'deleted'];
  const where = statuses.includes(status) ? 'AND l.status = ?' : "AND l.status != 'deleted'";
  const params = statuses.includes(status) ? [req.user.id, status] : [req.user.id];
  const total = db.get(`SELECT COUNT(*) AS n FROM listings l WHERE l.user_id = ? ${where}`, ...params).n;
  const rows = db.all(
    `SELECT ${L.CARD_COLS},
       (SELECT COUNT(*) FROM conversations cv WHERE cv.listing_id = l.id) AS conversations,
       (SELECT COUNT(*) FROM favorites f WHERE f.listing_id = l.id) AS favorites_count
     FROM listings l WHERE l.user_id = ? ${where} ORDER BY l.updated_at DESC, l.id DESC LIMIT ? OFFSET ?`,
    ...params, pg.perPage, pg.offset,
  );
  const counts = Object.fromEntries(db.all('SELECT status, COUNT(*) AS n FROM listings WHERE user_id = ? GROUP BY status', req.user.id).map((x) => [x.status, x.n]));
  const out = pageResult(
    rows.map((row) => ({ ...L.card(row, c), conversations: row.conversations, favorites_count: row.favorites_count, reject_reason: row.reject_reason, expires_at: row.expires_at })),
    total,
    pg,
  );
  out.counts = counts;
  res.json(out);
});

module.exports = { router: r, activate, loadListing, bumpStat };
