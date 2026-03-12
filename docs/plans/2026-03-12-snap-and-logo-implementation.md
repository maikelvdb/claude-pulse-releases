# Edge Snapping & Claude Logo Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Claude logo branding, replace free positioning with 4-edge snapping, and adapt layout orientation (horizontal/vertical) based on docked edge.

**Architecture:** Add a `SnapEdge` type (`top`/`bottom`/`left`/`right`) that flows through the system. Main process handles snap calculation, config persistence, and edge-aware trigger zones. Renderer receives the current edge via IPC and switches between horizontal (top/bottom) and vertical (left/right) layouts. A new ClaudeLogo component is added as the first element.

**Tech Stack:** Electron, React 18, TypeScript, Tailwind CSS v3

**Design doc:** `docs/plans/2026-03-12-snap-and-logo-design.md`

---

### Task 1: Add SnapEdge Type + Config Constants

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/constants.ts`

**Step 1: Add SnapEdge type and update ClaudeUsageState**

In `src/shared/types.ts`, add:

```typescript
export type SnapEdge = 'top' | 'bottom' | 'left' | 'right';

export interface PulseConfig {
  snapEdge: SnapEdge;
}
```

**Step 2: Add config path and dimensions to constants**

In `src/shared/constants.ts`, add:

```typescript
export const PULSE_CONFIG_FILE = path.join(CLAUDE_DIR, 'claude-pulse-config.json');

// Horizontal dimensions (top/bottom)
export const WINDOW_WIDTH_H = 480;
export const WINDOW_HEIGHT_H = 60;

// Vertical dimensions (left/right)
export const WINDOW_WIDTH_V = 80;
export const WINDOW_HEIGHT_V = 320;
```

And remove the old `WINDOW_WIDTH` and `WINDOW_HEIGHT` constants (they're replaced by the directional variants).

**Step 3: Commit**

```bash
git add src/shared/types.ts src/shared/constants.ts
git commit -m "feat: add SnapEdge type and directional window dimensions"
```

---

### Task 2: Config Persistence Service

**Files:**
- Create: `src/main/services/config-store.ts`

**Step 1: Create config store**

```typescript
// src/main/services/config-store.ts
import fs from 'fs';
import { PULSE_CONFIG_FILE } from '../../shared/constants';
import { SnapEdge, PulseConfig } from '../../shared/types';

const DEFAULT_CONFIG: PulseConfig = { snapEdge: 'top' };

