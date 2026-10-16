import { state, t, esc, api, icon, num, qs, fmtRel, initials, openModal, closeModal, toast, debounce, $, $$ } from '../core.js';
import { crumbs, cards, pager, emptyBox, shortCat, regionsOf, requireLogin } from '../ui.js';
import { go, render, onAuthChanged } from '../app.js';
import { ART } from '../art.js';

// Bo'limlar ro'yxati (bosh sahifa, katalog, mobil menyu uchun)
export const SECTIONS = [
  ['transportsale', 'excavator'], ['transportrental', 'calendar'], ['sparepart', 'gear'],
  ['transport-repair', 'wrench'], ['fura', 'truck'],
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
  transportsale: { base: { kind: 'equipment', deal_type: 'sale' }, roots: ['special', 'trucks', 'construction', 'agri'] },
  transportrental: { base: { deal_type: 'rent' }, roots: null },
  sparepart: { base: { kind: 'part' }, roots: null, rubric: 'parts' },
  'transport-repair': { base: { category: 'services' }, rubric: 'services', subs: ['repair', 'maintenance'] },
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
export const transportRepair = ({ query }) => listingSection('transport-repair', query);

// ---------- Mexaniklar va haydovchilar ----------
const rateText = (p) => (p.rate_formatted ? `${p.rate_formatted} ${t(`ru_${p.rate_unit || 'hour'}`)}` : '');
function personCard(p) {
  const tags = [...p.skills.map((k) => t(`sk_${k}`)), ...p.license.map((k) => (k === 'tractor' ? t('lic_tractor') : k === 'special' ? t('lic_special') : k))];
  return `<a class="person" href="/specialist/${p.id}">
    <span class="avatar">${p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : esc(initials(p.name))}</span>
    <div><h4>${esc(p.headline)}</h4>
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
  ${head(kind, `<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-soft" data-post-job>${icon('plus')} ${esc(t('post_vacancy'))}</button><a href="/profile#p-specialist" class="btn btn-primary" data-post-resume>${icon('user')} ${esc(t('post_resume'))}</a></div>`)}
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

// Telefon, yozish, yopish tugmalari (vakansiya va logistika uchun umumiy)
function bindContacts(main, type) {
  main.addEventListener('click', async (e) => {
    const ph = e.target.closest('[data-phone-job],[data-phone-logi]');
    if (ph) {
      if (!requireLogin(onAuthChanged)) return;
      const r = await api(`/contact/${type}/${ph.dataset.phoneJob || ph.dataset.phoneLogi}/phone`, { method: 'POST' });
      ph.outerHTML = `<a class="btn btn-primary btn-sm" href="tel:${esc(r.phone)}">${icon('phone')} ${esc(r.phone)}</a>`;
      return;
    }
    const w = e.target.closest('[data-write]');
    if (w) { if (requireLogin(onAuthChanged)) writeModal(Number(w.dataset.write), w.dataset.ctx); return; }
    const cl = e.target.closest('[data-close-job],[data-close-logi]');
    if (cl) {
      await api(cl.dataset.closeJob ? `/jobs/${cl.dataset.closeJob}/close` : `/logistics/${cl.dataset.closeLogi}/close`, { method: 'POST' });
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
  ${crumbs([[t('home'), '/'], [t(`sec_${p.kind}`), `/${p.kind}`], [p.name || '']])}
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
        ${p.is_owner ? `<a class="btn btn-primary btn-block" href="/profile#p-specialist">${icon('file')} ${esc(t('edit'))}</a>` : `<div class="stack"><button class="btn btn-primary" data-phone>${icon('phone')} <span>${esc(t('show_phone'))}</span></button><button class="btn btn-soft" data-write>${icon('chat')} ${esc(t('write_seller'))}</button></div>`}
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

// ---------- Logistika ----------
function logiCard(x) {
  const pu = x.price_unit ? t(`pu_${x.price_unit}`) : '';
  return `<div class="order">
    <div class="hd"><span class="route">${esc(x.from.city)}${x.to ? ` ${icon('arrow', 'arrow-flip')} ${esc(x.to.city)}` : ''}</span><b style="font-size:16px">${esc(x.price_formatted || '')} <span class="small muted">${esc(x.price_formatted ? pu : '')}</span></b></div>
    <div style="font-weight:600;margin-top:6px">${esc(x.title)}</div>
    <div class="small muted" style="margin-top:4px">${esc([x.cargo_type, x.vehicle_type, x.weight_t ? `${num(x.weight_t)} ${t('u_t')}` : null, x.volume_m3 ? `${num(x.volume_m3)} м³` : null, x.ready_date, x.owner.name, fmtRel(x.created_at)].filter(Boolean).join(' · '))}</div>
    ${x.description ? `<p class="small" style="margin:8px 0 0">${esc(x.description)}</p>` : ''}
    <div class="actions">${x.is_owner ? `<button class="btn btn-ghost btn-sm" data-close-logi="${x.id}">${esc(t('close_request'))}</button>` : `<button class="btn btn-primary btn-sm" data-phone-logi="${x.id}">${icon('phone')} ${esc(t('show_phone'))}</button><button class="btn btn-soft btn-sm" data-write="${x.user_id}" data-ctx="${esc(x.title)}">${icon('chat')} ${esc(t('write_seller'))}</button>`}</div>
  </div>`;
}

async function logisticsSection(s, query) {
  const kind = s === 'cargologistic' ? 'cargo' : 'transport';
  const data = await api(`/logistics${qs({ kind, country: state.country || undefined, q: query.q, from: query.from, page: query.page })}`);
  const path = `/${s}`;
  const html = `
  ${head(s, `<button class="btn btn-primary" data-post>${icon('plus')} ${esc(t(kind === 'cargo' ? 'post_cargo' : 'post_transport'))}</button>`)}
  <div class="tabs"><a class="tab ${kind === 'cargo' ? 'on' : ''}" href="/cargologistic">${esc(t('cargo_tab'))}</a><a class="tab ${kind === 'transport' ? 'on' : ''}" href="/transportlogistic">${esc(t('transport_tab'))}</a></div>
  <form class="box" data-lf style="display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end;padding:14px 16px">
    <div><label class="lbl">${esc(t('route_from'))}</label><input class="input" name="from" value="${esc(query.from || '')}"></div>
    <div><label class="lbl">${esc(t('cargo_type'))}</label><input class="input" name="q" value="${esc(query.q || '')}"></div>
    <button class="btn btn-primary">${icon('search')} ${esc(t('find'))}</button>
  </form>
  <div class="results-head" style="margin-top:14px"><h2>${esc(t('found_items', { n: num(data.total) }))}</h2></div>
  ${data.items.length ? data.items.map(logiCard).join('') : emptyBox(t('nothing_found'))}
  ${pager(data.page, data.pages, (p) => `${path}${qs({ ...query, page: p })}`)}`;
  return {
    title: t(`sec_${s}`),
    html,
    mount(main) {
      $('[data-lf]', main).onsubmit = (e) => { e.preventDefault(); nav(path, { from: e.target.from.value.trim() || undefined, q: e.target.q.value.trim() || undefined }); };
      $('[data-post]', main).onclick = () => { if (requireLogin(onAuthChanged)) logiModal(kind, s); };
      bindContacts(main, 'logistics');
    },
  };
}
export const cargologistic = ({ query }) => logisticsSection('cargologistic', query);
export const transportlogistic = ({ query }) => logisticsSection('transportlogistic', query);

function logiModal(kind, s) {
  const m = openModal(`<h3>${esc(t(kind === 'cargo' ? 'post_cargo' : 'post_transport'))}</h3>
    <form class="form-grid" style="margin-top:12px">
      <div class="full"><label class="lbl">${esc(t('request_title'))} *</label><input class="input" name="title" required minlength="5" maxlength="120"></div>
      <div><label class="lbl">${esc(t('route_from'))} *</label><input class="input" name="from_city" required></div>
      <div><label class="lbl">${esc(t('route_to'))}</label><input class="input" name="to_city"></div>
      <div><label class="lbl">${esc(t(kind === 'cargo' ? 'cargo_type' : 'vehicle_type'))}</label><input class="input" name="type"></div>
      <div><label class="lbl">${esc(t('weight_t'))}</label><input class="input" name="weight_t" inputmode="decimal"></div>
      ${kind === 'cargo' ? `<div><label class="lbl">${esc(t('ready_date'))}</label><input class="input" name="ready_date"></div>` : `<div><label class="lbl">${esc(t('volume_m3'))}</label><input class="input" name="volume_m3" inputmode="decimal"></div>`}
      <div><label class="lbl">${esc(t('price'))}</label><div class="row2i"><input class="input" name="price" inputmode="numeric"><select class="input" name="price_unit">${['total', 'km', 'ton', 'hour'].map((u) => `<option value="${u}">${esc(t(`pu_${u}`))}</option>`).join('')}</select></div></div>
      <div class="full"><label class="lbl">${esc(t('description'))}</label><textarea class="input" name="description" style="min-height:70px"></textarea></div>
      <div class="full"><button class="btn btn-primary btn-block">${esc(t('publish_short'))}</button></div>
    </form>`, { wide: true });
  m.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const num2 = (v) => v.replace(/\s/g, '').replace(',', '.') || undefined;
    await api('/logistics', { method: 'POST', body: { kind, title: f.title.value.trim(), from_city: f.from_city.value.trim(), to_city: f.to_city.value.trim() || undefined, [kind === 'cargo' ? 'cargo_type' : 'vehicle_type']: f.type.value.trim() || undefined, weight_t: num2(f.weight_t.value), volume_m3: f.volume_m3 ? num2(f.volume_m3.value) : undefined, ready_date: f.ready_date ? f.ready_date.value.trim() || undefined : undefined, price: num2(f.price.value), price_unit: f.price_unit.value, description: f.description.value.trim() || undefined } });
    closeModal();
    toast(t('published'), 'ok');
    render({ keepScroll: true });
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

export { personCard, debounce };
