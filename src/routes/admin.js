// Platforma administratori: foydalanuvchilar, kompaniyalar, e'lonlar, buyurtmalar, to'lovlar,
// balans, push-tarqatma, server monitoringi, sozlamalar va harakatlar jurnali.
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { Router } = require('express');
const db = require('../db');
const config = require('../config');
const L = require('../lib/listings');
const money = require('../lib/money');
const wallet = require('../lib/wallet');
const settings = require('../lib/settings');
const metrics = require('../lib/metrics');
const webpush = require('../lib/webpush');
const legal = require('../lib/legal');
const pay = require('../lib/payments');
const { notify, push } = require('../lib/notify');
const { requireAuth, requireAdmin, requireStaff, createSession } = require('../lib/auth');
const { fail, notFound, forbidden, validate, paging, pageResult, parseJson } = require('../lib/http');
const { COUNTRY, CURRENCY_CODES, normalizePhone, countryName } = require('../geo');
const { LANGUAGES } = require('../i18n');
const { activate } = require('./listings');

const r = Router();
const admin = Router();
// Moderator: e'lonlar, kompaniyalar, VIP/GOLD/PREMIUM narxlari va murojaatlar. Qolgani — faqat admin.
const MODERATOR_PATHS = [/^\/overview$/, /^\/listings(\/|$)/, /^\/companies(\/|$)/, /^\/tiers(\/|$)/, /^\/support(\/|$)/, /^\/freight(\/|$)/];
admin.use(requireStaff, (req, _res, next) => {
  if (req.user.role === 'admin' || MODERATOR_PATHS.some((p) => p.test(req.path))) return next();
  fail(403, 'err.forbidden');
});

const ACCOUNT_TYPES = ['client', 'company', 'mechanic', 'driver'];
const LANGS = LANGUAGES.map((l) => l.code);
const id = (req) => Number(req.params.id);

// ---------- Harakatlar jurnali ----------
function log(req, action, targetType = null, targetId = null, details = null) {
  db.insert('admin_log', { admin_id: req.user.id, action, target_type: targetType, target_id: targetId, details, ip: req.ip });
}

const usd = (n) => Math.round(n * 100) / 100;

// ---------- Umumiy ko'rinish ----------
admin.get('/stats', (_req, res) => {
  const by = (sql) => Object.fromEntries(db.all(sql).map((x) => [x.k, x.n]));
  res.json({
    users: db.get('SELECT COUNT(*) AS n FROM users').n,
    users_by_country: by('SELECT country AS k, COUNT(*) AS n FROM users GROUP BY country'),
    listings: by('SELECT status AS k, COUNT(*) AS n FROM listings GROUP BY status'),
    listings_by_country: by(`SELECT country AS k, COUNT(*) AS n FROM listings WHERE status = 'active' GROUP BY country`),
    companies: by('SELECT verification AS k, COUNT(*) AS n FROM companies GROUP BY verification'),
    orders: by('SELECT status AS k, COUNT(*) AS n FROM orders GROUP BY status'),
    requests_open: db.get(`SELECT COUNT(*) AS n FROM requests WHERE status = 'open'`).n,
  });
});

admin.get('/overview', (req, res) => {
  const n = (sql, ...p) => db.get(sql, ...p).n;
  const days = 30;
  const series = (sql) => {
    const map = new Map(db.all(sql).map((x) => [x.d, x.n]));
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
      out.push({ day: d, n: map.get(d) || 0 });
    }
    return out;
  };
  // Daromad: to'langan to'lovlar (hamyondan to'langanlar va to'ldirishlar alohida)
  const paid = db.all(`SELECT amount, currency, purpose, provider, date(paid_at) AS d FROM payments WHERE status = 'paid' AND paid_at > datetime('now', '-30 days')`);
  const revenueMap = new Map();
  let revenue = 0; let topups = 0;
  for (const p of paid) {
    const v = money.toUsd(p.amount, p.currency);
    if (p.purpose === 'topup') { topups += v; continue; }
    if (p.purpose === 'escrow') continue; // escrow — sotuvchining puli
    revenue += v; // xizmatlar (promo, tarif, ko'rik) — hamyondan to'langanlari ham
    revenueMap.set(p.d, (revenueMap.get(p.d) || 0) + v);
  }
  const rev = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    rev.push({ day: d, n: usd(revenueMap.get(d) || 0) });
  }
  const snap = metrics.snapshot({ dbFile: config.dbFile, uploadDir: config.uploadDir });
  const out = {
    users: {
      total: n('SELECT COUNT(*) AS n FROM users'),
      new_7d: n(`SELECT COUNT(*) AS n FROM users WHERE created_at > datetime('now', '-7 days')`),
      active_24h: n(`SELECT COUNT(*) AS n FROM users WHERE last_seen_at > datetime('now', '-1 day')`),
      blocked: n('SELECT COUNT(*) AS n FROM users WHERE blocked = 1'),
      by_type: Object.fromEntries(db.all('SELECT account_type AS k, COUNT(*) AS n FROM users GROUP BY account_type').map((x) => [x.k, x.n])),
      by_country: db.all('SELECT country AS code, COUNT(*) AS n FROM users GROUP BY country ORDER BY n DESC').map((x) => ({ ...x, name: countryName(x.code, req.lang) })),
      online: n(`SELECT COUNT(DISTINCT user_id) AS n FROM sessions WHERE last_used_at > datetime('now', '-5 minutes')`),
    },
    companies: Object.fromEntries(db.all('SELECT verification AS k, COUNT(*) AS n FROM companies GROUP BY verification').map((x) => [x.k, x.n])),
    listings: Object.fromEntries(db.all('SELECT status AS k, COUNT(*) AS n FROM listings GROUP BY status').map((x) => [x.k, x.n])),
    orders: Object.fromEntries(db.all('SELECT status AS k, COUNT(*) AS n FROM orders GROUP BY status').map((x) => [x.k, x.n])),
    queue: {
      moderation: n(`SELECT COUNT(*) AS n FROM listings WHERE status = 'moderation'`),
      companies: n(`SELECT COUNT(*) AS n FROM companies WHERE verification = 'pending'`),
      reports: n(`SELECT COUNT(*) AS n FROM reports WHERE status = 'open'`),
      disputes: n(`SELECT COUNT(*) AS n FROM disputes WHERE status = 'open'`),
      inspections: n(`SELECT COUNT(*) AS n FROM inspections WHERE status IN ('paid', 'scheduled')`),
    },
    money: {
      revenue_30d_usd: usd(revenue),
      topups_30d_usd: usd(topups),
      wallets_total_usd: usd(db.get('SELECT COALESCE(SUM(balance_usd), 0) AS s FROM users').s),
      escrow_held: n(`SELECT COUNT(*) AS n FROM orders WHERE escrow_status = 'held'`),
    },
    charts: {
      registrations: series(`SELECT date(created_at) AS d, COUNT(*) AS n FROM users WHERE created_at > datetime('now', '-30 days') GROUP BY d`),
      listings: series(`SELECT date(created_at) AS d, COUNT(*) AS n FROM listings WHERE created_at > datetime('now', '-30 days') GROUP BY d`),
      revenue: rev,
    },
    system: { cpu: snap.cpu.now, memory: snap.memory, disk: snap.disk, uptime_sec: snap.process.uptime_sec, rss: snap.process.rss, req_per_min: snap.requests.per_min_5, errors: snap.requests.totals.err5 },
  };
  out.tiers = Object.fromEntries(db.all(`SELECT tier AS k, COUNT(*) AS n FROM listings WHERE status = 'active' AND tier_until > datetime('now') GROUP BY tier`).map((x) => [x.k, x.n]));
  out.queue.support = n(`SELECT COUNT(*) AS n FROM support_tickets WHERE status = 'new'`);
  out.role = req.user.role;
  if (req.user.role !== 'admin') { delete out.money; delete out.system; delete out.charts.revenue; }
  res.json(out);
});

