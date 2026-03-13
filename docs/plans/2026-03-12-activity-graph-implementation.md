# Activity Graph & CLI Session Detection — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix CLI session detection (green dot) and add an activity sparkline/expanded graph to the widget.

**Architecture:** Add stats-cache mtime check to session detection. New ActivityStore service records snapshots every 10s, persisted to disk. Renderer gets a compact SVG sparkline that expands inline on click, resizing the Electron window.

**Tech Stack:** Electron, React, TypeScript, Tailwind CSS, pure SVG (no charting library)

---

### Task 1: Add `source` field to SessionInfo and CLI detection constant

**Files:**
- Modify: `src/shared/types.ts:1-6`
- Modify: `src/shared/constants.ts:5-6`

**Step 1: Update SessionInfo type**

In `src/shared/types.ts`, replace the `SessionInfo` interface:

```typescript
export interface SessionInfo {
  isActive: boolean;
  pid: number | null;
  workspace: string | null;
  ideName: string | null;
  source: 'ide' | 'cli' | null;
}
```

**Step 2: Add constants**

In `src/shared/constants.ts`, add after line 5 (`IDE_LOCK_DIR`):

```typescript
export const STATS_CACHE_ACTIVE_THRESHOLD = 30000; // 30s — if stats-cache.json modified within this, CLI is active
export const ACTIVITY_FILE = path.join(CLAUDE_DIR, 'claude-pulse-activity.json');
```

**Step 3: Update defaultState in useClaudeStats.ts**

In `src/renderer/hooks/useClaudeStats.ts:18`, add `source: null` to the session default:

```typescript
session: { isActive: false, pid: null, workspace: null, ideName: null, source: null },
```

**Step 4: Commit**

```bash
git add src/shared/types.ts src/shared/constants.ts src/renderer/hooks/useClaudeStats.ts
git commit -m "feat: add source field to SessionInfo and CLI detection constants"
```

---

### Task 2: Fix CLI session detection in session-watcher

**Files:**
- Modify: `src/main/services/session-watcher.ts`

**Step 1: Add stats-cache mtime check**

Replace the entire file with:

```typescript
import fs from 'fs';
import path from 'path';
import { IDE_LOCK_DIR, STATS_CACHE_FILE, STATS_CACHE_ACTIVE_THRESHOLD } from '../../shared/constants';
import { SessionInfo } from '../../shared/types';

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isStatsCacheRecent(): boolean {
  try {
    if (!fs.existsSync(STATS_CACHE_FILE)) return false;
    const stat = fs.statSync(STATS_CACHE_FILE);
    return Date.now() - stat.mtimeMs < STATS_CACHE_ACTIVE_THRESHOLD;
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
    source: null,
  };

  try {
    // Check IDE lock files first (more info available)
    if (fs.existsSync(IDE_LOCK_DIR)) {
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
            source: 'ide',
          };
        }
      }
    }
  } catch {
    // Lock dir missing or unreadable
  }

  // Fallback: check if stats-cache.json was recently modified (CLI activity)
  if (isStatsCacheRecent()) {
    return {
      isActive: true,
      pid: null,
      workspace: null,
      ideName: null,
      source: 'cli',
    };
  }

  return noSession;
}
```

**Step 2: Verify the build compiles**

Run: `npx webpack --config webpack.main.config.js`

**Step 3: Commit**

```bash
git add src/main/services/session-watcher.ts
git commit -m "fix: detect CLI sessions via stats-cache.json mtime"
```

---

### Task 3: Create ActivityStore service

**Files:**
- Create: `src/main/services/activity-store.ts`

**Step 1: Create the activity store**

