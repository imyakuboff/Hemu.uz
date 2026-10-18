// Diler fidi: sotuvchi o'z Excel/CSV faylining havolasini beradi — e'lonlar har kuni avtomatik yangilanadi.
//
//  - Har qatorda `external_id` (yoki id / sku / artikul / code) — shu bo'yicha e'lon topiladi;
//    bo'lmasa, nom + artikul + model'dan barqaror kalit hosil qilinadi
//  - Yangi qator — yangi e'lon (rasmlari `photos` ustunidagi havolalardan yuklanadi) va nashr qilinadi
//  - Bor qator — narx, tavsif va boshqa maydonlar yangilanadi, muddati uzaytiriladi
//  - Faylda yo'qolgan qator — e'lon arxivga o'tadi (keyin qaytsa, qayta nashr qilinadi)
//
// E'lonlar oddiy API orqali yaratiladi (validatsiya, moderatsiya, tarif chegaralari bir xil ishlaydi).
const crypto = require('node:crypto');
const dns = require('node:dns').promises;
const net = require('node:net');
const db = require('../db');
const config = require('../config');

const MAX_FILE = 10 * 1024 * 1024;
const MAX_PHOTO = 8 * 1024 * 1024;
const MAX_ROWS = 1000;
const MAX_PHOTOS = 6;
const ID_COLS = ['external_id', 'id', 'sku', 'artikul', 'code', 'kod', 'код', 'артикул'];
const PHOTO_COLS = ['photos', 'photo', 'images', 'image', 'rasm', 'rasmlar', 'фото'];
// Fid boshqaradigan maydonlar (qolganlarini sotuvchi saytda o'zi o'zgartiradi)
const SYNC_FIELDS = ['title', 'description', 'price', 'currency', 'price_unit', 'condition', 'brand', 'model', 'year', 'hours', 'power_hp', 'part_number', 'manufacturer', 'stock_qty', 'warranty_months', 'compatibility', 'negotiable', 'leasing', 'with_operator', 'region', 'city', 'address'];

// ---------- Xavfsiz yuklab olish (SSRF himoyasi: ichki tarmoq manzillari taqiqlangan) ----------
function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const x = ip.toLowerCase();
  return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80') || x.startsWith('::ffff:127.') || x.startsWith('::ffff:10.') || x.startsWith('::ffff:192.168.');
}

async function assertPublic(url) {
  let u;
  try { u = new URL(url); } catch { throw new Error('URL noto\'g\'ri'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Faqat http/https havola');
  if (u.username || u.password) throw new Error('Havolada login/parol bo\'lmasin');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  // Testlarda mahalliy server ishlatiladi (faqat NODE_ENV=test)
  const allowLocal = process.env.NODE_ENV === 'test' && process.env.FEED_ALLOW_PRIVATE === '1';
  if (!addrs.length || (!allowLocal && addrs.some((a) => privateIp(a.address)))) throw new Error('Ichki tarmoq manziliga ruxsat yo\'q');
  return u;
}

// Yo'naltirishlar qo'lda kuzatiladi — har bir qadam qayta tekshiriladi
async function safeFetch(url, maxBytes, { accept } = {}) {
  let current = url;
  for (let hop = 0; hop < 4; hop += 1) {
    await assertPublic(current);
    const r = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'HEMU.UZ feed bot', ...(accept ? { Accept: accept } : {}) } });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      current = new URL(r.headers.get('location'), current).href;
      continue;
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    if (Number(r.headers.get('content-length') || 0) > maxBytes) throw new Error('Fayl juda katta');
    const chunks = [];
    let size = 0;
    for await (const c of r.body) {
      size += c.length;
      if (size > maxBytes) throw new Error('Fayl juda katta');
      chunks.push(c);
    }
    return { buf: Buffer.concat(chunks), type: r.headers.get('content-type') || '' };
  }
  throw new Error("Juda ko'p yo'naltirish");
}

