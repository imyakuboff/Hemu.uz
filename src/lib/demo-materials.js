// Qurilish materiallari bo'limi uchun namuna (demo) do'konlar va e'lonlar.
// Hammasi listings.demo = 1 bilan belgilanadi — admin panelidan bir tugma bilan o'chiriladi.
// Telefon sifatida platformaning qo'llab-quvvatlash raqami ishlatiladi (begona odamga qo'ng'iroq tushmasin).
const db = require('../db');
const cats = require('./categories');
const money = require('./money');
const config = require('../config');

const IMG = (slug, v = 'a') => `/img/materials/${slug}-${v}.jpg`;
const NOTE = "\n\nBu namuna e'lon — HEMU.UZ qurilish materiallari bo'limini ko'rsatish uchun.";

const STORES = [
  { key: 'tqb', phone: '+998000000901', name: 'Toshkent Qurilish Bozori', city: 'Toshkent', region: 'tashkent-city', about: "Sement, qum, shag'al va graviy — ulgurji va chakana. Toshkent bo'ylab yetkazib berish.", hours: '08:00–19:00' },
  { key: 'sgz', phone: '+998000000902', name: "Samarqand G'isht Zavodi", city: 'Samarqand', region: 'samarkand', about: "Pishgan va xom g'isht ishlab chiqaruvchi. Zavod narxida, poddon bilan.", hours: '07:00–18:00' },
  { key: 'ym', phone: '+998000000903', name: "Yog'och Markazi", city: 'Chirchiq', region: 'tashkent', about: "Taxta, brus, fanera, DSP va OSB. O'lcham bo'yicha kesib beramiz.", hours: '09:00–19:00' },
  { key: 'bs', phone: '+998000000904', name: 'BlokStroy', city: "Farg'ona", region: 'fergana', about: "Penoblok, gazoblok, shlakoblok va melkusok tosh. Vodiy bo'ylab yetkazib berish.", hours: '08:00–18:00' },
];

