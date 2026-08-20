'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('deepseekDesktop', {
  onStatus(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, message) => callback(String(message));
    ipcRenderer.on('splash:status', listener);
    return () => ipcRenderer.removeListener('splash:status', listener);
  },
});
