// Fura logistika birjasi: yuk egalari yuk joylaydi (load), fura egalari bo'sh furani (truck).
// Har bir e'longa mos qarama-qarshi e'lonlar ko'rsatiladi; yo'nalishga obuna bo'lganlarga xabar boradi.
const { Router } = require('express');
const db = require('../db');
const money = require('../lib/money');
const { companyFor } = require('../lib/company');
const { notify } = require('../lib/notify');
const { requireAuth, rateLimit } = require('../lib/auth');
const { fail, notFound, forbidden, validate, paging, pageResult, parseJson } = require('../lib/http');
const { COUNTRY, CURRENCY_CODES } = require('../geo');
const { normalizeSearch } = require('../i18n');

const r = Router();

// Markaziy Osiyo + asosiy xalqaro yo'nalishlar (Xitoy, Turkiya, Eron, Yevropa, BAA ...)
const COUNTRIES = [...Object.keys(COUNTRY), 'CN', 'TR', 'IR', 'BY', 'GE', 'AM', 'LT', 'LV', 'PL', 'DE', 'AE', 'PK', 'IN'];
const BODIES = ['tent', 'ref', 'isotherm', 'van', 'board', 'flatbed', 'container', 'lowbed', 'tanker', 'car_carrier', 'tipper'];
const LOADING = ['back', 'side', 'top'];
const PAYMENT = ['cash', 'bank', 'vat', 'card'];

const list = (v, allowed) => [...new Set((Array.isArray(v) ? v : String(v || '').split(',')).map((x) => String(x).trim()).filter((x) => allowed.includes(x)))];
const flag = (v) => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0);

