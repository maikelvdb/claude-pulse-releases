# Activity Graph & CLI Session Detection — Design Document

**Date:** 2026-03-12
**Status:** Approved

## Overview

Two changes to Claude Pulse:

1. **Bug fix** — The session indicator (green dot) doesn't activate when using Claude Code CLI, only for IDE sessions. Fix by also detecting CLI activity via `stats-cache.json` mtime.
2. **Feature** — Add an activity line graph showing token usage over time and session activity. Compact sparkline in the bar, expanding inline on click for a detailed 24h view.

---

## 1. CLI Session Detection Fix

### Problem

`session-watcher.ts` only checks `~/.claude/ide/*.lock` files. These are created by IDE extensions (VS Code, Cursor), not by the Claude Code CLI. CLI sessions go undetected.

### Solution

Add a secondary detection method: check if `~/.claude/stats-cache.json` was modified within the last 30 seconds. If so, Claude is actively being used.

**Detection logic becomes:**
```
isActive = (IDE lock file with live PID exists) OR (stats-cache.json mtime < 30s ago)
```

### Changes

- **`session-watcher.ts`** — Add `isStatsCacheRecent()` check using `fs.statSync().mtimeMs`
- **`constants.ts`** — Add `STATS_CACHE_ACTIVE_THRESHOLD = 30000` (30s)
- The `getActiveSession()` function returns `isActive: true` if either condition is met. When active via stats-cache only (no lock file), `pid`/`workspace`/`ideName` remain null, and a new field `source: 'ide' | 'cli' | null` indicates how the session was detected.

### Types Change

```typescript
interface SessionInfo {
  isActive: boolean;
  pid: number | null;
  workspace: string | null;
  ideName: string | null;
  source: 'ide' | 'cli' | null;  // NEW
}
```

---

## 2. Activity Graph Feature

### Data Storage

**New service: `activity-store.ts`** in `src/main/services/`

- Persists to `~/.claude/claude-pulse-activity.json`
- On each stats poll (every 10s), records a snapshot:
  ```typescript
  interface ActivitySnapshot {
    t: number;        // timestamp (ms)
    input: number;    // cumulative input tokens today
    output: number;   // cumulative output tokens today
    active: boolean;  // session active at this moment
  }
  ```
- Keeps 24h of snapshots (max ~8640 entries at 10s intervals)
- Prunes entries older than 24h on each write
- Writes to disk at most once per minute (debounced) to avoid excessive IO

### IPC

- New channel: `claude:activity-history` — pushes `ActivitySnapshot[]` to renderer
- Sent alongside existing `claude:usage-update` on each stats poll
- New preload API: `window.claudePulse.onActivityHistory(callback)`

### UI: Sparkline (Compact)

- New component: `ActivitySparkline.tsx`
- Size: ~80×24px, fits inline in the StatusBar between TokenCounter and LimitBars
- Renders an SVG line showing **token delta per bucket** over the last 12h
  - Buckets: aggregate snapshots into ~30-minute intervals
  - Y-axis: token delta (difference between consecutive cumulative values)
  - Line color: `claude-orange` (#E87443)
- Below the line: a 2px-tall strip of colored segments showing active (green) / idle (grey) periods
- Cursor: pointer — clickable to expand
- Orientation-aware: in vertical mode, the sparkline rotates 90°

### UI: Expanded View

- On click, the widget expands inline:
  - **Horizontal (top/bottom):** height grows from 60px → 200px
  - **Vertical (left/right):** width grows from 80px → 260px
- The window-manager resizes the Electron BrowserWindow to accommodate
- New component: `ActivityDetail.tsx`
- Contents:
  - **Line graph** (24h range, hourly granularity)
    - Two lines: input tokens/hr (blue `#60a5fa`) and output tokens/hr (orange `#E87443`)
    - X-axis: time labels (e.g., "6h", "12h", "18h", "now")
    - Y-axis: token count with auto-scaled labels (K/M)
  - **Activity timeline** — horizontal bar below the graph
    - Green segments = active, grey = idle
    - Full 24h width
  - **Summary stats** — small text: "Today: 1.2M tokens, 4h 23m active"
- Click the graph area or a close button to collapse back
- Collapse transition: 300ms ease-in-out (matches existing animation)

### Rendering Approach

- Pure SVG — no charting library dependency
- Sparkline: simple polyline from bucketed data
- Expanded: SVG with axis lines, labels, and two polylines
- Keep it lightweight and consistent with the existing minimal UI

### Window Resize on Expand

- New IPC channel: `widget:resize` — renderer tells main process to resize
- `window-manager.ts` gets a `resizeForExpand(expanded: boolean)` method
- Animates the BrowserWindow size change (or instant resize + CSS animation for content)
- Re-centers on the current snap edge after resize

### State

- `useClaudeStats` hook gains: `activityHistory: ActivitySnapshot[]`, `isExpanded: boolean`, `toggleExpanded()`
- Expanded state is renderer-only (not persisted across restarts)

---

## Data Flow (Updated)

```
~/.claude/ files
    │
    ▼
[Main Process Services]
SessionWatcher ──► polls ide/*.lock + stats-cache mtime every 2s
StatsReader ────► reads stats-cache.json every 10s
ActivityStore ──► records snapshot every 10s, prunes >24h, persists ~1/min
SessionParser ──► scans latest session JSONL every 30s
    │
    ▼
[IPC Bridge]
  claude:usage-update ──► ClaudeUsageState
  claude:activity-history ──► ActivitySnapshot[]
  widget:resize ──► expand/collapse window
    │
    ▼
[Renderer - React]
useClaudeStats() ──► state + activityHistory + expanded toggle
    │
    ▼
StatusBar ──► SessionIndicator + TokenCounter + ActivitySparkline + LimitBars
           ──► (expanded) ActivityDetail
```

---

## File Changes Summary

| File | Change |
|------|--------|
| `src/shared/types.ts` | Add `source` to `SessionInfo`, add `ActivitySnapshot` |
| `src/shared/constants.ts` | Add `STATS_CACHE_ACTIVE_THRESHOLD`, `ACTIVITY_FILE`, expanded dimensions |
| `src/main/services/session-watcher.ts` | Add stats-cache mtime check |
| `src/main/services/activity-store.ts` | **New** — record, prune, persist snapshots |
| `src/main/ipc-handlers.ts` | Push activity history, handle resize IPC |
| `src/main/window-manager.ts` | Add `resizeForExpand()` method |
| `src/main/index.ts` | Wire up activity store in polling loop |
| `src/preload/index.ts` | Expose `onActivityHistory`, `requestResize` |
| `src/renderer/hooks/useClaudeStats.ts` | Add activity history state, expanded toggle |
| `src/renderer/components/ActivitySparkline.tsx` | **New** — compact sparkline |
| `src/renderer/components/ActivityDetail.tsx` | **New** — expanded graph view |
| `src/renderer/components/StatusBar.tsx` | Include sparkline, handle expanded layout |
| `src/renderer/App.tsx` | Pass expanded state for resize animation |
| `tailwind.config.js` | Add graph colors if needed |
