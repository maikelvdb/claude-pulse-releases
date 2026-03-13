# Claude Pulse Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a cross-platform Electron widget that shows Claude Code usage stats in a slim auto-hiding bar at the top-center of the screen.

**Architecture:** Electron main process runs file-watching services that poll `~/.claude/` for session locks, stats, and credentials. Data is sent via IPC to a React renderer that displays a frameless, always-on-top status bar with session indicator, token counter, and limit progress bars.

**Tech Stack:** Electron, React 18, TypeScript, Tailwind CSS v4, chokidar, electron-builder

**Design doc:** `docs/plans/2026-03-12-claude-pulse-design.md`

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.main.json`
- Create: `tsconfig.renderer.json`
- Create: `tailwind.config.js`
- Create: `postcss.config.js`
- Create: `electron-builder.yml`
- Create: `webpack.main.config.ts`
- Create: `webpack.renderer.config.ts`

**Step 1: Initialize project**

```bash
cd C:/repos/windows
npm init -y
```

**Step 2: Install dependencies**

```bash
npm install react react-dom
npm install -D electron typescript @types/react @types/react-dom \
  tailwindcss postcss autoprefixer \
  webpack webpack-cli webpack-dev-server \
  ts-loader css-loader style-loader postcss-loader \
  html-webpack-plugin \
  electron-builder \
  concurrently wait-on
```

**Step 3: Create `tsconfig.json`**

Base config extending into main and renderer configs:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "jsx": "react-jsx",
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

**Step 4: Create `tsconfig.main.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "CommonJS",
    "outDir": "./dist/main",
    "jsx": undefined
  },
  "include": ["src/main/**/*", "src/shared/**/*"]
}
```

**Step 5: Create `tsconfig.renderer.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist/renderer"
  },
  "include": ["src/renderer/**/*", "src/shared/**/*"]
}
```

**Step 6: Create Tailwind config**

```js
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        'claude-bg': '#1e1e2e',
        'claude-orange': '#E87443',
        'claude-text': '#cccccc',
        'claude-text-dim': '#888888',
        'claude-active': '#4ade80',
        'claude-idle': '#6b7280',
        'claude-bar-bg': '#2a2a3e',
        'claude-border': '#333346',
      },
    },
  },
  plugins: [],
};
```

**Step 7: Create webpack configs for main + renderer**

Main process webpack bundles TypeScript to CommonJS for Electron. Renderer webpack bundles React + Tailwind with HtmlWebpackPlugin.

**Step 8: Set up npm scripts in `package.json`**

```json
{
  "main": "dist/main/index.js",
  "scripts": {
    "dev": "concurrently \"npm run dev:renderer\" \"wait-on http://localhost:3000 && npm run dev:main\"",
    "dev:main": "tsc -p tsconfig.main.json && electron .",
    "dev:renderer": "webpack serve --config webpack.renderer.config.ts",
    "build": "npm run build:main && npm run build:renderer",
    "build:main": "tsc -p tsconfig.main.json",
    "build:renderer": "webpack --config webpack.renderer.config.ts --mode production",
    "package": "npm run build && electron-builder"
  }
}
```

**Step 9: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold Electron + React + TypeScript + Tailwind project"
```

---

### Task 2: Shared Types

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/constants.ts`

**Step 1: Create shared types**

```typescript
// src/shared/types.ts
export interface SessionInfo {
  isActive: boolean;
  pid: number | null;
  workspace: string | null;
  ideName: string | null;
}

export interface TokenUsage {
  inputToday: number;
  outputToday: number;
  cacheReadToday: number;
}

export interface UsageLimits {
  hourlyUsed: number;       // 0-1 ratio
  hourlyEstimate: number;   // estimated max tokens/hour
  weeklyUsed: number;       // 0-1 ratio
  weeklyEstimate: number;   // estimated max tokens/week
}

export interface PlanInfo {
  subscriptionType: string;
  rateLimitTier: string;
}

