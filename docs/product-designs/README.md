# Product Design Index · FIBEMATE v3.3.0

10 份产品设计文档。全部处于**仅设计阶段（含伪代码）**，8/31 前不实现、不编译、不运行。

| # | 文档 | 类型 | 细化状态 | 预计耗时 | 优先级 |
|:---:|------|------|:---:|:---:|:---:|
| 01 | [PQC 迁移评估 CLI](01-pqc-migrate-cli.md) | npm CLI | ✅ 伪代码 | 2-3h | ⭐⭐⭐⭐⭐ |
| 02 | [TSR 证据链验证器](02-tsr-verify-cli.md) | CLI 工具 | ✅ 伪代码 | 1-2h | ⭐⭐⭐⭐⭐ |
| 03 | [可视化设计系统](03-viz-design-system.md) | 设计规范 | ✅ 伪代码 | 持续 | ⭐⭐⭐⭐ |
| 04 | [PQC 迁移文档包](04-pqc-migrate-docs.md) | 文档系统 | ✅ 伪代码 | 3-4h | ⭐⭐⭐⭐ |
| 05 | [KAT 验证包](05-kat-verifier-pkg.md) | npm 包 | ✅ 伪代码 | 2-3h | ⭐⭐⭐⭐ |
| 06 | [VS Code 插件](06-vscode-pqc-lens.md) | VS Code Ext | ✅ 伪代码 | 5-8h | ⭐⭐⭐ |
| 07 | [CTF 挑战平台](07-pqc-ctf.md) | Web 应用 | ✅ 伪代码 | 4-6h | ⭐⭐⭐ |
| 08 | [Docker 镜像](08-pqc-docker.md) | Docker ×3 | ✅ 伪代码 | 3-4h | ⭐⭐⭐⭐ |
| 09 | [Electron 桌面应用](09-pqc-desktop.md) | Electron App | ✅ 伪代码 | 4-6h | ⭐⭐⭐ |
| 10 | [NTT 性能基准](10-ntt-benchmark.md) | CLI + Web | ✅ 伪代码 | 3-4h | ⭐⭐⭐⭐ |
| 11 | [PQC 部署验证与主动探测](11-pqc-deployment-verification.md) | CLI + API + 存证 | 📄 设计 | 4-6h+ | ⭐⭐⭐⭐ |

**细化完成**：01–10 份均已完成伪代码级别的实现细节补充；11 份为纯设计文档（基于已有 `pqc-detector.js` 扩展）。

**四方向覆盖**：
- 🧩 开发工具：01-pqc-migrate / 05-kat-verifier / 06-vscode
- 🛡️ 安全工具：02-tsr-verify / 08-docker
- 🎓 培训工具：07-ctf / 09-desktop
- 🔬 研究工具：03-design-system / 04-docs / 10-ntt-bench

**8/31 首发建议**：01-pqc-migrate + 02-tsr-verify + 05-kat-verifier（三个工具，共约 5-6 小时开发）。
