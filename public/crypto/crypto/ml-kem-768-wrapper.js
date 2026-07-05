/**
 * ML-KEM-768 WASM-compatible wrapper
 * Bridges the pure JS time-domain implementation to the expected WASM interface
 * Used by message-crypto-v2.js for hybrid X3DH
 */

// Load the pure JS implementation first
// Note: ml-kem-768.js (copied from ml-kem-768-td.js) must be loaded before this file

const MLKEM768Wrapper = {
  initialized: false,
  
  // Promise that resolves when initialization is complete
  _initPromise: null,
  
  init() {
    if (this._initPromise) return this._initPromise;
    if (this.initialized) return Promise.resolve();
    
    this._initPromise = new Promise((resolve, reject) => {
      // Check if the pure JS implementation is available
      if (typeof MLKEM768 === 'undefined') {
        console.error('[ML-KEM] Pure JS implementation not loaded. Make sure ml-kem-768.js is loaded first.');
        reject(new Error('ML-KEM-768 implementation not available'));
        return;
      }
      
      this.initialized = true;
      console.log('[ML-KEM] WASM-compatible wrapper initialized (pure JS time-domain)');
      resolve();
    });
    
    return this._initPromise;
  },
  
  // Generate keypair - returns {publicKey, secretKey} (consistent with core)
  keygen() {
    if (!this.initialized) throw new Error('ML-KEM-768 not initialized');
    
    const kp = MLKEM768.generateKeypair();
    return {
      publicKey: kp.publicKey,
      secretKey: kp.secretKey
    };
  },
  
  // Encapsulate - returns {ciphertext, sharedSecret}
  encaps(publicKey) {
    if (!this.initialized) throw new Error('ML-KEM-768 not initialized');
    
    const result = MLKEM768.encapsulate(publicKey);
    return {
      ciphertext: result.ciphertext,
      sharedSecret: result.sharedSecret
    };
  },
  
  // Decapsulate - returns sharedSecret
  decaps(secretKey, ciphertext) {
    if (!this.initialized) throw new Error('ML-KEM-768 not initialized');
    
    return MLKEM768.decapsulate(secretKey, ciphertext);
  }
};

// Auto-init if MLKEM768 is already loaded
if (typeof MLKEM768 !== 'undefined') {
  MLKEM768Wrapper.init().catch(err => {
    console.warn('[ML-KEM] Auto-init failed:', err.message);
  });
} else {
  // Wait for ml-kem-768.js to load (it may be loaded async)
  window.addEventListener('load', () => {
    if (typeof MLKEM768 !== 'undefined' && !MLKEM768Wrapper.initialized) {
      MLKEM768Wrapper.init().catch(err => {
        console.warn('[ML-KEM] Deferred auto-init failed:', err.message);
      });
    }
  });
}

// Export to window (replaces or supplements WASM module)
if (typeof window !== 'undefined') {
  // Only set if not already set by WASM
  if (!window.MLKEM768 || !window.MLKEM768.initialized) {
    window.MLKEM768 = MLKEM768Wrapper;
    console.log('[ML-KEM] WASM-compatible wrapper registered on window.MLKEM768');
  } else {
    console.log('[ML-KEM] WASM module already present, wrapper not registered');
  }
}

// Also expose as global for direct access
if (typeof window !== 'undefined') {
  window.MLKEM768Wrapper = MLKEM768Wrapper;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MLKEM768Wrapper;
}
