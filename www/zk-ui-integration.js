/**
 * zk-ui-integration.js — ZK Authentication UI Bridge (v2 Full Implementation)
 * 
 * Bridges login.html's getZKUIIntegration() API to the complete
 * zk-auth.js crypto functions (P-256 + Pedersen + Schnorr ZKP).
 * 
 * Replaces the previous placeholder implementation.
 * 
 * Dependencies (loaded before this file in login.html):
 *   - zk/zk-auth.js  → doZKRegister, doZKLogin, doRegister, isLoggedIn
 *   - zk/zk-integration.js → ZKIntegration class
 * 
 * API consumed by login.html:
 *   getZKUIIntegration() → { init(), login(user, pass, opts), register(user, pass) }
 */

(function() {
  'use strict';

  // ─── State ──────────────────────────────────────────────
  let _initialized = false;
  let _currentOperation = null; // 'login' | 'register' | null

  // ─── Logging ─────────────────────────────────────────────
  function log(msg) {
    console.log('[ZKUI-Int]', msg);
  }

  function logErr(msg) {
    console.error('[ZKUI-Int]', msg);
  }

  // ─── ZKUIIntegration Class ──────────────────────────────
  /**
   * Implements the interface expected by login.html:
   *   - init(): async, returns true
   *   - login(username, password, options?): async, returns { token, userId, displayName, zkUsed, fallbackUsed?, duration? }
   *   - register(username, password): async, returns { token, userId, displayName }
   */
  class ZKUIIntegration {
    constructor() {
      this.version = '2.0-full';
    }

    /**
     * Initialize ZK UI integration.
     * Verifies that required dependencies (zk-auth.js) are loaded.
     */
    async init() {
      if (_initialized) return true;

      log('Initializing v' + this.version + '...');

      // Dependency check
      const deps = {
        'doZKRegister': typeof doZKRegister === 'function',
        'doZKLogin': typeof doZKLogin === 'function',
        'doRegister': typeof doRegister === 'function',
        'doLogin': typeof doLogin === 'function',
        'isLoggedIn': typeof isLoggedIn === 'function'
      };

      const missing = Object.entries(deps).filter(([, ok]) => !ok).map(([name]) => name);
      
      if (missing.length > 0) {
        logErr('Missing dependencies: ' + missing.join(', '));
        throw new Error('[ZKUI] Required functions not found: ' + missing.join(', ') + '. Ensure zk-auth.js is loaded before this file.');
      }

      _initialized = true;
      log('Initialized OK. All dependencies present.');
      return true;
    }

    /**
     * Login with automatic ZK detection.
     * 
     * Strategy:
     *   1. Check if user has existing ZK secrets (localStorage fk_zk_secrets)
     *      → If yes: use doZKLogin() (full ZK proof)
     *   2. If no ZK secrets but has standard key (fk_privkey_jwk)
     *      → Try standard doLogin() first
     *   3. If no keys at all
     *      → Auto-register via doZKRegister() (ZK anonymous registration)
     * 
     * @param {string} username
     * @param {string} password  
     * @param {Object} opts - Optional callbacks from login.html
     * @param {Function} opts.onProgress - (step, msg) => void
     * @param {Function} opts.onZKStep - (step, msg) => void
     * @returns {Promise<Object>} { token, userId, displayName, zkUsed, fallbackUsed?, duration? }
     */
    async login(username, password, opts) {
      await this.init();
      _currentOperation = 'login';
      const startTime = Date.now();

      const fireProgress = (step, msg) => {
        log(step + ': ' + msg);
        if (opts && typeof opts.onProgress === 'function') opts.onProgress(step, msg);
      };

      const fireZKStep = (step, msg) => {
        log('ZK-' + step + ': ' + msg);
        if (opts && typeof opts.onZKStep === 'function') opts.onZKStep(step, msg);
      };

      try {
        // ── Case 1: Returning user with ZK identity ──
        const hasZKSecrets = !!localStorage.getItem('fk_zk_secrets');
        
        if (hasZKSecrets) {
          fireProgress(1, 'Existing ZK identity detected');
          fireZKStep(1, 'Generating Schnorr proof...');
          
          const result = await doZKLogin();
          const duration = Date.now() - startTime;
          
          fireProgress(4, 'ZK login complete (' + duration + 'ms)');
          
          return {
            token: sessionStorage.getItem('fk_token'),
            userId: sessionStorage.getItem('fk_uid'),
            displayName: sessionStorage.getItem('fk_displayName') || username,
            zkUsed: true,
            duration: duration
          };
        }

        // ── Case 2: Has standard P-256 key (previous non-ZK register) ──
        const hasStandardKey = !!localStorage.getItem('fk_privkey_jwk');
        
        if (hasStandardKey && !hasZKSecrets) {
          fireProgress(1, 'Standard identity detected, attempting login...');
          
          try {
            const result = await doLogin(username, password);
            const duration = Date.now() - startTime;
            
            return {
              token: result.token || sessionStorage.getItem('fk_token'),
              userId: result.userId || sessionStorage.getItem('fk_uid'),
              displayName: result.displayName || username,
              zkUsed: false,
              fallbackUsed: true,
              duration: duration
            };
          } catch (stdErr) {
            log('Standard login failed: ' + stdErr.message + ', falling back to ZK register...');
            // Fall through to Case 3
          }
        }

        // ── Case 3: New user — auto ZK register then login ──
        fireProgress(1, 'New user detected, starting ZK registration...');
        fireZKStep(1, 'Generating Pedersen commitment...');
        fireZKStep(2, 'Generating P-256 keypair...');
        
        const regResult = await doZKRegister(username, password);
        
        fireZKStep(3, 'Registration complete, logging in...');
        fireZKStep(4, 'Establishing ZK session...');
        
        const duration = Date.now() - startTime;
        
        return {
          token: regResult.token || sessionStorage.getItem('fk_token'),
          userId: regResult.userId || sessionStorage.getItem('fk_uid'),
          displayName: regResult.displayName || username,
          zkUsed: true,
          duration: duration
        };

      } catch (err) {
        logErr('Login error: ' + err.message);
        throw err;
      } finally {
        _currentOperation = null;
      }
    }

    /**
     * Explicit registration (for the Register tab in login.html).
     * Uses ZK anonymous registration by default.
     * 
     * @param {string} username
     * @param {string} password
     * @returns {Promise<Object>} { token, userId, displayName }
     */
    async register(username, password) {
      await this.init();
      _currentOperation = 'register';

      try {
        log('Starting ZK registration for: ' + username);
        
        // Always use ZK anonymous registration (Pedersen commitment + P-256 signature)
        const result = await doZKRegister(username, password);
        
        log('Registration successful. User ID: ' + (result.userId || '?'));
        
        return {
          token: result.token || sessionStorage.getItem('fk_token'),
          userId: result.userId || sessionStorage.getItem('fk_uid'),
          displayName: result.displayName || username
        };
      } catch (err) {
        logErr('Registration error: ' + err.message);
        
        // Fallback to standard registration if ZK fails
        log('ZK registration failed, trying standard registration...');
        const fallbackResult = await doRegister(username, password);
        
        return {
          token: fallbackResult.token || sessionStorage.getItem('fk_token'),
          userId: fallbackResult.userId || sessionStorage.getItem('fk_uid'),
          displayName: fallbackResult.displayName || username
        };
      } finally {
        _currentOperation = null;
      }
    }

    /**
     * Check current authentication status.
     */
    isAuthenticated() {
      return isLoggedIn();
    }

    /**
     * Get current operation state.
     */
    getStatus() {
      return {
        initialized: _initialized,
        currentOperation: _currentOperation,
        authenticated: this.isAuthenticated(),
        hasZKIdentity: !!localStorage.getItem('fk_zk_secrets')
      };
    }
  }

  // ─── Singleton Export ────────────────────────────────────
  const _instance = new ZKUIIntegration();

  /**
   * Returns the singleton ZKUIIntegration instance.
   * This is the function called by login.html's inline script.
   * 
   * @returns {ZKUIIntegration}
   */
  window.getZKUIIntegration = function() {
    return _instance;
  };

  // Also expose as window.ZKUI for backward compatibility
  window.ZKUI = _instance;

  log('ZKUI Integration v' + _instance.version + ' loaded. Ready for authentication.');

})();