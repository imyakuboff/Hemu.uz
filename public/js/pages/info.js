// Ma'lumot sahifalari: ommaviy oferta, maxfiylik siyosati, bog'lanish (FAQ + murojaat),
// texnika narxlari va sotuvchilar reytingi
import { state, t, esc, api, icon, num, qs, fmtDate, toast } from '../core.js';
import { emptyBox, phoneField, readPhone, supportPhone } from '../ui.js';
import { BRAND } from '../art.js';

// "## Sarlavha", "- ro'yxat" va oddiy xatboshilardan iborat matnni xavfsiz HTML ga aylantirish
function prose(text) {
  const out = [];
  let list = null;
  const flush = () => { if (list) { out.push(`<ul>${list.join('')}</ul>`); list = null; } };
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (line.startsWith('## ')) { flush(); out.push(`<h2>${esc(line.slice(3))}</h2>`); continue; }
    if (line.startsWith('- ')) { (list ||= []).push(`<li>${esc(line.slice(2))}</li>`); continue; }
    flush();
    out.push(`<p>${esc(line)}</p>`);
  }
  flush();
  return out.join('');
}

async function docPage(key, title) {
  const p = await api(`/pages/${key}`);
  return {
    title,
    html: `<div class="doc-page"><div class="page-head"><h1 class="page-title">${esc(title)}</h1>${p.updated_at ? `<p class="page-sub">${esc(fmtDate(p.updated_at))}</p>` : ''}</div>
      <article class="box doc">${prose(p.text)}</article></div>`,
  };
}

export const terms = () => docPage('terms', t('terms_title'));
export const privacy = () => docPage('privacy', t('privacy'));

// ---------- Bog'lanish ----------
const TOPICS = ['question', 'payment', 'listing', 'complaint', 'ads', 'other'];

export async function contact() {
  const [faq, mine] = await Promise.all([api('/pages/faq'), state.user ? api('/me/support', { silent: true }).catch(() => []) : []]);
  const pf = state.platform || {};
  const phone = supportPhone();
  const tg = pf.support_telegram ? String(pf.support_telegram).replace(/^@/, '') : '';
  // FAQ: har bir "## Savol" — ochiladigan blok
  const qa = String(faq.text).split(/^## /m).filter((x) => x.trim()).map((blk) => {
    const [q, ...rest] = blk.split(/\r?\n/);
    return `<details class="faq"><summary>${esc(q.trim())}</summary><div class="prose-doc">${prose(rest.join('\n'))}</div></details>`;
  }).join('');
  const html = `
    <div class="page-head"><h1 class="page-title">${esc(t('contact_title'))}</h1><p class="page-sub">${esc(t('contact_sub'))}</p></div>
    <div class="contact-cards">
      <a class="contact-card main" href="tel:${esc(phone.replace(/[^\d+]/g, ''))}">${icon('phone')}<div><span>${esc(t('call_us'))}</span><b>${esc(phone)}</b><em>${esc(t('work_time'))}</em></div></a>
      ${tg ? `<a class="contact-card tg" href="https://t.me/${esc(tg)}" target="_blank" rel="noopener">${BRAND.telegram}<div><span>Telegram</span><b>@${esc(tg)}</b></div></a>` : ''}
      ${pf.support_email ? `<a class="contact-card" href="mailto:${esc(pf.support_email)}">${BRAND.email}<div><span>E-mail</span><b>${esc(pf.support_email)}</b></div></a>` : ''}
    </div>
    <div class="contact-grid">
      <div>
        <h2 class="sec-title">${esc(t('faq_title'))}</h2>
        <div class="box faq-box">${qa}</div>
      </div>
      <div>
        <h2 class="sec-title">${esc(t('support_form'))}</h2>
        <form class="box" data-sup>
          ${state.user ? '' : `<label class="lbl">${esc(t('your_name'))}</label><input class="input" name="name" required minlength="2" maxlength="80">
          <label class="lbl" style="margin-top:12px">${esc(t('phone'))}</label>${phoneField()}`}
          <label class="lbl" style="margin-top:12px">${esc(t('topic'))}</label>
          <select class="input" name="topic">${TOPICS.map((x) => `<option value="${x}">${esc(t(`topic_${x}`))}</option>`).join('')}</select>
          <label class="lbl" style="margin-top:12px">${esc(t('message'))}</label>
          <textarea class="input" name="message" rows="5" required minlength="10" maxlength="3000"></textarea>
          <button class="btn btn-primary btn-block" style="margin-top:14px">${icon('send')} ${esc(t('send'))}</button>
        </form>
        ${mine.length ? `<h2 class="sec-title" style="margin-top:22px">${esc(t('my_support'))}</h2>${mine.map((m) => `<div class="box sup-item">
          <div class="sup-hd"><span class="tag">${esc(t(`topic_${m.topic}`))}</span><span class="tag ${m.status === 'answered' ? 'green' : m.status === 'new' ? 'orange' : 'grey'}">${esc(t(`st_${m.status}`))}</span><span class="tiny muted">${esc(fmtDate(m.created_at, true))}</span></div>
          <p>${esc(m.message)}</p>${m.reply ? `<div class="sup-reply"><b>HEMU.UZ</b><p>${esc(m.reply)}</p></div>` : ''}</div>`).join('')}` : ''}
      </div>
    </div>`;
  return {
    title: t('contact_title'),
    html,
    mount(main) {
      main.querySelector('[data-sup]').onsubmit = async (e) => {
        e.preventDefault();
        const f = e.target;
        const body = { topic: f.topic.value, message: f.message.value.trim() };
        if (!state.user) { body.name = f.name.value.trim(); body.phone = readPhone(f).phone; }
        await api('/support', { method: 'POST', body });
        toast(t('support_sent'), 'ok');
        f.reset();
        window.dispatchEvent(new Event('mx:refresh'));
      };
    },
  };
}

