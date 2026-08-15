# FIBEMATE Tauri 桌面软件检查与升级（2026-08-15）

## 目标
本机已下载的 FIBEMATE Tauri 桌面软件做「检查 + 升级」。

## 检查结论

### 本机已安装版本
- **FIBEMATE 2.20.0**（Electron 技术栈，`FIBEMATE.exe` 168.62 MB，构建于 2026-05-16）
- 安装位置：`d:\Users\maivs\AppData\Local\Programs\FIBEMATE\`（注意在 **D 盘**，非 C 盘）
- 注册表卸载项：`HKCU\...\Uninstall`，DisplayName "FIBEMATE 2.20.0"，Publisher "FIBEMATE Team"
- exe FileVersion/ProductVersion 显示 28.3.3（Electron 内部 Chromium 版本号，非应用版本）

### Tauri 源码项目
- 位置：`D:\FIBEMATE\fibemate-tauri\`（另有两个相同内容的旧备份：`D:\Backup\FIBEMATE_2026-07-26\` 与 `D:\FIBEMATE\Desktop_fibemate_moved\`）
- 版本：**3.0.0**（`tauri.conf.json` + `Cargo.toml` 均确认）
- identifier：`com.fibemate.app`（⚠️ 构建时 Tauri 警告 `.app` 结尾与 macOS bundle 冲突，Windows 无影响）
- 技术栈：Tauri 2（`@tauri-apps/cli ^2`，tauri 2.11.2），bundle 目标 nsis
- 前端：`src/` 目录（纯静态 HTML/JS，含 crypto/zk/privacy-layers 等模块，main-v3.js 93KB 为主入口）
- Rust 侧 PQC 依赖：`rustpq 0.3`（mlkem768 + mldsa65）、x25519-dalek、aes-gcm、SM2（num-bigint）

### 版本关系
- 已安装 2.20.0 = 旧 **Electron** 版
- 源码 3.0.0 = 新 **Tauri** 版（技术栈迁移 Electron→Tauri）
- 版本号跳 3 个大版本，本质是「技术栈重写 + 版本升级」

### 构建环境（齐全）
- rustc 1.95.0 / cargo 1.95.0
- node v22.22.3 / npm 10.9.8
- tauri-cli 2.11.2

## 升级执行

### 构建过程
1. `cargo check`：通过（Finished dev profile 1m01s，无编译错误）
2. `npx tauri build`（release，含 lto=fat + opt-level=z + codegen-units=1）：
   - release 编译 5m36s 完成
   - NSIS 打包成功

### 产物
- **安装包**：`D:\FIBEMATE\fibemate-tauri\src-tauri\target\release\bundle\nsis\FIBEMATE_3.0.0_x64-setup.exe`
- 大小：**56.56 MB**（对比 Electron 版 168.62 MB，缩小 66%）
- 时间：2026-08-15 16:17:23
- 版本：3.0.0

## 关键结论
1. 本机旧版是 Electron 2.20.0，源码已是 Tauri 3.0.0，二者技术栈不同。
2. Tauri 3.0.0 之前从未产出过 release 安装包，本次是首次成功构建。
3. 升级 = 用新产出的 56.56MB Tauri 安装包替换旧的 168.62MB Electron 安装。

## 待用户拍板
- 是否立即运行安装包替换旧 2.20.0（覆盖用户现有应用，属外部影响操作）
  - 静默安装：NSIS `/S` 参数；或用户自行双击安装包
- 升级前是否先备份旧版（旧 Electron 2.20.0 已无法从源码重建，若要回退需保留）

## 环境坑
- PowerShell 把 cargo/tauri 的 stderr 当 RemoteException 报 exit 1，实际构建成功（看 "Finished" / "Finished 1 bundle" 那行判真伪）
- 仓库 main 分支无 Tauri 源码（仅 public/assets/tauri.svg 图标），Tauri 项目独立在 D 盘
- identifier `.app` 结尾触发 macOS bundle 警告，Windows 构建可忽略
