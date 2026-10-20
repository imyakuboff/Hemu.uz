const { Router } = require('express');
const db = require('../db');
const config = require('../config');
const money = require('../lib/money');
const pay = require('../lib/payments');
const { requireAuth } = require('../lib/auth');
const { fail, notFound, forbidden, validate, parseJson } = require('../lib/http');
const { t } = require('../i18n');
const { notify } = require('../lib/notify');

const r = Router();
// Biznes darajalari (bosh sahifa karusellari) — faqat kompaniyalar (MChJ, YaTT va h.k.)
const TIERS = pay.TIERS; // vip | gold | premium
// OLX tartibidagi TOP paketlari — hamma uchun
const TOPS = ['top', 'highlight', 'combo'];
const PACKAGES = [...TIERS, ...TOPS];
const isCompany = (uid) => Boolean(uid && db.get('SELECT 1 FROM companies WHERE owner_id = ? AND blocked = 0', uid));
const priceOf = (pkg) => (TIERS.includes(pkg) ? config.prices.tier[pkg] : config.prices.promo[pkg]);
// Ko'tarish narxi o'z valyutasida (prices.promoCurrency) saqlanadi — foydalanuvchi valyutasiga o'giriladi
const PC = () => config.prices.promoCurrency || 'USD';
const promoPrice = (amount, req) => {
  const cur = req.currency;
  const v = money.roundNice(money.convert(amount, PC(), cur), cur);
  return { amount: v, currency: cur, formatted: money.formatAmount(v, cur, req.lang), uzs: money.roundNice(money.convert(amount, PC(), 'UZS'), 'UZS') };
};

const priceView = (usd, req) => {
  const cur = req.currency;
  const amount = pay.priceIn(usd, cur);
  return { amount, currency: cur, formatted: money.formatAmount(amount, cur, req.lang), uzs: pay.priceIn(usd, 'UZS') };
};

r.get('/payment-providers', (_req, res) => res.json(pay.providers()));

// ---------- E'lonni ko'tarish ----------
r.get('/promo/packages', (req, res) => {
  res.json({
    days: config.prices.promoDays,
    is_company: isCompany(req.user?.id),
    items: [
      ...(isCompany(req.user?.id) || !req.user ? TIERS : []).map((p) => ({ id: p, group: 'business', name: t(req.lang, `promo.${p}`), place: t(req.lang, `promo.${p}_place`), days: config.prices.tierDays[p], price: promoPrice(config.prices.tier[p], req) })),
      ...TOPS.map((p) => ({ id: p, group: 'top', name: t(req.lang, `promo.${p}`), place: t(req.lang, `promo.${p}_place`), days: config.prices.promoDays, price: promoPrice(config.prices.promo[p], req) })),
    ],
    credits: req.user ? pay.activePlan(req.user.id).top_credits : 0,
    providers: pay.providers(),
  });
});

