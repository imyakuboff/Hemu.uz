const { Router } = require('express');
const db = require('../db');
const config = require('../config');
const L = require('../lib/listings');
const money = require('../lib/money');
const { notify } = require('../lib/notify');
const { requireAuth } = require('../lib/auth');
const { fail, notFound, forbidden, validate, paging, pageResult } = require('../lib/http');
const { t } = require('../i18n');

const r = Router();

const ACTIVE = ['new', 'confirmed', 'shipped', 'delivered'];
const DONE = ['completed', 'cancelled'];

function loadOrder(req) {
  const o = db.get('SELECT * FROM orders WHERE id = ?', Number(req.params.id));
  if (!o) notFound();
  if (o.buyer_id !== req.user.id && o.seller_id !== req.user.id && req.user.role !== 'admin') forbidden();
  return o;
}

function party(userId) {
  const u = db.get('SELECT id, name, phone FROM users WHERE id = ?', userId);
  const c = db.get('SELECT id, name, verification, rating_avg, rating_count FROM companies WHERE owner_id = ?', userId);
  return {
    user_id: userId,
    name: u?.name,
    company: c ? { id: c.id, name: c.name, verified: c.verification === 'verified', rating: Math.round(c.rating_avg * 10) / 10, reviews_count: c.rating_count } : null,
  };
}

// Joriy foydalanuvchi bajarishi mumkin bo'lgan amallar
function actions(o, userId) {
  const isSeller = o.seller_id === userId;
  const isBuyer = o.buyer_id === userId;
  const a = [];
  if (o.escrow && o.escrow_status === 'unpaid' && o.status !== 'cancelled') {
    if (isBuyer) a.push('pay');
    if (isBuyer || isSeller) a.push('cancel');
    return a;
  }
  if (o.escrow && o.escrow_status === 'held' && !['completed', 'cancelled'].includes(o.status)) a.push('dispute');
  if (isSeller && o.status === 'new') a.push('confirm');
  if (isSeller && o.status === 'confirmed') a.push('ship');
  if ((isSeller || isBuyer) && o.status === 'shipped') a.push('deliver');
  if (isBuyer && ['shipped', 'delivered'].includes(o.status)) a.push('complete');
  if ((isBuyer && o.status === 'new') || (isSeller && ['new', 'confirmed'].includes(o.status))) a.push('cancel');
  if (isBuyer && o.status === 'completed' && !db.get('SELECT 1 FROM reviews WHERE order_id = ?', o.id)) a.push('review');
  return a;
}

function orderView(o, req, full = false) {
  const { lang } = req;
  const fmt = (n) => money.formatAmount(n, o.currency, lang);
  const l = o.listing_id ? db.get('SELECT id, title, status FROM listings WHERE id = ?', o.listing_id) : null;
  const cover = l ? db.get('SELECT path FROM listing_photos WHERE listing_id = ? ORDER BY sort, id LIMIT 1', l.id)?.path : null;
  const view = {
    id: o.id,
    number: o.number,
    status: o.status,
    status_label: t(lang, `os.${o.status}`),
    title: o.title,
    listing: l ? { id: l.id, title: l.title, cover: L.fileUrl(cover), available: l.status === 'active' } : null,
    qty: o.qty,
    unit_price: o.unit_price,
    unit_price_formatted: fmt(o.unit_price),
    delivery_cost: o.delivery_cost,
    total: o.total,
    total_formatted: fmt(o.total),
    currency: o.currency,
    // Klient valyutasida taxminiy summa
    total_display: o.currency !== req.currency ? money.formatAmount(money.roundNice(money.convert(o.total, o.currency, req.currency), req.currency), req.currency, lang) : null,
    delivery: { method: o.delivery_method, address: o.delivery_address, carrier: o.carrier, tracking: o.tracking, eta: o.eta },
    escrow: o.escrow ? { status: o.escrow_status, label: t(lang, `es.${o.escrow_status}`), fee: o.escrow_fee, fee_formatted: fmt(o.escrow_fee), to_pay_formatted: fmt(o.total + o.escrow_fee) } : null,
    role: o.buyer_id === req.user.id ? 'buyer' : 'seller',
    seller: party(o.seller_id),
    buyer: party(o.buyer_id),
    actions: actions(o, req.user.id),
    created_at: o.created_at,
    updated_at: o.updated_at,
  };
  if (full) {
    view.note = o.note;
    view.cancel_reason = o.cancel_reason;
    view.events = db.all('SELECT status, note, created_at FROM order_events WHERE order_id = ? ORDER BY id', o.id).map((e) => ({ ...e, status_label: t(lang, `os.${e.status}`) }));
  }
  return view;
}

