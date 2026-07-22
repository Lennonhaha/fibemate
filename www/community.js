// SPDX-License-Identifier: GPL-3.0-only
/**
 * FIBEMATE Community Module
 * Features: Channels, Groups, Discovery, Posts
 * Privacy: Optional E2EE for private communities
 */

const CommunityAPI = {
  baseURL: API_BASE,
  
  // ========== 频道/群组管理 ==========
  
  async createChannel({ name, description, isPublic = true, isEncrypted = false }) {
    const token = localStorage.getItem('fk_token');
    const res = await fetch(`${this.baseURL}/channels`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ name, description, isPublic, isEncrypted })
    });
    return res.json();
  },
  
  async getChannels(type = 'public') {
    const token = localStorage.getItem('fk_token');
    const res = await fetch(`${this.baseURL}/channels?type=${type}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.json();
  },
  
  async joinChannel(channelId) {
    const token = localStorage.getItem('fk_token');
    const res = await fetch(`${this.baseURL}/channels/${channelId}/join`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.json();
  },
  
  async leaveChannel(channelId) {
    const token = localStorage.getItem('fk_token');
    const res = await fetch(`${this.baseURL}/channels/${channelId}/leave`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.json();
  },
  
  // ========== 帖子/话题 ==========
  
  async createPost(channelId, { title, content, attachments = [] }) {
    const token = localStorage.getItem('fk_token');
    const res = await fetch(`${this.baseURL}/channels/${channelId}/posts`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ title, content, attachments })
    });
    return res.json();
  },
  
  async getPosts(channelId, { page = 1, limit = 20 } = {}) {
    const token = localStorage.getItem('fk_token');
    const res = await fetch(
      `${this.baseURL}/channels/${channelId}/posts?page=${page}&limit=${limit}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    return res.json();
  },
  
  async replyToPost(channelId, postId, content) {
    const token = localStorage.getItem('fk_token');
    const res = await fetch(`${this.baseURL}/channels/${channelId}/posts/${postId}/replies`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ content })
    });
    return res.json();
  },
  
  // ========== 成员管理 ==========
  
  async getChannelMembers(channelId) {
    const token = localStorage.getItem('fk_token');
    const res = await fetch(`${this.baseURL}/channels/${channelId}/members`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.json();
  },
  
  async setMemberRole(channelId, userId, role) {
    const token = localStorage.getItem('fk_token');
    const res = await fetch(`${this.baseURL}/channels/${channelId}/members/${userId}/role`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ role })
    });
    return res.json();
  },
  
  // ========== 搜索与发现 ==========
  
  async searchChannels(query) {
    const token = localStorage.getItem('fk_token');
    const res = await fetch(`${this.baseURL}/channels/search?q=${encodeURIComponent(query)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.json();
  },
  
  async getTrendingChannels() {
    const token = localStorage.getItem('fk_token');
    const res = await fetch(`${this.baseURL}/channels/trending`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.json();
  }
};

// ========== UI 渲染 ==========

const CommunityUI = {
  currentChannel: null,
  posts: [],
  
  init() {
    this.bindEvents();
    this.renderChannelList();
  },
  
  bindEvents() {
    // 创建频道按钮
    document.getElementById('btnCreateChannel')?.addEventListener('click', () => {
      this.showCreateChannelModal();
    });
    
    // 搜索
    document.getElementById('channelSearch')?.addEventListener('input', debounce((e) => {
      this.searchChannels(e.target.value);
    }, 300));
  },
  
  async renderChannelList() {
    const container = document.getElementById('channelList');
    if (!container) return;
    
    showSkeleton('channelList', 3);
    
    try {
      const channels = await CommunityAPI.getChannels('public');
      container.innerHTML = channels.map(ch => `
        <div class="channel-item" data-id="${ch.id}">
          <div class="channel-icon">${ch.name.charAt(0).toUpperCase()}</div>
          <div class="channel-info">
            <div class="channel-name">${escapeHtml(ch.name)}
              ${ch.isEncrypted ? '<span class="badge-encrypted">🔒</span>' : ''}
            </div>
            <div class="channel-desc">${escapeHtml(ch.description || '')}</div>
            <div class="channel-meta">
              <span>${ch.memberCount} 成员</span>
              <span>${ch.postCount || 0} 帖子</span>
            </div>
          </div>
          <button class="btn-join ${ch.isJoined ? 'joined' : ''}" 
                  onclick="CommunityUI.toggleJoin('${ch.id}', ${!ch.isJoined})">
            ${ch.isJoined ? '已加入' : '加入'}
          </button>
        </div>
      `).join('');
    } catch (err) {
      container.innerHTML = '<div class="error">加载失败，请重试</div>';
    }
  },
  
  async renderPosts(channelId) {
    const container = document.getElementById('postList');
    if (!container) return;
    
    this.currentChannel = channelId;
    showLoading('postList');
    
    try {
      const posts = await CommunityAPI.getPosts(channelId);
      this.posts = posts;
      
      container.innerHTML = posts.map(post => `
        <div class="post-card" data-id="${post.id}">
          <div class="post-header">
            <div class="post-author">
              <div class="avatar">${post.author.charAt(0).toUpperCase()}</div>
              <span>${escapeHtml(post.author)}</span>
            </div>
            <span class="post-time">${formatTime(post.createdAt)}</span>
          </div>
          <h3 class="post-title">${escapeHtml(post.title)}</h3>
          <div class="post-content">${escapeHtml(post.content)}</div>
          <div class="post-actions">
            <button onclick="CommunityUI.likePost('${post.id}')">
              👍 ${post.likes || 0}
            </button>
            <button onclick="CommunityUI.showReplies('${post.id}')">
              💬 ${post.replies || 0}
            </button>
            <button onclick="CommunityUI.sharePost('${post.id}')">
              ↗️ 分享
            </button>
          </div>
        </div>
      `).join('');
    } catch (err) {
      container.innerHTML = '<div class="error">加载帖子失败</div>';
    }
  },
  
  showCreateChannelModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <h2>创建频道</h2>
        <input type="text" id="newChannelName" placeholder="频道名称" maxlength="50">
        <textarea id="newChannelDesc" placeholder="描述" maxlength="200"></textarea>
        <label class="toggle">
          <input type="checkbox" id="newChannelPublic" checked>
          <span>公开频道</span>
        </label>
        <label class="toggle">
          <input type="checkbox" id="newChannelEncrypted">
          <span>端到端加密</span>
        </label>
        <div class="modal-actions">
          <button onclick="this.closest('.modal-overlay').remove()">取消</button>
          <button onclick="CommunityUI.createChannel()">创建</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },
  
  async createChannel() {
    const name = document.getElementById('newChannelName').value.trim();
    const description = document.getElementById('newChannelDesc').value.trim();
    const isPublic = document.getElementById('newChannelPublic').checked;
    const isEncrypted = document.getElementById('newChannelEncrypted').checked;
    
    if (!name) {
      showToast('请输入频道名称', 'error');
      return;
    }
    
    try {
      await CommunityAPI.createChannel({ name, description, isPublic, isEncrypted });
      showToast('频道创建成功', 'success');
      document.querySelector('.modal-overlay')?.remove();
      this.renderChannelList();
    } catch (err) {
      showToast('创建失败: ' + err.message, 'error');
    }
  },
  
  async toggleJoin(channelId, join) {
    try {
      if (join) {
        await CommunityAPI.joinChannel(channelId);
        showToast('已加入频道', 'success');
      } else {
        await CommunityAPI.leaveChannel(channelId);
        showToast('已离开频道', 'info');
      }
      this.renderChannelList();
    } catch (err) {
      showToast('操作失败', 'error');
    }
  },
  
  async searchChannels(query) {
    if (!query.trim()) {
      this.renderChannelList();
      return;
    }
    
    const container = document.getElementById('channelList');
    showSkeleton('channelList', 3);
    
    try {
      const channels = await CommunityAPI.searchChannels(query);
      container.innerHTML = channels.map(ch => `
        <div class="channel-item" data-id="${ch.id}">
          <div class="channel-icon">${ch.name.charAt(0).toUpperCase()}</div>
          <div class="channel-info">
            <div class="channel-name">${escapeHtml(ch.name)}</div>
            <div class="channel-desc">${escapeHtml(ch.description || '')}</div>
          </div>
        </div>
      `).join('');
    } catch (err) {
      container.innerHTML = '<div class="error">搜索失败</div>';
    }
  }
};

// ========== 工具函数 ==========

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return date.toLocaleDateString('zh-CN');
}

// 初始化
if (document.getElementById('communityTab')) {
  CommunityUI.init();
}
