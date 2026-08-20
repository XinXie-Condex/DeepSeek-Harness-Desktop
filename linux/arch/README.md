# Arch Linux 包安装

在 **Arch Linux** 上推荐用系统包方式安装（使用系统 Electron + nodejs，
不用额外下载 Electron 运行时）：

```bash
git clone --branch linux https://github.com/ArKurt/DeepSeek-Harness-Desktop
cd DeepSeek-Harness-Desktop/linux/arch
makepkg -si
```

- 依赖：`electron`、`nodejs`、`gtk3`（Arch Linux 仓库均有）
- 安装后启动器：`deepseek` 或应用菜单中的 `DeepSeek`
- 数据目录：`~/.dsh`；日志：`~/.local/state/deepseek/server.log`

> 如果不想从 git 标签拉源码，也可以先在仓库根目录执行
> `linux/build-linux.sh --runtime-only --system-node`，
> 然后自行 `makepkg`（PKGBUILD 默认使用 `linux-v1.0.1` 标签）。
