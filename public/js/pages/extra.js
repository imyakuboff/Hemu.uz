import { state, t, esc, api, icon, num, fmtDate, toast, openModal, closeModal, $, $$ } from '../core.js';
import { crumbs, accountLayout, imgOf, priceText, emptyBox, factsLine } from '../ui.js';
import { providerOptions, bindSeg, goPay, compareList, toggleCompare } from '../features.js';
import { go, render, refreshBadges } from '../app.js';

const needLogin = () => ({ title: t('login'), html: `<div class="box empty"><h3>${esc(t('login_required'))}</h3><button class="btn btn-primary" data-login style="margin-top:14px">${esc(t('login'))}</button></div>` });
const pstTag = (s) => `<span class="tag ${{ paid: 'green', pending: 'orange', cancelled: 'grey', refunded: 'grey' }[s]}">${esc(t(`pst_${s}`))}</span>`;

// ---------- To'lov sahifasi (provayderdan qaytish / sinov) ----------
export async function payment({ params }) {
  if (!state.user) return needLogin();
  const p = await api(`/payments/${params[0]}`);
  const back = p.ref?.type === 'listing' ? `/listing/${p.ref.id}` : p.ref?.type === 'order' ? '/my/orders' : p.purpose === 'plan' ? '/plans' : '/payments';
  const html = `
    ${crumbs([[t('home'), '/'], [t('payments_history'), '/payments'], [`№ ${p.id}`]])}
    <div style="max-width:560px;margin:0 auto">
      <div class="box" style="text-align:center;padding:32px 24px">
        <span style="display:inline-grid;place-items:center;width:56px;height:56px;border-radius:50%;background:${p.status === 'paid' ? 'var(--green-soft)' : 'var(--blue-soft)'};color:${p.status === 'paid' ? 'var(--green)' : 'var(--blue)'}">${icon(p.status === 'paid' ? 'check' : 'card')}</span>
        <h2 style="margin:14px 0 4px;font-size:22px">${esc(p.status === 'paid' ? t('payment_success') : t('payment'))}</h2>
        <p class="muted small" style="margin:0 0 10px">${esc(p.title)}${p.ref ? `<br>${esc(p.ref.title)}` : ''}</p>
        <div style="font-size:30px;font-weight:700">${esc(p.formatted)}</div>
        <div style="margin:10px 0 18px">${pstTag(p.status)}</div>
        ${p.status === 'pending' && p.dev ? `<button class="btn btn-primary btn-block" data-devpay>${icon('card')} ${esc(t('pay'))}</button><p class="tiny muted" style="margin:8px 0 0">${esc(t('pay_test_note'))}</p>` : ''}
        ${p.status === 'pending' && !p.dev ? `<p class="small muted">${esc(t('pst_pending'))}…</p><button class="btn btn-soft" data-recheck>${esc(t('apply'))}</button>` : ''}
        <a class="btn btn-soft btn-block" style="margin-top:12px" href="${back}">${esc(t('go_back'))}</a>
      </div>
    </div>`;
  return {
    title: t('payment'),
    html,
    mount(main) {
      $('[data-devpay]', main)?.addEventListener('click', async () => {
        await api(`/payments/${p.id}/dev-confirm`, { method: 'POST' });
        toast(t('payment_success'), 'ok');
        await refreshBadges();
        render({ keepScroll: true });
      });
      $('[data-recheck]', main)?.addEventListener('click', () => render({ keepScroll: true }));
      // Click/Payme callback kelguncha sahifani yangilab turish
      if (p.status === 'pending' && !p.dev) {
        const h = setInterval(() => render({ keepScroll: true }), 5000);
        return () => clearInterval(h);
      }
      return null;
    },
  };
}

