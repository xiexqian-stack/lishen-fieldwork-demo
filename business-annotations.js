import { PRODUCTS } from './products.js';
import { hasStorePhotos } from './store-photos.js';

const plainText = value => typeof value === 'string' ? value.trim() : '';
const isRealCatalogStore = store => store.catalogRecord === true &&
  store.source === 'tencent' && typeof store.poiId === 'string' && store.poiId.length > 0;

/** Evidence added to a sample visit makes it user work, even with an old flag. */
export function hasUserVisitEvidence(visit) {
  const hasPhotos = Array.isArray(visit.photos) ? visit.photos.length > 0 :
    visit.photos != null && visit.photos !== '';
  return visit.isDemo === false || visit.userAnnotation === true ||
    Boolean(visit.updatedAt) || hasPhotos ||
    (visit.locationCapturedAt != null && visit.locationCapturedAt !== '') ||
    visit.rawLng != null || visit.rawLat != null ||
    (typeof visit.accuracy === 'number' && Number.isFinite(visit.accuracy) && visit.accuracy >= 0) ||
    (typeof visit.locationSource === 'string' && visit.locationSource.startsWith('GPS'));
}

const isDisposableDemoVisit = visit => visit.isDemo === true && !hasUserVisitEvidence(visit);

/** Unknown business facts are kept separate from the map provider's POI facts. */
export function createDefaultBusinessFields() {
  return {
    status: 'unvisited', grade: 'ungraded', repId: '', contact: '',
    skuCount: 0, skuIds: [], facings: 0, display: '未登记',
    stock: '未登记', monthlySales: null, lastVisitAt: '', notes: '',
    annotationIsDemo: false, userAnnotation: false, annotationSource: 'unreviewed',
    annotationNotice: '',
  };
}

/** Accepts a Tencent place-search result and validates its catalog coordinates. */
export function createPoiStore(poi, options = {}) {
  const poiId = String(poi?.id ?? '').trim();
  const name = plainText(poi?.title || poi?.name);
  const lng = Number(poi?.location?.lng ?? poi?.lng);
  const lat = Number(poi?.location?.lat ?? poi?.lat);
  if (!poiId || !/^[A-Za-z0-9_-]{1,100}$/.test(poiId) || !name ||
      !Number.isFinite(lng) || !Number.isFinite(lat) ||
      lng < 73 || lng > 135 || lat < 3 || lat > 54) {
    throw new Error('腾讯 POI 缺少有效 ID、门店名称或 GCJ-02 坐标');
  }
  const catalogPhone = plainText(poi.tel || poi.phone);
  return {
    id: `poi-${poiId}`,
    name,
    address: plainText(poi.address),
    town: plainText(options.town || poi.town || poi.ad_info?.town),
    type: plainText(options.type || poi.category) || '茶饮门店',
    lng, lat,
    phone: catalogPhone,
    catalogPhone,
    catalogCategory: plainText(poi.category),
    ...createDefaultBusinessFields(),
    source: 'tencent',
    poiId,
    catalogRecord: true,
    isDemo: false,
    coordinateSystem: 'GCJ-02',
    locationSource: '腾讯地图 POI（GCJ-02，待现场核实）',
    accuracy: null,
    createdAt: options.importedAt || new Date().toISOString(),
    catalogImportedAt: options.importedAt || new Date().toISOString(),
  };
}

/** Replaces only business fields and records that a person saved the result. */
export function markUserAnnotation(store, fields = {}) {
  const businessKeys = Object.keys(createDefaultBusinessFields());
  const updates = Object.fromEntries(Object.entries(fields)
    .filter(([key]) => businessKeys.includes(key)));
  return {
    ...structuredClone(store), ...structuredClone(updates),
    isDemo: false, annotationIsDemo: false, userAnnotation: true,
    annotationSource: 'user', annotationNotice: '',
  };
}

