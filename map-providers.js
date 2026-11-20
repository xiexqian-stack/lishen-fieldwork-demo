/** Browser map adapters. Stored coordinates and public callbacks always use GCJ-02. */
const DEFAULT_CENTER = { lng: 110.49, lat: 19.25 };
const PROVIDERS = Object.freeze({ tencent: '腾讯地图', baidu: '百度地图', amap: '高德地图' });
const sdkLoads = new Map();
const sdkOwners = new Map();
let callbackSequence = 0;

export function providerLabel(provider) { return PROVIDERS[provider] || '示意底图'; }

/** Require an explicitly labelled browser key, never a REST/server key. */
export function hasProviderConfig(provider, config) {
  if (!Object.hasOwn(PROVIDERS, provider) || !config || typeof config.jsKey !== 'string' || !config.jsKey.trim()) return false;
  return provider !== 'amap' || Boolean(config.securityJsCode?.trim() || config.securityServiceHost?.trim());
}

export function getAvailableProviders(configs = {}) {
  return Object.keys(PROVIDERS).filter(provider => hasProviderConfig(provider, configs[provider]));
}

export function gcj02ToBd09(lng, lat) {
  const xPi = Math.PI * 3000 / 180;
  const z = Math.hypot(lng, lat) + .00002 * Math.sin(lat * xPi);
  const theta = Math.atan2(lat, lng) + .000003 * Math.cos(lng * xPi);
  return { lng: z * Math.cos(theta) + .0065, lat: z * Math.sin(theta) + .006 };
}

export function bd09ToGcj02(lng, lat) {
  const xPi = Math.PI * 3000 / 180;
  const x = lng - .0065, y = lat - .006;
  const z = Math.hypot(x, y) - .00002 * Math.sin(y * xPi);
  const theta = Math.atan2(y, x) - .000003 * Math.cos(x * xPi);
  return { lng: z * Math.cos(theta), lat: z * Math.sin(theta) };
}

function abortError() { return new DOMException('地图加载已取消。', 'AbortError'); }
function coordinate(lng, lat) {
  lng = Number(lng); lat = Number(lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) throw new TypeError('无效的地图坐标。');
  return { lng, lat };
}
function validStores(stores) {
  return (Array.isArray(stores) ? stores : []).filter(s => Number.isFinite(Number(s.lng)) && Number.isFinite(Number(s.lat)) && Math.abs(Number(s.lng)) <= 180 && Math.abs(Number(s.lat)) <= 90);
}
function svgUrl(svg) { return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`; }
function paddingValue(padding) { return Math.max(0, Number(padding) || 0); }
function getSdk(provider) {
  if (provider === 'tencent') return window.TMap?.Map ? window.TMap : null;
  if (provider === 'baidu') return window.BMapGL?.Map ? window.BMapGL : null;
  if (provider === 'amap') return window.AMap?.Map ? window.AMap : null;
  return null;
}

function loadProviderSdk(provider, config, timeoutMs = 8000) {
  const key = config.jsKey.trim();
  const owner = sdkOwners.get(provider);
  if (owner && owner !== key) return Promise.reject(new Error(`${providerLabel(provider)} Key 已变更，请刷新页面。`));
  const existing = getSdk(provider);
  if (existing) { sdkOwners.set(provider, key); return Promise.resolve(existing); }
  const cacheKey = `${provider}:${key}`;
  if (sdkLoads.has(cacheKey)) return sdkLoads.get(cacheKey);
  if (provider === 'amap') {
    window._AMapSecurityConfig = config.securityServiceHost?.trim()
      ? { serviceHost: config.securityServiceHost.trim() }
      : { securityJsCode: config.securityJsCode.trim() };
  }
  sdkOwners.set(provider, key);
  const load = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const callbackName = `__lishen_${provider}_sdk_${++callbackSequence}`;
    let settled = false;
    const timeout = setTimeout(() => finish(new Error(`${providerLabel(provider)}加载超时。`)), Math.max(1000, Number(timeoutMs) || 8000));
    const cleanupCallback = () => {
      // A downloaded script may still execute after cancellation/removal.
      window[callbackName] = () => {};
      setTimeout(() => { delete window[callbackName]; }, 120000);
    };
    function finish(error) {
      if (settled) return;
      const sdk = getSdk(provider);
      if (!error && !sdk) error = new Error(`${providerLabel(provider)}网页 SDK 未能初始化。`);
      settled = true;
      clearTimeout(timeout);
      script.onload = script.onerror = null;
      cleanupCallback();
      if (error) { script.remove(); sdkLoads.delete(cacheKey); reject(error); }
      else resolve(sdk);
    }
    script.async = true;
    script.onerror = () => finish(new Error(`无法加载${providerLabel(provider)}。`));
    if (provider === 'tencent') {
      script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(key)}`;
      script.onload = () => finish();
    } else {
      window[callbackName] = () => finish();
      script.src = provider === 'baidu'
        ? `https://api.map.baidu.com/api?v=1.0&type=webgl&ak=${encodeURIComponent(key)}&callback=${callbackName}`
        : `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}&callback=${callbackName}`;
    }
    document.head.append(script);
  });
  sdkLoads.set(cacheKey, load);
  return load;
}

