/**
 * EXPERIMENTAL — 仿真非生产
 * 此模块为 Mixnet 实验性代码，未经生产审计
 * 请勿用于关键路径或主网
 */


const express = require('express');
const app = express();
const PORT = 9001;

app.use(express.json());

// 健康检查
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    node: 'entry',
    timestamp: Date.now() 
  });
});

// Sphinx 包接收接口
app.post('/sphinx', (req, res) => {
  const { ciphertext, nextHop } = req.body;
  
  console.log(`[ENTRY] Received Sphinx packet, forwarding to ${nextHop}`);
  
  // 模拟 Sphinx 混合：解密一层，转发到下一跳
  // 实际实现需要真实的 Sphinx 密码学
  setTimeout(() => {
    // 转发到中间节点
    forwardToNext(req.body, 'http://localhost:9002/sphinx');
  }, Math.random() * 100 + 50); // 50-150ms 延迟
  
  res.json({ status: 'forwarded', node: 'entry' });
});

// 转发到下一跳
async function forwardToNext(packet, url) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(packet)
    });
    console.log(`[ENTRY] Forwarded to ${url}, status: ${response.status}`);
  } catch (error) {
    console.error(`[ENTRY] Forward error:`, error.message);
  }
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Mixnet Entry Node running on port ${PORT}`);
});
