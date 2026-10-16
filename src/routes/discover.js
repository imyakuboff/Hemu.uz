// Aqlli qidiruv, bo'limlar, zayavkaga mos e'lonlar, hisob-faktura PDF
const path = require('node:path');
const { Router } = require('express');
const db = require('../db');
const cats = require('../lib/categories');
const money = require('../lib/money');
const L = require('../lib/listings');
const { requireAuth } = require('../lib/auth');
const { notFound, forbidden } = require('../lib/http');
const { pick, normalizeSearch } = require('../i18n');

const r = Router();

// Qidiruvni jurnalga yozish (tavsiyalar va "o'xshash so'rovlar" uchun)
function logSearch(q, results) {
  const n = normalizeSearch(q);
  if (n.length < 2 || n.length > 80) return;
  db.run(
    `INSERT INTO search_log (q, display, n, results, last_at) VALUES (?, ?, 1, ?, datetime('now'))
     ON CONFLICT(q) DO UPDATE SET n = n + 1, results = excluded.results, last_at = excluded.last_at`,
    n, String(q).trim().slice(0, 80), results,
  );
}

r.get('/search/suggest', (req, res) => {
  const raw = String(req.query.q || '').trim().slice(0, 80);
  const q = normalizeSearch(raw);
  const ctx = { lang: req.lang, currency: req.currency };
  if (q.length < 2) {
    const popular = db.all('SELECT display FROM search_log WHERE results > 0 ORDER BY n DESC LIMIT 8').map((x) => x.display);
    return res.json({ q: raw, total: 0, categories: [], brands: [], listings: [], queries: popular });
  }
  const toks = q.split(' ').filter(Boolean).slice(0, 6);
  const where = toks.map(() => 'l.search_text LIKE ?').join(' AND ');
  const params = toks.map((x) => `%${x}%`);
  const total = db.get(`SELECT COUNT(*) AS n FROM listings l WHERE l.status = 'active' AND ${where}`, ...params).n;
  const listings = db.all(`SELECT ${L.CARD_COLS} FROM listings l WHERE l.status = 'active' AND ${where} ORDER BY l.views DESC LIMIT 5`, ...params)
    .map((l) => ({ id: l.id, title: l.title, price: L.card(l, ctx).price.formatted, cover: L.fileUrl(l.cover) }));
  const counts = new Map(db.all(`SELECT subcategory_id AS id, COUNT(*) AS n FROM listings WHERE status = 'active' GROUP BY subcategory_id`).map((x) => [x.id, x.n]));
  const categories = [];
  for (const root of cats.load().roots) {
    for (const c of [root, ...root.children]) {
      if (toks.every((tk) => c.searchText.includes(tk))) categories.push({ slug: c.slug, name: pick(c.names, req.lang), parent: c.parent_id ? pick(root.names, req.lang) : null, count: counts.get(c.id) || 0 });
    }
  }
  const brands = db.all(`SELECT brand, COUNT(*) AS n FROM listings WHERE status = 'active' AND brand IS NOT NULL GROUP BY LOWER(brand) ORDER BY n DESC`)
    .filter((b) => normalizeSearch(b.brand).startsWith(toks[0])).slice(0, 4).map((b) => ({ name: b.brand, count: b.n }));
  const queries = db.all(`SELECT display FROM search_log WHERE q LIKE ? AND q != ? AND results > 0 ORDER BY n DESC LIMIT 5`, `%${toks[0]}%`, q).map((x) => x.display);
  res.json({ q: raw, total, categories: categories.slice(0, 5), brands, listings, queries });
});

// Bo'limlar: e'lonlar, mutaxassislar, logistika va zayavkalar soni
r.get('/sections', (_req, res) => {
  const n = (sql, ...p) => db.get(sql, ...p).n;
  res.json({
    transportsale: n(`SELECT COUNT(*) AS n FROM listings WHERE status = 'active' AND kind = 'equipment' AND deal_type = 'sale'`),
    transportrental: n(`SELECT COUNT(*) AS n FROM listings WHERE status = 'active' AND deal_type = 'rent'`),
    sparepart: n(`SELECT COUNT(*) AS n FROM listings WHERE status = 'active' AND kind = 'part'`),
    cargologistic: n(`SELECT COUNT(*) AS n FROM logistics WHERE status = 'open' AND kind = 'cargo'`),
    transportlogistic: n(`SELECT COUNT(*) AS n FROM logistics WHERE status = 'open' AND kind = 'transport'`),
    fura: n(`SELECT COUNT(*) AS n FROM freight WHERE status = 'open' AND (expires_at IS NULL OR expires_at > datetime('now'))`),
    driver: n(`SELECT COUNT(*) AS n FROM specialists WHERE status = 'active' AND kind = 'driver'`) + n(`SELECT COUNT(*) AS n FROM jobs WHERE status = 'open' AND kind = 'driver'`),
    mechanic: n(`SELECT COUNT(*) AS n FROM specialists WHERE status = 'active' AND kind = 'mechanic'`) + n(`SELECT COUNT(*) AS n FROM jobs WHERE status = 'open' AND kind = 'mechanic'`),
    application: n(`SELECT COUNT(*) AS n FROM requests WHERE status = 'open'`),
  });
});

