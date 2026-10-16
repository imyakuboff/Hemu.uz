const db = require('../db');
const config = require('../config');
const cats = require('./categories');
const money = require('./money');
const promos = require('./promos');
const { t, normalizeSearch } = require('../i18n');
const { countryName, regionName, maskPhone } = require('../geo');
const { parseJson } = require('./http');

// '/img/...' — frontend bilan birga keladigan demo rasmlar
const fileUrl = (p) => (!p ? null : /^https?:\/\//.test(p) || p.startsWith('/') ? p : `${config.publicUrl}/uploads/${p}`);

function buildSearchText(l) {
  const cat = cats.byId(l.category_id);
  const sub = cats.byId(l.subcategory_id);
  const compat = Array.isArray(l.compatibility) ? l.compatibility.join(' ') : parseJson(l.compatibility, []).join(' ');
  return [
    normalizeSearch([l.title, l.brand, l.model, l.part_number, l.manufacturer, l.analogs, compat, l.city, l.description].filter(Boolean).join(' ')),
    cat?.searchText,
    sub?.searchText,
  ].filter(Boolean).join(' ');
}

// Sotuvchi kartochkasi ("ООО «ТехноПарк» · Компания проверена · ★ 4,9 · 42 отзыва")
function sellerInfo(userId, companyId) {
  if (companyId) {
    const c = db.get(
      `SELECT c.*, (SELECT COUNT(*) FROM listings WHERE company_id = c.id AND status = 'active') AS active_listings
       FROM companies c WHERE c.id = ?`,
      companyId,
    );
    if (c) {
      return {
        type: 'company',
        user_id: c.owner_id,
        company_id: c.id,
        name: c.name,
        verified: c.verification === 'verified',
        rating: Math.round(c.rating_avg * 10) / 10,
        reviews_count: c.rating_count,
        since: c.created_at.slice(0, 4),
        city: c.city,
        region: c.region,
        country: c.country,
        active_listings: c.active_listings,
        work_hours: c.work_hours,
        logo: fileUrl(c.logo),
      };
    }
  }
  const u = db.get('SELECT id, name, created_at FROM users WHERE id = ?', userId);
  const r = db.get('SELECT AVG(rating) AS avg, COUNT(*) AS n FROM reviews WHERE seller_id = ?', userId);
  return {
    type: 'person',
    user_id: userId,
    company_id: null,
    name: u?.name || '—',
    verified: false,
    rating: r.n ? Math.round(r.avg * 10) / 10 : 0,
    reviews_count: r.n,
    since: u?.created_at.slice(0, 4),
    active_listings: db.get(`SELECT COUNT(*) AS n FROM listings WHERE user_id = ? AND status = 'active'`, userId).n,
  };
}

// Sotuvchining o'rtacha javob vaqti (daqiqa), oxirgi 60 kun
function responseMinutes(sellerId) {
  const row = db.get(
    `SELECT AVG(diff) AS m FROM (
       SELECT (julianday(MIN(s.created_at)) - julianday(MIN(b.created_at))) * 1440 AS diff
       FROM conversations c
       JOIN messages b ON b.conversation_id = c.id AND b.sender_id = c.buyer_id
       JOIN messages s ON s.conversation_id = c.id AND s.sender_id = c.seller_id AND s.created_at >= b.created_at
       WHERE c.seller_id = ? AND c.created_at >= datetime('now', '-60 days')
       GROUP BY c.id)`,
    sellerId,
  );
  return row?.m ? Math.max(1, Math.round(row.m)) : null;
}

function location(l, lang) {
  return {
    country: l.country,
    country_name: countryName(l.country, lang),
    region: l.region,
    region_name: regionName(l.country, l.region, lang),
    city: l.city,
  };
}

function facts(l, lang) {
  return {
    year: l.year,
    hours: l.hours,
    mileage_km: l.mileage_km,
    power_hp: l.power_hp,
    weight_kg: l.weight_kg,
    capacity_t: l.capacity_t,
    condition: l.condition,
    condition_label: l.condition ? t(lang, `cond.${l.condition}`) : null,
    stock_qty: l.stock_qty,
    with_operator: Boolean(l.with_operator),
    min_order: l.min_order,
    brand: l.brand,
    model: l.model,
    part_number: l.part_number,
  };
}

const sellerCache = () => new Map();
const nowSql = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// Kartochka (ro'yxatlar uchun)
function card(l, ctx, cache = sellerCache()) {
  const { lang, currency, favs } = ctx;
  const key = `${l.user_id}:${l.company_id}`;
  if (!cache.has(key)) cache.set(key, sellerInfo(l.user_id, l.company_id));
  const s = cache.get(key);
  const cover = l.cover !== undefined ? l.cover : db.get('SELECT path FROM listing_photos WHERE listing_id = ? ORDER BY sort, id LIMIT 1', l.id)?.path;
  // Mavsumiy aksiya: chegirmali narx + eski narx (chizilgan)
  const disc = l.price !== null && l.price !== undefined ? promos.discounts().get(l.id) : null;
  let price = money.priceView(l, lang, currency);
  let promo = null;
  if (disc) {
    const old = price;
    price = { ...money.priceView({ ...l, price: Math.round(l.price * (100 - disc.pct)) / 100 }, lang, currency), old_formatted: old.formatted };
    promo = { slug: disc.promo.slug, pct: disc.pct, theme: disc.promo.theme, emoji: disc.promo.emoji };
  }
  return {
    id: l.id,
    title: l.title,
    deal_type: l.deal_type,
    deal_label: t(lang, `deal.${l.deal_type}`),
    kind: l.kind,
    category: cats.brief(cats.byId(l.category_id), lang),
    subcategory: cats.brief(cats.byId(l.subcategory_id), lang),
    price,
    promo,
    facts: facts(l, lang),
    location: location(l, lang),
    seller: { name: s.name, verified: s.verified, rating: s.rating, reviews_count: s.reviews_count, company_id: s.company_id, user_id: s.user_id },
    cover: fileUrl(cover),
    photos_count: l.photos_count ?? undefined,
    status: l.status,
    status_label: t(lang, `ls.${l.status}`),
    is_favorite: favs ? favs.has(l.id) : false,
    promoted: Boolean(l.promoted_until && l.promoted_until > nowSql()),
    tier: l.tier && l.tier_until > nowSql() ? l.tier : null,
    tier_until: l.tier && l.tier_until > nowSql() ? l.tier_until : null,
    highlighted: Boolean(l.highlighted_until && l.highlighted_until > nowSql()),
    geo: l.lat !== null && l.lat !== undefined ? { lat: l.lat, lng: l.lng } : null,
    views: l.views,
    published_at: l.published_at,
    bumped_at: l.bumped_at,
  };
}

function detail(l, ctx) {
  const { lang } = ctx;
  const base = card(l, ctx);
  const photos = db.all('SELECT id, path FROM listing_photos WHERE listing_id = ? ORDER BY sort, id', l.id).map((p) => ({ id: p.id, url: fileUrl(p.path) }));
  const seller = sellerInfo(l.user_id, l.company_id);
  const delivery = parseJson(l.delivery, null);
  return {
    ...base,
    description: l.description,
    photos,
    cover: photos[0]?.url || null,
    vat_rate: l.vat_rate,
    leasing: Boolean(l.leasing),
    drive: l.drive,
    docs: l.docs,
    manufacturer: l.manufacturer,
    warranty_months: l.warranty_months,
    analogs: l.analogs,
    compatibility: parseJson(l.compatibility, []),
    compatibility_note: l.compatibility_note,
    attrs: parseJson(l.attrs, []),
    delivery,
    location: { ...location(l, lang), address: l.address, note: l.location_note, lat: l.lat, lng: l.lng },
    seller: {
      ...seller,
      contact_name: l.contact_name,
      phone_masked: maskPhone(l.contact_phone),
      accept_messages: Boolean(l.accept_messages),
      response_minutes: responseMinutes(l.user_id),
    },
    reject_reason: l.reject_reason,
    created_at: l.created_at,
    updated_at: l.updated_at,
  };
}

// ---------- Qidiruv ----------
// TOP e'lonlar har doim yuqorida (standart saralashda)
// Darajalar: VIP > GOLD > PREMIUM > TOP > oddiy
const TIER_RANK = `(CASE WHEN COALESCE(l.tier_until, '') > datetime('now') THEN (CASE l.tier WHEN 'vip' THEN 3 WHEN 'gold' THEN 2 WHEN 'premium' THEN 1 ELSE 0 END) ELSE 0 END) DESC`;
const PROMO = `${TIER_RANK}, (COALESCE(l.promoted_until, '') > datetime('now')) DESC`;
const SORTS = {
  new: `${PROMO}, l.bumped_at DESC, l.id DESC`,
  price_asc: 'l.price_usd IS NULL, l.price_usd ASC, l.id DESC',
  price_desc: 'l.price_usd IS NULL, l.price_usd DESC, l.id DESC',
  popular: 'l.views DESC, l.id DESC',
  year_desc: 'l.year IS NULL, l.year DESC, l.id DESC',
};

const list = (v) => (v === undefined || v === null || v === '' ? [] : (Array.isArray(v) ? v : String(v).split(',')).map((s) => String(s).trim()).filter(Boolean));

// q — so'rov parametrlari, exclude — facet hisoblashda o'tkazib yuboriladigan filtr
function buildWhere(q, currency, exclude = null) {
  const where = [`l.status = 'active'`];
  const params = [];
  const add = (sql, ...p) => {
    where.push(sql);
    params.push(...p);
  };

  if (q.q) {
    for (const tok of normalizeSearch(q.q).split(' ').filter(Boolean).slice(0, 8)) add('l.search_text LIKE ?', `%${tok}%`);
  }
  const cat = cats.find(q.category);
  if (cat) add(cat.parent_id ? 'l.subcategory_id = ?' : 'l.category_id = ?', cat.id);
  if (exclude !== 'subcategory') {
    const subs = list(q.subcategory).map(cats.find).filter(Boolean);
    if (subs.length) add(`l.subcategory_id IN (${subs.map(() => '?').join(',')})`, ...subs.map((s) => s.id));
  }
  if (exclude !== 'deal_type') {
    const deals = list(q.deal_type).filter((d) => ['sale', 'rent', 'service'].includes(d));
    if (deals.length) add(`l.deal_type IN (${deals.map(() => '?').join(',')})`, ...deals);
  }
  const kinds = list(q.kind).filter((k) => ['equipment', 'part', 'material', 'service'].includes(k));
  if (kinds.length) add(`l.kind IN (${kinds.map(() => '?').join(',')})`, ...kinds);
  const countries = list(q.country).map((c) => c.toUpperCase());
  if (countries.length) add(`l.country IN (${countries.map(() => '?').join(',')})`, ...countries);
  const regions = list(q.region);
  if (regions.length) add(`l.region IN (${regions.map(() => '?').join(',')})`, ...regions);
  if (q.city) add('l.search_text LIKE ?', `%${normalizeSearch(q.city)}%`);
  const pmin = Number(q.price_min);
  const pmax = Number(q.price_max);
  if (q.price_min && Number.isFinite(pmin)) add('l.price_usd >= ?', money.toUsd(pmin, currency) * 0.999);
  if (q.price_max && Number.isFinite(pmax)) add('l.price_usd <= ?', money.toUsd(pmax, currency) * 1.001);
  if (q.year_min) add('l.year >= ?', Number(q.year_min));
  if (q.year_max) add('l.year <= ?', Number(q.year_max));
  const conds = list(q.condition).filter((c) => ['new', 'used'].includes(c));
  if (conds.length) add(`l.condition IN (${conds.map(() => '?').join(',')})`, ...conds);
  if (exclude !== 'brand') {
    const brands = list(q.brand).map((b) => b.toLowerCase());
    if (brands.length) add(`LOWER(l.brand) IN (${brands.map(() => '?').join(',')})`, ...brands);
  }
  if (q.verified === '1' || q.verified === 'true' || q.verified === true) {
    where.push(`l.company_id IN (SELECT id FROM companies WHERE verification = 'verified')`);
  }
  if (q.company) add('l.company_id = ?', Number(q.company));
  if (q.seller) add('l.user_id = ?', Number(q.seller));
  if (q.leasing === '1') where.push('l.leasing = 1');
  if (q.vat === '1') where.push('l.vat_rate IS NOT NULL AND l.vat_rate > 0');
  if (q.hours_max) add('l.hours <= ?', Number(q.hours_max));
  if (q.power_min) add('l.power_hp >= ?', Number(q.power_min));
  if (q.model) add('LOWER(l.model) = ?', String(q.model).toLowerCase());
  if (q.drive4 === '1') where.push(`(l.drive LIKE '%4×4%' OR l.drive LIKE '%4x4%' OR l.drive LIKE '%4WD%')`);
  if (q.docs === '1') where.push(`l.docs IS NOT NULL AND l.docs != ''`);
  if (q.private === '1') where.push('l.company_id IS NULL');
  if (q.delivery === '1') where.push('l.delivery IS NOT NULL');
  if (q.with_operator === '1') where.push('l.with_operator = 1');
  if (q.in_stock === '1') where.push('(l.stock_qty IS NULL OR l.stock_qty > 0)');
  if (q.with_photos === '1') where.push('EXISTS (SELECT 1 FROM listing_photos p WHERE p.listing_id = l.id)');
  const days = Number(q.period_days);
  if (days > 0) add(`l.published_at >= datetime('now', ?)`, `-${Math.min(365, days)} days`);
  if (q.exclude_id) add('l.id != ?', Number(q.exclude_id));
  if (q.promoted === '1') where.push(`l.promoted_until > datetime('now')`);

  // Yaqin atrofda: near=lat,lng & radius_km (tekis yaqinlashuv, mintaqa masofalari uchun yetarli)
  const geo = nearOf(q);
  if (geo) {
    const dLat = geo.r / 111.32;
    const dLng = geo.r / (111.32 * geo.cos);
    add('l.lat BETWEEN ? AND ? AND l.lng BETWEEN ? AND ?', geo.lat - dLat, geo.lat + dLat, geo.lng - dLng, geo.lng + dLng);
    add('((l.lat - ?) * (l.lat - ?) + (l.lng - ?) * (l.lng - ?) * ?) * 12392.1 <= ?', geo.lat, geo.lat, geo.lng, geo.lng, geo.cos * geo.cos, geo.r * geo.r);
  }

  return { sql: where.join(' AND '), params };
}

function nearOf(q) {
  if (!q.near) return null;
  const [lat, lng] = String(q.near).split(',').map(Number);
  const r = Math.min(2000, Math.max(1, Number(q.radius_km) || 100));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, r, cos: Math.cos((lat * Math.PI) / 180) };
}

function distanceKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}

const CARD_COLS = `l.*,
  (SELECT path FROM listing_photos p WHERE p.listing_id = l.id ORDER BY sort, id LIMIT 1) AS cover,
  (SELECT COUNT(*) FROM listing_photos p WHERE p.listing_id = l.id) AS photos_count`;

function search(q, ctx, { page, perPage, offset }) {
  const { sql, params } = buildWhere(q, ctx.currency);
  const geo = nearOf(q);
  let order = SORTS[q.sort] || SORTS.new;
  const oParams = [];
  if (q.sort === 'distance' && geo) {
    order = '((l.lat - ?) * (l.lat - ?) + (l.lng - ?) * (l.lng - ?) * ?) ASC';
    oParams.push(geo.lat, geo.lat, geo.lng, geo.lng, geo.cos * geo.cos);
  }
  const total = db.get(`SELECT COUNT(*) AS n FROM listings l WHERE ${sql}`, ...params).n;
  const rows = db.all(`SELECT ${CARD_COLS} FROM listings l WHERE ${sql} ORDER BY ${order} LIMIT ? OFFSET ?`, ...params, ...oParams, perPage, offset);
  const cache = sellerCache();
  return {
    rows: rows.map((r) => {
      const c = card(r, ctx, cache);
      if (geo && r.lat !== null) c.distance_km = distanceKm(geo, r);
      return c;
    }),
    total,
  };
}

