// Platforma admin paneli: to'liq boshqaruv
import { state, t, esc, api, icon, num, qs, fmtRel, fmtDate, initials, openModal, closeModal, toast, confirmBox, debounce, setToken, themeButton, fitImage, $, $$ } from '../core.js';
import { imgOf, priceText, LOGO } from '../ui.js';
import { render, go, routeExists } from '../app.js';

// ---------- Admin matnlari (uz / ru / en; boshqa tillarda ruscha yoki inglizcha) ----------
const D = {
  admin: ['Admin panel', 'Админ-панель', 'Admin panel'],
  nav_overview: ["Umumiy ko'rinish", 'Обзор', 'Overview'],
  nav_users: ['Foydalanuvchilar', 'Пользователи', 'Users'],
  nav_companies: ['Kompaniyalar', 'Компании', 'Companies'],
  nav_listings: ["E'lonlar", 'Объявления', 'Listings'],
  nav_orders: ['Buyurtmalar', 'Заказы', 'Orders'],
  nav_finance: ["Moliya va balans", 'Финансы и баланс', 'Finance & wallets'],
  nav_broadcast: ['Push-xabarlar', 'Push-рассылка', 'Push messages'],
  nav_trust: ['Shikoyat va nizolar', 'Жалобы и споры', 'Reports & disputes'],
  nav_system: ['Server', 'Сервер', 'Server'],
  nav_settings: ['Sozlamalar', 'Настройки', 'Settings'],
  nav_log: ['Harakatlar jurnali', 'Журнал действий', 'Audit log'],
  to_site: ['Saytga qaytish', 'Вернуться на сайт', 'Back to site'],
  users_total: ['Foydalanuvchilar', 'Пользователи', 'Users'],
  new_7d: ['Yangi (7 kun)', 'Новые (7 дней)', 'New (7 days)'],
  online: ['Hozir onlayn', 'Сейчас онлайн', 'Online now'],
  active_24h: ['Faol (24 soat)', 'Активны (24 ч)', 'Active (24h)'],
  revenue_30d: ['Daromad (30 kun)', 'Выручка (30 дней)', 'Revenue (30 days)'],
  topups_30d: ["To'ldirishlar (30 kun)", 'Пополнения (30 дней)', 'Top-ups (30 days)'],
  wallets_total: ['Hamyonlardagi mablag\'', 'На балансах', 'In wallets'],
  queue: ['Kutilmoqda', 'Ожидают действий', 'Needs attention'],
  q_moderation: ["E'lon moderatsiyasi", 'Модерация объявлений', 'Listing moderation'],
  q_companies: ['Kompaniya tekshiruvi', 'Проверка компаний', 'Company verification'],
  q_reports: ['Shikoyatlar', 'Жалобы', 'Reports'],
  q_disputes: ['Nizolar', 'Споры', 'Disputes'],
  q_inspections: ["Texnik ko'riklar", 'Тех. проверки', 'Inspections'],
  ch_regs: ["Ro'yxatdan o'tishlar", 'Регистрации', 'Registrations'],
  ch_listings: ["Yangi e'lonlar", 'Новые объявления', 'New listings'],
  ch_revenue: ['Daromad, USD', 'Выручка, USD', 'Revenue, USD'],
  by_country: ["Mamlakatlar bo'yicha", 'По странам', 'By country'],
  by_type: ["Hisob turlari", 'Типы аккаунтов', 'Account types'],
  cpu: ['Protsessor (CPU)', 'Процессор (CPU)', 'CPU'],
  ram: ['Xotira (RAM)', 'Память (RAM)', 'Memory (RAM)'],
  uptime: ['Ishlash vaqti', 'Аптайм', 'Uptime'],
  req_min: ["So'rov/daqiqa", 'Запросов/мин', 'Requests/min'],
  errors_5xx: ['Server xatolari', 'Ошибки сервера', 'Server errors'],
  search_users: ['Ism, telefon, email, kompaniya yoki ID', 'Имя, телефон, email, компания или ID', 'Name, phone, email, company or ID'],
  all: ['Barchasi', 'Все', 'All'],
  role: ['Rol', 'Роль', 'Role'],
  r_user: ['Foydalanuvchi', 'Пользователь', 'User'],
  r_admin: ['Administrator', 'Администратор', 'Administrator'],
  type: ['Hisob turi', 'Тип аккаунта', 'Account type'],
  country: ['Mamlakat', 'Страна', 'Country'],
  status: ['Holat', 'Статус', 'Status'],
  blocked: ['Bloklangan', 'Заблокирован', 'Blocked'],
  active: ['Faol', 'Активен', 'Active'],
  balance: ['Balans', 'Баланс', 'Balance'],
  with_balance: ['Balansi borlar', 'С балансом', 'With balance'],
  sort: ['Saralash', 'Сортировка', 'Sort'],
  s_new: ['Yangilari', 'Новые', 'Newest'],
  s_seen: ['Oxirgi faollik', 'Последняя активность', 'Last seen'],
  s_balance: ["Balans bo'yicha", 'По балансу', 'By balance'],
  last_seen: ['Oxirgi faollik', 'Последний вход', 'Last seen'],
  registered: ["Ro'yxatdan o'tgan", 'Регистрация', 'Registered'],
  open: ['Ochish', 'Открыть', 'Open'],
  new_user: ['Yangi foydalanuvchi', 'Новый пользователь', 'New user'],
  create: ['Yaratish', 'Создать', 'Create'],
  save: ['Saqlash', 'Сохранить', 'Save'],
  cancel: ['Bekor qilish', 'Отмена', 'Cancel'],
  profile: ['Profil', 'Профиль', 'Profile'],
  login_phone: ['Login (telefon)', 'Логин (телефон)', 'Login (phone)'],
  login_hint: ["Login o'zgarsa, foydalanuvchining barcha sessiyalari yopiladi", 'При смене логина все сеансы пользователя будут закрыты', 'Changing the login signs the user out everywhere'],
  admin_note: ["Admin izohi (faqat adminlar ko'radi)", 'Заметка администратора (видят только админы)', 'Admin note (admins only)'],
  set_password: ["Parolni o'rnatish", 'Установить пароль', 'Set password'],
  new_password: ['Yangi parol', 'Новый пароль', 'New password'],
  pw_hint: ['Kamida 8 belgi, harf va raqam', 'Минимум 8 символов, буквы и цифры', 'At least 8 characters, letters and digits'],
  logout_all: ['Barcha qurilmalardan chiqarish', 'Выйти на всех устройствах', 'Sign out everywhere'],
  block: ['Bloklash', 'Заблокировать', 'Block'],
  unblock: ['Blokdan chiqarish', 'Разблокировать', 'Unblock'],
  block_reason: ['Bloklash sababi', 'Причина блокировки', 'Block reason'],
  login_as: ['Uning nomidan kirish', 'Войти как пользователь', 'Log in as user'],
  login_as_q: ["Bu foydalanuvchi nomidan kirasizmi? Harakat jurnalga yoziladi.", 'Войти под этим пользователем? Действие будет записано в журнал.', 'Log in as this user? The action is logged.'],
  delete: ["O'chirish", 'Удалить', 'Delete'],
  delete_q: ["Butunlay o'chirilsinmi? Bu amalni qaytarib bo'lmaydi.", 'Удалить безвозвратно? Это действие нельзя отменить.', 'Delete permanently? This cannot be undone.'],
  send_push: ['Push yuborish', 'Отправить push', 'Send push'],
  topup: ["Balansni to'ldirish", 'Пополнить баланс', 'Top up balance'],
  debit: ['Balansdan yechish', 'Списать с баланса', 'Debit balance'],
  amount: ['Summa', 'Сумма', 'Amount'],
  currency: ['Valyuta', 'Валюта', 'Currency'],
  note: ['Izoh', 'Комментарий', 'Note'],
  kind: ['Turi', 'Тип', 'Type'],
  k_admin_credit: ["To'ldirish", 'Пополнение', 'Credit'],
  k_bonus: ['Bonus', 'Бонус', 'Bonus'],
  k_refund: ['Qaytarish', 'Возврат', 'Refund'],
  wallet_history: ['Balans tarixi', 'История баланса', 'Wallet history'],
  sessions: ['Faol sessiyalar', 'Активные сеансы', 'Active sessions'],
  payments: ["To'lovlar", 'Платежи', 'Payments'],
  activity: ['Faollik', 'Активность', 'Activity'],
  listings_n: ["E'lonlar", 'Объявления', 'Listings'],
  orders_buy: ['Xaridlar', 'Покупки', 'Purchases'],
  orders_sell: ['Sotuvlar', 'Продажи', 'Sales'],
  messages_n: ['Xabarlar', 'Сообщения', 'Messages'],
  reports_against: ['Shikoyatlar', 'Жалобы на него', 'Reports against'],
  push_devices: ['Push qurilmalar', 'Push-устройства', 'Push devices'],
  company: ['Kompaniya', 'Компания', 'Company'],
  owner: ['Egasi', 'Владелец', 'Owner'],
  owner_phone: ['Egasining telefoni (almashtirish)', 'Телефон владельца (смена)', 'Owner phone (transfer)'],
  docs: ['Hujjatlar', 'Документы', 'Documents'],
  missing_docs: ['Majburiy hujjat yuklanmagan', 'Не загружен обязательный документ', 'Required document missing'],
  requisites: ['Rekvizitlar', 'Реквизиты', 'Requisites'],
  legal_form: ['Tashkiliy-huquqiy shakl', 'Организационно-правовая форма', 'Legal form'],
  verify: ['Tasdiqlash', 'Подтвердить', 'Verify'],
  reject: ['Rad etish', 'Отклонить', 'Reject'],
  reject_reason: ['Rad etish sababi', 'Причина отказа', 'Rejection reason'],
  v_pending: ['Tekshiruvda', 'На проверке', 'Pending'],
  v_verified: ['Tasdiqlangan', 'Проверена', 'Verified'],
  v_rejected: ['Rad etilgan', 'Отклонена', 'Rejected'],
  v_none: ['Hujjatsiz', 'Без документов', 'No documents'],
  store: ["Do'konni ochish", 'Открыть магазин', 'Open store'],
  view: ["Ko'rish", 'Смотреть', 'View'],
  approve: ['Tasdiqlash', 'Одобрить', 'Approve'],
  promote: ['Bepul TOP', 'Бесплатный ТОП', 'Free TOP'],
  promote_days: ['Necha kunga TOP', 'На сколько дней в ТОП', 'TOP for how many days'],
  archive: ['Arxivga', 'В архив', 'Archive'],
  restore: ['Faollashtirish', 'Активировать', 'Activate'],
  search: ['Qidirish', 'Найти', 'Search'],
  search_listings: ["Sarlavha yoki ID", 'Заголовок или ID', 'Title or ID'],
  search_orders: ['Raqam, nom yoki telefon', 'Номер, название или телефон', 'Number, title or phone'],
  buyer: ['Xaridor', 'Покупатель', 'Buyer'],
  seller: ['Sotuvchi', 'Продавец', 'Seller'],
  change_status: ["Holatni o'zgartirish", 'Изменить статус', 'Change status'],
  mark_paid: ["To'landi deb belgilash", 'Отметить оплаченным', 'Mark as paid'],
  refund_wallet: ['Hamyonga qaytarish', 'Вернуть на баланс', 'Refund to wallet'],
  wallet_tx: ['Balans operatsiyalari', 'Операции по балансу', 'Wallet transactions'],
  manual_tab: ["Galochka so'rovlari", 'Заявки на галочку', 'Badge requests'],
  manual_hint: ["Foydalanuvchi kartaga pul o'tkazib, «To'ladim» bosgan. Kartangizga pul tushganini tekshiring, so'ng tasdiqlang — galochka darhol yoqiladi", 'Пользователь перевёл деньги на карту и нажал «Я оплатил». Проверьте поступление и подтвердите — галочка включится сразу', 'The user transferred money and pressed “I have paid”. Check your card, then confirm — the badge turns on immediately'],
  manual_claimed: ["To'ladim deb bosgan", 'Отметил «Оплатил»', 'Marked as paid'],
  manual_not_claimed: ["Hali to'lamagan", 'Ещё не оплатил', 'Not paid yet'],
  approve_tick: ['Tasdiqlash — galochka berish', 'Подтвердить — выдать галочку', 'Confirm — grant badge'],
  'donate.enabled': ["Saytga kirganda donat oynasini ko'rsatish", 'Показывать окно доната при входе на сайт', 'Show donation popup on site entry'],
  'donate.card': ['Donat: karta raqami', 'Донат: номер карты', 'Donation: card number'],
  'donate.holder': ['Donat: karta egasi', 'Донат: владелец карты', 'Donation: card holder'],
  'manualPay.card': ["Galochka to'lovi: karta raqami", 'Оплата галочки: номер карты', 'Badge payment: card number'],
  'manualPay.holder': ['Karta egasi (ism familiya)', 'Владелец карты (имя фамилия)', 'Card holder name'],
  'manualPay.info': ["To'lov bo'yicha qo'shimcha izoh", 'Дополнительная инструкция по оплате', 'Extra payment instructions'],
  by_admin: ['admin', 'админ', 'admin'],
  b_title: ['Sarlavha', 'Заголовок', 'Title'],
  b_body: ['Matn', 'Текст', 'Message'],
  b_link: ['Havola (ixtiyoriy)', 'Ссылка (необязательно)', 'Link (optional)'],
  audience: ['Kimga', 'Кому', 'Audience'],
  any: ['Istalgan', 'Любой', 'Any'],
  verified_only: ['Faqat tasdiqlangan kompaniyalar', 'Только проверенные компании', 'Verified companies only'],
  active_days: ['Oxirgi N kunda faol', 'Активны за последние N дней', 'Active in last N days'],
  user_ids: ['Aniq foydalanuvchilar (ID, vergul bilan)', 'Конкретные пользователи (ID через запятую)', 'Specific users (IDs, comma separated)'],
  channels: ['Kanallar', 'Каналы', 'Channels'],
  ch_inapp: ['Saytdagi bildirishnoma', 'Уведомление на сайте', 'In-app notification'],
  ch_push: ['Brauzer push (telefon/kompyuter)', 'Push в браузер (телефон/ПК)', 'Browser push (phone/PC)'],
  ch_telegram: ['Telegram bot', 'Telegram-бот', 'Telegram bot'],
  recipients: ['Qabul qiluvchilar', 'Получателей', 'Recipients'],
  with_push: ['push yoqilgan', 'с push', 'with push'],
  with_tg: ['Telegram ulangan', 'с Telegram', 'with Telegram'],
  send: ['Yuborish', 'Отправить', 'Send'],
  send_q: ['{n} ta foydalanuvchiga yuborilsinmi?', 'Отправить {n} пользователям?', 'Send to {n} users?'],
  sent: ['Yuborildi: {n} ta, push: {p}, Telegram: {t}', 'Отправлено: {n}, push: {p}, Telegram: {t}', 'Sent: {n}, push: {p}, Telegram: {t}'],
  history: ['Tarix', 'История', 'History'],
  preview: ["Ko'rinishi", 'Предпросмотр', 'Preview'],
  host: ['Server', 'Сервер', 'Host'],
  process: ['Jarayon (Node.js)', 'Процесс (Node.js)', 'Process (Node.js)'],
  disk: ['Disk', 'Диск', 'Disk'],
  storage: ['Ma\'lumotlar', 'Данные', 'Storage'],
  db: ['Baza', 'База', 'Database'],
  uploads: ['Yuklangan fayllar', 'Загруженные файлы', 'Uploads'],
  tables: ['Jadvallar', 'Таблицы', 'Tables'],
  last_errors: ['Oxirgi xatolar', 'Последние ошибки', 'Recent errors'],
  no_errors: ["Xatolar yo'q", 'Ошибок нет', 'No errors'],
  backup: ['Bazaning nusxasini yuklab olish', 'Скачать резервную копию БД', 'Download DB backup'],
  cleanup: ['Tozalash', 'Очистка', 'Clean up'],
  auto_refresh: ['Har 5 soniyada yangilanadi', 'Обновляется каждые 5 секунд', 'Refreshes every 5 seconds'],
  integrations: ['Integratsiyalar', 'Интеграции', 'Integrations'],
  on: ['yoqilgan', 'вкл.', 'on'],
  off: ["o'chiq", 'выкл.', 'off'],
  g_prices: ['Narxlar (USD)', 'Цены (USD)', 'Prices (USD)'],
  g_limits: ['Limitlar', 'Лимиты', 'Limits'],
  g_platform: ['Platforma', 'Платформа', 'Platform'],
  g_donate: ['Donat (sayt uchun yordam)', 'Донат (поддержка сайта)', 'Donations'],
  'prices.promo.top': ["TOP paket narxi", 'Цена пакета ТОП', 'TOP package price'],
  'prices.promo.highlight': ['Ajratib ko\'rsatish narxi', 'Цена выделения', 'Highlight price'],
  'prices.promo.combo': ['Kombo paket narxi', 'Цена пакета Комбо', 'Combo package price'],
  'prices.promoDays': ['Reklama muddati (kun)', 'Срок продвижения (дней)', 'Promotion period (days)'],
  'prices.plan.business': ['Biznes tarif (oyiga)', 'Бизнес-тариф (в месяц)', 'Business plan (monthly)'],
  'prices.inspection': ["Texnik ko'rik narxi", 'Цена тех. проверки', 'Inspection price'],
  'prices.badge': ['Tasdiq belgisi (galochka), oyiga', 'Галочка подтверждения, в месяц', 'Verified badge, per month'],
  freeListingLimit: ["Bepul tarifda e'lonlar soni", 'Объявлений на бесплатном тарифе', 'Free plan listing limit'],
  businessTopCredits: ['Biznes tarifda TOP kreditlar', 'ТОП-кредитов в бизнес-тарифе', 'Business plan TOP credits'],
  escrowFeePct: ['Xavfsiz bitim komissiyasi, %', 'Комиссия безопасной сделки, %', 'Escrow fee, %'],
  autoApproveVerified: ["Tasdiqlangan kompaniyalar e'lonlari moderatsiyasiz", 'Объявления проверенных компаний без модерации', 'Auto-approve verified companies'],
  registrationOpen: ["Ro'yxatdan o'tish ochiq", 'Регистрация открыта', 'Registration open'],
  requireCompanyDocs: ['Kompaniyalardan guvohnoma talab qilish', 'Требовать свидетельство от компаний', 'Require company certificate'],
  announcement: ["Saytdagi e'lon banneri (bo'sh — ko'rinmaydi)", 'Баннер-объявление на сайте (пусто — скрыт)', 'Site announcement banner (empty = hidden)'],
  announcementType: ['Banner turi', 'Тип баннера', 'Banner type'],
  supportPhone: ["Qo'llab-quvvatlash telefoni", 'Телефон поддержки', 'Support phone'],
  supportTelegram: ["Qo'llab-quvvatlash Telegram", 'Telegram поддержки', 'Support Telegram'],
  my_account: ['Mening admin akkauntim', 'Мой аккаунт администратора', 'My admin account'],
  my_account_hint: ["Bu yerda o'z loginingiz (telefon) va parolingizni o'zgartirasiz", 'Здесь можно сменить свой логин (телефон) и пароль', 'Change your own login (phone) and password here'],
  rates: ['Valyuta kurslari', 'Курсы валют', 'Exchange rates'],
  action: ['Harakat', 'Действие', 'Action'],
  target: ['Obyekt', 'Объект', 'Target'],
  details: ['Tafsilotlar', 'Детали', 'Details'],
  when: ['Vaqt', 'Время', 'When'],
  who: ['Kim', 'Кто', 'Who'],
  imp_bar: ['Siz {name} nomidan kirgansiz', 'Вы вошли как {name}', 'You are logged in as {name}'],
  imp_back: ['Admin panelga qaytish', 'Вернуться в админ-панель', 'Back to admin'],
  no_access: ["Bu bo'lim faqat platforma administratorlari uchun", 'Раздел доступен только администраторам платформы', 'Administrators only'],
  empty: ["Hech narsa yo'q", 'Ничего нет', 'Nothing here'],
  saved: ['Saqlandi', 'Сохранено', 'Saved'],
  total: ['Jami', 'Всего', 'Total'],
  quick: ['Tezkor amallar', 'Быстрые действия', 'Quick actions'],
  q_topup: ["Balansni to'ldirish", 'Пополнить баланс', 'Top up balance'],
  q_push: ['Push xabar yuborish', 'Отправить push', 'Send push'],
  q_users: ['Foydalanuvchilarni boshqarish', 'Управление пользователями', 'Manage users'],
  q_server: ['Server holati', 'Состояние сервера', 'Server status'],
  find_user: ['Telefon, ism yoki ID', 'Телефон, имя или ID', 'Phone, name or ID'],
  pick_user: ['Foydalanuvchini tanlang', 'Выберите пользователя', 'Choose a user'],
  disk_used: ['Band', 'Занято', 'Used'],
  disk_free: ["Bo'sh", 'Свободно', 'Free'],
  disk_total: ['Jami', 'Всего', 'Total'],
  nav_banners: ['Reklama bannerlari', 'Рекламные баннеры', 'Ad banners'],
  ban_hint: ["Bosh sahifadagi karusel: har 5 soniyada keyingi bannerga o'tadi. Matnni bo'sh qoldirsangiz, standart matn 10 tilda ko'rsatiladi.", 'Карусель на главной: каждые 5 секунд переключается на следующий баннер. Если оставить текст пустым, покажется стандартный текст на 10 языках.', 'Home page carousel: switches to the next banner every 5 seconds. Leave text empty to show the default text in 10 languages.'],
  ban_title: ['Sarlavha', 'Заголовок', 'Title'],
  ban_text: ['Matn', 'Текст', 'Text'],
  ban_cta: ['Tugma matni', 'Текст кнопки', 'Button text'],
  ban_link: ['Havola', 'Ссылка', 'Link'],
  ban_theme: ['Rang', 'Цвет', 'Colour'],
  ban_image: ['Rasm', 'Изображение', 'Image'],
  ban_add: ["Banner qo'shish", 'Добавить баннер', 'Add banner'],
  ban_active: ["Ko'rinadi", 'Показывается', 'Visible'],
  ban_hidden: ['Yashirilgan', 'Скрыт', 'Hidden'],
  ban_rm_q: ["Bannerni o'chirasizmi?", 'Удалить баннер?', 'Delete this banner?'],
  th_yellow: ['Sariq', 'Жёлтый', 'Yellow'],
  th_navy: ["To'q ko'k", 'Тёмно-синий', 'Navy'],
  th_blue: ["Ko'k", 'Синий', 'Blue'],
  th_dark: ['Qora', 'Чёрный', 'Black'],
  bad_link: ["\"{v}\" sahifasi saytda yo'q. Ro'yxatdan sahifa tanlang yoki https:// bilan to'liq manzil yozing", 'Страницы «{v}» нет на сайте. Выберите страницу из списка или укажите полный адрес с https://', 'Page "{v}" does not exist. Pick a page from the list or enter a full https:// address'],
  nav_tiers: ['VIP / GOLD / PREMIUM', 'VIP / GOLD / PREMIUM', 'VIP / GOLD / PREMIUM'],
  nav_promos: ['Mavsumiy aksiyalar', 'Сезонные акции', 'Seasonal promos'],
  promos_hint: ["Aksiya har yili belgilangan sanalar oralig'ida avtomatik yonadi. Sotuvchilar e'lonlarini o'zi qo'shib, chegirma qo'yadi.", 'Акция включается автоматически каждый год в заданные даты. Продавцы сами добавляют объявления и ставят скидку.', 'A promo turns on automatically every year between the set dates. Sellers add their listings and set a discount.'],
  promo_new: ['Yangi aksiya', 'Новая акция', 'New promo'],
  promo_name: ['Nomi', 'Название', 'Name'],
  promo_sub: ['Qisqa tavsif', 'Короткое описание', 'Short description'],
  promo_theme: ['Rang', 'Цвет', 'Color'],
  promo_cats: ['Kategoriyalar (hech biri = hammasi)', 'Категории (ничего = все)', 'Categories (none = all)'],
  promo_max: ['"… gacha" chegirma, %', 'Скидка «до …», %', '"Up to" discount, %'],
  promo_from: ['Boshlanishi (OO-KK)', 'Начало (ММ-ДД)', 'Start (MM-DD)'],
  promo_to: ['Tugashi (OO-KK)', 'Конец (ММ-ДД)', 'End (MM-DD)'],
  promo_dates_hint: ["Masalan 03-15 va 11-15. Ikkalasi bo'sh — doim faol.", 'Например 03-15 и 11-15. Оба пустые — всегда активна.', 'E.g. 03-15 and 11-15. Both empty — always on.'],
  promo_live: ['Hozir faol', 'Сейчас активна', 'Live now'],
  promo_off: ['Mavsum emas', 'Не сезон', 'Off season'],
  promo_disabled: ["O'chirilgan", 'Выключена', 'Disabled'],
  promo_enabled: ['Yoqilgan', 'Включена', 'Enabled'],
  promo_listings: ["Aksiyadagi e'lonlar", 'Объявлений в акции', 'Listings in promo'],
  promo_open: ['Sahifani ochish', 'Открыть страницу', 'Open page'],
  promo_edit: ['Tahrirlash', 'Редактировать', 'Edit'],
  promo_seller: ['Sotuvchi aksiyasi', 'Акция продавца', 'Seller deal'],
  promo_pending: ['Tekshiruvda', 'На проверке', 'Pending'],
  promo_rejected: ['Rad etilgan', 'Отклонена', 'Rejected'],
  promo_approve: ['Tasdiqlash', 'Одобрить', 'Approve'],
  promo_reject: ['Rad etish', 'Отклонить', 'Reject'],
  promo_reason: ['Rad etish sababi', 'Причина отказа', 'Reason'],
  promo_del_q: ["Aksiya o'chirilsinmi? E'lonlardagi chegirmalar ham olib tashlanadi.", 'Удалить акцию? Скидки в объявлениях тоже снимутся.', 'Delete the promo? Listing discounts will be removed too.'],
  nav_support: ['Murojaatlar', 'Обращения', 'Support requests'],
  nav_integrations: ['Integratsiyalar', 'Интеграции', 'Integrations'],
  nav_pages: ['Sahifalar', 'Страницы', 'Pages'],
  r_moderator: ['Moderator', 'Модератор', 'Moderator'],
  q_support: ['Yangi murojaatlar', 'Новые обращения', 'New requests'],
  q_tiers: ['VIP narxlari', 'Цены VIP', 'VIP prices'],
  price: ['Narx', 'Цена', 'Price'],
  price_currency: ['Narxlar valyutasi', 'Валюта цен', 'Price currency'],
  tiers_hint: ["Narxlar tanlangan valyutada (masalan so'mda) aniq saqlanadi — kurs o'zgarsa ham o'zgarmaydi. Boshqa valyutadagi foydalanuvchiga kurs bo'yicha ko'rsatiladi. Moderator va admin o'zgartira oladi.", 'Цены хранятся точно в выбранной валюте (например в сумах) и не меняются при изменении курса. Пользователям в другой валюте показываются по курсу. Менять могут модератор и администратор.', 'Prices are stored exactly in the chosen currency (e.g. UZS) and do not change with the exchange rate. Other currencies are shown at the current rate. Moderators and admins can change them.'],
  tiers_hint_old: ["Narxlar USD da saqlanadi va to'lovda foydalanuvchi valyutasiga o'giriladi (Click/Payme — so'mda). Moderator va admin o'zgartira oladi.", 'Цены хранятся в USD и при оплате пересчитываются в валюту пользователя (Click/Payme — в сумах). Менять могут модератор и администратор.', 'Prices are stored in USD and converted to the user currency at payment (Click/Payme in UZS). Moderators and admins can change them.'],
  price_usd: ['Narx, USD', 'Цена, USD', 'Price, USD'],
  days: ['Muddat, kun', 'Срок, дней', 'Period, days'],
  active_now: ['Hozir faol', 'Сейчас активно', 'Active now'],
  sold_30d: ['30 kunda sotildi', 'Продано за 30 дней', 'Sold in 30 days'],
  tier_listings: ["Daraja berilgan e'lonlar", 'Объявления с уровнем', 'Listings with a level'],
  set_tier: ['Daraja berish', 'Назначить уровень', 'Assign level'],
  tier_none: ['Darajani olib tashlash', 'Снять уровень', 'Remove level'],
  until: ['gacha', 'до', 'until'],
  t_question: ['Savol', 'Вопрос', 'Question'], t_payment: ["To'lov", 'Оплата', 'Payment'], t_listing: ["E'lon", 'Объявление', 'Listing'], t_complaint: ['Shikoyat', 'Жалоба', 'Complaint'], t_ads: ['Reklama', 'Реклама', 'Advertising'], t_other: ['Boshqa', 'Другое', 'Other'],
  s_new_t: ['Yangi', 'Новые', 'New'], s_answered: ['Javob berilgan', 'Отвечено', 'Answered'], s_closed: ['Yopilgan', 'Закрыто', 'Closed'],
  reply: ['Javob', 'Ответ', 'Reply'],
  send_reply: ['Javob yuborish', 'Отправить ответ', 'Send reply'],
  reply_sms: ['SMS orqali ham yuborish', 'Также отправить по SMS', 'Also send by SMS'],
  close_ticket: ['Yopish', 'Закрыть', 'Close'],
  guest: ["Ro'yxatdan o'tmagan", 'Гость', 'Guest'],
  int_hint: ["Kalitlar shifrlangan holda ko'rsatilmaydi: o'zgartirish uchun yangisini yozing, bo'sh qoldirsangiz — eskisi qoladi.", 'Секретные ключи не показываются: чтобы изменить, введите новый; пустое поле оставит прежний.', 'Secret keys are never shown: type a new one to change it, leave empty to keep the current one.'],
  int_site: ['Sayt manzili', 'Адрес сайта', 'Site address'],
  int_site_hint: ["To'lov tizimlari qaytaradigan va push uchun manzil, masalan https://hemu.uz", 'Адрес для возврата из платёжных систем и push, например https://hemu.uz', 'Used for payment return URLs and push, e.g. https://hemu.uz'],
  int_sms: ['SMS — Eskiz.uz', 'SMS — Eskiz.uz', 'SMS — Eskiz.uz'],
  int_maps: ['Xarita — Yandex Maps', 'Карта — Яндекс Карты', 'Map — Yandex Maps'],
  int_maps_hint: ["Kalitni developer.tech.yandex.ru kabinetida oling (\"JavaScript API va HTTP Geokoder\") va sayt domenini kalitga qo'shing. Kalit bo'lmasa ham xarita ochiladi, lekin Yandex cheklashi mumkin.", 'Ключ получите в кабинете developer.tech.yandex.ru («JavaScript API и HTTP Геокодер») и добавьте домен сайта в настройки ключа. Без ключа карта откроется, но Яндекс может её ограничить.', 'Get a key at developer.tech.yandex.ru ("JavaScript API and HTTP Geocoder") and add your site domain to it. Without a key the map still opens, but Yandex may limit it.'],
  mapProvider: ['Xarita xizmati', 'Сервис карт', 'Map provider'],
  int_seo: ['SEO — Google va Yandex', 'SEO — Google и Яндекс', 'SEO — Google and Yandex'],
  int_seo_hint: ["Google Search Console va Yandex Vebmaster'da saytni qo'shing, \"HTML-teg\" usulini tanlang va berilgan kodni (yoki butun <meta> tegini) shu yerga qo'ying. Saqlagach, u yerda \"Tasdiqlash\" ni bosing va sitemap.xml ni yuboring. Yandex va Bing'ga yangi e'lonlar avtomatik yuboriladi (IndexNow).", 'Добавьте сайт в Google Search Console и Яндекс Вебмастер, выберите способ «HTML-тег» и вставьте сюда код (или весь тег <meta>). После сохранения нажмите там «Подтвердить» и отправьте sitemap.xml. Яндекс и Bing получают новые объявления автоматически (IndexNow).', 'Add the site in Google Search Console and Yandex Webmaster, choose the "HTML tag" method and paste the code (or the whole <meta> tag) here. After saving, click "Verify" there and submit sitemap.xml. Yandex and Bing get new listings automatically (IndexNow).'],
  googleVerification: ['Google tasdiqlash kodi', 'Код подтверждения Google', 'Google verification code'],
  yandexVerification: ['Yandex tasdiqlash kodi', 'Код подтверждения Яндекс', 'Yandex verification code'],
  yandexMapsKey: ['Yandex Maps API kaliti', 'API-ключ Яндекс Карт', 'Yandex Maps API key'],
  mp_yandex: ['Yandex Maps', 'Яндекс Карты', 'Yandex Maps'],
  mp_osm: ['OpenStreetMap', 'OpenStreetMap', 'OpenStreetMap'],
  int_sms_hint: ["notify.eskiz.uz kabinetidagi email va parol. Eskiz faqat +998 raqamlarga yuboradi. Yangi hisobda faqat tasdiqlangan shablon matnlari ketadi — \"HEMU.UZ kodi: …\" shablonini Eskizda tasdiqlating.", 'Email и пароль от кабинета notify.eskiz.uz. Eskiz отправляет только на номера +998. На новом аккаунте уходят только одобренные шаблоны — утвердите в Eskiz шаблон «Код HEMU.UZ: …».', 'Email and password of your notify.eskiz.uz account. Eskiz sends to +998 numbers only. New accounts can only send approved templates — get the "HEMU.UZ code: …" template approved in Eskiz.'],
  smsProvider: ['SMS provayder', 'SMS-провайдер', 'SMS provider'],
  int_mail: ['Email — Gmail / SMTP', 'Email — Gmail / SMTP', 'Email — Gmail / SMTP'],
  int_mail_hint: ["Ro'yxatdan o'tishda tasdiqlash kodi shu pochta orqali yuboriladi. Gmail: server smtp.gmail.com, port 465, login — to'liq Gmail manzil, parol — Google hisobidagi 16 belgili \"Ilova paroli\" (App password; avval 2 bosqichli tasdiqlashni yoqing). Oddiy Gmail paroli ishlamaydi.", 'Через эту почту при регистрации отправляется код подтверждения. Gmail: сервер smtp.gmail.com, порт 465, логин — полный адрес Gmail, пароль — 16-значный «Пароль приложения» из аккаунта Google (App password; сначала включите двухэтапную аутентификацию). Обычный пароль Gmail не подойдёт.', 'The sign-up verification code is sent from this mailbox. Gmail: server smtp.gmail.com, port 465, login — full Gmail address, password — the 16-character Google "App password" (enable 2-Step Verification first). Your normal Gmail password will not work.'],
  mailProvider: ['Email yuborish', 'Отправка email', 'Email sending'],
  mp_off: ["O'chiq", 'Выключено', 'Off'],
  mp_smtp: ['SMTP (Gmail va boshqalar)', 'SMTP (Gmail и др.)', 'SMTP (Gmail etc.)'],
  'smtp.host': ['SMTP server', 'SMTP-сервер', 'SMTP server'],
  'smtp.port': ['Port (465 — SSL, 587 — STARTTLS)', 'Порт (465 — SSL, 587 — STARTTLS)', 'Port (465 — SSL, 587 — STARTTLS)'],
  'smtp.user': ['Login (Gmail manzil)', 'Логин (адрес Gmail)', 'Login (Gmail address)'],
  'smtp.pass': ['Ilova paroli (App password)', 'Пароль приложения (App password)', 'App password'],
  'smtp.from': ["Jo'natuvchi nomi", 'Имя отправителя', 'Sender name'],
  test_mail: ['Sinov xati', 'Тестовое письмо', 'Test email'],
  sp_log: ["Sinov (SMS yuborilmaydi)", 'Тест (SMS не отправляются)', 'Test (no SMS sent)'],
  sp_eskiz: ['Eskiz.uz', 'Eskiz.uz', 'Eskiz.uz'],
  'eskiz.email': ['Eskiz email', 'Email Eskiz', 'Eskiz email'],
  'eskiz.password': ['Eskiz parol / secret key', 'Пароль / secret key Eskiz', 'Eskiz password / secret key'],
  'eskiz.from': ["Jo'natuvchi nomi (nickname)", 'Имя отправителя (nickname)', 'Sender name (nickname)'],
  otpDevEcho: ["Sinov rejimi: SMS-kod ekranga chiqsin", 'Тестовый режим: показывать SMS-код на экране', 'Test mode: show SMS code on screen'],
  otp_warn: ["Serverda bu rejim yoqilgan bo'lsa, istalgan kishi istalgan hisobga SMS-kod bilan kira oladi. Haqiqiy saytda o'chiring!", 'Если это включено на сервере, кто угодно войдёт в любой аккаунт по SMS-коду. На боевом сайте выключите!', 'If enabled on a live server, anyone can sign in to any account with the SMS code. Turn it off in production!'],
  adminTwoFactor: ["Admin va moderator kirishida SMS-kod so'ralsin", 'Запрашивать SMS-код при входе админа и модератора', 'Require an SMS code for admin and moderator sign-in'],
  int_pay: ["To'lov tizimlari", 'Платёжные системы', 'Payment systems'],
  paymentsDev: ["Sinov to'lovi (pulsiz \"To'lash\" tugmasi)", 'Тестовая оплата (кнопка «Оплатить» без денег)', 'Test payment ("Pay" button without money)'],
  pay_warn: ["Haqiqiy saytda o'chiring — aks holda istalgan kishi VIP ni bepul oladi.", 'На боевом сайте выключите — иначе любой получит VIP бесплатно.', 'Turn off in production — otherwise anyone gets VIP for free.'],
  'click.serviceId': ['Click service_id', 'Click service_id', 'Click service_id'],
  'click.merchantId': ['Click merchant_id', 'Click merchant_id', 'Click merchant_id'],
  'click.merchantUserId': ['Click merchant_user_id', 'Click merchant_user_id', 'Click merchant_user_id'],
  'click.secretKey': ['Click secret_key', 'Click secret_key', 'Click secret_key'],
  'payme.merchantId': ['Payme merchant ID (kassa ID)', 'Payme merchant ID (ID кассы)', 'Payme merchant ID'],
  'payme.key': ['Payme kalit (key)', 'Ключ Payme (key)', 'Payme key'],
  'payme.testMode': ['Payme sinov kassasi (checkout.test.paycom.uz)', 'Тестовая касса Payme (checkout.test.paycom.uz)', 'Payme test cashbox (checkout.test.paycom.uz)'],
  callbacks: ["Kabinetga kiritiladigan manzillar", 'Адреса для кабинета', 'URLs for the merchant cabinet'],
  cb_click: ['Click: Prepare / Complete URL', 'Click: Prepare / Complete URL', 'Click: Prepare / Complete URL'],
  cb_payme: ['Payme: Endpoint URL', 'Payme: Endpoint URL', 'Payme: Endpoint URL'],
  https_warn: ["Click va Payme faqat HTTPS manzilga so'rov yuboradi", 'Click и Payme обращаются только к HTTPS-адресу', 'Click and Payme only call HTTPS addresses'],
  ready: ['Ulangan', 'Подключено', 'Connected'],
  not_ready: ['Ulanmagan', 'Не подключено', 'Not connected'],
  test_sms: ['Test SMS yuborish', 'Отправить тестовое SMS', 'Send test SMS'],
  sms_balance: ['Eskiz balansi', 'Баланс Eskiz', 'Eskiz balance'],
  sms_log: ['Oxirgi SMS lar', 'Последние SMS', 'Recent SMS'],
  copy: ['Nusxa olish', 'Копировать', 'Copy'],
  copied: ['Nusxa olindi', 'Скопировано', 'Copied'],
  pg_terms: ['Ommaviy oferta', 'Публичная оферта', 'Terms (offer)'],
  pg_privacy: ['Maxfiylik siyosati', 'Политика конфиденциальности', 'Privacy policy'],
  pg_faq: ["Savol-javoblar (Bog'lanish sahifasi)", 'Вопросы и ответы (страница «Контакты»)', 'FAQ (Contact page)'],
  pg_hint: ["Format: \"## Sarlavha\", oddiy xatboshi, \"- \" bilan ro'yxat. {company}, {tin}, {address}, {phone}, {email}, {site} — rekvizitlar bilan almashtiriladi. Matnni bo'shatib saqlasangiz — standart shablon qaytadi. Rasmiy hujjatni yurist bilan tekshiring.", 'Формат: «## Заголовок», абзацы, список через «- ». {company}, {tin}, {address}, {phone}, {email}, {site} заменяются реквизитами. Пустой текст вернёт стандартный шаблон. Юридический текст согласуйте с юристом.', 'Format: "## Heading", paragraphs, "- " list. {company}, {tin}, {address}, {phone}, {email}, {site} are replaced with your details. Saving empty text restores the default template. Have a lawyer review it.'],
  legal_req: ['Rekvizitlar va kontaktlar', 'Реквизиты и контакты', 'Company details and contacts'],
  legalName: ['Kompaniya nomi', 'Название компании', 'Company name'],
  legalTin: ['STIR (INN)', 'ИНН', 'TIN'],
  legalAddress: ['Yuridik manzil', 'Юридический адрес', 'Legal address'],
  supportEmail: ["Qo'llab-quvvatlash e-mail", 'E-mail поддержки', 'Support e-mail'],
  custom: ["O'zgartirilgan", 'Изменено', 'Edited'],
  default_tpl: ['Standart shablon', 'Стандартный шаблон', 'Default template'],
  open_page: ["Sahifani ochish", 'Открыть страницу', 'Open page'],
  views: ["Ko'rishlar", 'Показы', 'Views'],
  clicks: ['Bosishlar', 'Клики', 'Clicks'],
  ctr: ['CTR', 'CTR', 'CTR'],
  stats_30d: ['30 kun', '30 дней', '30 days'],
  g_bonus: ["Ro'yxatdan o'tish bonusi", 'Бонус за регистрацию', 'Sign-up bonus'],
  'welcomeBonus.enabled': ["Yangi foydalanuvchiga avtomatik bonus berilsin", 'Начислять бонус новым пользователям', 'Give new users a bonus automatically'],
  'welcomeBonus.amount': ['Bonus summasi', 'Сумма бонуса', 'Bonus amount'],
  'welcomeBonus.currency': ['Bonus valyutasi', 'Валюта бонуса', 'Bonus currency'],
  top_prices: ["TOP paketlari — oddiy foydalanuvchilar uchun (OLX kabi)", 'Пакеты ТОП — для обычных пользователей (как на OLX)', 'TOP packages — for regular users (like OLX)'],
  biz_prices: ['VIP / GOLD / PREMIUM — faqat kompaniyalar (MChJ, YaTT)', 'VIP / GOLD / PREMIUM — только компании (ООО, ИП)', 'VIP / GOLD / PREMIUM — companies only'],
  promo_days_all: ['TOP muddati (kun)', 'Срок ТОП (дней)', 'TOP period (days)'],
  otpTestRegistration: ["Test ro'yxatdan o'tish: yangi raqamga SMS-kod ekranda ko'rsatilsin", 'Тестовая регистрация: показывать SMS-код на экране для новых номеров', 'Test sign-up: show the SMS code on screen for new numbers'],
  otp_reg_hint: ["Eskiz ulanmaguncha shu yoqiq tursin. Mavjud hisoblarga kirishda kod ko'rsatilmaydi — xavfsiz.", 'Держите включённым, пока не подключён Eskiz. Для входа в существующие аккаунты код не показывается — безопасно.', 'Keep on until Eskiz is connected. Codes are never shown for existing accounts, so it is safe.'],
  nav_freight: ['Fura logistika', 'Грузоперевозки фурами', 'Truck freight'],
  fr_open: ['Ochiq', 'Открытые', 'Open'],
  fr_closed: ['Yopilgan', 'Закрытые', 'Closed'],
  fr_del_q: ["E'lonni o'chirasizmi?", 'Удалить объявление?', 'Delete this post?'],
  login_or_phone: ['Login yoki telefon', 'Логин или телефон', 'Login or phone'],
  username: ['Login (telefon o\'rniga)', 'Логин (вместо телефона)', 'Login (instead of phone)'],
  admin_login: ['Admin panelga kirish', 'Вход в админ-панель', 'Admin sign in'],
};
const LIDX = { uz: 0, en: 2, prs: 2, ps: 2 };
export function a(k, p) {
  const row = D[k];
  if (!row) return k;
  let s = row[LIDX[state.lang] ?? 1];
  if (p) s = s.replace(/\{(\w+)\}/g, (_, x) => (p[x] ?? ''));
  return s;
}

