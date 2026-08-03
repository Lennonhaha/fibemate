# FIBEMATE 灾难恢复计划

**版本**: v1.0
**日期**: 2026-08-02
**状态**: 生效
**分类**: 内部/公开

---

## 1. 执行摘要

本文档定义了 FIBEMATE 项目的灾难恢复流程，确保在发生系统故障、数据丢失或其他灾难性事件时，能够快速恢复关键功能和服务。

### 目标

- **RTO (恢复时间目标)**: 关键服务 < 4 小时，非关键服务 < 24 小时
- **RPO (恢复点目标)**: 数据丢失 < 24 小时（基于每日备份）
- **可用性目标**: 99.5%（年停机时间 < 44 小时）

---

## 2. 系统架构

### 2.1 核心组件

| 组件 | 类型 | 用途 | 优先级 |
|------|------|------|--------|
| **GitHub 仓库** | 代码仓库 | 源代码、文档、CI/CD | P0 |
| **阿里云 ECS** | 服务器 | 官网托管、API 服务 | P0 |
| **nginx** | Web 服务器 | 反向代理、静态文件服务 | P0 |
| **GitHub Actions** | CI/CD | 自动化测试、构建、部署 | P1 |
| **TSR 证据链** | 数据 | 时间戳存证（DigiCert+FreeTSA） | P0 |
| **密钥管理系统** | 安全 | 密钥存储和轮换 | P0 |

### 2.2 数据流

```
开发者 → GitHub → GitHub Actions → 测试/构建
    ↓
GitHub (master/main) ← SSH pull ← 阿里云 ECS (nginx)
    ↓
用户 → HTTPS → nginx → 静态文件/HTML/JS
```

### 2.3 依赖关系

```
官网可用性
  ├─ GitHub 仓库可用性
  ├─ 阿里云 ECS 可用性
  │   ├─ 网络连接（80/443）
  │   ├─ nginx 服务
  │   └─ 磁盘空间
  ├─ DNS 解析（fibemate.net）
  └─ TLS 证书（Let's Encrypt）
```

---

## 3. 备份策略

### 3.1 备份清单

| 数据类型 | 备份频率 | 存储位置 | 保留周期 | 恢复时间 |
|----------|----------|----------|----------|----------|
| **源代码** | 每次 commit | GitHub（远程） | 永久 | <10 分钟 |
| **服务器文件** | 每日 03:00 | 本地 + GitHub | 30 天 | <1 小时 |
| **TSR 证据链** | 每次生成 | DigiCert + FreeTSA | 永久 | <30 分钟 |
| **CI/CD 配置** | 版本控制 | GitHub | 永久 | <10 分钟 |
| **nginx 配置** | 版本控制 | GitHub | 永久 | <10 分钟 |
| **TLS 证书** | 自动续期 | Let's Encrypt | 90 天 | <10 分钟 |
| **密钥** | 不备份 | HSM/密钥管理服务 | N/A | 重新生成 |

### 3.2 备份脚本

**服务器备份脚本** (`/opt/fibemate-repo/backup.sh`):
```bash
#!/bin/bash
# 每日备份脚本
# 执行时间: 每日 03:00 (cron)

BACKUP_DIR="/opt/fibemate-backups"
DATE=$(date +%Y%m%d)
REPO_DIR="/opt/fibemate-repo"

# 创建备份目录
mkdir -p $BACKUP_DIR/$DATE

# 备份 www 目录
tar -czf $BACKUP_DIR/$DATE/www.tar.gz -C $REPO_DIR www

# 备份配置文件
cp $REPO_DIR/.git/config $BACKUP_DIR/$DATE/git-config
cp -r $REPO_DIR/.github $BACKUP_DIR/$DATE/github

# 清理 30 天前的备份
find $BACKUP_DIR -type d -mtime +30 -exec rm -rf {} +

# 记录日志
echo "$(date) - Backup completed: $BACKUP_DIR/$DATE" >> /var/log/fibemate-backup.log
```

