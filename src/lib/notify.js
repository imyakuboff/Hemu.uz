const db = require('../db');
const { t } = require('../i18n');
const { parseJson } = require('./http');
const { formatAmount } = require('./money');

// SSE ulanishlari: userId -> Set<res>
const streams = new Map();

function subscribe(userId, res) {
  if (!streams.has(userId)) streams.set(userId, new Set());
  streams.get(userId).add(res);
  return () => {
    const set = streams.get(userId);
    if (!set) return;
    set.delete(res);
    if (!set.size) streams.delete(userId);
  };
}

function push(userId, event, data) {
  const set = streams.get(userId);
  if (!set) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) res.write(payload);
}

// Qaysi bildirishnoma qaysi sozlamaga bog'liq
const PREF = {
  message: 'notify_messages',
  lead: 'notify_messages',
  offer: 'notify_messages',
  order_new: 'notify_orders',
  order_status: 'notify_orders',
  price_changed: 'notify_prices',
  saved_search: 'notify_prices',
  booking_new: 'notify_orders',
  booking_status: 'notify_orders',
  escrow: 'notify_orders',
  payment_paid: 'notify_orders',
  inspection_status: 'notify_orders',
};

function notify(userId, type, params = {}, link = null) {
  const u = db.get('SELECT id, notify_messages, notify_orders, notify_prices, notify_news FROM users WHERE id = ?', userId);
  if (!u) return;
  const id = db.insert('notifications', { user_id: userId, type, params, link });
  // Sozlama o'chirilgan bo'lsa ham tarixga yoziladi, lekin push yuborilmaydi
  if (PREF[type] && !u[PREF[type]]) return;
  push(userId, 'notification', { id, type, params, link });
  const lang = db.get('SELECT lang FROM users WHERE id = ?', userId)?.lang || 'ru';
  const text = render(db.get('SELECT * FROM notifications WHERE id = ?', id), lang).text;
  require('./telegram').sendToUser(userId, text, link);
  // Brauzer push (yopiq sahifada ham keladi)
  require('./webpush').sendToUser(userId, { title: type === 'broadcast' ? params.title : 'HEMU.UZ', body: type === 'broadcast' ? params.body : text, link }).catch(() => {});
}

function render(row, lang) {
  const params = parseJson(row.params, {});
  // Holat kodlari foydalanuvchi tilida
  if (params.status_key) params.status = t(lang, params.status_key);
  if (params.price_amount !== undefined) params.price = params.amount = formatAmount(params.price_amount, params.price_currency, lang);
  if (params.purpose_key) params.purpose = t(lang, params.purpose_key);
  if (params.category_slug) {
    const c = require('./categories').bySlug(params.category_slug);
    if (c) params.category = require('../i18n').pick(c.names, lang);
  }
  return {
    id: row.id,
    type: row.type,
    text: t(lang, `n.${row.type}`, params),
    params,
    link: row.link,
    read: Boolean(row.read_at),
    created_at: row.created_at,
  };
}

module.exports = { subscribe, push, notify, render };
