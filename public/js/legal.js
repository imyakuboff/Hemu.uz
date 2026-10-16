// Kompaniya rekvizitlari: mamlakatga xos tashkiliy-huquqiy shakl (YaTT, MChJ, ИП, ТОО, MMC ...),
// soliq/bank maydonlari va guvohnoma yuklash. Ro'yxatdan o'tish va profilda bir xil ishlatiladi.
import { t, esc, api, icon, fmtDate, toast, confirmBox, $, $$ } from './core.js';

const cache = new Map();
export async function legalSpec(country) {
  if (!cache.has(country)) cache.set(country, await api(`/legal-forms?country=${country}`));
  return cache.get(country);
}

const field = (f, v) => `<div class="${['legal_address', 'bank_name'].includes(f.key) ? 'full' : ''}">
  <label class="lbl">${esc(f.label)}${f.required ? ' *' : ''}</label>
  <input class="input" name="${f.key}" value="${esc(v ?? '')}" ${f.type === 'date' ? 'type="date"' : 'autocomplete="off"'} placeholder="${esc(f.placeholder || '')}" ${f.pattern ? `data-pattern="${esc(f.pattern)}"` : ''} ${f.required ? 'data-req' : ''}>
</div>`;

function fieldsHtml(form, values = {}) {
  const tax = form.fields.filter((f) => !['bank_name', 'bank_code', 'bank_account', 'corr_account'].includes(f.key));
  const bank = form.fields.filter((f) => ['bank_name', 'bank_code', 'bank_account', 'corr_account'].includes(f.key));
  return `<div class="form-grid">${tax.map((f) => field(f, values[f.key])).join('')}</div>
    ${bank.length ? `<div class="lbl" style="margin:14px 0 6px;font-weight:700">${icon('card')} ${esc(t('bank_details'))}</div><div class="form-grid">${bank.map((f) => field(f, values[f.key])).join('')}</div>` : ''}`;
}

// Hujjat yuklash qatorlari (mavjud hujjatlar bilan)
function docsHtml(form, existing = [], { canDelete = true } = {}) {
  return form.docs.map((d) => {
    const have = existing.filter((x) => x.doc_type === d.type);
    return `<div class="doc-row" data-doc-type="${d.type}" ${d.required && !have.length ? 'data-required' : ''}>
      <div class="doc-ico">${icon(have.length ? 'check' : 'file')}</div>
      <div class="doc-info"><b>${esc(d.name)}${d.required ? ` <span class="tag ${have.length ? 'green' : 'red'}">${esc(t('required_mark'))}</span>` : ''}</b>
        ${have.map((x) => `<span class="doc-file">${icon('clip')} ${esc(x.original_name || 'file')} · ${esc(fmtDate(x.created_at))}${canDelete ? ` <button type="button" data-doc-del="${x.id}" title="${esc(t('delete'))}">${icon('x')}</button>` : ''}</span>`).join('')}
        <span class="doc-picked" data-picked></span></div>
      <label class="btn btn-soft btn-sm">${icon('upload')} ${esc(t('doc_upload'))}<input type="file" name="doc_${d.type}" accept="application/pdf,image/jpeg,image/png" multiple hidden></label>
    </div>`;
  }).join('');
}

// Butun blok: shakl tanlash + rekvizitlar + hujjatlar
export function legalBlock(spec, { form: code, values = {}, docs = [], showDocs = true, canDelete = true } = {}) {
  const form = spec.forms.find((f) => f.code === code) || null;
  return `<div class="legal" data-legal>
    <label class="lbl">${esc(t('legal_form'))} *</label>
    <div class="legal-forms">${spec.forms.map((f) => `<label class="pick big ${f.individual ? 'ind' : ''}"><input type="radio" name="legal_form" value="${f.code}" ${f.code === form?.code ? 'checked' : ''}><span>${icon(f.individual ? 'user' : 'building')} ${esc(f.name)}</span></label>`).join('')}</div>
    <div data-legal-body>${form ? `<p class="tiny muted" style="margin:12px 0 8px">${esc(t('requisites_hint'))}</p>${fieldsHtml(form, values)}` : ''}</div>
    ${showDocs ? `<div data-legal-docs>${form ? `<h3 class="legal-h">${icon('file')} ${esc(t('docs_title'))}</h3><p class="tiny muted" style="margin:-4px 0 8px">${esc(t('docs_hint'))}</p>${docsHtml(form, docs, { canDelete })}` : ''}</div>` : ''}
  </div>`;
}

