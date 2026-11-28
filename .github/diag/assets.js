// Bosma reklama uchun: saytdagi e'lonlarning asl rasmlari va QR kodlar
const fs = require('fs');
const QR = require('qrcode');
const note = (s) => console.log(`::notice::${s}`);
(async () => {
  fs.mkdirSync('out', { recursive: true });
  for (const [name, url] of [['qr-hemu', 'https://hemu.uz/?utm_source=offline'], ['qr-business', 'https://hemu.uz/business?utm_source=offline'], ['qr-app', 'https://hemu.uz/app?utm_source=offline'], ['qr-mechanic', 'https://hemu.uz/mechanic?utm_source=poster'], ['qr-sparepart', 'https://hemu.uz/sparepart?utm_source=poster'], ['qr-create', 'https://hemu.uz/create?utm_source=poster'], ['qr-driver', 'https://hemu.uz/resume?kind=driver&utm_source=poster']]) {
    fs.writeFileSync(`out/${name}.svg`, await QR.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 0, color: { dark: '#111827', light: '#0000' } }));
  }
  return;
  const res = await (await fetch('https://hemu.uz/api/v1/listings?limit=60&sort=new', { headers: { 'X-Lang': 'uz' } })).json();
  const items = res.items || res.listings || res.data || [];
  note(`e'lonlar: ${items.length}`);
  const meta = [];
  for (const l of items) {
    const d = await (await fetch(`https://hemu.uz/api/v1/listings/${l.id}`)).json();
    const ph = (d.photos || []).slice(0, 2);
    for (const [i, p] of ph.entries()) {
      const u = new URL(p.url, 'https://hemu.uz').href;
      const b = Buffer.from(await (await fetch(u)).arrayBuffer());
      if (b.length < 60000) continue;
      const f = `l${l.id}-${i}.${u.split('.').pop().split('?')[0]}`;
      fs.writeFileSync(`out/${f}`, b);
      meta.push({ f, id: l.id, title: d.title, cat: d.category?.slug || d.category_slug, sub: d.subcategory?.slug || d.subcategory_slug, kb: Math.round(b.length / 1024) });
    }
  }
  fs.writeFileSync('out/meta.json', JSON.stringify(meta, null, 1));
  note(`rasmlar: ${meta.length}`);
})().catch((e) => { console.log(`::error::${e.stack}`); process.exit(1); });
