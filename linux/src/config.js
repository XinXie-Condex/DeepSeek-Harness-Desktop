'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_PORT = 3080;
const DSH_BIN_RELATIVE = path.join(
  'bundle', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'
);

/** 解析目标端口。DSH_DESKTOP_PORT 优先，默认 3080；端口 0 会交给操作系统随机分配，
 *  但桌面包只能访问固定地址，因此不允许 0。 */
function preferredPort(env = process.env) {
  const raw = env.DSH_DESKTOP_PORT;
  if (raw !== undefined && raw !== '') {
    const port = Number.parseInt(raw, 10);
    if (Number.isInteger(port) && port >= 1 && port <= 65535) {
      return port;
    }
  }
  return DEFAULT_PORT;
}

/** DSH_HOME 覆盖，默认使用真实用户数据目录 ~/.dsh。 */
function homeOverride(env = process.env) {
  const raw = env.DSH_DESKTOP_HOME;
  return raw && raw.trim() ? raw.trim() : null;
}

/** 日志目录：优先 XDG_STATE_HOME，回退 ~/.local/state/deepseek。 */
function logFile(env = process.env) {
  const stateHome = env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state');
  return path.join(stateHome, 'deepseek', 'server.log');
}

/** 在若干候选目录中寻找 runtime 根目录。
 *  @param {string|string[]} appRoots 应用根目录（app.getAppPath()）或
 *  资源目录（process.resourcesPath），也接受单个字符串以兼容纯 Node 测试。 */
function findRuntimeRoot(appRoots, env = process.env) {
  const roots = Array.isArray(appRoots) ? appRoots : [appRoots];
  const candidates = [];
  if (env.DSH_DESKTOP_RUNTIME) {
    candidates.push(env.DSH_DESKTOP_RUNTIME);
  }
  for (const root of roots) {
    if (!root) continue;
    candidates.push(path.join(root, 'runtime'));
    candidates.push(path.resolve(root, '..', 'runtime'));
  }
  candidates.push('/opt/deepseek/runtime');

  for (const candidate of candidates) {
    const bin = path.join(candidate, DSH_BIN_RELATIVE);
    if (fs.existsSync(bin)) {
      return candidate;
    }
  }
  return null;
}

/** 解析 dsh bin.js。找不到内置 bundle 时返回 null（此时不应尝试 spawn）。 */
function findDshBin(runtimeRoot) {
  if (!runtimeRoot) return null;
  const bin = path.join(runtimeRoot, DSH_BIN_RELATIVE);
  return fs.existsSync(bin) ? bin : null;
}

/** 解析 Node 可执行文件：优先内置 node，其次 DSH_DESKTOP_NODE，最后 PATH 中的 node。 */
function findNodeBin(runtimeRoot, env = process.env) {
  const candidates = [];
  if (runtimeRoot) {
    candidates.push(path.join(runtimeRoot, 'node'));
  }
  if (env.DSH_DESKTOP_NODE) {
    candidates.push(env.DSH_DESKTOP_NODE);
  }
  candidates.push('node');

  for (const candidate of candidates) {
    if (candidate === 'node') {
      // PATH 里的 node 由 spawn 自己解析；这里做一个轻量探测。
      try {
        const result = require('child_process').spawnSync('node', ['--version'], {
          stdio: 'ignore',
          timeout: 2000,
        });
        if (result.status === 0) return candidate;
      } catch {
        // ignore and try next
      }
    } else if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

module.exports = {
  DEFAULT_PORT,
  DSH_BIN_RELATIVE,
  preferredPort,
  homeOverride,
  logFile,
  findRuntimeRoot,
  findDshBin,
  findNodeBin,
};
