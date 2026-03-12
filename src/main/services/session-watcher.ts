import fs from 'fs';
import path from 'path';
import { IDE_LOCK_DIR, STATS_CACHE_FILE, STATS_CACHE_ACTIVE_THRESHOLD } from '../../shared/constants';
import { SessionInfo } from '../../shared/types';

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isStatsCacheRecent(): boolean {
  try {
    if (!fs.existsSync(STATS_CACHE_FILE)) return false;
    const stat = fs.statSync(STATS_CACHE_FILE);
    return Date.now() - stat.mtimeMs < STATS_CACHE_ACTIVE_THRESHOLD;
  } catch {
    return false;
  }
}

export function getActiveSession(): SessionInfo {
  const noSession: SessionInfo = {
    isActive: false,
    pid: null,
    workspace: null,
    ideName: null,
    source: null,
  };

  try {
    // Check IDE lock files first (more info available)
    if (fs.existsSync(IDE_LOCK_DIR)) {
      const lockFiles = fs.readdirSync(IDE_LOCK_DIR)
        .filter(f => f.endsWith('.lock'));

      for (const file of lockFiles) {
        const filePath = path.join(IDE_LOCK_DIR, file);
        const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const pid = content.pid ?? parseInt(file.replace('.lock', ''), 10);

        if (isPidAlive(pid)) {
          return {
            isActive: true,
            pid,
            workspace: content.workspaceFolders?.[0] ?? null,
            ideName: content.ideName ?? null,
            source: 'ide',
          };
        }
      }
    }
  } catch {
    // Lock dir missing or unreadable
  }

  // Fallback: check if stats-cache.json was recently modified (CLI activity)
  if (isStatsCacheRecent()) {
    return {
      isActive: true,
      pid: null,
      workspace: null,
      ideName: null,
      source: 'cli',
    };
  }

  return noSession;
}
