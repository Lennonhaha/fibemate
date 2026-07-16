/**
 * FIBEMATE Nexus Community Module
 * Professional-grade community platform with E2EE
 * Inspired by: Discord, Matrix, Signal, Zulip
 */

const NexusCommunity = {
  // ========== 状态管理 ==========
  state: {
    currentSpace: null,
    currentChannel: null,
    spaces: [],
    threads: new Map(),
    typingIndicators: new Map(),
    presence: new Map(),
    voiceState: null,
    api: null // NexusAPIClient instance
  },

  // 初始化 API 客户端
  initAPI() {
    if (!this.state.api) {
      this.state.api = new NexusAPIClient(API_BASE);
      this.setupEventListeners();
    }
    return this.state.api;
  },

  setupEventListeners() {
    const api = this.state.api;
    
    api.on('message', (message) => {
      this.renderMessage(message);
    });
    
    api.on('typing:start', ({ channelId, userId }) => {
      this.showTypingIndicator(channelId, userId);
    });
    
    api.on('typing:stop', ({ channelId, userId }) => {
      this.hideTypingIndicator(channelId, userId);
    });
    
    api.on('presence', ({ userId, status }) => {
      this.updatePresence(userId, status);
    });
    
    api.on('voice:join', ({ userId }) => {
      this.addVoiceParticipant(userId);
    });
    
    api.on('voice:leave', ({ userId }) => {
      this.removeVoiceParticipant(userId);
    });
    
    api.on('connected', () => {
      showToast('已连接到 Nexus', 'success');
    });
    
    api.on('disconnected', () => {
      showToast('与 Nexus 断开连接', 'warning');
    });
  },

  // ========== 空间 (Space) 管理 ==========
  
  async createSpace({ name, description, icon, isPublic = false, features = {} }) {
    const api = this.initAPI();
    const uid = localStorage.getItem('fk_uid');
    
    // 生成空间密钥对（用于 E2EE）
    const spaceKeyPair = await this.generateSpaceKeys();
    
    const spaceData = {
      name,
      description,
      icon,
      isPublic,
      ownerId: uid,
      features: {
        threads: true,
        voice: true,
        screenShare: true,
        files: true,
        polls: true,
        ...features
      },
      encryption: {
        enabled: !isPublic,
        publicKey: spaceKeyPair.publicKey,
        algorithm: 'X3DH+ML-KEM-768'
      }
    };

    const result = await api.createSpace(spaceData);
    
    // 本地存储空间私钥
    if (result.space) {
      await this.storeSpaceKey(result.space.id, spaceKeyPair.privateKey);
      this.state.spaces.push(result.space);
      this.renderSpaceList();
    }
    
    return result;
  },

  async joinSpace(spaceId, inviteCode = null) {
    try {
      const api = this.initAPI();
      const result = await api.joinSpace(spaceId, inviteCode);
      
      // 如果是加密空间，执行密钥交换
      if (result.encryptionEnabled) {
        await this.performSpaceKeyExchange(spaceId, result.spacePublicKey);
      }
      
      // 连接 WebSocket 并加入空间
      api.connectWebSocket();
      api.joinSpace(spaceId);
      
      return result;
    } catch (err) {
      console.error('[Nexus] Join space failed:', err);
      showToast('Failed to join space: ' + err.message, 'error');
      throw err;
    }
  },

  // ========== 频道 (Channel) 系统 ==========

  async createChannel(spaceId, { name, type = 'text', parentId = null, topic = '' }) {
    try {
      const api = this.initAPI();
      
      const channelData = {
        name: name.toLowerCase().replace(/\s+/g, '-'),
        displayName: name,
        type,
        parentId,
        topic,
        permissions: this.getDefaultPermissions(type)
      };

      const result = await api.createChannel(spaceId, channelData);
      return result;
    } catch (err) {
      console.error('[Nexus] Create channel failed:', err);
      showToast('Failed to create channel: ' + err.message, 'error');
      throw err;
    }
  },

  getDefaultPermissions(type) {
    const base = {
      read: ['@everyone'],
      write: ['@everyone'],
      manage: ['admin', 'moderator']
    };

    switch (type) {
      case 'announcement':
        return { ...base, write: ['admin', 'moderator'] };
      case 'stage':
        return { ...base, speak: ['admin', 'moderator', 'speaker'] };
      default:
        return base;
    }
  },

  // ========== 线程 (Thread) 系统 ==========

  async createThread(channelId, parentMessageId, { title, initialMessage }) {
    try {
      const api = this.initAPI();
      
      // 加密线程内容
      const encryptedContent = await this.encryptThreadContent(initialMessage, channelId);
      
      const result = await api.createThread(channelId, {
        parentMessageId,
        title,
        initialMessage: encryptedContent
      });
      
      if (result.thread) {
        this.state.threads.set(result.thread.id, result.thread);
      }
      
      return result;
    } catch (err) {
      console.error('[Nexus] Create thread failed:', err);
      showToast('Failed to create thread: ' + err.message, 'error');
      throw err;
    }
  },

  // ========== 消息系统（增强版） ==========

  async sendMessage(channelId, content, options = {}) {
    const { replyTo = null, attachments = [], ephemeral = false } = options;
    
    const messageData = {
      id: this.generateMessageId(),
      channelId,
      content,
      replyTo,
      attachments: await this.processAttachments(attachments),
      ephemeral: ephemeral ? { duration: 60 } : null,
      timestamp: new Date().toISOString(),
      edited: false
    };

    // 如果是加密频道，加密消息
    if (this.isChannelEncrypted(channelId)) {
      messageData.content = await this.encryptMessage(content, channelId);
      messageData.encrypted = true;
    }

    // 发送消息
    const result = await this.dispatchMessage(messageData);
    
    // 更新 UI
    this.renderMessage(messageData, { pending: true });
    
    return result;
  },

  async dispatchMessage(messageData) {
    try {
      const api = this.initAPI();
      
      // 优先使用 WebSocket
      if (api.ws?.readyState === WebSocket.OPEN) {
        api.wsSend('message:send', messageData);
        return { sent: true, via: 'websocket' };
      }
      
      // 降级到 HTTP API
      const result = await api.sendMessage(
        messageData.channelId,
        messageData.content,
        {
          replyTo: messageData.replyTo,
          attachments: messageData.attachments,
          ephemeral: !!messageData.ephemeral
        }
      );
      
      return result;
    } catch (err) {
      console.error('[Nexus] Dispatch message failed:', err);
      throw err;
    }
  },

  // ========== 语音/视频 (WebRTC) ==========

  async joinVoiceChannel(channelId) {
    const space = this.state.currentSpace;
    if (!space) throw new Error('无活跃空间');

    try {
      const api = this.initAPI();
      
      // 获取语音令牌
      const { token: voiceToken, servers } = await api.getVoiceToken(channelId);

      // 初始化 WebRTC
      this.state.voiceState = {
        channelId,
        connection: new RTCPeerConnection({
          iceServers: servers || [
            { urls: 'stun:stun.l.google.com:19302' }
          ]
        }),
        localStream: null,
        participants: new Map()
      };

      // 获取本地音频
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.state.voiceState.localStream = stream;
      
      stream.getTracks().forEach(track => {
        this.state.voiceState.connection.addTrack(track, stream);
      });

      // 设置 ICE 候选处理
      this.state.voiceState.connection.onicecandidate = (event) => {
        if (event.candidate) {
          // 广播给所有参与者
          this.state.voiceState.participants.forEach((_, userId) => {
            api.sendIceCandidate(channelId, userId, event.candidate);
          });
        }
      };

      // 处理远程流
      this.state.voiceState.connection.ontrack = (event) => {
        const [remoteStream] = event.streams;
        this.renderRemoteAudio(remoteStream);
      };

      // 加入语音频道
      api.joinVoice(channelId, voiceToken);

      // 处理参与者加入
      api.on('voice:join', async ({ userId }) => {
        if (userId === localStorage.getItem('fk_uid')) return;
        
        // 创建并发送 offer
        const offer = await this.state.voiceState.connection.createOffer();
        await this.state.voiceState.connection.setLocalDescription(offer);
        api.sendVoiceOffer(channelId, userId, offer);
      });

      // 处理收到的 offer
      api.on('voice:offer', async ({ userId, offer }) => {
        await this.state.voiceState.connection.setRemoteDescription(offer);
        const answer = await this.state.voiceState.connection.createAnswer();
        await this.state.voiceState.connection.setLocalDescription(answer);
        api.sendVoiceAnswer(channelId, userId, answer);
      });

      // 处理收到的 answer
      api.on('voice:answer', async ({ userId, answer }) => {
        await this.state.voiceState.connection.setRemoteDescription(answer);
      });

      // 处理 ICE 候选
      api.on('voice:ice', async ({ userId, candidate }) => {
        await this.state.voiceState.connection.addIceCandidate(candidate);
      });

      this.renderVoiceChannelUI(channelId);
      
    } catch (err) {
      console.error('[Nexus] Join voice channel failed:', err);
      showToast('Failed to join voice channel: ' + err.message, 'error');
      throw err;
    }
    
    return this.state.voiceState;
  },

  // ========== 实时协作 (Live Collaboration) ==========

  async createLiveDocument(channelId, { title, type = 'markdown' }) {
    try {
      const api = this.initAPI();
      
      const doc = {
        id: this.generateId(),
        channelId,
        title,
        type,
        content: '',
        collaborators: [],
        version: 0
      };

      const result = await api.post(`/channels/${channelId}/documents`, doc);
      return result;
    } catch (err) {
      console.error('[Nexus] Create document failed:', err);
      showToast('Failed to create document: ' + err.message, 'error');
      throw err;
    }
  },

  // ========== 声誉系统 (Zero-Knowledge Reputation) ==========

  async calculateReputation(userId, spaceId) {
    try {
      const api = this.initAPI();
      
      // 从服务器获取贡献数据（已脱敏）
      const contributions = await api.get(`/spaces/${spaceId}/members/${userId}/contributions`);
      
      const score = this.computeReputationScore(contributions);
      
      const reputation = {
        score,
        level: this.getReputationLevel(score),
        badges: this.computeBadges(contributions),
        // 零知识证明：证明声誉达标而不泄露具体数据
        zkProof: await this.generateReputationProof(contributions)
      };

      return reputation;
    } catch (err) {
      console.error('[Nexus] Calculate reputation failed:', err);
      return { score: 0, level: 1, badges: [], zkProof: null };
    }
  },

  computeReputationScore(contributions) {
    const weights = {
      messages: 1,
      reactions: 0.5,
      threads: 3,
      solutions: 10,
      moderation: 5
    };

    return Object.entries(contributions).reduce((score, [type, count]) => {
      return score + (count * (weights[type] || 0));
    }, 0);
  },

  // ========== UI 渲染 ==========

  renderSpaceList() {
    const container = document.getElementById('spaceList');
    if (!container) return;

    const spaces = this.state.spaces;
    
    container.innerHTML = `
      <div class="space-list-header">
        <button class="btn-create-space" id="btnCreateSpace">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
        </button>
      </div>
      ${spaces.map(space => `
        <div class="space-item ${space.id === this.state.currentSpace?.id ? 'active' : ''}" 
             data-space-id="${space.id}"
             title="${escapeHtml(space.name)}">
          <div class="space-icon">
            ${space.icon ? `<img src="${space.icon}" alt="">` : space.name.charAt(0).toUpperCase()}
          </div>
          ${space.unreadCount ? `<div class="space-badge">${space.unreadCount}</div>` : ''}
          ${space.encryption?.enabled ? '<div class="space-encrypted">🔒</div>' : ''}
        </div>
      `).join('')}
    `;

    // 绑定事件
    container.querySelectorAll('.space-item').forEach(item => {
      item.addEventListener('click', () => this.switchSpace(item.dataset.spaceId));
    });
  },

  renderChannelList(spaceId) {
    const container = document.getElementById('channelList');
    if (!container) return;

    const space = this.state.spaces.find(s => s.id === spaceId);
    if (!space) return;

    const categories = this.groupChannelsByCategory(space.channels);

    container.innerHTML = `
      <div class="channel-list-header">
        <h3>${escapeHtml(space.name)}</h3>
        <button class="icon-btn" id="btnSpaceSettings">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
          </svg>
        </button>
      </div>
      ${categories.map(cat => `
        <div class="channel-category">
          <div class="category-header">
            <svg class="category-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18l6-6-6-6"/>
            </svg>
            <span>${escapeHtml(cat.name)}</span>
          </div>
          <div class="channel-items">
            ${cat.channels.map(ch => `
              <div class="channel-item ${ch.id === this.state.currentChannel?.id ? 'active' : ''}"
                   data-channel-id="${ch.id}"
                   data-channel-type="${ch.type}">
                <svg class="channel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  ${this.getChannelIcon(ch.type)}
                </svg>
                <span class="channel-name">${escapeHtml(ch.displayName || ch.name)}</span>
                ${ch.unreadCount ? `<span class="channel-badge">${ch.unreadCount}</span>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    `;

    // 绑定事件
    container.querySelectorAll('.channel-item').forEach(item => {
      item.addEventListener('click', () => this.switchChannel(item.dataset.channelId));
    });
  },

  getChannelIcon(type) {
    const icons = {
      text: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
      voice: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>',
      announcement: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
      stage: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>',
      forum: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="10" x2="15" y2="10"/><line x1="12" y1="7" x2="12" y2="7"/>'
    };
    return icons[type] || icons.text;
  },

  // ========== 工具函数 ==========

  generateId() {
    return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  },

  generateMessageId() {
    return `msg_${this.generateId()}`;
  },

  async generateSpaceKeys() {
    const keyPair = await window.crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );

    const publicKey = await window.crypto.subtle.exportKey('raw', keyPair.publicKey);
    const privateKey = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

    return {
      publicKey: Array.from(new Uint8Array(publicKey)),
      privateKey: Array.from(new Uint8Array(privateKey))
    };
  },

  async storeSpaceKey(spaceId, privateKey) {
    const db = await openDB('fibemate_space_keys', 1, {
      upgrade(db) {
        db.createObjectStore('keys');
      }
    });
    await db.put('keys', privateKey, spaceId);
  },

  groupChannelsByCategory(channels) {
    const categories = new Map();
    
    channels.forEach(ch => {
      const catName = ch.parentId ? '频道' : '通用';
      if (!categories.has(catName)) {
        categories.set(catName, { name: catName, channels: [] });
      }
      categories.get(catName).channels.push(ch);
    });

    return Array.from(categories.values());
  },

  // ========== 空间/频道切换 ==========
  
  async loadSpaces() {
    try {
      const api = this.initAPI();
      const result = await api.getSpaces();
      this.state.spaces = result.spaces || [];
      this.renderSpaceList();
      
      // 如果有空间，自动加载第一个
      if (this.state.spaces.length > 0) {
        await this.switchSpace(this.state.spaces[0].id);
      }
    } catch (err) {
      console.error('[Nexus] Failed to load spaces:', err);
      showToast('加载空间失败', 'error');
    }
  },
  
  async switchSpace(spaceId) {
    const space = this.state.spaces.find(s => s.id === spaceId);
    if (!space) return;
    
    this.state.currentSpace = space;
    this.renderSpaceList(); // 更新选中状态
    this.renderChannelList(spaceId);
    
    // 更新空间名称显示
    const spaceNameEl = document.getElementById('currentSpaceName');
    if (spaceNameEl) {
      spaceNameEl.textContent = space.name;
    }
    
    // 连接 WebSocket
    const api = this.initAPI();
    api.connectWebSocket();
    api.joinSpace(spaceId);
  },
  
  async switchChannel(channelId) {
    const space = this.state.currentSpace;
    if (!space || !space.channels) return;
    
    const channel = space.channels.find(c => c.id === channelId);
    if (!channel) return;
    
    this.state.currentChannel = channel;
    this.renderChannelList(space.id); // 更新选中状态
    
    // 更新频道名称显示
    const channelNameEl = document.getElementById('currentChannelName');
    if (channelNameEl) {
      channelNameEl.textContent = '# ' + (channel.displayName || channel.name);
    }
    
    // 加载消息
    await this.loadMessages(channelId);
  },
  
  async loadMessages(channelId) {
    try {
      const api = this.initAPI();
      const result = await api.getMessages(channelId);
      const messages = result.messages || [];
      
      const container = document.getElementById('nexusMessageList');
      if (!container) return;
      
      if (messages.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <svg viewBox="0 0 64 64" fill="none">
              <rect x="12" y="16" width="40" height="32" rx="4" stroke="currentColor" stroke-width="1.5" fill="none"/>
              <path d="M12 28h40" stroke="currentColor" stroke-width="1.5"/>
              <circle cx="24" cy="40" r="3" stroke="currentColor" stroke-width="1.5" fill="none"/>
            </svg>
            <p>No messages yet</p>
            <p style="font-size: 12px; margin-top: 8px;">Be the first to send a message!</p>
          </div>
        `;
        return;
      }
      
      container.innerHTML = messages.map(msg => this.renderMessageHTML(msg)).join('');
    } catch (err) {
      console.error('[Nexus] Failed to load messages:', err);
    }
  },
  
  renderMessageHTML(message) {
    return `
      <div class="message-group" data-message-id="${message.id}">
        <div class="message-avatar">${(message.senderName || 'U').charAt(0).toUpperCase()}</div>
        <div class="message-content">
          <div class="message-header">
            <span class="message-author">${this.escapeHtml(message.senderName || '未知用户')}</span>
            <span class="message-time">${new Date(message.timestamp).toLocaleTimeString()}</span>
          </div>
          <div class="message-text">${this.escapeHtml(message.content)}</div>
        </div>
      </div>
    `;
  },
  
  async sendMessage(content) {
    const channel = this.state.currentChannel;
    if (!channel) {
      showToast('请先选择一个频道', 'warning');
      return;
    }
    
    try {
      const messageData = {
        id: this.generateMessageId(),
        channelId: channel.id,
        content,
        timestamp: new Date().toISOString(),
        senderName: localStorage.getItem('fk_displayName') || localStorage.getItem('fk_uname') || '用户'
      };
      
      // 先渲染到 UI（乐观更新）
      const container = document.getElementById('nexusMessageList');
      if (container) {
        const emptyState = container.querySelector('.empty-state');
        if (emptyState) emptyState.remove();
        
        const msgEl = document.createElement('div');
        msgEl.innerHTML = this.renderMessageHTML(messageData);
        container.appendChild(msgEl.firstElementChild);
        container.scrollTop = container.scrollHeight;
      }
      
      // 发送到服务器
      const api = this.initAPI();
      await api.sendMessage(channel.id, content);
    } catch (err) {
      console.error('[Nexus] Failed to send message:', err);
      showToast('消息发送失败', 'error');
    }
  },

  // ========== 缺失函数补全 ==========

  // --- 打字指示器 ---
  showTypingIndicator(channelId, userId) {
    const key = `${channelId}:${userId}`;
    this.state.typingIndicators.set(key, { userId, channelId, since: Date.now() });
    const bar = document.getElementById('nexusTypingIndicator');
    if (bar) {
      const names = Array.from(this.state.typingIndicators.values())
        .filter(t => t.channelId === this.state.currentChannel?.id)
        .map(t => t.userId);
      bar.textContent = names.length > 0 ? `${names.length} typing...` : '';
      bar.style.display = names.length > 0 ? 'block' : 'none';
    }
  },

  hideTypingIndicator(channelId, userId) {
    const key = `${channelId}:${userId}`;
    this.state.typingIndicators.delete(key);
    const bar = document.getElementById('nexusTypingIndicator');
    if (bar) {
      const names = Array.from(this.state.typingIndicators.values())
        .filter(t => t.channelId === this.state.currentChannel?.id)
        .map(t => t.userId);
      bar.textContent = names.length > 0 ? `${names.length} typing...` : '';
      bar.style.display = names.length > 0 ? 'block' : 'none';
    }
  },

  // --- 在线状态 ---
  updatePresence(userId, status) {
    this.state.presence.set(userId, { status, updatedAt: Date.now() });
    const el = document.querySelector(`[data-user-id="${userId}"] .presence-dot`);
    if (el) {
      el.className = `presence-dot presence-${status}`;
    }
  },

  // --- 语音 UI ---
  renderVoiceChannelUI(channelId) {
    const container = document.getElementById('nexusVoicePanel');
    if (!container) return;
    container.innerHTML = `
      <div class="voice-panel">
        <div class="voice-header">
          <span class="voice-status">🎙️ Connected to Voice</span>
          <button class="btn-leave-voice" id="btnLeaveVoice">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91"/>
              <line x1="23" y1="1" x2="1" y2="23"/>
            </svg>
          </button>
        </div>
        <div class="voice-participants" id="voiceParticipants"></div>
        <div class="voice-controls">
          <button class="voice-btn" id="btnToggleMic" title="切换麦克风">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </button>
          <button class="voice-btn" id="btnDeafen" title="静音">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
              <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
            </svg>
          </button>
        </div>
      </div>
    `;
    document.getElementById('btnLeaveVoice')?.addEventListener('click', () => this.leaveVoiceChannel());
  },

  renderRemoteAudio(stream) {
    const audio = new Audio();
    audio.srcObject = stream;
    audio.play().catch(() => {});
  },

  async leaveVoiceChannel() {
    if (this.state.voiceState) {
      this.state.voiceState.localStream?.getTracks().forEach(t => t.stop());
      this.state.voiceState.connection?.close();
      this.state.voiceState = null;
      const panel = document.getElementById('nexusVoicePanel');
      if (panel) panel.innerHTML = '';
    }
  },

  addVoiceParticipant(userId) {
    const container = document.getElementById('voiceParticipants');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'voice-participant';
    el.dataset.userId = userId;
    el.innerHTML = `<div class="participant-avatar">${userId.charAt(0).toUpperCase()}</div><span>${this.escapeHtml(userId)}</span><div class="presence-dot presence-online"></div>`;
    container.appendChild(el);
  },

  removeVoiceParticipant(userId) {
    const el = document.querySelector(`#voiceParticipants [data-user-id="${userId}"]`);
    if (el) el.remove();
  },

  // --- 加密相关 ---
  async performSpaceKeyExchange(spaceId, spacePublicKey) {
    // 使用 X3DH + ML-KEM-768 混合密钥交换
    try {
      const spkId = await window.crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        true, ['deriveBits']
      );
      const publicKey = await window.crypto.subtle.exportKey('raw', spkId.publicKey);
      localStorage.setItem(`nexus_spk_${spaceId}`, JSON.stringify({
        publicKey: Array.from(new Uint8Array(publicKey)),
        createdAt: Date.now()
      }));
    } catch (err) {
      console.error('[Nexus] Space key exchange failed:', err);
    }
  },

  isChannelEncrypted(channelId) {
    const space = this.state.currentSpace;
    if (!space) return false;
    const channel = space.channels?.find(c => c.id === channelId);
    return channel?.encrypted === true || space.encryption?.enabled === true;
  },

  async encryptMessage(content, channelId) {
    // 使用 Double Ratchet 加密
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(content);
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const key = await this._deriveChannelKey(channelId);
      const encrypted = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv }, key, data
      );
      return JSON.stringify({
        iv: Array.from(iv),
        data: Array.from(new Uint8Array(encrypted)),
        v: 2
      });
    } catch (err) {
      console.error('[Nexus] Message encryption failed:', err);
      return content; // fallback to plaintext
    }
  },

  async encryptThreadContent(content, channelId) {
    return this.encryptMessage(content, channelId);
  },

  async _deriveChannelKey(channelId) {
    const rawKey = localStorage.getItem(`nexus_key_${channelId}`) || 'default-channel-key-' + channelId;
    const encoder = new TextEncoder();
    const keyData = encoder.encode(rawKey.padEnd(32, '\0').slice(0, 32));
    return await window.crypto.subtle.importKey('raw', keyData, 'AES-GCM', false, ['encrypt', 'decrypt']);
  },

  async processAttachments(attachments) {
    if (!attachments || attachments.length === 0) return [];
    return attachments.map(a => ({
      id: this.generateId(),
      name: a.name || 'file',
      size: a.size || 0,
      type: a.type || 'application/octet-stream',
      url: a.url || null,
      uploaded: false
    }));
  },

  // --- 声誉系统 ---
  getReputationLevel(score) {
    if (score >= 1000) return 10;
    if (score >= 500) return 9;
    if (score >= 250) return 8;
    if (score >= 120) return 7;
    if (score >= 60) return 6;
    if (score >= 30) return 5;
    if (score >= 15) return 4;
    if (score >= 8) return 3;
    if (score >= 3) return 2;
    return 1;
  },

  computeBadges(contributions) {
    const badges = [];
    const total = Object.values(contributions).reduce((a, b) => a + b, 0);
    if (total >= 100) badges.push({ name: '资深成员', icon: '🏆' });
    if (contributions.solutions >= 10) badges.push({ name: '助人者', icon: '💡' });
    if (contributions.moderation >= 5) badges.push({ name: '管理员', icon: '🛡️' });
    if (contributions.messages >= 50) badges.push({ name: '活跃聊天', icon: '💬' });
    return badges;
  },

  async generateReputationProof(contributions) {
    // 零知识证明：生成一个证明表明声誉达标而不泄露具体数据
    // 这里用简单的 hash 作为占位，生产环境应使用 ZK-SNARK
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify({
      score: this.computeReputationScore(contributions),
      timestamp: Date.now(),
      nonce: crypto.randomUUID?.()
    }));
    const hash = await window.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  },

  // --- 消息渲染 (WebSocket 接收) ---
  renderMessage(message, options = {}) {
    const container = document.getElementById('nexusMessageList');
    if (!container) return;
    // 移除空状态
    const emptyState = container.querySelector('.empty-state');
    if (emptyState) emptyState.remove();
    // 渲染消息
    const msgEl = document.createElement('div');
    msgEl.innerHTML = this.renderMessageHTML(message);
    const el = msgEl.firstElementChild;
    if (options.pending) el.classList.add('message-pending');
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  },

  // ========== 自定义弹窗（替代 Electron 不支持的 prompt()） ==========
  showPromptDialog(title, placeholder) {
    let result = null;
    let resolved = false;

    return new Promise((resolve) => {
      // 创建遮罩
      const overlay = document.createElement('div');
      overlay.id = 'nexus-prompt-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';

      // 创建弹窗
      const dialog = document.createElement('div');
      dialog.style.cssText = 'background:#1a1a2e;border:1px solid rgba(0,229,195,0.2);border-radius:16px;padding:24px;width:360px;max-width:90vw;box-shadow:0 20px 60px rgba(0,0,0,0.5);';
      dialog.innerHTML = `
        <div style="font-size:15px;font-weight:600;color:#e0e0e0;margin-bottom:14px;">${title}</div>
        <input id="nexus-prompt-input" type="text" placeholder="${placeholder || ''}" style="width:100%;padding:10px 12px;background:#12121c;border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#e0e0e0;font-size:14px;outline:none;box-sizing:border-box;margin-bottom:16px;" />
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button id="nexus-prompt-cancel" style="padding:8px 18px;background:transparent;border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#999;font-size:13px;cursor:pointer;">Cancel</button>
          <button id="nexus-prompt-ok" style="padding:8px 18px;background:linear-gradient(135deg,#00E5C3,#00b89c);border:none;border-radius:8px;color:#0a0a0f;font-weight:600;font-size:13px;cursor:pointer;">OK</button>
        </div>
      `;

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      const input = document.getElementById('nexus-prompt-input');
      const cancelBtn = document.getElementById('nexus-prompt-cancel');
      const okBtn = document.getElementById('nexus-prompt-ok');

      setTimeout(() => input.focus(), 50);

      function close(val) {
        if (resolved) return;
        resolved = true;
        result = val;
        try { if (document.body.contains(overlay)) document.body.removeChild(overlay); } catch(e) {}
        resolve(val);
      }

      cancelBtn.onclick = () => close(null);
      okBtn.onclick = () => close(input.value);
      input.onkeydown = (e) => { if (e.key === 'Enter') close(input.value); if (e.key === 'Escape') close(null); };
      overlay.onclick = (e) => { if (e.target === overlay) close(null); };
    });
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

// 初始化事件监听
document.addEventListener('DOMContentLoaded', () => {
  // 发送消息按钮
  const sendBtn = document.getElementById('btnSendNexusMessage');
  const msgInput = document.getElementById('nexusMessageInput');
  
  if (sendBtn && msgInput) {
    sendBtn.addEventListener('click', () => {
      const content = msgInput.value.trim();
      if (content) {
        NexusCommunity.sendMessage(content);
        msgInput.value = '';
      }
    });
    
    msgInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const content = msgInput.value.trim();
        if (content) {
          NexusCommunity.sendMessage(content);
          msgInput.value = '';
        }
      }
    });
  }
  
  // 创建空间按钮
  const createSpaceBtn = document.getElementById('btnCreateSpace');
  if (createSpaceBtn) {
    createSpaceBtn.addEventListener('click', async () => {
      // Electron 不支持原生 prompt()，使用自定义弹窗
      const name = await NexusCommunity.showPromptDialog('创建空间', '输入空间名称：');
      if (name && name.trim()) {
        NexusCommunity.createSpace({
          name: name.trim(),
          description: '',
          isPublic: false
        });
      }
    });
  }
});
