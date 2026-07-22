// SPDX-License-Identifier: GPL-3.0-only
/**
 * FIBEMATE ZK-SNARKs Integration v1.0
 * 
 * Real Groth16 zero-knowledge proofs using Circom + snarkjs
 * Replaces the previous Schnorr-like ZK implementation (zk-auth.js)
 * 
 * Architecture:
 *   Circuit (Circom) → R1CS → WASM → Browser-side proof generation
 *   Verification key → Server-side proof verification
 * 
 * Proof flow:
 *   1. User computes Poseidon hash commitment (off-circuit)
 *   2. Browser generates Groth16 proof using WASM prover
 *   3. Only proof + public signals sent to server
 *   4. Server verifies proof using verification key
 *   5. No private data (username, salt) ever leaves the browser
 */

const API = window.location.origin + '/api';

// Paths to circuit artifacts (compiled by circom)
const CIRCUIT_PATHS = {
    wasm: '/circuits/build/identity.wasm',
    zkey: '/circuits/build/setup/identity_final.zkey',
    vkey: '/circuits/build/setup/verification_key.json'
};

// Fallback paths for development
const DEV_PATHS = {
    wasm: window.location.origin + '/circuits/build/identity.wasm',
    zkey: window.location.origin + '/circuits/build/setup/identity_final.zkey',
    vkey: window.location.origin + '/circuits/build/setup/verification_key.json'
};

function log(msg) {
    console.log('[ZK-SNARKs]', msg);
    var d = document.getElementById('debugLog');
    if (d) d.innerHTML += '<div style="margin:2px 0;border-bottom:1px solid #222;">[ZK-SNARKs] ' + 
        String(msg).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>';
}

// ===== Poseidon Hash (off-circuit, matches circomlib) =====

/**
 * Poseidon hash computation using circomlibjs
 * Must match the Poseidon implementation in the circuit exactly
 */
let poseidonHasher = null;

async function initPoseidon() {
    if (poseidonHasher) return poseidonHasher;
    try {
        // Try to use circomlibjs if available
        if (typeof circomlibjs !== 'undefined') {
            poseidonHasher = await circomlibjs.buildPoseidon();
            log('Poseidon hasher initialized (circomlibjs)');
            return poseidonHasher;
        }
    } catch (e) {
        log('circomlibjs not available, using fallback');
    }
    
    // Fallback: Use a simplified Poseidon-like hash
    // NOTE: This MUST be replaced with circomlibjs in production
    // The circuit uses the real Poseidon, so this MUST produce identical output
    poseidonHasher = {
        F: {
            toObject: (x) => x,
            fromObject: (x) => x,
            e: (x) => BigInt(x)
        },
        hash: async function(inputs) {
            // SECURITY WARNING: This is a PLACEHOLDER
            // In production, use circomlibjs.buildPoseidon() which produces
            // the exact same output as the Circom circuit
            if (typeof ffjavascript !== 'undefined' && ffjavascript.buildPoseidon) {
                const p = await ffjavascript.buildPoseidon();
                return p(inputs);
            }
            
            // Emergency fallback: SHA-256 based (does NOT match circuit output)
            // This will produce WRONG proofs that fail verification
            // You MUST install circomlibjs for correct operation
            throw new Error(
                '[ZK-SNARKs] CRITICAL: circomlibjs not loaded. ' +
                'Poseidon hash computation requires circomlibjs to match circuit output. ' +
                'Add <script src="https://unpkg.com/circomlibjs@0.1.7/circomlib.js"></script> to index.html'
            );
        }
    };
    return poseidonHasher;
}

// ===== Utility Functions =====

/**
 * Convert string to BigInt for circuit input
 * Uses SHA-256 to hash the string first, then converts to field element
 */
async function stringToField(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const hashHex = Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    // Take modulo p (Baby JubJub field size) to ensure valid field element
    const p = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');
    return BigInt('0x' + hashHex) % p;
}

/**
 * Generate random field element
 */
function randomFieldElement() {
    const p = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return BigInt('0x' + hex) % p;
}

/**
 * Convert BigInt to hex string (no 0x prefix)
 */
function bigIntToHex(n) {
    return n.toString(16).padStart(64, '0');
}

// ===== ZK-SNARKs Prover =====

class ZKSnarksProver {
    constructor() {
        this.initialized = false;
        this.wasmPath = CIRCUIT_PATHS.wasm;
        this.zkeyPath = CIRCUIT_PATHS.zkey;
        this.vkeyPath = CIRCUIT_PATHS.vkey;
    }

