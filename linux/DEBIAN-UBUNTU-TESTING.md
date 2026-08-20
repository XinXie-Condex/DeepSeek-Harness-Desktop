# Debian / Ubuntu 测试计划

> 状态：本指南已随 `linux` 分支进入 PR #5，测试仍可在任意 Debian / Ubuntu
> 环境继续执行。原始三轮无头交叉验证过程文档保留在 fork 的
> `debian-ubuntu-test-plan` 分支，不进入 PR。

## 目标

验证 Linux 桌面版在 Debian / Ubuntu 上的安装与运行，并打出 `.deb`。
AppImage / tar.gz 冒烟是基线；`.deb` 通过后再把打包目标合进 `linux`。

## 测试矩阵

| 发行版 | 优先测试项 |
|--------|------------|
| Debian 13 | tar.gz 冒烟、AppImage 冒烟、GUI、apt 安装 .deb（当前实机） |
| Debian 12 | tar.gz 冒烟、AppImage 冒烟、GUI 启动、本地构建 .deb |
| Ubuntu 22.04 | tar.gz 冒烟、AppImage 冒烟、GUI 启动 |
| Ubuntu 24.04 | tar.gz 冒烟、AppImage 冒烟、GUI 启动 |

## 1. 获取测试产物

PR 的 **Build Linux** 工作流 Artifacts `DeepSeek-Linux` 中包含：

- `DeepSeek-1.0.1-x86_64.AppImage`
- `DeepSeek-1.0.1-x64.tar.gz`
- `DeepSeek-1.0.1-amd64.deb`

本地构建（Arch / CachyOS 构建机需要 fpm 的 libcrypt.so.1 兼容库；不要把
`.so.1` 软链到 `.so.2`）：

```bash
sudo pacman -S libxcrypt-compat
# 若暂时不能 sudo：从官方仓库解出 libxcrypt-compat，构建时设置
# LD_LIBRARY_PATH=<extract>/usr/lib

git clone --branch linux https://github.com/ArKurt/DeepSeek-Harness-Desktop
cd DeepSeek-Harness-Desktop/linux
./build-linux.sh --runtime-only
./build-linux.sh --skip-runtime
# 产物含 AppImage、tar.gz、DeepSeek-1.0.1-amd64.deb
```

不要在 2 核 / 4GB 的 Debian 测试 VM 上跑完整 `build-linux.sh`。

Arch 上现场编译的 `node-pty` 会链到本机 glibc（CachyOS 为 2.42）。Debian 13 是 glibc 2.41，
装上后冒烟会报 `GLIBC_2.42 not found`。发往 Debian/Ubuntu 的包应在
`ubuntu-latest`（或同等旧 glibc）上组装 runtime；本机验证时可把 CI/发行版
产物里的 `node-pty/build/Release/pty.node` 换进 `linux/runtime` 后再打 `.deb`。

## 2. 安装运行时依赖

Debian 12 / Ubuntu 22.04：

```bash
sudo apt-get update
sudo apt-get install -y libfuse2 libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 \
  libatspi2.0-0 libuuid1 libsecret-1-0 libgbm1 libasound2 libxkbcommon0 libdrm2 xvfb
```

Debian 13 / Ubuntu 24.04（t64 包名）：

```bash
sudo apt-get update
sudo apt-get install -y libfuse2t64 libgtk-3-0t64 libnotify4 libnss3 libxss1 libxtst6 \
  libatspi2.0-0t64 libuuid1 libsecret-1-0 libgbm1 libasound2t64 libxkbcommon0 libdrm2 xvfb
```

## 3. 无头冒烟测试

### tar.gz 版

```bash
tar -xzf DeepSeek-1.0.1-x64.tar.gz
cd DeepSeek-1.0.1-x64

xvfb-run -a env DSH_DESKTOP_PORT=3099 DSH_DESKTOP_HOME=/tmp/dsh-debian-smoke \
  ./deepseek --smoke-test --no-sandbox --disable-gpu
```

### AppImage 版

electron-builder 26 内嵌的 AppImage 运行时只拦截 `--appimage-*`，其余参数原样
透传给应用，`--smoke-test` 和 `--ozone-platform=x11` 都不需要 `--` 分隔（FUSE
直跑与 `APPIMAGE_EXTRACT_AND_RUN=1` 两条路径均已实测输出 `DSH_SMOKE_CLEAN`）。
更老的 AppImage 运行时会对未知长选项报 `bad option` 并退出 9；加 `--` 分隔的写法
在两种运行时下都安全，可作为保险写法：

```bash
chmod +x DeepSeek-1.0.1-x86_64.AppImage

xvfb-run -a env DSH_DESKTOP_PORT=3099 DSH_DESKTOP_HOME=/tmp/dsh-debian-smoke \
  ./DeepSeek-1.0.1-x86_64.AppImage --no-sandbox --disable-gpu -- --smoke-test
```

