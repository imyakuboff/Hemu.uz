// Kompaniya rekvizitlari: har bir mamlakatning tashkiliy-huquqiy shakllari,
// soliq raqami formati, bank rekvizitlari va majburiy hujjatlar (guvohnoma).
const { pick } = require('../i18n');

// Hujjat turlari
const DOCS = {
  reg_cert: { uz: "Davlat ro'yxatidan o'tganlik guvohnomasi", ru: 'Свидетельство о государственной регистрации', en: 'State registration certificate', kk: 'Мемлекеттік тіркеу туралы куәлік', ky: 'Мамлекеттик каттоо күбөлүгү', tg: 'Шаҳодатномаи бақайдгирии давлатӣ', tk: 'Döwlet hasabyna alnandygy baradaky şahadatnama', az: 'Dövlət qeydiyyatı haqqında şəhadətnamə' },
  tin_cert: { uz: "Soliq to'lovchi (STIR) guvohnomasi", ru: 'Свидетельство о постановке на налоговый учёт (ИНН)', en: 'Tax registration certificate', kk: 'Салықтық тіркеу куәлігі', ky: 'Салык каттоо күбөлүгү', tg: 'Шаҳодатномаи РМА', tk: 'Salgyt hasabyna goýlandygy baradaky şahadatnama', az: 'VÖEN şəhadətnaməsi' },
  charter: { uz: 'Ustav', ru: 'Устав', en: 'Charter', kk: 'Жарғы', ky: 'Устав', tg: 'Оиннома', tk: 'Düzgünnama', az: 'Nizamnamə' },
  license: { uz: 'Litsenziya (agar bo\'lsa)', ru: 'Лицензия (если есть)', en: 'License (if any)', kk: 'Лицензия (бар болса)', ky: 'Лицензия (бар болсо)', tg: 'Иҷозатнома (агар бошад)', tk: 'Ygtyýarnama (bar bolsa)', az: 'Lisenziya (varsa)' },
  director: { uz: "Rahbar tayinlangani to'g'risida buyruq", ru: 'Приказ о назначении руководителя', en: 'Director appointment order', kk: 'Басшыны тағайындау туралы бұйрық', ky: 'Жетекчини дайындоо буйругу', tg: 'Фармон дар бораи таъини роҳбар', tk: 'Ýolbaşçyny bellemek baradaky buýruk', az: 'Rəhbərin təyinatı haqqında əmr' },
  passport: { uz: 'Pasport (YaTT uchun)', ru: 'Паспорт (для ИП)', en: 'Passport (sole proprietor)', kk: 'Төлқұжат (ЖК үшін)', ky: 'Паспорт (ЖИ үчүн)', tg: 'Шиноснома (барои СЯ)', tk: 'Pasport (telekeçi üçin)', az: 'Şəxsiyyət vəsiqəsi (FS üçün)' },
};

// Rekvizit maydonlari (nomlari mamlakatga qarab o'zgaradi)
const L = (uz, ru, en, extra = {}) => ({ uz, ru, en, ...extra });

const COMMON = {
  director: L('Rahbar F.I.Sh.', 'ФИО руководителя', 'Director full name', { kk: 'Басшының аты-жөні', az: 'Rəhbərin adı', tk: 'Ýolbaşçynyň ady' }),
  legal_address: L('Yuridik manzil', 'Юридический адрес', 'Legal address', { kk: 'Заңды мекенжай', az: 'Hüquqi ünvan', tk: 'Ýuridik salgysy' }),
  bank_name: L('Bank nomi', 'Наименование банка', 'Bank name', { kk: 'Банк атауы', az: 'Bankın adı', tk: 'Bankyň ady' }),
  reg_date: L("Ro'yxatdan o'tgan sana", 'Дата регистрации', 'Registration date', { kk: 'Тіркелген күні', az: 'Qeydiyyat tarixi', tk: 'Hasaba alnan senesi' }),
};

