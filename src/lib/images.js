const fs = require('node:fs');
const path = require('node:path');

// Yuklangan rasmlarni siqish: EXIF bo'yicha burish, o'lchamni kamaytirish, WebP ga o'girish
// va kichik nusxa (thumbnail) yaratish. EXIF (jumladan GPS) olib tashlanadi.
//
// Nomlash: asl rasm  abc123-o.webp   kichik nusxa  abc123-o.t.webp
// "-o" belgisi — fayl optimallashtirilganini bildiradi; eski (siqilmagan) fayllar o'zgarishsiz ishlaydi.
//
// `sharp` ixtiyoriy kutubxona: o'rnatilmagan bo'lsa rasmlar asl holida saqlanadi.

const PRESETS = {
  listings: { max: 1600, thumb: 480, quality: 80 }, // e'lon va ko'rik fotolari
  avatars: { max: 512, thumb: 0, quality: 82 }, // avatar va kompaniya logotipi
  banners: { max: 1920, thumb: 0, quality: 82 }, // bosh sahifa bannerlari
};

const OPT = /-o\.webp$/;
let sharp;

function lib() {
  if (sharp === undefined) {
    try {
      sharp = require('sharp');
      sharp.cache(false); // xotira tejash: bitta serverda ko'p rasm
      sharp.concurrency(1);
    } catch {
      sharp = null;
      if (process.env.NODE_ENV !== 'test') console.warn("[images] 'sharp' o'rnatilmagan — rasmlar siqilmaydi. O'rnatish: npm install sharp");
    }
  }
  return sharp;
}

const available = () => Boolean(lib());
const thumbOf = (rel) => (rel && OPT.test(rel) ? rel.replace(OPT, '-o.t.webp') : null);

async function convert(src, dest, { max, quality }) {
  const s = lib();
  // limitInputPixels — "dekompressiya bombasi"dan himoya (≈ 8000 x 6000)
  const info = await s(src, { failOn: 'error', limitInputPixels: 50e6 })
    .rotate()
    .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
    .webp({ quality, effort: 4 })
    .toFile(dest);
  return info;
}

// Bitta faylni siqish. Natija: { filename, path, size, thumb } yoki null (sharp yo'q)
async function optimizeFile(fullPath, presetName) {
  const preset = PRESETS[presetName];
  if (!preset || !lib()) return null;
  const dir = path.dirname(fullPath);
  const base = path.basename(fullPath).replace(/(-o)?(\.t)?\.[a-z0-9]+$/i, '');
  const out = path.join(dir, `${base}-o.webp`);
  const tmp = `${out}.tmp`;
  try {
    const info = await convert(fullPath, tmp, preset);
    fs.renameSync(tmp, out);
    let thumb = null;
    if (preset.thumb) {
      const tp = path.join(dir, `${base}-o.t.webp`);
      await convert(out, tp, { max: preset.thumb, quality: preset.quality - 5 });
      thumb = path.basename(tp);
    }
    if (out !== fullPath) fs.rmSync(fullPath, { force: true });
    return { filename: path.basename(out), path: out, size: info.size, thumb };
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
}

// Multer fayllari (verifyFiles'dan keyin). Fayl obyektlarining filename/path/size maydonlari yangilanadi.
// O'girib bo'lmagan rasm (masalan, chala yuklangan) asl holida qoladi — yuklash to'xtamaydi.
async function optimize(files, presetName) {
  const list = (files || []).filter((f) => /\.(jpe?g|png|webp)$/i.test(f.filename));
  if (!list.length || !lib()) return files;
  for (const f of list) {
    try {
      const r = await optimizeFile(f.path, presetName);
      if (r) Object.assign(f, { filename: r.filename, path: r.path, size: r.size, mimetype: 'image/webp', thumb: r.thumb });
    } catch (e) {
      if (process.env.NODE_ENV !== 'test') console.warn(`[images] ${f.filename}: ${e.message}`);
    }
  }
  return files;
}

module.exports = { PRESETS, available, optimize, optimizeFile, thumbOf };
