import { PRODUCTS } from './products.js';
import { clearDemoAnnotations, createDefaultBusinessFields, hasUserVisitEvidence } from './business-annotations.js';
import { hasStorePhotos } from './store-photos.js';

export const DEMO_SCENARIO_VERSION = 'qionghai-2026-11-19-v1';
export const DEMO_SCENARIO_BASELINE_DATE = '2026-11-19';
const DEMO_NOTICE = '虚拟走访与分级，仅用于展示系统；未核实门店的力神铺货、陈列或经营情况。';
const REPRESENTATIVES = ['rep-01', 'rep-02', 'rep-03'];
const isCatalogStore = store => store?.catalogRecord === true && store.source === 'tencent' &&
  typeof store.poiId === 'string' && store.poiId.length > 0;

function validateDataset(db) {
  if (!db || !Array.isArray(db.stores) || !Array.isArray(db.visits) ||
      db.stores.some(store => !store || typeof store.id !== 'string') ||
      db.visits.some(visit => !visit || typeof visit.storeId !== 'string')) {
    throw new Error('无法生成演示场景：门店或走访数据结构无效');
  }
  if (new Set(db.stores.map(store => store.id)).size !== db.stores.length) {
    throw new Error('无法生成演示场景：门店编号重复');
  }
}

function hash(text) {
  let value = 2166136261;
  for (const character of text) value = Math.imul(value ^ character.codePointAt(0), 16777619);
  return value >>> 0;
}