function setStatus(o, status, actorId, patch = {}, note = null) {
  db.update('orders', o.id, { ...patch, status, updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19) });
  db.insert('order_events', { order_id: o.id, status, actor_id: actorId, note });
  const to = actorId === o.buyer_id ? o.seller_id : o.buyer_id;
  notify(to, 'order_status', { number: o.number, status_key: `os.${status}`, order_id: o.id }, `/orders/${o.id}`);
}

// "Заказать запчасть"
r.post('/orders', requireAuth, (req, res) => {
  const v = validate(req.body, {
    listing_id: { type: 'int', required: true },
    qty: { type: 'int', min: 1, max: 100000, required: true },
    delivery_method: { type: 'enum', values: ['pickup', 'courier', 'carrier'], required: true },
    delivery_address: { type: 'string', max: 300 },
    note: { type: 'string', max: 1000 },
    escrow: { type: 'bool' },
  });
  if (v.delivery_method !== 'pickup' && !v.delivery_address) fail(422, 'err.validation', { delivery_address: 'required' });
  const id = db.tx(() => {
    const l = db.get('SELECT * FROM listings WHERE id = ?', v.listing_id);
    if (!l || l.status !== 'active') notFound();
    if (l.user_id === req.user.id) fail(409, 'err.own_listing');
    if (l.deal_type !== 'sale' || l.price === null) fail(409, 'err.invalid_status');
    if (l.stock_qty !== null && v.qty > l.stock_qty) fail(409, 'err.out_of_stock', { available: l.stock_qty });
    const oid = db.insert('orders', {
      listing_id: l.id,
      buyer_id: req.user.id,
      seller_id: l.user_id,
      title: l.title,
      qty: v.qty,
      unit_price: l.price,
      currency: l.currency,
      delivery_method: v.delivery_method,
      delivery_address: v.delivery_address,
      total: l.price * v.qty,
      note: v.note,
      escrow: v.escrow ? 1 : 0,
      escrow_status: v.escrow ? 'unpaid' : null,
      escrow_fee: v.escrow ? Math.round(l.price * v.qty * config.escrowFeePct) / 100 : 0,
    });
    const yy = String(new Date().getFullYear()).slice(2);
    db.run('UPDATE orders SET number = ? WHERE id = ?', `MG-${yy}${String(oid).padStart(4, '0')}`, oid);
    db.insert('order_events', { order_id: oid, status: 'new', actor_id: req.user.id });
    return oid;
  });
  const o = db.get('SELECT * FROM orders WHERE id = ?', id);
  notify(o.seller_id, 'order_new', { number: o.number, title: o.title, order_id: o.id }, `/orders/${o.id}`);
  res.status(201).json(orderView(o, req, true));
});