**Cron 配置**:
```bash
# 每日 03:00 执行备份
0 3 * * * /opt/fibemate-repo/backup.sh >> /var/log/fibemate-backup.log 2>&1
```

### 3.3 备份验证

**验证脚本** (`scripts/verify-backup.sh`):
```bash
#!/bin/bash

BACKUP_DIR="/opt/fibemate-backups"
LATEST_BACKUP=$(ls -t $BACKUP_DIR | head -1)

echo "最新备份: $LATEST_BACKUP"

# 检查备份文件完整性
if [ -f "$BACKUP_DIR/$LATEST_BACKUP/www.tar.gz" ]; then
    SIZE=$(stat -f%z "$BACKUP_DIR/$LATEST_BACKUP/www.tar.gz" 2>/dev/null || stat -c%s "$BACKUP_DIR/$LATEST_BACKUP/www.tar.gz")
    echo "备份大小: $SIZE 字节"
    
    # 验证 tar 文件
    if tar -tzf "$BACKUP_DIR/$LATEST_BACKUP/www.tar.gz" > /dev/null 2>&1; then
        echo "✅ 备份文件完整"
    else
        echo "❌ 备份文件损坏"
        exit 1
    fi
else
    echo "❌ 备份文件不存在"
    exit 1
fi
```

---

## 4. 恢复流程

### 4.1 GitHub 仓库恢复

**场景**: 仓库被删除、强制推送、或代码被篡改

**恢复步骤**:
1. **检查 GitHub 回收站**
   - GitHub 保留删除的仓库 30 天
   - 访问: https://github.com/Lennonhaha?tab=repositories
   - 点击 "Deleted repositories" → "Restore"

2. **从克隆恢复**
   ```bash
   # 从本地克隆推送
   cd C:\temp\fibemate-clone
   git remote add origin https://github.com/Lennonhaha/fibemate.git
   git push -u origin master --force
   git push -u origin main --force
   git push origin --tags --force
   ```

3. **验证恢复**
   ```bash
   # 检查最新提交
   git log --oneline -10
   
   # 检查标签
   git tag -l
   
   # 检查分支
   git branch -a
   ```

**预计恢复时间**: <10 分钟

### 4.2 服务器恢复

**场景**: ECS 实例故障、磁盘损坏、或系统崩溃

#### 方案 A: 重新部署（推荐）

**前提条件**:
- GitHub 仓库可用
- DNS 解析正常
- TLS 证书可用（Let's Encrypt 自动续期）

**恢复步骤**:
1. **创建新 ECS 实例**
   - 操作系统: Ubuntu 22.04 LTS
   - 规格: 2 vCPU / 4GB RAM / 40GB SSD
   - 安全组: 开放 22/80/443 端口

2. **安装依赖**
   ```bash
   # 更新系统
   sudo apt update && sudo apt upgrade -y
   
   # 安装 nginx
   sudo apt install -y nginx
   
   # 安装 git
   sudo apt install -y git
   
   # 安装 Node.js (如需运行脚本)
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt install -y nodejs
   ```

3. **克隆仓库**
   ```bash
   cd /opt
   git clone https://github.com/Lennonhaha/fibemate.git fibemate-repo
   cd fibemate-repo
   ```

4. **配置 nginx**
   ```bash
   # 创建 nginx 配置
   sudo tee /etc/nginx/sites-available/fibemate.net << 'EOF'
   server {
       listen 80;
       listen 443 ssl http2;
       server_name fibemate.net www.fibemate.net;
       
       ssl_certificate /etc/letsencrypt/live/fibemate.net/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/fibemate.net/privkey.pem;
       
       root /opt/fibemate-repo/www;
       index index.html;
       
       location / {
           try_files $uri $uri/ =404;
       }
   }
   EOF
   
   # 启用站点
   sudo ln -s /etc/nginx/sites-available/fibemate.net /etc/nginx/sites-enabled/
   
   # 测试配置
   sudo nginx -t
   
   # 重载 nginx
   sudo systemctl reload nginx
   ```

