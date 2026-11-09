// Admin akkauntini login va parol bilan o'rnatish (parol repoga yozilmaydi — faqat muhit o'zgaruvchisidan):
//   ADMIN_LOGIN=ism ADMIN_PASSWORD='...' node scripts/set-admin.js
// Deploy'da GitHub Secrets (ADMIN_LOGIN, ADMIN_PASSWORD) orqali ishlaydi. Seed admin (+998900000001) bloklanadi.
const config = require('../src/config');
const db = require('../src/db');

const login = String(process.env.ADMIN_LOGIN || '').trim();
const password = String(process.env.ADMIN_PASSWORD || '');
if (!login || !password) {
  console.log('skip: ADMIN_LOGIN/ADMIN_PASSWORD berilmagan');
  process.exit(0);
}
if (!/^(?=.*[a-z])[a-z0-9._-]{3,32}$/i.test(login)) { console.log('XATO: login 3–32 belgi (harf, raqam, . _ -)'); process.exit(1); }
if (password.length < 8) { console.log('XATO: parol kamida 8 belgi'); process.exit(1); }

db.open(process.env.DB_FILE || config.dbFile);
require('../src/lib/settings').load();
const { hashPassword } = require('../src/routes/auth');
const { SEED_ADMIN_PHONE } = require('../src/lib/maintenance');

let u = db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', login);
if (!u) {
  // Telefonsiz admin: ichki raqam (SMS yuborilmaydi), kirish faqat login + parol bilan
  let phone;
  for (let i = 1; i < 100; i += 1) {
    phone = `+0000000000${String(i).padStart(2, '0')}`;
    if (!db.get('SELECT 1 FROM users WHERE phone = ?', phone)) break;
  }
  const id = db.insert('users', { phone, name: 'Admin', username: login, role: 'admin', country: 'UZ', lang: 'uz', currency: 'UZS' });
  u = db.get('SELECT * FROM users WHERE id = ?', id);
}
const changed = !require('../src/routes/auth').checkPassword(password, u.password_hash) || u.role !== 'admin' || u.blocked;
db.run(`UPDATE users SET role = 'admin', blocked = 0, username = ?, password_hash = ?, password_set_at = datetime('now') WHERE id = ?`,
  login, hashPassword(password), u.id);
if (changed) db.run('DELETE FROM sessions WHERE user_id = ?', u.id);

// Seed admin — ochiq parol bilan yaratilgan, endi kerak emas
const seedAdmin = db.get('SELECT id FROM users WHERE phone = ? AND id != ?', SEED_ADMIN_PHONE, u.id);
if (seedAdmin) {
  db.run(`UPDATE users SET role = 'user', blocked = 1, password_hash = NULL WHERE id = ?`, seedAdmin.id);
  db.run('DELETE FROM sessions WHERE user_id = ?', seedAdmin.id);
}
console.log(`OK admin=${login} (id ${u.id})${changed ? ', parol yangilandi' : ''}${seedAdmin ? ', seed admin bloklandi' : ''}`);