const D = (local, pickup) => JSON.stringify({ local, pickup, payment: "Naqd, Click, Payme, o'tkazma" });
const LISTINGS = [
  // Toshkent Qurilish Bozori
  ['tqb', 'cement', { title: 'Sement M-500 (Qizilqum), 50 kg qop', price: 65000, price_unit: 'bag', brand: 'Qizilqum sement', grade: 'M-500', pack: '50 kg qop', stock_qty: 4000, min_order: '10 qop', description: "Portlandsement M-500 D0, GOST 31108. Yangi partiya, quruq omborda saqlanadi.", delivery: D("Toshkent bo'ylab — 1 kun ichida", 'Toshkent, Sergeli bozori') }, 'a', 140],
  ['tqb', 'cement', { title: 'Sement M-400, 50 kg qop', price: 58000, price_unit: 'bag', brand: 'Ohangaron sement', grade: 'M-400', pack: '50 kg qop', stock_qty: 2500, min_order: '10 qop', description: "Umumiy qurilish ishlari uchun sement M-400. Poddonda 40 qop.", delivery: D("Toshkent bo'ylab — 1 kun ichida", 'Toshkent, Sergeli bozori') }, 'b', 96],
  ['tqb', 'cement', { title: 'Sement M-500 navalom (sochma), 1 tonna', price: 1150000, price_unit: 'ton', brand: 'Qizilqum sement', grade: 'M-500', pack: 'Navalom, sementovoz', min_order: '10 t', description: "Beton zavodlari va yirik obyektlar uchun sochma sement. Sementovoz bilan yetkazamiz.", delivery: D("Toshkent va viloyat — sementovoz", 'Zavoddan') }, 'a', 58],
  ['tqb', 'sand', { title: "Yuvilgan qum, 1 m³", price: 120000, price_unit: 'm3', grade: 'Yuvilgan, mayda', min_order: '5 m³', description: "Yuvilgan daryo qumi — beton va suvoq uchun. Loy aralashmasiz.", delivery: D("Toshkent bo'ylab KAMAZ bilan", 'Karyer, Yangiyo\'l') }, 'a', 210],
  ['tqb', 'sand', { title: 'Qum, KAMAZ (10 m³) — yetkazib berish bilan', price: 950000, price_unit: 'load', grade: 'Karyer qumi', pack: 'KAMAZ, 10 m³', description: "Qurilish qumi, bir mashina (10 m³). Narxga Toshkent ichida yetkazish kiradi.", delivery: D("Narxga kiritilgan (Toshkent ichida)", 'Karyer, Yangiyo\'l') }, 'b', 175],
  ['tqb', 'crushed-stone', { title: "Shag'al (sheben) 5–20 mm, 1 m³", price: 160000, price_unit: 'm3', grade: 'Fraksiya 5–20', min_order: '5 m³', description: "Granit sheben, beton va poydevor uchun. Changsiz, yuvilgan.", delivery: D("Toshkent bo'ylab KAMAZ bilan", 'Karyer') }, 'a', 88],
  ['tqb', 'crushed-stone', { title: "Shag'al 20–40 mm, KAMAZ", price: 1550000, price_unit: 'load', grade: 'Fraksiya 20–40', pack: 'KAMAZ, 10 m³', description: "Yo'l va poydevor uchun yirik sheben.", delivery: D('Narxga kiritilgan (Toshkent ichida)', 'Karyer') }, 'b', 41],
  ['tqb', 'gravel', { title: 'Graviy (shag\'al-qum aralashmasi), 1 m³', price: 140000, price_unit: 'm3', grade: 'ShPS', min_order: '5 m³', description: "Shag'al-qum aralashmasi — zamin tekislash va poydevor osti uchun.", delivery: D("Toshkent bo'ylab", 'Karyer') }, 'a', 37],
  // Samarqand G'isht Zavodi
  ['sgz', 'brick', { title: "Pishgan g'isht, qizil, 250×120×65", price: 1300, price_unit: 'piece', brand: "Samarqand G'isht Zavodi", grade: 'M-100', size_text: '250×120×65 mm', pack: 'Poddon — 400 dona', stock_qty: 120000, min_order: '1 poddon', description: "To'liq pishgan qizil g'isht, devor va poydevor uchun. Sertifikat bor.", delivery: D("Samarqand bo'ylab — 1–2 kun", 'Zavod, Samarqand') }, 'a', 260],
  ['sgz', 'brick', { title: "Pishgan g'isht, teshikli (pustotely) M-150", price: 1450, price_unit: 'piece', brand: "Samarqand G'isht Zavodi", grade: 'M-150', size_text: '250×120×88 mm', pack: 'Poddon — 300 dona', stock_qty: 60000, min_order: '1 poddon', description: "Yengil teshikli g'isht — issiqni yaxshi saqlaydi.", delivery: D("Samarqand va Toshkentga", 'Zavod, Samarqand') }, 'b', 132],
  ['sgz', 'brick-raw', { title: "Xom g'isht (somonli), 250×120×80", price: 600, price_unit: 'piece', grade: 'Somonli loy', size_text: '250×120×80 mm', stock_qty: 80000, min_order: '1000 dona', description: "An'anaviy xom g'isht — ichki devor va hovli qurilishi uchun.", delivery: D("Samarqand viloyati bo'ylab", 'Zavod, Samarqand') }, 'a', 64],
  ['sgz', 'brick-raw', { title: "Xom g'isht, 1000 dona (traktor bilan)", price: 550000, price_unit: 'total', grade: 'Somonli loy', pack: '1000 dona', description: "1000 dona xom g'isht, traktor aravasi bilan yetkazamiz.", delivery: D("Narxga kiritilgan (30 km gacha)", 'Zavod, Samarqand') }, 'b', 29],
  // Yog'och Markazi
  ['ym', 'wood-boards', { title: "Taxta obreznoy, qarag'ay 25×150×6000", price: 3800000, price_unit: 'm3', brand: 'Rossiya', grade: '1-sort', size_text: '25×150×6000 mm', stock_qty: 40, min_order: '1 m³', description: "Quruq qarag'ay taxta, 1-sort. Pol, opalubka va tom uchun.", delivery: D("Toshkent va viloyat — 1 kun", "Chirchiq, yog'och bozori") }, 'a', 118],
  ['ym', 'wood-boards', { title: 'Taxta neobreznoy, 40 mm', price: 2600000, price_unit: 'm3', brand: 'Rossiya', grade: '2-sort', size_text: '40×(150–250)×6000 mm', stock_qty: 25, min_order: '1 m³', description: "Arzon neobreznoy taxta — opalubka va yordamchi ishlar uchun.", delivery: D("Toshkent va viloyat", "Chirchiq, yog'och bozori") }, 'b', 47],
  ['ym', 'wood-beam', { title: "Brus 100×100×6000, qarag'ay", price: 4200000, price_unit: 'm3', brand: 'Rossiya', grade: '1-sort', size_text: '100×100×6000 mm', stock_qty: 30, description: "Tom va karkas uchun brus. Kesib berish mumkin.", delivery: D("Toshkent va viloyat — 1 kun", "Chirchiq, yog'och bozori") }, 'a', 83],
  ['ym', 'wood-beam', { title: 'Brus 150×150×6000', price: 4350000, price_unit: 'm3', brand: 'Rossiya', grade: '1-sort', size_text: '150×150×6000 mm', stock_qty: 15, description: "Yirik kesimli brus — ustun va to'sinlar uchun.", delivery: D("Toshkent va viloyat", "Chirchiq, yog'och bozori") }, 'b', 22],
  ['ym', 'plywood', { title: 'Fanera 18 mm, 1525×1525', price: 285000, price_unit: 'piece', brand: 'Kronospan', grade: 'FK, 2/3', size_text: '1525×1525×18 mm', stock_qty: 600, description: "Namlikka chidamli fanera — mebel va opalubka uchun.", delivery: D("Toshkent bo'ylab", "Chirchiq, yog'och bozori") }, 'a', 71],
  ['ym', 'plywood', { title: 'OSB-3 plita 9 mm, 2500×1250', price: 145000, price_unit: 'piece', brand: 'Kronospan', grade: 'OSB-3', size_text: '2500×1250×9 mm', stock_qty: 900, description: "Pol, devor va tom osti uchun OSB-3.", delivery: D("Toshkent bo'ylab", "Chirchiq, yog'och bozori") }, 'b', 66],
  ['ym', 'plywood', { title: 'DSP laminatlangan 16 mm, oq', price: 320000, price_unit: 'piece', brand: 'Egger', grade: 'E1', size_text: '2800×2070×16 mm', stock_qty: 300, description: "Mebel uchun laminatlangan DSP, kesib berish xizmati bor.", delivery: D("Toshkent bo'ylab", "Chirchiq, yog'och bozori") }, 'a', 34],
  // BlokStroy
  ['bs', 'penoblok', { title: 'Gazoblok D500, 600×300×200', price: 14500, price_unit: 'piece', brand: 'Aerok', grade: 'D500, B2.5', size_text: '600×300×200 mm', pack: 'Poddon — 40 dona (1,44 m³)', stock_qty: 9000, min_order: '1 poddon', description: "Avtoklavli gazoblok — yengil, issiq, aniq geometriya.", delivery: D("Farg'ona vodiysi bo'ylab — 1–2 kun", "Farg'ona, sanoat zonasi") }, 'a', 154],
  ['bs', 'penoblok', { title: 'Penoblok D600, 600×300×200', price: 13000, price_unit: 'piece', grade: 'D600', size_text: '600×300×200 mm', pack: 'Poddon — 40 dona', stock_qty: 6000, min_order: '1 poddon', description: "Monolit penoblok — devor va to'siqlar uchun.", delivery: D("Farg'ona vodiysi bo'ylab", "Farg'ona, sanoat zonasi") }, 'b', 77],
  ['bs', 'shlakoblok', { title: 'Shlakoblok 390×190×188', price: 6500, price_unit: 'piece', grade: 'M-75', size_text: '390×190×188 mm', pack: 'Poddon — 72 dona', stock_qty: 15000, min_order: '1 poddon', description: "Teshikli shlakoblok — omborxona, devor va hovli uchun.", delivery: D("Farg'ona vodiysi bo'ylab", "Farg'ona, sanoat zonasi") }, 'a', 102],
  ['bs', 'shlakoblok', { title: 'Shlakoblok yarim (peregorodka) 390×90×188', price: 4200, price_unit: 'piece', grade: 'M-50', size_text: '390×90×188 mm', pack: 'Poddon — 120 dona', stock_qty: 8000, description: "Ichki to'siqlar uchun yupqa blok.", delivery: D("Farg'ona vodiysi bo'ylab", "Farg'ona, sanoat zonasi") }, 'b', 38],
  ['bs', 'melkusok', { title: 'Melkusok (but tosh), 1 m³', price: 450000, price_unit: 'm3', grade: 'Fraksiya 150–300', min_order: '5 m³', description: "Poydevor va tirgak devorlar uchun but tosh.", delivery: D("Vodiy bo'ylab KAMAZ bilan", 'Karyer, Qo\'qon yo\'li') }, 'a', 59],
  ['bs', 'melkusok', { title: 'Melkusok tosh, KAMAZ — yetkazib berish bilan', price: 1800000, price_unit: 'load', grade: 'Fraksiya 150–300', pack: 'KAMAZ, ~5 m³', description: "Bir mashina melkusok, Farg'ona shahri ichida yetkazish narxga kiradi.", delivery: D("Narxga kiritilgan (Farg'ona ichida)", 'Karyer') }, 'b', 44],
];