5. **配置 TLS 证书**
   ```bash
   # 安装 certbot
   sudo apt install -y certbot python3-certbot-nginx
   
   # 获取证书
   sudo certbot --nginx -d fibemate.net -d www.fibemate.net
   
   # 设置自动续期
   sudo certbot renew --dry-run
   ```

6. **验证恢复**
   ```bash
   # 检查服务状态
   sudo systemctl status nginx
   
   # 测试 HTTP
   curl -I https://fibemate.net
   
   # 检查文件完整性
   ls -la /opt/fibemate-repo/www/
   ```

**预计恢复时间**: <2 小时

#### 方案 B: 从备份恢复

**前提条件**:
- 备份文件可用（`/opt/fibemate-backups/`）
- ECS 实例可访问

**恢复步骤**:
1. **停止 nginx**
   ```bash
   sudo systemctl stop nginx
   ```

2. **恢复文件**
   ```bash
   cd /opt/fibemate-backups
   LATEST=$(ls -t | head -1)
   
   # 恢复 www 目录
   tar -xzf $LATEST/www.tar.gz -C /opt/fibemate-repo/
   ```

3. **恢复 git 配置**
   ```bash
   cp $LATEST/git-config /opt/fibemate-repo/.git/config
   cp -r $LATEST/github /opt/fibemate-repo/.github
   ```

4. **同步最新代码**
   ```bash
   cd /opt/fibemate-repo
   git pull origin master
   ```

5. **启动 nginx**
   ```bash
   sudo systemctl start nginx
   ```

6. **验证恢复**
   ```bash
   curl -I https://fibemate.net
   ```

**预计恢复时间**: <1 小时

### 4.3 TSR 证据链恢复

**场景**: TSR 文件丢失或损坏

**恢复步骤**:
1. **从 GitHub 恢复**
   ```bash
   cd /opt/fibemate-repo
   git pull origin master
   
   # 验证 TSR 文件
   ls -la www/docs/tsa/
   ```

2. **验证 TSR 完整性**
   ```bash
   # 运行验证脚本
   bash scripts/verify-tsr.sh
   
   # 或使用 Node.js 脚本
   node scripts/verify-tsr.js
   ```

3. **重新生成缺失 TSR**（如需）
   ```bash
   # 使用 FreeTSA 重新签发
   # 参考证据链维护流程
   ```

**预计恢复时间**: <30 分钟

### 4.4 CI/CD 恢复

**场景**: GitHub Actions 不可用或配置丢失

**恢复步骤**:
1. **检查 workflow 文件**
   ```bash
   cd .github/workflows
   ls -la
   
   # 应包含:
   # - ci.yml
   # - ci-native.yml
   # - nightly-phase1.yml
   # - nightly-phase2.yml
   ```

2. **从 GitHub 恢复**
   - 如果 workflow 文件丢失，从 GitHub 历史恢复
   - 或从本地克隆重新推送

3. **重新触发 CI**
   ```bash
   # 手动触发 CI
   gh workflow run ci.yml
   
   # 检查状态
   gh run list --limit 5
   ```

4. **验证 CI 正常**
   - 检查 GitHub Actions 页面
   - 确认所有 job 通过

**预计恢复时间**: <30 分钟

---

## 5. 密钥管理

### 5.1 密钥清单

| 密钥类型 | 用途 | 存储位置 | 轮换周期 |
|----------|------|----------|----------|
| **GitHub PAT** | 推送代码/触发 CI | 本地文件 (`ghp_*.txt`) | 90 天 |
| **SSH 密钥** | 服务器访问 | `~/.ssh/id_ed25519_github` | 1 年 |
| **TLS 私钥** | HTTPS | Let's Encrypt（自动管理） | 90 天 |
| **TSR 签名密钥** | 时间戳存证 | DigiCert/FreeTSA（第三方） | N/A |

