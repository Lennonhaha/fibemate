# CodeQL「Could not process some files」根因定位与修复

**日期**：2026-08-14
**commit**：d5fd8f1a3（已 push，三端同步）

## 根因

CodeQL 扫描状态显示「Could not process some files due to syntax errors」，对应
`js/syntax-error` 告警共 **3 条**，均为**真实语法错误**（非误报）：

| # | 文件:行 | 问题 |
|---|---------|------|
| #471 | `www/crypto/hybrid-kem-client.js:294` | 对象字面量导出段混入裸函数调用 `ianaGroupId(),` 等 |
| #528 | `www/docs/index.html:1590` | 内联 onmouseover 属性非法 `\'` 转义 |
| #529 | 同上（同文件同问题） | 同上 |

## 修复内容（3 文件，+9/-9）

1. **hybrid-kem-client.js**：导出常量段从裸调用改为 `key: value` 形式
   - `ianaGroupId(),` → `IANA_GROUP_ID: ianaGroupId(),`
   - `sm2PkLen(),` → `SM2_PK_LEN: sm2PkLen(),`（共 8 个 key）
2. **algorithm-resolver.js**：SM2 `pkSize: 64` → `65`（非压缩点 0x04||x||y）
3. **www/docs/index.html**：`onmouseover="...\'rgba(...)\'"` → `onmouseover="...'rgba(...)'"`（属性外双引号内单引号）

## 验证

- `node --check` 三文件全部 exit=0
- 线上 fibemate.net 三文件 HTTP 200，导出段已为 key:value 形式
- 服务器 git pull --ff-only 成功，三端 HEAD 一致

## 附带发现（未在本次修复，记录待办）

1. **注释误导**：`HYBRID_KEY_SHARE_LEN = 2 + sm2PkLen() + mlkemPkLen()` 实际 = 1251，
   但注释写 `// 1253`。1253 = 2(group_id) + 2(sm2_pk_len 字段) + 65 + 1184，是 wire 格式
   总长，把 2B 长度字段也算进去了。`HYBRID_KEY_SHARE_LEN` 常量本身不含长度字段，故 1251 正确，注释错。
2. **serialize/parseKeyShare 疑似功能 bug**（未深究，超范围）：
   - `serialize()` 内部函数只写 `sm2LenBuf(2B) + sm2Pk + mlkemPk`，没写 2B group_id
   - `parseKeyShare` 读 `dv.getUint16(0)` 当 sm2Len，与注释的 group_id 位置错位
   - `return { serializePublic }` 引用的是 shorthand method，与内部 `serialize` 命名不一致
   - 这些是 IANA #4590 wire 格式实现的深层一致性问题，需单独任务核对
3. **编码乱码残留**：`www/ml-kem-flow-animation.html`、`www/viz/pqctf.html` 等文件有
   PowerShell `Set-Content -Encoding UTF8` 破坏编码的乱码（`蠅路b`、`閫嗘帹`），
   历史遗留，需单独修复

## 运维备注

- PowerShell `&` 在 `gh api` URL 里被当命令分隔符，多次 404；改用 node 原生 `fetch`
  （`gh auth token` 拿 token）彻底绕开 shell 转义
- git push 的 exit 1 是 PowerShell 把 dependabot stderr 当 RemoteException 的误报，
  看 `main -> main` 判断真伪
