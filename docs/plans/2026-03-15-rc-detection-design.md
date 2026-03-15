# Remote Control Session Detection — Design

## Goal

Detect when any active Claude Code session starts a remote control session (`/rc`), show an RC badge in the status bar, and provide an overlay in the help window listing all active RC sessions with QR codes.

## Detection Mechanism

Piggyback on the existing conversation tailer (Option A). The JSONL files contain `bridge_status` entries when `/rc` is invoked:

```json
{
  "type": "system",
  "subtype": "bridge_status",
  "content": "/remote-control is active. Code in CLI or at https://claude.ai/code/session_...",
  "url": "https://claude.ai/code/session_01X1eSrJa3UTjd8kQ5VU4zm2",
  "sessionId": "d799275c-...",
  "cwd": "C:\\repos\\...",
  "slug": "vast-imagining-rainbow"
}
```

The tailer already reads JSONL lines every 2s. We add a check for `subtype: "bridge_status"` and extract the URL, session ID, cwd, and slug.

## Data Model

```typescript
interface RcSession {
  sessionId: string;
  url: string;
  slug: string;
  cwd: string;
  startedAt: number;
}
```

Main process maintains a `Map<sessionId, RcSession>`. When the underlying JSONL session goes inactive (file not modified in 30s), the RC entry is removed.

New IPC channel `claude:rc-sessions` pushes the active list to the renderer on change.

## UI

### StatusBar — RcBadge
- Placed before PlanBadge
- Broadcast/antenna icon with count
- Pulses for first 5s on new detection, then settles
- Hidden when no active RC sessions
- Click opens help window to RC tab

### Help Window — Remote Control Tab
- Lists active RC sessions, newest on top
- Each entry: slug, project folder, copyable URL, QR code, "started X ago"
- Empty state: "No active remote control sessions"
- QR generated via `qrcode` npm package

## Files Modified

1. `src/main/services/conversation-tailer.ts` — detect bridge_status
2. `src/main/ipc-handlers.ts` — RC session map, IPC channel, help HTML tab
3. `src/shared/types.ts` — RcSession interface
4. `src/preload/index.ts` — expose onRcSessions listener
5. `src/renderer/hooks/useClaudeStats.ts` — subscribe to RC sessions
6. `src/renderer/components/StatusBar.tsx` — add RcBadge

## New Files

1. `src/renderer/components/RcBadge.tsx`

## New Dependencies

- `qrcode` + `@types/qrcode`

## Lifecycle

- RC appears when `bridge_status` detected in JSONL
- RC removed when session goes inactive (JSONL not modified in 30s)
- No persistence across app restarts
