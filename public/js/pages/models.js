// Model katalogi (/models, /model/jcb, /model/jcb/3cx) va "Zapchastni topib beramiz" (/zapchast-topish)
import { state, t, esc, api, icon, num, toast, $ } from '../core.js';
import { crumbs, cards, emptyBox, regionsOf, requireLogin } from '../ui.js';
import { go } from '../app.js';
import { personCard } from './sections.js';

const stat = (label, value) => (value ? `<div class="m-stat"><span>${esc(label)}</span><b>${esc(value)}</b></div>` : '');
const findPartCard = (machine = '') => `<a class="fp-card" href="/zapchast-topish${machine ? `?machine=${encodeURIComponent(machine)}` : ''}">
  <span class="fp-ic">${icon('gear')}</span>
  <span><b>${esc(t('fp_card_title'))}</b><small>${esc(t('fp_card_sub'))}</small></span>${icon('chevron')}</a>`;
export { findPartCard };

// ---------- Barcha markalar ----------
export async function modelsIndex() {
  const { brands } = await api('/models');
  const html = `
    ${crumbs([[t('home'), '/'], [t('models_title')]])}
    <div class="page-head"><h1 class="page-title">${esc(t('models_title'))}</h1><p class="page-sub">${esc(t('models_sub'))}</p></div>
    ${brands.length ? `<div class="brand-grid">${brands.map((b) => `<a class="brand-tile" href="/model/${esc(b.slug)}">
      <b>${esc(b.name)}</b><small>${esc(t('n_listings', { n: num(b.count) }))}${b.models.length ? ` · ${esc(t('n_models', { n: b.models.length }))}` : ''}</small>
      ${b.models.length ? `<span class="chips" style="gap:4px;margin-top:6px">${b.models.slice(0, 4).map((m) => `<span class="chip-x">${esc(m.name)}</span>`).join('')}</span>` : ''}</a>`).join('')}</div>` : emptyBox(t('empty'))}
    <div style="margin-top:20px">${findPartCard()}</div>`;
  return { title: t('models_title'), html };
}

// ---------- Marka sahifasi ----------
export async function brandPage({ params }) {
  const d = await api(`/models/${encodeURIComponent(params[0])}`);
  const s = d.stats;
  const html = `
    ${crumbs([[t('home'), '/'], [t('models_title'), '/models'], [d.brand.name]])}
    <div class="page-head"><h1 class="page-title">${esc(d.brand.name)}</h1><p class="page-sub">${esc(t('brand_sub', { brand: d.brand.name }))}</p></div>
    ${s ? `<div class="m-stats">${stat(t('m_listings'), num(s.total))}${stat(t('m_price'), s.price_min && s.price_max ? `${s.price_min} – ${s.price_max}` : '')}${stat(t('m_years'), s.year_min ? `${s.year_min}–${s.year_max}` : '')}</div>` : ''}
    ${d.models.length ? `<section class="sec"><div class="sec-head"><div><h2>${esc(t('m_models'))}</h2></div></div>
      <div class="brand-grid">${d.models.map((m) => `<a class="brand-tile" href="/model/${esc(d.brand.slug)}/${esc(m.slug)}"><b>${esc(`${d.brand.name} ${m.name}`)}</b><small>${esc(t('n_listings', { n: num(m.count) }))}</small></a>`).join('')}</div></section>` : ''}
    <section class="sec"><div class="sec-head"><div><h2>${esc(t('m_machines', { name: d.brand.name }))}</h2></div><a class="pill-link" href="/catalog?q=${encodeURIComponent(d.brand.name)}">${icon('arrow', 'arrow-flip')} ${esc(t('see_all'))}</a></div>${cards(d.listings, 4)}</section>
    ${d.parts.length ? `<section class="sec"><div class="sec-head"><div><h2>${esc(t('m_parts', { name: d.brand.name }))}</h2></div><a class="pill-link" href="/sparepart?q=${encodeURIComponent(d.brand.name)}">${icon('arrow', 'arrow-flip')} ${esc(t('see_all'))}</a></div>${cards(d.parts, 4)}</section>` : ''}
    <div style="margin-top:8px">${findPartCard(d.brand.name)}</div>`;
  return { title: d.brand.name, html };
}

