const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  name TEXT,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'user',            -- user | moderator | admin
  lang TEXT NOT NULL DEFAULT 'uz',
  country TEXT NOT NULL DEFAULT 'UZ',
  currency TEXT,
  avatar TEXT,
  notify_messages INTEGER NOT NULL DEFAULT 1,
  notify_orders INTEGER NOT NULL DEFAULT 1,
  notify_prices INTEGER NOT NULL DEFAULT 1,
  notify_news INTEGER NOT NULL DEFAULT 0,
  blocked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS otp_codes (
  phone TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  device TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tin TEXT,                                      -- INN / STIR / BIN / ИНН
  activity TEXT,                                 -- "Спецтехника и запчасти"
  about TEXT,
  country TEXT NOT NULL,
  region TEXT,
  city TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  work_hours TEXT,
  logo TEXT,
  verification TEXT NOT NULL DEFAULT 'none',     -- none | pending | verified | rejected
  verified_at TEXT,
  rating_avg REAL NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS company_documents (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  original_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  parent_id INTEGER REFERENCES categories(id),
  kind TEXT NOT NULL,
  icon TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  names TEXT NOT NULL                            -- JSON {uz, ru, en, ...}
);

CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  deal_type TEXT NOT NULL,                       -- sale | rent | service
  kind TEXT NOT NULL,                            -- equipment | part | material | service
  category_id INTEGER NOT NULL REFERENCES categories(id),
  subcategory_id INTEGER REFERENCES categories(id),
  title TEXT NOT NULL,
  description TEXT,
  price REAL,
  currency TEXT NOT NULL,
  price_usd REAL,                                -- qidiruv/saralash uchun
  price_unit TEXT NOT NULL DEFAULT 'total',      -- total | hour | day | shift | ton | m3 | piece
  price_from INTEGER NOT NULL DEFAULT 0,
  negotiable INTEGER NOT NULL DEFAULT 0,
  vat_rate REAL,                                 -- null = QQS yo'q; 12 / 20 ...
  leasing INTEGER NOT NULL DEFAULT 0,
  condition TEXT,                                -- new | used
  brand TEXT,
  model TEXT,
  year INTEGER,
  hours INTEGER,                                 -- motosoat
  mileage_km INTEGER,
  power_hp INTEGER,
  weight_kg INTEGER,
  capacity_t REAL,
  drive TEXT,
  part_number TEXT,
  manufacturer TEXT,
  warranty_months INTEGER,
  analogs TEXT,
  compatibility TEXT,                            -- JSON ["JCB 3CX", ...]
  compatibility_note TEXT,
  stock_qty INTEGER,
  attrs TEXT,                                    -- JSON qo'shimcha xarakteristikalar [{label, value}]
  delivery TEXT,                                 -- JSON {pickup_address, local, national, payment}
  docs TEXT,                                     -- "ПСМ, в наличии"
  with_operator INTEGER NOT NULL DEFAULT 0,
  min_order TEXT,                                -- "от 4 часов", "от 10 тонн"
  country TEXT NOT NULL,
  region TEXT,
  city TEXT,
  address TEXT,
  location_note TEXT,
  lat REAL,
  lng REAL,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  accept_messages INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',          -- draft | moderation | active | rejected | archived | sold
  reject_reason TEXT,
  views INTEGER NOT NULL DEFAULT 0,
  search_text TEXT,
  published_at TEXT,
  bumped_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_listings_status ON listings(status, bumped_at DESC);
CREATE INDEX IF NOT EXISTS ix_listings_cat ON listings(category_id, subcategory_id, status);
CREATE INDEX IF NOT EXISTS ix_listings_geo ON listings(country, region, status);
CREATE INDEX IF NOT EXISTS ix_listings_user ON listings(user_id, status);

CREATE TABLE IF NOT EXISTS listing_photos (
  id INTEGER PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_photos_listing ON listing_photos(listing_id, sort);

-- Kunlik statistika (sotuvchi kabinetidagi grafik uchun)
CREATE TABLE IF NOT EXISTS listing_stats (
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  phone_reveals INTEGER NOT NULL DEFAULT 0,
  favorites INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (listing_id, day)
);
CREATE TABLE IF NOT EXISTS listing_view_log (
  listing_id INTEGER NOT NULL,
  viewer TEXT NOT NULL,
  day TEXT NOT NULL,
  PRIMARY KEY (listing_id, viewer, day)
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  price_at_save REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, listing_id)
);

CREATE TABLE IF NOT EXISTS saved_searches (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  query TEXT NOT NULL,                           -- JSON filtrlar
  notify INTEGER NOT NULL DEFAULT 1,
  new_count INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Xaridor so'rovlari ("Создать заявку")
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  want TEXT NOT NULL,                            -- equipment | part | service
  deal_type TEXT,                                -- sale | rent | service
  category_id INTEGER NOT NULL REFERENCES categories(id),
  subcategory_id INTEGER REFERENCES categories(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  condition TEXT,
  quantity TEXT,
  budget_min REAL,
  budget_max REAL,
  currency TEXT,
  country TEXT NOT NULL,
  region TEXT,
  city TEXT,
  needed_by TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  status TEXT NOT NULL DEFAULT 'open',           -- open | closed
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_requests_cat ON requests(status, category_id, subcategory_id, country);

CREATE TABLE IF NOT EXISTS request_offers (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id INTEGER REFERENCES listings(id) ON DELETE SET NULL,
  price REAL,
  currency TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',        -- pending | accepted | rejected
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (request_id, seller_id)
);

-- E'lon bo'yicha arizalar: ko'rik, hisob-faktura, moslik, ijara
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'general',          -- general | inspection | invoice | compatibility | rent
  message TEXT,
  preferred_at TEXT,
  amount REAL,
  currency TEXT,
  status TEXT NOT NULL DEFAULT 'new',            -- new | awaiting | negotiating | closed
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_leads_seller ON leads(seller_id, status);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  number TEXT UNIQUE,
  listing_id INTEGER REFERENCES listings(id) ON DELETE SET NULL,
  buyer_id INTEGER NOT NULL REFERENCES users(id),
  seller_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  currency TEXT NOT NULL,
  delivery_method TEXT NOT NULL,                 -- pickup | courier | carrier
  delivery_address TEXT,
  delivery_cost REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  carrier TEXT,
  tracking TEXT,
  eta TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'new',            -- new | confirmed | shipped | delivered | completed | cancelled
  cancel_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_orders_buyer ON orders(buyer_id, status);
CREATE INDEX IF NOT EXISTS ix_orders_seller ON orders(seller_id, status);

CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  actor_id INTEGER,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY,
  listing_id INTEGER REFERENCES listings(id) ON DELETE SET NULL,
  buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_message_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (listing_id, buyer_id, seller_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT,
  attachment TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_messages_conv ON messages(conversation_id, id);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id INTEGER UNIQUE REFERENCES orders(id),
  rating INTEGER NOT NULL,
  text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  params TEXT,                                   -- JSON; matn foydalanuvchi tilida o'qishda yasaladi
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_notifications_user ON notifications(user_id, id DESC);

CREATE TABLE IF NOT EXISTS currency_rates (
  code TEXT PRIMARY KEY,
  per_usd REAL NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT
);

-- ===== To'lovlar (Click, Payme, sinov) =====
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,                         -- promo | plan | escrow | inspection
  ref_id INTEGER,                                -- listing / order / inspection id
  meta TEXT,                                     -- JSON (paket, tarif ...)
  amount REAL NOT NULL,                          -- to'lov valyutasida
  currency TEXT NOT NULL,
  provider TEXT NOT NULL,                        -- click | payme | dev
  status TEXT NOT NULL DEFAULT 'pending',        -- pending | paid | cancelled | refunded
  provider_tx TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_payments_user ON payments(user_id, id DESC);

-- Payme Merchant API tranzaksiyalari
CREATE TABLE IF NOT EXISTS payme_transactions (
  id TEXT PRIMARY KEY,                           -- Payme tranzaksiya id
  payment_id INTEGER NOT NULL REFERENCES payments(id),
  amount INTEGER NOT NULL,                       -- tiyin
  state INTEGER NOT NULL,                        -- 1 yaratildi, 2 bajarildi, -1/-2 bekor
  create_time INTEGER NOT NULL,
  perform_time INTEGER NOT NULL DEFAULT 0,
  cancel_time INTEGER NOT NULL DEFAULT 0,
  reason INTEGER
);

-- E'lonni ko'tarish (TOP, ajratish)
CREATE TABLE IF NOT EXISTS promotions (
  id INTEGER PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  package TEXT NOT NULL,                         -- top | highlight | combo
  payment_id INTEGER REFERENCES payments(id),
  starts_at TEXT NOT NULL DEFAULT (datetime('now')),
  ends_at TEXT NOT NULL
);

-- Sotuvchi tariflari
CREATE TABLE IF NOT EXISTS user_plans (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,                            -- business
  until TEXT NOT NULL,
  top_credits INTEGER NOT NULL DEFAULT 0
);

-- Xavfsiz bitim bo'yicha nizolar
CREATE TABLE IF NOT EXISTS disputes (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  opened_by INTEGER NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',           -- open | resolved
  resolution TEXT,                               -- release | refund
  admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

-- Texnik ko'rik xizmati
CREATE TABLE IF NOT EXISTS inspections (
  id INTEGER PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'unpaid',         -- unpaid | paid | scheduled | done | cancelled
  price REAL NOT NULL,
  currency TEXT NOT NULL,
  payment_id INTEGER REFERENCES payments(id),
  note TEXT,
  inspector TEXT,
  scheduled_at TEXT,
  report TEXT,
  report_files TEXT,                             -- JSON yo'llar
  verdict TEXT,                                  -- good | issues | bad
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Shikoyatlar
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY,
  listing_id INTEGER REFERENCES listings(id) ON DELETE CASCADE,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,                          -- fake | price | sold | fraud | duplicate | other
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'open',           -- open | resolved | dismissed
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (listing_id, reporter_id)
);

-- Qidiruvdagi (o'g'irlangan / garovdagi) texnika seriya raqamlari
CREATE TABLE IF NOT EXISTS serial_blacklist (
  serial TEXT PRIMARY KEY,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Ijara bronlari va band kunlar
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  renter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  hours_per_day INTEGER,
  total REAL,
  currency TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',        -- pending | confirmed | rejected | cancelled
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_bookings_listing ON bookings(listing_id, status, start_date);
CREATE TABLE IF NOT EXISTS listing_blocked_dates (
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  PRIMARY KEY (listing_id, day)
);

-- Telegram
CREATE TABLE IF NOT EXISTS telegram_links (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  username TEXT,
  linked_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS telegram_codes (
  code TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

-- Narx tarixi
CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  price REAL NOT NULL,
  currency TEXT NOT NULL,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Chat shablonlari
CREATE TABLE IF NOT EXISTS message_templates (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL
);

-- ===== Mutaxassislar: mexanik va haydovchi rezyumelari =====
CREATE TABLE IF NOT EXISTS specialists (
  id INTEGER PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                            -- mechanic | driver
  headline TEXT NOT NULL,                        -- "Механик по гидравлике JCB, CAT"
  about TEXT,
  experience_years INTEGER,
  skills TEXT,                                   -- JSON: mexanik — yo'nalishlar, haydovchi — texnika turlari
  license TEXT,                                  -- JSON: haydovchilik toifalari ["C","CE","tractor"]
  brands TEXT,                                   -- JSON
  country TEXT NOT NULL,
  region TEXT,
  city TEXT,
  rate REAL,
  currency TEXT,
  rate_unit TEXT,                                -- hour | day | shift | month | job
  mobile INTEGER NOT NULL DEFAULT 0,             -- joyiga chiqadi (mexanik)
  available INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',         -- active | hidden
  views INTEGER NOT NULL DEFAULT 0,
  search_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- "Haydovchi qidiryapman", "Mexanik kerak" — vakansiyalar
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,                            -- driver | mechanic
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  requirements TEXT,                             -- JSON (toifalar, texnika)
  salary_min REAL,
  salary_max REAL,
  currency TEXT,
  salary_unit TEXT,                              -- month | shift | day | hour
  schedule TEXT,                                 -- "Вахта 15/15", "5/2"
  country TEXT NOT NULL,
  region TEXT,
  city TEXT,
  status TEXT NOT NULL DEFAULT 'open',           -- open | closed
  search_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT
);

-- Logistika: yuk tashish kerak (cargo) va tashish xizmati taklifi (transport)
CREATE TABLE IF NOT EXISTS logistics (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,                            -- cargo | transport
  title TEXT NOT NULL,
  description TEXT,
  from_country TEXT NOT NULL,
  from_city TEXT NOT NULL,
  to_country TEXT,
  to_city TEXT,
  cargo_type TEXT,                               -- texnika, qurilish yuklari, umumiy ...
  vehicle_type TEXT,                             -- tral, fura, bortli, samosval ...
  weight_t REAL,
  volume_m3 REAL,
  ready_date TEXT,
  price REAL,
  currency TEXT,
  price_unit TEXT,                               -- total | km | ton | hour
  status TEXT NOT NULL DEFAULT 'open',
  search_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT
);

-- ===== Biznes kabinet =====
CREATE TABLE IF NOT EXISTS company_branches (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  region TEXT,
  city TEXT,
  address TEXT,
  phone TEXT,
  work_hours TEXT,
  lat REAL,
  lng REAL
);
CREATE TABLE IF NOT EXISTS company_members (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'manager',          -- manager | sales | viewer
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, phone)
);
CREATE TABLE IF NOT EXISTS company_follows (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, company_id)
);

-- Qiziqishlar: tanlangan bo'limlar bo'yicha yangi e'lonlar haqida xabar
CREATE TABLE IF NOT EXISTS user_interests (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, category_id)
);

-- Qidiruv jurnali (tavsiyalar va o'xshash so'rovlar uchun)
CREATE TABLE IF NOT EXISTS search_log (
  q TEXT PRIMARY KEY,                            -- normallashtirilgan
  display TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 1,
  results INTEGER NOT NULL DEFAULT 0,
  last_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Ko'rishlar manbasi (kengaytirilgan statistika)
CREATE TABLE IF NOT EXISTS listing_view_sources (
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  source TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (listing_id, day, source)
);
-- ===== Platforma boshqaruvi =====
-- Hamyon (balans USD da saqlanadi, foydalanuvchi valyutasida ko'rsatiladi)
CREATE TABLE IF NOT EXISTS wallet_tx (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_usd REAL NOT NULL,                      -- + kirim, - chiqim
  balance_after REAL NOT NULL,
  kind TEXT NOT NULL,                            -- topup | admin_credit | admin_debit | spend | refund | bonus
  note TEXT,
  payment_id INTEGER,
  admin_id INTEGER,
  amount REAL,                                   -- asl summa va valyuta (admin kiritgan)
  currency TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_wallet_user ON wallet_tx(user_id, id DESC);
-- Brauzer push obunalari (Web Push)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Admin push / xabar tarqatmalari
CREATE TABLE IF NOT EXISTS broadcasts (
  id INTEGER PRIMARY KEY,
  admin_id INTEGER,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  audience TEXT,                                 -- JSON filtr
  channels TEXT,                                 -- JSON: inapp, push, telegram
  recipients INTEGER NOT NULL DEFAULT 0,
  push_sent INTEGER NOT NULL DEFAULT 0,
  telegram_sent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Admin harakatlari jurnali
CREATE TABLE IF NOT EXISTS admin_log (
  id INTEGER PRIMARY KEY,
  admin_id INTEGER,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id INTEGER,
  details TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_admin_log ON admin_log(id DESC);
-- Platforma sozlamalari (admin paneldan o'zgartiriladi)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Fura logistika birjasi: yuklar (load) va bo'sh furalar (truck)
CREATE TABLE IF NOT EXISTS freight (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,                            -- load | truck
  from_country TEXT NOT NULL,
  from_city TEXT NOT NULL,
  to_country TEXT,                               -- truck uchun bo'sh bo'lsa — istalgan yo'nalish
  to_city TEXT,
  date_from TEXT,                                -- yuklash / bo'sh bo'lish sanasi
  date_to TEXT,
  cargo TEXT,                                    -- yuk nomi (load)
  body_types TEXT,                               -- JSON: ["tent","ref",...]
  loading TEXT,                                  -- JSON: ["back","side","top"]
  weight_t REAL,
  volume_m3 REAL,
  length_m REAL,
  trucks_count INTEGER NOT NULL DEFAULT 1,
  adr INTEGER NOT NULL DEFAULT 0,                -- xavfli yuk
  tir INTEGER NOT NULL DEFAULT 0,
  cmr INTEGER NOT NULL DEFAULT 0,
  distance_km INTEGER,
  price REAL,
  currency TEXT,
  price_unit TEXT,                               -- total | km | ton
  payment TEXT,                                  -- cash | bank | vat | card
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open',           -- open | closed
  views INTEGER NOT NULL DEFAULT 0,
  contacts INTEGER NOT NULL DEFAULT 0,
  search_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  bumped_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_freight_open ON freight(status, kind, bumped_at DESC);
-- Yo'nalishga obuna: yangi yuk/fura chiqsa xabar
CREATE TABLE IF NOT EXISTS freight_alerts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                            -- qaysi e'lonlar kerak: load | truck
  from_country TEXT,
  from_city TEXT,
  to_country TEXT,
  to_city TEXT,
  body TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- "Bog'lanish" sahifasidagi murojaatlar
CREATE TABLE IF NOT EXISTS support_tickets (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name TEXT,
  phone TEXT,
  topic TEXT NOT NULL DEFAULT 'other',             -- question | payment | listing | complaint | ads | other
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',              -- new | answered | closed
  reply TEXT,
  replied_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  replied_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_support_status ON support_tickets(status, id DESC);
-- Reklama bannerlari statistikasi (kunlik)
CREATE TABLE IF NOT EXISTS banner_stats (
  uid TEXT NOT NULL,
  day TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (uid, day)
);
-- Yuborilgan SMS jurnali (admin: integratsiyalar)
CREATE TABLE IF NOT EXISTS sms_log (
  id INTEGER PRIMARY KEY,
  phone TEXT NOT NULL,
  provider TEXT NOT NULL,
  ok INTEGER NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

let db;

function open(file = config.dbFile) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  migrate();
  return db;
}

// Mavjud bazaga yangi ustunlarni qo'shish (ma'lumot yo'qolmaydi)
const COLUMNS = [
  ['requests', 'needs_delivery', 'INTEGER NOT NULL DEFAULT 0'],
  ['requests', 'contact_email', 'TEXT'],
  ['requests', 'company_name', 'TEXT'],
  ['requests', 'attachment', 'TEXT'],
  ['requests', 'accept_messages', 'INTEGER NOT NULL DEFAULT 1'],
  ['requests', 'expires_at', 'TEXT'],
  ['users', 'city', 'TEXT'],
  ['users', 'position', 'TEXT'],
  ['companies', 'reg_number', 'TEXT'],
  ['messages', 'attachment_name', 'TEXT'],
  ['messages', 'attachment_size', 'INTEGER'],
  ['listings', 'promoted_until', 'TEXT'],
  ['listings', 'tier', 'TEXT'], // vip | gold | premium
  ['users', 'username', 'TEXT'], // ixtiyoriy login (asosan admin/moderator uchun): telefon o'rniga
  ['listings', 'tier_until', 'TEXT'],
  ['listings', 'highlighted_until', 'TEXT'],
  ['listings', 'serial_number', 'TEXT'],
  ['orders', 'escrow', 'INTEGER NOT NULL DEFAULT 0'],
  ['orders', 'escrow_status', 'TEXT'], // unpaid | held | released | refunded | disputed
  ['orders', 'escrow_fee', 'REAL NOT NULL DEFAULT 0'],
  ['orders', 'payment_id', 'INTEGER'],
  ['users', 'auto_reply', 'TEXT'],
  ['users', 'auto_reply_on', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'notify_telegram', 'INTEGER NOT NULL DEFAULT 1'],
  ['conversations', 'auto_replied', 'INTEGER NOT NULL DEFAULT 0'],
  ['conversations', 'context', 'TEXT'], // e'lonsiz suhbat mavzusi (mutaxassis, vakansiya, logistika)
  ['users', 'account_type', "TEXT NOT NULL DEFAULT 'client'"], // client | company | mechanic | driver
  ['users', 'password_hash', 'TEXT'],
  ['users', 'password_set_at', 'TEXT'],
  ['companies', 'activities', 'TEXT'], // JSON: equipment_sale, equipment_rent, parts, repair, logistics, materials
  ['companies', 'cover', 'TEXT'],
  ['listings', 'deleted_at', 'TEXT'],
  ['users', 'balance_usd', 'REAL NOT NULL DEFAULT 0'],
  ['users', 'blocked_reason', 'TEXT'],
  ['users', 'admin_note', 'TEXT'],
  ['companies', 'legal_form', 'TEXT'], // yatt | mchj | ip | too ... (src/lib/legal.js)
  ['companies', 'reg_date', 'TEXT'],
  ['companies', 'kpp', 'TEXT'],
  ['companies', 'activity_code', 'TEXT'],
  ['companies', 'director', 'TEXT'],
  ['companies', 'legal_address', 'TEXT'],
  ['companies', 'bank_name', 'TEXT'],
  ['companies', 'bank_code', 'TEXT'],
  ['companies', 'bank_account', 'TEXT'],
  ['companies', 'corr_account', 'TEXT'],
  ['companies', 'vat', 'TEXT'],
  ['companies', 'reject_reason', 'TEXT'],
  ['companies', 'blocked', 'INTEGER NOT NULL DEFAULT 0'],
  ['company_documents', 'doc_type', "TEXT NOT NULL DEFAULT 'reg_cert'"],
  ['company_documents', 'size', 'INTEGER'],
];function migrate() {
  for (const [table, col, def] of COLUMNS) {
    const has = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
    if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_users_username ON users(username COLLATE NOCASE) WHERE username IS NOT NULL');
}

// node:sqlite undefined/boolean/obyektlarni qabul qilmaydi — o'giramiz
function bind(params) {
  return params.map((v) => {
    if (v === undefined) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v !== null && typeof v === 'object') return JSON.stringify(v);
    return v;
  });
}

const stmtCache = new Map();
function stmt(sql) {
  let s = stmtCache.get(sql);
  if (!s) {
    s = db.prepare(sql);
    stmtCache.set(sql, s);
  }
  return s;
}

const all = (sql, ...p) => stmt(sql).all(...bind(p));
const get = (sql, ...p) => stmt(sql).get(...bind(p));
const run = (sql, ...p) => stmt(sql).run(...bind(p));

// Ichma-ich chaqirilsa SAVEPOINT ishlatiladi (masalan, to'lov ichida hamyon o'zgarishi)
let txDepth = 0;
function tx(fn) {
  const sp = `sp${txDepth}`;
  db.exec(txDepth ? `SAVEPOINT ${sp}` : 'BEGIN IMMEDIATE');
  txDepth++;
  try {
    const r = fn();
    txDepth--;
    db.exec(txDepth ? `RELEASE ${sp}` : 'COMMIT');
    return r;
  } catch (e) {
    txDepth--;
    db.exec(txDepth ? `ROLLBACK TO ${sp}; RELEASE ${sp}` : 'ROLLBACK');
    throw e;
  }
}

// INSERT/UPDATE uchun obyekt -> SQL
function insert(table, obj) {
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
  const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`;
  return Number(run(sql, ...keys.map((k) => obj[k])).lastInsertRowid);
}
function update(table, id, obj) {
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
  if (!keys.length) return;
  run(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => obj[k]), id);
}

function close() {
  stmtCache.clear();
  if (db) db.close();
  db = null;
}

const exec = (sql) => db.exec(sql);
module.exports = { open, close, all, get, run, exec, tx, insert, update, get db() { return db; } };
