import { state, t, esc, api, icon, money, num, locale, openModal, closeModal, toast, $, $$ } from './core.js';

// ---------- Xarita (Leaflet, OpenStreetMap) ----------
let leafletP = null;
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!leafletP) {
    leafletP = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = '/vendor/leaflet/leaflet.css';
      document.head.appendChild(css);
      const s = document.createElement('script');
      s.src = '/vendor/leaflet/leaflet.js';
      s.onload = () => resolve(window.L);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  return leafletP;
}

// markers: [{lat, lng, html}] ; onClick(latlng) — joy tanlash rejimi
export async function mapWidget(el, { markers = [], center, zoom = 11, onClick, picked } = {}) {
  const L = await loadLeaflet();
  const map = L.map(el, { scrollWheelZoom: false, attributionControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
  const icon = L.icon({ iconUrl: '/vendor/leaflet/images/marker-icon.png', iconRetinaUrl: '/vendor/leaflet/images/marker-icon-2x.png', shadowUrl: '/vendor/leaflet/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] });
  const group = [];
  for (const m of markers) {
    const mk = L.marker([m.lat, m.lng], { icon }).addTo(map);
    if (m.html) mk.bindPopup(m.html);
    group.push([m.lat, m.lng]);
  }
  if (group.length > 1) map.fitBounds(group, { padding: [30, 30], maxZoom: 13 });
  else map.setView(center || group[0] || [41.31, 69.28], group.length ? 13 : zoom);
  let pin = picked ? L.marker([picked.lat, picked.lng], { icon }).addTo(map) : null;
  if (onClick) {
    map.on('click', (e) => {
      if (pin) pin.setLatLng(e.latlng);
      else pin = L.marker(e.latlng, { icon }).addTo(map);
      onClick({ lat: Math.round(e.latlng.lat * 1e5) / 1e5, lng: Math.round(e.latlng.lng * 1e5) / 1e5 });
    });
  }
  setTimeout(() => map.invalidateSize(), 50);
  return map;
}

export function geolocate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('no geo'));
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: Math.round(p.coords.latitude * 1e4) / 1e4, lng: Math.round(p.coords.longitude * 1e4) / 1e4 }), reject, { timeout: 10000, maximumAge: 600000 });
  });
}

// ---------- To'lov ----------
export function providerOptions(providers, extra = '') {
  const label = (p) => (p.id === 'dev' ? t('provider_dev') : p.id === 'balance' ? `💳 ${t('pay_balance')}` : p.name);
  return `<div class="seg" data-provider>${extra}${providers.map((p, i) => `<button type="button" data-v="${p.id}" class="${i === 0 && !extra ? 'on' : ''}">${esc(label(p))}</button>`).join('')}</div>`;
}
export function bindSeg(root, sel) {
  const box = $(sel, root);
  box?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    $$('[data-v]', box).forEach((x) => x.classList.toggle('on', x === b));
  });
  return () => $('[data-v].on', box)?.dataset.v;
}
// To'lov yaratilgach: sinov — bizning sahifa, Click/Payme — provayder sahifasi
export function goPay(p) {
  if (p.provider === 'dev' || !/^https?:/.test(p.pay_url)) window.mxGo(`/payments/${p.id}`);
  else window.location.href = p.pay_url;
}

// ---------- E'lonni ko'tarish ----------
// Paketlar: kompaniyalarga "Biznes" (VIP/GOLD/PREMIUM — bosh sahifa karusellari), hammaga — TOP (OLX kabi)
const pkgCard = (p, name) => `<label class="tier-opt ${p.id}">
      <input type="radio" name="${name}" value="${p.id}">
      ${p.id === 'gold' ? `<span class="tier-pop">${esc(t('popular_pick'))}</span>` : ''}
      <span class="tier-name">${p.id === 'vip' ? icon('star') : ''}${esc(p.group === 'top' ? p.name.split(' — ')[0] : p.name)}</span>
      <b class="tier-price">${esc(p.price.formatted)}</b>
      <span class="tier-days">${esc(t('tier_days', { d: p.days }))}</span>
      <span class="tier-place">${esc(p.place)}</span>
    </label>`;
