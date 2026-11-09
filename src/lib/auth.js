const crypto = require('node:crypto');
const db = require('../db');
const config = require('../config');
const { fail } = require('./http');
const { normalizeLang, pickFromAcceptLanguage } = require('../i18n');
const { CURRENCY_CODES, COUNTRY } = require('../geo');

const sha = (s) => crypto.createHmac('sha256', config.secret).update(String(s)).digest('hex');

// APP_SECRET almashtirilgach eski sessiya topilsa — xeshi yangi kalit bilan qayta yoziladi (bir marta)
function legacySession(token) {
  if (!config.legacySecret || config.legacySecret === config.secret) return null;
  const old = crypto.createHmac('sha256', config.legacySecret).update(String(token)).digest('hex');
  const s = db.get(`SELECT s.id AS sid, s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`, old);
  if (s) db.run('UPDATE sessions SET token_hash = ? WHERE id = ?', sha(token), s.sid);
  return s;
}

function createSession(userId, req) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + config.sessionTtlDays * 86400000).toISOString();
  db.insert('sessions', {
    user_id: userId,
    token_hash: sha(token),
    device: String(req.get('user-agent') || '').slice(0, 200),
    ip: req.ip,
    expires_at: expires,
  });
  return token;
}

function tokenFrom(req) {
  const h = req.get('authorization');
  if (h && h.startsWith('Bearer ')) return h.slice(7).trim();
  return null;
}

// SSE kaliti: EventSource sarlavha yubora olmaydi, shuning uchun URL'da asosiy token emas,
// faqat oqimni o'qishga yaraydigan, sessiyaga bog'langan imzoli kalit yuboriladi
const streamKey = (sessionId) => `${sessionId}.${sha(`sse:${sessionId}`).slice(0, 32)}`;
function sessionFromStreamKey(key) {
  const [sid, sig] = String(key || '').split('.');
  if (!/^\d+$/.test(sid || '') || !sig) return null;
  const want = Buffer.from(streamKey(Number(sid)));
  const got = Buffer.from(String(key));
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  return db.get(`SELECT s.id AS sid, s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`, Number(sid));
}

// Har bir so'rov uchun: foydalanuvchi, til, valyuta
function context(req, _res, next) {
  const token = tokenFrom(req);
  req.user = null;
  const streamSession = !token && req.path.endsWith('/stream') && req.query.key ? sessionFromStreamKey(req.query.key) : null;
  if (streamSession) {
    if (streamSession.expires_at > new Date().toISOString() && !streamSession.blocked) { req.sessionId = streamSession.sid; req.user = streamSession; }
  } else if (token) {
    const s = db.get(
      `SELECT s.id AS sid, s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
      sha(token),
    ) || legacySession(token);
    if (s && s.expires_at > new Date().toISOString() && !s.blocked) {
      req.sessionId = s.sid;
      req.user = s;
      // last_used ni har so'rovda emas, daqiqada bir marta yangilaymiz
      db.run(`UPDATE sessions SET last_used_at = datetime('now') WHERE id = ? AND last_used_at < datetime('now', '-1 minute')`, s.sid);
    }
  }
  req.lang =
    normalizeLang(req.query.lang) ||
    normalizeLang(req.get('x-lang')) ||
    (req.user && req.user.lang) ||
    pickFromAcceptLanguage(req.get('accept-language')) ||
    config.defaultLang;
  const cur = String(req.query.currency || req.get('x-currency') || '').toUpperCase();
  const country = String(req.query.country_hint || req.get('x-country') || req.user?.country || config.defaultCountry).toUpperCase();
  req.country = COUNTRY[country] ? country : config.defaultCountry;
  req.currency = CURRENCY_CODES.includes(cur) ? cur : req.user?.currency || COUNTRY[req.country].currency;
  next();
}

function requireAuth(req, _res, next) {
  if (!req.user) fail(401, 'err.unauthorized');
  next();
}

// Admin yoki moderator (admin panelga kirish huquqi)
const isStaff = (u) => u?.role === 'admin' || u?.role === 'moderator';
function requireStaff(req, _res, next) {
  if (!req.user) fail(401, 'err.unauthorized');
  if (!isStaff(req.user)) fail(403, 'err.forbidden');
  next();
}

function requireAdmin(req, _res, next) {
  if (!req.user) fail(401, 'err.unauthorized');
  if (req.user.role !== 'admin') fail(403, 'err.forbidden');
  next();
}

// Oddiy xotiradagi rate limiter
const buckets = new Map();
function rateLimit({ windowMs, max, key = (req) => req.ip, name = 'rl' }) {
  return (req, _res, next) => {
    const k = `${name}:${key(req)}`;
    const now = Date.now();
    let b = buckets.get(k);
    if (!b || b.reset < now) {
      b = { count: 0, reset: now + windowMs };
      buckets.set(k, b);
    }
    b.count += 1;
    if (b.count > max) fail(429, 'err.too_many');
    next();
  };
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
}, 60000).unref();

function resetRateLimits() {
  buckets.clear();
}

module.exports = { sha, streamKey, createSession, context, requireAuth, requireAdmin, requireStaff, isStaff, rateLimit, resetRateLimits };
