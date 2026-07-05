/**
 * FIBEMATE Video Call UI - 视频通话界面
 * 完整的来电/去电 UI，包括视频预览
 * 2026-05-03
 */

const VideoCallUI = (() => {
    
    // 生成通话 UI HTML
    function getCallOverlayHTML() {
        return `
        <!-- 通话覆盖层 -->
        <div id="vc_callOverlay" class="call-overlay" style="display: none;">
            <!-- 主通话界面 -->
            <div class="call-container">
                <!-- 远端视频/头像 -->
                <div class="call-remote" id="callRemote">
                    <video id="vc_remoteVideo" class="remote-video" autoplay playsinline style="display: none;"></video>
                    <div id="vc_remoteAvatar" class="remote-avatar">
                        <div class="avatar-ring"></div>
                        <span class="avatar-initial" id="vc_remoteInitial">?</span>
                    </div>
                    <div class="call-peer-name" id="vc_callPeerName">正在连接...</div>
                    <div class="call-status" id="vc_callStatus">通话中</div>
                </div>
                
                <!-- 本地视频预览 -->
                <div class="call-local" id="vc_callLocal">
                    <video id="vc_localVideo" class="local-video" autoplay playsinline muted></video>
                    <div id="vc_localPlaceholder" class="local-placeholder">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                            <circle cx="12" cy="13" r="4"/>
                        </svg>
                    </div>
                </div>
                
                <!-- 通话计时 -->
                <div class="call-timer" id="vc_callTimer">00:00</div>
                
                <!-- 控制按钮 -->
                <div class="call-controls">
                    <button class="call-btn" id="vc_btnMute" title="静音">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                            <line x1="12" y1="19" x2="12" y2="23"/>
                            <line x1="8" y1="23" x2="16" y2="23"/>
                        </svg>
                    </button>
                    
                    <button class="call-btn" id="vc_btnVideoToggle" title="切换视频">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="23 7 16 12 23 17 23 7"/>
                            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                        </svg>
                    </button>
                    
                    <button class="call-btn" id="vc_btnSpeaker" title="扬声器">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                        </svg>
                    </button>
                    
                    <button class="call-btn" id="vc_btnFlipCamera" title="切换摄像头">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                            <path d="M9 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
                        </svg>
                    </button>
                    
                    <button class="call-btn end-call" id="vc_btnEndCall" title="结束通话">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                            <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
        
        <!-- 来电界面 -->
        <div id="vc_incomingCallOverlay" class="incoming-call-overlay" style="display: none;">
            <div class="incoming-call-container">
                <div class="incoming-avatar">
                    <div class="avatar-ring pulse"></div>
                    <span class="avatar-initial" id="vc_incomingAvatarInitial">?</span>
                </div>
                <div class="incoming-info">
                    <div class="incoming-title">来电</div>
                    <div class="incoming-name" id="vc_callerName">未知用户</div>
                    <div class="incoming-type" id="vc_incomingCallType">语音通话</div>
                </div>
                <div class="incoming-controls">
                    <button class="call-btn reject" id="vc_btnReject" title="拒绝">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72"/>
                            <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                    </button>
                    <button class="call-btn accept" id="vc_btnAccept" title="接听">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72"/>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
        
        <!-- 视频选择器 -->
        <div id="vc_videoSelectModal" class="modal" style="display: none;">
            <div class="modal-content">
                <div class="modal-header">
                    <h3>选择通话方式</h3>
                    <button class="modal-close" id="vc_closeVideoSelect">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="call-type-options">
                        <button class="call-type-btn" id="vc_btnVoiceCall">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72"/>
                            </svg>
                            <span>语音通话</span>
                        </button>
                        <button class="call-type-btn" id="vc_btnVideoCall">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polygon points="23 7 16 12 23 17 23 7"/>
                                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                            </svg>
                            <span>视频通话</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
        
        <style>
        /* 通话覆盖层样式 */
        .call-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .call-container {
            width: 100%;
            height: 100%;
            position: relative;
        }
        
        .call-remote {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 120px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        }
        
        .remote-video {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        
        .remote-avatar {
            width: 150px;
            height: 150px;
            border-radius: 50%;
            background: linear-gradient(135deg, #00e5c3, #00b8d4);
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
        }
        
        .avatar-ring {
            position: absolute;
            width: 100%;
            height: 100%;
            border-radius: 50%;
            border: 3px solid #00e5c3;
            animation: pulse-ring 2s infinite;
        }
        
        .avatar-ring.pulse {
            animation: pulse-ring 1s infinite;
        }
        
        @keyframes pulse-ring {
            0% { transform: scale(1); opacity: 1; }
            100% { transform: scale(1.2); opacity: 0; }
        }
        
        .avatar-initial {
            font-size: 60px;
            font-weight: bold;
            color: white;
        }
        
        .call-peer-name {
            margin-top: 20px;
            font-size: 24px;
            color: white;
        }
        
        .call-status {
            font-size: 14px;
            color: rgba(255,255,255,0.7);
            margin-top: 5px;
        }
        
        .call-local {
            position: absolute;
            top: 20px;
            right: 20px;
            width: 150px;
            height: 200px;
            border-radius: 10px;
            overflow: hidden;
            background: #0a0a15;
            border: 2px solid rgba(0,229,195,0.3);
        }
        
        .local-video {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        
        .local-placeholder {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: rgba(255,255,255,0.3);
        }
        
        .call-timer {
            position: absolute;
            top: 30px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 18px;
            color: rgba(255,255,255,0.8);
            background: rgba(0,0,0,0.5);
            padding: 5px 15px;
            border-radius: 20px;
        }
        
        .call-controls {
            position: absolute;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: 20px;
        }
        
        .call-btn {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            border: none;
            background: rgba(255,255,255,0.1);
            color: white;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s;
        }
        
        .call-btn:hover {
            background: rgba(255,255,255,0.2);
        }
        
        .call-btn.off {
            background: rgba(255,100,100,0.3);
        }
        
        .call-btn.end-call {
            background: #ff4757;
            transform: rotate(135deg);
        }
        
        .call-btn.end-call:hover {
            background: #ff6b81;
        }
        
        .call-btn svg {
            width: 24px;
            height: 24px;
        }
        
        .call-btn.accept {
            background: #00e5c3;
        }
        
        .call-btn.reject {
            background: #ff4757;
        }
        
        /* 来电界面 */
        .incoming-call-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .incoming-call-container {
            text-align: center;
        }
        
        .incoming-avatar {
            position: relative;
            width: 120px;
            height: 120px;
            margin: 0 auto;
        }
        
        .incoming-avatar .avatar-initial {
            font-size: 48px;
        }
        
        .incoming-info {
            margin: 30px 0;
        }
        
        .incoming-title {
            font-size: 16px;
            color: rgba(255,255,255,0.6);
            margin-bottom: 10px;
        }
        
        .incoming-name {
            font-size: 28px;
            color: white;
            margin-bottom: 5px;
        }
        
        .incoming-type {
            font-size: 14px;
            color: rgba(255,255,255,0.5);
        }
        
        .incoming-controls {
            display: flex;
            gap: 60px;
            justify-content: center;
            margin-top: 40px;
        }
        
        .incoming-controls .call-btn {
            width: 70px;
            height: 70px;
        }
        
        .incoming-controls .call-btn svg {
            width: 28px;
            height: 28px;
        }
        
        /* 通话类型选择 */
        .call-type-options {
            display: flex;
            gap: 20px;
            justify-content: center;
        }
        
        .call-type-btn {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
            padding: 30px;
            background: rgba(255,255,255,0.05);
            border: 2px solid rgba(255,255,255,0.1);
            border-radius: 15px;
            color: white;
            cursor: pointer;
            transition: all 0.3s;
        }
        
        .call-type-btn:hover {
            background: rgba(0,229,195,0.1);
            border-color: #00e5c3;
        }
        
        .call-type-btn svg {
            width: 48px;
            height: 48px;
        }
        
        .call-type-btn span {
            font-size: 16px;
        }
        </style>
        `;
    }

    // 初始化 UI
    function init(options = {}) {
        const {
            onStartCall = null,
            onEndCall = null,
            onAcceptCall = null,
            onRejectCall = null,
            onToggleVideo = null,
            onToggleMute = null
        } = options;

        // 插入 HTML
        document.body.insertAdjacentHTML('beforeend', getCallOverlayHTML());

        // 绑定事件
        bindEvents(options);
    }

    // 绑定事件
    function bindEvents(options) {
        // 结束通话
        const btnEndCall = document.getElementById('vc_btnEndCall');
        if (btnEndCall) {
            btnEndCall.addEventListener('click', () => {
                if (options.onEndCall) options.onEndCall();
                hideCallOverlay();
            });
        }

        // 静音
        const btnMute = document.getElementById('vc_btnMute');
        if (btnMute) {
            btnMute.addEventListener('click', () => {
                const isMuted = btnMute.classList.toggle('off');
                if (options.onToggleMute) options.onToggleMute(isMuted);
            });
        }

        // 视频切换
        const btnVideoToggle = document.getElementById('vc_btnVideoToggle');
        if (btnVideoToggle) {
            btnVideoToggle.addEventListener('click', () => {
                const isOff = btnVideoToggle.classList.toggle('off');
                if (options.onToggleVideo) options.onToggleVideo(isOff);
            });
        }

        // 接听
        const btnAccept = document.getElementById('vc_btnAccept');
        if (btnAccept) {
            btnAccept.addEventListener('click', () => {
                if (options.onAcceptCall) options.onAcceptCall();
                hideIncomingOverlay();
                showCallOverlay();
            });
        }

        // 拒绝
        const btnReject = document.getElementById('vc_btnReject');
        if (btnReject) {
            btnReject.addEventListener('click', () => {
                if (options.onRejectCall) options.onRejectCall();
                hideIncomingOverlay();
            });
        }

        // 通话类型选择
        const btnVoiceCall = document.getElementById('vc_btnVoiceCall');
        if (btnVoiceCall) {
            btnVoiceCall.addEventListener('click', () => {
                hideVideoSelectModal();
                if (options.onStartCall) options.onStartCall('voice');
            });
        }

        const btnVideoCall = document.getElementById('vc_btnVideoCall');
        if (btnVideoCall) {
            btnVideoCall.addEventListener('click', () => {
                hideVideoSelectModal();
                if (options.onStartCall) options.onStartCall('video');
            });
        }

        const closeVideoSelect = document.getElementById('vc_closeVideoSelect');
        if (closeVideoSelect) {
            closeVideoSelect.addEventListener('click', hideVideoSelectModal);
        }
    }

    // 显示通话界面
    function showCallOverlay() {
        const overlay = document.getElementById('vc_callOverlay');
        if (overlay) overlay.style.display = 'flex';
    }

    // 隐藏通话界面
    function hideCallOverlay() {
        const overlay = document.getElementById('vc_callOverlay');
        if (overlay) overlay.style.display = 'none';
    }

    // 显示来电界面
    function showIncomingOverlay(callerName, callType = 'voice') {
        const overlay = document.getElementById('vc_incomingCallOverlay');
        const nameEl = document.getElementById('vc_callerName');
        const typeEl = document.getElementById('vc_incomingCallType');
        const initialEl = document.getElementById('vc_incomingAvatarInitial');

        if (overlay) {
            overlay.style.display = 'flex';
            if (nameEl) nameEl.textContent = callerName || '未知用户';
            if (typeEl) typeEl.textContent = callType === 'video' ? '视频通话' : '语音通话';
            if (initialEl && callerName) {
                initialEl.textContent = callerName.charAt(0).toUpperCase();
            }
        }
    }

    // 隐藏来电界面
    function hideIncomingOverlay() {
        const overlay = document.getElementById('vc_incomingCallOverlay');
        if (overlay) overlay.style.display = 'none';
    }

    // 显示通话类型选择
    function showVideoSelectModal() {
        const modal = document.getElementById('vc_videoSelectModal');
        if (modal) modal.style.display = 'flex';
    }

    // 隐藏通话类型选择
    function hideVideoSelectModal() {
        const modal = document.getElementById('vc_videoSelectModal');
        if (modal) modal.style.display = 'none';
    }

    // 更新通话状态
    function updateCallStatus(status) {
        const statusEl = document.getElementById('vc_callStatus');
        if (statusEl) {
            const statusMap = {
                'calling': '正在呼叫...',
                'connected': '通话中',
                'ringing': '等待接听...',
                'ended': '通话已结束'
            };
            statusEl.textContent = statusMap[status] || status;
        }
    }

    // 更新对方名称
    function updatePeerName(name) {
        const nameEl = document.getElementById('vc_callPeerName');
        const initialEl = document.getElementById('vc_remoteInitial');
        
        if (nameEl) nameEl.textContent = name || '未知用户';
        if (initialEl && name) {
            initialEl.textContent = name.charAt(0).toUpperCase();
        }
    }

    // 更新计时器
    function updateTimer(seconds) {
        const timerEl = document.getElementById('vc_callTimer');
        if (timerEl) {
            const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
            const secs = (seconds % 60).toString().padStart(2, '0');
            timerEl.textContent = `${mins}:${secs}`;
        }
    }

    // 显示/隐藏本地预览
    function showLocalVideo(show) {
        const localVideo = document.getElementById('vc_localVideo');
        const localPlaceholder = document.getElementById('vc_localPlaceholder');
        
        if (localVideo) localVideo.style.display = show ? 'block' : 'none';
        if (localPlaceholder) localPlaceholder.style.display = show ? 'none' : 'flex';
    }

    // 显示/隐藏远端视频
    function showRemoteVideo(show) {
        const remoteVideo = document.getElementById('vc_remoteVideo');
        const remoteAvatar = document.getElementById('vc_remoteAvatar');
        
        if (remoteVideo) remoteVideo.style.display = show ? 'block' : 'none';
        if (remoteAvatar) remoteAvatar.style.display = show ? 'none' : 'flex';
    }

    // 设置本地视频流
    function setLocalStream(stream) {
        const localVideo = document.getElementById('vc_localVideo');
        if (localVideo && stream) {
            localVideo.srcObject = stream;
            showLocalVideo(true);
        }
    }

    // 设置远端视频流
    function setRemoteStream(stream) {
        const remoteVideo = document.getElementById('vc_remoteVideo');
        if (remoteVideo && stream) {
            remoteVideo.srcObject = stream;
            showRemoteVideo(true);
        }
    }

    // 导出 API
    return {
        init,
        showCallOverlay,
        hideCallOverlay,
        showIncomingOverlay,
        hideIncomingOverlay,
        showVideoSelectModal,
        hideVideoSelectModal,
        updateCallStatus,
        updatePeerName,
        updateTimer,
        showLocalVideo,
        showRemoteVideo,
        setLocalStream,
        setRemoteStream
    };
})();

// 自动初始化（可选）
if (typeof window !== 'undefined') {
    window.VideoCallUI = VideoCallUI;
}
