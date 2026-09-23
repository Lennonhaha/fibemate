## 目标
新增 tools/pqc-compat-check.cjs：ML-KEM 序列化兼容性检测器。

## 背景
packages/pqc-kem 同时存在 JS 纯实现、C native（node-gyp/node-addon-api）、WASM/Rust 多套实现。跨实现、跨版本的字节级表示若因编码约定差异（hex/base64/base64url/raw、填充）不一致，会导致互操作故障。

## 功能
- check <fileA> <fileB>：比较两个产物文件（或 --hex 直接比 hex），归一化后字节级比对
- sizes：打印 FIPS 203 ML-KEM-512/768/1024 标准密钥尺寸参考表
- 检测项：字节长度是否命中标准尺寸、编码格式、归一化后字节是否一致
- 退出码：0 = 兼容（字节一致）；1 = 不兼容（长度/内容漂移）

## 验证
- 同值用例 exit 0 / 异值用例 exit 1 已实测通过
- 尺寸表与 FIPS 203 官方参数一致（512: pk800/sk1632/ct768；768: pk1184/sk2400/ct1088；1024: pk1568/sk3168/ct1568；ss 均 32）

## 说明
SPDX GPL-3.0-only 头已加；纯只读工具，不修改任何文件。