'use strict';

// Linux ozone 必须在进程启动参数里设（--ozone-platform=x11）。
// Electron 43 已移除 ELECTRON_OZONE_PLATFORM_HINT，JS 里赋值也晚于原生初始化。
const { app, BrowserWindow, dialog, Menu, screen, shell } = require('electron');
const path = require('path');

const {
  preferredPort,
  homeOverride,
  logFile,
  findRuntimeRoot,
  findDshBin,
  findNodeBin,
} = require('./config');
const { ServerManager } = require('./server-manager');
const { verifyRuntimeIntegrity } = require('./integrity');
const { loadWindowState, saveWindowState } = require('./window-state');

const SPLASH_MIN_MS = 5200;
const APP_NAME = 'DeepSeek';
const MAX_LOAD_RETRIES = 3;
const RELOAD_DELAY_MS = 1500;

let splashWindow = null;
let mainWindow = null;
let server = null;
let startupPhase = 'splash'; // splash | main | failed
let quitting = false;
let cleanedUp = false;
let crashDialogOpen = false;

// ---------------------------------------------------------------------------
// 单实例：重复启动时聚焦已有窗口并退出新进程。
// ---------------------------------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } else if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.show();
      splashWindow.focus();
    }
  });

  app.whenReady()
    .then(() => {
      if (process.argv.includes('--smoke-test')) {
        return runSmokeTest();
      }
      return runStartupWithIntegrity();
    })
    .catch((error) => {
      dialog.showErrorBox(APP_NAME, `应用启动失败：${error.message}`);
      app.exit(1);
    });
}

function isDevMode() {
  return process.env.DSH_DESKTOP_DEV === '1';
}

function appRoot() {
  // Arch 的 electron 包在开发模式也可能把 isPackaged 报成 true，
  // 所以 runtime 搜索同时覆盖 app 根目录与 resources 目录。
  return app.getAppPath();
}

function runtimeSearchRoots() {
  return [app.getAppPath(), process.resourcesPath];
}

function findRuntime() {
  return findRuntimeRoot(runtimeSearchRoots());
}

function sendSplashStatus(message) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('splash:status', message);
  }
}

function buildServerManager() {
  const port = preferredPort();
  const root = appRoot();
  const runtimeRoot = findRuntime();
  const nodeBin = findNodeBin(runtimeRoot);
  const dshBin = findDshBin(runtimeRoot);
  const home = homeOverride();

  return new ServerManager({
    port,
    nodeBin,
    dshBin,
    cwd: runtimeRoot ? path.join(runtimeRoot, 'bundle') : root,
    logFile: logFile(),
    timeoutMs: 25000,
    extraEnv: home ? { DSH_HOME: home } : {},
  });
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 760,
    height: 420,
    frame: false,
    resizable: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    backgroundColor: '#ffffff',
    show: false,
    title: APP_NAME,
    webPreferences: {
      preload: path.join(__dirname, 'preload-splash.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  splashWindow.loadFile(path.join(__dirname, '..', 'assets', 'splash.html'));
  splashWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.show();
  });

  splashWindow.on('closed', () => {
    splashWindow = null;
    // 用户强制关闭启动动画（如 Alt+F4）且还没进入主界面时直接退出。
    if (!quitting && startupPhase === 'splash') {
      app.quit();
    }
  });
}

function windowStateFile() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

/** 窗口状态里的坐标是否还落在某个显示器上（外接屏拔掉后回到默认位置）。 */
function boundsVisibleOnSomeDisplay(state) {
  if (state.x === null || state.y === null) return false;
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    const overlapX = Math.min(state.x + state.width, area.x + area.width) - Math.max(state.x, area.x);
    const overlapY = Math.min(state.y + state.height, area.y + area.height) - Math.max(state.y, area.y);
    return overlapX >= 80 && overlapY >= 80;
  });
}

