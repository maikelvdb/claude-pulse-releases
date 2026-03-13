import fs from 'fs';
import path from 'path';
import { PROJECTS_DIR } from '../../shared/constants';

export interface ProjectUsage {
  projectDir: string;      // human-readable project directory name
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  lastActive: number;       // timestamp ms
}

/**
 * Scan all project directories and compute token usage per project.
 * Returns sorted by total tokens descending.
 */
export function getProjectBreakdown(): ProjectUsage[] {
  try {
    if (!fs.existsSync(PROJECTS_DIR)) return [];

    const projects: ProjectUsage[] = [];
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

      let inputTokens = 0;
      let outputTokens = 0;
      let cacheReadTokens = 0;
      let lastActive = 0;

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        try {
          const stat = fs.statSync(filePath);
          // Only include files modified within last 24h
          if (Date.now() - stat.mtimeMs > 24 * 60 * 60 * 1000) continue;

          if (stat.mtimeMs > lastActive) lastActive = stat.mtimeMs;

          const content = fs.readFileSync(filePath, 'utf-8');
          for (const line of content.trim().split('\n')) {
            if (!line) continue;
            try {
              const entry = JSON.parse(line);
              const usage = entry.message?.usage ?? entry.usage;
              if (!usage) continue;
              inputTokens += usage.input_tokens ?? 0;
              outputTokens += usage.output_tokens ?? 0;
              cacheReadTokens += usage.cache_read_input_tokens ?? 0;
            } catch {
              continue;
            }
          }
        } catch {
          continue;
        }
      }

      if (inputTokens + outputTokens > 0) {
        // Decode the project dir name (it's typically a hash of the path)
        // Try to extract a friendlier name from the JSONL content
        const friendlyName = decodeProjectName(dir.name, dirPath, files);
        projects.push({
          projectDir: friendlyName,
          inputTokens,
          outputTokens,
          cacheReadTokens,
          lastActive,
        });
      }
    }

    // Sort by total tokens descending
    projects.sort((a, b) => (b.inputTokens + b.outputTokens) - (a.inputTokens + a.outputTokens));
    return projects;
  } catch {
    return [];
  }
}

function decodeProjectName(dirName: string, dirPath: string, files: string[]): string {
  // The dir name in .claude/projects is an encoded path like "C--repos-myproject"
  // Decode it back to something human-readable
  const decoded = dirName
    .replace(/^[A-Z]-/, (m) => m[0] + ':/')  // "C-" -> "C:/"
    .replace(/-/g, '/');                       // remaining dashes -> slashes

  // Return just the last meaningful segment
  const segments = decoded.split('/').filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : dirName;
}
