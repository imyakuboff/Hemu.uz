const path = require('node:path');
const express = require('express');
const multer = require('multer');
const config = require('./config');
const { context } = require('./lib/auth');
const { ApiError } = require('./lib/http');
const { t } = require('./i18n');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.set('query parser', 'simple');

  // Xavfsizlik sarlavhalari va CORS
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; frame-ancestors 'none'",
      // Brauzer imkoniyatlari: mikrofon (ovozli qidiruv) va joylashuv (xarita) — faqat shu sayt uchun
      'Permissions-Policy': 'camera=(), microphone=(self), geolocation=(self), payment=(), usb=()',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'X-Permitted-Cross-Domain-Policies': 'none',
    });
    // HTTPS orqali ochilgan bo'lsa — brauzer keyingi safar faqat HTTPS ishlatsin
    if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000');
    const origin = req.get('origin');
    if (origin && (config.corsOrigins.includes('*') || config.corsOrigins.includes(origin))) {
      res.set({
        'Access-Control-Allow-Origin': config.corsOrigins.includes('*') ? '*' : origin,
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Lang, X-Currency, X-Country, Accept-Language',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      });
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));

  // Faqat ochiq rasmlar statik beriladi; hujjatlar /api/v1/files orqali
  const staticOpts = { maxAge: '7d', index: false, dotfiles: 'deny', fallthrough: false };
  app.use('/uploads/listings', express.static(path.join(config.uploadDir, 'listings'), staticOpts));
  app.use('/uploads/avatars', express.static(path.join(config.uploadDir, 'avatars'), staticOpts));
  app.use('/uploads/banners', express.static(path.join(config.uploadDir, 'banners'), staticOpts));

  app.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

  // API havolalari sahifasi (dasturchilar uchun)
  app.get('/api', (_req, res) => {
    res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
    res.type('html').send(landingPage());
  });

  const api = express.Router();
  api.use(require('./lib/metrics').middleware);
  api.use(context);
  api.get('/', (_req, res) => res.json({ name: 'HEMU.UZ API', version: 1, docs: '/api', endpoints: LINKS.map(([path]) => `/api/v1${path}`) }));
  api.use((req, res, next) => {
    res.set('Content-Language', req.lang);
    next();
  });
  api.use(require('./routes/meta').router);
  api.use(require('./routes/auth').router);
  api.use(require('./routes/listings').router);
  api.use(require('./routes/chat').router);
  api.use(require('./routes/orders').router);
  api.use(require('./routes/requests').router);
  api.use(require('./routes/seller').router);
  api.use(require('./routes/payments').router);
  api.use(require('./routes/trust').router);
  api.use(require('./routes/rental').router);
  api.use(require('./routes/tools').router);
  api.use(require('./routes/people').router);
  api.use(require('./routes/business').router);
  api.use(require('./routes/discover').router);
  api.use(require('./routes/platform').router);
  api.use(require('./routes/site').router);
  api.use(require('./routes/freight').router);
  api.use(require('./routes/promos').router);
  api.use(require('./routes/materials').router);
  api.use(require('./routes/admin').router);
  app.use('/api/v1', api);

  // ---------- SEO ----------
  const seo = require('./lib/seo');
  app.get('/robots.txt', (_req, res) => res.type('text/plain').send(seo.robots()));
  // IndexNow kalit fayli (Yandex/Bing tekshiradi)
  app.get(/^\/([a-f0-9]{32})\.txt$/, (req, res, next) => {
    const k = require('./lib/indexnow').key();
    if (req.params[0] !== k) return next();
    res.type('text/plain').send(k);
  });
  app.get('/sitemap.xml', (_req, res) => res.type('application/xml').send(seo.sitemapIndex()));
  // Har til uchun alohida xarita: /sitemap-main.xml (tilsiz), /sitemap-uz.xml, /sitemap-ru.xml ...
  app.get(/^\/sitemap-([a-z]{2,4})\.xml$/, (req, res, next) => {
    const xml = seo.sitemap(req.params[0] === 'main' ? '' : req.params[0]);
    if (!xml) return next();
    res.type('application/xml').send(xml);
  });

  // ---------- Frontend (SPA) ----------
  const pub = path.join(__dirname, '..', 'public');
  // Yandex Maps JS API 2.1: skript, plitkalar, geokoder va statistika domenlari
  const YA = 'https://api-maps.yandex.ru https://*.maps.yandex.net https://yastatic.net https://yandex.ru https://*.yandex.ru';
  const spaCsp = `default-src 'self'; img-src 'self' data: blob: https://*.tile.openstreetmap.org ${YA}; style-src 'self' 'unsafe-inline'; font-src 'self' ${YA}; script-src 'self' ${YA}; connect-src 'self' ${YA}; worker-src 'self' blob:; frame-src ${YA}; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`;
  app.use((req, res, next) => {
    res.set('Content-Security-Policy', spaCsp);
    next();
  });
  app.use(express.static(pub, {
    index: false,
    dotfiles: 'deny',
    setHeaders: (res, file) => res.set('Cache-Control', /\.(jpg|png|svg)$/.test(file) ? 'public, max-age=604800' : 'no-cache'),
  }));
  // Barcha sahifa manzillari index.html ga (mijoz tomonida marshrutlash)
  app.get(/^\/(?!api\/|uploads\/).*/, (req, res, next) => {
    if (path.extname(req.path)) return next();
    res.set('Cache-Control', 'no-cache');
    // Qidiruv tizimlari uchun sahifa sarlavhasi, tavsifi va Open Graph serverda qo'yiladi
    res.type('html').send(seo.renderIndex(req));
  });

  app.use((req, _res, next) => next(new ApiError(404, 'err.not_found')));

  // Xatolar foydalanuvchi tilida
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    const lang = req.lang || config.defaultLang;
    let e = err;
    if (err instanceof multer.MulterError) {
      e = new ApiError(422, err.code === 'LIMIT_FILE_COUNT' ? 'err.photo_limit' : 'err.file_type', { code: err.code });
    } else if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
      e = new ApiError(400, 'err.validation', { body: err.type });
    } else if (err.status === 404 && !(err instanceof ApiError)) {
      e = new ApiError(404, 'err.not_found');
    } else if (!(err instanceof ApiError)) {
      console.error(err);
      require('./lib/metrics').recordError(req, err);
      e = new ApiError(500, 'err.server');
    }
    res.status(e.status).json({ error: { code: e.key.replace(/^err\./, ''), message: t(lang, e.key), details: e.details || undefined } });
  });

  return app;
}