function createMainWindow(url) {
  const state = loadWindowState(windowStateFile());
  const position = boundsVisibleOnSomeDisplay(state) ? { x: state.x, y: state.y } : {};

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#ffffff',
    show: false,
    title: APP_NAME,
    autoHideMenuBar: false,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    ...position,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  if (state.maximized) {
    mainWindow.maximize();
  }

  mainWindow.loadURL(url).catch(() => {});
  // 先 show 再等页面：Linux 上隐藏窗口关闭欢迎屏后会被当成“最后一个窗口关闭”而退出；
  // niri 上 show:false 再 show() 也可能永远不映射。启动动画已经覆盖了等待时间。
  mainWindow.show();
  mainWindow.focus();
  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // 兜底显示：Harness UI 等页面在窗口隐藏（show:false）时可能不绘制首帧，
  // 导致 ready-to-show 永不触发、窗口永远无法显示（死锁）。
  // 3 秒后若仍未显示则强制显示，页面绘制后 ready-to-show 会照常触发。
  const showFallbackTimer = setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 3000);
  mainWindow.once('ready-to-show', () => clearTimeout(showFallbackTimer));
  mainWindow.on('closed', () => clearTimeout(showFallbackTimer));

  // 退出/重启前保存正常尺寸；最大化时用 getNormalBounds 保留还原尺寸。
  mainWindow.on('close', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const maximized = mainWindow.isMaximized();
    const bounds = maximized && typeof mainWindow.getNormalBounds === 'function'
      ? mainWindow.getNormalBounds()
      : mainWindow.getBounds();
    saveWindowState(windowStateFile(), {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      maximized,
    });
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    openExternalSafe(target);
    return { action: 'deny' };
  });

  const port = preferredPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const localhostUrl = `http://localhost:${port}`;
  mainWindow.webContents.on('will-navigate', (event, target) => {
    const allowed = target === baseUrl
      || target.startsWith(`${baseUrl}/`)
      || target === localhostUrl
      || target.startsWith(`${localhostUrl}/`);
    if (!allowed) {
      event.preventDefault();
      openExternalSafe(target);
    }
  });

  let reloadTimer = null;
  let loadFailures = 0;
  let loadFailureDialogOpen = false;

  const clearReloadTimer = () => {
    if (reloadTimer) {
      clearTimeout(reloadTimer);
      reloadTimer = null;
    }
  };

  const showLoadFailureDialog = async (failedUrl) => {
    if (loadFailureDialogOpen || quitting || !mainWindow || mainWindow.isDestroyed()) return;
    loadFailureDialogOpen = true;
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: APP_NAME,
      message: '界面加载失败',
      detail: `无法连接到本地服务：${failedUrl}\n\n请检查端口 ${port} 是否被占用，或查看日志：\n${logFile()}`,
      buttons: ['重试', '退出'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    loadFailureDialogOpen = false;

    if (response === 0) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        loadFailures = 0;
        mainWindow.loadURL(failedUrl).catch(() => {});
      }
    } else if (!quitting) {
      await quitApp();
    }
  };

  mainWindow.webContents.on('did-finish-load', () => {
    loadFailures = 0;
  });

  mainWindow.webContents.on('did-fail-load', (_event, code, _description, failedUrl, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3 = 用户/导航取消
    clearReloadTimer();
    loadFailures += 1;

    if (loadFailures > MAX_LOAD_RETRIES) {
      showLoadFailureDialog(failedUrl).catch(() => {});
      return;
    }

    reloadTimer = setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(failedUrl).catch(() => {});
      }
    }, RELOAD_DELAY_MS);
  });

  mainWindow.on('closed', () => {
    clearReloadTimer();
    mainWindow = null;
    if (!quitting && startupPhase === 'main') app.quit();
  });
}