const RULES = {
  kind: { type: 'enum', values: ['load', 'truck'], required: true },
  from_country: { type: 'enum', values: COUNTRIES, required: true },
  from_city: { type: 'string', min: 2, max: 80, required: true },
  to_country: { type: 'enum', values: COUNTRIES },
  to_city: { type: 'string', max: 80 },
  date_from: { type: 'string', max: 10 },
  date_to: { type: 'string', max: 10 },
  cargo: { type: 'string', max: 120 },
  weight_t: { type: 'number', min: 0, max: 200 },
  volume_m3: { type: 'number', min: 0, max: 500 },
  length_m: { type: 'number', min: 0, max: 40 },
  trucks_count: { type: 'int', min: 1, max: 100 },
  distance_km: { type: 'int', min: 0, max: 20000 },
  price: { type: 'number', min: 0, max: 1e12 },
  currency: { type: 'enum', values: CURRENCY_CODES },
  price_unit: { type: 'enum', values: ['total', 'km', 'ton'] },
  payment: { type: 'enum', values: PAYMENT },
  note: { type: 'string', max: 1000 },
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function view(x, req, { full = false } = {}) {
  const u = db.get('SELECT name FROM users WHERE id = ?', x.user_id);
  const c = x.company_id ? db.get('SELECT id, name, verification FROM companies WHERE id = ?', x.company_id) : null;
  return {
    id: x.id, kind: x.kind,
    from: { country: x.from_country, city: x.from_city },
    to: x.to_country || x.to_city ? { country: x.to_country, city: x.to_city } : null,
    date_from: x.date_from, date_to: x.date_to, cargo: x.cargo,
    body_types: parseJson(x.body_types, []), loading: parseJson(x.loading, []),
    weight_t: x.weight_t, volume_m3: x.volume_m3, length_m: x.length_m, trucks_count: x.trucks_count,
    adr: Boolean(x.adr), tir: Boolean(x.tir), cmr: Boolean(x.cmr), distance_km: x.distance_km,
    price: x.price, currency: x.currency, price_unit: x.price_unit, payment: x.payment,
    price_formatted: x.price ? money.formatAmount(x.price, x.currency, req.lang) : null,
    note: full ? x.note : (x.note || '').slice(0, 160),
    owner: c ? { name: c.name, company_id: c.id, verified: c.verification === 'verified' } : { name: u?.name || null },
    user_id: x.user_id, is_owner: req.user?.id === x.user_id,
    status: x.status, views: x.views, created_at: x.created_at, bumped_at: x.bumped_at,
  };
}

// Qarama-qarshi tomondan mos e'lonlar: yuk uchun — shu shahar/mamlakatdagi mos kuzovli furalar va aksincha
function matchSql(x) {
  const opp = x.kind === 'load' ? 'truck' : 'load';
  const where = [`status = 'open'`, 'kind = ?', 'from_country = ?', 'id != ?'];
  const p = [opp, x.from_country, x.id];
  if (x.to_country) { where.push('(to_country IS NULL OR to_country = ?)'); p.push(x.to_country); }
  const bodies = parseJson(x.body_types, []);
  if (bodies.length) { where.push(`(body_types IS NULL OR body_types = '[]' OR ${bodies.map(() => 'body_types LIKE ?').join(' OR ')})`); p.push(...bodies.map((b) => `%"${b}"%`)); }
  if (opp === 'truck' && x.weight_t) { where.push('(weight_t IS NULL OR weight_t >= ?)'); p.push(x.weight_t); }
  if (opp === 'load' && x.weight_t) { where.push('(weight_t IS NULL OR weight_t <= ?)'); p.push(x.weight_t); }
  if (opp === 'truck' && x.adr) where.push('adr = 1');
  return { sql: where.join(' AND '), p, cityFirst: [`LOWER(from_city) = LOWER(?) DESC`, x.from_city] };
}
const matchCount = (x) => { const m = matchSql(x); return db.get(`SELECT COUNT(*) AS n FROM freight WHERE ${m.sql}`, ...m.p).n; };
function matches(x, limit = 6) {
  const m = matchSql(x);
  return db.all(`SELECT * FROM freight WHERE ${m.sql} ORDER BY ${m.cityFirst[0]}, bumped_at DESC LIMIT ?`, ...m.p, m.cityFirst[1], limit);
}

// ---------- Ro'yxat ----------
r.get('/freight', (req, res) => {
  const pg = paging(req.query, 20);
  const kind = req.query.kind === 'truck' ? 'truck' : 'load';
  const where = [`status = 'open'`, 'kind = ?', `(expires_at IS NULL OR expires_at > datetime('now'))`];
  const p = [kind];
  const up = (v) => String(v || '').toUpperCase();
  if (COUNTRIES.includes(up(req.query.from_country))) { where.push('from_country = ?'); p.push(up(req.query.from_country)); }
  if (COUNTRIES.includes(up(req.query.to_country))) { where.push(kind === 'truck' ? '(to_country IS NULL OR to_country = ?)' : 'to_country = ?'); p.push(up(req.query.to_country)); }
  if (req.query.from_city) { where.push('LOWER(from_city) LIKE ?'); p.push(`%${String(req.query.from_city).toLowerCase().trim()}%`); }
  if (req.query.to_city) { where.push('LOWER(to_city) LIKE ?'); p.push(`%${String(req.query.to_city).toLowerCase().trim()}%`); }
  const body = list(req.query.body, BODIES);
  if (body.length) { where.push(`(${body.map(() => 'body_types LIKE ?').join(' OR ')})`); p.push(...body.map((b) => `%"${b}"%`)); }
  if (Number(req.query.weight_min) > 0) { where.push('weight_t >= ?'); p.push(Number(req.query.weight_min)); }
  if (Number(req.query.weight_max) > 0) { where.push('weight_t <= ?'); p.push(Number(req.query.weight_max)); }
  if (DATE.test(req.query.date || '')) { where.push(`(date_from IS NULL OR date_from <= ?) AND (COALESCE(date_to, date_from) IS NULL OR COALESCE(date_to, date_from) >= ?)`); p.push(req.query.date, req.query.date); }
  if (req.query.adr === '1') where.push('adr = 1');
  if (req.query.q) for (const tok of normalizeSearch(req.query.q).split(' ').filter(Boolean).slice(0, 6)) { where.push('search_text LIKE ?'); p.push(`%${tok}%`); }
  const sql = where.join(' AND ');
  const total = db.get(`SELECT COUNT(*) AS n FROM freight WHERE ${sql}`, ...p).n;
  const rows = db.all(`SELECT * FROM freight WHERE ${sql} ORDER BY bumped_at DESC, id DESC LIMIT ? OFFSET ?`, ...p, pg.perPage, pg.offset);
  const n = (k) => db.get(`SELECT COUNT(*) AS n FROM freight WHERE status = 'open' AND kind = ? AND (expires_at IS NULL OR expires_at > datetime('now'))`, k).n;
  res.json({
    ...pageResult(rows.map((x) => ({ ...view(x, req), matches: matchCount(x) })), total, pg),
    stats: { loads: n('load'), trucks: n('truck') },
    // Ommabop yo'nalishlar (ochiq e'lonlar bo'yicha)
    routes: db.all(
      `SELECT from_country, from_city, to_country, to_city, COUNT(*) AS n FROM freight WHERE status = 'open' AND to_city IS NOT NULL
       GROUP BY LOWER(from_city), LOWER(to_city) ORDER BY n DESC LIMIT 8`,
    ),
  });
});

r.get('/freight/meta', (_req, res) => res.json({ countries: COUNTRIES, bodies: BODIES, loading: LOADING, payment: PAYMENT }));

r.get('/my/freight', requireAuth, (req, res) => {
  res.json(db.all('SELECT * FROM freight WHERE user_id = ? ORDER BY id DESC LIMIT 100', req.user.id).map((x) => ({ ...view(x, req), matches: matchCount(x) })));
});

r.get('/freight/:id', (req, res) => {
  if (!/^\d+$/.test(req.params.id)) notFound();
  const x = db.get('SELECT * FROM freight WHERE id = ?', Number(req.params.id));
  if (!x || (x.status !== 'open' && req.user?.id !== x.user_id && req.user?.role !== 'admin')) notFound();
  if (req.user?.id !== x.user_id) db.run('UPDATE freight SET views = views + 1 WHERE id = ?', x.id);
  res.json({ ...view(x, req, { full: true }), matches_list: matches(x).map((m) => view(m, req)), matches: matchCount(x) });
});

// ---------- Joylash ----------
const postLimit = rateLimit({ name: 'freight', windowMs: 3600000, max: 30, key: (req) => req.user.id });
r.post('/freight', requireAuth, postLimit, (req, res) => {
  const v = validate(req.body, RULES);
  const b = req.body || {};
  for (const k of ['date_from', 'date_to']) if (v[k] && !DATE.test(v[k])) fail(422, 'err.validation', { [k]: 'invalid' });
  if (v.date_from && v.date_to && v.date_to < v.date_from) fail(422, 'err.validation', { date_to: 'invalid' });
  if (v.kind === 'load' && (!v.to_country || !v.to_city)) fail(422, 'err.validation', { to_city: 'required' });
  if (v.kind === 'load' && !v.cargo) fail(422, 'err.validation', { cargo: 'required' });
  const bodies = list(b.body_types, BODIES);
  if (v.kind === 'truck' && !bodies.length) fail(422, 'err.validation', { body_types: 'required' });
  if (!v.currency) v.currency = COUNTRY[v.from_country]?.currency || 'USD';
  const company = companyFor(req.user.id);
  const id = db.insert('freight', {
    ...v,
    body_types: bodies, loading: list(b.loading, LOADING),
    adr: flag(b.adr), tir: flag(b.tir), cmr: flag(b.cmr),
    user_id: req.user.id, company_id: company?.id || null,
    search_text: normalizeSearch([v.from_city, v.to_city, v.cargo, v.note, ...bodies].filter(Boolean).join(' ')),
    // Yuk — 15 kun, bo'sh fura — 7 kun ko'rinadi (keyin "Yangilash" bilan uzaytiriladi)
    expires_at: db.get(`SELECT datetime('now', ?) AS d`, v.kind === 'load' ? '+15 days' : '+7 days').d,
  });
  const x = db.get('SELECT * FROM freight WHERE id = ?', id);
  notifyAlerts(x);
  res.status(201).json({ ...view(x, req, { full: true }), matches: matchCount(x) });
});

// Obunachilarga xabar: yo'nalish, mamlakat va kuzov mos kelsa
function notifyAlerts(x) {
  const bodies = parseJson(x.body_types, []);
  const subs = db.all(
    `SELECT * FROM freight_alerts WHERE kind = ? AND user_id != ?
       AND (from_country IS NULL OR from_country = ?) AND (to_country IS NULL OR to_country = ?)
       AND (from_city IS NULL OR LOWER(?) LIKE '%' || LOWER(from_city) || '%')
       AND (to_city IS NULL OR LOWER(COALESCE(?, '')) LIKE '%' || LOWER(to_city) || '%')`,
    x.kind, x.user_id, x.from_country, x.to_country, x.from_city, x.to_city,
  ).filter((a) => !a.body || !bodies.length || bodies.includes(a.body));
  const seen = new Set();
  for (const a of subs) {
    if (seen.has(a.user_id)) continue;
    seen.add(a.user_id);
    notify(a.user_id, x.kind === 'load' ? 'freight_load' : 'freight_truck', { from: x.from_city, to: x.to_city || '…', what: x.cargo || '' }, `/fura/${x.id}`);
  }
}

r.post('/freight/:id/close', requireAuth, (req, res) => {
  const x = db.get('SELECT * FROM freight WHERE id = ?', Number(req.params.id));
  if (!x) notFound();
  if (x.user_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'moderator') forbidden();
  db.run(`UPDATE freight SET status = 'closed' WHERE id = ?`, x.id);
  res.json({ ok: true });
});

// "Yangilash" — ro'yxat boshiga chiqarish va muddatni uzaytirish (kuniga bir marta, bepul)
r.post('/freight/:id/bump', requireAuth, (req, res) => {
  const x = db.get('SELECT * FROM freight WHERE id = ?', Number(req.params.id));
  if (!x) notFound();
  if (x.user_id !== req.user.id) forbidden();
  if (Date.now() - Date.parse(`${x.bumped_at}Z`) < 20 * 3600 * 1000) fail(429, 'err.too_many');
  db.run(`UPDATE freight SET bumped_at = datetime('now'), status = 'open', expires_at = datetime('now', ?) WHERE id = ?`, x.kind === 'load' ? '+15 days' : '+7 days', x.id);
  res.json({ ok: true });
});

r.post('/freight/:id/phone', requireAuth, (req, res) => {
  const x = db.get('SELECT user_id FROM freight WHERE id = ?', Number(req.params.id));
  if (!x) notFound();
  db.run('UPDATE freight SET contacts = contacts + 1 WHERE id = ?', Number(req.params.id));
  res.json({ phone: db.get('SELECT phone FROM users WHERE id = ?', x.user_id).phone });
});

// ---------- Yo'nalishga obuna ----------
r.get('/me/freight-alerts', requireAuth, (req, res) => res.json(db.all('SELECT * FROM freight_alerts WHERE user_id = ? ORDER BY id DESC', req.user.id)));
r.post('/me/freight-alerts', requireAuth, (req, res) => {
  const v = validate(req.body, {
    kind: { type: 'enum', values: ['load', 'truck'], required: true },
    from_country: { type: 'enum', values: COUNTRIES }, to_country: { type: 'enum', values: COUNTRIES },
    from_city: { type: 'string', max: 80 }, to_city: { type: 'string', max: 80 },
    body: { type: 'enum', values: BODIES },
  });
  if (db.get('SELECT COUNT(*) AS n FROM freight_alerts WHERE user_id = ?', req.user.id).n >= 20) fail(422, 'err.validation', { alerts: 'max_20' });
  const id = db.insert('freight_alerts', { ...v, user_id: req.user.id });
  res.status(201).json(db.get('SELECT * FROM freight_alerts WHERE id = ?', id));
});
r.delete('/me/freight-alerts/:id', requireAuth, (req, res) => {
  db.run('DELETE FROM freight_alerts WHERE id = ? AND user_id = ?', Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

module.exports = { router: r, view, COUNTRIES, BODIES };