// Shakl almashganda maydonlar va hujjatlar qayta chiziladi (kiritilgan qiymatlar saqlanadi)
export function bindLegal(root, spec, { docs = [], showDocs = true, canDelete = true, onDocDelete } = {}) {
  const box = $('[data-legal]', root);
  if (!box) return;
  box.addEventListener('change', (e) => {
    if (e.target.name === 'legal_form') {
      const form = spec.forms.find((f) => f.code === e.target.value);
      const keep = readRequisites(root);
      $('[data-legal-body]', box).innerHTML = `<p class="tiny muted" style="margin:12px 0 8px">${esc(t('requisites_hint'))}</p>${fieldsHtml(form, keep)}`;
      if (showDocs) $('[data-legal-docs]', box).innerHTML = `<h3 class="legal-h">${icon('file')} ${esc(t('docs_title'))}</h3><p class="tiny muted" style="margin:-4px 0 8px">${esc(t('docs_hint'))}</p>${docsHtml(form, docs, { canDelete })}`;
      box.querySelector('.legal-forms').classList.remove('err');
    }
    const file = e.target.closest('input[type=file][name^="doc_"]');
    if (file) {
      const row = file.closest('.doc-row');
      $('[data-picked]', row).textContent = [...file.files].map((f) => f.name).join(', ');
      row.classList.toggle('picked', file.files.length > 0);
      if (file.files.length) row.classList.remove('err');
    }
  });
  box.addEventListener('input', (e) => e.target.classList.remove('err'));
  box.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-doc-del]');
    if (!del) return;
    e.preventDefault();
    if (!(await confirmBox(t('delete')))) return;
    await api(`/my/company/documents/${del.dataset.docDel}`, { method: 'DELETE' });
    onDocDelete?.();
  });
}

export function readRequisites(root) {
  const out = {};
  const box = $('[data-legal]', root);
  if (!box) return out;
  const lf = $('input[name=legal_form]:checked', box);
  if (lf) out.legal_form = lf.value;
  for (const el of $$('[data-legal-body] input', box)) out[el.name] = el.value.trim();
  return out;
}

// Mijoz tomonida tekshiruv (server ham tekshiradi). Xato bo'lsa false.
export function checkRequisites(root, { needDocs = false } = {}) {
  const box = $('[data-legal]', root);
  if (!box) return true;
  let ok = true;
  if (!$('input[name=legal_form]:checked', box)) { box.querySelector('.legal-forms').classList.add('err'); ok = false; }
  for (const el of $$('[data-legal-body] input', box)) {
    const raw = el.value.trim();
    const v = ['legal_address', 'bank_name', 'director'].includes(el.name) ? raw : raw.replace(/\s+/g, '').toUpperCase();
    const bad = (el.hasAttribute('data-req') && !v) || (v && el.dataset.pattern && !new RegExp(el.dataset.pattern).test(v));
    el.classList.toggle('err', Boolean(bad));
    if (bad) ok = false;
  }
  if (needDocs) {
    for (const row of $$('.doc-row[data-required]', box)) {
      if (!row.querySelector('input[type=file]').files.length) { row.classList.add('err'); ok = false; }
    }
  }
  if (!ok) {
    toast(t('fill_required'), 'err');
    box.querySelector('.err')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  return ok;
}

// Tanlangan fayllarni turi bo'yicha yuklash (kompaniya yaratilgandan keyin)
export async function uploadDocs(root) {
  let last = null;
  for (const input of $$('[data-legal] input[type=file][name^="doc_"]', root)) {
    if (!input.files.length) continue;
    const fd = new FormData();
    fd.append('doc_type', input.name.slice(4));
    for (const f of input.files) fd.append('files', f);
    last = await api('/my/company/verification', { method: 'POST', form: fd });
  }
  return last;
}

// Server xatolarini maydonlarga qo'yish
export function markLegalErrors(root, details = {}) {
  const box = $('[data-legal]', root);
  if (!box) return;
  if (details.legal_form) box.querySelector('.legal-forms').classList.add('err');
  for (const [k] of Object.entries(details)) $(`[data-legal-body] input[name="${k}"]`, box)?.classList.add('err');
  box.querySelector('.err')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
