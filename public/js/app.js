import { state, t, esc, api, qs, num, debounce, applyDir, setLang, setCurrency, setToken, icon, toast, $, closeModal, toggleTheme, applyTheme } from './core.js';
import { header, footer, bottomNav, loginModal, locationModal, mobileMenu, requireLogin } from './ui.js';
import { toggleCompare, startVoice } from './features.js';

const routes = [
  [/^\/$/, () => import('./pages/home.js')],
  [/^\/catalog$/, () => import('./pages/catalog.js'), 'catalog'],
  [/^\/feed$/, () => import('./pages/catalog.js'), 'feed'],
  [/^\/filters$/, () => import('./pages/catalog.js'), 'filters'],
  [/^\/categories$/, () => import('./pages/categories.js')],
  [/^\/listing\/(\d+)$/, () => import('./pages/listing.js')],
  [/^\/create(?:\/(\d+))?$/, () => import('./pages/create.js'), 'listing'],
  [/^\/request\/new$/, () => import('./pages/create.js'), 'request'],
  [/^\/requests$/, () => import('./pages/account.js'), 'requests'],
  [/^\/my\/listings$/, () => import('./pages/account.js'), 'myListings'],
  [/^\/my\/orders$/, () => import('./pages/account.js'), 'myOrders'],
  [/^\/orders\/(\d+)$/, () => import('./pages/account.js'), 'orderPage'],
  [/^\/fura$/, () => import('./pages/fura.js'), 'fura'],
  [/^\/materials$/, () => import('./pages/materials.js'), 'materials'],
  [/^\/aksiya\/([a-z0-9-]+)$/, () => import('./pages/promos.js'), 'promo'],
  [/^\/my\/promos$/, () => import('./pages/promos.js'), 'myPromos'],
  [/^\/fura\/(\d+)$/, () => import('./pages/fura.js'), 'furaDetail'],
  [/^\/terms$/, () => import('./pages/info.js'), 'terms'],
  [/^\/privacy$/, () => import('./pages/info.js'), 'privacy'],
  [/^\/contact$/, () => import('./pages/info.js'), 'contact'],
  [/^\/prices$/, () => import('./pages/info.js'), 'prices'],
  [/^\/sellers$/, () => import('./pages/info.js'), 'sellers'],
  [/^\/favorites$/, () => import('./pages/account.js'), 'favorites'],
  [/^\/notifications$/, () => import('./pages/account.js'), 'notifications'],
  [/^\/company\/(\d+)$/, () => import('./pages/business.js'), 'store'],
  [/^\/business$/, () => import('./pages/business.js'), 'business'],
  [/^\/register$/, () => import('./pages/auth.js'), 'register'],
  [/^\/forgot$/, () => import('./pages/auth.js'), 'forgot'],
  [/^\/transportsale$/, () => import('./pages/sections.js'), 'transportsale'],
  [/^\/transportrental$/, () => import('./pages/sections.js'), 'transportrental'],
  [/^\/sparepart$/, () => import('./pages/sections.js'), 'sparepart'],
  [/^\/transport-repair$/, () => import('./pages/sections.js'), 'mechanic'],
  // Eski logistika manzillari endi Fura birjasini ochadi
  [/^\/(?:cargologistic|transportlogistic)$/, () => import('./pages/fura.js'), 'fura'],
  [/^\/driver$/, () => import('./pages/sections.js'), 'driver'],
  [/^\/mechanic$/, () => import('./pages/sections.js'), 'mechanic'],
  [/^\/application$/, () => import('./pages/sections.js'), 'application'],
  [/^\/specialist\/(\d+)$/, () => import('./pages/sections.js'), 'specialist'],
  [/^\/admin(?:\/([a-z]+))?(?:\/(\d+))?$/, () => import('./pages/admin.js'), 'adminPage'],
  [/^\/about$/, () => import('./pages/account.js'), 'about'],
  [/^\/messages(?:\/(\d+))?$/, () => import('./pages/messages.js')],
  [/^\/profile$/, () => import('./pages/profile.js'), 'profile'],
  [/^\/dashboard$/, () => import('./pages/profile.js'), 'dashboard'],
  [/^\/payments\/(\d+)$/, () => import('./pages/extra.js'), 'payment'],
  [/^\/payments$/, () => import('./pages/extra.js'), 'payments'],
  [/^\/plans$/, () => import('./pages/extra.js'), 'plans'],
  [/^\/verified$/, () => import('./pages/extra.js'), 'badgePage'],
  [/^\/urgent$/, () => import('./pages/urgent.js'), 'urgentNew'],
  [/^\/urgent\/(\d+)$/, () => import('./pages/urgent.js'), 'urgentView'],
  [/^\/compare$/, () => import('./pages/extra.js'), 'compare'],
  [/^\/my\/import$/, () => import('./pages/extra.js'), 'importPage'],
  [/^\/analytics$/, () => import('./pages/extra.js'), 'analytics'],
];