export interface ClaudeUsageState {
  session: SessionInfo;
  currentModel: string | null;
  tokens: TokenUsage;
  limits: UsageLimits;
  plan: PlanInfo;
}

export interface IpcChannels {
  'claude:usage-update': ClaudeUsageState;
  'claude:request-update': void;
}
```

**Step 2: Create constants**

```typescript
// src/shared/constants.ts
import path from 'path';
import os from 'os';

export const CLAUDE_DIR = path.join(os.homedir(), '.claude');
export const IDE_LOCK_DIR = path.join(CLAUDE_DIR, 'ide');
export const STATS_CACHE_FILE = path.join(CLAUDE_DIR, 'stats-cache.json');
export const CREDENTIALS_FILE = path.join(CLAUDE_DIR, '.credentials.json');
export const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');

export const POLL_INTERVAL_SESSION = 2000;   // 2s
export const POLL_INTERVAL_STATS = 10000;    // 10s
export const POLL_INTERVAL_JSONL = 30000;    // 30s

export const AUTO_HIDE_DELAY = 3000;         // 3s
export const ANIMATION_DURATION = 300;       // 300ms

export const WINDOW_WIDTH = 420;
export const WINDOW_HEIGHT = 68;
```

**Step 3: Commit**

```bash
git add src/shared/
git commit -m "feat: add shared types and constants"
```

---

### Task 3: Session Watcher Service

**Files:**
- Create: `src/main/services/session-watcher.ts`

**Step 1: Implement session watcher**

Reads `~/.claude/ide/*.lock` files, parses JSON, validates PID is alive using `process.kill(pid, 0)` (cross-platform, signal 0 = check existence only). Returns `SessionInfo`.

```typescript
// src/main/services/session-watcher.ts
import fs from 'fs';
import path from 'path';
import { IDE_LOCK_DIR } from '../../shared/constants';
import { SessionInfo } from '../../shared/types';

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function getActiveSession(): SessionInfo {
  const noSession: SessionInfo = {
    isActive: false,
    pid: null,
    workspace: null,
    ideName: null,
  };

  try {
    if (!fs.existsSync(IDE_LOCK_DIR)) return noSession;

    const lockFiles = fs.readdirSync(IDE_LOCK_DIR)
      .filter(f => f.endsWith('.lock'));

    for (const file of lockFiles) {
      const filePath = path.join(IDE_LOCK_DIR, file);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const pid = content.pid ?? parseInt(file.replace('.lock', ''), 10);

      if (isPidAlive(pid)) {
        return {
          isActive: true,
          pid,
          workspace: content.workspaceFolders?.[0] ?? null,
          ideName: content.ideName ?? null,
        };
      }
    }
  } catch {
    // Lock dir missing or unreadable — no active session
  }

  return noSession;
}
```

**Step 2: Test manually**

Run: `npx ts-node src/main/services/session-watcher.ts` with a quick test script that calls `getActiveSession()` and logs the result. Should detect this current Claude session.

**Step 3: Commit**

```bash
git add src/main/services/session-watcher.ts
git commit -m "feat: add session watcher service (reads ide lock files)"
```

---

### Task 4: Stats Reader Service

**Files:**
- Create: `src/main/services/stats-reader.ts`

**Step 1: Implement stats reader**

Reads `~/.claude/stats-cache.json`, extracts today's token usage from `dailyModelTokens` and `modelUsage`.

```typescript
// src/main/services/stats-reader.ts
import fs from 'fs';
import { STATS_CACHE_FILE } from '../../shared/constants';
import { TokenUsage } from '../../shared/types';

interface StatsCache {
  dailyModelTokens?: Array<{
    date: string;
    tokensByModel: Record<string, number>;
  }>;
  modelUsage?: Record<string, {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
  }>;
}

export function getTodayTokenUsage(): TokenUsage {
  const empty: TokenUsage = { inputToday: 0, outputToday: 0, cacheReadToday: 0 };

  try {
    if (!fs.existsSync(STATS_CACHE_FILE)) return empty;

    const data: StatsCache = JSON.parse(fs.readFileSync(STATS_CACHE_FILE, 'utf-8'));

    // Sum all model usage (stats-cache tracks cumulative)
    let input = 0, output = 0, cacheRead = 0;

    if (data.modelUsage) {
      for (const model of Object.values(data.modelUsage)) {
        input += model.inputTokens ?? 0;
        output += model.outputTokens ?? 0;
        cacheRead += model.cacheReadInputTokens ?? 0;
      }
    }

    return { inputToday: input, outputToday: output, cacheReadToday: cacheRead };
  } catch {
    return empty;
  }
}
```

**Step 2: Commit**

```bash
git add src/main/services/stats-reader.ts
git commit -m "feat: add stats reader service (parses stats-cache.json)"
```

---

### Task 5: Credentials Reader Service

**Files:**
- Create: `src/main/services/credentials-reader.ts`

**Step 1: Implement credentials reader**

Reads `~/.claude/.credentials.json` for `subscriptionType` and `rateLimitTier`.

```typescript
// src/main/services/credentials-reader.ts
import fs from 'fs';
import { CREDENTIALS_FILE } from '../../shared/constants';
import { PlanInfo } from '../../shared/types';

export function getPlanInfo(): PlanInfo {
  const defaults: PlanInfo = { subscriptionType: 'unknown', rateLimitTier: 'unknown' };

  try {
    if (!fs.existsSync(CREDENTIALS_FILE)) return defaults;

    const data = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));
    const oauth = data.claudeAiOauth;

    if (!oauth) return defaults;

    return {
      subscriptionType: oauth.subscriptionType ?? 'unknown',
      rateLimitTier: oauth.rateLimitTier ?? 'unknown',
    };
  } catch {
    return defaults;
  }
}
```

**Step 2: Commit**

```bash
git add src/main/services/credentials-reader.ts
git commit -m "feat: add credentials reader service"
```

---

### Task 6: Session Parser Service (Current Model + Rolling Token Windows)

**Files:**
- Create: `src/main/services/session-parser.ts`

**Step 1: Implement session parser**

Scans latest session JSONL from `~/.claude/projects/` to find the current model and compute rolling token windows for limit estimation.

```typescript
// src/main/services/session-parser.ts
import fs from 'fs';
import path from 'path';
import { PROJECTS_DIR } from '../../shared/constants';
import { UsageLimits } from '../../shared/types';

// Default hourly/weekly token estimates per tier
const TIER_LIMITS: Record<string, { hourly: number; weekly: number }> = {
  'default_claude_max_5x': { hourly: 500_000, weekly: 15_000_000 },
  'default_claude_pro': { hourly: 200_000, weekly: 5_000_000 },
  default: { hourly: 300_000, weekly: 10_000_000 },
};

export function getCurrentModel(): string | null {
  try {
    if (!fs.existsSync(PROJECTS_DIR)) return null;

    // Find the most recently modified JSONL file across all projects
    let latestFile: string | null = null;
    let latestMtime = 0;

    const projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory());

    for (const dir of projectDirs) {
      const dirPath = path.join(PROJECTS_DIR, dir.name);
      const jsonlFiles = fs.readdirSync(dirPath)
        .filter(f => f.endsWith('.jsonl') && !f.includes('subagent'));

      for (const file of jsonlFiles) {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs > latestMtime) {
          latestMtime = stat.mtimeMs;
          latestFile = filePath;
        }
      }
    }

    if (!latestFile) return null;

    // Read last few lines to find model info
    const content = fs.readFileSync(latestFile, 'utf-8');
    const lines = content.trim().split('\n').reverse();

    for (const line of lines.slice(0, 50)) {
      try {
        const entry = JSON.parse(line);
        if (entry.message?.role === 'assistant' && entry.message?.model) {
          return formatModelName(entry.message.model);
        }
        if (entry.model) {
          return formatModelName(entry.model);
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Projects dir missing or unreadable
  }
  return null;
}

function formatModelName(modelId: string): string {
  // "claude-opus-4-6" -> "Opus 4.6"
  // "claude-sonnet-4-6" -> "Sonnet 4.6"
  const match = modelId.match(/claude-(\w+)-(\d+)-(\d+)/);
  if (match) {
    const name = match[1].charAt(0).toUpperCase() + match[1].slice(1);
    return `${name} ${match[2]}.${match[3]}`;
  }
  return modelId;
}

export function getUsageLimits(
  rateLimitTier: string,
  inputTokens: number,
  outputTokens: number
): UsageLimits {
  const tierLimits = TIER_LIMITS[rateLimitTier] ?? TIER_LIMITS.default;
  const totalTokens = inputTokens + outputTokens;

  // These are rough estimates — exact limits are server-side
  return {
    hourlyUsed: Math.min(totalTokens / tierLimits.hourly, 1),
    hourlyEstimate: tierLimits.hourly,
    weeklyUsed: Math.min(totalTokens / tierLimits.weekly, 1),
    weeklyEstimate: tierLimits.weekly,
  };
}
```

**Step 2: Commit**

```bash
git add src/main/services/session-parser.ts
git commit -m "feat: add session parser (model detection + limit estimation)"
```

---

### Task 7: Preload Script + IPC Handlers

**Files:**
- Create: `src/preload/index.ts`
- Create: `src/main/ipc-handlers.ts`

**Step 1: Create preload script**

Exposes a secure IPC bridge to the renderer using `contextBridge`.

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';
import { ClaudeUsageState } from '../shared/types';

contextBridge.exposeInMainWorld('claudePulse', {
  onUsageUpdate: (callback: (state: ClaudeUsageState) => void) => {
    ipcRenderer.on('claude:usage-update', (_event, state) => callback(state));
  },
  requestUpdate: () => {
    ipcRenderer.send('claude:request-update');
  },
});
```

**Step 2: Create IPC handlers in main process**

Aggregates all services and pushes state to renderer on interval.

```typescript
// src/main/ipc-handlers.ts
import { BrowserWindow, ipcMain } from 'electron';
import { getActiveSession } from './services/session-watcher';
import { getTodayTokenUsage } from './services/stats-reader';
import { getPlanInfo } from './services/credentials-reader';
import { getCurrentModel, getUsageLimits } from './services/session-parser';
import { ClaudeUsageState } from '../shared/types';
import { POLL_INTERVAL_SESSION, POLL_INTERVAL_STATS } from '../shared/constants';

let cachedState: ClaudeUsageState | null = null;

function buildState(): ClaudeUsageState {
  const session = getActiveSession();
  const tokens = getTodayTokenUsage();
  const plan = getPlanInfo();
  const currentModel = getCurrentModel();
  const limits = getUsageLimits(
    plan.rateLimitTier,
    tokens.inputToday,
    tokens.outputToday
  );

  return { session, currentModel, tokens, limits, plan };
}

export function setupIpcHandlers(mainWindow: BrowserWindow): void {
  // Respond to manual requests
  ipcMain.on('claude:request-update', () => {
    cachedState = buildState();
    mainWindow.webContents.send('claude:usage-update', cachedState);
  });

  // Fast poll for session changes (2s)
  setInterval(() => {
    const newSession = getActiveSession();
    const sessionChanged = cachedState?.session.isActive !== newSession.isActive;

    if (sessionChanged) {
      cachedState = buildState();
      mainWindow.webContents.send('claude:usage-update', cachedState);
    }
  }, POLL_INTERVAL_SESSION);

  // Slower poll for full stats (10s)
  setInterval(() => {
    cachedState = buildState();
    mainWindow.webContents.send('claude:usage-update', cachedState);
  }, POLL_INTERVAL_STATS);

  // Initial push
  cachedState = buildState();
  mainWindow.webContents.send('claude:usage-update', cachedState);
}
```

**Step 3: Commit**

```bash
git add src/preload/index.ts src/main/ipc-handlers.ts
git commit -m "feat: add preload script and IPC handlers"
```

---

### Task 8: Window Manager (Positioning + Auto-Hide)

**Files:**
- Create: `src/main/window-manager.ts`

**Step 1: Implement window manager**

Creates frameless, transparent, always-on-top window. Handles auto-hide by tracking mouse position and session state.

```typescript
// src/main/window-manager.ts
import { BrowserWindow, screen, ipcMain } from 'electron';
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

  // Ignore mouse events when hidden for click-through
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
```

**Step 2: Commit**

```bash
git add src/main/window-manager.ts
git commit -m "feat: add window manager with auto-hide and positioning"
```

---

### Task 9: Electron Main Entry Point

**Files:**
- Create: `src/main/index.ts`

**Step 1: Implement main entry**

Wires everything together: creates window, starts services, handles app lifecycle.

```typescript
// src/main/index.ts
import { app, screen, BrowserWindow } from 'electron';
import { createWindow, showWidget, hideWidget, scheduleHide, getWindow } from './window-manager';
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

    const win = getWindow();
    if (inZone && win) {
      showWidget();
    }
  }, 200);
});

app.on('window-all-closed', () => {
  app.quit();
});
```

**Step 2: Verify it starts**

```bash
npm run dev:main
```

Expected: Electron window appears at top-center, frameless.

**Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: add electron main entry point"
```

---

### Task 10: Renderer — HTML Entry + Global Styles

**Files:**
- Create: `src/renderer/index.html`
- Create: `src/renderer/styles/globals.css`
- Create: `src/renderer/index.tsx`

**Step 1: Create HTML entry**

```html
<!-- src/renderer/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Claude Pulse</title>
</head>
<body class="bg-transparent overflow-hidden m-0 p-0">
  <div id="root"></div>
</body>
</html>
```

**Step 2: Create global styles**

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

/* Smooth slide animation */
.widget-enter {
  transform: translateY(-100%);
  opacity: 0;
}

