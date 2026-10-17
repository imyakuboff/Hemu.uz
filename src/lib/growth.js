// O'sish mexanizmlari: e'lonni ulashish evaziga bepul TOP.
//
// Qoidasi: sotuvchi (yoki istalgan odam) e'lon havolasini ulashadi. Havola orqali kirgan har bir
// NOYOB tashrifchi e'lonning ulashish hisobiga qo'shiladi. Har SHARE_STEP ta tashrifchi uchun
// e'lon SHARE_HOURS soatga TOPga chiqadi (yig'ilib boradi, lekin SHARE_MAX_DAYS kundan oshmaydi).
// Saralashda ulashish TOPidagi e'lonlar ko'proq ulashilgani yuqorida turadi.
const crypto = require('node:crypto');
const db = require('../db');

const SHARE_STEP = 5;
const SHARE_HOURS = 24;
const SHARE_MAX_DAYS = 7;
const CHANNELS = ['telegram', 'whatsapp', 'facebook', 'vk', 'viber', 'email', 'copy', 'native', 'qr', 'link'];

// Havolalarni oldindan ko'rsatuvchi botlar (Telegram, WhatsApp ...) tashrif hisoblanmaydi
const BOT = /bot|crawler|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord|vkshare|curl|wget|python|headless/i;

const visitorOf = (req) => (req.user
  ? `u${req.user.id}`
  : `a${crypto.createHash('sha1').update(`${req.ip}|${req.get('user-agent') || ''}`).digest('hex').slice(0, 16)}`);

// Ulashish orqali kelgan tashrifni yozish. Natija: { counted, share_count, earned_hours }
function recordShareVisit(req, l, channelRaw) {
  if (!l || l.status !== 'active') return { counted: false };
  if (req.user && req.user.id === l.user_id) return { counted: false }; // egasi o'zi kirsa — hisoblanmaydi
  if (BOT.test(req.get('user-agent') || '')) return { counted: false };
  const channel = CHANNELS.includes(String(channelRaw)) ? String(channelRaw) : 'link';
  const ins = db.run('INSERT OR IGNORE INTO listing_share_visits (listing_id, visitor, channel) VALUES (?, ?, ?)', l.id, visitorOf(req), channel);
  if (!ins.changes) return { counted: false };
  db.run('UPDATE listings SET share_count = share_count + 1 WHERE id = ?', l.id);
  const n = db.get('SELECT share_count FROM listings WHERE id = ?', l.id).share_count;
  let earned = 0;
  if (n % SHARE_STEP === 0) {
    // Muddat hozirdan yoki amaldagi muddatdan uzaytiriladi, eng ko'pi SHARE_MAX_DAYS kun oldinga
    db.run(
      `UPDATE listings SET share_until = MIN(
         datetime(MAX(COALESCE(share_until, ''), datetime('now')), '+${SHARE_HOURS} hours'),
         datetime('now', '+${SHARE_MAX_DAYS} days')) WHERE id = ?`,
      l.id,
    );
    earned = SHARE_HOURS;
    require('./notify').notify(l.user_id, 'share_top', { title: l.title, listing_id: l.id, n, hours: SHARE_HOURS }, `/listing/${l.id}`);
  }
  return { counted: true, share_count: n, earned_hours: earned };
}

// E'lon egasi uchun holat: nechta tashrif, keyingi TOPgacha nechta qoldi, TOP qachongacha
function shareStatus(l) {
  const row = db.get(`SELECT share_count, share_until, (COALESCE(share_until, '') > datetime('now')) AS active FROM listings WHERE id = ?`, l.id);
  const n = row?.share_count || 0;
  return {
    count: n,
    step: SHARE_STEP,
    hours: SHARE_HOURS,
    to_next: SHARE_STEP - (n % SHARE_STEP),
    top_until: row?.active ? row.share_until : null,
    week: db.get(`SELECT COUNT(*) AS n FROM listing_share_visits WHERE listing_id = ? AND created_at > datetime('now', '-7 days')`, l.id).n,
  };
}

module.exports = { SHARE_STEP, SHARE_HOURS, SHARE_MAX_DAYS, recordShareVisit, shareStatus };