// pattern — qiymat formati; null bo'lsa erkin
const COUNTRIES = {
  UZ: {
    tin: { label: L('STIR (INN)', 'ИНН (СТИР)', 'TIN (STIR)'), pattern: '^\\d{9}$', ph: '301234567' },
    reg_number: { label: L('Guvohnoma raqami', 'Номер свидетельства', 'Certificate number'), ph: '1234567' },
    activity_code: { label: L('IFUT (OKED)', 'ОКЭД', 'Activity code (OKED)'), pattern: '^\\d{4,5}$', ph: '46690' },
    bank_code: { label: L('MFO', 'МФО', 'Bank code (MFO)'), pattern: '^\\d{5}$', ph: '00450' },
    bank_account: { label: L('Hisob raqami (h/r)', 'Расчётный счёт', 'Account number'), pattern: '^\\d{20}$', ph: '20208000900123456001' },
    vat: { label: L("QQS to'lovchi kodi", 'Код плательщика НДС', 'VAT payer code'), pattern: '^\\d{12}$', ph: '326010012345' },
    forms: [
      { code: 'yatt', names: L('YaTT — yakka tartibdagi tadbirkor', 'ЯТТ (ИП) — индивидуальный предприниматель', 'Sole proprietor (YaTT)'), individual: true, tin: { label: L('STIR yoki JShShIR', 'ИНН или ПИНФЛ', 'TIN or PINFL'), pattern: '^(\\d{9}|\\d{14})$', ph: '301234567' }, docs: ['reg_cert', 'passport', 'license'] },
      { code: 'mchj', names: L("MChJ — mas'uliyati cheklangan jamiyat", 'МЧЖ (ООО) — общество с ограниченной ответственностью', 'LLC (MChJ)'), docs: ['reg_cert', 'charter', 'director', 'license'] },
      { code: 'xk', names: L('XK — xususiy korxona', 'ХК (ЧП) — частное предприятие', 'Private enterprise (XK)'), docs: ['reg_cert', 'charter', 'license'] },
      { code: 'aj', names: L('AJ — aksiyadorlik jamiyati', 'АЖ (АО) — акционерное общество', 'Joint-stock company (AJ)'), docs: ['reg_cert', 'charter', 'director', 'license'] },
      { code: 'ok', names: L('OK — oilaviy korxona', 'ОП — семейное предприятие', 'Family enterprise'), docs: ['reg_cert', 'charter'] },
    ],
  },
  KZ: {
    tin: { label: L('BSN / JSN', 'БИН / ИИН', 'BIN / IIN', { kk: 'БСН / ЖСН' }), pattern: '^\\d{12}$', ph: '123456789012' },
    reg_number: { label: L("Ro'yxat ma'lumotnomasi raqami", 'Номер справки о гос. регистрации', 'Registration number', { kk: 'Тіркеу анықтамасының нөмірі' }), ph: '' },
    activity_code: { label: L('OKED', 'ОКЭД', 'Activity code (OKED)', { kk: 'ЭҚЖЖ' }), pattern: '^\\d{5}$', ph: '46630' },
    bank_code: { label: L('BIK', 'БИК', 'BIC', { kk: 'БСК' }), pattern: '^[A-Z0-9]{8}$', ph: 'KCJBKZKX' },
    bank_account: { label: L('IBAN (IIK)', 'ИИК (IBAN)', 'IBAN', { kk: 'ЖСК (IBAN)' }), pattern: '^KZ\\d{2}[A-Z0-9]{16}$', ph: 'KZ12345678901234567' },
    vat: { label: L("QQS hisobi to'g'risida guvohnoma", 'Свидетельство по НДС', 'VAT certificate', { kk: 'ҚҚС бойынша куәлік' }), ph: '' },
    forms: [
      { code: 'ip', names: L('YaT — yakka tadbirkor', 'ИП — индивидуальный предприниматель', 'Sole proprietor (IP)', { kk: 'ЖК — жеке кәсіпкер' }), individual: true, docs: ['reg_cert', 'passport', 'license'] },
      { code: 'too', names: L('TOO — MChJ', 'ТОО — товарищество с ограниченной ответственностью', 'LLP (TOO)', { kk: 'ЖШС — жауапкершілігі шектеулі серіктестік' }), docs: ['reg_cert', 'charter', 'director', 'license'] },
      { code: 'ao', names: L('AJ — aksiyadorlik jamiyati', 'АО — акционерное общество', 'JSC (AO)', { kk: 'АҚ — акционерлік қоғам' }), docs: ['reg_cert', 'charter', 'director'] },
    ],
  },
  KG: {
    tin: { label: L('INN', 'ИНН', 'TIN', { ky: 'ИСН' }), pattern: '^\\d{14}$', ph: '01234567890123' },
    reg_number: { label: L("Ro'yxat raqami", 'Регистрационный номер', 'Registration number', { ky: 'Каттоо номери' }), ph: '' },
    activity_code: { label: L('GKED', 'ГКЭД', 'Activity code (GKED)'), ph: '46.63.0' },
    bank_code: { label: L('BIK', 'БИК', 'BIC'), pattern: '^\\d{6}$', ph: '109018' },
    bank_account: { label: L('Hisob raqami', 'Расчётный счёт', 'Account number', { ky: 'Эсептешүү эсеби' }), pattern: '^\\d{16}$', ph: '1090000123456789' },
    vat: { label: L('QQS guvohnomasi', 'Свидетельство НДС', 'VAT certificate'), ph: '' },
    forms: [
      { code: 'ip', names: L('YaT — yakka tadbirkor', 'ИП — индивидуальный предприниматель', 'Sole proprietor', { ky: 'ЖИ — жеке ишкер' }), individual: true, docs: ['reg_cert', 'passport', 'license'] },
      { code: 'osoo', names: L('MChJ (OsOO)', 'ОсОО — общество с ограниченной ответственностью', 'LLC (OsOO)', { ky: 'ЖЧК — жоопкерчилиги чектелген коом' }), docs: ['reg_cert', 'charter', 'director', 'license'] },
      { code: 'ao', names: L('AJ — aksiyadorlik jamiyati', 'АО — акционерное общество', 'JSC'), docs: ['reg_cert', 'charter', 'director'] },
    ],
  },
  TJ: {
    tin: { label: L('RMA (INN)', 'ИНН (РМА)', 'TIN (RMA)', { tg: 'РМА' }), pattern: '^\\d{9}$', ph: '020012345' },
    reg_number: { label: L('YaRM (EIN)', 'ЕИН (РЯМ)', 'Unified ID (EIN)', { tg: 'РЯМ' }), ph: '' },
    activity_code: { label: L('OKED', 'ОКЭД', 'Activity code'), ph: '' },
    bank_code: { label: L('BIK', 'БИК', 'BIC'), pattern: '^\\d{9}$', ph: '350101626' },
    bank_account: { label: L('Hisob raqami', 'Расчётный счёт', 'Account number', { tg: 'Суратҳисоб' }), pattern: '^\\d{20}$', ph: '20202972100012345678' },
    vat: { label: L('QQS guvohnomasi', 'Свидетельство НДС', 'VAT certificate'), ph: '' },
    forms: [
      { code: 'ip', names: L('YaT — yakka tadbirkor', 'ИП — индивидуальный предприниматель', 'Sole proprietor', { tg: 'СЯ — соҳибкори инфиродӣ' }), individual: true, docs: ['reg_cert', 'passport', 'license'] },
      { code: 'ooo', names: L("MChJ — mas'uliyati cheklangan jamiyat", 'ООО — общество с ограниченной ответственностью', 'LLC', { tg: 'ҶДММ' }), docs: ['reg_cert', 'charter', 'director', 'license'] },
      { code: 'oao', names: L('AJ — aksiyadorlik jamiyati', 'ОАО — открытое акционерное общество', 'JSC', { tg: 'ҶСК' }), docs: ['reg_cert', 'charter', 'director'] },
    ],
  },
  TM: {
    tin: { label: L('Salgyt belgisi (INN)', 'ИНН (салгыт белгиси)', 'Taxpayer ID', { tk: 'Salgyt töleýjiniň belgisi' }), pattern: '^\\d{8,14}$', ph: '101234567890' },
    reg_number: { label: L("Ro'yxat raqami", 'Регистрационный номер', 'Registration number', { tk: 'Hasaba alyş belgisi' }), ph: '' },
    activity_code: { label: L('Faoliyat kodi', 'Код деятельности', 'Activity code', { tk: 'Işiň kody' }), ph: '' },
    bank_code: { label: L('BIK', 'БИК', 'BIC', { tk: 'BIK' }), pattern: '^\\d{8,9}$', ph: '39010101' },
    bank_account: { label: L('Hisob raqami', 'Расчётный счёт', 'Account number', { tk: 'Hasaplaşyk hasaby' }), pattern: '^\\d{20,23}$', ph: '23201934150112345678' },
    vat: { label: L('QQS raqami', 'Номер НДС', 'VAT number', { tk: 'GBS belgisi' }), ph: '' },
    forms: [
      { code: 'ip', names: L('Xususiy tadbirkor', 'ИП — индивидуальный предприниматель', 'Sole proprietor', { tk: 'Hususy telekeçi' }), individual: true, docs: ['reg_cert', 'passport', 'license'] },
      { code: 'hj', names: L("Xo'jalik jamiyati", 'ХО — хозяйственное общество', 'Business company (HJ)', { tk: 'HJ — hojalyk jemgyýeti' }), docs: ['reg_cert', 'charter', 'director', 'license'] },
      { code: 'hk', names: L('Xususiy korxona', 'ЧП — частное предприятие', 'Private enterprise', { tk: 'HK — hususy kärhana' }), docs: ['reg_cert', 'charter'] },
    ],
  },
  AF: {
    tin: { label: L('TIN', 'ИНН (TIN)', 'TIN', { prs: 'نمبر تشخیصیه مالیه (TIN)', ps: 'د مالیې تشخیصیه شمېره (TIN)' }), pattern: '^\\d{10}$', ph: '1001234567' },
    reg_number: { label: L('Litsenziya raqami (ACBR)', 'Номер лицензии (ACBR)', 'Business license number (ACBR)', { prs: 'نمبر جواز', ps: 'د جواز شمېره' }), ph: '' },
    activity_code: { label: L('Faoliyat turi', 'Вид деятельности', 'Business activity', { prs: 'نوع فعالیت', ps: 'د فعالیت ډول' }), ph: '' },
    bank_code: { label: L('SWIFT', 'SWIFT', 'SWIFT'), pattern: '^[A-Z0-9]{8}([A-Z0-9]{3})?$', ph: 'AFIBAFKA' },
    bank_account: { label: L('Hisob raqami', 'Номер счёта', 'Account number', { prs: 'نمبر حساب', ps: 'د حساب شمېره' }), pattern: '^[0-9A-Z]{8,30}$', ph: '' },
    vat: { label: L('BRT raqami', 'Номер BRT', 'BRT number'), ph: '' },
    forms: [
      { code: 'sole', names: L('Yakka tadbirkor', 'Индивидуальный предприниматель', 'Sole proprietorship', { prs: 'شرکت انفرادی', ps: 'انفرادي شرکت' }), individual: true, docs: ['reg_cert', 'passport', 'license'] },
      { code: 'llc', names: L("MChJ — mas'uliyati cheklangan", 'Общество с ограниченной ответственностью', 'Limited liability company', { prs: 'شرکت با مسئولیت محدود', ps: 'محدود مسؤلیت لرونکې شرکت' }), docs: ['reg_cert', 'charter', 'license'] },
      { code: 'corp', names: L('Korporatsiya', 'Корпорация', 'Corporation', { prs: 'شرکت سهامی', ps: 'سهامي شرکت' }), docs: ['reg_cert', 'charter', 'director'] },
    ],
  },
  AZ: {
    tin: { label: L('VÖEN', 'ВÖЕН (ИНН)', 'VOEN (TIN)', { az: 'VÖEN' }), pattern: '^\\d{10}$', ph: '1234567891' },
    reg_number: { label: L("Ro'yxat raqami", 'Регистрационный номер', 'Registration number', { az: 'Qeydiyyat nömrəsi' }), ph: '' },
    activity_code: { label: L('Faoliyat kodi', 'Код деятельности', 'Activity code', { az: 'Fəaliyyət kodu' }), ph: '' },
    bank_code: { label: L('Bank kodi', 'Код банка', 'Bank code', { az: 'Bank kodu' }), pattern: '^\\d{6}$', ph: '210005' },
    bank_account: { label: L('IBAN', 'IBAN', 'IBAN', { az: 'Hesab (IBAN)' }), pattern: '^AZ\\d{2}[A-Z]{4}[A-Z0-9]{20}$', ph: 'AZ21NABZ00000000137010001944' },
    vat: { label: L('ƏDV guvohnomasi', 'Свидетельство ƏDV (НДС)', 'VAT certificate', { az: 'ƏDV şəhadətnaməsi' }), ph: '' },
    forms: [
      { code: 'fs', names: L('Yakka tadbirkor', 'Индивидуальный предприниматель', 'Sole proprietor', { az: 'Fərdi sahibkar' }), individual: true, docs: ['reg_cert', 'passport', 'license'] },
      { code: 'mmc', names: L("MChJ (MMC)", 'ООО (MMC)', 'LLC (MMC)', { az: 'MMC — məhdud məsuliyyətli cəmiyyət' }), docs: ['reg_cert', 'charter', 'director', 'license'] },
      { code: 'sc', names: L('AJ (SC)', 'АО (SC)', 'JSC', { az: 'SC — səhmdar cəmiyyəti' }), docs: ['reg_cert', 'charter', 'director'] },
    ],
  },
  RU: {
    tin: { label: L('INN', 'ИНН', 'TIN (INN)'), pattern: '^(\\d{10}|\\d{12})$', ph: '7701234567' },
    reg_number: { label: L('OGRN / OGRNIP', 'ОГРН / ОГРНИП', 'OGRN / OGRNIP'), pattern: '^(\\d{13}|\\d{15})$', ph: '1027700123456' },
    kpp: { label: L('KPP', 'КПП', 'KPP'), pattern: '^\\d{9}$', ph: '770101001' },
    activity_code: { label: L('OKVED', 'ОКВЭД', 'Activity code (OKVED)'), ph: '46.63' },
    bank_code: { label: L('BIK', 'БИК', 'BIC'), pattern: '^\\d{9}$', ph: '044525225' },
    bank_account: { label: L('Hisob raqami', 'Расчётный счёт', 'Account number'), pattern: '^\\d{20}$', ph: '40702810900000012345' },
    corr_account: { label: L('Korr. hisob', 'Корр. счёт', 'Correspondent account'), pattern: '^\\d{20}$', ph: '30101810400000000225' },
    vat: { label: L("QQS to'lovchisi", 'Плательщик НДС', 'VAT payer'), ph: '' },
    forms: [
      { code: 'ip', names: L('YaT — yakka tadbirkor', 'ИП — индивидуальный предприниматель', 'Sole proprietor (IP)'), individual: true, tin: { label: L('INN (12 raqam)', 'ИНН (12 цифр)', 'INN (12 digits)'), pattern: '^\\d{12}$', ph: '771234567890' }, docs: ['reg_cert', 'passport', 'license'] },
      { code: 'ooo', names: L("MChJ (OOO)", 'ООО — общество с ограниченной ответственностью', 'LLC (OOO)'), docs: ['reg_cert', 'charter', 'director', 'license'] },
      { code: 'ao', names: L('AJ (AO)', 'АО — акционерное общество', 'JSC (AO)'), docs: ['reg_cert', 'charter', 'director'] },
    ],
  },
};

