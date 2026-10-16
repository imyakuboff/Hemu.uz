// Demo ma'lumotlar: `npm run seed` (bazani noldan yaratadi)
const fs = require('node:fs');
const config = require('./src/config');
const db = require('./src/db');
const cats = require('./src/lib/categories');
const money = require('./src/lib/money');
const L = require('./src/lib/listings');
const { refreshRating } = require('./src/routes/orders');

function reset(file) {
  for (const f of [file, `${file}-wal`, `${file}-shm`]) fs.rmSync(f, { force: true });
}

function seed(file = config.dbFile) {
  if (file !== ':memory:') reset(file);
  db.open(file);
  cats.syncCatalog();
  money.loadRates();

  const user = (phone, name, country, lang, extra = {}) => db.insert('users', { phone, name, country, lang, currency: require('./src/geo').COUNTRY[country].currency, ...extra });
  const company = (owner, data) => db.insert('companies', { owner_id: owner, verification: 'verified', verified_at: '2025-03-01 10:00:00', created_at: '2021-04-12 09:00:00', ...data });

  const admin = user('+998900000001', 'Admin', 'UZ', 'uz', { role: 'admin' });
  const petrov = user('+998901234567', 'Александр Петров', 'UZ', 'ru', { email: 'sales@texnopark.uz', position: 'Менеджер по продажам', city: 'Чирчик' });
  const almaty = user('+77011234567', 'Ерлан Сейткали', 'KZ', 'kk');
  const bishkek = user('+996555123456', 'Нурлан Абдыкадыров', 'KG', 'ky');
  const dushanbe = user('+992901234567', 'Фаридун Раҳимов', 'TJ', 'tg');
  const ashgabat = user('+99365123456', 'Merdan Orazow', 'TM', 'tk');
  const baku = user('+994501234567', 'Rəşad Məmmədov', 'AZ', 'az');
  const moscow = user('+79161234567', 'Игорь Смирнов', 'RU', 'ru');
  const kabul = user('+93701234567', 'احمد کریمی', 'AF', 'prs');
  const buyer = user('+998907654321', 'Дмитрий', 'UZ', 'ru');
  const buyer2 = user('+77071112233', 'Мария', 'KZ', 'ru');

  const cTexno = company(petrov, { name: 'ООО «ТехноПарк»', tin: '305123456', activity: 'Спецтехника и запчасти', about: 'Техника и оригинальные запчасти JCB, Hyundai, CAT. Работаем с 2015 года.', website: 'texnopark.uz', reg_number: '1215000096482', country: 'UZ', region: 'tashkent', city: 'Чирчик', address: 'Ташкентское шоссе, 18', phone: '+998901234567', email: 'sales@texnopark.uz', work_hours: 'Пн–Пт, 09:00–18:00' });
  const cAlmaty = company(almaty, { name: 'ТОО «АлматыСтройТех»', tin: '180240012345', activity: 'Спецтехника, аренда, материалы', country: 'KZ', region: 'almaty-city', city: 'Алматы', address: 'ул. Бекмаханова, 93', phone: '+77011234567', work_hours: 'Пн–Сб, 09:00–19:00' });
  const cBishkek = company(bishkek, { name: 'ОсОО «БишкекАгроМаш»', tin: '01234201910123', activity: 'Сельхозтехника', country: 'KG', region: 'chuy', city: 'Бишкек', phone: '+996555123456', work_hours: 'Пн–Пт, 09:00–18:00' });
  const cAshgabat = company(ashgabat, { name: 'Aşgabat Tehnika HJ', activity: 'Ýük awtoulaglary', country: 'TM', region: 'ashgabat', city: 'Aşgabat', phone: '+99365123456' });
  const cBaku = company(baku, { name: 'Bakı Texnika Servis MMC', tin: '1402345671', activity: 'Tikinti texnikası', country: 'AZ', region: 'baku', city: 'Bakı', phone: '+994501234567', work_hours: 'B.e.–Cümə, 09:00–18:00' });
  const cMoscow = company(moscow, { name: 'ООО «СтройРент»', tin: '7701234567', activity: 'Аренда спецтехники', country: 'RU', region: 'moscow-obl', city: 'Химки', address: 'Вашутинское шоссе, 18', phone: '+79161234567', work_hours: 'Пн–Пт, 09:00–18:00' });
  // Tasdiqlanmagan kompaniya (moderatsiya oqimini ko'rsatish uchun)
  const cKabul = company(kabul, { name: 'Kabul Machinery', country: 'AF', region: 'kabul', city: 'کابل', verification: 'pending', verified_at: null });

  // Rekvizitlar va davlat ro'yxatidan o'tganlik guvohnomalari (har bir mamlakat o'z shakli bilan)
  const REQ = [
    [cTexno, { legal_form: 'mchj', reg_date: '2015-03-12', activity_code: '46690', director: 'Петров Александр Николаевич', legal_address: 'Ташкентская обл., г. Чирчик, Ташкентское шоссе, 18', bank_name: 'АКБ «Капиталбанк»', bank_code: '01018', bank_account: '20208000900123456001', vat: '326010012345' }],
    [cAlmaty, { legal_form: 'too', reg_date: '2018-02-24', activity_code: '46630', director: 'Сейткали Ерлан', legal_address: 'г. Алматы, ул. Бекмаханова, 93', bank_name: 'АО «Kaspi Bank»', bank_code: 'CASPKZKA', bank_account: 'KZ12722S000012345678' }],
    [cBishkek, { legal_form: 'osoo', reg_date: '2019-10-01', director: 'Абдыкадыров Нурлан', bank_name: 'ОАО «Бакай Банк»', bank_code: '109018', bank_account: '1090000123456789' }],
    [cAshgabat, { legal_form: 'hj', tin: '101234567890', director: 'Orazow Merdan', bank_name: 'Türkmenbaşy banky', bank_code: '39010101', bank_account: '23201934150112345678' }],
    [cBaku, { legal_form: 'mmc', reg_date: '2017-05-15', director: 'Məmmədov Rəşad', bank_name: 'Kapital Bank', bank_code: '200004', bank_account: 'AZ21NABZ00000000137010001944' }],
    [cMoscow, { legal_form: 'ooo', reg_number: '1027700123456', kpp: '504701001', activity_code: '77.32', director: 'Смирнов Игорь Петрович', bank_name: 'ПАО Сбербанк', bank_code: '044525225', bank_account: '40702810900000012345', corr_account: '30101810400000000225' }],
    [cKabul, { legal_form: 'llc', tin: '1001234567', reg_number: 'ACBR-12345', bank_name: 'Afghanistan International Bank', bank_code: 'AFIBAFKA' }],
  ];
  const docsDir = require('node:path').join(config.uploadDir, 'docs');
  fs.mkdirSync(docsDir, { recursive: true });
  // Kichik namunaviy PDF (haqiqiy hujjat o'rnida)
  const pdf = (title) => Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj 4 0 obj<</Length ${44 + title.length}>>stream\nBT /F1 14 Tf 20 100 Td (${title}) Tj ET\nendstream endobj 5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`);
  for (const [cid, data] of REQ) {
    db.update('companies', cid, { ...data, activities: JSON.stringify(cid === cTexno ? ['equipment_sale', 'parts', 'repair'] : cid === cMoscow ? ['equipment_rent'] : ['equipment_sale']) });
    const name = `demo-cert-${cid}.pdf`;
    fs.writeFileSync(require('node:path').join(docsDir, name), pdf(`Registration certificate #${cid}`));
    db.insert('company_documents', { company_id: cid, doc_type: 'reg_cert', path: `docs/${name}`, original_name: 'guvohnoma.pdf', size: 400 });
  }

  // Shaharlar koordinatalari (xaritada ko'rsatish va "yaqin atrofda" qidiruv uchun)
  const GEO = { 'Чирчик': [41.469, 69.582], 'Ташкент': [41.311, 69.279], 'Алматы': [43.238, 76.945], 'Конаев': [43.867, 77.064], 'Бишкек': [42.874, 74.570], 'Душанбе': [38.559, 68.787], 'Ашхабад': [37.960, 58.326], 'Баку': [40.409, 49.867], 'Москва': [55.756, 37.617], 'Химки': [55.889, 37.430], 'Кабул': [34.555, 69.207] };
  const listings = [];
  const add = (owner, companyId, catSlug, subSlug, data, hoursAgo, views, photos = []) => {
    const g = GEO[data.city];
    if (g && data.lat === undefined) { data.lat = g[0] + ((listings.length * 37) % 10 - 5) / 400; data.lng = g[1] + ((listings.length * 53) % 10 - 5) / 400; }
    const cat = cats.bySlug(catSlug);
    const sub = cats.bySlug(subSlug);
    const id = db.insert('listings', {
      user_id: owner,
      company_id: companyId,
      category_id: cat.id,
      subcategory_id: sub.id,
      kind: cat.kind,
      status: 'active',
      views,
      contact_phone: db.get('SELECT phone FROM users WHERE id = ?', owner).phone,
      contact_name: db.get('SELECT name FROM users WHERE id = ?', owner).name,
      ...data,
      price_usd: data.price === undefined ? null : money.toUsd(data.price, data.currency),
    });
    db.run(
      `UPDATE listings SET published_at = datetime('now', ?), bumped_at = datetime('now', ?), expires_at = datetime('now', '+25 days'),
         created_at = datetime('now', ?), updated_at = datetime('now', ?) WHERE id = ?`,
      `-${hoursAgo} hours`, `-${hoursAgo} hours`, `-${hoursAgo + 1} hours`, `-${hoursAgo} hours`, id,
    );
    db.run('UPDATE listings SET search_text = ? WHERE id = ?', L.buildSearchText(db.get('SELECT * FROM listings WHERE id = ?', id)), id);
    photos.forEach((p, i) => db.insert('listing_photos', { listing_id: id, path: p, sort: i }));
    if (data.price !== undefined) db.run("INSERT INTO price_history (listing_id, price, currency, changed_at) VALUES (?, ?, ?, datetime('now', ?))", id, data.price, data.currency, `-${hoursAgo + 1} hours`);
    listings.push(id);
    return id;
  };

  // Dizayndagi e'lonlar (HEMU.UZ), Markaziy Osiyo bo'ylab taqsimlangan
  const P = (...names) => names.map((n) => `/img/demo/${n}.jpg`);

  // --- O'zbekiston: TexnoPark ---
  const jcb = add(petrov, cTexno, 'special', 'backhoe-loaders', {
    deal_type: 'sale', title: 'Экскаватор-погрузчик JCB 3CX', brand: 'JCB', model: '3CX', year: 2021, hours: 3240, power_hp: 92, weight_kg: 8070,
    condition: 'used', drive: 'Полный, 4×4', docs: 'ПСМ, в наличии', price: 1050000000, currency: 'UZS', vat_rate: 12, leasing: 1,
    description: 'JCB 3CX в отличном рабочем состоянии. Один собственник, обслуживание по регламенту у официального дилера. Все узлы проверены, техника готова к работе.\n\nТелескопическая рукоять, кондиционер, быстросъёмный ковш. Без люфтов и течей. Последнее ТО — на 3 200 м/ч, заменены масла и фильтры.\n\nОсмотр и тест-драйв на нашей площадке. Поможем с лизингом и доставкой. Цена включает НДС 12%.',
    country: 'UZ', region: 'tashkent', city: 'Чирчик', address: 'Ташкентское шоссе, 18', location_note: '30 км от центра Ташкента · осмотр по предварительной записи',
    attrs: [{ label: 'Глубина копания', value: '5,97 м' }, { label: 'Объём ковша', value: '1,0 м³' }],
  }, 2, 1284, P('jcb', 'jcb_thumb1', 'jcb_cab', 'cl3', 'cl1', 'cl2'));
  const filter = add(petrov, cTexno, 'parts', 'filters', {
    deal_type: 'sale', title: 'Фильтр гидравлики JCB 32/925346', brand: 'JCB', part_number: '32/925346', manufacturer: 'JCB, Великобритания', condition: 'new',
    stock_qty: 12, warranty_months: 12, analogs: 'Donaldson P551756', compatibility: ['JCB 3CX', 'JCB 4CX', 'JCB 5CX'],
    compatibility_note: 'Перед заказом сверим деталь по серийному номеру машины. Напишите продавцу или отправьте фото шильдика.', price: 620000, currency: 'UZS', vat_rate: 12,
    description: 'Оригинальный фильтр для планового обслуживания гидравлической системы. Заводская упаковка, сертификат соответствия. Отгрузка в день оплаты до 15:00.',
    delivery: { pickup: 'Чирчик, Ташкентское шоссе, 18', local: 'От 50 000 сум · 1–2 дня', national: 'BTS / Fargo · 2–5 дней', payment: 'По счёту с НДС или картой' },
    country: 'UZ', region: 'tashkent', city: 'Чирчик',
  }, 1, 246, P('filter', 'filter2'));
  add(petrov, cTexno, 'parts', 'filters', {
    deal_type: 'sale', title: 'Комплект фильтров JCB 3CX', brand: 'JCB', condition: 'new', stock_qty: 8, compatibility: ['JCB 3CX'], price: 1550000, currency: 'UZS', vat_rate: 12,
    description: 'Масляный, топливный, воздушный и гидравлический фильтры — полный комплект на одно ТО.', country: 'UZ', region: 'tashkent', city: 'Чирчик',
    delivery: { pickup: 'Чирчик, Ташкентское шоссе, 18', local: 'От 50 000 сум · 1–2 дня' },
  }, 1, 98, P('filter_kit'));
  add(petrov, cTexno, 'parts', 'filters', {
    deal_type: 'sale', title: 'Фильтр масляный JCB 02/801211', brand: 'JCB', part_number: '02/801211', condition: 'new', stock_qty: 24, price: 280000, currency: 'UZS',
    description: 'Оригинальный масляный фильтр для двигателей JCB. В наличии 24 шт.', country: 'UZ', region: 'tashkent', city: 'Чирчик',
  }, 1, 64, P('oil_filter'));
  add(petrov, cTexno, 'special', 'backhoe-loaders', {
    deal_type: 'sale', title: 'JCB 3CX, 2019', brand: 'JCB', model: '3CX', year: 2019, hours: 4800, power_hp: 92, condition: 'used', drive: 'Полный, 4×4', price: 900000000, currency: 'UZS', vat_rate: 12,
    description: 'JCB 3CX 2019 года, 4 800 м/ч. Сервисная история, ПСМ в наличии.', country: 'UZ', region: 'tashkent', city: 'Чирчик', docs: 'ПСМ',
  }, 22, 412, P('jcb2019'));

  // --- Qozog'iston ---
  add(almaty, cAlmaty, 'special', 'excavators', {
    deal_type: 'sale', title: 'Гусеничный экскаватор Hyundai R220', brand: 'Hyundai', model: 'R220', year: 2020, hours: 5100, weight_kg: 22000, condition: 'used', price: 38000000, currency: 'KZT', vat_rate: 12, docs: 'Техпаспорт',
    description: 'Hyundai R220, 2020 г., 5 100 м/ч. Ковш 1,05 м³, гусеницы 70%. Возможна доставка по Казахстану.', country: 'KZ', region: 'almaty-city', city: 'Алматы',
  }, 3, 980, P('hyundai'));
  add(almaty, cAlmaty, 'special', 'truck-cranes', {
    deal_type: 'rent', title: 'Аренда автокрана 25 тонн', brand: 'XCMG', capacity_t: 25, price: 18000, currency: 'KZT', price_unit: 'hour', price_from: 1, with_operator: 1, min_order: 'от 4 часов',
    description: 'Автокран 25 т с опытным машинистом. Стрела 33 м. Работаем по Алматы и области.', country: 'KZ', region: 'almaty-city', city: 'Алматы',
  }, 6, 702, P('crane'));
  add(almaty, cAlmaty, 'materials', 'crushed-stone', {
    deal_type: 'sale', title: 'Щебень гранитный, фракция 5–20', price: 3500, currency: 'KZT', price_unit: 'ton', min_order: 'От 10 тонн · доставка',
    description: 'Гранитный щебень 5–20, ГОСТ. Доставка самосвалами от 10 тонн по Алматинской области.', country: 'KZ', region: 'almaty', city: 'Конаев',
    delivery: { local: 'Самосвалами от 10 т' },
  }, 8, 188, P('stone'));

  // --- Qirg'iziston ---
  add(bishkek, cBishkek, 'special', 'special-tractors', {
    deal_type: 'sale', title: 'Трактор МТЗ Беларус 82.1', brand: 'МТЗ', model: '82.1', year: 2022, hours: 840, power_hp: 81, condition: 'used', drive: 'Полный, 4×4', price: 2300000, currency: 'KGS', leasing: 1,
    description: 'МТЗ 82.1 в отличном состоянии, 840 м/ч. Передний мост, кабина с кондиционером.', country: 'KG', region: 'chuy', city: 'Бишкек',
  }, 26, 455, P('mtz'));

  // --- Tojikiston (shaxsiy sotuvchi) ---
  add(dushanbe, null, 'trucks', 'dump-trucks', {
    deal_type: 'sale', title: 'Самосвал КАМАЗ 6520', brand: 'КАМАЗ', model: '6520', year: 2019, mileage_km: 86000, capacity_t: 20, condition: 'used', price: 620000, currency: 'TJS', docs: 'ПТС',
    description: 'КАМАЗ 6520, 2019 г., 86 000 км. Хорошее состояние, документы готовы.', country: 'TJ', region: 'dushanbe', city: 'Душанбе',
  }, 30, 512, P('kamaz'));

  // --- Turkmaniston ---
  add(ashgabat, cAshgabat, 'trucks', 'dump-trucks', {
    deal_type: 'sale', title: 'Самосвал КАМАЗ 6520, 2018', brand: 'КАМАЗ', model: '6520', year: 2018, mileage_km: 124000, capacity_t: 20, condition: 'used', price: 245000, currency: 'TMT',
    description: 'KAMAZ 6520, 2018 ýyl. Ýagdaýy gowy, resminamalary taýýar.', country: 'TM', region: 'ashgabat', city: 'Ашхабад',
  }, 40, 133, P('kamaz'));

  // --- Ozarbayjon ---
  add(baku, cBaku, 'special', 'excavators', {
    deal_type: 'sale', title: 'Гусеничный экскаватор Hyundai R220, 2019', brand: 'Hyundai', model: 'R220', year: 2019, hours: 6900, weight_kg: 22000, condition: 'used', price: 168000, currency: 'AZN', vat_rate: 18,
    description: 'Hyundai R220, 2019-cu il, 6 900 m/s. Texniki baxışdan keçib, sənədləri qaydasındadır.', country: 'AZ', region: 'baku', city: 'Баку',
  }, 12, 207, P('hyundai'));

  // --- Rossiya: СтройРент ---
  add(moscow, cMoscow, 'special', 'truck-cranes', {
    deal_type: 'rent', title: 'Аренда автокрана 25 тонн', capacity_t: 25, price: 2800, currency: 'RUB', price_unit: 'hour', price_from: 1, with_operator: 1, min_order: 'от 4 часов',
    description: 'Автокран 25 т с оператором. Москва и область, подача в день заказа.', country: 'RU', region: 'moscow', city: 'Москва',
  }, 5, 690, P('crane2'));
  add(moscow, cMoscow, 'special', 'backhoe-loaders', {
    deal_type: 'rent', title: 'Аренда JCB 3CX с оператором', brand: 'JCB', model: '3CX', price: 2500, currency: 'RUB', price_unit: 'hour', price_from: 1, with_operator: 1, min_order: 'от 4 часов',
    description: 'Экскаватор-погрузчик JCB 3CX с опытным оператором. Москва и область, подача в день заказа.', country: 'RU', region: 'moscow-obl', city: 'Химки',
  }, 4, 340, P('jcb_thumb1'));

  // --- Afg'oniston (tasdiqlanmagan kompaniya — shaxsiy sifatida) ---
  add(kabul, null, 'special', 'special-tractors', {
    deal_type: 'sale', title: 'Трактор МТЗ Беларус 82.1, 2020', brand: 'МТЗ', model: '82.1', year: 2020, hours: 2100, power_hp: 81, condition: 'used', price: 1150000, currency: 'AFN',
    description: 'تراکتور MTZ 82.1، سال ۲۰۲۰، حالت خوب. Kabul, delivery possible.', country: 'AF', region: 'kabul', city: 'Кабул',
  }, 60, 75, P('mtz'));

  // Kunlik statistika (sotuvchi kabineti grafigi uchun)
  const petrovListings = db.all('SELECT id FROM listings WHERE user_id = ?', petrov);
  for (let d = 13; d >= 0; d -= 1) {
    const day = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
    for (const { id } of petrovListings) {
      const base = id === jcb ? 70 : 12;
      const views = Math.round(base * (0.6 + ((d * 7 + id * 13) % 10) / 10) * (d < 7 ? 1.18 : 1));
      db.run('INSERT INTO listing_stats (listing_id, day, views, phone_reveals, favorites) VALUES (?, ?, ?, ?, ?)', id, day, views, Math.round(views / 25), Math.round(views / 60));
    }
  }

  // Chat: xaridor -> sotuvchi
  const conv = db.insert('conversations', { listing_id: jcb, buyer_id: buyer, seller_id: petrov });
  db.run(`INSERT INTO messages (conversation_id, sender_id, body, created_at, read_at) VALUES (?, ?, ?, datetime('now', '-3 hours'), datetime('now', '-3 hours'))`, conv, buyer, 'Здравствуйте! JCB ещё в продаже? Можно посмотреть технику завтра?');
  db.run(`INSERT INTO messages (conversation_id, sender_id, body, created_at, read_at) VALUES (?, ?, ?, datetime('now', '-170 minutes'), datetime('now', '-160 minutes'))`, conv, petrov, 'Добрый день, Дмитрий! Да, в наличии. Площадка в Чирчике, Ташкентское шоссе, 18. Во сколько вам удобно?');
  db.run(`INSERT INTO messages (conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, datetime('now', '-2 hours'))`, conv, buyer, 'Отлично, приеду завтра к 11:00. Спасибо!');
  db.run(`UPDATE conversations SET last_message_at = datetime('now', '-2 hours') WHERE id = ?`, conv);

  db.insert('leads', { listing_id: jcb, seller_id: petrov, buyer_id: buyer, kind: 'inspection', message: 'Осмотр JCB 3CX', preferred_at: 'завтра, 11:00', amount: 1050000000, currency: 'UZS' });

  // Buyurtmalar
  const o1 = db.insert('orders', { number: 'MG-261042', listing_id: filter, buyer_id: buyer, seller_id: petrov, title: 'Фильтр гидравлики JCB 32/925346', qty: 2, unit_price: 620000, currency: 'UZS', delivery_method: 'carrier', delivery_address: 'Ташкент, Юнусабад 4', total: 1240000, carrier: 'BTS', tracking: 'BTS-88412', eta: '13 октября', status: 'shipped' });
  for (const s of ['new', 'confirmed', 'shipped']) db.insert('order_events', { order_id: o1, status: s, actor_id: s === 'new' ? buyer : petrov });
  const o2 = db.insert('orders', { number: 'MG-260981', listing_id: filter, buyer_id: buyer2, seller_id: petrov, title: 'Фильтр гидравлики JCB 32/925346', qty: 1, unit_price: 620000, currency: 'UZS', delivery_method: 'pickup', total: 620000, status: 'completed' });
  db.insert('reviews', { seller_id: petrov, company_id: cTexno, author_id: buyer2, order_id: o2, rating: 5, text: 'Оригинальный фильтр, отправили быстро. Спасибо!' });
  refreshRating(petrov);
  // Demo uchun ko'rsatkich: dizayndagi kabi ★ 4,9 · 42 sharh
  db.run('UPDATE companies SET rating_avg = 4.9, rating_count = 42 WHERE id = ?', cTexno);
  db.run('UPDATE companies SET rating_avg = 4.8, rating_count = 31 WHERE id = ?', cAlmaty);
  db.run('UPDATE companies SET rating_avg = 4.8, rating_count = 24 WHERE id = ?', cBishkek);
  db.run('UPDATE companies SET rating_avg = 4.9, rating_count = 68 WHERE id = ?', cMoscow);

  // Xaridor so'rovi
  db.insert('requests', {
    user_id: buyer, want: 'equipment', deal_type: 'sale', category_id: cats.bySlug('special').id, subcategory_id: cats.bySlug('backhoe-loaders').id,
    title: 'Куплю JCB 3CX от 2019 года для строительной компании', description: 'Нужен экскаватор-погрузчик JCB 3CX для работы на объектах в Ташкентской области. Год от 2019, наработка до 5 000 м/ч, полный привод, телескопическая рукоять. Готовы рассмотреть аналоги и лизинг.', needed_by: 'До 25 октября 2026', expires_at: '2026-11-25 00:00:00',
    condition: 'used', quantity: '1 единица', budget_max: 1100000000, currency: 'UZS', country: 'UZ', region: 'tashkent', contact_name: 'Дмитрий', contact_phone: '+998907654321',
  });

  db.run('INSERT INTO favorites (user_id, listing_id, price_at_save) VALUES (?, ?, ?)', buyer, jcb, 1050000000);
  db.run('INSERT INTO favorites (user_id, listing_id, price_at_save) VALUES (?, ?, ?)', buyer, filter, 620000);
  db.insert('saved_searches', { user_id: buyer, title: 'JCB 3CX · Узбекистан', query: { q: 'JCB 3CX', country: 'UZ', currency: 'UZS' }, new_count: 2 });
  db.insert('saved_searches', { user_id: buyer, title: 'Фильтры JCB · в наличии', query: { q: 'фильтр JCB', in_stock: '1', currency: 'UZS' }, new_count: 0 });

  db.insert('notifications', { user_id: petrov, type: 'message', params: { name: 'Дмитрий', title: 'Экскаватор-погрузчик JCB 3CX', conversation_id: conv }, link: `/messages/${conv}` });
  db.insert('notifications', { user_id: petrov, type: 'listing_approved', params: { title: 'Фильтр гидравлики JCB 32/925346' } });
  db.insert('notifications', { user_id: petrov, type: 'review', params: { rating: 5, name: 'Мария' } });

  // ---------- Yangi funksiyalar uchun demo ----------
  // JCB narx tarixi: 7 000 000 000 → 1 050 000 000 (dizayndagi "Цена снизилась")
  db.run(`DELETE FROM price_history WHERE listing_id = ?`, jcb);
  db.run(`INSERT INTO price_history (listing_id, price, currency, changed_at) VALUES (?, 1120000000, 'UZS', datetime('now', '-20 days')), (?, 1069000000, 'UZS', datetime('now', '-9 days')), (?, 1050000000, 'UZS', datetime('now', '-1 days'))`, jcb, jcb, jcb);
  db.run(`UPDATE favorites SET price_at_save = 1069000000 WHERE listing_id = ? AND user_id = ?`, jcb, buyer);
  // TexnoPark — "Biznes" tarifi, birinchi e'lon TOP
  db.run(`INSERT INTO user_plans (user_id, plan, until, top_credits) VALUES (?, 'business', datetime('now', '+25 days'), 2)`, petrov);
  db.run(`UPDATE listings SET promoted_until = datetime('now', '+5 days'), highlighted_until = datetime('now', '+5 days') WHERE id = ?`, jcb);
  db.insert('promotions', { listing_id: jcb, package: 'combo', ends_at: db.get(`SELECT datetime('now', '+5 days') AS d`).d });
  // Seriya raqamlari va qidiruvdagi texnika ro'yxati
  db.run(`UPDATE listings SET serial_number = 'JCB3CX21S2961045' WHERE id = ?`, jcb);
  db.insert('serial_blacklist', { serial: 'CAT320D0WANTED1', note: 'Демо: в розыске (угон, Шымкент, 2025)' });
  // Avtojavob va shablonlar
  db.run(`UPDATE users SET auto_reply = ?, auto_reply_on = 1 WHERE id = ?`, 'Здравствуйте! Спасибо за обращение в ТехноПарк. Ответим в течение 15 минут в рабочее время (Пн–Пт, 09:00–18:00).', petrov);
  for (const text of ['Да, техника в наличии. Когда вам удобно приехать на осмотр?', 'Отправим счёт с НДС в течение часа. Укажите реквизиты компании.', 'Доставка по Ташкенту 1–2 дня, по Узбекистану — 2–5 дней.']) db.insert('message_templates', { user_id: petrov, text });
  // Ijara: Almatydagi avtokran uchun bron va band kunlar
  const crane = db.get(`SELECT id, user_id FROM listings WHERE title = 'Аренда автокрана 25 тонн' AND currency = 'KZT'`);
  const d = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  db.insert('bookings', { listing_id: crane.id, renter_id: buyer2, seller_id: crane.user_id, start_date: d(3), end_date: d(5), hours_per_day: 8, total: 18000 * 3 * 8, currency: 'KZT', status: 'confirmed' });
  db.insert('bookings', { listing_id: crane.id, renter_id: buyer, seller_id: crane.user_id, start_date: d(9), end_date: d(10), hours_per_day: 6, total: 18000 * 2 * 6, currency: 'KZT', note: 'Монтаж металлоконструкций', status: 'pending' });
  for (const n of [14, 15]) db.run('INSERT INTO listing_blocked_dates (listing_id, day) VALUES (?, ?)', crane.id, d(n));
  // ---------- Ro'yxatdan o'tish, bo'limlar, biznes kabinet ----------
  const { hashPassword } = require('./src/routes/auth');
  const { upsertSpecialist } = require('./src/lib/people');
  const demoPass = hashPassword('Hemu2026');
  db.run(`UPDATE users SET password_hash = ?, password_set_at = datetime('now')`, demoPass);
  db.run(`UPDATE users SET account_type = 'company' WHERE id IN (SELECT owner_id FROM companies)`);
  const act = { [cTexno]: ['equipment_sale', 'parts', 'repair'], [cAlmaty]: ['equipment_sale', 'equipment_rent', 'materials'], [cBishkek]: ['equipment_sale'], [cAshgabat]: ['equipment_sale', 'logistics'], [cBaku]: ['equipment_sale'], [cMoscow]: ['equipment_rent', 'logistics'] };
  for (const [id, a] of Object.entries(act)) db.run('UPDATE companies SET activities = ? WHERE id = ?', JSON.stringify(a), Number(id));

  // Mexaniklar va haydovchilar
  const person = (phone, name, country, kind, spec) => {
    const id = user(phone, name, country, 'ru', { account_type: kind, password_hash: demoPass });
    upsertSpecialist(db.get('SELECT * FROM users WHERE id = ?', id), kind, spec);
    return id;
  };
  person('+998935551122', 'Бахтиёр Юсупов', 'UZ', 'mechanic', { headline: 'Механик по гидравлике JCB, CAT, Hyundai', about: 'Ремонт гидроцилиндров, насосов и распределителей. Выезд на объект по Ташкенту и области. Свой инструмент и диагностическое оборудование.', experience_years: 12, skills: ['hydraulics', 'diagnostics', 'engine'], brands: ['JCB', 'CAT', 'Hyundai'], region: 'tashkent-city', city: 'Ташкент', rate: 150000, currency: 'UZS', rate_unit: 'hour', mobile: true });
  person('+77055553344', 'Сергей Ким', 'KZ', 'mechanic', { headline: 'Автоэлектрик и диагност спецтехники', about: 'Компьютерная диагностика, ремонт электрики и кондиционеров. Komatsu, Hitachi, Shantui.', experience_years: 8, skills: ['electrics', 'diagnostics', 'ac'], brands: ['Komatsu', 'Hitachi', 'Shantui'], region: 'almaty-city', city: 'Алматы', rate: 12000, currency: 'KZT', rate_unit: 'hour', mobile: true });
  person('+998977778899', 'Жасур Рахимов', 'UZ', 'driver', { headline: 'Машинист экскаватора-погрузчика, стаж 9 лет', about: 'Работаю на JCB 3CX и CAT 428. Земляные работы, траншеи, погрузка. Готов к вахте.', experience_years: 9, skills: ['backhoe', 'excavator', 'loader'], license: ['B', 'C', 'tractor'], region: 'tashkent', city: 'Чирчик', rate: 450000, currency: 'UZS', rate_unit: 'shift' });
  person('+996700112233', 'Азамат Токтогулов', 'KG', 'driver', { headline: 'Водитель самосвала и тягача, категория CE', about: 'Опыт на КАМАЗ, Shacman, Howo. Междугородние рейсы по Кыргызстану и Казахстану.', experience_years: 14, skills: ['dump_truck', 'tractor_unit'], license: ['B', 'C', 'CE'], region: 'bishkek', city: 'Бишкек', rate: 60000, currency: 'KGS', rate_unit: 'month' });
  person('+992933334455', 'Далер Назаров', 'TJ', 'driver', { headline: 'Крановщик автокрана 25–50 т', about: 'Удостоверение машиниста крана, опыт на стройках Душанбе.', experience_years: 6, skills: ['crane'], license: ['C', 'special'], region: 'dushanbe', city: 'Душанбе', rate: 700, currency: 'TJS', rate_unit: 'shift' });

  // Vakansiyalar
  const job = (uid, comp, data) => db.insert('jobs', { user_id: uid, company_id: comp, ...data, search_text: require('./src/i18n').normalizeSearch(`${data.title} ${data.description} ${data.city}`), expires_at: db.get(`SELECT datetime('now', '+30 days') AS d`).d });
  job(moscow, cMoscow, { kind: 'driver', title: 'Ищем машиниста автокрана 25 т', description: 'Работа в Москве и области, вахта 15/15, проживание за счёт компании. Опыт от 3 лет.', requirements: ['crane'], salary_min: 150000, salary_max: 200000, currency: 'RUB', salary_unit: 'month', schedule: 'Вахта 15/15', country: 'RU', region: 'moscow-obl', city: 'Химки' });
  job(petrov, cTexno, { kind: 'mechanic', title: 'Механик в сервис JCB', description: 'Обслуживание и ремонт экскаваторов-погрузчиков JCB в сервисном центре в Чирчике. Официальное оформление.', requirements: ['hydraulics', 'engine'], salary_min: 9000000, salary_max: 14000000, currency: 'UZS', salary_unit: 'month', schedule: '5/2', country: 'UZ', region: 'tashkent', city: 'Чирчик' });
  job(almaty, cAlmaty, { kind: 'driver', title: 'Водитель самосвала (Howo, Shacman)', description: 'Перевозка щебня по Алматинской области. Категория C, опыт от 2 лет.', requirements: ['dump_truck'], salary_min: 400000, salary_max: 550000, currency: 'KZT', salary_unit: 'month', schedule: '6/1', country: 'KZ', region: 'almaty', city: 'Конаев' });

  // Logistika
  const logi = (uid, comp, data) => db.insert('logistics', { user_id: uid, company_id: comp, ...data, search_text: require('./src/i18n').normalizeSearch(`${data.title} ${data.from_city} ${data.to_city || ''} ${data.cargo_type || ''} ${data.vehicle_type || ''}`), expires_at: db.get(`SELECT datetime('now', '+30 days') AS d`).d });
  logi(buyer, null, { kind: 'cargo', title: 'Перевезти экскаватор-погрузчик JCB 3CX', description: 'Нужен трал. Погрузка своим ходом.', from_country: 'UZ', from_city: 'Чирчик', to_country: 'UZ', to_city: 'Самарканд', cargo_type: 'Спецтехника', weight_t: 8.1, ready_date: '15 октября', price: 6000000, currency: 'UZS', price_unit: 'total' });
  logi(buyer2, null, { kind: 'cargo', title: 'Щебень 20 т, Конаев — Алматы', from_country: 'KZ', from_city: 'Конаев', to_country: 'KZ', to_city: 'Алматы', cargo_type: 'Стройматериалы', weight_t: 20, ready_date: 'Ежедневно', price: 45000, currency: 'KZT', price_unit: 'total' });
  logi(moscow, cMoscow, { kind: 'transport', title: 'Трал до 40 т — перевозка спецтехники', description: 'Низкорамный трал, сопровождение, все разрешения. Россия, Казахстан, Узбекистан.', from_country: 'RU', from_city: 'Москва', to_country: 'UZ', to_city: 'Ташкент', vehicle_type: 'Трал', weight_t: 40, price: 180, currency: 'RUB', price_unit: 'km' });
  logi(ashgabat, cAshgabat, { kind: 'transport', title: 'Фура 20 т, Ашхабад — Ташкент — Алматы', description: 'Тент 82 м³, регулярные рейсы раз в неделю.', from_country: 'TM', from_city: 'Ашхабад', to_country: 'KZ', to_city: 'Алматы', vehicle_type: 'Фура (тент)', weight_t: 20, volume_m3: 82, price: 2.2, currency: 'USD', price_unit: 'km' });

  // Biznes kabinet: filiallar, xodim, obuna, qiziqishlar
  db.insert('company_branches', { company_id: cTexno, name: 'Головной офис и площадка', country: 'UZ', region: 'tashkent', city: 'Чирчик', address: 'Ташкентское шоссе, 18', phone: '+998901234567', work_hours: 'Пн–Пт, 09:00–18:00', lat: 41.469, lng: 69.582 });
  db.insert('company_branches', { company_id: cTexno, name: 'Склад запчастей', country: 'UZ', region: 'tashkent-city', city: 'Ташкент', address: 'ул. Фаробий, 12', phone: '+998901234500', work_hours: 'Пн–Сб, 09:00–19:00', lat: 41.33, lng: 69.24 });
  db.insert('company_branches', { company_id: cTexno, name: 'Филиал Самарканд', country: 'UZ', region: 'samarkand', city: 'Самарканд', address: 'ул. Дагбитская, 44', phone: '+998901234511', work_hours: 'Пн–Пт, 09:00–18:00', lat: 39.65, lng: 66.96 });
  db.insert('company_members', { company_id: cTexno, phone: '+998901112233', name: 'Нигора Алиева', role: 'sales' });
  db.run('INSERT INTO company_follows (user_id, company_id) VALUES (?, ?), (?, ?)', buyer, cTexno, buyer2, cTexno);
  for (const slug of ['backhoe-loaders', 'filters', 'truck-cranes']) db.run('INSERT INTO user_interests (user_id, category_id) VALUES (?, ?)', buyer, cats.bySlug(slug).id);
  for (const [q, n, r] of [['JCB 3CX', 42, 4], ['экскаватор', 31, 3], ['КАМАЗ', 18, 2], ['фильтр JCB', 12, 3], ['аренда крана', 9, 2], ['МТЗ 82', 7, 2], ['Hyundai R220', 5, 2]]) {
    db.run('INSERT INTO search_log (q, display, n, results) VALUES (?, ?, ?, ?)', require('./src/i18n').normalizeSearch(q), q, n, r);
  }
  // Hamyonlar: sotuvchiga bonus, xaridorga to'ldirish
  const wtx = (uid, usd, kind, note, extra = {}) => {
    const after = Math.round(((db.get('SELECT balance_usd FROM users WHERE id = ?', uid).balance_usd || 0) + usd) * 10000) / 10000;
    db.run('UPDATE users SET balance_usd = ? WHERE id = ?', after, uid);
    db.insert('wallet_tx', { user_id: uid, amount_usd: usd, balance_after: after, kind, note, ...extra });
  };
  wtx(petrov, 50, 'bonus', 'Стартовый бонус для компаний', { admin_id: admin, amount: 50, currency: 'USD' });
  wtx(buyer, Math.round((200000 / money.getRates().UZS) * 10000) / 10000, 'admin_credit', 'Пополнение наличными в офисе', { admin_id: admin, amount: 200000, currency: 'UZS' });
  db.insert('broadcasts', { admin_id: admin, title: 'Добро пожаловать в HEMU.UZ', body: 'Разместите первое объявление бесплатно.', link: '/create', audience: {}, channels: { inapp: true, push: true }, recipients: 14 });
  db.insert('admin_log', { admin_id: admin, action: 'company.verify', target_type: 'company', target_id: cTexno });
  return { admin, petrov, buyer, listings: listings.length };
}

