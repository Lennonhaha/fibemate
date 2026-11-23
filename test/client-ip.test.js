#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * Tests for realClientKey() - the single place that decides which IP a request
 * came from - and for the wiring that makes the security log use it.
 *
 * The defect being pinned: `logSecurity` derived `ip` from `req.ip`. Behind the
 * nginx stream hop `req.ip` is the proxy socket, so every row recorded
 * 127.0.0.1. That is not "missing data", it is a constant masquerading as data,
 * which is worse: a downstream consumer cannot tell it apart from a real value.
 *
 * Negative control (executed, not asserted): swapping the implementation for
 * `req.ip` makes "X-Real-IP wins over the socket address" fail, because the
 * socket address is what would be returned.
 *
 * Run: node --test test/client-ip.test.js
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { realClientKey } = require('../src/lib/client-ip');

const ROOT = path.join(__dirname, '..');

test('X-Real-IP wins over the socket address', () => {
  const req = { headers: { 'x-real-ip': '203.0.113.9' }, socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(realClientKey(req), '203.0.113.9');
});

test('different sources produce different values (the property that matters)', () => {
  const a = realClientKey({ headers: { 'x-real-ip': '198.51.100.7' }, socket: { remoteAddress: '127.0.0.1' } });
  const b = realClientKey({ headers: { 'x-real-ip': '203.0.113.9' }, socket: { remoteAddress: '127.0.0.1' } });
  assert.notEqual(a, b);
});

test('falls back to the socket address when no header is present', () => {
  const req = { headers: {}, socket: { remoteAddress: '10.0.0.5' } };
  assert.equal(realClientKey(req), '10.0.0.5');
});

test('array-valued header uses the last element', () => {
  const req = { headers: { 'x-real-ip': ['203.0.113.1', '203.0.113.2'] }, socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(realClientKey(req), '203.0.113.2');
});

test('header value is trimmed', () => {
  assert.equal(realClientKey({ headers: { 'x-real-ip': '  203.0.113.3  ' }, socket: {} }), '203.0.113.3');
});

test('blank header does not win', () => {
  const req = { headers: { 'x-real-ip': '   ' }, socket: { remoteAddress: '10.0.0.6' } };
  assert.equal(realClientKey(req), '10.0.0.6');
});

test('X-Forwarded-For is ignored (attacker-controlled)', () => {
  const req = { headers: { 'x-forwarded-for': '1.2.3.4' }, socket: { remoteAddress: '10.0.0.7' } };
  assert.equal(realClientKey(req), '10.0.0.7');
});

test('degenerate requests do not throw', () => {
  assert.equal(realClientKey(null), 'unknown');
  assert.equal(realClientKey({}), 'unknown');
  assert.equal(realClientKey({ headers: {} }), 'unknown');
});

test('logSecurity records realClientKey, not req.ip', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/index.js'), 'utf8');
  assert.equal(
    /ip:\s*req\?\.ip\s*\|\|/.test(src),
    false,
    'src/index.js still derives the logged ip from req.ip'
  );
  assert.match(src, /ip:\s*req \? realClientKey\(req\) : null/);
});

test('the rate limiter and the audit log share one implementation', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/index.js'), 'utf8');
  assert.equal(/function realClientKey\(/.test(src), false, 'realClientKey must live in src/lib/client-ip.js only');
  assert.match(src, /require\('\.\/lib\/client-ip'\)/);
  assert.match(src, /keyGenerator:\s*realClientKey/);
});
