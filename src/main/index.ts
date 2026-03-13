// src/main/index.ts
import { app, globalShortcut } from 'electron';
import { createWindow, showWidget, scheduleHide, setOnEdgeChange, startHoverDetection, stopHoverDetection } from './window-manager';
import { setupIpcHandlers } from './ipc-handlers';
import { getActiveSession } from './services/session-watcher';
import { loadConfig, saveConfig } from './services/config-store';
import { loadActivityHistory, flushActivityHistory } from './services/activity-store';
import { startUpdateChecker, stopUpdateChecker, getCachedUpdate } from './services/update-checker';
import { POLL_INTERVAL_SESSION } from '../shared/constants';
import path from 'path';

const isDev = !app.isPackaged;

let sessionIntervalId: ReturnType<typeof setInterval> | null = null;

app.whenReady().then(() => {
  const config = loadConfig();
  loadActivityHistory();
  const win = createWindow(config.snapEdge);

  if (isDev) {
    win.loadURL('http://localhost:3000');
  } else {
    win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }

  setupIpcHandlers(win);
  startHoverDetection();

  // Global shortcut: Ctrl+Shift+P to toggle minimize
  globalShortcut.register('CommandOrControl+Shift+P', () => {
    win.webContents.send('widget:toggle-minimize');
  });

  // Global shortcut: Ctrl+Shift+Q to quit (with confirm in renderer)
  globalShortcut.register('CommandOrControl+Shift+Q', () => {
    win.webContents.send('widget:confirm-quit');
  });

  // Persist edge changes
  setOnEdgeChange((edge) => {
    saveConfig({ snapEdge: edge });
  });

  // Check for updates — wait for page to load before sending first result
  win.webContents.on('did-finish-load', () => {
    const cached = getCachedUpdate();
    if (cached) {
      win.webContents.send('widget:update-info', cached);
    }
  });

  startUpdateChecker((info) => {
    win.webContents.send('widget:update-info', info);
  });

  // Monitor for active sessions to auto-show
  sessionIntervalId = setInterval(() => {
    const session = getActiveSession();
    if (session.isActive) {
      showWidget();
    } else {
      scheduleHide();
    }
  }, POLL_INTERVAL_SESSION);
});

app.on('before-quit', () => {
  globalShortcut.unregisterAll();
  flushActivityHistory();
  stopHoverDetection();
  stopUpdateChecker();
  if (sessionIntervalId !== null) {
    clearInterval(sessionIntervalId);
    sessionIntervalId = null;
  }
});

app.on('window-all-closed', () => {
  app.quit();
});
