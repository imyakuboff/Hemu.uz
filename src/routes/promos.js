// Mavsumiy aksiyalar: ro'yxat, aksiya sahifasi, sotuvchi e'lonini qo'shishi, admin boshqaruvi
const { Router } = require('express');
const db = require('../db');
const L = require('../lib/listings');
const cats = require('../lib/categories');
const P = require('../lib/promos');
const { requireAuth, requireStaff } = require('../lib/auth');
const { companyFor } = require('../lib/company');
const { notify } = require('../lib/notify');
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
  const rows = db.all("SELECT * FROM promos WHERE active = 1 AND status = 'active' ORDER BY owner_user_id IS NOT NULL, sort, id").filter((p) => P.inSeason(p));
  const out = rows.map((p) => P.view(p, req.lang, { count: countOf(p) })).filter((p) => !p.seller || p.count > 0);
  // Sotuvchilar aksiyalari: eng ko'p e'lonli 6 tasi
  const platform = out.filter((p) => !p.seller);
  const sellers = out.filter((p) => p.seller).sort((a, b) => b.count - a.count).slice(0, 6);
  res.json([...platform, ...sellers]);
});

// Aksiya sahifasi: qatnashayotgan e'lonlar (eng katta chegirma birinchi) + mos e'lonlar
r.get('/promos/:slug', (req, res) => {
  const p = db.get('SELECT * FROM promos WHERE slug = ?', String(req.params.slug));
  const staffOrOwner = req.user && (['admin', 'moderator'].includes(req.user.role) || req.user.id === p?.owner_user_id);
  if (!p || ((!p.active || p.status !== 'active') && !staffOrOwner)) notFound();
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
  const w = p.owner_user_id ? { sql: 'l.user_id = ?', params: [p.owner_user_id] } : catWhere(p);
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
  const rows = db.all("SELECT * FROM promos WHERE active = 1 AND status = 'active' AND (owner_user_id IS NULL OR owner_user_id = ?) ORDER BY owner_user_id IS NULL, sort, id", req.user.id)
    .filter((p) => P.inSeason(p) && (p.owner_user_id || P.fits(p, root, sub)));
  res.json({ has_price: l.price !== null, min: P.MIN_DISCOUNT, max: P.MAX_DISCOUNT, items: rows.map((p) => P.view(p, req.lang, { joined: joined.has(p.id), discount_pct: joined.get(p.id) || null })) });
});

