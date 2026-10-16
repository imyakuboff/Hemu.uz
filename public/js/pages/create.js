import { state, t, esc, api, icon, fmtTime, toast, debounce, markErrors, ApiErr, fitImage, $, $$ } from '../core.js';
import { crumbs, accountLayout, requireLogin, regionsOf, shortCat } from '../ui.js';
import { go, onAuthChanged } from '../app.js';
import { mapWidget, packageOptions } from '../features.js';

const field = (label, inner, { req = false, full = false, hint = '' } = {}) => `<div class="${full ? 'full' : ''}"><label class="lbl">${esc(label)}${req ? ' *' : ''}</label>${inner}${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
const input = (name, v = '', attrs = '') => `<input class="input" name="${name}" value="${esc(v ?? '')}" ${attrs}>`;
const numIn = (name, v) => input(name, v ?? '', 'inputmode="numeric"');
const sel = (name, opts, v) => `<select class="input" name="${name}">${opts.map(([val, l]) => `<option value="${esc(val)}" ${String(val) === String(v ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const findRoot = (slug) => state.cats.find((c) => c.slug === slug || c.children.some((s) => s.slug === slug));

function needLogin() {
  return { title: t('login'), html: `<div class="box empty"><h3>${esc(t('login_required'))}</h3><button class="btn btn-primary" data-login style="margin-top:14px">${esc(t('login'))}</button></div>` };
}

async function regionOpts(country, v) {
  const regs = await regionsOf(country);
  return [['', t('choose')], ...regs.map((r) => [r.code, r.name])].map(([val, l]) => `<option value="${esc(val)}" ${val === (v || '') ? 'selected' : ''}>${esc(l)}</option>`).join('');
}

// Kategoriya turiga qarab xarakteristikalar
function specsHtml(kind, e, deal) {
  const conds = [['', t('choose')], ...state.meta.conditions.map((c) => [c.value, c.label])];
  if (kind === 'part') {
    return `<div class="form-grid">
      ${field(t('brand'), input('brand', e.brand), { req: true })}${field(t('article'), input('part_number', e.part_number))}
      ${field(t('manufacturer'), input('manufacturer', e.manufacturer))}${field(t('condition'), sel('condition', conds, e.condition), { req: true })}
      ${field(t('stock'), numIn('stock_qty', e.stock_qty))}${field(`${t('warranty')}, ${t('months', { n: '' }).trim()}`, numIn('warranty_months', e.warranty_months))}
      ${field(t('analogs'), input('analogs', e.analogs), { full: true })}
      ${field(t('compat_hint'), input('compatibility', (e.compatibility || []).join(', ')), { full: true })}
      ${field(t('pickup'), input('d_pickup', e.delivery?.pickup))}${field(t('delivery_local'), input('d_local', e.delivery?.local))}
      ${field(t('delivery_national'), input('d_national', e.delivery?.national))}${field(t('payment'), input('d_payment', e.delivery?.payment))}
    </div>`;
  }
  if (kind === 'material') {
    return `<div class="form-grid">
      ${field(t('mat_maker'), input('brand', e.brand, 'placeholder="Qizilqum sement, Kronospan…"'))}${field(t('mat_grade'), input('grade', e.grade, 'list="mat-grades" placeholder="M-500, D500, 1-sort"'))}
      ${field(t('mat_size'), input('size_text', e.size_text, 'placeholder="250×120×65 mm"'))}${field(t('mat_pack'), input('pack', e.pack, 'placeholder="50 kg qop, poddon 400 dona"'))}
      ${field(t('stock'), numIn('stock_qty', e.stock_qty))}${field(t('min_order'), input('min_order', e.min_order, 'placeholder="10 qop, 1 poddon"'))}
      ${field(t('mat_delivery'), input('d_local', e.delivery?.local, `placeholder="${esc(t('mat_delivery_ph'))}"`))}${field(t('pickup'), input('d_pickup', e.delivery?.pickup))}
      ${field(t('payment'), input('d_payment', e.delivery?.payment, 'placeholder="Naqd, Click, Payme"'), { full: true })}
      <datalist id="mat-grades">${['M-400', 'M-500', 'M-100', 'M-150', 'D500', 'D600', 'B2.5', '1-sort', '2-sort', 'OSB-3', 'Fraksiya 5–20', 'Fraksiya 20–40'].map((g) => `<option value="${g}">`).join('')}</datalist>
    </div>`;
  }
  if (kind === 'service' || deal === 'rent') {
    return `<div class="form-grid">${field(t('brand'), input('brand', e.brand))}${field(t('model'), input('model', e.model))}
      ${field(t('year'), numIn('year', e.year))}${field(t('min_order'), input('min_order', e.min_order))}
      ${field(t('sp_capacity'), numIn('capacity_t', e.capacity_t))}${field(t('sp_power'), numIn('power_hp', e.power_hp))}
      <label class="check full"><input type="checkbox" name="with_operator" ${e.with_operator ? 'checked' : ''}> ${esc(t('with_operator'))}</label></div>`;
  }
  return `<div class="form-grid">
    ${field(t('brand'), input('brand', e.brand), { req: true })}${field(t('model'), input('model', e.model), { req: true })}
    ${field(t('year'), numIn('year', e.year), { req: true })}${field(`${t('sp_hours')}, ${t('u_mh')}`, numIn('hours', e.hours))}
    ${field(t('condition'), sel('condition', conds, e.condition), { req: true })}${field(`${t('sp_power')}, ${t('u_hp')}`, numIn('power_hp', e.power_hp))}
    ${field(`${t('sp_weight')}, kg`, numIn('weight_kg', e.weight_kg))}${field(t('sp_drive'), input('drive', e.drive, 'list="drives"'))}
    ${field(`${t('sp_mileage')}, ${t('u_km')}`, numIn('mileage_km', e.mileage_km))}${field(t('sp_docs'), input('docs', e.docs))}
    ${field(t('serial_number'), input('serial_number', e.serial_number, 'maxlength="40" autocomplete="off"'), { full: true })}
    <datalist id="drives"><option value="4×4"><option value="4×2"><option value="6×4"><option value="6×6"><option value="8×4"></datalist>
  </div>`;
}

// ---------- E'lon yaratish / tahrirlash ----------
export async function listing({ params }) {
  if (!state.user) return needLogin();
  let id = params[0] ? Number(params[0]) : null;
  let e = {};
  let photos = [];
  if (id) {
    const l = await api(`/listings/${id}`);
    if (!l.edit) return { redirect: `/listing/${id}` };
    e = l.edit;
    photos = l.photos;
  } else {
    const pre = new URLSearchParams(location.search);
    e = { category: pre.get('category') || undefined, subcategory: pre.get('subcategory') || undefined, deal_type: 'sale', country: state.country || state.user.country, contact_name: state.user.name, contact_phone: state.user.phone, contact_email: state.user.email, accept_messages: 1, currency: state.meta.countries.find((c) => c.code === (state.country || state.user.country))?.currency };
  }
  const root = findRoot(e.category) || state.cats[0];
  const company = state.user.company;
  const cur = state.meta.currencies.map((c) => [c.code, c.code]);
  const units = state.meta.price_units.map((u) => [u.value, u.label || t('unit_total')]);
  const vats = [['', t('vat_none')], ...[12, 15, 18, 20].map((n) => [n, t('vat_incl', { n })])];
  const isActive = e.status === 'active';

  const html = accountLayout('', `
  ${crumbs([[t('home'), '/'], [t('dashboard'), '/dashboard'], [id ? t('edit_title') : t('create_title')]])}
  <div class="page-head"><h1 class="page-title">${esc(id ? t('edit_title') : t('create_title'))}</h1><p class="page-sub">${esc(t('create_sub'))}</p></div>
  <p class="small" style="margin:-8px 0 16px"><span class="saved-badge" data-saved ${id ? '' : 'hidden'}>${esc(t('draft_saved', { t: fmtTime(e.updated_at) }))}</span><span class="muted tiny">${esc(t('autosave_note'))}</span>${e.status && e.status !== 'draft' ? ` <span class="tag ${e.status === 'active' ? 'green' : e.status === 'rejected' ? 'red' : 'orange'}">${esc(state.meta.listing_statuses.find((s) => s.value === e.status)?.label)}</span>` : ''}</p>
  ${e.reject_reason ? `<div class="note" style="margin:0 0 16px"><div><b>${esc(t('reject_reason', { r: e.reject_reason }))}</b></div></div>` : ''}
  <form data-lf novalidate>
    <div class="box"><h3>${esc(t('basic_info'))}</h3>
      <div class="seg" data-deal>${state.meta.deal_types.map((d) => `<button type="button" data-v="${d.value}" class="${e.deal_type === d.value ? 'on' : ''}">${esc(d.label)}</button>`).join('')}</div>
      <div class="form-grid">
        ${field(t('category'), sel('category', state.cats.map((c) => [c.slug, shortCat(c)]), root.slug), { req: true })}
        ${field(t('subcategory'), `<select class="input" name="subcategory">${root.children.map((s) => `<option value="${s.slug}" ${s.slug === e.subcategory ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>`, { req: true })}
        ${field(t('listing_title'), input('title', e.title, 'maxlength="80"'), { req: true, full: true, hint: `${esc(t('title_hint'))} <span data-tcount>${(e.title || '').length}</span> / 80` })}
      </div>
    </div>
    <div class="box" data-photos-box><h3>${esc(t('photos'))} *</h3><p class="tiny muted" style="margin:-6px 0 12px">${esc(t('photos_hint'))}</p>
      <div class="photos-grid" data-photos></div><input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden data-file>
    </div>
    <div class="box"><h3>${esc(t('specs'))}</h3><div data-specs>${specsHtml(root.kind, e, e.deal_type)}</div></div>
    <!-- Tavsif kerak emas: e'lon xarakteristikalar bilan to'ldiriladi -->
    <div class="box"><h3>${esc(t('price_location'))}</h3>
      <div class="form-grid">
        ${field(t('price'), numIn('price', e.price), { req: true })}
        <div class="row2i">${field(t('currency'), sel('currency', cur, e.currency))}${field(t('price_unit'), sel('price_unit', units, e.price_unit || 'total'))}</div>
        ${field(t('country'), sel('country', state.meta.countries.map((c) => [c.code, c.name]), e.country), { req: true })}
        ${field(t('city'), `<select class="input" name="region">${await regionOpts(e.country, e.region)}</select>`, { req: true })}
        ${field(t('sp_vat'), sel('vat_rate', vats, e.vat_rate ?? ''))}
        ${field(t('site_address'), input('address', e.address))}
      </div>
      <label class="lbl" style="margin-top:14px">${esc(t('set_on_map'))}</label><div class="map-box" data-pick></div>
      <input type="hidden" name="lat" value="${esc(e.lat ?? '')}"><input type="hidden" name="lng" value="${esc(e.lng ?? '')}">
      <label class="check" style="margin-top:12px"><input type="checkbox" name="leasing" ${e.leasing ? 'checked' : ''}> ${esc(t('leasing'))}</label>
      <label class="check"><input type="checkbox" name="price_from" ${e.price_from ? 'checked' : ''}> ${esc(t('price_from_lbl'))}</label>
    </div>
    <div class="box"><h3>${esc(t('seller_contacts'))}</h3>
      <div class="form-grid">
        ${field(t('company'), `<input class="input" value="${esc(company?.name || '—')}" disabled>`)}
        ${field(t('contact_person'), input('contact_name', e.contact_name), { req: true })}
        ${field(t('phone'), input('contact_phone', e.contact_phone, 'type="tel"'), { req: true })}
        ${field(t('email'), input('contact_email', e.contact_email, 'type="email"'))}
      </div>
      <label class="check" style="margin-top:12px"><input type="checkbox" name="accept_messages" ${e.accept_messages ? 'checked' : ''}> ${esc(t('accept_msgs'))}</label>
    </div>
    <div class="box" data-tier-box><h3>${esc(t('promote_opt'))}</h3><p class="tiny muted" style="margin-top:-6px">${esc(t('promote_opt_sub'))}</p>
      <div data-tiers></div>
    </div>
    <div class="box"><h3>${esc(t('ready'))}</h3><p class="tiny muted" style="margin-top:-6px">${esc(t('ready_sub'))}</p>
      <label class="check"><input type="checkbox" name="accept_rules" ${id ? 'checked' : ''}> ${esc(t('accept_rules'))}</label>
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
        <button class="btn btn-primary" data-publish>${esc(isActive ? t('save_changes') : t('publish'))}</button>
        <button type="button" class="btn btn-soft" data-preview>${esc(t('preview'))}</button>
        ${isActive ? '' : `<button type="button" class="btn btn-soft" data-draft>${esc(t('save_draft'))}</button>`}
      </div>
    </div>
  </form>`);

  return {
    title: id ? t('edit_title') : t('create_title'),
    html,
    mount(main) {
      // VIP / GOLD / PREMIUM narxlari (admin/moderator belgilaydi)
      api('/promo/packages', { silent: true }).then((pk) => {
        const box = $('[data-tiers]', main);
        if (box) box.innerHTML = packageOptions(pk, 'd_tier', '', { withFree: true });
      }).catch(() => { $('[data-tier-box]', main)?.remove(); });
      const chosenTier = () => main.querySelector('input[name=d_tier]:checked')?.value || '';
      const form = $('[data-lf]', main);
      let deal = e.deal_type || 'sale';
      let kind = root.kind;
      let busy = false;

      const drawPhotos = () => {
        $('[data-photos]', main).innerHTML = photos.map((p, i) => `<div><div class="ph"><img src="${esc(p.url)}" alt=""><button type="button" class="x" data-del-photo="${p.id}">${icon('x')}</button></div>${i === 0 ? `<span class="ph-cover">${esc(t('cover'))}</span>` : ''}</div>`).join('')
          + (photos.length < 15 ? `<label class="ph-add" data-add>${icon('image')}${esc(t('add_photo'))}</label>` : '');
      };
      drawPhotos();

      const collect = () => {
        const v = {};
        for (const el of form.elements) {
          if (!el.name || el.disabled || el.name.startsWith('d_') || el.name === 'accept_rules') continue;
          v[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim();
        }
        v.deal_type = deal;
        for (const k of ['price', 'year', 'hours', 'mileage_km', 'power_hp', 'weight_kg', 'stock_qty', 'warranty_months', 'capacity_t']) if (k in v) v[k] = v[k].replace(/[\s ]/g, '').replace(',', '.');
        if ('compatibility' in v) v.compatibility = v.compatibility ? v.compatibility.split(',').map((s) => s.trim()).filter(Boolean) : [];
        if (form.d_pickup || form.d_local) {
          const d = { pickup: form.d_pickup?.value.trim(), local: form.d_local?.value.trim(), national: form.d_national?.value.trim(), payment: form.d_payment?.value.trim() };
          v.delivery = Object.values(d).some(Boolean) ? d : null;
        }
        return v;
      };

      const save = async ({ silent = false } = {}) => {
        const body = collect();
        if (!id) {
          const r = await api('/listings', { method: 'POST', body, silent });
          id = r.id;
          history.replaceState(null, '', `/create/${id}`);
        } else {
          await api(`/listings/${id}`, { method: 'PATCH', body, silent });
        }
        const b = $('[data-saved]', main);
        b.hidden = false;
        b.textContent = t('draft_saved', { t: new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date()) });
      };
      const guard = async (fn) => {
        if (busy) return;
        busy = true;
        try { await fn(); } catch (err) { if (err instanceof ApiErr) markErrors(form, err.details); } finally { busy = false; }
      };

      // Avtomatik saqlash (qoralama mavjud bo'lsa)
      const autosave = debounce(() => { if (id && !isActive) save({ silent: true }).catch(() => {}); }, 1500);
      form.addEventListener('input', (ev) => {
        if (ev.target.name === 'title') $('[data-tcount]', main).textContent = ev.target.value.length;
        if (ev.target.name === 'description') $('[data-dcount]', main).textContent = t('desc_hint', { n: ev.target.value.length });
        ev.target.classList.remove('err');
        autosave();
      });

      $('[data-deal]', main).addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-v]');
        if (!b) return;
        deal = b.dataset.v;
        $$('[data-v]', main).forEach((x) => x.classList.toggle('on', x === b));
        $('[data-specs]', main).innerHTML = specsHtml(kind, collect(), deal);
        autosave();
      });
      form.category.addEventListener('change', () => {
        const r = findRoot(form.category.value);
        kind = r.kind;
        form.subcategory.innerHTML = r.children.map((s) => `<option value="${s.slug}">${esc(s.name)}</option>`).join('');
        $('[data-specs]', main).innerHTML = specsHtml(kind, collect(), deal);
      });
      form.country.addEventListener('change', async () => {
        form.region.innerHTML = await regionOpts(form.country.value, '');
        const c = state.meta.countries.find((x) => x.code === form.country.value);
        if (c) form.currency.value = c.currency;
      });

      // Xaritada joy belgilash
      const CITY = { tashkent: [41.31, 69.28], 'tashkent-city': [41.31, 69.28], 'almaty-city': [43.24, 76.95], bishkek: [42.87, 74.57], dushanbe: [38.56, 68.79], ashgabat: [37.96, 58.33], baku: [40.41, 49.87], moscow: [55.76, 37.62], kabul: [34.55, 69.21] };
      const pickEl = $('[data-pick]', main);
      const c0 = e.lat ? null : CITY[e.region] || { UZ: [41.31, 69.28], KZ: [43.24, 76.95], KG: [42.87, 74.57], TJ: [38.56, 68.79], TM: [37.96, 58.33], AZ: [40.41, 49.87], RU: [55.76, 37.62], AF: [34.55, 69.21] }[e.country];
      mapWidget(pickEl, { picked: e.lat ? { lat: e.lat, lng: e.lng } : null, center: c0, zoom: 10, onClick: (p) => { form.lat.value = p.lat; form.lng.value = p.lng; autosave(); } }).catch(() => pickEl.remove());

      // Rasmlar
      const fileIn = $('[data-file]', main);
      main.addEventListener('click', async (ev) => {
        if (ev.target.closest('[data-add]')) { ev.preventDefault(); fileIn.click(); }
        const del = ev.target.closest('[data-del-photo]');
        if (del) {
          await api(`/listings/${id}/photos/${del.dataset.delPhoto}`, { method: 'DELETE' });
          photos = photos.filter((p) => String(p.id) !== del.dataset.delPhoto);
          drawPhotos();
        }
      });
      fileIn.addEventListener('change', () => guard(async () => {
        if (!fileIn.files.length) return;
        if (!id) await save();
        const fd = new FormData();
        // Katta rasmlar avtomatik kichraytiriladi (tezroq yuklanadi; kartochka va karuselda kesib ko'rsatiladi)
        for (const f of [...fileIn.files].slice(0, 15 - photos.length)) fd.append('files', await fitImage(f, { max: 1600 }));
        photos = await api(`/listings/${id}/photos`, { method: 'POST', form: fd });
        fileIn.value = '';
        drawPhotos();
      }));

      $('[data-draft]', main)?.addEventListener('click', () => guard(async () => { await save(); toast(t('saved'), 'ok'); }));
      $('[data-preview]', main).addEventListener('click', () => guard(async () => { await save(); go(`/listing/${id}`); }));
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        guard(async () => {
          if (!form.accept_rules.checked) { form.accept_rules.parentElement.style.color = 'var(--red)'; return; }
          await save();
          const tier = chosenTier();
          if (isActive) { toast(t('saved'), 'ok'); go(tier ? `/my/listings?promote=${id}&tier=${tier}` : `/listing/${id}`); return; }
          try {
            const r = await api(`/listings/${id}/publish`, { method: 'POST', body: { accept_rules: true } });
            toast(r.status === 'active' ? t('published') : t('sent_moderation'), 'ok');
            // Daraja tanlangan bo'lsa — e'lonlar sahifasida to'lov oynasi ochiladi
            go(tier ? `/my/listings?promote=${id}&tier=${tier}` : '/my/listings');
          } catch (err) {
            if (err.details?.photos) $('[data-photos-box]', main).scrollIntoView({ behavior: 'smooth' });
            throw err;
          }
        });
      });
    },
  };
}