const NAV = [
  ['overview', 'dash', '/admin'], ['users', 'user', '/admin/users'], ['companies', 'building', '/admin/companies'],
  ['listings', 'list', '/admin/listings'], ['orders', 'box', '/admin/orders'], ['finance', 'card', '/admin/finance'],
  ['tiers', 'star', '/admin/tiers'], ['promos', 'target', '/admin/promos'], ['freight', 'truck', '/admin/freight'], ['broadcast', 'bell', '/admin/broadcast'], ['banners', 'image', '/admin/banners'], ['support', 'inbox', '/admin/support'], ['trust', 'shield', '/admin/trust'],
  ['pages', 'file', '/admin/pages'], ['integrations', 'globe', '/admin/integrations'], ['system', 'chart', '/admin/system'],
  ['settings', 'gear', '/admin/settings'], ['log', 'list', '/admin/log'],
];
// Moderator ko'radigan bo'limlar
const MOD_SECTIONS = ['overview', 'listings', 'companies', 'tiers', 'promos', 'support', 'trust', 'freight'];
const isAdmin = () => state.user?.role === 'admin';
const allowed = (k) => isAdmin() || MOD_SECTIONS.includes(k);
const ACCOUNT_TYPES = ['client', 'company', 'mechanic', 'driver'];
// Push va bannerlar uchun tayyor sahifalar ro'yxati
const PAGES = [['/', 'nav_home'], ['/catalog', 'catalog'], ['/categories', 'all_categories'], ['/feed', 'feed_title'], ['/plans', 'plans_link'], ['/create', 'post_listing'], ['/request/new', 'create_request'], ['/business', 'for_business'], ['/about', 'about'], ['/about#safe', 'safe_deals'], ['/my/orders', 'my_orders'], ['/my/listings', 'my_listings'], ['/favorites', 'nav_fav'], ['/messages', 'nav_msgs'], ['/payments', 'wallet'], ['/catalog?category=special', ''], ['/catalog?category=parts', ''], ['/transportsale', ''], ['/transportrental', ''], ['/sparepart', ''], ['/mechanic', ''], ['/driver', '']];
const pagesList = () => `<datalist id="adm-pages">${PAGES.map(([p, k]) => `<option value="${p}">${k ? esc(t(k)) : ''}</option>`).join('')}</datalist>`;
// Havola bo'sh, to'liq https manzil yoki saytdagi mavjud sahifa bo'lishi kerak
const linkOk = (v) => !v || /^https:\/\//.test(v) || routeExists(v);
function checkLink(input) {
  const ok = linkOk(input.value.trim());
  input.classList.toggle('err', !ok);
  if (!ok) { toast(a('bad_link', { v: input.value.trim() }), 'err'); input.focus(); }
  return ok;
}
const refresh = () => render({ keepScroll: true });
const nav = (path, q) => { history.pushState(null, '', `${path}${qs(q)}`); refresh(); };

