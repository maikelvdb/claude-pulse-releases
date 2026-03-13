// src/main/window-manager.ts
import { BrowserWindow, screen } from 'electron';
import path from 'path';
import {
  WINDOW_WIDTH_H, WINDOW_HEIGHT_H, WINDOW_HEIGHT_H_PREVIEW,
  WINDOW_WIDTH_V, WINDOW_HEIGHT_V, WINDOW_HEIGHT_V_PREVIEW,
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
let hasPreview = false;
let positionLocked = false;

export function setPositionLocked(locked: boolean): void {
  positionLocked = locked;
  if (mainWindow) {
    mainWindow.setMovable(!locked);
  }
}


let cachedBounds: Electron.Rectangle | null = null;

// User-chosen offset along the snapped edge (null = centered)
let userOffset: number | null = null;
let onOffsetChange: ((offset: number | null) => void) | null = null;

export function setOnOffsetChange(cb: (offset: number | null) => void): void {
  onOffsetChange = cb;
}

export function setOnEdgeChange(cb: (edge: SnapEdge) => void): void {
  onEdgeChange = cb;
}

function isHorizontalEdge(edge: SnapEdge): boolean {
  return edge === 'top' || edge === 'bottom';
}

function getWindowSize(edge: SnapEdge): { width: number; height: number } {
  if (isHorizontalEdge(edge)) {
    let h = WINDOW_HEIGHT_H;
    if (isExpanded) h = WINDOW_HEIGHT_H_EXPANDED;
    else if (hasPreview) h = WINDOW_HEIGHT_H_PREVIEW;
    return { width: WINDOW_WIDTH_H, height: h };
  }
  return {
    width: isExpanded ? WINDOW_WIDTH_V_EXPANDED : WINDOW_WIDTH_V,
    height: hasPreview ? WINDOW_HEIGHT_V_PREVIEW : WINDOW_HEIGHT_V,
  };
}

function getCurrentDisplay(): Electron.Display {
  if (mainWindow) {
    const bounds = mainWindow.getBounds();
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    return screen.getDisplayNearestPoint(center);
  }
  return screen.getPrimaryDisplay();
}

function getPosition(edge: SnapEdge): { x: number; y: number; width: number; height: number } {
  const display = getCurrentDisplay();
  const wa = display.workArea; // absolute coordinates: { x, y, width, height }
  const { width, height } = getWindowSize(edge);

  let x: number, y: number;

  if (isHorizontalEdge(edge)) {
    // Slide along X axis (offset is relative to workArea left)
    const offset = userOffset ?? Math.round((wa.width - width) / 2);
    x = wa.x + clamp(offset, 0, wa.width - width);
    y = edge === 'top' ? wa.y : wa.y + wa.height - height;
  } else {
    // Slide along Y axis (offset is relative to workArea top)
    const offset = userOffset ?? Math.round((wa.height - height) / 2);
    x = edge === 'left' ? wa.x : wa.x + wa.width - width;
    y = wa.y + clamp(offset, 0, wa.height - height);
  }

  return { x, y, width, height };
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function nearestEdge(x: number, y: number): SnapEdge {
  const display = screen.getDisplayNearestPoint({ x, y });
  const wa = display.workArea;

  const distances: [SnapEdge, number][] = [
    ['top', y - wa.y],
    ['bottom', (wa.y + wa.height) - y],
    ['left', x - wa.x],
    ['right', (wa.x + wa.width) - x],
  ];

  distances.sort((a, b) => a[1] - b[1]);
  return distances[0][0];
}

function applyBounds(pos: { x: number; y: number; width: number; height: number }): void {
  if (!mainWindow) return;
  mainWindow.setBounds(pos);
  cachedBounds = pos;
}

export function createWindow(initialEdge: SnapEdge, initialOffset?: number | null): BrowserWindow {
  currentEdge = initialEdge;
  userOffset = initialOffset ?? null;
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
      onOffsetChange?.(null);
    } else {
      // Same edge — save the user's position along the edge, relative to workArea origin
      const display = screen.getDisplayNearestPoint({ x: centerX, y: centerY });
      const wa = display.workArea;

      if (isHorizontalEdge(currentEdge)) {
        userOffset = clamp(wx - wa.x, 0, wa.width - ww);
      } else {
        userOffset = clamp(wy - wa.y, 0, wa.height - wh);
      }

      const pos = getPosition(currentEdge);
      applyBounds(pos);
      onOffsetChange?.(userOffset);
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

export function resizeForPreview(preview: boolean): void {
  if (!mainWindow || hasPreview === preview) return;
  hasPreview = preview;
  if (!isExpanded) {
    const pos = getPosition(currentEdge);
    applyBounds(pos);
  }
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
    const display = screen.getDisplayNearestPoint(point);
    const wa = display.workArea;

    let inZone = false;
    switch (currentEdge) {
      case 'top':
        inZone = point.y <= wa.y + margin &&
          point.x >= bounds.x - 50 && point.x <= bounds.x + bounds.width + 50;
        break;
      case 'bottom':
        inZone = point.y >= wa.y + wa.height - margin &&
          point.x >= bounds.x - 50 && point.x <= bounds.x + bounds.width + 50;
        break;
      case 'left':
        inZone = point.x <= wa.x + margin &&
          point.y >= bounds.y - 50 && point.y <= bounds.y + bounds.height + 50;
        break;
      case 'right':
        inZone = point.x >= wa.x + wa.width - margin &&
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
