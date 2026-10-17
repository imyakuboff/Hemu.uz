const { Router } = require('express');
const db = require('../db');
const L = require('../lib/listings');
const money = require('../lib/money');
const upload = require('../lib/upload');
const { render, notify } = require('../lib/notify');
const { requireAuth } = require('../lib/auth');
const { fail, notFound, forbidden, validate, paging, pageResult } = require('../lib/http');
const { t, byCode } = require('../i18n');
const { COUNTRY, isValidRegion, normalizePhone, countryName, regionName } = require('../geo');
const { ACTIVITIES } = require('../lib/company');
const legal = require('../lib/legal');

const r = Router();

// ---------- Kompaniya ----------
const COMPANY_RULES = {
  name: { type: 'string', min: 2, max: 120, required: true },
  tin: { type: 'string', max: 20, pattern: /^[0-9A-Za-z-]{5,20}$/ },
  reg_number: { type: 'string', max: 30 },
  activity: { type: 'string', max: 120 },
  about: { type: 'string', max: 3000 },
  country: { type: 'enum', values: Object.keys(COUNTRY) },
  region: { type: 'string', max: 40 },
  city: { type: 'string', max: 80 },
  address: { type: 'string', max: 200 },
  phone: { type: 'string', max: 30 },
  email: { type: 'string', max: 120, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  website: { type: 'string', max: 200 },
  work_hours: { type: 'string', max: 80 },
  legal_form: { type: 'string', max: 20 },
};

// Profil to'ldirilganligi ("Профиль заполнен на 92%")
function completeness(c, u) {
  const hasCert = db.get(`SELECT 1 FROM company_documents WHERE company_id = ? AND doc_type = 'reg_cert'`, c.id);
  const fields = [c.name, c.legal_form, c.tin, c.reg_number || c.legal_form, c.bank_account, c.activity || c.activities, c.about, c.city, c.address, c.phone, c.email, c.work_hours, c.logo, u?.name, u?.email, hasCert, c.verification === 'verified' ? 1 : null];
  return Math.round((fields.filter(Boolean).length / fields.length) * 100);
}

function companyView(c, req, { full = false } = {}) {
  const u = db.get('SELECT name, email FROM users WHERE id = ?', c.owner_id);
  const v = {
    id: c.id,
    name: c.name,
    activity: c.activity,
    about: c.about,
    country: c.country,
    country_name: countryName(c.country, req.lang),
    region: c.region,
    region_name: regionName(c.country, c.region, req.lang),
    city: c.city,
    address: c.address,
    website: c.website,
    work_hours: c.work_hours,
    logo: L.fileUrl(c.logo),
    verified: Boolean(L.verifiedType(c.owner_id, c)),
    verified_type: L.verifiedType(c.owner_id, c),
    rating: Math.round(c.rating_avg * 10) / 10,
    reviews_count: c.rating_count,
    since: c.created_at.slice(0, 4),
    active_listings: db.get(`SELECT COUNT(*) AS n FROM listings WHERE company_id = ? AND status = 'active'`, c.id).n,
    response_minutes: L.responseMinutes(c.owner_id),
  };
  if (full) {
    Object.assign(v, {
      tin: c.tin,
      reg_number: c.reg_number,
      activities: JSON.parse(c.activities || '[]'),
      phone: c.phone,
      email: c.email,
      verification: c.verification,
      verified_at: c.verified_at,
      completeness: completeness(c, u),
      ...requisitesOf(c, req.lang),
      documents: docsOf(c, req.lang),
      missing_docs: missingDocs(c),
      reject_reason: c.reject_reason,
      blocked: Boolean(c.blocked),
    });
  }
  return v;
}

// Rekvizitlar: tashkiliy-huquqiy shakl, bank, soliq ma'lumotlari
function requisitesOf(c, lang) {
  const form = legal.formOf(c.country, c.legal_form);
  return {
    legal_form: c.legal_form,
    legal_form_name: form ? legal.spec(c.country, lang).forms.find((f) => f.code === c.legal_form)?.name : null,
    individual: Boolean(form?.individual),
    ...Object.fromEntries(legal.FIELDS.map((k) => [k, c[k] ?? null])),
  };
}
function docsOf(c, lang) {
  return db.all('SELECT id, doc_type, original_name, size, created_at FROM company_documents WHERE company_id = ? ORDER BY id', c.id)
    .map((d) => ({ ...d, type_name: legal.docName(d.doc_type, lang) }));
}
// Hali yuklanmagan majburiy hujjatlar (guvohnoma)
function missingDocs(c) {
  const have = new Set(db.all('SELECT doc_type FROM company_documents WHERE company_id = ?', c.id).map((d) => d.doc_type));
  return legal.REQUIRED_DOCS.filter((d) => !have.has(d));
}
function prepareCompany(req, body, existing) {
  // Raqamlar bo'sh joy bilan kiritilsa ham qabul qilinadi ("301 234 567")
  body = { ...body };
  for (const k of ['tin', 'reg_number']) if (typeof body[k] === 'string') body[k] = body[k].replace(/\s+/g, '');
  const v = validate(body, COMPANY_RULES, { partial: Boolean(existing) });
  v.country = v.country || existing?.country || req.user.country;
  if (v.region && !isValidRegion(v.country, v.region)) fail(422, 'err.validation', { region: 'invalid' });
  if (v.phone) {
    const p = normalizePhone(v.phone, v.country);
    if (!p) fail(422, 'err.invalid_phone');
    v.phone = p.e164;
  }
  // Tashkiliy-huquqiy shakl va mamlakatga xos rekvizitlar (STIR, MFO, h/r, IBAN, BIK ...)
  const form = v.legal_form || existing?.legal_form;
  if (v.legal_form && !legal.formOf(v.country, v.legal_form)) fail(422, 'err.validation', { legal_form: 'invalid' });
  if (form && legal.formOf(v.country, form)) {
    const rq = legal.validateRequisites(v.country, form, body);
    if (Object.keys(rq.errors).length) fail(422, 'err.validation', rq.errors);
    Object.assign(v, rq.values);
  } else if (v.tin !== undefined) {
    v.tin = v.tin.replace(/\s+/g, '');
  }
  if (!existing && !v.legal_form) fail(422, 'err.validation', { legal_form: 'required' });
  // Faoliyat turlari: maxsus texnika sotish, ehtiyot qismlar va h.k.
  if (Array.isArray(body.activities)) {
    const acts = [...new Set(body.activities.filter((a) => ACTIVITIES.includes(a)))];
    if (!acts.length) fail(422, 'err.validation', { activities: 'required' });
    v.activities = JSON.stringify(acts);
  }
  return v;
}

r.get('/companies/:id', (req, res) => {
  const c = db.get('SELECT * FROM companies WHERE id = ?', Number(req.params.id));
  if (!c || (c.blocked && req.user?.role !== 'admin')) notFound();
  const pg = paging(req.query, 12);
  const ctx = { lang: req.lang, currency: req.currency, favs: L.favoritesSet(req.user?.id) };
  const { rows, total } = L.search({ company: c.id, sort: req.query.sort, category: req.query.category, q: req.query.q }, ctx, pg);
  res.json({
    ...companyView(c, req),
    ...require('./business').storeExtras(c.id, req),
    listings: pageResult(rows, total, pg),
    reviews: reviewsOf(c.owner_id, 5),
  });
});

function reviewsOf(sellerId, limit, offset = 0) {
  return db.all(
    `SELECT r.id, r.rating, r.text, r.created_at, u.name AS author FROM reviews r JOIN users u ON u.id = r.author_id
     WHERE r.seller_id = ? ORDER BY r.id DESC LIMIT ? OFFSET ?`,
    sellerId, limit, offset,
  );
}

r.get('/companies/:id/reviews', (req, res) => {
  const c = db.get('SELECT * FROM companies WHERE id = ?', Number(req.params.id));
  if (!c) notFound();
  const pg = paging(req.query, 20);
  const total = db.get('SELECT COUNT(*) AS n FROM reviews WHERE seller_id = ?', c.owner_id).n;
  const dist = Object.fromEntries(db.all('SELECT rating, COUNT(*) AS n FROM reviews WHERE seller_id = ? GROUP BY rating', c.owner_id).map((x) => [x.rating, x.n]));
  const out = pageResult(reviewsOf(c.owner_id, pg.perPage, pg.offset), total, pg);
  out.distribution = [5, 4, 3, 2, 1].map((s) => ({ rating: s, count: dist[s] || 0 }));
  res.json(out);
});

r.get('/my/company', requireAuth, (req, res) => {
  const c = db.get('SELECT * FROM companies WHERE owner_id = ?', req.user.id);
  if (!c) notFound();
  res.json(companyView(c, req, { full: true }));
});

r.post('/my/company', requireAuth, (req, res) => {
  if (db.get('SELECT 1 FROM companies WHERE owner_id = ?', req.user.id)) fail(409, 'err.duplicate');
  const v = prepareCompany(req, req.body || {}, null);
  const id = db.insert('companies', { ...v, owner_id: req.user.id });
  // Avvalgi shaxsiy e'lonlar kompaniyaga bog'lanadi
  db.run('UPDATE listings SET company_id = ? WHERE user_id = ?', id, req.user.id);
  res.status(201).json(companyView(db.get('SELECT * FROM companies WHERE id = ?', id), req, { full: true }));
});

r.patch('/my/company', requireAuth, (req, res) => {
  const c = db.get('SELECT * FROM companies WHERE owner_id = ?', req.user.id);
  if (!c) notFound();
  const v = prepareCompany(req, req.body || {}, c);
  // Rekvizitlar o'zgarsa — qayta tekshiruv
  const changed = (k) => v[k] !== undefined && v[k] !== c[k];
  if (c.verification === 'verified' && ['name', 'tin', 'reg_number', 'legal_form', 'bank_account'].some(changed)) {
    v.verification = 'pending';
    v.verified_at = null;
  }
  db.update('companies', c.id, v);
  res.json(companyView(db.get('SELECT * FROM companies WHERE id = ?', c.id), req, { full: true }));
});

r.post('/my/company/logo', requireAuth, upload.avatars.single('file'), async (req, res) => {
  const c = db.get('SELECT * FROM companies WHERE owner_id = ?', req.user.id);
  if (!c || !req.file) {
    if (req.file) upload.removeUpload(`avatars/${req.file.filename}`);
    fail(c ? 422 : 404, c ? 'err.file_type' : 'err.not_found');
  }
  await upload.optimize(upload.verifyFiles([req.file]), 'avatars');
  upload.removeUpload(c.logo);
  db.update('companies', c.id, { logo: `avatars/${req.file.filename}` });
  res.json(companyView(db.get('SELECT * FROM companies WHERE id = ?', c.id), req, { full: true }));
});

// Hujjatlarni yuklab tekshiruvga yuborish
// Hujjatlarni yuklash: doc_type — reg_cert (guvohnoma, majburiy), charter, license, director, passport, tin_cert
r.post('/my/company/verification', requireAuth, upload.docs.array('files', 10), (req, res) => {
  const c = db.get('SELECT * FROM companies WHERE owner_id = ?', req.user.id);
  const cleanup = () => { for (const f of req.files || []) upload.removeUpload(`docs/${f.filename}`); };
  if (!c) { cleanup(); notFound(); }
  const type = String(req.body?.doc_type || 'reg_cert');
  if (!legal.DOCS[type]) { cleanup(); fail(422, 'err.validation', { doc_type: 'invalid' }); }
  const files = upload.verifyFiles(req.files);
  for (const f of files) db.insert('company_documents', { company_id: c.id, doc_type: type, path: `docs/${f.filename}`, original_name: f.originalname.slice(0, 120), size: f.size });
  // Guvohnoma va STIR bo'lsa — tekshiruvga yuboriladi
  const fresh = db.get('SELECT * FROM companies WHERE id = ?', c.id);
  // Tekshiruvga yuborish uchun guvohnoma yetarli (STIR va rekvizitlar ixtiyoriy)
  if (c.verification !== 'verified' && !missingDocs(fresh).length) {
    db.run(`UPDATE companies SET verification = 'pending', reject_reason = NULL WHERE id = ?`, c.id);
    for (const a of db.all(`SELECT id FROM users WHERE role = 'admin'`)) notify(a.id, 'company_new', { name: c.name }, '/admin/companies');
  }
  res.json(companyView(db.get('SELECT * FROM companies WHERE id = ?', c.id), req, { full: true }));
});

// Tasdiqlanmagan kompaniya hujjatni o'chira oladi
r.delete('/my/company/documents/:id', requireAuth, (req, res) => {
  const c = db.get('SELECT * FROM companies WHERE owner_id = ?', req.user.id);
  if (!c) notFound();
  const d = db.get('SELECT * FROM company_documents WHERE id = ? AND company_id = ?', Number(req.params.id), c.id);
  if (!d) notFound();
  if (c.verification === 'verified') fail(409, 'err.invalid_status');
  db.run('DELETE FROM company_documents WHERE id = ?', d.id);
  upload.removeUpload(d.path);
  if (missingDocs(c).length && c.verification === 'pending') db.run(`UPDATE companies SET verification = 'none' WHERE id = ?`, c.id);
  res.json(companyView(db.get('SELECT * FROM companies WHERE id = ?', c.id), req, { full: true }));
});

// Mamlakat bo'yicha tashkiliy-huquqiy shakllar, rekvizit maydonlari va kerakli hujjatlar
r.get('/legal-forms', (req, res) => {
  const country = String(req.query.country || req.country || 'UZ').toUpperCase();
  res.json(legal.spec(COUNTRY[country] ? country : 'UZ', req.lang));
});
// ---------- Sotuvchi kabineti ----------
function sumViews(userId, fromDays, toDays) {
  return db.get(
    `SELECT COALESCE(SUM(s.views), 0) AS n FROM listing_stats s JOIN listings l ON l.id = s.listing_id
     WHERE l.user_id = ? AND s.day > date('now', ?) AND s.day <= date('now', ?)`,
    userId, `-${fromDays} days`, `-${toDays} days`,
  ).n;
}

function leadView(x, lang, currency) {
  const buyer = db.get('SELECT name FROM users WHERE id = ?', x.buyer_id);
  const bc = db.get('SELECT name FROM companies WHERE owner_id = ?', x.buyer_id);
  return {
    id: x.id,
    type: x.type || 'lead',
    kind: x.kind,
    from: [buyer?.name, bc?.name].filter(Boolean).join(' · '),
    buyer_id: x.buyer_id,
    listing: { id: x.listing_id, title: x.title },
    message: x.message,
    preferred_at: x.preferred_at,
    amount: x.amount,
    amount_formatted: x.amount !== null && x.amount !== undefined ? money.formatAmount(x.amount, x.currency, lang) : null,
    status: x.status,
    status_label: x.type === 'order' ? t(lang, `os.${x.status}`) : t(lang, `lead.${x.status}`),
    created_at: x.created_at,
  };
}

r.get('/seller/dashboard', requireAuth, (req, res) => {
  const me = req.user.id;
  const { lang } = req;
  const company = db.get('SELECT * FROM companies WHERE owner_id = ?', me);

  const active = db.get(`SELECT COUNT(*) AS n FROM listings WHERE user_id = ? AND status = 'active'`, me).n;
  const activeNew = db.get(`SELECT COUNT(*) AS n FROM listings WHERE user_id = ? AND status = 'active' AND published_at >= datetime('now', '-30 days')`, me).n;
  const viewsTotal = db.get('SELECT COALESCE(SUM(views), 0) AS n FROM listings WHERE user_id = ?', me).n;
  const week = sumViews(me, 7, 0);
  const prevWeek = sumViews(me, 14, 7);
  const leadsNew = db.get(`SELECT COUNT(*) AS n FROM leads WHERE seller_id = ? AND status IN ('new', 'awaiting', 'negotiating')`, me).n
    + db.get(`SELECT COUNT(*) AS n FROM orders WHERE seller_id = ? AND status = 'new'`, me).n;
  const leadsWeek = db.get(`SELECT COUNT(*) AS n FROM leads WHERE seller_id = ? AND created_at >= datetime('now', '-7 days')`, me).n
    + db.get(`SELECT COUNT(*) AS n FROM orders WHERE seller_id = ? AND created_at >= datetime('now', '-7 days')`, me).n;
  const rating = company
    ? { avg: Math.round(company.rating_avg * 10) / 10, count: company.rating_count }
    : (() => {
      const x = db.get('SELECT AVG(rating) AS a, COUNT(*) AS n FROM reviews WHERE seller_id = ?', me);
      return { avg: x.n ? Math.round(x.a * 10) / 10 : 0, count: x.n };
    })();

  // 7 kunlik grafik
  const days = [];
  const wd = new Intl.DateTimeFormat(byCode[lang]?.locale || 'en-US', { weekday: 'short', timeZone: 'UTC' });
  const stats = Object.fromEntries(
    db.all(
      `SELECT s.day, SUM(s.views) AS views, SUM(s.phone_reveals) AS phones, SUM(s.favorites) AS favs FROM listing_stats s
       JOIN listings l ON l.id = s.listing_id WHERE l.user_id = ? AND s.day > date('now', '-7 days') GROUP BY s.day`,
      me,
    ).map((x) => [x.day, x]),
  );
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    days.push({ day: key, label: wd.format(d), views: stats[key]?.views || 0, phone_reveals: stats[key]?.phones || 0, favorites: stats[key]?.favs || 0 });
  }

  // "Новые заявки и заказы": arizalar va buyurtmalar birga
  const leadRows = db.all(
    `SELECT x.*, 'lead' AS type, l.title FROM leads x JOIN listings l ON l.id = x.listing_id WHERE x.seller_id = ? AND x.status != 'closed' ORDER BY x.id DESC LIMIT 5`,
    me,
  );
  const orderRows = db.all(
    `SELECT o.id, o.buyer_id, o.listing_id, o.title, o.total AS amount, o.currency, o.status, o.created_at, 'order' AS type, NULL AS kind,
       (o.qty || ' × ' || o.title) AS message, NULL AS preferred_at
     FROM orders o WHERE o.seller_id = ? AND o.status IN ('new', 'confirmed') ORDER BY o.id DESC LIMIT 5`,
    me,
  );
  const inbox = [...leadRows, ...orderRows]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 6)
    .map((x) => leadView(x, lang, req.currency));

  const myListings = db.all(
    `SELECT ${L.CARD_COLS}, (SELECT COUNT(*) FROM conversations c WHERE c.listing_id = l.id) AS conversations
     FROM listings l WHERE l.user_id = ? AND l.status = 'active' ORDER BY l.views DESC LIMIT 3`,
    me,
  ).map((row) => ({ ...L.card(row, { lang, currency: req.currency }), conversations: row.conversations }));

  const events = db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 6', me).map((x) => render(x, lang));
  const u = db.get('SELECT name, email FROM users WHERE id = ?', me);

  res.json({
    company: company ? { id: company.id, name: company.name, activity: company.activity, city: company.city, verified: company.verification === 'verified', verification: company.verification } : null,
    stats: {
      active_listings: { value: active, delta_month: activeNew },
      views: { value: viewsTotal, week, prev_week: prevWeek, change_pct: prevWeek ? Math.round(((week - prevWeek) / prevWeek) * 100) : null },
      new_leads: { value: leadsNew, delta_week: leadsWeek },
      rating: { value: rating.avg, reviews: rating.count },
    },
    views_chart: days,
    profile: { completeness: company ? completeness(company, u) : null, response_minutes: L.responseMinutes(me) },
    inbox,
    listings: myListings,
    events,
  });
});