function facets(q, ctx) {
  const { lang, currency } = ctx;
  const b = buildWhere(q, currency, 'brand');
  const brands = db.all(
    `SELECT l.brand AS value, COUNT(*) AS count FROM listings l WHERE ${b.sql} AND l.brand IS NOT NULL AND l.brand != ''
     GROUP BY LOWER(l.brand) ORDER BY count DESC LIMIT 30`,
    ...b.params,
  );
  const s = buildWhere(q, currency, 'subcategory');
  const subs = db.all(
    `SELECT l.subcategory_id AS id, COUNT(*) AS count FROM listings l WHERE ${s.sql} AND l.subcategory_id IS NOT NULL
     GROUP BY l.subcategory_id ORDER BY count DESC`,
    ...s.params,
  ).map((r) => ({ ...cats.brief(cats.byId(r.id), lang), count: r.count }));
  const d = buildWhere(q, currency, 'deal_type');
  const deals = db.all(`SELECT l.deal_type AS value, COUNT(*) AS count FROM listings l WHERE ${d.sql} GROUP BY l.deal_type`, ...d.params)
    .map((r) => ({ ...r, label: t(lang, `deal.${r.value}`) }));
  const all = buildWhere(q, currency);
  const range = db.get(`SELECT MIN(l.price_usd) AS pmin, MAX(l.price_usd) AS pmax, MIN(l.year) AS ymin, MAX(l.year) AS ymax FROM listings l WHERE ${all.sql}`, ...all.params);
  return {
    brands,
    subcategories: subs,
    deal_types: deals,
    price: { min: money.roundNice(money.fromUsd(range.pmin, currency), currency), max: money.roundNice(money.fromUsd(range.pmax, currency), currency), currency },
    year: { min: range.ymin, max: range.ymax },
  };
}

function matchesQuery(listingId, query) {
  const { sql, params } = buildWhere(query, query.currency || 'USD');
  return Boolean(db.get(`SELECT 1 FROM listings l WHERE ${sql} AND l.id = ?`, ...params, listingId));
}

function favoritesSet(userId) {
  if (!userId) return null;
  return new Set(db.all('SELECT listing_id FROM favorites WHERE user_id = ?', userId).map((r) => r.listing_id));
}

function cardsByIds(sql, params, ctx) {
  const cache = sellerCache();
  return db.all(sql.replace('SELECT l.*', `SELECT ${CARD_COLS}`), ...params).map((r) => card(r, ctx, cache));
}

module.exports = { nearOf, distanceKm, fileUrl, buildSearchText, sellerInfo, responseMinutes, card, detail, search, facets, matchesQuery, favoritesSet, cardsByIds, CARD_COLS, SORTS };
