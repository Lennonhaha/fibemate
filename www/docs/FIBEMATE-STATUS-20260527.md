# FIBEMATE v3.0-preview --- 项目状态报告
## 2026-05-27

---

## 一、项目概览

| 项目 | 详情 |
|------|------|
| 项目名称 | FibeMate - 后量子安全即时通讯 |
| 版本 | v3.0-preview |
| 域名 | fibemate.net(主) + fibemate.link(备用) |
| 服务器 | 阿里云 ECS @ 8.156.77.68 |
| 备案 | 黑ICP备2026005787号-1(个人非经营性) |
| 状态 | 技术验证与测试阶段,计划 2026.08.31 开源 |
| 许可证 | AGPLv3(核心代码) / CC BY-NC-SA 4.0(文档) |

---

## 二、架构总览

```
                    +------------------+
                    |    Nginx :443    |
                    |  (Lets Encrypt)  |
                    +--+-------+-------+
                       |       |
          +------------+       +------------+
          v                                 v
+------------------+          +----------------------+
|  Node.js :3001   |          |    Rust :3002        |
|  (光纤通道)       |          |   (实验室通道)      |
|  fibermate.svc   |          |  fibermate-rust.svc  |
+------------------+          +----------------------+
       |            Mixnet:
       |     +------+------+
       v     |:9001 |:9002 |:9003
+--------------+------+------+
|PostgreSQL    |
+--------------+
```

**Nginx 灰度路由:**
- /api/, /ws --> Node.js 3001
- /rust/ws, /rust/api/ --> Rust 3002
- /rust/health --> Rust 3002/health (新增 2026-05-27)
- /health --> Node.js 3001

---

## 三、已完成里程碑

### 密码学与安全

| 模块 | 状态 | 备注 |
|------|------|------|
| ML-KEM-768 密钥封装 | OK | FIPS 203 KAT 通过 |
| PQ Hybrid X3DH | OK | ML-KEM + X25519 |
| Double Ratchet | OK | 向前安全 + PQ |
| SM2 国密集成 | OK | GB/T 32918.4-2016 KDF |
| SM2-KDF / SM3 | OK | 替换6处 HKDF 调用 |
| ZK 匿名认证 | OK | E2E 18/18 + 边界 10/10 |
| 签名模块 | OK | ML-DSA-44 + SLH-DSA |
| WASM 加速 | OK | fibermate_pq_wasm.js |
| Rust 后端 | OK | 17/17 E2E + 31/31 单元 |
| 安全审计 | OK | 8/8 维度通过 (2026-05-22) |

### 隐私保护

| 层 | 功能 | 测试 |
|----|------|------|
| L6 Cover Traffic | 指数分布覆盖流量 | OK K-S p=0.9972 |
| L7 Traffic Shaping | 均匀抖动 +/-500ms | OK |
| L8 Padding | 桶位 + 随机填充 | OK 0~8192B |
| 时间戳存证 | 联合信任 + DigiCert | OK 双源 |

### 合规与网站

| 项 | 状态 |
|----|------|
| ICP 备案 黑2026005787号-1 | OK |
| 公网安备号 000709114001 | OK |
| HTTPS (Lets Encrypt, 至 2026-08-08) | OK |
| ZK 合规标注 | OK 2026-05-27 |
| 官网审计 (14项清零) | OK |
| 法律文档 (4篇) | OK |

---

## 四、待处理

**P0 (阻塞):**
- 数据库持久化 E2eeManager

**P1 (重要):**
- Node.js Hybrid 强制
- 离线消息加密
- browser crypto.subtle (HTTPS已可用)

**P2 (改进):**
- 法律文档聚合页
- message-crypto-v2.js 拆分 (1496行)
- 服务器 Git remote 配置

---

## 五、今日进展 (2026-05-27)

1. OK ZK 合规标注 --- login / index / disclaimer 三文件
2. OK Nginx /rust/health 端点 --- 已验证 OK
3. OK 本地备份 --- 114 核心文件
4. OK 磁盘清理 --- C盘 .qclaw/agents 释放 ~17GB

---

## 六、综合评分: 83.6/100 (B+)

| 维度 | 分 | 说明 |
|------|----|------|
| 密码学 | 88 | FIPS KAT, SM2完整, ZK完整 |
| 隐私 | 85 | 三层混淆 + 双源TSA |
| 合规 | 82 | ICP+安备+ZK标注+法律文档 |
| 工程化 | 80 | 待 CI/CD+Git |
| 文档 | 78 | 官网完整, 技术文档分散 |

---

## 七、服务器关键信息

| 项 | 值 |
|----|-----|
| SSH | root@8.156.77.68 (~/.ssh/fibermate4.pem) |
| Node.js | /opt/fibermate-full/src/ |
| 静态文件 | /opt/fibermate-full/www/ |
| Rust | /opt/fibermate-rust/ |
| Nginx | /etc/nginx/sites-enabled/fibermate.net |
| SSL | /etc/letsencrypt/live/fibermate.net/ |

### Systemd 服务
- fibermate.service (Node.js :3001)
- fibermate-rust.service (Rust :3002)
- fibermate-mixnet-*.service (Mixnet :9001-9003)

---

*报告: 2026-05-27 22:10 CST | 下次更新: 重大变更时*
