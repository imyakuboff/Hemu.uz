const { Router } = require('express');
const multer = require('multer');
const db = require('../db');
const tg = require('../lib/telegram');
const { requireAuth, rateLimit, INTERNAL_KEY } = require('../lib/auth');
const { fail, validate } = require('../lib/http');
const catLib = require('../lib/categories');
const { REGIONS, CURRENCY_CODES } = require('../geo');
const { readXlsx, readXlsxSheet, readDocx, writeXlsx, writeDocx, isXlsx, isOldOffice, officeKind } = require('../lib/xlsx');
const imap = require('../lib/importmap');

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

const IMPORT_COLS = [...COLS.slice(0, 19), 'negotiable', 'leasing', 'with_operator', 'country', ...COLS.slice(19), 'photos'];
// Excel shablonidagi ustun izohlari (sarlavha: "kalit | izoh")
const COL_LABELS = {
  uz: { deal_type: 'Bitim turi *', category: 'Kategoriya *', subcategory: 'Rubrika *', title: 'Nomi *', description: 'Tavsif', price: 'Narx', currency: 'Valyuta', price_unit: 'Narx birligi', condition: 'Holati', brand: 'Marka', model: 'Model', year: 'Yil', hours: 'Moto-soat', power_hp: 'Quvvat, o.k.', part_number: 'Artikul', manufacturer: 'Ishlab chiqaruvchi', stock_qty: 'Omborda, dona', warranty_months: 'Kafolat, oy', compatibility: 'Mos texnika (; bilan)', negotiable: 'Kelishiladi (ha/yo\'q)', leasing: 'Lizing (ha/yo\'q)', with_operator: 'Operator bilan (ha/yo\'q)', country: 'Mamlakat (UZ)', region: 'Viloyat', city: 'Shahar', address: 'Manzil', serial_number: 'Seriya raqami', photos: 'Rasm (katakchaga qo\'ying yoki havola)' },
  ru: { deal_type: 'Тип сделки *', category: 'Категория *', subcategory: 'Рубрика *', title: 'Название *', description: 'Описание', price: 'Цена', currency: 'Валюта', price_unit: 'Единица цены', condition: 'Состояние', brand: 'Марка', model: 'Модель', year: 'Год', hours: 'Моточасы', power_hp: 'Мощность, л.с.', part_number: 'Артикул', manufacturer: 'Производитель', stock_qty: 'На складе, шт', warranty_months: 'Гарантия, мес', compatibility: 'Совместимость (через ;)', negotiable: 'Торг (да/нет)', leasing: 'Лизинг (да/нет)', with_operator: 'С оператором (да/нет)', country: 'Страна (UZ)', region: 'Регион', city: 'Город', address: 'Адрес', serial_number: 'Серийный номер', photos: 'Фото (вставьте в ячейку или ссылка)' },
  en: { deal_type: 'Deal type *', category: 'Category *', subcategory: 'Subcategory *', title: 'Title *', description: 'Description', price: 'Price', currency: 'Currency', price_unit: 'Price unit', condition: 'Condition', brand: 'Brand', model: 'Model', year: 'Year', hours: 'Engine hours', power_hp: 'Power, hp', part_number: 'Part number', manufacturer: 'Manufacturer', stock_qty: 'In stock, pcs', warranty_months: 'Warranty, months', compatibility: 'Compatible with (; separated)', negotiable: 'Negotiable (yes/no)', leasing: 'Leasing (yes/no)', with_operator: 'With operator (yes/no)', country: 'Country (UZ)', region: 'Region', city: 'City', address: 'Address', serial_number: 'Serial number', photos: 'Photo (paste into the cell or a link)' },
};
// Shablon izohlari ham ustun nomi sifatida tanilsin ("Omborda, dona" -> stock_qty)
for (const labels of Object.values(COL_LABELS)) imap.addAliases(labels);
const tplLang = (l) => (['uz', 'ru', 'en'].includes(l) ? l : ['prs', 'ps'].includes(l) ? 'en' : 'ru');
const SAMPLE_MARK = /^(namuna|пример|example)\s*:/i;
const TPL_TEXT = {
  uz: { sheet: "E'lonlar", cats: 'Kategoriyalar', vals: 'Qiymatlar', sample: 'Namuna', field: 'Ustun', value: 'Qiymat', meaning: "Ma'nosi", cat: 'Kategoriya', sub: 'Rubrika' },
  ru: { sheet: 'Объявления', cats: 'Категории', vals: 'Значения', sample: 'Пример', field: 'Столбец', value: 'Значение', meaning: 'Значение (описание)', cat: 'Категория', sub: 'Рубрика' },
  en: { sheet: 'Listings', cats: 'Categories', vals: 'Values', sample: 'Example', field: 'Column', value: 'Value', meaning: 'Meaning', cat: 'Category', sub: 'Subcategory' },
};

