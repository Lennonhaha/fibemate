#!/usr/bin/env node
/**
 * EXPERIMENTAL — 仿真非生产
 * 此模块为 Mixnet 实验性代码，未经生产审计
 * 请勿用于关键路径或主网
 */


// SPDX-License-Identifier: GPL-3.0-only

const express = require('express');
const crypto = require('crypto');
const { execSync } = require('child_process');

const app = express();
app.use(express.json());

// 解析命令行参数
const args = require('minimist')(process.argv.slice(2));
const PORT = parseInt(args.port) || 8001;
const PEERS = (args.peers || '').split(',').filter(p => p);

// 每个节点维护一个延迟队列（模拟混合网络延迟混淆）
const delayQueue = new Map();
let requestCount = 0;
let messageLog = [];

// Sphinx 包格式简化实现（实际应为洋葱加密）
class SphinxPacket {
  constructor(payload, nextHop, routingInfo) {
    this.payload = payload;
    this.nextHop = nextHop;
    this.routingInfo = routingInfo;
    this.nonce = crypto.randomBytes(16).toString('hex');
    this.timestamp = Date.now();
  }

  // 模拟洋葱解密（实际应逐层解密）
  static process(encryptedPacket, nodeId) {
    // 简化版：检查是否是最后一跳
    if (encryptedPacket.nextHop === 'destination') {
      return {
        isFinal: true,
        message: encryptedPacket.payload,
        nonce: encryptedPacket.nonce
      };
    }

    return {
      isFinal: false,
      nextHop: encryptedPacket.nextHop,
      packet: encryptedPacket,
      nodeId: nodeId
    };
  }
}

// 模拟混合网络：随机延迟 50-200ms
function mixDelay(handler) {
  const delay = Math.random() * 150 + 50;
  setTimeout(handler, delay);
}

// 接收 Sphinx 包
app.post('/relay', (req, res) => {
  requestCount++;
  const packet = req.body;
  
  console.log(`[Node ${PORT}] Received packet #${requestCount} (nonce: ${packet.nonce || 'N/A'})`);

  // 记录消息
  messageLog.push({
    timestamp: Date.now(),
    packet: packet.nonce,
    source: req.ip
  });

  mixDelay(() => {
    const result = SphinxPacket.process(packet, PORT);

    if (result.isFinal) {
      console.log(`[Node ${PORT}] Final destination reached`);
      console.log(`[Node ${PORT}] Message: ${JSON.stringify(result.message)}`);
      
      // 模拟最终投递
      res.json({ 
        status: 'delivered', 
        message: result.message,
        hops: result.nonce,
        timestamp: new Date().toISOString()
      });
    } else {
      // 转发到下一跳
      forwardToNextHop(result.nextHop, result.packet, res);
    }
  });
});

async function forwardToNextHop(nextHop, packet, originalRes) {
  console.log(`[Node ${PORT}] Forwarding to ${nextHop}`);

  try {
    const [host, port] = nextHop.split(':');
    const response = await fetch(`http://${nextHop}/relay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(packet)
    });

    const data = await response.json();
    originalRes.json({ 
      status: 'forwarded', 
      trace: data,
      forwardedBy: PORT,
      nextHop: nextHop
    });
  } catch (error) {
    console.error(`[Node ${PORT}] Forwarding failed: ${error.message}`);
    originalRes.status(500).json({ 
      status: 'error', 
      error: error.message,
      node: PORT 
    });
  }
}

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    node: PORT,
    nodeId: process.env.NODE_ID || 'unknown',
    requests: requestCount,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// 节点统计
app.get('/stats', (req, res) => {
  res.json({
    node_id: PORT,
    total_requests: requestCount,
    peers: PEERS,
    delay_queue_size: delayQueue.size,
    memory_usage: process.memoryUsage(),
    message_log: messageLog.slice(-10) // 最近 10 条
  });
});

// 创建 Sphinx 包（测试用）
app.post('/create-packet', (req, res) => {
  const { message, destination } = req.body;
  
  const packet = new SphinxPacket(
    message || 'default message',
    destination || 'destination',
    crypto.randomBytes(32).toString('hex')
  );

  res.json({
    status: 'created',
    packet: {
      payload: packet.payload,
      nextHop: packet.nextHop,
      nonce: packet.nonce,
      timestamp: packet.timestamp
    }
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`Mix node ${process.env.NODE_ID || '?'} running on port ${PORT}`);
  console.log(`Peers: ${PEERS.join(', ') || 'none'}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

// 优雅退出
process.on('SIGTERM', () => {
  console.log(`[Node ${PORT}] Received SIGTERM, shutting down...`);
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log(`[Node ${PORT}] Received SIGINT, shutting down...`);
  process.exit(0);
});
