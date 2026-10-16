// Fura logistika birjasi: yuklar va bo'sh furalar, mos e'lonlar, yo'nalishga obuna
import { state, t, esc, api, icon, num, qs, fmtRel, fmtDate, openModal, closeModal, toast, $ } from '../core.js';
import { crumbs, pager, emptyBox, requireLogin } from '../ui.js';
import { go, render, onAuthChanged } from '../app.js';
import { writeModal } from './sections.js';
import { shareLink } from '../features.js';

let META = null;
const meta = async () => (META ||= await api('/freight/meta'));
// Mamlakat nomlari: Markaziy Osiyo — sayt ma'lumotnomasidan, xalqaro yo'nalishlar — o'zimizning lug'at (uz/ru/en)
const EXTRA = {
  CN: ['Xitoy', 'Китай', 'China'], TR: ['Turkiya', 'Турция', 'Turkey'], IR: ['Eron', 'Иран', 'Iran'],
  BY: ['Belarus', 'Беларусь', 'Belarus'], GE: ['Gruziya', 'Грузия', 'Georgia'], AM: ['Armaniston', 'Армения', 'Armenia'],
  LT: ['Litva', 'Литва', 'Lithuania'], LV: ['Latviya', 'Латвия', 'Latvia'], PL: ['Polsha', 'Польша', 'Poland'],
  DE: ['Germaniya', 'Германия', 'Germany'], AE: ['BAA', 'ОАЭ', 'UAE'], PK: ['Pokiston', 'Пакистан', 'Pakistan'],
  IN: ['Hindiston', 'Индия', 'India'],
};
const cname = (cc) => {
  if (!cc) return '';
  const own = state.meta?.countries.find((c) => c.code === cc);
  if (own) return own.name;
  const e = EXTRA[cc];
  if (e) return e[state.lang === 'uz' ? 0 : ['en', 'prs', 'ps'].includes(state.lang) ? 2 : 1];
  return cc;
};
const countryOpts = (list, val, anyLabel) => `${anyLabel ? `<option value="">${esc(anyLabel)}</option>` : ''}${list.map((c) => `<option value="${c}" ${c === val ? 'selected' : ''}>${esc(cname(c))}</option>`).join('')}`;
const bodies = (arr) => (arr || []).map((b) => t(`body_${b}`)).join(', ');
const priceText = (x) => (x.price_formatted ? `${x.price_formatted}${x.price_unit && x.price_unit !== 'total' ? ` ${t(`fr_unit_${x.price_unit}`)}` : ''}` : t('fr_negotiable'));
const dateText = (x) => (x.date_from ? (x.date_to && x.date_to !== x.date_from ? `${fmtDate(x.date_from)} — ${fmtDate(x.date_to)}` : fmtDate(x.date_from)) : '');
const docTags = (x) => [x.adr ? '<span class="tag red">ADR</span>' : '', x.tir ? '<span class="tag">TIR</span>' : '', x.cmr ? '<span class="tag">CMR</span>' : '', x.payment ? `<span class="tag grey">${esc(t(`pay_${x.payment}`))}</span>` : ''].join('');

// Yo'nalish chizig'i: A nuqta — chiziq (sana/masofa) — B nuqta
const stop = (p, cls, any = false) => `<div class="fr-stop ${cls}"><i></i><div>${p ? `<b>${esc(p.city || cname(p.country))}</b><span>${esc(p.city ? cname(p.country) : '')}</span>` : `<b class="muted">${esc(any ? t('fr_any_dir') : '—')}</b>`}</div></div>`;
const routeLine = (x) => `<div class="fr-c-route">${stop(x.from, 'a')}<div class="fr-line"><span>${x.distance_km ? `${num(x.distance_km)} km` : ''}</span></div>${stop(x.to, 'b', true)}</div>`;
const chip = (ic, text) => (text ? `<span class="fr-chip">${icon(ic)}${esc(text)}</span>` : '');

