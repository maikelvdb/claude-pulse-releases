// src/main/index.ts
import { app, globalShortcut } from 'electron';
import { createWindow, showWidget, scheduleHide, setOnEdgeChange, setOnOffsetChange, startHoverDetection, stopHoverDetection, getWindow, resizeForPreview, setPositionLocked } from './window-manager';
import { setupIpcHandlers } from './ipc-handlers';
import { getActiveSession } from './services/session-watcher';
import { loadConfig, saveConfig, getConfig } from './services/config-store';
import { loadActivityHistory, flushActivityHistory } from './services/activity-store';
import { startUpdateChecker, stopUpdateChecker, getCachedUpdate } from './services/update-checker';
import { createTray, destroyTray } from './tray';
import { startConversationTailer, stopConversationTailer } from './services/conversation-tailer';
import { POLL_INTERVAL_SESSION } from '../shared/constants';
import path from 'path';

const isDev = !app.isPackaged;

let sessionIntervalId: ReturnType<typeof setInterval> | null = null;

app.whenReady().then(() => {
  const config = loadConfig();
  loadActivityHistory();

  // Auto-start on login
  if (!isDev) {
    app.setLoginItemSettings({ openAtLogin: !!config.autoStart });
  }

  const win = createWindow(config.snapEdge, config.userOffset);
  win.setOpacity(config.opacity ?? 1);
  if (config.positionLocked) setPositionLocked(true);

  if (isDev) {
    win.loadURL('http://localhost:3000');
  } else {
    win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }

  setupIpcHandlers(win);
  startHoverDetection();
  createTray();

  // Global shortcut: Ctrl+Shift+P to toggle minimize
  globalShortcut.register('CommandOrControl+Shift+P', () => {
    win.webContents.send('widget:toggle-minimize');
  });

  // Global shortcut: Ctrl+Shift+Q to quit (with confirm in renderer)
  globalShortcut.register('CommandOrControl+Shift+Q', () => {
    win.webContents.send('widget:confirm-quit');
  });

  // Global shortcut: Ctrl+Shift+T to cycle themes
  const themes: ('dark' | 'light' | 'sunset')[] = ['dark', 'light', 'sunset'];
  globalShortcut.register('CommandOrControl+Shift+T', () => {
    const current = getConfig().theme || 'dark';
    const next = themes[(themes.indexOf(current) + 1) % themes.length];
    saveConfig({ theme: next });
    win.webContents.send('widget:theme-change', next);
  });

  // Persist edge and offset changes
  setOnEdgeChange((edge) => {
    saveConfig({ snapEdge: edge });
  });
  let offsetSaveTimer: ReturnType<typeof setTimeout> | null = null;
  setOnOffsetChange((offset) => {
    if (offsetSaveTimer) clearTimeout(offsetSaveTimer);
    offsetSaveTimer = setTimeout(() => saveConfig({ userOffset: offset }), 500);
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

  startConversationTailer((msg) => {
    resizeForPreview(!!msg);
    win.webContents.send('claude:conversation-preview', msg);
  });

  // Monitor for active sessions to auto-show
  sessionIntervalId = setInterval(() => {
    const session = getActiveSession();
    if (session.isActive) {
      showWidget();
    } else {
      resizeForPreview(false);
      scheduleHide();
    }
  }, POLL_INTERVAL_SESSION);
});

app.on('before-quit', () => {
  globalShortcut.unregisterAll();
  flushActivityHistory();
  stopHoverDetection();
  stopUpdateChecker();
  stopConversationTailer();
  destroyTray();
  if (sessionIntervalId !== null) {
    clearInterval(sessionIntervalId);
    sessionIntervalId = null;
  }
});

app.on('window-all-closed', () => {
  app.quit();
});
