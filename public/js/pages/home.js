import { state, t, esc, api, icon, num, qs } from '../core.js';
import { cards, card, tierBadge, secHead, NAV_SLUGS, shortCat, catIcon, priceText } from '../ui.js';
import { voiceButton } from '../features.js';
import { sectionsGrid } from './sections.js';

export default async function home() {
  const [d, secs, ads] = await Promise.all([api(`/home${qs({ country: state.country })}`), api('/sections').catch(() => ({})), api('/banners', { silent: true }).catch(() => [])]);
  const tiles = d.categories.filter((c) => NAV_SLUGS.includes(c.slug));
  const often = (d.hero.popular_queries.length ? d.hero.popular_queries : ['JCB 3CX', 'КАМАЗ']).slice(0, 2);
  const html = `
  <section class="hero">
    <div class="left">
      <div class="kicker">${esc(t('hero_kicker'))}</div>
      <h1>${esc(t('hero_title'))}</h1>
      <p>${esc(t('hero_sub'))}</p>
      <form class="search" data-search>${icon('search')}<input name="q" placeholder="${esc(t('search_ph'))}">${voiceButton()}<button class="btn btn-primary"><span class="desktop-only">${esc(t('find_listings'))}</span><span class="mobile-only">${esc(t('find'))}</span></button></form>
      <div class="often"><span>${esc(t('often_searched'))}</span>
        ${often.map((q) => `<a href="/catalog?q=${encodeURIComponent(q)}">${esc(q)}</a><span class="sep">·</span>`).join('')}
        <a href="/catalog?category=equipment-rental">${esc(t('crane_rent'))}</a>
      </div>
    </div>
    <div class="right" style="background-image:url('/img/demo/hero.jpg')"><span class="badge-white">${esc(t('hero_badge', { n: num(d.hero.total_active), d: d.hero.directions }))}</span></div>
  </section>

  ${carousel(ads, d.tiers)}

  <section class="sec">
    ${secHead(t('sec_title'), '', t('all_categories'), '/categories')}
    ${sectionsGrid(secs)}
  </section>

  <section class="sec">
    ${secHead(t('popular'), t('popular_sub'), t('see_all'), '/catalog?sort=popular')}
    ${cards(d.popular)}
  </section>

  <div class="cta-blue">
    <div><h3>${esc(t('cta_title'))}</h3><p>${esc(t('cta_sub'))}</p></div>
    <a href="/create" class="btn btn-white">${icon('plus')} ${esc(t('post_listing'))}</a>
  </div>

  <section class="sec">
    ${secHead(t('recommended'), t('recommended_sub'), t('more_offers'), '/feed')}
    ${cards(d.recommended)}
  </section>

  <section class="sec">
    ${secHead(t('recent'), t('recent_sub'), t('all_new'), '/feed')}
    ${cards(d.recent)}
  </section>

  <div class="cta-white">
    <div><h3>${esc(t('not_found_title'))}</h3><p>${esc(t('not_found_sub'))}</p></div>
    <a href="/request/new" class="pill-link">${icon('arrow', 'arrow-flip')} ${esc(t('create_request'))}</a>
  </div>`;
  return {
    title: '',
    html,
    mount(main) {
      const stops = [mountCarousel(main)];
      return () => stops.forEach((f) => f?.());
    },
  };
}

// ---------- Reklama karuseli: har 5 soniyada yon tomonga o'tadi ----------
// Admin matn kiritmagan bo'lsa, birinchi 3 ta slot uchun tarjima qilingan standart matn ishlatiladi
const BAN_KEYS = [['ban1_t', 'ban1_s', 'ban1_c'], ['ban2_t', 'ban2_s', 'ban2_c'], ['ban3_t', 'ban3_s', 'post_listing']];

