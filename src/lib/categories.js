const db = require('../db');
const { CATALOG } = require('../catalog');
const { L, pick, normalizeSearch } = require('../i18n');

let cache = null; // { byId, bySlug, roots }

// Katalogni bazaga yozish (idempotent: slug bo'yicha yangilaydi)
function syncCatalog() {
  db.tx(() => {
    CATALOG.forEach((root, i) => {
      upsert(root.slug, null, root.kind, root.icon, i, L(root.names));
      const parentId = db.get('SELECT id FROM categories WHERE slug = ?', root.slug).id;
      root.children.forEach((ch, j) => upsert(ch.slug, parentId, root.kind, null, j, L(ch.names)));
    });
  });
  // Katalogdan olib tashlangan kategoriyalar: e'lon va so'rovlar bog'lanmagan bo'lsa — bazadan ham o'chiriladi
  const keep = new Set(CATALOG.flatMap((r) => [r.slug, ...r.children.map((c) => c.slug)]));
  const stale = db.all('SELECT id, slug, parent_id FROM categories').filter((c) => !keep.has(c.slug)).sort((x, y) => (y.parent_id ? 1 : 0) - (x.parent_id ? 1 : 0));
  for (const c of stale) {
    const used = db.get('SELECT 1 FROM listings WHERE category_id = ? OR subcategory_id = ? LIMIT 1', c.id, c.id)
      || db.get('SELECT 1 FROM requests WHERE category_id = ? OR subcategory_id = ? LIMIT 1', c.id, c.id)
      || db.get('SELECT 1 FROM categories WHERE parent_id = ? LIMIT 1', c.id);
    if (used) continue;
    try { db.run('DELETE FROM categories WHERE id = ?', c.id); } catch { /* boshqa bog'lanish bor — qoldiramiz */ }
  }
  cache = null;
}

function upsert(slug, parentId, kind, icon, sort, names) {
  db.run(
    `INSERT INTO categories (slug, parent_id, kind, icon, sort, names) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET parent_id = excluded.parent_id, kind = excluded.kind, icon = excluded.icon,
       sort = excluded.sort, names = excluded.names`,
    slug, parentId, kind, icon, sort, names,
  );
}

function load() {
  if (cache) return cache;
  const rows = db.all('SELECT * FROM categories ORDER BY sort');
  const byId = new Map();
  const bySlug = new Map();
  for (const r of rows) {
    const c = { ...r, names: JSON.parse(r.names), children: [] };
    // Qidiruv uchun barcha tillardagi nomlar
    c.searchText = normalizeSearch(Object.values(c.names).join(' '));
    byId.set(c.id, c);
    bySlug.set(c.slug, c);
  }
  const roots = [];
  for (const c of byId.values()) {
    if (c.parent_id) byId.get(c.parent_id)?.children.push(c);
    else roots.push(c);
  }
  cache = { byId, bySlug, roots };
  return cache;
}

const byId = (id) => (id ? load().byId.get(Number(id)) : null);
const bySlug = (slug) => (slug ? load().bySlug.get(String(slug)) : null);
// slug yoki id bo'yicha
const find = (v) => (v === null || v === undefined || v === '' ? null : /^\d+$/.test(String(v)) ? byId(v) : bySlug(v));

function brief(c, lang) {
  return c ? { id: c.id, slug: c.slug, name: pick(c.names, lang) } : null;
}

function invalidate() {
  cache = null;
}

module.exports = { syncCatalog, load, byId, bySlug, find, brief, invalidate };
