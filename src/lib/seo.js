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
const { LANGS, t, byCode } = require('../i18n');
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

// ---------- Bo'lim sahifalari: har biriga o'z sarlavhasi, matni va sitemap yozuvi ----------
// src — qaysi jadvaldan ro'yxat olinadi; where — qo'shimcha shart; desc — tavsif qolipi
const SECTIONS = {
  '/transportsale': { src: 'listings', where: `kind = 'equipment' AND deal_type = 'sale'`, name: 'seo.sec_transportsale' },
  '/transportrental': { src: 'listings', where: `deal_type = 'rent'`, name: 'seo.sec_transportrental' },
  '/sparepart': { src: 'listings', where: `kind = 'part'`, name: 'seo.sec_sparepart' },
  '/materials': { src: 'listings', where: `kind = 'material'`, name: 'seo.sec_materials' },
  '/feed': { src: 'listings', where: '1 = 1', name: 'seo.sec_feed' },
  '/mechanic': { src: 'specialists', where: `kind = 'mechanic'`, name: 'seo.sec_mechanic', desc: 'seo.sec_desc_people' },
  '/driver': { src: 'specialists', where: `kind = 'driver'`, name: 'seo.sec_driver', desc: 'seo.sec_desc_people' },
  '/fura': { src: 'logistics', name: 'seo.sec_fura', desc: 'seo.sec_desc_offers' },
  '/application': { src: 'requests', name: 'seo.sec_application', desc: 'seo.sec_desc_offers' },
  '/sellers': { src: 'companies', name: 'seo.sec_sellers', desc: 'seo.sec_desc_offers' },
};
// Bir xil sahifani ko'rsatadigan manzillar: canonical asosiy manzilga ishora qiladi (takroriy kontent bo'lmasligi uchun)
const ALIASES = { '/transport-repair': '/mechanic', '/cargologistic': '/fura', '/transportlogistic': '/fura' };
// Matni o'zgarmaydigan sahifalar: kamida o'z sarlavhasi bo'lishi kerak
const STATIC = {
  '/about': 'seo.page_about', '/contact': 'seo.page_contact', '/plans': 'seo.page_plans',
  '/urgent': 'seo.page_urgent', '/verified': 'seo.page_verified', '/terms': 'seo.page_terms', '/privacy': 'seo.page_privacy',
};

// Google uchun navigatsiya zanjiri (Bosh sahifa / Bo'lim / Sahifa)
function crumbsLd(lang, items) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [[t(lang, 'seo.crumb_home'), '/'], ...items].map(([name, url], i) => ({
      '@type': 'ListItem', position: i + 1, name, ...(url ? { item: `${config.siteUrl}${url}` } : {}),
    })),
  };
}

function itemListLd(names) {
  return { '@type': 'ItemList', numberOfItems: names.length, itemListElement: names.slice(0, 30).map((name, i) => ({ '@type': 'ListItem', position: i + 1, name })) };
}

// Bo'lim sahifasi uchun ro'yxat: [{ href, title, note }]
function sectionRows(sec, lang) {
  const w = sec.where ? ` AND ${sec.where}` : '';
  const amount = (v, c) => (v ? money.formatAmount(v, c || 'USD', lang) : '');
  if (sec.src === 'listings') {
    return db.all(`SELECT id, title, price, currency, city FROM listings WHERE status = 'active'${w} ORDER BY bumped_at DESC LIMIT 40`)
      .map((l) => ({ href: `/listing/${l.id}`, title: l.title, note: [amount(l.price, l.currency), l.city].filter(Boolean).join(' · ') }));
  }
  if (sec.src === 'specialists') {
    return db.all(`SELECT id, headline, city, rate, currency FROM specialists WHERE status = 'active'${w} ORDER BY updated_at DESC LIMIT 40`)
      .map((s) => ({ href: `/specialist/${s.id}`, title: s.headline, note: [amount(s.rate, s.currency), s.city].filter(Boolean).join(' · ') }));
  }
  if (sec.src === 'logistics') {
    return db.all(`SELECT id, title, from_city, to_city, price, currency FROM logistics WHERE status = 'open' ORDER BY id DESC LIMIT 40`)
      .map((x) => ({ href: `/fura/${x.id}`, title: x.title, note: [[x.from_city, x.to_city].filter(Boolean).join(' → '), amount(x.price, x.currency)].filter(Boolean).join(' · ') }));
  }
  if (sec.src === 'requests') {
    return db.all(`SELECT id, title, city, budget_max, currency FROM requests WHERE status = 'open' ORDER BY id DESC LIMIT 40`)
      .map((x) => ({ title: x.title, note: [amount(x.budget_max, x.currency), x.city].filter(Boolean).join(' · ') }));
  }
  return db.all(`SELECT id, name, city, activity FROM companies ORDER BY rating_avg DESC, id LIMIT 60`)
    .map((c) => ({ href: `/company/${c.id}`, title: c.name, note: [c.activity, c.city].filter(Boolean).join(' · ') }));
}

