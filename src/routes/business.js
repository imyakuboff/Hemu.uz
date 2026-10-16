// Biznes kabinet: filiallar, xodimlar, obunachilar, kompaniya do'koni
const { Router } = require('express');
const db = require('../db');
const cats = require('../lib/categories');
const { notify } = require('../lib/notify');
const { companyFor } = require('../lib/company');
const { requireAuth } = require('../lib/auth');
const { fail, notFound, forbidden, validate } = require('../lib/http');
const { COUNTRY, isValidRegion, normalizePhone, regionName } = require('../geo');
const { pick } = require('../i18n');

const r = Router();

function ownCompany(req, roles = ['owner']) {
  const c = companyFor(req.user.id);
  if (!c) notFound();
  if (!roles.includes(c.member_role)) forbidden();
  return c;
}

const branchView = (b, lang) => ({ ...b, region_name: regionName(b.country, b.region, lang) });

// ---------- Filiallar ----------
const BRANCH = {
  name: { type: 'string', min: 2, max: 120, required: true },
  country: { type: 'enum', values: Object.keys(COUNTRY) },
  region: { type: 'string', max: 40 },
  city: { type: 'string', max: 80 },
  address: { type: 'string', max: 200 },
  phone: { type: 'string', max: 30 },
  work_hours: { type: 'string', max: 80 },
  lat: { type: 'number', min: -90, max: 90 },
  lng: { type: 'number', min: -180, max: 180 },
};
function prepBranch(c, body, partial) {
  const v = validate(body, BRANCH, { partial });
  v.country = v.country || c.country;
  if (v.region && !isValidRegion(v.country, v.region)) fail(422, 'err.validation', { region: 'invalid' });
  if (v.phone) {
    const p = normalizePhone(v.phone, v.country);
    if (!p) fail(422, 'err.invalid_phone');
    v.phone = p.e164;
  }
  return v;
}

r.get('/business/branches', requireAuth, (req, res) => {
  const c = ownCompany(req, ['owner', 'manager', 'sales', 'viewer']);
  res.json(db.all('SELECT * FROM company_branches WHERE company_id = ? ORDER BY id', c.id).map((b) => branchView(b, req.lang)));
});
r.post('/business/branches', requireAuth, (req, res) => {
  const c = ownCompany(req, ['owner', 'manager']);
  if (db.get('SELECT COUNT(*) AS n FROM company_branches WHERE company_id = ?', c.id).n >= 50) fail(429, 'err.too_many');
  const id = db.insert('company_branches', { ...prepBranch(c, req.body, false), company_id: c.id });
  res.status(201).json(branchView(db.get('SELECT * FROM company_branches WHERE id = ?', id), req.lang));
});
r.patch('/business/branches/:id', requireAuth, (req, res) => {
  const c = ownCompany(req, ['owner', 'manager']);
  const b = db.get('SELECT * FROM company_branches WHERE id = ? AND company_id = ?', Number(req.params.id), c.id);
  if (!b) notFound();
  db.update('company_branches', b.id, prepBranch(c, req.body, true));
  res.json(branchView(db.get('SELECT * FROM company_branches WHERE id = ?', b.id), req.lang));
});
r.delete('/business/branches/:id', requireAuth, (req, res) => {
  const c = ownCompany(req, ['owner', 'manager']);
  db.run('DELETE FROM company_branches WHERE id = ? AND company_id = ?', Number(req.params.id), c.id);
  res.json({ ok: true });
});