### 5.2 密钥轮换流程

**GitHub PAT 轮换**:
1. 生成新 PAT
   - GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
   - 权限: `admin:repo_hook`, `repo`, `workflow`
   
2. 更新本地配置
   ```bash
   # 更新 remote URL
   git remote set-url origin https://Lennonhaha:<NEW_TOKEN>@github.com/Lennonhaha/fibemate.git
   
   # 测试推送
   git push origin master
   ```

3. 撤销旧 PAT
   - GitHub → Settings → Developer settings → Personal access tokens
   - Delete 旧 token

**SSH 密钥轮换**:
```bash
# 生成新密钥
ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/id_ed25519_github_new

# 添加到 GitHub
cat ~/.ssh/id_ed25519_github_new.pub
# GitHub → Settings → SSH and GPG keys → New SSH key

# 测试连接
ssh -T git@github.com -i ~/.ssh/id_ed25519_github_new

# 替换旧密钥
mv ~/.ssh/id_ed25519_github ~/.ssh/id_ed25519_github_old
mv ~/.ssh/id_ed25519_github_new ~/.ssh/id_ed25519_github
```

### 5.3 密钥丢失恢复

**GitHub PAT 丢失**:
1. 重新生成 PAT（同上）
2. 更新所有使用该 PAT 的配置
3. 记录新 PAT 到安全位置

**SSH 密钥丢失**:
1. 生成新 SSH 密钥（同上）
2. 添加到 GitHub
3. 更新服务器 authorized_keys
4. 删除旧公钥

---

## 6. 灾难场景响应

### 6.1 场景 1: GitHub 仓库完全不可用

**影响**:
- 无法推送代码
- CI/CD 停止
- 官网无法更新（但现有版本仍可访问）

**响应步骤**:
1. **确认 GitHub 状态**
   - 访问 https://www.githubstatus.com/
   - 确认是否为全局故障

2. **切换到本地开发**
   - 继续本地开发
   - 使用本地测试

3. **等待 GitHub 恢复**
   - 关注 GitHub 状态更新
   - 恢复后立即推送所有更改

4. **通知用户**（如需）
   - 在官网添加通知横幅
   - 在社交媒体发布公告

**预计影响时间**: 取决于 GitHub 恢复时间

### 6.2 场景 2: 阿里云 ECS 完全故障

**影响**:
- 官网不可访问
- API 不可用

**响应步骤**:
1. **确认故障范围**
   - 检查阿里云控制台
   - 确认是实例故障还是区域故障

2. **创建新实例**
   - 使用方案 A（重新部署）
   - 更新 DNS 解析（如 IP 改变）

3. **验证恢复**
   - 测试 HTTPS 访问
   - 检查所有页面

4. **通知用户**
   - 添加维护通知
   - 更新状态页面

**预计恢复时间**: <4 小时

### 6.3 场景 3: 数据中心火灾/地震

**影响**:
- GitHub 可能不可用（美国数据中心）
- 阿里云 ECS 可能不可用（中国数据中心）
- 本地备份可能不可用

**响应步骤**:
1. **评估影响范围**
   - 检查 GitHub 状态
   - 检查阿里云状态
   - 检查本地基础设施

2. **激活异地备份**
   - GitHub: 等待服务恢复或使用镜像仓库（如 GitLab）
   - ECS: 切换到其他区域（如华东 → 华北）
   - 本地: 使用云存储备份（如有）

3. **逐步恢复服务**
   - 优先恢复官网
   - 恢复 CI/CD
   - 恢复数据完整性验证

4. **长期恢复**
   - 重建基础设施
   - 更新所有凭证
   - 全面安全审计

**预计恢复时间**: 24-72 小时（取决于灾难规模）

### 6.4 场景 4: 勒索软件攻击

**影响**:
- 文件被加密
- 系统可能被破坏

