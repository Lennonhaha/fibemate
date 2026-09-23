// SPDX-License-Identifier: GPL-3.0-only
/**
 * Type definitions for the FIBEMATE Double-Ratchet / key-lifecycle surface.
 *
 * Describes `packages/key-lifecycle` (KeyLifecycleManager + KLSession). This is the
 * post-handshake ratcheting / key-rotation primitive, NOT the ML-KEM KEM itself.
 * `KLSession` extends `PQRatchetSession` and adds PQ rekey on top of the symmetric ratchet.
 *
 * See also issue #35.
 */

export type RatchetAlgorithm = 'ML-KEM-768' | string;

export interface KeyVersion {
  version: number;
  keyMaterial: Uint8Array;
  algorithm: RatchetAlgorithm;
  createdAt: number;
  expiresAt: number;
  isExpired(now?: number): boolean;
  isOverused(maxMsgs: number): boolean;
  fingerprint(): string;
}

export interface RevocationEntry {
  keyVersion: number;
  reason: string;
  revokedAt: number;
  expiresAt: number;
  replacedBy: number | null;
}

export interface KeyLifecycleConfig {
  maxMessagesPerKey?: number;
  rotationGraceMs?: number;
  persistPath?: string;
}

export interface KeyLifecycleManager {
  bootstrap(keyMaterial: Uint8Array, algorithm?: RatchetAlgorithm): KeyVersion;
  current(): KeyVersion;
  get(version: number): KeyVersion | undefined;
  listActive(): KeyVersion[];
  listActiveSorted(): KeyVersion[];
  rotate(newKeyMaterial: Uint8Array, reason?: string): KeyVersion;
  emergencyRotate(newKeyMaterial: Uint8Array): KeyVersion;
  revokeKey(version: number, reason?: string): void;
  isRevoked(version: number): boolean;
  getRevocationList(): RevocationEntry[];
  encryptUsed(): number;
  decryptUsed(version: number): number;
  exportState(): unknown;
  auditReport(): unknown;
  persistNow(): Promise<void>;
}

export interface RatchetStep {
  header: Uint8Array;
  ciphertext: Uint8Array;
  iv: Uint8Array;
}

export interface MessageKeys {
  header: Uint8Array;
  ciphertext: Uint8Array;
  iv: Uint8Array;
}

export interface PQRatchetSessionState {
  klState: unknown;
  kemCt?: Uint8Array;
}

export interface KLSession {
  initAsAlice(peerMLKEMPub: Uint8Array, peerP256Pub: Uint8Array): Promise<void>;
  initAsBob(mlkemSK: Uint8Array, p256SPKPair: CryptoKeyPair, aliceKemCt: Uint8Array, aliceEKPub: Uint8Array): Promise<void>;
  encrypt(plaintext: Uint8Array): Promise<RatchetStep>;
  decrypt(header: Uint8Array, ciphertext: Uint8Array, iv: Uint8Array): Promise<Uint8Array>;
  handleRekeyResponse(peerNewPQPub: Uint8Array, rekeyCt: Uint8Array): Promise<void>;
  handleRekeyRequest(peerPQPub: Uint8Array, reason?: string): Promise<void>;
  serialize(): string;
}

export function createKLSession(config?: KeyLifecycleConfig): KLSession;
export function importKLSession(jsonStr: string): Promise<KLSession>;
