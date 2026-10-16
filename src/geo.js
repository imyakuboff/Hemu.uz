const { pick, byCode } = require('./i18n');

// Mamlakatlar: valyuta, telefon kodi (+ milliy raqam uzunligi), asosiy til
const COUNTRIES = [
  { code: 'UZ', currency: 'UZS', dial: '998', nsn: [9], lang: 'uz', flag: '🇺🇿' },
  { code: 'KZ', currency: 'KZT', dial: '7', nsn: [10], lang: 'kk', flag: '🇰🇿', nsnPrefix: /^[67]/ },
  { code: 'KG', currency: 'KGS', dial: '996', nsn: [9], lang: 'ky', flag: '🇰🇬' },
  { code: 'TJ', currency: 'TJS', dial: '992', nsn: [9], lang: 'tg', flag: '🇹🇯' },
  { code: 'TM', currency: 'TMT', dial: '993', nsn: [8], lang: 'tk', flag: '🇹🇲' },
  { code: 'AF', currency: 'AFN', dial: '93', nsn: [9], lang: 'prs', flag: '🇦🇫' },
  { code: 'AZ', currency: 'AZN', dial: '994', nsn: [9], lang: 'az', flag: '🇦🇿' },
  { code: 'RU', currency: 'RUB', dial: '7', nsn: [10], lang: 'ru', flag: '🇷🇺', nsnPrefix: /^[3489]/ },
];
const COUNTRY = Object.fromEntries(COUNTRIES.map((c) => [c.code, c]));

// Valyutalar. Kurslar — 1 USD uchun (boshlang'ich qiymat, admin yoki CBU sinxronizatsiyasi yangilaydi)
const CURRENCIES = [
  { code: 'USD', rate: 1, decimals: 2 },
  { code: 'UZS', rate: 12650, decimals: 0 },
  { code: 'KZT', rate: 505, decimals: 0 },
  { code: 'KGS', rate: 87.4, decimals: 0 },
  { code: 'TJS', rate: 10.5, decimals: 0 },
  { code: 'TMT', rate: 3.5, decimals: 0 },
  { code: 'AFN', rate: 69, decimals: 0 },
  { code: 'AZN', rate: 1.7, decimals: 0 },
  { code: 'RUB', rate: 82, decimals: 0 },
  { code: 'EUR', rate: 0.88, decimals: 2 },
  { code: 'CNY', rate: 7.15, decimals: 0 },
];
const CURRENCY_CODES = CURRENCIES.map((c) => c.code);

