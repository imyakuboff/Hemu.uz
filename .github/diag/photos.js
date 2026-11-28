// Wikimedia Commons: faqat CC0 / Public domain, katta o'lchamli maxsus texnika rasmlari
const fs = require('fs');
const note = (s) => console.log(`::notice::${s}`);
const UA = { 'User-Agent': 'HemuPosterBot/1.0 (https://hemu.uz)' };
(async () => {
  fs.mkdirSync('out', { recursive: true });
  const meta = [];
  for (const q of ['excavator construction site', 'crawler excavator', 'wheel loader', 'mobile crane', 'bulldozer', 'dump truck', 'backhoe loader', 'heavy equipment']) {
    const api = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=50&gsrsearch=${encodeURIComponent(q + ' filetype:bitmap')}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=3600`;
    const j = await (await fetch(api, { headers: UA })).json();
    let n = 0;
    for (const p of Object.values(j.query?.pages || {})) {
      const ii = p.imageinfo?.[0];
      if (!ii || ii.width < 2800 || ii.width < ii.height) continue;
      const lic = (ii.extmetadata?.LicenseShortName?.value || '').replace(/<[^>]+>/g, '');
      if (!/^(CC0|Public domain)/i.test(lic)) continue;
      if (meta.some((m) => m.url === ii.descriptionurl)) continue;
      const b = Buffer.from(await (await fetch(ii.thumburl || ii.url, { headers: UA })).arrayBuffer());
      const f = `w-${String(meta.length).padStart(2, '0')}.jpg`;
      fs.writeFileSync(`out/${f}`, b);
      meta.push({ f, q, title: p.title, w: ii.width, h: ii.height, lic, url: ii.descriptionurl, kb: Math.round(b.length / 1024) });
      if (++n >= 6) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    note(`${q}: ${n}`);
  }
  fs.writeFileSync('out/photos.json', JSON.stringify(meta, null, 1));
})().catch((e) => { console.log(`::error::${e.stack}`); process.exit(1); });
