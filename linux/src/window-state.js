'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_STATE = Object.freeze({
  width: 1200,
  height: 800,
  x: null,
  y: null,
  maximized: false,
});

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * 读取窗口状态。文件损坏或字段非法时回退到默认值，绝不抛出。
 * @param {string} file JSON 状态文件路径
 * @returns {{width:number, height:number, x:number|null, y:number|null, maximized:boolean}}
 */
function loadWindowState(file) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { ...DEFAULT_STATE };
  }
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_STATE };
  }

  const width = Math.round(raw.width);
  const height = Math.round(raw.height);
  return {
    width: isFiniteNumber(width) && width >= 800 ? width : DEFAULT_STATE.width,
    height: isFiniteNumber(height) && height >= 500 ? height : DEFAULT_STATE.height,
    x: isFiniteNumber(raw.x) ? Math.round(raw.x) : null,
    y: isFiniteNumber(raw.y) ? Math.round(raw.y) : null,
    maximized: raw.maximized === true,
  };
}

/**
 * 保存窗口状态。状态目录不可写（如只读 HOME / 临时环境）时静默忽略。
 * @param {string} file JSON 状态文件路径
 * @param {{width:number, height:number, x:number, y:number, maximized:boolean}} state
 */
function saveWindowState(file, state) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify(
        {
          width: state.width,
          height: state.height,
          x: state.x,
          y: state.y,
          maximized: Boolean(state.maximized),
        },
        null,
        2
      )
    );
  } catch {
    // 状态文件属于尽力而为的体验优化，写失败不影响启动。
  }
}

module.exports = { DEFAULT_STATE, loadWindowState, saveWindowState };
