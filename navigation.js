/**
 * Navigation hand-off only. Store coordinates remain GCJ-02.
 * No provider Key or server signing secret is required by these links.
 *
 * Provider URI references:
 * https://lbs.qq.com/webApi/uriV1/uriGuide/uriMobileRoute
 * https://lbs.amap.com/api/uri-api/guide/travel/route
 * https://lbsyun.baidu.com/index.php?title=uri/api/android
 * https://lbsyun.baidu.com/index.php?title=uri/api/web
 */

const PREFERENCE_KEY = 'lishen-navigation-provider';
export const NAVIGATION_PROVIDERS = Object.freeze([
  Object.freeze({ id: 'amap', label: '高德地图' }),
  Object.freeze({ id: 'baidu', label: '百度地图' }),
  Object.freeze({ id: 'tencent', label: '腾讯地图' }),
]);

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

function destination(store) {
  const lat = store?.lat, lng = store?.lng;
  if (lat === '' || lng === '' || lat == null || lng == null ||
      !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng)) ||
      Math.abs(Number(lat)) > 90 || Math.abs(Number(lng)) > 180) {
    throw new RangeError('门店坐标无效，请先核实门店位置。');
  }
  return {
    lat: Number(lat).toFixed(6),
    lng: Number(lng).toFixed(6),
    name: String(store.name || '门店').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180),
    address: String(store.address || '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 300),
    region: String(store.city || '琼海市').slice(0, 80),
  };
}

function uri(base, parameters) {
  return `${base}?${new URLSearchParams(parameters).toString()}`;
}

export function navigationPlatform(userAgent = globalThis.navigator?.userAgent || '', maxTouchPoints = globalThis.navigator?.maxTouchPoints || 0) {
  if (/Android/i.test(userAgent)) return 'android';
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) return 'ios';
  return 'web';
}

/**
 * Returns an explicit App entry and HTTPS fallback for each provider.
 * Choosing a provider never starts another provider or schedules a fallback.
 * HTTPS is the primary link on desktop. App installation is not detectable.
 */
export function getNavigationOptions(store, { platform = navigationPlatform(), preferred = getPreferredNavigation() } = {}) {
  const point = destination(store);
  const baiduName = point.name.replace(/\|/g, '｜');
  const amapName = point.name.replace(/,/g, '，');
  const tencentParameters = {
    type: 'drive', from: '我的位置', to: point.name,
    tocoord: `${point.lat},${point.lng}`, policy: '1', referer: 'lishen-fieldwork',
  };
  const links = {
    amap: {
      appHref: uri(platform === 'ios' ? 'iosamap://path' : 'androidamap://route', {
        sourceApplication: '力神终端门店管理',
        dlat: point.lat, dlon: point.lng, dname: point.name, dev: '0', t: '0',
      }),
      webHref: uri('https://uri.amap.com/navigation', {
        to: `${point.lng},${point.lat},${amapName}`,
        mode: 'car', policy: '1', src: 'lishen-fieldwork', coordinate: 'gaode', callnative: '0',
      }),
    },
    baidu: {
      appHref: uri('baidumap://map/direction', {
        destination: `latlng:${point.lat},${point.lng}|name:${baiduName}`,
        mode: 'driving', coord_type: 'gcj02', src: 'webapp.lishen.fieldwork',
      }),
      // The web marker keeps the exact destination and lets the user choose
      // a starting point there, without guessing or collecting current GPS.
      webHref: uri('https://api.map.baidu.com/marker', {
        location: `${point.lat},${point.lng}`, title: point.name, content: point.address,
        output: 'html', coord_type: 'gcj02', src: 'webapp.lishen.fieldwork',
      }),
    },
    tencent: {
      appHref: uri('qqmap://map/routeplan', tencentParameters),
      webHref: uri('https://apis.map.qq.com/uri/v1/routeplan', tencentParameters),
    },
  };
  const options = NAVIGATION_PROVIDERS.map(provider => ({
    ...provider,
    ...links[provider.id],
    href: platform === 'ios' || platform === 'android' ? links[provider.id].appHref : links[provider.id].webHref,
    opensApp: platform === 'ios' || platform === 'android',
    preferred: provider.id === preferred,
  }));
  return options.sort((a, b) => Number(b.preferred) - Number(a.preferred));
}

export function getPreferredNavigation(storage) {
  try {
    const preference = (storage ?? globalThis.localStorage)?.getItem(PREFERENCE_KEY);
    return NAVIGATION_PROVIDERS.some(provider => provider.id === preference) ? preference : '';
  } catch {
    return '';
  }
}

export function rememberNavigationChoice(provider, storage) {
  if (!NAVIGATION_PROVIDERS.some(item => item.id === provider)) return false;
  try {
    const target = storage ?? globalThis.localStorage;
    target?.setItem(PREFERENCE_KEY, provider);
    return Boolean(target);
  } catch {
    return false;
  }
}

/**
 * Drop into the existing openSmallModal body. Existing .btn/.actions styles
 * supply the appearance. Anchors deliberately have no data-action handler.
 * In the app click delegate, remember a clicked [data-navigation-provider]
 * while allowing the anchor's normal navigation to proceed.
 */
export function navigationChoicesMarkup(store, { esc = escapeHtml, icon = () => '', ...options } = {}) {
  const choices = getNavigationOptions(store, options);
  return `<div class="navigation-choices" style="display:grid;gap:12px;margin-top:20px" aria-label="选择导航软件">${choices.map(choice => {
    const target = choice.opensApp ? '' : ' target="_blank"';
    return `<div class="actions" style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn ${choice.preferred ? 'primary' : 'secondary'}" style="min-height:44px;flex:1" href="${esc(choice.href)}"${target} rel="noopener noreferrer" data-navigation-provider="${choice.id}" aria-label="${esc(choice.opensApp ? '打开' : '网页打开')}${esc(choice.label)}">${icon('navigation')}${esc(choice.label)}${choice.preferred ? '（上次选择）' : ''}</a><a class="btn text" style="min-height:44px" href="${esc(choice.webHref)}" target="_blank" rel="noopener noreferrer" data-navigation-provider="${choice.id}" aria-label="使用${esc(choice.label)}网页版">网页版${icon('external')}</a></div>`;
  }).join('')}</div><p class="source-note" style="margin-top:14px">选择手机已安装的地图；未安装或未能打开时，可点“网页版”。</p>`;
}
