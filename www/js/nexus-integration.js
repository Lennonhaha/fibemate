/**
 * FIBEMATE Nexus 社区模块集成
 * 
 * 使用方式：
 * const app = express();
 * // ... 现有路由 ...
 * require('./nexus-integration')(app);
 */

const express = require('express');

module.exports = function integrateNexus(app) {
  
  // Nexus API 路由
  const nexusRouter = express.Router();
  
  // ========== 内存存储（生产环境改用数据库）==========
  const db = {
    spaces: new Map(),
    channels: new Map(),
    threads: new Map(),
    messages: new Map(),
    memberships: new Map(),
    presence: new Map(),
    voiceTokens: new Map()
  };
  
  // ========== 认证中间件（复用现有认证）==========
  function authenticate(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const token = auth.slice(7);
    // TODO: 集成现有 JWT 验证
    req.user = { id: token.slice(0, 16), token };
    next();
  }
  
  // ========== Space API ==========
  
  // 创建空间
  nexusRouter.post('/spaces', authenticate, async (req, res) => {
    try {
      const { name, description, icon, isPublic = false } = req.body;
      const spaceId = 'sp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      
      const space = {
        id: spaceId,
        name,
        description: description || '',
        icon: icon || '🏠',
        ownerId: req.user.id,
        isPublic,
        memberCount: 1,
        channelCount: 0,
        createdAt: new Date().toISOString(),
        features: {
          threads: true,
          voice: true,
          files: true,
          polls: true
        }
      };
      
      db.spaces.set(spaceId, space);
      db.memberships.set(`${spaceId}_${req.user.id}`, { role: 'owner', joinedAt: new Date().toISOString() });
      
      res.status(201).json({ success: true, space });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // 获取空间列表
  nexusRouter.get('/spaces', authenticate, async (req, res) => {
    try {
      const userSpaces = [];
      for (const [key, membership] of db.memberships) {
        if (key.endsWith(`_${req.user.id}`)) {
          const spaceId = key.split('_')[0];
          const space = db.spaces.get(spaceId);
          if (space) {
            userSpaces.push({ ...space, myRole: membership.role });
          }
        }
      }
      res.json({ success: true, spaces: userSpaces });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // 获取公开空间
  nexusRouter.get('/spaces/discover', async (req, res) => {
    try {
      const publicSpaces = Array.from(db.spaces.values())
        .filter(s => s.isPublic)
        .map(s => ({
          id: s.id,
          name: s.name,
          description: s.description,
          icon: s.icon,
          memberCount: s.memberCount,
          channelCount: s.channelCount
        }));
      res.json({ success: true, spaces: publicSpaces });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // 获取空间详情
  nexusRouter.get('/spaces/:spaceId', authenticate, async (req, res) => {
    try {
      const space = db.spaces.get(req.params.spaceId);
      if (!space) return res.status(404).json({ error: 'Space not found' });
      
      const membership = db.memberships.get(`${req.params.spaceId}_${req.user.id}`);
      if (!membership && !space.isPublic) {
        return res.status(403).json({ error: 'Not a member' });
      }
      
      // 获取频道列表
      const channels = Array.from(db.channels.values())
        .filter(c => c.spaceId === req.params.spaceId)
        .sort((a, b) => a.position - b.position);
      
      res.json({ success: true, space: { ...space, channels, myRole: membership?.role || 'guest' } });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // ========== Channel API ==========
  
  // 创建频道
  nexusRouter.post('/spaces/:spaceId/channels', authenticate, async (req, res) => {
    try {
      const { name, type = 'text', topic = '' } = req.body;
      const channelId = 'ch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      
      const channel = {
        id: channelId,
        spaceId: req.params.spaceId,
        name,
        type, // text, voice, announcement
        topic,
        position: db.channels.size,
        messageCount: 0,
        createdAt: new Date().toISOString()
      };
      
      db.channels.set(channelId, channel);
      
      // 更新空间频道数
      const space = db.spaces.get(req.params.spaceId);
      if (space) space.channelCount++;
      
      res.status(201).json({ success: true, channel });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // 获取频道消息
  nexusRouter.get('/channels/:channelId/messages', authenticate, async (req, res) => {
    try {
      const messages = Array.from(db.messages.values())
        .filter(m => m.channelId === req.params.channelId)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        .slice(-50); // 最近50条
      
      res.json({ success: true, messages });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // 发送消息
  nexusRouter.post('/channels/:channelId/messages', authenticate, async (req, res) => {
    try {
      const { content, type = 'text', replyTo = null } = req.body;
      const messageId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      
      const message = {
        id: messageId,
        channelId: req.params.channelId,
        authorId: req.user.id,
        content,
        type,
        replyTo,
        createdAt: new Date().toISOString(),
        editedAt: null,
        reactions: {},
        threadCount: 0
      };
      
      db.messages.set(messageId, message);
      
      res.status(201).json({ success: true, message });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // ========== Thread API ==========
  
  // 创建线程
  nexusRouter.post('/messages/:messageId/threads', authenticate, async (req, res) => {
    try {
      const { title } = req.body;
      const threadId = 'th_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      
      const thread = {
        id: threadId,
        messageId: req.params.messageId,
        channelId: req.body.channelId,
        title: title || 'Thread',
        authorId: req.user.id,
        messageCount: 0,
        createdAt: new Date().toISOString()
      };
      
      db.threads.set(threadId, thread);
      
      // 更新原消息的线程数
      const parentMsg = db.messages.get(req.params.messageId);
      if (parentMsg) parentMsg.threadCount++;
      
      res.status(201).json({ success: true, thread });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // ========== Member API ==========
  
  // 加入空间
  nexusRouter.post('/spaces/:spaceId/join', authenticate, async (req, res) => {
    try {
      const space = db.spaces.get(req.params.spaceId);
      if (!space) return res.status(404).json({ error: 'Space not found' });
      if (!space.isPublic) return res.status(403).json({ error: 'Space is private' });
      
      const membershipKey = `${req.params.spaceId}_${req.user.id}`;
      if (db.memberships.has(membershipKey)) {
        return res.status(400).json({ error: 'Already a member' });
      }
      
      db.memberships.set(membershipKey, { role: 'member', joinedAt: new Date().toISOString() });
      space.memberCount++;
      
      res.json({ success: true, message: 'Joined successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // 获取成员列表
  nexusRouter.get('/spaces/:spaceId/members', authenticate, async (req, res) => {
    try {
      const members = [];
      for (const [key, membership] of db.memberships) {
        if (key.startsWith(req.params.spaceId + '_')) {
          const userId = key.split('_')[1];
          members.push({ userId, role: membership.role, joinedAt: membership.joinedAt });
        }
      }
      res.json({ success: true, members });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // ========== Voice API ==========
  
  // 获取语音令牌
  nexusRouter.post('/channels/:channelId/voice-token', authenticate, async (req, res) => {
    try {
      const token = 'voice_' + Date.now() + '_' + Math.random().toString(36).substr(2, 16);
      
      db.voiceTokens.set(token, {
        channelId: req.params.channelId,
        userId: req.user.id,
        createdAt: new Date().toISOString(),
        expiresAt: Date.now() + 3600000 // 1小时过期
      });
      
      res.json({ success: true, token, expiresIn: 3600 });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // ========== 挂载路由 ==========
  app.use('/api/nexus', nexusRouter);
  
  console.log('[Nexus] Community API integrated at /api/nexus');
  console.log('[Nexus] Available endpoints:');
  console.log('  POST /api/nexus/spaces - Create space');
  console.log('  GET  /api/nexus/spaces - List my spaces');
  console.log('  GET  /api/nexus/spaces/discover - Discover public spaces');
  console.log('  GET  /api/nexus/spaces/:id - Get space details');
  console.log('  POST /api/nexus/spaces/:id/channels - Create channel');
  console.log('  GET  /api/nexus/channels/:id/messages - Get messages');
  console.log('  POST /api/nexus/channels/:id/messages - Send message');
  console.log('  POST /api/nexus/spaces/:id/join - Join space');
  console.log('  POST /api/nexus/channels/:id/voice-token - Get voice token');
  
  return { db, nexusRouter };
};
