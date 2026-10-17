import { state, t, esc, api, icon, toast, setToken, markErrors, ApiErr, $, $$ } from '../core.js';
import { crumbs, phoneField, readPhone, regionsOf, shortCat } from '../ui.js';
import { go } from '../app.js';
import { legalSpec, legalBlock, bindLegal, readRequisites, checkRequisites, uploadDocs, markLegalErrors } from '../legal.js';

const TYPES = [
  ['client', 'user', 'type_client', 'type_client_sub'],
  ['company', 'building', 'type_company', 'type_company_sub'],
  ['mechanic', 'wrench', 'type_mechanic', 'type_mechanic_sub'],
  ['driver', 'truck', 'type_driver', 'type_driver_sub'],
];
const ACTIVITIES = [['equipment_sale', 'excavator'], ['equipment_rent', 'calendar'], ['parts', 'gear'], ['repair', 'wrench'], ['logistics', 'truck'], ['materials', 'layers']];

const stepper = (n) => `<div class="steps">${[t('step_phone'), t('step_code'), t('step_who'), t('step_details')].map((s, i) => `<span class="${i + 1 < n ? 'done' : i + 1 === n ? 'on' : ''}"><b>${i + 1 < n ? '✓' : i + 1}</b>${esc(s)}</span>`).join('')}</div>`;
const chip = (name, value, label, on = false) => `<label class="pick"><input type="checkbox" name="${name}" value="${esc(value)}" ${on ? 'checked' : ''}><span>${esc(label)}</span></label>`;
const regionOptions = (regs, sel = '') => `<option value="">${esc(t('choose'))}</option>${regs.map((r) => `<option value="${r.code}" ${r.code === sel ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}`;

// ---------- Ro'yxatdan o'tish ----------
export async function register({ query }) {
  if (state.user) return { redirect: '/dashboard' };
  const opts = await api('/specialists/options');
  const html = `
  ${crumbs([[t('home'), '/'], [t('register')]])}
  <div class="auth-card">
    <h1 class="page-title" style="font-size:26px">${esc(t('reg_title'))}</h1>
    <p class="page-sub" style="margin-bottom:18px">${esc(t('reg_sub'))}</p>
    <div data-steps>${stepper(1)}</div>

    <form data-s1 class="auth-step">
      <label class="lbl">${esc(t('phone'))}</label>${phoneField()}
      <div style="margin-top:14px"><label class="lbl">${esc(t('via_email'))} *</label><input class="input" name="email" type="email" inputmode="email" autocomplete="email" maxlength="120" placeholder="name@gmail.com" required><div class="hint">${icon('mail')} ${esc(t('email_code_hint'))}</div></div>
      <button class="btn btn-primary btn-block" style="margin-top:16px">${esc(t('get_code'))}</button>
    </form>

    <form data-s2 class="auth-step" hidden>
      <p class="small" data-sent></p>
      <label class="lbl">${esc(t('code'))}</label><input class="input" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required>
      <p class="tiny muted" data-dev></p>
      <button class="btn btn-primary btn-block" style="margin-top:12px">${esc(t('apply'))}</button>
      <button type="button" class="btn btn-ghost btn-block" data-back1>${esc(t('change_number'))}</button>
    </form>

    <div data-s3 class="auth-step" hidden>
      <h3 style="font-size:18px;margin-bottom:12px">${esc(t('who_title'))}</h3>
      <div class="who-grid">${TYPES.map(([v, ic, l, s]) => `<button type="button" class="who" data-type="${v}"><span class="ico-box">${icon(ic)}</span><b>${esc(t(l))}</b><span>${esc(t(s))}</span></button>`).join('')}</div>
    </div>

    <form data-s4 class="auth-step" hidden novalidate>
      <div data-typeform></div>
      <div class="form-grid" style="margin-top:16px">
        <div><label class="lbl">${esc(t('your_name'))} *</label><input class="input" name="name" required maxlength="80" autocomplete="name"></div>
        <div><label class="lbl">${esc(t('email'))}</label><input class="input" name="email" type="email" autocomplete="email"></div>
        <div class="full"><label class="lbl">${esc(t('password'))} *</label><input class="input" name="password" type="password" autocomplete="new-password" minlength="8" required><div class="hint">${esc(t('password_hint'))}</div></div>
      </div>
      <label class="check" style="margin-top:14px"><input type="checkbox" name="agree"> ${esc(t('agree_personal'))}</label>
      <div style="display:flex;gap:8px;margin-top:14px"><button type="button" class="btn btn-soft" data-back3>${icon('arrow-left', 'arrow-flip')} ${esc(t('back'))}</button><button class="btn btn-primary" style="flex:1">${esc(t('finish_reg'))}</button></div>
    </form>

    <p class="small muted" style="margin:18px 0 0;text-align:center">${esc(t('have_account_q'))} <a class="link-blue" href="#" data-login>${esc(t('login'))}</a></p>
  </div>`;

  return {
    title: t('register'),
    html,
    async mount(main) {
      const s = { 1: $('[data-s1]', main), 2: $('[data-s2]', main), 3: $('[data-s3]', main), 4: $('[data-s4]', main) };
      const show = (n) => { Object.entries(s).forEach(([k, el]) => { el.hidden = Number(k) !== n; }); $('[data-steps]', main).innerHTML = stepper(n); };
      let phone; let country; let ticket; let type; let email;
      if (query.phone) s[1].phone.value = query.phone;
      s[1].email.addEventListener('input', () => s[1].email.classList.remove('err'));

      s[1].onsubmit = async (e) => {
        e.preventDefault();
        ({ phone, country } = readPhone(s[1]));
        // Gmail majburiy: tasdiqlash kodi shu manzilga keladi
        email = s[1].email.value.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { markErrors(s[1], { email: 1 }); s[1].email.focus(); return; }
        try {
          const r = await api('/auth/register/start', { method: 'POST', body: { phone, country, email } });
          phone = r.phone; country = r.country; email = r.email;
          s[2].querySelector('[data-sent]').textContent = r.channel === 'email' ? t('code_sent_email', { e: r.email }) : t('code_sent', { p: r.phone });
          if (r.dev_code) { s[2].querySelector('[data-dev]').textContent = t('dev_code', { c: r.dev_code }); s[2].code.value = r.dev_code; }
          show(2);
          s[2].code.focus();
        } catch (err) {
          if (err.code === 'already_registered') document.querySelector('[data-login]')?.click();
          else if (err.details?.email) markErrors(s[1], { email: 1 });
        }
      };
      $('[data-back1]', main).onclick = () => show(1);
      s[2].onsubmit = async (e) => {
        e.preventDefault();
        const r = await api('/auth/register/verify', { method: 'POST', body: { phone, country, email, code: s[2].code.value.trim() } });
        ticket = r.ticket;
        // Tasdiqlangan email oxirgi qadamda qayta so'ralmaydi
        if (r.email) { s[4].email.value = r.email; s[4].email.readOnly = true; }
        show(3);
      };
      $('[data-back3]', main).onclick = () => show(3);

      const typeForm = async (tp) => {
        const regs = await regionsOf(country);
        if (tp === 'company') {
          const spec = await legalSpec(country);
          const forms = spec.forms.filter((x) => x.main);
          const cert = forms[0]?.docs.find((d) => d.type === 'reg_cert');
          return `<div class="legal" data-legal>
            <label class="lbl">${esc(t('legal_form'))} *</label>
            <div class="legal-forms">${forms.map((x, i) => `<label class="pick big ${x.individual ? 'ind' : ''}"><input type="radio" name="legal_form" value="${x.code}" ${i === 0 ? 'checked' : ''}><span>${icon(x.individual ? 'user' : 'building')} ${esc(x.name)}</span></label>`).join('')}</div>
            <div class="form-grid" style="margin-top:14px">
              <div class="full"><label class="lbl">${esc(t('company_name'))} *</label><input class="input" name="c_name" required maxlength="120"></div>
              <div><label class="lbl">${esc(t('first_name'))} *</label><input class="input" name="c_first" required maxlength="40" autocomplete="given-name"></div>
              <div><label class="lbl">${esc(t('last_name'))} *</label><input class="input" name="c_last" required maxlength="40" autocomplete="family-name"></div>
              <div class="full"><label class="lbl">${esc(t('address'))} *</label><input class="input" name="c_address" required maxlength="200" autocomplete="street-address"></div>
            </div>
            <div class="doc-row" data-doc-type="reg_cert" data-required style="margin-top:14px">
              <div class="doc-ico">${icon('file')}</div>
              <div class="doc-info"><b>${esc(cert?.name || '')} <span class="tag red">${esc(t('required_mark'))}</span></b><span class="doc-picked" data-picked></span></div>
              <label class="btn btn-soft btn-sm">${icon('upload')} ${esc(t('doc_upload'))}<input type="file" name="doc_reg_cert" accept="application/pdf,image/jpeg,image/png" multiple hidden></label>
            </div>
          </div>`;
        }
        if (tp === 'mechanic' || tp === 'driver') {
          const skills = tp === 'mechanic' ? opts.mechanic_skills : opts.driver_skills;
          const units = opts.rate_units.map((u) => `<option value="${u}" ${u === (tp === 'driver' ? 'shift' : 'hour') ? 'selected' : ''}>${esc(t(`ru_${u}`))}</option>`).join('');
          return `<div class="form-grid">
              <div class="full"><label class="lbl">${esc(t('headline'))} *</label><input class="input" name="headline" required maxlength="120" placeholder="${esc(tp === 'mechanic' ? 'Механик по гидравлике JCB, CAT' : 'Машинист экскаватора-погрузчика')}"></div>
              <div class="full"><label class="lbl">${esc(t(tp === 'mechanic' ? 'skills_mechanic' : 'skills_driver'))}</label><div class="pick-grid">${skills.map((k) => chip('skills', k, t(`sk_${k}`))).join('')}</div></div>
              ${tp === 'driver' ? `<div class="full"><label class="lbl">${esc(t('license_cats'))}</label><div class="pick-grid">${opts.licenses.map((k) => chip('license', k, k === 'tractor' ? t('lic_tractor') : k === 'special' ? t('lic_special') : k)).join('')}</div></div>` : ''}
              <div><label class="lbl">${esc(t('experience'))}</label><input class="input" name="experience_years" type="number" min="0" max="60"></div>
              <div><label class="lbl">${esc(t('brands_lbl'))}</label><input class="input" name="brands" placeholder="JCB, CAT, Komatsu"></div>
              <div><label class="lbl">${esc(t('region'))}</label><select class="input" name="region">${regionOptions(regs)}</select></div>
              <div><label class="lbl">${esc(t('city'))}</label><input class="input" name="city" maxlength="80"></div>
              <div><label class="lbl">${esc(t('rate_lbl'))}</label><input class="input" name="rate" inputmode="numeric"></div>
              <div><label class="lbl">&nbsp;</label><select class="input" name="rate_unit">${units}</select></div>
              <div class="full"><label class="lbl">${esc(t('description'))}</label><textarea class="input" name="about" maxlength="3000" style="min-height:80px"></textarea></div>
            </div>
            ${tp === 'mechanic' ? `<label class="check" style="margin-top:10px"><input type="checkbox" name="mobile" checked> ${esc(t('mobile_lbl'))}</label>` : ''}`;
        }
        // Mijoz: qiziqishlar
        return `<h3 style="font-size:17px;margin-bottom:4px">${esc(t('choose_interests'))}</h3><p class="small muted" style="margin:0 0 12px">${esc(t('interests_sub'))}</p>
          ${state.cats.map((c) => `<div style="margin-bottom:10px"><b class="small">${esc(shortCat(c))}</b><div class="pick-grid" style="margin-top:6px">${c.children.slice(0, 8).map((x) => chip('interests', x.slug, x.name)).join('')}</div></div>`).join('')}`;
      };

      s[3].addEventListener('click', async (e) => {
        const b = e.target.closest('[data-type]');
        if (!b) return;
        type = b.dataset.type;
        $('[data-typeform]', main).innerHTML = await typeForm(type);
        if (type === 'company') bindLegal(main, await legalSpec(country), { canDelete: false });
        for (const n of ['name', 'email']) {
          const el = s[4][n];
          el.closest('div').hidden = type === 'company';
          if (n === 'name') el.required = type !== 'company';
        }
        show(4);
      });

      s[4].addEventListener('input', (e) => e.target.classList.remove('err'));
      s[4].onsubmit = async (e) => {
        e.preventDefault();
        const f = s[4];
        if (!f.agree.checked) { f.agree.parentElement.style.color = 'var(--red)'; return; }
        const vals = (n) => $$(`[name="${n}"]:checked`, f).map((x) => x.value);
        const body = { ticket, account_type: type, name: f.name.value.trim(), email: f.email.value.trim() || undefined, password: f.password.value, lang: state.lang };
        if (type === 'company') {
          body.name = `${f.c_first.value.trim()} ${f.c_last.value.trim()}`.trim();
          body.email = undefined;
          body.company = { name: f.c_name.value.trim(), address: f.c_address.value.trim(), ...readRequisites(f) };
          if (!checkRequisites(f, { needDocs: true })) return;
        }
        if (type === 'mechanic' || type === 'driver') {
          body.specialist = {
            headline: f.headline.value.trim(), skills: vals('skills'), license: vals('license'),
            experience_years: f.experience_years.value || undefined, brands: f.brands.value.split(',').map((x) => x.trim()).filter(Boolean),
            region: f.region.value || undefined, city: f.city.value.trim() || undefined, rate: f.rate.value.replace(/\s/g, '') || undefined,
            rate_unit: f.rate_unit.value, about: f.about.value.trim() || undefined, mobile: f.mobile ? f.mobile.checked : false,
          };
        }
        if (type === 'client') body.interests = vals('interests');
        try {
          const r = await api('/auth/register', { method: 'POST', body });
          setToken(r.token);
          state.user = r.user;
          // Guvohnoma va boshqa hujjatlar — kompaniya yaratilgach yuklanadi va tekshiruvga ketadi
          if (type === 'company') { try { if (await uploadDocs(f)) toast(t('docs_sent'), 'ok'); } catch { /* profilda qayta yuklash mumkin */ } }
          toast(r.welcome_bonus ? t('welcome_bonus', { sum: `${Number(r.welcome_bonus.amount).toLocaleString('ru-RU')} ${r.welcome_bonus.currency === 'UZS' ? "so'm" : r.welcome_bonus.currency}` }) : t('welcome'), 'ok');
          window.dispatchEvent(new Event('mx:auth'));
          go(type === 'company' ? '/profile#p-company' : r.user.specialist ? `/specialist/${r.user.specialist.id}` : '/');
        } catch (err) {
          if (err instanceof ApiErr) {
            const d = { ...(err.details || {}) };
            if (err.code === 'password_weak') d.password = 1;
            if (d.name && type === 'company') d.c_name = 1;
            markErrors(f, d);
            if (type === 'company') markLegalErrors(f, d);
          }
        }
      };
    },
  };
}

// ---------- Parolni tiklash ----------
export async function forgot() {
  const html = `
  ${crumbs([[t('home'), '/'], [t('reset_title')]])}
  <div class="auth-card">
    <h1 class="page-title" style="font-size:26px">${esc(t('reset_title'))}</h1>
    <p class="page-sub" style="margin-bottom:18px">${esc(t('reset_sub'))}</p>
    <form data-f1>${phoneField()}<button class="btn btn-primary btn-block" style="margin-top:16px">${esc(t('get_code'))}</button></form>
    <form data-f2 hidden>
      <p class="small" data-sent></p>
      <label class="lbl">${esc(t('code'))}</label><input class="input" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required>
      <p class="tiny muted" data-dev></p>
      <label class="lbl" style="margin-top:12px">${esc(t('new_password'))}</label><input class="input" name="password" type="password" autocomplete="new-password" required>
      <div class="hint">${esc(t('password_hint'))}</div>
      <button class="btn btn-primary btn-block" style="margin-top:14px">${esc(t('set_password'))}</button>
    </form>
  </div>`;
  return {
    title: t('reset_title'),
    html,
    mount(main) {
      const f1 = $('[data-f1]', main);
      const f2 = $('[data-f2]', main);
      let phone; let country;
      f1.onsubmit = async (e) => {
        e.preventDefault();
        ({ phone, country } = readPhone(f1));
        const r = await api('/auth/password/forgot', { method: 'POST', body: { phone, country } });
        phone = r.phone;
        f2.querySelector('[data-sent]').textContent = t('code_sent', { p: r.phone });
        if (r.dev_code) { f2.querySelector('[data-dev]').textContent = t('dev_code', { c: r.dev_code }); f2.code.value = r.dev_code; }
        f1.hidden = true; f2.hidden = false;
      };
      f2.onsubmit = async (e) => {
        e.preventDefault();
        const r = await api('/auth/password/reset', { method: 'POST', body: { phone, country, code: f2.code.value.trim(), password: f2.password.value } }).catch((err) => { if (err.code === 'password_weak') f2.password.classList.add('err'); throw err; });
        setToken(r.token);
        state.user = r.user;
        toast(t('password_changed'), 'ok');
        window.dispatchEvent(new Event('mx:auth'));
        go('/');
      };
    },
  };
}
