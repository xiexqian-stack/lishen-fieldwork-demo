/** Phone presentation helpers. Existing delegated app actions perform mutations. */
export function mobileNav(page, icon) {
  const items = [
    ['overview', 'grid', '总览'],
    ['outlets', 'pin', '门店'],
    ['visits', 'clipboard', '走访'],
    ['settings', 'settings', '设置'],
  ];
  return `<nav class="mobile-bottom-nav" aria-label="手机工作导航">${items.map(([target, symbol, label]) => `<button type="button" data-page="${target}" class="mobile-nav-item ${page === target ? 'active' : ''}" ${page === target ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span></button>`).join('')}</nav>`;
}

function actions(store, { esc, icon }) {
  const id = esc(store.id), name = esc(store.name);
  return `<div class="mobile-store-actions"><button type="button" class="mobile-action-tag" data-action="quick-tag" data-id="${id}" aria-label="修改${name}的标记">${icon('pin')}<span>改标记</span></button><button type="button" class="mobile-action-visit" data-action="visit" data-id="${id}" aria-label="登记${name}的走访">${icon('clipboard')}<span>登记走访</span></button><button type="button" class="mobile-action-route" data-action="navigate" data-id="${id}" aria-label="导航到${name}">${icon('navigation')}<span>导航</span></button></div>`;
}

function provenance(store) {
  return store.annotationIsDemo === true ? '<span class="mobile-demo-label">演示标记</span>' : '';
}

export function mobileStoreCards(stores, helpers) {
  const { esc, icon, statusBadge, gradeBadge, formatDate, rep } = helpers;
  return `<div class="mobile-store-cards">${stores.map(store => {
    const id = esc(store.id);
    const owner = store.repId ? rep(store.repId)?.name : '未分配';
    return `<article class="mobile-store-card"><div class="mobile-store-card-heading"><button type="button" class="mobile-store-title" data-action="detail" data-id="${id}" aria-label="查看${esc(store.name)}的档案"><span class="mobile-store-type-icon">${icon(/茶|咖啡/.test(store.type) ? 'coffee' : 'store')}</span><span><strong>${esc(store.name)}</strong><small>${esc(store.town || '乡镇待核实')} · ${esc(store.type || '茶饮门店')}</small></span></button><button type="button" class="mobile-edit-archive" data-action="edit-store" data-id="${id}" aria-label="编辑${esc(store.name)}的档案">档案${icon('chevron')}</button></div><div class="mobile-store-labels">${statusBadge(store.status)}${gradeBadge(store.grade)}${provenance(store)}</div><p class="mobile-store-address">${icon('pin')}<span>${esc(store.address || '详细地址待核实')}</span></p><div class="mobile-store-meta"><span>${icon('users')}${esc(owner || '未分配')}</span><span>${icon('clock')}${store.lastVisitAt ? formatDate(store.lastVisitAt) : '尚未走访'}</span></div>${actions(store, helpers)}</article>`;
  }).join('')}</div>`;
}

export function mobileSelectedCard(store, helpers) {
  if (!store) return '<div class="mobile-selected mobile-selected-empty">点击地图标记，查看门店并快速登记</div>';
  const { esc, icon, statusBadge, gradeBadge } = helpers;
  return `<section class="mobile-selected" aria-label="选中门店"><div class="mobile-selected-handle" aria-hidden="true"></div><div class="mobile-selected-heading"><button type="button" class="mobile-selected-title" data-action="detail" data-id="${esc(store.id)}"><strong>${esc(store.name)}</strong><small>${esc(store.town || '乡镇待核实')} · ${esc(store.type || '茶饮门店')}</small></button><button type="button" class="mobile-edit-archive" data-action="detail" data-id="${esc(store.id)}" aria-label="查看${esc(store.name)}的详情">详情${icon('chevron')}</button></div><div class="mobile-store-labels">${statusBadge(store.status)}${gradeBadge(store.grade)}${provenance(store)}</div><p class="mobile-selected-address">${icon('pin')}<span>${esc(store.address || '详细地址待核实')}</span></p>${actions(store, helpers)}</section>`;
}