// LoadMe uslubidagi kartochka: egasi va roli, narx, A → B (mamlakat kodi bilan), kuzov, masofa, og'irlik
const ROLE = { load: ['fr_role_owner', 'red'], truck: ['fr_role_carrier', 'green'] };
function frCard(x) {
  const [roleKey, roleCls] = ROLE[x.kind] || ROLE.load;
  const body = (x.body_types || [])[0];
  return `<a class="lm-card ${x.kind}" href="/fura/${x.id}">
    <div class="lm-top">
      <span class="lm-owner">${x.owner.verified ? `<span class="lm-ver" title="${esc(t('company_verified'))}">${icon('check')}</span>` : `<span class="lm-ver off">${icon('user')}</span>`}<span>${esc(x.owner.name || '—')}</span></span>
      <span class="lm-role ${roleCls}">${esc(t(roleKey))}</span>
    </div>
    <div class="lm-mid">
      <span class="lm-date">${icon('calendar')} ${esc(dateText(x) || t('fr_any_date'))}</span>
      <b class="lm-price ${x.price_formatted ? '' : 'neg'}">${esc(priceText(x))}</b>
    </div>
    <div class="lm-route">
      <div class="lm-pt">${icon('box')}<b>${esc(x.from.city || cname(x.from.country))}</b><em>${esc(x.from.country || '')}</em></div>
      <div class="lm-pt">${icon('flag')}${x.to ? `<b>${esc(x.to.city || cname(x.to.country))}</b><em>${esc(x.to.country || '')}</em>` : `<b class="muted">${esc(t('fr_any_dir'))}</b>`}
        ${body ? `<span class="lm-body">${icon('truck')} ${esc(t(`body_${body}`))}${x.body_types.length > 1 ? ` +${x.body_types.length - 1}` : ''}</span>` : ''}</div>
    </div>
    <div class="lm-foot">
      ${x.distance_km ? `<span>${icon('map')} ${num(x.distance_km)} km</span>` : ''}
      ${x.weight_t ? `<span>${icon('scale')} ${num(x.weight_t)} t</span>` : ''}
      ${x.volume_m3 ? `<span>${icon('box')} ${num(x.volume_m3)} m³</span>` : ''}
      ${x.trucks_count > 1 ? `<span class="tag yellow">×${x.trucks_count}</span>` : ''}${docTags(x)}
      <em>${esc(fmtRel(x.bumped_at || x.created_at))}</em>
    </div>
    ${x.cargo ? `<div class="lm-cargo">${esc(x.cargo)}</div>` : ''}
    ${x.matches ? `<span class="fr-match">${icon('target')} ${esc(t(x.kind === 'load' ? 'fr_matches_trucks' : 'fr_matches_loads', { n: x.matches }))}</span>` : ''}
  </a>`;
}

