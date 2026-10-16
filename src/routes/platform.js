// Foydalanuvchi hamyoni, brauzer push-obunasi, platforma e'loni
const { Router } = require('express');
const config = require('../config');
const money = require('../lib/money');
const pay = require('../lib/payments');
const wallet = require('../lib/wallet');
const webpush = require('../lib/webpush');
const { requireAuth } = require('../lib/auth');
const { fail, validate, paging } = require('../lib/http');
const { t } = require('../i18n');

const r = Router();

function txView(x, req) {
  const cur = req.currency;
  const amount = money.fromUsd(Math.abs(x.amount_usd), cur);
  return {
    id: x.id,
    kind: x.kind,
    kind_label: t(req.lang, `wk.${x.kind}`),
    sign: x.amount_usd > 0 ? '+' : '−',
    amount_usd: x.amount_usd,
    formatted: money.formatAmount(Math.round(amount * 100) / 100, cur, req.lang),
    original: x.amount && x.currency ? money.formatAmount(x.amount, x.currency, req.lang) : null,
    balance_after: money.formatAmount(Math.round(money.fromUsd(x.balance_after, cur) * 100) / 100, cur, req.lang),
    note: x.note,
    payment_id: x.payment_id,
    created_at: x.created_at,
  };
}

r.get('/me/wallet', requireAuth, (req, res) => {
  const pg = paging(req.query, 30);
  res.json({
    ...wallet.view(req.user.id, req.currency, req.lang),
    items: wallet.history(req.user.id, { limit: pg.perPage, offset: pg.offset }).map((x) => txView(x, req)),
    providers: pay.providers({ topup: true }),
  });
});

// Balansni to'ldirish: Click / Payme / sinov
r.post('/me/wallet/topup', requireAuth, (req, res) => {
  const v = validate(req.body, { amount: { type: 'number', min: 0.01, max: 1e12, required: true }, provider: { type: 'enum', values: ['click', 'payme', 'dev'], required: true } });
  const minUsd = 1;
  if (money.toUsd(v.amount, req.currency) < minUsd) fail(422, 'err.validation', { amount: 'too_small' });
  const p = pay.create(req.user, { purpose: 'topup', amount: v.amount, currency: req.currency, provider: v.provider });
  res.status(201).json(p);
});

// ---------- Web Push ----------
r.get('/push/key', (_req, res) => res.json({ public_key: webpush.publicKey() }));
r.post('/me/push', requireAuth, (req, res) => {
  if (!webpush.subscribe(req.user.id, req.body?.subscription || req.body, req.get('user-agent'))) fail(422, 'err.validation', { subscription: 'invalid' });
  res.status(201).json({ ok: true });
});
r.delete('/me/push', requireAuth, (req, res) => {
  webpush.unsubscribe(req.user.id, req.body?.endpoint || req.query.endpoint);
  res.json({ ok: true });
});

// Bosh sahifadagi reklama karuseli
r.get('/banners', (_req, res) => res.json(require('../lib/banners').active()));

// Ochiq platforma ma'lumotlari (e'lon banneri, yordam kontaktlari)
r.get('/platform', (_req, res) => {
  res.json({
    announcement: config.announcement || null,
    announcement_type: config.announcementType,
    support_phone: config.supportPhone || null,
    support_telegram: config.supportTelegram || null,
    support_email: config.supportEmail || null,
    registration_open: config.registrationOpen,
  });
});

module.exports = { router: r, txView };