// "Мои заказы" (xaridor) yoki sotuvchi buyurtmalari: ?role=seller, ?tab=active|completed
r.get('/orders', requireAuth, (req, res) => {
  const pg = paging(req.query, 20);
  const col = req.query.role === 'seller' ? 'seller_id' : 'buyer_id';
  const tab = req.query.tab === 'completed' ? DONE : req.query.tab === 'active' ? ACTIVE : [...ACTIVE, ...DONE];
  const marks = tab.map(() => '?').join(',');
  const total = db.get(`SELECT COUNT(*) AS n FROM orders WHERE ${col} = ? AND status IN (${marks})`, req.user.id, ...tab).n;
  const rows = db.all(`SELECT * FROM orders WHERE ${col} = ? AND status IN (${marks}) ORDER BY id DESC LIMIT ? OFFSET ?`, req.user.id, ...tab, pg.perPage, pg.offset);
  const out = pageResult(rows.map((o) => orderView(o, req)), total, pg);
  out.counts = {
    active: db.get(`SELECT COUNT(*) AS n FROM orders WHERE ${col} = ? AND status IN ('new','confirmed','shipped','delivered')`, req.user.id).n,
    completed: db.get(`SELECT COUNT(*) AS n FROM orders WHERE ${col} = ? AND status IN ('completed','cancelled')`, req.user.id).n,
    requests: db.get(`SELECT COUNT(*) AS n FROM requests WHERE user_id = ? AND status = 'open'`, req.user.id).n,
  };
  res.json(out);
});

r.get('/orders/:id', requireAuth, (req, res) => {
  res.json(orderView(loadOrder(req), req, true));
});

// Hisob-faktura uchun ma'lumot ("Документы" / "Запросить счёт")
r.get('/orders/:id/invoice', requireAuth, (req, res) => {
  const o = loadOrder(req);
  const seller = db.get('SELECT * FROM companies WHERE owner_id = ?', o.seller_id);
  const l = o.listing_id ? db.get('SELECT vat_rate FROM listings WHERE id = ?', o.listing_id) : null;
  const vatRate = l?.vat_rate || 0;
  res.json({
    number: o.number,
    date: o.created_at.slice(0, 10),
    seller: seller ? { name: seller.name, tin: seller.tin, address: [seller.city, seller.address].filter(Boolean).join(', '), phone: seller.phone, email: seller.email } : party(o.seller_id),
    buyer: party(o.buyer_id),
    items: [{ title: o.title, qty: o.qty, unit_price: o.unit_price, amount: o.unit_price * o.qty }],
    delivery_cost: o.delivery_cost,
    vat_rate: vatRate,
    vat_included: vatRate ? Math.round((o.total * vatRate) / (100 + vatRate) * 100) / 100 : 0,
    total: o.total,
    currency: o.currency,
    total_formatted: money.formatAmount(o.total, o.currency, req.lang),
  });
});

r.post('/orders/:id/confirm', requireAuth, (req, res) => {
  const v = validate(req.body, { delivery_cost: { type: 'number', min: 0, max: 1e12 }, eta: { type: 'string', max: 40 } });
  db.tx(() => {
    const o = loadOrder(req);
    if (o.seller_id !== req.user.id) forbidden();
    if (o.status !== 'new') fail(409, 'err.invalid_status');
    if (o.escrow && o.escrow_status !== 'held') fail(409, 'err.payment_required');
    // Zaxirani band qilish
    if (o.listing_id) {
      const l = db.get('SELECT stock_qty FROM listings WHERE id = ?', o.listing_id);
      if (l && l.stock_qty !== null) {
        if (l.stock_qty < o.qty) fail(409, 'err.out_of_stock', { available: l.stock_qty });
        db.run('UPDATE listings SET stock_qty = stock_qty - ? WHERE id = ?', o.qty, o.listing_id);
      }
    }
    const cost = v.delivery_cost || 0;
    setStatus(o, 'confirmed', req.user.id, { delivery_cost: cost, total: o.unit_price * o.qty + cost, eta: v.eta });
  });
  res.json(orderView(loadOrder(req), req, true));
});

r.post('/orders/:id/ship', requireAuth, (req, res) => {
  const v = validate(req.body, { carrier: { type: 'string', max: 80 }, tracking: { type: 'string', max: 80 }, eta: { type: 'string', max: 40 } });
  const o = loadOrder(req);
  if (o.seller_id !== req.user.id) forbidden();
  if (o.status !== 'confirmed') fail(409, 'err.invalid_status');
  setStatus(o, 'shipped', req.user.id, { carrier: v.carrier, tracking: v.tracking, eta: v.eta || o.eta });
  res.json(orderView(loadOrder(req), req, true));
});

