// Qorong'i mavzuni sahifa chizilishidan oldin qo'llash (oq "chaqnash"siz).
// Alohida fayl: saytning CSP siyosati ichki (inline) skriptlarni taqiqlaydi.
try {
  if (localStorage.getItem('mx_theme') === 'dark') {
    document.documentElement.dataset.theme = 'dark';
    document.querySelector('meta[name=color-scheme]').content = 'dark';
    document.querySelector('meta[name=theme-color]').content = '#0d141c';
  }
} catch (e) { /* xotira yopiq bo'lsa — yorug' mavzu */ }
