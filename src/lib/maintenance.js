// Ishga tushishdagi bir martalik tuzatishlar va fon vazifalari (xavfsiz bitim, muddat eslatmalari)
const db = require('../db');
const config = require('../config');
const settings = require('./settings');
const { notify } = require('./notify');

// Seed (demo) akkauntlar — paroli ochiq repoda yozilgan
const SEED_ADMIN_PHONE = '+998900000001';
const SEED_PASSWORD = 'Hemu2026';

function bootMigrations() {
  // Eski bildirishnomalardagi mavjud bo'lmagan sahifa havolalari
  if (!settings.getRaw('_mig.notifLinks')) {
    db.run(`UPDATE notifications SET link = '/dashboard' WHERE link LIKE '/seller/%'`);
    db.run(`UPDATE notifications SET link = '/listing/' || substr(link, 11) WHERE link LIKE '/listings/%' AND substr(link, 11) GLOB '[0-9]*' AND instr(substr(link, 11), '/') = 0`);
    settings.setRaw('_mig.notifLinks', 1);
  }
  // Productionda: ochiq demo parolli akkauntlar paroli o'chiriladi va sessiyalari yopiladi
  // (oddiy foydalanuvchilar SMS-kod bilan kiraveradi; seed admin admin huquqidan mahrum qilinadi)
  if (config.isProd && !settings.getRaw('_mig.seedPasswords')) {
    const { checkPassword } = require('../routes/auth');
    let n = 0;
    for (const u of db.all('SELECT id, password_hash FROM users WHERE password_hash IS NOT NULL')) {
      if (!checkPassword(SEED_PASSWORD, u.password_hash)) continue;
      db.run('UPDATE users SET password_hash = NULL WHERE id = ?', u.id);
      db.run('DELETE FROM sessions WHERE user_id = ?', u.id);
      n += 1;
    }
    const seedAdmin = db.get(`SELECT id FROM users WHERE phone = ? AND role IN ('admin', 'moderator')`, SEED_ADMIN_PHONE);
    if (seedAdmin) {
      db.run(`UPDATE users SET role = 'user', blocked = 1 WHERE id = ?`, seedAdmin.id);
      db.run('DELETE FROM sessions WHERE user_id = ?', seedAdmin.id);
    }
    if (n || seedAdmin) console.log(`[security] demo parolli ${n} ta akkaunt yopildi${seedAdmin ? ', seed admin bloklandi' : ''}`);
    settings.setRaw('_mig.seedPasswords', 1);
  }
}

// ---------- Xavfsiz bitim: xaridor javob bermasa avtomatik yakunlash ----------
const ESCROW_AUTO_DAYS = 7; // "Yetkazildi" dan keyin
const ESCROW_SHIPPED_DAYS = 21; // "Jo'natildi" holatida qolib ketsa

function escrowAutoComplete() {
  const rows = db.all(
    `SELECT * FROM orders WHERE escrow = 1 AND escrow_status = 'held'
       AND ((status = 'delivered' AND updated_at < datetime('now', ?)) OR (status = 'shipped' AND updated_at < datetime('now', ?)))`,
    `-${ESCROW_AUTO_DAYS} days`, `-${ESCROW_SHIPPED_DAYS} days`,
  );
  for (const o of rows) {
    db.tx(() => {
      db.update('orders', o.id, { status: 'completed', escrow_status: 'released', updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19) });
      db.insert('order_events', { order_id: o.id, status: 'completed', actor_id: null, note: 'auto' });
    });
    notify(o.seller_id, 'escrow', { number: o.number, status_key: 'es.released', order_id: o.id }, `/orders/${o.id}`);
    notify(o.buyer_id, 'escrow', { number: o.number, status_key: 'es.auto_released', order_id: o.id }, `/orders/${o.id}`);
  }
  // Ogohlantirish: 2 kun qolganda xaridorga
  const warn = db.all(
    `SELECT * FROM orders WHERE escrow = 1 AND escrow_status = 'held' AND status = 'delivered'
       AND updated_at < datetime('now', ?) AND updated_at >= datetime('now', ?)`,
    `-${ESCROW_AUTO_DAYS - 2} days`, `-${ESCROW_AUTO_DAYS} days`,
  );
  for (const o of warn) {
    if (!remindOnce('escrow', o.id, o.updated_at)) continue;
    notify(o.buyer_id, 'escrow', { number: o.number, status_key: 'es.auto_soon', order_id: o.id }, `/orders/${o.id}`);
  }
  return rows.length;
}

// ---------- Muddat tugashi eslatmalari (3 kun va 1 kun qolganda) ----------
function remindOnce(kind, refId, until) {
  return db.run('INSERT OR IGNORE INTO reminders_sent (kind, ref_id, until) VALUES (?, ?, ?)', kind, refId, String(until)).changes > 0;
}

function expiryReminders() {
  const windows = [['+1 days', 'd1'], ['+3 days', 'd3']];
  let n = 0;
  for (const [win, tag] of windows) {
    for (const l of db.all(`SELECT id, user_id, title, expires_at FROM listings WHERE status = 'active' AND demo = 0 AND expires_at > datetime('now') AND expires_at <= datetime('now', ?)`, win)) {
      if (!remindOnce(`listing_${tag}`, l.id, l.expires_at)) continue;
      notify(l.user_id, 'expiring', { what_key: 'exp.listing', title: l.title, until: l.expires_at.slice(0, 10), listing_id: l.id }, '/my/listings');
      n += 1;
    }
    for (const l of db.all(`SELECT id, user_id, title, tier, tier_until FROM listings WHERE status = 'active' AND tier IS NOT NULL AND tier_until > datetime('now') AND tier_until <= datetime('now', ?)`, win)) {
      if (!remindOnce(`tier_${tag}`, l.id, l.tier_until)) continue;
      notify(l.user_id, 'expiring', { what_key: 'exp.tier', title: l.title, until: l.tier_until.slice(0, 10), listing_id: l.id }, `/listing/${l.id}`);
      n += 1;
    }
    for (const u of db.all(`SELECT id, badge_until FROM users WHERE badge_until > datetime('now') AND badge_until <= datetime('now', ?)`, win)) {
      if (!remindOnce(`badge_${tag}`, u.id, u.badge_until)) continue;
      notify(u.id, 'expiring', { what_key: 'exp.badge', title: '✔', until: u.badge_until.slice(0, 10) }, '/verified');
      n += 1;
    }
    for (const c of db.all(`SELECT id, owner_id, name, store_until FROM companies WHERE store_until > datetime('now') AND store_until <= datetime('now', ?)`, win)) {
      if (!remindOnce(`store_${tag}`, c.id, c.store_until)) continue;
      notify(c.owner_id, 'expiring', { what_key: 'exp.store', title: c.name, until: c.store_until.slice(0, 10) }, '/plans');
      n += 1;
    }
  }
  db.run(`DELETE FROM reminders_sent WHERE created_at < datetime('now', '-90 days')`);
  return n;
}

module.exports = { bootMigrations, escrowAutoComplete, expiryReminders, SEED_ADMIN_PHONE };
