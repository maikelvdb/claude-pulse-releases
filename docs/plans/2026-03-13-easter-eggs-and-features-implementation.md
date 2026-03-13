# Easter Eggs & Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 6 features to Claude Pulse: Konami code rainbow mode, token milestone celebrations, night owl mode, usage heatmap calendar, session timer, and notification sounds.

**Architecture:** Features are split into renderer-only (Konami, milestones, night owl visuals, sounds) and full-stack (session timer needs main process tracking, heatmap needs persistent storage). All renderer features use existing IPC and hook patterns. No test framework exists, so we skip TDD and verify manually.

**Tech Stack:** React, Tailwind CSS, Web Audio API, Electron IPC

---

### Task 1: Extend shared types and config

**Files:**
- Modify: `src/shared/types.ts:27-33` (ClaudeUsageState)
- Modify: `src/shared/types.ts:49-56` (PulseConfig)

**Step 1: Add sessionStartedAt to ClaudeUsageState**

In `src/shared/types.ts`, add to `ClaudeUsageState` interface:

```typescript
export interface ClaudeUsageState {
  session: SessionInfo;
  currentModel: string | null;
  tokens: TokenUsage;
  limits: UsageLimits;
  plan: PlanInfo;
  sessionStartedAt: number | null;  // ADD: epoch ms when session became active
}
```

**Step 2: Add soundMuted to PulseConfig**

```typescript
export interface PulseConfig {
  snapEdge: SnapEdge;
  userOffset?: number | null;
  theme?: ThemeName;
  opacity?: number;
  positionLocked?: boolean;
  autoStart?: boolean;
  soundMuted?: boolean;  // ADD
}
```

**Step 3: Add DailyRollup type**

Add after `ActivitySnapshot` interface:

```typescript
export interface DailyRollup {
  input: number;
  output: number;
}

export interface DailyRollups {
  [date: string]: DailyRollup;  // "2026-03-13" => { input, output }
}
```

**Step 4: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: extend types for session timer, sounds, and daily rollups"
```

---

### Task 2: Track session start time in main process

**Files:**
- Modify: `src/main/ipc-handlers.ts:670-682` (buildState)
- Modify: `src/main/ipc-handlers.ts:740-748` (session poll)

**Step 1: Add session tracking state**

At the top of `ipc-handlers.ts` (near line 16), add:

```typescript
let sessionStartedAt: number | null = null;
```

**Step 2: Update session poll to track start time**

In the fast session poll (around line 740), update the session transition logic:

```typescript
setInterval(() => {
  const newSession = getActiveSession();
  const sessionChanged = cachedState?.session.isActive !== newSession.isActive;

  if (sessionChanged) {
    if (newSession.isActive) {
      sessionStartedAt = Date.now();
    } else {
      sessionStartedAt = null;
    }
    cachedState = buildState();
    mainWindow.webContents.send('claude:usage-update', cachedState);
  }
}, POLL_INTERVAL_SESSION);
```

**Step 3: Include sessionStartedAt in buildState**

Update `buildState()` to include the new field:

```typescript
function buildState(): ClaudeUsageState {
  const session = getActiveSession();
  const tokens = getTodayTokenUsage();
  const plan = getPlanInfo();
  const currentModel = getCurrentModel();
  const limits = getUsageLimits(plan.rateLimitTier, tokens.inputToday, tokens.outputToday);

  return { session, currentModel, tokens, limits, plan, sessionStartedAt };
}
```

**Step 4: Initialize sessionStartedAt on startup**

After the initial `cachedState = buildState()` (around line 780), add:

```typescript
if (cachedState.session.isActive) {
  sessionStartedAt = Date.now();
}
```

**Step 5: Commit**

```bash
git add src/main/ipc-handlers.ts
git commit -m "feat: track session start time in main process"
```

---

### Task 3: Add daily rollups to activity store

**Files:**
- Modify: `src/main/services/activity-store.ts`

**Step 1: Add rollup storage**

Add imports and state near the top of the file:

```typescript
import { ActivitySnapshot, DailyRollup, DailyRollups } from '../../shared/types';

