# FIBEMATE 部署指南与生产规则

> 版本: v3.5 | 最后更新: 2026-10-17
> 本文档是生产部署的**唯一权威来源**。任何生产操作必须遵守下方六条规则（R1–R6）。

---

## 一、生产架构（真实现状）

```
                         ┌─────────────────────────────────────────┐
  Internet ──443──► nginx │  root: /opt/fibemate-repo/www (静态站点) │
                         │  /api/  → proxy 127.0.0.1:3001 (API)     │
                         │  /ws    → proxy 127.0.0.1:3001 (WS)      │
                         │  /api/v1/probe → 9004                    │
                         └─────────────────────────────────────────┘
                                          │
                          ┌───────────────▼────────────────┐
                          │  API 进程 (pm2: fibemate)        │
                          │  /opt/fibemate-repo/src/index.js│
                          │  监听 127.0.0.1:3001             │
                          └───────────────┬────────────────┘
                                          │
                          ┌───────────────▼────────────────┐
                          │  数据目录 /opt/fibemate-repo/data│
                          │  fibemate.db (SQLite) + .jwt-secret│
                          └────────────────────────────────┘
```

**关键点**：
- 静态站点 document root = `/opt/fibemate-repo/www`
- API 服务 = pm2 进程 `fibemate`，跑 `/opt/fibemate-repo/src/index.js`（端口 3001，仅回环监听）
- 数据（SQLite db + JWT secret）= `/opt/fibemate-repo/data/`

> ⚠️ **历史债务（2026-09-02 已止血，待彻底废弃）**：曾存在独立副本 `/opt/fibemate-full`，
> pm2 指向它而非 repo，导致"代码修了但生产没生效"（mlkem.keygen 报错）。已就地修复，
> 但**最终目标是把 pm2 切到 repo、废弃 full**（见 R1）。

---

## 二、六条生产规则（R1–R6）

### R1 — 生产环境只跑 Git 仓库代码（P0）

生产 API 进程**必须**从 `/opt/fibemate-repo/src/index.js` 启动，**禁止**出现第二个独立目录。

```bash
# 正确启动方式
pm2 delete fibemate 2>/dev/null || true
cd /opt/fibemate-repo
pm2 start src/index.js --name fibemate --cwd /opt/fibemate-repo
pm2 save
pm2 startup
```

> 违反本规则导致的直接后果见 2026-09-02 事故（`/opt/fibemate-full` 与 repo 分叉）。

### R2 — 部署脚本必须覆盖全部代码（P0）

部署脚本必须解锁/同步**所有**代码目录（`src` + `packages` + `www`），不能只解 `www/`。

```bash
#!/bin/bash
set -e
REPO_DIR="/opt/fibemate-repo"

# 1. 解锁全部内容目录与文件（不能只解 www；也不能只解目录）
#    生产实际对「目录 + 目录内文件」都设了 +i（内容级防篡改）；只解目录不够：
#    git 写盘要 unlink 旧 inode，文件级 +i 会报 Operation not permitted（2026-10-17 实测）
for d in www docs viz src packages; do
  find "$REPO_DIR/$d" -type d -exec chattr -i {} \; 2>/dev/null || true
  find "$REPO_DIR/$d" -type f -exec chattr -i {} \; 2>/dev/null || true
done

# 2. 检查工作区干净（R4）
cd "$REPO_DIR"
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ 工作区有未提交改动，停止部署" >&2
  exit 1
fi

# 3. 拉取代码
git fetch origin main
git reset --hard origin/main

# 4. 重新上锁（目录 + 文件两层都恢复）
for d in www docs viz src packages; do
  find "$REPO_DIR/$d" -type d -exec chattr +i {} \; 2>/dev/null || true
  find "$REPO_DIR/$d" -type f -exec chattr +i {} \; 2>/dev/null || true
done

# 5. 重启服务
pm2 restart fibemate --update-env || pm2 start src/index.js --name fibemate --cwd "$REPO_DIR"

# 6. 健康检查（R3）
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/api/mlkem/test | grep -q 200 \
  || echo "⚠️ /api/mlkem/test 异常"
```

