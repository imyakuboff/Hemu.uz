// Ommaviy yuklash: Excel shabloni, .xlsx va CSV import, namunalarni o'tkazib yuborish
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hemu-imp-'));
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(tmp, 'test.db');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.OTP_DEV_ECHO = '1';

const db = require('../src/db');
const { seed } = require('../seed');
const { boot } = require('../src/server');
const { readXlsx, writeXlsx } = require('../src/lib/xlsx');

let server;
let base;
let token;

before(async () => {
  seed(process.env.DB_FILE);
  db.close();
  const app = boot(process.env.DB_FILE);
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  const res = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '+998901234567', password: 'Hemu2026' }) });
  token = (await res.json()).token;
});

after(() => {
  server.close();
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const upload = async (buf, name, publish = false) => {
  const fd = new FormData();
  fd.append('file', new Blob([buf]), name);
  if (publish) fd.append('publish', '1');
  const res = await fetch(`${base}/api/v1/my/listings/import`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'X-Lang': 'uz' }, body: fd });
  return { status: res.status, body: await res.json() };
};

test('xlsx: yozish va o\'qish (birinchi varaq, sonlar, maxsus belgilar)', () => {
  const buf = writeXlsx([{ name: 'A', header: true, rows: [['a', 'b'], ['Tom & "Jerry" <x>', 950000000], ['', 0.1 + 0.2]] }, { name: 'B', rows: [['ikkinchi']] }]);
  const rows = readXlsx(buf);
  assert.deepEqual(rows, [['a', 'b'], ['Tom & "Jerry" <x>', '950000000'], ['', '0.3']]);
  assert.throws(() => readXlsx(Buffer.from('not a zip at all, just text')));
});