/** A few explicitly fictional overlays; the real POI catalog is never changed. */
export function applyDemoAnnotations(stores, count = 5) {
  const next = structuredClone(stores);
  const eligible = next.map((store, index) => ({ store, index })).filter(({ store }) =>
    isRealCatalogStore(store) && store.userAnnotation !== true && !hasStorePhotos(store) &&
    (store.annotationIsDemo === true || store.status === 'unvisited' || store.status == null));
  const target = Math.min(eligible.length, Math.max(0, Math.floor(Number(count) || 0)));
  const presets = [
    { status: 'red', grade: 'C', skuCount: 0, facings: 0, display: '未陈列' },
    { status: 'yellow', grade: 'B', skuCount: 2, facings: 2, display: '货架陈列' },
    { status: 'green', grade: 'A', skuCount: 3, facings: 6, display: '端架陈列' },
    { status: 'red', grade: 'B', skuCount: 0, facings: 0, display: '未陈列' },
    { status: 'yellow', grade: 'A', skuCount: 2, facings: 3, display: '收银台陈列' },
    { status: 'green', grade: 'B', skuCount: 3, facings: 5, display: '货架陈列' },
  ];
  for (let i = 0; i < target; i++) {
    const { index } = eligible[Math.floor(i * eligible.length / target)];
    const preset = presets[i % presets.length];
    Object.assign(next[index], preset, {
      skuIds: PRODUCTS.slice(0, preset.skuCount).map(product => product.id),
      annotationIsDemo: true, userAnnotation: false, annotationSource: 'demo',
      annotationNotice: '虚拟业务标注，未核实门店的力神铺货、分级或陈列情况',
      notes: '演示标注：仅用于展示颜色、级别与陈列登记功能，不能视为实际经营情况。',
    });
  }
  return next;
}

export function getDemoAnnotationPreview(db) {
  const realVisitStoreIds = new Set(db.visits.filter(visit => !isDisposableDemoVisit(visit))
    .map(visit => visit.storeId));
  const marked = db.stores.filter(store => store.annotationIsDemo === true);
  const protectedUserAnnotations = marked.filter(store => store.userAnnotation === true ||
    realVisitStoreIds.has(store.id)).length;
  return {
    annotationsToClear: marked.length - protectedUserAnnotations,
    visitsToDelete: db.visits.filter(isDisposableDemoVisit).length,
    storesRetained: db.stores.length,
    protectedUserAnnotations,
  };
}

/** Clears fictional annotations while preserving every POI and all user work. */
export function clearDemoAnnotations(db) {
  const next = structuredClone(db);
  const deletedVisitKeys = new Set(next.visits.filter(isDisposableDemoVisit)
    .map(visit => `${visit.storeId}\0${visit.visitedAt}`));
  next.visits = next.visits.filter(visit => !isDisposableDemoVisit(visit));
  for (const visit of next.visits) {
    if (visit.isDemo === true && hasUserVisitEvidence(visit)) {
      visit.isDemo = false;
      visit.userAnnotation = true;
    }
  }
  const realVisitStoreIds = new Set(next.visits.map(visit => visit.storeId));
  const retainedVisitKeys = new Set(next.visits.map(visit => `${visit.storeId}\0${visit.visitedAt}`));
  const latestVisits = new Map();
  for (const visit of next.visits) {
    const previous = latestVisits.get(visit.storeId);
    if (Number.isFinite(Date.parse(visit.visitedAt)) &&
        (!previous || Date.parse(visit.visitedAt) > Date.parse(previous))) {
      latestVisits.set(visit.storeId, visit.visitedAt);
    }
  }
  next.stores = next.stores.map(store => {
    const lastVisitKey = `${store.id}\0${store.lastVisitAt}`;
    if (store.lastVisitAt && deletedVisitKeys.has(lastVisitKey) && !retainedVisitKeys.has(lastVisitKey)) {
      store.lastVisitAt = latestVisits.get(store.id) || '';
    }
    if (store.annotationIsDemo !== true) return store;
    if (store.userAnnotation === true || realVisitStoreIds.has(store.id)) {
      return { ...store, isDemo: false, annotationIsDemo: false,
        userAnnotation: true, annotationSource: 'user', annotationNotice: '' };
    }
    return { ...store, ...createDefaultBusinessFields(), isDemo: false };
  });
  next.settings = { ...next.settings, demoAnnotationsRemoved: true };
  return next;
}