// Google Sheets / Drive havolalarini to'g'ridan-to'g'ri yuklab olish havolasiga aylantirish
function normalizeUrl(url) {
  const s = String(url || '').trim();
  const sheet = s.match(/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/);
  if (sheet && !/export\?/.test(s)) {
    const gid = s.match(/[#&?]gid=(\d+)/)?.[1];
    return `https://docs.google.com/spreadsheets/d/${sheet[1]}/export?format=xlsx${gid ? `&gid=${gid}` : ''}`;
  }
  const drive = s.match(/drive\.google\.com\/file\/d\/([\w-]+)/);
  if (drive) return `https://drive.google.com/uc?export=download&id=${drive[1]}`;
  return s;
}

// ---------- Ichki API (sotuvchi nomidan) ----------
function apiClient(userId, port = config.port) {
  const { createSession } = require('./auth');
  const token = createSession(userId, { get: () => 'HEMU.UZ feed', ip: '127.0.0.1' });
  const base = `http://127.0.0.1:${port}/api/v1`;
  const call = async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, body: j };
  };
  const upload = async (id, files) => {
    const fd = new FormData();
    for (const f of files) fd.append('files', new Blob([f.buf], { type: f.type }), f.name);
    const r = await fetch(`${base}/listings/${id}/photos`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
    return r.ok;
  };
  const close = () => db.run('DELETE FROM sessions WHERE token_hash = ?', require('./auth').sha(token));
  return { call, upload, close };
}

const pickCol = (o, cols) => { for (const c of cols) if (o[c]) return String(o[c]).trim(); return ''; };
const stableKey = (b) => `k:${crypto.createHash('sha1').update([b.title, b.part_number, b.model, b.year].map((x) => String(x || '').toLowerCase()).join('|')).digest('hex').slice(0, 16)}`;
// Bazadagi qiymat va fiddagi qiymat bir xilmi (raqam, mantiqiy, ro'yxat)
function same(a, b) {
  if (Array.isArray(b)) { try { return JSON.stringify(JSON.parse(a || '[]')) === JSON.stringify(b); } catch { return false; } }
  if (typeof b === 'boolean') return Boolean(a) === b;
  if (a === null || a === undefined) return b === '' || b === null || b === undefined;
  if (typeof a === 'number' || /^-?\d+(\.\d+)?$/.test(String(b))) return Number(a) === Number(b);
  return String(a).trim() === String(b).trim();
}
const IMG = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

async function downloadPhotos(list) {
  const out = [];
  for (const url of list.slice(0, MAX_PHOTOS)) {
    try {
      const { buf, type } = await safeFetch(url, MAX_PHOTO, { accept: 'image/*' });
      const mime = Object.keys(IMG).find((m) => type.startsWith(m));
      if (mime) out.push({ buf, type: mime, name: `photo.${IMG[mime]}` });
    } catch { /* bitta rasm yuklanmasa — qolganlari bilan davom etiladi */ }
  }
  return out;
}

// ---------- Sinxronlash ----------
async function syncFeed(feedId, { port } = {}) {
  const feed = db.get('SELECT * FROM listing_feeds WHERE id = ?', feedId);
  if (!feed) return null;
  const { readTable, rowToBody } = require('../routes/tools');
  const stats = { rows: 0, created: 0, updated: 0, archived: 0, restored: 0, errors: [] };
  let client = null;
  try {
    const { buf } = await safeFetch(normalizeUrl(feed.url), MAX_FILE);
    const { head, data } = readTable(buf);
    if (!head.includes('title')) throw new Error("Faylda 'title' ustuni yo'q — namunaviy shablondan foydalaning");
    client = apiClient(feed.user_id, port);
    const seen = new Set();
    for (const { n, cells } of data.slice(0, MAX_ROWS)) {
      stats.rows += 1;
      const raw = Object.fromEntries(head.map((h, j) => [h, String(cells[j] ?? '').trim()]));
      const body = rowToBody(head, cells);
      const photos = pickCol(raw, PHOTO_COLS).split(/[\s,;|]+/).filter((u) => /^https?:\/\//i.test(u));
      for (const c of [...ID_COLS, ...PHOTO_COLS, 'publish']) delete body[c];
      const ext = (pickCol(raw, ID_COLS) || stableKey(body)).slice(0, 80);
      if (seen.has(ext)) continue;
      seen.add(ext);
      const have = db.get('SELECT id, status FROM listings WHERE user_id = ? AND external_id = ?', feed.user_id, ext);
      try {
        if (have) {
          if (['deleted', 'sold'].includes(have.status)) continue;
          // Faqat haqiqatan o'zgargan maydonlar yuboriladi (keraksiz qayta moderatsiyaning oldini olish)
          const cur = db.get('SELECT * FROM listings WHERE id = ?', have.id);
          const patch = Object.fromEntries(Object.entries(body).filter(([k, v]) => SYNC_FIELDS.includes(k) && !same(cur[k], v)));
          if (Object.keys(patch).length) {
            const r = await client.call('PATCH', `/listings/${have.id}`, patch);
            if (!r.ok) { stats.errors.push({ row: n, error: r.body.error?.message || r.status }); continue; }
          }
          if (have.status === 'archived' && db.get('SELECT feed_archived FROM listings WHERE id = ?', have.id).feed_archived) {
            const p = await client.call('POST', `/listings/${have.id}/publish`, {});
            if (p.ok) { stats.restored += 1; db.run('UPDATE listings SET feed_archived = 0 WHERE id = ?', have.id); }
          } else if (have.status === 'active') {
            db.run(`UPDATE listings SET expires_at = datetime('now', '+30 days') WHERE id = ?`, have.id);
          }
          stats.updated += 1;
        } else {
          const r = await client.call('POST', '/listings', body);
          if (!r.ok) { stats.errors.push({ row: n, error: r.body.error?.message || r.status, details: r.body.error?.details }); continue; }
          db.run('UPDATE listings SET external_id = ?, feed_id = ? WHERE id = ?', ext, feed.id, r.body.id);
          const files = await downloadPhotos(photos);
          if (files.length) await client.upload(r.body.id, files);
          const p = await client.call('POST', `/listings/${r.body.id}/publish`, {});
          if (!p.ok) stats.errors.push({ row: n, warning: p.body.error?.message, details: p.body.error?.details, id: r.body.id });
          stats.created += 1;
        }
      } catch (e) {
        stats.errors.push({ row: n, error: e.message });
      }
    }
    // Faylda endi yo'q — arxivga (faqat shu fiddan kelganlari)
    for (const l of db.all(`SELECT id, external_id FROM listings WHERE user_id = ? AND feed_id = ? AND status IN ('active', 'moderation')`, feed.user_id, feed.id)) {
      if (seen.has(l.external_id)) continue;
      const r = await client.call('POST', `/listings/${l.id}/archive`, {});
      if (r.ok) { db.run('UPDATE listings SET feed_archived = 1 WHERE id = ?', l.id); stats.archived += 1; }
    }
    stats.errors = stats.errors.slice(0, 50);
    db.run(`UPDATE listing_feeds SET last_run_at = datetime('now'), last_status = 'ok', last_error = NULL, stats = ? WHERE id = ?`, JSON.stringify(stats), feed.id);
    if (stats.created || stats.archived || stats.restored) {
      require('./notify').notify(feed.user_id, 'feed_synced', { created: stats.created, updated: stats.updated, archived: stats.archived }, '/my/import');
    }
  } catch (e) {
    db.run(`UPDATE listing_feeds SET last_run_at = datetime('now'), last_status = 'error', last_error = ?, stats = ? WHERE id = ?`, String(e.message).slice(0, 300), JSON.stringify(stats), feed.id);
  } finally {
    client?.close();
  }
  return db.get('SELECT * FROM listing_feeds WHERE id = ?', feed.id);
}

let running = false;
// Kuniga bir marta har bir faol fid (soatlik tekshiruvdan chaqiriladi)
async function runDue() {
  if (running) return;
  running = true;
  try {
    for (const f of db.all(`SELECT id FROM listing_feeds WHERE active = 1 AND (last_run_at IS NULL OR last_run_at < datetime('now', '-23 hours')) LIMIT 20`)) {
      await syncFeed(f.id);
    }
  } finally {
    running = false;
  }
}

module.exports = { syncFeed, runDue, normalizeUrl, assertPublic, privateIp };
