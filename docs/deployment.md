# FIBEMATE 部署指南与生产规则

> 版本: v3.4 | 最后更新: 2026-09-02
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

# 1. 解锁全部内容目录（不能只解 www）
for d in www docs viz src packages; do
  find "$REPO_DIR/$d" -type d -exec chattr -i {} \; 2>/dev/null || true
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

# 4. 重新上锁
for d in www docs viz src packages; do
  find "$REPO_DIR/$d" -type d -exec chattr +i {} \; 2>/dev/null || true
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

echo "[2/5] 解锁内容目录..."
for d in $LOCK_DIRS; do
  find "$REPO_DIR/$d" -type d -exec chattr -i {} \; 2>/dev/null || true
done

echo "[3/5] 拉取最新代码..."
git fetch origin main
git reset --hard origin/main

echo "[4/5] 恢复只读锁..."
for d in $LOCK_DIRS; do
  find "$REPO_DIR/$d" -type d -exec chattr +i {} \; 2>/dev/null || true
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

**锁目录而非文件**（锁文件会挡 git checkout/pull 的 unlink）：

```bash
# ✅ 正确：锁目录（防止新建/删除目录项，文件内容仍可改）
chattr +i /opt/fibemate-repo/www
chattr +i /opt/fibemate-repo/docs

# ❌ 错误：锁单个文件（会导致 git pull 报 unlink Operation not permitted）
chattr +i /opt/fibemate-repo/www/index.html
```

部署前先解锁，部署后重新上锁（见 R2 / deploy-fibemate.sh）。

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

## 八、Tauri 桌面端 + 移动端（独立仓库）

- Tauri 桌面端：独立仓库 `Lennonhaha/fibemate-tauri`（与 main 生产线**严格分离**）
- 移动端（Capacitor Android）：独立仓库，P3 排期
- **红线**：main 生产线与研究线（experimental/vwz-lg）、tauri 仓库严格分离，禁止混用

---

> 当前生产环境: Alibaba Cloud ECS (fibemate.net, 8.156.77.68) | Ubuntu 22.04 | Nginx 1.24 | pm2
