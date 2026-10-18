// IndexNow: yangi va o'zgargan sahifalar haqida Yandex va Bing'ga darhol xabar berish.
// Hisob ochish shart emas — kalit fayli saytning o'zida turadi (/<kalit>.txt).
// Google IndexNow'ni qo'llamaydi: unga sayt xaritasi (sitemap.xml) va Search Console orqali yetkaziladi.
const crypto = require('node:crypto');
const config = require('../config');

const ENDPOINTS = ['https://yandex.com/indexnow', 'https://api.indexnow.org/indexnow'];
// Kalit APP_SECRET'dan hosil qilinadi — server qayta ishga tushsa ham o'zgarmaydi
const key = () => crypto.createHash('sha256').update(`indexnow:${config.secret}`).digest('hex').slice(0, 32);

// Faqat haqiqiy (https, localhost emas) saytda va test rejimidan tashqarida
const enabled = () => process.env.NODE_ENV !== 'test' && /^https:\/\//.test(config.siteUrl) && !/localhost|127\.0\.0\.1/.test(config.siteUrl);

let queue = new Set();
let timer = null;

async function send(urls) {
  const host = new URL(config.siteUrl).host;
  const body = JSON.stringify({ host, key: key(), keyLocation: `${config.siteUrl}/${key()}.txt`, urlList: urls.slice(0, 10000) });
  const out = [];
  for (const ep of ENDPOINTS) {
    try {
      const r = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body, signal: AbortSignal.timeout(15000) });
      out.push(`${new URL(ep).host}:${r.status}`);
    } catch (e) {
      out.push(`${new URL(ep).host}:${e.message}`);
    }
  }
  console.log(`[indexnow] ${urls.length} ta manzil → ${out.join(', ')}`);
  return out;
}

// Manzillarni navbatga qo'yish (yo'l, masalan '/listing/5'); 60 soniyada bir marta jo'natiladi
function submit(paths) {
  if (!enabled()) return;
  for (const p of [].concat(paths)) queue.add(`${config.siteUrl}${p}`);
  if (timer) return;
  timer = setTimeout(() => {
    const urls = [...queue];
    queue = new Set();
    timer = null;
    send(urls).catch(() => {});
  }, 60000);
  timer.unref?.();
}

// Yangi e'lon: asosiy manzil va asosiy tillardagi variantlari
function listing(id) {
  submit([`/listing/${id}`, `/listing/${id}?lang=uz`, `/listing/${id}?lang=ru`]);
}

module.exports = { key, enabled, submit, listing, send };
