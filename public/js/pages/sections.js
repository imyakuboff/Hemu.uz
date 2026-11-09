import { state, t, esc, api, icon, num, qs, fmtRel, initials, openModal, closeModal, toast, debounce, $, $$ } from '../core.js';
import { crumbs, cards, pager, emptyBox, shortCat, regionsOf, requireLogin } from '../ui.js';
import { go, render, onAuthChanged } from '../app.js';
import { ART } from '../art.js';
import { pushCard } from '../features.js';

// Bo'limlar ro'yxati (bosh sahifa, katalog, mobil menyu uchun)
export const SECTIONS = [
  ['transportsale', 'excavator'], ['transportrental', 'calendar'], ['sparepart', 'gear'],
  ['mechanic', 'gear'], ['driver', 'user'], ['application', 'clipboard'],
];
const secKey = (s) => (s === 'transport-repair' ? 'repair' : s);
// Bento-panjara: har bir bo'limda rangli rasm (art.js)
export function sectionsGrid(counts = {}) {
  return `<div class="sections bento">${SECTIONS.map(([s]) => `<a class="section-tile st-${s}" href="/${s}"><div class="st-text"><b>${esc(t(`sec_${secKey(s)}`))}</b><span>${esc(t(`sec_${secKey(s)}_sub`))}</span></div>${counts[s] ? `<span class="n">${num(counts[s])}</span>` : ''}${ART[s] || ''}</a>`).join('')}</div>`;
}

const head = (s, extra = '') => `${crumbs([[t('home'), '/'], [t('sec_title'), '/categories'], [t(`sec_${secKey(s)}`)]])}
  <div class="page-head" style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-end">
    <div><h1 class="page-title">${esc(t(`sec_${secKey(s)}`))}</h1><p class="page-sub">${esc(t(`sec_${secKey(s)}_sub`))}</p></div>${extra}</div>`;

