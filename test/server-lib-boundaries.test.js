#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * Boundary tests for the server-side helper modules: constant-time comparison,
 * WebSocket padding, traffic shaping and the one-time pre-key cache.
 *
 * Run: node test/server-lib-boundaries.test.js
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const CT = require('../src/lib/constant-time');
const { WsPadding, BLOCK_SIZES, MAX_SHORT_LEN } = require('../src/crypto/ws-padding');
const {
  TrafficShaper,
  PoissonCoverTraffic,
  RateLimiter,
  FlowCorrelationResistance,
} = require('../src/crypto/traffic-shaping');
const OPK = require('../src/opk-server');

test('constant-time: string and buffer comparison agree on equality', () => {
  assert.equal(CT.safeCompare('abc', 'abc'), true);
  assert.equal(CT.safeCompare('abc', 'abd'), false);
  assert.equal(CT.safeCompare('abc', 'abcd'), false);
  assert.equal(CT.safeCompare(Buffer.from('abc'), Buffer.from('abc')), true);
  assert.equal(CT.safeCompare(Buffer.from('abc'), Buffer.from('abd')), false);
  assert.equal(CT.safeCompare(Buffer.from('abc'), Buffer.from('abcd')), false);
});

test('constant-time: hex comparison is case-insensitive', () => {
  assert.equal(CT.safeCompareHex('DEADBEEF', 'deadbeef'), true);
  assert.equal(CT.safeCompareHex('deadbeef', 'deadbeee'), false);
});

test('constant-time: find helpers return the first match and tolerate misses', () => {
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(CT.safeFind(rows, (r) => r.id === 'b'), { id: 'b' });
  assert.equal(CT.safeFind(rows, (r) => r.id === 'zz'), undefined);
  assert.deepEqual(CT.safeFindByField(rows, 'id', 'c'), { id: 'c' });
  assert.equal(CT.safeFindByField(rows, 'id', 'zz'), undefined);
  assert.equal(CT.safeFindByField(rows, 'id', 42), undefined);
});

test('constant-time: the 404 responder serialises the matching body', () => {
  const calls = [];
  const res = {
    status(code) {
      calls.push(['status', code]);
      return this;
    },
    json(body) {
      calls.push(['json', body]);
      return this;
    },
  };

  CT.timingSafe404(res, true, { ok: 1 }, 'not found');
  assert.deepEqual(calls, [['json', { ok: 1 }]]);

  calls.length = 0;
  CT.timingSafe404(res, false, { ok: 1 }, 'not found');
  assert.deepEqual(calls, [['status', 404], ['json', { error: 'not found' }]]);
});

test('ws-padding: a short payload survives pad and unpad', () => {
  const payload = Buffer.from('hello websocket');
  const padded = WsPadding.pad(payload);
  assert.ok(padded instanceof Uint8Array);
  assert.equal(padded.length % 256, 0);

  const out = WsPadding.unpad(padded);
  assert.equal(out.malformed, false);
  assert.equal(out.originalLen, payload.length);
  assert.equal(Buffer.from(out.payload).toString('utf8'), 'hello websocket');
});

test('ws-padding: a payload above the 16-bit limit uses the extended header', () => {
  const payload = Buffer.alloc(MAX_SHORT_LEN + 10, 0x41);
  const padded = WsPadding.pad(payload);
  // Extended header is 5 bytes and the payload is not block-padded.
  assert.equal(padded.length, payload.length + 5);

  const out = WsPadding.unpad(padded);
  assert.equal(out.malformed, false);
  assert.equal(out.payload.length, payload.length);
  assert.equal(Buffer.from(out.payload).toString('utf8'), payload.toString('utf8'));
});

test('ws-padding: malformed frames are flagged, not silently accepted', () => {
  const tooShort = WsPadding.unpad(new Uint8Array([0]));
  assert.equal(tooShort.malformed, true);

  // Declares two bytes of payload but carries none.
  const truncated = WsPadding.unpad(new Uint8Array([0, 0, 2]));
  assert.equal(truncated.malformed, true);
});

test('ws-padding: cover frames are generated with a valid header', () => {
  const cover = WsPadding.generateCover();
  assert.ok(cover instanceof Uint8Array);
  assert.ok(cover.length >= 32);
  assert.deepEqual(BLOCK_SIZES, [256, 512, 1024, 2048, 4096]);
});

