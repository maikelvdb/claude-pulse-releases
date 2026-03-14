import { Tray, Menu, app, nativeImage } from 'electron';
import path from 'path';
import { getWindow, showWidget, hideWidget } from './window-manager';
import { openHelpWindow } from './ipc-handlers';
import { getConfig, saveConfig } from './services/config-store';
import { getTodayTokenUsage } from './services/stats-reader';
import { getCachedCliStatus } from './services/cli-status-poller';
import { getActiveSession } from './services/session-watcher';

let tray: Tray | null = null;
let refreshIntervalId: ReturnType<typeof setInterval> | null = null;

function getTrayIcon(): Electron.NativeImage {
  const basePath = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar', 'build')
    : path.join(__dirname, '..', '..', 'build');

  const icoPath = path.join(basePath, process.platform === 'win32' ? 'icon.ico' : 'icon.png');
  const icon = nativeImage.createFromPath(icoPath);

  if (icon.isEmpty()) {
    const pngPath = path.join(basePath, 'icon.png');
    const pngIcon = nativeImage.createFromPath(pngPath);
    return pngIcon.isEmpty() ? nativeImage.createEmpty() : pngIcon.resize({ width: 16, height: 16 });
  }

  return icon.resize({ width: 16, height: 16 });
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

function buildContextMenu(): Menu {
  const tokens = getTodayTokenUsage();
  const cli = getCachedCliStatus();
  const session = getActiveSession();
  const total = tokens.inputToday + tokens.outputToday;

  const sessionLabel = session.isActive ? 'Active' : 'Idle';
  const hourlyLabel = cli ? `${cli.sessionPercent}%` : '--';
  const weeklyLabel = cli ? `${cli.weeklyPercent}%` : '--';

  return Menu.buildFromTemplate([
    { label: `Session: ${sessionLabel}`, enabled: false },
    { label: `Tokens today: ${formatTokens(total)}`, enabled: false },
    { label: `5h limit: ${hourlyLabel}  |  Weekly: ${weeklyLabel}`, enabled: false },
    { type: 'separator' },
    {
      label: 'Show / Hide',
      click: () => {
        const win = getWindow();
        if (!win) return;
        if (win.isVisible()) hideWidget();
        else showWidget();
      },
    },
    {
      label: 'Help & Settings',
      click: () => openHelpWindow(),
    },
    {
      label: 'Mute Sounds',
      type: 'checkbox',
      checked: !!getConfig().soundMuted,
      click: (menuItem) => {
        saveConfig({ soundMuted: menuItem.checked });
        getWindow()?.webContents.send('widget:sound-muted', menuItem.checked);
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ]);
}

function updateTray(): void {
  if (!tray) return;
  const tokens = getTodayTokenUsage();
  const cli = getCachedCliStatus();
  const session = getActiveSession();
  const total = tokens.inputToday + tokens.outputToday;

  const status = session.isActive ? 'Active' : 'Idle';
  const hourly = cli ? `${cli.sessionPercent}%` : '--';
  const weekly = cli ? `${cli.weeklyPercent}%` : '--';

  tray.setToolTip(`Claude Pulse — ${status}\nTokens: ${formatTokens(total)}\n5h: ${hourly} | Weekly: ${weekly}`);
  tray.setContextMenu(buildContextMenu());
}

export function createTray(): void {
  tray = new Tray(getTrayIcon());
  updateTray();

  tray.on('click', () => {
    const win = getWindow();
    if (win) showWidget();
  });

  // Refresh tray stats every 10s
  refreshIntervalId = setInterval(updateTray, 10_000);
}

export function destroyTray(): void {
  if (refreshIntervalId) {
    clearInterval(refreshIntervalId);
    refreshIntervalId = null;
  }
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
