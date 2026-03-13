import fs from 'fs';
import { ACTIVITY_FILE } from '../../shared/constants';
import { ActivitySnapshot, DailyRollup, DailyRollups } from '../../shared/types';

let snapshots: ActivitySnapshot[] = [];
let dailyRollups: DailyRollups = {};
let lastWriteTime = 0;
const WRITE_DEBOUNCE = 60000; // Write to disk at most once per minute
const MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours
const MAX_ROLLUP_DAYS = 365;

export function loadActivityHistory(): void {
  try {
    if (fs.existsSync(ACTIVITY_FILE)) {
      const raw = JSON.parse(fs.readFileSync(ACTIVITY_FILE, 'utf-8'));
      const snapshotData = Array.isArray(raw) ? raw : (raw.snapshots || []);
      snapshots = snapshotData.filter(
        (s: unknown): s is ActivitySnapshot =>
          typeof s === 'object' && s !== null &&
          typeof (s as ActivitySnapshot).t === 'number' &&
          typeof (s as ActivitySnapshot).input === 'number' &&
          typeof (s as ActivitySnapshot).output === 'number' &&
          typeof (s as ActivitySnapshot).active === 'boolean'
      );
      prune();
      if (!Array.isArray(raw) && raw.dailyRollups) {
        dailyRollups = raw.dailyRollups;
      }
    }
  } catch {
    snapshots = [];
    dailyRollups = {};
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

  // Update today's daily rollup (tokens are cumulative, store max seen)
  const today = new Date().toISOString().slice(0, 10);
  if (!dailyRollups[today]) {
    dailyRollups[today] = { input: 0, output: 0 };
  }
  if (input > dailyRollups[today].input) dailyRollups[today].input = input;
  if (output > dailyRollups[today].output) dailyRollups[today].output = output;

  // Prune rollups older than MAX_ROLLUP_DAYS
  const keys = Object.keys(dailyRollups).sort();
  if (keys.length > MAX_ROLLUP_DAYS) {
    const toRemove = keys.slice(0, keys.length - MAX_ROLLUP_DAYS);
    for (const k of toRemove) {
      delete dailyRollups[k];
    }
  }

  // Debounced write to disk
  if (Date.now() - lastWriteTime > WRITE_DEBOUNCE) {
    persistToDisk();
  }
}

function persistToDisk(): void {
  lastWriteTime = Date.now();
  fs.writeFile(ACTIVITY_FILE, JSON.stringify({ snapshots, dailyRollups }), () => {});
}

export function getActivityHistory(): ActivitySnapshot[] {
  return snapshots;
}

export function getDailyRollups(): DailyRollups {
  return dailyRollups;
}

export function flushActivityHistory(): void {
  persistToDisk();
}
