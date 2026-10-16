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

function frCard(x) {
  const title = x.cargo || bodies(x.body_types);
  return `<a class="fr-card ${x.kind}" href="/fura/${x.id}">
    ${routeLine(x)}
    <div class="fr-c-info">
      <div class="fr-c-title">${esc(title || t(x.kind === 'load' ? 'fr_loads' : 'fr_trucks'))}${x.trucks_count > 1 ? ` <span class="tag yellow">×${x.trucks_count}</span>` : ''}</div>
      <div class="fr-chips">
        ${chip('calendar', dateText(x))}
        ${chip('scale', x.weight_t ? `${num(x.weight_t)} t` : '')}
        ${chip('box', x.volume_m3 ? `${num(x.volume_m3)} m³` : '')}
        ${chip('truck', x.cargo ? bodies(x.body_types) : (x.length_m ? `${num(x.length_m)} m` : ''))}
      </div>
      <div class="fr-c-owner">${x.owner.verified ? icon('check') : icon('user')}<span>${esc(x.owner.name || '')}</span><em>${esc(fmtRel(x.bumped_at || x.created_at))}</em></div>
    </div>
    <div class="fr-c-side">
      <b class="fr-price">${esc(x.price_formatted || t('fr_negotiable'))}</b>
      ${x.price_formatted && x.price_unit && x.price_unit !== 'total' ? `<small>${esc(t(`fr_unit_${x.price_unit}`))}</small>` : x.price_formatted ? `<small>${esc(t('fr_unit_total'))}</small>` : ''}
      <span class="fr-tags">${docTags(x)}</span>
      ${x.matches ? `<span class="fr-match">${icon('target')} ${esc(t(x.kind === 'load' ? 'fr_matches_trucks' : 'fr_matches_loads', { n: x.matches }))}</span>` : ''}
    </div>
  </a>`;
}

// Bannerdagi bezak: xarita ustidagi yo'nalish va fura (SVG — har qanday ekranda tiniq)
const HERO_ART = `<svg class="fr-art" viewBox="0 0 420 220" aria-hidden="true">
  <defs><linearGradient id="frg" x1="0" x2="1"><stop offset="0" stop-color="#ffc61a"/><stop offset="1" stop-color="#5aa7f0"/></linearGradient></defs>
  <g fill="none" stroke="rgba(255,255,255,.10)" stroke-width="1">${Array.from({ length: 8 }, (_, i) => `<path d="M0 ${20 + i * 26} H420"/>`).join('')}${Array.from({ length: 12 }, (_, i) => `<path d="M${15 + i * 36} 0 V220"/>`).join('')}</g>
  <path d="M40 170 C 120 60, 220 200, 380 50" fill="none" stroke="url(#frg)" stroke-width="4" stroke-dasharray="10 9" stroke-linecap="round"/>
  <circle cx="40" cy="170" r="11" fill="#ffc61a"/><circle cx="40" cy="170" r="4.5" fill="#0e3352"/>
  <path d="M380 22 c-13 0-22 9-22 21 0 16 22 37 22 37s22-21 22-37c0-12-9-21-22-21z" fill="#5aa7f0"/><circle cx="380" cy="43" r="7" fill="#0e3352"/>
  <g transform="translate(176 98) rotate(-8)">
    <rect x="0" y="0" width="64" height="30" rx="4" fill="#fff"/>
    <path d="M64 8 h16 l12 12 v10 h-28z" fill="#ffc61a"/><rect x="70" y="11" width="10" height="8" rx="1.5" fill="#0e3352"/>
    <circle cx="16" cy="32" r="7" fill="#0e3352" stroke="#fff" stroke-width="3"/><circle cx="50" cy="32" r="7" fill="#0e3352" stroke="#fff" stroke-width="3"/><circle cx="80" cy="32" r="7" fill="#0e3352" stroke="#fff" stroke-width="3"/>
    <rect x="8" y="9" width="40" height="4" rx="2" fill="#dbe7f3"/><rect x="8" y="17" width="28" height="4" rx="2" fill="#dbe7f3"/>
  </g>
</svg>`;

