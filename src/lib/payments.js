const crypto = require('node:crypto');
const db = require('../db');
const config = require('../config');
const money = require('./money');
const { notify } = require('./notify');
const { fail, parseJson } = require('./http');

// ---------- Provayderlar ----------
const clickReady = () => Boolean(config.click.serviceId && config.click.merchantId && config.click.secretKey);
const paymeReady = () => Boolean(config.payme.merchantId && config.payme.key);

const PROVIDER_IDS = ['click', 'payme', 'dev', 'balance'];
function providers(opts = {}) {
  const out = [];
  if (clickReady()) out.push({ id: 'click', name: 'Click', currencies: ['UZS'] });
  if (paymeReady()) out.push({ id: 'payme', name: 'Payme', currencies: ['UZS'] });
  if (config.paymentsDev) out.push({ id: 'dev', name: 'Test', currencies: ['*'] });
  // Ichki hamyon — har doim mavjud (to'ldirish uchun emas)
  if (!opts.topup) out.unshift({ id: 'balance', name: 'Balance', currencies: ['*'] });
  return out;
}

// Click va Payme faqat so'mda ishlaydi
function chargeCurrency(provider, userCurrency) {
  if (provider === 'click' || provider === 'payme') return 'UZS';
  return userCurrency || 'USD';
}

function priceIn(usd, currency) {
  return money.roundNice(money.fromUsd(usd, currency), currency);
}

// To'lov yaratish va to'lov sahifasi manzilini qaytarish
function create(user, { purpose, refId, meta, usd, amount, currency, provider }) {
  const list = providers().map((p) => p.id);
  if (!list.includes(provider)) fail(422, 'err.not_configured', { provider });
  const cur = chargeCurrency(provider, currency || user.currency);
  // Aniq summa (masalan buyurtma) yoki USD narx (xizmatlar)
  const sum = amount !== undefined
    ? (cur === currency ? amount : money.roundNice(money.convert(amount, currency, cur), cur))
    : priceIn(usd, cur);
  if (provider === 'balance') {
    if (purpose === 'topup') fail(422, 'err.validation', { provider: 'invalid' });
    // Hamyondan darhol yechiladi; mablag' yetmasa to'lov yaratilmaydi
    const id = db.tx(() => {
      const pid = db.insert('payments', { user_id: user.id, purpose, ref_id: refId, meta, amount: sum, currency: cur, provider });
      require('./wallet').change(user.id, -money.toUsd(sum, cur), 'spend', { paymentId: pid, note: `#${pid} · ${purpose}`, amount: sum, currency: cur, silent: true });
      return pid;
    });
    markPaid(id, `wallet-${id}`);
    return { id, amount: sum, currency: cur, provider, status: 'paid', pay_url: `${config.siteUrl}/payments/${id}` };
  }
  const id = db.insert('payments', { user_id: user.id, purpose, ref_id: refId, meta, amount: sum, currency: cur, provider });
  return { id, amount: sum, currency: cur, provider, pay_url: payUrl(id, provider, sum) };
}

function payUrl(id, provider, amount) {
  const back = `${config.siteUrl}/payments/${id}`;
  if (provider === 'click') {
    const q = new URLSearchParams({ service_id: config.click.serviceId, merchant_id: config.click.merchantId, amount: amount.toFixed(2), transaction_param: String(id), return_url: back });
    if (config.click.merchantUserId) q.set('merchant_user_id', config.click.merchantUserId);
    return `https://my.click.uz/services/pay?${q}`;
  }
  if (provider === 'payme') {
    const params = `m=${config.payme.merchantId};ac.payment_id=${id};a=${Math.round(amount * 100)};c=${back}`;
    const checkout = config.payme.testMode ? 'https://checkout.test.paycom.uz' : config.payme.checkoutUrl;
    return `${checkout}/${Buffer.from(params).toString('base64')}`;
  }
  return `${config.siteUrl}/payments/${id}`; // sinov: sahifada "To'lash" tugmasi
}

// ---------- To'lov muvaffaqiyatli: xizmatni yoqish ----------
function markPaid(paymentId, providerTx = null) {
  const p = db.get('SELECT * FROM payments WHERE id = ?', paymentId);
  if (!p || p.status === 'paid') return p;
  db.tx(() => {
    db.run(`UPDATE payments SET status = 'paid', paid_at = datetime('now'), provider_tx = COALESCE(?, provider_tx) WHERE id = ?`, providerTx, p.id);
    fulfill(p);
  });
  notify(p.user_id, 'payment_paid', { purpose_key: `pp.${p.purpose}`, price_amount: p.amount, price_currency: p.currency, payment_id: p.id }, `/payments/${p.id}`);
  return db.get('SELECT * FROM payments WHERE id = ?', p.id);
}

