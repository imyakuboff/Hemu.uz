// Sayt sahifalari: oferta/maxfiylik/FAQ matnlari, "Bog'lanish" murojaatlari, banner statistikasi,
// texnika narxlari va sotuvchilar reytingi.
const { Router } = require('express');
const db = require('../db');
const config = require('../config');
const money = require('../lib/money');
const pages = require('../lib/pages');
const banners = require('../lib/banners');
const cats = require('../lib/categories');
const L = require('../lib/listings');
const { notify } = require('../lib/notify');
const { requireAuth, rateLimit } = require('../lib/auth');
const { fail, notFound, validate } = require('../lib/http');
const { normalizePhone, countryName } = require('../geo');

const r = Router();

// ---------- Matnli sahifalar ----------
r.get('/pages/:key', (req, res) => {
  const p = pages.get(req.params.key, req.lang);
  if (!p) notFound();
  res.json(p);
});

// ---------- Bog'lanish: murojaatlar ----------
const TOPICS = ['question', 'payment', 'listing', 'complaint', 'ads', 'other'];
const supportLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 5, name: 'support' });

r.post('/support', supportLimit, (req, res) => {
  const v = validate(req.body, {
    name: { type: 'string', min: 2, max: 80, required: !req.user },
    phone: { type: 'string', max: 30, required: !req.user },
    topic: { type: 'enum', values: TOPICS },
    message: { type: 'string', min: 10, max: 3000, required: true },
  });
  let phone = req.user?.phone || null;
  if (v.phone) {
    const n = normalizePhone(v.phone, req.user?.country || config.defaultCountry);
    if (!n?.e164) fail(422, 'err.validation', { phone: 'invalid' });
    phone = n.e164;
  }
  const id = db.insert('support_tickets', { user_id: req.user?.id || null, name: v.name || req.user?.name || null, phone, topic: v.topic || 'other', message: v.message });
  // Admin va moderatorlarga xabar
  for (const a of db.all(`SELECT id FROM users WHERE role IN ('admin', 'moderator') AND blocked = 0`)) {
    notify(a.id, 'support_new', { name: v.name || req.user?.name || phone || '', text: v.message.slice(0, 120) }, `/admin/support?id=${id}`);
  }
  res.status(201).json({ id, status: 'new' });
});

r.get('/me/support', requireAuth, (req, res) => {
  res.json(db.all('SELECT id, topic, message, status, reply, replied_at, created_at FROM support_tickets WHERE user_id = ? ORDER BY id DESC LIMIT 50', req.user.id));
});

// ---------- Banner statistikasi: ko'rishlar va bosishlar ----------
const trackLimit = rateLimit({ windowMs: 60 * 1000, max: 60, name: 'bntrack' });
r.post('/banners/track', trackLimit, (req, res) => {
  const known = new Set(banners.all().map((b) => b.uid));
  const day = new Date().toISOString().slice(0, 10);
  const up = (uid, col) => {
    if (!known.has(uid)) return;
    db.run(`INSERT INTO banner_stats (uid, day, ${col}) VALUES (?, ?, 1) ON CONFLICT(uid, day) DO UPDATE SET ${col} = ${col} + 1`, uid, day);
  };
  const views = Array.isArray(req.body?.views) ? [...new Set(req.body.views.map(String))].slice(0, 10) : [];
  for (const uid of views) up(uid, 'views');
  if (req.body?.click) up(String(req.body.click), 'clicks');
  res.json({ ok: true });
});

