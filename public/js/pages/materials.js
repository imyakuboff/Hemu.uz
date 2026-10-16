// Qurilish materiallari bo'limi (/materials): sement, qum, g'isht, taxta, bloklar, toshlar
import { state, t, esc, api, icon, num, qs, fmtRel } from '../core.js';
import { crumbs, pager, emptyBox, imgOf, priceText, regionsOf } from '../ui.js';
import { go } from '../app.js';
import { MAT_ART } from '../art-materials.js';

// Asosiy materiallar (bosh qatordagi katta kartalar) — qolganlari kichik
const MAIN = ['cement', 'sand', 'brick', 'brick-raw', 'wood-boards', 'penoblok', 'shlakoblok', 'melkusok'];

function matCard(l) {
  return `<a class="mat-card" href="/listing/${l.id}">
    <span class="mat-img"><img src="${esc(imgOf(l))}" alt="" loading="lazy">${l.promo ? `<span class="mat-disc">−${l.promo.pct}%</span>` : ''}</span>
    <span class="mat-body">
      <b class="mat-title">${esc(l.title)}</b>
      <span class="mat-sub">${esc([l.subcategory?.name, l.location?.city || l.location?.region_name].filter(Boolean).join(' · '))}</span>
      <span class="mat-price">${esc(priceText(l.price))}${l.price?.old_formatted ? ` <s>${esc(l.price.old_formatted)}</s>` : ''}</span>
      <span class="mat-meta">${esc(l.seller?.name || '')}${l.seller?.verified ? ` ${icon('check')}` : ''} · ${esc(fmtRel(l.bumped_at || l.published_at))}</span>
    </span>
    <button class="mat-fav ${l.is_favorite ? 'on' : ''}" data-fav="${l.id}" aria-label="${esc(t('to_favorites'))}">${icon('heart')}</button>
  </a>`;
}

export async function materials({ query }) {
  const root = state.cats.find((c) => c.slug === 'materials');
  const subs = root?.children || [];
  const country = state.country || undefined;
  const [res, regs] = await Promise.all([
    api(`/listings${qs({ category: query.cat || 'materials', country, region: query.region, q: query.q, sort: query.sort, page: query.page, per_page: 20 })}`),
    regionsOf(state.country || state.user?.country || 'UZ'),
  ]);
  const link = (p) => `/materials${qs({ ...query, page: undefined, ...p })}`;
  const tile = (s, big) => `<a class="mat-tile ${big ? 'big' : ''} ${query.cat === s.slug ? 'on' : ''}" href="${link({ cat: query.cat === s.slug ? undefined : s.slug })}">
    <span class="mt-text"><b>${esc(s.name)}</b><span>${s.count ? esc(t('listings_count', { n: num(s.count) })) : esc(t('mat_post_first'))}</span></span>
    ${MAT_ART[s.slug] || MAT_ART['materials-other']}<span class="mt-go">${icon('chevron', 'arrow-flip')}</span></a>`;
  const main = MAIN.map((k) => subs.find((s) => s.slug === k)).filter(Boolean);
  const rest = subs.filter((s) => !MAIN.includes(s.slug));
  const active = subs.find((s) => s.slug === query.cat);
  const html = `
  ${crumbs([[t('home'), '/'], [t('mat_title')]])}
  <section class="mat-hero">
    <div class="mh-text">
      <span class="mh-kicker">${icon('layers')} HEMU.UZ · ${esc(t('mat_kicker'))}</span>
      <h1>${esc(t('mat_h1a'))} <em>${esc(t('mat_h1b'))}</em></h1>
      <p>${esc(t('mat_sub'))}</p>
      <form class="mh-search" data-ms>${icon('search')}<input name="q" value="${esc(query.q || '')}" placeholder="${esc(t('mat_search_ph'))}"><button class="btn btn-primary">${esc(t('find'))}</button></form>
      <div class="mh-chips"><span>${esc(t('mat_chip1'))}</span><i>•</i><span>${esc(t('mat_chip2'))}</span><i>•</i><span>${esc(t('mat_chip3'))}</span></div>
    </div>
    <div class="mh-art" aria-hidden="true">${MAT_ART['brick']}${MAT_ART['cement']}${MAT_ART['wood-boards']}</div>
  </section>

  <div class="mat-tiles">${main.map((s) => tile(s, true)).join('')}</div>
  ${rest.length ? `<div class="mat-tiles small">${rest.map((s) => tile(s, false)).join('')}</div>` : ''}

  <div class="mat-head">
    <h2>${esc(active ? active.name : t('mat_all'))} <small>${esc(t('found_n', { n: num(res.total) }))}</small></h2>
    <div class="mat-filters">
      <select class="input" data-region><option value="">${esc(state.meta.countries.find((c) => c.code === (state.country || 'UZ'))?.name || t('all'))}</option>${regs.map((r) => `<option value="${r.code}" ${r.code === query.region ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>
      <select class="input" data-sort>${['new', 'price_asc', 'price_desc', 'popular'].map((x) => `<option value="${x}" ${(query.sort || 'new') === x ? 'selected' : ''}>${esc(t(x === 'new' ? 'sort_actual' : `sort_${x}`))}</option>`).join('')}</select>
    </div>
  </div>
  ${res.items.length ? `<div class="mat-list">${res.items.map(matCard).join('')}</div>` : emptyBox(t('mat_empty'), t('mat_empty_sub'))}
  ${pager(res.page, res.pages, (pg) => `/materials${qs({ ...query, page: pg })}`)}

  <section class="mat-steps">
    <div class="ms-text">
      <h2>${esc(t('mat_fast_a'))} <em>${esc(t('mat_fast_b'))}</em></h2>
      <p>${esc(t('mat_fast_sub'))}</p>
      <a class="btn btn-accent" href="/create${qs({ category: 'materials', subcategory: query.cat })}">${icon('plus')} ${esc(t('post_listing'))}</a>
    </div>
    <ol class="ms-list">
      <li><span class="n">1</span>${icon('user')}<b>${esc(t('mat_step1'))}</b></li>
      <li><span class="n">2</span>${icon('image')}<b>${esc(t('mat_step2'))}</b></li>
      <li><span class="n">3</span>${icon('grid')}<b>${esc(t('mat_step3'))}</b></li>
      <li><span class="n">4</span>${icon('send')}<b>${esc(t('mat_step4'))}</b></li>
    </ol>
  </section>`;
  return {
    title: t('mat_title'),
    html,
    mount(el) {
      el.querySelector('[data-ms]').onsubmit = (e) => { e.preventDefault(); go(link({ q: e.target.q.value.trim() || undefined })); };
      el.querySelector('[data-sort]').onchange = (e) => go(link({ sort: e.target.value }));
      el.querySelector('[data-region]').onchange = (e) => go(link({ region: e.target.value || undefined }));
    },
  };
}
