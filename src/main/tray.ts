import { Tray, Menu, app, nativeImage } from 'electron';
import path from 'path';
import { getWindow, showWidget, hideWidget } from './window-manager';
import { openHelpWindow } from './ipc-handlers';

let tray: Tray | null = null;

export function createTray(): void {
  // Use the app icon for the tray
  const iconPath = path.join(__dirname, '..', '..', 'build', 'icon.png');
  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } catch {
    // Fallback: create a simple orange square
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
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
