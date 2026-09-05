name: Pull Request
description: 提交代码变更
labels: [needs-review]
body:
  - type: markdown
    attributes:
      value: |
        ## 变更描述
  - type: textarea
    id: summary
    attributes:
      label: 摘要
      description: 这个 PR 做了什么？为什么？
    validations:
      required: true
  - type: dropdown
    id: type
    attributes:
      label: 类型
      options:
        - 🐛 Bug fix
        - ✨ New feature
        - 📚 Documentation
        - 🔧 Refactor
        - ⚡ Performance
        - 🧪 Test
    validations:
      required: true
  - type: dropdown
    id: module
    attributes:
      label: 影响模块
      multiple: true
      options:
        - ML-KEM
        - SLH-DSA
        - SM2/SM3/SM4
        - FPGA
        - Mobile
        - TLS/网络
        - 官网/文档
        - CI/CD
  - type: textarea
    id: testing
    attributes:
      label: 测试验证
      description: 如何验证这个变更？
  - type: checkboxes
    id: checklist
    attributes:
      label: 提交前检查
      options:
        - label: CI pipeline 全绿
        - label: 所有 commit 已 `git commit -s`（Signed-off-by / DCO）
        - label: 代码不含硬编码密钥/路径
        - label: 测试已更新/新增
        - label: 若为性能改动，已附 before/after 基准数据（scripts/bench-pqc.js）