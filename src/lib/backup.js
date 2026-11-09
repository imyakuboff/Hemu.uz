// Bazaning izchil zaxira nusxasi (VACUUM INTO — WAL rejimida ham butun nusxa), kunlik.
// Ixtiyoriy: Telegram'ga bog'langan adminlarga fayl sifatida yuboriladi (server yo'qolsa ham nusxa qoladi).
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const db = require('../db');
const config = require('../config');

const KEEP = 14;
const dir = () => process.env.BACKUP_DIR || path.join(path.dirname(config.dbFile), 'backups');

function backupNow() {
  if (config.dbFile === ':memory:') return null;
  fs.mkdirSync(dir(), { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const raw = path.join(dir(), `hemu-${stamp}.db`);
  fs.rmSync(raw, { force: true });
  db.exec(`VACUUM INTO '${raw.replace(/'/g, "''")}'`);
  const gz = `${raw}.gz`;
  fs.writeFileSync(gz, zlib.gzipSync(fs.readFileSync(raw), { level: 9 }));
  fs.rmSync(raw, { force: true });
  fs.chmodSync(gz, 0o600);
  const old = fs.readdirSync(dir()).filter((f) => /^hemu-.*\.db\.gz$/.test(f)).sort().reverse().slice(KEEP);
  for (const f of old) fs.rmSync(path.join(dir(), f), { force: true });
  return gz;
}

async function sendToAdmins(file) {
  if (!config.telegramToken || !config.backupTelegram) return 0;
  const size = fs.statSync(file).size;
  if (size > 45 * 1024 * 1024) return 0; // Telegram cheklovi 50 MB
  const chats = db.all(`SELECT tl.chat_id FROM telegram_links tl JOIN users u ON u.id = tl.user_id WHERE u.role = 'admin' AND u.blocked = 0`);
  let n = 0;
  for (const { chat_id: chatId } of chats) {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('caption', `HEMU.UZ zaxira: ${path.basename(file)} (${Math.round(size / 1024)} KB)`);
    form.append('document', new Blob([fs.readFileSync(file)]), path.basename(file));
    const r = await fetch(`https://api.telegram.org/bot${config.telegramToken}/sendDocument`, { method: 'POST', body: form, signal: AbortSignal.timeout(120000) });
    if (r.ok) n += 1;
  }
  return n;
}

async function daily() {
  const file = backupNow();
  if (file) {
    console.log(`[backup] ${file}`);
    await sendToAdmins(file).catch((e) => console.warn('[backup] telegram:', e.message));
  }
}

module.exports = { backupNow, daily, dir };