    /**
     * Initialize prover (load WASM and zKey)
     */
    async init() {
        if (this.initialized) return;
        
        try {
            await initPoseidon();
            log('Poseidon hasher ready');
            
            // Pre-fetch circuit artifacts to verify availability
            // Actual loading happens during proof generation
            this.initialized = true;
            log('ZK-SNARKs Prover initialized');
        } catch (error) {
            log('Prover init failed: ' + error.message);
            throw error;
        }
    }

    /**
     * Generate ZK-SNARKs proof for identity
     * 
     * Proves: "I know username_hash and salt such that 
     *          Poseidon(username_hash, salt) = commitment"
     * 
     * @param {string} username - Username (never sent to server)
     * @param {string} salt - Random salt (never sent to server)
     * @param {BigInt} commitment - Poseidon commitment (public)
     * @returns {Promise<{proof: Object, publicSignals: Array}>}
     */
    async generateIdentityProof(username, salt, commitment) {
        if (!this.initialized) await this.init();
        
        const usernameHashField = await stringToField(username);
        const saltField = typeof salt === 'bigint' ? salt : BigInt(salt);
        
        // Prepare circuit input
        const input = {
            username_hash: usernameHashField.toString(),
            salt: saltField.toString(),
            expectedCommitment: commitment.toString()
        };
        
        log('Generating ZK-SNARKs proof...');
        const startTime = performance.now();
        
        try {
            // Check if snarkjs is available
            if (typeof snarkjs === 'undefined') {
                throw new Error(
                    'snarkjs not loaded. Add <script src="https://unpkg.com/snarkjs@0.7.5/build/snarkjs.min.js"></script>'
                );
            }
            
            const { proof, publicSignals } = await snarkjs.groth16.fullProve(
                input,
                this.wasmPath,
                this.zkeyPath
            );
            
            const elapsed = Math.round(performance.now() - startTime);
            log('Proof generated in ' + elapsed + 'ms');
            
            return { proof, publicSignals };
        } catch (error) {
            log('Proof generation failed: ' + error.message);
            throw new Error('ZK proof generation failed: ' + error.message);
        }
    }

    /**
     * Verify a ZK-SNARKs proof locally (client-side)
     * Server-side verification is the authoritative check
     */
    async verifyProof(proof, publicSignals) {
        try {
            const vKeyResponse = await fetch(this.vkeyPath);
            const vKey = await vKeyResponse.json();
            
            const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);
            log('Local verification result: ' + isValid);
            return isValid;
        } catch (error) {
            log('Local verification failed: ' + error.message);
            return false;
        }
    }
}

// ===== Registration & Login Flows =====

/**
 * ZK-SNARKs Anonymous Registration
 * 
 * Flow:
 * 1. Generate commitment from username + salt using Poseidon
 * 2. Generate ZK proof of knowledge of preimage
 * 3. Send ONLY commitment + proof to server (username and salt stay local)
 * 4. Server verifies proof and stores commitment (no username stored)
 */
async function zkSnarksRegister(username) {
    log('ZK-SNARKs Registration | user=<hidden>');

    // Downgrade attack protection
    if (typeof SecurityLevels !== 'undefined' && SecurityLevels.enforceMinimum) {
        SecurityLevels.enforceMinimum(SecurityLevels.LEVEL.ZK_VERIFIED, 'ZK-SNARKs-register');
    }

    try {
        const prover = new ZKSnarksProver();
        await prover.init();
        
        // 1. Hash username to field element
        const usernameHashField = await stringToField(username);
        
        // 2. Generate random salt
        const salt = randomFieldElement();
        
        // 3. Compute commitment using Poseidon (matches circuit)
        const poseidon = await initPoseidon();
        const commitment = poseidon.F.toObject(
            await poseidon.hash([usernameHashField, salt])
        );
        
        log('Commitment computed: ' + bigIntToHex(commitment).substring(0, 16) + '...');
        
        // 4. Generate ZK proof
        const { proof, publicSignals } = await prover.generateIdentityProof(
            username, salt, commitment
        );
        
        // 5. Send to server - ONLY commitment and proof, NOT username or salt
        const body = JSON.stringify({
            commitment: bigIntToHex(commitment),
            proof: snarkjs.groth16.exportSolidityCallData(proof, publicSignals),
            publicSignals: publicSignals.map(String)
        });
        
        log('POST /auth/register-zk-snarks');
        const res = await fetch(API + '/auth/register-zk-snarks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body
        });
        
        if (!res.ok) {
            const text = await res.text();
            throw new Error(text);
        }
        
        const data = await res.json();
        
        // 6. Store secrets locally (encrypted in production)
        // CRITICAL: salt must never be sent to server
        localStorage.setItem('zk_snarks_secrets', JSON.stringify({
            username: username,
            salt: salt.toString(),
            commitment: bigIntToHex(commitment),
            usernameHash: usernameHashField.toString()
        }));
        
        sessionStorage.setItem('fk_token', data.token);
        sessionStorage.setItem('fk_uid', data.userId);
        sessionStorage.setItem('fk_uname', data.displayName || username);
        
        log('ZK-SNARKs Registration SUCCESS!');
        return data;
    } catch (e) {
        log('Registration failed: ' + e.message);
        throw e;
    }
}

