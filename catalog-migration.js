import { CATALOG_META, createSeedData } from './data.js';
import { clearDemoAnnotations, hasUserVisitEvidence } from './business-annotations.js';

const legacyStoreId = id => typeof id === 'string' && /^store-\d{3}$/.test(id);
const legacyVisitId = id => typeof id === 'string' && /^visit-\d{3}$/.test(id);
const hasIllustrativeAddress = store => /(?:\(示意\)|（示意）)/.test(store.address || '');
const isOldFictionalStore = store => store.catalogRecord !== true &&
  ((legacyStoreId(store.id) && hasIllustrativeAddress(store)) || store.isDemo === true);
const isDisposableOldVisit = visit => legacyVisitId(visit.id) &&
  visit.isDemo !== false && /演示/.test(visit.locationSource || '') &&
  !hasUserVisitEvidence(visit);

/**
 * Upgrades the old fictional catalog once per real POI snapshot version.
 * Never changes an existing real-POI record or deletes uncertain user work.
 * The caller validates and persists the returned clone atomically.
 */
export function migrateCatalog(db) {
  if (!db || !Array.isArray(db.stores) || !Array.isArray(db.visits)) {
    throw new Error('无法迁移：门店或走访数据结构无效');
  }
  const next = structuredClone(db);
  // Apply this repair even to the current catalog version: earlier releases may
  // have retained user evidence while leaving the sample flag on its visit.
  for (const visit of next.visits) {
    if (visit.isDemo === true && hasUserVisitEvidence(visit)) {
      visit.isDemo = false;
      visit.userAnnotation = true;
    }
  }
  if (next.settings?.catalogVersion === CATALOG_META.version) return next;

  const removedVisits = next.visits.filter(isDisposableOldVisit);
  const removedVisitIds = new Set(removedVisits.map(visit => visit.id));
  next.visits = next.visits.filter(visit => !removedVisitIds.has(visit.id));
  // Every retained visit protects its parent, including any uncertain legacy work.
  const protectedStoreIds = new Set(next.visits.map(visit => visit.storeId));
  const latestVisits = new Map();
  for (const visit of next.visits) {
    const prior = latestVisits.get(visit.storeId);
    if (!prior || new Date(visit.visitedAt) > new Date(prior.visitedAt)) latestVisits.set(visit.storeId, visit);
  }
  const removedVisitKeys = new Set(removedVisits.map(visit => `${visit.storeId}\0${visit.visitedAt}`));
  const keptStores = [];
  for (const store of next.stores) {
    const oldFictional = isOldFictionalStore(store);
    const safeToRemove = oldFictional && store.isDemo !== false &&
      !store.updatedAt && !store.userAnnotation && !protectedStoreIds.has(store.id);
    if (safeToRemove) continue;
    if (oldFictional) {
      // It may now contain actual work; retain it without claiming a real POI source.
      store.catalogRecord = false;
      store.isDemo = false;
      store.locationSource = '原演示坐标，待现场核实';
      if (protectedStoreIds.has(store.id)) store.userAnnotation = true;
    }
    if (removedVisitKeys.has(`${store.id}\0${store.lastVisitAt}`)) {
      store.lastVisitAt = latestVisits.get(store.id)?.visitedAt || '';
    }
    keptStores.push(store);
  }

  let seed = createSeedData();
  // A previous request to clear the samples must survive catalog upgrades.
  if (next.settings?.demoAnnotationsRemoved || next.settings?.demoDataRemoved) {
    seed = clearDemoAnnotations(seed);
  }
  const existingIds = new Set(keptStores.map(store => store.id));
  const addedStores = seed.stores.filter(store => !existingIds.has(store.id));
  next.stores = [...keptStores, ...addedStores];
  next.settings = { ...seed.settings, ...next.settings, catalogVersion: CATALOG_META.version };
  return next;
}
