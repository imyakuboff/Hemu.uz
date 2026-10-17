const { Router } = require('express');
const db = require('../db');
const cats = require('../lib/categories');
const money = require('../lib/money');
const { notify } = require('../lib/notify');
const { requireAuth, rateLimit } = require('../lib/auth');
const { fail, notFound, forbidden, validate, paging, pageResult } = require('../lib/http');
const { COUNTRY, CURRENCY_CODES, isValidRegion, regionName, countryName, normalizePhone } = require('../geo');
const upload = require('../lib/upload');

const r = Router();

const RULES = {
  want: { type: 'enum', values: ['equipment', 'part', 'service'], required: true },
  deal_type: { type: 'enum', values: ['sale', 'rent', 'service'] },
  category: { type: 'string', required: true },
  subcategory: { type: 'string', required: true },
  title: { type: 'string', min: 5, max: 120, required: true },
  description: { type: 'string', min: 10, max: 3000, required: true },
  condition: { type: 'enum', values: ['new', 'used', 'any'] },
  quantity: { type: 'string', max: 60 },
  budget_min: { type: 'number', min: 0 },
  budget_max: { type: 'number', min: 0 },
  currency: { type: 'enum', values: CURRENCY_CODES },
  country: { type: 'enum', values: Object.keys(COUNTRY) },
  region: { type: 'string', max: 40 },
  city: { type: 'string', max: 80 },
  needed_by: { type: 'string', max: 40 },
  contact_name: { type: 'string', max: 80 },
  contact_phone: { type: 'string', max: 30 },
  contact_email: { type: 'string', max: 120, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  company_name: { type: 'string', max: 120 },
  needs_delivery: { type: 'bool' },
  accept_messages: { type: 'bool' },
};

function requestView(x, req, { withOffers = false } = {}) {
  const { lang } = req;
  const fmt = (n) => (n === null || n === undefined ? null : money.formatAmount(n, x.currency || 'USD', lang));
  const isOwner = req.user?.id === x.user_id;
  const v = {
    id: x.id,
    want: x.want,
    deal_type: x.deal_type,
    category: cats.brief(cats.byId(x.category_id), lang),
    subcategory: cats.brief(cats.byId(x.subcategory_id), lang),
    title: x.title,
    description: x.description,
    condition: x.condition,
    quantity: x.quantity,
    budget: { min: x.budget_min, max: x.budget_max, currency: x.currency, formatted: [fmt(x.budget_min), fmt(x.budget_max)].filter(Boolean).join(' — ') || null },
    location: { country: x.country, country_name: countryName(x.country, lang), region: x.region, region_name: regionName(x.country, x.region, lang), city: x.city },
    needed_by: x.needed_by,
    needs_delivery: Boolean(x.needs_delivery),
    attachment: x.attachment ? `/api/v1/files/${x.attachment}` : null,
    status: x.status,
    offers_count: db.get('SELECT COUNT(*) AS n FROM request_offers WHERE request_id = ?', x.id).n,
    is_owner: isOwner,
    created_at: x.created_at,
  };
  if (req.user && !isOwner) {
    v.my_offer = db.get('SELECT id, price, currency, message, status FROM request_offers WHERE request_id = ? AND seller_id = ?', x.id, req.user.id) || null;
  }
  if (withOffers && isOwner) {
    v.contact = { name: x.contact_name, phone: x.contact_phone, email: x.contact_email, company: x.company_name };
    v.edit = { ...x, category: cats.byId(x.category_id)?.slug, subcategory: cats.byId(x.subcategory_id)?.slug };
    v.offers = db.all('SELECT * FROM request_offers WHERE request_id = ? ORDER BY id DESC', x.id).map((o) => {
      const u = db.get('SELECT name FROM users WHERE id = ?', o.seller_id);
      const c = db.get('SELECT id, name, verification, rating_avg, rating_count FROM companies WHERE owner_id = ?', o.seller_id);
      return {
        id: o.id,
        seller: { user_id: o.seller_id, name: c?.name || u?.name, company_id: c?.id || null, verified: c?.verification === 'verified', rating: c ? Math.round(c.rating_avg * 10) / 10 : 0, reviews_count: c?.rating_count || 0 },
        listing_id: o.listing_id,
        price: o.price,
        currency: o.currency,
        price_formatted: o.price !== null ? money.formatAmount(o.price, o.currency, lang) : null,
        message: o.message,
        status: o.status,
        created_at: o.created_at,
      };
    });
  }
  return v;
}

function prepare(req, body, existing) {
  const v = validate(body, RULES, { partial: Boolean(existing) });
  const cat = cats.find(v.category ?? existing?.category_id);
  if (!cat || cat.parent_id) fail(422, 'err.validation', { category: 'invalid' });
  const sub = cats.find(v.subcategory ?? existing?.subcategory_id);
  if (!sub || sub.parent_id !== cat.id) fail(422, 'err.validation', { subcategory: 'invalid' });
  delete v.category;
  delete v.subcategory;
  v.category_id = cat.id;
  v.subcategory_id = sub.id;
  v.country = v.country || existing?.country || req.user.country;
  if (v.region && !isValidRegion(v.country, v.region)) fail(422, 'err.validation', { region: 'invalid' });
  if (!v.currency && !existing) v.currency = COUNTRY[v.country].currency;
  if (v.budget_min && v.budget_max && v.budget_min > v.budget_max) fail(422, 'err.validation', { budget_max: 'min' });
  if (v.contact_phone) {
    const p = normalizePhone(v.contact_phone, v.country);
    if (!p) fail(422, 'err.invalid_phone');
    v.contact_phone = p.e164;
  }
  return v;
}

// Ochiq so'rovlar lentasi (sotuvchilar uchun): ?category=&country=&mine_categories=1
r.get('/requests', (req, res) => {
  const pg = paging(req.query, 20);
  const where = [`status = 'open'`];
  const params = [];
  const cat = cats.find(req.query.category);
  if (cat) {
    where.push(cat.parent_id ? 'subcategory_id = ?' : 'category_id = ?');
    params.push(cat.id);
  }
  if (req.query.country) {
    where.push('country = ?');
    params.push(String(req.query.country).toUpperCase());
  }
  // Matn bo'yicha qidiruv (sarlavha, tavsif, shahar)
  const q = String(req.query.q || '').trim().toLowerCase().slice(0, 80);
  if (q) {
    where.push("(LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(COALESCE(city, '')) LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  // Faqat sotuvchining e'lonlari bor bo'limlar
  if (req.query.mine_categories === '1' && req.user) {
    where.push(`subcategory_id IN (SELECT DISTINCT subcategory_id FROM listings WHERE user_id = ? AND status = 'active')`);
    params.push(req.user.id);
  }
  const sql = where.join(' AND ');
  const total = db.get(`SELECT COUNT(*) AS n FROM requests WHERE ${sql}`, ...params).n;
  const rows = db.all(`SELECT * FROM requests WHERE ${sql} ORDER BY id DESC LIMIT ? OFFSET ?`, ...params, pg.perPage, pg.offset);
  res.json(pageResult(rows.map((x) => requestView(x, req)), total, pg));
});

r.get('/my/requests', requireAuth, (req, res) => {
  const rows = db.all('SELECT * FROM requests WHERE user_id = ? ORDER BY id DESC', req.user.id);
  res.json(rows.map((x) => requestView(x, req)));
});

r.post('/requests', requireAuth, rateLimit({ name: 'req', windowMs: 3600000, max: 20, key: (req) => req.user.id }), (req, res) => {
  const v = prepare(req, req.body || {}, null);
  const draft = req.body?.draft === true;
  const id = db.insert('requests', {
    ...v,
    user_id: req.user.id,
    contact_name: v.contact_name || req.user.name,
    contact_phone: v.contact_phone || req.user.phone,
    contact_email: v.contact_email || req.user.email,
    status: draft ? 'draft' : 'open',
  });
  const n = draft ? 0 : openRequest(id, req.user.id);
  res.status(201).json({ ...requestView(db.get('SELECT * FROM requests WHERE id = ?', id), req, { withOffers: true }), notified_sellers: n });
});

// Nashr: 30 kun faol, mos sotuvchilarga xabar ("Поставщики придут к вам")
function openRequest(id, userId) {
  db.run(`UPDATE requests SET status = 'open', expires_at = datetime('now', '+30 days') WHERE id = ?`, id);
  const x = db.get('SELECT * FROM requests WHERE id = ?', id);
  // Mos sotuvchilar: avval aniq bo'lim, so'ng butun yo'nalish; o'sha viloyatdagilar birinchi.
  // (Avval faqat bo'lim bo'yicha qidirilardi — bo'lim tanlanmagan zayavkalar hech kimga yetmasdi)
  const sellers = db.all(
    `SELECT user_id FROM listings
     WHERE status = 'active' AND country = ? AND user_id != ? AND (subcategory_id = ? OR category_id = ?)
     GROUP BY user_id
     ORDER BY MAX(subcategory_id = ?) DESC, MAX(region = ?) DESC, MAX(bumped_at) DESC
     LIMIT 200`,
    x.country, userId, x.subcategory_id ?? -1, x.category_id, x.subcategory_id ?? -1, x.region ?? '',
  );
  for (const s of sellers) notify(s.user_id, 'request_match', { title: x.title, request_id: x.id }, `/requests/${x.id}`);
  return sellers.length;
}

r.post('/requests/:id/publish', requireAuth, (req, res) => {
  const x = db.get('SELECT * FROM requests WHERE id = ?', Number(req.params.id));
  if (!x) notFound();
  if (x.user_id !== req.user.id) forbidden();
  if (x.status === 'open') fail(409, 'err.invalid_status');
  const n = openRequest(x.id, req.user.id);
  res.json({ ...requestView(db.get('SELECT * FROM requests WHERE id = ?', x.id), req, { withOffers: true }), notified_sellers: n });
});

// "Прикрепить файл или фото" (texnik topshiriq)
r.post('/requests/:id/attachment', requireAuth, upload.docs.single('file'), (req, res) => {
  const x = db.get('SELECT * FROM requests WHERE id = ?', Number(req.params.id));
  if (!x || x.user_id !== req.user.id) {
    if (req.file) upload.removeUpload(`docs/${req.file.filename}`);
    if (!x) notFound();
    forbidden();
  }
  if (!req.file) fail(422, 'err.file_type');
  upload.verifyFiles([req.file]);
  upload.removeUpload(x.attachment);
  db.run('UPDATE requests SET attachment = ? WHERE id = ?', `docs/${req.file.filename}`, x.id);
  res.json(requestView(db.get('SELECT * FROM requests WHERE id = ?', x.id), req, { withOffers: true }));
});

r.get('/requests/:id', (req, res) => {
  const x = db.get('SELECT * FROM requests WHERE id = ?', Number(req.params.id));
  if (!x || (x.status !== 'open' && req.user?.id !== x.user_id)) notFound();
  res.json(requestView(x, req, { withOffers: true }));
});

r.patch('/requests/:id', requireAuth, (req, res) => {
  const x = db.get('SELECT * FROM requests WHERE id = ?', Number(req.params.id));
  if (!x) notFound();
  if (x.user_id !== req.user.id) forbidden();
  db.update('requests', x.id, prepare(req, req.body || {}, x));
  res.json(requestView(db.get('SELECT * FROM requests WHERE id = ?', x.id), req, { withOffers: true }));
});

r.post('/requests/:id/close', requireAuth, (req, res) => {
  const x = db.get('SELECT * FROM requests WHERE id = ?', Number(req.params.id));
  if (!x) notFound();
  if (x.user_id !== req.user.id) forbidden();
  db.run(`UPDATE requests SET status = 'closed' WHERE id = ?`, x.id);
  res.json({ ok: true });
});

// Sotuvchi taklifi
r.post('/requests/:id/offers', requireAuth, (req, res) => {
  const x = db.get('SELECT * FROM requests WHERE id = ?', Number(req.params.id));
  if (!x || x.status !== 'open') notFound();
  if (x.user_id === req.user.id) fail(409, 'err.own_listing');
  const v = validate(req.body, {
    message: { type: 'string', min: 5, max: 2000, required: true },
    price: { type: 'number', min: 0 },
    currency: { type: 'enum', values: CURRENCY_CODES },
    listing_id: { type: 'int' },
  });
  if (v.listing_id && !db.get(`SELECT 1 FROM listings WHERE id = ? AND user_id = ? AND status = 'active'`, v.listing_id, req.user.id)) {
    fail(422, 'err.validation', { listing_id: 'invalid' });
  }
  if (db.get('SELECT 1 FROM request_offers WHERE request_id = ? AND seller_id = ?', x.id, req.user.id)) fail(409, 'err.duplicate');
  const id = db.insert('request_offers', { request_id: x.id, seller_id: req.user.id, listing_id: v.listing_id, price: v.price, currency: v.currency || x.currency, message: v.message });
  const c = db.get('SELECT name FROM companies WHERE owner_id = ?', req.user.id);
  notify(x.user_id, 'offer', { name: c?.name || req.user.name || '—', title: x.title, request_id: x.id, offer_id: id }, `/requests/${x.id}`);
  res.status(201).json({ id, status: 'pending' });
});

r.post('/requests/:id/offers/:offerId/:action', requireAuth, (req, res) => {
  if (!['accept', 'reject'].includes(req.params.action)) notFound();
  const x = db.get('SELECT * FROM requests WHERE id = ?', Number(req.params.id));
  if (!x) notFound();
  if (x.user_id !== req.user.id) forbidden();
  const o = db.get('SELECT * FROM request_offers WHERE id = ? AND request_id = ?', Number(req.params.offerId), x.id);
  if (!o) notFound();
  const status = req.params.action === 'accept' ? 'accepted' : 'rejected';
  db.run('UPDATE request_offers SET status = ? WHERE id = ?', status, o.id);
  res.json({ id: o.id, status });
});

module.exports = { router: r };