function rowsHtml(rows, lang) {
  return `<ul class="seo-list">${rows.map((r) => `<li>${r.href ? `<a href="${esc(withLang(r.href, lang))}">${esc(r.title)}</a>` : `<b>${esc(r.title)}</b>`}${r.note ? ` — ${esc(r.note)}` : ''}</li>`).join('')}</ul>`;
}

function sectionMeta(path, sec, lang, qLang) {
  const name = t(lang, sec.name);
  const rows = sectionRows(sec, lang);
  const description = t(lang, sec.desc || 'seo.catalog_desc', { name, n: rows.length });
  const body = `<nav class="crumbs"><a href="${withLang('/', lang)}">HEMU.UZ</a> / ${esc(name)}</nav>
    <h1>${esc(name)}</h1><p>${esc(description)}</p>${rowsHtml(rows, lang)}`;
  const ld = { '@context': 'https://schema.org', '@graph': [crumbsLd(lang, [[name, path]]), { '@type': 'CollectionPage', name, description, url: `${config.siteUrl}${path}`, ...itemListLd(rows.map((r) => r.title)) }] };
  return { lang, qLang, title: `${name} | HEMU.UZ`, description, url: path, body, ld };
}

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
      const seller = l.company_id ? db.get('SELECT id, name FROM companies WHERE id = ?', l.company_id) : null;
      // Narx amal qilish muddati: Google "priceValidUntil" bo'lmasa ogohlantiradi
      const validUntil = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
      const product = {
        '@type': 'Product', name: l.title, description: (l.description || '').slice(0, 1000),
        image: photo ? [abs(photo)] : undefined, brand: l.brand ? { '@type': 'Brand', name: l.brand } : undefined,
        sku: l.part_number || undefined, mpn: l.model || undefined,
        ...(l.year || l.hours || l.power_hp ? {
          additionalProperty: [
            l.year ? { '@type': 'PropertyValue', name: 'year', value: l.year } : null,
            l.hours ? { '@type': 'PropertyValue', name: 'engineHours', value: l.hours } : null,
            l.power_hp ? { '@type': 'PropertyValue', name: 'enginePower', value: l.power_hp, unitCode: 'HJ' } : null,
          ].filter(Boolean),
        } : {}),
        offers: l.price !== null ? {
          '@type': 'Offer', price: l.price, priceCurrency: l.currency, availability: 'https://schema.org/InStock', priceValidUntil: validUntil,
          itemCondition: l.condition === 'new' ? 'https://schema.org/NewCondition' : 'https://schema.org/UsedCondition', url: `${config.siteUrl}/listing/${l.id}`,
          ...(l.city || l.country ? { areaServed: [l.city, countryName(l.country, lang)].filter(Boolean).join(', ') } : {}),
          seller: seller ? { '@type': 'Organization', name: seller.name, url: `${config.siteUrl}/company/${seller.id}` } : { '@id': `${config.siteUrl}/#org` },
        } : undefined,
      };
      const lc = cats.byId(l.subcategory_id) || cats.byId(l.category_id);
      const crumbs = [
        ...(lc ? [[catName(lc, lang), `/catalog?category=${lc.slug}`]] : []),
        [l.title, `/listing/${l.id}`],
      ];
      const ld = { '@context': 'https://schema.org', '@graph': [crumbsLd(lang, crumbs), product] };
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
      const parent = c.parent_id ? cats.byId(c.parent_id) : null;
      const description = t(lang, 'seo.catalog_desc', { name, n });
      const ld = { '@context': 'https://schema.org', '@graph': [
        crumbsLd(lang, [
          ...(parent ? [[catName(parent, lang), `/catalog?category=${parent.slug}`]] : []),
          [name, `/catalog?category=${c.slug}`],
        ]),
        { '@type': 'CollectionPage', name, description, url: `${config.siteUrl}/catalog?category=${c.slug}`, ...itemListLd(rows.map((x) => x.title)) },
      ] };
      return { lang, qLang, title: `${t(lang, 'seo.catalog_title', { name })} | HEMU.UZ`, description, url: `/catalog?category=${c.slug}`, body, ld };
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
    // Google uchun: tashkilot (logo, aloqa) va sayt ichida qidiruv (sitelinks search box)
    const tg = String(config.supportTelegram || '').replace(/^@/, '');
    const ld = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization', '@id': `${config.siteUrl}/#org`, name: 'HEMU.UZ', url: `${config.siteUrl}/`,
          logo: `${config.siteUrl}/img/icon-512.png`,
          ...(tg ? { sameAs: [`https://t.me/${tg}`] } : {}),
          ...(config.supportPhone ? { contactPoint: { '@type': 'ContactPoint', telephone: config.supportPhone, contactType: 'customer service', areaServed: ['UZ', 'KZ', 'KG', 'TJ', 'TM', 'AZ', 'AF', 'RU'], availableLanguage: ['uz', 'ru', 'en'] } } : {}),
        },
        {
          '@type': 'WebSite', '@id': `${config.siteUrl}/#website`, name: 'HEMU.UZ', alternateName: ['HEMU', 'hemu.uz'], url: `${config.siteUrl}/`, inLanguage: HREFLANG[lang] || lang,
          publisher: { '@id': `${config.siteUrl}/#org` },
          potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${config.siteUrl}/catalog?q={search_term_string}` }, 'query-input': 'required name=search_term_string' },
        },
      ],
    };
    return { lang, qLang, ...base, url: '/', body, ld };
  }
  // Bo'lim sahifalari va ularning bir xil nusxalari (canonical asosiy manzilga)
  const secPath = ALIASES[req.path] || req.path;
  if (SECTIONS[secPath]) return sectionMeta(secPath, SECTIONS[secPath], lang, qLang);
  // Kompaniya do'koni: o'z sarlavhasi, e'lonlari va Organization belgisi
  const cm = req.path.match(/^\/company\/(\d+)$/);
  if (cm) {
    const c = db.get('SELECT * FROM companies WHERE id = ?', Number(cm[1]));
    if (c) {
      const loc = [c.city, regionName(c.country, c.region, lang), countryName(c.country, lang)].filter(Boolean).join(', ');
      const rows = db.all(`SELECT id, title, price, currency, city FROM listings WHERE status = 'active' AND company_id = ? ORDER BY bumped_at DESC LIMIT 40`, c.id);
      const description = `${[c.activity, loc].filter(Boolean).join('. ')}. ${t(lang, 'seo.catalog_desc', { name: c.name, n: rows.length })}`;
      const body = `<nav class="crumbs"><a href="${withLang('/', lang)}">HEMU.UZ</a> / <a href="${withLang('/sellers', lang)}">${esc(t(lang, 'seo.sec_sellers'))}</a></nav>
        <h1>${esc(c.name)}</h1>${c.activity ? `<p>${esc(c.activity)}</p>` : ''}${loc ? `<p>${esc(loc)}</p>` : ''}
        ${c.about ? `<div class="desc">${esc(c.about)}</div>` : ''}${listRows(rows, lang)}`;
      const ld = { '@context': 'https://schema.org', '@graph': [
        crumbsLd(lang, [[t(lang, 'seo.sec_sellers'), '/sellers'], [c.name, `/company/${c.id}`]]),
        {
          '@type': 'Organization', name: c.name, url: `${config.siteUrl}/company/${c.id}`,
          ...(c.logo ? { logo: abs(c.logo) } : {}), ...(c.website ? { sameAs: [c.website] } : {}),
          ...(c.phone ? { telephone: c.phone } : {}), ...(c.email ? { email: c.email } : {}),
          ...(c.about ? { description: String(c.about).slice(0, 500) } : {}),
          address: { '@type': 'PostalAddress', addressCountry: c.country, ...(c.region ? { addressRegion: regionName(c.country, c.region, lang) } : {}), ...(c.city ? { addressLocality: c.city } : {}), ...(c.address ? { streetAddress: c.address } : {}) },
          ...(c.rating_count > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(c.rating_avg.toFixed(1)), reviewCount: c.rating_count } } : {}),
        },
      ] };
      return { lang, qLang, title: `${c.name}${c.city ? ` — ${c.city}` : ''} | HEMU.UZ`, description, url: `/company/${c.id}`, image: abs(c.logo), body, ld };
    }
  }
  // Mutaxassis sahifasi (mexanik / haydovchi)
  const sm = req.path.match(/^\/specialist\/(\d+)$/);
  if (sm) {
    const s = db.get(`SELECT * FROM specialists WHERE id = ? AND status = 'active'`, Number(sm[1]));
    if (s) {
      const secKey = s.kind === 'driver' ? 'seo.sec_driver' : 'seo.sec_mechanic';
      const loc = [s.city, regionName(s.country, s.region, lang), countryName(s.country, lang)].filter(Boolean).join(', ');
      const rate = s.rate ? money.formatAmount(s.rate, s.currency || 'USD', lang) : '';
      const description = `${[s.headline, loc, rate, s.experience_years ? `${s.experience_years}+` : null].filter(Boolean).join(' · ')}. ${String(s.about || '').replace(/\s+/g, ' ').slice(0, 180)}`.trim();
      const body = `<nav class="crumbs"><a href="${withLang('/', lang)}">HEMU.UZ</a> / <a href="${withLang(`/${s.kind}`, lang)}">${esc(t(lang, secKey))}</a></nav>
        <h1>${esc(s.headline)}</h1>${loc ? `<p>${esc(loc)}</p>` : ''}${rate ? `<p class="price"><b>${esc(rate)}</b></p>` : ''}
        ${s.about ? `<div class="desc">${esc(s.about)}</div>` : ''}`;
      const ld = { '@context': 'https://schema.org', '@graph': [
        crumbsLd(lang, [[t(lang, secKey), `/${s.kind}`], [s.headline, `/specialist/${s.id}`]]),
        { '@type': 'Service', name: s.headline, serviceType: t(lang, secKey), url: `${config.siteUrl}/specialist/${s.id}`, ...(s.about ? { description: String(s.about).slice(0, 500) } : {}), areaServed: loc || s.country, provider: { '@id': `${config.siteUrl}/#org` } },
      ] };
      return { lang, qLang, title: `${s.headline}${s.city ? ` — ${s.city}` : ''} | HEMU.UZ`, description, url: `/specialist/${s.id}`, body, ld };
    }
  }
  // Mavsumiy aksiyalar: /aksiya/qish, /aksiya/qurilish ...
  const pm = req.path.match(/^\/aksiya\/([a-z0-9-]+)$/);
  if (pm) {
    const p = db.get('SELECT * FROM promos WHERE slug = ? AND active = 1', pm[1]);
    if (p) {
      const name = pick(JSON.parse(p.names || '{}'), lang) || p.slug;
      const sub = pick(JSON.parse(p.subtitles || '{}'), lang) || '';
      const ids = db.all('SELECT listing_id FROM promo_listings WHERE promo_id = ?', p.id).map((x) => x.listing_id);
      const rows = ids.length ? db.all(`SELECT id, title, price, currency, city FROM listings WHERE status = 'active' AND id IN (${ids.map(() => '?').join(',')}) ORDER BY bumped_at DESC LIMIT 40`, ...ids) : [];
      const description = [sub, t(lang, 'seo.catalog_desc', { name, n: rows.length })].filter(Boolean).join(' ');
      const body = `<nav class="crumbs"><a href="${withLang('/', lang)}">HEMU.UZ</a> / ${esc(name)}</nav>
        <h1>${esc(name)}</h1><p>${esc(description)}</p>${listRows(rows, lang)}`;
      const ld = { '@context': 'https://schema.org', '@graph': [crumbsLd(lang, [[name, req.path]]), { '@type': 'CollectionPage', name, description, url: `${config.siteUrl}${req.path}`, ...itemListLd(rows.map((r) => r.title)) }] };
      return { lang, qLang, title: `${name}${p.max_discount ? ` — −${p.max_discount}%` : ''} | HEMU.UZ`, description, url: req.path, body, ld };
    }
  }
  // Matni o'zgarmaydigan sahifalar (shartlar, tariflar, aloqa ...)
  if (STATIC[req.path]) {
    const name = t(lang, STATIC[req.path]);
    return { lang, qLang, title: `${name} | HEMU.UZ`, description: base.description, url: req.path, ld: { '@context': 'https://schema.org', ...crumbsLd(lang, [[name, req.path]]) } };
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
    `<meta property="og:image:alt" content="${esc(m.title)}">`,
    `<meta property="og:locale" content="${esc((byCode[m.lang]?.locale || 'ru-RU').replace(/-/g, '_'))}">`,
    ...(m.noAlt ? [] : LANGS.filter((l) => l !== m.lang).map((l) => `<meta property="og:locale:alternate" content="${esc((byCode[l]?.locale || l).replace(/-/g, '_'))}">`)),
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(m.title)}">`,
    `<meta name="twitter:description" content="${esc(m.description)}">`,
    `<meta name="twitter:image" content="${esc(m.image || `${config.siteUrl}/img/demo/hero.jpg`)}">`,
    // Qidiruv botlari uchun: rasm va matn parchalariga cheklov yo'q
    `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">`,
    // Search Console / Yandex Vebmaster tasdiqlash kodlari (admin → Integratsiyalar → SEO)
    config.googleVerification ? `<meta name="google-site-verification" content="${esc(config.googleVerification)}">` : '',
    config.yandexVerification ? `<meta name="yandex-verification" content="${esc(config.yandexVerification)}">` : '',
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
  // Shaxsiy kabinet va foydasiz sahifalar indekslanmaydi; qolgan hammasi ochiq
  const closed = ['/api/', '/my/', '/messages', '/dashboard', '/profile', '/admin', '/payments/', '/payments',
    '/create', '/request/new', '/requests', '/register', '/forgot', '/business', '/favorites', '/notifications',
    '/compare', '/filters', '/analytics'];
  // Yandex: saralash va ko'rinish parametrlari alohida sahifa sifatida indekslanmasin
  const clean = ['sort', 'page', 'view', 'tab', 'per_page', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'yclid', 'fbclid'];
  return [
    'User-agent: *',
    'Allow: /',
    ...closed.map((p) => `Disallow: ${p}`),
    '',
    'User-agent: Yandex',
    'Allow: /',
    ...closed.map((p) => `Disallow: ${p}`),
    `Clean-param: ${clean.join('&')}`,
    '',
    `Sitemap: ${config.siteUrl}/sitemap.xml`,
    '',
  ].join('\n');
}

