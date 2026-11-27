<!--
前三行是强制的：Action / Evidence / Delta。
不适用就写 "none" 并说明原因。评审先读这三行，再看 diff。

Action   行为上改了什么（不是"更新了 X"）
Evidence 证明它的命令 / run id / 哈希 / 截图；"测试通过"不算证据，除非写出
         跑了哪些测试、结果是什么
Delta    动了多少：before → after；没有变化就写 none 和原因
-->

## Action

## Evidence

## Delta

---

## 摘要

<!-- 这个 PR 做了什么？为什么？ -->

## 类型

- [ ] 🐛 Bug fix
- [ ] ✨ New feature
- [ ] 📚 Documentation
- [ ] 🔧 Refactor
- [ ] ⚡ Performance
- [ ] 🧪 Test

## 影响模块

- [ ] ML-KEM
- [ ] SLH-DSA
- [ ] SM2/SM3/SM4
- [ ] FPGA
- [ ] Mobile
- [ ] TLS/网络
- [ ] 官网/文档
- [ ] CI/CD

## 测试验证

<!-- 命令 + 结果。不要只写"CI 全绿"。 -->

## 提交前检查

- [ ] 所有 commit 带 `Signed-off-by` trailer（PR 正文里写不算）
- [ ] 代码不含硬编码密钥/路径
- [ ] 测试已更新/新增，且能证明「删掉修复就会红」
- [ ] 性能改动附 before/after 基准（scripts/bench-pqc.js）
- [ ] 文档改动跑过 `node scripts/check-encoding.cjs`，字面量 grep 为 0 命中
