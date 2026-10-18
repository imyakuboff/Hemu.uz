// Admin paneldan o'zgartiriladigan platforma sozlamalari.
// Qiymatlar `settings` jadvalida saqlanadi va ishga tushganda config ustiga yoziladi.
const db = require('../db');
const config = require('../config');
const { fail } = require('./http');

// [kalit, turi, min, max]
const DEFS = [
  ['prices.promo.top', 'number', 0, 1e9],
  ['prices.promo.highlight', 'number', 0, 1e9],
  ['prices.promo.combo', 'number', 0, 1e9],
  ['prices.promoDays', 'int', 1, 90],
  ['prices.plan.business', 'number', 0, 100000],
  ['prices.inspection', 'number', 0, 100000],
  ['prices.badge', 'number', 0, 100000],
  ['freeListingLimit', 'int', 0, 100000],
  ['businessTopCredits', 'int', 0, 1000],
  ['escrowFeePct', 'number', 0, 20],
  ['autoApproveVerified', 'bool'],
  ['registrationOpen', 'bool'],
  ['requireCompanyDocs', 'bool'],
  ['announcement', 'string', 0, 500],
  ['announcementType', 'enum', ['info', 'warning', 'success']],
  ['supportPhone', 'string', 0, 30],
  ['supportTelegram', 'string', 0, 60],
  ['supportEmail', 'string', 0, 120],
  // Oferta va maxfiylik siyosatidagi rekvizitlar
  // Yangi foydalanuvchiga avtomatik bonus (hamyonga)
  ['welcomeBonus.enabled', 'bool'],
  ['welcomeBonus.amount', 'number', 0, 1e9],
  ['welcomeBonus.currency', 'enum', ['UZS', 'USD', 'KZT', 'KGS', 'TJS', 'TMT', 'AFN', 'AZN', 'RUB']],
  ['legalName', 'string', 0, 200],
  ['legalTin', 'string', 0, 30],
  ['legalAddress', 'string', 0, 300],
  // VIP / GOLD / PREMIUM: narx (USD) va muddat (kun) — moderator ham o'zgartira oladi
  ['prices.promoCurrency', 'enum', ['UZS', 'USD', 'KZT', 'KGS', 'TJS', 'TMT', 'AFN', 'AZN', 'RUB']],
  ['prices.tier.vip', 'number', 0, 1e9],
  ['prices.tier.gold', 'number', 0, 1e9],
  ['prices.tier.premium', 'number', 0, 1e9],
  ['prices.tierDays.vip', 'int', 1, 365],
  ['prices.tierDays.gold', 'int', 1, 365],
  ['prices.tierDays.premium', 'int', 1, 365],
  // Integratsiyalar
  ['siteUrl', 'string', 0, 200],
  ['otpDevEcho', 'bool'],
  ['otpTestRegistration', 'bool'],
  ['adminTwoFactor', 'bool'],
  ['smsProvider', 'enum', ['log', 'eskiz']],
  ['eskiz.email', 'string', 0, 120],
  ['eskiz.password', 'secret', 0, 300],
  ['eskiz.from', 'string', 0, 20],
  // Email (SMTP, masalan Gmail) — ro'yxatdan o'tishda tasdiqlash kodi
  ['mailProvider', 'enum', ['off', 'smtp']],
  ['smtp.host', 'string', 0, 120],
  ['smtp.port', 'int', 1, 65535],
  ['smtp.user', 'string', 0, 120],
  ['smtp.pass', 'secret', 0, 300],
  ['smtp.from', 'string', 0, 80],
  ['paymentsDev', 'bool'],
  ['click.serviceId', 'string', 0, 30],
  ['click.merchantId', 'string', 0, 30],
  ['click.merchantUserId', 'string', 0, 30],
  ['click.secretKey', 'secret', 0, 300],
  ['payme.merchantId', 'string', 0, 60],
  ['payme.key', 'secret', 0, 300],
  ['payme.testMode', 'bool'],
  // Xarita: Yandex Maps (kalit — developer.tech.yandex.ru) yoki OpenStreetMap
  ['googleVerification', 'string', 0, 120],
  ['yandexVerification', 'string', 0, 120],
  ['mapProvider', 'enum', ['yandex', 'osm']],
  ['yandexMapsKey', 'string', 0, 100],
];

// Moderator faqat shu kalitlarni o'zgartira oladi
const MODERATOR_KEYS = /^prices\.(tier|promo)/;
const isSecret = (key) => DEFS.find((d) => d[0] === key)?.[1] === 'secret';
const mask = (v) => (v ? `••••${String(v).slice(-4)}` : '');