r.post('/listings/:id/promote', requireAuth, (req, res) => {
  const v = validate(req.body, { package: { type: 'enum', values: PACKAGES, required: true }, provider: { type: 'enum', values: [...pay.PROVIDER_IDS, 'credit'], required: true } });
  const l = db.get('SELECT * FROM listings WHERE id = ?', Number(req.params.id));
  if (!l) notFound();
  if (l.user_id !== req.user.id) forbidden();
  if (!['active', 'moderation'].includes(l.status)) fail(409, 'err.invalid_status');
  if (TIERS.includes(v.package) && !isCompany(req.user.id)) fail(403, 'err.company_only');
  // Yuqoriroq daraja faol bo'lsa — arzonrog'i bilan almashtirilmaydi (qolgan kunlar yo'qolmasin)
  const rank = { vip: 3, gold: 2, premium: 1 };
  if (TIERS.includes(v.package) && l.tier && l.tier_until > new Date().toISOString().replace('T', ' ') && rank[l.tier] > rank[v.package]) fail(409, 'err.tier_higher', { tier: l.tier, until: l.tier_until });
  const dup = db.get(
    `SELECT * FROM payments WHERE purpose = 'promo' AND user_id = ? AND ref_id = ? AND json_extract(meta, '$.package') = ?
       AND status = 'paid' AND created_at > datetime('now', '-60 seconds') ORDER BY id DESC LIMIT 1`,
    req.user.id, l.id, v.package,
  );
  if (dup) return res.json({ id: dup.id, amount: dup.amount, currency: dup.currency, provider: dup.provider, status: 'paid', duplicate: true });
  // Biznes tarif krediti bilan TOP — bepul
  if (v.provider === 'credit') {
    const plan = pay.activePlan(req.user.id);
    // Biznes tarif krediti: kompaniyada — PREMIUM, boshqalarda — TOP
    const creditPkg = isCompany(req.user.id) ? 'premium' : 'top';
    if (v.package !== creditPkg || plan.top_credits < 1) fail(402, 'err.plan_limit');
    db.tx(() => {
      db.run('UPDATE user_plans SET top_credits = top_credits - 1 WHERE user_id = ?', req.user.id);
      pay.applyPromotion(l.id, creditPkg);
    });
    return res.json({ status: 'paid', listing_id: l.id });
  }
  const p = pay.create(req.user, { purpose: 'promo', refId: l.id, meta: { package: v.package }, amount: priceOf(v.package), currency: PC(), provider: v.provider });
  res.status(201).json(p);
});

// ---------- Tariflar ----------
r.get('/plans', (req, res) => {
  const current = req.user ? pay.activePlan(req.user.id) : { plan: 'free' };
  const used = req.user ? db.get(`SELECT COUNT(*) AS n FROM listings WHERE user_id = ? AND status IN ('active', 'moderation')`, req.user.id).n : 0;
  res.json({
    current: { ...current, name: t(req.lang, `plan.${current.plan}`), listings_used: used, listings_limit: current.plan === 'business' ? null : config.freeListingLimit },
    items: [
      { id: 'free', name: t(req.lang, 'plan.free'), price: null, listings_limit: config.freeListingLimit, top_credits: 0 },
      { id: 'business', name: t(req.lang, 'plan.business'), price: priceView(config.prices.plan.business, req), listings_limit: null, top_credits: config.businessTopCredits },
    ],
    providers: pay.providers(),
  });
});

r.post('/plans/subscribe', requireAuth, (req, res) => {
  const v = validate(req.body, { plan: { type: 'enum', values: ['business'], required: true }, months: { type: 'int', min: 1, max: 12 }, provider: { type: 'enum', values: pay.PROVIDER_IDS, required: true } });
  const months = v.months || 1;
  const p = pay.create(req.user, { purpose: 'plan', meta: { plan: v.plan, months }, usd: config.prices.plan[v.plan] * months, provider: v.provider, currency: req.currency });
  res.status(201).json(p);
});

// ---------- Tasdiq belgisi (galochka) — oylik obuna ----------
// Hujjati (guvohnomasi) tekshirilgan kompaniyalarda belgi bepul; qolganlar sotib oladi.
// To'lov admin orqali: foydalanuvchi kartaga o'tkazadi, "To'ladim" bosadi, admin tasdiqlagach belgi yoqiladi.
const ADMIN_PROVIDER = { id: 'admin', name: 'Admin', currencies: ['*'] };
r.get('/badge', (req, res) => {
  const u = req.user ? db.get(`SELECT badge_until, (COALESCE(badge_until, '') > datetime('now')) AS active FROM users WHERE id = ?`, req.user.id) : null;
  const company = req.user ? db.get('SELECT * FROM companies WHERE owner_id = ?', req.user.id) : null;
  const pending = req.user ? db.get(`SELECT id FROM payments WHERE user_id = ? AND purpose = 'badge' AND provider = 'admin' AND status = 'pending' ORDER BY id DESC LIMIT 1`, req.user.id) : null;
  res.json({
    price: priceView(config.prices.badge, req),
    status: {
      active: Boolean(u?.active),
      until: u?.active ? u.badge_until : null,
      by_docs: company?.verification === 'verified',
      docs_pending: company?.verification === 'pending',
      pending_payment: pending?.id || null,
    },
    providers: [ADMIN_PROVIDER],
  });
});