```typescript
import fs from 'fs';
import { ACTIVITY_FILE } from '../../shared/constants';
import { ActivitySnapshot } from '../../shared/types';

let snapshots: ActivitySnapshot[] = [];
let lastWriteTime = 0;
const WRITE_DEBOUNCE = 60000; // Write to disk at most once per minute
const MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

export function loadActivityHistory(): void {
  try {
    if (fs.existsSync(ACTIVITY_FILE)) {
      const data = JSON.parse(fs.readFileSync(ACTIVITY_FILE, 'utf-8'));
      if (Array.isArray(data)) {
        snapshots = data;
        prune();
      }
    }
  } catch {
    snapshots = [];
  }
}

function prune(): void {
  const cutoff = Date.now() - MAX_AGE;
  snapshots = snapshots.filter(s => s.t > cutoff);
}

export function recordSnapshot(input: number, output: number, active: boolean): void {
  snapshots.push({
    t: Date.now(),
    input,
    output,
    active,
  });
  prune();

  // Debounced write to disk
  if (Date.now() - lastWriteTime > WRITE_DEBOUNCE) {
    persistToDisk();
  }
}

function persistToDisk(): void {
  try {
    fs.writeFileSync(ACTIVITY_FILE, JSON.stringify(snapshots));
    lastWriteTime = Date.now();
  } catch {
    // Ignore write errors
  }
}

export function getActivityHistory(): ActivitySnapshot[] {
  return snapshots;
}

export function flushActivityHistory(): void {
  persistToDisk();
}
```

**Step 2: Add `ActivitySnapshot` type to `src/shared/types.ts`**

Add at the end of the file, before the closing (after `PulseConfig`):

```typescript
export interface ActivitySnapshot {
  t: number;        // timestamp (ms)
  input: number;    // cumulative input tokens today
  output: number;   // cumulative output tokens today
  active: boolean;  // session active at this moment
}
```

**Step 3: Commit**

```bash
git add src/main/services/activity-store.ts src/shared/types.ts
git commit -m "feat: add ActivityStore service for historical snapshots"
```

---

### Task 4: Wire ActivityStore into IPC and polling

**Files:**
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`

**Step 1: Update ipc-handlers.ts**

Replace the entire file:

```typescript
import { BrowserWindow, ipcMain } from 'electron';
import { getActiveSession } from './services/session-watcher';
import { getTodayTokenUsage } from './services/stats-reader';
import { getPlanInfo } from './services/credentials-reader';
import { getCurrentModel, getUsageLimits } from './services/session-parser';
import { recordSnapshot, getActivityHistory } from './services/activity-store';
import { ClaudeUsageState } from '../shared/types';
import { POLL_INTERVAL_SESSION, POLL_INTERVAL_STATS } from '../shared/constants';
import { getSnapEdge, resizeForExpand } from './window-manager';

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
    mainWindow.webContents.send('claude:activity-history', getActivityHistory());
  });

  ipcMain.on('widget:request-snap-edge', () => {
    mainWindow.webContents.send('widget:snap-edge', getSnapEdge());
  });

  ipcMain.on('widget:resize', (_event, expanded: boolean) => {
    resizeForExpand(expanded);
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

    // Record activity snapshot
    recordSnapshot(
      cachedState.tokens.inputToday,
      cachedState.tokens.outputToday,
      cachedState.session.isActive
    );
    mainWindow.webContents.send('claude:activity-history', getActivityHistory());
  }, POLL_INTERVAL_STATS);

  // Initial push
  cachedState = buildState();
  mainWindow.webContents.send('claude:usage-update', cachedState);
  mainWindow.webContents.send('claude:activity-history', getActivityHistory());
}
```

**Step 2: Update main/index.ts — load activity history on startup**

Add import at top of `src/main/index.ts` (after existing imports):

```typescript
import { loadActivityHistory, flushActivityHistory } from './services/activity-store';
```

Add after `const config = loadConfig();` (line 13):

```typescript
  loadActivityHistory();
```

Add before `app.on('window-all-closed')` (line 69):

```typescript
app.on('before-quit', () => {
  flushActivityHistory();
});
```

**Step 3: Update preload/index.ts**

Replace the entire file:

```typescript
import { contextBridge, ipcRenderer } from 'electron';
import { ClaudeUsageState, SnapEdge, ActivitySnapshot } from '../shared/types';

