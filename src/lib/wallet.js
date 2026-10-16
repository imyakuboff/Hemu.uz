// Foydalanuvchi hamyoni: balans USD da saqlanadi, istalgan valyutada to'ldiriladi va sarflanadi
const db = require('../db');
const money = require('./money');
const { fail } = require('./http');

const round = (n) => Math.round(n * 10000) / 10000;

function balance(userId) {
  return db.get('SELECT balance_usd FROM users WHERE id = ?', userId)?.balance_usd || 0;
}

// Balansni o'zgartirish (bitta tranzaksiya ichida). amountUsd > 0 — kirim, < 0 — chiqim
function change(userId, amountUsd, kind, { note = null, paymentId = null, adminId = null, amount = null, currency = null, allowNegative = false, silent = false } = {}) {
  const usd = round(amountUsd);
  if (!usd) fail(422, 'err.validation', { amount: 'zero' });
  return db.tx(() => {
    const cur = balance(userId);
    const next = round(cur + usd);
    if (next < 0 && !allowNegative) fail(402, 'err.insufficient_balance', { balance_usd: cur });
    db.run('UPDATE users SET balance_usd = ? WHERE id = ?', next, userId);
    const id = db.insert('wallet_tx', { user_id: userId, amount_usd: usd, balance_after: next, kind, note, payment_id: paymentId, admin_id: adminId, amount, currency });
    if (!silent) {
      // Bildirishnoma foydalanuvchi valyutasida
      const u = db.get('SELECT currency, country FROM users WHERE id = ?', userId);
      const ucur = u?.currency || 'USD';
      require('./notify').notify(userId, 'wallet', { sign: usd > 0 ? '+' : '−', price_amount: money.roundNice(money.fromUsd(Math.abs(usd), ucur), ucur), price_currency: ucur, note: note || '' }, '/payments');
    }
    return { id, balance_usd: next };
  });
}

// Ro'yxatdan o'tgan foydalanuvchiga avtomatik bonus (bir marta). Berilgan summani qaytaradi.
function welcomeBonus(userId) {
  const cfg = require('../config').welcomeBonus;
  if (!cfg?.enabled || !(cfg.amount > 0)) return null;
  if (db.get(`SELECT 1 FROM wallet_tx WHERE user_id = ? AND kind = 'welcome'`, userId)) return null;
  change(userId, money.toUsd(cfg.amount, cfg.currency), 'welcome', { amount: cfg.amount, currency: cfg.currency });
  return { amount: cfg.amount, currency: cfg.currency };
}

function view(userId, currency, lang) {
  const usd = balance(userId);
  const amount = money.fromUsd(usd, currency);
  return { balance_usd: usd, amount: Math.round(amount * 100) / 100, currency, formatted: money.formatAmount(Math.round(amount * 100) / 100, currency, lang) };
}

function history(userId, { limit = 50, offset = 0 } = {}) {
  return db.all('SELECT * FROM wallet_tx WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?', userId, limit, offset);
}

module.exports = { welcomeBonus, balance, change, view, history };
