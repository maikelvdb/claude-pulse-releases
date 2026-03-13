// src/main/window-manager.ts
import { BrowserWindow, screen } from 'electron';
import path from 'path';
import {
  WINDOW_WIDTH_H, WINDOW_HEIGHT_H,
  WINDOW_WIDTH_V, WINDOW_HEIGHT_V,
  WINDOW_HEIGHT_H_EXPANDED, WINDOW_WIDTH_V_EXPANDED,
  AUTO_HIDE_DELAY,
} from '../shared/constants';
import { SnapEdge } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let isVisible = true;
let isHovered = false;
let hideTimeout: NodeJS.Timeout | null = null;
let currentEdge: SnapEdge = 'top';
let onEdgeChange: ((edge: SnapEdge) => void) | null = null;
let isExpanded = false;
let cachedBounds: Electron.Rectangle | null = null;

// User-chosen offset along the snapped edge (null = centered)
let userOffset: number | null = null;

export function setOnEdgeChange(cb: (edge: SnapEdge) => void): void {
  onEdgeChange = cb;
}

function isHorizontalEdge(edge: SnapEdge): boolean {
  return edge === 'top' || edge === 'bottom';
}

function getWindowSize(edge: SnapEdge): { width: number; height: number } {
  if (isHorizontalEdge(edge)) {
    return {
      width: WINDOW_WIDTH_H,
      height: isExpanded ? WINDOW_HEIGHT_H_EXPANDED : WINDOW_HEIGHT_H,
    };
  }
  return {
    width: isExpanded ? WINDOW_WIDTH_V_EXPANDED : WINDOW_WIDTH_V,
    height: WINDOW_HEIGHT_V,
  };
}

function getPosition(edge: SnapEdge): { x: number; y: number; width: number; height: number } {
  const display = screen.getPrimaryDisplay();
  const { width: sw, height: sh } = display.workAreaSize;
  const { width, height } = getWindowSize(edge);

  let x: number, y: number;

  if (isHorizontalEdge(edge)) {
    // Slide along X axis
    const offset = userOffset ?? Math.round((sw - width) / 2);
    x = clamp(offset, 0, sw - width);
    y = edge === 'top' ? 0 : sh - height;
  } else {
    // Slide along Y axis
    const offset = userOffset ?? Math.round((sh - height) / 2);
    x = edge === 'left' ? 0 : sw - width;
    y = clamp(offset, 0, sh - height);
  }

  return { x, y, width, height };
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function nearestEdge(x: number, y: number): SnapEdge {
  const display = screen.getPrimaryDisplay();
  const { width: sw, height: sh } = display.workAreaSize;

  const distances: [SnapEdge, number][] = [
    ['top', y],
    ['bottom', sh - y],
    ['left', x],
    ['right', sw - x],
  ];

  distances.sort((a, b) => a[1] - b[1]);
  return distances[0][0];
}

function applyBounds(pos: { x: number; y: number; width: number; height: number }): void {
  if (!mainWindow) return;
  mainWindow.setBounds(pos);
  cachedBounds = pos;
}

export function createWindow(initialEdge: SnapEdge): BrowserWindow {
  currentEdge = initialEdge;
  const pos = getPosition(currentEdge);

  mainWindow = new BrowserWindow({
    width: pos.width,
    height: pos.height,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  cachedBounds = pos;

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setIgnoreMouseEvents(false);

  // On drag end: allow sliding along the edge, or snap to a new edge
  mainWindow.on('moved', () => {
    if (!mainWindow) return;
    const [wx, wy] = mainWindow.getPosition();
    const [ww, wh] = mainWindow.getSize();
    const centerX = wx + ww / 2;
    const centerY = wy + wh / 2;
    const edge = nearestEdge(centerX, centerY);

    if (edge !== currentEdge) {
      // Crossed to a different edge — snap there, reset offset to centered
      userOffset = null;
      snapTo(edge);
      onEdgeChange?.(edge);
    } else {
      // Same edge — save the user's position along the edge, clamped to screen
      const display = screen.getPrimaryDisplay();
      const { width: sw, height: sh } = display.workAreaSize;

      if (isHorizontalEdge(currentEdge)) {
        userOffset = clamp(wx, 0, sw - ww);
      } else {
        userOffset = clamp(wy, 0, sh - wh);
      }

      const pos = getPosition(currentEdge);
      applyBounds(pos);
    }
  });

  return mainWindow;
}

export function snapTo(edge: SnapEdge): void {
  if (!mainWindow) return;
  currentEdge = edge;
  const pos = getPosition(edge);
  applyBounds(pos);
  mainWindow.webContents.send('widget:snap-edge', edge);
}

export function getSnapEdge(): SnapEdge {
  return currentEdge;
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
    hideWidget();
  }, AUTO_HIDE_DELAY);
}

export function resizeForExpand(expanded: boolean): void {
  if (!mainWindow) return;
  isExpanded = expanded;
  const pos = getPosition(currentEdge);
  applyBounds(pos);
}

let hoverIntervalId: ReturnType<typeof setInterval> | null = null;

export function startHoverDetection(): void {
  hoverIntervalId = setInterval(() => {
    if (!mainWindow) return;
    const point = screen.getCursorScreenPoint();
    const bounds = cachedBounds ?? mainWindow.getBounds();

    // Hover detection
    const inside =
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height;

    if (inside !== isHovered) {
      isHovered = inside;
      mainWindow.webContents.send('widget:hover', inside);
    }

    // Proximity detection — show widget when cursor is near the widget's actual position
    const margin = 10;
    const display = screen.getPrimaryDisplay();
    const { width: sw, height: sh } = display.workAreaSize;

    let inZone = false;
    switch (currentEdge) {
      case 'top':
        inZone = point.y <= margin &&
          point.x >= bounds.x - 50 && point.x <= bounds.x + bounds.width + 50;
        break;
      case 'bottom':
        inZone = point.y >= sh - margin &&
          point.x >= bounds.x - 50 && point.x <= bounds.x + bounds.width + 50;
        break;
      case 'left':
        inZone = point.x <= margin &&
          point.y >= bounds.y - 50 && point.y <= bounds.y + bounds.height + 50;
        break;
      case 'right':
        inZone = point.x >= sw - margin &&
          point.y >= bounds.y - 50 && point.y <= bounds.y + bounds.height + 50;
        break;
    }

    if (inZone) {
      showWidget();
    }
  }, 100);
}

export function stopHoverDetection(): void {
  if (hoverIntervalId !== null) {
    clearInterval(hoverIntervalId);
    hoverIntervalId = null;
  }
}

export function getWindow(): BrowserWindow | null {
  return mainWindow;
}
