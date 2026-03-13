import fs from 'fs';
import { findLatestJsonlFile } from './session-file';

let lastFile: string | null = null;
let lastSize = 0;
let lastMessage = '';
let lastRaw = '';
let onMessageCallback: ((msg: string) => void) | null = null;
let pollId: ReturnType<typeof setInterval> | null = null;

export function startConversationTailer(onMessage: (msg: string) => void): void {
  onMessageCallback = onMessage;
  pollId = setInterval(poll, 2000);
  poll(); // immediate first check
}

export function stopConversationTailer(): void {
  if (pollId !== null) {
    clearInterval(pollId);
    pollId = null;
  }
  onMessageCallback = null;
}

export function getLastMessage(): string {
  return lastMessage;
}

function poll(): void {
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