contextBridge.exposeInMainWorld('claudePulse', {
  onUsageUpdate: (callback: (state: ClaudeUsageState) => void) => {
    ipcRenderer.on('claude:usage-update', (_event, state) => callback(state));
  },
  onActivityHistory: (callback: (history: ActivitySnapshot[]) => void) => {
    ipcRenderer.on('claude:activity-history', (_event, history) => callback(history));
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
  requestResize: (expanded: boolean) => {
    ipcRenderer.send('widget:resize', expanded);
  },
});
```

**Step 4: Commit**

```bash
git add src/main/ipc-handlers.ts src/main/index.ts src/preload/index.ts
git commit -m "feat: wire ActivityStore into IPC polling and preload bridge"
```

---

### Task 5: Add resizeForExpand to window-manager

**Files:**
- Modify: `src/main/window-manager.ts`
- Modify: `src/shared/constants.ts`

**Step 1: Add expanded dimension constants**

In `src/shared/constants.ts`, add after the vertical dimension constants (after line 25):

```typescript
// Expanded dimensions (graph visible)
export const WINDOW_HEIGHT_H_EXPANDED = 200;
export const WINDOW_WIDTH_V_EXPANDED = 260;
```

**Step 2: Add resizeForExpand function to window-manager.ts**

Add import of the new constants at the top of `src/main/window-manager.ts`:

```typescript
import {
  WINDOW_WIDTH_H, WINDOW_HEIGHT_H,
  WINDOW_WIDTH_V, WINDOW_HEIGHT_V,
  WINDOW_HEIGHT_H_EXPANDED, WINDOW_WIDTH_V_EXPANDED,
  AUTO_HIDE_DELAY,
} from '../shared/constants';
```

Add a new variable after `let onEdgeChange` (line 15):

```typescript
let isExpanded = false;
```

Add this function before the `export function getWindow()` at the end of the file:

```typescript
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
```

**Step 3: Also update getPosition to respect expanded state**

Replace the `getPosition` function:

```typescript
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
```

**Step 4: Commit**

```bash
git add src/main/window-manager.ts src/shared/constants.ts
git commit -m "feat: add resizeForExpand to window-manager"
```

---

### Task 6: Update useClaudeStats hook with activity history and expand toggle

**Files:**
- Modify: `src/renderer/hooks/useClaudeStats.ts`

**Step 1: Replace the entire hook file**

```typescript
// src/renderer/hooks/useClaudeStats.ts
import { useState, useEffect, useCallback } from 'react';
import { ClaudeUsageState, SnapEdge, ActivitySnapshot } from '../../shared/types';

declare global {
  interface Window {
    claudePulse: {
      onUsageUpdate: (callback: (state: ClaudeUsageState) => void) => void;
      onActivityHistory: (callback: (history: ActivitySnapshot[]) => void) => void;
      onVisibility: (callback: (visible: boolean) => void) => void;
      onSnapEdge: (callback: (edge: SnapEdge) => void) => void;
      requestUpdate: () => void;
      requestSnapEdge: () => void;
      requestResize: (expanded: boolean) => void;
    };
  }
}

const defaultState: ClaudeUsageState = {
  session: { isActive: false, pid: null, workspace: null, ideName: null, source: null },
  currentModel: null,
  tokens: { inputToday: 0, outputToday: 0, cacheReadToday: 0 },
  limits: { hourlyUsed: 0, hourlyEstimate: 0, weeklyUsed: 0, weeklyEstimate: 0 },
  plan: { subscriptionType: 'unknown', rateLimitTier: 'unknown' },
};

export function useClaudeStats() {
  const [state, setState] = useState<ClaudeUsageState>(defaultState);
  const [snapEdge, setSnapEdge] = useState<SnapEdge>('top');
  const [activityHistory, setActivityHistory] = useState<ActivitySnapshot[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    window.claudePulse.onUsageUpdate((newState) => setState(newState));
    window.claudePulse.onActivityHistory((history) => setActivityHistory(history));
    window.claudePulse.onSnapEdge((edge) => setSnapEdge(edge));
    window.claudePulse.requestUpdate();
    window.claudePulse.requestSnapEdge();
  }, []);

  const toggleExpanded = useCallback(() => {
    const next = !isExpanded;
    setIsExpanded(next);
    window.claudePulse.requestResize(next);
  }, [isExpanded]);

  return { state, snapEdge, activityHistory, isExpanded, toggleExpanded };
}
```

**Step 2: Commit**

```bash
git add src/renderer/hooks/useClaudeStats.ts
git commit -m "feat: add activity history and expand toggle to useClaudeStats"
```

---

### Task 7: Create ActivitySparkline component

**Files:**
- Create: `src/renderer/components/ActivitySparkline.tsx`

**Step 1: Create the sparkline component**

```tsx
// src/renderer/components/ActivitySparkline.tsx
import React, { useMemo } from 'react';
import { ActivitySnapshot } from '../../shared/types';