// ---------- So'rov (zayavka) yaratish ----------
export async function request() {
  if (!state.user) return needLogin();
  const u = state.user;
  const country = state.country || u.country;
  const cur = state.meta.countries.find((c) => c.code === country)?.currency || 'USD';
  const wantRoot = { equipment: 'special', part: 'parts', service: 'services' };
  const pre = new URLSearchParams(location.search);
  const root = state.cats.find((c) => c.slug === pre.get('category')) || state.cats.find((c) => c.slug === 'special');
  const preSub = pre.get('subcategory');
  const preWant = root.slug === 'services' ? 'service' : root.slug === 'parts' ? 'part' : 'equipment';
  const conds = [['any', t('any_cond')], ...state.meta.conditions.map((c) => [c.value, c.label])];
  const html = `
  ${crumbs([[t('home'), '/'], [t('create_request')]])}
  <div class="page-head"><h1 class="page-title">${esc(t('create_request'))}</h1><p class="page-sub">${esc(t('request_sub'))}</p></div>
  <div class="detail" style="grid-template-columns:1fr 340px">
    <form data-rf novalidate>
      <div class="box"><h3>${esc(t('what_looking'))}</h3>
        <div class="seg" data-want>${[['equipment', t('want_equipment')], ['part', t('want_part')], ['service', t('want_service')]].map(([v, l]) => `<button type="button" data-v="${v}" class="${v === preWant ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>
        <div class="form-grid">
          ${field(t('category'), sel('category', state.cats.map((c) => [c.slug, shortCat(c)]), root.slug), { req: true })}
          ${field(t('subcategory'), `<select class="input" name="subcategory">${root.children.map((s) => `<option value="${s.slug}" ${s.slug === preSub ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>`, { req: true })}
          ${field(t('request_title'), input('title', '', 'maxlength="120"'), { req: true, full: true })}
        </div>
      </div>
      <div class="box"><h3>${esc(t('requirements'))}</h3>
        <div class="form-grid">
          ${field(t('describe_task'), '<textarea class="input" name="description" maxlength="3000" rows="4"></textarea>', { req: true, full: true })}
          ${field(t('condition'), sel('condition', conds, 'any'))}${field(t('qty'), input('quantity', ''))}
        </div>
        <label class="btn btn-soft btn-sm" style="margin-top:14px;cursor:pointer">${icon('clip')} <span data-att>${esc(t('attach_file'))}</span><input type="file" name="file" accept="image/jpeg,image/png,application/pdf" hidden></label>
        <p class="tiny muted" style="margin:6px 0 0">${esc(t('attach_hint'))}</p>
      </div>
      <div class="box"><h3>${esc(t('budget_time'))}</h3>
        <div class="form-grid">
          ${field(`${t('budget_from')}, ${cur}`, numIn('budget_min', ''))}${field(`${t('budget_to')}, ${cur}`, numIn('budget_max', ''))}
          ${field(t('city'), `<select class="input" name="region">${await regionOpts(country, state.region)}</select>`, { req: true })}
          ${field(t('when_needed'), input('needed_by', ''), { req: true })}
        </div>
        <label class="check" style="margin-top:12px"><input type="checkbox" name="needs_delivery"> ${esc(t('needs_delivery'))}</label>
      </div>
      <div class="box"><h3>${esc(t('contact_info'))}</h3>
        <div class="form-grid">
          ${field(t('your_name'), input('contact_name', u.name), { req: true })}${field(t('company'), input('company_name', u.company?.name || ''))}
          ${field(t('phone'), input('contact_phone', u.phone, 'type="tel"'), { req: true })}${field(t('email'), input('contact_email', u.email || '', 'type="email"'))}
        </div>
        <label class="check" style="margin-top:12px"><input type="checkbox" name="accept_messages" checked> ${esc(t('receive_offers'))}</label>
      </div>
      <div class="box">
        <label class="check"><input type="checkbox" name="agree"> ${esc(t('agree_personal'))}</label>
        <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><button class="btn btn-primary">${esc(t('publish_request'))}</button><button type="button" class="btn btn-soft" data-draft>${esc(t('save_draft'))}</button></div>
        <p class="tiny muted" style="margin:10px 0 0">${esc(t('request_note'))}</p>
      </div>
    </form>
    <aside class="steps-card" style="position:sticky;top:12px">
      <span style="color:var(--kicker)">${icon('clipboard')}</span>
      <h3>${esc(t('suppliers_come'))}</h3>
      <b>01 · ${esc(t('step1'))}</b><p>${esc(t('step1s'))}</p>
      <b>02 · ${esc(t('step2'))}</b><p>${esc(t('step2s'))}</p>
      <b>03 · ${esc(t('step3'))}</b><p style="margin-bottom:0">${esc(t('step3s'))}</p>
    </aside>
  </div>`;
  return {
    title: t('create_request'),
    html,
    mount(main) {
      const form = $('[data-rf]', main);
      let want = 'equipment';
      $('[data-want]', main).addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-v]');
        if (!b) return;
        want = b.dataset.v;
        $$('[data-want] [data-v]', main).forEach((x) => x.classList.toggle('on', x === b));
        form.category.value = wantRoot[want];
        form.category.dispatchEvent(new Event('change'));
      });
      form.category.addEventListener('change', () => {
        const r = findRoot(form.category.value);
        form.subcategory.innerHTML = r.children.map((s) => `<option value="${s.slug}">${esc(s.name)}</option>`).join('');
      });
      form.file.addEventListener('change', () => { $('[data-att]', main).textContent = form.file.files[0]?.name || t('attach_file'); });
      form.addEventListener('input', (ev) => ev.target.classList.remove('err'));
      const send = async (draft) => {
        if (!draft && !form.agree.checked) { form.agree.parentElement.style.color = 'var(--red)'; return; }
        const v = {};
        for (const el of form.elements) if (el.name && el.type !== 'file' && el.name !== 'agree') v[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim();
        v.budget_min = v.budget_min.replace(/\s/g, '');
        v.budget_max = v.budget_max.replace(/\s/g, '');
        if (v.condition === 'any') v.condition = '';
        Object.assign(v, { want, deal_type: want === 'service' ? 'service' : 'sale', country, currency: cur, draft });
        if (!v.needed_by && !draft) { markErrors(form, { needed_by: 'required' }); return; }
        try {
          const r = await api('/requests', { method: 'POST', body: v });
          if (form.file.files[0]) {
            const fd = new FormData();
            fd.append('file', form.file.files[0]);
            await api(`/requests/${r.id}/attachment`, { method: 'POST', form: fd });
          }
          toast(draft ? t('saved') : t('request_sent', { n: r.notified_sellers }), 'ok');
          go('/my/orders?tab=requests');
        } catch (err) { if (err instanceof ApiErr) markErrors(form, err.details); }
      };
      form.addEventListener('submit', (ev) => { ev.preventDefault(); send(false); });
      $('[data-draft]', main).addEventListener('click', () => send(true));
    },
  };
}

export { requireLogin, onAuthChanged };
