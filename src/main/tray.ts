import { Tray, Menu, app, nativeImage } from 'electron';
import path from 'path';
import { getWindow, showWidget, hideWidget } from './window-manager';
import { openHelpWindow } from './ipc-handlers';
import { getConfig, saveConfig } from './services/config-store';

let tray: Tray | null = null;

function getTrayIcon(): Electron.NativeImage {
  // In packaged app: resources/app.asar/build/icon.ico
  // In dev: project-root/build/icon.ico
  const basePath = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar', 'build')
    : path.join(__dirname, '..', '..', 'build');

  const icoPath = path.join(basePath, process.platform === 'win32' ? 'icon.ico' : 'icon.png');
  const icon = nativeImage.createFromPath(icoPath);

  if (icon.isEmpty()) {
    // Fallback: try .png
    const pngPath = path.join(basePath, 'icon.png');
    const pngIcon = nativeImage.createFromPath(pngPath);
    return pngIcon.isEmpty() ? nativeImage.createEmpty() : pngIcon.resize({ width: 16, height: 16 });
  }

  return icon.resize({ width: 16, height: 16 });
}

export function createTray(): void {
  tray = new Tray(getTrayIcon());
  tray.setToolTip('Claude Pulse');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show / Hide',
      click: () => {
        const win = getWindow();
        if (!win) return;
        if (win.isVisible()) {
          hideWidget();
        } else {
          showWidget();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Help',
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

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    const win = getWindow();
    if (win) {
      showWidget();
    }
  });
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
