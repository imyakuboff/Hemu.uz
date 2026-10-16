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