// Viloyatlar: [kod, {mahalliy til, ru, en}]
const R = (code, names) => ({ code, names });
const REGIONS = {
  UZ: [
    R('tashkent-city', { uz: 'Toshkent shahri', ru: 'Ташкент', en: 'Tashkent' }),
    R('tashkent', { uz: 'Toshkent viloyati', ru: 'Ташкентская область', en: 'Tashkent Region' }),
    R('andijan', { uz: 'Andijon viloyati', ru: 'Андижанская область', en: 'Andijan Region' }),
    R('bukhara', { uz: 'Buxoro viloyati', ru: 'Бухарская область', en: 'Bukhara Region' }),
    R('fergana', { uz: "Farg'ona viloyati", ru: 'Ферганская область', en: 'Fergana Region' }),
    R('jizzakh', { uz: 'Jizzax viloyati', ru: 'Джизакская область', en: 'Jizzakh Region' }),
    R('khorezm', { uz: 'Xorazm viloyati', ru: 'Хорезмская область', en: 'Khorezm Region' }),
    R('namangan', { uz: 'Namangan viloyati', ru: 'Наманганская область', en: 'Namangan Region' }),
    R('navoi', { uz: 'Navoiy viloyati', ru: 'Навоийская область', en: 'Navoi Region' }),
    R('kashkadarya', { uz: 'Qashqadaryo viloyati', ru: 'Кашкадарьинская область', en: 'Kashkadarya Region' }),
    R('karakalpakstan', { uz: "Qoraqalpog'iston Respublikasi", ru: 'Республика Каракалпакстан', en: 'Karakalpakstan' }),
    R('samarkand', { uz: 'Samarqand viloyati', ru: 'Самаркандская область', en: 'Samarkand Region' }),
    R('syrdarya', { uz: 'Sirdaryo viloyati', ru: 'Сырдарьинская область', en: 'Syrdarya Region' }),
    R('surkhandarya', { uz: 'Surxondaryo viloyati', ru: 'Сурхандарьинская область', en: 'Surkhandarya Region' }),
  ],
  KZ: [
    R('astana', { kk: 'Астана', ru: 'Астана', en: 'Astana', uz: 'Ostona' }),
    R('almaty-city', { kk: 'Алматы', ru: 'Алматы', en: 'Almaty', uz: 'Olmaota' }),
    R('shymkent', { kk: 'Шымкент', ru: 'Шымкент', en: 'Shymkent', uz: 'Chimkent' }),
    R('akmola', { kk: 'Ақмола облысы', ru: 'Акмолинская область', en: 'Akmola Region' }),
    R('aktobe', { kk: 'Ақтөбе облысы', ru: 'Актюбинская область', en: 'Aktobe Region' }),
    R('almaty', { kk: 'Алматы облысы', ru: 'Алматинская область', en: 'Almaty Region' }),
    R('atyrau', { kk: 'Атырау облысы', ru: 'Атырауская область', en: 'Atyrau Region' }),
    R('east-kz', { kk: 'Шығыс Қазақстан облысы', ru: 'Восточно-Казахстанская область', en: 'East Kazakhstan Region' }),
    R('zhambyl', { kk: 'Жамбыл облысы', ru: 'Жамбылская область', en: 'Zhambyl Region' }),
    R('west-kz', { kk: 'Батыс Қазақстан облысы', ru: 'Западно-Казахстанская область', en: 'West Kazakhstan Region' }),
    R('karaganda', { kk: 'Қарағанды облысы', ru: 'Карагандинская область', en: 'Karaganda Region' }),
    R('kostanay', { kk: 'Қостанай облысы', ru: 'Костанайская область', en: 'Kostanay Region' }),
    R('kyzylorda', { kk: 'Қызылорда облысы', ru: 'Кызылординская область', en: 'Kyzylorda Region' }),
    R('mangystau', { kk: 'Маңғыстау облысы', ru: 'Мангистауская область', en: 'Mangystau Region' }),
    R('pavlodar', { kk: 'Павлодар облысы', ru: 'Павлодарская область', en: 'Pavlodar Region' }),
    R('north-kz', { kk: 'Солтүстік Қазақстан облысы', ru: 'Северо-Казахстанская область', en: 'North Kazakhstan Region' }),
    R('turkistan', { kk: 'Түркістан облысы', ru: 'Туркестанская область', en: 'Turkistan Region' }),
    R('abai', { kk: 'Абай облысы', ru: 'Абайская область', en: 'Abai Region' }),
    R('zhetysu', { kk: 'Жетісу облысы', ru: 'Жетысуская область', en: 'Zhetysu Region' }),
    R('ulytau', { kk: 'Ұлытау облысы', ru: 'Улытауская область', en: 'Ulytau Region' }),
  ],
  KG: [
    R('bishkek', { ky: 'Бишкек', ru: 'Бишкек', en: 'Bishkek', uz: 'Bishkek' }),
    R('osh-city', { ky: 'Ош шаары', ru: 'Ош', en: 'Osh', uz: "O'sh" }),
    R('chuy', { ky: 'Чүй облусу', ru: 'Чуйская область', en: 'Chuy Region' }),
    R('osh', { ky: 'Ош облусу', ru: 'Ошская область', en: 'Osh Region' }),
    R('jalal-abad', { ky: 'Жалал-Абад облусу', ru: 'Джалал-Абадская область', en: 'Jalal-Abad Region' }),
    R('issyk-kul', { ky: 'Ысык-Көл облусу', ru: 'Иссык-Кульская область', en: 'Issyk-Kul Region' }),
    R('naryn', { ky: 'Нарын облусу', ru: 'Нарынская область', en: 'Naryn Region' }),
    R('talas', { ky: 'Талас облусу', ru: 'Таласская область', en: 'Talas Region' }),
    R('batken', { ky: 'Баткен облусу', ru: 'Баткенская область', en: 'Batken Region' }),
  ],
  TJ: [
    R('dushanbe', { tg: 'Душанбе', ru: 'Душанбе', en: 'Dushanbe', uz: 'Dushanbe' }),
    R('sughd', { tg: 'Вилояти Суғд', ru: 'Согдийская область', en: 'Sughd Region', uz: "So'g'd viloyati" }),
    R('khatlon', { tg: 'Вилояти Хатлон', ru: 'Хатлонская область', en: 'Khatlon Region', uz: 'Xatlon viloyati' }),
    R('gbao', { tg: 'ВМКБ', ru: 'ГБАО', en: 'Gorno-Badakhshan', uz: "Tog'li Badaxshon" }),
    R('rrs', { tg: 'Ноҳияҳои тобеи ҷумҳурӣ', ru: 'Районы республиканского подчинения', en: 'Districts of Republican Subordination' }),
  ],
  TM: [
    R('ashgabat', { tk: 'Aşgabat', ru: 'Ашхабад', en: 'Ashgabat', uz: 'Ashxobod' }),
    R('arkadag', { tk: 'Arkadag', ru: 'Аркадаг', en: 'Arkadag' }),
    R('ahal', { tk: 'Ahal welaýaty', ru: 'Ахалский велаят', en: 'Ahal Region' }),
    R('balkan', { tk: 'Balkan welaýaty', ru: 'Балканский велаят', en: 'Balkan Region' }),
    R('dashoguz', { tk: 'Daşoguz welaýaty', ru: 'Дашогузский велаят', en: 'Dashoguz Region' }),
    R('lebap', { tk: 'Lebap welaýaty', ru: 'Лебапский велаят', en: 'Lebap Region' }),
    R('mary', { tk: 'Mary welaýaty', ru: 'Марыйский велаят', en: 'Mary Region' }),
  ],
  AF: [
    R('kabul', { prs: 'کابل', ps: 'کابل', ru: 'Кабул', en: 'Kabul', uz: 'Kobul' }),
    R('herat', { prs: 'هرات', ps: 'هرات', ru: 'Герат', en: 'Herat', uz: 'Hirot' }),
    R('kandahar', { prs: 'قندهار', ps: 'کندهار', ru: 'Кандагар', en: 'Kandahar' }),
    R('balkh', { prs: 'بلخ', ps: 'بلخ', ru: 'Балх (Мазари-Шариф)', en: 'Balkh (Mazar-i-Sharif)', uz: 'Balx (Mozori Sharif)' }),
    R('nangarhar', { prs: 'ننگرهار', ps: 'ننګرهار', ru: 'Нангархар', en: 'Nangarhar' }),
    R('kunduz', { prs: 'کندز', ps: 'کندز', ru: 'Кундуз', en: 'Kunduz' }),
    R('jowzjan', { prs: 'جوزجان', ps: 'جوزجان', ru: 'Джаузджан', en: 'Jowzjan' }),
    R('ghazni', { prs: 'غزنی', ps: 'غزني', ru: 'Газни', en: 'Ghazni' }),
    R('helmand', { prs: 'هلمند', ps: 'هلمند', ru: 'Гильменд', en: 'Helmand' }),
    R('badakhshan', { prs: 'بدخشان', ps: 'بدخشان', ru: 'Бадахшан', en: 'Badakhshan' }),
  ],
  AZ: [
    R('baku', { az: 'Bakı', ru: 'Баку', en: 'Baku', uz: 'Boku' }),
    R('absheron', { az: 'Abşeron-Xızı', ru: 'Апшерон-Хызы', en: 'Absheron-Khizi' }),
    R('ganja', { az: 'Gəncə-Daşkəsən', ru: 'Гянджа-Дашкесан', en: 'Ganja-Dashkasan' }),
    R('sumgait', { az: 'Sumqayıt', ru: 'Сумгаит', en: 'Sumgait' }),
    R('shirvan', { az: 'Şirvan-Salyan', ru: 'Ширван-Сальян', en: 'Shirvan-Salyan' }),
    R('lankaran', { az: 'Lənkəran-Astara', ru: 'Ленкорань-Астара', en: 'Lankaran-Astara' }),
    R('sheki', { az: 'Şəki-Zaqatala', ru: 'Шеки-Закаталы', en: 'Shaki-Zagatala' }),
    R('guba', { az: 'Quba-Xaçmaz', ru: 'Губа-Хачмаз', en: 'Guba-Khachmaz' }),
    R('mil-mugan', { az: 'Mil-Muğan', ru: 'Миль-Муган', en: 'Mil-Mughan' }),
    R('nakhchivan', { az: 'Naxçıvan', ru: 'Нахичевань', en: 'Nakhchivan' }),
  ],
  RU: [
    R('moscow', { ru: 'Москва', en: 'Moscow', uz: 'Moskva' }),
    R('moscow-obl', { ru: 'Московская область', en: 'Moscow Oblast', uz: 'Moskva viloyati' }),
    R('spb', { ru: 'Санкт-Петербург', en: 'Saint Petersburg', uz: 'Sankt-Peterburg' }),
    R('leningrad', { ru: 'Ленинградская область', en: 'Leningrad Oblast' }),
    R('tatarstan', { ru: 'Республика Татарстан', en: 'Tatarstan' }),
    R('bashkortostan', { ru: 'Республика Башкортостан', en: 'Bashkortostan' }),
    R('sverdlovsk', { ru: 'Свердловская область', en: 'Sverdlovsk Oblast' }),
    R('chelyabinsk', { ru: 'Челябинская область', en: 'Chelyabinsk Oblast' }),
    R('novosibirsk', { ru: 'Новосибирская область', en: 'Novosibirsk Oblast' }),
    R('omsk', { ru: 'Омская область', en: 'Omsk Oblast' }),
    R('tyumen', { ru: 'Тюменская область', en: 'Tyumen Oblast' }),
    R('samara', { ru: 'Самарская область', en: 'Samara Oblast' }),
    R('krasnodar', { ru: 'Краснодарский край', en: 'Krasnodar Krai' }),
    R('rostov', { ru: 'Ростовская область', en: 'Rostov Oblast' }),
    R('orenburg', { ru: 'Оренбургская область', en: 'Orenburg Oblast' }),
    R('astrakhan', { ru: 'Астраханская область', en: 'Astrakhan Oblast' }),
  ],
};

