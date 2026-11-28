// Sifatli rasmlar: Openverse (Flickr va boshq.) + Wikimedia "Quality/Featured" — CC0 / PDM / CC BY
const fs = require('fs');
const note = (s) => console.log(`::notice::${s}`);
const UA = { 'User-Agent': 'HemuPosterBot/1.0 (https://hemu.uz)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  fs.mkdirSync('out', { recursive: true });
  const meta = [];
  const save = async (url, info) => {
    const r = await fetch(url, { headers: UA });
    if (!r.ok) return false;
    const b = Buffer.from(await r.arrayBuffer());
    if (b.length < 400000) return false;
    const f = `q-${String(meta.length).padStart(2, '0')}.jpg`;
    fs.writeFileSync(`out/${f}`, b);
    meta.push({ f, ...info, kb: Math.round(b.length / 1024) });
    return true;
  };
  // 1) Openverse
  for (const q of ['excavator', 'wheel loader', 'mobile crane', 'bulldozer', 'dump truck', 'heavy machinery construction', 'construction machinery sunset', 'mining truck']) {
    try {
      const r = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&license=cc0,pdm,by&size=large&aspect_ratio=wide&page_size=30&mature=false`, { headers: UA });
      const j = await r.json();
      let n = 0;
      for (const p of j.results || []) {
        if ((p.width || 0) < 3000) continue;
        if (meta.some((m) => m.landing === p.foreign_landing_url)) continue;
        const ok = await save(p.url, { src: p.source, q, title: (p.title || '').slice(0, 60), w: p.width, h: p.height, lic: `${p.license} ${p.license_version || ''}`.trim(), creator: p.creator, landing: p.foreign_landing_url });
        if (ok && ++n >= 7) break;
        await sleep(200);
      }
      note(`openverse ${q}: ${n} (${r.status})`);
    } catch (e) { note(`openverse ${q}: ${e.message}`); }
    await sleep(800);
  }
  // 2) Wikimedia sifatli/tanlangan rasmlar
  for (const q of ['excavator', 'wheel loader', 'crane truck', 'bulldozer', 'dump truck', 'construction machine']) {
    for (const cat of ['Quality_images', 'Featured_pictures_on_Wikimedia_Commons']) {
      const api = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=30&gsrsearch=${encodeURIComponent(`${q} incategory:${cat}`)}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=4000`;
      const j = await (await fetch(api, { headers: UA })).json();
      let n = 0;
      for (const p of Object.values(j.query?.pages || {})) {
        const ii = p.imageinfo?.[0];
        if (!ii || ii.width < 3000 || ii.width < ii.height) continue;
        const lic = (ii.extmetadata?.LicenseShortName?.value || '').replace(/<[^>]+>/g, '');
        if (!/^(CC0|Public domain|CC BY \d)/i.test(lic)) continue;
        const creator = (ii.extmetadata?.Artist?.value || '').replace(/<[^>]+>/g, '').trim().slice(0, 60);
        if (await save(ii.thumburl || ii.url, { src: 'wikimedia-' + cat.slice(0, 7), q, title: p.title.slice(5, 65), w: ii.width, h: ii.height, lic, creator, landing: ii.descriptionurl })) n++;
        if (n >= 5) break;
      }
      note(`commons ${cat} ${q}: ${n}`);
    }
  }
  fs.writeFileSync('out/photos.json', JSON.stringify(meta, null, 1));
  note(`jami: ${meta.length}`);
})().catch((e) => { console.log(`::error::${e.stack}`); process.exit(1); });
