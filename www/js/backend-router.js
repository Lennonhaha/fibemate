/**
 * FIBEMATE Backend Router — Grayscale toggle between Node.js and Rust backends.
 * Must load BEFORE modules/app-state.js so API_BASE picks up the correct prefix.
 *
 * How it works:
 *   app-state.js reads localStorage.fk_api_base → this script sets it based on fibemate_backend.
 *   WSManager.js derives WS URL from apiBase → automatically uses /rust/ws when Rust is active.
 *
 * Console usage:
 *   BackendRouter.switchTo('rust')  // switch to Rust + reload
 *   BackendRouter.switchTo('node')  // switch to Node.js + reload
 *   BackendRouter.getBackend()      // "rust" or "node"
 */
(function () {
  'use strict';

  var BE_KEY = 'fibemate_backend';
  var API_KEY = 'fk_api_base';
  var RUST = 'rust';
  var NODE = 'node';
  var current = localStorage.getItem(BE_KEY) || NODE;

  // Sync: set fk_api_base so app-state.js picks it up
  var apiBase = current === RUST
    ? location.origin + '/rust/api'
    : location.origin + '/api';
  localStorage.setItem(API_KEY, apiBase);

  window.BackendRouter = {
    getBackend: function () { return current; },
    isRust: function () { return current === RUST; },
    switchTo: function (backend) {
      if (backend !== RUST && backend !== NODE) return false;
      localStorage.setItem(BE_KEY, backend);
      location.reload();
      return true;
    },
    RUST: RUST,
    NODE: NODE
  };

  console.log('[BackendRouter] Backend: ' + current + ' | API: ' + apiBase);
})();