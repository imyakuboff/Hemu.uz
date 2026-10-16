// Mavsumiy aksiyalar: bosh sahifa qatori, aksiya sahifasi, e'lonni aksiyaga qo'shish oynasi
import { state, t, esc, api, icon, num, qs, fmtDate, openModal, closeModal, toast } from '../core.js';
import { crumbs, cards, pager, emptyBox } from '../ui.js';

const daysLeft = (iso) => (iso ? Math.max(0, Math.ceil((new Date(`${iso}T23:59:59`) - Date.now()) / 86400000)) : null);

// Bosh sahifa: faol aksiyalar kartochkalari
export function promoStrip(list) {
  if (!list?.length) return '';
  return `<section class="sec promo-sec">
    <div class="sec-head"><div><h2>${esc(t('promo_sec'))}</h2><p>${esc(t('promo_sec_sub'))}</p></div></div>
    <div class="promo-strip">${list.map((p) => `<a class="promo-tile t-${esc(p.theme)}" href="/aksiya/${esc(p.slug)}">
      <span class="pt-emoji">${esc(p.emoji || '🔥')}</span>
      <div class="pt-body"><b>${esc(p.name)}</b><span>${esc(p.subtitle || '')}</span></div>
      <div class="pt-foot"><span class="pt-disc">${esc(t('promo_upto', { n: p.max_discount }))}</span>${p.ends_on ? `<em>${esc(t('promo_until', { d: fmtDate(p.ends_on) }))}</em>` : ''}</div>
    </a>`).join('')}</div>
  </section>`;
}

// /aksiya/:slug
export async function promo({ params, query }) {
  const r = await api(`/promos/${encodeURIComponent(params[0])}${qs({ page: query.page, country: state.country || undefined })}`);
  const p = r.promo;
  const left = daysLeft(p.ends_on);
  const html = `
    ${crumbs([[t('home'), '/'], [t('promo_sec')], [p.name]])}
    <section class="promo-hero t-${esc(p.theme)}">
      <div class="ph-text">
        <span class="ph-kicker">${esc(t('promo_kicker'))}</span>
        <h1>${esc(p.emoji || '')} ${esc(p.name)}</h1>
        <p>${esc(p.subtitle || '')}</p>
        <div class="ph-stats">
          <span><b>${esc(t('promo_upto', { n: p.max_discount }))}</b></span>
          <span>${icon('box')} ${esc(t('promo_count', { n: num(p.count) }))}</span>
          ${left !== null ? `<span>${icon('calendar')} ${esc(left ? t('promo_days_left', { n: left }) : t('promo_last_day'))}</span>` : ''}
        </div>
      </div>
      <span class="ph-big" aria-hidden="true">−${p.max_discount}%</span>
    </section>
    <div class="box promo-cta">
      <div><b>${esc(t('promo_cta'))}</b><span>${esc(t('promo_cta_sub'))}</span></div>
      <a class="btn btn-primary" href="/my/listings">${icon('plus')} ${esc(t('promo_join'))}</a>
    </div>
    ${r.items.length ? cards(r.items, 4) : emptyBox(t('promo_empty'), t('promo_empty_sub'))}
    ${pager(r.page, r.pages, (pg) => `/aksiya/${encodeURIComponent(p.slug)}${qs({ page: pg })}`)}
    ${r.related.length ? `<section class="sec"><div class="sec-head"><div><h2>${esc(t('promo_related'))}</h2></div></div>${cards(r.related, 4)}</section>` : ''}`;
  return { title: p.name, html };
}

// "E'lonlarim": e'lonni aksiyaga qo'shish / chegirmani o'zgartirish / chiqarish
export async function promoJoinModal(listing, onDone) {
  const r = await api(`/listings/${listing.id}/promos`);
  const body = !r.has_price ? `<p class="muted">${esc(t('promo_need_price'))}</p>`
    : !r.items.length ? `<p class="muted">${esc(t('promo_none'))}</p>`
      : r.items.map((p) => `<form class="promo-join t-${esc(p.theme)}" data-slug="${esc(p.slug)}">
        <div class="pj-hd"><span class="pt-emoji">${esc(p.emoji || '')}</span><div><b>${esc(p.name)}</b><span class="tiny muted">${esc(t('promo_upto', { n: p.max_discount }))}${p.ends_on ? ` · ${esc(t('promo_until', { d: fmtDate(p.ends_on) }))}` : ''}</span></div>${p.joined ? `<span class="tag green">${esc(t('promo_joined'))}</span>` : ''}</div>
        <div class="pj-row">
          <label class="lbl">${esc(t('promo_discount'))}</label>
          <input class="input" name="pct" type="number" min="${r.min}" max="${r.max}" step="1" required value="${p.discount_pct || p.max_discount}">
          ${listing.price?.amount ? `<span class="pj-new" data-new></span>` : ''}
        </div>
        <div class="pj-acts"><button class="btn btn-primary btn-sm">${esc(p.joined ? t('save_changes') : t('promo_join'))}</button>${p.joined ? `<button type="button" class="btn btn-ghost btn-sm" data-leave>${esc(t('promo_leave'))}</button>` : ''}</div>
      </form>`).join('');
  const m = openModal(`<h3>${esc(t('promo_join'))}</h3><p class="small muted" style="margin:4px 0 14px">${esc(listing.title || '')}</p>${body}`);
  const amount = Number(listing.price?.amount) || 0;
  const cur = listing.price?.currency || '';
  m.querySelectorAll('form.promo-join').forEach((f) => {
    const upd = () => {
      const out = f.querySelector('[data-new]');
      if (!out) return;
      const pct = Number(f.pct.value) || 0;
      out.textContent = `${t('promo_new_price')}: ${num(Math.round(amount * (100 - pct) / 100))} ${cur}`;
    };
    upd();
    f.pct.addEventListener('input', upd);
    f.onsubmit = async (e) => {
      e.preventDefault();
      await api(`/listings/${listing.id}/promos/${f.dataset.slug}`, { method: 'POST', body: { discount_pct: Number(f.pct.value) } });
      toast(t('promo_saved'), 'ok');
      closeModal();
      onDone?.();
    };
    f.querySelector('[data-leave]')?.addEventListener('click', async () => {
      await api(`/listings/${listing.id}/promos/${f.dataset.slug}`, { method: 'DELETE' });
      closeModal();
      onDone?.();
    });
  });
}
