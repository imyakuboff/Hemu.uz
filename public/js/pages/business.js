import { state, t, esc, api, icon, num, qs, fmtRel, initials, openModal, closeModal, toast, confirmBox, $ } from '../core.js';
import { crumbs, cards, pager, accountLayout, emptyBox, regionsOf } from '../ui.js';
import { render } from '../app.js';
import { mapWidget } from '../features.js';

const needLogin = () => ({ title: t('login'), html: `<div class="box empty"><h3>${esc(t('login_required'))}</h3><button class="btn btn-primary" data-login style="margin-top:14px">${esc(t('login'))}</button></div>` });
const refresh = () => render({ keepScroll: true });
const ROLE = (r) => t(`role_${r}`);

// ---------- Biznes kabinet ----------
export async function business() {
  if (!state.user) return needLogin();
  const c = state.user.company;
  if (!c) {
    return { title: t('business'), html: accountLayout('/business', `${crumbs([[t('home'), '/'], [t('business')]])}<div class="box empty"><h3>${esc(t('no_company_dash'))}</h3><a class="btn btn-primary" href="/profile#p-company" style="margin-top:14px">${esc(t('create_company'))}</a></div>`) };
  }
  const isOwner = c.role === 'owner';
  const [branches, members, follows] = await Promise.all([
    api('/business/branches'),
    isOwner || c.role === 'manager' ? api('/business/members') : null,
    api('/my/follows'),
  ]);
  const store = await api(`/companies/${c.id}?per_page=1`);
  const html = accountLayout('/business', `
    ${crumbs([[t('home'), '/'], [t('dashboard'), '/dashboard'], [t('business')]])}
    <div class="page-head" style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-end">
      <div><h1 class="page-title">${esc(t('business'))}</h1><p class="page-sub">${esc(c.name)} · ${esc(ROLE(c.role))}</p></div>
      <a class="btn btn-primary" href="/company/${c.id}">${icon('building')} ${esc(t('store'))}</a></div>
    <div class="stats" style="margin:0 0 14px">
      <div class="stat"><span>${esc(t('active_listings'))}</span><b>${num(store.active_listings)}</b></div>
      <div class="stat"><span>${esc(t('branches'))}</span><b>${num(branches.length)}</b></div>
      <div class="stat"><span>${esc(t('employees'))}</span><b>${num(store.members)}</b></div>
      <div class="stat"><span>${esc(t('followers_lbl'))}</span><b>${num(store.followers)}</b></div>
    </div>
    <div class="box" id="branches"><div style="display:flex;justify-content:space-between;align-items:center"><h3>${icon('pin')} ${esc(t('branches'))}</h3>${isOwner || c.role === 'manager' ? `<button class="btn btn-soft btn-sm" data-add-branch>${icon('plus')} ${esc(t('add_branch'))}</button>` : ''}</div>
      ${branches.length ? `<div class="map-box" data-bmap style="height:220px;margin:0 0 12px"></div>` + branches.map((b) => `<div class="lead" style="grid-template-columns:1fr auto"><div><b>${esc(b.name)}</b><span>${esc([b.region_name, b.city, b.address].filter(Boolean).join(', '))}${b.phone ? ` · ${esc(b.phone)}` : ''}${b.work_hours ? ` · ${esc(b.work_hours)}` : ''}</span></div>${isOwner || c.role === 'manager' ? `<button class="btn btn-ghost btn-sm" data-del-branch="${b.id}">${icon('trash')}</button>` : ''}</div>`).join('') : `<div class="empty">${esc(t('empty'))}</div>`}
    </div>
    ${members ? `<div class="box" id="employees"><div style="display:flex;justify-content:space-between;align-items:center"><h3>${icon('user')} ${esc(t('employees'))}</h3>${isOwner ? `<button class="btn btn-soft btn-sm" data-add-member>${icon('plus')} ${esc(t('add_employee'))}</button>` : ''}</div>
      <p class="tiny muted" style="margin-top:-6px">${esc(t('members_hint'))}</p>
      <div class="lead" style="grid-template-columns:1fr auto"><div><b>${esc(members.owner.name || '')}</b><span>${esc(members.owner.phone)}</span></div><span class="tag green">${esc(ROLE('owner'))}</span></div>
      ${members.items.map((m) => `<div class="lead" style="grid-template-columns:1fr auto auto;gap:10px"><div><b>${esc(m.name || m.phone)}</b><span>${esc(m.phone)} · ${esc(m.joined ? t('joined') : t('invited'))}${m.listings ? ` · ${esc(t('listings_count', { n: m.listings }))}` : ''}</span></div>
        ${isOwner ? `<select class="input" data-role="${m.id}" style="height:32px;width:auto">${['manager', 'sales', 'viewer'].map((r) => `<option value="${r}" ${m.role === r ? 'selected' : ''}>${esc(ROLE(r))}</option>`).join('')}</select><button class="btn btn-ghost btn-sm" data-del-member="${m.id}">${icon('trash')}</button>` : `<span class="tag">${esc(ROLE(m.role))}</span>`}</div>`).join('')}
    </div>` : ''}
    <div class="box"><h3>${icon('heart')} ${esc(t('my_follows'))}</h3>
      ${follows.length ? follows.map((f) => `<a class="lead" style="grid-template-columns:1fr auto" href="/company/${f.id}"><div><b>${esc(f.name)}</b><span>${esc([f.city, t('listings_count', { n: f.listings })].filter(Boolean).join(' · '))}</span></div>${f.verified ? `<span class="tag green">${esc(t('company_verified'))}</span>` : ''}</a>`).join('') : `<div class="empty">${esc(t('empty'))}</div>`}
    </div>`);
  return {
    title: t('business'),
    html,
    mount(main) {
      const bm = $('[data-bmap]', main);
      const pts = branches.filter((b) => b.lat).map((b) => ({ lat: b.lat, lng: b.lng, html: esc(b.name) }));
      if (bm && pts.length) mapWidget(bm, { markers: pts }).catch(() => bm.remove()); else bm?.remove();
      main.addEventListener('click', async (e) => {
        if (e.target.closest('[data-add-branch]')) return branchModal(c);
        if (e.target.closest('[data-add-member]')) return memberModal();
        const db = e.target.closest('[data-del-branch]');
        if (db && await confirmBox(t('delete'))) { await api(`/business/branches/${db.dataset.delBranch}`, { method: 'DELETE' }); return refresh(); }
        const dm = e.target.closest('[data-del-member]');
        if (dm && await confirmBox(t('delete'))) { await api(`/business/members/${dm.dataset.delMember}`, { method: 'DELETE' }); refresh(); }
      });
      main.addEventListener('change', async (e) => {
        const r = e.target.closest('[data-role]');
        if (r) { await api(`/business/members/${r.dataset.role}`, { method: 'PATCH', body: { role: r.value } }); toast(t('saved'), 'ok'); }
      });
    },
  };
}

