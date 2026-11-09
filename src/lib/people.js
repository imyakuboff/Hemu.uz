// Mexanik va haydovchi profillari (rezyume)
const db = require('../db');
const money = require('./money');
const L = require('./listings');
const { validate, fail, parseJson } = require('./http');
const { COUNTRY, CURRENCY_CODES, isValidRegion, normalizePhone, countryName, regionName } = require('../geo');
const { normalizeSearch } = require('../i18n');

// Mexanik yo'nalishlari va haydovchi boshqaradigan texnika turlari
const MECHANIC_SKILLS = ['hydraulics', 'engine', 'electrics', 'transmission', 'undercarriage', 'welding', 'diagnostics', 'ac', 'tires'];
const DRIVER_SKILLS = ['excavator', 'backhoe', 'loader', 'crane', 'bulldozer', 'grader', 'dump_truck', 'tractor_unit', 'roller', 'manipulator', 'concrete_mixer'];
const LICENSES = ['B', 'C', 'CE', 'D', 'tractor', 'special'];
const RATE_UNITS = ['hour', 'day', 'shift', 'month', 'job'];

const RULES = {
  headline: { type: 'string', min: 5, max: 120, required: true },
  about: { type: 'string', max: 3000 },
  experience_years: { type: 'int', min: 0, max: 60 },
  skills: { type: 'array', max: 20, itemMax: 40 },
  license: { type: 'array', max: 10, itemMax: 20 },
  brands: { type: 'array', max: 20, itemMax: 40 },
  country: { type: 'enum', values: Object.keys(COUNTRY) },
  region: { type: 'string', max: 40 },
  city: { type: 'string', max: 80 },
  rate: { type: 'number', min: 0, max: 1e10 },
  currency: { type: 'enum', values: CURRENCY_CODES },
  rate_unit: { type: 'enum', values: RATE_UNITS },
  mobile: { type: 'bool' },
  available: { type: 'bool' },
};

function upsertSpecialist(user, kind, body) {
  const v = validate(body, RULES);
  const allowed = kind === 'mechanic' ? MECHANIC_SKILLS : DRIVER_SKILLS;
  v.skills = (v.skills || []).filter((s) => allowed.includes(s));
  v.license = kind === 'driver' ? (v.license || []).filter((s) => LICENSES.includes(s)) : [];
  v.country = v.country || user.country;
  if (v.region && !isValidRegion(v.country, v.region)) fail(422, 'err.validation', { region: 'invalid' });
  if (!v.currency) v.currency = COUNTRY[v.country].currency;
  v.search_text = normalizeSearch([v.headline, v.about, (v.brands || []).join(' '), v.city, user.name].filter(Boolean).join(' '));
  const row = { ...v, kind, skills: v.skills, license: v.license, brands: v.brands || [] };
  const ex = db.get('SELECT id FROM specialists WHERE user_id = ?', user.id);
  if (ex) {
    db.update('specialists', ex.id, { ...row, updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19) });
    return ex.id;
  }
  return db.insert('specialists', { ...row, user_id: user.id });
}

function specialistView(s, req, { full = false } = {}) {
  const u = db.get('SELECT id, name, avatar, phone, created_at, last_seen_at FROM users WHERE id = ?', s.user_id);
  const r = db.get('SELECT AVG(rating) AS a, COUNT(*) AS n FROM reviews WHERE seller_id = ?', s.user_id);
  const v = {
    id: s.id,
    kind: s.kind,
    user_id: s.user_id,
    name: u?.name,
    avatar: L.fileUrl(u?.avatar),
    headline: s.headline,
    experience_years: s.experience_years,
    skills: parseJson(s.skills, []),
    license: parseJson(s.license, []),
    brands: parseJson(s.brands, []),
    location: { country: s.country, country_name: countryName(s.country, req.lang), region: s.region, region_name: regionName(s.country, s.region, req.lang), city: s.city },
    rate: s.rate,
    currency: s.currency,
    rate_unit: s.rate_unit,
    rate_formatted: s.rate !== null && s.rate !== undefined ? money.formatAmount(s.rate, s.currency, req.lang) : null,
    mobile: Boolean(s.mobile),
    available: Boolean(s.available),
    rating: r.n ? Math.round(r.a * 10) / 10 : 0,
    reviews_count: r.n,
    since: u?.created_at?.slice(0, 4),
    updated_at: s.updated_at,
    demo: Boolean(s.demo),
  };
  if (full) {
    v.about = s.about;
    v.views = s.views;
    v.last_seen_at = u?.last_seen_at;
  }
  return v;
}

// Yangi buyurtma/ish chiqqanda xabar oladigan mutaxassislar: avval o'sha viloyat
// (va viloyati ko'rsatilmaganlar); viloyatda kam bo'lsa — butun mamlakat
function specialistsToNotify({ kind, country, region, excludeUserId, limit = 150 }) {
  const base = `SELECT user_id FROM specialists WHERE kind = ? AND status = 'active' AND available = 1 AND demo = 0 AND country = ? AND user_id != ?`;
  let rows = region
    ? db.all(`${base} AND (region = ? OR region IS NULL) ORDER BY (region = ?) DESC, mobile DESC, updated_at DESC LIMIT ?`, kind, country, excludeUserId || 0, region, region, limit)
    : [];
  if (rows.length < 5) rows = db.all(`${base} ORDER BY (region = ?) DESC, mobile DESC, updated_at DESC LIMIT ?`, kind, country, excludeUserId || 0, region || '', limit);
  return rows.map((r) => r.user_id);
}