interface ActivitySparklineProps {
  history: ActivitySnapshot[];
  orientation?: 'horizontal' | 'vertical';
  onClick: () => void;
}

function bucketize(history: ActivitySnapshot[], hours: number, bucketCount: number): number[] {
  const now = Date.now();
  const cutoff = now - hours * 60 * 60 * 1000;
  const relevant = history.filter(s => s.t > cutoff);
  const bucketSize = (hours * 60 * 60 * 1000) / bucketCount;
  const buckets: number[] = new Array(bucketCount).fill(0);

  for (let i = 1; i < relevant.length; i++) {
    const delta = (relevant[i].input + relevant[i].output) - (relevant[i - 1].input + relevant[i - 1].output);
    if (delta <= 0) continue;
    const bucketIdx = Math.floor((relevant[i].t - cutoff) / bucketSize);
    if (bucketIdx >= 0 && bucketIdx < bucketCount) {
      buckets[bucketIdx] += delta;
    }
  }

  return buckets;
}

function activitySegments(history: ActivitySnapshot[], hours: number, segmentCount: number): boolean[] {
  const now = Date.now();
  const cutoff = now - hours * 60 * 60 * 1000;
  const relevant = history.filter(s => s.t > cutoff);
  const segmentSize = (hours * 60 * 60 * 1000) / segmentCount;
  const segments: boolean[] = new Array(segmentCount).fill(false);

  for (const snap of relevant) {
    if (!snap.active) continue;
    const idx = Math.floor((snap.t - cutoff) / segmentSize);
    if (idx >= 0 && idx < segmentCount) {
      segments[idx] = true;
    }
  }

  return segments;
}

