// Sotuvchi CRM: kim qo'ng'iroq qilmoqchi bo'ldi (telefonni ochdi), kim yozdi, kim ariza qoldirdi —
// har bir xaridor bitta kartada, bosqich, izoh va eslatma bilan. "Do'kon" tarifi kerak.
const { Router } = require('express');
const db = require('../db');
const STORE = require('../lib/store');
const { requireAuth } = require('../lib/auth');
const { fail, notFound, validate } = require('../lib/http');

const r = Router();
const STAGES = ['new', 'talking', 'agreed', 'won', 'lost'];

const myCompany = (userId) => db.get('SELECT * FROM companies WHERE owner_id = ?', userId);
const hasAccess = (user) => user.role === 'admin' || STORE.isActive(myCompany(user.id));

// Barcha murojaatlarni xaridor bo'yicha yig'ish
function collect(sellerId, days) {
  const since = `-${days} days`;
  const map = new Map();
  const get = (buyerId) => {
    if (!map.has(buyerId)) map.set(buyerId, { buyer_id: buyerId, calls: 0, messages: 0, leads: 0, last_at: '', listings: new Map(), conversation_id: null, last_text: null });
    return map.get(buyerId);
  };
  const touch = (c, at, listingId, title) => {
    if (at > c.last_at) c.last_at = at;
    if (listingId && !c.listings.has(listingId)) c.listings.set(listingId, title);
  };
  for (const x of db.all(
    `SELECT p.buyer_id, p.listing_id, p.created_at, l.title FROM phone_reveal_log p JOIN listings l ON l.id = p.listing_id
     WHERE p.seller_id = ? AND p.created_at >= datetime('now', ?)`, sellerId, since,
  )) { const c = get(x.buyer_id); c.calls += 1; touch(c, x.created_at, x.listing_id, x.title); }
  for (const x of db.all(
    `SELECT c.id, c.buyer_id, c.listing_id, c.last_message_at, l.title,
       (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id = c.buyer_id) AS n,
       (SELECT body FROM messages m WHERE m.conversation_id = c.id AND m.sender_id = c.buyer_id ORDER BY m.id DESC LIMIT 1) AS last_body
     FROM conversations c LEFT JOIN listings l ON l.id = c.listing_id
     WHERE c.seller_id = ? AND c.last_message_at >= datetime('now', ?)`, sellerId, since,
  )) {
    if (!x.n) continue; // xaridor hali yozmagan suhbat — murojaat emas
    const c = get(x.buyer_id);
    c.messages += x.n;
    if (!c.conversation_id || x.last_message_at >= c.last_at) { c.conversation_id = x.id; if (x.last_body) c.last_text = x.last_body; }
    touch(c, x.last_message_at, x.listing_id, x.title);
  }
  for (const x of db.all(
    `SELECT x.buyer_id, x.listing_id, x.created_at, x.message, l.title FROM leads x JOIN listings l ON l.id = x.listing_id
     WHERE x.seller_id = ? AND x.created_at >= datetime('now', ?)`, sellerId, since,
  )) { const c = get(x.buyer_id); c.leads += 1; if (x.message && !c.last_text) c.last_text = x.message; touch(c, x.created_at, x.listing_id, x.title); }
  map.delete(sellerId);
  return [...map.values()];
}

function view(c, sellerId) {
  const u = db.get('SELECT name, avatar FROM users WHERE id = ?', c.buyer_id) || {};
  const co = db.get('SELECT name FROM companies WHERE owner_id = ?', c.buyer_id);
  const crm = db.get('SELECT stage, note, remind_on FROM crm_contacts WHERE seller_id = ? AND buyer_id = ?', sellerId, c.buyer_id);
  return {
    buyer_id: c.buyer_id,
    name: u.name || null,
    company: co?.name || null,
    calls: c.calls, messages: c.messages, leads: c.leads,
    last_at: c.last_at,
    last_text: c.last_text ? String(c.last_text).slice(0, 160) : null,
    listings: [...c.listings].slice(0, 3).map(([id, title]) => ({ id, title })),
    conversation_id: c.conversation_id,
    stage: crm?.stage || 'new',
    note: crm?.note || '',
    remind_on: crm?.remind_on || null,
  };
}

