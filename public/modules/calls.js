// ================================================
// Voice Call (unchanged from v2)
// ================================================
function startCall() {
  if (!STATE.currentPeerName) return;
  startCallWith(STATE.currentPeerName);
}

function startCallWith(name) {
  hideAllMainViews();
  document.getElementById('callView').style.display = 'flex';
  document.getElementById('callName').textContent = name;
  document.getElementById('callAvatar').textContent = name.charAt(0).toUpperCase();
  document.getElementById('callStatus').textContent = 'Calling...';
  document.getElementById('STATE.callTimer').textContent = '00:00';
  STATE.callSeconds = 0;

  setTimeout(() => {
    if (document.getElementById('callView').style.display === 'none') return;
    document.getElementById('callStatus').textContent = 'Connected · Encrypted';
    STATE.callTimer = setInterval(() => {
      STATE.callSeconds++;
      const m = String(Math.floor(STATE.callSeconds / 60)).padStart(2, '0');
      const s = String(STATE.callSeconds % 60).padStart(2, '0');
      document.getElementById('STATE.callTimer').textContent = `${m}:${s}`;
    }, 1000);
  }, 2000);
}

function endCall() {
  if (STATE.callTimer) { clearInterval(STATE.callTimer); STATE.callTimer = null; }
  hideAllMainViews();
  if (STATE.currentPeerId) {
    document.getElementById('chatWindow').style.display = 'flex';
  } else {
    document.getElementById('chatEmpty').style.display = 'flex';
  }
  showToast(`Call ended · ${document.getElementById('STATE.callTimer').textContent}`, 'info');
}
// let STATE.isMuted declaration moved to app-state.js
function toggleMute() {
  STATE.isMuted = !STATE.isMuted;
  document.getElementById('btnMute').classList.toggle('active', STATE.isMuted);
  showToast(STATE.isMuted ? 'Microphone muted' : 'Microphone unmuted', 'info');
}
// let STATE.isSpeaker declaration moved to app-state.js
function toggleSpeaker() {
  STATE.isSpeaker = !STATE.isSpeaker;
  document.getElementById('btnSpeaker').classList.toggle('active', STATE.isSpeaker);
  showToast(STATE.isSpeaker ? 'Speaker on' : 'Speaker off', 'info');
}