function shell(active, title, sub, content, actions = '') {
  const q = state.adminQueue || {};
  const badge = { listings: q.moderation, companies: q.companies, trust: (q.reports || 0) + (q.disputes || 0), support: q.support };
  return `<div class="adm">
    <aside class="adm-side">
      <div class="adm-brand">${LOGO}<span>${esc(a(isAdmin() ? 'admin' : 'r_moderator'))} · ${esc(state.user.name || state.user.phone)}</span></div>
      <nav>${NAV.filter(([k]) => allowed(k)).map(([k, ic, href]) => `<a href="${href}" class="${active === k ? 'on' : ''}">${icon(ic)}<span>${esc(a(`nav_${k}`))}</span>${badge[k] ? `<i>${badge[k]}</i>` : ''}</a>`).join('')}</nav>
      <a class="adm-back" href="/">${icon('home')} ${esc(a('to_site'))}</a>
    </aside>
    <div class="adm-main">
      <div class="adm-top">
        <a href="/admin" class="adm-top-logo">${LOGO}</a>
        <select class="input" data-lang aria-label="${esc(t('language'))}">${state.meta.languages.map((l) => `<option value="${l.code}" ${l.code === state.lang ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select>
        ${themeButton('btn btn-soft btn-sm')}
        <a class="btn btn-soft btn-sm" href="/">${icon('home')} <span>${esc(a('to_site'))}</span></a>
        <button class="btn btn-soft btn-sm" data-logout>${icon('logout')} <span>${esc(t('logout'))}</span></button>
      </div>
      <div class="adm-head"><div><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${actions ? `<div class="adm-actions">${actions}</div>` : ''}</div>
      ${content}
    </div>
  </div>`;
}

// ---------- Kichik yordamchilar ----------
const bytes = (n) => {
  if (!n && n !== 0) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
};
const dur = (s) => {
  const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600); const m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${Math.floor(s % 60)}s`;
};
const usd = (n) => `$${num(Math.round(n * 100) / 100)}`;
const typeLabel = (x) => t(`type_${x}`);
const vTag = (v) => `<span class="tag ${{ verified: 'green', pending: 'orange', rejected: 'red' }[v] || 'grey'}">${esc(a(`v_${v}`))}</span>`;
const ago = (s) => (s ? fmtRel(s) : '—');
const sel = (name, opts, val, any = true) => `<select class="input" name="${name}">${any ? `<option value="">${esc(a('all'))}</option>` : ''}${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(val ?? '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const countries = () => state.meta.countries.map((c) => [c.code, c.name]);
const field = (label, inner, cls = '') => `<div class="${cls}"><label class="lbl">${esc(label)}</label>${inner}</div>`;
const inp = (name, v, attrs = '') => `<input class="input" name="${name}" value="${esc(v ?? '')}" ${attrs}>`;
const pager = (p, path, query) => (p.pages > 1 ? `<div class="adm-pager">${p.page > 1 ? `<a class="btn btn-soft btn-sm" href="${path}${qs({ ...query, page: p.page - 1 })}">‹</a>` : ''}<span>${p.page} / ${p.pages} · ${esc(a('total'))} ${num(p.total)}</span>${p.page < p.pages ? `<a class="btn btn-soft btn-sm" href="${path}${qs({ ...query, page: p.page + 1 })}">›</a>` : ''}</div>` : `<div class="adm-pager"><span>${esc(a('total'))} ${num(p.total ?? 0)}</span></div>`);

// Ustunli diagramma (SVG)
function bars(series, { color = 'var(--blue)', h = 120, fmt = num } = {}) {
  const max = Math.max(1, ...series.map((x) => x.n));
  const w = 100 / series.length;
  return `<svg class="adm-chart" viewBox="0 0 100 ${h}" preserveAspectRatio="none" style="height:${h}px">${series.map((x, i) => {
    const bh = (x.n / max) * (h - 4);
    return `<rect x="${i * w + w * 0.15}" y="${h - bh}" width="${w * 0.7}" height="${Math.max(bh, x.n ? 1 : 0.5)}" rx="0.6" fill="${x.n ? color : 'var(--line)'}"><title>${esc(fmtDate(x.day))}: ${esc(fmt(x.n))}</title></rect>`;
  }).join('')}</svg>`;
}
// Chiziqli grafik: bir nechta qator
function lines(rows, keys, { h = 120, max = null } = {}) {
  if (!rows.length) return `<div class="empty">—</div>`;
  const top = max ?? Math.max(1, ...rows.flatMap((r) => keys.map(([k]) => r[k] || 0)));
  const x = (i) => (rows.length === 1 ? 50 : (i / (rows.length - 1)) * 100);
  const y = (v) => h - 2 - ((v || 0) / top) * (h - 6);
  return `<svg class="adm-chart" viewBox="0 0 100 ${h}" preserveAspectRatio="none" style="height:${h}px">
    ${[0.25, 0.5, 0.75].map((g) => `<line x1="0" x2="100" y1="${h * g}" y2="${h * g}" stroke="var(--line)" stroke-width="0.3"/>`).join('')}
    ${keys.map(([k, color, fill]) => `${fill ? `<path d="M0,${h} ${rows.map((r, i) => `L${x(i)},${y(r[k])}`).join(' ')} L100,${h} Z" fill="${color}" opacity=".12"/>` : ''}<polyline fill="none" stroke="${color}" stroke-width="1.4" vector-effect="non-scaling-stroke" points="${rows.map((r, i) => `${x(i)},${y(r[k])}`).join(' ')}"/>`).join('')}
  </svg>`;
}
const diskText = (dk) => `${esc(a('disk_used'))}: ${bytes(dk.total - dk.free)} · ${esc(a('disk_free'))}: ${bytes(dk.free)}<br>${esc(a('disk_total'))}: ${bytes(dk.total)}`;
const gauge = (pct, label, sub) => {
  const p = Math.max(0, Math.min(100, pct || 0));
  const color = p > 85 ? 'var(--red)' : p > 60 ? 'var(--yellow-h)' : 'var(--teal)';
  return `<div class="adm-gauge"><div class="ring" style="--p:${p};--c:${color}"><b>${Math.round(p)}%</b></div><div><b>${esc(label)}</b><span>${sub}</span></div></div>`;
};

async function loadQueue() {
  try { state.adminQueue = (await api('/admin/overview', { silent: true })).queue; } catch { /* e'tiborsiz */ }
}

// =====================================================================
export async function adminPage({ params, query }) {
  const gate = (inner) => `<div class="adm-gate"><div class="adm-top-logo">${LOGO}</div><h2>${esc(a('admin'))}</h2>${inner}</div>`;
  if (!state.user) {
    return {
      title: a('admin'),
      html: gate(`<form class="adm-login" data-al>
        <label class="lbl">${esc(a('login_or_phone'))}</label><input class="input" name="login" autocomplete="username" required autofocus>
        <label class="lbl" style="margin-top:10px">${esc(t('password'))}</label><input class="input" name="password" type="password" autocomplete="current-password" required>
        <div data-al-code hidden style="margin-top:10px"><label class="lbl">${esc(t('two_factor_title'))}</label><input class="input" name="code" inputmode="numeric" maxlength="6"><p class="tiny muted" data-al-dev></p></div>
        <button class="btn btn-primary btn-block" style="margin-top:14px">${esc(a('admin_login'))}</button>
      </form>`),
      mount(main) {
        const fm = $('[data-al]', main);
        fm.onsubmit = async (e) => {
          e.preventDefault();
          const box = $('[data-al-code]', fm);
          const r = await api('/auth/login', { method: 'POST', body: { login: fm.login.value.trim(), password: fm.password.value, code: box.hidden ? undefined : fm.code.value.trim() } });
          if (r.two_factor) {
            box.hidden = false;
            if (r.dev_code) { fm.code.value = r.dev_code; $('[data-al-dev]', fm).textContent = t('dev_code', { c: r.dev_code }); }
            fm.code.focus();
            return;
          }
          setToken(r.token);
          state.user = r.user;
          window.dispatchEvent(new Event('mx:auth'));
          refresh();
        };
      },
    };
  }
  if (state.user.role !== 'admin' && state.user.role !== 'moderator') return { title: a('admin'), html: gate(`<p>${esc(a('no_access'))}</p><div style="display:flex;gap:8px;justify-content:center"><a class="btn btn-soft" href="/">${esc(a('to_site'))}</a><button class="btn btn-soft" data-logout>${esc(t('logout'))}</button></div>`) };
  const [section = 'overview', id] = params;
  if (!state.adminQueue && section !== 'overview') await loadQueue();
  const map = { overview, users, companies, listings, orders, finance, broadcast, banners: bannersPage, trust, system, settings, log, tiers: tiersPage, promos: promosPage, freight: freightPage, support: supportPage, integrations: integrationsPage, pages: pagesPage };
  if (!allowed(section)) return { title: a('admin'), html: shell('', a('admin'), '', `<div class="box empty"><h3>${esc(a('no_access'))}</h3></div>`) };
  const fn = id && section === 'users' ? userDetail : id && section === 'companies' ? companyDetail : map[section];
  if (!fn) return { title: a('admin'), html: shell('', a('admin'), '', `<div class="box empty">404</div>`) };
  return fn({ id: id && Number(id), query });
}

// ---------- Umumiy ko'rinish ----------
async function overview() {
  const o = await api('/admin/overview');
  state.adminQueue = o.queue;
  const ls = o.listings;
  const stat = (label, value, sub = '', href = '') => `<${href ? `a href="${href}"` : 'div'} class="adm-stat"><span>${esc(label)}</span><b>${value}</b>${sub ? `<em>${sub}</em>` : ''}</${href ? 'a' : 'div'}>`;
  const qItem = (k, n, href) => `<a class="adm-q ${n ? 'hot' : ''}" href="${href}"><span>${esc(a(`q_${k}`))}</span><b>${num(n)}</b></a>`;
  const sys = o.system;
  const memPct = sys ? ((sys.memory.total - sys.memory.free) / sys.memory.total) * 100 : 0;
  const dk = sys?.disk;
  const quick = isAdmin()
    ? `<button class="adm-qa yellow" data-q-topup>${icon('card')}<b>${esc(a('q_topup'))}</b></button>
      <a class="adm-qa" href="/admin/broadcast">${icon('bell')}<b>${esc(a('q_push'))}</b></a>
      <a class="adm-qa" href="/admin/users">${icon('user')}<b>${esc(a('q_users'))}</b></a>
      <a class="adm-qa" href="/admin/system">${icon('chart')}<b>${esc(a('q_server'))}</b></a>`
    : `<a class="adm-qa yellow" href="/admin/listings?status=moderation">${icon('list')}<b>${esc(a('q_moderation'))} · ${num(o.queue.moderation)}</b></a>
      <a class="adm-qa" href="/admin/companies?verification=pending">${icon('building')}<b>${esc(a('q_companies'))} · ${num(o.queue.companies)}</b></a>
      <a class="adm-qa" href="/admin/tiers">${icon('star')}<b>${esc(a('q_tiers'))}</b></a>
      <a class="adm-qa" href="/admin/support">${icon('inbox')}<b>${esc(a('q_support'))} · ${num(o.queue.support || 0)}</b></a>`;
  const html = shell('overview', a('nav_overview'), esc(fmtDate(new Date().toISOString(), true)), `
    <div class="adm-quick">${quick}</div>
    <div class="adm-stats">
      ${stat(a('users_total'), num(o.users.total), `+${num(o.users.new_7d)} · ${esc(a('new_7d'))}`, '/admin/users')}
      ${stat(a('online'), num(o.users.online), `${num(o.users.active_24h)} · ${esc(a('active_24h'))}`)}
      ${stat(t('active_listings'), num(ls.active || 0), `${num(ls.moderation || 0)} · ${esc(a('q_moderation'))}`, '/admin/listings?status=active')}
      ${stat(a('nav_companies'), num(Object.values(o.companies).reduce((s, x) => s + x, 0)), `${num(o.companies.verified || 0)} · ${esc(a('v_verified'))}`, '/admin/companies')}
      ${o.money ? `${stat(a('revenue_30d'), usd(o.money.revenue_30d_usd), `${esc(a('topups_30d'))}: ${usd(o.money.topups_30d_usd)}`, '/admin/finance')}
      ${stat(a('wallets_total'), usd(o.money.wallets_total_usd), '', '/admin/finance?tab=wallet')}` : ''}
      ${stat('VIP · GOLD · PREMIUM', `${num(o.tiers?.vip || 0)} · ${num(o.tiers?.gold || 0)} · ${num(o.tiers?.premium || 0)}`, esc(a('active_now')), '/admin/tiers')}
    </div>
    <div class="adm-grid2">
      <div class="box"><h3>${esc(a('queue'))}</h3><div class="adm-qs">
        ${qItem('moderation', o.queue.moderation, '/admin/listings?status=moderation')}
        ${qItem('companies', o.queue.companies, '/admin/companies?verification=pending')}
        ${qItem('reports', o.queue.reports, '/admin/trust?tab=reports')}
        ${qItem('disputes', o.queue.disputes, '/admin/trust?tab=disputes')}
        ${qItem('inspections', o.queue.inspections, '/admin/trust?tab=inspections')}
        ${qItem('support', o.queue.support || 0, '/admin/support')}
      </div></div>
      ${sys ? `<a class="box adm-sysmini" href="/admin/system"><h3>${esc(a('nav_system'))}</h3>
        <div class="adm-gauges three">${gauge(o.system.cpu?.sys, a('cpu'), `${esc(a('process'))}: ${o.system.cpu?.proc ?? 0}%`)}${gauge(memPct, a('ram'), `${bytes(o.system.memory.total - o.system.memory.free)} / ${bytes(o.system.memory.total)}`)}${dk ? gauge(((dk.total - dk.free) / dk.total) * 100, a('disk'), diskText(dk)) : ''}</div>
        <div class="adm-kv"><span>${esc(a('uptime'))}</span><b>${dur(o.system.uptime_sec)}</b><span>${esc(a('req_min'))}</span><b>${o.system.req_per_min}</b><span>${esc(a('errors_5xx'))}</span><b class="${o.system.errors ? 'red' : ''}">${o.system.errors}</b></div>
      </a>` : ''}
    </div>
    <div class="adm-grid3">
      <div class="box"><h3>${esc(a('ch_regs'))} <small>${num(o.charts.registrations.reduce((s, x) => s + x.n, 0))}</small></h3>${bars(o.charts.registrations, { color: 'var(--blue)' })}</div>
      <div class="box"><h3>${esc(a('ch_listings'))} <small>${num(o.charts.listings.reduce((s, x) => s + x.n, 0))}</small></h3>${bars(o.charts.listings, { color: 'var(--teal)' })}</div>
      ${o.charts.revenue ? `<div class="box"><h3>${esc(a('ch_revenue'))} <small>${usd(o.charts.revenue.reduce((s, x) => s + x.n, 0))}</small></h3>${bars(o.charts.revenue, { color: 'var(--yellow-h)', fmt: usd })}</div>` : ''}
    </div>
    <div class="adm-grid2">
      <div class="box"><h3>${esc(a('by_country'))}</h3>${o.users.by_country.map((c) => `<div class="adm-barrow"><span>${esc(c.name)}</span><i style="--w:${(c.n / Math.max(1, o.users.by_country[0].n)) * 100}%"></i><b>${num(c.n)}</b></div>`).join('')}</div>
      <div class="box"><h3>${esc(a('by_type'))}</h3>${ACCOUNT_TYPES.map((k) => `<a class="adm-barrow" href="/admin/users?account_type=${k}"><span>${esc(typeLabel(k))}</span><i style="--w:${((o.users.by_type[k] || 0) / Math.max(1, o.users.total)) * 100}%"></i><b>${num(o.users.by_type[k] || 0)}</b></a>`).join('')}
        <h3 style="margin-top:18px">${esc(a('nav_orders'))}</h3><div class="adm-chips">${Object.entries(o.orders).map(([k, n]) => `<a class="chip" href="/admin/orders?status=${k}">${esc(state.meta.order_statuses.find((s) => s.value === k)?.label || k)} · ${num(n)}</a>`).join('') || '—'}</div></div>
    </div>`);
  return {
    title: a('admin'),
    html,
    mount(main) {
      main.addEventListener('click', (e) => { if (e.target.closest('[data-q-topup]')) pickUserForTopup(); });
    },
  };
}

// Balans to'ldirish uchun foydalanuvchini qidirib tanlash
function pickUserForTopup() {
  const m = openModal(`<h3>${esc(a('q_topup'))}</h3><p class="small muted">${esc(a('pick_user'))}</p>
    <input class="input" data-uq placeholder="${esc(a('find_user'))}" autofocus style="margin-top:8px"><div data-ur style="margin-top:8px;max-height:340px;overflow:auto"></div>`);
  const box = m.querySelector('[data-ur]');
  let items = [];
  box.onclick = (e) => {
    const b = e.target.closest('[data-uid]');
    if (!b) return;
    const u = items.find((x) => x.id === Number(b.dataset.uid));
    closeModal();
    balanceModal(u, 'credit');
  };
  const search = debounce(async (q) => {
    const r = await api(`/admin/users${qs({ q })}`, { silent: true }).catch(() => ({ items: [] }));
    items = r.items.slice(0, 15);
    box.innerHTML = items.map((u) => `<button type="button" class="adm-line adm-pick" data-uid="${u.id}"><div class="adm-user"><span class="avatar">${esc(initials(u.name || u.phone))}</span><div><b>${esc(u.name || '—')} <span class="muted">#${u.id}</span></b><span>${esc(u.phone)}</span></div></div><b>${esc(u.balance.formatted)}</b></button>`).join('') || `<div class="empty">${esc(a('empty'))}</div>`;
  }, 250);
  m.querySelector('[data-uq]').oninput = (e) => search(e.target.value.trim());
  search('');
}

