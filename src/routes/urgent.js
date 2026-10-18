// "Hozir texnika kerak" — tezkor ijara chaqiruvi (texnika uchun Yandex Go).
//
// Mijoz joylashuv, texnika turi va necha soatga kerakligini yozadi → yaqin atrofdagi (50 km)
// ijara e'loni bor egalarga darhol xabar ketadi (sayt, brauzer push, Telegram) → kim birinchi
// "Qabul qilaman" desa, buyurtma o'shaniki: mijozga egasining telefoni, egasiga mijozning telefoni
// ochiladi, qolganlarga "band bo'ldi" xabari boradi. Javob bo'lmasa chaqiruv 2 soatda yopiladi.
const { Router } = require('express');
const db = require('../db');
const cats = require('../lib/categories');
const { requireAuth, rateLimit } = require('../lib/auth');
const { fail, notFound, forbidden, validate } = require('../lib/http');
const { notify } = require('../lib/notify');
const { distanceKm } = require('../lib/listings');
const { COUNTRY, isValidRegion, regionName } = require('../geo');
const { pick } = require('../i18n');

const r = Router();
const RADIUS_KM = 50;
const MAX_TARGETS = 40;
const TTL_HOURS = 2;

// Mos texnika egalari: ijara e'loni (faol) — avval aniq bo'lim, so'ng yo'nalish; eng yaqini birinchi
function findOwners(x) {
  const rows = db.all(
    `SELECT l.id, l.user_id, l.lat, l.lng, l.region, l.title, l.subcategory_id, l.price, l.currency, l.price_unit
     FROM listings l
     WHERE l.status = 'active' AND l.deal_type = 'rent' AND l.country = ? AND l.user_id != ?
       AND (l.subcategory_id = ? OR l.category_id = ?)`,
    x.country, x.user_id, x.subcategory_id ?? -1, x.category_id,
  );
  const geo = x.lat !== null && x.lat !== undefined;
  const scored = rows.map((l) => ({
    ...l,
    dist: geo && l.lat !== null ? distanceKm({ lat: x.lat, lng: x.lng }, { lat: l.lat, lng: l.lng }) : null,
    exact: l.subcategory_id === x.subcategory_id,
  })).filter((l) => (l.dist !== null ? l.dist <= RADIUS_KM : !geo || (x.region && l.region === x.region)));
  // Joylashuvi yo'q e'lonlar: o'sha viloyatdagilar (koordinatasiz e'lonlarni ham yo'qotmaslik uchun)
  if (geo && x.region) {
    for (const l of rows) if (l.lat === null && l.region === x.region) scored.push({ ...l, dist: null, exact: l.subcategory_id === x.subcategory_id });
  }
  scored.sort((a, b) => (b.exact - a.exact) || ((a.dist ?? 999) - (b.dist ?? 999)));
  const byUser = new Map();
  for (const l of scored) if (!byUser.has(l.user_id)) byUser.set(l.user_id, l);
  return [...byUser.values()].slice(0, MAX_TARGETS);
}

function view(x, req) {
  const me = req.user?.id;
  const isOwner = x.user_id === me;
  const target = me ? db.get('SELECT * FROM urgent_targets WHERE call_id = ? AND user_id = ?', x.id, me) : null;
  if (!isOwner && !target && req.user?.role !== 'admin') forbidden();
  const cat = cats.byId(x.subcategory_id) || cats.byId(x.category_id);
  const won = x.taken_by === me;
  const taker = x.taken_by ? db.get('SELECT id, name, phone FROM users WHERE id = ?', x.taken_by) : null;
  const tl = x.listing_id ? db.get('SELECT id, title FROM listings WHERE id = ?', x.listing_id) : null;
  const buyer = db.get('SELECT name, phone FROM users WHERE id = ?', x.user_id);
  const expired = x.status === 'open' && x.expires_at < new Date().toISOString().replace('T', ' ').slice(0, 19);
  return {
    id: x.id,
    status: expired ? 'expired' : x.status,
    category: cat ? { slug: cat.slug, name: pick(cat.names, req.lang) } : null,
    hours: x.hours,
    start: x.start_text,
    note: x.note,
    address: x.address,
    region_name: x.region ? regionName(x.country, x.region, req.lang) : null,
    geo: x.lat !== null ? { lat: x.lat, lng: x.lng } : null,
    created_at: x.created_at,
    expires_at: x.expires_at,
    notified: db.get('SELECT COUNT(*) AS n FROM urgent_targets WHERE call_id = ?', x.id).n,
    is_owner: isOwner,
    // Mijozga: qabul qilgan texnika egasi (faqat qabul qilingach)
    taker: isOwner && taker ? { name: taker.name, phone: taker.phone, listing: tl ? { id: tl.id, title: tl.title } : null } : null,
    // Texnika egasiga: masofa, va g'olib bo'lsa — mijoz telefoni
    target: target ? { distance_km: target.distance_km, listing_id: target.listing_id, won } : null,
    customer: won || isOwner ? { name: buyer?.name, phone: buyer?.phone } : { name: buyer?.name ? buyer.name.split(' ')[0] : null },
  };
}

const load = (id) => db.get('SELECT * FROM urgent_calls WHERE id = ?', Number(id)) || notFound();

