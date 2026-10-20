const { Router } = require('express');
const db = require('../db');
const config = require('../config');
const money = require('../lib/money');
const pay = require('../lib/payments');
const upload = require('../lib/upload');
const { notify } = require('../lib/notify');
const { fileUrl } = require('../lib/listings');
const { requireAuth, requireStaff, rateLimit } = require('../lib/auth');
const { fail, notFound, forbidden, validate, parseJson } = require('../lib/http');
const { t } = require('../i18n');

const r = Router();
const REASONS = ['fake', 'price', 'sold', 'fraud', 'duplicate', 'other'];
const normSerial = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// ---------- Shikoyat ----------
r.post('/listings/:id/report', requireAuth, rateLimit({ name: 'report', windowMs: 3600000, max: 20, key: (req) => req.user.id }), (req, res) => {
  const v = validate(req.body, { reason: { type: 'enum', values: REASONS, required: true }, comment: { type: 'string', max: 1000 } });
  const l = db.get('SELECT id, user_id FROM listings WHERE id = ?', Number(req.params.id));
  if (!l) notFound();
  if (l.user_id === req.user.id) fail(409, 'err.own_listing');
  db.run(
    `INSERT INTO reports (listing_id, reporter_id, reason, comment) VALUES (?, ?, ?, ?)
     ON CONFLICT(listing_id, reporter_id) DO UPDATE SET reason = excluded.reason, comment = excluded.comment, status = 'open', created_at = datetime('now')`,
    l.id, req.user.id, v.reason, v.comment,
  );
  res.status(201).json({ ok: true });
});

// ---------- Seriya raqami / VIN tekshiruvi ----------
function serialCheck(listing) {
  const s = normSerial(listing.serial_number);
  if (!s) return { checked: false };
  const dup = db.get(
    `SELECT COUNT(*) AS n FROM listings WHERE id != ? AND status IN ('active', 'moderation') AND UPPER(REPLACE(REPLACE(serial_number, '-', ''), ' ', '')) = ?`,
    listing.id, s,
  ).n;
  const black = db.get('SELECT note FROM serial_blacklist WHERE serial = ?', s);
  return { checked: true, serial_masked: `${s.slice(0, 3)}***${s.slice(-3)}`, duplicates: dup, wanted: Boolean(black), ok: !dup && !black };
}
r.get('/listings/:id/serial-check', (req, res) => {
  const l = db.get('SELECT id, serial_number FROM listings WHERE id = ?', Number(req.params.id));
  if (!l) notFound();
  res.json(serialCheck(l));
});

// ---------- Texnik ko'rik ----------
function inspectionView(i, req) {
  const l = db.get('SELECT id, title FROM listings WHERE id = ?', i.listing_id);
  return {
    id: i.id, listing: l, status: i.status, status_label: t(req.lang, `is.${i.status}`),
    price: i.price, currency: i.currency, price_formatted: money.formatAmount(i.price, i.currency, req.lang),
    note: i.note, inspector: i.inspector, scheduled_at: i.scheduled_at, report: i.report, verdict: i.verdict,
    report_files: parseJson(i.report_files, []).map(fileUrl), payment_id: i.payment_id, created_at: i.created_at,
  };
}

r.get('/inspection/price', (req, res) => {
  const amount = pay.priceIn(config.prices.inspection, req.currency);
  res.json({ amount, currency: req.currency, formatted: money.formatAmount(amount, req.currency, req.lang), providers: pay.providers() });
});

r.post('/listings/:id/inspections', requireAuth, (req, res) => {
  const v = validate(req.body, { note: { type: 'string', max: 1000 }, provider: { type: 'enum', values: pay.PROVIDER_IDS, required: true } });
  const l = db.get('SELECT id, user_id, status FROM listings WHERE id = ?', Number(req.params.id));
  if (!l || l.status !== 'active') notFound();
  if (l.user_id === req.user.id) fail(409, 'err.own_listing');
  const price = pay.priceIn(config.prices.inspection, req.currency);
  const id = db.insert('inspections', { listing_id: l.id, buyer_id: req.user.id, price, currency: req.currency, note: v.note });
  const p = pay.create(req.user, { purpose: 'inspection', refId: id, usd: config.prices.inspection, provider: v.provider, currency: req.currency });
  db.run('UPDATE inspections SET price = ?, currency = ?, payment_id = ? WHERE id = ?', p.amount, p.currency, p.id, id);
  res.status(201).json({ inspection_id: id, ...p });
});

r.get('/my/inspections', requireAuth, (req, res) => {
  res.json(db.all('SELECT * FROM inspections WHERE buyer_id = ? ORDER BY id DESC', req.user.id).map((i) => inspectionView(i, req)));
});

// ---------- Xavfsiz bitim ----------
r.post('/orders/:id/escrow/pay', requireAuth, (req, res) => {
  const v = validate(req.body, { provider: { type: 'enum', values: pay.PROVIDER_IDS, required: true } });
  const o = db.get('SELECT * FROM orders WHERE id = ?', Number(req.params.id));
  if (!o) notFound();
  if (o.buyer_id !== req.user.id) forbidden();
  if (!o.escrow || o.escrow_status !== 'unpaid' || o.status === 'cancelled') fail(409, 'err.invalid_status');
  const p = pay.create(req.user, { purpose: 'escrow', refId: o.id, amount: o.total + o.escrow_fee, currency: o.currency, provider: v.provider });
  res.status(201).json(p);
});

