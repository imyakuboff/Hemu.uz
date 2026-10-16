const { Router } = require('express');
const db = require('../db');
const config = require('../config');
const L = require('../lib/listings');
const money = require('../lib/money');
const upload = require('../lib/upload');
const { notify, push, subscribe, render } = require('../lib/notify');
const { requireAuth, rateLimit } = require('../lib/auth');
const { fail, notFound, forbidden, validate } = require('../lib/http');
const { normalizeSearch: norm } = require('../i18n');

const r = Router();

function ensureConversation(listing, buyerId) {
  db.run('INSERT OR IGNORE INTO conversations (listing_id, buyer_id, seller_id) VALUES (?, ?, ?)', listing.id, buyerId, listing.user_id);
  return db.get('SELECT * FROM conversations WHERE listing_id = ? AND buyer_id = ? AND seller_id = ?', listing.id, buyerId, listing.user_id);
}

function messageView(m) {
  // Ilovalar ochiq /uploads orqali emas, ruxsat tekshiriladigan /files orqali beriladi
  const attachment = m.attachment ? `${config.publicUrl}/api/v1/files/${m.attachment}` : null;
  return { id: m.id, conversation_id: m.conversation_id, sender_id: m.sender_id, body: m.body, attachment, attachment_name: m.attachment_name, attachment_size: m.attachment_size, read: Boolean(m.read_at), created_at: m.created_at };
}

function postMessage(conv, sender, body, attachment, { silent = false, file = null } = {}) {
  const id = db.insert('messages', { conversation_id: conv.id, sender_id: sender.id, body, attachment, attachment_name: file?.originalname?.slice(0, 120), attachment_size: file?.size });
  db.run(`UPDATE conversations SET last_message_at = datetime('now') WHERE id = ?`, conv.id);
  const msg = messageView(db.get('SELECT * FROM messages WHERE id = ?', id));
  const to = sender.id === conv.buyer_id ? conv.seller_id : conv.buyer_id;
  push(to, 'message', msg);
  push(sender.id, 'message', msg);
  if (!silent) {
    const title = conv.listing_id ? db.get('SELECT title FROM listings WHERE id = ?', conv.listing_id)?.title : (conv.context || '');
    notify(to, 'message', { name: sender.name || sender.phone, title, conversation_id: conv.id }, `/messages/${conv.id}`);
  }
  // Sotuvchining avtojavobi: dialogdagi birinchi xaridor xabariga bir marta
  if (sender.id === conv.buyer_id) {
    const c = db.get('SELECT auto_replied FROM conversations WHERE id = ?', conv.id);
    const seller = db.get('SELECT id, name, phone, auto_reply, auto_reply_on FROM users WHERE id = ?', conv.seller_id);
    if (!c.auto_replied && seller.auto_reply_on && seller.auto_reply) {
      db.run('UPDATE conversations SET auto_replied = 1 WHERE id = ?', conv.id);
      postMessage(conv, seller, seller.auto_reply, null);
    }
  }
  return msg;
}

function loadConv(req) {
  const c = db.get('SELECT * FROM conversations WHERE id = ?', Number(req.params.id));
  if (!c) notFound();
  if (c.buyer_id !== req.user.id && c.seller_id !== req.user.id) forbidden();
  return c;
}

function partyView(userId) {
  const u = db.get('SELECT id, name, avatar, last_seen_at FROM users WHERE id = ?', userId);
  const c = db.get('SELECT id, name, verification FROM companies WHERE owner_id = ?', userId);
  return {
    user_id: userId,
    name: u?.name,
    company: c ? { id: c.id, name: c.name, verified: c.verification === 'verified' } : null,
    avatar: L.fileUrl(u?.avatar),
    last_seen_at: u?.last_seen_at,
  };
}

function convView(c, req) {
  const me = req.user.id;
  const other = c.buyer_id === me ? c.seller_id : c.buyer_id;
  const l = c.listing_id ? db.get('SELECT * FROM listings WHERE id = ?', c.listing_id) : null;
  const last = db.get('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1', c.id);
  const unread = db.get('SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL', c.id, me).n;
  const cover = l ? db.get('SELECT path FROM listing_photos WHERE listing_id = ? ORDER BY sort, id LIMIT 1', l.id)?.path : null;
  return {
    id: c.id,
    role: c.buyer_id === me ? 'buyer' : 'seller',
    with: partyView(other),
    listing: l ? { id: l.id, title: l.title, price: money.priceView(l, req.lang, req.currency), cover: L.fileUrl(cover), status: l.status } : null,
    context: c.context || null,
    last_message: last ? messageView(last) : null,
    unread,
    last_message_at: c.last_message_at,
  };
}

r.get('/conversations', requireAuth, (req, res) => {
  const me = req.user.id;
  let rows = db.all('SELECT * FROM conversations WHERE buyer_id = ? OR seller_id = ? ORDER BY last_message_at DESC LIMIT 200', me, me);
  let items = rows.map((c) => convView(c, req));
  if (req.query.q) {
    const q = norm(req.query.q);
    items = items.filter((c) => norm(`${c.with.name || ''} ${c.with.company?.name || ''} ${c.listing?.title || ''} ${c.last_message?.body || ''}`).includes(q));
  }
  if (req.query.unread === '1') items = items.filter((c) => c.unread > 0);
  res.json({ items, unread_total: items.reduce((s, c) => s + c.unread, 0), unread_conversations: items.filter((c) => c.unread).length });
});

