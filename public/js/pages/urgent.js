// "Hozir texnika kerak" — tezkor ijara chaqiruvi va uning holati
import { state, t, esc, api, icon, num, fmtRel, toast, $, $$ } from '../core.js';
import { crumbs, regionsOf, requireLogin } from '../ui.js';
import { go, onAuthChanged } from '../app.js';

const HOURS = [2, 4, 8, 16, 24];
const STATUS = { open: 'orange', taken: 'green', cancelled: 'grey', expired: 'grey' };
const tel = (p) => `<a class="btn btn-primary" href="tel:${esc(p)}">${icon('phone')} ${esc(p)}</a>`;

// ---------- Yangi chaqiruv ----------
export async function urgentNew() {
  const [opts, regs] = await Promise.all([api('/urgent-options'), regionsOf(state.user?.country || 'UZ')]);
  const html = `
    ${crumbs([[t('home'), '/'], [t('urgent_title')]])}
    <div class="urgent-hero"><span class="urgent-ico">${icon('bolt')}</span><div><h1 class="page-title">${esc(t('urgent_title'))}</h1><p class="page-sub">${esc(t('urgent_sub'))}</p></div></div>
    <form class="box urgent-form" data-uf novalidate>
      <label class="lbl">${esc(t('urgent_what'))} *</label>
      ${opts.length ? `<select class="input" name="category" required><option value="">${esc(t('choose'))}</option>${opts.map((g) => `<optgroup label="${esc(g.name)}">${g.items.map((s) => `<option value="${esc(s.slug)}">${esc(s.name)} (${num(s.count)})</option>`).join('')}</optgroup>`).join('')}</select>`
    : `<div class="empty small">${esc(t('urgent_none'))}</div>`}
      <label class="lbl" style="margin-top:14px">${esc(t('urgent_hours'))} *</label>
      <div class="seg" data-hours>${HOURS.map((h, i) => `<button type="button" data-v="${h}" class="${i === 1 ? 'on' : ''}">${esc(t('hours_n', { n: h }))}</button>`).join('')}</div>
      <label class="lbl" style="margin-top:6px">${esc(t('urgent_where'))} *</label>
      <div class="urgent-loc">
        <button type="button" class="btn btn-soft" data-geo>${icon('pin')} ${esc(t('urgent_my_location'))}</button>
        <span class="small muted" data-geo-st></span>
      </div>
      <div class="form-grid" style="margin-top:10px">
        <div><label class="lbl">${esc(t('region'))}</label><select class="input" name="region"><option value="">${esc(t('choose'))}</option>${regs.map((r) => `<option value="${r.code}">${esc(r.name)}</option>`).join('')}</select></div>
        <div><label class="lbl">${esc(t('address'))}</label><input class="input" name="address" maxlength="200" placeholder="${esc(t('urgent_addr_ph'))}"></div>
        <div><label class="lbl">${esc(t('urgent_when'))}</label><input class="input" name="start" maxlength="60" placeholder="${esc(t('urgent_when_ph'))}"></div>
        <div><label class="lbl">${esc(t('description'))}</label><input class="input" name="note" maxlength="500" placeholder="${esc(t('urgent_note_ph'))}"></div>
      </div>
      <button class="btn btn-primary btn-block urgent-go" style="margin-top:16px" ${opts.length ? '' : 'disabled'}>${icon('bolt')} ${esc(t('urgent_send'))}</button>
      <p class="tiny muted" style="margin:8px 0 0;text-align:center">${esc(t('urgent_how'))}</p>
    </form>
    <div data-my></div>`;
  return {
    title: t('urgent_title'),
    html,
    async mount(main) {
      const f = $('[data-uf]', main);
      let geo = null;
      let hours = 4;
      $$('[data-hours] button', main).forEach((b) => { b.onclick = () => { $$('[data-hours] button', main).forEach((x) => x.classList.toggle('on', x === b)); hours = Number(b.dataset.v); }; });
      $('[data-geo]', main).onclick = () => {
        const st = $('[data-geo-st]', main);
        if (!navigator.geolocation) { st.textContent = t('urgent_geo_fail'); return; }
        st.textContent = t('loading');
        navigator.geolocation.getCurrentPosition(
          (p) => { geo = { lat: p.coords.latitude, lng: p.coords.longitude }; st.innerHTML = `<span class="green">✓ ${esc(t('urgent_geo_ok'))}</span>`; },
          () => { st.textContent = t('urgent_geo_fail'); },
          { enableHighAccuracy: true, timeout: 10000 },
        );
      };
      f.onsubmit = async (e) => {
        e.preventDefault();
        if (!requireLogin(onAuthChanged)) return;
        if (!f.category?.value) { f.category?.classList.add('err'); return; }
        if (!geo && !f.region.value) { f.region.classList.add('err'); toast(t('urgent_need_loc'), 'err'); return; }
        const body = { category: f.category.value, hours, region: f.region.value || undefined, address: f.address.value.trim() || undefined, start: f.start.value.trim() || undefined, note: f.note.value.trim() || undefined, ...(geo || {}) };
        const r = await api('/urgent', { method: 'POST', body });
        go(`/urgent/${r.id}`);
      };
      f.addEventListener('change', (e) => e.target.classList?.remove('err'));
      // Menga kelgan chaqiruvlar (texnika egalari uchun)
      if (state.user) {
        const my = await api('/my/urgent', { silent: true }).catch(() => null);
        const rows = [...(my?.mine || []), ...(my?.incoming || [])];
        if (rows.length) {
          $('[data-my]', main).innerHTML = `<div class="box" style="margin-top:16px"><h3>${esc(t('urgent_history'))}</h3>${rows.map((x) => `<a class="lead" style="grid-template-columns:1fr auto" href="/urgent/${x.id}"><div><b>${esc(x.category?.name || '')} · ${esc(t('hours_n', { n: x.hours }))}</b><span>${esc(x.is_owner ? t('urgent_mine') : t('urgent_incoming'))} · ${esc(fmtRel(x.created_at))}</span></div><span class="tag ${STATUS[x.status]}">${esc(t(`urgent_st_${x.status}`))}</span></a>`).join('')}</div>`;
        }
      }
    },
  };
}

