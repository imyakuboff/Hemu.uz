// Mavsumiy aksiyalar: bosh sahifa qatori, aksiya sahifasi, e'lonni aksiyaga qo'shish oynasi
import { state, t, esc, api, icon, num, qs, fmtDate, openModal, closeModal, toast } from '../core.js';
import { crumbs, cards, pager, emptyBox, accountLayout } from '../ui.js';
import { render } from '../app.js';

const daysLeft = (iso) => (iso ? Math.max(0, Math.ceil((new Date(`${iso}T23:59:59`) - Date.now()) / 86400000)) : null);

// Bosh sahifa: faol aksiyalar kartochkalari
export function promoStrip(list) {
  if (!list?.length) return '';
  return `<section class="sec promo-sec">
    <div class="sec-head"><div><h2>${esc(t('promo_sec'))}</h2><p>${esc(t('promo_sec_sub'))}</p></div></div>
    <div class="promo-strip">${list.map((p) => `<a class="promo-tile t-${esc(p.theme)}" href="/aksiya/${esc(p.slug)}">
      <span class="pt-emoji">${esc(p.emoji || '🔥')}</span>
      <div class="pt-body">${p.seller ? `<small class="pt-seller">${p.seller.verified ? '✔ ' : ''}${esc(p.seller.name)}</small>` : ''}<b>${esc(p.name)}</b><span>${esc(p.subtitle || '')}</span></div>
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
        <span class="ph-kicker">${p.seller ? `${p.seller.verified ? '✔ ' : ''}${esc(p.seller.name)}` : esc(t('promo_kicker'))}</span>
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
    ${p.seller ? (p.seller.company_id ? `<div class="box promo-cta"><div><b>${esc(p.seller.name)}</b><span>${esc(t('promo_seller_all'))}</span></div><a class="btn btn-soft" href="/company/${p.seller.company_id}">${icon('building')} ${esc(t('promo_seller_store'))}</a></div>` : '')
    : `<div class="box promo-cta">
      <div><b>${esc(t('promo_cta'))}</b><span>${esc(t('promo_cta_sub'))}</span></div>
      <a class="btn btn-primary" href="/my/listings">${icon('plus')} ${esc(t('promo_join'))}</a>
    </div>`}
    ${r.items.length ? cards(r.items, 4) : emptyBox(t('promo_empty'), t('promo_empty_sub'))}
    ${pager(r.page, r.pages, (pg) => `/aksiya/${encodeURIComponent(p.slug)}${qs({ page: pg })}`)}
    ${r.related.length ? `<section class="sec"><div class="sec-head"><div><h2>${esc(t(p.seller ? 'promo_seller_more' : 'promo_related'))}</h2></div></div>${cards(r.related, 4)}</section>` : ''}`;
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

// ---------- Sotuvchi / firma: o'z aksiyalari (/my/promos) ----------
const THEMES = [['red', '🔴'], ['orange', '🟠'], ['green', '🟢'], ['blue', '🔵'], ['purple', '🟣']];
const EMOJIS = ['🔥', '⚙️', '🛞', '🔧', '🚜', '🏗️', '❄️', '🌱', '🎁', '💥'];
const isoIn = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const STATUS = { active: ['green', 'promo_st_active'], moderation: ['orange', 'promo_st_moderation'], rejected: ['red', 'promo_st_rejected'] };

function myForm(r, p = null) {
  const sel = new Set(p ? p.listing_ids : r.listings.map((l) => l.id));
  return `<form class="box my-promo-form" data-mpf="${p?.id || ''}">
    <h3 style="margin-top:0">${esc(p ? p.name : t('promo_new'))}</h3>
    <div class="form-grid">
      <div class="full"><label class="lbl">${esc(t('promo_f_name'))} *</label><input class="input" name="name" required minlength="4" maxlength="80" value="${esc(p?.name_raw || '')}" placeholder="${esc(t('promo_f_name_ph'))}"></div>
      <div class="full"><label class="lbl">${esc(t('promo_f_sub'))}</label><input class="input" name="subtitle" maxlength="140" value="${esc(p?.subtitle_raw || '')}" placeholder="${esc(t('promo_f_sub_ph'))}"></div>
      <div><label class="lbl">${esc(t('promo_discount'))} *</label><input class="input" name="discount_pct" type="number" min="3" max="70" required value="${p?.discount_pct || 15}"></div>
      <div><label class="lbl">${esc(t('promo_f_until'))} *</label><input class="input" name="ends_on" type="date" required min="${isoIn(0)}" max="${isoIn(r.max_days)}" value="${esc(p?.ends_on || isoIn(14))}"></div>
      <div class="full"><label class="lbl">${esc(t('promo_f_look'))}</label>
        <div class="mp-pick">${EMOJIS.map((e) => `<label><input type="radio" name="emoji" value="${e}" ${(p?.emoji || '🔥') === e ? 'checked' : ''}><span>${e}</span></label>`).join('')}</div>
        <div class="mp-pick" style="margin-top:8px">${THEMES.map(([v, e]) => `<label class="t-${v}"><input type="radio" name="theme" value="${v}" ${(p?.theme || 'red') === v ? 'checked' : ''}><span class="mp-color"></span></label>`).join('')}</div></div>
      <div class="full"><label class="lbl">${esc(t('promo_f_listings'))} · <a href="#" class="link-blue" data-all>${esc(t('all'))}</a></label>
        ${r.listings.length ? `<div class="mp-listings">${r.listings.map((l) => `<label class="check"><input type="checkbox" name="lid" value="${l.id}" ${sel.has(l.id) ? 'checked' : ''}> <span>${esc(l.title)}</span><em>${num(l.price)} ${esc(l.currency)}</em></label>`).join('')}</div>` : `<p class="small muted">${esc(t('promo_need_price'))}</p>`}</div>
    </div>
    <p class="tiny muted" style="margin:10px 0 0">${esc(t(r.instant ? 'promo_f_instant' : 'promo_f_moderation'))}</p>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn btn-primary">${esc(p ? t('save_changes') : t('promo_create'))}</button>${p ? `<button type="button" class="btn btn-ghost" data-mpdel="${p.id}">${icon('trash')} ${esc(t('delete'))}</button>` : ''}</div>
  </form>`;
}

export async function myPromos({ query }) {
  if (!state.user) return { title: t('login'), html: emptyBox(t('login_required')) };
  const r = await api('/my/promos');
  const editing = r.items.find((x) => String(x.id) === query.edit);
  const open = r.items.filter((x) => x.status !== 'rejected' && (!x.ends_on || x.ends_on >= isoIn(0))).length;
  const html = accountLayout('/my/promos', `
    ${crumbs([[t('home'), '/'], [t('my_promos')]])}
    <div class="page-head"><h1 class="page-title">${esc(t('my_promos'))}</h1><p class="page-sub">${esc(t('my_promos_sub'))}</p></div>
    ${r.items.map((p) => `<div class="box my-promo t-${esc(p.theme)}">
      <span class="pt-emoji">${esc(p.emoji || '')}</span>
      <div class="grow"><b>${esc(p.name)}</b><span class="tiny muted">−${p.discount_pct}% · ${esc(t('promo_until', { d: fmtDate(p.ends_on) }))} · ${esc(t('promo_count', { n: num(p.count) }))}</span>
        ${p.status === 'rejected' && p.reject_reason ? `<span class="tiny" style="color:var(--red)">${esc(p.reject_reason)}</span>` : ''}</div>
      <span class="tag ${STATUS[p.status]?.[0] || 'grey'}">${esc(p.live ? t('promo_st_live') : t(STATUS[p.status]?.[1] || 'promo_st_ended'))}</span>
      ${p.status === 'active' ? `<a class="btn btn-soft btn-sm" href="/aksiya/${esc(p.slug)}">${icon('eye')}</a>` : ''}
      <a class="btn btn-soft btn-sm" href="/my/promos?edit=${p.id}">${esc(t('edit'))}</a>
    </div>`).join('')}
    ${editing ? myForm(r, editing) : open < r.limit ? myForm(r) : `<div class="box empty"><p>${esc(t('promo_limit', { n: r.limit }))}</p></div>`}`);
  return {
    title: t('my_promos'),
    html,
    mount(main) {
      const f = main.querySelector('[data-mpf]');
      main.querySelector('[data-all]')?.addEventListener('click', (e) => {
        e.preventDefault();
        const boxes = [...f.querySelectorAll('[name=lid]')];
        const on = boxes.some((b) => !b.checked);
        boxes.forEach((b) => { b.checked = on; });
      });
      f?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = {
          name: f.name.value.trim(), subtitle: f.subtitle.value.trim(), discount_pct: Number(f.discount_pct.value), ends_on: f.ends_on.value,
          emoji: f.querySelector('[name=emoji]:checked')?.value, theme: f.querySelector('[name=theme]:checked')?.value,
          listing_ids: [...f.querySelectorAll('[name=lid]:checked')].map((x) => Number(x.value)),
        };
        const id = f.dataset.mpf;
        const saved = await api(id ? `/my/promos/${id}` : '/my/promos', { method: id ? 'PUT' : 'POST', body });
        toast(t(saved.status === 'moderation' ? 'promo_sent_mod' : 'promo_saved'), 'ok');
        history.replaceState(null, '', '/my/promos');
        render({ keepScroll: false });
      });
      main.querySelector('[data-mpdel]')?.addEventListener('click', async (e) => {
        await api(`/my/promos/${e.currentTarget.dataset.mpdel}`, { method: 'DELETE' });
        history.replaceState(null, '', '/my/promos');
        render();
      });
    },
  };
}