export async function payments() {
  if (!state.user) return needLogin();
  const [list, w] = await Promise.all([api('/payments'), api('/me/wallet')]);
  const html = accountLayout('/profile', `
    ${crumbs([[t('home'), '/'], [t('dashboard'), '/dashboard'], [t('payments_history')]])}
    <div class="page-head"><h1 class="page-title">${esc(t('payments_history'))}</h1></div>
    <div class="wallet-card"><div><span>${esc(t('wallet'))}</span><b>${esc(w.formatted)}</b><p>${esc(t('wallet_sub'))}</p></div>
      ${w.providers.length ? `<button class="btn btn-accent" data-topup>${icon('plus')} ${esc(t('topup_btn'))}</button>` : ''}</div>
    ${w.items.length ? `<div class="box"><h3>${esc(t('wallet_history'))}</h3>${w.items.map((x) => `<div class="lead" style="grid-template-columns:1fr auto"><div><b>${esc(x.kind_label)}</b><span>${esc([x.note, fmtDate(x.created_at, true)].filter(Boolean).join(' · '))}</span></div><b style="color:${x.sign === '+' ? 'var(--green)' : 'var(--red)'}">${x.sign}${esc(x.formatted)}</b></div>`).join('')}</div>` : ''}
    <div class="box">${list.length ? list.map((p) => `<a class="lead" style="grid-template-columns:1fr auto auto" href="/payments/${p.id}">
      <div><b>${esc(p.title)}</b><span>${esc([p.ref?.title, fmtDate(p.created_at, true), p.provider === 'dev' ? t('provider_dev') : p.provider].filter(Boolean).join(' · '))}</span></div>
      <b>${esc(p.formatted)}</b>${pstTag(p.status)}</a>`).join('') : `<div class="empty">${esc(t('empty'))}</div>`}</div>`);
  return {
    title: t('payments_history'),
    html,
    mount(main) {
      $('[data-topup]', main)?.addEventListener('click', () => {
        const m = openModal(`<h3>${esc(t('topup_btn'))}</h3><p class="small muted">${esc(t('wallet'))}: ${esc(w.formatted)}</p>
          <form><label class="lbl">${esc(t('price'))}, ${esc(state.currency)}</label><input class="input" name="amount" inputmode="decimal" required autofocus>
          <label class="lbl" style="margin-top:12px">${esc(t('pay_with'))}</label>${providerOptions(w.providers)}
          <button class="btn btn-accent btn-block" style="margin-top:14px">${esc(t('topup_btn'))}</button></form>`);
        const getProv = bindSeg(m, '[data-provider]');
        m.querySelector('form').onsubmit = async (e) => {
          e.preventDefault();
          const amount = Number(e.target.amount.value.replace(/\s/g, '').replace(',', '.'));
          const p = await api('/me/wallet/topup', { method: 'POST', body: { amount, provider: getProv() } });
          closeModal();
          goPay(p);
        };
      });
    },
  };
}

