import { state, t, esc, api, icon, num, fmtRel, fmtDate, fmtTime, initials, toast, markErrors, ApiErr, setLang, setCurrency, $, $$ } from '../core.js';
import { crumbs, accountLayout, imgOf, priceText, regionsOf, shortCat } from '../ui.js';
import { go, render, onAuthChanged } from '../app.js';
import { legalSpec, legalBlock, bindLegal, readRequisites, checkRequisites, uploadDocs, markLegalErrors } from '../legal.js';

const needLogin = () => ({ title: t('login'), html: `<div class="box empty"><h3>${esc(t('login_required'))}</h3><button class="btn btn-primary" data-login style="margin-top:14px">${esc(t('login'))}</button></div>` });
const f2 = (label, inner, req) => `<div><label class="lbl">${esc(label)}${req ? ' *' : ''}</label>${inner}</div>`;
const inp = (name, v, attrs = '') => `<input class="input" name="${name}" value="${esc(v ?? '')}" ${attrs}>`;
const chip = (name, value, label, on = false) => `<label class="pick"><input type="checkbox" name="${name}" value="${esc(value)}" ${on ? 'checked' : ''}><span>${esc(label)}</span></label>`;
const ACTS = [['equipment_sale', 'excavator'], ['equipment_rent', 'calendar'], ['parts', 'gear'], ['repair', 'wrench'], ['logistics', 'truck'], ['materials', 'layers']];
const toggle = (name, on) => `<label class="toggle"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span></span></label>`;

