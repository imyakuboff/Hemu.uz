const db = require('../db');
const config = require('../config');
const { CURRENCIES, CURRENCY_CODES, COUNTRY } = require('../geo');
const { byCode, t } = require('../i18n');

let rates = null; // { UZS: 12650, ... } — 1 USD uchun

function loadRates() {
  rates = {};
  for (const r of db.all('SELECT code, per_usd FROM currency_rates')) rates[r.code] = r.per_usd;
  for (const c of CURRENCIES) if (!rates[c.code]) rates[c.code] = c.rate;
  return rates;
}

function getRates() {
  return rates || loadRates();
}

function toUsd(amount, currency) {
  if (amount === null || amount === undefined) return null;
  const r = getRates()[currency];
  return r ? amount / r : null;
}

function fromUsd(usd, currency) {
  if (usd === null || usd === undefined) return null;
  const r = getRates()[currency];
  return r ? usd * r : null;
}

function convert(amount, from, to) {
  if (from === to) return amount;
  return fromUsd(toUsd(amount, from), to);
}

// Konvertatsiya qilingan narxni chiroyli yaxlitlash (6 849 312 -> 6 849 000)
function roundNice(n, currency) {
  if (n === null) return null;
  const dec = CURRENCIES.find((c) => c.code === currency)?.decimals ?? 2;
  if (n >= 100000) return Math.round(n / 1000) * 1000;
  if (n >= 1000) return Math.round(n / 10) * 10;
  return Number(n.toFixed(dec));
}

const fmtCache = new Map();
function formatAmount(amount, currency, lang) {
  if (amount === null || amount === undefined) return null;
  const key = `${lang}|${currency}|${amount >= 1000 ? 0 : 2}`;
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(byCode[lang]?.locale || 'en-US', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      maximumFractionDigits: amount >= 1000 ? 0 : 2,
      minimumFractionDigits: 0,
    });
    fmtCache.set(key, f);
  }
  return localSymbol(f.format(amount), currency, lang);
}

// Intl ba'zi tillarda mahalliy belgini bermaydi ("UZS") — o'qishli nomga almashtiramiz
const SYMBOLS = {
  UZS: { ru: 'сум', kk: 'сум', ky: 'сум', tg: 'сӯм', tk: 'som', az: 'som', en: 'UZS' },
  KGS: { ru: 'сом', kk: 'сом', uz: "so'm", tg: 'сом', tk: 'som', az: 'som' },
  TJS: { ru: 'сомони', kk: 'сомони', ky: 'сомони', uz: 'somoni', tk: 'somoni', az: 'somoni' },
  TMT: { ru: 'манат', kk: 'манат', ky: 'манат', uz: 'manat', tg: 'манат', az: 'manat' },
  AZN: { ru: '₼', kk: '₼', ky: '₼', uz: '₼', tg: '₼', tk: '₼' },
};
function localSymbol(s, currency, lang) {
  const sym = SYMBOLS[currency]?.[lang];
  return sym ? s.replace(currency, sym) : s;
}

// E'lon narxini klient valyutasida va asl valyutada qaytarish
function priceView(row, lang, displayCurrency) {
  if (row.price === null || row.price === undefined) {
    return { amount: null, currency: row.currency, negotiable: true, formatted: null };
  }
  const cur = displayCurrency && CURRENCY_CODES.includes(displayCurrency) ? displayCurrency : row.currency;
  const amount = cur === row.currency ? row.price : roundNice(convert(row.price, row.currency, cur), cur);
  const unit = row.price_unit && row.price_unit !== 'total' ? t(lang, `unit.${row.price_unit}`) : null;
  let formatted = formatAmount(amount, cur, lang);
  if (unit) formatted += ` / ${unit}`;
  if (row.price_from) {
    const from = t(lang, 'price.from');
    // Turkiy tillarda "dan/başlap" keyin, boshqalarida oldin keladi
    formatted = ['uz', 'kk', 'ky', 'tk', 'az'].includes(lang) ? `${formatted} ${from}` : `${from} ${formatted}`;
  }
  return {
    amount,
    currency: cur,
    unit: row.price_unit || 'total',
    unit_label: unit,
    from: Boolean(row.price_from),
    negotiable: Boolean(row.negotiable),
    formatted,
    converted: cur !== row.currency,
    original: { amount: row.price, currency: row.currency, formatted: formatAmount(row.price, row.currency, lang) },
  };
}

function defaultCurrencyFor(country) {
  return COUNTRY[country]?.currency || 'USD';
}

function setRate(code, perUsd, source = 'admin') {
  db.run(
    `INSERT INTO currency_rates (code, per_usd, updated_at, source) VALUES (?, ?, datetime('now'), ?)
     ON CONFLICT(code) DO UPDATE SET per_usd = excluded.per_usd, updated_at = excluded.updated_at, source = excluded.source`,
    code, perUsd, source,
  );
}

// Kurs o'zgarganda price_usd ustunini qayta hisoblash
function recomputeUsdPrices() {
  loadRates();
  for (const [code, r] of Object.entries(rates)) {
    db.run('UPDATE listings SET price_usd = price / ? WHERE currency = ? AND price IS NOT NULL', r, code);
  }
}

// O'zbekiston Markaziy banki: [{Ccy:'USD', Rate:'12650.5', Nominal:'1'}, ...] — so'mda
async function syncFromCbu(fetchImpl = fetch) {
  const res = await fetchImpl(config.ratesUrl, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`CBU HTTP ${res.status}`);
  const list = await res.json();
  const uzsPer = {};
  for (const r of list) uzsPer[r.Ccy] = Number(r.Rate) / Number(r.Nominal || 1);
  if (!uzsPer.USD) throw new Error('CBU: USD kursi topilmadi');
  const updated = {};
  db.tx(() => {
    setRate('UZS', uzsPer.USD, 'cbu.uz');
    updated.UZS = uzsPer.USD;
    for (const code of CURRENCY_CODES) {
      if (code === 'USD' || code === 'UZS' || !uzsPer[code]) continue;
      const perUsd = uzsPer.USD / uzsPer[code];
      setRate(code, perUsd, 'cbu.uz');
      updated[code] = perUsd;
    }
  });
  recomputeUsdPrices();
  return updated;
}

module.exports = { loadRates, getRates, toUsd, fromUsd, convert, roundNice, formatAmount, priceView, defaultCurrencyFor, setRate, recomputeUsdPrices, syncFromCbu };
