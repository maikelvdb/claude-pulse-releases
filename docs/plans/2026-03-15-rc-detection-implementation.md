# Remote Control Session Detection — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Detect `/rc` (remote control) sessions across all active Claude Code JSONL files, show an RC badge in the status bar, and provide a help window tab listing active RC sessions with QR codes.

**Architecture:** Extend the conversation tailer to scan all active JSONL files for `bridge_status` entries. Main process maintains an RC session map and pushes updates via IPC. Renderer shows an RcBadge before PlanBadge, clicking it opens the help window's new RC tab. QR codes generated via the `qrcode` npm package.

**Tech Stack:** Electron IPC, React, TypeScript, qrcode npm package, existing JSONL tailing infrastructure.

---

### Task 1: Install qrcode dependency

**Files:**
- Modify: `package.json`

**Step 1: Install packages**

Run: `cd C:/repos/claude-widget && npm install qrcode && npm install -D @types/qrcode`

**Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add qrcode dependency for RC feature"
```

---

### Task 2: Add RcSession type

**Files:**
- Modify: `src/shared/types.ts:104` (after UpdateInfo interface)

**Step 1: Add the RcSession interface**

Add after the `UpdateInfo` interface (line 104):

```typescript
export interface RcSession {
  sessionId: string;
  url: string;
  slug: string;
  cwd: string;
  startedAt: number;
}
```

**Step 2: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add RcSession type for remote control detection"
```

---

### Task 3: Extend conversation tailer to detect bridge_status

**Files:**
- Modify: `src/main/services/conversation-tailer.ts`

**Step 1: Add RC detection callback and scanning**

The current tailer only reads the **latest** JSONL file and looks for assistant messages. We need to also detect `bridge_status` entries. Since `bridge_status` can appear in any active JSONL file, we need to scan all active files.

Replace the entire file with:

