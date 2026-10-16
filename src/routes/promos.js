// Mavsumiy aksiyalar: ro'yxat, aksiya sahifasi, sotuvchi e'lonini qo'shishi, admin boshqaruvi
const { Router } = require('express');
const db = require('../db');
const L = require('../lib/listings');
const cats = require('../lib/categories');
const P = require('../lib/promos');
const { requireAuth, requireStaff } = require('../lib/auth');
const { fail, notFound, forbidden, validate, paging, pageResult, parseJson } = require('../lib/http');

const r = Router();
const ctx = (req) => ({ lang: req.lang, currency: req.currency, favs: L.favoritesSet(req.user?.id) });
const VISIBLE = "l.status = 'active' AND l.deleted_at IS NULL";

// Aksiya kategoriyalariga mos SQL sharti
function catWhere(p) {
  const slugs = parseJson(p.categories, []);
  if (!slugs.length) return { sql: '1 = 1', params: [] };
  const ids = slugs.map((s) => cats.bySlug(s)?.id).filter(Boolean);
  if (!ids.length) return { sql: '0 = 1', params: [] };
  const q = ids.map(() => '?').join(',');
  return { sql: `(l.category_id IN (${q}) OR l.subcategory_id IN (${q}))`, params: [...ids, ...ids] };
}
const countOf = (p) => db.get(`SELECT COUNT(*) AS n FROM promo_listings pl JOIN listings l ON l.id = pl.listing_id WHERE pl.promo_id = ? AND ${VISIBLE}`, p.id).n;

// Faol aksiyalar (bosh sahifa)
r.get('/promos', (req, res) => {
  const rows = db.all('SELECT * FROM promos WHERE active = 1 ORDER BY sort, id').filter((p) => P.inSeason(p));
  res.json(rows.map((p) => P.view(p, req.lang, { count: countOf(p) })));
});

// Aksiya sahifasi: qatnashayotgan e'lonlar (eng katta chegirma birinchi) + mos e'lonlar
r.get('/promos/:slug', (req, res) => {
  const p = db.get('SELECT * FROM promos WHERE slug = ?', String(req.params.slug));
  if (!p || (!p.active && !(req.user && ['admin', 'moderator'].includes(req.user.role)))) notFound();
  const pg = paging(req.query, 24, 48);
  const c = ctx(req);
  const country = /^[A-Z]{2}$/.test(String(req.query.country || '')) ? req.query.country : null;
  const cw = country ? ' AND l.country = ?' : '';
  const cp = country ? [country] : [];
  const total = db.get(`SELECT COUNT(*) AS n FROM promo_listings pl JOIN listings l ON l.id = pl.listing_id WHERE pl.promo_id = ? AND ${VISIBLE}${cw}`, p.id, ...cp).n;
  const items = L.cardsByIds(
    `SELECT l.* FROM promo_listings pl JOIN listings l ON l.id = pl.listing_id WHERE pl.promo_id = ? AND ${VISIBLE}${cw} ORDER BY pl.discount_pct DESC, pl.created_at DESC LIMIT ? OFFSET ?`,
    [p.id, ...cp, pg.perPage, pg.offset], c,
  );
  const w = catWhere(p);
  const related = L.cardsByIds(
    `SELECT l.* FROM listings l WHERE ${VISIBLE} AND ${w.sql}${cw} AND l.id NOT IN (SELECT listing_id FROM promo_listings WHERE promo_id = ?) ORDER BY l.bumped_at DESC LIMIT 8`,
    [...w.params, ...cp, p.id], c,
  );
  res.json({ promo: P.view(p, req.lang, { count: total }), ...pageResult(items, total, pg), related });
});

// Sotuvchi: e'lon uchun mos faol aksiyalar va joriy ishtirok
r.get('/listings/:id/promos', requireAuth, (req, res) => {
  const l = db.get('SELECT * FROM listings WHERE id = ? AND deleted_at IS NULL', Number(req.params.id));
  if (!l) notFound();
  if (l.user_id !== req.user.id) forbidden();
  const root = cats.byId(l.category_id)?.slug;
  const sub = cats.byId(l.subcategory_id)?.slug;
  const joined = new Map(db.all('SELECT promo_id, discount_pct FROM promo_listings WHERE listing_id = ?', l.id).map((x) => [x.promo_id, x.discount_pct]));
  const rows = db.all('SELECT * FROM promos WHERE active = 1 ORDER BY sort, id').filter((p) => P.inSeason(p) && P.fits(p, root, sub));
  res.json({ has_price: l.price !== null, min: P.MIN_DISCOUNT, max: P.MAX_DISCOUNT, items: rows.map((p) => P.view(p, req.lang, { joined: joined.has(p.id), discount_pct: joined.get(p.id) || null })) });
});