// E'lonsiz suhbat: mutaxassis, vakansiya, logistika muallifi bilan
r.post('/conversations/direct', requireAuth, rateLimit({ name: 'conv', windowMs: 3600000, max: 60, key: (req) => req.user.id }), (req, res) => {
  const v = validate(req.body, { user_id: { type: 'int', required: true }, body: { type: 'string', min: 1, max: 4000, required: true }, context: { type: 'string', max: 160 } });
  if (v.user_id === req.user.id) fail(409, 'err.own_listing');
  if (!db.get('SELECT 1 FROM users WHERE id = ? AND blocked = 0', v.user_id)) notFound();
  let conv = db.get('SELECT * FROM conversations WHERE listing_id IS NULL AND buyer_id = ? AND seller_id = ? AND COALESCE(context, \'\') = ?', req.user.id, v.user_id, v.context || '');
  if (!conv) {
    const id = db.insert('conversations', { buyer_id: req.user.id, seller_id: v.user_id, context: v.context });
    conv = db.get('SELECT * FROM conversations WHERE id = ?', id);
  }
  postMessage(conv, req.user, v.body, null);
  res.status(201).json(convView(db.get('SELECT * FROM conversations WHERE id = ?', conv.id), req));
});

// "Написать продавцу"
r.post('/conversations', requireAuth, rateLimit({ name: 'conv', windowMs: 3600000, max: 60, key: (req) => req.user.id }), (req, res) => {
  const v = validate(req.body, { listing_id: { type: 'int', required: true }, body: { type: 'string', min: 1, max: 4000, required: true } });
  const l = db.get('SELECT * FROM listings WHERE id = ?', v.listing_id);
  if (!l || l.status !== 'active') notFound();
  if (l.user_id === req.user.id) fail(409, 'err.own_listing');
  if (!l.accept_messages) forbidden();
  const conv = ensureConversation(l, req.user.id);
  postMessage(conv, req.user, v.body, null);
  res.status(201).json(convView(db.get('SELECT * FROM conversations WHERE id = ?', conv.id), req));
});

r.get('/conversations/:id', requireAuth, (req, res) => {
  res.json(convView(loadConv(req), req));
});

r.get('/conversations/:id/messages', requireAuth, (req, res) => {
  const c = loadConv(req);
  const limit = Math.min(100, Number(req.query.limit) || 50);
  const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
  const rows = db.all('SELECT * FROM messages WHERE conversation_id = ? AND id < ? ORDER BY id DESC LIMIT ?', c.id, before, limit);
  res.json({ items: rows.reverse().map(messageView), has_more: rows.length === limit });
});

r.post('/conversations/:id/messages', requireAuth, rateLimit({ name: 'msg', windowMs: 60000, max: 30, key: (req) => req.user.id }), (req, res, next) => {
  loadConv(req);
  next();
}, upload.docs.single('file'), (req, res) => {
  const c = loadConv(req);
  let attachment = null;
  if (req.file) {
    upload.verifyFiles([req.file]);
    attachment = `docs/${req.file.filename}`;
  }
  const body = typeof req.body?.body === 'string' ? req.body.body.trim().slice(0, 4000) : '';
  if (!body && !attachment) fail(422, 'err.validation', { body: 'required' });
  res.status(201).json(postMessage(c, req.user, body || null, attachment, { file: req.file }));
});

r.post('/conversations/:id/read', requireAuth, (req, res) => {
  const c = loadConv(req);
  const n = db.run(`UPDATE messages SET read_at = datetime('now') WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL`, c.id, req.user.id).changes;
  const other = c.buyer_id === req.user.id ? c.seller_id : c.buyer_id;
  if (n) push(other, 'read', { conversation_id: c.id });
  res.json({ marked: Number(n) });
});

// ---------- Bildirishnomalar ----------
r.get('/notifications', requireAuth, (req, res) => {
  const limit = Math.min(100, Number(req.query.limit) || 30);
  const rows = db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?', req.user.id, limit);
  const unread = db.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', req.user.id).n;
  res.json({ items: rows.map((x) => render(x, req.lang)), unread });
});

r.post('/notifications/read', requireAuth, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : null;
  if (ids && ids.length) {
    db.run(`UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`, req.user.id, ...ids);
  } else {
    db.run(`UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL`, req.user.id);
  }
  res.json({ ok: true });
});

// Sarlavhadagi belgilar uchun
r.get('/badges', requireAuth, (req, res) => {
  const me = req.user.id;
  res.json({
    messages: db.get(
      `SELECT COUNT(*) AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id
       WHERE (c.buyer_id = ? OR c.seller_id = ?) AND m.sender_id != ? AND m.read_at IS NULL`,
      me, me, me,
    ).n,
    notifications: db.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', me).n,
    favorites: db.get('SELECT COUNT(*) AS n FROM favorites WHERE user_id = ?', me).n,
    new_leads: db.get(`SELECT COUNT(*) AS n FROM leads WHERE seller_id = ? AND status = 'new'`, me).n,
    new_orders: db.get(`SELECT COUNT(*) AS n FROM orders WHERE seller_id = ? AND status = 'new'`, me).n,
  });
});

// Real vaqt: Server-Sent Events. Klient: new EventSource('/api/v1/stream?token=...')
r.get('/stream', requireAuth, (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write(`event: hello\ndata: ${JSON.stringify({ user_id: req.user.id })}\n\n`);
  const off = subscribe(req.user.id, res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    off();
    db.run(`UPDATE users SET last_seen_at = datetime('now') WHERE id = ?`, req.user.id);
  });
});

module.exports = { router: r, ensureConversation, postMessage };
