# 三端健康检查（2026-08-14 05:23）

## 一、阿里云服务器 ✅ 正常

- uptime 3 天 8 小时，负载 0.01（空闲）
- nginx active
- 磁盘 22G/40G（59%），内存 731M/1612M used
- git HEAD = 5a37f5d3（与三端一致）

## 二、GitHub 报警 —— 未解决（需决策）

### Dependabot（62 条）
- open 45：high 12 / medium 23 / low 10
- 其余 fixed 15 / dismissed 1 / auto_dismissed 1
- 与上次「54 条」对比：open 数从 54 → 45（第一档升级 ws/js-yaml/ip-address/underscore/mongoose 后减了 9 条）

### Code Scanning（576 条，此前记录 545）
- open 488：error 60 / warning 96 / note 332
- 其余 fixed 58 / dismissed 30
- **open error 60 条分布**：
  - 24 `migration-priority.html`（overwritten-property，前端页）
  - 10 wasm-sm2（8 field.ts + 2 sm2.ts，shift-out-of-range，AssemblyScript 编译目标代码）
  - 7 src/index.js、4 bloom-filter.js、3 backend/src/index.js 等后端
- **最近 7 天新增 17 条** open error/warning：10 shift-out-of-range（wasm-sm2）+ 4 useless-assignment + 2 redundant-assignment + 1 remote-property-injection
- 历史遗留占大头：403 条为 8/2 历史

### 判断
- 无新增 critical；high 级 12 条里多为 electron devDependency（tools/pqc-desktop，不部署）
- wasm-sm2 的 shift-out-of-range 是 AssemblyScript 生成代码的正常模式，需评估是否 dismiss

## 三、官网外网可达性 ⚠️ 部分异常

- **fibemate.net**：✅ 外网 200（首页 149.5KB，pqc-readiness 59.1KB，0.45s）
- **fibemate.link**：❌ 外网 TLS 握手被 RST 重置（curl (35) Recv failure: Connection was reset）
  - DNS 正常（解析到 [SERVER_IP_REDACTED]，与 .net 同 IP）
  - 443/80 端口 TCP 均通
  - 服务器本机 openssl 能正常握手拿到证书（CN=fibemate.link，2026-11-08 到期，正常）
  - **根因判定**：阿里云 ICP 备案墙拦截——`fibemate.net` 已备案，`fibemate.link` 未备案，省墙对未备案域名的 HTTPS 流量做 RST 重置（与 8/10 发现的「80 端口 Non-compliance ICP Filing 拦截页」同一根因）

## 结论

| 项 | 状态 |
|:---|:---|
| 阿里云服务器 | ✅ 正常 |
| fibemate.net 外网 | ✅ 200 |
| fibemate.link 外网 | ❌ 未备案被墙拦截（服务器侧正常） |
| GitHub dependabot | ⏳ open 45（减 9），无 critical |
| GitHub code scanning | ⏳ open 488（error 60），需决策 dismiss 范围 |

## 待办

1. fibemate.link 备案（或放弃该域名只保留 .net）
2. code scanning 60 条 error：分类决策（前端误报 / wasm-sm2 生成代码 / 真 bug）
3. dependabot 第二档 express 升级仍待定夺
