// SPDX-License-Identifier: GPL-3.0-only
/**
 * FIBEMATE Shared WebSocket Manager
 * Singleton that manages a single WebSocket connection for all modules
 * Supports multiple subscribers by message type and event type
 */

class WebSocketManager {
  constructor() {
    if (WebSocketManager.instance) {
      return WebSocketManager.instance;
    }
    WebSocketManager.instance = this;

    this.ws = null;
    this.url = null;
    this.subscribers = new Map();      // eventType -> Set<callback>
    this.globalSubscribers = new Set(); // callbacks for all messages
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.heartbeatInterval = null;
    this.heartbeatTimeout = null;
    this.isManualDisconnect = false;
    this.stats = {
      connectedAt: null,
      disconnectedAt: null,
      reconnectCount: 0,
      messageCount: 0,
      errorCount: 0,
      lastPingTime: null,
      lastPongTime: null,
      latencyHistory: []
    };
  }

  static getInstance() {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  /**
   * Connect to WebSocket server
   * @param {string} url - WebSocket URL
   * @returns {boolean} - true if connecting or already connected
   */
  connect(url) {
    // Prevent duplicate connections
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      console.log('[WS Manager] Already connected or connecting, skipping...');
      return true;
    }

    this.url = url;
    this.isManualDisconnect = false;
    console.log(`[WS Manager] Connecting to ${url}...`);

    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      console.error('[WS Manager] Failed to create WebSocket:', err);
      return false;
    }

    this.ws.onopen = () => {
      console.log('[WS Manager] Connected');
      this.stats.connectedAt = Date.now();
      this.stats.reconnectCount++;
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.emitEvent('connected');
    };

    this.ws.onmessage = (event) => {
      this.stats.messageCount++;
      try {
        const data = JSON.parse(event.data);
        this.routeMessage(data);
      } catch (err) {
        console.error('[WS Manager] Parse error:', err);
        // Still notify global subscribers with raw data
        this.globalSubscribers.forEach(cb => {
          try { cb(event.data); } catch (e) { console.error(e); }
        });
      }
    };

    this.ws.onclose = (event) => {
      console.log(`[WS Manager] Disconnected (code: ${event.code})`);
      this.stats.disconnectedAt = Date.now();
      this.stopHeartbeat();
      this.emitEvent('disconnected');

      if (!this.isManualDisconnect) {
        this.attemptReconnect();
      }
    };

    this.ws.onerror = (err) => {
      console.error('[WS Manager] Error:', err);
      this.stats.errorCount++;
      this.emitEvent('error', err);
    };

    return true;
  }

  /**
   * Route message to appropriate subscribers
   */
  routeMessage(data) {
    // Notify global subscribers first
    this.globalSubscribers.forEach(cb => {
      try { cb(data); } catch (e) { console.error('[WS Manager] Global handler error:', e); }
    });

    // Notify type-specific subscribers
    if (data.type) {
      const callbacks = this.subscribers.get(data.type);
      if (callbacks) {
        callbacks.forEach(cb => {
          try { cb(data); } catch (e) { console.error(`[WS Manager] Handler error for ${data.type}:`, e); }
        });
      }
    }
  }

  /**
   * Subscribe to a specific message type or event
   * @param {string} eventType - Message type (e.g., 'new_message', 'connected') or 'all' for all messages
   * @param {Function} callback - Callback function
   * @returns {Function} - Unsubscribe function
   */
  on(eventType, callback) {
    if (eventType === 'all') {
      this.globalSubscribers.add(callback);
      return () => this.globalSubscribers.delete(callback);
    }

    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    this.subscribers.get(eventType).add(callback);

    return () => {
      const callbacks = this.subscribers.get(eventType);
      if (callbacks) {
        callbacks.delete(callback);
      }
    };
  }

  /**
   * Unsubscribe from an event
   */
  off(eventType, callback) {
    if (eventType === 'all') {
      this.globalSubscribers.delete(callback);
      return;
    }
    const callbacks = this.subscribers.get(eventType);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  /**
   * Emit internal event to subscribers
   */
  emitEvent(eventType, data) {
    const callbacks = this.subscribers.get(eventType);
    if (callbacks) {
      callbacks.forEach(cb => {
        try { cb(data); } catch (e) { console.error(e); }
      });
    }
  }

  /**
   * Send a typed message
   * @param {string} type - Message type
   * @param {object} data - Message data
   * @returns {boolean} - true if sent successfully
   */
  send(type, data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }));
      return true;
    }
    console.warn('[WS Manager] Cannot send, WebSocket not open');
    return false;
  }

  /**
   * Send raw data (string or object)
   * @param {string|object} data - Raw data to send
   * @returns {boolean} - true if sent successfully
   */
  sendRaw(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      this.ws.send(payload);
      return true;
    }
    console.warn('[WS Manager] Cannot send raw, WebSocket not open');
    return false;
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WS Manager] Max reconnect attempts reached');
      this.emitEvent('max_reconnect_reached');
      return;
    }

    this.reconnectAttempts++;
    const baseDelay = Math.min(5000 * Math.pow(1.5, this.reconnectAttempts), 30000);
    const jitter = Math.random() * 2000;
    const delay = baseDelay + jitter;

    console.log(`[WS Manager] Reconnecting in ${delay.toFixed(0)}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    setTimeout(() => {
      if (this.url) {
        this.connect(this.url);
      }
    }, delay);
  }

  /**
   * Start heartbeat (ping/pong)
   */
  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.stats.lastPingTime = Date.now();
        this.sendRaw(JSON.stringify({ type: 'ping', timestamp: Date.now() }));

        // Set timeout to detect missed pong
        this.heartbeatTimeout = setTimeout(() => {
          console.warn('[WS Manager] Heartbeat timeout - connection may be dead');
          if (this.ws) {
            this.ws.close();
          }
        }, 10000); // 10s timeout
      }
    }, 30000); // 30s interval
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  /**
   * Disconnect WebSocket and prevent auto-reconnect
   */
  disconnect() {
    this.isManualDisconnect = true;
    this.stopHeartbeat();
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent auto-reconnect

    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
    console.log('[WS Manager] Disconnected by user');
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Check if connecting
   */
  isConnecting() {
    return this.ws && this.ws.readyState === WebSocket.CONNECTING;
  }
}

// Create global instance
const wsManager = WebSocketManager.getInstance();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WebSocketManager, wsManager };
}