// ---------- Tariflar ----------
export async function plans() {
  const d = await api('/plans');
  const cur = d.current;
  const [free, biz] = d.items;
  const li = (txt) => `<li>${icon('check')} ${esc(txt)}</li>`;
  const html = `
    ${crumbs([[t('home'), '/'], [t('plans_link')]])}
    <div class="page-head"><h1 class="page-title">${esc(t('plans_title'))}</h1><p class="page-sub">${esc(t('plans_sub'))}</p></div>
    ${state.user ? `<div class="note" style="margin:0 0 18px">${icon('shield')}<div><b>${esc(t('current_plan'))}: ${esc(cur.name)}${cur.until ? ` · ${esc(t('until', { d: fmtDate(cur.until) }))}` : ''}</b>
      <p>${esc(cur.listings_limit ? `${t('active_listings')}: ${cur.listings_used} / ${cur.listings_limit}` : t('unlimited_listings'))}${cur.top_credits ? ` · TOP: ${cur.top_credits}` : ''}</p></div></div>` : ''}
    <div class="plans">
      <div class="plan"><h3>${esc(free.name)}</h3><div class="pp">0</div>
        <ul>${li(t('listings_limit', { n: free.listings_limit }))}${li(t('send_request'))}${li(t('nav_msgs'))}</ul>
        ${cur.plan === 'free' ? `<span class="tag green">${esc(t('current_plan'))}</span>` : ''}</div>
      <div class="plan pro"><h3>${esc(biz.name)}</h3><div class="pp">${esc(t('per_month_price', { p: biz.price.formatted }))}</div>
        <ul>${li(t('unlimited_listings'))}${li(t('top_credits', { n: biz.top_credits }))}${li(t('priority_mod'))}${li(t('analytics'))}${li(t('import'))}</ul>
        ${state.user ? `<label class="lbl">${esc(t('term_months'))}</label><div class="seg" data-months>${[1, 3, 6, 12].map((n, i) => `<button type="button" data-v="${n}" class="${i === 0 ? 'on' : ''}">${esc(t('months_n', { n }))}</button>`).join('')}</div>
        <label class="lbl">${esc(t('pay_with'))}</label>${providerOptions(d.providers)}
        <button class="btn btn-primary btn-block" data-sub>${esc(t('choose_plan'))}</button>` : `<button class="btn btn-primary btn-block" data-login>${esc(t('login'))}</button>`}</div>
    </div>`;
  return {
    title: t('plans_link'),
    html,
    mount(main) {
      const months = bindSeg(main, '[data-months]');
      const prov = bindSeg(main, '[data-provider]');
      $('[data-sub]', main)?.addEventListener('click', async () => {
        const r = await api('/plans/subscribe', { method: 'POST', body: { plan: 'business', months: Number(months() || 1), provider: prov() || d.providers[0]?.id } });
        goPay(r);
      });
    },
  };
}

// ---------- Solishtirish ----------
export async function compare() {
  const ids = compareList();
  const items = ids.length ? await api(`/compare?ids=${ids.join(',')}`) : [];
  if (!items.length) {
    return { title: t('compare_title'), html: `${crumbs([[t('home'), '/'], [t('compare_title')]])}<div class="page-head"><h1 class="page-title">${esc(t('compare_title'))}</h1></div>${emptyBox(t('empty'), t('compare_empty'))}` };
  }
  const row = (label, fn) => `<tr><th>${esc(label)}</th>${items.map((l) => `<td>${fn(l) ?? '—'}</td>`).join('')}</tr>`;
  const f = (k) => (l) => (l.facts[k] !== null && l.facts[k] !== undefined && l.facts[k] !== '' ? esc(String(typeof l.facts[k] === 'number' ? num(l.facts[k]) : l.facts[k])) : null);
  // Eng arzonini belgilash (USD bo'yicha emas — ko'rsatilgan valyutada)
  const minPrice = Math.min(...items.map((l) => l.price.amount ?? Infinity));
  const html = `
    ${crumbs([[t('home'), '/'], [t('compare_title')]])}
    <div class="page-head"><h1 class="page-title">${esc(t('compare_title'))}</h1></div>
    <div style="overflow-x:auto"><table class="cmp-table">
      <tr><th></th>${items.map((l) => `<td><a href="/listing/${l.id}"><img src="${esc(imgOf(l))}" alt=""></a><b style="display:block;margin-top:8px;font-size:13px"><a href="/listing/${l.id}">${esc(l.title)}</a></b>
        <button class="btn btn-ghost btn-sm" data-rm="${l.id}">${icon('x')} ${esc(t('remove'))}</button></td>`).join('')}</tr>
      ${row(t('price'), (l) => `<b style="font-size:15px;${l.price.amount === minPrice ? 'color:var(--green)' : ''}">${esc(priceText(l.price))}</b>`)}
      ${row(t('sp_brand_model'), (l) => esc([l.facts.brand, l.facts.model].filter(Boolean).join(' ')) || null)}
      ${row(t('year'), (l) => (l.facts.year ? String(l.facts.year) : null))}
      ${row(t('sp_hours'), (l) => (l.facts.hours ? `${num(l.facts.hours)} ${esc(t('u_mh'))}` : null))}
      ${row(t('sp_mileage'), (l) => (l.facts.mileage_km ? `${num(l.facts.mileage_km)} ${esc(t('u_km'))}` : null))}
      ${row(t('sp_power'), (l) => (l.facts.power_hp ? `${num(l.facts.power_hp)} ${esc(t('u_hp'))}` : null))}
      ${row(t('sp_weight'), (l) => (l.facts.weight_kg ? `${num(l.facts.weight_kg)} kg` : null))}
      ${row(t('sp_capacity'), (l) => (l.facts.capacity_t ? `${num(l.facts.capacity_t)} ${esc(t('u_t'))}` : null))}
      ${row(t('condition'), f('condition_label'))}
      ${row(t('sp_drive'), (l) => esc(l.drive || '') || null)}
      ${row(t('sp_docs'), (l) => esc(l.docs || '') || null)}
      ${row(t('leasing'), (l) => (l.leasing ? '✓' : null))}
      ${row(t('location'), (l) => esc([l.location.city, l.location.country_name].filter(Boolean).join(', ')))}
      ${row(t('seller'), (l) => `${esc(l.seller.name)}${l.seller.verified ? ` <span class="tag green">${esc(t('company_verified'))}</span>` : ''}${l.seller.reviews_count ? `<br><span class="rating">★ ${String(l.seller.rating).replace('.', ',')}</span>` : ''}`)}
    </table></div>`;
  return {
    title: t('compare_title'),
    html,
    mount(main) {
      $$('[data-rm]', main).forEach((b) => b.addEventListener('click', () => { toggleCompare(b.dataset.rm); render({ keepScroll: true }); }));
    },
  };
}

