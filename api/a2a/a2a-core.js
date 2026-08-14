#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
/**
 * A2A Core —Agent-to-Agent Protocol v1.0
 * FIBEMATE inter-node secure communication layer.
 *
 * Protocol:
 *   GET  /a2a/health          —health check + node info
 *   POST /a2a/handshake       —exchange ML-KEM-768 public keys
 *   POST /a2a/message         —send encrypted message
 *   GET  /a2a/peers           —list known peers
 *
 * SPDX-License-Identifier: GPL-3.0-only
 */

'use strict';

const express = require('express');
const crypto = require('crypto');
const { generateKeypair, encapsulate, decapsulate } = require('../../packages/pqc-kem/src/ml-kem-768.js');

// D4 format-coupling fix: runtime PK size resolution, not hardcoded
const { mlkemPkLen, mlkemPkLenValid } = require('./a2a-params');

// ---- Constants ----
const A2A_VERSION = '1.0';
const MAX_MESSAGE_SIZE = 64 * 1024; // 64KB
const MAX_PEERS = 100;
const HANDSHAKE_TIMEOUT_MS = 30_000;

// ---- In-memory state ----
const peers = new Map();    // peerId —{ publicKey, lastSeen, address }
const sessions = new Map(); // sessionId —{ ss, peerId, createdAt }

// ---- Node identity (lazy init) ----
let nodeKeypair = null;
function getNodeKeypair() {
  if (!nodeKeypair) {
    nodeKeypair = generateKeypair();
  }
  return nodeKeypair;
}

// ---- Crypto helpers ----
function encryptPayload(ss, plaintext) {
  const key = crypto.createHash('sha256').update(Buffer.concat([ss, Buffer.from('a2a-encrypt')])).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decryptPayload(ss, ciphertextB64) {
  const buf = Buffer.from(ciphertextB64, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const key = crypto.createHash('sha256').update(Buffer.concat([ss, Buffer.from('a2a-encrypt')])).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function hashPublicKey(pk) {
  return crypto.createHash('sha256').update(pk).digest('hex').substring(0, 16);
}

// ---- Router ----
const router = express.Router();

// Parse JSON up to 64KB
router.use(express.json({ limit: MAX_MESSAGE_SIZE + 4096 }));

/**
 * GET /a2a/health
 * Returns node status and identity.
 */
router.get('/health', (_req, res) => {
  const kp = getNodeKeypair();
  res.json({
    version: A2A_VERSION,
    nodeId: hashPublicKey(kp.publicKey),
    peers: peers.size,
    sessions: sessions.size,
    uptime: process.uptime(),
    timestamp: Date.now()
  });
});

/**
 * POST /a2a/handshake
 * Body: { publicKey: <base64>, address?: string, peerId?: string }
 * Returns: { sessionId, encapsCiphertext, nodePublicKey }
 *
 * Responder side: encapsulate under initiator's public key.
 */
router.post('/handshake', (req, res) => {
  try {
    const { publicKey, address, peerId } = req.body;
    if (!publicKey) {
      return res.status(400).json({ error: 'missing publicKey' });
    }

    const pkBuf = Buffer.from(publicKey, 'base64');
    const expectedPkLen = mlkemPkLen();
    if (!mlkemPkLenValid(pkBuf.length)) {
      return res.status(400).json({ error: `invalid publicKey length: ${pkBuf.length}, expected ${expectedPkLen} (ML-KEM-768) or 1568 (ML-KEM-1024)` });
    }

    // Register or update peer
    const pid = peerId || hashPublicKey(pkBuf);
    peers.set(pid, {
      publicKey: pkBuf,
      address: address || req.ip,
      lastSeen: Date.now()
    });

    // Generate session: encapsulate under initiator's key, derive shared secret
    const enc = encapsulate(pkBuf);
    const sessionId = crypto.randomBytes(16).toString('hex');
    sessions.set(sessionId, {
      ss: Buffer.from(enc.sharedSecret),
      peerId: pid,
      createdAt: Date.now()
    });

    // Clean old sessions (>1h)
    const now = Date.now();
    for (const [sid, s] of sessions) {
      if (now - s.createdAt > 3600_000) sessions.delete(sid);
    }

    const kp = getNodeKeypair();
    res.json({
      sessionId,
      encapsCiphertext: Buffer.from(enc.ciphertext).toString('base64'),
      nodePublicKey: Buffer.from(kp.publicKey).toString('base64'),
      version: A2A_VERSION
    });
  } catch (e) {
    res.status(500).json({ error: `handshake failed: ${e.message}` });
  }
});

/**
 * POST /a2a/message
 * Body: { sessionId, ciphertext, type?: string }
 * Returns: { status, response? }
 *
 * Decrypts incoming message using session's shared secret.
 */
router.post('/message', (req, res) => {
  try {
    const { sessionId, ciphertext, type } = req.body;
    if (!sessionId || !ciphertext) {
      return res.status(400).json({ error: 'missing sessionId or ciphertext' });
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'unknown sessionId' });
    }

    let plaintext;
    try {
      plaintext = decryptPayload(session.ss, ciphertext);
    } catch {
      return res.status(400).json({ error: 'decryption failed —wrong session or corrupted message' });
    }

    // Update peer lastSeen
    const peer = peers.get(session.peerId);
    if (peer) peer.lastSeen = Date.now();

    // Route by message type
    let response = null;
    if (type === 'ping') {
      response = 'pong';
    } else if (type === 'echo') {
      response = plaintext;
    }

    res.json({
      status: 'ok',
      type: type || 'message',
      response
    });
  } catch (e) {
    res.status(500).json({ error: `message processing failed: ${e.message}` });
  }
});

/**
 * GET /a2a/peers
 * Returns list of known peers (public keys redacted).
 */
router.get('/peers', (_req, res) => {
  const peerList = [];
  for (const [id, p] of peers) {
    peerList.push({
      peerId: id,
      address: p.address,
      lastSeen: p.lastSeen,
      active: (Date.now() - p.lastSeen) < HANDSHAKE_TIMEOUT_MS
    });
  }
  res.json({ peers: peerList, count: peerList.length });
});

// ---- Cleanup (called externally) ----
function shutdown() {
  peers.clear();
  sessions.clear();
}

module.exports = { router, shutdown, getNodeKeypair, peers, sessions };