// ---------- Model sahifasi ----------
export async function modelPage({ params }) {
  const d = await api(`/models/${encodeURIComponent(params[0])}/${encodeURIComponent(params[1])}`);
  const full = `${d.brand.name} ${d.model.name}`;
  const s = d.stats;
  const html = `
    ${crumbs([[t('home'), '/'], [t('models_title'), '/models'], [d.brand.name, `/model/${d.brand.slug}`], [d.model.name]])}
    <div class="page-head"><h1 class="page-title">${esc(full)}</h1><p class="page-sub">${esc(t('model_sub', { name: full }))}</p></div>
    ${s ? `<div class="m-stats">
      ${stat(t('m_listings'), [s.sale ? `${t('m_sale')}: ${num(s.sale)}` : '', s.rent ? `${t('m_rent')}: ${num(s.rent)}` : ''].filter(Boolean).join(' · '))}
      ${stat(t('m_price'), s.price_min && s.price_max ? (s.price_min === s.price_max ? s.price_min : `${s.price_min} – ${s.price_max}`) : '')}
      ${stat(t('m_median'), s.price_median && s.price_min !== s.price_max ? s.price_median : '')}
      ${stat(t('m_years'), s.year_min ? (s.year_min === s.year_max ? String(s.year_min) : `${s.year_min}–${s.year_max}`) : '')}
      ${stat(t('m_hours'), s.hours_avg ? `~${num(s.hours_avg)}` : '')}
      ${stat(t('m_power'), s.power_hp ? `~${s.power_hp} ${t('hp_unit')}` : '')}
    </div>` : ''}
    <section class="sec"><div class="sec-head"><div><h2>${esc(t('m_machines', { name: full }))}</h2></div><a class="pill-link" href="/catalog?q=${encodeURIComponent(full)}">${icon('arrow', 'arrow-flip')} ${esc(t('see_all'))}</a></div>${cards(d.listings, 4)}</section>
    <section class="sec"><div class="sec-head"><div><h2>${esc(t('m_parts', { name: full }))}</h2></div>${d.parts.length ? `<a class="pill-link" href="/sparepart?q=${encodeURIComponent(full)}">${icon('arrow', 'arrow-flip')} ${esc(t('see_all'))}</a>` : ''}</div>
      ${d.parts.length ? cards(d.parts, 4) : ''}
      <div style="margin-top:12px">${findPartCard(full)}</div></section>
    ${d.mechanics.length ? `<section class="sec"><div class="sec-head"><div><h2>${esc(t('m_mechanics', { brand: d.brand.name }))}</h2></div><a class="pill-link" href="/mechanic">${icon('arrow', 'arrow-flip')} ${esc(t('see_all'))}</a></div>${d.mechanics.map(personCard).join('')}</section>` : ''}
    ${d.related.length ? `<section class="sec"><div class="sec-head"><div><h2>${esc(t('m_other_models', { brand: d.brand.name }))}</h2></div></div>
      <div class="chips">${d.related.map((m) => `<a class="chip" href="/model/${esc(d.brand.slug)}/${esc(m.slug)}">${esc(`${d.brand.name} ${m.name}`)} · ${num(m.count)}</a>`).join('')}</div></section>` : ''}`;
  return { title: full, html };
}

