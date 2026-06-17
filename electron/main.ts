// Electron 主进程入口
import { app, BrowserWindow, shell, Menu } from 'electron';
import * as path from 'path';
import { registerIpc } from './ipc';
import { initStore } from './store';

const isDev = !!process.env.VITE_DEV_SERVER_URL;

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#0f0e0c',
    title: 'CS_Assistant',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  // 外部链接用系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL as string)
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'))
  }
}

// 移除默认菜单栏（应用自带侧边导航）
Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  initStore();
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