// Bannerdagi bezak: suzib yurgan qutilar va magnit (SVG — har qanday ekranda tiniq)
const cube = (x, y, s, c1, c2, c3, r = 0) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})"><path d="M0 8 L14 0 L28 8 L14 16 Z" fill="${c1}"/><path d="M0 8 L14 16 L14 32 L0 24 Z" fill="${c2}"/><path d="M28 8 L14 16 L14 32 L28 24 Z" fill="${c3}"/><path d="M7 4 L21 12 L21 16" stroke="rgba(0,0,0,.18)" stroke-width="1.4" fill="none"/></g>`;
const BOXES = (side) => {
  const pal = [['#e8c08a', '#c99a5b', '#b4854a'], ['#d9a35b', '#b9823f', '#a06d30'], ['#c7d3df', '#9fb0c1', '#8a9cae'], ['#e9b97a', '#cf9a52', '#b98340']];
  const pts = side === 'l'
    ? [[10, 30, 1.1, -8], [60, 80, .8, 12], [20, 130, 1.3, 4], [90, 170, .7, -14], [40, 215, 1, 10], [110, 40, .6, 20], [120, 120, .9, -6]]
    : [[40, 20, .9, 10], [100, 70, 1.2, -10], [30, 120, .7, 16], [90, 165, 1, 6], [20, 200, 1.1, -12], [120, 210, .6, 4]];
  return `<svg class="lm-boxes ${side}" viewBox="0 0 160 260" aria-hidden="true">
    <g stroke="rgba(255,255,255,.28)" stroke-width="1" fill="none">${Array.from({ length: 7 }, (_, i) => `<path d="M${side === 'l' ? 0 : 160} ${40 + i * 30} C 70 ${60 + i * 24}, 90 ${120 + i * 10}, ${side === 'l' ? 160 : 0} ${130 + i * 8}"/>`).join('')}</g>
    ${pts.map(([x, y, sc, r], i) => cube(x, y, sc, ...pal[i % pal.length], r)).join('')}
    ${side === 'r' ? '<g transform="translate(96 96) rotate(-30)"><path d="M0 0 h26 a26 26 0 0 1 0 52 h-26 v-16 h26 a10 10 0 0 0 0-20 h-26z" fill="#e5483a"/><rect x="-14" y="0" width="16" height="16" fill="#cfd8e2"/><rect x="-14" y="36" width="16" height="16" fill="#cfd8e2"/></g>' : ''}
  </svg>`;
};

