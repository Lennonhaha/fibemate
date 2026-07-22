// SPDX-License-Identifier: GPL-3.0-only
/**
 * EXPERIMENTAL — 仿真非生产
 * 此模块为 Mixnet 实验性代码，未经生产审计
 * 请勿用于关键路径或主网
 */


const express = require('express');
const app = express();
const PORT = 9002;

app.use(express.json());

// 健康检查
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    node: 'middle',
    timestamp: Date.now() 
  });
});

// 接收来自入口节点的 Sphinx 包
app.post('/sphinx', (req, res) => {
  const { ciphertext } = req.body;
  
  console.log(`[MIDDLE] Received Sphinx packet, forwarding to exit`);
  
  // 模拟 Sphinx 混合：再解密一层，转发到出口节点
  setTimeout(() => {
    // 转发到出口节点
    forwardToExit(req.body);
  }, Math.random() * 100 + 50); // 50-150ms 延迟
  
  res.json({ status: 'forwarded', node: 'middle' });
});

// 转发到出口节点
async function forwardToExit(packet) {
  try {
    const response = await fetch('http://localhost:9003/sphinx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(packet)
    });
    console.log(`[MIDDLE] Forwarded to exit, status: ${response.status}`);
  } catch (error) {
    console.error(`[MIDDLE] Forward error:`, error.message);
  }
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Mixnet Middle Node running on port ${PORT}`);
});
