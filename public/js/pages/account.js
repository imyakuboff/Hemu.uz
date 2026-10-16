import { state, t, esc, api, icon, num, money, qs, fmtRel, fmtDate, openModal, closeModal, toast, confirmBox, $, $$ } from '../core.js';
import { crumbs, cards, card, accountLayout, pager, imgOf, priceText, emptyBox, factsLine, locLine, ratingHtml } from '../ui.js';
import { go, render } from '../app.js';
import { promoteModal, providerOptions, bindSeg, goPay } from '../features.js';
import { promoJoinModal } from './promos.js';
import { escrowPayModal } from './listing.js';

const needLogin = () => ({ title: t('login'), html: `<div class="box empty"><h3>${esc(t('login_required'))}</h3><button class="btn btn-primary" data-login style="margin-top:14px">${esc(t('login'))}</button></div>` });
const head = (title, sub, path) => `${crumbs([[t('home'), '/'], [t('dashboard'), '/dashboard'], [title]])}<div class="page-head"><h1 class="page-title">${esc(title)}</h1>${sub ? `<p class="page-sub">${esc(sub)}</p>` : ''}</div>`;
const refresh = () => render({ keepScroll: true });
const statusTag = (s, label) => `<span class="tag ${{ active: 'green', completed: 'green', delivered: 'green', moderation: 'orange', new: 'orange', draft: 'grey', archived: 'grey', cancelled: 'red', rejected: 'red', sold: 'grey', closed: 'grey', deleted: 'red' }[s] || ''}">${esc(label)}</span>`;

// ---------- E'lon statistikasi (30 kun) ----------
async function statsModal(l) {
  const days = 30;
  const r = await api(`/seller/stats${qs({ listing_id: l.id, days })}`);
  const by = Object.fromEntries(r.items.map((x) => [x.day, x]));
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    series.push({ day: d, views: by[d]?.views || 0, phone: by[d]?.phone_reveals || 0, fav: by[d]?.favorites || 0 });
  }
  const sum = (k) => series.reduce((a, x) => a + x[k], 0);
  const max = Math.max(1, ...series.map((x) => x.views));
  openModal(`<h3>${icon('chart')} ${esc(t('stats'))}</h3><p class="small muted" style="margin:-4px 0 12px">${esc(l.title)}</p>
    <div class="stats" style="margin:0 0 14px">
      <div class="stat"><span>${esc(t('views_lbl'))}</span><b>${num(sum('views'))}</b></div>
      <div class="stat"><span>${esc(t('f_phone_reveals'))}</span><b>${num(sum('phone'))}</b></div>
      <div class="stat"><span>${esc(t('in_favorites'))}</span><b>${num(sum('fav'))}</b></div>
    </div>
    <div style="display:flex;align-items:flex-end;gap:3px;height:150px;padding:8px 0;border-bottom:1px solid var(--line)">
      ${series.map((x) => `<div title="${esc(`${fmtDate(x.day)}: ${x.views} / ${x.phone}`)}" style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%">
        <div style="height:${Math.round((x.views / max) * 100)}%;min-height:${x.views ? 3 : 1}px;background:${x.views ? 'var(--blue)' : 'var(--line)'};border-radius:3px 3px 0 0;position:relative">${x.phone ? `<span style="position:absolute;left:0;right:0;bottom:0;height:${Math.round((x.phone / Math.max(1, x.views)) * 100)}%;background:var(--teal);border-radius:3px 3px 0 0"></span>` : ''}</div></div>`).join('')}
    </div>
    <div class="tiny muted" style="display:flex;justify-content:space-between;margin-top:6px"><span>${esc(fmtDate(series[0].day))}</span><span>${esc(fmtDate(series[days - 1].day))}</span></div>
    <div class="tiny" style="display:flex;gap:14px;margin-top:10px"><span><i style="display:inline-block;width:10px;height:10px;background:var(--blue);border-radius:2px"></i> ${esc(t('views_lbl'))}</span><span><i style="display:inline-block;width:10px;height:10px;background:var(--teal);border-radius:2px"></i> ${esc(t('f_phone_reveals'))}</span></div>
    <a class="btn btn-soft btn-block" style="margin-top:14px" href="/analytics" data-close-link>${esc(t('details'))}</a>`, { wide: true, onMount: (el) => el.querySelector('[data-close-link]').addEventListener('click', closeModal) });
}