function fulfill(p) {
  const meta = parseJson(p.meta, {});
  if (p.purpose === 'promo') applyPromotion(p.ref_id, meta.package, p.id);
  if (p.purpose === 'plan') applyPlan(p.user_id, meta.plan, meta.months || 1);
  if (p.purpose === 'badge') applyBadge(p.user_id, meta.months || 1);
  if (p.purpose === 'topup') require('./wallet').change(p.user_id, money.toUsd(p.amount, p.currency), 'topup', { paymentId: p.id, note: `#${p.id}`, amount: p.amount, currency: p.currency });
  if (p.purpose === 'escrow') {
    const o = db.get('SELECT * FROM orders WHERE id = ?', p.ref_id);
    if (o) {
      db.run(`UPDATE orders SET escrow_status = 'held', payment_id = ? WHERE id = ?`, p.id, o.id);
      db.insert('order_events', { order_id: o.id, status: o.status, actor_id: p.user_id, note: 'escrow:held' });
      notify(o.seller_id, 'escrow', { number: o.number, status_key: 'es.held', order_id: o.id }, `/my/orders?tab=sales`);
    }
  }
  if (p.purpose === 'inspection') {
    const i = db.get('SELECT * FROM inspections WHERE id = ?', p.ref_id);
    if (i) {
      db.run(`UPDATE inspections SET status = 'paid', payment_id = ? WHERE id = ?`, p.id, i.id);
      for (const a of db.all(`SELECT id FROM users WHERE role = 'admin'`)) {
        notify(a.id, 'inspection_status', { title: db.get('SELECT title FROM listings WHERE id = ?', i.listing_id)?.title, status_key: 'is.paid' }, '/admin');
      }
    }
  }
}

// E'lon darajalari: bosh sahifada VIP — 1-karusel, GOLD — 2-karusel, PREMIUM — 3-karusel
const TIERS = ['vip', 'gold', 'premium'];

function applyTier(listingId, tier, days, paymentId = null) {
  const until = `+${days} days`;
  db.insert('promotions', { listing_id: listingId, package: tier, payment_id: paymentId, ends_at: db.get(`SELECT datetime('now', ?) AS d`, until).d });
  // Shu daraja amalda bo'lsa — muddat uzaytiriladi, aks holda yangidan boshlanadi
  db.run(
    `UPDATE listings SET tier_until = datetime(CASE WHEN tier = ? AND tier_until > datetime('now') THEN tier_until ELSE datetime('now') END, ?), tier = ?, bumped_at = datetime('now') WHERE id = ?`,
    tier, until, tier, listingId,
  );
}

function applyPromotion(listingId, pkg, paymentId = null) {
  if (TIERS.includes(pkg)) return applyTier(listingId, pkg, config.prices.tierDays[pkg], paymentId);
  const days = config.prices.promoDays;
  const until = `+${days} days`;
  db.insert('promotions', { listing_id: listingId, package: pkg, payment_id: paymentId, ends_at: db.get(`SELECT datetime('now', ?) AS d`, until).d });
  if (pkg === 'top' || pkg === 'combo') {
    db.run(`UPDATE listings SET promoted_until = datetime(MAX(COALESCE(promoted_until, datetime('now')), datetime('now')), ?), bumped_at = datetime('now') WHERE id = ?`, until, listingId);
  }
  if (pkg === 'highlight' || pkg === 'combo') {
    db.run(`UPDATE listings SET highlighted_until = datetime(MAX(COALESCE(highlighted_until, datetime('now')), datetime('now')), ?) WHERE id = ?`, until, listingId);
  }
}

function applyPlan(userId, plan, months) {
  const cur = db.get('SELECT * FROM user_plans WHERE user_id = ?', userId);
  const base = cur && cur.until > new Date().toISOString().replace('T', ' ') ? cur.until : null;
  const until = db.get(`SELECT datetime(COALESCE(?, datetime('now')), ?) AS d`, base, `+${months} months`).d;
  db.run(
    `INSERT INTO user_plans (user_id, plan, until, top_credits) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, until = excluded.until, top_credits = user_plans.top_credits + excluded.top_credits`,
    userId, plan, until, config.businessTopCredits * months,
  );
}