function openExternalSafe(target) {
  try {
    const parsed = new URL(target);
    if (['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
      shell.openExternal(target);
    }
  } catch {
    // 非法 URL 忽略
  }
}

function installMenu() {
  const template = [
    {
      label: '文件',
      submenu: [{ role: 'quit', label: '退出' }],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '刷新' },
        { role: 'forceReload', label: '强制刷新' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '切换全屏' },
      ],
    },
  ];

  if (isDevMode()) {
    template.push({
      label: '调试',
      submenu: [{ role: 'toggleDevTools', label: '开发者工具' }],
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function waitMinSplash(startedAt) {
  const remaining = SPLASH_MIN_MS - (Date.now() - startedAt);
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

async function showStartupErrorAndMaybeRetry(error) {
  if (quitting) return;
  startupPhase = 'failed';
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }

  const { response } = await dialog.showMessageBox({
    type: 'error',
    title: APP_NAME,
    message: 'DeepSeek 启动失败',
    detail: `${error.message}\n\n日志：${logFile()}`,
    buttons: ['重试', '退出'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });

  // 对话框打开期间可能已经进入退出流程（例如收到 SIGTERM）。
  // 对话框关闭后再补发一次退出请求，避免 0 窗口进程滞留。
  if (quitting) {
    app.quit();
    return;
  }

  if (response === 0) {
    startupPhase = 'splash';
    await runStartup();
  } else {
    await quitApp();
  }
}

/** 关闭主窗口并等待 closed 事件，供服务崩溃后重新走启动流程使用。 */
function closeMainWindow() {
  return new Promise((resolve) => {
    const windowToClose = mainWindow;
    if (!windowToClose || windowToClose.isDestroyed()) {
      mainWindow = null;
      resolve();
      return;
    }
    windowToClose.once('closed', resolve);
    windowToClose.close();
  });
}

async function handleUnexpectedServerExit({ code, signal }) {
  if (quitting || startupPhase !== 'main' || crashDialogOpen) return;
  crashDialogOpen = true;

  const why = signal ? `被信号 ${signal} 终止` : `退出码 ${code}`;
  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
  const { response } = await dialog.showMessageBox(parent, {
    type: 'warning',
    title: APP_NAME,
    message: '本地服务已停止',
    detail: `DeepSeek 本地服务异常退出（${why}）。\n\n可以尝试重新启动服务，插件或配置问题可能需要先处理。\n\n日志：${logFile()}`,
    buttons: ['重新启动', '退出'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  crashDialogOpen = false;

  if (response === 0 && !quitting) {
    startupPhase = 'splash';
    await closeMainWindow();
    await runStartup();
  } else if (!quitting) {
    await quitApp();
  }
}

async function runStartup() {
  if (quitting) return;
  const startedAt = Date.now();
  if (!splashWindow || splashWindow.isDestroyed()) {
    createSplashWindow();
  }

  // 重试/二次启动前先清掉上一次可能仍在运行、但未就绪的进程。
  if (server) {
    await server.shutdown().catch(() => {});
  }
  server = buildServerManager();
  server.on('status', (message) => sendSplashStatus(message));
  server.on('unexpected-exit', (info) => {
    handleUnexpectedServerExit(info).catch(() => {});
  });

  const outcome = await server.ensureServer().then(
    (result) => ({ ok: true, result }),
    (error) => ({ ok: false, error })
  );

  await waitMinSplash(startedAt);

  // 等待启动动画期间用户可能已经退出（例如 Alt+F4 欢迎屏）。
  // 退出流程会关闭所有窗口；这里若继续创建主窗口，会在退出中闪一下。
  if (quitting) return;

  if (!outcome.ok) {
    await showStartupErrorAndMaybeRetry(outcome.error);
    return;
  }

  startupPhase = 'main';
  const url = `http://127.0.0.1:${outcome.result.port}`;
  // 必须先创建主窗口再关欢迎屏。Linux 默认在最后一个窗口关闭时退出，
  // 先关欢迎屏会导致进程在主窗口出现前就退出（欢迎屏一闪然后消失）。
  createMainWindow(url);
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
}

async function shutdownServer() {
  if (server) {
    await server.shutdown().catch(() => {});
  }
}

async function quitApp() {
  if (quitting) return;
  quitting = true;
  await shutdownServer();
  cleanedUp = true;
  app.quit();
}

app.on('before-quit', (event) => {
  if (cleanedUp) return;
  event.preventDefault();
  quitApp();
});

// Linux 默认会在最后一个窗口关闭时 quit。这里只拦截默认行为，不主动退出：
// 服务崩溃点「重新启动」会先关主窗口再重建欢迎屏，中间 0 个窗口；
// Electron 在微任务之前同步 emit window-all-closed，此时 splash 还不存在，
// 若在这里 app.quit() 会盖掉后续 runStartup()。真正退出走各窗口 closed / quitApp。
app.on('window-all-closed', () => {});

// kill/系统注销时也走正常清理流程。
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  process.on(signal, () => {
    app.quit();
  });
}

async function runSmokeTest() {
  const runtimeRoot = findRuntime();
  const integrity = await verifyRuntimeIntegrity(runtimeRoot, { required: true });
  if (!integrity.ok) {
    console.error(`DSH_SMOKE_INTEGRITY_FAIL: ${integrity.reason}`);
    app.exit(2);
    return;
  }

  server = buildServerManager();
  try {
    const result = await server.ensureServer();
    console.log(`DSH_SMOKE_READY port=${result.port} reused=${result.reused}`);
    await server.shutdown();
    console.log('DSH_SMOKE_CLEAN');
    app.exit(0);
  } catch (error) {
    console.error(`DSH_SMOKE_FAIL: ${error.message}`);
    app.exit(1);
  }
}

async function runStartupWithIntegrity() {
  const runtimeRoot = findRuntime();
  const required = !isDevMode();
  const integrity = await verifyRuntimeIntegrity(runtimeRoot, { required });

  if (!integrity.ok) {
    dialog.showErrorBox(
      APP_NAME,
      `应用文件校验失败，拒绝启动。\n\n${integrity.reason}\n\n请重新下载安装包。`
    );
    app.exit(1);
    return;
  }

  installMenu();
  createSplashWindow();
  await runStartup();
}
