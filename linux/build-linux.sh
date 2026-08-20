#!/usr/bin/env bash
# ============================================================
# DeepSeek Desktop — Linux 版构建脚本
#
# 用法：
#   ./build-linux.sh                    # 组装 runtime + 打 AppImage/tar.gz/deb
#   ./build-linux.sh --runtime-only     # 只组装 runtime（开发/Arch PKGBUILD 用）
#   ./build-linux.sh --system-node      # 用系统 node 构建/运行（Arch 包推荐）
#   ./build-linux.sh --node /path/node  # 指定 Node 二进制（会复制进 runtime）
#   ./build-linux.sh --skip-runtime     # 复用已有 runtime，只打 Electron 包
#   ./build-linux.sh --skip-npm-install # 复用已有 node_modules（仅本机快速重试）
#
# 可覆盖变量：
#   NODE_VERSION    默认 v24.19.0（与 macOS/Windows 版本一致）
#   DSH_VERSION     默认 0.1.0-rc.6
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"
LINUX_DIR="$PWD"
# 用物理路径（pwd -P）解析仓库根：空格路径自愈迁移后 $PWD 是符号链接，
# 逻辑上的上级目录是临时目录，而图标等资源在真实仓库根下。
REPO_ROOT="$(dirname "$(pwd -P)")"
VERSION="1.0.1"
NODE_VERSION="${NODE_VERSION:-v24.19.0}"
DSH_VERSION="${DSH_VERSION:-0.1.0-rc.6}"

RUNTIME_DIR="$LINUX_DIR/runtime"
BUNDLE_DIR="$RUNTIME_DIR/bundle"
BUILD_DIR="$LINUX_DIR/build"
DIST_DIR="$LINUX_DIR/dist"
NPM_CACHE="${NPM_CONFIG_CACHE:-$BUILD_DIR/npm-cache}"

DO_RUNTIME=1
DO_ELECTRON=1
DO_NPM_INSTALL=1
USE_SYSTEM_NODE=0
NODE_BIN_ARG=""

for arg in "$@"; do
  case "$arg" in
    --runtime-only) DO_ELECTRON=0 ;;
    --system-node) USE_SYSTEM_NODE=1 ;;
    --skip-runtime) DO_RUNTIME=0 ;;
    --skip-npm-install) DO_NPM_INSTALL=0 ;;
    --node)
      echo "错误：--node 需要一个路径参数"
      exit 2
      ;;
    --node=*) NODE_BIN_ARG="${arg#*=}" ;;
    *)
      echo "未知参数: $arg"
      exit 2
      ;;
  esac
done

# ---------------------------------------------------------------------------
# 空格路径自愈：旧版 node-gyp 生成的 Makefile 不会转义路径，带空格的构建路径
# 可能导致编译失败。检测到空格时，自动在无空格临时目录建一个指向本目录的
# 符号链接并重新执行本脚本，所有构建产物仍通过符号链接写回原目录。
# DSH_RELOCATED 防止 TMPDIR 本身含空格时无限重进。
# ---------------------------------------------------------------------------
if [[ -z "${DSH_RELOCATED:-}" && "$PWD" == *" "* ]]; then
  echo "==> 检测到构建路径包含空格：$PWD"
  echo "==> 自动切换到无空格临时路径继续构建（产物仍写入原目录）"
  RELOC_DIR="$(mktemp -d "${TMPDIR:-/tmp}/dsh-build.XXXXXX")" || {
    echo "错误：无法创建无空格临时目录。请把项目放到无空格路径后重试。"
    exit 1
  }
  RELOC_LINK="$RELOC_DIR/build"
  if ! ln -s "$LINUX_DIR" "$RELOC_LINK"; then
    echo "错误：无法在 $RELOC_DIR 创建符号链接。"
    echo "请把项目放到无空格路径，或用 BUILDDIR 指定无空格目录后运行 makepkg。"
    exit 1
  fi
  echo "==> 重新在 $RELOC_LINK 下执行：build-linux.sh $*"
  cd "$RELOC_LINK"
  exec env DSH_RELOCATED=1 bash "$RELOC_LINK/build-linux.sh" "$@"
fi