async function branchModal(c) {
  const regs = await regionsOf(state.user.country);
  const m = openModal(`<h3>${esc(t('add_branch'))}</h3>
    <form class="form-grid" style="margin-top:12px">
      <div class="full"><label class="lbl">${esc(t('company_name'))} *</label><input class="input" name="name" required></div>
      <div><label class="lbl">${esc(t('region'))}</label><select class="input" name="region"><option value="">—</option>${regs.map((r) => `<option value="${r.code}">${esc(r.name)}</option>`).join('')}</select></div>
      <div><label class="lbl">${esc(t('city'))}</label><input class="input" name="city"></div>
      <div class="full"><label class="lbl">${esc(t('address'))}</label><input class="input" name="address"></div>
      <div><label class="lbl">${esc(t('phone'))}</label><input class="input" name="phone" type="tel"></div>
      <div><label class="lbl">${esc(t('work_hours'))}</label><input class="input" name="work_hours"></div>
      <div class="full"><label class="lbl">${esc(t('set_on_map'))}</label><div class="map-box" data-pick style="height:200px;margin:0"></div><input type="hidden" name="lat"><input type="hidden" name="lng"></div>
      <div class="full"><button class="btn btn-primary btn-block">${esc(t('add'))}</button></div>
    </form>`, { wide: true });
  const f = m.querySelector('form');
  mapWidget(m.querySelector('[data-pick]'), { zoom: 6, onClick: (p) => { f.lat.value = p.lat; f.lng.value = p.lng; } }).catch(() => {});
  f.onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(['name', 'region', 'city', 'address', 'phone', 'work_hours', 'lat', 'lng'].map((k) => [k, f[k].value.trim() || undefined]));
    await api('/business/branches', { method: 'POST', body });
    closeModal();
    refresh();
  };
}

function memberModal() {
  const m = openModal(`<h3>${esc(t('add_employee'))}</h3><p class="small muted">${esc(t('members_hint'))}</p>
    <form class="form-grid">
      <div><label class="lbl">${esc(t('phone'))} *</label><input class="input" name="phone" type="tel" required></div>
      <div><label class="lbl">${esc(t('name'))}</label><input class="input" name="name"></div>
      <div class="full"><label class="lbl">${esc(t('position'))}</label><select class="input" name="role">${['manager', 'sales', 'viewer'].map((r) => `<option value="${r}" ${r === 'sales' ? 'selected' : ''}>${esc(ROLE(r))}</option>`).join('')}</select></div>
      <div class="full"><button class="btn btn-primary btn-block">${esc(t('add'))}</button></div>
    </form>`);
  m.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    await api('/business/members', { method: 'POST', body: { phone: f.phone.value.trim(), name: f.name.value.trim() || undefined, role: f.role.value } });
    closeModal();
    refresh();
  };
}

