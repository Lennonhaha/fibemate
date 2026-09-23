// SPDX-License-Identifier: GPL-3.0-only
/**
 * Type definitions for the FIBEMATE OPK (One-Time-PreKey) / X3DH-style prekey surface.
 *
 * Describes `src/opk-server.js` (module.exports: { init, opkCache, expireOldOPKs,
 * startExpiryCron }). The OPK store is an in-memory cache mirrored to SQLite; it models
 * the prekey bundle half of an X3DH / Signal-style handshake. SPK (signed prekey) handling
 * is performed client-side and is intentionally not part of this server module.
 *
 * See also issue #35.
 */

export type OpkStatus = 'available' | 'consumed' | 'expired';

export interface OneTimePreKey {
  keyId: number;
  /** Prekey public material (ML-KEM-768 encapsulation key bytes). */
  publicKey: Uint8Array;
  status: OpkStatus;
  createdAt: number;
}

/** In-memory key store: userId -> uploaded prekeys. */
export type OpkCache = Record<string, OneTimePreKey[]>;

export interface OpkUploadRequest {
  userId: string;
  keys: Array<{ keyId: number; publicKey: Uint8Array }>;
}

export interface ConsumeResult {
  keyId: number;
  publicKey: Uint8Array;
}

export interface OpkServer {
  init(expressApp: unknown, db: unknown, authMiddleware: unknown): void;
  opkCache: OpkCache;
  expireOldOPKs(db: unknown, cache?: OpkCache): void;
  startExpiryCron(db: unknown, cache?: OpkCache): void;
}

declare const opkServer: OpkServer;
export default opkServer;