// ---------- Mening e'lonlarim ----------
export async function myListings({ query }) {
  if (!state.user) return needLogin();
  const st = query.status || '';
  const res = await api(`/my/listings${qs({ status: st, page: query.page })}`);
  const c = res.counts || {};
  const all = Object.entries(c).filter(([k]) => k !== 'deleted').reduce((a, [, b]) => a + b, 0);
  const label = (s) => state.meta.listing_statuses.find((x) => x.value === s)?.label;
  const tabs = [['', `${t('all')} · ${all}`], ['active', `${label('active')} · ${c.active || 0}`], ['moderation', `${label('moderation')} · ${c.moderation || 0}`], ['draft', `${label('draft')} · ${c.draft || 0}`]];
  if (c.rejected) tabs.push(['rejected', `${label('rejected')} · ${c.rejected}`]);
  if (c.archived || c.sold) tabs.push(['archived', `${label('archived')} · ${(c.archived || 0)}`]);
  if (c.deleted) tabs.push(['deleted', `${label('deleted') || t('delete')} · ${c.deleted}`]);

  const row = (l) => {
    const acts = l.status === 'deleted'
      ? [`<button class="btn btn-primary btn-sm" data-act="restore" data-id="${l.id}">${esc(t('restore'))}</button>`, `<button class="btn btn-ghost btn-sm" data-act="purge" data-id="${l.id}">${icon('trash')} ${esc(t('delete_forever'))}</button>`]
      : [`<a class="btn btn-soft btn-sm" href="/create/${l.id}">${esc(t('edit'))}</a>`];
    if (l.status === 'deleted') return rowHtml(l, acts);
    if (l.status === 'active') acts.push(`<button class="btn btn-soft btn-sm" data-act="bump" data-id="${l.id}">${esc(t('bump'))}</button>`);
    if (l.status === 'active') acts.push(`<button class="btn btn-primary btn-sm" data-promote="${l.id}">${icon('rocket')} ${esc(t('promote'))}</button>`);
    if (l.status === 'active') acts.push(`<button class="btn btn-soft btn-sm promo-act" data-promo-join="${l.id}">${l.promo ? `${esc(l.promo.emoji || '')} −${l.promo.pct}%` : `% ${esc(t('promo_short'))}`}</button>`);
    if (['draft', 'rejected', 'archived'].includes(l.status)) acts.push(`<button class="btn btn-soft btn-sm" data-act="publish" data-id="${l.id}">${esc(t('publish_short'))}</button>`);
    acts.push(`<a class="btn btn-soft btn-sm" href="/listing/${l.id}">${esc(t('details'))}</a>`);
    if (l.status === 'active') acts.push(`<button class="btn btn-ghost btn-sm" data-act="sold" data-id="${l.id}">${esc(t('mark_sold'))}</button>`);
    if (['active', 'moderation', 'draft', 'rejected'].includes(l.status)) acts.push(`<button class="btn btn-ghost btn-sm" data-act="archive" data-id="${l.id}">${esc(t('archive'))}</button>`);
    if (['active', 'sold', 'archived'].includes(l.status)) acts.push(`<button class="btn btn-soft btn-sm" data-stats="${l.id}">${icon('chart')} ${esc(t('stats'))}</button>`);
    acts.push(`<button class="btn btn-ghost btn-sm" data-act="delete" data-id="${l.id}" title="${esc(t('delete'))}">${icon('trash')}</button>`);
    return rowHtml(l, acts);
  };
  const rowHtml = (l, acts) => {
    return `<div class="row-item">
      <a class="thumb" href="/listing/${l.id}"><img src="${esc(imgOf(l))}" alt=""></a>
      <div>
        ${statusTag(l.status, l.status_label)}
        <div class="t" style="margin-top:6px">${esc(l.title)}</div>
        <div class="p">${esc(priceText(l.price))}</div>
        <div class="m">${esc([locLine(l.location), fmtRel(l.bumped_at || l.updated_at)].filter(Boolean).join(' · '))}<br>
          ${esc(l.seller.name)}${l.seller.reviews_count ? ` · ★ ${String(l.seller.rating).replace('.', ',')} · ${esc(t('reviews', { n: l.seller.reviews_count }))}` : ''}<br>
          ${esc(t('views', { n: l.status === 'active' ? num(l.views) : '—' }))} · <a href="/messages">${esc(t('chats', { n: l.conversations || '—' }))}</a>
          ${l.reject_reason ? `<br><span style="color:var(--red)">${esc(t('reject_reason', { r: l.reject_reason }))}</span>` : ''}</div>
        <div class="actions">${acts.join('')}</div>
      </div>
      <button class="fav ${l.is_favorite ? 'on' : ''}" style="position:static;box-shadow:none" data-fav="${l.id}">${icon('heart')}</button>
    </div>`;
  };

  const html = accountLayout('/my/listings', `
    ${head(t('my_listings'), t('my_listings_sub'))}
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start">
      <div class="tabs">${tabs.map(([v, l]) => `<a class="tab ${st === v ? 'on' : ''}" href="/my/listings${qs({ status: v })}">${esc(l)}</a>`).join('')}</div>
      <div style="display:flex;gap:8px"><a href="/my/import" class="btn btn-soft">${icon('upload')} ${esc(t('import'))}</a><a href="/create" class="btn btn-primary">${icon('plus')} ${esc(t('post_listing'))}</a></div>
    </div>
    ${st === 'deleted' ? `<p class="small muted" style="margin:0 0 10px">${icon('calendar')} ${esc(t('deleted_note'))}</p>` : ''}
    ${res.items.length ? res.items.map(row).join('') : emptyBox(t('empty'))}
    ${pager(res.page, res.pages, (p) => `/my/listings${qs({ status: st, page: p })}`)}`);

  return {
    title: t('my_listings'),
    html,
    mount(main) {
      if (/^\d+$/.test(query.promote || '') && ['vip', 'gold', 'premium'].includes(query.tier)) {
        const pl = res.items.find((x) => String(x.id) === query.promote);
        (pl ? Promise.resolve(pl) : api(`/listings/${query.promote}`, { silent: true }).catch(() => ({ id: Number(query.promote), title: '' }))).then((l) => promoteModal(l, query.tier));
        history.replaceState(null, '', '/my/listings');
      }
      main.addEventListener('click', async (e) => {
        const pr = e.target.closest('[data-promote]');
        if (pr) return promoteModal(res.items.find((x) => String(x.id) === pr.dataset.promote));
        const pj = e.target.closest('[data-promo-join]');
        if (pj) return promoJoinModal(res.items.find((x) => String(x.id) === pj.dataset.promoJoin), () => render({ keepScroll: true }));
        const sb = e.target.closest('[data-stats]');
        if (sb) return statsModal(res.items.find((x) => String(x.id) === sb.dataset.stats));
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const { act, id } = b.dataset;
        if (act === 'restore') {
          await api(`/listings/${id}/restore`, { method: 'POST' });
          toast(t('saved'), 'ok');
        } else if (act === 'purge') {
          if (!(await confirmBox(t('delete_forever')))) return;
          await api(`/listings/${id}?permanent=1`, { method: 'DELETE' });
        } else if (act === 'delete') {
          if (!(await confirmBox(t('confirm_delete')))) return;
          await api(`/listings/${id}`, { method: 'DELETE' });
        } else if (act === 'publish') {
          try {
            const r = await api(`/listings/${id}/publish`, { method: 'POST', body: { accept_rules: true } });
            toast(r.status === 'active' ? t('published') : t('sent_moderation'), 'ok');
          } catch (err) { if (err.details?.photos || err.details?.description) go(`/create/${id}`); return; }
        } else {
          await api(`/listings/${id}/${act}`, { method: 'POST' });
          toast(t('saved'), 'ok');
        }
        refresh();
      });
    },
  };
}

// ---------- Buyurtmalar ----------
function orderCard(o) {
  const other = o.role === 'buyer' ? o.seller : o.buyer;
  const delivery = o.delivery.carrier || o.delivery.eta ? t('in_delivery_by', { c: o.delivery.carrier || t(`dm_${o.delivery.method}`), d: o.delivery.eta || '—' }) : t(`dm_${o.delivery.method}`);
  const primary = o.actions.includes('pay') ? `<button class="btn btn-primary btn-sm" data-pay="${o.id}">${icon('card')} ${esc(t('act_pay'))} ${esc(o.escrow.to_pay_formatted)}</button>`
    : o.status === 'shipped' ? `<button class="btn btn-primary btn-sm" data-track="${o.id}">${esc(t('track'))}</button>` : '';
  return `<div class="order">
    <div class="hd"><span>${esc(t('order_no', { n: o.number, d: fmtDate(o.created_at) }))}</span><span style="display:flex;gap:6px;flex-wrap:wrap">${o.escrow ? `<span class="tag ${o.escrow.status === 'held' || o.escrow.status === 'released' ? 'green' : o.escrow.status === 'disputed' ? 'red' : 'orange'}">${icon('shield')} ${esc(o.escrow.label)}</span>` : ''}${statusTag(o.status, o.status_label)}</span></div>
    <div class="bd">
      <a class="thumb" href="${o.listing ? `/listing/${o.listing.id}` : '#'}"><img src="${esc(o.listing?.cover || '/img/demo/filter2.jpg')}" alt=""></a>
      <div><div class="t">${esc(o.title)}</div>
        <div class="m">${o.qty} × ${esc(o.unit_price_formatted)}${o.delivery_cost ? ` + ${esc(money(o.delivery_cost, o.currency))}` : ''}<br>${esc(other.company?.name || other.name || '')}<br><a>${esc(delivery)}</a></div></div>
      <div class="sum">${esc(o.total_formatted)}</div>
    </div>
    <div class="actions">${primary}<button class="btn btn-soft btn-sm" data-details="${o.id}">${esc(t('order_details'))}</button><button class="btn btn-soft btn-sm" data-invoice="${o.id}">${esc(t('documents'))}</button></div>
  </div>`;
}

// Buyurtma bosqichlari (to'liq sahifada)
const ORDER_STEPS = ['new', 'confirmed', 'shipped', 'delivered', 'completed'];
function orderProgress(o) {
  if (!ORDER_STEPS.includes(o.status)) return '';
  const at = ORDER_STEPS.indexOf(o.status);
  const label = (v) => state.meta.order_statuses.find((x) => x.value === v)?.label || v;
  return `<div class="ord-steps">${ORDER_STEPS.map((v, i) => `<div class="${i < at ? 'done' : i === at ? 'now' : ''}"><i>${i < at ? icon('check') : i + 1}</i><span>${esc(label(v))}</span></div>`).join('')}</div>`;
}

