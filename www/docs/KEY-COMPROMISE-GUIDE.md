# FIBEMATE 密钥泄露应急指南

> 适用: 代码签名密钥 · TLS 证书私钥 · 服务器 SSH 密钥 · API 密钥 · 实验密钥

## 1. 检测：如何发现密钥泄露

| 检测方式 | 信号 | 响应时间 |
|----------|------|:---:|
| GitHub Secret Scanning | 自动告警（推送后秒级） | 立即 |
| `git log -S"PRIVATE KEY"` | 密钥字符串出现在提交记录 | 周期性扫描 |
| Dependabot alerts | 依赖密钥泄露 CVE | 按 Dependabot 节奏 |
| 文件系统审计 | `find / -name "*.pem" -o -name "*.key" 2>/dev/null` | 手动/定期 |

## 2. 分级与应对

### Level 1 — API 密钥泄露（AccessKey / Token）
**示例**: 阿里云 AccessKey、GitHub Personal Token、NPM Token

**立即**:
1. 登录对应平台 → 禁用/删除泄露的 Key
2. 创建新 Key 并更新所有使用该 Key 的配置
3. 检查泄露期间的 API 调用日志，确认无异常操作

**恢复**:
1. 更新 `/etc/letsencrypt/aliyun.ini`（如涉及阿里云）
2. 更新 CI/CD secrets（GitHub Settings → Secrets）
3. 更新 `~/.npmrc`（如涉及 NPM Token）
4. 如果 Key 出现在 git 历史中：`git filter-branch` 或 `BFG Repo-Cleaner` 清除

### Level 2 — 服务私钥泄露（SSH / TLS）
**示例**: 服务器 SSH 私钥、TLS 证书私钥

**立即**:
1. 生成新密钥对
2. 更新服务器上的密钥文件
3. 如果是 TLS 证书：重新签发证书（certbot renew --force-renewal）
4. 撤销旧证书（如适用）

**恢复**:
1. 检查旧密钥期间的访问日志
2. 如 SSH 密钥泄露：检查 `~/.ssh/authorized_keys`，轮换所有关联密钥
3. 如 TLS 密钥泄露：检查中间人攻击痕迹（证书透明度日志）

### Level 3 — 密码学密钥泄露（签名/加密）
**示例**: SM2 私钥、ML-KEM 密钥、VWZ 签名密钥、双棘轮会话密钥

**立即**:
1. **停止使用旧密钥**。旧密钥签名从现在起无效
2. 生成新密钥对
3. 如果旧密钥用于签名：撤销所有旧签名（如适用）
4. 如果旧密钥用于加密：所有用旧密钥加密的消息应视为已泄露

**恢复**:
1. 更新代码中的默认密钥/测试密钥
2. 如果涉及双棘轮会话：前向安全性意味着仅当前会话受影响
3. 如果密钥在 KAT 向量中使用：重新生成 KAT 并更新测试预期
4. 通知任何依赖该密钥的协作方

### Level 4 — 证书颁发机构密钥泄露（CA）
**不适用**：FIBEMATE 不自建 CA，不存在此风险级别。

## 3. 快速参考：密钥所在位置一览

| 密钥位置 | 类型 | 风险 | 当前状态 |
|----------|------|:---:|:---:|
| `/etc/letsencrypt/live/fibemate.net/` | TLS 私钥 | High | ✅ 受保护 |
| `/etc/letsencrypt/live/fibemate.link/` | TLS 私钥 | High | ✅ 受保护 |
| `~/.ssh/fibemate_final.pem` | SSH 私钥 | High | ✅ 仅本地 |
| `/etc/letsencrypt/aliyun.ini` | AccessKey | Medium | ⚠️ 10 月到期需替换 |
| `~/.gitconfig` (credential) | GitHub Token | Medium | ⚠️ 可能已过期 |
| `D:\FIBEMATE\` | 本地备份 | Medium | ✅ 本地 |
| GitHub Secrets | CI/CD Token | Medium | ✅ 平台管理 |
| 代码中的测试密钥 | SM2/VWZ/ML-KEM | Low | ✅ 仅测试用途 |
| `CITATION.cff` | 无密钥 | N/A | ✅ |

## 4. 预防措施

- [x] `.gitignore` 已排除 `*.pem`、`*.key`、`*.p12`、`*.pfx`
- [x] GitHub Secret Scanning 已启用
- [x] 敏感凭证不入 git 历史
- [x] 测试密钥使用固定种子（`keygen_seeded`），可以公开
- [ ] **待做**：为生产环境密钥建立定期轮换计划
- [ ] **待做**：引入 GitHub Actions secret 自动过期提醒
- [ ] **待做**：异常登录告警（阿里云 RAM 登录通知）

## 5. 历史密钥泄露事件

| 日期 | 事件 | 级别 | 处理 |
|------|------|:---:|------|
| 2026-08-10 | AccessKey 明文出现在助手对话中 | L1 | 立即删除 Key，对话已加密传输 |
| — | 无已知密钥泄露 | — | — |

---

*本文件中不包含实际密钥。更新: 2026-08-12*