// ---------- Texnika narxlari ----------
export async function prices({ query }) {
  const r = await api(`/market/prices${qs({ q: query.q, category: query.category, deal_type: query.deal_type })}`);
  const cats = (state.cats || []).filter((c) => !c.parent_id || c.parent_id === null);
  const trend = (v) => (v === null || v === undefined ? '—' : `<span class="${v > 0 ? 'up' : v < 0 ? 'down' : ''}">${v > 0 ? '▲' : v < 0 ? '▼' : ''} ${Math.abs(v).toString().replace('.', ',')}%</span>`);
  const html = `
    <div class="page-head"><h1 class="page-title">${esc(t('prices_title'))}</h1><p class="page-sub">${esc(t('prices_sub'))}</p></div>
    <form class="box price-filter" data-pf>
      <input class="input" name="q" value="${esc(query.q || '')}" placeholder="${esc(t('brand_model_ph'))}">
      <select class="input" name="category"><option value="">${esc(t('all_categories'))}</option>${cats.map((c) => `<option value="${esc(c.slug)}" ${query.category === c.slug ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <button class="btn btn-primary">${icon('search')} ${esc(t('find'))}</button>
    </form>
    ${r.items.length ? `<div class="box price-table-box"><table class="price-table">
      <thead><tr><th>${esc(t('brand'))} / ${esc(t('model'))}</th><th>${esc(t('avg_price'))}</th><th>${esc(t('price_range'))}</th><th>${esc(t('years_lbl'))}</th><th>${esc(t('price_change'))}</th><th></th></tr></thead>
      <tbody>${r.items.map((x) => `<tr>
        <td><b>${esc(x.brand)} ${esc(x.model)}</b><span>${esc(x.subcategory?.name || '')} · ${esc(t('listings_count', { n: num(x.count) }))}</span></td>
        <td class="pt-avg">${esc(x.avg)}</td>
        <td class="muted">${esc(x.min)} — ${esc(x.max)}</td>
        <td>${esc(x.years || '—')}</td>
        <td>${trend(x.trend_pct)}</td>
        <td><a class="btn btn-soft btn-sm" href="/catalog?q=${encodeURIComponent(`${x.brand} ${x.model}`)}">${esc(t('see_listings'))}</a></td>
      </tr>`).join('')}</tbody></table></div>` : emptyBox()}`;
  return {
    title: t('prices_title'),
    html,
    mount(main) {
      main.querySelector('[data-pf]').onsubmit = (e) => {
        e.preventDefault();
        const f = e.target;
        window.mxGo(`/prices${qs({ q: f.q.value.trim() || undefined, category: f.category.value || undefined })}`);
      };
    },
  };
}

// ---------- Sotuvchilar reytingi ----------
export async function sellers({ query }) {
  const sort = ['rating', 'reviews', 'listings', 'deals'].includes(query.sort) ? query.sort : 'rating';
  const list = await api(`/market/sellers${qs({ sort, country: query.country, verified: query.verified })}`);
  const m = state.meta;
  const link = (p) => `/sellers${qs({ sort, country: query.country, verified: query.verified, ...p })}`;
  const html = `
    <div class="page-head"><h1 class="page-title">${esc(t('sellers_title'))}</h1><p class="page-sub">${esc(t('sellers_sub'))}</p></div>
    <div class="box price-filter">
      <div class="tabs" style="margin:0">${['rating', 'reviews', 'listings', 'deals'].map((s) => `<a class="tab ${s === sort ? 'on' : ''}" href="${link({ sort: s })}">${esc(t(`sort_${s}`))}</a>`).join('')}</div>
      <select class="input" data-country style="max-width:220px"><option value="">${esc(t('all_countries'))}</option>${m.countries.map((c) => `<option value="${c.code}" ${query.country === c.code ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <label class="check"><input type="checkbox" data-verified ${query.verified === '1' ? 'checked' : ''}> ${esc(t('verified_only'))}</label>
    </div>
    ${list.length ? `<div class="seller-list">${list.map((c) => `<a class="box seller-row" href="/company/${c.id}">
      <span class="place ${c.place <= 3 ? `p${c.place}` : ''}">${c.place}</span>
      <span class="logo-box">${c.logo ? `<img src="${esc(c.logo)}" alt="">` : esc((c.name || '?').slice(0, 1))}</span>
      <div class="grow"><b>${esc(c.name)} ${c.verified ? `<span class="tag green">${icon('check')} ${esc(t('company_verified'))}</span>` : ''}</b>
        <span>${esc([c.activity, c.city, c.country_name].filter(Boolean).join(' · '))}</span>
        <span class="tiny muted">${esc(t('on_since', { y: c.since }))}</span></div>
      <div class="seller-stats">
        <div><b>${icon('star')} ${c.rating ? String(c.rating).replace('.', ',') : '—'}</b><span>${esc(t('reviews_n', { n: num(c.reviews) }))}</span></div>
        <div><b>${num(c.listings)}</b><span>${esc(t('listings_count', { n: '' }).trim())}</span></div>
        <div><b>${num(c.deals)}</b><span>${esc(t('deals_n', { n: '' }).trim())}</span></div>
      </div>
    </a>`).join('')}</div>` : emptyBox()}`;
  return {
    title: t('sellers_title'),
    html,
    mount(main) {
      main.querySelector('[data-country]').onchange = (e) => window.mxGo(link({ country: e.target.value || undefined }));
      main.querySelector('[data-verified]').onchange = (e) => window.mxGo(link({ verified: e.target.checked ? '1' : undefined }));
    },
  };
}