// ---------- Zapchastni topib beramiz ----------
export async function partFinder({ query }) {
  const country = state.country || state.user?.country || 'UZ';
  const regs = await regionsOf(country);
  const conds = [['any', t('any_cond')], ...state.meta.conditions.map((c) => [c.value, c.label])];
  const html = `
    ${crumbs([[t('home'), '/'], [t('sec_sparepart'), '/sparepart'], [t('fp_title')]])}
    <div class="page-head"><h1 class="page-title">${esc(t('fp_title'))}</h1><p class="page-sub">${esc(t('fp_sub'))}</p></div>
    <div class="detail side-340">
      <form class="box" data-fp novalidate>
        <div class="form-grid">
          <div class="full"><label class="lbl">${esc(t('fp_name'))} *</label><input class="input" name="name" maxlength="100" required placeholder="${esc(t('fp_name_ph'))}"></div>
          <div><label class="lbl">${esc(t('fp_art'))}</label><input class="input" name="part_number" maxlength="60" placeholder="32/925346"></div>
          <div><label class="lbl">${esc(t('fp_machine'))}</label><input class="input" name="machine" maxlength="80" value="${esc(query.machine || '')}" placeholder="JCB 3CX 2019"></div>
          <div><label class="lbl">${esc(t('quantity'))}</label><input class="input" name="quantity" maxlength="40" placeholder="1"></div>
          <div><label class="lbl">${esc(t('condition'))}</label><select class="input" name="condition">${conds.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></div>
          <div><label class="lbl">${esc(t('city'))} *</label><select class="input" name="region"><option value="">${esc(t('choose'))}</option>${regs.map((r) => `<option value="${esc(r.code)}" ${r.code === state.region ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>
          <div><label class="lbl">${esc(t('phone'))}</label><input class="input" name="contact_phone" type="tel" value="${esc(state.user?.phone || '')}" maxlength="30"></div>
          <div class="full"><label class="lbl">${esc(t('fp_note'))}</label><textarea class="input" name="note" rows="3" maxlength="1000"></textarea></div>
        </div>
        <label class="btn btn-soft btn-sm" style="margin-top:14px;cursor:pointer">${icon('image')} <span data-att>${esc(t('fp_photo'))}</span><input type="file" name="file" accept="image/jpeg,image/png" hidden></label>
        <div style="margin-top:16px"><button class="btn btn-primary">${icon('search')} ${esc(t('fp_submit'))}</button></div>
      </form>
      <aside class="steps-card" style="position:sticky;top:12px">
        <span style="color:var(--kicker)">${icon('gear')}</span>
        <h3>${esc(t('fp_how'))}</h3>
        <b>01 · ${esc(t('fp_s1'))}</b><p>${esc(t('fp_s1s'))}</p>
        <b>02 · ${esc(t('fp_s2'))}</b><p>${esc(t('fp_s2s'))}</p>
        <b>03 · ${esc(t('fp_s3'))}</b><p style="margin-bottom:0">${esc(t('fp_s3s'))}</p>
      </aside>
    </div>`;
  return {
    title: t('fp_title'),
    html,
    mount(main) {
      const form = $('[data-fp]', main);
      form.file.addEventListener('change', () => { $('[data-att]', main).textContent = form.file.files[0]?.name || t('fp_photo'); });
      const send = async () => {
        const body = Object.fromEntries(['name', 'part_number', 'machine', 'quantity', 'condition', 'region', 'contact_phone', 'note'].map((k) => [k, form[k].value.trim()]).filter(([, v]) => v));
        if (!body.name || body.name.length < 3) { form.name.focus(); toast(t('fp_need_name')); return; }
        if (!body.region) { form.region.focus(); toast(t('fp_need_city')); return; }
        const btn = form.querySelector('button.btn-primary');
        btn.disabled = true;
        try {
          const r = await api('/parts/find', { method: 'POST', body });
          if (form.file.files[0]) {
            const fd = new FormData();
            fd.append('file', form.file.files[0]);
            await api(`/requests/${r.id}/attachment`, { method: 'POST', form: fd }).catch(() => {});
          }
          toast(t('fp_sent', { n: r.notified_sellers || 0 }));
          go(`/requests/${r.id}`);
        } finally { btn.disabled = false; }
      };
      form.onsubmit = (e) => {
        e.preventDefault();
        if (!requireLogin(send)) return;
        send();
      };
    },
  };
}
