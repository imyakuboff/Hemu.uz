import { state, t, esc, icon, qs, api, num, fmtRel, initials, placeholder, catIcon, openModal, closeModal, toast, setToken, setLocation, themeButton, $ } from './core.js';
import { compareList, voiceButton } from './features.js';

// Dizayndagi sarlavha va bosh sahifadagi 6 ta yo'nalish ("Строительная техника"siz)
export const NAV_SLUGS = ['special', 'parts', 'trucks', 'materials'];
export const shortCat = (c) => (c.slug === 'trucks' ? t('trucks_short') : c.name);

export function locationLabel() {
  const m = state.meta;
  if (!state.country || !m) return t('loc_all');
  const c = m.countries.find((x) => x.code === state.country);
  if (!c) return t('loc_all');
  const r = state.region && state.regions?.[state.country]?.find((x) => x.code === state.region);
  return r ? `${r.name}` : c.name;
}

// HEMU.UZ logotipi (public/img/logo.svg bilan bir xil) — JCB/CAT uslubidagi qiya plashka
export const LOGO = '<svg class="mark" viewBox="0 0 150 40" aria-hidden="true"><polygon points="8,0 108,0 100,40 0,40" fill="#FFC61A"/><polygon points="112,0 150,0 142,40 104,40" fill="#0E3352"/><g transform="translate(12 9) skewX(-12)" fill="#111"><path d="M0 0h6v8h6V0h6v22h-6v-8H6v8H0z"/><path d="M22 0h17v5.5H28v2.75h9v5.5h-9v2.75h11V22H22z"/><path d="M43 0h6.5l4.5 8 4.5-8H65v22h-6v-11l-5 8-5-8v11h-6z"/><path d="M69 0h6v13a3 3 0 0 0 6 0V0h6v13a9 9 0 0 1-18 0z"/></g><g transform="translate(112 13.4) skewX(-12) scale(.6)" fill="#FFC61A"><rect x="0" y="16" width="6" height="6"/><path d="M10 0h6v13a3 3 0 0 0 6 0V0h6v13a9 9 0 0 1-18 0z"/><path d="M32 0h18v5L39.5 17H50v5H32v-5L42.5 5H32z"/></g></svg>';