// ---------- Ommaviy yuklash ----------
export async function importPage() {
  if (!state.user) return needLogin();
  const html = accountLayout('/my/listings', `
    ${crumbs([[t('home'), '/'], [t('my_listings'), '/my/listings'], [t('import')]])}
    <div class="page-head"><h1 class="page-title">${esc(t('import'))}</h1><p class="page-sub">${esc(t('import_sub'))}</p></div>
    <form class="box" data-imp>
      <button type="button" class="btn btn-soft" data-tpl>${icon('file')} ${esc(t('download_template'))}</button>
      <div style="margin-top:16px"><input type="file" name="file" accept=".csv,text/csv" required class="input" style="padding:8px"></div>
      <label class="check" style="margin-top:12px"><input type="checkbox" name="publish"> ${esc(t('publish_after'))}</label>
      <button class="btn btn-primary" style="margin-top:14px">${icon('upload')} ${esc(t('upload'))}</button>
    </form>
    <div data-res></div>`);
  return {
    title: t('import'),
    html,
    mount(main) {
      $('[data-tpl]', main).onclick = async () => {
        const r = await fetch('/api/v1/my/listings/import/template', { headers: { Authorization: `Bearer ${state.token}` } });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(await r.blob());
        a.download = 'movexgo-import.csv';
        a.click();
      };
      $('[data-imp]', main).onsubmit = async (e) => {
        e.preventDefault();
        const f = e.target;
        const fd = new FormData();
        fd.append('file', f.file.files[0]);
        if (f.publish.checked) fd.append('publish', '1');
        const btn = f.querySelector('button.btn-primary');
        btn.disabled = true;
        try {
          const r = await api('/my/listings/import', { method: 'POST', form: fd });
          $('[data-res]', main).innerHTML = `<div class="box"><h3>${esc(t('import_result', { c: r.created, t: r.total }))}</h3>
            ${r.results.map((x) => `<div class="lead" style="grid-template-columns:90px 1fr auto"><b>${esc(t('row_n', { n: x.row }))}</b>
              <span>${x.ok ? `<a class="link-blue" href="/create/${x.id}">№ ${x.id}</a> · ${esc(state.meta.listing_statuses.find((s) => s.value === x.status)?.label || x.status)}${x.warning ? ` · ${esc(x.warning)}` : ''}` : `<span style="color:var(--red)">${esc(x.error || '')}${x.details ? `: ${esc(Object.keys(x.details).join(', '))}` : ''}</span>`}</span>
              <span>${x.ok ? icon('check') : icon('x')}</span></div>`).join('')}
            <a class="btn btn-soft btn-sm" style="margin-top:12px" href="/my/listings">${esc(t('my_listings'))}</a></div>`;
        } finally { btn.disabled = false; }
      };
    },
  };
}