export function loadConfig(): PulseConfig {
  try {
    if (!fs.existsSync(PULSE_CONFIG_FILE)) return { ...DEFAULT_CONFIG };
    const data = JSON.parse(fs.readFileSync(PULSE_CONFIG_FILE, 'utf-8'));
    const edge = data.snapEdge;
    if (['top', 'bottom', 'left', 'right'].includes(edge)) {
      return { snapEdge: edge as SnapEdge };
    }
    return { ...DEFAULT_CONFIG };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: PulseConfig): void {
  try {
    fs.writeFileSync(PULSE_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch {
    // Silently fail — non-critical
  }
}
```

**Step 2: Commit**

```bash
git add src/main/services/config-store.ts
git commit -m "feat: add config persistence for snap edge preference"
```

---

### Task 3: Rewrite Window Manager for Edge Snapping

**Files:**
- Modify: `src/main/window-manager.ts`

**Step 1: Rewrite window-manager.ts**

Replace the entire file. Key changes:
- `createWindow()` takes a `SnapEdge` parameter
- New `snapTo(edge)` function repositions + resizes window
- Position calculated from `screen.getPrimaryDisplay()` based on edge
- Drag-end detection via `will-move` / `moved` events — on release, calculate nearest edge and snap
- `getSnapEdge()` exported for other modules

```typescript
// src/main/window-manager.ts
import { BrowserWindow, screen } from 'electron';
import path from 'path';
import {
  WINDOW_WIDTH_H, WINDOW_HEIGHT_H,
  WINDOW_WIDTH_V, WINDOW_HEIGHT_V,
  AUTO_HIDE_DELAY,
} from '../shared/constants';
import { SnapEdge } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let isVisible = true;
let hideTimeout: NodeJS.Timeout | null = null;
let currentEdge: SnapEdge = 'top';
let onEdgeChange: ((edge: SnapEdge) => void) | null = null;

export function setOnEdgeChange(cb: (edge: SnapEdge) => void): void {
  onEdgeChange = cb;
}

function getPosition(edge: SnapEdge): { x: number; y: number; width: number; height: number } {
  const display = screen.getPrimaryDisplay();
  const { width: sw, height: sh } = display.workAreaSize;

  switch (edge) {
    case 'top':
      return { x: Math.round((sw - WINDOW_WIDTH_H) / 2), y: 0, width: WINDOW_WIDTH_H, height: WINDOW_HEIGHT_H };
    case 'bottom':
      return { x: Math.round((sw - WINDOW_WIDTH_H) / 2), y: sh - WINDOW_HEIGHT_H, width: WINDOW_WIDTH_H, height: WINDOW_HEIGHT_H };
    case 'left':
      return { x: 0, y: Math.round((sh - WINDOW_HEIGHT_V) / 2), width: WINDOW_WIDTH_V, height: WINDOW_HEIGHT_V };
    case 'right':
      return { x: sw - WINDOW_WIDTH_V, y: Math.round((sh - WINDOW_HEIGHT_V) / 2), width: WINDOW_WIDTH_V, height: WINDOW_HEIGHT_V };
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

export function getWindow(): BrowserWindow | null {
  return mainWindow;
}
```

**Step 2: Commit**

```bash
git add src/main/window-manager.ts
git commit -m "feat: rewrite window manager with 4-edge snapping"
```

---

### Task 4: Update Main Entry — Trigger Zones + Config

**Files:**
- Modify: `src/main/index.ts`

**Step 1: Rewrite index.ts**

Replace the entire file. Changes:
- Load config on startup
- Pass initial edge to `createWindow()`
- Save config on edge change
- Edge-aware cursor proximity detection

```typescript
// src/main/index.ts
import { app, screen } from 'electron';
import { createWindow, showWidget, scheduleHide, getWindow, getSnapEdge, setOnEdgeChange } from './window-manager';
import { setupIpcHandlers } from './ipc-handlers';
import { getActiveSession } from './services/session-watcher';
import { loadConfig, saveConfig } from './services/config-store';
import { POLL_INTERVAL_SESSION, WINDOW_WIDTH_H, WINDOW_HEIGHT_V } from '../shared/constants';
import path from 'path';

const isDev = !app.isPackaged;

app.whenReady().then(() => {
  const config = loadConfig();
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

app.on('window-all-closed', () => {
  app.quit();
});
```

**Step 2: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: edge-aware trigger zones and config persistence in main entry"
```

---

### Task 5: Update Preload + IPC for Snap Edge

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/main/ipc-handlers.ts`

**Step 1: Update preload to expose snap edge IPC**

Replace `src/preload/index.ts`:

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';
import { ClaudeUsageState, SnapEdge } from '../shared/types';

contextBridge.exposeInMainWorld('claudePulse', {
  onUsageUpdate: (callback: (state: ClaudeUsageState) => void) => {
    ipcRenderer.on('claude:usage-update', (_event, state) => callback(state));
  },
  onVisibility: (callback: (visible: boolean) => void) => {
    ipcRenderer.on('widget:visibility', (_event, visible) => callback(visible));
  },
  onSnapEdge: (callback: (edge: SnapEdge) => void) => {
    ipcRenderer.on('widget:snap-edge', (_event, edge) => callback(edge));
  },
  requestUpdate: () => {
    ipcRenderer.send('claude:request-update');
  },
  requestSnapEdge: () => {
    ipcRenderer.send('widget:request-snap-edge');
  },
});
```

**Step 2: Add snap edge request handler to ipc-handlers.ts**

Add to `setupIpcHandlers()` in `src/main/ipc-handlers.ts`, after the existing `ipcMain.on('claude:request-update', ...)`:

```typescript
import { getSnapEdge } from './window-manager';

// ... inside setupIpcHandlers():
ipcMain.on('widget:request-snap-edge', () => {
  mainWindow.webContents.send('widget:snap-edge', getSnapEdge());
});
```

**Step 3: Commit**

```bash
git add src/preload/index.ts src/main/ipc-handlers.ts
git commit -m "feat: add snap edge IPC channel"
```

---

### Task 6: Claude Logo Component

**Files:**
- Create: `src/renderer/components/ClaudeLogo.tsx`

**Step 1: Create ClaudeLogo component**

The Claude sparkle mark as an inline SVG + "Claude Pulse" text. Accepts an `orientation` prop for horizontal/vertical layout.

```tsx
// src/renderer/components/ClaudeLogo.tsx
import React from 'react';

interface ClaudeLogoProps {
  orientation: 'horizontal' | 'vertical';
}

export function ClaudeLogo({ orientation }: ClaudeLogoProps) {
  const isVertical = orientation === 'vertical';

  return (
    <div className={`flex items-center ${isVertical ? 'flex-col gap-1' : 'gap-1.5'}`}>
      <svg
        className="w-5 h-5 text-claude-orange flex-shrink-0"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M12 2C12 2 14.5 6.5 18 8C14.5 9.5 12 14 12 14C12 14 9.5 9.5 6 8C9.5 6.5 12 2 12 2Z" />
        <path d="M12 10C12 10 13.5 13 16 14C13.5 15 12 18 12 18C12 18 10.5 15 8 14C10.5 13 12 10 12 10Z" opacity="0.7" />
        <path d="M12 16C12 16 13 18 15 19C13 20 12 22 12 22C12 22 11 20 9 19C11 18 12 16 12 16Z" opacity="0.4" />
      </svg>
      <span className={`font-semibold text-claude-orange whitespace-nowrap ${isVertical ? 'text-[8px] [writing-mode:vertical-lr]' : 'text-[11px]'}`}>
        Claude Pulse
      </span>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/renderer/components/ClaudeLogo.tsx
git commit -m "feat: add ClaudeLogo component with sparkle icon"
```

---

### Task 7: Update LimitBar for Vertical Mode

**Files:**
- Modify: `src/renderer/components/LimitBar.tsx`

**Step 1: Update LimitBar to support vertical orientation**

Replace the entire file:

```tsx
// src/renderer/components/LimitBar.tsx
import React from 'react';

interface LimitBarProps {
  label: string;
  ratio: number; // 0-1
  orientation?: 'horizontal' | 'vertical';
}

export function LimitBar({ label, ratio, orientation = 'horizontal' }: LimitBarProps) {
  const percentage = Math.min(Math.round(ratio * 100), 100);
  const isWarning = ratio > 0.8;
  const isCritical = ratio > 0.95;

  const barColor = isCritical
    ? 'bg-red-500'
    : isWarning
    ? 'bg-yellow-500'
    : 'bg-claude-orange';

  if (orientation === 'vertical') {
    return (
      <div className="flex flex-col items-center gap-0.5 h-[50px]">
        <span className="text-[8px] text-claude-text-dim uppercase">{label}</span>
        <div className="w-2 flex-1 bg-claude-bar-bg rounded-full overflow-hidden flex flex-col-reverse">
          <div
            className={`w-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ height: `${percentage}%` }}
          />
        </div>
        <span className="text-[7px] text-claude-text-dim">{percentage}%</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 min-w-[100px]">
      <span className="text-[10px] text-claude-text-dim uppercase tracking-wider w-8">
        {label}
      </span>
      <div className="flex-1 h-2 bg-claude-bar-bg rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-[10px] text-claude-text-dim w-8 text-right">
        {percentage}%
      </span>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/renderer/components/LimitBar.tsx
git commit -m "feat: add vertical orientation to LimitBar"
```

---

### Task 8: Update StatusBar for Horizontal/Vertical Layout

**Files:**
- Modify: `src/renderer/components/StatusBar.tsx`

**Step 1: Rewrite StatusBar with orientation support**

Replace the entire file:

```tsx
// src/renderer/components/StatusBar.tsx
import React from 'react';
import { ClaudeLogo } from './ClaudeLogo';
import { SessionIndicator } from './SessionIndicator';
import { TokenCounter } from './TokenCounter';
import { LimitBar } from './LimitBar';
import { ClaudeUsageState, SnapEdge } from '../../shared/types';

interface StatusBarProps {
  state: ClaudeUsageState;
  snapEdge: SnapEdge;
}

function getBorderRadius(edge: SnapEdge): string {
  switch (edge) {
    case 'top': return 'rounded-b-lg';
    case 'bottom': return 'rounded-t-lg';
    case 'left': return 'rounded-r-lg';
    case 'right': return 'rounded-l-lg';
  }
}

export function StatusBar({ state, snapEdge }: StatusBarProps) {
  const isVertical = snapEdge === 'left' || snapEdge === 'right';
  const orientation = isVertical ? 'vertical' : 'horizontal';
  const radius = getBorderRadius(snapEdge);

  if (isVertical) {
    return (
      <div className={`flex flex-col items-center gap-2 px-2 py-3 bg-claude-bg border border-claude-border ${radius} shadow-lg w-[80px]`}>
        <ClaudeLogo orientation="vertical" />
        <div className="h-px w-8 bg-claude-border" />
        <SessionIndicator isActive={state.session.isActive} model={state.currentModel} orientation="vertical" />
        <div className="h-px w-8 bg-claude-border" />
        <TokenCounter tokens={state.tokens} orientation="vertical" />
        <div className="h-px w-8 bg-claude-border" />
        <div className="flex gap-2">
          <LimitBar label="H" ratio={state.limits.hourlyUsed} orientation="vertical" />
          <LimitBar label="W" ratio={state.limits.weeklyUsed} orientation="vertical" />
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 px-4 py-2 bg-claude-bg border border-claude-border ${radius} shadow-lg h-[60px]`}>
      <ClaudeLogo orientation="horizontal" />
      <div className="w-px h-6 bg-claude-border" />
      <SessionIndicator isActive={state.session.isActive} model={state.currentModel} orientation="horizontal" />
      <div className="w-px h-6 bg-claude-border" />
      <TokenCounter tokens={state.tokens} orientation="horizontal" />
      <div className="w-px h-6 bg-claude-border" />
      <div className="flex flex-col gap-1 flex-1">
        <LimitBar label="Hour" ratio={state.limits.hourlyUsed} orientation="horizontal" />
        <LimitBar label="Week" ratio={state.limits.weeklyUsed} orientation="horizontal" />
      </div>
    </div>
  );
}
```

**Step 2: Update SessionIndicator to accept orientation**

In `src/renderer/components/SessionIndicator.tsx`, add `orientation` prop:

```tsx
// src/renderer/components/SessionIndicator.tsx
import React from 'react';

interface SessionIndicatorProps {
  isActive: boolean;
  model: string | null;
  orientation?: 'horizontal' | 'vertical';
}

export function SessionIndicator({ isActive, model, orientation = 'horizontal' }: SessionIndicatorProps) {
  const isVertical = orientation === 'vertical';

  return (
    <div className={`flex items-center ${isVertical ? 'flex-col gap-1' : 'gap-2'}`}>
      <div className="relative">
        <div
          className={`w-2.5 h-2.5 rounded-full ${
            isActive ? 'bg-claude-active' : 'bg-claude-idle'
          }`}
        />
        {isActive && (
          <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-claude-active animate-ping opacity-40" />
        )}
      </div>
      <span className={`text-claude-text font-medium ${isVertical ? 'text-[8px] [writing-mode:vertical-lr]' : 'text-xs'}`}>
        {model ?? 'Idle'}
      </span>
    </div>
  );
}
```

**Step 3: Update TokenCounter to accept orientation**

In `src/renderer/components/TokenCounter.tsx`, add `orientation` prop:

```tsx
// src/renderer/components/TokenCounter.tsx
import React from 'react';
import { TokenUsage } from '../../shared/types';

interface TokenCounterProps {
  tokens: TokenUsage;
  orientation?: 'horizontal' | 'vertical';
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function TokenCounter({ tokens, orientation = 'horizontal' }: TokenCounterProps) {
  const total = tokens.inputToday + tokens.outputToday;
  const isVertical = orientation === 'vertical';

  return (
    <div className={`flex items-center ${isVertical ? 'flex-col gap-0.5' : 'gap-1'}`}>
      <svg className="w-3 h-3 text-claude-orange flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2.5a1 1 0 011 1v3.25l2.1 1.25a1 1 0 01-1 1.73L7.5 8.75V4.5a1 1 0 011-1z" />
      </svg>
      <span className={`text-claude-text font-mono ${isVertical ? 'text-[9px]' : 'text-xs'}`}>
        {formatTokens(total)}
      </span>
      {!isVertical && <span className="text-[10px] text-claude-text-dim">tokens</span>}
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add src/renderer/components/StatusBar.tsx src/renderer/components/SessionIndicator.tsx src/renderer/components/TokenCounter.tsx
git commit -m "feat: orientation-aware StatusBar, SessionIndicator, TokenCounter"
```

---

### Task 9: Update App + useClaudeStats for Snap Edge

**Files:**
- Modify: `src/renderer/hooks/useClaudeStats.ts`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles/globals.css`

**Step 1: Update useClaudeStats hook to track snap edge**

Replace `src/renderer/hooks/useClaudeStats.ts`:

```typescript
// src/renderer/hooks/useClaudeStats.ts
import { useState, useEffect } from 'react';
import { ClaudeUsageState, SnapEdge } from '../../shared/types';

declare global {
  interface Window {
    claudePulse: {
      onUsageUpdate: (callback: (state: ClaudeUsageState) => void) => void;
      onVisibility: (callback: (visible: boolean) => void) => void;
      onSnapEdge: (callback: (edge: SnapEdge) => void) => void;
      requestUpdate: () => void;
      requestSnapEdge: () => void;
    };
  }
}

const defaultState: ClaudeUsageState = {
  session: { isActive: false, pid: null, workspace: null, ideName: null },
  currentModel: null,
  tokens: { inputToday: 0, outputToday: 0, cacheReadToday: 0 },
  limits: { hourlyUsed: 0, hourlyEstimate: 0, weeklyUsed: 0, weeklyEstimate: 0 },
  plan: { subscriptionType: 'unknown', rateLimitTier: 'unknown' },
};

export function useClaudeStats() {
  const [state, setState] = useState<ClaudeUsageState>(defaultState);
  const [snapEdge, setSnapEdge] = useState<SnapEdge>('top');

  useEffect(() => {
    window.claudePulse.onUsageUpdate((newState) => setState(newState));
    window.claudePulse.onSnapEdge((edge) => setSnapEdge(edge));
    window.claudePulse.requestUpdate();
    window.claudePulse.requestSnapEdge();
  }, []);

  return { state, snapEdge };
}
```

**Step 2: Update App.tsx with edge-aware animations**

Replace `src/renderer/App.tsx`:

```tsx
// src/renderer/App.tsx
import React, { useState, useEffect } from 'react';
import { StatusBar } from './components/StatusBar';
import { useClaudeStats } from './hooks/useClaudeStats';
import { SnapEdge } from '../shared/types';

function getTranslateClass(edge: SnapEdge, visible: boolean): string {
  if (visible) return 'translate-x-0 translate-y-0 opacity-100';

  switch (edge) {
    case 'top': return '-translate-y-full opacity-0';
    case 'bottom': return 'translate-y-full opacity-0';
    case 'left': return '-translate-x-full opacity-0';
    case 'right': return 'translate-x-full opacity-0';
  }
}

export default function App() {
  const { state, snapEdge } = useClaudeStats();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    window.claudePulse.onVisibility?.((v: boolean) => setVisible(v));
  }, []);

  const translateClass = getTranslateClass(snapEdge, visible);

  return (
    <div className={`w-full h-full transition-all duration-300 ease-in-out ${translateClass}`}>
      <StatusBar state={state} snapEdge={snapEdge} />
    </div>
  );
}
```

**Step 3: Clean up globals.css**

Remove the old `.widget-enter`, `.widget-visible`, `.widget-hidden` classes from `src/renderer/styles/globals.css` since animations are now handled by Tailwind classes in App.tsx. Keep the rest.

```css
/* src/renderer/styles/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  -webkit-app-region: drag;
}

body {
  background: transparent;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
```

**Step 4: Commit**

```bash
git add src/renderer/hooks/useClaudeStats.ts src/renderer/App.tsx src/renderer/styles/globals.css
git commit -m "feat: edge-aware animations and snap edge state in renderer"
```

---

### Task 10: Update Constants References + Build Verification

**Files:**
- Modify: `src/main/ipc-handlers.ts` (if needed — verify no references to old WINDOW_WIDTH)
- Verify build

**Step 1: Search for old WINDOW_WIDTH/WINDOW_HEIGHT references**

```bash
grep -r "WINDOW_WIDTH\b\|WINDOW_HEIGHT\b" src/ --include="*.ts" --include="*.tsx"
```

Fix any remaining references to use `WINDOW_WIDTH_H`/`WINDOW_HEIGHT_H` or `WINDOW_WIDTH_V`/`WINDOW_HEIGHT_V` as appropriate.

**Step 2: Verify full build**

```bash
npm run build
```

Expected: All webpack compilations succeed with zero errors.

**Step 3: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: update remaining constant references and verify build"
```

---

## Task Summary

| Task | Description | Depends On |
|------|-------------|------------|
| 1 | SnapEdge type + dimension constants | — |
| 2 | Config persistence service | 1 |
| 3 | Rewrite window manager for snapping | 1 |
| 4 | Update main entry (trigger zones + config) | 2, 3 |
| 5 | Update preload + IPC for snap edge | 1 |
| 6 | ClaudeLogo component | — |
| 7 | LimitBar vertical mode | — |
| 8 | StatusBar + components orientation | 6, 7 |
| 9 | App + hook + CSS for edge-aware animations | 5, 8 |
| 10 | Fix references + build verification | all |

**Parallelizable groups:**
- Tasks 2, 3, 5 (main process changes) — independent after Task 1
- Tasks 6, 7 (new/updated components) — independent of everything