let dailyRollups: DailyRollups = {};
const MAX_ROLLUP_DAYS = 365;
```

**Step 2: Update loadActivityHistory to load rollups**

In `loadActivityHistory()`, after loading snapshots, also load rollups from the same JSON structure. Change the file format from a plain array to `{ snapshots: [...], dailyRollups: {...} }`:

```typescript
export function loadActivityHistory(): void {
  try {
    if (!fs.existsSync(ACTIVITY_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(ACTIVITY_FILE, 'utf-8'));

    // Support both old format (plain array) and new format (object with snapshots + rollups)
    const snapshotArray = Array.isArray(raw) ? raw : (raw.snapshots || []);
    snapshots = snapshotArray.filter(
      (s: any) => typeof s.t === 'number' && typeof s.input === 'number'
        && typeof s.output === 'number' && typeof s.active === 'boolean'
    );

    if (!Array.isArray(raw) && raw.dailyRollups) {
      dailyRollups = raw.dailyRollups;
    }
  } catch { /* ignore */ }
}
```

**Step 3: Update recordSnapshot to maintain rollups**

In `recordSnapshot()`, after adding the snapshot, update today's rollup:

```typescript
export function recordSnapshot(input: number, output: number, active: boolean): void {
  // ... existing snapshot logic ...

  // Update daily rollup
  const today = new Date().toISOString().slice(0, 10); // "2026-03-13"
  const existing = dailyRollups[today] || { input: 0, output: 0 };
  // Store cumulative max (tokens are cumulative counters that reset daily)
  if (input > existing.input) existing.input = input;
  if (output > existing.output) existing.output = output;
  dailyRollups[today] = existing;

  // Prune old rollups
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_ROLLUP_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  for (const date of Object.keys(dailyRollups)) {
    if (date < cutoffStr) delete dailyRollups[date];
  }

  debouncedWrite();
}
```

**Step 4: Update write function to save both**

Change the write function to save the new format:

```typescript
function writeToFile(): void {
  try {
    fs.writeFileSync(ACTIVITY_FILE, JSON.stringify({ snapshots, dailyRollups }), 'utf-8');
  } catch { /* ignore */ }
}
```

**Step 5: Export getDailyRollups**

```typescript
export function getDailyRollups(): DailyRollups {
  return dailyRollups;
}
```

**Step 6: Commit**

```bash
git add src/main/services/activity-store.ts
git commit -m "feat: add daily rollup tracking to activity store"
```

---

### Task 4: Wire daily rollups through IPC

**Files:**
- Modify: `src/preload/index.ts` (add onDailyRollups listener)
- Modify: `src/main/ipc-handlers.ts` (send rollups with activity history)

**Step 1: Add IPC channel in preload**

In `src/preload/index.ts`, add a new listener after `onActivityHistory`:

```typescript
onDailyRollups: (callback: (rollups: any) => void) => {
  const sub = (_event: any, rollups: any) => callback(rollups);
  ipcRenderer.on('claude:daily-rollups', sub);
  return () => { ipcRenderer.removeListener('claude:daily-rollups', sub); };
},
```

**Step 2: Send rollups from main process**

In `src/main/ipc-handlers.ts`, import `getDailyRollups` from activity-store. In the stats polling interval (after sending activity history), also send rollups:

```typescript
mainWindow.webContents.send('claude:daily-rollups', getDailyRollups());
```

Also add it to the initial push and to the `claude:request-update` handler.

**Step 3: Commit**

```bash
git add src/preload/index.ts src/main/ipc-handlers.ts
git commit -m "feat: wire daily rollups through IPC to renderer"
```

---

### Task 5: Add soundMuted to config store and tray

**Files:**
- Modify: `src/main/services/config-store.ts` (add soundMuted to defaults and validation)
- Modify: `src/main/tray.ts` (add Mute Sounds menu item)
- Modify: `src/main/ipc-handlers.ts` (add to help window settings + page-title handler)

**Step 1: Update config-store defaults**

In `src/main/services/config-store.ts`, add to `DEFAULT_CONFIG`:

```typescript
const DEFAULT_CONFIG: PulseConfig = {
  snapEdge: 'top', userOffset: null, theme: 'dark',
  opacity: 1, positionLocked: false, autoStart: false, soundMuted: false
};
```

And in `loadConfig()`, add:

```typescript
soundMuted: !!data.soundMuted,
```

**Step 2: Add tray menu item**

In `src/main/tray.ts`, add a "Mute Sounds" checkbox menu item before "Quit":

```typescript
{
  label: 'Mute Sounds',
  type: 'checkbox',
  checked: getConfig().soundMuted ?? false,
  click: (menuItem) => {
    saveConfig({ soundMuted: menuItem.checked });
    getWindow()?.webContents.send('widget:sound-muted', menuItem.checked);
  },
},
```

Import `getConfig`, `saveConfig` from config-store.

**Step 3: Add mute toggle to help window settings**

In `src/main/ipc-handlers.ts`, add a mute toggle row in the Settings section HTML (after the autostart toggle), add CSS/JS handlers following the same pattern as lock-toggle, and handle `soundmute:` prefix in `page-title-updated`.

**Step 4: Add preload listener for sound mute**

In `src/preload/index.ts`, add:

```typescript
onSoundMuted: (callback: (muted: boolean) => void) => {
  const sub = (_event: any, muted: boolean) => callback(muted);
  ipcRenderer.on('widget:sound-muted', sub);
  return () => { ipcRenderer.removeListener('widget:sound-muted', sub); };
},
```

**Step 5: Commit**

```bash
git add src/main/services/config-store.ts src/main/tray.ts src/main/ipc-handlers.ts src/preload/index.ts
git commit -m "feat: add sound mute config, tray toggle, and help window toggle"
```

---

### Task 6: Create useSounds hook

**Files:**
- Create: `src/renderer/hooks/useSounds.ts`

**Step 1: Create the hook**

```typescript
import { useRef, useCallback, useEffect, useState } from 'react';

export function useSounds() {
  const ctxRef = useRef<AudioContext | null>(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const unsub = window.claudePulse.onSoundMuted?.((m: boolean) => setMuted(m));
    return () => { unsub?.(); };
  }, []);

  function getCtx(): AudioContext {
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    return ctxRef.current;
  }

  function tone(freq: number, duration: number, type: OscillatorType = 'sine', gain = 0.15) {
    if (muted) return;
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(g).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  const playSessionStart = useCallback(() => {
    tone(523, 0.15); // C5
    setTimeout(() => tone(659, 0.15), 150); // E5
  }, [muted]);

  const playSessionEnd = useCallback(() => {
    tone(659, 0.15); // E5
    setTimeout(() => tone(523, 0.15), 150); // C5
  }, [muted]);

  const playWarning = useCallback(() => {
    tone(880, 0.2, 'triangle'); // A5
  }, [muted]);

  const playUrgent = useCallback(() => {
    tone(988, 0.12, 'triangle'); // B5
    setTimeout(() => tone(988, 0.12, 'triangle'), 150);
  }, [muted]);

  const playSparkle = useCallback(() => {
    tone(1047, 0.1, 'sine', 0.1); // C6
    setTimeout(() => tone(1319, 0.1, 'sine', 0.1), 80); // E6
    setTimeout(() => tone(1568, 0.15, 'sine', 0.08), 160); // G6
  }, [muted]);

  const playCelebration = useCallback(() => {
    tone(523, 0.1); // C5
    setTimeout(() => tone(659, 0.1), 100); // E5
    setTimeout(() => tone(784, 0.1), 200); // G5
    setTimeout(() => tone(1047, 0.2), 300); // C6
  }, [muted]);

  return { playSessionStart, playSessionEnd, playWarning, playUrgent, playSparkle, playCelebration, muted };
}
```

**Step 2: Commit**

```bash
git add src/renderer/hooks/useSounds.ts
git commit -m "feat: add useSounds hook with Web Audio synthesized sounds"
```

---

### Task 7: Create SessionTimer component

**Files:**
- Create: `src/renderer/components/SessionTimer.tsx`

**Step 1: Create the component**

```tsx
import React, { useState, useEffect } from 'react';

interface SessionTimerProps {
  sessionStartedAt: number | null;
  orientation: 'horizontal' | 'vertical';
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function SessionTimer({ sessionStartedAt, orientation }: SessionTimerProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!sessionStartedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sessionStartedAt]);

  if (!sessionStartedAt) return null;

  const elapsed = now - sessionStartedAt;
  const isVertical = orientation === 'vertical';

  // Night owl: show time since midnight if past midnight
  const hour = new Date().getHours();
  const isNightOwl = hour >= 0 && hour < 5;
  let nightOwlElapsed = 0;
  if (isNightOwl) {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    nightOwlElapsed = now - midnight.getTime();
  }

  return (
    <div className={`flex ${isVertical ? 'flex-col items-center' : 'items-center gap-2'} text-[9px] text-claude-text-dim`}>
      <span>{isVertical ? formatElapsed(elapsed) : `Session: ${formatElapsed(elapsed)}`}</span>
      {isNightOwl && (
        <span className="text-[8px] opacity-70">
          🌙 {isVertical ? formatElapsed(nightOwlElapsed) : `Up since midnight: ${formatElapsed(nightOwlElapsed)}`}
        </span>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/renderer/components/SessionTimer.tsx
git commit -m "feat: add SessionTimer component with night owl indicator"
```

---

### Task 8: Create MiniHeatmap component

**Files:**
- Create: `src/renderer/components/MiniHeatmap.tsx`

**Step 1: Create the component**

```tsx
import React from 'react';
import { DailyRollups } from '../../shared/types';

interface MiniHeatmapProps {
  rollups: DailyRollups;
  orientation: 'horizontal' | 'vertical';
  onClickHistory?: () => void;
}

function getIntensity(total: number, max: number): string {
  if (total === 0 || max === 0) return 'opacity-10';
  const ratio = total / max;
  if (ratio < 0.2) return 'opacity-20';
  if (ratio < 0.4) return 'opacity-40';
  if (ratio < 0.7) return 'opacity-70';
  return 'opacity-100';
}

export default function MiniHeatmap({ rollups, orientation, onClickHistory }: MiniHeatmapProps) {
  const days: { date: string; total: number }[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const r = rollups[key];
    days.push({ date: key, total: r ? r.input + r.output : 0 });
  }
  const max = Math.max(...days.map(d => d.total), 1);
  const isVertical = orientation === 'vertical';

  return (
    <div
      className={`flex ${isVertical ? 'flex-col' : 'flex-row'} gap-[2px] cursor-pointer no-drag`}
      onClick={onClickHistory}
      title="Click for full history"
    >
      {days.map(d => (
        <div
          key={d.date}
          className={`${isVertical ? 'w-3 h-3' : 'w-3 h-3'} rounded-[2px] bg-claude-orange ${getIntensity(d.total, max)}`}
          title={`${d.date}: ${d.total > 0 ? (d.total / 1000).toFixed(0) + 'K tokens' : 'no usage'}`}
        />
      ))}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/renderer/components/MiniHeatmap.tsx
git commit -m "feat: add MiniHeatmap 7-day component for expanded widget"
```

---

### Task 9: Create Confetti component for milestones

**Files:**
- Create: `src/renderer/components/Confetti.tsx`

**Step 1: Create the component**

```tsx
import React, { useEffect, useState } from 'react';

interface ConfettiProps {
  intensity: 'small' | 'medium' | 'large' | 'party';
  onDone: () => void;
}

const PARTICLE_COUNTS = { small: 12, medium: 24, large: 40, party: 60 };
const COLORS = ['#E87443', '#4ade80', '#60a5fa', '#f472b6', '#facc15', '#a78bfa'];

interface Particle {
  id: number;
  x: number;
  color: string;
  delay: number;
  duration: number;
  size: number;
}

export default function Confetti({ intensity, onDone }: ConfettiProps) {
  const [particles] = useState<Particle[]>(() => {
    const count = PARTICLE_COUNTS[intensity];
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      delay: Math.random() * 0.5,
      duration: 1 + Math.random() * 1.5,
      size: 3 + Math.random() * 4,
    }));
  });

  useEffect(() => {
    const timer = setTimeout(onDone, 3000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-50">
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute rounded-full animate-confetti"
          style={{
            left: `${p.x}%`,
            top: '-5%',
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
```

**Step 2: Add confetti animation to globals.css**

In `src/renderer/styles/globals.css`, add:

```css
@keyframes confetti {
  0% { transform: translateY(0) rotate(0deg); opacity: 1; }
  100% { transform: translateY(400px) rotate(720deg); opacity: 0; }
}
.animate-confetti {
  animation: confetti 2s ease-in forwards;
}
```

**Step 3: Commit**

```bash
git add src/renderer/components/Confetti.tsx src/renderer/styles/globals.css
git commit -m "feat: add Confetti particle component for milestone celebrations"
```

---

### Task 10: Add rainbow mode CSS and Konami code listener

**Files:**
- Modify: `src/renderer/styles/globals.css` (rainbow + night owl CSS)
- Modify: `src/renderer/App.tsx` (Konami code listener)

**Step 1: Add rainbow and night owl CSS to globals.css**

```css
/* Rainbow mode (Konami code) */
@keyframes rainbow-hue {
  0% { filter: hue-rotate(0deg); }
  100% { filter: hue-rotate(360deg); }
}
[data-rainbow="true"] {
  animation: rainbow-hue 2s linear infinite;
}

/* Night owl mode */
[data-nightowl="true"] {
  filter: brightness(0.9) saturate(0.85);
}
```

**Step 2: Add Konami code listener to App.tsx**

Add inside the `App` component, before the return statement:

```tsx
// Konami code: ↑↑↓↓←→←→BA
const konamiRef = useRef<string[]>([]);
const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];

useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    konamiRef.current.push(e.key);
    konamiRef.current = konamiRef.current.slice(-10);
    if (konamiRef.current.join(',') === KONAMI.join(',')) {
      document.documentElement.setAttribute('data-rainbow', 'true');
      setTimeout(() => document.documentElement.removeAttribute('data-rainbow'), 10000);
      konamiRef.current = [];
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, []);
```

**Step 3: Commit**

```bash
git add src/renderer/styles/globals.css src/renderer/App.tsx
git commit -m "feat: add Konami code rainbow mode and night owl CSS"
```

---

### Task 11: Integrate all features into useClaudeStats and App

**Files:**
- Modify: `src/renderer/hooks/useClaudeStats.ts` (add dailyRollups state, sound mute listener)
- Modify: `src/renderer/App.tsx` (integrate milestones, night owl, sounds)

**Step 1: Extend useClaudeStats**

Add to the hook:

```typescript
const [dailyRollups, setDailyRollups] = useState<DailyRollups>({});
```

Add IPC listener:

```typescript
const unsubRollups = window.claudePulse.onDailyRollups?.((r: DailyRollups) => setDailyRollups(r));
```

Add to cleanup and return value.

**Step 2: Add milestone detection in App.tsx**

Track milestone tiers with a ref:

```tsx
const reachedTiers = useRef<Set<number>>(new Set());
const [confetti, setConfetti] = useState<'small' | 'medium' | 'large' | 'party' | null>(null);
const { playSparkle, playCelebration, playSessionStart, playSessionEnd, playWarning, playUrgent } = useSounds();
const prevSessionActive = useRef(state.session.isActive);
const prevHourlyUsed = useRef(0);

// Milestone detection
useEffect(() => {
  const total = state.tokens.inputToday + state.tokens.outputToday;
  const tiers: [number, 'small' | 'medium' | 'large' | 'party'][] = [
    [500_000, 'small'], [1_000_000, 'medium'], [5_000_000, 'large'], [10_000_000, 'party'],
  ];
  for (const [threshold, intensity] of tiers) {
    if (total >= threshold && !reachedTiers.current.has(threshold)) {
      reachedTiers.current.add(threshold);
      setConfetti(intensity);
      if (intensity === 'small') playSparkle();
      else playCelebration();
    }
  }
}, [state.tokens]);

// Session sound
useEffect(() => {
  if (state.session.isActive && !prevSessionActive.current) playSessionStart();
  if (!state.session.isActive && prevSessionActive.current) playSessionEnd();
  prevSessionActive.current = state.session.isActive;
}, [state.session.isActive]);

// Rate limit sounds
useEffect(() => {
  const h = state.limits.hourlyUsed;
  if (h >= 0.9 && prevHourlyUsed.current < 0.9) playUrgent();
  else if (h >= 0.8 && prevHourlyUsed.current < 0.8) playWarning();
  prevHourlyUsed.current = h;
}, [state.limits.hourlyUsed]);
```

**Step 3: Add night owl auto-detection**

```tsx
useEffect(() => {
  const check = () => {
    const h = new Date().getHours();
    const isNight = h >= 0 && h < 5;
    if (isNight) document.documentElement.setAttribute('data-nightowl', 'true');
    else document.documentElement.removeAttribute('data-nightowl');
  };
  check();
  const id = setInterval(check, 60000);
  return () => clearInterval(id);
}, []);
```

**Step 4: Commit**

```bash
git add src/renderer/hooks/useClaudeStats.ts src/renderer/App.tsx
git commit -m "feat: integrate milestones, night owl, and sound triggers"
```

---

### Task 12: Wire SessionTimer, MiniHeatmap, and Confetti into StatusBar

**Files:**
- Modify: `src/renderer/components/StatusBar.tsx`

**Step 1: Import new components**

```typescript
import SessionTimer from './SessionTimer';
import MiniHeatmap from './MiniHeatmap';
import Confetti from './Confetti';
```

**Step 2: Add props**

Extend `StatusBarProps`:

```typescript
interface StatusBarProps {
  // ... existing props ...
  dailyRollups: DailyRollups;
  confetti: 'small' | 'medium' | 'large' | 'party' | null;
  onConfettiDone: () => void;
}
```

**Step 3: Place SessionTimer after TokenCounter**

In both horizontal and vertical layouts, add `<SessionTimer>` right after `<TokenCounter>`:

```tsx
<TokenCounter tokens={state.tokens} orientation="horizontal" />
<SessionTimer sessionStartedAt={state.sessionStartedAt} orientation="horizontal" />
```

**Step 4: Place MiniHeatmap in expanded view**

After `<ActivityDetail>` in the expanded section, add:

```tsx
<MiniHeatmap rollups={dailyRollups} orientation="horizontal" onClickHistory={onHelp} />
```

**Step 5: Place Confetti overlay**

At the top of the component return, conditionally render:

```tsx
{confetti && <Confetti intensity={confetti} onDone={onConfettiDone} />}
```

**Step 6: Update window height constants if needed**

In `src/shared/constants.ts`, increase `WINDOW_HEIGHT_H` from 68 to 80 to accommodate the session timer row. Update `WINDOW_HEIGHT_H_PREVIEW` from 86 to 98 accordingly.

**Step 7: Commit**

```bash
git add src/renderer/components/StatusBar.tsx src/shared/constants.ts
git commit -m "feat: wire SessionTimer, MiniHeatmap, and Confetti into StatusBar"
```

---

### Task 13: Add full heatmap to Help window

**Files:**
- Modify: `src/main/ipc-handlers.ts` (add History tab to HELP_HTML, send rollups)

**Step 1: Add History tab button**

In the tabs section of HELP_HTML, add after the Projects tab:

```html
<button class="tab" data-tab="history">History</button>
```

**Step 2: Add History tab panel**

After the Projects tab panel, add:

```html
<div class="tab-panel" id="tab-history">
  <div class="section">
    <div id="history-stats"></div>
    <h2>Token Usage (52 weeks)</h2>
    <div id="heatmap-grid" style="display:flex;gap:2px;flex-wrap:wrap;max-width:390px"></div>
  </div>
</div>
```

**Step 3: Add CSS for heatmap cells**

```css
.heatmap-cell {
  width: 5px; height: 5px; border-radius: 1px;
  background: var(--claude-orange, #E87443);
}
```

**Step 4: Add JavaScript handler for heatmap rendering**

In the `window.addEventListener('message', ...)` block, add handler for `type === 'daily-rollups'`:

```javascript
if (e.data && e.data.type === 'daily-rollups') {
  var rollups = e.data.rollups;
  var grid = document.getElementById('heatmap-grid');
  var today = new Date();
  var cells = [];
  var maxTotal = 0;
  for (var i = 363; i >= 0; i--) {
    var d = new Date(today);
    d.setDate(d.getDate() - i);
    var key = d.toISOString().slice(0, 10);
    var r = rollups[key];
    var total = r ? r.input + r.output : 0;
    if (total > maxTotal) maxTotal = total;
    cells.push({ date: key, total: total });
  }
  var html = '';
  cells.forEach(function(c) {
    var opacity = c.total === 0 ? 0.08 : Math.max(0.2, c.total / maxTotal);
    html += '<div class="heatmap-cell" style="opacity:' + opacity + '" title="' + c.date + ': ' + fmtTokens(c.total) + ' tokens"></div>';
  });
  grid.innerHTML = html;

  // Stats
  var thisWeek = 0, thisMonth = 0, allTime = 0;
  var weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
  var monthAgo = new Date(today); monthAgo.setDate(monthAgo.getDate() - 30);
  Object.keys(rollups).forEach(function(k) {
    var t = rollups[k].input + rollups[k].output;
    allTime += t;
    if (k >= weekAgo.toISOString().slice(0, 10)) thisWeek += t;
    if (k >= monthAgo.toISOString().slice(0, 10)) thisMonth += t;
  });
  document.getElementById('history-stats').innerHTML =
    '<p style="font-size:12px;margin-bottom:12px;color:#888">' +
    'This week: <strong style="color:#c8c8d8">' + fmtTokens(thisWeek) + '</strong> · ' +
    'This month: <strong style="color:#c8c8d8">' + fmtTokens(thisMonth) + '</strong> · ' +
    'All time: <strong style="color:#c8c8d8">' + fmtTokens(allTime) + '</strong></p>';
}
```

**Step 5: Send rollups in did-finish-load**

In the `did-finish-load` handler, add to the batched `executeJavaScript` call:

```typescript
const rollups = getDailyRollups();
// Add to the script string:
window.postMessage(${JSON.stringify({ type: 'daily-rollups', rollups })}, '*');
```

Import `getDailyRollups` from activity-store.

**Step 6: Commit**

```bash
git add src/main/ipc-handlers.ts
git commit -m "feat: add full 52-week heatmap to Help window History tab"
```

---

### Task 14: TypeScript check and final build verification

**Step 1: Run TypeScript check**

```bash
npx tsc --noEmit
```

Fix any type errors.

**Step 2: Run build**

```bash
npm run build
```

Verify webpack compiles without errors.

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve type errors from new features"
```

---

### Task 15: Release

**Step 1: Bump version to 3.1.0**

In `package.json`, change `"version": "3.0.0"` to `"version": "3.1.0"`.

**Step 2: Commit, tag, push**

```bash
git add package.json
git commit -m "chore: bump version to 3.1.0"
git tag v3.1.0
git push origin master --tags
```

**Step 3: Build installer and create GitHub releases**

```bash
npx electron-builder --win
gh release create v3.1.0 --repo maikelvdb/claude-pulse --title "Claude Pulse v3.1.0" --notes "..."
gh release create v3.1.0 --repo maikelvdb/claude-pulse-releases --title "v3.1.0" --notes "..." "release/Claude Pulse Setup 3.1.0.exe"
```
