// Brauzer push-bildirishnomalari (Web Push, VAPID).
// Kalitlar .env da berilmasa birinchi ishga tushishda yaratiladi va bazada saqlanadi.
const webpush = require('web-push');
const db = require('../db');
const config = require('../config');
const settings = require('./settings');

let keys = null;

function init() {
  if (keys) return keys;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else {
    keys = settings.getRaw('vapid');
    if (!keys) {
      keys = webpush.generateVAPIDKeys();
      settings.setRaw('vapid', keys);
    }
  }
  const subject = process.env.VAPID_SUBJECT || (config.siteUrl.startsWith('https') ? config.siteUrl : 'mailto:admin@hemu.uz');
  webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
  return keys;
}

const publicKey = () => init().publicKey;

function subscribe(userId, sub, userAgent) {
  const endpoint = String(sub?.endpoint || '');
  const p256dh = String(sub?.keys?.p256dh || '');
  const auth = String(sub?.keys?.auth || '');
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth) return false;
  db.run(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    userId, endpoint, p256dh, auth, String(userAgent || '').slice(0, 200),
  );
  return true;
}

function unsubscribe(userId, endpoint) {
  db.run('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?', userId, String(endpoint || ''));
}

// Foydalanuvchining barcha qurilmalariga yuborish. Yuborilganlar sonini qaytaradi.
async function sendToUser(userId, { title, body, link }) {
  const subs = db.all('SELECT * FROM push_subscriptions WHERE user_id = ?', userId);
  if (!subs.length || process.env.NODE_ENV === 'test') return 0;
  init();
  const payload = JSON.stringify({ title: String(title || 'HEMU.UZ').slice(0, 120), body: String(body || '').slice(0, 400), link: link || '/' });
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 });
      sent++;
    } catch (e) {
      // Obuna eskirgan — o'chiramiz
      if (e.statusCode === 404 || e.statusCode === 410) db.run('DELETE FROM push_subscriptions WHERE id = ?', s.id);
    }
  }));
  return sent;
}

module.exports = { init, publicKey, subscribe, unsubscribe, sendToUser };
