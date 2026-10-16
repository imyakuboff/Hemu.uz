# HEMU.UZ

Brend: **HEMU.UZ** (logo: `public/img/logo.svg`; ranglar — navy, ko'k, sariq aksent). Baza fayli: `data/movexgo.db` (ichki nom).

HEMU.UZ — to'liq platforma (frontend + backend): Markaziy Osiyo bo'yicha maxsus texnika, ehtiyot qismlar, qurilish materiallari va xizmatlar bozori.

**Ishga tushirish:** `start.bat` → brauzerda http://localhost:4700/ ochiladi. API havolalari: http://localhost:4700/api

## Frontend (`public/`)
Build qadamisiz vanilla JS (ES modullar), backend bilan bitta serverda. Dizayndagi barcha sahifalar desktop va mobil ko'rinishda:

| Sahifa | Manzil |
|---|---|
| Bosh sahifa | `/` |
| Katalog / qidiruv | `/catalog?category=…&q=…` |
| Kategoriyalar | `/categories` |
| Filtrlar | `/filters` |
| E'lonlar lentasi | `/feed` |
| Texnika va ehtiyot qism kartochkasi | `/listing/:id` |
| E'lon yaratish / tahrirlash | `/create`, `/create/:id` |
| Zayavka yaratish | `/request/new` |
| Xaridor so'rovlari (sotuvchilar uchun) | `/requests` |
| Mening e'lonlarim | `/my/listings` |
| Buyurtmalarim va sotuvlar | `/my/orders` |
| Saralanganlar va saqlangan qidiruvlar | `/favorites` |
| Xabarlar (real vaqt) | `/messages` |
| Profil | `/profile` |
| Sotuvchi kabineti | `/dashboard` |
| Kompaniya sahifasi | `/company/:id` |
| Moderatsiya (admin) | `/admin` |

- **Til va valyuta:** yuqori qatorda tanlanadi. Standart til — rus, chunki dizayn rus tilida. Interfeys matnlari `public/js/dict.js` faylida, 10 tilda. Dari va pashtoda sahifa o'ngdan chapga (RTL) aylanadi.
- **Demo rasmlar:** `public/img/demo/` — Figma skrinshotidan qirqib olingan. Asl sifat uchun Figma'dan eksport qilib, shu nomlar bilan almashtiring.

## Qo'shimcha funksiyalar

| Funksiya | Qayerda | Holati |
|---|---|---|
| **E'lonni ko'tarish** (TOP, rang bilan ajratish, combo) | "Мои объявления" → «Продвинуть» | Ishlaydi; TOP e'lonlar ro'yxat boshida, sariq ramka |
| **Tariflar** (Bepul: 10 ta e'lon; Biznes: cheksiz + oyiga 3 bepul TOP) | `/plans` | Ishlaydi |
| **To'lovlar: Click** (SHOP API: prepare/complete, MD5 imzo) | `/api/v1/pay/click/*` | Protokol to'liq; `CLICK_*` kalitlari kerak |
| **To'lovlar: Payme** (Merchant API: Check/Create/Perform/Cancel/CheckTransaction/GetStatement) | `/api/v1/pay/payme` | Protokol to'liq; `PAYME_*` kalitlari kerak |
| **Sinov to'lovi** (pul yechilmaydi) | `PAYMENTS_DEV=1` | Dev uchun; productionda o'chiring |
| **Xavfsiz bitim (escrow)** — pul platformada, qabul qilingach sotuvchiga; nizo → admin qarori | Buyurtma oynasi, `/admin?tab=disputes` | Ishlaydi. Sotuvchiga pul o'tkazish/qaytarish **qo'lda** (bank orqali) |
| **Texnik ko'rik** — to'lov, usta tayinlash, fotohisobot | E'lon sahifasi, `/admin?tab=inspections` | Ishlaydi |
| **VIN / seriya raqami tekshiruvi** — dublikatlar va "qidiruvdagi texnika" ro'yxati | E'lon sahifasi, `/admin?tab=blacklist` | Ishlaydi (davlat reestri API'si yo'q) |
| **Shikoyatlar** | E'lon sahifasi → «Пожаловаться», `/admin?tab=reports` | Ishlaydi |
| **Ijara kalendari** — band/yopiq kunlar, bron, narx hisobi (soat/kun/smena) | Ijara e'loni sahifasi, "Мои заказы" → «Брони» | Ishlaydi |
| **Xarita va "Рядом со мной"** (OpenStreetMap + Leaflet, radius, masofa bo'yicha saralash) | Katalog → «Карта», e'lon sahifasi, e'lon formasi | Ishlaydi |
| **Telegram bot** — hisobni ulash (`/start KOD`), barcha bildirishnomalar | Profil → Telegram | Kod tayyor; `TELEGRAM_BOT_TOKEN` kerak |
| **Lizing kalkulyatori** | E'lon sahifasi | Ishlaydi |
| **Solishtirish** (4 tagacha) | Kartochkadagi ⚖ tugma, `/compare` | Ishlaydi |
| **Narx tarixi grafigi** | E'lon sahifasi | Ishlaydi |
| **Ovozli qidiruv** (Web Speech API, 10 til) | Qidiruv qatoridagi 🎤 | Chrome/Edge/Safari'da |
| **Ommaviy yuklash (CSV)** + namuna | `/my/import` | Ishlaydi (rasmlar keyin qo'shiladi) |
| **Avtojavob va javob shablonlari** | Profil → Инструменты, chat | Ishlaydi |
| **Kengaytirilgan statistika** — voronka, manbalar, konversiya | `/analytics` | Ishlaydi |
| **PWA** — telefonga o'rnatish, oflayn sahifa | Avtomatik | Ishlaydi (HTTPS kerak) |
| **SEO** — server tomonda title/description/Open Graph, JSON-LD Product, `sitemap.xml`, `robots.txt` | — | Ishlaydi |
| **Deploy** — `Dockerfile`, `docker-compose.yml`, `deploy/nginx.conf`, `deploy/hemu.service` | — | Tayyor |

### Hisob turlari va bo'limlar
| Funksiya | Qayerda |
|---|---|
| **Ro'yxatdan o'tish** (4 qadam: telefon → SMS-kod → kimsiz? → ma'lumotlar). Kompaniya: "Nima bilan shug'ullanasiz?" — maxsus texnika sotish/ijarasi, ehtiyot qismlar, ta'mirlash, yuk tashish, qurilish materiallari. Mexanik / haydovchi: rezyume. Mijoz: qiziqishlar | `/register` |
| **Kirish** — parol yoki SMS-kod; **parolni tiklash** SMS orqali | Kirish oynasi, `/forgot` |
| **Biznes kabinet** — filiallar (xaritada), xodimlar va rollar (menejer/sotuvchi/kuzatuvchi), obunalar | `/business` |
| **Kompaniya do'koni** — obuna bo'lish, rubrikalar, filiallar, do'kon ichida qidiruv | `/company/:id` |
| **Bo'limlar** | `/transportsale`, `/transportrental`, `/sparepart`, `/transport-repair`, `/cargologistic`, `/transportlogistic`, `/driver`, `/mechanic`, `/application`, `/specialist/:id` |
| **Aqlli qidiruv** — kategoriyalar, markalar, e'lonlar, o'xshash/ommabop so'rovlar, "N ta e'lon topildi" | Sarlavhadagi qidiruv |
| **E'lon statistikasi** (30 kun grafigi), **o'chirilganni tiklash** (30 kun saqlanadi) | `/my/listings` |
| **Hisob-faktura PDF** (yuridik shaxslar uchun) | Buyurtma → Hujjatlar |
| **Qiziqishlar**, mutaxassis profili, parol | `/profile` |

Inter shrifti lokal (`public/vendor/inter`) — tashqi CDN kerak emas.
### Platforma admin paneli (`/admin`)
Faqat `role = admin` uchun. Kirish: `+998900000001` / `Hemu2026`.

| Bo'lim | Imkoniyatlar |
|---|---|
| Umumiy ko'rinish | Foydalanuvchilar, onlayn, e'lonlar, daromad, hamyonlardagi mablag', navbatlar, 30 kunlik grafiklar, CPU/RAM |
| Foydalanuvchilar | Qidiruv va filtrlar; profilni tahrirlash, **login (telefon) va parolni almashtirish**, rol (admin qilish), bloklash sababi bilan, barcha qurilmalardan chiqarish, **balansni to'ldirish/yechish**, foydalanuvchi nomidan kirish (jurnalga yoziladi), o'chirish, yangi foydalanuvchi/admin yaratish |
| Kompaniyalar | Rekvizitlar va hujjatlar (guvohnomani brauzerda ko'rish), tasdiqlash / sababi bilan rad etish, bloklash, egasini almashtirish, o'chirish |
| E'lonlar | Moderatsiya, istalgan holat, bepul TOP, arxiv, o'chirish |
| Buyurtmalar | Qidiruv, holatni o'zgartirish |
| Moliya | To'lovlar (to'landi deb belgilash, hamyonga qaytarish), barcha balans operatsiyalari |
| Push-xabarlar | Auditoriya (tur, mamlakat, til, faollik, aniq ID) bo'yicha; kanallar: sayt, brauzer push, Telegram; qamrovni oldindan ko'rish; tarix |
| Server | CPU, RAM, disk, so'rov/daqiqa, javob vaqti, xatolar (5 soniyada yangilanadi), baza hajmi, jadvallar, zaxira nusxani yuklab olish, tozalash |
| Sozlamalar | Narxlar, limitlar, escrow komissiyasi, ro'yxatdan o'tishni yopish, saytdagi e'lon banneri, valyuta kurslari, o'z login/parolingiz |
| Jurnal | Barcha admin harakatlari |

**Hamyon:** balans USD da saqlanadi, foydalanuvchi valyutasida ko'rinadi. Foydalanuvchi `/payments` sahifasida Click/Payme orqali to'ldiradi, xizmatlarni (TOP, tarif, ko'rik, escrow) "Balansdan" to'laydi.

**Brauzer push:** VAPID kalitlari birinchi ishga tushishda yaratiladi (yoki `.env`: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`). Foydalanuvchi profil → Bildirishnomalar'da yoqadi. Productionda HTTPS shart.

**Kompaniya rekvizitlari (`src/lib/legal.js`):** har bir mamlakatning tashkiliy-huquqiy shakllari (UZ: YaTT, MChJ, XK, AJ, OK; KZ: ИП, ТОО, АО; KG: ИП, ОсОО; RU: ИП, ООО, АО; AZ: FS, MMC, SC; TJ, TM, AF), soliq raqami formati (STIR 9 / JShShIR 14, BIN 12, INN 10/12, VÖEN 10 …), bank rekvizitlari (MFO, BIK, IBAN, h/r). **Davlat ro'yxatidan o'tganlik guvohnomasi barcha shakllar uchun majburiy** — yuklanmaguncha kompaniya tekshiruvga yuborilmaydi.

### Click va Payme'ni ulash
1. `.env` ga `SITE_URL=https://sizning-domen.uz` qo'ying (HTTPS majburiy).
2. **Click** kabinetida Prepare URL: `https://domen/api/v1/pay/click/prepare`, Complete URL: `https://domen/api/v1/pay/click/complete`; `CLICK_SERVICE_ID`, `CLICK_MERCHANT_ID`, `CLICK_SECRET_KEY` ni to'ldiring.
3. **Payme** kassasida Endpoint: `https://domen/api/v1/pay/payme`, hisob maydoni nomi: `payment_id`; `PAYME_MERCHANT_ID`, `PAYME_KEY` ni to'ldiring. Sinov uchun `PAYME_CHECKOUT_URL=https://checkout.test.paycom.uz`.
4. Productionda `PAYMENTS_DEV=0`.

Click va Payme faqat so'mda qabul qiladi — boshqa valyutadagi narxlar to'lov paytida so'mga o'giriladi. Kaspi (Qozog'iston), Mbank (Qirg'iziston) va Uzum ochiq API bermaydi — shartnomadan so'ng `src/lib/payments.js` ga shu andozada qo'shiladi.

### Ma'lumotlar bazasi
SQLite (WAL rejimida) bir necha ming faol foydalanuvchiga yetadi. Kattaroq yuklama uchun PostgreSQL'ga ko'chirish keyingi bosqich sifatida tavsiya etiladi.

### Testlar
`npm test` — 60 ta e2e test (`test/admin.test.js` — admin panel, hamyon, push, sozlamalar; `test/api.test.js` — asosiy oqimlar, `test/features.test.js` — to'lovlar, escrow, ijara, xarita, SEO; `test/accounts.test.js` — ro'yxatdan o'tish turlari, parol, biznes kabinet, bo'limlar, PDF).

## Backend API
HEMU.UZ backend: Markaziy Osiyo bo'yicha maxsus texnika, ehtiyot qismlar, qurilish materiallari va xizmatlar bozori.

- **Mamlakatlar (8):** O'zbekiston, Qozog'iston, Qirg'iziston, Tojikiston, Turkmaniston, Afg'oniston, Ozarbayjon, Rossiya
- **Tillar (10):** `uz` o'zbek, `ru` rus, `en` ingliz, `kk` qozoq, `ky` qirg'iz, `tg` tojik, `tk` turkman, `az` ozarbayjon, `prs` dari (RTL), `ps` pashto (RTL)
- **Valyutalar:** UZS, KZT, KGS, TJS, TMT, AFN, AZN, RUB, USD, EUR, CNY. Har bir narx sotuvchi valyutasida saqlanadi, xaridorga esa uning valyutasida ko'rsatiladi. Kurslar O'zbekiston Markaziy bankidan (cbu.uz) olinadi.

Stek: Node.js 22.13+ (o'rnatilgan `node:sqlite`), Express 5, Multer. Native modul yo'q, Windows'da qo'shimcha o'rnatishsiz ishlaydi.

## Ishga tushirish

```bash
npm install
npm run seed     # demo baza: 8 mamlakatdan 16 ta e'lon, chat, buyurtmalar
npm start        # http://localhost:4700/api/v1
npm test         # 17 ta e2e test
```

Windows'da `start.bat` faylini ikki marta bosish kifoya.

Demo kirish: SMS kodi dev rejimida javobning `dev_code` maydonida qaytadi.

| Rol | Telefon |
|---|---|
| Admin | +998 90 000 00 01 |
| Sotuvchi (TexnoPark, tasdiqlangan) | +998 90 123 45 67 |
| Xaridor | +998 90 765 43 21 |

## So'rov konteksti

Har bir so'rovga til va valyutani shu sarlavhalar orqali berish mumkin:

| Nima | Qanday | Ustuvorlik |
|---|---|---|
| Til | `?lang=` → `X-Lang` → profil → `Accept-Language` → `uz` | `fa`/`fa-AF` → `prs` |
| Valyuta | `?currency=` → `X-Currency` → profil → mamlakat valyutasi | |
| Mamlakat | `X-Country` → profil → `UZ` | |
| Avtorizatsiya | `Authorization: Bearer <token>` | |

Xatolar foydalanuvchi tilida qaytadi:
`{"error": {"code": "invalid_phone", "message": "Неверный номер телефона", "details": {...}}}`

## Endpointlar (`/api/v1`)

### Ma'lumotnomalar
| | |
|---|---|
| `GET /meta` | tillar, mamlakatlar (telefon kodi, valyuta), valyutalar, holatlar va birliklar. Ilova ochilganda bitta so'rov bilan olinadi |
| `GET /i18n/:lang` | API matnlari lug'ati |
| `GET /geo/countries`, `GET /geo/countries/:code/regions` | viloyatlar (e'lonlar soni bilan) |
| `GET /currencies`, `GET /currencies/convert?amount=&from=&to=` | |
| `GET /categories?q=` | "Категории" sahifasi: 7 yo'nalish va 50+ bo'lim, sonlari bilan; qidiruv istalgan tilda |
| `GET /categories/:slug` | |

### Kirish (SMS-kod)
`POST /auth/otp/request {phone, country?}` → `POST /auth/otp/verify {phone, code, name?}` → `{token, user}`
`POST /auth/logout`, `GET /auth/sessions` ("Активные устройства"), `DELETE /auth/sessions/:id`, `POST /auth/sessions/revoke-others`
`GET /me`, `PATCH /me` (ism, til, valyuta, bildirishnoma sozlamalari), `POST /me/avatar`

Telefon har qanday formatda qabul qilinadi (`90 123 45 67`, `8 916…`, `+7 701…`). `+7` raqamlari prefiksga qarab Qozog'iston yoki Rossiyaga ajratiladi.

### Dizayn sahifalari bo'yicha
| Sahifa | Endpoint |
|---|---|
| Bosh sahifa | `GET /home` (hero, kategoriyalar, ommabop, tavsiyalar, yangilari) |
| Katalog / Lenta / Qidiruv | `GET /listings?q=&category=&subcategory=&deal_type=&country=&region=&price_min=&price_max=&year_min=&year_max=&condition=&brand=&verified=1&period_days=7&sort=new\|price_asc\|price_desc\|popular&facets=1&page=` |
| Filtrlar ("Подходит 86 объявлений") | `GET /listings/count?...`, `GET /listings/facets?...` |
| Texnika / ehtiyot qism kartochkasi | `GET /listings/:id` (o'xshashlari bilan), `POST /listings/:id/phone`, `POST /listings/:id/leads {kind: inspection\|invoice\|compatibility\|rent}` |
| E'lon yaratish | `POST /listings` → `POST /listings/:id/photos` (multipart `files`, 15 tagacha) → `POST /listings/:id/publish` |
| Mening e'lonlarim | `GET /my/listings?status=`, `PATCH /listings/:id`, `POST /listings/:id/bump\|archive\|sold`, `DELETE /listings/:id` |
| Zayavka yaratish | `POST /requests`, `GET /requests` (sotuvchilar uchun lenta), `POST /requests/:id/offers`, `POST /requests/:id/offers/:oid/accept` |
| Mening buyurtmalarim | `POST /orders`, `GET /orders?tab=active\|completed&role=buyer\|seller`, `POST /orders/:id/confirm\|ship\|deliver\|complete\|cancel\|review`, `GET /orders/:id/invoice` |
| Saralanganlar | `GET /favorites`, `PUT\|DELETE /favorites/:listingId`, `GET\|POST /saved-searches`, `POST /saved-searches/:id/seen` |
| Xabarlar | `GET /conversations?q=`, `POST /conversations`, `GET\|POST /conversations/:id/messages` (fayl ilova qilish mumkin), `POST /conversations/:id/read` |
| Profil | `GET\|POST\|PATCH /my/company`, `POST /my/company/logo`, `POST /my/company/verification` (hujjatlar) |
| Sotuvchi kabineti | `GET /seller/dashboard` (statistika, 7 kunlik grafik, arizalar, voqealar), `GET /seller/leads`, `GET /seller/stats?days=30` |
| Kompaniya sahifasi | `GET /companies/:id`, `GET /companies/:id/reviews` |
| Belgilar | `GET /badges`, `GET /notifications`, `POST /notifications/read` |
| Real vaqt | `GET /stream?token=` (SSE: `message`, `notification`, `read`) |

### Admin (`role = admin`)
`GET /admin/stats` · `GET /admin/listings?status=moderation` · `POST /admin/listings/:id/approve|reject` · `GET /admin/companies?verification=pending` · `POST /admin/companies/:id/verify|reject` · `GET /admin/users` · `POST /admin/users/:id/block|unblock` · `PUT /admin/rates` · `POST /admin/rates/sync`

## Biznes qoidalar
- Yangi e'lon moderatsiyaga tushadi. Tasdiqlangan kompaniyalar e'lonlari darhol chiqadi (`AUTO_APPROVE_VERIFIED`).
- Tasdiqlanmagan sotuvchi faol e'lon matnini o'zgartirsa, e'lon qayta moderatsiyaga tushadi.
- Sarlavha va tavsifda telefon, email yoki Telegram ko'rsatib bo'lmaydi ("Не указывайте контакты в описании").
- E'lon 30 kun faol turadi; "Продлить" muddatni uzaytiradi va e'lonni yuqoriga ko'taradi (sutkada bir marta).
- Buyurtma tasdiqlanganda zaxira band qilinadi, bekor qilinsa qaytariladi.
- Sharhni faqat yakunlangan buyurtmadan keyin qoldirish mumkin; kompaniya reytingi avtomatik qayta hisoblanadi.
- Kompaniya nomi yoki STIR/INN o'zgarsa, qayta tekshiruv talab qilinadi.
- Narx o'zgarsa, e'lonni saralaganlarga xabar boradi. Yangi e'lon saqlangan qidiruvga mos kelsa ham xabar boradi.
- Xaridor so'rov yaratsa, shu bo'lim va mamlakatdagi sotuvchilarga xabar boradi.
- Qidiruv kirill va lotinni bir xil tushunadi: `экскаватор` = `ekskavator`; kategoriya nomlari 10 tilning istalganida topiladi.
- Kompaniya hujjatlari va chat fayllari ochiq havola bilan berilmaydi: `/api/v1/files/...` orqali faqat egasi, suhbat ishtirokchisi yoki admin ocha oladi.

## Sozlamalar (`.env`)
`.env.example` faylini ko'ring. Production uchun majburiy sozlamalar:
- `APP_SECRET`
- `NODE_ENV=production` (`dev_code` o'chadi)
- `CORS_ORIGINS`
- `PUBLIC_URL`

SMS provayderi `src/lib/sms.js` faylida ulanadi: Eskiz.uz, Mobizon.kz, Nikita.kg, SMS.ru va boshqalar. Mamlakatga qarab provayder tanlash mumkin.

## Yangi mamlakat yoki til qo'shish
- **Mamlakat:** `src/geo.js` ichida `COUNTRIES` ga (valyuta, telefon kodi) va `REGIONS` ga viloyatlarni qo'shing.
- **Til:** `src/i18n.js` ichida `LANGUAGES` ga qo'shing, so'ng `M` lug'ati va `src/catalog.js` ga tarjimalarni qo'shing. Mamlakat va valyuta nomlari, raqam formati va hafta kunlari `Intl` orqali avtomatik chiqadi.

> Tarjimalar (ayniqsa turkman, dari va pashto) ishga chiqishdan oldin shu tilda so'zlashuvchi tomonidan tekshirilishi kerak.