**响应步骤**:
1. **立即隔离**
   - 断开网络连接
   - 关闭受影响系统

2. **评估损失**
   - 确认被加密的文件
   - 确认备份是否受影响

3. **从干净备份恢复**
   - 使用验证过的备份
   - 在干净系统上恢复

4. **不支付赎金**
   - 报告执法部门
   - 寻求专业帮助

5. **加强防护**
   - 更新所有凭证
   - 加固系统安全
   - 部署防勒索软件

**预计恢复时间**: 24-48 小时

---

## 7. 测试与演练

### 7.1 恢复测试计划

| 测试类型 | 频率 | 范围 | 成功标准 |
|----------|------|------|----------|
| **备份验证** | 每周 | 检查备份文件完整性 | 文件可解压，大小合理 |
| **部分恢复测试** | 每月 | 恢复单个文件/目录 | 文件内容正确 |
| **完整恢复演练** | 每季度 | 恢复整个服务 | 服务可用，功能正常 |
| **灾难演练** | 每年 | 模拟真实灾难场景 | RTO/RPO 达标 |

### 7.2 恢复演练脚本

**月度备份验证**:
```bash
#!/bin/bash
# 月度备份验证脚本

BACKUP_DIR="/opt/fibemate-backups"
LATEST=$(ls -t $BACKUP_DIR | head -1)

echo "验证备份: $LATEST"

# 检查文件数量
FILE_COUNT=$(tar -tzf $BACKUP_DIR/$LATEST/www.tar.gz | wc -l)
echo "文件数量: $FILE_COUNT"

# 随机抽取 10 个文件验证
tar -tzf $BACKUP_DIR/$LATEST/www.tar.gz | shuf -n 10 | while read file; do
    echo "检查: $file"
done

# 验证可解压
TEST_DIR=$(mktemp -d)
tar -xzf $BACKUP_DIR/$LATEST/www.tar.gz -C $TEST_DIR
if [ $? -eq 0 ]; then
    echo "✅ 备份可解压"
else
    echo "❌ 备份损坏"
fi
rm -rf $TEST_DIR

echo "验证完成: $(date)"
```

### 7.3 演练记录模板

```markdown
# 恢复演练记录

**演练日期**: YYYY-MM-DD
**演练类型**: [备份验证/部分恢复/完整恢复/灾难演练]
**参与人员**: [姓名]

## 演练场景
{描述演练的场景和目标}

## 演练步骤
1. 步骤 1
2. 步骤 2
...

## 演练结果
- RTO 实际值: XX 小时
- RPO 实际值: XX 小时
- 成功项: [列出成功恢复的项目]
- 失败项: [列出失败的项目]

## 发现的问题
| 问题 | 严重性 | 影响 | 改进措施 |
|------|--------|------|----------|
| ... | ... | ... | ... |

## 改进措施
- [ ] 改进措施 1
- [ ] 改进措施 2

## 结论
{总结演练效果和下一步行动}
```

---

## 8. 监控与告警

### 8.1 监控指标

| 指标 | 阈值 | 告警方式 | 响应时间 |
|------|------|----------|----------|
| **网站可用性** | HTTP 200 | 邮件 + 短信 | <15 分钟 |
| **响应时间** | >5s | 邮件 | <30 分钟 |
| **磁盘空间** | >80% | 邮件 | <24 小时 |
| **CPU 使用率** | >80% 持续 5 分钟 | 邮件 | <1 小时 |
| **内存使用率** | >90% 持续 5 分钟 | 邮件 | <1 小时 |
| **CI 成功率** | <80% | 邮件 | <4 小时 |

### 8.2 监控工具

**可用性监控**:
- UptimeRobot（免费版）
- 或 GitHub Actions cron job + curl

**性能监控**:
- nginx access log 分析
- 服务器监控（top, htop, vmstat）

**告警配置**:
- 邮件: 27202998@qq.com
- GitHub Issues: 自动创建

