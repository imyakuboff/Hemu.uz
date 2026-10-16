const { Router } = require('express');
const multer = require('multer');
const db = require('../db');
const tg = require('../lib/telegram');
const { requireAuth } = require('../lib/auth');
const { fail, validate } = require('../lib/http');
const catLib = require('../lib/categories');
const { REGIONS, CURRENCY_CODES } = require('../geo');
const { readXlsx, writeXlsx, isXlsx } = require('../lib/xlsx');

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

const IMPORT_COLS = [...COLS.slice(0, 19), 'negotiable', 'leasing', 'with_operator', 'country', ...COLS.slice(19)];
// Excel shablonidagi ustun izohlari (sarlavha: "kalit | izoh")
const COL_LABELS = {
  uz: { deal_type: 'Bitim turi *', category: 'Kategoriya *', subcategory: 'Rubrika *', title: 'Nomi *', description: 'Tavsif', price: 'Narx', currency: 'Valyuta', price_unit: 'Narx birligi', condition: 'Holati', brand: 'Marka', model: 'Model', year: 'Yil', hours: 'Moto-soat', power_hp: 'Quvvat, o.k.', part_number: 'Artikul', manufacturer: 'Ishlab chiqaruvchi', stock_qty: 'Omborda, dona', warranty_months: 'Kafolat, oy', compatibility: 'Mos texnika (; bilan)', negotiable: 'Kelishiladi (ha/yo\'q)', leasing: 'Lizing (ha/yo\'q)', with_operator: 'Operator bilan (ha/yo\'q)', country: 'Mamlakat (UZ)', region: 'Viloyat', city: 'Shahar', address: 'Manzil', serial_number: 'Seriya raqami' },
  ru: { deal_type: 'Тип сделки *', category: 'Категория *', subcategory: 'Рубрика *', title: 'Название *', description: 'Описание', price: 'Цена', currency: 'Валюта', price_unit: 'Единица цены', condition: 'Состояние', brand: 'Марка', model: 'Модель', year: 'Год', hours: 'Моточасы', power_hp: 'Мощность, л.с.', part_number: 'Артикул', manufacturer: 'Производитель', stock_qty: 'На складе, шт', warranty_months: 'Гарантия, мес', compatibility: 'Совместимость (через ;)', negotiable: 'Торг (да/нет)', leasing: 'Лизинг (да/нет)', with_operator: 'С оператором (да/нет)', country: 'Страна (UZ)', region: 'Регион', city: 'Город', address: 'Адрес', serial_number: 'Серийный номер' },
  en: { deal_type: 'Deal type *', category: 'Category *', subcategory: 'Subcategory *', title: 'Title *', description: 'Description', price: 'Price', currency: 'Currency', price_unit: 'Price unit', condition: 'Condition', brand: 'Brand', model: 'Model', year: 'Year', hours: 'Engine hours', power_hp: 'Power, hp', part_number: 'Part number', manufacturer: 'Manufacturer', stock_qty: 'In stock, pcs', warranty_months: 'Warranty, months', compatibility: 'Compatible with (; separated)', negotiable: 'Negotiable (yes/no)', leasing: 'Leasing (yes/no)', with_operator: 'With operator (yes/no)', country: 'Country (UZ)', region: 'Region', city: 'City', address: 'Address', serial_number: 'Serial number' },
};
const tplLang = (l) => (['uz', 'ru', 'en'].includes(l) ? l : ['prs', 'ps'].includes(l) ? 'en' : 'ru');
const SAMPLE_MARK = /^(namuna|пример|example)\s*:/i;
const TPL_TEXT = {
  uz: { sheet: "E'lonlar", cats: 'Kategoriyalar', vals: 'Qiymatlar', sample: 'Namuna', field: 'Ustun', value: 'Qiymat', meaning: "Ma'nosi", cat: 'Kategoriya', sub: 'Rubrika' },
  ru: { sheet: 'Объявления', cats: 'Категории', vals: 'Значения', sample: 'Пример', field: 'Столбец', value: 'Значение', meaning: 'Значение (описание)', cat: 'Категория', sub: 'Рубрика' },
  en: { sheet: 'Listings', cats: 'Categories', vals: 'Values', sample: 'Example', field: 'Column', value: 'Value', meaning: 'Meaning', cat: 'Category', sub: 'Subcategory' },
};

