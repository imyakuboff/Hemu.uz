// Diler "Do'kon" tarifi: muqova, brend rangi, qisqa manzil, qadalgan e'lonlar, o'z e'lonlarida faqat o'z tavsiyalari
const db = require('../db');
const { parseJson } = require('./http');

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const isActive = (c) => Boolean(c?.store_until && c.store_until > now());
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/;
// Sayt bo'limlari bilan to'qnashmasin
const RESERVED = new Set(['admin', 'api', 'hemu', 'hemuuz', 'support', 'help', 'login', 'store', 'shop', 'stores', 'business', 'company', 'test', 'official', 'moderator']);
const COLORS = ['#0e3352', '#0b6fcf', '#1f8a4c', '#c0392b', '#e67e22', '#7a4b00', '#6c3fc5', '#111111'];

function companyOfListing(l) {
  return l.company_id ? db.get('SELECT * FROM companies WHERE id = ?', l.company_id) : null;
}

// Do'kon tarifi muddatini uzaytirish (to'lov tasdiqlanganda)
function apply(userId, months) {
  const c = db.get('SELECT * FROM companies WHERE owner_id = ?', userId);
  if (!c) return;
  db.run(
    `UPDATE companies SET store_until = datetime(MAX(COALESCE(store_until, ''), datetime('now')), ?) WHERE id = ?`,
    `+${Number(months) || 1} months`, c.id,
  );
}

function pinnedIds(c) {
  return parseJson(c.store_pinned, []).filter(Number.isInteger).slice(0, 6);
}

module.exports = { isActive, apply, pinnedIds, companyOfListing, SLUG_RE, RESERVED, COLORS };