---

## 9. 供应商管理

### 9.1 关键供应商

| 供应商 | 服务 | SLA | 支持联系 |
|--------|------|-----|----------|
| GitHub | 代码托管/CI/CD | 99.9% | support@github.com |
| 阿里云 | ECS/域名/DNS | 99.95% | 工单系统 |
| Let's Encrypt | TLS 证书 | N/A | 社区支持 |
| DigiCert | 时间戳存证 | 99.9% | support@digicert.com |
| FreeTSA | 时间戳存证 | N/A | N/A |

### 9.2 供应商依赖风险

| 依赖 | 风险 | 缓解措施 |
|------|------|----------|
| GitHub 单一依赖 | 中 | 定期本地备份 |
| 阿里云单一区域 | 低 | 可快速切换区域 |
| Let's Encrypt 自动续期 | 低 | 监控证书过期时间 |

---

## 10. 文档与培训

### 10.1 相关文档

| 文档 | 路径 | 用途 |
|------|------|------|
| 项目概览 | README.md | 了解项目结构 |
| 安全策略 | SECURITY.md | 安全相关信息 |
| 事件响应 | docs/INCIDENT_RESPONSE_PLAN.md | 安全事件处理 |
| 迁移计划 | docs/PQC_MIGRATION_PLAN.md | PQC 迁移路线图 |
| 备份脚本 | /opt/fibemate-repo/backup.sh | 备份执行 |

### 10.2 培训计划

**目标受众**: 项目维护者

**培训内容**:
- 恢复流程培训
- 工具使用培训
- 演练参与

**培训频率**: 每季度一次

---

## 11. 持续改进

### 11.1 指标跟踪

| 指标 | 目标 | 当前 | 趋势 |
|------|------|------|------|
| RTO | <4h | - | - |
| RPO | <24h | - | - |
| 备份成功率 | 100% | - | - |
| 恢复测试成功率 | 100% | - | - |
| 演练完成率 | 100% | 0% | ⏳ |

### 11.2 定期审查

**审查频率**: 每季度

**审查内容**:
- 恢复计划有效性
- 备份策略充分性
- 监控告警覆盖率
- 供应商 SLA 合规性
- 改进措施执行情况

---

## 12. 附录

### A. 应急联系人

**内部联系人**:
- Tianhe Liu (维护者): 27202998@qq.com, GitHub: @Lennonhaha

**外部联系人**:
- GitHub Support: support@github.com
- 阿里云技术支持: 工单系统
- DigiCert Support: support@digicert.com

### B. 恢复检查清单

**GitHub 仓库恢复**:
- [ ] 确认仓库状态
- [ ] 恢复或重新推送代码
- [ ] 验证分支和标签
- [ ] 测试 CI/CD 流水线
- [ ] 检查 webhook 和集成

**服务器恢复**:
- [ ] 创建新实例或修复现有实例
- [ ] 安装依赖（nginx, git, node）
- [ ] 克隆仓库
- [ ] 配置 nginx
- [ ] 配置 TLS 证书
- [ ] 测试 HTTPS 访问
- [ ] 验证所有页面

**TSR 证据链恢复**:
- [ ] 检查 TSR 文件完整性
- [ ] 验证签名
- [ ] 重新生成缺失 TSR（如需）

**CI/CD 恢复**:
- [ ] 检查 workflow 文件
- [ ] 重新触发 CI
- [ ] 验证所有 job 通过

### C. 参考文档

- `README.md` - 项目概览
- `SECURITY.md` - 安全策略
- `docs/INCIDENT_RESPONSE_PLAN.md` - 事件响应计划
- `docs/PQC_MIGRATION_PLAN.md` - 迁移计划
- `tools/cbom-cyclonedx.json` - 密码资产清单

---

**维护者**: Tianhe Liu (Lennonhaha)
**最后更新**: 2026-08-02
**下次审查**: 2026-11-02
**文档版本**: v1.0