function orderHtml(o) {
  const actBtn = (a) => ({
    confirm: `<button class="btn btn-primary btn-sm" data-oa="confirm">${esc(t('act_confirm'))}</button>`,
    ship: `<button class="btn btn-primary btn-sm" data-oa="ship">${esc(t('act_ship'))}</button>`,
    deliver: `<button class="btn btn-soft btn-sm" data-oa="deliver">${esc(t('act_deliver'))}</button>`,
    complete: `<button class="btn btn-primary btn-sm" data-oa="complete">${esc(t('act_complete'))}</button>`,
    cancel: `<button class="btn btn-danger btn-sm" data-oa="cancel">${esc(t('act_cancel'))}</button>`,
    review: `<button class="btn btn-soft btn-sm" data-oa="review">${esc(t('act_review'))}</button>`,
    pay: `<button class="btn btn-primary btn-sm" data-oa="pay">${icon('card')} ${esc(t('act_pay'))}</button>`,
    dispute: `<button class="btn btn-ghost btn-sm" data-oa="dispute">${icon('flag')} ${esc(t('act_dispute'))}</button>`,
  }[a]);
  return `<h3>${esc(t('order_no', { n: o.number, d: fmtDate(o.created_at) }))}</h3>
    <p style="margin:6px 0 12px">${statusTag(o.status, o.status_label)}</p>
    <table class="spec">
      <tr><td>${esc(o.title)}</td><td>${o.qty} × ${esc(o.unit_price_formatted)}</td></tr>
      ${o.delivery_cost ? `<tr><td>${esc(t('delivery_cost'))}</td><td>${esc(money(o.delivery_cost, o.currency))}</td></tr>` : ''}
      <tr><td>${esc(t('total'))}</td><td>${esc(o.total_formatted)}${o.total_display ? ` <span class="muted">(≈ ${esc(o.total_display)})</span>` : ''}</td></tr>
      ${o.escrow ? `<tr><td>${esc(t('safe_deal'))}</td><td>${esc(o.escrow.label)} · ${esc(t('escrow_fee'))}: ${esc(o.escrow.fee_formatted)}</td></tr>` : ''}
      <tr><td>${esc(t('delivery_method'))}</td><td>${esc(t(`dm_${o.delivery.method}`))}${o.delivery.address ? `, ${esc(o.delivery.address)}` : ''}</td></tr>
      ${o.delivery.carrier ? `<tr><td>${esc(t('carrier'))}</td><td>${esc(o.delivery.carrier)}</td></tr>` : ''}
      ${o.delivery.tracking ? `<tr><td>${esc(t('tracking'))}</td><td>${esc(o.delivery.tracking)}</td></tr>` : ''}
      ${o.delivery.eta ? `<tr><td>${esc(t('eta'))}</td><td>${esc(o.delivery.eta)}</td></tr>` : ''}
      <tr><td>${esc(t('seller'))}</td><td>${esc(o.seller.company?.name || o.seller.name || '')}</td></tr>
      ${o.note ? `<tr><td>${esc(t('comment'))}</td><td>${esc(o.note)}</td></tr>` : ''}
    </table>
    <ul class="timeline">${o.events.map((ev) => `<li><span>${esc(fmtDate(ev.created_at, true))}</span>${esc(ev.status_label)}${ev.note ? ` — ${esc(ev.note)}` : ''}</li>`).join('')}</ul>
    <div data-extra></div>
    <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">${o.actions.map(actBtn).join('')}</div>`;
}