export NPM_CONFIG_CACHE="$NPM_CACHE"
export NPM_CONFIG_FUND=false
export NPM_CONFIG_AUDIT=false
export ELECTRON_CACHE="$BUILD_DIR/electron-cache"
export ELECTRON_BUILDER_CACHE="$BUILD_DIR/electron-builder-cache"
# 容器/只读 HOME 环境也能构建：Electron 下载缓存放进 build/。
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$BUILD_DIR/xdg-cache}"
mkdir -p "$BUILD_DIR" "$NPM_CACHE"

# ---------------------------------------------------------------------------
# 选择 Node
# ---------------------------------------------------------------------------
if [ "$DO_RUNTIME" = "1" ]; then
  if [ -n "$NODE_BIN_ARG" ]; then
    RUNTIME_NODE="$NODE_BIN_ARG"
    COPY_NODE=1
  elif [ "$USE_SYSTEM_NODE" = "1" ]; then
    RUNTIME_NODE="$(command -v node)"
    COPY_NODE=0
  else
    NODE_TARBALL="node-$NODE_VERSION-linux-x64.tar.xz"
    NODE_URL="https://nodejs.org/dist/$NODE_VERSION/$NODE_TARBALL"
    NODE_ARCHIVE="$BUILD_DIR/$NODE_TARBALL"
    NODE_EXTRACT="$BUILD_DIR/node-$NODE_VERSION-linux-x64"
    if [ ! -x "$NODE_EXTRACT/bin/node" ]; then
      echo "==> 下载 Node $NODE_VERSION"
      curl -fL --retry 3 -o "$NODE_ARCHIVE" "$NODE_URL"
      rm -rf "$NODE_EXTRACT"
      tar -xf "$NODE_ARCHIVE" -C "$BUILD_DIR"
    fi
    RUNTIME_NODE="$NODE_EXTRACT/bin/node"
    COPY_NODE=1
  fi

  if [ ! -x "$RUNTIME_NODE" ]; then
    echo "错误：找不到可执行的 Node: $RUNTIME_NODE"
    exit 1
  fi
  echo "==> 使用 Node: $RUNTIME_NODE ($("$RUNTIME_NODE" --version))"

  # 优先使用所选 Node 自带的 npm，保证原生模块 ABI 与内置 node 一致。
  NPM_CLI="$(dirname "$RUNTIME_NODE")/../lib/node_modules/npm/bin/npm-cli.js"
  if [ ! -f "$NPM_CLI" ]; then
    NPM_CLI="$(command -v npm)"
  fi
  if [ ! -f "$NPM_CLI" ] && [ ! -x "$NPM_CLI" ]; then
    echo "错误：找不到 npm CLI"
    exit 1
  fi
  echo "==> 使用 npm: $NPM_CLI"
else
  RUNTIME_NODE=""
  NPM_CLI="$(command -v npm || true)"
fi

