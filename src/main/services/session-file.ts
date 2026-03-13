import fs from 'fs';
import path from 'path';
import { PROJECTS_DIR } from '../../shared/constants';

/**
 * Scan all project directories under PROJECTS_DIR and return
 * the path to the most recently modified JSONL session file,
 * or null if none is found.
 */
export function findLatestJsonlFile(): string | null {
  try {
    if (!fs.existsSync(PROJECTS_DIR)) return null;

    let latestFile: string | null = null;
    let latestMtime = 0;

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
          if (stat.mtimeMs > latestMtime) {
            latestMtime = stat.mtimeMs;
            latestFile = filePath;
          }
        } catch {
          continue;
        }
      }
    }

    return latestFile;
  } catch {
    return null;
  }
}

/**
 * Find all JSONL session files modified within the last 24 hours.
 */
export function findTodayJsonlFiles(): string[] {
  try {
    if (!fs.existsSync(PROJECTS_DIR)) return [];

    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const results: string[] = [];

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
          if (stat.mtimeMs > cutoff) {
            results.push(filePath);
          }
        } catch {
          continue;
        }
      }
    }

    return results;
  } catch {
    return [];
  }
}
