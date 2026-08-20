'use strict';

const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs');
const http = require('http');
const path = require('path');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isHttpSuccess(statusCode) {
  return typeof statusCode === 'number' && statusCode >= 200 && statusCode < 300;
}

function probeServer(port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/',
        method: 'GET',
        timeout: timeoutMs,
        agent: false,
      },
      (res) => {
        res.resume();
        resolve(isHttpSuccess(res.statusCode));
      }
    );
    req.on('timeout', () => req.destroy(new Error('probe timeout')));
    req.on('error', () => resolve(false));
    req.end();
  });
}

/**
 * 管理 dsh web 本地服务器：
 * - 端口已有可用服务时直接复用，不负责关闭；
 * - 否则用内置 Node 运行 dsh web，就绪后交给 WebView；
 * - shutdown 时按进程组清理（SIGTERM -> 3s -> SIGKILL），避免孤儿进程。
 */
class ServerManager extends EventEmitter {
  /**
   * @param {object} options
   * @param {number} options.port
   * @param {string|null} options.nodeBin null 表示无法启动
   * @param {string|null} options.dshBin null 表示无法启动
   * @param {string} options.cwd dsh bundle 工作目录
   * @param {string} options.logFile 服务日志路径
   * @param {object} [options.extraEnv]
   * @param {number} [options.timeoutMs]
   */
  constructor(options) {
    super();
    this.port = options.port;
    this.nodeBin = options.nodeBin;
    this.dshBin = options.dshBin;
    this.cwd = options.cwd;
    this.logFile = options.logFile;
    this.extraEnv = options.extraEnv || {};
    this.timeoutMs = options.timeoutMs || 25000;

    this.child = null;
    this.spawnedByUs = false;
    this.lastError = null;
    this._logStream = null;
    this._tail = '';
    this._ready = false;
    this._shuttingDown = false;
  }

  /** 启动/复用服务器；成功后返回 { reused:boolean, port:number }。 */
  async ensureServer() {
    this.lastError = null;
    this._ready = false;

    // 重试场景：先清掉上一次没退干净的进程。
    if (this.child && this.spawnedByUs) {
      await this.shutdown();
    }

    if (await probeServer(this.port)) {
      this.spawnedByUs = false;
      this.emit('status', '检测到本地服务已在运行，直接连接');
      return { reused: true, port: this.port };
    }

    await this._spawn();
    const ok = await this._waitUntilServing();
    if (!ok) {
      const detail = this._tail.trim() || '(没有捕获到输出)';
      const code = this.child && this.child.exitCode !== null ? this.child.exitCode : null;
      const signal = this.child && this.child.signalCode ? this.child.signalCode : null;
      const why = code !== null
        ? `服务器进程提前退出（exit code ${code}）`
        : (signal ? `服务器进程被信号 ${signal} 终止` : '服务器启动超时');
      throw new Error(`${why}。最近日志：\n${detail.slice(-4000)}`);
    }

    this._ready = true;
    this.emit('status', '本地服务已就绪');
    return { reused: false, port: this.port };
  }

  _appendTail(chunk) {
    this._tail = (this._tail + chunk.toString()).slice(-16000);
  }

  _spawn() {
    return new Promise((resolve, reject) => {
      if (!this.nodeBin || !this.dshBin) {
        reject(new Error('内置运行时缺失（node 或 dsh 包未找到）'));
        return;
      }

      const logFile = this.logFile;
      if (logFile) {
        try {
          fs.mkdirSync(path.dirname(logFile), { recursive: true });
          this._logStream = fs.createWriteStream(logFile, { flags: 'a' });
        } catch (error) {
          this.emit('status', `无法写入日志文件 ${logFile}: ${error.message}`);
          this._logStream = null;
        }
      }

      const env = {
        ...process.env,
        ...this.extraEnv,
        DSH_DESKTOP: '1',
      };

      this.emit('status', '正在启动本地服务…');
      this._spawnError = null;
      this._ready = false;
      this._shuttingDown = false;
      const child = spawn(
        this.nodeBin,
        [this.dshBin, 'web', '--port', String(this.port)],
        {
          cwd: this.cwd,
          env,
          detached: process.platform !== 'win32',
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );
      this.child = child;
      this.spawnedByUs = true;
      this._tail = '';

      child.stdout.on('data', (chunk) => {
        this._appendTail(chunk);
        this._logStream?.write(chunk);
      });
      child.stderr.on('data', (chunk) => {
        this._appendTail(chunk);
        this._logStream?.write(chunk);
      });
      child.on('error', (error) => {
        this._appendTail(error.toString());
        this._logStream?.write(error.toString());
        // spawn 失败（如 ENOENT）不会走 exit；记下来供等待循环读取。
        this._spawnError = error;
      });
      child.on('exit', (code, signal) => {
        this.emit('status', signal ? `本地服务被信号 ${signal} 终止` : `本地服务已退出（code ${code}）`);
        // 只有“已经就绪后”的退出才算意外崩溃；启动阶段的失败由
        // ensureServer 的等待循环统一处理，避免弹两套错误对话框。
        if (this._ready && !this._shuttingDown && this.spawnedByUs) {
          this.emit('unexpected-exit', { code, signal });
        }
      });
      child.on('close', () => {
        this._logStream?.end();
        this._logStream = null;
      });

      resolve();
    });
  }

  async _waitUntilServing() {
    const deadline = Date.now() + this.timeoutMs;
    while (Date.now() < deadline) {
      if (this._spawnError) {
        return false;
      }
      if (this.child && this.child.exitCode !== null) {
        return false;
      }
      if (await probeServer(this.port)) {
        return true;
      }
      await sleep(400);
    }
    // 超时前再给一次机会，避免恰好错过。
    return probeServer(this.port);
  }

  /** 关闭由本应用拉起的服务器。复用的外部服务器不受影响。 */
  async shutdown({ graceMs = 3000 } = {}) {
    this._shuttingDown = true;
    this._ready = false;
    const child = this.child;
    this.child = null;
    if (!child || !this.spawnedByUs) {
      this.spawnedByUs = false;
      return;
    }
    this.spawnedByUs = false;

    const killGroup = (signal) => {
      try {
        process.kill(-child.pid, signal);
      } catch {
        try {
          child.kill(signal);
        } catch {
          // 进程已退出
        }
      }
    };

    if (child.exitCode === null) {
      killGroup('SIGTERM');
      const deadline = Date.now() + graceMs;
      while (Date.now() < deadline && child.exitCode === null) {
        await sleep(150);
      }
      if (child.exitCode === null) {
        killGroup('SIGKILL');
      }
    }

    this._logStream?.end();
    this._logStream = null;
  }
}

module.exports = { ServerManager, probeServer, sleep };
