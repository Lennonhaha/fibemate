// SPDX-License-Identifier: GPL-3.0-only
/**
 * FIBEMATE Nexus WebSocket Events
 * Real-time communication for community features
 * 
 * Integrate with your existing WebSocket server:
 * const { handleNexusEvents } = require('./server-nexus-ws');
 * io.on('connection', (socket) => handleNexusEvents(socket, io));
 */

const crypto = require('crypto');

// 在线状态管理
const presenceStore = new Map(); // userId -> { status, lastSeen, socketId }
const channelRooms = new Map(); // channelId -> Set(userIds)
const voiceChannels = new Map(); // channelId -> { participants: Map(userId -> peerInfo) }

function handleNexusEvents(socket, io) {
  const userId = socket.user?.id; // 从认证中间件获取
  
  if (!userId) {
    socket.disconnect();
    return;
  }

  console.log(`[Nexus WS] User ${userId} connected`);

  // ========== 连接初始化 ==========
  
  // 更新用户在线状态
  updatePresence(userId, 'online', socket.id);
  
  // 广播用户上线
  broadcastToFriends(userId, {
    type: 'presence:update',
    data: { userId, status: 'online' }
  });

  // ========== Space 事件 ==========
  
  // 加入空间
  socket.on('space:join', ({ spaceId }) => {
    socket.join(`space:${spaceId}`);
    
    // 发送空间成员列表
    const members = getSpaceMembers(spaceId);
    socket.emit('space:members', { spaceId, members });
    
    // 广播新成员加入
    socket.to(`space:${spaceId}`).emit('space:member_join', {
      spaceId,
      userId,
      timestamp: new Date().toISOString()
    });
    
    console.log(`[Space] ${userId} joined ${spaceId}`);
  });

  // 离开空间
  socket.on('space:leave', ({ spaceId }) => {
    socket.leave(`space:${spaceId}`);
    
    socket.to(`space:${spaceId}`).emit('space:member_leave', {
      spaceId,
      userId,
      timestamp: new Date().toISOString()
    });
    
    console.log(`[Space] ${userId} left ${spaceId}`);
  });

  // ========== Channel 事件 ==========
  
  // 加入频道
  socket.on('channel:join', ({ channelId }) => {
    socket.join(`channel:${channelId}`);
    
    // 添加到频道房间
    if (!channelRooms.has(channelId)) {
      channelRooms.set(channelId, new Set());
    }
    channelRooms.get(channelId).add(userId);
    
    // 发送最近消息
    const recentMessages = getRecentMessages(channelId, 50);
    socket.emit('channel:history', { channelId, messages: recentMessages });
    
    // 广播用户加入频道
    socket.to(`channel:${channelId}`).emit('channel:member_join', {
      channelId,
      userId,
      memberCount: channelRooms.get(channelId).size
    });
    
    console.log(`[Channel] ${userId} joined ${channelId}`);
  });

  // 离开频道
  socket.on('channel:leave', ({ channelId }) => {
    socket.leave(`channel:${channelId}`);
    
    const room = channelRooms.get(channelId);
    if (room) {
      room.delete(userId);
      
      socket.to(`channel:${channelId}`).emit('channel:member_leave', {
        channelId,
        userId,
        memberCount: room.size
      });
    }
    
    console.log(`[Channel] ${userId} left ${channelId}`);
  });

  // ========== Message 事件 ==========
  
  // 发送消息
  socket.on('message:send', (data) => {
    const { channelId, content, replyTo, attachments = [] } = data;
    
    const message = {
      id: generateId('msg'),
      channelId,
      authorId: userId,
      content,
      replyTo,
      attachments,
      timestamp: new Date().toISOString(),
      edited: false,
      reactions: {}
    };
    
    // 保存消息（这里应该调用你的数据库逻辑）
    saveMessage(message);
    
    // 广播给频道所有成员
    io.to(`channel:${channelId}`).emit('message:new', {
      message: sanitizeMessage(message)
    });
    
    console.log(`[Message] ${userId} in ${channelId}: ${content.slice(0, 50)}...`);
  });

  // 编辑消息
  socket.on('message:edit', ({ messageId, content }) => {
    const message = getMessage(messageId);
    if (!message || message.authorId !== userId) {
      socket.emit('error', { message: 'Cannot edit this message' });
      return;
    }
    
    message.content = content;
    message.edited = true;
    message.editedAt = new Date().toISOString();
    
    io.to(`channel:${message.channelId}`).emit('message:updated', {
      message: sanitizeMessage(message)
    });
  });

  // 删除消息
  socket.on('message:delete', ({ messageId }) => {
    const message = getMessage(messageId);
    if (!message || message.authorId !== userId) {
      socket.emit('error', { message: 'Cannot delete this message' });
      return;
    }
    
    deleteMessage(messageId);
    
    io.to(`channel:${message.channelId}`).emit('message:deleted', {
      messageId,
      channelId: message.channelId
    });
  });

  // 添加反应
  socket.on('message:react', ({ messageId, emoji }) => {
    const message = getMessage(messageId);
    if (!message) return;
    
    if (!message.reactions[emoji]) {
      message.reactions[emoji] = [];
    }
    
    const userIndex = message.reactions[emoji].indexOf(userId);
    if (userIndex === -1) {
      message.reactions[emoji].push(userId);
    } else {
      message.reactions[emoji].splice(userIndex, 1);
      if (message.reactions[emoji].length === 0) {
        delete message.reactions[emoji];
      }
    }
    
    io.to(`channel:${message.channelId}`).emit('message:reaction', {
      messageId,
      emoji,
      userId,
      count: message.reactions[emoji]?.length || 0
    });
  });

  // ========== Typing 事件 ==========
  
  let typingTimeout;
  
  socket.on('typing:start', ({ channelId }) => {
    socket.to(`channel:${channelId}`).emit('typing:start', {
      channelId,
      userId
    });
    
    // 3秒后自动停止
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      socket.to(`channel:${channelId}`).emit('typing:stop', {
        channelId,
        userId
      });
    }, 3000);
  });

  socket.on('typing:stop', ({ channelId }) => {
    clearTimeout(typingTimeout);
    socket.to(`channel:${channelId}`).emit('typing:stop', {
      channelId,
      userId
    });
  });

  // ========== Voice 事件 ==========
  
  // 加入语音频道
  socket.on('voice:join', ({ channelId, token }) => {
    // 验证令牌
    if (!validateVoiceToken(token, userId, channelId)) {
      socket.emit('voice:error', { message: 'Invalid token' });
      return;
    }
    
    socket.join(`voice:${channelId}`);
    
    if (!voiceChannels.has(channelId)) {
      voiceChannels.set(channelId, { participants: new Map() });
    }
    
    const voiceChannel = voiceChannels.get(channelId);
    voiceChannel.participants.set(userId, {
      socketId: socket.id,
      muted: false,
      deafened: false,
      speaking: false
    });
    
    // 通知频道内其他用户
    socket.to(`voice:${channelId}`).emit('voice:participant_joined', {
      channelId,
      userId,
      participantCount: voiceChannel.participants.size
    });
    
    // 发送现有参与者列表
    const participants = Array.from(voiceChannel.participants.keys())
      .filter(id => id !== userId);
    socket.emit('voice:participants', { channelId, participants });
    
    console.log(`[Voice] ${userId} joined voice ${channelId}`);
  });

  // 离开语音频道
  socket.on('voice:leave', ({ channelId }) => {
    socket.leave(`voice:${channelId}`);
    
    const voiceChannel = voiceChannels.get(channelId);
    if (voiceChannel) {
      voiceChannel.participants.delete(userId);
      
      socket.to(`voice:${channelId}`).emit('voice:participant_left', {
        channelId,
        userId,
        participantCount: voiceChannel.participants.size
      });
      
      // 清理空频道
      if (voiceChannel.participants.size === 0) {
        voiceChannels.delete(channelId);
      }
    }
    
    console.log(`[Voice] ${userId} left voice ${channelId}`);
  });

  // WebRTC 信令转发
  socket.on('voice:offer', ({ channelId, targetUserId, offer }) => {
    const voiceChannel = voiceChannels.get(channelId);
    if (!voiceChannel) return;
    
    const participant = voiceChannel.participants.get(targetUserId);
    if (!participant) return;
    
    io.to(participant.socketId).emit('voice:offer', {
      channelId,
      userId,
      offer
    });
  });

  socket.on('voice:answer', ({ channelId, targetUserId, answer }) => {
    const voiceChannel = voiceChannels.get(channelId);
    if (!voiceChannel) return;
    
    const participant = voiceChannel.participants.get(targetUserId);
    if (!participant) return;
    
    io.to(participant.socketId).emit('voice:answer', {
      channelId,
      userId,
      answer
    });
  });

  socket.on('voice:ice_candidate', ({ channelId, targetUserId, candidate }) => {
    const voiceChannel = voiceChannels.get(channelId);
    if (!voiceChannel) return;
    
    const participant = voiceChannel.participants.get(targetUserId);
    if (!participant) return;
    
    io.to(participant.socketId).emit('voice:ice_candidate', {
      channelId,
      userId,
      candidate
    });
  });

  // 语音状态更新
  socket.on('voice:state', ({ channelId, state }) => {
    const voiceChannel = voiceChannels.get(channelId);
    if (!voiceChannel) return;
    
    const participant = voiceChannel.participants.get(userId);
    if (participant) {
      Object.assign(participant, state);
    }
    
    socket.to(`voice:${channelId}`).emit('voice:participant_state', {
      channelId,
      userId,
      state
    });
  });

  // ========== Thread 事件 ==========
  
  socket.on('thread:join', ({ threadId }) => {
    socket.join(`thread:${threadId}`);
    console.log(`[Thread] ${userId} joined ${threadId}`);
  });

  socket.on('thread:leave', ({ threadId }) => {
    socket.leave(`thread:${threadId}`);
    console.log(`[Thread] ${userId} left ${threadId}`);
  });

  socket.on('thread:message', ({ threadId, content }) => {
    const message = {
      id: generateId('msg'),
      threadId,
      authorId: userId,
      content,
      timestamp: new Date().toISOString()
    };
    
    saveThreadMessage(threadId, message);
    
    io.to(`thread:${threadId}`).emit('thread:message', {
      message: sanitizeMessage(message)
    });
  });

  // ========== Presence 事件 ==========
  
  socket.on('presence:update', ({ status }) => {
    updatePresence(userId, status);
    
    broadcastToFriends(userId, {
      type: 'presence:update',
      data: { userId, status }
    });
  });

  // ========== 断开连接 ==========
  
  socket.on('disconnect', () => {
    console.log(`[Nexus WS] User ${userId} disconnected`);
    
    // 更新为离线状态
    updatePresence(userId, 'offline');
    
    // 广播离线状态
    broadcastToFriends(userId, {
      type: 'presence:update',
      data: { userId, status: 'offline', lastSeen: new Date().toISOString() }
    });
    
    // 清理语音频道
    voiceChannels.forEach((voiceChannel, channelId) => {
      if (voiceChannel.participants.has(userId)) {
        voiceChannel.participants.delete(userId);
        socket.to(`voice:${channelId}`).emit('voice:participant_left', {
          channelId,
          userId,
          participantCount: voiceChannel.participants.size
        });
      }
    });
    
    // 清理频道房间
    channelRooms.forEach((room, channelId) => {
      if (room.has(userId)) {
        room.delete(userId);
        socket.to(`channel:${channelId}`).emit('channel:member_leave', {
          channelId,
          userId,
          memberCount: room.size
        });
      }
    });
  });
}