// ---------- Foydalanuvchilar ----------
function userRow(u, req) {
  return {
    id: u.id, phone: u.phone, username: u.username || null, name: u.name, email: u.email, role: u.role, account_type: u.account_type,
    country: u.country, lang: u.lang, currency: u.currency, blocked: Boolean(u.blocked), blocked_reason: u.blocked_reason,
    created_at: u.created_at, last_seen_at: u.last_seen_at, has_password: Boolean(u.password_hash),
    balance: wallet.view(u.id, req.currency, req.lang),
    company: u.company_id ? { id: u.company_id, name: u.company_name, verification: u.company_verification } : null,
    listings: u.listings ?? undefined,
  };
}

admin.get('/users', (req, res) => {
  const pg = paging(req.query, 30);
  const where = ['1 = 1'];
  const p = [];
  if (req.query.q) {
    const q = `%${String(req.query.q).trim()}%`;
    where.push(`(u.phone LIKE ? OR COALESCE(u.name, '') LIKE ? OR COALESCE(u.email, '') LIKE ? OR COALESCE(c.name, '') LIKE ? OR CAST(u.id AS TEXT) = ?)`);
    p.push(q, q, q, q, String(req.query.q).trim());
  }
  if (req.query.role) { where.push('u.role = ?'); p.push(String(req.query.role)); }
  if (req.query.account_type) { where.push('u.account_type = ?'); p.push(String(req.query.account_type)); }
  if (req.query.country) { where.push('u.country = ?'); p.push(String(req.query.country).toUpperCase()); }
  if (req.query.blocked === '1') where.push('u.blocked = 1');
  if (req.query.blocked === '0') where.push('u.blocked = 0');
  if (req.query.balance === '1') where.push('u.balance_usd > 0');
  const order = { new: 'u.id DESC', old: 'u.id ASC', seen: 'u.last_seen_at DESC', balance: 'u.balance_usd DESC', name: 'u.name ASC' }[req.query.sort] || 'u.id DESC';
  const from = `FROM users u LEFT JOIN companies c ON c.owner_id = u.id WHERE ${where.join(' AND ')}`;
  const total = db.get(`SELECT COUNT(*) AS n ${from}`, ...p).n;
  const rows = db.all(
    `SELECT u.*, c.id AS company_id, c.name AS company_name, c.verification AS company_verification,
       (SELECT COUNT(*) FROM listings l WHERE l.user_id = u.id AND l.status = 'active') AS listings
     ${from} ORDER BY ${order} LIMIT ? OFFSET ?`,
    ...p, pg.perPage, pg.offset,
  );
  res.json(pageResult(rows.map((u) => userRow(u, req)), total, pg));
});

admin.get('/users/:id', (req, res) => {
  const u = db.get(`SELECT u.*, c.id AS company_id, c.name AS company_name, c.verification AS company_verification FROM users u LEFT JOIN companies c ON c.owner_id = u.id WHERE u.id = ?`, id(req));
  if (!u) notFound();
  const { txView } = require('./platform');
  const { paymentView } = require('./payments');
  res.json({
    ...userRow(u, req),
    city: u.city, position: u.position, admin_note: u.admin_note, password_set_at: u.password_set_at,
    specialist: db.get('SELECT id, kind, headline, status FROM specialists WHERE user_id = ?', u.id) || null,
    member_of: db.all('SELECT m.role, c.id, c.name FROM company_members m JOIN companies c ON c.id = m.company_id WHERE m.user_id = ?', u.id),
    plan: pay.activePlan(u.id),
    counts: {
      listings: Object.fromEntries(db.all('SELECT status AS k, COUNT(*) AS n FROM listings WHERE user_id = ? GROUP BY status', u.id).map((x) => [x.k, x.n])),
      orders_buyer: db.get('SELECT COUNT(*) AS n FROM orders WHERE buyer_id = ?', u.id).n,
      orders_seller: db.get('SELECT COUNT(*) AS n FROM orders WHERE seller_id = ?', u.id).n,
      messages: db.get('SELECT COUNT(*) AS n FROM messages WHERE sender_id = ?', u.id).n,
      reports_against: db.get('SELECT COUNT(*) AS n FROM reports r JOIN listings l ON l.id = r.listing_id WHERE l.user_id = ?', u.id).n,
      push_devices: db.get('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?', u.id).n,
    },
    telegram: Boolean(db.get('SELECT 1 FROM telegram_links WHERE user_id = ?', u.id)),
    sessions: db.all('SELECT id, device, ip, created_at, last_used_at FROM sessions WHERE user_id = ? ORDER BY last_used_at DESC LIMIT 20', u.id),
    wallet: wallet.history(u.id, { limit: 30 }).map((x) => ({ ...txView(x, req), admin_id: x.admin_id })),
    payments: db.all('SELECT * FROM payments WHERE user_id = ? ORDER BY id DESC LIMIT 20', u.id).map((p) => paymentView(p, req)),
  });
});

const USER_RULES = {
  name: { type: 'string', min: 1, max: 80 },
  email: { type: 'string', max: 120 },
  phone: { type: 'string', max: 30 },
  username: { type: 'string', max: 32 },
  role: { type: 'enum', values: ['user', 'moderator', 'admin'] },
  account_type: { type: 'enum', values: ACCOUNT_TYPES },
  country: { type: 'enum', values: Object.keys(COUNTRY) },
  lang: { type: 'enum', values: LANGS },
  currency: { type: 'enum', values: CURRENCY_CODES },
  city: { type: 'string', max: 80 },
  position: { type: 'string', max: 80 },
  admin_note: { type: 'string', max: 2000 },
};

function strongPassword(p) {
  const s = String(p || '');
  if (s.length < 8 || s.length > 128 || !/[A-Za-zА-Яа-яЁё]/.test(s) || !/\d/.test(s)) fail(422, 'err.password_weak');
  return s;
}

function phoneFor(raw, country) {
  const p = normalizePhone(String(raw), country);
  if (!p) fail(422, 'err.invalid_phone');
  return p.e164;
}

// Yangi foydalanuvchi (masalan, yangi administrator yoki menejer)
admin.post('/users', (req, res) => {
  const v = validate(req.body, { ...USER_RULES, phone: { type: 'string', max: 30, required: true }, password: { type: 'string', max: 128 } });
  const country = v.country || 'UZ';
  const phone = phoneFor(v.phone, country);
  if (db.get('SELECT 1 FROM users WHERE phone = ?', phone)) fail(409, 'err.already_registered');
  const { hashPassword } = require('./auth');
  const uid = db.insert('users', {
    phone, name: v.name, email: v.email, role: v.role || 'user', account_type: v.account_type || 'client', country,
    lang: v.lang || COUNTRY[country].lang, currency: v.currency || COUNTRY[country].currency, city: v.city,
    password_hash: v.password ? hashPassword(strongPassword(v.password)) : null, password_set_at: v.password ? new Date().toISOString() : null,
  });
  log(req, 'user.create', 'user', uid, { phone, role: v.role || 'user' });
  res.status(201).json({ id: uid });
});

