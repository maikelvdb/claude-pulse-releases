import { BrowserWindow, screen } from 'electron';
import path from 'path';
import { WINDOW_WIDTH, WINDOW_HEIGHT, AUTO_HIDE_DELAY } from '../shared/constants';

let mainWindow: BrowserWindow | null = null;
let isVisible = true;
let hideTimeout: NodeJS.Timeout | null = null;
let mouseInTriggerZone = false;

export function createWindow(): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x: Math.round((screenWidth - WINDOW_WIDTH) / 2),
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setIgnoreMouseEvents(false);

  return mainWindow;
}

export function showWidget(): void {
  if (!mainWindow || isVisible) return;
  isVisible = true;
  mainWindow.webContents.send('widget:visibility', true);
  if (hideTimeout) clearTimeout(hideTimeout);
}

export function hideWidget(): void {
  if (!mainWindow || !isVisible) return;
  isVisible = false;
  mainWindow.webContents.send('widget:visibility', false);
}

export function scheduleHide(): void {
  if (hideTimeout) clearTimeout(hideTimeout);
  hideTimeout = setTimeout(() => {
    if (!mouseInTriggerZone) {
      hideWidget();
    }
  }, AUTO_HIDE_DELAY);
}

export function setMouseInZone(inZone: boolean): void {
  mouseInTriggerZone = inZone;
  if (inZone) {
    showWidget();
  } else {
    scheduleHide();
  }
}

export function getWindow(): BrowserWindow | null {
  return mainWindow;
}