### R3 — 每次推送后自动验证关键端点（P1）

CI 或部署脚本末尾必须验证关键端点，API 挂掉立即可见，不等用户发现。

```yaml
# .github/workflows/deploy-verify.yml
name: Deploy Verify
on:
  push:
    branches: [main]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - run: sleep 15   # 等部署
      - run: |
          curl -s -o /dev/null -w "%{http_code}\n" https://fibemate.net/health | grep -q 200
          curl -s -o /dev/null -w "%{http_code}\n" https://fibemate.net/api/mlkem/test | grep -q 200
```

### R4 — 服务器禁止本地未提交改动（P1）

生产目录 `/opt/fibemate-repo` 必须保持 `git status` 干净。任何调试/临时改动必须走 Git 流程，不允许在服务器上直接改代码。

```bash
cd /opt/fibemate-repo
if [ -n "$(git status --porcelain)" ]; then echo "❌ 脏工作区"; exit 1; fi
```

> 紧急 hotfix 也必须 `git commit -m "hotfix: ..." && git push`，而非就地改。

### R5 — main 分支受保护，所有变更走 PR（P1）

- 要求 PR 审查通过后才能合并
- 要求状态检查（CI）通过
- 禁止强制推送
- 禁止管理员绕过

### R6 — 每季度做一次"生产-代码库一致性审计"（P2）

```bash
echo "=== 生产一致性检查 ==="
echo "服务器 HEAD:   $(cd /opt/fibemate-repo && git log -1 --oneline)"
echo "GitHub HEAD:   $(git ls-remote origin main | cut -f1 | cut -c1-8)"
echo "pm2 指向:      $(pm2 describe fibemate | grep 'script path')"
echo "脏工作区文件:  $(cd /opt/fibemate-repo && git status --porcelain | wc -l)"
```

纳入每月维护清单。

---

## 三、部署流程（deploy-fibemate.sh）

服务器上执行（`/root/deploy-fibemate.sh`）：

```bash
#!/bin/bash
# FIBEMATE 生产部署 —— 三明治流程（检查干净 → 解锁 → pull → 恢复锁 → 验证）
set -e
REPO_DIR="/opt/fibemate-repo"
LOCK_DIRS="www docs viz src packages"

echo "[1/5] 检查工作区干净..."
cd "$REPO_DIR"
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ 工作区有未提交改动，先处理再部署" >&2
  git status --porcelain
  exit 1
fi

echo "[2/5] 解锁内容目录与文件..."
for d in $LOCK_DIRS; do
  find "$REPO_DIR/$d" -type d -exec chattr -i {} \; 2>/dev/null || true
  find "$REPO_DIR/$d" -type f -exec chattr -i {} \; 2>/dev/null || true
done

echo "[3/5] 拉取最新代码..."
git fetch origin main
git reset --hard origin/main

echo "[4/5] 恢复只读锁（目录 + 文件）..."
for d in $LOCK_DIRS; do
  find "$REPO_DIR/$d" -type d -exec chattr +i {} \; 2>/dev/null || true
  find "$REPO_DIR/$d" -type f -exec chattr +i {} \; 2>/dev/null || true
done

echo "[5/5] 重启 API + 健康检查..."
pm2 restart fibemate --update-env
sleep 3
code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/api/mlkem/test)
if [ "$code" = "200" ]; then echo "✅ 部署成功"; else echo "⚠️ /api/mlkem/test 返回 $code"; fi
```

---

## 四、关键端点清单（验证用）

| 端点 | 方法 | 鉴权 | 说明 |
|:---|:---|:---|:---|
| `/health` | GET | 无 | 健康检查 |
| `/api/health` | GET | 无 | API 健康 |
| `/api/mlkem/test` | GET | 无 | ML-KEM round-trip 自测（**部署必验**） |
| `/api/mlkem/test-batch` | GET | `X-Batch-Token` header | 批量 KAT |
| `/api/auth/register` | POST | 无 | 注册 |
| `/api/auth/login` | POST | 无 | 登录 |
| `/api/auth/verify` | **GET** | Bearer | 校验 token（注意是 GET） |
| `/api/conversations` | GET | Bearer | 会话列表 |
| `/api/messages` | POST | Bearer | 发消息 |
| `/api/users/:id/keys` | GET | Bearer | 获取公钥（消耗 OPK） |

