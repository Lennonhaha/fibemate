# FIBEMATE 测试体系总览

> 版本: v3.3 | 最后更新: 2026-07-22

## 测试四层递进流水线

项目采用四层递进式测试体系保障代码安全与稳定性：

| 层级 | 名称 | 触发时机 | 目标 |
|:---|:---|:---|:---|
| **L1** | 本地开发预检查 | `git commit` | 阻断明显缺陷进入仓库 |
| **L2** | PR 合并门禁 | push / pull_request | 自动化强制准入 |
| **L3** | Nightly 夜间全量回归 | 每日 06:00 UTC | 重型测试全覆盖 |
| **L4** | Release 发布准入审计 | 版本 tag | 最终安全核验 |

每层不通过，禁止流入下一层。

---

## L1: 本地开发预检查

### pre-commit hook

```bash
pip install pre-commit && pre-commit install
```

自动执行:
- 文件清理 (行尾空格、换行、大文件拦截)
- 私钥/凭证检测
- ESLint 静态分析
- Rust cargo clippy
- Markdown lint
- 密码冒烟测试 (`test/smoke-crypto.js`)

### 冒烟测试覆盖

- ML-KEM-768: keygen → encaps → decaps 闭环
- SM2: 签名 → 验签 → 篡改拒绝
- 多轮循环无崩溃

---

## L2: PR 合并门禁

### 稳定性

- 全量单元测试套件
- 基础 KAT 验证 (ML-KEM 100 组)
- Node.js 18 / 22 基础运行校验
- 制品构建 (JS 打包、WASM 编译) 无报错

### 基础安全

- 静态检查全部通过
- 简易畸形输入冒烟 fuzz
- 禁止硬编码密钥/token/URL

### 门禁规则

任意一项失败 → PR 禁止合并。密码核心逻辑变更必须追加人工评审。

---

## L3: Nightly 夜间全量回归

### 稳定性测试集

| 测试 | 规模 | 说明 |
|:---|:---|:---|
| 完整 KAT | 10,000 组 | ML-KEM 往返 |
| 长时间压力 | 数万次 KEM | 内存泄漏、偶发失败监控 |
| 跨库互操作 | 双向 10,000 轮 | ML-KEM ↔ noble + liboqs |
| 多环境兼容矩阵 | Linux/Windows/macOS | 多 Node 版本 |

### 安全测试集

| 测试 | 说明 |
|:---|:---|
| **模糊测试** | `byteEncode/byteDecode`、`decapsulate` 入口，截断/超长/全零/随机字节 |
| **ASAN/UBSAN** (C 扩展) | 内存越界、未定义行为检测 |
| **软件 TVLA** | SM2 标量运算侧信道统计 |
| **构建产物扫描** | Feature Flag 隔离验证 |

### 硬件分支 (FPGA)

- 行为仿真回归 (L8/L9 43 项)
- 时序静态分析 (WNS 监控)

---

## L4: Release 发布准入审计

### 稳定性准入

- 完整跨浏览器 Demo 验证 (Chrome/Firefox/Safari)
- 性能基准复测，对比历史基线无退化
- Path C-2 混合 KEX E2E 完整场景

### 安全准入

- Fuzz 汇总: 无高危崩溃
- Feature Flag 人工复核: 生产构建默认关闭实验模块
- 漏洞台账: 全部修复，无遗留
- 依赖扫描: npm audit 无高危

### 产出

完整审计材料清单、制品 sha256 清单、新增 TSR 证据。执行 `scripts/make-audit-package.sh` 打包。

---

## 功能测试

功能测试目标：验证所有模块按照国家标准、项目设计文档实现预期逻辑，在合法输入范围内行为确定、可复现。功能测试不评估抵御外部攻击能力，不能替代安全测试、模糊测试、TVLA 侧信道测试。

### 测试分层

| 层级 | 说明 |
|:---|:---|
| **单元功能测试** | 独立密码原语、序列化、压缩解压缩基础函数 |
| **集成功能测试** | 多个组件联合调用 (混合 KEX 密钥导出链路) |
| **端到端 E2E 测试** | 完整客户端-服务端握手、浏览器 Demo 全链路 |
| **FPGA 硬件功能仿真** | NTT 往返变换、L8/L9 检测响应逻辑 |
| **实验模块功能测试** | VWZ/LookingGlass: 仅验证数学往返正确性 |

### ML-KEM-768 单元用例

**冒烟用例** (pre-commit/PR):
1. 密钥生成校验 pk=1184B, sk=2400B
2. encaps/decaps 往返 ss 一致性
3. 多次封装产出不同密文 (非确定性)

**完整回归** (Nightly):
1. NIST FIPS 203 KAT 向量批量比对
2. 固定种子确定性输出固定二进制
3. 跨密钥解密行为合规 (不崩溃，不抛异常)
4. `compress/decompress`、`byteEncode/byteDecode` 多项式往返无损
5. `sampleNTT` / `cbd2` 输出范围 [0, Q-1]