r.post('/listings/:id/promos/:slug', requireAuth, (req, res) => {
  const l = db.get('SELECT * FROM listings WHERE id = ? AND deleted_at IS NULL', Number(req.params.id));
  if (!l) notFound();
  if (l.user_id !== req.user.id) forbidden();
  const p = db.get('SELECT * FROM promos WHERE slug = ?', String(req.params.slug));
  if (!p || !P.isLive(p)) notFound();
  if (l.price === null || l.price === undefined) fail(422, 'err.validation', { price: 'required' });
  if (!P.fits(p, cats.byId(l.category_id)?.slug, cats.byId(l.subcategory_id)?.slug)) fail(422, 'err.validation', { category: 'not_in_promo' });
  const v = validate(req.body, { discount_pct: { type: 'int', min: P.MIN_DISCOUNT, max: P.MAX_DISCOUNT, required: true } });
  db.run(
    `INSERT INTO promo_listings (promo_id, listing_id, discount_pct) VALUES (?, ?, ?)
     ON CONFLICT(promo_id, listing_id) DO UPDATE SET discount_pct = excluded.discount_pct`,
    p.id, l.id, v.discount_pct,
  );
  P.invalidate();
  res.json({ ok: true, discount_pct: v.discount_pct });
});

r.delete('/listings/:id/promos/:slug', requireAuth, (req, res) => {
  const l = db.get('SELECT user_id FROM listings WHERE id = ?', Number(req.params.id));
  if (!l) notFound();
  if (l.user_id !== req.user.id) forbidden();
  db.run('DELETE FROM promo_listings WHERE listing_id = ? AND promo_id = (SELECT id FROM promos WHERE slug = ?)', Number(req.params.id), String(req.params.slug));
  P.invalidate();
  res.json({ ok: true });
});

// ---------- Admin / moderator ----------
const I18N = { type: 'object' };
const RULES = {
  slug: { type: 'string', min: 2, max: 40, pattern: /^[a-z0-9-]+$/ },
  names: I18N,
  subtitles: I18N,
  emoji: { type: 'string', max: 8 },
  theme: { type: 'enum', values: P.THEMES },
  categories: { type: 'array', max: 20, itemMax: 60 },
  max_discount: { type: 'int', min: 1, max: 90 },
  start_md: { type: 'string', max: 5 },
  end_md: { type: 'string', max: 5 },
  active: { type: 'bool' },
  sort: { type: 'int', min: 0, max: 999 },
};
function clean(body, partial) {
  const v = validate(body, RULES, { partial });
  for (const k of ['names', 'subtitles']) {
    if (v[k] === undefined) continue;
    const o = {};
    for (const lang of ['uz', 'ru', 'en']) if (typeof v[k][lang] === 'string' && v[k][lang].trim()) o[lang] = v[k][lang].trim().slice(0, 120);
    if (k === 'names' && !o.uz && !o.ru) fail(422, 'err.validation', { names: 'required' });
    v[k] = JSON.stringify(o);
  }
  for (const k of ['start_md', 'end_md']) if (v[k] !== undefined) { v[k] = v[k] || null; if (v[k] && !P.MD_RE.test(v[k])) fail(422, 'err.validation', { [k]: 'MM-DD' }); }
  if (v.categories) v.categories = JSON.stringify(v.categories.filter((s) => cats.bySlug(s)));
  return v;
}
const log = (req, action, id) => db.insert('admin_log', { admin_id: req.user.id, action, target_type: 'promo', target_id: id, details: null, ip: req.ip });

r.get('/admin/promos', requireAuth, requireStaff, (req, res) => {
  res.json(db.all('SELECT * FROM promos ORDER BY sort, id').map((p) => ({ ...P.view(p, req.lang, { count: countOf(p) }), active: Boolean(p.active), sort: p.sort, names: parseJson(p.names, {}), subtitles: parseJson(p.subtitles, {}) })));
});
r.post('/admin/promos', requireAuth, requireStaff, (req, res) => {
  const v = clean(req.body, false);
  if (!v.slug || !v.names) fail(422, 'err.validation', { slug: 'required' });
  if (db.get('SELECT 1 FROM promos WHERE slug = ?', v.slug)) fail(409, 'err.validation', { slug: 'taken' });
  const newId = db.insert('promos', { theme: 'orange', categories: '[]', subtitles: '{}', ...v });
  P.invalidate();
  log(req, 'promo.create', newId);
  res.status(201).json({ id: newId });
});
r.put('/admin/promos/:id', requireAuth, requireStaff, (req, res) => {
  const pid = Number(req.params.id);
  if (!db.get('SELECT 1 FROM promos WHERE id = ?', pid)) notFound();
  const v = clean(req.body, true);
  if (v.slug && db.get('SELECT 1 FROM promos WHERE slug = ? AND id <> ?', v.slug, pid)) fail(409, 'err.validation', { slug: 'taken' });
  const keys = Object.keys(v);
  if (keys.length) db.run(`UPDATE promos SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => v[k]), pid);
  P.invalidate();
  log(req, 'promo.update', pid);
  res.json({ ok: true });
});
r.delete('/admin/promos/:id', requireAuth, requireStaff, (req, res) => {
  db.run('DELETE FROM promo_listings WHERE promo_id = ?', Number(req.params.id));
  db.run('DELETE FROM promos WHERE id = ?', Number(req.params.id));
  P.invalidate();
  log(req, 'promo.delete', Number(req.params.id));
  res.json({ ok: true });
});

module.exports = { router: r };
