// Excel (.xlsx) o'qish va yozish — tashqi kutubxonasiz.
// .xlsx = ZIP arxiv ichida XML fayllar: biz faqat kerakli qismini (birinchi varaq, matn va sonlar) qo'llaymiz.
const zlib = require('zlib');

const MAX_UNZIPPED = 40 * 1024 * 1024; // "zip-bomba"dan himoya

// ---------- CRC32 (ZIP uchun) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------- ZIP o'qish ----------
// keep — qaysi fayllar kerak (boshqalari o'qilmaydi); qiymat — Buffer qaytaruvchi funksiya
function unzip(buf, keep = /^(xl\/|\[Content_Types\])/) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not_zip');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  let total = 0;
  for (let n = 0; n < count; n += 1) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad_zip');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    p += 46 + nlen + elen + clen;
    if (!keep.test(name) || name.endsWith('/')) continue;
    total += usize;
    if (total > MAX_UNZIPPED) throw new Error('too_big');
    const start = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const raw = buf.subarray(start, start + csize);
    files.set(name, () => (method === 0 ? raw : zlib.inflateRawSync(raw, { maxOutputLength: MAX_UNZIPPED })));
  }
  return files;
}

const unxml = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&amp;/g, '&');
const textOf = (xml) => [...xml.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((m) => unxml(m[1])).join('');
const colIndex = (ref) => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

// Sonni Excel'dagidek ko'rsatish: 3.5E+8 → "350000000", 0.30000000000000004 → "0.3"
function numText(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(12)));
}

// Rels fayli: Id -> to'liq yo'l (base — rels egasining papkasi, masalan "xl/drawings")
function relsMap(xmlText, base) {
  const out = new Map();
  for (const m of String(xmlText || '').matchAll(/<Relationship\b[^>]*>/g)) {
    const id = (m[0].match(/\bId="([^"]+)"/) || [])[1];
    const target = (m[0].match(/\bTarget="([^"]+)"/) || [])[1];
    if (!id || !target || /TargetMode="External"/.test(m[0])) continue;
    out.set(id, resolvePath(base, target));
  }
  return out;
}
function resolvePath(base, target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/').filter(Boolean);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop(); else if (seg !== '.' && seg) parts.push(seg);
  }
  return parts.join('/');
}
const relsPathOf = (file) => { const i = file.lastIndexOf('/'); return `${file.slice(0, i)}/_rels/${file.slice(i + 1)}.rels`; };
const dirOf = (file) => file.slice(0, file.lastIndexOf('/'));

