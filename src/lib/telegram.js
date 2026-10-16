const crypto = require('node:crypto');
const db = require('../db');
const config = require('../config');
const { t } = require('../i18n');

// Telegram Bot API: token bo'lmasa modul jim turadi
const state = { username: null, running: false, offset: 0 };
const enabled = () => Boolean(config.telegramToken);

async function call(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${config.telegramToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
    signal: AbortSignal.timeout(35000),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description}`);
  return json.result;
}

function newLinkCode(userId) {
  const code = crypto.randomBytes(9).toString('base64url');
  db.run('DELETE FROM telegram_codes WHERE user_id = ? OR expires_at < ?', userId, Date.now());
  db.insert('telegram_codes', { code, user_id: userId, expires_at: Date.now() + 15 * 60000 });
  return { code, url: state.username ? `https://t.me/${state.username}?start=${code}` : null, bot: state.username };
}

async function handleUpdate(u) {
  const msg = u.message;
  if (!msg || !msg.text) return;
  const chatId = String(msg.chat.id);
  const lang = ({ uz: 'uz', ru: 'ru', en: 'en', kk: 'kk', ky: 'ky', tg: 'tg', tk: 'tk', az: 'az', fa: 'prs', ps: 'ps' })[String(msg.from?.language_code || '').slice(0, 2)] || 'ru';
  const [cmd, arg] = msg.text.trim().split(/\s+/);
  if (cmd === '/start' && arg) {
    const row = db.get('SELECT * FROM telegram_codes WHERE code = ? AND expires_at > ?', arg, Date.now());
    if (!row) return call('sendMessage', { chat_id: chatId, text: t(lang, 'tg.bad_code') });
    db.run('DELETE FROM telegram_codes WHERE code = ?', arg);
    db.run(
      `INSERT INTO telegram_links (user_id, chat_id, username) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET chat_id = excluded.chat_id, username = excluded.username, linked_at = datetime('now')`,
      row.user_id, chatId, msg.from?.username || null,
    );
    db.run('UPDATE users SET notify_telegram = 1 WHERE id = ?', row.user_id);
    const user = db.get('SELECT name, lang FROM users WHERE id = ?', row.user_id);
    return call('sendMessage', { chat_id: chatId, text: t(user.lang, 'tg.linked', { name: user.name || '' }) });
  }
  if (cmd === '/stop') {
    const link = db.get('SELECT user_id FROM telegram_links WHERE chat_id = ?', chatId);
    if (link) db.run('UPDATE users SET notify_telegram = 0 WHERE id = ?', link.user_id);
    return call('sendMessage', { chat_id: chatId, text: t(lang, 'tg.stopped') });
  }
  return call('sendMessage', { chat_id: chatId, text: t(lang, 'tg.welcome') });
}

async function poll() {
  while (state.running) {
    try {
      const updates = await call('getUpdates', { offset: state.offset, timeout: 25, allowed_updates: ['message'] });
      for (const u of updates) {
        state.offset = u.update_id + 1;
        await handleUpdate(u).catch((e) => console.warn('[telegram]', e.message));
      }
    } catch (e) {
      if (state.running) {
        console.warn('[telegram]', e.message);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }
}

async function start() {
  if (!enabled() || state.running) return;
  try {
    const me = await call('getMe');
    state.username = me.username;
    state.running = true;
    console.log(`[telegram] @${me.username} ulandi`);
    poll();
  } catch (e) {
    console.warn('[telegram] ulanmadi:', e.message);
  }
}
function stop() { state.running = false; }

// Bildirishnomani Telegram'ga yuborish (fon rejimida, xatolar sahifani to'xtatmaydi)
function sendToUser(userId, text, link) {
  if (!state.running) return false;
  const l = db.get('SELECT tl.chat_id, u.lang, u.notify_telegram FROM telegram_links tl JOIN users u ON u.id = tl.user_id WHERE tl.user_id = ?', userId);
  if (!l || !l.notify_telegram) return false;
  const body = { chat_id: l.chat_id, text };
  if (link && /^https:\/\//.test(config.siteUrl)) {
    body.reply_markup = { inline_keyboard: [[{ text: t(l.lang, 'tg.open'), url: config.siteUrl + link }]] };
  }
  call('sendMessage', body).catch((e) => console.warn('[telegram]', e.message));
  return true;
}

function info(userId) {
  const l = db.get('SELECT username, linked_at FROM telegram_links WHERE user_id = ?', userId);
  const u = db.get('SELECT notify_telegram FROM users WHERE id = ?', userId);
  return { enabled: enabled() && state.running, bot: state.username, linked: Boolean(l), username: l?.username || null, notify: Boolean(u?.notify_telegram) };
}

module.exports = { start, stop, newLinkCode, sendToUser, info, handleUpdate, enabled };
