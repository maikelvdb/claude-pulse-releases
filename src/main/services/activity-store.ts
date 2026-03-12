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