// Tasdiq belgisi: amaldagi muddat ustiga qo'shiladi
function applyBadge(userId, months) {
  db.run(
    `UPDATE users SET badge_until = datetime(MAX(COALESCE(badge_until, ''), datetime('now')), ?) WHERE id = ?`,
    `+${Number(months) || 1} months`, userId,
  );
}

function activePlan(userId) {
  const p = db.get(`SELECT * FROM user_plans WHERE user_id = ? AND until > datetime('now')`, userId);
  return p ? { plan: p.plan, until: p.until, top_credits: p.top_credits } : { plan: 'free', until: null, top_credits: 0 };
}

// ---------- Click SHOP API ----------
// Hujjat: https://docs.click.uz/click-api-request/
function clickSign(b, prepareId = '') {
  const s = `${b.click_trans_id}${b.service_id}${config.click.secretKey}${b.merchant_trans_id}${prepareId}${b.amount}${b.action}${b.sign_time}`;
  return crypto.createHash('md5').update(s).digest('hex');
}

function clickHandler(action) {
  return (req, res) => {
    const b = req.body || {};
    const base = { click_trans_id: b.click_trans_id, merchant_trans_id: b.merchant_trans_id };
    const reply = (error, note, extra = {}) => res.json({ ...base, ...extra, error, error_note: note });
    if (!clickReady()) return reply(-8, 'Not configured');
    const prepareId = action === 'complete' ? b.merchant_prepare_id : '';
    if (clickSign(b, prepareId) !== b.sign_string) return reply(-1, 'SIGN CHECK FAILED');
    const p = db.get('SELECT * FROM payments WHERE id = ?', Number(b.merchant_trans_id));
    if (!p || p.provider !== 'click') return reply(-5, 'Payment not found');
    if (Math.abs(Number(b.amount) - p.amount) > 0.01) return reply(-2, 'Incorrect amount');
    if (p.status === 'paid') return reply(-4, 'Already paid');
    if (p.status === 'cancelled') return reply(-9, 'Transaction cancelled');
    if (action === 'prepare') {
      db.run('UPDATE payments SET provider_tx = ? WHERE id = ?', String(b.click_trans_id), p.id);
      return reply(0, 'Success', { merchant_prepare_id: p.id });
    }
    if (Number(b.error) < 0) {
      db.run(`UPDATE payments SET status = 'cancelled' WHERE id = ?`, p.id);
      return reply(-9, 'Transaction cancelled');
    }
    markPaid(p.id, String(b.click_trans_id));
    return reply(0, 'Success', { merchant_confirm_id: p.id });
  };
}

// ---------- Payme Merchant API (JSON-RPC) ----------
// Hujjat: https://developer.help.paycom.uz/metody-merchant-api/
const PE = {
  auth: { code: -32504, message: { ru: 'Недостаточно привилегий', uz: 'Ruxsat yetarli emas', en: 'Insufficient privilege' } },
  amount: { code: -31001, message: { ru: 'Неверная сумма', uz: "Noto'g'ri summa", en: 'Incorrect amount' } },
  account: { code: -31050, message: { ru: 'Платёж не найден', uz: "To'lov topilmadi", en: 'Payment not found' }, data: 'payment_id' },
  busy: { code: -31050, message: { ru: 'Платёж уже обрабатывается', uz: "To'lov allaqachon jarayonda", en: 'Payment already in progress' }, data: 'payment_id' },
  tx: { code: -31003, message: { ru: 'Транзакция не найдена', uz: 'Tranzaksiya topilmadi', en: 'Transaction not found' } },
  state: { code: -31008, message: { ru: 'Операция невозможна', uz: 'Amalni bajarib bo\'lmaydi', en: 'Unable to perform operation' } },
  cancelPerformed: { code: -31007, message: { ru: 'Заказ выполнен, отмена невозможна', uz: 'Buyurtma bajarilgan, bekor qilib bo\'lmaydi', en: 'Order completed, cannot cancel' } },
  method: { code: -32601, message: { ru: 'Метод не найден', uz: 'Metod topilmadi', en: 'Method not found' } },
};
const TX_TIMEOUT = 12 * 3600 * 1000;

