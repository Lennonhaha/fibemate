// SPDX-License-Identifier: GPL-3.0-only
/**
 * FIBEMATE Nexus Community Backend API
 * Express.js routes for Spaces, Channels, Threads, Messages
 * 
 * Add this to your existing Express server:
 * const nexusRoutes = require('./server-nexus-api');
 * app.use('/api', nexusRoutes);
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// ========== 内存存储（生产环境改用 PostgreSQL）==========
const db = {
  spaces: new Map(),
  channels: new Map(),
  threads: new Map(),
  messages: new Map(),
  memberships: new Map(), // spaceId_userId -> role
  presence: new Map(),
  voiceTokens: new Map()
};

// ========== 认证中间件 ==========
function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const token = auth.slice(7);
  // 验证 token（集成你现有的 auth 系统）
  req.user = { id: decodeToken(token), token };
  next();
}

function decodeToken(token) {
  // 集成你现有的 JWT 验证
  // 临时实现：直接返回 token 作为 userId
  return token.slice(0, 16);
}

// ========== Space 路由 ==========

// 创建空间
router.post('/spaces', authenticate, async (req, res) => {
  try {
    const { name, description, icon, isPublic = false, features = {}, encryption = {} } = req.body;
    const ownerId = req.user.id;
    
    const spaceId = generateId('space');
    const space = {
      id: spaceId,
      name,
      description,
      icon,
      isPublic,
      ownerId,
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
        publicKey: encryption.publicKey || null,
        algorithm: 'X3DH+ML-KEM-768'
      },
      channels: [],
      memberCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    db.spaces.set(spaceId, space);
    db.memberships.set(`${spaceId}_${ownerId}`, 'owner');
    
    // 创建默认频道
    const defaultChannels = [
      { name: 'general', displayName: 'general', type: 'text', topic: 'General discussion' },
      { name: 'announcements', displayName: 'announcements', type: 'announcement', topic: 'Important updates' }
    ];
    
    for (const ch of defaultChannels) {
      const channelId = generateId('channel');
      const channel = {
        id: channelId,
        spaceId,
        ...ch,
        permissions: getDefaultPermissions(ch.type),
        messages: [],
        createdAt: new Date().toISOString()
      };
      db.channels.set(channelId, channel);
      space.channels.push(channelId);
    }
    
    res.status(201).json({
      success: true,
      space: sanitizeSpace(space, ownerId)
    });
  } catch (err) {
    console.error('[Space Create]', err);
    res.status(500).json({ error: 'Failed to create space' });
  }
});

// 获取空间列表
router.get('/spaces', authenticate, async (req, res) => {
  try {
    const { type = 'public' } = req.query;
    const userId = req.user.id;
    
    let spaces = Array.from(db.spaces.values());
    
    if (type === 'joined') {
      spaces = spaces.filter(s => db.memberships.has(`${s.id}_${userId}`));
    } else if (type === 'public') {
      spaces = spaces.filter(s => s.isPublic);
    }
    
    res.json({
      spaces: spaces.map(s => sanitizeSpace(s, userId))
    });
  } catch (err) {
    console.error('[Space List]', err);
    res.status(500).json({ error: 'Failed to list spaces' });
  }
});

// 获取单个空间
router.get('/spaces/:spaceId', authenticate, async (req, res) => {
  try {
    const { spaceId } = req.params;
    const userId = req.user.id;
    
    const space = db.spaces.get(spaceId);
    if (!space) {
      return res.status(404).json({ error: 'Space not found' });
    }
    
    // 检查权限
    if (!space.isPublic && !db.memberships.has(`${spaceId}_${userId}`)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json({
      space: sanitizeSpace(space, userId, true)
    });
  } catch (err) {
    console.error('[Space Get]', err);
    res.status(500).json({ error: 'Failed to get space' });
  }
});

// 加入空间
router.post('/spaces/:spaceId/join', authenticate, async (req, res) => {
  try {
    const { spaceId } = req.params;
    const { inviteCode } = req.body;
    const userId = req.user.id;
    
    const space = db.spaces.get(spaceId);
    if (!space) {
      return res.status(404).json({ error: 'Space not found' });
    }
    
    // 检查是否已加入
    if (db.memberships.has(`${spaceId}_${userId}`)) {
      return res.status(400).json({ error: 'Already a member' });
    }
    
    // 验证邀请码（私有空间）
    if (!space.isPublic && space.inviteCode !== inviteCode) {
      return res.status(403).json({ error: 'Invalid invite code' });
    }
    
    db.memberships.set(`${spaceId}_${userId}`, 'member');
    space.memberCount++;
    
    res.json({
      success: true,
      space: sanitizeSpace(space, userId),
      encryptionEnabled: space.encryption.enabled
    });
  } catch (err) {
    console.error('[Space Join]', err);
    res.status(500).json({ error: 'Failed to join space' });
  }
});

// 离开空间
router.post('/spaces/:spaceId/leave', authenticate, async (req, res) => {
  try {
    const { spaceId } = req.params;
    const userId = req.user.id;
    
    const membershipKey = `${spaceId}_${userId}`;
    if (!db.memberships.has(membershipKey)) {
      return res.status(400).json({ error: 'Not a member' });
    }
    
    db.memberships.delete(membershipKey);
    
    const space = db.spaces.get(spaceId);
    if (space) space.memberCount--;
    
    res.json({ success: true });
  } catch (err) {
    console.error('[Space Leave]', err);
    res.status(500).json({ error: 'Failed to leave space' });
  }
});

// ========== Channel 路由 ==========

// 创建频道
router.post('/spaces/:spaceId/channels', authenticate, async (req, res) => {
  try {
    const { spaceId } = req.params;
    const { name, type = 'text', parentId = null, topic = '' } = req.body;
    const userId = req.user.id;
    
    // 检查权限
    const role = db.memberships.get(`${spaceId}_${userId}`);
    if (!['owner', 'admin'].includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    const space = db.spaces.get(spaceId);
    if (!space) {
      return res.status(404).json({ error: 'Space not found' });
    }
    
    const channelId = generateId('channel');
    const channel = {
      id: channelId,
      spaceId,
      name: name.toLowerCase().replace(/\s+/g, '-'),
      displayName: name,
      type,
      parentId,
      topic,
      permissions: getDefaultPermissions(type),
      messages: [],
      createdAt: new Date().toISOString()
    };
    
    db.channels.set(channelId, channel);
    space.channels.push(channelId);
    
    res.status(201).json({
      success: true,
      channel: sanitizeChannel(channel)
    });
  } catch (err) {
    console.error('[Channel Create]', err);
    res.status(500).json({ error: 'Failed to create channel' });
  }
});

// 获取频道列表
router.get('/spaces/:spaceId/channels', authenticate, async (req, res) => {
  try {
    const { spaceId } = req.params;
    const userId = req.user.id;
    
    // 检查成员权限
    if (!db.memberships.has(`${spaceId}_${userId}`)) {
      return res.status(403).json({ error: 'Not a member' });
    }
    
    const space = db.spaces.get(spaceId);
    if (!space) {
      return res.status(404).json({ error: 'Space not found' });
    }
    
    const channels = space.channels
      .map(id => db.channels.get(id))
      .filter(Boolean)
      .map(sanitizeChannel);
    
    res.json({ channels });
  } catch (err) {
    console.error('[Channel List]', err);
    res.status(500).json({ error: 'Failed to list channels' });
  }
});

// ========== Message 路由 ==========

// 发送消息
router.post('/channels/:channelId/messages', authenticate, async (req, res) => {
  try {
    const { channelId } = req.params;
    const { content, replyTo = null, attachments = [], ephemeral = null } = req.body;
    const userId = req.user.id;
    
    const channel = db.channels.get(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    
    // 检查空间成员权限
    if (!db.memberships.has(`${channel.spaceId}_${userId}`)) {
      return res.status(403).json({ error: 'Not a member' });
    }
    
    const messageId = generateId('msg');
    const message = {
      id: messageId,
      channelId,
      authorId: userId,
      content,
      replyTo,
      attachments,
      ephemeral,
      timestamp: new Date().toISOString(),
      edited: false,
      reactions: {},
      threadCount: 0
    };
    
    db.messages.set(messageId, message);
    channel.messages.push(messageId);
    
    // 广播给频道成员（通过 WebSocket）
    broadcastToChannel(channelId, {
      type: 'message:new',
      data: sanitizeMessage(message)
    });
    
    res.status(201).json({
      success: true,
      message: sanitizeMessage(message)
    });
  } catch (err) {
    console.error('[Message Send]', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// 获取消息历史
router.get('/channels/:channelId/messages', authenticate, async (req, res) => {
  try {
    const { channelId } = req.params;
    const { before, limit = 50 } = req.query;
    const userId = req.user.id;
    
    const channel = db.channels.get(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    
    // 检查权限
    if (!db.memberships.has(`${channel.spaceId}_${userId}`)) {
      return res.status(403).json({ error: 'Not a member' });
    }
    
    let messages = channel.messages
      .map(id => db.messages.get(id))
      .filter(Boolean)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    if (before) {
      const idx = messages.findIndex(m => m.id === before);
      if (idx !== -1) messages = messages.slice(idx + 1);
    }
    
    messages = messages.slice(0, parseInt(limit));
    
    res.json({
      messages: messages.map(sanitizeMessage),
      hasMore: messages.length === parseInt(limit)
    });
  } catch (err) {
    console.error('[Message List]', err);
    res.status(500).json({ error: 'Failed to list messages' });
  }
});

// 添加反应
router.post('/messages/:messageId/reactions', authenticate, async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user.id;
    
    const message = db.messages.get(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    if (!message.reactions[emoji]) {
      message.reactions[emoji] = [];
    }
    
    if (!message.reactions[emoji].includes(userId)) {
      message.reactions[emoji].push(userId);
    }
    
    broadcastToChannel(message.channelId, {
      type: 'message:reaction',
      data: { messageId, emoji, userId }
    });
    
    res.json({ success: true });
  } catch (err) {
    console.error('[Reaction]', err);
    res.status(500).json({ error: 'Failed to add reaction' });
  }
});

// ========== Thread 路由 ==========

// 创建线程
router.post('/channels/:channelId/threads', authenticate, async (req, res) => {
  try {
    const { channelId } = req.params;
    const { parentMessageId, title, initialMessage } = req.body;
    const userId = req.user.id;
    
    const channel = db.channels.get(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    
    const threadId = generateId('thread');
    const thread = {
      id: threadId,
      channelId,
      parentMessageId,
      title,
      authorId: userId,
      messages: [{
        id: generateId('msg'),
        authorId: userId,
        content: initialMessage,
        timestamp: new Date().toISOString()
      }],
      participantCount: 1,
      createdAt: new Date().toISOString()
    };
    
    db.threads.set(threadId, thread);
    
    // 更新父消息线程计数
    const parentMsg = db.messages.get(parentMessageId);
    if (parentMsg) parentMsg.threadCount++;
    
    res.status(201).json({
      success: true,
      thread: sanitizeThread(thread)
    });
  } catch (err) {
    console.error('[Thread Create]', err);
    res.status(500).json({ error: 'Failed to create thread' });
  }
});

// 获取线程消息
router.get('/threads/:threadId/messages', authenticate, async (req, res) => {
  try {
    const { threadId } = req.params;
    
    const thread = db.threads.get(threadId);
    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }
    
    res.json({
      thread: sanitizeThread(thread),
      messages: thread.messages.map(sanitizeMessage)
    });
  } catch (err) {
    console.error('[Thread Get]', err);
    res.status(500).json({ error: 'Failed to get thread' });
  }
});

// ========== Voice 路由 ==========

// 获取语音令牌
router.get('/channels/:channelId/voice/token', authenticate, async (req, res) => {
  try {
    const { channelId } = req.params;
    const userId = req.user.id;
    
    const channel = db.channels.get(channelId);
    if (!channel || channel.type !== 'voice') {
      return res.status(400).json({ error: 'Invalid voice channel' });
    }
    
    const token = crypto.randomBytes(32).toString('hex');
    db.voiceTokens.set(token, { channelId, userId, createdAt: Date.now() });
    
    // 清理过期令牌（1小时后）
    setTimeout(() => db.voiceTokens.delete(token), 3600000);
    
    res.json({
      token,
      servers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });
  } catch (err) {
    console.error('[Voice Token]', err);
    res.status(500).json({ error: 'Failed to get voice token' });
  }
});

// ========== Search 路由 ==========

// 搜索空间
router.get('/spaces/search', authenticate, async (req, res) => {
  try {
    const { q } = req.query;
    const userId = req.user.id;
    
    if (!q || q.length < 2) {
      return res.json({ spaces: [] });
    }
    
    const query = q.toLowerCase();
    const spaces = Array.from(db.spaces.values())
      .filter(s => s.isPublic || db.memberships.has(`${s.id}_${userId}`))
      .filter(s => 
        s.name.toLowerCase().includes(query) ||
        s.description?.toLowerCase().includes(query)
      )
      .map(s => sanitizeSpace(s, userId));
    
    res.json({ spaces });
  } catch (err) {
    console.error('[Search]', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// 获取热门空间
router.get('/spaces/trending', authenticate, async (req, res) => {
  try {
    const spaces = Array.from(db.spaces.values())
      .filter(s => s.isPublic)
      .sort((a, b) => b.memberCount - a.memberCount)
      .slice(0, 10)
      .map(s => sanitizeSpace(s, req.user.id));
    
    res.json({ spaces });
  } catch (err) {
    console.error('[Trending]', err);
    res.status(500).json({ error: 'Failed to get trending' });
  }
});

// ========== 工具函数 ==========

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function getDefaultPermissions(type) {
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
}

function sanitizeSpace(space, userId, detailed = false) {
  const role = db.memberships.get(`${space.id}_${userId}`);
  const base = {
    id: space.id,
    name: space.name,
    description: space.description,
    icon: space.icon,
    isPublic: space.isPublic,
    memberCount: space.memberCount,
    features: space.features,
    isJoined: !!role,
    role: role || null,
    encryption: {
      enabled: space.encryption.enabled,
      algorithm: space.encryption.algorithm
    }
  };
  
  if (detailed) {
    base.channels = space.channels
      .map(id => db.channels.get(id))
      .filter(Boolean)
      .map(sanitizeChannel);
  }
  
  return base;
}

function sanitizeChannel(channel) {
  return {
    id: channel.id,
    name: channel.name,
    displayName: channel.displayName,
    type: channel.type,
    topic: channel.topic,
    parentId: channel.parentId,
    permissions: channel.permissions,
    messageCount: channel.messages.length,
    createdAt: channel.createdAt
  };
}

function sanitizeMessage(message) {
  return {
    id: message.id,
    channelId: message.channelId,
    authorId: message.authorId,
    content: message.content,
    replyTo: message.replyTo,
    attachments: message.attachments,
    timestamp: message.timestamp,
    edited: message.edited,
    reactions: message.reactions,
    threadCount: message.threadCount
  };
}

function sanitizeThread(thread) {
  return {
    id: thread.id,
    channelId: thread.channelId,
    parentMessageId: thread.parentMessageId,
    title: thread.title,
    authorId: thread.authorId,
    participantCount: thread.participantCount,
    messageCount: thread.messages.length,
    createdAt: thread.createdAt
  };
}

// WebSocket 广播（需要集成你的 WebSocket 服务器）
function broadcastToChannel(channelId, data) {
  // 集成你的 WebSocket 实现
  // io.to(`channel:${channelId}`).emit(data.type, data.data);
  console.log(`[Broadcast] Channel ${channelId}:`, data.type);
}

module.exports = router;
