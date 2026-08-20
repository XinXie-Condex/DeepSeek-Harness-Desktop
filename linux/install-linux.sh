#!/usr/bin/env bash
# ============================================================
# DeepSeek Desktop — Linux AppImage 安装 / 卸载脚本
#
# 用户安装（默认，无需 root）：
#   ./install-linux.sh
#
# 系统安装（可选）：
#   sudo ./install-linux.sh --prefix /usr/local
#
# 指定 AppImage / 安装目录 / 卸载：
#   ./install-linux.sh --appimage dist/DeepSeek-1.0.1-x86_64.AppImage
#   ./install-linux.sh --prefix /opt/deepseek
#   ./install-linux.sh --uninstall [--prefix ...]
#
# 说明：脚本只复制文件到 prefix，并安装 .desktop 启动项与图标，
#       不触碰应用自身的 runtime（防篡改清单因此不会失效）。
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

DEFAULT_PREFIX="$HOME/.local"
PREFIX="${PREFIX:-$DEFAULT_PREFIX}"
APPIMAGE=""
UNINSTALL=0

while [ $# -gt 0 ]; do
  case "$1" in
    --prefix=*) PREFIX="${1#*=}"; shift ;;
    --prefix) PREFIX="${2:?错误：--prefix 需要一个目录参数}"; shift 2 ;;
    --appimage=*) APPIMAGE="${1#*=}"; shift ;;
    --appimage) APPIMAGE="${2:?错误：--appimage 需要一个文件参数}"; shift 2 ;;
    --uninstall) UNINSTALL=1; shift ;;
    -h|--help)
      sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "未知参数: $1"
      exit 2
      ;;
  esac
done

mkdir -p "$PREFIX"
PREFIX="$(cd "$PREFIX" && pwd)"
BIN_DIR="$PREFIX/bin"
LIB_DIR="$PREFIX/lib/deepseek"
APP_DIR="$PREFIX/share/applications"
ICON_BASE="$PREFIX/share/icons/hicolor"
INSTALLED_APPIMAGE="$LIB_DIR/deepseek.AppImage"

if [ "$UNINSTALL" = "1" ]; then
  echo "==> 卸载 DeepSeek Desktop"
  rm -f "$BIN_DIR/deepseek" "$APP_DIR/deepseek.desktop" "$INSTALLED_APPIMAGE"
  for size in 16 32 48 64 128 256 512; do
    rm -f "$ICON_BASE/${size}x${size}/apps/deepseek.png"
  done
  if command -v update-desktop-database >/dev/null 2>&1 && [ -d "$APP_DIR" ]; then
    update-desktop-database "$APP_DIR" >/dev/null 2>&1 || true
  fi
  # 删掉 PNG 后必须刷新/丢掉用户级 icon cache，否则 GTK 会继续解析到已删除的路径，
  # 系统级 .deb 图标（/usr/share/icons/hicolor）也显示不出来。
  if command -v gtk-update-icon-cache >/dev/null 2>&1 && [ -d "$ICON_BASE" ]; then
    gtk-update-icon-cache -f "$ICON_BASE" >/dev/null 2>&1 || rm -f "$ICON_BASE/icon-theme.cache"
  else
    rm -f "$ICON_BASE/icon-theme.cache"
  fi
  echo "已卸载（目录未删除，以免误删其他文件）"
  exit 0
fi

if [ -z "$APPIMAGE" ]; then
  APPIMAGE="$(ls -1 dist/DeepSeek-*.AppImage 2>/dev/null | sort -V | tail -n 1 || true)"
fi
if [ -z "$APPIMAGE" ]; then
  echo "错误：dist/ 下没有 AppImage。请先运行："
  echo "  ./build-linux.sh --skip-runtime"
  echo "或用 --appimage=/path/to/AppImage 指定已有产物。"
  exit 1
fi
if [ ! -f "$APPIMAGE" ]; then
  echo "错误：找不到 AppImage: $APPIMAGE"
  exit 1
fi
chmod +x "$APPIMAGE"

