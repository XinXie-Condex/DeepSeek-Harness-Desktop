# DeepSeek Desktop 插件安装教程

DeepSeek Desktop 是 DeepSeek Harness Web UI 的本地桌面外壳。它启动的是 `dsh web`，
并且与命令行 `dsh` 共用同一份用户数据：

- macOS：`~/.dsh`
- Windows：`%USERPROFILE%\.dsh`
- Linux：`~/.dsh`

插件也安装在用户数据目录里，**不会修改 `.app` / 安装目录中的文件**，因此不会触发
桌面版启动时的 SHA256 防篡改校验。

---

## 1. 工作原理

桌面版启动本地服务器时，加载的是 `web` profile：

```text
macOS:   ~/.dsh/profiles/web
Windows: %USERPROFILE%\.dsh\profiles\web
Linux:   ~/.dsh/profiles/web
```

所以只要给 `web` profile 安装插件，重新启动桌面版后就会自动加载。

`dsh plugin` 命令底层调用 `pnpm`，因此需要先安装 pnpm。

---

## 2. 前置条件：安装 pnpm

```bash
npm install -g pnpm
```

验证：

```bash
pnpm -v
```

> Windows 如果提示找不到命令，请重启终端，或确认 npm 的全局 bin 目录已加入 `PATH`。

---

## 3. macOS 安装插件

### 3.1 使用桌面版内置的 dsh（推荐）

```bash
/Applications/DeepSeek.app/Contents/Resources/runtime/node \
  /Applications/DeepSeek.app/Contents/Resources/runtime/bundle/node_modules/@deepseek-ai/dsh/lib/bin.js \
  plugin --profile web add <插件包名>
```

示例：

```bash
# 从 npm 安装
/Applications/DeepSeek.app/Contents/Resources/runtime/node \
  /Applications/DeepSeek.app/Contents/Resources/runtime/bundle/node_modules/@deepseek-ai/dsh/lib/bin.js \
  plugin --profile web add @example/dsh-plugin

# 安装本地插件目录
/Applications/DeepSeek.app/Contents/Resources/runtime/node \
  /Applications/DeepSeek.app/Contents/Resources/runtime/bundle/node_modules/@deepseek-ai/dsh/lib/bin.js \
  plugin --profile web add ./my-plugin
```

### 3.2 如果已经安装了命令行 dsh

```bash
dsh plugin --profile web add <插件包名>
```

---

## 4. Windows 安装插件

### 4.1 安装版（默认安装到 Program Files）

PowerShell：

```powershell
$node = "$env:ProgramFiles\DeepSeek\runtime\node.exe"
$bin = "$env:ProgramFiles\DeepSeek\runtime\bundle\node_modules\@deepseek-ai\dsh\lib\bin.js"

& $node $bin plugin --profile web add <插件包名>
```

CMD：

```bat
set NODE="%ProgramFiles%\DeepSeek\runtime\node.exe"
set BIN="%ProgramFiles%\DeepSeek\runtime\bundle\node_modules\@deepseek-ai\dsh\lib\bin.js"

%NODE% %BIN% plugin --profile web add <插件包名>
```

### 4.2 绿色版（zip 解压版）

把路径替换成你的解压目录，例如：

```powershell
$node = "D:\DeepSeek\runtime\node.exe"
$bin = "D:\DeepSeek\runtime\bundle\node_modules\@deepseek-ai\dsh\lib\bin.js"

& $node $bin plugin --profile web add <插件包名>
```

### 4.3 如果已经安装了命令行 dsh

```powershell
dsh plugin --profile web add <插件包名>
```

---

## 4A. Linux（Arch Linux）安装插件

AppImage / tar.gz 版内置 Node 与 dsh，`--appimage-extract-and-run` 或绿色版的目录结构为
`runtime/node` + `runtime/bundle/...`；Arch 包版使用系统 `node`。

### 4A.1 Arch 包版（推荐）

```bash
dsh plugin --profile web add <插件包名>
```

### 4A.2 AppImage / tar.gz 版

```bash
# AppImage：先解包到 /tmp/deepseek-squashfs
./DeepSeek-*.AppImage --appimage-extract-and-run  # 运行一次
# 或
./DeepSeek-*.AppImage --appimage-extract
# 然后用解出的 runtime 执行：
<解包目录>/squashfs-root/resources/runtime/node \
  <解包目录>/squashfs-root/resources/runtime/bundle/node_modules/@deepseek-ai/dsh/lib/bin.js \
  plugin --profile web add <插件包名>
```

> 注意：AppImage 的解包目录是只读的，插件实际安装在 `~/.dsh`，不会写入解包目录。

---

## 5. 常用插件管理命令

```bash
# 安装
dsh plugin --profile web add <插件包名>

# 卸载
dsh plugin --profile web remove <插件包名>

# 更新
dsh plugin --profile web update <插件包名>

# 查看依赖
dsh plugin --profile web list
```

使用桌面版内置 dsh 时，把上面的 `dsh` 替换成：

```text
<runtime/node> <runtime/bundle/node_modules/@deepseek-ai/dsh/lib/bin.js>
```

---

## 6. 安装后如何生效

1. 完全退出桌面版应用。
2. 重新打开桌面版。
3. 桌面版会重新启动 `dsh web`，并加载 `web` profile 中的插件。

可以在 Web UI 的“设置 → 插件”页面查看插件清单和状态。

也可以直接查看配置文件：

- macOS/Linux：`~/.dsh/profiles/web/package.json`
- Windows：`%USERPROFILE%\.dsh\profiles\web\package.json`

只有声明了 `dsh.bundle` 的插件才会作为 profile 插件层自动加载；普通 npm 依赖会安装成功，
但不会自动激活。

---

## 7. 故障排查

### 7.1 桌面版启动失败 / 页面打不开

- 查看服务器日志：
  - macOS：`~/Library/Application Support/DeepSeek/server.log`
  - Windows：`%LOCALAPPDATA%\DeepSeek\server.log`
  - Linux：`${XDG_STATE_HOME:-~/.local/state}/deepseek/server.log`
- 先临时移除刚安装的插件，确认是否是插件本身导致 `dsh web` 崩溃：

```bash
dsh plugin --profile web remove <插件包名>
```

### 7.2 插件装上了但不生效

- 确认插件安装在 `web` profile 里，而不是其他 profile。
- 确认插件包声明了 `dsh.bundle`（查看插件的 `package.json`）。
- 完全退出桌面版后重新打开，不要只刷新页面。

### 7.3 是否会影响防篡改校验

不会。插件安装在 `~/.dsh`（Windows 为 `%USERPROFILE%\.dsh`），
桌面版的防篡改校验只检查应用包内文件，不会检查用户数据目录。

---

## 8. 自定义数据目录 / 端口

桌面版默认使用真实用户数据目录和 `3080` 端口。可以通过环境变量覆盖：

- `DSH_DESKTOP_HOME`：自定义 dsh 数据目录。
- `DSH_DESKTOP_PORT`：自定义端口。
- Linux 另支持 `DSH_DESKTOP_NODE` / `DSH_DESKTOP_RUNTIME`，见 `linux/README.md`。

例如 macOS：

```bash
DSH_DESKTOP_HOME=/tmp/dsh-test DSH_DESKTOP_PORT=3090 \
  /Applications/DeepSeek.app/Contents/MacOS/DeepSeek
```

> 使用自定义 `DSH_DESKTOP_HOME` 后，插件应安装到该目录对应的 `profiles/web`。