// Admin orqali to'lov yaratish: oldingi "To'ladim" bosilmagan so'rov bekor qilinadi — bittasi qoladi
function createManual(req, purpose, usd, months) {
  const cur = req.currency || 'USD';
  const amount = pay.priceIn(usd, cur);
  db.run(`UPDATE payments SET status = 'cancelled' WHERE user_id = ? AND purpose = ? AND provider = 'admin' AND status = 'pending' AND json_extract(meta, '$.claimed_at') IS NULL`, req.user.id, purpose);
  const id = db.insert('payments', { user_id: req.user.id, purpose, meta: { months, usd }, amount, currency: cur, provider: 'admin' });
  return { id, amount, currency: cur, provider: 'admin', status: 'pending', pay_url: `${config.siteUrl}/payments/${id}` };
}
const pendingManual = (uid, purpose) => (uid ? db.get(`SELECT id FROM payments WHERE user_id = ? AND purpose = ? AND provider = 'admin' AND status = 'pending' ORDER BY id DESC LIMIT 1`, uid, purpose)?.id || null : null);

r.post('/badge/subscribe', requireAuth, (req, res) => {
  const v = validate(req.body, { months: { type: 'int', min: 1, max: 12 }, provider: { type: 'enum', values: [...pay.PROVIDER_IDS, 'admin'] } });
  const months = v.months || 1;
  res.status(201).json(createManual(req, 'badge', config.prices.badge * months, months));
});

// ---------- Diler "Do'kon" tarifi — oylik, admin orqali to'lov ----------
const STORE = require('../lib/store');
r.get('/store-plan', (req, res) => {
  const c = req.user ? db.get('SELECT * FROM companies WHERE owner_id = ?', req.user.id) : null;
  res.json({
    price: priceView(config.prices.store, req),
    has_company: Boolean(c),
    status: {
      active: STORE.isActive(c),
      until: STORE.isActive(c) ? c.store_until : null,
      pending_payment: pendingManual(req.user?.id, 'store'),
    },
    settings: c ? {
      slug: c.store_slug || '', tagline: c.store_tagline || '', color: c.store_color || '', cover: require('../lib/listings').fileUrl(c.cover),
      pinned: STORE.pinnedIds(c), url: c.store_slug ? `${config.siteUrl}/s/${c.store_slug}` : `${config.siteUrl}/company/${c.id}`,
    } : null,
    colors: STORE.COLORS,
  });
});

r.post('/store-plan/subscribe', requireAuth, (req, res) => {
  const v = validate(req.body, { months: { type: 'int', min: 1, max: 12 } });
  if (!db.get('SELECT 1 FROM companies WHERE owner_id = ?', req.user.id)) fail(403, 'err.store_company');
  const months = v.months || 1;
  res.status(201).json(createManual(req, 'store', config.prices.store * months, months));
});

// Foydalanuvchi: "To'ladim" — izoh (chek raqami, karta oxiri, vaqt) adminga yuboriladi
r.post('/payments/:id/claim', requireAuth, (req, res) => {
  const p = db.get('SELECT * FROM payments WHERE id = ?', Number(req.params.id));
  if (!p) notFound();
  if (p.user_id !== req.user.id) forbidden();
  if (p.provider !== 'admin' || p.status !== 'pending') fail(409, 'err.invalid_status');
  const v = validate(req.body, { note: { type: 'string', max: 300 } });
  const meta = parseJson(p.meta, {});
  const again = meta.claimed_at && Date.now() - Date.parse(`${meta.claimed_at}Z`) < 10 * 60000;
  meta.note = v.note || meta.note || '';
  meta.claimed_at = new Date().toISOString().replace('T', ' ').slice(0, 19);
  db.run('UPDATE payments SET meta = ? WHERE id = ?', JSON.stringify(meta), p.id);
  if (!again) {
    for (const a of db.all(`SELECT id FROM users WHERE role = 'admin'`)) {
      notify(a.id, 'badge_request', { name: req.user.name || req.user.phone, purpose_key: `pp.${p.purpose}`, price_amount: p.amount, price_currency: p.currency, payment_id: p.id }, '/admin/finance?tab=manual');
    }
  }
  res.json(paymentView(db.get('SELECT * FROM payments WHERE id = ?', p.id), req));
});