function paymeHandler(req, res) {
  const { id, method, params = {} } = req.body || {};
  const ok = (result) => res.json({ jsonrpc: '2.0', id, result });
  const err = (e) => res.json({ jsonrpc: '2.0', id, error: e });
  const auth = req.get('authorization') || '';
  const expected = `Basic ${Buffer.from(`Paycom:${config.payme.key}`).toString('base64')}`;
  if (!paymeReady() || auth !== expected) return err(PE.auth);

  const txView = (t) => ({ create_time: t.create_time, perform_time: t.perform_time, cancel_time: t.cancel_time, transaction: String(t.payment_id), state: t.state, reason: t.reason ?? null });
  const findPayment = () => db.get(`SELECT * FROM payments WHERE id = ? AND provider = 'payme'`, Number(params.account?.payment_id));

  switch (method) {
    case 'CheckPerformTransaction': {
      const p = findPayment();
      if (!p || p.status !== 'pending') return err(PE.account);
      if (Math.round(p.amount * 100) !== Number(params.amount)) return err(PE.amount);
      return ok({ allow: true });
    }
    case 'CreateTransaction': {
      const existing = db.get('SELECT * FROM payme_transactions WHERE id = ?', params.id);
      if (existing) {
        if (existing.state !== 1) return err(PE.state);
        if (Date.now() - existing.create_time > TX_TIMEOUT) {
          db.run('UPDATE payme_transactions SET state = -1, reason = 4, cancel_time = ? WHERE id = ?', Date.now(), existing.id);
          return err(PE.state);
        }
        return ok({ create_time: existing.create_time, transaction: String(existing.payment_id), state: existing.state });
      }
      const p = findPayment();
      if (!p || p.status !== 'pending') return err(PE.account);
      if (Math.round(p.amount * 100) !== Number(params.amount)) return err(PE.amount);
      if (db.get('SELECT 1 FROM payme_transactions WHERE payment_id = ? AND state = 1', p.id)) return err(PE.busy);
      db.insert('payme_transactions', { id: params.id, payment_id: p.id, amount: Number(params.amount), state: 1, create_time: Number(params.time) || Date.now() });
      const t = db.get('SELECT * FROM payme_transactions WHERE id = ?', params.id);
      return ok({ create_time: t.create_time, transaction: String(p.id), state: 1 });
    }
    case 'PerformTransaction': {
      const t = db.get('SELECT * FROM payme_transactions WHERE id = ?', params.id);
      if (!t) return err(PE.tx);
      if (t.state === 2) return ok({ transaction: String(t.payment_id), perform_time: t.perform_time, state: 2 });
      if (t.state !== 1) return err(PE.state);
      if (Date.now() - t.create_time > TX_TIMEOUT) {
        db.run('UPDATE payme_transactions SET state = -1, reason = 4, cancel_time = ? WHERE id = ?', Date.now(), t.id);
        return err(PE.state);
      }
      const now = Date.now();
      db.run('UPDATE payme_transactions SET state = 2, perform_time = ? WHERE id = ?', now, t.id);
      markPaid(t.payment_id, t.id);
      return ok({ transaction: String(t.payment_id), perform_time: now, state: 2 });
    }
    case 'CancelTransaction': {
      const t = db.get('SELECT * FROM payme_transactions WHERE id = ?', params.id);
      if (!t) return err(PE.tx);
      if (t.state < 0) return ok({ transaction: String(t.payment_id), cancel_time: t.cancel_time, state: t.state });
      const now = Date.now();
      if (t.state === 1) {
        db.run('UPDATE payme_transactions SET state = -1, reason = ?, cancel_time = ? WHERE id = ?', params.reason ?? null, now, t.id);
        db.run(`UPDATE payments SET status = 'cancelled' WHERE id = ?`, t.payment_id);
        return ok({ transaction: String(t.payment_id), cancel_time: now, state: -1 });
      }
      // Bajarilgan to'lov: faqat xizmat hali ishlatilmagan bo'lsa qaytarish mumkin (bu yerda — bekor qilib bo'lmaydi)
      return err(PE.cancelPerformed);
    }
    case 'CheckTransaction': {
      const t = db.get('SELECT * FROM payme_transactions WHERE id = ?', params.id);
      if (!t) return err(PE.tx);
      return ok(txView(t));
    }
    case 'GetStatement': {
      const rows = db.all('SELECT * FROM payme_transactions WHERE create_time BETWEEN ? AND ? ORDER BY create_time', Number(params.from), Number(params.to));
      return ok({ transactions: rows.map((t) => ({ id: t.id, time: t.create_time, amount: t.amount, account: { payment_id: String(t.payment_id) }, ...txView(t) })) });
    }
    default:
      return err(PE.method);
  }
}

module.exports = { TIERS, applyTier, PROVIDER_IDS, providers, create, markPaid, applyPromotion, applyPlan, activePlan, priceIn, clickHandler, clickSign, paymeHandler, applyBadge };
