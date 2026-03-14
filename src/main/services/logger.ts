export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  source: string;
  message: string;
}

type LogListener = (entry: LogEntry) => void;

const MAX_BUFFER = 500;
const buffer: LogEntry[] = [];
const listeners: LogListener[] = [];

export function log(source: string, level: LogLevel, message: string): void {
  const entry: LogEntry = { timestamp: Date.now(), level, source, message };
  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) buffer.shift();
  for (const fn of listeners) {
    try { fn(entry); } catch {}
  }
}

export function getLogBuffer(): LogEntry[] {
  return [...buffer];
}

export function clearLogBuffer(): void {
  buffer.length = 0;
}

export function onLogEntry(fn: LogListener): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}
