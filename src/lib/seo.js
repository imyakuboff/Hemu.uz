const fs = require('node:fs');
const path = require('node:path');
const db = require('../db');
const config = require('../config');
const cats = require('./categories');
const money = require('./money');
const { pick, normalizeLang, pickFromAcceptLanguage } = require('../i18n');

const INDEX = path.join(__dirname, '..', '..', 'public', 'index.html');
let tpl = null;
const template = () => (tpl && !process.env.SEO_NO_CACHE ? tpl : (tpl = fs.readFileSync(INDEX, 'utf8')));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const abs = (u) => (!u ? null : /^https?:/.test(u) ? u : `${config.siteUrl}${u.startsWith('/') ? '' : '/uploads/'}${u}`);

// Qidiruv tizimlari uchun til variantlari: har sahifa ?lang=xx bilan 10 tilda (hreflang)
const { LANGS, t } = require('../i18n');
const { countryName, regionName } = require('../geo');
const HREFLANG = { prs: 'fa-AF' };
// Server tomonda ko'rsatiladigan narxlar valyutasi (til bo'yicha)
const LANG_CUR = { uz: 'UZS', kk: 'KZT', ky: 'KGS', tg: 'TJS', tk: 'TMT', az: 'AZN', prs: 'AFN', ps: 'AFN', ru: 'USD', en: 'USD' };

const withLang = (url, lang) => (lang ? `${url}${url.includes('?') ? '&' : '?'}lang=${lang}` : url);
const fmtUsd = (usd, lang) => {
  const cur = LANG_CUR[lang] || 'USD';
  const v = money.fromUsd(usd, cur);
  return v === null ? money.formatAmount(Math.round(usd), 'USD', lang) : money.formatAmount(money.roundNice(v, cur), cur, lang);
};
const catName = (c, lang) => pick(c.names, lang);
const count = (sql, ...p) => db.get(sql, ...p).n;

function listingBody(l, lang) {
  const c = cats.byId(l.subcategory_id) || cats.byId(l.category_id);
  const price = l.price !== null ? money.formatAmount(l.price, l.currency, lang) : '';
  const loc = [l.city, regionName(l.country, l.region, lang), countryName(l.country, lang)].filter(Boolean).join(', ');
  const facts = [l.brand, l.model, l.year, l.hours ? `${l.hours} h` : null, l.mileage_km ? `${l.mileage_km} km` : null, l.power_hp ? `${l.power_hp} hp` : null].filter(Boolean).join(' · ');
  return `<nav class="crumbs"><a href="${withLang('/', lang)}">HEMU.UZ</a>${c ? ` / <a href="${esc(withLang(`/catalog?category=${c.slug}`, lang))}">${esc(catName(c, lang))}</a>` : ''}</nav>
    <h1>${esc(l.title)}</h1>
    ${price ? `<p class="price"><b>${esc(price)}</b></p>` : ''}
    ${facts ? `<p>${esc(facts)}</p>` : ''}
    ${loc ? `<p>${esc(loc)}</p>` : ''}
    <div class="desc">${esc(l.description || '').replace(/\n/g, '<br>')}</div>`;
}

function listRows(rows, lang) {
  return `<ul class="seo-list">${rows.map((l) => {
    const price = l.price !== null ? money.formatAmount(l.price, l.currency, lang) : '';
    return `<li><a href="${esc(withLang(`/listing/${l.id}`, lang))}">${esc(l.title)}</a>${price ? ` — ${esc(price)}` : ''}${l.city ? ` · ${esc(l.city)}` : ''}</li>`;
  }).join('')}</ul>`;
}

// Brend + model bo'yicha narxlar (faqat sotuv e'lonlari)
function priceRows(cat) {
  const where = [`status = 'active'`, `deal_type = 'sale'`, 'price_usd > 0', `COALESCE(brand, '') != ''`];
  const p = [];
  if (cat) { where.push(cat.parent_id ? 'subcategory_id = ?' : 'category_id = ?'); p.push(cat.id); }
  return db.all(
    `SELECT brand, COALESCE(model, '') AS model, COUNT(*) AS n, AVG(price_usd) AS avg, MIN(price_usd) AS min, MAX(price_usd) AS max
     FROM listings WHERE ${where.join(' AND ')} GROUP BY LOWER(brand), LOWER(COALESCE(model, '')) ORDER BY n DESC, avg DESC LIMIT 60`,
    ...p,
  );
}

