'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { loadWindowState, saveWindowState } = require('../src/window-state');

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-window-state-'));
  const file = path.join(dir, 'state.json');

  // 文件不存在 -> 默认值
  let state = loadWindowState(file);
  assert.strictEqual(state.width, 1200);
  assert.strictEqual(state.height, 800);
  assert.strictEqual(state.maximized, false);

  // 正常保存 / 读取
  saveWindowState(file, { width: 1440, height: 900, x: -20, y: 30, maximized: true });
  state = loadWindowState(file);
  assert.strictEqual(state.width, 1440);
  assert.strictEqual(state.height, 900);
  assert.strictEqual(state.x, -20);
  assert.strictEqual(state.y, 30);
  assert.strictEqual(state.maximized, true);

  // 损坏文件 -> 默认值
  fs.writeFileSync(file, 'not-json');
  state = loadWindowState(file);
  assert.strictEqual(state.width, 1200);

  // 非法字段 -> 默认值/夹取
  fs.writeFileSync(file, JSON.stringify({ width: 10, height: 'x', x: 1.6, y: null, maximized: 1 }));
  state = loadWindowState(file);
  assert.strictEqual(state.width, 1200);
  assert.strictEqual(state.height, 800);
  assert.strictEqual(state.x, 2);
  assert.strictEqual(state.y, null);
  assert.strictEqual(state.maximized, false);

  fs.rmSync(dir, { recursive: true, force: true });
  console.log('WINDOW STATE TEST PASSED');
}

main().catch((error) => {
  console.error('WINDOW STATE TEST FAILED');
  console.error(error);
  process.exit(1);
});