// Zayavkaga mos e'lonlar: bir xil bo'lim, avval o'sha mamlakat, byudjetga yaqin
r.get('/requests/:id/matches', (req, res) => {
  const x = db.get('SELECT * FROM requests WHERE id = ?', Number(req.params.id));
  if (!x || (x.status !== 'open' && req.user?.id !== x.user_id)) notFound();
  const ctx = { lang: req.lang, currency: req.currency, favs: L.favoritesSet(req.user?.id) };
  const budgetUsd = x.budget_max ? money.toUsd(x.budget_max, x.currency || 'USD') : null;
  const rows = L.cardsByIds(
    `SELECT l.* FROM listings l WHERE l.status = 'active' AND l.user_id != ? AND (l.subcategory_id = ? OR l.category_id = ?)
     ORDER BY (l.subcategory_id = ?) DESC, (l.country = ?) DESC, ${budgetUsd ? '(l.price_usd <= ?) DESC, ABS(COALESCE(l.price_usd, 0) - ?) ASC' : 'l.views DESC'} LIMIT 8`,
    budgetUsd ? [x.user_id, x.subcategory_id, x.category_id, x.subcategory_id, x.country, budgetUsd * 1.1, budgetUsd] : [x.user_id, x.subcategory_id, x.category_id, x.subcategory_id, x.country],
    ctx,
  );
  res.json(rows);
});

// ---------- Hisob-faktura PDF (yuridik shaxslar uchun) ----------
const FONT = path.join(path.dirname(require.resolve('dejavu-fonts-ttf/package.json')), 'ttf');
const LABELS = {
  ru: { title: 'СЧЁТ НА ОПЛАТУ', no: '№', date: 'Дата', seller: 'Поставщик', buyer: 'Покупатель', tin: 'ИНН', addr: 'Адрес', phone: 'Тел.', item: 'Наименование', qty: 'Кол-во', price: 'Цена', sum: 'Сумма', delivery: 'Доставка', vat: 'В т.ч. НДС', total: 'Итого к оплате', sign: 'Руководитель / Бухгалтер', note: 'Счёт сформирован на площадке HEMU.UZ' },
  uz: { title: "TO'LOV UCHUN HISOB-FAKTURA", no: '№', date: 'Sana', seller: 'Yetkazib beruvchi', buyer: 'Xaridor', tin: 'STIR', addr: 'Manzil', phone: 'Tel.', item: 'Nomi', qty: 'Soni', price: 'Narxi', sum: 'Summa', delivery: 'Yetkazib berish', vat: 'Shu jumladan QQS', total: "To'lovga jami", sign: 'Rahbar / Buxgalter', note: 'Hisob HEMU.UZ platformasida yaratildi' },
  en: { title: 'INVOICE', no: '№', date: 'Date', seller: 'Supplier', buyer: 'Buyer', tin: 'Tax ID', addr: 'Address', phone: 'Phone', item: 'Item', qty: 'Qty', price: 'Price', sum: 'Amount', delivery: 'Delivery', vat: 'incl. VAT', total: 'Total due', sign: 'Director / Accountant', note: 'Generated on the HEMU.UZ platform' },
};