admin.patch('/users/:id', (req, res) => {
  const u = db.get('SELECT * FROM users WHERE id = ?', id(req));
  if (!u) notFound();
  const v = validate(req.body, USER_RULES, { partial: true });
  if (v.phone !== undefined) {
    v.phone = phoneFor(v.phone, v.country || u.country);
    if (v.phone !== u.phone && db.get('SELECT 1 FROM users WHERE phone = ? AND id != ?', v.phone, u.id)) fail(409, 'err.already_registered');
  }
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) fail(422, 'err.validation', { email: 'invalid' });
  if (v.username !== undefined) {
    v.username = v.username === null ? null : String(v.username).trim() || null;
    if (v.username && !require('./auth').USERNAME.test(v.username)) fail(422, 'err.validation', { username: 'invalid' });
    if (v.username && db.get('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE AND id != ?', v.username, u.id)) fail(409, 'err.validation', { username: 'taken' });
  }
  // Oxirgi administratorni oddiy foydalanuvchiga aylantirib bo'lmaydi
  if (v.role && v.role !== 'admin' && u.role === 'admin' && db.get(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND blocked = 0`).n <= 1) fail(409, 'err.last_admin');
  const changed = Object.keys(v).filter((k) => v[k] !== u[k]);
  if (!changed.length) return res.json({ ok: true, changed: [] });
  db.update('users', u.id, Object.fromEntries(changed.map((k) => [k, v[k]])));
  // Login (telefon) o'zgarsa — barcha sessiyalar yopiladi
  if (changed.includes('phone')) db.run('DELETE FROM sessions WHERE user_id = ?', u.id);
  const visible = changed.filter((k) => k !== 'admin_note');
  if (visible.length && u.id !== req.user.id) notify(u.id, 'account_changed', { what: visible.join(', ') }, '/profile');
  log(req, 'user.update', 'user', u.id, Object.fromEntries(changed.map((k) => [k, { from: k === 'admin_note' ? undefined : u[k], to: v[k] }])));
  res.json({ ok: true, changed });
});

// Parolni o'rnatish (foydalanuvchi uni unutgan bo'lsa yoki admin o'z parolini almashtirsa)
admin.put('/users/:id/password', (req, res) => {
  const u = db.get('SELECT * FROM users WHERE id = ?', id(req));
  if (!u) notFound();
  const { hashPassword } = require('./auth');
  const pw = strongPassword(req.body?.password);
  db.run(`UPDATE users SET password_hash = ?, password_set_at = datetime('now') WHERE id = ?`, hashPassword(pw), u.id);
  if (req.body?.logout !== false) {
    if (u.id === req.user.id) db.run('DELETE FROM sessions WHERE user_id = ? AND id != ?', u.id, req.sessionId);
    else db.run('DELETE FROM sessions WHERE user_id = ?', u.id);
  }
  if (u.id !== req.user.id) notify(u.id, 'account_changed', { what: 'password' }, '/profile');
  log(req, 'user.password', 'user', u.id);
  res.json({ ok: true });
});

admin.post('/users/:id/logout', (req, res) => {
  const n = db.run('DELETE FROM sessions WHERE user_id = ? AND id != ?', id(req), req.sessionId).changes;
  log(req, 'user.logout', 'user', id(req), { sessions: n });
  res.json({ ok: true, closed: n });
});

admin.delete('/users/:id/sessions/:sid', (req, res) => {
  db.run('DELETE FROM sessions WHERE id = ? AND user_id = ?', Number(req.params.sid), id(req));
  res.json({ ok: true });
});

admin.post('/users/:id/block', (req, res) => {
  const uid = id(req);
  if (uid === req.user.id) fail(409, 'err.invalid_status');
  const reason = req.body?.reason ? String(req.body.reason).slice(0, 300) : null;
  db.tx(() => {
    db.run('UPDATE users SET blocked = 1, blocked_reason = ? WHERE id = ?', reason, uid);
    db.run('DELETE FROM sessions WHERE user_id = ?', uid);
    db.run(`UPDATE listings SET status = 'archived' WHERE user_id = ? AND status IN ('active', 'moderation')`, uid);
  });
  log(req, 'user.block', 'user', uid, { reason });
  res.json({ id: uid, blocked: true });
});

admin.post('/users/:id/unblock', (req, res) => {
  db.run('UPDATE users SET blocked = 0, blocked_reason = NULL WHERE id = ?', id(req));
  log(req, 'user.unblock', 'user', id(req));
  res.json({ id: id(req), blocked: false });
});

// Balansni to'ldirish / yechish
admin.post('/users/:id/balance', (req, res) => {
  const u = db.get('SELECT id, currency FROM users WHERE id = ?', id(req));
  if (!u) notFound();
  const v = validate(req.body, {
    amount: { type: 'number', min: 0.01, max: 1e12, required: true },
    currency: { type: 'enum', values: CURRENCY_CODES, required: true },
    direction: { type: 'enum', values: ['credit', 'debit'], required: true },
    kind: { type: 'enum', values: ['admin_credit', 'admin_debit', 'bonus', 'refund'] },
    note: { type: 'string', max: 300 },
  });
  const amt = money.toUsd(v.amount, v.currency);
  const kind = v.kind || (v.direction === 'credit' ? 'admin_credit' : 'admin_debit');
  const r2 = wallet.change(u.id, v.direction === 'credit' ? amt : -amt, kind, { note: v.note, adminId: req.user.id, amount: v.amount, currency: v.currency });
  log(req, `balance.${v.direction}`, 'user', u.id, { amount: v.amount, currency: v.currency, usd: usd(amt), note: v.note });
  res.json({ ...wallet.view(u.id, req.currency, req.lang), tx_id: r2.id });
});

// Foydalanuvchi nomidan kirish (muammoni ko'rish uchun). Jurnalga yoziladi.
admin.post('/users/:id/impersonate', (req, res) => {
  const u = db.get('SELECT * FROM users WHERE id = ?', id(req));
  if (!u) notFound();
  if (u.blocked) fail(409, 'err.invalid_status');
  const token = createSession(u.id, req);
  log(req, 'user.impersonate', 'user', u.id);
  res.json({ token });
});

admin.delete('/users/:id', (req, res) => {
  const uid = id(req);
  if (uid === req.user.id) fail(409, 'err.invalid_status');
  const u = db.get('SELECT id, phone, name FROM users WHERE id = ?', uid);
  if (!u) notFound();
  if (db.get('SELECT 1 FROM orders WHERE buyer_id = ? OR seller_id = ?', uid, uid) || db.get('SELECT 1 FROM disputes WHERE opened_by = ?', uid)) {
    fail(409, 'err.has_orders');
  }
  const photos = db.all('SELECT p.path FROM listing_photos p JOIN listings l ON l.id = p.listing_id WHERE l.user_id = ?', uid);
  db.run('DELETE FROM users WHERE id = ?', uid);
  for (const p of photos) require('../lib/upload').removeUpload(p.path);
  log(req, 'user.delete', 'user', uid, { phone: u.phone, name: u.name });
  res.json({ ok: true });
});

// ---------- Kompaniyalar ----------
function companyAdminView(c, req) {
  const { companyView } = require('./seller');
  const owner = db.get('SELECT id, phone, name, blocked FROM users WHERE id = ?', c.owner_id);
  const v = companyView(c, req, { full: true });
  v.documents = v.documents.map((d) => ({ ...d, url: `/api/v1/files/docs/${path.basename(db.get('SELECT path FROM company_documents WHERE id = ?', d.id).path)}` }));
  return {
    ...v,
    owner,
    members: db.get('SELECT COUNT(*) AS n FROM company_members WHERE company_id = ?', c.id).n,
    branches: db.get('SELECT COUNT(*) AS n FROM company_branches WHERE company_id = ?', c.id).n,
    created_at: c.created_at,
    forms: legal.spec(c.country, req.lang).forms,
  };
}

admin.get('/companies', (req, res) => {
  const where = ['1 = 1'];
  const p = [];
  if (req.query.verification && req.query.verification !== 'all') { where.push('c.verification = ?'); p.push(String(req.query.verification)); }
  if (req.query.country) { where.push('c.country = ?'); p.push(String(req.query.country).toUpperCase()); }
  if (req.query.blocked === '1') where.push('c.blocked = 1');
  if (req.query.q) {
    const q = `%${String(req.query.q).trim()}%`;
    where.push(`(c.name LIKE ? OR COALESCE(c.tin, '') LIKE ? OR u.phone LIKE ?)`);
    p.push(q, q, q);
  }
  const from = `FROM companies c JOIN users u ON u.id = c.owner_id WHERE ${where.join(' AND ')}`;
  const rows = db.all(`SELECT c.*, u.phone AS owner_phone, u.name AS owner_name, (SELECT COUNT(*) FROM company_documents d WHERE d.company_id = c.id) AS docs,
      (SELECT COUNT(*) FROM listings l WHERE l.company_id = c.id AND l.status = 'active') AS listings ${from} ORDER BY (c.verification = 'pending') DESC, c.id DESC LIMIT 300`, ...p);
  const forms = new Map();
  res.json(rows.map((c) => {
    if (!forms.has(c.country)) forms.set(c.country, legal.spec(c.country, req.lang).forms);
    return {
      id: c.id, name: c.name, country: c.country, city: c.city, tin: c.tin, reg_number: c.reg_number,
      legal_form: c.legal_form, legal_form_name: forms.get(c.country).find((f) => f.code === c.legal_form)?.name || null,
      verification: c.verification, blocked: Boolean(c.blocked), owner: { id: c.owner_id, phone: c.owner_phone, name: c.owner_name },
      docs: c.docs, listings: c.listings, created_at: c.created_at,
      // Eski moderatsiya ekrani uchun
      documents: db.all('SELECT id, doc_type, path, original_name FROM company_documents WHERE company_id = ?', c.id)
        .map((d) => ({ id: d.id, type: d.doc_type, type_name: legal.docName(d.doc_type, req.lang), name: d.original_name, url: `/api/v1/files/${d.path}` })),
    };
  }));
});

admin.get('/companies/:id', (req, res) => {
  const c = db.get('SELECT * FROM companies WHERE id = ?', id(req));
  if (!c) notFound();
  res.json(companyAdminView(c, req));
});

admin.patch('/companies/:id', (req, res) => {
  const c = db.get('SELECT * FROM companies WHERE id = ?', id(req));
  if (!c) notFound();
  const { prepareCompany } = require('./seller');
  const body = req.body || {};
  const fake = { ...req, user: db.get('SELECT * FROM users WHERE id = ?', c.owner_id) };
  const v = prepareCompany(fake, body, c);
  if (body.verification !== undefined) {
    if (!['none', 'pending', 'verified', 'rejected'].includes(body.verification)) fail(422, 'err.validation', { verification: 'invalid' });
    v.verification = body.verification;
    v.verified_at = body.verification === 'verified' ? new Date().toISOString().replace('T', ' ').slice(0, 19) : null;
  }
  // Egasini almashtirish (telefon raqami bo'yicha)
  if (body.owner_phone) {
    const ph = phoneFor(body.owner_phone, c.country);
    const nu = db.get('SELECT id FROM users WHERE phone = ?', ph);
    if (!nu) fail(404, 'err.no_account');
    if (nu.id !== c.owner_id) {
      if (db.get('SELECT 1 FROM companies WHERE owner_id = ?', nu.id)) fail(409, 'err.duplicate');
      v.owner_id = nu.id;
      db.run(`UPDATE users SET account_type = 'company' WHERE id = ?`, nu.id);
    }
  }
  db.update('companies', c.id, v);
  log(req, 'company.update', 'company', c.id, Object.keys(v));
  res.json(companyAdminView(db.get('SELECT * FROM companies WHERE id = ?', c.id), req));
});

admin.post('/companies/:id/verify', (req, res) => {
  const c = db.get('SELECT * FROM companies WHERE id = ?', id(req));
  if (!c) notFound();
  db.run(`UPDATE companies SET verification = 'verified', verified_at = datetime('now'), reject_reason = NULL WHERE id = ?`, c.id);
  notify(c.owner_id, 'company_verified', { name: c.name }, '/profile#p-company');
  log(req, 'company.verify', 'company', c.id);
  res.json({ id: c.id, verification: 'verified' });
});

admin.post('/companies/:id/reject', (req, res) => {
  const c = db.get('SELECT * FROM companies WHERE id = ?', id(req));
  if (!c) notFound();
  const reason = req.body?.reason ? String(req.body.reason).slice(0, 500) : null;
  db.run(`UPDATE companies SET verification = 'rejected', verified_at = NULL, reject_reason = ? WHERE id = ?`, reason, c.id);
  notify(c.owner_id, 'company_rejected', { name: c.name, reason: reason || '—' }, '/profile#p-company');
  log(req, 'company.reject', 'company', c.id, { reason });
  res.json({ id: c.id, verification: 'rejected' });
});

admin.post('/companies/:id/block', (req, res) => {
  const c = db.get('SELECT * FROM companies WHERE id = ?', id(req));
  if (!c) notFound();
  const on = req.body?.blocked !== false;
  db.tx(() => {
    db.run('UPDATE companies SET blocked = ? WHERE id = ?', on ? 1 : 0, c.id);
    if (on) db.run(`UPDATE listings SET status = 'archived' WHERE company_id = ? AND status IN ('active', 'moderation')`, c.id);
  });
  log(req, on ? 'company.block' : 'company.unblock', 'company', c.id);
  res.json({ id: c.id, blocked: on });
});

admin.delete('/companies/:id/documents/:doc', (req, res) => {
  const d = db.get('SELECT * FROM company_documents WHERE id = ? AND company_id = ?', Number(req.params.doc), id(req));
  if (!d) notFound();
  db.run('DELETE FROM company_documents WHERE id = ?', d.id);
  require('../lib/upload').removeUpload(d.path);
  log(req, 'company.doc_delete', 'company', id(req), { doc: d.original_name });
  res.json({ ok: true });
});

admin.delete('/companies/:id', (req, res) => {
  const c = db.get('SELECT * FROM companies WHERE id = ?', id(req));
  if (!c) notFound();
  for (const d of db.all('SELECT path FROM company_documents WHERE company_id = ?', c.id)) require('../lib/upload').removeUpload(d.path);
  db.run('DELETE FROM companies WHERE id = ?', c.id);
  db.run(`UPDATE users SET account_type = 'client' WHERE id = ? AND account_type = 'company'`, c.owner_id);
  log(req, 'company.delete', 'company', c.id, { name: c.name });
  res.json({ ok: true });
});

// ---------- E'lonlar ----------
admin.get('/listings', (req, res) => {
  const pg = paging(req.query, 20);
  const status = String(req.query.status || 'moderation');
  const ctx = { lang: req.lang, currency: req.currency };
  const where = [];
  const p = [];
  if (status !== 'all') { where.push('status = ?'); p.push(status); }
  if (req.query.q) {
    const q = String(req.query.q).trim();
    if (/^\d+$/.test(q)) { where.push('id = ?'); p.push(Number(q)); } else { where.push('title LIKE ?'); p.push(`%${q}%`); }
  }
  if (req.query.user_id) { where.push('user_id = ?'); p.push(Number(req.query.user_id)); }
  if (req.query.company_id) { where.push('company_id = ?'); p.push(Number(req.query.company_id)); }
  if (req.query.country) { where.push('country = ?'); p.push(String(req.query.country).toUpperCase()); }
  if (req.query.promoted === '1') where.push(`promoted_until > datetime('now')`);
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.get(`SELECT COUNT(*) AS n FROM listings ${w}`, ...p).n;
  // Moderatsiyada: pullik daraja (VIP/GOLD/PREMIUM) to'langan e'lonlar birinchi
  const order = status === 'moderation' ? `(CASE WHEN tier_until > datetime('now') THEN 0 ELSE 1 END), updated_at ASC` : 'id DESC';
  const rows = db.all(`SELECT * FROM listings ${w} ORDER BY ${order} LIMIT ? OFFSET ?`, ...p, pg.perPage, pg.offset);
  res.json(pageResult(rows.map((l) => ({ ...L.detail(l, ctx), status: l.status, promoted_until: l.promoted_until, user_id: l.user_id })), total, pg));
});

admin.post('/listings/:id/approve', (req, res) => {
  const l = db.get('SELECT * FROM listings WHERE id = ?', id(req));
  if (!l) notFound();
  if (!['moderation', 'rejected', 'archived'].includes(l.status)) fail(409, 'err.invalid_status');
  activate(l.id);
  log(req, 'listing.approve', 'listing', l.id);
  res.json({ id: l.id, status: 'active' });
});

admin.post('/listings/:id/reject', (req, res) => {
  const v = validate(req.body, { reason: { type: 'string', min: 3, max: 500, required: true } });
  const l = db.get('SELECT * FROM listings WHERE id = ?', id(req));
  if (!l) notFound();
  if (!['moderation', 'active'].includes(l.status)) fail(409, 'err.invalid_status');
  db.run(`UPDATE listings SET status = 'rejected', reject_reason = ? WHERE id = ?`, v.reason, l.id);
  notify(l.user_id, 'listing_rejected', { title: l.title, reason: v.reason, listing_id: l.id }, '/my/listings');
  log(req, 'listing.reject', 'listing', l.id, { reason: v.reason });
  res.json({ id: l.id, status: 'rejected' });
});

admin.patch('/listings/:id', (req, res) => {
  const l = db.get('SELECT * FROM listings WHERE id = ?', id(req));
  if (!l) notFound();
  const v = validate(req.body, {
    status: { type: 'enum', values: ['active', 'archived', 'moderation', 'deleted', 'sold', 'draft'] },
    title: { type: 'string', min: 3, max: 120 },
    promoted_days: { type: 'int', min: 0, max: 365 },
    highlighted_days: { type: 'int', min: 0, max: 365 },
    tier: { type: 'enum', values: ['vip', 'gold', 'premium', 'none'] },
    tier_days: { type: 'int', min: 1, max: 365 },
  });
  const up = {};
  if (v.title) up.title = v.title;
  if (v.promoted_days !== undefined) up.promoted_until = v.promoted_days ? new Date(Date.now() + v.promoted_days * 864e5).toISOString().replace('T', ' ').slice(0, 19) : null;
  if (v.highlighted_days !== undefined) up.highlighted_until = v.highlighted_days ? new Date(Date.now() + v.highlighted_days * 864e5).toISOString().replace('T', ' ').slice(0, 19) : null;
  if (v.status === 'active' && l.status !== 'active') activate(l.id);
  else if (v.status) { up.status = v.status; if (v.status === 'deleted') up.deleted_at = new Date().toISOString().replace('T', ' ').slice(0, 19); }
  if (Object.keys(up).length) db.update('listings', l.id, up);
  // Admin/moderator darajani bepul beradi yoki olib tashlaydi
  if (v.tier === 'none') db.run('UPDATE listings SET tier = NULL, tier_until = NULL WHERE id = ?', l.id);
  else if (v.tier) pay.applyTier(l.id, v.tier, v.tier_days || config.prices.tierDays[v.tier]);
  log(req, 'listing.update', 'listing', l.id, v);
  res.json({ ok: true });
});

admin.delete('/listings/:id', (req, res) => {
  const l = db.get('SELECT * FROM listings WHERE id = ?', id(req));
  if (!l) notFound();
  if (db.get('SELECT 1 FROM orders WHERE listing_id = ?', l.id)) {
    db.run(`UPDATE listings SET status = 'deleted', deleted_at = datetime('now') WHERE id = ?`, l.id);
  } else {
    for (const p of db.all('SELECT path FROM listing_photos WHERE listing_id = ?', l.id)) require('../lib/upload').removeUpload(p.path);
    db.run('DELETE FROM listings WHERE id = ?', l.id);
  }
  log(req, 'listing.delete', 'listing', l.id, { title: l.title });
  res.json({ ok: true });
});

// ---------- Buyurtmalar ----------
admin.get('/orders', (req, res) => {
  const pg = paging(req.query, 30);
  const where = ['1 = 1'];
  const p = [];
  if (req.query.status) { where.push('o.status = ?'); p.push(String(req.query.status)); }
  if (req.query.escrow === '1') where.push('o.escrow = 1');
  if (req.query.q) { const q = `%${String(req.query.q).trim()}%`; where.push('(o.number LIKE ? OR o.title LIKE ? OR b.phone LIKE ? OR s.phone LIKE ?)'); p.push(q, q, q, q); }
  const from = `FROM orders o JOIN users b ON b.id = o.buyer_id JOIN users s ON s.id = o.seller_id WHERE ${where.join(' AND ')}`;
  const total = db.get(`SELECT COUNT(*) AS n ${from}`, ...p).n;
  const rows = db.all(`SELECT o.*, b.name AS buyer_name, b.phone AS buyer_phone, s.name AS seller_name, s.phone AS seller_phone ${from} ORDER BY o.id DESC LIMIT ? OFFSET ?`, ...p, pg.perPage, pg.offset);
  res.json(pageResult(rows.map((o) => ({
    id: o.id, number: o.number, title: o.title, status: o.status, total: o.total, currency: o.currency,
    formatted: money.formatAmount(o.total, o.currency, req.lang), escrow: Boolean(o.escrow), escrow_status: o.escrow_status,
    buyer: { id: o.buyer_id, name: o.buyer_name, phone: o.buyer_phone }, seller: { id: o.seller_id, name: o.seller_name, phone: o.seller_phone },
    listing_id: o.listing_id, created_at: o.created_at,
  })), total, pg));
});

admin.patch('/orders/:id', (req, res) => {
  const o = db.get('SELECT * FROM orders WHERE id = ?', id(req));
  if (!o) notFound();
  const v = validate(req.body, { status: { type: 'enum', values: ['new', 'confirmed', 'shipped', 'delivered', 'completed', 'cancelled'], required: true }, note: { type: 'string', max: 500 } });
  db.run(`UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?`, v.status, o.id);
  db.insert('order_events', { order_id: o.id, status: v.status, actor_id: req.user.id, note: `admin: ${v.note || ''}`.trim() });
  for (const uid of [o.buyer_id, o.seller_id]) notify(uid, 'order_status', { number: o.number, status_key: `os.${v.status}`, order_id: o.id }, '/my/orders');
  log(req, 'order.status', 'order', o.id, { from: o.status, to: v.status });
  res.json({ ok: true });
});

// ---------- To'lovlar va hamyon ----------
admin.post('/payments/:id/mark-paid', (req, res) => {
  const p = db.get('SELECT * FROM payments WHERE id = ?', id(req));
  if (!p) notFound();
  if (p.status === 'paid') fail(409, 'err.invalid_status');
  db.run(`UPDATE payments SET status = 'pending' WHERE id = ?`, p.id);
  pay.markPaid(p.id, `admin-${req.user.id}`);
  log(req, 'payment.mark_paid', 'payment', p.id, { amount: p.amount, currency: p.currency });
  res.json({ ok: true });
});

// Qaytarish: hamyonga (standart) yoki faqat holatni o'zgartirish
// Qaytarilgan ko'tarish to'lovi: shu to'lov qo'shgan kunlar olib tashlanadi
function revertPromotion(p) {
  const pkg = parseJson(p.meta, {}).package;
  const tiers = ['vip', 'gold', 'premium'];
  const days = tiers.includes(pkg) ? config.prices.tierDays[pkg] : config.prices.promoDays;
  const cut = `-${days} days`;
  db.run('DELETE FROM promotions WHERE payment_id = ?', p.id);
  if (tiers.includes(pkg)) {
    db.run(`UPDATE listings SET tier_until = datetime(tier_until, ?) WHERE id = ? AND tier = ?`, cut, p.ref_id, pkg);
    db.run(`UPDATE listings SET tier = NULL, tier_until = NULL WHERE id = ? AND tier_until <= datetime('now')`, p.ref_id);
  } else {
    if (pkg === 'top' || pkg === 'combo') db.run(`UPDATE listings SET promoted_until = CASE WHEN datetime(promoted_until, ?) > datetime('now') THEN datetime(promoted_until, ?) END WHERE id = ?`, cut, cut, p.ref_id);
    if (pkg === 'highlight' || pkg === 'combo') db.run(`UPDATE listings SET highlighted_until = CASE WHEN datetime(highlighted_until, ?) > datetime('now') THEN datetime(highlighted_until, ?) END WHERE id = ?`, cut, cut, p.ref_id);
  }
}

admin.post('/payments/:id/refund', (req, res) => {
  const p = db.get('SELECT * FROM payments WHERE id = ?', id(req));
  if (!p) notFound();
  if (p.status !== 'paid') fail(409, 'err.invalid_status');
  db.tx(() => {
    db.run(`UPDATE payments SET status = 'refunded' WHERE id = ?`, p.id);
    if (p.purpose === 'promo') revertPromotion(p);
    if (req.body?.to_wallet !== false) wallet.change(p.user_id, money.toUsd(p.amount, p.currency), 'refund', { paymentId: p.id, adminId: req.user.id, note: `#${p.id}`, amount: p.amount, currency: p.currency });
  });
  log(req, 'payment.refund', 'payment', p.id, { amount: p.amount, currency: p.currency, to_wallet: req.body?.to_wallet !== false });
  res.json({ ok: true });
});