// Chaqiruv yaratish
r.post('/urgent', requireAuth, rateLimit({ name: 'urgent', windowMs: 3600000, max: 10, key: (req) => req.user.id }), (req, res) => {
  const v = validate(req.body, {
    category: { type: 'string', max: 60, required: true },
    hours: { type: 'int', min: 1, max: 240, required: true },
    start: { type: 'string', max: 60 },
    note: { type: 'string', max: 500 },
    address: { type: 'string', max: 200 },
    region: { type: 'string', max: 40 },
  });
  const c = cats.find(v.category);
  if (!c) fail(422, 'err.validation', { category: 'invalid' });
  const country = COUNTRY[req.user.country] ? req.user.country : 'UZ';
  if (v.region && !isValidRegion(country, v.region)) fail(422, 'err.validation', { region: 'invalid' });
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  const hasGeo = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
  if (!hasGeo && !v.region) fail(422, 'err.validation', { location: 'required' });
  // Bir vaqtning o'zida bitta ochiq chaqiruv
  if (db.get(`SELECT 1 FROM urgent_calls WHERE user_id = ? AND status = 'open' AND expires_at > datetime('now')`, req.user.id)) fail(409, 'err.urgent_open');
  const id = db.insert('urgent_calls', {
    user_id: req.user.id,
    category_id: c.parent_id || c.id,
    subcategory_id: c.parent_id ? c.id : null,
    country,
    region: v.region || null,
    lat: hasGeo ? lat : null,
    lng: hasGeo ? lng : null,
    address: v.address || null,
    hours: v.hours,
    start_text: v.start || null,
    note: v.note || null,
  });
  db.run(`UPDATE urgent_calls SET expires_at = datetime('now', '+${TTL_HOURS} hours') WHERE id = ?`, id);
  const x = load(id);
  const owners = findOwners(x);
  const catName = pick(c.names, 'ru');
  for (const o of owners) {
    db.insert('urgent_targets', { call_id: id, user_id: o.user_id, listing_id: o.id, distance_km: o.dist });
    notify(o.user_id, 'urgent_call', { category_slug: c.slug, category: catName, hours: v.hours, km_txt: o.dist !== null && o.dist !== undefined ? ` · ${o.dist} km` : '', call_id: id }, `/urgent/${id}`);
  }
  res.status(201).json(view(load(id), req));
});

r.get('/urgent/:id', requireAuth, (req, res) => res.json(view(load(req.params.id), req)));

// Texnika egasi qabul qiladi — birinchisi yutadi
r.post('/urgent/:id/accept', requireAuth, (req, res) => {
  const x = load(req.params.id);
  const t = db.get('SELECT * FROM urgent_targets WHERE call_id = ? AND user_id = ?', x.id, req.user.id);
  if (!t) forbidden();
  const won = db.run(
    `UPDATE urgent_calls SET status = 'taken', taken_by = ?, listing_id = ?, taken_at = datetime('now')
     WHERE id = ? AND status = 'open' AND expires_at > datetime('now')`,
    req.user.id, t.listing_id, x.id,
  ).changes;
  if (!won) fail(409, 'err.urgent_taken');
  const owner = db.get('SELECT name, phone FROM users WHERE id = ?', req.user.id);
  notify(x.user_id, 'urgent_taken', { name: owner?.name || '', phone: owner?.phone || '', call_id: x.id }, `/urgent/${x.id}`);
  for (const o of db.all('SELECT user_id FROM urgent_targets WHERE call_id = ? AND user_id != ?', x.id, req.user.id)) {
    notify(o.user_id, 'urgent_closed', { call_id: x.id }, `/urgent/${x.id}`);
  }
  res.json(view(load(x.id), req));
});

// Mijoz bekor qiladi
r.post('/urgent/:id/cancel', requireAuth, (req, res) => {
  const x = load(req.params.id);
  if (x.user_id !== req.user.id) forbidden();
  if (x.status !== 'open') fail(409, 'err.invalid_status');
  db.run(`UPDATE urgent_calls SET status = 'cancelled' WHERE id = ?`, x.id);
  res.json(view(load(x.id), req));
});

// Mening chaqiruvlarim (mijoz) va menga kelganlar (texnika egasi)
r.get('/my/urgent', requireAuth, (req, res) => {
  const mine = db.all('SELECT * FROM urgent_calls WHERE user_id = ? ORDER BY id DESC LIMIT 20', req.user.id);
  const incoming = db.all(
    `SELECT c.* FROM urgent_calls c JOIN urgent_targets t ON t.call_id = c.id
     WHERE t.user_id = ? AND c.created_at > datetime('now', '-7 days') ORDER BY c.id DESC LIMIT 30`,
    req.user.id,
  );
  res.json({ mine: mine.map((x) => view(x, req)), incoming: incoming.map((x) => view(x, req)) });
});

// Formada tanlash uchun: ijaraga beriladigan bo'limlar va hozir mavjud texnika soni
r.get('/urgent-options', (req, res) => {
  const counts = new Map(db.all(`SELECT subcategory_id AS id, COUNT(*) AS n FROM listings WHERE status = 'active' AND deal_type = 'rent' GROUP BY subcategory_id`).map((x) => [x.id, x.n]));
  const out = [];
  for (const root of cats.load().roots) {
    const subs = root.children.filter((s) => counts.get(s.id)).map((s) => ({ slug: s.slug, name: pick(s.names, req.lang), count: counts.get(s.id) }));
    if (subs.length) out.push({ slug: root.slug, name: pick(root.names, req.lang), items: subs });
  }
  res.json(out);
});

function expireJob() {
  db.run(`UPDATE urgent_calls SET status = 'expired' WHERE status = 'open' AND expires_at < datetime('now')`);
}

module.exports = { router: r, expireJob, findOwners };
