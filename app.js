import { TOWNS, TOWN_OPTIONS, STORE_TYPES, CATALOG_META, REPS, PRODUCTS, STATUS_META, GRADE_META, createSeedData, uid, formatDate, daysSince } from './data.js';
import { StoreMap } from './map.js';
import { getDemoAnnotationPreview, clearDemoAnnotations, markUserAnnotation } from './business-annotations.js';
import { migrateCatalog } from './catalog-migration.js';
import { applyDemoScenario, DEMO_SCENARIO_VERSION } from './demo-scenario.js';
import { mobileNav, mobileStoreCards, mobileSelectedCard } from './mobile-ui.js';
import { APP_CONFIG } from './config.js';
import { getDistrictSummaries } from './districts.js';
import { normalizeStorePhotos, validateStorePhotos, compressStorePhoto, PHOTO_GROUPS, STORE_PHOTO_LIMITS, assertDatasetStorageBudget } from './store-photos.js';

const paths = {
  grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  pin:'M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  store:'m3 10 2-7h14l2 7M4 11v10h16V11M9 21v-7h6v7M3 10c0 3 4 3 4 0 0 3 5 3 5 0 0 3 5 3 5 0 0 3 4 3 4 0',
  clipboard:'M9 4H5v17h14V4h-4M9 2h6v5H9zM8 12h8M8 16h5',
  chart:'M4 3v18h17M8 16v-5M13 16V7M18 16V4',
  users:'M16 21v-3c0-3-3-4-6-4s-6 1-6 4v3M14 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0M17 3a4 4 0 0 1 0 8M20 21v-3c0-2-1-3-3-4',
  settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M9 3l-1 3-3 1-2 4 2 2v3l3 2 1 3h5l1-3 3-2v-3l2-2-2-4-3-1-1-3Z',
  search:'m16 16 5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  bell:'M18 8a6 6 0 0 0-12 0c0 8-3 8-3 10h18c0-2-3-2-3-10M10 22h4',
  chevron:'m9 5 7 7-7 7', down:'m6 9 6 6 6-6', plus:'M12 4v16M4 12h16',
  download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5', arrow:'M4 12h16m-5-5 5 5-5 5',
  clock:'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  check:'m5 12 4 4L19 6', checkcircle:'m8 12 3 3 5-6M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  trend:'m3 17 6-6 4 4 8-11M15 4h6v6', location:'M12 2v3M12 19v3M2 12h3M19 12h3M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
  navigation:'m21 3-6 18-4-8-8-4Z', close:'m6 6 12 12M6 18 18 6', phone:'M8 3H4C0 14 10 24 21 20v-4l-5-2-2 3c-3-1-6-4-7-7l3-2Z',
  camera:'M3 7h5l2-3h4l2 3h5v14H3zM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  info:'M12 11v6M12 7v.1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  map:'m3 5 6-3 6 3 6-3v17l-6 3-6-3-6 3ZM9 2v17M15 5v17',
  list:'M8 6h13M8 12h13M8 18h13M3 6h.1M3 12h.1M3 18h.1',
  shield:'m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6ZM8 12l3 3 5-6',
  upload:'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5', file:'M14 2H4v20h16V8ZM14 2v6h6M8 13h8M8 17h6',
  coffee:'M4 8h13v9c0 3-13 3-13 0ZM17 9h3c4 0 4 6 0 6h-3M6 3v2M11 2v3M16 3v2M2 22h18',
  minus:'M5 12h14', menu:'M4 6h16M4 12h16M4 18h16', refresh:'M20 8a9 9 0 1 0 0 9M20 2v6h-6', external:'M14 3h7v7M21 3l-11 11M10 3H3v18h18v-7'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.store}"/></svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $ = (selector, root=document) => root.querySelector(selector);
