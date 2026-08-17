# DeepSeek Desktop — Windows 版

Windows 版桌面应用：C# WPF + WebView2 承载 DeepSeek Harness Web UI，效果与 macOS 版一致。

## ✨ 特性

- **原生窗口**：WPF + Microsoft Edge WebView2，无需浏览器
- **内置运行时**：自带 Node.js（Windows x64）与 `dsh` 包，自动启动本地服务
- **启动动画**：鲸鱼 logo + "DeepSeek Harness / for Windows" + by Condex（约 5 秒）
- **智能服务生命周期**：复用已在运行的服务器（默认端口 3080），退出时清理自己拉起的进程
- **防篡改**：macOS 版启动时校验关键文件哈希；Windows 版暂未实现

## 📦 分发形式

| 文件 | 说明 |
|------|------|
| `DeepSeek-Setup-1.0.1.exe` | Inno Setup 安装向导（装到 Program Files、桌面/开始菜单快捷方式、卸载程序） |
| `DeepSeek-Windows.zip` | 绿色版，解压即用 |

## 🔧 开发 / 构建

### GitHub Actions（推荐，自动构建）

- 推送 `windows/**` 改动 → `build-windows.yml` 自动构建（编译 + 下载 Node + `npm install` dsh + 冒烟测试 + 打包）
- 推送 `mac-v*` / `win-v*` 标签 → `release-windows.yml` 自动发布 Windows GitHub Release

### 本地构建

```powershell
cd windows
dotnet publish -c Release          # 需要 .NET 8 SDK
```

> 在非 Windows 环境交叉编译时，csproj 已开启 `EnableWindowsTargeting`。

### 手动组装运行时（CI 已自动化，仅供参考）

1. 下载 Node.js Windows x64 的 `node.exe`
2. `npm install @deepseek-ai/dsh` 到 `runtime/bundle/`（Windows 上会安装 win 版原生模块）
3. 目录结构：`runtime/node.exe` + `runtime/bundle/node_modules/...`

## ⚠️ 注意事项

- 需要 **Microsoft Edge WebView2 Runtime**（Windows 10/11 一般已预装；缺失时应用会提示）
- 数据目录：`%USERPROFILE%\.dsh`（与命令行 `dsh` 互通）
- 端口默认 3080，环境变量 `DSH_DESKTOP_PORT` 可修改