const nav = (path, q) => { history.pushState(null, '', `${path}${qs(q)}`); render({ keepScroll: true }); };
const regionSel = async (val) => {
  const cc = state.country || state.user?.country || 'UZ';
  const regs = await regionsOf(cc);
  return `<select class="input" name="region" style="width:auto;min-width:180px"><option value="">${esc(state.meta.countries.find((c) => c.code === cc)?.name || '')}</option>${regs.map((r) => `<option value="${r.code}" ${r.code === val ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>`;
};

// ---------- Texnika sotuvi, ijara, ehtiyot qismlar, ta'mirlash ----------
const PRESETS = {
  transportsale: { base: { kind: 'equipment', deal_type: 'sale' }, roots: ['special', 'trucks', 'construction'] },
  transportrental: { base: { deal_type: 'rent' }, roots: null },
  sparepart: { base: { kind: 'part' }, roots: null, rubric: 'parts' },
};

async function listingSection(s, query) {
  const p = PRESETS[s];
  const q = { ...query };
  const country = state.country || undefined;
  const params = { ...p.base, country, region: q.region, q: q.q, brand: q.brand, sort: q.sort, page: q.page, per_page: 24, facets: 1, with_operator: q.with_operator };
  if (q.cat) params.category = q.cat;
  else if (p.subs) params.subcategory = p.subs.join(',');
  const [res, mech] = await Promise.all([
    api(`/listings${qs(params)}`),
    s === 'transport-repair' ? api(`/specialists${qs({ kind: 'mechanic', country, per_page: 4 })}`) : null,
  ]);
  const root = p.rubric ? state.cats.find((c) => c.slug === p.rubric) : null;
  const chips = p.roots
    ? state.cats.filter((c) => p.roots.includes(c.slug)).map((c) => [c.slug, shortCat(c)])
    : root ? root.children.filter((c) => !p.subs || p.subs.includes(c.slug)).map((c) => [c.slug, c.name]) : [];
  const path = `/${s}`;
  const html = `
  ${head(s, `<a href="/create" class="btn btn-primary">${icon('plus')} ${esc(t('post_listing'))}</a>`)}
  ${s === 'transportrental' ? `<a class="urgent-cta" href="/urgent" style="margin-bottom:14px">${icon('bolt')}<span><b>${esc(t('urgent_title'))}</b><small>${esc(t('urgent_cta_sub'))}</small></span></a>` : ''}
  <form class="search" data-sq style="margin-bottom:14px">${icon('search')}<input name="q" value="${esc(q.q || '')}" placeholder="${esc(t('search_ph'))}"><button class="btn btn-primary">${esc(t('find'))}</button></form>
  ${chips.length ? `<div class="lbl" style="margin-bottom:6px">${esc(t(p.rubric ? 'by_rubric' : 'category'))}</div><div class="chips"><a class="chip ${!q.cat ? 'on' : ''}" href="${path}${qs({ ...q, cat: undefined, page: undefined })}">${esc(t('all'))}</a>${chips.map(([v, l]) => `<a class="chip ${q.cat === v ? 'on' : ''}" href="${path}${qs({ ...q, cat: v, page: undefined })}">${esc(l)}</a>`).join('')}</div>` : ''}
  ${res.facets.brands.length ? `<div class="lbl" style="margin:14px 0 6px">${esc(t('by_brand'))}</div><div class="chips small" style="gap:4px">${res.facets.brands.slice(0, 14).map((b) => `<a class="chip ${q.brand === b.value ? 'on' : ''}" href="${path}${qs({ ...q, brand: q.brand === b.value ? undefined : b.value, page: undefined })}">${esc(b.value)} <span class="muted">${b.count}</span></a>`).join('')}</div>` : ''}
  <div class="results-head" style="margin-top:18px;flex-wrap:wrap"><h2>${esc(t('found_n', { n: num(res.total) }))}</h2>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      ${s === 'transportrental' ? `<label class="check" style="margin:0"><input type="checkbox" data-op ${q.with_operator ? 'checked' : ''}> ${esc(t('with_operator'))}</label>` : ''}
      ${await regionSel(q.region)}
      <select class="sort-select" data-sort>${['new', 'price_asc', 'price_desc', 'popular'].map((x) => `<option value="${x}" ${(q.sort || 'new') === x ? 'selected' : ''}>${esc(t(x === 'new' ? 'sort_actual' : `sort_${x}`))}</option>`).join('')}</select>
    </div></div>
  ${res.items.length ? cards(res.items, 4) : emptyBox(t('nothing_found'), t('nothing_found_sub'))}
  ${pager(res.page, res.pages, (pg) => `${path}${qs({ ...q, page: pg })}`)}
  ${mech ? `<section class="sec"><div class="sec-head"><div><h2>${esc(t('nearby_mechanics'))}</h2></div><a class="pill-link" href="/mechanic">${icon('arrow', 'arrow-flip')} ${esc(t('see_all'))}</a></div>${mech.items.map(personCard).join('') || emptyBox(t('empty'))}</section>` : ''}`;
  return {
    title: t(`sec_${secKey(s)}`),
    html,
    mount(main) {
      $('[data-sq]', main).onsubmit = (e) => { e.preventDefault(); nav(path, { ...q, q: e.target.q.value.trim() || undefined, page: undefined }); };
      $('[data-sort]', main).onchange = (e) => nav(path, { ...q, sort: e.target.value, page: undefined });
      $('[name=region]', main).onchange = (e) => nav(path, { ...q, region: e.target.value || undefined, page: undefined });
      $('[data-op]', main)?.addEventListener('change', (e) => nav(path, { ...q, with_operator: e.target.checked ? '1' : undefined, page: undefined }));
    },
  };
}
export const transportsale = ({ query }) => listingSection('transportsale', query);
export const transportrental = ({ query }) => listingSection('transportrental', query);
export const sparepart = ({ query }) => listingSection('sparepart', query);

// ---------- Mexaniklar va haydovchilar ----------
const rateText = (p) => (p.rate_formatted ? `${p.rate_formatted} ${t(`ru_${p.rate_unit || 'hour'}`)}` : '');
function personCard(p) {
  const tags = [...p.skills.map((k) => t(`sk_${k}`)), ...p.license.map((k) => (k === 'tractor' ? t('lic_tractor') : k === 'special' ? t('lic_special') : k))];
  return `<a class="person" href="/specialist/${p.id}">
    <span class="avatar">${p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : esc(initials(p.name))}</span>
    <div><h4>${p.demo ? `<span class="tag grey demo-tag">${esc(t('demo_tag'))}</span> ` : ''}${esc(p.headline)}</h4>
      <div class="m">${esc([p.name, p.experience_years ? t('years_exp', { n: p.experience_years }) : null, p.location.city || p.location.region_name].filter(Boolean).join(' · '))}</div>
      <div class="chips" style="gap:4px;margin-top:8px">${tags.slice(0, 6).map((x) => `<span class="chip-x">${esc(x)}</span>`).join('')}${p.mobile ? `<span class="tag green">${esc(t('mobile_badge'))}</span>` : ''}${p.available ? `<span class="tag">${esc(t('available_lbl'))}</span>` : ''}</div>
      ${p.reviews_count ? `<div class="rating">★ ${String(p.rating).replace('.', ',')} · ${esc(t('reviews', { n: p.reviews_count }))}</div>` : ''}</div>
    <div class="rate">${esc(rateText(p))}</div>
  </a>`;
}
function jobCard(j) {
  return `<div class="order">
    <div class="hd"><span style="font-size:15px">${esc(j.title)}</span><b style="font-size:15px">${esc(j.salary.formatted || '')}${j.salary.formatted ? ` ${esc(t(`ru_${j.salary.unit || 'month'}`))}` : ''}</b></div>
    <div class="small muted" style="margin-top:6px">${esc([j.employer.name, j.location.city || j.location.region_name, j.schedule, fmtRel(j.created_at)].filter(Boolean).join(' · '))}${j.employer.verified ? ` <span class="tag green">${esc(t('company_verified'))}</span>` : ''}</div>
    <p class="small" style="margin:8px 0 0">${esc(j.description)}</p>
    <div class="actions">${j.is_owner ? `<button class="btn btn-ghost btn-sm" data-close-job="${j.id}">${esc(t('close_request'))}</button>` : `<button class="btn btn-primary btn-sm" data-phone-job="${j.id}">${icon('phone')} ${esc(t('show_phone'))}</button><button class="btn btn-soft btn-sm" data-write="${j.user_id}" data-ctx="${esc(j.title)}">${icon('chat')} ${esc(t('write_seller'))}</button>`}</div>
  </div>`;
}

async function peopleSection(kind, query) {
  const tab = query.tab === 'jobs' ? 'jobs' : 'people';
  const opts = await api('/specialists/options');
  const skills = kind === 'mechanic' ? opts.mechanic_skills : opts.driver_skills;
  const country = state.country || undefined;
  const data = tab === 'jobs'
    ? await api(`/jobs${qs({ kind, country, q: query.q, page: query.page })}`)
    : await api(`/specialists${qs({ kind, country, q: query.q, skill: query.skill, license: query.license, mobile: query.mobile, page: query.page })}`);
  const path = `/${kind}`;
  const html = `
  ${head(kind, `<div style="display:flex;gap:8px;flex-wrap:wrap">${kind === 'mechanic' ? `<a href="/request/new?want=service" class="btn btn-primary">${icon('gear')} ${esc(t('call_mechanic'))}</a>` : ''}<button class="btn btn-soft" data-post-job>${icon('plus')} ${esc(t('post_vacancy'))}</button><a href="/resume?kind=${kind}" class="btn btn-soft" data-post-resume>${icon('user')} ${esc(t('post_resume'))}</a></div>`)}
  ${['mechanic', 'driver'].includes(state.user?.account_type) || state.user?.specialist ? pushCard('push_card_mech') : ''}
  <div class="tabs"><a class="tab ${tab === 'people' ? 'on' : ''}" href="${path}">${esc(t('resumes_tab'))}</a><a class="tab ${tab === 'jobs' ? 'on' : ''}" href="${path}?tab=jobs">${esc(t('vacancies_tab'))}</a></div>
  <form class="search" data-sq style="margin-bottom:12px">${icon('search')}<input name="q" value="${esc(query.q || '')}" placeholder="${esc(t(tab === 'people' ? 'search_resumes' : 'search_jobs'))}"><button class="btn btn-primary">${esc(t('find'))}</button></form>
  ${tab === 'people' ? `<div class="lbl" style="margin-bottom:6px">${esc(t(kind === 'driver' ? 'skills_driver' : 'skills_mechanic'))}</div><div class="chips" style="margin-bottom:12px">${skills.map((k) => `<a class="chip ${query.skill === k ? 'on' : ''}" href="${path}${qs({ ...query, skill: query.skill === k ? undefined : k, page: undefined })}">${esc(t(`sk_${k}`))}</a>`).join('')}</div>
    ${kind === 'driver' ? `<div class="lbl" style="margin-bottom:6px">${esc(t('license_cats'))}</div><div class="chips" style="margin-bottom:6px">${opts.licenses.map((k) => `<a class="chip ${query.license === k ? 'on' : ''}" href="${path}${qs({ ...query, license: query.license === k ? undefined : k, page: undefined })}">${esc(k === 'tractor' ? t('lic_tractor') : k === 'special' ? t('lic_special') : k)}</a>`).join('')}</div>`
      : `<label class="check"><input type="checkbox" data-mobile ${query.mobile ? 'checked' : ''}> ${esc(t('mobile_lbl'))}</label>`}` : ''}
  <div class="results-head" style="margin-top:10px"><h2>${esc(t('found_items', { n: num(data.total) }))}</h2></div>
  ${data.items.length ? (tab === 'jobs' ? data.items.map(jobCard).join('') : data.items.map(personCard).join('')) : emptyBox(t('nothing_found'))}
  ${pager(data.page, data.pages, (p) => `${path}${qs({ ...query, page: p })}`)}`;
  return {
    title: t(`sec_${kind}`),
    html,
    mount(main) {
      $('[data-sq]', main).onsubmit = (e) => { e.preventDefault(); nav(path, { ...query, q: e.target.q.value.trim() || undefined, page: undefined }); };
      $('[data-mobile]', main)?.addEventListener('change', (e) => nav(path, { ...query, mobile: e.target.checked ? '1' : undefined }));
      $('[data-post-job]', main).onclick = () => { if (requireLogin(onAuthChanged)) jobModal(kind, skills); };
      bindContacts(main, 'job');
    },
  };
}
export const driver = ({ query }) => peopleSection('driver', query);
export const mechanic = ({ query }) => peopleSection('mechanic', query);

// Telefon, yozish, yopish tugmalari (vakansiyalar uchun)
function bindContacts(main, type) {
  main.addEventListener('click', async (e) => {
    const ph = e.target.closest('[data-phone-job]');
    if (ph) {
      if (!requireLogin(onAuthChanged)) return;
      const r = await api(`/contact/${type}/${ph.dataset.phoneJob}/phone`, { method: 'POST' });
      ph.outerHTML = `<a class="btn btn-primary btn-sm" href="tel:${esc(r.phone)}">${icon('phone')} ${esc(r.phone)}</a>`;
      return;
    }
    const w = e.target.closest('[data-write]');
    if (w) { if (requireLogin(onAuthChanged)) writeModal(Number(w.dataset.write), w.dataset.ctx); return; }
    const cl = e.target.closest('[data-close-job]');
    if (cl) {
      await api(`/jobs/${cl.dataset.closeJob}/close`, { method: 'POST' });
      render({ keepScroll: true });
    }
  });
}

export function writeModal(userId, context) {
  const m = openModal(`<h3>${esc(t('write_seller'))}</h3><p class="small muted">${esc(context || '')}</p>
    <form><textarea class="input" name="body" required maxlength="4000" placeholder="${esc(t('type_msg'))}"></textarea>
    <button class="btn btn-primary btn-block" style="margin-top:12px">${icon('send')} ${esc(t('send'))}</button></form>`);
  m.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const c = await api('/conversations/direct', { method: 'POST', body: { user_id: userId, body: e.target.body.value.trim(), context } });
    closeModal();
    go(`/messages/${c.id}`);
  };
}

function jobModal(kind, skills) {
  const m = openModal(`<h3>${esc(t('post_vacancy'))}</h3>
    <form class="form-grid" style="margin-top:12px">
      <div class="full"><label class="lbl">${esc(t('request_title'))} *</label><input class="input" name="title" required minlength="5" maxlength="120"></div>
      <div class="full"><label class="lbl">${esc(t('description'))} *</label><textarea class="input" name="description" required minlength="10" style="min-height:90px"></textarea></div>
      <div class="full"><div class="pick-grid">${skills.map((k) => `<label class="pick"><input type="checkbox" name="req" value="${k}"><span>${esc(t(`sk_${k}`))}</span></label>`).join('')}</div></div>
      <div><label class="lbl">${esc(t('salary'))} (${esc(t('from'))})</label><input class="input" name="salary_min" inputmode="numeric"></div>
      <div><label class="lbl">${esc(t('salary'))} (${esc(t('to'))})</label><input class="input" name="salary_max" inputmode="numeric"></div>
      <div><label class="lbl">${esc(t('schedule'))}</label><input class="input" name="schedule" placeholder="5/2, вахта 15/15"></div>
      <div><label class="lbl">${esc(t('city'))}</label><input class="input" name="city"></div>
      <div class="full"><button class="btn btn-primary btn-block">${esc(t('publish_short'))}</button></div>
    </form>`, { wide: true });
  m.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    await api('/jobs', { method: 'POST', body: { kind, title: f.title.value.trim(), description: f.description.value.trim(), requirements: $$('[name=req]:checked', f).map((x) => x.value), salary_min: f.salary_min.value.replace(/\s/g, '') || undefined, salary_max: f.salary_max.value.replace(/\s/g, '') || undefined, salary_unit: 'month', schedule: f.schedule.value.trim() || undefined, city: f.city.value.trim() || undefined } });
    closeModal();
    toast(t('published'), 'ok');
    go(`/${kind}?tab=jobs`);
  };
}

// ---------- Mutaxassis profili ----------
export async function specialist({ params }) {
  const p = await api(`/specialists/${params[0]}`);
  const tags = (arr, fn) => arr.map((x) => `<span class="chip-x">${esc(fn(x))}</span>`).join('');
  const html = `
  ${crumbs([[t('home'), '/'], [t(`sec_${p.kind}`), `/${p.kind}`], [p.name || p.headline]])}
  <div class="detail">
    <div>
      <div class="box" style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
        <span class="avatar" style="width:84px;height:84px;font-size:26px">${p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : esc(initials(p.name))}</span>
        <div style="flex:1;min-width:220px"><span class="tag">${esc(t(p.kind === 'driver' ? 'type_driver' : 'type_mechanic'))}</span>
          <h1 style="font-size:26px;margin:6px 0 4px">${esc(p.headline)}</h1>
          <div class="small muted">${esc([p.name, p.experience_years ? t('years_exp', { n: p.experience_years }) : null, [p.location.city, p.location.region_name, p.location.country_name].filter(Boolean).join(', ')].filter(Boolean).join(' · '))}</div></div>
      </div>
      <div class="box"><h3>${esc(t(p.kind === 'driver' ? 'skills_driver' : 'skills_mechanic'))}</h3><div class="chips" style="gap:6px">${tags(p.skills, (k) => t(`sk_${k}`))}</div>
        ${p.license.length ? `<h3 style="margin-top:16px">${esc(t('license_cats'))}</h3><div class="chips" style="gap:6px">${tags(p.license, (k) => (k === 'tractor' ? t('lic_tractor') : k === 'special' ? t('lic_special') : k))}</div>` : ''}
        ${p.brands.length ? `<h3 style="margin-top:16px">${esc(t('brands_h'))}</h3><div class="chips" style="gap:6px">${tags(p.brands, (x) => x)}</div>` : ''}</div>
      ${p.about ? `<div class="box"><h3>${esc(t('description'))}</h3><div class="prose">${esc(p.about)}</div></div>` : ''}
    </div>
    <aside>
      <div class="side-card">
        <div class="big-price">${esc(rateText(p) || '—')}</div>
        <div style="margin:10px 0">${p.available ? `<span class="tag green">${esc(t('available_lbl'))}</span>` : ''} ${p.mobile ? `<span class="tag">${esc(t('mobile_badge'))}</span>` : ''}</div>
        ${p.is_owner ? `<a class="btn btn-primary btn-block" href="/resume?kind=${p.kind}">${icon('file')} ${esc(t('edit'))}</a>` : p.demo ? `<div class="note" style="margin:0"><div><b>${esc(t('demo_tag'))}</b><p class="small">${esc(t('demo_note'))}</p><a class="btn btn-primary btn-sm" style="margin-top:8px" href="/resume?kind=${p.kind}">${esc(t('res_title'))}</a></div></div>` : `<div class="stack"><button class="btn btn-primary" data-phone>${icon('phone')} <span>${esc(t('show_phone'))}</span></button><button class="btn btn-soft" data-write>${icon('chat')} ${esc(t('write_seller'))}</button></div>`}
        <p class="tiny muted" style="margin:12px 0 0">${esc(t('on_platform', { y: p.since }))} · ${esc(t('views_n', { n: num(p.views) }))}</p>
      </div>
    </aside>
  </div>`;
  return {
    title: p.headline,
    html,
    mount(main) {
      $('[data-phone]', main)?.addEventListener('click', async (e) => {
        if (!requireLogin(onAuthChanged)) return;
        const r = await api(`/specialists/${p.id}/phone`, { method: 'POST' });
        e.currentTarget.outerHTML = `<a class="btn btn-primary" href="tel:${esc(r.phone)}">${icon('phone')} ${esc(r.phone)}</a>`;
      });
      $('[data-write]', main)?.addEventListener('click', () => { if (requireLogin(onAuthChanged)) writeModal(p.user_id, p.headline); });
    },
  };
}

// ---------- Zayavkalar: mos e'lonlar bilan ----------
export async function application({ query }) {
  const data = await api(`/requests${qs({ country: state.country || undefined, page: query.page, per_page: 10 })}`);
  const matches = await Promise.all(data.items.map((r) => api(`/requests/${r.id}/matches`, { silent: true }).catch(() => [])));
  const html = `
  ${head('application', `<a href="/request/new" class="btn btn-primary">${icon('plus')} ${esc(t('create_request'))}</a>`)}
  ${data.items.length ? data.items.map((r, i) => `<div class="box">
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><h3 style="margin:0">${esc(r.title)}</h3><span class="tiny muted">${esc(fmtRel(r.created_at))}</span></div>
    <div class="small muted" style="margin-top:6px">${esc([r.category?.name, r.subcategory?.name, r.location.region_name || r.location.country_name, r.quantity, r.budget.formatted ? `${t('budget')}: ${r.budget.formatted}` : null, r.needed_by].filter(Boolean).join(' · '))}</div>
    <p class="small" style="margin:8px 0 0">${esc(r.description)}</p>
    <div class="actions"><span class="tag grey">${esc(t('offers_n', { n: r.offers_count }))}</span>${r.is_owner ? '' : `<a class="btn btn-primary btn-sm" href="/requests">${esc(t('make_offer'))}</a>`}</div>
    ${matches[i].length ? `<h4 style="margin:16px 0 10px;font-size:14px">${icon('target')} ${esc(t('matching_offers'))}</h4>${cards(matches[i].slice(0, 4), 4)}` : ''}
  </div>`).join('') : emptyBox(t('empty'))}
  ${pager(data.page, data.pages, (p) => `/application${qs({ page: p })}`)}`;
  return { title: t('sec_application'), html };
}

// ---------- Rezyume joylash (haydovchi / mexanik) — oddiy, bosib tanlanadigan forma ----------
const EXP = [[0, 'res_exp_0'], [2, 'res_exp_1_3'], [4, 'res_exp_3_5'], [7, 'res_exp_5_10'], [12, 'res_exp_10']];
const expBucket = (n) => (n === null || n === undefined ? null : n < 1 ? 0 : n <= 3 ? 2 : n <= 5 ? 4 : n <= 10 ? 7 : 12);
export async function resume({ query }) {
  if (!state.user) {
    return {
      title: t('res_title'),
      html: `<div class="box empty" style="max-width:520px;margin:20px auto"><h3>${esc(t('res_title'))}</h3><p class="muted">${esc(t('res_login'))}</p><button class="btn btn-primary" data-login style="margin-top:14px">${esc(t('login'))}</button></div>`,
    };
  }
  const [opts, spec] = await Promise.all([api('/specialists/options'), api('/me/specialist', { silent: true }).catch(() => null)]);
  let kind = query.kind === 'mechanic' || query.kind === 'driver' ? query.kind : spec?.kind || (state.user.account_type === 'mechanic' ? 'mechanic' : 'driver');
  const country = spec?.location?.country || state.user.country || 'UZ';
  const regs = await regionsOf(country);
  const reg = spec?.location?.region || state.region || '';
  const exp = expBucket(spec?.experience_years);
  const chip = (name, v, label, on) => `<label class="res-chip"><input type="checkbox" name="${name}" value="${esc(v)}" ${on ? 'checked' : ''}><span>${esc(label)}</span></label>`;
  const radio = (name, v, label, on) => `<label class="res-chip"><input type="radio" name="${name}" value="${esc(v)}" ${on ? 'checked' : ''}><span>${esc(label)}</span></label>`;
  const licLabel = (x) => (x === 'tractor' ? t('lic_tractor') : x === 'special' ? t('lic_special') : x);
  const skillsHtml = (k) => (k === 'driver' ? opts.driver_skills : opts.mechanic_skills)
    .map((x) => chip('skills', x, t(`sk_${x}`), spec?.kind === k && spec.skills?.includes(x))).join('');
  const html = `
  ${crumbs([[t('home'), '/'], [t(kind === 'driver' ? 'sec_driver' : 'sec_mechanic'), `/${kind}`], [t('res_title')]])}
  <div class="page-head"><h1 class="page-title">${esc(t(spec ? 'res_title_edit' : 'res_title'))}</h1><p class="page-sub">${esc(t('res_sub'))}</p></div>
  <form class="res-form" data-res novalidate>
    ${state.user.name ? '' : `<div class="box"><h3>${esc(t('your_name'))} <span class="req">*</span></h3><input class="input" name="name" maxlength="80" autocomplete="name" placeholder="${esc(t('res_name_ph'))}"></div>`}
    <div class="box"><h3>${esc(t('res_who'))}</h3>
      <div class="seg res-kind" data-kind><button type="button" data-v="driver" class="${kind === 'driver' ? 'on' : ''}">${icon('user')} ${esc(t('type_driver'))}</button><button type="button" data-v="mechanic" class="${kind === 'mechanic' ? 'on' : ''}">${icon('gear')} ${esc(t('type_mechanic'))}</button></div>
    </div>
    <div class="box"><h3 data-skills-h>${esc(t(kind === 'driver' ? 'res_q_driver' : 'res_q_mech'))} <span class="req">*</span></h3><p class="tiny muted" style="margin:-6px 0 10px">${esc(t('res_many'))}</p>
      <div class="res-chips" data-skills>${skillsHtml(kind)}</div></div>
    <div class="box" data-lic ${kind === 'driver' ? '' : 'hidden'}><h3>${esc(t('license_cats'))}</h3>
      <div class="res-chips">${opts.licenses.map((x) => chip('license', x, licLabel(x), spec?.license?.includes(x))).join('')}</div></div>
    <div class="box"><h3>${esc(t('experience'))}</h3>
      <div class="res-chips">${EXP.map(([v, k]) => radio('exp', v, t(k), exp === v)).join('')}</div></div>
    <div class="box"><h3>${esc(t('res_where'))} <span class="req">*</span></h3>
      <select class="input" name="region"><option value="">${esc(t('choose'))}</option>${regs.map((r) => `<option value="${r.code}" ${r.code === reg ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>
      <label class="check" style="margin-top:12px"><input type="checkbox" name="mobile" ${spec ? (spec.mobile ? 'checked' : '') : 'checked'}> ${esc(t(kind === 'driver' ? 'res_travel' : 'mobile_lbl'))}</label></div>
    <div class="box"><h3>${esc(t('res_pay'))} <span class="tiny muted" style="font-weight:400">· ${esc(t('optional'))}</span></h3>
      <div class="row2i"><input class="input" name="rate" inputmode="numeric" placeholder="${esc(t('rate_lbl'))}" value="${esc(spec?.rate ?? '')}">
        <select class="input" name="rate_unit">${opts.rate_units.map((x) => `<option value="${x}" ${x === (spec?.rate_unit || (kind === 'driver' ? 'month' : 'hour')) ? 'selected' : ''}>${esc(t(`ru_${x}`))}</option>`).join('')}</select></div>
      <details class="more-box" ${spec?.about ? 'open' : ''}><summary>${esc(t('res_about_more'))}</summary>
        <textarea class="input" name="about" maxlength="3000" rows="3" placeholder="${esc(t('res_about_ph'))}">${esc(spec?.about || '')}</textarea></details>
    </div>
    <div class="box res-submit">
      <p class="small" style="margin:0 0 10px">${icon('phone')} ${esc(t('res_phone', { p: state.user.phone || '' }))}</p>
      <button class="btn btn-primary btn-block btn-lg">${esc(t(spec ? 'save_changes' : 'res_publish'))}</button>
    </div>
  </form>`;
  return {
    title: t('res_title'),
    html,
    mount(main) {
      const form = $('[data-res]', main);
      $('[data-kind]', main).addEventListener('click', (e) => {
        const b = e.target.closest('[data-v]');
        if (!b || b.dataset.v === kind) return;
        kind = b.dataset.v;
        $$('[data-kind] [data-v]', main).forEach((x) => x.classList.toggle('on', x === b));
        $('[data-skills]', main).innerHTML = skillsHtml(kind);
        $('[data-skills-h]', main).firstChild.textContent = `${t(kind === 'driver' ? 'res_q_driver' : 'res_q_mech')} `;
        $('[data-lic]', main).hidden = kind !== 'driver';
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const vals = (n) => $$(`[name="${n}"]:checked`, form).map((x) => x.value);
        const skills = vals('skills');
        if (!skills.length) { toast(t('res_need_skill'), 'err'); $('[data-skills]', main).scrollIntoView({ block: 'center' }); return; }
        if (form.name && form.name.value.trim().length < 2) { toast(t('res_need_name'), 'err'); form.name.focus(); return; }
        if (!form.region.value) { toast(t('res_need_region'), 'err'); form.region.focus(); return; }
        const expV = vals('exp')[0];
        const list = skills.slice(0, 3).map((x) => t(`sk_${x}`)).join(', ');
        const headline = `${t(kind === 'driver' ? 'res_head_driver' : 'res_head_mech', { list })}`.slice(0, 120);
        const rate = Number(String(form.rate.value).replace(/[^\d.]/g, ''));
        const btn = $('button.btn-primary', form);
        btn.disabled = true;
        try {
          if (form.name) state.user = await api('/me', { method: 'PATCH', body: { name: form.name.value.trim() } });
          const r = await api('/me/specialist', { method: 'PUT', body: {
            kind, headline, skills, license: kind === 'driver' ? vals('license') : [],
            experience_years: expV !== undefined ? Number(expV) : undefined,
            region: form.region.value, mobile: form.mobile.checked, available: true,
            rate: rate > 0 ? rate : undefined, rate_unit: form.rate_unit.value, about: form.about.value.trim() || undefined,
            ...(spec?.status === 'hidden' ? {} : { hidden: false }),
          } });
          state.user.account_type = state.user.account_type === 'client' ? kind : state.user.account_type;
          toast(t('res_done'), 'ok');
          go(`/specialist/${r.id}`);
        } finally { btn.disabled = false; }
      });
    },
  };
}

export { personCard, debounce };
