import { app, screen } from 'electron';
import { createWindow, showWidget, scheduleHide, getWindow } from './window-manager';
import { setupIpcHandlers } from './ipc-handlers';
import { getActiveSession } from './services/session-watcher';
import { POLL_INTERVAL_SESSION, WINDOW_WIDTH } from '../shared/constants';
import path from 'path';

const isDev = !app.isPackaged;

app.whenReady().then(() => {
  const win = createWindow();

  if (isDev) {
    win.loadURL('http://localhost:3000');
  } else {
    win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }

  setupIpcHandlers(win);

  // Monitor for active sessions to auto-show
  setInterval(() => {
    const session = getActiveSession();
    if (session.isActive) {
      showWidget();
    } else {
      scheduleHide();
    }
  }, POLL_INTERVAL_SESSION);

  // Mouse proximity detection via polling screen cursor
  setInterval(() => {
    const point = screen.getCursorScreenPoint();
    const display = screen.getPrimaryDisplay();
    const centerX = display.workAreaSize.width / 2;
    const inZone = point.y <= 10 &&
      Math.abs(point.x - centerX) <= WINDOW_WIDTH / 2 + 50;

    const currentWin = getWindow();
    if (inZone && currentWin) {
      showWidget();
    }
  }, 200);
});

app.on('window-all-closed', () => {
  app.quit();
});