```typescript
import fs from 'fs';
import path from 'path';
import { findLatestJsonlFile } from './session-file';
import { PROJECTS_DIR } from '../../shared/constants';
import { RcSession } from '../../shared/types';

let lastFile: string | null = null;
let lastSize = 0;
let lastMessage = '';
let lastRaw = '';
let onMessageCallback: ((msg: string) => void) | null = null;
let onRcCallback: ((sessions: RcSession[]) => void) | null = null;
let pollId: ReturnType<typeof setInterval> | null = null;

// Track RC sessions: sessionId -> RcSession
const rcSessions = new Map<string, RcSession>();
// Track which JSONL files we've already scanned for bridge_status, and up to what byte offset
const rcScannedOffsets = new Map<string, number>();

const ACTIVE_THRESHOLD = 30000; // 30s

export function startConversationTailer(
  onMessage: (msg: string) => void,
  onRc?: (sessions: RcSession[]) => void,
): void {
  onMessageCallback = onMessage;
  onRcCallback = onRc ?? null;
  pollId = setInterval(poll, 2000);
  poll(); // immediate first check
}

export function stopConversationTailer(): void {
  if (pollId !== null) {
    clearInterval(pollId);
    pollId = null;
  }
  onMessageCallback = null;
  onRcCallback = null;
}

export function getLastMessage(): string {
  return lastMessage;
}

export function getActiveRcSessions(): RcSession[] {
  return Array.from(rcSessions.values()).sort((a, b) => b.startedAt - a.startedAt);
}

function poll(): void {
  pollConversation();
  pollRcSessions();
}

function pollConversation(): void {
  try {
    const file = findLatestJsonlFile();
    if (!file) return;

    const stat = fs.statSync(file);

    // If different file, reset
    if (file !== lastFile) {
      lastFile = file;
      lastSize = 0;
    }

    // No new data
    if (stat.size <= lastSize) return;

    // Read only new bytes
    const fd = fs.openSync(file, 'r');
    const newBytes = Buffer.alloc(stat.size - lastSize);
    fs.readSync(fd, newBytes, 0, newBytes.length, lastSize);
    fs.closeSync(fd);
    lastSize = stat.size;

    const newContent = newBytes.toString('utf-8');
    const lines = newContent.trim().split('\n');

    // Find the latest assistant text content
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (!line) continue;
      try {
        const entry = JSON.parse(line);
        const msg = entry.message;
        if (!msg || msg.role !== 'assistant') continue;

        // Extract text from content blocks
        if (typeof msg.content === 'string' && msg.content.trim()) {
          updateMessage(msg.content.trim());
          return;
        }
        if (Array.isArray(msg.content)) {
          for (let j = msg.content.length - 1; j >= 0; j--) {
            const block = msg.content[j];
            if (block.type === 'text' && block.text?.trim()) {
              updateMessage(block.text.trim());
              return;
            }
          }
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Silently fail
  }
}

function pollRcSessions(): void {
  try {
    if (!fs.existsSync(PROJECTS_DIR)) return;

    const now = Date.now();
    const activeSessionIds = new Set<string>();

    const projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory());

    for (const dir of projectDirs) {
      const dirPath = path.join(PROJECTS_DIR, dir.name);
      let files: string[];
      try {
        files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl') && !f.includes('subagent'));
      } catch {
        continue;
      }

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        try {
          const stat = fs.statSync(filePath);
          const isActive = now - stat.mtimeMs < ACTIVE_THRESHOLD;

          // Only scan active files for new bridge_status entries
          if (!isActive) continue;

          const prevOffset = rcScannedOffsets.get(filePath) ?? 0;
          if (stat.size <= prevOffset) {
            // No new data, but file is active — mark its sessions alive
            for (const [sid, rc] of rcSessions) {
              if (rc.cwd && filePath.includes(sid.slice(0, 8))) {
                activeSessionIds.add(sid);
              }
            }
            continue;
          }

          // Read new bytes
          const fd = fs.openSync(filePath, 'r');
          const newBytes = Buffer.alloc(stat.size - prevOffset);
          fs.readSync(fd, newBytes, 0, newBytes.length, prevOffset);
          fs.closeSync(fd);
          rcScannedOffsets.set(filePath, stat.size);

          const lines = newBytes.toString('utf-8').trim().split('\n');
          for (const line of lines) {
            if (!line) continue;
            try {
              const entry = JSON.parse(line);
              if (entry.subtype === 'bridge_status' && entry.url) {
                const sessionId = entry.sessionId;
                if (sessionId && !rcSessions.has(sessionId)) {
                  rcSessions.set(sessionId, {
                    sessionId,
                    url: entry.url,
                    slug: entry.slug ?? '',
                    cwd: entry.cwd ?? '',
                    startedAt: new Date(entry.timestamp).getTime(),
                  });
                }
                if (sessionId) activeSessionIds.add(sessionId);
              }
              // Also keep the session alive if any entry has its sessionId
              if (entry.sessionId && rcSessions.has(entry.sessionId)) {
                activeSessionIds.add(entry.sessionId);
              }
            } catch {
              continue;
            }
          }
        } catch {
          continue;
        }
      }
    }

    // Remove RC sessions whose JSONL is no longer active
    let changed = false;
    for (const sid of rcSessions.keys()) {
      if (!activeSessionIds.has(sid)) {
        rcSessions.delete(sid);
        changed = true;
      }
    }
    if (changed || activeSessionIds.size > 0) {
      onRcCallback?.(getActiveRcSessions());
    }
  } catch {
    // Silently fail
  }
}

function updateMessage(msg: string): void {
  if (msg === lastRaw) return; // skip regex work if raw text unchanged
  lastRaw = msg;

  // Truncate to first ~200 chars for display, strip markdown
  const clean = msg
    .replace(/```[\s\S]*?```/g, '[code]')  // collapse code blocks
    .replace(/`[^`]+`/g, '[code]')          // collapse inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → text
    .replace(/[#*_~>]/g, '')                 // strip markdown chars
    .replace(/\n+/g, ' ')                   // collapse newlines
    .trim();

  const truncated = clean.length > 200 ? clean.slice(0, 200) + '...' : clean;

  if (truncated !== lastMessage) {
    lastMessage = truncated;
    onMessageCallback?.(truncated);
  }
}
```

**Step 2: Verify the existing conversation preview still works by running:**

Run: `cd C:/repos/claude-widget && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/main/services/conversation-tailer.ts
git commit -m "feat: extend conversation tailer to detect RC bridge_status entries"
```

---

### Task 4: Add IPC channel and wire up RC events

**Files:**
- Modify: `src/main/index.ts:93-96` (where startConversationTailer is called)
- Modify: `src/preload/index.ts:1-2` (imports) and after line 65 (add listener)
- Modify: `src/renderer/hooks/useClaudeStats.ts` (add RC state, subscribe, expose)

**Step 1: Update main process to pass RC callback**

In `src/main/index.ts`, update the `startConversationTailer` call (lines 93-96) to also handle RC sessions:

```typescript
  startConversationTailer(
    (msg) => {
      resizeForPreview(!!msg);
      win.webContents.send('claude:conversation-preview', msg);
    },
    (rcSessions) => {
      win.webContents.send('claude:rc-sessions', rcSessions);
    },
  );
```

**Step 2: Add RC listener to preload bridge**

In `src/preload/index.ts`, add the import for `RcSession`:

```typescript
import { ClaudeUsageState, CliStatus, SnapEdge, ActivitySnapshot, UpdateInfo, ThemeName, DailyRollups, Achievement, RcSession } from '../shared/types';
```

Add after the `onThemeChange` listener (line 65):

```typescript
  onRcSessions: makeListener<RcSession[]>('claude:rc-sessions'),
```

**Step 3: Add RC state to useClaudeStats hook**

In `src/renderer/hooks/useClaudeStats.ts`:

Add `RcSession` to the import (line 3):
```typescript
import { ClaudeUsageState, SnapEdge, ActivitySnapshot, UpdateInfo, ThemeName, DailyRollups, RcSession } from '../../shared/types';
```

Add to the `Window.claudePulse` type declaration (after line 31, the `onDailyRollups` entry):
```typescript
      onRcSessions: (callback: (sessions: RcSession[]) => void) => () => void;
```

Add state inside `useClaudeStats` (after line 58, the `dailyRollups` state):
```typescript
  const [rcSessions, setRcSessions] = useState<RcSession[]>([]);
```

Add subscription inside the `useEffect` cleanups array (after line 66, the `onDailyRollups` cleanup):
```typescript
      window.claudePulse.onRcSessions?.((s: RcSession[]) => setRcSessions(s)),
```

Add `rcSessions` to the return statement (line 90):
```typescript
  return { state, snapEdge, activityHistory, isExpanded, toggleExpanded, theme, setTheme, conversationPreview, dailyRollups, rcSessions };
```

**Step 4: Verify**

Run: `cd C:/repos/claude-widget && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add src/main/index.ts src/preload/index.ts src/renderer/hooks/useClaudeStats.ts
git commit -m "feat: wire up RC sessions IPC from main to renderer"
```

---

### Task 5: Create RcBadge component

**Files:**
- Create: `src/renderer/components/RcBadge.tsx`

**Step 1: Create the RcBadge component**

```tsx
import React, { useState, useEffect } from 'react';

interface RcBadgeProps {
  count: number;
  orientation?: 'horizontal' | 'vertical';
  onClick: () => void;
}

export function RcBadge({ count, orientation = 'horizontal', onClick }: RcBadgeProps) {
  const [isNew, setIsNew] = useState(false);
  const [prevCount, setPrevCount] = useState(0);

  useEffect(() => {
    if (count > prevCount) {
      setIsNew(true);
      const timer = setTimeout(() => setIsNew(false), 5000);
      return () => clearTimeout(timer);
    }
    setPrevCount(count);
  }, [count]);

  // Update prevCount after the "new" animation
  useEffect(() => {
    if (!isNew) {
      setPrevCount(count);
    }
  }, [isNew, count]);

  if (count === 0) return null;

  const isVertical = orientation === 'vertical';

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`relative inline-flex items-center justify-center border font-bold tracking-wider rounded-md cursor-pointer transition-all duration-300 bg-cyan-500/20 text-cyan-400 border-cyan-500/50 hover:bg-cyan-500/30 ${
        isNew ? 'shadow-[0_0_8px_rgba(6,182,212,0.5)] animate-pulse' : 'shadow-[0_0_4px_rgba(6,182,212,0.2)]'
      } ${isVertical ? 'text-[7px] px-1 py-0.5' : 'text-[9px] px-1.5 py-0.5'}`}
      title={`${count} remote control session${count > 1 ? 's' : ''} active`}
    >
      {/* Broadcast/antenna icon */}
      <svg
        width={isVertical ? 10 : 12}
        height={isVertical ? 10 : 12}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mr-0.5"
      >
        <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
        <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.4" />
        <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.4" />
        <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19" />
        <circle cx="12" cy="12" r="2" />
      </svg>
      {count}
      {isNew && (
        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
      )}
    </button>
  );
}
```

**Step 2: Commit**

```bash
git add src/renderer/components/RcBadge.tsx
git commit -m "feat: add RcBadge component for remote control indicator"
```

---

### Task 6: Add RcBadge to StatusBar

**Files:**
- Modify: `src/renderer/components/StatusBar.tsx`

**Step 1: Add RcBadge to StatusBar props and all three layouts**

Add import at top (after line 12, the PlanBadge import):
```typescript
import { RcBadge } from './RcBadge';
```

Add to `StatusBarProps` interface (after line 29, `dailyRollups`):
```typescript
  rcCount: number;
  onRcClick: () => void;