function bindOrder(root, o, after) {
  const id = o.id;
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-oa]');
    if (!b) return;
    const a = b.dataset.oa;
    const extra = $('[data-extra]', root);
    if (a === 'pay') { closeModal(); return escrowPayModal(o); }
    if (a === 'dispute') {
      extra.innerHTML = `<div style="margin-top:12px"><label class="lbl">${esc(t('dispute_reason'))}</label><textarea class="input" name="reason" minlength="10" style="min-height:80px"></textarea><button class="btn btn-danger btn-sm" style="margin-top:8px" data-send-dispute>${esc(t('send'))}</button></div>`;
      extra.querySelector('[data-send-dispute]').onclick = async () => {
        await api(`/orders/${id}/dispute`, { method: 'POST', body: { reason: extra.querySelector('[name=reason]').value.trim() } });
        toast(t('sent'), 'ok'); after();
      };
      return;
    }
    if (a === 'ship' && !extra.dataset.open) {
      extra.dataset.open = '1';
      extra.innerHTML = `<div class="form-grid" style="margin-top:12px"><div><label class="lbl">${esc(t('carrier'))}</label><input class="input" name="carrier"></div><div><label class="lbl">${esc(t('tracking'))}</label><input class="input" name="tracking"></div><div><label class="lbl">${esc(t('eta'))}</label><input class="input" name="eta"></div></div>`;
      return;
    }
    if (a === 'confirm' && !extra.dataset.open) {
      extra.dataset.open = '1';
      extra.innerHTML = `<div class="form-grid" style="margin-top:12px"><div><label class="lbl">${esc(t('delivery_cost'))}, ${esc(o.currency)}</label><input class="input" name="delivery_cost" inputmode="numeric"></div><div><label class="lbl">${esc(t('eta'))}</label><input class="input" name="eta"></div></div>`;
      return;
    }
    if (a === 'review') {
      extra.innerHTML = `<div style="margin-top:12px"><label class="lbl">${esc(t('rating'))}</label><div class="stars">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-star="${n}" class="on">${icon('star')}</button>`).join('')}</div><textarea class="input" name="text" style="margin-top:8px;min-height:70px"></textarea><button class="btn btn-primary btn-sm" style="margin-top:8px" data-send-review>${esc(t('send'))}</button></div>`;
      let rating = 5;
      extra.querySelectorAll('[data-star]').forEach((s) => s.addEventListener('click', () => { rating = Number(s.dataset.star); extra.querySelectorAll('[data-star]').forEach((x) => x.classList.toggle('on', Number(x.dataset.star) <= rating)); }));
      extra.querySelector('[data-send-review]').onclick = async () => {
        await api(`/orders/${id}/review`, { method: 'POST', body: { rating, text: extra.querySelector('[name=text]').value.trim() || undefined } });
        toast(t('sent'), 'ok'); after();
      };
      return;
    }
    const val = (n) => extra.querySelector(`[name=${n}]`)?.value.trim() || undefined;
    const body = a === 'ship' ? { carrier: val('carrier'), tracking: val('tracking'), eta: val('eta') }
      : a === 'confirm' ? { delivery_cost: val('delivery_cost') ? Number(val('delivery_cost').replace(/\s/g, '')) : undefined, eta: val('eta') } : {};
    if (a === 'cancel' && !(await confirmBox(t('act_cancel')))) return;
    await api(`/orders/${id}/${a}`, { method: 'POST', body });
    toast(t('saved'), 'ok');
    after();
  });
}

async function orderModal(id) {
  const o = await api(`/orders/${id}`);
  const m = openModal(orderHtml(o), { wide: true });
  bindOrder(m, o, () => { closeModal(); refresh(); });
}

// To'liq buyurtma sahifasi: /orders/:id (bildirishnomalardagi havola)
export async function orderPage({ params }) {
  if (!state.user) return needLogin();
  const o = await api(`/orders/${params[0]}`);
  const html = accountLayout('/my/orders', `<a class="link-blue" href="/my/orders${o.role === 'seller' ? '?tab=sales' : ''}" style="display:inline-flex;margin-bottom:12px">${icon('arrow-left')} ${esc(t('to_orders'))}</a>
    <div class="box order-page">${orderProgress(o)}${orderHtml(o)}</div>`);
  return { title: t('order_no', { n: o.number, d: fmtDate(o.created_at) }), html, mount(main) { bindOrder(main, o, () => refresh()); } };
}

async function invoiceModal(id) {
  const inv = await api(`/orders/${id}/invoice`);
  openModal(`<h3>${esc(t('invoice'))} № ${esc(inv.number)}</h3><p class="small muted">${esc(inv.date)}</p>
    <table class="spec"><tr><td>${esc(t('seller'))}</td><td>${esc(inv.seller.name || '')}${inv.seller.tin ? `<br>${esc(t('tin'))}: ${esc(inv.seller.tin)}` : ''}${inv.seller.address ? `<br>${esc(inv.seller.address)}` : ''}</td></tr>
    ${inv.items.map((it) => `<tr><td>${esc(it.title)}</td><td>${it.qty} × ${esc(money(it.unit_price, inv.currency))} = ${esc(money(it.amount, inv.currency))}</td></tr>`).join('')}
    ${inv.delivery_cost ? `<tr><td>${esc(t('delivery_cost'))}</td><td>${esc(money(inv.delivery_cost, inv.currency))}</td></tr>` : ''}
    ${inv.vat_rate ? `<tr><td>${esc(t('sp_vat'))} ${inv.vat_rate}%</td><td>${esc(money(inv.vat_included, inv.currency))}</td></tr>` : ''}
    <tr><td><b>${esc(t('total'))}</b></td><td>${esc(inv.total_formatted)}</td></tr></table>
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><button class="btn btn-primary" data-pdf>${icon('file')} ${esc(t('download'))} PDF</button><button class="btn btn-soft" data-print>${esc(t('print'))}</button></div>`, {
    wide: true,
    onMount(el) {
      el.querySelector('[data-print]').onclick = () => window.print();
      // Yuridik shaxslar uchun hisob-faktura PDF (token bilan yuklab olinadi)
      el.querySelector('[data-pdf]').onclick = async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          const res = await fetch(`/api/v1/orders/${id}/invoice.pdf?lang=${state.lang}`, { headers: { Authorization: `Bearer ${state.token}`, 'Accept-Language': state.lang } });
          if (!res.ok) throw new Error(res.status);
          const url = URL.createObjectURL(await res.blob());
          const a = Object.assign(document.createElement('a'), { href: url, download: `invoice-${inv.number}.pdf` });
          document.body.append(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        } catch { toast(t('error'), 'err'); } finally { btn.disabled = false; }
      };
    },
  });
}

function requestRow(r) {
  return `<div class="order">
    <div class="hd"><span>${esc(r.title)}</span>${statusTag(r.status === 'open' ? 'active' : r.status, r.status === 'draft' ? t('draft_lbl') : r.status === 'open' ? state.meta.listing_statuses.find((s) => s.value === 'active').label : t('completed_tab'))}</div>
    <div class="m small muted" style="margin-top:8px">${esc([r.subcategory?.name, r.location.region_name || r.location.country_name, r.budget.formatted, r.needed_by].filter(Boolean).join(' · '))}</div>
    <p class="small" style="margin:8px 0 0">${esc(r.description)}</p>
    <div class="actions">
      <button class="btn btn-primary btn-sm" data-offers="${r.id}">${esc(t('offers_n', { n: r.offers_count }))}</button>
      ${r.status === 'draft' ? `<button class="btn btn-soft btn-sm" data-rpub="${r.id}">${esc(t('publish_short'))}</button>` : ''}
      ${r.status === 'open' ? `<button class="btn btn-soft btn-sm" data-rclose="${r.id}">${esc(t('close_request'))}</button>` : ''}
    </div>
  </div>`;
}

async function offersModal(id) {
  const r = await api(`/requests/${id}`);
  const m = openModal(`<h3>${esc(r.title)}</h3><p class="small muted">${esc(t('offers_n', { n: r.offers.length }))}</p>
    ${r.offers.length ? r.offers.map((o) => `<div class="box" style="margin-top:10px;padding:14px 16px">
      <div style="display:flex;justify-content:space-between;gap:10px"><b class="small">${esc(o.seller.name || '')} ${o.seller.verified ? `<span class="tag green">${esc(t('company_verified'))}</span>` : ''}</b><b>${esc(o.price_formatted || '')}</b></div>
      <p class="small" style="margin:6px 0">${esc(o.message)}</p>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${o.listing_id ? `<a class="btn btn-soft btn-sm" href="/listing/${o.listing_id}" data-close-link>${esc(t('details'))}</a>` : ''}
      ${o.status === 'pending' ? `<button class="btn btn-primary btn-sm" data-ofa="accept" data-oid="${o.id}">${esc(t('accept'))}</button><button class="btn btn-ghost btn-sm" data-ofa="reject" data-oid="${o.id}">${esc(t('reject'))}</button>` : statusTag(o.status === 'accepted' ? 'active' : 'rejected', o.status === 'accepted' ? t('accept') : t('reject'))}</div></div>`).join('') : `<div class="empty">${esc(t('empty'))}</div>`}`, { wide: true });
  m.querySelectorAll('[data-close-link]').forEach((a) => a.addEventListener('click', closeModal));
  m.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ofa]');
    if (!b) return;
    await api(`/requests/${id}/offers/${b.dataset.oid}/${b.dataset.ofa}`, { method: 'POST' });
    offersModal(id);
  });
}

// Bildirishnomadagi /orders/:id havolasi — buyurtmalar sahifasida shu buyurtmani ochadi

export async function myOrders({ query }) {
  if (!state.user) return needLogin();
  const tab = query.tab || 'active';
  const isReq = tab === 'requests';
  const isSales = tab === 'sales';
  const isBook = tab === 'bookings';
  const isInsp = tab === 'inspections';
  const noOrders = isReq || isBook || isInsp;
  const [res, reqs, sales, bRent, bSell, insp] = await Promise.all([
    noOrders ? null : api(`/orders${qs({ tab: isSales ? undefined : tab, role: isSales ? 'seller' : 'buyer', page: query.page })}`),
    api('/my/requests'),
    isSales ? null : api('/orders?role=seller&per_page=1'),
    api('/my/bookings?role=renter'),
    api('/my/bookings?role=seller'),
    api('/my/inspections'),
  ]);
  const counts = res?.counts || {};
  const salesTotal = isSales ? res.total : sales?.total || 0;
  const tabs = [
    ['active', `${t('orders_tab')} · ${counts.active ?? '…'}`],
    ['requests', `${t('my_requests_tab')} · ${reqs.length}`],
    ['completed', t('completed_tab')],
  ];
  if (salesTotal || state.user.company) tabs.push(['sales', `${t('sales_tab')} · ${salesTotal}`]);
  tabs.push(['bookings', `${t('bookings_tab')} · ${bRent.length + bSell.length}`]);
  if (insp.length) tabs.push(['inspections', `${t('inspections_tab')} · ${insp.length}`]);
  const bookingRow = (b) => `<div class="order">
    <div class="hd"><span>${esc(b.listing.title)}</span>${statusTag({ pending: 'new', confirmed: 'active', rejected: 'rejected', cancelled: 'cancelled' }[b.status], b.status_label)}</div>
    <div class="bd"><a class="thumb" href="/listing/${b.listing.id}"><img src="${esc(b.listing.cover || '/img/demo/crane.jpg')}" alt=""></a>
      <div><div class="t">${esc(b.start_date)} — ${esc(b.end_date)} · ${esc(t('days_n', { n: b.days }))}${b.hours_per_day ? ` × ${b.hours_per_day} ${esc(state.meta.price_units.find((u) => u.value === 'hour')?.label || '')}` : ''}</div>
        <div class="m">${esc(b.with.name || '')}${b.with.phone ? ` · <a href="tel:${esc(b.with.phone)}">${esc(b.with.phone)}</a>` : ''}${b.note ? `<br>${esc(b.note)}` : ''}</div></div>
      <div class="sum">${esc(b.total_formatted || '')}</div></div>
    <div class="actions">${b.role === 'seller' && b.status === 'pending' ? `<button class="btn btn-primary btn-sm" data-bk="confirm" data-id="${b.id}">${esc(t('act_confirm'))}</button><button class="btn btn-danger btn-sm" data-bk="reject" data-id="${b.id}">${esc(t('reject'))}</button>` : ''}
      ${['pending', 'confirmed'].includes(b.status) ? `<button class="btn btn-ghost btn-sm" data-bk="cancel" data-id="${b.id}">${esc(t('act_cancel'))}</button>` : ''}</div>
  </div>`;
  const inspRow = (i) => `<div class="order">
    <div class="hd"><span>${esc(t('inspection'))} · <a class="link-blue" href="/listing/${i.listing?.id}">${esc(i.listing?.title || '')}</a></span>${statusTag(i.status === 'done' ? 'completed' : i.status === 'unpaid' ? 'new' : 'active', i.status_label)}</div>
    <div class="m small" style="margin-top:8px">${esc(i.price_formatted)}${i.inspector ? ` · ${esc(t('inspector'))}: ${esc(i.inspector)}` : ''}${i.scheduled_at ? ` · ${esc(i.scheduled_at)}` : ''}</div>
    ${i.report ? `<div class="box" style="margin-top:10px;background:#fafbfc"><b class="small">${esc(t(`verdict_${i.verdict || 'good'}`))}</b><p class="prose small" style="margin:6px 0 0">${esc(i.report)}</p>
      ${i.report_files.length ? `<div class="photos-grid" style="margin-top:10px">${i.report_files.map((u) => `<a class="ph" href="${esc(u)}" target="_blank"><img src="${esc(u)}" alt=""></a>`).join('')}</div>` : ''}</div>` : ''}
    ${i.status === 'unpaid' && i.payment_id ? `<div class="actions"><a class="btn btn-primary btn-sm" href="/payments/${i.payment_id}">${esc(t('act_pay'))}</a></div>` : ''}
  </div>`;
  let body;
  if (isReq) body = (reqs.length ? reqs.map(requestRow).join('') : emptyBox(t('empty'), '')) + `<a class="btn btn-primary" style="margin-top:14px" href="/request/new">${icon('plus')} ${esc(t('create_request'))}</a>`;
  else if (isBook) {
    body = `${bSell.length ? `<h3 style="margin:4px 0 10px;font-size:15px">${esc(t('my_bookings_seller'))}</h3>${bSell.map(bookingRow).join('')}` : ''}
      ${bRent.length ? `<h3 style="margin:18px 0 10px;font-size:15px">${esc(t('my_bookings_renter'))}</h3>${bRent.map(bookingRow).join('')}` : ''}
      ${!bSell.length && !bRent.length ? emptyBox(t('empty')) : ''}`;
  } else if (isInsp) body = insp.map(inspRow).join('') || emptyBox(t('empty'));
  else body = (res.items.length ? res.items.map(orderCard).join('') : emptyBox(t('empty'))) + pager(res.page, res.pages, (p) => `/my/orders${qs({ tab, page: p })}`);
  const html = accountLayout('/my/orders', `
    ${head(t('my_orders'), t('my_orders_sub'))}
    <div class="tabs">${tabs.map(([v, l]) => `<a class="tab ${tab === v ? 'on' : ''}" href="/my/orders?tab=${v}">${esc(l)}</a>`).join('')}</div>
    ${body}`);
  return {
    title: t('my_orders'),
    html,
    mount(main) {
      if (/^\d+$/.test(query.order || '')) orderModal(query.order);
      main.addEventListener('click', async (e) => {
        const d = e.target.closest('[data-details],[data-track]');
        if (d) return orderModal(d.dataset.details || d.dataset.track);
        const pay = e.target.closest('[data-pay]');
        if (pay) return escrowPayModal(res.items.find((x) => String(x.id) === pay.dataset.pay));
        const bk = e.target.closest('[data-bk]');
        if (bk) {
          if (bk.dataset.bk !== 'confirm' && !(await confirmBox(t('act_cancel')))) return;
          await api(`/bookings/${bk.dataset.id}/${bk.dataset.bk}`, { method: 'POST' });
          toast(t('saved'), 'ok');
          return refresh();
        }
        const inv = e.target.closest('[data-invoice]');
        if (inv) return invoiceModal(inv.dataset.invoice);
        const of = e.target.closest('[data-offers]');
        if (of) return offersModal(of.dataset.offers);
        const pub = e.target.closest('[data-rpub]');
        if (pub) { const r = await api(`/requests/${pub.dataset.rpub}/publish`, { method: 'POST' }); toast(t('request_sent', { n: r.notified_sellers }), 'ok'); return refresh(); }
        const cl = e.target.closest('[data-rclose]');
        if (cl) { await api(`/requests/${cl.dataset.rclose}/close`, { method: 'POST' }); refresh(); }
      });
    },
  };
}

// ---------- Saralanganlar ----------
export async function favorites({ query }) {
  if (!state.user) return needLogin();
  const tab = query.tab || '';
  const [res, searches] = await Promise.all([api('/favorites?per_page=60'), api('/saved-searches')]);
  const all = res.items;
  const groups = {
    '': all,
    equipment: all.filter((x) => x.kind === 'equipment' && x.deal_type !== 'rent'),
    part: all.filter((x) => x.kind === 'part'),
    rent: all.filter((x) => x.deal_type === 'rent'),
  };
  const rentLabel = state.meta.deal_types.find((d) => d.value === 'rent').label;
  const tabs = [['', `${t('all')} · ${all.length}`], ['equipment', `${t('tab_equipment')} · ${groups.equipment.length}`], ['part', `${t('want_part')} · ${groups.part.length}`], ['rent', `${rentLabel} · ${groups.rent.length}`], ['searches', `${t('saved_searches')} · ${searches.length}`]];
  const changed = all.find((x) => x.price_changed && x.price_at_save !== null);
  let alert = '';
  if (changed) {
    const diff = changed.price.original.amount - changed.price_at_save;
    alert = `<div class="note" style="margin:0 0 16px">${icon(diff < 0 ? 'arrow' : 'arrow')}<div><b>${esc(t(diff < 0 ? 'price_drop' : 'price_up', { title: changed.title, d: money(Math.abs(diff), changed.price.original.currency) }))}</b><p>${esc(t('price_now', { p: changed.price.original.formatted }))}</p></div></div>`;
  }
  const searchBox = searches.length ? `<div class="box" style="margin-top:16px"><h3>${esc(t('saved_searches'))}</h3>${searches.map((s) => `
    <div class="lead" style="grid-template-columns:1fr auto"><div><b>${esc(s.title)}</b><span>${esc(t('new_n', { n: s.new_count }))}</span></div>
    <div style="display:flex;gap:6px"><button class="btn btn-soft btn-sm" data-ss="${s.id}" data-q='${esc(JSON.stringify(s.query))}'>${esc(t('view'))}</button><button class="btn btn-ghost btn-sm" data-ss-del="${s.id}">${icon('trash')}</button></div></div>`).join('')}</div>` : '';
  const list = tab === 'searches' ? '' : groups[tab] || all;
  const html = accountLayout('/favorites', `
    ${crumbs([[t('home'), '/'], [t('dashboard'), '/dashboard'], [t('nav_fav')]])}
    <div class="page-head"><h1 class="page-title">${esc(t('nav_fav'))}</h1><p class="page-sub">${esc(t('fav_sub'))}</p></div>
    <div class="tabs">${tabs.map(([v, l]) => `<a class="tab ${tab === v ? 'on' : ''}" href="/favorites${qs({ tab: v })}">${esc(l)}</a>`).join('')}</div>
    ${tab === 'searches' ? '' : `${alert}<div class="results-head"><h2>${esc(t('saved_n', { n: list.length }))}</h2><span class="sort-select">${esc(t('sort_added'))}</span></div>
    ${list.length ? cards(list, 2) : emptyBox(t('empty'))}`}
    ${searchBox || (tab === 'searches' ? emptyBox(t('empty')) : '')}`);
  return {
    title: t('nav_fav'),
    html,
    mount(main) {
      main.addEventListener('click', async (e) => {
        const s = e.target.closest('[data-ss]');
        if (s) {
          await api(`/saved-searches/${s.dataset.ss}/seen`, { method: 'POST', silent: true }).catch(() => {});
          const q = JSON.parse(s.dataset.q);
          delete q.currency;
          go(`/catalog${qs(q)}`);
        }
        const d = e.target.closest('[data-ss-del]');
        if (d) { await api(`/saved-searches/${d.dataset.ssDel}`, { method: 'DELETE' }); refresh(); }
      });
    },
  };
}

// ---------- Bildirishnomalar ----------
export async function notifications() {
  if (!state.user) return needLogin();
  const res = await api('/notifications?limit=100');
  const html = accountLayout('', `
    ${head(t('notifications'))}
    <div style="margin-bottom:12px"><button class="btn btn-soft btn-sm" data-read-all>${esc(t('mark_all_read'))}</button></div>
    <div class="box">${res.items.length ? res.items.map((n) => `<a class="lead" style="grid-template-columns:1fr auto" href="${esc(n.link || '#')}"><div><b style="${n.read ? 'font-weight:500' : ''}">${n.read ? '' : '● '}${esc(n.text)}</b></div><span>${esc(fmtRel(n.created_at))}</span></a>`).join('') : `<div class="empty">${esc(t('empty'))}</div>`}</div>`);
  return {
    title: t('notifications'),
    html,
    async mount(main) {
      $('[data-read-all]', main).onclick = async () => { await api('/notifications/read', { method: 'POST', body: {} }); state.badges.notifications = 0; refresh(); };
    },
  };
}

// ---------- Xaridor so'rovlari (sotuvchilar uchun) ----------
export async function requests({ query }) {
  const mine = query.mine === '1';
  const res = await api(`/requests${qs({ category: query.category, country: state.country, mine_categories: mine ? '1' : undefined, page: query.page })}`);
  const row = (r) => `<div class="order">
    <div class="hd"><span>${esc(r.title)}</span><span class="tiny muted">${esc(fmtRel(r.created_at))}</span></div>
    <div class="small muted" style="margin-top:6px">${esc([r.category?.name, r.subcategory?.name, r.location.region_name || r.location.country_name, r.quantity, r.needed_by].filter(Boolean).join(' · '))}</div>
    <p class="small" style="margin:8px 0 0">${esc(r.description)}</p>
    <div class="actions">${r.budget.formatted ? `<span class="tag">${esc(t('budget'))}: ${esc(r.budget.formatted)}</span>` : ''}<span class="tag grey">${esc(t('offers_n', { n: r.offers_count }))}</span>
      ${r.attachment && state.user ? `<a class="btn btn-ghost btn-sm" data-att="${esc(r.attachment)}">${icon('clip')}</a>` : ''}
      ${r.is_owner ? '' : r.my_offer ? `<span class="tag green">${esc(t('your_offer'))}: ${esc(r.my_offer.message.slice(0, 40))}</span>` : `<button class="btn btn-primary btn-sm" data-offer="${r.id}">${esc(t('make_offer'))}</button>`}</div>
  </div>`;
  const html = `
    ${crumbs([[t('home'), '/'], [t('buyer_requests')]])}
    <div class="page-head"><h1 class="page-title">${esc(t('buyer_requests'))}</h1><p class="page-sub">${esc(t('requests_sub'))}</p></div>
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      <div class="chips"><a class="chip ${mine ? '' : 'on'}" href="/requests">${esc(t('all'))}</a>${state.user ? `<a class="chip ${mine ? 'on' : ''}" href="/requests?mine=1">${esc(t('my_categories_only'))}</a>` : ''}</div>
      <a href="/request/new" class="btn btn-primary">${icon('plus')} ${esc(t('create_request'))}</a>
    </div>
    ${res.items.length ? res.items.map(row).join('') : emptyBox(t('empty'))}
    ${pager(res.page, res.pages, (p) => `/requests${qs({ ...query, page: p })}`)}`;
  return {
    title: t('buyer_requests'),
    html,
    mount(main) {
      main.addEventListener('click', async (e) => {
        const att = e.target.closest('[data-att]');
        if (att) {
          const r = await fetch(att.dataset.att, { headers: { Authorization: `Bearer ${state.token}` } });
          if (r.ok) window.open(URL.createObjectURL(await r.blob()), '_blank');
          return;
        }
        const b = e.target.closest('[data-offer]');
        if (!b) return;
        if (!state.user) { document.querySelector('[data-login]')?.click(); return; }
        const my = await api('/my/listings?status=active&per_page=60');
        const m = openModal(`<h3>${esc(t('make_offer'))}</h3>
          <form><label class="lbl" style="margin-top:12px">${esc(t('message'))}</label><textarea class="input" name="message" required minlength="5"></textarea>
          <div class="row2i" style="margin-top:12px"><div><label class="lbl">${esc(t('price'))}</label><input class="input" name="price" inputmode="numeric"></div>
          <div><label class="lbl">${esc(t('currency'))}</label><select class="input" name="currency">${state.meta.currencies.map((c) => `<option ${c.code === state.currency ? 'selected' : ''}>${c.code}</option>`).join('')}</select></div></div>
          ${my.items.length ? `<label class="lbl" style="margin-top:12px">${esc(t('my_listings'))}</label><select class="input" name="listing_id"><option value="">—</option>${my.items.map((l) => `<option value="${l.id}">${esc(l.title)}</option>`).join('')}</select>` : ''}
          <button class="btn btn-primary btn-block" style="margin-top:16px">${esc(t('send'))}</button></form>`);
        m.querySelector('form').onsubmit = async (ev) => {
          ev.preventDefault();
          const f = ev.target;
          await api(`/requests/${b.dataset.offer}/offers`, { method: 'POST', body: { message: f.message.value.trim(), price: f.price.value.replace(/\s/g, '') || undefined, currency: f.currency.value, listing_id: f.listing_id?.value || undefined } });
          closeModal(); toast(t('sent'), 'ok'); refresh();
        };
      });
    },
  };
}

// ---------- Kompaniya sahifasi ----------
export async function company({ params, query }) {
  const c = await api(`/companies/${params[0]}${qs({ page: query.page })}`);
  const html = `
    ${crumbs([[t('home'), '/'], [t('company_page')], [c.name]])}
    <div class="banner-navy"><div><h2>${esc(c.name)}</h2><p>${esc([c.activity, c.city || c.region_name, c.country_name].filter(Boolean).join(' · '))}</p>
      ${c.verified ? `<span class="tag green">${esc(t('verified_seller'))}</span>` : ''}</div>
      <div style="text-align:end">${c.reviews_count ? `<div style="font-size:26px;font-weight:700">★ ${String(c.rating).replace('.', ',')}</div><p>${esc(t('reviews', { n: c.reviews_count }))}</p>` : ''}</div></div>
    <div class="dash-row">
      <div class="box"><h3>${esc(t('about_company'))}</h3><div class="prose">${esc(c.about || '—')}</div>
        <table class="spec" style="margin-top:12px">${[[t('on_since', { y: c.since }), ''], [t('work_hours'), c.work_hours], [t('address'), [c.city, c.address].filter(Boolean).join(', ')], [t('active_listings'), num(c.active_listings)]].filter((r) => r[1] !== undefined && r[1] !== null && r[1] !== '' || r[1] === '').map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table></div>
      <div class="box"><h3>${esc(t('reviews_title'))}</h3>${c.reviews.length ? c.reviews.map((r) => `<div class="lead" style="grid-template-columns:1fr"><div><b>${'★'.repeat(r.rating)} · ${esc(r.author || '')}</b><span>${esc(r.text || '')} · ${esc(fmtRel(r.created_at))}</span></div></div>`).join('') : `<div class="empty">${esc(t('empty'))}</div>`}</div>
    </div>
    <section class="sec"><div class="sec-head"><div><h2>${esc(t('company_listings'))}</h2></div></div>
    ${cards(c.listings.items, 4)}${pager(c.listings.page, c.listings.pages, (p) => `/company/${c.id}?page=${p}`)}</section>`;
  return { title: c.name, html };
}

// ---------- Admin ----------
// embed=true — yangi admin panel ichida faqat tab tarkibi qaytariladi
export async function admin({ query }, embed = false) {
  if (!state.user) return needLogin();
  if (state.user.role !== 'admin') return { title: t('admin'), html: emptyBox(t('not_found_page')) };
  const tab = query.tab || 'moderation';
  const stats = embed ? null : await api('/admin/stats');
  const tabs = [['moderation', t('admin')], ['companies', t('companies_check')], ['reports', t('admin_reports')], ['disputes', t('admin_disputes')], ['inspections', t('admin_inspections')], ['payments', t('admin_payments')], ['blacklist', t('admin_blacklist')], ['rates', t('rates')]];
  let body = '';

  if (tab === 'moderation') {
    const queue = await api('/admin/listings?status=moderation');
    body = `<div class="box"><h3>${esc(t('admin'))} · ${queue.total}</h3>
      ${queue.items.length ? queue.items.map((l) => `<div class="row-item" style="border:0;border-top:1px solid var(--line);border-radius:0;padding:14px 0">
        <a class="thumb" href="/listing/${l.id}"><img src="${esc(l.cover || imgOf(l))}" alt=""></a>
        <div><div class="t">${esc(l.title)}</div><div class="p">${esc(priceText(l.price))}</div><div class="m">${esc(l.seller.name)} · ${esc(l.location.country_name)} · ${esc(l.category.name)} / ${esc(l.subcategory?.name || '')}</div>
        <p class="small" style="margin:6px 0 0">${esc((l.description || '').slice(0, 240))}</p>
        <div class="actions"><button class="btn btn-primary btn-sm" data-approve="${l.id}">${esc(t('approve'))}</button><button class="btn btn-danger btn-sm" data-reject="${l.id}">${esc(t('reject'))}</button><a class="btn btn-soft btn-sm" href="/listing/${l.id}">${esc(t('details'))}</a></div></div><span></span></div>`).join('') : `<div class="empty">${esc(t('queue_empty'))}</div>`}</div>`;
  }
  if (tab === 'companies') {
    const comps = await api('/admin/companies?verification=pending');
    body = `<div class="box"><h3>${esc(t('companies_check'))} · ${comps.length}</h3>
      ${comps.length ? comps.map((c) => `<div class="lead" style="grid-template-columns:1fr auto"><div><b>${esc(c.name)}</b><span>${esc([c.tin, c.country, c.city].filter(Boolean).join(' · '))}</span><br>${c.documents.map((d) => `<a class="link-blue tiny" data-doc="${esc(d.url.replace(/^https?:\/\/[^/]+/, ''))}">${icon('file')} ${esc(d.name || 'doc')}</a>`).join(' ')}</div>
        <div style="display:flex;gap:6px"><button class="btn btn-primary btn-sm" data-cverify="${c.id}">${esc(t('approve'))}</button><button class="btn btn-danger btn-sm" data-creject="${c.id}">${esc(t('reject'))}</button></div></div>`).join('') : `<div class="empty">${esc(t('queue_empty'))}</div>`}</div>`;
  }
  if (tab === 'reports') {
    const reps = await api('/admin/reports');
    body = `<div class="box"><h3>${esc(t('admin_reports'))} · ${reps.length}</h3>
      ${reps.length ? reps.map((r) => `<div class="lead" style="grid-template-columns:1fr auto"><div><b><a class="link-blue" href="/listing/${r.listing_id}">${esc(r.title || `№ ${r.listing_id}`)}</a> — ${esc(t(`rr_${r.reason}`))}${r.same_listing_reports > 1 ? ` ×${r.same_listing_reports}` : ''}</b>
        <span>${esc(r.reporter)} · ${esc(fmtRel(r.created_at))}${r.comment ? ` · «${esc(r.comment)}»` : ''}</span></div>
        <div style="display:flex;gap:6px"><button class="btn btn-danger btn-sm" data-rep="resolve" data-id="${r.id}">${esc(t('resolve'))}</button><button class="btn btn-soft btn-sm" data-rep="dismiss" data-id="${r.id}">${esc(t('dismiss'))}</button></div></div>`).join('') : `<div class="empty">${esc(t('queue_empty'))}</div>`}</div>`;
  }
  if (tab === 'disputes') {
    const [ds, es] = await Promise.all([api('/admin/disputes'), api('/admin/escrow')]);
    body = `<div class="box"><h3>${esc(t('admin_disputes'))} · ${ds.length}</h3>
      ${ds.length ? ds.map((d) => `<div class="lead" style="grid-template-columns:1fr auto"><div><b>${esc(d.number)} · ${esc(d.title)} · ${esc(d.total_formatted)}</b><span>${esc(d.opened_by_name)}: «${esc(d.reason)}» · ${esc(fmtRel(d.created_at))}</span></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" data-dsp="release" data-id="${d.id}">${esc(t('release'))}</button><button class="btn btn-danger btn-sm" data-dsp="refund" data-id="${d.id}">${esc(t('refund'))}</button></div></div>`).join('') : `<div class="empty">${esc(t('queue_empty'))}</div>`}</div>
      <div class="box"><h3>${esc(t('safe_deal'))}</h3>${es.length ? `<table class="spec">${es.map((o) => `<tr><td>${esc(o.number)} · ${esc(o.title)}<br><span class="tiny">${esc(o.seller || '')}</span></td><td>${esc(o.total)} (+${esc(o.fee)})<br><span class="tag ${o.escrow_status === 'released' ? 'green' : o.escrow_status === 'disputed' ? 'red' : 'orange'}">${esc(o.escrow_status_label)}</span></td></tr>`).join('')}</table>` : `<div class="empty">${esc(t('empty'))}</div>`}</div>`;
  }
  if (tab === 'inspections') {
    const ins = await api('/admin/inspections');
    body = ins.length ? ins.map((i) => `<form class="box" data-insp="${i.id}"><h3><a class="link-blue" href="/listing/${i.listing?.id}">${esc(i.listing?.title || '')}</a></h3>
      <p class="small muted" style="margin-top:-8px">${esc(i.buyer.name || '')} · ${esc(i.buyer.phone)} · ${esc(i.price_formatted)}${i.note ? ` · «${esc(i.note)}»` : ''}</p>
      <div class="form-grid">
        <div><label class="lbl">${esc(t('condition'))}</label><select class="input" name="status">${['paid', 'scheduled', 'done', 'cancelled'].map((s) => `<option value="${s}" ${i.status === s ? 'selected' : ''}>${esc(t(`ist_${s}`))}</option>`).join('')}</select></div>
        <div><label class="lbl">${esc(t('inspector'))}</label><input class="input" name="inspector" value="${esc(i.inspector || '')}"></div>
        <div><label class="lbl">${esc(t('preferred_time'))}</label><input class="input" name="scheduled_at" value="${esc(i.scheduled_at || '')}"></div>
        <div><label class="lbl">${esc(t('rating'))}</label><select class="input" name="verdict"><option value="">—</option>${['good', 'issues', 'bad'].map((v) => `<option value="${v}" ${i.verdict === v ? 'selected' : ''}>${esc(t(`verdict_${v}`))}</option>`).join('')}</select></div>
        <div class="full"><label class="lbl">${esc(t('description'))}</label><textarea class="input" name="report">${esc(i.report || '')}</textarea></div>
        <div class="full"><input type="file" name="files" multiple accept="image/jpeg,image/png,image/webp"> <span class="tiny muted">${i.report_files.length} ${esc(t('photos'))}</span></div>
      </div><button class="btn btn-primary btn-sm" style="margin-top:12px">${esc(t('save_report'))}</button></form>`).join('') : emptyBox(t('queue_empty'));
  }
  if (tab === 'payments') {
    const ps = await api('/admin/payments');
    body = `<div class="box"><h3>${esc(t('admin_payments'))}</h3>${ps.length ? `<table class="spec">${ps.map((p) => `<tr><td>№ ${p.id} · ${esc(p.title)}<br><span class="tiny">user ${p.user_id} · ${esc(p.provider)} · ${esc(fmtDate(p.created_at, true))}</span></td><td>${esc(p.formatted)}<br><span class="tag ${p.status === 'paid' ? 'green' : p.status === 'pending' ? 'orange' : 'grey'}">${esc(t(`pst_${p.status}`))}</span></td></tr>`).join('')}</table>` : `<div class="empty">${esc(t('empty'))}</div>`}</div>`;
  }
  if (tab === 'blacklist') {
    const bl = await api('/admin/blacklist');
    body = `<form class="box" data-bl><h3>${esc(t('admin_blacklist'))}</h3><div class="form-grid"><div><label class="lbl">${esc(t('serial_number'))}</label><input class="input" name="serial" required minlength="4"></div><div><label class="lbl">${esc(t('note_lbl'))}</label><input class="input" name="note"></div></div>
      <button class="btn btn-primary btn-sm" style="margin-top:12px">${icon('plus')} ${esc(t('add'))}</button></form>
      <div class="box">${bl.length ? bl.map((b) => `<div class="lead" style="grid-template-columns:1fr auto"><div><b>${esc(b.serial)}</b><span>${esc(b.note || '')} · ${esc(fmtDate(b.created_at))}</span></div><button class="btn btn-ghost btn-sm" data-bldel="${esc(b.serial)}">${icon('trash')}</button></div>`).join('') : `<div class="empty">${esc(t('empty'))}</div>`}</div>`;
  }
  if (tab === 'rates') {
    const rates = await api('/currencies');
    body = `<div class="box"><h3>${esc(t('rates'))}</h3>
      <form data-rates class="form-grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">${rates.items.filter((r) => r.code !== 'USD').map((r) => `<div><label class="lbl">${r.code} <span class="muted tiny">${esc(r.source)}</span></label><input class="input" name="${r.code}" value="${r.per_usd}"></div>`).join('')}</form>
      <div style="display:flex;gap:8px;margin-top:12px"><button class="btn btn-primary btn-sm" data-save-rates>${esc(t('save_changes'))}</button><button class="btn btn-soft btn-sm" data-sync>${esc(t('sync_cbu'))}</button></div></div>`;
  }

  const html = embed ? body : accountLayout('/admin', `
    ${head(t('admin'))}
    <div class="stats" style="margin:0 0 14px">
      <div class="stat"><span>Users</span><b>${num(stats.users)}</b></div>
      <div class="stat"><span>${esc(t('active_listings'))}</span><b>${num(stats.listings.active || 0)}</b></div>
      <div class="stat"><span>${esc(state.meta.listing_statuses.find((s) => s.value === 'moderation').label)}</span><b>${num(stats.listings.moderation || 0)}</b></div>
      <div class="stat"><span>${esc(t('orders_tab'))}</span><b>${num(Object.values(stats.orders).reduce((a, b) => a + b, 0))}</b></div>
    </div>
    <div class="tabs">${tabs.map(([v, l]) => `<a class="tab ${tab === v ? 'on' : ''}" href="/admin?tab=${v}">${esc(l)}</a>`).join('')}</div>
    ${body}`);
  return {
    title: t('admin'),
    html,
    mount(main) {
      main.addEventListener('click', async (e) => {
        const ap = e.target.closest('[data-approve]');
        if (ap) { await api(`/admin/listings/${ap.dataset.approve}/approve`, { method: 'POST' }); return refresh(); }
        const rj = e.target.closest('[data-reject]');
        if (rj) {
          const m = openModal(`<h3>${esc(t('reject'))}</h3><form><textarea class="input" name="reason" required minlength="3"></textarea><button class="btn btn-danger btn-block" style="margin-top:12px">${esc(t('reject'))}</button></form>`);
          m.querySelector('form').onsubmit = async (ev) => { ev.preventDefault(); await api(`/admin/listings/${rj.dataset.reject}/reject`, { method: 'POST', body: { reason: ev.target.reason.value.trim() } }); closeModal(); refresh(); };
          return;
        }
        const cv = e.target.closest('[data-cverify]');
        if (cv) { await api(`/admin/companies/${cv.dataset.cverify}/verify`, { method: 'POST' }); return refresh(); }
        const cr = e.target.closest('[data-creject]');
        if (cr) { await api(`/admin/companies/${cr.dataset.creject}/reject`, { method: 'POST' }); return refresh(); }
        const doc = e.target.closest('[data-doc]');
        if (doc) { const r = await fetch(doc.dataset.doc, { headers: { Authorization: `Bearer ${state.token}` } }); if (r.ok) window.open(URL.createObjectURL(await r.blob()), '_blank'); return; }
        const rep = e.target.closest('[data-rep]');
        if (rep) { await api(`/admin/reports/${rep.dataset.id}/${rep.dataset.rep}`, { method: 'POST', body: {} }); toast(t('saved'), 'ok'); return refresh(); }
        const dsp = e.target.closest('[data-dsp]');
        if (dsp) {
          if (!(await confirmBox(t(dsp.dataset.dsp)))) return;
          await api(`/admin/disputes/${dsp.dataset.id}/resolve`, { method: 'POST', body: { resolution: dsp.dataset.dsp } });
          toast(t('saved'), 'ok'); return refresh();
        }
        const bd = e.target.closest('[data-bldel]');
        if (bd) { await api(`/admin/blacklist/${encodeURIComponent(bd.dataset.bldel)}`, { method: 'DELETE' }); return refresh(); }
        if (e.target.closest('[data-save-rates]')) {
          const body = Object.fromEntries([...$('[data-rates]', main).elements].map((i) => [i.name, Number(i.value)]));
          await api('/admin/rates', { method: 'PUT', body }); toast(t('saved'), 'ok'); return refresh();
        }
        if (e.target.closest('[data-sync]')) { await api('/admin/rates/sync', { method: 'POST' }); toast(t('saved'), 'ok'); refresh(); }
      });
      main.addEventListener('submit', async (e) => {
        const ins = e.target.closest('[data-insp]');
        const bl = e.target.closest('[data-bl]');
        if (!ins && !bl) return;
        e.preventDefault();
        if (bl) { await api('/admin/blacklist', { method: 'POST', body: { serial: bl.serial.value.trim(), note: bl.note.value.trim() || undefined } }); return refresh(); }
        const fd = new FormData();
        for (const k of ['status', 'inspector', 'scheduled_at', 'verdict', 'report']) if (ins[k].value) fd.append(k, ins[k].value);
        for (const f of ins.files.files) fd.append('files', f);
        await api(`/admin/inspections/${ins.dataset.insp}`, { method: 'POST', form: fd });
        toast(t('saved'), 'ok');
        refresh();
      });
    },
  };
}

// ---------- Platforma haqida ----------
export async function about() {
  const html = `
    ${crumbs([[t('home'), '/'], [t('about')]])}
    <div class="page-head"><h1 class="page-title">${esc(t('about'))}</h1><p class="page-sub">${esc(t('footer_tag'))}</p></div>
    <div class="box"><p class="prose">${esc(t('about_text'))}</p>
      <div class="trust" style="margin-top:14px"><div>${icon('shield')} ${esc(t('trust_verified'))}</div><div>${icon('pin')} ${esc(t('trust_region'))}</div><div>${icon('chat')} ${esc(t('trust_direct'))}</div></div></div>
    <div class="box" id="help"><h3>${esc(t('help'))}</h3><p class="prose">${esc(t('buy_confidently_sub'))}</p></div>
    <div class="box" id="safe"><h3>${esc(t('safe_deals'))}</h3><p class="prose">${esc(t('safety_sub'))}</p></div>
    <div class="box" id="rules"><h3>${esc(t('rules'))}</h3><p class="prose">${esc(t('title_hint'))}\n${esc(t('desc_hint', { n: 0 }).replace(/^0 \/ /, ''))}\n${esc(t('ready_sub'))}</p></div>
    <div class="box" id="privacy"><h3>${esc(t('privacy'))}</h3><p class="prose">${esc(t('accept_rules'))}</p></div>`;
  return { title: t('about'), html };
}

export { card, factsLine, ratingHtml };
