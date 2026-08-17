# DeepSeek Desktop — 工作交接文档

> 本文件用于在另一个 AI Agent / 开发者环境中无缝继续当前工作。
> 项目根目录：`/Users/xiexin/Downloads/自制软件/DeepSeekApp`
> 远程仓库：`git@github.com:XinXie-Condex/DeepSeek-Harness-Desktop.git`

---

## 1. 项目概览

- 软件名称：**DeepSeek Desktop**
- 类型：macOS + Windows 桌面应用
- macOS：SwiftUI + WKWebView
- Windows：C# WPF + WebView2
- 后端：内置 Node.js + `@deepseek-ai/dsh` 本地服务
- 数据目录：
  - macOS：`~/.dsh`
  - Windows：`%USERPROFILE%\.dsh`

---

## 2. 重要文件

| 平台 | 文件 | 说明 |
|---|---|---|
| macOS | `Sources/ServerManager.swift` | 本地服务器管理 |
| macOS | `Sources/main.swift` | App 入口、启动动画、主界面 |
| macOS | `Sources/WebView.swift` | WKWebView 包装 |
| macOS | `Sources/Integrity.swift` | SHA256 防篡改校验 |
| Windows | `windows/ServerManager.cs` | Windows 本地服务器管理 |
| Windows | `windows/App.xaml.cs` | 启动流程 |
| Windows | `windows/MainWindow.xaml` | 主窗口 |
| Windows | `windows/SplashWindow.xaml.cs` | 启动动画 |
| Windows | `DeepSeekSetup.iss` | Inno Setup 安装脚本 |
| 通用 | `PLUGINS.md` | 插件安装教程 |
| 通用 | `README.md` | 项目说明 |

---

## 3. 当前 Git 状态

- 分支：`main`
- 最新提交：`44611e6`（Add handoff document for continuing work）
- 工作区：clean（待提交 HANDOFF/CONTEXT_EXPORT/CONVERSATION_LOG 除外，按后续动作决定）

### Tags

| Tag | 指向 | 说明 |
|---|---|---|
| `mac-v1.0.0` | `71c0466` | macOS 1.0.0 |
| `mac-v1.0.1` | `3072221` | macOS 1.0.1 |
| `win-v1.0.0` | `44791d7` | Windows 1.0.0 |
| `win-v1.0.1` | `5e42125` | Windows 1.0.1 |
| `win-v1.0.2` | `df93af7` | Windows 1.0.2 |

### Releases

- `mac-v1.0.1`：macOS 最新，含 `DeepSeek-1.0.1.dmg`
- `win-v1.0.2`：Windows 最新，含 `DeepSeek-Setup-1.0.2.exe`、`DeepSeek-Windows.zip`
- `mac-v1.0.0`：macOS 旧版，有描述但 DMG 资产已丢失
- `win-v1.0.0`、`win-v1.0.1`：Windows 旧版

---

## 4. 已完成的修复

### macOS 1.0.1
- `ServerManager` 加 `@MainActor`，避免后台线程发布 `@Published` 导致 `WKWebView` 崩溃。
- `SplashView` 动画重构，避免逐字 `@State` 数组崩溃。
- 去掉强制解包。
- 版本号 1.0.1。

### Windows 1.0.2
- 启动动画 `for Mac` → `for Windows`。
- Windows README 同步修正。
- Windows 服务器日志写入 `%LOCALAPPDATA%\DeepSeek\server.log`。
- 安装器 `PrivilegesRequired=admin`。
- 版本号 1.0.2。

---

## 5. 已知问题 / 待办

1. **mac-v1.0.0 DMG 资产丢失**
   - 之前删除旧 tag `v1.0.0` 时，GitHub 移除了原 release 资产。
   - 可重新构建 `mac-v1.0.0` 的 DMG 并上传。

2. **Windows 沙箱报错**
   - 已加服务器日志，但尚未拿到实际报错。
   - 需要用户复现后查看 `%LOCALAPPDATA%\DeepSeek\server.log`。
   - 确保 Windows 包由 Windows 环境构建，不能直接用 Mac 的 node_modules。

3. **主窗口按钮**
   - 当前源码 `MainWindow.xaml` 为标准窗口样式。
   - 若发布包仍无按钮，可能是旧包或安装异常，需检查实际构建产物。

---

## 6. 构建命令

```bash
cd /Users/xiexin/Downloads/自制软件/DeepSeekApp

# macOS
./build.sh

# Windows（在 Windows + .NET 8 环境）
cd windows
dotnet publish -c Release
```

---

## 7. 建议给下一个 Agent 的提示词

> 继续维护 `/Users/xiexin/Downloads/自制软件/DeepSeekApp`。
> 先读取 `HANDOFF.md` / `CONTEXT_EXPORT.md` / `CONVERSATION_LOG.md` 了解当前状态。
> 重点：
> 1. 如果用户仍遇到 Windows 沙箱报错，查看 `%LOCALAPPDATA%\DeepSeek\server.log` 并定位。
> 2. 如果需要 mac-v1.0.0 历史 DMG，重建并上传。
> 3. 保持 tag 命名规则：`mac-v*` 对应 macOS，`win-v*` 对应 Windows。
