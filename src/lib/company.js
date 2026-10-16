const db = require('../db');

// Faoliyat turlari ("Nima bilan shug'ullanasiz?")
const ACTIVITIES = ['equipment_sale', 'equipment_rent', 'parts', 'repair', 'logistics', 'materials'];

// Foydalanuvchining kompaniyasi: egasi yoki xodimi sifatida
function companyFor(userId) {
  const own = db.get('SELECT * FROM companies WHERE owner_id = ?', userId);
  if (own) return { ...own, member_role: 'owner' };
  return db.get(
    `SELECT c.*, m.role AS member_role FROM company_members m JOIN companies c ON c.id = m.company_id WHERE m.user_id = ? ORDER BY m.id LIMIT 1`,
    userId,
  ) || null;
}

// Xodim birinchi marta kirganda telefon raqami bo'yicha kompaniyaga bog'lanadi
function linkMembership(user) {
  db.run('UPDATE company_members SET user_id = ? WHERE phone = ? AND user_id IS NULL', user.id, user.phone);
}

// E'lonni boshqarish huquqi: muallif, admin, kompaniya egasi yoki menejeri
function canManageListing(user, l) {
  if (!user) return false;
  if (user.id === l.user_id || user.role === 'admin') return true;
  if (!l.company_id) return false;
  const c = companyFor(user.id);
  return Boolean(c && c.id === l.company_id && (c.member_role === 'owner' || c.member_role === 'manager'));
}

module.exports = { ACTIVITIES, companyFor, linkMembership, canManageListing };
