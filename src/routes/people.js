const { Router } = require('express');
const db = require('../db');
const money = require('../lib/money');
const P = require('../lib/people');
const { companyFor } = require('../lib/company');
const { requireAuth, rateLimit } = require('../lib/auth');
const { fail, notFound, forbidden, validate, paging, pageResult, parseJson } = require('../lib/http');
const { COUNTRY, CURRENCY_CODES, isValidRegion, countryName, regionName } = require('../geo');
const { normalizeSearch } = require('../i18n');
const { notify } = require('../lib/notify');

const r = Router();
const textFilter = (q, col = 'search_text') => normalizeSearch(q || '').split(' ').filter(Boolean).slice(0, 6).map((tok) => [`${col} LIKE ?`, `%${tok}%`]);

// ---------- Mutaxassislar (rezyume) ----------
r.get('/specialists', (req, res) => {
  const pg = paging(req.query, 20);
  const kind = ['mechanic', 'driver'].includes(req.query.kind) ? req.query.kind : null;
  const where = [`status = 'active'`];
  const params = [];
  if (kind) { where.push('kind = ?'); params.push(kind); }
  if (req.query.country) { where.push('country = ?'); params.push(String(req.query.country).toUpperCase()); }
  if (req.query.region) { where.push('region = ?'); params.push(String(req.query.region)); }
  if (req.query.skill) { where.push('skills LIKE ?'); params.push(`%"${String(req.query.skill).replace(/[%"]/g, '')}"%`); }
  if (req.query.license) { where.push('license LIKE ?'); params.push(`%"${String(req.query.license).replace(/[%"]/g, '')}"%`); }
  if (req.query.mobile === '1') where.push('mobile = 1');
  if (req.query.available === '1') where.push('available = 1');
  for (const [w, p] of textFilter(req.query.q)) { where.push(w); params.push(p); }
  const sql = where.join(' AND ');
  const total = db.get(`SELECT COUNT(*) AS n FROM specialists WHERE ${sql}`, ...params).n;
  const rows = db.all(`SELECT * FROM specialists WHERE ${sql} ORDER BY available DESC, updated_at DESC LIMIT ? OFFSET ?`, ...params, pg.perPage, pg.offset);
  res.json(pageResult(rows.map((s) => P.specialistView(s, req)), total, pg));
});

r.get('/specialists/options', (_req, res) => {
  res.json({ mechanic_skills: P.MECHANIC_SKILLS, driver_skills: P.DRIVER_SKILLS, licenses: P.LICENSES, rate_units: P.RATE_UNITS });
});

r.get('/specialists/:id', (req, res) => {
  const s = db.get('SELECT * FROM specialists WHERE id = ?', Number(req.params.id));
  if (!s || (s.status !== 'active' && req.user?.id !== s.user_id)) notFound();
  if (req.user?.id !== s.user_id) db.run('UPDATE specialists SET views = views + 1 WHERE id = ?', s.id);
  res.json({ ...P.specialistView(s, req, { full: true }), is_owner: req.user?.id === s.user_id });
});

r.post('/specialists/:id/phone', requireAuth, (req, res) => {
  const s = db.get('SELECT user_id FROM specialists WHERE id = ?', Number(req.params.id));
  if (!s) notFound();
  res.json({ phone: db.get('SELECT phone FROM users WHERE id = ?', s.user_id).phone });
});

r.get('/me/specialist', requireAuth, (req, res) => {
  const s = db.get('SELECT * FROM specialists WHERE user_id = ?', req.user.id);
  if (!s) notFound();
  res.json({ ...P.specialistView(s, req, { full: true }), status: s.status });
});

r.put('/me/specialist', requireAuth, (req, res) => {
  const kind = req.body?.kind === 'driver' ? 'driver' : req.body?.kind === 'mechanic' ? 'mechanic' : (req.user.account_type === 'driver' ? 'driver' : 'mechanic');
  const id = P.upsertSpecialist(req.user, kind, req.body || {});
  if (req.body?.hidden !== undefined) db.run('UPDATE specialists SET status = ? WHERE id = ?', req.body.hidden ? 'hidden' : 'active', id);
  if (!['mechanic', 'driver'].includes(req.user.account_type)) db.run('UPDATE users SET account_type = ? WHERE id = ? AND account_type = ?', kind, req.user.id, 'client');
  res.json(P.specialistView(db.get('SELECT * FROM specialists WHERE id = ?', id), req, { full: true }));
});

// ---------- Vakansiyalar ----------
const JOB_RULES = {
  kind: { type: 'enum', values: ['driver', 'mechanic'], required: true },
  title: { type: 'string', min: 5, max: 120, required: true },
  description: { type: 'string', min: 10, max: 3000, required: true },
  requirements: { type: 'array', max: 20, itemMax: 40 },
  salary_min: { type: 'number', min: 0 },
  salary_max: { type: 'number', min: 0 },
  currency: { type: 'enum', values: CURRENCY_CODES },
  salary_unit: { type: 'enum', values: ['month', 'shift', 'day', 'hour'] },
  schedule: { type: 'string', max: 60 },
  country: { type: 'enum', values: Object.keys(COUNTRY) },
  region: { type: 'string', max: 40 },
  city: { type: 'string', max: 80 },
};

