// SPDX-License-Identifier: GPL-3.0-only
/**
 * FIBEMATE Unified WebSocket Manager v4
 * 合并 main-v3 和 nexus 的双 WebSocket 连接为单例管理
 * 解决消息重复、状态不同步问题
 */

class WSManager {
  constructor() {
    if (WSManager.instance) {
      return WSManager.instance;
    }
    WSManager.instance = this;

    // 核心连接
    this.ws = null;
    this.url = null;
    this.token = null;
    
    // 状态管理
    this.isManualDisconnect = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000;
    
    // 心跳
    this.heartbeatInterval = null;
    this.heartbeatTimeout = null;
    this.heartbeatIntervalMs = 30000;
    this.heartbeatTimeoutMs = 10000;
    
    // 订阅系统 (合并 main-v3 和 nexus 的事件类型)
    this.subscribers = new Map();      // eventType -> Set<callback>
    this.globalSubscribers = new Set(); // 所有消息的回调
    
    // Nexus 状态
    this.presenceStore = new Map();    // userId -> { status, lastSeen }
    this.channelRooms = new Map();     // channelId -> Set(userIds)
    this.voiceChannels = new Map();    // channelId -> { participants }
    
    // 统计
    this.stats = {
      connectedAt: null,
      disconnectedAt: null,
      reconnectCount: 0,
      messageCount: 0,
      errorCount: 0,
      lastPingTime: null,
      lastPongTime: null
    };
  }

  static getInstance() {
    if (!WSManager.instance) {
      WSManager.instance = new WSManager();
    }
    return WSManager.instance;
  }

  /**
   * 初始化连接 - 统一入口
   * @param {string} apiBase - API 基础 URL (如 https://fibemate.net/api)
   * @param {string} token - JWT token
   */
  connect(apiBase, token) {
    // 防止重复连接
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      console.log('[WSManager] Already connected, skipping...');
      return true;
    }

    this.token = token;
    this.isManualDisconnect = false;
    
    // 构建 WebSocket URL
    const wsProtocol = apiBase.startsWith('https') ? 'wss' : 'ws';
    const wsHost = apiBase.replace(/^https?:\/\//, '').replace(/\/api$/, '');
    this.url = `${wsProtocol}://${wsHost}/ws?token=${token}`;
    
    console.log(`[WSManager] Connecting to ${this.url}...`);

    try {
      this.ws = new WebSocket(this.url);
    } catch (err) {
      console.error('[WSManager] Failed to create WebSocket:', err);
      return false;
    }

    this.ws.onopen = () => this._handleOpen();
    this.ws.onmessage = (event) => this._handleMessage(event);
    this.ws.onclose = (event) => this._handleClose(event);
    this.ws.onerror = (err) => this._handleError(err);

    return true;
  }

  _handleOpen() {
    console.log('[WSManager] Connected');
    this.stats.connectedAt = Date.now();
    this.stats.reconnectCount++;
    this.reconnectAttempts = 0;
    this._startHeartbeat();
    this._emit('connected');
  }

  async _handleMessage(event) {
    this.stats.messageCount++;
    
    try {
      const data = JSON.parse(event.data);
      
      // 处理 ping/pong
      if (data.type === 'pong') {
        this.stats.lastPongTime = Date.now();
        if (this.heartbeatTimeout) {
          clearTimeout(this.heartbeatTimeout);
          this.heartbeatTimeout = null;
        }
        return;
      }
      
      // 路由消息
      this._routeMessage(data);
    } catch (err) {
      console.error('[WSManager] Parse error:', err);
      // 通知全局订阅者原始数据
      this.globalSubscribers.forEach(cb => {
        try { cb(event.data); } catch (e) { console.error(e); }
      });
    }
  }

  _handleClose(event) {
    console.log(`[WSManager] Disconnected (code: ${event.code})`);
    this.stats.disconnectedAt = Date.now();
    this._stopHeartbeat();
    this._emit('disconnected');

    if (!this.isManualDisconnect) {
      this._attemptReconnect();
    }
  }

  _handleError(err) {
    console.error('[WSManager] Error:', err);
    this.stats.errorCount++;
    this._emit('error', err);
  }