// ========== 工具函数 ==========

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function updatePresence(userId, status, socketId = null) {
  presenceStore.set(userId, {
    status,
    socketId,
    lastSeen: new Date().toISOString()
  });
}

function broadcastToFriends(userId, data) {
  // 这里应该获取用户的好友列表并广播
  // 简化实现：广播给所有连接的客户端
  // io.emit(data.type, data.data);
}

function getSpaceMembers(spaceId) {
  // 从数据库获取空间成员
  // 简化实现：返回空数组
  return [];
}

function getRecentMessages(channelId, limit) {
  // 从数据库获取最近消息
  // 简化实现：返回空数组
  return [];
}

function saveMessage(message) {
  // 保存消息到数据库
  console.log('[Save Message]', message.id);
}

function getMessage(messageId) {
  // 从数据库获取消息
  // 简化实现：返回 null
  return null;
}

function deleteMessage(messageId) {
  // 从数据库删除消息
  console.log('[Delete Message]', messageId);
}

function saveThreadMessage(threadId, message) {
  // 保存线程消息
  console.log('[Save Thread Message]', threadId, message.id);
}

function validateVoiceToken(token, userId, channelId) {
  // 验证语音令牌
  // 简化实现：总是返回 true
  return true;
}

function sanitizeMessage(message) {
  return {
    id: message.id,
    channelId: message.channelId,
    threadId: message.threadId,
    authorId: message.authorId,
    content: message.content,
    replyTo: message.replyTo,
    attachments: message.attachments,
    timestamp: message.timestamp,
    edited: message.edited,
    reactions: message.reactions
  };
}

module.exports = { handleNexusEvents };
