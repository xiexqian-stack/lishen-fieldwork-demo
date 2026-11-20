// Browser SDK credentials only. Authorize the site's hostname at each provider.
// REST/service Keys and Baidu server signing SK never belong in this file.
export const APP_CONFIG = Object.freeze({
  tencentKey: 'R54BZ-MLDCQ-DRU5U-BPMBX-SEJKS-XIFYW',
  mapKeyName: '力神图引',
  mapProviders: Object.freeze({
    baidu: Object.freeze({ jsKey: 'LtFQ4Zxln5r61qBcXm3ad3pulc418Ake' }),
    amap: Object.freeze({ jsKey: '', securityJsCode: '' }),
  }),
});
