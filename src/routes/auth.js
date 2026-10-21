const crypto = require('node:crypto');
const { Router } = require('express');
const db = require('../db');
const config = require('../config');
const cats = require('../lib/categories');
const { sha, createSession, requireAuth, rateLimit } = require('../lib/auth');
const { fail, validate, notFound } = require('../lib/http');
const { normalizePhone, COUNTRY, CURRENCY_CODES, isValidRegion } = require('../geo');
const { LANGS, t } = require('../i18n');
const { sendSms } = require('../lib/sms');
const { fileUrl } = require('../lib/listings');
const { ACTIVITIES, companyFor, linkMembership } = require('../lib/company');
const { upsertSpecialist } = require('../lib/people');
const legal = require('../lib/legal');
const upload = require('../lib/upload');

const r = Router();
const authLimit = rateLimit({ name: 'auth', windowMs: 10 * 60000, max: 60 });
const loginLimit = rateLimit({ name: 'login', windowMs: 15 * 60000, max: 30, key: (req) => `${req.ip}:${String(req.body?.login || req.body?.phone || '').toLowerCase().replace(/[^a-z0-9]/g, '')}` });
// Login (username): lotin harflari, raqam, nuqta, chiziqcha; kamida bitta harf — telefondan farqlash uchun
const USERNAME = /^(?=.*[a-z])[a-z0-9._-]{3,32}$/i;
const ACCOUNT_TYPES = ['client', 'company', 'mechanic', 'driver'];

// ---------- Parol (scrypt) ----------
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}
function checkPassword(pw, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, s, h] = stored.split('$');
  const want = Buffer.from(h, 'base64');
  const got = crypto.scryptSync(String(pw), Buffer.from(s, 'base64'), want.length);
  return crypto.timingSafeEqual(want, got);
}
function assertStrong(pw) {
  if (typeof pw !== 'string' || pw.length < 8 || pw.length > 128 || !/\p{L}/u.test(pw) || !/\d/.test(pw)) fail(422, 'err.password_weak', { password: 'weak' });
}

function userView(u) {
  const company = companyFor(u.id);
  const spec = db.get('SELECT id, kind, headline FROM specialists WHERE user_id = ?', u.id);
  return {
    id: u.id,
    phone: u.phone,
    username: u.username,
    name: u.name,
    email: u.email,
    email_verified: Boolean(u.email_verified_at),
    role: u.role,
    account_type: u.account_type || 'client',
    has_password: Boolean(u.password_hash),
    badge_until: u.badge_until && u.badge_until > new Date().toISOString().replace('T', ' ').slice(0, 19) ? u.badge_until : null,
    lang: u.lang,
    country: u.country,
    city: u.city,
    position: u.position,
    auto_reply: u.auto_reply,
    auto_reply_on: Boolean(u.auto_reply_on),
    plan: require('../lib/payments').activePlan(u.id),
    currency: u.currency || COUNTRY[u.country]?.currency,
    avatar: fileUrl(u.avatar),
    company: company ? {
      id: company.id, name: company.name, verified: company.verification === 'verified', verification: company.verification,
      role: company.member_role, activities: JSON.parse(company.activities || '[]'),
    } : null,
    specialist: spec ? { id: spec.id, kind: spec.kind, headline: spec.headline } : null,
    interests: db.all('SELECT c.slug FROM user_interests i JOIN categories c ON c.id = i.category_id WHERE i.user_id = ?', u.id).map((x) => x.slug),
    notifications: {
      messages: Boolean(u.notify_messages),
      orders: Boolean(u.notify_orders),
      prices: Boolean(u.notify_prices),
      news: Boolean(u.notify_news),
    },
    created_at: u.created_at,
  };
}

// ---------- SMS / email kod ----------
// Kod telefon raqamiga bog'lanadi; email orqali yuborilganda email ham xeshga kiradi (boshqa manzil bilan ishlatib bo'lmaydi)
const otpHash = (phone, code, email) => sha(email ? `${phone}:${email}:${code}` : `${phone}:${code}`);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Bo'sh — null; noto'g'ri — 422
function emailOf(raw) {
  const e = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!e) return null;
  if (e.length > 120 || !EMAIL.test(e)) fail(422, 'err.validation', { email: 'invalid' });
  return e;
}

