// Usta/haydovchining elektron vizitkasi: QR kod, bosmaga tayyor vizitka (90×50 mm) va mashina stikeri (A6)
// SVG serverda yasaladi; PNG — sharp, bo'lmasa rsvg-convert yoki vips orqali (hech biri bo'lmasa faqat SVG).
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const db = require('../db');
const config = require('../config');

const NAVY = '#0E3352';
const BLUE = '#0B6FCF';
const YELLOW = '#FFC61A';
const INK = '#111827';
const FONT = "DejaVu Sans, Arial, Helvetica, sans-serif";
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// QR — kvadratlar yo'li (path), o'lchami `size`, chetlari 0
function qrPath(text, size) {
  const qrcode = require('qrcode-generator');
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  const k = size / n;
  let d = '';
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) if (q.isDark(r, c)) d += `M${(c * k).toFixed(2)} ${(r * k).toFixed(2)}h${k.toFixed(2)}v${k.toFixed(2)}h-${k.toFixed(2)}z`;
  }
  return d;
}
const qrSvg = (url, size = 300, color = INK) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="#fff"/><path d="${qrPath(url, size)}" fill="${color}"/></svg>`;

const KIND = { mechanic: 'Mexanik usta', driver: 'Haydovchi / operator' };
const shortUrl = (slug) => `${String(config.siteUrl).replace(/^https?:\/\//, '')}/u/${slug}`;
const fullUrl = (slug) => `${config.siteUrl}/u/${slug}`;

// Matnni berilgan kenglikka sig'diradigan qilib qisqartirish (taxminiy: belgi ≈ 0.56 × shrift o'lchami)
const fit = (s, px, maxW) => { const n = Math.floor(maxW / (px * 0.56)); s = String(s || ''); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const stripe = (x, y, w, h, a = YELLOW, b = INK) => `<defs><pattern id="hz" width="${h * 2}" height="${h}" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="${h}" height="${h}" fill="${a}"/><rect x="${h}" width="${h}" height="${h}" fill="${b}"/></pattern></defs><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#hz)"/>`;
const logo = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M10 0h168l-10 56H0z" fill="${YELLOW}"/><text x="18" y="43" font-family="${FONT}" font-weight="bold" font-style="italic" font-size="40" fill="${INK}">HEMU</text><path d="M172 0h76l-10 56h-76z" fill="${NAVY}"/><text x="178" y="41" font-family="${FONT}" font-weight="bold" font-style="italic" font-size="30" fill="#fff">.UZ</text></g>`;

function info(s, withPhone = false) {
  const u = db.get('SELECT name, phone FROM users WHERE id = ?', s.user_id) || {};
  const brands = (() => { try { return JSON.parse(s.brands || '[]'); } catch { return []; } })();
  const { regionName } = require('../geo');
  const place = [s.city, regionName(s.country, s.region, 'uz')].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(', ');
  const { formatAmount } = require('./money');
  const rate = s.rate ? `${formatAmount(s.rate, s.currency, 'uz')} / ${({ hour: 'soat', day: 'kun', shift: 'smena', job: 'ish', month: 'oy' })[s.rate_unit] || 'soat'}` : '';
  const phone = withPhone && u.phone && !/^\+0+/.test(u.phone) ? u.phone : '';
  return { name: u.name || '', phone, headline: s.headline || '', kind: KIND[s.kind] || '', brands: brands.slice(0, 5).join(' · '), place, rate, years: s.experience_years };
}

// Vizitka 90×50 mm (300 dpi: 1063×591)
function cardSvg(s, withPhone = false) {
  const W = 1063; const H = 591; const i = info(s, withPhone);
  const url = fullUrl(s.slug);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#fff"/>
  <rect width="${W}" height="150" fill="${NAVY}"/>
  ${logo(56, 46, 1)}
  <text x="${W - 56}" y="92" text-anchor="end" font-family="${FONT}" font-weight="bold" font-size="30" fill="${YELLOW}">${esc(i.kind.toUpperCase())}</text>
  <text x="56" y="232" font-family="${FONT}" font-weight="bold" font-size="54" fill="${INK}">${esc(fit(i.name, 54, 620))}</text>
  <text x="56" y="285" font-family="${FONT}" font-size="30" fill="#374151">${esc(fit(i.headline, 30, 640))}</text>
  ${i.brands ? `<text x="56" y="335" font-family="${FONT}" font-weight="bold" font-size="28" fill="${BLUE}">${esc(fit(i.brands, 28, 640))}</text>` : ''}
  <text x="56" y="${i.brands ? 385 : 340}" font-family="${FONT}" font-size="28" fill="#4b5563">${esc(fit([i.place, i.years ? `${i.years} yil tajriba` : ''].filter(Boolean).join(' · '), 28, 640))}</text>
  <text x="56" y="480" font-family="${FONT}" font-weight="bold" font-size="${i.phone ? 40 : 30}" fill="${INK}">${esc(i.phone || 'Telefon raqami — saytda')}</text>
  <text x="56" y="528" font-family="${FONT}" font-size="26" fill="${BLUE}">${esc(shortUrl(s.slug))}</text>
  <g transform="translate(${W - 56 - 300} 190)"><path d="${qrPath(url, 300)}" fill="${INK}"/></g>
  <text x="${W - 56 - 150}" y="525" text-anchor="middle" font-family="${FONT}" font-size="22" fill="#6b7280">Sharhlar va narxlar</text>
  ${stripe(0, H - 22, W, 22)}
</svg>`;
}

// Mashina oynasi / ustaxona uchun stiker A6 (105×148 mm, 300 dpi: 1240×1748)
function stickerSvg(s, withPhone = false) {
  const W = 1240; const H = 1748; const i = info(s, withPhone);
  const url = fullUrl(s.slug);
  const title = s.kind === 'driver' ? 'HAYDOVCHI' : 'MEXANIK';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${YELLOW}"/>
  ${stripe(0, 0, W, 40, NAVY, INK)}
  ${logo(80, 100, 1.4)}
  <text x="80" y="340" font-family="${FONT}" font-weight="bold" font-size="150" fill="${INK}">${title}</text>
  <text x="80" y="430" font-family="${FONT}" font-weight="bold" font-size="56" fill="${NAVY}">${esc(fit(i.name, 56, 1080))}</text>
  <text x="80" y="500" font-family="${FONT}" font-size="40" fill="${INK}">${esc(fit(i.headline, 40, 1080))}</text>
  <rect x="${(W - 940) / 2}" y="550" width="940" height="940" rx="40" fill="#fff"/>
  <g transform="translate(${(W - 820) / 2} 610)"><path d="${qrPath(url, 820)}" fill="${INK}"/></g>
  <text x="${W / 2}" y="1580" text-anchor="middle" font-family="${FONT}" font-weight="bold" font-size="${i.phone ? 64 : 46}" fill="${INK}">${esc(i.phone || 'Kamerani tuting — profil va raqam')}</text>
  <text x="${W / 2}" y="1660" text-anchor="middle" font-family="${FONT}" font-size="40" fill="${NAVY}">${esc(shortUrl(s.slug))}</text>
  ${stripe(0, H - 40, W, 40, NAVY, INK)}
</svg>`;
}

// SVG -> PNG (sharp, rsvg-convert yoki vips); hech biri bo'lmasa null
async function toPng(svg) {
  try {
    const sharp = require('sharp');
    return await sharp(Buffer.from(svg), { density: 72 }).png().toBuffer();
  } catch { /* keyingi usul */ }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'viz-'));
  const inp = path.join(tmp, 'a.svg');
  const out = path.join(tmp, 'a.png');
  fs.writeFileSync(inp, svg);
  const run = (cmd, args) => new Promise((ok) => execFile(cmd, args, { timeout: 20000 }, (e) => ok(!e && fs.existsSync(out))));
  try {
    if (await run('rsvg-convert', ['-o', out, inp]) || await run('vips', ['copy', inp, out])) return fs.readFileSync(out);
    return null;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// Egasining yuklab olish kaliti: shu bilan vizitkaga telefon raqami qo'shiladi (ochiq rasmda raqam yo'q)
const ownerKey = (slug) => require('node:crypto').createHmac('sha256', String(config.secret)).update(`viz:${slug}`).digest('hex').slice(0, 20);

const cache = new Map();
async function render(slug, what, format, withPhone = false) {
  const s = db.get(`SELECT * FROM specialists WHERE slug = ? AND status = 'active'`, slug);
  if (!s) return null;
  const key = `${slug}|${what}|${format}|${withPhone}|${s.updated_at}`;
  if (cache.has(key)) return cache.get(key);
  const svg = what === 'qr' ? qrSvg(fullUrl(slug), 300) : what === 'stiker' ? stickerSvg(s, withPhone) : cardSvg(s, withPhone);
  const out = format === 'svg' ? { type: 'image/svg+xml', body: Buffer.from(svg) } : await toPng(svg).then((b) => (b ? { type: 'image/png', body: b } : null));
  if (out) {
    cache.set(key, out);
    if (cache.size > 300) cache.delete(cache.keys().next().value);
  }
  return out;
}

// Express: /u/:slug/(vizitka|stiker|qr).(png|svg)
async function handler(req, res, next) {
  try {
    const [, slug, what, format] = req.path.match(/^\/u\/([a-z0-9-]+)\/(vizitka|stiker|qr)\.(png|svg)$/) || [];
    if (!slug) return next();
    const k = String(req.query.k || '');
    const withPhone = k.length === 20 && require('node:crypto').timingSafeEqual(Buffer.from(k), Buffer.from(ownerKey(slug)));
    const out = await render(slug, what, format, withPhone);
    if (!out) return res.status(404).type('text/plain').send('not found');
    res.set({ 'Content-Type': out.type, 'Cache-Control': withPhone ? 'private, no-store' : 'public, max-age=3600', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" });
    if (req.query.download) res.set('Content-Disposition', `attachment; filename="hemu-${slug}-${what}.${format}"`);
    res.send(out.body);
  } catch (e) { next(e); }
}

module.exports = { ownerKey, handler, qrSvg, cardSvg, stickerSvg, render };