> 冒烟必须核对 stdout 里的 `DSH_SMOKE_CLEAN`。退出码不足以判定成功：命中单实例锁
> （本机已有 DeepSeek 在跑）时 `--smoke-test` 会直接 `app.quit()`，同样返回 0。

FUSE 不可用时：

```bash
APPIMAGE_EXTRACT_AND_RUN=1 \
  ./DeepSeek-1.0.1-x86_64.AppImage --no-sandbox --disable-gpu -- --smoke-test
```

通过标准：

- 输出 `DSH_SMOKE_READY port=3099 reused=false`
- 输出 `DSH_SMOKE_CLEAN`
- 退出码 `0`

## 4. GUI 实机测试

```bash
DSH_DESKTOP_HOME=/tmp/dsh-gui ./deepseek --ozone-platform=x11
```

检查点：

1. 启动动画结束后出现主窗口，可以输入 API / 加载对话。
2. 关闭窗口后服务被清理：`pgrep -af 'bin.js web'` 为空。
3. 日志在 `${XDG_STATE_HOME:-~/.local/state}/deepseek/server.log`。
4. 若 `3080` 端口已有服务，桌面版复用且退出时不关闭它，属预期行为。
5. niri / 纯 Wayland 上欢迎屏闪退后进程退出是已知问题（`linux` 已修）；Debian 13 + Xfce/X11 上发行版 AppImage 可正常切到主窗口。

中文界面缺字（小方块）时安装 `fonts-noto-cjk fonts-noto-color-emoji`。

### 4A. niri / Wayland 崩溃重启复测记录

实现方在 Arch + niri 上使用当前 `main.js`（含 `quitting` 守卫）、
`--user-data-dir=/tmp/dsh-niri-retest`、`DSH_DESKTOP_PORT=3098`、
`--ozone-platform=x11` 跑过：

1. 启动后主窗口 `DeepSeek Harness`，`app-id=deepseek`，XWayland（进程 cmdline
   含 `--ozone-platform=x11`，窗口 PID 落在 `xwayland-satellite`）。
2. `kill` 掉 `bin.js web --port 3098` 后 Electron 未退出；弹出标题 `DeepSeek`、
   文案「本地服务已停止」的浮动窗，按钮「重新启动 / 退出」。
3. 对对话框发送 Return（默认「重新启动」）后：Electron PID 不变；`dsh` 以新
   PID 重新监听 3098；主窗口新 id（当时 `Window ID 16`，Title
   `DeepSeek Harness`，Workspace 1）。
4. 关闭该主窗口后 Electron exit 0，3098 无监听。

自承缺口：欢迎屏 `skipTaskbar`，重启过程中没有单独截到鲸鱼欢迎屏；只证明进程
未退、服务重建、主窗口回来。该记录未在无头审查中独立复现。

## 5. 安装 .deb（推荐：Arch 构建，Debian 只装）

用户级 AppImage 启动器 `~/.local/bin/deepseek` 会抢 PATH。装 .deb 前先卸掉：

```bash
cd linux
./install-linux.sh --uninstall
```

若菜单里 DeepSeek 没有图标：多半是卸载后留下了
`~/.local/share/icons/hicolor/icon-theme.cache`。删掉该文件，或重新跑一次
带图标缓存刷新的 `install-linux.sh --uninstall`，然后注销/重开一次菜单。

然后：

```bash
sudo apt install -y ./dist/DeepSeek-1.0.1-amd64.deb

xvfb-run -a env DSH_DESKTOP_PORT=3099 DSH_DESKTOP_HOME=/tmp/dsh-deb-smoke \
  deepseek --no-sandbox --disable-gpu --smoke-test
```

检查系统菜单与可执行文件：

```bash
grep Exec /usr/share/applications/deepseek.desktop
# 期望包含：/opt/DeepSeek/deepseek --ozone-platform=x11 %U
ls -l /usr/bin/deepseek /opt/DeepSeek/deepseek
```

GUI 实机（Wayland 会话）：

```bash
DSH_DESKTOP_HOME=/tmp/dsh-deb-gui deepseek --ozone-platform=x11
```

按 §4 的 5 个检查点执行。会话数据仍是 `~/.dsh`。

卸载：

```bash
sudo apt remove deepseek-harness-desktop
```

## 6. 后续收尾

- `.deb` 已进入 Build Linux 工作流与 Release 资产；`linux` 分支的 CI 会在
  ubuntu-latest 上构建并安装 `.deb` 后跑 packaged smoke。
- 需要长期覆盖多发行版时，可增加 Docker 容器矩阵：`ubuntu:22.04`、
  `ubuntu:24.04`、`debian:12`、`debian:13`，每个容器执行
  “`apt install ./...deb` → `deepseek --smoke-test`”。