// Tasdiq belgisi (tekshirilgan kompaniya) uchun kerakli hujjat — guvohnoma
const REQUIRED_DOCS = ['reg_cert'];
// Asosiy shakllar — yakka tadbirkor (YaTT/ИП) va MChJ (ООО/ТОО ...): har mamlakatdagi birinchi yakka va birinchi yuridik shakl
const isMainForm = (forms, i) => i === 0 || i === forms.findIndex((x) => !x.individual);
// Ro'yxatdan o'tishda guvohnoma faqat asosiy shakllar (YaTT, MChJ) uchun majburiy; boshqalarga — ixtiyoriy
function certRequired(country, code) {
  const forms = (COUNTRIES[country] || COUNTRIES.UZ).forms;
  const i = forms.findIndex((f) => f.code === code);
  return i >= 0 && isMainForm(forms, i);
}
const FIELDS = ['tin', 'reg_number', 'reg_date', 'kpp', 'activity_code', 'director', 'legal_address', 'bank_name', 'bank_code', 'bank_account', 'corr_account', 'vat'];

function formOf(country, code) {
  return COUNTRIES[country]?.forms.find((f) => f.code === code) || null;
}

// Tanlangan mamlakat va shakl uchun maydonlar ro'yxati (frontend shu bo'yicha forma chizadi)
function spec(country, lang) {
  const c = COUNTRIES[country] || COUNTRIES.UZ;
  const field = (key, def, individual) => {
    if (!def && !COMMON[key]) return null;
    const d = def || {};
    return {
      key,
      label: pick(d.label || COMMON[key], lang),
      pattern: d.pattern || null,
      placeholder: d.ph || '',
      required: false, // rekvizitlar ixtiyoriy — majburiy faqat shakl va guvohnoma
      type: key === 'reg_date' ? 'date' : 'text',
    };
  };
  return {
    country,
    forms: c.forms.map((f, i) => ({
      code: f.code,
      // Asosiy shakllar (ro'yxatdan o'tishda ko'rsatiladi): yakka tadbirkor (YaTT) va MChJ
      main: isMainForm(c.forms, i),
      name: pick(f.names, lang),
      individual: Boolean(f.individual),
      docs: f.docs.map((d) => ({ type: d, name: pick(DOCS[d], lang), required: REQUIRED_DOCS.includes(d) && isMainForm(c.forms, i) })),
      fields: FIELDS
        .filter((k) => !(f.individual && (k === 'kpp' || k === 'director')))
        .map((k) => field(k, k === 'tin' && f.tin ? { ...c.tin, ...f.tin } : c[k], f.individual))
        .filter(Boolean),
    })),
  };
}