export function header(path) {
  const u = state.user;
  const cats = (state.cats || []).filter((c) => NAV_SLUGS.includes(c.slug));
  const q = new URLSearchParams(location.search).get('q') || '';
  const m = state.meta;
  const langSel = m ? `<select data-lang aria-label="${esc(t('language'))}">${m.languages.map((l) => `<option value="${l.code}" ${l.code === state.lang ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select>` : '';
  const curSel = m ? `<select data-currency aria-label="${esc(t('currency'))}">${m.currencies.map((c) => `<option value="${c.code}" ${c.code === state.currency ? 'selected' : ''}>${c.code}</option>`).join('')}</select>` : '';
  const userBtn = u
    ? `<a href="/dashboard" class="avatar" title="${esc(u.name || '')}">${u.avatar ? `<img src="${esc(u.avatar)}" alt="">` : esc(initials(u.name || u.phone))}</a>`
    : `<button class="avatar" data-login title="${esc(t('login'))}">${icon('user')}</button>`;
  const dot = (n) => (n ? `<span class="dot">${n > 99 ? '99+' : n}</span>` : '');
    // Admin boshqa foydalanuvchi nomidan kirgan bo'lsa — ogohlantirish paneli
  let imp = '';
  try { imp = localStorage.getItem('mx_admin_token') ? localStorage.getItem('mx_imp_name') || '' : ''; } catch { /* */ }
  const impBar = imp ? `<div class="imp-bar">${icon('eye')} ${esc(t('imp_as', { name: imp }))} <button data-unimp>${esc(t('imp_back'))}</button></div>` : '';
  const pf = state.platform || {};
  let annHidden = false;
  try { annHidden = sessionStorage.getItem('mx_ann_x') === pf.announcement; } catch { /* */ }
  const ann = pf.announcement && !annHidden ? `<div class="announce ${esc(pf.announcement_type || 'info')}"><div class="container">${icon('bell')}<span>${esc(pf.announcement)}</span><button data-announce-x aria-label="x">${icon('x')}</button></div></div>` : '';
  return `${impBar}
  <div class="topbar"><div class="container">
    <button data-location>${icon('pin')} ${esc(locationLabel())} ${icon('chevron-down')}</button>
    <div class="links"><a href="/dashboard">${esc(t('for_business'))}</a><a href="/about#help">${esc(t('help'))}</a><a href="/about">${esc(t('about'))}</a>${themeButton()}${langSel}${curSel}</div>
  </div></div>
  <header class="header"><div class="container">
    <div class="row1">
      <a href="/" class="logo" aria-label="HEMU.UZ">${LOGO}</a>
      <a href="/categories" class="btn-catalog desktop-only">${icon('menu')} ${esc(t('catalog'))}</a>
      <form class="search desktop-only" data-search>${icon('search')}<input name="q" value="${esc(q)}" placeholder="${esc(t('search_ph'))}" autocomplete="off">${voiceButton()}<button class="btn btn-primary">${esc(t('find_listings'))}</button></form>
      <div class="icons desktop-only">
        <a href="/favorites" class="icon-btn" title="${esc(t('nav_fav'))}">${icon('heart')}</a>
        <a href="/messages" class="icon-btn" title="${esc(t('nav_msgs'))}">${icon('chat')}${dot(state.badges.messages)}</a>
        ${userBtn}
      </div>
      <div class="icons m-icons">
        ${themeButton('icon-btn', false)}
        <a href="/notifications" class="icon-btn">${icon('bell')}${dot(state.badges.notifications)}</a>
        <button class="icon-btn" data-menu>${icon('menu')}</button>
      </div>
    </div>
    <div class="mobile-only"><button class="m-loc" data-location>${icon('pin')} ${esc(locationLabel())} ${icon('chevron-down')}</button>
      <div class="m-search"><form class="search" data-search>${icon('search')}<input name="q" value="${esc(q)}" placeholder="${esc(t('search_ph'))}">${voiceButton()}<button class="btn btn-primary">${esc(t('find'))}</button></form></div>
    </div>
    <div class="row2">
      <nav>${cats.map((c) => (c.slug === 'materials'
        ? `<a href="/${c.slug}" class="${path.startsWith(`/${c.slug}`) ? 'on' : ''}">${esc(shortCat(c))}</a>`
        : `<a href="/catalog?category=${c.slug}" class="${new URLSearchParams(location.search).get('category') === c.slug ? 'on' : ''}">${esc(shortCat(c))}</a>`)).join('')}<a href="/fura" class="${path.startsWith('/fura') ? 'on' : ''}">${esc(t('nav_logistics'))}</a></nav>
      <a href="/create" class="post-cta">${icon('plus')} ${esc(t('post_listing'))}</a>
    </div>
  </div></header>${ann}`;
}

// Qo'llab-quvvatlash telefoni (admin sozlamalaridan)
export const supportPhone = () => state.platform?.support_phone || '+998918041224';
const supportTg = () => String(state.platform?.support_telegram || '').replace(/^@/, '').replace(/[^\w]/g, '');
const supportLine = () => `<div class="foot-contacts"><a class="foot-phone" href="tel:${esc(supportPhone().replace(/[^\d+]/g, ''))}">${icon('phone')} ${esc(t('footer_phone'))}: <b>${esc(supportPhone())}</b></a>${supportTg() ? `<a class="foot-phone foot-tg" href="https://t.me/${esc(supportTg())}" target="_blank" rel="noopener">${icon('telegram')} <b>@${esc(supportTg())}</b></a>` : ''}</div>`;

export function footer() {
  return `<footer class="footer"><div class="container">
    <div><a href="/" class="logo logo-foot">${LOGO}</a><p>${esc(t('footer_tag'))} © 2026 HEMU.UZ</p>${supportLine()}</div>
    <nav><a href="/about">${esc(t('about'))}</a><a href="/contact">${esc(t('contact_title'))}</a><a href="/fura">${esc(t('sec_fura'))}</a><a href="/prices">${esc(t('prices_title'))}</a><a href="/sellers">${esc(t('sellers_title'))}</a><a href="/about#safe">${esc(t('safe_deals'))}</a><a href="/terms">${esc(t('terms_title'))}</a><a href="/privacy">${esc(t('privacy'))}</a></nav>
  </div></footer>`;
}

export function bottomNav(path) {
  const on = (p) => (p === '/' ? path === '/' : path.startsWith(p) ? 'on' : '');
  const prof = ['/dashboard', '/profile', '/my/', '/create', '/notifications'].some((p) => path.startsWith(p)) ? 'on' : '';
  const dot = (n) => (n ? `<span class="dot">${n}</span>` : '');
  return `<nav class="bottom-nav">
    <a href="/" class="${path === '/' ? 'on' : ''}">${icon('home')}${esc(t('nav_home'))}</a>
    <a href="/categories" class="${on('/categories') || on('/catalog') || on('/feed') || on('/filters')}">${icon('grid')}${esc(t('catalog'))}</a>
    <a href="/create" class="plus">${icon('plus')}${esc(t('post_short'))}</a>
    <a href="/favorites" class="${on('/favorites')}">${icon('heart')}${esc(t('nav_fav'))}</a>
    <a href="/messages" class="${on('/messages')}">${icon('chat')}${esc(t('nav_msgs'))}${dot(state.badges.messages)}</a>
    <a href="${state.user ? '/dashboard' : '/profile'}" class="${prof}">${icon('user')}${esc(t('nav_profile'))}</a>
  </nav>`;
}

export function crumbs(items) {
  return `<div class="crumbs">${items.map(([label, href], i) => (href && i < items.length - 1 ? `<a href="${href}">${esc(label)}</a>` : `<span>${esc(label)}</span>`)).join('<span>/</span>')}</div>`;
}

export function secHead(title, sub, linkText, href) {
  return `<div class="sec-head"><div><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div>${linkText ? `<a href="${href}" class="pill-link">${icon('arrow', 'arrow-flip')} ${esc(linkText)}</a>` : ''}</div>`;
}

// Kartochkadagi kulrang qator: "2021 г. · 3 240 м/ч · 92 л.с."
export function factsLine(l) {
  const f = l.facts || {};
  const p = [];
  if (l.kind === 'material') {
    for (const x of [f.grade, f.size_text, f.pack]) if (x) p.push(x);
    if (!p.length && f.min_order) p.push(f.min_order);
  } else if (l.kind === 'part') {
    if (f.condition_label) p.push(f.condition_label);
    if (f.stock_qty) p.push(t('in_stock_short', { n: num(f.stock_qty) }));
    if (f.min_order) p.push(f.min_order);
  } else if (l.deal_type === 'rent' || l.kind === 'service') {
    if (f.with_operator) p.push(capital(t('with_operator')));
    if (f.min_order) p.push(f.min_order);
    if (f.year) p.push(t('yr', { y: f.year }));
  } else {
    if (f.year) p.push(t('yr', { y: f.year }));
    if (f.hours) p.push(`${num(f.hours)} ${t('u_mh')}`);
    if (f.mileage_km) p.push(`${num(f.mileage_km)} ${t('u_km')}`);
    if (f.power_hp) p.push(`${num(f.power_hp)} ${t('u_hp')}`);
    else if (f.capacity_t) p.push(`${num(f.capacity_t)} ${t('u_t')}`);
    else if (f.weight_kg && !f.mileage_km) p.push(`${num(Math.round(f.weight_kg / 1000))} ${t('u_t')}`);
  }
  return p.join(' · ');
}
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const locLine = (loc) => [loc?.city, loc?.city ? null : loc?.region_name].filter(Boolean).join(', ') || loc?.country_name || '';
export const priceText = (p) => (p?.formatted || t('negotiable'));
export const imgOf = (l) => l.cover || placeholder(l.category?.slug);
export const ratingHtml = (s) => (s && s.reviews_count ? `<div class="rating">${icon('star')} ${String(s.rating).replace('.', ',')} · ${esc(t('reviews', { n: s.reviews_count }))}</div>` : '');

// Dizayndagidek: Продажа / Аренда, ehtiyot qism, material va xizmatlarda — yo'nalish nomi
export function badgeOf(l) {
  if (l.deal_type === 'rent') return l.deal_label;
  if (l.kind === 'part') return t('want_part');
  if (l.kind === 'material') return t('materials');
  if (l.kind === 'service') return t('services');
  return l.deal_label;
}

// Mavsumiy aksiya belgisi: "🏗️ −20%"
export const promoBadge = (p) => `<a class="promo-badge t-${esc(p.theme)}" href="/aksiya/${esc(p.slug)}">${esc(p.emoji || '')} −${p.pct}%</a>`;

// VIP / GOLD / PREMIUM belgisi
export const tierBadge = (tier) => `<span class="tier-badge ${tier}">${tier === 'vip' ? icon('star') : ''}${tier.toUpperCase()}</span>`;

export function card(l) {
  const inCmp = compareList().includes(l.id);
  return `<article class="card ${l.highlighted ? 'hl' : ''} ${l.tier ? `tier-${l.tier}` : ''}">
    <div class="img">
      <a href="/listing/${l.id}" style="display:block;height:100%"><img src="${esc(imgOf(l))}" alt="${esc(l.title)}" loading="lazy"></a>
      ${l.tier ? tierBadge(l.tier) : l.promoted ? `<span class="top-badge">${esc(t('promoted_badge'))}</span>` : ''}
      <button class="fav ${l.is_favorite ? 'on' : ''}" data-fav="${l.id}" aria-label="${esc(t('to_favorites'))}">${icon('heart')}</button>
      ${l.kind !== 'service' && l.kind !== 'material' ? `<button class="cmp-btn ${inCmp ? 'on' : ''}" data-cmp="${l.id}" title="${esc(t('compare'))}">${icon('scale')}</button>` : ''}
      <span class="deal">${esc(badgeOf(l))}</span>
      ${l.promo ? promoBadge(l.promo) : ''}
    </div>
    <div class="body">
      <a href="/listing/${l.id}" class="title">${esc(l.title)}</a>
      <div class="price">${esc(priceText(l.price))}${l.price?.old_formatted ? ` <s class="old-price">${esc(l.price.old_formatted)}</s>` : ''}</div>
      <div class="meta">${esc(factsLine(l))}</div>
      <div class="city">${esc(locLine(l.location))}</div>
      ${l.distance_km !== undefined ? `<div class="dist">${icon('pin')} ${esc(t('distance_km', { n: num(l.distance_km) }))}</div>` : ''}
      <div class="seller">${esc(l.seller?.name || '')}</div>
      ${ratingHtml(l.seller)}
      <div class="foot"><span class="date">${esc(fmtRel(l.bumped_at || l.published_at))}<span class="views" title="${esc(t('views_title'))}">${icon('eye')} ${num(l.views || 0)}</span></span><a href="/listing/${l.id}" class="btn btn-soft btn-sm">${esc(t('details'))}</a></div>
    </div>
  </article>`;
}

export const cards = (items, cols = 4) => (items?.length ? `<div class="grid grid-${cols}">${items.map(card).join('')}</div>` : emptyBox());

export function emptyBox(title = t('nothing_found'), sub = '') {
  return `<div class="box empty"><h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ''}</div>`;
}

export function pager(page, pages, hrefFor) {
  if (!pages || pages <= 1) return '';
  const out = [];
  const from = Math.max(1, Math.min(page - 1, pages - 2));
  for (let i = from; i <= Math.min(pages, from + 2); i += 1) out.push(i === page ? `<span class="on">${i}</span>` : `<a href="${hrefFor(i)}">${i}</a>`);
  if (page < pages) out.push(`<a href="${hrefFor(page + 1)}">${esc(t('next'))} ${icon('arrow', 'arrow-flip')}</a>`);
  return `<div class="pager">${out.join('')}</div>`;
}

// ---------- Kabinet ----------
export function accountLayout(active, content) {
  const u = state.user;
  const c = u?.company;
  const items = [
    ['/dashboard', 'dash', t('dashboard')],
    ['/my/listings', 'list', t('my_listings')],
    ['/my/promos', 'target', t('my_promos')],
    ['/my/orders', 'box', t('my_orders')],
    ['/favorites', 'heart', t('nav_fav')],
    ['/messages', 'chat', t('nav_msgs'), state.badges.messages],
    ['/profile', 'user', t('nav_profile')],
  ];
  if (c) items.splice(1, 0, ['/business', 'building', t('business')]);
  if (u?.specialist) items.splice(items.length - 1, 0, [`/specialist/${u.specialist.id}`, 'gear', t('specialist_profile')]);
  if (u?.role === 'admin' || u?.role === 'moderator') items.push(['/admin', 'shield', t('admin')]);
  return `<div class="acc">
    <aside class="acc-side">
      <div class="who"><b>${esc(u?.name || u?.phone || '')}</b><span>${esc(c?.name || u?.phone || '')}</span>${c?.verified ? `<span class="tag green">${esc(t('company_verified'))}</span>` : ''}</div>
      <nav>${items.map(([href, ic, label, n]) => `<a href="${href}" class="${active === href ? 'on' : ''}">${icon(ic)} ${esc(label)}${n ? `<span class="n">${n}</span>` : ''}</a>`).join('')}</nav>
      <a href="/create" class="btn btn-accent btn-sm">${icon('plus')} ${esc(t('post_listing'))}</a>
    </aside>
    <div>${content}</div>
  </div>`;
}

// ---------- Kirish: parol yoki SMS-kod ----------
// Telefon raqami maydoni (mamlakat kodi bilan) — kirish, ro'yxatdan o'tish va tiklashda bir xil
export function phoneField(name = 'phone') {
  const m = state.meta;
  const def = m.countries.find((c) => c.code === (state.country || m.country)) || m.countries[0];
  return `<div class="phone-row">
    <select class="input" name="country">${m.countries.map((c) => `<option value="${c.code}" ${c.code === def.code ? 'selected' : ''}>${c.code} ${c.dial_code}</option>`).join('')}</select>
    <input class="input" name="${name}" type="tel" inputmode="tel" autocomplete="tel" placeholder="90 123 45 67" required>
  </div>`;
}
export function readPhone(form) {
  const country = form.country.value;
  const raw = form.phone.value.trim();
  const dial = state.meta.countries.find((c) => c.code === country).dial_code;
  return { country, phone: raw.startsWith('+') ? raw : dial + raw.replace(/^0+/, '') };
}

export function loginModal(onDone) {
  const html = `<h3>${esc(t('login_title'))}</h3>
    <div class="seg" data-mode style="margin:12px 0 14px"><button type="button" data-v="password" class="on">${esc(t('login_tab_password'))}</button><button type="button" data-v="sms">${esc(t('login_tab_sms'))}</button></div>
    <form data-pw>
      ${phoneField()}
      <label class="lbl" style="margin-top:12px">${esc(t('password'))}</label>
      <input class="input" name="password" type="password" autocomplete="current-password" required>
      <div data-2fa hidden style="margin-top:12px"><p class="small" data-2fa-sub></p><label class="lbl">${esc(t('two_factor_title'))}</label><input class="input" name="code2" inputmode="numeric" autocomplete="one-time-code" maxlength="6"><p class="tiny muted" data-2fa-dev></p></div>
      <button class="btn btn-primary btn-block" style="margin-top:14px">${esc(t('login'))}</button>
      <a class="small link-blue" href="/forgot" data-close-link style="display:inline-block;margin-top:10px">${esc(t('forgot_password'))}</a>
    </form>
    <form data-step1 hidden>
      ${phoneField()}
      <button class="btn btn-primary btn-block" style="margin-top:14px">${esc(t('get_code'))}</button>
    </form>
    <form data-step2 hidden>
      <p class="small" data-sent></p>
      <label class="lbl">${esc(t('code'))}</label><input class="input" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required>
      <p class="tiny muted" data-dev></p>
      <button class="btn btn-primary btn-block" style="margin-top:12px">${esc(t('login'))}</button>
      <button type="button" class="btn btn-ghost btn-block" data-back>${esc(t('change_number'))}</button>
    </form>
    <p class="small muted" style="margin:16px 0 0;text-align:center">${esc(t('no_account_q'))} <a class="link-blue" href="/register" data-close-link>${esc(t('register'))}</a></p>`;
  openModal(html, {
    onMount(el) {
      const fpw = el.querySelector('[data-pw]');
      const f1 = el.querySelector('[data-step1]');
      const f2 = el.querySelector('[data-step2]');
      el.querySelectorAll('[data-close-link]').forEach((a) => a.addEventListener('click', closeModal));
      el.querySelector('[data-mode]').addEventListener('click', (e) => {
        const b = e.target.closest('[data-v]');
        if (!b) return;
        el.querySelectorAll('[data-mode] [data-v]').forEach((x) => x.classList.toggle('on', x === b));
        fpw.hidden = b.dataset.v !== 'password';
        f1.hidden = b.dataset.v !== 'sms';
        f2.hidden = true;
      });
      const done = (r) => { setToken(r.token); state.user = r.user; closeModal(); onDone?.(); };
      fpw.onsubmit = async (e) => {
        e.preventDefault();
        const { phone, country } = readPhone(fpw);
        const box = fpw.querySelector('[data-2fa]');
        const code = box.hidden ? undefined : fpw.code2.value.trim();
        const r = await api('/auth/login', { method: 'POST', body: { phone, country, password: fpw.password.value, code } });
        if (r.two_factor) {
          box.hidden = false;
          fpw.querySelector('[data-2fa-sub]').textContent = t('two_factor_sub', { phone: r.phone });
          if (r.dev_code) { fpw.querySelector('[data-2fa-dev]').textContent = t('dev_code', { c: r.dev_code }); fpw.code2.value = r.dev_code; }
          fpw.code2.focus();
          return;
        }
        done(r);
      };
      let phone; let country;
      f1.onsubmit = async (e) => {
        e.preventDefault();
        ({ phone, country } = readPhone(f1));
        const r = await api('/auth/otp/request', { method: 'POST', body: { phone, country } });
        // Yangi raqam — to'liq ro'yxatdan o'tish sahifasiga
        if (!r.exists) { closeModal(); window.mxGo(`/register?phone=${encodeURIComponent(r.phone)}`); return; }
        phone = r.phone;
        f1.hidden = true; f2.hidden = false;
        f2.querySelector('[data-sent]').textContent = t('code_sent', { p: r.phone });
        if (r.dev_code) { f2.querySelector('[data-dev]').textContent = t('dev_code', { c: r.dev_code }); f2.code.value = r.dev_code; }
        f2.code.focus();
      };
      f2.querySelector('[data-back]').onclick = () => { f2.hidden = true; f1.hidden = false; };
      f2.onsubmit = async (e) => {
        e.preventDefault();
        done(await api('/auth/otp/verify', { method: 'POST', body: { phone, country, code: f2.code.value.trim() } }));
      };
    },
  });
}

export function requireLogin(then) {
  if (state.user) return true;
  toast(t('login_required'));
  loginModal(then);
  return false;
}

// ---------- Joylashuv ----------
export async function locationModal(onDone) {
  const m = state.meta;
  const html = `<h3>${esc(t('choose_location'))}</h3>
    <label class="lbl" style="margin-top:14px">${esc(t('country'))}</label>
    <select class="input" name="country"><option value="">${esc(t('loc_all'))}</option>${m.countries.map((c) => `<option value="${c.code}" ${c.code === state.country ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
    <label class="lbl" style="margin-top:12px">${esc(t('region'))}</label>
    <select class="input" name="region"></select>
    <button class="btn btn-primary btn-block" style="margin-top:18px" data-apply>${esc(t('apply'))}</button>`;
  const el = openModal(html);
  const cSel = el.querySelector('[name=country]');
  const rSel = el.querySelector('[name=region]');
  const fill = async () => {
    rSel.innerHTML = `<option value="">${esc(t('all_regions'))}</option>`;
    rSel.disabled = !cSel.value;
    if (!cSel.value) return;
    const regs = await regionsOf(cSel.value);
    rSel.innerHTML += regs.map((r) => `<option value="${r.code}" ${r.code === state.region ? 'selected' : ''}>${esc(r.name)}</option>`).join('');
  };
  cSel.onchange = fill;
  await fill();
  el.querySelector('[data-apply]').onclick = () => {
    const changedCountry = cSel.value !== state.country;
    setLocation(cSel.value, rSel.value);
    if (changedCountry && cSel.value) {
      const cur = m.countries.find((c) => c.code === cSel.value)?.currency;
      if (cur) { state.currency = cur; try { localStorage.setItem('mx_currency', cur); } catch { /* */ } }
    }
    closeModal();
    onDone?.();
  };
}

export async function regionsOf(cc) {
  state.regions = state.regions || {};
  if (!state.regions[cc]) state.regions[cc] = await api(`/geo/countries/${cc}/regions`);
  return state.regions[cc];
}

// Mobil menyu
export function mobileMenu() {
  const m = state.meta;
  const u = state.user;
  const links = [
    ['/categories', 'grid', t('categories_title')], ['/feed', 'list', t('feed_title')], ['/create', 'plus', t('post_listing')],
    ['/request/new', 'clipboard', t('create_request')], ['/requests', 'inbox', t('buyer_requests')],
    ['/compare', 'scale', `${t('compare_title')}${compareList().length ? ` (${compareList().length})` : ''}`], ['/plans', 'rocket', t('plans_link')],
  ];
  if (u) links.push(['/dashboard', 'dash', t('dashboard')], ['/my/listings', 'list', t('my_listings')], ['/my/orders', 'box', t('my_orders')], ['/profile', 'user', t('nav_profile')]);
  if (u?.company) links.push(['/business', 'building', t('business')]);
  if (u?.role === 'admin' || u?.role === 'moderator') links.push(['/admin', 'shield', t('admin')]);
  links.push(['/prices', 'chart', t('prices_title')], ['/sellers', 'star', t('sellers_title')], ['/contact', 'phone', t('contact_title')]);
  const secs = [['transportsale', 'excavator'], ['transportrental', 'calendar'], ['sparepart', 'gear'], ['fura', 'truck'], ['mechanic', 'gear'], ['driver', 'user'], ['application', 'clipboard']];
  const el = openModal(`<div class="sheet-menu" style="margin-top:14px">${links.map(([h, i, l]) => `<a href="${h}" data-close-link>${icon(i)} ${esc(l)}</a>`).join('')}
    <p class="tiny muted" style="margin:12px 0 4px;font-weight:600;text-transform:uppercase">${esc(t('sec_title'))}</p>
    ${secs.map(([s, i, k]) => `<a href="/${s}" data-close-link>${icon(i)} ${esc(t(`sec_${k || s}`))}</a>`).join('')}
    ${u ? '' : `<button data-login-m>${icon('user')} ${esc(t('login'))}</button>`}
    <div class="row2i" style="margin-top:14px"><select class="input" data-lang>${m.languages.map((l) => `<option value="${l.code}" ${l.code === state.lang ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select>
    <select class="input" data-currency>${m.currencies.map((c) => `<option value="${c.code}" ${c.code === state.currency ? 'selected' : ''}>${c.code}</option>`).join('')}</select></div></div>`);
  el.querySelectorAll('[data-close-link]').forEach((a) => a.addEventListener('click', closeModal));
  el.querySelector('[data-login-m]')?.addEventListener('click', () => { closeModal(); loginModal(() => window.dispatchEvent(new Event('mx:auth'))); });
}

export { catIcon };