---

## 五、环境变量

| 变量 | 说明 | 状态 |
|:---|:---|:---|
| `NODE_ENV` | production | ✅ pm2 env 已设 |
| `JWT_SECRET` | 持久化于 `data/.jwt-secret` 文件（自动生成） | ✅ |
| `BATCH_TEST_TOKEN` | test-batch 鉴权 token | ⚠️ **未配置（待设）** |
| `ADMIN_INVITE_CODE` | 保留 ID 注册邀请码 | ⚠️ **未配置（待设）** |
| `PORT` | API 端口（默认 3001） | ✅ |

---

## 六、只读锁（chattr +i）正确用法

> **2026-10-17 订正**：生产实际对 `www/`、`docs/`、`packages/` 的**目录与目录内文件都设了 `+i`**
> （内容级防篡改），不是旧版本写的「锁目录而非文件」。实测后果：`git pull` / `git merge` 写盘时
> 要 `unlink` 旧 inode，文件级 `+i` 会直接失败：`error: unable to unlink ...: Operation not permitted`
> （2026-10-17 部署事故，已按本节方式修复）。

**规则：部署前必须同时解锁「目录」与「目录内文件」；部署完成后按原状重新上锁。**

```bash
# 解锁（目录 + 文件，两层都要跑）
for d in /opt/fibemate-repo/www /opt/fibemate-repo/docs /opt/fibemate-repo/packages; do
  find "$d" -type d -exec chattr -i {} \; 2>/dev/null || true
  find "$d" -type f -exec chattr -i {} \; 2>/dev/null || true
done

# 核验解锁干净（期望 0）
lsattr -R /opt/fibemate-repo/www /opt/fibemate-repo/docs /opt/fibemate-repo/packages 2>/dev/null \
  | grep -v ':$' | grep -v '^$' | grep -v -- '----i' | wc -l

# 重新上锁（目录 + 文件）
for d in /opt/fibemate-repo/www /opt/fibemate-repo/docs /opt/fibemate-repo/packages; do
  find "$d" -type d -exec chattr +i {} \; 2>/dev/null || true
  find "$d" -type f -exec chattr +i {} \; 2>/dev/null || true
done
```

⚠️ `trap` 必须在第一条 `chattr -i` **之前**注册：任何失败（含 pull 失败）都要回到 `+i`；
锚点实现见 fibemate-tools `scripts/server-sync.sh`。
⚠️ 统计「未锁文件数」时，`lsattr -R` 的输出里既有**空行**也有**目录头行**（`xxx:`），
两者都必须剔除，否则会得到假数字。

### 6.1 两种锁策略的取舍（结论：保持现状）

- **只锁目录**（旧文档口味）：`git pull` 顺滑，但目录内文件内容可被就地改写，防篡改弱一层。
- **目录 + 文件都锁**（现状）：防篡改更强，但每次部署都要多走「文件解锁」这一步，
  且**脚本必须同时解锁两层**，否则部署必然失败。

2026-10-17 决定：**保持现状（目录 + 文件都锁）**，配套脚本按此升级
（本文 §R2 / §三，以及服务器 `/root/deploy-fibemate.sh`）。

### 6.2 同期复核发现（未改行为，待决策）

- R4 与 §三 的「工作区必须干净」门禁，与「磁盘先行会留 WIP」的现实冲突：2026-10-17 部署前
  `www/main-tiled.html` 就有未提交改动，按现脚本会被直接拒绝部署。
- R2 与 §三 用 `git reset --hard origin/main` 会**静默丢弃**上述 WIP；安全等价写法是
  `git merge --ff-only origin/main`（前提 HEAD 是 main 的祖先），本次实际部署采用后者。