// isNew — raqam hali ro'yxatdan o'tmagan: "test ro'yxatdan o'tish" rejimida kod faqat shunda ekranga chiqadi
// email — kod shu manzilga bog'lanadi; via = 'email' bo'lsa kod SMS o'rniga shu manzilga (Gmail) yuboriladi
async function sendCode(req, phoneE164, smsKey = 'sms.otp', { isNew = false, email = null, via = email ? 'email' : 'sms' } = {}) {
  // Test rejimi: kod ekranga chiqadi. Admin/moderator hisoblari uchun HECH QACHON (serverda) — panelni egallab olishning oldini olish
  const staff = process.env.NODE_ENV === 'production' && Boolean(db.get(`SELECT 1 FROM users WHERE phone = ? AND role IN ('admin', 'moderator')`, phoneE164));
  const echo = !staff && (config.otpDevEcho || (config.otpTestRegistration && isNew));
  const now = Date.now();
  const prev = db.get('SELECT sent_at FROM otp_codes WHERE phone = ?', phoneE164);
  if (prev && now - prev.sent_at < 60000) fail(429, 'err.too_many', { retry_after: Math.ceil((60000 - (now - prev.sent_at)) / 1000) });
  const code = String(crypto.randomInt(100000, 1000000));
  db.run(
    `INSERT INTO otp_codes (phone, code_hash, expires_at, attempts, sent_at) VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(phone) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_at = excluded.sent_at`,
    phoneE164, otpHash(phoneE164, code, email), now + config.otpTtlSec * 1000, now,
  );
  try {
    if (via === 'email') {
      const mail = require('../lib/mail');
      await mail.sendMail({ to: email, ...mail.codeEmail(req.lang, code) });
    } else {
      await sendSms(phoneE164, t(req.lang, smsKey, { code }));
    }
  } catch (e) {
    // Sinov rejimida kod ekranga chiqadi — SMS/email xatosi kirishni to'xtatmaydi
    if (!echo) fail(502, via === 'email' ? 'err.mail_failed' : 'err.sms_failed');
  }
  return echo ? { dev_code: code } : {};
}

function consumeCode(phoneE164, code, email = null) {
  const row = db.get('SELECT * FROM otp_codes WHERE phone = ?', phoneE164);
  if (!row || row.expires_at < Date.now() || row.attempts >= 5) fail(422, 'err.otp_invalid');
  const a = Buffer.from(row.code_hash);
  const b = Buffer.from(otpHash(phoneE164, String(code || '').trim(), email));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    db.run('UPDATE otp_codes SET attempts = attempts + 1 WHERE phone = ?', phoneE164);
    fail(422, 'err.otp_invalid');
  }
  db.run('DELETE FROM otp_codes WHERE phone = ?', phoneE164);
}

const phoneOf = (req) => {
  const p = normalizePhone(req.body?.phone, req.body?.country || req.country);
  if (!p) fail(422, 'err.invalid_phone');
  return p;
};

function signIn(req, res, user, extra = {}) {
  if (user.blocked) fail(403, 'err.account_blocked', user.blocked_reason ? { reason: user.blocked_reason } : undefined);
  linkMembership(user);
  db.run(`UPDATE users SET last_seen_at = datetime('now') WHERE id = ?`, user.id);
  const token = createSession(user.id, req);
  res.json({ token, ...extra, user: userView(db.get('SELECT * FROM users WHERE id = ?', user.id)) });
}

// Ro'yxatdan o'tish chiptasi: telefon (yoki email) tasdiqlanganini 30 daqiqa saqlaydi
// ev — email kod orqali tasdiqlangan (kod emailga yuborilgan)
const ticketFor = (phone, email = null, ev = false) => {
  const body = Buffer.from(JSON.stringify({ phone, email: email || undefined, ev: ev || undefined, exp: Date.now() + 30 * 60000 })).toString('base64url');
  return `${body}.${sha(`reg:${body}`)}`;
};
function readTicket(tk) {
  const [body, sig] = String(tk || '').split('.');
  if (!body || sig !== sha(`reg:${body}`)) fail(422, 'err.otp_invalid');
  const d = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (d.exp < Date.now()) fail(422, 'err.otp_invalid');
  return { phone: d.phone, email: d.email || null, emailVerified: Boolean(d.ev) };
}
// Ro'yxatdan o'tish kodi qayerga yuboriladi: email (SMTP sozlangan bo'lsa), aks holda SMS
const regChannel = () => (require('../lib/mail').enabled() ? 'email' : 'sms');
const emailTaken = (email) => Boolean(email && db.get('SELECT 1 FROM users WHERE email = ? COLLATE NOCASE', email));

