// ============================================================
// algorithm-resolver.js — Browser-compatible algorithm parameter resolver
// ============================================================
// Loads algorithm-registry data (JSON) and provides runtime parameter
// lookups for hybrid-kem-client.js, gm.js, and any browser context.
//
// This is the AA (Algorithm Agility) foundation:
//   - No hardcoded IANA group IDs, key sizes, or algorithm names
//   - Runtime param lookup from structured registry
//   - fallback to defaults if data not loaded
// ============================================================

(function (global) {
  'use strict';

  var _registry = null;
  var _byId = {};
  var _loaded = false;

  // ---- Default fallback params (for resilience) ----
  var DEFAULTS = {
    'ML-KEM-768': {
      pkSize: 1184, skSize: 2400, ctSize: 1088, ssSize: 32,
      ianaGroup: 4590, nistLevel: 3, quantumBits: 128
    },
    'ML-KEM-1024': {
      pkSize: 1568, skSize: 3168, ctSize: 1568, ssSize: 32,
      ianaGroup: null, nistLevel: 5, quantumBits: 192
    },
    'SM2': {
      pkSize: 65, skSize: 32, ssSize: 32,
      ianaGroup: 41, nistLevel: null, quantumBits: null
    },
    'P-256': {
      pkSize: 65, skSize: 32, ssSize: 32,
      ianaGroup: 23, nistLevel: null, quantumBits: null
    },
    'X25519': {
      pkSize: 32, skSize: 32, ssSize: 32,
      ianaGroup: 29, nistLevel: null, quantumBits: null
    }
  };

  // ---- Core API ----

  /**
   * Load registry data from a JSON object.
   * @param {object} data — algorithm-registry export JSON
   */
  function load(data) {
    _registry = data;
    _byId = {};
    if (data && data.algorithms) {
      data.algorithms.forEach(function (alg) {
        _byId[alg.id] = alg;
      });
    }
    _loaded = true;
  }

  /**
   * Async load from URL (returns Promise).
   * @param {string} url — path to registry JSON
   */
  function loadFrom(url) {
    return fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) { load(data); return data; });
  }

  // ---- Query ----

  /** Get algorithm metadata by id */
  function get(id) {
    return _byId[id] || null;
  }

  /** Check if registry is loaded */
  function isLoaded() {
    return _loaded;
  }

  /** List all algorithm IDs */
  function ids() {
    return Object.keys(_byId);
  }

  /** List algorithms by category */
  function byCategory(cat) {
    return (Object.values(_byId)).filter(function (a) {
      return a.category === cat;
    });
  }

  /** Get PQC-ready algorithms only */
  function pqcReady() {
    return (Object.values(_byId)).filter(function (a) {
      return a.pqcReady === true;
    });
  }

  // ---- Parameter Resolution ----

  /**
   * Resolve a parameter for an algorithm, with fallback chain:
   *   1. Registry data (if loaded)
   *   2. Built-in DEFAULTS
   *   3. null (not found)
   */
  function resolveParam(algoId, paramName) {
    // Try registry
    if (_loaded && _byId[algoId]) {
      var params = _byId[algoId].params;
      if (params && params[paramName] !== undefined) {
        return params[paramName];
      }
    }
    // Try defaults
    if (DEFAULTS[algoId] && DEFAULTS[algoId][paramName] !== undefined) {
      return DEFAULTS[algoId][paramName];
    }
    return null;
  }

  /**
   * Get IANA group ID for an algorithm.
   * Falls back through ML-KEM-768→SM2→P-256 order.
   */
  function ianaGroup(algoId) {
    // Try registry first
    if (_loaded && _byId[algoId]) {
      var g = (_byId[algoId].params || {}).ianaGroup;
      if (g !== undefined && g !== null) return g;
    }
    // Try exact default match only (don't fallback to unrelated algos)
    if (DEFAULTS[algoId] && DEFAULTS[algoId].ianaGroup != null) {
      return DEFAULTS[algoId].ianaGroup;
    }
    return null;
  }

  /** Get public key size in bytes */
  function pkSize(algoId) {
    return resolveParam(algoId, 'pkSize') || 64;
  }

  /** Get secret/private key size in bytes */
  function skSize(algoId) {
    return resolveParam(algoId, 'skSize') || 32;
  }

  /** Get ciphertext size in bytes (for KEMs) */
  function ctSize(algoId) {
    return resolveParam(algoId, 'ctSize') || 1088;
  }

  /** Get shared secret size in bytes */
  function ssSize(algoId) {
    return resolveParam(algoId, 'ssSize') || 32;
  }

  /**
   * Get preferred algorithms in priority order.
   * Returns array of algorithm IDs: PQC first, then classic fallbacks.
   */
  function preferredAlgorithms() {
    if (!_loaded) {
      return ['ML-KEM-768', 'SM2', 'P-256'];
    }
    var pqc = pqcReady();
    var classic = byCategory('classic');
    var all = pqc.concat(classic);
    return all.filter(function (a) { return a.id !== undefined; }).map(function (a) { return a.id; });
  }

  /**
   * Get full key exchange parameters for a given algorithm.
   * Returns { pk, sk, ct, ss, ianaGroup } or null.
   */
  function kemParams(algoId) {
    return {
      pk: pkSize(algoId),
      sk: skSize(algoId),
      ct: ctSize(algoId),
      ss: ssSize(algoId),
      ianaGroup: ianaGroup(algoId)
    };
  }

  // ---- Export ----
  var API = {
    load: load,
    loadFrom: loadFrom,
    isLoaded: isLoaded,
    get: get,
    ids: ids,
    byCategory: byCategory,
    pqcReady: pqcReady,
    ianaGroup: ianaGroup,
    pkSize: pkSize,
    skSize: skSize,
    ctSize: ctSize,
    ssSize: ssSize,
    kemParams: kemParams,
    preferredAlgorithms: preferredAlgorithms,
    DEFAULTS: DEFAULTS
  };

  // Expose globally
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.AlgorithmResolver = API;
  }

})(typeof window !== 'undefined' ? window : global);
