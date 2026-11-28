// Model katalogi: marka va model bo'yicha sahifalar (/models, /model/jcb, /model/jcb/3cx)
// Ma'lumot faol e'lonlardan yig'iladi: texnika e'lonlari (marka + model), mos zapchastlar (moslik/nomi), ustalar (markalar).
const db = require('../db');
const money = require('./money');
const { normalizeSearch } = require('../i18n');

// URL uchun toza nom: kirill -> lotin (oddiy), kichik harf, belgilar -> "-" (3CX -> 3cx, КАМАЗ -> kamaz, 82.1 -> 82-1)
const CYR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h' };
const slug = (s) => [...String(s || '').toLowerCase()].map((c) => CYR[c] ?? c).join('')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const CACHE_MS = 5 * 60e3;
let cache = null;

// { brands: [{ slug, name, count, models: [{ slug, name, count }] }], bySlug: Map }
function index() {
  if (cache && cache.at > Date.now() - CACHE_MS) return cache;
  const rows = db.all(`SELECT brand, model, kind FROM listings WHERE status = 'active' AND brand IS NOT NULL AND TRIM(brand) != ''`);
  const brands = new Map();
  for (const r of rows) {
    const bs = slug(r.brand);
    if (!bs) continue;
    let b = brands.get(bs);
    if (!b) { b = { slug: bs, names: new Map(), count: 0, models: new Map() }; brands.set(bs, b); }
    b.count += 1;
    b.names.set(r.brand.trim(), (b.names.get(r.brand.trim()) || 0) + 1);
    // Model faqat texnika e'lonlaridan (zapchastda "model" ko'pincha artikul bo'ladi)
    if (r.model && r.kind === 'equipment') {
      const ms = slug(r.model);
      if (!ms || ms.length > 40) continue;
      let m = b.models.get(ms);
      if (!m) { m = { slug: ms, names: new Map(), count: 0 }; b.models.set(ms, m); }
      m.count += 1;
      m.names.set(r.model.trim(), (m.names.get(r.model.trim()) || 0) + 1);
    }
  }
  // Eng ko'p ishlatilgan yozilish — sahifa nomi
  const top = (names) => [...names.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const list = [...brands.values()].map((b) => ({
    slug: b.slug, name: top(b.names), count: b.count,
    models: [...b.models.values()].map((m) => ({ slug: m.slug, name: top(m.names), count: m.count })).sort((x, y) => y.count - x.count || x.name.localeCompare(y.name)),
  })).sort((x, y) => y.count - x.count || x.name.localeCompare(y.name));
  cache = { at: Date.now(), brands: list, bySlug: new Map(list.map((b) => [b.slug, b])) };
  return cache;
}
const reset = () => { cache = null; };

// Marka va modelga tegishli faol e'lonlar (texnika)
function equipmentRows(brand, model) {
  const rows = db.all(`SELECT id, brand, model FROM listings WHERE status = 'active' AND kind = 'equipment' AND brand IS NOT NULL`);
  return rows.filter((r) => slug(r.brand) === brand.slug && (!model || slug(r.model || '') === model.slug)).map((r) => r.id);
}

// Mos zapchastlar: marka (+ model) nomi zapchast matnida (nomi, moslik, analoglar) uchraydi
function partRows(brand, model, limit = 12) {
  const b = normalizeSearch(brand.name);
  const m = model ? normalizeSearch(model.name) : null;
  const params = [`%${b}%`];
  let sql = `SELECT id FROM listings WHERE status = 'active' AND kind = 'part' AND search_text LIKE ?`;
  if (m) { sql += ' AND search_text LIKE ?'; params.push(`%${m}%`); }
  return db.all(`${sql} ORDER BY bumped_at DESC LIMIT ${limit}`, ...params).map((r) => r.id);
}

// Shu markani ta'mirlaydigan ustalar
function mechanicRows(brand, limit = 6) {
  return db.all(`SELECT * FROM specialists WHERE status = 'active' AND kind = 'mechanic' AND (brands LIKE ? OR search_text LIKE ?) ORDER BY updated_at DESC LIMIT ${limit}`,
    `%${brand.name}%`, `%${normalizeSearch(brand.name)}%`);
}

// Narx, yil, motosoat statistikasi (sotuv e'lonlari; foydalanuvchi valyutasida)
function stats(ids, currency, lang) {
  if (!ids.length) return null;
  const rows = db.all(`SELECT deal_type, price_usd, year, hours, power_hp FROM listings WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids);
  const sale = rows.filter((r) => r.deal_type !== 'rent' && r.price_usd > 0).map((r) => r.price_usd).sort((a, b) => a - b);
  const years = rows.map((r) => r.year).filter(Boolean);
  const hours = rows.map((r) => r.hours).filter(Boolean);
  const power = rows.map((r) => r.power_hp).filter(Boolean);
  const fmt = (usd) => {
    const v = money.fromUsd(usd, currency);
    return v === null ? null : money.formatAmount(money.roundNice(v, currency), currency, lang);
  };
  const median = sale.length ? sale[Math.floor(sale.length / 2)] : null;
  return {
    total: rows.length,
    sale: rows.filter((r) => r.deal_type !== 'rent').length,
    rent: rows.filter((r) => r.deal_type === 'rent').length,
    price_min: sale.length ? fmt(sale[0]) : null,
    price_median: median ? fmt(median) : null,
    price_max: sale.length ? fmt(sale[sale.length - 1]) : null,
    year_min: years.length ? Math.min(...years) : null,
    year_max: years.length ? Math.max(...years) : null,
    hours_avg: hours.length ? Math.round(hours.reduce((a, b) => a + b, 0) / hours.length / 100) * 100 : null,
    power_hp: power.length ? Math.round(power.reduce((a, b) => a + b, 0) / power.length) : null,
  };
}

function find(brandSlug, modelSlug) {
  const brand = index().bySlug.get(String(brandSlug || '').toLowerCase());
  if (!brand) return {};
  const model = modelSlug ? brand.models.find((m) => m.slug === String(modelSlug).toLowerCase()) : null;
  return { brand, model };
}

module.exports = { index, reset, find, equipmentRows, partRows, mechanicRows, stats, slug };