const app = document.getElementById('app');
let renderSeq = 0;
let cleanup = null;

// Ko'rishlar manbasi (sotuvchi statistikasi uchun): oldingi sahifaga qarab
function sourceFrom(prev) {
  if (!prev) return document.referrer && !document.referrer.startsWith(location.origin) ? (/t\.me|telegram/.test(document.referrer) ? 'telegram' : 'external') : 'direct';
  const u = new URL(prev, location.origin);
  if (u.pathname === '/') return 'home';
  if (u.pathname === '/catalog') return u.searchParams.get('q') ? 'search' : u.searchParams.get('view') === 'map' ? 'map' : 'catalog';
  return { '/feed': 'feed', '/favorites': 'favorites', '/compare': 'compare' }[u.pathname]
    || (u.pathname.startsWith('/listing/') ? 'similar' : u.pathname.startsWith('/company/') ? 'company' : u.pathname.startsWith('/messages') ? 'messages' : 'direct');
}
let prevHref = null;

// Ichki havola saytdagi mavjud sahifaga olib boradimi (admin: push va banner havolalari uchun)
export function routeExists(href) {
  const p = String(href || '').split(/[?#]/)[0];
  return p.startsWith('/') && routes.some((r) => r[0].test(p));
}

export function go(href, { replace = false } = {}) {
  prevHref = location.pathname + location.search;
  if (replace) history.replaceState(null, '', href);
  else history.pushState(null, '', href);
  render();
}
window.mxGo = go;

export async function render({ keepScroll = false } = {}) {
  const seq = ++renderSeq;
  const path = location.pathname;
  const query = Object.fromEntries(new URLSearchParams(location.search));
  let match = null;
  let entry = null;
  for (const r of routes) {
    match = path.match(r[0]);
    if (match) { entry = r; break; }
  }
  cleanup?.();
  cleanup = null;
  closeModal();
  // Admin panel — sayt sarlavhasi/footerisiz, faqat boshqaruv
  const shell = /^\/admin(\/|$)/.test(path)
    ? (html) => `<main class="page adm-page">${html}</main>`
    : (html) => `${header(path)}<main class="page"><div class="container">${html}</div></main>${footer()}${bottomNav(path)}`;
  if (!entry) {
    app.innerHTML = shell(`<div class="box empty"><h3>${esc(t('not_found_page'))}</h3><a href="/" class="btn btn-soft" style="margin-top:12px">${esc(t('nav_home'))}</a></div>`);
    return;
  }
  if (!keepScroll) app.innerHTML = shell(`<div class="loader">${esc(t('loading'))}</div>`);
  try {
    const mod = await entry[1]();
    const fn = entry[2] ? mod[entry[2]] : mod.default;
    state.viewSource = sourceFrom(prevHref);
    const res = await fn({ params: match.slice(1), query, path });
    if (seq !== renderSeq) return;
    if (res.redirect) return go(res.redirect, { replace: true });
    document.title = res.title ? `${res.title} — HEMU.UZ` : 'HEMU.UZ — Техника для вашего бизнеса';
    const y = window.scrollY;
    app.innerHTML = shell(res.html);
    if (keepScroll) window.scrollTo(0, y);
    else window.scrollTo(0, 0);
    const main = $('main.page', app);
    cleanup = (await res.mount?.(main)) || null;
    // /about#safe kabi havolalar — sahifa chizilgach kerakli bo'limga o'tish
    if (!keepScroll && location.hash.length > 1) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  } catch (e) {
    if (seq !== renderSeq) return;
    if (e.status === 401) {
      app.innerHTML = shell(`<div class="box empty"><h3>${esc(t('login_required'))}</h3><button class="btn btn-primary" data-login style="margin-top:14px">${esc(t('login'))}</button></div>`);
      return;
    }
    console.error(e);
    app.innerHTML = shell(`<div class="box empty"><h3>${esc(e.status === 404 ? t('not_found_page') : t('error'))}</h3><p>${esc(e.message || '')}</p></div>`);
  }
}

// ---------- Ma'lumotnomalar ----------
async function loadRefs() {
  const [meta, cats, platform] = await Promise.all([api('/meta'), api('/categories'), api('/platform', { silent: true }).catch(() => ({}))]);
  state.meta = meta;
  state.platform = platform;
  state.cats = cats;
  if (!state.currency) state.currency = meta.currency;
}

export async function refreshBadges() {
  if (!state.user) { state.badges = {}; return; }
  try { state.badges = await api('/badges', { silent: true }); } catch { state.badges = {}; }
}

async function loadMe() {
  if (!state.token) { state.user = null; return; }
  try {
    state.user = await api('/me', { silent: true });
    if (!localStorage.getItem('mx_currency') && state.user.currency) state.currency = state.user.currency;
  } catch { state.user = null; setToken(null); }
}

// ---------- Real vaqt ----------
let es = null;
function connectStream() {
  es?.close();
  es = null;
  if (!state.token || !window.EventSource) return;
  es = new EventSource(`/api/v1/stream?token=${encodeURIComponent(state.token)}`);
  es.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    window.dispatchEvent(new CustomEvent('mx:message', { detail: msg }));
    if (msg.sender_id !== state.user?.id && !location.pathname.startsWith(`/messages/${msg.conversation_id}`)) {
      state.badges.messages = (state.badges.messages || 0) + 1;
      updateDots();
    }
  });
  es.addEventListener('notification', () => {
    state.badges.notifications = (state.badges.notifications || 0) + 1;
    updateDots();
  });
}
function updateDots() {
  // Sarlavhani qayta chizmasdan belgilarni yangilash
  const hdr = document.createElement('div');
  hdr.innerHTML = header(location.pathname);
  const cur = $('.header', app);
  if (cur) cur.replaceWith(hdr.querySelector('.header'));
  const bn = document.createElement('div');
  bn.innerHTML = bottomNav(location.pathname);
  $('.bottom-nav', app)?.replaceWith(bn.firstElementChild);
}