// Standart qiymatlar (config.js da bo'lmaganlari)
config.registrationOpen ??= true;
config.requireCompanyDocs ??= true;
config.announcement ??= '';
config.announcementType ??= 'info';
config.supportPhone ||= '+998918041224';
config.mapProvider ??= process.env.MAP_PROVIDER || 'yandex';
config.yandexMapsKey ??= process.env.YANDEX_MAPS_KEY || '';
config.supportEmail ??= '';
config.legalName ??= '';
// Test: yangi raqam bilan ro'yxatdan o'tishda SMS-kod ekranga chiqadi (mavjud hisoblarga ta'sir qilmaydi)
config.otpTestRegistration ??= process.env.OTP_TEST_REGISTRATION === '1';
config.welcomeBonus ??= { enabled: process.env.WELCOME_BONUS !== '0', amount: Number(process.env.WELCOME_BONUS_AMOUNT || 200000), currency: process.env.WELCOME_BONUS_CURRENCY || 'UZS' };
config.legalTin ??= '';
config.legalAddress ??= '';
config.adminTwoFactor ??= false;
config.mailProvider ??= process.env.MAIL_PROVIDER || (process.env.SMTP_USER ? 'smtp' : 'off');
config.smtp ??= { host: process.env.SMTP_HOST || 'smtp.gmail.com', port: Number(process.env.SMTP_PORT || 465), user: process.env.SMTP_USER || '', pass: process.env.SMTP_PASS || '', from: process.env.SMTP_FROM || 'HEMU.UZ' };
config.eskiz ??= { email: process.env.ESKIZ_EMAIL || '', password: process.env.ESKIZ_PASSWORD || '', from: process.env.ESKIZ_FROM || '4546' };
config.payme.testMode ??= process.env.PAYME_TEST === '1';
config.prices.tier ??= { vip: 15, gold: 10, premium: 5 };
// VIP/GOLD/PREMIUM va TOP narxlari shu valyutada (standart USD; serverda UZS)
config.prices.promoCurrency ??= process.env.PROMO_CURRENCY || 'USD';
config.prices.tierDays ??= { vip: 7, gold: 7, premium: 7 };
config.supportTelegram ??= '';
// Google Search Console va Yandex Vebmaster tasdiqlash kodlari (faqat "content" qiymati)
config.googleVerification ??= process.env.GOOGLE_SITE_VERIFICATION || '';
config.yandexVerification ??= process.env.YANDEX_VERIFICATION || '';

const getPath = (key) => key.split('.').reduce((o, k) => o?.[k], config);
function setPath(key, value) {
  const parts = key.split('.');
  const last = parts.pop();
  parts.reduce((o, k) => o[k], config)[last] = value;
}

function coerce(def, raw) {
  const [key, type, a, b] = def;
  if (type === 'bool') return raw === true || raw === 1 || raw === '1' || raw === 'true';
  if (type === 'enum') {
    if (!a.includes(raw)) fail(422, 'err.validation', { [key]: 'invalid' });
    return raw;
  }
  if (type === 'string' || type === 'secret') {
    const s = String(raw ?? '').trim();
    if (s.length > b) fail(422, 'err.validation', { [key]: 'too_long' });
    return s;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < a || n > b || (type === 'int' && !Number.isInteger(n))) fail(422, 'err.validation', { [key]: 'invalid' });
  return n;
}

const coerceStored = (key, raw) => { const def = DEFS.find((d) => d[0] === key); return def[1] === 'secret' && raw === null ? '' : coerce(def, raw); };

function load() {
  for (const row of db.all('SELECT key, value FROM settings')) {
    const def = DEFS.find((d) => d[0] === row.key);
    if (!def) continue;
    try { setPath(row.key, coerce(def, JSON.parse(row.value))); } catch { /* noto'g'ri qiymat e'tiborsiz */ }
  }
}

// Maxfiy kalitlar (parol, secret key) to'liq qaytarilmaydi — faqat oxirgi 4 belgi
function all(keys = null) {
  return DEFS.filter(([key]) => !keys || keys.test(key)).map(([key, type, a, b]) => ({
    key, type,
    value: type === 'secret' ? mask(getPath(key)) : getPath(key),
    ...(type === 'secret' ? { set: Boolean(getPath(key)) } : {}),
    ...(type === 'enum' ? { values: a } : { min: a, max: b }),
  }));
}

function update(values) {
  const changed = {};
  db.tx(() => {
    for (const [key, raw] of Object.entries(values || {})) {
      const def = DEFS.find((d) => d[0] === key);
      if (!def) fail(422, 'err.validation', { [key]: 'unknown' });
      // Maxfiy kalit: bo'sh yoki niqoblangan qiymat — o'zgarmaydi; null — o'chiriladi
      if (def[1] === 'secret' && (raw === undefined || raw === '' || String(raw).startsWith('••••'))) continue;
      const v = def[1] === 'secret' && raw === null ? '' : coerce(def, raw);
      if (v === getPath(key)) continue;
      db.run(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, key, JSON.stringify(v));
      changed[key] = isSecret(key) ? { from: mask(getPath(key)), to: mask(v) } : { from: getPath(key), to: v };
    }
  });
  for (const k of Object.keys(changed)) setPath(k, coerceStored(k, values[k]));
  return changed;
}

// Ichki qiymatlar (masalan VAPID kalitlari) — admin ro'yxatida ko'rinmaydi
function getRaw(key) {
  const row = db.get('SELECT value FROM settings WHERE key = ?', key);
  return row ? JSON.parse(row.value) : null;
}
function setRaw(key, value) {
  db.run(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`, key, JSON.stringify(value));
}

module.exports = { DEFS, MODERATOR_KEYS, load, all, update, getRaw, setRaw };
