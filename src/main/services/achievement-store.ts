import fs from 'fs';
import path from 'path';
import { CLAUDE_DIR } from '../../shared/constants';
import { Achievement } from '../../shared/types';

const ACHIEVEMENTS_FILE = path.join(CLAUDE_DIR, 'claude-pulse-achievements.json');

const ACHIEVEMENT_DEFS: Omit<Achievement, 'unlockedAt'>[] = [
  { id: 'tokens_500k', name: 'Getting Started', description: 'Use 500K tokens in a day' },
  { id: 'tokens_1m', name: 'Heavy Hitter', description: 'Use 1M tokens in a day' },
  { id: 'tokens_5m', name: 'Token Machine', description: 'Use 5M tokens in a day' },
  { id: 'tokens_10m', name: 'Unstoppable', description: 'Use 10M tokens in a day' },
];

// Map milestone thresholds to achievement IDs
export const MILESTONE_MAP: Record<number, string> = {
  500_000: 'tokens_500k',
  1_000_000: 'tokens_1m',
  5_000_000: 'tokens_5m',
  10_000_000: 'tokens_10m',
};

let unlockedIds: Record<string, number> = {};

export function loadAchievements(): void {
  try {
    if (fs.existsSync(ACHIEVEMENTS_FILE)) {
      unlockedIds = JSON.parse(fs.readFileSync(ACHIEVEMENTS_FILE, 'utf-8'));
    }
  } catch {
    unlockedIds = {};
  }
}

function save(): void {
  try {
    fs.writeFileSync(ACHIEVEMENTS_FILE, JSON.stringify(unlockedIds, null, 2), 'utf-8');
  } catch {}
}

export function isUnlocked(id: string): boolean {
  return id in unlockedIds;
}

export function unlock(id: string): boolean {
  if (unlockedIds[id]) return false; // already unlocked
  unlockedIds[id] = Date.now();
  save();
  return true; // newly unlocked
}

export function getAchievements(): Achievement[] {
  return ACHIEVEMENT_DEFS.map((def) => ({
    ...def,
    unlockedAt: unlockedIds[def.id] ?? null,
  }));
}