export function packageOptions(pk, name, preset, { withFree = false } = {}) {
  const biz = pk.items.filter((p) => p.group === 'business');
  const top = pk.items.filter((p) => p.group === 'top');
  const free = withFree ? `<label class="tier-opt free"><input type="radio" name="${name}" value=""><span class="tier-name">${esc(t('tier_free'))}</span><span class="tier-place">${esc(t('tier_free_sub'))}</span></label>` : '';
  const html = `${biz.length ? `<h4 class="tier-group">${esc(t('biz_group'))}</h4><div class="tier-pick">${biz.map((p) => pkgCard(p, name)).join('')}</div>`
    : `<a class="tier-locked" href="/profile#p-company">${icon('building')}<span>${esc(t('company_only_note'))}</span><b>${esc(t('add_company'))} →</b></a>`}
    <h4 class="tier-group">${esc(t('top_group'))}</h4><div class="tier-pick ${withFree ? 'four' : ''}">${free}${top.map((p) => pkgCard(p, name)).join('')}</div>`;
  // Oldindan tanlash: so'ralgan paket, bo'lmasa — kompaniyaga GOLD, boshqalarga TOP (yoki bepul)
  const ids = pk.items.map((p) => p.id);
  const pick = ids.includes(preset) ? preset : withFree ? '' : (ids.includes('gold') ? 'gold' : 'top');
  return html.replace(`name="${name}" value="${pick}"`, `name="${name}" value="${pick}" checked`);
}

export async function promoteModal(listing, preset = '') {
  const pk = await api('/promo/packages');
  // Biznes tarif krediti: kompaniyada — PREMIUM, boshqalarda — TOP
  const creditPkg = pk.is_company ? 'premium' : 'top';
  const credit = pk.credits > 0 ? `<button type="button" data-v="credit" data-credit>${esc(t(pk.is_company ? 'use_credit_premium' : 'use_credit', { n: pk.credits }))}</button>` : '';
  const m = openModal(`<h3>${esc(t('promote_title'))}</h3><p class="small muted">${esc(listing.title)}<br>${esc(t('tier_sub'))}</p>${listing.status === 'moderation' ? `<div class="adm-warn" style="margin:10px 0 0">${icon('shield')} ${esc(t('tier_moderation_note'))}</div>` : ''}
    <div data-pk>${packageOptions(pk, 'pk', preset)}</div>
    <label class="lbl">${esc(t('pay_with'))}</label>${providerOptions(pk.providers, credit)}
    <button class="btn btn-primary btn-block" data-go>${esc(t('pay'))}</button>`, { wide: true });
  const getProv = bindSeg(m, '[data-provider]');
  // Kredit tanlansa — mos paket avtomatik belgilanadi
  m.querySelector('[data-credit]')?.addEventListener('click', () => { m.querySelector(`input[name=pk][value=${creditPkg}]`).checked = true; });
  m.querySelector('[data-go]').onclick = async (e) => {
    const btn = e.currentTarget;
    if (btn.disabled) return;
    const provider = getProv() || pk.providers[0]?.id;
    if (provider === 'credit') m.querySelector(`input[name=pk][value=${creditPkg}]`).checked = true;
    const pkg = m.querySelector('input[name=pk]:checked').value;
    btn.disabled = true;
    let r;
    try { r = await api(`/listings/${listing.id}/promote`, { method: 'POST', body: { package: pkg, provider } }); } finally { btn.disabled = false; }
    closeModal();
    if (r.status === 'paid') { toast(t('payment_success'), 'ok'); window.dispatchEvent(new Event('mx:refresh')); return; }
    goPay(r);
  };
}