// Fura logistika uchun demo yuklar va bo'sh furalar (jadval bo'sh bo'lsa). Serverda alohida ham ishlatiladi:
//   node -e "require('./seed').seedFreightDemo()"
function seedFreightDemo(file = config.dbFile) {
  if (!db.db) db.open(file);
  if (db.get('SELECT COUNT(*) AS n FROM freight').n) return 0;
  const uid = (phone) => db.get('SELECT id FROM users WHERE phone = ?', phone)?.id;
  const cid = (u) => db.get('SELECT id FROM companies WHERE owner_id = ?', u)?.id || null;
  const seller = uid('+998901234567');
  const driver = uid('+998977778899');
  const buyer = uid('+998907654321');
  const kz = uid('+77011234567') || seller;
  if (!seller || !driver) return 0;
  const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const L = [
    [seller, 'load', 'UZ', 'Toshkent', 'RU', 'Moskva', 1, 3, 'Paxta tolasi (presslangan)', ['tent', 'van'], ['back', 'side'], 20, 86, null, 3200, 'USD', 'total', 'bank', { cmr: 1 }],
    [seller, 'load', 'UZ', 'Andijon', 'KZ', 'Almaty', 2, 4, 'Meva-sabzavot (olma)', ['ref'], ['back'], 18, 70, null, 1400, 'USD', 'total', 'cash', {}],
    [buyer, 'load', 'UZ', 'Navoiy', 'CN', 'Urumchi', 3, 6, 'Mis katodlar', ['tent', 'flatbed'], ['side', 'top'], 22, null, null, 2600, 'USD', 'total', 'vat', { tir: 1 }],
    [kz, 'load', 'KZ', 'Almaty', 'UZ', 'Toshkent', 1, 2, 'Qurilish materiallari', ['tent'], ['back'], 15, 60, null, 9500000, 'UZS', 'total', 'bank', {}],
    [seller, 'load', 'UZ', 'Toshkent', 'UZ', 'Samarqand', 0, 1, 'Ekskavator JCB 3CX (tral kerak)', ['lowbed'], ['top'], 9, null, null, 4500000, 'UZS', 'total', 'cash', {}],
    [buyer, 'load', 'TR', 'Istanbul', 'UZ', 'Toshkent', 5, 8, 'Mebel va maishiy texnika', ['tent', 'van'], ['back'], 12, 90, null, 4100, 'USD', 'total', 'bank', { cmr: 1 }],
    [driver, 'truck', 'UZ', 'Toshkent', 'RU', null, 0, 3, null, ['tent'], ['back', 'side', 'top'], 22, 92, 13.6, 1.1, 'USD', 'km', null, { tir: 1, cmr: 1 }],
    [driver, 'truck', 'UZ', 'Samarqand', null, null, 1, 2, null, ['ref'], ['back'], 20, 82, 13.6, null, null, null, null, {}],
    [kz, 'truck', 'KZ', 'Shymkent', 'UZ', 'Toshkent', 0, 1, null, ['tent', 'board'], ['back', 'side'], 20, 86, 13.6, 650, 'USD', 'total', null, {}],
    [driver, 'truck', 'UZ', 'Toshkent', 'UZ', null, 0, 1, null, ['lowbed'], ['top'], 40, null, 15, 12000, 'UZS', 'km', 'cash', {}],
  ];
  for (const [u, kind, fc, fcity, tc, tcity, d1, d2, cargo, bodies, loading, w, vol, len, price, cur, pu, pay, ex] of L) {
    db.insert('freight', {
      user_id: u, company_id: cid(u), kind, from_country: fc, from_city: fcity, to_country: tc, to_city: tcity,
      date_from: day(d1), date_to: day(d2), cargo, body_types: bodies, loading, weight_t: w, volume_m3: vol, length_m: len,
      price, currency: cur, price_unit: pu, payment: pay, adr: 0, tir: ex.tir || 0, cmr: ex.cmr || 0,
      search_text: require('./src/i18n').normalizeSearch([fcity, tcity, cargo, ...bodies].filter(Boolean).join(' ')),
      expires_at: db.get(`SELECT datetime('now', '+15 days') AS d`).d,
    });
  }
  return L.length;
}

if (require.main === module) {
  const r = seed();
  seedFreightDemo();
  db.close();
  console.log(`Seed tayyor: ${r.listings} ta e'lon. Demo kirish (dev rejimida SMS kodi javobda qaytadi):`);
  console.log('  admin    +998900000001');
  console.log('  sotuvchi +998901234567 (TexnoPark, Toshkent)');
  console.log('  xaridor  +998907654321');
  console.log('  mexanik +998935551122, haydovchi +998977778899');
  console.log("  Hammasining paroli: Hemu2026");
}

module.exports = { seed, seedFreightDemo };