// ---------- Chaqiruv holati (mijoz va texnika egasi uchun) ----------
export async function urgentView({ params }) {
  if (!state.user) return { title: t('urgent_title'), html: `<div class="box empty"><h3>${esc(t('login_required'))}</h3><button class="btn btn-primary" data-login style="margin-top:14px">${esc(t('login'))}</button></div>` };
  const x = await api(`/urgent/${params[0]}`);
  const where = [x.address, x.region_name].filter(Boolean).join(', ');
  const map = x.geo ? `<a class="link-blue small" target="_blank" rel="noopener" href="https://yandex.uz/maps/?pt=${x.geo.lng},${x.geo.lat}&z=15&l=map">${icon('map')} ${esc(t('urgent_open_map'))}</a>` : '';
  const facts = `<div class="urgent-facts">
      <div><span>${esc(t('urgent_what'))}</span><b>${esc(x.category?.name || '')}</b></div>
      <div><span>${esc(t('urgent_hours'))}</span><b>${esc(t('hours_n', { n: x.hours }))}</b></div>
      ${x.start ? `<div><span>${esc(t('urgent_when'))}</span><b>${esc(x.start)}</b></div>` : ''}
      ${where ? `<div><span>${esc(t('urgent_where'))}</span><b>${esc(where)}</b></div>` : ''}
      ${x.target?.distance_km !== null && x.target?.distance_km !== undefined ? `<div><span>${esc(t('urgent_distance'))}</span><b>${num(x.target.distance_km)} km</b></div>` : ''}
      ${x.note ? `<div class="full"><span>${esc(t('description'))}</span><b>${esc(x.note)}</b></div>` : ''}
    </div>${map}`;
  let body;
  if (x.is_owner) {
    body = x.status === 'open'
      ? `<div class="urgent-wait"><span class="pulse"></span><div><b>${esc(t('urgent_waiting'))}</b><p class="small muted">${esc(t('urgent_notified', { n: x.notified }))}</p></div></div>
         <button class="btn btn-ghost btn-sm" data-cancel>${esc(t('cancel'))}</button>`
      : x.status === 'taken'
        ? `<div class="note">${icon('check')}<div><b>${esc(t('urgent_found', { name: x.taker?.name || '' }))}</b>${x.taker?.listing ? `<p><a class="link-blue" href="/listing/${x.taker.listing.id}">${esc(x.taker.listing.title)}</a></p>` : ''}</div></div>${tel(x.taker.phone)}`
        : `<p class="muted">${esc(t(`urgent_st_${x.status}`))}</p>${x.status === 'expired' ? `<a class="btn btn-soft" href="/urgent">${esc(t('urgent_again'))}</a>` : ''}`;
  } else {
    body = x.status === 'open'
      ? `<p class="small">${esc(t('urgent_first_wins'))}</p><button class="btn btn-primary btn-block urgent-go" data-accept>${icon('check')} ${esc(t('urgent_accept'))}</button>`
      : x.target?.won
        ? `<div class="note">${icon('check')}<div><b>${esc(t('urgent_you_won'))}</b><p>${esc(x.customer?.name || '')}</p></div></div>${tel(x.customer.phone)}`
        : `<p class="muted">${esc(t(x.status === 'taken' ? 'urgent_taken_other' : `urgent_st_${x.status}`))}</p>`;
  }
  const html = `
    ${crumbs([[t('home'), '/'], [t('urgent_title'), '/urgent'], [`№ ${x.id}`]])}
    <div class="urgent-hero"><span class="urgent-ico">${icon('bolt')}</span><div><h1 class="page-title">${esc(x.category?.name || t('urgent_title'))}</h1><p class="page-sub"><span class="tag ${STATUS[x.status]}">${esc(t(`urgent_st_${x.status}`))}</span> · ${esc(fmtRel(x.created_at))}</p></div></div>
    <div class="box">${facts}</div>
    <div class="box urgent-action">${body}</div>`;
  return {
    title: t('urgent_title'),
    html,
    mount(main) {
      $('[data-cancel]', main)?.addEventListener('click', async () => { await api(`/urgent/${x.id}/cancel`, { method: 'POST' }); go(`/urgent/${x.id}`, { replace: true }); });
      $('[data-accept]', main)?.addEventListener('click', async (e) => {
        e.target.disabled = true;
        try { await api(`/urgent/${x.id}/accept`, { method: 'POST' }); } catch { /* boshqasi oldi — sahifa yangilanadi */ }
        go(`/urgent/${x.id}`, { replace: true });
      });
      // Kutish vaqtida holat har 5 soniyada yangilanadi
      if (x.status === 'open') {
        const timer = setInterval(async () => {
          if (!document.body.contains(main)) { clearInterval(timer); return; }
          const y = await api(`/urgent/${x.id}`, { silent: true }).catch(() => null);
          if (y && y.status !== 'open') { clearInterval(timer); go(`/urgent/${x.id}`, { replace: true }); }
        }, 5000);
      }
    },
  };
}
