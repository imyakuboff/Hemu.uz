// Bosh sahifadagi reklama karuseli. Admin paneldan tahrirlanadi, `settings` jadvalida saqlanadi.
// Matn maydonlari bo'sh bo'lsa, sayt banner `slot`i uchun tarjima qilingan standart matnni ko'rsatadi.
const settings = require('./settings');
const { fail } = require('./http');

const MAX = 6;
const THEMES = ['yellow', 'navy', 'blue', 'dark'];

const DEFAULTS = [
  { id: 1, uid: 'def00001', slot: 1, title: '', text: '', cta: '', link: '/plans', image: '/img/demo/jcb.jpg', theme: 'yellow', active: true },
  { id: 2, uid: 'def00002', slot: 2, title: '', text: '', cta: '', link: '/about#safe', image: '/img/demo/crane.jpg', theme: 'navy', active: true },
  { id: 3, uid: 'def00003', slot: 3, title: '', text: '', cta: '', link: '/create', image: '/img/demo/kamaz.jpg', theme: 'blue', active: true },
];

// uid — statistika uchun doimiy identifikator (tartib o'zgarsa ham saqlanadi)
const all = () => (settings.getRaw('banners') || DEFAULTS).map((b) => ({ ...b, uid: b.uid || `old${b.id}0000`.slice(0, 8) }));
const newUid = () => require('node:crypto').randomBytes(4).toString('hex');
const active = () => all().filter((b) => b.active);

// Faqat ichki manzil yoki rasm yo'li — tashqi skript/javascript: havolalar qabul qilinmaydi
const safePath = (v, field) => {
  const s = String(v ?? '').trim();
  if (s && !/^\/(?!\/)[^\s"'<>]*$/.test(s) && !/^https:\/\/[^\s"'<>]+$/.test(s)) fail(422, 'err.validation', { [field]: 'invalid' });
  return s;
};
const str = (v, max, field) => {
  const s = String(v ?? '').trim();
  if (s.length > max) fail(422, 'err.validation', { [field]: 'too_long' });
  return s;
};

function save(list) {
  if (!Array.isArray(list) || list.length > MAX) fail(422, 'err.validation', { banners: `max_${MAX}` });
  const clean = list.map((b, i) => ({
    id: i + 1,
    uid: /^[a-z0-9]{8}$/.test(b.uid || '') ? b.uid : newUid(),
    slot: [1, 2, 3].includes(b.slot) ? b.slot : null, // standart tarjima matni qaysi slotdan olinadi
    title: str(b.title, 120, 'title'),
    text: str(b.text, 240, 'text'),
    cta: str(b.cta, 40, 'cta'),
    link: safePath(b.link, 'link') || '/',
    image: safePath(b.image, 'image'),
    theme: THEMES.includes(b.theme) ? b.theme : 'yellow',
    active: b.active !== false,
  }));
  settings.setRaw('banners', clean);
  return clean;
}

module.exports = { all, active, save, DEFAULTS, THEMES, MAX };
