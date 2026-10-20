import { t, esc, api, icon, num, money, fmtRel, fmtDate, openModal, closeModal, toast, $, $$ } from '../core.js';
import { crumbs, cards, imgOf, priceText, requireLogin, shortCat, tierBadge, promoBadge, tickIf } from '../ui.js';
import { state } from '../core.js';
import { mapWidget, yandexSearchUrl, leasingModal, reportModal, inspectionModal, promoteModal, priceChart, calendarWidget, compareList, providerOptions, bindSeg, goPay, shareLink } from '../features.js';
import { go, onAuthChanged } from '../app.js';

const kw = (hp) => (hp ? ` / ${String(Math.round(hp * 0.7457 * 10) / 10).replace('.', ',')} kW` : '');

function specRows(l) {
  const f = l.facts;
  const rows = [];
  const add = (k, v) => { if (v !== null && v !== undefined && v !== '') rows.push([k, v]); };
  if (l.kind === 'part') {
    add(t('article'), f.part_number);
    add(t('manufacturer'), l.manufacturer || f.brand);
    add(t('sp_type'), l.subcategory?.name);
    add(t('condition'), f.condition_label);
    add(t('stock'), f.stock_qty !== null && f.stock_qty !== undefined ? num(f.stock_qty) : null);
    add(t('warranty'), l.warranty_months ? t('months', { n: l.warranty_months }) : null);
    add(t('analogs'), l.analogs);
  } else if (l.kind === 'material') {
    add(t('sp_type'), l.subcategory?.name);
    add(t('mat_maker'), f.brand);
    add(t('mat_grade'), f.grade);
    add(t('mat_size'), f.size_text);
    add(t('mat_pack'), f.pack);
    add(t('stock'), f.stock_qty !== null && f.stock_qty !== undefined ? num(f.stock_qty) : null);
    add(t('min_order'), f.min_order);
    add(t('mat_delivery'), l.delivery?.local);
    add(t('pickup'), l.delivery?.pickup);
    add(t('payment'), l.delivery?.payment);
  } else {
    add(t('sp_brand_model'), [f.brand, f.model].filter(Boolean).join(' '));
    add(t('year'), f.year);
    add(t('sp_hours'), f.hours ? `${num(f.hours)} ${t('u_mh')}` : null);
    add(t('sp_mileage'), f.mileage_km ? `${num(f.mileage_km)} ${t('u_km')}` : null);
    add(t('condition'), f.condition_label);
    add(t('sp_power'), f.power_hp ? `${num(f.power_hp)} ${t('u_hp')}${kw(f.power_hp)}` : null);
    add(t('sp_weight'), f.weight_kg ? `${num(f.weight_kg)} kg` : null);
    add(t('sp_capacity'), f.capacity_t ? `${num(f.capacity_t)} ${t('u_t')}` : null);
    add(t('sp_drive'), l.drive);
    if (f.with_operator) add(t('with_operator'), '✓');
    add(t('min_order'), f.min_order);
  }
  for (const a of l.attrs || []) add(a.label, a.value);
  if (l.kind !== 'part') add(t('sp_docs'), l.docs);
  add(t('sp_vat'), l.vat_rate ? `${l.vat_rate}%` : null);
  return rows;
}
const table = (rows) => `<table class="spec">${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>`;