// ---------- Kompaniya do'koni ----------
export async function store({ params, query }) {
  const c = await api(`/companies/${params[0]}${qs({ page: query.page, category: query.cat, q: query.q })}`);
  const path = `/company/${c.id}`;
  const html = `
    ${crumbs([[t('home'), '/'], [t('store')], [c.name]])}
    <div class="banner-navy" style="align-items:flex-start">
      <div style="display:flex;gap:16px;align-items:center">
        <span class="avatar" style="width:64px;height:64px;font-size:20px;background:#fff;color:var(--navy)">${c.logo ? `<img src="${esc(c.logo)}" alt="">` : esc(initials(c.name))}</span>
        <div><h2>${esc(c.name)}</h2><p>${esc([c.activity, c.city || c.region_name, c.country_name].filter(Boolean).join(' · '))}</p>
          <div style="display:flex;gap:6px;flex-wrap:wrap">${c.verified ? `<span class="tag green">${esc(t('verified_seller'))}</span>` : ''}${c.activities.map((a) => `<span class="tag">${esc(t(`act_${a}`))}</span>`).join('')}</div></div>
      </div>
      <div style="text-align:end">
        ${c.reviews_count ? `<div style="font-size:24px;font-weight:700">★ ${String(c.rating).replace('.', ',')}</div><p style="margin:0 0 8px">${esc(t('reviews', { n: c.reviews_count }))}</p>` : ''}
        <button class="btn ${c.following ? 'btn-soft' : 'btn-white'}" data-follow>${icon('heart')} <span>${esc(c.following ? t('following') : t('follow'))}</span></button>
        <p class="tiny" style="margin:8px 0 0" data-followers>${esc(t('followers_n', { n: num(c.followers) }))}</p>
      </div>
    </div>
    <div class="layout-side">
      <aside>
        <div class="box" style="margin:0"><h3>${esc(t('by_rubric'))}</h3>
          <a class="lead" style="grid-template-columns:1fr auto;padding:8px 0" href="${path}"><b style="${!query.cat ? 'color:var(--blue)' : ''}">${esc(t('all'))}</b><span>${num(c.active_listings)}</span></a>
          ${c.sections.map((s) => `<a class="lead" style="grid-template-columns:1fr auto;padding:8px 0" href="${path}${qs({ cat: s.slug })}"><span style="color:${query.cat === s.slug ? 'var(--blue)' : 'var(--ink)'};font-size:12px">${esc(s.name)}</span><span>${num(s.count)}</span></a>`).join('')}
        </div>
        ${c.branches.length ? `<div class="box"><h3>${esc(t('branches'))}</h3>${c.branches.map((b) => `<div class="small" style="padding:6px 0;border-bottom:1px solid var(--line)"><b>${esc(b.name)}</b><br><span class="muted">${esc([b.city, b.address].filter(Boolean).join(', '))}${b.work_hours ? ` · ${esc(b.work_hours)}` : ''}</span></div>`).join('')}</div>` : ''}
        <div class="box"><h3>${esc(t('about_company'))}</h3><div class="prose small">${esc(c.about || '—')}</div>
          <p class="tiny muted" style="margin:10px 0 0">${esc(t('on_since', { y: c.since }))}${c.work_hours ? ` · ${esc(c.work_hours)}` : ''}${c.response_minutes ? ` · ${esc(t('replies_in', { m: c.response_minutes }))}` : ''}</p></div>
      </aside>
      <div>
        <form class="search" data-ss style="margin-bottom:14px">${icon('search')}<input name="q" value="${esc(query.q || '')}" placeholder="${esc(t('store_search'))}"><button class="btn btn-primary">${esc(t('find'))}</button></form>
        <div class="results-head"><h2>${esc(t('company_listings'))} · ${num(c.listings.total)}</h2></div>
        ${c.listings.items.length ? cards(c.listings.items, 3) : emptyBox(t('nothing_found'))}
        ${pager(c.listings.page, c.listings.pages, (p) => `${path}${qs({ ...query, page: p })}`)}
        <div class="box" style="margin-top:16px"><h3>${esc(t('reviews_title'))}</h3>${c.reviews.length ? c.reviews.map((r) => `<div class="lead" style="grid-template-columns:1fr"><div><b>${'★'.repeat(r.rating)} · ${esc(r.author || '')}</b><span>${esc(r.text || '')} · ${esc(fmtRel(r.created_at))}</span></div></div>`).join('') : `<div class="empty">${esc(t('empty'))}</div>`}</div>
      </div>
    </div>`;
  return {
    title: c.name,
    html,
    mount(main) {
      $('[data-ss]', main).onsubmit = (e) => { e.preventDefault(); history.pushState(null, '', `${path}${qs({ q: e.target.q.value.trim() || undefined })}`); render({ keepScroll: true }); };
      $('[data-follow]', main).onclick = async (e) => {
        if (!state.user) { document.querySelector('[data-login]')?.click(); return; }
        const btn = e.currentTarget;
        const on = btn.classList.contains('btn-soft');
        const r = await api(`/companies/${c.id}/follow`, { method: on ? 'DELETE' : 'PUT' });
        btn.classList.toggle('btn-soft', r.following);
        btn.classList.toggle('btn-white', !r.following);
        btn.querySelector('span').textContent = t(r.following ? 'following' : 'follow');
        $('[data-followers]', main).textContent = t('followers_n', { n: num(r.followers) });
      };
    },
  };
}
