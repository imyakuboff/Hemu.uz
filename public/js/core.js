import { DICT, LANGS } from './dict.js';

// ---------- Holat ----------
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* */ } },
};

export const state = {
  token: ls.get('mx_token'),
  user: null,
  meta: null,
  lang: ls.get('mx_lang') || 'ru', // dizayn rus tilida
  currency: ls.get('mx_currency') || null,
  country: ls.get('mx_country') || '', // '' = butun mintaqa
  region: ls.get('mx_region') || '',
  badges: {},
};

export function setLang(l) { state.lang = l; ls.set('mx_lang', l); applyDir(); }
export function setCurrency(c) { state.currency = c; ls.set('mx_currency', c); }
export function setLocation(country, region) {
  state.country = country || ''; state.region = region || '';
  ls.set('mx_country', state.country); ls.set('mx_region', state.region);
}
// ---------- Mavzu: yorug' (standart) yoki qorong'i ----------
export const getTheme = () => (ls.get('mx_theme') === 'dark' ? 'dark' : 'light');
export function applyTheme(theme = getTheme()) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name=color-scheme]')?.setAttribute('content', theme === 'dark' ? 'dark' : 'only light');
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 'dark' ? '#0d141c' : '#0e3352');
}
export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  ls.set('mx_theme', next);
  applyTheme(next);
  return next;
}
// Tugma: hozirgi mavzuga qarab — yorug'da 🌙 "Qorong'i", qorong'ida ☀ "Yorug'"
export const themeButton = (cls = 'theme-btn', withLabel = true) => {
  const dark = getTheme() === 'dark';
  return `<button type="button" class="${cls}${cls.includes('theme-btn') ? '' : ' theme-btn'}" data-theme-toggle title="${esc(t(dark ? 'theme_light' : 'theme_dark'))}" aria-label="${esc(t(dark ? 'theme_light' : 'theme_dark'))}">${icon(dark ? 'sun' : 'moon')}${withLabel ? ` <span>${esc(t(dark ? 'theme_light' : 'theme_dark'))}</span>` : ''}</button>`;
};

// Rasmni kerakli o'lchamga keltirish: cover — markazdan kesib aniq w×h (reklama karuseli),
// aks holda faqat kichraytirish (eng uzun tomoni max px). JPEG qaytaradi.
export async function fitImage(file, { w, h, cover = false, max = 1600, quality = 0.86 } = {}) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || typeof createImageBitmap !== 'function') return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  let sx = 0; let sy = 0; let sw = bmp.width; let sh = bmp.height; let tw; let th;
  if (cover) {
    const r = w / h;
    if (sw / sh > r) { const nw = sh * r; sx = (sw - nw) / 2; sw = nw; } else { const nh = sw / r; sy = (sh - nh) / 2; sh = nh; }
    tw = w; th = h;
  } else {
    const k = Math.min(1, max / Math.max(sw, sh));
    if (k === 1 && file.size < 1.5e6) return file;
    tw = Math.round(sw * k); th = Math.round(sh * k);
  }
  const c = document.createElement('canvas');
  c.width = tw; c.height = th;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, tw, th);
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, sx, sy, sw, sh, 0, 0, tw, th);
  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
  return blob ? new File([blob], `${file.name.replace(/\.\w+$/, '')}.jpg`, { type: 'image/jpeg' }) : file;
}

export function setToken(tk) { state.token = tk; ls.set('mx_token', tk); }

export function applyDir() {
  const rtl = state.lang === 'prs' || state.lang === 'ps';
  document.documentElement.lang = state.lang === 'prs' ? 'fa' : state.lang;
  document.documentElement.dir = rtl ? 'rtl' : 'ltr';
}

// ---------- Tarjima ----------
export function t(key, params) {
  const d = DICT[key];
  let s = d ? (d[state.lang] || d.ru || d.en) : key;
  if (params) s = s.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? ''));
  return s;
}
export { LANGS };