// ---------- SMS orqali tezkor kirish (yangi foydalanuvchi — "mijoz") ----------
r.post('/auth/otp/request', authLimit, async (req, res) => {
  const p = phoneOf(req);
  const exists = Boolean(db.get('SELECT 1 FROM users WHERE phone = ?', p.e164));
  const sent = await sendCode(req, p.e164, 'sms.otp', { isNew: !exists });
  res.json({ phone: p.e164, country: p.country, expires_in: config.otpTtlSec, exists, ...sent });
});

r.post('/auth/otp/verify', authLimit, (req, res) => {
  const p = phoneOf(req);
  consumeCode(p.e164, req.body?.code);
  let user = db.get('SELECT * FROM users WHERE phone = ?', p.e164);
  const isNew = !user;
  if (!user) {
    const name = typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 80) : null;
    const id = db.insert('users', { phone: p.e164, name, country: p.country, lang: req.lang, currency: COUNTRY[p.country].currency });
    user = db.get('SELECT * FROM users WHERE id = ?', id);
  }
  const bonus = isNew ? require('../lib/wallet').welcomeBonus(user.id) : null;
  signIn(req, res, user, { is_new: isNew, welcome_bonus: bonus });
});

// ---------- Ro'yxatdan o'tish ----------
r.post('/auth/register/start', authLimit, async (req, res) => {
  if (config.registrationOpen === false) fail(403, 'err.registration_closed');
  const p = phoneOf(req);
  if (db.get('SELECT 1 FROM users WHERE phone = ?', p.e164)) fail(409, 'err.already_registered');
  const email = emailOf(req.body?.email);
  const via = regChannel();
  if (via === 'email' && !email) fail(422, 'err.validation', { email: 'required' });
  if (email && emailTaken(email)) fail(409, 'err.email_taken', { email: 'taken' });
  const sent = await sendCode(req, p.e164, 'sms.otp', { isNew: true, email: email || null, via });
  res.json({ phone: p.e164, country: p.country, channel: via, email: email || null, expires_in: config.otpTtlSec, ...sent });
});

r.post('/auth/register/verify', authLimit, (req, res) => {
  const p = phoneOf(req);
  if (db.get('SELECT 1 FROM users WHERE phone = ?', p.e164)) fail(409, 'err.already_registered');
  const email = emailOf(req.body?.email);
  const via = regChannel();
  if (via === 'email' && !email) fail(422, 'err.validation', { email: 'required' });
  consumeCode(p.e164, req.body?.code, via === 'email' ? email : null);
  res.json({ ticket: ticketFor(p.e164, email, via === 'email'), phone: p.e164, country: p.country, email: email || null });
});

