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

const DEFAULT = {
  title: 'HEMU.UZ — спецтехника, запчасти и услуги в Центральной Азии',
  description: 'Покупайте, арендуйте и находите поставщиков спецтехники, запчастей, стройматериалов и услуг в Узбекистане, Казахстане, Кыргызстане, Таджикистане, Туркменистане, Азербайджане, Афганистане и России.',
};

function metaFor(req) {
  const lang = normalizeLang(req.query.lang) || pickFromAcceptLanguage(req.get('accept-language')) || 'ru';
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
      return { title: `${l.title} — ${price} | HEMU.UZ`, description: desc, image: abs(photo), url: `/listing/${l.id}`, type: 'product', ld };
    }
  }
  if (req.path === '/catalog' && req.query.category) {
    const c = cats.find(req.query.category);
    if (c) {
      const name = pick(c.names, lang);
      return { title: `${name} — купить и арендовать | HEMU.UZ`, description: `${name}: объявления от проверенных продавцов Центральной Азии. ${DEFAULT.description}`, url: `/catalog?category=${c.slug}` };
    }
  }
  if (req.path === '/categories') return { title: 'Категории | HEMU.UZ', description: DEFAULT.description, url: '/categories' };
  return { ...DEFAULT, url: req.path };
}

function renderIndex(req) {
  const m = metaFor(req);
  const tags = [
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}">`,
    `<link rel="canonical" href="${esc(config.siteUrl + m.url)}">`,
    `<meta property="og:site_name" content="HEMU.UZ">`,
    `<meta property="og:type" content="${m.type || 'website'}">`,
    `<meta property="og:title" content="${esc(m.title)}">`,
    `<meta property="og:description" content="${esc(m.description)}">`,
    `<meta property="og:url" content="${esc(config.siteUrl + m.url)}">`,
    `<meta property="og:image" content="${esc(m.image || `${config.siteUrl}/img/demo/hero.jpg`)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    m.ld ? `<script type="application/ld+json">${JSON.stringify(m.ld).replace(/</g, '\\u003c')}</script>` : '',
  ].join('\n  ');
  return template()
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<meta name="description"[^>]*>/, '')
    .replace('</head>', `  ${tags}\n</head>`);
}

function robots() {
  return `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /my/\nDisallow: /messages\nDisallow: /dashboard\nDisallow: /profile\nDisallow: /admin\nDisallow: /payments/\nSitemap: ${config.siteUrl}/sitemap.xml\n`;
}

function sitemap() {
  const urls = [
    ['/', 'daily', '1.0'], ['/categories', 'weekly', '0.8'], ['/feed', 'hourly', '0.8'],
    ...cats.load().roots.flatMap((c) => [[`/catalog?category=${c.slug}`, 'daily', '0.7'], ...c.children.map((s) => [`/catalog?category=${s.slug}`, 'daily', '0.5'])]),
    ...db.all(`SELECT id, updated_at FROM listings WHERE status = 'active' ORDER BY id DESC LIMIT 45000`).map((l) => [`/listing/${l.id}`, 'weekly', '0.6', l.updated_at]),
  ];
  const body = urls.map(([u, f, p, mod]) => `<url><loc>${esc(config.siteUrl + u)}</loc>${mod ? `<lastmod>${mod.slice(0, 10)}</lastmod>` : ''}<changefreq>${f}</changefreq><priority>${p}</priority></url>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
}

module.exports = { renderIndex, robots, sitemap, metaFor };
