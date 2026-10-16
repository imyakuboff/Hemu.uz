// Rangli rasmlar (SVG): bo'limlar kartochkalari, bog'lanish va boshqa joylar uchun.
// Hammasi qo'lda chizilgan — tashqi rasmlarsiz, istalgan ekranda tiniq.

const g = (id, a, b) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
const svg = (body, defs = '', vb = '0 0 120 90') => `<svg class="art" viewBox="${vb}" aria-hidden="true"><defs>${defs}</defs>${body}</svg>`;
const shadow = (cx, cy, rx) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="3.5" fill="#0e3352" opacity=".12"/>`;

// Gusenitsali ekskavator (to'q sariq)
const excavator = svg(`${shadow(62, 84, 46)}
  <rect x="26" y="66" width="64" height="15" rx="7.5" fill="#3c4650"/><rect x="29" y="69" width="58" height="9" rx="4.5" fill="#59646f"/>
  ${[35, 47, 59, 71, 81].map((x) => `<circle cx="${x}" cy="73.5" r="3" fill="#2a3138"/>`).join('')}
  <rect x="34" y="60" width="44" height="8" rx="2" fill="#2f3840"/>
  <path d="M38 40h30l8 10v12H38z" fill="url(#exo)"/><path d="M40 24h18l4 16H40z" fill="url(#exo)"/>
  <path d="M43 27h12l3 11H43z" fill="#bfe3f6"/><path d="M45 28h4l-2 9h-3z" fill="#fff" opacity=".6"/>
  <rect x="62" y="46" width="12" height="3" rx="1.5" fill="#c24f0a"/><rect x="62" y="51" width="12" height="3" rx="1.5" fill="#c24f0a"/>
  <path d="M60 42 L84 14 L90 18 L68 46z" fill="url(#exo)"/><path d="M84 14 L104 30 L100 36 L82 22z" fill="url(#exo)"/>
  <path d="M100 32 L112 48 L100 58 L94 52 L104 46 L96 38z" fill="#4a5560"/><path d="M98 54l3 4 3-3 3 3 3-3" stroke="#2a3138" stroke-width="2" fill="none"/>
  <rect x="72" y="22" width="16" height="3" rx="1.5" fill="#9aa5b1" transform="rotate(-48 80 23)"/>`, g('exo', '#ffb02e', '#f07c0e'));

// Ekskavator-pogruzchik kovshi (ijara)
const loader = svg(`${shadow(64, 84, 40)}
  <path d="M34 30 L70 14 L76 20 L44 40z" fill="url(#ld)"/><rect x="62" y="12" width="20" height="9" rx="4" fill="#3c4650"/>
  <path d="M40 34 L62 60 L56 64 L34 40z" fill="url(#ld)"/>
  <path d="M50 52 Q46 78 70 82 L104 82 Q100 60 84 50 Z" fill="url(#bk)"/><path d="M58 58 Q58 74 74 76 L96 76" stroke="#7d5a12" stroke-width="2.5" fill="none" opacity=".5"/>
  ${[74, 82, 90, 98].map((x) => `<path d="M${x} 82 l3 6 3-6z" fill="#5b4310"/>`).join('')}
  <circle cx="38" cy="36" r="5" fill="#2a3138"/><circle cx="60" cy="60" r="4" fill="#2a3138"/>`, g('ld', '#ffc61a', '#e0a800') + g('bk', '#c7932b', '#8a5f13'));

// Ehtiyot qismlar: tormoz diski va shesternya
const gear = (cx, cy, r, fill) => {
  const teeth = Array.from({ length: 10 }, (_, i) => `<rect x="${cx - 3.5}" y="${cy - r - 5}" width="7" height="9" rx="1.5" fill="${fill}" transform="rotate(${i * 36} ${cx} ${cy})"/>`).join('');
  return `${teeth}<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/><circle cx="${cx}" cy="${cy}" r="${r * 0.38}" fill="#e7ecf1"/>`;
};
const parts = svg(`${shadow(60, 84, 44)}
  <circle cx="50" cy="52" r="30" fill="url(#disc)"/><circle cx="50" cy="52" r="22" fill="none" stroke="#7a8794" stroke-width="2" stroke-dasharray="3 4"/>
  <circle cx="50" cy="52" r="12" fill="#5b6672"/>${[0, 72, 144, 216, 288].map((a) => `<circle cx="50" cy="45" r="2.2" fill="#2a3138" transform="rotate(${a} 50 52)"/>`).join('')}
  <path d="M60 24 a30 30 0 0 1 18 18 l-14 6z" fill="#e34d2c"/><rect x="66" y="30" width="12" height="20" rx="3" fill="#c23a1f" transform="rotate(30 72 40)"/>
  ${gear(88, 64, 13, '#f0a223')}`, `<radialGradient id="disc"><stop offset=".55" stop-color="#d9dfe5"/><stop offset="1" stop-color="#8d99a5"/></radialGradient>`);

// Fura (shatakchi + pritsep)
const fura = svg(`${shadow(60, 82, 52)}
  <rect x="8" y="26" width="72" height="42" rx="4" fill="url(#trl)"/><rect x="12" y="30" width="64" height="4" rx="2" fill="#ffffff" opacity=".35"/>
  <text x="44" y="53" text-anchor="middle" font-size="11" font-weight="800" font-style="italic" fill="#0e3352" font-family="Inter,Arial">HEMU</text>
  <path d="M82 38 h18 l12 14 v16 H82z" fill="url(#cab)"/><path d="M86 42 h12 l8 10 h-20z" fill="#bfe3f6"/>
  <rect x="80" y="66" width="34" height="5" rx="2" fill="#2f3840"/><rect x="8" y="66" width="72" height="5" rx="2" fill="#2f3840"/>
  ${[22, 34, 92, 106].map((x) => `<circle cx="${x}" cy="73" r="7" fill="#2a3138"/><circle cx="${x}" cy="73" r="3" fill="#9aa5b1"/>`).join('')}`, g('trl', '#eef3f8', '#c9d5e1') + g('cab', '#2f86db', '#0b5fae'));

// Yuk (qutilar)
const box = (x, y, w, h, c1, c2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${c1}"/><rect x="${x + w / 2 - 4}" y="${y}" width="8" height="${h}" fill="${c2}"/><rect x="${x}" y="${y}" width="${w}" height="5" rx="2" fill="${c2}" opacity=".6"/>`;
const cargo = svg(`${shadow(60, 84, 42)}
  <rect x="18" y="74" width="84" height="8" rx="2" fill="#a0713a"/><rect x="22" y="76" width="10" height="6" fill="#7a5226"/><rect x="55" y="76" width="10" height="6" fill="#7a5226"/><rect x="88" y="76" width="10" height="6" fill="#7a5226"/>
  ${box(22, 46, 36, 28, '#d9a35b', '#c08440')}${box(60, 46, 38, 28, '#e3b06a', '#c99248')}${box(38, 18, 40, 28, '#efc07a', '#d29e52')}
  <path d="M84 14 l14 0 l-7 -8z" fill="#2f86db"/><rect x="89" y="14" width="4" height="10" fill="#2f86db"/>`);

