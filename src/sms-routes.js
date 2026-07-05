/**
 * FIBEMATE 短信 API 路由
 * 
 * 端点：
 * POST /api/sms/send       - 发送验证码
 * POST /api/sms/verify     - 验证码校验
 * POST /api/sms/bind-phone - 手机号绑定
 * 
 * 安全特性：
 * - IP 速率限制（1 分钟最多 5 次请求）
 * - 手机号发送间隔限制（60 秒）
 * - 验证码暴力破解保护（5 次错误后锁定）
 * - 临时 token 双重验证（防 CSRF）
 */

const express = require('express');
const jwt = require('jsonwebtoken');

module.exports = function(jwtSecret, db) {
  if (!jwtSecret) throw new Error('[SMS] jwtSecret is required');
  
  const router = express.Router();
  const { sendVerificationCode, verifyCode } = require('./sms-service');

  // ========================
  // 速率限制（简单实现）
  // ========================

  const ipRateLimit = new Map();
  const IP_RATE_LIMIT = {
    windowMs: 60000,
    maxRequests: 5,
  };

  function ipRateLimitMiddleware(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    if (!ipRateLimit.has(ip)) {
      ipRateLimit.set(ip, { count: 1, windowStart: now });
      return next();
    }
    
    const record = ipRateLimit.get(ip);
    
    if (now - record.windowStart > IP_RATE_LIMIT.windowMs) {
      record.count = 1;
      record.windowStart = now;
      return next();
    }
    
    record.count++;
    if (record.count > IP_RATE_LIMIT.maxRequests) {
      return res.status(429).json({ error: '请求太频繁，请稍后再试' });
    }
    
    next();
  }

  setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of ipRateLimit) {
      if (now - record.windowStart > IP_RATE_LIMIT.windowMs * 2) {
        ipRateLimit.delete(ip);
      }
    }
  }, 120000);

  // ========================
  // POST /api/sms/send
  // ========================

  router.post('/send', ipRateLimitMiddleware, async (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone) return res.status(400).json({ error: '手机号不能为空' });
      
      const result = await sendVerificationCode(phone);
      return result.success
        ? res.json({ message: result.message })
        : res.status(429).json({ error: result.message });
    } catch (e) {
      console.error('[SMS] /send 异常:', e);
      return res.status(500).json({ error: '服务器内部错误' });
    }
  });

  // ========================
  // POST /api/sms/verify
  // ========================

  router.post('/verify', ipRateLimitMiddleware, (req, res) => {
    try {
      const { phone, code } = req.body;
      if (!phone || !code) return res.status(400).json({ error: '手机号和验证码不能为空' });
      
      const result = verifyCode(phone, code);
      if (result.valid) {
        const tempToken = jwt.sign(
          { phone, purpose: 'phone-bind' },
          jwtSecret,
          { expiresIn: '10m' }
        );
        return res.json({ message: result.message, tempToken });
      }
      return res.status(400).json({ error: result.message });
    } catch (e) {
      console.error('[SMS] /verify 异常:', e);
      return res.status(500).json({ error: '服务器内部错误' });
    }
  });

  // ========================
  // POST /api/sms/bind-phone
  // ========================

  router.post('/bind-phone', async (req, res) => {
    try {
      const { tempToken } = req.body;
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      
      if (!token) return res.status(401).json({ error: '未登录' });
      if (!tempToken) return res.status(400).json({ error: '验证码校验 token 不能为空' });
      
      let userPayload;
      try {
        userPayload = jwt.verify(token, jwtSecret);
      } catch (e) {
        return res.status(401).json({ error: '登录已过期，请重新登录' });
      }
      
      let phonePayload;
      try {
        phonePayload = jwt.verify(tempToken, jwtSecret);
        if (phonePayload.purpose !== 'phone-bind') {
          return res.status(400).json({ error: '无效的验证 token' });
        }
      } catch (e) {
        return res.status(400).json({ error: '验证码已过期，请重新验证' });
      }
      
      // db injected via factory parameter
      const userId = userPayload.userId;
      const user = db.data.users[userId];
      
      if (!user) return res.status(404).json({ error: '用户不存在' });
      
      for (const [id, u] of Object.entries(db.data.users)) {
        if (u.phone === phonePayload.phone && id !== userId) {
          return res.status(409).json({ error: '该手机号已被其他账号绑定' });
        }
      }
      
      user.phone = phonePayload.phone;
      user.phoneVerified = true;
      user.phoneVerifiedAt = Date.now();
      user.updatedAt = Date.now();
      db.save();
      
      console.log(`[SMS] ✓ 手机号绑定成功: ${user.username} → ${phonePayload.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}`);
      return res.json({ message: '手机号绑定成功', phone: phonePayload.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') });
    } catch (e) {
      console.error('[SMS] /bind-phone 异常:', e);
      return res.status(500).json({ error: '服务器内部错误' });
    }
  });

  return router;
};