// Rekvizitlarni tekshirish: noto'g'ri formatdagi maydonlar xato sifatida qaytadi
function validateRequisites(country, form, body = {}) {
  const f = formOf(country, form);
  const errors = {};
  if (!f) return { errors: { legal_form: 'invalid' }, values: {} };
  const s = spec(country, 'en').forms.find((x) => x.code === form);
  const values = {};
  for (const fld of s.fields) {
    let v = body[fld.key];
    if (v === undefined || v === null) continue;
    v = String(v).trim();
    if (fld.key !== 'director' && fld.key !== 'legal_address' && fld.key !== 'bank_name') v = v.replace(/\s+/g, '').toUpperCase();
    if (!v) { values[fld.key] = null; continue; }
    if (v.length > 200) { errors[fld.key] = 'too_long'; continue; }
    if (fld.key === 'reg_date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) { errors[fld.key] = 'invalid'; continue; }
    if (fld.pattern && !new RegExp(fld.pattern).test(v)) { errors[fld.key] = 'invalid'; continue; }
    values[fld.key] = v;
  }
  return { errors, values, form: f };
}

const docName = (type, lang) => pick(DOCS[type] || DOCS.reg_cert, lang);

module.exports = { COUNTRIES, DOCS, REQUIRED_DOCS, FIELDS, formOf, spec, validateRequisites, docName, certRequired };