async function withAbort(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) throw abortError();
  return new Promise((resolve, reject) => {
    const cancel = () => { cleanup(); reject(abortError()); };
    const cleanup = () => signal.removeEventListener('abort', cancel);
    signal.addEventListener('abort', cancel, { once: true });
    promise.then(value => { cleanup(); signal.aborted ? reject(abortError()) : resolve(value); }, error => { cleanup(); reject(error); });
  });
}

class BaseAdapter {
  constructor(provider, element, sdk, options) {
    this.provider = provider; this.element = element; this.sdk = sdk; this.options = options;
    this.destroyed = false; this.markers = new Map(); this.stores = new Map(); this.cleanups = [];
    this.select = () => {}; this.coordinateCallback = () => {}; this.locationMarker = null;
    this.center = coordinate(options.center?.lng ?? DEFAULT_CENTER.lng, options.center?.lat ?? DEFAULT_CENTER.lat);
    this._readyPromise = new Promise((resolve, reject) => { this._resolveReady = resolve; this._rejectReady = reject; });
    this._readyPromise.catch(() => {});
  }
  listen(target, event, handler) {
    if (this.provider === 'baidu') {
      target.addEventListener(event, handler);
      const remove = () => target.removeEventListener(event, handler);
      this.cleanups.push(remove); return remove;
    }
    target.on(event, handler);
    const remove = () => target.off(event, handler);
    this.cleanups.push(remove); return remove;
  }
  waitForMap(event) {
    const remove = this.listen(this.map, event, () => {
      if (this.destroyed) return;
      remove(); this._resolveReady(this);
    });
  }
  async ready(timeoutMs = 6000) {
    if (this.destroyed) throw abortError();
    let timer;
    try {
      await Promise.race([
        this._readyPromise,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${providerLabel(this.provider)}底图未就绪，请检查网页 Key、授权域名及网络。`)), Math.max(500, Number(timeoutMs) || 6000)); })
      ]);
      if (this.destroyed) throw abortError();
      return this;
    } finally { clearTimeout(timer); }
  }
  onCoordinate(callback) { this.coordinateCallback = typeof callback === 'function' ? callback : () => {}; }
  emitCoordinate(lng, lat) {
    if (!this.destroyed) this.coordinateCallback({ ...coordinate(lng, lat), source: this.provider });
  }
  removeMarker(marker) {
    if (this.provider === 'baidu') this.map.removeOverlay(marker);
    else if (this.provider === 'amap') this.map.remove(marker);
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true; this._rejectReady(abortError());
    for (const remove of this.cleanups.splice(0)) { try { remove(); } catch {} }
    try { this.markerLayer?.setMap(null); } catch {}
    try { this.gpsLayer?.setMap(null); } catch {}
    if (this.provider === 'baidu') { try { this.map.clearOverlays(); } catch {} }
    if (this.provider === 'amap') { try { this.map.clearMap(); } catch {} }
    try { this.map?.destroy?.(); } catch {}
    this.markers.clear(); this.stores.clear(); this.element.replaceChildren(); this.map = null;
  }
  resize() {
    if (this.destroyed) return;
    if (typeof this.map.resize === 'function') this.map.resize();
    else this.map.checkResize?.();
  }
}

class TencentAdapter extends BaseAdapter {
  constructor(element, sdk, options) {
    super('tencent', element, sdk, options);
    const T = sdk;
    this.map = new T.Map(element, { center: new T.LatLng(this.center.lat, this.center.lng), zoom: options.zoom ?? 12, minZoom: 8, maxZoom: 18, pitch: 0, rotation: 0, viewMode: '2D', showControl: options.showControl !== false });
    this.waitForMap('tilesloaded');
    this.listen(this.map, 'click', event => { if (event.latLng) this.emitCoordinate(event.latLng.getLng(), event.latLng.getLat()); });
  }
  setStores(stores, selectedId, onSelect, pinSVG) {
    if (this.destroyed) return;
    const T = this.sdk, items = validStores(stores), styles = {};
    this.select = onSelect || (() => {}); this.stores = new Map(items.map(s => [String(s.id), s]));
    const geometries = items.map(store => {
      const styleId = `${store.status}-${store.grade}`;
      if (!styles[styleId]) styles[styleId] = new T.MarkerStyle({ width: 36, height: 36, anchor: { x: 18, y: 18 }, src: svgUrl(pinSVG(store.status, store.grade)) });
      return { id: String(store.id), styleId, position: new T.LatLng(Number(store.lat), Number(store.lng)), properties: { storeId: store.id } };
    });
    if (!this.markerLayer) {
      this.markerLayer = new T.MultiMarker({ id: 'lishen-stores', map: this.map, styles, geometries });
      this.listen(this.markerLayer, 'click', event => { const s = this.stores.get(String(event.geometry?.id)); if (s) this.select(s.id); });
    } else { this.markerLayer.setStyles(styles); this.markerLayer.setGeometries(geometries); }
  }
  setCenter(lng, lat) { if (!this.destroyed) { this.center = coordinate(lng, lat); this.map.setCenter(new this.sdk.LatLng(this.center.lat, this.center.lng)); } }
  getCenter() { const c = this.map?.getCenter(); return c ? coordinate(c.getLng(), c.getLat()) : this.center; }
  zoom(delta) { if (!this.destroyed) this.map.setZoom(Math.max(8, Math.min(18, this.map.getZoom() + Number(delta)))); }
  fitAll(stores, padding = 70) {
    const items = validStores(stores); if (this.destroyed || !items.length) return;
    const T = this.sdk, xs = items.map(s => Number(s.lng)), ys = items.map(s => Number(s.lat));
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const dx = maxX - minX < .001 ? .001 : 0, dy = maxY - minY < .001 ? .001 : 0;
    this.map.fitBounds(new T.LatLngBounds(new T.LatLng(minY - dy, minX - dx), new T.LatLng(maxY + dy, maxX + dx)), { padding: paddingValue(padding) });
  }
  locate(location, svg) {
    if (this.destroyed) return;
    if (!location) { this.gpsLayer?.setMap(null); this.gpsLayer = null; return; }
    const T = this.sdk, c = coordinate(location.lng, location.lat);
    const geometries = [{ id: 'current-location', styleId: 'gps', position: new T.LatLng(c.lat, c.lng) }];
    if (this.gpsLayer) this.gpsLayer.setGeometries(geometries);
    else this.gpsLayer = new T.MultiMarker({ id: 'lishen-current-location', map: this.map, styles: { gps: new T.MarkerStyle({ width: 44, height: 44, anchor: { x: 22, y: 22 }, src: svgUrl(svg) }) }, geometries });
    this.setCenter(c.lng, c.lat); this.map.setZoom(15);
  }
}

class BaiduAdapter extends BaseAdapter {
  constructor(element, sdk, options) {
    super('baidu', element, sdk, options);
    this.map = new sdk.Map(element, { enableMapClick: false });
    this.waitForMap('tilesloaded');
    const c = gcj02ToBd09(this.center.lng, this.center.lat);
    this.map.centerAndZoom(new sdk.Point(c.lng, c.lat), options.zoom ?? 12);
    this.map.enableScrollWheelZoom(true);
    this.listen(this.map, 'click', event => {
      const p = event.latlng || event.point;
      if (p) { const c = bd09ToGcj02(p.lng, p.lat); this.emitCoordinate(c.lng, c.lat); }
    });
  }
  point(lng, lat) { const c = gcj02ToBd09(Number(lng), Number(lat)); return new this.sdk.Point(c.lng, c.lat); }
  icon(svg, size = 36) { return new this.sdk.Icon(svgUrl(svg), new this.sdk.Size(size, size), { anchor: new this.sdk.Size(size / 2, size / 2), imageSize: new this.sdk.Size(size, size) }); }
  setStores(stores, selectedId, onSelect, pinSVG) {
    if (this.destroyed) return;
    const items = validStores(stores), next = new Map(items.map(s => [String(s.id), s])); this.stores = next; this.select = onSelect || (() => {});
    for (const [id, entry] of this.markers) if (!next.has(id)) { entry.remove(); this.map.removeOverlay(entry.marker); this.markers.delete(id); }
    for (const store of items) {
      const id = String(store.id), stamp = `${store.status}:${store.grade}`; let entry = this.markers.get(id);
      if (!entry) {
        const marker = new this.sdk.Marker(this.point(store.lng, store.lat), { icon: this.icon(pinSVG(store.status, store.grade)), title: store.name });
        const clicked = event => { event.domEvent?.stopPropagation(); const current = this.stores.get(id); if (current) this.select(current.id); };
        marker.addEventListener('click', clicked);
        entry = { marker, stamp, lng: store.lng, lat: store.lat, remove: () => marker.removeEventListener('click', clicked) };
        this.markers.set(id, entry); this.map.addOverlay(marker);
      } else {
        if (entry.stamp !== stamp) { entry.marker.setIcon(this.icon(pinSVG(store.status, store.grade))); entry.stamp = stamp; }
        if (entry.lng !== store.lng || entry.lat !== store.lat) { entry.marker.setPosition(this.point(store.lng, store.lat)); entry.lng = store.lng; entry.lat = store.lat; }
      }
      entry.marker.setZIndex?.(id === String(selectedId) ? 1000 : 1);
    }
  }
  setCenter(lng, lat) { if (!this.destroyed) { this.center = coordinate(lng, lat); this.map.panTo(this.point(lng, lat), { noAnimation: true }); } }
  getCenter() { const c = this.map?.getCenter(); return c ? bd09ToGcj02(c.lng, c.lat) : this.center; }
  zoom(delta) { if (!this.destroyed) this.map.setZoom(Math.max(8, Math.min(18, this.map.getZoom() + Number(delta)))); }
  fitAll(stores, padding = 70) {
    const items = validStores(stores); if (this.destroyed || !items.length) return;
    if (items.length === 1) { this.map.centerAndZoom(this.point(items[0].lng, items[0].lat), 15); return; }
    const p = paddingValue(padding); this.map.setViewport(items.map(s => this.point(s.lng, s.lat)), { margins: [p, p, p, p], enableAnimation: false });
  }
  locate(location, svg) {
    if (this.destroyed) return;
    if (!location) { if (this.locationMarker) this.map.removeOverlay(this.locationMarker); this.locationMarker = null; return; }
    const c = coordinate(location.lng, location.lat), point = this.point(c.lng, c.lat);
    if (this.locationMarker) this.locationMarker.setPosition(point);
    else { this.locationMarker = new this.sdk.Marker(point, { icon: this.icon(svg, 44), enableClicking: false }); this.map.addOverlay(this.locationMarker); }
    this.setCenter(c.lng, c.lat); this.map.setZoom(15);
  }
  destroy() { for (const entry of this.markers.values()) { try { entry.remove(); } catch {} } super.destroy(); }
}

class AmapAdapter extends BaseAdapter {
  constructor(element, sdk, options) {
    super('amap', element, sdk, options);
    this.map = new sdk.Map(element, { center: [this.center.lng, this.center.lat], zoom: options.zoom ?? 12, zooms: [8, 18], viewMode: '2D', pitch: 0 });
    this.waitForMap('complete');
    this.listen(this.map, 'click', event => { if (event.lnglat) this.emitCoordinate(event.lnglat.getLng(), event.lnglat.getLat()); });
  }
  icon(svg, size = 36) { return new this.sdk.Icon({ image: svgUrl(svg), size: new this.sdk.Size(size, size), imageSize: new this.sdk.Size(size, size) }); }
  setStores(stores, selectedId, onSelect, pinSVG) {
    if (this.destroyed) return;
    const items = validStores(stores), next = new Map(items.map(s => [String(s.id), s])); this.stores = next; this.select = onSelect || (() => {});
    for (const [id, entry] of this.markers) if (!next.has(id)) { entry.remove(); this.map.remove(entry.marker); this.markers.delete(id); }
    const added = [];
    for (const store of items) {
      const id = String(store.id), stamp = `${store.status}:${store.grade}`; let entry = this.markers.get(id);
      if (!entry) {
        const marker = new this.sdk.Marker({ position: [Number(store.lng), Number(store.lat)], icon: this.icon(pinSVG(store.status, store.grade)), anchor: 'center', title: store.name, bubble: false });
        const clicked = () => { const current = this.stores.get(id); if (current) this.select(current.id); };
        marker.on('click', clicked);
        entry = { marker, stamp, lng: store.lng, lat: store.lat, remove: () => marker.off('click', clicked) };
        this.markers.set(id, entry); added.push(marker);
      } else {
        if (entry.stamp !== stamp) { entry.marker.setIcon(this.icon(pinSVG(store.status, store.grade))); entry.stamp = stamp; }
        if (entry.lng !== store.lng || entry.lat !== store.lat) { entry.marker.setPosition([Number(store.lng), Number(store.lat)]); entry.lng = store.lng; entry.lat = store.lat; }
      }
      entry.marker.setzIndex?.(id === String(selectedId) ? 1000 : 1);
    }
    if (added.length) this.map.add(added);
  }
  setCenter(lng, lat) { if (!this.destroyed) { this.center = coordinate(lng, lat); this.map.setCenter([this.center.lng, this.center.lat]); } }
  getCenter() { const c = this.map?.getCenter(); return c ? coordinate(c.getLng(), c.getLat()) : this.center; }
  zoom(delta) { if (!this.destroyed) this.map.setZoom(Math.max(8, Math.min(18, this.map.getZoom() + Number(delta)))); }
  fitAll(stores, padding = 70) {
    if (this.destroyed) return;
    const items = validStores(stores), markers = items.map(s => this.markers.get(String(s.id))?.marker).filter(Boolean);
    if (!markers.length) return;
    const p = paddingValue(padding); this.map.setFitView(markers, false, [p, p, p, p], 16);
  }
  locate(location, svg) {
    if (this.destroyed) return;
    if (!location) { if (this.locationMarker) this.map.remove(this.locationMarker); this.locationMarker = null; return; }
    const c = coordinate(location.lng, location.lat);
    if (this.locationMarker) this.locationMarker.setPosition([c.lng, c.lat]);
    else { this.locationMarker = new this.sdk.Marker({ position: [c.lng, c.lat], icon: this.icon(svg, 44), anchor: 'center', clickable: false, zIndex: 1500 }); this.map.add(this.locationMarker); }
    this.setCenter(c.lng, c.lat); this.map.setZoom(15);
  }
  destroy() { for (const entry of this.markers.values()) { try { entry.remove(); } catch {} } super.destroy(); }
}

/** Load only browser SDKs. Aborting one candidate never cancels a shared SDK load. */
export async function createProviderMap(provider, element, config, options = {}) {
  if (!hasProviderConfig(provider, config)) throw new Error(`${providerLabel(provider)}未配置可用的网页 JS Key。`);
  if (!element || typeof element.replaceChildren !== 'function') throw new TypeError('需要有效的地图容器。');
  const sdk = await withAbort(loadProviderSdk(provider, config, options.sdkTimeoutMs), options.signal);
  if (options.signal?.aborted) throw abortError();
  const Adapter = { tencent: TencentAdapter, baidu: BaiduAdapter, amap: AmapAdapter }[provider];
  const adapter = new Adapter(element, sdk, options);
  if (options.signal) {
    const cancel = () => adapter.destroy();
    options.signal.addEventListener('abort', cancel, { once: true });
    adapter.cleanups.push(() => options.signal.removeEventListener('abort', cancel));
    if (options.signal.aborted) { adapter.destroy(); throw abortError(); }
  }
  return adapter;
}