// ---------- Ro'yxat: /fura?tab=trucks&from_country=UZ ... ----------
export async function fura({ query }) {
  const m = await meta();
  const kind = query.tab === 'trucks' ? 'truck' : 'load';
  const f = { from_country: query.from_country, from_city: query.from_city, to_country: query.to_country, to_city: query.to_city, body: query.body, weight_min: query.weight_min, date: query.date, adr: query.adr };
  const data = await api(`/freight${qs({ kind, ...f, q: query.q, page: query.page })}`);
  const tabLink = (tab) => `/fura${qs({ ...query, tab, page: undefined })}`;
  const extraOpen = Boolean(f.weight_min || f.adr);
  const html = `
  ${crumbs([[t('home'), '/'], [t('sec_title'), '/categories'], [t('sec_fura')]])}
  <section class="fr-hero">
    <div class="fr-hero-txt">
      <span class="fr-kicker">${icon('truck')} ${esc(t('nav_logistics'))}</span>
      <h1>${esc(t('sec_fura'))}</h1>
      <p>${esc(t('fr_hero'))}</p>
      <div class="fr-hero-btns"><button class="btn btn-accent" data-post="load">${icon('box')} ${esc(t('fr_post_load'))}</button><button class="btn btn-white" data-post="truck">${icon('truck')} ${esc(t('fr_post_truck'))}</button>
        ${state.user ? `<button class="btn fr-ghost" data-mine>${icon('list')} ${esc(t('fr_my_posts'))}</button>` : ''}</div>
    </div>
    <div class="fr-hero-art">${HERO_ART}
      <div class="fr-stat s1"><b>${num(data.stats.loads)}</b><span>${esc(t('fr_loads'))}</span></div>
      <div class="fr-stat s2"><b>${num(data.stats.trucks)}</b><span>${esc(t('fr_trucks'))}</span></div>
      <div class="fr-stat s3"><b>${num(m.countries.length)}</b><span>${esc(t('fr_countries'))}</span></div>
    </div>
  </section>

  <form class="fr-search" data-ff>
    <div class="fr-seg">
      <a class="${kind === 'load' ? 'on' : ''}" href="${tabLink(undefined)}">${icon('box')}<span>${esc(t('fr_loads'))}</span><i>${num(data.stats.loads)}</i></a>
      <a class="${kind === 'truck' ? 'on' : ''}" href="${tabLink('trucks')}">${icon('truck')}<span>${esc(t('fr_trucks'))}</span><i>${num(data.stats.trucks)}</i></a>
    </div>
    <div class="fr-search-row">
      <div class="fr-field"><label>${icon('pin')} ${esc(t('fr_from'))}</label><div class="fr-place"><select name="from_country">${countryOpts(m.countries, f.from_country, t('fr_any_country'))}</select><input name="from_city" value="${esc(f.from_city || '')}" placeholder="${esc(t('fr_city'))}"></div></div>
      <button type="button" class="fr-swap" data-swap title="⇄">⇄</button>
      <div class="fr-field"><label>${icon('pin')} ${esc(t('fr_to'))}</label><div class="fr-place"><select name="to_country">${countryOpts(m.countries, f.to_country, t('fr_any_country'))}</select><input name="to_city" value="${esc(f.to_city || '')}" placeholder="${esc(t('fr_city'))}"></div></div>
      <div class="fr-field sm"><label>${icon('truck')} ${esc(t('fr_body'))}</label><select name="body"><option value="">${esc(t('fr_all_bodies'))}</option>${m.bodies.map((b) => `<option value="${b}" ${b === f.body ? 'selected' : ''}>${esc(t(`body_${b}`))}</option>`).join('')}</select></div>
      <div class="fr-field sm"><label>${icon('calendar')} ${esc(t('fr_date_from'))}</label><input name="date" type="date" value="${esc(f.date || '')}"></div>
      <button class="btn btn-primary fr-go">${icon('search')} <span>${esc(t('find'))}</span></button>
    </div>
    <details class="fr-more" ${extraOpen ? 'open' : ''}><summary>${icon('sliders')} ${esc(t('fr_more_filters'))}</summary>
      <div class="fr-more-row">
        <label class="fr-field sm"><span>${esc(t('fr_weight'))} ≥</span><input name="weight_min" type="number" min="0" max="200" value="${esc(f.weight_min || '')}"></label>
        <label class="check"><input type="checkbox" name="adr" ${f.adr === '1' ? 'checked' : ''}> ${esc(t('fr_adr'))}</label>
        <a class="link-blue" href="/fura${kind === 'truck' ? '?tab=trucks' : ''}">${esc(t('fr_reset'))}</a>
      </div>
    </details>
  </form>

  ${data.routes.length ? `<div class="fr-routes"><b>${icon('chart')} ${esc(t('fr_popular_routes'))}</b><div>${data.routes.map((r) => `<a href="/fura${qs({ tab: query.tab, from_city: r.from_city, to_city: r.to_city })}"><span>${esc(r.from_city)}</span><i>→</i><span>${esc(r.to_city)}</span><em>${r.n}</em></a>`).join('')}</div></div>` : ''}

  <div class="fr-results-head"><h2>${esc(t(kind === 'load' ? 'fr_loads' : 'fr_trucks'))} <small>${esc(t('found_items', { n: num(data.total) }))}</small></h2><button class="btn btn-soft btn-sm" data-sub>${icon('bell')} ${esc(t('fr_subscribe'))}</button></div>
  <div class="fr-list">${data.items.length ? data.items.map(frCard).join('') : `<div class="fr-empty">${icon(kind === 'load' ? 'box' : 'truck')}<b>${esc(t('nothing_found'))}</b><button class="btn btn-primary" data-post="${kind}">${icon('plus')} ${esc(t(kind === 'load' ? 'fr_post_load' : 'fr_post_truck'))}</button></div>`}</div>
  ${pager(data.page, data.pages, (p) => `/fura${qs({ ...query, page: p })}`)}

  <section class="fr-how">
    <h2>${esc(t('fr_how_title'))}</h2>
    <div class="fr-how-grid">
      <div><span class="n">1</span>${icon('plus')}<b>${esc(t('fr_how1'))}</b><p>${esc(t('fr_how1_sub'))}</p></div>
      <div><span class="n">2</span>${icon('target')}<b>${esc(t('fr_how2'))}</b><p>${esc(t('fr_how2_sub'))}</p></div>
      <div><span class="n">3</span>${icon('phone')}<b>${esc(t('fr_how3'))}</b><p>${esc(t('fr_how3_sub'))}</p></div>
    </div>
  </section>`;
  return {
    title: t('sec_fura'),
    html,
    mount(main) {
      const form = $('[data-ff]', main);
      form.onsubmit = (e) => {
        e.preventDefault();
        const q = { tab: query.tab };
        for (const k of ['from_country', 'from_city', 'to_country', 'to_city', 'body', 'weight_min', 'date']) q[k] = form[k].value.trim() || undefined;
        q.adr = form.adr.checked ? '1' : undefined;
        go(`/fura${qs(q)}`);
      };
      main.addEventListener('click', async (e) => {
        if (e.target.closest('[data-swap]')) {
          for (const [a, b] of [['from_country', 'to_country'], ['from_city', 'to_city']]) [form[a].value, form[b].value] = [form[b].value, form[a].value];
          return;
        }
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
      <div class="fr-list">${x.matches_list.length ? x.matches_list.map(frCard).join('') : emptyBox(t('nothing_found'))}</div>
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
