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
let hideTimeout: NodeJS.Timeout | null = null;
let currentEdge: SnapEdge = 'top';
let onEdgeChange: ((edge: SnapEdge) => void) | null = null;
let isExpanded = false;

export function setOnEdgeChange(cb: (edge: SnapEdge) => void): void {
  onEdgeChange = cb;
}

function getPosition(edge: SnapEdge): { x: number; y: number; width: number; height: number } {
  const display = screen.getPrimaryDisplay();
  const { width: sw, height: sh } = display.workAreaSize;

  const wH = WINDOW_WIDTH_H;
  const hH = isExpanded ? WINDOW_HEIGHT_H_EXPANDED : WINDOW_HEIGHT_H;
  const wV = isExpanded ? WINDOW_WIDTH_V_EXPANDED : WINDOW_WIDTH_V;
  const hV = WINDOW_HEIGHT_V;

  switch (edge) {
    case 'top':
      return { x: Math.round((sw - wH) / 2), y: 0, width: wH, height: hH };
    case 'bottom':
      return { x: Math.round((sw - wH) / 2), y: sh - hH, width: wH, height: hH };
    case 'left':
      return { x: 0, y: Math.round((sh - hV) / 2), width: wV, height: hV };
    case 'right':
      return { x: sw - wV, y: Math.round((sh - hV) / 2), width: wV, height: hV };
  }
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
    focusable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setIgnoreMouseEvents(false);

  // On drag end, snap to nearest edge
  mainWindow.on('moved', () => {
    if (!mainWindow) return;
    const [wx, wy] = mainWindow.getPosition();
    const [ww, wh] = mainWindow.getSize();
    const centerX = wx + ww / 2;
    const centerY = wy + wh / 2;
    const edge = nearestEdge(centerX, centerY);
    if (edge !== currentEdge) {
      snapTo(edge);
      onEdgeChange?.(edge);
    } else {
      // Snap back to correct position on same edge
      const pos = getPosition(currentEdge);
      mainWindow.setBounds({ x: pos.x, y: pos.y, width: pos.width, height: pos.height });
    }
  });

  return mainWindow;
}

export function snapTo(edge: SnapEdge): void {
  if (!mainWindow) return;
  currentEdge = edge;
  const pos = getPosition(edge);
  mainWindow.setBounds({ x: pos.x, y: pos.y, width: pos.width, height: pos.height });
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
  const display = screen.getPrimaryDisplay();
  const { width: sw, height: sh } = display.workAreaSize;
  const isVertical = currentEdge === 'left' || currentEdge === 'right';

  let width: number, height: number, x: number, y: number;

  if (isVertical) {
    width = expanded ? WINDOW_WIDTH_V_EXPANDED : WINDOW_WIDTH_V;
    height = WINDOW_HEIGHT_V;
    y = Math.round((sh - height) / 2);
    x = currentEdge === 'left' ? 0 : sw - width;
  } else {
    width = WINDOW_WIDTH_H;
    height = expanded ? WINDOW_HEIGHT_H_EXPANDED : WINDOW_HEIGHT_H;
    x = Math.round((sw - width) / 2);
    y = currentEdge === 'top' ? 0 : sh - height;
  }

  mainWindow.setBounds({ x, y, width, height });
}

export function getWindow(): BrowserWindow | null {
  return mainWindow;
}
