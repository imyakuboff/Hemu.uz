// Mavsumiy aksiyalar: faollik (har yili takrorlanadigan sana oralig'i), e'lonlardagi chegirmalar
const db = require('../db');
const { parseJson } = require('./http');

const THEMES = ['green', 'orange', 'blue', 'red', 'purple'];
const MD_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MIN_DISCOUNT = 3;
const MAX_DISCOUNT = 70;

const md = (d = new Date()) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Bugun aksiya oralig'idami? 10-01..02-28 kabi yil oxiridan o'tadigan oraliqlar ham ishlaydi
const ymd = (d = new Date()) => `${d.getFullYear()}-${md(d)}`;
function inSeason(p, d = new Date()) {
  // Sotuvchi aksiyasi: aniq sanalar
  if (p.starts_on || p.ends_on) return (!p.starts_on || ymd(d) >= p.starts_on) && (!p.ends_on || ymd(d) <= p.ends_on);
  if (!p.start_md || !p.end_md) return true;
  const today = md(d);
  return p.start_md <= p.end_md ? today >= p.start_md && today <= p.end_md : today >= p.start_md || today <= p.end_md;
}
const isLive = (p, d) => Boolean(p.active) && (p.status || 'active') === 'active' && inSeason(p, d);

// Aksiya tugash sanasi (eng yaqin end_md), ISO 'YYYY-MM-DD'
function endsOn(p, d = new Date()) {
  if (p.ends_on) return p.ends_on;
  if (!p.end_md) return null;
  let y = d.getFullYear();
  if (p.start_md > p.end_md && md(d) >= p.start_md) y += 1;
  return `${y}-${p.end_md}`;
}

// Sotuvchi aksiyasi kimniki: firma nomi yoki foydalanuvchi ismi
function sellerName(p) {
  const c = p.company_id ? db.get('SELECT id, name, verification FROM companies WHERE id = ?', p.company_id) : null;
  if (c) return { name: c.name, company_id: c.id, verified: c.verification === 'verified' };
  const u = db.get('SELECT name FROM users WHERE id = ?', p.owner_user_id);
  return { name: u?.name || '', company_id: null, verified: false };
}

const pickName = (obj, lang) => obj[lang] || (['prs', 'ps'].includes(lang) ? obj.en : obj.ru) || obj.uz || obj.en || '';

function view(p, lang, extra = {}) {
  const names = parseJson(p.names, {});
  const subs = parseJson(p.subtitles, {});
  return {
    id: p.id,
    slug: p.slug,
    name: pickName(names, lang),
    subtitle: pickName(subs, lang),
    emoji: p.emoji,
    theme: p.theme,
    categories: parseJson(p.categories, []),
    max_discount: p.max_discount,
    start_md: p.start_md,
    end_md: p.end_md,
    ends_on: endsOn(p),
    starts_on: p.starts_on || null,
    live: isLive(p),
    status: p.status || 'active',
    seller: p.owner_user_id ? sellerName(p) : null,
    ...extra,
  };
}

// listing_id → eng katta chegirma (faol aksiyalar bo'yicha). 30 soniya kesh
let cache = null;
let cacheAt = 0;
function discounts() {
  if (cache && Date.now() - cacheAt < 30000) return cache;
  const live = db.all("SELECT * FROM promos WHERE active = 1 AND status = 'active'").filter((p) => inSeason(p));
  const byId = new Map(live.map((p) => [p.id, p]));
  const map = new Map();
  if (live.length) {
    for (const r of db.all(`SELECT promo_id, listing_id, discount_pct FROM promo_listings WHERE promo_id IN (${live.map(() => '?').join(',')})`, ...live.map((p) => p.id))) {
      const cur = map.get(r.listing_id);
      if (!cur || r.discount_pct > cur.pct) map.set(r.listing_id, { pct: r.discount_pct, promo: byId.get(r.promo_id) });
    }
  }
  cache = map;
  cacheAt = Date.now();
  return map;
}
const invalidate = () => { cache = null; };

// E'lon kategoriyasi aksiya kategoriyalariga mosmi ([] = hammasi)
function fits(p, rootSlug, subSlug) {
  const cats = parseJson(p.categories, []);
  return !cats.length || cats.includes(rootSlug) || cats.includes(subSlug);
}

module.exports = { THEMES, MD_RE, MIN_DISCOUNT, MAX_DISCOUNT, inSeason, isLive, endsOn, view, discounts, invalidate, fits, pickName };
