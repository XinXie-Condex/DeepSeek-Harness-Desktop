# DeepSeek Desktop 项目交接文档

> 本文件用于把当前工作状态交接给另一个 Agent 继续处理。

## 项目路径

- 仓库根目录：`/Users/xiexin/Downloads/自制软件/DeepSeekApp`
- 在 bash 中建议用通配符避免中文路径编码问题：
  ```bash
  cd /Users/xiexin/Downloads/自*软件/DeepSeekApp
  ```
- 远程仓库：`git@github.com:XinXie-Condex/DeepSeek-Harness-Desktop.git`

## 当前 Git 状态

- 分支：`main`
- HEAD：`df93af7`（Bump Windows version to 1.0.2）
- 工作区：clean

### Tags

| Tag | 指向 | 说明 |
|---|---|---|
| `mac-v1.0.0` | `71c0466` | macOS 1.0.0 |
| `mac-v1.0.1` | `3072221` | macOS 1.0.1 |
| `win-v1.0.0` | `44791d7` | Windows 1.0.0 |
| `win-v1.0.1` | `5e42125` | Windows 1.0.1 |
| `win-v1.0.2` | `df93af7` | Windows 1.0.2（最新） |

### Releases

- `mac-v1.0.0`：macOS 1.0.0（描述已补，但 DMG 资产已丢失，需重新构建可再上传）
- `mac-v1.0.1`：macOS 1.0.1（含 DMG：`DeepSeek-1.0.1.dmg`）
- `win-v1.0.0`：Windows 1.0.0（含 exe/zip）
- `win-v1.0.1`：Windows 1.0.1（含 exe/zip）
- `win-v1.0.2`：Windows 1.0.2（含 exe/zip，GitHub Actions 已成功发布）

## 已完成的修复

### macOS 1.0.1

1. `ServerManager` 改为 `@MainActor`
   - 避免 `@Published` 在后台线程发布导致 SwiftUI 在非主线程创建 `WKWebView` 崩溃。
2. `SplashView` 动画重构
   - 去掉逐字 `@State` 数组，改用 `line1Visible/line2Visible` 布尔状态 + 逐字 `.animation(.delay(...))`。
3. 去掉 `FileManager.default.urls(...).first!` 强制解包。
4. 版本号升到 1.0.1。

### Windows 1.0.2

1. 启动动画 `for Mac` → `for Windows`
   - 文件：`windows/SplashWindow.xaml.cs`
2. Windows README 同步修正
   - `for Windows`
   - tag 规则 `mac-v* / win-v*`
   - 防篡改说明改为 macOS-only
3. Windows 服务器日志
   - 文件：`windows/ServerManager.cs`
   - node 进程 stdout/stderr 重定向到 `%LOCALAPPDATA%\DeepSeek\server.log`
   - 便于排查沙箱报错
4. 安装器权限
   - 文件：`DeepSeekSetup.iss`
   - `PrivilegesRequired=lowest` → `PrivilegesRequired=admin`

## 已知问题 / 待办

1. **mac-v1.0.0 DMG 资产丢失**
   - 之前删除旧 tag `v1.0.0` 时，GitHub 把原 release 资产移除。
   - 目前 `mac-v1.0.0` 只有描述，没有 DMG。
   - 如果需要，可用对应 commit 重新跑 `./build.sh` 生成 DMG 并上传。

2. **Windows 沙箱报错**
   - 已加服务器日志，但尚未拿到实际报错文本。
   - 需要用户复现任务，并查看：
     `%LOCALAPPDATA%\DeepSeek\server.log`
   - 若沙箱模块缺失，需确保 Windows 包是在 Windows 环境 `npm install @deepseek-ai/dsh` 构建的，不能用 Mac 的 node_modules 直接拷贝。

3. **主窗口按钮**
   - 当前源码 `windows/MainWindow.xaml` 是标准窗口样式，未发现 `WindowStyle="None"`。
   - 如果发布包仍无最小化/最大化/关闭按钮，需检查构建/安装的 exe 是否来自旧包。

## 常用命令

```bash
# 进入项目
cd /Users/xiexin/Downloads/自*软件/DeepSeekApp

# 查看状态
git status
git log --oneline -10
git tag --list

# macOS 构建
./build.sh

# Windows 本地构建（需要 Windows + .NET 8）
cd windows
dotnet publish -c Release
```

## 注意事项

- `Sources/Integrity.generated.swift` 是 build.sh 自动生成的，已在 `.gitignore` 中，不要手动提交。
- 当前 release 命名规则：
  - `mac-v*` → macOS
  - `win-v*` → Windows
- Windows 自动发布由 `.github/workflows/release-windows.yml` 负责，触发 `win-v*` tag。
- macOS 自动发布由 `.github/workflows/release-macos.yml` 负责，触发 `mac-v*` tag。
