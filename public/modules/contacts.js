// ================================================
// Contacts  — v3 从后端 /api/contacts 加载（v2 用的是 localStorage）
// ================================================
async function loadContacts() {
  const list = document.getElementById('contactList');
  const empty = document.getElementById('emptyContacts');
  let contacts = [];
  let loadError = null;

  // v3.1: 首先尝试从后端加载
  try {
    const token = localStorage.getItem('fk_token');
    const res = await fetch(`${API_BASE}/contacts`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    contacts = data.contacts || [];
    
    // 如果后端有数据，缓存到本地
    if (contacts.length > 0) {
      localStorage.setItem('fk_contacts_cache', JSON.stringify(contacts));
      console.log('[Contacts v3.1] Loaded from backend, cached locally');
    }
  } catch (err) {
    console.error('[Contacts v3.1] Backend load failed:', err);
    loadError = err;
    
    // 尝试从本地缓存恢复
    const cached = localStorage.getItem('fk_contacts_cache');
    if (cached) {
      try {
        contacts = JSON.parse(cached);
        console.log('[Contacts v3.1] Loaded from local cache');
      } catch (e) {
        console.error('[Contacts v3.1] Cache parse failed:', e);
      }
    }
    
    // 尝试从旧版本迁移
    if (contacts.length === 0) {
      const oldContacts = localStorage.getItem('fibemate_contacts');
      if (oldContacts) {
        try {
          const old = JSON.parse(oldContacts);
          // 转换旧格式到新格式
          contacts = old.map(c => ({
            contactUserId: c.id || c.userId || c.username,
            username: c.username || c.id || c.userId,
            displayName: c.displayName || c.name || c.username || c.id || c.userId
          }));
          // 保存到新格式
          localStorage.setItem('fk_contacts_cache', JSON.stringify(contacts));
          console.log('[Contacts v3.1] Migrated from v2 format');
        } catch (e) {
          console.error('[Contacts v3.1] Migration failed:', e);
        }
      }
    }
  }

  // 渲染联系人列表
  if (contacts.length === 0) {
    if (empty) {
      empty.style.display = 'flex';
      let errorMsg = 'No contacts yet';
      let showRetry = true;
      
      if (loadError) {
        errorMsg = 'Failed to load contacts from server';
      }
      
      empty.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width: 48px; height: 48px; color: var(--text-muted); margin-bottom: 16px;">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 8px;">${errorMsg}</p>
        ${showRetry ? `<button class="btn-secondary" onclick="loadContacts()" style="margin-top: 8px;">Retry</button>` : ''}
        <button class="btn-secondary" onclick="showModal('modalAddContact')" style="margin-top: 8px;">Add Contact</button>
      `;
    }
    list.innerHTML = '';
    return;
  }
  
  if (empty) empty.style.display = 'none';
  list.innerHTML = contacts.map(c => buildContactItem(c)).join('');
  bindContactEvents();
}

function buildContactItem(c) {
  const name = c.displayName || c.username || c.contactUserId || 'Unknown';
  const username = c.username || c.contactUserId || '';
  const online = c.isOnline ? '<span class="online-dot"></span>' : '';
  return `<div class="contact-item" data-user-id="${c.contactUserId || ''}" data-name="${escapeHtml(name)}">
    <div class="contact-avatar">${name.charAt(0).toUpperCase()}${online}</div>
    <div class="contact-info"><div class="contact-name">${escapeHtml(name)}</div><div class="contact-username">@${escapeHtml(username)}</div></div>
    <div class="contact-actions">
      <button class="icon-btn contact-chat" title="Message"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>
      <button class="icon-btn contact-call" title="Call"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg></button>
    </div>
  </div>`;
}

function bindContactEvents() {
  document.querySelectorAll('.contact-chat').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const item = e.target.closest('.contact-item');
      switchTab('messages');
      openChat(item.dataset.userId, item.dataset.name);
    });
  });
  document.querySelectorAll('.contact-call').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const item = e.target.closest('.contact-item');
      startCallWith(item.dataset.name);
    });
  });
}

// v3: addContact 改为调用后端 API（v2 只存 localStorage）
async function addContact() {
  const username = document.getElementById('contactUsername').value.trim();
  const displayName = document.getElementById('contactDisplayName').value.trim();
  if (!username) { showToast('Please enter a username', 'error'); return; }

  try {
    const token = localStorage.getItem('fk_token');
    // 先搜索用户
    const searchRes = await fetch(`${API_BASE}/users/search?q=${encodeURIComponent(username)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!searchRes.ok) throw new Error('Search failed');
    const searchData = await searchRes.json();
    const users = searchData.users || [];
    if (users.length === 0) {
      showToast('User not found', 'error');
      return;
    }
    const targetUser = users[0];

    // 添加联系人
    const res = await fetch(`${API_BASE}/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId: targetUser.id })
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err);
    }

    hideModal('modalAddContact');
    document.getElementById('contactUsername').value = '';
    document.getElementById('contactDisplayName').value = '';
    showToast(`Added ${targetUser.displayName || targetUser.username}`, 'success');
    
    // v3.1: 同时保存到本地缓存
    const newContact = {
      contactUserId: targetUser.id,
      username: targetUser.username,
      displayName: targetUser.displayName || targetUser.username
    };
    const cached = JSON.parse(localStorage.getItem('fk_contacts_cache') || '[]');
    cached.push(newContact);
    localStorage.setItem('fk_contacts_cache', JSON.stringify(cached));
    console.log('[AddContact v3.1] Saved to local cache');
    
    await loadContacts();
  } catch (err) {
    showToast('Failed: ' + err.message, 'error');
    console.error('[AddContact v3] Error:', err);
  }
}

