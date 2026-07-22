// SPDX-License-Identifier: GPL-3.0-only
/**
 * EXPERIMENTAL — 仿真非生产
 * 此模块为 Mixnet 实验性代码，未经生产审计
 * 请勿用于关键路径或主网
 */


const express = require('express');
const app = express();
const PORT = 9003;

app.use(express.json());

// 健康检查
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    node: 'exit',
    timestamp: Date.now() 
  });
});

// 接收来自中间节点的 Sphinx 包，解密并发送到最终目的地
app.post('/sphinx', (req, res) => {
  const { ciphertext, originalDestination } = req.body;
  
  console.log(`[EXIT] Received Sphinx packet, decrypting...`);
  
  // 模拟 Sphinx 最终解密
  // 实际实现需要：
  // 1. 移除最后一层 Sphinx 加密
  // 2. 提取原始目的地和消息
  // 3. 转发到原始目的地（如 fibemate.net/api/message）
  
  setTimeout(() => {
    deliverToDestination(ciphertext, originalDestination);
  }, Math.random() * 50 + 25); // 25-75ms 延迟
  
  res.json({ status: 'delivered', node: 'exit' });
});

// 发送到最终目的地
async function deliverToDestination(ciphertext, destination) {
  try {
    // 模拟发送到最终服务器
    console.log(`[EXIT] Delivering to ${destination || 'final server'}...`);
    
    // 实际实现：
    // const response = await fetch(destination, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ ciphertext })
    // });
    
    console.log(`[EXIT] Delivered successfully`);
  } catch (error) {
    console.error(`[EXIT] Delivery error:`, error.message);
  }
}

// 统计接口
app.get('/stats', (req, res) => {
  res.json({
    node: 'exit',
    packetsProcessed: Math.floor(Math.random() * 1000),
    uptime: process.uptime()
  });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Mixnet Exit Node running on port ${PORT}`);
});
