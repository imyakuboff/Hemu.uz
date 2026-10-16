const net = require('node:net');
const tls = require('node:tls');
const os = require('node:os');
const crypto = require('node:crypto');
const config = require('../config');

// Email yuborish (SMTP, tashqi kutubxonasiz). Gmail uchun:
//   host smtp.gmail.com, port 465 (SSL) yoki 587 (STARTTLS)
//   login — to'liq Gmail manzil, parol — "App password" (Google hisobi → Xavfsizlik → 2 bosqichli tasdiqlash → Ilova parollari)
// Provayder admin paneldan tanlanadi (Integratsiyalar → Email):
//   off  — o'chiq (sinov rejimida kod konsolga yoziladi)
//   smtp — SMTP orqali yuborish

const TIMEOUT = 20000;

// SMTP javobini o'qish (ko'p qatorli: "250-..." ... "250 ...")
function reader(sock) {
  let buf = '';
  let waiters = [];
  let lines = [];
  const flush = () => {
    while (waiters.length) {
      const i = lines.findIndex((l) => /^\d{3} /.test(l));
      if (i < 0) return;
      const chunk = lines.splice(0, i + 1);
      const code = Number(chunk[i].slice(0, 3));
      waiters.shift().resolve({ code, text: chunk.map((l) => l.slice(4)).join('\n') });
    }
  };
  const onData = (d) => {
    buf += d.toString('utf8');
    let k;
    while ((k = buf.indexOf('\n')) >= 0) {
      lines.push(buf.slice(0, k).replace(/\r$/, ''));
      buf = buf.slice(k + 1);
    }
    flush();
  };
  const onErr = (e) => { for (const w of waiters) w.reject(e); waiters = []; };
  sock.on('data', onData);
  sock.on('error', onErr);
  sock.on('close', () => onErr(new Error('SMTP: ulanish uzildi')));
  return {
    next: () => new Promise((resolve, reject) => { waiters.push({ resolve, reject }); flush(); }),
    detach: () => { sock.off('data', onData); sock.off('error', onErr); },
  };
}

function connect({ host, port }) {
  return new Promise((resolve, reject) => {
    const secure = Number(port) === 465;
    const sock = secure ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
    sock.setTimeout(TIMEOUT, () => sock.destroy(new Error('SMTP: vaqt tugadi')));
    sock.once(secure ? 'secureConnect' : 'connect', () => resolve({ sock, secure }));
    sock.once('error', reject);
  });
}

