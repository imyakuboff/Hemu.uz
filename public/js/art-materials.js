// Qurilish materiallari uchun rangli rasmlar (SVG, qo'lda chizilgan — har qanday ekranda tiniq)
const svg = (body, defs = '') => `<svg class="mart" viewBox="0 0 120 90" aria-hidden="true"><defs>${defs}</defs>${body}</svg>`;
const g = (id, a, b, v = true) => `<linearGradient id="${id}" x1="0" y1="0" x2="${v ? 0 : 1}" y2="${v ? 1 : 0}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
const shadow = (cx, cy, rx) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="4" fill="#0e3352" opacity=".14"/>`;

// G'isht (yon ko'rinish, 3D): rang — pishgan yoki xom
const brick = (x, y, top, front, side, w = 40, h = 13, d = 9) => `
  <path d="M${x} ${y} l${d} -${d * 0.6} h${w} l-${d} ${d * 0.6} z" fill="${top}"/>
  <path d="M${x + w} ${y} l${d} -${d * 0.6} v${h} l-${d} ${d * 0.6} z" fill="${side}"/>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${front}"/>`;
const brickHoles = (x, y) => [0, 1, 2].map((i) => `<ellipse cx="${x + 16 + i * 9}" cy="${y - 2.6}" rx="2.6" ry="1.4" fill="#7d2a14" opacity=".55"/>`).join('');

// Sement qopi
const cement = svg(`${shadow(60, 84, 34)}
  <path d="M30 22 q30 -10 60 0 l4 56 q-34 8 -68 0 z" fill="url(#cb)"/>
  <path d="M30 22 q30 -10 60 0 l-2 6 q-28 -8 -56 0 z" fill="#c9bda5"/>
  <rect x="38" y="38" width="44" height="22" rx="2" fill="#fff" opacity=".85"/>
  <text x="60" y="49" text-anchor="middle" font-size="8.5" font-weight="800" fill="#1d4f8f" font-family="Inter,Arial">SEMENT</text>
  <text x="60" y="57" text-anchor="middle" font-size="6.5" font-weight="700" fill="#1d4f8f" font-family="Inter,Arial">M-500 · 50 kg</text>
  <path d="M34 70 q26 5 52 0" stroke="#a89878" stroke-width="1.5" fill="none"/>`, g('cb', '#ece3cf', '#d3c6aa'));