const regionIndex = {};
for (const [cc, list] of Object.entries(REGIONS)) for (const r of list) regionIndex[`${cc}:${r.code}`] = r;

const intlCache = new Map();
function intl(kind, lang) {
  const key = kind + lang;
  if (!intlCache.has(key)) {
    const locale = byCode[lang]?.locale || 'en-US';
    intlCache.set(key, new Intl.DisplayNames([locale, 'en'], { type: kind, fallback: 'code' }));
  }
  return intlCache.get(key);
}

function countryName(code, lang) {
  return code ? intl('region', lang).of(code) : null;
}
function currencyName(code, lang) {
  return intl('currency', lang).of(code);
}
function regionName(country, region, lang) {
  const r = regionIndex[`${country}:${region}`];
  return r ? pick(r.names, lang) : null;
}
function isValidRegion(country, region) {
  return Boolean(regionIndex[`${country}:${region}`]);
}

// Telefonni E.164 ko'rinishiga keltirish. Qaytaradi: { e164, country } yoki null
function normalizePhone(raw, countryHint) {
  if (!raw) return null;
  let digits = String(raw).replace(/[^\d+]/g, '');
  const hasPlus = digits.startsWith('+');
  digits = digits.replace(/\+/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  const tryMatch = (d) => {
    // Uzunroq kodlar birinchi tekshiriladi (998 > 7)
    const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
    for (const c of sorted) {
      if (!d.startsWith(c.dial)) continue;
      const nsn = d.slice(c.dial.length);
      if (!c.nsn.includes(nsn.length)) continue;
      if (c.nsnPrefix && !c.nsnPrefix.test(nsn)) continue;
      // +7: KZ (6/7) va RU (3/4/8/9) prefiks bo'yicha ajratiladi
      return { e164: `+${d}`, country: c.code };
    }
    return null;
  };
  if (hasPlus) return tryMatch(digits);
  // Mahalliy format (mamlakat kodi qo'shiladi), keyin xalqaro (+ belgisiz)
  const c = COUNTRY[countryHint];
  if (c) {
    let local = digits;
    // RU/KZ: magistral "8" (8 916 ...), boshqalarda "0" (0555 ...)
    if (c.dial === '7' && local.length === 11 && local.startsWith('8')) local = local.slice(1);
    else if (local.startsWith('0')) local = local.slice(1);
    const m = tryMatch(c.dial + local);
    if (m) return m;
  }
  return tryMatch(digits);
}

function maskPhone(e164) {
  if (!e164) return null;
  return e164.slice(0, e164.length - 7) + ' *** ** ' + e164.slice(-2);
}

module.exports = {
  COUNTRIES, COUNTRY, CURRENCIES, CURRENCY_CODES, REGIONS,
  countryName, currencyName, regionName, isValidRegion, normalizePhone, maskPhone,
};
