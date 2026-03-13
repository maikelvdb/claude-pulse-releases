# Easter Eggs & Features Design — 2026-03-13

## Features

### 1. Konami Code — Rainbow Mode
- Renderer listens for `↑↑↓↓←→←→BA` key sequence via keydown buffer in `App.tsx`
- On trigger: sets `data-rainbow="true"` on `<html>`, removed after 10 seconds
- CSS `@keyframes rainbow` cycles widget colors through hue-rotate
- No config persistence — in-session secret only

### 2. Token Milestones — Escalating Celebrations
- Tiers: 500K (small sparkle), 1M (confetti burst), 5M (bigger confetti + sound), 10M (full party + rainbow flash)
- Tracked in `useClaudeStats` watching `tokens.inputToday + tokens.outputToday`
- Lightweight CSS particle system (~20 absolute-positioned divs with `@keyframes`)
- Fires once per tier per day (component state, resets on day change)

### 3. Night Owl Mode
- Activates automatically between midnight and 5 AM (local time)
- Visual: `data-nightowl="true"` dims widget 10%, cooler colors, moon icon via CSS `::after` on session indicator
- Late-night timer: "Up since midnight: 2h 14m" below the session timer
- Deactivates at 5 AM or session end

### 4. Usage Heatmap Calendar

#### Mini Heatmap (Expanded Widget)
- 7-day row of colored squares below the activity graph
- Color intensity based on total tokens (5 levels using `--claude-orange` at 0.1–1.0 opacity)
- Clicking opens Help window History tab

#### Full Heatmap (Help Window)
- New "History" tab — GitHub-style 52-week grid (7 rows × 52 cols, right-aligned to today)
- Hover tooltip: date + token count
- Summary stats above: this week, this month, all-time

#### Data Storage
- Extend `activity-store.ts` with `dailyRollups` map: `{ "2026-03-13": { input, output } }`
- Update today's rollup on each `recordSnapshot`
- Persist in same JSON file, keep 365 days
- Send to help window via `postMessage`, to renderer via `claude:daily-rollups` IPC

### 5. Session Timer

#### Display
- New `SessionTimer` component below token counter in `StatusBar.tsx`
- "Session: 2h 14m" (horizontal) or stacked "2h\n14m" (vertical)
- Styled `--claude-text-dim`, visible only when session active

#### Tracking
- Main process tracks `sessionStartedAt` in `ipc-handlers.ts` — set on inactive→active transition, cleared on deactivation
- Added to `ClaudeUsageState` as `sessionStartedAt: number | null`
- Renderer ticks with 1-second `setInterval` — no extra IPC

#### Night Owl Integration
- Past midnight: reuses `sessionStartedAt` but shows time since 00:00

### 6. Notification Sounds

#### Events
| Event | Sound | Duration |
|-------|-------|----------|
| Session start | Rising 2-note chime | ~0.3s |
| Session end | Falling 2-note tone | ~0.3s |
| Rate limit 80% | Warning ping | ~0.2s |
| Rate limit 90% | Urgent double-ping | ~0.3s |
| 500K milestone | Light tinkle | ~0.4s |
| 1M+ milestones | Rising arpeggio | ~0.6s |

#### Implementation
- Web Audio API in renderer — no audio files, all synthesized via `OscillatorNode`
- New `useSounds` hook: `playSessionStart()`, `playSessionEnd()`, `playWarning()`, `playCelebration()`
- Checks mute state before playing

#### Mute Toggle
- `soundMuted: boolean` in `PulseConfig`
- Toggle in Help window Settings + tray menu
- Persisted in config
