// Ommaviy yuklash uchun yordamchilar: sotuvchining o'z jadvalidagi ustun nomlarini tanish,
// narxni "1 250 000 so'm", "$62,500", "1 250 000,50" kabi yozuvlardan o'qish, rubrikani nomdan topish.
// Toza funksiyalar (bazaga bog'liq emas) — testlarda alohida tekshiriladi.

const FIELDS = ['deal_type', 'category', 'subcategory', 'title', 'description', 'price', 'currency', 'price_unit', 'condition', 'brand', 'model', 'year', 'hours', 'power_hp', 'part_number', 'manufacturer', 'stock_qty', 'warranty_months', 'compatibility', 'negotiable', 'leasing', 'with_operator', 'country', 'region', 'city', 'address', 'serial_number', 'analogs', 'mileage_km', 'weight_kg', 'capacity_t', 'external_id', 'photos'];

// Ustun nomi variantlari (o'zbek, rus, ingliz); taqqoslash norm() dan keyin
const ALIASES = {
  title: ['nomi', 'nom', 'nomlanishi', 'mahsulot', 'mahsulot nomi', 'tovar', 'tovar nomi', 'sarlavha', "e'lon nomi", 'texnika', 'texnika nomi', 'qism nomi', 'название', 'наименование', 'наименование товара', 'товар', 'название товара', 'заголовок', 'name', 'product', 'product name', 'item', 'title'],
  description: ['tavsif', 'tavsifi', 'izoh', 'batafsil', 'описание', 'примечание', 'комментарий', 'description', 'details', 'notes'],
  price: ['narx', 'narxi', 'bahosi', 'sotuv narxi', 'цена', 'стоимость', 'цена продажи', 'price', 'cost'],
  currency: ['valyuta', 'pul birligi', 'валюта', 'currency'],
  price_unit: ['narx birligi', 'birlik', "o'lchov birligi", 'единица', 'ед изм', 'единица измерения', 'unit', 'price unit'],
  condition: ['holati', 'holat', 'состояние', 'condition'],
  brand: ['marka', 'markasi', 'brend', 'brand', 'марка', 'бренд', 'make'],
  model: ['model', 'modeli', 'модель'],
  year: ['yil', 'yili', 'ishlab chiqarilgan yili', 'chiqarilgan yili', 'год', 'год выпуска', 'year'],
  hours: ['motosoat', 'moto soat', 'motor soat', 'ish soati', 'моточасы', 'наработка', 'hours', 'engine hours'],
  power_hp: ['quvvat', 'quvvati', 'ot kuchi', 'мощность', 'power', 'hp'],
  part_number: ['artikul', 'artikuli', 'kod', 'katalog raqami', 'detal raqami', 'oem', 'артикул', 'код', 'каталожный номер', 'номер детали', 'номер', 'part number', 'part no', 'part', 'pn', 'sku'],
  manufacturer: ['ishlab chiqaruvchi', 'zavod', 'производитель', 'manufacturer', 'maker'],
  stock_qty: ['soni', 'miqdor', 'miqdori', 'qoldiq', 'omborda', 'ombordagi soni', 'количество', 'кол-во', 'кол во', 'остаток', 'наличие', 'на складе', 'qty', 'quantity', 'stock', 'in stock'],
  warranty_months: ['kafolat', 'kafolat muddati', 'гарантия', 'warranty'],
  compatibility: ['mos texnika', 'moslik', 'mosligi', 'qaysi texnikaga', 'совместимость', 'применяемость', 'подходит для', 'применимость', 'compatibility', 'compatible with', 'fits'],
  analogs: ['analog', 'analoglar', 'аналог', 'аналоги', 'кроссы', 'analogs', 'cross'],
  category: ['kategoriya', "bo'lim", 'категория', 'раздел', 'category'],
  subcategory: ['rubrika', 'turi', 'tur', 'рубрика', 'подкатегория', 'тип', 'вид', 'subcategory', 'type'],
  deal_type: ['bitim turi', 'bitim', 'тип сделки', 'сделка', 'deal type', 'deal'],
  negotiable: ['kelishiladi', 'kelishuv', 'торг', 'negotiable'],
  leasing: ['lizing', 'лизинг', 'leasing'],
  with_operator: ['operator bilan', 'с оператором', 'with operator'],
  country: ['mamlakat', 'davlat', 'страна', 'country'],
  region: ['viloyat', 'hudud', 'регион', 'область', 'region'],
  city: ['shahar', 'tuman', 'город', 'населенный пункт', 'city'],
  address: ['manzil', 'адрес', 'address'],
  serial_number: ['seriya raqami', 'zavod raqami', 'vin', 'серийный номер', 'заводской номер', 'serial', 'serial number'],
  mileage_km: ['probeg', 'yurgan masofa', 'пробег', 'mileage'],
  weight_kg: ['vazn', "og'irligi", 'вес', 'масса', 'weight'],
  capacity_t: ['yuk ko\'tarish', "yuk ko'tarishi", 'грузоподъемность', 'capacity'],
  photos: ['rasm', 'rasmlar', 'rasm havolasi', 'surat', 'foto', 'фото', 'фотографии', 'ссылка на фото', 'изображение', 'photo', 'photos', 'image', 'images', 'picture'],
  external_id: ['id', 'external id'],
};

