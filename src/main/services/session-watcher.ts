import fs from 'fs';
import path from 'path';
import { IDE_LOCK_DIR } from '../../shared/constants';
import { SessionInfo } from '../../shared/types';

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
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
  };

  try {
    if (!fs.existsSync(IDE_LOCK_DIR)) return noSession;

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
        };
      }
    }
  } catch {
    // Lock dir missing or unreadable — no active session
  }

  return noSession;
}
