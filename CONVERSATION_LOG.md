# DeepSeek Desktop — 对话记录 / 交接日志

> 本文件按时间顺序记录用户需求与已执行动作，便于另一个 Agent 快速还原上下文。
> 项目根目录：`/Users/xiexin/Downloads/自制软件/DeepSeekApp`
> 远程仓库：`git@github.com:XinXie-Condex/DeepSeek-Harness-Desktop.git`

---

## 1. 初始需求
- 用户要求检查打包的 DeepSeek 桌面版应用潜在 bug。
- 提到“安装插件会导致崩溃”，怀疑是否因加了哈希校验导致。

## 2. 初步检查与定位
- 读取了 macOS 版源码：
  - `Sources/ServerManager.swift`
  - `Sources/main.swift`
  - `Sources/WebView.swift`
  - `Sources/Integrity.swift`
  - `Sources/Integrity.generated.swift`
- 读取了 Windows 版源码：
  - `windows/ServerManager.cs`
  - `windows/App.xaml.cs`
  - `windows/MainWindow.xaml.cs`
  - `windows/SplashWindow.xaml.cs`
  - `windows/DeepSeekDesktop.csproj`
- 发现哈希校验只检查 4 个文件，与插件安装无直接关系。
- 找到两个真实崩溃点：
  - 旧崩溃日志：`DeepSeek-2026-08-15-130404.ips`，`SplashView.body.getter` SIGTRAP
  - 新复现：`ServerManager.ensureServer()` 在后台线程发布 `@Published`，SwiftUI 在后台线程创建 `WKWebView` 导致 WebKit SIGTRAP

## 3. Mac 版修复（v1.0.1）
- `ServerManager` 加 `@MainActor`
- `AppDelegate` 启动任务改为 `Task { @MainActor in ... }`
- 重试按钮任务改为 `Task { @MainActor in ... }`
- `handleTerminationSignal()` 使用 `MainActor.assumeIsolated`
- `SplashView` 去掉逐字 `@State` 数组，改用 `line1Visible/line2Visible`
- 去掉 `FileManager.default.urls(...).first!`
- 版本号升到 1.0.1
- 构建验证：`./build.sh` 编译、签名、冒烟启动通过

## 4. Release / Tag 处理
- 提交并推送 `v1.0.1`，但被已有 Windows workflow 自动发布为 Windows Release。
- 用户指出 Windows 版发布被覆盖。
- 创建独立 `win-v1.0.1`，恢复 Windows Release。
- 统一 tag 命名：
  - `mac-v1.0.0`
  - `mac-v1.0.1`
  - `win-v1.0.0`
  - `win-v1.0.1`
- 删除旧的 `v1.0.0` / `v1.0.1`
- 更新 workflow：
  - `release-macos.yml` 触发 `mac-v*`
  - `release-windows.yml` 触发 `win-v*`
- 更新 README 中 tag 说明

## 5. Release 描述
- 用户发现 release list 里有 5 个版本，要求写每个版本的描述。
- 通过一次性 workflow 清理草稿 release，并为 4 个目标 release 写入描述：
  - `mac-v1.0.1`（最新 macOS）
  - `win-v1.0.1`（最新 Windows）
  - `mac-v1.0.0`（首个 macOS）
  - `win-v1.0.0`（首个 Windows）
- 一次性 workflow 已删除，不保留自动发布能力。

## 6. 插件安装教程
- 用户询问桌面版如何安装插件。
- 创建 `PLUGINS.md`，说明 `dsh plugin --profile web add ...`。
- README 增加插件教程入口。

## 7. Windows 版 Bug 报告
用户反馈三个问题：
1. 启动动画显示 `for Mac` 而不是 `for Windows`
2. 运行任务时沙箱报错
3. Windows 版没有最小化 / 最大化 / 关闭按钮

## 8. Windows 版修复（v1.0.2）
- `windows/SplashWindow.xaml.cs`：`Line2Text` 改为 `for Windows`
- `windows/README.md`：同步 `for Windows`、tag 规则、防篡改说明
- `windows/ServerManager.cs`：node 进程 stdout/stderr 重定向到 `%LOCALAPPDATA%\DeepSeek\server.log`
- `DeepSeekSetup.iss`：`PrivilegesRequired=lowest` → `admin`
- 检查 `windows/MainWindow.xaml`：当前源码为标准窗口样式，未发现 `WindowStyle="None"`；按钮缺失可能是旧包导致
- 版本号升到 1.0.2
- 推送 `win-v1.0.2` tag，GitHub Actions 已成功发布 Windows 1.0.2

## 9. 交接导出
- 创建 `HANDOFF.md`
- 创建本文件 `CONVERSATION_LOG.md`
- 创建 `CONTEXT_EXPORT.md`（如适用）
- 提交并推送 main

---

## 当前状态
- 最新 main：`44611e6`（Add handoff document for continuing work）
- 最新 Windows：`win-v1.0.2`（已发布）
- 最新 macOS：`mac-v1.0.1`（已发布）
- Tags：`mac-v1.0.0`、`mac-v1.0.1`、`win-v1.0.0`、`win-v1.0.1`、`win-v1.0.2`