function shuffled(items, salt) {
  const copy = [...items];
  let seed = hash(`${DEMO_SCENARIO_VERSION}:${salt}`);
  const random = () => {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  for (let index = copy.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

/** Largest-remainder quotas, with one place for each township when possible. */
function sampleByTown(stores, count, salt) {
  const target = Math.min(stores.length, Math.max(0, Math.floor(count)));
  if (!target) return [];
  const towns = new Map();
  for (const store of stores) {
    const key = String(store.town || '乡镇待核实');
    if (!towns.has(key)) towns.set(key, []);
    towns.get(key).push(store);
  }
  const groups = [...towns].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([town, items]) => {
      const ideal = items.length * target / stores.length;
      const minimum = target >= towns.size ? 1 : 0;
      return { town, items, ideal, minimum, quota: Math.max(minimum, Math.floor(ideal)),
        tie: hash(`${salt}:${town}`) };
    });
  let assigned = groups.reduce((sum, group) => sum + group.quota, 0);
  while (assigned !== target) {
    const adding = assigned < target;
    const candidates = groups.filter(group => adding ? group.quota < group.items.length : group.quota > group.minimum);
    candidates.sort((a, b) => {
      const aScore = adding ? a.ideal - a.quota : a.quota - a.ideal;
      const bScore = adding ? b.ideal - b.quota : b.quota - b.ideal;
      return bScore - aScore || a.tie - b.tie;
    });
    const chosen = candidates[0];
    chosen.quota += adding ? 1 : -1;
    assigned += adding ? 1 : -1;
  }
  return shuffled(groups.flatMap(group => shuffled(
    [...group.items].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    `${salt}:${group.town}`,
  ).slice(0, group.quota)), `${salt}:all`);
}

function hasManualBusinessFields(store) {
  if (store.userAnnotation === true || store.updatedAt || store.annotationSource === 'user') return true;
  // No scenario writes a contact or a claimed sales figure.
  if (store.contact || store.monthlySales != null) return true;
  if (store.annotationIsDemo === true) return false;
  const defaults = createDefaultBusinessFields();
  return ['status', 'grade', 'repId', 'skuCount', 'skuIds', 'facings', 'display', 'stock', 'lastVisitAt', 'notes']
    .some(key => store[key] != null && JSON.stringify(store[key]) !== JSON.stringify(defaults[key]));
}

function visitDate(index) {
  const midnight = Date.parse(`${DEMO_SCENARIO_BASELINE_DATE}T00:00:00+08:00`);
  // Three early visits on the baseline day; the others cover the previous 29 days.
  if (index < 3) return new Date(midnight + (10 + index * 10) * 60000).toISOString();
  const day = 1 + (index - 3) % 29;
  return new Date(midnight - day * 86400000 + (9 * 60 + (index * 37) % (9 * 60)) * 60000).toISOString();
}

/** Apply once per version. A cleared current version stays clear until explicit force. */
export function applyDemoScenario(db, { force = false } = {}) {
  validateDataset(db);
  if (!force && db.settings?.demoScenarioVersion === DEMO_SCENARIO_VERSION) return structuredClone(db);
  const actualVisitStores = new Set(db.visits.filter(visit => visit.isDemo !== true || hasUserVisitEvidence(visit))
    .map(visit => visit.storeId));
  const protectedStores = new Map(db.stores.filter(store => actualVisitStores.has(store.id) ||
    hasStorePhotos(store) || hasManualBusinessFields(store)).map(store => [store.id, structuredClone(store)]));
  const next = clearDemoAnnotations(db);
  // Photo-bearing and manually edited stores must survive even old, stale demo flags.
  next.stores = next.stores.map(store => protectedStores.has(store.id) ?
    { ...protectedStores.get(store.id), lastVisitAt: store.lastVisitAt } : store);
  const catalog = next.stores.filter(isCatalogStore);
  const eligible = catalog.filter(store => !protectedStores.has(store.id));
  const chosen = sampleByTown(eligible, Math.round(catalog.length * .6), 'visited');
  const graded = sampleByTown(chosen, Math.min(chosen.length, Math.round(catalog.length * .5)), 'graded');
  const grades = new Map(graded.map((store, index) => [store.id, ['A', 'B', 'C'][index % 3]]));
  const storesById = new Map(next.stores.map(store => [store.id, store]));
  const usedVisitIds = new Set(next.visits.map(visit => visit.id));
  for (const [index, chosenStore] of chosen.entries()) {
    const store = storesById.get(chosenStore.id);
    const status = index % 10 < 3 ? 'red' : index % 10 < 7 ? 'yellow' : 'green';
    const skuCount = status === 'red' ? 0 : status === 'yellow' ? 1 + index % 2 : 3 + index % 2;
    const skuIds = shuffled(PRODUCTS, `sku:${store.id}`).slice(0, skuCount).map(product => product.id);
    const facings = status === 'red' ? 0 : status === 'yellow' ? 1 + index % 3 : 5 + index % 4;
    const display = status === 'red' ? '未陈列' : ['货架陈列', '端架陈列', '收银台陈列'][index % 3];
    const stock = status === 'red' ? '缺货' : status === 'yellow' && index % 2 ? '偏低' : '充足';
    const grade = grades.get(store.id) || 'ungraded';
    const repId = REPRESENTATIVES[index % REPRESENTATIVES.length];
    const visitedAt = visitDate(index);
    const notes = `演示走访：${status === 'red' ? '展示未铺货门店的跟进流程' : status === 'yellow' ? '展示补货与陈列提升登记' : '展示已达标门店的陈列档案'}。${DEMO_NOTICE}`;
    Object.assign(store, { status, grade, skuIds: [...skuIds], skuCount, facings, display, stock,
      repId, lastVisitAt: visitedAt, notes, annotationIsDemo: true, userAnnotation: false,
      annotationSource: 'demo', annotationNotice: DEMO_NOTICE });
    const idBase = `demo-visit-20261119-${index + 1}-${hash(store.id).toString(16)}`;
    let id = idBase, suffix = 1;
    while (usedVisitIds.has(id)) id = `${idBase}-${suffix++}`;
    usedVisitIds.add(id);
    next.visits.push({ id, isDemo: true, storeId: store.id, repId, visitedAt, status, grade,
      skuIds, facings, display, stock, notes, photos: [], lng: null, lat: null, accuracy: null,
      rawLng: null, rawLat: null, locationCapturedAt: null, locationSource: '演示记录 · 未采集现场 GPS' });
  }
  next.visits.sort((a, b) => Date.parse(b.visitedAt) - Date.parse(a.visitedAt));
  next.settings = { ...next.settings, demoScenarioVersion: DEMO_SCENARIO_VERSION,
    demoScenarioBaselineDate: DEMO_SCENARIO_BASELINE_DATE, demoAnnotationsRemoved: false };
  return next;
}

export function getDemoScenarioSummary(db) {
  validateDataset(db);
  const demoVisits = db.visits.filter(visit => visit.isDemo === true && !hasUserVisitEvidence(visit));
  const visitedIds = new Set(demoVisits.map(visit => visit.storeId));
  const annotated = db.stores.filter(store => store.annotationIsDemo === true && visitedIds.has(store.id));
  const townshipCounts = {};
  for (const store of annotated) {
    const town = store.town || '乡镇待核实';
    townshipCounts[town] ||= { visited: 0, graded: 0 };
    townshipCounts[town].visited++;
    if (['A', 'B', 'C'].includes(store.grade)) townshipCounts[town].graded++;
  }
  return { version: db.settings?.demoScenarioVersion || '', baselineDate: DEMO_SCENARIO_BASELINE_DATE,
    catalogStores: db.stores.filter(isCatalogStore).length, demoVisits: demoVisits.length,
    demoVisitedStores: annotated.length, demoGradedStores: annotated.filter(store => ['A', 'B', 'C'].includes(store.grade)).length,
    townshipCounts };
}
