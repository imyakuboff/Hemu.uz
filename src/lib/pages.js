// Matnli sahifalar: ommaviy oferta (/terms), maxfiylik siyosati (/privacy), savol-javoblar (/contact).
// Admin paneldan tahrirlanadi (settings jadvali, "pages" kaliti). Bu yerdagilar — standart shablon:
// {company}, {tin}, {address}, {phone}, {email}, {site} admin sozlamalaridagi rekvizitlar bilan almashtiriladi.
// Format: "## Sarlavha", oddiy xatboshilar, "- " bilan ro'yxat.
const config = require('../config');
const settings = require('./settings');

const KEYS = ['terms', 'privacy', 'faq'];
const LANGS = ['uz', 'ru', 'en'];

const DEFAULTS = {
  terms: {
    uz: `Ushbu hujjat {company} (STIR {tin}, manzil: {address}) tomonidan {site} platformasidan foydalanish shartlarini belgilaydi va O'zbekiston Respublikasi Fuqarolik kodeksining 367 va 369-moddalariga muvofiq ommaviy oferta hisoblanadi. Ro'yxatdan o'tish, e'lon joylash yoki pullik xizmat uchun to'lov qilish oferta shartlarini to'liq qabul qilishni (aksept) bildiradi.

## 1. Atamalar
- Platforma — {site} sayti va unga tegishli ilovalar.
- Ma'muriyat — {company}, platforma egasi.
- Foydalanuvchi — platformada ro'yxatdan o'tgan jismoniy yoki yuridik shaxs.
- E'lon — texnika, ehtiyot qism, material yoki xizmat haqidagi ma'lumot.
- Pullik xizmatlar — VIP, GOLD, PREMIUM darajalari, Biznes tarif, texnik ko'rik va boshqalar.

## 2. Oferta predmeti
Ma'muriyat foydalanuvchiga e'lon joylash, qidirish, xabar almashish va qo'shimcha pullik xizmatlardan foydalanish imkonini beradi. Platforma sotuvchi va xaridor o'rtasidagi bitimda tomon hisoblanmaydi, "Xavfsiz bitim" xizmatidan foydalanilgan holatlar bundan mustasno.

## 3. Ro'yxatdan o'tish va hisob
- Ro'yxatdan o'tish telefon raqami va SMS-kod orqali amalga oshiriladi.
- Foydalanuvchi o'z hisobi xavfsizligi va parolini sir saqlash uchun javobgar.
- Kompaniyalar o'z mamlakati qonunchiligiga muvofiq rekvizitlar va davlat ro'yxatidan o'tganlik guvohnomasini taqdim etadi.

## 4. E'lonlarga qo'yiladigan talablar
- Ma'lumot haqqoniy bo'lishi, narx va holat to'g'ri ko'rsatilishi kerak.
- Taqiqlangan, o'g'irlangan yoki hujjatsiz texnikani sotish taqiqlanadi.
- Boshqa shaxslarning rasmlari va matnlaridan ruxsatsiz foydalanish taqiqlanadi.
- Ma'muriyat qoidalarga zid e'lonlarni ogohlantirishsiz rad etishi yoki o'chirishi mumkin.

## 5. Pullik xizmatlar va to'lov
- Xizmatlar narxi platformada ko'rsatiladi va to'lov paytida amal qiladi.
- To'lov Click, Payme yoki ichki hamyon orqali amalga oshiriladi.
- VIP, GOLD, PREMIUM darajalari to'lov tasdiqlangandan so'ng darhol yoqiladi va ko'rsatilgan muddat davomida amal qiladi.
- Xizmat ko'rsatila boshlangach, uning qiymati qaytarilmaydi, Ma'muriyat aybi bilan xizmat ko'rsatilmagan holatlar bundan mustasno.

## 6. Xavfsiz bitim
Xaridor to'lagan mablag' platformada saqlanadi va xaridor texnikani qabul qilganini tasdiqlagandan so'ng sotuvchiga o'tkaziladi. Nizo yuzaga kelsa, Ma'muriyat tomonlar taqdim etgan dalillar asosida qaror qabul qiladi.

## 7. Tomonlarning javobgarligi
- Sotuvchi e'lon mazmuni va mahsulot sifati uchun javobgar.
- Ma'muriyat foydalanuvchilar o'rtasidagi bitimlar natijasi, uchinchi shaxslar xizmatlaridagi uzilishlar uchun javobgar emas.
- Qoidalarni buzgan foydalanuvchi hisobi bloklanishi mumkin.

## 8. Shaxsiy ma'lumotlar
Shaxsiy ma'lumotlar Maxfiylik siyosatiga muvofiq qayta ishlanadi.

## 9. Nizolarni hal qilish
Nizolar muzokaralar yo'li bilan, kelishuvga erishilmasa — O'zbekiston Respublikasi qonunchiligiga muvofiq sudda hal qilinadi.

## 10. Bog'lanish
{company}, {address}. Telefon: {phone}. E-mail: {email}.`,
    ru: `Настоящий документ определяет условия использования платформы {site}, принадлежащей {company} (ИНН {tin}, адрес: {address}), и является публичной офертой в соответствии со статьями 367 и 369 Гражданского кодекса Республики Узбекистан. Регистрация, размещение объявления или оплата платной услуги означают полное принятие (акцепт) условий оферты.

## 1. Термины
- Платформа — сайт {site} и связанные приложения.
- Администрация — {company}, владелец платформы.
- Пользователь — физическое или юридическое лицо, зарегистрированное на платформе.
- Объявление — информация о технике, запчастях, материалах или услугах.
- Платные услуги — уровни VIP, GOLD, PREMIUM, тариф «Бизнес», техническая проверка и другие.

## 2. Предмет оферты
Администрация предоставляет пользователю возможность размещать объявления, искать, обмениваться сообщениями и пользоваться дополнительными платными услугами. Платформа не является стороной сделки между продавцом и покупателем, за исключением случаев использования услуги «Безопасная сделка».

## 3. Регистрация и аккаунт
- Регистрация выполняется по номеру телефона и SMS-коду.
- Пользователь отвечает за безопасность аккаунта и сохранность пароля.
- Компании предоставляют реквизиты и свидетельство о государственной регистрации в соответствии с законодательством своей страны.

## 4. Требования к объявлениям
- Информация должна быть достоверной, цена и состояние — указаны верно.
- Запрещена продажа запрещённой, краденой или техники без документов.
- Запрещено использовать чужие фотографии и тексты без разрешения.
- Администрация вправе без предупреждения отклонить или удалить объявление, нарушающее правила.

## 5. Платные услуги и оплата
- Стоимость услуг указана на платформе и действует на момент оплаты.
- Оплата производится через Click, Payme или внутренний кошелёк.
- Уровни VIP, GOLD, PREMIUM включаются сразу после подтверждения оплаты и действуют указанный срок.
- После начала оказания услуги её стоимость не возвращается, кроме случаев, когда услуга не оказана по вине Администрации.

## 6. Безопасная сделка
Средства покупателя хранятся на платформе и перечисляются продавцу после того, как покупатель подтвердит получение техники. При споре Администрация принимает решение на основании доказательств сторон.

## 7. Ответственность сторон
- Продавец отвечает за содержание объявления и качество товара.
- Администрация не отвечает за результат сделок между пользователями и перебои в работе сервисов третьих лиц.
- Аккаунт пользователя, нарушающего правила, может быть заблокирован.

## 8. Персональные данные
Персональные данные обрабатываются в соответствии с Политикой конфиденциальности.

## 9. Разрешение споров
Споры решаются путём переговоров, а при недостижении согласия — в суде в соответствии с законодательством Республики Узбекистан.

## 10. Контакты
{company}, {address}. Телефон: {phone}. E-mail: {email}.`,
    en: `This document sets out the terms of use of the {site} platform owned by {company} (TIN {tin}, address: {address}) and is a public offer under Articles 367 and 369 of the Civil Code of the Republic of Uzbekistan. Registering, posting a listing or paying for a paid service means full acceptance of this offer.

## 1. Definitions
- Platform — the {site} website and related apps.
- Administration — {company}, the owner of the platform.
- User — an individual or legal entity registered on the platform.
- Listing — information about equipment, parts, materials or services.
- Paid services — VIP, GOLD and PREMIUM levels, the Business plan, technical inspection and others.

## 2. Subject
The Administration lets users post listings, search, exchange messages and use additional paid services. The platform is not a party to deals between sellers and buyers, except when the Safe Deal service is used.

## 3. Registration and account
- Registration uses a phone number and an SMS code.
- Users are responsible for the security of their account and password.
- Companies provide their requisites and registration certificate as required by the laws of their country.

## 4. Listing rules
- Information must be truthful; price and condition must be accurate.
- Selling prohibited, stolen or undocumented equipment is forbidden.
- Using other people's photos and texts without permission is forbidden.
- The Administration may reject or remove listings that break the rules without notice.

## 5. Paid services and payment
- Prices are shown on the platform and apply at the time of payment.
- Payment is made via Click, Payme or the internal wallet.
- VIP, GOLD and PREMIUM levels are enabled right after payment is confirmed and last for the stated period.
- Once a service has started it is not refundable, unless it was not provided through the Administration's fault.

## 6. Safe Deal
The buyer's money is held by the platform and released to the seller after the buyer confirms receipt. In a dispute the Administration decides based on the evidence provided by both parties.

## 7. Liability
- Sellers are responsible for their listings and the quality of their goods.
- The Administration is not liable for the outcome of deals between users or for outages of third-party services.
- Accounts of users who break the rules may be blocked.

## 8. Personal data
Personal data is processed under the Privacy Policy.

## 9. Disputes
Disputes are settled by negotiation, or otherwise in court under the laws of the Republic of Uzbekistan.

## 10. Contacts
{company}, {address}. Phone: {phone}. E-mail: {email}.`,
  },
  privacy: {
    uz: `Ushbu siyosat {company} (STIR {tin}) {site} platformasi foydalanuvchilarining shaxsiy ma'lumotlarini "Shaxsga doir ma'lumotlar to'g'risida"gi O'zbekiston Respublikasi Qonuniga (O'RQ-547) muvofiq qanday yig'ishi, saqlashi va himoya qilishini tushuntiradi.

## 1. Qanday ma'lumotlar yig'iladi
- Telefon raqami, ism, e-mail, shahar va mamlakat.
- Kompaniya rekvizitlari va yuklangan hujjatlar.
- E'lonlar, xabarlar, buyurtmalar va to'lovlar tarixi.
- Texnik ma'lumotlar: IP-manzil, brauzer turi, kirish vaqti.

## 2. Ma'lumotlardan foydalanish maqsadlari
- Hisobni yaratish va kirishni tasdiqlash (SMS-kod).
- E'lonlarni ko'rsatish, xaridor va sotuvchini bog'lash.
- To'lovlarni qabul qilish va bitimlarni xavfsiz o'tkazish.
- Firibgarlikning oldini olish va platformani yaxshilash.
- Bildirishnomalar yuborish (siz o'chirib qo'yishingiz mumkin).

## 3. Ma'lumotlarni uchinchi shaxslarga berish
Ma'lumotlar sotilmaydi. Ular faqat xizmat ko'rsatish uchun zarur hajmda beriladi: SMS-provayder (Eskiz.uz), to'lov tizimlari (Click, Payme), shuningdek qonunda belgilangan hollarda vakolatli davlat organlariga.

## 4. Saqlash va himoya
- O'zbekiston fuqarolarining shaxsiy ma'lumotlari O'zbekiston hududidagi serverlarda saqlanadi.
- Parollar shifrlangan holda saqlanadi, ulanish HTTPS orqali himoyalanadi.
- Ma'lumotlar hisob o'chirilgunga qadar yoki qonunda belgilangan muddat davomida saqlanadi.

## 5. Sizning huquqlaringiz
- O'z ma'lumotlaringizni ko'rish va o'zgartirish (Profil bo'limida).
- Hisobni va ma'lumotlarni o'chirishni talab qilish.
- Ma'lumotlarni qayta ishlashga roziligingizni qaytarib olish.

## 6. Cookie fayllar
Platforma kirish holatini va tanlangan til, valyutani eslab qolish uchun brauzer xotirasidan foydalanadi.

## 7. Bog'lanish
Shaxsiy ma'lumotlar bo'yicha murojaatlar: {phone}, {email}, {address}.`,
    ru: `Настоящая политика объясняет, как {company} (ИНН {tin}) собирает, хранит и защищает персональные данные пользователей платформы {site} в соответствии с Законом Республики Узбекистан «О персональных данных» (ЗРУ-547).

## 1. Какие данные собираются
- Номер телефона, имя, e-mail, город и страна.
- Реквизиты компании и загруженные документы.
- История объявлений, сообщений, заказов и платежей.
- Технические данные: IP-адрес, тип браузера, время входа.

## 2. Цели использования
- Создание аккаунта и подтверждение входа (SMS-код).
- Показ объявлений, связь покупателя и продавца.
- Приём платежей и безопасное проведение сделок.
- Предотвращение мошенничества и улучшение платформы.
- Отправка уведомлений (их можно отключить).

## 3. Передача третьим лицам
Данные не продаются. Они передаются только в объёме, необходимом для оказания услуг: SMS-провайдеру (Eskiz.uz), платёжным системам (Click, Payme), а также уполномоченным государственным органам в случаях, предусмотренных законом.

## 4. Хранение и защита
- Персональные данные граждан Узбекистана хранятся на серверах на территории Узбекистана.
- Пароли хранятся в зашифрованном виде, соединение защищено HTTPS.
- Данные хранятся до удаления аккаунта или в течение срока, установленного законом.

## 5. Ваши права
- Просматривать и изменять свои данные (раздел «Профиль»).
- Требовать удаления аккаунта и данных.
- Отозвать согласие на обработку данных.

## 6. Cookie
Платформа использует хранилище браузера, чтобы запоминать вход, выбранный язык и валюту.

## 7. Контакты
Обращения по персональным данным: {phone}, {email}, {address}.`,
    en: `This policy explains how {company} (TIN {tin}) collects, stores and protects the personal data of {site} users under the Law of the Republic of Uzbekistan "On Personal Data" (ZRU-547).

## 1. What we collect
- Phone number, name, e-mail, city and country.
- Company requisites and uploaded documents.
- History of listings, messages, orders and payments.
- Technical data: IP address, browser type, sign-in time.

## 2. Why we use it
- To create your account and confirm sign-in (SMS code).
- To show listings and connect buyers with sellers.
- To accept payments and run safe deals.
- To prevent fraud and improve the platform.
- To send notifications (you can turn them off).

## 3. Sharing with third parties
We never sell data. It is shared only as needed to provide the service: the SMS provider (Eskiz.uz), payment systems (Click, Payme), and authorised state bodies where the law requires it.

## 4. Storage and protection
- Personal data of citizens of Uzbekistan is stored on servers located in Uzbekistan.
- Passwords are stored encrypted and connections are protected with HTTPS.
- Data is kept until the account is deleted or for the period required by law.

## 5. Your rights
- View and change your data (Profile section).
- Ask us to delete your account and data.
- Withdraw your consent to processing.

## 6. Cookies
The platform uses browser storage to remember your sign-in, language and currency.

## 7. Contacts
Personal data requests: {phone}, {email}, {address}.`,
  },
  faq: {
    uz: `## E'lon joylash pullikmi?
Yo'q, oddiy e'lon joylash bepul. Pullik faqat VIP, GOLD, PREMIUM darajalari va Biznes tarif.

## VIP, GOLD va PREMIUM nima?
Bu e'loningizni ko'proq odam ko'rishi uchun darajalar. VIP e'lonlar bosh sahifadagi 1-karuselda, GOLD — 2-karuselda, PREMIUM — 3-karuselda ko'rsatiladi va qidiruvda oddiy e'lonlardan yuqorida turadi.

## Qanday to'lash mumkin?
Click, Payme yoki ichki hamyon orqali. Hamyonni "To'lovlar" bo'limidan to'ldirasiz.

## "Xavfsiz bitim" qanday ishlaydi?
Pulingiz platformada saqlanadi va siz texnikani olganingizni tasdiqlaganingizdan keyingina sotuvchiga o'tadi.

## E'lonim nega moderatsiyada?
Yangi e'lonlar qoidalarga mosligi tekshiriladi, odatda bir necha soat ichida. Tasdiqlangan kompaniyalar e'lonlari tezroq chiqadi.

## Kompaniyani qanday tasdiqlatish mumkin?
Profil → Kompaniya bo'limida rekvizitlarni kiriting va davlat ro'yxatidan o'tganlik guvohnomasini yuklang.

## Parolni unutdim, nima qilay?
Kirish oynasida "Parolni unutdingizmi?" tugmasini bosing — telefoningizga SMS-kod keladi.

## Firibgarni qanday xabar qilaman?
E'lon sahifasidagi "Shikoyat qilish" tugmasini bosing yoki shu sahifadagi forma orqali yozing.`,
    ru: `## Размещение объявлений платное?
Нет, обычное объявление размещается бесплатно. Платные только уровни VIP, GOLD, PREMIUM и тариф «Бизнес».

## Что такое VIP, GOLD и PREMIUM?
Это уровни продвижения, чтобы объявление увидело больше людей. VIP-объявления показываются в карусели №1 на главной, GOLD — в карусели №2, PREMIUM — в карусели №3, и все они стоят в поиске выше обычных.

## Как оплатить?
Через Click, Payme или внутренний кошелёк. Кошелёк пополняется в разделе «Платежи».

## Как работает «Безопасная сделка»?
Деньги хранятся на платформе и переводятся продавцу только после того, как вы подтвердите получение техники.

## Почему объявление на модерации?
Новые объявления проверяются на соответствие правилам, обычно в течение нескольких часов. Объявления проверенных компаний публикуются быстрее.

## Как подтвердить компанию?
В разделе Профиль → Компания укажите реквизиты и загрузите свидетельство о государственной регистрации.

## Забыл пароль, что делать?
Нажмите «Забыли пароль?» в окне входа — на телефон придёт SMS-код.

## Как сообщить о мошеннике?
Нажмите «Пожаловаться» на странице объявления или напишите через форму на этой странице.`,
    en: `## Is posting a listing paid?
No, a regular listing is free. Only the VIP, GOLD and PREMIUM levels and the Business plan are paid.

## What are VIP, GOLD and PREMIUM?
Promotion levels that get your listing seen by more people. VIP listings appear in carousel #1 on the home page, GOLD in carousel #2, PREMIUM in carousel #3, and all of them rank above regular listings in search.

## How can I pay?
With Click, Payme or the internal wallet. Top up the wallet in the Payments section.

## How does Safe Deal work?
Your money is held by the platform and released to the seller only after you confirm you have received the equipment.

## Why is my listing in moderation?
New listings are checked against the rules, usually within a few hours. Listings from verified companies go live faster.

## How do I verify my company?
In Profile → Company, enter your requisites and upload your registration certificate.

## I forgot my password. What now?
Click "Forgot password?" in the sign-in window and you will get an SMS code.

## How do I report a scammer?
Click "Report" on the listing page or write to us using the form on this page.`,
  },
};

