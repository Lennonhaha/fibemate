# PQ-CTF — PQC 攻防挑战赛平台 设计文档

**类型**：Web 应用（单页）
**状态**：设计阶段
**优先级**：⭐⭐⭐

---

## 1. 产品定位

在线 CTF 平台，所有挑战围绕后量子密码学。不是"做题网站"的又一个克隆——而是利用 FIBEMATE 独有的实验资产（VWZ 签名挑战 + LookingGlass 混淆引擎）构建其他地方找不到的题目。

---

## 2. 赛题设计

### L1 — 热身（难度 ★☆☆☆）

| 题号 | 题目 | 考察点 |
|:---:|------|------|
| 1 | ML-KEM-768: 找出错误的 NTT zeta 表 | NTT 参数理解 |
| 2 | SM2 签名验签区别 | ECDSA 流程 |
| 3 | AES-128 vs AES-256: 量子安全差距 | Grover 算法直觉 |
| 4 | 识别哪个公钥是 ML-DSA | 格式识别 |

### L2 — 实战（难度 ★★☆☆）

| 题号 | 题目 | 考察点 |
|:---:|------|------|
| 5 | SLH-DSA 签名大小对比 | 哈希签名 trade-off |
| 6 | NTT 蝶形运算手工追踪 | NTT 算法理解 |
| 7 | CBOM 依赖链分析 | 供应链安全 |
| 8 | 识别 TVLA 泄漏点 | 侧信道入门 |

### L3 — VWZ 签名挑战（难度 ★★★☆）

利用 `vwz-challenge/` 目录的已有资产：

| 题号 | 题目 | 考察点 |
|:---:|------|------|
| 9 | VWZ k=4: 伪造签名（已知公钥） | VMQ-SPARSE 困难性问题 |
| 10 | VWZ k=8: 从公钥恢复 λ 集合 | Vandermonde 结构分析 |
| 11 | VWZ k=12: 批量验证优化 | 张量运算并行化 |

### L4 — LookingGlass 逆向（难度 ★★★★）

利用 `experimental/vwz-lg/attack/` 套件：

| 题号 | 题目 | 考察点 |
|:---:|------|------|
| 12 | LG v2.2: 破解单层 Kronecker 混淆 | 有限群表示 |
| 13 | LG v2.2: 从 WASM 提取矩阵 M | WASM 逆向 |
| 14 | LG v2.2: 绕过看门狗约束层 | 可逆性检测绕过 |

---

## 3. 平台技术栈

- 纯静态 HTML（单文件）：`pqctf.html`
- 答案验证：嵌入题目哈希 → 用户输入 → 本地比较
- 进度保存：localStorage
- 完成动画：Canvas 粒子效果

---

## 4. 复用资产

| FIBEMATE 资产 | 平台中的角色 |
|---------------|-------------|
| `www/docs/pqc-dashboard-data.json` | L1/L2 题目数据源 |
| `vwz-challenge/` | L3 题目（已有） |
| `experimental/vwz-lg/attack/` | L4 题目（攻击工具） |
| 29 个可视化页面 | 每题附"去学习"链接 |

---

## 5. 庆祝动画（完成全部 14 题后）

```
       ✨
    ⭐   ⭐
  ⭐  🏆  ⭐   "你已掌握后量子密码学核心概念"
    ⭐   ⭐
       ✨
```

---

## 6. 实现细节（伪代码）

### 6.1 核心数据模型