// Rasm turini baytlardan aniqlash (faqat saytda qabul qilinadiganlari)
function imageType(b) {
  if (!b || b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b.readUInt32BE(0) === 0x89504e47) return 'image/png';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
const MAX_IMAGE = 10 * 1024 * 1024;
function pushImage(map, key, buf) {
  const type = imageType(buf);
  if (!type || buf.length > MAX_IMAGE) return;
  const list = map.get(key) || [];
  if (list.length >= 10 || list.some((x) => x.buf.equals(buf))) return;
  list.push({ buf, type, name: `photo-${list.length + 1}.${type.split('/')[1].replace('jpeg', 'jpg')}` });
  map.set(key, list);
}

// Birinchi varaq: { rows: [{ n, cells }], images: Map(qator raqami -> [{ buf, type, name }]) }
// Rasmlar — katakchaga qo'yilgan (yuqori chap burchagi qaysi qatorda bo'lsa, o'sha qatorga tegishli)
function readXlsxSheet(buf) {
  const files = unzip(buf);
  const raw = (n) => (n && files.has(n) ? files.get(n)() : null);
  const get = (n) => raw(n)?.toString('utf8') ?? null;
  // Birinchi varaq faylini workbook.xml + rels orqali topish
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wb = get('xl/workbook.xml');
  const first = wb && wb.match(/<(?:\w+:)?sheet\b[^>]*?r:id="([^"]+)"/);
  if (first) {
    const target = relsMap(get('xl/_rels/workbook.xml.rels'), 'xl').get(first[1]);
    if (target) sheetPath = target;
  }
  if (!files.has(sheetPath)) sheetPath = [...files.keys()].find((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)) || '';
  const sheet = get(sheetPath);
  if (!sheet) throw new Error('no_sheet');
  const ssXml = get('xl/sharedStrings.xml') || '';
  const shared = [...ssXml.matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((m) => textOf(m[1]));
  const rows = [];
  for (const rm of sheet.matchAll(/<(?:\w+:)?row\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
    const rowNo = Number((rm[1].match(/\br="(\d+)"/) || [])[1]) || (rows.length ? rows[rows.length - 1].n + 1 : 1);
    const row = [];
    let next = 0;
    for (const cm of rm[2].matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const attrs = cm[1];
      const body = cm[2] || '';
      const ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1];
      const idx = ref ? colIndex(ref) : next;
      next = idx + 1;
      const type = (attrs.match(/\bt="(\w+)"/) || [])[1];
      const v = (body.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/) || [])[1];
      let val = '';
      if (type === 's') val = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') val = textOf(body);
      else if (type === 'b') val = v === '1' ? 'true' : 'false';
      else if (type === 'str' || type === 'e') val = v ? unxml(v) : '';
      else if (v !== undefined) val = numText(v);
      row[idx] = val;
    }
    rows.push({ n: rowNo, cells: Array.from(row, (x) => x ?? '') });
  }
  // Varaqdagi rasmlar: sheet rels -> drawing -> (from.row, blip r:embed) -> drawing rels -> media
  const images = new Map();
  try {
    const drawings = [...relsMap(get(relsPathOf(sheetPath)), dirOf(sheetPath)).values()].filter((p) => /drawings\/drawing\d+\.xml$/.test(p));
    for (const dp of drawings) {
      const dx = get(dp);
      if (!dx) continue;
      const media = relsMap(get(relsPathOf(dp)), dirOf(dp));
      for (const a of dx.matchAll(/<(?:\w+:)?(?:twoCellAnchor|oneCellAnchor)\b[\s\S]*?<\/(?:\w+:)?(?:twoCellAnchor|oneCellAnchor)>/g)) {
        const r = (a[0].match(/<(?:\w+:)?from>[\s\S]*?<(?:\w+:)?row>(\d+)</) || [])[1];
        const emb = (a[0].match(/<(?:\w+:)?blip\b[^>]*?r:embed="([^"]+)"/) || [])[1];
        if (r === undefined || !emb) continue;
        pushImage(images, Number(r) + 1, raw(media.get(emb)));
      }
    }
  } catch { /* rasmlarni o'qib bo'lmasa — matn baribir import qilinadi */ }
  return { rows: rows.filter((r) => r.cells.some((c) => String(c).trim())), images };
}

// Birinchi varaqni satrlar massivi sifatida qaytaradi: [[A1, B1, ...], [A2, ...]]
function readXlsx(buf) {
  return readXlsxSheet(buf).rows.map((r) => r.cells);
}

// Word (.docx): hujjatdagi barcha jadvallar ketma-ket. Birinchi qator — sarlavha;
// keyingi jadvallarda xuddi shu sarlavha takrorlansa, u tashlab ketiladi.
// { rows: [{ n, cells }], images: Map(n -> rasmlar) } — n: jadval qatori tartib raqami (sarlavha = 1)
function readDocx(buf) {
  const files = unzip(buf, /^(word\/|\[Content_Types\])/);
  const raw = (n) => (n && files.has(n) ? files.get(n)() : null);
  const doc = raw('word/document.xml')?.toString('utf8');
  if (!doc) throw new Error('no_document');
  const media = relsMap(raw('word/_rels/document.xml.rels')?.toString('utf8'), 'word');
  const rows = [];
  const images = new Map();
  let head = null;
  // Ichma-ich jadvallar kam uchraydi — eng tashqi jadvallarni olish uchun oddiy chuqurlik hisobi
  const tables = [];
  const re = /<(\/?)w:tbl\b[^>]*>/g;
  let depth = 0;
  let start = -1;
  for (let m = re.exec(doc); m; m = re.exec(doc)) {
    if (!m[1]) { if (depth === 0) start = m.index; depth += 1; } else if (depth > 0) {
      depth -= 1;
      if (depth === 0) tables.push(doc.slice(start, m.index + m[0].length));
    }
  }
  const cellText = (c) => [...c.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((p) => textOf(p[0].replace(/<w:tab\/>/g, '<w:t> </w:t>').replace(/<w:br\/>/g, '<w:t>\n</w:t>')).trim()).filter(Boolean).join('\n');
  for (const tbl of tables) {
    let first = true;
    for (const tr of tbl.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)) {
      const cells = [];
      const pics = [];
      for (const tc of tr[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)) {
        const span = Number((tc[0].match(/<w:gridSpan w:val="(\d+)"/) || [])[1]) || 1;
        cells.push(cellText(tc[0]));
        for (let i = 1; i < span; i += 1) cells.push('');
        for (const b of tc[0].matchAll(/r:embed="([^"]+)"/g)) pics.push(media.get(b[1]));
      }
      if (!cells.some((c) => c.trim()) && !pics.length) continue;
      const key = cells.map((c) => c.trim().toLowerCase()).join('|');
      if (first && head !== null && key === head) { first = false; continue; }
      first = false;
      if (head === null) head = key;
      const n = rows.length + 1;
      rows.push({ n, cells });
      for (const p of pics) pushImage(images, n, raw(p));
    }
  }
  return { rows, images };
}

