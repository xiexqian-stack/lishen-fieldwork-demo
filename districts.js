import { TOWNS } from './data.js';

const UNASSIGNED_TOWN = '乡镇待核实';

/**
 * Only the supplied visible stores and their visits contribute to these rows.
 * visited counts distinct stores with a non-demo visit; verified only means a
 * person saved a non-demo business status, not GPS verification or catalog completeness.
 * unvisited means no real visit and no verified business status; a demo label does not qualify.
 * withPhotos counts stores with storefront/display archive photos, not historical visit photos.
 */
export function getDistrictSummaries(stores = [], visits = []) {
  const rows = [...TOWNS, UNASSIGNED_TOWN].map(town => ({
    town, total: 0, unvisited: 0, visited: 0, withPhotos: 0,
    verified: 0, stocked: 0, demo: 0,
  }));
  const byTown = new Map(rows.map(row => [row.town, row]));
  const realVisitStoreIds = new Set((Array.isArray(visits) ? visits : [])
    .filter(visit => visit && visit.isDemo !== true)
    .map(visit => visit.storeId));
  const seenIds = new Set();

  for (const store of Array.isArray(stores) ? stores : []) {
    if (!store || typeof store !== 'object') continue;
    // A repeated visible record must not make the same outlet count twice.
    if (store.id != null) {
      if (seenIds.has(store.id)) continue;
      seenIds.add(store.id);
    }
    const row = byTown.get(store.town) || byTown.get(UNASSIGNED_TOWN);
    const hasVisit = store.id != null && realVisitStoreIds.has(store.id);
    const isDemo = store.annotationIsDemo === true;
    const isVerified = store.userAnnotation === true && !isDemo &&
      store.status !== 'unvisited';
    const hasPhotos = ['storefront', 'display'].some(group =>
      Array.isArray(store.photos?.[group]) && store.photos[group].length > 0);

    row.total++;
    if (hasVisit) row.visited++;
    if (!hasVisit && !isVerified) row.unvisited++;
    if (hasPhotos) row.withPhotos++;
    if (isVerified) row.verified++;
    if (isVerified && ['yellow', 'green'].includes(store.status)) row.stocked++;
    if (isDemo) row.demo++;
  }
  return rows;
}