echo "==> 安装 DeepSeek Desktop"
echo "    AppImage: $APPIMAGE"
echo "    Prefix:   $PREFIX"

# AppImage 放在 lib/deepseek/，bin/deepseek 是启动器：
# - 有 /dev/fuse 时直接挂载运行（最快）；没有 FUSE 的环境自动解包运行，
#   保证最小化/容器化的 Arch Linux 环境也能启动。
# - HOME 只读时（只读快照/容器），把配置与 dsh 数据落到 prefix 下，
#   避免 Chromium 写不进 ~/.config 导致窗口一闪而过。
install -Dm755 "$APPIMAGE" "$INSTALLED_APPIMAGE"
mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/deepseek" <<EOF
#!/bin/sh
unset ELECTRON_RUN_AS_NODE
if [ ! -w "\${HOME:-/}" ] && [ -w "$PREFIX" ]; then
  export XDG_CONFIG_HOME="\${XDG_CONFIG_HOME:-$PREFIX/config}"
  export XDG_STATE_HOME="\${XDG_STATE_HOME:-$PREFIX/state}"
  export DSH_DESKTOP_HOME="\${DSH_DESKTOP_HOME:-$PREFIX/data}"
  mkdir -p "\$XDG_CONFIG_HOME" "\$XDG_STATE_HOME" "\$DSH_DESKTOP_HOME"
fi
CONFIG_DIR="\${XDG_CONFIG_HOME:-\$HOME/.config}/DeepSeek"
if [ -L "\$CONFIG_DIR/SingletonLock" ]; then
  lock_target=\$(readlink "\$CONFIG_DIR/SingletonLock" 2>/dev/null || true)
  lock_pid=\${lock_target##*-}
  case "\$lock_pid" in
    ''|*[!0-9]*) ;;
    *)
      if ! kill -0 "\$lock_pid" 2>/dev/null; then
        rm -f "\$CONFIG_DIR/SingletonLock" \\
              "\$CONFIG_DIR/SingletonCookie" \\
              "\$CONFIG_DIR/SingletonSocket"
      fi
      ;;
  esac
fi
# Electron 43 只认命令行 --ozone-platform；环境变量 ELECTRON_OZONE_PLATFORM_HINT 无效。
if [ -e /dev/fuse ]; then
  exec "$INSTALLED_APPIMAGE" --ozone-platform=x11 "\$@"
fi
exec /usr/bin/env APPIMAGE_EXTRACT_AND_RUN=1 "$INSTALLED_APPIMAGE" --ozone-platform=x11 "\$@"
EOF
chmod 755 "$BIN_DIR/deepseek"

for size in 16 32 48 64 128 256 512; do
  install -Dm644 "assets/icons/${size}x${size}.png" \
    "$ICON_BASE/${size}x${size}/apps/deepseek.png"
done
# 用户级 hicolor 目录一般没有 index.theme，gtk-update-icon-cache 会直接失败。
# 那种情况下把可能存在的旧 cache 删掉，否则 GTK 会继续用陈旧索引，新图标不显示。
# 与卸载分支保持同一套处理。
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -f "$ICON_BASE" >/dev/null 2>&1 || rm -f "$ICON_BASE/icon-theme.cache"
else
  rm -f "$ICON_BASE/icon-theme.cache"
fi

DESKTOP_FILE="$APP_DIR/deepseek.desktop"
mkdir -p "$APP_DIR"
cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=DeepSeek
GenericName=DeepSeek Harness
Comment=DeepSeek Harness Web UI 的本地桌面壳
Exec="$BIN_DIR/deepseek" %U
Icon=deepseek
Terminal=false
Categories=Utility;
StartupWMClass=deepseek
StartupNotify=true
Keywords=DeepSeek;AI;Harness;
EOF

if command -v desktop-file-validate >/dev/null 2>&1; then
  desktop-file-validate "$DESKTOP_FILE"
fi
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APP_DIR" >/dev/null 2>&1 || true
fi

echo "安装完成。启动："
echo "  $BIN_DIR/deepseek"
echo "应用菜单中也会出现 DeepSeek。"