// ---------- Yordamchilar ----------
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const qs = (o) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o || {})) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const locale = () => ({ uz: 'uz-Latn-UZ', ru: 'ru-RU', en: 'en-GB', kk: 'kk-KZ', ky: 'ky-KG', tg: 'tg-TJ', tk: 'tk-TM', az: 'az-Latn-AZ', prs: 'fa-AF', ps: 'ps-AF' }[state.lang] || 'ru-RU');
export const num = (n) => new Intl.NumberFormat(locale()).format(n ?? 0);
// Server bilan bir xil: Intl mahalliy belgini bermagan valyutalar uchun
const SYM = {
  UZS: { ru: 'сум', kk: 'сум', ky: 'сум', tg: 'сӯм', tk: 'som', az: 'som' },
  KGS: { ru: 'сом', kk: 'сом', uz: "so'm", tg: 'сом', tk: 'som', az: 'som' },
  TJS: { ru: 'сомони', kk: 'сомони', ky: 'сомони', uz: 'somoni', tk: 'somoni', az: 'somoni' },
  TMT: { ru: 'манат', kk: 'манат', ky: 'манат', uz: 'manat', tg: 'манат', az: 'manat' },
  AZN: { ru: '₼', kk: '₼', ky: '₼', uz: '₼', tg: '₼', tk: '₼' },
};
export const money = (amount, currency) => {
  const s = new Intl.NumberFormat(locale(), { style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: amount >= 1000 ? 0 : 2 }).format(amount);
  const sym = SYM[currency]?.[state.lang];
  return sym ? s.replace(currency, sym) : s;
};