async function onAuthChanged() {
  await loadMe();
  await refreshBadges();
  connectStream();
  render({ keepScroll: true });
}
window.addEventListener('mx:auth', onAuthChanged);

// ---------- Global hodisalar ----------
document.addEventListener('click', async (e) => {
  const fav = e.target.closest('[data-fav]');
  if (fav) {
    e.preventDefault();
    if (!requireLogin(onAuthChanged)) return;
    const id = fav.dataset.fav;
    const on = fav.classList.contains('on');
    await api(`/favorites/${id}`, { method: on ? 'DELETE' : 'PUT' });
    document.querySelectorAll(`[data-fav="${id}"]`).forEach((b) => {
      b.classList.toggle('on', !on);
      if (b.dataset.label) b.querySelector('span').textContent = t(!on ? 'in_favorites' : 'to_favorites');
    });
    return;
  }
  const cmp = e.target.closest('[data-cmp]');
  if (cmp) {
    e.preventDefault();
    const on = toggleCompare(cmp.dataset.cmp);
    document.querySelectorAll(`[data-cmp="${cmp.dataset.cmp}"]`).forEach((b) => b.classList.toggle('on', on));
    toast(on ? t('in_compare') : t('remove'), on ? 'ok' : '');
    return;
  }
  const mic = e.target.closest('[data-voice]');
  if (mic) { e.preventDefault(); startVoice(mic.closest('form')); return; }
  if (e.target.closest('[data-login]')) { e.preventDefault(); loginModal(onAuthChanged); return; }
  if (e.target.closest('[data-location]')) { e.preventDefault(); locationModal(() => render()); return; }
  if (e.target.closest('[data-menu]')) { e.preventDefault(); mobileMenu(); return; }
  // Admin foydalanuvchi nomidan kirgan bo'lsa — o'z akkauntiga qaytish
  if (e.target.closest('[data-unimp]')) {
    e.preventDefault();
    const back = localStorage.getItem('mx_admin_back') || '/admin';
    const tk = localStorage.getItem('mx_admin_token');
    ['mx_admin_token', 'mx_admin_back', 'mx_imp_name'].forEach((k) => localStorage.removeItem(k));
    setToken(tk);
    location.href = back;
    return;
  }
  if (e.target.closest('[data-announce-x]')) { try { sessionStorage.setItem('mx_ann_x', state.platform?.announcement || ''); } catch { /* */ } e.target.closest('.announce')?.remove(); return; }
  if (e.target.closest('[data-theme-toggle]')) {
    toggleTheme();
    render({ keepScroll: true });
    return;
  }
  if (e.target.closest('[data-logout]')) {
    e.preventDefault();
    try { await api('/auth/logout', { method: 'POST', silent: true }); } catch { /* */ }
    setToken(null); state.user = null; state.badges = {}; es?.close();
    go('/');
    return;
  }
  const a = e.target.closest('a[href]');
  if (a && a.origin === location.origin && !a.target && !a.hasAttribute('download') && !e.ctrlKey && !e.metaKey && !e.shiftKey && !a.getAttribute('href').startsWith('/api') && !a.getAttribute('href').startsWith('/uploads')) {
    const href = a.getAttribute('href');
    if (href.startsWith('#')) return;
    e.preventDefault();
    if (a.pathname === location.pathname && a.hash && !a.search) { document.getElementById(a.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }); return; }
    go(a.pathname + a.search + a.hash);
  }
});

