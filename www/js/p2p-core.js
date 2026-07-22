// SPDX-License-Identifier: GPL-3.0-only
/**
 * FIBEMATE P2P 核心模块
 * 手机直连，无需服务器
 */

class P2PNetwork {
  constructor() {
    this.peers = new Map(); // peerId -> PeerConnection
    this.localId = this.generateId();
    this.localKeyPair = null;
    this.dataChannels = new Map();
    this.messageHandlers = new Set();
    this.store = new LocalMessageStore();
  }
  
  // 生成唯一ID
  generateId() {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  
  // 初始化
  async init() {
    // 生成密钥对
    this.localKeyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey']
    );
    
    // 启动局域网发现
    this.startLanDiscovery();
    
    console.log('[P2P] Initialized with ID:', this.localId);
  }
  
  // ================================================
  // 局域网发现 (mDNS模拟)
  // ================================================
  
  startLanDiscovery() {
    // 使用WebRTC的ICE候选收集发现局域网IP
    const pc = new RTCPeerConnection({
      iceServers: [] // 不需要STUN，仅局域网
    });
    
    pc.createDataChannel('discovery');
    
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        const ip = this.extractIpFromCandidate(e.candidate.candidate);
        if (this.isLanIp(ip)) {
          this.broadcastPresence(ip);
        }
      }
    };
    
    pc.createOffer().then(offer => pc.setLocalDescription(offer));
  }
  
  extractIpFromCandidate(candidate) {
    const match = candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  }
  
  isLanIp(ip) {
    return ip.startsWith('192.168.') || 
           ip.startsWith('10.') || 
           ip.startsWith('172.16.');
  }
  
  // 广播自己的存在 (通过UDP或WebSocket广播)
  broadcastPresence(ip) {
    // 简化版：通过已知端口范围扫描
    const ports = [3001, 3002, 3003, 8080, 8081];
    ports.forEach(port => {
      this.tryConnect(ip, port);
    });
  }
  
  // ================================================
  // 连接管理
  // ================================================
  
  async connectToPeer(ip, port, peerPublicKey = null) {
    const peerId = `${ip}:${port}`;
    
    if (this.peers.has(peerId)) {
      return this.peers.get(peerId);
    }
    
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    
    // 创建数据通道
    const dc = pc.createDataChannel('messages', {
      ordered: true,
      maxRetransmits: 3
    });
    
    this.setupDataChannel(dc, peerId);
    
    // 创建offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    // 等待ICE完成
    await this.waitForIceComplete(pc);
    
    // 发送offer (通过某种方式，如二维码、局域网广播等)
    this.peers.set(peerId, pc);
    
    return pc;
  }
  
  setupDataChannel(dc, peerId) {
    dc.onopen = () => {
      console.log('[P2P] DataChannel opened with', peerId);
      this.dataChannels.set(peerId, dc);
      this.sendPendingMessages(peerId);
    };
    
    dc.onmessage = (e) => {
      this.handleMessage(peerId, e.data);
    };
    
    dc.onclose = () => {
      console.log('[P2P] DataChannel closed with', peerId);
      this.dataChannels.delete(peerId);
    };
    
    dc.onerror = (err) => {
      console.error('[P2P] DataChannel error:', err);
    };
  }
  
  waitForIceComplete(pc) {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }
      
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') {
          resolve();
        }
      };
      
      // 超时
      setTimeout(resolve, 5000);
    });
  }
  
  // ================================================
  // 消息处理
  // ================================================
  
  async handleMessage(peerId, data) {
    try {
      const msg = JSON.parse(data);
      
      switch (msg.type) {
        case 'chat':
          await this.handleChatMessage(peerId, msg);
          break;
        case 'file':
          await this.handleFileTransfer(peerId, msg);
          break;
        case 'call':
          await this.handleCallSignal(peerId, msg);
          break;
        case 'presence':
          this.handlePresence(peerId, msg);
          break;
      }
    } catch (err) {
      console.error('[P2P] Message handling error:', err);
    }
  }
  
  async handleChatMessage(peerId, msg) {
    // 解密消息
    const decrypted = await this.decryptMessage(peerId, msg.encrypted);
    
    // 存储到本地
    await this.store.saveMessage({
      id: msg.id,
      peerId: peerId,
      content: decrypted,
      timestamp: msg.timestamp,
      direction: 'received',
      status: 'delivered'
    });
    
    // 通知UI
    this.messageHandlers.forEach(handler => {
      handler({
        type: 'new_message',
        peerId: peerId,
        content: decrypted,
        timestamp: msg.timestamp
      });
    });
    
    // 发送已读回执
    this.sendReceipt(peerId, msg.id);
  }
  
  // ================================================
  // 发送消息
  // ================================================
  
  async sendMessage(peerId, content) {
    const msgId = crypto.randomUUID();
    const timestamp = Date.now();
    
    // 加密
    const encrypted = await this.encryptMessage(peerId, content);
    
    const msg = {
      type: 'chat',
      id: msgId,
      from: this.localId,
      encrypted: encrypted,
      timestamp: timestamp
    };
    
    // 存储到本地
    await this.store.saveMessage({
      id: msgId,
      peerId: peerId,
      content: content,
      timestamp: timestamp,
      direction: 'sent',
      status: 'pending'
    });
    
    // 尝试发送
    const dc = this.dataChannels.get(peerId);
    if (dc && dc.readyState === 'open') {
      dc.send(JSON.stringify(msg));
      await this.store.updateMessageStatus(msgId, 'delivered');
    } else {
      // 离线，加入待发送队列
      this.queueMessage(peerId, msg);
    }
    
    return msgId;
  }
  
  // ================================================
  // 加密/解密
  // ================================================
  
  async encryptMessage(peerId, content) {
    // 简化版：使用预共享密钥
    // 实际应使用Double Ratchet
    const key = await this.getSharedKey(peerId);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(content)
    );
    
    return {
      ciphertext: Array.from(new Uint8Array(encrypted)),
      iv: Array.from(iv)
    };
  }
  
  async decryptMessage(peerId, encrypted) {
    const key = await this.getSharedKey(peerId);
    const iv = new Uint8Array(encrypted.iv);
    const ciphertext = new Uint8Array(encrypted.ciphertext);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    
    return new TextDecoder().decode(decrypted);
  }
  
  async getSharedKey(peerId) {
    // 从存储获取或生成
    let keyData = localStorage.getItem(`p2p_key_${peerId}`);
    
    if (!keyData) {
      // 生成新密钥 (实际应通过X3DH)
      const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
      
      const exported = await crypto.subtle.exportKey('raw', key);
      keyData = Array.from(new Uint8Array(exported));
      localStorage.setItem(`p2p_key_${peerId}`, JSON.stringify(keyData));
    } else {
      keyData = JSON.parse(keyData);
    }
    
    return crypto.subtle.importKey(
      'raw',
      new Uint8Array(keyData),
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
  }
  
  // ================================================
  // 二维码连接
  // ================================================
  
  generateConnectionQR() {
    const info = {
      id: this.localId,
      // 获取本地IP
      addrs: this.getLocalAddresses(),
      // 公钥指纹
      keyFingerprint: this.getKeyFingerprint()
    };
    
    return JSON.stringify(info);
  }
  
  getLocalAddresses() {
    // 从RTCPeerConnection获取本地IP
    const addresses = [];
    // 简化版，实际应遍历ICE candidates
    return addresses;
  }
  
  getKeyFingerprint() {
    // 生成公钥指纹用于验证
    return this.localId.substring(0, 16);
  }
  
  async connectByQR(qrData) {
    const info = JSON.parse(qrData);
    
    // 尝试所有地址
    for (const addr of info.addrs) {
      try {
        await this.connectToPeer(addr.ip, addr.port);
        console.log('[P2P] Connected via QR to', info.id);
        return true;
      } catch (err) {
        console.warn('[P2P] Failed to connect to', addr);
      }
    }
    
    return false;
  }
  
  // ================================================
  // 语音通话 (WebRTC)
  // ================================================
  
  async startVoiceCall(peerId) {
    const pc = this.peers.get(peerId);
    if (!pc) {
      throw new Error('Not connected to peer');
    }
    
    // 获取麦克风
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // 添加轨道
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });
    
    // 创建offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    // 通过数据通道发送
    this.sendSignal(peerId, {
      type: 'call',
      action: 'offer',
      sdp: offer.sdp
    });
    
    return stream;
  }
  
  sendSignal(peerId, signal) {
    const dc = this.dataChannels.get(peerId);
    if (dc && dc.readyState === 'open') {
      dc.send(JSON.stringify(signal));
    }
  }
  
  // ================================================
  // 工具方法
  // ================================================
  
  onMessage(handler) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }
  
  getConnectedPeers() {
    return Array.from(this.dataChannels.keys());
  }
  
  isConnected(peerId) {
    const dc = this.dataChannels.get(peerId);
    return dc && dc.readyState === 'open';
  }
  
  queueMessage(peerId, msg) {
    const queue = JSON.parse(localStorage.getItem(`queue_${peerId}`) || '[]');
    queue.push(msg);
    localStorage.setItem(`queue_${peerId}`, JSON.stringify(queue));
  }
  
  async sendPendingMessages(peerId) {
    const queue = JSON.parse(localStorage.getItem(`queue_${peerId}`) || '[]');
    localStorage.removeItem(`queue_${peerId}`);
    
    for (const msg of queue) {
      const dc = this.dataChannels.get(peerId);
      if (dc && dc.readyState === 'open') {
        dc.send(JSON.stringify(msg));
      }
    }
  }
  
  sendReceipt(peerId, messageId) {
    this.sendSignal(peerId, {
      type: 'receipt',
      messageId: messageId,
      status: 'read'
    });
  }
}