r.get('/my/listings/import/template', requireAuth, (req, res) => {
  if (req.query.format === 'csv') {
    const sample = ['sale', 'parts', 'filters', 'Фильтр топливный JCB 32/925869', 'Оригинальный топливный фильтр JCB. Заводская упаковка, отгрузка в день оплаты.', '350000', 'UZS', 'total', 'new', 'JCB', '', '', '', '', '32/925869', 'JCB', '15', '12', 'JCB 3CX;JCB 4CX', 'tashkent', 'Ташкент', '', ''];
    const esc = (s) => (/[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="hemu-import.csv"' });
    return res.send(`﻿${COLS.join(',')}\n${sample.map(esc).join(',')}\n`);
  }
  const lang = tplLang(req.lang);
  const T = TPL_TEXT[lang];
  const nm = (names) => names[lang] || names.ru || names.en || Object.values(names)[0];
  const row = (o) => IMPORT_COLS.map((k) => o[k] ?? '');
  const samples = [
    row({ deal_type: 'sale', category: 'special', subcategory: 'excavators', title: `${T.sample}: JCB JS220 ekskavator, 2019`, price: 950000000, currency: 'UZS', condition: 'used', brand: 'JCB', model: 'JS220', year: 2019, hours: 7800, power_hp: 173, negotiable: 'ha', leasing: "yo'q", country: 'UZ', region: 'tashkent-city', city: 'Toshkent' }),
    row({ deal_type: 'sale', category: 'parts', subcategory: 'filters', title: `${T.sample}: JCB 32/925869 yoqilg'i filtri`, price: 350000, currency: 'UZS', price_unit: 'piece', condition: 'new', brand: 'JCB', part_number: '32/925869', manufacturer: 'JCB', stock_qty: 15, warranty_months: 12, compatibility: 'JCB 3CX; JCB 4CX', country: 'UZ', region: 'tashkent-city', city: 'Toshkent' }),
  ];
  const cats = catLib.load().roots;
  const regions = REGIONS.UZ || [];
  const enumRows = [
    ['deal_type', 'sale', lang === 'uz' ? 'Sotish' : lang === 'ru' ? 'Продажа' : 'Sale'],
    ['deal_type', 'rent', lang === 'uz' ? 'Ijara' : lang === 'ru' ? 'Аренда' : 'Rent'],
    ['deal_type', 'service', lang === 'uz' ? 'Xizmat' : lang === 'ru' ? 'Услуга' : 'Service'],
    ['condition', 'new', lang === 'uz' ? 'Yangi' : lang === 'ru' ? 'Новое' : 'New'],
    ['condition', 'used', lang === 'uz' ? 'Ishlatilgan' : lang === 'ru' ? 'Б/у' : 'Used'],
    ...CURRENCY_CODES.map((c) => ['currency', c, '']),
    ...['total', 'hour', 'day', 'shift', 'ton', 'm3', 'piece', 'bag', 'load'].map((u) => ['price_unit', u, '']),
    ...regions.map((g) => ['region (UZ)', g.code, nm(g.names)]),
  ];
  const buf = writeXlsx([
    { name: T.sheet, header: true, sampleRows: [1, 2], rows: [IMPORT_COLS.map((k) => `${k} | ${COL_LABELS[lang][k] || k}`), ...samples], widths: IMPORT_COLS.map((k) => (k === 'title' || k === 'description' ? 44 : k === 'compatibility' ? 30 : 20)) },
    { name: T.cats, header: true, rows: [['category', T.cat, 'subcategory', T.sub], ...cats.flatMap((c) => c.children.map((s) => [c.slug, nm(c.names), s.slug, nm(s.names)]))], widths: [18, 34, 24, 40] },
    { name: T.vals, header: true, rows: [[T.field, T.value, T.meaning], ...enumRows], widths: [18, 22, 34] },
  ]);
  res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="hemu-import.xlsx"' });
  res.send(buf);
});

// Do'stona qiymatlarni API qiymatlariga aylantirish (ha/да/yes, sotish/продажа, yangi/б/у ...)
const low = (s) => String(s || '').trim().toLowerCase();
const YES = new Set(['1', 'true', 'ha', 'xa', 'yes', 'да', 'y', '+', 'bor']);
const NO = new Set(['0', 'false', "yo'q", 'yoq', 'no', 'нет', 'n', '-', "yo‘q"]);
const DEAL = { sotish: 'sale', sotuv: 'sale', продажа: 'sale', продам: 'sale', ijara: 'rent', аренда: 'rent', xizmat: 'service', услуга: 'service', услуги: 'service' };
const COND = { yangi: 'new', новый: 'new', новое: 'new', новая: 'new', 'b/u': 'used', 'б/у': 'used', бу: 'used', ishlatilgan: 'used', used: 'used', new: 'new' };
function findCat(v, parent) {
  if (!v) return v;
  const bySlug = catLib.bySlug(v) || catLib.bySlug(low(v));
  if (bySlug) return bySlug.slug;
  const pool = parent ? (catLib.bySlug(parent)?.children || []) : catLib.load().roots;
  const hit = pool.find((c) => Object.values(c.names).some((n) => low(n) === low(v)));
  return hit ? hit.slug : v;
}

const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
r.post('/my/listings/import', requireAuth, csvUpload.single('file'), async (req, res) => {
  if (!req.file) fail(422, 'err.file_type');
  let rows;
  if (isXlsx(req.file.buffer)) {
    try { rows = readXlsx(req.file.buffer).map((r) => r.map((c) => String(c ?? ''))); } catch { fail(422, 'err.file_type'); }
  } else rows = parseCsv(req.file.buffer.toString('utf8'));
  if (rows.length < 2) fail(422, 'err.validation', { file: 'empty' });
  // Sarlavha "title | Nomi *" ko'rinishida bo'lishi mumkin — kalit qismini olamiz
  const head = rows[0].map((h) => String(h).split('|')[0].trim().toLowerCase().replace(/\s+/g, '_'));
  // Namuna qatorlarini tashlab yuboramiz, lekin asl qator raqamini saqlaymiz (xato hisobotida)
  const data = rows.slice(1).map((cells, i) => ({ n: i + 2, cells })).filter((x) => !SAMPLE_MARK.test(String(x.cells[head.indexOf('title')] ?? '').trim()));
  if (!data.length) fail(422, 'err.validation', { file: 'empty' });
  const publish = req.body?.publish === '1' || req.body?.publish === 'true';
  // E'lon yaratish uchun ichki API (validatsiya, moderatsiya va chegaralar bir xil ishlaydi)
  const base = `http://127.0.0.1:${req.socket.localPort}/api/v1`;
  const headers = { Authorization: req.get('authorization'), 'Content-Type': 'application/json', 'X-Lang': req.lang };
  const results = [];
  for (const { n: rowNo, cells: row } of data.slice(0, 200)) {
    const o = Object.fromEntries(head.map((h, j) => [h, (row[j] ?? '').trim()]));
    delete o[''];
    const body = { ...o, publish: false };
    if (o.compatibility) body.compatibility = o.compatibility.split(/[;|]/).map((s) => s.trim()).filter(Boolean);
    if (o.deal_type) body.deal_type = DEAL[low(o.deal_type)] || low(o.deal_type);
    if (o.condition) body.condition = COND[low(o.condition)] || low(o.condition);
    if (o.currency) body.currency = o.currency.trim().toUpperCase().replace(/^(SO'?M|СУМ|SUM)$/, 'UZS');
    if (o.country) body.country = o.country.trim().toUpperCase();
    if (o.region) body.region = low(o.region);
    if (o.category) body.category = findCat(o.category);
    if (o.subcategory) body.subcategory = findCat(o.subcategory, body.category);
    if (o.price) body.price = o.price.replace(/[\s ]/g, '').replace(',', '.');
    for (const k of ['negotiable', 'leasing', 'with_operator']) {
      if (!o[k]) continue;
      if (YES.has(low(o[k]))) body[k] = true; else if (NO.has(low(o[k]))) body[k] = false; else delete body[k];
    }
    for (const k of Object.keys(body)) if (body[k] === '') delete body[k];
    try {
      const cr = await fetch(`${base}/listings`, { method: 'POST', headers, body: JSON.stringify(body) });
      const cj = await cr.json();
      if (!cr.ok) { results.push({ row: rowNo, ok: false, error: cj.error?.message, details: cj.error?.details }); continue; }
      // Rasmlar keyin "Мои объявления" orqali qo'shiladi (server tashqi URL'larni yuklamaydi — SSRF xavfi)
      let status = 'draft';
      if (publish) {
        const pr = await fetch(`${base}/listings/${cj.id}/publish`, { method: 'POST', headers, body: '{}' });
        const pj = await pr.json();
        status = pr.ok ? pj.status : 'draft';
        if (!pr.ok) { results.push({ row: rowNo, ok: true, id: cj.id, status, warning: pj.error?.message, details: pj.error?.details }); continue; }
      }
      results.push({ row: rowNo, ok: true, id: cj.id, status });
    } catch (e) {
      results.push({ row: rowNo, ok: false, error: e.message });
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
