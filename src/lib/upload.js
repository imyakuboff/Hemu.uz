const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const config = require('../config');
const { ApiError } = require('./http');
const images = require('./images');

const IMAGE = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const DOCS = { ...IMAGE, 'application/pdf': '.pdf' };

// Fayl boshidagi "sehrli baytlar" — Content-Type soxtalashtirilmaganini tekshirish
const MAGIC = {
  '.jpg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  '.png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  '.webp': (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP',
  '.pdf': (b) => b.subarray(0, 5).toString() === '%PDF-',
};

function make(subdir, types) {
  const dir = path.join(config.uploadDir, subdir);
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, crypto.randomBytes(12).toString('hex') + types[file.mimetype]),
  });
  return multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024, files: 15 },
    fileFilter: (_req, file, cb) => (types[file.mimetype] ? cb(null, true) : cb(new ApiError(422, 'err.file_type'))),
  });
}

// Saqlangan fayllarni tekshirish; mos kelmaganini o'chirish
function verifyFiles(files) {
  const ok = [];
  for (const f of files || []) {
    const ext = path.extname(f.filename);
    const fd = fs.openSync(f.path, 'r');
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    if (MAGIC[ext] && MAGIC[ext](buf)) ok.push(f);
    else fs.rmSync(f.path, { force: true });
  }
  if (ok.length !== (files || []).length) {
    for (const f of ok) fs.rmSync(f.path, { force: true });
    throw new ApiError(422, 'err.file_type');
  }
  return ok;
}

function removeUpload(relPath) {
  if (!relPath || /^https?:/.test(relPath) || relPath.startsWith('/')) return;
  const full = path.join(config.uploadDir, relPath);
  if (!full.startsWith(config.uploadDir)) return;
  fs.rmSync(full, { force: true });
  // Siqilgan rasmning kichik nusxasi ham o'chiriladi
  const thumb = images.thumbOf(relPath);
  if (thumb) fs.rmSync(path.join(config.uploadDir, thumb), { force: true });
}

module.exports = {
  photos: make('listings', IMAGE),
  docs: make('docs', DOCS),
  avatars: make('avatars', IMAGE),
  banners: make('banners', IMAGE),
  verifyFiles,
  removeUpload,
  // Tekshirilgan rasmlarni WebP ga siqish (preset: listings | avatars | banners)
  optimize: images.optimize,
};