// ---------- Foydalanuvchilar ----------
async function users({ query }) {
  const r = await api(`/admin/users${qs(query)}`);
  const html = shell('users', a('nav_users'), '', `
    <form class="box adm-filters" data-f>
      <input class="input grow" name="q" value="${esc(query.q || '')}" placeholder="${esc(a('search_users'))}">
      ${sel('role', [['user', a('r_user')], ['moderator', a('r_moderator')], ['admin', a('r_admin')]], query.role)}
      ${sel('account_type', ACCOUNT_TYPES.map((k) => [k, typeLabel(k)]), query.account_type)}
      ${sel('country', countries(), query.country)}
      ${sel('blocked', [['0', a('active')], ['1', a('blocked')]], query.blocked)}
      <select class="input" name="balance"><option value="">${esc(a('balance'))}: ${esc(a('all'))}</option><option value="1" ${query.balance === '1' ? 'selected' : ''}>${esc(a('with_balance'))}</option></select>
      ${sel('sort', [['new', a('s_new')], ['seen', a('s_seen')], ['balance', a('s_balance')]], query.sort, false)}
      <button class="btn btn-primary">${icon('search')} ${esc(a('search'))}</button>
    </form>
    <div class="box adm-table-box"><table class="adm-table">
      <thead><tr><th>ID</th><th>${esc(a('profile'))}</th><th>${esc(a('type'))}</th><th>${esc(a('country'))}</th><th>${esc(a('balance'))}</th><th>${esc(a('listings_n'))}</th><th>${esc(a('last_seen'))}</th><th>${esc(a('status'))}</th><th></th></tr></thead>
      <tbody>${r.items.map((u) => `<tr data-href="/admin/users/${u.id}">
        <td class="muted">#${u.id}</td>
        <td><div class="adm-user"><span class="avatar">${esc(initials(u.name || u.phone))}</span><div><b>${esc(u.name || '—')}</b>${u.role === 'admin' ? ` <span class="tag yellow">admin</span>` : ''}<span>${esc(u.phone)}${u.username ? ` · @${esc(u.username)}` : ''}${u.company ? ` · ${esc(u.company.name)}` : ''}</span></div></div></td>
        <td>${esc(typeLabel(u.account_type))}</td><td>${esc(u.country)}</td>
        <td><b>${esc(u.balance.formatted)}</b></td><td>${num(u.listings || 0)}</td><td class="muted">${esc(ago(u.last_seen_at))}</td>
        <td>${u.blocked ? `<span class="tag red">${esc(a('blocked'))}</span>` : `<span class="tag green">${esc(a('active'))}</span>`}</td>
        <td style="text-align:end"><button class="btn btn-accent btn-sm" data-topup="${u.id}">${icon('plus')} ${esc(a('topup'))}</button></td></tr>`).join('') || `<tr><td colspan="9" class="empty">${esc(a('empty'))}</td></tr>`}</tbody>
    </table></div>
    ${pager(r, '/admin/users', query)}`, `<button class="btn btn-accent" data-new>${icon('plus')} ${esc(a('new_user'))}</button>`);
  return {
    title: a('nav_users'),
    html,
    mount(main) {
      bindFilters(main, '/admin/users');
      bindRows(main);
      main.addEventListener('click', (e) => {
        const b = e.target.closest('[data-topup]');
        if (b) balanceModal(r.items.find((x) => String(x.id) === b.dataset.topup), 'credit');
      });
      $('[data-new]', main).onclick = () => {
        const m = openModal(`<h3>${esc(a('new_user'))}</h3><form class="form-grid" style="margin-top:12px">
          ${field(a('login_phone'), inp('phone', '', 'required type="tel" placeholder="+998 90 123 45 67"'))}${field(t('name'), inp('name'))}
          ${field(a('role'), sel('role', [['user', a('r_user')], ['moderator', a('r_moderator')], ['admin', a('r_admin')]], 'user', false))}${field(a('type'), sel('account_type', ACCOUNT_TYPES.map((k) => [k, typeLabel(k)]), 'client', false))}
          ${field(a('country'), sel('country', countries(), 'UZ', false))}${field(a('new_password'), inp('password', '', 'type="text" autocomplete="off"'))}
          <p class="tiny muted full" style="margin:0">${esc(a('pw_hint'))}</p>
          <div class="full"><button class="btn btn-primary btn-block">${esc(a('create'))}</button></div></form>`, { wide: true });
        m.querySelector('form').onsubmit = async (e) => {
          e.preventDefault();
          const f = e.target;
          const body = Object.fromEntries(['phone', 'name', 'role', 'account_type', 'country', 'password'].map((k) => [k, f[k].value.trim() || undefined]));
          const res = await api('/admin/users', { method: 'POST', body });
          closeModal();
          go(`/admin/users/${res.id}`);
        };
      };
    },
  };
}

function bindFilters(main, path) {
  const f = $('[data-f]', main);
  if (!f) return;
  const submit = () => {
    const q = Object.fromEntries([...new FormData(f)].filter(([, v]) => v !== ''));
    nav(path, q);
  };
  f.onsubmit = (e) => { e.preventDefault(); submit(); };
  f.addEventListener('change', (e) => { if (e.target.tagName === 'SELECT') submit(); });
}
function bindRows(main) {
  main.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-href]');
    if (tr && !e.target.closest('a,button,select,input')) go(tr.dataset.href);
  });
}

async function userDetail({ id }) {
  const u = await api(`/admin/users/${id}`);
  const self = u.id === state.user.id;
  const counts = u.counts;
  const lsTotal = Object.values(counts.listings).reduce((s, x) => s + x, 0);
  const html = shell('users', u.name || u.phone, `<a class="link-blue" href="/admin/users">← ${esc(a('nav_users'))}</a> · #${u.id} · ${esc(a('registered'))} ${esc(fmtDate(u.created_at))}`, `
    <div class="adm-profile box">
      <span class="avatar xl">${esc(initials(u.name || u.phone))}</span>
      <div class="grow"><h2>${esc(u.name || '—')}</h2>
        <p>${esc(u.phone)}${u.email ? ` · ${esc(u.email)}` : ''}</p>
        <div class="adm-chips">${u.role !== 'user' ? `<span class="tag yellow">${esc(a(`r_${u.role}`))}</span>` : ''}<span class="tag">${esc(typeLabel(u.account_type))}</span><span class="tag">${esc(u.country)}</span>
          ${u.blocked ? `<span class="tag red">${esc(a('blocked'))}${u.blocked_reason ? `: ${esc(u.blocked_reason)}` : ''}</span>` : `<span class="tag green">${esc(a('active'))}</span>`}
          ${u.company ? `<a class="tag" href="/admin/companies/${u.company.id}">${icon('building')} ${esc(u.company.name)}</a>` : ''}
          ${u.telegram ? '<span class="tag">Telegram</span>' : ''}</div>
      </div>
      <div class="adm-balance"><span>${esc(a('balance'))}</span><b>${esc(u.balance.formatted)}</b>
        <div><button class="btn btn-accent btn-sm" data-bal="credit">${icon('plus')} ${esc(a('topup'))}</button><button class="btn btn-soft btn-sm" data-bal="debit">${icon('minus')}</button></div></div>
    </div>
    <div class="adm-actbar">
      <button class="btn btn-soft btn-sm" data-pw>${icon('shield')} ${esc(a('set_password'))}</button>
      <button class="btn btn-soft btn-sm" data-logout-all>${icon('logout')} ${esc(a('logout_all'))}</button>
      <button class="btn btn-soft btn-sm" data-push>${icon('bell')} ${esc(a('send_push'))}</button>
      ${self ? '' : `<button class="btn btn-soft btn-sm" data-imp>${icon('eye')} ${esc(a('login_as'))}</button>`}
      ${self ? '' : u.blocked ? `<button class="btn btn-primary btn-sm" data-unblock>${esc(a('unblock'))}</button>` : `<button class="btn btn-danger btn-sm" data-block>${esc(a('block'))}</button>`}
      <a class="btn btn-ghost btn-sm" href="/admin/listings?status=all&user_id=${u.id}">${icon('list')} ${esc(a('listings_n'))} · ${lsTotal}</a>
      <a class="btn btn-ghost btn-sm" href="/admin/log?target_type=user&target_id=${u.id}">${icon('file')} ${esc(a('nav_log'))}</a>
      ${self ? '' : `<button class="btn btn-ghost btn-sm red" data-del>${icon('trash')} ${esc(a('delete'))}</button>`}
    </div>
    <div class="adm-grid2">
      <form class="box" data-pf><h3>${esc(a('profile'))}</h3><div class="form-grid">
        ${field(a('login_phone'), inp('phone', u.phone, 'type="tel"'))}${field(a('username'), inp('username', u.username, 'autocomplete="off" placeholder="admin" pattern="[A-Za-z0-9._-]{3,32}"'))}
        ${field(t('name'), inp('name', u.name))}
        ${field('Email', inp('email', u.email, 'type="email"'))}${field(t('city'), inp('city', u.city))}
        ${field(a('role'), sel('role', [['user', a('r_user')], ['moderator', a('r_moderator')], ['admin', a('r_admin')]], u.role, false))}${field(a('type'), sel('account_type', ACCOUNT_TYPES.map((k) => [k, typeLabel(k)]), u.account_type, false))}
        ${field(a('country'), sel('country', countries(), u.country, false))}${field(t('language'), sel('lang', state.meta.languages.map((l) => [l.code, l.name]), u.lang, false))}
        ${field(a('currency'), sel('currency', state.meta.currencies.map((c) => [c.code, c.code]), u.currency, false))}${field(t('position'), inp('position', u.position))}
        ${field(a('admin_note'), `<textarea class="input" name="admin_note" rows="2">${esc(u.admin_note || '')}</textarea>`, 'full')}
      </div><p class="tiny muted">${esc(a('login_hint'))}</p><button class="btn btn-primary">${esc(a('save'))}</button></form>
      <div>
        <div class="box"><h3>${esc(a('activity'))}</h3><div class="adm-kv">
          <span>${esc(a('listings_n'))}</span><b>${Object.entries(counts.listings).map(([k, n]) => `${esc(state.meta.listing_statuses.find((s) => s.value === k)?.label || k)}: ${n}`).join(' · ') || 0}</b>
          <span>${esc(a('orders_buy'))} / ${esc(a('orders_sell'))}</span><b>${counts.orders_buyer} / ${counts.orders_seller}</b>
          <span>${esc(a('messages_n'))}</span><b>${num(counts.messages)}</b>
          <span>${esc(a('reports_against'))}</span><b class="${counts.reports_against ? 'red' : ''}">${counts.reports_against}</b>
          <span>${esc(a('push_devices'))}</span><b>${counts.push_devices}</b>
          <span>${esc(a('last_seen'))}</span><b>${esc(ago(u.last_seen_at))}</b>
          <span>${esc(t('plans_link'))}</span><b>${esc(u.plan?.plan || 'free')}${u.plan?.until ? ` → ${esc(fmtDate(u.plan.until))}` : ''}</b>
        </div></div>
        <div class="box"><h3>${esc(a('sessions'))} · ${u.sessions.length}</h3>${u.sessions.map((s) => `<div class="adm-line"><div><b>${esc((s.device || '—').slice(0, 60))}</b><span>${esc(s.ip || '')} · ${esc(ago(s.last_used_at))}</span></div><button class="btn btn-ghost btn-sm" data-ses="${s.id}">${icon('x')}</button></div>`).join('') || `<div class="empty">${esc(a('empty'))}</div>`}</div>
      </div>
    </div>
    <div class="adm-grid2">
      <div class="box"><h3>${esc(a('wallet_history'))}</h3>${u.wallet.length ? `<table class="adm-table"><tbody>${u.wallet.map((x) => `<tr><td class="muted">${esc(fmtDate(x.created_at, true))}</td><td>${esc(x.kind_label)}${x.note ? `<br><span class="tiny muted">${esc(x.note)}</span>` : ''}</td><td class="${x.sign === '+' ? 'green' : 'red'}"><b>${x.sign}${esc(x.formatted)}</b>${x.original ? `<br><span class="tiny muted">${esc(x.original)}</span>` : ''}</td><td class="muted">${esc(x.balance_after)}</td></tr>`).join('')}</tbody></table>` : `<div class="empty">${esc(a('empty'))}</div>`}</div>
      <div class="box"><h3>${esc(a('payments'))}</h3>${u.payments.length ? `<table class="adm-table"><tbody>${u.payments.map((p) => `<tr><td class="muted">№${p.id}<br>${esc(fmtDate(p.created_at))}</td><td>${esc(p.title)}<br><span class="tiny muted">${esc(p.provider)}</span></td><td><b>${esc(p.formatted)}</b><br><span class="tag ${p.status === 'paid' ? 'green' : p.status === 'pending' ? 'orange' : 'grey'}">${esc(t(`pst_${p.status}`))}</span></td></tr>`).join('')}</tbody></table>` : `<div class="empty">${esc(a('empty'))}</div>`}</div>
    </div>`);
  return {
    title: u.name || u.phone,
    html,
    mount(main) {
      $('[data-pf]', main).onsubmit = async (e) => {
        e.preventDefault();
        const f = e.target;
        const body = Object.fromEntries(['phone', 'username', 'name', 'email', 'city', 'role', 'account_type', 'country', 'lang', 'currency', 'position', 'admin_note'].map((k) => [k, f[k].value.trim()]));
        if (!body.email) delete body.email;
        const r = await api(`/admin/users/${u.id}`, { method: 'PATCH', body });
        toast(r.changed.length ? a('saved') : '—', 'ok');
        refresh();
      };
      main.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-bal]');
        if (b) return balanceModal(u, b.dataset.bal);
        if (e.target.closest('[data-pw]')) return passwordModal(u.id, self);
        if (e.target.closest('[data-push]')) return go(`/admin/broadcast?user_ids=${u.id}`);
        if (e.target.closest('[data-logout-all]')) { await api(`/admin/users/${u.id}/logout`, { method: 'POST' }); toast(a('saved'), 'ok'); return refresh(); }
        const s = e.target.closest('[data-ses]');
        if (s) { await api(`/admin/users/${u.id}/sessions/${s.dataset.ses}`, { method: 'DELETE' }); return refresh(); }
        if (e.target.closest('[data-unblock]')) { await api(`/admin/users/${u.id}/unblock`, { method: 'POST' }); return refresh(); }
        if (e.target.closest('[data-block]')) {
          const m = openModal(`<h3>${esc(a('block'))}</h3><form style="margin-top:10px"><label class="lbl">${esc(a('block_reason'))}</label><textarea class="input" name="reason" rows="3"></textarea><button class="btn btn-danger btn-block" style="margin-top:12px">${esc(a('block'))}</button></form>`);
          m.querySelector('form').onsubmit = async (ev) => { ev.preventDefault(); await api(`/admin/users/${u.id}/block`, { method: 'POST', body: { reason: ev.target.reason.value.trim() || undefined } }); closeModal(); refresh(); };
          return;
        }
        if (e.target.closest('[data-imp]')) {
          if (!(await confirmBox(a('login_as_q')))) return;
          const r = await api(`/admin/users/${u.id}/impersonate`, { method: 'POST' });
          try { localStorage.setItem('mx_admin_token', state.token); localStorage.setItem('mx_admin_back', `/admin/users/${u.id}`); localStorage.setItem('mx_imp_name', u.name || u.phone); } catch { /* */ }
          setToken(r.token);
          location.href = '/';
          return;
        }
        if (e.target.closest('[data-del]')) {
          if (!(await confirmBox(a('delete_q')))) return;
          await api(`/admin/users/${u.id}`, { method: 'DELETE' });
          go('/admin/users');
        }
      });
    },
  };
}

function balanceModal(u, dir) {
  const cur = u.currency || state.currency;
  const m = openModal(`<h3>${esc(a(dir === 'credit' ? 'topup' : 'debit'))}</h3><p class="small muted">${esc(u.name || u.phone)} · ${esc(a('balance'))}: <b>${esc(u.balance.formatted)}</b></p>
    <form class="form-grid">
      ${field(a('amount'), inp('amount', '', 'required inputmode="decimal" autofocus'))}
      ${field(a('currency'), sel('currency', state.meta.currencies.map((c) => [c.code, c.code]), cur, false))}
      ${dir === 'credit' ? field(a('kind'), sel('kind', [['admin_credit', a('k_admin_credit')], ['bonus', a('k_bonus')], ['refund', a('k_refund')]], 'admin_credit', false), 'full') : ''}
      ${field(a('note'), inp('note', '', 'maxlength="300"'), 'full')}
      <div class="full"><button class="btn ${dir === 'credit' ? 'btn-accent' : 'btn-danger'} btn-block">${esc(a(dir === 'credit' ? 'topup' : 'debit'))}</button></div>
    </form>`);
  m.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const amount = Number(f.amount.value.replace(/\s/g, '').replace(',', '.'));
    await api(`/admin/users/${u.id}/balance`, { method: 'POST', body: { amount, currency: f.currency.value, direction: dir, kind: f.kind?.value, note: f.note.value.trim() || undefined } });
    closeModal();
    toast(a('saved'), 'ok');
    refresh();
  };
}

function passwordModal(uid, self) {
  const m = openModal(`<h3>${esc(a('set_password'))}</h3><form style="margin-top:10px">
    <label class="lbl">${esc(a('new_password'))}</label><div style="display:flex;gap:8px"><input class="input" name="password" type="text" autocomplete="new-password" minlength="8" required><button type="button" class="btn btn-soft" data-gen>🎲</button></div>
    <p class="tiny muted">${esc(a('pw_hint'))}${self ? '' : ` · ${esc(a('logout_all'))}`}</p>
    <button class="btn btn-primary btn-block">${esc(a('save'))}</button></form>`);
  m.querySelector('[data-gen]').onclick = () => {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
    const r = crypto.getRandomValues(new Uint32Array(10));
    m.querySelector('[name=password]').value = `${[...r.slice(0, 7)].map((x) => abc[x % abc.length]).join('')}${[...r.slice(7)].map((x) => x % 10).join('')}`;
  };
  m.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    await api(`/admin/users/${uid}/password`, { method: 'PUT', body: { password: e.target.password.value } });
    closeModal();
    toast(a('saved'), 'ok');
  };
}

