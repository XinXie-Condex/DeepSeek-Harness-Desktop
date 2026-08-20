'use strict';

// 无头冒烟测试：验证 ServerManager 的复用/拉起/清理逻辑。
// 运行前需要组装好 runtime（linux/build-linux.sh --runtime-only），
// 或者用环境变量 DSH_DESKTOP_NODE / DSH_DESKTOP_BIN 指定可用 node 和 bin.js。
// 示例：
//   DSH_DESKTOP_PORT=3099 DSH_DESKTOP_HOME=/tmp/dsh-linux-smoke \
//   node test/server-manager.test.js

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { preferredPort, findRuntimeRoot, findDshBin, findNodeBin } = require('../src/config');
const { ServerManager, probeServer } = require('../src/server-manager');

async function main() {
  const appRoot = path.resolve(__dirname, '..');
  const runtimeRoot = findRuntimeRoot(appRoot) || process.env.DSH_DESKTOP_RUNTIME || null;
  const nodeBin = process.env.DSH_DESKTOP_NODE || findNodeBin(runtimeRoot);
  const dshBin = process.env.DSH_DESKTOP_BIN || findDshBin(runtimeRoot);
  const port = preferredPort();
  const home = process.env.DSH_DESKTOP_HOME || fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-linux-smoke-'));

  assert.ok(nodeBin, '找不到 Node 可执行文件');
  assert.ok(dshBin, '找不到 dsh bin.js');
  console.log(`SMOKE: node=${nodeBin}`);
  console.log(`SMOKE: dsh=${dshBin}`);
  console.log(`SMOKE: port=${port} home=${home}`);

  const manager = new ServerManager({
    port,
    nodeBin,
    dshBin,
    cwd: runtimeRoot
      ? path.join(runtimeRoot, 'bundle')
      : path.resolve(path.dirname(dshBin), '..', '..', '..', '..'),
    logFile: path.join(home, 'server.log'),
    timeoutMs: 30000,
    extraEnv: { DSH_HOME: home },
  });

  const result = await manager.ensureServer();
  assert.strictEqual(result.port, port);
  assert.strictEqual(await probeServer(port), true);
  console.log(`SMOKE: server ready (reused=${result.reused})`);

  await manager.shutdown();
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (result.reused) {
    console.log('SMOKE: reused external server, leaving it alone (expected)');
  } else {
    assert.strictEqual(await probeServer(port, 1000), false, 'shutdown 后端口仍可访问');
    console.log('SMOKE: spawned server cleaned up');
  }
  console.log('SMOKE TEST PASSED');
  process.exit(0);
}

main().catch((error) => {
  console.error('SMOKE TEST FAILED');
  console.error(error);
  process.exit(1);
});