// Pullik e'lon slaydi: rasm, daraja belgisi, nom, narx, joy — bosilsa e'lon sahifasi
const TIER_THEME = { vip: 'vip', gold: 'yellow', premium: 'blue' };
function tierSlide(l, tier, i) {
  const place = [l.location?.city || l.location?.region_name, l.seller?.name].filter(Boolean).join(' · ');
  return `<a class="ad-slide ${TIER_THEME[tier]} ad-listing" href="/listing/${l.id}" draggable="false" ${i ? 'aria-hidden="true" tabindex="-1"' : ''}>
      <div class="ad-txt"><span class="ad-label tier">${tierBadge(tier)}</span><h3>${esc(l.title)}</h3><p class="ad-price">${esc(priceText(l.price))}</p>${place ? `<p>${icon('pin')} ${esc(place)}</p>` : ''}<span class="ad-cta">${esc(t('details'))} ${icon('arrow')}</span></div>
      ${l.cover ? `<div class="ad-img" style="background-image:url('${esc(l.cover)}')"></div>` : ''}
    </a>`;
}

function carousel(banners, tiers = {}) {
  const paid = ['vip', 'gold', 'premium'].flatMap((tr) => (tiers[tr] || []).map((l) => [tr, l]));
  const list = [...paid.map(([tr, l]) => ({ tier: tr, l })), ...(banners || [])];
  if (!list.length) return '';
  const slides = list.map((b, i) => {
    if (b.tier) return tierSlide(b.l, b.tier, i);
    const k = BAN_KEYS[b.slot - 1] || [];
    const title = b.title || (k[0] ? t(k[0]) : '');
    const text = b.text || (k[1] ? t(k[1]) : '');
    const cta = b.cta || (k[2] ? t(k[2]) : '');
    return `<a class="ad-slide ${esc(b.theme)}" href="${esc(b.link)}" data-uid="${esc(b.uid || '')}" draggable="false" ${i ? 'aria-hidden="true" tabindex="-1"' : ''}>
      <div class="ad-txt"><span class="ad-label">${esc(t('ad_label'))}</span><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${cta ? `<span class="ad-cta">${esc(cta)} ${icon('arrow')}</span>` : ''}</div>
      ${b.image ? `<div class="ad-img" style="background-image:url('${esc(b.image)}')"></div>` : ''}
    </a>`;
  }).join('');
  const many = list.length > 1;
  return `<section class="ad-car" data-car aria-roledescription="carousel">
    <div class="ad-viewport"><div class="ad-track">${slides}</div></div>
    ${many ? `<button class="ad-nav prev" data-car-prev aria-label="‹">${icon('arrow-left')}</button><button class="ad-nav next" data-car-next aria-label="›">${icon('arrow')}</button>
    <div class="ad-dots">${list.map((_, i) => `<button data-car-dot="${i}" class="${i ? '' : 'on'}" aria-label="${i + 1}"></button>`).join('')}</div>` : ''}
  </section>`;
}

function mountCarousel(main) {
  const car = main.querySelector('[data-car]');
  if (car) trackBanners(car);
  const track = car?.querySelector('.ad-track');
  const n = track?.children.length || 0;
  if (n < 2) return null;
  const rtl = document.documentElement.dir === 'rtl';
  let i = 0;
  let timer = null;
  const show = (k) => {
    i = (k + n) % n;
    track.style.transform = `translateX(${(rtl ? 1 : -1) * i * 100}%)`;
    car.querySelectorAll('[data-car-dot]').forEach((d, j) => d.classList.toggle('on', j === i));
    [...track.children].forEach((s, j) => { s.toggleAttribute('aria-hidden', j !== i); s.tabIndex = j === i ? 0 : -1; });
  };
  const play = () => {
    clearInterval(timer);
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) timer = setInterval(() => show(i + 1), 5000);
  };
  car.addEventListener('click', (e) => {
    const dot = e.target.closest('[data-car-dot]');
    if (e.target.closest('[data-car-prev]')) show(i - 1);
    else if (e.target.closest('[data-car-next]')) show(i + 1);
    else if (dot) show(Number(dot.dataset.carDot));
    else return;
    play();
  });
  car.addEventListener('mouseenter', () => clearInterval(timer));
  car.addEventListener('mouseleave', play);
  // Telefonda barmoq bilan surish
  let x0 = null;
  let swiped = false;
  track.addEventListener('pointerdown', (e) => { x0 = e.clientX; swiped = false; });
  track.addEventListener('pointerup', (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0;
    x0 = null;
    if (Math.abs(dx) < 40) return;
    swiped = true;
    show(i + ((dx < 0) !== rtl ? 1 : -1));
    play();
  });
  track.addEventListener('click', (e) => { if (swiped) { e.preventDefault(); e.stopPropagation(); swiped = false; } }, true);
  play();
  return () => clearInterval(timer);
}