// ---------- Ro'yxat: /fura?tab=trucks&from_country=UZ ... ----------
export async function fura({ query }) {
  const m = await meta();
  const kind = query.tab === 'trucks' ? 'truck' : 'load';
  const f = { from_country: query.from_country, from_city: query.from_city, to_country: query.to_country, to_city: query.to_city, body: query.body, weight_min: query.weight_min, date: query.date, adr: query.adr };
  const data = await api(`/freight${qs({ kind, ...f, q: query.q, page: query.page })}`);
  const tabLink = (tab) => `/fura${qs({ ...query, tab, page: undefined })}`;
  const place = (city, cc) => city || (cc ? cname(cc) : '');
  const fromTxt = place(f.from_city, f.from_country);
  const toTxt = place(f.to_city, f.to_country);
  const filtersOn = [f.from_country, f.from_city, f.to_country, f.to_city, f.body, f.weight_min, f.date, f.adr].filter(Boolean).length;
  const html = `
  <section class="lm-hero">
    ${BOXES('l')}${BOXES('r')}
    <span class="lm-kicker">HEMU.UZ · ${esc(t('nav_logistics'))}</span>
    <h1>${esc(t(kind === 'load' ? 'fr_title_loads' : 'fr_title_trucks'))}</h1>
    <p>${esc(t('fr_hero'))}</p>
    <div class="lm-hero-btns"><button class="btn btn-accent" data-post="load">${icon('box')} ${esc(t('fr_post_load'))}</button><button class="btn btn-white" data-post="truck">${icon('truck')} ${esc(t('fr_post_truck'))}</button>
      ${state.user ? `<button class="btn lm-ghost" data-mine>${icon('list')} ${esc(t('fr_my_posts'))}</button>` : ''}</div>
  </section>

  <div class="lm-panel">
    <div class="lm-tabs">
      <a class="${kind === 'load' ? 'on' : ''}" href="${tabLink(undefined)}"><i></i>${esc(t('fr_loads'))} <small>${num(data.stats.loads)}</small></a>
      <a class="${kind === 'truck' ? 'on' : ''}" href="${tabLink('trucks')}"><i></i>${esc(t('fr_tab_transport'))} <small>${num(data.stats.trucks)}</small></a>
    </div>
    <button type="button" class="lm-searchcard" data-open-search>
      <span class="lm-sicon">${icon('search')}</span>
      <span class="lm-stext"><b>${esc(t('fr_search'))}</b><span>${fromTxt || toTxt ? `${esc(fromTxt || t('fr_any_country'))} → ${esc(toTxt || t('fr_any_dir'))}` : `${esc(t('fr_from'))} → ${esc(t('fr_to'))}`}</span></span>
      <span class="lm-sbody">${icon('truck')}<span>${esc(f.body ? t(`body_${f.body}`) : t('fr_all'))}</span></span>
    </button>
    <div class="lm-count">
      <b>${esc(t(kind === 'load' ? 'fr_all_loads' : 'fr_all_trucks', { n: num(data.total) }))}</b>
      <div class="lm-count-acts">
        ${filtersOn ? `<a class="link-blue small" href="/fura${kind === 'truck' ? '?tab=trucks' : ''}">${esc(t('fr_reset'))}</a>` : ''}
        <button class="lm-filter" data-sub title="${esc(t('fr_subscribe'))}">${icon('bell')}</button>
        <button class="lm-filter ${filtersOn ? 'on' : ''}" data-open-search>${icon('sliders')} ${esc(t('fr_filter'))}${filtersOn ? ` <i>${filtersOn}</i>` : ''}</button>
      </div>
    </div>
    ${data.routes.length ? `<div class="lm-routes">${data.routes.map((r) => `<a href="/fura${qs({ tab: query.tab, from_city: r.from_city, to_city: r.to_city })}">${esc(r.from_city)} <i>→</i> ${esc(r.to_city)} <em>${r.n}</em></a>`).join('')}</div>` : ''}
    <div class="lm-list">${data.items.length ? data.items.map(frCard).join('') : `<div class="fr-empty">${icon(kind === 'load' ? 'box' : 'truck')}<b>${esc(t('nothing_found'))}</b><button class="btn btn-primary" data-post="${kind}">${icon('plus')} ${esc(t(kind === 'load' ? 'fr_post_load' : 'fr_post_truck'))}</button></div>`}</div>
    ${pager(data.page, data.pages, (p) => `/fura${qs({ ...query, page: p })}`)}
  </div>

  <section class="fr-how">
    <h2>${esc(t('fr_how_title'))}</h2>
    <div class="fr-how-grid">
      <div><span class="n">1</span>${icon('plus')}<b>${esc(t('fr_how1'))}</b><p>${esc(t('fr_how1_sub'))}</p></div>
      <div><span class="n">2</span>${icon('target')}<b>${esc(t('fr_how2'))}</b><p>${esc(t('fr_how2_sub'))}</p></div>
      <div><span class="n">3</span>${icon('phone')}<b>${esc(t('fr_how3'))}</b><p>${esc(t('fr_how3_sub'))}</p></div>
    </div>
  </section>`;

  // Qidiruv oynasi: Qayerdan / Qayerga, transport turi, qo'shimcha filtrlar → "Tayyor"
  const searchModal = () => {
    const el = openModal(`<div class="lm-modal">
      <div class="lm-m-hd"><h3>${esc(t(kind === 'load' ? 'fr_search_loads' : 'fr_search_trucks'))}</h3></div>
      <form data-sf>
        <div class="lm-places">
          <label class="lm-place a"><i></i><input name="from_city" value="${esc(f.from_city || '')}" placeholder="${esc(t('fr_from'))}" autocomplete="off"><select name="from_country">${countryOpts(m.countries, f.from_country, '🌐')}</select></label>
          <button type="button" class="lm-swap" data-swap title="⇄">⇅</button>
          <label class="lm-place b"><i></i><input name="to_city" value="${esc(f.to_city || '')}" placeholder="${esc(t('fr_to'))}" autocomplete="off"><select name="to_country">${countryOpts(m.countries, f.to_country, '🌐')}</select></label>
        </div>
        <label class="lm-select">${icon('truck')}<select name="body"><option value="">${esc(t('fr_pick_body'))}</option>${m.bodies.map((b) => `<option value="${b}" ${b === f.body ? 'selected' : ''}>${esc(t(`body_${b}`))}</option>`).join('')}</select></label>
        <div class="lm-more">
          <label><span>${esc(t('fr_date_from'))}</span><input class="input" name="date" type="date" value="${esc(f.date || '')}"></label>
          <label><span>${esc(t('fr_weight'))} ≥</span><input class="input" name="weight_min" type="number" min="0" max="200" value="${esc(f.weight_min || '')}"></label>
          <label class="check"><input type="checkbox" name="adr" ${f.adr === '1' ? 'checked' : ''}> ${esc(t('fr_adr'))}</label>
        </div>
        <button class="btn btn-primary btn-block lm-done">${esc(t('fr_done'))}</button>
      </form></div>`);
    const fm = el.querySelector('[data-sf]');
    el.querySelector('[data-swap]').onclick = () => {
      for (const [a, b] of [['from_country', 'to_country'], ['from_city', 'to_city']]) [fm[a].value, fm[b].value] = [fm[b].value, fm[a].value];
    };
    setTimeout(() => fm.from_city.focus(), 50);
    fm.onsubmit = (e) => {
      e.preventDefault();
      const q = { tab: query.tab };
      for (const k of ['from_country', 'from_city', 'to_country', 'to_city', 'body', 'weight_min', 'date']) q[k] = fm[k].value.trim() || undefined;
      q.adr = fm.adr.checked ? '1' : undefined;
      closeModal();
      go(`/fura${qs(q)}`);
    };
  };

  return {
    title: t('sec_fura'),
    html,
    mount(main) {
      main.addEventListener('click', async (e) => {
        if (e.target.closest('[data-open-search]')) return searchModal();
        const p = e.target.closest('[data-post]');
        if (p) { if (requireLogin(onAuthChanged)) postModal(p.dataset.post); return; }
        if (e.target.closest('[data-mine]')) return mineModal();
        if (e.target.closest('[data-sub]')) {
          if (!requireLogin(onAuthChanged)) return;
          const body = { kind, from_country: f.from_country || undefined, to_country: f.to_country || undefined, from_city: f.from_city || undefined, to_city: f.to_city || undefined, body: f.body || undefined };
          await api('/me/freight-alerts', { method: 'POST', body });
          toast(t('fr_subscribed'), 'ok');
        }
      });
    },
  };
}

