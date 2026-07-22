// SPDX-License-Identifier: GPL-3.0-only
/**
 * Backend Router — dual-backend (Node.js + Rust) dynamic switching
 * FIBEMATE v2.21-zk-ts
 *
 * Controls WebSocket and API routing based on user-selected backend.
 * Default: Node.js (stable). Experimental: Rust (:8080).
 */

const BACKEND_STORAGE_KEY = 'fibemate_backend';

export const BackendType = Object.freeze({
  NODE: 'node',
  RUST: 'rust',
});

// --- state ---

let _current = null;
const _listeners = [];

function _resolve() {
  return localStorage.getItem(BACKEND_STORAGE_KEY) || BackendType.NODE;
}

function _dispatchChange(oldType, newType) {
  for (const fn of _listeners) {
    try { fn(newType, oldType); } catch (e) { /**/ }
  }
}

// --- public API ---

/** Return current backend type (lazy-init from localStorage). */
export function getCurrentBackend() {
  if (_current === null) _current = _resolve();
  return _current;
}

/** Switch backend and optionally reload the page. */
export function setBackend(type) {
  const old = getCurrentBackend();
  if (type !== BackendType.NODE && type !== BackendType.RUST) {
    console.warn('[BackendRouter] Unknown backend type:', type);
    return false;
  }
  if (type === old) return false;

  _current = type;
  localStorage.setItem(BACKEND_STORAGE_KEY, type);
  _dispatchChange(old, type);

  // Persist across sessions — reload is the cleanest way to re-bind WS
  const shouldReload = window.confirm(
    type === BackendType.RUST
      ? 'Switch to Rust experimental backend?\n\nThis will reload the page.'
      : 'Switch back to Node.js stable backend?\n\nThis will reload the page.'
  );
  if (shouldReload) window.location.reload();
  return true;
}

/** Listen for backend changes. Returns unsubscribe function. */
export function onBackendChange(fn) {
  _listeners.push(fn);
  return () => {
    const idx = _listeners.indexOf(fn);
    if (idx >= 0) _listeners.splice(idx, 1);
  };
}

/** WebSocket URL for the active backend. */
export function getWebSocketUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host = window.location.host;

  if (getCurrentBackend() === BackendType.RUST) {
    return `${proto}://${host}/rust/ws`;
  }
  return `${proto}://${host}/ws`;
}

/** REST API base path for the active backend. */
export function getApiBase() {
  if (getCurrentBackend() === BackendType.RUST) {
    return '/rust/api';
  }
  return '/api';
}

/** Human-readable label for the active backend. */
export function getBackendLabel() {
  return getCurrentBackend() === BackendType.RUST
    ? 'Rust (experimental)'
    : 'Node.js (stable)';
}
