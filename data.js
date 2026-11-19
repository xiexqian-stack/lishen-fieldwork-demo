import { POI_CATALOG } from './poi-catalog.js';
import { createPoiStore, applyDemoAnnotations } from './business-annotations.js';
export { PRODUCTS } from './products.js';
export const CATALOG_META=POI_CATALOG.metadata;
export const STORE_TYPES=['老爸茶店','茶饮店','茶馆','咖啡店','茶餐厅','便利店','商超','餐饮店'];
export const TOWN_OPTIONS=['嘉积镇','博鳌镇','潭门镇','中原镇','长坡镇','万泉镇','塔洋镇','大路镇','阳江镇','龙江镇','会山镇','石壁镇','乡镇待核实'];
export const TOWNS = [
  '嘉积镇', '博鳌镇', '潭门镇', '中原镇', '长坡镇', '万泉镇',
  '塔洋镇', '大路镇', '阳江镇', '龙江镇', '会山镇', '石壁镇',
];

export const REPS = [
  { id: 'rep-01', name: '林晓', initials: '林', phone: '' },
  { id: 'rep-02', name: '陈海', initials: '陈', phone: '' },
  { id: 'rep-03', name: '王悦', initials: '王', phone: '' },
];


export const STATUS_META={
 unvisited:{label:'未走访',description:'尚未核实铺货与陈列，保持中性灰色',color:'#9ba79d'},
 red:{label:'未铺货',description:'现场登记无力神产品',color:'#e87970'},
 yellow:{label:'待提升',description:'已有产品，SKU 或陈列待提升',color:'#dca440'},
 green:{label:'已达标',description:'人工登记为合格门店，正式标准待确认',color:'#3c8d73'}
};
export const GRADE_META={ungraded:{symbol:'○',label:'待分级'},A:{symbol:'★',label:'A 类门店'},B:{symbol:'▲',label:'B 类门店'},C:{symbol:'●',label:'C 类门店'}};
export function uid(prefix = 'item') {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function formatDate(value, includeTime = false) {
  if (!value) return '尚未走访';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '日期无效';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).format(date);
}

export function daysSince(value) {
  if (!value) return Infinity;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return Infinity;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((now.getTime() - date.getTime()) / 86400000));
}


export function createSeedData(){
 const stores=POI_CATALOG.items.map(poi=>createPoiStore(poi,{town:poi.town||'乡镇待核实',type:poi.storeType||'茶饮店',importedAt:POI_CATALOG.metadata.fetchedAt}));
 return {stores:applyDemoAnnotations(stores,6),visits:[],settings:{tencentKey:'',defaultCity:'琼海市',catalogVersion:POI_CATALOG.metadata.version}};
}
