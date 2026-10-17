const fs = require('node:fs');
const path = require('node:path');
const { execFile, execFileSync } = require('node:child_process');

// Yuklangan rasmlarni siqish: EXIF bo'yicha burish, o'lchamni kamaytirish, WebP ga o'girish
// va kichik nusxa (thumbnail) yaratish. EXIF (jumladan GPS) olib tashlanadi.
//
// Nomlash: asl rasm  abc123-o.webp   kichik nusxa  abc123-o.t.webp
// "-o" belgisi — fayl optimallashtirilganini bildiradi; eski (siqilmagan) fayllar o'zgarishsiz ishlaydi.
//
// Ikki usul (birinchi ishlaganidan foydalaniladi):
//   1) `sharp` (npm) — tez, lekin tayyor binari SSE4.2 li protsessor talab qiladi
//   2) `vipsthumbnail` (Ubuntu: apt install libvips-tools) — har qanday protsessorda ishlaydi
// Ikkalasi ham bo'lmasa rasmlar asl holida saqlanadi.

const PRESETS = {
  listings: { max: 1600, thumb: 480, quality: 80 }, // e'lon va ko'rik fotolari
  avatars: { max: 512, thumb: 0, quality: 82 }, // avatar va kompaniya logotipi
  banners: { max: 1920, thumb: 0, quality: 82 }, // bosh sahifa bannerlari
};

const OPT = /-o\.webp$/;
let sharp;

let vips; // { strip: 'keep=none' | 'strip' } yoki null

function lib() {
  if (sharp === undefined) {
    try {
      sharp = require('sharp');
      sharp.cache(false); // xotira tejash: bitta serverda ko'p rasm
      sharp.concurrency(1);
    } catch {
      sharp = null;
    }
  }
  if (sharp) return 'sharp';
  if (vips === undefined) {
    try {
      // "libvips 8.15.1" — 8.15 dan boshlab metama'lumotni olib tashlash `keep=none`, oldin `strip`
      const v = execFileSync('vipsthumbnail', ['--vips-version'], { timeout: 5000 }).toString();
      const [, maj, min] = v.match(/(\d+)\.(\d+)/) || [];
      vips = { strip: Number(maj) > 8 || (Number(maj) === 8 && Number(min) >= 15) ? 'keep=none' : 'strip' };
    } catch {
      vips = null;
      if (process.env.NODE_ENV !== 'test') console.warn("[images] 'sharp' ham, 'vipsthumbnail' ham yo'q — rasmlar siqilmaydi. O'rnatish: apt install libvips-tools");
    }
  }
  return vips ? 'vips' : null;
}

const available = () => Boolean(lib());
const engine = () => lib();
const thumbOf = (rel) => (rel && OPT.test(rel) ? rel.replace(OPT, '-o.t.webp') : null);

function vipsConvert(src, dest, { max, quality }) {
  // ">" — faqat kichraytirish; EXIF bo'yicha burish avtomatik; dest kengaytmasi .webp bo'lishi shart
  const args = [src, '--size', `${max}x${max}>`, '-o', `${dest}[Q=${quality},${vips.strip}]`];
  return new Promise((resolve, reject) => {
    execFile('vipsthumbnail', args, { timeout: 60000 }, (err, _out, stderr) => {
      if (err || !fs.existsSync(dest)) return reject(new Error(`vipsthumbnail: ${String(stderr || err?.message || '').trim().split('\n')[0]}`));
      resolve({ size: fs.statSync(dest).size });
    });
  });
}

async function convert(src, dest, opts) {
  if (lib() === 'vips') return vipsConvert(src, dest, opts);
  // limitInputPixels — "dekompressiya bombasi"dan himoya (≈ 8000 x 6000)
  const info = await sharp(src, { failOn: 'error', limitInputPixels: 50e6 })
    .rotate()
    .resize({ width: opts.max, height: opts.max, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: opts.quality, effort: 4 })
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
  const tmp = path.join(dir, `${base}-o.tmp.webp`);
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

module.exports = { PRESETS, available, engine, optimize, optimizeFile, thumbOf };
