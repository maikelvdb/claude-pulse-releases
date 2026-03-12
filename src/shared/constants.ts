import path from 'path';
import os from 'os';

export const CLAUDE_DIR = path.join(os.homedir(), '.claude');
export const IDE_LOCK_DIR = path.join(CLAUDE_DIR, 'ide');
export const STATS_CACHE_ACTIVE_THRESHOLD = 30000; // 30s — if stats-cache.json modified within this, CLI is active
export const ACTIVITY_FILE = path.join(CLAUDE_DIR, 'claude-pulse-activity.json');
export const STATS_CACHE_FILE = path.join(CLAUDE_DIR, 'stats-cache.json');
export const CREDENTIALS_FILE = path.join(CLAUDE_DIR, '.credentials.json');
export const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');

export const POLL_INTERVAL_SESSION = 2000;   // 2s
export const POLL_INTERVAL_STATS = 10000;    // 10s
export const POLL_INTERVAL_JSONL = 30000;    // 30s

export const AUTO_HIDE_DELAY = 3000;         // 3s
export const ANIMATION_DURATION = 300;       // 300ms

export const PULSE_CONFIG_FILE = path.join(CLAUDE_DIR, 'claude-pulse-config.json');

// Horizontal dimensions (top/bottom)
export const WINDOW_WIDTH_H = 480;
export const WINDOW_HEIGHT_H = 60;

// Vertical dimensions (left/right)
export const WINDOW_WIDTH_V = 80;
export const WINDOW_HEIGHT_V = 320;

// Expanded dimensions (graph visible)
export const WINDOW_HEIGHT_H_EXPANDED = 200;
export const WINDOW_WIDTH_V_EXPANDED = 260;
