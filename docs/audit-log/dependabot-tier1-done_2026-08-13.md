# Dependabot 第一档升级执行（ws/js-yaml/ip-address/underscore/mongoose）

## 日期
2026-08-13 19:30

## 执行内容
无痛升级 5 个生产依赖，全部纯 JS 包，无 native 编译。

### 根 package.json 改动
- `ws`: `^8.20.1` → `^8.21.0`（实际解析到 8.21.3）
- `mongoose`: `9.6.2` → `9.7.2`
- overrides 新增 `"ip-address": "10.3.1"`
- overrides `"js-yaml": "4.1.1"` → `"4.3.1"`

### www/package.json 改动
- `ws`: `^8.20.1` → `^8.21.0`
- overrides 新增 `"underscore": "1.13.8"`

## 验证结果
### 根目录
- ws 8.21.3 ✅ / js-yaml 4.3.1 ✅ / mongoose 9.7.2 ✅ / ip-address 10.3.1 ✅
- `npm audit --omit=dev`：8 条 → **5 条**（剩余 = express 传递的 qs/body-parser/path-to-regexp 第二档 + sm-crypto 已 dismissed）

### www 目录
- ws 8.21.3 ✅ / underscore 1.13.8 ✅（snarkjs→bfj→jsonpath 传递，override 生效）
- require 全部成功

## 关键环境坑（复用）
- 本机无 Visual Studio，`npm install` 会因 better-sqlite3 的 node-gyp rebuild 失败 → 必须加 `--ignore-scripts`
- 目标包全是纯 JS，`--ignore-scripts` 不影响版本锁定

## 剩余告警（第二档 + 第三档）
- 第二档（express 传递）：qs/body-parser/path-to-regexp，需 express 4.22.2（breaking minor）
- 第三档（8/31 后）：electron 28→39（31 条）+ brace-expansion（eslint/jake 工具链）
- sm-crypto critical：已 dismissed（inaccurate，仅 KAT 对比用）

## 未 commit
本地改动（package.json + package-lock.json ×2），等用户确认第二档后一起 commit + push。