function jobView(j, req) {
  const u = db.get('SELECT name FROM users WHERE id = ?', j.user_id);
  const c = j.company_id ? db.get('SELECT id, name, verification FROM companies WHERE id = ?', j.company_id) : null;
  const fmt = (n) => (n === null || n === undefined ? null : money.formatAmount(n, j.currency, req.lang));
  return {
    id: j.id, kind: j.kind, title: j.title, description: j.description, requirements: parseJson(j.requirements, []),
    salary: { min: j.salary_min, max: j.salary_max, currency: j.currency, unit: j.salary_unit, formatted: [fmt(j.salary_min), fmt(j.salary_max)].filter(Boolean).join(' — ') || null },
    schedule: j.schedule,
    location: { country: j.country, country_name: countryName(j.country, req.lang), region: j.region, region_name: regionName(j.country, j.region, req.lang), city: j.city },
    employer: c ? { company_id: c.id, name: c.name, verified: c.verification === 'verified' } : { name: u?.name },
    user_id: j.user_id, status: j.status, is_owner: req.user?.id === j.user_id, created_at: j.created_at,
  };
}

r.get('/jobs', (req, res) => {
  const pg = paging(req.query, 20);
  const where = [`status = 'open'`];
  const params = [];
  if (['driver', 'mechanic'].includes(req.query.kind)) { where.push('kind = ?'); params.push(req.query.kind); }
  if (req.query.country) { where.push('country = ?'); params.push(String(req.query.country).toUpperCase()); }
  for (const [w, p] of textFilter(req.query.q)) { where.push(w); params.push(p); }
  const sql = where.join(' AND ');
  const total = db.get(`SELECT COUNT(*) AS n FROM jobs WHERE ${sql}`, ...params).n;
  const rows = db.all(`SELECT * FROM jobs WHERE ${sql} ORDER BY id DESC LIMIT ? OFFSET ?`, ...params, pg.perPage, pg.offset);
  res.json(pageResult(rows.map((j) => jobView(j, req)), total, pg));
});

r.get('/my/jobs', requireAuth, (req, res) => res.json(db.all('SELECT * FROM jobs WHERE user_id = ? ORDER BY id DESC', req.user.id).map((j) => jobView(j, req))));

r.post('/jobs', requireAuth, rateLimit({ name: 'jobs', windowMs: 3600000, max: 20, key: (req) => req.user.id }), (req, res) => {
  const v = validate(req.body, JOB_RULES);
  v.country = v.country || req.user.country;
  if (v.region && !isValidRegion(v.country, v.region)) fail(422, 'err.validation', { region: 'invalid' });
  if (!v.currency) v.currency = COUNTRY[v.country].currency;
  const company = companyFor(req.user.id);
  const id = db.insert('jobs', {
    ...v, user_id: req.user.id, company_id: company?.id || null,
    search_text: normalizeSearch([v.title, v.description, (v.requirements || []).join(' '), v.city, company?.name].filter(Boolean).join(' ')),
    expires_at: db.get(`SELECT datetime('now', '+30 days') AS d`).d,
  });
  // Mos mutaxassislarga (mexanik yoki haydovchi) "Yangi ish" xabari
  const city = v.city || (v.region ? regionName(v.country, v.region, 'uz') : '');
  const to = P.specialistsToNotify({ kind: v.kind, country: v.country, region: v.region, excludeUserId: req.user.id });
  for (const uid of to) notify(uid, 'job_new', { title: v.title, city_txt: city ? ` · ${city}` : '', job_id: id }, `/${v.kind}`);
  res.status(201).json({ ...jobView(db.get('SELECT * FROM jobs WHERE id = ?', id), req), notified: to.length });
});

r.post('/jobs/:id/close', requireAuth, (req, res) => {
  const j = db.get('SELECT * FROM jobs WHERE id = ?', Number(req.params.id));
  if (!j) notFound();
  if (j.user_id !== req.user.id) forbidden();
  db.run(`UPDATE jobs SET status = 'closed' WHERE id = ?`, j.id);
  res.json({ ok: true });
});

// Telefon (vakansiya muallifi)
r.post('/contact/:type/:id/phone', requireAuth, (req, res) => {
  const table = { job: 'jobs' }[req.params.type];
  if (!table) notFound();
  const x = db.get(`SELECT user_id FROM ${table} WHERE id = ?`, Number(req.params.id));
  if (!x) notFound();
  res.json({ phone: db.get('SELECT phone FROM users WHERE id = ?', x.user_id).phone });
});

module.exports = { router: r, jobView };