// Qum uyumi
const sand = svg(`${shadow(60, 82, 48)}
  <path d="M12 80 C 26 52, 44 30, 60 30 C 78 30, 96 54, 108 80 Z" fill="url(#sd)"/>
  <path d="M40 46 C 50 36, 70 34, 82 44" stroke="#fff" stroke-width="3" fill="none" opacity=".35" stroke-linecap="round"/>
  ${[[34, 66], [52, 58], [70, 64], [86, 70], [48, 74], [62, 48], [78, 56]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.2" fill="#b98a3e" opacity=".6"/>`).join('')}
  <path d="M88 40 l10 -14 l3 2 l-10 14z" fill="#8d99a5"/><path d="M96 24 l10 -4 l-2 10z" fill="#5b6672"/>`, g('sd', '#f4d590', '#d9a85a'));

// Pishgan g'isht (qizil, teshikli)
const brickFired = svg(`${shadow(60, 84, 46)}
  ${brick(14, 62, '#e0714b', '#c4502c', '#9e3a1d')}${brick(58, 62, '#e0714b', '#c4502c', '#9e3a1d')}
  ${brick(36, 46, '#e8805a', '#cd5a34', '#a84222')}${brickHoles(36, 46)}
  ${brick(28, 30, '#ec8a63', '#d2603a', '#ac4524')}${brickHoles(28, 30)}`);

// Xom g'isht (somon, loy rangi)
const brickRaw = svg(`${shadow(60, 84, 46)}
  ${brick(12, 62, '#cfae84', '#b38f63', '#93714a', 44, 14, 9)}${brick(60, 62, '#cfae84', '#b38f63', '#93714a', 44, 14, 9)}
  ${brick(34, 45, '#d8b98f', '#bc9a6c', '#9a7a52', 44, 14, 9)}
  ${[[20, 68], [30, 72], [70, 66], [84, 71], [46, 50], [62, 54]].map(([x, y]) => `<path d="M${x} ${y} l5 1" stroke="#e9d3a8" stroke-width="1.2"/>`).join('')}`);

// Taxtalar (obreznoy)
const board = (y, c1, c2) => `<path d="M14 ${y} l78 -10 l14 6 l-78 10 z" fill="${c1}"/><path d="M28 ${y + 6} l78 -10 v7 l-78 10 z" fill="${c2}"/><path d="M14 ${y} l14 6 v7 l-14 -6 z" fill="#b07a3c"/>`;
const woodBoards = svg(`${shadow(60, 84, 50)}
  ${board(66, '#f1cf95', '#d9a865')}${board(54, '#f4d6a2', '#ddaf6e')}${board(42, '#f6dcab', '#e1b677')}
  <path d="M40 46 q8 -2 16 -1 M64 43 q8 -2 14 -1" stroke="#c99a5b" stroke-width="1" fill="none"/>
  <ellipse cx="21" cy="48" rx="3" ry="2" fill="#c08945" opacity=".6"/>`);

// Brus
const beam = (x, y) => `<path d="M${x} ${y} h56 l10 -7 h-56 z" fill="#efc78a"/><path d="M${x + 56} ${y} l10 -7 v14 l-10 7 z" fill="#c48d4c"/><rect x="${x}" y="${y}" width="56" height="14" fill="#dcaa66"/>
  <circle cx="${x + 61}" cy="${y + 3}" r="3.5" fill="none" stroke="#a5703a" stroke-width="1"/><circle cx="${x + 61}" cy="${y + 3}" r="1.5" fill="none" stroke="#a5703a" stroke-width="1"/>`;
const woodBeam = svg(`${shadow(60, 84, 46)}${beam(14, 64)}${beam(30, 64)}${beam(22, 48)}${beam(30, 32)}`);

// Fanera / DSP / OSB listlari
const plywood = svg(`${shadow(60, 84, 46)}
  <path d="M20 70 l60 -10 l22 8 l-60 10 z" fill="#c9a26b"/><path d="M42 78 l60 -10 v4 l-60 10 z" fill="#a8824e"/>
  <path d="M24 60 l60 -10 l20 8 l-60 10 z" fill="url(#osb)"/><path d="M44 68 l60 -10 v4 l-60 10 z" fill="#b08445"/>
  ${[[50, 58], [62, 56], [74, 55], [58, 62], [70, 60], [84, 57]].map(([x, y]) => `<path d="M${x} ${y} l6 -1" stroke="#b07f3d" stroke-width="2" opacity=".7"/>`).join('')}
  <path d="M28 46 l60 -10 l18 8 l-60 10 z" fill="#efd7ad"/><path d="M46 54 l60 -10 v3 l-60 10 z" fill="#cdae7e"/>`, g('osb', '#e6bf7c', '#d4a35c', false));

// Melkusok (but tosh)
const stone = (x, y, s, c1, c2) => `<path d="M${x} ${y} l${8 * s} -${6 * s} l${10 * s} ${1 * s} l${5 * s} ${8 * s} l-${6 * s} ${7 * s} l-${12 * s} ${1 * s} z" fill="${c1}"/><path d="M${x + 8 * s} ${y - 6 * s} l${10 * s} ${1 * s} l${5 * s} ${8 * s} l-${9 * s} -${2 * s} z" fill="${c2}"/>`;
const melkusok = svg(`${shadow(60, 84, 46)}
  ${stone(16, 70, 1.4, '#b9b2a4', '#d4cebf')}${stone(48, 72, 1.6, '#a69f91', '#c9c2b3')}${stone(80, 70, 1.2, '#bdb6a8', '#d8d2c4')}
  ${stone(30, 52, 1.5, '#aea798', '#cfc8b9')}${stone(62, 50, 1.3, '#b4ad9f', '#d2ccbd')}${stone(46, 34, 1.2, '#a9a294', '#ccc5b6')}`);

// Penoblok (oq, g'ovakli)
const block = (x, y, w, h, d, top, front, side, extra = '') => `
  <path d="M${x} ${y} l${d} -${d * 0.6} h${w} l-${d} ${d * 0.6} z" fill="${top}"/>
  <path d="M${x + w} ${y} l${d} -${d * 0.6} v${h} l-${d} ${d * 0.6} z" fill="${side}"/>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${front}"/>${extra}`;