// Banner statistikasi: ko'rilgan slaydlar (bir sahifada bir marta) va bosishlar
function trackBanners(car) {
  const seen = new Set();
  const send = (body) => {
    const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
    if (!navigator.sendBeacon?.('/api/v1/banners/track', blob)) fetch('/api/v1/banners/track', { method: 'POST', body: blob, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
  };
  const mark = () => {
    const s = car.querySelector('.ad-slide:not([aria-hidden])');
    if (s?.dataset.uid && !seen.has(s.dataset.uid)) { seen.add(s.dataset.uid); send({ views: [s.dataset.uid] }); }
  };
  // Slayd 1 soniyadan ko'proq ko'rinsa — ko'rish hisoblanadi
  const obs = new MutationObserver(() => setTimeout(mark, 1000));
  car.querySelectorAll('.ad-slide').forEach((s) => obs.observe(s, { attributes: true, attributeFilter: ['aria-hidden'] }));
  setTimeout(mark, 1000);
  car.addEventListener('click', (e) => {
    const s = e.target.closest('.ad-slide');
    if (s?.dataset.uid) send({ click: s.dataset.uid });
  });
}

// ---------- VIP / GOLD / PREMIUM karusellari ----------
function tierRow(tier, items = []) {
  const head = `<div class="tier-head"><h2>${tierBadge(tier)} ${esc(t(`tier_${tier}_title`))}</h2></div>`;
  // Bo'sh karusel ko'rsatilmaydi — darajani e'lon joylashda tanlashadi
  if (!items.length) return '';
  return `<section class="tier-sec ${tier}" data-tier-row>${head}
    <div class="tier-wrap"><button class="tier-nav prev" data-tn="-1" aria-label="‹">${icon('arrow-left')}</button><div class="tier-track">${items.map(card).join('')}</div><button class="tier-nav next" data-tn="1" aria-label="›">${icon('arrow')}</button></div>
  </section>`;
}

// Har bir karusel o'zi yon tomonga suriladi (VIP — 3.5 s, GOLD — 4 s, PREMIUM — 4.5 s)
function mountTierRows(main) {
  const timers = [];
  const rtl = document.documentElement.dir === 'rtl';
  main.querySelectorAll('[data-tier-row]').forEach((row, k) => {
    const track = row.querySelector('.tier-track');
    const step = () => (track.firstElementChild?.getBoundingClientRect().width || 260) + 16;
    const move = (dir) => {
      const max = track.scrollWidth - track.clientWidth;
      const pos = Math.abs(track.scrollLeft);
      if (dir > 0 && pos >= max - 4) track.scrollTo({ left: 0, behavior: 'smooth' });
      else if (dir < 0 && pos <= 4) track.scrollTo({ left: rtl ? -max : max, behavior: 'smooth' });
      else track.scrollBy({ left: (rtl ? -1 : 1) * dir * step(), behavior: 'smooth' });
    };
    let paused = false;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fits = () => row.classList.toggle('static', track.scrollWidth <= track.clientWidth + 4);
    fits();
    window.addEventListener('resize', fits);
    if (!reduce && track.scrollWidth > track.clientWidth + 4) timers.push(setInterval(() => { if (!paused && !document.hidden) move(1); }, 3500 + k * 500));
    row.addEventListener('mouseenter', () => { paused = true; });
    row.addEventListener('mouseleave', () => { paused = false; });
    track.addEventListener('touchstart', () => { paused = true; }, { passive: true });
    track.addEventListener('touchend', () => setTimeout(() => { paused = false; }, 4000), { passive: true });
    row.addEventListener('click', (e) => { const b = e.target.closest('[data-tn]'); if (b) move(Number(b.dataset.tn)); });
  });
  return () => timers.forEach(clearInterval);
}