r.post('/orders/:id/deliver', requireAuth, (req, res) => {
  const o = loadOrder(req);
  if (o.status !== 'shipped') fail(409, 'err.invalid_status');
  setStatus(o, 'delivered', req.user.id);
  res.json(orderView(loadOrder(req), req, true));
});

r.post('/orders/:id/complete', requireAuth, (req, res) => {
  const o = loadOrder(req);
  if (o.buyer_id !== req.user.id) forbidden();
  if (!['shipped', 'delivered'].includes(o.status)) fail(409, 'err.invalid_status');
  if (o.escrow && o.escrow_status === 'disputed') fail(409, 'err.invalid_status');
  setStatus(o, 'completed', req.user.id);
  // Xavfsiz bitim: xaridor qabul qildi — pul sotuvchiga
  if (o.escrow && o.escrow_status === 'held') {
    db.run(`UPDATE orders SET escrow_status = 'released' WHERE id = ?`, o.id);
    notify(o.seller_id, 'escrow', { number: o.number, status_key: 'es.released', order_id: o.id }, '/my/orders?tab=sales');
  }
  res.json(orderView(loadOrder(req), req, true));
});

r.post('/orders/:id/cancel', requireAuth, (req, res) => {
  const v = validate(req.body, { reason: { type: 'string', max: 300 } });
  db.tx(() => {
    const o = loadOrder(req);
    const allowed = (o.buyer_id === req.user.id && o.status === 'new') || (o.seller_id === req.user.id && ['new', 'confirmed'].includes(o.status));
    if (!allowed || o.escrow_status === 'disputed') fail(409, 'err.invalid_status');
    // Xavfsiz bitim: to'langan bo'lsa — pul xaridorga qaytariladi
    if (o.escrow && o.escrow_status === 'held') {
      db.run(`UPDATE orders SET escrow_status = 'refunded' WHERE id = ?`, o.id);
      notify(o.buyer_id, 'escrow', { number: o.number, status_key: 'es.refunded', order_id: o.id }, '/my/orders');
    }
    // Band qilingan zaxirani qaytarish
    if (o.status === 'confirmed' && o.listing_id) {
      db.run('UPDATE listings SET stock_qty = stock_qty + ? WHERE id = ? AND stock_qty IS NOT NULL', o.qty, o.listing_id);
    }
    setStatus(o, 'cancelled', req.user.id, { cancel_reason: v.reason }, v.reason);
  });
  res.json(orderView(loadOrder(req), req, true));
});

// ---------- Sharhlar ----------
function refreshRating(sellerId) {
  const c = db.get('SELECT id FROM companies WHERE owner_id = ?', sellerId);
  if (!c) return;
  const s = db.get('SELECT AVG(rating) AS avg, COUNT(*) AS n FROM reviews WHERE seller_id = ?', sellerId);
  db.run('UPDATE companies SET rating_avg = ?, rating_count = ? WHERE id = ?', s.avg || 0, s.n, c.id);
}

r.post('/orders/:id/review', requireAuth, (req, res) => {
  const v = validate(req.body, { rating: { type: 'int', min: 1, max: 5, required: true }, text: { type: 'string', max: 2000 } });
  const o = loadOrder(req);
  if (o.buyer_id !== req.user.id || o.status !== 'completed') fail(409, 'err.review_not_allowed');
  if (db.get('SELECT 1 FROM reviews WHERE order_id = ?', o.id)) fail(409, 'err.duplicate');
  const company = db.get('SELECT id FROM companies WHERE owner_id = ?', o.seller_id);
  const id = db.insert('reviews', { seller_id: o.seller_id, company_id: company?.id, author_id: req.user.id, order_id: o.id, rating: v.rating, text: v.text });
  refreshRating(o.seller_id);
  notify(o.seller_id, 'review', { rating: v.rating, name: req.user.name || '—', review_id: id }, '/seller/reviews');
  res.status(201).json({ id, rating: v.rating, text: v.text });
});

module.exports = { router: r, refreshRating };