// SQLite "YYYY-MM-DD HH:MM:SS" (UTC) -> Date
export const toDate = (s) => (s ? new Date(s.includes('T') ? s : `${s.replace(' ', 'T')}Z`) : null);
export function fmtTime(s) {
  const d = toDate(s);
  return d ? new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' }).format(d) : '';
}
export function fmtDate(s, withTime = false) {
  const d = toDate(s);
  if (!d) return '';
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(d);
}
// "Сегодня, 10:24" / "Вчера, 16:40" / "10 октября"
export function fmtRel(s) {
  const d = toDate(s);
  if (!d) return '';
  const now = new Date();
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if (diff === 0) return t('today', { t: fmtTime(s) });
  if (diff === 1) return t('yesterday', { t: fmtTime(s) });
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long' }).format(d);
}
// Bosh harflar: tirnoq va yuridik shakllarsiz (ООО, ТОО, MChJ ...)
const LEGAL = /^(ооо|тоо|оао|зао|ип|осoo|осоо|mchj|mmc|llc|hj|ltd)$/i;
export const initials = (name) => {
  const words = String(name || '?').replace(/[«»"'“”().,]/g, ' ').split(/\s+/).filter((w) => w && /\p{L}/u.test(w[0]) && !LEGAL.test(w));
  return (words.slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase();
};
export const debounce = (fn, ms = 300) => {
  let h;
  return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); };
};

// ---------- API ----------
export class ApiErr extends Error {
  constructor(status, body) {
    super(body?.error?.message || 'Error');
    this.status = status;
    this.code = body?.error?.code;
    this.details = body?.error?.details;
  }
}
export async function api(path, { method = 'GET', body, form, silent = false, headers: extra = {} } = {}) {
  const headers = { 'X-Lang': state.lang, ...extra };
  if (state.currency) headers['X-Currency'] = state.currency;
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let res;
  try {
    res = await fetch(`/api/v1${path}`, { method, headers, body: payload });
  } catch (e) {
    if (!silent) toast(t('error'), 'err');
    throw e;
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new ApiErr(res.status, json);
    if (res.status === 401 && state.token) { setToken(null); state.user = null; }
    if (!silent && res.status !== 401) toast(err.message, 'err');
    throw err;
  }
  return json;
}

// ---------- Ikonkalar (24x24, chiziqli) ----------
const P = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/>',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  'arrow-left': '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1Z"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.6a1 1 0 0 0-.2-.6l-3.5-4.4A1 1 0 0 0 17.5 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  excavator: '<path d="M3 17h10"/><circle cx="5" cy="19" r="1.5"/><circle cx="11" cy="19" r="1.5"/><path d="M4 14V10h5l2 4H4Z"/><path d="M11 14 14 6l5 3-1.5 4"/><path d="M17.5 13 16 16h4Z"/>',
  sprout: '<path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9Z"/>',
  crane: '<path d="M3 21h8"/><path d="M6 21V5"/><path d="M6 5h14"/><path d="M6 9l4-4"/><path d="M18 5v6"/><rect x="16" y="11" width="4" height="3" rx=".5"/><path d="M6 13h4"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3-3a2 2 0 0 0-2.8 0L6 21"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h6"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  box: '<path d="M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  clip: '<path d="m21.4 11-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20"/>',
  logo: '<path d="M7 17 17 7M8 7h9v9"/>',
  dash: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  dots: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1Z"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z"/><path d="M9 3v15M15 6v15"/>',
  flag: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>',
  scale: '<path d="M12 3v18M7 21h10M5 7h14M5 7l-3 7a3 3 0 0 0 6 0Zm14 0-3 7a3 3 0 0 0 6 0Z"/>',
  rocket: '<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1Z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.9A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2Z"/><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 16V11M12 16V7M17 16v-3"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  calc: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
  telegram: '<path d="m22 3-20 8 7 3 2 7 4-5 5 4Z"/><path d="m9 14 13-11"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
};
export const icon = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || P.grid}</svg>`;

// Rasm yo'q e'lonlar uchun kategoriya rasmi
const CAT_ICON = { special: 'excavator', parts: 'gear', trucks: 'truck', construction: 'crane', materials: 'layers', services: 'wrench' };
export const catIcon = (slug) => CAT_ICON[slug] || 'grid';
export function placeholder(catSlug) {
  const p = P[catIcon(catSlug)];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e6edf4"/><stop offset="1" stop-color="#d3dde8"/></linearGradient></defs><rect width="320" height="200" fill="url(#g)"/><g transform="translate(124 64) scale(3)" fill="none" stroke="#9fb3c7" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${p}</g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// ---------- Toast va modal ----------
export function toast(msg, type = '') {
  let wrap = $('.toast-wrap');
  if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

export function openModal(html, { wide = false, onMount } = {}) {
  closeModal();
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog"><button class="close" data-close aria-label="${esc(t('close'))}">${icon('x')}</button>${html}</div>`;
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) closeModal(); });
  bg.querySelector('[data-close]').addEventListener('click', closeModal);
  document.body.appendChild(bg);
  const m = bg.querySelector('.modal');
  onMount?.(m);
  m.querySelector('input:not([type=hidden]),select,textarea')?.focus();
  return m;
}
export function closeModal() { $('.modal-bg')?.remove(); }
export function confirmBox(text) {
  return new Promise((resolve) => {
    const m = openModal(`<h3>${esc(t('confirm_q'))}</h3><p class="muted">${esc(text)}</p><div style="display:flex;gap:8px;margin-top:18px"><button class="btn btn-primary" data-yes>OK</button><button class="btn btn-soft" data-no>${esc(t('back'))}</button></div>`);
    m.querySelector('[data-yes]').onclick = () => { closeModal(); resolve(true); };
    m.querySelector('[data-no]').onclick = () => { closeModal(); resolve(false); };
  });
}

// Formadan obyekt
export function formData(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
    else o[el.name] = el.value.trim();
  }
  return o;
}
// Server validatsiya xatolarini maydonlarda ko'rsatish
export function markErrors(form, details) {
  $$('.err', form).forEach((e) => e.classList.remove('err'));
  for (const k of Object.keys(details || {})) form.querySelector(`[name="${k}"]`)?.classList.add('err');
  form.querySelector('.err')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