// ---------- Xodimlar ----------
const ROLES = ['manager', 'sales', 'viewer'];
r.get('/business/members', requireAuth, (req, res) => {
  const c = ownCompany(req, ['owner', 'manager']);
  const rows = db.all(
    `SELECT m.*, u.name AS user_name, u.last_seen_at,
       (SELECT COUNT(*) FROM listings l WHERE l.user_id = m.user_id AND l.company_id = m.company_id AND l.status = 'active') AS listings
     FROM company_members m LEFT JOIN users u ON u.id = m.user_id WHERE m.company_id = ? ORDER BY m.id`,
    c.id,
  );
  const owner = db.get('SELECT id, name, phone FROM users WHERE id = ?', c.owner_id);
  res.json({ owner, items: rows.map((m) => ({ id: m.id, phone: m.phone, name: m.name || m.user_name, role: m.role, joined: Boolean(m.user_id), last_seen_at: m.last_seen_at, listings: m.listings })) });
});
r.post('/business/members', requireAuth, (req, res) => {
  const c = ownCompany(req, ['owner']);
  const v = validate(req.body, { phone: { type: 'string', required: true, max: 30 }, name: { type: 'string', max: 80 }, role: { type: 'enum', values: ROLES } });
  const p = normalizePhone(v.phone, c.country);
  if (!p) fail(422, 'err.invalid_phone');
  if (p.e164 === req.user.phone) fail(409, 'err.duplicate');
  if (db.get('SELECT 1 FROM company_members WHERE company_id = ? AND phone = ?', c.id, p.e164)) fail(409, 'err.duplicate');
  if (db.get('SELECT COUNT(*) AS n FROM company_members WHERE company_id = ?', c.id).n >= 100) fail(429, 'err.too_many');
  const existing = db.get('SELECT id FROM users WHERE phone = ?', p.e164);
  const id = db.insert('company_members', { company_id: c.id, phone: p.e164, name: v.name, role: v.role || 'sales', user_id: existing?.id || null });
  if (existing) notify(existing.id, 'member_added', { company: c.name }, '/dashboard');
  res.status(201).json({ id, phone: p.e164, role: v.role || 'sales', joined: Boolean(existing) });
});
r.patch('/business/members/:id', requireAuth, (req, res) => {
  const c = ownCompany(req, ['owner']);
  const v = validate(req.body, { role: { type: 'enum', values: ROLES, required: true } });
  const n = db.run('UPDATE company_members SET role = ? WHERE id = ? AND company_id = ?', v.role, Number(req.params.id), c.id).changes;
  if (!n) notFound();
  res.json({ ok: true });
});
r.delete('/business/members/:id', requireAuth, (req, res) => {
  const c = ownCompany(req, ['owner']);
  db.run('DELETE FROM company_members WHERE id = ? AND company_id = ?', Number(req.params.id), c.id);
  res.json({ ok: true });
});

// ---------- Obuna (kompaniyani kuzatish) ----------
r.put('/companies/:id/follow', requireAuth, (req, res) => {
  const c = db.get('SELECT id, owner_id FROM companies WHERE id = ?', Number(req.params.id));
  if (!c) notFound();
  if (c.owner_id === req.user.id) fail(409, 'err.own_listing');
  db.run('INSERT OR IGNORE INTO company_follows (user_id, company_id) VALUES (?, ?)', req.user.id, c.id);
  res.json({ following: true, followers: db.get('SELECT COUNT(*) AS n FROM company_follows WHERE company_id = ?', c.id).n });
});
r.delete('/companies/:id/follow', requireAuth, (req, res) => {
  db.run('DELETE FROM company_follows WHERE user_id = ? AND company_id = ?', req.user.id, Number(req.params.id));
  res.json({ following: false, followers: db.get('SELECT COUNT(*) AS n FROM company_follows WHERE company_id = ?', Number(req.params.id)).n });
});
r.get('/my/follows', requireAuth, (req, res) => {
  res.json(db.all(
    `SELECT c.id, c.name, c.city, c.verification, c.logo,
       (SELECT COUNT(*) FROM listings l WHERE l.company_id = c.id AND l.status = 'active') AS listings
     FROM company_follows f JOIN companies c ON c.id = f.company_id WHERE f.user_id = ? ORDER BY f.created_at DESC`,
    req.user.id,
  ).map((c) => ({ ...c, verified: c.verification === 'verified' })));
});

// Do'kon uchun qo'shimcha: filiallar, obunachilar, bo'limlar
function storeExtras(companyId, req) {
  const branches = db.all('SELECT * FROM company_branches WHERE company_id = ? ORDER BY id', companyId).map((b) => branchView(b, req.lang));
  const followers = db.get('SELECT COUNT(*) AS n FROM company_follows WHERE company_id = ?', companyId).n;
  const following = req.user ? Boolean(db.get('SELECT 1 FROM company_follows WHERE user_id = ? AND company_id = ?', req.user.id, companyId)) : false;
  const sections = db.all(`SELECT subcategory_id AS id, COUNT(*) AS n FROM listings WHERE company_id = ? AND status = 'active' AND subcategory_id IS NOT NULL GROUP BY subcategory_id ORDER BY n DESC`, companyId)
    .map((x) => { const c = cats.byId(x.id); return c ? { slug: c.slug, name: pick(c.names, req.lang), count: x.n } : null; }).filter(Boolean);
  const c = db.get('SELECT activities, cover FROM companies WHERE id = ?', companyId);
  return { branches, followers, following, sections, activities: JSON.parse(c?.activities || '[]'), members: db.get('SELECT COUNT(*) AS n FROM company_members WHERE company_id = ?', companyId).n + 1 };
}

module.exports = { router: r, storeExtras };