test('import: Excel shablon → to\'ldirish → yuklash', async () => {
  const res = await fetch(`${base}/api/v1/my/listings/import/template`, { headers: { Authorization: `Bearer ${token}`, 'X-Lang': 'uz' } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /spreadsheetml/);
  const rows = readXlsx(Buffer.from(await res.arrayBuffer()));
  assert.match(rows[0][3], /^title \| Nomi/);
  assert.equal(rows.length, 3); // sarlavha + 2 namuna
  assert.match(rows[1][3], /^Namuna:/);
  // Faqat namunalar bo'lsa — bo'sh fayl
  assert.equal((await upload(writeXlsx([{ name: 'S', rows }]), 'a.xlsx')).status, 422);

  // Diler o'z qatorlarini qo'shadi: do'stona qiymatlar (sotish, b/u, ha, kategoriya nomi bilan)
  const head = rows[0].map((h) => h.split('|')[0].trim());
  const mk = (o) => head.map((k) => o[k] ?? '');
  const mine = [
    mk({ deal_type: 'Sotish', category: 'special', subcategory: 'Ekskavatorlar', title: 'CAT 320D ekskavator 2017', price: '780 000 000', currency: "so'm", condition: 'b/u', brand: 'CAT', model: '320D', year: '2017', negotiable: 'ha', country: 'uz', region: 'tashkent-city', city: 'Toshkent' }),
    mk({ deal_type: 'sale', category: 'parts', subcategory: 'filters', title: 'x', city: 'Toshkent' }), // nomi juda qisqa — xato
  ];
  const up = await upload(writeXlsx([{ name: 'S', rows: [...rows, ...mine] }]), 'dealer.xlsx');
  assert.equal(up.status, 200, JSON.stringify(up.body));
  assert.equal(up.body.total, 2);
  assert.equal(up.body.created, 1);
  assert.equal(up.body.results[0].row, 4); // asl Excel qator raqami
  assert.equal(up.body.results[1].row, 5);
  assert.equal(up.body.results[1].ok, false);
  const l = db.get('SELECT * FROM listings WHERE id = ?', up.body.results[0].id);
  assert.equal(l.title, 'CAT 320D ekskavator 2017');
  assert.equal(l.deal_type, 'sale');
  assert.equal(l.condition, 'used');
  assert.equal(l.currency, 'UZS');
  assert.equal(Number(l.price), 780000000);
  assert.equal(l.negotiable, 1);
});

test('import: CSV ham ishlaydi, CSV shablon saqlangan', async () => {
  const tpl = await fetch(`${base}/api/v1/my/listings/import/template?format=csv`, { headers: { Authorization: `Bearer ${token}` } });
  assert.match(tpl.headers.get('content-type'), /text\/csv/);
  const csv = 'deal_type;category;subcategory;title;price;currency;city\nsale;parts;filters;Filtr JCB 32/925869 original;350000;UZS;Toshkent\n';
  const up = await upload(Buffer.from(csv), 'a.csv');
  assert.equal(up.body.created, 1, JSON.stringify(up.body));
});

// ---------- O'z jadvali: Word (.docx), rasmlar, bir nechta fayl ----------
const { writeDocx, zip } = require('../src/lib/xlsx');
const { headerKey, parsePrice } = require('../src/lib/importmap');
const zlib = require('node:zlib');

// Kichik haqiqiy PNG (sharp o'qiy oladigan)
function png(color) {
  const crc = require('../src/lib/xlsx').crc32;
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const w = 64; const h = 48;
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) raw.set(color, y * (w * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Rasmli Word jadvali (Word "Qo'yish → Rasm" qanday saqlasa, shunday tuzilma)
function docxWithImages(header, rows) {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
  const media = [];
  const cell = (v) => {
    if (Buffer.isBuffer(v)) { media.push(v); return `<w:tc><w:p><w:r><w:drawing><a:graphic><a:graphicData><a:blip r:embed="rIdImg${media.length}"/></a:graphicData></a:graphic></w:drawing></w:r></w:p></w:tc>`; }
    return `<w:tc><w:p><w:r><w:t>${v}</w:t></w:r></w:p></w:tc>`;
  };
  const tr = (r) => `<w:tr>${r.map(cell).join('')}</w:tr>`;
  const doc = `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body><w:p><w:r><w:t>Prays-list</w:t></w:r></w:p><w:tbl>${[header, ...rows].map(tr).join('')}</w:tbl></w:body></w:document>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${media.map((_, i) => `<Relationship Id="rIdImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${i + 1}.png"/>`).join('')}</Relationships>`;
  return zip([
    ['[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['word/document.xml', doc], ['word/_rels/document.xml.rels', rels],
    ...media.map((b, i) => [`word/media/image${i + 1}.png`, b]),
  ]);
}

const uploadMany = async (files, fields = {}, q = '') => {
  const fd = new FormData();
  for (const [buf, name] of files) fd.append('files', new Blob([buf]), name);
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const res = await fetch(`${base}/api/v1/my/listings/import${q}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'X-Lang': 'uz' }, body: fd });
  return { status: res.status, body: await res.json() };
};

test('importmap: ustun nomlari va narx yozuvlari', () => {
  assert.equal(headerKey('Nomi'), 'title');
  assert.equal(headerKey('Наименование товара'), 'title');
  assert.equal(headerKey("Narxi, so'm"), 'price');
  assert.equal(headerKey('Кол-во, шт'), 'stock_qty');
  assert.equal(headerKey('Omborda, dona'), 'stock_qty');
  assert.equal(headerKey('title | Nomi *'), 'title');
  assert.equal(headerKey('№'), '');
  assert.deepEqual(parsePrice("350 000 so'm"), { price: '350000', currency: 'UZS' });
  assert.deepEqual(parsePrice('$62,500'), { price: '62500', currency: 'USD' });
  assert.equal(parsePrice('1 250 000,50').price, '1250000.50');
  assert.equal(parsePrice('договорная').price, '');
});

test('import: Word jadvali — o\'z ustun nomlari, rasmlar, rubrika nomdan', async () => {
  const buf = docxWithImages(['№', 'Название', 'Цена', 'Год', 'Моточасы', 'Город', 'Фото'], [
    ['1', 'Экскаватор JCB JS220 гусеничный', '950 000 000 сум', '2019 г.', '7 800', 'Ташкент', png([200, 30, 30])],
    ['2', 'Бульдозер Shantui SD16', '$62,500', '2020', '5000', 'Ташкент', png([30, 200, 30])],
  ]);
  const up = await uploadMany([[buf, 'texnika.docx']], { kind: 'special', publish: '1' });
  assert.equal(up.status, 200, JSON.stringify(up.body));
  assert.equal(up.body.created, 2, JSON.stringify(up.body.results));
  const [a, b] = up.body.results;
  assert.equal(a.photos, 1);
  const la = db.get('SELECT l.*, c.slug AS sub FROM listings l JOIN categories c ON c.id = l.subcategory_id WHERE l.id = ?', a.id);
  assert.equal(la.sub, 'excavators');
  assert.equal(Number(la.price), 950000000);
  assert.equal(la.year, 2019);
  assert.equal(la.hours, 7800);
  assert.equal(db.get('SELECT COUNT(*) AS n FROM listing_photos WHERE listing_id = ?', a.id).n, 1);
  assert.notEqual(la.status, 'draft'); // rasm bor — nashrga ketdi
  const lb = db.get('SELECT l.*, c.slug AS sub FROM listings l JOIN categories c ON c.id = l.subcategory_id WHERE l.id = ?', b.id);
  assert.equal(lb.sub, 'bulldozers');
  assert.equal(lb.currency, 'USD');
  assert.equal(Number(lb.price), 62500);
});

test('import: bir nechta fayl birdaniga (Excel + Word + CSV), fonda ishlash va eski format', async () => {
  const xlsx = writeXlsx([{ name: 'Ombor', rows: [['Prays-list 2026'], ['Artikul', 'Nomi', 'Narxi', 'Soni', 'Mos texnika'], ['32/925346', 'Gidravlika filtri JCB', '620 000', '12 dona', 'JCB 3CX; JCB 4CX'], ['02/801211', 'Moy filtri JCB', '280 000', '24', '']] }]);
  const docx = writeDocx({ title: 'T', header: ['Nomi', 'Narx', 'Artikul'], rows: [['Namuna: filtr', '1', '1'], ['Tormoz kolodkasi Hyundai 58101', '540 000', '58101-4FA00']], sampleRows: [0] });
  const csv = Buffer.from('Наименование;Цена;Артикул\nФильтр топливный CAT 1R-0750;45 USD;1R-0750\n');
  const old = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64)]);
  let up = await uploadMany([[xlsx, 'ombor.xlsx'], [docx, 'qismlar.docx'], [csv, 'cat.csv'], [old, 'eski.xls']], { kind: 'parts' }, '?async=1');
  assert.equal(up.status, 202, JSON.stringify(up.body));
  let job = up.body;
  for (let i = 0; i < 100 && !job.done; i += 1) {
    await new Promise((r) => setTimeout(r, 100));
    job = await (await fetch(`${base}/api/v1/my/listings/import/jobs/${job.id}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  }
  assert.equal(job.done, true);
  assert.equal(job.total, 4, JSON.stringify(job));
  assert.equal(job.created, 4, JSON.stringify(job.results));
  assert.equal(job.files.find((f) => f.name === 'eski.xls').error, 'old_format');
  const first = job.results.find((x) => x.file === 'ombor.xlsx');
  assert.equal(first.row, 3); // asl Excel qator raqami (sarlavha 2-qatorda)
  const l = db.get('SELECT l.*, c.slug AS cat FROM listings l JOIN categories c ON c.id = l.category_id WHERE l.id = ?', first.id);
  assert.equal(l.cat, 'parts');
  assert.equal(l.part_number, '32/925346');
  assert.equal(l.stock_qty, 12);
  const csvRow = db.get('SELECT * FROM listings WHERE id = ?', job.results.find((x) => x.file === 'cat.csv').id);
  assert.equal(csvRow.currency, 'USD');
  // Begona foydalanuvchi ishni ko'ra olmaydi
  const anon = await fetch(`${base}/api/v1/my/listings/import/jobs/${job.id}`);
  assert.equal(anon.status, 401);
  // Word shablon
  const tpl = await fetch(`${base}/api/v1/my/listings/import/template?format=docx`, { headers: { Authorization: `Bearer ${token}`, 'X-Lang': 'ru' } });
  assert.match(tpl.headers.get('content-type'), /wordprocessingml/);
  // Faqat eski fayl — 422
  up = await uploadMany([[old, 'eski.doc']]);
  assert.equal(up.status, 422);
});
