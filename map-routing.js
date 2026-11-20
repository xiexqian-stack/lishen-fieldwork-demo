/** Staggered map loading: keep a successful map, start backups only when needed. */
const HEALTH_KEY = 'lishen-map-health-v1';
const HEALTH_TTL = 24 * 60 * 60 * 1000;
const FAILURE_COOLDOWN = 2 * 60 * 1000;
const PROVIDERS = ['tencent', 'baidu', 'amap'];
const abortError = () => new DOMException('地图加载已取消。', 'AbortError');

export function readMapHealth(storage, now = Date.now()) {
  try {
    storage ??= globalThis.localStorage;
    const parsed = JSON.parse(storage?.getItem(HEALTH_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(PROVIDERS.filter(id => {
      const entry = parsed[id];
      return entry && Number.isFinite(entry.updatedAt) && now - entry.updatedAt < HEALTH_TTL;
    }).map(id => [id, parsed[id]]));
  } catch { return {}; }
}

export function writeMapHealth(health, storage) {
  try { (storage ?? globalThis.localStorage)?.setItem(HEALTH_KEY, JSON.stringify(health)); } catch {}
}

export function orderMapProviders(providers, health = {}, now = Date.now()) {
  return [...new Set(providers)].filter(id => PROVIDERS.includes(id)).sort((a, b) => {
    const x = health[a] || {}, y = health[b] || {};
    const xCooling = Number(x.failedAt) > Number(x.successAt || 0) && now - x.failedAt < FAILURE_COOLDOWN;
    const yCooling = Number(y.failedAt) > Number(y.successAt || 0) && now - y.failedAt < FAILURE_COOLDOWN;
    if (xCooling !== yCooling) return xCooling ? 1 : -1;
    const xGood = Number.isFinite(x.latencyMs) && Number(x.successAt) > 0;
    const yGood = Number.isFinite(y.latencyMs) && Number(y.successAt) > 0;
    if (xGood !== yGood) return xGood ? -1 : 1;
    if (xGood && yGood && x.latencyMs !== y.latencyMs) return x.latencyMs - y.latencyMs;
    return PROVIDERS.indexOf(a) - PROVIDERS.indexOf(b);
  });
}

/**
 * start(provider, {signal}) resolves only when its map is genuinely ready.
 * A returned resource must implement destroy(). Cancellation and losing late
 * completions are always disposed, even when a provider ignores AbortSignal.
 */
export function raceMapProviders(providers, start, {
  signal, hedgeDelayMs = 1500, attemptTimeoutMs = 10000, totalTimeoutMs = 12000,
  health = readMapHealth(), now = Date.now, persist = writeMapHealth,
} = {}) {
  const ordered = orderMapProviders(providers, health, now());
  if (signal?.aborted) return Promise.reject(abortError());
  if (!ordered.length) return Promise.reject(new Error('没有配置可用的网页地图。'));
  return new Promise((resolve, reject) => {
    const attempts = new Map(), errors = [];
    let next = 0, active = 0, complete = false, winner = null, hedgeTimer;
    const destroy = resource => { try { resource?.destroy?.(); } catch {} };
    const save = () => { try { persist(health); } catch {} };
    const clear = () => {
      clearTimeout(hedgeTimer); clearTimeout(totalTimer);
      signal?.removeEventListener('abort', cancel);
      for (const attempt of attempts.values()) clearTimeout(attempt.timer);
    };
    const finishError = error => {
      if (complete) return;
      complete = true; clear();
      for (const attempt of attempts.values()) attempt.controller.abort();
      reject(error);
    };
    const cancel = () => finishError(abortError());
    const exhausted = () => {
      if (!complete && active === 0 && next >= ordered.length) {
        const error = new Error('在线地图暂未就绪，请检查网络或网页 Key 配置。');
        error.causes = errors; finishError(error);
      }
    };
    const schedule = () => {
      clearTimeout(hedgeTimer);
      if (!complete && next < ordered.length) hedgeTimer = setTimeout(launch, Math.max(0, hedgeDelayMs));
    };
    const fail = (attempt, error) => {
      if (complete || attempt.finished) return;
      attempt.finished = true; active--; clearTimeout(attempt.timer);
      attempt.controller.abort(); errors.push({ provider: attempt.provider, message: String(error?.message || error) });
      if (error?.name !== 'AbortError') {
        health[attempt.provider] = { ...health[attempt.provider], failedAt: now(), updatedAt: now() }; save();
      }
      if (next < ordered.length) launch();
      exhausted();
    };
    function launch() {
      if (complete || next >= ordered.length) return;
      clearTimeout(hedgeTimer);
      const provider = ordered[next++], controller = new AbortController();
      const attempt = { provider, controller, startedAt: now(), finished: false, timer: null };
      attempts.set(provider, attempt); active++;
      attempt.timer = setTimeout(() => fail(attempt, new Error('地图准备超时。')), Math.max(1, attemptTimeoutMs));
      Promise.resolve().then(() => start(provider, { signal: controller.signal })).then(resource => {
        if (complete || attempt.finished || signal?.aborted) { if (winner !== resource) destroy(resource); return; }
        attempt.finished = true; complete = true; winner = resource; clear();
        const duration = Math.max(0, now() - attempt.startedAt), previous = health[provider];
        health[provider] = {
          latencyMs: Number.isFinite(previous?.latencyMs) ? Math.round(previous.latencyMs * .35 + duration * .65) : duration,
          successAt: now(), failedAt: 0, updatedAt: now(),
        };
        save();
        for (const other of attempts.values()) if (other !== attempt) other.controller.abort();
        resolve({ provider, resource, latencyMs: duration });
      }, error => fail(attempt, error));
      schedule();
    }
    const totalTimer = setTimeout(() => finishError(new Error('在线地图加载超时，已保留可用的示意底图。')), Math.max(1, totalTimeoutMs));
    signal?.addEventListener('abort', cancel, { once: true });
    launch();
  });
}
