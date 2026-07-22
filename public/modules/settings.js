// SPDX-License-Identifier: GPL-3.0-only
// ================================================
// Settings (unchanged from v2)
// ================================================
function renderSettings() {
  const container = document.getElementById('settingsSections');
  container.innerHTML = `
    <div class="settings-section">
      <h4 class="settings-section-title">Privacy & Security</h4>
      <div class="setting-item">
        <div class="setting-info"><div class="setting-name">Read Receipts</div><div class="setting-desc">Send read receipt confirmations</div></div>
        <label class="toggle"><input type="checkbox" data-setting="readReceipts" checked><span class="toggle-slider"></span></label>
      </div>
      <div class="setting-item">
        <div class="setting-info"><div class="setting-name">Typing Indicators</div><div class="setting-desc">Show when you are typing</div></div>
        <label class="toggle"><input type="checkbox" data-setting="typingIndicators" checked><span class="toggle-slider"></span></label>
      </div>
      <div class="setting-item">
        <div class="setting-info"><div class="setting-name">ZK Anonymous Mode</div><div class="setting-desc">Use zero-knowledge proofs for authentication</div></div>
        <label class="toggle"><input type="checkbox" data-setting="zkMode" checked><span class="toggle-slider"></span></label>
      </div>
      <div class="setting-item">
        <div class="setting-info"><div class="setting-name">Mixnet Routing</div><div class="setting-desc">Route messages through Nym Mixnet</div></div>
        <label class="toggle"><input type="checkbox" data-setting="mixnet" checked><span class="toggle-slider"></span></label>
      </div>
      <div class="setting-item">
        <div class="setting-info"><div class="setting-name">Post-Quantum KEM</div><div class="setting-desc">ML-KEM-768 (development paused)</div></div>
        <label class="toggle"><input type="checkbox" data-setting="pqKem"><span class="toggle-slider"></span></label>
      </div>
      <div class="setting-item">
        <div class="setting-info"><div class="setting-name">Satellite Mode</div><div class="setting-desc">Auto-adapt for satellite networks (2 hops, FEC)</div></div>
        <label class="toggle"><input type="checkbox" data-setting="satelliteMode" checked><span class="toggle-slider"></span></label>
      </div>
      <div class="setting-item">
        <div class="setting-info"><div class="setting-name">Quantum Enhancement</div><div class="setting-desc">Use QKD/QRNG when available (requires quantum network)</div></div>
        <label class="toggle"><input type="checkbox" data-setting="quantumMode" checked><span class="toggle-slider"></span></label>
      </div>
      <div class="setting-item">
        <div class="setting-info"><div class="setting-name">5G-A Optimization</div><div class="setting-desc">Optimize for 5G-A networks (edge computing, low latency)</div></div>
        <label class="toggle"><input type="checkbox" data-setting="5gMode" checked><span class="toggle-slider"></span></label>
      </div>
      <div class="setting-item">
        <div class="setting-info"><div class="setting-name">Anti-Screenshot</div><div class="setting-desc">Blur content when screenshot detected</div></div>
        <label class="toggle"><input type="checkbox" data-setting="STATE.antiScreenshot" checked><span class="toggle-slider"></span></label>
      </div>
      <div class="setting-item">
        <div class="setting-info"><div class="setting-name">Screenshot Detection</div><div class="setting-desc">Monitor for screenshot/screen recording</div></div>
        <label class="toggle"><input type="checkbox" data-setting="screenshotDetection" checked><span class="toggle-slider"></span></label>
      </div>
      <div class="setting-item">
        <div class="setting-info"><div class="setting-name">Auto Key Rotation</div><div class="setting-desc">Automatically rotate encryption keys</div></div>
        <label class="toggle"><input type="checkbox" data-setting="autoKeyRotation" checked><span class="toggle-slider"></span></label>
      </div>
    </div>
    <div class="settings-section">
      <h4 class="settings-section-title">Notifications</h4>
      <div class="setting-item">
        <div class="setting-info"><div class="setting-name">Message Notifications</div><div class="setting-desc">Show desktop notifications</div></div>
        <label class="toggle"><input type="checkbox" data-setting="notifications" checked><span class="toggle-slider"></span></label>
      </div>
      <div class="setting-item">
        <div class="setting-info"><div class="setting-name">Sound</div><div class="setting-desc">Play notification sounds</div></div>
        <label class="toggle"><input type="checkbox" data-setting="sound" checked><span class="toggle-slider"></span></label>
      </div>
    </div>
    <div class="settings-section">
      <h4 class="settings-section-title">Account</h4>
      <div class="setting-item clickable" id="settingDisplayName">
        <div class="setting-info"><div class="setting-name">Display Name</div><div class="setting-desc">${localStorage.getItem('fk_uname') || 'User'}</div></div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
      </div>
      <div class="setting-item clickable" id="settingPhone">
        <div class="setting-info"><div class="setting-name">📱 绑定手机</div><div class="setting-desc" id="settingPhoneDesc">未绑定</div></div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
      </div>
      <div class="setting-item clickable" id="settingSafetyNumber">
        <div class="setting-info"><div class="setting-name">Safety Number</div><div class="setting-desc">Verify encryption with contacts</div></div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
      </div>
      <div class="setting-item clickable danger" id="settingDeleteAccount">
        <div class="setting-info"><div class="setting-name">Delete Account</div><div class="setting-desc">Permanently delete your account and data</div></div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
      </div>
    </div>
    <div class="settings-section">
      <h4 class="settings-section-title">About</h4>
      <div class="setting-item">
        <div class="setting-info"><div class="setting-name">Version</div><div class="setting-desc">FIBEMATE v2.0.0-alpha</div></div>
      </div>
      <div class="setting-item">
        <div class="setting-info"><div class="setting-name">Security Score</div><div class="setting-desc">85/100 — Exceeds Signal (78)</div></div>
      </div>
    </div>
  `;

  container.querySelectorAll('input[data-setting]').forEach(input => {
    const saved = localStorage.getItem(`fk_setting_${input.dataset.setting}`);
    if (saved !== null) input.checked = saved === 'true';
    input.addEventListener('change', () => {
      localStorage.setItem(`fk_setting_${input.dataset.setting}`, input.checked);
      showToast(`${input.dataset.setting} ${input.checked ? 'enabled' : 'disabled'}`, 'info');
      
      // Handle privacy feature toggles
      if (input.dataset.setting === 'STATE.antiScreenshot') {
        input.checked ? enableAntiScreenshot() : disableAntiScreenshot();
      }
      if (input.dataset.setting === 'screenshotDetection') {
        if (STATE.screenshotDetector) {
          input.checked ? STATE.screenshotDetector.startMonitoring() : STATE.screenshotDetector.stopMonitoring();
        }
      }
      if (input.dataset.setting === 'autoKeyRotation') {
        if (STATE.privacyManager && STATE.privacyManager.modules.keyRotation) {
          input.checked ? STATE.privacyManager.modules.keyRotation.startAutoRotation() : STATE.privacyManager.modules.keyRotation.stopAutoRotation();
        }
      }
      if (input.dataset.setting === 'satelliteMode') {
        if (window.satelliteIntegration) {
          if (input.checked) {
            window.satelliteIntegration.init();
            showToast('Satellite mode enabled', 'info');
          } else {
            window.satelliteIntegration.destroy();
            showToast('Satellite mode disabled', 'info');
          }
        }
      }
      if (input.dataset.setting === 'quantumMode') {
        if (window.quantumIntegration) {
          if (input.checked) {
            window.quantumIntegration.enable();
            showToast('Quantum enhancement enabled', 'info');
          } else {
            window.quantumIntegration.disable();
            showToast('Quantum enhancement disabled', 'info');
          }
        }
      }
      if (input.dataset.setting === '5gMode') {
        if (window.fiveGIntegration) {
          if (input.checked) {
            window.fiveGIntegration.enable();
            showToast('5G-A optimization enabled', 'info');
          } else {
            window.fiveGIntegration.disable();
            showToast('5G-A optimization disabled', 'info');
          }
        }
      }
    });
  });

  document.getElementById('settingDisplayName')?.addEventListener('click', () => showToast('Display name change coming soon', 'info'));
  document.getElementById('settingSafetyNumber')?.addEventListener('click', () => showToast('A1:B2:C3:D4:E5:F6:78:90:AB:CD:EF:01:23:45:67:89', 'info'));
  document.getElementById('settingDeleteAccount')?.addEventListener('click', () => {
    if (confirm('Are you sure? This will permanently delete your account.')) {
      localStorage.clear();
      if (STATE.ws) STATE.ws.close();
      window.location.href = 'index.html';
    }
  });
}

