// Unsplash'dan bepul (Unsplash License, premium emas) maxsus texnika rasmlari — nomzodlar
const fs = require('fs');
const note = (s) => console.log(`::notice::${s}`);
(async () => {
  fs.mkdirSync('out', { recursive: true });
  const meta = [];
  for (const q of ['excavator', 'crawler crane', 'wheel loader', 'bulldozer', 'dump truck construction', 'mobile crane', 'heavy machinery', 'construction machinery sunset']) {
    const r = await fetch(`https://unsplash.com/napi/search/photos?query=${encodeURIComponent(q)}&per_page=14`, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
    if (!r.ok) { note(`${q}: ${r.status}`); continue; }
    const j = await r.json();
    let n = 0;
    for (const p of j.results || []) {
      if (p.premium || p.plus || p.sponsorship || meta.some((m) => m.id === p.id)) continue;
      if (p.width < 3000) continue;
      const u = `${p.urls.raw}&w=3600&q=85&fm=jpg`;
      const b = Buffer.from(await (await fetch(u)).arrayBuffer());
      fs.writeFileSync(`out/u-${p.id}.jpg`, b);
      meta.push({ id: p.id, q, w: p.width, h: p.height, alt: p.alt_description, user: p.user?.name, link: p.links?.html, kb: Math.round(b.length / 1024) });
      if (++n >= 6) break;
    }
    note(`${q}: ${n}`);
  }
  fs.writeFileSync('out/photos.json', JSON.stringify(meta, null, 1));
})().catch((e) => { console.log(`::error::${e.stack}`); process.exit(1); });