// ---------- Kompaniyalar ----------
async function companies({ query }) {
  const ver = query.verification ?? 'pending';
  const list = await api(`/admin/companies${qs({ ...query, verification: ver })}`);
  const tabs = [['pending', a('v_pending')], ['all', a('all')], ['verified', a('v_verified')], ['rejected', a('v_rejected')], ['none', a('v_none')]];
  const html = shell('companies', a('nav_companies'), '', `
    <div class="tabs">${tabs.map(([v, l]) => `<a class="tab ${ver === v ? 'on' : ''}" href="/admin/companies${qs({ ...query, verification: v })}">${esc(l)}</a>`).join('')}</div>
    <form class="box adm-filters" data-f><input type="hidden" name="verification" value="${esc(ver)}"><input class="input grow" name="q" value="${esc(query.q || '')}" placeholder="${esc(t('company_name'))}, ${esc(t('tin'))}, ${esc(t('phone'))}">${sel('country', countries(), query.country)}<button class="btn btn-primary">${icon('search')} ${esc(a('search'))}</button></form>
    <div class="box adm-table-box"><table class="adm-table">
      <thead><tr><th>ID</th><th>${esc(a('company'))}</th><th>${esc(a('legal_form'))}</th><th>${esc(t('tin'))}</th><th>${esc(a('owner'))}</th><th>${esc(a('docs'))}</th><th>${esc(a('listings_n'))}</th><th>${esc(a('status'))}</th></tr></thead>
      <tbody>${list.map((c) => `<tr data-href="/admin/companies/${c.id}">
        <td class="muted">#${c.id}</td><td><b>${esc(c.name)}</b><br><span class="tiny muted">${esc([c.country, c.city].filter(Boolean).join(' · '))}</span></td>
        <td>${esc(c.legal_form_name || '—')}</td><td class="mono">${esc(c.tin || '—')}</td>
        <td>${esc(c.owner.name || '')}<br><span class="tiny muted">${esc(c.owner.phone)}</span></td>
        <td>${c.docs ? `${icon('file')} ${c.docs}` : '<span class="tag red">0</span>'}</td><td>${num(c.listings)}</td>
        <td>${vTag(c.verification)}${c.blocked ? ` <span class="tag red">${esc(a('blocked'))}</span>` : ''}</td></tr>`).join('') || `<tr><td colspan="8" class="empty">${esc(a('empty'))}</td></tr>`}</tbody>
    </table></div>`);
  return { title: a('nav_companies'), html, mount(main) { bindFilters(main, '/admin/companies'); bindRows(main); } };
}

async function openDoc(url) {
  const r = await fetch(`${url}?inline=1`, { headers: { Authorization: `Bearer ${state.token}` } });
  if (!r.ok) return toast(t('error'), 'err');
  window.open(URL.createObjectURL(await r.blob()), '_blank');
}

