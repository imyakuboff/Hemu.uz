import { state, t, esc, api, icon, fmtTime, fmtRel, fmtDate, toDate, initials, debounce, $ } from '../core.js';
import { crumbs, accountLayout } from '../ui.js';
import { go, refreshBadges } from '../app.js';

const kb = (n) => (n ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : '');

function dlgItem(c, active) {
  const who = [c.with.name, c.with.company?.name].filter(Boolean).join(' · ');
  return `<a class="dlg ${active ? 'on' : ''}" href="/messages/${c.id}">
    <b>${esc(who)}</b>
    ${c.listing ? `<span class="l">${esc(c.listing.title)}</span>` : ''}
    <p>${esc(c.last_message?.body || c.last_message?.attachment_name || '')}</p>
    <div class="r"><span>${esc(c.last_message ? fmtRel(c.last_message.created_at) : '')}</span>${c.unread ? `<span class="n">${c.unread}</span>` : ''}</div>
  </a>`;
}

function bubble(m) {
  const me = m.sender_id === state.user.id;
  const file = m.attachment ? `<a data-file="${esc(m.attachment)}" style="display:flex;gap:8px;align-items:center;text-decoration:none;cursor:pointer">${icon('file')}<span><b style="display:block;font-size:12px">${esc(m.attachment_name || 'file')}</b><span class="tiny" style="opacity:.75">${esc(kb(m.attachment_size))}</span></span></a>` : '';
  return `<div class="bubble ${me ? 'me' : ''}" data-mid="${m.id}">${file}${m.body ? `${file ? '<div style="margin-top:6px"></div>' : ''}${esc(m.body)}` : ''}<time>${esc(fmtTime(m.created_at))}${me ? ` ${m.read ? '✓✓' : '✓'}` : ''}</time></div>`;
}

function msgsHtml(items) {
  let lastDay = '';
  return items.map((m) => {
    const day = toDate(m.created_at).toDateString();
    const sep = day !== lastDay ? `<div class="day-sep">${esc(fmtRel(m.created_at).split(',')[0] === fmtRel(m.created_at) ? fmtDate(m.created_at) : `${fmtRel(m.created_at).split(',')[0]}, ${fmtDate(m.created_at).replace(/\s?\d{4}.*$/, '')}`)}</div>` : '';
    lastDay = day;
    return sep + bubble(m);
  }).join('');
}