// Qaysi tilda ko'rsatish: so'ralgan → (turkiy tillar va tojik → ruscha, dari/pushtu → inglizcha)
const FALLBACK = { kk: 'ru', ky: 'ru', tg: 'ru', tk: 'ru', az: 'ru', prs: 'en', ps: 'en' };

const stored = () => settings.getRaw('pages') || {};

function raw(key, lang) {
  const s = stored()[key] || {};
  return s[lang] || DEFAULTS[key][lang];
}

function fill(text) {
  const v = {
    company: config.legalName || 'HEMU.UZ',
    tin: config.legalTin || '—',
    address: config.legalAddress || '—',
    phone: config.supportPhone || '—',
    email: config.supportEmail || '—',
    site: (config.siteUrl || '').replace(/^https?:\/\//, '') || 'hemu.uz',
  };
  return text.replace(/\{(company|tin|address|phone|email|site)\}/g, (_, k) => v[k]);
}

function get(key, lang) {
  if (!KEYS.includes(key)) return null;
  const l = LANGS.includes(lang) ? lang : FALLBACK[lang] || 'ru';
  const s = stored()[key] || {};
  return { key, lang: l, text: fill(raw(key, l)), custom: Boolean(s[l]), updated_at: s.updated_at || null };
}

// Admin: barcha matnlar (to'ldirilmagan shablon ko'rinishida)
function all() {
  const s = stored();
  return Object.fromEntries(KEYS.map((k) => [k, Object.fromEntries(LANGS.map((l) => [l, { text: raw(k, l), custom: Boolean(s[k]?.[l]) }]))]));
}

// text bo'sh bo'lsa — standart shablonga qaytariladi
function save(key, lang, text) {
  const s = stored();
  s[key] = { ...(s[key] || {}) };
  const v = String(text ?? '').trim();
  if (v && v !== DEFAULTS[key][lang]) s[key][lang] = v.slice(0, 60000);
  else delete s[key][lang];
  s[key].updated_at = new Date().toISOString();
  settings.setRaw('pages', s);
}

module.exports = { KEYS, LANGS, get, all, save };
