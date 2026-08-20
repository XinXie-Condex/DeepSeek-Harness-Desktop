#!/bin/sh
# DeepSeek Desktop (Arch Linux 包版本) 启动器。
# 应用代码装在 /opt/deepseek/app，dsh bundle 装在 /opt/deepseek/runtime/bundle，
# Node 使用系统 nodejs，Electron 使用 Arch 官方 electron 包。
unset ELECTRON_RUN_AS_NODE
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/DeepSeek"
if [ -L "$CONFIG_DIR/SingletonLock" ]; then
  lock_target=$(readlink "$CONFIG_DIR/SingletonLock" 2>/dev/null || true)
  lock_pid=${lock_target##*-}
  case "$lock_pid" in
    ''|*[!0-9]*) ;;
    *)
      if ! kill -0 "$lock_pid" 2>/dev/null; then
        rm -f "$CONFIG_DIR/SingletonLock" \
              "$CONFIG_DIR/SingletonCookie" \
              "$CONFIG_DIR/SingletonSocket"
      fi
      ;;
  esac
fi
# Electron 43 只认 --ozone-platform；后续参数可覆盖（例如 --ozone-platform=wayland）。
exec /usr/bin/electron --ozone-platform=x11 /opt/deepseek/app "$@"