// ---------- To'lovlar ----------
function paymentView(p, req) {
  const meta = parseJson(p.meta, {});
  let title = t(req.lang, `pp.${p.purpose}`);
  if (p.purpose === 'promo') title += ` · ${t(req.lang, `promo.${meta.package}`)}`;
  if (p.purpose === 'plan') title += ` · ${t(req.lang, `plan.${meta.plan}`)} × ${meta.months || 1}`;
  if (p.purpose === 'badge' || p.purpose === 'store') title += ` × ${meta.months || 1}`;
  let ref = null;
  if (p.purpose === 'promo' || p.purpose === 'inspection') {
    const lid = p.purpose === 'promo' ? p.ref_id : db.get('SELECT listing_id FROM inspections WHERE id = ?', p.ref_id)?.listing_id;
    const l = lid ? db.get('SELECT id, title FROM listings WHERE id = ?', lid) : null;
    ref = l ? { type: 'listing', id: l.id, title: l.title } : null;
  }
  if (p.purpose === 'escrow') {
    const o = db.get('SELECT id, number, title FROM orders WHERE id = ?', p.ref_id);
    ref = o ? { type: 'order', id: o.id, title: `${o.number} · ${o.title}` } : null;
  }
  return {
    id: p.id, purpose: p.purpose, title, ref, amount: p.amount, currency: p.currency,
    formatted: money.formatAmount(p.amount, p.currency, req.lang), provider: p.provider, status: p.status,
    created_at: p.created_at, paid_at: p.paid_at, dev: p.provider === 'dev' && config.paymentsDev,
    ...(p.provider === 'admin' ? {
      manual: {
        note: meta.note || '', claimed_at: meta.claimed_at || null, reject_reason: meta.reject_reason ?? null,
        usd: meta.usd || null, card: config.manualPay?.card || '', holder: config.manualPay?.holder || '', info: config.manualPay?.info || '',
        phone: config.supportPhone || '', telegram: config.supportTelegram || '',
      },
    } : {}),
  };
}

r.get('/payments', requireAuth, (req, res) => {
  res.json(db.all('SELECT * FROM payments WHERE user_id = ? ORDER BY id DESC LIMIT 100', req.user.id).map((p) => paymentView(p, req)));
});

r.get('/payments/:id', requireAuth, (req, res) => {
  const p = db.get('SELECT * FROM payments WHERE id = ?', Number(req.params.id));
  if (!p) notFound();
  if (p.user_id !== req.user.id && req.user.role !== 'admin') forbidden();
  res.json(paymentView(p, req));
});

// Sinov rejimi: "To'lash" tugmasi (faqat PAYMENTS_DEV=1)
r.post('/payments/:id/dev-confirm', requireAuth, (req, res) => {
  if (!config.paymentsDev) fail(403, 'err.forbidden');
  const p = db.get('SELECT * FROM payments WHERE id = ?', Number(req.params.id));
  if (!p) notFound();
  if (p.user_id !== req.user.id || p.provider !== 'dev') forbidden();
  if (p.status !== 'pending') fail(409, 'err.invalid_status');
  res.json(paymentView(pay.markPaid(p.id, `dev-${Date.now()}`), req));
});

r.post('/payments/:id/cancel', requireAuth, (req, res) => {
  const p = db.get('SELECT * FROM payments WHERE id = ?', Number(req.params.id));
  if (!p) notFound();
  if (p.user_id !== req.user.id) forbidden();
  if (p.status !== 'pending') fail(409, 'err.invalid_status');
  db.run(`UPDATE payments SET status = 'cancelled' WHERE id = ?`, p.id);
  res.json({ ok: true });
});

// ---------- Provayder callback'lari ----------
r.post('/pay/click/prepare', pay.clickHandler('prepare'));
r.post('/pay/click/complete', pay.clickHandler('complete'));
r.post('/pay/payme', pay.paymeHandler);

module.exports = { router: r, paymentView };
