// SPDX-License-Identifier: GPL-3.0-only
// FIBEMATE PQC Desktop — Preload 安全桥
// 设计文档: docs/product-designs/09-pqc-desktop.md §6.2
const { contextBridge, ipcRenderer } = require('electron');

// 只暴露最小 API 表面
contextBridge.exposeInMainWorld('fibemateDesktop', {
  navigate: (lessonId) => ipcRenderer.send('navigate', lessonId),
  getProgress: () => ipcRenderer.invoke('get-progress'),
  saveProgress: (data) => ipcRenderer.invoke('save-progress', data),
  exportCertificate: () => ipcRenderer.invoke('export-certificate'),
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
});