const DOCX_TPL = {
  uz: {
    title: "HEMU.UZ — e'lonlar ro'yxati", new: 'yangi', used: 'b/u',
    s1: "JCB yoqilg'i filtri 32/925869", s2: 'JCB JS220 ekskavator', d1: 'Original, zavod qadog\'ida', d2: 'Yaxshi holatda, hujjatlari bor',
    notes: ["Har bir qator — bitta e'lon. Ehtiyot qism ham, texnika ham bitta jadvalda bo'lishi mumkin.", "«Rasm» katakchasiga rasmni qo'ying (Qo'yish → Rasm) — e'longa o'zi qo'shiladi.", "Kerak bo'lsa qator qo'shing. Namuna qatorlari yuklanmaydi. Kategoriya nomdan avtomatik aniqlanadi."],
    cols: { title: 'Nomi', price: 'Narx', currency: 'Valyuta', part_number: 'Artikul', stock_qty: 'Soni', brand: 'Marka', model: 'Model', year: 'Yil', condition: 'Holati', compatibility: 'Mos texnika', description: 'Tavsif', photos: 'Rasm' },
  },
  ru: {
    title: 'HEMU.UZ — список объявлений', new: 'новое', used: 'б/у',
    s1: 'Фильтр топливный JCB 32/925869', s2: 'Экскаватор JCB JS220', d1: 'Оригинал, заводская упаковка', d2: 'Хорошее состояние, документы есть',
    notes: ['Каждая строка — одно объявление. Запчасти и техника могут быть в одной таблице.', 'Вставьте фото в ячейку «Фото» (Вставка → Рисунок) — оно добавится к объявлению.', 'Добавляйте строки по необходимости. Строки-примеры не загружаются. Категория определяется по названию.'],
    cols: { title: 'Название', price: 'Цена', currency: 'Валюта', part_number: 'Артикул', stock_qty: 'Количество', brand: 'Марка', model: 'Модель', year: 'Год', condition: 'Состояние', compatibility: 'Совместимость', description: 'Описание', photos: 'Фото' },
  },
  en: {
    title: 'HEMU.UZ — listings', new: 'new', used: 'used',
    s1: 'JCB fuel filter 32/925869', s2: 'JCB JS220 excavator', d1: 'Genuine, factory packed', d2: 'Good condition, documents available',
    notes: ['Each row is one listing. Parts and machines can share one table.', 'Paste a photo into the «Photo» cell (Insert → Picture) — it is added to the listing.', 'Add rows as needed. Example rows are skipped. The category is detected from the title.'],
    cols: { title: 'Title', price: 'Price', currency: 'Currency', part_number: 'Part number', stock_qty: 'Quantity', brand: 'Brand', model: 'Model', year: 'Year', condition: 'Condition', compatibility: 'Compatible with', description: 'Description', photos: 'Photo' },
  },
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
  if (req.query.format === 'docx') {
    const W = DOCX_TPL[lang];
    const cols = ['title', 'price', 'currency', 'part_number', 'stock_qty', 'brand', 'model', 'year', 'condition', 'compatibility', 'description', 'photos'];
    const head = cols.map((k) => W.cols[k]);
    const rows = [
      [`${T.sample}: ${W.s1}`, '350 000', 'UZS', '32/925869', '15', 'JCB', '', '', W.new, 'JCB 3CX; JCB 4CX', W.d1, ''],
      [`${T.sample}: ${W.s2}`, '950 000 000', 'UZS', '', '', 'JCB', 'JS220', '2019', W.used, '', W.d2, ''],
      ...Array.from({ length: 8 }, () => cols.map(() => '')),
    ];
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': 'attachment; filename="hemu-import.docx"' });
    return res.send(writeDocx({ title: W.title, notes: W.notes, header: head, rows, sampleRows: [0, 1] }));
  }
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


// Jadval qatorini e'lon maydonlariga aylantirish (Excel/CSV import va diler fidi uchun umumiy)
const INT_FIELDS = ['year', 'hours', 'power_hp', 'stock_qty', 'warranty_months', 'mileage_km', 'weight_kg'];
function rowToBody(head, row) {
  const o = Object.fromEntries(head.map((h, j) => [h, String(row[j] ?? '').trim()]));
  delete o[''];
  const body = { ...o, publish: false };
  if (o.compatibility) body.compatibility = o.compatibility.split(/[;|\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 30);
  if (o.deal_type) body.deal_type = DEAL[low(o.deal_type)] || low(o.deal_type);
  if (o.condition) body.condition = COND[low(o.condition)] || low(o.condition);
  if (o.currency) body.currency = o.currency.trim().toUpperCase().replace(/^(SO['ʻʼ‘’`]?M|СУМ|SUM)$/, 'UZS').replace(/^(\$|ДОЛЛ.*|DOLLAR)$/, 'USD');
  if (o.country) body.country = o.country.trim().toUpperCase();
  if (o.region) body.region = low(o.region);
  if (o.category) body.category = findCat(o.category);
  if (o.subcategory) body.subcategory = findCat(o.subcategory, body.category);
  if (o.price) {
    // "1 250 000 so'm", "$62,500", "1 250 000,50" — son va valyuta alohida
    const pp = imap.parsePrice(o.price);
    if (pp.price) body.price = pp.price; else delete body.price;
    if (pp.currency && !o.currency) body.currency = pp.currency;
  }
  // "12 dona", "2019 y." — faqat raqamlar
  for (const k of INT_FIELDS) if (o[k] && !/^\d+$/.test(o[k])) { const d = o[k].replace(/[\s ]/g, '').match(/\d+/); if (d) body[k] = d[0]; else delete body[k]; }
  for (const k of ['negotiable', 'leasing', 'with_operator']) {
    if (!o[k]) continue;
    if (YES.has(low(o[k]))) body[k] = true; else if (NO.has(low(o[k]))) body[k] = false; else delete body[k];
  }
  for (const k of Object.keys(body)) if (body[k] === '') delete body[k];
  return body;
}
// Fayl (CSV yoki Excel) -> { head, rows } — diler fidi uchun (ustun kalitlari o'zgarmaydi: external_id barqaror qoladi)
function readTable(buf) {
  let rows;
  if (isXlsx(buf)) rows = readXlsx(buf).map((r) => r.map((c) => String(c ?? '')));
  else rows = parseCsv(buf.toString('utf8'));
  const head = (rows[0] || []).map((h) => String(h).split('|')[0].trim().toLowerCase().replace(/\s+/g, '_'));
  const data = rows.slice(1).map((cells, i) => ({ n: i + 2, cells })).filter((x) => !SAMPLE_MARK.test(String(x.cells[head.indexOf('title')] ?? '').trim()));
  return { head, data };
}

// ---------- Ommaviy yuklash: Excel (.xlsx), Word (.docx), CSV — bir nechta fayl birdaniga ----------
const MAX_IMPORT_ROWS = 500;
const MAX_IMPORT_FILES = 10;
const FALLBACK_SUB = { parts: 'parts-special', special: 'special-other' };

// Fayl -> { head, data: [{ n, cells }], images: Map(n -> rasmlar) }; xato bo'lsa Error.code
function readImportFile(buf) {
  const bad = (code) => Object.assign(new Error(code), { code });
  if (isOldOffice(buf)) throw bad('old_format');
  const kind = officeKind(buf);
  let rows;
  let images = new Map();
  try {
    if (kind === 'xlsx') ({ rows, images } = readXlsxSheet(buf));
    else if (kind === 'docx') ({ rows, images } = readDocx(buf));
    else if (isXlsx(buf) || buf.subarray(0, 5).toString('latin1') === '%PDF-') throw bad('bad_file');
    else rows = parseCsv(buf.toString('utf8')).map((cells, i) => ({ n: i + 1, cells }));
  } catch (e) {
    throw e.code ? e : bad('bad_file');
  }
  rows = rows.map((r) => ({ n: r.n, cells: r.cells.map((c) => String(c ?? '')) }));
  // Sarlavha qatori: dastlabki 10 qatordan eng ko'p ustun nomi tanilgani (yuqorida "Prays-list" kabi sarlavha bo'lishi mumkin)
  let hi = 0;
  let best = 0;
  rows.slice(0, 10).forEach((r, i) => {
    const keys = r.cells.map(imap.headerKey).filter(Boolean);
    const score = new Set(keys).size + (keys.includes('title') ? 2 : 0);
    if (score > best) { best = score; hi = i; }
  });
  if (!rows.length) throw bad('empty');
  const head = rows[hi].cells.map(imap.headerKey);
  // Bir xil ustun ikki marta bo'lsa — birinchisi olinadi
  head.forEach((k, j) => { if (k && head.indexOf(k) !== j) head[j] = ''; });
  if (!head.includes('title') && !(head.includes('brand') || head.includes('model') || head.includes('part_number'))) throw bad('no_title');
  const ti = head.indexOf('title');
  const data = rows.slice(hi + 1).filter((x) => !(ti >= 0 && SAMPLE_MARK.test(String(x.cells[ti] ?? '').trim())));
  if (!data.length) throw bad('empty');
  return { head, data, images };
}

// Kategoriya va rubrikani aniqlash: qatordagi qiymat > tanlangan tur > nomdan topish
function inferCategory(body, kind) {
  const text = [body.title, body.description, body.brand, body.model].filter(Boolean).join(' ');
  const roots = catLib.load().roots;
  if (!body.category || !catLib.bySlug(body.category)) {
    if (kind && catLib.bySlug(kind)) body.category = kind;
    else {
      // Barcha bo'limlar rubrikalari bo'yicha eng mosini topish
      let hit = null;
      for (const root of roots) {
        const c = imap.guessChild(text, root.children);
        if (c && !hit) hit = { root, c };
      }
      if (hit) { body.category = hit.root.slug; body.subcategory = body.subcategory || hit.c.slug; }
      else body.category = (body.part_number || body.stock_qty) ? 'parts' : 'special';
    }
  }
  const root = catLib.bySlug(body.category);
  const sub = body.subcategory && catLib.bySlug(body.subcategory);
  if (!sub || sub.parent_id !== root?.id) {
    const c = imap.guessChild(text, root?.children);
    body.subcategory = c?.slug || FALLBACK_SUB[body.category] || body.subcategory;
  }
}

function importBody(head, cells, kind) {
  const body = rowToBody(head, cells);
  const photoLinks = String(body.photos || '').split(/[\s,;|]+/).filter((u) => /^https?:\/\//i.test(u));
  delete body.photos;
  delete body.external_id;
  // Nomi yo'q bo'lsa: marka + model + yil (texnika ro'yxatlarida ko'p uchraydi)
  if (!body.title) {
    const t = [body.brand, body.model, body.part_number, body.year].filter(Boolean).join(' ');
    if (t) body.title = t;
  }
  if (body.title && body.title.length > 80) body.title = body.title.slice(0, 80).replace(/\s+\S*$/, '');
  body.deal_type = body.deal_type || 'sale';
  inferCategory(body, kind);
  return { body, photoLinks };
}

// Import ishlari (fonda bajariladi, sahifa holatni so'rab turadi)
const jobs = new Map();
setInterval(() => { const old = Date.now() - 3600e3; for (const [id, j] of jobs) if (j.started < old) jobs.delete(id); }, 600e3).unref();

async function runImport(job, files, { kind, publish, base, headers, city }) {
  const auth = { Authorization: headers.Authorization };
  for (const f of files) {
    let table;
    try { table = readImportFile(f.buffer); } catch (e) {
      job.files.push({ name: f.originalname, rows: 0, error: e.code || 'bad_file' });
      continue;
    }
    const left = MAX_IMPORT_ROWS - job.total;
    const rows = table.data.slice(0, Math.max(0, left));
    job.files.push({ name: f.originalname, rows: rows.length, skipped: table.data.length - rows.length });
    job.total += rows.length;
  }
  // Ikkinchi o'tish: e'lonlarni yaratish (fayllar yana o'qiladi — xotirada faqat bittasi)
  for (const f of files) {
    const meta = job.files.find((x) => x.name === f.originalname && !x.done);
    if (!meta) continue;
    meta.done = true;
    if (meta.error) continue;
    const table = readImportFile(f.buffer);
    for (const { n, cells } of table.data.slice(0, meta.rows)) {
      const res = { file: f.originalname, row: n };
      try {
        const { body, photoLinks } = importBody(table.head, cells, kind);
        // Shahar ko'rsatilmagan bo'lsa — profildagi shahar (nashr uchun manzil kerak)
        if (!body.city && !body.region && city) body.city = city;
        res.title = body.title;
        const cr = await fetch(`${base}/listings`, { method: 'POST', headers, body: JSON.stringify(body) });
        const cj = await cr.json();
        if (!cr.ok) { Object.assign(res, { ok: false, error: cj.error?.message, details: cj.error?.details }); continue; }
        Object.assign(res, { ok: true, id: cj.id, status: 'draft', photos: 0 });
        // Rasmlar: katakchaga qo'yilganlari + havolalar (havolalar xavfsiz yuklovchi orqali)
        let pics = (table.images.get(n) || []).slice(0, 10);
        if (pics.length < 10 && photoLinks.length) {
          pics = pics.concat(await require('../lib/feeds').downloadPhotos(photoLinks.slice(0, 10 - pics.length)));
        }
        if (pics.length) {
          const fd = new FormData();
          for (const p of pics) fd.append('files', new Blob([p.buf], { type: p.type }), p.name);
          const ur = await fetch(`${base}/listings/${cj.id}/photos`, { method: 'POST', headers: auth, body: fd });
          if (ur.ok) res.photos = pics.length;
        }
        if (publish) {
          const pr = await fetch(`${base}/listings/${cj.id}/publish`, { method: 'POST', headers, body: '{}' });
          const pj = await pr.json();
          if (pr.ok) res.status = pj.status; else Object.assign(res, { warning: pj.error?.message, details: pj.error?.details });
        }
        job.created += 1;
      } catch (e) {
        Object.assign(res, { ok: false, error: e.message });
      } finally {
        job.results.push(res);
        job.processed += 1;
      }
    }
  }
  for (const x of job.files) delete x.done;
  job.done = true;
}

const jobView = (j) => ({ id: j.id, done: j.done, total: j.total, processed: j.processed, created: j.created, files: j.files, results: j.results });

const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: MAX_IMPORT_FILES } });
r.post('/my/listings/import', requireAuth, rateLimit({ name: 'import', windowMs: 60e3, max: 10, key: (req) => req.user?.id || req.ip }), importUpload.fields([{ name: 'file', maxCount: 1 }, { name: 'files', maxCount: MAX_IMPORT_FILES }]), async (req, res) => {
  const files = [...(req.files?.file || []), ...(req.files?.files || [])].slice(0, MAX_IMPORT_FILES);
  if (!files.length) fail(422, 'err.validation', { file: 'required' });
  // Brauzer fayl nomini latin1 deb yuboradi — UTF-8 ga qaytarish
  for (const f of files) { try { const u = Buffer.from(f.originalname, 'latin1').toString('utf8'); if (!u.includes('�')) f.originalname = u; } catch { /* nomi o'zgarmaydi */ } }
  const kind = ['parts', 'special', 'trucks', 'construction'].includes(req.body?.kind) ? req.body.kind : '';
  const publish = req.body?.publish === '1' || req.body?.publish === 'true';
  if ([...jobs.values()].some((j) => j.user_id === req.user.id && !j.done)) fail(429, 'err.too_many');
  const job = { id: require('node:crypto').randomBytes(8).toString('hex'), user_id: req.user.id, started: Date.now(), done: false, total: 0, processed: 0, created: 0, files: [], results: [] };
  jobs.set(job.id, job);
  // E'lon yaratish uchun ichki API (validatsiya, moderatsiya va chegaralar bir xil ishlaydi)
  const opts = { kind, publish, base: `http://127.0.0.1:${req.socket.localPort}/api/v1`, headers: { Authorization: req.get('authorization'), 'Content-Type': 'application/json', 'X-Lang': req.lang, 'X-Hemu-Internal': INTERNAL_KEY }, city: req.user.city || '' };
  const run = runImport(job, files, opts).catch((e) => { job.error = e.message; job.done = true; });
  if (req.query.async === '1') return res.status(202).json(jobView(job));
  await run;
  // Bitta fayl va u o'qilmasa — avvalgidek 422
  if (!job.total && job.files.length === 1 && job.files[0].error) fail(422, job.files[0].error === 'empty' ? 'err.validation' : 'err.file_type', { file: job.files[0].error });
  res.json(jobView(job));
});
r.get('/my/listings/import/jobs/:id', requireAuth, (req, res) => {
  const j = jobs.get(req.params.id);
  if (!j || j.user_id !== req.user.id) fail(404, 'err.not_found');
  res.json(jobView(j));
});

// ---------- Diler fidi: havola orqali avtomatik sinxronlash ----------
const feedView = (f) => (f ? {
  url: f.url, active: Boolean(f.active), last_run_at: f.last_run_at, last_status: f.last_status, last_error: f.last_error,
  stats: f.stats ? JSON.parse(f.stats) : null,
  listings: db.get(`SELECT COUNT(*) AS n FROM listings WHERE feed_id = ? AND status = 'active'`, f.id).n,
} : null);
r.get('/my/feed', requireAuth, (req, res) => res.json(feedView(db.get('SELECT * FROM listing_feeds WHERE user_id = ?', req.user.id))));
r.put('/my/feed', requireAuth, async (req, res) => {
  const v = validate(req.body, { url: { type: 'string', min: 10, max: 1000, required: true }, active: { type: 'bool' } });
  const feeds = require('../lib/feeds');
  try { await feeds.assertPublic(feeds.normalizeUrl(v.url)); } catch (e) { fail(422, 'err.validation', { url: e.message }); }
  db.run(
    `INSERT INTO listing_feeds (user_id, url, active) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET url = excluded.url, active = excluded.active, last_run_at = CASE WHEN listing_feeds.url = excluded.url THEN listing_feeds.last_run_at END`,
    req.user.id, v.url.trim(), v.active === false ? 0 : 1,
  );
  res.json(feedView(db.get('SELECT * FROM listing_feeds WHERE user_id = ?', req.user.id)));
});
// Hozir sinxronlash (10 daqiqada bir marta)
r.post('/my/feed/run', requireAuth, rateLimit({ name: 'feed', windowMs: 10 * 60000, max: 1, key: (req) => req.user.id }), async (req, res) => {
  const f = db.get('SELECT * FROM listing_feeds WHERE user_id = ?', req.user.id);
  if (!f) fail(404, 'err.not_found');
  const out = await require('../lib/feeds').syncFeed(f.id, { port: req.socket.localPort });
  res.json(feedView(out));
});
r.delete('/my/feed', requireAuth, (req, res) => {
  const f = db.get('SELECT id FROM listing_feeds WHERE user_id = ?', req.user.id);
  if (f) {
    db.run('UPDATE listings SET feed_id = NULL WHERE feed_id = ?', f.id);
    db.run('DELETE FROM listing_feeds WHERE id = ?', f.id);
  }
  res.json({ ok: true });
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

module.exports = { router: r, parseCsv, rowToBody, readTable };