// ---------- Texnika narxlari: brend + model bo'yicha o'rtacha narx ----------
r.get('/market/prices', (req, res) => {
  const where = [`l.status = 'active'`, 'l.price_usd > 0', `COALESCE(l.brand, '') != ''`, `COALESCE(l.model, '') != ''`];
  const p = [];
  const cat = req.query.category ? cats.find(req.query.category) : null;
  if (cat) { where.push(cat.parent_id ? 'l.subcategory_id = ?' : 'l.category_id = ?'); p.push(cat.id); }
  if (req.query.country) { where.push('l.country = ?'); p.push(String(req.query.country).toUpperCase()); }
  if (req.query.deal_type && ['sale', 'rent'].includes(req.query.deal_type)) { where.push('l.deal_type = ?'); p.push(req.query.deal_type); }
  else where.push(`l.deal_type = 'sale'`);
  if (req.query.q) { where.push('(l.brand || \' \' || l.model) LIKE ?'); p.push(`%${String(req.query.q).trim()}%`); }
  const rows = db.all(
    `SELECT l.brand, l.model, MIN(l.subcategory_id) AS sub, COUNT(*) AS n, AVG(l.price_usd) AS avg, MIN(l.price_usd) AS min, MAX(l.price_usd) AS max,
            MIN(l.year) AS year_min, MAX(l.year) AS year_max
     FROM listings l WHERE ${where.join(' AND ')}
     GROUP BY LOWER(l.brand), LOWER(l.model) ORDER BY n DESC, avg DESC LIMIT 100`,
    ...p,
  );
  const cur = req.currency;
  const fmt = (usd) => money.formatAmount(money.roundNice(money.fromUsd(usd, cur), cur), cur, req.lang);
  // Narx o'zgarishi: e'londagi birinchi narx (narx tarixi) bilan hozirgisi o'rtasidagi o'rtacha farq, %
  const trend = (brand, model) => {
    const ls = db.all(`SELECT id, price_usd FROM listings WHERE status = 'active' AND price_usd > 0 AND LOWER(brand) = LOWER(?) AND LOWER(model) = LOWER(?)`, brand, model);
    const diffs = [];
    for (const l of ls) {
      const h = db.get('SELECT price, currency FROM price_history WHERE listing_id = ? ORDER BY changed_at, id LIMIT 1', l.id);
      const first = h ? money.toUsd(h.price, h.currency) : 0;
      if (first > 0) diffs.push((l.price_usd - first) / first);
    }
    return diffs.length ? Math.round((diffs.reduce((a, b) => a + b, 0) / diffs.length) * 1000) / 10 : null;
  };
  res.json({
    currency: cur,
    items: rows.map((x) => ({
      brand: x.brand, model: x.model, count: x.n,
      subcategory: cats.brief(cats.byId(x.sub), req.lang),
      avg: fmt(x.avg), min: fmt(x.min), max: fmt(x.max), avg_usd: Math.round(x.avg),
      years: x.year_min ? (x.year_min === x.year_max ? String(x.year_min) : `${x.year_min}–${x.year_max}`) : null,
      trend_pct: trend(x.brand, x.model),
    })),
  });
});

// ---------- Sotuvchilar reytingi ----------
r.get('/market/sellers', (req, res) => {
  const where = ['c.blocked = 0'];
  const p = [];
  if (req.query.country) { where.push('c.country = ?'); p.push(String(req.query.country).toUpperCase()); }
  if (req.query.verified === '1') where.push(`c.verification = 'verified'`);
  const sort = {
    rating: 'c.rating_avg DESC, c.rating_count DESC, active DESC',
    reviews: 'c.rating_count DESC, c.rating_avg DESC',
    listings: 'active DESC, c.rating_avg DESC',
    deals: 'deals DESC, c.rating_avg DESC',
  }[req.query.sort] || 'c.rating_avg DESC, c.rating_count DESC, active DESC';
  const rows = db.all(
    `SELECT c.*, (SELECT COUNT(*) FROM listings WHERE company_id = c.id AND status = 'active') AS active,
            (SELECT COUNT(*) FROM orders WHERE seller_id = c.owner_id AND status = 'completed') AS deals
     FROM companies c WHERE ${where.join(' AND ')} ORDER BY ${sort} LIMIT 100`,
    ...p,
  );
  res.json(rows.map((c, i) => ({
    place: i + 1,
    id: c.id, name: c.name, activity: c.activity, logo: L.fileUrl(c.logo),
    verified: c.verification === 'verified',
    rating: Math.round(c.rating_avg * 10) / 10, reviews: c.rating_count,
    listings: c.active, deals: c.deals,
    city: c.city, country: c.country, country_name: countryName(c.country, req.lang),
    since: c.created_at.slice(0, 4),
  })));
});

module.exports = { router: r, TOPICS };