### SM2/SM3/SM4 单元用例

- SM2: 密钥生成、ECDH 共享密钥一致性、签名验签闭环、篡改拒绝、加解密往返
- SM3: 国密 KAT 向量、分段流式哈希等价、1B/64B/65B/4KB 边界长度
- SM4-αGCM: 加解密往返、篡改密文/AAD 校验失败、零长度明文

### 序列化 & 工具函数

- 大端/小端整数字节往返无损
- HKDF-SHA256 固定输入输出稳定
- 密钥内存擦除函数验证

### 实验组件 (VWZ/LookingGlass)

- VWZ: k=16 签名/验签闭环，篡改消息校验失败
- LookingGlass: 正向→逆向变换零误差恢复，维度严格校验

### 验收规则

1. 合法输入无崩溃、无随机输出波动
2. 输出长度严格匹配标准规范
3. 往返运算结果完全一致
4. 官方标准测试向量逐字节匹配
5. 接收非法密钥/参数时优雅处理，不发生崩溃

---

## 版本兼容测试

### 兼容边界 (写入 RELEASE.md)

- **向后兼容 (强制)**: v3.x 内序列化二进制格式永久冻结；新版本必须能解密旧版本密文
- **向前兼容 (有限容错)**: 旧版本忽略报文尾部未知扩展字段；头部新增强制字段应拒绝
- **破坏性变更**: 仅主版本号跳跃 (v4) 允许；FIPS 203 参数修改/字节编码改动/KDF 盐替换均触发

### 兼容基线管理

仓库维护 `compat-fixtures/` 目录，每个正式 Release 基于固定测试熵生成一组标准密钥、密文、握手报文样本永久归档。

### 测试矩阵

| 方向 | 测试 | 触发时机 |
|:---|:---|:---|
| 向后兼容 | 新版本加载历史版本固定样本，KEM 往返 + 签名验签 | PR 必跑 |
| 向前容错 | 新版本生成携带扩展字段报文，旧版本忽略尾部扩展 | Nightly |
| 跨版本互操作 | v3.2 ↔ v3.3 双向 Path C-2 完整握手 | Release 准入 |

### 门禁规则

任何提交破坏向后兼容性 → 禁止合并至 main。破坏性变更必须提升主版本号，CHANGELOG 显著标记迁移指引。

---

## 测试矩阵 (快照)

| 测试类型 | 规模 | 状态 |
|:---|:---|:---|
| **NTT roundtrip** | 200/200 | ✅ |
| **KEM 自洽** | 10,000/10,000 | ✅ |
| **KAT 验证** | NIST 向量 | ✅ |
| **Noble 交叉验证** | 10,000/10,000 | ✅ |
| **liboqs 交叉验证** | 10,000/10,000 双向 | ✅ |
| **TVLA 侧信道** | N=10,000 SM2 | ✅ |
| **FPGA 行为模型** | 43/43 PASS | ✅ |
| **VWZ 签名** | 148/148 | ✅ |
| **Demo 浏览器验证** | lg-095 TSR 存证 | ✅ |

---

## 运行测试

### 快速自检

```bash
npm test                           # 聚合套件 (test/test-all.js: Keccak + integrity + smoke + ML-KEM CI)
npm run lint                       # ESLint
npm run spdx:check                 # SPDX 头完整性 (tools/add-spdx-headers.cjs)
node test/smoke-crypto.js          # pre-commit 冒烟
```

### ML-KEM 完整验证

```bash
node scripts/kat-10000.js          # KAT 10,000 轮自洽
node scripts/noble-liboqs-xcross.mjs  # liboqs 交叉验证
node scripts/prep-release.js          # 发布准入 5 项检查
```

### 审计打包

```bash
bash scripts/make-audit-package.sh   # 生成审计材料
```

---

## 未覆盖项目

| 项目 | 优先级 | 说明 |
|:---|:---|:---|
| **物理 TVLA (ChipWhisperer)** | P1 | 硬件侧信道 — Q4 2026 |
| **Fuzz 持续运行** | P1 | OSS-Fuzz 7×24 — 8.31 后 |
| **跨平台真机矩阵** | P1 | Windows/Linux/macOS + 多浏览器 |
| **覆盖率 ≥ 95%** | P3 | c8 + nyc 仪表化 |

## 维护节奏

| 频率 | 动作 |
|:---|:---|
| 每次变更 ML-KEM | `kat-10000.js` + `noble-liboqs-xcross.mjs` |
| 每日 | 检查 GitHub Actions CI/Nightly 状态 |
| 每周 | 检查 Dependabot PR |
| 每月 | 更新 TSR 存证 |
| 每季度 | 检查 TVLA 测试环境 + FPGA 行为模型 |

---

> 当前: 无失败测试。所有核心验证通过。TSR 95 份。待外因解锁 (审计、开源、Bus Factor)。