function sellerCard(l, part) {
  const s = l.seller;
  const since = s.since ? t('on_since', { y: s.since }) : '';
  const place = [l.location.city, s.active_listings ? t('listings_count', { n: s.active_listings }) : ''].filter(Boolean).join(' · ');
  const reply = s.response_minutes ? t('replies_in', { m: s.response_minutes }) : '';
  const own = l.is_owner;
  return `<div class="side-card">
    <h3>${s.company_id ? `<a href="/company/${s.company_id}">${esc(s.name)}</a>` : esc(s.name)}${tickIf(s)}</h3>
    ${l.store ? `<a class="tag st-tag" href="/company/${l.store.id}">${icon('shield')} ${esc(t('st_official'))}</a>` : ''}
    ${s.verified ? `<div class="tiny muted" style="margin:4px 0 6px">${esc(t(s.verified_type === 'paid' ? 'tick_paid' : 'tick_docs'))}</div>` : ''}
    ${s.reviews_count ? `<div class="rating" style="font-size:12px">${icon('star')} ${String(s.rating).replace('.', ',')} · ${esc(t('reviews', { n: s.reviews_count }))}</div>` : ''}
    <p class="tiny muted" style="margin:8px 0 0">${esc(since)}<br>${esc(place)}</p>
    ${own ? `<div class="stack">${l.status === 'active' ? `<button class="btn btn-primary" data-promote>${icon('rocket')} ${esc(t('promote'))}</button>` : ''}<a class="btn btn-soft" href="/create/${l.id}">${icon('file')} ${esc(t('edit'))}</a><a class="btn btn-soft" href="/my/listings">${esc(t('my_listings'))}</a></div>` : `
    <div class="stack">
      <button class="btn btn-primary" data-phone>${icon('phone')} <span>${esc(t('show_phone'))}</span></button>
      ${s.accept_messages ? `<button class="btn btn-soft" data-write>${icon('chat')} ${esc(t('write_seller'))}</button>` : ''}
      <button class="btn btn-soft" data-lead="${part ? 'invoice' : 'general'}">${esc(part ? t('request_invoice') : t('send_request'))}</button>
    </div>`}
    <p class="tiny muted" style="margin:12px 0 0">${esc([s.contact_name, reply].filter(Boolean).join(' · '))}${s.work_hours ? `<br>${esc(s.work_hours)}` : ''}</p>
  </div>`;
}