// ---------- Batafsil statistika ----------
export async function analytics({ query }) {
  if (!state.user) return needLogin();
  const days = Number(query.days) || 30;
  const a = await api(`/seller/analytics?days=${days}`);
  const max = Math.max(1, ...a.funnel.map((x) => x.value));
  const srcTotal = a.sources.reduce((s, x) => s + x.n, 0) || 1;
  const srcName = (s) => { const k = `src_${s}`; const v = t(k); return v === k ? s : v; };
  const dmax = Math.max(1, ...a.daily.map((x) => x.views));
  const html = accountLayout('/dashboard', `
    ${crumbs([[t('home'), '/'], [t('dashboard'), '/dashboard'], [t('analytics')]])}
    <div class="page-head" style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-end"><div><h1 class="page-title">${esc(t('analytics'))}</h1></div>
      <div class="tabs" style="margin:0">${[7, 30, 90].map((n) => `<a class="tab ${days === n ? 'on' : ''}" href="/analytics?days=${n}">${esc(t('last_n_days', { n }))}</a>`).join('')}</div></div>
    <div class="box"><h3>${esc(t('funnel'))}</h3>
      ${a.funnel.map((f, i) => `<div class="funnel-row"><span>${esc(t(`f_${f.key}`))}</span><div class="funnel-bar" style="width:${Math.max(0.5, (f.value / max) * 100)}%;${i ? 'background:var(--teal)' : ''}"></div><b>${num(f.value)}</b></div>`).join('')}
      <p class="tiny muted" style="margin:10px 0 0">${esc(t('conversion'))}: ${a.funnel[0].value ? ((((a.funnel[1].value + a.funnel[3].value) / a.funnel[0].value) * 100).toFixed(1)).replace('.', ',') : 0}%</p>
    </div>
    <div class="dash-row">
      <div class="box" style="margin:0"><h3>${esc(t('views_lbl'))}</h3>
        <div class="chart" style="gap:3px">${a.daily.map((x) => `<div class="col" title="${esc(x.day)}: ${x.views}"><div class="bar" style="height:${Math.round((x.views / dmax) * 100)}%"></div></div>`).join('')}</div></div>
      <div class="box" style="margin:0"><h3>${esc(t('sources'))}</h3>
        ${a.sources.length ? a.sources.map((s) => `<div class="funnel-row" style="grid-template-columns:110px 1fr 46px"><span>${esc(srcName(s.source))}</span><div class="funnel-bar" style="width:${(s.n / srcTotal) * 100}%;background:var(--teal)"></div><b>${Math.round((s.n / srcTotal) * 100)}%</b></div>`).join('') : `<div class="empty">${esc(t('empty'))}</div>`}</div>
    </div>
    <div class="box" style="margin-top:14px"><h3>${esc(t('your_listings'))}</h3>
      <div style="overflow-x:auto"><table class="spec" style="font-size:12px"><tr><td><b>${esc(t('listing_title'))}</b></td><td><b>${esc(t('f_views'))}</b></td><td><b>${esc(t('f_phone_reveals'))}</b></td><td><b>${esc(t('f_conversations'))}</b></td><td><b>${esc(t('conversion'))}</b></td></tr>
      ${a.top.map((x) => `<tr><td><a class="link-blue" href="/listing/${x.id}">${esc(x.title)}</a></td><td>${num(x.views)}</td><td>${num(x.phones)}</td><td>${num(x.chats)}</td><td>${String(x.conversion).replace('.', ',')}%</td></tr>`).join('')}</table></div></div>`);
  return { title: t('analytics'), html };
}

export { go, factsLine };
