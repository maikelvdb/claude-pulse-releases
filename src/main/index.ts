// src/main/index.ts
import { app, screen } from 'electron';
import { createWindow, showWidget, scheduleHide, getWindow, getSnapEdge, setOnEdgeChange } from './window-manager';
import { setupIpcHandlers } from './ipc-handlers';
import { getActiveSession } from './services/session-watcher';
import { loadConfig, saveConfig } from './services/config-store';
import { loadActivityHistory, flushActivityHistory } from './services/activity-store';
import { POLL_INTERVAL_SESSION, WINDOW_WIDTH_H, WINDOW_HEIGHT_V } from '../shared/constants';
import path from 'path';

const isDev = !app.isPackaged;

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

  // Persist edge changes
  setOnEdgeChange((edge) => {
    saveConfig({ snapEdge: edge });
  });

  // Monitor for active sessions to auto-show
  setInterval(() => {
    const session = getActiveSession();
    if (session.isActive) {
      showWidget();
    } else {
      scheduleHide();
    }
  }, POLL_INTERVAL_SESSION);

  // Mouse proximity detection — adapts to current snap edge
  setInterval(() => {
    const point = screen.getCursorScreenPoint();
    const display = screen.getPrimaryDisplay();
    const { width: sw, height: sh } = display.workAreaSize;
    const edge = getSnapEdge();
    const margin = 10;

    let inZone = false;
    switch (edge) {
      case 'top':
        inZone = point.y <= margin && Math.abs(point.x - sw / 2) <= WINDOW_WIDTH_H / 2 + 50;
        break;
      case 'bottom':
        inZone = point.y >= sh - margin && Math.abs(point.x - sw / 2) <= WINDOW_WIDTH_H / 2 + 50;
        break;
      case 'left':
        inZone = point.x <= margin && Math.abs(point.y - sh / 2) <= WINDOW_HEIGHT_V / 2 + 50;
        break;
      case 'right':
        inZone = point.x >= sw - margin && Math.abs(point.y - sh / 2) <= WINDOW_HEIGHT_V / 2 + 50;
        break;
    }

    if (inZone && getWindow()) {
      showWidget();
    }
  }, 200);
});

app.on('before-quit', () => {
  flushActivityHistory();
});

app.on('window-all-closed', () => {
  app.quit();
});
