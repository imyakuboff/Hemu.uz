const { Router } = require('express');
const db = require('../db');
const cats = require('../lib/categories');
const money = require('../lib/money');
const { LANGUAGES, t, pick, MESSAGES, normalizeSearch } = require('../i18n');
const { COUNTRIES, COUNTRY, REGIONS, CURRENCY_CODES, countryName, currencyName } = require('../geo');
const { notFound } = require('../lib/http');

const r = Router();

// Klient ilovasi ishga tushganda bitta so'rov bilan hamma ma'lumotnomalarni oladi
r.get('/meta', (req, res) => {
  const { lang } = req;
  const rates = money.getRates();
  res.json({
    lang,
    dir: LANGUAGES.find((l) => l.code === lang).dir,
    currency: req.currency,
    country: req.country,
    languages: LANGUAGES.map(({ code, name, dir, locale }) => ({ code, name, dir, locale })),
    countries: COUNTRIES.map((c) => ({
      code: c.code,
      name: countryName(c.code, lang),
      flag: c.flag,
      currency: c.currency,
      dial_code: `+${c.dial}`,
      phone_digits: c.nsn[0],
      default_lang: c.lang,
    })),
    currencies: CURRENCY_CODES.map((code) => ({ code, name: currencyName(code, lang), per_usd: rates[code] })),
    deal_types: ['sale', 'rent', 'service'].map((v) => ({ value: v, label: t(lang, `deal.${v}`) })),
    conditions: ['new', 'used'].map((v) => ({ value: v, label: t(lang, `cond.${v}`) })),
    price_units: ['total', 'hour', 'day', 'shift', 'ton', 'm3', 'piece', 'bag', 'load'].map((v) => ({ value: v, label: v === 'total' ? null : t(lang, `unit.${v}`) })),
    listing_statuses: ['draft', 'moderation', 'active', 'rejected', 'archived', 'sold', 'deleted'].map((v) => ({ value: v, label: t(lang, `ls.${v}`) })),
    order_statuses: ['new', 'confirmed', 'shipped', 'delivered', 'completed', 'cancelled'].map((v) => ({ value: v, label: t(lang, `os.${v}`) })),
    lead_statuses: ['new', 'awaiting', 'negotiating', 'closed'].map((v) => ({ value: v, label: t(lang, `lead.${v}`) })),
    sorts: ['new', 'price_asc', 'price_desc', 'popular', 'year_desc', 'distance'],
    escrow_fee_pct: require('../config').escrowFeePct,
    payment_providers: require('../lib/payments').providers(),
  });
});

// API matnlari lug'ati (xatolar, holatlar) — klient o'zi ham ishlatishi mumkin
r.get('/i18n/:lang', (req, res) => {
  const lang = LANGUAGES.find((l) => l.code === req.params.lang)?.code;
  if (!lang) notFound();
  res.json(Object.fromEntries(Object.keys(MESSAGES).map((k) => [k, pick(MESSAGES[k], lang)])));
});

r.get('/geo/countries', (req, res) => {
  res.json(COUNTRIES.map((c) => ({ code: c.code, name: countryName(c.code, req.lang), flag: c.flag, currency: c.currency, dial_code: `+${c.dial}` })));
});

r.get('/geo/countries/:code/regions', (req, res) => {
  const code = req.params.code.toUpperCase();
  if (!COUNTRY[code]) notFound();
  const counts = Object.fromEntries(
    db.all(`SELECT region, COUNT(*) AS n FROM listings WHERE status = 'active' AND country = ? GROUP BY region`, code).map((x) => [x.region, x.n]),
  );
  res.json(REGIONS[code].map((x) => ({ code: x.code, name: pick(x.names, req.lang), listings: counts[x.code] || 0 })));
});

r.get('/currencies', (req, res) => {
  const rates = money.getRates();
  const updated = db.all('SELECT code, updated_at, source FROM currency_rates');
  const info = Object.fromEntries(updated.map((u) => [u.code, u]));
  res.json({
    base: 'USD',
    items: CURRENCY_CODES.map((code) => ({ code, name: currencyName(code, req.lang), per_usd: rates[code], updated_at: info[code]?.updated_at || null, source: info[code]?.source || 'default' })),
  });
});

r.get('/currencies/convert', (req, res) => {
  const amount = Number(req.query.amount);
  const from = String(req.query.from || '').toUpperCase();
  const to = String(req.query.to || req.currency).toUpperCase();
  if (!Number.isFinite(amount) || !CURRENCY_CODES.includes(from) || !CURRENCY_CODES.includes(to)) notFound();
  const value = money.convert(amount, from, to);
  res.json({ amount, from, to, value, formatted: money.formatAmount(money.roundNice(value, to), to, req.lang) });
});

// ---------- Kategoriyalar ----------
function catCounts() {
  const rows = db.all(`SELECT category_id, subcategory_id, COUNT(*) AS n FROM listings WHERE status = 'active' GROUP BY category_id, subcategory_id`);
  const map = new Map();
  for (const x of rows) {
    map.set(x.category_id, (map.get(x.category_id) || 0) + x.n);
    if (x.subcategory_id) map.set(x.subcategory_id, (map.get(x.subcategory_id) || 0) + x.n);
  }
  return map;
}

function catTree(lang, q) {
  const counts = catCounts();
  const needle = q ? normalizeSearch(q) : null;
  const out = [];
  for (const root of cats.load().roots) {
    const rootHit = !needle || root.searchText.includes(needle);
    const children = root.children
      .filter((c) => rootHit || c.searchText.includes(needle))
      .map((c) => ({ id: c.id, slug: c.slug, name: pick(c.names, lang), count: counts.get(c.id) || 0 }));
    if (!rootHit && !children.length) continue;
    out.push({ id: root.id, slug: root.slug, kind: root.kind, icon: root.icon, name: pick(root.names, lang), count: counts.get(root.id) || 0, children });
  }
  return out;
}

r.get('/categories', (req, res) => {
  res.json(catTree(req.lang, req.query.q));
});

r.get('/categories/:slug', (req, res) => {
  const c = cats.find(req.params.slug);
  if (!c) notFound();
  const counts = catCounts();
  const parent = c.parent_id ? cats.byId(c.parent_id) : null;
  res.json({
    id: c.id,
    slug: c.slug,
    kind: c.kind,
    icon: c.icon,
    name: pick(c.names, req.lang),
    names: c.names,
    count: counts.get(c.id) || 0,
    parent: cats.brief(parent, req.lang),
    children: c.children.map((x) => ({ id: x.id, slug: x.slug, name: pick(x.names, req.lang), count: counts.get(x.id) || 0 })),
    siblings: parent ? parent.children.map((x) => ({ id: x.id, slug: x.slug, name: pick(x.names, req.lang), count: counts.get(x.id) || 0 })) : [],
  });
});

module.exports = { router: r, catTree, catCounts };