async function companyDetail({ id }) {
  const c = await api(`/admin/companies/${id}`);
  const form = c.forms.find((f) => f.code === c.legal_form) || c.forms[0];
  const reqFields = (f) => f.fields.map((x) => field(`${x.label}${x.required ? ' *' : ''}`, inp(x.key, c[x.key], `${x.type === 'date' ? 'type="date"' : ''} placeholder="${esc(x.placeholder || '')}" ${x.pattern ? `pattern="${esc(x.pattern)}"` : ''}`))).join('');
  const html = shell('companies', c.name, `<a class="link-blue" href="/admin/companies">← ${esc(a('nav_companies'))}</a> · #${c.id} · ${esc(c.country_name)}`, `
    <div class="adm-profile box">
      <span class="avatar xl">${c.logo ? `<img src="${esc(c.logo)}" alt="">` : esc(initials(c.name))}</span>
      <div class="grow"><h2>${esc(c.name)}</h2><p>${esc(c.legal_form_name || '—')} · ${esc(t('tin'))}: <span class="mono">${esc(c.tin || '—')}</span></p>
        <div class="adm-chips">${vTag(c.verification)}${c.blocked ? `<span class="tag red">${esc(a('blocked'))}</span>` : ''}${c.reject_reason ? `<span class="tag red">${esc(c.reject_reason)}</span>` : ''}
          <a class="tag" href="/admin/users/${c.owner.id}">${icon('user')} ${esc(c.owner.name || c.owner.phone)}</a><span class="tag">${num(c.active_listings)} ${esc(a('listings_n'))}</span></div></div>
    </div>
    <div class="adm-actbar">
      ${c.verification !== 'verified' ? `<button class="btn btn-primary btn-sm" data-verify ${c.missing_docs.length ? 'title="' + esc(a('missing_docs')) + '"' : ''}>${icon('check')} ${esc(a('verify'))}</button>` : ''}
      ${c.verification !== 'rejected' ? `<button class="btn btn-danger btn-sm" data-reject>${esc(a('reject'))}</button>` : ''}
      <button class="btn btn-soft btn-sm" data-block>${esc(a(c.blocked ? 'unblock' : 'block'))}</button>
      <a class="btn btn-soft btn-sm" href="/company/${c.id}" target="_blank">${icon('building')} ${esc(a('store'))}</a>
      <a class="btn btn-ghost btn-sm" href="/admin/listings?status=all&company_id=${c.id}">${icon('list')} ${esc(a('listings_n'))}</a>
      <button class="btn btn-ghost btn-sm red" data-del>${icon('trash')} ${esc(a('delete'))}</button>
    </div>
    <div class="adm-grid2">
      <div class="box"><h3>${esc(a('docs'))} · ${c.documents.length}</h3>
        ${c.missing_docs.length ? `<div class="adm-warn">${icon('flag')} ${esc(a('missing_docs'))}: ${esc((form?.docs || []).filter((d) => c.missing_docs.includes(d.type)).map((d) => d.name).join(', '))}</div>` : ''}
        ${c.documents.map((d) => `<div class="adm-line"><div><b>${esc(d.type_name)}</b><span>${esc(d.original_name || '')} · ${esc(fmtDate(d.created_at))}${d.size ? ` · ${bytes(d.size)}` : ''}</span></div><div style="display:flex;gap:6px"><button class="btn btn-soft btn-sm" data-doc="${esc(d.url)}">${icon('eye')} ${esc(a('view'))}</button><button class="btn btn-ghost btn-sm" data-docdel="${d.id}">${icon('trash')}</button></div></div>`).join('') || `<div class="empty">${esc(a('empty'))}</div>`}
      </div>
      <div class="box"><h3>${esc(t('about_company'))}</h3><div class="adm-kv">
        <span>${esc(t('activity'))}</span><b>${esc((c.activities || []).map((x) => t(`act_${x}`)).join(', ') || c.activity || '—')}</b>
        <span>${esc(t('address'))}</span><b>${esc([c.region_name, c.city, c.address].filter(Boolean).join(', ') || '—')}</b>
        <span>${esc(t('phone'))}</span><b>${esc(c.phone || '—')}</b><span>Email</span><b>${esc(c.email || '—')}</b>
        <span>${esc(a('nav_users'))}</span><b>${c.members + 1}</b><span>${esc(t('branches'))}</span><b>${c.branches}</b>
        <span>${esc(a('registered'))}</span><b>${esc(fmtDate(c.created_at))}</b>
        <span>%</span><b>${c.completeness}%</b>
      </div></div>
    </div>
    <form class="box" data-cf><h3>${esc(a('requisites'))}</h3>
      <div class="form-grid">
        ${field(t('company_name'), inp('name', c.name, 'required'))}
        ${field(a('legal_form'), `<select class="input" name="legal_form">${c.forms.map((f) => `<option value="${f.code}" ${f.code === form?.code ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select>`)}
      </div>
      <div class="form-grid" data-reqf style="margin-top:12px">${form ? reqFields(form) : ''}</div>
      <div class="form-grid" style="margin-top:12px">
        ${field(a('owner_phone'), inp('owner_phone', '', `type="tel" placeholder="${esc(c.owner.phone)}"`))}
        ${field(a('status'), sel('verification', ['none', 'pending', 'verified', 'rejected'].map((v) => [v, a(`v_${v}`)]), c.verification, false))}
      </div>
      <button class="btn btn-primary" style="margin-top:14px">${esc(a('save'))}</button>
    </form>`);
  return {
    title: c.name,
    html,
    mount(main) {
      const cf = $('[data-cf]', main);
      cf.legal_form.onchange = () => {
        const f = c.forms.find((x) => x.code === cf.legal_form.value);
        $('[data-reqf]', cf).innerHTML = reqFields(f);
      };
      cf.onsubmit = async (e) => {
        e.preventDefault();
        const body = { name: cf.name.value.trim(), legal_form: cf.legal_form.value, verification: cf.verification.value };
        for (const el of $$('[data-reqf] input', cf)) body[el.name] = el.value.trim();
        if (cf.owner_phone.value.trim()) body.owner_phone = cf.owner_phone.value.trim();
        await api(`/admin/companies/${c.id}`, { method: 'PATCH', body });
        toast(a('saved'), 'ok');
        refresh();
      };
      main.addEventListener('click', async (e) => {
        const d = e.target.closest('[data-doc]');
        if (d) return openDoc(d.dataset.doc);
        const dd = e.target.closest('[data-docdel]');
        if (dd) { if (await confirmBox(a('delete_q'))) { await api(`/admin/companies/${c.id}/documents/${dd.dataset.docdel}`, { method: 'DELETE' }); refresh(); } return; }
        if (e.target.closest('[data-verify]')) { await api(`/admin/companies/${c.id}/verify`, { method: 'POST' }); return refresh(); }
        if (e.target.closest('[data-reject]')) {
          const m = openModal(`<h3>${esc(a('reject'))}</h3><form style="margin-top:10px"><label class="lbl">${esc(a('reject_reason'))}</label><textarea class="input" name="reason" rows="3" required></textarea><button class="btn btn-danger btn-block" style="margin-top:12px">${esc(a('reject'))}</button></form>`);
          m.querySelector('form').onsubmit = async (ev) => { ev.preventDefault(); await api(`/admin/companies/${c.id}/reject`, { method: 'POST', body: { reason: ev.target.reason.value.trim() } }); closeModal(); refresh(); };
          return;
        }
        if (e.target.closest('[data-block]')) { await api(`/admin/companies/${c.id}/block`, { method: 'POST', body: { blocked: !c.blocked } }); return refresh(); }
        if (e.target.closest('[data-del]')) { if (await confirmBox(a('delete_q'))) { await api(`/admin/companies/${c.id}`, { method: 'DELETE' }); go('/admin/companies'); } }
      });
    },
  };
}

// ---------- E'lonlar ----------
async function listings({ query }) {
  const status = query.status || 'moderation';
  const r = await api(`/admin/listings${qs({ ...query, status })}`);
  const ST = ['moderation', 'active', 'rejected', 'archived', 'sold', 'deleted', 'draft', 'all'];
  const label = (s) => (s === 'all' ? a('all') : state.meta.listing_statuses.find((x) => x.value === s)?.label || s);
  const html = shell('listings', a('nav_listings'), '', `
    <div class="tabs">${ST.map((s) => `<a class="tab ${status === s ? 'on' : ''}" href="/admin/listings${qs({ ...query, status: s, page: undefined })}">${esc(label(s))}</a>`).join('')}</div>
    <form class="box adm-filters" data-f><input type="hidden" name="status" value="${esc(status)}">${query.user_id ? `<input type="hidden" name="user_id" value="${esc(query.user_id)}">` : ''}${query.company_id ? `<input type="hidden" name="company_id" value="${esc(query.company_id)}">` : ''}
      <input class="input grow" name="q" value="${esc(query.q || '')}" placeholder="${esc(a('search_listings'))}">${sel('country', countries(), query.country)}<button class="btn btn-primary">${icon('search')} ${esc(a('search'))}</button></form>
    ${r.items.map((l) => `<div class="box adm-listing">
      <a class="thumb" href="/listing/${l.id}" target="_blank"><img src="${esc(l.cover || imgOf(l))}" alt=""></a>
      <div class="grow"><div class="adm-chips"><span class="tag">${esc(label(l.status))}</span>${l.tier && l.tier_until > new Date().toISOString().replace('T', ' ') ? `<span class="tier-badge sm ${l.tier}">${l.tier.toUpperCase()}</span> <span class="tiny muted">${esc(a('until'))} ${esc(fmtDate(l.tier_until))}</span>` : l.promoted_until && l.promoted_until > new Date().toISOString().replace('T', ' ') ? '<span class="tag yellow">TOP</span>' : ''}<span class="tiny muted">#${l.id} · ${esc(fmtRel(l.updated_at || l.created_at))}</span></div>
        <b class="t">${esc(l.title)}</b><div class="p">${esc(priceText(l.price))}</div>
        <div class="tiny muted"><a class="link-blue" href="/admin/users/${l.user_id}">${esc(l.seller.name || '')}</a> · ${esc(l.location.country_name)} · ${esc(l.category.name)}${l.subcategory ? ` / ${esc(l.subcategory.name)}` : ''}</div>
        ${l.status === 'moderation' ? `<p class="small" style="margin:6px 0 0">${esc((l.description || '').slice(0, 260))}</p>` : ''}
        ${l.reject_reason ? `<p class="small red" style="margin:6px 0 0">${esc(l.reject_reason)}</p>` : ''}</div>
      <div class="adm-col-actions">
        ${['moderation', 'rejected', 'archived'].includes(l.status) ? `<button class="btn btn-primary btn-sm" data-approve="${l.id}">${icon('check')} ${esc(a(l.status === 'moderation' ? 'approve' : 'restore'))}</button>` : ''}
        ${['moderation', 'active'].includes(l.status) ? `<button class="btn btn-danger btn-sm" data-reject="${l.id}">${esc(a('reject'))}</button>` : ''}
        ${l.status === 'active' ? `<button class="btn btn-accent btn-sm" data-top="${l.id}">${icon('star')} ${esc(a('set_tier'))}</button><button class="btn btn-soft btn-sm" data-st="archived" data-id="${l.id}">${esc(a('archive'))}</button>` : ''}
        <button class="btn btn-ghost btn-sm red" data-ldel="${l.id}">${icon('trash')}</button>
      </div></div>`).join('') || `<div class="box empty">${esc(a('empty'))}</div>`}
    ${pager(r, '/admin/listings', { ...query, status })}`);
  return {
    title: a('nav_listings'),
    html,
    mount(main) {
      bindFilters(main, '/admin/listings');
      main.addEventListener('click', async (e) => {
        const ap = e.target.closest('[data-approve]');
        if (ap) { await api(`/admin/listings/${ap.dataset.approve}/approve`, { method: 'POST' }); return refresh(); }
        const rj = e.target.closest('[data-reject]');
        if (rj) {
          const m = openModal(`<h3>${esc(a('reject'))}</h3><form style="margin-top:10px"><label class="lbl">${esc(a('reject_reason'))}</label><textarea class="input" name="reason" required minlength="3" rows="3"></textarea><button class="btn btn-danger btn-block" style="margin-top:12px">${esc(a('reject'))}</button></form>`);
          m.querySelector('form').onsubmit = async (ev) => { ev.preventDefault(); await api(`/admin/listings/${rj.dataset.reject}/reject`, { method: 'POST', body: { reason: ev.target.reason.value.trim() } }); closeModal(); refresh(); };
          return;
        }
        const tp = e.target.closest('[data-top]');
        if (tp) {
          tierModal(Number(tp.dataset.top));
          return;
          const m = openModal(`<h3>${esc(a('promote'))}</h3><form style="margin-top:10px"><label class="lbl">${esc(a('promote_days'))}</label><input class="input" name="days" type="number" min="1" max="365" value="7"><button class="btn btn-accent btn-block" style="margin-top:12px">${icon('rocket')} ${esc(a('save'))}</button></form>`);
          m.querySelector('form').onsubmit = async (ev) => { ev.preventDefault(); await api(`/admin/listings/${tp.dataset.top}`, { method: 'PATCH', body: { promoted_days: Number(ev.target.days.value) } }); closeModal(); refresh(); };
          return;
        }
        const st = e.target.closest('[data-st]');
        if (st) { await api(`/admin/listings/${st.dataset.id}`, { method: 'PATCH', body: { status: st.dataset.st } }); return refresh(); }
        const del = e.target.closest('[data-ldel]');
        if (del && await confirmBox(a('delete_q'))) { await api(`/admin/listings/${del.dataset.ldel}`, { method: 'DELETE' }); refresh(); }
      });
    },
  };
}

// ---------- Buyurtmalar ----------
async function orders({ query }) {
  const r = await api(`/admin/orders${qs(query)}`);
  const OS = state.meta.order_statuses;
  const html = shell('orders', a('nav_orders'), '', `
    <form class="box adm-filters" data-f><input class="input grow" name="q" value="${esc(query.q || '')}" placeholder="${esc(a('search_orders'))}">${sel('status', OS.map((s) => [s.value, s.label]), query.status)}<button class="btn btn-primary">${icon('search')} ${esc(a('search'))}</button></form>
    <div class="box adm-table-box"><table class="adm-table">
      <thead><tr><th>№</th><th>${esc(t('order_details'))}</th><th>${esc(a('buyer'))}</th><th>${esc(a('seller'))}</th><th>${esc(a('amount'))}</th><th>${esc(a('change_status'))}</th></tr></thead>
      <tbody>${r.items.map((o) => `<tr><td><b>${esc(o.number)}</b><br><span class="tiny muted">${esc(fmtDate(o.created_at))}</span></td>
        <td>${o.listing_id ? `<a class="link-blue" href="/listing/${o.listing_id}" target="_blank">${esc(o.title)}</a>` : esc(o.title)}${o.escrow ? ` <span class="tag">${esc(t('safe_deal'))}: ${esc(o.escrow_status || '')}</span>` : ''}</td>
        <td><a href="/admin/users/${o.buyer.id}">${esc(o.buyer.name || '')}</a><br><span class="tiny muted">${esc(o.buyer.phone)}</span></td>
        <td><a href="/admin/users/${o.seller.id}">${esc(o.seller.name || '')}</a><br><span class="tiny muted">${esc(o.seller.phone)}</span></td>
        <td><b>${esc(o.formatted)}</b></td>
        <td><select class="input" data-os="${o.id}" style="height:34px">${OS.map((s) => `<option value="${s.value}" ${s.value === o.status ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select></td></tr>`).join('') || `<tr><td colspan="6" class="empty">${esc(a('empty'))}</td></tr>`}</tbody>
    </table></div>${pager(r, '/admin/orders', query)}`);
  return {
    title: a('nav_orders'),
    html,
    mount(main) {
      bindFilters(main, '/admin/orders');
      main.addEventListener('change', async (e) => {
        const s = e.target.closest('[data-os]');
        if (!s) return;
        await api(`/admin/orders/${s.dataset.os}`, { method: 'PATCH', body: { status: s.value } });
        toast(a('saved'), 'ok');
      });
    },
  };
}

// ---------- Moliya ----------
async function finance({ query }) {
  const tab = query.tab || 'payments';
  let body = '';
  if (tab === 'payments') {
    const ps = await api('/admin/payments');
    body = `<div class="box adm-table-box"><table class="adm-table"><thead><tr><th>№</th><th>${esc(a('payments'))}</th><th>${esc(a('r_user'))}</th><th>${esc(a('amount'))}</th><th>${esc(a('status'))}</th><th></th></tr></thead><tbody>
      ${ps.map((p) => `<tr><td class="muted">№${p.id}<br>${esc(fmtDate(p.created_at, true))}</td><td>${esc(p.title)}<br><span class="tiny muted">${esc(p.provider)}</span></td>
        <td><a class="link-blue" href="/admin/users/${p.user_id}">#${p.user_id}</a></td><td><b>${esc(p.formatted)}</b></td>
        <td><span class="tag ${p.status === 'paid' ? 'green' : p.status === 'pending' ? 'orange' : 'grey'}">${esc(t(`pst_${p.status}`))}</span></td>
        <td style="white-space:nowrap">${p.status === 'pending' || p.status === 'cancelled' ? `<button class="btn btn-soft btn-sm" data-mp="${p.id}">${esc(a('mark_paid'))}</button>` : ''}${p.status === 'paid' && p.purpose !== 'topup' ? `<button class="btn btn-ghost btn-sm" data-rf="${p.id}">${esc(a('refund_wallet'))}</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="6" class="empty">${esc(a('empty'))}</td></tr>`}</tbody></table></div>`;
  } else if (tab === 'manual') {
    const ps = await api('/admin/payments?manual=1');
    body = `<p class="small muted" style="margin:0 0 12px">${esc(a('manual_hint'))}</p><div class="box adm-table-box"><table class="adm-table"><thead><tr><th>№</th><th>${esc(a('r_user'))}</th><th>${esc(a('amount'))}</th><th>${esc(a('status'))}</th><th></th></tr></thead><tbody>
      ${ps.map((p) => `<tr><td class="muted">№${p.id}<br>${esc(fmtDate(p.created_at, true))}</td>
        <td><a class="link-blue" href="/admin/users/${p.user_id}">${esc(p.user_name || `#${p.user_id}`)}</a><br><span class="tiny muted">${esc(p.user_phone)}</span></td>
        <td><b>${esc(p.formatted)}</b><br><span class="tiny muted">${esc(p.title)}</span></td>
        <td>${p.manual?.claimed_at ? `<span class="tag green">${esc(a('manual_claimed'))}</span><br><span class="tiny muted">${esc(fmtDate(p.manual.claimed_at, true))}</span>${p.manual.note ? `<br><span class="small">«${esc(p.manual.note)}»</span>` : ''}` : `<span class="tag grey">${esc(a('manual_not_claimed'))}</span>`}</td>
        <td style="white-space:nowrap"><button class="btn btn-primary btn-sm" data-mp="${p.id}">${esc(a('approve_tick'))}</button> <button class="btn btn-ghost btn-sm" data-rj="${p.id}">${esc(a('reject'))}</button></td></tr>`).join('') || `<tr><td colspan="5" class="empty">${esc(a('empty'))}</td></tr>`}</tbody></table></div>`;
  } else {
    const w = await api(`/admin/wallet${qs({ page: query.page })}`);
    body = `<div class="box adm-table-box"><table class="adm-table"><thead><tr><th>${esc(a('when'))}</th><th>${esc(a('r_user'))}</th><th>${esc(a('kind'))}</th><th>${esc(a('amount'))}</th><th>${esc(a('balance'))}</th></tr></thead><tbody>
      ${w.items.map((x) => `<tr><td class="muted">${esc(fmtDate(x.created_at, true))}</td><td><a class="link-blue" href="/admin/users/${x.user.id}">${esc(x.user.name || x.user.phone)}</a></td>
        <td>${esc(x.kind_label)}${x.note ? `<br><span class="tiny muted">${esc(x.note)}</span>` : ''}${x.admin ? `<br><span class="tiny muted">${esc(a('by_admin'))}: ${esc(x.admin)}</span>` : ''}</td>
        <td class="${x.sign === '+' ? 'green' : 'red'}"><b>${x.sign}${esc(x.formatted)}</b>${x.original ? `<br><span class="tiny muted">${esc(x.original)}</span>` : ''}</td><td class="muted">${esc(x.balance_after)}</td></tr>`).join('') || `<tr><td colspan="5" class="empty">${esc(a('empty'))}</td></tr>`}</tbody></table></div>${pager(w, '/admin/finance', query)}`;
  }
  const html = shell('finance', a('nav_finance'), '', `<div class="tabs"><a class="tab ${tab === 'payments' ? 'on' : ''}" href="/admin/finance">${esc(a('payments'))}</a><a class="tab ${tab === 'manual' ? 'on' : ''}" href="/admin/finance?tab=manual">${esc(a('manual_tab'))}</a><a class="tab ${tab === 'wallet' ? 'on' : ''}" href="/admin/finance?tab=wallet">${esc(a('wallet_tx'))}</a></div>${body}`);
  return {
    title: a('nav_finance'),
    html,
    mount(main) {
      main.addEventListener('click', async (e) => {
        const mp = e.target.closest('[data-mp]');
        if (mp && await confirmBox(tab === 'manual' ? a('approve_tick') : a('mark_paid'))) { await api(`/admin/payments/${mp.dataset.mp}/mark-paid`, { method: 'POST' }); return refresh(); }
        const rj = e.target.closest('[data-rj]');
        if (rj) {
          const m = openModal(`<h3>${esc(a('reject'))}</h3><form style="margin-top:10px"><label class="lbl">${esc(a('reject_reason'))}</label><textarea class="input" name="reason" rows="3" maxlength="300"></textarea><button class="btn btn-danger btn-block" style="margin-top:12px">${esc(a('reject'))}</button></form>`);
          m.querySelector('form').onsubmit = async (ev) => { ev.preventDefault(); await api(`/admin/payments/${rj.dataset.rj}/reject`, { method: 'POST', body: { reason: ev.target.reason.value.trim() || undefined } }); closeModal(); refresh(); };
          return;
        }
        const rf = e.target.closest('[data-rf]');
        if (rf && await confirmBox(a('refund_wallet'))) { await api(`/admin/payments/${rf.dataset.rf}/refund`, { method: 'POST', body: { to_wallet: true } }); refresh(); }
      });
    },
  };
}

// ---------- Push-tarqatma ----------
async function broadcast({ query }) {
  const hist = await api('/admin/broadcasts');
  const html = shell('broadcast', a('nav_broadcast'), '', `
    <div class="adm-grid2 wide-left">
      <form class="box" data-bf>
        <div class="form-grid">
          ${field(a('b_title'), inp('title', '', 'required maxlength="120"'), 'full')}
          ${field(a('b_body'), '<textarea class="input" name="body" rows="4" required maxlength="1000"></textarea>', 'full')}
          ${field(a('b_link'), inp('link', '', 'placeholder="/plans" list="adm-pages" autocomplete="off"'), 'full')}${pagesList()}
        </div>
        <h3 style="margin-top:18px">${esc(a('audience'))}</h3>
        <div class="form-grid">
          ${field(a('type'), sel('account_type', ACCOUNT_TYPES.map((k) => [k, typeLabel(k)]), '').replace(`>${esc(a('all'))}<`, `>${esc(a('any'))}<`))}
          ${field(a('country'), sel('country', countries(), '').replace(`>${esc(a('all'))}<`, `>${esc(a('any'))}<`))}
          ${field(t('language'), sel('lang', state.meta.languages.map((l) => [l.code, l.name]), '').replace(`>${esc(a('all'))}<`, `>${esc(a('any'))}<`))}
          ${field(a('role'), sel('role', [['user', a('r_user')], ['moderator', a('r_moderator')], ['admin', a('r_admin')]], '').replace(`>${esc(a('all'))}<`, `>${esc(a('any'))}<`))}
          ${field(a('active_days'), inp('active_days', '', 'type="number" min="1" max="3650"'))}
          ${field(a('user_ids'), inp('user_ids', query.user_ids || '', 'placeholder="12, 45, 78"'))}
          <label class="check full"><input type="checkbox" name="verified_companies"> ${esc(a('verified_only'))}</label>
        </div>
        <h3 style="margin-top:18px">${esc(a('channels'))}</h3>
        <div class="adm-chips"><label class="check"><input type="checkbox" name="ch_inapp" checked> ${esc(a('ch_inapp'))}</label><label class="check"><input type="checkbox" name="ch_push" checked> ${esc(a('ch_push'))}</label><label class="check"><input type="checkbox" name="ch_telegram"> ${esc(a('ch_telegram'))}</label></div>
        <div class="adm-reach" data-reach>…</div>
        <button class="btn btn-accent btn-block" style="margin-top:12px">${icon('send')} ${esc(a('send'))}</button>
      </form>
      <div>
        <div class="box"><h3>${esc(a('preview'))}</h3><div class="adm-notif"><img class="mk" src="/img/icon-192.png" alt=""><div><b data-pt>HEMU.UZ</b><p data-pb>…</p><span class="tiny muted">hemu.uz</span></div></div></div>
        <div class="box"><h3>${esc(a('history'))}</h3>${hist.map((b) => `<div class="adm-line"><div><b>${esc(b.title)}</b><span>${esc(b.body.slice(0, 90))}</span><span class="tiny muted">${esc(fmtDate(b.created_at, true))} · ${esc(b.admin_name || '')}</span></div><div class="adm-reachmini"><b>${num(b.recipients)}</b><span>push ${b.push_sent} · tg ${b.telegram_sent}</span></div></div>`).join('') || `<div class="empty">${esc(a('empty'))}</div>`}</div>
      </div>
    </div>`);
  return {
    title: a('nav_broadcast'),
    html,
    mount(main) {
      const f = $('[data-bf]', main);
      const audience = () => {
        const x = {};
        for (const k of ['account_type', 'country', 'lang', 'role']) if (f[k].value) x[k] = f[k].value;
        if (f.active_days.value) x.active_days = Number(f.active_days.value);
        const ids = f.user_ids.value.split(/[\s,;]+/).map(Number).filter((n) => n > 0);
        if (ids.length) x.user_ids = ids;
        if (f.verified_companies.checked) x.verified_companies = true;
        return x;
      };
      let reach = 0;
      const preview = debounce(async () => {
        const r = await api('/admin/broadcast/preview', { method: 'POST', body: { audience: audience() } });
        reach = r.recipients;
        $('[data-reach]', main).innerHTML = `${icon('user')} <b>${num(r.recipients)}</b> ${esc(a('recipients'))} · ${num(r.with_push)} ${esc(a('with_push'))} · ${num(r.with_telegram)} ${esc(a('with_tg'))}`;
      }, 250);
      const syncPrev = () => { $('[data-pt]', main).textContent = f.title.value || 'HEMU.UZ'; $('[data-pb]', main).textContent = f.body.value || '…'; };
      f.addEventListener('input', (e) => { syncPrev(); if (!['title', 'body', 'link'].includes(e.target.name)) preview(); });
      f.addEventListener('change', preview);
      preview();
      f.onsubmit = async (e) => {
        e.preventDefault();
        if (!checkLink(f.link)) return;
        if (!(await confirmBox(a('send_q', { n: num(reach) })))) return;
        const r = await api('/admin/broadcast', { method: 'POST', body: { title: f.title.value.trim(), body: f.body.value.trim(), link: f.link.value.trim() || undefined, audience: audience(), channels: { inapp: f.ch_inapp.checked, push: f.ch_push.checked, telegram: f.ch_telegram.checked } } });
        toast(a('sent', { n: num(r.recipients), p: r.push_sent, t: r.telegram_sent }), 'ok');
        refresh();
      };
    },
  };
}

// ---------- Shikoyat, nizo, ko'rik, qora ro'yxat (mavjud ekranlar) ----------
async function trust({ query }) {
  const tab = ['reports', 'disputes', 'inspections', 'blacklist'].includes(query.tab) ? query.tab : 'reports';
  const legacy = await (await import('./account.js')).admin({ query: { tab } }, true);
  const tabs = [['reports', t('admin_reports')], ['disputes', t('admin_disputes')], ['inspections', t('admin_inspections')], ['blacklist', t('admin_blacklist')]];
  return {
    title: a('nav_trust'),
    html: shell('trust', a('nav_trust'), '', `<div class="tabs">${tabs.map(([v, l]) => `<a class="tab ${tab === v ? 'on' : ''}" href="/admin/trust?tab=${v}">${esc(l)}</a>`).join('')}</div>${legacy.html}`),
    mount: legacy.mount,
  };
}

// ---------- Server ----------
const CFG = { env: 'NODE_ENV', site_url: 'Site URL', payments_dev: 'Test payments', otp_dev_echo: 'SMS dev mode', sms_provider: 'SMS provider', telegram: 'Telegram bot', click: 'Click', payme: 'Payme' };
async function system() {
  const s = await api('/admin/system');
  const memUsed = s.memory.total - s.memory.free;
  const view = (x) => `
    <div class="adm-stats gauges">
      <div class="adm-stat">${gauge(x.cpu.now?.sys, a('cpu'), `${esc(x.host.cpus)} × ${esc((x.host.cpu_model || '').slice(0, 34))}<br>${esc(a('process'))}: ${x.cpu.now?.proc ?? 0}% · load ${x.host.loadavg.map((v) => v.toFixed(2)).join(' / ')}`)}</div>
      <div class="adm-stat">${gauge(((x.memory.total - x.memory.free) / x.memory.total) * 100, a('ram'), `${bytes(x.memory.total - x.memory.free)} / ${bytes(x.memory.total)}<br>Node RSS ${bytes(x.process.rss)} · heap ${bytes(x.process.heap_used)}`)}</div>
      ${x.disk ? `<div class="adm-stat">${gauge(((x.disk.total - x.disk.free) / x.disk.total) * 100, a('disk'), diskText(x.disk))}</div>` : ''}
    </div>
    <div class="adm-stats">
    </div>
    <div class="adm-stats">
      <div class="adm-stat"><span>${esc(a('uptime'))}</span><b>${dur(x.process.uptime_sec)}</b><em>${esc(a('host'))}: ${dur(x.host.uptime_sec)}</em></div>
      <div class="adm-stat"><span>${esc(a('req_min'))}</span><b>${x.requests.per_min_5}</b><em>${x.requests.avg_ms_5} ms · ${num(x.requests.totals.count)} ${esc(a('total'))}</em></div>
      <div class="adm-stat"><span>${esc(a('errors_5xx'))}</span><b class="${x.requests.totals.err5 ? 'red' : ''}">${x.requests.totals.err5}</b><em>4xx: ${num(x.requests.totals.err4)}</em></div>
    </div>
    <div class="adm-grid2">
      <div class="box"><h3>${esc(a('cpu'))} / ${esc(a('ram'))} <small>${esc(a('auto_refresh'))}</small></h3>${lines(x.cpu.series, [['sys', 'var(--blue)', true], ['proc', 'var(--yellow-h)'], ['mem', 'var(--teal)']], { max: 100 })}
        <div class="adm-legend"><span style="--c:var(--blue)">CPU</span><span style="--c:var(--yellow-h)">Node.js</span><span style="--c:var(--teal)">RAM</span></div></div>
      <div class="box"><h3>${esc(a('req_min'))} <small>30 min</small></h3>${lines(x.requests.series, [['count', 'var(--blue)', true], ['err', 'var(--red)']])}
        <div class="adm-legend"><span style="--c:var(--blue)">${esc(a('req_min'))}</span><span style="--c:var(--red)">5xx</span></div></div>
    </div>`;
  const html = shell('system', a('nav_system'), `${esc(s.host.hostname)} · ${esc(s.host.platform)} · Node ${esc(s.process.node)} · PID ${s.process.pid}`, `
    <div data-live>${view(s)}</div>
    <div class="adm-grid3">
      <div class="box"><h3>${esc(a('storage'))}</h3><div class="adm-kv"><span>${esc(a('db'))}</span><b>${bytes(s.storage.db)}</b><span>WAL</span><b>${bytes(s.storage.wal)}</b><span>${esc(a('uploads'))}</span><b>${bytes(s.storage.uploads.bytes)} · ${num(s.storage.uploads.files)}</b></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn btn-accent btn-sm" data-backup>${icon('upload')} ${esc(a('backup'))}</button><button class="btn btn-soft btn-sm" data-clean>${esc(a('cleanup'))}</button></div></div>
      <div class="box"><h3>${esc(a('integrations'))}</h3><div class="adm-kv">${Object.entries(s.config).map(([k, v]) => `<span>${esc(CFG[k] || k)}</span><b>${typeof v === 'boolean' ? `<span class="tag ${v ? 'green' : 'grey'}">${esc(a(v ? 'on' : 'off'))}</span>` : esc(String(v))}</b>`).join('')}</div></div>
      <div class="box"><h3>${esc(a('tables'))}</h3><div class="adm-kv small">${s.tables.filter((x) => x.rows).sort((p, q) => q.rows - p.rows).slice(0, 16).map((x) => `<span class="mono">${esc(x.name)}</span><b>${num(x.rows)}</b>`).join('')}</div></div>
    </div>
    <div class="box"><h3>${esc(a('last_errors'))}</h3>${s.errors.length ? s.errors.map((e) => `<div class="adm-err"><b>${esc(e.method)} ${esc(e.path)}</b><span>${esc(fmtDate(e.time, true))}</span><code>${esc(e.message)}</code></div>`).join('') : `<div class="empty">${icon('check')} ${esc(a('no_errors'))}</div>`}</div>`);
  return {
    title: a('nav_system'),
    html,
    mount(main) {
      const timer = setInterval(async () => {
        try { const x = await api('/admin/system', { silent: true }); const box = $('[data-live]', main); if (box) box.innerHTML = view(x); } catch { /* */ }
      }, 5000);
      main.addEventListener('click', async (e) => {
        if (e.target.closest('[data-backup]')) {
          const r = await fetch('/api/v1/admin/system/backup', { headers: { Authorization: `Bearer ${state.token}` } });
          if (!r.ok) return toast(t('error'), 'err');
          const url = URL.createObjectURL(await r.blob());
          const el = Object.assign(document.createElement('a'), { href: url, download: `hemu-${new Date().toISOString().slice(0, 10)}.db` });
          document.body.append(el); el.click(); el.remove();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        }
        if (e.target.closest('[data-clean]')) { const r = await api('/admin/system/cleanup', { method: 'POST' }); toast(`${a('saved')}: ${Object.entries(r).map(([k, v]) => `${k} ${v}`).join(', ')}`, 'ok'); }
      });
      return () => clearInterval(timer);
    },
  };
}

// ---------- Reklama bannerlari (bosh sahifa karuseli) ----------
const BAN_DEF = [['ban1_t', 'ban1_s', 'ban1_c'], ['ban2_t', 'ban2_s', 'ban2_c'], ['ban3_t', 'ban3_s', 'post_listing']];
async function bannersPage() {
  const r = await api('/admin/banners');
  let list = r.items.map((b) => ({ ...b }));
  const def = (i, j) => { const k = BAN_DEF[list[i]?.slot - 1]; return k ? t(k[j]) : ''; };
  const preview = (b, i) => `<div class="ad-txt"><span class="ad-label">${esc(t('ad_label'))}</span><h3>${esc(b.title || def(i, 0))}</h3>${b.text || def(i, 1) ? `<p>${esc(b.text || def(i, 1))}</p>` : ''}${b.cta || def(i, 2) ? `<span class="ad-cta">${esc(b.cta || def(i, 2))} ${icon('arrow')}</span>` : ''}</div>${b.image ? `<div class="ad-img" style="background-image:url('${esc(b.image)}')"></div>` : ''}`;
  const card = (b, i) => `<div class="box adm-ban ${b.active ? '' : 'off'}" data-i="${i}">
    <div class="adm-ban-head"><b>#${i + 1}</b>${b.uid && r.stats?.[b.uid] ? `<span class="adm-ban-stat" title="${esc(a('stats_30d'))}">${icon('eye')} ${num(r.stats[b.uid].views)} · ${esc(a('clicks'))} ${num(r.stats[b.uid].clicks)} · ${esc(a('ctr'))} ${r.stats[b.uid].views ? ((r.stats[b.uid].clicks / r.stats[b.uid].views) * 100).toFixed(1) : '0'}%</span>` : ''}
      <label class="toggle" title="${esc(a('ban_active'))}"><input type="checkbox" data-k="active" ${b.active ? 'checked' : ''}><span></span></label><span class="small muted">${esc(a(b.active ? 'ban_active' : 'ban_hidden'))}</span>
      <span style="flex:1"></span>
      <button type="button" class="btn btn-ghost btn-sm" data-move="-1" ${i ? '' : 'disabled'} aria-label="up">↑</button>
      <button type="button" class="btn btn-ghost btn-sm" data-move="1" ${i < list.length - 1 ? '' : 'disabled'} aria-label="down">↓</button>
      <button type="button" class="btn btn-ghost btn-sm red" data-rm>${icon('trash')}</button></div>
    <div class="adm-ban-body">
      <div class="ad-slide ${esc(b.theme)} adm-ban-prev" data-prev>${preview(b, i)}</div>
      <div class="form-grid">
        ${field(a('ban_title'), `<input class="input" data-k="title" maxlength="120" value="${esc(b.title)}" placeholder="${esc(def(i, 0))}">`, 'full')}
        ${field(a('ban_text'), `<input class="input" data-k="text" maxlength="240" value="${esc(b.text)}" placeholder="${esc(def(i, 1))}">`, 'full')}
        ${field(a('ban_cta'), `<input class="input" data-k="cta" maxlength="40" value="${esc(b.cta)}" placeholder="${esc(def(i, 2))}">`)}
        ${field(a('ban_link'), `<input class="input" data-k="link" maxlength="300" value="${esc(b.link)}" placeholder="/catalog?category=special" list="adm-pages" autocomplete="off">`)}
        ${field(a('ban_theme'), `<select class="input" data-k="theme">${r.themes.map((th) => `<option value="${th}" ${th === b.theme ? 'selected' : ''}>${esc(a(`th_${th}`))}</option>`).join('')}</select>`)}
        ${field(a('ban_image'), `<div style="display:flex;gap:6px"><input class="input" data-k="image" value="${esc(b.image)}" placeholder="/uploads/banners/…"><label class="btn btn-soft" style="flex:none">${icon('upload')}<input type="file" accept="image/jpeg,image/png,image/webp" data-file hidden></label></div>`)}
      </div>
    </div></div>`;
  const draw = (main) => {
    $('[data-bans]', main).innerHTML = list.map(card).join('') || `<div class="box empty">${esc(a('empty'))}</div>`;
    $('[data-add]', main).disabled = list.length >= r.max;
  };
  const html = shell('banners', a('nav_banners'), esc(a('ban_hint')), `
    <div data-bans></div>${pagesList()}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px"><button type="button" class="btn btn-soft" data-add>${icon('plus')} ${esc(a('ban_add'))}</button><button type="button" class="btn btn-primary" data-save>${esc(a('save'))}</button><a class="btn btn-ghost" href="/" target="_blank">${icon('eye')} ${esc(a('to_site'))}</a></div>`);
  return {
    title: a('nav_banners'),
    html,
    mount(main) {
      draw(main);
      const at = (el) => Number(el.closest('[data-i]').dataset.i);
      const live = (el) => {
        const i = at(el);
        const k = el.dataset.k;
        list[i][k] = k === 'active' ? el.checked : el.value.trim();
        const box = el.closest('[data-i]');
        const prev = $('[data-prev]', box);
        prev.className = `ad-slide ${list[i].theme} adm-ban-prev`;
        prev.innerHTML = preview(list[i], i);
        box.classList.toggle('off', !list[i].active);
      };
      main.addEventListener('input', (e) => { if (e.target.dataset.k) live(e.target); });
      main.addEventListener('change', async (e) => {
        if (e.target.dataset.k) return live(e.target);
        if (e.target.matches('[data-file]') && e.target.files[0]) {
          const i = at(e.target);
          const form = new FormData();
          // Karusel o'lchamiga avtomatik keltiriladi (1200×600, markazdan)
          form.append('image', await fitImage(e.target.files[0], { w: 1200, h: 600, cover: true }));
          const up = await api('/admin/banners/image', { method: 'POST', form });
          list[i].image = up.url;
          draw(main);
        }
      });
      main.addEventListener('click', async (e) => {
        const mv = e.target.closest('[data-move]');
        if (mv) {
          const i = at(mv);
          const j = i + Number(mv.dataset.move);
          [list[i], list[j]] = [list[j], list[i]];
          return draw(main);
        }
        if (e.target.closest('[data-rm]')) {
          if (!(await confirmBox(a('ban_rm_q')))) return;
          list.splice(at(e.target), 1);
          return draw(main);
        }
        if (e.target.closest('[data-add]')) {
          list.push({ title: '', text: '', cta: '', link: '/', image: '', theme: 'navy', active: true });
          return draw(main);
        }
        if (e.target.closest('[data-save]')) {
          for (const el of main.querySelectorAll('[data-k="link"]')) if (!checkLink(el)) return;
          const res = await api('/admin/banners', { method: 'PUT', body: { items: list } });
          list = res.items.map((b) => ({ ...b }));
          draw(main);
          toast(a('saved'), 'ok');
        }
      });
    },
  };
}

// ---------- Sozlamalar ----------
async function settings() {
  const [items, legacy] = await Promise.all([api('/admin/settings'), (await import('./account.js')).admin({ query: { tab: 'rates' } }, true)]);
  const by = Object.fromEntries(items.map((x) => [x.key, x]));
  const GROUPS = [
    // VIP / GOLD / PREMIUM narxlari — alohida bo'limda (/admin/tiers)
    ['g_prices', ['prices.plan.business', 'prices.inspection', 'prices.badge', 'manualPay.card', 'manualPay.holder', 'manualPay.info']],
    ['g_donate', ['donate.enabled', 'donate.card', 'donate.holder']],
    ['g_limits', ['freeListingLimit', 'businessTopCredits', 'escrowFeePct']],
    ['g_platform', ['registrationOpen', 'autoApproveVerified', 'requireCompanyDocs', 'supportPhone', 'supportTelegram', 'announcementType', 'announcement']],
    ['g_bonus', ['welcomeBonus.enabled', 'welcomeBonus.amount', 'welcomeBonus.currency']],
  ];
  const ctl = (x) => {
    if (x.type === 'bool') return `<label class="set-row" style="margin:0"><span>${esc(a(x.key))}</span><label class="toggle"><input type="checkbox" name="${x.key}" ${x.value ? 'checked' : ''}><span></span></label></label>`;
    if (x.type === 'enum') return field(a(x.key), `<select class="input" name="${x.key}">${x.values.map((v) => `<option ${v === x.value ? 'selected' : ''}>${v}</option>`).join('')}</select>`);
    if (x.key === 'announcement') return field(a(x.key), `<textarea class="input" name="${x.key}" rows="2" maxlength="500">${esc(x.value || '')}</textarea>`, 'full');
    return field(a(x.key), inp(x.key, x.value, x.type === 'string' ? '' : `type="number" step="${x.type === 'int' ? 1 : 0.01}" min="${x.min}" max="${x.max}"`));
  };
  const html = shell('settings', a('nav_settings'), '', `
    <form data-sf>${GROUPS.map(([g, keys]) => `<div class="box"><h3>${esc(a(g))}</h3><div class="form-grid">${keys.filter((k) => by[k]).map((k) => ctl(by[k])).join('')}</div></div>`).join('')}
      <button class="btn btn-primary">${esc(a('save'))}</button></form>
    <div class="box" style="margin-top:16px"><h3>${esc(a('my_account'))}</h3><p class="tiny muted" style="margin-top:-6px">${esc(a('my_account_hint'))}</p>
      <form class="form-grid" data-me>${field(a('login_phone'), inp('phone', state.user.phone, 'type="tel"'))}${field(t('name'), inp('name', state.user.name))}
        <div class="full" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-soft">${esc(a('save'))}</button><button type="button" class="btn btn-soft" data-mypw>${icon('shield')} ${esc(a('set_password'))}</button></div></form></div>
    <h2 class="adm-h2">${esc(a('rates'))}</h2>${legacy.html}`);
  return {
    title: a('nav_settings'),
    html,
    mount(main) {
      $('[data-sf]', main).onsubmit = async (e) => {
        e.preventDefault();
        const f = e.target;
        const body = {};
        for (const x of items) {
          const el = f.elements[x.key];
          if (!el) continue;
          body[x.key] = x.type === 'bool' ? el.checked : x.type === 'number' || x.type === 'int' ? Number(el.value) : el.value;
        }
        const r = await api('/admin/settings', { method: 'PUT', body });
        toast(`${a('saved')}${Object.keys(r.changed).length ? ` · ${Object.keys(r.changed).length}` : ''}`, 'ok');
        try { state.platform = await api('/platform'); } catch { /* */ }
        refresh();
      };
      $('[data-me]', main).onsubmit = async (e) => {
        e.preventDefault();
        await api(`/admin/users/${state.user.id}`, { method: 'PATCH', body: { phone: e.target.phone.value.trim(), name: e.target.name.value.trim() } });
        toast(a('saved'), 'ok');
        try { state.user = await api('/me'); } catch { /* login o'zgargan bo'lsa qayta kirish kerak */ location.reload(); }
      };
      $('[data-mypw]', main).onclick = () => passwordModal(state.user.id, true);
      return legacy.mount?.(main);
    },
  };
}

// ---------- Jurnal ----------
async function log({ query }) {
  const r = await api(`/admin/log${qs(query)}`);
  const target = (x) => (x.target_type === 'user' ? `<a class="link-blue" href="/admin/users/${x.target_id}">user #${x.target_id}</a>` : x.target_type === 'company' ? `<a class="link-blue" href="/admin/companies/${x.target_id}">company #${x.target_id}</a>` : x.target_type === 'listing' ? `<a class="link-blue" href="/listing/${x.target_id}" target="_blank">listing #${x.target_id}</a>` : x.target_type ? `${esc(x.target_type)} #${x.target_id}` : '—');
  const html = shell('log', a('nav_log'), '', `
    <form class="box adm-filters" data-f>${sel('action', ['user', 'balance', 'company', 'listing', 'order', 'payment', 'broadcast', 'settings', 'system', 'rates'].map((k) => [k, k]), query.action)}<button class="btn btn-primary">${icon('search')} ${esc(a('search'))}</button></form>
    <div class="box adm-table-box"><table class="adm-table"><thead><tr><th>${esc(a('when'))}</th><th>${esc(a('who'))}</th><th>${esc(a('action'))}</th><th>${esc(a('target'))}</th><th>${esc(a('details'))}</th></tr></thead><tbody>
      ${r.items.map((x) => `<tr><td class="muted">${esc(fmtDate(x.created_at, true))}</td><td>${esc(x.admin_name || x.admin_phone || '—')}<br><span class="tiny muted">${esc(x.ip || '')}</span></td><td><span class="tag">${esc(x.action)}</span></td><td>${target(x)}</td><td class="mono tiny">${esc(x.details ? JSON.stringify(x.details).slice(0, 200) : '')}</td></tr>`).join('') || `<tr><td colspan="5" class="empty">${esc(a('empty'))}</td></tr>`}</tbody></table></div>
    ${pager(r, '/admin/log', query)}`);
  return { title: a('nav_log'), html, mount(main) { bindFilters(main, '/admin/log'); } };
}

// ---------- E'longa VIP / GOLD / PREMIUM berish (admin va moderator, bepul) ----------
function tierModal(lid) {
  const m = openModal(`<h3>${esc(a('set_tier'))}</h3><form class="form-grid" style="margin-top:10px">
    ${field(a('nav_tiers'), sel('tier', [['vip', 'VIP'], ['gold', 'GOLD'], ['premium', 'PREMIUM'], ['none', a('tier_none')]], 'vip', false), 'full')}
    ${field(a('days'), inp('days', 7, 'type="number" min="1" max="365"'), 'full')}
    <div class="full"><button class="btn btn-accent btn-block">${icon('star')} ${esc(a('save'))}</button></div></form>`);
  m.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    await api(`/admin/listings/${lid}`, { method: 'PATCH', body: f.tier.value === 'none' ? { tier: 'none' } : { tier: f.tier.value, tier_days: Number(f.days.value) } });
    closeModal();
    toast(a('saved'), 'ok');
    refresh();
  };
}

// ---------- Mavsumiy aksiyalar ----------
const PROMO_THEMES = [['green', '🟢'], ['orange', '🟠'], ['blue', '🔵'], ['red', '🔴'], ['purple', '🟣']];
const MD_PATTERN = 'pattern="(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])"';
function promoForm(p = {}) {
  const roots = (state.cats || []).filter((c) => !c.parent_id);
  const L3 = (k, o) => ['uz', 'ru', 'en'].map((l) => field(`${a(k)} · ${l.toUpperCase()}`, inp(`${k}_${l}`, o?.[l], 'maxlength="120"'))).join('');
  return `<form class="promo-adm-form" data-pf="${p.id || ''}">
    <div class="form-grid">
      ${L3('promo_name', p.names)}${L3('promo_sub', p.subtitles)}
      ${field('Slug (URL)', inp('slug', p.slug, 'required pattern="[a-z0-9-]{2,40}" placeholder="bahor"'))}
      ${field('Emoji', inp('emoji', p.emoji, 'maxlength="8" placeholder="🌱"'))}
      ${field(a('promo_theme'), sel('theme', PROMO_THEMES.map(([v, e]) => [v, `${e} ${v}`]), p.theme || 'orange', false))}
      ${field(a('promo_max'), inp('max_discount', p.max_discount ?? 20, 'type="number" min="1" max="90" required'))}
      ${field(a('promo_from'), inp('start_md', p.start_md, `${MD_PATTERN} placeholder="03-15"`))}
      ${field(a('promo_to'), inp('end_md', p.end_md, `${MD_PATTERN} placeholder="11-15"`))}
      <p class="tiny muted full" style="margin:-4px 0 0">${esc(a('promo_dates_hint'))}</p>
      <div class="full"><label class="lbl">${esc(a('promo_cats'))}</label><div class="pick-grid">${roots.map((c) => `<label class="pick"><input type="checkbox" name="cat" value="${esc(c.slug)}" ${(p.categories || []).includes(c.slug) ? 'checked' : ''}><span>${esc(c.name)}</span></label>`).join('')}</div></div>
      <label class="check full"><input type="checkbox" name="active" ${!p.id || p.active ? 'checked' : ''}> ${esc(a('promo_enabled'))}</label>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn btn-primary">${esc(a('save'))}</button>${p.id ? `<a class="btn btn-soft" href="/aksiya/${esc(p.slug)}" target="_blank">${esc(a('promo_open'))}</a><button type="button" class="btn btn-ghost" data-pdel="${p.id}" title="${esc(t('delete'))}">${icon('trash')}</button>` : ''}</div>
  </form>`;
}
async function promosPage() {
  const list = await api('/admin/promos');
  const status = (p) => (p.status === 'moderation' ? ['orange', a('promo_pending')] : p.status === 'rejected' ? ['red', a('promo_rejected')] : p.live ? ['green', a('promo_live')] : p.active ? ['orange', a('promo_off')] : ['grey', a('promo_disabled')]);
  // Sotuvchi aksiyasi: matnini ko'rib, tasdiqlash yoki rad etish
  const sellerRow = (p) => `<div class="box promo-adm t-${esc(p.theme)}">
      <div class="promo-adm-hd"><span class="pt-emoji">${esc(p.emoji || '')}</span><div class="grow"><b>${esc(p.name)}</b><span class="tiny muted">${esc(a('promo_seller'))}: ${esc(p.seller?.name || '')}${p.seller?.verified ? ' ✔' : ''} · −${p.max_discount}% · ${esc(p.starts_on || '')} → ${esc(p.ends_on || '')} · ${esc(a('promo_listings'))}: ${num(p.count)}</span>${p.subtitle ? `<span class="small">${esc(p.subtitle)}</span>` : ''}${p.reject_reason ? `<span class="tiny" style="color:var(--red)">${esc(p.reject_reason)}</span>` : ''}</div>
        <span class="tag ${status(p)[0]}">${esc(status(p)[1])}</span></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${p.status !== 'active' ? `<button class="btn btn-primary btn-sm" data-pst="active" data-id="${p.id}">${icon('check')} ${esc(a('promo_approve'))}</button>` : ''}
        ${p.status !== 'rejected' ? `<button class="btn btn-ghost btn-sm" data-pst="rejected" data-id="${p.id}">${icon('x')} ${esc(a('promo_reject'))}</button>` : ''}
        <a class="btn btn-soft btn-sm" href="/aksiya/${esc(p.slug)}" target="_blank">${esc(a('promo_open'))}</a>
        <button type="button" class="btn btn-ghost btn-sm" data-pdel="${p.id}">${icon('trash')}</button>
      </div></div>`;
  const html = shell('promos', a('nav_promos'), esc(a('promos_hint')), `
    <details class="box promo-adm-new"><summary class="btn btn-primary">${icon('plus')} ${esc(a('promo_new'))}</summary><div style="margin-top:14px">${promoForm()}</div></details>
    ${list.map((p) => (p.owner_user_id ? sellerRow(p) : `<div class="box promo-adm t-${esc(p.theme)}">
      <div class="promo-adm-hd"><span class="pt-emoji">${esc(p.emoji || '')}</span><div class="grow"><b>${esc(p.name)}</b><span class="tiny muted">${esc(p.start_md && p.end_md ? `${p.start_md} → ${p.end_md}` : '∞')} · ${esc(a('promo_listings'))}: ${num(p.count)}</span></div>
        <span class="tag ${status(p)[0]}">${esc(status(p)[1])}</span></div>
      <details><summary class="link-blue small">${esc(a('promo_edit'))}</summary><div style="margin-top:12px">${promoForm(p)}</div></details>
    </div>`)).join('')}`);
  return {
    title: a('nav_promos'),
    html,
    mount(main) {
      main.addEventListener('submit', async (e) => {
        const f = e.target.closest('[data-pf]');
        if (!f) return;
        e.preventDefault();
        const pick = (k) => Object.fromEntries(['uz', 'ru', 'en'].map((l) => [l, f[`${k}_${l}`].value.trim()]));
        const body = {
          slug: f.slug.value.trim(), names: pick('promo_name'), subtitles: pick('promo_sub'), emoji: f.emoji.value.trim(),
          theme: f.theme.value, max_discount: Number(f.max_discount.value), start_md: f.start_md.value.trim(), end_md: f.end_md.value.trim(),
          categories: $$('[name=cat]:checked', f).map((x) => x.value), active: f.active.checked,
        };
        if (f.dataset.pf) await api(`/admin/promos/${f.dataset.pf}`, { method: 'PUT', body });
        else await api('/admin/promos', { method: 'POST', body });
        toast(t('saved'), 'ok');
        render({ keepScroll: true });
      });
      main.addEventListener('click', async (e) => {
        const st = e.target.closest('[data-pst]');
        if (st) {
          const body = { status: st.dataset.pst };
          if (body.status === 'rejected') {
            const reason = window.prompt(a('promo_reason'));
            if (reason === null) return;
            body.reject_reason = reason.trim();
          }
          await api(`/admin/promos/${st.dataset.id}`, { method: 'PUT', body });
          toast(t('saved'), 'ok');
          render({ keepScroll: true });
          return;
        }
        const d = e.target.closest('[data-pdel]');
        if (!d || !(await confirmBox(a('promo_del_q')))) return;
        await api(`/admin/promos/${d.dataset.pdel}`, { method: 'DELETE' });
        render({ keepScroll: true });
      });
    },
  };
}

// ---------- VIP / GOLD / PREMIUM: narxlar va faol e'lonlar ----------
async function tiersPage() {
  const r = await api('/admin/tiers');
  // Taxminiy qiymat boshqa valyutada: so'mda kiritilsa — USD, aks holda — so'm
  let cur = r.currency;
  const rate = (c) => (c === 'USD' ? 1 : Number(r.rates?.[c]?.rate ?? r.rates?.[c]) || 1);
  const uzs = (v) => {
    const usd = (Number(v) || 0) / rate(cur);
    return cur === 'UZS' ? `≈ ${usd.toFixed(2)} USD` : `≈ ${num(Math.round(usd * rate('UZS') / 1000) * 1000)} UZS`;
  };
  const priceInp = (x) => inp(`${x.id}_price`, x.price, 'type="number" step="any" min="0" required');
  const html = shell('tiers', a('nav_tiers'), esc(a('tiers_hint')), `
    <h2 class="adm-h2" style="margin-top:0">${esc(a('biz_prices'))}</h2>
    <form data-tf class="tier-admin">
      <div class="tier-save" style="max-width:260px">${field(a('price_currency'), `<select class="input" name="currency">${r.currencies.map((c) => `<option ${c === r.currency ? 'selected' : ''}>${c}</option>`).join('')}</select>`)}</div>
      ${r.items.map((x) => `<div class="box tier-card ${x.id}">
      <div class="tier-card-hd"><span class="tier-badge ${x.id}">${x.id === 'vip' ? icon('star') : ''}${x.id.toUpperCase()}</span></div>
      <div class="form-grid">
        ${field(`${a('price')}, ${r.currency}`, priceInp(x))}
        ${field(a('days'), inp(`${x.id}_days`, x.days, 'type="number" step="1" min="1" max="365" required'))}
      </div>
      <p class="tier-uzs" data-uzs="${x.id}">${esc(uzs(x.price))}</p>
      <div class="adm-kv"><span>${esc(a('active_now'))}</span><b>${num(x.active)}</b><span>${esc(a('sold_30d'))}</span><b>${num(x.sold_30d)}</b></div>
    </div>`).join('')}
      <h2 class="adm-h2 tier-save">${esc(a('top_prices'))}</h2>
      ${r.tops.map((x) => `<div class="box tier-card top">
        <div class="tier-card-hd"><b>${esc(t(`promo_${x.id}_short`))}</b></div>
        <div class="form-grid">${field(`${a('price')}, ${r.currency}`, priceInp(x), 'full')}</div>
        <p class="tier-uzs" data-uzs="${x.id}">${esc(uzs(x.price))}</p>
        <div class="adm-kv"><span>${esc(a('sold_30d'))}</span><b>${num(x.sold_30d)}</b></div>
      </div>`).join('')}
      <div class="tier-save" style="max-width:260px">${field(a('promo_days_all'), inp('promo_days', r.promo_days, 'type="number" min="1" max="90" required'))}</div>
      <div class="tier-save"><button class="btn btn-primary">${esc(a('save'))}</button></div>
    </form>
    <h2 class="adm-h2">${esc(a('tier_listings'))} · ${num(r.listings.length)}</h2>
    ${r.listings.length ? `<div class="box adm-table-box"><table class="adm-table"><tbody>${r.listings.map((l) => `<tr>
      <td style="width:70px"><img src="${esc(imgOf(l))}" alt="" style="width:64px;height:44px;object-fit:cover;border-radius:6px"></td>
      <td><a href="/listing/${l.id}" target="_blank"><b>${esc(l.title)}</b></a><br><span class="tiny muted">#${l.id} · ${esc(l.seller?.name || '')}</span></td>
      <td><span class="tier-badge sm ${l.tier}">${l.tier.toUpperCase()}</span></td>
      <td class="muted">${esc(a('until'))} ${esc(fmtDate(l.tier_until, true))}</td>
      <td class="muted">${icon('eye')} ${num(l.views || 0)}</td>
      <td style="text-align:end"><button class="btn btn-soft btn-sm" data-top="${l.id}">${esc(a('set_tier'))}</button></td>
    </tr>`).join('')}</tbody></table></div>` : `<div class="box empty">${esc(a('empty'))}</div>`}`);
  return {
    title: a('nav_tiers'),
    html,
    mount(main) {
      const f = $('[data-tf]', main);
      f.addEventListener('change', (e) => {
        if (e.target.name !== 'currency') return;
        cur = e.target.value;
        for (const x of [...r.items, ...r.tops]) $(`[data-uzs="${x.id}"]`, main).textContent = uzs(f[`${x.id}_price`].value);
      });
      f.addEventListener('input', (e) => {
        const m = /^(\w+)_price$/.exec(e.target.name || '');
        if (m) $(`[data-uzs="${m[1]}"]`, main).textContent = uzs(e.target.value);
      });
      f.onsubmit = async (e) => {
        e.preventDefault();
        const body = Object.fromEntries(r.items.map((x) => [x.id, { price: Number(f[`${x.id}_price`].value), days: Number(f[`${x.id}_days`].value) }]));
        for (const x of r.tops) body[x.id] = { price: Number(f[`${x.id}_price`].value) };
        body.currency = f.currency.value;
        body.promo_days = Number(f.promo_days.value);
        const res = await api('/admin/tiers', { method: 'PUT', body });
        toast(`${a('saved')}${Object.keys(res.changed).length ? ` · ${Object.keys(res.changed).length}` : ''}`, 'ok');
        refresh();
      };
      main.addEventListener('click', (e) => { const b = e.target.closest('[data-top]'); if (b) tierModal(Number(b.dataset.top)); });
    },
  };
}

// ---------- Murojaatlar ----------
async function supportPage({ query }) {
  const status = ['new', 'answered', 'closed', 'all'].includes(query.status) ? query.status : 'new';
  const r = await api(`/admin/support${qs({ status, page: query.page })}`);
  const tabs = [['new', a('s_new_t')], ['answered', a('s_answered')], ['closed', a('s_closed')], ['all', a('all')]];
  const html = shell('support', a('nav_support'), '', `
    <div class="tabs">${tabs.map(([v, l]) => `<a class="tab ${status === v ? 'on' : ''}" href="/admin/support?status=${v}">${esc(l)}${v !== 'all' && r.counts[v] ? ` · ${r.counts[v]}` : ''}</a>`).join('')}</div>
    ${r.items.map((x) => `<div class="box sup-adm ${x.status}" data-tid="${x.id}">
      <div class="sup-hd"><b>#${x.id}</b><span class="tag">${esc(a(`t_${x.topic}`))}</span><span class="tag ${x.status === 'new' ? 'orange' : x.status === 'answered' ? 'green' : 'grey'}">${esc(a(`s_${x.status === 'new' ? 'new_t' : x.status}`))}</span><span class="tiny muted">${esc(fmtDate(x.created_at, true))}</span></div>
      <div class="sup-who">${icon('user')} ${x.user_id ? `<a href="/admin/users/${x.user_id}">${esc(x.user_name || x.name || '—')}</a>` : `${esc(x.name || '—')} <span class="tag grey">${esc(a('guest'))}</span>`}${x.phone ? ` · <a href="tel:${esc(x.phone)}">${esc(x.phone)}</a>` : ''}</div>
      <p class="sup-msg">${esc(x.message)}</p>
      ${x.reply ? `<div class="sup-reply"><b>${esc(a('reply'))} · ${esc(x.replied_name || '')} · ${esc(fmtDate(x.replied_at, true))}</b><p>${esc(x.reply)}</p></div>` : ''}
      ${x.status !== 'closed' ? `<form class="sup-form" data-rf="${x.id}"><textarea class="input" name="reply" rows="2" minlength="2" maxlength="3000" placeholder="${esc(a('reply'))}…" required></textarea>
        <div class="sup-actions">${x.phone ? `<label class="check"><input type="checkbox" name="sms" ${x.user_id ? '' : 'checked'}> ${esc(a('reply_sms'))}</label>` : '<span></span>'}
        <div style="display:flex;gap:6px"><button type="button" class="btn btn-ghost btn-sm" data-close="${x.id}">${esc(a('close_ticket'))}</button><button class="btn btn-primary btn-sm">${icon('send')} ${esc(a('send_reply'))}</button></div></div></form>` : ''}
    </div>`).join('') || `<div class="box empty">${esc(a('empty'))}</div>`}
    ${pager(r, '/admin/support', { status })}`);
  return {
    title: a('nav_support'),
    html,
    mount(main) {
      main.addEventListener('submit', async (e) => {
        const f = e.target.closest('[data-rf]');
        if (!f) return;
        e.preventDefault();
        const res = await api(`/admin/support/${f.dataset.rf}`, { method: 'PATCH', body: { reply: f.reply.value.trim(), sms: Boolean(f.sms?.checked) } });
        toast(res.sms && res.sms !== true ? `SMS: ${res.sms}` : a('saved'), res.sms && res.sms !== true ? 'err' : 'ok');
        refresh();
      });
      main.addEventListener('click', async (e) => {
        const c = e.target.closest('[data-close]');
        if (c) { await api(`/admin/support/${c.dataset.close}`, { method: 'PATCH', body: { status: 'closed' } }); refresh(); }
      });
    },
  };
}

// ---------- Integratsiyalar: SMS va to'lov tizimlari ----------
async function integrationsPage() {
  const r = await api('/admin/integrations');
  const by = Object.fromEntries(r.items.map((x) => [x.key, x]));
  const st = (ok) => `<span class="tag ${ok ? 'green' : 'grey'}">${esc(a(ok ? 'ready' : 'not_ready'))}</span>`;
  const txt = (k, extra = '') => field(a(k), by[k].type === 'secret'
    ? `<input class="input" name="${k}" type="password" autocomplete="new-password" placeholder="${esc(by[k].set ? by[k].value : '—')}" ${extra}>`
    : inp(k, by[k].value, extra));
  const tog = (k, warn = '') => `<label class="set-row" style="margin:0"><span>${esc(a(k))}${warn ? `<br><span class="tiny red">${esc(a(warn))}</span>` : ''}</span><label class="toggle"><input type="checkbox" name="${k}" ${by[k].value ? 'checked' : ''}><span></span></label></label>`;
  const copyRow = (label, url) => `<div class="cb-row"><span>${esc(label)}</span><code>${esc(url)}</code><button type="button" class="btn btn-soft btn-sm" data-copy="${esc(url)}">${esc(a('copy'))}</button></div>`;
  const html = shell('integrations', a('nav_integrations'), esc(a('int_hint')), `
    <form data-if>
      <div class="box"><h3>${esc(a('int_site'))} ${st(r.status.https)}</h3><div class="form-grid">${field(a('int_site_hint'), inp('siteUrl', by.siteUrl.value, 'placeholder="https://hemu.uz"'), 'full')}</div>
        ${r.status.https ? '' : `<p class="tiny red" style="margin:8px 0 0">${esc(a('https_warn'))}</p>`}</div>

      <div class="box"><h3>${esc(a('int_sms'))} ${st(r.status.sms)}</h3><p class="tiny muted" style="margin:-4px 0 12px">${esc(a('int_sms_hint'))}</p>
        <div class="form-grid">
          ${field(a('smsProvider'), sel('smsProvider', [['log', a('sp_log')], ['eskiz', a('sp_eskiz')]], by.smsProvider.value, false))}
          ${txt('eskiz.from', 'placeholder="4546"')}
          ${txt('eskiz.email', 'type="email" autocomplete="off"')}
          ${txt('eskiz.password')}
          <div class="full">${tog('otpTestRegistration', 'otp_reg_hint')}</div>
          <div class="full">${tog('otpDevEcho', 'otp_warn')}</div>
          <div class="full">${tog('adminTwoFactor')}</div>
        </div>
        <div class="int-test"><input class="input" data-test-phone type="tel" placeholder="+998 90 123 45 67"><button type="button" class="btn btn-soft" data-test-sms>${icon('send')} ${esc(a('test_sms'))}</button><button type="button" class="btn btn-ghost" data-balance>${esc(a('sms_balance'))}</button><span class="small" data-int-out></span></div>
      </div>

      <div class="box"><h3>${esc(a('int_mail'))} ${st(r.status.mail)}</h3><p class="tiny muted" style="margin:-4px 0 12px">${esc(a('int_mail_hint'))}</p>
        <div class="form-grid">
          ${field(a('mailProvider'), sel('mailProvider', [['off', a('mp_off')], ['smtp', a('mp_smtp')]], by.mailProvider.value, false))}
          ${txt('smtp.from', 'placeholder="HEMU.UZ"')}
          ${txt('smtp.host', 'placeholder="smtp.gmail.com"')}
          ${txt('smtp.port', 'type="number" min="1" max="65535" placeholder="465"')}
          ${txt('smtp.user', 'type="email" autocomplete="off" placeholder="hemu.uz@gmail.com"')}
          ${txt('smtp.pass')}
        </div>
        <div class="int-test"><input class="input" data-test-email type="email" placeholder="test@gmail.com"><button type="button" class="btn btn-soft" data-test-mail>${icon('send')} ${esc(a('test_mail'))}</button><span class="small" data-mail-out></span></div>
      </div>

      <div class="box"><h3>${esc(a('int_seo'))} ${st(Boolean(by.googleVerification?.value))}</h3><p class="tiny muted" style="margin:-4px 0 12px">${esc(a('int_seo_hint'))}</p>
        <div class="form-grid">
          ${txt('googleVerification', 'placeholder="abc123XYZ..." autocomplete="off"')}
          ${txt('yandexVerification', 'placeholder="0123456789abcdef" autocomplete="off"')}
        </div>
        ${copyRow('Sitemap', `${by.siteUrl.value || location.origin}/sitemap.xml`)}
      </div>

      <div class="box"><h3>${esc(a('int_maps'))} ${st(r.status.maps)}</h3><p class="tiny muted" style="margin:-4px 0 12px">${esc(a('int_maps_hint'))}</p>
        <div class="form-grid">
          ${field(a('mapProvider'), sel('mapProvider', [['yandex', a('mp_yandex')], ['osm', a('mp_osm')]], by.mapProvider.value, false))}
          ${txt('yandexMapsKey', 'placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autocomplete="off"')}
        </div>
      </div>

      <div class="box"><h3>${esc(a('int_pay'))} · Click ${st(r.status.click)} · Payme ${st(r.status.payme)}</h3>
        <div class="form-grid">
          <div class="full">${tog('paymentsDev', 'pay_warn')}</div>
          ${txt('click.serviceId')}${txt('click.merchantId')}${txt('click.merchantUserId')}${txt('click.secretKey')}
          ${txt('payme.merchantId')}${txt('payme.key')}
          <div class="full">${tog('payme.testMode')}</div>
        </div>
        <h3 style="margin-top:16px">${esc(a('callbacks'))}</h3>
        ${copyRow(`${a('cb_click')} — Prepare`, r.callbacks.click_prepare)}${copyRow(`${a('cb_click')} — Complete`, r.callbacks.click_complete)}${copyRow(a('cb_payme'), r.callbacks.payme)}
      </div>
      <button class="btn btn-primary">${esc(a('save'))}</button>
    </form>
    <div class="box" style="margin-top:16px"><h3>${esc(a('sms_log'))}</h3>${r.sms_log.length ? `<table class="adm-table"><tbody>${r.sms_log.map((x) => `<tr><td class="muted">${esc(fmtDate(x.created_at, true))}</td><td>${esc(x.phone)}</td><td>${esc(x.provider)}</td><td>${x.ok ? `<span class="tag green">OK</span>` : `<span class="tag red">${esc(x.error || 'error')}</span>`}</td></tr>`).join('')}</tbody></table>` : `<div class="empty">${esc(a('empty'))}</div>`}</div>`);
  return {
    title: a('nav_integrations'),
    html,
    mount(main) {
      const f = $('[data-if]', main);
      const out = $('[data-int-out]', main);
      f.onsubmit = async (e) => {
        e.preventDefault();
        const body = {};
        for (const x of r.items) {
          const el = f.elements[x.key];
          if (!el) continue;
          if (x.type === 'bool') body[x.key] = el.checked;
          else if (x.type === 'secret') { if (el.value.trim()) body[x.key] = el.value.trim(); } else body[x.key] = el.value.trim();
        }
        const res = await api('/admin/integrations', { method: 'PUT', body });
        toast(`${a('saved')}${Object.keys(res.changed).length ? ` · ${Object.keys(res.changed).length}` : ''}`, 'ok');
        refresh();
      };
      main.addEventListener('click', async (e) => {
        const cp = e.target.closest('[data-copy]');
        if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); toast(a('copied'), 'ok'); } catch { /* */ } return; }
        if (e.target.closest('[data-test-sms]')) {
          out.textContent = '…';
          const res = await api('/admin/integrations/sms-test', { method: 'POST', body: { phone: $('[data-test-phone]', main).value.trim() } });
          out.innerHTML = res.ok ? `<span class="green">OK · ${esc(res.provider)}</span>` : `<span class="red">${esc(res.error)}</span>`;
          return;
        }
        if (e.target.closest('[data-test-mail]')) {
          const mo = $('[data-mail-out]', main);
          mo.textContent = '…';
          const res = await api('/admin/integrations/mail-test', { method: 'POST', body: { email: $('[data-test-email]', main).value.trim() } });
          mo.innerHTML = res.ok ? `<span class="green">OK · ${esc(res.provider)}</span>` : `<span class="red">${esc(res.error)}</span>`;
          return;
        }
        if (e.target.closest('[data-balance]')) {
          out.textContent = '…';
          const res = await api('/admin/integrations/sms-balance');
          out.innerHTML = res.ok ? `<b>${esc(String(res.balance))}</b>` : `<span class="red">${esc(res.error)}</span>`;
        }
      });
    },
  };
}

// ---------- Sahifalar: oferta, maxfiylik, FAQ + rekvizitlar ----------
async function pagesPage({ query }) {
  const r = await api('/admin/pages');
  const key = ['terms', 'privacy', 'faq'].includes(query.key) ? query.key : 'terms';
  const lang = ['uz', 'ru', 'en'].includes(query.lang) ? query.lang : 'ru';
  const cur = r.pages[key][lang];
  const by = Object.fromEntries(r.legal.map((x) => [x.key, x]));
  const href = { terms: '/terms', privacy: '/privacy', faq: '/contact' }[key];
  const html = shell('pages', a('nav_pages'), '', `
    <form class="box" data-lg><h3>${esc(a('legal_req'))}</h3><div class="form-grid">
      ${['legalName', 'legalTin', 'legalAddress', 'supportPhone', 'supportEmail', 'supportTelegram'].map((k) => field(a(k), inp(k, by[k]?.value, k === 'legalAddress' ? '' : ''), k === 'legalAddress' ? 'full' : '')).join('')}
    </div><button class="btn btn-soft" style="margin-top:12px">${esc(a('save'))}</button></form>
    <div class="tabs">${['terms', 'privacy', 'faq'].map((k) => `<a class="tab ${k === key ? 'on' : ''}" href="/admin/pages?key=${k}&lang=${lang}">${esc(a(`pg_${k}`))}</a>`).join('')}</div>
    <form class="box" data-pg>
      <div class="pg-head"><div class="seg">${['uz', 'ru', 'en'].map((l) => `<a class="${l === lang ? 'on' : ''}" href="/admin/pages?key=${key}&lang=${l}">${l.toUpperCase()}</a>`).join('')}</div>
        <span class="tag ${cur.custom ? 'yellow' : 'grey'}">${esc(a(cur.custom ? 'custom' : 'default_tpl'))}</span>
        <a class="btn btn-ghost btn-sm" href="${href}" target="_blank">${icon('eye')} ${esc(a('open_page'))}</a></div>
      <p class="tiny muted">${esc(a('pg_hint'))}</p>
      <textarea class="input pg-text" name="text" rows="24">${esc(cur.text)}</textarea>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn btn-primary">${esc(a('save'))}</button><button type="button" class="btn btn-ghost" data-reset>${esc(a('default_tpl'))}</button></div>
    </form>`);
  return {
    title: a('nav_pages'),
    html,
    mount(main) {
      $('[data-lg]', main).onsubmit = async (e) => {
        e.preventDefault();
        const f = e.target;
        const body = Object.fromEntries(['legalName', 'legalTin', 'legalAddress', 'supportPhone', 'supportEmail', 'supportTelegram'].map((k) => [k, f[k].value.trim()]));
        await api('/admin/pages/legal', { method: 'PUT', body });
        try { state.platform = await api('/platform'); } catch { /* */ }
        toast(a('saved'), 'ok');
      };
      const save = async (text) => { await api('/admin/pages', { method: 'PUT', body: { key, lang, text } }); toast(a('saved'), 'ok'); refresh(); };
      $('[data-pg]', main).onsubmit = (e) => { e.preventDefault(); save(e.target.text.value); };
      $('[data-reset]', main).onclick = async () => { if (await confirmBox(a('default_tpl'))) save(''); };
    },
  };
}

// ---------- Fura logistika: nazorat ----------
async function freightPage({ query }) {
  const status = query.status === 'closed' ? 'closed' : 'open';
  const r = await api(`/admin/freight${qs({ status, kind: query.kind, q: query.q, page: query.page })}`);
  const html = shell('freight', a('nav_freight'), '', `
    <div class="tabs">${[['open', a('fr_open')], ['closed', a('fr_closed')]].map(([v, l]) => `<a class="tab ${status === v ? 'on' : ''}" href="/admin/freight?status=${v}">${esc(l)}</a>`).join('')}
      ${[['', a('all')], ['load', t('fr_loads')], ['truck', t('fr_trucks')]].map(([v, l]) => `<a class="tab ${(query.kind || '') === v ? 'on' : ''}" href="/admin/freight${qs({ status, kind: v || undefined })}">${esc(l)}</a>`).join('')}</div>
    <div class="box adm-table-box"><table class="adm-table"><thead><tr><th>ID</th><th>${esc(t('fr_from'))} → ${esc(t('fr_to'))}</th><th>${esc(t('fr_cargo'))}</th><th>${esc(a('profile'))}</th><th>${esc(a('views'))}</th><th></th></tr></thead><tbody>
    ${r.items.map((x) => `<tr>
      <td class="muted">#${x.id}<br><span class="tag ${x.kind === 'load' ? 'yellow' : ''}">${esc(t(x.kind === 'load' ? 'fr_loads' : 'fr_trucks'))}</span></td>
      <td><a href="/fura/${x.id}" target="_blank"><b>${esc(x.from.city)} → ${esc(x.to?.city || t('fr_any_dir'))}</b></a><br><span class="tiny muted">${esc([x.date_from, x.price_formatted].filter(Boolean).join(' · '))}</span></td>
      <td>${esc(x.cargo || (x.body_types || []).map((b) => t(`body_${b}`)).join(', '))}</td>
      <td>${esc(x.owner.name || '')}<br><span class="tiny muted">${esc(x.phone || '')}</span></td>
      <td class="muted">${icon('eye')} ${num(x.views)} · ${icon('phone')} ${num(x.contacts || 0)}</td>
      <td style="text-align:end;white-space:nowrap">${x.status === 'open' ? `<button class="btn btn-soft btn-sm" data-fclose="${x.id}">${esc(a('close_ticket'))}</button>` : ''}<button class="btn btn-ghost btn-sm red" data-fdel="${x.id}">${icon('trash')}</button></td>
    </tr>`).join('') || `<tr><td colspan="6" class="empty">${esc(a('empty'))}</td></tr>`}</tbody></table></div>
    ${pager(r, '/admin/freight', { status, kind: query.kind })}`);
  return {
    title: a('nav_freight'),
    html,
    mount(main) {
      main.addEventListener('click', async (e) => {
        const c = e.target.closest('[data-fclose]');
        if (c) { await api(`/freight/${c.dataset.fclose}/close`, { method: 'POST' }); return refresh(); }
        const d = e.target.closest('[data-fdel]');
        if (d && (await confirmBox(a('fr_del_q')))) { await api(`/admin/freight/${d.dataset.fdel}`, { method: 'DELETE' }); refresh(); }
      });
    },
  };
}
