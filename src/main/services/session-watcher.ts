import fs from 'fs';
import path from 'path';
import { IDE_LOCK_DIR, PROJECTS_DIR } from '../../shared/constants';
import { SessionInfo } from '../../shared/types';

const ACTIVE_THRESHOLD = 30000; // 30s — JSONL modified within this is considered active

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Count active sessions by scanning JSONL files across all projects.
 * A JSONL file modified within the last 30s = an active session.
 * Returns the list of active file paths (to deduplicate with IDE locks).
 */
function getActiveJsonlSessions(): { count: number; latestMtime: number } {
  let count = 0;
  let latestMtime = 0;

  try {
    if (!fs.existsSync(PROJECTS_DIR)) return { count: 0, latestMtime: 0 };

    const now = Date.now();
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
        try {
          const stat = fs.statSync(path.join(dirPath, file));
          if (now - stat.mtimeMs < ACTIVE_THRESHOLD) {
            count++;
            if (stat.mtimeMs > latestMtime) latestMtime = stat.mtimeMs;
          }
        } catch {
          continue;
        }
      }
    }
  } catch {
    // Projects dir missing or unreadable
  }

  return { count, latestMtime };
}

export function getActiveSession(): SessionInfo {
  const noSession: SessionInfo = {
    isActive: false,
    pid: null,
    workspace: null,
    ideName: null,
    source: null,
    sessionCount: 0,
  };

  let ideSessions = 0;
  let firstIde: SessionInfo | null = null;

  // Check IDE lock files
  try {
    if (fs.existsSync(IDE_LOCK_DIR)) {
      const lockFiles = fs.readdirSync(IDE_LOCK_DIR)
        .filter(f => f.endsWith('.lock'));

      for (const file of lockFiles) {
        const filePath = path.join(IDE_LOCK_DIR, file);
        try {
          const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          const pid = content.pid ?? parseInt(file.replace('.lock', ''), 10);

          if (isPidAlive(pid)) {
            ideSessions++;
            if (!firstIde) {
              firstIde = {
                isActive: true,
                pid,
                workspace: content.workspaceFolders?.[0] ?? null,
                ideName: content.ideName ?? null,
                source: 'ide',
                sessionCount: 0,
              };
            }
          }
        } catch {
          continue;
        }
      }
    }
  } catch {
    // Lock dir missing or unreadable
  }

  // Count active JSONL sessions (covers both CLI and IDE)
  const jsonl = getActiveJsonlSessions();

  // JSONL count is the total active sessions (CLI + IDE).
  // Use whichever is higher: JSONL-based count or IDE lock count
  // (IDE locks may exist without active JSONL writing, or vice versa)
  const sessionCount = Math.max(jsonl.count, ideSessions);
  const isActive = sessionCount > 0;

  if (firstIde) {
    firstIde.sessionCount = sessionCount;
    return firstIde;
  }

  if (isActive) {
    return {
      isActive: true,
      pid: null,
      workspace: null,
      ideName: null,
      source: 'cli',
      sessionCount,
    };
  }

  return noSession;
}
