## 摘要

修正 `www/docs/pqc-readiness.html` 中两处事实性错误。

## 改动一：§2.5.1 安全模型表 ROM/QROM 引用有误

原表引用了两篇不匹配/不存在的文献：

| 行 | 原引用 | 更正为 |
|---|---|---|
| ROM | Schäge et al., ACM CCS 2024 | Huguenin-Dumittan & Vaudenay, EUROCRYPT 2022 |
| QROM | Bergmann et al., ePrint 2025/xxx（悬空占位符） | Zhou et al., ASIACRYPT 2024；Chen et al., ePrint 2025/1748 |

同时修正"关键结论"段落：原句称"已有 ROM 和 QROM 两个层次的完整形式化安全证明作为理论支撑"，实为把外部学术成果误述为 FIBEMATE 自研。现改为：FIBEMATE 已完成协议属性级形式化验证（TLA+ 状态机验证密钥管理属性，属工程正确性验证）；ROM/QROM 密码学安全性依赖外部学术成果，非 FIBEMATE 自研归约证明。

表尾新增更正注（对事：引用编号有误/未核实，现更正）。

## 改动二：路径 A（TLS 层 X25519MLKEM768 NamedGroup）状态误标

原表将路径 A 标为"✅ Active 2026-07-17"，但生产服务器 OpenSSL 为 3.0.13，不支持 oqs-provider（需 3.2+），TLS 层混合握手无法终止。现更正为"⚠️ 实验性/未上线（待 OpenSSL 3.2+）"，与页面既有 Q&A（"当前运行 TLS 1.3 经典 X25519/ECDH，不具备抗量子能力"）对齐。

## 核验

- 字节级：UTF-8 无 BOM、U+FFFD = 0
- 四处缺陷标记（`Bergmann 2025/xxx`、`Schäge CCS 2024`、`✅ Active 2026-07-17`、`完整形式化安全证明`）已清零