admin.get('/wallet', (req, res) => {
  const pg = paging(req.query, 50);
  const { txView } = require('./platform');
  const w = req.query.user_id ? 'WHERE w.user_id = ?' : '';
  const p = req.query.user_id ? [Number(req.query.user_id)] : [];
  const total = db.get(`SELECT COUNT(*) AS n FROM wallet_tx w ${w}`, ...p).n;
  const rows = db.all(`SELECT w.*, u.name AS user_name, u.phone AS user_phone, a.name AS admin_name FROM wallet_tx w JOIN users u ON u.id = w.user_id LEFT JOIN users a ON a.id = w.admin_id ${w} ORDER BY w.id DESC LIMIT ? OFFSET ?`, ...p, pg.perPage, pg.offset);
  res.json(pageResult(rows.map((x) => ({ ...txView(x, req), user: { id: x.user_id, name: x.user_name, phone: x.user_phone }, admin: x.admin_name })), total, pg));
});

// ---------- Push / xabar tarqatish ----------
const AUDIENCE = {
  role: { type: 'enum', values: ['user', 'admin'] },
  account_type: { type: 'enum', values: ACCOUNT_TYPES },
  country: { type: 'enum', values: Object.keys(COUNTRY) },
  lang: { type: 'enum', values: LANGS },
  verified_companies: { type: 'bool' },
  active_days: { type: 'int', min: 1, max: 3650 },
  user_ids: { type: 'array', max: 1000 },
  with_push: { type: 'bool' },
};
function audienceQuery(a) {
  const where = ['u.blocked = 0'];
  const p = [];
  if (a.role) { where.push('u.role = ?'); p.push(a.role); }
  if (a.account_type) { where.push('u.account_type = ?'); p.push(a.account_type); }
  if (a.country) { where.push('u.country = ?'); p.push(a.country); }
  if (a.lang) { where.push('u.lang = ?'); p.push(a.lang); }
  if (a.verified_companies) where.push(`EXISTS (SELECT 1 FROM companies c WHERE c.owner_id = u.id AND c.verification = 'verified')`);
  if (a.active_days) { where.push(`u.last_seen_at > datetime('now', ?)`); p.push(`-${a.active_days} days`); }
  if (a.with_push) where.push('EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.user_id = u.id)');
  const ids = (a.user_ids || []).map(Number).filter(Number.isInteger);
  if (ids.length) { where.push(`u.id IN (${ids.map(() => '?').join(',')})`); p.push(...ids); }
  return { sql: `FROM users u WHERE ${where.join(' AND ')}`, params: p };
}

