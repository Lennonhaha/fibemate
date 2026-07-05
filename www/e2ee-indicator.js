/**
 * E2EE 状态栏模块
 * 功能：显示当前会话的加密状态，支持 PQ-X3DH / 纯 X3DH / 无加密 三种状态
 * 依赖：message-crypto-v2.js (MessageCryptoV2.hasSession)
 *
 * 不使用 getCurrentSession() — 改为事件驱动 + hasSession 轮询，
 * 不侵入 crypto 模块内部。
 */

class E2EEIndicator {
  constructor(options = {}) {
    this.containerId = options.containerId || 'e2ee-indicator';
    this.updateInterval = options.updateInterval || 1000; // ms
    this.status = 'unknown'; // unknown → pq_x3dh | x3dh | none
    this.timer = null;
    this.activePeerId = null; // set by external code when peer changes
  }

  // ── 初始化：创建 DOM + 启动监听 ──
  init() {
    this._createDOM();
    this._bindEvents();
    this._startPolling();
    console.log('[E2EE] 状态栏已初始化');
  }

  // ── 创建 DOM ──
  _createDOM() {
    let el = document.getElementById(this.containerId);
    if (!el) {
      el = document.createElement('div');
      el.id = this.containerId;
      el.className = 'e2ee-indicator';
      // 放到聊天窗口底部右侧
      const chatArea = document.querySelector('.chat-view') || document.querySelector('.app-container') || document.body;
      chatArea.appendChild(el);
    }
    this.container = el;
    this._render();
  }

  // ── 渲染 UI ──
  _render() {
    const cfg = {
      'pq_x3dh': { icon: '🔒', text: '端到端加密 (PQ-X3DH)', color: '#00E5C3' },
      'x3dh':    { icon: '🔐', text: '端到端加密 (X3DH)',    color: '#FFA726' },
      'none':    { icon: '⚠️', text: '未加密',              color: '#FF5252' },
      'unknown': { icon: '🔄', text: '加密通道建立中...',   color: '#888888' }
    };
    const c = cfg[this.status] || cfg.unknown;
    this.container.innerHTML = `${c.icon} ${c.text}`;
    this.container.style.color = c.color;
    this.container.setAttribute('data-level', this.status);
  }

  // ── 绑定事件 ──
  _bindEvents() {
    // 握手成功 → 主动更新状态
    window.addEventListener('handshake-success', (e) => {
      const isPQ = e.detail?.pqEnabled === true;
      this.setStatus(isPQ ? 'pq_x3dh' : 'x3dh');
    });

    // 加密状态变化
    window.addEventListener('encryption-status-change', (e) => {
      if (e.detail?.status) this.setStatus(e.detail.status);
    });

    // 密钥交换失败或过期
    window.addEventListener('session-expired', () => {
      this.setStatus('none');
    });
  }

  // ── 定时轮询 ──
  _startPolling() {
    if (this.timer) clearInterval(this.timer);
    this._poll(); // 立即执行一次
    this.timer = setInterval(() => this._poll(), this.updateInterval);
  }

  async _poll() {
    try {
      const newStatus = await this._detectStatus();
      if (newStatus !== this.status) {
        this.status = newStatus;
        this._render();
        window.dispatchEvent(new CustomEvent('e2ee-status-change', {
          detail: { status: this.status }
        }));
      }
    } catch (err) {
      console.error('[E2EE] 状态检测失败:', err);
    }
  }

  // ── 核心：检测加密状态 ──
  async _detectStatus() {
    // 如果是 unknown，保持 unknown（尚未有任何操作）
    if (this.status === 'unknown' && !this._initialized) return 'unknown';

    // 1. 检查当前 peer 是否有 Double Ratchet 会话
    const peer = this.activePeerId;
    if (peer) {
      const Crypto = (typeof window.MessageCryptoV2 !== 'undefined') ? window.MessageCryptoV2 :
                         (typeof window.MessageCrypto !== 'undefined') ? window.MessageCrypto : null;
      if (!Crypto) return 'none';
      const hasSession = await Crypto.hasSession?. (peer);
      if (hasSession) {
        // 如果已知是 pq_x3dh，保持该状态；否则至少是 x3dh
        // PQ 状态通过 handshake-success 事件传入，不在此处探测
        return (this.status === 'pq_x3dh') ? 'pq_x3dh' : 'x3dh';
      }
    }

    // 2. 检查 localStorage 中是否有任何密钥（可能是刚登陆无 peer）
    if (this._hasAnyKeyMaterial()) return 'x3dh';

    // 3. 完全无加密
    return 'none';
  }

  _hasAnyKeyMaterial() {
    try {
      return !!(
        localStorage.getItem('fk_identity_private') ||
        localStorage.getItem('fk_identity_key') ||
        localStorage.getItem('fk_dh_priv') ||
        localStorage.getItem('crypto_keys') // MessageCryptoV2
      );
    } catch { return false; }
  }

  // ── 对外 API ──

  /** 手动设置状态 */
  setStatus(status) {
    if (['pq_x3dh', 'x3dh', 'none', 'unknown'].includes(status)) {
      this.initialized = true;
      if (status !== this.status) {
        this.status = status;
        this._render();
      }
    }
  }

  /** 设置当前活跃 peer（切换聊天对象时调用） */
  setActivePeer(peerId) {
    this.activePeerId = peerId;
    this.initialized = true;
    if (peerId) {
      this._poll(); // 立即检查新 peer 的加密状态
    } else {
      this.setStatus('none');
    }
  }

  /** 停止轮询 */
  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }
}

// 全局导出
if (typeof window !== 'undefined') {
  window.E2EEIndicator = E2EEIndicator;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = E2EEIndicator;
}