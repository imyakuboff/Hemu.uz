const config = require('../config');

// SMS yuborish. Provayder admin paneldan tanlanadi (Integratsiyalar → SMS):
//   log   — sinov rejimi: SMS yuborilmaydi, konsolga yoziladi
//   eskiz — Eskiz.uz (https://notify.eskiz.uz), faqat +998 raqamlar
const ESKIZ = 'https://notify.eskiz.uz/api';
let eskizToken = null;
let eskizFor = '';

const credKey = () => `${config.eskiz.email}\n${config.eskiz.password}`;

async function eskizLogin() {
  if (!config.eskiz.email || !config.eskiz.password) throw new Error('Eskiz: email yoki parol kiritilmagan');
  const body = new FormData();
  body.append('email', config.eskiz.email);
  body.append('password', config.eskiz.password);
  const r = await fetch(`${ESKIZ}/auth/login`, { method: 'POST', body, signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.data?.token) throw new Error(`Eskiz login: ${j.message || r.status}`);
  eskizToken = j.data.token;
  eskizFor = credKey();
  return eskizToken;
}

// Token 30 kun amal qiladi; login/parol o'zgarsa yoki 401 qaytsa qayta olinadi
async function eskizFetch(path, init = {}) {
  const tk = eskizToken && eskizFor === credKey() ? eskizToken : await eskizLogin();
  const go = (token) => fetch(`${ESKIZ}${path}`, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
  let r = await go(tk);
  if (r.status === 401) r = await go(await eskizLogin());
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Eskiz: ${j.message || r.status}`);
  return j;
}

async function eskizSend(phone, text) {
  const digits = String(phone).replace(/\D/g, '');
  if (!/^998\d{9}$/.test(digits)) throw new Error('Eskiz: faqat +998 raqamlarga yuboradi');
  const body = new FormData();
  body.append('mobile_phone', digits);
  body.append('message', text);
  body.append('from', config.eskiz.from || '4546');
  const j = await eskizFetch('/message/sms/send', { method: 'POST', body });
  return { ok: true, provider: 'eskiz', id: j.id || null };
}

// Eskiz hisobidagi qoldiq (admin panel uchun)
async function eskizBalance() {
  const j = await eskizFetch('/user/get-limit', { method: 'GET' });
  return j?.data?.balance ?? j?.balance ?? null;
}

function logSms(phone, provider, ok, error = null) {
  try {
    const db = require('../db');
    db.run('INSERT INTO sms_log (phone, provider, ok, error) VALUES (?, ?, ?, ?)', String(phone).replace(/(\d{3})\d{4}(\d{2})$/, '$1****$2'), provider, ok ? 1 : 0, error ? String(error).slice(0, 300) : null);
  } catch { /* jurnal ixtiyoriy */ }
}

async function sendSms(phone, text) {
  const provider = process.env.NODE_ENV === 'test' ? 'log' : config.smsProvider;
  if (provider === 'log') {
    if (process.env.NODE_ENV !== 'test') console.log(`[sms] ${phone}: ${text}`);
    logSms(phone, 'log', true);
    return { ok: true, provider: 'log' };
  }
  try {
    if (provider !== 'eskiz') throw new Error(`SMS provayder sozlanmagan: ${provider}`);
    const r = await eskizSend(phone, text);
    logSms(phone, provider, true);
    return r;
  } catch (e) {
    logSms(phone, provider, false, e.message);
    throw e;
  }
}

// Login/parol o'zgarganda tokenni unutish
function reset() { eskizToken = null; eskizFor = ''; }

module.exports = { sendSms, eskizBalance, reset };