admin.post('/broadcast/preview', (req, res) => {
  const a = validate(req.body?.audience || {}, AUDIENCE, { partial: true });
  const q = audienceQuery(a);
  res.json({
    recipients: db.get(`SELECT COUNT(*) AS n ${q.sql}`, ...q.params).n,
    with_push: db.get(`SELECT COUNT(*) AS n ${q.sql} AND EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.user_id = u.id)`, ...q.params).n,
    with_telegram: db.get(`SELECT COUNT(*) AS n ${q.sql} AND EXISTS (SELECT 1 FROM telegram_links t WHERE t.user_id = u.id)`, ...q.params).n,
  });
});

admin.post('/broadcast', async (req, res) => {
  const v = validate(req.body, {
    title: { type: 'string', min: 2, max: 120, required: true },
    body: { type: 'string', min: 2, max: 1000, required: true },
    link: { type: 'string', max: 300 },
  });
  if (v.link && !/^\/(?!\/)/.test(v.link) && !/^https:\/\//.test(v.link)) fail(422, 'err.validation', { link: 'invalid' });
  const a = validate(req.body?.audience || {}, AUDIENCE, { partial: true });
  const ch = { inapp: req.body?.channels?.inapp !== false, push: req.body?.channels?.push !== false, telegram: Boolean(req.body?.channels?.telegram) };
  const q = audienceQuery(a);
  const users = db.all(`SELECT u.id ${q.sql}`, ...q.params);
  if (!users.length) fail(422, 'err.validation', { audience: 'empty' });
  const bid = db.insert('broadcasts', { admin_id: req.user.id, title: v.title, body: v.body, link: v.link, audience: a, channels: ch, recipients: users.length });
  const params = { title: v.title, body: v.body };
  const tg = require('../lib/telegram');
  let tgSent = 0;
  // Bildirishnomalar tarixi — bitta tranzaksiyada (tez)
  if (ch.inapp) {
    db.tx(() => {
      for (const u of users) {
        const nid = db.insert('notifications', { user_id: u.id, type: 'broadcast', params, link: v.link || null });
        push(u.id, 'notification', { id: nid, type: 'broadcast', params, link: v.link || null });
      }
    });
  }
  if (ch.telegram) for (const u of users) { try { if (tg.sendToUser(u.id, `${v.title}\n\n${v.body}`, v.link)) tgSent++; } catch { /* yuborilmadi */ } }
  let pushSent = 0;
  if (ch.push) {
    const res2 = await Promise.all(users.map((u) => webpush.sendToUser(u.id, { title: v.title, body: v.body, link: v.link }).catch(() => 0)));
    pushSent = res2.reduce((s, x) => s + x, 0);
  }
  db.run('UPDATE broadcasts SET push_sent = ?, telegram_sent = ? WHERE id = ?', pushSent, tgSent, bid);
  log(req, 'broadcast.send', 'broadcast', bid, { recipients: users.length, channels: ch });
  res.status(201).json({ id: bid, recipients: users.length, push_sent: pushSent, telegram_sent: tgSent });
});

admin.get('/broadcasts', (_req, res) => {
  res.json(db.all('SELECT b.*, u.name AS admin_name FROM broadcasts b LEFT JOIN users u ON u.id = b.admin_id ORDER BY b.id DESC LIMIT 100')
    .map((b) => ({ ...b, audience: parseJson(b.audience, {}), channels: parseJson(b.channels, {}) })));
});

// ---------- Server ----------
admin.get('/system', (_req, res) => {
  const snap = metrics.snapshot({ dbFile: config.dbFile, uploadDir: config.uploadDir });
  const tables = db.all(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
    .map((t) => ({ name: t.name, rows: db.get(`SELECT COUNT(*) AS n FROM "${t.name}"`).n }));
  res.json({
    ...snap,
    tables,
    sse_clients: require('../lib/notify').connections?.() ?? null,
    config: {
      env: process.env.NODE_ENV || 'development', site_url: config.siteUrl, payments_dev: config.paymentsDev, otp_dev_echo: config.otpDevEcho,
      sms_provider: config.smsProvider, telegram: Boolean(config.telegramToken), click: Boolean(config.click.serviceId), payme: Boolean(config.payme.merchantId),
    },
  });
});

// Bazaning nusxasi (zaxira) — yuklab olish
admin.get('/system/backup', (req, res) => {
  const tmp = path.join(os.tmpdir(), `hemu-backup-${Date.now()}.db`);
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  log(req, 'system.backup');
  res.download(tmp, `hemu-${new Date().toISOString().slice(0, 10)}.db`, () => fs.rm(tmp, { force: true }, () => {}));
});

// Texnik tozalash: eskirgan sessiyalar, kodlar, ko'rish loglari; bazani ixchamlash
admin.post('/system/cleanup', (req, res) => {
  const out = {
    sessions: db.run('DELETE FROM sessions WHERE expires_at < ?', new Date().toISOString()).changes,
    otp: db.run('DELETE FROM otp_codes WHERE expires_at < ?', Date.now()).changes,
    view_log: db.run(`DELETE FROM listing_view_log WHERE day < date('now', '-2 days')`).changes,
  };
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  log(req, 'system.cleanup', null, null, out);
  res.json(out);
});

// ---------- Sozlamalar ----------
admin.get('/settings', (_req, res) => res.json(settings.all()));
admin.put('/settings', (req, res) => {
  const changed = settings.update(req.body || {});
  if (changed.smsProvider || changed['eskiz.email'] || changed['eskiz.password']) require('../lib/sms').reset?.();
  if (Object.keys(changed).length) log(req, 'settings.update', null, null, changed);
  res.json({ changed, items: settings.all() });
});

// ---------- VIP / GOLD / PREMIUM narxlari (moderator ham) ----------
admin.get('/tiers', (req, res) => {
  const items = pay.TIERS.map((tr) => ({
    id: tr,
    price: config.prices.tier[tr],
    price_usd: config.prices.tier[tr], // eski nom (narx prices.promoCurrency valyutasida)
    price_uzs: money.roundNice(money.convert(config.prices.tier[tr], config.prices.promoCurrency, 'UZS'), 'UZS'),
    days: config.prices.tierDays[tr],
    active: db.get(`SELECT COUNT(*) AS n FROM listings WHERE status = 'active' AND tier = ? AND tier_until > datetime('now')`, tr).n,
    sold_30d: db.get(`SELECT COUNT(*) AS n FROM payments WHERE purpose = 'promo' AND status = 'paid' AND json_extract(meta, '$.package') = ? AND paid_at > datetime('now', '-30 days')`, tr).n,
  }));
  const listings = L.cardsByIds(`SELECT l.* FROM listings l WHERE l.tier_until > datetime('now') AND l.status = 'active' ORDER BY CASE l.tier WHEN 'vip' THEN 1 WHEN 'gold' THEN 2 ELSE 3 END, l.tier_until LIMIT 200`, [], { lang: req.lang, currency: req.currency });
  const tops = ['top', 'highlight', 'combo'].map((p) => ({
    id: p, price: config.prices.promo[p], price_usd: config.prices.promo[p], price_uzs: money.roundNice(money.convert(config.prices.promo[p], config.prices.promoCurrency, 'UZS'), 'UZS'),
    sold_30d: db.get(`SELECT COUNT(*) AS n FROM payments WHERE purpose = 'promo' AND status = 'paid' AND json_extract(meta, '$.package') = ? AND paid_at > datetime('now', '-30 days')`, p).n,
  }));
  res.json({ items, tops, currency: config.prices.promoCurrency, currencies: CURRENCY_CODES, promo_days: config.prices.promoDays, listings, uzs_rate: pay.priceIn(1, 'UZS'), rates: money.getRates() });
});
admin.put('/tiers', (req, res) => {
  const body = {};
  for (const tr of pay.TIERS) {
    const x = req.body?.[tr];
    if (!x) continue;
    const pr = x.price ?? x.price_usd;
    if (pr !== undefined) body[`prices.tier.${tr}`] = pr;
    if (x.days !== undefined) body[`prices.tierDays.${tr}`] = x.days;
  }
  for (const p of ['top', 'highlight', 'combo']) { const pr = req.body?.[p]?.price ?? req.body?.[p]?.price_usd; if (pr !== undefined) body[`prices.promo.${p}`] = pr; }
  if (req.body?.currency !== undefined) body['prices.promoCurrency'] = req.body.currency;
  if (req.body?.promo_days !== undefined) body['prices.promoDays'] = req.body.promo_days;
  const changed = settings.update(body);
  if (Object.keys(changed).length) log(req, 'tiers.update', null, null, changed);
  res.json({ changed });
});

// ---------- Matnli sahifalar: oferta, maxfiylik, savol-javob ----------
const pagesLib = require('../lib/pages');
admin.get('/pages', (_req, res) => res.json({
  pages: pagesLib.all(),
  legal: settings.all(/^(legalName|legalTin|legalAddress|supportPhone|supportEmail|supportTelegram)$/),
}));
admin.put('/pages', (req, res) => {
  const v = validate(req.body, { key: { type: 'enum', values: pagesLib.KEYS, required: true }, lang: { type: 'enum', values: pagesLib.LANGS, required: true }, text: { type: 'string', max: 60000 } });
  pagesLib.save(v.key, v.lang, v.text);
  log(req, 'pages.update', null, null, { key: v.key, lang: v.lang });
  res.json({ ok: true });
});
admin.put('/pages/legal', (req, res) => {
  const body = {};
  for (const k of ['legalName', 'legalTin', 'legalAddress', 'supportPhone', 'supportEmail', 'supportTelegram']) if (req.body?.[k] !== undefined) body[k] = req.body[k];
  const changed = settings.update(body);
  if (Object.keys(changed).length) log(req, 'settings.update', null, null, changed);
  res.json({ changed });
});

// ---------- Murojaatlar ("Bog'lanish" sahifasi) — moderator ham ----------
admin.get('/support', (req, res) => {
  const status = ['new', 'answered', 'closed', 'all'].includes(req.query.status) ? req.query.status : 'new';
  const pg = paging(req.query, 30);
  const w = status === 'all' ? '' : 'WHERE t.status = ?';
  const p = status === 'all' ? [] : [status];
  const total = db.get(`SELECT COUNT(*) AS n FROM support_tickets t ${w}`, ...p).n;
  const rows = db.all(
    `SELECT t.*, u.name AS user_name, u.phone AS user_phone, a.name AS replied_name FROM support_tickets t
     LEFT JOIN users u ON u.id = t.user_id LEFT JOIN users a ON a.id = t.replied_by ${w} ORDER BY t.id DESC LIMIT ? OFFSET ?`,
    ...p, pg.perPage, pg.offset,
  );
  const counts = Object.fromEntries(db.all('SELECT status AS k, COUNT(*) AS n FROM support_tickets GROUP BY status').map((x) => [x.k, x.n]));
  res.json({ ...pageResult(rows, total, pg), counts });
});
admin.patch('/support/:id', async (req, res) => {
  const tk = db.get('SELECT * FROM support_tickets WHERE id = ?', id(req));
  if (!tk) notFound();
  const v = validate(req.body, { status: { type: 'enum', values: ['new', 'answered', 'closed'] }, reply: { type: 'string', min: 2, max: 3000 }, sms: { type: 'bool' } });
  const up = {};
  if (v.reply) Object.assign(up, { reply: v.reply, replied_by: req.user.id, replied_at: new Date().toISOString().replace('T', ' ').slice(0, 19), status: v.status || 'answered' });
  else if (v.status) up.status = v.status;
  if (Object.keys(up).length) db.update('support_tickets', tk.id, up);
  let smsSent = null;
  if (v.reply) {
    if (tk.user_id) notify(tk.user_id, 'support_reply', { text: v.reply.slice(0, 300) }, '/contact');
    // Ro'yxatdan o'tmagan foydalanuvchiga javob SMS orqali
    if (v.sms && tk.phone) {
      try { await require('../lib/sms').sendSms(tk.phone, `HEMU.UZ: ${v.reply}`.slice(0, 600)); smsSent = true; } catch (e) { smsSent = e.message; }
    }
  }
  log(req, 'support.update', 'support', tk.id, { status: up.status, replied: Boolean(v.reply) });
  res.json({ ok: true, sms: smsSent });
});

// ---------- Integratsiyalar: SMS (Eskiz.uz), Click, Payme ----------
const INTEGRATION_KEYS = /^(siteUrl|otpDevEcho|otpTestRegistration|adminTwoFactor|smsProvider|eskiz\.|paymentsDev|click\.|payme\.)/;
function integrationsView() {
  const base = `${config.siteUrl}/api/v1`;
  return {
    items: settings.all(INTEGRATION_KEYS),
    status: {
      sms: config.smsProvider === 'eskiz' ? Boolean(config.eskiz.email && config.eskiz.password) : false,
      click: Boolean(config.click.serviceId && config.click.merchantId && config.click.secretKey),
      payme: Boolean(config.payme.merchantId && config.payme.key),
      https: config.siteUrl.startsWith('https://'),
    },
    callbacks: { click_prepare: `${base}/pay/click/prepare`, click_complete: `${base}/pay/click/complete`, payme: `${base}/pay/payme` },
    sms_log: db.all('SELECT * FROM sms_log ORDER BY id DESC LIMIT 15'),
  };
}
admin.get('/integrations', (_req, res) => res.json(integrationsView()));
admin.put('/integrations', (req, res) => {
  const body = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => INTEGRATION_KEYS.test(k)));
  if (body.siteUrl !== undefined) {
    body.siteUrl = String(body.siteUrl).trim().replace(/\/+$/, '');
    if (body.siteUrl && !/^https?:\/\/[^\s/]+/.test(body.siteUrl)) fail(422, 'err.validation', { siteUrl: 'invalid' });
    if (!body.siteUrl) delete body.siteUrl;
  }
  const changed = settings.update(body);
  if (changed.smsProvider || changed['eskiz.email'] || changed['eskiz.password']) require('../lib/sms').reset();
  if (Object.keys(changed).length) log(req, 'integrations.update', null, null, changed);
  res.json({ changed, ...integrationsView() });
});
admin.post('/integrations/sms-test', async (req, res) => {
  const v = validate(req.body, { phone: { type: 'string', min: 7, max: 30, required: true }, text: { type: 'string', max: 300 } });
  const n = normalizePhone(v.phone, 'UZ');
  if (!n?.e164) fail(422, 'err.validation', { phone: 'invalid' });
  try {
    const r2 = await require('../lib/sms').sendSms(n.e164, v.text || 'HEMU.UZ: test SMS');
    res.json({ ok: true, provider: r2.provider });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});
admin.get('/integrations/sms-balance', async (_req, res) => {
  try { res.json({ ok: true, balance: await require('../lib/sms').eskizBalance() }); } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ---------- Fura logistika: nazorat (moderator ham) ----------
admin.get('/freight', (req, res) => {
  const pg = paging(req.query, 30);
  const status = ['open', 'closed'].includes(req.query.status) ? req.query.status : 'open';
  const where = ['f.status = ?'];
  const p = [status];
  if (['load', 'truck'].includes(req.query.kind)) { where.push('f.kind = ?'); p.push(req.query.kind); }
  if (req.query.q) { where.push('(f.search_text LIKE ? OR u.phone LIKE ?)'); p.push(`%${String(req.query.q).toLowerCase()}%`, `%${String(req.query.q)}%`); }
  const w = where.join(' AND ');
  const total = db.get(`SELECT COUNT(*) AS n FROM freight f JOIN users u ON u.id = f.user_id WHERE ${w}`, ...p).n;
  const rows = db.all(`SELECT f.* FROM freight f JOIN users u ON u.id = f.user_id WHERE ${w} ORDER BY f.id DESC LIMIT ? OFFSET ?`, ...p, pg.perPage, pg.offset);
  const fv = require('./freight').view;
  res.json(pageResult(rows.map((x) => ({ ...fv(x, req, { full: true }), phone: db.get('SELECT phone FROM users WHERE id = ?', x.user_id)?.phone, contacts: x.contacts })), total, pg));
});
admin.delete('/freight/:id', (req, res) => {
  const x = db.get('SELECT id FROM freight WHERE id = ?', id(req));
  if (!x) notFound();
  db.run('DELETE FROM freight WHERE id = ?', x.id);
  log(req, 'freight.delete', 'freight', x.id);
  res.json({ ok: true });
});

// ---------- Reklama bannerlari ----------
const banners = require('../lib/banners');
admin.get('/banners', (_req, res) => {
  // Oxirgi 30 kunlik ko'rishlar va bosishlar
  const stats = Object.fromEntries(db.all(`SELECT uid, SUM(views) AS views, SUM(clicks) AS clicks FROM banner_stats WHERE day >= date('now', '-30 days') GROUP BY uid`).map((x) => [x.uid, { views: x.views, clicks: x.clicks }]));
  res.json({ items: banners.all(), themes: banners.THEMES, max: banners.MAX, stats });
});
admin.put('/banners', (req, res) => {
  const before = banners.all();
  const items = banners.save(req.body?.items);
  // Endi ishlatilmayotgan yuklangan rasmlarni o'chirish
  const up = require('../lib/upload');
  for (const b of before) if (b.image?.startsWith('/uploads/banners/') && !items.some((x) => x.image === b.image)) up.removeUpload(b.image.slice(9));
  log(req, 'banners.update', null, null, { count: items.length, active: items.filter((x) => x.active).length });
  res.json({ items });
});
admin.post('/banners/image', (req, res, next) => require('../lib/upload').banners.single('image')(req, res, next), (req, res) => {
  if (!req.file) fail(422, 'err.validation', { image: 'required' });
  const [f] = require('../lib/upload').verifyFiles([req.file]);
  res.status(201).json({ url: `/uploads/banners/${f.filename}` });
});

// ---------- Jurnal ----------
admin.get('/log', (req, res) => {
  const pg = paging(req.query, 50);
  const where = [];
  const p = [];
  if (req.query.action) { where.push('l.action LIKE ?'); p.push(`${String(req.query.action)}%`); }
  if (req.query.target_type) { where.push('l.target_type = ?'); p.push(String(req.query.target_type)); }
  if (req.query.target_id) { where.push('l.target_id = ?'); p.push(Number(req.query.target_id)); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.get(`SELECT COUNT(*) AS n FROM admin_log l ${w}`, ...p).n;
  const rows = db.all(`SELECT l.*, u.name AS admin_name, u.phone AS admin_phone FROM admin_log l LEFT JOIN users u ON u.id = l.admin_id ${w} ORDER BY l.id DESC LIMIT ? OFFSET ?`, ...p, pg.perPage, pg.offset);
  res.json(pageResult(rows.map((x) => ({ ...x, details: parseJson(x.details, x.details) })), total, pg));
});

// ---------- Valyuta kurslari ----------
admin.put('/rates', (req, res) => {
  const body = req.body || {};
  const bad = Object.entries(body).filter(([k, v]) => !CURRENCY_CODES.includes(k) || k === 'USD' || !(Number(v) > 0));
  if (bad.length) fail(422, 'err.validation', Object.fromEntries(bad.map(([k]) => [k, 'invalid'])));
  db.tx(() => Object.entries(body).forEach(([k, v]) => money.setRate(k, Number(v), 'admin')));
  money.recomputeUsdPrices();
  log(req, 'rates.update', null, null, body);
  res.json(money.getRates());
});

admin.post('/rates/sync', async (req, res) => {
  try {
    const updated = await money.syncFromCbu();
    log(req, 'rates.sync', null, null, { updated });
    res.json({ updated });
  } catch (e) {
    fail(502, 'err.server', { source: config.ratesUrl, error: e.message });
  }
});

r.use('/admin', requireAuth, admin);

// ---------- Himoyalangan fayllar (kompaniya hujjatlari, chat ilovalari) ----------
r.get('/files/docs/:name', requireAuth, (req, res) => {
  const name = path.basename(req.params.name);
  const rel = `docs/${name}`;
  const me = req.user;
  const allowed =
    me.role === 'admin' ||
    db.get('SELECT 1 FROM company_documents d JOIN companies c ON c.id = d.company_id WHERE d.path = ? AND c.owner_id = ?', rel, me.id) ||
    db.get('SELECT 1 FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.attachment = ? AND (c.buyer_id = ? OR c.seller_id = ?)', rel, me.id, me.id) ||
    db.get(`SELECT 1 FROM requests WHERE attachment = ? AND (status = 'open' OR user_id = ?)`, rel, me.id);
  if (!allowed) forbidden();
  const full = path.join(config.uploadDir, 'docs', name);
  if (!fs.existsSync(full)) notFound();
  // Admin hujjatni brauzerda ko'rishi uchun (PDF/rasm) — inline
  res.set('Content-Disposition', req.query.inline === '1' && me.role === 'admin' ? 'inline' : 'attachment');
  res.sendFile(full);
});

module.exports = { router: r };