const pores = (x, y, w, h) => Array.from({ length: 14 }, (_, i) => `<circle cx="${x + 4 + ((i * 37) % (w - 8))}" cy="${y + 3 + ((i * 23) % (h - 6))}" r="${0.8 + (i % 3) * 0.4}" fill="#c9ced6"/>`).join('');
const penoblok = svg(`${shadow(60, 84, 46)}
  ${block(14, 58, 44, 22, 12, '#fafbfc', '#eef1f5', '#d5dbe3', pores(14, 58, 44, 22))}
  ${block(60, 58, 44, 22, 12, '#fafbfc', '#eef1f5', '#d5dbe3', pores(60, 58, 44, 22))}
  ${block(36, 32, 44, 22, 12, '#ffffff', '#f2f4f7', '#d9dee6', pores(36, 32, 44, 22))}`);

// Shlakoblok (kulrang, teshikli)
const holes = (x, y) => `<rect x="${x + 7}" y="${y - 5.5}" width="10" height="3.4" rx="1" fill="#4f5964"/><rect x="${x + 25}" y="${y - 5.5}" width="10" height="3.4" rx="1" fill="#4f5964"/>`;
const shlakoblok = svg(`${shadow(60, 84, 46)}
  ${block(14, 58, 42, 20, 12, '#9aa4ae', '#808a95', '#66707a')}${block(60, 58, 42, 20, 12, '#9aa4ae', '#808a95', '#66707a')}
  ${block(36, 34, 42, 20, 12, '#a6b0ba', '#8a949f', '#6e7883', holes(40, 34))}
  ${[[20, 66], [30, 72], [70, 64], [86, 70], [44, 42], [60, 46]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1" fill="#5f6873"/>`).join('')}`);

// Shag'al / graviy (mayda toshlar uyumi)
const pebbles = (c1, c2, c3) => svg(`${shadow(60, 82, 46)}
  <path d="M14 80 C 28 54, 46 38, 60 38 C 76 38, 94 56, 106 80 Z" fill="${c1}"/>
  ${Array.from({ length: 34 }, (_, i) => { const x = 22 + ((i * 29) % 78); const y = 46 + ((i * 17) % 32); return y > 80 - Math.abs(x - 60) * 0.1 ? '' : `<ellipse cx="${x}" cy="${y}" rx="${2.6 + (i % 3)}" ry="${1.8 + (i % 2)}" fill="${i % 2 ? c2 : c3}"/>`; }).join('')}`);
const crushed = pebbles('#9ea3a8', '#b9bec3', '#7f858b');
const gravel = pebbles('#b9a68b', '#d1c0a5', '#9b8a70');

// Asfalt (rulon/qatlam)
const asphalt = svg(`${shadow(60, 84, 48)}
  <path d="M14 72 l70 -12 l24 10 l-70 12 z" fill="#3b4148"/><path d="M38 82 l70 -12 v5 l-70 12 z" fill="#2a2f35"/>
  <path d="M30 70 l50 -8 M46 74 l50 -8" stroke="#ffd34d" stroke-width="2" stroke-dasharray="6 5"/>
  <path d="M60 30 l18 -6 l8 14 l-18 6 z" fill="#ff7a1a"/><path d="M66 44 v18" stroke="#8d99a5" stroke-width="3"/>`);

// Boshqa (asboblar)
const other = svg(`${shadow(60, 84, 40)}
  <rect x="20" y="40" width="80" height="38" rx="6" fill="#2f86db"/><rect x="20" y="50" width="80" height="4" fill="#1f6fbf"/>
  <path d="M46 40 v-8 a4 4 0 0 1 4 -4 h20 a4 4 0 0 1 4 4 v8" stroke="#1f6fbf" stroke-width="4" fill="none"/>
  <rect x="54" y="46" width="12" height="10" rx="2" fill="#ffc61a"/>`);

export const MAT_ART = {
  cement, sand, brick: brickFired, 'brick-raw': brickRaw, 'wood-boards': woodBoards, 'wood-beam': woodBeam, plywood,
  melkusok, penoblok, shlakoblok, 'crushed-stone': crushed, gravel, asphalt, 'materials-other': other,
};