```js
// 题目定义
const CHALLENGES = [
  {
    id: 1,
    title: 'ML-KEM-768: 找出错误的 NTT zeta 表',
    difficulty: 1,  // ★☆☆☆
    category: 'kem',
    description: '下面是一张 zeta 表，其中有一个值被故意改错。找到它。',
    data: {
      zetaTable: [/* 128 个值，其中 1 个错误 */],
      hint: '比较 NIST FIPS 203 附录中的 zeta 表',
    },
    // 验证函数：用户提交答案后调用
    validator(userAnswer) {
      return userAnswer === 57;  // 第 57 个 zeta 值被篡改
    },
    // 成功后展示的知识卡片
    reward: {
      text: 'NTT 的 zeta 表是 2 的幂次单位根。FIPS 203 中 zeta[0]=1, zeta[1]=1729, ...',
      link: '/docs/pqc-dashboard.html',
    },
  },
  // ... 其余 13 题
];

// 用户进度（localStorage）
const USER_STATE = {
  solved: [1, 2, 5],       // 已解决的题目 ID
  attempts: { 3: 4, 6: 2 }, // 每题的尝试次数
  hintsUsed: [3],           // 使用过提示的题目
  score: 350,               // 积分
  startedAt: '2026-08-12T...',
};
```

### 6.2 答案验证流程

```js
function submitAnswer(challengeId, userAnswer) {
  const challenge = CHALLENGES.find(c => c.id === challengeId);
  if (!challenge) return { ok: false, error: 'Challenge not found' };

  const start = Date.now();
  const passed = challenge.validator(userAnswer);
  const elapsed = Date.now() - start;

  // 更新 localStorage
  const state = loadState();
  state.attempts[challengeId] = (state.attempts[challengeId] || 0) + 1;

  if (passed) {
    state.solved.push(challengeId);
    state.score += challenge.difficulty * 100;
    saveState(state);

    return {
      ok: true,
      reward: challenge.reward,
      newScore: state.score,
      celebration: challenge.difficulty >= 4,  // L4 题触发庆祝动画
    };
  } else {
    saveState(state);
    // 第 3 次失败后自动解锁提示
    return {
      ok: false,
      hint: state.attempts[challengeId] >= 3 ? challenge.data.hint : null,
      remainingAttempts: Math.max(0, 3 - state.attempts[challengeId]),
    };
  }
}
```

### 6.3 页面结构

```html
<!-- pqctf.html 单文件结构 -->
<body>
  <div id="header">
    <h1>🏴‍☠️ PQC CTF</h1>
    <span id="score">Score: 350</span>
    <span id="progress">2/14 solved</span>
  </div>

  <div id="challenge-list">
    <!-- 动态渲染 14 题卡片 -->
  </div>

  <div id="challenge-detail" class="hidden">
    <h2 id="detail-title"></h2>
    <div id="detail-body"></div>
    <input id="answer-input" placeholder="输入你的答案...">
    <button onclick="submitCurrent()">提交</button>
    <div id="result"></div>
  </div>

  <canvas id="celebrate" style="display:none"></canvas>
</body>
```

### 6.4 庆祝动画（Canvas 粒子）

```js
function celebrate() {
  const canvas = document.getElementById('celebrate');
  canvas.style.display = 'block';
  const ctx = canvas.getContext('2d');

  const particles = Array.from({ length: 100 }, () => ({
    x: Math.random() * canvas.width,
    y: -10 - Math.random() * 100,
    vx: (Math.random() - .5) * 4,
    vy: Math.random() * 3 + 1,
    color: ['#10b981','#f59e0b','#ef4444','#06b6d4','#8b5cf6'][Math.floor(Math.random()*5)],
    size: Math.random() * 6 + 2,
  }));

  const trophy = { x: canvas.width/2, y: -80, vy: 2, text: '🏆 你已掌握后量子密码学核心概念' };

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const p of particles) {
      p.x += p.vx; p.y += p.vy;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
    }

    // 奖杯下降动画
    if (trophy.y < canvas.height/2 - 40) {
      trophy.y += trophy.vy;
      ctx.font = '48px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('🏆', trophy.x - 60, trophy.y);
      ctx.font = '18px system-ui';
      ctx.fillStyle = '#10b981';
      ctx.fillText(trophy.text, canvas.width/2, trophy.y + 60);
    }

    if (particles.some(p => p.y < canvas.height + 20)) {
      requestAnimationFrame(animate);
    } else {
      // 动画结束，隐藏 canvas
      setTimeout(() => canvas.style.display = 'none', 2000);
    }
  }
  animate();
}
```

---

*冻结期状态：仅设计文档。伪代码不编译、不运行。8/31 后开发。*