// ---------- Lizing kalkulyatori ----------
export function leasingModal(price, currency) {
  const m = openModal(`<h3>${esc(t('leasing_calc'))}</h3>
    <div class="form-grid" style="margin-top:12px">
      <div class="full"><label class="lbl">${esc(t('price'))}, ${esc(currency)}</label><input class="input" name="price" inputmode="numeric" value="${price || ''}"></div>
      <div><label class="lbl">${esc(t('down_payment'))}</label><input class="input" name="down" type="number" min="0" max="90" value="20"></div>
      <div><label class="lbl">${esc(t('term_months'))}</label><input class="input" name="term" type="number" min="6" max="84" value="36"></div>
      <div class="full"><label class="lbl">${esc(t('rate_year'))}</label><input class="input" name="rate" type="number" min="0" max="80" step="0.5" value="${{ UZS: 24, KZT: 18, RUB: 20, KGS: 20, TJS: 24, AZN: 14 }[currency] || 18}"></div>
    </div>
    <div class="box" style="margin-top:14px;background:var(--blue-soft);border:0"><span class="small muted">${esc(t('monthly_payment'))}</span><div style="font-size:24px;font-weight:700" data-mp>—</div><span class="tiny muted" data-ov></span></div>`);
  const calc = () => {
    const P = Number(String(m.querySelector('[name=price]').value).replace(/\s/g, '')) || 0;
    const down = Math.min(90, Math.max(0, Number(m.querySelector('[name=down]').value) || 0));
    const n = Math.max(1, Number(m.querySelector('[name=term]').value) || 1);
    const r = (Number(m.querySelector('[name=rate]').value) || 0) / 1200;
    const body = P * (1 - down / 100);
    const pay = r ? (body * r) / (1 - (1 + r) ** -n) : body / n;
    m.querySelector('[data-mp]').textContent = money(Math.round(pay), currency);
    m.querySelector('[data-ov]').textContent = `${t('overpay')}: ${money(Math.max(0, Math.round(pay * n - body)), currency)}`;
  };
  m.addEventListener('input', calc);
  calc();
}

// ---------- Solishtirish ----------
const CMP = 'mx_compare';
export const compareList = () => { try { return JSON.parse(localStorage.getItem(CMP) || '[]'); } catch { return []; } };
export function toggleCompare(id) {
  let l = compareList();
  id = Number(id);
  l = l.includes(id) ? l.filter((x) => x !== id) : [...l, id].slice(-4);
  try { localStorage.setItem(CMP, JSON.stringify(l)); } catch { /* */ }
  return l.includes(id);
}

// ---------- Shikoyat ----------
export function reportModal(id) {
  const reasons = ['fake', 'price', 'sold', 'fraud', 'duplicate', 'other'];
  const m = openModal(`<h3>${esc(t('report_title'))}</h3><form style="margin-top:12px">
    ${reasons.map((r, i) => `<label class="check"><input type="radio" name="reason" value="${r}" ${i === 0 ? 'checked' : ''}> ${esc(t(`rr_${r}`))}</label>`).join('')}
    <textarea class="input" name="comment" maxlength="1000" style="margin-top:10px;min-height:70px" placeholder="${esc(t('comment'))}"></textarea>
    <button class="btn btn-danger btn-block" style="margin-top:12px">${esc(t('send'))}</button></form>`);
  m.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    await api(`/listings/${id}/report`, { method: 'POST', body: { reason: e.target.reason.value, comment: e.target.comment.value.trim() || undefined } });
    closeModal();
    toast(t('report_sent'), 'ok');
  };
}

// ---------- Texnik ko'rik ----------
export async function inspectionModal(listing) {
  const pr = await api('/inspection/price');
  const m = openModal(`<h3>${esc(t('inspection'))}</h3><p class="small muted">${esc(listing.title)}</p>
    <p class="small">${esc(t('inspection_sub'))}</p>
    <div style="font-size:24px;font-weight:700;margin:8px 0 14px">${esc(pr.formatted)}</div>
    <label class="lbl">${esc(t('comment'))}</label><textarea class="input" name="note" style="min-height:70px"></textarea>
    <label class="lbl" style="margin-top:12px">${esc(t('pay_with'))}</label>${providerOptions(pr.providers)}
    <button class="btn btn-primary btn-block" data-go>${esc(t('order_inspection'))}</button>`);
  const getProv = bindSeg(m, '[data-provider]');
  m.querySelector('[data-go]').onclick = async () => {
    const r = await api(`/listings/${listing.id}/inspections`, { method: 'POST', body: { note: m.querySelector('[name=note]').value.trim() || undefined, provider: getProv() } });
    closeModal();
    goPay(r);
  };
}