r.post('/orders/:id/dispute', requireAuth, (req, res) => {
  const v = validate(req.body, { reason: { type: 'string', min: 10, max: 2000, required: true } });
  const o = db.get('SELECT * FROM orders WHERE id = ?', Number(req.params.id));
  if (!o) notFound();
  if (o.buyer_id !== req.user.id && o.seller_id !== req.user.id) forbidden();
  if (o.escrow_status !== 'held') fail(409, 'err.invalid_status');
  db.tx(() => {
    db.insert('disputes', { order_id: o.id, opened_by: req.user.id, reason: v.reason });
    db.run(`UPDATE orders SET escrow_status = 'disputed' WHERE id = ?`, o.id);
    db.insert('order_events', { order_id: o.id, status: o.status, actor_id: req.user.id, note: 'escrow:disputed' });
  });
  const other = req.user.id === o.buyer_id ? o.seller_id : o.buyer_id;
  notify(other, 'escrow', { number: o.number, status_key: 'es.disputed', order_id: o.id }, '/my/orders');
  for (const a of db.all(`SELECT id FROM users WHERE role = 'admin'`)) notify(a.id, 'escrow', { number: o.number, status_key: 'es.disputed', order_id: o.id }, '/admin');
  res.status(201).json({ ok: true, escrow_status: 'disputed' });
});

// ---------- Admin ----------
const admin = Router();
admin.use(requireAuth, requireStaff);

admin.get('/reports', (req, res) => {
  const rows = db.all(
    `SELECT r.*, l.title, l.status AS listing_status, u.name AS reporter FROM reports r
     LEFT JOIN listings l ON l.id = r.listing_id JOIN users u ON u.id = r.reporter_id
     WHERE r.status = ? ORDER BY r.id DESC LIMIT 200`,
    String(req.query.status || 'open'),
  );
  const counts = Object.fromEntries(db.all(`SELECT listing_id, COUNT(*) AS n FROM reports WHERE status = 'open' GROUP BY listing_id`).map((x) => [x.listing_id, x.n]));
  res.json(rows.map((x) => ({ ...x, same_listing_reports: counts[x.listing_id] || 0 })));
});

admin.post('/reports/:id/:action', (req, res) => {
  if (!['resolve', 'dismiss'].includes(req.params.action)) notFound();
  const rep = db.get('SELECT * FROM reports WHERE id = ?', Number(req.params.id));
  if (!rep) notFound();
  const status = req.params.action === 'resolve' ? 'resolved' : 'dismissed';
  db.run('UPDATE reports SET status = ? WHERE listing_id = ? AND status = ?', status, rep.listing_id, 'open');
  // "Hal qilindi" — e'lon katalogdan olinadi
  if (status === 'resolved' && req.body?.archive !== false) {
    const l = db.get('SELECT * FROM listings WHERE id = ?', rep.listing_id);
    if (l && l.status === 'active') {
      db.run(`UPDATE listings SET status = 'rejected', reject_reason = ? WHERE id = ?`, String(req.body?.reason || rep.reason).slice(0, 300), l.id);
      notify(l.user_id, 'listing_rejected', { title: l.title, reason: req.body?.reason || rep.reason, listing_id: l.id }, `/create/${l.id}`);
    }
  }
  notify(rep.reporter_id, 'report_resolved', { title: db.get('SELECT title FROM listings WHERE id = ?', rep.listing_id)?.title || '' });
  res.json({ ok: true, status });
});

admin.get('/disputes', (req, res) => {
  const rows = db.all(
    `SELECT d.*, o.number, o.title, o.total, o.currency, o.escrow_fee, o.buyer_id, o.seller_id, u.name AS opened_by_name
     FROM disputes d JOIN orders o ON o.id = d.order_id JOIN users u ON u.id = d.opened_by
     WHERE d.status = ? ORDER BY d.id DESC`,
    String(req.query.status || 'open'),
  );
  res.json(rows.map((d) => ({ ...d, total_formatted: money.formatAmount(d.total, d.currency, req.lang) })));
});