/**
 * ZK-SNARKs Anonymous Login
 * 
 * Flow:
 * 1. Retrieve stored salt and commitment from local storage
 * 2. Generate fresh ZK proof proving knowledge of preimage
 * 3. Send proof + commitment to server
 * 4. Server verifies proof and issues token
 */
async function zkSnarksLogin() {
    log('ZK-SNARKs Login');

    // Downgrade attack protection
    if (typeof SecurityLevels !== 'undefined' && SecurityLevels.enforceMinimum) {
        SecurityLevels.enforceMinimum(SecurityLevels.LEVEL.ZK_VERIFIED, 'ZK-SNARKs-login');
    }

    try {
        // 1. Retrieve stored secrets
        const secretsJson = localStorage.getItem('zk_snarks_secrets');
        if (!secretsJson) throw new Error('No ZK-SNARKs credentials found. Please register first.');
        const secrets = JSON.parse(secretsJson);
        
        const prover = new ZKSnarksProver();
        await prover.init();
        
        // 2. Generate fresh proof for this login session
        const commitment = BigInt('0x' + secrets.commitment);
        const { proof, publicSignals } = await prover.generateIdentityProof(
            secrets.username, BigInt(secrets.salt), commitment
        );
        
        // 3. Send proof to server
        const body = JSON.stringify({
            commitment: secrets.commitment,
            proof: snarkjs.groth16.exportSolidityCallData(proof, publicSignals),
            publicSignals: publicSignals.map(String),
            timestamp: Date.now()
        });
        
        log('POST /auth/login-zk-snarks');
        const res = await fetch(API + '/auth/login-zk-snarks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body
        });
        
        if (!res.ok) {
            const text = await res.text();
            throw new Error(text);
        }
        
        const data = await res.json();
        sessionStorage.setItem('fk_token', data.token);
        sessionStorage.setItem('fk_uid', data.userId);
        sessionStorage.setItem('fk_uname', data.displayName || secrets.username);
        
        log('ZK-SNARKs Login SUCCESS!');
        return data;
    } catch (e) {
        log('Login failed: ' + e.message);
        throw e;
    }
}

// ===== Compatibility Layer =====
// Provides same API as zk-auth.js for seamless migration

const ZKSnarks = {
    doRegister: zkSnarksRegister,
    doLogin: async function(username, password) {
        // Standard login falls through to existing auth
        // ZK login doesn't need password
        return zkSnarksLogin();
    },
    doZKRegister: zkSnarksRegister,
    doZKLogin: zkSnarksLogin,
    doLogout: function() {
        ['fk_token','fk_uid','fk_uname','fk_priv','fk_privkey_jwk','fk_pubkey_hex','zk_snarks_secrets'].forEach(function(k) { localStorage.removeItem(k); });
        window.location.href = 'index.html';
    },
    isLoggedIn: function() { return !!sessionStorage.getItem('fk_token'); },
    getUserInfo: function() { return { token: sessionStorage.getItem('fk_token'), username: sessionStorage.getItem('fk_uname') }; }
};

// Export
if (typeof window !== 'undefined') {
    window.ZKSnarks = ZKSnarks;
    window.ZKSnarksProver = ZKSnarksProver;
    window.zkSnarksRegister = zkSnarksRegister;
    window.zkSnarksLogin = zkSnarksLogin;
    
    // Override FIBEMATE_ZK with real ZK-SNARKs implementation
    // This replaces the Schnorr-like ZK from zk-auth.js
    if (typeof FIBEMATE_ZK !== 'undefined') {
        const oldZK = window.FIBEMATE_ZK;
        window.FIBEMATE_ZK = ZKSnarks;
        window.FIBEMATE_ZK._fallback = oldZK; // Keep old as fallback
        log('FIBEMATE_ZK upgraded: Schnorr-like → Groth16 ZK-SNARKs');
    } else {
        window.FIBEMATE_ZK = ZKSnarks;
        log('FIBEMATE_ZK initialized: Groth16 ZK-SNARKs');
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ZKSnarks, ZKSnarksProver, zkSnarksRegister, zkSnarksLogin };
}

log('ZK-SNARKs v1.0 (Groth16 + Circom) loaded. snarkjs=' + (typeof snarkjs !== 'undefined' ? 'available' : 'NOT LOADED'));