const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');
const wrap76 = (s) => s.replace(/.{1,76}/g, '$&\r\n').trimEnd();
// Sarlavhadagi UTF-8 matn (RFC 2047)
const encWord = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const cleanAddr = (s) => String(s || '').replace(/[\r\n<>"]/g, '').trim();

function buildMessage({ from, fromName, to, subject, text, html }) {
  const boundary = `hemu_${crypto.randomBytes(12).toString('hex')}`;
  const domain = from.split('@')[1] || 'localhost';
  const headers = [
    `From: ${fromName ? `${encWord(fromName.replace(/[\r\n"]/g, ''))} ` : ''}<${from}>`,
    `To: <${to}>`,
    `Subject: ${encWord(subject.replace(/[\r\n]/g, ' '))}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const part = (type, body) => [`--${boundary}`, `Content-Type: ${type}; charset=UTF-8`, 'Content-Transfer-Encoding: base64', '', wrap76(b64(body))].join('\r\n');
  const body = [part('text/plain', text), html ? part('text/html', html) : null, `--${boundary}--`].filter(Boolean).join('\r\n');
  // Nuqta bilan boshlanadigan qatorlar ikkilantiriladi (RFC 5321 "dot-stuffing")
  return `${headers.join('\r\n')}\r\n\r\n${body}`.replace(/^\./gm, '..');
}

async function smtpSend({ to, subject, text, html }) {
  const s = config.smtp || {};
  if (!s.host || !s.user || !s.pass) throw new Error("SMTP: server, login yoki parol kiritilmagan");
  const from = cleanAddr(s.user);
  // Google ilova parolini bo'shliqlar bilan ko'rsatadi ("abcd efgh ...") — ular olib tashlanadi
  const pass = /gmail\.com$/i.test(s.host) ? String(s.pass).replace(/\s+/g, '') : s.pass;
  const rcpt = cleanAddr(to);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rcpt)) throw new Error("SMTP: email manzil noto'g'ri");

  let { sock, secure } = await connect({ host: s.host, port: s.port || 465 });
  let rd = reader(sock);
  const cmd = async (line, ok) => {
    if (line !== null) sock.write(`${line}\r\n`);
    const r = await rd.next();
    if (!ok.includes(r.code)) throw new Error(`SMTP ${r.code}: ${r.text.split('\n')[0].slice(0, 200)}`);
    return r;
  };
  const host = os.hostname().replace(/[^a-z0-9.-]/gi, '') || 'localhost';
  try {
    await cmd(null, [220]);
    let ehlo = await cmd(`EHLO ${host}`, [250]);
    if (!secure) {
      if (!/STARTTLS/i.test(ehlo.text)) throw new Error('SMTP: server STARTTLS ni qo\'llamaydi');
      await cmd('STARTTLS', [220]);
      rd.detach();
      sock = await new Promise((resolve, reject) => {
        const t = tls.connect({ socket: sock, servername: s.host }, () => resolve(t));
        t.once('error', reject);
      });
      sock.setTimeout(TIMEOUT, () => sock.destroy(new Error('SMTP: vaqt tugadi')));
      rd = reader(sock);
      ehlo = await cmd(`EHLO ${host}`, [250]);
    }
    if (/AUTH[^\n]*PLAIN/i.test(ehlo.text)) {
      await cmd(`AUTH PLAIN ${b64(`\0${s.user}\0${pass}`)}`, [235]);
    } else {
      await cmd('AUTH LOGIN', [334]);
      await cmd(b64(s.user), [334]);
      await cmd(b64(pass), [235]);
    }
    await cmd(`MAIL FROM:<${from}>`, [250]);
    await cmd(`RCPT TO:<${rcpt}>`, [250, 251]);
    await cmd('DATA', [354]);
    const r = await cmd(`${buildMessage({ from, fromName: s.from || 'HEMU.UZ', to: rcpt, subject, text, html })}\r\n.`, [250]);
    sock.write('QUIT\r\n');
    sock.end();
    return { ok: true, provider: 'smtp', id: r.text.split(' ').pop() || null };
  } catch (e) {
    sock.destroy();
    // Gmail: 535 — login yoki ilova paroli noto'g'ri
    if (/^SMTP 535/.test(e.message)) e.message += " (Gmail uchun oddiy parol emas, 16 belgili 'App password' kerak)";
    throw e;
  }
}

const maskEmail = (e) => String(e).replace(/^(.{1,2})[^@]*(@.*)$/, '$1***$2');

function logMail(to, provider, ok, error = null) {
  try {
    const db = require('../db');
    db.run('INSERT INTO sms_log (phone, provider, ok, error) VALUES (?, ?, ?, ?)', maskEmail(to), `email:${provider}`, ok ? 1 : 0, error ? String(error).slice(0, 300) : null);
  } catch { /* jurnal ixtiyoriy */ }
}

const enabled = () => config.mailProvider === 'smtp' && Boolean(config.smtp?.host && config.smtp?.user && config.smtp?.pass);

async function sendMail(msg) {
  const provider = process.env.NODE_ENV === 'test' ? 'log' : config.mailProvider;
  if (provider !== 'smtp') {
    if (process.env.NODE_ENV !== 'test') console.log(`[email] ${msg.to}: ${msg.subject}\n${msg.text}`);
    logMail(msg.to, 'log', provider === 'log' || process.env.NODE_ENV === 'test', provider === 'off' ? 'Email o\'chiq' : null);
    if (provider === 'off' && process.env.NODE_ENV !== 'test') throw new Error("Email yuborish o'chirilgan (admin → Integratsiyalar → Email)");
    return { ok: true, provider: 'log' };
  }
  try {
    const r = await smtpSend(msg);
    logMail(msg.to, 'smtp', true);
    return r;
  } catch (e) {
    logMail(msg.to, 'smtp', false, e.message);
    throw e;
  }
}

const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Tasdiqlash kodi xati (HTML + oddiy matn), foydalanuvchi tilida
function codeEmail(lang, code) {
  const { t } = require('../i18n');
  const rtl = lang === 'prs' || lang === 'ps';
  const subject = t(lang, 'mail.otp_subject', { code });
  const intro = t(lang, 'mail.otp_intro');
  const ttl = t(lang, 'mail.otp_ttl', { min: Math.round(config.otpTtlSec / 60) });
  const ignore = t(lang, 'mail.otp_ignore');
  const text = `${intro}\n\n${code}\n\n${ttl}\n${ignore}\n\n— HEMU.UZ`;
  const html = `<!doctype html><html dir="${rtl ? 'rtl' : 'ltr'}"><body style="margin:0;background:#f3f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f1f3d">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:#0f2a5c;padding:18px 24px;color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:.5px">HEMU<span style="color:#ffc93c">.UZ</span></td></tr>
<tr><td style="padding:28px 24px 8px;font-size:16px;line-height:1.5">${escHtml(intro)}</td></tr>
<tr><td align="center" style="padding:12px 24px"><div style="display:inline-block;background:#eef3ff;border:1px solid #d6e2ff;border-radius:12px;padding:14px 26px;font-size:34px;font-weight:bold;letter-spacing:8px;color:#0f2a5c;font-family:'Courier New',monospace">${escHtml(code)}</div></td></tr>
<tr><td style="padding:12px 24px 4px;font-size:14px;color:#55607a">${escHtml(ttl)}</td></tr>
<tr><td style="padding:4px 24px 28px;font-size:13px;color:#8a93a8">${escHtml(ignore)}</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}

module.exports = { sendMail, codeEmail, enabled, buildMessage, maskEmail };
