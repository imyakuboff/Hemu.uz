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
  request_repair: 'notify_orders',
  job_new: 'notify_orders',
};

// Push sarlavhasi: yangi e'lon turidagi xabarlar telefonda darhol ajralib tursin
const NEW_LISTING = { uz: "🚜 Yangi e'lon", ru: '🚜 Новое объявление', en: '🚜 New listing' };
const PUSH_TITLE = {
  interest: NEW_LISTING, saved_search: NEW_LISTING, company_new_listing: NEW_LISTING,
  request_repair: { uz: '🔧 Yangi buyurtma', ru: '🔧 Новый заказ', en: '🔧 New job' },
  request_match: { uz: '📋 Yangi so\'rov', ru: '📋 Новая заявка', en: '📋 New request' },
  urgent_call: { uz: '⚡ Shoshilinch', ru: '⚡ Срочно', en: '⚡ Urgent' },
  message: { uz: '💬 Yangi xabar', ru: '💬 Новое сообщение', en: '💬 New message' },
};
// Rasm (e'lon muqovasi), guruhlash tegi va ikonkadagi son
function pushExtras(userId, type, params) {
  const out = { tag: `${type}-${params.listing_id || params.request_id || params.conversation_id || params.call_id || ''}` };
  if (params.listing_id) {
    const ph = db.get('SELECT path FROM listing_photos WHERE listing_id = ? ORDER BY sort, id LIMIT 1', params.listing_id);
    const url = ph && require('./listings').fileUrl(ph.path);
    if (url) out.image = /^https?:/.test(url) ? url : `${require('../config').siteUrl}${url}`;
  }
  out.count = db.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', userId).n;
  return out;
}

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
  require('./webpush').sendToUser(userId, { ...pushExtras(userId, type, params), title: type === 'broadcast' ? params.title : (PUSH_TITLE[type] && (PUSH_TITLE[type][lang] || PUSH_TITLE[type].ru)) || 'HEMU.UZ', body: type === 'broadcast' ? params.body : text, link }).catch(() => {});
}

function render(row, lang) {
  const params = parseJson(row.params, {});
  // Holat kodlari foydalanuvchi tilida
  if (params.status_key) params.status = t(lang, params.status_key);
  if (params.price_amount !== undefined) params.price = params.amount = formatAmount(params.price_amount, params.price_currency, lang);
  if (params.purpose_key) params.purpose = t(lang, params.purpose_key);
  if (params.reason_key) params.reason = t(lang, params.reason_key);
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

module.exports = { subscribe, push, notify, render, pushExtras };
