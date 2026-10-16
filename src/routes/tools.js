const { Router } = require('express');
const multer = require('multer');
const db = require('../db');
const tg = require('../lib/telegram');
const { requireAuth } = require('../lib/auth');
const { fail, validate } = require('../lib/http');

const r = Router();

// ---------- Telegram ----------
r.get('/me/telegram', requireAuth, (req, res) => res.json(tg.info(req.user.id)));
r.post('/me/telegram/link', requireAuth, (req, res) => {
  if (!tg.info(req.user.id).enabled) fail(503, 'err.not_configured', { service: 'telegram' });
  res.json(tg.newLinkCode(req.user.id));
});
r.delete('/me/telegram', requireAuth, (req, res) => {
  db.run('DELETE FROM telegram_links WHERE user_id = ?', req.user.id);
  res.json({ ok: true });
});
r.patch('/me/telegram', requireAuth, (req, res) => {
  db.run('UPDATE users SET notify_telegram = ? WHERE id = ?', req.body?.notify ? 1 : 0, req.user.id);
  res.json(tg.info(req.user.id));
});

// ---------- Chat shablonlari ----------
r.get('/me/templates', requireAuth, (req, res) => res.json(db.all('SELECT id, text FROM message_templates WHERE user_id = ? ORDER BY id', req.user.id)));
r.post('/me/templates', requireAuth, (req, res) => {
  const v = validate(req.body, { text: { type: 'string', min: 2, max: 1000, required: true } });
  if (db.get('SELECT COUNT(*) AS n FROM message_templates WHERE user_id = ?', req.user.id).n >= 30) fail(429, 'err.too_many');
  const id = db.insert('message_templates', { user_id: req.user.id, text: v.text });
  res.status(201).json({ id, text: v.text });
});
r.delete('/me/templates/:id', requireAuth, (req, res) => {
  db.run('DELETE FROM message_templates WHERE id = ? AND user_id = ?', Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

// ---------- Ommaviy yuklash (CSV) ----------
const COLS = ['deal_type', 'category', 'subcategory', 'title', 'description', 'price', 'currency', 'price_unit', 'condition', 'brand', 'model', 'year', 'hours', 'power_hp', 'part_number', 'manufacturer', 'stock_qty', 'warranty_months', 'compatibility', 'region', 'city', 'address', 'serial_number'];

// Oddiy CSV o'quvchi: qo'shtirnoq, vergul yoki nuqtali vergul, BOM
function parseCsv(text) {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (q) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

r.get('/my/listings/import/template', requireAuth, (_req, res) => {
  const sample = ['sale', 'parts', 'filters', 'Фильтр топливный JCB 32/925869', 'Оригинальный топливный фильтр JCB. Заводская упаковка, отгрузка в день оплаты.', '350000', 'UZS', 'total', 'new', 'JCB', '', '', '', '', '32/925869', 'JCB', '15', '12', 'JCB 3CX;JCB 4CX', 'tashkent', 'Ташкент', '', ''];
  const esc = (s) => (/[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="movexgo-import.csv"' });
  res.send(`﻿${COLS.join(',')}\n${sample.map(esc).join(',')}\n`);
});

const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
r.post('/my/listings/import', requireAuth, csvUpload.single('file'), async (req, res) => {
  if (!req.file) fail(422, 'err.file_type');
  const rows = parseCsv(req.file.buffer.toString('utf8'));
  if (rows.length < 2) fail(422, 'err.validation', { file: 'empty' });
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const publish = req.body?.publish === '1' || req.body?.publish === 'true';
  // E'lon yaratish uchun ichki API (validatsiya, moderatsiya va chegaralar bir xil ishlaydi)
  const base = `http://127.0.0.1:${req.socket.localPort}/api/v1`;
  const headers = { Authorization: req.get('authorization'), 'Content-Type': 'application/json', 'X-Lang': req.lang };
  const results = [];
  for (const [i, row] of rows.slice(1, 201).entries()) {
    const o = Object.fromEntries(head.map((h, j) => [h, (row[j] ?? '').trim()]));
    const body = { ...o, publish: false };
    if (o.compatibility) body.compatibility = o.compatibility.split(/[;|]/).map((s) => s.trim()).filter(Boolean);
    for (const k of Object.keys(body)) if (body[k] === '') delete body[k];
    try {
      const cr = await fetch(`${base}/listings`, { method: 'POST', headers, body: JSON.stringify(body) });
      const cj = await cr.json();
      if (!cr.ok) { results.push({ row: i + 2, ok: false, error: cj.error?.message, details: cj.error?.details }); continue; }
      // Rasmlar keyin "Мои объявления" orqali qo'shiladi (server tashqi URL'larni yuklamaydi — SSRF xavfi)
      let status = 'draft';
      if (publish) {
        const pr = await fetch(`${base}/listings/${cj.id}/publish`, { method: 'POST', headers, body: '{}' });
        const pj = await pr.json();
        status = pr.ok ? pj.status : 'draft';
        if (!pr.ok) { results.push({ row: i + 2, ok: true, id: cj.id, status, warning: pj.error?.message, details: pj.error?.details }); continue; }
      }
      results.push({ row: i + 2, ok: true, id: cj.id, status });
    } catch (e) {
      results.push({ row: i + 2, ok: false, error: e.message });
    }
  }
  res.json({ total: results.length, created: results.filter((x) => x.ok).length, results });
});

// ---------- Kengaytirilgan statistika ----------
r.get('/seller/analytics', requireAuth, (req, res) => {
  const me = req.user.id;
  const days = Math.min(365, Math.max(7, Number(req.query.days) || 30));
  const since = `-${days} days`;
  const s = db.get(
    `SELECT COALESCE(SUM(s.views), 0) AS views, COALESCE(SUM(s.phone_reveals), 0) AS phones, COALESCE(SUM(s.favorites), 0) AS favs
     FROM listing_stats s JOIN listings l ON l.id = s.listing_id WHERE l.user_id = ? AND s.day > date('now', ?)`,
    me, since,
  );
  const n = (sql) => db.get(sql, me, since).n;
  const funnel = [
    ['views', s.views],
    ['phone_reveals', s.phones],
    ['favorites', s.favs],
    ['conversations', n(`SELECT COUNT(*) AS n FROM conversations WHERE seller_id = ? AND created_at > datetime('now', ?)`)],
    ['leads', n(`SELECT COUNT(*) AS n FROM leads WHERE seller_id = ? AND created_at > datetime('now', ?)`)],
    ['orders', n(`SELECT COUNT(*) AS n FROM orders WHERE seller_id = ? AND created_at > datetime('now', ?)`)],
    ['bookings', n(`SELECT COUNT(*) AS n FROM bookings WHERE seller_id = ? AND created_at > datetime('now', ?)`)],
  ].map(([key, value]) => ({ key, value }));
  const sources = db.all(
    `SELECT v.source, SUM(v.n) AS n FROM listing_view_sources v JOIN listings l ON l.id = v.listing_id
     WHERE l.user_id = ? AND v.day > date('now', ?) GROUP BY v.source ORDER BY n DESC`,
    me, since,
  );
  const top = db.all(
    `SELECT l.id, l.title, COALESCE(SUM(s.views), 0) AS views, COALESCE(SUM(s.phone_reveals), 0) AS phones,
       (SELECT COUNT(*) FROM conversations c WHERE c.listing_id = l.id AND c.created_at > datetime('now', ?)) AS chats
     FROM listings l LEFT JOIN listing_stats s ON s.listing_id = l.id AND s.day > date('now', ?)
     WHERE l.user_id = ? AND l.status = 'active' GROUP BY l.id ORDER BY views DESC LIMIT 10`,
    since, since, me,
  ).map((x) => ({ ...x, conversion: x.views ? Math.round(((x.phones + x.chats) / x.views) * 1000) / 10 : 0 }));
  const daily = db.all(
    `SELECT s.day, SUM(s.views) AS views, SUM(s.phone_reveals) AS phones FROM listing_stats s JOIN listings l ON l.id = s.listing_id
     WHERE l.user_id = ? AND s.day > date('now', ?) GROUP BY s.day ORDER BY s.day`,
    me, since,
  );
  res.json({ days, funnel, sources, top, daily });
});

module.exports = { router: r, parseCsv };
