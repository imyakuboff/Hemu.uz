// Xizmatlar bo'limi rubrikalari uchun rangli rasmlar (SVG, qo'lda chizilgan)
import { ART_SVG } from './art.js';

const svg = (body, defs = '') => `<svg class="sart" viewBox="0 0 120 90" aria-hidden="true"><defs>${defs}</defs>${body}</svg>`;
const g = (id, a, b) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
const shadow = (cx, cy, rx) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="3.5" fill="#1b1b1b" opacity=".14"/>`;

// Uskunalar ijarasi: shurupovert va lazer daraja
const tools = svg(`${shadow(60, 84, 44)}
  <rect x="62" y="56" width="44" height="22" rx="4" fill="#2f3840"/><rect x="66" y="60" width="36" height="14" rx="3" fill="#4b5661"/>
  <circle cx="84" cy="67" r="5" fill="#ff4d3d"/><circle cx="84" cy="67" r="2" fill="#ffd0c9"/>
  <path d="M84 56 l-26 -22" stroke="#ff4d3d" stroke-width="1.5" opacity=".7"/><path d="M84 56 l28 -20" stroke="#ff4d3d" stroke-width="1.5" opacity=".7"/>
  <path d="M18 30 h40 a8 8 0 0 1 8 8 v4 a8 8 0 0 1 -8 8 h-12 l4 26 h-16 l-2 -26 h-14 z" fill="url(#drl)"/>
  <rect x="30" y="72" width="22" height="10" rx="2" fill="#2f3840"/>
  <rect x="6" y="36" width="14" height="8" rx="2" fill="#6b7682"/><path d="M-4 40 h12" stroke="#9aa5b1" stroke-width="3" stroke-linecap="round"/>
  <rect x="34" y="34" width="18" height="4" rx="2" fill="#fff" opacity=".35"/>`, g('drl', '#ffd21a', '#f0a90a'));

// Qurilish materiallarini yetkazish: bortli yuk mashinasi (qoplar va g'isht)
const delivery = svg(`${shadow(60, 82, 52)}
  <rect x="6" y="46" width="70" height="20" rx="2" fill="#f0a90a"/><rect x="6" y="44" width="70" height="4" fill="#d48f00"/>
  ${[[10, 30], [24, 30], [38, 30]].map(([x, y]) => `<path d="M${x} ${y + 14} q7 -18 14 0 z" fill="#e8dcc2"/><rect x="${x}" y="${y + 6}" width="14" height="8" rx="2" fill="#efe5cf"/>`).join('')}
  <rect x="54" y="32" width="18" height="6" fill="#d2603a"/><rect x="54" y="38" width="18" height="6" fill="#c4502c"/>
  <path d="M78 34 h18 l14 16 v16 H78z" fill="url(#dcab)"/><path d="M82 38 h12 l10 12 h-22z" fill="#bfe3f6"/>
  <rect x="4" y="64" width="108" height="5" rx="2" fill="#2f3840"/>
  ${[20, 36, 96].map((x) => `<circle cx="${x}" cy="72" r="7" fill="#2a3138"/><circle cx="${x}" cy="72" r="3" fill="#9aa5b1"/>`).join('')}`, g('dcab', '#3a3f45', '#1f2327'));

// Kvartira ta'miri: devor, bo'yoq valigi va narvon
const apartment = svg(`${shadow(60, 84, 48)}
  <rect x="10" y="14" width="70" height="66" rx="3" fill="#f3efe7"/><rect x="10" y="14" width="34" height="66" fill="#ffd21a" opacity=".85"/>
  <rect x="18" y="24" width="20" height="18" rx="2" fill="#bfe3f6"/><path d="M28 24 v18 M18 33 h20" stroke="#fff" stroke-width="2"/>
  <rect x="48" y="56" width="26" height="22" rx="3" fill="#8d6e63"/><rect x="50" y="52" width="22" height="6" rx="3" fill="#a1887f"/>
  <path d="M86 20 l-8 60 M106 20 l8 60 M84 34 h24 M82 50 h28 M80 66 h32" stroke="#9aa5b1" stroke-width="3" stroke-linecap="round"/>
  <rect x="38" y="6" width="26" height="10" rx="4" fill="#ffd21a" stroke="#d48f00" stroke-width="1.5"/><path d="M64 11 h6 v10 h-14 v8" stroke="#2f3840" stroke-width="2.5" fill="none"/>
  <rect x="53" y="29" width="6" height="14" rx="2" fill="#2f3840"/>`);

// Uy qurilishi va ta'miri: qurilayotgan uy
const house = svg(`${shadow(60, 84, 50)}
  <path d="M14 46 L52 18 L90 46 Z" fill="#e34d2c"/><path d="M14 46 L52 18 L56 21 L20 48 Z" fill="#ff7a5c" opacity=".6"/>
  <rect x="20" y="46" width="64" height="34" fill="#f3e3c8"/>
  ${[0, 1, 2, 3].map((r) => [0, 1, 2, 3, 4].map((c) => `<rect x="${20 + c * 13 + (r % 2) * 6}" y="${48 + r * 8}" width="12" height="7" fill="#e9c99b" opacity=".5"/>`).join('')).join('')}
  <rect x="44" y="58" width="16" height="22" rx="2" fill="#8d6e63"/><rect x="26" y="54" width="12" height="12" rx="1" fill="#bfe3f6"/><rect x="66" y="54" width="12" height="12" rx="1" fill="#bfe3f6"/>
  <path d="M98 80 V12 M98 12 H72 M98 12 l12 0 M104 12 v6 h-6" stroke="#ffc61a" stroke-width="3"/><path d="M78 12 v14" stroke="#2f3840" stroke-width="1.5"/><rect x="74" y="26" width="8" height="5" fill="#d2603a"/>
  <path d="M94 80 l4 -10 l4 10" stroke="#ffc61a" stroke-width="2" fill="none"/>`);

// Hududni obodonlashtirish: daraxt, skameyka, gulzor
const landscape = svg(`${shadow(60, 84, 52)}
  <path d="M6 80 Q60 66 114 80 Z" fill="#7cc36b"/><path d="M6 80 Q60 70 114 80" stroke="#5aa64a" stroke-width="2" fill="none"/>
  <rect x="30" y="44" width="6" height="34" rx="2" fill="#8d6e63"/>
  <circle cx="33" cy="34" r="18" fill="#3aa76d"/><circle cx="22" cy="40" r="11" fill="#2f9a60"/><circle cx="45" cy="40" r="11" fill="#45b57a"/><circle cx="33" cy="22" r="10" fill="#57c288"/>
  <rect x="58" y="62" width="34" height="5" rx="2" fill="#a1764b"/><rect x="58" y="54" width="34" height="4" rx="2" fill="#b98a5a"/>
  <path d="M62 67 v10 M88 67 v10" stroke="#3c4650" stroke-width="3"/>
  ${[[98, 70, '#ff5a7a'], [104, 66, '#ffd21a'], [108, 72, '#ff8a3d']].map(([x, y, c]) => `<path d="M${x} ${y + 8} v-6" stroke="#3aa76d" stroke-width="2"/><circle cx="${x}" cy="${y}" r="3.5" fill="${c}"/>`).join('')}`);

// Servis: shesternya va moy idishi
const service = svg(`${shadow(60, 84, 40)}
  ${Array.from({ length: 10 }, (_, i) => `<rect x="46.5" y="12" width="9" height="12" rx="2" fill="#ffc61a" transform="rotate(${i * 36} 51 42)"/>`).join('')}
  <circle cx="51" cy="42" r="24" fill="#ffc61a"/><circle cx="51" cy="42" r="10" fill="#2f3840"/>
  <path d="M78 52 h22 l6 8 v20 h-28z" fill="#2f3840"/><rect x="82" y="62" width="18" height="10" rx="2" fill="#ffc61a"/><path d="M100 52 l8 -8 h6" stroke="#2f3840" stroke-width="3" fill="none"/>`);

export const SVC_ART = {
  'equipment-rental': ART_SVG.excavator, 'tool-rental': tools, delivery, 'apartment-repair': apartment,
  'house-building': house, landscaping: landscape, repair: ART_SVG.toolbox, maintenance: service,
};
