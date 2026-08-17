# DeepSeek Desktop

把 DeepSeek Harness Web UI 打包成原生桌面应用，同时支持 **macOS** 与 **Windows** 双平台。
无需浏览器、无需手动配置环境：应用内置 Node 运行时与 `dsh` 包，双击即用，
自动拉起本地服务，用原生 WebView 承载完整界面。

## ✨ 特性（双版本一致）

- **原生窗口**：macOS = Swift + SwiftUI + WKWebView；Windows = C# WPF + WebView2
- **内置运行时**：自带 Node.js + `dsh` 包，自动启动本地服务，无需安装任何环境
- **启动动画**：鲸鱼 logo + "DeepSeek Harness / for Mac" + 作者署名 **by Condex**
- **智能服务生命周期**：复用已在运行的服务器，退出时干净清理、不留后台进程
- **防篡改**：启动时校验关键文件哈希，内容被改动即拒绝运行
- **数据互通**：与命令行 `dsh` 共用数据目录，两边互相同步

## 💻 平台支持

| 平台 | 技术栈 | 安装包 | 系统要求 |
|------|--------|--------|----------|
| macOS | Swift + SwiftUI + WKWebView | `.dmg`（拖入即装） | Apple Silicon，macOS 15+ |
| Windows | C# WPF + WebView2 | `.exe` 安装器 / `.zip` 绿色版 | Windows 10/11 x64 |

## ⬇️ 下载安装

两个版本都发布在 **GitHub Releases**：
<https://github.com/XinXie-Condex/DeepSeek-Harness-Desktop/releases>

### macOS

1. 下载最新的 `DeepSeek.Harness.dmg`
2. 双击挂载，把 `DeepSeek.app` 拖入「应用程序」
3. 首次打开若提示「无法验证开发者」：右键 →「打开」即可（本地 ad-hoc 签名，属正常现象）

### Windows

1. 下载 `DeepSeek-Setup-1.0.2.exe`（安装向导，推荐）或 `DeepSeek-Windows.zip`（绿色版）
2. 安装向导：一路 Next 即可；绿色版：解压后双击 `DeepSeek.exe`
3. 需要系统已安装 **Microsoft Edge WebView2 Runtime**（Windows 10/11 一般已自带）

## 🚀 使用

- 双击启动：先播放启动动画（约 5 秒），同时后台拉起本地服务，随后自动进入 DeepSeek 界面
- 端口默认 `3080`，可用环境变量 `DSH_DESKTOP_PORT` 修改
- 已在运行的服务器会被直接复用；退出应用时只清理由应用自己拉起的服务

## 🧩 安装插件

桌面版与命令行 `dsh` 共用 `web` profile 的插件体系，给 `web` profile 安装的插件会被桌面版加载。

完整教程见：[PLUGINS.md](PLUGINS.md)


## 🛡️ 防篡改

- 启动时自校验关键文件（应用配置、图标、启动素材、`dsh` 启动脚本）的 SHA256，
  与构建时不一致即弹出警告并拒绝启动
- macOS 另可用 `codesign --verify DeepSeek.app` 检测包内文件是否被改动

## 🔧 从源码构建

### macOS（本机构建）

```bash
./make-icon.sh          # 生成图标（只需一次）
./build.sh              # 编译 + 捆绑运行时 + 签名 + 出 DMG
./build.sh --install    # 并安装到 /Applications
```

需要：Xcode 命令行工具 + Node.js。

### Windows（自动构建 / 本地构建）

`windows/` 目录为 Windows 版源码（C# WPF + WebView2），构建已完全自动化：

- 推送 `windows/**` 改动 → `.github/workflows/build-windows.yml` 自动构建，
  产出 `DeepSeek-Windows.zip` + `DeepSeek-Setup-1.0.2.exe`（Actions Artifacts）
- 推送 `mac-v*` / `win-v*` 标签 → 对应工作流自动发布 GitHub Release（macOS: `release-macos.yml`，Windows: `release-windows.yml`）
- 本地构建：`cd windows && dotnet publish -c Release`（需 .NET 8 SDK + `EnableWindowsTargeting`）

## 📁 目录结构

```
Sources/         macOS 版 Swift 源码
Resources/       macOS 版资源（图标、启动素材）
windows/         Windows 版 C# WPF 源码（详见 windows/README.md）
.github/         GitHub Actions 流水线（自动构建 + 自动发布）
```

## 📦 数据

会话、凭据等数据与命令行 `dsh` 共用：
- macOS：`~/.dsh`
- Windows：`%USERPROFILE%\.dsh`

## 🤝 参与

- 发现 Bug 或有建议：欢迎提 Issue / Discussion
- 官方 DeepSeek Harness 仓库的桌面发行版方案（macOS）：见仓库 `desktop/macos-release` 分支