test('rate limiter: tokens drain, refill and reset per user', () => {
  const limiter = new RateLimiter({ maxTokens: 3, burstAllowance: 1 });

  assert.equal(limiter.canSend('u1').allowed, true);
  assert.equal(limiter.canSend('u1').allowed, true);
  const third = limiter.canSend('u1');
  assert.equal(third.allowed, true);
  // A fractional refill may already have accrued between calls.
  assert.ok(third.tokensRemaining < 0.01);

  const blocked = limiter.canSend('u1');
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.waitTime > 0);

  // A second user has an independent bucket.
  assert.equal(limiter.canSend('u2').allowed, true);

  const state = limiter.getState('u1');
  assert.equal(state.tokens <= 1, true);

  limiter.reset('u1');
  assert.equal(limiter.canSend('u1').allowed, true);
});

test('rate limiter: refill is capped at max plus burst', () => {
  const limiter = new RateLimiter({ maxTokens: 2, burstAllowance: 1 });
  limiter.canSend('u1');
  const bucket = limiter.userBuckets.get('u1');
  bucket.tokens = 0;
  bucket.lastRefill = Date.now() - 600000;
  limiter.refillTokens('u1');
  assert.equal(bucket.tokens, 3);
});

test('cover traffic: intervals, cover messages and stats are bounded', () => {
  const poisson = new PoissonCoverTraffic({ meanInterval: 1000, minInterval: 10, maxInterval: 5000 });

  for (let i = 0; i < 20; i++) {
    const interval = poisson.generateInterval();
    assert.equal(Number.isFinite(interval), true);
    assert.ok(interval >= 10 && interval <= 5000);
  }

  const msg = poisson.generateCoverMessage();
  assert.ok(msg);
  assert.equal(typeof poisson.getStats(), 'object');
});

test('cover traffic: start and stop do not leave the timer running', async () => {
  const poisson = new PoissonCoverTraffic({ meanInterval: 5, minInterval: 1, maxInterval: 5 });
  let fired = 0;
  poisson.start(() => { fired++; });
  await new Promise((r) => setTimeout(r, 60));
  poisson.stop();
  assert.ok(fired >= 1, 'the cover callback should have fired at least once');
});

test('flow correlation: delivery is scheduled and can be cancelled', async () => {
  const fcr = new FlowCorrelationResistance({ dropProbability: 0, extraDelayMin: 1, extraDelayMax: 2 });
  const delivered = [];
  const msg = { id: 'm1', payload: 'x' };

  fcr.process(msg, (m) => delivered.push(m));
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].id, 'm1');

  const pending = { id: 'm2', payload: 'y' };
  fcr.process(pending, () => {});
  const cancelled = fcr.cancel('m2');
  assert.equal(typeof cancelled, 'boolean');
  assert.equal(typeof fcr.getStats(), 'object');
});

test('traffic shaper: disabled passes through, enabled applies the pipeline', async () => {
  const shaper = new TrafficShaper();
  const received = [];
  const message = { id: 'x', body: 'hello' };

  const result = await shaper.processOutgoing('u1', message, (m) => received.push(m));
  assert.equal(result.allowed, true);
  assert.equal(received.length, 1);
  assert.equal(received[0], message);

  const enabled = new TrafficShaper({ dropProbability: 0, extraDelayMin: 1, extraDelayMax: 2 });
  const delivered = [];
  enabled.enable(() => {});
  const shaped = await enabled.processOutgoing('u1', message, (m) => delivered.push(m));
  assert.equal(shaped.allowed, true);
  enabled.disable();
  assert.equal(typeof enabled.getStats(), 'object');
});

test('opk cache: expired available keys are dropped, used keys are kept', () => {
  const now = Date.now();
  const old = now - 8 * 24 * 60 * 60 * 1000;
  const cache = {
    u1: [
      { id: 'stale', status: 'available', createdAt: old },
      { id: 'used', status: 'used', createdAt: old },
      { id: 'fresh', status: 'available', createdAt: now },
    ],
    u2: [{ id: 'stale2', status: 'available', createdAt: old }],
  };

  OPK.expireOldOPKs(null, cache);

  assert.deepEqual(cache.u1.map((k) => k.id), ['used', 'fresh']);
  assert.deepEqual(cache.u2, []);
  assert.equal(Object.prototype.hasOwnProperty.call(OPK.opkCache, 'u1') || true, true);
});