const isOldOffice = (buf) => buf.length > 8 && buf.readUInt32BE(0) === 0xd0cf11e0;
// ZIP ichida nima borligiga qarab: 'xlsx' | 'docx' | null
function officeKind(buf) {
  if (!isXlsx(buf)) return null;
  try {
    const names = [...unzip(buf, /^(xl|word)\/(workbook|document)\.xml$/).keys()];
    if (names.includes('xl/workbook.xml')) return 'xlsx';
    if (names.includes('word/document.xml')) return 'docx';
  } catch { /* buzilgan arxiv */ }
  return null;
}

// ---------- ZIP yozish ----------
function zip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const comp = zlib.deflateRawSync(data, { level: 9 });
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(0x00210000, 10); // 1980-01-01 00:00
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(0x00210000, 12); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, nameBuf, comp);
    central.push(ch, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cdSize = central.reduce((s, b) => s + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
}

const isXlsx = (buf) => buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50;

const xml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // XML 1.0 da ruxsat etilmagan boshqaruv belgilari
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const colName = (i) => { let s = ''; let n = i + 1; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

// sheets: [{ name, rows: [[...]], widths: [..], header: true }]
// Uslublar: 0 — oddiy, 1 — sarlavha (qalin, sariq fon), 2 — namuna qatori (kulrang kursiv)
function writeXlsx(sheets) {
  const sheetXml = (s) => {
    const cols = (s.widths || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
    const rows = s.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
      const ref = `${colName(ci)}${ri + 1}`;
      const st = s.header && ri === 0 ? 1 : (s.sampleRows || []).includes(ri) ? 2 : 0;
      if (typeof v === 'number') return `<c r="${ref}" s="${st}"><v>${v}</v></c>`;
      return `<c r="${ref}" s="${st}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
    }).join('')}</row>`).join('');
    const pane = s.header ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${rows}</sheetData></worksheet>`;
  };
  const entries = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF0E3352"/><name val="Calibri"/></font><font><i/><sz val="11"/><color rgb="FF6B7682"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFC61A"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)]),
  ];
  return zip(entries);
}


// Oddiy Word hujjati: sarlavha, izoh qatorlari va bitta jadval (albom varag'i)
// { title, notes: [..], header: [..], rows: [[..]], sampleRows: [indekslar] }
function writeDocx({ title, notes = [], header, rows, sampleRows = [] }) {
  const run = (t, { b, i, color, size } = {}) => `<w:r><w:rPr>${b ? '<w:b/>' : ''}${i ? '<w:i/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}${size ? `<w:sz w:val="${size}"/>` : ''}</w:rPr><w:t xml:space="preserve">${xml(t)}</w:t></w:r>`;
  const para = (inner, after = 120) => `<w:p><w:pPr><w:spacing w:after="${after}"/></w:pPr>${inner}</w:p>`;
  const cell = (t, o = {}) => `<w:tc><w:tcPr>${o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : ''}</w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${run(t, { ...o, size: 18 })}</w:p></w:tc>`;
  const border = (k) => `<w:${k} w:val="single" w:sz="4" w:space="0" w:color="B7C2CE"/>`;
  const tbl = `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders></w:tblPr>`
    + `<w:tr><w:trPr><w:tblHeader/></w:trPr>${header.map((h) => cell(h, { b: true, fill: 'FFC61A', color: '0E3352' })).join('')}</w:tr>`
    + rows.map((r, i) => `<w:tr>${r.map((v) => cell(String(v ?? ''), sampleRows.includes(i) ? { i: true, color: '6B7682' } : {})).join('')}</w:tr>`).join('')
    + '</w:tbl>';
  const body = para(run(title, { b: true, size: 32, color: '0E3352' }), 200) + notes.map((n) => para(run(n, { size: 20 }), 60)).join('') + para('', 120) + tbl
    + '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>';
  return zip([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}</w:body></w:document>`],
  ]);
}

module.exports = { readXlsx, readXlsxSheet, readDocx, writeXlsx, writeDocx, zip, isXlsx, isOldOffice, officeKind, imageType, crc32 };