const STORAGE_KEY = 'lishen-fieldwork-v1';
let storageWarning = '';
function readData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);validateData(parsed);
      if(!parsed.settings.mapKeyConfigured&&!parsed.settings.tencentKey)parsed.settings.tencentKey=APP_CONFIG.tencentKey;
      parsed.settings.mapKeyConfigured=true;
      const migrated=applyDemoScenario(migrateCatalog(parsed));validateData(migrated);
      const serialized=JSON.stringify(migrated);
      if(serialized!==saved){try{localStorage.setItem(STORAGE_KEY,serialized);}catch{storageWarning='目录已升级，但浏览器未能保存。请导出备份并检查存储空间。';}}
      return migrated;
    }
  } catch { storageWarning = '浏览器存储不可用或旧数据无法读取；本次使用演示数据。请先导出备份。'; }
  const seed=createSeedData();
  Object.assign(seed.settings,{tencentKey:APP_CONFIG.tencentKey,mapKeyConfigured:true});
  return seed;
}
let db = readData();
const initialRoute=parseRoute();
const state = { page:initialRoute.page, role:'admin', repId:REPS[0].id, town:initialRoute.town, status:'', grade:'', type:'', query:'', repFilter:'', visitDate:'', pageNumber:1, view:initialRoute.town?'list':matchMedia('(max-width:760px)').matches?'map':'list', selected:null };
let mainMap = null, formMap = null, activeModal = null, returnFocus = null, modalToken = 0, toastTimer;
const pageMeta = {
  overview:{title:'市场总览',en:'MARKET OVERVIEW',desc:'每一家门店，都值得被看见。',icon:'grid'},
  outlets:{title:'门店管理',en:'OUTLET MANAGEMENT',desc:'从地图到档案，掌握每一个终端。',icon:'pin'},
  visits:{title:'走访记录',en:'FIELD VISITS',desc:'记录现场，让每一次走访都有迹可循。',icon:'clipboard'},
  analytics:{title:'数据分析',en:'MARKET INSIGHTS',desc:'从铺货到陈列，了解市场进展。',icon:'chart'},
  team:{title:'业务团队',en:'FIELD TEAM',desc:'分工清晰，让终端维护更有节奏。',icon:'users'},
  settings:{title:'系统设置',en:'WORKSPACE SETTINGS',desc:'配置真实地图，准备下一步上线。',icon:'settings'}
};
function parseRoute(){const [page,query='']=location.hash.slice(1).split('?');const town=new URLSearchParams(query).get('town')||'';return {page:validPage(page),town:TOWN_OPTIONS.includes(town)?town:''};}
function openTown(town){if(!TOWN_OPTIONS.includes(town))return;Object.assign(state,{page:'outlets',town,status:'',grade:'',type:'',query:'',repFilter:'',visitDate:'',pageNumber:1,view:'list',selected:null});location.hash='outlets?town='+encodeURIComponent(town);render();window.scrollTo({top:0});}
function validPage(page) { return ['overview','outlets','visits','analytics','team','settings'].includes(page) ? page : 'overview'; }
const rep = id => REPS.find(r=>r.id===id) || {id:'',name:'未分配',initials:'待'};
const mobileHelpers={esc,icon,statusBadge,gradeBadge,formatDate,rep,lastVisitIsDemo};
const storeById = id => db.stores.find(s=>s.id===id);
function lastVisitIsDemo(store){return !!store.lastVisitAt && db.visits.some(v=>v.storeId===store.id&&v.visitedAt===store.lastVisitAt&&v.isDemo===true);}
function storeSkuIds(store) {
  if(Array.isArray(store.skuIds)&&store.skuIds.length===store.skuCount)return store.skuIds;
  const latest=db.visits.filter(v=>v.storeId===store.id).sort((a,b)=>new Date(b.visitedAt)-new Date(a.visitedAt))[0];
  return latest&&latest.skuIds.length===store.skuCount?latest.skuIds:[];
}
function baseStores() { return db.stores.filter(s=>state.role==='admin' || !s.repId || s.repId===state.repId); }
function canEdit(store) { return !!store && (state.role==='admin'||!store.repId||store.repId===state.repId); }
function visibleVisits() { const ids = new Set(baseStores().map(s=>s.id)); return db.visits.filter(v=>ids.has(v.storeId)); }
function filteredStores() {
  const q=state.query.trim().toLowerCase();
  return baseStores().filter(s=>(!state.town||s.town===state.town)&&(!state.status||s.status===state.status)&&(!state.grade||s.grade===state.grade)&&(!state.type||s.type===state.type)&&(!state.repFilter||s.repId===state.repFilter)&&(!q||[s.name,s.address,s.contact,s.town].some(v=>String(v).toLowerCase().includes(q))));
}
function filteredVisits() {
  const q=state.query.trim().toLowerCase();
  return visibleVisits().filter(v=>{const s=storeById(v.storeId);return (!state.town||s.town===state.town)&&(!state.status||v.status===state.status)&&(!state.repFilter||v.repId===state.repFilter)&&(!state.visitDate||localDay(v.visitedAt)===state.visitDate)&&(!q||[s.name,s.town,v.notes,rep(v.repId).name].some(x=>String(x).toLowerCase().includes(q)));}).sort((a,b)=>new Date(b.visitedAt)-new Date(a.visitedAt));
}
function localDay(date=new Date()) { const d=new Date(date);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function statusBadge(status) { return `<span class="status-badge ${status}"><i class="dot"></i>${STATUS_META[status].label}</span>`; }
function gradeBadge(grade) { const meta=GRADE_META[grade]||GRADE_META.ungraded; return `<span class="grade-badge"><span class="symbol">${meta.symbol}</span>${grade==='ungraded'?'待分级':grade+' 类'}</span>`; }
function person(id) { const r=rep(id); return `<span class="person"><span class="avatar">${r.initials}</span>${r.name}</span>`; }
function options(values,current,allLabel) { return `${allLabel!==undefined?`<option value="">${allLabel}</option>`:''}${values.map(v=>{const value=typeof v==='string'?v:v.value;return `<option value="${esc(value)}" ${value===current?'selected':''}>${esc(typeof v==='string'?v:v.label)}</option>`;}).join('')}`; }
function notify(message,error=false) { clearTimeout(toastTimer); $('#toast-root').innerHTML=`<div class="toast ${error?'error':''}" role="status">${icon(error?'info':'checkcircle')}${esc(message)}</div>`; toastTimer=setTimeout(()=>$('#toast-root').innerHTML='',5500); }
function commit(mutate) {
  const next=structuredClone(db);
  mutate(next);
  try { localStorage.setItem(STORAGE_KEY,assertDatasetStorageBudget(next)); }
  catch(error) { notify(error.message?.includes('照片')?error.message:'保存失败：浏览器存储空间不足或已禁用。请导出备份，减少照片后重试。',true); return false; }
  db=next;return true;
}
function navigate(page,reset=true) {
  if (reset) Object.assign(state,{town:'',status:'',grade:'',type:'',query:'',repFilter:'',visitDate:'',pageNumber:1,selected:null});
  state.page=validPage(page);location.hash=state.page;render();window.scrollTo({top:0});
}
function render() {
  formMap?.destroy();formMap=null;
  mainMap?.destroy();mainMap=null;
  const meta=pageMeta[state.page];
  $('#app').innerHTML=`<div class="app-shell"><aside class="sidebar" aria-label="主导航">
    <a class="brand" href="#overview" data-page="overview" aria-label="力神终端管理首页"><span class="brand-logo">LiSUN<sup>®</sup></span><span class="brand-name">力神咖啡<small>好咖啡，力神造！</small></span></a>
    <div class="nav-group-label">工作空间 / WORKSPACE</div><nav class="nav">${['overview','outlets','visits','analytics'].map(p=>navItem(p)).join('')}</nav>
    <div class="nav-divider"></div><div class="nav-group-label">管理 / MANAGEMENT</div><nav class="nav">${navItem('team')}${navItem('settings')}</nav>
    <div class="sidebar-footer"><div class="pilot-card"><div class="pilot-title"><i class="live-dot"></i>琼海市 · 试点市场</div><p>连接每一个终端<br>让好咖啡，走进日常</p><button data-page="settings">地图接入指引 ${icon('arrow')}</button></div><div class="version"><span>FIELDWORK v0.1</span><span>演示版</span></div></div>
    </aside><main class="main"><header class="topbar"><button class="mobile-toggle" data-action="mobile-menu" aria-label="展开导航">${icon('menu')}</button><div class="breadcrumb"><span>终端门店管理</span>${icon('chevron')}<b>${meta.title}</b></div><div class="top-search">${icon('search')}<input id="global-search" aria-label="搜索门店" placeholder="搜索门店名称、地址…"><kbd>/</kbd></div><button class="notification" data-action="followups" aria-label="查看待跟进门店">${icon('bell')}</button><span class="top-divider"></span><button class="user-switch" data-action="role" aria-label="切换演示身份"><span class="avatar">${state.role==='admin'?'管':rep(state.repId).initials}</span><span class="user-label"><strong>${state.role==='admin'?'市场管理员':rep(state.repId).name}</strong><small>${state.role==='admin'?'管理员':'业务员'} · 演示身份</small></span>${icon('down')}</button></header>
    <div class="page page-${state.page}"><div class="page-heading"><div><div class="eyebrow">${meta.en}</div><h1>${state.page==='outlets'&&state.town?esc(state.town)+'门店':meta.title}</h1><p class="page-description">${meta.desc}</p></div><div class="actions">${pageActions()}</div></div><div id="page-content"></div><footer class="page-footer"><span>${icon('shield')}力神咖啡 · 终端管理工作空间</span><span>${db.stores.some(s=>s.annotationIsDemo)?'真实名录 · 含演示标注':'真实名录'} · 仅保存在当前浏览器</span></footer></div></main>${mobileNav(state.page,icon)}</div>`;
  renderContent();
}
function navItem(page) { return `<button class="nav-item ${state.page===page?'active':''}" data-page="${page}" ${state.page===page?'aria-current="page"':''}>${icon(pageMeta[page].icon)}${page==='overview'?'首页':pageMeta[page].title}${page==='outlets'?`<span class="nav-num">${baseStores().length}</span>`:''}</button>`; }
function pageActions() {
  if(state.page==='settings') return `<span class="badge demo">本地演示环境</span>`;
  if(state.page==='team')return `<button class="btn secondary" data-action="export">${icon('download')}导出门店</button>`;
  return `<button class="btn secondary" data-action="export">${icon('download')}导出数据</button><button class="btn primary" data-action="${state.page==='visits'?'new-visit':'new-store'}">${icon('plus')}${state.page==='visits'?'登记走访':'新增门店'}</button>`;
}
function renderContent() {
  if(state.page==='settings'){formMap?.destroy();formMap=null;}
  mainMap?.destroy();mainMap=null;
  $('#page-content').innerHTML=({overview:overviewPage,outlets:outletsPage,visits:visitsPage,analytics:analyticsPage,team:teamPage,settings:settingsPage}[state.page])();
  const target=$('#main-map');
  if(target) {
    mainMap=new StoreMap(target,{fitPadding:state.page==='overview'?28:70,showControl:state.page!=='overview',onSelect:id=>{state.selected=id;if(state.page==='outlets')updateSelected();else if(state.page==='overview')showDetail(id);},onCoordinate:()=>{}});
    mainMap.setStores(filteredStores());
    if(state.selected) mainMap.selectStore(state.selected);
    mainMap.fitAll();
    if(db.settings.tencentKey) activateMap(mainMap,db.settings.tencentKey);
    const empty=$('#map-empty');if(empty)empty.hidden=filteredStores().length>0;
  }
}
async function activateMap(map,key) {
  try{await map.setKey(key);if(map.userLocation)map.locate(map.userLocation.lng,map.userLocation.lat,{accuracy:map.userLocation.accuracy});else map.fitAll();if(map===mainMap){$('#map-mode-label')&&( $('#map-mode-label').textContent='腾讯地图 · GCJ-02');}}
  catch(error){if(map===mainMap){$('#map-mode-label')&&($('#map-mode-label').textContent='示意底图 · Key 接入未成功');}}
}
function statsGrid() {
 const stores=baseStores(),visits=visibleVisits(),visitedIds=new Set(visits.map(v=>v.storeId)),visited=stores.filter(s=>visitedIds.has(s.id)).length;
 const demoVisited=new Set(visits.filter(v=>v.isDemo).map(v=>v.storeId)).size,realVisited=new Set(visits.filter(v=>!v.isDemo).map(v=>v.storeId)).size;
 const graded=stores.filter(s=>['A','B','C'].includes(s.grade)),gradeCounts=['A','B','C'].map(g=>g+' '+graded.filter(s=>s.grade===g).length).join(' · ');
 const cards=[{title:'真实门店名录',value:stores.length,unit:'家',icon:'store',foot:'腾讯地点检索 · 琼海行政区',featured:true},
 {title:'已走访门店',value:visited,unit:'家',icon:'clipboard',foot:demoVisited?'含 '+demoVisited+' 家演示走访 · 真实 '+realVisited+' 家':'真实走访记录 · '+(stores.length?Math.round(visited/stores.length*100):0)+'%'},
 {title:'已分级门店',value:graded.length,unit:'家',icon:'chart',foot:gradeCounts+(graded.some(s=>s.annotationIsDemo)?' · 含演示':'')},
 {title:'待首次走访',value:stores.length-visited,unit:'家',icon:'clock',foot:'走访进度 '+(stores.length?Math.round(visited/stores.length*100):0)+'%'+(demoVisited?' · 含演示':'')}];
 return `<div class="stats-grid">${cards.map(c=>`<div class="stat-card ${c.featured?'featured':''}"><div class="stat-head">${c.title}<span class="stat-icon">${icon(c.icon)}</span></div><div class="stat-value">${c.value}<em>${c.unit}</em></div><div class="stat-foot">${c.foot}</div></div>`).join('')}</div>`;
}
function catalogNotice(){return `<div class="notice catalog-notice">${icon('info')}<span>腾讯真实名录 ${CATALOG_META.totalStores} 家 · ${formatDate(CATALOG_META.fetchedAt)} 检索快照。受当日检索额度限制，后续继续补齐；${db.stores.filter(s=>s.annotationIsDemo).length} 家含虚拟业务标注，演示走访与分级不代表真实到店情况，可在设置中一键清除。</span><button class="btn text" data-page="settings">查看来源</button></div>`;}
function mapToolbar() {
  return `<div class="map-toolbar"><div class="status-filters" role="group" aria-label="铺货状态筛选">${[['','全部门店'],['unvisited','未走访'],['green','已达标'],['yellow','待提升'],['red','未铺货']].map(([status,label])=>`<button class="status-filter ${state.status===status?'active':''}" data-status="${status}" aria-pressed="${state.status===status}">${status?'<i class="dot"></i>':''}${label}</button>`).join('')}</div><select class="select-minimal" data-filter="town" aria-label="按乡镇筛选">${options(TOWN_OPTIONS,state.town,'全部乡镇')}</select></div>`;
}
function mapFooter() {return `<div class="map-footer"><div class="grade-legend"><span class="unvisited"><b>○</b>待走访 / 分级</span><span><b>★</b>A 类门店</span><span><b>▲</b>B 类门店</span><span><b>●</b>C 类门店</span></div><span class="map-mode">${icon('map')}<span id="map-mode-label">琼海乡镇示意图</span><a href="#settings" data-page="settings">接入真实地图 ↗</a></span></div>`;}
function mapControls() {return `<div class="map-controls"><button data-action="map-gps" aria-label="定位我的当前位置" title="我的位置">${icon('navigation')}</button><button data-action="map-fit" aria-label="显示全部筛选门店" title="显示全部门店">${icon('location')}</button><button data-action="map-zoom-in" aria-label="放大地图" title="放大">${icon('plus')}</button><button data-action="map-zoom-out" aria-label="缩小地图" title="缩小">${icon('minus')}</button></div>`;}
function homeMap(){return `<section class="panel overview-map" aria-label="终端网点分布"><div class="panel-header"><div class="panel-title">终端网点分布 <span class="badge lime">琼海试点</span></div><div class="map-title-location">${icon('pin')}海南省 / 琼海市</div></div>${mapToolbar()}<div class="map-stage"><div id="main-map"></div><div class="map-empty-banner" id="map-empty" hidden>当前筛选下没有门店，请切换状态或乡镇</div>${mapControls()}</div>${mapFooter()}</section>`;}
function districtBoard(){const districts=getDistrictSummaries(baseStores(),visibleVisits());return `<section class="panel district-board"><div class="section-heading"><div><h2>市区与乡镇 <span class="badge">12 个乡镇</span></h2><p>按区域开展走访，点击卡片进入该区域门店档案。</p></div><button class="btn text" data-page="outlets">全部门店 ${icon('arrow')}</button></div><div class="district-grid">${districts.map(d=>`<article data-action="open-town" data-town="${esc(d.town)}" class="district-card ${d.town==='乡镇待核实'?'pending-district':''}"><div class="district-card-head"><span class="district-icon">${icon(d.town==='乡镇待核实'?'info':'store')}</span><span class="district-label">${d.town==='嘉积镇'?'市区及周边':d.town==='乡镇待核实'?'归属待核实':'乡镇网点'}</span></div><button class="district-name" data-action="open-town" data-town="${esc(d.town)}">${esc(d.town)}</button><div class="district-count"><strong>${d.total}</strong><span>家门店</span></div><div class="district-metrics"><span>待登记 <b>${d.pendingDisplay}</b></span><span>已走访 <b>${d.displayVisited}</b></span><span>有照片 <b>${d.withPhotos}</b></span></div><div class="district-progress"><span style="width:${d.total?Math.round(d.displayVisited/d.total*100):0}%"></span></div><div class="district-card-footer"><small>${d.demoVisited?'含 '+d.demoVisited+' 家演示走访':d.demo?'含 '+d.demo+' 家演示标记':d.town==='乡镇待核实'?'地址未明示乡镇，待现场核实':d.total?'已核实 '+d.verified+' 家业务资料':'名录待继续补齐'}</small><button data-action="open-town" data-town="${esc(d.town)}" aria-label="进入${esc(d.town)}门店">进入区域 ${icon('arrow')}</button></div></article>`).join('')}</div><p class="district-note">当前为腾讯名录检索快照，数量不代表区域已完整普查；走访进度包含演示记录，演示标记不计入人工核实。</p></section>`;}
function districtContext(){if(!state.town)return '';const d=getDistrictSummaries(baseStores(),visibleVisits()).find(x=>x.town===state.town);if(!d)return '';return `<section class="district-context"><div><button class="btn text" data-page="overview">${icon('grid')}返回区域总览</button><h2>${esc(d.town)} <span class="badge">区域门店档案</span></h2><p>门店 ${d.total} 家 · 待登记 ${d.pendingDisplay} 家 · 已走访 ${d.displayVisited} 家${d.demoVisited?'（含演示 '+d.demoVisited+' 家）':''} · 有照片 ${d.withPhotos} 家</p></div><button class="btn secondary" data-action="all-outlets">查看全部门店</button></section>`;}
function overviewPage() {
  const follow=baseStores().filter(s=>s.status==='unvisited'||s.status==='yellow'||s.status==='red').sort((a,b)=>(a.status==='yellow'?-1:1)-(b.status==='yellow'?-1:1)||daysSince(b.lastVisitAt)-daysSince(a.lastVisitAt));
  const recent=visibleVisits().sort((a,b)=>new Date(b.visitedAt)-new Date(a.visitedAt)).slice(0,4);
  return `${homeMap()}${statsGrid()}${districtBoard()}${catalogNotice()}<section class="panel followup-panel overview-followups"><div class="panel-header"><span class="panel-title">待跟进门店</span><span class="count-label">${follow.length} 家</span></div><div class="follow-list">${follow.slice(0,4).map(s=>`<button class="follow-item" data-action="detail" data-id="${s.id}"><div class="follow-top"><span class="follow-name">${esc(s.name)}</span>${icon('chevron')}</div><p>${esc(s.town)}<span>·</span>${rep(s.repId).name}<span>·</span>${GRADE_META[s.grade]?.label||'待分级'}</p><span class="follow-tag ${s.status}">${s.status==='unvisited'?'待首次实地核实':s.annotationIsDemo?'演示标注 · 未实地核实':s.status==='red'?'暂无产品，待拓展':'SKU / 陈列待提升'}</span></button>`).join('')||'<div class="empty">所有门店均已达标</div>'}</div><div class="follow-footer"><button data-action="followups">查看全部待跟进 ${icon('arrow')}</button></div></section>
  <section class="panel"><div class="panel-header"><div class="panel-title">最近走访 <span class="badge">${visibleVisits().length} 条记录</span></div><button class="btn text" data-page="visits">全部记录 ${icon('arrow')}</button></div>${recent.length?visitTable(recent,true):emptyState('还没有走访记录','新增一条记录，开始维护你的终端门店。','登记走访','new-visit')}</section>`;
}
function filterBar(kind='stores') {
 const compact=matchMedia('(max-width:760px)').matches;
 return `<div class="filters"><div class="input-search">${icon('search')}<input class="field-input" id="list-search" placeholder="${kind==='visits'?'搜索门店、走访备注…':'搜索门店名称、地址…'}" aria-label="${kind==='visits'?'搜索走访记录':'搜索门店档案'}" value="${esc(state.query)}"></div><select class="field-input" data-filter="town" aria-label="乡镇筛选">${options(TOWN_OPTIONS,state.town,'全部乡镇')}</select><select class="field-input" data-filter="status" aria-label="状态筛选">${options(Object.entries(STATUS_META).map(([value,s])=>({value,label:s.label})),state.status,'全部状态')}</select><details class="more-filters" ${compact?'':'open'}><summary>更多筛选 ${icon('down')}</summary><div class="more-filter-content">${kind==='stores'?`<select class="field-input" data-filter="grade" aria-label="级别筛选">${options(['ungraded','A','B','C'].map(value=>({value,label:`${GRADE_META[value].symbol} ${GRADE_META[value].label}`})),state.grade,'全部级别')}</select>`:`<input class="field-input" type="date" data-filter="visitDate" aria-label="走访日期筛选" value="${state.visitDate}">`}${state.role==='admin'?`<select class="field-input" data-filter="repFilter" aria-label="业务员筛选">${options(REPS.map(r=>({value:r.id,label:r.name})),state.repFilter,'全部业务员')}</select>`:''}<button class="btn text filter-reset" data-action="clear-filters">重置筛选</button></div></details></div>`;
}
function outletsPage() {
  const stores=filteredStores(),count=stores.length,start=(state.pageNumber-1)*8;
  if(state.view==='map'&&!stores.some(s=>s.id===state.selected))state.selected=stores[0]?.id||null;
  return `${districtContext()}${catalogNotice()}<section class="panel"><div class="panel-header"><div class="panel-title">终端门店档案 <span class="badge">${count} 家门店</span></div><div class="view-toggle" role="group" aria-label="显示方式"><button class="${state.view==='list'?'active':''}" data-view="list">${icon('list')}列表</button><button class="${state.view==='map'?'active':''}" data-view="map">${icon('map')}地图</button></div></div>${filterBar()}${state.view==='list'?`${stores.length?storeTable(stores.slice(start,start+8)):emptyState('没有找到门店','试试其他筛选条件，或登记一家新门店。','新增门店','new-store')}${pagination(count,8)}`:`<div class="map-layout outlets-map-layout"><div><div class="outlet-map"><div id="main-map"></div><div class="map-empty-banner" id="map-empty" hidden>当前筛选下没有门店</div>${mapControls()}</div>${mapFooter()}</div><div id="selected-store">${selectedContent()}</div></div>`}</section>`;
}
function storeTable(stores) {
  return `${mobileStoreCards(stores,mobileHelpers)}<div class="table-scroll desktop-store-table"><table><thead><tr><th>门店名称 / 地址</th><th>乡镇 / 类型</th><th>铺货状态</th><th>门店级别</th><th>负责人</th><th>最近走访</th><th>操作</th></tr></thead><tbody>${stores.map(s=>`<tr><td><button class="store-cell" data-action="detail" data-id="${s.id}" style="text-align:left;padding:0"><span class="store-icon">${icon(s.type==='老爸茶店'?'coffee':'store')}</span><span><strong>${esc(s.name)}${s.annotationIsDemo?' <span class="badge demo">演示标注</span>':''}</strong><small>${esc(s.address)}</small></span></button></td><td>${esc(s.town)}<br><small class="text-muted" style="font-size:9px;display:block;margin-top:5px">${s.type}</small></td><td>${statusBadge(s.status)}</td><td>${gradeBadge(s.grade)}</td><td>${person(s.repId)}</td><td>${formatDate(s.lastVisitAt)}${s.lastVisitAt?`<small class="source-note" style="display:block">已走访${lastVisitIsDemo(s)?' · 演示':''}</small>`:''}</td><td><button class="row-action" data-action="quick-tag" data-id="${s.id}">改标记</button><button class="row-action" data-action="visit" data-id="${s.id}">走访登记</button><button class="row-action muted" data-action="edit-store" data-id="${s.id}">编辑</button></td></tr>`).join('')}</tbody></table></div>`;
}
function visitTable(visits,compact=false) {
  return `<div class="table-scroll"><table><thead><tr><th>走访门店</th><th>走访时间</th><th>业务员</th><th>门店状态</th>${compact?'':'<th>SKU / 排面</th>'}<th>陈列情况</th><th>操作</th></tr></thead><tbody>${visits.map(v=>{const s=storeById(v.storeId);return `<tr><td><div class="store-cell"><span class="store-icon">${icon(s.type==='老爸茶店'?'coffee':'store')}</span><span><strong>${esc(s.name)}${v.isDemo?' <span class="badge demo">演示走访</span>':''}</strong><small>${esc(s.town)} · ${s.type}</small></span></div></td><td>${formatDate(v.visitedAt,true)}${compact?'':`<small class="${v.locationSource?.startsWith('GPS')?'visit-location-tag':'no-gps'}" style="display:block;margin-top:5px">${v.locationSource?.startsWith('GPS')?'GPS 定位已记录':'未采集现场 GPS'}</small>`}</td><td>${person(v.repId)}</td><td>${statusBadge(v.status)}</td>${compact?'':`<td>${v.skuIds.length} 款 / ${v.facings} 面</td>`}<td>${esc(v.display)}</td><td><button class="row-action" data-action="visit-detail" data-id="${v.id}">查看详情</button></td></tr>`;}).join('')}</tbody></table></div>`;
}
function visitsPage() {
  const visits=filteredVisits(),start=(state.pageNumber-1)*8;
  return `${statsGrid()}<section class="panel"><div class="panel-header"><div class="panel-title">走访记录 <span class="badge">${visits.length} 条</span></div><span class="source-note">演示 ${visits.filter(v=>v.isDemo).length} 条 · 真实 ${visits.filter(v=>!v.isDemo).length} 条</span></div>${filterBar('visits')}${visits.length?visitTable(visits.slice(start,start+8)):emptyState('还没有匹配的走访','调整筛选，或完成一次门店走访登记。','登记走访','new-visit')}${pagination(visits.length,8)}</section>`;
}
function pagination(count,size) {
 const total=Math.max(1,Math.ceil(count/size));const pages=[1,...Array.from({length:5},(_,i)=>state.pageNumber-2+i),total].filter((n,i,arr)=>n>=1&&n<=total&&arr.indexOf(n)===i).sort((a,b)=>a-b);
 return `<div class="table-bottom"><span>共 ${count} 条${count?` · ${(state.pageNumber-1)*size+1}–${Math.min(state.pageNumber*size,count)} 条`:''}</span><div class="pagination"><button data-pagination="${Math.max(1,state.pageNumber-1)}" ${state.pageNumber===1?'disabled':''} aria-label="上一页">‹</button>${pages.map((n,i)=>`${i&&n>pages[i-1]+1?'<span>…</span>':''}<button class="${state.pageNumber===n?'active':''}" data-pagination="${n}" ${state.pageNumber===n?'aria-current="page"':''}>${n}</button>`).join('')}<button data-pagination="${Math.min(total,state.pageNumber+1)}" ${state.pageNumber===total?'disabled':''} aria-label="下一页">›</button></div></div>`;
}
function emptyState(title,desc,button,action) {return `<div class="empty">${icon('store')}<h3>${title}</h3><p>${desc}</p><button class="btn secondary" data-action="${action}">${icon('plus')}${button}</button></div>`;}
function selectedContent() {
  const s=storeById(state.selected);if(!s||!canEdit(s))return '<div class="empty">点击地图上的门店<br>查看详细档案</div>';
  return `${mobileSelectedCard(s,mobileHelpers)}<div class="desktop-selected"><div class="store-selected"><div class="selected-store-heading">门店档案 <span class="badge demo">${s.locationSource?.startsWith('GPS')?'GPS 采集':s.catalogRecord?'腾讯真实名录':'位置待核实'}</span></div><div class="selected-header"><span class="store-icon">${icon('store')}</span><div><h3>${esc(s.name)}</h3><p>${s.type} · ${esc(s.town)}</p></div></div><div class="selected-meta">${statusBadge(s.status)}${gradeBadge(s.grade)}</div><div class="info-row">${icon('pin')}<span>${esc(s.address)}</span></div><div class="info-row">${icon('users')}<span>${esc(s.contact||'未登记联系人')} · 负责人 ${rep(s.repId).name}</span></div><div class="info-row">${icon('clock')}<span>最近走访 ${formatDate(s.lastVisitAt)}</span></div><div class="selected-metrics"><div><strong>${s.skuCount}</strong><small>产品 SKU</small></div><div><strong>${s.facings}</strong><small>陈列排面</small></div><div><strong>${db.visits.filter(v=>v.storeId===s.id).length}</strong><small>累计走访</small></div></div><div class="selected-actions"><button class="btn primary" data-action="quick-tag" data-id="${s.id}">${icon('pin')}快捷改标记</button><button class="btn secondary" data-action="visit" data-id="${s.id}">${icon('clipboard')}走访登记</button><button class="btn secondary" data-action="navigate" data-id="${s.id}">${icon('navigation')}导航</button><button class="btn secondary" data-action="edit-store" data-id="${s.id}">${icon('settings')}编辑档案</button></div><div class="selected-note"><b>跟进备注</b>${esc(s.notes||'暂无备注')}</div></div></div>`;
}
function updateSelected(){const el=$('#selected-store');if(el)el.innerHTML=selectedContent();}
function analyticsPage(){
 const stores=baseStores(),visits=visibleVisits();const keys=['unvisited','green','yellow','red'],counts=keys.map(k=>stores.filter(s=>s.status===k).length),total=stores.length||1;let angle=0;const stops=keys.map((k,i)=>{const start=angle;angle+=counts[i]/total*100;return `${STATUS_META[k].color} ${start}% ${angle}%`;}).join(',');
 return `${catalogNotice()}${statsGrid()}<div class="analytics-grid"><section class="panel"><div class="panel-header"><span class="panel-title">门店标记分布</span><span class="badge demo">包含虚拟标注</span></div><div class="chart-content"><div class="donut-layout"><div class="donut" style="background:conic-gradient(${stops})"><span>${stores.length}<small>真实门店名录</small></span></div><div class="legend-list">${keys.map((k,i)=>`<div class="legend-line"><i class="dot" style="color:${STATUS_META[k].color}"></i>${STATUS_META[k].label}<b>${counts[i]} 家</b></div>`).join('')}</div></div><p class="chart-note">虚拟标注只演示操作，不代表门店实际铺货或经营情况。</p></div></section><section class="panel"><div class="panel-header"><span class="panel-title">数据采集进度</span></div><div class="settings-body"><h3>${CATALOG_META.totalStores} 家去重门店</h3><p>已完成 ${CATALOG_META.queryCount} 组地点检索，按腾讯行政区代码 469002 限定琼海市。当前日额度已用完，剩余查询待后续补齐。<br>已明确乡镇 ${CATALOG_META.totalStores-CATALOG_META.unassignedTownCount} 家，地址未注明乡镇 ${CATALOG_META.unassignedTownCount} 家，不推测归属。<br>累计走访 ${visits.length} 次（演示 ${visits.filter(v=>v.isDemo).length} 次，真实 ${visits.filter(v=>!v.isDemo).length} 次）。</p></div></section></div><section class="panel"><div class="panel-header"><span class="panel-title">名录乡镇分布</span><span class="source-note">乡镇来自腾讯地址原文</span></div><div class="table-scroll"><table><thead><tr><th>乡镇</th><th>真实门店</th><th>未走访</th><th>人工已标记</th><th>虚拟业务标注</th></tr></thead><tbody>${TOWN_OPTIONS.map(t=>{const ss=stores.filter(s=>s.town===t);return `<tr><td>${t}</td><td>${ss.length} 家</td><td>${ss.filter(s=>s.status==='unvisited').length} 家</td><td>${ss.filter(s=>s.userAnnotation).length} 家</td><td>${ss.filter(s=>s.annotationIsDemo).length} 家</td></tr>`;}).join('')}</tbody></table></div></section>`;
}
function teamPage() {
  return `<div class="notice">${icon('info')}<span>当前提供演示身份切换与门店负责人分配。正式上线时需接入账号登录，并由服务端执行管理员与业务员权限。</span></div><div class="staff-grid">${REPS.filter(r=>state.role==='admin'||r.id===state.repId).map(r=>{const ss=baseStores().filter(s=>s.repId===r.id),vv=visibleVisits().filter(v=>v.repId===r.id);return `<section class="staff-card"><div class="staff-card-header"><span class="avatar">${r.initials}</span><div><h3>${r.name}</h3><p>市场业务员 · 琼海试点</p></div><span class="badge lime" style="margin-left:auto">演示</span></div><div class="staff-card-stats"><div><strong>${ss.length}</strong><small>负责门店</small></div><div><strong>${vv.length}</strong><small>累计走访</small></div></div><p style="margin-bottom:18px;line-height:1.8">负责区域：${[...new Set(ss.map(s=>s.town))].join('、')||'暂无'}</p><button class="btn secondary" data-action="rep-stores" data-id="${r.id}" style="width:100%">查看负责门店 ${icon('arrow')}</button></section>`;}).join('')}</div>`;
}
function sharePanel() {
  const local=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
  return `<section class="panel" style="margin-top:20px"><div class="panel-header"><span class="panel-title">${icon('external')}分享给异地客户</span><span class="badge ${local?'demo':'lime'}">${local?'当前仅本机可见':'当前站点地址'}</span></div><div class="settings-body"><p>${local?'localhost 地址仅供本机访问。将发布包部署到公开静态网站后，客户可直接通过 HTTPS 链接打开应用。':'发布网址：'+esc(new URL('./',location.href).href)+'。客户可直接打开应用，无需登录托管平台。'}</p><div class="actions" style="margin-top:17px"><a class="btn secondary" href="./SHARE_GUIDE.md" target="_blank" rel="noopener">${icon('file')}固定链接发布指引</a>${local?'<a class="btn secondary" href="https://pages.github.com/" target="_blank" rel="noopener">GitHub Pages 发布说明 ↗</a>':'<button class="btn primary" data-action="copy-share-url">复制展示链接</button>'}</div><p style="margin-top:14px">将实际网站主机名加入“力神图引”的授权域名。当前各浏览器的数据独立保存；多人同步需要后端数据库。</p></div></section>`;
}
function settingsPage(){
 const preview=getDemoAnnotationPreview(db);
 return `<div class="settings-grid"><div><section class="panel"><div class="panel-header"><span class="panel-title">腾讯地图 · ${APP_CONFIG.mapKeyName}</span><span class="badge lime">已配置网页地图 Key</span></div><div class="settings-body"><form id="key-form"><label for="tencent-key">JavaScript GL Key</label><input class="field-input key-input" id="tencent-key" name="tencentKey" autocomplete="off" value="${esc(db.settings.tencentKey)}"><p>已在本机加载真实地图。上线后，请将实际主机名加入腾讯控制台授权域名。地点检索和地图底图分别受平台配额限制。</p><div class="actions" style="margin-top:17px"><button class="btn primary" type="submit">保存并测试地图</button><button class="btn secondary" type="button" data-action="clear-key">清除 Key</button></div><div id="key-status" class="key-status" aria-live="polite"></div></form><div class="mini-map" id="key-test-map" hidden></div></div></section><section class="panel" style="margin-top:20px"><div class="panel-header"><span class="panel-title">真实名录来源</span><span class="badge demo">阶段性检索快照</span></div><div class="settings-body"><h3>琼海市 ${CATALOG_META.totalStores} 家茶饮相关门店</h3><p>来源：腾讯地点检索 WebService<br>采集：${formatDate(CATALOG_META.fetchedAt,true)} · GCJ-02 坐标<br>限定行政区代码：469002<br>已完成 ${CATALOG_META.queryCount} 组检索，当前日额度已用完，后续补齐。此名录不是线下普查，地图遗漏、停业与更新延迟需现场核实。<br>乡镇未在地址中明确出现的 ${CATALOG_META.unassignedTownCount} 家标为“乡镇待核实”。</p><p style="margin-top:14px">名称、地址、电话和坐标为地图信息；铺货、陈列、分级与联系人不会从地图推定。</p><a class="btn text" href="./CATALOG_GUIDE.md" target="_blank" rel="noopener">名录范围与补齐说明 ↗</a></div></section><section class="panel" style="margin-top:20px"><div class="panel-header"><span class="panel-title">业务标记规则</span><span class="badge demo">达标标准待确认</span></div><div class="settings-body"><table class="standards-table"><tbody>${Object.entries(STATUS_META).map(([k,v])=>`<tr><td>${statusBadge(k)}</td><td>${v.description}</td></tr>`).join('')}</tbody></table><p style="margin-top:14px">A ★ / B ▲ / C ●。未走访默认灰色，未分级显示 ○。正式达标和分级标准尚未提供，保留人工修改。</p></div></section></div><div>${sharePanel()}<section class="panel" style="margin-top:20px"><div class="panel-header"><span class="panel-title">演示标注与数据备份</span></div><div class="settings-body"><p>真实门店名录保留，当前有 ${preview.annotationsToClear} 家可清除的演示标记、${preview.visitsToDelete} 条演示走访。场景按约 60% 门店已走访、约一半门店随机分级生成，可一键清除；你的登记、照片和真实走访会保留。</p>${state.role==='admin'?`<div class="actions" style="margin-top:17px"><button class="btn danger" data-action="clear-demo" ${!preview.annotationsToClear&&!preview.visitsToDelete?'disabled':''}>${icon('minus')}一键清除演示标注</button><button class="btn secondary" data-action="add-demo">重新生成演示场景</button></div>`:''}<div class="settings-section"><h3>浏览器数据备份</h3><p>门店标记和照片暂存在当前浏览器，不会自动共享给其他客户或业务员。JSON 备份含完整记录及网页地图 Key。</p><div class="actions" style="margin-top:17px"><button class="btn secondary" data-action="backup">${icon('download')}导出 JSON 备份</button>${state.role==='admin'?'<button class="btn secondary" data-action="import">恢复备份</button>':''}</div></div></div></section></div></div>`;
}

// Drawers and forms are mounted independently so edits do not interrupt the map.
function openDrawer(title,desc,body,footer,formId='') {
  closeModal(false);returnFocus=document.activeElement;modalToken++;
  $('#overlay-root').innerHTML=`<div class="dialog-backdrop"><section class="drawer" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><header class="dialog-header"><div><h2 id="dialog-title">${esc(title)}</h2><p>${esc(desc)}</p></div><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon('close')}</button></header>${formId?`<form id="${formId}" class="drawer-form">`:''}<div class="drawer-body">${body}</div><footer class="drawer-footer">${footer}</footer>${formId?'</form>':''}</section></div>`;
  document.body.style.overflow='hidden';setTimeout(()=>$('#overlay-root input:not([type=hidden]),#overlay-root select,#overlay-root button')?.focus(),40);
}
function closeModal(restore=true) {
  formMap?.destroy();formMap=null;modalToken++;activeModal=null;$('#overlay-root').innerHTML='';document.body.style.overflow='';if(restore&&returnFocus?.isConnected)returnFocus.focus();
}
function openSmallModal(title,desc,body) {
  closeModal(false);returnFocus=document.activeElement;modalToken++;
  $('#overlay-root').innerHTML=`<div class="dialog-backdrop"><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><button class="icon-button" data-action="close-modal" style="position:absolute;right:16px;top:16px" aria-label="关闭">${icon('close')}</button><h2 id="dialog-title">${esc(title)}</h2><p>${esc(desc)}</p>${body}</section></div>`;
  document.body.style.overflow='hidden';setTimeout(()=>$('#overlay-root button')?.focus(),30);
}
function field(label,name,value='',type='text',attrs='') {return `<div class="field"><label for="f-${name}">${label}${attrs.includes('required')?'<span class="required">*</span>':''}</label><input id="f-${name}" class="field-input" type="${type}" name="${name}" value="${esc(value)}" ${attrs}></div>`;}
function selectField(label,name,values,current='',allLabel) {return `<div class="field"><label for="f-${name}">${label}</label><select class="field-input" name="${name}" id="f-${name}">${options(values,current,allLabel)}</select></div>`;}
function statusChoices(status) {return `<div class="field full"><label>铺货与陈列状态</label><div class="status-options">${Object.entries(STATUS_META).map(([s,m])=>`<label class="choice-card"><input type="radio" name="status" value="${s}" ${status===s?'checked':''}><i class="dot ${s}"></i>${m.label}</label>`).join('')}</div><small>根据现场情况手动登记；正式达标标准待业务方确认。</small></div>`;}
function quickTagForm(id){
 const s=storeById(id);if(!canEdit(s))return;
 openDrawer('快捷修改门店标记',`${s.name} · ${s.town}`,`<div class="notice ${s.annotationIsDemo?'warning':''}">${icon('info')}<span>${s.annotationIsDemo?'当前为虚拟业务标注。保存后将转换为你的人工记录。':'只更新业务标记，不生成到店定位或走访记录；详细 SKU 和陈列可随后登记。'}</span></div><div class="form-grid">${statusChoices(s.status)}<div class="field full"><label>门店级别</label><div class="status-options">${Object.entries(GRADE_META).map(([g,m])=>`<label class="choice-card"><input type="radio" name="grade" value="${g}" ${s.grade===g?'checked':''}>${m.symbol} ${m.label}</label>`).join('')}</div></div><div class="field full"><label for="f-notes">跟进备注</label><textarea class="field-input" name="notes" id="f-notes" maxlength="600" placeholder="记录本次判断和下一步跟进…">${esc(s.annotationIsDemo?'':s.notes)}</textarea></div></div>`,`<span class="source-note">真实名称与位置保留</span><div class="actions"><button type="button" class="btn secondary" data-action="close-modal">取消</button><button type="submit" class="btn primary">保存标记</button></div>`,'marker-form');activeModal={type:'marker',id};
}
function saveMarker(form){
 const s=storeById(activeModal?.id);if(!canEdit(s))return;const f=new FormData(form);
 const fields={status:f.get('status'),grade:f.get('grade'),notes:f.get('notes').trim()};
 if(!STATUS_META[fields.status]||!GRADE_META[fields.grade])return;
 if(fields.status==='red')Object.assign(fields,{skuCount:0,skuIds:[],facings:0,display:'未陈列'});
 if(commit(next=>{const i=next.stores.findIndex(x=>x.id===s.id);next.stores[i]={...markUserAnnotation(next.stores[i],fields),updatedAt:new Date().toISOString()};})){closeModal();render();notify('门店标记已保存，可继续登记走访');}
}
function mapGPS(button){
 if(!navigator.geolocation){notify('当前浏览器不支持定位',true);return;}
 const currentMap=mainMap;button.disabled=true;
 navigator.geolocation.getCurrentPosition(pos=>{button.disabled=false;if(!currentMap||currentMap!==mainMap)return;const [lng,lat]=wgs84ToGcj02(pos.coords.longitude,pos.coords.latitude);currentMap.locate(lng,lat,{accuracy:pos.coords.accuracy});notify(`已定位当前位置，估算精度约 ${Math.round(pos.coords.accuracy)} 米`);},error=>{button.disabled=false;notify(error.code===1?'请在手机浏览器允许本网站访问位置后重试':'暂时无法定位，请检查手机定位开关和 HTTPS 访问地址',true);},{enableHighAccuracy:true,timeout:15000,maximumAge:0});
}
function storePhotoGroup(group,photos,editable=false) {
  const items=photos[group]||[];
  return `<section class="photo-manager" data-photo-group="${group}"><div class="photo-manager-heading"><h3>${PHOTO_GROUPS[group]} <span class="badge">${items.length} / ${STORE_PHOTO_LIMITS.maxPerGroup}</span></h3>${editable?`<div class="store-photo-tools"><label class="btn secondary" for="photo-library-${group}">${icon('plus')}选照片<input class="photo-file-input" id="photo-library-${group}" type="file" accept="image/jpeg,image/png,image/webp" multiple data-store-photo-input="${group}"></label><label class="btn primary" for="photo-camera-${group}">${icon('camera')}拍照<input class="photo-file-input" id="photo-camera-${group}" type="file" accept="image/*" capture="environment" data-store-photo-input="${group}"></label></div>`:''}</div>${items.length?`<div class="store-photo-grid">${items.map((p,i)=>`<figure class="store-photo-item"><button type="button" data-action="view-photo" data-photo="${esc(p.src)}" data-photo-title="${PHOTO_GROUPS[group]} ${i+1}" aria-label="查看${PHOTO_GROUPS[group]} ${i+1}"><img src="${esc(p.src)}" alt="${PHOTO_GROUPS[group]} ${i+1}" loading="lazy"></button>${editable?`<figcaption class="store-photo-tools"><label class="btn secondary small" for="photo-replace-${p.id}">更换<input class="photo-file-input" id="photo-replace-${p.id}" type="file" accept="image/jpeg,image/png,image/webp" data-store-photo-input="${group}" data-replace-id="${p.id}"></label><button type="button" class="btn text small" data-action="remove-store-photo" data-group="${group}" data-photo-id="${p.id}" aria-label="移除${PHOTO_GROUPS[group]} ${i+1}">移除</button></figcaption>`:''}</figure>`).join('')}</div>`:`<div class="store-photo-empty">${icon('camera')}<span>暂无${PHOTO_GROUPS[group]}${editable?'，可拍照或从相册添加':''}</span></div>`}</section>`;
}
function storePhotosEditor(photos){return `<div id="store-photos-editor">${Object.keys(PHOTO_GROUPS).map(group=>storePhotoGroup(group,photos,true)).join('')}<p class="source-note">两组各最多 6 张，自动压缩；点击保存后保留在当前浏览器。取消不会改变已保存照片。</p><p id="store-photo-processing" class="source-note" role="status"></p></div>`;}
function refreshStorePhotoEditor(){
  if(!activeModal?.storePhotos||!$('#store-photos-editor'))return;
  $('#store-photos-editor').outerHTML=storePhotosEditor(activeModal.storePhotos);
  $('#store-photo-processing').textContent=activeModal.processingPhotos?'正在压缩照片，请稍候…':'';
  document.querySelectorAll('[data-store-photo-input], [data-action="remove-store-photo"],#store-form button[type="submit"],#store-photos-form button[type="submit"]').forEach(el=>el.disabled=!!activeModal.processingPhotos);
}
async function processStorePhotos(files,group,replaceId){
  const modal=activeModal,token=modalToken;
  if(!modal?.storePhotos||modal.processingPhotos||!Object.hasOwn(PHOTO_GROUPS,group)||!files.length)return;
  if((replaceId?modal.storePhotos[group].length:modal.storePhotos[group].length+files.length)>STORE_PHOTO_LIMITS.maxPerGroup){notify(PHOTO_GROUPS[group]+'最多保存 6 张，请先移除旧照片。',true);refreshStorePhotoEditor();return;}
  modal.processingPhotos=true;refreshStorePhotoEditor();
  try{
    const added=[];for(const file of (replaceId?files.slice(0,1):files))added.push(await compressStorePhoto(file));
    if(token!==modalToken||activeModal!==modal)return;
    const photos=structuredClone(modal.storePhotos);
    if(replaceId){const i=photos[group].findIndex(p=>p.id===replaceId);if(i<0)throw Error('照片已变更，请重新选择。');photos[group][i]=added[0];}else photos[group].push(...added);
    validateStorePhotos({photos});modal.storePhotos=photos;
  }catch(error){if(token===modalToken)notify(error.message||'照片读取失败，请重新选择。',true);}
  finally{if(token===modalToken&&activeModal===modal){modal.processingPhotos=false;refreshStorePhotoEditor();}}
}
function openPhotoManager(id){
  const s=storeById(id);if(!canEdit(s))return;
  const photos=normalizeStorePhotos(s);
  openDrawer('门店照片',s.name+' · '+s.town,`<div id="form-error"></div>${storePhotosEditor(photos)}`,`<button type="button" class="btn secondary" data-action="detail" data-id="${s.id}">返回档案</button><div class="actions"><button type="button" class="btn secondary" data-action="close-modal">取消</button><button type="submit" class="btn primary">${icon('check')}保存照片</button></div>`,'store-photos-form');
  activeModal={type:'store-photos',id,storePhotos:photos,processingPhotos:false};
}
function saveStorePhotos(){
  const modal=activeModal,s=storeById(modal?.id);if(!canEdit(s))return;
  if(modal.processingPhotos){formError('照片正在处理，请稍后保存。');return;}
  try{validateStorePhotos({photos:modal.storePhotos});}catch(error){formError(error.message);return;}
  if(commit(next=>Object.assign(next.stores.find(item=>item.id===s.id),{photos:structuredClone(modal.storePhotos),photosUpdatedAt:new Date().toISOString()}))){closeModal();render();showDetail(s.id);notify('门头与陈列照片已保存');}
}
let photoViewerFocus=null;
function closePhotoViewer(){const viewer=$('.photo-lightbox');if(!viewer)return;viewer.remove();if(photoViewerFocus?.isConnected)photoViewerFocus.focus();photoViewerFocus=null;}
function openPhotoViewer(src,title='现场照片'){
  if(!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(src||''))return;
  closePhotoViewer();photoViewerFocus=document.activeElement;
  const viewer=document.createElement('section');viewer.className='photo-lightbox';viewer.setAttribute('role','dialog');viewer.setAttribute('aria-modal','true');viewer.setAttribute('aria-label',title);
  viewer.innerHTML=`<button type="button" class="icon-button" data-action="close-photo-viewer" aria-label="关闭照片预览">${icon('close')}</button><figure><img src="${esc(src)}" alt="${esc(title)}"><figcaption>${esc(title)}</figcaption></figure>`;
  $('#overlay-root').append(viewer);viewer.querySelector('button').focus();
}
function storeForm(id) {
  const existing=storeById(id);if(id&&!canEdit(existing)){notify('当前身份无权编辑此门店',true);return;}
  const s=existing||{name:'',town:state.town||'嘉积镇',type:'茶饮店',address:'',contact:'',phone:'',repId:state.role==='rep'?state.repId:'',status:'unvisited',grade:'ungraded',lng:'',lat:'',display:'未登记',skuCount:0,facings:0,notes:''};
  openDrawer(id?'编辑门店':'登记一家新门店','完善终端档案，标记门店位置。带 * 的项目为必填。',`<div id="form-error"></div><div class="form-grid">${field('门店名称','name',s.name,'text','required maxlength="60" placeholder="例如：万泉里老爸茶"')}${selectField('门店类型','type',STORE_TYPES,s.type)}${selectField('所属乡镇','town',TOWN_OPTIONS,s.town)}${selectField('门店级别','grade',['ungraded','A','B','C'].map(g=>({value:g,label:`${GRADE_META[g].symbol} ${GRADE_META[g].label}`})),s.grade)}<div class="field full"><label for="f-address">详细地址 <span class="required">*</span></label><input id="f-address" name="address" class="field-input" required maxlength="180" placeholder="填写街道、门牌号或地标" value="${esc(s.address)}"></div>${field('联系人','contact',s.contact,'text','maxlength="30"')}${field('联系电话','phone',s.phone,'tel','maxlength="25" placeholder="选填"')}${state.role==='admin'?selectField('负责业务员','repId',[{value:'',label:'未分配'},...REPS.map(r=>({value:r.id,label:r.name}))],s.repId):`<input type="hidden" name="repId" value="${state.repId}">`}${statusChoices(s.status)}<div class="form-divider">${icon('pin')}门店位置 <button class="btn text" type="button" data-action="store-gps" style="margin-left:auto">${icon('location')}获取当前位置</button></div>${field('经度（GCJ-02）','lng',s.lng,'number','required min="73" max="135" step="any" placeholder="110.469200"')}${field('纬度（GCJ-02）','lat',s.lat,'number','required min="3" max="54" step="any" placeholder="19.246900"')}<div class="field full"><div class="location-result" id="store-location-result">${id?`当前来源：${esc(s.locationSource||'演示坐标 / 待核实')}`:'可获取 GPS、填写 GCJ-02 坐标，或在下方示意图点击选点。示意选点仅供演示。'}</div><div class="mini-map"><div id="form-map"></div></div><small>GPS 获取后已转为 GCJ-02；请在门店现场核实。示意底图无法用于验证真实地址。</small></div><div class="form-divider">${icon('store')}当前陈列档案</div>${field('产品 SKU 数量','skuCount',s.skuCount,'number','required min="0" max="100" step="1"')}${field('陈列排面','facings',s.facings,'number','required min="0" max="999" step="1"')}${selectField('陈列位置','display',['未登记','未陈列','货架陈列','端架陈列','收银台陈列'],s.display)}<div class="field full"><label for="f-notes">门店备注</label><textarea class="field-input" id="f-notes" name="notes" maxlength="600" placeholder="记录铺货意向、补货需求、下次跟进事项…">${esc(s.notes)}</textarea></div><div class="field full">${storePhotosEditor(normalizeStorePhotos(s))}</div></div>`,`${id&&state.role==='admin'?`<button class="btn danger small" type="button" data-action="delete-store" data-id="${id}">删除门店</button>`:'<span class="source-note">本地保存 · 演示环境</span>'}<div class="actions"><button class="btn secondary" type="button" data-action="close-modal">取消</button><button class="btn primary" type="submit">${icon('check')}保存门店</button></div>`,'store-form');
  activeModal={type:'store',id,storePhotos:normalizeStorePhotos(s),processingPhotos:false,locationSource:s.locationSource|| (id?'演示坐标 / 待核实':'手动填写 GCJ-02'),accuracy:s.accuracy||null,gpsCoords:null};
  formMap=new StoreMap($('#form-map'),{onCoordinate:pos=>{if(activeModal?.type!=='store')return;$('#f-lng').value=pos.lng.toFixed(6);$('#f-lat').value=pos.lat.toFixed(6);activeModal.locationSource=pos.source==='tencent'?'腾讯地图选点（GCJ-02）':'示意图选点（待现场核实）';activeModal.accuracy=null;activeModal.gpsCoords=null;$('#store-location-result').textContent=`${activeModal.locationSource}：${pos.lng.toFixed(6)}, ${pos.lat.toFixed(6)}`;formMap.setStores([{...s,id:'draft',lng:pos.lng,lat:pos.lat,name:$('#f-name').value||'新门店'}]);}});
  if(id){formMap.setStores([s]);formMap.setCenter(s.lng,s.lat);}if(db.settings.tencentKey)activateMap(formMap,db.settings.tencentKey);
}
function visitForm(storeId) {
  const stores=baseStores();if(!stores.length){notify('先登记一家门店，再记录走访');storeForm();return;}
  const s=storeById(storeId)||stores[0];if(!canEdit(s)){notify('当前身份无权登记此门店',true);return;}
  openDrawer('走访登记','记录真实现场情况，提交后同步更新门店状态与陈列档案。',`<div id="form-error"></div><div class="form-grid"><div class="field full"><label for="f-storeId">走访门店</label><select class="field-input" name="storeId" id="f-storeId">${options(stores.map(s=>({value:s.id,label:`${s.name} · ${s.town}`})),s.id)}</select></div>${selectField('走访业务员','repId',REPS.filter(r=>state.role==='admin'||r.id===state.repId).map(r=>({value:r.id,label:r.name})),state.role==='rep'?state.repId:(s.repId||REPS[0].id))}${selectField('门店级别','grade',['ungraded','A','B','C'].map(g=>({value:g,label:`${GRADE_META[g].symbol} ${GRADE_META[g].label}`})),s.grade)}${statusChoices(s.status)}<div class="form-divider">${icon('coffee')}产品与陈列</div><div class="field full"><label>在售力神产品 SKU</label><div class="sku-options">${PRODUCTS.map((p,i)=>`<label class="sku-option"><input type="checkbox" name="skuIds" value="${p.id}" ${storeSkuIds(s).includes(p.id)?'checked':''}><span>${p.name}<small style="display:block;font-size:8px;margin-top:4px">${p.spec}</small></span></label>`).join('')}</div><small>产品名称与规格为演示资料，正式使用前需确认产品目录。</small></div>${field('陈列排面数','facings',s.facings,'number','required min="0" max="999" step="1"')}${selectField('库存情况','stock',['未登记','充足','偏低','缺货'],s.stock||'未登记')}${selectField('陈列位置','display',['未登记','未陈列','货架陈列','端架陈列','收银台陈列'],s.display)}<div class="form-divider">${icon('location')}现场定位 <button class="btn text" type="button" data-action="visit-gps" style="margin-left:auto">获取当前位置 ${icon('location')}</button></div><div class="field full"><div class="location-result" id="visit-location-result">尚未采集现场 GPS。允许提交未定位记录，系统会如实标注。</div><small>点击后浏览器将请求定位权限。坐标只用于本次走访登记，不持续追踪。</small></div><div class="form-divider">${icon('camera')}现场照片 <span class="source-note" style="margin-left:auto">最多 3 张</span></div><div class="field full"><label class="photo-upload" for="visit-photos">${icon('camera')}<span>添加门头 / 陈列 / 库存照片<small>选择照片或使用手机相机 · JPEG / PNG / WebP</small></span></label><input id="visit-photos" class="hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple><div id="photo-previews" class="photo-previews"></div><small>照片会压缩后保存在当前浏览器，导出 JSON 备份可一并保存。</small></div><div class="field full"><label for="f-notes">走访备注 / 下次跟进</label><textarea class="field-input" id="f-notes" name="notes" maxlength="600" placeholder="例如：椰香款库存偏低，下次走访跟进补货…"></textarea></div></div>`,`<span class="source-note">登记时间：提交时自动记录</span><div class="actions"><button class="btn secondary" type="button" data-action="close-modal">取消</button><button class="btn primary" type="submit">${icon('check')}提交走访</button></div>`,'visit-form');
  activeModal={type:'visit',storeId:s.id,photos:[],gps:null,processing:false};
}
function showDetail(id) {
  const s=storeById(id);if(!canEdit(s))return;
  const visits=db.visits.filter(v=>v.storeId===id).sort((a,b)=>new Date(b.visitedAt)-new Date(a.visitedAt));
  openDrawer(s.name,`${s.town} · ${s.type} · ${s.id}`,`<div class="detail-section"><div class="detail-status">${statusBadge(s.status)}${gradeBadge(s.grade)}${s.annotationIsDemo?'<span class="badge demo">演示业务标注 · 未核实</span>':''}</div><dl class="detail-info" style="margin-top:23px"><div class="full"><dt>详细地址</dt><dd>${esc(s.address)}</dd></div><div><dt>负责业务员</dt><dd>${rep(s.repId).name}</dd></div><div><dt>联系人</dt><dd>${esc(s.contact||'未登记')}</dd></div><div><dt>联系电话</dt><dd>${esc(s.phone||'未登记')}</dd></div><div><dt>最近走访</dt><dd>${formatDate(s.lastVisitAt,true)}${lastVisitIsDemo(s)?' <span class="badge demo">演示走访</span>':''}</dd></div><div class="full"><dt>门店坐标（GCJ-02）</dt><dd>${Number(s.lng).toFixed(6)}, ${Number(s.lat).toFixed(6)}<small class="source-note" style="display:block">${esc(s.locationSource||'演示坐标 / 待现场核实')}</small></dd></div></dl></div><div class="detail-section"><h3>当前产品与陈列</h3><div class="selected-metrics" style="margin-top:0"><div><strong>${s.skuCount}</strong><small>在售 SKU</small></div><div><strong>${s.facings}</strong><small>陈列排面</small></div><div><strong>${visits.length}</strong><small>累计走访</small></div></div><p class="source-note" style="margin-top:17px">陈列位置：${esc(s.display)}<br>跟进备注：${esc(s.notes||'暂无')}</p></div><div class="detail-section"><div class="photo-manager-heading"><h3>门店照片</h3><button type="button" class="btn primary" data-action="store-photos" data-id="${s.id}">${icon('camera')}拍照 / 管理</button></div>${Object.keys(PHOTO_GROUPS).map(group=>storePhotoGroup(group,normalizeStorePhotos(s))).join('')}</div><div class="detail-section"><h3>走访动态</h3>${visits.length?`<div class="timeline">${visits.map(v=>timelineItem(v)).join('')}</div>`:'<p class="source-note">尚无走访，登记第一条现场记录吧。</p>'}</div>`,`<button class="btn secondary" data-action="navigate" data-id="${s.id}">${icon('navigation')}打开导航</button><div class="actions"><button class="btn secondary" data-action="edit-store" data-id="${s.id}">编辑档案</button><button class="btn primary" data-action="visit" data-id="${s.id}">${icon('clipboard')}登记走访</button></div>`);
  activeModal={type:'detail',id};
}
function timelineItem(v) {return `<div class="timeline-item"><h4>${formatDate(v.visitedAt,true)} · ${rep(v.repId).name}${v.isDemo?' <span class="badge demo">演示走访</span>':''}</h4><div style="margin-top:10px;display:flex;gap:9px">${statusBadge(v.status)}${gradeBadge(v.grade)}</div><p>${v.skuIds.length} 款 SKU · ${v.facings} 个排面 · ${esc(v.display)} · 库存${esc(v.stock)}<br>${esc(v.notes||'无补充备注')}<br><span class="source-note">${esc(v.locationSource||'未采集现场 GPS')}${v.accuracy?` · 精度约 ${Math.round(v.accuracy)} 米`:''}${v.locationSource?.startsWith('GPS')?`<br>GCJ-02：${v.lng.toFixed(6)}, ${v.lat.toFixed(6)}`:''}</span></p>${photoGallery(v.photos)}</div>`;}
function photoGallery(photos) {return photos?.length?`<div class="timeline-photos">${photos.map((p,i)=>`<button data-action="view-photo" data-photo="${p}" aria-label="查看现场照片 ${i+1}" style="padding:0"><img src="${p}" alt="现场登记照片 ${i+1}" loading="lazy"></button>`).join('')}</div>`:'';}
function showVisit(id) {
  const v=visibleVisits().find(v=>v.id===id);if(!v)return;const s=storeById(v.storeId);
  openDrawer('走访详情',`${s.name} · ${formatDate(v.visitedAt,true)}`,`<div class="notice">${icon('clipboard')}<span>${v.isDemo?'本条为虚构演示走访，时间、业务员和业务状态均为模拟，不代表真实到店。':'以下信息为本次走访提交时的记录，后续门店档案变更不影响此记录。'}</span></div>${timelineItem(v)}<div class="detail-section"><h3>在售产品</h3><p class="source-note">${v.skuIds.map(id=>PRODUCTS.find(p=>p.id===id)?.name||id).map(esc).join('、')||'无在售力神产品'}</p></div><div class="detail-section"><h3>定位记录</h3><p class="source-note">${esc(v.locationSource||'未采集现场 GPS')}<br>${v.locationSource?.startsWith('GPS')?`坐标（GCJ-02）：${v.lng.toFixed(6)}, ${v.lat.toFixed(6)}<br>估算精度：约 ${Math.round(v.accuracy)} 米`:'未记录 GPS 定位证据；门店档案坐标不代表本次现场到访。'}</p></div>`,`<button class="btn secondary" data-action="detail" data-id="${s.id}">查看门店档案</button><button class="btn primary" data-action="visit" data-id="${s.id}">再次走访 ${icon('arrow')}</button>`);
  activeModal={type:'visit-detail',id};
}
function roleDialog() {openSmallModal('切换演示身份','用于体验不同工作视角。当前未接入真实登录及服务端权限。',`<div class="role-choices"><button class="role-choice ${state.role==='admin'?'active':''}" data-role="admin"><span class="avatar">管</span><span><strong>市场管理员</strong><small>查看全部门店、分配负责人、备份与恢复</small></span>${icon('chevron')}</button>${REPS.map(r=>`<button class="role-choice ${state.role==='rep'&&state.repId===r.id?'active':''}" data-role="rep" data-id="${r.id}"><span class="avatar">${r.initials}</span><span><strong>${r.name} · 业务员</strong><small>查看负责门店，登记走访与调整状态</small></span>${icon('chevron')}</button>`).join('')}</div><p class="role-note">演示身份不会产生真实账号，浏览器中的原始数据仍可访问。</p>`);}

// Geographic evidence is only stored after an explicit user action.
async function captureLocation(button,mode) {
  if(!navigator.geolocation){notify('当前浏览器不支持定位，请手动填写门店坐标。',true);return;}
  const token=modalToken,request=(activeModal.gpsRequest||0)+1;activeModal.gpsRequest=request;
  const old=button.innerHTML;button.disabled=true;button.innerHTML='正在定位…';
  navigator.geolocation.getCurrentPosition(pos=>{
    if(token!==modalToken||request!==activeModal?.gpsRequest)return;
    const {latitude:lat,longitude:lng,accuracy}=pos.coords;const converted=wgs84ToGcj02(lng,lat),coords={lng:converted[0],lat:converted[1],accuracy,rawLng:lng,rawLat:lat,capturedAt:new Date().toISOString()};
    if(mode==='store'){
      $('#f-lng').value=coords.lng.toFixed(6);$('#f-lat').value=coords.lat.toFixed(6);activeModal.locationSource='GPS 采集（WGS84 转 GCJ-02）';activeModal.accuracy=accuracy;activeModal.gpsCoords={lng:Number($('#f-lng').value),lat:Number($('#f-lat').value)};
      $('#store-location-result').textContent=`GPS 已获取 · 估算精度约 ${Math.round(accuracy)} 米${accuracy>100?'，精度较低，请在室外核实':''}`;$('#store-location-result').classList.add('has-location');formMap?.locate(coords.lng,coords.lat);
    }else{activeModal.gps=coords;$('#visit-location-result').textContent=`GPS 现场定位已记录：${coords.lng.toFixed(6)}, ${coords.lat.toFixed(6)} · 估算精度约 ${Math.round(accuracy)} 米${accuracy>100?'（精度较低，请核实）':''}`;$('#visit-location-result').classList.add('has-location');}
    button.disabled=false;button.innerHTML=old;
  },error=>{
    if(token!==modalToken||request!==activeModal?.gpsRequest)return;button.disabled=false;button.innerHTML=old;
    const msg=error.code===1?'定位权限未开启，请在浏览器地址栏允许定位后重试。':error.code===2?'暂时无法获取位置，请检查设备定位或移动到室外。':'定位超时，请检查定位权限并重试。';notify(msg,true);
  },{enableHighAccuracy:true,timeout:18000,maximumAge:0});
}
export function wgs84ToGcj02(lng,lat) {
  if(lng<72.004||lng>137.8347||lat<0.8293||lat>55.8271)return [lng,lat];
  const pi=Math.PI,a=6378245,ee=0.006693421622965943,x=lng-105,y=lat-35;
  let dlat=-100+2*x+3*y+.2*y*y+.1*x*y+.2*Math.sqrt(Math.abs(x));
  dlat+=(20*Math.sin(6*x*pi)+20*Math.sin(2*x*pi))*2/3+(20*Math.sin(y*pi)+40*Math.sin(y/3*pi))*2/3+(160*Math.sin(y/12*pi)+320*Math.sin(y*pi/30))*2/3;
  let dlng=300+x+2*y+.1*x*x+.1*x*y+.1*Math.sqrt(Math.abs(x));
  dlng+=(20*Math.sin(6*x*pi)+20*Math.sin(2*x*pi))*2/3+(20*Math.sin(x*pi)+40*Math.sin(x/3*pi))*2/3+(150*Math.sin(x/12*pi)+300*Math.sin(x/30*pi))*2/3;
  const rad=lat/180*pi,magic=1-ee*Math.sin(rad)**2,sqrt=Math.sqrt(magic);
  return [lng+dlng*180/(a/sqrt*Math.cos(rad)*pi),lat+dlat*180/((a*(1-ee))/(magic*sqrt)*pi)];
}
async function processPhotos(files) {
  if(activeModal?.type!=='visit')return;
  const token=modalToken;
  if(activeModal.processing)return;
  if(activeModal.photos.length+files.length>3){notify('每次走访最多上传 3 张照片。',true);return;}
  activeModal.processing=true;
  const upload=$('.photo-upload');upload.style.opacity='.5';
  try{
    const result=[];
    for(const file of files){
      if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('仅支持 JPEG、PNG、WebP 图片。');
      if(file.size>15*1024*1024)throw new Error('单张照片请小于 15MB。');
      const bitmap=await createImageBitmap(file);const scale=Math.min(1,1000/Math.max(bitmap.width,bitmap.height));
      const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
      let data=canvas.toDataURL('image/jpeg',.72);if(data.length>400000)data=canvas.toDataURL('image/jpeg',.45);if(data.length>500000)throw new Error('照片压缩后仍过大，请选择更小的照片。');result.push(data);
    }
    if(token!==modalToken)return;
    activeModal.photos.push(...result);renderPhotoPreviews();
  }catch(error){if(token===modalToken)notify(error.message||'照片读取失败，请重试',true);}
  finally{if(token===modalToken){activeModal.processing=false;upload.style.opacity='';$('#visit-photos').value='';}}
}
function renderPhotoPreviews(){if(!activeModal?.photos)return;$('#photo-previews').innerHTML=activeModal.photos.map((src,i)=>`<div class="photo-preview"><img src="${src}" alt="待上传现场照片 ${i+1}"><button type="button" data-remove-photo="${i}" aria-label="移除照片 ${i+1}">×</button></div>`).join('');}
function formError(message){$('#form-error').innerHTML=`<div class="form-error" role="alert">${esc(message)}</div>`;$('.drawer-body').scrollTo({top:0,behavior:'smooth'});}
function saveStore(form) {
  if(activeModal?.processingPhotos){formError('照片正在处理，请稍后保存。');return;}
  try{validateStorePhotos({photos:activeModal.storePhotos});}catch(error){formError(error.message);return;}
  const f=new FormData(form),id=activeModal.id||uid('store'),existing=storeById(activeModal.id);if(existing&&!canEdit(existing))return;
  const s={...existing,photos:structuredClone(activeModal.storePhotos),id,name:f.get('name').trim(),town:f.get('town'),type:f.get('type'),address:f.get('address').trim(),contact:f.get('contact').trim(),phone:f.get('phone').trim(),repId:f.get('repId'),status:f.get('status'),grade:f.get('grade'),lng:Number(f.get('lng')),lat:Number(f.get('lat')),skuCount:Number(f.get('skuCount')),facings:Number(f.get('facings')),display:f.get('display'),notes:f.get('notes').trim(),lastVisitAt:existing?.lastVisitAt||'',monthlySales:existing?.monthlySales||0,createdAt:existing?.createdAt||new Date().toISOString(),isDemo:false,annotationIsDemo:false,userAnnotation:true,annotationSource:'user',annotationNotice:'',updatedAt:new Date().toISOString(),locationSource:activeModal.locationSource,accuracy:activeModal.accuracy};
  if(!s.name||!s.address){formError('请填写门店名称和详细地址。');return;}
  if(!Number.isFinite(s.lng)||!Number.isFinite(s.lat)||s.lng<73||s.lng>135||s.lat<3||s.lat>54){formError('请输入中国境内有效的 GCJ-02 经纬度，或获取当前位置。');return;}
  if(s.status==='red'&&(s.skuCount>0||s.facings>0||s.display!=='未陈列')){formError('未铺货门店应为 0 款 SKU、0 个排面和未陈列；有产品请选择待提升或已达标。');return;}
  if(['yellow','green'].includes(s.status)&&s.skuCount===0){formError('待提升或已达标门店应至少登记 1 款 SKU。');return;}
  if(s.status==='green'&&(s.facings===0||['未陈列','未登记'].includes(s.display))){formError('已达标门店应有陈列排面与陈列位置；请核实或登记为待提升。');return;}
  if(activeModal.gpsCoords&&(Math.abs(s.lng-activeModal.gpsCoords.lng)>0.000001||Math.abs(s.lat-activeModal.gpsCoords.lat)>0.000001)){s.locationSource='手动修改 GCJ-02（待核实）';s.accuracy=null;}
  if(commit(next=>{const index=next.stores.findIndex(item=>item.id===id);if(index===-1)next.stores.unshift(s);else next.stores[index]=s;})){closeModal();render();notify(existing?'门店档案已更新':'新门店已登记，可开始走访');}
}
function saveVisit(form) {
  if(activeModal.processing){formError('照片正在处理，请稍后提交。');return;}
  const f=new FormData(form),s=storeById(f.get('storeId'));if(!canEdit(s))return;
  const status=f.get('status'),skuIds=f.getAll('skuIds'),facings=Number(f.get('facings')),display=f.get('display');
  if(status==='red'&&(skuIds.length||facings>0||display!=='未陈列')){formError('未铺货表示无力神产品，请取消在售 SKU，并将排面设为 0、陈列设为未陈列。');return;}
  if(['yellow','green'].includes(status)&&!skuIds.length){formError('已有产品的门店请至少选择 1 款在售 SKU。');return;}
  if(status==='green'&&(facings===0||['未陈列','未登记'].includes(display))){formError('请补充陈列排面与陈列位置，或将状态调整为待提升。');return;}
  const gps=activeModal.gps,v={id:uid('visit'),isDemo:false,storeId:s.id,repId:f.get('repId'),visitedAt:new Date().toISOString(),status,grade:f.get('grade'),skuIds,facings,display,stock:f.get('stock'),notes:f.get('notes').trim(),photos:[...activeModal.photos],lng:gps?.lng??null,lat:gps?.lat??null,accuracy:gps?.accuracy??null,rawLng:gps?.rawLng??null,rawLat:gps?.rawLat??null,locationCapturedAt:gps?.capturedAt??null,locationSource:gps?'GPS 现场定位（WGS84 转 GCJ-02）':'未采集现场 GPS'};
  if(commit(next=>{next.visits.unshift(v);const store=next.stores.find(x=>x.id===s.id);Object.assign(store,{isDemo:false,annotationIsDemo:false,userAnnotation:true,annotationSource:'user',annotationNotice:'',status,grade:v.grade,skuCount:skuIds.length,facings,display,stock:v.stock,lastVisitAt:v.visitedAt,updatedAt:v.visitedAt});store.skuIds=[...skuIds];if(v.notes)store.notes=v.notes;})){closeModal();render();notify('走访已保存，门店状态与陈列档案已同步更新');}
}

function download(name,type,content){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function csvCell(value){let str=String(value??'');if(/^[\s\uFEFF]*[=+\-@\t\r]/.test(str))str="'"+str;return '"'+str.replaceAll('"','""')+'"';}
function exportCSV(){
  let rows;
  if(state.page==='visits'){rows=[['门店名称','乡镇','走访时间','业务员','状态','级别','SKU数','排面','陈列','库存','备注','定位来源','经度GCJ02','纬度GCJ02','精度米','记录来源'],...filteredVisits().map(v=>{const s=storeById(v.storeId);return [s.name,s.town,v.visitedAt,rep(v.repId).name,STATUS_META[v.status].label,v.grade,v.skuIds.length,v.facings,v.display,v.stock,v.notes,v.locationSource,v.lng,v.lat,v.accuracy,v.isDemo?'演示走访（虚构）':'用户登记'];})];}
  else{rows=[['门店名称','乡镇','地址','类型','状态','级别','业务员','联系人','电话','经度GCJ02','纬度GCJ02','SKU数','排面','陈列','最近走访','备注','位置来源','业务标注来源','门店资料来源'],...filteredStores().map(s=>[s.name,s.town,s.address,s.type,STATUS_META[s.status].label,s.grade,rep(s.repId).name,s.contact,s.phone,s.lng,s.lat,s.skuCount,s.facings,s.display,s.lastVisitAt,s.notes,s.locationSource||'待现场核实',s.annotationIsDemo?'演示业务标注（虚拟）':s.userAnnotation?'用户登记':'待走访核实',s.catalogRecord?'腾讯地点检索名录':'用户登记 / 待核实'])];}
  download(`力神${state.page==='visits'?'走访':'门店'}_${localDay()}.csv`,'text/csv;charset=utf-8','\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n'));notify(`已导出 ${rows.length-1} 条当前筛选数据`);
}
function backup(){const data=state.role==='admin'?db:{...db,stores:baseStores(),visits:visibleVisits(),settings:{...db.settings,tencentKey:''}};download(`力神门店备份_${localDay()}.json`,'application/json',JSON.stringify({version:1,exportedAt:new Date().toISOString(),...data},null,2));notify('JSON 备份已导出');}
function validateData(data) {
  if(!data||!Array.isArray(data.stores)||!Array.isArray(data.visits)||data.stores.length>10000||data.visits.length>50000||!data.settings||typeof data.settings.tencentKey!=='string'||data.settings.tencentKey.length>300)throw new Error('备份格式不正确或数据过大');
  const ids=new Set();const knownReps=new Set(REPS.map(r=>r.id));
  for(const s of data.stores){
    validateStorePhotos(s);
    if(!s||typeof s.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(s.id)||ids.has(s.id)||!['unvisited','red','yellow','green'].includes(s.status)||!['ungraded','A','B','C'].includes(s.grade)||!TOWN_OPTIONS.includes(s.town)||(s.repId!==''&&!knownReps.has(s.repId))||!STORE_TYPES.includes(s.type)||typeof s.name!=='string'||!s.name.trim()||s.name.length>150||typeof s.address!=='string'||s.address.length>180||!Number.isFinite(s.lng)||!Number.isFinite(s.lat)||s.lng<73||s.lng>135||s.lat<3||s.lat>54||!Number.isInteger(s.skuCount)||s.skuCount<0||s.skuCount>100||!Number.isInteger(s.facings)||s.facings<0||s.facings>999)throw new Error('门店资料格式不正确');
    for(const key of ['contact','phone','display','notes','createdAt'])if(typeof s[key]!=='string')throw new Error('门店字段缺失');
    if(s.isDemo!==undefined&&typeof s.isDemo!=='boolean')throw new Error('门店数据来源格式不正确');
    if(s.locationSource!==undefined&&typeof s.locationSource!=='string')throw new Error('门店位置来源格式不正确');
    if(s.skuIds!==undefined&&(!Array.isArray(s.skuIds)||s.skuIds.some(id=>!PRODUCTS.some(p=>p.id===id))))throw new Error('门店 SKU 格式不正确');
    if(s.lastVisitAt && !Number.isFinite(Date.parse(s.lastVisitAt)))throw new Error('门店日期格式不正确');ids.add(s.id);
  }
  const visitIds=new Set();
  for(const v of data.visits){
    if(!v||typeof v.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(v.id)||visitIds.has(v.id)||!ids.has(v.storeId)||!knownReps.has(v.repId)||!['unvisited','red','yellow','green'].includes(v.status)||!['ungraded','A','B','C'].includes(v.grade)||!Array.isArray(v.skuIds)||v.skuIds.some(id=>!PRODUCTS.some(p=>p.id===id))||!Number.isFinite(Date.parse(v.visitedAt))||!Number.isInteger(v.facings)||v.facings<0||v.facings>999||typeof v.notes!=='string'||typeof v.display!=='string'||typeof v.stock!=='string'||!Array.isArray(v.photos)||v.photos.length>3||v.photos.some(p=>typeof p!=='string'||p.length>500000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p)))throw new Error('走访记录格式不正确');
    if(v.locationSource!==undefined&&typeof v.locationSource!=='string')throw new Error('定位来源格式不正确');
    if(v.isDemo!==undefined&&typeof v.isDemo!=='boolean')throw new Error('走访数据来源格式不正确');
    if(v.locationSource?.startsWith('GPS')&&(!Number.isFinite(v.lng)||!Number.isFinite(v.lat)||!Number.isFinite(v.accuracy)||v.accuracy<0))throw new Error('定位记录格式不正确');visitIds.add(v.id);
  }
}
async function importBackup(file){
  if(state.role!=='admin')return;if(file.size>12*1024*1024){notify('备份文件请小于 12MB。',true);return;}
  try{const parsed=JSON.parse(await file.text());validateData(parsed);const data=applyDemoScenario(migrateCatalog(parsed));validateData(data);openSmallModal('恢复这份备份？',`恢复后包含 ${data.stores.length} 家门店、${data.visits.length} 条走访；旧版名录会自动升级。恢复会覆盖本浏览器当前数据，请先导出当前备份。`,`<div class="actions" style="margin-top:23px"><button class="btn secondary" data-action="backup">先导出当前数据</button><button class="btn primary" id="confirm-import">恢复这份备份</button></div>`);$('#confirm-import').addEventListener('click',()=>{try{localStorage.setItem(STORAGE_KEY,assertDatasetStorageBudget(data));db=data;closeModal();Object.assign(state,{pageNumber:1,selected:null});render();notify('备份已恢复');}catch{notify('恢复失败，浏览器存储空间不足。',true);}});}
  catch(error){notify(`无法恢复：${error.message}`,true);}
}
function navigateStore(id){const s=storeById(id);if(!canEdit(s))return;openSmallModal('打开腾讯地图导航',`目的地：${s.name}。${s.catalogRecord?'名称、地址和坐标来自腾讯地图名录，请核实实时营业情况与入口。':s.locationSource?.startsWith('GPS')?'请结合现场情况核实目的地。':'当前坐标尚未现场核实，请先确认真实位置。'}`,`<p style="margin-top:15px">地址：${esc(s.address)}</p><div class="actions" style="margin-top:23px"><button class="btn secondary" data-action="close-modal">取消</button><a class="btn primary" target="_blank" rel="noopener" href="https://apis.map.qq.com/uri/v1/routeplan?type=drive&from=我的位置&to=${encodeURIComponent(s.name)}&tocoord=${s.lat},${s.lng}&policy=1&referer=lishen-fieldwork">${icon('navigation')}打开腾讯地图</a></div>`);}

