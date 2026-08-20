# DeepSeek Desktop — Linux 版

Linux 桌面壳：Electron + 内置 Node.js/dsh 运行时，自动拉起 `dsh web` 并用
Chromium 窗口承载 Web UI。开发与测试环境为 **Arch Linux**。

## ✨ 特性

- Electron 原生窗口，无浏览器依赖（Chromium 内置在 Electron 运行时中）
- 内置 Node.js v24 + `dsh` 包，启动时自动拉起本地服务
- 启动动画：鲸鱼 logo + "DeepSeek Harness / for Linux" + by Condex（约 5.2 秒）
- 单实例锁：重复启动会聚焦已打开的窗口
- 智能服务生命周期：端口已有服务则复用，退出时只清理自己拉起的进程
- 服务异常恢复：已就绪的本地服务意外退出时弹窗提示，可一键重新启动
- 窗口状态记忆：记住上次的位置、大小和最大化状态，显示器拔插后自动回到可见区域
- 加载失败兜底：界面连续加载失败后弹窗提供重试，不再无限静默刷新
- 防篡改：启动时校验 `runtime/integrity.json` 中关键文件的 SHA256
- 数据互通：与命令行 `dsh` 共用 `~/.dsh`
- 日志：`${XDG_STATE_HOME:-~/.local/state}/deepseek/server.log`

## 📦 分发形式

| 文件 | 说明 |
|------|------|
| `DeepSeek-1.0.1-x86_64.AppImage` | 开箱即用 AppImage（内置 Electron + Node + dsh） |
| `DeepSeek-1.0.1-x64.tar.gz` | 解压后运行 `./deepseek` 的绿色版 |
| `DeepSeek-1.0.1-amd64.deb` | Debian / Ubuntu 系统包，apt 安装后生成菜单项 |
| Arch PKGBUILD | Arch Linux 系统包，使用系统 electron + nodejs |

GitHub Actions 产物与 Release 中文件名以实际构建为准。

## 🔧 开发 / 构建

```bash
# 1. 组装运行时（下载 Node v24 + 安装 dsh；Linux 会现场编译 node-pty）
cd linux
./build-linux.sh --runtime-only

# 2. 本机开发运行（使用系统 electron）
DSH_DESKTOP_DEV=1 electron --ozone-platform=x11 .

# 3. 打 AppImage + tar.gz + deb（需要网络下载 Electron）
./build-linux.sh --skip-runtime
```

### 仅本机快速使用

```bash
cd linux
./build-linux.sh --runtime-only --system-node
DSH_DESKTOP_DEV=1 electron --ozone-platform=x11 .
```

> 构建路径若包含空格，`build-linux.sh` 会自动在无空格临时目录创建符号链接
> 继续构建（产物仍写回原目录），无需手动搬迁项目；`mktemp` 不可用时才需要
> 把项目放到无空格路径。

### AppImage 一键安装（当前机器）

```bash
cd linux
./install-linux.sh                  # 用户安装到 ~/.local，应用菜单会出现 DeepSeek
# sudo ./install-linux.sh --prefix /usr/local   # 或安装到系统目录
./install-linux.sh --uninstall      # 卸载
```

安装脚本默认使用 `dist/` 下版本号最新的 AppImage；也可以显式指定
`--appimage dist/DeepSeek-*.AppImage`。它只安装启动器、图标和 `.desktop`
文件，不会改动 AppImage 内部的 runtime，因此不会触发防篡改校验。

### Debian / Ubuntu 安装

```bash
sudo apt install -y ./dist/DeepSeek-1.0.1-amd64.deb
# 安装后可执行：deepseek，或从应用菜单打开 DeepSeek
```

### Arch Linux 包安装

```bash
cd linux/arch
makepkg -si
# 或使用仓库提供的 AppImage
```

## ⚙️ 环境变量

- `DSH_DESKTOP_PORT`：目标端口，默认 `3080`
- `DSH_DESKTOP_HOME`：dsh 数据目录，默认 `~/.dsh`
- `DSH_DESKTOP_NODE`：自定义 Node 可执行文件（优先于内置 node）
- `DSH_DESKTOP_RUNTIME`：自定义 runtime 目录（包含 `bundle/.../bin.js`）
- `DSH_DESKTOP_DEV=1`：开发模式（跳过完整性清单、显示开发者工具菜单）

Linux 启动器默认附加 `--ozone-platform=x11`（走 XWayland）。Electron 43 已忽略
`ELECTRON_OZONE_PLATFORM_HINT`。若要原生 Wayland：`deepseek --ozone-platform=wayland`。
直跑二进制不带该标志，需手动加上：tar.gz 的 `./deepseek`、`.deb` 装完后
PATH 上的 `deepseek` 与 `/opt/DeepSeek/deepseek`、以及不经
`install-linux.sh` wrapper 的 AppImage。

## Wayland / niri / noctalia

在 **niri**（以及 Noctalia 这类 bar）上，欢迎屏闪一下然后“消失”通常不是崩溃，而是下面几件事叠在一起：

1. **Linux Electron 默认会在最后一个窗口关闭时退出。** 旧逻辑先关欢迎屏再创建主窗口，中间 0 个窗口，进程直接退出。现在会先建主窗口再关欢迎屏，并用空的 `window-all-closed` 拦截默认退出，避免服务崩溃点「重新启动」时被同步误杀。
2. **niri 可能把新窗口开到别的 workspace。** 欢迎屏 `skipTaskbar`，Noctalia 任务栏上看不到；主窗口若落在 workspace 3，当前屏就会像闪退。可切 workspace，或运行：
   ```bash
   niri msg windows | rg -i deepseek
   ```
3. **点第二次立刻退出：** 单实例锁还在（上一次进程没清干净）。AppImage / Arch 启动器会在解析完 XDG 目录后，清掉已死进程（PID 为纯数字且 `kill -0` 失败）的 `Singleton*`；也可先 `pkill -x deepseek` 再开。
4. **窗口规则：** `.desktop` 的 `StartupWMClass=deepseek`，niri 里 `app-id` 是 `deepseek`。需要的话可在 `~/.config/niri/config.kdl` 加：
   ```kdl
   window-rule {
       match app-id="deepseek"
       open-maximized false
   }
   ```

日志：`${XDG_STATE_HOME:-~/.local/state}/deepseek/server.log`。

## ⚠️ 注意事项

- 插件与命令行共用 `~/.dsh/profiles/web`，详见仓库根目录 `PLUGINS.md`
- 不要用 `kill -9` 直接杀主进程；正常退出会走 SIGTERM → SIGKILL 清理进程组
- AppImage 若无法启动，可尝试 `./DeepSeek-*.AppImage --appimage-extract-and-run`
