import { state, t, esc, api, icon, num, qs, debounce, toast, $, $$ } from '../core.js';
import { cards, crumbs, pager, shortCat, regionsOf, emptyBox } from '../ui.js';
import { go, render } from '../app.js';
import { mapWidget, geolocate } from '../features.js';

// Kategoriya slug bo'yicha: { root, sub }
export function findCat(slug) {
  for (const r of state.cats || []) {
    if (r.slug === slug) return { root: r, sub: null };
    const s = r.children.find((c) => c.slug === slug);
    if (s) return { root: r, sub: s };
  }
  return { root: null, sub: null };
}

const nav = (q) => {
  history.pushState(null, '', `${location.pathname}${qs(q)}`);
  render({ keepScroll: true });
};

// So'rovga joylashuvni qo'shish (yuqori qatordagi tanlov)
const withGeo = (q) => ({ country: state.country || undefined, region: state.region || undefined, ...q });

async function regionOptions(country, selected) {
  if (!country) {
    return `<option value="">${esc(t('loc_all'))}</option>${state.meta.countries.map((c) => `<option value="country:${c.code}">${esc(c.name)}</option>`).join('')}`;
  }
  const regs = await regionsOf(country);
  const cn = state.meta.countries.find((c) => c.code === country);
  return `<option value="country:">${esc(t('loc_all'))}</option><option value="" ${!selected ? 'selected' : ''}>${esc(cn.name)}</option>${regs.map((r) => `<option value="${r.code}" ${r.code === selected ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}`;
}

function applyRegion(q, v) {
  const n = { ...q };
  delete n.page;
  if (v.startsWith('country:')) {
    const c = v.slice(8);
    n.country = c || undefined;
    n.region = undefined;
    if (!c) { state.country = ''; state.region = ''; try { localStorage.setItem('mx_country', ''); localStorage.setItem('mx_region', ''); } catch { /* */ } }
  } else n.region = v || undefined;
  return n;
}

function activeChips(q, facets) {
  const out = [];
  const add = (key, label) => out.push(`<button class="chip-x" data-rm="${key}">${esc(label)} ${icon('x')}</button>`);
  const geo = withGeo(q);
  if (geo.region) add('region', state.regions?.[geo.country]?.find((r) => r.code === geo.region)?.name || geo.region);
  else if (geo.country) add('country', state.meta.countries.find((c) => c.code === geo.country)?.name || geo.country);
  if (q.year_min) add('year_min', `${t('from')} ${q.year_min}`);
  if (q.year_max) add('year_max', `${t('to')} ${q.year_max}`);
  if (q.price_min) add('price_min', `${t('from')} ${num(q.price_min)}`);
  if (q.price_max) add('price_max', `${t('to')} ${num(q.price_max)}`);
  if (q.condition) add('condition', q.condition.split(',').map((c) => state.meta.conditions.find((x) => x.value === c)?.label).join(', '));
  if (q.brand) add('brand', q.brand);
  if (q.verified) add('verified', t('verified_only'));
  if (q.deal_type) add('deal_type', state.meta.deal_types.find((d) => d.value === q.deal_type)?.label || q.deal_type);
  if (q.q) add('q', `«${q.q}»`);
  if (q.near) add('near', `${t('near_me')} · ${q.radius_km || 100} km`);
  return out.join('');
}

// ---------- Katalog ----------
export async function catalog({ query }) {
  const q = { ...query };
  const { root, sub } = findCat(q.category);
  const geo = withGeo(q);
  const isMap = q.view === 'map';
  const res = await api(`/listings${qs({ ...geo, facets: 1, per_page: isMap ? 60 : 24 })}`);
  const regionOpts = await regionOptions(geo.country, geo.region);
  const f = res.facets;
  const title = q.q ? t('search_results', { q: q.q }) : t('catalog');
  const groupName = sub ? sub.name : root ? shortCat(root) : t('catalog');
  const subs = root ? root.children : [];
  const conds = (q.condition || '').split(',');

  const html = `
  ${crumbs([[t('home'), '/'], [t('catalog'), '/catalog'], ...(root ? [[shortCat(root), `/catalog?category=${root.slug}`]] : []), ...(sub ? [[sub.name]] : [])])}
  <div class="page-head"><h1 class="page-title">${esc(title)}</h1><p class="page-sub">${esc(t('catalog_sub'))}</p></div>
  <div class="chips">${state.cats.map((c) => `<a class="chip ${root?.slug === c.slug ? 'on' : ''}" href="/catalog${qs({ category: c.slug, q: q.q })}">${esc(shortCat(c))}</a>`).join('')}</div>
  ${subs.length ? `<div class="chips small" style="margin-top:8px">${subs.slice(0, 6).map((c) => `<a class="chip ${sub?.slug === c.slug ? 'on' : ''}" href="/catalog${qs({ category: c.slug, q: q.q })}">${esc(c.name)}</a>`).join('')}${subs.length > 6 ? `<a class="chip" href="/categories">${esc(t('all_n_cats', { n: subs.length }))} ${icon('arrow', 'arrow-flip')}</a>` : ''}</div>` : ''}

  <div class="layout-side">
    <form class="filters" data-filters>
      <h3>${esc(t('filters'))}</h3>
      <div class="f-group"><label>${esc(t('category'))}</label>
        <select class="input" name="category"><option value="${root?.slug || ''}">${esc(root ? shortCat(root) : t('any'))}</option>${(root ? root.children : state.cats).map((c) => `<option value="${c.slug}" ${c.slug === (sub?.slug || (!root ? '' : null)) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="f-group"><label>${esc(t('region'))}</label><select class="input" name="region_sel">${regionOpts}</select></div>
      <div class="f-group"><label>${esc(t('price'))}, ${esc(res.currency)}</label>
        <div class="row2i"><input class="input" name="price_min" inputmode="numeric" placeholder="${esc(t('from'))}" value="${esc(q.price_min || '')}"><input class="input" name="price_max" inputmode="numeric" placeholder="${esc(t('to'))}" value="${esc(q.price_max || '')}"></div></div>
      <div class="f-group"><label>${esc(t('condition'))}</label>
        <label class="check"><input type="checkbox" name="cond_used" ${conds.includes('used') ? 'checked' : ''}> ${esc(state.meta.conditions.find((c) => c.value === 'used').label)}</label>
        <label class="check"><input type="checkbox" name="cond_new" ${conds.includes('new') ? 'checked' : ''}> ${esc(state.meta.conditions.find((c) => c.value === 'new').label)}</label></div>
      <div class="f-group"><label>${esc(t('brand'))}</label>
        <select class="input" name="brand"><option value="">${esc(t('any_brand'))}</option>${f.brands.map((b) => `<option ${b.value.toLowerCase() === (q.brand || '').toLowerCase() ? 'selected' : ''}>${esc(b.value)}</option>`).join('')}</select></div>
      <div class="f-group"><label>${esc(t('year'))}</label>
        <div class="row2i"><input class="input" name="year_min" inputmode="numeric" placeholder="${esc(f.year.min || t('from'))}" value="${esc(q.year_min || '')}"><input class="input" name="year_max" inputmode="numeric" placeholder="${esc(f.year.max || t('to'))}" value="${esc(q.year_max || '')}"></div></div>
      <label class="check"><input type="checkbox" name="verified" ${q.verified ? 'checked' : ''}> ${esc(t('verified_only'))}</label>
      <a class="btn btn-soft btn-block" style="margin-top:14px" href="/filters${qs(q)}">${icon('sliders')} ${esc(t('all_filters'))}</a>
      <a class="small muted" style="display:block;margin-top:10px" href="/catalog${qs({ category: q.category })}">${esc(t('reset_filters'))}</a>
    </form>

    <div>
      <div class="results-head" style="flex-wrap:wrap"><h2>${esc(groupName)} · ${num(res.total)}</h2>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-inline-start:auto">
          <span class="view-toggle"><a href="/catalog${qs({ ...q, view: undefined, page: undefined })}" class="${isMap ? '' : 'on'}">${icon('list')} ${esc(t('list_view'))}</a><a href="/catalog${qs({ ...q, view: 'map', page: undefined })}" class="${isMap ? 'on' : ''}">${icon('map')} ${esc(t('map'))}</a></span>
          ${q.near ? `<select class="sort-select" data-radius>${[25, 50, 100, 250, 500].map((r) => `<option value="${r}" ${Number(q.radius_km || 100) === r ? 'selected' : ''}>${esc(t('radius'))}: ${r} km</option>`).join('')}</select>` : `<button class="btn btn-soft btn-sm" data-near>${icon('target')} ${esc(t('near_me'))}</button>`}
        </div>
        <select class="sort-select" data-sort>${['new', 'price_asc', 'price_desc', 'popular', 'year_desc', ...(q.near ? ['distance'] : [])].map((s) => `<option value="${s}" ${(q.sort || 'new') === s ? 'selected' : ''}>${esc(s === 'new' ? t('sort_actual') : t(`sort_${s}`))}</option>`).join('')}</select></div>
      <div class="active-filters">${activeChips(q, f)}${state.user && (q.q || q.category) ? `<button class="chip-x" data-save-search>${icon('heart')} ${esc(t('save_search'))}</button>` : ''}</div>
      ${isMap ? '<div class="map-big" data-bigmap style="margin-bottom:16px"></div>' : ''}
      ${res.items.length ? cards(res.items, 3) : emptyBox(t('nothing_found'), t('nothing_found_sub'))}
      ${pager(res.page, res.pages, (p) => `/catalog${qs({ ...q, page: p })}`)}
      <div class="note"><span>${icon('shield')}</span><div><b>${esc(t('buy_confidently'))}</b><p>${esc(t('buy_confidently_sub'))}</p></div></div>
    </div>
  </div>`;

  return {
    title,
    html,
    mount(main) {
      const form = $('[data-filters]', main);
      const apply = () => {
        const n = { q: q.q, sort: q.sort, deal_type: q.deal_type, country: q.country, region: q.region, near: q.near, radius_km: q.radius_km, view: q.view };
        n.category = form.category.value || undefined;
        Object.assign(n, applyRegion(n, form.region_sel.value));
        for (const k of ['price_min', 'price_max', 'year_min', 'year_max']) n[k] = form[k].value.replace(/\s/g, '') || undefined;
        const c = [form.cond_used.checked && 'used', form.cond_new.checked && 'new'].filter(Boolean);
        n.condition = c.length === 1 ? c[0] : undefined;
        n.brand = form.brand.value || undefined;
        n.verified = form.verified.checked ? '1' : undefined;
        nav(n);
      };
      form.addEventListener('change', apply);
      form.addEventListener('submit', (e) => { e.preventDefault(); apply(); });
      $('[data-sort]', main).onchange = (e) => nav({ ...q, sort: e.target.value, page: undefined });
      $('[data-near]', main)?.addEventListener('click', async () => {
        try {
          const p = await geolocate();
          nav({ ...q, near: `,`, radius_km: 100, sort: 'distance', page: undefined, country: undefined, region: undefined });
        } catch { toast(t('geo_denied'), 'err'); }
      });
      $('[data-radius]', main)?.addEventListener('change', (e) => nav({ ...q, radius_km: e.target.value, page: undefined }));
      const big = $('[data-bigmap]', main);
      if (big) {
        const pts = res.items.filter((x) => x.geo).map((x) => ({ lat: x.geo.lat, lng: x.geo.lng, html: `<a href="/listing/${x.id}" style="display:block;width:180px"><img src="${esc(x.cover || '')}" style="width:100%;border-radius:6px;margin-bottom:6px" alt=""><b>${esc(x.title)}</b><br>${esc(x.price.formatted || '')}</a>` }));
        mapWidget(big, { markers: pts }).then((m) => {
          big.addEventListener('click', (ev) => {
            const a = ev.target.closest('a[href^="/listing/"]');
            if (a && !ev.defaultPrevented) { ev.preventDefault(); window.mxGo(a.getAttribute('href')); }
          });
          return m;
        }).catch(() => big.remove());
      }
      $$('[data-rm]', main).forEach((b) => b.addEventListener('click', () => {
        const k = b.dataset.rm;
        const n = { ...q, page: undefined, [k]: undefined };
        if (k === 'near') { n.radius_km = undefined; if (n.sort === 'distance') n.sort = undefined; }
        if (k === 'region' || k === 'country') {
          n.region = undefined; n.country = k === 'country' ? undefined : n.country;
          if (k === 'region') { state.region = ''; try { localStorage.setItem('mx_region', ''); } catch { /* */ } }
          else { state.country = ''; state.region = ''; try { localStorage.setItem('mx_country', ''); localStorage.setItem('mx_region', ''); } catch { /* */ } }
        }
        nav(n);
      }));
      $('[data-save-search]', main)?.addEventListener('click', async (e) => {
        await api('/saved-searches', { method: 'POST', body: { title: [q.q, sub?.name || (root && shortCat(root))].filter(Boolean).join(' · '), query: withGeo(q) } });
        e.currentTarget.textContent = `✓ ${t('saved')}`;
      });
    },
  };
}

// ---------- Lenta (Объявления) ----------
export async function feed({ query }) {
  const q = { ...query };
  const geo = withGeo(q);
  const res = await api(`/listings${qs({ ...geo, sort: q.sort || 'new', per_page: 16 })}`);
  const regionOpts = await regionOptions(geo.country, geo.region);
  const deals = [['', t('all_offers')], ['sale', state.meta.deal_types[0].label], ['rent', state.meta.deal_types[1].label], ['service', t('services')]];
  const html = `
  ${crumbs([[t('home'), '/'], [t('feed_title')]])}
  <div class="page-head"><h1 class="page-title">${esc(t('feed_title'))}</h1><p class="page-sub">${esc(t('feed_sub'))}</p></div>
  <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">
    <div class="chips">${deals.map(([v, l]) => `<a class="chip ${(q.deal_type || '') === v ? 'on' : ''}" href="/feed${qs({ ...q, deal_type: v || undefined, page: undefined })}">${esc(l)}</a>`).join('')}</div>
    <a href="/create" class="btn btn-primary">${icon('plus')} ${esc(t('post_listing'))}</a>
  </div>
  <div class="banner-navy" style="margin-top:16px">
    <div><div class="kicker">${esc(t('next_site'))}</div><h2 style="margin-top:6px">${esc(t('rent_banner_title'))}</h2><p style="margin-bottom:0">${esc(t('rent_banner_sub'))}</p></div>
    <a href="/feed?deal_type=rent" class="btn btn-white">${icon('arrow', 'arrow-flip')} ${esc(t('find_rent'))}</a>
  </div>
  <div style="display:flex;justify-content:space-between;gap:12px;margin-top:16px;flex-wrap:wrap" data-feed-filters>
    <div class="chips">
      <select class="chip-x" name="category" style="border:0;height:28px"><option value="">${esc(t('all_categories'))}</option>${state.cats.map((c) => `<option value="${c.slug}" ${q.category === c.slug ? 'selected' : ''}>${esc(shortCat(c))}</option>`).join('')}</select>
      <select class="chip-x" name="region_sel" style="border:0;height:28px">${regionOpts}</select>
      <select class="chip-x" name="period_days" style="border:0;height:28px"><option value="">${esc(t('all'))}</option><option value="7" ${q.period_days === '7' ? 'selected' : ''}>${esc(t('last_7'))}</option></select>
    </div>
    <select class="chip-x" name="sort" style="border:0;height:32px">${['new', 'price_asc', 'price_desc', 'popular'].map((s) => `<option value="${s}" ${(q.sort || 'new') === s ? 'selected' : ''}>${esc(t(`sort_${s}`))}</option>`).join('')}</select>
  </div>
  <h2 style="font-size:17px;margin:18px 0 14px">${esc(t('feed_offers', { n: num(res.total) }))}</h2>
  ${res.items.length ? cards(res.items, 4) : emptyBox(t('nothing_found'), t('nothing_found_sub'))}
  ${pager(res.page, res.pages, (p) => `/feed${qs({ ...q, page: p })}`)}
  <div class="note"><span>${icon('shield')}</span><div><b>${esc(t('quality_tip'))}</b><p>${esc(t('quality_tip_sub'))}</p></div></div>`;
  return {
    title: t('feed_title'),
    html,
    mount(main) {
      const box = $('[data-feed-filters]', main);
      box.addEventListener('change', (e) => {
        let n = { ...q, page: undefined };
        if (e.target.name === 'region_sel') n = applyRegion(n, e.target.value);
        else n[e.target.name] = e.target.value || undefined;
        nav(n);
      });
    },
  };
}

// ---------- Filtrlar sahifasi ----------
export async function filters({ query }) {
  const q = { ...query };
  const geo = withGeo(q);
  const { root, sub } = findCat(q.category);
  const facets = await api(`/listings/facets${qs(geo)}`);
  const regionOpts = await regionOptions(geo.country, geo.region);
  const cur = state.currency;
  const deal = q.deal_type || '';
  const cond = q.condition || '';
  const roots = state.cats;
  const subOpts = (r) => (r ? r.children : []).map((c) => `<option value="${c.slug}" ${sub?.slug === c.slug ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const html = `
  ${crumbs([[t('home'), '/'], [t('filters')]])}
  <div class="page-head"><h1 class="page-title">${esc(t('filters'))}</h1><p class="page-sub">${esc(t('filters_sub'))}</p></div>
  <div class="detail" style="grid-template-columns:1fr 340px">
    <form data-ff>
      <div class="box"><h3>${esc(t('cat_and_offer'))}</h3>
        <div class="form-grid">
          <div><label class="lbl">${esc(t('category'))}</label><select class="input" name="root"><option value="">${esc(t('any'))}</option>${roots.map((r) => `<option value="${r.slug}" ${root?.slug === r.slug ? 'selected' : ''}>${esc(shortCat(r))}</option>`).join('')}</select></div>
          <div><label class="lbl">${esc(t('subcategory'))}</label><select class="input" name="sub"><option value="">${esc(t('any'))}</option>${subOpts(root)}</select></div>
        </div>
        <div class="seg" style="margin:14px 0 0">${[['sale', t('buy')], ['rent', t('rent_v')], ['service', t('services')]].map(([v, l]) => `<button type="button" data-deal="${v}" class="${deal === v ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>
      </div>
      <div class="box"><h3>${esc(t('price'))}</h3>
        <div class="form-grid">
          <div><label class="lbl">${esc(t('from'))}, ${esc(cur)}</label><input class="input" name="price_min" inputmode="numeric" value="${esc(q.price_min || '')}" placeholder="${esc(facets.price.min ? num(facets.price.min) : '')}"></div>
          <div><label class="lbl">${esc(t('to'))}, ${esc(cur)}</label><input class="input" name="price_max" inputmode="numeric" value="${esc(q.price_max || '')}" placeholder="${esc(facets.price.max ? num(facets.price.max) : '')}"></div>
        </div>
        <label class="check" style="margin-top:12px"><input type="checkbox" name="vat" ${q.vat ? 'checked' : ''}> ${esc(t('price_vat_f'))}</label>
        <label class="check"><input type="checkbox" name="leasing" ${q.leasing ? 'checked' : ''}> ${esc(t('leasing'))}</label>
      </div>
      <div class="box"><h3>${esc(t('location'))}</h3>
        <div class="form-grid"><div class="full"><label class="lbl">${esc(t('city_or_region'))}</label><select class="input" name="region_sel">${regionOpts}</select></div></div>
        <label class="check" style="margin-top:12px"><input type="checkbox" name="delivery" ${q.delivery ? 'checked' : ''}> ${esc(t('delivery_to_city'))}</label>
      </div>
      <div class="box"><h3>${esc(t('eq_params'))}</h3>
        <div class="seg">${[['', t('any_cond')], ['new', state.meta.conditions[0].label], ['used', state.meta.conditions[1].label]].map(([v, l]) => `<button type="button" data-cond="${v}" class="${cond === v ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>
        <div class="form-grid">
          <div><label class="lbl">${esc(t('brand'))}</label><select class="input" name="brand"><option value="">${esc(t('any_brand'))}</option>${facets.brands.map((b) => `<option ${b.value.toLowerCase() === (q.brand || '').toLowerCase() ? 'selected' : ''}>${esc(b.value)}</option>`).join('')}</select></div>
          <div><label class="lbl">${esc(t('model'))}</label><input class="input" name="model" value="${esc(q.model || '')}"></div>
          <div><label class="lbl">${esc(t('year_from'))}</label><input class="input" name="year_min" inputmode="numeric" value="${esc(q.year_min || '')}"></div>
          <div><label class="lbl">${esc(t('year_to'))}</label><input class="input" name="year_max" inputmode="numeric" value="${esc(q.year_max || '')}"></div>
          <div><label class="lbl">${esc(t('hours_max'))}</label><input class="input" name="hours_max" inputmode="numeric" value="${esc(q.hours_max || '')}"></div>
          <div><label class="lbl">${esc(t('power_min'))}</label><input class="input" name="power_min" inputmode="numeric" value="${esc(q.power_min || '')}"></div>
        </div>
        <label class="check" style="margin-top:12px"><input type="checkbox" name="drive4" ${q.drive4 ? 'checked' : ''}> ${esc(t('drive4'))}</label>
        <label class="check"><input type="checkbox" name="docs" ${q.docs ? 'checked' : ''}> ${esc(t('with_docs'))}</label>
      </div>
      <div class="box"><h3>${esc(t('seller'))}</h3>
        <label class="check"><input type="checkbox" name="verified" ${q.verified ? 'checked' : ''}> ${esc(t('only_verified'))}</label>
        <label class="check"><input type="checkbox" name="with_photos" ${q.with_photos ? 'checked' : ''}> ${esc(t('with_photo'))}</label>
        <label class="check"><input type="checkbox" name="private" ${q.private ? 'checked' : ''}> ${esc(t('private_sellers'))}</label>
      </div>
    </form>
    <aside class="side-card" style="position:sticky;top:12px">
      <h3 style="font-size:19px" data-count-title>…</h3>
      <p class="small muted">${esc(t('matches_sub'))}</p>
      <div class="chips" data-ff-chips style="gap:6px;margin:10px 0 16px"></div>
      <a class="btn btn-primary btn-block" data-show>…</a>
      <a class="btn btn-soft btn-block" style="margin-top:10px" href="/filters">${esc(t('reset_all'))}</a>
      <p class="tiny muted" style="margin:12px 0 0">${esc(t('change_in_catalog'))}</p>
    </aside>
  </div>`;
  return {
    title: t('filters'),
    html,
    mount(main) {
      const form = $('[data-ff]', main);
      let dealV = deal;
      let condV = cond;
      let region = { country: geo.country, region: geo.region };
      const collect = () => {
        const n = { q: q.q, sort: q.sort, ...region };
        n.category = form.sub.value || form.root.value || undefined;
        n.deal_type = dealV || undefined;
        n.condition = condV || undefined;
        for (const k of ['price_min', 'price_max', 'year_min', 'year_max', 'hours_max', 'power_min', 'model', 'brand']) n[k] = form[k].value.replace(/\s/g, '') || undefined;
        for (const k of ['vat', 'leasing', 'delivery', 'drive4', 'docs', 'verified', 'with_photos', 'private']) n[k] = form[k].checked ? '1' : undefined;
        return n;
      };
      const update = debounce(async () => {
        const n = collect();
        const r = await api(`/listings/count${qs(n)}`);
        $('[data-count-title]', main).textContent = t('matches', { n: num(r.total) });
        const show = $('[data-show]', main);
        show.textContent = t('show_n', { n: num(r.total) });
        show.setAttribute('href', `/catalog${qs(n)}`);
        const labels = [];
        if (n.category) labels.push(findCat(n.category).sub?.name || shortCat(findCat(n.category).root));
        if (n.region) labels.push(state.regions?.[n.country]?.find((x) => x.code === n.region)?.name);
        else if (n.country) labels.push(state.meta.countries.find((c) => c.code === n.country)?.name);
        if (n.brand) labels.push([n.brand, n.model].filter(Boolean).join(' '));
        if (n.year_min || n.year_max) labels.push(`${n.year_min || '…'}–${n.year_max || '…'}`);
        if (n.condition) labels.push(state.meta.conditions.find((c) => c.value === n.condition)?.label);
        if (n.verified) labels.push(t('verified_only'));
        $('[data-ff-chips]', main).innerHTML = labels.filter(Boolean).map((l) => `<span class="chip-x">${esc(l)}</span>`).join('');
      }, 250);
      form.root.addEventListener('change', () => {
        const r = findCat(form.root.value).root;
        form.sub.innerHTML = `<option value="">${esc(t('any'))}</option>${(r?.children || []).map((c) => `<option value="${c.slug}">${esc(c.name)}</option>`).join('')}`;
      });
      form.region_sel.addEventListener('change', () => {
        const v = form.region_sel.value;
        if (v.startsWith('country:')) region = { country: v.slice(8) || undefined, region: undefined };
        else region = { ...region, region: v || undefined };
        if (v.startsWith('country:')) regionOptions(region.country, null).then((h) => { form.region_sel.innerHTML = h; update(); });
      });
      form.addEventListener('click', (e) => {
        const d = e.target.closest('[data-deal]');
        const c = e.target.closest('[data-cond]');
        if (d) { dealV = dealV === d.dataset.deal ? '' : d.dataset.deal; $$('[data-deal]', form).forEach((b) => b.classList.toggle('on', b.dataset.deal === dealV)); update(); }
        if (c) { condV = c.dataset.cond; $$('[data-cond]', form).forEach((b) => b.classList.toggle('on', b.dataset.cond === condV)); update(); }
      });
      form.addEventListener('input', update);
      form.addEventListener('change', update);
      update();
    },
  };
}

export { go };