# ---------------------------------------------------------------------------
# 组装 runtime
# ---------------------------------------------------------------------------
if [ "$DO_RUNTIME" = "1" ]; then
  echo "==> 清理旧 runtime"
  rm -rf "$RUNTIME_DIR"
  mkdir -p "$BUNDLE_DIR"

  if [ "$COPY_NODE" = "1" ]; then
    echo "==> 复制 Node 运行时"
    cp "$RUNTIME_NODE" "$RUNTIME_DIR/node"
    chmod 755 "$RUNTIME_DIR/node"
    for license in LICENSE LICENSE.txt; do
      [ -f "$(dirname "$RUNTIME_NODE")/../$license" ] && \
        cp "$(dirname "$RUNTIME_NODE")/../$license" "$RUNTIME_DIR/$license" || true
    done
  else
    echo "==> 使用系统 Node（不复制到 runtime）"
  fi

  echo "==> 安装 dsh 包 ($DSH_VERSION，Linux 原生模块将现场编译)"
  cat > "$BUNDLE_DIR/package.json" <<PKG
{
  "name": "dsh-bundle",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "@deepseek-ai/dsh": "$DSH_VERSION"
  },
  "allowScripts": {
    "node-pty": true,
    "@deepseek-ai/dsh-subprocess-local": true
  }
}
PKG
  (
    cd "$BUNDLE_DIR"
    if [ -f "$NPM_CLI" ]; then
      "$RUNTIME_NODE" "$NPM_CLI" install --omit=dev --no-audit --no-fund
    else
      "$NPM_CLI" install --omit=dev --no-audit --no-fund
    fi
  )

  if [ ! -f "$BUNDLE_DIR/node_modules/@deepseek-ai/dsh/lib/bin.js" ]; then
    echo "错误：dsh bundle 安装失败"
    exit 1
  fi

  # npm 的 allowScripts 在个别环境（新版 npm / 不同依赖解析结果）下可能没执行
  # node-pty 的 install 脚本。这里显式跑一遍它的 install 流程兜底：
  # scripts/prebuild.js 只是"本平台有没有预编译产物"的探测（有则 exit 0，无则
  # exit 1），Linux 从来没有预编译，所以实际总会落到 node-gyp 现场编译这一步。
  PTY_NODE="$BUNDLE_DIR/node_modules/node-pty/build/Release/pty.node"
  if [ ! -f "$PTY_NODE" ]; then
    echo "==> npm 未生成 node-pty 原生模块，显式执行 node-pty 构建"
    (
      cd "$BUNDLE_DIR/node_modules/node-pty"
      if ! "$RUNTIME_NODE" scripts/prebuild.js || [ ! -f "$PTY_NODE" ]; then
        NODE_GYP="$(dirname "$NPM_CLI")/../node_modules/node-gyp/bin/node-gyp.js"
        if [ ! -f "$NODE_GYP" ]; then
          NODE_GYP="$(command -v node-gyp || true)"
        fi
        if [ -z "$NODE_GYP" ]; then
          echo "错误：找不到 node-gyp，无法现场编译 node-pty"
          exit 1
        fi
        "$RUNTIME_NODE" "$NODE_GYP" rebuild
      fi
    )
  fi
  if [ ! -f "$PTY_NODE" ]; then
    echo "错误：node-pty 原生模块未编译成功（Linux 必须本地编译）"
    exit 1
  fi

  # 只保留编译产物，删除含构建机绝对路径的 Makefile/中间文件。
  find "$BUNDLE_DIR/node_modules/node-pty/build" -type f \
    ! -path '*/Release/pty.node' -delete 2>/dev/null || true
  find "$BUNDLE_DIR/node_modules/node-pty/build" -depth -type d -empty -delete 2>/dev/null || true

  echo "==> 生成完整性清单"
  {
    echo '{'
    echo '  "version": 1,'
    echo '  "files": ['
    first=1
    for file in \
      "node" \
      "bundle/node_modules/@deepseek-ai/dsh/lib/bin.js" \
      "bundle/package.json"; do
      [ -f "$RUNTIME_DIR/$file" ] || continue
      if [ "$first" = "0" ]; then echo ','; fi
      first=0
      printf '    {"path": "%s", "sha256": "%s"}' \
        "$file" "$(sha256sum "$RUNTIME_DIR/$file" | awk '{print $1}')"
    done
    echo ''
    echo '  ]'
    echo '}'
  } > "$RUNTIME_DIR/integrity.json"
  cat "$RUNTIME_DIR/integrity.json"
fi

# ---------------------------------------------------------------------------
# Electron 打包
# ---------------------------------------------------------------------------
if [ "$DO_ELECTRON" = "1" ]; then
  if [ ! -f "$RUNTIME_DIR/integrity.json" ]; then
    echo "错误：runtime 未组装，请先去掉 --skip-runtime 运行一次"
    exit 1
  fi

  echo "==> 生成 Linux 图标"
  mkdir -p assets/icons
  for size in 16 32 48 64 128 256 512; do
    if [ ! -f "assets/icons/${size}x${size}.png" ]; then
      rsvg-convert -w "$size" -h "$size" \
        "$REPO_ROOT/Resources/AppIcon.svg" \
        -o "assets/icons/${size}x${size}.png"
    fi
  done
  cp -f assets/icons/512x512.png assets/icon.png

  if [ "$DO_NPM_INSTALL" = "1" ]; then
    echo "==> 安装 Electron 打包依赖"
    npm install --no-audit --no-fund
  fi

  echo "==> 打包 AppImage + tar.gz + deb"
  rm -rf "$DIST_DIR"
  npx electron-builder --linux AppImage tar.gz deb
  echo "构建完成："
  ls -lh "$DIST_DIR"
else
  echo "==> runtime 组装完成（未打包 Electron）"
fi