// Namuna rezyumelar — bo'lim bo'sh ko'rinmasligi uchun. Ular "Namuna" deb belgilanadi,
// telefon va chat ochilmaydi, haqiqiy rezyumelardan keyin turadi va haqiqiylari
// DEMO_HIDE_AT taga yetganda ro'yxatdan yashiriladi. Telefon raqamlari ataylab yaroqsiz
// (+000…) — haqiqiy odam bu raqam bilan ro'yxatdan o'ta olmaydi.
const DEMO_HIDE_AT = 8;
const SEED_PHONES = ['+998935551122', '+77055553344', '+998977778899', '+996700112233', '+992933334455'];
const DEMO_PEOPLE = [
  ['driver', 'Jasur Rahimov', 'tashkent', { headline: 'Ekskavator-yuklagich haydovchisi (JCB 3CX)', skills: ['backhoe', 'excavator'], license: ['C', 'special'], experience_years: 9, rate: 9000000, rate_unit: 'month', mobile: true, about: "JCB 3CX va CAT 428 da 9 yil ishlaganman. Kotlovan, transheya, planirovka. Vaxtaga tayyorman." }],
  ['driver', 'Dilshod Karimov', 'tashkent-city', { headline: 'Avtokran haydovchisi (25 tonna)', skills: ['crane'], license: ['C', 'CE'], experience_years: 12, rate: 450000, rate_unit: 'shift', mobile: false, about: "Ivanovets va XCMG 25 t avtokranlarida ishlayman. Stropalshik guvohnomasi bor." }],
  ['driver', 'Sardor Tursunov', 'samarkand', { headline: 'Samosval va tyagach haydovchisi', skills: ['dump_truck', 'tractor_unit'], license: ['C', 'CE'], experience_years: 7, rate: 8000000, rate_unit: 'month', mobile: true, about: "Shacman, Howo, KAMAZ. Qurilish obyektlarida va uzoq reyslarda ishlaganman." }],
  ['driver', 'Bekzod Aliyev', 'fergana', { headline: 'Frontal yuklagich haydovchisi', skills: ['loader'], license: ['C', 'tractor'], experience_years: 5, rate: 350000, rate_unit: 'shift', mobile: false, about: "SDLG va XGMA frontal yuklagichlarida, karyer va betonda ishlaganman." }],
  ['driver', 'Otabek Nazarov', 'kashkadarya', { headline: 'Buldozer va greyder mashinisti', skills: ['bulldozer', 'grader'], license: ['tractor', 'special'], experience_years: 15, rate: 10000000, rate_unit: 'month', mobile: true, about: "Shantui SD16, Komatsu D65, greyder XCMG. Yo'l qurilishida 15 yil." }],
  ['driver', 'Ulug\'bek Ergashev', 'namangan', { headline: 'Mikser va beton nasos haydovchisi', skills: ['concrete_mixer'], license: ['C'], experience_years: 4, rate: 7000000, rate_unit: 'month', mobile: false, about: "Avtobetonaralashtirgichda 4 yil. Monolit obyektlarda ishlaganman." }],
  ['mechanic', 'Rustam Qodirov', 'tashkent', { headline: 'Gidravlika ustasi: JCB, CAT, Hyundai', skills: ['hydraulics', 'diagnostics'], experience_years: 11, rate: 150000, rate_unit: 'hour', mobile: true, about: "Gidrotsilindr, nasos va taqsimlagich ta'miri. Obyektga chiqaman." }],
  ['mechanic', 'Anvar Yo\'ldoshev', 'samarkand', { headline: 'Dvigatel va yurish qismi ustasi', skills: ['engine', 'undercarriage', 'welding'], experience_years: 8, rate: 120000, rate_unit: 'hour', mobile: true, about: "Cummins, Weichai, Deutz dvigatellari. Gusenitsa va katoklar almashtirish." }],
];
function ensureDemoSpecialists() {
  const settings = require('./settings');
  if (settings.getRaw('_mig.demoSpecialists')) return 0;
  let n = 0;
  DEMO_PEOPLE.forEach(([kind, name, region, spec], i) => {
    const phone = `+0000000${String(101 + i)}`;
    if (db.get('SELECT 1 FROM users WHERE phone = ?', phone)) return;
    const id = db.insert('users', { phone, name, country: 'UZ', lang: 'uz', currency: 'UZS', account_type: kind });
    const sid = upsertSpecialist(db.get('SELECT * FROM users WHERE id = ?', id), kind, { ...spec, region, country: 'UZ', currency: 'UZS', available: true });
    db.run('UPDATE specialists SET demo = 1 WHERE id = ?', sid);
    n += 1;
  });
  // Boshlang'ich (seed) mutaxassislar ham namuna — ularning raqamlari haqiqiy odamga tegishli bo'lishi mumkin
  db.run(`UPDATE specialists SET demo = 1 WHERE user_id IN (SELECT id FROM users WHERE phone IN (${SEED_PHONES.map(() => '?').join(',')}))`, ...SEED_PHONES);
  settings.setRaw('_mig.demoSpecialists', 1);
  return n;
}
// Ro'yxat so'rovi uchun: haqiqiylari yetarli bo'lsa namunalar ko'rinmaydi
const demoVisible = (kind) => db.get(`SELECT COUNT(*) AS n FROM specialists WHERE demo = 0 AND status = 'active'${kind ? ' AND kind = ?' : ''}`, ...(kind ? [kind] : [])).n < DEMO_HIDE_AT;

module.exports = { ensureDemoSpecialists, demoVisible, DEMO_HIDE_AT, specialistsToNotify, MECHANIC_SKILLS, DRIVER_SKILLS, LICENSES, RATE_UNITS, upsertSpecialist, specialistView, normalizePhone };
