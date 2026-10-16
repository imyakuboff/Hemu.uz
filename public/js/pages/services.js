// Xizmatlar bo'limi (/services): buyurtmalar lentasi va ustalar (ZakazMaster uslubi)
import { state, t, esc, api, icon, num, qs, fmtRel } from '../core.js';
import { crumbs, cards, pager, emptyBox, requireLogin } from '../ui.js';
import { go, render, onAuthChanged } from '../app.js';
import { SVC_ART } from '../art-services.js';
import { offerModal } from './account.js';

// Afzalliklar ikonkalari (qora doira ichida sariq belgi)
const G = {
  hat: '<path d="M4 15a8 8 0 0 1 16 0" fill="currentColor"/><rect x="2" y="15" width="20" height="3" rx="1.5" fill="currentColor"/><path d="M12 7v-2" stroke="currentColor" stroke-width="2"/>',
  clock: '<circle cx="12" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M12 7.5V11l2.5 2" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/><rect x="5" y="19" width="14" height="2.4" rx="1.2" fill="currentColor"/>',
  search: '<circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M15 15l5 5" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
  user: '<circle cx="11" cy="8" r="4" fill="currentColor"/><path d="M3 20a8 8 0 0 1 13-6" fill="currentColor"/><circle cx="18" cy="17" r="4.2" fill="currentColor"/><path d="M16 17l1.5 1.5 2.6-2.8" stroke="#1b1b1b" stroke-width="1.6" fill="none"/>',
  wallet: '<rect x="3" y="7" width="18" height="13" rx="2.5" fill="currentColor"/><path d="M5 7l10-3 2 3" fill="currentColor"/><rect x="14" y="11" width="7" height="5" rx="1.5" fill="#1b1b1b"/>',
  pin: '<path d="M12 21s-6.5-6.2-6.5-11A6.5 6.5 0 0 1 18.5 10c0 4.8-6.5 11-6.5 11z" fill="currentColor"/><circle cx="12" cy="10" r="2.4" fill="#1b1b1b"/>',
  hammer: '<path d="M4 9l6-5 4 3-2 2 8 8-3 3-8-8-2 2z" fill="currentColor"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" fill="currentColor"/><circle cx="12" cy="20.5" r="1.8" fill="currentColor"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill="currentColor"/>',
  chat: '<path d="M3 5h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8l-4 3v-3H3z" fill="currentColor"/><path d="M9 10h11a1 1 0 0 1 1 1v7l-3-2h-9z" fill="currentColor" opacity=".55"/>',
};
const gl = (k) => `<span class="sv-ic"><svg viewBox="0 0 24 24" aria-hidden="true">${G[k]}</svg></span>`;
const SUBS = ['equipment-rental', 'tool-rental', 'delivery', 'apartment-repair', 'house-building', 'landscaping', 'repair', 'maintenance'];
const dmy = (s) => { const d = new Date(String(s).replace(' ', 'T') + (String(s).includes('Z') ? '' : 'Z')); return Number.isNaN(+d) ? '' : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`; };

function orderCard(r) {
  return `<div class="sv-order">
    <div class="so-top"><span class="so-tag">${esc(r.subcategory?.name || r.category?.name || '')}</span><span class="so-date">${esc(t('sv_from_date', { d: dmy(r.created_at) }))}</span></div>
    <b class="so-title">${esc(r.title)}</b>
    <span class="so-loc">${icon('pin')} ${esc([r.location?.region_name || r.location?.country_name, r.location?.city].filter(Boolean).join(', ') || '—')}</span>
    ${r.description ? `<p class="so-desc">${esc(r.description)}</p>` : ''}
    <div class="so-foot">
      ${r.budget?.formatted ? `<span class="so-budget">${esc(r.budget.formatted)}</span>` : `<span class="so-budget muted">${esc(t('sv_budget_open'))}</span>`}
      <span class="so-offers">${icon('chat')} ${esc(t('offers_n', { n: r.offers_count }))}</span>
      ${r.is_owner ? `<a class="btn btn-soft btn-sm" href="/my/orders?tab=requests">${esc(t('sv_my_order'))}</a>` : r.my_offer ? `<span class="tag green">${esc(t('your_offer'))}</span>` : `<button class="btn sv-btn-dark btn-sm" data-offer="${r.id}">${esc(t('make_offer'))}</button>`}
    </div>
  </div>`;
}

export async function services({ query }) {
  const root = state.cats.find((c) => c.slug === 'services');
  const subs = SUBS.map((s) => root?.children.find((c) => c.slug === s)).filter(Boolean);
  const tab = query.tab === 'masters' ? 'masters' : 'orders';
  const cat = query.cat && subs.some((s) => s.slug === query.cat) ? query.cat : 'services';
  const country = state.country || undefined;
  const data = tab === 'orders'
    ? await api(`/requests${qs({ category: cat, country, q: query.q, page: query.page })}`)
    : await api(`/listings${qs({ category: cat, country, q: query.q, sort: query.sort, page: query.page, per_page: 16 })}`);
  const link = (p) => `/services${qs({ ...query, page: undefined, ...p })}`;
  const active = subs.find((s) => s.slug === query.cat);
  const html = `
  ${crumbs([[t('home'), '/'], [t('sv_title')]])}
  <section class="sv-hero">
    <h1>${esc(t('sv_h1'))}</h1>
    <p>${esc(t('sv_sub'))}</p>
    <div class="sv-hero-btns">
      <a class="btn sv-btn-dark" href="/request/new${qs({ category: 'services', subcategory: query.cat })}">${icon('plus')} ${esc(t('sv_post_order'))}</a>
      <a class="btn sv-btn-white" href="/create${qs({ category: 'services', subcategory: query.cat })}">${gl('hammer')} ${esc(t('sv_im_master'))}</a>
    </div>
  </section>

  <div class="sv-feed">
    <div class="sv-feed-hd"><h2>${esc(t(tab === 'orders' ? 'sv_feed' : 'sv_masters'))}</h2>
      <div class="sv-tabs"><a class="${tab === 'orders' ? 'on' : ''}" href="${link({ tab: undefined })}">${esc(t('sv_tab_orders'))}</a><a class="${tab === 'masters' ? 'on' : ''}" href="${link({ tab: 'masters' })}">${esc(t('sv_tab_masters'))}</a></div></div>
    <form class="sv-search" data-svs>${icon('search')}<input name="q" value="${esc(query.q || '')}" placeholder="${esc(t('sv_search_ph'))}"><button class="sv-filter" aria-label="${esc(t('find'))}">${icon('sliders')}</button></form>
    <div class="sv-cats">${subs.map((s) => `<a class="sv-cat ${query.cat === s.slug ? 'on' : ''}" href="${link({ cat: query.cat === s.slug ? undefined : s.slug })}"><span>${esc(s.name)}</span>${SVC_ART[s.slug] || ''}</a>`).join('')}</div>
    <div class="sv-list-hd"><b>${esc(active ? active.name : t(tab === 'orders' ? 'sv_all_orders' : 'sv_all_masters'))}</b> <span class="muted small">${esc(t('found_items', { n: num(data.total) }))}</span>
      ${tab === 'masters' ? `<select class="input sv-sort" data-sort>${['new', 'price_asc', 'price_desc', 'popular'].map((x) => `<option value="${x}" ${(query.sort || 'new') === x ? 'selected' : ''}>${esc(t(x === 'new' ? 'sort_actual' : `sort_${x}`))}</option>`).join('')}</select>` : `<span class="sv-sortlbl">${icon('calendar')} ${esc(t('sv_by_date'))}</span>`}</div>
    ${data.items.length
    ? (tab === 'orders' ? `<div class="sv-orders">${data.items.map(orderCard).join('')}</div>` : cards(data.items, 4))
    : emptyBox(t(tab === 'orders' ? 'sv_no_orders' : 'sv_no_masters'), t(tab === 'orders' ? 'sv_no_orders_sub' : 'sv_no_masters_sub'))}
    ${pager(data.page, data.pages, (pg) => `/services${qs({ ...query, page: pg })}`)}
  </div>

  <section class="sv-why">
    <div class="sv-why-col">
      <h2>${esc(t('sv_client_h'))}</h2>
      <div class="sv-why-grid">
        <div class="sv-why-card half">${gl('hat')}<span>${esc(t('sv_c1'))}</span></div>
        <div class="sv-why-card half">${gl('clock')}<span>${esc(t('sv_c2'))}</span></div>
        <div class="sv-why-card">${gl('search')}<span>${esc(t('sv_c3'))}</span></div>
        <div class="sv-why-card">${gl('user')}<span>${esc(t('sv_c4'))}</span></div>
        <div class="sv-why-card">${gl('wallet')}<span>${esc(t('sv_c5'))}</span></div>
        <div class="sv-why-card">${gl('pin')}<span>${esc(t('sv_c6'))}</span></div>
      </div>
      <a class="btn sv-btn-dark" href="/request/new?category=services">${icon('plus')} ${esc(t('sv_post_order'))}</a>
    </div>
    <div class="sv-why-col">
      <h2>${esc(t('sv_master_h'))}</h2>
      <div class="sv-why-grid">
        <div class="sv-why-card half">${gl('pin')}<span>${esc(t('sv_m1'))}</span></div>
        <div class="sv-why-card half">${gl('hammer')}<span>${esc(t('sv_m2'))}</span></div>
        <div class="sv-why-card">${gl('bell')}<span>${esc(t('sv_m3'))}</span></div>
        <div class="sv-why-card">${gl('star')}<span>${esc(t('sv_m4'))}</span></div>
        <div class="sv-why-card">${gl('chat')}<span>${esc(t('sv_m5'))}</span></div>
      </div>
      <a class="btn sv-btn-white" href="/create?category=services">${gl('hammer')} ${esc(t('sv_im_master'))}</a>
    </div>
  </section>

  <section class="sv-chat">
    <div class="sc-text"><h2>${esc(t('sv_chat_h'))}</h2><p>${esc(t('sv_chat_sub'))}</p></div>
    <div class="sc-phone">
      <div class="sc-head">${icon('user')} <b>${esc(t('sv_chat_name'))}</b></div>
      <div class="sc-order"><span>${esc(t('sv_chat_order'))}</span><em>${esc(t('sv_chat_go'))}</em></div>
      <div class="sc-msg me">${esc(t('sv_chat_m1'))}<i>09:41</i></div>
      <div class="sc-msg">${esc(t('sv_chat_m2'))}</div>
      <div class="sc-msg me">${esc(t('sv_chat_m3'))}<i>09:42</i></div>
      <div class="sc-input"><span>${esc(t('type_msg'))}</span><b>${icon('send')}</b></div>
    </div>
  </section>`;
  return {
    title: t('sv_title'),
    html,
    mount(main) {
      main.querySelector('[data-svs]').onsubmit = (e) => { e.preventDefault(); go(link({ q: e.target.q.value.trim() || undefined })); };
      main.querySelector('[data-sort]')?.addEventListener('change', (e) => go(link({ sort: e.target.value })));
      main.addEventListener('click', (e) => {
        const b = e.target.closest('[data-offer]');
        if (!b) return;
        if (!requireLogin(onAuthChanged)) return;
        offerModal(b.dataset.offer, () => render({ keepScroll: true }));
      });
    },
  };
}