document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-search]');
  if (!f) return;
  e.preventDefault();
  closeSuggest();
  const q = f.q.value.trim();
  go(`/catalog${q ? `?q=${encodeURIComponent(q)}` : ''}`);
});

// ---------- Aqlli qidiruv: takliflar, o'xshash so'rovlar, "N ta e'lon topildi" ----------
let sugSeq = 0;
function closeSuggest() { document.querySelectorAll('.suggest').forEach((x) => x.remove()); }
const showSuggest = debounce(async (f) => {
  const q = f.q.value.trim();
  const seq = ++sugSeq;
  let r;
  try { r = await api(`/search/suggest${qs({ q })}`, { silent: true }); } catch { return; }
  if (seq !== sugSeq || document.activeElement !== f.q) return;
  closeSuggest();
  const cat = (s) => `/catalog${qs({ category: s })}`;
  const parts = [];
  if (r.categories.length) parts.push(`<h6>${esc(t('categories_title'))}</h6>${r.categories.map((c) => `<a href="${cat(c.slug)}">${icon('grid')} <span>${esc(c.parent ? `${c.parent} › ${c.name}` : c.name)}</span><small>${num(c.count)}</small></a>`).join('')}`);
  if (r.brands.length) parts.push(`<h6>${esc(t('brands_h'))}</h6>${r.brands.map((b) => `<a href="/catalog${qs({ q: b.name })}">${icon('star')} <span>${esc(b.name)}</span><small>${num(b.count)}</small></a>`).join('')}`);
  if (r.listings.length) parts.push(`<h6>${esc(t('feed_title'))}</h6>${r.listings.map((l) => `<a href="/listing/${l.id}">${l.cover ? `<img src="${esc(l.cover)}" alt="">` : icon('box')} <span>${esc(l.title)}</span><small>${esc(l.price || '')}</small></a>`).join('')}`);
  if (r.queries.length) parts.push(`<h6>${esc(t(q.length < 2 ? 'popular_queries' : 'similar_queries'))}</h6>${r.queries.map((x) => `<a href="/catalog${qs({ q: x })}">${icon('search')} <span>${esc(x)}</span></a>`).join('')}`);
  if (q.length >= 2) parts.push(`<a class="total" href="/catalog${qs({ q })}">${icon('search')} ${esc(r.total ? t('found_n', { n: num(r.total) }) : t('nothing_found'))}</a>`);
  if (!parts.length) return;
  f.style.position = 'relative';
  f.insertAdjacentHTML('beforeend', `<div class="suggest">${parts.join('')}</div>`);
}, 220);
document.addEventListener('input', (e) => { const f = e.target.closest('form[data-search]'); if (f && e.target.name === 'q') showSuggest(f); });
document.addEventListener('focusin', (e) => { const f = e.target.closest('form[data-search]'); if (f && e.target.name === 'q') showSuggest(f); });
document.addEventListener('click', (e) => { if (!e.target.closest('form[data-search]')) closeSuggest(); else if (e.target.closest('.suggest a')) closeSuggest(); });
document.addEventListener('keydown', (e) => {
  const box = document.querySelector('.suggest');
  if (!box) return;
  if (e.key === 'Escape') return closeSuggest();
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return;
  const links = [...box.querySelectorAll('a')];
  const i = links.findIndex((a) => a.classList.contains('act'));
  if (e.key === 'Enter') { if (i >= 0) { e.preventDefault(); closeSuggest(); go(links[i].getAttribute('href')); } return; }
  e.preventDefault();
  const n = e.key === 'ArrowDown' ? (i + 1) % links.length : (i - 1 + links.length) % links.length;
  links.forEach((a, k) => a.classList.toggle('act', k === n));
});