r.get('/seller/leads', requireAuth, (req, res) => {
  const pg = paging(req.query, 20);
  const st = ['new', 'awaiting', 'negotiating', 'closed'].includes(req.query.status) ? req.query.status : null;
  const params = st ? [req.user.id, st] : [req.user.id];
  const where = `x.seller_id = ? ${st ? 'AND x.status = ?' : ''}`;
  const total = db.get(`SELECT COUNT(*) AS n FROM leads x WHERE ${where}`, ...params).n;
  const rows = db.all(`SELECT x.*, l.title FROM leads x JOIN listings l ON l.id = x.listing_id WHERE ${where} ORDER BY x.id DESC LIMIT ? OFFSET ?`, ...params, pg.perPage, pg.offset);
  res.json(pageResult(rows.map((x) => leadView(x, req.lang, req.currency)), total, pg));
});

r.patch('/seller/leads/:id', requireAuth, (req, res) => {
  const v = validate(req.body, { status: { type: 'enum', values: ['new', 'awaiting', 'negotiating', 'closed'], required: true } });
  const x = db.get('SELECT * FROM leads WHERE id = ?', Number(req.params.id));
  if (!x) notFound();
  if (x.seller_id !== req.user.id) forbidden();
  db.run('UPDATE leads SET status = ? WHERE id = ?', v.status, x.id);
  const row = db.get('SELECT x.*, l.title FROM leads x JOIN listings l ON l.id = x.listing_id WHERE x.id = ?', x.id);
  res.json(leadView(row, req.lang, req.currency));
});

// Xaridor yuborgan arizalar
r.get('/my/leads', requireAuth, (req, res) => {
  const rows = db.all('SELECT x.*, l.title FROM leads x JOIN listings l ON l.id = x.listing_id WHERE x.buyer_id = ? ORDER BY x.id DESC LIMIT 100', req.user.id);
  res.json(rows.map((x) => leadView(x, req.lang, req.currency)));
});

// Batafsil statistika: ?days=30
r.get('/seller/stats', requireAuth, (req, res) => {
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
  const rows = db.all(
    `SELECT s.day, SUM(s.views) AS views, SUM(s.phone_reveals) AS phone_reveals, SUM(s.favorites) AS favorites
     FROM listing_stats s JOIN listings l ON l.id = s.listing_id
     WHERE l.user_id = ? AND s.day > date('now', ?) ${req.query.listing_id ? 'AND l.id = ?' : ''} GROUP BY s.day ORDER BY s.day`,
    ...[req.user.id, `-${days} days`, ...(req.query.listing_id ? [Number(req.query.listing_id)] : [])],
  );
  res.json({ days, items: rows });
});

module.exports = { router: r, companyView, requisitesOf, docsOf, missingDocs, prepareCompany };