// ================================================
// 本地消息存储
// ================================================

class LocalMessageStore {
  constructor() {
    this.db = null;
    this.init();
  }
  
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('fibemate_p2p', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        
        if (!db.objectStoreNames.contains('messages')) {
          const store = db.createObjectStore('messages', { keyPath: 'id' });
          store.createIndex('peerId', 'peerId', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('peers')) {
          const store = db.createObjectStore('peers', { keyPath: 'id' });
          store.createIndex('lastSeen', 'lastSeen', { unique: false });
        }
      };
    });
  }
  
  async saveMessage(msg) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['messages'], 'readwrite');
      const store = tx.objectStore('messages');
      const request = store.put(msg);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  async getMessages(peerId, limit = 50) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['messages'], 'readonly');
      const store = tx.objectStore('messages');
      const index = store.index('peerId');
      const request = index.openCursor(peerId, 'prev');
      
      const messages = [];
      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor && messages.length < limit) {
          messages.push(cursor.value);
          cursor.continue();
        } else {
          resolve(messages.reverse());
        }
      };
      request.onerror = () => reject(request.error);
    });
  }
  
  async updateMessageStatus(id, status) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['messages'], 'readwrite');
      const store = tx.objectStore('messages');
      const request = store.get(id);
      
      request.onsuccess = () => {
        const msg = request.result;
        if (msg) {
          msg.status = status;
          store.put(msg);
        }
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }
}

// ================================================
// 导出
// ================================================

window.P2PNetwork = P2PNetwork;
window.LocalMessageStore = LocalMessageStore;

console.log('[P2P] Core module loaded');
