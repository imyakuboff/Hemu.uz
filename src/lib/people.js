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
  };
  if (full) {
    v.about = s.about;
    v.views = s.views;
    v.last_seen_at = u?.last_seen_at;
  }
  return v;
}

module.exports = { MECHANIC_SKILLS, DRIVER_SKILLS, LICENSES, RATE_UNITS, upsertSpecialist, specialistView, normalizePhone };
