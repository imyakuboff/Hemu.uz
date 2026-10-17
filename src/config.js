const path = require('node:path');
const fs = require('node:fs');

// .env faylini o'qish (tashqi kutubxonasiz)
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const env = process.env;
const root = path.join(__dirname, '..');

module.exports = {
  port: Number(env.PORT || 4700),
  // Serverda faqat ichki manzil (nginx orqali): HOST=127.0.0.1
  host: env.HOST || undefined,
  dbFile: env.DB_FILE || path.join(root, 'data', 'movexgo.db'),
  uploadDir: env.UPLOAD_DIR || path.join(root, 'data', 'uploads'),
  publicUrl: (env.PUBLIC_URL || '').replace(/\/$/, ''),
  secret: env.APP_SECRET || 'dev-secret-change-me',
  isProd: env.NODE_ENV === 'production',
  // Dev rejimida OTP kodi javobda qaytariladi (SMS provayder ulanmaguncha)
  otpDevEcho: env.OTP_DEV_ECHO ? env.OTP_DEV_ECHO === '1' : env.NODE_ENV !== 'production',
  otpTtlSec: 300,
  sessionTtlDays: Number(env.SESSION_TTL_DAYS || 60),
  defaultLang: env.DEFAULT_LANG || 'uz',
  defaultCountry: env.DEFAULT_COUNTRY || 'UZ',
  corsOrigins: (env.CORS_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean),
  // Tasdiqlangan kompaniyalar e'lonlari moderatsiyasiz chiqadi
  autoApproveVerified: env.AUTO_APPROVE_VERIFIED !== '0',
  // Valyuta kurslari manbai: O'zbekiston Markaziy banki (barcha mintaqa valyutalari bor)
  ratesUrl: env.RATES_URL || 'https://cbu.uz/uz/arkhiv-kursov-valyut/json/',
  smsProvider: env.SMS_PROVIDER || 'log',
  // Sayt manzili (to'lovdan qaytish, Telegram havolalari, sitemap)
  siteUrl: (env.SITE_URL || env.PUBLIC_URL || `http://localhost:${env.PORT || 4700}`).replace(/\/$/, ''),

  // ---------- To'lovlar ----------
  // Sinov to'lovi: provayder kalitlarisiz to'lov oqimini tekshirish uchun (productionda o'chiq)
  paymentsDev: env.PAYMENTS_DEV ? env.PAYMENTS_DEV === '1' : env.NODE_ENV !== 'production',
  click: {
    serviceId: env.CLICK_SERVICE_ID || '',
    merchantId: env.CLICK_MERCHANT_ID || '',
    merchantUserId: env.CLICK_MERCHANT_USER_ID || '',
    secretKey: env.CLICK_SECRET_KEY || '',
  },
  payme: {
    merchantId: env.PAYME_MERCHANT_ID || '',
    key: env.PAYME_KEY || '',
    checkoutUrl: env.PAYME_CHECKOUT_URL || 'https://checkout.paycom.uz',
  },
  // Narxlar USD da; to'lov paytida kerakli valyutaga o'giriladi
  prices: {
    promo: { top: Number(env.PRICE_TOP_USD || 5), highlight: Number(env.PRICE_HIGHLIGHT_USD || 3), combo: Number(env.PRICE_COMBO_USD || 7) },
    promoDays: Number(env.PROMO_DAYS || 7),
    plan: { business: Number(env.PRICE_BUSINESS_USD || 49) },
    inspection: Number(env.PRICE_INSPECTION_USD || 25),
    // Tasdiq belgisi (galochka) — oyiga, USD
    badge: Number(env.PRICE_BADGE_USD || 10),
  },
  freeListingLimit: Number(env.FREE_LISTING_LIMIT || 10),
  businessTopCredits: Number(env.BUSINESS_TOP_CREDITS || 3),
  escrowFeePct: Number(env.ESCROW_FEE_PCT || 1.5),

  // ---------- Telegram ----------
  telegramToken: env.TELEGRAM_BOT_TOKEN || '',
};
