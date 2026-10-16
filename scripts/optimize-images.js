// Mavjud (avval yuklangan) rasmlarni WebP ga siqish: `npm run images:optimize`
// E'lon fotolari (+ kichik nusxa), avatarlar va kompaniya logotiplari.
// Xavfsiz: har bir fayl alohida o'giriladi, bazadagi yo'l faqat muvaffaqiyatdan keyin yangilanadi.
// Serverni to'xtatmasdan ishlatish mumkin. Qayta ishga tushirilsa, o'girilganlar o'tkazib yuboriladi.
const fs = require('node:fs');
const path = require('node:path');
const config = require('../src/config');
const db = require('../src/db');
const images = require('../src/lib/images');

const SKIP = (p) => !p || /^https?:/.test(p) || p.startsWith('/') || /-o\.webp$/.test(p);

async function run() {
  if (!images.available()) {
    console.error("[xato] 'sharp' o'rnatilmagan. Avval: npm install sharp");
    process.exit(1);
  }
  db.open(config.dbFile);
  const stats = { ok: 0, skip: 0, fail: 0, before: 0, after: 0 };

  async function one(rel, preset, save) {
    if (SKIP(rel)) { stats.skip++; return; }
    const full = path.join(config.uploadDir, rel);
    if (!full.startsWith(config.uploadDir) || !fs.existsSync(full)) { stats.skip++; return; }
    const before = fs.statSync(full).size;
    try {
      const r = await images.optimizeFile(full, preset);
      save(`${path.dirname(rel).replace(/\\/g, '/')}/${r.filename}`);
      stats.ok++; stats.before += before; stats.after += r.size;
    } catch (e) {
      stats.fail++;
      console.warn(`  ! ${rel}: ${e.message}`);
    }
  }

  const photos = db.all('SELECT id, path FROM listing_photos');
  console.log(`E'lon fotolari: ${photos.length}`);
  for (const p of photos) await one(p.path, 'listings', (np) => db.run('UPDATE listing_photos SET path = ? WHERE id = ?', np, p.id));

  for (const u of db.all('SELECT id, avatar FROM users WHERE avatar IS NOT NULL')) {
    await one(u.avatar, 'avatars', (np) => db.run('UPDATE users SET avatar = ? WHERE id = ?', np, u.id));
  }
  for (const c of db.all('SELECT id, logo FROM companies WHERE logo IS NOT NULL')) {
    await one(c.logo, 'avatars', (np) => db.run('UPDATE companies SET logo = ? WHERE id = ?', np, c.id));
  }

  const mb = (n) => (n / 1048576).toFixed(1);
  console.log(`Tayyor: ${stats.ok} ta o'girildi, ${stats.skip} ta o'tkazildi, ${stats.fail} ta xato.`);
  if (stats.ok) console.log(`Hajm: ${mb(stats.before)} MB → ${mb(stats.after)} MB (${Math.round((1 - stats.after / stats.before) * 100)}% tejaldi)`);
  db.close();
}

run().catch((e) => { console.error(e); process.exit(1); });
