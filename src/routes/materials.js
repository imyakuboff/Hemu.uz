// Qurilish materiallari bo'limi: rubrikalar bo'yicha son va eng arzon narx, do'konlar, statistika
const { Router } = require('express');
const db = require('../db');
const cats = require('../lib/categories');
const money = require('../lib/money');
const L = require('../lib/listings');
const demo = require('../lib/demo-materials');
const { requireAuth, requireAdmin } = require('../lib/auth');

const r = Router();
const VISIBLE = "l.status = 'active' AND l.deleted_at IS NULL";

r.get('/materials/overview', (req, res) => {
  const root = cats.bySlug('materials');
  if (!root) return res.json({ subs: [], stores: [], stats: {} });
  const country = /^[A-Z]{2}$/.test(String(req.query.country || '')) ? String(req.query.country) : null;
  const cw = country ? ' AND l.country = ?' : '';
  const cp = country ? [country] : [];
  const lang = req.lang;
  const currency = req.currency;

  // Har bir rubrika: e'lonlar soni va "...dan" narx (eng arzoni, o'z birligi bilan)
  const subs = root.children.map((s) => {
    const n = db.get(`SELECT COUNT(*) AS n FROM listings l WHERE ${VISIBLE} AND l.subcategory_id = ?${cw}`, s.id, ...cp).n;
    const cheap = n ? db.get(`SELECT * FROM listings l WHERE ${VISIBLE} AND l.subcategory_id = ? AND l.price IS NOT NULL${cw} ORDER BY l.price_usd ASC LIMIT 1`, s.id, ...cp) : null;
    return { slug: s.slug, name: cats.brief(s, lang).name, count: n, from: cheap ? money.priceView(cheap, lang, currency).formatted : null };
  });

  // Do'konlar: materiallar sotayotgan kompaniyalar (e'lonlari ko'p bo'lganlar birinchi)
  const stores = db.all(
    `SELECT c.id, c.name, c.logo, c.city, c.region, c.country, c.verification, c.rating_avg, c.rating_count,
       COUNT(l.id) AS listings, SUM(l.delivery IS NOT NULL) AS with_delivery
     FROM listings l JOIN companies c ON c.id = l.company_id
     WHERE ${VISIBLE} AND l.category_id = ? AND c.blocked = 0${cw}
     GROUP BY c.id ORDER BY (c.verification = 'verified') DESC, listings DESC LIMIT 8`,
    root.id, ...cp,
  ).map((c) => ({
    id: c.id, name: c.name, logo: L.fileUrl(c.logo), city: c.city, verified: c.verification === 'verified',
    rating: c.rating_count ? Math.round(c.rating_avg * 10) / 10 : null, reviews: c.rating_count, listings: c.listings, delivery: c.with_delivery > 0,
  }));

  const stats = db.get(
    `SELECT COUNT(*) AS listings, COUNT(DISTINCT l.user_id) AS sellers, SUM(l.delivery IS NOT NULL) AS with_delivery
     FROM listings l WHERE ${VISIBLE} AND l.category_id = ?${cw}`,
    root.id, ...cp,
  );
  res.json({ subs, stores, stats: { listings: stats.listings, sellers: stats.sellers, with_delivery: stats.with_delivery || 0 } });
});

// ---------- Admin: namuna (demo) materiallar ----------
const log = (req, action, n) => db.insert('admin_log', { admin_id: req.user.id, action, target_type: 'demo', target_id: null, details: JSON.stringify({ n }), ip: req.ip });
r.get('/admin/demo/materials', requireAuth, requireAdmin, (_req, res) => res.json({ count: demo.demoCount() }));
r.post('/admin/demo/materials', requireAuth, requireAdmin, (req, res) => {
  const out = demo.seedMaterialsDemo();
  log(req, 'demo.materials.add', out.created);
  res.json({ ...out, count: demo.demoCount() });
});
r.delete('/admin/demo/materials', requireAuth, requireAdmin, (req, res) => {
  const out = demo.removeMaterialsDemo();
  log(req, 'demo.materials.remove', out.removed);
  res.json({ ...out, count: demo.demoCount() });
});

module.exports = { router: r };