export default async function messages({ params }) {
  if (!state.user) return { title: t('nav_msgs'), html: `<div class="box empty"><h3>${esc(t('login_required'))}</h3><button class="btn btn-primary" data-login style="margin-top:14px">${esc(t('login'))}</button></div>` };
  const activeId = params[0] ? Number(params[0]) : null;
  const [list, tpls] = await Promise.all([api('/conversations'), api('/me/templates').catch(() => [])]);
  let conv = null;
  let msgs = { items: [] };
  if (activeId) {
    [conv, msgs] = await Promise.all([api(`/conversations/${activeId}`), api(`/conversations/${activeId}/messages`)]);
    if (conv.unread) api(`/conversations/${activeId}/read`, { method: 'POST', silent: true }).then(refreshBadges).catch(() => {});
  }
  const who = conv ? [conv.with.name, conv.with.company?.name].filter(Boolean).join(' · ') : '';
  const win = conv ? `
    <div class="hd">
      <a href="/messages" class="icon-btn mobile-only" style="margin-inline-end:-6px">${icon('arrow-left', 'arrow-flip')}</a>
      <span class="avatar sm">${esc(initials(conv.with.name || conv.with.company?.name))}</span>
      <div style="flex:1;min-width:0"><b>${esc(who)}</b><span>${esc([conv.with.last_seen_at && Date.now() - toDate(conv.with.last_seen_at) < 300000 ? t('online') : '', conv.with.company?.verified ? t('company_verified').toLowerCase() : ''].filter(Boolean).join(' · '))}</span></div>
      ${conv.listing ? `<a href="/listing/${conv.listing.id}" class="icon-btn" style="color:var(--blue)">${icon('phone')}</a>` : ''}
    </div>
    ${conv.listing ? `<a class="lst" href="/listing/${conv.listing.id}"><img src="${esc(conv.listing.cover || '/img/demo/jcb.jpg')}" alt=""><div><b>${esc(conv.listing.title)}</b><b style="font-size:13px">${esc(conv.listing.price?.formatted || '')}</b><span>${esc(t('listing_no', { n: conv.listing.id }))}</span></div></a>` : ''}
    <div class="msgs" data-msgs>${msgsHtml(msgs.items)}</div>
    <form data-send><label class="icon-btn" style="cursor:pointer" title="PDF/JPG">${icon('clip')}<input type="file" name="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden></label>
      ${tpls.length ? `<select class="input" data-tpl style="width:44px;padding:0 6px;flex:none" title="${esc(t('templates'))}"><option value="">≡</option>${tpls.map((x) => `<option value="${esc(x.text)}">${esc(x.text.slice(0, 60))}</option>`).join('')}</select>` : ''}<input class="input" name="body" autocomplete="off" placeholder="${esc(t('type_msg'))}"><button class="btn btn-primary" style="width:40px;padding:0">${icon('send')}</button></form>`
    : `<div class="empty" style="margin:auto">${icon('chat')}<p>${esc(list.items.length ? t('select_dialog') : t('empty'))}</p></div>`;

  const html = accountLayout('/messages', `
    ${crumbs([[t('home'), '/'], [t('dashboard'), '/dashboard'], [t('nav_msgs')]])}
    <div class="page-head"><h1 class="page-title">${esc(t('nav_msgs'))}</h1><p class="page-sub">${esc(t('msgs_sub'))}</p></div>
    <div class="chat ${conv ? 'has-active' : ''}">
      <div class="list">
        <div class="hd"><h3>${esc(t('dialogs'))}</h3><div class="search" style="height:38px;padding:0 10px;background:var(--bg);border:0">${icon('search')}<input data-q placeholder="${esc(t('search_msgs'))}"></div></div>
        <div class="items" data-items>${list.items.map((c) => dlgItem(c, c.id === activeId)).join('')}
          <div class="note" style="margin:12px;border:0;padding:0 4px">${icon('shield')}<p style="margin:0">${esc(t('chat_safety'))}</p></div></div>
      </div>
      <div class="win">${win}</div>
    </div>`);

  return {
    title: t('nav_msgs'),
    html,
    mount(main) {
      const box = $('[data-msgs]', main);
      if (box) box.scrollTop = box.scrollHeight;
      const q = $('[data-q]', main);
      q.addEventListener('input', debounce(async () => {
        const r = await api(`/conversations?q=${encodeURIComponent(q.value.trim())}`);
        $('[data-items]', main).innerHTML = r.items.map((c) => dlgItem(c, c.id === activeId)).join('');
      }, 250));
      main.addEventListener('click', async (e) => {
        const f = e.target.closest('[data-file]');
        if (!f) return;
        e.preventDefault();
        const r = await fetch(f.dataset.file.replace(/^https?:\/\/[^/]+/, ''), { headers: { Authorization: `Bearer ${state.token}` } });
        if (r.ok) window.open(URL.createObjectURL(await r.blob()), '_blank');
      });
      const form = $('[data-send]', main);
      if (form) {
        form.file.addEventListener('change', () => { if (form.file.files[0]) form.requestSubmit(); });
        $('[data-tpl]', form)?.addEventListener('change', (e) => { if (e.target.value) { form.body.value = e.target.value; e.target.value = ''; form.body.focus(); } });
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const body = form.body.value.trim();
          const file = form.file.files[0];
          if (!body && !file) return;
          const fd = new FormData();
          if (body) fd.append('body', body);
          if (file) fd.append('file', file);
          form.body.value = '';
          form.file.value = '';
          await api(`/conversations/${activeId}/messages`, { method: 'POST', form: fd });
        });
      }
      // Real vaqt: yangi xabar va o'qildi belgisi
      const onMsg = (ev) => {
        const m = ev.detail;
        if (m.conversation_id === activeId && box && !box.querySelector(`[data-mid="${m.id}"]`)) {
          box.insertAdjacentHTML('beforeend', bubble(m));
          box.scrollTop = box.scrollHeight;
          if (m.sender_id !== state.user.id) api(`/conversations/${activeId}/read`, { method: 'POST', silent: true }).catch(() => {});
        }
        api('/conversations', { silent: true }).then((r) => { $('[data-items]', main).firstElementChild && ($('[data-items]', main).innerHTML = r.items.map((c) => dlgItem(c, c.id === activeId)).join('') + `<div class="note" style="margin:12px;border:0;padding:0 4px">${icon('shield')}<p style="margin:0">${esc(t('chat_safety'))}</p></div>`); }).catch(() => {});
      };
      window.addEventListener('mx:message', onMsg);
      return () => window.removeEventListener('mx:message', onMsg);
    },
  };
}

export { go };
