# 双棘轮 PQ 混合设计：用 ML-KEM-768 加固 Signal 协议

> FIBEMATE 深度系列 #1 · 2026-08-31

---

## 一、问题：Signal 双棘轮为什么不抗量子？

Signal 协议的安全根基是椭圆曲线 Diffie-Hellman（ECDH）。每条消息生成一个新的 DH 密钥对，确保前向安全和后向安全。

但 Shor 算法能破解 ECDH。量子计算机出现后，所有基于 ECDH 的会话密钥都能被恢复。

**直观理解**：Signal 的"每消息新密钥"在经典攻击者面前是安全的（离散对数困难）。但在量子攻击者面前，P-256 ECDH 就像一层纸——1200 个逻辑量子比特就能戳穿。

---

## 二、设计目标：加固，不重写

FIBEMATE 的目标不是从零发明一个新协议。而是在不改变消息格式（保持 65 字节 P-256 header）、不改变已有 DH 棘轮逻辑的前提下，**用 ML-KEM-768 为初始握手和周期性密钥刷新添加量子抗性层**。

```
设计原则：
  ① ML-KEM 仅用于根密钥派生，不参与每消息棘轮
  ② 消息 header 保持纯 P-256 (65B)，兼容旧客户端
  ③ ML-KEM 每 100 条消息刷新一次（KEM re-key）
  ④ 如果 ML-KEM 模块不可用，优雅降级为纯 P-256
```

---

## 三、协议分层视图

```
┌──────────────────────────────────────────────┐
│  应用消息                                     │
│  每消息: P-256 DH 棘轮 (65B header)           │  ← 不变
├──────────────────────────────────────────────┤
│  根密钥刷新层 (每 100 条消息)                   │
│  ML-KEM-768 encaps/decaps → 新 rootKey        │  ← 新增
├──────────────────────────────────────────────┤
│  初始握手: Hybrid X3DH                        │
│  ML-KEM-768 ss ⊕ P-256 ECDH ss → rootKey     │  ← 替换纯 P-256 X3DH
│  ──→ HKDF-SHA256                               │
└──────────────────────────────────────────────┘
```

**核心思想**：量子安全只在密钥派生层（根密钥建立和刷新），消息传输层不变。这样 P-256 的每消息前向安全（经典安全）不受影响，而根密钥的量子安全由 ML-KEM-768 提供。

---

## 四、Hybrid X3DH：双密钥协商

### 4.1 发起方（Alice）

```javascript
// 第 1 步：ML-KEM 封装到 Bob 的公钥
const { ciphertext: kemCt, sharedSecret: pqSS } = encapsulate(bobMLKEMPub);
// kemCt: 1088 字节  |  pqSS: 32 字节

// 第 2 步：P-256 ECDH（Alice 临时密钥 × Bob 签名预密钥）
const ekPair = await DoubleRatchet.generateDH();
const ekPub = await DoubleRatchet.exportPublicKey(ekPair);
const ecSS = await DoubleRatchet.dh(ekPair.privateKey, bobSPK);
// ecSS: 32 字节

// 第 3 步：HKDF 混合两个共享密钥
const combined = Buffer.concat([pqSS, ecSS]);  // 64 字节
const rootKey = hkdfSync(combined, zeros, 'FIBEMateHybridX3DH');
// rootKey: 32 字节 → 交给 P-256 双棘轮
```

### 4.2 接收方（Bob）

```javascript
// 第 1 步：ML-KEM 解封装
const pqSS = decapsulate(kemCt, myMLKEMSecret);  // 自己的 ML-KEM 私钥解出共享密钥

// 第 2 步：P-256 ECDH（自己的 SPK 私钥 × Alice 的临时公钥）
const aliceEK = await DoubleRatchet.importPublicKey(aliceEKPub);
const ecSS = await DoubleRatchet.dh(mySPKPair.privateKey, aliceEK);

// 第 3 步：同样 HKDF 混合
const rootKey = hkdfSync(Buffer.concat([pqSS, ecSS]), zeros, 'FIBEMateHybridX3DH');
```

### 4.3 为什么要混合两个共享密钥？

| 威胁模型 | 纯 P-256 | 纯 ML-KEM | 混合 |
|:---|:---|:---|:---|
| 经典攻击者 | ✅ P-256 安全 | ✅ ML-KEM 安全 | ✅✅ 双重安全 |
| 量子攻击者 | ❌ Shor 破解 ECDH | ✅ 格密码安全 | ✅ 由 ML-KEM 保护 |
| ML-KEM 代数突破 | ✅ P-256 仍安全 | ❌ 完全崩溃 | ✅ 由 P-256 保护 |

**这就是混合密码学的价值**：把两种不同数学假设的密码系统组合起来。只要其中一个安全，根密钥就安全。

---

## 五、为什么棘轮层只用 P-256？

```
问题：为什么不用 ML-KEM 替换每消息棘轮？

答案：因为 ML-KEM 的 ciphertext 是 1088 字节，而 P-256 公钥只有 65 字节。

  每条消息多 1088 字节：
    - 文字消息几乎全是 header（浪费）
    - 1000 条消息 = 额外 1 MB（移动端不可接受）
    - 违反"不改变消息格式"的设计约束
```