document.addEventListener('click',event=>{
  const page=event.target.closest('[data-page]');if(page){event.preventDefault();closeModal();navigate(page.dataset.page);return;}
  const status=event.target.closest('[data-status]');if(status){state.status=status.dataset.status;state.pageNumber=1;renderContent();return;}
  const paginationButton=event.target.closest('[data-pagination]');if(paginationButton){state.pageNumber=Number(paginationButton.dataset.pagination);renderContent();return;}
  const view=event.target.closest('[data-view]');if(view){state.view=view.dataset.view;state.pageNumber=1;renderContent();return;}
  const role=event.target.closest('[data-role]');if(role){state.role=role.dataset.role;if(role.dataset.id)state.repId=role.dataset.id;closeModal();navigate('overview');notify('已切换演示身份');return;}
  const remove=event.target.closest('[data-remove-photo]');if(remove&&activeModal?.type==='visit'){activeModal.photos.splice(Number(remove.dataset.removePhoto),1);renderPhotoPreviews();return;}
  const button=event.target.closest('[data-action]');if(!button)return;const {action,id}=button.dataset;
  const handlers={
    'open-town':()=>openTown(button.dataset.town),'all-outlets':()=>navigate('outlets'),
    'mobile-menu':()=>$('.sidebar').classList.toggle('mobile-open'),
    'close-modal':()=>closeModal(), 'new-store':()=>storeForm(), 'edit-store':()=>storeForm(id), 'detail':()=>showDetail(id),
    'store-photos':()=>openPhotoManager(id),
    'remove-store-photo':()=>{if(!activeModal?.storePhotos||activeModal.processingPhotos)return;const group=button.dataset.group;if(!Object.hasOwn(PHOTO_GROUPS,group))return;activeModal.storePhotos[group]=activeModal.storePhotos[group].filter(p=>p.id!==button.dataset.photoId);refreshStorePhotoEditor();},
    'close-photo-viewer':closePhotoViewer,
    'new-visit':()=>visitForm(), 'visit':()=>visitForm(id), 'visit-detail':()=>showVisit(id), 'role':roleDialog,
    'export':exportCSV,'backup':backup, 'navigate':()=>navigateStore(id),
    'copy-share-url':async()=>{try{await navigator.clipboard.writeText(new URL('./',location.href).href);notify('展示链接已复制');}catch{notify('复制未成功，请从浏览器地址栏复制当前网站地址。',true);}},
    'clear-demo':()=>{
      if(state.role!=='admin')return;const preview=getDemoAnnotationPreview(db);
      if(!preview.annotationsToClear&&!preview.visitsToDelete){notify('没有可清除的虚拟业务标注');return;}
      openSmallModal('清除演示标注？',`将 ${preview.annotationsToClear} 家虚拟业务标注还原为未走访，并清除 ${preview.visitsToDelete} 条演示走访。全部 ${db.stores.length} 家门店名录、用户修改、真实走访和地图 Key 均保留。`,`<div class="actions" style="margin-top:23px"><button class="btn secondary" data-action="close-modal">取消</button><button class="btn secondary" data-action="backup">导出备份</button><button class="btn danger" id="confirm-clear-demo">确认清除演示标注</button></div>`);
      $('#confirm-clear-demo').onclick=()=>{if(commit(next=>{Object.assign(next,clearDemoAnnotations(next));next.settings.demoScenarioVersion=DEMO_SCENARIO_VERSION;})){closeModal();render();notify('演示标注已清除，真实门店名录与个人记录已保留');}};
    },
    'add-demo':()=>{if(state.role!=='admin')return;if(commit(next=>Object.assign(next,applyDemoScenario(next,{force:true})))){render();notify('演示走访与随机分级已生成，个人登记保留');}},
    'quick-tag':()=>quickTagForm(id), 'map-gps':()=>mapGPS(button),
    'map-fit':()=>mainMap?.fitAll(),'map-zoom-in':()=>mainMap?.zoom(1),'map-zoom-out':()=>mainMap?.zoom(-1),
    'clear-filters':()=>{Object.assign(state,{town:'',status:'',grade:'',query:'',repFilter:'',visitDate:'',pageNumber:1});if(state.page==='outlets')location.hash='outlets';render();},
    'followups':()=>{navigate('outlets');state.status='unvisited';renderContent();notify('已筛选待首次走访门店');},
    'rep-stores':()=>{navigate('outlets');state.repFilter=id;renderContent();},
    'store-gps':()=>captureLocation(button,'store'), 'visit-gps':()=>captureLocation(button,'visit'),
    'clear-key':()=>{if(commit(next=>{next.settings.tencentKey='';next.settings.mapKeyConfigured=true;})){renderContent();notify('已清除 Key，恢复示意底图');}},
    'import':()=>{const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.onchange=()=>input.files[0]&&importBackup(input.files[0]);input.click();},
    'delete-store':()=>{if(state.role!=='admin')return;const s=storeById(id);openSmallModal('删除这家门店？',`将删除“${s.name}”及其 ${db.visits.filter(v=>v.storeId===id).length} 条走访记录。请确认已备份。`,`<div class="actions" style="margin-top:23px"><button class="btn secondary" data-action="close-modal">取消</button><button class="btn danger" id="confirm-delete">删除门店及记录</button></div>`);$('#confirm-delete').onclick=()=>{if(commit(next=>{next.stores=next.stores.filter(s=>s.id!==id);next.visits=next.visits.filter(v=>v.storeId!==id);})){closeModal();state.selected=null;state.pageNumber=1;render();notify('门店与关联记录已删除');}};},
    'view-photo':()=>openPhotoViewer(button.dataset.photo,button.dataset.photoTitle||'现场照片')
  };handlers[action]?.();
});
document.addEventListener('change',event=>{
  const target=event.target;
  if(target.matches('[data-filter]')){state[target.dataset.filter]=target.value;state.pageNumber=1;if(target.dataset.filter==='town'&&state.page==='outlets'){location.hash='outlets'+(state.town?'?town='+encodeURIComponent(state.town):'');render();}else renderContent();}
  if(target.matches('[data-store-photo-input]'))processStorePhotos([...target.files],target.dataset.storePhotoInput,target.dataset.replaceId);
  if(target.id==='visit-photos'&&target.files.length)processPhotos([...target.files]);
  if(target.id==='f-storeId'&&activeModal?.type==='visit'){
    const s=storeById(target.value);activeModal.storeId=s.id;$('#f-grade').value=s.grade;$('#f-facings').value=s.facings;$('#f-display').value=s.display;$('#f-stock').value=s.stock||'未登记';if(state.role==='admin')$('#f-repId').value=s.repId||REPS[0].id;
    document.querySelectorAll('input[name="status"]').forEach(input=>input.checked=input.value===s.status);document.querySelectorAll('input[name="skuIds"]').forEach(input=>input.checked=storeSkuIds(s).includes(input.value));
    activeModal.gps=null;$('#visit-location-result').textContent='已切换门店，请重新采集现场 GPS。';$('#visit-location-result').classList.remove('has-location');
    activeModal.gpsRequest=(activeModal.gpsRequest||0)+1;const gpsButton=$('[data-action="visit-gps"]');gpsButton.disabled=false;gpsButton.innerHTML=`获取当前位置 ${icon('location')}`;
  }
  if(target.matches('#f-lng,#f-lat')&&activeModal?.type==='store'){
    activeModal.locationSource='手动填写 GCJ-02（待现场核实）';activeModal.accuracy=null;activeModal.gpsCoords=null;$('#store-location-result').textContent='已手动修改坐标，请核实地图坐标系及真实门店位置。';
  }
  if(target.matches('input[name="status"]')&&target.value==='red'){
    if($('#f-skuCount'))$('#f-skuCount').value=0;if($('#f-facings'))$('#f-facings').value=0;if($('#f-display'))$('#f-display').value='未陈列';if($('#f-stock'))$('#f-stock').value='缺货';document.querySelectorAll('input[name="skuIds"]').forEach(input=>input.checked=false);
  }
});
let searchTimer;
document.addEventListener('input',event=>{
  if(event.target.id==='list-search'){
    const value=event.target.value,start=event.target.selectionStart;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{state.query=value;state.pageNumber=1;renderContent();$('#list-search')?.focus();$('#list-search')?.setSelectionRange(start,start);},160);
  }
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&$('.photo-lightbox')){closePhotoViewer();return;}
  if(event.key==='Escape'){if($('#overlay-root').children.length)closeModal();else $('.sidebar')?.classList.remove('mobile-open');}
  if(event.key==='Tab'&&$('#overlay-root').children.length){const elements=[...($('.photo-lightbox')||$('#overlay-root')).querySelectorAll('button:not([disabled]),a[href],input:not([disabled]):not([type="hidden"]),select,textarea')].filter(el=>el.getClientRects().length);if(!elements.length)return;const first=elements[0],last=elements.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
  if(event.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!$('#overlay-root').children.length){event.preventDefault();$('#global-search')?.focus();}
  if(event.key==='Enter'&&event.target.id==='global-search'){event.preventDefault();const query=event.target.value.trim();navigate('outlets');state.query=query;renderContent();}
});
document.addEventListener('submit',async event=>{
  if(event.target.id==='marker-form'){event.preventDefault();saveMarker(event.target);}
  if(event.target.id==='store-photos-form'){event.preventDefault();saveStorePhotos();}
  if(event.target.id==='store-form'){event.preventDefault();saveStore(event.target);}
  if(event.target.id==='visit-form'){event.preventDefault();saveVisit(event.target);}
  if(event.target.id==='key-form'){
    event.preventDefault();const key=new FormData(event.target).get('tencentKey').trim();if(!/^[A-Za-z0-9-]{10,200}$/.test(key)){notify('请粘贴有效的腾讯地图 JavaScript API Key。',true);return;}
    if(!commit(next=>{next.settings.tencentKey=key;next.settings.mapKeyConfigured=true;}))return;
    const button=event.target.querySelector('button[type=submit]');button.disabled=true;$('#key-status').textContent='Key 已保存，正在验证腾讯地图加载…';$('#key-test-map').hidden=false;formMap?.destroy();formMap=new StoreMap($('#key-test-map'));formMap.setStores(baseStores().slice(0,4));
    const testMap=formMap;
    try{await testMap.setKey(key);if(testMap===formMap&&$('#key-status')){$('#key-status').textContent='腾讯地图已成功加载。返回地图页面即可使用。';notify('腾讯地图接入成功');}}
    catch(error){if(testMap===formMap&&$('#key-status')){$('#key-status').textContent='Key 已保存，但加载未成功。请检查 API 类型、域名授权、额度和网络，修改后重试。';notify('地图暂未加载成功，请按指引检查 Key 与域名',true);}}
    finally{if(button.isConnected)button.disabled=false;}
  }
});
window.addEventListener('hashchange',()=>{const next=parseRoute();if(next.page!==state.page||next.town!==state.town){closeModal();Object.assign(state,{page:next.page,town:next.town,status:'',query:'',grade:'',repFilter:'',pageNumber:1,selected:null});if(next.town)state.view='list';render();}});
render();if(storageWarning)notify(storageWarning,true);