// ---------- Bitta e'lon: /fura/:id ----------
export async function furaDetail({ params }) {
  const x = await api(`/freight/${params[0]}`);
  const row = (k, v) => (v ? `<tr><td>${esc(k)}</td><td>${v}</td></tr>` : '');
  const html = `
  ${crumbs([[t('home'), '/'], [t('sec_fura'), x.kind === 'truck' ? '/fura?tab=trucks' : '/fura'], [`#${x.id}`]])}
  <div class="detail">
    <div>
      <div class="fr-detail-head ${x.kind}">
        <div class="tags"><span class="tag ${x.kind === 'load' ? 'yellow' : ''}">${icon(x.kind === 'load' ? 'box' : 'truck')} ${esc(t(x.kind === 'load' ? 'fr_loads' : 'fr_trucks'))}</span>${docTags(x)}</div>
        ${routeLine(x)}
        ${x.cargo ? `<h1 class="fr-d-title">${esc(x.cargo)}</h1>` : ''}
        <div class="fr-chips">${chip('calendar', dateText(x))}${chip('scale', x.weight_t ? `${num(x.weight_t)} t` : '')}${chip('box', x.volume_m3 ? `${num(x.volume_m3)} m³` : '')}${chip('truck', bodies(x.body_types))}${chip('eye', t('views_n', { n: num(x.views) }))}</div>
      </div>
      <div class="box"><table class="spec">
        ${row(t('fr_cargo'), esc(x.cargo || ''))}
        ${row(t('fr_body'), esc(bodies(x.body_types)))}
        ${row(t('fr_loading'), esc((x.loading || []).map((l) => t(`load_${l}`)).join(', ')))}
        ${row(t('fr_weight'), x.weight_t ? num(x.weight_t) : '')}
        ${row(t('fr_volume'), x.volume_m3 ? num(x.volume_m3) : '')}
        ${row(t('fr_length'), x.length_m ? num(x.length_m) : '')}
        ${row(t('fr_trucks_count'), x.trucks_count > 1 ? num(x.trucks_count) : '')}
        ${row(t('fr_distance'), x.distance_km ? num(x.distance_km) : '')}
        ${row(t('fr_docs'), [x.adr ? 'ADR' : '', x.tir ? 'TIR' : '', x.cmr ? 'CMR' : ''].filter(Boolean).join(', '))}
        ${row(t('fr_payment'), x.payment ? esc(t(`pay_${x.payment}`)) : '')}
      </table>${x.note ? `<h3 style="margin-top:16px">${esc(t('fr_note'))}</h3><div class="prose">${esc(x.note)}</div>` : ''}</div>
      <h2 class="sec-title" style="margin-top:22px">${esc(t(x.kind === 'load' ? 'fr_match_title_trucks' : 'fr_match_title_loads'))} · ${num(x.matches)}</h2>
      <div class="lm-list">${x.matches_list.length ? x.matches_list.map(frCard).join('') : emptyBox(t('nothing_found'))}</div>
    </div>
    <aside><div class="side-card">
      <div class="big-price">${esc(priceText(x))}</div>
      <p class="small" style="margin:10px 0">${esc(x.owner.name || '')} ${x.owner.verified ? `<span class="tag green">${esc(t('company_verified'))}</span>` : ''}</p>
      ${x.is_owner
        ? `<div class="stack"><button class="btn btn-primary" data-bump>${esc(t('fr_bump'))}</button><button class="btn btn-ghost" data-close>${esc(t('close_request'))}</button></div>`
        : `<div class="stack" style="margin-bottom:8px"><button class="btn btn-soft" data-share>${icon('send')} ${esc(t('share'))}</button></div><div class="stack"><button class="btn btn-primary" data-phone>${icon('phone')} <span>${esc(t('show_phone'))}</span></button><button class="btn btn-soft" data-write>${icon('chat')} ${esc(t('write_seller'))}</button></div>`}
    </div></aside>
  </div>`;
  const ctx = `${x.from.city} → ${x.to?.city || t('fr_any_dir')}${x.cargo ? ` · ${x.cargo}` : ''}`;
  return {
    title: ctx,
    html,
    mount(main) {
      $('[data-phone]', main)?.addEventListener('click', async (e) => {
        if (!requireLogin(onAuthChanged)) return;
        const btn = e.currentTarget;
        const r = await api(`/freight/${x.id}/phone`, { method: 'POST' });
        btn.outerHTML = `<a class="btn btn-primary" href="tel:${esc(r.phone)}">${icon('phone')} ${esc(r.phone)}</a>`;
      });
      $('[data-write]', main)?.addEventListener('click', () => { if (requireLogin(onAuthChanged)) writeModal(x.user_id, ctx); });
      $('[data-share]', main)?.addEventListener('click', () => shareLink(`/fura/${x.id}`, ctx, priceText(x)));
      $('[data-bump]', main)?.addEventListener('click', async () => { await api(`/freight/${x.id}/bump`, { method: 'POST' }); toast(t('fr_bumped'), 'ok'); render({ keepScroll: true }); });
      $('[data-close]', main)?.addEventListener('click', async () => { await api(`/freight/${x.id}/close`, { method: 'POST' }); toast(t('saved'), 'ok'); go('/fura'); });
    },
  };
}

// ---------- Joylash oynasi ----------
async function postModal(kind) {
  const m = await meta();
  const def = state.user?.country || 'UZ';
  const cur = state.meta.currencies.map((c) => c.code);
  const isLoad = kind === 'load';
  const el = openModal(`<h3>${esc(t(isLoad ? 'fr_post_load' : 'fr_post_truck'))}</h3>
    <form class="form-grid" style="margin-top:12px" data-pf>
      <div><label class="lbl">${esc(t('fr_from'))} *</label><select class="input" name="from_country">${countryOpts(m.countries, def)}</select></div>
      <div><label class="lbl">${esc(t('fr_city'))} *</label><input class="input" name="from_city" required minlength="2" maxlength="80"></div>
      <div><label class="lbl">${esc(t('fr_to'))}${isLoad ? ' *' : ''}</label><select class="input" name="to_country">${countryOpts(m.countries, isLoad ? def : '', isLoad ? '' : t('fr_any_dir'))}</select></div>
      <div><label class="lbl">${esc(t('fr_city'))}${isLoad ? ' *' : ''}</label><input class="input" name="to_city" ${isLoad ? 'required' : ''} maxlength="80"></div>
      <div><label class="lbl">${esc(t(isLoad ? 'fr_date_from' : 'fr_ready'))}</label><input class="input" type="date" name="date_from"></div>
      <div><label class="lbl">${esc(t('fr_date_to'))}</label><input class="input" type="date" name="date_to"></div>
      ${isLoad ? `<div class="full"><label class="lbl">${esc(t('fr_cargo'))} *</label><input class="input" name="cargo" required maxlength="120"></div>` : ''}
      <div class="full"><label class="lbl">${esc(t('fr_body'))}${isLoad ? '' : ' *'}</label><div class="pick-grid">${m.bodies.map((b) => `<label class="pick"><input type="checkbox" name="body" value="${b}"><span>${esc(t(`body_${b}`))}</span></label>`).join('')}</div></div>
      <div class="full"><label class="lbl">${esc(t('fr_loading'))}</label><div class="pick-grid">${m.loading.map((l) => `<label class="pick"><input type="checkbox" name="loading" value="${l}"><span>${esc(t(`load_${l}`))}</span></label>`).join('')}</div></div>
      <div><label class="lbl">${esc(t('fr_weight'))}</label><input class="input" name="weight_t" type="number" step="0.1" min="0" max="200"></div>
      <div><label class="lbl">${esc(t('fr_volume'))}</label><input class="input" name="volume_m3" type="number" step="0.1" min="0" max="500"></div>
      ${isLoad ? `<div><label class="lbl">${esc(t('fr_trucks_count'))}</label><input class="input" name="trucks_count" type="number" min="1" max="100" value="1"></div>
        <div><label class="lbl">${esc(t('fr_distance'))}</label><input class="input" name="distance_km" type="number" min="0" max="20000"></div>`
        : `<div><label class="lbl">${esc(t('fr_length'))}</label><input class="input" name="length_m" type="number" step="0.1" min="0" max="40"></div><div></div>`}
      <div class="full"><label class="lbl">${esc(t('fr_docs'))}</label><div class="pick-grid"><label class="pick"><input type="checkbox" name="adr"><span>${esc(t('fr_adr'))}</span></label><label class="pick"><input type="checkbox" name="tir"><span>TIR</span></label><label class="pick"><input type="checkbox" name="cmr"><span>CMR</span></label></div></div>
      <div><label class="lbl">${esc(t('fr_price'))}</label><input class="input" name="price" inputmode="decimal" placeholder="${esc(t('fr_negotiable'))}"></div>
      <div style="display:flex;gap:6px"><div style="flex:1"><label class="lbl">${esc(t('currency'))}</label><select class="input" name="currency">${cur.map((c) => `<option ${c === (state.currency || 'UZS') ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div style="flex:1"><label class="lbl">&nbsp;</label><select class="input" name="price_unit">${['total', 'km', 'ton'].map((u) => `<option value="${u}">${esc(t(`fr_unit_${u}`))}</option>`).join('')}</select></div></div>
      <div class="full"><label class="lbl">${esc(t('fr_payment'))}</label><select class="input" name="payment"><option value="">—</option>${m.payment.map((p) => `<option value="${p}">${esc(t(`pay_${p}`))}</option>`).join('')}</select></div>
      <div class="full"><label class="lbl">${esc(t('fr_note'))}</label><textarea class="input" name="note" rows="3" maxlength="1000"></textarea></div>
      <div class="full"><button class="btn btn-primary btn-block">${esc(t('publish'))}</button></div>
    </form>`, { wide: true });
  const fm = el.querySelector('[data-pf]');
  fm.onsubmit = async (e) => {
    e.preventDefault();
    const val = (n) => fm[n]?.value.trim() || undefined;
    const numv = (n) => (val(n) ? Number(String(val(n)).replace(/\s/g, '').replace(',', '.')) : undefined);
    const checked = (n) => [...fm.querySelectorAll(`input[name=${n}]:checked`)].map((i) => i.value);
    if (!isLoad && !checked('body').length) { toast(t('fr_body'), 'err'); return; }
    const body = {
      kind, from_country: val('from_country'), from_city: val('from_city'), to_country: val('to_country'), to_city: val('to_city'),
      date_from: val('date_from'), date_to: val('date_to'), cargo: val('cargo'), body_types: checked('body'), loading: checked('loading'),
      weight_t: numv('weight_t'), volume_m3: numv('volume_m3'), length_m: numv('length_m'), trucks_count: numv('trucks_count'), distance_km: numv('distance_km'),
      adr: fm.adr.checked, tir: fm.tir.checked, cmr: fm.cmr.checked,
      price: numv('price'), currency: numv('price') ? val('currency') : undefined, price_unit: numv('price') ? val('price_unit') : undefined,
      payment: val('payment'), note: val('note'),
    };
    const r = await api('/freight', { method: 'POST', body });
    closeModal();
    toast(t('saved'), 'ok');
    go(`/fura/${r.id}`);
  };
}

// ---------- Mening e'lonlarim va obunalarim ----------
async function mineModal() {
  const [mine, alerts] = await Promise.all([api('/my/freight'), api('/me/freight-alerts')]);
  const el = openModal(`<h3>${esc(t('fr_my_posts'))}</h3>
    <div class="fr-list" style="margin-top:12px">${mine.length ? mine.map((x) => `<div class="fr-mine-row"><a href="/fura/${x.id}" data-close-link><b>${esc(x.from.city)} → ${esc(x.to?.city || t('fr_any_dir'))}</b><span>${esc([t(x.kind === 'load' ? 'fr_loads' : 'fr_trucks'), dateText(x), x.status === 'open' ? '' : t('st_closed')].filter(Boolean).join(' · '))}</span></a>
      <span class="tiny muted">${icon('eye')} ${num(x.views)}</span></div>`).join('') : emptyBox(t('nothing_found'))}</div>
    <h3 style="margin-top:18px">${esc(t('fr_my_alerts'))}</h3>
    <div>${alerts.length ? alerts.map((a) => `<div class="fr-mine-row"><span><b>${esc(t(a.kind === 'load' ? 'fr_loads' : 'fr_trucks'))}:</b> ${esc(a.from_city || cname(a.from_country) || t('fr_any_country'))} → ${esc(a.to_city || cname(a.to_country) || t('fr_any_dir'))}${a.body ? ` · ${esc(t(`body_${a.body}`))}` : ''}</span><button class="btn btn-ghost btn-sm" data-del-alert="${a.id}">${icon('trash')}</button></div>`).join('') : `<p class="small muted">—</p>`}</div>`, { wide: true });
  el.querySelectorAll('[data-close-link]').forEach((a) => a.addEventListener('click', closeModal));
  el.addEventListener('click', async (e) => {
    const d = e.target.closest('[data-del-alert]');
    if (!d) return;
    await api(`/me/freight-alerts/${d.dataset.delAlert}`, { method: 'DELETE' });
    d.closest('.fr-mine-row').remove();
  });
}