r.get('/orders/:id/invoice.pdf', requireAuth, (req, res) => {
  const o = db.get('SELECT * FROM orders WHERE id = ?', Number(req.params.id));
  if (!o) notFound();
  if (o.buyer_id !== req.user.id && o.seller_id !== req.user.id && req.user.role !== 'admin') forbidden();
  const lab = LABELS[req.lang] || LABELS.ru;
  const fmt = (n) => money.formatAmount(n, o.currency, req.lang === 'uz' || req.lang === 'en' ? req.lang : 'ru');
  const party = (uid) => {
    const c = db.get('SELECT * FROM companies WHERE owner_id = ?', uid);
    const u = db.get('SELECT name, phone, email FROM users WHERE id = ?', uid);
    return c ? { name: c.name, tin: c.tin, addr: [c.city, c.address].filter(Boolean).join(', '), phone: c.phone || u.phone } : { name: u.name || u.phone, tin: null, addr: null, phone: u.phone };
  };
  const seller = party(o.seller_id);
  const buyer = party(o.buyer_id);
  const vatRate = o.listing_id ? db.get('SELECT vat_rate FROM listings WHERE id = ?', o.listing_id)?.vat_rate || 0 : 0;
  const vat = vatRate ? Math.round((o.total * vatRate) / (100 + vatRate) * 100) / 100 : 0;

  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `${lab.title} ${o.number}`, Producer: 'HEMU.UZ' } });
  doc.registerFont('r', path.join(FONT, 'DejaVuSans.ttf'));
  doc.registerFont('b', path.join(FONT, 'DejaVuSans-Bold.ttf'));
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="invoice-${o.number}.pdf"` });
  doc.pipe(res);

  const W = doc.page.width - 96;
  doc.rect(48, 40, 26, 26).fill('#0b6fcf');
  doc.fillColor('#fff').font('b').fontSize(16).text('↗', 52, 43);
  doc.fillColor('#0e3352').font('b').fontSize(18).text('HEMU.UZ', 82, 43);
  doc.fillColor('#12243a').font('b').fontSize(15).text(`${lab.title} ${lab.no} ${o.number}`, 48, 90);
  doc.font('r').fontSize(10).fillColor('#555').text(`${lab.date}: ${o.created_at.slice(0, 10)}`, 48, 112);

  const block = (title, p, y) => {
    doc.font('b').fontSize(10).fillColor('#12243a').text(title, 48, y);
    doc.font('r').fontSize(10).fillColor('#222').text(p.name || '—', 160, y, { width: W - 112 });
    let yy = doc.y + 2;
    for (const [k, v] of [[lab.tin, p.tin], [lab.addr, p.addr], [lab.phone, p.phone]]) {
      if (!v) continue;
      doc.fillColor('#666').text(`${k}: `, 160, yy, { continued: true }).fillColor('#222').text(v);
      yy = doc.y + 2;
    }
    return yy + 8;
  };
  let y = block(lab.seller, seller, 140);
  y = block(lab.buyer, buyer, y);

  // Jadval
  const cols = [[lab.item, 250], [lab.qty, 60], [lab.price, 95], [lab.sum, W - 405]];
  y += 6;
  doc.rect(48, y, W, 22).fill('#eef3f8');
  let x = 54;
  doc.fillColor('#12243a').font('b').fontSize(9);
  for (const [h, w] of cols) { doc.text(h, x, y + 7, { width: w - 8 }); x += w; }
  y += 26;
  doc.font('r').fontSize(10).fillColor('#222');
  const row = [o.title, String(o.qty), fmt(o.unit_price), fmt(o.unit_price * o.qty)];
  x = 54;
  const h0 = doc.heightOfString(o.title, { width: cols[0][1] - 8 });
  row.forEach((v, i) => { doc.text(v, x, y, { width: cols[i][1] - 8 }); x += cols[i][1]; });
  y += Math.max(h0, 14) + 10;
  doc.moveTo(48, y).lineTo(48 + W, y).strokeColor('#d8e0e8').stroke();
  y += 10;
  const totals = [];
  if (o.delivery_cost) totals.push([lab.delivery, fmt(o.delivery_cost)]);
  if (vat) totals.push([`${lab.vat} ${vatRate}%`, fmt(vat)]);
  for (const [k, v] of totals) {
    doc.font('r').fontSize(10).fillColor('#555').text(k, 300, y, { width: 150, align: 'right' });
    doc.fillColor('#222').text(v, 460, y, { width: W - 412, align: 'right' });
    y += 16;
  }
  doc.font('b').fontSize(12).fillColor('#12243a').text(lab.total, 300, y + 4, { width: 150, align: 'right' });
  doc.text(fmt(o.total), 460, y + 4, { width: W - 412, align: 'right' });

  doc.font('r').fontSize(9).fillColor('#888').text(lab.sign, 48, y + 70);
  doc.moveTo(48, y + 100).lineTo(260, y + 100).strokeColor('#bbb').stroke();
  doc.fontSize(8).text(lab.note, 48, doc.page.height - 70, { width: W, align: 'center' });
  doc.end();
});

module.exports = { router: r, logSearch };