export default async function listing({ params, query }) {
  // Ulashilgan havola (?s=telegram ...) orqali kelgan — e'lon ulashish hisobiga yoziladi
  const shareCh = /^[a-z]{2,10}$/.test(query?.s || '') ? query.s : '';
  const l = await api(`/listings/${params[0]}`, { headers: { 'X-View-Source': shareCh ? 'share' : (state.viewSource || 'direct'), ...(shareCh ? { 'X-Share-Channel': shareCh } : {}) } });
  if (shareCh) { const u = new URL(location.href); u.searchParams.delete('s'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); }
  const part = l.kind === 'part';
  const photos = l.photos.length ? l.photos.map((p) => p.url) : [imgOf(l)];
  const thumbs = l.photos.length ? l.photos.map((p) => p.thumb || p.url) : photos;
  const path = [shortCat({ slug: l.category.slug, name: l.category.name }), l.subcategory?.name, l.facts.brand].filter(Boolean).join(' / ');
  const meta = [l.location.city || l.location.region_name, fmtRel(l.published_at), `№ ${l.id}`].filter(Boolean).join(' · ');
  const statusTag = l.status !== 'active' ? `<span class="tag orange">${esc(l.status_label)}</span>` : '';
  const condTag = part
    ? `<span class="tag green">${esc([l.facts.condition_label, l.manufacturer ? '' : ''].filter(Boolean).join(' · '))}</span>`
    : `<span class="tag">${esc(l.deal_label)}</span>${l.docs ? `<span class="tag green">${esc(t('docs_verified'))}</span>` : ''}`;
  const priceSub = part
    ? [t('per_piece'), l.vat_rate ? t('price_vat') : null].filter(Boolean).join(' · ')
    : [l.vat_rate ? t('price_vat') : null, l.leasing ? t('leasing_possible') : null].filter(Boolean).join(' · ');
  const conv = l.price.converted ? `<p class="tiny muted" style="margin:4px 0 0">≈ ${esc(l.price.original.formatted)}</p>` : '';
  const stock = l.facts.stock_qty;

  const gallery = `<div class="gallery">
    <div class="main ${part ? 'contain' : ''}"><img src="${esc(photos[0])}" alt="${esc(l.title)}" data-main></div>
    ${photos.length > 1 && !part ? `<div class="thumbs">${thumbs.slice(0, 2).map((p, i) => `<button data-thumb="${i}"><img src="${esc(p)}" alt="" loading="lazy" decoding="async"></button>`).join('')}${photos.length > 2 ? `<button data-thumb="2"><img src="${esc(thumbs[2])}" alt="" loading="lazy" decoding="async">${photos.length > 3 ? `<span class="more">${esc(t('photos_more', { n: photos.length - 2 }))}</span>` : ''}</button>` : ''}</div>` : ''}
    ${part ? `<div class="gallery-note"><span data-photo-of>${esc(t('photo_of', { i: 1, n: photos.length }))}</span><button class="btn btn-soft btn-sm" data-fav="${l.id}" data-label="1">${icon('heart')} <span>${esc(t(l.is_favorite ? 'in_favorites' : 'to_favorites'))}</span></button></div>` : ''}
  </div>`;

  const cardTitle = part ? t('card_part') : l.kind === 'material' ? t('card_material') : t('card_equipment');
  const priceCard = part
    ? `<div class="side-card">
        <div class="big-price">${esc(priceText(l.price))}</div>${l.promo ? `<div class="promo-price-line"><s class="old-price">${esc(l.price.old_formatted)}</s> ${promoBadge(l.promo)}</div>` : ''}${conv}
        <p class="tiny muted" style="margin:6px 0 10px">${esc(priceSub)}</p>
        ${stock ? `<span class="tag green">${esc(t('in_stock_n', { n: num(stock) }))}</span>` : stock === 0 ? `<span class="tag red">${esc(t('out_of_stock'))}</span>` : ''}
        ${l.is_owner ? '' : `<label class="lbl" style="margin-top:14px">${esc(t('quantity'))}</label>
        <div class="qty"><button data-q="-1">${icon('minus')}</button><input data-qty value="1" inputmode="numeric"><button data-q="1">${icon('plus')}</button></div>
        <p class="small" style="margin:12px 0 0">${esc(t('total'))}: <b data-total>${esc(priceText(l.price))}</b></p>
        <div class="stack"><button class="btn btn-primary" data-order ${stock === 0 ? 'disabled' : ''}>${esc(t('order_part'))}</button><button class="btn btn-soft" data-lead="compatibility">${esc(t('check_compat'))}</button></div>`}
        ${l.delivery ? `<p class="tiny muted" style="margin:12px 0 0">${esc([l.delivery.local, l.delivery.pickup ? `${t('pickup')}: ${l.delivery.pickup}` : null].filter(Boolean).join(' · '))}</p>` : ''}
      </div>`
    : `<div class="side-card">
        <div class="big-price">${esc(priceText(l.price))}</div>${l.promo ? `<div class="promo-price-line"><s class="old-price">${esc(l.price.old_formatted)}</s> ${promoBadge(l.promo)}</div>` : ''}${conv}
        <p class="tiny muted" style="margin:6px 0 10px">${esc(priceSub)}</p>
        ${l.status === 'active' ? `<span class="tag green">${esc(t('available'))}</span>` : statusTag}
        <div class="stack"><button class="btn btn-soft" data-fav="${l.id}" data-label="1">${icon('heart')} <span>${esc(t(l.is_favorite ? 'in_favorites' : 'to_favorites'))}</span></button></div>
      </div>`;

  const left = part
    ? `<div class="box"><h3>${esc(t('about_part'))}</h3>${table(specRows(l))}</div>
      ${l.compatibility.length || l.compatibility_note ? `<div class="box"><h3>${esc(t('compat'))}</h3>
        <div class="chips" style="gap:6px">${l.compatibility.map((c) => `<span class="chip-x">${esc(c)}</span>`).join('')}</div>
        ${l.compatibility_note ? `<p class="tiny muted" style="margin:10px 0 0">${esc(l.compatibility_note)}</p>` : ''}</div>` : ''}
      ${l.description || l.delivery ? `<div class="box"><h3>${esc(t('desc_delivery'))}</h3>${l.description ? `<div class="prose">${esc(l.description)}</div>` : ''}
        ${l.delivery ? `<div style="margin-top:12px">${table([[t('pickup'), l.delivery.pickup], [t('delivery_local'), l.delivery.local], [t('delivery_national'), l.delivery.national], [t('payment'), l.delivery.payment]].filter((r) => r[1]))}</div>` : ''}</div>` : ''}`
    : `<div class="box"><h3>${esc(t('specs'))}</h3>${table(specRows(l))}</div>
      ${l.description ? `<div class="box"><h3>${esc(t('description'))}</h3><div class="prose">${esc(l.description)}</div></div>` : ''}
      <div class="box"><h3>${esc(t('location_title'))}</h3>
        <p class="small" style="margin:0">${esc([l.location.region_name, l.location.city, l.location.address].filter(Boolean).join(', '))}</p>
        ${l.location.note ? `<p class="tiny muted" style="margin:6px 0 0">${esc(l.location.note)}</p>` : ''}
        ${l.geo ? '<div class="map-box" data-map></div>' : `<a class="btn btn-soft btn-sm" style="margin-top:12px" target="_blank" rel="noopener" href="${yandexSearchUrl([l.location.address, l.location.city, l.location.country_name].filter(Boolean).join(', '))}">${esc(t('show_on_map'))}</a>`}
      </div>`;

  const similarTitle = part ? t('seen_together') : t('similar');
  const sc = l.serial || {};
  const serialBox = sc.checked
    ? `<div class="serial ${sc.ok ? 'ok' : 'bad'}">${icon(sc.ok ? 'shield' : 'flag')}<span>${esc(t('serial_number'))}: ${esc(sc.serial_masked)}<br>${esc(sc.wanted ? t('serial_wanted') : sc.duplicates ? t('serial_dup', { n: sc.duplicates }) : t('serial_ok'))}</span></div>`
    : '';
  const html = `
  ${crumbs([[t('home'), '/'], ...(l.kind === 'material' ? [[t('mat_title'), '/materials']] : []), [cardTitle]])}
  <h1 class="page-title" style="margin-bottom:2px">${esc(cardTitle)}</h1>
  <p class="page-sub" style="margin:0 0 16px">${esc(path)}</p>
  <div class="detail">
    <div>
      <div class="tags">${l.tier ? tierBadge(l.tier) : ''}${condTag}${statusTag}</div>
      <h1>${esc(l.title)}</h1>
      <div class="sub">${esc(meta)} · <span class="views" title="${esc(t('views_title'))}">${icon('eye')} ${esc(t('views_n', { n: num(l.views) }))}</span></div>
      ${l.reject_reason && l.is_owner ? `<div class="note" style="margin:0 0 14px;border-color:#f3c2c2"><div><b>${esc(t('reject_reason', { r: l.reject_reason }))}</b></div></div>` : ''}
      ${gallery}
      <div style="margin-top:16px">${left}
        ${serialBox}
        ${l.rent ? `<div class="box"><h3>${icon('calendar')} ${esc(t('calendar'))}</h3><div data-cal></div>
          ${l.is_owner ? '' : `<form data-book class="form-grid" style="margin-top:14px">
            <div><label class="lbl">${esc(t('start_date'))}</label><input class="input" type="date" name="start_date" required min="${new Date().toISOString().slice(0, 10)}"></div>
            <div><label class="lbl">${esc(t('end_date'))}</label><input class="input" type="date" name="end_date" required min="${new Date().toISOString().slice(0, 10)}"></div>
            ${l.price.unit === 'hour' ? `<div><label class="lbl">${esc(t('hours_per_day'))}</label><input class="input" type="number" name="hours_per_day" min="1" max="24" value="8"></div>` : ''}
            <div class="full"><label class="lbl">${esc(t('comment'))}</label><input class="input" name="note" maxlength="1000"></div>
            <div class="full" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><span class="small" data-quote></span><button class="btn btn-primary">${icon('calendar')} ${esc(t('book'))}</button></div>
          </form>`}</div>` : ''}
        ${l.price_history.length > 1 ? `<div class="box"><h3>${icon('chart')} ${esc(t('price_history'))}</h3>${priceChart(l.price_history)}</div>` : ''}
      </div>
    </div>
    <aside>
      ${priceCard}
      ${l.deal_type === 'rent' && !l.is_owner && l.status === 'active' ? `<a class="urgent-cta" href="/urgent?listing=${l.id}" style="margin:0 0 12px">${icon('bolt')}<span><b>${esc(t('urgent_call_this'))}</b><small>${esc(t('urgent_call_this_sub'))}</small></span></a>` : ''}
      ${sellerCard(l, part)}
      <div class="side-card" style="padding:14px 16px">
        <div class="tool-row" style="margin:0">
          <button class="btn btn-primary btn-sm" data-share>${icon('send')} ${esc(t('share'))}</button>
          ${!part && l.kind !== 'material' && l.deal_type === 'sale' && l.price.amount ? `<button class="btn btn-soft btn-sm" data-leasing>${icon('calc')} ${esc(t('leasing_calc'))}</button>` : ''}
          ${l.kind === 'equipment' ? `<button class="btn btn-soft btn-sm" data-cmp="${l.id}">${icon('scale')} ${esc(t('compare'))}</button>` : ''}
          ${!l.is_owner ? `<button class="btn btn-ghost btn-sm" data-report>${icon('flag')} ${esc(t('report'))}</button>` : ''}
        </div>
        ${l.is_owner && l.share && l.status === 'active' ? `<div class="share-progress">
          <div class="small">${esc(t('share_hint_owner', { n: l.share.step, h: l.share.hours }))}</div>
          <div class="sp-bar"><span style="width:${Math.round(((l.share.step - l.share.to_next) / l.share.step) * 100)}%"></span></div>
          <div class="tiny muted">${esc(t('share_progress', { n: num(l.share.count), k: l.share.to_next }))}</div>
          ${l.share.top_until ? `<div class="tiny green" style="margin-top:4px">🔥 ${esc(t('share_top_until', { d: fmtDate(l.share.top_until, true) }))}</div>` : ''}
        </div>` : ''}
      </div>
      ${part ? '' : `<div class="side-card" style="padding:14px 16px"><b class="small">${esc(t('safety'))}</b><p class="tiny muted" style="margin:6px 0 0">${esc(t('safety_sub'))}</p>
        ${!l.is_owner && l.kind === 'equipment' && l.deal_type === 'sale' ? `<p class="tiny" style="margin:10px 0 6px">${esc(t('inspection_sub'))}</p><button class="btn btn-soft btn-sm btn-block" data-inspect>${icon('shield')} ${esc(t('order_inspection'))}</button>` : ''}</div>`}
    </aside>
  </div>
  ${l.similar.length ? `<section class="sec" style="max-width:${l.similar.length <= 2 ? '860px' : 'none'}">
    <div class="sec-head"><div><h2>${esc(similarTitle)}</h2></div>${l.subcategory ? `<a href="/catalog?category=${l.subcategory.slug}" class="pill-link">${icon('arrow', 'arrow-flip')} ${esc(t('all_in', { c: l.subcategory.name }))}</a>` : ''}</div>
    ${cards(l.similar.slice(0, l.similar.length <= 2 ? 2 : 4), l.similar.length <= 2 ? 2 : 4)}</section>` : ''}`;

  return {
    title: l.title,
    html,
    mount(main) {
      // Galereya
      $$('[data-thumb]', main).forEach((b) => b.addEventListener('click', () => {
        const i = Number(b.dataset.thumb);
        if (i === 2 && photos.length > 3) return lightbox(photos, l.title);
        $('[data-main]', main).src = photos[i];
      }));
      $('[data-main]', main)?.addEventListener('click', () => lightbox(photos, l.title));

      // Miqdor va jami
      const qtyIn = $('[data-qty]', main);
      const recalc = () => {
        let v = Math.max(1, parseInt(qtyIn.value, 10) || 1);
        if (stock) v = Math.min(v, stock);
        qtyIn.value = v;
        if (l.price.amount !== null) $('[data-total]', main).textContent = money(l.price.amount * v, l.price.currency);
      };
      $$('[data-q]', main).forEach((b) => b.addEventListener('click', () => { qtyIn.value = (parseInt(qtyIn.value, 10) || 1) + Number(b.dataset.q); recalc(); }));
      qtyIn?.addEventListener('input', recalc);

      $('[data-phone]', main)?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        if (!requireLogin(onAuthChanged)) return;
        const r = await api(`/listings/${l.id}/phone`, { method: 'POST' });
        btn.outerHTML = `<a class="btn btn-primary" href="tel:${esc(r.phone)}">${icon('phone')} ${esc(r.phone)}</a>`;
      });
      $('[data-write]', main)?.addEventListener('click', () => {
        if (!requireLogin(onAuthChanged)) return;
        const m = openModal(`<h3>${esc(t('write_seller'))}</h3><p class="small muted">${esc(l.title)}</p>
          <form><textarea class="input" name="body" required maxlength="4000" placeholder="${esc(t('type_msg'))}"></textarea>
          <button class="btn btn-primary btn-block" style="margin-top:12px">${icon('send')} ${esc(t('send'))}</button></form>`);
        m.querySelector('form').onsubmit = async (e) => {
          e.preventDefault();
          const c = await api('/conversations', { method: 'POST', body: { listing_id: l.id, body: e.target.body.value.trim() } });
          closeModal();
          go(`/messages/${c.id}`);
        };
      });
      $$('[data-lead]', main).forEach((b) => b.addEventListener('click', () => {
        if (!requireLogin(onAuthChanged)) return;
        leadModal(l, b.dataset.lead);
      }));
      $('[data-order]', main)?.addEventListener('click', () => {
        if (!requireLogin(onAuthChanged)) return;
        orderModal(l, Number(qtyIn.value) || 1);
      });

      // Yangi funksiyalar
      $('[data-promote]', main)?.addEventListener('click', () => promoteModal(l));
      $('[data-leasing]', main)?.addEventListener('click', () => leasingModal(l.price.amount, l.price.currency));
      $('[data-report]', main)?.addEventListener('click', () => { if (requireLogin(onAuthChanged)) reportModal(l.id); });
      $('[data-share]', main)?.addEventListener('click', () => shareLink(`/listing/${l.id}`, l.title, l.price?.formatted || '', { track: true }));
      $('[data-inspect]', main)?.addEventListener('click', () => { if (requireLogin(onAuthChanged)) inspectionModal(l); });
      const mapEl = $('[data-map]', main);
      if (mapEl && l.geo) mapWidget(mapEl, { markers: [{ lat: l.geo.lat, lng: l.geo.lng, html: esc(l.title) }] }).catch(() => { mapEl.remove(); });

      // Ijara: kalendar va bron
      const calEl = $('[data-cal]', main);
      const book = $('[data-book]', main);
      const quote = async () => {
        if (!book.start_date.value || !book.end_date.value) return;
        const q = await api(`/listings/${l.id}/bookings/quote`, { method: 'POST', body: { start_date: book.start_date.value, end_date: book.end_date.value, hours_per_day: book.hours_per_day ? Number(book.hours_per_day.value) : undefined }, silent: true }).catch(() => null);
        if (!q) return;
        $('[data-quote]', main).innerHTML = `${esc(t('calc_total'))}: <b>${esc(q.total_formatted || '—')}</b> · ${esc(t('days_n', { n: q.days }))}${q.available ? '' : ` · <span style="color:var(--red)">${esc(t('busy'))}</span>`}`;
      };
      if (calEl) {
        calendarWidget(calEl, l, {
          owner: l.is_owner,
          onPick: (s) => {
            if (!book) return;
            book.start_date.value = s.start;
            book.end_date.value = s.end || s.start;
            quote();
          },
        });
      }
      if (book) {
        book.addEventListener('change', quote);
        book.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!requireLogin(onAuthChanged)) return;
          await api(`/listings/${l.id}/bookings`, { method: 'POST', body: { start_date: book.start_date.value, end_date: book.end_date.value, hours_per_day: book.hours_per_day ? Number(book.hours_per_day.value) : undefined, note: book.note.value.trim() || undefined } });
          toast(t('booking_sent'), 'ok');
          go('/my/orders?tab=bookings');
        });
      }
    },
  };
}