// ---------- Narx tarixi grafigi ----------
export function priceChart(h) {
  if (!h || h.length < 2) return '';
  const w = 520; const ht = 120; const pad = 8;
  const ps = h.map((x) => x.price);
  const min = Math.min(...ps); const max = Math.max(...ps);
  const x = (i) => pad + (i * (w - pad * 2)) / (h.length - 1);
  const y = (p) => (max === min ? ht / 2 : pad + ((max - p) * (ht - pad * 2)) / (max - min));
  const pts = h.map((p, i) => `${x(i).toFixed(1)},${y(p.price).toFixed(1)}`).join(' ');
  const date = (s) => new Date(`${s.replace(' ', 'T')}Z`).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
  return `<svg viewBox="0 0 ${w} ${ht}" style="width:100%;height:120px" role="img" aria-label="${esc(t('price_history'))}">
      <polyline fill="none" stroke="var(--blue)" stroke-width="2.5" points="${pts}"/>
      ${h.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.price)}" r="4" fill="${i === h.length - 1 ? 'var(--teal)' : 'var(--blue)'}"><title>${esc(p.formatted)} · ${esc(date(p.at))}</title></circle>`).join('')}
    </svg>
    <div style="display:flex;justify-content:space-between" class="tiny muted">${h.map((p) => `<span>${esc(date(p.at))}<br><b style="color:var(--ink)">${esc(p.formatted)}</b></span>`).join('')}</div>`;
}

// ---------- Ijara kalendari ----------
const iso = (d) => d.toISOString().slice(0, 10);
export async function calendarWidget(el, listing, { owner = false, onPick } = {}) {
  let offset = 0;
  let sel = { start: null, end: null };
  const draw = async () => {
    const first = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + offset, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 2, 0));
    const av = await api(`/listings/${listing.id}/availability?from=${iso(first)}&to=${iso(last)}`);
    const busy = new Set(av.busy);
    const blocked = new Set(av.blocked);
    const today = iso(new Date());
    const months = [0, 1].map((k) => {
      const m0 = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + k, 1));
      const daysIn = new Date(Date.UTC(m0.getUTCFullYear(), m0.getUTCMonth() + 1, 0)).getUTCDate();
      const lead = (m0.getUTCDay() + 6) % 7;
      const title = m0.toLocaleDateString(locale(), { month: 'long', year: 'numeric', timeZone: 'UTC' });
      const cells = [];
      for (let i = 0; i < lead; i += 1) cells.push('<span></span>');
      for (let d = 1; d <= daysIn; d += 1) {
        const s = iso(new Date(Date.UTC(m0.getUTCFullYear(), m0.getUTCMonth(), d)));
        const past = s < today;
        const st = busy.has(s) ? 'busy' : blocked.has(s) ? 'blocked' : 'free';
        const inSel = sel.start && s >= sel.start && s <= (sel.end || sel.start);
        cells.push(`<button type="button" class="cal-d ${st} ${past ? 'past' : ''} ${inSel ? 'sel' : ''}" data-d="${s}" ${past || st === 'busy' || (st === 'blocked' && !owner) ? 'disabled' : ''}>${d}</button>`);
      }
      return `<div><b class="small">${esc(title)}</b><div class="cal">${cells.join('')}</div></div>`;
    });
    el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <button type="button" class="icon-btn" data-prev ${offset <= 0 ? 'disabled' : ''}>${icon('arrow-left', 'arrow-flip')}</button>
        <span class="tiny muted"><i class="cal-key free"></i>${esc(t('free_day'))} <i class="cal-key busy"></i>${esc(t('busy'))} <i class="cal-key blocked"></i>${esc(t('blocked_day'))}</span>
        <button type="button" class="icon-btn" data-next>${icon('arrow', 'arrow-flip')}</button></div>
      <div class="cal-wrap">${months.join('')}</div>${owner ? `<p class="tiny muted" style="margin:8px 0 0">${esc(t('owner_calendar_hint'))}</p>` : ''}`;
  };
  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-prev]')) { offset = Math.max(0, offset - 1); return draw(); }
    if (e.target.closest('[data-next]')) { offset += 1; return draw(); }
    const b = e.target.closest('[data-d]');
    if (!b || b.disabled) return;
    const d = b.dataset.d;
    if (owner) {
      const blocked = b.classList.contains('blocked');
      await api(`/listings/${listing.id}/blocked-dates`, { method: 'PUT', body: blocked ? { remove: [d] } : { add: [d] } });
      return draw();
    }
    if (!sel.start || sel.end || d < sel.start) sel = { start: d, end: null };
    else sel.end = d;
    await draw();
    onPick?.({ ...sel });
  });
  await draw();
}

