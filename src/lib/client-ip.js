// SPDX-License-Identifier: GPL-3.0-only
'use strict';
/**
 * The one place that decides "which IP is this request from".
 *
 * 2026-11-15 production incident: the nginx stream(443) -> http(8443) hop was
 * not using the PROXY protocol, so `$remote_addr` was 127.0.0.1 for every
 * external client and the whole site shared a single rate-limit bucket. A page
 * reload loop burned the 30-per-15-minutes login budget and locked real users
 * out. A stop-gap patch fell back to X-Forwarded-For when X-Real-IP looked
 * loopback; both hops now enable the PROXY protocol (stream `proxy_protocol on`
 * + `listen 8443 ssl proxy_protocol` + `real_ip_header proxy_protocol`), so
 * $remote_addr is the real client address and the fallback is unnecessary.
 * X-Forwarded-For is attacker-controlled (forging it was measured to switch to
 * a fresh bucket), so it is not trusted here: not `req.ip` (which degenerates
 * to one shared bucket behind the proxy), and not XFF.
 *
 * 2026-11-23: this used to live inside src/index.js and was used only by the
 * rate limiter. `logSecurity` derived `ip` from `req.ip` instead, so every new
 * security log row recorded 127.0.0.1 - non-null, informative about nothing.
 * Both call sites now share this function; having one implementation is the
 * point.
 *
 * @param {object|null} req
 * @returns {string} client IP, the socket address, or 'unknown'
 */
function realClientKey(req) {
  const header = req && req.headers && req.headers['x-real-ip'];
  const xr = Array.isArray(header) ? header[header.length - 1] : header;
  if (xr && String(xr).trim()) return String(xr).trim();
  return (req && req.socket && req.socket.remoteAddress) || 'unknown';
}

module.exports = { realClientKey };