而且每消息 P-256 棘轮提供的是**经典前向安全**。量子攻击者即使能破解 ECDH，也需要逐条消息解密——而 ML-KEM 在握手层提供的保护已经让攻击者无法获得初始根密钥。配合每 100 条消息的 ML-KEM re-key，即使某个根密钥被量子破解，影响范围也最多 100 条消息。

---

## 六、周期性 Re-Key：防御量子"存储-后破解"

量子计算机可能还要 10-20 年才出现。但攻击者现在就可以**录制所有加密流量，等量子计算机出现后离线破解**。

ML-KEM re-key 的防御策略：

```
100 条消息后：
  Alice: generatePQKeypair() → { newPk, newSk }
         发送 newPk 给 Bob
  Bob:   encapsulate(newPk) → { ct, newSS }
         发送 ct 回 Alice
  Alice: decapsulate(ct, newSk) → newSS
  Bob:   decapsulate(ct, ?) → ...

  双方: newRootKey = HKDF(currentRootKey ‖ newSS)
```

攻击者即使未来用量子计算机破解了前 100 条消息的根密钥，也无法解密第 101 条——因为 ML-KEM 已经在第 100 条时重新协商了新的根密钥。

---

## 七、435 行实现的真实挑战

### 7.1 API 适配：`decapsulate(sk, ct)` 不是 `decapsulate(ct, sk)`

这是整个实现中最隐蔽的 bug。API 文档写的是 `decapsulate(sk, ct)`，但在包装器里参数顺序被反转了一次，测试又反转了一次——结果测试通过了，实际调用失败了。

```
错误调用链:
  应用层: decapsulate(ct, sk)     ← 看起来合理
  包装器: mlkem.decapsulate(ct, sk) ← 悄悄反转
  底层:   C addon 期望 (sk, ct)   ← 实际崩溃

正确调用链:
  应用层: decapsulate(sk, ct)     ← 统一顺序
  包装器: mlkem.decapsulate(sk, ct) ← 不再反转
  底层:   C addon: decapsulate(sk, ct) ← ASSERT OK
```

### 7.2 基类缺失：`.gitignore` 的黑洞

`double-ratchet.js` 被 `.gitignore` 的 `*t.js` 规则匹配——文件名以 `t` 结尾——导致 563 行基类从未入仓。混合握手调用了 `DoubleRatchet.generateDH()`，但这个类根本不存在于仓库中。

修复后 `*t.js` → `**/scripts/*t.js`，基类才得以入仓。

### 7.3 纯 JS HKDF：避免 WebCrypto 异步地狱

双棘轮是同步状态机——每次加解密都会立即修改内部计数器。WebCrypto 的 `importKey()`/`deriveBits()` 都是异步的，会破坏状态一致性。解决方案：直接用 Node.js `crypto.createHmac('sha256')` 实现同步 HKDF：

```javascript
function hkdfSync(ikm, salt, info, length = 32) {
  const prk = crypto.createHmac('sha256', salt).update(ikm).digest();
  const okm = [];
  let t = Buffer.alloc(0);
  for (let i = 1; i <= Math.ceil(length / 32); i++) {
    t = crypto.createHmac('sha256', prk).update(t).update(info).update(Buffer.from([i])).digest();
    okm.push(t);
  }
  return Buffer.concat(okm).slice(0, length);
}
```

---

## 八、验证数据

```
双棘轮 PQ 混合全链路验证 (2026-07-25):
  ① Alice initAsAlice() → rootKey + kemCt + ekPub     ✅
  ② Bob initAsBob(alice.kemCt, alice.ekPub) → rootKey  ✅
  ③ Alice.encrypt("Hello PQ") → ciphertext + header    ✅
  ④ Bob.decrypt(header, ciphertext) → "Hello PQ"      ✅
  ⑤ Bob.encrypt("Hi Alice") → ciphertext              ✅
  ⑥ Alice.decrypt(header, ciphertext) → "Hi Alice"    ✅
  ⑦ 第 100 条触发 re-key → 新 rootKey 建立             ✅
  ⑧ 第 101 条用新 rootKey 加密 → 正常通信              ✅
```

---

## 九、局限与下一步

| 局限 | 说明 | 计划 |
|:---|:---|:---|
| re-key 期间消息可能丢失 | 100 条边界处如果 re-key 未完成，消息会用旧密钥 | 滑动窗口容忍（P1） |
| 无 group ratchet | 仅支持 1:1 | Sender Key + ML-KEM（P2） |
| 依赖 Node.js crypto | 浏览器需要 WebCrypto 异步方案 | 浏览器端口（Q4） |
| P-256 header 对量子攻击者透明 | header 包含明文 DH 公钥 | 不修复——设计约束 |
| 纯 JS ML-KEM 慢 | 107 KEM/s vs Native 10,000+ | C addon 已入仓 |

---

## 十、关键代码

完整实现位于仓库根目录：
- `double-ratchet.js` (563 行) — P-256 双棘轮基类
- `double-ratchet-pq.js` (435 行) — ML-KEM-768 混合层
- `benchmark.cjs` — 性能基准测试

---

*下一篇：#2 FPGA NTT Pipeline — 从行为模型到 UART 物理调试*
