'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * 校验 runtime 关键文件（node、dsh bin.js、bundle package.json）的 SHA256。
 * 清单由 linux/build-linux.sh 在组装 runtime 时生成。
 * 攻击者可以同时改清单与文件，因此这只是一道一致性闸门（与 Mac 版的自校验同定位，
 * Linux 二进制发布仍建议校验 AppImage 的 sha256sum）。
 */

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = fs.createReadStream(file);
    input.on('error', reject);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * @param {string} runtimeRoot
 * @param {{required?: boolean}} options
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
async function verifyRuntimeIntegrity(runtimeRoot, { required = true } = {}) {
  if (!runtimeRoot) {
    return { ok: false, reason: '找不到内置 runtime 目录' };
  }

  const manifestFile = path.join(runtimeRoot, 'integrity.json');
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  } catch {
    if (required) {
      return { ok: false, reason: `缺少完整性清单: ${manifestFile}` };
    }
    return { ok: true, reason: 'dev 模式：未找到完整性清单，跳过自校验' };
  }

  if (!manifest || !Array.isArray(manifest.files)) {
    return { ok: false, reason: '完整性清单格式无效' };
  }

  for (const entry of manifest.files) {
    const file = path.join(runtimeRoot, entry.path);
    const expected = entry.sha256;
    let actual;
    try {
      actual = await sha256File(file);
    } catch {
      return { ok: false, reason: `缺少文件: ${entry.path}` };
    }
    if (actual !== expected) {
      return {
        ok: false,
        reason: `文件哈希不匹配: ${entry.path}\n期望 ${expected}\n实际 ${actual}`,
      };
    }
  }

  return { ok: true };
}

module.exports = { sha256File, verifyRuntimeIntegrity };