// ---------- Profil ----------
export async function profile() {
  if (!state.user) return needLogin();
  const u = await api('/me');
  state.user = u;
  const [company, sessions, tg, tpls] = await Promise.all([u.company?.role === 'owner' ? api('/my/company', { silent: true }).catch(() => null) : null, api('/auth/sessions'), api('/me/telegram'), api('/me/templates')]);
  const isSpec = Boolean(u.specialist) || ['mechanic', 'driver'].includes(u.account_type);
  const [spec, opts] = isSpec ? await Promise.all([api('/me/specialist', { silent: true }).catch(() => null), api('/specialists/options')]) : [null, null];
  const kind = spec?.kind || (u.account_type === 'driver' ? 'driver' : 'mechanic');
  const specRegs = isSpec ? await regionsOf(spec?.location.country || u.country) : [];
  const [first, ...rest] = (u.name || '').split(' ');
  const last = rest.join(' ');
  const verTag = company ? (company.verified ? `<span class="tag green">${esc(t('company_verified_on', { d: fmtDate(company.verified_at) }))}</span>` : `<span class="tag ${company.verification === 'pending' ? 'orange' : company.verification === 'rejected' ? 'red' : 'grey'}">${esc(t(`ver_${company.verification}`))}</span>`) : '';
  const m = state.meta;
  const html = accountLayout('/profile', `
    ${crumbs([[t('home'), '/'], [t('dashboard'), '/dashboard'], [t('nav_profile')]])}
    <div class="page-head"><h1 class="page-title">${esc(t('nav_profile'))}</h1><p class="page-sub">${esc(t('profile_sub'))}</p></div>
    <div class="tabs"><a class="tab on" href="#p-main">${esc(t('tab_main'))}</a><a class="tab" href="#p-company">${esc(t('company'))}</a>${isSpec ? `<a class="tab" href="#p-specialist">${esc(t('specialist_profile'))}</a>` : ''}<a class="tab" href="#p-interests">${esc(t('interests'))}</a><a class="tab" href="#p-security">${esc(t('tab_security'))}</a><a class="tab" href="#p-notif">${esc(t('notifications'))}</a><a class="tab" href="#p-tools">${esc(t('tools'))}</a><a class="tab" href="/plans">${esc(t('plans_link'))}</a><a class="tab" href="/payments">${esc(t('payments_link'))}</a></div>

    <div class="box" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap" id="p-main">
      <span class="avatar" style="width:64px;height:64px;font-size:20px;font-weight:500">${u.avatar ? `<img src="${esc(u.avatar)}" alt="">` : esc(initials(u.name || u.phone))}</span>
      <div style="flex:1;min-width:200px"><b style="font-size:19px">${esc(u.name || u.phone)}</b>
        <p class="tiny muted" style="margin:4px 0 6px">${esc([u.position, t('on_platform', { y: (u.created_at || '').slice(0, 4) })].filter(Boolean).join(' · '))}</p>
        <span class="tag green">${esc(t('phone_verified'))}</span> <span class="tag">${esc(t(`type_${u.account_type}`))}</span></div>
      <label class="btn btn-soft" style="cursor:pointer">${esc(t('change_photo'))}<input type="file" accept="image/jpeg,image/png,image/webp" hidden data-avatar></label>
    </div>

    <form class="box" data-pf novalidate><h3>${esc(t('personal'))}</h3>
      <div class="form-grid">
        ${f2(t('first_name'), inp('first', first), true)}${f2(t('last_name'), inp('last', last))}
        ${f2(t('phone'), inp('phone', u.phone, 'disabled'), true)}${f2(t('email'), inp('email', u.email, 'type="email"'))}
        ${f2(t('city'), inp('city', u.city))}${f2(t('position'), inp('position', u.position))}
        ${f2(t('language'), `<select class="input" name="lang">${m.languages.map((l) => `<option value="${l.code}" ${l.code === u.lang ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select>`)}
        ${f2(t('currency'), `<select class="input" name="currency">${m.currencies.map((c) => `<option value="${c.code}" ${c.code === u.currency ? 'selected' : ''}>${c.code} — ${esc(c.name)}</option>`).join('')}</select>`)}
        ${f2(t('country'), `<select class="input" name="country">${m.countries.map((c) => `<option value="${c.code}" ${c.code === u.country ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`)}
      </div>
      <button class="btn btn-primary" style="margin-top:16px">${esc(t('save_changes'))}</button>
    </form>

    <form class="box" data-cf id="p-company" novalidate><h3>${esc(company ? t('company') : t('create_company'))}</h3>
      ${verTag ? `<div style="margin:-4px 0 12px">${verTag}</div>` : ''}
      ${company?.verification === 'rejected' && company.reject_reason ? `<div class="adm-warn">${icon('flag')} ${esc(t('reject_reason_lbl', { r: company.reject_reason }))}</div>` : ''}
      <div class="form-grid">
        ${f2(t('company_name'), inp('name', company?.name), true)}${f2(t('website'), inp('website', company?.website))}
        ${f2(t('country'), `<select class="input" name="country">${m.countries.map((c) => `<option value="${c.code}" ${c.code === (company?.country || u.country) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`)}
        ${f2(t('region'), `<select class="input" name="region"></select>`)}
        ${f2(t('city'), inp('city', company?.city))}${f2(t('address'), inp('address', company?.address))}
        ${f2(t('work_hours'), inp('work_hours', company?.work_hours))}${f2(t('phone'), inp('phone', company?.phone, 'type="tel"'))}
        ${f2(t('activity'), inp('activity', company?.activity))}
        <div class="full"><label class="lbl">${esc(t('what_do'))} *</label><div class="pick-grid" data-acts>${ACTS.map(([a, ic]) => `<label class="pick big"><input type="checkbox" name="activities" value="${a}" ${(company?.activities || []).includes(a) ? 'checked' : ''}><span>${icon(ic)} ${esc(t(`act_${a}`))}</span></label>`).join('')}</div></div>
        <div class="full">${f2(t('about_company'), `<textarea class="input" name="about" rows="3">${esc(company?.about || '')}</textarea>`)}</div>
      </div>
      <div data-legal-wrap style="margin-top:18px"></div>
      <p class="tiny muted" style="margin:12px 0">${esc(t('reverify_note'))}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-soft">${esc(company ? t('update_company') : t('create_company'))}</button>
        ${company ? `<a class="btn btn-ghost" href="/company/${company.id}">${esc(t('company_page'))}</a>` : ''}
      </div>
    </form>

    <div class="box" id="p-notif"><h3>${esc(t('notifications'))}</h3>
      <div data-notif>
        <div class="set-row">${esc(t('n_messages'))}${toggle('messages', u.notifications.messages)}</div>
        <div class="set-row">${esc(t('n_orders'))}${toggle('orders', u.notifications.orders)}</div>
        <div class="set-row">${esc(t('n_prices'))}${toggle('prices', u.notifications.prices)}</div>
        <div class="set-row">${esc(t('n_news'))}${toggle('news', u.notifications.news)}</div>
      </div>
      <div class="set-row" style="border-top:1px solid var(--line);margin-top:6px;padding-top:12px"><span>${icon('bell')} ${esc(t('push_browser'))}<br><span class="tiny muted" data-push-msg></span></span><label class="toggle"><input type="checkbox" data-push><span></span></label></div>
    </div>

    <div class="box" id="p-telegram"><h3>${icon('telegram')} ${esc(t('telegram'))}</h3>
      ${!tg.enabled ? `<p class="small muted">${esc(t('tg_not_configured'))}</p>`
        : tg.linked ? `<div class="set-row"><span>${esc(t('tg_connected', { u: tg.username ? `@${tg.username}` : 'Telegram' }))}</span>${toggle('tg_notify', tg.notify)}</div><button class="btn btn-ghost btn-sm" data-tg-off>${esc(t('tg_disconnect'))}</button>`
        : `<button class="btn btn-primary" data-tg-link>${icon('telegram')} ${esc(t('tg_connect'))}</button><p class="tiny muted" data-tg-hint hidden>${esc(t('tg_open_bot'))}</p>`}
    </div>
    <div class="box" id="p-tools"><h3>${esc(t('auto_reply'))}</h3>
      <div class="set-row"><span class="small muted">${esc(t('auto_reply_hint'))}</span>${toggle('auto_on', u.auto_reply_on)}</div>
      <textarea class="input" data-auto maxlength="1000" style="min-height:70px">${esc(u.auto_reply || '')}</textarea>
      <button class="btn btn-soft btn-sm" style="margin-top:8px" data-auto-save>${esc(t('save_changes'))}</button>
      <h3 style="margin-top:20px">${esc(t('templates'))}</h3>
      ${tpls.map((x) => `<div class="lead" style="grid-template-columns:1fr auto"><span style="color:var(--ink);font-size:12px">${esc(x.text)}</span><button class="btn btn-ghost btn-sm" data-tpl-del="${x.id}">${icon('trash')}</button></div>`).join('')}
      <div style="display:flex;gap:8px;margin-top:8px"><input class="input" data-tpl-new maxlength="1000" placeholder="${esc(t('add_template'))}"><button class="btn btn-soft" data-tpl-add>${icon('plus')}</button></div>
    </div>

    ${isSpec ? `<form class="box" id="p-specialist" data-sf novalidate><div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap"><h3 style="margin:0">${esc(t('specialist_profile'))}</h3>${spec ? `<a class="link-blue small" href="/specialist/${spec.id}">${esc(t('details'))} ${icon('arrow', 'arrow-flip')}</a>` : ''}</div>
      <div class="seg" data-kind style="margin:12px 0"><button type="button" data-v="mechanic" class="${kind === 'mechanic' ? 'on' : ''}">${esc(t('type_mechanic'))}</button><button type="button" data-v="driver" class="${kind === 'driver' ? 'on' : ''}">${esc(t('type_driver'))}</button></div>
      <div class="form-grid">
        <div class="full">${f2(t('headline'), inp('headline', spec?.headline, 'maxlength="120"'), true)}</div>
        <div class="full" data-skills></div>
        ${f2(t('experience'), inp('experience_years', spec?.experience_years, 'type="number" min="0" max="60"'))}${f2(t('brands_lbl'), inp('brands', (spec?.brands || []).join(', ')))}
        ${f2(t('region'), `<select class="input" name="region"><option value="">${esc(t('choose'))}</option>${specRegs.map((r) => `<option value="${r.code}" ${r.code === spec?.location.region ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>`)}${f2(t('city'), inp('city', spec?.location.city))}
        ${f2(t('rate_lbl'), inp('rate', spec?.rate, 'inputmode="numeric"'))}${f2('\u00a0', `<select class="input" name="rate_unit">${opts.rate_units.map((x) => `<option value="${x}" ${x === (spec?.rate_unit || 'hour') ? 'selected' : ''}>${esc(t(`ru_${x}`))}</option>`).join('')}</select>`)}
        <div class="full">${f2(t('description'), `<textarea class="input" name="about" maxlength="3000" style="min-height:80px">${esc(spec?.about || '')}</textarea>`)}</div>
      </div>
      <div class="set-row" style="margin-top:10px">${esc(t('mobile_lbl'))}${toggle('mobile', spec ? spec.mobile : true)}</div>
      <div class="set-row">${esc(t('available_lbl'))}${toggle('available', spec ? spec.available !== false : true)}</div>
      <div class="set-row">${esc(t('hide_profile'))}${toggle('hidden', spec?.status === 'hidden')}</div>
      <button class="btn btn-primary" style="margin-top:12px">${esc(t('save_changes'))}</button>
    </form>` : ''}

    <div class="box" id="p-interests"><h3>${esc(t('interests'))}</h3><p class="tiny muted" style="margin-top:-6px">${esc(t('interests_sub'))}</p>
      ${state.cats.map((cat) => `<div style="margin-bottom:10px"><b class="small">${esc(shortCat(cat))}</b><div class="pick-grid" style="margin-top:6px">${cat.children.map((x) => chip('interests', x.slug, x.name, u.interests.includes(x.slug))).join('')}</div></div>`).join('')}
      <button class="btn btn-soft" data-int-save>${esc(t('save_changes'))}</button>
    </div>

    <div class="box" id="p-security"><h3>${esc(t('security'))}</h3>
      <form data-pwf novalidate style="margin-bottom:16px"><b class="small">${esc(u.has_password ? t('change_password') : t('set_password'))}</b>
        <div class="form-grid" style="margin-top:8px">
          ${u.has_password ? f2(t('current_password'), '<input class="input" name="current_password" type="password" autocomplete="current-password">') : ''}
          ${f2(t('new_password'), '<input class="input" name="password" type="password" autocomplete="new-password" minlength="8">')}
        </div>
        <p class="tiny muted" style="margin:6px 0 8px">${esc(t('password_hint'))}</p>
        <button class="btn btn-soft btn-sm">${esc(t('set_password'))}</button>
      </form>
      <p class="tiny muted" style="margin-top:-6px">${esc(t('sms_login_note'))}</p>
      <b class="small">${esc(t('active_devices'))}</b>
      ${sessions.map((s) => `<div class="lead" style="grid-template-columns:1fr auto"><div><b>${esc((s.device || '—').slice(0, 70))}</b><span>${esc(s.ip || '')} · ${esc(fmtRel(s.last_used_at))}</span></div>${s.current ? `<span class="tag green">${esc(t('this_device'))}</span>` : `<button class="btn btn-ghost btn-sm" data-end="${s.id}">${esc(t('end_session'))}</button>`}</div>`).join('')}
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn btn-soft" data-end-others>${esc(t('end_others'))}</button></div>
      <a class="small muted" style="display:inline-block;margin-top:12px;cursor:pointer" data-logout>${esc(t('logout'))}</a>
    </div>`);

  return {
    title: t('nav_profile'),
    html,
    async mount(main) {
      const cf = $('[data-cf]', main);
      const fillRegions = async (sel) => {
        const regs = await regionsOf(cf.country.value);
        cf.region.innerHTML = `<option value="">${esc(t('choose'))}</option>${regs.map((r) => `<option value="${r.code}" ${r.code === sel ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}`;
      };
      await fillRegions(company?.region);
      // Tashkiliy-huquqiy shakl, rekvizitlar va hujjatlar — mamlakat bo'yicha
      const drawLegal = async () => {
        const spec = await legalSpec(cf.country.value);
        const same = cf.country.value === (company?.country || u.country);
        $('[data-legal-wrap]', cf).innerHTML = legalBlock(spec, { form: same ? company?.legal_form : null, values: same ? company || {} : {}, docs: company?.documents || [], showDocs: Boolean(company), canDelete: !company?.verified });
        bindLegal(cf, spec, { docs: company?.documents || [], showDocs: Boolean(company), canDelete: !company?.verified, onDocDelete: () => render({ keepScroll: true }) });
      };
      await drawLegal();
      cf.country.addEventListener('change', () => { fillRegions(''); drawLegal(); });

      $('[data-pf]', main).addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        try {
          const r = await api('/me', { method: 'PATCH', body: { name: [f.first.value.trim(), f.last.value.trim()].filter(Boolean).join(' '), email: f.email.value.trim(), city: f.city.value.trim(), position: f.position.value.trim(), lang: f.lang.value, currency: f.currency.value, country: f.country.value } });
          state.user = r;
          setLang(r.lang);
          setCurrency(r.currency);
          toast(t('saved'), 'ok');
          window.dispatchEvent(new Event('mx:auth'));
        } catch (err) { if (err instanceof ApiErr) markErrors(f, err.details?.name ? { first: 1 } : err.details); }
      });
      cf.addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = Object.fromEntries(['name', 'website', 'country', 'region', 'city', 'address', 'work_hours', 'activity', 'phone', 'about'].map((k) => [k, cf[k].value.trim()]));
        try {
          v.activities = $$('[name=activities]:checked', cf).map((x) => x.value);
          if (!v.activities.length) { $('[data-acts]', cf).classList.add('err'); toast(t('fill_required'), 'err'); return; }
          if (!checkRequisites(cf)) return;
          Object.assign(v, readRequisites(cf));
          await api('/my/company', { method: company ? 'PATCH' : 'POST', body: v });
          // Tanlangan hujjatlar (guvohnoma va h.k.) yuklanadi
          const sent = await uploadDocs(cf);
          toast(sent?.verification === 'pending' && company?.verification !== 'pending' ? t('docs_sent') : t('saved'), 'ok');
          window.dispatchEvent(new Event('mx:auth'));
          render({ keepScroll: true });
        } catch (err) { if (err instanceof ApiErr) { markErrors(cf, err.details); markLegalErrors(cf, err.details); } }
      });
      $('[data-avatar]', main).addEventListener('change', async (e) => {
        const fd = new FormData();
        fd.append('file', e.target.files[0]);
        state.user = await api('/me/avatar', { method: 'POST', form: fd });
        render({ keepScroll: true });
      });
      $('[data-tg-link]', main)?.addEventListener('click', async () => {
        const r = await api('/me/telegram/link', { method: 'POST' });
        if (r.url) window.open(r.url, '_blank');
        $('[data-tg-hint]', main).hidden = false;
      });
      $('[data-tg-off]', main)?.addEventListener('click', async () => { await api('/me/telegram', { method: 'DELETE' }); render({ keepScroll: true }); });
      $('[name=tg_notify]', main)?.addEventListener('change', (e) => api('/me/telegram', { method: 'PATCH', body: { notify: e.target.checked } }));
      const saveAuto = async () => { await api('/me', { method: 'PATCH', body: { auto_reply: $('[data-auto]', main).value.trim(), auto_reply_on: $('[name=auto_on]', main).checked } }); toast(t('saved'), 'ok'); };
      $('[data-auto-save]', main).addEventListener('click', saveAuto);
      $('[name=auto_on]', main).addEventListener('change', saveAuto);
      $('[data-tpl-add]', main).addEventListener('click', async () => {
        const v = $('[data-tpl-new]', main).value.trim();
        if (!v) return;
        await api('/me/templates', { method: 'POST', body: { text: v } });
        render({ keepScroll: true });
      });
      main.addEventListener('click', async (e) => {
        const d = e.target.closest('[data-tpl-del]');
        if (d) { await api(`/me/templates/${d.dataset.tplDel}`, { method: 'DELETE' }); render({ keepScroll: true }); }
      });
      const sf = $('[data-sf]', main);
      if (sf) {
        let k = kind;
        const drawSkills = () => {
          const list = k === 'mechanic' ? opts.mechanic_skills : opts.driver_skills;
          const have = spec?.kind === k ? spec.skills || [] : [];
          $('[data-skills]', sf).innerHTML = `<label class="lbl">${esc(t(k === 'mechanic' ? 'skills_mechanic' : 'skills_driver'))}</label><div class="pick-grid">${list.map((x) => chip('skills', x, t(`sk_${x}`), have.includes(x))).join('')}</div>
            ${k === 'driver' ? `<label class="lbl" style="margin-top:10px">${esc(t('license_cats'))}</label><div class="pick-grid">${opts.licenses.map((x) => chip('license', x, x === 'tractor' ? t('lic_tractor') : x === 'special' ? t('lic_special') : x, (spec?.license || []).includes(x))).join('')}</div>` : ''}`;
        };
        drawSkills();
        $('[data-kind]', sf).addEventListener('click', (e) => {
          const b = e.target.closest('[data-v]');
          if (!b) return;
          k = b.dataset.v;
          $$('[data-kind] [data-v]', sf).forEach((x) => x.classList.toggle('on', x === b));
          drawSkills();
        });
        sf.addEventListener('submit', async (e) => {
          e.preventDefault();
          const vals = (n) => $$(`[name=${n}]:checked`, sf).map((x) => x.value);
          try {
            await api('/me/specialist', { method: 'PUT', body: {
              kind: k, headline: sf.headline.value.trim(), skills: vals('skills'), license: vals('license'),
              experience_years: sf.experience_years.value || undefined, brands: sf.brands.value.split(',').map((x) => x.trim()).filter(Boolean),
              region: sf.region.value || undefined, city: sf.city.value.trim() || undefined, rate: sf.rate.value ? Number(sf.rate.value.replace(/\s/g, '')) : undefined,
              rate_unit: sf.rate_unit.value, about: sf.about.value.trim() || undefined, mobile: sf.mobile.checked, available: sf.available.checked, hidden: sf.hidden.checked,
            } });
            toast(t('saved'), 'ok');
            window.dispatchEvent(new Event('mx:auth'));
          } catch (err) { if (err instanceof ApiErr) markErrors(sf, err.details); }
        });
      }
      $('[data-int-save]', main).addEventListener('click', async () => {
        await api('/me/interests', { method: 'PUT', body: { categories: $$('[name=interests]:checked', main).map((x) => x.value) } });
        toast(t('saved'), 'ok');
      });
      $('[data-pwf]', main).addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        try {
          await api('/me/password', { method: 'PUT', body: { current_password: f.current_password?.value, password: f.password.value } });
          toast(t('password_changed'), 'ok');
          render({ keepScroll: true });
        } catch (err) { if (err instanceof ApiErr) markErrors(f, { password: 1, ...(err.details || {}) }); }
      });
      // Brauzer push-obunasi
      const pushBox = $('[data-push]', main);
      const pushMsg = $('[data-push-msg]', main);
      const pushOk = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      const b64 = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...raw].map((ch) => ch.charCodeAt(0))); };
      if (!pushOk) { pushBox.disabled = true; pushMsg.textContent = t('push_unsupported'); } else {
        navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()).then((s) => { pushBox.checked = Boolean(s) && Notification.permission === 'granted'; }).catch(() => {});
        if (Notification.permission === 'denied') pushMsg.textContent = t('push_denied');
        pushBox.addEventListener('change', async () => {
          try {
            const reg = await navigator.serviceWorker.ready;
            if (pushBox.checked) {
              const perm = await Notification.requestPermission();
              if (perm !== 'granted') { pushBox.checked = false; pushMsg.textContent = t('push_denied'); return; }
              const { public_key: key } = await api('/push/key');
              const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
              await api('/me/push', { method: 'POST', body: { subscription: sub.toJSON() } });
              pushMsg.textContent = '';
              toast(t('saved'), 'ok');
            } else {
              const sub = await reg.pushManager.getSubscription();
              if (sub) { await api('/me/push', { method: 'DELETE', body: { endpoint: sub.endpoint } }); await sub.unsubscribe(); }
            }
          } catch (err) { pushBox.checked = false; pushMsg.textContent = err.message || t('error'); }
        });
      }      $('[data-notif]', main).addEventListener('change', async (e) => {
        await api('/me', { method: 'PATCH', body: { notifications: { [e.target.name]: e.target.checked } } });
        toast(t('saved'), 'ok');
      });
      main.addEventListener('click', async (e) => {
        const end = e.target.closest('[data-end]');
        if (end) { await api(`/auth/sessions/${end.dataset.end}`, { method: 'DELETE' }); render({ keepScroll: true }); }
        if (e.target.closest('[data-end-others]')) { await api('/auth/sessions/revoke-others', { method: 'POST' }); toast(t('saved'), 'ok'); render({ keepScroll: true }); }
      });
    },
  };
}

// ---------- Sotuvchi kabineti ----------
export async function dashboard() {
  if (!state.user) return needLogin();
  const d = await api('/seller/dashboard');
  const s = d.stats;
  const max = Math.max(1, ...d.views_chart.map((x) => x.views));
  const pct = s.views.change_pct;
  const pctTxt = pct === null ? '' : `${pct > 0 ? '+' : ''}${pct}`;
  const name = (state.user.name || '').split(' ')[0];
  const html = accountLayout('/dashboard', `
    ${crumbs([[t('home'), '/'], [t('dashboard')]])}
    <div class="page-head"><h1 class="page-title">${esc(t('dashboard'))}</h1><p class="page-sub">${esc(t('dash_greeting', { name }))}</p></div>
    ${d.company ? `<div class="banner-navy"><div><h2>${esc(d.company.name)}</h2><p>${esc([d.company.activity, d.company.city].filter(Boolean).join(' · '))}</p>${d.company.verified ? `<span class="tag green">${esc(t('verified_seller'))}</span>` : `<span class="tag orange">${esc(t(`ver_${d.company.verification}`))}</span>`}</div>
      <a href="/create" class="btn btn-primary">${icon('plus')} ${esc(t('post_listing'))}</a></div>`
    : `<div class="banner-navy"><div><h2>${esc(state.user.name || state.user.phone)}</h2><p>${esc(t('no_company_dash'))}</p></div><a href="/profile#p-company" class="btn btn-white">${esc(t('create_company'))}</a></div>`}
    <div class="tool-row" style="margin:12px 0 0"><a class="btn btn-soft btn-sm" href="/analytics">${icon('chart')} ${esc(t('analytics'))}</a><a class="btn btn-soft btn-sm" href="/plans">${icon('rocket')} ${esc(t('plans_link'))}${state.user.plan?.plan === 'business' ? ' · PRO' : ''}</a><a class="btn btn-soft btn-sm" href="/my/import">${icon('upload')} ${esc(t('import'))}</a><a class="btn btn-soft btn-sm" href="/my/orders?tab=bookings">${icon('calendar')} ${esc(t('bookings_tab'))}</a></div>
    <div class="stats">
      <div class="stat"><span>${esc(t('active_listings'))}</span><b>${num(s.active_listings.value)}</b><small>${esc(t('per_month', { n: s.active_listings.delta_month }))}</small></div>
      <div class="stat"><span>${esc(t('views_lbl'))}</span><b>${num(s.views.value)}</b><small>${pct !== null ? `↑ ${esc(t('pct_week', { p: pctTxt }))}` : '&nbsp;'}</small></div>
      <div class="stat"><span>${esc(t('new_leads'))}</span><b>${num(s.new_leads.value)}</b><small>${esc(t('per_week', { n: s.new_leads.delta_week }))}</small></div>
      <div class="stat"><span>${esc(t('company_rating'))}</span><b>${String(s.rating.value || '—').replace('.', ',')}</b><small>${esc(t('reviews_short', { n: s.rating.reviews }))}</small></div>
    </div>
    <div class="dash-row">
      <div class="box" style="margin:0"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div><h3 style="margin-bottom:2px">${esc(t('views_week'))}</h3><span class="tiny muted">${esc(`${fmtDate(d.views_chart[0].day).replace(/\s?\d{4}.*$/, '')} — ${fmtDate(d.views_chart[6].day).replace(/\s?\d{4}.*$/, '')}`)}</span></div>${pct !== null ? `<span class="tag green">${esc(t('vs_prev', { p: pctTxt }))}</span>` : ''}</div>
        <div class="chart">${d.views_chart.map((x) => `<div class="col" title="${x.views}"><div class="bar" style="height:${Math.round((x.views / max) * 100)}%"></div><span>${esc(x.label)}</span></div>`).join('')}</div></div>
      <div class="green-card"><span style="color:var(--teal)">${icon('check')}</span>
        <h3>${esc(d.profile.completeness !== null ? t('profile_filled', { p: d.profile.completeness }) : t('no_company_dash'))}</h3>
        <p>${esc(t('profile_filled_sub'))}</p>
        <a href="/profile" class="btn btn-white btn-block">${esc(t('complete_profile'))}</a>
        ${d.profile.response_minutes ? `<p class="tiny" style="color:var(--teal);margin:12px 0 0">${esc(t('avg_reply', { m: d.profile.response_minutes }))}</p>` : ''}</div>
    </div>
    <div class="box" style="margin-top:14px"><div style="display:flex;justify-content:space-between;align-items:center"><h3>${esc(t('leads_orders'))}</h3><a class="link-blue small" href="/requests?mine=1">${esc(t('buyer_requests'))} ${icon('arrow', 'arrow-flip')}</a></div>
      ${d.inbox.length ? d.inbox.map((x) => `<div class="lead"><div><b>${esc(x.from)}</b><span>${esc([x.listing.title, x.preferred_at || x.message].filter(Boolean).join(' · '))}</span></div>
        <div class="amt">${esc(x.amount_formatted || '')}<br><span class="tag ${x.status === 'new' ? '' : 'grey'}">${esc(x.status_label)}</span></div>
        <a class="btn btn-soft btn-sm" href="${x.type === 'order' ? '/my/orders?tab=sales' : '/messages'}">${esc(t('reply'))}</a></div>`).join('') : `<div class="empty">${esc(t('empty'))}</div>`}</div>
    <div class="box"><h3>${esc(t('your_listings'))}</h3>
      ${d.listings.length ? d.listings.map((l) => `<div class="lead" style="grid-template-columns:96px 1fr auto"><a href="/listing/${l.id}" class="thumb" style="width:96px;height:62px;border-radius:8px;overflow:hidden;display:block"><img src="${esc(imgOf(l))}" alt="" style="width:100%;height:100%;object-fit:cover"></a>
        <div><b>${esc(l.title)}</b><b style="font-size:13px">${esc(priceText(l.price))}</b><span>${esc([l.status_label, l.location.city, t('views', { n: num(l.views) }), t('chats', { n: l.conversations })].filter(Boolean).join(' · '))}</span></div>
        <a class="btn btn-soft btn-sm" href="/create/${l.id}">${esc(t('manage'))}</a></div>`).join('') : `<div class="empty">${esc(t('empty'))}</div>`}
      <a class="btn btn-soft btn-sm" style="margin-top:12px" href="/my/listings">${esc(t('all_my_listings'))} ${icon('arrow', 'arrow-flip')}</a></div>
    <div class="box"><h3>${esc(t('recent_events'))}</h3>
      <ul class="events">${d.events.length ? d.events.map((e) => `<li><span>${esc(fmtRel(e.created_at).replace(/^.*,\s/, ''))}</span>${esc(e.text)}</li>`).join('') : `<li><span></span>${esc(t('empty'))}</li>`}</ul></div>`);
  return { title: t('dashboard'), html };
}

export { go, onAuthChanged, fmtTime, $$ };