```

**Vertical layout** — Add RcBadge before PlanBadge (before line 173):
```tsx
            {rcCount > 0 && <RcBadge count={rcCount} orientation="vertical" onClick={onRcClick} />}
```

**Compact horizontal layout** — Add RcBadge before PlanBadge (before line 234):
```tsx
        {rcCount > 0 && <RcBadge count={rcCount} onClick={onRcClick} />}
```

**Full horizontal layout** — Add RcBadge before PlanBadge (before line 281):
```tsx
        {rcCount > 0 && <RcBadge count={rcCount} onClick={onRcClick} />}
```

**Step 2: Update StatusBar usage in App.tsx**

Find where `<StatusBar` is rendered in `src/renderer/App.tsx` and add the new props:
```tsx
  rcCount={rcSessions.length}
  onRcClick={() => window.claudePulse.openHelp()}
```

Make sure `rcSessions` is destructured from `useClaudeStats()`.

**Step 3: Verify**

Run: `cd C:/repos/claude-widget && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/renderer/components/StatusBar.tsx src/renderer/App.tsx
git commit -m "feat: show RcBadge in StatusBar before PlanBadge"
```

---

### Task 7: Add Remote Control tab to help window

**Files:**
- Modify: `src/main/ipc-handlers.ts` (HELP_HTML string)

**Step 1: Add CSS for RC tab**

Add after the `.heatmap-cell` styles (around line 280 in ipc-handlers.ts), inside the `<style>` block:

```css
/* Remote Control tab */
.rc-empty { color: #666; font-size: 12px; font-style: italic; text-align: center; padding: 40px 0; }
.rc-card {
  background: #2a2a3e; border: 1px solid #333346; border-radius: 8px;
  padding: 14px 16px; margin-bottom: 12px;
}
.rc-card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.rc-slug {
  font-size: 13px; font-weight: 600; color: #06b6d4;
  flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.rc-time { font-size: 10px; color: #666; white-space: nowrap; }
.rc-path { font-size: 11px; color: #888; margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rc-url-row { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; }
.rc-url {
  flex: 1; font-size: 11px; color: #06b6d4; background: #0d0d1a;
  padding: 4px 8px; border-radius: 4px; border: 1px solid #333346;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: monospace; cursor: pointer;
}
.rc-url:hover { border-color: #06b6d4; }
.rc-copy-btn {
  background: #06b6d420; border: 1px solid #06b6d450; color: #06b6d4;
  font-size: 10px; padding: 3px 8px; border-radius: 4px; cursor: pointer;
  white-space: nowrap;
}
.rc-copy-btn:hover { background: #06b6d440; }
.rc-qr { display: flex; justify-content: center; padding: 8px 0; }
.rc-qr canvas { border-radius: 6px; }
.rc-icon {
  width: 16px; height: 16px; color: #06b6d4; flex-shrink: 0;
}
.rc-dot {
  position: absolute; top: 6px; right: 4px;
  width: 6px; height: 6px; border-radius: 50%;
  background: #06b6d4; animation: pulse-dot 2s infinite;
  display: none;
}
.rc-dot.visible { display: block; }
```

**Step 2: Add the Remote Control tab button**

In the tabs section (after line 454, the console tab button), add:
```html
  <button class="tab" data-tab="rc">
    RC
    <span class="rc-dot" id="rc-dot"></span>
  </button>
```

**Step 3: Add the Remote Control tab panel**

After the console tab panel closing div (after line 590, before `</div>` closing tab-panels), add:
```html
  <!-- Remote Control tab -->
  <div class="tab-panel" id="tab-rc">
    <div class="section">
      <h2>Remote Control Sessions</h2>
      <div id="rc-list">
        <p class="rc-empty">No active remote control sessions</p>
      </div>
    </div>
  </div>
```

**Step 4: Add QR code library (inline) and RC message handler**

In the `<script>` section, add a QR code generation library. Since the help window is a standalone HTML page without access to npm modules, we need to inline a minimal QR generator. Add before the closing `</script>` tag:

```javascript
  // RC sessions handler
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'rc-sessions') {
      var list = document.getElementById('rc-list');
      var rcDot = document.getElementById('rc-dot');
      var sessions = e.data.sessions || [];

      if (sessions.length === 0) {
        list.innerHTML = '<p class="rc-empty">No active remote control sessions</p>';
        if (rcDot) rcDot.classList.remove('visible');
        return;
      }

      if (rcDot) rcDot.classList.add('visible');

      list.innerHTML = '';
      sessions.forEach(function(rc) {
        var card = document.createElement('div');
        card.className = 'rc-card';

        var ago = Math.round((Date.now() - rc.startedAt) / 60000);
        var timeStr = ago < 1 ? 'just now' : ago + 'm ago';

        var shortPath = rc.cwd.replace(/\\\\/g, '/');
        var parts = shortPath.split('/');
        if (parts.length > 3) shortPath = '.../' + parts.slice(-2).join('/');

        card.innerHTML =
          '<div class="rc-card-header">' +
            '<svg class="rc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
              '<path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/>' +
              '<path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.4"/>' +
              '<path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.4"/>' +
              '<path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/>' +
              '<circle cx="12" cy="12" r="2"/>' +
            '</svg>' +
            '<span class="rc-slug">' + (rc.slug || 'Unknown session') + '</span>' +
            '<span class="rc-time">' + timeStr + '</span>' +
          '</div>' +
          '<div class="rc-path" title="' + rc.cwd + '">' + shortPath + '</div>' +
          '<div class="rc-url-row">' +
            '<span class="rc-url" title="Click to copy">' + rc.url + '</span>' +
            '<button class="rc-copy-btn" data-url="' + rc.url + '">Copy</button>' +
          '</div>' +
          '<div class="rc-qr" id="qr-' + rc.sessionId + '"></div>';

        list.appendChild(card);

        // Generate QR code
        if (typeof QRCode !== 'undefined') {
          var qrContainer = document.getElementById('qr-' + rc.sessionId);
          var canvas = document.createElement('canvas');
          QRCode.toCanvas(canvas, rc.url, {
            width: 140,
            margin: 2,
            color: { dark: '#06b6d4', light: '#1a1a2e' },
          });
          qrContainer.appendChild(canvas);
        }

        // Copy button
        card.querySelector('.rc-copy-btn').addEventListener('click', function() {
          var url = this.dataset.url;
          navigator.clipboard.writeText(url).then(function() {
            var btn = card.querySelector('.rc-copy-btn');
            btn.textContent = 'Copied!';
            setTimeout(function() { btn.textContent = 'Copy'; }, 2000);
          });
        });

        // Click URL to copy
        card.querySelector('.rc-url').addEventListener('click', function() {
          navigator.clipboard.writeText(rc.url);
          var btn = card.querySelector('.rc-copy-btn');
          btn.textContent = 'Copied!';
          setTimeout(function() { btn.textContent = 'Copy'; }, 2000);
        });
      });
    }
  });
```

**Step 5: Load the qrcode library in the help window**

Since the help window is a data URL, we can't load npm modules directly. Instead, we'll generate QR code data URLs in the **main process** and send them along with the RC session data. Update the approach:

In `src/main/ipc-handlers.ts`, add the import at the top (after line 18):
```typescript
import QRCode from 'qrcode';
```

In the `openHelpWindow()` function's `did-finish-load` handler (around line 937), add:
```typescript
    // Send initial RC sessions
    const { getActiveRcSessions } = require('./services/conversation-tailer');
    const rcSessions = getActiveRcSessions();
    if (rcSessions.length > 0) {
      Promise.all(rcSessions.map(async (rc: any) => ({
        ...rc,
        qrDataUrl: await QRCode.toDataURL(rc.url, {
          width: 140,
          margin: 2,
          color: { dark: '#06b6d4', light: '#1a1a2e' },
        }),
      }))).then(sessionsWithQr => {
        if (!helpWindow || helpWindow.isDestroyed()) return;
        helpWindow.webContents.executeJavaScript(
          `window.postMessage(${JSON.stringify({ type: 'rc-sessions', sessions: sessionsWithQr })}, '*')`
        );
      });
    }
```

Also add a function to send RC updates to the help window. Add after the `sendUpdateToHelp` function (around line 882):
```typescript
async function sendRcToHelp(sessions: RcSession[]): Promise<void> {
  if (!helpWindow || helpWindow.isDestroyed()) return;
  const sessionsWithQr = await Promise.all(sessions.map(async (rc) => ({
    ...rc,
    qrDataUrl: await QRCode.toDataURL(rc.url, {
      width: 140,
      margin: 2,
      color: { dark: '#06b6d4', light: '#1a1a2e' },
    }),
  })));
  helpWindow.webContents.executeJavaScript(
    `window.postMessage(${JSON.stringify({ type: 'rc-sessions', sessions: sessionsWithQr })}, '*')`
  );
}
```

Add the `RcSession` import to the imports from types (line 14).

Wire up the RC callback from `startConversationTailer` in `index.ts` to also push to help window. In `src/main/ipc-handlers.ts`, export a function:
```typescript
export function pushRcToHelp(sessions: RcSession[]): void {
  sendRcToHelp(sessions);
}
```

In `src/main/index.ts`, import and call it:
```typescript
import { pushRcToHelp } from './ipc-handlers';
```

Update the RC callback in `startConversationTailer`:
```typescript
    (rcSessions) => {
      win.webContents.send('claude:rc-sessions', rcSessions);
      pushRcToHelp(rcSessions);
    },
```

**Step 6: Update the RC message handler in HELP_HTML to use data URLs instead of canvas**

Replace the QR code rendering section in the RC handler to use `<img>` with data URLs:

```javascript
        // QR code from data URL
        if (rc.qrDataUrl) {
          var qrContainer = document.getElementById('qr-' + rc.sessionId);
          var img = document.createElement('img');
          img.src = rc.qrDataUrl;
          img.width = 140;
          img.height = 140;
          img.style.borderRadius = '6px';
          qrContainer.appendChild(img);
        }
```

Remove the `typeof QRCode !== 'undefined'` check and canvas approach from Step 4.

**Step 7: Verify**

Run: `cd C:/repos/claude-widget && npx tsc --noEmit`
Expected: No errors

**Step 8: Commit**

```bash
git add src/main/ipc-handlers.ts src/main/index.ts
git commit -m "feat: add Remote Control tab to help window with QR codes"
```

---

### Task 8: Test end-to-end

**Step 1: Build and run**

Run: `cd C:/repos/claude-widget && npm run build && npm start`

**Step 2: Manual testing checklist**

- [ ] Start a Claude Code session and run `/rc` in it
- [ ] Verify the RcBadge appears before the PlanBadge in the status bar
- [ ] Verify the badge pulses for ~5 seconds then settles
- [ ] Click the badge — help window should open
- [ ] RC tab should show the active session with slug, path, URL, and QR code
- [ ] Click "Copy" — URL should be on clipboard
- [ ] Scan the QR code with phone — should open the session URL
- [ ] End the `/rc` session — badge should disappear, RC tab should show empty state
- [ ] Verify the conversation preview still works normally

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: remote control session detection with badge and QR codes"
```
