/**
 * FIBEMATE UI Bindings - Batch event binding utility
 * Replaces repetitive getElementById + addEventListener patterns
 */

/**
 * Bind click events to elements by ID
 * @param {Object} bindings - Map of element ID to handler function or function name
 * @param {string} event - Event type (default: 'click')
 */
function bindEvents(bindings, event = 'click') {
  Object.entries(bindings).forEach(([id, handler]) => {
    const el = document.getElementById(id);
    if (!el) {
      console.warn(`[UI Bindings] Element #${id} not found`);
      return;
    }
    
    if (typeof handler === 'string') {
      // Handler is a function name in global scope
      const fn = window[handler];
      if (typeof fn === 'function') {
        el.addEventListener(event, fn);
      } else {
        console.warn(`[UI Bindings] Function '${handler}' not found for #${id}`);
      }
    } else if (typeof handler === 'function') {
      el.addEventListener(event, handler);
    } else {
      console.warn(`[UI Bindings] Invalid handler for #${id}`);
    }
  });
}

/**
 * Bind click events with optional chaining (safe binding)
 * @param {Object} bindings - Map of element ID to handler
 */
function bindClicks(bindings) {
  Object.entries(bindings).forEach(([id, handler]) => {
    const el = document.getElementById(id);
    if (!el) return; // Silently skip missing elements
    
    if (typeof handler === 'function') {
      el.addEventListener('click', handler);
    } else if (typeof handler === 'string' && typeof window[handler] === 'function') {
      el.addEventListener('click', window[handler]);
    }
  });
}

/**
 * Bind multiple event types to elements
 * @param {Array<{id: string, event: string, handler: Function|string}>} configs
 */
function bindMultiple(configs) {
  configs.forEach(({ id, event = 'click', handler }) => {
    const el = document.getElementById(id);
    if (!el) return;
    
    const fn = typeof handler === 'function' ? handler : window[handler];
    if (typeof fn === 'function') {
      el.addEventListener(event, fn);
    }
  });
}

/**
 * Toggle class on button click
 * @param {string} btnId - Button element ID
 * @param {string} className - Class to toggle
 * @param {Function} onToggle - Optional callback(state)
 */
function bindToggle(btnId, className, onToggle) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  
  btn.addEventListener('click', () => {
    const isActive = btn.classList.toggle(className);
    if (typeof onToggle === 'function') {
      onToggle(isActive);
    }
  });
}

/**
 * Bind modal triggers
 * @param {Object} bindings - Map of trigger ID to modal ID or {modalId, onShow}
 */
function bindModals(bindings) {
  Object.entries(bindings).forEach(([triggerId, config]) => {
    const trigger = document.getElementById(triggerId);
    if (!trigger) return;
    
    const modalId = typeof config === 'string' ? config : config.modalId;
    const onShow = typeof config === 'object' ? config.onShow : null;
    
    trigger.addEventListener('click', () => {
      if (typeof onShow === 'function') onShow();
      showModal(modalId);
    });
  });
}

/**
 * Bind tab switching
 * @param {string} containerSelector - Container for tab buttons
 * @param {Function} onSwitch - Callback(tabId)
 */
function bindTabs(containerSelector, onSwitch) {
  const container = document.querySelector(containerSelector);
  if (!container) return;
  
  container.querySelectorAll('[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.dataset.tab;
      if (typeof onSwitch === 'function') {
        onSwitch(tabId);
      }
    });
  });
}

// ================================================
// Predefined binding configurations for main-v3.js
// ================================================

const MainUIBindings = {
  // Navigation
  btnBack: showChatEmpty,
  btnNewChat: () => switchTab('contacts'),
  btnStartChat: () => switchTab('contacts'),
  
  // Messaging
  btnSend: sendMessage,
  btnBurn: toggleBurnMode,
  
  // Contacts
  btnAddContact: () => showModal('modalAddContact'),
  btnAddContactEmpty: () => showModal('modalAddContact'),
  btnConfirmAddContact: addContact,
  btnExportContacts: exportContacts,
  
  // Groups
  btnCreateGroup: () => showModal('modalCreateGroup'),
  btnConfirmCreateGroup: createGroup,
  
  // Voice
  btnVoiceMsg: () => {
    if (voiceRecording) {
      stopVoiceRecording();
    } else {
      startVoiceRecording();
    }
  },
  
  // File
  btnAttach: () => document.getElementById('fileInput')?.click(),
  
  // Vault
  btnUploadVault: () => showModal('modalUploadVault'),
  btnUploadVaultEmpty: () => showModal('modalUploadVault'),
  btnConfirmUpload: uploadVaultFile,
  
  // Keys
  btnRotateKeys: rotateKeys,
  btnExportKeys: exportPublicKeys,
  
  // Voice Call
  btnVoiceCall: startCall,
  btnHangup: endCall,
  btnMute: toggleMute,
  btnSpeaker: toggleSpeaker,
  
  // Video Call
  btnVideoCall: startVideoCallTest,
  btnVideoHangup: endVideoCallTest,
  btnVideoMute: toggleVideoMute,
  btnVideoOff: toggleVideoOff,
  btnSwitchCamera: switchCamera,
  
  // Settings
  btnLogout: doLogout,
};

const SettingsBindings = {
  settingDisplayName: () => showToast('修改显示名称功能即将上线', 'info'),
  settingSafetyNumber: () => showModal('modalSafetyNumbers'),
  settingConnectionStats: showConnectionStats,
  settingDeleteAccount: () => {
    if (confirm('确定要删除账户吗？此操作不可撤销。')) {
      doLogout();
    }
  },
};

// ================================================
// Export
// ================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { bindEvents, bindClicks, bindMultiple, bindToggle, bindModals, bindTabs, MainUIBindings, SettingsBindings };
}