document.addEventListener('change', async (e) => {
  if (e.target.matches('[data-lang]')) {
    setLang(e.target.value);
    closeModal();
    if (state.user) api('/me', { method: 'PATCH', body: { lang: state.lang }, silent: true }).catch(() => {});
    await loadRefs();
    render({ keepScroll: true });
  }
  if (e.target.matches('[data-currency]')) {
    setCurrency(e.target.value);
    closeModal();
    render({ keepScroll: true });
  }
});

window.addEventListener('popstate', () => { prevHref = null; render(); });
window.addEventListener('mx:refresh', () => render({ keepScroll: true }));

// ---------- Ishga tushirish ----------
(async function boot() {
  applyDir();
  try {
    await Promise.all([loadRefs(), loadMe()]);
    await refreshBadges();
  } catch (e) {
    app.innerHTML = `<div class="container"><div class="box empty" style="margin-top:40px"><h3>${esc(t('error'))}</h3><p>${esc(e.message || '')}</p></div></div>`;
    return;
  }
  connectStream();
  applyTheme();
  render();
  setupPwa();
}());

// ---------- PWA: o'rnatish va oflayn ----------
function setupPwa() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('/sw.js').catch(() => {});
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    if (localStorage.getItem('mx_install_dismissed')) return;
    const bar = document.createElement('div');
    bar.className = 'install-bar';
    bar.innerHTML = `<span style="display:flex;gap:8px;align-items:center"><img src="/img/icon-192.png" width="28" height="28" alt="" style="border-radius:6px"><b>HEMU.UZ</b></span><button class="btn btn-primary btn-sm" data-install>${esc(t('install_app'))}</button><button class="icon-btn" style="color:#fff" data-x>${icon('x')}</button>`;
    document.body.appendChild(bar);
    bar.querySelector('[data-install]').onclick = async () => { bar.remove(); deferred.prompt(); };
    bar.querySelector('[data-x]').onclick = () => { bar.remove(); try { localStorage.setItem('mx_install_dismissed', '1'); } catch { /* */ } };
  });
  const offline = () => {
    let b = document.querySelector('.offline-bar');
    if (!navigator.onLine && !b) { b = document.createElement('div'); b.className = 'offline-bar'; b.textContent = t('offline'); document.body.appendChild(b); }
    if (navigator.onLine && b) b.remove();
  };
  window.addEventListener('online', offline);
  window.addEventListener('offline', offline);
  offline();
}

export { onAuthChanged, toast, icon };