admin.post('/disputes/:id/resolve', (req, res) => {
  const v = validate(req.body, { resolution: { type: 'enum', values: ['release', 'refund'], required: true }, note: { type: 'string', max: 1000 } });
  const d = db.get('SELECT * FROM disputes WHERE id = ?', Number(req.params.id));
  if (!d || d.status !== 'open') notFound();
  const o = db.get('SELECT * FROM orders WHERE id = ?', d.order_id);
  const es = v.resolution === 'release' ? 'released' : 'refunded';
  db.tx(() => {
    db.run(`UPDATE disputes SET status = 'resolved', resolution = ?, admin_note = ?, resolved_at = datetime('now') WHERE id = ?`, v.resolution, v.note, d.id);
    db.run(`UPDATE orders SET escrow_status = ?, status = ? WHERE id = ?`, es, v.resolution === 'release' ? 'completed' : 'cancelled', o.id);
    if (v.resolution === 'refund' && o.listing_id && ['confirmed', 'shipped', 'delivered'].includes(o.status)) {
      db.run('UPDATE listings SET stock_qty = stock_qty + ? WHERE id = ? AND stock_qty IS NOT NULL', o.qty, o.listing_id);
    }
    db.insert('order_events', { order_id: o.id, status: v.resolution === 'release' ? 'completed' : 'cancelled', actor_id: req.user.id, note: `escrow:${es}` });
  });
  for (const u of [o.buyer_id, o.seller_id]) notify(u, 'escrow', { number: o.number, status_key: `es.${es}`, order_id: o.id }, '/my/orders');
  res.json({ ok: true, escrow_status: es });
});

// Xavfsiz bitim pullari: sotuvchiga o'tkazish kerak bo'lganlar va qaytarilishi kerak bo'lganlar
admin.get('/escrow', (req, res) => {
  const rows = db.all(`SELECT o.*, (SELECT name FROM companies WHERE owner_id = o.seller_id) AS seller_company FROM orders o WHERE o.escrow = 1 AND o.escrow_status IN ('held', 'released', 'refunded', 'disputed') ORDER BY o.updated_at DESC LIMIT 200`);
  res.json(rows.map((o) => ({ id: o.id, number: o.number, title: o.title, status: o.status, escrow_status: o.escrow_status, escrow_status_label: t(req.lang, `es.${o.escrow_status}`), total: money.formatAmount(o.total, o.currency, req.lang), fee: money.formatAmount(o.escrow_fee, o.currency, req.lang), seller: o.seller_company })));
});

admin.get('/inspections', (req, res) => {
  const rows = db.all(`SELECT i.*, u.name AS buyer_name, u.phone AS buyer_phone FROM inspections i JOIN users u ON u.id = i.buyer_id WHERE i.status != 'unpaid' ORDER BY i.id DESC LIMIT 200`);
  res.json(rows.map((i) => ({ ...inspectionView(i, req), buyer: { name: i.buyer_name, phone: i.buyer_phone } })));
});

admin.post('/inspections/:id', upload.photos.array('files', 15), async (req, res) => {
  const i = db.get('SELECT * FROM inspections WHERE id = ?', Number(req.params.id));
  if (!i) { for (const f of req.files || []) upload.removeUpload(`listings/${f.filename}`); notFound(); }
  const files = await upload.optimize(upload.verifyFiles(req.files), 'listings');
  const v = validate(req.body, {
    status: { type: 'enum', values: ['paid', 'scheduled', 'done', 'cancelled'] },
    inspector: { type: 'string', max: 120 }, scheduled_at: { type: 'string', max: 40 },
    report: { type: 'string', max: 10000 }, verdict: { type: 'enum', values: ['good', 'issues', 'bad'] },
  }, { partial: true });
  const prev = parseJson(i.report_files, []);
  db.update('inspections', i.id, { ...v, report_files: files.length ? [...prev, ...files.map((f) => `listings/${f.filename}`)] : undefined });
  const fresh = db.get('SELECT * FROM inspections WHERE id = ?', i.id);
  if (v.status && v.status !== i.status) {
    notify(i.buyer_id, 'inspection_status', { title: db.get('SELECT title FROM listings WHERE id = ?', i.listing_id)?.title, status_key: `is.${v.status}` }, '/my/orders?tab=inspections');
  }
  res.json(inspectionView(fresh, req));
});

admin.get('/payments', (req, res) => {
  const { paymentView } = require('./payments');
  // ?manual=1 — admin orqali to'lov so'rovlari (galochka): avval "To'ladim" bosilganlari
  const rows = req.query.manual
    ? db.all(`SELECT * FROM payments WHERE provider = 'admin' AND status = 'pending' ORDER BY (json_extract(meta, '$.claimed_at') IS NULL), id DESC LIMIT 200`)
    : db.all('SELECT * FROM payments ORDER BY id DESC LIMIT 200');
  res.json(rows.map((p) => {
    const u = db.get('SELECT name, phone FROM users WHERE id = ?', p.user_id);
    return { ...paymentView(p, req), user_id: p.user_id, user_name: u?.name || '', user_phone: u?.phone || '' };
  }));
});

admin.get('/blacklist', (_req, res) => res.json(db.all('SELECT * FROM serial_blacklist ORDER BY created_at DESC')));
admin.post('/blacklist', (req, res) => {
  const v = validate(req.body, { serial: { type: 'string', min: 4, max: 40, required: true }, note: { type: 'string', max: 300 } });
  db.run('INSERT OR REPLACE INTO serial_blacklist (serial, note) VALUES (?, ?)', normSerial(v.serial), v.note);
  res.status(201).json({ ok: true });
});
admin.delete('/blacklist/:serial', (req, res) => {
  db.run('DELETE FROM serial_blacklist WHERE serial = ?', normSerial(req.params.serial));
  res.json({ ok: true });
});

r.use('/admin', admin);

module.exports = { router: r, serialCheck, inspectionView };