// ---------- Ovozli qidiruv ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const SR_LANG = { uz: 'uz-UZ', ru: 'ru-RU', en: 'en-US', kk: 'kk-KZ', ky: 'ky-KG', tg: 'tg-TJ', tk: 'tk-TM', az: 'az-AZ', prs: 'fa-AF', ps: 'ps-AF' };
export const voiceSupported = () => Boolean(SR);
export function voiceButton() {
  return SR ? `<button type="button" class="icon-btn mic" data-voice title="${esc(t('voice_search'))}">${icon('mic')}</button>` : '';
}
export function startVoice(form) {
  const rec = new SR();
  rec.lang = SR_LANG[state.lang] || 'ru-RU';
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  const input = form.querySelector('input[name=q]');
  const ph = input.placeholder;
  input.placeholder = t('listening');
  form.classList.add('listening');
  rec.onresult = (e) => {
    input.value = [...e.results].map((r) => r[0].transcript).join(' ');
    if (e.results[e.results.length - 1].isFinal) form.requestSubmit();
  };
  rec.onend = () => { input.placeholder = ph; form.classList.remove('listening'); };
  rec.onerror = () => toast(t('error'), 'err');
  rec.start();
}

export { num };

// ---------- Ulashish ----------
export async function shareLink(url, title, text = '') {
  const full = new URL(url, location.origin).href;
  // Telefon brauzerlari: o'rnatilgan ulashish menyusi
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ title, text: text || title, url: full }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const u = encodeURIComponent(full);
  const msg = encodeURIComponent(text ? `${title} — ${text}` : title);
  const nets = [
    ['telegram', 'Telegram', `https://t.me/share/url?url=${u}&text=${msg}`, '#229ed9'],
    ['whatsapp', 'WhatsApp', `https://wa.me/?text=${msg}%20${u}`, '#25d366'],
    ['facebook', 'Facebook', `https://www.facebook.com/sharer/sharer.php?u=${u}`, '#1877f2'],
    ['vk', 'VK', `https://vk.com/share.php?url=${u}`, '#0077ff'],
    ['viber', 'Viber', `viber://forward?text=${msg}%20${u}`, '#7360f2'],
    ['email', 'E-mail', `mailto:?subject=${msg}&body=${u}`, '#5b6b7c'],
  ];
  const m = openModal(`<h3>${esc(t('share'))}</h3><p class="small muted" style="margin:4px 0 14px">${esc(title)}</p>
    <div class="share-grid">${nets.map(([k, name, href, c]) => `<a class="share-btn" href="${href}" target="_blank" rel="noopener" style="--c:${c}"><span>${name.slice(0, 1)}</span>${name}</a>`).join('')}</div>
    <div class="share-copy"><input class="input" readonly value="${esc(full)}"><button class="btn btn-primary" data-copy>${esc(t('copy_link'))}</button></div>`);
  const inp = m.querySelector('.share-copy input');
  m.querySelector('[data-copy]').onclick = async () => {
    try { await navigator.clipboard.writeText(full); } catch { inp.select(); document.execCommand('copy'); }
    toast(t('link_copied'), 'ok');
  };
  inp.onclick = () => inp.select();
}