function metaFor(req) {
  const qLang = normalizeLang(req.query.lang);
  const lang = (qLang && LANGS.includes(qLang) ? qLang : null) || pickFromAcceptLanguage(req.get('accept-language')) || 'ru';
  const base = { title: t(lang, 'seo.default_title'), description: t(lang, 'seo.default_desc') };
  const m = req.path.match(/^\/listing\/(\d+)$/);
  if (m) {
    const l = db.get(`SELECT * FROM listings WHERE id = ? AND status = 'active'`, Number(m[1]));
    if (l) {
      const photo = db.get('SELECT path FROM listing_photos WHERE listing_id = ? ORDER BY sort, id LIMIT 1', l.id)?.path;
      const price = l.price !== null ? money.formatAmount(l.price, l.currency, lang) : '';
      const desc = `${[price, l.city, l.year].filter(Boolean).join(' · ')}. ${(l.description || '').replace(/\s+/g, ' ').slice(0, 220)}`;
      const ld = {
        '@context': 'https://schema.org', '@type': 'Product', name: l.title, description: (l.description || '').slice(0, 1000),
        image: photo ? [abs(photo)] : undefined, brand: l.brand ? { '@type': 'Brand', name: l.brand } : undefined, sku: l.part_number || undefined,
        offers: l.price !== null ? {
          '@type': 'Offer', price: l.price, priceCurrency: l.currency, availability: 'https://schema.org/InStock',
          itemCondition: l.condition === 'new' ? 'https://schema.org/NewCondition' : 'https://schema.org/UsedCondition', url: `${config.siteUrl}/listing/${l.id}`,
        } : undefined,
      };
      return { lang, qLang, title: `${l.title}${price ? ` — ${price}` : ''} | HEMU.UZ`, description: desc, image: abs(photo), url: `/listing/${l.id}`, type: 'product', ld, body: listingBody(l, lang) };
    }
  }
  if (req.path === '/catalog' && req.query.category) {
    const c = cats.find(req.query.category);
    if (c) {
      const name = catName(c, lang);
      const col = c.parent_id ? 'subcategory_id' : 'category_id';
      const n = count(`SELECT COUNT(*) AS n FROM listings WHERE status = 'active' AND ${col} = ?`, c.id);
      const rows = db.all(`SELECT id, title, price, currency, city FROM listings WHERE status = 'active' AND ${col} = ? ORDER BY bumped_at DESC LIMIT 40`, c.id);
      const body = `<h1>${esc(name)}</h1><p>${esc(t(lang, 'seo.catalog_desc', { name, n }))}</p>${listRows(rows, lang)}
        <p><a href="${esc(withLang(`/prices?category=${c.slug}`, lang))}">${esc(t(lang, 'seo.prices_title', { name, year: new Date().getFullYear() }))}</a></p>`;
      return { lang, qLang, title: `${t(lang, 'seo.catalog_title', { name })} | HEMU.UZ`, description: t(lang, 'seo.catalog_desc', { name, n }), url: `/catalog?category=${c.slug}`, body };
    }
  }
  if (req.path === '/prices') {
    const c = req.query.category ? cats.find(req.query.category) : null;
    const name = c ? catName(c, lang) : t(lang, 'seo.prices_all');
    const rows = priceRows(c);
    const n = rows.reduce((a, r) => a + r.n, 0);
    const year = new Date().getFullYear();
    const body = `<h1>${esc(t(lang, 'seo.prices_title', { name, year }))}</h1><p>${esc(t(lang, 'seo.prices_desc', { name: c ? name : 'HEMU.UZ', n }))}</p>
      ${rows.length ? `<table class="seo-table"><thead><tr><th>${esc(t(lang, 'seo.col_model'))}</th><th>${esc(t(lang, 'seo.col_avg'))}</th><th>${esc(t(lang, 'seo.col_range'))}</th><th>${esc(t(lang, 'seo.col_count'))}</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${esc(`${r.brand} ${r.model}`.trim())}</td><td>${esc(fmtUsd(r.avg, lang))}</td><td>${esc(fmtUsd(r.min, lang))} – ${esc(fmtUsd(r.max, lang))}</td><td>${r.n}</td></tr>`).join('')}
      </tbody></table>` : ''}
      ${c ? `<p><a href="${esc(withLang(`/catalog?category=${c.slug}`, lang))}">${esc(t(lang, 'seo.see_all'))}: ${esc(name)}</a></p>` : ''}`;
    const ld = rows.length ? {
      '@context': 'https://schema.org', '@type': 'ItemList', name: t(lang, 'seo.prices_title', { name, year }),
      itemListElement: rows.slice(0, 20).map((r, i) => ({ '@type': 'ListItem', position: i + 1, name: `${r.brand} ${r.model}`.trim() })),
    } : undefined;
    return { lang, qLang, title: `${t(lang, 'seo.prices_title', { name, year })} | HEMU.UZ`, description: t(lang, 'seo.prices_desc', { name: c ? name : 'HEMU.UZ', n }), url: c ? `/prices?category=${c.slug}` : '/prices', body, ld };
  }
  if (req.path === '/categories') {
    const body = `<h1>${esc(base.title)}</h1><ul class="seo-list">${cats.load().roots.map((c) => `<li><a href="${esc(withLang(`/catalog?category=${c.slug}`, lang))}">${esc(catName(c, lang))}</a>: ${c.children.map((x) => `<a href="${esc(withLang(`/catalog?category=${x.slug}`, lang))}">${esc(catName(x, lang))}</a>`).join(', ')}</li>`).join('')}</ul>`;
    return { lang, qLang, ...base, url: '/categories', body };
  }
  if (req.path === '/') {
    const rows = db.all(`SELECT id, title, price, currency, city FROM listings WHERE status = 'active' ORDER BY bumped_at DESC LIMIT 30`);
    const body = `<h1>${esc(base.title)}</h1><p>${esc(base.description)}</p>
      <ul class="seo-list">${cats.load().roots.map((c) => `<li><a href="${esc(withLang(`/catalog?category=${c.slug}`, lang))}">${esc(catName(c, lang))}</a> · <a href="${esc(withLang(`/prices?category=${c.slug}`, lang))}">${esc(t(lang, 'seo.see_prices'))}</a></li>`).join('')}</ul>
      ${listRows(rows, lang)}`;
    return { lang, qLang, ...base, url: '/', body };
  }
  return { lang, qLang, ...base, url: req.path, noAlt: true };
}

function renderIndex(req) {
  const m = metaFor(req);
  const canonical = withLang(m.url, m.qLang);
  // hreflang: shu sahifaning 10 tildagi variantlari + standart (tilsiz) variant
  const alts = m.noAlt ? [] : [
    ...LANGS.map((l) => `<link rel="alternate" hreflang="${HREFLANG[l] || l}" href="${esc(config.siteUrl + withLang(m.url, l))}">`),
    `<link rel="alternate" hreflang="x-default" href="${esc(config.siteUrl + m.url)}">`,
  ];
  const tags = [
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}">`,
    `<link rel="canonical" href="${esc(config.siteUrl + canonical)}">`,
    ...alts,
    `<meta property="og:site_name" content="HEMU.UZ">`,
    `<meta property="og:type" content="${m.type || 'website'}">`,
    `<meta property="og:title" content="${esc(m.title)}">`,
    `<meta property="og:description" content="${esc(m.description)}">`,
    `<meta property="og:url" content="${esc(config.siteUrl + canonical)}">`,
    `<meta property="og:image" content="${esc(m.image || `${config.siteUrl}/img/demo/hero.jpg`)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    m.ld ? `<script type="application/ld+json">${JSON.stringify(m.ld).replace(/</g, '\\u003c')}</script>` : '',
  ].join('\n  ');
  let html = template()
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<meta name="description"[^>]*>/, '')
    .replace(/<html lang="[^"]*"/, `<html lang="${HREFLANG[m.lang] || m.lang}"${m.lang === 'prs' || m.lang === 'ps' ? ' dir="rtl"' : ''}`)
    .replace('</head>', `  ${tags}\n</head>`);
  // Sahifa matni serverda (JS ishlamaydigan qidiruv botlari uchun); ilova yuklangach o'z ko'rinishi bilan almashtiradi
  if (m.body) html = html.replace(/<div id="app">[\s\S]*?<\/div><\/div>/, `<div id="app"><main class="page seo-ssr"><div class="container">${m.body}</div></main></div>`);
  return html;
}

function robots() {
  return `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /my/\nDisallow: /messages\nDisallow: /dashboard\nDisallow: /profile\nDisallow: /admin\nDisallow: /payments/\nSitemap: ${config.siteUrl}/sitemap.xml\n`;
}

// Sayt xaritasi: indeks + har til uchun alohida fayl (har biri 50 000 manzilgacha)
function sitemapUrls() {
  return [
    ['/', 'daily', '1.0'], ['/categories', 'weekly', '0.8'], ['/feed', 'hourly', '0.8'], ['/prices', 'daily', '0.7'],
    ...cats.load().roots.flatMap((c) => [
      [`/catalog?category=${c.slug}`, 'daily', '0.7'], [`/prices?category=${c.slug}`, 'daily', '0.6'],
      ...c.children.flatMap((s) => [[`/catalog?category=${s.slug}`, 'daily', '0.5'], [`/prices?category=${s.slug}`, 'weekly', '0.4']]),
    ]),
    ...db.all(`SELECT id, updated_at FROM listings WHERE status = 'active' ORDER BY id DESC LIMIT 45000`).map((l) => [`/listing/${l.id}`, 'weekly', '0.6', l.updated_at]),
  ];
}

function sitemapIndex() {
  const files = ['', ...LANGS].map((l) => `<sitemap><loc>${esc(`${config.siteUrl}/sitemap-${l || 'main'}.xml`)}</loc></sitemap>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${files}</sitemapindex>`;
}

// lang = '' — tilsiz (asosiy) manzillar
function sitemap(lang = '') {
  if (lang && !LANGS.includes(lang)) return null;
  const body = sitemapUrls().map(([u, f, p, mod]) => `<url><loc>${esc(config.siteUrl + withLang(u, lang))}</loc>${mod ? `<lastmod>${mod.slice(0, 10)}</lastmod>` : ''}<changefreq>${f}</changefreq><priority>${p}</priority></url>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
}

module.exports = { renderIndex, robots, sitemap, sitemapIndex, metaFor };
