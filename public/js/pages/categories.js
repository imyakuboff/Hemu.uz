import { t, esc, api, icon, num, qs, debounce, $ } from '../core.js';
import { crumbs, catIcon } from '../ui.js';
import { sectionsGrid } from './sections.js';

function blocks(list) {
  if (!list.length) return `<div class="box empty"><h3>${esc(t('nothing_found'))}</h3></div>`;
  return `<div class="cat-cols">${list.map((c) => `
    <div class="cat-block">
      <div class="hd"><span class="ico-box">${icon(catIcon(c.slug))}</span><div><b>${esc(c.name)}</b><span>${esc(t('listings_count', { n: num(c.count) }))}</span></div></div>
      <ul>${c.children.map((s) => `<li><a href="/catalog?category=${s.slug}">${esc(s.name)}<small>${s.count ? num(s.count) : ''}${icon('chevron', 'arrow-flip')}</small></a></li>`).join('')}</ul>
      <a class="all" href="/catalog?category=${c.slug}">${esc(t('all_in_category'))} ${icon('arrow', 'arrow-flip')}</a>
    </div>`).join('')}</div>`;
}

export default async function categories({ query }) {
  const [list, secs] = await Promise.all([api(`/categories${qs({ q: query.q })}`), api('/sections').catch(() => ({}))]);
  const html = `
  ${crumbs([[t('home'), '/'], [t('categories_title')]])}
  <div class="page-head"><h1 class="page-title">${esc(t('categories_title'))}</h1><p class="page-sub">${esc(t('categories_sub'))}</p></div>
  <form class="search" data-cat-search style="margin-bottom:20px">${icon('search')}<input name="q" value="${esc(query.q || '')}" placeholder="${esc(t('search_categories'))}"><button class="btn btn-primary"><span class="desktop-only">${esc(t('find_listings'))}</span><span class="mobile-only">${esc(t('find'))}</span></button></form>
  <div data-blocks>${blocks(list)}</div>
  <section class="sec"><div class="sec-head"><div><h2>${esc(t('sec_title'))}</h2></div></div>${sectionsGrid(secs)}</section>
  <div class="cta-teal">
    <div><h3>${esc(t('need_specific'))}</h3><p>${esc(t('need_specific_sub'))}</p></div>
    <a href="/request/new" class="btn btn-white">${esc(t('create_request'))}</a>
  </div>`;
  return {
    title: t('categories_title'),
    html,
    mount(main) {
      const form = $('[data-cat-search]', main);
      const run = debounce(async () => {
        const q = form.q.value.trim();
        history.replaceState(null, '', `/categories${qs({ q })}`);
        $('[data-blocks]', main).innerHTML = blocks(await api(`/categories${qs({ q })}`));
      }, 250);
      form.q.addEventListener('input', run);
      // Enter: shu so'z bilan e'lonlarni qidirish
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const q = form.q.value.trim();
        window.mxGo(`/catalog${qs({ q })}`);
      });
    },
  };
}
