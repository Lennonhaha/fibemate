# 6 个 PQC 可视化上线 + 官网首页接入（2026-08-13 凌晨）

## 目标
用户批准（01:59 破例）把 6 个冻结期原本「仅设计文档」的可视化转为实现并上线官网。

## 完成内容

### 6 个可视化（纯 Canvas 2D / 零 CDN / 零外部依赖）
全部部署到 `https://fibemate.net/viz/`：

| # | 文件 | 内容 | 大小 |
|---|------|------|------|
| 1 | hybrid-kex-comparison.html | 混合 KEX 三轨道对比（SM2 65B / ML-KEM 1184B / 混合 1249B）+ 量子攻击模拟 + HKDF 合并动画 | 15.6KB |
| 2 | ntt-butterfly-flow.html | CT 蝶形 8 层展开，Q=3329（ML-KEM-768，区别于已有 ntt-butterfly.html 的 ML-DSA-65） | 11.6KB |
| 3 | kem-blackbox-3d.html | KeyGen/Encaps/Decaps 三黑盒 2.5D 拆解 | 8.3KB |
| 4 | pqc-migration-tree.html | 迁移决策树（组织类型→国密→混合 KEX→WPI 联动） | 8.9KB |
| 5 | pqc-signature-landscape.html | 10 方案签名对比（散点/雷达/折线三模式） | 14.1KB |
| 6 | protocol-algorithm-family-tree.html | FIBEMATE 四层资产拓扑 + 数据流联动 | 11.2KB |

### 数据准确性关键修正
- 混合 KEX 经典算法 = **SM2 ECDH**（65B，国密合规），非设计文档 01 误写的 ECDH P-256——按 `src/tls-hybrid-extension.js` 实际代码写
- 签名对比用 fml-dsa / vwz-performance 的**实测数据**

### 首页接入
- 6 张卡片插入「工程可视化工具集」栏目（LG 矩阵场卡片之后）
- 计数 29 → 35（meta description + 栏目标题两处同步）
- 备份：`/tmp/index.html.bak-viz`

### nginx
- 新增 `/viz/` location（仿 vwz-tensor，`try_files $uri =404` + 独立 CSP）
- nginx -t 通过，reload 成功

## 验证结果
- 首页 HTTP 200，X-App-Version v3.3.0 (a2552cd7)
- 6 个 viz 页面全部 200
- JS 语法检查 6/6 通过（Node vm.Script 直读 UTF-8）

## 关键发现
1. **首页计数历史不一致**：栏目标题写「29 个」但 `docs/viz-index.html` 权威索引写「26 个」——既有的漂移（非本次造成），本次统一 +6 到 35。
2. **`algo-family-tree.html` 与我第 6 个不重复**：已有的是「3D 算法全家族谱系」（行业全景 18 节点），我的是「FIBEMATE 自身四层资产拓扑」（本项目），互补。

## 未完成（待用户决定）
- 6 个文件 + 首页改动 + nginx 配置**尚未 commit 到 git**（服务器工作树在 master 分支，有大量未提交修改，需用户决定是否现在整理提交）
- `docs/viz-index.html` 索引尚未加这 6 个条目（首页「完整索引」链接指向它）

## 纪律
用户 01:59 亲自拍板破例实现可视化（合法破例）。此前助手拒绝「反正没人知道」的偷偷做理由，坚持纪律不是做给外部看的。