const COORDS = { Toshkent: [41.311, 69.279], Samarqand: [39.654, 66.975], Chirchiq: [41.469, 69.582], "Farg'ona": [40.384, 71.786] };

function seedMaterialsDemo() {
  if (db.get("SELECT COUNT(*) AS n FROM listings WHERE demo = 1 AND kind = 'material'").n) return { created: 0, skipped: true };
  const support = config.supportPhone || '+998918041224';
  let created = 0;
  db.tx(() => {
    const owners = {};
    for (const s of STORES) {
      let u = db.get('SELECT id FROM users WHERE phone = ?', s.phone);
      if (!u) u = { id: db.insert('users', { phone: s.phone, name: s.name, country: 'UZ', lang: 'uz', account_type: 'company', city: s.city }) };
      let c = db.get('SELECT id FROM companies WHERE owner_id = ?', u.id);
      if (!c) c = { id: db.insert('companies', { owner_id: u.id, name: s.name, about: `${s.about}${NOTE}`, country: 'UZ', region: s.region, city: s.city, work_hours: s.hours, activities: JSON.stringify(['materials']) }) };
      owners[s.key] = { user: u.id, company: c.id, store: s };
    }
    const root = cats.bySlug('materials');
    LISTINGS.forEach(([key, sub, data, variant, views], i) => {
      const o = owners[key];
      const g = COORDS[o.store.city];
      const id = db.insert('listings', {
        user_id: o.user, company_id: o.company, category_id: root.id, subcategory_id: cats.bySlug(sub).id, kind: 'material',
        deal_type: 'sale', status: 'active', condition: 'new', currency: 'UZS', country: 'UZ', region: o.store.region, city: o.store.city,
        lat: g ? g[0] + ((i * 37) % 10 - 5) / 400 : null, lng: g ? g[1] + ((i * 53) % 10 - 5) / 400 : null,
        contact_name: o.store.name, contact_phone: support, accept_messages: 1, demo: 1, views,
        ...data, description: `${data.description}${NOTE}`,
        price_usd: money.toUsd(data.price, 'UZS'),
      });
      const hoursAgo = 2 + i * 3;
      db.run(`UPDATE listings SET published_at = datetime('now', ?), bumped_at = datetime('now', ?), expires_at = datetime('now', '+30 days'), created_at = datetime('now', ?) WHERE id = ?`,
        `-${hoursAgo} hours`, `-${hoursAgo} hours`, `-${hoursAgo + 1} hours`, id);
      db.insert('listing_photos', { listing_id: id, path: IMG(sub, variant), sort: 0 });
      db.insert('listing_photos', { listing_id: id, path: IMG(sub, variant === 'a' ? 'b' : 'a'), sort: 1 });
      db.run('INSERT INTO price_history (listing_id, price, currency) VALUES (?, ?, ?)', id, data.price, 'UZS');
      created += 1;
    });
  });
  // Qidiruv matni (kategoriya nomlari bilan)
  const L = require('./listings');
  for (const l of db.all('SELECT * FROM listings WHERE demo = 1')) db.run('UPDATE listings SET search_text = ? WHERE id = ?', L.buildSearchText(l), l.id);
  return { created, skipped: false };
}

// Demo do'konlar va ularning e'lonlarini butunlay o'chirish
function removeMaterialsDemo() {
  const phones = STORES.map((s) => s.phone);
  const n = db.get('SELECT COUNT(*) AS n FROM listings WHERE demo = 1').n;
  db.tx(() => {
    db.run('DELETE FROM listings WHERE demo = 1');
    db.run(`DELETE FROM users WHERE phone IN (${phones.map(() => '?').join(',')})`, ...phones);
  });
  return { removed: n };
}

const demoCount = () => db.get('SELECT COUNT(*) AS n FROM listings WHERE demo = 1').n;

module.exports = { seedMaterialsDemo, removeMaterialsDemo, demoCount, STORES };