r.post('/listings/:id/promos/:slug', requireAuth, (req, res) => {
  const l = db.get('SELECT * FROM listings WHERE id = ? AND deleted_at IS NULL', Number(req.params.id));
  if (!l) notFound();
  if (l.user_id !== req.user.id) forbidden();
  const p = db.get('SELECT * FROM promos WHERE slug = ?', String(req.params.slug));
  if (!p || !P.isLive(p)) notFound();
  if (p.owner_user_id && p.owner_user_id !== req.user.id) forbidden(); // boshqa sotuvchining aksiyasi
  if (l.price === null || l.price === undefined) fail(422, 'err.validation', { price: 'required' });
  if (!p.owner_user_id && !P.fits(p, cats.byId(l.category_id)?.slug, cats.byId(l.subcategory_id)?.slug)) fail(422, 'err.validation', { category: 'not_in_promo' });
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

// ---------- Sotuvchi / firma: o'z aksiyasi (do'kon chegirmasi) ----------
const MY_LIMIT = 3; // bir vaqtda faol yoki moderatsiyadagi aksiyalar
const MAX_DAYS = 90;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const today = () => new Date().toISOString().slice(0, 10);
const SELLER_RULES = {
  name: { type: 'string', min: 4, max: 80, required: true },
  subtitle: { type: 'string', max: 140 },
  emoji: { type: 'string', max: 8 },
  theme: { type: 'enum', values: P.THEMES },
  discount_pct: { type: 'int', min: P.MIN_DISCOUNT, max: P.MAX_DISCOUNT, required: true },
  starts_on: { type: 'string', max: 10 },
  ends_on: { type: 'string', max: 10, required: true },
  listing_ids: { type: 'array', max: 200, itemMax: 12 },
};
function sellerInput(req, partial) {
  const v = validate(req.body, SELLER_RULES, { partial });
  const start = v.starts_on || (partial ? undefined : today());
  if (start !== undefined && !DATE_RE.test(start)) fail(422, 'err.validation', { starts_on: 'YYYY-MM-DD' });
  if (v.ends_on !== undefined) {
    if (!DATE_RE.test(v.ends_on)) fail(422, 'err.validation', { ends_on: 'YYYY-MM-DD' });
    const s = start || today();
    if (v.ends_on < today() || v.ends_on < s) fail(422, 'err.validation', { ends_on: 'past' });
    if ((new Date(v.ends_on) - new Date(s)) / 86400000 > MAX_DAYS) fail(422, 'err.validation', { ends_on: `max_${MAX_DAYS}_days` });
  }
  return { ...v, starts_on: start };
}
// Faqat o'zining faol, narxli e'lonlari
function setListings(promoId, userId, ids, pct) {
  const own = (ids || []).map(Number).filter(Boolean);
  db.run('DELETE FROM promo_listings WHERE promo_id = ?', promoId);
  if (!own.length) return 0;
  const ok = db.all(`SELECT id FROM listings WHERE user_id = ? AND status = 'active' AND deleted_at IS NULL AND price IS NOT NULL AND id IN (${own.map(() => '?').join(',')})`, userId, ...own);
  for (const l of ok) db.run('INSERT INTO promo_listings (promo_id, listing_id, discount_pct) VALUES (?, ?, ?)', promoId, l.id, pct);
  return ok.length;
}
const myView = (p, lang) => ({
  ...P.view(p, lang, { count: countOf(p) }),
  name_raw: P.pickName(parseJson(p.names, {}), 'uz'),
  subtitle_raw: P.pickName(parseJson(p.subtitles, {}), 'uz'),
  reject_reason: p.reject_reason,
  listing_ids: db.all('SELECT listing_id FROM promo_listings WHERE promo_id = ?', p.id).map((x) => x.listing_id),
  discount_pct: p.max_discount,
});

r.get('/my/promos', requireAuth, (req, res) => {
  const rows = db.all('SELECT * FROM promos WHERE owner_user_id = ? ORDER BY id DESC', req.user.id);
  const listings = db.all(`SELECT id, title, price, currency FROM listings WHERE user_id = ? AND status = 'active' AND deleted_at IS NULL AND price IS NOT NULL ORDER BY bumped_at DESC LIMIT 200`, req.user.id);
  const c = companyFor(req.user.id);
  res.json({ items: rows.map((p) => myView(p, req.lang)), listings, limit: MY_LIMIT, max_days: MAX_DAYS, instant: c?.verification === 'verified' });
});

r.post('/my/promos', requireAuth, (req, res) => {
  const v = sellerInput(req, false);
  const c = companyFor(req.user.id);
  const hasListings = db.get(`SELECT COUNT(*) AS n FROM listings WHERE user_id = ? AND status = 'active' AND deleted_at IS NULL`, req.user.id).n;
  if (!c && !hasListings) fail(403, 'err.forbidden');
  const open = db.all("SELECT * FROM promos WHERE owner_user_id = ? AND active = 1 AND status IN ('active', 'moderation')", req.user.id).filter((p) => !p.ends_on || p.ends_on >= today()).length;
  if (open >= MY_LIMIT) fail(429, 'err.too_many');
  // Tekshirilgan firma — darhol, qolganlar — moderator tasdig'idan keyin
  const status = c?.verification === 'verified' ? 'active' : 'moderation';
  const text = (s) => JSON.stringify({ uz: s, ru: s, en: s });
  const id = db.tx(() => {
    const pid = db.insert('promos', {
      slug: `s${req.user.id}-${Date.now().toString(36)}`, names: text(v.name), subtitles: text(v.subtitle || ''), emoji: v.emoji || '🔥',
      theme: v.theme || 'red', categories: '[]', max_discount: v.discount_pct, starts_on: v.starts_on, ends_on: v.ends_on,
      owner_user_id: req.user.id, company_id: c?.id || null, status, sort: 100,
    });
    setListings(pid, req.user.id, v.listing_ids, v.discount_pct);
    return pid;
  });
  P.invalidate();
  res.status(201).json(myView(db.get('SELECT * FROM promos WHERE id = ?', id), req.lang));
});

r.put('/my/promos/:id', requireAuth, (req, res) => {
  const p = db.get('SELECT * FROM promos WHERE id = ? AND owner_user_id = ?', Number(req.params.id), req.user.id);
  if (!p) notFound();
  const v = sellerInput(req, true);
  const c = companyFor(req.user.id);
  const up = {};
  if (v.name !== undefined) up.names = JSON.stringify({ uz: v.name, ru: v.name, en: v.name });
  if (v.subtitle !== undefined) up.subtitles = JSON.stringify({ uz: v.subtitle, ru: v.subtitle, en: v.subtitle });
  for (const k of ['emoji', 'theme', 'starts_on', 'ends_on']) if (v[k] !== undefined) up[k] = v[k];
  if (v.discount_pct !== undefined) up.max_discount = v.discount_pct;
  // Matn o'zgarsa va firma tekshirilmagan bo'lsa — qayta moderatsiya
  if ((up.names || up.subtitles) && c?.verification !== 'verified') { up.status = 'moderation'; up.reject_reason = null; }
  if (p.status === 'rejected' && !up.status) up.status = c?.verification === 'verified' ? 'active' : 'moderation';
  db.tx(() => {
    const keys = Object.keys(up);
    if (keys.length) db.run(`UPDATE promos SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => up[k]), p.id);
    const pct = up.max_discount ?? p.max_discount;
    if (v.listing_ids !== undefined) setListings(p.id, req.user.id, v.listing_ids, pct);
    else if (up.max_discount !== undefined) db.run('UPDATE promo_listings SET discount_pct = ? WHERE promo_id = ?', pct, p.id);
  });
  P.invalidate();
  res.json(myView(db.get('SELECT * FROM promos WHERE id = ?', p.id), req.lang));
});

r.delete('/my/promos/:id', requireAuth, (req, res) => {
  const p = db.get('SELECT id FROM promos WHERE id = ? AND owner_user_id = ?', Number(req.params.id), req.user.id);
  if (!p) notFound();
  db.run('DELETE FROM promo_listings WHERE promo_id = ?', p.id);
  db.run('DELETE FROM promos WHERE id = ?', p.id);
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
  status: { type: 'enum', values: ['active', 'moderation', 'rejected'] },
  reject_reason: { type: 'string', max: 300 },
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
  // Moderatsiyadagilar birinchi, keyin platforma, keyin sotuvchilar
  const rows = db.all("SELECT * FROM promos ORDER BY status = 'moderation' DESC, owner_user_id IS NOT NULL, sort, id DESC");
  res.json(rows.map((p) => ({ ...P.view(p, req.lang, { count: countOf(p) }), active: Boolean(p.active), sort: p.sort, names: parseJson(p.names, {}), subtitles: parseJson(p.subtitles, {}), owner_user_id: p.owner_user_id, reject_reason: p.reject_reason })));
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
  log(req, v.status ? `promo.${v.status}` : 'promo.update', pid);
  // Sotuvchiga natija haqida xabar
  const row = db.get('SELECT owner_user_id, names FROM promos WHERE id = ?', pid);
  if (row.owner_user_id && (v.status === 'active' || v.status === 'rejected')) {
    const title = P.pickName(parseJson(row.names, {}), 'ru');
    notify(row.owner_user_id, v.status === 'active' ? 'promo_approved' : 'promo_rejected', { title, reason: v.reject_reason || '—' }, '/my/promos');
  }
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
