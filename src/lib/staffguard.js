// Admin va moderator hisoblarini himoyalash:
// - noto'g'ri parollar hisobga olinadi (IP dan qat'i nazar) — 10 ta / soat bo'lsa hisob 1 soatga yopiladi
// - kirish, bloklanish va parol tiklash haqida adminga xabar (Telegram ulangan bo'lsa — Telegram, aks holda SMS)
const db = require('../db');
const config = require('../config');

const isStaff = (u) => u?.role === 'admin' || u?.role === 'moderator';
const WINDOW = 3600e3;
const MAX_FAILS = 10;
const WARN_AT = 5;

// Jadval: staff_login_failures (db.js sxemasida)

const recent = (userId) => db.get('SELECT COUNT(*) AS n, MAX(at) AS last FROM staff_login_failures WHERE user_id = ? AND at > ?', userId, Date.now() - WINDOW);

// Hisob yopiq bo'lsa — qolgan soniyalar, aks holda 0
function lockedFor(user) {
  if (!isStaff(user)) return 0;
  const r = recent(user.id);
  if (r.n < MAX_FAILS) return 0;
  return Math.max(0, Math.ceil((r.last + WINDOW - Date.now()) / 1000));
}

function recordFailure(user, req) {
  if (!isStaff(user)) return;
  db.run('INSERT INTO staff_login_failures (user_id, ip, at) VALUES (?, ?, ?)', user.id, String(req.ip || ''), Date.now());
  db.run('DELETE FROM staff_login_failures WHERE at < ?', Date.now() - 7 * 86400e3);
  const { n } = recent(user.id);
  if (n === WARN_AT) alert(`fail5:${user.id}`, `HEMU.UZ: ${who(user)} hisobiga 1 soatda ${n} marta noto'g'ri parol kiritildi. IP: ${req.ip}`);
  if (n === MAX_FAILS) alert(`lock:${user.id}`, `HEMU.UZ: ${who(user)} hisobi 1 soatga yopildi — ${n} marta noto'g'ri parol. Oxirgi IP: ${req.ip}. Agar bu siz bo'lmasangiz, parolni almashtiring.`);
}

function clearFailures(user) {
  if (isStaff(user)) db.run('DELETE FROM staff_login_failures WHERE user_id = ?', user.id);
}

const who = (u) => (u.username ? `«${u.username}»` : `#${u.id}`) + (u.role === 'moderator' ? ' (moderator)' : ' (admin)');

// Muvaffaqiyatli kirish: shu IP dan oxirgi 30 kunda kirilmagan bo'lsa xabar beriladi
function loginSucceeded(user, req, how = 'parol') {
  if (!isStaff(user)) return;
  clearFailures(user);
  const known = db.get(`SELECT 1 FROM sessions WHERE user_id = ? AND ip = ? AND created_at > datetime('now', '-30 days')`, user.id, String(req.ip || ''));
  if (!known) alert(`login:${user.id}:${req.ip}`, `HEMU.UZ: ${who(user)} hisobiga yangi IP dan kirildi (${how}). IP: ${req.ip}. Qurilma: ${String(req.get?.('user-agent') || '').slice(0, 60)}. Agar bu siz bo'lmasangiz, darhol parolni almashtiring.`);
}

// Xabar: bir xil hodisa 30 daqiqada bir martadan ko'p yuborilmaydi
const sent = new Map();
const outbox = [];
function alert(key, text) {
  const now = Date.now();
  if (sent.get(key) > now - 30 * 60e3) return;
  sent.set(key, now);
  outbox.push({ at: new Date().toISOString(), text });
  if (outbox.length > 50) outbox.shift();
  deliver(text).catch((e) => console.error('[staffguard] xabar yuborilmadi:', e.message));
}

async function deliver(text) {
  const admins = db.all(`SELECT u.id, u.phone, tl.chat_id FROM users u LEFT JOIN telegram_links tl ON tl.user_id = u.id WHERE u.role = 'admin' AND u.blocked = 0`);
  // Saytdagi bildirishnoma + brauzer push + (ulangan bo'lsa) Telegram — notify() orqali
  for (const a of admins) {
    try { require('./notify').notify(a.id, 'security', { text }, '/admin/log'); } catch (e) { console.error('[staffguard]', e.message); }
  }
  if (process.env.NODE_ENV === 'test') return;
  // Telegram ulanmagan adminlarga — SMS (hodisalar kam va 30 daqiqada bir martadan ko'p emas)
  const { sendSms } = require('./sms');
  for (const a of admins) if (a.phone && !(config.telegramToken && a.chat_id)) await sendSms(a.phone, text.slice(0, 300));
}

module.exports = { isStaff, lockedFor, recordFailure, clearFailures, loginSucceeded, alert, outbox, MAX_FAILS };
