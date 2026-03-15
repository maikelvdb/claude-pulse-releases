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

// RC session tracking
// Map from JSONL file path -> { sessionId, session, mtimeMs, byteOffset }
interface TrackedRcFile {
  sessionId: string;
  session: RcSession | null;
  mtimeMs: number;
  byteOffset: number;
}

const rcFileMap = new Map<string, TrackedRcFile>();
let activeRcSessions: RcSession[] = [];

const RC_ACTIVE_THRESHOLD = 30000; // 30s

export function startConversationTailer(
  onMessage: (msg: string) => void,
  onRc?: (sessions: RcSession[]) => void
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
  rcFileMap.clear();
  activeRcSessions = [];
}

export function getLastMessage(): string {
  return lastMessage;
}

export function getActiveRcSessions(): RcSession[] {
  return activeRcSessions;
}

function poll(): void {
  pollConversationPreview();
  pollRcSessions();
}

function pollConversationPreview(): void {
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
    const activeFiles = new Set<string>();

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

          // Only consider files modified within the active threshold
          if (now - stat.mtimeMs > RC_ACTIVE_THRESHOLD) continue;

          activeFiles.add(filePath);

          const tracked = rcFileMap.get(filePath);
          const byteOffset = tracked?.byteOffset ?? 0;

          // No new data in this file
          if (stat.size <= byteOffset) continue;

          // Read only new bytes
          const fd = fs.openSync(filePath, 'r');
          const newBytes = Buffer.alloc(stat.size - byteOffset);
          fs.readSync(fd, newBytes, 0, newBytes.length, byteOffset);
          fs.closeSync(fd);

          const newContent = newBytes.toString('utf-8');
          const lines = newContent.split('\n');

          // Scan for bridge_status entries (use the last one found per file)
          let latestBridgeStatus: RcSession | null = null;
          let latestSessionId: string | null = null;

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const entry = JSON.parse(line);
              if (entry.type === 'system' && entry.subtype === 'bridge_status') {
                latestSessionId = entry.sessionId;
                latestBridgeStatus = {
                  sessionId: entry.sessionId,
                  url: entry.url,
                  slug: entry.slug,
                  cwd: entry.cwd,
                  startedAt: new Date(entry.timestamp).getTime(),
                };
              }
            } catch {
              continue;
            }
          }

          if (latestBridgeStatus && latestSessionId) {
            rcFileMap.set(filePath, {
              sessionId: latestSessionId,
              session: latestBridgeStatus,
              mtimeMs: stat.mtimeMs,
              byteOffset: stat.size,
            });
          } else if (tracked) {
            // Update byte offset even if no new bridge_status found
            rcFileMap.set(filePath, {
              ...tracked,
              mtimeMs: stat.mtimeMs,
              byteOffset: stat.size,
            });
          } else {
            // No bridge_status ever found in this file, just track the offset
            rcFileMap.set(filePath, {
              sessionId: '',
              session: null,
              mtimeMs: stat.mtimeMs,
              byteOffset: stat.size,
            });
          }
        } catch {
          continue;
        }
      }
    }

    // Remove entries for files that are no longer active
    let changed = false;
    for (const [filePath] of rcFileMap) {
      if (!activeFiles.has(filePath)) {
        rcFileMap.delete(filePath);
        changed = true;
      }
    }

    // Build the active sessions list (deduplicate by sessionId, keep latest)
    const sessionMap = new Map<string, RcSession>();
    for (const [, tracked] of rcFileMap) {
      if (!tracked.sessionId || !tracked.session) continue;
      const existing = sessionMap.get(tracked.sessionId);
      if (!existing || tracked.session.startedAt > existing.startedAt) {
        sessionMap.set(tracked.sessionId, tracked.session);
      }
    }

    const newSessions = Array.from(sessionMap.values())
      .sort((a, b) => b.startedAt - a.startedAt);

    // Check if sessions changed
    const newJson = JSON.stringify(newSessions);
    const oldJson = JSON.stringify(activeRcSessions);

    if (newJson !== oldJson || changed) {
      activeRcSessions = newSessions;
      onRcCallback?.(activeRcSessions);
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
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links -> text
    .replace(/[#*_~>]/g, '')                 // strip markdown chars
    .replace(/\n+/g, ' ')                   // collapse newlines
    .trim();

  const truncated = clean.length > 200 ? clean.slice(0, 200) + '...' : clean;

  if (truncated !== lastMessage) {
    lastMessage = truncated;
    onMessageCallback?.(truncated);
  }
}