// Transport (tent yuk mashinasi)
const truck = svg(`${shadow(60, 82, 48)}
  <rect x="10" y="30" width="62" height="36" rx="4" fill="url(#tent)"/>${[20, 32, 44, 56].map((x) => `<rect x="${x}" y="30" width="2" height="36" fill="#0e3352" opacity=".15"/>`).join('')}
  <path d="M74 36 h20 l14 16 v14 H74z" fill="url(#cab2)"/><path d="M78 40 h14 l10 12 h-24z" fill="#bfe3f6"/>
  <rect x="8" y="64" width="102" height="5" rx="2" fill="#2f3840"/>
  ${[24, 40, 96].map((x) => `<circle cx="${x}" cy="72" r="7" fill="#2a3138"/><circle cx="${x}" cy="72" r="3" fill="#9aa5b1"/>`).join('')}`, g('tent', '#3aa76d', '#23824f') + g('cab2', '#ffc61a', '#f0a90a'));

// Ta'mirlash: asboblar qutisi
const toolbox = svg(`${shadow(60, 84, 42)}
  <rect x="44" y="12" width="6" height="34" rx="2" fill="#9aa5b1" transform="rotate(-18 47 29)"/><circle cx="40" cy="12" r="7" fill="none" stroke="#9aa5b1" stroke-width="5" transform="rotate(-18 47 29)"/>
  <rect x="66" y="10" width="6" height="34" rx="2" fill="#d33a2c" transform="rotate(16 69 27)"/><rect x="64" y="8" width="10" height="10" rx="2" fill="#6b7682" transform="rotate(16 69 27)"/>
  <path d="M46 30 h28 v-6 a4 4 0 0 0 -4 -4 h-20 a4 4 0 0 0 -4 4z" fill="none" stroke="#c23a1f" stroke-width="4"/>
  <rect x="18" y="32" width="84" height="48" rx="6" fill="url(#tb)"/><rect x="18" y="44" width="84" height="5" fill="#a52c1a"/><rect x="54" y="40" width="12" height="12" rx="2" fill="#f0c043"/>
  <rect x="24" y="36" width="72" height="3" rx="1.5" fill="#fff" opacity=".3"/>`, g('tb', '#ff6a3d', '#d33a2c'));