const LINKS = [
  ['/meta?lang=uz', "Ma'lumotnomalar: tillar, mamlakatlar, valyutalar"],
  ['/home?lang=ru', 'Bosh sahifa: ommabop, tavsiyalar, yangilari'],
  ['/categories?lang=kk', 'Kategoriyalar (qozoqcha)'],
  ['/categories?q=ekskavator', 'Kategoriya qidiruvi (lotin/kirill)'],
  ['/listings?q=JCB&facets=1', "E'lonlar qidiruvi + facetlar"],
  ['/listings?country=KZ&currency=KZT&lang=ru', "Qozog'iston e'lonlari, tengeda"],
  ['/listings?sort=price_desc&currency=USD&lang=en', "Narx bo'yicha, dollarda"],
  ['/listings/1?lang=uz', "E'lon sahifasi (o'xshashlari bilan)"],
  ['/companies/1', 'Kompaniya sahifasi'],
  ['/requests', "Xaridor so'rovlari"],
  ['/geo/countries/UZ/regions', "O'zbekiston viloyatlari"],
  ['/currencies', 'Valyuta kurslari'],
  ['/meta?lang=prs', 'Dari tilida (RTL)'],
];

function landingPage() {
  const rows = LINKS.map(([p, d]) => `<li><a href="/api/v1${p}">/api/v1${p}</a><span>${d}</span></li>`).join('');
  return `<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>HEMU.UZ API</title><style>
body{margin:0;font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;background:#f2f5f9;color:#0d2236}
header{background:#0d3557;color:#fff;padding:28px 16px}header div,main{max-width:860px;margin:0 auto}
h1{margin:0 0 4px;font-size:24px}.ok{display:inline-block;background:#d9f5e6;color:#0b6b3a;border-radius:99px;padding:2px 10px;font-size:13px;font-weight:600}
main{padding:20px 16px}section{background:#fff;border-radius:12px;padding:18px 20px;margin-bottom:16px;box-shadow:0 1px 2px #0001}
h2{font-size:16px;margin:0 0 10px}ul{list-style:none;margin:0;padding:0}li{padding:8px 0;border-top:1px solid #eef1f5;display:flex;flex-wrap:wrap;gap:4px 14px}
li:first-child{border-top:0}a{color:#0a6fd1;text-decoration:none;font-family:ui-monospace,Consolas,monospace;font-size:13px;word-break:break-all}a:hover{text-decoration:underline}
span{color:#5b6b7b;font-size:13px}code{background:#eef1f5;border-radius:4px;padding:1px 5px;font-size:13px}td{padding:4px 12px 4px 0}
</style></head><body><header><div><h1>HEMU.UZ API</h1><span class="ok">● Server ishlayapti</span></div></header><main>
<section><h2>Bu backend (API)</h2>Bu yerda sayt sahifalari yo'q — ilova yoki frontend shu API'dan JSON ma'lumot oladi.
Quyidagi havolalarni bosib, javoblarni brauzerda ko'rishingiz mumkin. To'liq ro'yxat: <code>README.md</code>.</section>
<section><h2>Sinab ko'rish uchun havolalar</h2><ul>${rows}</ul></section>
<section><h2>Demo kirish (SMS kodi dev rejimida javobda qaytadi)</h2><table>
<tr><td>Admin</td><td><code>+998900000001</code></td></tr><tr><td>Sotuvchi</td><td><code>+998901234567</code></td></tr><tr><td>Xaridor</td><td><code>+998907654321</code></td></tr></table>
<p><span>POST /api/v1/auth/otp/request {"phone": "..."} → POST /api/v1/auth/otp/verify {"phone", "code"} → token</span></p></section>
</main></body></html>`;
}

module.exports = { createApp };