r.get('/crm', requireAuth, (req, res) => {
  const days = [7, 30, 90, 365].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const raw = collect(req.user.id, days);
  const summary = {
    contacts: raw.length,
    calls: raw.reduce((s, c) => s + c.calls, 0),
    messages: raw.filter((c) => c.messages).length,
    leads: raw.reduce((s, c) => s + c.leads, 0),
  };
  if (!hasAccess(req.user)) {
    return res.json({ locked: true, has_company: Boolean(myCompany(req.user.id)), days, summary });
  }
  const items = raw.map((c) => view(c, req.user.id)).sort((a, b) => (a.last_at < b.last_at ? 1 : -1));
  const today = new Date().toISOString().slice(0, 10);
  const stages = Object.fromEntries(STAGES.map((s) => [s, items.filter((x) => x.stage === s).length]));
  const won = stages.won;
  res.json({
    locked: false, days,
    summary: { ...summary, won, conversion: items.length ? Math.round((won / items.length) * 1000) / 10 : 0 },
    stages,
    reminders: items.filter((x) => x.remind_on && x.remind_on <= today && !['won', 'lost'].includes(x.stage)).length,
    items,
  });
});

r.patch('/crm/contacts/:buyerId', requireAuth, (req, res) => {
  if (!hasAccess(req.user)) fail(402, 'err.store_inactive');
  const buyerId = Number(req.params.buyerId);
  // Faqat haqiqatan murojaat qilgan xaridor (1 yil ichida)
  if (!collect(req.user.id, 365).some((c) => c.buyer_id === buyerId)) notFound();
  const v = validate(req.body, {
    stage: { type: 'enum', values: STAGES },
    note: { type: 'string', max: 1000 },
    remind_on: { type: 'string', max: 10, pattern: /^(\d{4}-\d{2}-\d{2})?$/ },
  });
  const cur = db.get('SELECT * FROM crm_contacts WHERE seller_id = ? AND buyer_id = ?', req.user.id, buyerId);
  const next = {
    stage: v.stage ?? cur?.stage ?? 'new',
    note: v.note !== undefined ? v.note || null : cur?.note ?? null,
    remind_on: v.remind_on !== undefined ? v.remind_on || null : cur?.remind_on ?? null,
  };
  db.run(
    `INSERT INTO crm_contacts (seller_id, buyer_id, stage, note, remind_on, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT (seller_id, buyer_id) DO UPDATE SET stage = excluded.stage, note = excluded.note, remind_on = excluded.remind_on, updated_at = excluded.updated_at`,
    req.user.id, buyerId, next.stage, next.note, next.remind_on,
  );
  res.json({ buyer_id: buyerId, ...next });
});

// Telefon ochgan, lekin yozmagan mijozga sotuvchi o'zi yozishi uchun suhbat
r.post('/crm/contacts/:buyerId/chat', requireAuth, (req, res) => {
  if (!hasAccess(req.user)) fail(402, 'err.store_inactive');
  const buyerId = Number(req.params.buyerId);
  const c = collect(req.user.id, 365).find((x) => x.buyer_id === buyerId);
  if (!c) notFound();
  if (c.conversation_id) return res.json({ id: c.conversation_id });
  const listingId = [...c.listings.keys()][0] || null;
  let conv = db.get('SELECT id FROM conversations WHERE listing_id IS ? AND buyer_id = ? AND seller_id = ?', listingId, buyerId, req.user.id);
  if (!conv) conv = { id: db.insert('conversations', { listing_id: listingId, buyer_id: buyerId, seller_id: req.user.id }) };
  res.json({ id: conv.id });
});

module.exports = { router: r, STAGES };