// Mexaniklar: kalit + shesternya
const mechanic = svg(`${shadow(60, 84, 38)}
  ${gear(50, 48, 20, '#2f86db')}
  <path d="M70 70 L96 30" stroke="#8d99a5" stroke-width="9" stroke-linecap="round"/><path d="M92 18 a10 10 0 1 0 12 14 l-7 -3 -2 -6z" fill="#8d99a5"/><circle cx="72" cy="68" r="4" fill="#6b7682"/>`);

// Haydovchilar: rul
const wheel = svg(`${shadow(60, 84, 36)}
  <circle cx="60" cy="46" r="34" fill="#2a3138"/><circle cx="60" cy="46" r="26" fill="#eef2f6"/><circle cx="60" cy="46" r="29" fill="none" stroke="#3c4650" stroke-width="2"/>
  <path d="M34 46 h52" stroke="#2a3138" stroke-width="8"/><path d="M60 46 v26" stroke="#2a3138" stroke-width="8"/>
  <circle cx="60" cy="46" r="10" fill="#3c4650"/><circle cx="60" cy="46" r="5" fill="#ffc61a"/>
  <path d="M30 34 a32 32 0 0 1 22 -20" stroke="#fff" stroke-width="3" fill="none" opacity=".35" stroke-linecap="round"/>`);

// Buyurtmalar (zayavka): qo'l berishish
const deal = svg(`${shadow(60, 82, 42)}
  <path d="M10 40 l18 -8 l16 26 l-14 10z" fill="#2f86db"/><path d="M110 40 l-18 -8 l-16 26 l14 10z" fill="#0e3352"/>
  <path d="M30 40 l20 -10 l14 4 l18 -6 l12 22 l-24 22 q-6 5 -12 0 l-22 -18z" fill="url(#skin)"/>
  <path d="M58 36 l-14 12 q-4 5 2 8 q5 2 10 -3 l10 -8" fill="#f6c39b"/>
  ${[0, 1, 2, 3].map((i) => `<path d="M${56 + i * 7} ${62 + i * 2} q4 4 8 0" stroke="#d48d5c" stroke-width="2.2" fill="none"/>`).join('')}`, g('skin', '#ffd0a8', '#f2a874'));

// Logistika (yo'l va pin)
const route = svg(`${shadow(60, 84, 40)}
  <path d="M14 76 C 40 40, 70 90, 104 30" stroke="#c9d5e1" stroke-width="10" fill="none" stroke-linecap="round"/>
  <path d="M14 76 C 40 40, 70 90, 104 30" stroke="#fff" stroke-width="2" stroke-dasharray="6 6" fill="none"/>
  <circle cx="14" cy="76" r="7" fill="#ffc61a"/><path d="M104 8 c-9 0 -15 6 -15 14 c0 11 15 24 15 24 s15 -13 15 -24 c0 -8 -6 -14 -15 -14z" fill="#e34d2c"/><circle cx="104" cy="22" r="5" fill="#fff"/>`);

// Asosiy bo'limlar uchun 3D rasmlar (public/img/sec), qolganlari — SVG
const img = (n) => `<img class="art" src="/img/sec/${n}.png?v=2" alt="" loading="lazy" decoding="async">`;
export const ART = {
  transportsale: img('sale'), transportrental: img('rent'), sparepart: img('parts'), fura, cargologistic: cargo,
  transportlogistic: truck, 'transport-repair': img('repair'), mechanic, driver: img('driver'), application: img('deal'), route,
};
export const ART_SVG = { excavator, loader, parts, toolbox, wheel, deal };

// Brend logotiplari (rangli doira) — bog'lanish va footer uchun
export const BRAND = {
  telegram: '<svg class="brand-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#229ED9"/><path d="M5.4 11.8l11.2-4.3c.5-.2 1 .1.8.9l-1.9 9c-.1.6-.5.8-1.1.5l-3-2.2-1.4 1.4c-.2.2-.3.3-.6.3l.2-3.1 5.6-5.1c.2-.2 0-.3-.4-.1l-6.9 4.4-3-.9c-.6-.2-.7-.6.5-.8z" fill="#fff"/></svg>',
  phone: '<svg class="brand-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#1fb35b"/><path d="M8.6 6.5c.3-.3.8-.3 1.1 0l1.5 1.8c.3.3.2.8-.1 1.1l-.9.8c.6 1.3 1.6 2.3 2.9 2.9l.8-.9c.3-.3.8-.4 1.1-.1l1.8 1.5c.3.3.3.8 0 1.1l-1 1.1c-.5.5-1.3.7-2 .4-3-1.2-5.3-3.5-6.5-6.5-.3-.7-.1-1.5.4-2z" fill="#fff"/></svg>',
  email: '<svg class="brand-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#5b6b7c"/><rect x="6" y="8" width="12" height="9" rx="1.5" fill="#fff"/><path d="M6.5 8.6l5.5 4.3 5.5-4.3" stroke="#5b6b7c" stroke-width="1.4" fill="none"/></svg>',
};