export function ActivitySparkline({ history, orientation = 'horizontal', onClick }: ActivitySparklineProps) {
  const isVertical = orientation === 'vertical';
  const w = isVertical ? 24 : 80;
  const h = isVertical ? 60 : 24;
  const bucketCount = 24; // 12h / 30min = 24 buckets

  const buckets = useMemo(() => bucketize(history, 12, bucketCount), [history]);
  const segments = useMemo(() => activitySegments(history, 12, bucketCount), [history]);

  const max = Math.max(...buckets, 1);
  const graphH = h - 4; // Leave 4px for activity strip
  const stepX = w / (bucketCount - 1);

  const points = buckets.map((val, i) => {
    const x = i * stepX;
    const y = graphH - (val / max) * graphH;
    return `${x},${y}`;
  }).join(' ');

  const segW = w / bucketCount;

  return (
    <div
      className="cursor-pointer opacity-80 hover:opacity-100 transition-opacity"
      onClick={onClick}
      title="Click for details"
    >
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        className={isVertical ? 'rotate-90' : ''}
      >
        {/* Token usage line */}
        <polyline
          points={points}
          fill="none"
          stroke="#E87443"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Activity strip */}
        {segments.map((active, i) => (
          <rect
            key={i}
            x={i * segW}
            y={h - 3}
            width={segW - 0.5}
            height={2}
            rx={0.5}
            fill={active ? '#4ade80' : '#333346'}
          />
        ))}
      </svg>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/renderer/components/ActivitySparkline.tsx
git commit -m "feat: add ActivitySparkline component with token usage line and activity strip"
```

---

### Task 8: Create ActivityDetail expanded component

**Files:**
- Create: `src/renderer/components/ActivityDetail.tsx`

**Step 1: Create the expanded detail component**

```tsx
// src/renderer/components/ActivityDetail.tsx
import React, { useMemo } from 'react';
import { ActivitySnapshot } from '../../shared/types';

interface ActivityDetailProps {
  history: ActivitySnapshot[];
  orientation?: 'horizontal' | 'vertical';
  onClick: () => void;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

interface HourBucket {
  inputDelta: number;
  outputDelta: number;
  activeMinutes: number;
}

function bucketizeHourly(history: ActivitySnapshot[], hours: number): HourBucket[] {
  const now = Date.now();
  const cutoff = now - hours * 60 * 60 * 1000;
  const relevant = history.filter(s => s.t > cutoff);
  const buckets: HourBucket[] = Array.from({ length: hours }, () => ({
    inputDelta: 0,
    outputDelta: 0,
    activeMinutes: 0,
  }));
  const bucketSize = 60 * 60 * 1000;

  for (let i = 1; i < relevant.length; i++) {
    const inputDelta = relevant[i].input - relevant[i - 1].input;
    const outputDelta = relevant[i].output - relevant[i - 1].output;
    const idx = Math.floor((relevant[i].t - cutoff) / bucketSize);
    if (idx >= 0 && idx < hours) {
      if (inputDelta > 0) buckets[idx].inputDelta += inputDelta;
      if (outputDelta > 0) buckets[idx].outputDelta += outputDelta;
      if (relevant[i].active) {
        const elapsed = (relevant[i].t - relevant[i - 1].t) / 60000;
        buckets[idx].activeMinutes += Math.min(elapsed, 1);
      }
    }
  }

  return buckets;
}

function activitySegments(history: ActivitySnapshot[], hours: number, count: number): boolean[] {
  const now = Date.now();
  const cutoff = now - hours * 60 * 60 * 1000;
  const relevant = history.filter(s => s.t > cutoff);
  const segSize = (hours * 60 * 60 * 1000) / count;
  const segs: boolean[] = new Array(count).fill(false);

  for (const s of relevant) {
    if (!s.active) continue;
    const idx = Math.floor((s.t - cutoff) / segSize);
    if (idx >= 0 && idx < count) segs[idx] = true;
  }

  return segs;
}

export function ActivityDetail({ history, orientation = 'horizontal', onClick }: ActivityDetailProps) {
  const isVertical = orientation === 'vertical';
  const hours = 24;
  const buckets = useMemo(() => bucketizeHourly(history, hours), [history]);
  const segments = useMemo(() => activitySegments(history, hours, 48), [history]);

  // Graph dimensions
  const gw = isVertical ? 200 : 420;
  const gh = isVertical ? 160 : 100;
  const padL = 35; // left padding for y-axis labels
  const padB = 16; // bottom padding for x-axis labels
  const plotW = gw - padL - 4;
  const plotH = gh - padB - 4;

  const maxInput = Math.max(...buckets.map(b => b.inputDelta), 1);
  const maxOutput = Math.max(...buckets.map(b => b.outputDelta), 1);
  const maxVal = Math.max(maxInput, maxOutput);
  const stepX = plotW / (hours - 1);

  const inputPoints = buckets.map((b, i) => {
    const x = padL + i * stepX;
    const y = 4 + plotH - (b.inputDelta / maxVal) * plotH;
    return `${x},${y}`;
  }).join(' ');

  const outputPoints = buckets.map((b, i) => {
    const x = padL + i * stepX;
    const y = 4 + plotH - (b.outputDelta / maxVal) * plotH;
    return `${x},${y}`;
  }).join(' ');

  // Summary stats
  const totalInput = history.length > 0 ? history[history.length - 1].input : 0;
  const totalOutput = history.length > 0 ? history[history.length - 1].output : 0;
  const totalActiveMin = buckets.reduce((sum, b) => sum + b.activeMinutes, 0);
  const activeHours = Math.floor(totalActiveMin / 60);
  const activeMin = Math.round(totalActiveMin % 60);

  // Time labels
  const timeLabels = [
    { pos: padL, label: '24h' },
    { pos: padL + plotW * 0.25, label: '18h' },
    { pos: padL + plotW * 0.5, label: '12h' },
    { pos: padL + plotW * 0.75, label: '6h' },
    { pos: padL + plotW, label: 'now' },
  ];

  // Y-axis labels
  const yLabels = [
    { pos: 4, label: formatTokens(maxVal) },
    { pos: 4 + plotH / 2, label: formatTokens(maxVal / 2) },
    { pos: 4 + plotH, label: '0' },
  ];

  const segW = plotW / 48;

  return (
    <div className="cursor-pointer px-2 pt-1 pb-2" onClick={onClick}>
      <svg width={gw} height={gh + 12} viewBox={`0 0 ${gw} ${gh + 12}`}>
        {/* Y-axis labels */}
        {yLabels.map((l, i) => (
          <text key={i} x={padL - 4} y={l.pos + 3} textAnchor="end" fill="#888888" fontSize="8">{l.label}</text>
        ))}

        {/* Grid lines */}
        {yLabels.map((l, i) => (
          <line key={i} x1={padL} y1={l.pos} x2={padL + plotW} y2={l.pos} stroke="#333346" strokeWidth="0.5" />
        ))}

        {/* Input tokens line (blue) */}
        <polyline
          points={inputPoints}
          fill="none"
          stroke="#60a5fa"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Output tokens line (orange) */}
        <polyline
          points={outputPoints}
          fill="none"
          stroke="#E87443"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* X-axis labels */}
        {timeLabels.map((l, i) => (
          <text key={i} x={l.pos} y={gh - 2} textAnchor="middle" fill="#888888" fontSize="8">{l.label}</text>
        ))}

        {/* Activity timeline strip */}
        {segments.map((active, i) => (
          <rect
            key={i}
            x={padL + i * segW}
            y={gh + 2}
            width={segW - 0.5}
            height={3}
            rx={0.5}
            fill={active ? '#4ade80' : '#2a2a3e'}
          />
        ))}
      </svg>

      {/* Legend & summary */}
      <div className="flex items-center justify-between mt-1 px-1">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="w-2 h-0.5 bg-[#60a5fa] rounded" />
            <span className="text-[8px] text-claude-text-dim">Input</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-0.5 bg-claude-orange rounded" />
            <span className="text-[8px] text-claude-text-dim">Output</span>
          </div>
        </div>
        <span className="text-[8px] text-claude-text-dim">
          {formatTokens(totalInput + totalOutput)} tokens &middot; {activeHours}h {activeMin}m active
        </span>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/renderer/components/ActivityDetail.tsx
git commit -m "feat: add ActivityDetail expanded graph component"
```

---

### Task 9: Integrate sparkline and detail into StatusBar

**Files:**
- Modify: `src/renderer/components/StatusBar.tsx`
- Modify: `src/renderer/App.tsx`

**Step 1: Update StatusBar to accept and render activity graph**

Replace `src/renderer/components/StatusBar.tsx`:

```tsx
// src/renderer/components/StatusBar.tsx
import React from 'react';
import { ClaudeLogo } from './ClaudeLogo';
import { SessionIndicator } from './SessionIndicator';
import { TokenCounter } from './TokenCounter';
import { LimitBar } from './LimitBar';
import { ActivitySparkline } from './ActivitySparkline';
import { ActivityDetail } from './ActivityDetail';
import { ClaudeUsageState, SnapEdge, ActivitySnapshot } from '../../shared/types';

interface StatusBarProps {
  state: ClaudeUsageState;
  snapEdge: SnapEdge;
  activityHistory: ActivitySnapshot[];
  isExpanded: boolean;
  onToggleExpanded: () => void;
}

function getBorderRadius(edge: SnapEdge): string {
  switch (edge) {
    case 'top': return 'rounded-b-lg';
    case 'bottom': return 'rounded-t-lg';
    case 'left': return 'rounded-r-lg';
    case 'right': return 'rounded-l-lg';
  }
}

export function StatusBar({ state, snapEdge, activityHistory, isExpanded, onToggleExpanded }: StatusBarProps) {
  const isVertical = snapEdge === 'left' || snapEdge === 'right';
  const orientation = isVertical ? 'vertical' : 'horizontal';
  const radius = getBorderRadius(snapEdge);

  if (isVertical) {
    return (
      <div className={`flex flex-col items-center gap-2 px-2 py-3 bg-claude-bg border border-claude-border ${radius} shadow-lg ${isExpanded ? 'w-[260px]' : 'w-[80px]'} transition-all duration-300`}>
        <div className={`flex ${isExpanded ? 'flex-row items-start gap-3 w-full' : 'flex-col items-center gap-2'}`}>
          <div className="flex flex-col items-center gap-2">
            <ClaudeLogo orientation="vertical" />
            <div className="h-px w-8 bg-claude-border" />
            <SessionIndicator isActive={state.session.isActive} model={state.currentModel} orientation="vertical" />
            <div className="h-px w-8 bg-claude-border" />
            <TokenCounter tokens={state.tokens} orientation="vertical" />
            <div className="h-px w-8 bg-claude-border" />
            <ActivitySparkline history={activityHistory} orientation="vertical" onClick={onToggleExpanded} />
            <div className="h-px w-8 bg-claude-border" />
            <div className="flex gap-2">
              <LimitBar label="H" ratio={state.limits.hourlyUsed} orientation="vertical" />
              <LimitBar label="W" ratio={state.limits.weeklyUsed} orientation="vertical" />
            </div>
          </div>
          {isExpanded && (
            <div className="flex-1">
              <ActivityDetail history={activityHistory} orientation="vertical" onClick={onToggleExpanded} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col bg-claude-bg border border-claude-border ${radius} shadow-lg ${isExpanded ? 'h-[200px]' : 'h-[60px]'} transition-all duration-300`}>
      <div className="flex items-center gap-3 px-4 py-2 h-[60px] shrink-0">
        <ClaudeLogo orientation="horizontal" />
        <div className="w-px h-6 bg-claude-border" />
        <SessionIndicator isActive={state.session.isActive} model={state.currentModel} orientation="horizontal" />
        <div className="w-px h-6 bg-claude-border" />
        <TokenCounter tokens={state.tokens} orientation="horizontal" />
        <div className="w-px h-6 bg-claude-border" />
        <ActivitySparkline history={activityHistory} orientation="horizontal" onClick={onToggleExpanded} />
        <div className="w-px h-6 bg-claude-border" />
        <div className="flex flex-col gap-1 flex-1">
          <LimitBar label="Hour" ratio={state.limits.hourlyUsed} orientation="horizontal" />
          <LimitBar label="Week" ratio={state.limits.weeklyUsed} orientation="horizontal" />
        </div>
      </div>
      {isExpanded && (
        <div className="flex-1 border-t border-claude-border overflow-hidden">
          <ActivityDetail history={activityHistory} orientation="horizontal" onClick={onToggleExpanded} />
        </div>
      )}
    </div>
  );
}
```

**Step 2: Update App.tsx to pass new props**

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
  const { state, snapEdge, activityHistory, isExpanded, toggleExpanded } = useClaudeStats();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    window.claudePulse.onVisibility?.((v: boolean) => setVisible(v));
  }, []);

  const translateClass = getTranslateClass(snapEdge, visible);

  return (
    <div className={`w-full h-full transition-all duration-300 ease-in-out ${translateClass}`}>
      <StatusBar
        state={state}
        snapEdge={snapEdge}
        activityHistory={activityHistory}
        isExpanded={isExpanded}
        onToggleExpanded={toggleExpanded}
      />
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/renderer/components/StatusBar.tsx src/renderer/App.tsx
git commit -m "feat: integrate ActivitySparkline and ActivityDetail into StatusBar"
```

---

### Task 10: Add graph colors to Tailwind config

**Files:**
- Modify: `tailwind.config.js`

**Step 1: Add blue color for input line**

In `tailwind.config.js`, add to the colors object:

```javascript
'claude-input': '#60a5fa',
```

**Step 2: Commit**

```bash
git add tailwind.config.js
git commit -m "feat: add input token graph color to tailwind config"
```

---

### Task 11: Build and manual test

**Step 1: Compile both processes**

Run: `npx webpack --config webpack.main.config.js && npx webpack --config webpack.renderer.config.js`

Expected: No TypeScript errors, both bundles compile.

**Step 2: Start the app**

Run: `npm start`

Expected:
- Green dot appears when a Claude CLI or IDE session is active
- Sparkline shows inline in the status bar
- Clicking the sparkline expands the widget to show the 24h detail graph
- Clicking again collapses back

**Step 3: Fix any issues found during testing**

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during manual testing"
```
