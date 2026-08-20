# Linux 启动修复 — 验证摘要

本文件是三轮无头交叉验证的**精炼结论**。原始过程文档保留在 fork 的
`debian-ubuntu-test-plan` 分支，不随 PR 提交，避免把内部审查过程摊给上游审阅者。

## 1. 修复的问题

niri / 纯 Wayland 合成器上，DeepSeek 桌面版出现「欢迎屏一闪，进程退出」。
根因有三层：

1. Linux Electron 默认在最后一个 `BrowserWindow` 关闭时退出进程；
2. 旧启动流程先关欢迎屏、再创建主窗口，中间经过 0 窗口状态；
3. 异常退出后残留的 Chromium `SingletonLock` 会让第二次启动命中单实例锁而立即退出。

## 2. 代码修复

| 修复 | 位置 |
|------|------|
| 先创建主窗口，再关闭欢迎屏，启动流程不再经过 0 窗口状态 | `src/main.js` |
| `window-all-closed` 保持空 handler，只拦截 Electron 默认退出，不主动 `app.quit()`；崩溃后「重新启动」可以在零窗口窗口期重建欢迎屏 | `src/main.js` |
| `runStartup()` / `showStartupErrorAndMaybeRetry()` 在退出竞态下不再复活窗口；对话框关闭后若已进入退出流程，补发一次 `app.quit()` | `src/main.js` |
| Electron 43 的 ozone 只能走 CLI：所有启动器统一附加 `--ozone-platform=x11`，用户追加 `--ozone-platform=wayland` 可覆盖 | `package.json`、`install-linux.sh`、`arch/deepseek.sh` |
| AppImage / Arch 启动器先解析 XDG 目录，再清理已死进程的 `Singleton*`；PID 必须为纯数字才 `kill -0` | `install-linux.sh`、`arch/deepseek.sh` |
| AppImage 启动器 `unset ELECTRON_RUN_AS_NODE`，避免 shell 环境把 Electron 当 Node 启动 | `install-linux.sh`、`arch/deepseek.sh` |

## 3. 验证证据

### 3.1 niri 实机（实现方记录，未在无头审查中独立复现）

Arch + niri，`--user-data-dir=/tmp/dsh-niri-retest`、`DSH_DESKTOP_PORT=3098`、
`--ozone-platform=x11`：

1. 主窗口 `DeepSeek Harness`，`app-id=deepseek`，进程 cmdline 含
   `--ozone-platform=x11`，窗口 PID 落在 `xwayland-satellite`。
2. kill `bin.js web --port 3098` 后 Electron 未退出，弹出「本地服务已停止」，
   按钮「重新启动 / 退出」。
3. 触发「重新启动」后：Electron PID 不变；`dsh` 以新 PID 重新监听 3098；
   主窗口以新 id 恢复（Window ID 16，Workspace 1）。
4. 关闭主窗口后 Electron exit 0，3098 无监听。

自承缺口：欢迎屏 `skipTaskbar`，重启过程中没有单独截到欢迎屏；只证明进程未退、
服务重建、主窗口恢复。

### 3.2 自动测试

`npm test` 覆盖 `window-state` 读写与 `ServerManager` 崩溃事件；窗口生命周期
退出竞态暂无自动化用例，仍依赖代码走查与实机记录。

## 4. 已知限制（记录在案，不阻塞合并）

- Singleton 锁清理存在 TOCTOU / PID 复用窗口，未做成原子操作。
- 系统 prefix 安装且 HOME 只读时，启动器不会回退到 prefix 数据目录。
- niri 可能把新窗口放到其他 workspace，`skipTaskbar` 欢迎屏在任务栏不可见；
  README 已给排查命令和窗口规则。
- 直跑二进制（tar.gz 的 `./deepseek`、`.deb` 的 PATH `deepseek` 或
  `/opt/DeepSeek/deepseek`、不经 wrapper 的 AppImage）不带 `--ozone-platform=x11`，
  Wayland 会话需手动附加，README 已说明。

## 5. 对第 3 轮审查 F7 的更正

第 3 轮报告曾建议把 `desktopName` 从 package.json 顶层挪进 `build.linux`。
经核对 electron-builder 26.15.3 源码：`desktopName` 应保持 **package.json 顶层**
（`Metadata.desktopName`），electron-builder 用它生成 `.desktop` 文件名并推导
`StartupWMClass` / app-id。该建议不采纳，原配置保持正确。

## 6. 发布前检查单

- [ ] 重新构建 AppImage / tar.gz / deb 三种产物。
- [ ] `grep Exec /usr/share/applications/deepseek.desktop` 确认含
      `--ozone-platform=x11`。
- [ ] 重装 deb 后跑 `deepseek --smoke-test`，并核对 stdout 出现
      `DSH_SMOKE_CLEAN`（只看退出码不够：命中单实例锁时也返回 0）。
- [ ] 打 `linux-v*` 标签前确认 release workflow 的资产列表包含 `.deb`。
