// API xatolari va kiruvchi ma'lumotlarni tekshirish
class ApiError extends Error {
  constructor(status, key, details) {
    super(key);
    this.status = status;
    this.key = key;
    this.details = details;
  }
}

const fail = (status, key, details) => {
  throw new ApiError(status, key, details);
};
const notFound = () => fail(404, 'err.not_found');
const forbidden = () => fail(403, 'err.forbidden');
const invalid = (field, reason = 'invalid') => fail(422, 'err.validation', { [field]: reason });

// Oddiy sxema bo'yicha validatsiya.
// rules: { field: { type: 'string'|'int'|'number'|'bool'|'enum'|'array'|'object', required, min, max, values } }
function validate(body, rules, { partial = false } = {}) {
  const out = {};
  const errors = {};
  const src = body || {};
  for (const [field, r] of Object.entries(rules)) {
    let v = src[field];
    if (v === undefined || v === null || v === '') {
      if (r.required && !partial) errors[field] = 'required';
      else if (v === null || v === '') out[field] = r.type === 'bool' ? 0 : null;
      continue;
    }
    switch (r.type) {
      case 'string':
        if (typeof v !== 'string' && typeof v !== 'number') { errors[field] = 'type'; continue; }
        v = String(v).trim();
        if (r.min && v.length < r.min) { errors[field] = `min:${r.min}`; continue; }
        if (r.max && v.length > r.max) { errors[field] = `max:${r.max}`; continue; }
        if (r.pattern && !r.pattern.test(v)) { errors[field] = 'format'; continue; }
        break;
      case 'int':
      case 'number': {
        const n = Number(v);
        if (!Number.isFinite(n) || (r.type === 'int' && !Number.isInteger(n))) { errors[field] = 'type'; continue; }
        if (r.min !== undefined && n < r.min) { errors[field] = `min:${r.min}`; continue; }
        if (r.max !== undefined && n > r.max) { errors[field] = `max:${r.max}`; continue; }
        v = n;
        break;
      }
      case 'bool':
        v = v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0;
        break;
      case 'enum':
        if (!r.values.includes(v)) { errors[field] = 'enum'; continue; }
        break;
      case 'array':
        if (!Array.isArray(v)) { errors[field] = 'type'; continue; }
        if (r.max && v.length > r.max) { errors[field] = `max:${r.max}`; continue; }
        v = v.map((x) => String(x).trim().slice(0, r.itemMax || 100)).filter(Boolean);
        break;
      case 'object':
        if (typeof v !== 'object' || Array.isArray(v)) { errors[field] = 'type'; continue; }
        break;
      default:
        break;
    }
    out[field] = v;
  }
  if (Object.keys(errors).length) fail(422, 'err.validation', errors);
  return out;
}

function paging(query, def = 24, max = 60) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const perPage = Math.min(max, Math.max(1, parseInt(query.per_page, 10) || def));
  return { page, perPage, offset: (page - 1) * perPage };
}

function pageResult(items, total, { page, perPage }) {
  return { items, total, page, per_page: perPage, pages: Math.max(1, Math.ceil(total / perPage)) };
}

const parseJson = (s, def = null) => {
  if (s === null || s === undefined) return def;
  try {
    return JSON.parse(s);
  } catch {
    return def;
  }
};

module.exports = { ApiError, fail, notFound, forbidden, invalid, validate, paging, pageResult, parseJson };
