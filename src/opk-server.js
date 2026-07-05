/**
 * FIBEMATE OPK Server — One-Time Pre-Key 服务端
 * ==============================================
 * 职责:
 * 1. POST /api/keys/opk/upload     — 上传 OPK 公钥批次
 * 2. GET  /api/keys/opk/count      — 查询可用 OPK 数量
 * 3. POST /api/keys/opk/consume    — 消耗一个 OPK（返回 peer 的公钥）
 *
 * X3DH 协议: 每个 OPK 一次性使用，消耗后标记 used 不可复用
 * 存储: SQLite one_time_prekeys 表 + 内存缓存
 */

// 内存缓存 { userId → [{keyId, publicKey, status, createdAt}] }
const opkCache = {};

function init(expressApp, db, authMiddleware) {
  const router = require('express').Router();
  // All OPK routes require authentication
  router.use(authMiddleware);

  // ============================================================
  // POST /upload — 上传 OPK 公钥批次
  // ============================================================
  router.post('/upload', (req, res) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ error: '未认证' });

      const { oneTimePreKeys } = req.body;
      if (!Array.isArray(oneTimePreKeys) || oneTimePreKeys.length === 0) {
        return res.status(400).json({ error: '需要 oneTimePreKeys 数组' });
      }

      // 验证格式
      for (const k of oneTimePreKeys) {
        if (!k.keyId || !k.publicKey || k.keyId.length < 4 || k.publicKey.length < 32) {
          return res.status(400).json({ error: `格式错误: keyId=${k.keyId}` });
        }
      }

      // 写入内存缓存
      if (!opkCache[userId]) opkCache[userId] = [];
      const now = Date.now();
      for (const k of oneTimePreKeys) {
        opkCache[userId].push({
          keyId: k.keyId,
          publicKey: k.publicKey,
          status: 'available',
          createdAt: now
        });
      }

      // 写入 SQLite（异步持久化，不阻塞响应）
      try {
        const insert = db._db.prepare(`
          INSERT OR IGNORE INTO one_time_prekeys (id, userId, keyId,
            publicKey, status, created_at)
          VALUES (?, ?, ?, ?, 'available', ?)
        `);
        const batchInsert = db._db.transaction((entries) => {
          for (const k of entries) {
            const id = `${userId}_${k.keyId}`;
            insert.run(id, userId, k.keyId, k.publicKey, now);
          }
        });
        batchInsert(oneTimePreKeys);
      } catch (e) {
        console.warn('[OPK-Server] SQLite 写入失败 (非致命):', e.message);
      }

      const available = opkCache[userId].filter(k => k.status === 'available').length;
      console.log(`[OPK-Server] ${userId}: 上传 ${oneTimePreKeys.length} 个 OPK, 池总量 ${available}`);
      res.json({ success: true, uploaded: oneTimePreKeys.length, available });
    } catch (e) {
      console.error('[OPK-Server] upload error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // GET /count — 查询可用 OPK 数量
  // ============================================================
  router.get('/count', (req, res) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ error: '未认证' });

      const cache = opkCache[userId] || [];
      const available = cache.filter(k => k.status === 'available').length;

      res.json({ available, needsRefill: available < 20 });
    } catch (e) {
      console.error('[OPK-Server] count error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // POST /consume — 消耗一个 OPK (返回 peer 公钥)
  // ============================================================
  // 调用: { peerUserId: "xxx" }
  // 返回: { keyId, publicKey } 或 { error: 'pool_empty' }
  // ============================================================
  router.post('/consume', (req, res) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ error: '未认证' });

      const { peerUserId } = req.body;
      if (!peerUserId) return res.status(400).json({ error: '需要 peerUserId' });

      // 从 peer 的缓存中取第一个 available OPK
      const cache = opkCache[peerUserId] || [];
      const opk = cache.find(k => k.status === 'available');

      if (!opk) {
        return res.json({ available: false, reason: 'pool_empty' });
      }

      // 标记为 used（一次性）
      opk.status = 'used';
      opk.usedBy = userId;
      opk.usedAt = Date.now();

      // SQLite 持久化
      try {
        db._db.prepare(`
          UPDATE one_time_prekeys SET status = 'used', used_by = ?, used_at = ?
          WHERE id = ?
        `).run(userId, Date.now(), `${peerUserId}_${opk.keyId}`);
      } catch (e) {
        console.warn('[OPK-Server] SQLite consume 写入失败:', e.message);
      }

      const remaining = cache.filter(k => k.status === 'available').length;
      console.log(`[OPK-Server] consume: ${userId} 消耗 ${peerUserId} 的 OPK ${opk.keyId}, 剩余 ${remaining}`);

      res.json({
        available: true,
        keyId: opk.keyId,
        publicKey: opk.publicKey,
        remaining
      });
    } catch (e) {
      console.error('[OPK-Server] consume error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // 从 SQLite 恢复 OPK 缓存 (启动时调用)
  // ============================================================
  try {
    const rows = db._db.prepare(`
      SELECT userId, keyId, publicKey, status, created_at
      FROM one_time_prekeys ORDER BY created_at ASC
    `).all();

    for (const r of rows) {
      if (!opkCache[r.userId]) opkCache[r.userId] = [];
      opkCache[r.userId].push({
        keyId: r.keyId,
        publicKey: r.publicKey,
        status: r.status,
        createdAt: r.created_at
      });
    }

    const total = rows.length;
    const available = rows.filter(r => r.status === 'available').length;
    console.log(`[OPK-Server] 恢复 ${total} 个 OPK (${available} available, ${total - available} used)`);
  } catch (e) {
    console.warn('[OPK-Server] SQLite 恢复失败:', e.message);
  }

  // 注册路由
  expressApp.use('/api/keys/opk', router);
  console.log('[OPK-Server] 路由已注册: /api/keys/opk/{upload,count,consume}');
}

module.exports = { init, opkCache };