function lightbox(photos, title) {
  openModal(`<h3 style="margin-bottom:12px">${esc(title)}</h3><div style="display:grid;gap:10px">${photos.map((p) => `<img src="${esc(p)}" alt="" style="border-radius:10px;width:100%">`).join('')}</div>`, { wide: true });
}

function leadModal(l, kind) {
  const kinds = l.kind === 'part' ? ['invoice', 'compatibility', 'general'] : l.deal_type === 'rent' ? ['rent', 'inspection', 'general'] : ['inspection', 'general', 'invoice'];
  if (!kinds.includes(kind)) kinds.unshift(kind);
  const m = openModal(`<h3>${esc(t('send_request'))}</h3><p class="small muted">${esc(l.title)}</p>
    <form>
      <label class="lbl" style="margin-top:12px">${esc(t('request_type'))}</label>
      <select class="input" name="kind">${kinds.map((k) => `<option value="${k}" ${k === kind ? 'selected' : ''}>${esc(t(`lk_${k}`))}</option>`).join('')}</select>
      <label class="lbl" style="margin-top:12px">${esc(t('message'))}</label>
      <textarea class="input" name="message" maxlength="2000"></textarea>
      <label class="lbl" style="margin-top:12px">${esc(t('preferred_time'))}</label>
      <input class="input" name="preferred_at" maxlength="40">
      <button class="btn btn-primary btn-block" style="margin-top:16px">${esc(t('send'))}</button>
    </form>`);
  m.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    await api(`/listings/${l.id}/leads`, { method: 'POST', body: { kind: f.kind.value, message: f.message.value.trim() || undefined, preferred_at: f.preferred_at.value.trim() || undefined } });
    closeModal();
    toast(t('sent'), 'ok');
  };
}