// Taqqoslash uchun: kichik harf, apostrof turlari birlashtiriladi, qavs ichi va verguldan keyingi qism
// ("Narxi, so'm", "Omborda (dona)") olib tashlanadi, * va tinish belgilari yo'qoladi
function norm(h) {
  return String(h ?? '')
    .split('|')[0]
    .toLowerCase()
    .replace(/[ʻʼ‘’`´]/g, "'")
    .replace(/ё/g, 'е')
    .replace(/\([^)]*\)/g, ' ')
    .split(',')[0]
    .replace(/[*:.№#"«»]/g, ' ')
    .replace(/[_\-/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const LOOKUP = new Map();
for (const f of FIELDS) LOOKUP.set(norm(f), f);
for (const [f, list] of Object.entries(ALIASES)) for (const a of list) LOOKUP.set(norm(a), f);

// Qo'shimcha nomlar (masalan, shablondagi "Omborda, dona") — tashqaridan qo'shiladi
function addAliases(map) {
  for (const [f, label] of Object.entries(map)) { const k = norm(label); if (k && !LOOKUP.has(k)) LOOKUP.set(k, f); }
}

// Sarlavha katagi -> maydon kaliti ('' — tanilmagan ustun, e'tiborga olinmaydi)
function headerKey(h) {
  const raw = String(h ?? '');
  // Shablon sarlavhasi: "title | Nomi *" — kalit qismi to'g'ridan-to'g'ri
  const key = raw.split('|')[0].trim().toLowerCase().replace(/\s+/g, '_');
  if (FIELDS.includes(key)) return key;
  return LOOKUP.get(norm(raw)) || '';
}

// Narx yozuvidan son va valyuta
const CUR_RE = [
  ['USD', /\$|\busd\b|долл|dollar/i],
  ['EUR', /€|\beur\b|евро|euro/i],
  ['RUB', /₽|\brub\b|руб/i],
  ['KZT', /₸|\bkzt\b|тенге|tenge/i],
  ['CNY', /¥|\bcny\b|юан|yuan/i],
  ['UZS', /so['ʻʼ‘’`]?m\b|\bsum\b|сум|\buzs\b/i],
];
function parsePrice(v) {
  const s = String(v ?? '').trim();
  if (!s) return { price: '' };
  const currency = (CUR_RE.find(([, re]) => re.test(s)) || [])[0];
  let n = s.replace(/[^\d.,]/g, '');
  if (!/\d/.test(n)) return { price: '', currency };
  const lastDot = n.lastIndexOf('.');
  const lastComma = n.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // Oxirgi ajratuvchi — kasr, qolganlari — minglik
    const dec = Math.max(lastDot, lastComma);
    n = `${n.slice(0, dec).replace(/[.,]/g, '')}.${n.slice(dec + 1)}`;
  } else {
    const sep = lastDot >= 0 ? '.' : lastComma >= 0 ? ',' : '';
    if (sep) {
      const parts = n.split(sep);
      // "62,500" / "1.250.000" — minglik; "1250,50" / "45.5" — kasr
      const thousands = parts.length > 2 || (parts[parts.length - 1].length === 3 && parts[0].length <= 3 && parts[0] !== '0');
      n = thousands ? parts.join('') : `${parts.slice(0, -1).join('')}.${parts[parts.length - 1]}`;
    }
  }
  return { price: n, currency };
}

// Matndan rubrikani topish: rubrika nomidagi so'zlarning o'zagi (oxirgi 1–3 harfsiz) matnda uchraydimi
const WORD = /[\p{L}\p{N}]+/gu;
const stems = (name) => (String(name).toLowerCase().match(WORD) || []).filter((w) => w.length >= 4).map((w) => w.slice(0, Math.max(4, w.length - 3)));
function guessChild(text, children) {
  const t = ` ${String(text || '').toLowerCase().replace(/ё/g, 'е')} `;
  let best = null;
  let bestScore = 0;
  for (const c of children || []) {
    let score = 0;
    for (const name of Object.values(c.names || {})) {
      const st = stems(name);
      const hit = st.filter((s) => t.includes(s)).length;
      if (hit) score = Math.max(score, hit * 10 - (st.length - hit));
    }
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return best;
}

module.exports = { headerKey, addAliases, parsePrice, guessChild, norm, FIELDS };