r.post('/auth/register', authLimit, (req, res) => {
  const { phone, email: ticketEmail, emailVerified } = readTicket(req.body?.ticket);
  if (db.get('SELECT 1 FROM users WHERE phone = ?', phone)) fail(409, 'err.already_registered');
  const country = normalizePhone(phone).country;
  const v = validate(req.body, {
    account_type: { type: 'enum', values: ACCOUNT_TYPES, required: true },
    name: { type: 'string', min: 2, max: 80, required: true },
    email: { type: 'string', max: 120, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    username: { type: 'string', max: 32 },
    password: { type: 'string', max: 128 },
    lang: { type: 'enum', values: LANGS },
  });
  if (v.username !== undefined) {
    v.username = String(v.username).trim() || null;
    if (v.username && !USERNAME.test(v.username)) fail(422, 'err.validation', { username: 'invalid' });
    if (v.username && db.get('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE', v.username)) fail(409, 'err.username_taken', { username: 'taken' });
  }
  if (v.password) assertStrong(v.password);
  // 1-qadamda kiritilgan (kod yuborilgan) email ustun turadi
  if (ticketEmail) v.email = ticketEmail;
  if (emailTaken(v.email)) fail(409, 'err.email_taken', { email: 'taken' });
  const b = req.body || {};
  // Kompaniya ma'lumotlarini oldindan tekshirish (foydalanuvchi yaratilishidan oldin)
  let company = null;
  if (v.account_type === 'company') {
    if (b.company && typeof b.company.tin === 'string') b.company.tin = b.company.tin.replace(/\s+/g, '');
    company = validate(b.company, {
      name: { type: 'string', min: 2, max: 120, required: true },
      activities: { type: 'array', max: 6 },
      tin: { type: 'string', max: 20, pattern: /^[0-9A-Za-z-]{5,20}$/ },
      region: { type: 'string', max: 40 },
      city: { type: 'string', max: 80 },
      address: { type: 'string', max: 200 },
    });
    // Ro'yxatdan o'tishda faqat: ism, firma nomi, telefon, manzil, YaTT/MChJ va guvohnoma (qolgani — keyin profilda)
    company.activities = (company.activities || []).filter((a) => ACTIVITIES.includes(a));
    if (company.region && !isValidRegion(country, company.region)) fail(422, 'err.validation', { region: 'invalid' });
    // Tashkiliy-huquqiy shakl (YaTT, MChJ, ИП, ТОО ...) va mamlakatga xos rekvizitlar
    const lf = String(b.company?.legal_form || '');
    if (!legal.formOf(country, lf)) fail(422, 'err.validation', { legal_form: 'required' });
    const rq = legal.validateRequisites(country, lf, b.company);
    if (Object.keys(rq.errors).length) fail(422, 'err.validation', rq.errors);
    delete company.tin;
    Object.assign(company, rq.values, { legal_form: lf });
  }
  const id = db.tx(() => {
    const uid = db.insert('users', {
      phone, name: v.name, email: v.email, username: v.username || null, email_verified_at: ticketEmail && emailVerified ? new Date().toISOString() : null, country, lang: v.lang || req.lang, currency: COUNTRY[country].currency,
      account_type: v.account_type, password_hash: v.password ? hashPassword(v.password) : null,
      password_set_at: v.password ? new Date().toISOString() : null, city: company?.city || b.specialist?.city,
    });
    if (company) db.insert('companies', { owner_id: uid, ...company, country, phone });
    if (v.account_type === 'mechanic' || v.account_type === 'driver') {
      upsertSpecialist(db.get('SELECT * FROM users WHERE id = ?', uid), v.account_type, b.specialist || {});
    }
    for (const slug of Array.isArray(b.interests) ? b.interests.slice(0, 30) : []) {
      const c = cats.find(slug);
      if (c) db.run('INSERT OR IGNORE INTO user_interests (user_id, category_id) VALUES (?, ?)', uid, c.id);
    }
    return uid;
  });
  res.status(201);
  const bonus = require('../lib/wallet').welcomeBonus(id);
  signIn(req, res, db.get('SELECT * FROM users WHERE id = ?', id), { is_new: true, welcome_bonus: bonus });
});

// ---------- Parol bilan kirish va tiklash ----------
r.post('/auth/login', loginLimit, async (req, res) => {
  const login = String(req.body?.login || '').trim();
  let user;
  let p;
  if (login && USERNAME.test(login)) {
    user = db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', login);
    p = { e164: user?.phone };
  } else {
    if (login && !req.body?.phone) req.body.phone = login;
    p = phoneOf(req);
    user = db.get('SELECT * FROM users WHERE phone = ?', p.e164);
  }
  // Hisob bor-yo'qligini oshkor qilmaslik uchun bir xil xato
  if (!user || !checkPassword(String(req.body?.password || ''), user.password_hash)) fail(401, 'err.wrong_password');
  // Admin va moderator uchun ikki bosqichli kirish: paroldan keyin SMS-kod
  if (config.adminTwoFactor && (user.role === 'admin' || user.role === 'moderator')) {
    if (!req.body?.code) return res.json({ two_factor: true, phone: p.e164, expires_in: config.otpTtlSec, ...(await sendCode(req, p.e164)) });
    consumeCode(p.e164, req.body.code);
  }
  signIn(req, res, user);
});

r.post('/auth/password/forgot', authLimit, async (req, res) => {
  const p = phoneOf(req);
  if (!db.get('SELECT 1 FROM users WHERE phone = ?', p.e164)) fail(404, 'err.no_account');
  res.json({ phone: p.e164, expires_in: config.otpTtlSec, ...(await sendCode(req, p.e164, 'sms.reset')) });
});

r.post('/auth/password/reset', authLimit, (req, res) => {
  const p = phoneOf(req);
  const user = db.get('SELECT * FROM users WHERE phone = ?', p.e164);
  if (!user) fail(404, 'err.no_account');
  assertStrong(req.body?.password);
  consumeCode(p.e164, req.body?.code);
  db.run(`UPDATE users SET password_hash = ?, password_set_at = datetime('now') WHERE id = ?`, hashPassword(req.body.password), user.id);
  // Parol tiklanganda boshqa qurilmalardagi sessiyalar yopiladi
  db.run('DELETE FROM sessions WHERE user_id = ?', user.id);
  signIn(req, res, user);
});

r.put('/me/password', requireAuth, (req, res) => {
  const u = req.user;
  if (u.password_hash && !checkPassword(String(req.body?.current_password || ''), u.password_hash)) fail(401, 'err.wrong_password');
  assertStrong(req.body?.password);
  db.run(`UPDATE users SET password_hash = ?, password_set_at = datetime('now') WHERE id = ?`, hashPassword(req.body.password), u.id);
  db.run('DELETE FROM sessions WHERE user_id = ? AND id != ?', u.id, req.sessionId);
  res.json({ ok: true });
});

// ---------- Sessiyalar ----------
r.post('/auth/logout', requireAuth, (req, res) => {
  db.run('DELETE FROM sessions WHERE id = ?', req.sessionId);
  res.json({ ok: true });
});

r.get('/auth/sessions', requireAuth, (req, res) => {
  const rows = db.all('SELECT id, device, ip, created_at, last_used_at FROM sessions WHERE user_id = ? ORDER BY last_used_at DESC', req.user.id);
  res.json(rows.map((s) => ({ ...s, current: s.id === req.sessionId })));
});

r.delete('/auth/sessions/:id', requireAuth, (req, res) => {
  const n = db.run('DELETE FROM sessions WHERE id = ? AND user_id = ?', Number(req.params.id), req.user.id).changes;
  if (!n) notFound();
  res.json({ ok: true });
});

r.post('/auth/sessions/revoke-others', requireAuth, (req, res) => {
  const n = db.run('DELETE FROM sessions WHERE user_id = ? AND id != ?', req.user.id, req.sessionId).changes;
  res.json({ revoked: Number(n) });
});

// ---------- Profil ----------
r.get('/me', requireAuth, (req, res) => {
  res.json(userView(req.user));
});

r.patch('/me', requireAuth, (req, res) => {
  const b = req.body || {};
  const v = validate(b, {
    name: { type: 'string', min: 2, max: 80 },
    email: { type: 'string', max: 120, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    username: { type: 'string', max: 32 },
    lang: { type: 'enum', values: LANGS },
    country: { type: 'enum', values: Object.keys(COUNTRY) },
    currency: { type: 'enum', values: CURRENCY_CODES },
    city: { type: 'string', max: 80 },
    position: { type: 'string', max: 80 },
    auto_reply: { type: 'string', max: 1000 },
    auto_reply_on: { type: 'bool' },
    account_type: { type: 'enum', values: ACCOUNT_TYPES },
  }, { partial: true });
  const n = b.notifications || {};
  if (v.username !== undefined) {
    v.username = String(v.username).trim() || null;
    if (v.username && !USERNAME.test(v.username)) fail(422, 'err.validation', { username: 'invalid' });
    if (v.username && db.get('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE AND id != ?', v.username, req.user.id)) fail(409, 'err.username_taken', { username: 'taken' });
  }
  db.update('users', req.user.id, {
    ...v,
    notify_messages: n.messages === undefined ? undefined : n.messages ? 1 : 0,
    notify_orders: n.orders === undefined ? undefined : n.orders ? 1 : 0,
    notify_prices: n.prices === undefined ? undefined : n.prices ? 1 : 0,
    notify_news: n.news === undefined ? undefined : n.news ? 1 : 0,
  });
  res.json(userView(db.get('SELECT * FROM users WHERE id = ?', req.user.id)));
});

// Qiziqishlar: bo'limlar ro'yxati (slug)
r.put('/me/interests', requireAuth, (req, res) => {
  const slugs = Array.isArray(req.body?.categories) ? req.body.categories.slice(0, 60) : [];
  db.tx(() => {
    db.run('DELETE FROM user_interests WHERE user_id = ?', req.user.id);
    for (const s of slugs) {
      const c = cats.find(s);
      if (c) db.run('INSERT OR IGNORE INTO user_interests (user_id, category_id) VALUES (?, ?)', req.user.id, c.id);
    }
  });
  res.json(userView(db.get('SELECT * FROM users WHERE id = ?', req.user.id)));
});

r.post('/me/avatar', requireAuth, upload.avatars.single('file'), async (req, res) => {
  if (!req.file) fail(422, 'err.file_type');
  await upload.optimize(upload.verifyFiles([req.file]), 'avatars');
  upload.removeUpload(req.user.avatar);
  db.update('users', req.user.id, { avatar: `avatars/${req.file.filename}` });
  res.json(userView(db.get('SELECT * FROM users WHERE id = ?', req.user.id)));
});

module.exports = { USERNAME, router: r, userView, hashPassword, checkPassword };