- R1 写「已就地修复、pm2 跑 repo 的 `src/index.js`」，但 2026-10-17 实测 pm2 `fibemate` 仍指向
  `/opt/fibemate-full/src/index.js`（与 CONTRIBUTING.md 一致，与本文件 R1 不一致）。

---

## 七、备份与回滚

```bash
# 生产改动备份（改动前必做）
cd /opt/fibemate-repo
git diff > /root/fibemate-repo-local-$(date +%Y%m%d).patch

# 回滚到指定 commit
git fetch origin
git reset --hard <commit-sha>
pm2 restart fibemate
```

---

## 八、生产配置外置（ALLOWED_ORIGINS 等敏感配置）

> 新增于 2026-09-09。根因：生产服务器 `/opt/fibemate-full`（历史债务目录）的 `src/index.js`
> 曾硬编码生产公网 IP `8.156.77.68` 的三个 origin 变体，导致：① 服务器 `git pull` 会冲掉该配置；
> ② 生产 IP 暴露在公开仓库。现通过环境变量外置解决。

### 规则

1. **生产专属 origin 必须走环境变量，禁止硬编码**
   - 代码（`src/index.js`）只保留开发/通用 origin（localhost、tauri、fibemate.net 等）
   - 生产 IP / 域名 / 端口通过 `ALLOWED_ORIGINS_EXTRA` 注入：
     ```js
     if (process.env.ALLOWED_ORIGINS_EXTRA) {
       for (const o of process.env.ALLOWED_ORIGINS_EXTRA.split(',')) {
         const t = o.trim();
         if (t) ALLOWED_ORIGINS.push(t);
       }
     }
     ```
   - 部署侧 `.env`：`ALLOWED_ORIGINS_EXTRA=http://8.156.77.68,http://8.156.77.68:3001,https://8.156.77.68`
   - `.env` 不进 Git，仅存于服务器并备份至 E 盘备份目录（见 AGENTS.md 备份纪律）

2. **任何环境相关配置（端口、域名、生产 IP、密钥路径）一律外置为 `.env`**
   - 判断标准：配置是否随代码逻辑变化？环境相关 → `.env`；逻辑相关 → 代码常量

3. **`git reset --hard origin/main`（R2）的前置条件**
   - 仅当**生产配置已外置**（本规则第 1 条）后，代码文件才能 `reset --hard` 与 main 对齐
   - `.env` 不进 Git，不受 `reset --hard` 影响，配置零丢失
   - 若仍有代码内硬编码的生产配置未外置，`reset --hard` 会冲掉它 → **必须先完成外置再 reset**

4. **公开仓库禁止含生产敏感信息**
   - 不得在代码中硬编码生产服务器 IP / 域名 / AccessKey / 数据库连接串
   - 公开文档示例用占位符（如 `PRODUCTION_IP` / `example.com`）
   - 发版前用 `git grep -n '8.156.77.68'` 扫描是否存在误提交的生产 IP

### 迁移步骤（清历史脏树用，非日常）

```bash
# 1. 部署侧写 .env
echo 'ALLOWED_ORIGINS_EXTRA=http://8.156.77.68,http://8.156.77.68:3001,https://8.156.77.68' >> /opt/fibemate-repo/.env
# 2. 清代码内硬编码（git checkout 会用 main 的干净版本覆盖）
cd /opt/fibemate-repo && git checkout -- src/index.js
# 3. 拉取含 env 扩展能力的 main
git fetch origin main && git reset --hard origin/main
# 4. 重启（--update-env 让 .env 生效）
pm2 restart fibemate --update-env
```

---

## 八、Tauri 桌面端 + 移动端（独立仓库）


- Tauri 桌面端：独立仓库 `Lennonhaha/fibemate-tauri`（与 main 生产线**严格分离**）
- 移动端（Capacitor Android）：独立仓库，P3 排期
- **红线**：main 生产线与研究线（experimental/vwz-lg）、tauri 仓库严格分离，禁止混用

---

> 当前生产环境: Alibaba Cloud ECS (fibemate.net, 8.156.77.68) | Ubuntu 22.04 | Nginx 1.24 | pm2
