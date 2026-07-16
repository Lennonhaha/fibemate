# 快速开始

## 环境要求

- Node.js ≥ 18
- npm ≥ 9
- Git

## 克隆并运行

```bash
git clone https://github.com/Lennonhaha/fibemate.git
cd fibemate
npm install
npm run build        # 构建所有模块
npm test             # 运行测试
```

## 本地开发

```bash
npm run dev          # 开发模式
npm run test:sm2     # SM2 TVLA 测试
npm run test:mlkem   # ML-KEM KAT 测试
```

## 访问直播服务

- 官网: https://fibemate.net
- PQC 就绪状态: https://fibemate.net/docs/pqc-readiness.html
- LookingGlass v2.2: https://fibemate.net/crypto/lgv2/

## 相关链接

- [pqc-readiness.html](../pqc-readiness.html) - 完整 PQC 就绪状态
- [docs/tla/C2.tla](../docs/tla/C2.tla) - TLA+ 形式化验证规格
