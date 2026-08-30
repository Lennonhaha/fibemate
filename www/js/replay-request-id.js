// SPDX-License-Identifier: GPL-3.0-only
// ================================================
// 重放保护客户端（配对服务端 replayGuardMiddleware）
// 全局包装 window.fetch：同源请求自动注入唯一 X-Request-Id（UUID），
// 服务端在 TTL 窗口内检测重复即返回 425 REPLAY_DETECTED。
// 仅同源注入，避免跨域请求触发 CORS 预检。幂等，可安全被多模块 import。
// ================================================
(function () {
  if (window.__fibemateRequestIdPatched) return;
  window.__fibemateRequestIdPatched = true;
  const _orig = window.fetch ? window.fetch.bind(window) : null;
  if (!_orig) return;

  function newId() {
    try {
      if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    } catch (_) { /* fall through to RFC4122 v4 fallback */ }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function sameOrigin(input) {
    try {
      const u = typeof input === 'string' ? input : (input && input.url);
      if (!u) return true; // Request 对象无 url -> 保守注入
      if (/^https?:\/\//i.test(u)) {
        return new URL(u, window.location.href).origin === window.location.origin;
      }
      return true; // 相对路径 = 同源
    } catch (_) { return true; }
  }

  window.fetch = function (input, init) {
    init = init || {};
    if (sameOrigin(input)) {
      const h = init.headers;
      const obj = {};
      if (h) {
        if (typeof Headers !== 'undefined' && h instanceof Headers) {
          h.forEach((v, k) => { obj[k] = v; });
        } else if (Array.isArray(h)) {
          h.forEach((p) => { obj[p[0]] = p[1]; });
        } else {
          for (const k in h) { if (Object.prototype.hasOwnProperty.call(h, k)) obj[k] = h[k]; }
        }
      }
      if (!obj['X-Request-Id']) obj['X-Request-Id'] = newId();
      const newInit = {};
      for (const k in init) { if (Object.prototype.hasOwnProperty.call(init, k)) newInit[k] = init[k]; }
      newInit.headers = obj;
      init = newInit;
    }
    return _orig(input, init);
  };
})();