  /**
   * 消息路由 - 统一处理 main-v3 和 nexus 消息类型
   */
  _routeMessage(data) {
    // 全局订阅者
    this.globalSubscribers.forEach(cb => {
      try { cb(data); } catch (e) { console.error('[WSManager] Global handler error:', e); }
    });

    // 类型特定订阅者
    if (data.type) {
      const callbacks = this.subscribers.get(data.type);
      if (callbacks) {
        callbacks.forEach(cb => {
          try { cb(data); } catch (e) { console.error(`[WSManager] Handler error for ${data.type}:`, e); }
        });
      }
    }

    // 处理 nexus 特定事件
    this._handleNexusEvents(data);
  }

  /**
   * Nexus 事件处理
   */
  _handleNexusEvents(data) {
    switch (data.type) {
      case 'presence:update':
        if (data.data) {
          this.presenceStore.set(data.data.userId, {
            status: data.data.status,
            lastSeen: Date.now()
          });
        }
        break;
        
      case 'channel:member_join':
      case 'channel:member_leave':
        if (data.channelId && data.userId) {
          if (!this.channelRooms.has(data.channelId)) {
            this.channelRooms.set(data.channelId, new Set());
          }
          const room = this.channelRooms.get(data.channelId);
          if (data.type === 'channel:member_join') {
            room.add(data.userId);
          } else {
            room.delete(data.userId);
          }
        }
        break;
        
      case 'voice:participant_join':
      case 'voice:participant_leave':
        if (data.channelId && data.userId) {
          if (!this.voiceChannels.has(data.channelId)) {
            this.voiceChannels.set(data.channelId, { participants: new Map() });
          }
          const vc = this.voiceChannels.get(data.channelId);
          if (data.type === 'voice:participant_join') {
            vc.participants.set(data.userId, data.peerInfo || {});
          } else {
            vc.participants.delete(data.userId);
          }
        }
        break;
    }
  }

  // ========== 订阅系统 ==========

  /**
   * 订阅事件
   * @param {string} eventType - 事件类型: 'message', 'presence:update', 'connected', 'all' 等
   * @param {Function} callback - 回调函数
   * @returns {Function} 取消订阅函数
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

  _emit(eventType, data) {
    const callbacks = this.subscribers.get(eventType);
    if (callbacks) {
      callbacks.forEach(cb => {
        try { cb(data); } catch (e) { console.error(e); }
      });
    }
  }

  // ========== 发送消息 ==========

  /**
   * 发送结构化消息
   */
  send(type, data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data, timestamp: Date.now() }));
      return true;
    }
    console.warn('[WSManager] Cannot send, WebSocket not open');
    return false;
  }

  /**
   * 发送原始数据
   */
  sendRaw(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      this.ws.send(payload);
      return true;
    }
    console.warn('[WSManager] Cannot send raw, WebSocket not open');
    return false;
  }

  /**
   * 发送聊天消息 (main-v3 兼容)
   */
  sendMessage(to, payload) {
    return this.send('message', { to, ...payload });
  }

  // ========== 重连机制 ==========

  _attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WSManager] Max reconnect attempts reached');
      this._emit('max_reconnect_reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts), 30000);
    
    console.log(`[WSManager] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    setTimeout(() => {
      if (this.url && this.token) {
        this.connect(this.url.replace(/\/ws\?token=.*/, ''), this.token);
      }
    }, delay);
  }

  // ========== 心跳 ==========

  _startHeartbeat() {
    this._stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.stats.lastPingTime = Date.now();
        this.sendRaw(JSON.stringify({ type: 'ping', timestamp: Date.now() }));

        this.heartbeatTimeout = setTimeout(() => {
          console.warn('[WSManager] Heartbeat timeout - connection may be dead');
          if (this.ws) {
            this.ws.close();
          }
        }, this.heartbeatTimeoutMs);
      }
    }, this.heartbeatIntervalMs);
  }

  _stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  // ========== 断开连接 ==========

  disconnect() {
    this.isManualDisconnect = true;
    this._stopHeartbeat();
    this.reconnectAttempts = this.maxReconnectAttempts;

    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
    console.log('[WSManager] Disconnected by user');
  }

  // ========== 查询状态 ==========

  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  isConnecting() {
    return this.ws && this.ws.readyState === WebSocket.CONNECTING;
  }

  getStats() {
    return { ...this.stats };
  }

  getPresence(userId) {
    return this.presenceStore.get(userId);
  }

  getChannelMembers(channelId) {
    return this.channelRooms.get(channelId) || new Set();
  }

  getVoiceParticipants(channelId) {
    const vc = this.voiceChannels.get(channelId);
    return vc ? Array.from(vc.participants.keys()) : [];
  }
}

// 全局单例
const wsManager = WSManager.getInstance();

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WSManager, wsManager };
}
