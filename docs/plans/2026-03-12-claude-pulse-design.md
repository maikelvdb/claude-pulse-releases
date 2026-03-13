# Claude Pulse — Design Document

**Date:** 2026-03-12
**Status:** Approved

## Overview

A cross-platform desktop widget that displays Claude Code usage stats as a slim, auto-hiding top-center bar. Built with Electron + React + TypeScript + Tailwind CSS. Reads only local data from `~/.claude/` — no API calls.

## What It Shows

A frameless, always-on-top bar (~400x60px) anchored to top-center of the screen:

- **Session indicator** — green dot when a Claude session is active, grey when idle
- **Current model** — e.g. "Opus 4.6" (parsed from active session JSONL)
- **Tokens today** — combined input/output token count
- **Hourly limit bar** — progress toward the rate limit window (~5h)
- **Weekly limit bar** — progress toward weekly usage cap

## Data Sources

All data is read locally from the `~/.claude/` directory. No network calls needed.

| Data | Source File | Format |
|------|------------|--------|
| Active session | `~/.claude/ide/*.lock` | JSON with PID, workspace, IDE name |
| Current model | `~/.claude/projects/<project>/<session>.jsonl` | JSONL, latest assistant message has model |
| Token counts | `~/.claude/stats-cache.json` | JSON with `modelUsage`, `dailyModelTokens` |
| Plan/tier | `~/.claude/.credentials.json` | JSON with `subscriptionType`, `rateLimitTier` |
| Session history | `~/.claude/projects/<project>/<session>.jsonl` | JSONL with timestamps + token metadata |

### Rate Limit Estimation

Claude Code does not expose exact rate limits locally. We estimate them by:
1. Reading `rateLimitTier` from credentials (e.g. `default_claude_max_5x`)
2. Tracking token usage in rolling windows (1h, 7d) from session JSONLs
3. Detecting rate-limit events (if any) from session logs to calibrate thresholds
4. Allowing user to manually configure known limits in a config file

## Behavior

### Auto-Hide
- Window slides up (CSS transform) and becomes invisible after 3 seconds when:
  - No active Claude session detected AND
  - Mouse is not hovering over the widget AND
  - Mouse is not in the top-center trigger zone
- Slide animation: 300ms ease-in-out

### Show Triggers
- **Mouse proximity**: mouse enters a ~400x10px invisible trigger zone at top-center of screen
- **Active session**: a valid `ide/*.lock` file exists with a running PID
- Widget slides down into view with 300ms animation

### Always On Top
- Frameless, transparent Electron `BrowserWindow`
- `alwaysOnTop: true`, `skipTaskbar: true`
- Positioned at horizontal center, y=0

### Polling Intervals
- Lock file check: every 2 seconds
- Stats refresh: every 10 seconds
- Session JSONL scan: every 30 seconds (heavier operation)

## Tech Stack

- **Electron** — cross-platform desktop shell
- **React 18** + **TypeScript** — renderer UI
- **Tailwind CSS** — styling
- **Node.js fs/chokidar** — file watching in main process
- **electron-builder** — packaging for Windows/macOS/Linux

## Color Scheme (Claude Code VSCode Dark)

| Element | Color |
|---------|-------|
| Background | `#1e1e2e` (dark purple-grey) |
| Accent / progress bars | `#E87443` (Claude orange) |
| Primary text | `#cccccc` (light grey) |
| Secondary text | `#888888` (mid grey) |
| Active indicator | `#4ade80` (green) |
| Idle indicator | `#6b7280` (grey) |
| Progress bar background | `#2a2a3e` (slightly lighter dark) |
| Border/separator | `#333346` |

## Architecture

```
claude-pulse/
├── package.json
├── tailwind.config.js
├── tsconfig.json
├── electron-builder.yml
├── src/
│   ├── main/                    # Electron main process
│   │   ├── index.ts             # Entry point, window creation
│   │   ├── window-manager.ts    # Position, auto-hide, show/hide logic
│   │   ├── services/
│   │   │   ├── session-watcher.ts   # Monitors ide/*.lock, checks PIDs
│   │   │   ├── stats-reader.ts      # Parses stats-cache.json
│   │   │   ├── session-parser.ts    # Reads session JSONLs for model/tokens
│   │   │   └── credentials-reader.ts # Reads plan/tier info
│   │   └── ipc-handlers.ts      # IPC bridge to renderer
│   ├── renderer/                # React app
│   │   ├── index.html
│   │   ├── index.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── StatusBar.tsx        # Main container
│   │   │   ├── SessionIndicator.tsx # Green/grey dot + model name
│   │   │   ├── TokenCounter.tsx     # Today's token usage
│   │   │   └── LimitBar.tsx         # Reusable progress bar (hourly/weekly)
│   │   ├── hooks/
│   │   │   └── useClaudeStats.ts    # IPC hook to get data from main
│   │   └── styles/
│   │       └── globals.css          # Tailwind imports + custom styles
│   ├── shared/
│   │   └── types.ts             # Shared TypeScript interfaces
│   └── preload/
│       └── index.ts             # Secure IPC exposure
```

## Data Flow

```
~/.claude/ files
    │
    ▼
[Main Process Services]
SessionWatcher ──► polls ide/*.lock every 2s, validates PIDs
StatsReader ────► reads stats-cache.json every 10s
SessionParser ──► scans latest session JSONL every 30s
CredentialsReader ► reads .credentials.json on startup + on change
    │
    ▼
[IPC Bridge]
    │
    ▼
[Renderer - React]
useClaudeStats() hook ──► receives combined state
    │
    ▼
StatusBar ──► SessionIndicator + TokenCounter + LimitBar × 2
```

## Shared Types

```typescript
interface ClaudeUsageState {
  session: {
    isActive: boolean;
    pid: number | null;
    workspace: string | null;
    ideName: string | null;
  };
  currentModel: string | null;
  tokens: {
    inputToday: number;
    outputToday: number;
    cacheReadToday: number;
  };
  limits: {
    hourlyUsed: number;     // 0-1 ratio
    hourlyEstimate: number; // estimated max tokens/hour
    weeklyUsed: number;     // 0-1 ratio
    weeklyEstimate: number; // estimated max tokens/week
  };
  plan: {
    subscriptionType: string;
    rateLimitTier: string;
  };
}
```

## Cross-Platform Considerations

- **Windows**: PID check via `tasklist` or Node `process.kill(pid, 0)`
- **macOS**: PID check via `kill -0 <pid>` or same Node approach
- **Linux**: PID check via `/proc/<pid>` or same Node approach
- **Home dir**: Use `os.homedir()` for `~/.claude/` path resolution
- **File paths**: Use `path.join()` everywhere, never hardcode separators