.widget-visible {
  transform: translateY(0);
  opacity: 1;
  transition: transform 300ms ease-out, opacity 300ms ease-out;
}

.widget-hidden {
  transform: translateY(-100%);
  opacity: 0;
  transition: transform 300ms ease-in, opacity 200ms ease-in;
}
```

**Step 3: Create React entry**

```tsx
// src/renderer/index.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/globals.css';

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
```

**Step 4: Commit**

```bash
git add src/renderer/index.html src/renderer/styles/globals.css src/renderer/index.tsx
git commit -m "feat: add renderer entry point and global styles"
```

---

### Task 11: useClaudeStats Hook

**Files:**
- Create: `src/renderer/hooks/useClaudeStats.ts`

**Step 1: Create IPC hook**

```typescript
// src/renderer/hooks/useClaudeStats.ts
import { useState, useEffect } from 'react';
import { ClaudeUsageState } from '../../shared/types';

declare global {
  interface Window {
    claudePulse: {
      onUsageUpdate: (callback: (state: ClaudeUsageState) => void) => void;
      requestUpdate: () => void;
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

export function useClaudeStats(): ClaudeUsageState {
  const [state, setState] = useState<ClaudeUsageState>(defaultState);

  useEffect(() => {
    window.claudePulse.onUsageUpdate((newState) => {
      setState(newState);
    });
    window.claudePulse.requestUpdate();
  }, []);

  return state;
}
```

**Step 2: Commit**

```bash
git add src/renderer/hooks/useClaudeStats.ts
git commit -m "feat: add useClaudeStats IPC hook"
```

---

### Task 12: LimitBar Component

**Files:**
- Create: `src/renderer/components/LimitBar.tsx`

**Step 1: Create reusable progress bar**

```tsx
// src/renderer/components/LimitBar.tsx
import React from 'react';

interface LimitBarProps {
  label: string;
  ratio: number; // 0-1
}

export function LimitBar({ label, ratio }: LimitBarProps) {
  const percentage = Math.min(Math.round(ratio * 100), 100);
  const isWarning = ratio > 0.8;
  const isCritical = ratio > 0.95;

  return (
    <div className="flex items-center gap-1.5 min-w-[100px]">
      <span className="text-[10px] text-claude-text-dim uppercase tracking-wider w-8">
        {label}
      </span>
      <div className="flex-1 h-2 bg-claude-bar-bg rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isCritical
              ? 'bg-red-500'
              : isWarning
              ? 'bg-yellow-500'
              : 'bg-claude-orange'
          }`}
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
git commit -m "feat: add LimitBar progress bar component"
```

---

### Task 13: SessionIndicator Component

**Files:**
- Create: `src/renderer/components/SessionIndicator.tsx`

**Step 1: Create session indicator**

```tsx
// src/renderer/components/SessionIndicator.tsx
import React from 'react';

interface SessionIndicatorProps {
  isActive: boolean;
  model: string | null;
}

export function SessionIndicator({ isActive, model }: SessionIndicatorProps) {
  return (
    <div className="flex items-center gap-2">
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
      <span className="text-xs text-claude-text font-medium">
        {model ?? 'Idle'}
      </span>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/renderer/components/SessionIndicator.tsx
git commit -m "feat: add SessionIndicator component"
```

---

### Task 14: TokenCounter Component

**Files:**
- Create: `src/renderer/components/TokenCounter.tsx`

**Step 1: Create token counter**

```tsx
// src/renderer/components/TokenCounter.tsx
import React from 'react';
import { TokenUsage } from '../../shared/types';

interface TokenCounterProps {
  tokens: TokenUsage;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function TokenCounter({ tokens }: TokenCounterProps) {
  const total = tokens.inputToday + tokens.outputToday;

  return (
    <div className="flex items-center gap-1">
      <svg className="w-3 h-3 text-claude-orange" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2.5a1 1 0 011 1v3.25l2.1 1.25a1 1 0 01-1 1.73L7.5 8.75V4.5a1 1 0 011-1z" />
      </svg>
      <span className="text-xs text-claude-text font-mono">
        {formatTokens(total)}
      </span>
      <span className="text-[10px] text-claude-text-dim">tokens</span>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/renderer/components/TokenCounter.tsx
git commit -m "feat: add TokenCounter component"
```

---

### Task 15: StatusBar + App Component

**Files:**
- Create: `src/renderer/components/StatusBar.tsx`
- Create: `src/renderer/App.tsx`

**Step 1: Create StatusBar**

```tsx
// src/renderer/components/StatusBar.tsx
import React from 'react';
import { SessionIndicator } from './SessionIndicator';
import { TokenCounter } from './TokenCounter';
import { LimitBar } from './LimitBar';
import { ClaudeUsageState } from '../../shared/types';

interface StatusBarProps {
  state: ClaudeUsageState;
}

export function StatusBar({ state }: StatusBarProps) {
  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-claude-bg border border-claude-border rounded-b-lg shadow-lg h-[60px]">
      {/* Session indicator + model */}
      <SessionIndicator
        isActive={state.session.isActive}
        model={state.currentModel}
      />

      {/* Separator */}
      <div className="w-px h-6 bg-claude-border" />

      {/* Token counter */}
      <TokenCounter tokens={state.tokens} />

      {/* Separator */}
      <div className="w-px h-6 bg-claude-border" />

      {/* Limit bars */}
      <div className="flex flex-col gap-1 flex-1">
        <LimitBar label="Hour" ratio={state.limits.hourlyUsed} />
        <LimitBar label="Week" ratio={state.limits.weeklyUsed} />
      </div>
    </div>
  );
}
```

**Step 2: Create App**

```tsx
// src/renderer/App.tsx
import React, { useState, useEffect } from 'react';
import { StatusBar } from './components/StatusBar';
import { useClaudeStats } from './hooks/useClaudeStats';

declare global {
  interface Window {
    claudePulse: {
      onUsageUpdate: (callback: (state: any) => void) => void;
      onVisibility: (callback: (visible: boolean) => void) => void;
      requestUpdate: () => void;
    };
  }
}

export default function App() {
  const state = useClaudeStats();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    window.claudePulse.onVisibility?.((v: boolean) => setVisible(v));
  }, []);

  return (
    <div
      className={`w-full transition-all duration-300 ease-in-out ${
        visible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
      }`}
    >
      <StatusBar state={state} />
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/renderer/components/StatusBar.tsx src/renderer/App.tsx
git commit -m "feat: add StatusBar and App components"
```

---

### Task 16: Webpack Configs + Build Pipeline

**Files:**
- Create: `webpack.main.config.ts`
- Create: `webpack.renderer.config.ts`

**Step 1: Create webpack config for main process**

Bundles `src/main/` to `dist/main/`, targets Electron's Node environment. Externals electron.

**Step 2: Create webpack config for renderer**

Bundles `src/renderer/` to `dist/renderer/`, includes HtmlWebpackPlugin, PostCSS/Tailwind loaders, dev server on port 3000.

**Step 3: Verify dev mode works**

```bash
npm run dev
```

Expected: Electron opens, shows widget at top-center with mock/real data.

**Step 4: Commit**

```bash
git add webpack.main.config.ts webpack.renderer.config.ts
git commit -m "feat: add webpack build configs for main + renderer"
```

---

### Task 17: Electron Builder Config + Packaging

**Files:**
- Create: `electron-builder.yml`

**Step 1: Create electron-builder config**

```yaml
# electron-builder.yml
appId: com.claudepulse.app
productName: Claude Pulse
directories:
  output: release
files:
  - dist/**/*
  - package.json
win:
  target: nsis
mac:
  target: dmg
linux:
  target: AppImage
```

**Step 2: Test packaging**

```bash
npm run package
```

Expected: Produces a platform-specific installer in `release/`.

**Step 3: Commit**

```bash
git add electron-builder.yml
git commit -m "feat: add electron-builder packaging config"
```

---

### Task 18: Polish + Integration Test

**Step 1: Run full app in dev mode, verify all features**

- [ ] Widget appears at top-center
- [ ] Frameless, dark background with orange accents
- [ ] Session indicator shows green (this session is active)
- [ ] Current model shows correctly
- [ ] Token counter shows today's usage
- [ ] Hourly/weekly bars render with correct ratios
- [ ] Widget auto-hides after 3s with no session
- [ ] Widget shows on mouse proximity to top-center
- [ ] Widget shows when Claude session is active

**Step 2: Fix any issues found**

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: polish and integration verification"
```

---

## Task Summary

| Task | Description | Depends On |
|------|-------------|------------|
| 1 | Project scaffold | — |
| 2 | Shared types + constants | 1 |
| 3 | Session watcher service | 2 |
| 4 | Stats reader service | 2 |
| 5 | Credentials reader service | 2 |
| 6 | Session parser service | 2 |
| 7 | Preload + IPC handlers | 3, 4, 5, 6 |
| 8 | Window manager | 2 |
| 9 | Electron main entry | 7, 8 |
| 10 | Renderer HTML + styles | 1 |
| 11 | useClaudeStats hook | 2 |
| 12 | LimitBar component | 2 |
| 13 | SessionIndicator component | 2 |
| 14 | TokenCounter component | 2 |
| 15 | StatusBar + App | 11, 12, 13, 14 |
| 16 | Webpack configs | 1 |
| 17 | Electron builder config | 16 |
| 18 | Polish + integration test | all |

**Parallelizable groups:**
- Tasks 3, 4, 5, 6 (all services) — independent of each other
- Tasks 10, 11, 12, 13, 14 (renderer components) — independent of each other