function orderModal(l, qty) {
  const m = openModal(`<h3>${esc(t('order_part'))}</h3><p class="small muted">${esc(l.title)} · ${qty} × ${esc(l.price.formatted)}</p>
    <form>
      <label class="lbl" style="margin-top:12px">${esc(t('quantity'))}</label><input class="input" name="qty" type="number" min="1" value="${qty}">
      <label class="lbl" style="margin-top:12px">${esc(t('delivery_method'))}</label>
      <select class="input" name="delivery_method"><option value="pickup">${esc(t('dm_pickup'))}</option><option value="courier">${esc(t('dm_courier'))}</option><option value="carrier">${esc(t('dm_carrier'))}</option></select>
      <div data-addr hidden><label class="lbl" style="margin-top:12px">${esc(t('address'))}</label><input class="input" name="delivery_address" maxlength="300"></div>
      <label class="lbl" style="margin-top:12px">${esc(t('comment'))}</label><textarea class="input" name="note" maxlength="1000" style="min-height:70px"></textarea>
      <label class="box" style="display:flex;gap:10px;margin:14px 0 0;padding:12px 14px;cursor:pointer;background:var(--teal-soft);border:0">
        <input type="checkbox" name="escrow" style="width:18px;height:18px;accent-color:var(--teal);flex:none;margin-top:2px">
        <span><b class="small">${icon('shield')} ${esc(t('safe_deal'))}</b><br><span class="tiny muted">${esc(t('safe_deal_sub', { p: String(state.meta.escrow_fee_pct).replace('.', ',') }))}</span></span></label>
      <button class="btn btn-primary btn-block" style="margin-top:16px">${esc(t('place_order'))}</button>
    </form>`);
  const f = m.querySelector('form');
  f.delivery_method.onchange = () => { m.querySelector('[data-addr]').hidden = f.delivery_method.value === 'pickup'; };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const o = await api('/orders', { method: 'POST', body: { listing_id: l.id, qty: Number(f.qty.value), delivery_method: f.delivery_method.value, delivery_address: f.delivery_address.value.trim() || undefined, note: f.note.value.trim() || undefined, escrow: f.escrow.checked } });
    closeModal();
    toast(t('order_placed'), 'ok');
    if (o.escrow) return escrowPayModal(o);
    go('/my/orders');
  };
}

// Xavfsiz bitim to'lovi
export async function escrowPayModal(o) {
  const providers = await api('/payment-providers');
  const m = openModal(`<h3>${esc(t('safe_deal'))}</h3><p class="small muted">${esc(o.number)} · ${esc(o.title)}</p>
    <table class="spec" style="margin:10px 0"><tr><td>${esc(t('total'))}</td><td>${esc(o.total_formatted)}</td></tr><tr><td>${esc(t('escrow_fee'))}</td><td>${esc(o.escrow.fee_formatted)}</td></tr><tr><td><b>${esc(t('to_pay'))}</b></td><td><b>${esc(o.escrow.to_pay_formatted)}</b></td></tr></table>
    <label class="lbl">${esc(t('pay_with'))}</label>${providerOptions(providers)}
    <button class="btn btn-primary btn-block" data-go>${esc(t('pay'))}</button>`);
  const prov = bindSeg(m, '[data-provider]');
  m.querySelector('[data-go]').onclick = async () => {
    const p = await api(`/orders/${o.id}/escrow/pay`, { method: 'POST', body: { provider: prov() || providers[0]?.id } });
    closeModal();
    goPay(p);
  };
}
