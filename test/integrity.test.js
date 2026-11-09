// Statik tekshiruvlar: tarjimalar to'liqligi va bildirishnoma havolalari mavjud sahifaga olib borishi
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test("interfeys tarjimalari: har bir kalit 10 tilda bor", async () => {
  const { DICT, LANGS } = await import(path.join(root, 'public/js/dict.js'));
  const missing = [];
  for (const [k, v] of Object.entries(DICT)) for (const l of LANGS) if (!v[l]) missing.push(`${k}:${l}`);
  assert.deepEqual(missing.slice(0, 20), []);
});

test("bildirishnoma havolalari SPA marshrutlariga mos", () => {
  const app = fs.readFileSync(path.join(root, 'public/js/app.js'), 'utf8');
  const routes = [...app.matchAll(/\[\/(\^[^,]+\$)\/,/g)].map((m) => new RegExp(m[1].replace(/\\\//g, '/')));
  const files = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') && files.push(path.join(d, e.name))));
  walk(path.join(root, 'src'));
  const bad = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/notify\([^;]*?,\s*[`'](\/[^`'?#]*)[^`']*[`']\)/g)) {
      if (/^\/\$\{[^}]+\}$/.test(m[1])) continue; // butunlay o'zgaruvchi (masalan /${v.kind} → /driver)
      const link = m[1].replace(/\$\{[^}]+\}/g, '1');
      if (!routes.some((r) => r.test(link))) bad.push(`${path.basename(f)}: ${m[1]}`);
    }
  }
  assert.deepEqual(bad, []);
});
