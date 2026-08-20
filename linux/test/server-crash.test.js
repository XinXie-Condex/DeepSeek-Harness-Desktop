'use strict';

// 无头测试：验证“服务就绪后意外退出”会发出 unexpected-exit 事件，
// 且 shutdown 清理流程不会因此卡住。
// 只使用 Node 内置模块，不需要组装 runtime。

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const { ServerManager } = require('../src/server-manager');

function waitForEvent(emitter, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`等待 ${event} 超时`)), timeoutMs);
    emitter.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-crash-test-'));
  const port = 32101 + Math.floor(Math.random() * 1000);
  const fakeDsh = path.join(dir, 'fake-dsh.js');

  fs.writeFileSync(fakeDsh, `
    'use strict';
    const http = require('http');
    const argv = process.argv;
    const index = argv.indexOf('--port');
    const port = Number(index >= 0 ? argv[index + 1] : 3080);
    const server = http.createServer((req, res) => {
      res.statusCode = 200;
      res.end('ok');
    });
    server.listen(port, '127.0.0.1', () => {
      setTimeout(() => process.exit(23), 400);
    });
  `);

  const manager = new ServerManager({
    port,
    nodeBin: process.execPath,
    dshBin: fakeDsh,
    cwd: dir,
    logFile: path.join(dir, 'server.log'),
    timeoutMs: 5000,
  });

  const result = await manager.ensureServer();
  assert.strictEqual(result.reused, false);

  const info = await waitForEvent(manager, 'unexpected-exit');
  assert.strictEqual(info.code, 23);

  await manager.shutdown();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('SERVER CRASH TEST PASSED');
}

main().catch((error) => {
  console.error('SERVER CRASH TEST FAILED');
  console.error(error);
  process.exit(1);
});
