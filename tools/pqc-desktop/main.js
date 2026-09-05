// SPDX-License-Identifier: GPL-3.0-only
// FIBEMATE PQC Desktop — Electron 主进程
// 设计文档: docs/product-designs/09-pqc-desktop.md §6.1/6.3
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,     // 安全沙箱
      nodeIntegration: false,     // 禁止渲染进程直接访问 Node
      sandbox: true,
    },
    title: 'FIBEMATE · PQC Desktop',
    icon: path.join(__dirname, 'assets', 'icon.png'),
  });

  mainWindow.loadFile('nav.html');

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// ─── IPC: 课程进度 ───────────────────────────────────────────────────────────
function progressPath() {
  return path.join(app.getPath('userData'), 'progress.json');
}

ipcMain.handle('get-progress', () => {
  try {
    return JSON.parse(fs.readFileSync(progressPath(), 'utf8'));
  } catch {
    return { solved: [], startedAt: new Date().toISOString() };
  }
});

ipcMain.handle('save-progress', (_, data) => {
  fs.writeFileSync(progressPath(), JSON.stringify({ ...data, updatedAt: new Date().toISOString() }));
  return true;
});

// ─── IPC: 课程证书导出 ───────────────────────────────────────────────────────
ipcMain.handle('export-certificate', async () => {
  const image = await mainWindow.webContents.capturePage({
    x: 0, y: 0, width: 800, height: 600,
  });
  const savePath = dialog.showSaveDialogSync({
    defaultPath: 'fibemate-certificate.png',
    filters: [{ name: 'PNG', extensions: ['png'] }],
  });
  if (savePath) {
    fs.writeFileSync(savePath, image.toPNG());
    return savePath;
  }
  return null;
});

// ─── IPC: 窗口控制 ───────────────────────────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow.close());

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
