const { Router } = require('express');
const db = require('../db');
const money = require('../lib/money');
const L = require('../lib/listings');
const { notify } = require('../lib/notify');
const { requireAuth, rateLimit } = require('../lib/auth');
const { fail, notFound, forbidden, validate } = require('../lib/http');
const { t } = require('../i18n');

const r = Router();
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const today = () => new Date().toISOString().slice(0, 10);

function daysBetween(a, b) {
  const out = [];
  const d = new Date(`${a}T00:00:00Z`);
  const end = new Date(`${b}T00:00:00Z`);
  while (d <= end && out.length < 366) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function busyDays(listingId, from, to, exceptBooking = null) {
  const set = new Set();
  const rows = db.all(
    `SELECT id, start_date, end_date FROM bookings WHERE listing_id = ? AND status = 'confirmed' AND end_date >= ? AND start_date <= ?`,
    listingId, from, to,
  );
  for (const b of rows) if (b.id !== exceptBooking) for (const d of daysBetween(b.start_date, b.end_date)) set.add(d);
  return set;
}
const blockedDays = (listingId, from, to) => new Set(db.all('SELECT day FROM listing_blocked_dates WHERE listing_id = ? AND day BETWEEN ? AND ?', listingId, from, to).map((x) => x.day));

// Narx: soatlik → kunlar × soat × narx; kunlik/smena → kunlar × narx
function quote(l, start, end, hours) {
  const days = daysBetween(start, end).length;
  let total = null;
  if (l.price !== null) {
    if (l.price_unit === 'hour') total = l.price * days * (hours || 8);
    else if (l.price_unit === 'day' || l.price_unit === 'shift') total = l.price * days;
    else total = l.price;
  }
  return { days, hours_per_day: l.price_unit === 'hour' ? hours || 8 : null, total, currency: l.currency };
}

function loadRent(id) {
  const l = db.get('SELECT * FROM listings WHERE id = ?', Number(id));
  if (!l) notFound();
  return l;
}

r.get('/listings/:id/availability', (req, res) => {
  const l = loadRent(req.params.id);
  const from = DAY.test(req.query.from || '') ? req.query.from : today();
  const to = DAY.test(req.query.to || '') ? req.query.to : new Date(Date.now() + 62 * 86400000).toISOString().slice(0, 10);
  res.json({ from, to, busy: [...busyDays(l.id, from, to)].sort(), blocked: [...blockedDays(l.id, from, to)].sort() });
});

// Sotuvchi o'zi band qiladigan kunlar (ta'mir, boshqa mijoz)
r.put('/listings/:id/blocked-dates', requireAuth, (req, res) => {
  const l = loadRent(req.params.id);
  if (l.user_id !== req.user.id) forbidden();
  const add = (Array.isArray(req.body?.add) ? req.body.add : []).filter((d) => DAY.test(d)).slice(0, 366);
  const remove = (Array.isArray(req.body?.remove) ? req.body.remove : []).filter((d) => DAY.test(d)).slice(0, 366);
  db.tx(() => {
    for (const d of add) db.run('INSERT OR IGNORE INTO listing_blocked_dates (listing_id, day) VALUES (?, ?)', l.id, d);
    for (const d of remove) db.run('DELETE FROM listing_blocked_dates WHERE listing_id = ? AND day = ?', l.id, d);
  });
  res.json({ ok: true });
});

const RULES = {
  start_date: { type: 'string', required: true, pattern: DAY },
  end_date: { type: 'string', required: true, pattern: DAY },
  hours_per_day: { type: 'int', min: 1, max: 24 },
  note: { type: 'string', max: 1000 },
};

r.post('/listings/:id/bookings/quote', (req, res) => {
  const l = loadRent(req.params.id);
  const v = validate(req.body, RULES);
  if (v.end_date < v.start_date) fail(422, 'err.validation', { end_date: 'min' });
  const q = quote(l, v.start_date, v.end_date, v.hours_per_day);
  const from = v.start_date;
  const conflict = daysBetween(v.start_date, v.end_date).some((d) => busyDays(l.id, from, v.end_date).has(d) || blockedDays(l.id, from, v.end_date).has(d));
  res.json({ ...q, available: !conflict, total_formatted: q.total !== null ? money.formatAmount(q.total, q.currency, req.lang) : null });
});

r.post('/listings/:id/bookings', requireAuth, rateLimit({ name: 'booking', windowMs: 3600000, max: 30, key: (req) => req.user.id }), (req, res) => {
  const l = loadRent(req.params.id);
  if (l.status !== 'active' || l.deal_type !== 'rent') fail(409, 'err.invalid_status');
  if (l.user_id === req.user.id) fail(409, 'err.own_listing');
  const v = validate(req.body, RULES);
  if (v.end_date < v.start_date || v.start_date < today()) fail(422, 'err.validation', { start_date: 'min' });
  const days = daysBetween(v.start_date, v.end_date);
  const busy = busyDays(l.id, v.start_date, v.end_date);
  const blocked = blockedDays(l.id, v.start_date, v.end_date);
  if (days.some((d) => busy.has(d) || blocked.has(d))) fail(409, 'err.dates_busy');
  const q = quote(l, v.start_date, v.end_date, v.hours_per_day);
  const id = db.insert('bookings', { listing_id: l.id, renter_id: req.user.id, seller_id: l.user_id, start_date: v.start_date, end_date: v.end_date, hours_per_day: q.hours_per_day, total: q.total, currency: l.currency, note: v.note });
  notify(l.user_id, 'booking_new', { name: req.user.name || req.user.phone, title: l.title, dates: `${v.start_date} — ${v.end_date}`, booking_id: id }, '/my/orders?tab=bookings');
  res.status(201).json(bookingView(db.get('SELECT * FROM bookings WHERE id = ?', id), req));
});

function bookingView(b, req) {
  const l = db.get('SELECT id, title, price_unit FROM listings WHERE id = ?', b.listing_id);
  const cover = db.get('SELECT path FROM listing_photos WHERE listing_id = ? ORDER BY sort, id LIMIT 1', b.listing_id)?.path;
  const other = db.get('SELECT id, name, phone FROM users WHERE id = ?', req.user.id === b.renter_id ? b.seller_id : b.renter_id);
  const company = db.get('SELECT name FROM companies WHERE owner_id = ?', other.id);
  return {
    id: b.id, listing: { id: l?.id, title: l?.title, cover: L.fileUrl(cover) }, role: req.user.id === b.renter_id ? 'renter' : 'seller',
    with: { name: company?.name || other.name, phone: b.status === 'confirmed' ? other.phone : null },
    start_date: b.start_date, end_date: b.end_date, days: daysBetween(b.start_date, b.end_date).length, hours_per_day: b.hours_per_day,
    total: b.total, currency: b.currency, total_formatted: b.total !== null ? money.formatAmount(b.total, b.currency, req.lang) : null,
    note: b.note, status: b.status, status_label: t(req.lang, `bs.${b.status}`), created_at: b.created_at,
  };
}

r.get('/my/bookings', requireAuth, (req, res) => {
  const col = req.query.role === 'seller' ? 'seller_id' : 'renter_id';
  const rows = db.all(`SELECT * FROM bookings WHERE ${col} = ? ORDER BY start_date DESC, id DESC LIMIT 200`, req.user.id);
  res.json(rows.map((b) => bookingView(b, req)));
});

r.post('/bookings/:id/:action', requireAuth, (req, res) => {
  const { action } = req.params;
  if (!['confirm', 'reject', 'cancel'].includes(action)) notFound();
  const b = db.get('SELECT * FROM bookings WHERE id = ?', Number(req.params.id));
  if (!b) notFound();
  const isSeller = b.seller_id === req.user.id;
  const isRenter = b.renter_id === req.user.id;
  if (!isSeller && !isRenter) forbidden();
  const status = { confirm: 'confirmed', reject: 'rejected', cancel: 'cancelled' }[action];
  if ((action === 'confirm' || action === 'reject') && (!isSeller || b.status !== 'pending')) fail(409, 'err.invalid_status');
  if (action === 'cancel' && !['pending', 'confirmed'].includes(b.status)) fail(409, 'err.invalid_status');
  if (action === 'confirm') {
    const busy = busyDays(b.listing_id, b.start_date, b.end_date, b.id);
    if (daysBetween(b.start_date, b.end_date).some((d) => busy.has(d))) fail(409, 'err.dates_busy');
  }
  db.run('UPDATE bookings SET status = ? WHERE id = ?', status, b.id);
  const title = db.get('SELECT title FROM listings WHERE id = ?', b.listing_id)?.title;
  notify(isSeller ? b.renter_id : b.seller_id, 'booking_status', { title, dates: `${b.start_date} — ${b.end_date}`, status_key: `bs.${status}`, booking_id: b.id }, '/my/orders?tab=bookings');
  res.json(bookingView(db.get('SELECT * FROM bookings WHERE id = ?', b.id), req));
});

module.exports = { router: r, quote, daysBetween };
