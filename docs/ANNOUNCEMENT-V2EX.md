# FIBEMATE — V2EX 公告草稿
**版本：** v0.1 (2026-08-05)
**状态：** 草稿，待 8/30 微调后发布
**发布日：** 2026-08-31 09:00 CST
**节点：** /t/cryptography 或 /t/programming

---

## 【开源】FIBEMATE：全栈后量子密码工程验证平台

后量子密码学（PQC）正在成为现实，但 NIST 标准文档与可运行代码之间的距离，对大多数工程师来说仍然很远。

**FIBEMATE** 是一个全栈后量子密码工程验证平台——不是生产级库，而是一份透明的工程记录。

### 实现了什么

- **ML-KEM-768**（FIPS 203）：完整 NTT 实现，附 KAT 向量和常数时间验证
- **ML-DSA-65**（FIPS 204）：参考实现，与 @noble/post-quantum 字节级对齐
- **SLH-DSA-128s**（FIPS 205）：无状态基于哈希的签名
- **SM2 / SM3 / SM4**（GB/T）：国密椭圆曲线 + 哈希 + 分组密码套件
- **FPGA 硬件**：Artix-7 Verilog RTL 实现含 BRAM 仿真
- **TLS 1.3 混合 KEM**：X25519 + ML-KEM768 混合握手，完整实现
- **双棘轮协议**：后量子增强 Signal 协议，含 TLA+ 形式化模型

### 26 个交互式可视化

每一个算法都有在线可视化页面：3D 密钥生成流程、LWE 攻击难度地形图、TVLA 侧信道测试仪表盘、TLS 握手序列图、格密码安全对比、FPGA 热力图，全部在 fibemate.net 上可直接运行。

### 100 份时间戳存证（TSR）

每一项声明都对应可运行的测试 + DigiCert/FreeTSA 双机构时间戳存证，完整证据链公开可查。

### 诚实地说明局限性

这不是一份完美的宣传稿，而是一份诚实的工程报告：

- ML-KEM-768 是纯 JS 实现——足够理解原理，不是生产级性能
- SM2 验证的侧信道测试：遮掩实现 TVLA PASS，但纯 JS 实现非常数时间
- LookingGlass 协议：形式化验证完成，但尚未作为标准协议部署
- 完整硬件侧信道测试（ChipWhisperer）待物理设备

所有局限性均已文档化。不美化，不掩饰。

### 为什么做这个

一个人花了两年时间，把后量子密码学从数学公式变成可运行的代码、Web 可视化和 FPGA 比特流。不是为了替代 liboqs，是为了理解 PQC 的每一个细节。

**GPL-3.0-only 开源，无 VC，无企业背书。**

- GitHub：https://github.com/Lennonhaha/fibemate
- 官网：https://fibemate.net
- Release：https://github.com/Lennonhaha/fibemate/releases/tag/v3.3.0
- 安全报告：https://github.com/Lennonhaha/fibemate/security/policy

欢迎提问、反馈与协作。

---

## 草稿笔记

**V2EX 特点：**
- 中文社区，更注重"为什么做"而非技术细节
- 可以比 HN 更个人化一些（"一个人花了两年"）
- 不做竞品比较，只陈述事实
- 字数约 400-500 中文字（V2EX 帖子通常比 HN 长）

**发布时间：** 8/31 09:00 CST（HN 发布后约 30 分钟）
