const config = require('./config');
const db = require('./db');
const cats = require('./lib/categories');
const money = require('./lib/money');
const { createApp } = require('./app');

function boot(dbFile) {
  db.open(dbFile);
  cats.syncCatalog();
  money.loadRates();
  require('./lib/settings').load();
  require('./lib/metrics').start();
  return createApp();
}

// Fon vazifalari: muddati o'tgan e'lonlarni arxivlash, kurslarni yangilash
function startJobs() {
  const expire = () => {
    const n = db.run(`UPDATE listings SET status = 'archived' WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < datetime('now')`).changes;
    if (n) console.log(`[jobs] ${n} ta e'lon muddati tugab arxivlandi`);
    db.run(`UPDATE requests SET status = 'closed' WHERE status = 'open' AND expires_at IS NOT NULL AND expires_at < datetime('now')`);
    require('./routes/urgent').expireJob();
    db.run(`DELETE FROM listing_view_log WHERE day < date('now', '-2 days')`);
    db.run(`DELETE FROM sessions WHERE expires_at < ?`, new Date().toISOString());
  };
  expire();
  const timers = [setInterval(expire, 3600000)];
  // Muddati tugagan reklama va to'lanmagan to'lovlar
  const cleanup = () => {
    db.run(`UPDATE listings SET promoted_until = NULL WHERE promoted_until < datetime('now')`);
    db.run(`UPDATE listings SET highlighted_until = NULL WHERE highlighted_until < datetime('now')`);
    db.run(`UPDATE payments SET status = 'cancelled' WHERE status = 'pending' AND created_at < datetime('now', '-2 days')`);
    // 30 kundan oshgan o'chirilgan e'lonlar butunlay o'chiriladi
    for (const l of db.all(`SELECT id FROM listings WHERE status = 'deleted' AND deleted_at < datetime('now', '-30 days')`)) {
      for (const p of db.all('SELECT path FROM listing_photos WHERE listing_id = ?', l.id)) require('./lib/upload').removeUpload(p.path);
      db.run('DELETE FROM listings WHERE id = ?', l.id);
    }
    db.run(`UPDATE jobs SET status = 'closed' WHERE status = 'open' AND expires_at < datetime('now')`);
    db.run(`UPDATE logistics SET status = 'closed' WHERE status = 'open' AND expires_at < datetime('now')`);
  };
  cleanup();
  timers.push(setInterval(cleanup, 3600000));
  require('./lib/telegram').start();
  // Diler fidlari: soatda bir tekshiriladi, har biri kuniga bir marta sinxronlanadi
  const feeds = () => require('./lib/feeds').runDue().catch((e) => console.warn('[feeds]', e.message));
  timers.push(setTimeout(feeds, 5 * 60000), setInterval(feeds, 3600000));
  // Kuniga bir marta: barcha sahifalar ro'yxatini Yandex va Bing'ga yuborish (IndexNow)
  const indexnow = require('./lib/indexnow');
  if (indexnow.enabled()) {
    const seo = require('./lib/seo');
    const daily = () => {
      const urls = seo.sitemapUrls().flatMap(([u]) => [u, seo.withLang(u, 'uz'), seo.withLang(u, 'ru')]).map((u) => `${config.siteUrl}${u}`);
      indexnow.send(urls).catch(() => {});
    };
    timers.push(setTimeout(daily, 2 * 60000), setInterval(daily, 24 * 3600000));
  }
  if (process.env.RATES_AUTO_SYNC === '1') {
    const sync = () => money.syncFromCbu().then(() => console.log('[jobs] valyuta kurslari yangilandi')).catch((e) => console.warn('[jobs] kurs xatosi:', e.message));
    sync();
    timers.push(setInterval(sync, 6 * 3600000));
  }
  timers.forEach((t) => t.unref());
}

if (require.main === module) {
  const app = boot();
  startJobs();
  const server = app.listen(config.port, config.host, () => {
    console.log(`HEMU.UZ API ishlayapti: http://localhost:${config.port}/  (DB: ${config.dbFile})`);
    console.log("To'xtatish: Ctrl+C");
  });
  const stop = () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

module.exports = { boot };