// Sayt xaritasi: indeks + har til uchun alohida fayl (har biri 50 000 manzilgacha)
function sitemapUrls() {
  return [
    ['/', 'daily', '1.0'], ['/categories', 'weekly', '0.8'], ['/feed', 'hourly', '0.8'], ['/prices', 'daily', '0.7'],
    // Bo'lim sahifalari (/transportsale, /mechanic, /fura ...) — nusxa manzillari kiritilmaydi
    ...Object.keys(SECTIONS).filter((p) => p !== '/feed').map((p) => [p, 'daily', '0.9']),
    // Ma'lumot sahifalari
    ...Object.keys(STATIC).map((p) => [p, 'monthly', '0.3']),
    // Mavsumiy aksiyalar
    ...db.all('SELECT slug FROM promos WHERE active = 1').map((p) => [`/aksiya/${p.slug}`, 'weekly', '0.6']),
    // Kompaniya do'konlari va mutaxassislar
    ...db.all('SELECT id FROM companies ORDER BY id LIMIT 5000').map((c) => [`/company/${c.id}`, 'weekly', '0.6']),
    ...db.all(`SELECT id, updated_at FROM specialists WHERE status = 'active' ORDER BY id LIMIT 5000`).map((s) => [`/specialist/${s.id}`, 'weekly', '0.5', s.updated_at]),
    ...db.all(`SELECT id FROM logistics WHERE status = 'open' ORDER BY id DESC LIMIT 5000`).map((x) => [`/fura/${x.id}`, 'weekly', '0.4']),
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

module.exports = { renderIndex, robots, sitemap, sitemapIndex, sitemapUrls, withLang, metaFor };
